function shouldSendDiscordAlert({ smartAlert, masterDecision, executionPlan, market }) {
  const signal = String(
    smartAlert?.title ||
      smartAlert?.alertType ||
      masterDecision?.action ||
      executionPlan?.executionStatus ||
      ""
  ).toUpperCase();

  const direction = String(
    smartAlert?.direction ||
      masterDecision?.direction ||
      executionPlan?.direction ||
      ""
  ).toUpperCase();

  const grade = String(
    smartAlert?.grade ||
      masterDecision?.grade ||
      ""
  ).toUpperCase();

  const action = String(masterDecision?.action || "").toUpperCase();
  const executionStatus = String(executionPlan?.status || executionPlan?.executionStatus || "").toUpperCase();

  const isLongOrShort =
    direction.includes("LONG") || direction.includes("SHORT");

  const isWatchAlert =
    signal.includes("WATCH") ||
    action.includes("WATCH") ||
    executionStatus.includes("WATCH");

  const isEntryAlert =
    signal.includes("ENTER") ||
    signal.includes("TAKE TRADE") ||
    action.includes("TAKE TRADE") ||
    executionStatus.includes("ENTER NOW");

  const isStrongGrade =
    grade.includes("A+") ||
    grade === "A" ||
    grade === "B+";

  const shouldAlert =
    smartAlert?.shouldAlert === true ||
    isWatchAlert ||
    isEntryAlert ||
    isStrongGrade;

  if (!isLongOrShort) return false;
  if (!shouldAlert) return false;

  const key = `${direction}-${action}-${executionStatus}-${grade}-${Math.round(Number(market?.price || 0))}`;
  const now = Date.now();

  const WATCH_COOLDOWN_MS = 2 * 60 * 1000;
  const ENTRY_COOLDOWN_MS = 5 * 60 * 1000;

  const cooldown = isEntryAlert ? ENTRY_COOLDOWN_MS : WATCH_COOLDOWN_MS;

  if (key === lastDiscordAlertKey && now - lastDiscordAlertTime < cooldown) {
    return false;
  }

  lastDiscordAlertKey = key;
  lastDiscordAlertTime = now;

  return true;
}