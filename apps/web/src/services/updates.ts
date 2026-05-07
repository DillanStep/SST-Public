import { getActiveServer, getServers } from './serverManager';
import { getAuthToken } from './auth';

export interface UpdateRelease {
  tagName: string;
  name: string;
  url: string;
  publishedAt: string | null;
  notes: string;
  archiveUrl: string;
}

export interface UpdateStatus {
  ok: boolean;
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  release: UpdateRelease | null;
  mod?: ModVersionStatus;
  disabled?: boolean;
  message?: string;
  error?: string;
}

export interface UpdateInstallStatus {
  ok: boolean;
  status: 'idle' | 'started' | 'starting' | 'running' | 'success' | 'failed' | 'current';
  message: string | null;
  targetTag?: string;
  logPath?: string;
  runnerPath?: string;
  updatedAt?: string | null;
  error?: string;
}

export interface ModVersionStatus {
  expectedVersion: string;
  reportedVersion: string | null;
  expectedProtocolVersion: string;
  reportedProtocolVersion: string | null;
  status: 'match' | 'older' | 'newer' | 'missing' | 'protocol-mismatch' | 'stale' | 'not-reporting' | 'error';
  mismatch: boolean;
  isCompatible: boolean;
  message: string;
  sourceUpdatedAt?: string | null;
  sourceAgeMs?: number | null;
  staleAfterMs?: number | null;
  isStale?: boolean;
  error?: string;
}

function getUpdateBaseUrl(): string {
  return getActiveServer()?.apiUrl ?? '';
}

function getHeaders(contentTypeJson = false): Record<string, string> {
  const server = getActiveServer();
  const headers: Record<string, string> = {};

  if (server?.apiKey) {
    headers['x-api-key'] = server.apiKey;
  }

  if (server?.apiProfile) {
    headers['x-sst-server'] = server.apiProfile;
  }

  const token = getAuthToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (contentTypeJson) {
    headers['Content-Type'] = 'application/json';
  }

  return headers;
}

function getCredentials(): RequestCredentials {
  return !getAuthToken() && getServers().length > 1 ? 'omit' : 'include';
}

async function parseResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};

  if (!response.ok) {
    const message = typeof data?.error === 'string'
      ? data.error
      : `Update request failed (${response.status})`;
    throw new Error(message);
  }

  return data as T;
}

export async function getUpdateStatus(): Promise<UpdateStatus> {
  const baseUrl = getUpdateBaseUrl();
  if (!baseUrl) {
    throw new Error('No server configured.');
  }

  const response = await fetch(`${baseUrl}/updates/status`, {
    credentials: getCredentials(),
    headers: getHeaders(),
  });

  return parseResponse<UpdateStatus>(response);
}

export async function startUpdateInstall(): Promise<UpdateInstallStatus> {
  const baseUrl = getUpdateBaseUrl();
  if (!baseUrl) {
    throw new Error('No server configured.');
  }

  const response = await fetch(`${baseUrl}/updates/install`, {
    method: 'POST',
    credentials: getCredentials(),
    headers: getHeaders(true),
    body: JSON.stringify({}),
  });

  return parseResponse<UpdateInstallStatus>(response);
}

export async function getUpdateInstallStatus(): Promise<UpdateInstallStatus> {
  const baseUrl = getUpdateBaseUrl();
  if (!baseUrl) {
    throw new Error('No server configured.');
  }

  const response = await fetch(`${baseUrl}/updates/install/status`, {
    credentials: getCredentials(),
    headers: getHeaders(),
  });

  return parseResponse<UpdateInstallStatus>(response);
}
