const fs = require('fs');
let lines = fs.readFileSync('src/legacy.js', 'utf8').split('\n');

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('if (val === \'__ALL_AGENTS__\') {') && lines[i-1].includes('const val = e.target.value;')) {
    // Insert the tool handler before __ALL_AGENTS__
    lines.splice(i, 0, 
      "      if (val === '__TOOL__correction') {",
      "        e.target.value = '';",
      "        if (typeof openCorrectionModal === 'function') openCorrectionModal();",
      "        return;",
      "      }"
    );
    break;
  }
}

fs.writeFileSync('src/legacy.js', lines.join('\n'));
console.log('✅ Handler injection complete.');
