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
  market = {},
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
    analysis.bias,
    analysis.direction,
    institutional.direction,
    smartEntry.direction,
    setup.direction,
    trendContinuation.direction,
    multiTimeframe.bias
  );

  const marketMode = String(market.mode || "").toUpperCase();
  const marketStatus = String(market.sessionStatus || market.marketStatus || market.status || "").toUpperCase();

  const marketScore = Number(analysis.score || analysis.marketScore || 0);
  const institutionalScore = Number(institutional.institutionalScore || institutional.score || 0);
  const setupScore = Number(setup.score || 0);
  const riskScore = Number(riskManager.riskScore || 0);

  if (marketMode === "FALLBACK" || marketMode === "STALE") {
    return buildResult({
      score: 0,
      grade: "F",
      confidence: "LOW",
      direction: "NEUTRAL",
      action: "NO TRADE - DATA",
      tradeAllowed: false,
      summary: "No trade. Market data is fallback/stale.",
      reasons,
      warnings: ["Market data is not reliable."],
      market,
      analysis,
      setup,
      smartEntry,
      riskManager,
    });
  }

  let score = 0;

  score += scoreBucket("Market score", marketScore, 30, reasons, warnings);
  score += scoreBucket("Institutional score", institutionalScore, 25, reasons, warnings);
  score += scoreBucket("Setup score", setupScore, 15, reasons, warnings);

  if (smartEntry.direction === direction && smartEntry.entryDecision !== "WAIT") {
    score += 10;
    reasons.push("Smart Entry supports the direction.");
  } else {
    warnings.push("Smart Entry is not fully ready.");
  }

  if (fvg.direction === direction || fvg.activeFVG || fvg.priceInsideFVG || fvg.priceInside) {
    score += 6;
    reasons.push("FVG supports the setup.");
  } else {
    warnings.push("FVG not confirmed.");
  }

  if (liquidity.sweep || liquidity.liquiditySweep || liquidity.bias) {
    score += 6;
    reasons.push("Liquidity condition is present.");
  } else {
    warnings.push("Liquidity not confirmed.");
  }

  if (trendContinuation.direction === direction) {
    score += 5;
    reasons.push("Trend continuation agrees.");
  } else {
    warnings.push("Trend continuation not fully aligned.");
  }

  if (
    (direction === "LONG" && premiumDiscount.bias === "BUYERS") ||
    (direction === "SHORT" && premiumDiscount.bias === "SELLERS")
  ) {
    score += 3;
    reasons.push("Premium/discount supports direction.");
  }

  if (orderBlocks.direction === direction || orderBlocks.priceInsideOB || orderBlocks.priceInside) {
    score += 3;
    reasons.push("Order block supports direction.");
  } else {
    warnings.push("Order block is missing or not aligned.");
  }

  if (riskManager.tradeAllowed) {
    score += 3;
    reasons.push("Risk manager allows trade.");
  } else if (riskScore >= 40) {
    score += 1;
    warnings.push("Risk is cautious, use smaller size/MNQ.");
  } else {
    warnings.push("Risk manager is blocking execution.");
  }

  score = clamp(Math.round(score));

  const grade = getGrade(score);
  const confidence = getConfidence(score);

  const marketClosed =
    String(market.marketOpen).toLowerCase() === "false" ||
    marketStatus.includes("CLOSED") ||
    marketStatus.includes("MAINTENANCE");

  const riskHardBlock =
    riskManager.tradeAllowed === false && riskScore < 25;

  let action = "NO TRADE";

  if (direction === "NEUTRAL") {
    action = "NO TRADE";
  } else if (marketClosed) {
    action = "WAIT FOR OPEN";
  } else if (riskHardBlock && score < 85) {
    action = "NO TRADE - RISK";
  } else if (score >= 90) {
    action = "TAKE TRADE";
  } else if (score >= 80) {
    action = "WATCH FOR ENTRY";
  } else if (score >= 70) {
    action = "WATCH CHART";
  } else if (score >= 60) {
    action = "WATCH ONLY";
  } else {
    action = "NO TRADE";
  }

  const tradeAllowed =
    action === "TAKE TRADE" ||
    action === "WATCH FOR ENTRY" ||
    action === "WATCH CHART";

  return buildResult({
    score,
    grade,
    confidence,
    direction,
    action,
    tradeAllowed,
    summary: `${action}: ${direction} with master score ${score}/100.`,
    reasons,
    warnings,
    market,
    analysis,
    setup,
    smartEntry,
    riskManager,
  });
}

function scoreBucket(name, value, maxPoints, reasons, warnings) {
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

function buildResult({
  score,
  grade,
  confidence,
  direction,
  action,
  tradeAllowed,
  summary,
  reasons,
  warnings,
  market,
  analysis,
  setup,
  smartEntry,
  riskManager,
}) {
  const entry =
    Number(smartEntry.entry) ||
    Number(riskManager.entry) ||
    Number(analysis.entry) ||
    Number(market.price) ||
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

    summary,
    reasons,
    warnings,

    checklist: [
      { name: "Market score strong", passed: Number(analysis.score || 0) >= 75 },
      { name: "Institutional score strong", passed: Number(setup.score || 0) >= 70 },
      { name: "Direction detected", passed: direction === "LONG" || direction === "SHORT" },
      { name: "Risk not hard-blocking", passed: !(riskManager.tradeAllowed === false && Number(riskManager.riskScore || 0) < 25) },
    ],
  };
}

module.exports = { buildMasterDecision };