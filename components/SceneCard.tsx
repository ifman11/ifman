
import React from 'react';
import { Scene, SceneStatus } from '../types';

interface SceneCardProps {
  scene: Scene;
  isSelected: boolean;
  onToggleSelect: (id: number) => void;
  onRetry: (id: number) => void;
}

export const SceneCard: React.FC<SceneCardProps> = ({ scene, isSelected, onToggleSelect, onRetry }) => {
  const getStatusColor = () => {
    if (isSelected) return 'border-blue-400 bg-blue-900/20 ring-2 ring-blue-500'; // Selection highlight

    switch (scene.status) {
      case SceneStatus.SUCCESS: return 'border-green-500/50 bg-green-900/10';
      case SceneStatus.ERROR: return 'border-red-500/50 bg-red-900/10';
      case SceneStatus.GENERATING: return 'border-blue-500/50 bg-blue-900/10 animate-pulse';
      case SceneStatus.RETRYING: return 'border-yellow-500/50 bg-yellow-900/10 animate-pulse';
      default: return 'border-gray-700 bg-gray-800 hover:border-gray-500';
    }
  };

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!scene.imageUrl) return;
    const link = document.createElement('a');
    link.href = scene.imageUrl;
    link.download = `scene_${scene.id.toString().padStart(3, '0')}_ifman.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleRetryClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRetry(scene.id);
  };

  return (
    <div 
      onClick={() => onToggleSelect(scene.id)}
      className={`relative rounded-lg border p-3 flex flex-col gap-2 transition-all duration-200 cursor-pointer ${getStatusColor()}`}
    >
      {/* Selection Checkbox Overlay */}
      <div className="flex justify-between items-center text-xs text-gray-400">
        <div className="flex items-center gap-2">
          <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${isSelected ? 'bg-blue-500 border-blue-500' : 'border-gray-600 bg-gray-800'}`}>
            {isSelected && (
              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
              </svg>
            )}
          </div>
          <span className={`font-bold ${isSelected ? 'text-blue-300' : ''}`}>장면 #{scene.id}</span>
        </div>
        <span>{scene.status}</span>
      </div>

      <div className="aspect-video bg-gray-900 rounded overflow-hidden flex items-center justify-center relative group">
        {scene.imageUrl ? (
          <>
            <img src={scene.imageUrl} alt={`Scene ${scene.id}`} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <button 
                onClick={handleDownload}
                className="bg-white text-black text-xs font-bold px-3 py-1.5 rounded-full hover:bg-gray-200 transition-colors flex items-center gap-1 shadow-lg"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                다운로드
              </button>
            </div>
          </>
        ) : (
          <div className="text-gray-600 text-sm p-4 text-center">
            {scene.status === SceneStatus.GENERATING ? '생성 중...' : '이미지 없음'}
          </div>
        )}
      </div>

      <div className="space-y-1">
        <p className="text-xs text-gray-300 line-clamp-2" title={scene.scriptSegment}>
          <span className="text-gray-500">대사:</span> {scene.scriptSegment}
        </p>
        <p className="text-[10px] text-gray-500 line-clamp-2" title={scene.englishPrompt}>
          <span className="text-gray-600">프롬프트:</span> {scene.englishPrompt}
        </p>
      </div>

      {scene.status === SceneStatus.ERROR && (
        <div className="mt-2" onClick={(e) => e.stopPropagation()}>
           <p className="text-[10px] text-red-400 mb-1 truncate">{scene.errorMsg}</p>
           <button 
            onClick={handleRetryClick}
            className="w-full py-1 bg-red-900/50 hover:bg-red-900 text-red-200 text-xs rounded transition-colors"
           >
             수동 재시도
           </button>
        </div>
      )}
    </div>
  );
};
