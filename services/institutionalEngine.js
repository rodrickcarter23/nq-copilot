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

function buildInstitutionalDecision(market, analysis, setup) {
  const reasons = [];
  const warnings = [];

  if (!market || market.mode === "FALLBACK") {
    return {
      institutionalScore: 0,
      institutionalGrade: "F",
      decision: "NO TRADE",
      direction: "NEUTRAL",
      confidence: "LOW",
      summary: "Market data is unavailable.",
      checklist: [],
      reasons: [],
      warnings: ["No reliable market data."],
    };
  }

  if (market.mode === "STALE") {
    return {
      institutionalScore: 0,
      institutionalGrade: "F",
      decision: "NO TRADE",
      direction: "NEUTRAL",
      confidence: "LOW",
      summary: "Market data is stale. Do not trade from this signal.",
      checklist: [],
      reasons: [],
      warnings: ["Market data is stale."],
    };
  }

  const indicators = analysis.indicators || {};
  const structure = analysis.structure || {};
  const mtf = analysis.multiTimeframe || {};

  let score = 0;

  const checklist = [];

  function addCheck(name, passed, points, note) {
    checklist.push({ name, passed, points: passed ? points : 0, note });
    if (passed) {
      score += points;
      reasons.push(note || name);
    } else {
      warnings.push(`${name} not confirmed`);
    }
  }

  addCheck(
    "Data usable",
    market.mode === "LIVE" || market.mode === "DELAYED",
    10,
    `Data mode is ${market.mode}`
  );

  addCheck(
    "Price above VWAP",
    Number(market.price) > Number(indicators.vwap || 0),
    12,
    "Price is trading above VWAP"
  );

  addCheck(
    "Bullish EMA alignment",
    indicators.ema9 > indicators.ema20 &&
      indicators.ema20 > indicators.ema50 &&
      Number(market.price) > indicators.ema9,
    15,
    "EMA 9 > EMA 20 > EMA 50 and price is above EMA 9"
  );

  addCheck(
    "Bullish structure",
    structure.structureBias === "LONG",
    15,
    "Market structure supports buyers"
  );

  addCheck(
    "Break of structure",
    structure.breakOfStructure === true && structure.structureBias === "LONG",
    10,
    "Bullish break of structure confirmed"
  );

  const tfValues = Object.values(mtf);
  const longTF = tfValues.filter((t) => t.bias === "LONG").length;
  const shortTF = tfValues.filter((t) => t.bias === "SHORT").length;

  addCheck(
    "Multi-timeframe alignment",
    longTF >= 3,
    15,
    `${longTF} timeframes support LONG`
  );

  addCheck(
    "RSI healthy",
    indicators.rsi >= 50 && indicators.rsi <= 75,
    8,
    "RSI supports bullish momentum without being too extended"
  );

  addCheck(
    "Relative volume",
    indicators.rvol >= 1,
    5,
    "Relative volume is acceptable"
  );

  addCheck(
    "Setup detected",
    setup.direction === "LONG" && setup.score >= 60,
    10,
    `${setup.setupName || "Setup"} detected`
  );

  const finalScore = clamp(score);
  const grade = gradeFromScore(finalScore);
  const confidence = confidenceFromScore(finalScore);

  let decision = "NO TRADE";
  let direction = "NEUTRAL";

  if (finalScore >= 85) {
    decision = "A+ LONG SETUP";
    direction = "LONG";
  } else if (finalScore >= 75) {
    decision = "A LONG SETUP";
    direction = "LONG";
  } else if (finalScore >= 60) {
    decision = "WATCH LONG";
    direction = "LONG";
  }

  return {
    institutionalScore: finalScore,
    institutionalGrade: grade,
    decision,
    direction,
    confidence,
    summary:
      direction === "LONG"
        ? "Institutional engine favors long-side conditions, but wait for confirmation before entering."
        : "Institutional engine does not have enough confluence for a clean trade.",
    checklist,
    reasons,
    warnings,
  };
}

module.exports = { buildInstitutionalDecision };