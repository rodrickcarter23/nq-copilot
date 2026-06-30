function round(value, decimals = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Number(n.toFixed(decimals));
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function detectRiskManager(market, analysis = {}, smartEntry = {}) {
  const price = Number(market.price || 0);
  const entry = midEntry(smartEntry);
  const stop = Number(smartEntry.stopLoss || smartEntry.stop || analysis.stop || 0);
  const atr = Number(analysis.indicators?.atr || 10);

  if (!price || !entry || !stop) {
    return emptyRisk("Missing entry or stop data for risk calculation.");
  }

  const stopPoints = Math.abs(entry - stop);

  const nqDollarRisk1 = stopPoints * 20;
  const mnqDollarRisk1 = stopPoints * 2;

  const accountSize = 50000;
  const maxRiskPercent = 0.005;
  const maxDollarRisk = accountSize * maxRiskPercent;

  const suggestedNQ = Math.floor(maxDollarRisk / nqDollarRisk1);
  const suggestedMNQ = Math.floor(maxDollarRisk / mnqDollarRisk1);

  let riskLevel = "LOW";
  let riskScore = 90;
  const warnings = [];
  const reasons = [];

  if (stopPoints > atr * 4) {
    riskLevel = "HIGH";
    riskScore -= 30;
    warnings.push("Stop is wide compared to ATR.");
  } else {
    reasons.push("Stop size is reasonable compared to ATR.");
  }

  if (nqDollarRisk1 > maxDollarRisk) {
    warnings.push("1 NQ contract exceeds the recommended max dollar risk.");
    riskScore -= 25;
  } else {
    reasons.push("1 NQ contract is within max risk.");
  }

  if (mnqDollarRisk1 <= maxDollarRisk) {
    reasons.push("MNQ sizing is safer for this setup.");
  }

  const tooRiskyForNQ = nqDollarRisk1 > maxDollarRisk;
  const tradeAllowed = suggestedNQ >= 1 || suggestedMNQ >= 1;

  riskScore = clamp(riskScore);

  return {
    accountSize,
    maxRiskPercent: round(maxRiskPercent * 100),
    maxDollarRisk: round(maxDollarRisk),

    entry: round(entry),
    stop: round(stop),
    stopPoints: round(stopPoints),

    nqDollarRisk1: round(nqDollarRisk1),
    mnqDollarRisk1: round(mnqDollarRisk1),

    suggestedNQ: Math.max(0, suggestedNQ),
    suggestedMNQ: Math.max(0, suggestedMNQ),

    tooRiskyForNQ,
    tradeAllowed,

    riskLevel,
    riskScore,

    summary: tradeAllowed
      ? `Risk is ${riskLevel}. Suggested size: ${Math.max(0, suggestedNQ)} NQ or ${Math.max(0, suggestedMNQ)} MNQ.`
      : "Trade is too risky based on current stop size.",

    reasons,
    warnings,

    checklist: [
      { name: "Entry detected", passed: entry > 0 },
      { name: "Stop detected", passed: stop > 0 },
      { name: "Stop size reasonable", passed: stopPoints <= atr * 4 },
      { name: "1 NQ within risk", passed: !tooRiskyForNQ },
      { name: "Trade allowed", passed: tradeAllowed },
    ],
  };
}

function midEntry(smartEntry) {
  if (smartEntry.entryZoneLow && smartEntry.entryZoneHigh) {
    return (Number(smartEntry.entryZoneLow) + Number(smartEntry.entryZoneHigh)) / 2;
  }

  if (smartEntry.entry) return Number(smartEntry.entry);

  return 0;
}

function emptyRisk(summary) {
  return {
    accountSize: 50000,
    maxRiskPercent: 0.5,
    maxDollarRisk: 250,
    entry: 0,
    stop: 0,
    stopPoints: 0,
    nqDollarRisk1: 0,
    mnqDollarRisk1: 0,
    suggestedNQ: 0,
    suggestedMNQ: 0,
    tooRiskyForNQ: true,
    tradeAllowed: false,
    riskLevel: "UNKNOWN",
    riskScore: 0,
    summary,
    reasons: [],
    warnings: [summary],
    checklist: [],
  };
}

module.exports = { detectRiskManager };