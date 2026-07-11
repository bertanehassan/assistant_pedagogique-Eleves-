const fs = require('fs');
let c = fs.readFileSync('src/legacy.js', 'utf8');

// The blob to remove starts right after line 8343 (the geminiUrl line)
// and ends right before line 8618 (// Scroll to bottom)

const START_MARKER = "      const geminiUrl = `/api/gemini/v1beta/models/${GEMINI_MODEL}:generateContent?key=${cleanGeminiKey}`;";
const END_MARKER = "  // Scroll to bottom";

// What should come between them (the correct fetch block that was lost)
const CORRECT_BLOCK = `
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

      // Extraction du titre genere (si applicable)
      let extractedTitle = 'Fiche_Correction';
      const titleMatch = geminiText.match(/\\[TITRE_SVT:\\s*(.*?)\\]/i);
      if (titleMatch) {
        extractedTitle = titleMatch[1].trim().replace(/[^a-zA-Z0-9À-ÿ\\s-]/g, '_');
        geminiText = geminiText.replace(titleMatch[0], '').trim();
        if (state.messages && state.messages.length >= 2) {
           const lastUserMsg = state.messages[state.messages.length - 2];
           if (lastUserMsg && lastUserMsg.role === 'user') {
              lastUserMsg.content = \`📋 Fiche de Correction — \${extractedTitle}\`;
           }
        }
      }

      // Export Word si demande
      if (cfg.exportWord) {
        let textToExport = geminiText;
        if (textToExport.includes('[EXPORT_WORD]')) {
          textToExport = textToExport.replace('[EXPORT_WORD]', '').trim();
          geminiText = textToExport;
        }
        try {
          exportToWord(textToExport, \`Fiche_Correction_\${extractedTitle.replace(/\\s+/g, '_').slice(0,50)}.doc\`);
          toast('📄 Fiche exportée en Word avec succès !', 'success');
        } catch(e) {
          console.error('Export Word error:', e);
        }
      }

      assistantMsg.content = geminiText;
      assistantMsg.streaming = false;
      renderMessages(true);
      hideTyping();
      await saveChat();

      // Réinitialiser les données PDF
      _corrPdfName = '';
      _corrPdfBase64 = null;
      _corrPdfMime = '';

    } catch(e) {
      const errTxt = \`❌ Erreur génération fiche : \${e.message}\`;
      assistantMsg.content = errTxt;
      assistantMsg.streaming = false;
      renderMessages(true);
      hideTyping();
    } finally {
      state.isGenerating = false;
      const sendBtn2 = $('#send-btn');
      if (sendBtn2) { sendBtn2.className = 'send-btn'; sendBtn2.innerHTML = '▶'; sendBtn2.disabled = false; }
    }
  };

`;

// Find the START_MARKER position
const startIdx = c.indexOf(START_MARKER);
if (startIdx === -1) {
    console.error('START_MARKER not found!');
    process.exit(1);
}

// The CORRECT position for END_MARKER search is after the existing START_MARKER
const endIdx = c.indexOf('\n  ' + END_MARKER.trim(), startIdx);
if (endIdx === -1) {
    console.error('END_MARKER not found!');
    // Try another variant
    const endIdx2 = c.indexOf('  // Scroll to bottom', startIdx);
    if (endIdx2 === -1) {
        console.error('END_MARKER variant not found either!');
        process.exit(1);
    }
}

const endIdxFinal = c.indexOf('  // Scroll to bottom', startIdx);
if (endIdxFinal === -1) {
    console.error('Final END_MARKER not found!');
    process.exit(1);
}

// Replace from right after START_MARKER to END_MARKER
const beforeGeminiUrl = c.substring(0, startIdx); // cuts off right before START_MARKER
const afterEndMarker = c.substring(endIdxFinal);  // includes END_MARKER + rest

c = beforeGeminiUrl + CORRECT_BLOCK + afterEndMarker;
fs.writeFileSync('src/legacy.js', c);
console.log('SUCCESS! Fixed the duplicate block and stray text.');
console.log('New file length:', c.length);
