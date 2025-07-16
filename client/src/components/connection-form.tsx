import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Database, CheckCircle, Save, Trash2, Shield, TestTube, Loader2, XCircle, CheckCircle2, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { apiRequest } from "@/lib/queryClient";
import { verificationRequestSchema, type VerificationRequest, type VerificationState } from "@/lib/types";
import { ProgressIndicator } from "@/components/progress-indicator";
import { useProgress } from "@/hooks/use-progress";
import { StorageDiagnostics } from "@/components/storage-diagnostics";
import { 
  saveConnectionToStorage, 
  loadConnectionFromStorage, 
  clearConnectionFromStorage,
  saveLastVerificationTime,
  runStorageDiagnostics,
  isStorageAvailable,
  type StoredConnection,
  type StorageError 
} from "@/lib/storage";
import SQLiteUpload from "./sqlite-upload";

interface ConnectionFormProps {
  setState: (state: VerificationState) => void;
}

interface TestResult {
  success: boolean;
  message: string;
  details?: {
    connectivity: boolean;
    credentials: boolean;
    databaseExists: boolean;
    tablesFound: number;
    tableNames?: string[];
  };
}

export default function ConnectionForm({ setState }: ConnectionFormProps) {
  const { t } = useTranslation();
  const [hasLoadedFromStorage, setHasLoadedFromStorage] = useState(false);
  const [initialValues, setInitialValues] = useState<VerificationRequest | null>(null);
  const [savePasswords, setSavePasswords] = useState(false);
  const [sourceTestResult, setSourceTestResult] = useState<TestResult | null>(null);
  const [targetTestResult, setTargetTestResult] = useState<TestResult | null>(null);
  const [sourceFileData, setSourceFileData] = useState<{ data: ArrayBuffer; name: string } | null>(null);
  const [targetFileData, setTargetFileData] = useState<{ data: ArrayBuffer; name: string } | null>(null);
  const [showProgress, setShowProgress] = useState(false);
  const [showStorageDiagnostics, setShowStorageDiagnostics] = useState(false);
  
  // Use progress hook
  const { registerSession } = useProgress();

  // Load initial values from localStorage before creating the form
  useEffect(() => {
    // Check storage availability first
    if (!isStorageAvailable()) {
      console.warn('localStorage is not available - connection persistence disabled');
      return;
    }
    
    const sourceResult = loadConnectionFromStorage('SOURCE_CONNECTION');
    const targetResult = loadConnectionFromStorage('TARGET_CONNECTION');
    
    const sourceConnection = sourceResult.success ? sourceResult.data : null;
    const targetConnection = targetResult.success ? targetResult.data : null;
    
    if (sourceResult.error) {
      console.error('Failed to load source connection:', sourceResult.error);
    }
    if (targetResult.error) {
      console.error('Failed to load target connection:', targetResult.error);
    }

    const defaultValues: VerificationRequest = {
      source: {
        type: sourceConnection?.type || undefined,
        host: sourceConnection?.host || "",
        port: sourceConnection?.port || 3306,
        user: sourceConnection?.user || "",
        password: sourceConnection?.password || "",
        database: sourceConnection?.database || "",
      },
      target: {
        type: targetConnection?.type || undefined,
        host: targetConnection?.host || "",
        port: targetConnection?.port || 5432,
        user: targetConnection?.user || "",
        password: targetConnection?.password || "",
        database: targetConnection?.database || "",
      },
    };

    setInitialValues(defaultValues);
    setHasLoadedFromStorage(!!(sourceConnection || targetConnection));
    
    // Check if passwords were previously saved
    const hasStoredPasswords = !!(sourceConnection?.password || targetConnection?.password);
    if (hasStoredPasswords) {
      setSavePasswords(true);
    }
  }, []);

  const form = useForm<VerificationRequest>({
    resolver: zodResolver(verificationRequestSchema),
    defaultValues: initialValues || {
      source: {
        type: undefined,
        host: "",
        port: 3306,
        user: "",
        password: "",
        database: "",
      },
      target: {
        type: undefined,
        host: "",
        port: 5432,
        user: "",
        password: "",
        database: "",
      },
    },
  });

  // Reset form with stored values when they're loaded
  useEffect(() => {
    if (initialValues) {
      form.reset(initialValues);
    }
  }, [initialValues, form]);

  const verifyMutation = useMutation({
    mutationFn: async (data: VerificationRequest) => {
      // Show progress indicator when verification starts
      setShowProgress(true);
      
      // Generate a session ID and register with progress service
      const sessionId = crypto.randomUUID();
      registerSession(sessionId);
      
      const response = await apiRequest("POST", "/api/verify", { ...data, sessionId });
      return response.json();
    },
    onMutate: () => {
      setState({ isLoading: true, result: null, error: null });
    },
    onSuccess: (result) => {
      // Handle both old format and new standardized API response format
      const verificationData = result.data || result;
      setState({ isLoading: false, result: verificationData, error: null });
      // Progress indicator will be hidden by onComplete callback
    },
    onError: (error: Error) => {
      setShowProgress(false);
      setState({ isLoading: false, result: null, error: error.message });
    },
  });

  const testSourceConnection = useMutation({
    mutationFn: async () => {
      const sourceData = form.getValues("source");
      const response = await apiRequest("POST", "/api/test-connection", sourceData);
      return response.json();
    },
    onSuccess: (result) => {
      // Handle both old format and new standardized API response format
      const responseData = result.data || result;
      setSourceTestResult({
        success: true,
        message: responseData.message || t('database.connectionSuccess'),
        details: responseData.details
      });
    },
    onError: (error: Error) => {
      setSourceTestResult({
        success: false,
        message: error.message || t('database.connectionFailed')
      });
    },
  });

  const testTargetConnection = useMutation({
    mutationFn: async () => {
      const targetData = form.getValues("target");
      const response = await apiRequest("POST", "/api/test-connection", targetData);
      return response.json();
    },
    onSuccess: (result) => {
      // Handle both old format and new standardized API response format
      const responseData = result.data || result;
      setTargetTestResult({
        success: true,
        message: responseData.message || t('database.connectionSuccess'),
        details: responseData.details
      });
    },
    onError: (error: Error) => {
      setTargetTestResult({
        success: false,
        message: error.message || t('database.connectionFailed')
      });
    },
  });

  const onSubmit = (data: VerificationRequest) => {
    // Save connection details to localStorage
    const sourceToSave: StoredConnection = {
      type: data.source.type,
      host: data.source.host,
      port: data.source.port,
      user: data.source.user,
      database: data.source.database,
      password: savePasswords ? data.source.password : undefined
    };

    const targetToSave: StoredConnection = {
      type: data.target.type,
      host: data.target.host,
      port: data.target.port,
      user: data.target.user,
      database: data.target.database,
      password: savePasswords ? data.target.password : undefined
    };

    saveConnectionToStorage('SOURCE_CONNECTION', sourceToSave, savePasswords);
    saveConnectionToStorage('TARGET_CONNECTION', targetToSave, savePasswords);
    saveLastVerificationTime();

    verifyMutation.mutate(data);
  };

  const clearStoredConnections = () => {
    const sourceResult = clearConnectionFromStorage('SOURCE_CONNECTION');
    const targetResult = clearConnectionFromStorage('TARGET_CONNECTION');
    
    if (!sourceResult.success || !targetResult.success) {
      console.error('Failed to clear some stored connections:', {
        sourceError: sourceResult.error,
        targetError: targetResult.error
      });
      // Still proceed with form reset
    }
    
    // Reset form to default values
    const defaultValues = {
      source: {
        type: undefined,
        host: "",
        port: 3306,
        user: "",
        password: "",
        database: "",
      },
      target: {
        type: undefined,
        host: "",
        port: 5432,
        user: "",
        password: "",
        database: "",
      },
    };
    
    form.reset(defaultValues);
    setHasLoadedFromStorage(false);
    setInitialValues(defaultValues);
    setSavePasswords(false);
    
    console.log('Storage cleared and form reset to defaults');
  };

  const handleSourceTypeChange = (type: string) => {
    form.setValue("source.type", type as "mysql" | "postgres" | "sqlite");
    if (type === "mysql") {
      form.setValue("source.port", 3306);
    } else if (type === "postgres") {
      form.setValue("source.port", 5432);
    }
    // Clear file data when switching from SQLite
    if (type !== "sqlite") {
      setSourceFileData(null);
      form.setValue("source.fileData", undefined);
    }
  };

  const handleTargetTypeChange = (type: string) => {
    form.setValue("target.type", type as "mysql" | "postgres" | "sqlite");
    if (type === "mysql") {
      form.setValue("target.port", 3306);
    } else if (type === "postgres") {
      form.setValue("target.port", 5432);
    }
    // Clear file data when switching from SQLite
    if (type !== "sqlite") {
      setTargetFileData(null);
      form.setValue("target.fileData", undefined);
    }
  };

  // Watch form values to enable/disable test buttons reactively
  const sourceFormValues = form.watch("source");
  const targetFormValues = form.watch("target");

  // SQLite file handlers - now upload to server and get file ID
  const handleSourceFileProcessed = async (fileData: ArrayBuffer, fileName: string) => {
    try {
      // Clear any existing SQLite connection state first
      handleSourceFileRemoved();
      
      // Clear SQLite connections on server to ensure clean state
      try {
        await fetch("/api/clear-sqlite-connections", {
          method: "POST",
          headers: { "Content-Type": "application/json" }
        });
        console.log("Previous SQLite connections cleared");
      } catch (clearError) {
        console.warn("Failed to clear previous SQLite connections:", clearError);
      }
      
      setSourceFileData({ data: fileData, name: fileName });
      
      // Upload file to server with database role for proper isolation
      const response = await fetch("/api/upload-sqlite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileData: Array.from(new Uint8Array(fileData)),
          fileName: fileName,
          databaseRole: "source", // Specify this is for the source database
          clearPrevious: true // Signal to clear any previous SQLite connections for source
        }),
      });
      
      if (!response.ok) {
        throw new Error("File upload failed");
      }
      
      const result = await response.json();
      
      // Store file ID instead of file data and reset form fields
      form.setValue("source.fileId", result.fileId);
      form.setValue("source.database", fileName);
      form.setValue("source.fileData", undefined); // Clear file data since we have ID
      form.setValue("source.filePath", undefined); // Clear any previous file path
      
      console.log(`New SOURCE SQLite file uploaded: ${fileName} (ID: ${result.fileId}) - Previous source database state cleared`);
    } catch (error) {
      console.error("Failed to upload source SQLite file:", error);
      // Clear the form state on error
      handleSourceFileRemoved();
    }
  };

  const handleSourceFileRemoved = () => {
    setSourceFileData(null);
    // Clear all SQLite-related form fields
    form.setValue("source.fileId", undefined);
    form.setValue("source.fileData", undefined);
    form.setValue("source.filePath", undefined);
    form.setValue("source.database", "");
    
    console.log("Source SQLite file removed and connection cleared");
  };

  const handleTargetFileProcessed = async (fileData: ArrayBuffer, fileName: string) => {
    try {
      // Clear any existing SQLite connection state first
      handleTargetFileRemoved();
      
      // Clear SQLite connections on server to ensure clean state
      try {
        await fetch("/api/clear-sqlite-connections", {
          method: "POST",
          headers: { "Content-Type": "application/json" }
        });
        console.log("Previous SQLite connections cleared");
      } catch (clearError) {
        console.warn("Failed to clear previous SQLite connections:", clearError);
      }
      
      setTargetFileData({ data: fileData, name: fileName });
      
      // Upload file to server with database role for proper isolation
      const response = await fetch("/api/upload-sqlite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileData: Array.from(new Uint8Array(fileData)),
          fileName: fileName,
          databaseRole: "target", // Specify this is for the target database
          clearPrevious: true // Signal to clear any previous SQLite connections for target
        }),
      });
      
      if (!response.ok) {
        throw new Error("File upload failed");
      }
      
      const result = await response.json();
      
      // Store file ID instead of file data and reset form fields
      form.setValue("target.fileId", result.fileId);
      form.setValue("target.database", fileName);
      form.setValue("target.fileData", undefined); // Clear file data since we have ID
      form.setValue("target.filePath", undefined); // Clear any previous file path
      
      console.log(`New TARGET SQLite file uploaded: ${fileName} (ID: ${result.fileId}) - Previous target database state cleared`);
    } catch (error) {
      console.error("Failed to upload target SQLite file:", error);
      // Clear the form state on error
      handleTargetFileRemoved();
    }
  };

  const handleTargetFileRemoved = () => {
    setTargetFileData(null);
    // Clear all SQLite-related form fields
    form.setValue("target.fileId", undefined);
    form.setValue("target.fileData", undefined);
    form.setValue("target.filePath", undefined);
    form.setValue("target.database", "");
    
    console.log("Target SQLite file removed and connection cleared");
  };

  // Helper functions to check if connection data is complete
  const isSourceConnectionComplete = () => {
    if (sourceFormValues?.type === "sqlite") {
      return !!(sourceFormValues?.database && (sourceFormValues?.fileId || sourceFormValues?.filePath));
    }
    return !!(sourceFormValues?.type && sourceFormValues?.host && sourceFormValues?.port && sourceFormValues?.user && sourceFormValues?.password && sourceFormValues?.database);
  };

  const isTargetConnectionComplete = () => {
    if (targetFormValues?.type === "sqlite") {
      return !!(targetFormValues?.database && (targetFormValues?.fileId || targetFormValues?.filePath));
    }
    return !!(targetFormValues?.type && targetFormValues?.host && targetFormValues?.port && targetFormValues?.user && targetFormValues?.password && targetFormValues?.database);
  };

  // Helper component for test result display
  const TestResultDisplay = ({ result, isLoading }: { result: TestResult | null; isLoading: boolean }) => {
    if (isLoading) {
      return (
        <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-center space-x-2">
            <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
            <span className="text-sm font-medium text-blue-900">{t('database.testConnection')}...</span>
          </div>
          <p className="text-xs text-blue-700 mt-1">{t('verification.subtitle')}</p>
        </div>
      );
    }

    if (!result) return null;

    return (
      <div className={`mt-4 p-4 border rounded-lg ${result.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
        <div className="flex items-center space-x-2">
          {result.success ? (
            <CheckCircle2 className="w-4 h-4 text-green-600" />
          ) : (
            <XCircle className="w-4 h-4 text-red-600" />
          )}
          <span className={`text-sm font-medium ${result.success ? 'text-green-900' : 'text-red-900'}`}>
            {result.success ? t('database.testPassed') : t('database.testFailed')}
          </span>
        </div>
        <p className={`text-xs mt-1 ${result.success ? 'text-green-700' : 'text-red-700'}`}>
          {result.success && result.message === "CONNECTION_SUCCESSFUL" 
            ? t('database.connectionSuccessful', { count: result.details?.tablesFound || 0 })
            : result.message}
        </p>
        {result.details && result.success && (
          <div className="mt-2 text-xs text-green-700 space-y-1">
            <div>✓ {t('database.serverConnectivity')}: {result.details.connectivity ? t('database.ok') : 'Failed'}</div>
            <div>✓ {t('database.credentialsValid')}: {result.details.credentials ? t('database.ok') : 'Failed'}</div>
            <div>✓ {t('database.databaseExists')}: {result.details.databaseExists ? t('database.ok') : 'Failed'}</div>
            <div>✓ {t('database.tablesFound')}: {result.details.tablesFound} {t('database.tables').toLowerCase()}</div>
            {result.details.tableNames && result.details.tableNames.length > 0 && (
              <div className="mt-1">
                <span className="font-medium">{t('database.tables')}: </span>
                <span className="font-mono text-xs">{result.details.tableNames.slice(0, 5).join(', ')}</span>
                {result.details.tableNames.length > 5 && <span> {t('database.andMore', { count: result.details.tableNames.length - 5 })}...</span>}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <Card className="border border-gray-200 dark:border-gray-700 shadow-sm bg-white dark:bg-gray-800" role="region" aria-labelledby="connection-settings-title">
      <CardContent className="p-4 sm:p-6">
        {/* Header with storage controls */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-6 space-y-4 sm:space-y-0">
          <div>
            <h2 id="connection-settings-title" className="text-xl font-semibold text-gray-900 dark:text-white">
              {t('connectionForm.title')}
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1" role="status">
              {hasLoadedFromStorage ? t('storage.settingsLoaded', 'Previous settings loaded from storage') : t('connectionForm.subtitle')}
            </p>
          </div>
          
          <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowStorageDiagnostics(true)}
              className="flex items-center justify-center space-x-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              aria-label="Open storage diagnostics and management"
            >
              <Settings className="w-4 h-4" aria-hidden="true" />
              <span>{t('storage.title')}</span>
            </Button>
            {hasLoadedFromStorage && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={clearStoredConnections}
                className="flex items-center justify-center space-x-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                aria-label="Clear all saved connection data"
              >
                <Trash2 className="w-4 h-4" aria-hidden="true" />
                <span>{t('storage.clearSaved')}</span>
              </Button>
            )}
          </div>
        </div>

        <div className="mb-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">{t('connectionForm.title')}</h2>
          <p className="text-gray-600 dark:text-gray-300">{t('connectionForm.subtitle')}</p>
        </div>

        <Form {...form}>
          <form 
            onSubmit={form.handleSubmit(onSubmit)} 
            className="space-y-6 sm:space-y-8"
            role="form"
            aria-label="Database connection configuration form"
          >
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 lg:gap-8">
              {/* Source Database Section */}
              <section className="space-y-6" aria-labelledby="source-database-title">
                <div className="flex items-center space-x-2 mb-4">
                  <div className="bg-blue-100 dark:bg-blue-900 rounded-full p-2" aria-hidden="true">
                    <Database className="w-5 h-5 text-blue-600" />
                  </div>
                  <h3 id="source-database-title" className="text-lg font-medium text-gray-900 dark:text-white">
                    {t('database.sourceDatabase')}
                  </h3>
                </div>

                <fieldset className="space-y-4" aria-labelledby="source-database-title">
                  <legend className="sr-only">Source database connection details</legend>
                  
                  <FormField
                    control={form.control}
                    name="source.type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium">{t('database.type')} *</FormLabel>
                        <Select onValueChange={handleSourceTypeChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger 
                              className="focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                              aria-label="Select source database type"
                              aria-required="true"
                            >
                              <SelectValue placeholder={t('database.selectType')} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="mysql">{t('database.mysql')}</SelectItem>
                            <SelectItem value="postgres">{t('database.postgres')}</SelectItem>
                            <SelectItem value="sqlite">{t('database.sqlite')}</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage role="alert" />
                      </FormItem>
                    )}
                  />

                  {/* Network fields - hidden for SQLite */}
                  {sourceFormValues?.type !== "sqlite" && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="source.host"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-medium">{t('database.host')} *</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="localhost" 
                              {...field} 
                              className="focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                              aria-label="Source database host address"
                              aria-required="true"
                              autoComplete="off"
                            />
                          </FormControl>
                          <FormMessage role="alert" />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="source.port"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-medium">{t('database.port')} *</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              placeholder="3306" 
                              {...field} 
                              onChange={e => field.onChange(parseInt(e.target.value))}
                              className="focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                              aria-label="Source database port number"
                              aria-required="true"
                              min="1"
                              max="65535"
                            />
                          </FormControl>
                          <FormMessage role="alert" />
                        </FormItem>
                      )}
                    />
                  </div>
                  )}

                  {sourceFormValues?.type !== "sqlite" && (
                  <FormField
                    control={form.control}
                    name="source.user"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium">{t('database.username')} *</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="database_user" 
                            {...field} 
                            className="focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                            aria-label="Source database username"
                            aria-required="true"
                            autoComplete="username"
                          />
                        </FormControl>
                        <FormMessage role="alert" />
                      </FormItem>
                    )}
                  />
                  )}

                  {sourceFormValues?.type !== "sqlite" && (
                  <FormField
                    control={form.control}
                    name="source.password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium">{t('database.password')} *</FormLabel>
                        <FormControl>
                          <Input 
                            type="password" 
                            placeholder="••••••••" 
                            {...field} 
                            className="focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                            aria-label="Source database password"
                            aria-required="true"
                            autoComplete="current-password"
                          />
                        </FormControl>
                        <FormMessage role="alert" />
                      </FormItem>
                    )}
                  />
                  )}

                  <FormField
                    control={form.control}
                    name="source.database"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium">
                          {sourceFormValues?.type === "sqlite" ? t('database.file') : t('database.name')} *
                        </FormLabel>
                        <FormControl>
                          <Input 
                            placeholder={sourceFormValues?.type === "sqlite" ? "Upload file using control below" : "my_database"} 
                            {...field} 
                            readOnly={sourceFormValues?.type === "sqlite"}
                            className="focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                            aria-label={sourceFormValues?.type === "sqlite" ? "Source database file name (auto-filled)" : "Source database name"}
                            aria-required="true"
                            aria-describedby={sourceFormValues?.type === "sqlite" ? "sqlite-help-text" : undefined}
                          />
                        </FormControl>
                        {sourceFormValues?.type === "sqlite" && (
                          <p id="sqlite-help-text" className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            This field is automatically filled when you upload a SQLite file below
                          </p>
                        )}
                        <FormMessage role="alert" />
                      </FormItem>
                    )}
                  />
                </fieldset>

                {/* SQLite File Upload for Source */}
                {sourceFormValues?.type === "sqlite" && (
                  <div className="mt-4" role="region" aria-labelledby="source-file-upload-title">
                    <h4 id="source-file-upload-title" className="sr-only">Source SQLite file upload</h4>
                    <SQLiteUpload
                      onFileProcessed={handleSourceFileProcessed}
                      onFileRemoved={handleSourceFileRemoved}
                      currentFile={sourceFileData ? { name: sourceFileData.name, size: sourceFileData.data.byteLength } : null}
                    />
                  </div>
                )}

                {/* Source Test Button */}
                <div className="pt-4 border-t border-gray-200 dark:border-gray-600">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => testSourceConnection.mutate()}
                    disabled={!isSourceConnectionComplete() || testSourceConnection.isPending}
                    className="w-full flex items-center justify-center space-x-2"
                  >
                    {testSourceConnection.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <TestTube className="w-4 h-4" />
                    )}
                    <span>{t('database.testConnection')}</span>
                  </Button>
                  <TestResultDisplay result={sourceTestResult} isLoading={testSourceConnection.isPending} />
                </div>
              </section>

              {/* Target Database Section */}
              <section className="space-y-6" aria-labelledby="target-database-title">
                <div className="flex items-center space-x-2 mb-4">
                  <div className="bg-emerald-100 dark:bg-emerald-900 rounded-full p-2" aria-hidden="true">
                    <CheckCircle className="w-5 h-5 text-emerald-600" />
                  </div>
                  <h3 id="target-database-title" className="text-lg font-medium text-gray-900 dark:text-white">{t('database.targetDatabase')}</h3>
                </div>

                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="target.type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('database.type')}</FormLabel>
                        <Select onValueChange={handleTargetTypeChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder={t('database.selectType')} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="mysql">{t('database.mysql')}</SelectItem>
                            <SelectItem value="postgres">{t('database.postgres')}</SelectItem>
                            <SelectItem value="sqlite">{t('database.sqlite')}</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Hide network fields for SQLite */}
                  {targetFormValues?.type !== "sqlite" && (
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="target.host"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('database.host')}</FormLabel>
                          <FormControl>
                            <Input placeholder="localhost" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="target.port"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('database.port')}</FormLabel>
                          <FormControl>
                            <Input type="number" placeholder="5432" {...field} onChange={e => field.onChange(parseInt(e.target.value))} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  )}

                  {targetFormValues?.type !== "sqlite" && (
                  <FormField
                    control={form.control}
                    name="target.user"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('database.username')}</FormLabel>
                        <FormControl>
                          <Input placeholder="database_user" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  )}

                  {targetFormValues?.type !== "sqlite" && (
                  <FormField
                    control={form.control}
                    name="target.password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('database.password')}</FormLabel>
                        <FormControl>
                          <Input type="password" placeholder="••••••••" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  )}

                  <FormField
                    control={form.control}
                    name="target.database"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{targetFormValues?.type === "sqlite" ? t('database.file') : t('database.name')}</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder={targetFormValues?.type === "sqlite" ? "Select a file above" : "my_database"} 
                            {...field}
                            readOnly={targetFormValues?.type === "sqlite"}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* SQLite File Upload for Target */}
                {targetFormValues?.type === "sqlite" && (
                  <div className="mt-4">
                    <SQLiteUpload
                      onFileProcessed={handleTargetFileProcessed}
                      onFileRemoved={handleTargetFileRemoved}
                      currentFile={targetFileData ? { name: targetFileData.name, size: targetFileData.data.byteLength } : null}
                    />
                  </div>
                )}

                {/* Target Test Button */}
                <div className="pt-4 border-t border-gray-200 dark:border-gray-600">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => testTargetConnection.mutate()}
                    disabled={!isTargetConnectionComplete() || testTargetConnection.isPending}
                    className="w-full flex items-center justify-center space-x-2"
                  >
                    {testTargetConnection.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <TestTube className="w-4 h-4" />
                    )}
                    <span>{t('database.testConnection')}</span>
                  </Button>
                  <TestResultDisplay result={targetTestResult} isLoading={testTargetConnection.isPending} />
                </div>
              </section>
            </div>

            {/* Password Storage Option */}
            <div className="flex items-start space-x-3 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600">
              <Checkbox
                id="save-passwords"
                checked={savePasswords}
                onCheckedChange={(checked) => setSavePasswords(checked === true)}
                className="mt-1"
              />
              <div className="flex-1">
                <label 
                  htmlFor="save-passwords" 
                  className="text-sm font-medium text-gray-900 dark:text-white cursor-pointer flex items-center space-x-2"
                >
                  <Shield className="w-4 h-4 text-orange-500" />
                  <span>{t('storage.savePasswords')}</span>
                </label>
                <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">
                  {t('storage.securityWarning', '⚠️ Only enable for development/testing. Passwords will be stored in localStorage which is accessible to any JavaScript on this page.')}
                </p>
              </div>
            </div>

            {/* Security Notice */}
            <Alert className="bg-amber-50 dark:bg-amber-950 border-l-4 border-amber-400 border-l-amber-400">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              <AlertDescription className="text-amber-800 dark:text-amber-200">
                <div className="font-medium">{t('storage.securityNotice')}</div>
                <div className="text-sm mt-1 space-y-1">
                  <div>• {savePasswords ? t('storage.passwordsInsecure') : t('storage.passwordsSecure')}</div>
                  <div>• {t('storage.connectionsSaved')}</div>
                  <div>• {t('storage.connectionsAutoClose')}</div>
                </div>
              </AlertDescription>
            </Alert>

            {/* Submit Button */}
            <div className="flex justify-center space-x-4">
              <Button 
                type="submit" 
                disabled={verifyMutation.isPending}
                className="px-8 py-3 bg-primary text-primary-foreground font-medium hover:bg-primary/90 flex items-center space-x-2"
              >
                <CheckCircle className="w-5 h-5" />
                <span>{verifyMutation.isPending ? t('verification.verifying') : t('verification.verifyMigration')}</span>
              </Button>
              
              {verifyMutation.isPending && (
                <div className="flex items-center text-sm text-gray-600 dark:text-gray-300">
                  <Save className="w-4 h-4 mr-2" />
                  <span>{t('storage.settingsSaved')}</span>
                </div>
              )}
            </div>

            {/* Progress Indicator */}
            <ProgressIndicator 
              isVisible={showProgress} 
              onComplete={() => setShowProgress(false)}
            />
          </form>
        </Form>
      </CardContent>
      
      {/* Storage Diagnostics Modal */}
      <StorageDiagnostics 
        isOpen={showStorageDiagnostics}
        onClose={() => setShowStorageDiagnostics(false)}
      />
    </Card>
  );
}
