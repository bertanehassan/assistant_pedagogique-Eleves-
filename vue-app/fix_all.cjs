const fs = require('fs');
const path = require('path');

const replacements = [
  { bad: /أ©/g, good: 'é' },
  { bad: /أ¨/g, good: 'è' },
  { bad: /أ®/g, good: 'î' },
  { bad: /أھ/g, good: 'ê' },
  { bad: /أ§/g, good: 'ç' },
  { bad: /أ´/g, good: 'ô' },
  { bad: /أ»/g, good: 'û' },
  { bad: /أ¹/g, good: 'ù' },
  { bad: /أ‰/g, good: 'É' },
  { bad: new RegExp('أ\u00A0', 'g'), good: 'à' },
  { bad: /â€™/g, good: "'" },
  { bad: /إ“/g, good: 'œ' },
  { bad: /â€”/g, good: '—' },
  { bad: /â€¦/g, good: '…' },
  { bad: /âœ…/g, good: '✅' },
  { bad: new RegExp('ًں§\u00A0', 'g'), good: '🧠' },
  { bad: /ًں”—/g, good: '🔗' },
  { bad: /âڑ ï¸/g, good: '⚠️' },
  { bad: /ًں\x93„/g, good: '📄' },
  { bad: /ًں–¼/g, good: '🖼' },
  { bad: /ًںژµ/g, good: '🎵' },
  { bad: /ًں•µï¸/g, good: '🕵️' },
  { bad: /â€\x8Dâ™‚ï¸/g, good: '‍♂️' },
  { bad: /ًں”\x8D/g, good: '🔍' },
  { bad: /ًں\x92،/g, good: '💡' },
  { bad: /ًں\x93\x82/g, good: '📂' },
  { bad: /ًں“„/g, good: '📄' },
  { bad: /ًں“‚/g, good: '📂' },
  { bad: /ًں\x9A€/g, good: '🚀' },
  { bad: /â–¶/g, good: '▶' },
  { bad: /âڈ¹/g, good: '⏹' },
  { bad: /âœ\x8Fï¸/g, good: '✏️' },
  { bad: /ًں’¬/g, good: '💬' },
  { bad: /ًں“\x8D/g, good: '📌' },
  { bad: /ًں“\x88/g, good: '📈' },
  { bad: /ًں“\x82/g, good: '📂' }
];

function fixFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let original = content;
  for (const r of replacements) {
    content = content.replace(r.bad, r.good);
  }
  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Fixed ${filePath}`);
  }
}

function scanDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      scanDir(fullPath);
    } else if (file.endsWith('.js') || file.endsWith('.vue') || file.endsWith('.html')) {
      fixFile(fullPath);
    }
  }
}

scanDir('src');
if (fs.existsSync('index.html')) {
  fixFile('index.html');
}
