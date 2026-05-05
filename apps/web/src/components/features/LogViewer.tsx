import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Pause,
  Play,
  RefreshCw,
  ScrollText,
  Terminal,
} from 'lucide-react';
import { Card, Button, Badge } from '../ui';
import {
  getLatestScriptLog,
  getLogContent,
  getLogList,
  getLogSummary,
} from '../../services/api';
import type {
  LatestScriptLogResponse,
  LogContentResponse,
  LogFileInfo,
  LogSummaryResponse,
} from '../../types';

interface LogViewerProps {
  isConnected: boolean;
}

type LogType = 'script' | 'crash' | 'rpt' | 'error' | 'adm';

const LOG_TYPE_INFO: Record<LogType, { name: string; shortName: string; icon: React.ReactNode; iconClass: string }> = {
  script: { name: 'Script Logs', shortName: 'Script', icon: <Terminal size={16} />, iconClass: 'text-emerald-500' },
  crash: { name: 'Crash Logs', shortName: 'Crash', icon: <AlertTriangle size={16} />, iconClass: 'text-red-500' },
  rpt: { name: 'RPT Logs', shortName: 'RPT', icon: <ScrollText size={16} />, iconClass: 'text-blue-500' },
  error: { name: 'Error Logs', shortName: 'Error', icon: <AlertTriangle size={16} />, iconClass: 'text-amber-500' },
  adm: { name: 'Admin Logs', shortName: 'Admin', icon: <FileText size={16} />, iconClass: 'text-surface-500' },
};

const LIVE_REFRESH_MS = 5000;
const LIVE_LINE_COUNT = 700;
const STATIC_LINE_COUNT = 900;

function formatSize(bytes = 0): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value?: string | null): string {
  if (!value) return 'Unknown';
  return new Date(value).toLocaleString();
}

function shortFileName(fileName: string): string {
  return fileName
    .replace(/^(script_|crash_|error_|DayZServer_x64_)/, '')
    .replace(/\.log$/i, '')
    .replace(/\.RPT$/i, '');
}

function getErrorMessage(err: unknown, fallback: string): string {
  const responseError = (err as { response?: { data?: { error?: string; details?: string } } })?.response?.data;
  if (responseError?.error) {
    return responseError.details ? `${responseError.error}: ${responseError.details}` : responseError.error;
  }
  return err instanceof Error ? err.message : fallback;
}

function classifyLine(line: string): { rowClass: string; textClass: string; marker: string } {
  if (/\b(fatal|exception|stack trace|crash)\b/i.test(line)) {
    return { rowClass: 'bg-red-950/45', textClass: 'text-red-200', marker: 'FATAL' };
  }
  if (/\b(error|failed|cannot|invalid)\b/i.test(line)) {
    return { rowClass: 'bg-red-950/25', textClass: 'text-red-300', marker: 'ERROR' };
  }
  if (/\b(warn|warning)\b/i.test(line)) {
    return { rowClass: 'bg-amber-950/25', textClass: 'text-amber-200', marker: 'WARN' };
  }
  if (/^\s*SCRIPT\s*:/i.test(line)) {
    return { rowClass: '', textClass: 'text-emerald-300', marker: 'SCRIPT' };
  }
  if (/\b(SST|SudoServerTools|Expansion)\b/i.test(line)) {
    return { rowClass: '', textClass: 'text-cyan-200', marker: 'MOD' };
  }
  if (/^\s*\d{1,2}:\d{2}:\d{2}/.test(line) || /^\s*"?DAYZ_/.test(line)) {
    return { rowClass: '', textClass: 'text-slate-200', marker: 'TIME' };
  }
  return { rowClass: '', textClass: 'text-slate-300', marker: '' };
}

interface ConsoleViewProps {
  content: string;
  firstLineNumber?: number;
  emptyText: string;
  containerRef: React.RefObject<HTMLDivElement>;
}

function ConsoleView({ content, firstLineNumber = 1, emptyText, containerRef }: ConsoleViewProps) {
  const lines = useMemo(() => {
    const rawLines = content ? content.replace(/\r\n/g, '\n').split('\n') : [];
    return rawLines.length > 0 ? rawLines : [emptyText];
  }, [content, emptyText]);

  return (
    <div
      ref={containerRef}
      className="h-[560px] overflow-auto rounded-b-xl border-x border-b border-[#1f2937] bg-[#08111f] font-mono text-[12px] leading-5 shadow-inner"
    >
      <div className="min-w-max py-3">
        {lines.map((line, index) => {
          const classified = classifyLine(line);
          return (
            <div
              key={`${index}-${line.slice(0, 24)}`}
              className={`grid min-w-full grid-cols-[4.5rem_4rem_minmax(0,1fr)] gap-3 px-3 ${classified.rowClass}`}
            >
              <span className="select-none text-right text-slate-600">
                {firstLineNumber + index}
              </span>
              <span className="select-none text-[10px] font-semibold tracking-wide text-slate-600">
                {classified.marker}
              </span>
              <span className={`whitespace-pre pr-8 ${classified.textClass}`}>
                {line || ' '}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const LogViewer: React.FC<LogViewerProps> = ({ isConnected }) => {
  const [summary, setSummary] = useState<LogSummaryResponse['summary'] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedType, setSelectedType] = useState<LogType>('script');
  const [logList, setLogList] = useState<LogFileInfo[]>([]);
  const [loadingList, setLoadingList] = useState(false);

  const [selectedLog, setSelectedLog] = useState<string | null>(null);
  const [logContent, setLogContent] = useState<LogContentResponse | null>(null);
  const [loadingContent, setLoadingContent] = useState(false);

  const [liveMode, setLiveMode] = useState(true);
  const [liveContent, setLiveContent] = useState('');
  const [liveMeta, setLiveMeta] = useState<LatestScriptLogResponse | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const logContainerRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    if (!autoScroll) return;
    window.setTimeout(() => {
      const el = logContainerRef.current;
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
    }, 80);
  }, [autoScroll]);

  const loadSummary = useCallback(async () => {
    if (!isConnected) return;

    setLoading(true);
    setError(null);
    try {
      const data = await getLogSummary();
      setSummary(data.summary);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load log summary'));
    } finally {
      setLoading(false);
    }
  }, [isConnected]);

  const loadLogList = useCallback(async (type: LogType) => {
    if (!isConnected) return;

    setLoadingList(true);
    try {
      const data = await getLogList(type, 40);
      setLogList(data.logs || []);
    } catch (err) {
      console.error('Failed to load log list:', err);
      setLogList([]);
    } finally {
      setLoadingList(false);
    }
  }, [isConnected]);

  const loadLogContent = useCallback(async (type: LogType, fileName: string) => {
    setLoadingContent(true);
    setLiveMode(false);
    setLiveError(null);
    try {
      const data = await getLogContent(type, fileName, STATIC_LINE_COUNT);
      setLogContent(data);
      setSelectedLog(fileName);
      window.setTimeout(() => {
        const el = logContainerRef.current;
        if (el) el.scrollTop = 0;
      }, 80);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load log content'));
    } finally {
      setLoadingContent(false);
    }
  }, []);

  const fetchLiveLog = useCallback(async () => {
    try {
      const data = await getLatestScriptLog(LIVE_LINE_COUNT);
      setLiveMeta(data);
      setLiveContent(data.content || '');
      setLiveError(null);
      scrollToBottom();
    } catch (err) {
      setLiveMeta(null);
      setLiveContent('');
      setLiveError(getErrorMessage(err, 'No script logs found yet'));
    }
  }, [scrollToBottom]);

  const selectType = (type: LogType) => {
    setSelectedType(type);
    setSelectedLog(null);
    setLogContent(null);
    setError(null);
    setLiveError(null);
    setLiveMode(type === 'script');
  };

  const refreshVisibleData = useCallback(() => {
    void loadSummary();
    void loadLogList(selectedType);
    if (selectedType === 'script' && liveMode) {
      void fetchLiveLog();
    } else if (selectedLog) {
      void loadLogContent(selectedType, selectedLog);
    }
  }, [fetchLiveLog, liveMode, loadLogContent, loadLogList, loadSummary, selectedLog, selectedType]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    void loadLogList(selectedType);
  }, [loadLogList, selectedType]);

  useEffect(() => {
    if (!isConnected || selectedType !== 'script' || !liveMode) return;

    void fetchLiveLog();
    const interval = window.setInterval(() => {
      void fetchLiveLog();
    }, LIVE_REFRESH_MS);

    return () => window.clearInterval(interval);
  }, [fetchLiveLog, isConnected, liveMode, selectedType]);

  useEffect(() => {
    if (!isConnected || loadingList || selectedType === 'script' || selectedLog || logList.length === 0) return;
    void loadLogContent(selectedType, logList[0].fileName);
  }, [isConnected, loadingList, loadLogContent, logList, selectedLog, selectedType]);

  const activeContent = liveMode ? liveMeta : logContent;
  const consoleContent = liveMode ? liveContent : logContent?.content || '';
  const skippedLines = activeContent?.truncated ? activeContent.skippedLines || 0 : 0;
  const firstLineNumber = skippedLines + 1;

  if (!isConnected) {
    return (
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <FileText className="text-surface-600" size={24} />
          <h2 className="text-xl font-bold text-surface-800">Server Logs</h2>
        </div>
        <p className="text-surface-500">Connect to the API to view server logs.</p>
      </Card>
    );
  }

  return (
    <Card compact className="overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-surface-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <FileText className="text-surface-700" size={22} />
          <div>
            <h2 className="text-lg font-semibold text-surface-900">Server Logs</h2>
            <p className="text-xs text-surface-500">
              {liveMode ? 'Live script output' : activeContent?.fileName || LOG_TYPE_INFO[selectedType].name}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={refreshVisibleData}
          disabled={loading || loadingList || loadingContent}
          icon={<RefreshCw size={16} className={loading || loadingList || loadingContent ? 'animate-spin' : ''} />}
        >
          Refresh
        </Button>
      </div>

      <div className="px-5 pt-4">
        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="mb-4 flex flex-wrap gap-2 border-b border-surface-200 pb-3">
          {(Object.keys(LOG_TYPE_INFO) as LogType[]).map((type) => {
            const info = LOG_TYPE_INFO[type];
            const count = summary?.[type]?.count ?? 0;
            const active = selectedType === type;
            const dangerCount = (type === 'crash' || type === 'error') && count > 0;
            return (
              <button
                key={type}
                type="button"
                onClick={() => selectType(type)}
                className={`flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors ${
                  active
                    ? 'border-surface-900 bg-surface-900 text-white'
                    : 'border-surface-200 bg-white text-surface-600 hover:bg-surface-50 hover:text-surface-900'
                }`}
              >
                <span className={active ? 'text-white' : info.iconClass}>{info.icon}</span>
                <span>{info.shortName}</span>
                <Badge
                  variant={dangerCount ? 'error' : active ? 'default' : 'default'}
                  className={active ? 'border-white/20 bg-white/15 text-white' : ''}
                >
                  {count}
                </Badge>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid min-h-[640px] grid-cols-1 overflow-hidden border-t border-surface-100 xl:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="border-b border-surface-200 bg-surface-50/80 p-4 xl:border-b-0 xl:border-r">
          {selectedType === 'script' && (
            <Button
              size="sm"
              variant={liveMode ? 'primary' : 'secondary'}
              onClick={() => setLiveMode((value) => !value)}
              icon={liveMode ? <Pause size={14} /> : <Play size={14} />}
              className="mb-4 w-full"
            >
              {liveMode ? 'Stop Live View' : 'Start Live View'}
            </Button>
          )}

          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-surface-900">{LOG_TYPE_INFO[selectedType].name}</h3>
            {loadingList && <RefreshCw size={15} className="animate-spin text-surface-400" />}
          </div>

          <div className="max-h-[540px] space-y-1 overflow-y-auto pr-1">
            {logList.map((log) => {
              const active = selectedLog === log.fileName && !liveMode;
              return (
                <button
                  key={log.fileName}
                  type="button"
                  onClick={() => void loadLogContent(selectedType, log.fileName)}
                  className={`w-full rounded-lg border px-3 py-2.5 text-left transition-colors ${
                    active
                      ? 'border-surface-900 bg-white shadow-sm'
                      : 'border-transparent hover:border-surface-200 hover:bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="min-w-0 truncate font-mono text-xs font-semibold text-surface-900">
                      {shortFileName(log.fileName)}
                    </span>
                    <span className="shrink-0 text-xs text-surface-500">{formatSize(log.size)}</span>
                  </div>
                  <div className="mt-1 text-xs text-surface-500">{formatDate(log.modified)}</div>
                </button>
              );
            })}

            {!loadingList && logList.length === 0 && (
              <div className="rounded-lg border border-dashed border-surface-300 bg-white px-3 py-8 text-center text-sm text-surface-500">
                No logs found
              </div>
            )}
          </div>
        </aside>

        <section className="min-w-0 p-4">
          <div className="overflow-hidden rounded-xl border border-[#1f2937] bg-[#0f172a] shadow-sm">
            <div className="flex flex-col gap-3 border-b border-[#1f2937] bg-[#0b1220] px-4 py-3 text-slate-200 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {liveMode ? (
                    <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_0_4px_rgba(52,211,153,0.12)]" />
                  ) : (
                    <CheckCircle2 size={15} className="text-slate-400" />
                  )}
                  <span className="truncate text-sm font-semibold">
                    {liveMode ? 'Live Script Log' : activeContent?.fileName || LOG_TYPE_INFO[selectedType].name}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                  {activeContent?.fileName && <span>{shortFileName(activeContent.fileName)}</span>}
                  {activeContent?.size !== undefined && <span>{formatSize(activeContent.size)}</span>}
                  {activeContent?.totalLines !== undefined && <span>{activeContent.totalLines.toLocaleString()} lines</span>}
                  {activeContent?.modified && <span>{formatDate(activeContent.modified)}</span>}
                  {activeContent?.truncated && (
                    <span className="text-amber-300">
                      showing latest {liveMode ? LIVE_LINE_COUNT : STATIC_LINE_COUNT} lines
                    </span>
                  )}
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-400">
                <input
                  type="checkbox"
                  checked={autoScroll}
                  onChange={(event) => setAutoScroll(event.target.checked)}
                  className="h-4 w-4 rounded border-slate-600 bg-slate-900"
                />
                Auto-scroll
              </label>
            </div>

            {loadingContent && !liveMode ? (
              <div className="flex h-[560px] items-center justify-center bg-[#08111f] text-slate-400">
                <RefreshCw size={24} className="animate-spin" />
              </div>
            ) : liveError ? (
              <div className="h-[560px] bg-[#08111f] p-4">
                <div className="rounded-lg border border-amber-900/60 bg-amber-950/20 px-3 py-2 text-sm text-amber-200">
                  {liveError}
                </div>
              </div>
            ) : (
              <ConsoleView
                content={consoleContent}
                firstLineNumber={firstLineNumber}
                emptyText={liveMode ? 'Waiting for log data...' : 'No log content loaded.'}
                containerRef={logContainerRef}
              />
            )}
          </div>
        </section>
      </div>
    </Card>
  );
};

export default LogViewer;
