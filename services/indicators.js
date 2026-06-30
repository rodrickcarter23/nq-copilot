function round(value, decimals = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Number(n.toFixed(decimals));
}

function ema(values, period) {
  if (!values.length) return 0;

  const k = 2 / (period + 1);
  let result = values[0];

  for (let i = 1; i < values.length; i++) {
    result = values[i] * k + result * (1 - k);
  }

  return round(result);
}

function vwap(candles) {
  let totalPV = 0;
  let totalVolume = 0;

  candles.forEach((c) => {
    const typical = (c.high + c.low + c.close) / 3;
    const volume = c.volume || 1;

    totalPV += typical * volume;
    totalVolume += volume;
  });

  if (!totalVolume) return 0;

  return round(totalPV / totalVolume);
}

function atr(candles, period = 14) {
  if (candles.length < 2) return 0;

  const trs = [];

  for (let i = 1; i < candles.length; i++) {
    const current = candles[i];
    const prev = candles[i - 1];

    const tr = Math.max(
      current.high - current.low,
      Math.abs(current.high - prev.close),
      Math.abs(current.low - prev.close)
    );

    trs.push(tr);
  }

  const recent = trs.slice(-period);
  const avg = recent.reduce((sum, v) => sum + v, 0) / recent.length;

  return round(avg);
}

function rsi(candles, period = 14) {
  if (candles.length <= period) return 50;

  const closes = candles.map((c) => c.close);
  let gains = 0;
  let losses = 0;

  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];

    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;

  if (avgLoss === 0) return 100;

  const rs = avgGain / avgLoss;
  return round(100 - 100 / (1 + rs));
}

function relativeVolume(candles) {
  if (candles.length < 20) return 1;

  const recent = candles.slice(-1)[0].volume || 0;
  const previous = candles.slice(-21, -1);

  const avg =
    previous.reduce((sum, c) => sum + (c.volume || 0), 0) / previous.length;

  if (!avg) return 1;

  return round(recent / avg, 2);
}

function calculateIndicators(candles = []) {
  const closes = candles.map((c) => c.close);

  return {
    ema9: ema(closes, 9),
    ema20: ema(closes, 20),
    ema50: ema(closes, 50),
    ema200: ema(closes, 200),
    vwap: vwap(candles),
    atr: atr(candles),
    rsi: rsi(candles),
    rvol: relativeVolume(candles),
  };
}

module.exports = {
  calculateIndicators,
};