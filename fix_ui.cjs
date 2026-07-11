const fs = require('fs');

// --- 1. Modify legacy.js ---
let legacy = fs.readFileSync('./src/legacy.js', 'utf8');

// Change 1: openQuizzesPanel -> window.openQuizzesPanel
legacy = legacy.replace(
  'const openQuizzesPanel = () => {',
  'window.openQuizzesPanel = () => {'
);
// Also update the call on line 6920
legacy = legacy.replace(
  '      openQuizzesPanel();',
  '      if(window.openQuizzesPanel) window.openQuizzesPanel();'
);

// Change 2: Remove emoji and update button in welcome banner
const oldBanner = `      <div class="welcome-banner" style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; text-align:center; opacity:0.9; padding:20px;">
        <div style="font-size:56px; margin-bottom:16px; animation: float 3s ease-in-out infinite;">🤖</div>
        <h2 style="font-size:32px; font-weight:bold; color:var(--cyan); margin-bottom:16px;">Mon Assistant IA</h2>
        <p style="max-width:500px; color:var(--on-surface-variant); margin-bottom:32px; font-size:16px; line-height:1.6;">\${t('ui_welcome') || 'Interface avancée avec mémoire globale, agents spécialisés et accès aux modèles Mistral AI.'}</p>
        <button onclick="document.getElementById('quizzes-btn') && document.getElementById('quizzes-btn').click()" style="display:flex; align-items:center; gap:8px; padding:12px 24px; border-radius:12px; border:1px solid rgba(212,175,55,0.4); background:rgba(212,175,55,0.1); color:#d4af37; font-weight:600; cursor:pointer; transition:all 0.2s;" onmouseover="this.style.background='rgba(212,175,55,0.2)'" onmouseout="this.style.background='rgba(212,175,55,0.1)'">
          <span class="material-symbols-outlined" style="font-size:22px;">quiz</span>
          Relire les quiz sauvegardés
        </button>
      </div>`;

const newBanner = `      <div class="welcome-banner" style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; text-align:center; opacity:0.9; padding:20px;">
        <h2 style="font-size:32px; font-weight:bold; color:var(--cyan); margin-bottom:16px;">Mon Assistant IA</h2>
        <p style="max-width:500px; color:var(--on-surface-variant); margin-bottom:32px; font-size:16px; line-height:1.6;">\${t('ui_welcome') || 'Interface avancée avec mémoire globale, agents spécialisés et accès aux modèles Mistral AI.'}</p>
        <button onclick="if(window.openQuizzesPanel) window.openQuizzesPanel(); else if(document.getElementById('quizzes-btn')) document.getElementById('quizzes-btn').click();" style="display:flex; align-items:center; gap:8px; padding:12px 24px; border-radius:12px; border:1px solid rgba(212,175,55,0.4); background:rgba(212,175,55,0.1); color:#d4af37; font-weight:600; cursor:pointer; transition:all 0.2s;" onmouseover="this.style.background='rgba(212,175,55,0.2)'" onmouseout="this.style.background='rgba(212,175,55,0.1)'">
          <span class="material-symbols-outlined" style="font-size:22px;">quiz</span>
          Relire les quiz sauvegardés
        </button>
      </div>`;

if(legacy.includes('animation: float 3s ease-in-out infinite;">🤖</div>')) {
  // Try exact replace
  legacy = legacy.replace(oldBanner, newBanner);
  // Fallback if formatting differs
  legacy = legacy.replace('<div style="font-size:56px; margin-bottom:16px; animation: float 3s ease-in-out infinite;">🤖</div>', '');
  legacy = legacy.replace(
    'onclick="document.getElementById(\'quizzes-btn\') && document.getElementById(\'quizzes-btn\').click()"',
    'onclick="if(window.openQuizzesPanel) window.openQuizzesPanel(); else if(document.getElementById(\'quizzes-btn\')) document.getElementById(\'quizzes-btn\').click();"'
  );
}
fs.writeFileSync('./src/legacy.js', legacy, 'utf8');

// --- 2. Modify AppHeader.vue ---
let appHeader = fs.readFileSync('./src/components/AppHeader.vue', 'utf8');

const oldBtn = `<button id="quizzes-btn" class="topbar-btn" title="Mes Quiz Sauvegardés" style="color: #d4af37; border-color: rgba(212,175,55,0.4);">`;
const newBtn = `<button id="quizzes-btn" @click="() => window.openQuizzesPanel && window.openQuizzesPanel()" class="topbar-btn" title="Mes Quiz Sauvegardés" style="color: #d4af37; border-color: rgba(212,175,55,0.4);">`;

appHeader = appHeader.replace(oldBtn, newBtn);
fs.writeFileSync('./src/components/AppHeader.vue', appHeader, 'utf8');

console.log('✓ UI fixed');
