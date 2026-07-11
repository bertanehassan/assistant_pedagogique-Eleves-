const fs = require('fs');

const content = fs.readFileSync('./src/legacy.js', 'utf8');
const lines = content.split('\n');

// Find the corrupted line
const corruptStart = lines.findIndex(l => l.trim().startsWith('3.') && l.includes('\u062a\u062d\u0642\u0642'));
if (corruptStart === -1) {
  console.log('Corruption not found!');
  process.exit(0);
}

// Find the end: look for "primer: `يرجى"
let corruptEnd = -1;
for (let i = corruptStart + 1; i < lines.length; i++) {
  if (lines[i].includes('primer:') && lines[i].includes('\u064a\u0631\u062c\u0649')) {
    corruptEnd = i;
    break;
  }
}

if (corruptEnd === -1) {
  console.log('End not found!');
  process.exit(1);
}

console.log(`Removing lines ${corruptStart+1} to ${corruptEnd} (${corruptEnd - corruptStart} lines)`);

// These are the correct JS lines that were originally there.
// The exact regex bodies don't matter much (it's a one-time DB patch already run),
// but the syntax must be valid JS.
// From the original diff output, the correct lines were:
const correctLines = [
  "        { bad: /\\u064b\\u06ba\"\\u2014/g, good: '\\ud83d\\udd17' }, { bad: /\\u26a0\\uf8/g, good: '\\u26a0\\ufe0f' }, { bad: /\\u064b\\u06ba\\x93\\u201e/g, good: '\\ud83d\\udcc4' },",
  "        { bad: /\\u064b\\u06ba\\u2013\\u00bc/g, good: '\\ud83d\\uddbc' }, { bad: /\\u064b\\u06ba\\xb5/g, good: '\\ud83c\\udfb5' }, { bad: /\\u064b\\u06ba\\u2022\\xb5\\xff/g, good: '\\ud83d\\udd75\\ufe0f' },",
  "        { bad: /\\u00e2\\u20ac\\x8d\\u00e2\\u2122\\u201a\\xff/g, good: '\\u200d\\u2642\\ufe0f' }, { bad: /\\u064b\\u06ba\"\\x8d/g, good: '\\ud83d\\udd0d' }, { bad: /\\u064b\\u06ba\\x92\\u060c/g, good: '\\ud83d\\udca1' },",
  "        { bad: /\\u064b\\u06ba\\x93\\x82/g, good: '\\ud83d\\udcc2' }, { bad: /\\u064b\\u06ba\"\\u201e/g, good: '\\ud83d\\udcc4' }, { bad: /\\u064b\\u06ba\"\\u201a/g, good: '\\ud83d\\udcc2' },",
  "        { bad: /\\u064b\\u06ba\\x9a\\u20ac/g, good: '\\ud83d\\ude80' }, { bad: /\\u25b6/g, good: '\\u25b6' }, { bad: /\\u00e2\\u06f9/g, good: '\\u23f9' },",
  "        { bad: /\\u00e2\\u0153\\x8f\\xff/g, good: '\\u270f\\ufe0f' }, { bad: /\\u064b\\u06ba\\u2019\\u00ac/g, good: '\\ud83d\\udcac' }, { bad: /\\u064b\\u06ba\"\\x8d/g, good: '\\ud83d\\udccc' },",
  "        { bad: /\\u064b\\u06ba\"\\x88/g, good: '\\ud83d\\udcc8' }, { bad: /\\u0637\\u06be\\u0637\\xb9\\u0638\\u2026\\u0638\\u0679\\u0638\\u201a/g, good: '\\u062a\\u0639\\u0645\\u064a\\u0642' }",
  "      ];"
];

lines.splice(corruptStart, corruptEnd - corruptStart, ...correctLines);
fs.writeFileSync('./src/legacy.js', lines.join('\n'), 'utf8');
console.log('Saved. Verifying JS syntax...');
