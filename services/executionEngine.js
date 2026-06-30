function round(value, decimals = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Number(n.toFixed(decimals));
}

function safeNumber(...values) {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n) && n !== 0) return n;
  }
  return 0;
}

function detectExecutionPlan({
  market = {},
  analysis = {},
  smartEntry = {},
  orderBlocks = {},
  fvg = {},
  liquidity = {},
  volumeProfile = {},
  premiumDiscount = {},
  multiTimeframe = {},
  riskManager = {},
  masterDecision = {},
  entryTiming = {},
}) {
  const price = Number(market.price || 0);

  const direction =
    masterDecision.direction ||
    entryTiming.direction ||
    smartEntry.direction ||
    analysis.bias ||
    "NEUTRAL";

  const reasons = [];
  const warnings = [];
  const waitFor = [];
  const invalidations = [];

  if (!price || direction === "NEUTRAL") {
    return emptyExecution("No clear execution direction yet.");
  }

  const entry = safeNumber(
    entryTiming.entry,
    masterDecision.entry,
    riskManager.entry,
    smartEntry.entry,
    analysis.entry
  );

  const stop = safeNumber(
    entryTiming.stop,
    masterDecision.stop,
    riskManager.stop,
    smartEntry.stopLoss,
    analysis.stop
  );

  const target1 = safeNumber(
    entryTiming.target1,
    masterDecision.target1,
    smartEntry.target1,
    analysis.target1
  );

  const target2 = safeNumber(
    entryTiming.target2,
    masterDecision.target2,
    smartEntry.target2,
    analysis.target2
  );

  let executionScore = 0;

  if (masterDecision.action === "TAKE TRADE") {
    executionScore += 25;
    reasons.push("Master Decision says TAKE TRADE.");
  } else if (masterDecision.action === "WATCH FOR ENTRY") {
    executionScore += 15;
    reasons.push("Master Decision is watching for entry.");
    waitFor.push("Master Decision upgrade to TAKE TRADE.");
  } else {
    warnings.push("Master Decision does not approve execution.");
    waitFor.push("Master Decision approval.");
  }

  if (entryTiming.status === "ENTER NOW") {
    executionScore += 25;
    reasons.push("Entry Timing says ENTER NOW.");
  } else if (entryTiming.status === "WATCH FOR TRIGGER") {
    executionScore += 15;
    reasons.push("Entry Timing is watching for trigger.");
    waitFor.push(entryTiming.trigger || "Entry trigger confirmation.");
  } else {
    warnings.push("Entry Timing is not ready.");
    waitFor.push(entryTiming.trigger || "Clean confirmation candle.");
  }

  if (riskManager.tradeAllowed) {
    executionScore += 15;
    reasons.push("Risk Manager allows the trade.");
  } else {
    warnings.push("Risk Manager does not allow the trade.");
    invalidations.push("Risk is too high or stop/entry data is invalid.");
  }

  if (fvg.priceInsideFVG || fvg.priceInside) {
    executionScore += 10;
    reasons.push("Price is inside FVG zone.");
  } else if (fvg.zone && fvg.zone !== "--") {
    waitFor.push(`Pullback into FVG zone ${fvg.zone}.`);
  }

  if (orderBlocks.priceInsideOB || orderBlocks.priceInside) {
    executionScore += 10;
    reasons.push("Price is inside Order Block zone.");
  } else if (orderBlocks.obLow || orderBlocks.low || orderBlocks.orderBlockLow) {
    const obLow = safeNumber(orderBlocks.obLow, orderBlocks.low, orderBlocks.orderBlockLow);
    const obHigh = safeNumber(orderBlocks.obHigh, orderBlocks.high, orderBlocks.orderBlockHigh);
    waitFor.push(`Reaction from Order Block zone ${round(obLow)} - ${round(obHigh)}.`);
  }

  if (liquidity.sweep || liquidity.liquiditySweep) {
    executionScore += 8;
    reasons.push("Liquidity sweep is confirmed.");
  } else {
    waitFor.push("Liquidity sweep or liquidity confirmation.");
  }

  if (volumeProfile.insideValue) {
    warnings.push("Price is inside value area; chop risk is higher.");
  } else {
    executionScore += 5;
    reasons.push("Price is outside value area.");
  }

  if (
    (direction === "LONG" && premiumDiscount.bias === "BUYERS") ||
    (direction === "SHORT" && premiumDiscount.bias === "SELLERS")
  ) {
    executionScore += 7;
    reasons.push("Premium/Discount supports execution direction.");
  } else {
    warnings.push("Premium/Discount does not fully support execution.");
  }

  if (multiTimeframe.bias === direction) {
    executionScore += 10;
    reasons.push("Multi-Timeframe agrees with execution direction.");
  } else {
    warnings.push("Multi-Timeframe does not fully agree.");
  }

  executionScore = Math.max(0, Math.min(100, Math.round(executionScore)));

  let status = "WAIT";
  if (executionScore >= 85 && riskManager.tradeAllowed && entryTiming.status === "ENTER NOW") {
    status = "ENTER NOW";
  } else if (executionScore >= 65 && riskManager.tradeAllowed) {
    status = "WATCH FOR TRIGGER";
  } else if (!riskManager.tradeAllowed) {
    status = "NO EXECUTION - RISK";
  } else if (executionScore < 45) {
    status = "NO EXECUTION";
  }

  const riskReward = calculateRR(entry, stop, target2 || target1, direction);

  const confirmation =
    status === "ENTER NOW"
      ? `${direction} execution conditions are aligned.`
      : buildConfirmation(direction, waitFor);

  return {
    status,
    executionStatus: status,
    direction,
    executionScore,
    score: executionScore,

    currentPrice: round(price),
    entry: round(entry),
    stop: round(stop),
    target1: round(target1),
    target2: round(target2),
    riskReward,

    confirmation,
    nextAction: buildNextAction(status, direction),

    waitFor,
    invalidations,
    reasons,
    warnings,

    summary: `${status}: ${confirmation}`,

    checklist: [
      {
        name: "Master Decision supports execution",
        passed: masterDecision.action === "TAKE TRADE" || masterDecision.action === "WATCH FOR ENTRY",
      },
      {
        name: "Entry Timing supports execution",
        passed: entryTiming.status === "ENTER NOW" || entryTiming.status === "WATCH FOR TRIGGER",
      },
      {
        name: "Risk approved",
        passed: riskManager.tradeAllowed === true,
      },
      {
        name: "FVG location valid",
        passed: fvg.priceInsideFVG || fvg.priceInside,
      },
      {
        name: "Order Block location valid",
        passed: orderBlocks.priceInsideOB || orderBlocks.priceInside,
      },
      {
        name: "Liquidity confirmed",
        passed: liquidity.sweep || liquidity.liquiditySweep,
      },
      {
        name: "Multi-timeframe aligned",
        passed: multiTimeframe.bias === direction,
      },
    ],
  };
}

function calculateRR(entry, stop, target, direction) {
  if (!entry || !stop || !target) return "--";

  const risk = Math.abs(entry - stop);
  const reward = Math.abs(target - entry);

  if (!risk || !reward) return "--";

  return round(reward / risk, 2);
}

function buildConfirmation(direction, waitFor) {
  if (!waitFor.length) return `Wait for clean ${direction} confirmation.`;
  return waitFor[0];
}

function buildNextAction(status, direction) {
  if (status === "ENTER NOW") return `Execute ${direction} only if your live chart matches the setup.`;
  if (status === "WATCH FOR TRIGGER") return `Watch for ${direction} trigger confirmation.`;
  if (status.includes("RISK")) return "Do not execute. Risk conditions are not valid.";
  return "Stand aside. No clean execution setup.";
}

function emptyExecution(summary) {
  return {
    status: "NO EXECUTION",
    executionStatus: "NO EXECUTION",
    direction: "NEUTRAL",
    executionScore: 0,
    score: 0,
    currentPrice: 0,
    entry: 0,
    stop: 0,
    target1: 0,
    target2: 0,
    riskReward: "--",
    confirmation: "NO CONFIRMATION",
    nextAction: "Stand aside.",
    waitFor: [],
    invalidations: [],
    reasons: [],
    warnings: [summary],
    summary,
    checklist: [],
  };
}

module.exports = { detectExecutionPlan };