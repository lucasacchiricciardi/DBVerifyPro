/**
 * Progress Service - Real-time progress tracking using WebSockets
 * Provides live updates during database verification processes
 */

import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import type { Server } from 'http';

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

export interface ProgressSession {
  id: string;
  startTime: number;
  totalTables: number;
  completedTables: number;
  currentTable?: string;
  stage: string;
}

export class ProgressService {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, WebSocket> = new Map();
  private sessions: Map<string, ProgressSession> = new Map();

  private log(message: string, data?: any): void {
    console.log(`[ProgressService] ${message}`, data ? JSON.stringify(data, null, 2) : '');
  }

  /**
   * Initialize WebSocket server
   */
  setupWebSocket(server: Server): void {
    this.wss = new WebSocketServer({ 
      server,
      path: '/ws/progress'
    });

    this.wss.on('connection', (ws: WebSocket, req) => {
      const clientId = uuidv4();
      this.clients.set(clientId, ws);
      
      this.log('Client connected', { clientId, url: req.url });

      // Send initial connection confirmation
      this.sendToClient(clientId, {
        sessionId: '',
        type: 'connection',
        stage: 'connected',
        tablesCompleted: 0,
        totalTables: 0,
        percentComplete: 0,
        message: 'Connected to progress service',
        timestamp: new Date().toISOString()
      });

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.log('Received message from client', { clientId, message });
          
          // Handle client registration with session ID
          if (message.type === 'register' && message.sessionId) {
            this.clients.set(message.sessionId, ws);
            this.clients.delete(clientId);
            this.log('Client registered with session ID', { sessionId: message.sessionId });
          }
        } catch (error) {
          this.log('Error parsing client message', { error: error instanceof Error ? error.message : 'Unknown error' });
        }
      });

      ws.on('close', () => {
        this.clients.delete(clientId);
        this.log('Client disconnected', { clientId });
      });

      ws.on('error', (error) => {
        this.log('WebSocket error', { clientId, error: error.message });
        this.clients.delete(clientId);
      });
    });

    this.log('WebSocket server initialized on /ws/progress');
  }

  /**
   * Start a new progress session
   */
  startSession(sessionId: string, totalTables: number): void {
    const session: ProgressSession = {
      id: sessionId,
      startTime: Date.now(),
      totalTables,
      completedTables: 0,
      stage: 'initializing'
    };

    this.sessions.set(sessionId, session);
    this.log('Progress session started', { sessionId, totalTables });

    this.broadcastProgress(sessionId, {
      type: 'verification',
      stage: 'initializing',
      tablesCompleted: 0,
      totalTables,
      percentComplete: 0,
      message: `Starting verification of ${totalTables} tables...`
    });
  }

  /**
   * Update progress for a session
   */
  updateProgress(
    sessionId: string, 
    stage: string, 
    currentTable?: string, 
    message?: string
  ): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      this.log('Session not found for progress update', { sessionId });
      return;
    }

    session.stage = stage;
    session.currentTable = currentTable;

    const percentComplete = session.totalTables > 0 
      ? Math.round((session.completedTables / session.totalTables) * 100)
      : 0;

    const elapsedTime = Date.now() - session.startTime;
    const estimatedTimeRemaining = session.completedTables > 0
      ? Math.round((elapsedTime / session.completedTables) * (session.totalTables - session.completedTables))
      : undefined;

    this.broadcastProgress(sessionId, {
      type: 'verification',
      stage,
      currentTable,
      tablesCompleted: session.completedTables,
      totalTables: session.totalTables,
      percentComplete,
      estimatedTimeRemaining,
      message: message || `Processing ${currentTable || 'tables'}...`
    });
  }

  /**
   * Mark table as completed
   */
  completeTable(sessionId: string, tableName: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.completedTables++;
    const percentComplete = Math.round((session.completedTables / session.totalTables) * 100);

    this.broadcastProgress(sessionId, {
      type: 'verification',
      stage: 'processing',
      currentTable: tableName,
      tablesCompleted: session.completedTables,
      totalTables: session.totalTables,
      percentComplete,
      message: `Completed verification of table: ${tableName} (${session.completedTables}/${session.totalTables})`
    });
  }

  /**
   * Complete a session
   */
  completeSession(sessionId: string, success: boolean, message: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    this.broadcastProgress(sessionId, {
      type: 'verification',
      stage: success ? 'completed' : 'failed',
      tablesCompleted: session.completedTables,
      totalTables: session.totalTables,
      percentComplete: 100,
      message
    });

    // Clean up session after 30 seconds
    setTimeout(() => {
      this.sessions.delete(sessionId);
      this.log('Session cleaned up', { sessionId });
    }, 30000);
  }

  /**
   * Send progress update to specific client
   */
  private sendToClient(clientId: string, update: Partial<ProgressUpdate>): void {
    const client = this.clients.get(clientId);
    if (!client || client.readyState !== WebSocket.OPEN) return;

    const fullUpdate: ProgressUpdate = {
      sessionId: clientId,
      type: 'verification',
      stage: 'unknown',
      tablesCompleted: 0,
      totalTables: 0,
      percentComplete: 0,
      message: '',
      timestamp: new Date().toISOString(),
      ...update
    };

    try {
      client.send(JSON.stringify(fullUpdate));
    } catch (error) {
      this.log('Error sending message to client', { clientId, error });
      this.clients.delete(clientId);
    }
  }

  /**
   * Broadcast progress update to all clients for a session
   */
  private broadcastProgress(sessionId: string, update: Partial<ProgressUpdate>): void {
    const fullUpdate: ProgressUpdate = {
      sessionId,
      type: 'verification',
      stage: 'unknown',
      tablesCompleted: 0,
      totalTables: 0,
      percentComplete: 0,
      message: '',
      timestamp: new Date().toISOString(),
      ...update
    };

    // Send to specific session client
    const sessionClient = this.clients.get(sessionId);
    if (sessionClient && sessionClient.readyState === WebSocket.OPEN) {
      try {
        sessionClient.send(JSON.stringify(fullUpdate));
      } catch (error) {
        this.log('Error sending to session client', { sessionId, error });
        this.clients.delete(sessionId);
      }
    }

    // Also broadcast to all connected clients
    this.clients.forEach((client, clientId) => {
      if (client.readyState === WebSocket.OPEN && clientId !== sessionId) {
        try {
          client.send(JSON.stringify(fullUpdate));
        } catch (error) {
          this.log('Error broadcasting to client', { clientId, error });
          this.clients.delete(clientId);
        }
      }
    });

    this.log('Progress broadcasted', { 
      sessionId, 
      stage: fullUpdate.stage, 
      percentComplete: fullUpdate.percentComplete 
    });
  }

  /**
   * Get current session status
   */
  getSessionStatus(sessionId: string): ProgressSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Clean up resources
   */
  cleanup(): void {
    if (this.wss) {
      this.wss.close();
    }
    this.clients.clear();
    this.sessions.clear();
    this.log('Progress service cleaned up');
  }
}

export const progressService = new ProgressService();