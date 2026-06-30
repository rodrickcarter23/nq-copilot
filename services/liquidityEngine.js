function round(value, decimals = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Number(n.toFixed(decimals));
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function detectLiquidity(market, analysis = {}) {
  const candles = market.candles || [];
  const price = Number(market.price || 0);
  const structure = analysis.structure || {};
  const indicators = analysis.indicators || {};

  if (candles.length < 40 || !price) {
    return emptyLiquidity("Not enough candle data for liquidity analysis.");
  }

  const recent = candles.slice(-80);
  const atr = Number(indicators.atr || averageRange(recent) || 10);

  const swingHighs = findSwingHighs(recent);
  const swingLows = findSwingLows(recent);

  const equalHighs = findEqualLevels(swingHighs, atr * 0.35);
  const equalLows = findEqualLevels(swingLows, atr * 0.35);

  const buyLiquidity = equalHighs.length
    ? nearestAbove(price, equalHighs.map((x) => x.level))
    : nearestAbove(price, swingHighs.map((x) => x.price));

  const sellLiquidity = equalLows.length
    ? nearestBelow(price, equalLows.map((x) => x.level))
    : nearestBelow(price, swingLows.map((x) => x.price));

  const last = recent[recent.length - 1];
  const prev = recent[recent.length - 2];

  const buySideSweep =
    buyLiquidity > 0 &&
    Number(last.high) > buyLiquidity &&
    Number(last.close) < buyLiquidity;

  const sellSideSweep =
    sellLiquidity > 0 &&
    Number(last.low) < sellLiquidity &&
    Number(last.close) > sellLiquidity;

  const sweep = buySideSweep || sellSideSweep;

  let sweepType = "NONE";
  if (buySideSweep) sweepType = "BUY SIDE SWEEP";
  if (sellSideSweep) sweepType = "SELL SIDE SWEEP";

  const distanceToBuy = buyLiquidity > 0 ? Math.abs(buyLiquidity - price) : Infinity;
  const distanceToSell = sellLiquidity > 0 ? Math.abs(price - sellLiquidity) : Infinity;

  const nearestLiquidity =
    distanceToBuy <= distanceToSell ? buyLiquidity : sellLiquidity;

  const nearestSide =
    distanceToBuy <= distanceToSell ? "BUY SIDE" : "SELL SIDE";

  let bias = "NEUTRAL";
  let score = 50;
  let strength = 50;

  const reasons = [];
  const warnings = [];

  if (equalHighs.length) {
    score += 10;
    reasons.push("Equal highs detected above price.");
  }

  if (equalLows.length) {
    score += 10;
    reasons.push("Equal lows detected below price.");
  }

  if (buySideSweep) {
    bias = "SELL SIDE";
    score += 20;
    strength += 25;
    reasons.push("Buy-side liquidity sweep detected.");
  }

  if (sellSideSweep) {
    bias = "BUY SIDE";
    score += 20;
    strength += 25;
    reasons.push("Sell-side liquidity sweep detected.");
  }

  if (!sweep) {
    bias = nearestSide;
    warnings.push("No liquidity sweep confirmed yet.");
  }

  if (nearestLiquidity > 0 && Math.abs(price - nearestLiquidity) <= atr * 2) {
    score += 10;
    strength += 10;
    reasons.push("Price is near a liquidity pool.");
  } else {
    warnings.push("Price is not close to the nearest liquidity pool yet.");
  }

  if (structure.structureBias === "LONG" && bias === "BUY SIDE") {
    score += 10;
    reasons.push("Liquidity bias aligns with bullish structure.");
  }

  if (structure.structureBias === "SHORT" && bias === "SELL SIDE") {
    score += 10;
    reasons.push("Liquidity bias aligns with bearish structure.");
  }

  const nextMagnet =
    bias === "BUY SIDE"
      ? buyLiquidity || nearestLiquidity
      : bias === "SELL SIDE"
      ? sellLiquidity || nearestLiquidity
      : nearestLiquidity;

  score = clamp(Math.round(score));
  strength = clamp(Math.round(strength));

  return {
    bias,
    liquidityBias: bias,
    score,
    liquidityScore: score,

    buyLiquidity: round(buyLiquidity),
    sellLiquidity: round(sellLiquidity),
    nearestLiquidity: round(nearestLiquidity),
    nearestSide,

    sweep,
    liquiditySweep: sweep,
    sweepType,
    stopHunt: sweep,
    liquidityGrab: sweep,

    nextMagnet: round(nextMagnet),
    strength,
    liquidityStrength: strength,

    equalHighsDetected: equalHighs.length > 0,
    equalLowsDetected: equalLows.length > 0,
    equalHighsCount: equalHighs.length,
    equalLowsCount: equalLows.length,

    summary: buildSummary(bias, sweep, sweepType, nearestSide),
    reasons,
    warnings,
    checklist: [
      { name: "Equal highs detected", passed: equalHighs.length > 0 },
      { name: "Equal lows detected", passed: equalLows.length > 0 },
      { name: "Liquidity sweep confirmed", passed: sweep },
      { name: "Price near liquidity pool", passed: nearestLiquidity > 0 && Math.abs(price - nearestLiquidity) <= atr * 2 },
      { name: "Liquidity aligns with structure", passed:
          (structure.structureBias === "LONG" && bias === "BUY SIDE") ||
          (structure.structureBias === "SHORT" && bias === "SELL SIDE")
      },
    ],
  };
}

function buildSummary(bias, sweep, sweepType, nearestSide) {
  if (sweep) {
    return `${sweepType} detected. Watch for reversal or continuation confirmation after the stop hunt.`;
  }

  if (bias === "BUY SIDE") {
    return "Buy-side liquidity is the nearest magnet. Price may seek highs before a clean reversal or continuation.";
  }

  if (bias === "SELL SIDE") {
    return "Sell-side liquidity is the nearest magnet. Price may seek lows before a clean reversal or continuation.";
  }

  return `No confirmed sweep yet. Nearest liquidity is ${nearestSide}.`;
}

function findSwingHighs(candles) {
  const highs = [];

  for (let i = 2; i < candles.length - 2; i++) {
    const c = candles[i];
    const high = Number(c.high);

    if (
      high > Number(candles[i - 1].high) &&
      high > Number(candles[i - 2].high) &&
      high > Number(candles[i + 1].high) &&
      high > Number(candles[i + 2].high)
    ) {
      highs.push({
        price: high,
        index: i,
        timestamp: c.timestamp,
      });
    }
  }

  return highs;
}

function findSwingLows(candles) {
  const lows = [];

  for (let i = 2; i < candles.length - 2; i++) {
    const c = candles[i];
    const low = Number(c.low);

    if (
      low < Number(candles[i - 1].low) &&
      low < Number(candles[i - 2].low) &&
      low < Number(candles[i + 1].low) &&
      low < Number(candles[i + 2].low)
    ) {
      lows.push({
        price: low,
        index: i,
        timestamp: c.timestamp,
      });
    }
  }

  return lows;
}

function findEqualLevels(points, tolerance) {
  const levels = [];

  for (let i = 0; i < points.length; i++) {
    const group = [points[i]];

    for (let j = i + 1; j < points.length; j++) {
      if (Math.abs(points[i].price - points[j].price) <= tolerance) {
        group.push(points[j]);
      }
    }

    if (group.length >= 2) {
      const level =
        group.reduce((sum, p) => sum + Number(p.price), 0) / group.length;

      levels.push({
        level,
        count: group.length,
        points: group,
      });
    }
  }

  return levels;
}

function nearestAbove(price, levels) {
  const above = levels.filter((level) => Number(level) > price);
  if (!above.length) return 0;
  return Math.min(...above.map(Number));
}

function nearestBelow(price, levels) {
  const below = levels.filter((level) => Number(level) < price);
  if (!below.length) return 0;
  return Math.max(...below.map(Number));
}

function averageRange(candles) {
  if (!candles.length) return 10;
  return (
    candles.reduce(
      (sum, c) => sum + Math.abs(Number(c.high) - Number(c.low)),
      0
    ) / candles.length
  );
}

function emptyLiquidity(summary) {
  return {
    bias: "NEUTRAL",
    liquidityBias: "NEUTRAL",
    score: 0,
    liquidityScore: 0,
    buyLiquidity: 0,
    sellLiquidity: 0,
    nearestLiquidity: 0,
    nearestSide: "NONE",
    sweep: false,
    liquiditySweep: false,
    sweepType: "NONE",
    stopHunt: false,
    liquidityGrab: false,
    nextMagnet: 0,
    strength: 0,
    liquidityStrength: 0,
    equalHighsDetected: false,
    equalLowsDetected: false,
    equalHighsCount: 0,
    equalLowsCount: 0,
    summary,
    reasons: [],
    warnings: [summary],
    checklist: [],
  };
}

module.exports = { detectLiquidity };