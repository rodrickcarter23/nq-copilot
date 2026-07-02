function detectSetup(data = {}, analysis = {}) {
  const price = Number(data.price || 0);
  const indicators = analysis.indicators || {};
  const structure = analysis.structure || {};
  const mtf = analysis.multiTimeframe || {};

  const reasons = [];
  const warnings = [];

  let longScore = 0;
  let shortScore = 0;

  const vwap = Number(indicators.vwap || price);
  const ema9 = Number(indicators.ema9 || price);
  const ema20 = Number(indicators.ema20 || price);
  const ema50 = Number(indicators.ema50 || price);
  const rsi = Number(indicators.rsi || 50);

  const aboveVWAP = price > vwap;
  const belowVWAP = price < vwap;

  const bullishEMA = ema9 > ema20 && ema20 > ema50;
  const bearishEMA = ema9 < ema20 && ema20 < ema50;

  const tfValues = Object.values(mtf || {});
  const tfLong = tfValues.filter((t) => t?.bias === "LONG").length;
  const tfShort = tfValues.filter((t) => t?.bias === "SHORT").length;

  if (analysis.bias === "LONG") {
    longScore += 20;
    reasons.push("Main analysis bias supports LONG.");
  }

  if (analysis.bias === "SHORT") {
    shortScore += 20;
    reasons.push("Main analysis bias supports SHORT.");
  }

  if (aboveVWAP) {
    longScore += 15;
    reasons.push("Price is above VWAP.");
  }

  if (belowVWAP) {
    shortScore += 15;
    reasons.push("Price is below VWAP.");
  }

  if (bullishEMA) {
    longScore += 20;
    reasons.push("EMA trend supports LONG.");
  }

  if (bearishEMA) {
    shortScore += 20;
    reasons.push("EMA trend supports SHORT.");
  }

  if (structure.structureBias === "LONG") {
    longScore += 20;
    reasons.push("Market structure supports LONG.");
  }

  if (structure.structureBias === "SHORT") {
    shortScore += 20;
    reasons.push("Market structure supports SHORT.");
  }

  if (structure.bullishBreak) {
    longScore += 10;
    reasons.push("Bullish structure break detected.");
  }

  if (structure.bearishBreak) {
    shortScore += 10;
    reasons.push("Bearish structure break detected.");
  }

  if (tfLong >= 2) {
    longScore += 15;
    reasons.push(`${tfLong} timeframes support LONG.`);
  }

  if (tfShort >= 2) {
    shortScore += 15;
    reasons.push(`${tfShort} timeframes support SHORT.`);
  }

  if (rsi >= 52 && rsi <= 75) {
    longScore += 8;
    reasons.push("RSI supports LONG momentum.");
  }

  if (rsi <= 48 && rsi >= 25) {
    shortScore += 8;
    reasons.push("RSI supports SHORT momentum.");
  }

  longScore = clamp(longScore);
  shortScore = clamp(shortScore);

  let direction = "NEUTRAL";
  let score = Math.max(longScore, shortScore);

  if (longScore > shortScore + 8) direction = "LONG";
  else if (shortScore > longScore + 8) direction = "SHORT";

  let setupName = "NO CLEAN SETUP";

  if (direction === "LONG") {
    if (score >= 85) setupName = "A+ LONG CONTINUATION";
    else if (score >= 75) setupName = "A LONG SETUP";
    else if (score >= 65) setupName = "B+ LONG WATCH";
    else if (score >= 55) setupName = "LONG WATCH";
  }

  if (direction === "SHORT") {
    if (score >= 85) setupName = "A+ SHORT CONTINUATION";
    else if (score >= 75) setupName = "A SHORT SETUP";
    else if (score >= 65) setupName = "B+ SHORT WATCH";
    else if (score >= 55) setupName = "SHORT WATCH";
  }

  if (direction === "NEUTRAL") {
    warnings.push("No strong setup direction yet.");
  }

  if (analysis.warnings?.length) {
    warnings.push(...analysis.warnings.slice(0, 3));
  }

  const quality = getQuality(score);

  return {
    setupName,
    direction,
    quality,
    score,
    longScore,
    shortScore,
    reasons,
    warnings,
  };
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function getQuality(score) {
  if (score >= 90) return "A+";
  if (score >= 80) return "A";
  if (score >= 70) return "B+";
  if (score >= 60) return "B";
  if (score >= 50) return "C";
  return "LOW";
}

module.exports = { detectSetup };