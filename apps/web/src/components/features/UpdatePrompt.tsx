import { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle, Download, ExternalLink, RefreshCw, X } from 'lucide-react';
import { Button } from '../ui';
import type { User } from '../../services/auth';
import { ACTIVE_SERVER_CHANGED_EVENT } from '../../services/serverManager';
import {
  getUpdateInstallStatus,
  getUpdateStatus,
  startUpdateInstall,
  type UpdateInstallStatus,
  type UpdateStatus,
} from '../../services/updates';

interface UpdatePromptProps {
  user: User;
}

const dismissedVersionKey = 'sst-update-dismissed-version';

function formatDate(value: string | null | undefined): string {
  if (!value) return '';
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(new Date(value));
  } catch {
    return '';
  }
}

function trimNotes(notes: string): string {
  const clean = notes.trim();
  if (!clean) return '';
  return clean.length > 480 ? `${clean.slice(0, 480).trim()}...` : clean;
}

export function UpdatePrompt({ user }: UpdatePromptProps) {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [installStatus, setInstallStatus] = useState<UpdateInstallStatus | null>(null);
  const [visible, setVisible] = useState(false);
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    if (user.role !== 'admin') return;

    let cancelled = false;
    let retryTimer: number | null = null;
    let intervalTimer: number | null = null;

    async function check() {
      setChecking(true);
      try {
        const result = await getUpdateStatus();
        if (cancelled) return;

        setStatus(result);
        const dismissedVersion = localStorage.getItem(dismissedVersionKey);
        if (result.updateAvailable && result.latestVersion !== dismissedVersion) {
          setVisible(true);
        } else if (!result.updateAvailable) {
          setVisible(false);
        }
      } catch (err) {
        // Update checks should never interrupt normal dashboard use.
        console.warn('Update check failed:', err);
      } finally {
        if (!cancelled) setChecking(false);
      }
    }

    const scheduleCheck = (delayMs: number) => {
      if (retryTimer) {
        window.clearTimeout(retryTimer);
      }

      retryTimer = window.setTimeout(() => {
        retryTimer = null;
        void check();
      }, delayMs);
    };

    const handleServerChanged = () => scheduleCheck(750);

    scheduleCheck(1800);
    intervalTimer = window.setInterval(() => {
      void check();
    }, 10 * 60 * 1000);
    window.addEventListener(ACTIVE_SERVER_CHANGED_EVENT, handleServerChanged);

    return () => {
      cancelled = true;
      if (retryTimer) {
        window.clearTimeout(retryTimer);
      }
      if (intervalTimer) {
        window.clearInterval(intervalTimer);
      }
      window.removeEventListener(ACTIVE_SERVER_CHANGED_EVENT, handleServerChanged);
    };
  }, [user.role]);

  useEffect(() => {
    return () => {
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
      }
    };
  }, []);

  const dismiss = () => {
    if (status?.latestVersion) {
      localStorage.setItem(dismissedVersionKey, status.latestVersion);
    }
    setVisible(false);
  };

  const pollInstall = () => {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
    }

    pollRef.current = window.setInterval(async () => {
      try {
        const result = await getUpdateInstallStatus();
        setInstallStatus(result);
        if (result.status === 'success' || result.status === 'failed' || result.status === 'current') {
          setInstalling(false);
          if (pollRef.current) {
            window.clearInterval(pollRef.current);
            pollRef.current = null;
          }
        }
      } catch (err) {
        setInstalling(false);
        setError(err instanceof Error ? err.message : 'Could not read update status.');
      }
    }, 3000);
  };

  const installNow = async () => {
    setError(null);
    setInstalling(true);
    try {
      const result = await startUpdateInstall();
      setInstallStatus(result);
      if (result.status === 'started' || result.status === 'starting' || result.status === 'running') {
        pollInstall();
      } else {
        setInstalling(false);
      }
    } catch (err) {
      setInstalling(false);
      setError(err instanceof Error ? err.message : 'Could not start update.');
    }
  };

  if (!visible || !status?.updateAvailable || !status.release) {
    return null;
  }

  const releaseDate = formatDate(status.release.publishedAt);
  const notes = trimNotes(status.release.notes);
  const updateComplete = installStatus?.status === 'success';
  const updateFailed = installStatus?.status === 'failed';

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/40 px-4 py-6">
      <div className="w-full max-w-lg rounded-2xl border border-surface-200 bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-surface-200 px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-xl bg-emerald-50 p-2 text-emerald-700">
              <Download size={20} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-surface-900">SST update available</h2>
              <p className="mt-1 text-sm text-surface-500">
                {status.currentVersion} to {status.latestVersion}{releaseDate ? `, released ${releaseDate}` : ''}
              </p>
            </div>
          </div>
          <button
            onClick={dismiss}
            className="rounded-xl p-2 text-surface-400 transition-colors hover:bg-surface-100 hover:text-surface-700"
            title="Dismiss"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div>
            <div className="text-sm font-medium text-surface-800">{status.release.name}</div>
            {notes && (
              <p className="mt-2 whitespace-pre-line text-sm leading-6 text-surface-600">{notes}</p>
            )}
          </div>

          {installStatus?.message && (
            <div className={`flex gap-3 rounded-xl border p-3 text-sm ${
              updateComplete
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : updateFailed
                  ? 'border-red-200 bg-red-50 text-red-800'
                  : 'border-surface-200 bg-surface-50 text-surface-700'
            }`}>
              {updateComplete ? <CheckCircle size={18} /> : updateFailed ? <AlertCircle size={18} /> : <RefreshCw size={18} className="animate-spin" />}
              <div>
                <div>{installStatus.message}</div>
                {installStatus.logPath && (
                  <div className="mt-1 text-xs opacity-80">{installStatus.logPath}</div>
                )}
              </div>
            </div>
          )}

          {error && (
            <div className="flex gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <AlertCircle size={18} />
              <div>{error}</div>
            </div>
          )}

          {checking && (
            <div className="flex items-center gap-2 text-xs text-surface-400">
              <RefreshCw size={14} className="animate-spin" />
              Checking update status
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-surface-200 px-5 py-4 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={dismiss} disabled={installing}>
            Later
          </Button>
          <Button
            variant="secondary"
            icon={<ExternalLink size={16} />}
            onClick={() => window.open(status.release?.url, '_blank', 'noopener,noreferrer')}
          >
            View Release
          </Button>
          <Button
            variant="success"
            icon={<Download size={16} />}
            loading={installing}
            onClick={installNow}
            disabled={installing || updateComplete}
          >
            {updateComplete ? 'Installed' : 'Install Now'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default UpdatePrompt;
