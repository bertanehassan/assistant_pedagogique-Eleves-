const fs = require('fs');
let c = fs.readFileSync('src/legacy.js', 'utf8');

const ONCHANGE_ANCHOR = `      const val = e.target.value;
      if (val === '__ALL_AGENTS__') {`;

const ONCHANGE_NEW = `      const val = e.target.value;
      // ── Outil : Fiche de Correction ──
      if (val === '__TOOL__correction') {
        e.target.value = '';  // reset le select
        if (typeof openCorrectionModal === 'function') openCorrectionModal();
        return;
      }
      if (val === '__ALL_AGENTS__') {`;

if (c.includes(ONCHANGE_NEW)) {
  console.log('Handler correction déjà présent.');
} else if (c.includes(ONCHANGE_ANCHOR)) {
  c = c.replace(ONCHANGE_ANCHOR, ONCHANGE_NEW);
  console.log('✅ Handler correction ajouté dans onchange.');
} else {
  console.error('❌ Ancre ONCHANGE_ANCHOR non trouvée.');
  process.exit(1);
}

fs.writeFileSync('src/legacy.js', c);
console.log('Done');
