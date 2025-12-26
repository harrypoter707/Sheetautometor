
export interface User {
  name: string;
  email: string;
  picture: string;
  id: string;
}

export interface AutomationSettings {
  webhookUrl: string;
  sheetName: string;
  batchSize: number;
  intervalMinutes: number;
  sheetUrl?: string;
}

export interface SheetConfig {
  url: string;
  sheetName: string;
}

export enum EngineStatus {
  IDLE = 'IDLE',
  PROCESSING = 'PROCESSING',
  WAITING = 'WAITING',
  ERROR = 'ERROR'
}

export interface SubmissionLog {
  id: string;
  url: string;
  timestamp: Date;
  status: 'success' | 'duplicate' | 'error' | 'pending';
  message?: string;
  batchId: string;
}

export interface AppState {
  pendingQueue: string[];
  history: string[];
  logs: SubmissionLog[];
  settings: AutomationSettings;
  status: EngineStatus;
}
