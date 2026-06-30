function round(value, decimals = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Number(n.toFixed(decimals));
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function detectFVG(market, analysis = {}) {
  const candles = market.candles || [];
  const price = Number(market.price || 0);
  const indicators = analysis.indicators || {};
  const structure = analysis.structure || {};

  if (candles.length < 20 || !price) {
    return emptyFVG("Not enough candle data for FVG analysis.");
  }

  const recent = candles.slice(-120);
  const atr = Number(indicators.atr || averageRange(recent) || 10);

  const fvgs = [];

  for (let i = 2; i < recent.length; i++) {
    const c1 = recent[i - 2];
    const c2 = recent[i - 1];
    const c3 = recent[i];

    const c1High = Number(c1.high);
    const c1Low = Number(c1.low);
    const c2Open = Number(c2.open);
    const c2Close = Number(c2.close);
    const c3High = Number(c3.high);
    const c3Low = Number(c3.low);

    const displacement = Math.abs(c2Close - c2Open);

    if (c1High < c3Low) {
      fvgs.push(
        buildFVG({
          direction: "BULLISH",
          low: c1High,
          high: c3Low,
          createdAt: c3.timestamp,
          index: i,
          price,
          atr,
          candles: recent,
          displacement,
        })
      );
    }

    if (c1Low > c3High) {
      fvgs.push(
        buildFVG({
          direction: "BEARISH",
          low: c3High,
          high: c1Low,
          createdAt: c3.timestamp,
          index: i,
          price,
          atr,
          candles: recent,
          displacement,
        })
      );
    }
  }

  const activeFvgs = fvgs.filter((fvg) => !fvg.filled);
  const nearest = chooseNearestFVG(price, activeFvgs);

  if (!nearest) {
    return emptyFVG("No active unfilled FVG detected.");
  }

  let score = nearest.strength;
  const reasons = [...nearest.reasons];
  const warnings = [...nearest.warnings];

  if (structure.structureBias === "LONG" && nearest.direction === "BULLISH") {
    score += 10;
    reasons.push("Bullish FVG aligns with market structure.");
  }

  if (structure.structureBias === "SHORT" && nearest.direction === "BEARISH") {
    score += 10;
    reasons.push("Bearish FVG aligns with market structure.");
  }

  score = clamp(Math.round(score));

  return {
    fvgBias: nearest.direction,
    bias: nearest.direction,
    direction: nearest.direction === "BULLISH" ? "LONG" : "SHORT",

    activeFVG: true,
    active: true,

    fvgType: nearest.direction === "BULLISH" ? "BULLISH FVG" : "BEARISH FVG",
    type: nearest.direction === "BULLISH" ? "BULLISH FVG" : "BEARISH FVG",

    fvgScore: score,
    score,

    fvgHigh: nearest.high,
    fvgLow: nearest.low,
    fvgMidpoint: nearest.midpoint,
    zone: nearest.zone,

    gapSize: nearest.gapSize,
    distanceToFVG: nearest.distanceToFVG,

    priceInsideFVG: nearest.priceInsideFVG,
    priceInside: nearest.priceInsideFVG,

    filled: nearest.filled,
    partiallyFilled: nearest.partiallyFilled,
    fresh: nearest.fresh,
    mitigated: nearest.mitigated,

    totalFVGs: fvgs.length,
    activeFVGs: activeFvgs.length,

    summary: nearest.summary,
    reasons,
    warnings,

    checklist: [
      { name: "Active FVG detected", passed: true },
      { name: "FVG is fresh", passed: nearest.fresh },
      { name: "Price inside FVG", passed: nearest.priceInsideFVG },
      { name: "FVG not filled", passed: !nearest.filled },
      { name: "Clean gap size", passed: nearest.gapSize <= atr * 3 },
      {
        name: "FVG aligns with structure",
        passed:
          (structure.structureBias === "LONG" && nearest.direction === "BULLISH") ||
          (structure.structureBias === "SHORT" && nearest.direction === "BEARISH"),
      },
    ],
  };
}

function buildFVG({
  direction,
  low,
  high,
  createdAt,
  index,
  price,
  atr,
  candles,
  displacement,
}) {
  const gapSize = Math.abs(high - low);
  const midpoint = (high + low) / 2;

  const candlesAfter = candles.slice(index + 1);

  const filled =
    direction === "BULLISH"
      ? candlesAfter.some((c) => Number(c.low) <= low)
      : candlesAfter.some((c) => Number(c.high) >= high);

  const partiallyFilled =
    direction === "BULLISH"
      ? candlesAfter.some((c) => Number(c.low) <= midpoint)
      : candlesAfter.some((c) => Number(c.high) >= midpoint);

  const mitigated = partiallyFilled || filled;

  const touches = candlesAfter.filter((c) => {
    const candleTouchesZone = Number(c.low) <= high && Number(c.high) >= low;
    return candleTouchesZone;
  }).length;

  const fresh = touches <= 1 && !filled;

  const priceInsideFVG = price >= low && price <= high;

  const distanceToFVG =
    priceInsideFVG ? 0 : price > high ? price - high : low - price;

  let strength = 50;
  const reasons = [];
  const warnings = [];

  reasons.push(`${direction} fair value gap detected.`);

  if (fresh) {
    strength += 15;
    reasons.push("FVG is fresh or lightly tested.");
  } else {
    warnings.push("FVG has already been tested.");
  }

  if (priceInsideFVG) {
    strength += 15;
    reasons.push("Price is inside the FVG zone.");
  } else {
    warnings.push("Price is not inside the FVG zone yet.");
  }

  if (gapSize <= atr * 2.5) {
    strength += 10;
    reasons.push("FVG size is clean relative to volatility.");
  } else {
    warnings.push("FVG is wide; risk may be larger.");
  }

  if (displacement >= atr * 0.8) {
    strength += 10;
    reasons.push("Displacement candle supports the imbalance.");
  }

  if (filled) {
    strength -= 35;
    warnings.push("FVG has already been filled.");
  } else if (partiallyFilled) {
    strength -= 10;
    warnings.push("FVG has been partially mitigated.");
  }

  strength = clamp(Math.round(strength));

  return {
    direction,
    low: round(low),
    high: round(high),
    midpoint: round(midpoint),
    zone: `${round(low)} - ${round(high)}`,
    gapSize: round(gapSize),
    distanceToFVG: round(distanceToFVG),
    filled,
    partiallyFilled,
    fresh,
    mitigated,
    priceInsideFVG,
    strength,
    reasons,
    warnings,
    summary: `${direction} FVG detected. ${
      priceInsideFVG
        ? "Price is inside the imbalance zone."
        : "Wait for price to return to the imbalance."
    }`,
  };
}

function chooseNearestFVG(price, fvgs) {
  if (!fvgs.length) return null;

  const inside = fvgs.filter((fvg) => fvg.priceInsideFVG);
  if (inside.length) {
    return inside.sort((a, b) => b.strength - a.strength)[0];
  }

  return fvgs.sort((a, b) => a.distanceToFVG - b.distanceToFVG)[0];
}

function averageRange(candles) {
  if (!candles.length) return 10;
  return (
    candles.reduce(
      (sum, c) => sum + Math.abs(Number(c.high) - Number(c.low)),
      0
    ) / candles.length
  );
}

function emptyFVG(summary) {
  return {
    fvgBias: "NONE",
    bias: "NONE",
    direction: "NONE",
    activeFVG: false,
    active: false,
    fvgType: "NONE",
    type: "NONE",
    fvgScore: 0,
    score: 0,
    fvgHigh: 0,
    fvgLow: 0,
    fvgMidpoint: 0,
    zone: "--",
    gapSize: 0,
    distanceToFVG: 0,
    priceInsideFVG: false,
    priceInside: false,
    filled: false,
    partiallyFilled: false,
    fresh: false,
    mitigated: false,
    totalFVGs: 0,
    activeFVGs: 0,
    summary,
    reasons: [],
    warnings: [summary],
    checklist: [],
  };
}

module.exports = { detectFVG };