const fs = require('fs');
const path = require('path');

const filepath = path.join(__dirname, 'src', 'legacy.js');
let content = fs.readFileSync(filepath, 'utf8');

const replacements = [
  // 1. Text centering
  {
    t: `color:#e2e8f0;font-size:18px;line-height:1.7;`,
    r: `color:#e2e8f0;font-size:18px;line-height:1.7;text-align:center;`
  },
  {
    t: `color:#e2e8f0;font-size:16px;line-height:1.7;margin-bottom:20px;`,
    r: `color:#e2e8f0;font-size:16px;line-height:1.7;margin-bottom:20px;text-align:center;`
  },
  {
    t: `color:#cbd5e1;font-size:15px;line-height:1.7;`,
    r: `color:#cbd5e1;font-size:15px;line-height:1.7;text-align:center;`
  },
  {
    t: `color:#818cf8;font-size:14px;word-break:break-all;`,
    r: `color:#818cf8;font-size:14px;word-break:break-all;text-align:center;display:block;`
  },
  // 2. Button and label translations
  {
    t: `>◀ Retour</button>`,
    r: `>\${isArabic ? 'عودة ◀' : '◀ Retour'}</button>`
  },
  {
    t: `>💡 DÉTAIL — CARTE \${card.id}</span>`,
    r: `>\${isArabic ? '💡 التفاصيل — بطاقة' : '💡 DÉTAIL — CARTE'} \${card.id}</span>`
  },
  {
    t: `>❓ QUESTION</div>`,
    r: `>\${isArabic ? '❓ السؤال' : '❓ QUESTION'}</div>`
  },
  {
    t: `>✅ RÉPONSE</div>`,
    r: `>\${isArabic ? '✅ الجواب' : '✅ RÉPONSE'}</div>`
  },
  {
    t: `>💡 EXPLICATION</div>`,
    r: `>\${isArabic ? '💡 الشرح' : '💡 EXPLICATION'}</div>`
  },
  {
    t: `>🔗 POUR ALLER PLUS LOIN</div>`,
    r: `>\${isArabic ? '🔗 للمزيد من المعلومات' : '🔗 POUR ALLER PLUS LOIN'}</div>`
  },
  {
    t: `metadata.title ? metadata.titre || metadata.title : 'FlashCards'}`,
    r: `metadata.title ? metadata.titre || metadata.title : (isArabic ? 'بطاقات تعليمية' : 'FlashCards')}`
  },
  {
    t: `>👆 Cliquez pour voir la réponse</div>`,
    r: `>\${isArabic ? '👆 انقر لرؤية الجواب' : '👆 Cliquez pour voir la réponse'}</div>`
  },
  {
    t: `>💡 Voir le détail</button>`,
    r: `>\${isArabic ? '💡 عرض التفاصيل' : '💡 Voir le détail'}</button>`
  },
  {
    t: `>◀ Précédent</button>`,
    r: `>\${isArabic ? 'السابق ◀' : '◀ Précédent'}</button>`
  },
  {
    t: `>💾 Sauvegarder</button>`,
    r: `>\${isArabic ? '💾 حفظ' : '💾 Sauvegarder'}</button>`
  },
  {
    t: `>Suivant ▶</button>`,
    r: `>\${isArabic ? 'التالي ▶' : 'Suivant ▶'}</button>`
  },
  {
    t: `>✕ Fermer</button>`,
    r: `>\${isArabic ? '✕ إغلاق' : '✕ Fermer'}</button>`
  }
];

replacements.forEach(({t, r}) => {
  content = content.split(t).join(r);
});

fs.writeFileSync(filepath, content, 'utf8');
console.log('UI Patch complete.');
