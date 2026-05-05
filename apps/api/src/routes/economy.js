import { Router } from "express";
import { readdir, readFile } from "../storage/fs.js";
import { paths } from "../config.js";
import { joinStoragePath } from "../utils/storagePath.js";
import { loadTypesData, analyzeSpawnVsPrice, getSpawnStats } from "../utils/typesParser.js";
import { getArchiveDb } from "../db/archiveDb.js";

const router = Router();

/**
 * Get archived trades from SQLite database within date range
 * @param {Date | null} startDate - Filter start date
 * @param {Date | null} endDate - Filter end date
 * @returns {Array} Array of trade objects from archive
 */
function getArchivedTrades(startDate, endDate) {
  try {
    const db = getArchiveDb();
    
    let query = `
      SELECT 
        steam_id as playerId,
        timestamp,
        UPPER(trade_type) as eventType,
        trader_name as traderName,
        zone_name as traderZone,
        item_class as itemClassName,
        item_display as itemDisplayName,
        quantity,
        price
      FROM archived_trades
      WHERE 1=1
    `;
    const params = [];
    
    if (startDate) {
      query += ` AND timestamp >= ?`;
      params.push(startDate.toISOString());
    }
    if (endDate) {
      query += ` AND timestamp <= ?`;
      params.push(endDate.toISOString());
    }
    
    query += ` ORDER BY timestamp DESC`;
    
    return db.prepare(query).all(...params);
  } catch (err) {
    console.error('Error querying archived trades:', err.message);
    return [];
  }
}

/**
 * Parse date filter query parameters
 * @param {string} period - Preset period: 'week', 'month', 'all'
 * @param {string} startDate - ISO date string for custom range start
 * @param {string} endDate - ISO date string for custom range end
 * @returns {{ startDate: Date | null, endDate: Date | null }}
 */
function parseDateFilter(period, startDate, endDate) {
  const now = new Date();
  
  // Handle preset periods
  if (period === 'week') {
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);
    return { startDate: weekAgo, endDate: now };
  }
  
  if (period === 'month') {
    const monthAgo = new Date(now);
    monthAgo.setMonth(monthAgo.getMonth() - 1);
    return { startDate: monthAgo, endDate: now };
  }
  
  // Handle custom date range
  if (startDate || endDate) {
    return {
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null
    };
  }
  
  // Default: all data (no filter)
  return { startDate: null, endDate: null };
}

/**
 * Check if a trade timestamp falls within the date range
 * @param {string} timestamp - Trade timestamp
 * @param {Date | null} startDate - Filter start date
 * @param {Date | null} endDate - Filter end date
 * @returns {boolean}
 */
function isWithinDateRange(timestamp, startDate, endDate) {
  if (!startDate && !endDate) return true;
  
  const tradeDate = new Date(timestamp);
  if (startDate && tradeDate < startDate) return false;
  if (endDate && tradeDate > endDate) return false;
  return true;
}

function toDateKey(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function dateKeyToUtcDate(dateKey) {
  return new Date(`${dateKey}T00:00:00.000Z`);
}

function normalizeTradeForAnalytics(trade, playerId = "") {
  const eventType = String(trade?.eventType || "").toUpperCase();
  const price = Number(trade?.price || 0);
  const quantity = Number(trade?.quantity || 1);

  return {
    ...trade,
    playerId: trade?.playerId || playerId,
    eventType,
    price: Number.isFinite(price) ? price : 0,
    quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
    timestamp: trade?.timestamp,
  };
}

function createDailyBucket(dateKey) {
  return {
    date: dateKey,
    transactions: 0,
    purchases: 0,
    sales: 0,
    moneySpent: 0,
    moneyEarned: 0,
    netFlow: 0,
    cumulativeNetFlow: 0,
    avgTransactionValue: 0,
  };
}

function buildDailyTrend(trades, filterStart, filterEnd) {
  const buckets = new Map();
  let minDateKey = filterStart ? toDateKey(filterStart) : null;
  let maxDateKey = filterEnd ? toDateKey(filterEnd) : null;

  for (const trade of trades) {
    const dateKey = toDateKey(trade.timestamp);
    if (!dateKey) continue;

    if (!minDateKey || dateKey < minDateKey) minDateKey = dateKey;
    if (!maxDateKey || dateKey > maxDateKey) maxDateKey = dateKey;

    if (!buckets.has(dateKey)) {
      buckets.set(dateKey, createDailyBucket(dateKey));
    }

    const bucket = buckets.get(dateKey);
    bucket.transactions += 1;

    if (trade.eventType === "PURCHASE") {
      bucket.purchases += 1;
      bucket.moneySpent += trade.price;
    } else if (trade.eventType === "SALE") {
      bucket.sales += 1;
      bucket.moneyEarned += trade.price;
    }
  }

  if (!minDateKey || !maxDateKey) return [];

  const trend = [];
  let cursor = dateKeyToUtcDate(minDateKey);
  const end = dateKeyToUtcDate(maxDateKey);
  let cumulativeNetFlow = 0;

  while (cursor <= end) {
    const dateKey = cursor.toISOString().slice(0, 10);
    const bucket = buckets.get(dateKey) || createDailyBucket(dateKey);
    bucket.netFlow = bucket.moneySpent - bucket.moneyEarned;
    cumulativeNetFlow += bucket.netFlow;
    bucket.cumulativeNetFlow = cumulativeNetFlow;
    bucket.avgTransactionValue = bucket.transactions > 0
      ? Math.round((bucket.moneySpent + bucket.moneyEarned) / bucket.transactions)
      : 0;
    trend.push(bucket);
    cursor = addDays(cursor, 1);
  }

  return trend;
}

function linearRegression(values) {
  const points = values
    .map((value, index) => ({ x: index, y: Number(value) || 0 }))
    .filter((point) => Number.isFinite(point.y));

  if (points.length < 2) {
    return { slope: 0, intercept: points[0]?.y || 0, r2: 0 };
  }

  const n = points.length;
  const sumX = points.reduce((sum, point) => sum + point.x, 0);
  const sumY = points.reduce((sum, point) => sum + point.y, 0);
  const sumXY = points.reduce((sum, point) => sum + point.x * point.y, 0);
  const sumXX = points.reduce((sum, point) => sum + point.x * point.x, 0);
  const denominator = n * sumXX - sumX * sumX;
  const slope = denominator === 0 ? 0 : (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;
  const meanY = sumY / n;
  const ssTotal = points.reduce((sum, point) => sum + Math.pow(point.y - meanY, 2), 0);
  const ssResidual = points.reduce((sum, point) => {
    const predicted = intercept + slope * point.x;
    return sum + Math.pow(point.y - predicted, 2);
  }, 0);
  const r2 = ssTotal === 0 ? 0 : Math.max(0, Math.min(1, 1 - ssResidual / ssTotal));

  return { slope, intercept, r2 };
}

function buildMarketForecast(dailyTrend, summary) {
  const lastDate = dailyTrend.length > 0
    ? dateKeyToUtcDate(dailyTrend[dailyTrend.length - 1].date)
    : new Date();
  const transactionModel = linearRegression(dailyTrend.map((day) => day.transactions));
  const spentModel = linearRegression(dailyTrend.map((day) => day.moneySpent));
  const earnedModel = linearRegression(dailyTrend.map((day) => day.moneyEarned));
  const confidence = Math.round(Math.min(95, Math.max(10, (dailyTrend.length / 14) * 60 + transactionModel.r2 * 20 + spentModel.r2 * 15)));
  const next7Days = [];
  let cumulativeNetFlow = dailyTrend[dailyTrend.length - 1]?.cumulativeNetFlow || 0;

  for (let i = 1; i <= 7; i++) {
    const x = dailyTrend.length - 1 + i;
    const predictedTransactions = Math.max(0, Math.round(transactionModel.intercept + transactionModel.slope * x));
    const predictedMoneySpent = Math.max(0, Math.round(spentModel.intercept + spentModel.slope * x));
    const predictedMoneyEarned = Math.max(0, Math.round(earnedModel.intercept + earnedModel.slope * x));
    const predictedNetFlow = predictedMoneySpent - predictedMoneyEarned;
    cumulativeNetFlow += predictedNetFlow;

    next7Days.push({
      date: addDays(lastDate, i).toISOString().slice(0, 10),
      predictedTransactions,
      predictedMoneySpent,
      predictedMoneyEarned,
      predictedNetFlow,
      predictedCumulativeNetFlow: cumulativeNetFlow,
    });
  }

  const riskSignals = [];
  if (summary.purchaseToSaleRatio > 3) {
    riskSignals.push({
      type: "buy_pressure",
      severity: "warning",
      title: "Strong buy pressure",
      detail: "Players are buying far more than they sell. Popular items may be underpriced or too convenient.",
    });
  }
  if (summary.purchaseToSaleRatio < 0.35 && summary.totalSales > 0) {
    riskSignals.push({
      type: "sell_pressure",
      severity: "warning",
      title: "Strong sell pressure",
      detail: "Players are selling far more than they buy. Trader sell prices may be too generous.",
    });
  }
  if (summary.netMoneyFlow < 0) {
    riskSignals.push({
      type: "cash_injection",
      severity: "critical",
      title: "Trader payouts exceed purchases",
      detail: "The market is injecting currency into players faster than it removes it.",
    });
  }
  if (summary.uniqueItems < 10 && summary.totalTransactions >= 25) {
    riskSignals.push({
      type: "low_diversity",
      severity: "info",
      title: "Low item diversity",
      detail: "Trading is concentrated around a small number of items.",
    });
  }
  if (dailyTrend.length < 7) {
    riskSignals.push({
      type: "limited_history",
      severity: "info",
      title: "Forecast confidence is limited",
      detail: "Predictions improve once the server has at least a week of trade history.",
    });
  }

  return {
    confidence,
    trend: {
      transactionsSlope: Number(transactionModel.slope.toFixed(2)),
      moneySpentSlope: Number(spentModel.slope.toFixed(2)),
      moneyEarnedSlope: Number(earnedModel.slope.toFixed(2)),
      direction: transactionModel.slope > 0.25 ? "growing" : transactionModel.slope < -0.25 ? "cooling" : "steady",
    },
    next7Days,
    riskSignals,
  };
}

function buildItemForecasts(trades, itemStats) {
  const grouped = new Map();

  for (const trade of trades) {
    const className = trade.itemClassName;
    if (!className) continue;
    if (!grouped.has(className)) {
      grouped.set(className, new Map());
    }
    const dateKey = toDateKey(trade.timestamp);
    if (!dateKey) continue;

    const byDate = grouped.get(className);
    if (!byDate.has(dateKey)) {
      byDate.set(dateKey, { date: dateKey, transactions: 0, moneySpent: 0, moneyEarned: 0 });
    }
    const bucket = byDate.get(dateKey);
    bucket.transactions += 1;
    if (trade.eventType === "PURCHASE") bucket.moneySpent += trade.price;
    if (trade.eventType === "SALE") bucket.moneyEarned += trade.price;
  }

  return [...itemStats.values()]
    .map((item) => {
      const byDate = [...(grouped.get(item.className)?.values() || [])]
        .sort((a, b) => a.date.localeCompare(b.date));
      const totalVolume = item.purchases + item.sales;
      const model = linearRegression(byDate.map((day) => day.transactions));
      const predictedDailyVolume = Math.max(0, Math.round(model.intercept + model.slope * byDate.length));
      const demandScore = Math.round(Math.min(100, Math.max(0, (item.purchases / Math.max(totalVolume, 1)) * 70 + Math.min(totalVolume, 30))));

      return {
        className: item.className,
        displayName: item.displayName,
        totalVolume,
        avgPrice: item.avgPrice,
        purchases: item.purchases,
        sales: item.sales,
        demandScore,
        trendDirection: model.slope > 0.15 ? "up" : model.slope < -0.15 ? "down" : "flat",
        trendSlope: Number(model.slope.toFixed(2)),
        predictedDailyVolume,
        confidence: Math.round(Math.min(95, Math.max(10, byDate.length * 8 + model.r2 * 25))),
      };
    })
    .filter((item) => item.totalVolume >= 3)
    .sort((a, b) => b.demandScore - a.demandScore)
    .slice(0, 12);
}

// Get global economy statistics
// Query params: period (week|month|all), startDate, endDate
router.get("/", async (req, res) => {
  try {
    const { period, startDate: startDateParam, endDate: endDateParam } = req.query;
    const { startDate: filterStart, endDate: filterEnd } = parseDateFilter(period, startDateParam, endDateParam);
    
    const tradesDir = paths.trades;
    const files = await readdir(tradesDir).catch(() => []);
    
    // Aggregate data
    let totalTransactions = 0;
    let totalPurchases = 0;
    let totalSales = 0;
    let totalMoneySpent = 0;
    let totalMoneyEarned = 0;
    const uniqueTradersSet = new Set(); // Track unique player IDs
    
    // Item tracking
    const itemStats = new Map(); // className -> { purchases, sales, totalSpent, totalEarned, quantity }
    const traderStats = new Map(); // traderName -> { transactions, revenue }
    const zoneStats = new Map(); // zoneName -> { transactions, revenue }
    const hourlyActivity = new Array(24).fill(0); // Transactions per hour
    const recentTransactions = [];
    const allTrades = [];
    
    // =========================================================================
    // STEP 1: Load archived trades from SQLite database (historical data)
    // =========================================================================
    const archivedTrades = getArchivedTrades(filterStart, filterEnd);
    console.log(`[Economy] Loaded ${archivedTrades.length} archived trades from database`);
    
    for (const trade of archivedTrades) {
      const analyticsTrade = normalizeTradeForAnalytics(trade, trade.playerId);
      allTrades.push(analyticsTrade);
      totalTransactions++;
      uniqueTradersSet.add(trade.playerId);
      
      if (trade.eventType === "PURCHASE") {
        totalPurchases++;
        totalMoneySpent += trade.price || 0;
      } else {
        totalSales++;
        totalMoneyEarned += trade.price || 0;
      }
      
      // Track item stats
      const itemKey = trade.itemClassName;
      if (!itemStats.has(itemKey)) {
        itemStats.set(itemKey, {
          className: trade.itemClassName,
          displayName: trade.itemDisplayName || trade.itemClassName,
          purchases: 0,
          sales: 0,
          totalSpent: 0,
          totalEarned: 0,
          quantity: 0,
          avgPrice: 0,
          lastSeen: trade.timestamp
        });
      }
      const item = itemStats.get(itemKey);
      if (trade.eventType === "PURCHASE") {
        item.purchases++;
        item.totalSpent += trade.price || 0;
      } else {
        item.sales++;
        item.totalEarned += trade.price || 0;
      }
      item.quantity += trade.quantity || 1;
      item.avgPrice = Math.round((item.totalSpent + item.totalEarned) / (item.purchases + item.sales));
      if (trade.timestamp > item.lastSeen) item.lastSeen = trade.timestamp;
      
      // Track trader stats
      if (trade.traderName) {
        const traderKey = trade.traderName;
        if (!traderStats.has(traderKey)) {
          traderStats.set(traderKey, { name: traderKey, transactions: 0, revenue: 0, purchases: 0, sales: 0 });
        }
        const trader = traderStats.get(traderKey);
        trader.transactions++;
        if (trade.eventType === "PURCHASE") {
          trader.revenue += trade.price || 0;
          trader.purchases++;
        } else {
          trader.revenue -= trade.price || 0;
          trader.sales++;
        }
      }
      
      // Track zone stats
      if (trade.traderZone) {
        const zoneKey = trade.traderZone;
        if (!zoneStats.has(zoneKey)) {
          zoneStats.set(zoneKey, { name: zoneKey, transactions: 0, revenue: 0 });
        }
        const zone = zoneStats.get(zoneKey);
        zone.transactions++;
        if (trade.eventType === "PURCHASE") {
          zone.revenue += trade.price || 0;
        } else {
          zone.revenue -= trade.price || 0;
        }
      }
      
      // Track hourly activity
      try {
        const hour = new Date(trade.timestamp).getUTCHours();
        hourlyActivity[hour]++;
      } catch {}
      
      // Keep for recent transactions
      recentTransactions.push(trade);
    }
    
    // =========================================================================
    // STEP 2: Load current trades from JSON files (today's data not yet archived)
    // =========================================================================
    for (const file of files) {
      if (!file.endsWith("_trades.json")) continue;
      
      try {
        const filePath = joinStoragePath(tradesDir, file);
        const data = JSON.parse(await readFile(filePath, "utf8"));
        
        if (data.trades && data.trades.length > 0) {
          // Filter trades by date range
          const filteredTrades = data.trades.filter(trade => 
            isWithinDateRange(trade.timestamp, filterStart, filterEnd)
          );
          
          if (filteredTrades.length === 0) continue;
          
          // Track unique traders
          const playerId = file.replace('_trades.json', '');
          uniqueTradersSet.add(playerId);
          
          // Recalculate totals from filtered trades
          const filteredPurchases = filteredTrades.filter(t => t.eventType === "PURCHASE").length;
          const filteredSales = filteredTrades.filter(t => t.eventType === "SALE").length;
          const filteredSpent = filteredTrades.filter(t => t.eventType === "PURCHASE").reduce((sum, t) => sum + (t.price || 0), 0);
          const filteredEarned = filteredTrades.filter(t => t.eventType === "SALE").reduce((sum, t) => sum + (t.price || 0), 0);
          
          totalPurchases += filteredPurchases;
          totalSales += filteredSales;
          totalMoneySpent += filteredSpent;
          totalMoneyEarned += filteredEarned;
          
          for (const trade of filteredTrades) {
            allTrades.push(normalizeTradeForAnalytics(trade, data.playerId));
            totalTransactions++;
            
            // Track item stats
            const itemKey = trade.itemClassName;
            if (!itemStats.has(itemKey)) {
              itemStats.set(itemKey, {
                className: trade.itemClassName,
                displayName: trade.itemDisplayName || trade.itemClassName,
                purchases: 0,
                sales: 0,
                totalSpent: 0,
                totalEarned: 0,
                quantity: 0,
                avgPrice: 0,
                lastSeen: trade.timestamp
              });
            }
            const item = itemStats.get(itemKey);
            if (trade.eventType === "PURCHASE") {
              item.purchases++;
              item.totalSpent += trade.price;
            } else {
              item.sales++;
              item.totalEarned += trade.price;
            }
            item.quantity += trade.quantity;
            item.avgPrice = Math.round((item.totalSpent + item.totalEarned) / (item.purchases + item.sales));
            if (trade.timestamp > item.lastSeen) item.lastSeen = trade.timestamp;
            
            // Track trader stats
            if (trade.traderName) {
              const traderKey = trade.traderName;
              if (!traderStats.has(traderKey)) {
                traderStats.set(traderKey, { name: traderKey, transactions: 0, revenue: 0, purchases: 0, sales: 0 });
              }
              const trader = traderStats.get(traderKey);
              trader.transactions++;
              if (trade.eventType === "PURCHASE") {
                trader.revenue += trade.price;
                trader.purchases++;
              } else {
                trader.revenue -= trade.price;
                trader.sales++;
              }
            }
            
            // Track zone stats
            if (trade.traderZone) {
              const zoneKey = trade.traderZone;
              if (!zoneStats.has(zoneKey)) {
                zoneStats.set(zoneKey, { name: zoneKey, transactions: 0, revenue: 0 });
              }
              const zone = zoneStats.get(zoneKey);
              zone.transactions++;
              if (trade.eventType === "PURCHASE") {
                zone.revenue += trade.price;
              } else {
                zone.revenue -= trade.price;
              }
            }
            
            // Track hourly activity
            try {
              const hour = new Date(trade.timestamp).getUTCHours();
              hourlyActivity[hour]++;
            } catch {}
            
            // Keep recent transactions (last 50)
            recentTransactions.push({
              ...trade,
              playerId: data.playerId,
            });
          }
        }
      } catch (err) {
        console.error(`Error reading trade file ${file}:`, err.message);
      }
    }
    
    // Sort and limit recent transactions
    recentTransactions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const latestTransactions = recentTransactions.slice(0, 50);
    
    // Calculate top items by volume (purchases + sales)
    const topItemsByVolume = [...itemStats.values()]
      .sort((a, b) => (b.purchases + b.sales) - (a.purchases + a.sales))
      .slice(0, 20);
    
    // Calculate top items by money spent (most expensive purchases)
    const topItemsBySpending = [...itemStats.values()]
      .filter(i => i.purchases > 0)
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .slice(0, 20);
    
    // Calculate most sold items
    const topSoldItems = [...itemStats.values()]
      .filter(i => i.sales > 0)
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 20);
    
    // Top traders by transactions
    const topTraders = [...traderStats.values()]
      .sort((a, b) => b.transactions - a.transactions)
      .slice(0, 10);
    
    // Top zones by transactions
    const topZones = [...zoneStats.values()]
      .sort((a, b) => b.transactions - a.transactions)
      .slice(0, 10);
    
    // Calculate data age range
    let oldestTransaction = null;
    let newestTransaction = null;
    for (const tx of recentTransactions) {
      const txDate = new Date(tx.timestamp);
      if (!oldestTransaction || txDate < oldestTransaction) oldestTransaction = txDate;
      if (!newestTransaction || txDate > newestTransaction) newestTransaction = txDate;
    }
    // Also check all items for oldest data
    for (const item of itemStats.values()) {
      if (item.lastSeen) {
        const itemDate = new Date(item.lastSeen);
        if (!oldestTransaction || itemDate < oldestTransaction) oldestTransaction = itemDate;
        if (!newestTransaction || itemDate > newestTransaction) newestTransaction = itemDate;
      }
    }
    
    const dataAgeDays = oldestTransaction 
      ? Math.floor((Date.now() - oldestTransaction.getTime()) / (1000 * 60 * 60 * 24))
      : 0;
    const hasMinimumData = dataAgeDays >= 7;
    
    // Load spawn data from mission economy type files.
    const typesData = await loadTypesData();
    const spawnStatsData = await getSpawnStats();
    
    // Calculate pricing recommendations
    // Based on: buy/sell ratio, volume, price trends, AND spawn rates
    const priceRecommendations = [];
    
    for (const item of itemStats.values()) {
      const totalVolume = item.purchases + item.sales;
      if (totalVolume < 3) continue; // Need at least 3 trades for recommendations
      
      const buyRatio = totalVolume > 0 ? item.purchases / totalVolume : 0.5;
      const sellRatio = totalVolume > 0 ? item.sales / totalVolume : 0.5;
      
      // Get spawn data for this item
      const spawnData = typesData.get(item.className.toLowerCase());
      const spawnAnalysis = spawnData ? analyzeSpawnVsPrice(item, spawnData) : null;
      
      let recommendation = null;
      let reason = "";
      let severity = "info"; // info, warning, critical
      let suggestedChange = 0;
      let spawnInfo = null;
      
      // Extract spawn info for display
      if (spawnData) {
        spawnInfo = {
          nominal: spawnData.nominal,
          spawnRating: spawnData.spawnRating,
          spawnScore: spawnData.spawnScore,
          category: spawnData.category,
          spawns: spawnData.spawns,
          source: spawnData.source || null
        };
      }
      
      // PRIORITY 1: Check spawn-based pricing issues
      // Common items that are overpriced (spawns a lot but sells high)
      if (spawnAnalysis?.priceIssue?.type === 'overpriced_common') {
        recommendation = "overpriced_common";
        const nominal = spawnData?.nominal || 0;
        const suggestedMax = spawnAnalysis.priceIssue.suggestedMaxPrice;
        suggestedChange = suggestedMax - item.avgPrice; // Will be negative
        reason = `Overpriced for spawn rate: This item has nominal ${nominal} (${spawnData?.spawnRating}) but sells for $${item.avgPrice}. Common items shouldn't be expensive.`;
        severity = spawnAnalysis.severity;
      }
      // Rare items that are underpriced
      else if (spawnAnalysis?.priceIssue?.type === 'underpriced_rare') {
        recommendation = "underpriced_rare";
        const nominal = spawnData?.nominal || 0;
        const suggestedMin = spawnAnalysis.priceIssue.suggestedMinPrice;
        suggestedChange = suggestedMin - item.avgPrice; // Will be positive
        reason = `Underpriced for rarity: This item has nominal ${nominal} (${spawnData?.spawnRating}) but only sells for $${item.avgPrice}. Rare items should be valuable.`;
        severity = spawnAnalysis.severity;
      }
      // PRIORITY 2: High demand - mostly purchases, few sales
      else if (buyRatio > 0.75 && item.purchases >= 5) {
        suggestedChange = Math.round(item.avgPrice * 0.15);
        recommendation = "increase_buy_price";
        reason = `High demand: ${item.purchases} purchases vs ${item.sales} sales. Players want this item.`;
        severity = buyRatio > 0.9 ? "critical" : "warning";
        
        // Adjust suggestion based on spawn rate
        if (spawnData && spawnData.spawnScore >= 60) {
          // Item is common, so high demand might mean price is just right or too low
          reason += ` Note: This item spawns frequently (nominal: ${spawnData.nominal}).`;
        }
      }
      // PRIORITY 3: High supply - mostly sales, few purchases
      else if (sellRatio > 0.75 && item.sales >= 5) {
        suggestedChange = -Math.round(item.avgPrice * 0.15);
        recommendation = "decrease_sell_price";
        reason = `Oversupply: ${item.sales} sales vs ${item.purchases} purchases. Market flooded.`;
        severity = sellRatio > 0.9 ? "critical" : "warning";
        
        // Adjust severity based on spawn rate
        if (spawnData && spawnData.spawnScore >= 60) {
          reason += ` This is expected - item spawns frequently (nominal: ${spawnData.nominal}).`;
          severity = "info"; // Less severe if it's a common item
        }
      }
      // Balanced but very high volume - popular item
      else if (totalVolume >= 20 && buyRatio >= 0.4 && buyRatio <= 0.6) {
        recommendation = "balanced_high_volume";
        reason = `Healthy balance: ${item.purchases} purchases, ${item.sales} sales. Pricing seems optimal.`;
        severity = "info";
        
        if (spawnData) {
          reason += ` Spawn rating: ${spawnData.spawnRating} (nominal: ${spawnData.nominal}).`;
        }
      }
      
      if (recommendation) {
        priceRecommendations.push({
          className: item.className,
          displayName: item.displayName,
          currentAvgPrice: item.avgPrice,
          purchases: item.purchases,
          sales: item.sales,
          totalVolume,
          buyRatio: Math.round(buyRatio * 100),
          recommendation,
          reason,
          severity,
          suggestedChange,
          suggestedPrice: Math.max(1, item.avgPrice + suggestedChange),
          spawnInfo,
          priceRarityAlignment: spawnAnalysis?.priceRarityAlignment || null
        });
      }
    }
    
    // Sort recommendations by severity and volume
    const severityOrder = { critical: 0, warning: 1, info: 2 };
    priceRecommendations.sort((a, b) => {
      if (severityOrder[a.severity] !== severityOrder[b.severity]) {
        return severityOrder[a.severity] - severityOrder[b.severity];
      }
      return b.totalVolume - a.totalVolume;
    });
    
    // Calculate economy health indicators
    const netMoneyFlow = totalMoneySpent - totalMoneyEarned; // Positive = money leaving economy (purchases)
    const purchaseToSaleRatio = totalSales > 0 ? (totalPurchases / totalSales).toFixed(2) : totalPurchases;
    const avgTransactionValue = totalTransactions > 0 ? Math.round((totalMoneySpent + totalMoneyEarned) / totalTransactions) : 0;
    
    // Economy health score (0-100)
    // Based on: balance of buy/sell, activity level, diversity of items
    let economyHealth = 50; // Base score
    
    // Adjust for buy/sell balance (ideal is around 1:1)
    const ratio = totalSales > 0 ? totalPurchases / totalSales : 10;
    if (ratio >= 0.5 && ratio <= 2) economyHealth += 20;
    else if (ratio >= 0.25 && ratio <= 4) economyHealth += 10;
    else economyHealth -= 10;
    
    // Adjust for item diversity
    const itemDiversity = itemStats.size;
    if (itemDiversity >= 50) economyHealth += 15;
    else if (itemDiversity >= 20) economyHealth += 10;
    else if (itemDiversity >= 10) economyHealth += 5;
    
    // Adjust for trader participation
    const uniqueTraders = uniqueTradersSet.size;
    if (uniqueTraders >= 10) economyHealth += 15;
    else if (uniqueTraders >= 5) economyHealth += 10;
    else if (uniqueTraders >= 2) economyHealth += 5;
    
    economyHealth = Math.min(100, Math.max(0, economyHealth));

    const summary = {
      totalTransactions,
      totalPurchases,
      totalSales,
      totalMoneySpent,
      totalMoneyEarned,
      netMoneyFlow,
      uniqueTraders,
      uniqueItems: itemStats.size,
      avgTransactionValue,
      purchaseToSaleRatio: parseFloat(purchaseToSaleRatio),
      economyHealth,
      dataAgeDays,
      hasMinimumData,
      oldestTransaction: oldestTransaction?.toISOString() || null,
      newestTransaction: newestTransaction?.toISOString() || null
    };

    const dailyTrend = buildDailyTrend(allTrades, filterStart, filterEnd);
    const marketForecast = buildMarketForecast(dailyTrend, summary);
    const itemForecasts = buildItemForecasts(allTrades, itemStats);
    
    res.json({
      summary,
      filter: {
        period: period || 'all',
        startDate: filterStart?.toISOString() || null,
        endDate: filterEnd?.toISOString() || null
      },
      dataSources: {
        archivedTrades: archivedTrades.length,
        jsonFiles: files.filter(f => f.endsWith("_trades.json")).length,
        totalTradesProcessed: totalTransactions,
        typeFiles: spawnStatsData.sourceFileCount,
        economyCoreTypeFiles: spawnStatsData.economyCore?.loadedFileRefs || 0
      },
      spawnStats: spawnStatsData,
      topItemsByVolume,
      topItemsBySpending,
      topSoldItems,
      topTraders,
      topZones,
      hourlyActivity,
      dailyTrend,
      marketForecast,
      itemForecasts,
      recentTransactions: latestTransactions,
      priceRecommendations: priceRecommendations.slice(0, 30),
      generatedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error("Economy stats error:", err);
    res.status(500).json({ error: "Failed to generate economy stats" });
  }
});

// Get spawn data for all items or search
router.get("/spawn-data", async (req, res) => {
  try {
    const { search, category, spawnRating, limit = 100 } = req.query;
    const typesData = await loadTypesData();
    
    let items = [...typesData.values()];
    
    // Filter by search term
    if (search) {
      const searchLower = search.toLowerCase();
      items = items.filter(item => 
        item.className.toLowerCase().includes(searchLower)
      );
    }
    
    // Filter by category
    if (category) {
      items = items.filter(item => item.category === category);
    }
    
    // Filter by spawn rating
    if (spawnRating) {
      items = items.filter(item => item.spawnRating === spawnRating);
    }
    
    // Sort by nominal (highest spawners first)
    items.sort((a, b) => b.nominal - a.nominal);
    
    // Limit results
    items = items.slice(0, parseInt(limit));
    
    const stats = await getSpawnStats();
    
    res.json({
      items,
      stats,
      sources: stats.sources,
      missingFiles: stats.missingFiles,
      errors: stats.errors,
      total: typesData.size,
      filtered: items.length
    });
  } catch (err) {
    console.error("Spawn data error:", err);
    res.status(500).json({ error: "Failed to get spawn data" });
  }
});

// Get spawn data for a specific item
router.get("/spawn-data/:className", async (req, res) => {
  try {
    const { className } = req.params;
    const typesData = await loadTypesData();
    
    const item = typesData.get(className.toLowerCase());
    
    if (!item) {
      const stats = await getSpawnStats();
      return res.status(404).json({
        error: "Item not found in configured economy type files",
        sources: stats.sources,
      });
    }
    
    res.json(item);
  } catch (err) {
    console.error("Spawn data error:", err);
    res.status(500).json({ error: "Failed to get spawn data" });
  }
});

export default router;
