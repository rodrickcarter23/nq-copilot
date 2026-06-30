const { calculateIndicators } = require("./indicators");
const { analyzeStructure } = require("./marketStructure");

function round(value, decimals = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Number(n.toFixed(decimals));
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function analyzeTimeframe(candles = []) {
  if (!Array.isArray(candles) || candles.length < 20) {
    return {
      bias: "NEUTRAL",
      score: 0,
      ema9: 0,
      ema20: 0,
      ema50: 0,
      vwap: 0,
      rsi: 50,
    };
  }

  const indicators = calculateIndicators(candles);
  const price = candles[candles.length - 1].close;

  let long = 0;
  let short = 0;

  if (price > indicators.vwap) long += 25;
  else short += 25;

  if (
    indicators.ema9 > indicators.ema20 &&
    indicators.ema20 > indicators.ema50 &&
    price > indicators.ema9
  ) {
    long += 35;
  } else if (
    indicators.ema9 < indicators.ema20 &&
    indicators.ema20 < indicators.ema50 &&
    price < indicators.ema9
  ) {
    short += 35;
  }

  if (indicators.rsi >= 55 && indicators.rsi <= 75) long += 20;
  else if (indicators.rsi <= 45 && indicators.rsi >= 25) short += 20;

  if (price > candles[0].open) long += 20;
  else short += 20;

  const bias =
    long > short + 15 ? "LONG" : short > long + 15 ? "SHORT" : "NEUTRAL";

  return {
    bias,
    score: Math.max(long, short),
    long,
    short,
    ema9: indicators.ema9,
    ema20: indicators.ema20,
    ema50: indicators.ema50,
    vwap: indicators.vwap,
    rsi: indicators.rsi,
  };
}

function calculateScore(data) {
 if (data.mode === "STALE" || data.mode === "FALLBACK") {
    return {
      score: 0,
      grade: "F",
      confidence: "LOW",
      bias: "NEUTRAL",
      signal: "NO TRADE - DATA STALE",

      longScore: 0,
      shortScore: 0,
      longProbability: 50,
      shortProbability: 50,

      entry: 0,
      stop: 0,
      target1: 0,
      target2: 0,
      target: 0,
      riskReward: 0,

      range: 0,
      midpoint: 0,
      positionInRange: 0,

      indicators: {},
      structure: {},
      multiTimeframe: {},

      reasons: [],
      warnings: ["Market data is stale. Do not trade from this signal."],
    };
  }

  const price = Number(data.price || 0);
  const open = Number(data.open || price);
  const high = Number(data.high || price);
  const low = Number(data.low || price);
  const candles = Array.isArray(data.candles) ? data.candles : [];

  const indicators = calculateIndicators(candles);
  const structure = analyzeStructure(candles);

  const tf = data.timeframes || {};
  const multiTimeframe = {
    "1m": analyzeTimeframe(tf["1m"] || candles),
    "5m": analyzeTimeframe(tf["5m"] || []),
    "15m": analyzeTimeframe(tf["15m"] || []),
    "1h": analyzeTimeframe(tf["1h"] || []),
  };

  const tfBiases = Object.values(multiTimeframe).map((t) => t.bias);
  const longTF = tfBiases.filter((b) => b === "LONG").length;
  const shortTF = tfBiases.filter((b) => b === "SHORT").length;

  const range = Math.max(high - low, 0.25);
  const midpoint = (high + low) / 2;
  const positionInRange = ((price - low) / range) * 100;

  let longScore = 0;
  let shortScore = 0;
  const reasons = [];
  const warnings = [];

  if (price > open) {
    longScore += 8;
    reasons.push("Price above session open");
  } else {
    shortScore += 8;
    reasons.push("Price below session open");
  }

  if (price > midpoint) {
    longScore += 8;
    reasons.push("Price above session midpoint");
  } else {
    shortScore += 8;
    reasons.push("Price below session midpoint");
  }

  if (price > indicators.vwap) {
    longScore += 12;
    reasons.push("Price above VWAP");
  } else {
    shortScore += 12;
    reasons.push("Price below VWAP");
  }

  if (
    indicators.ema9 > indicators.ema20 &&
    indicators.ema20 > indicators.ema50 &&
    price > indicators.ema9
  ) {
    longScore += 18;
    reasons.push("EMA trend aligned bullish");
  } else if (
    indicators.ema9 < indicators.ema20 &&
    indicators.ema20 < indicators.ema50 &&
    price < indicators.ema9
  ) {
    shortScore += 18;
    reasons.push("EMA trend aligned bearish");
  } else {
    warnings.push("EMA trend mixed");
  }

  if (structure.structureBias === "LONG") {
    longScore += 15;
    reasons.push("Bullish market structure");
  } else if (structure.structureBias === "SHORT") {
    shortScore += 15;
    reasons.push("Bearish market structure");
  } else {
    warnings.push("Market structure mixed");
  }

  if (structure.breakOfStructure && structure.structureBias === "LONG") {
    longScore += 8;
    reasons.push("Bullish break of structure");
  }

  if (structure.breakOfStructure && structure.structureBias === "SHORT") {
    shortScore += 8;
    reasons.push("Bearish break of structure");
  }

  if (structure.changeOfCharacter) {
    warnings.push("Change of character detected");
  }

  if (longTF >= 3) {
    longScore += 20;
    reasons.push("Multi-timeframe trend supports LONG");
  } else if (shortTF >= 3) {
    shortScore += 20;
    reasons.push("Multi-timeframe trend supports SHORT");
  } else {
    warnings.push("Multi-timeframe trend is mixed");
  }

  if (indicators.rsi >= 55 && indicators.rsi <= 75) {
    longScore += 8;
    reasons.push("RSI supports bullish momentum");
  } else if (indicators.rsi <= 45 && indicators.rsi >= 25) {
    shortScore += 8;
    reasons.push("RSI supports bearish momentum");
  } else if (indicators.rsi > 80) {
    warnings.push("RSI overbought");
  } else if (indicators.rsi < 20) {
    warnings.push("RSI oversold");
  }

  if (indicators.rvol >= 1.5) {
    longScore += 5;
    shortScore += 5;
    reasons.push("Relative volume elevated");
  } else {
    warnings.push("Relative volume normal or weak");
  }

  if (positionInRange >= 70) {
    longScore += 6;
    reasons.push("Price trading in upper range");
  } else if (positionInRange <= 30) {
    shortScore += 6;
    reasons.push("Price trading in lower range");
  } else {
    warnings.push("Price is mid-range");
  }

  if (range >= 40) {
    longScore += 5;
    shortScore += 5;
    reasons.push("Healthy volatility");
  } else {
    warnings.push("Low volatility");
  }

  longScore = clamp(longScore);
  shortScore = clamp(shortScore);

  const difference = Math.abs(longScore - shortScore);

  let bias = "NEUTRAL";
  if (longScore > shortScore && difference >= 15) bias = "LONG";
  if (shortScore > longScore && difference >= 15) bias = "SHORT";

  const score = Math.max(longScore, shortScore);

  let longProbability = 50;
  let shortProbability = 50;

  if (bias !== "NEUTRAL") {
    const total = longScore + shortScore || 1;
    longProbability = Math.round((longScore / total) * 100);
    shortProbability = 100 - longProbability;
  }

  let grade = "F";
  let confidence = "LOW";
  let signal = "NO TRADE - MIXED CONDITIONS";

  if (bias !== "NEUTRAL" && score >= 90) {
    grade = "A+";
    confidence = "EXTREME";
    signal = `${bias} A+ SETUP`;
  } else if (bias !== "NEUTRAL" && score >= 80) {
    grade = "A";
    confidence = "HIGH";
    signal = `${bias} A SETUP`;
  } else if (bias !== "NEUTRAL" && score >= 70) {
    grade = "B+";
    confidence = "MEDIUM-HIGH";
    signal = `${bias} VERY GOOD SETUP`;
  } else if (bias !== "NEUTRAL" && score >= 60) {
    grade = "B";
    confidence = "MEDIUM";
    signal = `${bias} GOOD SETUP`;
  } else if (bias !== "NEUTRAL" && score >= 50) {
    grade = "C";
    confidence = "LOW-MEDIUM";
    signal = `${bias} WEAK SETUP`;
  }

  const entry = bias === "SHORT" ? price - 2 : price + 2;
  const stop = bias === "SHORT" ? price + 22 : price - 22;
  const target1 = bias === "SHORT" ? price - 40 : price + 40;
  const target2 = bias === "SHORT" ? price - 70 : price + 70;

  const risk = Math.abs(entry - stop);
  const reward = Math.abs(target2 - entry);
  const riskReward = risk > 0 ? reward / risk : 0;

  return {
    score,
    grade,
    confidence,
    bias,
    signal,

    longScore,
    shortScore,
    longProbability,
    shortProbability,

    entry: round(entry),
    stop: round(stop),
    target1: round(target1),
    target2: round(target2),
    target: round(target2),
    riskReward: round(riskReward),

    range: round(range),
    midpoint: round(midpoint),
    positionInRange: round(positionInRange, 1),

    indicators,
    structure,
    multiTimeframe,

    reasons,
    warnings,
  };
}

module.exports = { calculateScore };