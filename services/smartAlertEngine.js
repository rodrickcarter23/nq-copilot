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
    executionPlan.direction ||
    masterDecision.direction ||
    entryTiming.direction ||
    smartEntry.direction ||
    analysis.bias ||
    "NEUTRAL";

  const executionScore = Number(executionPlan.executionScore || executionPlan.score || 0);
  const masterScore = Number(masterDecision.masterScore || masterDecision.score || 0);
  const marketScore = Number(analysis.score || 0);
  const riskScore = Number(riskManager.riskScore || 0);

  const reasons = [];
  const warnings = [];

  let alertScore = 0;
  let shouldAlert = false;
  let alertType = "NONE";
  let urgency = "LOW";

  if (executionPlan.status === "ENTER NOW") {
    alertScore += 35;
    reasons.push("Execution Plan says ENTER NOW.");
  } else if (executionPlan.status === "WATCH FOR TRIGGER") {
    alertScore += 20;
    reasons.push("Execution Plan is watching for trigger.");
  } else {
    warnings.push("Execution Plan is not ready.");
  }

  if (masterDecision.action === "TAKE TRADE") {
    alertScore += 25;
    reasons.push("Master Decision says TAKE TRADE.");
  } else if (masterDecision.action === "WATCH FOR ENTRY") {
    alertScore += 15;
    reasons.push("Master Decision says WATCH FOR ENTRY.");
  } else {
    warnings.push("Master Decision is not approving a trade.");
  }

  if (riskManager.tradeAllowed) {
    alertScore += 15;
    reasons.push("Risk Manager allows the setup.");
  } else {
    warnings.push("Risk Manager blocks the setup.");
  }

  if (marketScore >= 80) {
    alertScore += 10;
    reasons.push("Market score is strong.");
  } else if (marketScore >= 65) {
    alertScore += 5;
    reasons.push("Market score is decent.");
  } else {
    warnings.push("Market score is not strong.");
  }

  if (institutional.direction === direction && Number(institutional.institutionalScore || 0) >= 70) {
    alertScore += 5;
    reasons.push("Institutional engine aligns.");
  }

  if (trendContinuation.direction === direction) {
    alertScore += 5;
    reasons.push("Trend continuation aligns.");
  }

  if (fvg.activeFVG && fvg.direction === direction) {
    alertScore += 5;
    reasons.push("FVG supports the setup.");
  }

  if (liquidity.sweep || liquidity.liquiditySweep) {
    alertScore += 5;
    reasons.push("Liquidity sweep detected.");
  }

  if (!volumeProfile.insideValue) {
    alertScore += 3;
    reasons.push("Volume profile is not inside value.");
  } else {
    warnings.push("Price is inside value; chop risk.");
  }

  alertScore = Math.max(0, Math.min(100, Math.round(alertScore)));

  if (executionPlan.status === "ENTER NOW" && alertScore >= 80 && riskManager.tradeAllowed) {
    shouldAlert = true;
    alertType = `${direction} ENTRY NOW`;
    urgency = "HIGH";
  } else if (executionPlan.status === "WATCH FOR TRIGGER" && alertScore >= 65 && riskManager.tradeAllowed) {
    shouldAlert = true;
    alertType = `${direction} WATCH`;
    urgency = "MEDIUM";
  } else if (masterDecision.action?.includes("NO TRADE") || executionPlan.status?.includes("NO EXECUTION")) {
    shouldAlert = false;
    alertType = "NO TRADE";
    urgency = "LOW";
  }

  const grade = getGrade(alertScore);

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
    }),

    price: round(market.price),
    entry: round(executionPlan.entry || masterDecision.entry || smartEntry.entry),
    stop: round(executionPlan.stop || masterDecision.stop || smartEntry.stopLoss),
    target1: round(executionPlan.target1 || masterDecision.target1 || smartEntry.target1),
    target2: round(executionPlan.target2 || masterDecision.target2 || smartEntry.target2),
    riskReward: executionPlan.riskReward || "--",

    executionStatus: executionPlan.status || "--",
    masterAction: masterDecision.action || "--",
    masterScore,
    executionScore,
    marketScore,
    riskScore,

    summary: shouldAlert
      ? `${alertType}: ${grade} setup. Alert conditions met.`
      : `No alert. Current alert score is ${alertScore}/100.`,

    reasons,
    warnings,

    checklist: [
      {
        name: "Execution plan ready",
        passed: executionPlan.status === "ENTER NOW" || executionPlan.status === "WATCH FOR TRIGGER",
      },
      {
        name: "Master decision ready",
        passed: masterDecision.action === "TAKE TRADE" || masterDecision.action === "WATCH FOR ENTRY",
      },
      {
        name: "Risk approved",
        passed: riskManager.tradeAllowed === true,
      },
      {
        name: "Market score strong enough",
        passed: marketScore >= 65,
      },
      {
        name: "Alert score strong enough",
        passed: alertScore >= 65,
      },
    ],
  };
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
}) {
  if (!shouldAlert) {
    return "No high-quality alert right now. Stand by.";
  }

  return [
    `${grade} ${alertType}`,
    `Direction: ${direction}`,
    `Price: ${round(market.price)}`,
    `Entry: ${round(executionPlan.entry || masterDecision.entry)}`,
    `Stop: ${round(executionPlan.stop || masterDecision.stop)}`,
    `Target 1: ${round(executionPlan.target1 || masterDecision.target1)}`,
    `Target 2: ${round(executionPlan.target2 || masterDecision.target2)}`,
    `R:R: ${executionPlan.riskReward || "--"}`,
    `Risk: ${riskManager.riskLevel || "--"}`,
  ].join("\n");
}

module.exports = { buildSmartAlert };