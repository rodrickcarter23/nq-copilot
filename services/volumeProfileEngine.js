function round(value, decimals = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Number(n.toFixed(decimals));
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function detectVolumeProfile(market, analysis = {}) {
  const candles = market.candles || [];
  const price = Number(market.price || 0);
  const indicators = analysis.indicators || {};

  if (candles.length < 50 || !price) {
    return emptyProfile("Not enough candle data for volume profile analysis.");
  }

  const recent = candles.slice(-300);
  const tickSize = 0.25;
  const atr = Number(indicators.atr || averageRange(recent) || 10);

  const profile = buildProfile(recent, tickSize);

  if (!profile.length) {
    return emptyProfile("Unable to build volume profile from candles.");
  }

  const totalVolume = profile.reduce((sum, row) => sum + row.volume, 0);
  const pocRow = [...profile].sort((a, b) => b.volume - a.volume)[0];

  const valueArea = calculateValueArea(profile, pocRow.price, totalVolume, 0.7);

  const vah = valueArea.vah;
  const val = valueArea.val;
  const poc = pocRow.price;

  const aboveValue = price > vah;
  const belowValue = price < val;
  const insideValue = price >= val && price <= vah;

  const distanceToPOC = price - poc;
  const absDistanceToPOC = Math.abs(distanceToPOC);

  const hvn = findHighVolumeNode(profile, poc);
  const lvn = findLowVolumeNode(profile, price);

  let bias = "NEUTRAL";
  let score = 50;
  const reasons = [];
  const warnings = [];

  if (aboveValue) {
    bias = "BULLISH";
    score += 20;
    reasons.push("Price is trading above value area.");
  } else if (belowValue) {
    bias = "BEARISH";
    score += 20;
    reasons.push("Price is trading below value area.");
  } else {
    reasons.push("Price is trading inside value area.");
    warnings.push("Inside value often means rotation/chop.");
  }

  if (price > poc) {
    score += 10;
    reasons.push("Price is above POC.");
  } else if (price < poc) {
    score -= 5;
    warnings.push("Price is below POC.");
  }

  if (absDistanceToPOC <= atr * 1.5) {
    score += 5;
    reasons.push("Price is near POC magnet.");
  } else {
    warnings.push("Price is extended away from POC.");
  }

  const acceptance = detectAcceptance(recent, vah, val, price);
  if (acceptance.acceptedAboveValue && aboveValue) {
    score += 15;
    reasons.push("Acceptance above value area detected.");
  }

  if (acceptance.acceptedBelowValue && belowValue) {
    score += 15;
    reasons.push("Acceptance below value area detected.");
  }

  if (acceptance.rejectedValueHigh) {
    warnings.push("Rejection near value area high detected.");
  }

  if (acceptance.rejectedValueLow) {
    warnings.push("Rejection near value area low detected.");
  }

  score = clamp(Math.round(score));

  return {
    profileBias: bias,
    bias,
    volumeProfileScore: score,
    score,

    poc: round(poc),
    vah: round(vah),
    val: round(val),

    currentPosition: aboveValue
      ? "ABOVE VALUE"
      : belowValue
      ? "BELOW VALUE"
      : "INSIDE VALUE",

    aboveValue,
    belowValue,
    insideValue,

    distanceToPOC: round(distanceToPOC),
    absDistanceToPOC: round(absDistanceToPOC),

    pocMagnet: round(poc),

    hvn: round(hvn),
    lvn: round(lvn),

    acceptance: acceptance.acceptedAboveValue || acceptance.acceptedBelowValue,
    acceptedAboveValue: acceptance.acceptedAboveValue,
    acceptedBelowValue: acceptance.acceptedBelowValue,
    rejectedValueHigh: acceptance.rejectedValueHigh,
    rejectedValueLow: acceptance.rejectedValueLow,

    summary: buildSummary(bias, aboveValue, belowValue, insideValue, poc),
    reasons,
    warnings,

    checklist: [
      { name: "POC calculated", passed: poc > 0 },
      { name: "Value area calculated", passed: vah > val },
      { name: "Price above POC", passed: price > poc },
      { name: "Price outside value", passed: aboveValue || belowValue },
      { name: "Acceptance confirmed", passed: acceptance.acceptedAboveValue || acceptance.acceptedBelowValue },
      { name: "Near POC magnet", passed: absDistanceToPOC <= atr * 1.5 },
    ],
  };
}

function buildProfile(candles, tickSize) {
  const volumeByPrice = new Map();

  candles.forEach((c) => {
    const high = Number(c.high);
    const low = Number(c.low);
    const volume = Number(c.volume || 0);

    if (!Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(volume)) return;

    const start = Math.round(low / tickSize) * tickSize;
    const end = Math.round(high / tickSize) * tickSize;
    const levels = Math.max(1, Math.round((end - start) / tickSize) + 1);
    const volumePerLevel = volume / levels;

    for (let p = start; p <= end; p += tickSize) {
      const key = round(p, 2);
      volumeByPrice.set(key, (volumeByPrice.get(key) || 0) + volumePerLevel);
    }
  });

  return Array.from(volumeByPrice.entries())
    .map(([price, volume]) => ({
      price: Number(price),
      volume,
    }))
    .sort((a, b) => a.price - b.price);
}

function calculateValueArea(profile, pocPrice, totalVolume, targetPercent = 0.7) {
  const sortedPrices = profile.map((row) => row.price);
  const volumeMap = new Map(profile.map((row) => [row.price, row.volume]));

  let pocIndex = sortedPrices.findIndex((p) => p === pocPrice);
  if (pocIndex < 0) pocIndex = 0;

  let lowIndex = pocIndex;
  let highIndex = pocIndex;
  let valueVolume = volumeMap.get(pocPrice) || 0;
  const targetVolume = totalVolume * targetPercent;

  while (valueVolume < targetVolume && (lowIndex > 0 || highIndex < sortedPrices.length - 1)) {
    const nextLowVol = lowIndex > 0 ? volumeMap.get(sortedPrices[lowIndex - 1]) || 0 : -1;
    const nextHighVol = highIndex < sortedPrices.length - 1 ? volumeMap.get(sortedPrices[highIndex + 1]) || 0 : -1;

    if (nextHighVol >= nextLowVol) {
      highIndex += 1;
      valueVolume += nextHighVol;
    } else {
      lowIndex -= 1;
      valueVolume += nextLowVol;
    }
  }

  return {
    vah: sortedPrices[highIndex],
    val: sortedPrices[lowIndex],
  };
}

function findHighVolumeNode(profile, poc) {
  const candidates = profile
    .filter((row) => Math.abs(row.price - poc) > 1)
    .sort((a, b) => b.volume - a.volume);

  return candidates[0]?.price || poc;
}

function findLowVolumeNode(profile, price) {
  const nearby = profile
    .filter((row) => Math.abs(row.price - price) <= 50)
    .sort((a, b) => a.volume - b.volume);

  return nearby[0]?.price || 0;
}

function detectAcceptance(candles, vah, val, price) {
  const last10 = candles.slice(-10);

  const closesAbove = last10.filter((c) => Number(c.close) > vah).length;
  const closesBelow = last10.filter((c) => Number(c.close) < val).length;

  const acceptedAboveValue = closesAbove >= 6 && price > vah;
  const acceptedBelowValue = closesBelow >= 6 && price < val;

  const last = last10[last10.length - 1] || {};

  const rejectedValueHigh =
    Number(last.high) > vah && Number(last.close) < vah;

  const rejectedValueLow =
    Number(last.low) < val && Number(last.close) > val;

  return {
    acceptedAboveValue,
    acceptedBelowValue,
    rejectedValueHigh,
    rejectedValueLow,
  };
}

function buildSummary(bias, aboveValue, belowValue, insideValue, poc) {
  if (aboveValue) {
    return `Price is accepted above value. POC magnet sits near ${round(poc)}. Bullish continuation is favored if acceptance holds.`;
  }

  if (belowValue) {
    return `Price is below value. POC magnet sits near ${round(poc)}. Bearish continuation is favored if acceptance holds.`;
  }

  if (insideValue) {
    return `Price is inside value area near POC ${round(poc)}. Expect rotation/chop until value breaks.`;
  }

  return `${bias} volume profile context.`;
}

function averageRange(candles) {
  if (!candles.length) return 10;
  return (
    candles.reduce(
      (sum, c) => sum + Math.abs(Number(c.high) - Number(c.low)),
      0
    ) / candles.length
  );
}

function emptyProfile(summary) {
  return {
    profileBias: "NEUTRAL",
    bias: "NEUTRAL",
    volumeProfileScore: 0,
    score: 0,
    poc: 0,
    vah: 0,
    val: 0,
    currentPosition: "UNKNOWN",
    aboveValue: false,
    belowValue: false,
    insideValue: false,
    distanceToPOC: 0,
    absDistanceToPOC: 0,
    pocMagnet: 0,
    hvn: 0,
    lvn: 0,
    acceptance: false,
    acceptedAboveValue: false,
    acceptedBelowValue: false,
    rejectedValueHigh: false,
    rejectedValueLow: false,
    summary,
    reasons: [],
    warnings: [summary],
    checklist: [],
  };
}

module.exports = { detectVolumeProfile };