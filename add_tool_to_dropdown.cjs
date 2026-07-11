/**
 * Ajoute l'outil "Fiche de Correction" dans la liste déroulante des agents
 */
const fs = require('fs');
const LEGACY = 'src/legacy.js';
let c = fs.readFileSync(LEGACY, 'utf8');

// ── PATCH 1 : Ajouter l'optgroup "OUTILS" après les workflows dans renderAgents ──
const AFTER_WORKFLOWS = `    sel.appendChild(wfGroup);
    }`;

const AFTER_WORKFLOWS_NEW = `    sel.appendChild(wfGroup);
    }

    // ── Outils pédagogiques ──
    const toolsGroup = document.createElement('optgroup');
    toolsGroup.label = '🛠 OUTILS PÉDAGOGIQUES';
    const corrOpt = document.createElement('option');
    corrOpt.value = '__TOOL__correction';
    corrOpt.textContent = '📋 Générateur de Fiche de Correction';
    corrOpt.title = 'Générer une fiche de correction pour toutes les disciplines';
    toolsGroup.appendChild(corrOpt);
    sel.appendChild(toolsGroup);`;

if (c.includes(AFTER_WORKFLOWS_NEW)) {
  console.log('Optgroup outils déjà présent.');
} else if (c.includes(AFTER_WORKFLOWS)) {
  c = c.replace(AFTER_WORKFLOWS, AFTER_WORKFLOWS_NEW);
  console.log('✅ Optgroup outils ajouté.');
} else {
  console.error('❌ Ancre AFTER_WORKFLOWS non trouvée.');
  process.exit(1);
}

// ── PATCH 2 : Gérer la sélection de __TOOL__correction dans onchange ──
const ONCHANGE_ANCHOR = `      const val = e.target.value;
      if (val === '__ALL_AGENTS__') {`;

const ONCHANGE_NEW = `      const val = e.target.value;
      // ── Outil : Fiche de Correction ──
      if (val === '__TOOL__correction') {
        e.target.value = '';  // reset le select
        openCorrectionModal();
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

fs.writeFileSync(LEGACY, c);

// Vérification syntaxique
const { execSync } = require('child_process');
try {
  execSync(`node --check ${LEGACY}`, { stdio: 'pipe' });
  console.log('✅ Syntaxe vérifiée.');
} catch(e) {
  console.error('❌ Erreur syntaxe:\n', e.stderr?.toString());
  process.exit(1);
}
