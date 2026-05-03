import { getActiveServer } from './serverManager';
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
  updatedAt?: string | null;
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

  const token = getAuthToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (contentTypeJson) {
    headers['Content-Type'] = 'application/json';
  }

  return headers;
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
    credentials: 'include',
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
    credentials: 'include',
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
    credentials: 'include',
    headers: getHeaders(),
  });

  return parseResponse<UpdateInstallStatus>(response);
}
