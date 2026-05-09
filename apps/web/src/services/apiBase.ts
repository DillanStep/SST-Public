const trimTrailingSlash = (value: string): string => value.trim().replace(/\/+$/, '');

function getViteApiUrl(): string {
  const env = import.meta.env as ImportMetaEnv & { VITE_SST_API_URL?: string; VITE_API_URL?: string };
  return trimTrailingSlash(env.VITE_SST_API_URL || env.VITE_API_URL || '');
}

export function getDefaultApiUrl(): string {
  const configured = getViteApiUrl();
  if (configured) return configured;

  if (import.meta.env.DEV) {
    if (typeof window !== 'undefined' && window.location?.hostname && !['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)) {
      return trimTrailingSlash(`${window.location.protocol}//${window.location.hostname}:3001`);
    }

    return 'http://localhost:3001';
  }

  if (typeof window !== 'undefined' && window.location?.origin) {
    return trimTrailingSlash(window.location.origin);
  }

  return 'http://localhost:3001';
}

export function getBootstrapApiUrls(): string[] {
  const urls = [getDefaultApiUrl()];

  if (import.meta.env.DEV) {
    urls.push('http://localhost:3001', 'http://127.0.0.1:3001');
  }

  return [...new Set(urls.map(trimTrailingSlash).filter(Boolean))];
}
