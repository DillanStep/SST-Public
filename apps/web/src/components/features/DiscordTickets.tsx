import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  ExternalLink,
  History,
  LifeBuoy,
  Lock,
  MapPin,
  Megaphone,
  MessageSquare,
  Package,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  ShoppingCart,
  Skull,
  UserCheck,
  Wallet,
  XCircle,
} from 'lucide-react';
import { Badge, Button, Card } from '../ui';
import api from '../../services/api';
import type { DiscordBotStatus, DiscordTicket, DiscordTicketMessage, DiscordTicketPanel, DiscordTicketStats } from '../../types';

interface DiscordTicketsProps {
  isConnected: boolean;
}

type TicketFilter = 'open' | 'closed' | 'all';

const statusVariant = (status: DiscordBotStatus['status']) => {
  if (status === 'ready') return 'success';
  if (status === 'error' || status === 'misconfigured') return 'error';
  if (status === 'starting') return 'warning';
  return 'default';
};

const isOpenTicket = (status?: DiscordTicket['status']) => status === 'open' || status === 'in_progress';

const formatTicketStatus = (status: DiscordTicket['status']) => {
  if (status === 'in_progress') return 'in progress';
  return status;
};

const ticketStatusVariant = (status: DiscordTicket['status']) => {
  if (status === 'open') return 'success';
  if (status === 'in_progress') return 'warning';
  if (status === 'resolved') return 'info';
  return 'default';
};

const formatDateTime = (value?: string) => {
  if (!value) return 'Never';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

const formatMoney = (value?: number | null) => {
  if (typeof value !== 'number' || Number.isNaN(value)) return 'Unknown';
  return `$${value.toLocaleString()}`;
};

const formatCount = (value?: number | null) => {
  if (typeof value !== 'number' || Number.isNaN(value)) return '0';
  return value.toLocaleString();
};

const formatMetric = (value?: number | null) => {
  if (typeof value !== 'number' || Number.isNaN(value)) return 'Unknown';
  return value.toLocaleString();
};

const formatPosition = (position?: { x: number; y: number; z: number } | null) => {
  if (!position) return 'No position';
  return `${Math.round(position.x)}, ${Math.round(position.y)}, ${Math.round(position.z)}`;
};

const eventSummary = (event: { type?: string; item?: string; target?: string; trader?: string; reason?: string; amount?: number | null; price?: number | null; balance?: number | null }) => {
  const primary = [event.type, event.item || event.reason || event.target || event.trader].filter(Boolean).join(' · ');
  const money = typeof event.amount === 'number'
    ? `${event.amount > 0 ? '+' : ''}${formatMoney(event.amount)}`
    : typeof event.price === 'number'
      ? formatMoney(event.price)
      : typeof event.balance === 'number'
        ? formatMoney(event.balance)
        : '';
  return [primary || 'Event', money].filter(Boolean).join(' ');
};

const ticketTitle = (ticket: DiscordTicket) => {
  return ticket.subject || `Ticket #${String(ticket.id).padStart(4, '0')}`;
};

const filterOptions: { id: TicketFilter; label: string }[] = [
  { id: 'open', label: 'Open' },
  { id: 'closed', label: 'Closed' },
  { id: 'all', label: 'All' },
];

export const DiscordTickets: React.FC<DiscordTicketsProps> = ({ isConnected }) => {
  const [filter, setFilter] = useState<TicketFilter>('open');
  const [tickets, setTickets] = useState<DiscordTicket[]>([]);
  const [stats, setStats] = useState<DiscordTicketStats>({ total: 0, open: 0, closed: 0 });
  const [bot, setBot] = useState<DiscordBotStatus | null>(null);
  const [panel, setPanel] = useState<DiscordTicketPanel | null>(null);
  const [selectedId, setSelectedId] = useState<DiscordTicket['id'] | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<DiscordTicket | null>(null);
  const [messages, setMessages] = useState<DiscordTicketMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState('');
  const [error, setError] = useState('');
  const [reply, setReply] = useState('');
  const [closeReason, setCloseReason] = useState('');
  const [search, setSearch] = useState('');

  const selectedTicketId = selectedTicket?.id ?? selectedId;

  const loadTickets = useCallback(async () => {
    if (!isConnected) return;

    setLoading(true);
    setError('');

    try {
      const response = await api.getDiscordTickets({ status: filter, limit: 200 });
      setTickets(response.tickets || []);
      setStats(response.stats || { total: 0, open: 0, closed: 0 });
      setBot(response.bot);
      setPanel(response.panel || response.bot?.panel || null);

      if (!selectedId && response.tickets?.length) {
        setSelectedId(response.tickets[0].id);
      }

      if (selectedId && !response.tickets?.some((ticket) => ticket.id === selectedId)) {
        setSelectedId(response.tickets?.[0]?.id || null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load support tickets');
    } finally {
      setLoading(false);
    }
  }, [filter, isConnected, selectedId]);

  const loadTicket = useCallback(async (ticketId: DiscordTicket['id']) => {
    setDetailLoading(true);
    setError('');

    try {
      const response = await api.getDiscordTicket(ticketId);
      setSelectedTicket(response.ticket);
      setMessages(response.messages || []);
      if (response.bot) setBot(response.bot);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load ticket');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTickets();
  }, [loadTickets]);

  useEffect(() => {
    if (selectedId) {
      void loadTicket(selectedId);
    } else {
      setSelectedTicket(null);
      setMessages([]);
    }
  }, [loadTicket, selectedId]);

  const filteredTickets = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return tickets;

    return tickets.filter((ticket) => {
      return [
        ticket.subject,
        ticket.steamId,
        ticket.playerName,
        ticket.discordUsername,
        ticket.playerMatch?.playerName,
        ticket.externalId,
        ticket.sourceLabel,
        ticket.body,
      ].some((value) => String(value || '').toLowerCase().includes(query));
    });
  }, [search, tickets]);

  const applyActionResult = (ticket: DiscordTicket, nextMessages: DiscordTicketMessage[]) => {
    setSelectedTicket(ticket);
    setMessages(nextMessages);
    setTickets((current) => current.map((item) => item.id === ticket.id ? ticket : item));
  };

  const handleReply = async () => {
    if (!selectedTicketId || !reply.trim()) return;

    setActionLoading('reply');
    setError('');

    try {
      const response = await api.replyDiscordTicket(selectedTicketId, reply.trim());
      applyActionResult(response.ticket, response.messages);
      setReply('');
      void loadTickets();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send reply');
    } finally {
      setActionLoading('');
    }
  };

  const handleClaim = async () => {
    if (!selectedTicketId) return;

    setActionLoading('claim');
    setError('');

    try {
      const response = await api.claimDiscordTicket(selectedTicketId);
      applyActionResult(response.ticket, response.messages);
      void loadTickets();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to claim ticket');
    } finally {
      setActionLoading('');
    }
  };

  const handleClose = async () => {
    if (!selectedTicketId) return;

    setActionLoading('close');
    setError('');

    try {
      const response = await api.closeDiscordTicket(selectedTicketId, closeReason.trim() || 'Closed from SST dashboard');
      applyActionResult(response.ticket, response.messages);
      setCloseReason('');
      void loadTickets();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to close ticket');
    } finally {
      setActionLoading('');
    }
  };

  const handlePublishPanel = async () => {
    setActionLoading('panel');
    setError('');

    try {
      const response = await api.publishDiscordTicketPanel();
      setPanel(response.panel);
      setBot(response.bot);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to publish ticket panel');
    } finally {
      setActionLoading('');
    }
  };

  if (!isConnected) {
    return (
      <Card>
        <div className="py-16 text-center">
          <LifeBuoy size={44} className="mx-auto mb-4 text-surface-300" />
          <p className="text-surface-500">Connect to the API to manage support tickets.</p>
        </div>
      </Card>
    );
  }

  const botStatus = bot?.status || 'disabled';
  const botMissing = bot?.missing || [];
  const playerContext = selectedTicket?.playerContext;
  const selectedPlayerName = playerContext?.playerName || selectedTicket?.playerMatch?.playerName || selectedTicket?.playerName || '';
  const selectedPlayerMatched = Boolean(playerContext?.matched || selectedTicket?.playerMatch?.matched);
  const playerOnline = playerContext?.online;
  const playerBank = playerContext?.bank;
  const recentPlayerActivity = [
    ...(playerContext?.lifeEvents?.recent || []).map((event) => ({ ...event, source: 'Life' })),
    ...(playerContext?.itemEvents?.recent || []).map((event) => ({ ...event, source: 'Items' })),
    ...(playerContext?.trades?.recent || []).map((event) => ({ ...event, source: 'Trade' })),
    ...(playerContext?.bank?.recentHistory || []).map((event) => ({ ...event, source: 'Bank' })),
  ]
    .sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime())
    .slice(0, 8);

  return (
    <div className="space-y-5">
      <Card
        title="Support Tickets"
        icon={<LifeBuoy size={18} />}
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              icon={<Megaphone size={14} />}
              loading={actionLoading === 'panel'}
              disabled={botStatus !== 'ready'}
              onClick={handlePublishPanel}
            >
              Publish Panel
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<RefreshCw size={14} />}
              loading={loading}
              onClick={() => void loadTickets()}
            >
              Refresh
            </Button>
          </>
        }
      >
        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-surface-200 bg-surface-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-surface-600">Bot</span>
              <Badge variant={statusVariant(botStatus)}>{botStatus}</Badge>
            </div>
            <div className="mt-2 text-lg font-semibold text-surface-900">{bot?.userTag || bot?.commandName || 'Not connected'}</div>
          </div>
          <div className="rounded-xl border border-surface-200 bg-surface-50 p-4">
            <div className="text-sm font-medium text-surface-600">Open Tickets</div>
            <div className="mt-2 text-2xl font-semibold text-surface-900">{stats.open}</div>
            {stats.sources && (
              <div className="mt-1 text-xs text-surface-500">
                Discord {stats.sources.discord.open} · In-game {stats.sources.game.open}
              </div>
            )}
          </div>
          <div className="rounded-xl border border-surface-200 bg-surface-50 p-4">
            <div className="text-sm font-medium text-surface-600">Closed Tickets</div>
            <div className="mt-2 text-2xl font-semibold text-surface-900">{stats.closed}</div>
            {stats.sources && (
              <div className="mt-1 text-xs text-surface-500">
                Discord {stats.sources.discord.closed} · In-game {stats.sources.game.closed}
              </div>
            )}
          </div>
          <div className="rounded-xl border border-surface-200 bg-surface-50 p-4">
            <div className="text-sm font-medium text-surface-600">Raise Ticket Panel</div>
            <div className="mt-2 truncate font-mono text-sm font-semibold text-surface-900">
              {panel?.channelId || bot?.panelChannelId || 'Set channel ID'}
            </div>
          </div>
        </div>

        {panel && (
          <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">
            Ticket panel is published in channel <span className="font-mono">{panel.channelId}</span>.
          </div>
        )}

        {botMissing.length > 0 && (
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            <ShieldAlert size={18} className="mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-semibold">Discord setup is incomplete</div>
              <div className="mt-1">Missing: {botMissing.join(', ')}. Add these in Settings, then restart the API.</div>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <XCircle size={16} />
            {error}
          </div>
        )}
      </Card>

      <div className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
        <Card compact>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {filterOptions.map((option) => (
              <button
                key={option.id}
                onClick={() => {
                  setFilter(option.id);
                  setSelectedId(null);
                }}
                className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
                  filter === option.id
                    ? 'bg-surface-800 text-white'
                    : 'bg-surface-100 text-surface-600 hover:bg-surface-200'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="relative mb-4">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search Steam ID, player, source, or subject"
              className="w-full rounded-xl border border-surface-200 bg-surface-50 py-2.5 pl-10 pr-3 text-sm outline-none transition focus:border-surface-400 focus:bg-white focus:ring-2 focus:ring-surface-200"
            />
          </div>

          <div className="max-h-[660px] space-y-2 overflow-y-auto pr-1">
            {loading && (
              <div className="flex items-center justify-center py-10 text-surface-500">
                <RefreshCw size={18} className="mr-2 animate-spin" />
                Loading tickets...
              </div>
            )}

            {!loading && filteredTickets.length === 0 && (
              <div className="rounded-xl border border-dashed border-surface-200 p-8 text-center text-sm text-surface-500">
                No tickets found.
              </div>
            )}

            {!loading && filteredTickets.map((ticket) => (
              <button
                key={ticket.id}
                onClick={() => setSelectedId(ticket.id)}
                className={`w-full rounded-xl border p-4 text-left transition ${
                  selectedTicketId === ticket.id
                    ? 'border-surface-500 bg-surface-100'
                    : 'border-surface-200 bg-white hover:bg-surface-50'
                }`}
              >
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-surface-900">{ticketTitle(ticket)}</div>
                    <div className="mt-1 truncate font-mono text-xs text-surface-500">{ticket.steamId}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge variant={ticketStatusVariant(ticket.status)}>{formatTicketStatus(ticket.status)}</Badge>
                    <Badge variant={ticket.source === 'game' ? 'info' : 'default'}>{ticket.sourceLabel || 'Discord'}</Badge>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3 text-xs text-surface-500">
                  <span className="truncate">{ticket.playerMatch?.playerName || ticket.playerName || ticket.discordUsername || 'Unknown player'}</span>
                  <span>{ticket.messageCount} msgs</span>
                </div>
              </button>
            ))}
          </div>
        </Card>

        <Card compact>
          {!selectedTicket && (
            <div className="flex min-h-[620px] flex-col items-center justify-center text-center text-surface-500">
              <MessageSquare size={44} className="mb-4 text-surface-300" />
              <p>Select a ticket to view the Steam ID, linked player, and conversation.</p>
            </div>
          )}

          {selectedTicket && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-surface-100 pb-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-semibold text-surface-900">{ticketTitle(selectedTicket)}</h2>
                    <Badge variant={ticketStatusVariant(selectedTicket.status)}>{formatTicketStatus(selectedTicket.status)}</Badge>
                    <Badge variant={selectedTicket.source === 'game' ? 'info' : 'default'}>{selectedTicket.sourceLabel || 'Discord'}</Badge>
                    {selectedTicket.claimedByName && <Badge variant="info">Claimed by {selectedTicket.claimedByName}</Badge>}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-surface-500">
                    <span className="rounded-lg bg-surface-100 px-2 py-1 font-mono">Steam {selectedTicket.steamId}</span>
                    {selectedTicket.discordUsername || selectedTicket.discordUserId ? (
                      <span className="rounded-lg bg-surface-100 px-2 py-1">Discord {selectedTicket.discordUsername || selectedTicket.discordUserId}</span>
                    ) : null}
                    {selectedTicket.externalId ? (
                      <span className="rounded-lg bg-surface-100 px-2 py-1">Ticket {selectedTicket.externalId}</span>
                    ) : null}
                    <span className="rounded-lg bg-surface-100 px-2 py-1">Created {formatDateTime(selectedTicket.createdAt)}</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<RefreshCw size={14} />}
                    loading={detailLoading}
                    onClick={() => selectedTicketId && void loadTicket(selectedTicketId)}
                  >
                    Reload
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<UserCheck size={14} />}
                    loading={actionLoading === 'claim'}
                    disabled={selectedTicket.status !== 'open'}
                    onClick={handleClaim}
                  >
                    Claim
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 lg:grid-cols-3">
                <div className="rounded-xl border border-surface-200 bg-surface-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-surface-500">Server player</div>
                  <div className="mt-2 flex items-center gap-2">
                    {selectedPlayerMatched ? <CheckCircle2 size={16} className="text-green-600" /> : <ShieldAlert size={16} className="text-amber-600" />}
                    <span className="font-semibold text-surface-900">{selectedPlayerName || 'No match found'}</span>
                  </div>
                  <div className="mt-1 text-xs text-surface-500">
                    {selectedPlayerMatched ? `Matched from ${selectedTicket.playerMatch?.source || 'server data'}` : 'Steam ID is stored, but no server files match it yet.'}
                  </div>
                </div>
                <div className="rounded-xl border border-surface-200 bg-surface-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-surface-500">
                    {selectedTicket.source === 'game' ? 'Source' : 'Channel'}
                  </div>
                  <div className="mt-2 flex items-center gap-2 font-mono text-sm text-surface-900">
                    <ExternalLink size={15} className="text-surface-400" />
                    {selectedTicket.source === 'game'
                      ? selectedTicket.sourceFile || selectedTicket.externalId || 'In-game ticket'
                      : selectedTicket.channelId || 'Pending'}
                  </div>
                </div>
                <div className="rounded-xl border border-surface-200 bg-surface-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-surface-500">Last update</div>
                  <div className="mt-2 text-sm font-semibold text-surface-900">{formatDateTime(selectedTicket.updatedAt)}</div>
                </div>
              </div>

              {playerContext && (
                <div className="rounded-xl border border-surface-200 bg-white">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-surface-100 px-4 py-3">
                    <div>
                      <div className="text-sm font-semibold text-surface-900">Player snapshot</div>
                      <div className="mt-1 text-xs text-surface-500">
                        Pulled from Steam ID {playerContext.steamId}
                        {playerContext.biId ? <span> · BI {playerContext.biId}</span> : null}
                      </div>
                    </div>
                    {playerOnline?.isStale ? (
                      <Badge variant="warning">heartbeat stale</Badge>
                    ) : (
                      <Badge variant={playerOnline?.isOnline ? 'success' : 'default'}>
                        {playerOnline?.isOnline ? 'online' : 'offline'}
                      </Badge>
                    )}
                  </div>

                  <div className="grid gap-px bg-surface-100 md:grid-cols-2 xl:grid-cols-4">
                    <div className="bg-white p-4">
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-surface-500">
                        <Activity size={14} />
                        Status
                      </div>
                      <div className="mt-3 text-lg font-semibold text-surface-900">
                        {playerOnline?.isOnline ? 'Online now' : playerOnline?.found ? 'Offline' : 'Not in heartbeat'}
                      </div>
                      <div className="mt-1 text-xs text-surface-500">
                        Health {formatMetric(playerOnline?.health)} · Blood {formatMetric(playerOnline?.blood)}
                      </div>
                    </div>

                    <div className="bg-white p-4">
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-surface-500">
                        <MapPin size={14} />
                        Last position
                      </div>
                      <div className="mt-3 font-mono text-lg font-semibold text-surface-900">
                        {formatPosition(playerOnline?.position)}
                      </div>
                      <div className="mt-1 text-xs text-surface-500">
                        Updated {formatDateTime(playerOnline?.lastUpdate || playerOnline?.sourceUpdatedAt || playerContext.inventory?.updatedAt || undefined)}
                      </div>
                    </div>

                    <div className="bg-white p-4">
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-surface-500">
                        <Package size={14} />
                        Inventory
                      </div>
                      <div className="mt-3 text-lg font-semibold text-surface-900">
                        {formatCount(playerContext.inventory?.itemCount)} items
                      </div>
                      <div className="mt-1 text-xs text-surface-500">
                        {formatCount(playerContext.inventory?.equippedCount)} equipped slots
                      </div>
                    </div>

                    <div className="bg-white p-4">
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-surface-500">
                        <Wallet size={14} />
                        Bank
                      </div>
                      <div className="mt-3 text-lg font-semibold text-surface-900">
                        {playerBank?.enabled ? formatMoney(playerBank.account?.balance) : 'Expansion off'}
                      </div>
                      <div className="mt-1 text-xs text-surface-500">
                        {playerBank?.account ? `${formatCount(playerBank.historyCount)} balance changes` : playerBank?.error || 'No ATM account matched'}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                    <div>
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-sm font-semibold text-surface-900">
                          <History size={15} />
                          Recent player activity
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs text-surface-500">
                          <span>{formatCount(playerContext.lifeEvents?.count)} life</span>
                          <span>{formatCount(playerContext.itemEvents?.count)} item</span>
                          <span>{formatCount(playerContext.trades?.count)} trades</span>
                        </div>
                      </div>

                      {recentPlayerActivity.length > 0 ? (
                        <div className="space-y-2">
                          {recentPlayerActivity.map((event, index) => (
                            <div key={`${event.source}-${event.timestamp}-${index}`} className="flex items-start justify-between gap-3 rounded-lg border border-surface-100 bg-surface-50 px-3 py-2">
                              <div className="min-w-0">
                                <div className="truncate text-sm font-medium text-surface-800">{eventSummary(event)}</div>
                                <div className="mt-0.5 text-xs text-surface-500">{event.source} · {formatDateTime(event.timestamp)}</div>
                              </div>
                              <Badge variant={event.source === 'Bank' ? 'success' : event.source === 'Life' ? 'warning' : 'default'}>
                                {event.source}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-lg border border-dashed border-surface-200 p-5 text-center text-sm text-surface-500">
                          No recent player activity found for this Steam ID.
                        </div>
                      )}
                    </div>

                    <div className="space-y-4">
                      <div>
                        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-surface-900">
                          <Package size={15} />
                          Inventory sample
                        </div>
                        <div className="space-y-2">
                          {(playerContext.inventory?.sample || []).slice(0, 5).map((item, index) => (
                            <div key={`${item.className}-${index}`} className="rounded-lg border border-surface-100 bg-surface-50 px-3 py-2">
                              <div className="truncate text-sm font-medium text-surface-800">{item.displayName || item.className}</div>
                              <div className="mt-0.5 flex flex-wrap gap-2 text-xs text-surface-500">
                                {item.slotName && <span>{item.slotName}</span>}
                                {typeof item.quantity === 'number' && <span>Qty {formatCount(item.quantity)}</span>}
                                {typeof item.health === 'number' && <span>{Math.round(item.health)}% health</span>}
                              </div>
                            </div>
                          ))}
                          {(playerContext.inventory?.sample || []).length === 0 && (
                            <div className="rounded-lg border border-dashed border-surface-200 p-4 text-center text-sm text-surface-500">
                              No inventory file matched yet.
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-1">
                        <div className="rounded-lg border border-surface-100 bg-surface-50 px-3 py-2">
                          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-surface-500">
                            <Skull size={13} />
                            Deaths
                          </div>
                          <div className="mt-1 text-lg font-semibold text-surface-900">{formatCount(playerContext.lifeEvents?.deaths)}</div>
                        </div>
                        <div className="rounded-lg border border-surface-100 bg-surface-50 px-3 py-2">
                          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-surface-500">
                            <ShoppingCart size={13} />
                            Spent
                          </div>
                          <div className="mt-1 text-lg font-semibold text-surface-900">{formatMoney(playerContext.trades?.totalSpent)}</div>
                        </div>
                        <div className="rounded-lg border border-surface-100 bg-surface-50 px-3 py-2">
                          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-surface-500">
                            <Wallet size={13} />
                            Earned
                          </div>
                          <div className="mt-1 text-lg font-semibold text-surface-900">{formatMoney(playerContext.trades?.totalEarned)}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="max-h-[430px] space-y-3 overflow-y-auto rounded-xl border border-surface-200 bg-surface-50 p-4">
                {messages.length === 0 && (
                  <div className="py-12 text-center text-sm text-surface-500">No messages recorded for this ticket yet.</div>
                )}

                {messages.map((message) => {
                  const isAdmin = message.authorType === 'admin';
                  const isSystem = message.authorType === 'system';

                  return (
                    <div
                      key={message.id}
                      className={`flex ${isAdmin ? 'justify-end' : 'justify-start'}`}
                    >
                      <div className={`max-w-[82%] rounded-xl border px-4 py-3 ${
                        isSystem
                          ? 'border-amber-200 bg-amber-50 text-amber-900'
                          : isAdmin
                            ? 'border-surface-800 bg-surface-800 text-white'
                            : 'border-surface-200 bg-white text-surface-800'
                      }`}
                      >
                        <div className={`mb-1 text-xs font-semibold ${isAdmin ? 'text-surface-200' : 'text-surface-500'}`}>
                          {message.authorName || message.authorType} · {formatDateTime(message.createdAt)}
                        </div>
                        <div className="whitespace-pre-wrap text-sm leading-relaxed">{message.message}</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {isOpenTicket(selectedTicket.status) ? (
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-surface-700">
                      {selectedTicket.source === 'game' ? 'Add admin reply' : 'Reply to Discord'}
                    </label>
                    <div className="flex gap-2">
                      <textarea
                        value={reply}
                        onChange={(event) => setReply(event.target.value)}
                        placeholder="Type an admin reply..."
                        rows={3}
                        className="min-h-[92px] flex-1 rounded-xl border border-surface-200 bg-surface-50 p-3 text-sm outline-none transition focus:border-surface-400 focus:bg-white focus:ring-2 focus:ring-surface-200"
                      />
                      <Button
                        className="self-stretch"
                        icon={<Send size={15} />}
                        loading={actionLoading === 'reply'}
                        disabled={!reply.trim()}
                        onClick={handleReply}
                      >
                        Send
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-surface-700">Close ticket</label>
                    <input
                      value={closeReason}
                      onChange={(event) => setCloseReason(event.target.value)}
                      placeholder="Close reason"
                      className="w-full rounded-xl border border-surface-200 bg-surface-50 px-3 py-2.5 text-sm outline-none transition focus:border-surface-400 focus:bg-white focus:ring-2 focus:ring-surface-200"
                    />
                    <Button
                      variant="danger"
                      className="w-full"
                      icon={<Lock size={15} />}
                      loading={actionLoading === 'close'}
                      onClick={handleClose}
                    >
                      Close Ticket
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-surface-200 bg-surface-50 p-4 text-sm text-surface-600">
                  Closed {formatDateTime(selectedTicket.closedAt)} by {selectedTicket.closedByName || 'unknown'}.
                  {selectedTicket.closeReason && <span> Reason: {selectedTicket.closeReason}</span>}
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default DiscordTickets;
