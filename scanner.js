require("dotenv").config();

const { getNQPrice } = require("./services/marketData");
const { calculateScore } = require("./services/scoringEngine");
const { sendDiscordAlert } = require("./services/alertEngine");

let lastAlertKey = "";
let lastAlertTime = 0;

const SCAN_EVERY_MS = 30000;
const COOLDOWN_MS = 5 * 60 * 1000;

async function scanMarket() {
  try {
    const market = await getNQPrice();
    const analysis = calculateScore(market);

    const price = market.price;
    const direction = analysis.bias || analysis.direction || "NEUTRAL";
    const score = Number(analysis.score || analysis.marketScore || 0);
    const grade = analysis.grade || "N/A";

    console.log(
      `Scanner: ${market.symbol} | ${price} | ${direction} | ${score}/100 | ${grade}`
    );

    const isTradeSetup =
      score >= 80 &&
      (String(direction).includes("LONG") ||
        String(direction).includes("SHORT"));

    if (!isTradeSetup) return;

    const alertKey = `${direction}-${grade}-${Math.round(price)}`;
    const now = Date.now();

    if (alertKey === lastAlertKey && now - lastAlertTime < COOLDOWN_MS) {
      return;
    }

    lastAlertKey = alertKey;
    lastAlertTime = now;

    await sendDiscordAlert({
      title: `🚨 NQ ${direction} Setup`,
      message:
        "High-quality setup detected. Confirm on NinjaTrader/Tradovate before entering.",
      direction,
      price,
      score,
      grade,
    });

    console.log("✅ Discord alert sent");
  } catch (error) {
    console.log("Scanner error:", error.message);
  }
}

console.log("🔎 NQ Co-Pilot scanner running...");
scanMarket();
setInterval(scanMarket, SCAN_EVERY_MS);