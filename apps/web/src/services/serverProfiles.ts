import type { ServerConfig } from '../types';
import { updateServer } from './serverManager';

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

export async function resolveServerProfile(server: ServerConfig): Promise<ResolvedServerProfile> {
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
  const inferredProfile = inferApiProfile(
    ignoreSavedProfile ? { ...server, apiProfile: '' } : server,
    profiles
  );
  const nextProfile = inferredProfile ?? server.apiProfile ?? '';

  if ((server.apiProfile || '') !== nextProfile) {
    const updated = updateServer(server.id, { apiProfile: nextProfile });
    return {
      server: updated || { ...server, apiProfile: nextProfile },
      profiles,
      activeProfile: response.active,
      changed: true,
    };
  }

  return {
    server,
    profiles,
    activeProfile: response.active,
    changed: false,
  };
}
