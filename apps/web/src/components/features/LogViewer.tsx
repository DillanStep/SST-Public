import React, { useState, useEffect, useCallback, useRef } from 'react';
import { FileText, RefreshCw, AlertTriangle, Terminal, ScrollText, Play, Pause } from 'lucide-react';
import { Card, Button, Badge } from '../ui';
import { 
  getLogSummary, 
  getLogList, 
  getLogContent, 
  getLatestScriptLog
} from '../../services/api';
import type { LogSummaryResponse, LogFileInfo, LogContentResponse } from '../../types';

interface LogViewerProps {
  isConnected: boolean;
}

type LogType = 'script' | 'crash' | 'rpt' | 'error' | 'adm';

const LOG_TYPE_INFO: Record<LogType, { name: string; icon: React.ReactNode; color: string }> = {
  script: { name: 'Script Logs', icon: <Terminal size={16} />, color: 'text-velvet' },
  crash: { name: 'Crash Logs', icon: <AlertTriangle size={16} />, color: 'text-red-500' },
  rpt: { name: 'RPT Logs', icon: <ScrollText size={16} />, color: 'text-blue-500' },
  error: { name: 'Error Logs', icon: <AlertTriangle size={16} />, color: 'text-orange-500' },
  adm: { name: 'Admin Logs', icon: <FileText size={16} />, color: 'text-surface-500' }
};

export const LogViewer: React.FC<LogViewerProps> = ({ isConnected }) => {
  const [summary, setSummary] = useState<LogSummaryResponse['summary'] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Selected log type and list
  const [selectedType, setSelectedType] = useState<LogType>('script');
  const [logList, setLogList] = useState<LogFileInfo[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  
  // Log content
  const [selectedLog, setSelectedLog] = useState<string | null>(null);
  const [logContent, setLogContent] = useState<LogContentResponse | null>(null);
  const [loadingContent, setLoadingContent] = useState(false);
  
  // Live script log
  const [liveMode, setLiveMode] = useState(false);
  const [liveContent, setLiveContent] = useState<string>('');
  const liveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const logContainerRef = useRef<HTMLPreElement>(null);
  
  // Auto-scroll
  const [autoScroll, setAutoScroll] = useState(true);

  const loadSummary = useCallback(async () => {
    if (!isConnected) return;
    
    setLoading(true);
    setError(null);
    try {
      const data = await getLogSummary();
      setSummary(data.summary);
    } catch (err) {
      setError('Failed to load log summary');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [isConnected]);

  const loadLogList = useCallback(async (type: LogType) => {
    if (!isConnected) return;
    
    setLoadingList(true);
    try {
      const data = await getLogList(type, 30);
      setLogList(data.logs);
    } catch (err) {
      console.error('Failed to load log list:', err);
      setLogList([]);
    } finally {
      setLoadingList(false);
    }
  }, [isConnected]);

  const loadLogContent = async (type: LogType, fileName: string) => {
    setLoadingContent(true);
    setLiveMode(false);
    try {
      const data = await getLogContent(type, fileName, 500);
      setLogContent(data);
      setSelectedLog(fileName);
    } catch (err) {
      console.error('Failed to load log content:', err);
    } finally {
      setLoadingContent(false);
    }
  };

  const startLiveMode = () => {
    setLiveMode(true);
    setSelectedLog(null);
    setLogContent(null);
    
    // Initial fetch
    fetchLiveLog();
    
    // Set up interval for every 10 seconds
    liveIntervalRef.current = setInterval(fetchLiveLog, 10000);
  };

  const stopLiveMode = () => {
    setLiveMode(false);
    if (liveIntervalRef.current) {
      clearInterval(liveIntervalRef.current);
      liveIntervalRef.current = null;
    }
  };

  const fetchLiveLog = async () => {
    try {
      const data = await getLatestScriptLog(300);
      setLiveContent(data.content);
      
      // Auto-scroll to bottom
      if (autoScroll && logContainerRef.current) {
        setTimeout(() => {
          if (logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
          }
        }, 100);
      }
    } catch (err) {
      console.error('Failed to fetch live log:', err);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (liveIntervalRef.current) {
        clearInterval(liveIntervalRef.current);
      }
    };
  }, []);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    if (selectedType) {
      loadLogList(selectedType);
      // Stop live mode when switching types
      if (selectedType !== 'script') {
        stopLiveMode();
      }
    }
  }, [selectedType, loadLogList]);

  // Format file size
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (!isConnected) {
    return (
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <FileText className="text-velvet" size={24} />
          <h2 className="text-xl font-bold text-surface-800">Server Logs</h2>
        </div>
        <p className="text-surface-500">Connect to the API to view server logs.</p>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <FileText className="text-velvet" size={24} />
          <h2 className="text-xl font-bold text-surface-800">Server Logs</h2>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={loadSummary}
          disabled={loading}
          icon={<RefreshCw size={16} className={loading ? 'animate-spin' : ''} />}
        >
          Refresh
        </Button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm">
          {error}
        </div>
      )}

      {/* Log Type Tabs */}
      <div className="flex gap-2 mb-4 border-b border-surface-200 pb-2">
        {(Object.keys(LOG_TYPE_INFO) as LogType[]).map((type) => (
          <button
            key={type}
            onClick={() => setSelectedType(type)}
            className={`flex items-center gap-2 px-3 py-2 rounded-t-md text-sm font-medium transition-colors ${
              selectedType === type
                ? 'bg-velvet text-white'
                : 'text-dark-400 hover:bg-surface-100'
            }`}
          >
            <span className={selectedType === type ? 'text-white' : LOG_TYPE_INFO[type].color}>
              {LOG_TYPE_INFO[type].icon}
            </span>
            {LOG_TYPE_INFO[type].name}
            {summary && (
              <Badge variant={type === 'crash' && summary[type].count > 0 ? 'error' : 'default'}>
                {summary[type].count}
              </Badge>
            )}
          </button>
        ))}
      </div>

      <div className="flex gap-4">
        {/* Log List Panel */}
        <div className="w-80 flex-shrink-0 border-r border-surface-200 pr-4">
          {/* Live Mode Button (only for script logs) */}
          {selectedType === 'script' && (
            <div className="mb-3">
              <Button
                size="sm"
                variant={liveMode ? 'primary' : 'secondary'}
                onClick={liveMode ? stopLiveMode : startLiveMode}
                icon={liveMode ? <Pause size={14} /> : <Play size={14} />}
                className="w-full"
              >
                {liveMode ? 'Stop Live View' : 'Start Live View (10s)'}
              </Button>
            </div>
          )}
          
          <h3 className="text-sm font-semibold text-dark-400 mb-2">
            {LOG_TYPE_INFO[selectedType].name}
          </h3>
          
          {loadingList ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw size={20} className="animate-spin text-surface-500" />
            </div>
          ) : (
            <div className="space-y-1 max-h-[400px] overflow-y-auto">
              {logList.map((log) => (
                <button
                  key={log.fileName}
                  onClick={() => loadLogContent(selectedType, log.fileName)}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                    selectedLog === log.fileName
                      ? 'bg-velvet text-white'
                      : 'hover:bg-surface-100 text-dark-400'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="truncate text-xs font-mono">
                      {log.fileName.replace(/^(script_|crash_|error_|DayZServer_x64_)/, '')}
                    </span>
                    <span className="text-xs opacity-70">{formatSize(log.size)}</span>
                  </div>
                  <div className="text-xs opacity-60 mt-1">
                    {new Date(log.modified).toLocaleString()}
                  </div>
                </button>
              ))}
              
              {logList.length === 0 && (
                <div className="text-center py-4 text-surface-500 text-sm">
                  No logs found
                </div>
              )}
            </div>
          )}
        </div>

        {/* Log Content Panel */}
        <div className="flex-1 min-w-0">
          {liveMode ? (
            <>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-surface-800 flex items-center gap-2">
                  <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                  Live Script Log
                </h3>
                <label className="flex items-center gap-2 text-sm text-surface-500">
                  <input
                    type="checkbox"
                    checked={autoScroll}
                    onChange={(e) => setAutoScroll(e.target.checked)}
                    className="rounded"
                  />
                  Auto-scroll
                </label>
              </div>
              <pre
                ref={logContainerRef}
                className="bg-dark-600 text-green-400 p-4 rounded-md text-xs font-mono overflow-auto max-h-[500px] whitespace-pre-wrap"
              >
                {liveContent || 'Waiting for log data...'}
              </pre>
            </>
          ) : loadingContent ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw size={24} className="animate-spin text-surface-500" />
            </div>
          ) : logContent ? (
            <>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-surface-800 truncate">{logContent.fileName}</h3>
                <div className="flex items-center gap-2 text-sm text-surface-500">
                  <span>{formatSize(logContent.size)}</span>
                  <span>•</span>
                  <span>{logContent.totalLines} lines</span>
                  {logContent.truncated && (
                    <Badge variant="warning">Truncated</Badge>
                  )}
                </div>
              </div>
              <pre
                ref={logContainerRef}
                className={`p-4 rounded-md text-xs font-mono overflow-auto max-h-[500px] whitespace-pre-wrap ${
                  selectedType === 'crash' || selectedType === 'error'
                    ? 'bg-red-950 text-red-200'
                    : 'bg-dark-600 text-gray-300'
                }`}
              >
                {logContent.content}
              </pre>
            </>
          ) : (
            <div className="text-center py-12 text-surface-500">
              <FileText size={48} className="mx-auto mb-4 opacity-30" />
              <p>Select a log file to view its contents</p>
              {selectedType === 'script' && (
                <p className="mt-2 text-sm">Or use Live View for real-time updates</p>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
};

export default LogViewer;
