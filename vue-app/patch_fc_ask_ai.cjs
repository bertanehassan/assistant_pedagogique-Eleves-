const fs = require('fs');
const path = require('path');

const filepath = path.join(__dirname, 'src', 'legacy.js');
let content = fs.readFileSync(filepath, 'utf8');

const oldVerso = `<button onclick="event.stopPropagation();window.__fcDetail&&window.__fcDetail()" style="align-self:flex-start;padding:9px 20px;border-radius:12px;border:1px solid rgba(245,158,11,0.4);background:rgba(245,158,11,0.12);color:#f59e0b;cursor:pointer;font-size:13px;font-weight:700;">\${isArabic ? '💡 عرض التفاصيل' : '💡 Voir le détail'}</button>`;
const newVerso = `<div style="display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap;">
              <button onclick="event.stopPropagation();window.__fcDetail&&window.__fcDetail()" style="padding:9px 20px;border-radius:12px;border:1px solid rgba(245,158,11,0.4);background:rgba(245,158,11,0.12);color:#f59e0b;cursor:pointer;font-size:13px;font-weight:700;">\${isArabic ? '💡 عرض التفاصيل' : '💡 Voir le détail'}</button>
              <button id="btn-ask-ai-back" onclick="event.stopPropagation();window.__fcAskAI&&window.__fcAskAI()" style="padding:9px 20px;border-radius:12px;border:1px solid rgba(139,92,246,0.4);background:rgba(139,92,246,0.12);color:#c4b5fd;cursor:pointer;font-size:13px;font-weight:700;">\${isArabic ? '🤖 طلب الشرح' : '🤖 Expliquer (IA)'}</button>
            </div>
            <div id="ai-explanation-container-back" onclick="event.stopPropagation();" style="display:none;background:rgba(139,92,246,0.08);border:1px solid rgba(139,92,246,0.25);border-radius:16px;padding:20px;margin-bottom:12px;overflow-y:auto;max-height:150px;text-align:left;"></div>`;

content = content.replace(oldVerso, newVerso);

const oldFuncBlock = `  window.__fcPrev = () => { if (idx > 0) { idx--; render(); } };`;
const newFuncBlock = `  window.__fcAskAI = async () => {
    const card = cards[idx];
    const btn = document.getElementById('btn-ask-ai-back');
    const container = document.getElementById('ai-explanation-container-back');
    if (!btn || !container) return;
    
    if (!state.apiKey) {
      container.innerHTML = '<div style="color:#ef4444;font-size:14px;background:rgba(239,68,68,0.1);padding:12px;border-radius:12px;border:1px solid rgba(239,68,68,0.3);text-align:center;">Veuillez configurer votre clé API Mistral dans les paramètres.</div>';
      container.style.display = 'block';
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '⏳...';
    container.style.display = 'block';
    container.innerHTML = '<div style="color:#64748b;font-size:14px;display:flex;align-items:center;gap:8px;justify-content:center;">Génération en cours...</div>';

    const promptText = isArabic 
      ? \`اشرح بأسلوب تعليمي مبسط ومفصل الجواب عن هذا السؤال. السؤال: "\${card.question}". الجواب: "\${card.reponse || ''}". أجب باللغة العربية.\`
      : \`Explique-moi de manière pédagogique, simple et détaillée la réponse à cette question. Question: "\${card.question}". Réponse: "\${card.reponse || ''}". Réponds en français.\`;

    const reqBody = {
      model: "mistral-large-latest",
      messages: [
        { role: "system", content: "Tu es un expert pédagogique. Tu dois fournir une explication claire, accessible et détaillée." },
        { role: "user", content: promptText }
      ],
      temperature: 0.3,
      stream: true
    };

    try {
      const abortController = new AbortController();
      const res = await fetchWithRetry("https://api.mistral.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": \`Bearer \${state.apiKey}\`,
          "Content-Type": "application/json"
        },
        signal: abortController.signal,
        body: JSON.stringify(reqBody)
      });
      if (!res.ok) throw new Error(\`API \${res.status}\`);
      
      let finalResult = "";
      container.innerHTML = '<div style="color:#e2e8f0;font-size:15px;line-height:1.7;text-align:left;" id="ai-expl-text-back"></div>';
      const textEl = document.getElementById('ai-expl-text-back');
      if (isArabic) {
        textEl.setAttribute('dir', 'rtl');
        textEl.style.textAlign = 'right';
      }

      await handleStreamingResponse(res, (chunk) => {
        finalResult = chunk;
        textEl.innerHTML = renderWithLatex(finalResult);
      }, () => {
        btn.innerHTML = isArabic ? '🤖 إعادة الشرح' : '🤖 Réexpliquer (IA)';
        btn.disabled = false;
        if (window.MathJax && typeof window.MathJax.typesetPromise === 'function') {
          try { window.MathJax.typesetPromise([container]).catch(e => {}); } catch(e){}
        }
      }, abortController.signal);
    } catch(err) {
      container.innerHTML = \`<div style="color:#ef4444;font-size:14px;background:rgba(239,68,68,0.1);padding:12px;border-radius:12px;border:1px solid rgba(239,68,68,0.3);text-align:center;">Erreur: \${err.message}</div>\`;
      btn.disabled = false;
      btn.innerHTML = isArabic ? '🤖 طلب الشرح' : '🤖 Expliquer (IA)';
    }
  };

  window.__fcPrev = () => { if (idx > 0) { idx--; render(); } };`;
content = content.replace(oldFuncBlock, newFuncBlock);

fs.writeFileSync(filepath, content, 'utf8');
console.log('Task patch complete.');
