const fs = require('fs');
const path = require('path');

const replacements = {
  'â†’': '→',
  'â†گ': '←',
  'â†؛': '↺',
  'â–¸': '▸',
  'âœ¦': '✦',
  'âڑ™': '⚙',
  'â¬‡': '⬇',
  'â¬†': '⬆',
  'âœ•': '✕',
  'âœ“': '✓',
  'âڑ ': '⚠',
  'ًں”‘': '🔑',
  'ًںژ¯': '🎯',
  'ًںڑ€': '🚀',
  'ًں¤–': '🤖',
  'â–¶': '▶',
  'Quiz-Gen-Maroc': 'Mon Assistant IA',
  '.Quiz-Gen-Maroc.json': '.mon-assistant-ia.json'
};

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
  });
}

const dir = path.join(__dirname, 'src');

walkDir(dir, function(filePath) {
  if (filePath.endsWith('.vue') || filePath.endsWith('.js') || filePath.endsWith('.css') || filePath.endsWith('.html')) {
    let content = fs.readFileSync(filePath, 'utf8');
    let changed = false;
    for (const [bad, good] of Object.entries(replacements)) {
      if (content.includes(bad)) {
        content = content.split(bad).join(good);
        changed = true;
      }
    }
    if (changed) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`Updated: ${filePath}`);
    }
  }
});

// Also check index.html in the root
const indexPath = path.join(__dirname, 'index.html');
if (fs.existsSync(indexPath)) {
    let content = fs.readFileSync(indexPath, 'utf8');
    let changed = false;
    for (const [bad, good] of Object.entries(replacements)) {
      if (content.includes(bad)) {
        content = content.split(bad).join(good);
        changed = true;
      }
    }
    if (changed) {
      fs.writeFileSync(indexPath, content, 'utf8');
      console.log(`Updated: ${indexPath}`);
    }
}
