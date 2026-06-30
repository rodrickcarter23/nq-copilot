const fetch = global.fetch;

let lastAlertKey = null;
let lastAlertTime = 0;

async function sendDiscordAlert(
  market = {},
  analysis = {},
  smartAlert = null
) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;

  // No webhook configured
  if (!webhookUrl) {
    return;
  }

  // Smart alerts not provided yet
  if (!smartAlert) {
    return;
  }

  // Don't send alerts unless the Smart Alert engine approves
  if (!smartAlert.shouldAlert) {
    return;
  }

  const cooldown = 5 * 60 * 1000; // 5 minutes

  const alertKey =
    `${smartAlert.alertType}-` +
    `${smartAlert.direction}-` +
    `${smartAlert.entry}-` +
    `${smartAlert.stop}`;

  const now = Date.now();

  if (
    alertKey === lastAlertKey &&
    now - lastAlertTime < cooldown
  ) {
    console.log("⏳ Duplicate alert skipped.");
    return;
  }

  lastAlertKey = alertKey;
  lastAlertTime = now;

  const message = {
    username: "🚀 NQ Co-Pilot",
    content: `
# 🚨 ${smartAlert.title}

**Direction**
${smartAlert.direction}

**Grade**
${smartAlert.grade}

**Urgency**
${smartAlert.urgency}

**Alert Score**
${smartAlert.alertScore}/100

---

### Trade

**Current Price**
${smartAlert.price}

**Entry**
${smartAlert.entry}

**Stop**
${smartAlert.stop}

**Target 1**
${smartAlert.target1}

**Target 2**
${smartAlert.target2}

**Risk Reward**
${smartAlert.riskReward}

---

**Execution Status**
${smartAlert.executionStatus}

**Master Decision**
${smartAlert.masterAction}

---

${smartAlert.summary}
`,
  };

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      console.error("Discord webhook failed:", response.status);
      return;
    }

    console.log("✅ Smart Alert sent to Discord");
  } catch (err) {
    console.error("❌ Discord Error:", err.message);
  }
}

module.exports = {
  sendDiscordAlert,
};