function round(value, decimals = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Number(n.toFixed(decimals));
}

function detectEntryTiming({
  market,
  analysis = {},
  smartEntry = {},
  orderBlocks = {},
  fvg = {},
  liquidity = {},
  trendContinuation = {},
  volumeProfile = {},
  riskManager = {},
  masterDecision = {},
}) {
  const price = Number(market.price || 0);

  const reasons = [];
  const warnings = [];

  let timingScore = 0;
  let status = "WAIT";
  let trigger = "NO TRIGGER YET";

  const direction =
    masterDecision.direction ||
    smartEntry.direction ||
    trendContinuation.direction ||
    analysis.bias ||
    "NEUTRAL";

  if (!price || direction === "NEUTRAL") {
    return emptyTiming("No clear direction for entry timing.");
  }

  if (masterDecision.action === "TAKE TRADE") {
    timingScore += 20;
    reasons.push("Master Decision allows trade.");
  } else if (masterDecision.action === "WATCH FOR ENTRY") {
    timingScore += 10;
    reasons.push("Master Decision is watching for entry.");
  } else {
    warnings.push("Master Decision does not approve an entry yet.");
  }

  if (riskManager.tradeAllowed) {
    timingScore += 15;
    reasons.push("Risk Manager allows the trade.");
  } else {
    warnings.push("Risk Manager does not approve the trade.");
  }

  if (smartEntry.entryDecision && !smartEntry.entryDecision.includes("WAIT")) {
    timingScore += 15;
    reasons.push("Smart Entry is not waiting.");
  } else {
    warnings.push("Smart Entry is still waiting.");
  }

  if (fvg.priceInsideFVG || fvg.priceInside) {
    timingScore += 15;
    reasons.push("Price is inside FVG entry zone.");
  } else {
    warnings.push("Price is not inside FVG yet.");
  }

  if (orderBlocks.priceInsideOB || orderBlocks.priceInside) {
    timingScore += 15;
    reasons.push("Price is inside Order Block zone.");
  } else {
    warnings.push("Price is not inside Order Block yet.");
  }

  if (liquidity.sweep || liquidity.liquiditySweep) {
    timingScore += 10;
    reasons.push("Liquidity sweep has occurred.");
  } else {
    warnings.push("Liquidity sweep has not occurred yet.");
  }

  if (volumeProfile.insideValue) {
    warnings.push("Price is inside value; chop risk.");
  } else {
    timingScore += 5;
    reasons.push("Price is outside value area.");
  }

  if (trendContinuation.direction === direction) {
    timingScore += 10;
    reasons.push("Trend continuation supports direction.");
  } else {
    warnings.push("Trend continuation does not support direction.");
  }

  timingScore = Math.max(0, Math.min(100, Math.round(timingScore)));

  if (timingScore >= 85 && riskManager.tradeAllowed) {
    status = "ENTER NOW";
    trigger = "All timing confirmations are aligned.";
  } else if (timingScore >= 65) {
    status = "WATCH FOR TRIGGER";
    trigger = buildTrigger(direction, smartEntry, fvg, orderBlocks);
  } else if (timingScore >= 40) {
    status = "WAIT";
    trigger = "Some confirmations exist, but timing is not ready.";
  } else {
    status = "NO ENTRY";
    trigger = "Entry timing is not valid.";
  }

  return {
    timingStatus: status,
    status,
    direction,
    timingScore,
    score: timingScore,
    trigger,

    price: round(price),
    entry: round(masterDecision.entry || smartEntry.entry || riskManager.entry),
    stop: round(masterDecision.stop || smartEntry.stopLoss || riskManager.stop),
    target1: round(masterDecision.target1 || smartEntry.target1),
    target2: round(masterDecision.target2 || smartEntry.target2),

    summary: `${status}: ${trigger}`,

    reasons,
    warnings,

    checklist: [
      { name: "Master Decision approves", passed: masterDecision.action === "TAKE TRADE" || masterDecision.action === "WATCH FOR ENTRY" },
      { name: "Risk approved", passed: riskManager.tradeAllowed === true },
      { name: "Smart Entry ready", passed: smartEntry.entryDecision && !smartEntry.entryDecision.includes("WAIT") },
      { name: "Price inside FVG", passed: fvg.priceInsideFVG || fvg.priceInside },
      { name: "Price inside Order Block", passed: orderBlocks.priceInsideOB || orderBlocks.priceInside },
      { name: "Liquidity sweep complete", passed: liquidity.sweep || liquidity.liquiditySweep },
      { name: "Trend supports direction", passed: trendContinuation.direction === direction },
    ],
  };
}

function buildTrigger(direction, smartEntry, fvg, orderBlocks) {
  if (fvg.zone && fvg.zone !== "--") {
    return `Wait for ${direction} confirmation inside FVG zone ${fvg.zone}.`;
  }

  if (orderBlocks.zone && orderBlocks.zone !== "--") {
    return `Wait for ${direction} confirmation inside Order Block zone ${orderBlocks.zone}.`;
  }

  if (smartEntry.entryZone && smartEntry.entryZone !== "--") {
    return `Wait for price to confirm inside Smart Entry zone ${smartEntry.entryZone}.`;
  }

  return `Wait for a clean ${direction} confirmation candle.`;
}

function emptyTiming(summary) {
  return {
    timingStatus: "NO ENTRY",
    status: "NO ENTRY",
    direction: "NEUTRAL",
    timingScore: 0,
    score: 0,
    trigger: "NO TRIGGER",
    price: 0,
    entry: 0,
    stop: 0,
    target1: 0,
    target2: 0,
    summary,
    reasons: [],
    warnings: [summary],
    checklist: [],
  };
}

module.exports = { detectEntryTiming };