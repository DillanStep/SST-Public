import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Car,
  Clock,
  Crown,
  DollarSign,
  Package,
  RefreshCw,
  Skull,
  Trophy,
  Users,
  Wifi,
  Zap,
} from 'lucide-react';
import { Card, Button, Badge } from '../ui';
import { getLeaderboard } from '../../services/api';
import type { LeaderboardKey, LeaderboardPlayer, PlayerLeaderboardResponse } from '../../types';

interface PlayerLeaderboardProps {
  isConnected: boolean;
}

interface CategoryConfig {
  key: LeaderboardKey;
  label: string;
  metricLabel: string;
  icon: React.ReactNode;
  value: (player: LeaderboardPlayer) => number;
  format?: (value: number) => string;
}

const numberFormatter = new Intl.NumberFormat();
const moneyFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

function formatDuration(seconds: number): string {
  if (!seconds || seconds < 0) return '0m';

  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${Math.max(minutes, 1)}m`;
}

function formatNumber(value: number): string {
  return numberFormatter.format(Math.round(value || 0));
}

function formatMoney(value: number): string {
  const prefix = value < 0 ? '-' : '';
  return `${prefix}${moneyFormatter.format(Math.abs(Math.round(value || 0)))}`;
}

function formatTimeAgo(timestamp: string | null): string {
  if (!timestamp) return 'Never';

  const then = new Date(timestamp).getTime();
  if (!Number.isFinite(then)) return 'Unknown';

  const diffSeconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  const days = Math.floor(diffSeconds / 86400);
  const hours = Math.floor((diffSeconds % 86400) / 3600);
  const minutes = Math.floor((diffSeconds % 3600) / 60);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'Just now';
}

const CATEGORIES: CategoryConfig[] = [
  {
    key: 'overall',
    label: 'Overall',
    metricLabel: 'Score',
    icon: <Trophy size={16} />,
    value: player => player.score,
    format: formatNumber,
  },
  {
    key: 'kills',
    label: 'Kills',
    metricLabel: 'Kills',
    icon: <Zap size={16} />,
    value: player => player.kills,
    format: formatNumber,
  },
  {
    key: 'deaths',
    label: 'Deaths',
    metricLabel: 'Deaths',
    icon: <Skull size={16} />,
    value: player => player.deaths,
    format: formatNumber,
  },
  {
    key: 'playTime',
    label: 'Playtime',
    metricLabel: 'Playtime',
    icon: <Clock size={16} />,
    value: player => player.playTimeSeconds,
    format: formatDuration,
  },
  {
    key: 'longestLife',
    label: 'Survival',
    metricLabel: 'Best Life',
    icon: <Activity size={16} />,
    value: player => player.longestLifeSeconds,
    format: formatDuration,
  },
  {
    key: 'loot',
    label: 'Loot',
    metricLabel: 'Picked Up',
    icon: <Package size={16} />,
    value: player => player.itemsPickedUp,
    format: formatNumber,
  },
  {
    key: 'trades',
    label: 'Trades',
    metricLabel: 'Trades',
    icon: <DollarSign size={16} />,
    value: player => player.tradeCount,
    format: formatNumber,
  },
  {
    key: 'wealth',
    label: 'Profit',
    metricLabel: 'Net Trade',
    icon: <Crown size={16} />,
    value: player => player.netTrade,
    format: formatMoney,
  },
  {
    key: 'vehicles',
    label: 'Vehicles',
    metricLabel: 'Vehicles',
    icon: <Car size={16} />,
    value: player => player.totalVehicles,
    format: formatNumber,
  },
  {
    key: 'online',
    label: 'Online',
    metricLabel: 'Session',
    icon: <Wifi size={16} />,
    value: player => player.currentSessionSeconds,
    format: formatDuration,
  },
];

export const PlayerLeaderboard: React.FC<PlayerLeaderboardProps> = ({ isConnected }) => {
  const [leaderboard, setLeaderboard] = useState<PlayerLeaderboardResponse | null>(null);
  const [activeCategory, setActiveCategory] = useState<LeaderboardKey>('overall');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeConfig = useMemo(
    () => CATEGORIES.find(category => category.key === activeCategory) || CATEGORIES[0],
    [activeCategory]
  );

  const rows = useMemo(
    () => leaderboard?.leaderboards?.[activeCategory] || [],
    [leaderboard, activeCategory]
  );

  const loadLeaderboard = useCallback(async () => {
    if (!isConnected) return;

    setLoading(true);
    setError(null);

    try {
      const data = await getLeaderboard(50);
      setLeaderboard(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load leaderboard');
    } finally {
      setLoading(false);
    }
  }, [isConnected]);

  useEffect(() => {
    if (isConnected) {
      loadLeaderboard();
    }
  }, [isConnected, loadLeaderboard]);

  useEffect(() => {
    if (!isConnected) return;

    const interval = window.setInterval(() => {
      loadLeaderboard();
    }, 30000);

    return () => window.clearInterval(interval);
  }, [isConnected, loadLeaderboard]);

  if (!isConnected) {
    return (
      <Card compact title="Leaderboard" icon={<Trophy size={20} />}>
        <p className="text-surface-500">Connect to the API to view the leaderboard.</p>
      </Card>
    );
  }

  return (
    <Card
      compact
      title="Leaderboard"
      icon={<Trophy size={20} />}
      actions={
        <Button
          variant="secondary"
          size="sm"
          onClick={loadLeaderboard}
          loading={loading}
          icon={<RefreshCw size={14} />}
        >
          Refresh
        </Button>
      }
    >
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {leaderboard && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <div className="rounded-lg border border-surface-200 bg-surface-50 p-3">
              <div className="flex items-center gap-2 text-xs text-surface-500">
                <Users size={14} />
                Players
              </div>
              <div className="mt-1 text-xl font-bold text-surface-900">{formatNumber(leaderboard.playerCount)}</div>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <div className="flex items-center gap-2 text-xs text-emerald-700">
                <Wifi size={14} />
                Online
              </div>
              <div className="mt-1 text-xl font-bold text-emerald-900">{formatNumber(leaderboard.summary.onlineCount)}</div>
            </div>
            <div className="rounded-lg border border-surface-200 bg-white p-3">
              <div className="flex items-center gap-2 text-xs text-surface-500">
                <Zap size={14} />
                Kills
              </div>
              <div className="mt-1 text-xl font-bold text-surface-900">{formatNumber(leaderboard.summary.totalKills)}</div>
            </div>
            <div className="rounded-lg border border-red-200 bg-red-50 p-3">
              <div className="flex items-center gap-2 text-xs text-red-700">
                <Skull size={14} />
                Deaths
              </div>
              <div className="mt-1 text-xl font-bold text-red-900">{formatNumber(leaderboard.summary.totalDeaths)}</div>
            </div>
            <div className="rounded-lg border border-surface-200 bg-white p-3">
              <div className="flex items-center gap-2 text-xs text-surface-500">
                <Package size={14} />
                Item Events
              </div>
              <div className="mt-1 text-xl font-bold text-surface-900">{formatNumber(leaderboard.summary.totalItemEvents)}</div>
            </div>
            <div className="rounded-lg border border-surface-200 bg-white p-3">
              <div className="flex items-center gap-2 text-xs text-surface-500">
                <Car size={14} />
                Vehicles
              </div>
              <div className="mt-1 text-xl font-bold text-surface-900">{formatNumber(leaderboard.summary.totalVehicles)}</div>
            </div>
          </div>

          <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
            {CATEGORIES.map(category => (
              <button
                key={category.key}
                type="button"
                onClick={() => setActiveCategory(category.key)}
                className={`inline-flex flex-shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-all ${
                  activeCategory === category.key
                    ? 'border-surface-800 bg-surface-800 text-white shadow-sm'
                    : 'border-surface-200 bg-white text-surface-600 hover:border-surface-300 hover:bg-surface-50'
                }`}
              >
                {category.icon}
                {category.label}
              </button>
            ))}
          </div>

          <div className="mt-5 overflow-hidden rounded-lg border border-surface-200">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-surface-200">
                <thead className="bg-surface-50">
                  <tr>
                    <th className="w-16 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-surface-500">Rank</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-surface-500">Player</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-surface-500">{activeConfig.metricLabel}</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-surface-500">K/D</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-surface-500">Playtime</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-surface-500">Loot</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-surface-500">Trades</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-surface-500">Vehicles</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-surface-500">Last Seen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100 bg-white">
                  {rows.map((player, index) => (
                    <tr key={`${player.playerId}-${activeCategory}`} className="hover:bg-surface-50">
                      <td className="px-4 py-3">
                        <span className={`inline-flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold ${
                          index === 0
                            ? 'bg-amber-100 text-amber-800'
                            : index === 1
                              ? 'bg-surface-200 text-surface-700'
                              : index === 2
                                ? 'bg-orange-100 text-orange-800'
                                : 'bg-surface-100 text-surface-600'
                        }`}>
                          {index + 1}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex min-w-48 flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-surface-900">{player.playerName}</span>
                            {player.isOnline && <Badge variant="success">Online</Badge>}
                          </div>
                          <code className="text-[11px] text-surface-400">{player.playerId}</code>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-base font-bold text-surface-900">
                          {(activeConfig.format || formatNumber)(activeConfig.value(player))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-surface-700">
                        <span className="font-medium">{player.kills}</span>
                        <span className="text-surface-400"> / </span>
                        <span>{player.deaths}</span>
                        <span className="ml-2 text-xs text-surface-400">{player.kdRatio.toFixed(2)}</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-surface-700">{formatDuration(player.playTimeSeconds)}</td>
                      <td className="px-4 py-3 text-sm text-surface-700">
                        <span className="font-medium">{formatNumber(player.itemsPickedUp)}</span>
                        <span className="ml-1 text-xs text-surface-400">picked</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-surface-700">
                        <div>{formatNumber(player.tradeCount)}</div>
                        <div className={`text-xs ${player.netTrade >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {formatMoney(player.netTrade)}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-surface-700">
                        <div>{formatNumber(player.totalVehicles)}</div>
                        <div className="text-xs text-surface-400">{formatNumber(player.activeVehicles)} active</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-surface-600">{player.isOnline ? 'Now' : formatTimeAgo(player.lastSeenAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {rows.length === 0 && !loading && (
              <div className="px-4 py-10 text-center text-sm text-surface-500">
                No leaderboard data found.
              </div>
            )}
          </div>
        </>
      )}

      {!leaderboard && !error && (
        <div className="py-12 text-center text-sm text-surface-500">
          {loading ? 'Loading leaderboard...' : 'No leaderboard data loaded.'}
        </div>
      )}
    </Card>
  );
};

export default PlayerLeaderboard;
