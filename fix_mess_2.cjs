const fs = require('fs');
let c = fs.readFileSync('src/legacy.js', 'utf8');

const prefixStr = `        generationConfig: {
          temperature: 0.35,
          maxOutputTokens: 8192,
          topP: 0.95
        }
      };`;

const endStr = `          else if (t.closest('#corr-back-4')) corrShowStep(3);
        });`;

const prefixIdx = c.indexOf(prefixStr);
if (prefixIdx === -1) {
    console.error("Could not find prefixStr");
    process.exit(1);
}
const startCut = prefixIdx + prefixStr.length;

const endIdx = c.indexOf(endStr, startCut);
if (endIdx === -1) {
    console.error("Could not find endStr");
    process.exit(1);
}
const endCut = endIdx + endStr.length;

const originalStr = `

      const cleanGeminiKey = state.geminiApiKey.replace(/[\\r\\n\\s]+/g, '');
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

c = c.substring(0, startCut) + originalStr + c.substring(endCut);
fs.writeFileSync('src/legacy.js', c);
console.log("SUCCESS!");
