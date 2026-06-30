function round(value, decimals = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Number(n.toFixed(decimals));
}

function candleDirection(candle) {
  if (!candle) return "NONE";
  if (candle.close > candle.open) return "BULLISH";
  if (candle.close < candle.open) return "BEARISH";
  return "NEUTRAL";
}

function detectOrderBlocks(market) {
  const candles = market.candles || [];
  const price = Number(market.price || 0);

  if (candles.length < 30 || !price) {
    return emptyOB("Not enough candle data for order block analysis.");
  }

  const recent = candles.slice(-60);
  const atrApprox = averageRange(recent);

  let bullishOB = null;
  let bearishOB = null;

  for (let i = recent.length - 4; i >= 2; i--) {
    const c = recent[i];
    const n1 = recent[i + 1];
    const n2 = recent[i + 2];

    const cDir = candleDirection(c);
    const n1Dir = candleDirection(n1);
    const n2Dir = candleDirection(n2);

    const bullishDisplacement =
      cDir === "BEARISH" &&
      n1Dir === "BULLISH" &&
      n2Dir === "BULLISH" &&
      n2.close > c.high;

    const bearishDisplacement =
      cDir === "BULLISH" &&
      n1Dir === "BEARISH" &&
      n2Dir === "BEARISH" &&
      n2.close < c.low;

    if (!bullishOB && bullishDisplacement) {
      bullishOB = buildOB(c, "BULLISH", "DEMAND", price, atrApprox, recent);
    }

    if (!bearishOB && bearishDisplacement) {
      bearishOB = buildOB(c, "BEARISH", "SUPPLY", price, atrApprox, recent);
    }

    if (bullishOB && bearishOB) break;
  }

  const selected = chooseBestOB(price, bullishOB, bearishOB);

  if (!selected) {
    return emptyOB("No clean order block detected yet.");
  }

  return selected;
}

function buildOB(candle, bias, type, price, atr, candles) {
  const high = Number(candle.high);
  const low = Number(candle.low);
  const midpoint = (high + low) / 2;
  const zoneSize = Math.abs(high - low);

  const priceInside = price >= low && price <= high;
  const nearZone =
    price >= low - atr * 0.75 &&
    price <= high + atr * 0.75;

  const touches = candles.filter((c) => {
    const candleTouchesZone = c.low <= high && c.high >= low;
    const isAfter = new Date(c.timestamp) > new Date(candle.timestamp);
    return candleTouchesZone && isAfter;
  }).length;

  const fresh = touches <= 1;

  let strength = 50;

  if (fresh) strength += 15;
  if (nearZone) strength += 10;
  if (priceInside) strength += 15;
  if (zoneSize <= atr * 1.5) strength += 10;
  if (zoneSize > atr * 3) strength -= 10;

  strength = Math.max(0, Math.min(100, Math.round(strength)));

  const active =
    (bias === "BULLISH" && price >= low - atr * 1.5) ||
    (bias === "BEARISH" && price <= high + atr * 1.5);

  const reasons = [];

  reasons.push(`${type} order block detected.`);
  if (fresh) reasons.push("Order block is fresh or lightly tested.");
  if (nearZone) reasons.push("Price is near the order block zone.");
  if (priceInside) reasons.push("Price is inside the order block.");
  if (zoneSize <= atr * 1.5) reasons.push("Order block size is clean relative to volatility.");

  const warnings = [];

  if (!fresh) warnings.push("Order block has already been tested multiple times.");
  if (!nearZone) warnings.push("Price has not pulled back into the order block yet.");
  if (zoneSize > atr * 3) warnings.push("Order block is wide; risk may be larger.");

  return {
    obBias: bias,
    bias,
    activeOB: active,
    active: active,
    obType: type,
    type,
    obStrength: strength,
    strength,
    orderBlockHigh: round(high),
    orderBlockLow: round(low),
    obHigh: round(high),
    obLow: round(low),
    obMidpoint: round(midpoint),
    midpoint: round(midpoint),
    zone: `${round(low)} - ${round(high)}`,
    priceInsideOB: priceInside,
    priceInside,
    nearZone,
    fresh,
    tested: !fresh,
    touches,
    direction: bias === "BULLISH" ? "LONG" : "SHORT",
    summary: `${type} order block identified. ${
      priceInside
        ? "Price is inside the zone."
        : nearZone
        ? "Price is near the zone."
        : "Wait for pullback."
    }`,
    reasons,
    warnings,
    checklist: [
      { name: `${type} order block detected`, passed: true },
      { name: "Fresh order block", passed: fresh },
      { name: "Price near zone", passed: nearZone },
      { name: "Price inside zone", passed: priceInside },
      { name: "Clean zone size", passed: zoneSize <= atr * 1.5 },
    ],
  };
}

function chooseBestOB(price, bullishOB, bearishOB) {
  if (bullishOB && !bearishOB) return bullishOB;
  if (!bullishOB && bearishOB) return bearishOB;
  if (!bullishOB && !bearishOB) return null;

  const bullishDistance = Math.abs(price - bullishOB.obMidpoint);
  const bearishDistance = Math.abs(price - bearishOB.obMidpoint);

  if (bullishOB.priceInsideOB) return bullishOB;
  if (bearishOB.priceInsideOB) return bearishOB;

  return bullishDistance <= bearishDistance ? bullishOB : bearishOB;
}

function averageRange(candles) {
  if (!candles.length) return 10;
  const total = candles.reduce((sum, c) => sum + Math.abs(c.high - c.low), 0);
  return total / candles.length || 10;
}

function emptyOB(summary) {
  return {
    obBias: "NONE",
    bias: "NONE",
    activeOB: false,
    active: false,
    obType: "NONE",
    type: "NONE",
    obStrength: 0,
    strength: 0,
    orderBlockHigh: 0,
    orderBlockLow: 0,
    obHigh: 0,
    obLow: 0,
    obMidpoint: 0,
    midpoint: 0,
    zone: "--",
    priceInsideOB: false,
    priceInside: false,
    nearZone: false,
    fresh: false,
    tested: false,
    touches: 0,
    direction: "NONE",
    summary,
    reasons: [],
    warnings: [summary],
    checklist: [],
  };
}

module.exports = { detectOrderBlocks };