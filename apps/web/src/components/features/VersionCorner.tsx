import { useCallback, useEffect, useRef, useState } from 'react';
import { ACTIVE_SERVER_CHANGED_EVENT } from '../../services/serverManager';
import { getUpdateStatus, type ModVersionStatus, type UpdateStatus } from '../../services/updates';

function formatVersion(value: string | null | undefined, fallback = 'unknown'): string {
  const normalized = String(value || '').trim().replace(/^v/i, '');
  return normalized ? `v${normalized}` : fallback;
}

function getDisplayedModVersion(mod: ModVersionStatus | null | undefined): string {
  return formatVersion(mod?.reportedVersion || mod?.expectedVersion, 'unknown');
}

function getModTone(mod: ModVersionStatus | null | undefined): string {
  if (!mod) return 'text-surface-500';
  if (mod.mismatch || mod.status === 'stale' || mod.status === 'missing') return 'text-amber-700';
  if (mod.status === 'match') return 'text-emerald-700';
  return 'text-surface-700';
}

export function VersionCorner() {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const result = await getUpdateStatus();
      if (mountedRef.current) {
        setStatus(result);
      }
    } catch {
      if (mountedRef.current) {
        setStatus(null);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void refresh();

    const handleServerChanged = () => {
      void refresh();
    };
    const interval = window.setInterval(() => void refresh(), 5 * 60 * 1000);
    window.addEventListener(ACTIVE_SERVER_CHANGED_EVENT, handleServerChanged);

    return () => {
      mountedRef.current = false;
      window.clearInterval(interval);
      window.removeEventListener(ACTIVE_SERVER_CHANGED_EVENT, handleServerChanged);
    };
  }, [refresh]);

  const webVersion = formatVersion(__SST_WEB_VERSION__);
  const modVersion = getDisplayedModVersion(status?.mod);
  const modTone = getModTone(status?.mod);
  const title = status?.mod?.message
    ? `Web ${webVersion}. Mod ${modVersion}. ${status.mod.message}`
    : `Web ${webVersion}. Mod ${modVersion}.`;

  return (
    <div className="pointer-events-none fixed bottom-3 right-3 z-[2200] select-none">
      <div
        className="flex items-center gap-2 rounded-md border border-surface-200/80 bg-white/90 px-2.5 py-1.5 text-[11px] font-medium text-surface-500 shadow-sm backdrop-blur"
        title={title}
        aria-label={title}
      >
        <span>
          Web <span className="text-surface-800">{webVersion}</span>
        </span>
        <span className="h-3 w-px bg-surface-200" />
        <span>
          Mod <span className={modTone}>{modVersion}</span>
        </span>
      </div>
    </div>
  );
}

export default VersionCorner;
