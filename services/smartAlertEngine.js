function round(value, decimals = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Number(n.toFixed(decimals));
}

function buildSmartAlert({
  market = {},
  analysis = {},
  masterDecision = {},
  executionPlan = {},
  entryTiming = {},
  riskManager = {},
  smartEntry = {},
  institutional = {},
  liquidity = {},
  fvg = {},
  volumeProfile = {},
  trendContinuation = {},
}) {
  const direction =
    masterDecision.direction ||
    executionPlan.direction ||
    entryTiming.direction ||
    smartEntry.direction ||
    institutional.direction ||
    analysis.bias ||
    analysis.direction ||
    "NEUTRAL";

  const executionScore = Number(executionPlan.executionScore || executionPlan.score || 0);
  const masterScore = Number(masterDecision.masterScore || masterDecision.score || 0);
  const marketScore = Number(analysis.score || analysis.marketScore || 0);
  const institutionalScore = Number(institutional.institutionalScore || institutional.score || 0);
  const riskScore = Number(riskManager.riskScore || 0);

  const reasons = [];
  const warnings = [];

  let alertScore = 0;
  let shouldAlert = false;
  let alertType = "NONE";
  let urgency = "LOW";

  if (direction === "NEUTRAL") {
    return noAlert("No clear LONG or SHORT direction.", direction);
  }

  alertScore += addScore(masterScore, 25, "Master decision score", reasons, warnings);
  alertScore += addScore(marketScore, 20, "Market score", reasons, warnings);
  alertScore += addScore(institutionalScore, 20, "Institutional score", reasons, warnings);
  alertScore += addScore(executionScore, 15, "Execution score", reasons, warnings);

  if (
    masterDecision.action === "TAKE TRADE" ||
    masterDecision.action === "A+ WATCH" ||
    masterDecision.action === "WATCH FOR ENTRY"
  ) {
    alertScore += 10;
    reasons.push(`Master action is ${masterDecision.action}.`);
  } else {
    warnings.push(`Master action is ${masterDecision.action || "UNKNOWN"}.`);
  }

  if (
    executionPlan.status === "ENTER NOW" ||
    executionPlan.status === "WATCH FOR TRIGGER"
  ) {
    alertScore += 8;
    reasons.push(`Execution status is ${executionPlan.status}.`);
  } else {
    warnings.push(`Execution status is ${executionPlan.status || "UNKNOWN"}.`);
  }

  if (riskManager.tradeAllowed) {
    alertScore += 7;
    reasons.push("Risk Manager allows the setup.");
  } else if (riskScore >= 40) {
    alertScore += 3;
    warnings.push("Risk Manager is cautious, but not a full rejection.");
  } else {
    warnings.push("Risk Manager blocks the setup.");
  }

  if (fvg.direction === direction || fvg.activeFVG) {
    alertScore += 5;
    reasons.push("FVG supports the setup.");
  }

  if (liquidity.sweep || liquidity.liquiditySweep || liquidity.bias) {
    alertScore += 5;
    reasons.push("Liquidity condition is present.");
  }

  if (trendContinuation.direction === direction) {
    alertScore += 5;
    reasons.push("Trend continuation aligns.");
  }

  if (!volumeProfile.insideValue) {
    alertScore += 2;
    reasons.push("Volume profile is not inside value.");
  } else {
    warnings.push("Price is inside value; chop risk.");
  }

  alertScore = Math.max(0, Math.min(100, Math.round(alertScore)));

  const grade = getGrade(alertScore);

  if (
    executionPlan.status === "ENTER NOW" &&
    alertScore >= 80 &&
    riskManager.tradeAllowed
  ) {
    shouldAlert = true;
    alertType = `${direction} ENTRY NOW`;
    urgency = "HIGH";
  } else if (
    masterDecision.action === "TAKE TRADE" &&
    alertScore >= 75
  ) {
    shouldAlert = true;
    alertType = `${direction} TAKE TRADE`;
    urgency = "HIGH";
  } else if (
    masterDecision.action === "A+ WATCH" ||
    alertScore >= 80 ||
    institutionalScore >= 85 ||
    marketScore >= 85
  ) {
    shouldAlert = true;
    alertType = `${direction} A+ WATCH`;
    urgency = "MEDIUM";
  } else if (
    masterDecision.action === "WATCH FOR ENTRY" ||
    executionPlan.status === "WATCH FOR TRIGGER" ||
    alertScore >= 65
  ) {
    shouldAlert = true;
    alertType = `${direction} WATCH`;
    urgency = "MEDIUM";
  } else {
    shouldAlert = false;
    alertType = "NO TRADE";
    urgency = "LOW";
  }

  return {
    shouldAlert,
    alertType,
    urgency,
    direction,
    alertScore,
    score: alertScore,
    grade,

    title: buildTitle(shouldAlert, alertType, grade),
    message: buildMessage({
      shouldAlert,
      alertType,
      direction,
      grade,
      market,
      executionPlan,
      masterDecision,
      riskManager,
      urgency,
    }),

    price: round(market.price),
    entry: round(executionPlan.entry || masterDecision.entry || smartEntry.entry),
    stop: round(executionPlan.stop || masterDecision.stop || smartEntry.stopLoss),
    target1: round(executionPlan.target1 || masterDecision.target1 || smartEntry.target1),
    target2: round(executionPlan.target2 || masterDecision.target2 || smartEntry.target2),
    riskReward: executionPlan.riskReward || smartEntry.riskReward || "--",

    executionStatus: executionPlan.status || executionPlan.executionStatus || "--",
    masterAction: masterDecision.action || "--",
    masterScore,
    executionScore,
    marketScore,
    institutionalScore,
    riskScore,

    summary: shouldAlert
      ? `${alertType}: ${grade} setup. Alert conditions met.`
      : `No alert. Current alert score is ${alertScore}/100.`,

    reasons,
    warnings,

    checklist: [
      {
        name: "Direction detected",
        passed: direction === "LONG" || direction === "SHORT",
      },
      {
        name: "Master decision ready",
        passed:
          masterDecision.action === "TAKE TRADE" ||
          masterDecision.action === "A+ WATCH" ||
          masterDecision.action === "WATCH FOR ENTRY",
      },
      {
        name: "Execution plan ready",
        passed:
          executionPlan.status === "ENTER NOW" ||
          executionPlan.status === "WATCH FOR TRIGGER",
      },
      {
        name: "Market score strong enough",
        passed: marketScore >= 65,
      },
      {
        name: "Institutional score strong enough",
        passed: institutionalScore >= 65,
      },
      {
        name: "Alert score strong enough",
        passed: alertScore >= 65,
      },
    ],
  };
}

function addScore(score, maxPoints, label, reasons, warnings) {
  const n = Number(score || 0);

  if (n >= 90) {
    reasons.push(`${label} is excellent.`);
    return maxPoints;
  }

  if (n >= 80) {
    reasons.push(`${label} is strong.`);
    return Math.round(maxPoints * 0.85);
  }

  if (n >= 70) {
    reasons.push(`${label} is good.`);
    return Math.round(maxPoints * 0.7);
  }

  if (n >= 60) {
    reasons.push(`${label} is decent.`);
    return Math.round(maxPoints * 0.5);
  }

  warnings.push(`${label} is weak.`);
  return 0;
}

function getGrade(score) {
  if (score >= 90) return "A+";
  if (score >= 80) return "A";
  if (score >= 70) return "B+";
  if (score >= 65) return "B";
  if (score >= 55) return "C";
  return "D";
}

function buildTitle(shouldAlert, alertType, grade) {
  if (!shouldAlert) return "No Trade Alert";
  return `🚨 ${grade} ${alertType}`;
}

function buildMessage({
  shouldAlert,
  alertType,
  direction,
  grade,
  market,
  executionPlan,
  masterDecision,
  riskManager,
  urgency,
}) {
  if (!shouldAlert) {
    return "No high-quality alert right now. Stand by.";
  }

  return [
    `${grade} ${alertType}`,
    `Urgency: ${urgency}`,
    `Direction: ${direction}`,
    `Price: ${round(market.price)}`,
    `Entry: ${round(executionPlan.entry || masterDecision.entry)}`,
    `Stop: ${round(executionPlan.stop || masterDecision.stop)}`,
    `Target 1: ${round(executionPlan.target1 || masterDecision.target1)}`,
    `Target 2: ${round(executionPlan.target2 || masterDecision.target2)}`,
    `R:R: ${executionPlan.riskReward || "--"}`,
    `Risk: ${riskManager.riskLevel || "--"}`,
    `Note: Confirm on NinjaTrader/Tradovate before entering.`,
  ].join("\n");
}

function noAlert(summary, direction = "NEUTRAL") {
  return {
    shouldAlert: false,
    alertType: "NO TRADE",
    urgency: "LOW",
    direction,
    alertScore: 0,
    score: 0,
    grade: "D",
    title: "No Trade Alert",
    message: summary,
    price: 0,
    entry: 0,
    stop: 0,
    target1: 0,
    target2: 0,
    riskReward: "--",
    executionStatus: "--",
    masterAction: "--",
    masterScore: 0,
    executionScore: 0,
    marketScore: 0,
    institutionalScore: 0,
    riskScore: 0,
    summary,
    reasons: [],
    warnings: [summary],
    checklist: [],
  };
}

module.exports = { buildSmartAlert };