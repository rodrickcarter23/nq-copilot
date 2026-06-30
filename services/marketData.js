const axios = require("axios");

const SYMBOL = process.env.NQ_SYMBOL || "NQU6";
const CACHE_MS = 15000;

let cachedData = null;
let lastFetchTime = 0;

function toIsoTime(value) {
  const raw = String(value);

  let ms;

  if (raw.length >= 18) {
    ms = Number(BigInt(raw) / 1000000n); // nanoseconds
  } else if (raw.length >= 13) {
    ms = Number(value); // milliseconds
  } else {
    ms = Number(value) * 1000; // seconds
  }

  return new Date(ms).toISOString();
}

function normalizeCandles(raw = []) {
  return raw
    .map((c) => ({
      open: Number(c.open),
      high: Number(c.high),
      low: Number(c.low),
      close: Number(c.close),
      volume: Number(c.volume || 0),
      timestamp: toIsoTime(c.window_start),
    }))
    .filter(
      (c) =>
        Number.isFinite(c.open) &&
        Number.isFinite(c.high) &&
        Number.isFinite(c.low) &&
        Number.isFinite(c.close)
    )
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
}

function aggregateCandles(candles, size) {
  const groups = [];

  for (let i = 0; i < candles.length; i += size) {
    const chunk = candles.slice(i, i + size);
    if (!chunk.length) continue;

    groups.push({
      open: chunk[0].open,
      high: Math.max(...chunk.map((c) => c.high)),
      low: Math.min(...chunk.map((c) => c.low)),
      close: chunk[chunk.length - 1].close,
      volume: chunk.reduce((sum, c) => sum + c.volume, 0),
      timestamp: chunk[chunk.length - 1].timestamp,
    });
  }

  return groups;
}

async function fetchCandles(apiKey) {
  const response = await axios.get(
    `https://api.massive.com/futures/v1/aggs/${SYMBOL}`,
    {
      params: {
        resolution: "1min",
        limit: 1000,
        sort: "window_start.desc",
        apiKey,
      },
    }
  );

  return response.data.results || [];
}

async function getNQPrice() {
  const now = Date.now();

  if (cachedData && now - lastFetchTime < CACHE_MS) {
    return { ...cachedData, cached: true };
  }

  try {
    const apiKey = process.env.POLYGON_API_KEY;
    if (!apiKey) throw new Error("Missing POLYGON_API_KEY");

    const raw = await fetchCandles(apiKey);

    if (!raw.length) {
      throw new Error("No candles returned from Massive");
    }

    const candles1m = normalizeCandles(raw);

    if (!candles1m.length) {
      throw new Error("Candles returned but failed normalization");
    }

    const latest = candles1m[candles1m.length - 1];
    const latestMs = new Date(latest.timestamp).getTime();
    const staleMinutes = Math.floor((Date.now() - latestMs) / 60000);

    let mode = "LIVE";
    if (staleMinutes > 10) mode = "DELAYED";
    if (staleMinutes > 1440) mode = "STALE";

    const candles5m = aggregateCandles(candles1m, 5);
    const candles15m = aggregateCandles(candles1m, 15);
    const candles1h = aggregateCandles(candles1m, 60);

    cachedData = {
      symbol: SYMBOL,
      mode,
      price: latest.close,
      open: candles1m[0].open,
      high: Math.max(...candles1m.map((c) => c.high)),
      low: Math.min(...candles1m.map((c) => c.low)),
      volume: candles1m.reduce((sum, c) => sum + c.volume, 0),

      timestamp: latest.timestamp,
      receivedAt: new Date().toISOString(),
      staleMinutes,
      isFresh: mode === "LIVE",

      candles: candles1m,

      timeframes: {
        "1m": candles1m,
        "5m": candles5m,
        "15m": candles15m,
        "1h": candles1h,
      },

      cached: false,
    };

    console.log(
      `Market data: ${SYMBOL} | ${latest.close} | ${mode} | ${staleMinutes}m old | candles=${candles1m.length}`
    );

    lastFetchTime = now;
    return cachedData;
  } catch (error) {
    console.error("Market data error:", error.message);

    cachedData = {
      symbol: SYMBOL,
      mode: "FALLBACK",
      price: 30000,
      open: 30000,
      high: 30025,
      low: 29975,
      volume: 0,
      timestamp: new Date().toISOString(),
      receivedAt: new Date().toISOString(),
      staleMinutes: 999999,
      isFresh: false,
      candles: [],
      timeframes: {
        "1m": [],
        "5m": [],
        "15m": [],
        "1h": [],
      },
      cached: false,
      error: error.message,
    };

    lastFetchTime = now;
    return cachedData;
  }
}

module.exports = { getNQPrice };