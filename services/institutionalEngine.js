function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function gradeFromScore(score) {
  if (score >= 90) return "A+";
  if (score >= 80) return "A";
  if (score >= 70) return "B+";
  if (score >= 60) return "B";
  if (score >= 50) return "C";
  return "D";
}

function confidenceFromScore(score) {
  if (score >= 90) return "EXTREME";
  if (score >= 80) return "HIGH";
  if (score >= 70) return "MEDIUM-HIGH";
  if (score >= 60) return "MEDIUM";
  return "LOW";
}

function countBiases(mtf = {}) {
  const values = Object.values(mtf || {});
  return {
    long: values.filter((t) => t?.bias === "LONG").length,
    short: values.filter((t) => t?.bias === "SHORT").length,
  };
}

function buildInstitutionalDecision(market, analysis = {}, setup = {}) {
  const reasons = [];
  const warnings = [];
  const checklist = [];

  if (!market || market.mode === "FALLBACK") {
    return noTrade("Market data is unavailable.", "No reliable market data.");
  }

  if (market.mode === "STALE") {
    return noTrade(
      "Market data is stale. Do not trade from this signal.",
      "Market data is stale."
    );
  }

  const price = Number(market.price || 0);
  const indicators = analysis.indicators || {};
  const structure = analysis.structure || {};
  const mtf = analysis.multiTimeframe || {};

  const vwap = Number(indicators.vwap || price);
  const ema9 = Number(indicators.ema9 || price);
  const ema20 = Number(indicators.ema20 || price);
  const ema50 = Number(indicators.ema50 || price);
  const rsi = Number(indicators.rsi || 50);
  const rvol = Number(indicators.rvol || 1);

  const mtfVotes = countBiases(mtf);

  let longScore = 0;
  let shortScore = 0;

  function addLong(name, passed, points, note) {
    checklist.push({ name, side: "LONG", passed, points: passed ? points : 0, note });
    if (passed) {
      longScore += points;
      reasons.push(note || name);
    }
  }

  function addShort(name, passed, points, note) {
    checklist.push({ name, side: "SHORT", passed, points: passed ? points : 0, note });
    if (passed) {
      shortScore += points;
      reasons.push(note || name);
    }
  }

  function addWarningIfBothFail(name, longPassed, shortPassed) {
    if (!longPassed && !shortPassed) warnings.push(`${name} not confirmed`);
  }

  const dataUsable = market.mode === "LIVE" || market.mode === "DELAYED";
  if (dataUsable) {
    longScore += 10;
    shortScore += 10;
    checklist.push({
      name: "Data usable",
      side: "BOTH",
      passed: true,
      points: 10,
      note: `Data mode is ${market.mode}`,
    });
    reasons.push(`Data mode is ${market.mode}`);
  } else {
    warnings.push(`Data mode is ${market.mode}`);
  }

  const longVWAP = price > vwap;
  const shortVWAP = price < vwap;
  addLong("Price above VWAP", longVWAP, 12, "Price is trading above VWAP.");
  addShort("Price below VWAP", shortVWAP, 12, "Price is trading below VWAP.");
  addWarningIfBothFail("VWAP location", longVWAP, shortVWAP);

  const longEMA = ema9 > ema20 && ema20 > ema50 && price > ema9;
  const shortEMA = ema9 < ema20 && ema20 < ema50 && price < ema9;
  addLong("Bullish EMA alignment", longEMA, 15, "EMA alignment supports buyers.");
  addShort("Bearish EMA alignment", shortEMA, 15, "EMA alignment supports sellers.");
  addWarningIfBothFail("EMA alignment", longEMA, shortEMA);

  const longStructure = structure.structureBias === "LONG";
  const shortStructure = structure.structureBias === "SHORT";
  addLong("Bullish structure", longStructure, 15, "Market structure supports buyers.");
  addShort("Bearish structure", shortStructure, 15, "Market structure supports sellers.");
  addWarningIfBothFail("Market structure", longStructure, shortStructure);

  const longBOS =
    structure.breakOfStructure === true && structure.structureBias === "LONG";
  const shortBOS =
    structure.breakOfStructure === true && structure.structureBias === "SHORT";
  addLong("Bullish break of structure", longBOS, 10, "Bullish break of structure confirmed.");
  addShort("Bearish break of structure", shortBOS, 10, "Bearish break of structure confirmed.");

  addLong(
    "Long multi-timeframe alignment",
    mtfVotes.long >= 3,
    15,
    `${mtfVotes.long} timeframes support LONG.`
  );

  addShort(
    "Short multi-timeframe alignment",
    mtfVotes.short >= 3,
    15,
    `${mtfVotes.short} timeframes support SHORT.`
  );

  const longRSI = rsi >= 50 && rsi <= 75;
  const shortRSI = rsi <= 50 && rsi >= 25;
  addLong("RSI supports long", longRSI, 8, "RSI supports bullish momentum.");
  addShort("RSI supports short", shortRSI, 8, "RSI supports bearish momentum.");

  const volumeOk = rvol >= 1;
  if (volumeOk) {
    longScore += 5;
    shortScore += 5;
    checklist.push({
      name: "Relative volume acceptable",
      side: "BOTH",
      passed: true,
      points: 5,
      note: "Relative volume is acceptable.",
    });
    reasons.push("Relative volume is acceptable.");
  } else {
    warnings.push("Relative volume is weak.");
  }

  const longSetup = setup.direction === "LONG" && Number(setup.score || 0) >= 60;
  const shortSetup = setup.direction === "SHORT" && Number(setup.score || 0) >= 60;
  addLong("Long setup detected", longSetup, 10, `${setup.setupName || "Long setup"} detected.`);
  addShort("Short setup detected", shortSetup, 10, `${setup.setupName || "Short setup"} detected.`);

  longScore = clamp(longScore);
  shortScore = clamp(shortScore);

  let direction = "NEUTRAL";
  let finalScore = 0;

  if (longScore > shortScore && longScore >= 50) {
    direction = "LONG";
    finalScore = longScore;
  } else if (shortScore > longScore && shortScore >= 50) {
    direction = "SHORT";
    finalScore = shortScore;
  } else {
    direction = "NEUTRAL";
    finalScore = Math.max(longScore, shortScore);
  }

  const grade = gradeFromScore(finalScore);
  const confidence = confidenceFromScore(finalScore);

  let decision = "NO TRADE";
  if (direction !== "NEUTRAL") {
    if (finalScore >= 90) decision = `A+ ${direction} SETUP`;
    else if (finalScore >= 80) decision = `A ${direction} SETUP`;
    else if (finalScore >= 70) decision = `B+ ${direction} SETUP`;
    else if (finalScore >= 60) decision = `${direction} WATCH`;
    else decision = "NO TRADE";
  }

  return {
    institutionalScore: finalScore,
    institutionalGrade: grade,
    decision,
    direction,
    confidence,

    longScore,
    shortScore,

    summary:
      direction === "NEUTRAL"
        ? "Institutional engine does not have enough confluence for a clean directional trade."
        : `Institutional engine favors ${direction}. ${decision}. Confirm on NinjaTrader/Tradovate before entering.`,

    checklist,
    reasons,
    warnings,
  };
}

function noTrade(summary, warning) {
  return {
    institutionalScore: 0,
    institutionalGrade: "F",
    decision: "NO TRADE",
    direction: "NEUTRAL",
    confidence: "LOW",
    longScore: 0,
    shortScore: 0,
    summary,
    checklist: [],
    reasons: [],
    warnings: [warning],
  };
}

module.exports = { buildInstitutionalDecision };