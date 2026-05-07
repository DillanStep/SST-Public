import { getActiveServer, getActiveServerId, getServers } from './serverManager';

export interface User {
  id: number;
  username: string;
  role: 'admin' | 'manager' | 'viewer';
}

export interface AuthUser extends User {
  created_at?: string;
  updated_at?: string;
  last_login?: string;
  is_active?: boolean;
}

export interface LoginResponse {
  success: boolean;
  token?: string;
  user: User;
}

export interface AuthCheckResponse {
  user: User;
}

export interface AuthStatusResponse {
  ok: boolean;
  hasUsers: boolean;
  setupRequired: boolean;
}

export class AuthCheckTransientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthCheckTransientError';
  }
}

// Token storage keys. Older SST builds used one global token; new builds scope
// tokens by saved server ID so switching between servers cannot reuse a login.
const LEGACY_TOKEN_KEY = 'sst-auth-token';
const LEGACY_TOKEN_KEY_SESSION = 'sst-auth-token-session';
const TOKEN_KEY_PREFIX = 'sst-auth-token';
const TOKEN_KEY_SESSION_PREFIX = 'sst-auth-token-session';

function getScopedTokenKeys(serverId = getActiveServerId()): { local: string; session: string } {
  const suffix = serverId ? `:${serverId}` : ':default';
  return {
    local: `${TOKEN_KEY_PREFIX}${suffix}`,
    session: `${TOKEN_KEY_SESSION_PREFIX}${suffix}`,
  };
}

function getLegacyAuthToken(): string | null {
  return localStorage.getItem(LEGACY_TOKEN_KEY) ?? sessionStorage.getItem(LEGACY_TOKEN_KEY_SESSION);
}

function migrateLegacyTokenToActiveServer(): string | null {
  const legacyLocalToken = localStorage.getItem(LEGACY_TOKEN_KEY);
  const legacySessionToken = sessionStorage.getItem(LEGACY_TOKEN_KEY_SESSION);
  const legacyToken = legacyLocalToken ?? legacySessionToken;
  if (!legacyToken) return null;

  const keys = getScopedTokenKeys();
  if (legacyLocalToken) {
    localStorage.setItem(keys.local, legacyLocalToken);
  } else if (legacySessionToken) {
    sessionStorage.setItem(keys.session, legacySessionToken);
  }

  localStorage.removeItem(LEGACY_TOKEN_KEY);
  sessionStorage.removeItem(LEGACY_TOKEN_KEY_SESSION);
  return legacyToken;
}

function canUseLegacyToken(): boolean {
  return getServers().length <= 1;
}

function shouldOmitAuthCookies(token: string | null): boolean {
  return !token && getServers().length > 1;
}

function authCredentials(token: string | null): RequestCredentials {
  return shouldOmitAuthCookies(token) ? 'omit' : 'include';
}

// Get/set auth token for cross-origin requests
export function getAuthToken(): string | null {
  const keys = getScopedTokenKeys();
  const scopedToken = localStorage.getItem(keys.local) ?? sessionStorage.getItem(keys.session);
  if (scopedToken) return scopedToken;

  return canUseLegacyToken() ? migrateLegacyTokenToActiveServer() ?? getLegacyAuthToken() : null;
}

export function setAuthToken(token: string | null, remember: boolean = true): void {
  const keys = getScopedTokenKeys();

  if (token) {
    if (remember) {
      localStorage.setItem(keys.local, token);
      sessionStorage.removeItem(keys.session);
    } else {
      sessionStorage.setItem(keys.session, token);
      localStorage.removeItem(keys.local);
    }

    localStorage.removeItem(LEGACY_TOKEN_KEY);
    sessionStorage.removeItem(LEGACY_TOKEN_KEY_SESSION);
  } else {
    localStorage.removeItem(keys.local);
    sessionStorage.removeItem(keys.session);

    if (canUseLegacyToken()) {
      localStorage.removeItem(LEGACY_TOKEN_KEY);
      sessionStorage.removeItem(LEGACY_TOKEN_KEY_SESSION);
    }
  }
}

export function clearAuthTokenForServer(serverId: string | null): void {
  const keys = getScopedTokenKeys(serverId);
  localStorage.removeItem(keys.local);
  sessionStorage.removeItem(keys.session);
}

export function copyAuthTokenToServer(serverId: string): void {
  const currentKeys = getScopedTokenKeys();
  const targetKeys = getScopedTokenKeys(serverId);
  const localToken = localStorage.getItem(currentKeys.local);
  const sessionToken = sessionStorage.getItem(currentKeys.session);
  const legacyLocalToken = localStorage.getItem(LEGACY_TOKEN_KEY);
  const legacySessionToken = sessionStorage.getItem(LEGACY_TOKEN_KEY_SESSION);

  if (localToken || legacyLocalToken) {
    localStorage.setItem(targetKeys.local, localToken || legacyLocalToken || '');
    sessionStorage.removeItem(targetKeys.session);
    return;
  }

  if (sessionToken || legacySessionToken) {
    sessionStorage.setItem(targetKeys.session, sessionToken || legacySessionToken || '');
    localStorage.removeItem(targetKeys.local);
  }
}

// Get base URL for auth requests
function getAuthBaseUrl(): string {
  const server = getActiveServer();
  if (server) {
    return server.apiUrl;
  }
  // Default to same origin if no server configured
  return '';
}

function getApiKey(): string {
  return getActiveServer()?.apiKey ?? '';
}

function buildHeaders(options?: { contentTypeJson?: boolean; includeAuth?: boolean }): Record<string, string> {
  const headers: Record<string, string> = {};

  const apiKey = getApiKey();
  if (apiKey) {
    headers['x-api-key'] = apiKey;
  }

  if (options?.contentTypeJson) {
    headers['Content-Type'] = 'application/json';
  }

  if (options?.includeAuth) {
    const token = getAuthToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  return headers;
}

function buildAuthenticatedFetchOptions(contentTypeJson = false): {
  headers: Record<string, string>;
  credentials: RequestCredentials;
} {
  const token = getAuthToken();

  return {
    headers: buildHeaders({ contentTypeJson, includeAuth: true }),
    credentials: authCredentials(token),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

type ApiError = Error & { status?: number; code?: string };

function makeApiError(message: string, extras?: { status?: number; code?: string }): ApiError {
  const err = new Error(message) as ApiError;
  if (extras?.status !== undefined) err.status = extras.status;
  if (extras?.code !== undefined) err.code = extras.code;
  return err;
}

// Auth API calls
export async function login(username: string, password: string, remember: boolean = true): Promise<LoginResponse> {
  const baseUrl = getAuthBaseUrl();
  
  if (!baseUrl) {
    throw new Error('No server configured. Please add a server in Settings.');
  }
  
  let response: Response;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    response = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: buildHeaders({ contentTypeJson: true }),
      credentials: 'include', // For cookies (same-origin)
      body: JSON.stringify({ username, password }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
  } catch (err) {
    console.error('[Auth] Network error:', err);
    const message = err instanceof Error && err.name === 'AbortError'
      ? `Login timed out connecting to ${baseUrl}. Check URL, API key, and server status.`
      : `Cannot connect to server at ${baseUrl}. Check if the API is running.`;
    throw new Error(message);
  }
  
  // Get response text first to handle non-JSON responses
  const text = await response.text();
  
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    console.error('[Auth] Failed to parse response:', text.substring(0, 200));
    throw new Error(`Server returned invalid response. Status: ${response.status}`);
  }
  
  if (!response.ok) {
    const errorMessage =
      isRecord(data) && typeof data.error === 'string'
        ? data.error
        : `Login failed (${response.status})`;

    const code = isRecord(data) && typeof data.code === 'string' ? data.code : undefined;
    throw makeApiError(errorMessage, { status: response.status, code });
  }
  
  // Store token for cross-origin Bearer auth
  if (isRecord(data) && typeof data.token === 'string') {
    setAuthToken(data.token, remember);
  }
  
  return data as LoginResponse;
}

export async function logout(): Promise<void> {
  const baseUrl = getAuthBaseUrl();
  const authOptions = buildAuthenticatedFetchOptions();
  
  await fetch(`${baseUrl}/auth/logout`, {
    method: 'POST',
    ...authOptions,
  });
  
  // Clear stored token
  setAuthToken(null);
}

export async function checkAuth(): Promise<AuthCheckResponse | null> {
  const baseUrl = getAuthBaseUrl();
  if (!baseUrl) return null;

  const authOptions = buildAuthenticatedFetchOptions();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/auth/me`, {
      ...authOptions,
      signal: controller.signal,
    });
  } catch (err) {
    const message = err instanceof Error && err.name === 'AbortError'
      ? `Auth check timed out connecting to ${baseUrl}.`
      : `Cannot connect to server at ${baseUrl}.`;
    throw new AuthCheckTransientError(message);
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      setAuthToken(null);
      return null;
    }

    throw new AuthCheckTransientError(`Auth check failed with HTTP ${response.status}.`);
  }

  try {
    return await response.json();
  } catch {
    throw new AuthCheckTransientError('Auth check returned an invalid response.');
  }
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const baseUrl = getAuthBaseUrl();
  const authOptions = buildAuthenticatedFetchOptions(true);
  
  const response = await fetch(`${baseUrl}/auth/change-password`, {
    method: 'POST',
    ...authOptions,
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to change password');
  }
}

// User Management API calls (admin only)
export async function getUsers(): Promise<{ users: AuthUser[] }> {
  const baseUrl = getAuthBaseUrl();
  const authOptions = buildAuthenticatedFetchOptions();
  const response = await fetch(`${baseUrl}/users`, {
    ...authOptions,
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to get users');
  }
  
  return response.json();
}

export async function createUser(username: string, password: string, role: string): Promise<{ user: AuthUser }> {
  const baseUrl = getAuthBaseUrl();
  const authOptions = buildAuthenticatedFetchOptions(true);
  const response = await fetch(`${baseUrl}/users`, {
    method: 'POST',
    ...authOptions,
    body: JSON.stringify({ username, password, role }),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create user');
  }
  
  return response.json();
}

export async function updateUser(id: number, updates: Partial<AuthUser>): Promise<{ user: AuthUser }> {
  const baseUrl = getAuthBaseUrl();
  const authOptions = buildAuthenticatedFetchOptions(true);
  const response = await fetch(`${baseUrl}/users/${id}`, {
    method: 'PUT',
    ...authOptions,
    body: JSON.stringify(updates),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to update user');
  }
  
  return response.json();
}

export async function resetUserPassword(id: number, newPassword: string): Promise<void> {
  const baseUrl = getAuthBaseUrl();
  const authOptions = buildAuthenticatedFetchOptions(true);
  const response = await fetch(`${baseUrl}/users/${id}/reset-password`, {
    method: 'POST',
    ...authOptions,
    body: JSON.stringify({ newPassword }),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to reset password');
  }
}

export async function deleteUser(id: number): Promise<void> {
  const baseUrl = getAuthBaseUrl();
  const authOptions = buildAuthenticatedFetchOptions();
  const response = await fetch(`${baseUrl}/users/${id}`, {
    method: 'DELETE',
    ...authOptions,
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to delete user');
  }
}

export interface AuditLogEntry {
  id: number;
  user_id: number;
  username: string;
  action: string;
  details: string | null;
  ip_address: string;
  created_at: string;
}

export async function getAuditLog(limit = 100): Promise<{ logs: AuditLogEntry[] }> {
  const baseUrl = getAuthBaseUrl();
  const authOptions = buildAuthenticatedFetchOptions();
  const response = await fetch(`${baseUrl}/users/audit/log?limit=${limit}`, {
    ...authOptions,
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to get audit log');
  }
  
  return response.json();
}

export async function getAuthStatus(): Promise<AuthStatusResponse> {
  const baseUrl = getAuthBaseUrl();
  if (!baseUrl) {
    throw new Error('No server configured. Please add a server first.');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(`${baseUrl}/auth/status`, {
      method: 'GET',
      credentials: 'include',
      headers: buildHeaders(),
      signal: controller.signal,
    });

    const text = await response.text();
    const data = text ? (JSON.parse(text) as unknown) : {};

    if (!response.ok) {
      const errorMessage =
        isRecord(data) && typeof data.error === 'string'
          ? data.error
          : `Auth status failed (${response.status})`;

      const code = isRecord(data) && typeof data.code === 'string' ? data.code : undefined;
      throw makeApiError(errorMessage, { status: response.status, code });
    }

    return data as AuthStatusResponse;
  } catch (err) {
    const message = err instanceof Error && err.name === 'AbortError'
      ? `Auth status timed out connecting to ${baseUrl}.`
      : (err instanceof Error ? err.message : 'Failed to get auth status');

    const status = isRecord(err) && typeof (err as { status?: unknown }).status === 'number'
      ? (err as { status: number }).status
      : undefined;
    const code = isRecord(err) && typeof (err as { code?: unknown }).code === 'string'
      ? (err as { code: string }).code
      : undefined;

    if (status !== undefined || code !== undefined) {
      throw makeApiError(message, { status, code });
    }

    throw new Error(message);
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function setupFirstAdmin(username: string, password: string, remember: boolean = true): Promise<LoginResponse> {
  const baseUrl = getAuthBaseUrl();
  if (!baseUrl) {
    throw new Error('No server configured. Please add a server first.');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(`${baseUrl}/auth/setup`, {
      method: 'POST',
      headers: buildHeaders({ contentTypeJson: true }),
      credentials: 'include',
      body: JSON.stringify({ username, password }),
      signal: controller.signal,
    });

    const text = await response.text();
    const data = text ? (JSON.parse(text) as unknown) : {};

    if (!response.ok) {
      const errorMessage =
        isRecord(data) && typeof data.error === 'string'
          ? data.error
          : `Setup failed (${response.status})`;

      const code = isRecord(data) && typeof data.code === 'string' ? data.code : undefined;
      throw makeApiError(errorMessage, { status: response.status, code });
    }

    // Store token for cross-origin Bearer auth
    if (isRecord(data) && typeof data.token === 'string') {
      setAuthToken(data.token, remember);
    }

    return data as LoginResponse;
  } catch (err) {
    const message = err instanceof Error && err.name === 'AbortError'
      ? `Setup timed out connecting to ${baseUrl}.`
      : (err instanceof Error ? err.message : 'Setup failed');

    const status = isRecord(err) && typeof (err as { status?: unknown }).status === 'number'
      ? (err as { status: number }).status
      : undefined;
    const code = isRecord(err) && typeof (err as { code?: unknown }).code === 'string'
      ? (err as { code: string }).code
      : undefined;

    if (status !== undefined || code !== undefined) {
      throw makeApiError(message, { status, code });
    }

    throw new Error(message);
  } finally {
    clearTimeout(timeoutId);
  }
}
