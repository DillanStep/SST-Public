import type { ServerConfig } from '../types';
import { getServers, updateServer } from './serverManager';
import { getAuthToken } from './auth';

export interface ApiServerProfile {
  id: string;
  name?: string;
  aliases?: string[];
  isDefault?: boolean;
}

export interface ApiServerProfilesResponse {
  active?: string;
  profiles?: ApiServerProfile[];
}

export interface ResolvedServerProfile {
  server: ServerConfig;
  profiles: ApiServerProfile[];
  activeProfile?: string;
  changed: boolean;
}

export interface ResolveServerProfileOptions {
  createIfMissing?: boolean;
}

export const normalizeApiUrl = (value?: string | null): string => {
  return String(value || '').trim().replace(/\/+$/, '');
};

export const slugifyProfileName = (value: string): string => {
  return value
    .trim()
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

export const buildUniqueProfileName = (serverName: string, ignoreServerId?: string): string => {
  const base = slugifyProfileName(serverName) || 'server';
  const usedProfiles = new Set(
    getServers()
      .filter(server => server.id !== ignoreServerId)
      .map(server => server.apiProfile)
      .filter(Boolean)
      .map(profile => slugifyProfileName(profile || ''))
  );

  let candidate = base;
  let suffix = 2;
  while (usedProfiles.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  return candidate;
};

function normalizeProfileValue(value?: string | null): string {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function trailingNumber(value?: string | null): string | null {
  const match = String(value || '').match(/(\d+)\D*$/);
  return match?.[1] || null;
}

function profileCandidates(profile: ApiServerProfile): string[] {
  return [profile.id, profile.name, ...(profile.aliases || [])].filter(Boolean) as string[];
}

function scoreProfile(server: ServerConfig, profile: ApiServerProfile): number {
  const serverValues = [server.name, server.apiProfile].filter(Boolean) as string[];
  const normalizedServerValues = serverValues.map(normalizeProfileValue).filter(Boolean);
  const serverNumbers = new Set(serverValues.map(trailingNumber).filter(Boolean) as string[]);

  let bestScore = 0;
  for (const candidate of profileCandidates(profile)) {
    const normalizedCandidate = normalizeProfileValue(candidate);
    if (!normalizedCandidate) continue;

    for (const normalizedServer of normalizedServerValues) {
      if (normalizedServer === normalizedCandidate) {
        bestScore = Math.max(bestScore, 100);
      } else if (normalizedServer.includes(normalizedCandidate) || normalizedCandidate.includes(normalizedServer)) {
        bestScore = Math.max(bestScore, 80);
      }
    }

    const candidateNumber = trailingNumber(candidate);
    if (candidateNumber && serverNumbers.has(candidateNumber)) {
      bestScore = Math.max(bestScore, profile.isDefault ? 45 : 70);
    }
  }

  return bestScore;
}

export function inferApiProfile(server: ServerConfig, profiles: ApiServerProfile[]): string | null {
  const explicitProfile = server.apiProfile?.trim();
  if (explicitProfile) return explicitProfile;
  if (profiles.length <= 1) return '';

  const ranked = profiles
    .map(profile => ({ profile, score: scoreProfile(server, profile) }))
    .filter(item => item.score >= 70)
    .sort((a, b) => b.score - a.score);

  if (ranked.length === 0) return null;
  if (ranked.length > 1 && ranked[0].score === ranked[1].score) return null;
  return ranked[0].profile.id;
}

async function fetchProfiles(server: ServerConfig, profileOverride?: string): Promise<ApiServerProfilesResponse> {
  const headers: Record<string, string> = {
    'x-api-key': server.apiKey,
  };
  const profile = profileOverride ?? server.apiProfile;
  if (profile?.trim()) {
    headers['x-sst-server'] = profile.trim();
  }

  const response = await fetch(`${server.apiUrl}/servers`, { headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = typeof data?.error === 'string'
      ? data.error
      : `Profile request failed (${response.status})`;
    throw new Error(error);
  }
  return data as ApiServerProfilesResponse;
}

function sameApiUrl(left?: string | null, right?: string | null): boolean {
  return normalizeApiUrl(left).toLowerCase() === normalizeApiUrl(right).toLowerCase();
}

function getSameApiUrlServers(server: ServerConfig): ServerConfig[] {
  return getServers().filter(item => sameApiUrl(item.apiUrl, server.apiUrl));
}

function isDefaultServerForApiUrl(server: ServerConfig): boolean {
  const sameUrlServers = getSameApiUrlServers(server);
  return sameUrlServers.length <= 1 || sameUrlServers[0]?.id === server.id;
}

function profileExists(profiles: ApiServerProfile[], profileId: string): boolean {
  const normalizedProfileId = normalizeProfileValue(profileId);
  return profiles.some(profile =>
    profileCandidates(profile).some(candidate => normalizeProfileValue(candidate) === normalizedProfileId)
  );
}

function buildUniqueProfileNameForApi(server: ServerConfig, profiles: ApiServerProfile[]): string {
  const base = slugifyProfileName(server.apiProfile || server.name) || 'server';
  let candidate = base;
  let suffix = 2;

  while (profileExists(profiles, candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

async function createProfileOnApi(
  server: ServerConfig,
  profileId: string
): Promise<{ profile?: ApiServerProfile; profiles?: ApiServerProfile[] }> {
  const token = getAuthToken();
  const response = await fetch(`${normalizeApiUrl(server.apiUrl)}/servers/profiles`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': server.apiKey,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      name: server.name,
      profile: profileId,
      mapPreset: server.mapPreset,
      mapLabel: server.mapLabel,
      mapImageUrl: server.mapImageUrl,
      mapWorldSizeX: server.mapWorldSizeX,
      mapWorldSizeZ: server.mapWorldSizeZ,
      mapInvertX: server.mapInvertX,
      mapInvertZ: server.mapInvertZ,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof data?.details === 'string'
      ? data.details
      : typeof data?.error === 'string'
        ? data.error
        : `Profile creation failed (${response.status})`;
    throw new Error(message);
  }

  return data as { profile?: ApiServerProfile; profiles?: ApiServerProfile[] };
}

export async function resolveServerProfile(
  server: ServerConfig,
  options: ResolveServerProfileOptions = {}
): Promise<ResolvedServerProfile> {
  let response: ApiServerProfilesResponse;
  let ignoreSavedProfile = false;

  try {
    response = await fetchProfiles(server);
  } catch (err) {
    if (!server.apiProfile) throw err;
    ignoreSavedProfile = true;
    response = await fetchProfiles(server, '');
  }

  const profiles = response.profiles || [];
  const serverForInference = ignoreSavedProfile ? { ...server, apiProfile: '' } : server;
  const inferredProfile = inferApiProfile(
    serverForInference,
    profiles
  );
  let nextProfile = inferredProfile ?? serverForInference.apiProfile ?? '';
  let nextProfiles = profiles;

  if (
    options.createIfMissing &&
    !nextProfile &&
    !isDefaultServerForApiUrl(server)
  ) {
    const profileId = buildUniqueProfileNameForApi(server, profiles);
    const created = await createProfileOnApi(server, profileId);
    nextProfile = created.profile?.id || profileId;
    nextProfiles = created.profiles || profiles;
  }

  if ((server.apiProfile || '') !== nextProfile) {
    const updated = updateServer(server.id, { apiProfile: nextProfile });
    return {
      server: updated || { ...server, apiProfile: nextProfile },
      profiles: nextProfiles,
      activeProfile: response.active,
      changed: true,
    };
  }

  return {
    server,
    profiles: nextProfiles,
    activeProfile: response.active,
    changed: false,
  };
}
