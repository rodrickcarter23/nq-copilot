function applyConsistencyRules(analysis, setup, institutional, smartEntry) {
  const structure = analysis.structure || {};
  const warnings = [];

  const finalAnalysis = { ...analysis };
  const finalSetup = { ...setup };
  const finalInstitutional = { ...institutional };
  const finalSmartEntry = { ...smartEntry };

  const bias = finalAnalysis.bias;
  const structureBias = structure.structureBias;

  const conflict =
    (bias === "LONG" && structureBias === "SHORT") ||
    (bias === "SHORT" && structureBias === "LONG");

  if (conflict) {
    warnings.push(
      `Signal conflict: ${bias} bias but market structure is ${structureBias}.`
    );

    finalAnalysis.score = Math.min(finalAnalysis.score || 0, 65);
    finalAnalysis.grade = "B";
    finalAnalysis.confidence = "MEDIUM";
    finalAnalysis.signal = `${bias} WATCH ONLY - STRUCTURE CONFLICT`;

    finalInstitutional.institutionalScore = Math.min(
      finalInstitutional.institutionalScore || 0,
      60
    );
    finalInstitutional.institutionalGrade = "B";
    finalInstitutional.confidence = "MEDIUM";
    finalInstitutional.decision = "WATCH ONLY - STRUCTURE CONFLICT";
    finalInstitutional.summary =
      "Bias and market structure do not agree. Wait for structure confirmation before entering.";

    finalSetup.quality = "C";
    finalSetup.score = Math.min(finalSetup.score || 0, 55);
    finalSetup.warnings = [
      ...(finalSetup.warnings || []),
      "Setup downgraded because market structure conflicts with the main bias.",
    ];

    finalSmartEntry.action = "WAIT";
    finalSmartEntry.confirmation =
      "Do not enter until market structure confirms the same direction as the bias.";
    finalSmartEntry.notes = [
      ...(finalSmartEntry.notes || []),
      "Structure conflict detected. Avoid forcing this trade.",
    ];
  }

  finalAnalysis.warnings = [...(finalAnalysis.warnings || []), ...warnings];
  finalInstitutional.warnings = [
    ...(finalInstitutional.warnings || []),
    ...warnings,
  ];

  return {
    analysis: finalAnalysis,
    setup: finalSetup,
    institutional: finalInstitutional,
    smartEntry: finalSmartEntry,
  };
}

module.exports = { applyConsistencyRules };