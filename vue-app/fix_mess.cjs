const fs = require('fs');
let patch = fs.readFileSync('diff_utf8.patch', 'utf8');
let legacy = fs.readFileSync('src/legacy.js', 'utf8');

const lines = patch.split('\n');
let deletedLines = [];
let addedLines = [];
let inMistakeChunk = false;

for (let i = 0; i < lines.length; i++) {
  if (lines[i].startsWith('@@ -8342,31 +8342,226 @@')) {
    inMistakeChunk = true;
    continue;
  }
  if (inMistakeChunk && lines[i].startsWith('@@ ')) {
    inMistakeChunk = false;
  }
  
  if (inMistakeChunk) {
    if (lines[i].startsWith('-') && !lines[i].startsWith('---')) {
      deletedLines.push(lines[i].substring(1).replace(/\r$/, ''));
    } else if (lines[i].startsWith('+') && !lines[i].startsWith('+++')) {
      addedLines.push(lines[i].substring(1).replace(/\r$/, ''));
    }
  }
}

// Ensure the addedLines matches what we want to replace
const stringToReplace = addedLines.join('\n');
const replacementString = deletedLines.join('\n');

// Try finding boundaries in legacy.js
const startStr = addedLines[0];
const endStr = addedLines[addedLines.length - 1];
const startIdx = legacy.indexOf(startStr);
const endIdx = legacy.indexOf(endStr) + endStr.length;

if (startIdx !== -1 && endIdx !== -1) {
    legacy = legacy.substring(0, startIdx) + replacementString + legacy.substring(endIdx);
    fs.writeFileSync('src/legacy.js', legacy);
    console.log('Fixed legacy.js via boundaries!');
} else {
    console.log('Could not find boundaries.');
    console.log('Looking for start:', startStr);
    console.log('Looking for end:', endStr);
}
