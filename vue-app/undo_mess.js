const fs = require('fs');
const file = 'src/legacy.js';
let c = fs.readFileSync(file, 'utf8');

const badStart = '        1. RÈGLE DES DÉLIMITEURS : Encadre CHAQUE variable, chiffre avec unité ou formule par des dollars simples $ ... $. Texte français à l\\'extérieur. Exemple : "La quantité d\\'ADN passe de $q$ à $2q$."';
const badEnd = '        // ── Wiring des boutons (via Event Delegation) ────────────────────────';

const idx1 = c.indexOf(badStart);
const idx2 = c.indexOf(badEnd);

if (idx1 !== -1 && idx2 !== -1) {
  // We want to replace everything from just before badStart to badEnd (inclusive up to the start of badEnd or its replacement)
  
  // The original text to put back:
  const original = `      const cleanGeminiKey = state.geminiApiKey.replace(/[\\r\\n\\s]+/g, '');
      const geminiUrl = \`/api/gemini/v1beta/models/\${GEMINI_MODEL}:generateContent?key=\${cleanGeminiKey}\`;

      assistantMsg.content = \`🔍 Gemini analyse votre demande\${hasPdf ? ' et lit le document natif' : ''}…\`;
      renderMessages();

      const geminiRes = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: state.abortController.signal,
        body: JSON.stringify(geminiPayload)
      });

      if (!geminiRes.ok) {
        const errText = await geminiRes.text();
        let errMsg = errText.slice(0, 500);
        try { const j = JSON.parse(errText); errMsg = j.error?.message || errMsg; } catch(e) {}
        throw new Error(\`Gemini API \${geminiRes.status}: \${errMsg}\`);
      }

      const geminiData = await geminiRes.json();
      let geminiText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '';

      if (!geminiText) {
        const finishReason = geminiData?.candidates?.[0]?.finishReason;
        throw new Error(\`Gemini n'a pas généré de texte. Raison : \${finishReason || 'inconnue'}\`);
      }

      // Extraction du titre SVT genere (si applicable)
      let extractedTitle = 'Fiche_Correction';
      const titleMatch = geminiText.match(/\\[TITRE_SVT:\\s*(.*?)\\]/i);
      if (titleMatch) {
        extractedTitle = titleMatch[1].trim().replace(/[^a-zA-Z0-9À-ÿ\\s-]/g, '_');
        geminiText = geminiText.replace(titleMatch[0], '').trim();`;

  // Find where `const cleanGeminiKey` SHOULD be (it's right after `const geminiPayload = { ... };`)
  const targetPrefix = 'generationConfig: {\n          temperature: 0.35,\n          maxOutputTokens: 8192,\n          topP: 0.95\n        }\n      };';
  const prefixIdx = c.indexOf('        }\n      };');
  
  if (prefixIdx !== -1) {
    const startCut = prefixIdx + 18; // after };\n
    const endDelegationStr = '          else if (t.closest(\'#corr-back-4\')) corrShowStep(3);\n        });';
    const endCut = c.indexOf(endDelegationStr) + endDelegationStr.length;
    
    if (c.indexOf(endDelegationStr) !== -1) {
      c = c.substring(0, startCut) + '\n' + original + '\n' + c.substring(endCut);
      fs.writeFileSync(file, c);
      console.log('Fixed legacy.js!');
    } else {
      console.log('Could not find end of delegation string.');
    }
  } else {
    console.log('Could not find prefix.');
  }
} else {
  console.log('Could not find badStart or badEnd.');
}
