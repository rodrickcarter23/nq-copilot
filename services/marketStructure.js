function round(value, decimals = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Number(n.toFixed(decimals));
}

function getSwingHighs(candles, lookback = 2) {
  const swings = [];

  for (let i = lookback; i < candles.length - lookback; i++) {
    const current = candles[i];

    let isSwingHigh = true;

    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j !== i && candles[j].high >= current.high) {
        isSwingHigh = false;
        break;
      }
    }

    if (isSwingHigh) {
      swings.push({
        index: i,
        price: current.high,
        timestamp: current.timestamp,
      });
    }
  }

  return swings;
}

function getSwingLows(candles, lookback = 2) {
  const swings = [];

  for (let i = lookback; i < candles.length - lookback; i++) {
    const current = candles[i];

    let isSwingLow = true;

    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j !== i && candles[j].low <= current.low) {
        isSwingLow = false;
        break;
      }
    }

    if (isSwingLow) {
      swings.push({
        index: i,
        price: current.low,
        timestamp: current.timestamp,
      });
    }
  }

  return swings;
}

function analyzeStructure(candles = []) {
  if (!Array.isArray(candles) || candles.length < 20) {
    return {
      trend: "UNKNOWN",
      structureBias: "NEUTRAL",
      bullishStructure: false,
      bearishStructure: false,
      breakOfStructure: false,
      changeOfCharacter: false,
      lastSwingHigh: 0,
      lastSwingLow: 0,
      previousSwingHigh: 0,
      previousSwingLow: 0,
      summary: "Not enough candle data for market structure.",
    };
  }

  const recentCandles = candles.slice(-120);
  const currentPrice = recentCandles[recentCandles.length - 1].close;

  const swingHighs = getSwingHighs(recentCandles);
  const swingLows = getSwingLows(recentCandles);

  const lastTwoHighs = swingHighs.slice(-2);
  const lastTwoLows = swingLows.slice(-2);

  const previousSwingHigh = lastTwoHighs[0]?.price || 0;
  const lastSwingHigh = lastTwoHighs[1]?.price || previousSwingHigh;

  const previousSwingLow = lastTwoLows[0]?.price || 0;
  const lastSwingLow = lastTwoLows[1]?.price || previousSwingLow;

  const higherHigh =
    lastSwingHigh > previousSwingHigh && previousSwingHigh > 0;

  const higherLow =
    lastSwingLow > previousSwingLow && previousSwingLow > 0;

  const lowerHigh =
    lastSwingHigh < previousSwingHigh && previousSwingHigh > 0;

  const lowerLow =
    lastSwingLow < previousSwingLow && previousSwingLow > 0;

  const bullishStructure = higherHigh && higherLow;
  const bearishStructure = lowerHigh && lowerLow;

  const bullishBreak =
    previousSwingHigh > 0 && currentPrice > previousSwingHigh;

  const bearishBreak =
    previousSwingLow > 0 && currentPrice < previousSwingLow;

  let trend = "RANGE";
  let structureBias = "NEUTRAL";
  let summary = "Market structure is mixed or ranging.";

  if (bullishStructure || bullishBreak) {
    trend = "BULLISH";
    structureBias = "LONG";
    summary = "Bullish structure: higher highs/higher lows or breakout above prior swing high.";
  }

  if (bearishStructure || bearishBreak) {
    trend = "BEARISH";
    structureBias = "SHORT";
    summary = "Bearish structure: lower highs/lower lows or breakdown below prior swing low.";
  }

  const changeOfCharacter =
    (bullishStructure && bearishBreak) || (bearishStructure && bullishBreak);

  const breakOfStructure = bullishBreak || bearishBreak;

  return {
    trend,
    structureBias,
    bullishStructure,
    bearishStructure,
    breakOfStructure,
    changeOfCharacter,

    higherHigh,
    higherLow,
    lowerHigh,
    lowerLow,

    bullishBreak,
    bearishBreak,

    lastSwingHigh: round(lastSwingHigh),
    lastSwingLow: round(lastSwingLow),
    previousSwingHigh: round(previousSwingHigh),
    previousSwingLow: round(previousSwingLow),

    summary,
  };
}

module.exports = {
  analyzeStructure,
};