function detectSetup(data, analysis) {
  const price = Number(data.price || 0);
  const indicators = analysis.indicators || {};
  const structure = analysis.structure || {};
  const mtf = analysis.multiTimeframe || {};

  const reasons = [];
  const warnings = [];

  let setupName = "NO CLEAN SETUP";
  let direction = "NEUTRAL";
  let quality = "LOW";
  let score = 0;

  const aboveVWAP = price > Number(indicators.vwap || 0);
  const belowVWAP = price < Number(indicators.vwap || 0);

  const bullishEMA =
    indicators.ema9 > indicators.ema20 &&
    indicators.ema20 > indicators.ema50 &&
    price > indicators.ema9;

  const bearishEMA =
    indicators.ema9 < indicators.ema20 &&
    indicators.ema20 < indicators.ema50 &&
    price < indicators.ema9;

  const tfLong =
    Object.values(mtf).filter((t) => t.bias === "LONG").length;

  const tfShort =
    Object.values(mtf).filter((t) => t.bias === "SHORT").length;

  if (aboveVWAP && bullishEMA && structure.structureBias === "LONG" && tfLong >= 3) {
    setupName = "TREND CONTINUATION LONG";
    direction = "LONG";
    score += 90;
    reasons.push("VWAP, EMA trend, structure, and multi-timeframe trend agree.");
  } else if (belowVWAP && bearishEMA && structure.structureBias === "SHORT" && tfShort >= 3) {
    setupName = "TREND CONTINUATION SHORT";
    direction = "SHORT";
    score += 90;
    reasons.push("VWAP, EMA trend, structure, and multi-timeframe trend agree.");
  } else if (aboveVWAP && bullishEMA && tfLong >= 2) {
    setupName = "VWAP PULLBACK LONG";
    direction = "LONG";
    score += 75;
    reasons.push("Price is above VWAP with bullish EMA support.");
  } else if (belowVWAP && bearishEMA && tfShort >= 2) {
    setupName = "VWAP PULLBACK SHORT";
    direction = "SHORT";
    score += 75;
    reasons.push("Price is below VWAP with bearish EMA support.");
  } else if (structure.bullishBreak && aboveVWAP) {
    setupName = "BULLISH BREAKOUT";
    direction = "LONG";
    score += 70;
    reasons.push("Price broke above prior swing structure while above VWAP.");
  } else if (structure.bearishBreak && belowVWAP) {
    setupName = "BEARISH BREAKDOWN";
    direction = "SHORT";
    score += 70;
    reasons.push("Price broke below prior swing structure while below VWAP.");
  } else {
    warnings.push("No clean institutional setup detected.");
  }

  if (analysis.warnings?.length) {
    warnings.push(...analysis.warnings.slice(0, 3));
  }

  if (score >= 90) quality = "A+";
  else if (score >= 75) quality = "A";
  else if (score >= 60) quality = "B";
  else if (score >= 45) quality = "C";

  return {
    setupName,
    direction,
    quality,
    score,
    reasons,
    warnings,
  };
}

module.exports = { detectSetup };