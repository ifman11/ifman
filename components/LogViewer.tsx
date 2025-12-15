import React, { useEffect, useRef } from 'react';
import { LogEntry } from '../types';

interface LogViewerProps {
  logs: LogEntry[];
}

export const LogViewer: React.FC<LogViewerProps> = ({ logs }) => {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div className="bg-black rounded-lg p-4 border border-gray-700 font-mono text-xs h-64 overflow-y-auto">
      {logs.length === 0 && <span className="text-gray-600 italic">시스템 준비 완료. 대본 입력을 기다리는 중...</span>}
      {logs.map((log) => (
        <div key={log.id} className="mb-1">
          <span className="text-gray-500">[{log.timestamp}]</span>{' '}
          <span className={`
            ${log.type === 'error' ? 'text-red-400 font-bold' : ''}
            ${log.type === 'success' ? 'text-green-400' : ''}
            ${log.type === 'warning' ? 'text-yellow-400' : ''}
            ${log.type === 'info' ? 'text-gray-300' : ''}
          `}>
            {log.message}
          </span>
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
};