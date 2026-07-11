const fs = require('fs');

// Read the original utf8 backup
const orig = fs.readFileSync('./src/legacy.js.utf8', 'utf8');
const origLines = orig.split('\n');

// Find the bads array in original — look for the line with 🧠 emoji or the ًں§ pattern
const startIdx = origLines.findIndex(l => l.includes('\u064b\u06ba\u00a7') || l.includes('\ud83e\udde0'));
if (startIdx < 0) {
  console.log('Could not find the bads array start in utf8 backup');
  // Try alternative search
  const alt = origLines.findIndex(l => l.includes("good: '\ud83e\udde0'"));
  console.log('Alt search result:', alt);
  if (alt >= 0) {
    for (let i = alt - 1; i < alt + 12; i++) {
      console.log(i + 1, origLines[i]);
    }
  }
  process.exit(1);
}

console.log('Found at line', startIdx + 1);
// Print the lines from startIdx to the closing ]; 
for (let i = startIdx; i < Math.min(startIdx + 15, origLines.length); i++) {
  console.log(`${i+1}: ${origLines[i]}`);
  if (origLines[i].trim() === '];') {
    console.log('--- end of array ---');
    break;
  }
}
