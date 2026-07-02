function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function round(value, decimals = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Number(n.toFixed(decimals));
}

function getDirection(...values) {
  for (const value of values) {
    if (value === "LONG" || value === "SHORT") return value;
  }
  return "NEUTRAL";
}

function buildMasterDecision({
  market,
  analysis = {},
  setup = {},
  institutional = {},
  smartEntry = {},
  orderBlocks = {},
  trendContinuation = {},
  liquidity = {},
  volumeProfile = {},
  fvg = {},
  premiumDiscount = {},
  multiTimeframe = {},
  riskManager = {},
}) {
  const reasons = [];
  const warnings = [];

  const direction = getDirection(
    institutional.direction,
    smartEntry.direction,
    analysis.bias,
    analysis.direction,
    setup.direction,
    trendContinuation.direction,
    multiTimeframe.bias
  );

  let score = 0;

  const marketScore = Number(analysis.score || analysis.marketScore || 0);
  const institutionalScore = Number(institutional.institutionalScore || institutional.score || 0);
  const smartEntryReady = ["A+ WATCH", "WATCH FOR ENTRY", "WAIT FOR CONFIRMATION"].includes(
    smartEntry.entryDecision
  );

  score += weightedScore("Market score", marketScore, 20, reasons, warnings);
  score += weightedScore("Institutional score", institutionalScore, 25, reasons, warnings);

  if (smartEntry.direction === direction && smartEntryReady) {
    score += 15;
    reasons.push(`Smart Entry supports ${direction}.`);
  } else {
    warnings.push("Smart Entry is not fully aligned.");
  }

  if (trendContinuation.direction === direction) {
    score += 10;
    reasons.push("Trend continuation agrees.");
  } else {
    warnings.push("Trend continuation has not confirmed.");
  }

  if (multiTimeframe.bias === direction) {
    score += 10;
    reasons.push("Multi-timeframe agrees.");
  } else {
    warnings.push("Multi-timeframe is not fully aligned.");
  }

  if (fvg.direction === direction || fvg.activeFVG) {
    score += 7;
    reasons.push("FVG supports the setup.");
  } else {
    warnings.push("FVG not confirmed.");
  }

  if (liquidity.sweep || liquidity.liquiditySweep || liquidity.bias) {
    score += 7;
    reasons.push("Liquidity condition is present.");
  } else {
    warnings.push("Liquidity not confirmed.");
  }

  if (orderBlocks.direction === direction) {
    score += 5;
    reasons.push("Order block supports direction.");
  } else {
    warnings.push("Order block not aligned.");
  }

  if (
    (direction === "LONG" && premiumDiscount.bias === "BUYERS") ||
    (direction === "SHORT" && premiumDiscount.bias === "SELLERS")
  ) {
    score += 5;
    reasons.push("Premium/discount supports direction.");
  }

  if (riskManager.tradeAllowed) {
    score += 6;
    reasons.push("Risk manager allows the setup.");
  } else if (Number(riskManager.riskScore || 0) >= 40) {
    score += 2;
    warnings.push("Risk manager is cautious, but not a full rejection.");
  } else {
    warnings.push("Risk manager is blocking execution.");
  }

  if (volumeProfile.insideValue) {
    warnings.push("Price is inside value area; chop risk exists.");
  } else {
    score += 3;
    reasons.push("Price is outside value area.");
  }

  score = clamp(Math.round(score));

  const grade = getGrade(score);
  const confidence = getConfidence(score);
  const action = getAction({
    score,
    direction,
    marketScore,
    institutionalScore,
    smartEntry,
    riskManager,
  });

  const entry =
    Number(smartEntry.entry) ||
    Number(riskManager.entry) ||
    Number(analysis.entry) ||
    Number(market?.price) ||
    0;

  const stop =
    Number(smartEntry.stopLoss) ||
    Number(smartEntry.stop) ||
    Number(riskManager.stop) ||
    Number(analysis.stop) ||
    0;

  const target1 =
    Number(smartEntry.target1) ||
    Number(analysis.target1) ||
    0;

  const target2 =
    Number(smartEntry.target2) ||
    Number(analysis.target2) ||
    0;

  const tradeAllowed =
    action === "TAKE TRADE" ||
    action === "ENTER NOW" ||
    action === "WATCH FOR ENTRY" ||
    action === "A+ WATCH";

  return {
    masterScore: score,
    score,
    grade,
    confidence,
    direction,
    action,
    tradeAllowed,

    entry: round(entry),
    stop: round(stop),
    target1: round(target1),
    target2: round(target2),

    riskLevel: riskManager.riskLevel || "UNKNOWN",
    riskScore: riskManager.riskScore || 0,

    setupName: setup.setupName || "UNKNOWN",
    smartEntryDecision: smartEntry.entryDecision || "WAIT",

    summary: buildSummary(score, direction, action),

    reasons,
    warnings,

    checklist: [
      { name: "Market score strong", passed: marketScore >= 75 },
      { name: "Institutional score strong", passed: institutionalScore >= 75 },
      { name: "Smart Entry supports direction", passed: smartEntry.direction === direction },
      { name: "Trend supports direction", passed: trendContinuation.direction === direction },
      { name: "Multi-timeframe supports direction", passed: multiTimeframe.bias === direction },
      { name: "Risk manager allows setup", passed: riskManager.tradeAllowed === true },
      {
        name: "FVG supports direction",
        passed: fvg.direction === direction || fvg.activeFVG === true,
      },
      {
        name: "Liquidity present",
        passed: liquidity.sweep === true || liquidity.liquiditySweep === true || Boolean(liquidity.bias),
      },
    ],
  };
}

function weightedScore(name, value, maxPoints, reasons, warnings) {
  const n = Number(value || 0);

  if (n >= 90) {
    reasons.push(`${name} is excellent.`);
    return maxPoints;
  }

  if (n >= 80) {
    reasons.push(`${name} is strong.`);
    return Math.round(maxPoints * 0.85);
  }

  if (n >= 70) {
    reasons.push(`${name} is good.`);
    return Math.round(maxPoints * 0.7);
  }

  if (n >= 60) {
    reasons.push(`${name} is decent.`);
    return Math.round(maxPoints * 0.5);
  }

  warnings.push(`${name} is weak.`);
  return 0;
}

function getGrade(score) {
  if (score >= 90) return "A+";
  if (score >= 80) return "A";
  if (score >= 70) return "B+";
  if (score >= 60) return "B";
  if (score >= 50) return "C";
  return "D";
}

function getConfidence(score) {
  if (score >= 90) return "EXTREME";
  if (score >= 80) return "HIGH";
  if (score >= 70) return "MEDIUM-HIGH";
  if (score >= 60) return "MEDIUM";
  return "LOW";
}

function getAction({ score, direction, marketScore, institutionalScore, smartEntry, riskManager }) {
  if (direction === "NEUTRAL") return "NO TRADE";

  const veryStrong =
    score >= 85 ||
    marketScore >= 90 ||
    institutionalScore >= 90 ||
    smartEntry.entryDecision === "A+ WATCH";

  const strong =
    score >= 70 ||
    marketScore >= 80 ||
    institutionalScore >= 80 ||
    smartEntry.entryDecision === "WATCH FOR ENTRY";

  const riskHardBlocked =
    riskManager.tradeAllowed === false && Number(riskManager.riskScore || 0) < 25;

  if (riskHardBlocked && !veryStrong) return "NO TRADE - RISK";

  if (veryStrong && riskManager.tradeAllowed && smartEntry.entryDecision !== "WAIT") {
    return "TAKE TRADE";
  }

  if (veryStrong) return "A+ WATCH";

  if (strong) return "WATCH FOR ENTRY";

  if (score >= 55) return "WATCH CHART";

  return "NO TRADE";
}

function buildSummary(score, direction, action) {
  return `${action}: ${direction} with master score ${score}/100. Confirm on NinjaTrader/Tradovate before entering.`;
}

module.exports = { buildMasterDecision };