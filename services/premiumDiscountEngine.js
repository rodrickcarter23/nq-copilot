function round(value, decimals = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Number(n.toFixed(decimals));
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function detectPremiumDiscount(market, analysis = {}) {
  const candles = market.candles || [];
  const price = Number(market.price || 0);
  const structure = analysis.structure || {};

  if (candles.length < 50 || !price) {
    return emptyPD("Not enough candle data for premium/discount analysis.");
  }

  const recent = candles.slice(-120);

  const swingHigh =
    Number(structure.lastSwingHigh) ||
    Math.max(...recent.map((c) => Number(c.high)));

  const swingLow =
    Number(structure.lastSwingLow) ||
    Math.min(...recent.map((c) => Number(c.low)));

  if (!swingHigh || !swingLow || swingHigh <= swingLow) {
    return emptyPD("Invalid swing range for premium/discount analysis.");
  }

  const range = swingHigh - swingLow;
  const equilibrium = swingLow + range * 0.5;
  const discountLevel = swingLow + range * 0.25;
  const premiumLevel = swingLow + range * 0.75;

  const positionPercent = ((price - swingLow) / range) * 100;

  let zone = "EQUILIBRIUM";
  let optimalTrade = "WAIT";
  let bias = "NEUTRAL";
  let score = 50;

  const reasons = [];
  const warnings = [];

  if (positionPercent <= 25) {
    zone = "DEEP DISCOUNT";
    optimalTrade = "LONGS ONLY";
    bias = "BUYERS";
    score += 30;
    reasons.push("Price is in deep discount.");
  } else if (positionPercent < 50) {
    zone = "DISCOUNT";
    optimalTrade = "PREFER LONGS";
    bias = "BUYERS";
    score += 20;
    reasons.push("Price is trading in discount.");
  } else if (positionPercent >= 75) {
    zone = "DEEP PREMIUM";
    optimalTrade = "SHORTS ONLY";
    bias = "SELLERS";
    score += 30;
    reasons.push("Price is in deep premium.");
  } else if (positionPercent > 50) {
    zone = "PREMIUM";
    optimalTrade = "PREFER SHORTS";
    bias = "SELLERS";
    score += 20;
    reasons.push("Price is trading in premium.");
  } else {
    warnings.push("Price is near equilibrium; directional edge is weaker.");
  }

  if (structure.structureBias === "LONG" && bias === "BUYERS") {
    score += 10;
    reasons.push("Discount pricing aligns with bullish structure.");
  }

  if (structure.structureBias === "SHORT" && bias === "SELLERS") {
    score += 10;
    reasons.push("Premium pricing aligns with bearish structure.");
  }

  if (zone === "EQUILIBRIUM") {
    score -= 10;
    warnings.push("Equilibrium often produces chop.");
  }

  const oteLow = swingLow + range * 0.62;
  const oteHigh = swingLow + range * 0.79;

  const insideOTE = price >= oteLow && price <= oteHigh;

  if (insideOTE) {
    score += 10;
    reasons.push("Price is inside the OTE zone.");
  }

  score = clamp(Math.round(score));

  return {
    pdBias: bias,
    bias,
    premiumDiscountScore: score,
    score,

    swingHigh: round(swingHigh),
    swingLow: round(swingLow),
    range: round(range),

    premiumLevel: round(premiumLevel),
    equilibrium: round(equilibrium),
    discountLevel: round(discountLevel),

    currentZone: zone,
    zone,

    positionPercent: round(positionPercent),
    optimalTrade,
    insideOTE,

    oteLow: round(oteLow),
    oteHigh: round(oteHigh),
    oteZone: `${round(oteLow)} - ${round(oteHigh)}`,

    summary: buildSummary(zone, optimalTrade, positionPercent),

    reasons,
    warnings,

    checklist: [
      { name: "Swing range detected", passed: true },
      { name: "Price in discount", passed: positionPercent < 50 },
      { name: "Price in premium", passed: positionPercent > 50 },
      { name: "Price away from equilibrium", passed: Math.abs(positionPercent - 50) >= 10 },
      { name: "Inside OTE zone", passed: insideOTE },
      {
        name: "Pricing aligns with structure",
        passed:
          (structure.structureBias === "LONG" && bias === "BUYERS") ||
          (structure.structureBias === "SHORT" && bias === "SELLERS"),
      },
    ],
  };
}

function buildSummary(zone, optimalTrade, positionPercent) {
  return `Price is in ${zone} at ${round(positionPercent)}% of the current swing range. Optimal trade filter: ${optimalTrade}.`;
}

function emptyPD(summary) {
  return {
    pdBias: "NEUTRAL",
    bias: "NEUTRAL",
    premiumDiscountScore: 0,
    score: 0,
    swingHigh: 0,
    swingLow: 0,
    range: 0,
    premiumLevel: 0,
    equilibrium: 0,
    discountLevel: 0,
    currentZone: "UNKNOWN",
    zone: "UNKNOWN",
    positionPercent: 0,
    optimalTrade: "WAIT",
    insideOTE: false,
    oteLow: 0,
    oteHigh: 0,
    oteZone: "--",
    summary,
    reasons: [],
    warnings: [summary],
    checklist: [],
  };
}

module.exports = { detectPremiumDiscount };