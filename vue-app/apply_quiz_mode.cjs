const fs = require('fs');

let content = fs.readFileSync('./src/legacy.js', 'utf8');
// Normalize to LF for easier matching, we'll write back as-is
const useCRLF = content.includes('\r\n');
if (useCRLF) {
  console.log('File uses CRLF — normalizing for processing');
  content = content.replace(/\r\n/g, '\n');
}

// ═══════════════════════════════════════════════════════════════════
// 1. Injecter la fonction askQuizMode juste avant "let wqState = {"
// ═══════════════════════════════════════════════════════════════════
const askQuizModeCode = `
/**
 * Affiche un modal élégant pour choisir le mode de quiz.
 * @param {Function} callback - appelé avec 'evaluation' ou 'revision'
 */
function askQuizMode(callback) {
  const existing = document.getElementById('quiz-mode-dialog');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'quiz-mode-dialog';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.65);backdrop-filter:blur(6px);animation:fadeIn .2s ease;';

  overlay.innerHTML = \`
    <div style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);border:1px solid rgba(255,255,255,0.12);border-radius:20px;padding:36px 40px;max-width:420px;width:90%;box-shadow:0 24px 60px rgba(0,0,0,0.6);text-align:center;animation:slideUp .25s ease;">
      <div style="font-size:48px;margin-bottom:12px;">&#127919;</div>
      <h2 style="color:#fff;font-size:22px;font-weight:700;margin:0 0 8px;">Choisir le mode</h2>
      <p style="color:rgba(255,255,255,0.55);font-size:14px;margin:0 0 28px;line-height:1.5;">Comment souhaitez-vous jouer ce quiz ?</p>
      <div style="display:flex;gap:14px;flex-direction:column;">
        <button id="qmd-eval-btn" style="display:flex;align-items:center;gap:14px;background:linear-gradient(135deg,#ff6b35,#e63946);border:none;border-radius:14px;padding:18px 20px;cursor:pointer;text-align:left;box-shadow:0 8px 24px rgba(230,57,70,0.35);transition:transform .15s;" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform=''">
          <span style="font-size:30px;">&#9201;</span>
          <div>
            <div style="color:#fff;font-weight:700;font-size:16px;">Mode &#201;valuation</div>
            <div style="color:rgba(255,255,255,0.75);font-size:12px;margin-top:3px;">Chronom&#233;tr&#233; &middot; Score final &middot; Anti-triche</div>
          </div>
        </button>
        <button id="qmd-rev-btn" style="display:flex;align-items:center;gap:14px;background:linear-gradient(135deg,#4361ee,#3a0ca3);border:none;border-radius:14px;padding:18px 20px;cursor:pointer;text-align:left;box-shadow:0 8px 24px rgba(67,97,238,0.35);transition:transform .15s;" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform=''">
          <span style="font-size:30px;">&#128218;</span>
          <div>
            <div style="color:#fff;font-weight:700;font-size:16px;">Mode R&#233;vision</div>
            <div style="color:rgba(255,255,255,0.75);font-size:12px;margin-top:3px;">Libre &middot; Explications &middot; Aide IA disponible</div>
          </div>
        </button>
      </div>
      <button id="qmd-cancel-btn" style="margin-top:18px;background:none;border:none;color:rgba(255,255,255,0.35);font-size:13px;cursor:pointer;text-decoration:underline;">Annuler</button>
    </div>
    <style>@keyframes fadeIn{from{opacity:0}to{opacity:1}}@keyframes slideUp{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}</style>
  \`;

  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  document.getElementById('qmd-eval-btn').addEventListener('click', () => { close(); callback('evaluation'); });
  document.getElementById('qmd-rev-btn').addEventListener('click',  () => { close(); callback('revision');   });
  document.getElementById('qmd-cancel-btn').addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
}

`;

// Marker using LF
const wqStateMarker = '// ════════════════════════════════════════\n// WEB QUIZ PLAYER\n// ════════════════════════════════════════\nlet wqState = {';
if (!content.includes(wqStateMarker)) {
  console.error('ERROR: wqState marker not found! Trying alternate...');
  // Check with \r\n
  if (content.includes('// WEB QUIZ PLAYER')) {
    console.log('Found WEB QUIZ PLAYER comment, showing context:');
    const i = content.indexOf('// WEB QUIZ PLAYER');
    console.log(JSON.stringify(content.substring(i - 50, i + 100)));
  }
  process.exit(1);
}
content = content.replace(wqStateMarker, askQuizModeCode + wqStateMarker);
console.log('✓ askQuizMode injected');

// ═══════════════════════════════════════════════════════════════════
// 2. openWebQuizPlayer — demander le mode avant lancement
// ═══════════════════════════════════════════════════════════════════
const oldOpenQuiz = `  wqState.questions = questions;\n  wqState.currentIndex = 0;\n  wqState.selectedChoice = null;\n  wqState.isVerified = false;\n\n  document.getElementById('web-quiz-player-modal').classList.add('active');\n  window.renderWebQuizPlayer();\n};`;
const newOpenQuiz = `  // Demander le mode avant de lancer\n  askQuizMode((mode) => {\n    startWebQuizFromData(questions, mode);\n  });\n};`;

if (!content.includes(oldOpenQuiz)) {
  console.error('ERROR: openWebQuizPlayer target not found!');
  process.exit(1);
}
content = content.replace(oldOpenQuiz, newOpenQuiz);
console.log('✓ openWebQuizPlayer updated');

// ═══════════════════════════════════════════════════════════════════
// 3. loadSavedQuiz — remplacer le mode forcé evaluation
// ═══════════════════════════════════════════════════════════════════
const oldLoadSaved = `      wqState.questions = q.questions;\n      wqState.currentIndex = 0;\n      wqState.mode = 'evaluation';\n      wqState.timerSeconds = 0;\n      wqState.questionTimeLeft = wqState.secondsPerQuestion;\n      \n      // Cleanup any score screen\n      const modal = document.getElementById('web-quiz-player-modal');\n      const score = modal.querySelector('#wq-score-screen');\n      if(score) score.remove();\n      modal.querySelectorAll('.wq-header, .wq-body, .wq-footer, #wq-feedback, #wq-ai-response-container').forEach(el => el.style.display = '');\n\n      modal.classList.add('active');\n      window.renderWebQuizPlayer();\n      if(typeof startQuestionCountdown === 'function') startQuestionCountdown();\n    } catch(e) {\n      console.error(e);\n      toast("Erreur lors du chargement.", "error");\n    }\n  };`;
const newLoadSaved = `      const questionsToLoad = q.questions;\n      // Demander le mode avant de lancer\n      askQuizMode((mode) => {\n        startWebQuizFromData(questionsToLoad, mode);\n      });\n    } catch(e) {\n      console.error(e);\n      toast("Erreur lors du chargement.", "error");\n    }\n  };`;

if (!content.includes(oldLoadSaved)) {
  console.error('ERROR: loadSavedQuiz target not found!');
  // Debug
  const idx = content.indexOf("wqState.mode = 'evaluation'");
  if (idx >= 0) {
    console.log('mode=evaluation found, context:');
    console.log(JSON.stringify(content.substring(idx - 200, idx + 100)));
  }
  process.exit(1);
}
content = content.replace(oldLoadSaved, newLoadSaved);
console.log('✓ loadSavedQuiz updated');

// ═══════════════════════════════════════════════════════════════════
// 4. Quiz partagé (sharedQuiz URL param) — remplacer mode forcé
// ═══════════════════════════════════════════════════════════════════
const oldShared = `      wqState.questions = quizData.questions;\n      wqState.currentIndex = 0;\n      wqState.mode = 'evaluation';\n      wqState.timerSeconds = 0;\n      wqState.questionTimeLeft = wqState.secondsPerQuestion || 30;\n      \n      const modal = document.getElementById('web-quiz-player-modal');\n      const score = modal.querySelector('#wq-score-screen');\n      if(score) score.remove();\n      modal.querySelectorAll('.wq-header, .wq-body, .wq-footer, #wq-feedback, #wq-ai-response-container').forEach(el => el.style.display = '');\n\n      modal.classList.add('active');\n      window.renderWebQuizPlayer();\n      if(typeof startQuestionCountdown === 'function') startQuestionCountdown();\n      \n      // Nettoyer l'URL\n      window.history.replaceState({}, document.title, window.location.pathname);\n      toast("Quiz partagé chargé !", "success");`;
const newShared = `      // Nettoyer l'URL\n      window.history.replaceState({}, document.title, window.location.pathname);\n      toast("Quiz partag\\u00e9 charg\\u00e9 ! Choisissez votre mode.", "success");\n      // Demander le mode avant de lancer\n      askQuizMode((mode) => {\n        startWebQuizFromData(quizData.questions, mode);\n      });`;

if (!content.includes(oldShared)) {
  console.error('ERROR: sharedQuiz target not found!');
  const idx = content.indexOf('sharedQuizId');
  if (idx >= 0) {
    console.log('sharedQuizId context:');
    console.log(content.substring(idx, idx + 600));
  }
  process.exit(1);
}
content = content.replace(oldShared, newShared);
console.log('✓ sharedQuiz updated');

// ═══════════════════════════════════════════════════════════════════
// 5. Import JSON — remplacer window.confirm par askQuizMode
// ═══════════════════════════════════════════════════════════════════
// Find this pattern and replace
const confirmIdx = content.indexOf("window.confirm('Voulez-vous jouer en mode");
if (confirmIdx === -1) {
  console.error('ERROR: window.confirm not found!');
  process.exit(1);
}
// Get the context around it to build exact replacement
const ctxStart = content.lastIndexOf('\n', confirmIdx) + 1;
// Find the end of this block (after the if/else)
const afterConfirm = content.indexOf('\n', confirmIdx);
const lineAfter = content.indexOf('\n', afterConfirm + 1);
const blockEnd = content.indexOf('\n', lineAfter + 1);

const oldBlock = content.substring(ctxStart, blockEnd + 1);
console.log('Old import block:', JSON.stringify(oldBlock));

const newBlock = `        // Demander le mode via le modal élégant\n        if (json.type === 'QR') {\n          _showFlashCardPlayer(questions, json);\n        } else {\n          wqState.metadata = json;\n          askQuizMode((mode) => { startWebQuizFromData(questions, mode); });\n        }\n`;

content = content.substring(0, ctxStart) + newBlock + content.substring(blockEnd + 1);
console.log('✓ JSON import updated');

// ═══════════════════════════════════════════════════════════════════
// Write back (restore CRLF if original used it)
// ═══════════════════════════════════════════════════════════════════
if (useCRLF) {
  content = content.replace(/\n/g, '\r\n');
}
fs.writeFileSync('./src/legacy.js', content, 'utf8');
console.log('\n✅ All changes applied. File saved.');
