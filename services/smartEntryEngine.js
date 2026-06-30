function round(value, decimals = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Number(n.toFixed(decimals));
}

function buildSmartEntry(market, analysis, setup, institutional) {
  const price = Number(market.price || 0);
  const indicators = analysis.indicators || {};
  const structure = analysis.structure || {};

  const direction = institutional.direction || analysis.bias || "NEUTRAL";
  const instScore = Number(institutional.institutionalScore || 0);

  if (direction === "NEUTRAL" || institutional.decision === "NO TRADE") {
    return noEntry("No clean institutional entry detected.");
  }

  const atr = Number(indicators.atr || 10);
  const ema20 = Number(indicators.ema20 || price);
  const vwap = Number(indicators.vwap || price);

  let entryZoneLow = 0;
  let entryZoneHigh = 0;
  let stopLoss = 0;
  let target1 = 0;
  let target2 = 0;
  let entryType = "";
  let confirmation = "";
  const checklist = [];
  const notes = [];

  if (direction === "LONG") {
    const pullbackLevel = Math.max(ema20, vwap);

    entryZoneLow = pullbackLevel - atr * 0.35;
    entryZoneHigh = pullbackLevel + atr * 0.35;

    const swingStop = Number(structure.lastSwingLow || 0);
    stopLoss = swingStop > 0 ? Math.min(swingStop, entryZoneLow - atr) : entryZoneLow - atr * 1.5;

    target1 = price + atr * 3;
    target2 = price + atr * 5;

    entryType = "LONG PULLBACK ZONE";
    confirmation = "Wait for price to pull back into the EMA/VWAP zone and close bullish.";

    checklist.push(
      check("Price above VWAP", price > vwap),
      check("EMA 20 support nearby", Math.abs(price - ema20) <= atr * 4),
      check("Bullish structure", structure.structureBias === "LONG"),
      check("Institutional score 75+", instScore >= 75),
      check("Avoid chasing extended price", price <= entryZoneHigh + atr * 3)
    );

    notes.push("Best long entry is near EMA/VWAP support.");
    notes.push("Do not chase a candle that is already extended above the entry zone.");
  }

  if (direction === "SHORT") {
    const pullbackLevel = Math.min(ema20, vwap);

    entryZoneLow = pullbackLevel - atr * 0.35;
    entryZoneHigh = pullbackLevel + atr * 0.35;

    const swingStop = Number(structure.lastSwingHigh || 0);
    stopLoss = swingStop > 0 ? Math.max(swingStop, entryZoneHigh + atr) : entryZoneHigh + atr * 1.5;

    target1 = price - atr * 3;
    target2 = price - atr * 5;

    entryType = "SHORT PULLBACK ZONE";
    confirmation = "Wait for price to pull back into the EMA/VWAP zone and close bearish.";

    checklist.push(
      check("Price below VWAP", price < vwap),
      check("EMA 20 resistance nearby", Math.abs(price - ema20) <= atr * 4),
      check("Bearish structure", structure.structureBias === "SHORT"),
      check("Institutional score 75+", instScore >= 75),
      check("Avoid chasing extended price", price >= entryZoneLow - atr * 3)
    );

    notes.push("Best short entry is near EMA/VWAP resistance.");
    notes.push("Do not chase a candle that is already extended below the entry zone.");
  }

  const midEntry = (entryZoneLow + entryZoneHigh) / 2;
  const risk = Math.abs(midEntry - stopLoss);
  const reward = Math.abs(target2 - midEntry);
  const riskReward = risk > 0 ? reward / risk : 0;

  const entryDecision =
    instScore >= 85
      ? "WAIT FOR PULLBACK"
      : instScore >= 75
      ? "WAIT FOR CONFIRMATION"
      : "WATCH ONLY";

  const entryZone = `${round(entryZoneLow)} - ${round(entryZoneHigh)}`;

  return {
    entryDecision,
    action: entryDecision,

    direction,
    entryType,
    entryZone,
    entryZoneLow: round(entryZoneLow),
    entryZoneHigh: round(entryZoneHigh),

    stopLoss: round(stopLoss),
    stop: round(stopLoss),

    target1: round(target1),
    target2: round(target2),

    riskReward: round(riskReward),
    confirmation,
    summary: `${entryDecision}: ${confirmation}`,

    checklist,
    notes,
  };
}

function check(name, passed) {
  return { name, passed: Boolean(passed) };
}

function noEntry(reason) {
  return {
    entryDecision: "WAIT",
    action: "WAIT",
    direction: "NEUTRAL",
    entryType: "NO CLEAN ENTRY",
    entryZone: "--",
    entryZoneLow: 0,
    entryZoneHigh: 0,
    stopLoss: 0,
    stop: 0,
    target1: 0,
    target2: 0,
    riskReward: 0,
    confirmation: reason,
    summary: reason,
    checklist: [check(reason, false)],
    notes: [reason],
  };
}

module.exports = { buildSmartEntry };