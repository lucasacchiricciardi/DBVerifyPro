/**
 * Progress Tracking Hook - WebSocket-based real-time progress updates
 */

import { useState, useEffect, useRef, useCallback } from 'react';

export interface ProgressUpdate {
  sessionId: string;
  type: 'verification' | 'connection' | 'schema' | 'data';
  stage: string;
  currentTable?: string;
  tablesCompleted: number;
  totalTables: number;
  percentComplete: number;
  estimatedTimeRemaining?: number;
  message: string;
  timestamp: string;
}

export interface ProgressState {
  isConnected: boolean;
  currentUpdate: ProgressUpdate | null;
  connectionError: string | null;
}

export function useProgress() {
  const [state, setState] = useState<ProgressState>({
    isConnected: false,
    currentUpdate: null,
    connectionError: null
  });

  const wsRef = useRef<WebSocket | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return; // Already connected
    }

    try {
      // Use the current protocol and host
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/progress`;
      
      const ws = new WebSocket(wsUrl);
      
      ws.onopen = () => {
        console.log('[ProgressService] Connected to progress WebSocket');
        setState(prev => ({ 
          ...prev, 
          isConnected: true, 
          connectionError: null 
        }));
        reconnectAttemptsRef.current = 0;

        // Register with session ID if available
        if (sessionIdRef.current) {
          ws.send(JSON.stringify({
            type: 'register',
            sessionId: sessionIdRef.current
          }));
        }
      };

      ws.onmessage = (event) => {
        try {
          const update: ProgressUpdate = JSON.parse(event.data);
          console.log('[ProgressService] Received update:', update);
          
          setState(prev => ({
            ...prev,
            currentUpdate: update
          }));
        } catch (error) {
          console.error('[ProgressService] Error parsing message:', error);
        }
      };

      ws.onclose = (event) => {
        console.log('[ProgressService] WebSocket closed:', event.code, event.reason);
        setState(prev => ({ 
          ...prev, 
          isConnected: false 
        }));

        // Attempt to reconnect with exponential backoff
        if (reconnectAttemptsRef.current < 5) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
          console.log(`[ProgressService] Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current + 1}/5)`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttemptsRef.current++;
            connect();
          }, delay);
        } else {
          setState(prev => ({ 
            ...prev, 
            connectionError: 'Failed to connect after multiple attempts' 
          }));
        }
      };

      ws.onerror = (error) => {
        console.error('[ProgressService] WebSocket error:', error);
        setState(prev => ({ 
          ...prev, 
          connectionError: 'WebSocket connection error' 
        }));
      };

      wsRef.current = ws;
    } catch (error) {
      console.error('[ProgressService] Failed to create WebSocket:', error);
      setState(prev => ({ 
        ...prev, 
        connectionError: 'Failed to create WebSocket connection' 
      }));
    }
  }, []);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setState(prev => ({ 
      ...prev, 
      isConnected: false, 
      currentUpdate: null 
    }));
  }, []);

  const registerSession = useCallback((sessionId: string) => {
    sessionIdRef.current = sessionId;
    
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'register',
        sessionId
      }));
    }
  }, []);

  // Auto-connect on mount
  useEffect(() => {
    connect();
    
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, []);

  return {
    ...state,
    connect,
    disconnect,
    registerSession
  };
}