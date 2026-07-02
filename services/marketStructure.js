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
      if (j !== i && Number(candles[j].high) >= Number(current.high)) {
        isSwingHigh = false;
        break;
      }
    }

    if (isSwingHigh) {
      swings.push({
        index: i,
        price: Number(current.high),
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
      if (j !== i && Number(candles[j].low) <= Number(current.low)) {
        isSwingLow = false;
        break;
      }
    }

    if (isSwingLow) {
      swings.push({
        index: i,
        price: Number(current.low),
        timestamp: current.timestamp,
      });
    }
  }

  return swings;
}

function analyzeStructure(candles = []) {
  if (!Array.isArray(candles) || candles.length < 20) {
    return emptyStructure("Not enough candle data for market structure.");
  }

  const recentCandles = candles.slice(-120);
  const current = recentCandles[recentCandles.length - 1];
  const previous = recentCandles[recentCandles.length - 2];

  const currentPrice = Number(current.close);
  const previousClose = Number(previous.close);

  const swingHighs = getSwingHighs(recentCandles);
  const swingLows = getSwingLows(recentCandles);

  const lastTwoHighs = swingHighs.slice(-2);
  const lastTwoLows = swingLows.slice(-2);

  const previousSwingHigh = Number(lastTwoHighs[0]?.price || 0);
  const lastSwingHigh = Number(lastTwoHighs[1]?.price || previousSwingHigh || 0);

  const previousSwingLow = Number(lastTwoLows[0]?.price || 0);
  const lastSwingLow = Number(lastTwoLows[1]?.price || previousSwingLow || 0);

  const higherHigh = lastSwingHigh > previousSwingHigh && previousSwingHigh > 0;
  const higherLow = lastSwingLow > previousSwingLow && previousSwingLow > 0;
  const lowerHigh = lastSwingHigh < previousSwingHigh && previousSwingHigh > 0;
  const lowerLow = lastSwingLow < previousSwingLow && previousSwingLow > 0;

  const bullishBreak = previousSwingHigh > 0 && currentPrice > previousSwingHigh;
  const bearishBreak = previousSwingLow > 0 && currentPrice < previousSwingLow;

  const last20 = recentCandles.slice(-20);
  const first20Close = Number(last20[0].close);
  const last20High = Math.max(...last20.map((c) => Number(c.high)));
  const last20Low = Math.min(...last20.map((c) => Number(c.low)));

  const shortMomentum = currentPrice < first20Close;
  const longMomentum = currentPrice > first20Close;

  const strongBearCandle =
    Number(current.close) < Number(current.open) &&
    Math.abs(Number(current.close) - Number(current.open)) >
      Math.abs(Number(previous.close) - Number(previous.open));

  const strongBullCandle =
    Number(current.close) > Number(current.open) &&
    Math.abs(Number(current.close) - Number(current.open)) >
      Math.abs(Number(previous.close) - Number(previous.open));

  let longScore = 0;
  let shortScore = 0;

  if (higherHigh) longScore += 20;
  if (higherLow) longScore += 20;
  if (bullishBreak) longScore += 30;
  if (longMomentum) longScore += 20;
  if (strongBullCandle) longScore += 10;

  if (lowerHigh) shortScore += 20;
  if (lowerLow) shortScore += 20;
  if (bearishBreak) shortScore += 30;
  if (shortMomentum) shortScore += 20;
  if (strongBearCandle) shortScore += 10;

  let structureBias = "NEUTRAL";
  let trend = "RANGE";

  if (longScore > shortScore + 10) {
    structureBias = "LONG";
    trend = "BULLISH";
  } else if (shortScore > longScore + 10) {
    structureBias = "SHORT";
    trend = "BEARISH";
  }

  const bullishStructure = longScore >= 40;
  const bearishStructure = shortScore >= 40;

  const breakOfStructure = bullishBreak || bearishBreak;

  const changeOfCharacter =
    (structureBias === "LONG" && bearishBreak) ||
    (structureBias === "SHORT" && bullishBreak);

  const summary =
    structureBias === "LONG"
      ? "Market structure favors LONG. Buyers have more structural confirmation."
      : structureBias === "SHORT"
      ? "Market structure favors SHORT. Sellers have more structural confirmation."
      : "Market structure is mixed or ranging.";

  return {
    trend,
    structureBias,

    longScore,
    shortScore,

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

    recentHigh: round(last20High),
    recentLow: round(last20Low),
    currentPrice: round(currentPrice),

    summary,
  };
}

function emptyStructure(summary) {
  return {
    trend: "UNKNOWN",
    structureBias: "NEUTRAL",
    longScore: 0,
    shortScore: 0,
    bullishStructure: false,
    bearishStructure: false,
    breakOfStructure: false,
    changeOfCharacter: false,
    higherHigh: false,
    higherLow: false,
    lowerHigh: false,
    lowerLow: false,
    bullishBreak: false,
    bearishBreak: false,
    lastSwingHigh: 0,
    lastSwingLow: 0,
    previousSwingHigh: 0,
    previousSwingLow: 0,
    recentHigh: 0,
    recentLow: 0,
    currentPrice: 0,
    summary,
  };
}

module.exports = {
  analyzeStructure,
};