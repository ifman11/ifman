
import React, { useState, useCallback, useRef } from 'react';
import { Scene, SceneStatus, LogEntry } from './types';
import { analyzeScript, generateSceneImage, delay } from './services/geminiService';
import { RATE_LIMIT_DELAY_MS } from './constants';
import { LogViewer } from './components/LogViewer';
import { SceneCard } from './components/SceneCard';
import { StatsDashboard } from './components/StatsDashboard';
import { createLog } from './utils/logUtils';
// @ts-ignore
import JSZip from 'jszip';
// @ts-ignore
import saveAs from 'file-saver';

const App: React.FC = () => {
  const [apiKey, setApiKey] = useState(process.env.API_KEY || '');
  const [script, setScript] = useState('');
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set()); // New: Selection State
  
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  
  // Ref to control the processing loop
  const stopProcessingRef = useRef(false);

  // Helper to append logs
  const log = useCallback((message: string, type: LogEntry['type'] = 'info') => {
    setLogs(prev => [...prev, createLog(message, type)]);
  }, []);

  // --- Selection Logic ---
  const toggleSelection = (id: number) => {
    if (isProcessing) return; // Prevent changing selection while processing
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const handleSelectAll = () => {
    if (isProcessing) return;
    const allIds = scenes.map(s => s.id);
    setSelectedIds(new Set(allIds));
  };

  const handleDeselectAll = () => {
    if (isProcessing) return;
    setSelectedIds(new Set());
  };

  // --- 1. Analyze Script Phase ---
  const handleAnalyze = async () => {
    if (!apiKey) {
      log("API 키가 없습니다.", 'error');
      return;
    }
    if (!script.trim()) {
      log("대본을 입력해주세요.", 'warning');
      return;
    }

    setIsAnalyzing(true);
    setScenes([]);
    setSelectedIds(new Set()); // Clear selection
    log("Gemini 2.5 Flash로 대본 상세 분석을 시작합니다 (최대 분할)...", 'info');

    try {
      const analyzedScenes = await analyzeScript(apiKey, script);
      setScenes(analyzedScenes);
      log(`분석 완료. 총 ${analyzedScenes.length}개의 장면을 찾았습니다.`, 'success');
    } catch (error: any) {
      log(`분석 실패: ${error.message}`, 'error');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // --- 2. Image Generation Loop ---
  const processQueue = async (scenesToProcess: Scene[], isRetryMode = false) => {
    setIsProcessing(true);
    stopProcessingRef.current = false;
    const total = scenesToProcess.length;
    log(`${total}개 장면에 대한 생성을 시작합니다. (모델: Imagen 3 → Gemini 2.5 → 2.0 자동 전환)`, 'info');

    for (let i = 0; i < total; i++) {
      // CHECK STOP SIGNAL
      if (stopProcessingRef.current) {
        log("사용자 요청으로 작업을 일시정지했습니다.", 'warning');
        break;
      }

      const sceneId = scenesToProcess[i].id;
      
      // Update status to generating
      setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, status: isRetryMode ? SceneStatus.RETRYING : SceneStatus.GENERATING } : s));
      
      try {
        // Fetch current prompt data (in case it was edited, though edit not imp yet)
        const currentScene = scenes.find(s => s.id === sceneId) || scenesToProcess[i];
        
        log(`장면 #${sceneId} 생성 중...`, 'info');
        const imageUrl = await generateSceneImage(apiKey, currentScene, isRetryMode);
        
        // On Success
        setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, status: SceneStatus.SUCCESS, imageUrl, errorMsg: undefined } : s));
        log(`장면 #${sceneId} 생성 성공.`, 'success');

      } catch (error: any) {
        // On Error
        const errorMsg = error.message || "알 수 없는 오류";
        log(`장면 #${sceneId} 생성 오류: ${errorMsg}`, 'error');
        setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, status: SceneStatus.ERROR, errorMsg } : s));
      }

      // Rate Limiting / Backoff
      if (i < total - 1 && !stopProcessingRef.current) {
        await delay(RATE_LIMIT_DELAY_MS);
      }
    }

    setIsProcessing(false);
    if (!stopProcessingRef.current) {
      log("작업이 완료되었습니다.", 'info');
    } else {
      log("일시정지 됨. '생성 재개' 버튼을 눌러 계속하세요.", 'warning');
    }
  };

  // --- Button Handlers ---

  const handleStartGeneration = () => {
    let targets: Scene[] = [];

    // Priority: Explicit Selection > Pending Scenes
    if (selectedIds.size > 0) {
      targets = scenes.filter(s => selectedIds.has(s.id));
      log(`선택된 ${targets.length}개 장면에 대해 생성을 시작합니다.`, 'info');
    } else {
      targets = scenes.filter(s => s.status === SceneStatus.IDLE || s.status === SceneStatus.ERROR);
      if (targets.length === 0) {
        log("생성할 대상이 없습니다. (대기 중인 항목 없음)", 'warning');
        return;
      }
      log(`대기/오류 상태인 ${targets.length}개 장면에 대해 생성을 시작합니다.`, 'info');
    }

    processQueue(targets);
  };

  const handleStopGeneration = () => {
    stopProcessingRef.current = true;
    log("일시정지 요청 중... 현재 작업이 완료되면 멈춥니다.", 'info');
  };

  const handleRetryFailed = () => {
    const failedScenes = scenes.filter(s => s.status === SceneStatus.ERROR);
    if (failedScenes.length === 0) {
      log("재시도할 실패한 장면이 없습니다.", 'success');
      return;
    }
    log(`${failedScenes.length}개의 실패한 장면에 대해 단순화된 프롬프트로 재시도합니다...`, 'warning');
    processQueue(failedScenes, true);
  };

  const handleManualRetry = (id: number) => {
    const scene = scenes.find(s => s.id === id);
    if (scene) {
      processQueue([scene], true); // Force retry mode for manual
    }
  };

  const handleDownloadReport = () => {
    const report = scenes.map(s => `Scene ${s.id}: [${s.status}] ${s.errorMsg || 'OK'} - Prompt: ${s.englishPrompt}`).join('\n');
    const blob = new Blob([report], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ifman_report.txt';
    a.click();
    log("리포트가 다운로드되었습니다.", 'success');
  };

  const handleDownloadAllImages = async () => {
    const successScenes = scenes.filter(s => s.status === SceneStatus.SUCCESS && s.imageUrl);
    if (successScenes.length === 0) {
      log("다운로드할 완료된 이미지가 없습니다.", 'warning');
      return;
    }

    setIsZipping(true);
    log(`${successScenes.length}개의 이미지를 압축 중입니다...`, 'info');

    try {
      const zip = new JSZip();
      const imgFolder = zip.folder("images");

      // Add Text Report
      const report = scenes.map(s => `Scene ${s.id}: [${s.status}] Prompt: ${s.englishPrompt} \nKR: ${s.scriptSegment}`).join('\n\n');
      zip.file("report.txt", report);

      // Process images
      const promises = successScenes.map(async (scene) => {
        if (!scene.imageUrl) return;
        
        // Convert Base64 Data URL to Blob
        const fetchRes = await fetch(scene.imageUrl);
        const blob = await fetchRes.blob();
        
        const fileName = `scene_${scene.id.toString().padStart(3, '0')}.png`;
        imgFolder.file(fileName, blob);
      });

      await Promise.all(promises);

      const content = await zip.generateAsync({ type: "blob" });
      saveAs(content, "ifman_storyboard.zip");
      log("전체 다운로드(ZIP)가 완료되었습니다.", 'success');

    } catch (error: any) {
      console.error(error);
      log(`압축 다운로드 실패: ${error.message}`, 'error');
    } finally {
      setIsZipping(false);
    }
  };

  // Helper variables for UI
  const pendingCount = scenes.filter(s => s.status === SceneStatus.IDLE || s.status === SceneStatus.ERROR).length;
  const selectionCount = selectedIds.size;
  const hasScenes = scenes.length > 0;

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 p-4 sticky top-0 z-50 shadow-md">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center font-bold text-white">IF</div>
            <h1 className="text-xl font-bold tracking-tight">이프맨 스토리보드 생성기 (V2.1 - Selection Mode)</h1>
          </div>
          
          <div className="flex items-center gap-2 w-full md:w-auto">
            {!process.env.API_KEY && (
               <input
               type="password"
               placeholder="Gemini API 키 입력 (환경변수 미설정 시)"
               className="bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-sm w-full md:w-64 focus:outline-none focus:border-blue-500 transition-colors"
               value={apiKey}
               onChange={(e) => setApiKey(e.target.value)}
             />
            )}
           
            <button
              onClick={handleDownloadReport}
              className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-1.5 rounded text-sm font-medium transition-colors border border-gray-600"
              disabled={!hasScenes}
            >
              리포트 저장
            </button>

             <button
              onClick={handleDownloadAllImages}
              disabled={scenes.filter(s => s.status === SceneStatus.SUCCESS).length === 0 || isZipping}
              className="bg-blue-700 hover:bg-blue-600 text-white px-4 py-1.5 rounded text-sm font-medium transition-colors shadow flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isZipping ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  압축 중...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  전체 다운로드 (ZIP)
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Panel: Inputs & Stats */}
        <section className="lg:col-span-4 flex flex-col gap-6">
          
          {/* Stats */}
          <div className="h-64">
            <StatsDashboard scenes={scenes} />
          </div>

          {/* Script Input */}
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 shadow-lg flex-1 flex flex-col">
            <h3 className="text-lg font-bold mb-2 text-gray-200">대본 입력</h3>
            <div className="mb-2 text-xs text-gray-400">
               팁: 상세한 분할을 위해 가능한 긴 대본을 입력하세요. 시스템이 자동으로 100컷 이상으로 나눕니다.
            </div>
            <textarea
              className="flex-1 w-full bg-gray-900 border border-gray-700 rounded p-3 text-sm focus:outline-none focus:border-blue-500 mb-4 resize-none"
              placeholder="여기에 한국어 대본을 붙여넣으세요 (약 10,000자 권장)..."
              value={script}
              onChange={(e) => setScript(e.target.value)}
              disabled={isAnalyzing || isProcessing}
            />
            <button
              onClick={handleAnalyze}
              disabled={isAnalyzing || isProcessing || !script}
              className={`w-full py-3 rounded font-bold text-sm transition-all
                ${isAnalyzing 
                  ? 'bg-blue-900 text-blue-300 cursor-wait' 
                  : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg hover:shadow-blue-500/20'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {isAnalyzing ? '대본 상세 분석 중...' : '1. 대본 정밀 분석 (장면 분할)'}
            </button>
          </div>

          {/* Logs */}
          <div className="flex-none">
            <h3 className="text-sm font-bold text-gray-400 mb-2">시스템 로그</h3>
            <LogViewer logs={logs} />
          </div>
        </section>

        {/* Right Panel: Gallery & Controls */}
        <section className="lg:col-span-8 flex flex-col gap-4">
          
          {/* Action Bar */}
          <div className="bg-gray-800 p-4 rounded-lg border border-gray-700 shadow flex flex-col sm:flex-row gap-4 justify-between items-center sticky top-24 z-40">
            
            {/* Left: Selection Controls */}
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <div className="flex items-center gap-2">
                 <button 
                  onClick={handleSelectAll} 
                  disabled={!hasScenes || isProcessing}
                  className="text-xs bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded text-gray-300 disabled:opacity-50"
                 >
                   전체 선택
                 </button>
                 <button 
                  onClick={handleDeselectAll} 
                  disabled={!hasScenes || isProcessing || selectionCount === 0}
                  className="text-xs bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded text-gray-300 disabled:opacity-50"
                 >
                   선택 해제
                 </button>
              </div>
              <span className="text-gray-400 text-sm border-l border-gray-600 pl-3">
                {selectionCount > 0 ? (
                  <span className="text-blue-400 font-bold">{selectionCount}개 선택됨</span>
                ) : (
                  <span>총 {scenes.length}개 장면</span>
                )}
              </span>
            </div>

            {/* Right: Actions */}
            <div className="flex gap-3 w-full sm:w-auto justify-end">
              {isProcessing ? (
                <button
                  onClick={handleStopGeneration}
                  className="bg-red-600 hover:bg-red-500 text-white px-6 py-2 rounded font-bold text-sm shadow transition-all flex items-center gap-2 border border-red-400 animate-pulse"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 9v6m4-6v6" />
                  </svg>
                  일시정지 (STOP)
                </button>
              ) : (
                <button
                  onClick={handleStartGeneration}
                  disabled={!hasScenes}
                  className={`px-6 py-2 rounded font-bold text-sm shadow transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-white
                    ${selectionCount > 0 
                      ? 'bg-indigo-600 hover:bg-indigo-500 ring-2 ring-indigo-400' 
                      : (pendingCount > 0 ? 'bg-blue-600 hover:bg-blue-500' : 'bg-gray-600')
                    }
                  `}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {selectionCount > 0 
                    ? `선택한 ${selectionCount}개 생성 시작` 
                    : (pendingCount > 0 ? `대기 ${pendingCount}개 생성 시작` : '생성 완료')}
                </button>
              )}
              
              <button
                onClick={handleRetryFailed}
                disabled={scenes.filter(s => s.status === SceneStatus.ERROR).length === 0 || isProcessing}
                className="bg-yellow-600 hover:bg-yellow-500 text-white px-4 py-2 rounded font-bold text-sm shadow transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              >
                오류 재시도
              </button>
            </div>
          </div>

          {/* Grid */}
          <div className="flex-1 bg-gray-800/50 rounded-lg p-4 border border-gray-700/50 overflow-y-auto min-h-[500px]">
            {scenes.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-gray-500">
                <svg className="w-16 h-16 mb-4 opacity-20" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
                </svg>
                <p>아직 로드된 장면이 없습니다. 먼저 대본을 분석해주세요.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {scenes.map((scene) => (
                  <SceneCard 
                    key={scene.id} 
                    scene={scene} 
                    isSelected={selectedIds.has(scene.id)}
                    onToggleSelect={toggleSelection}
                    onRetry={handleManualRetry} 
                  />
                ))}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
};

export default App;
