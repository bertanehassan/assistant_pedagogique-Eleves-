const fs = require('fs');
const path = require('path');

const filepath = path.join(__dirname, 'src', 'legacy.js');
let content = fs.readFileSync(filepath, 'utf8');

const t1 = `function openFlashCardPlayer(msgId) {
  const msg = state.messages.find(m => (m.ts || '') == msgId);
  if (!msg || !msg.content) return;
  const cards = parseFcOutput(msg.content);
  if (!cards.length) { toast('Aucune FlashCard détectée.', 'error'); return; }
  _showFlashCardPlayer(cards, { titre: extractSubjectFromContent(msg.content) }, msgId);
}`;
const r1 = `function openFlashCardPlayer(msgId) {
  const msg = state.messages.find(m => (m.ts || '') == msgId);
  if (!msg || !msg.content) return;
  const cards = parseFcOutput(msg.content);
  if (!cards.length) { toast('Aucune FlashCard détectée.', 'error'); return; }
  const isArabic = msg.workflowUsed === 'FC-Ar 1' || msg.workflowUsed === 'FC-Ar 2';
  _showFlashCardPlayer(cards, { titre: extractSubjectFromContent(msg.content) }, msgId, isArabic);
}`;
content = content.replace(t1, r1);

const t2 = `function _showFlashCardPlayer(cards, metadata = {}, msgId = null) {`;
const r2 = `function _showFlashCardPlayer(cards, metadata = {}, msgId = null, isArabic = false) {`;
content = content.replace(t2, r2);

const htmlReplacements = [
  {
    t: `<div style="color:#e2e8f0;font-size:18px;line-height:1.7;">\${renderWithLatex(card.question)}</div>`,
    r: `<div style="color:#e2e8f0;font-size:18px;line-height:1.7;"\${isArabic ? ' dir="rtl"' : ''}>\${renderWithLatex(card.question)}</div>`
  },
  {
    t: `<div style="color:#e2e8f0;font-size:18px;line-height:1.7;">\${renderWithLatex(card.reponse || "—")}</div>`,
    r: `<div style="color:#e2e8f0;font-size:18px;line-height:1.7;"\${isArabic ? ' dir="rtl"' : ''}>\${renderWithLatex(card.reponse || "—")}</div>`
  },
  {
    t: `<div style="color:#cbd5e1;font-size:15px;line-height:1.7;">\${renderWithLatex(card.explication)}</div>`,
    r: `<div style="color:#cbd5e1;font-size:15px;line-height:1.7;"\${isArabic ? ' dir="rtl"' : ''}>\${renderWithLatex(card.explication)}</div>`
  },
  {
    t: `<a href="\${card.pour_aller_plus_loin}" target="_blank" style="color:#818cf8;font-size:14px;word-break:break-all;">\${esc(card.pour_aller_plus_loin)}</a>`,
    r: `<a href="\${card.pour_aller_plus_loin}" target="_blank" style="color:#818cf8;font-size:14px;word-break:break-all;"\${isArabic ? ' dir="rtl"' : ''}>\${esc(card.pour_aller_plus_loin)}</a>`
  },
  {
    t: `<div style="color:#e2e8f0;font-size:16px;line-height:1.7;margin-bottom:20px;">\${renderWithLatex(card.reponse || '—')}</div>`,
    r: `<div style="color:#e2e8f0;font-size:16px;line-height:1.7;margin-bottom:20px;"\${isArabic ? ' dir="rtl"' : ''}>\${renderWithLatex(card.reponse || '—')}</div>`
  }
];

htmlReplacements.forEach(({t, r}) => {
  // It might appear multiple times (e.g. question is in detail and front)
  content = content.split(t).join(r);
});

fs.writeFileSync(filepath, content, 'utf8');
console.log('Patch complete.');
