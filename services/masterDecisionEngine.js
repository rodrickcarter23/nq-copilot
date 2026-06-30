function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function round(value, decimals = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Number(n.toFixed(decimals));
}

function buildMasterDecision({
  market,
  analysis,
  setup,
  institutional,
  smartEntry,
  orderBlocks,
  trendContinuation,
  liquidity,
  volumeProfile,
  fvg,
  premiumDiscount,
  multiTimeframe,
  riskManager,
}) {
  const reasons = [];
  const warnings = [];

  const direction = chooseDirection({
    analysis,
    institutional,
    smartEntry,
    trendContinuation,
    multiTimeframe,
  });

  let score = 0;

  score += scoreEngine("Market Score", analysis?.score, 15, reasons, warnings);
  score += scoreDirection("Smart Entry", smartEntry?.direction, direction, 12, reasons, warnings);
  score += scoreDirection("Institutional", institutional?.direction, direction, 12, reasons, warnings);
  score += scoreDirection("Trend Continuation", trendContinuation?.direction, direction, 10, reasons, warnings);
  score += scoreDirection("Multi-Timeframe", multiTimeframe?.bias, direction, 10, reasons, warnings);
  score += scoreRisk(riskManager, reasons, warnings);
  score += scoreOrderBlock(orderBlocks, direction, reasons, warnings);
  score += scoreLiquidity(liquidity, direction, reasons, warnings);
  score += scoreVolumeProfile(volumeProfile, direction, reasons, warnings);
  score += scoreFVG(fvg, direction, reasons, warnings);
  score += scorePremiumDiscount(premiumDiscount, direction, reasons, warnings);

  score = clamp(Math.round(score));

  const grade = getGrade(score);
  const confidence = getConfidence(score);
  const action = getAction(score, riskManager, smartEntry);

  const entry =
    Number(smartEntry?.entry) ||
    Number(riskManager?.entry) ||
    Number(analysis?.entry) ||
    0;

  const stop =
    Number(smartEntry?.stopLoss) ||
    Number(riskManager?.stop) ||
    Number(analysis?.stop) ||
    0;

  const target1 =
    Number(smartEntry?.target1) ||
    Number(analysis?.target1) ||
    0;

  const target2 =
    Number(smartEntry?.target2) ||
    Number(analysis?.target2) ||
    0;

  return {
    masterScore: score,
    score,
    grade,
    confidence,

    direction,
    action,

    tradeAllowed: action === "TAKE TRADE" || action === "WATCH FOR ENTRY",

    entry: round(entry),
    stop: round(stop),
    target1: round(target1),
    target2: round(target2),

    riskLevel: riskManager?.riskLevel || "UNKNOWN",
    riskScore: riskManager?.riskScore || 0,

    setupName: setup?.setupName || "UNKNOWN",
    smartEntryDecision: smartEntry?.entryDecision || "WAIT",

    summary: buildSummary(score, direction, action),

    reasons,
    warnings,

    checklist: [
      {
        name: "Market score strong",
        passed: Number(analysis?.score || 0) >= 75,
      },
      {
        name: "Smart entry supports direction",
        passed: smartEntry?.direction === direction,
      },
      {
        name: "Institutional engine supports direction",
        passed: institutional?.direction === direction,
      },
      {
        name: "Trend continuation supports direction",
        passed: trendContinuation?.direction === direction,
      },
      {
        name: "Multi-timeframe supports direction",
        passed: multiTimeframe?.bias === direction,
      },
      {
        name: "Risk manager allows trade",
        passed: riskManager?.tradeAllowed === true,
      },
      {
        name: "FVG supports direction",
        passed:
          (direction === "LONG" && fvg?.direction === "LONG") ||
          (direction === "SHORT" && fvg?.direction === "SHORT"),
      },
      {
        name: "Order block supports direction",
        passed:
          (direction === "LONG" && orderBlocks?.direction === "LONG") ||
          (direction === "SHORT" && orderBlocks?.direction === "SHORT"),
      },
    ],
  };
}

function chooseDirection({ analysis, institutional, smartEntry, trendContinuation, multiTimeframe }) {
  const votes = { LONG: 0, SHORT: 0 };

  [analysis?.bias, institutional?.direction, smartEntry?.direction, trendContinuation?.direction, multiTimeframe?.bias]
    .forEach((v) => {
      if (v === "LONG") votes.LONG += 1;
      if (v === "SHORT") votes.SHORT += 1;
    });

  if (votes.LONG > votes.SHORT) return "LONG";
  if (votes.SHORT > votes.LONG) return "SHORT";
  return "NEUTRAL";
}

function scoreEngine(name, value, maxPoints, reasons, warnings) {
  const n = Number(value || 0);

  if (n >= 80) {
    reasons.push(`${name} is strong.`);
    return maxPoints;
  }

  if (n >= 60) {
    reasons.push(`${name} is decent.`);
    return Math.round(maxPoints * 0.6);
  }

  warnings.push(`${name} is weak.`);
  return 0;
}

function scoreDirection(name, value, direction, points, reasons, warnings) {
  if (direction === "NEUTRAL") {
    warnings.push("No clear master direction yet.");
    return 0;
  }

  if (value === direction) {
    reasons.push(`${name} agrees with ${direction}.`);
    return points;
  }

  warnings.push(`${name} does not agree with ${direction}.`);
  return 0;
}

function scoreRisk(risk, reasons, warnings) {
  if (!risk) return 0;

  if (risk.tradeAllowed && risk.riskScore >= 75) {
    reasons.push("Risk manager approves the trade.");
    return 10;
  }

  if (risk.tradeAllowed) {
    reasons.push("Risk manager allows the trade, but risk is not ideal.");
    return 5;
  }

  warnings.push("Risk manager does not approve the trade.");
  return 0;
}

function scoreOrderBlock(ob, direction, reasons, warnings) {
  if (!ob || direction === "NEUTRAL") return 0;

  if (ob.direction === direction && Number(ob.strength || ob.obStrength || 0) >= 60) {
    reasons.push("Order block supports the trade direction.");
    return 8;
  }

  warnings.push("Order block does not strongly support the trade.");
  return 0;
}

function scoreLiquidity(liq, direction, reasons, warnings) {
  if (!liq || direction === "NEUTRAL") return 0;

  if (liq.sweep || liq.liquiditySweep) {
    reasons.push("Liquidity sweep detected.");
    return 8;
  }

  if (
    (direction === "LONG" && liq.bias === "BUY SIDE") ||
    (direction === "SHORT" && liq.bias === "SELL SIDE")
  ) {
    reasons.push("Liquidity magnet supports direction.");
    return 5;
  }

  warnings.push("Liquidity has not fully confirmed the trade.");
  return 0;
}

function scoreVolumeProfile(vp, direction, reasons, warnings) {
  if (!vp || direction === "NEUTRAL") return 0;

  if (direction === "LONG" && vp.aboveValue) {
    reasons.push("Volume profile supports long continuation.");
    return 8;
  }

  if (direction === "SHORT" && vp.belowValue) {
    reasons.push("Volume profile supports short continuation.");
    return 8;
  }

  if (vp.insideValue) {
    warnings.push("Price is inside value; chop risk exists.");
    return 2;
  }

  warnings.push("Volume profile does not strongly support direction.");
  return 0;
}

function scoreFVG(fvg, direction, reasons, warnings) {
  if (!fvg || direction === "NEUTRAL") return 0;

  if (fvg.direction === direction && fvg.activeFVG) {
    reasons.push("Active FVG supports the trade direction.");
    return 7;
  }

  warnings.push("FVG does not confirm the trade direction.");
  return 0;
}

function scorePremiumDiscount(pd, direction, reasons, warnings) {
  if (!pd || direction === "NEUTRAL") return 0;

  if (direction === "LONG" && pd.bias === "BUYERS") {
    reasons.push("Premium/discount pricing supports longs.");
    return 8;
  }

  if (direction === "SHORT" && pd.bias === "SELLERS") {
    reasons.push("Premium/discount pricing supports shorts.");
    return 8;
  }

  warnings.push("Premium/discount pricing does not support the trade.");
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

function getAction(score, risk, smartEntry) {
  if (!risk?.tradeAllowed) return "NO TRADE - RISK";
  if (smartEntry?.entryDecision?.includes("WAIT")) return "WATCH FOR ENTRY";
  if (score >= 85) return "TAKE TRADE";
  if (score >= 70) return "WATCH FOR ENTRY";
  return "NO TRADE";
}

function buildSummary(score, direction, action) {
  return `${action}: ${direction} with master score ${score}/100. Use this as confirmation, not financial advice.`;
}

module.exports = { buildMasterDecision };