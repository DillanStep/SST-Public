import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, RefreshCw, ShieldCheck } from 'lucide-react';
import { ACTIVE_SERVER_CHANGED_EVENT } from '../../services/serverManager';
import { getUpdateStatus, type UpdateStatus } from '../../services/updates';

interface UpdateStatusBadgeProps {
  compact?: boolean;
  className?: string;
}

function formatVersion(version: string | null | undefined): string {
  const normalized = String(version || __SST_WEB_VERSION__ || '').trim().replace(/^v/i, '');
  return normalized ? `v${normalized}` : 'Version unknown';
}

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Update check failed';
}

export function UpdateStatusBadge({ compact = false, className = '' }: UpdateStatusBadgeProps) {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const checkUpdates = useCallback(async () => {
    setChecking(true);
    try {
      const result = await getUpdateStatus();
      if (!mountedRef.current) return;
      setStatus(result);
      setError(null);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(getErrorMessage(err));
    } finally {
      if (mountedRef.current) {
        setChecking(false);
      }
    }
  }, []);

  useEffect(() => {
    let retryTimer: number | null = null;
    let intervalTimer: number | null = null;

    const scheduleCheck = (delayMs: number) => {
      if (retryTimer) {
        window.clearTimeout(retryTimer);
      }

      retryTimer = window.setTimeout(() => {
        retryTimer = null;
        void checkUpdates();
      }, delayMs);
    };

    const handleServerChanged = () => scheduleCheck(750);

    scheduleCheck(1800);
    intervalTimer = window.setInterval(() => {
      void checkUpdates();
    }, 10 * 60 * 1000);
    window.addEventListener(ACTIVE_SERVER_CHANGED_EVENT, handleServerChanged);

    return () => {
      if (retryTimer) {
        window.clearTimeout(retryTimer);
      }
      if (intervalTimer) {
        window.clearInterval(intervalTimer);
      }
      window.removeEventListener(ACTIVE_SERVER_CHANGED_EVENT, handleServerChanged);
    };
  }, [checkUpdates]);

  const currentVersion = formatVersion(status?.currentVersion);
  const latestVersion = formatVersion(status?.latestVersion);
  const isInitialCheck = checking && !status && !error;

  let label = 'Version';
  let detail = currentVersion;
  let tone = 'border-surface-200 bg-surface-50 text-surface-600 hover:bg-surface-100';
  let icon = <ShieldCheck size={16} />;

  if (isInitialCheck) {
    label = 'Checking updates';
    detail = currentVersion;
    icon = <RefreshCw size={16} className="animate-spin" />;
  } else if (error) {
    label = 'Update check failed';
    detail = currentVersion;
    tone = 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100';
    icon = <AlertCircle size={16} />;
  } else if (status?.disabled) {
    label = 'Update checks off';
    detail = currentVersion;
    icon = <ShieldCheck size={16} />;
  } else if (status?.updateAvailable) {
    label = 'Update available';
    detail = `${currentVersion} -> ${latestVersion}`;
    tone = 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100';
    icon = <AlertTriangle size={16} />;
  } else if (status) {
    label = 'Up-to-date';
    detail = currentVersion;
    tone = 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100';
    icon = <CheckCircle2 size={16} />;
  }

  const title = error ? `${label}: ${error}` : `${label} (${detail})`;

  return (
    <button
      type="button"
      onClick={() => void checkUpdates()}
      className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-surface-300 ${tone} ${compact ? 'justify-center px-2.5' : ''} ${className}`}
      title={title}
    >
      <span className="flex-shrink-0">{icon}</span>
      {compact ? (
        <span className="sr-only">{title}</span>
      ) : (
        <span className="min-w-0">
          <span className="block truncate font-semibold">{detail}</span>
          <span className="block truncate opacity-80">{checking && status ? 'Checking again' : label}</span>
        </span>
      )}
    </button>
  );
}

export default UpdateStatusBadge;
