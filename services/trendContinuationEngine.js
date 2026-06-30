function round(value, decimals = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Number(n.toFixed(decimals));
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function candleDirection(candle) {
  if (!candle) return "NEUTRAL";
  if (candle.close > candle.open) return "BULLISH";
  if (candle.close < candle.open) return "BEARISH";
  return "NEUTRAL";
}

function avg(values) {
  if (!values.length) return 0;
  return values.reduce((sum, v) => sum + Number(v || 0), 0) / values.length;
}

function detectTrendContinuation(market, analysis) {
  const candles = market.candles || [];
  const indicators = analysis.indicators || {};
  const structure = analysis.structure || {};
  const price = Number(market.price || 0);

  if (candles.length < 30 || !price) {
    return emptyTrend("Not enough candle data for trend continuation analysis.");
  }

  const recent = candles.slice(-20);
  const last5 = candles.slice(-5);

  const bullishCandles = recent.filter((c) => candleDirection(c) === "BULLISH").length;
  const bearishCandles = recent.filter((c) => candleDirection(c) === "BEARISH").length;

  const recentHigh = Math.max(...recent.map((c) => Number(c.high)));
  const recentLow = Math.min(...recent.map((c) => Number(c.low)));

  const lastClose = Number(candles[candles.length - 1].close);
  const firstClose = Number(recent[0].close);

  const momentum = lastClose - firstClose;

  const ema9 = Number(indicators.ema9 || 0);
  const ema20 = Number(indicators.ema20 || 0);
  const ema50 = Number(indicators.ema50 || 0);
  const ema200 = Number(indicators.ema200 || 0);
  const rsi = Number(indicators.rsi || 50);
  const rvol = Number(indicators.rvol || 1);
  const atr = Number(indicators.atr || 10);

  const avgBody = avg(
    recent.map((c) => Math.abs(Number(c.close) - Number(c.open)))
  );

  const lastBody = Math.abs(
    Number(candles[candles.length - 1].close) -
      Number(candles[candles.length - 1].open)
  );

  const strongLastMove = lastBody >= avgBody * 1.2;

  let bullishScore = 0;
  let bearishScore = 0;
  const reasons = [];
  const warnings = [];

  if (price > ema9 && ema9 > ema20 && ema20 > ema50) {
    bullishScore += 25;
    reasons.push("Bullish EMA stack supports continuation.");
  }

  if (price < ema9 && ema9 < ema20 && ema20 < ema50) {
    bearishScore += 25;
    reasons.push("Bearish EMA stack supports continuation.");
  }

  if (structure.structureBias === "LONG") {
    bullishScore += 20;
    reasons.push("Market structure supports LONG continuation.");
  }

  if (structure.structureBias === "SHORT") {
    bearishScore += 20;
    reasons.push("Market structure supports SHORT continuation.");
  }

  if (structure.breakOfStructure && structure.structureBias === "LONG") {
    bullishScore += 15;
    reasons.push("Bullish break of structure supports continuation.");
  }

  if (structure.breakOfStructure && structure.structureBias === "SHORT") {
    bearishScore += 15;
    reasons.push("Bearish break of structure supports continuation.");
  }

  if (momentum > atr * 2) {
    bullishScore += 15;
    reasons.push("Recent momentum is strongly bullish.");
  }

  if (momentum < -atr * 2) {
    bearishScore += 15;
    reasons.push("Recent momentum is strongly bearish.");
  }

  if (bullishCandles > bearishCandles) {
    bullishScore += 10;
    reasons.push("More bullish candles than bearish candles recently.");
  }

  if (bearishCandles > bullishCandles) {
    bearishScore += 10;
    reasons.push("More bearish candles than bullish candles recently.");
  }

  if (rsi >= 55 && rsi <= 75) {
    bullishScore += 10;
    reasons.push("RSI supports bullish continuation.");
  }

  if (rsi <= 45 && rsi >= 25) {
    bearishScore += 10;
    reasons.push("RSI supports bearish continuation.");
  }

  if (rvol >= 1.2) {
    bullishScore += 5;
    bearishScore += 5;
    reasons.push("Relative volume supports trend continuation.");
  } else {
    warnings.push("Relative volume is weak; continuation may be less reliable.");
  }

  if (strongLastMove && candleDirection(candles[candles.length - 1]) === "BULLISH") {
    bullishScore += 5;
    reasons.push("Last candle shows bullish expansion.");
  }

  if (strongLastMove && candleDirection(candles[candles.length - 1]) === "BEARISH") {
    bearishScore += 5;
    reasons.push("Last candle shows bearish expansion.");
  }

  bullishScore = clamp(bullishScore);
  bearishScore = clamp(bearishScore);

  let trend = "RANGE";
  let direction = "NEUTRAL";
  let continuationProbability = 50;
  let reversalProbability = 50;
  let recommendation = "WAIT";

  if (bullishScore > bearishScore + 15) {
    trend = "BULLISH";
    direction = "LONG";
    continuationProbability = bullishScore;
    reversalProbability = 100 - bullishScore;
    recommendation =
      bullishScore >= 80
        ? "LOOK FOR LONG CONTINUATION"
        : "WATCH LONG CONTINUATION";
  } else if (bearishScore > bullishScore + 15) {
    trend = "BEARISH";
    direction = "SHORT";
    continuationProbability = bearishScore;
    reversalProbability = 100 - bearishScore;
    recommendation =
      bearishScore >= 80
        ? "LOOK FOR SHORT CONTINUATION"
        : "WATCH SHORT CONTINUATION";
  }

  const pullbackStatus = getPullbackStatus(price, ema20, atr, direction);

  return {
    trend,
    direction,
    bullishScore,
    bearishScore,
    continuationProbability: clamp(continuationProbability),
    reversalProbability: clamp(reversalProbability),
    recommendation,
    pullbackStatus,
    recentHigh: round(recentHigh),
    recentLow: round(recentLow),
    momentum: round(momentum),
    rsi: round(rsi),
    rvol: round(rvol),
    summary:
      direction === "LONG"
        ? "Bullish continuation is favored. Prefer long pullbacks unless structure breaks."
        : direction === "SHORT"
        ? "Bearish continuation is favored. Prefer short pullbacks unless structure flips."
        : "No clean continuation edge. Wait for structure or momentum confirmation.",
    reasons,
    warnings,
    checklist: [
      {
        name: "EMA stack supports trend",
        passed:
          (direction === "LONG" && price > ema9 && ema9 > ema20 && ema20 > ema50) ||
          (direction === "SHORT" && price < ema9 && ema9 < ema20 && ema20 < ema50),
      },
      {
        name: "Structure supports trend",
        passed:
          (direction === "LONG" && structure.structureBias === "LONG") ||
          (direction === "SHORT" && structure.structureBias === "SHORT"),
      },
      {
        name: "Momentum supports trend",
        passed:
          (direction === "LONG" && momentum > atr * 2) ||
          (direction === "SHORT" && momentum < -atr * 2),
      },
      {
        name: "RSI supports continuation",
        passed:
          (direction === "LONG" && rsi >= 55 && rsi <= 75) ||
          (direction === "SHORT" && rsi <= 45 && rsi >= 25),
      },
      {
        name: "Relative volume supports continuation",
        passed: rvol >= 1.2,
      },
    ],
  };
}

function getPullbackStatus(price, ema20, atr, direction) {
  if (direction === "LONG") {
    if (price > ema20 + atr * 3) return "EXTENDED - WAIT FOR PULLBACK";
    if (price >= ema20 - atr && price <= ema20 + atr) return "IN BUY PULLBACK ZONE";
    return "TRENDING ABOVE EMA 20";
  }

  if (direction === "SHORT") {
    if (price < ema20 - atr * 3) return "EXTENDED - WAIT FOR PULLBACK";
    if (price >= ema20 - atr && price <= ema20 + atr) return "IN SELL PULLBACK ZONE";
    return "TRENDING BELOW EMA 20";
  }

  return "NO CLEAN PULLBACK";
}

function emptyTrend(summary) {
  return {
    trend: "UNKNOWN",
    direction: "NEUTRAL",
    bullishScore: 0,
    bearishScore: 0,
    continuationProbability: 50,
    reversalProbability: 50,
    recommendation: "WAIT",
    pullbackStatus: "NO DATA",
    recentHigh: 0,
    recentLow: 0,
    momentum: 0,
    rsi: 0,
    rvol: 0,
    summary,
    reasons: [],
    warnings: [summary],
    checklist: [],
  };
}

module.exports = { detectTrendContinuation };