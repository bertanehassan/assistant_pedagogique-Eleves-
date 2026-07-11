const fs = require('fs');
let c = fs.readFileSync('src/legacy.js', 'utf8');

// ─────────────────────────────────────────────────────────
// ÉTAPE 1 : Trouver et supprimer TOUT le bloc corrompu
// entre la fin de geminiPayload {...}; et "// Scroll to bottom"
// ─────────────────────────────────────────────────────────

// Marqueur de début de la corruption (juste après la fin de geminiPayload)
const GOOD_END_OF_PAYLOAD = `        generationConfig: {\n          temperature: 0.35,\n          maxOutputTokens: 8192,\n          topP: 0.95\n        }\n      };\n`;

// Marqueur de fin de corruption
const AFTER_CORRUPTION = `\n      const geminiUrl = \`/api/gemini/v1beta/models/\${GEMINI_MODEL}:generateContent?key=\${cleanGeminiKey}\`;\n`;

const idxStart = c.indexOf(GOOD_END_OF_PAYLOAD);
if (idxStart === -1) {
  console.error('Cannot find GOOD_END_OF_PAYLOAD');
  process.exit(1);
}
const afterPayload = idxStart + GOOD_END_OF_PAYLOAD.length;

// Find the LAST occurrence of AFTER_CORRUPTION after the corruption start
const idxEnd = c.indexOf(AFTER_CORRUPTION, afterPayload);
if (idxEnd === -1) {
  console.error('Cannot find AFTER_CORRUPTION');
  process.exit(1);
}

console.log(`Found corruption block: chars ${afterPayload} to ${idxEnd} (${idxEnd - afterPayload} chars removed)`);

// Remove the corruption, keep the good geminiUrl line
c = c.substring(0, afterPayload) + AFTER_CORRUPTION + c.substring(idxEnd + AFTER_CORRUPTION.length);

// ─────────────────────────────────────────────────────────
// ÉTAPE 2 : Vérifier qu'il y a exactement 1 generateCorrectionSheet
// ─────────────────────────────────────────────────────────
const countFn = (c.match(/const generateCorrectionSheet/g) || []).length;
console.log(`generateCorrectionSheet occurrences: ${countFn}`);

// ─────────────────────────────────────────────────────────
// ÉTAPE 3 : Injecter window.* après closeCorrectionModal (une seule fois)
// ─────────────────────────────────────────────────────────
const CLOSE_MODAL_DEF = `  const closeCorrectionModal = () => $('#correction-modal').classList.remove('active');\n`;
const WINDOW_BLOCK = `  const closeCorrectionModal = () => $('#correction-modal').classList.remove('active');

  // ── Exposition sur window pour CorrectionModal.vue (@click Vue) ───────
  window.corrShowStep            = corrShowStep;
  window.corrValidateStep1       = corrValidateStep1;
  window.corrValidateStep2       = corrValidateStep2;
  window.corrFillCompetences     = corrFillCompetences;
  window.corrBuildSummary        = corrBuildSummary;
  window.openCorrectionModal     = openCorrectionModal;
  window.closeCorrectionModal    = closeCorrectionModal;
  window.generateCorrectionSheet = generateCorrectionSheet;
`;

if (c.includes(WINDOW_BLOCK)) {
  console.log('window.* block already present, skipping');
} else if (c.includes(CLOSE_MODAL_DEF)) {
  c = c.replace(CLOSE_MODAL_DEF, WINDOW_BLOCK);
  console.log('Injected window.* block');
} else {
  console.error('Cannot find CLOSE_MODAL_DEF for window injection');
  process.exit(1);
}

// ─────────────────────────────────────────────────────────
// ÉTAPE 4 : Supprimer les doublons de window.* s'il y en a
// ─────────────────────────────────────────────────────────
const windowPattern = /\/\/ ── Exposition sur window pour CorrectionModal\.vue \(@click Vue\)[^]*?window\.generateCorrectionSheet = generateCorrectionSheet;\n/g;
const windowMatches = c.match(windowPattern) || [];
console.log(`window.* block occurrences: ${windowMatches.length}`);
if (windowMatches.length > 1) {
  // Keep only the first occurrence
  let firstFound = false;
  c = c.replace(windowPattern, (match) => {
    if (!firstFound) { firstFound = true; return match; }
    return '';
  });
  console.log('Removed duplicate window.* blocks');
}

// ─────────────────────────────────────────────────────────
// ÉTAPE 5 : Sauvegarder
// ─────────────────────────────────────────────────────────
fs.writeFileSync('src/legacy.js', c);
console.log('Done! File saved.');
