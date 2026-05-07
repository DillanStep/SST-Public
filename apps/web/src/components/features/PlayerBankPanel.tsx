import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Banknote, CheckCircle2, DollarSign, History, RefreshCw, RotateCw, Save } from 'lucide-react';
import { Button } from '../ui';
import {
  compensateExpansionAtmBalance,
  getExpansionAtmBalances,
  getExpansionAtmHistory,
  getExpansionAtmResults,
  reloadExpansionAtmBalances,
  updateExpansionAtmBalance,
} from '../../services/api';
import type { ExpansionAtmAccount, ExpansionAtmCommand, ExpansionAtmHistoryEntry } from '../../types';

const EMPTY_HISTORY: ExpansionAtmHistoryEntry[] = [];

const formatCurrency = (value: number) => `$${Math.round(value || 0).toLocaleString()}`;

const formatDate = (value?: string | null) => {
  if (!value) return 'Unknown';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleString();
};

const parseWholeNumber = (value: string, label: string, min = 0) => {
  const parsed = Number(value.trim().replace(/,/g, ''));
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < min) {
    throw new Error(`${label} must be a whole number ${min} or higher`);
  }
  return parsed;
};

const bankInputClassName = 'w-full rounded-lg border border-surface-200 bg-white px-3 py-2.5 text-sm text-surface-800 outline-none transition-colors placeholder:text-surface-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-100';

const getCommandTitle = (command: ExpansionAtmCommand) => {
  if (command.commandType === 'compensateAtmBalance') {
    return `Compensated ${formatCurrency(command.amount || 0)}`;
  }

  if (command.commandType === 'setAtmBalance') {
    return `Set balance to ${formatCurrency(command.balance || 0)}`;
  }

  return 'Reloaded bank balances';
};

const getStatusClassName = (status: string) => {
  const normalized = status.toLowerCase();
  if (normalized === 'completed') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (normalized === 'failed') return 'border-red-200 bg-red-50 text-red-700';
  return 'border-amber-200 bg-amber-50 text-amber-700';
};

interface PlayerBankPanelProps {
  steamId: string;
  biId?: string;
  playerName: string;
}

interface BalanceHistoryChartProps {
  account: ExpansionAtmAccount | null;
  history: ExpansionAtmHistoryEntry[];
}

const BalanceHistoryChart: React.FC<BalanceHistoryChartProps> = ({ account, history }) => {
  const points = useMemo(() => {
    const historyPoints = [...history]
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .map(entry => ({
        timestamp: entry.timestamp,
        balance: entry.balance,
      }));

    if (account) {
      const last = historyPoints[historyPoints.length - 1];
      if (!last || last.balance !== account.balance) {
        historyPoints.push({
          timestamp: new Date().toISOString(),
          balance: account.balance,
        });
      }
    }

    return historyPoints;
  }, [account, history]);

  if (!account || points.length < 2) {
    return (
      <div className="flex h-56 items-center justify-center rounded-lg border border-dashed border-surface-200 bg-surface-50 text-sm text-surface-500">
        Balance history will appear after compensations or overrides.
      </div>
    );
  }

  const width = 760;
  const height = 240;
  const padding = { top: 18, right: 18, bottom: 34, left: 74 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const balances = points.map(point => point.balance);
  const minBalance = Math.min(...balances);
  const maxBalance = Math.max(...balances);
  const range = Math.max(1, maxBalance - minBalance);
  const yMin = Math.max(0, minBalance - range * 0.1);
  const yMax = maxBalance + range * 0.1;
  const yRange = Math.max(1, yMax - yMin);

  const xFor = (index: number) => padding.left + (points.length <= 1 ? chartWidth / 2 : (index / (points.length - 1)) * chartWidth);
  const yFor = (balance: number) => padding.top + chartHeight - ((balance - yMin) / yRange) * chartHeight;
  const path = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${xFor(index).toFixed(1)} ${yFor(point.balance).toFixed(1)}`)
    .join(' ');

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[560px] rounded-lg border border-surface-200 bg-white">
        {[0, 0.25, 0.5, 0.75, 1].map(position => {
          const y = padding.top + chartHeight * position;
          const value = yMax - yRange * position;
          return (
            <g key={position}>
              <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="#e5e7eb" strokeWidth="1" />
              <text x={padding.left - 8} y={y + 4} textAnchor="end" className="fill-surface-400 text-[11px]">
                {formatCurrency(value)}
              </text>
            </g>
          );
        })}

        <path d={path} fill="none" stroke="#2563eb" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

        {points.map((point, index) => (
          <g key={`${point.timestamp}-${index}`}>
            <circle cx={xFor(index)} cy={yFor(point.balance)} r="4" fill="#2563eb" />
            {(index === 0 || index === points.length - 1 || index % Math.ceil(points.length / 4) === 0) && (
              <text x={xFor(index)} y={height - 12} textAnchor="middle" className="fill-surface-400 text-[11px]">
                {new Date(point.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
};

export const PlayerBankPanel: React.FC<PlayerBankPanelProps> = ({ steamId, biId, playerName }) => {
  const atmPlayerId = biId || steamId;
  const [account, setAccount] = useState<ExpansionAtmAccount | null>(null);
  const [history, setHistory] = useState<ExpansionAtmHistoryEntry[]>(EMPTY_HISTORY);
  const [results, setResults] = useState<ExpansionAtmCommand[]>([]);
  const [compAmount, setCompAmount] = useState('');
  const [compReason, setCompReason] = useState('');
  const [overrideBalance, setOverrideBalance] = useState('');
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<'compensate' | 'override' | 'reload' | ''>('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const loadResults = useCallback(async () => {
    try {
      const response = await getExpansionAtmResults();
      setResults(response.requests.filter(result => result.playerId === atmPlayerId).slice(-6).reverse());
    } catch {
      setResults([]);
    }
  }, [atmPlayerId]);

  const loadHistory = useCallback(async () => {
    try {
      const response = await getExpansionAtmHistory(atmPlayerId);
      setHistory(response.entries);
    } catch {
      setHistory(EMPTY_HISTORY);
    }
  }, [atmPlayerId]);

  const loadAccount = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const response = await getExpansionAtmBalances();
      const matchedAccount = response.accounts.find(item => (
        item.playerId === atmPlayerId ||
        item.biId === atmPlayerId ||
        item.steamId === steamId ||
        (biId && item.playerId === biId)
      ));

      const nextAccount = matchedAccount || {
        playerId: atmPlayerId,
        biId: atmPlayerId,
        steamId,
        playerName,
        balance: 0,
        fileName: `${atmPlayerId}.json`,
        updatedAt: null,
      };

      setAccount(nextAccount);
      setOverrideBalance(String(nextAccount.balance));
      await Promise.all([loadHistory(), loadResults()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load bank balance');
    } finally {
      setLoading(false);
    }
  }, [atmPlayerId, biId, loadHistory, loadResults, playerName, steamId]);

  useEffect(() => {
    loadAccount();
  }, [loadAccount]);

  const handleCompensate = async () => {
    setActionLoading('compensate');
    setError('');
    setMessage('');

    try {
      const amount = parseWholeNumber(compAmount, 'Compensation amount', 1);
      const reason = compReason.trim();
      if (!reason) throw new Error('Reason is required');

      const response = await compensateExpansionAtmBalance(atmPlayerId, amount, reason);
      setAccount(response.account);
      setOverrideBalance(String(response.account.balance));
      setCompAmount('');
      setCompReason('');
      setMessage(response.message);
      await Promise.all([loadHistory(), loadResults()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to compensate player');
    } finally {
      setActionLoading('');
    }
  };

  const handleOverride = async () => {
    setActionLoading('override');
    setError('');
    setMessage('');

    try {
      const balance = parseWholeNumber(overrideBalance, 'Override balance', 0);
      const response = await updateExpansionAtmBalance(atmPlayerId, balance, true);
      setAccount(response.account);
      setOverrideBalance(String(response.account.balance));
      setMessage(response.message);
      await Promise.all([loadHistory(), loadResults()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to override bank balance');
    } finally {
      setActionLoading('');
    }
  };

  const handleReload = async () => {
    setActionLoading('reload');
    setError('');
    setMessage('');

    try {
      const response = await reloadExpansionAtmBalances();
      setMessage(response.message);
      await loadResults();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to queue bank hot reload');
    } finally {
      setActionLoading('');
    }
  };

  const parsedCompAmount = Number(compAmount.trim().replace(/,/g, ''));
  const compensationPreview = Number.isFinite(parsedCompAmount) && parsedCompAmount > 0
    ? formatCurrency((account?.balance || 0) + parsedCompAmount)
    : null;
  const commandCountLabel = `${results.length.toLocaleString()} recent command${results.length === 1 ? '' : 's'}`;

  return (
    <div className="space-y-5">
      {(error || message) && (
        <div className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm ${
          error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'
        }`}>
          {error ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
          <span>{error || message}</span>
        </div>
      )}

      <section className="overflow-hidden rounded-lg border border-surface-200 bg-white">
        <div className="flex flex-col gap-4 bg-surface-50 p-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-primary-600 ring-1 ring-surface-200">
                <Banknote size={20} />
              </div>
              <div>
                <div className="text-sm font-semibold text-surface-900">Expansion Bank</div>
                <div className="text-xs text-surface-500">Account for {playerName}</div>
              </div>
            </div>
            <div className="mt-4 text-4xl font-bold tracking-tight text-surface-950">
              {loading ? '...' : formatCurrency(account?.balance || 0)}
            </div>
            <div className="mt-1 text-xs text-surface-500">Current player bank balance</div>
          </div>

          <div className="flex flex-wrap gap-2 lg:justify-end">
            <Button variant="secondary" size="sm" onClick={loadAccount} loading={loading} icon={<RefreshCw size={14} />}>
              Refresh
            </Button>
            <Button variant="secondary" size="sm" onClick={handleReload} loading={actionLoading === 'reload'} icon={<RotateCw size={14} />}>
              Hot Reload
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 divide-y divide-surface-100 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <div className="p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-surface-400">Last Loaded</div>
            <div className="mt-1 text-sm font-medium text-surface-800">{formatDate(account?.updatedAt)}</div>
          </div>
          <div className="p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-surface-400">Expansion ATM ID</div>
            <div className="mt-1 break-all font-mono text-xs text-surface-700">{atmPlayerId}</div>
          </div>
          <div className="p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-surface-400">Steam ID</div>
            <div className="mt-1 break-all font-mono text-xs text-surface-700">{steamId}</div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-lg border border-surface-200 bg-white p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-surface-800">
                <Banknote size={16} />
                Compensate Player
              </div>
              <p className="mt-1 text-xs text-surface-500">
                Adds money to the current balance and sends the in-game compensation message.
              </p>
            </div>
            {compensationPreview && (
              <div className="rounded-md bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 ring-1 ring-emerald-100">
                New balance: {compensationPreview}
              </div>
            )}
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-[180px_minmax(0,1fr)_auto]">
            <div className="relative">
              <DollarSign size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
              <input
                type="number"
                min={1}
                value={compAmount}
                onChange={(event) => setCompAmount(event.target.value)}
                placeholder="Amount"
                className={`${bankInputClassName} pl-8`}
              />
            </div>
            <input
              value={compReason}
              onChange={(event) => setCompReason(event.target.value)}
              placeholder="Reason shown in game"
              className={bankInputClassName}
            />
            <Button
              onClick={handleCompensate}
              loading={actionLoading === 'compensate'}
              disabled={!compAmount || !compReason.trim()}
              icon={<Banknote size={16} />}
            >
              Compensate
            </Button>
          </div>
        </section>

        <section className="rounded-lg border border-surface-200 bg-surface-50 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-surface-800">
                <Save size={15} />
                Override Balance
              </div>
              <p className="mt-1 text-xs text-surface-500">Manual correction with immediate hot reload.</p>
            </div>
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
              Manual
            </span>
          </div>

          <div className="mt-4 space-y-3">
            <input
              type="number"
              min={0}
              value={overrideBalance}
              onChange={(event) => setOverrideBalance(event.target.value)}
              className={bankInputClassName}
            />
            <Button
              variant="secondary"
              onClick={handleOverride}
              loading={actionLoading === 'override'}
              disabled={!overrideBalance}
              icon={<RotateCw size={16} />}
              className="w-full"
            >
              Override and Hot Reload
            </Button>
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 gap-4 2xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="rounded-lg border border-surface-200 bg-white p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-surface-800">
              <History size={16} />
              Balance History
            </div>
            <div className="text-xs text-surface-500">{history.length.toLocaleString()} recorded change{history.length === 1 ? '' : 's'}</div>
          </div>
          <BalanceHistoryChart account={account} history={history} />
        </section>

        <section className="rounded-lg border border-surface-200 bg-surface-50 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-surface-800">Recent Commands</div>
            <div className="text-xs text-surface-500">{commandCountLabel}</div>
          </div>

          {results.length > 0 ? (
            <div className="space-y-2">
              {results.map(result => (
                <div key={result.requestId} className="rounded-lg bg-white px-3 py-2.5 text-sm ring-1 ring-surface-200">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-surface-800">{getCommandTitle(result)}</div>
                      <div className="mt-1 text-xs text-surface-500">{formatDate(result.requestedAt)}</div>
                    </div>
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${getStatusClassName(result.status)}`}>
                      {result.status}
                    </span>
                  </div>
                  {result.result && (
                    <div className="mt-2 rounded-md bg-surface-50 px-2 py-1 text-xs text-surface-500">
                      {result.result}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex h-36 items-center justify-center rounded-lg border border-dashed border-surface-200 bg-white text-center text-sm text-surface-500">
              Bank commands will appear here after an override, compensation, or hot reload.
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default PlayerBankPanel;
