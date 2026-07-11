const fs = require('fs');

let appHeader = fs.readFileSync('./src/components/AppHeader.vue', 'utf8');

const oldBtn = `<button id="quizzes-btn" @click="() => window.openQuizzesPanel && window.openQuizzesPanel()" class="topbar-btn" title="Mes Quiz Sauvegardés" style="color: #d4af37; border-color: rgba(212,175,55,0.4);">`;
const newBtn = `<button id="quizzes-btn" onclick="if(window.openQuizzesPanel) window.openQuizzesPanel();" class="topbar-btn" title="Mes Quiz Sauvegardés" style="color: #d4af37; border-color: rgba(212,175,55,0.4);">`;

appHeader = appHeader.replace(oldBtn, newBtn);
fs.writeFileSync('./src/components/AppHeader.vue', appHeader, 'utf8');

console.log('✓ AppHeader fixed');
