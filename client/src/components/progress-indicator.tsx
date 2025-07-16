/**
 * Progress Indicator Component - Real-time verification progress display
 */

import { useEffect } from 'react';
import { useProgress } from '@/hooks/use-progress';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Clock, CheckCircle, XCircle, AlertCircle, Wifi, WifiOff } from 'lucide-react';

interface ProgressIndicatorProps {
  isVisible: boolean;
  onComplete?: () => void;
}

export function ProgressIndicator({ isVisible, onComplete }: ProgressIndicatorProps) {
  const { isConnected, currentUpdate, connectionError } = useProgress();

  // Auto-call onComplete when verification is finished
  useEffect(() => {
    if (currentUpdate?.stage === 'completed' && onComplete) {
      setTimeout(onComplete, 2000); // Give user time to see completion
    }
  }, [currentUpdate?.stage, onComplete]);

  if (!isVisible) return null;

  const formatTimeRemaining = (ms?: number): string => {
    if (!ms) return 'Calculating...';
    const seconds = Math.ceil(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const getStageIcon = () => {
    if (!currentUpdate) return <AlertCircle className="h-4 w-4" />;
    
    switch (currentUpdate.stage) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-600" />;
      default:
        return <Clock className="h-4 w-4 text-blue-600 animate-spin" />;
    }
  };

  const getStageColor = () => {
    if (!currentUpdate) return 'secondary';
    
    switch (currentUpdate.stage) {
      case 'completed':
        return 'success' as const;
      case 'failed':
        return 'destructive' as const;
      default:
        return 'default' as const;
    }
  };

  return (
    <div className="w-full space-y-4 p-6 border rounded-lg bg-card">
      {/* Connection Status */}
      <div className="flex items-center gap-2 text-sm">
        {isConnected ? (
          <>
            <Wifi className="h-4 w-4 text-green-600" />
            <span className="text-green-600">Connected to progress service</span>
          </>
        ) : (
          <>
            <WifiOff className="h-4 w-4 text-red-600" />
            <span className="text-red-600">
              {connectionError || 'Disconnected from progress service'}
            </span>
          </>
        )}
      </div>

      {/* Progress Header */}
      {currentUpdate && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {getStageIcon()}
            <h3 className="font-semibold">Database Verification Progress</h3>
          </div>
          <Badge variant={getStageColor()}>
            {currentUpdate.stage.charAt(0).toUpperCase() + currentUpdate.stage.slice(1)}
          </Badge>
        </div>
      )}

      {/* Progress Bar */}
      {currentUpdate && (
        <div className="space-y-2">
          <Progress 
            value={currentUpdate.percentComplete} 
            className="w-full"
          />
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>
              {currentUpdate.tablesCompleted} of {currentUpdate.totalTables} tables
            </span>
            <span>{currentUpdate.percentComplete}%</span>
          </div>
        </div>
      )}

      {/* Current Status */}
      {currentUpdate && (
        <div className="space-y-2">
          <div className="text-sm">
            <span className="font-medium">Status: </span>
            <span>{currentUpdate.message}</span>
          </div>
          
          {currentUpdate.currentTable && (
            <div className="text-sm">
              <span className="font-medium">Current Table: </span>
              <code className="bg-muted px-1 py-0.5 rounded text-xs">
                {currentUpdate.currentTable}
              </code>
            </div>
          )}
          
          {currentUpdate.estimatedTimeRemaining && (
            <div className="text-sm">
              <span className="font-medium">Estimated Time Remaining: </span>
              <span>{formatTimeRemaining(currentUpdate.estimatedTimeRemaining)}</span>
            </div>
          )}
        </div>
      )}

      {/* Timestamp */}
      {currentUpdate && (
        <div className="text-xs text-muted-foreground">
          Last updated: {new Date(currentUpdate.timestamp).toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}