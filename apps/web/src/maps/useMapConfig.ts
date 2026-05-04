import { useCallback, useEffect, useState } from 'react';
import { ACTIVE_SERVER_CHANGED_EVENT, getActiveServer } from '../services/serverManager';
import { getMapConfig } from '../services/api';
import { DEFAULT_MAP_CONFIG, getServerMapOverride, resolveMapConfig, type ActiveMapConfig } from './mapConfig';

interface UseMapConfigResult {
  mapConfig: ActiveMapConfig;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

export function useMapConfig(isConnected: boolean): UseMapConfigResult {
  const [mapConfig, setMapConfig] = useState<ActiveMapConfig>(DEFAULT_MAP_CONFIG);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMapConfig = useCallback(async () => {
    if (!isConnected) {
      setMapConfig(DEFAULT_MAP_CONFIG);
      return;
    }

    setLoading(true);
    try {
      const config = await getMapConfig();
      const localOverride = getServerMapOverride(getActiveServer());
      setMapConfig(resolveMapConfig(localOverride ? { ...config, ...localOverride } : config));
      setError(null);
    } catch (err) {
      const localOverride = getServerMapOverride(getActiveServer());
      setMapConfig(resolveMapConfig(localOverride || DEFAULT_MAP_CONFIG));
      setError(localOverride ? null : err instanceof Error ? err.message : 'Failed to load map config');
    } finally {
      setLoading(false);
    }
  }, [isConnected]);

  useEffect(() => {
    void loadMapConfig();
  }, [loadMapConfig]);

  useEffect(() => {
    const handleServerChanged = () => {
      void loadMapConfig();
    };

    window.addEventListener(ACTIVE_SERVER_CHANGED_EVENT, handleServerChanged);
    return () => window.removeEventListener(ACTIVE_SERVER_CHANGED_EVENT, handleServerChanged);
  }, [loadMapConfig]);

  return {
    mapConfig,
    loading,
    error,
    reload: loadMapConfig,
  };
}
