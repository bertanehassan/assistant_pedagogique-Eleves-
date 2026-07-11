const fs = require('fs');
let c = fs.readFileSync('src/legacy.js', 'utf8');

const targetPoint = `  // Générer la fiche (générique)
  if ($('#corr-generate-btn')) $('#corr-generate-btn').onclick = generateCorrectionSheet;`;

const newCode = `  // Import du cadre de référence
  if ($('#corr-ref-upload')) {
    $('#corr-ref-upload').onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const badge = $('#corr-ref-badge');
      const compEl = $('#corr-competences');

      if (badge) {
        badge.style.display = 'inline-block';
        badge.textContent = '⏳ Lecture...';
      }

      try {
        if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
          const result = await extractTextFromPdf(file);
          if (compEl) compEl.value = result.text;
        } else {
          const text = await file.text();
          if (compEl) compEl.value = text;
        }
        if (badge) {
          badge.style.background = 'rgba(0,255,157,0.15)';
          badge.style.borderColor = 'rgba(0,255,157,0.4)';
          badge.style.color = 'var(--neon)';
          badge.textContent = \`✅ Chargé (\${file.name})\`;
        }
        toast('✅ Cadre de référence importé.', 'success');
      } catch (err) {
        console.error(err);
        toast("Erreur lors de la lecture du cadre de référence", "error");
        if (badge) {
          badge.style.background = 'rgba(255,100,100,0.15)';
          badge.style.borderColor = 'rgba(255,100,100,0.4)';
          badge.style.color = '#ff6464';
          badge.textContent = \`❌ Erreur\`;
        }
      }
      e.target.value = ''; // Reset input
    };
  }

`;

if (c.includes(targetPoint)) {
    c = c.replace(targetPoint, newCode + targetPoint);
    fs.writeFileSync('src/legacy.js', c);
    console.log("Ref upload handler injected!");
} else {
    console.error("Target point not found.");
}
