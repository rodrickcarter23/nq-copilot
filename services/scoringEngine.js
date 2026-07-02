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
      long: 0,
      short: 0,
      ema9: 0,
      ema20: 0,
      ema50: 0,
      vwap: 0,
      rsi: 50,
    };
  }

  const indicators = calculateIndicators(candles);
  const price = Number(candles[candles.length - 1].close);

  let long = 0;
  let short = 0;

  if (price > indicators.vwap) long += 20;
  if (price < indicators.vwap) short += 20;

  if (indicators.ema9 > indicators.ema20 && indicators.ema20 > indicators.ema50) {
    long += 25;
  }

  if (indicators.ema9 < indicators.ema20 && indicators.ema20 < indicators.ema50) {
    short += 25;
  }

  if (price > indicators.ema9) long += 15;
  if (price < indicators.ema9) short += 15;

  if (indicators.rsi >= 52 && indicators.rsi <= 75) long += 15;
  if (indicators.rsi <= 48 && indicators.rsi >= 25) short += 15;

  if (price > Number(candles[0].open)) long += 15;
  if (price < Number(candles[0].open)) short += 15;

  const difference = Math.abs(long - short);

  let bias = "NEUTRAL";
  if (long > short && difference >= 8) bias = "LONG";
  if (short > long && difference >= 8) bias = "SHORT";

  return {
    bias,
    score: Math.max(long, short),
    long,
    short,
    ema9: round(indicators.ema9),
    ema20: round(indicators.ema20),
    ema50: round(indicators.ema50),
    vwap: round(indicators.vwap),
    rsi: round(indicators.rsi),
  };
}

function calculateScore(data = {}) {
  if (data.mode === "STALE" || data.mode === "FALLBACK") {
    return staleScore(data.mode);
  }

  const price = Number(data.price || 0);
  const open = Number(data.open || price);
  const high = Number(data.high || price);
  const low = Number(data.low || price);
  const candles = Array.isArray(data.candles) ? data.candles : [];

  if (!price || !candles.length) {
    return staleScore("NO DATA");
  }

  const indicators = calculateIndicators(candles);
  const structure = analyzeStructure(candles);

  const tf = data.timeframes || {};

  const multiTimeframe = {
    "1m": analyzeTimeframe(tf["1m"] || candles),
    "5m": analyzeTimeframe(tf["5m"] || []),
    "15m": analyzeTimeframe(tf["15m"] || []),
    "1h": analyzeTimeframe(tf["1h"] || []),
  };

  const tfValues = Object.values(multiTimeframe);
  const longTF = tfValues.filter((t) => t.bias === "LONG").length;
  const shortTF = tfValues.filter((t) => t.bias === "SHORT").length;

  const range = Math.max(high - low, 0.25);
  const midpoint = (high + low) / 2;
  const positionInRange = ((price - low) / range) * 100;

  let longScore = 0;
  let shortScore = 0;

  const reasons = [];
  const warnings = [];

  if (price > open) {
    longScore += 8;
    reasons.push("Price is above session open.");
  }

  if (price < open) {
    shortScore += 8;
    reasons.push("Price is below session open.");
  }

  if (price > midpoint) {
    longScore += 8;
    reasons.push("Price is above session midpoint.");
  }

  if (price < midpoint) {
    shortScore += 8;
    reasons.push("Price is below session midpoint.");
  }

  if (price > indicators.vwap) {
    longScore += 12;
    reasons.push("Price is above VWAP.");
  }

  if (price < indicators.vwap) {
    shortScore += 12;
    reasons.push("Price is below VWAP.");
  }

  if (indicators.ema9 > indicators.ema20 && indicators.ema20 > indicators.ema50) {
    longScore += 15;
    reasons.push("EMA trend supports LONG.");
  }

  if (indicators.ema9 < indicators.ema20 && indicators.ema20 < indicators.ema50) {
    shortScore += 15;
    reasons.push("EMA trend supports SHORT.");
  }

  if (price > indicators.ema9) {
    longScore += 8;
    reasons.push("Price is above EMA 9.");
  }

  if (price < indicators.ema9) {
    shortScore += 8;
    reasons.push("Price is below EMA 9.");
  }

  if (structure.structureBias === "LONG") {
    longScore += 15;
    reasons.push("Market structure favors LONG.");
  }

  if (structure.structureBias === "SHORT") {
    shortScore += 15;
    reasons.push("Market structure favors SHORT.");
  }

  if (structure.bullishBreak) {
    longScore += 8;
    reasons.push("Bullish break of structure detected.");
  }

  if (structure.bearishBreak) {
    shortScore += 8;
    reasons.push("Bearish break of structure detected.");
  }

  if (longTF >= 2) {
    longScore += 15;
    reasons.push(`${longTF} timeframes support LONG.`);
  }

  if (shortTF >= 2) {
    shortScore += 15;
    reasons.push(`${shortTF} timeframes support SHORT.`);
  }

  if (indicators.rsi >= 52 && indicators.rsi <= 75) {
    longScore += 8;
    reasons.push("RSI supports LONG momentum.");
  }

  if (indicators.rsi <= 48 && indicators.rsi >= 25) {
    shortScore += 8;
    reasons.push("RSI supports SHORT momentum.");
  }

  if (indicators.rvol >= 1.2) {
    longScore += 4;
    shortScore += 4;
    reasons.push("Relative volume is acceptable.");
  } else {
    warnings.push("Relative volume is weak.");
  }

  if (positionInRange >= 65) {
    longScore += 5;
    reasons.push("Price is trading in the upper part of range.");
  }

  if (positionInRange <= 35) {
    shortScore += 5;
    reasons.push("Price is trading in the lower part of range.");
  }

  if (range >= 30) {
    longScore += 4;
    shortScore += 4;
    reasons.push("Volatility is healthy.");
  } else {
    warnings.push("Volatility is low.");
  }

  longScore = clamp(Math.round(longScore));
  shortScore = clamp(Math.round(shortScore));

  const difference = Math.abs(longScore - shortScore);

  let bias = "NEUTRAL";
  if (longScore > shortScore && difference >= 8) bias = "LONG";
  if (shortScore > longScore && difference >= 8) bias = "SHORT";

  const score = Math.max(longScore, shortScore);

  const total = longScore + shortScore || 1;
  const longProbability = Math.round((longScore / total) * 100);
  const shortProbability = 100 - longProbability;

  const { grade, confidence, signal } = buildGradeSignal(bias, score);

  const entry = bias === "SHORT" ? price - 2 : bias === "LONG" ? price + 2 : price;
  const stop = bias === "SHORT" ? price + 22 : bias === "LONG" ? price - 22 : 0;
  const target1 = bias === "SHORT" ? price - 40 : bias === "LONG" ? price + 40 : 0;
  const target2 = bias === "SHORT" ? price - 70 : bias === "LONG" ? price + 70 : 0;

  const risk = Math.abs(entry - stop);
  const reward = Math.abs(target2 - entry);
  const riskReward = risk > 0 ? reward / risk : 0;

  return {
    score,
    grade,
    confidence,
    bias,
    direction: bias,
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

function buildGradeSignal(bias, score) {
  if (bias !== "LONG" && bias !== "SHORT") {
    return {
      grade: "F",
      confidence: "LOW",
      signal: "NO TRADE - MIXED CONDITIONS",
    };
  }

  if (score >= 90) {
    return {
      grade: "A+",
      confidence: "EXTREME",
      signal: `${bias} A+ SETUP`,
    };
  }

  if (score >= 80) {
    return {
      grade: "A",
      confidence: "HIGH",
      signal: `${bias} A SETUP`,
    };
  }

  if (score >= 70) {
    return {
      grade: "B+",
      confidence: "MEDIUM-HIGH",
      signal: `${bias} VERY GOOD SETUP`,
    };
  }

  if (score >= 60) {
    return {
      grade: "B",
      confidence: "MEDIUM",
      signal: `${bias} GOOD SETUP`,
    };
  }

  if (score >= 50) {
    return {
      grade: "C",
      confidence: "LOW-MEDIUM",
      signal: `${bias} WEAK SETUP`,
    };
  }

  return {
    grade: "D",
    confidence: "LOW",
    signal: `${bias} WATCH ONLY`,
  };
}

function staleScore(mode) {
  return {
    score: 0,
    grade: "F",
    confidence: "LOW",
    bias: "NEUTRAL",
    direction: "NEUTRAL",
    signal: `NO TRADE - ${mode}`,

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
    warnings: [`Market data mode is ${mode}. Do not trade from this signal.`],
  };
}

module.exports = { calculateScore };