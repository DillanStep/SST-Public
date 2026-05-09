import type { LifeEvent, PlayerData } from '../../types';

function parseKillerFromCause(causeOfDeath?: string): string | null {
  if (!causeOfDeath) return null;
  const match = causeOfDeath.match(/^Player:\s*.*?\s*\(([^)]+)\)/i);
  return match?.[1]?.trim() || null;
}

function getKillerId(event: LifeEvent): string | null {
  return event.targetPlayerId || parseKillerFromCause(event.causeOfDeath);
}

export function getCombatReviewCount(playerId: string, allPlayers?: Record<string, PlayerData>): number {
  if (!allPlayers) return 0;

  return Object.entries(allPlayers).reduce((total, [victimId, playerData]) => {
    if (victimId === playerId) return total;

    const kills = (playerData.lifeEvents?.events || []).filter(event => (
      event.eventType === 'DIED' && getKillerId(event) === playerId
    ));

    return total + kills.length;
  }, 0);
}
