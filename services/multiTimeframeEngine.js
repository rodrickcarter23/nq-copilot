function round(value, decimals = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Number(n.toFixed(decimals));
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function detectMultiTimeframe(market, analysis = {}) {
  const timeframes = analysis.multiTimeframe || {};

  const tfList = ["1m", "5m", "15m", "1h"];

  const rows = tfList.map((tf) => {
    const data = timeframes[tf] || {};
    return {
      timeframe: tf,
      bias: data.bias || "NEUTRAL",
      score: Number(data.score || 0),
      long: Number(data.long || 0),
      short: Number(data.short || 0),
      rsi: round(data.rsi || 0),
      ema9: round(data.ema9 || 0),
      ema20: round(data.ema20 || 0),
      ema50: round(data.ema50 || 0),
      vwap: round(data.vwap || 0),
    };
  });

  const longCount = rows.filter((r) => r.bias === "LONG").length;
  const shortCount = rows.filter((r) => r.bias === "SHORT").length;
  const neutralCount = rows.filter((r) => r.bias === "NEUTRAL").length;

  let bias = "NEUTRAL";
  if (longCount >= 3) bias = "LONG";
  if (shortCount >= 3) bias = "SHORT";

  const alignmentScore = clamp(
    bias === "LONG"
      ? (longCount / tfList.length) * 100
      : bias === "SHORT"
      ? (shortCount / tfList.length) * 100
      : 50
  );

  const conflict =
    longCount > 0 && shortCount > 0
      ? true
      : false;

  let confidence = "LOW";
  if (alignmentScore >= 90) confidence = "EXTREME";
  else if (alignmentScore >= 75) confidence = "HIGH";
  else if (alignmentScore >= 60) confidence = "MEDIUM";

  const reasons = [];
  const warnings = [];

  if (bias === "LONG") {
    reasons.push(`${longCount} of ${tfList.length} timeframes support LONG.`);
  } else if (bias === "SHORT") {
    reasons.push(`${shortCount} of ${tfList.length} timeframes support SHORT.`);
  } else {
    warnings.push("No strong multi-timeframe agreement.");
  }

  if (conflict) {
    warnings.push("Timeframe conflict detected.");
  }

  if (neutralCount > 0) {
    warnings.push(`${neutralCount} timeframe(s) are neutral.`);
  }

  return {
    mtfBias: bias,
    bias,
    alignmentScore: Math.round(alignmentScore),
    score: Math.round(alignmentScore),
    confidence,

    longCount,
    shortCount,
    neutralCount,
    conflict,

    timeframes: rows,

    summary:
      bias === "LONG"
        ? "Multi-timeframe alignment favors LONG setups."
        : bias === "SHORT"
        ? "Multi-timeframe alignment favors SHORT setups."
        : "Multi-timeframe conditions are mixed. Be cautious.",

    reasons,
    warnings,

    checklist: [
      { name: "1m has directional bias", passed: rows[0]?.bias !== "NEUTRAL" },
      { name: "5m has directional bias", passed: rows[1]?.bias !== "NEUTRAL" },
      { name: "15m has directional bias", passed: rows[2]?.bias !== "NEUTRAL" },
      { name: "1h has directional bias", passed: rows[3]?.bias !== "NEUTRAL" },
      { name: "At least 3 timeframes agree", passed: longCount >= 3 || shortCount >= 3 },
      { name: "No timeframe conflict", passed: !conflict },
    ],
  };
}

module.exports = { detectMultiTimeframe };