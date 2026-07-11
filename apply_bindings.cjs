const fs = require('fs');
let c = fs.readFileSync('src/legacy.js', 'utf8');

const targetStr = `  // ── Wiring des boutons ─────────────────────────────────────────────────
  if ($('#open-correction-modal'))         $('#open-correction-modal').onclick = openCorrectionModal;
  if ($('#close-correction-modal'))        $('#close-correction-modal').onclick = closeCorrectionModal;
  if ($('#close-correction-modal-step1'))  $('#close-correction-modal-step1').onclick = closeCorrectionModal;
  if ($('#correction-modal'))              $('#correction-modal').onclick = e => { if (e.target === $('#correction-modal')) closeCorrectionModal(); };

  // Step 1 → 2
  if ($('#corr-next-1')) $('#corr-next-1').onclick = () => {
    if (!corrValidateStep1()) return;
    corrFillCompetences();
    corrShowStep(2);
  };
  // Step 2 → 3
  if ($('#corr-next-2')) $('#corr-next-2').onclick = () => {
    if (!corrValidateStep2()) return;
    corrShowStep(3);
  };
  // Step 3 → 4
  if ($('#corr-next-3')) $('#corr-next-3').onclick = () => {
    corrBuildSummary();
    corrShowStep(4);
  };
  // Back buttons
  if ($('#corr-back-2')) $('#corr-back-2').onclick = () => corrShowStep(1);
  if ($('#corr-back-3')) $('#corr-back-3').onclick = () => corrShowStep(2);
  if ($('#corr-back-4')) $('#corr-back-4').onclick = () => corrShowStep(3);`;

const replacement = `  // ── Wiring des boutons (via Event Delegation pour fiabilité) ─────────
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (t.closest('#open-correction-modal')) openCorrectionModal();
    else if (t.closest('#close-correction-modal') || t.closest('#close-correction-modal-step1')) closeCorrectionModal();
    else if (t.id === 'correction-modal') closeCorrectionModal();
    
    else if (t.closest('#corr-next-1')) {
      if (!corrValidateStep1()) return;
      corrFillCompetences();
      corrShowStep(2);
    }
    else if (t.closest('#corr-next-2')) {
      if (!corrValidateStep2()) return;
      corrShowStep(3);
    }
    else if (t.closest('#corr-next-3')) {
      corrBuildSummary();
      corrShowStep(4);
    }
    else if (t.closest('#corr-back-2')) corrShowStep(1);
    else if (t.closest('#corr-back-3')) corrShowStep(2);
    else if (t.closest('#corr-back-4')) corrShowStep(3);
  });`;

if (c.includes(targetStr)) {
    c = c.replace(targetStr, replacement);
    fs.writeFileSync('src/legacy.js', c);
    console.log("Bindings replaced!");
} else {
    console.log("Could not find the target string. Using fallback indexing.");
    const fallbackStartStr = "  // ── Wiring des boutons ─────────────────────────────────────────────────";
    const fallbackEndStr = "  if ($('#corr-back-4')) $('#corr-back-4').onclick = () => corrShowStep(3);";
    const startIdx = c.indexOf(fallbackStartStr);
    const endIdx = c.indexOf(fallbackEndStr);
    
    if (startIdx !== -1 && endIdx !== -1) {
        c = c.substring(0, startIdx) + replacement + c.substring(endIdx + fallbackEndStr.length);
        fs.writeFileSync('src/legacy.js', c);
        console.log("Bindings replaced using fallback indexing.");
    } else {
        console.error("Could not find fallback boundaries either.");
    }
}
