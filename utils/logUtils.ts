import { LogEntry } from '../types';

export const createLog = (message: string, type: LogEntry['type'] = 'info'): LogEntry => {
  const now = new Date();
  const timeString = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return {
    id: Math.random().toString(36).substring(7),
    timestamp: timeString,
    message,
    type
  };
};