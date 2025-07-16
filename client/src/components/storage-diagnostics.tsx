import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useKeyboardNavigation, useFocusManagement } from "@/hooks/use-keyboard-navigation";
import { 
  Settings, 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  RefreshCw, 
  Trash2,
  Info,
  HardDrive,
  Database
} from "lucide-react";
import {
  runStorageDiagnostics,
  clearAllStoredData,
  isStorageAvailable,
  getStorageInfo,
  type StorageError
} from "@/lib/storage";

interface StorageDiagnosticsProps {
  isOpen: boolean;
  onClose: () => void;
}

export function StorageDiagnostics({ isOpen, onClose }: StorageDiagnosticsProps) {
  const [diagnostics, setDiagnostics] = useState(runStorageDiagnostics());
  const [isClearing, setIsClearing] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const { trapFocus, focusFirstFocusableElement } = useFocusManagement();

  // Keyboard navigation
  useKeyboardNavigation({
    onEscape: onClose,
  });

  // Focus management when dialog opens
  useEffect(() => {
    if (isOpen && dialogRef.current) {
      const cleanup = trapFocus(dialogRef.current);
      focusFirstFocusableElement(dialogRef.current);
      
      // Prevent scrolling on background
      document.body.style.overflow = 'hidden';
      
      return () => {
        document.body.style.overflow = '';
        cleanup?.();
      };
    }
  }, [isOpen, trapFocus, focusFirstFocusableElement]);

  const refreshDiagnostics = () => {
    setDiagnostics(runStorageDiagnostics());
  };

  const handleClearAll = async () => {
    setIsClearing(true);
    try {
      const result = clearAllStoredData();
      console.log('Storage cleared:', result);
      
      // Refresh diagnostics after clearing
      setTimeout(() => {
        refreshDiagnostics();
        setIsClearing(false);
      }, 500);
    } catch (error) {
      console.error('Failed to clear storage:', error);
      setIsClearing(false);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getStorageHealthColor = () => {
    if (!diagnostics.available) return 'red';
    if (diagnostics.errors.length > 0) return 'orange';
    if (diagnostics.quota && diagnostics.quota.available < 1024 * 100) return 'yellow';
    return 'green';
  };

  const getStorageHealthIcon = () => {
    const color = getStorageHealthColor();
    switch (color) {
      case 'red': return <XCircle className="w-5 h-5 text-red-500" />;
      case 'orange': return <AlertTriangle className="w-5 h-5 text-orange-500" />;
      case 'yellow': return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
      default: return <CheckCircle className="w-5 h-5 text-green-500" />;
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-labelledby="storage-diagnostics-title"
      aria-modal="true"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <Card 
        ref={dialogRef}
        className="w-full max-w-2xl max-h-[90vh] overflow-auto" 
        onClick={(e) => e.stopPropagation()}
      >
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center space-y-4 sm:space-y-0">
            <div className="flex items-center space-x-2">
              <Settings className="w-5 h-5" aria-hidden="true" />
              <CardTitle id="storage-diagnostics-title">Storage Diagnostics</CardTitle>
              {getStorageHealthIcon()}
            </div>
            <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={refreshDiagnostics}
                className="flex items-center justify-center space-x-1 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                aria-label="Refresh diagnostics data"
              >
                <RefreshCw className="w-4 h-4" aria-hidden="true" />
                <span>Refresh</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onClose}
                className="focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                aria-label="Close storage diagnostics dialog"
              >
                Close
              </Button>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {/* Storage Availability */}
          <section aria-labelledby="storage-availability-title">
            <h3 id="storage-availability-title" className="text-lg font-semibold mb-3 flex items-center">
              <Database className="w-4 h-4 mr-2" aria-hidden="true" />
              Storage Availability
            </h3>
            <div className="flex items-center space-x-2" role="status" aria-live="polite">
              {diagnostics.available ? (
                <>
                  <CheckCircle className="w-4 h-4 text-green-500" aria-hidden="true" />
                  <span className="text-green-700">localStorage is available</span>
                </>
              ) : (
                <>
                  <XCircle className="w-4 h-4 text-red-500" aria-hidden="true" />
                  <span className="text-red-700">localStorage is not available</span>
                </>
              )}
            </div>
          </section>

          {/* Storage Quota */}
          {diagnostics.quota && (
            <div>
              <h3 className="text-lg font-semibold mb-3 flex items-center">
                <HardDrive className="w-4 h-4 mr-2" />
                Storage Usage
              </h3>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Used:</span>
                  <span className="font-mono">{formatBytes(diagnostics.quota.used)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Total:</span>
                  <span className="font-mono">{formatBytes(diagnostics.quota.quota)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Available:</span>
                  <span className="font-mono">{formatBytes(diagnostics.quota.available)}</span>
                </div>
                
                {/* Usage bar */}
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className={`h-2 rounded-full ${
                      diagnostics.quota.available < 1024 * 100 ? 'bg-red-500' : 
                      diagnostics.quota.available < 1024 * 500 ? 'bg-yellow-500' : 'bg-green-500'
                    }`}
                    style={{ 
                      width: `${(diagnostics.quota.used / diagnostics.quota.quota) * 100}%` 
                    }}
                  />
                </div>
                <div className="text-xs text-gray-600">
                  {((diagnostics.quota.used / diagnostics.quota.quota) * 100).toFixed(1)}% used
                </div>
              </div>
            </div>
          )}

          {/* Stored Keys */}
          <div>
            <h3 className="text-lg font-semibold mb-3">Stored Data</h3>
            {diagnostics.keys.length > 0 ? (
              <div className="space-y-2">
                {diagnostics.keys.map((key) => (
                  <div key={key} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                    <span className="font-mono text-sm">{key}</span>
                    <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded">Active</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-gray-500 text-sm">No data stored</div>
            )}
          </div>

          {/* Errors */}
          {diagnostics.errors.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold mb-3 text-red-700">Storage Errors</h3>
              <div className="space-y-2">
                {diagnostics.errors.map((error, index) => (
                  <Alert key={index} className="border-red-200 bg-red-50">
                    <AlertTriangle className="h-4 w-4 text-red-500" />
                    <AlertDescription className="text-red-700">
                      <div className="font-medium">{error.operation}: {error.key}</div>
                      <div className="text-sm">{error.message}</div>
                    </AlertDescription>
                  </Alert>
                ))}
              </div>
            </div>
          )}

          {/* Recommendations */}
          {diagnostics.recommendations.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold mb-3">Recommendations</h3>
              <div className="space-y-2">
                {diagnostics.recommendations.map((recommendation, index) => (
                  <Alert key={index} className="border-blue-200 bg-blue-50">
                    <Info className="h-4 w-4 text-blue-500" />
                    <AlertDescription className="text-blue-700">
                      {recommendation}
                    </AlertDescription>
                  </Alert>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <section className="border-t pt-4" aria-labelledby="storage-actions-title">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center space-y-4 sm:space-y-0">
              <div>
                <h3 id="storage-actions-title" className="text-lg font-semibold">Storage Actions</h3>
                <p className="text-sm text-gray-600">Manage stored connection data</p>
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleClearAll}
                disabled={isClearing || diagnostics.keys.length === 0}
                className="flex items-center justify-center space-x-2 focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                aria-label={`Clear all stored data (${diagnostics.keys.length} items)`}
                aria-describedby="clear-data-warning"
              >
                <Trash2 className="w-4 h-4" aria-hidden="true" />
                <span>{isClearing ? 'Clearing...' : 'Clear All Data'}</span>
              </Button>
            </div>
            <p id="clear-data-warning" className="text-xs text-gray-500 mt-2">
              This action cannot be undone. All saved connection data will be permanently removed.
            </p>
          </section>
        </CardContent>
      </Card>
    </div>
  );
}