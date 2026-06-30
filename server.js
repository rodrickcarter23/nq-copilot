require("dotenv").config();

const express = require("express");
const cors = require("cors");

const { getNQPrice } = require("./services/marketData");
const { calculateScore } = require("./services/scoringEngine");
const { sendDiscordAlert } = require("./services/alertEngine");
const { generateCoach } = require("./services/aiCoach");

const { detectSetup } = require("./services/setupEngine");
const { buildInstitutionalDecision } = require("./services/institutionalEngine");
const { buildSmartEntry } = require("./services/smartEntryEngine");
const { applyConsistencyRules } = require("./services/consistencyEngine");

const { detectOrderBlocks } = require("./services/orderBlockEngine");
const { detectTrendContinuation } = require("./services/trendContinuationEngine");
const { detectLiquidity } = require("./services/liquidityEngine");
const { detectVolumeProfile } = require("./services/volumeProfileEngine");
const { detectFVG } = require("./services/fvgEngine");
const { detectPremiumDiscount } = require("./services/premiumDiscountEngine");
const { detectMultiTimeframe } = require("./services/multiTimeframeEngine");
const { detectRiskManager } = require("./services/riskManagerEngine");
const { buildMasterDecision } = require("./services/masterDecisionEngine");
const { detectEntryTiming } = require("./services/entryTimingEngine");
const { detectExecutionPlan } = require("./services/executionEngine");
const { buildSmartAlert } = require("./services/smartAlertEngine");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("🚀 NQ Co-Pilot Server Running");
});

app.get("/api/analysis", async (req, res) => {
  try {
    const market = await getNQPrice();

    const rawAnalysis = calculateScore(market);
    const rawSetup = detectSetup(market, rawAnalysis);

    const rawInstitutional = buildInstitutionalDecision(
      market,
      rawAnalysis,
      rawSetup
    );

    const rawSmartEntry = buildSmartEntry(
      market,
      rawAnalysis,
      rawSetup,
      rawInstitutional
    );

    const cleaned = applyConsistencyRules(
      rawAnalysis,
      rawSetup,
      rawInstitutional,
      rawSmartEntry
    );

    const orderBlocks = detectOrderBlocks(market);
    const trendContinuation = detectTrendContinuation(market, cleaned.analysis);
    const liquidity = detectLiquidity(market, cleaned.analysis);
    const volumeProfile = detectVolumeProfile(market, cleaned.analysis);
    const fvg = detectFVG(market, cleaned.analysis);
    const premiumDiscount = detectPremiumDiscount(market, cleaned.analysis);
    const multiTimeframe = detectMultiTimeframe(market, cleaned.analysis);

    const riskManager = detectRiskManager(
      market,
      cleaned.analysis,
      cleaned.smartEntry
    );

    const masterDecision = buildMasterDecision({
      market,
      analysis: cleaned.analysis,
      setup: cleaned.setup,
      institutional: cleaned.institutional,
      smartEntry: cleaned.smartEntry,
      orderBlocks,
      trendContinuation,
      liquidity,
      volumeProfile,
      fvg,
      premiumDiscount,
      multiTimeframe,
      riskManager,
    });

    const entryTiming = detectEntryTiming({
      market,
      analysis: cleaned.analysis,
      smartEntry: cleaned.smartEntry,
      orderBlocks,
      fvg,
      liquidity,
      trendContinuation,
      volumeProfile,
      riskManager,
      masterDecision,
    });

    const executionPlan = detectExecutionPlan({
      market,
      analysis: cleaned.analysis,
      smartEntry: cleaned.smartEntry,
      orderBlocks,
      fvg,
      liquidity,
      volumeProfile,
      premiumDiscount,
      multiTimeframe,
      riskManager,
      masterDecision,
      entryTiming,
    });

    const smartAlert = buildSmartAlert({
      market,
      analysis: cleaned.analysis,
      masterDecision,
      executionPlan,
      entryTiming,
      riskManager,
      smartEntry: cleaned.smartEntry,
      institutional: cleaned.institutional,
      liquidity,
      fvg,
      volumeProfile,
      trendContinuation,
    });

    const coach = generateCoach(market, cleaned.analysis);

    await sendDiscordAlert(market, cleaned.analysis, smartAlert);

    res.json({
      success: true,
      market,
      analysis: cleaned.analysis,
      setup: cleaned.setup,
      institutional: cleaned.institutional,
      smartEntry: cleaned.smartEntry,
      orderBlocks,
      trendContinuation,
      liquidity,
      volumeProfile,
      fvg,
      premiumDiscount,
      multiTimeframe,
      riskManager,
      masterDecision,
      entryTiming,
      executionPlan,
      smartAlert,
      coach,
    });
  } catch (error) {
    console.error("Analysis error:", error);

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`🚀 NQ Co-Pilot running on port ${PORT}`);
});