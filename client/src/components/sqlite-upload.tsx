import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Upload, FileCheck, AlertTriangle, CheckCircle2, Trash2, Database } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "react-i18next";

interface SQLiteUploadProps {
  onFileProcessed: (fileData: ArrayBuffer, fileName: string) => void;
  onFileRemoved: () => void;
  currentFile?: { name: string; size: number } | null;
}

interface UploadChunk {
  data: ArrayBuffer;
  index: number;
  total: number;
}

interface FileValidationResult {
  isValid: boolean;
  isCorrupted: boolean;
  fileSize: number;
  fileName: string;
  errors: string[];
  metadata?: {
    version: string;
    pageSize: number;
    encoding: string;
    tables?: string[];
  };
}

// SQLite file signature validation
const SQLITE_SIGNATURES = [
  new Uint8Array([0x53, 0x51, 0x4C, 0x69, 0x74, 0x65, 0x20, 0x66, 0x6F, 0x72, 0x6D, 0x61, 0x74, 0x20, 0x33, 0x00]), // "SQLite format 3\0"
];

export default function SQLiteUpload({ onFileProcessed, onFileRemoved, currentFile }: SQLiteUploadProps) {
  const { t } = useTranslation();
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [validationResult, setValidationResult] = useState<FileValidationResult | null>(null);
  const [chunks, setChunks] = useState<Map<number, UploadChunk>>(new Map());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const workerRef = useRef<Worker | null>(null);

  // Initialize Web Worker for file processing
  useEffect(() => {
    if ('Worker' in window) {
      const workerCode = `
        self.onmessage = function(e) {
          const { type, data } = e.data;
          
          if (type === 'validateSQLite') {
            try {
              const buffer = new Uint8Array(data.buffer);
              
              // Check SQLite signature
              const signature = buffer.slice(0, 16);
              const sqliteSignature = new Uint8Array([0x53, 0x51, 0x4C, 0x69, 0x74, 0x65, 0x20, 0x66, 0x6F, 0x72, 0x6D, 0x61, 0x74, 0x20, 0x33, 0x00]);
              
              let isValid = true;
              let isCorrupted = false;
              let errors = [];
              
              // Validate signature
              for (let i = 0; i < sqliteSignature.length; i++) {
                if (signature[i] !== sqliteSignature[i]) {
                  isValid = false;
                  errors.push('Invalid SQLite file signature');
                  break;
                }
              }
              
              // Basic corruption checks
              if (isValid) {
                // Check page size (bytes 16-17)
                const pageSize = (buffer[16] << 8) | buffer[17];
                if (pageSize === 0 || (pageSize !== 1 && (pageSize & (pageSize - 1)) !== 0) || pageSize > 65536) {
                  isCorrupted = true;
                  errors.push('Invalid page size - file may be corrupted');
                }
                
                // Check file format version (byte 18)
                const formatVersion = buffer[18];
                if (formatVersion !== 1 && formatVersion !== 2) {
                  errors.push('Unsupported file format version');
                }
              }
              
              self.postMessage({
                type: 'validationResult',
                result: {
                  isValid,
                  isCorrupted,
                  errors,
                  fileSize: buffer.length,
                  metadata: isValid ? {
                    version: buffer[18].toString(),
                    pageSize: (buffer[16] << 8) | buffer[17],
                    encoding: buffer[56] === 1 ? 'UTF-8' : buffer[56] === 2 ? 'UTF-16le' : 'UTF-16be'
                  } : undefined
                }
              });
            } catch (error) {
              self.postMessage({
                type: 'validationResult',
                result: {
                  isValid: false,
                  isCorrupted: true,
                  errors: ['Failed to process file: ' + error.message],
                  fileSize: 0
                }
              });
            }
          }
        };
      `;
      
      const blob = new Blob([workerCode], { type: 'application/javascript' });
      workerRef.current = new Worker(URL.createObjectURL(blob));
      
      workerRef.current.onmessage = (e) => {
        const { type, result } = e.data;
        if (type === 'validationResult') {
          setValidationResult({ ...result, fileName: currentFile?.name || 'unknown' });
          setIsProcessing(false);
        }
      };
    }

    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, [currentFile?.name]);

  // Chunk size for multipart upload (1MB chunks)
  const CHUNK_SIZE = 1024 * 1024;

  const validateFileInLocalStorage = async (file: File): Promise<boolean> => {
    try {
      const existingFiles = JSON.parse(localStorage.getItem('sqlite_files') || '[]');
      const fileHash = await generateFileHash(file);
      
      // Check if file already exists
      const existingFile = existingFiles.find((f: any) => f.hash === fileHash);
      if (existingFile) {
        setUploadError('File already exists in storage');
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error validating file in localStorage:', error);
      return true; // Continue if localStorage check fails
    }
  };

  const generateFileHash = async (file: File): Promise<string> => {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  };

  const processFileInChunks = async (file: File): Promise<ArrayBuffer> => {
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const processedChunks = new Map<number, ArrayBuffer>();
    
    // Process chunks in parallel
    const chunkPromises = [];
    
    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunk = file.slice(start, end);
      
      chunkPromises.push(
        chunk.arrayBuffer().then(buffer => {
          processedChunks.set(i, buffer);
          setUploadProgress(Math.round(((processedChunks.size / totalChunks) * 100)));
          return { index: i, buffer };
        })
      );
    }
    
    await Promise.all(chunkPromises);
    
    // Reassemble chunks
    const totalSize = Array.from(processedChunks.values()).reduce((sum, chunk) => sum + chunk.byteLength, 0);
    const assembledBuffer = new ArrayBuffer(totalSize);
    const assembledView = new Uint8Array(assembledBuffer);
    
    let offset = 0;
    for (let i = 0; i < totalChunks; i++) {
      const chunk = processedChunks.get(i);
      if (chunk) {
        assembledView.set(new Uint8Array(chunk), offset);
        offset += chunk.byteLength;
      } else {
        throw new Error(`Missing chunk ${i}`);
      }
    }
    
    return assembledBuffer;
  };

  const saveFileToLocalStorage = async (file: File, buffer: ArrayBuffer, hash: string) => {
    try {
      const existingFiles = JSON.parse(localStorage.getItem('sqlite_files') || '[]');
      
      // Convert ArrayBuffer to base64 for storage
      const base64Data = btoa(String.fromCharCode(...new Uint8Array(buffer)));
      
      const fileEntry = {
        name: file.name,
        size: file.size,
        hash,
        data: base64Data,
        uploadedAt: new Date().toISOString(),
        lastModified: file.lastModified
      };
      
      existingFiles.push(fileEntry);
      localStorage.setItem('sqlite_files', JSON.stringify(existingFiles));
      
      console.log('SQLite file saved to localStorage:', { name: file.name, size: file.size });
    } catch (error) {
      console.error('Error saving file to localStorage:', error);
      // Continue without localStorage if it fails
    }
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadError(null);
    setValidationResult(null);
    setUploadProgress(0);
    setIsProcessing(true);

    try {
      // Check file extension
      if (!file.name.toLowerCase().match(/\.(db|sqlite|sqlite3|db3)$/)) {
        throw new Error('Please select a valid SQLite database file (.db, .sqlite, .sqlite3, .db3)');
      }

      // Check file size (max 100MB)
      if (file.size > 100 * 1024 * 1024) {
        throw new Error('File size must be less than 100MB');
      }

      // Validate against localStorage
      const isValidForStorage = await validateFileInLocalStorage(file);
      if (!isValidForStorage) {
        setIsProcessing(false);
        return;
      }

      // Process file in chunks
      const assembledBuffer = await processFileInChunks(file);
      
      // Validate file using Web Worker
      if (workerRef.current) {
        workerRef.current.postMessage({
          type: 'validateSQLite',
          data: { buffer: assembledBuffer }
        });
      } else {
        // Fallback validation on main thread
        const isValid = validateSQLiteFile(assembledBuffer);
        setValidationResult({
          isValid,
          isCorrupted: !isValid,
          fileSize: file.size,
          fileName: file.name,
          errors: isValid ? [] : ['File validation failed']
        });
        setIsProcessing(false);
      }

      // Save to localStorage
      const fileHash = await generateFileHash(file);
      await saveFileToLocalStorage(file, assembledBuffer, fileHash);

      // Pass to parent component
      onFileProcessed(assembledBuffer, file.name);
      
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Upload failed');
      setIsProcessing(false);
    }
  };

  const validateSQLiteFile = (buffer: ArrayBuffer): boolean => {
    const view = new Uint8Array(buffer);
    
    // Check if buffer is large enough for SQLite header
    if (view.length < 16) return false;
    
    // Check SQLite signature
    const signature = view.slice(0, 16);
    const expectedSignature = SQLITE_SIGNATURES[0];
    
    for (let i = 0; i < expectedSignature.length; i++) {
      if (signature[i] !== expectedSignature[i]) {
        return false;
      }
    }
    
    return true;
  };

  const handleRemoveFile = () => {
    try {
      // Remove from localStorage
      const existingFiles = JSON.parse(localStorage.getItem('sqlite_files') || '[]');
      const updatedFiles = existingFiles.filter((f: any) => f.name !== currentFile?.name);
      localStorage.setItem('sqlite_files', JSON.stringify(updatedFiles));
    } catch (error) {
      console.error('Error removing file from localStorage:', error);
    }

    setValidationResult(null);
    setUploadProgress(0);
    setUploadError(null);
    setChunks(new Map());
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    
    onFileRemoved();
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Database className="w-5 h-5" />
          <span>{t('sqlite.upload.title')}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!currentFile ? (
          <div className="space-y-4">
            <div
              className="border-2 border-dashed border-gray-300 hover:border-gray-400 rounded-lg p-8 text-center cursor-pointer transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-lg font-medium text-gray-600 mb-2">{t('sqlite.upload.dropText')}</p>
              <p className="text-sm text-gray-500 mb-4">
                {t('sqlite.upload.dropSubtext')}
              </p>
              <p className="text-xs text-gray-400">{t('sqlite.upload.maxFileSize')}</p>
            </div>
            
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              accept=".db,.sqlite,.sqlite3,.db3"
              className="hidden"
            />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center space-x-3">
                <FileCheck className="w-6 h-6 text-blue-600" />
                <div>
                  <p className="font-medium text-gray-900">{currentFile.name}</p>
                  <p className="text-sm text-gray-500">{formatFileSize(currentFile.size)}</p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRemoveFile}
                className="text-red-600 hover:text-red-700"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Upload Progress */}
        {(isProcessing || uploadProgress > 0) && uploadProgress < 100 && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>{t('sqlite.upload.processing')}</span>
              <span>{uploadProgress}%</span>
            </div>
            <Progress value={uploadProgress} className="w-full" />
          </div>
        )}

        {/* Validation Results */}
        {validationResult && (
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              {validationResult.isValid && !validationResult.isCorrupted ? (
                <CheckCircle2 className="w-5 h-5 text-green-600" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-red-600" />
              )}
              <span className="font-medium">
                {validationResult.isValid && !validationResult.isCorrupted
                  ? t('sqlite.upload.validatedSuccessfully')
                  : t('sqlite.upload.validationFailed')}
              </span>
            </div>

            {validationResult.metadata && (
              <div className="grid grid-cols-2 gap-4 p-3 bg-green-50 rounded-lg">
                <div>
                  <Badge variant="outline">{t('sqlite.upload.version')}: {validationResult.metadata.version}</Badge>
                </div>
                <div>
                  <Badge variant="outline">{t('sqlite.upload.pageSize')}: {validationResult.metadata.pageSize}B</Badge>
                </div>
                <div className="col-span-2">
                  <Badge variant="outline">{t('sqlite.upload.encoding')}: {validationResult.metadata.encoding}</Badge>
                </div>
              </div>
            )}

            {validationResult.errors.length > 0 && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <ul className="list-disc list-inside space-y-1">
                    {validationResult.errors.map((error, index) => (
                      <li key={index} className="text-sm">{error}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {/* Error Display */}
        {uploadError && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{uploadError}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}