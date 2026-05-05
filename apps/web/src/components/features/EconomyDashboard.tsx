import React, { useState, useEffect, useCallback } from 'react';
import { 
  TrendingUp, DollarSign, ShoppingCart, Package, 
  RefreshCw, Activity, BarChart3, Clock, ArrowUp, ArrowDown,
  Store, MapPin, Zap, AlertTriangle, CheckCircle, Info, Tag, Check, X,
  Calendar, Filter
} from 'lucide-react';
import { Card, Button } from '../ui';
import { getEconomyStats, applyPriceChange, applyPriceChangesBulk } from '../../services/api';
import type {
  EconomyDailyTrendPoint,
  EconomyForecastPoint,
  EconomyItemForecast,
  EconomyResponse,
  PriceRecommendation,
  EconomyFilterPeriod,
  EconomyFilterParams,
} from '../../types';

interface EconomyDashboardProps {
  isConnected: boolean;
}

// Format currency
const formatCurrency = (value: number): string => {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}K`;
  return `$${value.toLocaleString()}`;
};

// Format time ago
const formatTimeAgo = (timestamp: string): string => {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  
  if (diffDay > 0) return `${diffDay}d ago`;
  if (diffHour > 0) return `${diffHour}h ago`;
  if (diffMin > 0) return `${diffMin}m ago`;
  return 'Just now';
};

// Economy health color
const getHealthColor = (health: number): string => {
  if (health >= 75) return 'text-green-600';
  if (health >= 50) return 'text-yellow-600';
  if (health >= 25) return 'text-orange-600';
  return 'text-red-600';
};

const getHealthBg = (health: number): string => {
  if (health >= 75) return 'bg-green-500';
  if (health >= 50) return 'bg-yellow-500';
  if (health >= 25) return 'bg-orange-500';
  return 'bg-red-500';
};

const getHealthLabel = (health: number): string => {
  if (health >= 75) return 'Healthy';
  if (health >= 50) return 'Stable';
  if (health >= 25) return 'Declining';
  return 'Critical';
};

const formatCompact = (value: number): string => {
  const abs = Math.abs(value || 0);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1000000) return `${sign}${(abs / 1000000).toFixed(1)}M`;
  if (abs >= 1000) return `${sign}${(abs / 1000).toFixed(1)}K`;
  return `${Math.round(value || 0)}`;
};

const formatChartDate = (date: string): string => {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

interface LineSeries<T> {
  label: string;
  color: string;
  getValue: (point: T) => number | null | undefined;
  dashed?: boolean;
}

interface LineChartProps<T extends { date: string }> {
  points: T[];
  series: LineSeries<T>[];
  height?: number;
  yFormatter?: (value: number) => string;
}

interface ForecastChartPoint {
  date: string;
  actualNetFlow?: number;
  predictedNetFlow?: number;
  actualTransactions?: number;
  predictedTransactions?: number;
}

function LineChart<T extends { date: string }>({
  points,
  series,
  height = 220,
  yFormatter = formatCompact,
}: LineChartProps<T>) {
  const width = 720;
  const padding = { top: 16, right: 18, bottom: 32, left: 54 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const values = points
    .flatMap(point => series.map(item => item.getValue(point)))
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const rawMin = Math.min(0, ...values);
  const rawMax = Math.max(1, ...values);
  const range = rawMax - rawMin || 1;

  const xFor = (index: number) => (
    padding.left + (points.length <= 1 ? chartWidth / 2 : (index / (points.length - 1)) * chartWidth)
  );
  const yFor = (value: number) => (
    padding.top + chartHeight - ((value - rawMin) / range) * chartHeight
  );
  const pathSegmentsFor = (item: LineSeries<T>) => {
    const segments: string[] = [];
    let current: string[] = [];

    points.forEach((point, index) => {
      const value = item.getValue(point);
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        if (current.length > 0) {
          segments.push(current.join(' '));
          current = [];
        }
        return;
      }

      const command = current.length === 0 ? 'M' : 'L';
      current.push(`${command} ${xFor(index).toFixed(1)} ${yFor(value).toFixed(1)}`);
    });

    if (current.length > 0) {
      segments.push(current.join(' '));
    }

    return segments;
  };

  if (points.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-surface-200 bg-surface-50 text-sm text-surface-500">
        No chart data yet
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-3">
        {series.map(item => (
          <span key={item.label} className="inline-flex items-center gap-2 text-xs text-surface-600">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
            {item.label}
          </span>
        ))}
      </div>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[560px] rounded-lg border border-surface-200 bg-white">
          {[0, 0.25, 0.5, 0.75, 1].map(position => {
            const y = padding.top + chartHeight * position;
            const value = rawMax - range * position;
            return (
              <g key={position}>
                <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="#e5e7eb" strokeWidth="1" />
                <text x={padding.left - 8} y={y + 4} textAnchor="end" className="fill-surface-400 text-[11px]">
                  {yFormatter(value)}
                </text>
              </g>
            );
          })}

          {rawMin < 0 && rawMax > 0 && (
            <line
              x1={padding.left}
              y1={yFor(0)}
              x2={width - padding.right}
              y2={yFor(0)}
              stroke="#94a3b8"
              strokeWidth="1.5"
            />
          )}

          {series.flatMap(item => pathSegmentsFor(item).map((path, index) => (
            <path
              key={`${item.label}-${index}`}
              d={path}
              fill="none"
              stroke={item.color}
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={item.dashed ? '7 7' : undefined}
            />
          )))}

          {points.map((point, index) => {
            if (index !== 0 && index !== points.length - 1 && index % Math.ceil(points.length / 5) !== 0) return null;
            return (
              <text key={point.date} x={xFor(index)} y={height - 10} textAnchor="middle" className="fill-surface-400 text-[11px]">
                {formatChartDate(point.date)}
              </text>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

const forecastTrendLabel = (direction?: string) => {
  if (direction === 'growing') return 'Trading is trending up';
  if (direction === 'cooling') return 'Trading is cooling down';
  return 'Trading is steady';
};

const trendBadgeClass = (direction?: string) => {
  if (direction === 'growing') return 'bg-green-50 text-green-700 border-green-200';
  if (direction === 'cooling') return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-surface-50 text-surface-700 border-surface-200';
};

const riskSignalClass = (severity: 'info' | 'warning' | 'critical') => {
  if (severity === 'critical') return 'bg-red-50 border-red-200 text-red-700';
  if (severity === 'warning') return 'bg-amber-50 border-amber-200 text-amber-700';
  return 'bg-blue-50 border-blue-200 text-blue-700';
};

const riskSignalIcon = (severity: 'info' | 'warning' | 'critical') => {
  if (severity === 'critical' || severity === 'warning') {
    return <AlertTriangle size={16} className={severity === 'critical' ? 'text-red-600' : 'text-amber-600'} />;
  }
  return <Info size={16} className="text-blue-600" />;
};

export const EconomyDashboard: React.FC<EconomyDashboardProps> = ({ isConnected }) => {
  const [economy, setEconomy] = useState<EconomyResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'items' | 'traders' | 'pricing' | 'activity' | 'forecast'>('overview');
  
  // Date filter state
  const [filterPeriod, setFilterPeriod] = useState<EconomyFilterPeriod>('week');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [showCustomDatePicker, setShowCustomDatePicker] = useState(false);
  
  // Price application state
  const [applyingPrices, setApplyingPrices] = useState<Record<string, boolean>>({});
  const [appliedPrices, setAppliedPrices] = useState<Record<string, 'success' | 'error'>>({});
  const [selectedForBulk, setSelectedForBulk] = useState<Set<string>>(new Set());
  const [bulkApplying, setBulkApplying] = useState(false);

  // Build filter params based on current state
  const getFilterParams = useCallback((): EconomyFilterParams => {
    if (filterPeriod === 'custom' && (customStartDate || customEndDate)) {
      return {
        period: 'custom',
        startDate: customStartDate || undefined,
        endDate: customEndDate || undefined
      };
    }
    return { period: filterPeriod };
  }, [filterPeriod, customStartDate, customEndDate]);

  const loadEconomyData = useCallback(async () => {
    if (!isConnected) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const params = getFilterParams();
      const data = await getEconomyStats(params);
      setEconomy(data);
      // Reset applied state when reloading
      setAppliedPrices({});
      setSelectedForBulk(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load economy data');
    } finally {
      setLoading(false);
    }
  }, [isConnected, getFilterParams]);

  // Apply a single price change
  const handleApplyPrice = async (rec: PriceRecommendation) => {
    if (rec.suggestedChange === 0) return;
    
    setApplyingPrices(prev => ({ ...prev, [rec.className]: true }));
    
    try {
      await applyPriceChange({
        className: rec.className,
        newBuyPrice: rec.suggestedPrice
      });
      setAppliedPrices(prev => ({ ...prev, [rec.className]: 'success' }));
    } catch (err) {
      console.error('Failed to apply price:', err);
      setAppliedPrices(prev => ({ ...prev, [rec.className]: 'error' }));
    } finally {
      setApplyingPrices(prev => ({ ...prev, [rec.className]: false }));
    }
  };

  // Toggle selection for bulk apply
  const toggleBulkSelection = (className: string) => {
    setSelectedForBulk(prev => {
      const newSet = new Set(prev);
      if (newSet.has(className)) {
        newSet.delete(className);
      } else {
        newSet.add(className);
      }
      return newSet;
    });
  };

  // Select all actionable recommendations
  const selectAllActionable = () => {
    const actionable = economy?.priceRecommendations
      ?.filter(rec => rec.suggestedChange !== 0 && !appliedPrices[rec.className])
      .map(rec => rec.className) || [];
    setSelectedForBulk(new Set(actionable));
  };

  // Clear selection
  const clearSelection = () => {
    setSelectedForBulk(new Set());
  };

  // Apply all selected price changes
  const handleApplyBulk = async () => {
    if (selectedForBulk.size === 0) return;
    
    const changes = economy?.priceRecommendations
      ?.filter(rec => selectedForBulk.has(rec.className) && rec.suggestedChange !== 0)
      .map(rec => ({
        className: rec.className,
        newBuyPrice: rec.suggestedPrice
      })) || [];
    
    if (changes.length === 0) return;
    
    setBulkApplying(true);
    
    try {
      const result = await applyPriceChangesBulk(changes);
      
      // Update applied state based on results
      const newApplied: Record<string, 'success' | 'error'> = {};
      for (const r of result.results) {
        newApplied[r.className] = r.success ? 'success' : 'error';
      }
      setAppliedPrices(prev => ({ ...prev, ...newApplied }));
      setSelectedForBulk(new Set());
    } catch (err) {
      console.error('Failed to apply bulk prices:', err);
    } finally {
      setBulkApplying(false);
    }
  };

  useEffect(() => {
    loadEconomyData();
  }, [loadEconomyData]);

  if (!isConnected) {
    return (
      <Card title="Server Economy" icon={<TrendingUp size={20} />}>
        <p className="text-surface-500">Connect to the API to view economy data.</p>
      </Card>
    );
  }

  if (loading && !economy) {
    return (
      <Card title="Server Economy" icon={<TrendingUp size={20} />}>
        <div className="flex items-center justify-center py-12">
          <RefreshCw size={24} className="animate-spin text-primary-500" />
          <span className="ml-2 text-surface-500">Loading economy data...</span>
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card title="Server Economy" icon={<TrendingUp size={20} />}>
        <div className="text-center py-8">
          <p className="text-red-500 mb-4">{error}</p>
          <Button onClick={loadEconomyData}>Retry</Button>
        </div>
      </Card>
    );
  }

  if (!economy) {
    return (
      <Card title="Server Economy" icon={<TrendingUp size={20} />}>
        <div className="text-center py-8 text-surface-500">
          <BarChart3 size={48} className="mx-auto mb-4 opacity-50" />
          <p>No economy data available</p>
          <p className="text-sm mt-1">Trade data will appear here once players make transactions</p>
        </div>
      </Card>
    );
  }

  const {
    summary,
    topItemsByVolume,
    topItemsBySpending,
    topTraders,
    topZones,
    hourlyActivity,
    dailyTrend = [],
    marketForecast,
    itemForecasts = [],
    recentTransactions,
    priceRecommendations,
    spawnStats
  } = economy;
  const dailyTrendPoints: EconomyDailyTrendPoint[] = dailyTrend.slice(-30);
  const next7Days: EconomyForecastPoint[] = marketForecast?.next7Days ?? [];
  const featuredItemForecasts: EconomyItemForecast[] = itemForecasts.slice(0, 8);
  const spawnSourceCount = spawnStats?.sourceFileCount ?? spawnStats?.sources?.length ?? 0;
  const economyCoreRefCount = spawnStats?.economyCore?.typeFileRefs ?? 0;
  const economyCoreLoadedCount = spawnStats?.economyCore?.loadedFileRefs ?? 0;
  const hasForecastHistory = dailyTrend.length > 0;
  const actualForecastWindow = dailyTrend.slice(-14);
  const forecastChartPoints: ForecastChartPoint[] = [
    ...actualForecastWindow.map((day, index) => ({
      date: day.date,
      actualNetFlow: day.cumulativeNetFlow,
      actualTransactions: day.transactions,
      predictedNetFlow: index === actualForecastWindow.length - 1 ? day.cumulativeNetFlow : undefined,
      predictedTransactions: index === actualForecastWindow.length - 1 ? day.transactions : undefined,
    })),
    ...next7Days.map(day => ({
      date: day.date,
      predictedNetFlow: day.predictedCumulativeNetFlow,
      predictedTransactions: day.predictedTransactions,
    })),
  ];

  const tabs = [
    { id: 'overview', label: 'Overview', icon: <BarChart3 size={16} /> },
    { id: 'items', label: 'Items', icon: <Package size={16} /> },
    { id: 'pricing', label: 'Pricing', icon: <Tag size={16} />, badge: priceRecommendations?.filter(r => r.severity !== 'info').length || 0 },
    { id: 'traders', label: 'Traders & Zones', icon: <Store size={16} /> },
    { id: 'activity', label: 'Activity', icon: <Activity size={16} /> },
    { id: 'forecast', label: 'Forecasts', icon: <TrendingUp size={16} />, badge: marketForecast?.riskSignals?.filter(signal => signal.severity !== 'info').length || 0 },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <TrendingUp size={24} className="text-primary-500" />
          <div>
            <h2 className="text-xl font-bold text-surface-800">Server Economy</h2>
            <p className="text-sm text-surface-500">
              Last updated: {new Date(economy.generatedAt).toLocaleString()}
            </p>
            {spawnStats && (
              <p className="text-xs text-surface-400">
                Spawn data: {spawnStats.totalItems.toLocaleString()} items from {spawnSourceCount} type {spawnSourceCount === 1 ? 'file' : 'files'}
                {spawnStats.economyCore?.found && `, ${economyCoreLoadedCount}/${economyCoreRefCount} cfgeconomycore entries`}
              </p>
            )}
          </div>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={loadEconomyData}
          loading={loading}
          icon={<RefreshCw size={16} />}
        >
          Refresh
        </Button>
      </div>

      {/* Date Range Filter */}
      <Card compact>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center gap-2">
            <Calendar size={18} className="text-surface-500" />
            <span className="text-sm font-medium text-surface-700">Time Period:</span>
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            {/* Preset Period Buttons */}
            <div className="flex gap-1 bg-surface-100 rounded-lg p-1">
              <button
                onClick={() => { setFilterPeriod('week'); setShowCustomDatePicker(false); }}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  filterPeriod === 'week' 
                    ? 'bg-primary-500 text-white' 
                    : 'text-surface-600 hover:bg-surface-200'
                }`}
              >
                Week
              </button>
              <button
                onClick={() => { setFilterPeriod('month'); setShowCustomDatePicker(false); }}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  filterPeriod === 'month' 
                    ? 'bg-primary-500 text-white' 
                    : 'text-surface-600 hover:bg-surface-200'
                }`}
              >
                Month
              </button>
              <button
                onClick={() => { setFilterPeriod('all'); setShowCustomDatePicker(false); }}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  filterPeriod === 'all' 
                    ? 'bg-primary-500 text-white' 
                    : 'text-surface-600 hover:bg-surface-200'
                }`}
              >
                All Time
              </button>
              <button
                onClick={() => { setFilterPeriod('custom'); setShowCustomDatePicker(true); }}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  filterPeriod === 'custom' 
                    ? 'bg-primary-500 text-white' 
                    : 'text-surface-600 hover:bg-surface-200'
                }`}
              >
                Custom
              </button>
            </div>

            {/* Custom Date Picker */}
            {showCustomDatePicker && (
              <div className="flex items-center gap-2 ml-2">
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="px-2 py-1.5 text-sm border border-surface-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Start date"
                />
                <span className="text-surface-400">to</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="px-2 py-1.5 text-sm border border-surface-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="End date"
                />
                <Button
                  variant="primary"
                  size="sm"
                  onClick={loadEconomyData}
                  icon={<Filter size={14} />}
                >
                  Apply
                </Button>
              </div>
            )}
          </div>

          {/* Show current filter info */}
          {economy.filter && (
            <div className="ml-auto text-xs text-surface-500">
              {economy.filter.period === 'all' ? (
                <span>Showing all data</span>
              ) : economy.filter.period === 'custom' ? (
                <span>
                  {economy.filter.startDate && new Date(economy.filter.startDate).toLocaleDateString()}
                  {economy.filter.startDate && economy.filter.endDate && ' - '}
                  {economy.filter.endDate && new Date(economy.filter.endDate).toLocaleDateString()}
                </span>
              ) : (
                <span>Showing last {economy.filter.period}</span>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* Economy Health Card */}
      <Card compact>
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <div className={`text-4xl font-bold ${getHealthColor(summary.economyHealth)}`}>
                {summary.economyHealth}
              </div>
              <div>
                <div className={`text-lg font-semibold ${getHealthColor(summary.economyHealth)}`}>
                  {getHealthLabel(summary.economyHealth)}
                </div>
                <div className="text-sm text-surface-500">Economy Health Score</div>
              </div>
            </div>
            <div className="w-full bg-surface-200 rounded-full h-3">
              <div 
                className={`h-3 rounded-full transition-all ${getHealthBg(summary.economyHealth)}`}
                style={{ width: `${summary.economyHealth}%` }}
              />
            </div>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 flex-1">
            <div className="text-center p-3 bg-surface-50 rounded-lg">
              <div className="text-2xl font-bold text-surface-800">{summary.totalTransactions}</div>
              <div className="text-xs text-surface-500">Transactions</div>
            </div>
            <div className="text-center p-3 bg-surface-50 rounded-lg">
              <div className="text-2xl font-bold text-surface-800">{summary.uniqueTraders}</div>
              <div className="text-xs text-surface-500">Active Traders</div>
            </div>
            <div className="text-center p-3 bg-surface-50 rounded-lg">
              <div className="text-2xl font-bold text-surface-800">{summary.uniqueItems}</div>
              <div className="text-xs text-surface-500">Unique Items</div>
            </div>
            <div className="text-center p-3 bg-surface-50 rounded-lg">
              <div className="text-2xl font-bold text-surface-800">{formatCurrency(summary.avgTransactionValue)}</div>
              <div className="text-xs text-surface-500">Avg Transaction</div>
            </div>
          </div>
        </div>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card compact className="bg-green-50 border-green-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <ShoppingCart size={20} className="text-green-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-green-700">{summary.totalPurchases}</div>
              <div className="text-xs text-green-600">Items Purchased</div>
            </div>
          </div>
        </Card>
        
        <Card compact className="bg-amber-50 border-amber-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 rounded-lg">
              <Package size={20} className="text-amber-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-amber-700">{summary.totalSales}</div>
              <div className="text-xs text-amber-600">Items Sold</div>
            </div>
          </div>
        </Card>
        
        <Card compact className="bg-emerald-50 border-emerald-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-100 rounded-lg">
              <TrendingUp size={20} className="text-emerald-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-emerald-700">{formatCurrency(summary.totalMoneyEarned)}</div>
              <div className="text-xs text-emerald-600">Players Earned</div>
              <div className="text-[10px] text-emerald-500">Selling to traders</div>
            </div>
          </div>
        </Card>
        
        <Card compact className="bg-purple-50 border-purple-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Store size={20} className="text-purple-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-purple-700">{formatCurrency(summary.totalMoneySpent)}</div>
              <div className="text-xs text-purple-600">Traders Earned</div>
              <div className="text-[10px] text-purple-500">Player purchases</div>
            </div>
          </div>
        </Card>
      </div>

      {/* Net Money Flow Card */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card compact className={summary.netMoneyFlow >= 0 ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${summary.netMoneyFlow >= 0 ? "bg-green-100" : "bg-red-100"}`}>
              <DollarSign size={20} className={summary.netMoneyFlow >= 0 ? "text-green-600" : "text-red-600"} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <div className={`text-2xl font-bold ${summary.netMoneyFlow >= 0 ? "text-green-700" : "text-red-700"}`}>
                  {summary.netMoneyFlow >= 0 ? '+' : ''}{formatCurrency(summary.netMoneyFlow)}
                </div>
                {summary.netMoneyFlow >= 0 ? (
                  <ArrowUp size={18} className="text-green-600" />
                ) : (
                  <ArrowDown size={18} className="text-red-600" />
                )}
              </div>
              <div className={`text-xs ${summary.netMoneyFlow >= 0 ? "text-green-600" : "text-red-600"}`}>
                Trader Net Profit
              </div>
              <div className={`text-[10px] ${summary.netMoneyFlow >= 0 ? "text-green-500" : "text-red-500"}`}>
                {summary.netMoneyFlow >= 0 
                  ? "Traders taking in more than paying out" 
                  : "Traders paying out more than taking in"}
              </div>
            </div>
          </div>
        </Card>

        <Card compact className="bg-slate-50 border-slate-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-100 rounded-lg">
              <BarChart3 size={20} className="text-slate-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-slate-700">{summary.purchaseToSaleRatio}:1</div>
              <div className="text-xs text-slate-600">Purchase to Sale Ratio</div>
              <div className="text-[10px] text-slate-500">
                {summary.purchaseToSaleRatio > 1.5 
                  ? "Players buying more than selling"
                  : summary.purchaseToSaleRatio < 0.7 
                    ? "Players selling more than buying"
                    : "Balanced trading activity"}
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Data Age Notice */}
      {!summary.hasMinimumData && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
          <AlertTriangle size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <div className="font-medium text-amber-800">Limited Data Available</div>
            <p className="text-sm text-amber-700 mt-1">
              You have <span className="font-semibold">{summary.dataAgeDays} day{summary.dataAgeDays !== 1 ? 's' : ''}</span> of trade data. 
              For accurate pricing recommendations, accumulate at least <span className="font-semibold">7 days</span> of trading activity. 
              Recommendations based on limited data may not reflect true market trends.
            </p>
          </div>
        </div>
      )}

      {summary.hasMinimumData && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-3">
          <CheckCircle size={18} className="text-green-600 flex-shrink-0" />
          <p className="text-sm text-green-700">
            <span className="font-medium">{summary.dataAgeDays} days</span> of trade data available. Pricing recommendations are based on sufficient market activity.
          </p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-surface-100 p-1 rounded-lg overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-white text-primary-600 shadow-sm'
                : 'text-surface-600 hover:text-surface-800'
            }`}
          >
            {tab.icon}
            {tab.label}
            {'badge' in tab && typeof tab.badge === 'number' && tab.badge > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-amber-500 text-white">
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <Card compact>
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {dailyTrendPoints.length > 0 && (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <div>
                  <h3 className="text-sm font-semibold text-surface-600 mb-3 flex items-center gap-2">
                    <Activity size={16} />
                    Trade Volume Trend
                  </h3>
                  <LineChart
                    points={dailyTrendPoints}
                    series={[
                      { label: 'Transactions', color: '#2563eb', getValue: day => day.transactions },
                      { label: 'Purchases', color: '#16a34a', getValue: day => day.purchases },
                      { label: 'Sales', color: '#f59e0b', getValue: day => day.sales },
                    ]}
                    yFormatter={value => Math.round(value).toLocaleString()}
                  />
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-surface-600 mb-3 flex items-center gap-2">
                    <DollarSign size={16} />
                    Daily Money Flow
                  </h3>
                  <LineChart
                    points={dailyTrendPoints}
                    series={[
                      { label: 'Spent at traders', color: '#dc2626', getValue: day => day.moneySpent },
                      { label: 'Earned from traders', color: '#059669', getValue: day => day.moneyEarned },
                    ]}
                    yFormatter={formatCurrency}
                  />
                </div>
              </div>
            )}

            {/* Money Flow */}
            <div>
              <h3 className="text-sm font-semibold text-surface-600 mb-3 flex items-center gap-2">
                <DollarSign size={16} />
                Money Flow
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-surface-50 rounded-lg p-4 text-center">
                  <div className={`text-3xl font-bold ${summary.netMoneyFlow >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {summary.netMoneyFlow >= 0 ? '+' : ''}{formatCurrency(summary.netMoneyFlow)}
                  </div>
                  <div className="text-sm text-surface-500 mt-1">Net Money Flow</div>
                  <div className="text-xs text-surface-400">
                    {summary.netMoneyFlow >= 0 ? 'Money entering economy (players selling)' : 'Money leaving economy (players buying)'}
                  </div>
                </div>
                <div className="bg-surface-50 rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold text-surface-800">
                    {summary.purchaseToSaleRatio}:1
                  </div>
                  <div className="text-sm text-surface-500 mt-1">Buy/Sell Ratio</div>
                  <div className="text-xs text-surface-400">
                    {summary.purchaseToSaleRatio > 1.5 ? 'High buying pressure' : 
                     summary.purchaseToSaleRatio < 0.67 ? 'High selling pressure' : 'Balanced market'}
                  </div>
                </div>
                <div className="bg-surface-50 rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold text-surface-800">
                    {formatCurrency(summary.avgTransactionValue)}
                  </div>
                  <div className="text-sm text-surface-500 mt-1">Avg Transaction</div>
                  <div className="text-xs text-surface-400">Average value per trade</div>
                </div>
              </div>
            </div>

            {/* Top Items Quick View */}
            <div>
              <h3 className="text-sm font-semibold text-surface-600 mb-3 flex items-center gap-2">
                <Zap size={16} />
                Hottest Items (by volume)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {topItemsByVolume.slice(0, 6).map((item, idx) => (
                  <div key={idx} className="flex items-center gap-3 bg-surface-50 rounded-lg p-3">
                    <div className="text-lg font-bold text-primary-500 w-6">#{idx + 1}</div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-surface-800 truncate">{item.displayName}</div>
                      <div className="text-xs text-surface-500">
                        {item.purchases + item.sales} trades • Avg {formatCurrency(item.avgPrice)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-1 text-xs">
                        <ArrowDown size={12} className="text-green-500" />
                        <span className="text-green-600">{item.purchases}</span>
                      </div>
                      <div className="flex items-center gap-1 text-xs">
                        <ArrowUp size={12} className="text-amber-500" />
                        <span className="text-amber-600">{item.sales}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'items' && (
          <div className="space-y-6">
            {/* Top by Volume */}
            <div>
              <h3 className="text-sm font-semibold text-surface-600 mb-3">Most Traded Items</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-surface-200">
                      <th className="text-left py-2 px-2">#</th>
                      <th className="text-left py-2 px-2">Item</th>
                      <th className="text-right py-2 px-2">Purchases</th>
                      <th className="text-right py-2 px-2">Sales</th>
                      <th className="text-right py-2 px-2">Total Volume</th>
                      <th className="text-right py-2 px-2">Avg Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topItemsByVolume.map((item, idx) => (
                      <tr key={idx} className="border-b border-surface-100 hover:bg-surface-50">
                        <td className="py-2 px-2 font-medium text-surface-500">{idx + 1}</td>
                        <td className="py-2 px-2 font-medium text-surface-800">{item.displayName}</td>
                        <td className="py-2 px-2 text-right text-green-600">{item.purchases}</td>
                        <td className="py-2 px-2 text-right text-amber-600">{item.sales}</td>
                        <td className="py-2 px-2 text-right font-medium">{item.purchases + item.sales}</td>
                        <td className="py-2 px-2 text-right">{formatCurrency(item.avgPrice)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Top by Spending */}
            <div>
              <h3 className="text-sm font-semibold text-surface-600 mb-3">Most Money Spent On</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {topItemsBySpending.slice(0, 10).map((item, idx) => (
                  <div key={idx} className="flex items-center gap-3 bg-red-50 border border-red-100 rounded-lg p-3">
                    <div className="text-lg font-bold text-red-400 w-6">#{idx + 1}</div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-surface-800 truncate">{item.displayName}</div>
                      <div className="text-xs text-surface-500">{item.purchases} purchases</div>
                    </div>
                    <div className="text-right font-semibold text-red-600">
                      {formatCurrency(item.totalSpent)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'traders' && (
          <div className="space-y-6">
            {/* Top Traders */}
            <div>
              <h3 className="text-sm font-semibold text-surface-600 mb-3 flex items-center gap-2">
                <Store size={16} />
                Most Popular Traders
              </h3>
              <div className="space-y-2">
                {topTraders.map((trader, idx) => (
                  <div key={idx} className="flex items-center gap-3 bg-surface-50 rounded-lg p-3">
                    <div className="text-lg font-bold text-primary-500 w-6">#{idx + 1}</div>
                    <div className="flex-1">
                      <div className="font-medium text-surface-800">{trader.name}</div>
                      <div className="text-xs text-surface-500">
                        {trader.transactions} transactions • {trader.purchases} buys, {trader.sales} sells
                      </div>
                    </div>
                    <div className={`text-right font-semibold ${trader.revenue >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {trader.revenue >= 0 ? '+' : ''}{formatCurrency(trader.revenue)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Top Zones */}
            <div>
              <h3 className="text-sm font-semibold text-surface-600 mb-3 flex items-center gap-2">
                <MapPin size={16} />
                Most Active Trading Zones
              </h3>
              <div className="space-y-2">
                {topZones.map((zone, idx) => (
                  <div key={idx} className="flex items-center gap-3 bg-surface-50 rounded-lg p-3">
                    <div className="text-lg font-bold text-primary-500 w-6">#{idx + 1}</div>
                    <div className="flex-1">
                      <div className="font-medium text-surface-800">{zone.name}</div>
                      <div className="text-xs text-surface-500">{zone.transactions} transactions</div>
                    </div>
                    <div className={`text-right font-semibold ${zone.revenue >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {zone.revenue >= 0 ? '+' : ''}{formatCurrency(zone.revenue)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'activity' && (
          <div className="space-y-6">
            {/* Hourly Activity Chart */}
            <div>
              <h3 className="text-sm font-semibold text-surface-600 mb-3 flex items-center gap-2">
                <Clock size={16} />
                Trading Activity by Hour (UTC)
              </h3>
              <div className="flex items-end gap-1 h-32 bg-surface-50 rounded-lg p-4">
                {hourlyActivity.map((count, hour) => {
                  const maxCount = Math.max(...hourlyActivity, 1);
                  const height = (count / maxCount) * 100;
                  return (
                    <div key={hour} className="flex-1 flex flex-col items-center gap-1">
                      <div 
                        className="w-full bg-primary-500 rounded-t transition-all hover:bg-primary-600"
                        style={{ height: `${height}%`, minHeight: count > 0 ? '4px' : '0' }}
                        title={`${hour}:00 - ${count} transactions`}
                      />
                      {hour % 4 === 0 && (
                        <span className="text-xs text-surface-400">{hour}h</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Recent Transactions */}
            <div>
              <h3 className="text-sm font-semibold text-surface-600 mb-3 flex items-center gap-2">
                <Activity size={16} />
                Recent Transactions
              </h3>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {recentTransactions.map((tx, idx) => {
                  const isPurchase = tx.eventType === 'PURCHASE';
                  return (
                    <div
                      key={idx}
                      className={`flex items-center gap-2 px-3 py-2 rounded border ${
                        isPurchase ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'
                      }`}
                    >
                      {isPurchase ? (
                        <ArrowDown size={16} className="text-green-600" />
                      ) : (
                        <ArrowUp size={16} className="text-amber-600" />
                      )}
                      <span className="text-sm text-surface-600">{tx.playerName}</span>
                      <span className="text-sm font-medium text-surface-800 flex-1 truncate">
                        {tx.itemDisplayName || tx.itemClassName}
                      </span>
                      <span className="text-xs text-surface-500">x{tx.quantity}</span>
                      <span className={`text-sm font-semibold ${isPurchase ? 'text-red-600' : 'text-green-600'}`}>
                        {isPurchase ? '-' : '+'}${tx.price.toLocaleString()}
                      </span>
                      <span className="text-xs text-surface-400 w-16 text-right">
                        {formatTimeAgo(tx.timestamp)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'forecast' && (
          <div className="space-y-6">
            {!marketForecast || !hasForecastHistory ? (
              <div className="text-center py-8 text-surface-500">
                <TrendingUp size={32} className="mx-auto mb-3 opacity-50" />
                <p>No forecast data yet.</p>
                <p className="text-sm mt-1">Forecasts start once trade history is available.</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className={`rounded-lg border p-4 ${trendBadgeClass(marketForecast.trend.direction)}`}>
                    <div className="text-xs font-medium uppercase tracking-wide opacity-80">Market Direction</div>
                    <div className="mt-2 text-lg font-semibold">{forecastTrendLabel(marketForecast.trend.direction)}</div>
                    <div className="mt-1 text-xs opacity-80">
                      {marketForecast.trend.transactionsSlope >= 0 ? '+' : ''}{marketForecast.trend.transactionsSlope} transactions/day
                    </div>
                  </div>

                  <div className="rounded-lg border border-surface-200 bg-surface-50 p-4">
                    <div className="text-xs font-medium uppercase tracking-wide text-surface-500">Forecast Confidence</div>
                    <div className="mt-2 text-3xl font-bold text-surface-800">{marketForecast.confidence}%</div>
                    <div className="mt-2 h-2 rounded-full bg-surface-200">
                      <div
                        className="h-2 rounded-full bg-primary-500"
                        style={{ width: `${marketForecast.confidence}%` }}
                      />
                    </div>
                  </div>

                  <div className="rounded-lg border border-surface-200 bg-surface-50 p-4">
                    <div className="text-xs font-medium uppercase tracking-wide text-surface-500">Projected 7 Day Flow</div>
                    <div className={`mt-2 text-3xl font-bold ${
                      next7Days.reduce((sum, day) => sum + day.predictedNetFlow, 0) >= 0 ? 'text-green-700' : 'text-red-700'
                    }`}>
                      {formatCurrency(next7Days.reduce((sum, day) => sum + day.predictedNetFlow, 0))}
                    </div>
                    <div className="mt-1 text-xs text-surface-500">
                      {next7Days.reduce((sum, day) => sum + day.predictedTransactions, 0).toLocaleString()} predicted trades
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  <div>
                    <h3 className="text-sm font-semibold text-surface-600 mb-3 flex items-center gap-2">
                      <DollarSign size={16} />
                      Net Flow Projection
                    </h3>
                    <LineChart
                      points={forecastChartPoints}
                      series={[
                        { label: 'Actual net flow', color: '#2563eb', getValue: point => point.actualNetFlow },
                        { label: 'Forecast net flow', color: '#7c3aed', getValue: point => point.predictedNetFlow, dashed: true },
                      ]}
                      yFormatter={formatCurrency}
                    />
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-surface-600 mb-3 flex items-center gap-2">
                      <Activity size={16} />
                      Transaction Forecast
                    </h3>
                    <LineChart
                      points={forecastChartPoints}
                      series={[
                        { label: 'Actual trades', color: '#16a34a', getValue: point => point.actualTransactions },
                        { label: 'Forecast trades', color: '#f59e0b', getValue: point => point.predictedTransactions, dashed: true },
                      ]}
                      yFormatter={value => Math.round(value).toLocaleString()}
                    />
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-surface-600 mb-3 flex items-center gap-2">
                    <AlertTriangle size={16} />
                    Market Signals
                  </h3>
                  {marketForecast.riskSignals.length === 0 ? (
                    <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-700">
                      No obvious market pressure detected.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {marketForecast.riskSignals.map(signal => (
                        <div key={signal.type} className={`rounded-lg border p-3 ${riskSignalClass(signal.severity)}`}>
                          <div className="flex items-start gap-2">
                            <div className="mt-0.5">{riskSignalIcon(signal.severity)}</div>
                            <div>
                              <div className="font-semibold">{signal.title}</div>
                              <div className="mt-1 text-xs opacity-85">{signal.detail}</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-surface-600 mb-3 flex items-center gap-2">
                    <Package size={16} />
                    Item Demand Forecast
                  </h3>
                  {featuredItemForecasts.length === 0 ? (
                    <div className="text-center py-8 text-surface-500">
                      <Package size={32} className="mx-auto mb-3 opacity-50" />
                      <p>No item forecasts yet.</p>
                      <p className="text-sm mt-1">Items need at least 3 trades before they appear here.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-surface-200">
                            <th className="text-left py-2 px-2">Item</th>
                            <th className="text-right py-2 px-2">Demand</th>
                            <th className="text-right py-2 px-2">Trend</th>
                            <th className="text-right py-2 px-2">Predicted/Day</th>
                            <th className="text-right py-2 px-2">Avg Price</th>
                            <th className="text-right py-2 px-2">Confidence</th>
                          </tr>
                        </thead>
                        <tbody>
                          {featuredItemForecasts.map(item => {
                            const isUp = item.trendDirection === 'up';
                            const isDown = item.trendDirection === 'down';
                            return (
                              <tr key={item.className} className="border-b border-surface-100 hover:bg-surface-50">
                                <td className="py-2 px-2">
                                  <div className="font-medium text-surface-800">{item.displayName}</div>
                                  <div className="text-xs text-surface-400">{item.totalVolume} trades</div>
                                </td>
                                <td className="py-2 px-2 text-right">
                                  <span className="inline-flex items-center rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700">
                                    {item.demandScore}
                                  </span>
                                </td>
                                <td className={`py-2 px-2 text-right font-medium ${
                                  isUp ? 'text-green-600' : isDown ? 'text-red-600' : 'text-surface-600'
                                }`}>
                                  <span className="inline-flex items-center justify-end gap-1">
                                    {isUp ? <ArrowUp size={14} /> : isDown ? <ArrowDown size={14} /> : <Activity size={14} />}
                                    {item.trendDirection}
                                  </span>
                                </td>
                                <td className="py-2 px-2 text-right">{item.predictedDailyVolume}</td>
                                <td className="py-2 px-2 text-right">{formatCurrency(item.avgPrice)}</td>
                                <td className="py-2 px-2 text-right">{item.confidence}%</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'pricing' && (
          <div className="space-y-6">
            {/* Pricing Recommendations Header */}
            <div>
              <h3 className="text-sm font-semibold text-surface-600 mb-2 flex items-center gap-2">
                <Tag size={16} />
                Pricing Recommendations
              </h3>
              <p className="text-xs text-surface-500 mb-4">
                Based on buy/sell ratios, trading volume, and spawn rates from loaded mission type files.
                Items are flagged if their price doesn't match their rarity - common items shouldn't be expensive, rare items shouldn't be cheap.
              </p>
            </div>

            {spawnStats && (
              <div className="bg-surface-50 rounded-lg p-3 text-xs text-surface-600">
                <div className="font-medium text-surface-700">
                  {spawnSourceCount} type {spawnSourceCount === 1 ? 'file' : 'files'} loaded for {spawnStats.totalItems.toLocaleString()} economy items
                </div>
                {spawnStats.economyCore?.found && (
                  <div className="mt-1 text-surface-500">
                    cfgeconomycore.xml: {economyCoreLoadedCount}/{economyCoreRefCount} referenced type {economyCoreRefCount === 1 ? 'file' : 'files'} loaded
                  </div>
                )}
                {(spawnStats.missingFiles.length > 0 || spawnStats.errors.length > 0) && (
                  <div className="mt-1 text-amber-700">
                    {spawnStats.missingFiles.length + spawnStats.errors.length} type source {spawnStats.missingFiles.length + spawnStats.errors.length === 1 ? 'issue' : 'issues'} detected
                  </div>
                )}
              </div>
            )}

            {/* Legend */}
            <div className="flex flex-wrap gap-4 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <span className="text-surface-600">Critical - Price/rarity mismatch or strong imbalance</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                <span className="text-surface-600">Warning - Notable pricing issue</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                <span className="text-surface-600">Balanced - Price matches rarity</span>
              </div>
            </div>

            {/* Spawn Rating Legend */}
            <div className="bg-surface-50 rounded-lg p-3">
              <div className="text-xs font-medium text-surface-600 mb-2">Spawn Ratings (from loaded nominal values):</div>
              <div className="flex flex-wrap gap-3 text-xs">
                <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-700">Extremely Rare (1-2)</span>
                <span className="px-2 py-0.5 rounded bg-red-100 text-red-700">Very Rare (3-5)</span>
                <span className="px-2 py-0.5 rounded bg-orange-100 text-orange-700">Rare (6-10)</span>
                <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-700">Uncommon (11-20)</span>
                <span className="px-2 py-0.5 rounded bg-green-100 text-green-700">Common (21-50)</span>
                <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-700">Very Common (51-100)</span>
                <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-700">Abundant (100+)</span>
              </div>
            </div>

            {/* Recommendations List */}
            {(!priceRecommendations || priceRecommendations.length === 0) ? (
              <div className="text-center py-8 text-surface-500">
                <Info size={32} className="mx-auto mb-3 opacity-50" />
                <p>No pricing recommendations yet.</p>
                <p className="text-sm mt-1">Need at least 3 trades per item to generate recommendations.</p>
              </div>
            ) : (
              <>
                {/* Bulk Actions Bar */}
                <div className="bg-surface-100 rounded-lg p-3 flex items-center justify-between mb-3">
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-surface-600">
                      {selectedForBulk.size} of {priceRecommendations.filter(r => r.suggestedChange !== 0 && !appliedPrices[r.className]).length} selected
                    </span>
                    <button
                      onClick={selectAllActionable}
                      className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                    >
                      Select All Actionable
                    </button>
                    {selectedForBulk.size > 0 && (
                      <button
                        onClick={clearSelection}
                        className="text-sm text-surface-500 hover:text-surface-700"
                      >
                        Clear Selection
                      </button>
                    )}
                  </div>
                  {selectedForBulk.size > 0 && (
                    <button
                      onClick={handleApplyBulk}
                      disabled={bulkApplying}
                      className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 flex items-center gap-2"
                    >
                      {bulkApplying ? (
                        <>
                          <RefreshCw className="h-4 w-4 animate-spin" />
                          Applying...
                        </>
                      ) : (
                        <>
                          <Check className="h-4 w-4" />
                          Apply {selectedForBulk.size} Changes
                        </>
                      )}
                    </button>
                  )}
                </div>

                <div className="space-y-3">
                  {priceRecommendations.map((rec, idx) => {
                  const severityStyles = {
                    critical: 'border-red-300 bg-red-50',
                    warning: 'border-amber-300 bg-amber-50',
                    info: 'border-green-300 bg-green-50'
                  };
                  const severityIcon = {
                    critical: <AlertTriangle size={18} className="text-red-600" />,
                    warning: <AlertTriangle size={18} className="text-amber-600" />,
                    info: <CheckCircle size={18} className="text-green-600" />
                  };
                  const actionLabel: Record<string, string> = {
                    increase_buy_price: 'Consider Raising Price',
                    decrease_sell_price: 'Consider Lowering Sell Price',
                    balanced_high_volume: 'Pricing Optimal',
                    overpriced_common: 'Overpriced for Spawn Rate',
                    underpriced_rare: 'Underpriced for Rarity'
                  };
                  
                  // Get spawn rating badge color
                  const getSpawnBadge = (spawnRating: string | undefined) => {
                    const badges: Record<string, string> = {
                      'extremely_rare': 'bg-purple-100 text-purple-700',
                      'very_rare': 'bg-red-100 text-red-700',
                      'rare': 'bg-orange-100 text-orange-700',
                      'uncommon': 'bg-amber-100 text-amber-700',
                      'common': 'bg-green-100 text-green-700',
                      'very_common': 'bg-blue-100 text-blue-700',
                      'abundant': 'bg-gray-100 text-gray-700',
                      'none': 'bg-gray-100 text-gray-500'
                    };
                    return badges[spawnRating || ''] || 'bg-gray-100 text-gray-500';
                  };

                  const formatSpawnRating = (rating: string | undefined) => {
                    if (!rating) return 'Unknown';
                    return rating.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                  };
                  
                  return (
                    <div 
                      key={idx} 
                      className={`border rounded-lg p-4 ${severityStyles[rec.severity]} ${
                        appliedPrices[rec.className] === 'success' ? 'opacity-60' : ''
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {/* Checkbox for bulk selection (only if actionable) */}
                        {rec.suggestedChange !== 0 && !appliedPrices[rec.className] && (
                          <div className="flex-shrink-0 mt-0.5">
                            <input
                              type="checkbox"
                              checked={selectedForBulk.has(rec.className)}
                              onChange={() => toggleBulkSelection(rec.className)}
                              className="h-4 w-4 rounded border-surface-300 text-primary-600 focus:ring-primary-500"
                            />
                          </div>
                        )}
                        <div className="flex-shrink-0 mt-0.5">
                          {severityIcon[rec.severity]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-surface-800">{rec.displayName}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              rec.severity === 'critical' ? 'bg-red-200 text-red-800' :
                              rec.severity === 'warning' ? 'bg-amber-200 text-amber-800' :
                              'bg-green-200 text-green-800'
                            }`}>
                              {actionLabel[rec.recommendation] || rec.recommendation}
                            </span>
                            {/* Spawn rating badge */}
                            {rec.spawnInfo && (
                              <span className={`text-xs px-2 py-0.5 rounded font-medium ${getSpawnBadge(rec.spawnInfo.spawnRating)}`}>
                                {formatSpawnRating(rec.spawnInfo.spawnRating)} (n:{rec.spawnInfo.nominal})
                              </span>
                            )}
                            {/* Applied status badge */}
                            {appliedPrices[rec.className] === 'success' && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-green-500 text-white flex items-center gap-1">
                                <Check size={12} /> Applied
                              </span>
                            )}
                            {appliedPrices[rec.className] === 'error' && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-red-500 text-white flex items-center gap-1">
                                <X size={12} /> Failed
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-surface-600 mt-1">{rec.reason}</p>
                          <div className="flex flex-wrap gap-4 mt-2 text-xs text-surface-500">
                            <span>Purchases: <strong className="text-green-700">{rec.purchases}</strong></span>
                            <span>Sales: <strong className="text-amber-700">{rec.sales}</strong></span>
                            <span>Buy Ratio: <strong>{rec.buyRatio}%</strong></span>
                            <span>Avg Price: <strong>{formatCurrency(rec.currentAvgPrice)}</strong></span>
                            {rec.spawnInfo?.category && (
                              <span>Category: <strong>{rec.spawnInfo.category}</strong></span>
                            )}
                            {rec.priceRarityAlignment !== null && rec.priceRarityAlignment !== undefined && (
                              <span className={rec.priceRarityAlignment < 50 ? 'text-red-600' : rec.priceRarityAlignment < 70 ? 'text-amber-600' : 'text-green-600'}>
                                Price-Rarity Match: <strong>{rec.priceRarityAlignment}%</strong>
                              </span>
                            )}
                          </div>
                        </div>
                        {rec.suggestedChange !== 0 && (
                          <div className="text-right flex-shrink-0 flex flex-col items-end gap-2">
                            <div>
                              <div className="text-xs text-surface-500">Suggested</div>
                              <div className={`text-lg font-bold ${rec.suggestedChange > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {rec.suggestedChange > 0 ? '+' : ''}{formatCurrency(rec.suggestedChange)}
                              </div>
                              <div className="text-xs text-surface-500">
                                → {formatCurrency(rec.suggestedPrice)}
                              </div>
                            </div>
                            {!appliedPrices[rec.className] && (
                              <button
                                onClick={() => handleApplyPrice(rec)}
                                disabled={applyingPrices[rec.className]}
                                className="px-3 py-1 text-xs bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50 flex items-center gap-1"
                              >
                                {applyingPrices[rec.className] ? (
                                  <>
                                    <RefreshCw size={12} className="animate-spin" />
                                    Applying...
                                  </>
                                ) : (
                                  <>
                                    <Check size={12} />
                                    Apply
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
            )}

            {/* Disclaimer */}
            <div className="bg-surface-100 rounded-lg p-3 text-xs text-surface-500">
              <strong>Note:</strong> Recommendations are based on trading patterns and spawn rates from loaded mission type files.
              Items that spawn frequently (high nominal) shouldn't command high prices. 
              Rare items (low nominal) should be more valuable. Consider your server's unique economy before making changes.
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};

export default EconomyDashboard;
