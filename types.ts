export enum SceneStatus {
  IDLE = 'IDLE',
  PENDING = 'PENDING', // Waiting in queue
  GENERATING = 'GENERATING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR',
  RETRYING = 'RETRYING'
}

export interface Scene {
  id: number;
  scriptSegment: string;
  englishPrompt: string;
  mainCharacterVisible: boolean; // True if Ifman should appear, False if it's another subject (e.g. Steve Jobs, object)
  imageUrl?: string;
  status: SceneStatus;
  errorMsg?: string;
  retryCount: number;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  message: string;
  type: 'info' | 'success' | 'error' | 'warning';
}

export interface GenerationConfig {
  apiKey: string;
}