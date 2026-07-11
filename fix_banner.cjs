const fs = require('fs');
let content = fs.readFileSync('./src/legacy.js', 'utf8');

const oldBanner = `      <div class="welcome-banner" style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; text-align:center; opacity:0.9; padding:20px;">
        <h2 style="font-size:32px; font-weight:bold; color:var(--cyan); margin-bottom:16px;">Mon Assistant IA</h2>
        <p style="max-width:500px; color:var(--on-surface-variant); margin-bottom:32px; font-size:16px; line-height:1.6;">\${t('ui_welcome') || 'Interface avancée avec mémoire globale, agents spécialisés et accès aux modèles Mistral AI.'}</p>
        <button onclick="if(window.openQuizzesPanel) window.openQuizzesPanel(); else if(document.getElementById('quizzes-btn')) document.getElementById('quizzes-btn').click();" style="display:flex; align-items:center; gap:8px; padding:12px 24px; border-radius:12px; border:1px solid rgba(212,175,55,0.4); background:rgba(212,175,55,0.1); color:#d4af37; font-weight:600; cursor:pointer; transition:all 0.2s;" onmouseover="this.style.background='rgba(212,175,55,0.2)'" onmouseout="this.style.background='rgba(212,175,55,0.1)'">
          <span class="material-symbols-outlined" style="font-size:22px;">quiz</span>
          Relire les quiz sauvegardés
        </button>
      </div>`;

const newBanner = `      <div class="welcome-banner" style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; text-align:center; opacity:0.9; padding:20px;">
        <h2 style="font-size:32px; font-weight:bold; color:var(--cyan); margin-bottom:8px;">Mon Assistant IA</h2>
        <div style="color:#d4af37; font-size:14px; font-weight:600; margin-bottom:24px; letter-spacing:1px; text-transform:uppercase;">D&eacute;velopp&eacute; par Hassan Bertane</div>
        <p style="max-width:500px; color:var(--on-surface-variant); font-size:16px; line-height:1.6;">\${t('ui_welcome') || 'Interface avancée avec mémoire globale, agents spécialisés et accès aux modèles Mistral AI.'}</p>
      </div>`;

// Fallback search in case of whitespace differences
const startIdx = content.indexOf('<div class="welcome-banner"');
const endIdx = content.indexOf('</div>', content.indexOf('Relire les quiz sauvegardés')) + 6; // finds the end div of welcome banner

if (startIdx !== -1 && endIdx !== -1) {
    const extracted = content.substring(startIdx, endIdx);
    content = content.replace(extracted, newBanner.trim());
    fs.writeFileSync('./src/legacy.js', content, 'utf8');
    console.log("Success");
} else {
    console.log("Could not find banner limits");
}
