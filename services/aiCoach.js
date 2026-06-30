function generateCoach(market, analysis) {
  const reasons = analysis.reasons || [];
  const warnings = analysis.warnings || [];
  const indicators = analysis.indicators || {};
  const structure = analysis.structure || {};

  let summary = "";

  if (analysis.bias === "LONG") {
    summary = "Long bias is active because buyers currently have more confirmation than sellers.";
  } else if (analysis.bias === "SHORT") {
    summary = "Short bias is active because sellers currently have more confirmation than buyers.";
  } else {
    summary = "No trade is preferred because the market conditions are mixed.";
  }

  const keyReasons = reasons.slice(0, 4).join(", ");
  const keyWarnings = warnings.slice(0, 3).join(", ");

  return {
    summary,
    setupQuality: analysis.grade || "N/A",
    bias: analysis.bias || "NEUTRAL",
    confidence: analysis.confidence || "LOW",
    structure: structure.summary || "No structure summary available.",
    indicators: `VWAP: ${indicators.vwap || "N/A"}, RSI: ${indicators.rsi || "N/A"}, RVOL: ${indicators.rvol || "N/A"}`,
    reasoning: keyReasons ? `Main confirmations: ${keyReasons}.` : "No major confirmations yet.",
    riskNote: keyWarnings ? `Warnings: ${keyWarnings}.` : "No major warnings detected.",
    action:
      analysis.score >= 85
        ? "This is a high-quality setup. Wait for confirmation before entering."
        : analysis.score >= 70
        ? "This is a decent setup, but avoid chasing. Wait for a cleaner entry."
        : "This is not strong enough for an A+ trade. Be patient."
  };
}

module.exports = { generateCoach };