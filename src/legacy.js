// ════════════════════════════════════════
// CONFIG
// ════════════════════════════════════════
import { MODELS, DB_NAME, DB_VERSION } from './config.js';
import { state } from './state.js';
import { fetchWithRetry as fetchWithRetryBase } from './composables/useMistral.js';
import { t } from './i18n.js';
import { loginWithGoogle, logout, onAuthChange, shareQuiz, getSharedQuiz, saveUserScore, getUserScores } from './firebase.js';

// Annule la génération en cours
function stopGeneration() {
  if (state.abortController) {
    state.abortController.abort();
  }
}

// Fetch avec retry automatique + backoff exponentiel
async function fetchWithRetry(url, options, maxRetries = 3) {
  return fetchWithRetryBase(url, options, maxRetries, toast);
}

// ════════════════════════════════════════
// UTILITAIRES CHARGEMENT DYNAMIQUE
// ════════════════════════════════════════

/**
 * Charge un script externe dynamiquement (une seule fois).
 */
function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`Impossible de charger : ${src}`));
    document.head.appendChild(s);
  });
}

// ════════════════════════════════════════
// EXTRACTION PDF (TEXTE NATIF + OCR)
// ════════════════════════════════════════

/**
 * Extrait le texte d'un fichier PDF.
 * 1. Tente l'extraction texte natif via pdfjsLib (rapide, instantané).
 * 2. Si texte insuffisant (PDF scanné / image), charge Tesseract.js et
 *    effectue un OCR page par page (fr + en + ar).
 *
 * @param {File}     file        – Fichier PDF
 * @param {Function} onProgress  – Callback(message: string) pour afficher la progression
 * @returns {Promise<{text: string, method: 'native'|'ocr', pages: number}>}
 */
async function extractTextFromPdf(file, onProgress = null) {
  const notify = (msg) => { if (onProgress) onProgress(msg); };

  // ── Étape 1 : Extraction texte natif ─────────────────────────────────
  notify('📄 Lecture du PDF en cours…');
  const arrayBuffer = await file.arrayBuffer();
  const typedarray  = new Uint8Array(arrayBuffer);
  const pdf         = await pdfjsLib.getDocument({ data: typedarray }).promise;
  const totalPages  = pdf.numPages;

  let nativeText = '';
  for (let i = 1; i <= totalPages; i++) {
    const page        = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    let pageText = '';
    let lastY;
    for (const item of textContent.items) {
      if (lastY !== undefined && Math.abs(lastY - item.transform[5]) > 2) pageText += '\n';
      pageText += item.str;
      lastY = item.transform[5];
    }
    nativeText += pageText.trim() + '\n\n';
  }
  nativeText = nativeText.trim();

  // Si le texte natif est suffisant → retour immédiat
  if (nativeText.length >= 50) {
    notify(`✅ Texte extrait (${nativeText.length} caractères).`);
    return { text: nativeText, method: 'native', pages: totalPages };
  }

  // ── Étape 2 : OCR via Tesseract.js ──────────────────────────────────
  notify('🔍 PDF image détecté — chargement du moteur OCR…');

  // Chargement lazy de Tesseract.js (CDN, ~10 Mo, mis en cache)
  if (typeof Tesseract === 'undefined') {
    await loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js');
  }

  notify('🔍 Initialisation OCR (français + anglais + arabe)…');
  const worker = await Tesseract.createWorker(['fra', 'eng', 'ara'], 1, {
    logger: (m) => {
      if (m.status === 'recognizing text') {
        const pct = Math.round((m.progress || 0) * 100);
        notify(`🔍 OCR page ${m.userJobId || '?'} — ${pct}%`);
      }
    }
  });

  let ocrText = '';
  for (let i = 1; i <= totalPages; i++) {
    notify(`🔍 OCR — page ${i} / ${totalPages}…`);
    const page     = await pdf.getPage(i);
    // Rendu haute résolution (scale 2.5 = ~200 DPI, optimal pour OCR)
    const viewport = page.getViewport({ scale: 2.5 });
    const canvas   = document.createElement('canvas');
    canvas.width   = viewport.width;
    canvas.height  = viewport.height;
    const ctx      = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;
    const { data: { text } } = await worker.recognize(canvas, { jobId: String(i) });
    ocrText += text.trim() + '\n\n';
    canvas.remove();
  }

  await worker.terminate();
  ocrText = ocrText.trim();
  notify(`✅ OCR terminé — ${ocrText.length} caractères extraits sur ${totalPages} page(s).`);

  return { text: ocrText, method: 'ocr', pages: totalPages };
}



// ════════════════════════════════════════
// QCM SHUFFLE ENGINE
// ════════════════════════════════════════
// Generates a sequence of shuffled options guaranteeing equal distribution
function generateQcmSequenceArray(blocksCount = 50) {
  const letters = ['a', 'b', 'c', 'd'];
  let seq = [];
  let lastLetter = '';
  for (let i = 0; i < blocksCount; i++) {
    let block;
    let attempts = 0;
    do {
      block = [...letters].sort(() => Math.random() - 0.5);
      attempts++;
    } while (block[0] === lastLetter && attempts < 10);
    if (block[0] === lastLetter) {
      let temp = block[0]; block[0] = block[1]; block[1] = temp;
    }
    seq.push(...block);
    lastLetter = block[3];
  }
  return seq;
}

// Takes the LLM output (where [x] is always on a-) and shuffles
// options according to a pre-generated random sequence array.
// seq = array of letters like ['b','d','a','c',...]
function shuffleQcmOptions(text, seq) {
  if (!text || !seq || !seq.length) return text;
  try {
    const lines = text.split('\n');
    const newLines = [];
    let i = 0;
    let questionIndex = 0;

    while (i < lines.length) {
      const line = lines[i];
      // Detect question line: starts with number followed by "-"
      const qMatch = line.match(/^\d+\s*-\s+/);
      if (qMatch && questionIndex < seq.length) {
        newLines.push(line);
        i++;

        const savedLines = [];
        const optionLines = [];
        let correctIdx = -1;
        let peek = i;

        while (peek < lines.length && optionLines.length < 4) {
          const optLine = lines[peek].trim();
          
          // Stop if we hit the next question or the explanation line
          if (optLine.match(/^\d+\s*-\s+/) || optLine.match(/^•/)) {
            break;
          }

          const optMatch = optLine.match(/^(\[x\]\s*)?([a-d])\s*-\s*(.*)/i);
          if (optMatch) {
            const isCorrect = !!optMatch[1];
            const optText = optMatch[3];
            if (isCorrect) correctIdx = optionLines.length;
            optionLines.push({ text: optText, isCorrect, rawIndex: peek });
          }
          savedLines.push(lines[peek]);
          peek++;
        }

        if (optionLines.length === 4 && correctIdx >= 0) {
          const targetLetter = seq[questionIndex];
          const targetIdx = targetLetter.charCodeAt(0) - 97; // 'a'=0, 'b'=1, etc.
          const labels = ['a', 'b', 'c', 'd'];

          const correctOption = optionLines[correctIdx];
          const distractors = optionLines.filter((_, idx) => idx !== correctIdx);

          // Also shuffle distractors for extra randomness
          for (let j = distractors.length - 1; j > 0; j--) {
            const k = Math.floor(Math.random() * (j + 1));
            [distractors[j], distractors[k]] = [distractors[k], distractors[j]];
          }

          const shuffled = [];
          let dIdx = 0;
          for (let pos = 0; pos < 4; pos++) {
            if (pos === targetIdx) {
              shuffled.push({ text: correctOption.text, isCorrect: true });
            } else {
              shuffled.push({ text: distractors[dIdx].text, isCorrect: false });
              dIdx++;
            }
          }

          let optRenderIndex = 0;
          for (let j = 0; j < savedLines.length; j++) {
            const currentRawIndex = i + j;
            const isOptionLine = optionLines.some(opt => opt.rawIndex === currentRawIndex);
            if (isOptionLine) {
              const prefix = shuffled[optRenderIndex].isCorrect ? '[x] ' : '';
              newLines.push(`${prefix}${labels[optRenderIndex]}- ${shuffled[optRenderIndex].text}`);
              optRenderIndex++;
            } else {
              newLines.push(savedLines[j]);
            }
          }
        } else {
          // Couldn't parse as 4-option QCM — push as-is
          for (const savedLine of savedLines) {
            newLines.push(savedLine);
          }
        }
        i = peek;
        questionIndex++;
      } else {
        newLines.push(line);
        i++;
      }
    }
    return newLines.join('\n');
  } catch (e) {
    console.warn('shuffleQcmOptions error:', e);
    return text;
  }
}


// ════════════════════════════════════════
// MARKDOWN CONFIG
// ════════════════════════════════════════
if (typeof marked !== 'undefined') {
  if (typeof window.markedKatex !== 'undefined') {
    marked.use(window.markedKatex({
      throwOnError: false,
      displayMode: true,
      output: 'mathml' // Utilisé pour que l'export Word (et le web moderne) affiche des formules parfaites sans doublons
    }));
  }
  marked.setOptions({
    breaks: true, // line breaks
    highlight: function(code, lang) {
      if (typeof hljs !== 'undefined') {
        const language = hljs.getLanguage(lang) ? lang : 'plaintext';
        return hljs.highlight(code, { language }).value;
      }
      return code;
    }
  });
}

// ════════════════════════════════════════
// UTILS
// ════════════════════════════════════════
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const uuid = () => crypto.randomUUID();
const now = () => Date.now();

const safeJsonParse = (str, fallback = {}) => {
  try { return JSON.parse(str); } catch (e) { return fallback; }
};

const escapeHtml = t => (t||'')
  .replace(/&/g,"&amp;")
  .replace(/</g,"&lt;")
  .replace(/>/g,"&gt;");

const toast = (msg, type = "info") => {
  const t = document.createElement("div");
  t.className = `toast ${type}`;
  const icon = type === "error" ? "⚠" : type === "success" ? "✓" : "◈";
  t.innerHTML = `<span style="color:${type==='error'?'var(--danger)':type==='success'?'var(--neon)':'var(--cyan)'}">${icon}</span><span>${msg}</span>`;
  $("#toast-container").appendChild(t);
  setTimeout(() => t.remove(), 3800);
};

// ════════════════════════════════════════
// SECURE KEY STORAGE — AES-GCM (WebCrypto)
// La clé API est chiffrée avant tout stockage.
// Un attaquant qui vole le cookie ne peut pas l'utiliser dans un autre contexte.
// ════════════════════════════════════════

async function _deriveKey() {
  // Dérive une clé AES à partir d'un "fingerprint" propre à ce navigateur/domaine
  const fingerprint = (navigator.userAgent + location.hostname + "mia-2026-salt").slice(0, 64);
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(fingerprint), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: enc.encode("mia-salt-v1"), iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function _encryptValue(plaintext) {
  const key = await _deriveKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plaintext));
  // Stocker iv + ciphertext en base64
  const combined = new Uint8Array(iv.byteLength + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.byteLength);
  return btoa(String.fromCharCode(...combined));
}

async function _decryptValue(b64) {
  try {
    const key = await _deriveKey();
    const combined = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    return new TextDecoder().decode(decrypted);
  } catch(e) {
    return null; // Clé corrompue ou contexte différent
  }
}

const setCookie = async (n, v, d = 365) => {
  try {
    const encrypted = await _encryptValue(v);
    const e = new Date(); e.setDate(e.getDate() + d);
    document.cookie = `${n}=${encodeURIComponent(encrypted)};expires=${e.toUTCString()};path=/;SameSite=Strict`;
    localStorage.setItem('Mon Assistant IA_' + n, encrypted);
  } catch(err) {
    // Fallback plain si WebCrypto indisponible (rare)
    const e = new Date(); e.setDate(e.getDate() + d);
    document.cookie = `${n}=${encodeURIComponent(v)};expires=${e.toUTCString()};path=/;SameSite=Strict`;
    localStorage.setItem('Mon Assistant IA_' + n, v);
  }
};

const getCookie = async (n) => {
  let raw = null;
  try {
    const m = document.cookie.match('(^|;)\\s*' + n + '\\s*=\\s*([^;]+)');
    if (m) raw = decodeURIComponent(m.pop());
  } catch(err) {}
  if (!raw) {
    try { raw = localStorage.getItem('Mon Assistant IA_' + n); } catch(err) {}
  }
  if (!raw) return null;
  // Tenter déchiffrement AES
  const decrypted = await _decryptValue(raw);
  // Si déchiffrement échoue, c'est peut-être une ancienne valeur en clair
  return decrypted || raw;
};

const deleteCookie = (n) => {
  try { document.cookie = `${n}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;SameSite=Strict`; } catch(err) {}
  try { localStorage.removeItem('Mon Assistant IA_' + n); } catch(err) {}
};

const isValidApiKey = k => {
  const c = (k || '').trim();
  if (c.length < 20) return false;
  return /^[A-Za-z0-9\-_]{20,}$/.test(c);
};


// ════════════════════════════════════════
// INDEXEDDB
// ════════════════════════════════════════
import { db } from './storage.js';

// ════════════════════════════════════════
// UTILS: WORD EXPORT
// ════════════════════════════════════════
function exportToWord(text, filename = "Export_IA.doc") {
  // Convertir les formules LaTeX en images pour que MS Word puisse les lire
  let wordText = text;
  wordText = wordText.replace(/\$\$(.*?)\$\$/gs, (match, math) => {
    return `<br><div style="text-align:center"><img src="https://latex.codecogs.com/png.image?\\dpi{150}\\bg{white}${encodeURIComponent(math.trim())}" alt="formule mathématique" /></div><br>`;
  });
  wordText = wordText.replace(/\$(.*?)\$/g, (match, math) => {
    return `<img style="vertical-align:middle" src="https://latex.codecogs.com/png.image?\\dpi{150}\\bg{white}${encodeURIComponent(math.trim())}" alt="formule mathématique" />`;
  });

  const parsedHtml = typeof marked !== 'undefined' ? marked.parse(wordText) : wordText.replace(/\n/g, '<br>');
  const htmlContent = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
      <meta charset='utf-8'>
      <title>Export IA</title>
      <style>
        @page WordSection1 {
          size: 841.9pt 595.3pt; /* A4 Landscape */
          mso-page-orientation: landscape;
          margin: 36.0pt 36.0pt 36.0pt 36.0pt;
        }
        div.WordSection1 { page: WordSection1; }
      </style>
    </head>
    <body style="font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.5; color: #333;">
      <div class="WordSection1">
        ${parsedHtml}
      </div>
    </body>
    </html>
  `;
  const blob = new Blob(['\ufeff', htmlContent], { type: 'application/msword' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

function exportToHtml(text, filename = "Export_IA.html") {
  // Remplacement robuste des formules par des SVG CodeCogs (fiabilité à 100% indépendante du parseur Markdown)
  let htmlText = text;
  htmlText = htmlText.replace(/\$\$(.*?)\$\$/gs, (match, math) => {
    return `<br><div style="text-align:center"><img src="https://latex.codecogs.com/svg.image?\\bg{white}${encodeURIComponent(math.trim())}" alt="formule mathématique" /></div><br>`;
  });
  htmlText = htmlText.replace(/\$(.*?)\$/g, (match, math) => {
    return `<img style="vertical-align:middle; height:1.2em;" src="https://latex.codecogs.com/svg.image?\\bg{white}${encodeURIComponent(math.trim())}" alt="formule mathématique" />`;
  });

  const parsedHtml = typeof marked !== 'undefined' ? marked.parse(htmlText) : htmlText.replace(/\n/g, '<br>');
  const htmlContent = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Export HTML</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.css">
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 1000px; margin: 0 auto; padding: 20px; }
    table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #f2f2f2; }
    blockquote { border-left: 4px solid #ccc; margin-left: 0; padding-left: 16px; color: #666; }
    @media print {
      @page { size: landscape; margin: 15mm; }
      body { max-width: 100%; padding: 0; }
    }
  </style>
</head>
<body>
  ${parsedHtml}
</body>
</html>`;
  const blob = new Blob(['\ufeff', htmlContent], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

function exportToPdf(text, filename = "Export_IA.pdf") {
  if (typeof window.html2pdf === 'undefined') {
    console.error("html2pdf n'est pas chargé.");
    toast("Erreur : la librairie PDF n'est pas chargée.", "error");
    return;
  }
  
  let htmlText = text;
  htmlText = htmlText.replace(/\$\$(.*?)\$\$/gs, (match, math) => {
    return `<br><div style="text-align:center"><img src="https://latex.codecogs.com/svg.image?\\bg{white}${encodeURIComponent(math.trim())}" alt="formule mathématique" /></div><br>`;
  });
  htmlText = htmlText.replace(/\$(.*?)\$/g, (match, math) => {
    return `<img style="vertical-align:middle; height:1.2em;" src="https://latex.codecogs.com/svg.image?\\bg{white}${encodeURIComponent(math.trim())}" alt="formule mathématique" />`;
  });

  const parsedHtml = typeof marked !== 'undefined' ? marked.parse(htmlText) : htmlText.replace(/\n/g, '<br>');
  const container = document.createElement('div');
  container.innerHTML = parsedHtml;
  container.style.padding = '20px';
  container.style.fontFamily = "'Segoe UI', Arial, sans-serif";
  container.style.lineHeight = '1.6';
  container.style.color = '#333';
  container.style.fontSize = '12px'; // slightly smaller for PDF fit
  
  // Apply some basic styles directly to elements for html2pdf
  const tables = container.querySelectorAll('table');
  tables.forEach(t => {
    t.style.borderCollapse = 'collapse';
    t.style.width = '100%';
    t.style.marginBottom = '20px';
    t.querySelectorAll('th, td').forEach(cell => {
      cell.style.border = '1px solid #ddd';
      cell.style.padding = '8px';
      cell.style.textAlign = 'left';
    });
    t.querySelectorAll('th').forEach(th => {
      th.style.backgroundColor = '#f2f2f2';
    });
  });

  const blockquotes = container.querySelectorAll('blockquote');
  blockquotes.forEach(bq => {
    bq.style.borderLeft = '4px solid #ccc';
    bq.style.marginLeft = '0';
    bq.style.paddingLeft = '16px';
    bq.style.color = '#666';
  });
  
  const opt = {
    margin:       15,
    filename:     filename,
    image:        { type: 'jpeg', quality: 0.98 },
    html2canvas:  { scale: 2, useCORS: true },
    jsPDF:        { unit: 'mm', format: 'a4', orientation: 'landscape' }
  };
  
  html2pdf().set(opt).from(container).save();
}

// ════════════════════════════════════════
// AGENT FEEDBACK / LEARNING SYSTEM
// ════════════════════════════════════════
const agentFeedback = {
  add: async (entry) => {
    entry.id = entry.id || uuid();
    entry.created = entry.created || now();
    await db.put('agent_feedback', entry);
    return entry;
  },
  getForAgent: async (agentId, limit = 8) => {
    const all = await db.getAll('agent_feedback') || [];
    return all
      .filter(f => f.agentId === agentId)
      .sort((a, b) => b.created - a.created)
      .slice(0, limit);
  },
  getForWorkflow: async (workflowName, limit = 8) => {
    const all = await db.getAll('agent_feedback') || [];
    return all
      .filter(f => f.workflowName === workflowName)
      .sort((a, b) => b.created - a.created)
      .slice(0, limit);
  },
  getCountForAgent: async (agentId) => {
    const all = await db.getAll('agent_feedback') || [];
    return all.filter(f => f.agentId === agentId).length;
  },
  deleteForAgent: async (agentId) => {
    const all = await db.getAll('agent_feedback') || [];
    for (const f of all.filter(fb => fb.agentId === agentId)) {
      await db.delete('agent_feedback', f.id);
    }
  },
  deleteItem: async (id) => {
    await db.delete('agent_feedback', id);
  },
  updateItem: async (id, newFeedback) => {
    const f = await db.get('agent_feedback', id);
    if (f) {
      f.userFeedback = newFeedback;
      await db.put('agent_feedback', f);
    }
  },
  buildLessonsPrompt: (feedbacks) => {
    if (!feedbacks || !feedbacks.length) return '';
    const negatives = feedbacks.filter(f => f.score <= 2 && f.userFeedback);
    const positives = feedbacks.filter(f => f.score >= 4 && f.userFeedback && f.userFeedback !== 'auto_positive');
    if (!negatives.length && !positives.length) return '';
    let block = '\n\n[LEÇONS APPRISES — À RESPECTER IMPÉRATIVEMENT]\n';
    negatives.forEach(f => {
      block += `⛔ ERREUR À NE PAS RÉPÉTER : ${f.userFeedback}\n`;
    });
    positives.forEach(f => {
      block += `✅ BONNE PRATIQUE CONFIRMÉE : ${f.userFeedback}\n`;
    });
    block += `\n[CRITIQUE : Tu dois absolument donner la priorité à ces leçons. Si une instruction ci-dessus contredit une leçon, applique la leçon.]\n`;
    return block;
  }
};

function openFeedbackModal(msgTs, score) {
  const modal = document.getElementById('feedback-modal');
  if (!modal) return;
  document.getElementById('feedback-msg-ts').value = msgTs;
  document.getElementById('feedback-score').value = score;
  document.getElementById('feedback-text').value = '';
  document.getElementById('feedback-score-display').textContent = `${score}/5`;
  document.getElementById('feedback-score-display').className = `feedback-score-val ${score <= 2 ? 'bad' : 'good'}`;
  modal.classList.add('active');
  setTimeout(() => document.getElementById('feedback-text').focus(), 100);
}

async function submitFeedback() {
  const msgTs = parseInt(document.getElementById('feedback-msg-ts').value);
  const score = parseInt(document.getElementById('feedback-score').value);
  const text = document.getElementById('feedback-text').value.trim();
  if (!text) { toast('Veuillez écrire votre feedback', 'error'); return; }

  const msg = (state.messages || []).find(m => m.ts === msgTs);
  if (!msg) return;

  // Determine the agent
  const isRealAgent = state.agent && state.agent !== '__ALL_AGENTS__';
  const agentId = isRealAgent ? state.agent.id : null;
  const agentName = isRealAgent ? state.agent.name : (state.aiConfig?.name || 'Mon Assistant IA');
  const workflowName = msg.workflowUsed || null;

  const entry = {
    agentId: agentId,
    agentName: agentName,
    workflowName: workflowName,
    score: score,
    userFeedback: text,
    originalQuestion: (state.messages || []).filter(m => m.role === 'user').slice(-1)[0]?.content?.slice(0, 200) || '',
    responseSnippet: (msg.content || '').slice(0, 200)
  };

  await agentFeedback.add(entry);
  document.getElementById('feedback-modal').classList.remove('active');
  toast(`🧠 Feedback enregistré pour ${agentName}${workflowName ? ' (chaîne: ' + workflowName + ')' : ''}`, 'success');
  loadAgents(); // refresh badges

  // Mettre à jour le cache de l'agent actif
  if (state.agent && state.agent.id === agentId) {
    const lessons = await agentFeedback.getForAgent(agentId, 8);
    state._agentLessonsCache = agentFeedback.buildLessonsPrompt(lessons);
    const sys = (state.messages||[]).find(m => m.role === "system");
    if (sys) { sys.content = buildSystemPrompt(); await saveChat(); }
  }
}

async function manageLessons(agentId) {
  try {
    const ag = await db.get('agents', agentId);
    if (!ag) return;
    document.getElementById('lessons-agent-name').textContent = ag.name.toUpperCase();
    document.getElementById('manage-lessons-agent-id').value = agentId;
    await renderAgentLessons(agentId);
    
    // Fermer la modale des agents pour éviter les superpositions qui bloquent l'édition
    const agentModal = document.getElementById('agent-modal');
    if (agentModal) agentModal.classList.remove('active');
    
    document.getElementById('agent-lessons-modal').classList.add('active');
  } catch(e) { console.error(e); }
}

async function renderAgentLessons(agentId) {
  const listEl = document.getElementById('agent-lessons-list');
  try {
    const lessons = await agentFeedback.getForAgent(agentId, 100);
    if (!lessons.length) {
      listEl.innerHTML = '<div style="color:var(--text-dim); text-align:center; padding: 20px;">Aucune leçon retenue pour cet agent.</div>';
      return;
    }
    
    listEl.innerHTML = lessons.map(l => `
      <div class="lesson-item ${l.score >= 4 ? 'good' : 'bad'}" id="lesson-${l.id}">
        <div class="lesson-header">
          <span>${new Date(l.created).toLocaleString('fr-FR')} — Note: ${l.score}/5</span>
        </div>
        <textarea class="lesson-textarea" id="lesson-text-${l.id}">${escapeHtml(l.userFeedback || 'Renforcement automatique')}</textarea>
        <div class="lesson-actions">
          <button class="btn-ghost danger" onclick="deleteLesson('${l.id}', '${agentId}')" style="padding:4px 8px;font-size:10px;">🗑 SUPPRIMER</button>
          <button class="btn-ghost" onclick="updateLesson('${l.id}', '${agentId}')" style="padding:4px 8px;font-size:10px;">💾 ENREGISTRER</button>
        </div>
      </div>
    `).join('');
  } catch(e) { listEl.innerHTML = '<div style="color:var(--danger)">Erreur de chargement.</div>'; }
}

async function updateLesson(lessonId, agentId) {
  const newText = document.getElementById(`lesson-text-${lessonId}`).value.trim();
  if (!newText) return;
  try {
    await agentFeedback.updateItem(lessonId, newText);
    toast("Leçon mise à jour", "success");
    // Reload internal prompt cache if it's the active agent
    if (state.agent && state.agent.id === agentId) {
      const lessons = await agentFeedback.getForAgent(agentId, 8);
      state._agentLessonsCache = agentFeedback.buildLessonsPrompt(lessons);
      const sys = (state.messages||[]).find(m => m.role === "system");
      if (sys) { sys.content = buildSystemPrompt(); await saveChat(); }
    }
  } catch(e) { toast("Erreur de mise à jour", "error"); }
}

async function deleteLesson(lessonId, agentId) {
  if (!confirm("Supprimer cette leçon ?")) return;
  try {
    await agentFeedback.deleteItem(lessonId);
    toast("Leçon supprimée", "info");
    await renderAgentLessons(agentId);
    loadAgents(); // Refresh badges
    
    // Reload internal prompt cache if it's the active agent
    if (state.agent && state.agent.id === agentId) {
      const lessons = await agentFeedback.getForAgent(agentId, 8);
      state._agentLessonsCache = agentFeedback.buildLessonsPrompt(lessons);
      const sys = (state.messages||[]).find(m => m.role === "system");
      if (sys) { sys.content = buildSystemPrompt(); await saveChat(); }
    }
  } catch(e) { toast("Erreur", "error"); }
}

function getLlmApiConfig(modelId) {
  if (!modelId) modelId = state.model || "mistral-large-2512";
  
  if (modelId.includes("gemini")) {
    return {
      provider: "gemini",
      url: `/api/gemini/v1beta/models/${modelId}:streamGenerateContent?alt=sse&key=${state.geminiApiKey || ""}`,
      headers: {
        "Content-Type": "application/json"
      }
    };
  } else if (modelId.includes("deepseek") || modelId.includes("openrouter")) {
    return {
      provider: "openrouter",
      url: "/api/openrouter/api/v1/chat/completions",
      headers: {
        "Authorization": `Bearer ${state.openRouterApiKey || ""}`,
        "Content-Type": "application/json",
        "HTTP-Referer": window.location.origin,
        "X-Title": "Mon Assistant IA"
      }
    };
  } else {
    return {
      provider: "mistral",
      url: "https://api.mistral.ai/v1/chat/completions",
      headers: {
        "Authorization": `Bearer ${state.apiKey || ""}`,
        "Content-Type": "application/json"
      }
    };
  }
}

async function clearAgentLessons() {
  const agentId = document.getElementById('manage-lessons-agent-id').value;
  if (!agentId) return;
  if (!confirm("Voulez-vous vraiment effacer TOUTES les leçons de cet agent ? Il perdra tout son apprentissage.")) return;
  try {
    await agentFeedback.deleteForAgent(agentId);
    toast("Toutes les leçons ont été effacées", "success");
    await renderAgentLessons(agentId);
    loadAgents();
    
    if (state.agent && state.agent.id === agentId) {
      state._agentLessonsCache = '';
      const sys = (state.messages||[]).find(m => m.role === "system");
      if (sys) { sys.content = buildSystemPrompt(); await saveChat(); }
    }
  } catch(e) { toast("Erreur", "error"); }
}

// ════════════════════════════════════════
// MEMORY SYSTEM
// ════════════════════════════════════════
const memory = {
  add: async (content, tags = []) => {
    const entry = {
      id: uuid(), content,
      tags: Array.isArray(tags) ? tags : (tags||"").split(',').map(t=>t.trim()).filter(Boolean),
      created: now(), importance: 1
    };
    await db.put('global_memory', entry);
    state.globalMemories.push(entry);
    renderMemoryList();
    return entry;
  },
  getAll: async () => {
    state.globalMemories = await db.getAll('global_memory') || [];
    renderMemoryList();
  },
  clear: async () => {
    const all = await db.getAll('global_memory') || [];
    for (const m of all) await db.delete('global_memory', m.id);
    state.globalMemories = [];
    renderMemoryList();
    toast("Mémoire globale effacée", "success");
  },
  getRelevant: (query, limit = 5) => {
    if (!state.globalMemories?.length) return [];
    const q = query.toLowerCase();
    return state.globalMemories
      .map(m => ({ ...m, score:(m.content.toLowerCase().includes(q)?2:0) + ((m.tags||[]).some(t=>q.includes(t.toLowerCase()))?1:0) + (m.importance||1) }))
      .filter(m => m.score > 0)
      .sort((a,b) => b.score - a.score)
      .slice(0, limit)
      .map(m => `[MEM:${(m.tags||[]).join(',')}] ${m.content}`);
  }
};

function renderMemoryList() {
  const list = $("#memory-list");
  if (!state.globalMemories?.length) {
    list.innerHTML = '<div style="color:var(--text-dim);font-family:var(--font-mono);font-size:11px;padding:8px 0">Aucune mémoire enregistrée</div>';
    return;
  }
  list.innerHTML = state.globalMemories.slice(-12).reverse().map(m => `
    <div class="memory-item">
      <div class="content">${escapeHtml(m.content)}</div>
      <div class="actions"><button data-action="delete-memory" data-id="${m.id}">✕</button></div>
    </div>
  `).join('');
}
async function memoryDelete(id) {
  await db.delete('global_memory', id);
  state.globalMemories = state.globalMemories.filter(m => m.id !== id);
  renderMemoryList();
};

function copyMsg(ts) {
  const el = document.getElementById('mc-' + ts);
  if (!el) return;
  const text = el.innerText || el.textContent;
  navigator.clipboard.writeText(text).then(() => toast("Message copié !", "success")).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
    toast("Message copié !", "success");
  });
};

async function saveToMemory(ts) {
  const el = document.getElementById('mc-' + ts);
  if (!el) return;
  const text = (el.innerText || el.textContent).slice(0, 200);
  await memory.add(text);
  toast("Ajouté à la mémoire globale", "success");
};

// ════════════════════════════════════════
// EDIT / REGENERATE MESSAGES
// ════════════════════════════════════════
function editMessage(ts) {
  const tsNum = parseInt(ts);
  const idx = state.messages.findIndex(m => m.ts === tsNum);
  if (idx === -1) return;
  const msg = state.messages[idx];
  if (msg.role !== 'user') return;

  // Mettre le texte dans l'input
  const input = document.getElementById('user-input');
  input.value = msg.content;
  
  // Restaurer les fichiers attachés si présents
  if (msg.attachedFiles && msg.attachedFiles.length > 0) {
    state.attachedFiles = [...msg.attachedFiles];
    updateFilePreview();
  } else if (msg.documentName && msg.documentContext) {
    // Rétrocompatibilité
    let rawData = msg.documentContext.replace(`[CONTENU DU DOCUMENT "${msg.documentName}"]\n\n`, '').replace(`\n\n[FIN DU DOCUMENT]`, '');
    state.attachedFiles = [{ type: 'document', name: msg.documentName, data: rawData }];
    updateFilePreview();
  }

  autoResizeTextarea();
  input.focus();

  // Supprimer ce message et tous les suivants
  state.messages = state.messages.slice(0, idx);
  renderMessages(true);
  saveChat();
  toast("Message restauré — modifiez et renvoyez", "info");
}

async function regenerateMessage(ts) {
  if (state.isGenerating) return;
  const tsNum = parseInt(ts);
  const idx = state.messages.findIndex(m => m.ts === tsNum);
  if (idx === -1) return;
  const msg = state.messages[idx];
  if (msg.role !== 'assistant') return;

  // Trouver le dernier message user avant cette réponse
  let userIdx = idx - 1;
  while (userIdx >= 0 && state.messages[userIdx].role !== 'user') userIdx--;
  if (userIdx < 0) { toast("Aucun message utilisateur trouvé", "error"); return; }

  const userMsg = state.messages[userIdx];

  // Supprimer la réponse assistant (et tout ce qui suit)
  state.messages = state.messages.slice(0, idx);
  renderMessages(true);

  // Remettre le texte dans l'input et renvoyer
  document.getElementById('user-input').value = userMsg.content;

  // Restaurer les fichiers attachés si présents
  if (userMsg.attachedFiles && userMsg.attachedFiles.length > 0) {
    state.attachedFiles = [...userMsg.attachedFiles];
    updateFilePreview();
  } else if (userMsg.documentName && userMsg.documentContext) {
    // Rétrocompatibilité
    let rawData = userMsg.documentContext.replace(`[CONTENU DU DOCUMENT "${userMsg.documentName}"]\n\n`, '').replace(`\n\n[FIN DU DOCUMENT]`, '');
    state.attachedFiles = [{ type: 'document', name: userMsg.documentName, data: rawData }];
    updateFilePreview();
  }

  // Retirer aussi le message user pour que sendMessage le recrée
  state.messages = state.messages.slice(0, userIdx);
  renderMessages(true);
  await saveChat();

  // Envoyer
  sendMessage();
}

// ════════════════════════════════════════
// CHAT RENDERING
// ════════════════════════════════════════
function createMessageElement(m) {
  const div = document.createElement("div");
  div.className = `message ${m.role}`;
  const memTags = m.memoryUsed?.length ? `<span class="mem-tag">⬡ MEM×${m.memoryUsed.length}</span>` : '';
  const agentsTags = m.agentsConsulted?.length ? `<span class="mem-tag" style="background:rgba(0,255,157,0.1);color:var(--neon);border-color:rgba(0,255,157,0.3)" title="${m.agentsConsulted.join(', ')}">⚙ ${m.agentsConsulted.length} EXPERTS</span>` : '';
  const workflowTags = m.workflowUsed ? `<span class="mem-tag" style="background:rgba(0,255,157,0.15);color:var(--neon);border-color:rgba(0,255,157,0.4)">🔗 CHAÎNE : ${m.workflowUsed.toUpperCase()}</span>` : '';
  
  let modelTagText = '';
  if (m.modelUsed) {
    const apiConf = getLlmApiConfig(m.modelUsed);
    let providerName = "Mistral API";
    if (apiConf.provider === 'gemini') providerName = "Gemini API";
    else if (apiConf.provider === 'openrouter') providerName = "OpenRouter API";
    modelTagText = `${providerName} • ${m.modelUsed}`;
  }
  const modelTag = modelTagText ? `<span class="mem-tag" style="background:rgba(138,180,248,0.15);color:#8ab4f8;border-color:rgba(138,180,248,0.4)" title="API et Modèle">⚡ ${modelTagText}</span>` : '';
  
  const label = m.role === 'user' ? '▸ VOUS' : `▸ ${
    state.selectedWorkflow ? state.selectedWorkflow.name.toUpperCase() :
    (state.agent && state.agent !== '__ALL_AGENTS__' ? state.agent.name.toUpperCase() :
    (state.agent === '__ALL_AGENTS__' ? 'TOUS LES AGENTS' :
    (state.aiConfig?.name?.toUpperCase() || 'Mon Assistant IA')))
  }`;
  const msgId = m.ts || Date.now();
  const isFcMsg = (m.workflowUsed === 'FC-Fr 1' || m.workflowUsed === 'FC-Fr 2' || m.workflowUsed === 'FC-Ar 1' || m.workflowUsed === 'FC-Ar 2' || m.workflowUsed === 'FC-En 1' || m.workflowUsed === 'FC-En 2');
  const isCorrection = !!m.isCorrection;
  const isMethodeMsg = !!m.isMethode;
  const isQcmContent = m.content && /\[x\]\s*[a-d]-/i.test(m.content);
  const wordBtn = (m.role === 'assistant' && state.agent?.id !== 'default-guide-agent') ? `<button class="msg-action-btn" data-action="export-word" data-id="${msgId}" style="color:#4fc3f7;border-color:rgba(79,195,247,0.4)">${(isCorrection || isMethodeMsg) ? 'Exporter' : t('btn_word')}</button>` : '';
  const qpBtn = (m.role === 'assistant' && !isFcMsg && !isCorrection && state.agent?.id !== 'default-guide-agent' && isQcmContent) ? `<button class="msg-action-btn" data-action="export-qp-modal" data-id="${msgId}" style="color:var(--neon);border-color:rgba(0,255,157,0.3)">${t('btn_convert')}</button>` : '';
  const fcJsonBtn = m.role === 'assistant' && isFcMsg ? `<button class="msg-action-btn" data-action="export-fc-json" data-id="${msgId}" style="color:var(--neon);border-color:rgba(0,255,157,0.3)">⬇️ JSON QR</button>` : '';
  const wqBtn = (m.role === 'assistant' && !isFcMsg && !isCorrection && state.agent?.id !== 'default-guide-agent' && isQcmContent) ? `<button class="msg-action-btn" data-action="test-web-quiz" data-id="${msgId}" style="color:#d4af37;border-color:rgba(212,175,55,0.4)">${t('btn_test_qcm')}</button>` : '';
  const fcPlayerBtn = m.role === 'assistant' && isFcMsg ? `<button class="msg-action-btn" data-action="test-fc-player" data-id="${msgId}" style="color:#f59e0b;border-color:rgba(245,158,11,0.4)">📇 Tester</button>` : '';
  const ratingHtml = m.role === 'assistant' ? `<div class="msg-rating" aria-label="Évaluer la réponse"><span class="rating-label">${t('ui_quality')}</span>${[1,2,3,4,5].map(s => `<button class="rating-star${(m.rating||0)>=s?' active':''}" data-action="rate" data-id="${msgId}" data-score="${s}" title="Noter ${s}/5">★</button>`).join('')}</div>` : '';
  const imgHtml = m.imageData ? `<div class="msg-image"><img src="${m.imageData}" alt="Image jointe" loading="lazy"></div>` : '';
  const audioHtml = m.audioName ? `<div style="font-family:var(--font-mono);font-size:10px;color:var(--text-dim);margin-top:4px">🎵 ${m.audioName}</div>` : '';
  const docHtml = m.documentName ? `<div style="font-family:var(--font-mono);font-size:11px;color:var(--cyan);margin-top:4px;margin-bottom:8px;border:1px solid var(--hud-border);padding:4px 8px;border-radius:4px;display:inline-block;background:rgba(0,229,255,0.05)">${t('ui_attached_doc')} ${m.documentName}</div>` : '';
  
  let displayContent = m.content || '';
  if (m.role === 'assistant') {
    const re = new RegExp('<brouillon(?:_invisible)?>[\\\\s\\\\S]*?(?:<\\\\/brouillon(?:_invisible)?>|$)', 'gi');
    displayContent = displayContent.replace(re, '').trim();
  }
  let finalContent = escapeHtml(displayContent).replace(/\n/g, '<br>');
  if (typeof marked !== 'undefined') {
    const rawHtml = m.role === 'user' ? escapeHtml(displayContent).replace(/\n/g, '<br>') : marked.parse(displayContent);
    finalContent = typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(rawHtml) : rawHtml;
  }

  div.innerHTML = `
    <div class="msg-label">${label}</div>
    ${imgHtml}${audioHtml}${docHtml}
    <div class="message-content msg-content" id="mc-${msgId}">${finalContent}</div>
    <div class="msg-meta">
      <span>${new Date(m.ts).toLocaleTimeString('fr-FR', {hour:'2-digit',minute:'2-digit',second:'2-digit'})}</span>
      ${memTags}
      ${agentsTags}
      ${workflowTags}
      ${modelTag}
    </div>
    ${ratingHtml}
    <div class="msg-actions">
      <button class="msg-action-btn" data-action="copy-msg" data-id="${msgId}">${t('btn_copy')}</button>
      ${m.role === 'user' ? `<button class="msg-action-btn" data-action="edit-msg" data-id="${msgId}">${t('btn_edit')}</button>` : ''}
      ${(m.role === 'assistant' && !isCorrection) ? `<button class="msg-action-btn" data-action="regen-msg" data-id="${msgId}">${t('btn_regen')}</button>` : ''}
      ${wordBtn}
      ${qpBtn}
      ${fcJsonBtn}
      ${wqBtn}
      ${fcPlayerBtn}
    </div>`;
  return div;
}

function renderMessages(forceFull = false) {
  const c = $("#chat-container");
  const msgs = (state.messages || []).filter(m => m.role !== 'system');

  if (!msgs.length) {
    c.innerHTML = `
      <div class="welcome-banner" style="display:flex; flex-direction:column; align-items:center; justify-content:center; flex:1; min-height:50vh; text-align:center; opacity:0.9; padding:20px; width:100%;">
        <h2 style="font-size:32px; font-weight:bold; color:var(--cyan); margin-bottom:8px;">Mon Assistant IA</h2>
        <div style="color:#d4af37; font-size:14px; font-weight:600; margin-bottom:24px; letter-spacing:1px; text-transform:uppercase;">D&eacute;velopp&eacute; par Hassan Bertane</div>
        <p style="max-width:500px; color:var(--on-surface-variant); font-size:16px; line-height:1.6;">${t('ui_welcome') || 'Interface avancée avec mémoire globale, agents spécialisés et accès aux modèles Mistral AI.'}</p>
      </div>
    `;
    return;
  }

  if (c.querySelector('.welcome-banner')) {
    c.innerHTML = '';
  }

  const existingMessages = c.querySelectorAll('.message').length;

  if (forceFull || existingMessages > msgs.length || existingMessages === 0) {
    c.innerHTML = '';
    msgs.forEach(m => c.appendChild(createMessageElement(m)));
  } else {
    for (let i = existingMessages; i < msgs.length; i++) {
      c.appendChild(createMessageElement(msgs[i]));
    }
  }
  
  c.scrollTop = c.scrollHeight;
}

function showTyping(modelId = '') {
  let statusText = '';
  const actualModel = modelId || state.model || "mistral-large-2512";
  const apiConf = getLlmApiConfig(actualModel);
  
  let providerName = "Mistral API";
  if (apiConf.provider === 'gemini') providerName = "Gemini API";
  else if (apiConf.provider === 'openrouter') providerName = "OpenRouter API";
  
  statusText = `⚡ ${providerName} (${actualModel})`;
  
  const div = document.createElement("div");
  div.className = "typing-indicator";
  div.id = "typing-indicator";
  // On place directement les éléments comme enfants pour respecter le CSS .typing-indicator (display: flex)
  div.innerHTML = `<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div><div id="orchestrator-status" style="margin-left:8px;font-family:monospace;font-size:12px;color:#8ab4f8;font-weight:bold;white-space:nowrap;">${statusText}</div>`;
  $("#chat-container").appendChild(div);
  $("#chat-container").scrollTop = $("#chat-container").scrollHeight;
}
function hideTyping() {
  const t = $("#typing-indicator");
  if (t) t.remove();
}

/**
 * Gère la lecture du flux (SSE) provenant de l'API Mistral
 */
async function handleStreamingResponse(response, onChunk, onFinish, signal) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullContent = "";
  let aborted = false;

  // Écouter l'abort pour fermer le reader
  if (signal) {
    signal.addEventListener('abort', () => {
      aborted = true;
      reader.cancel().catch(() => {});
    }, { once: true });
  }

  try {
    while (true) {
      if (aborted) break;
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n");
      
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const dataStr = line.slice(6).trim();
          if (dataStr === "[DONE]") continue;
          
          try {
            const data = JSON.parse(dataStr);
            const delta = data.choices?.[0]?.delta?.content || "";
            if (delta) {
              fullContent += delta;
              onChunk(fullContent);
            }
          } catch (e) {
            // Ignorer les fragments JSON partiels
          }
        }
      }
    }
  } catch(e) {
    if (e.name === 'AbortError' || aborted) {
      // Propager l'erreur pour arrêter la chaîne d'exécution (workflows, agents)
      throw new DOMException('Aborted', 'AbortError');
    } else {
      throw e;
    }
  } finally {
    try { reader.releaseLock(); } catch(e) {}
  }
  onFinish(fullContent);
  return fullContent;
}

/**
 * Traducteur Universel : route la requête soit vers OpenAI (Mistral/OpenRouter), soit vers Gemini.
 * @param {Object} reqBody - Requête au format OpenAI/Mistral (model, messages, stream...)
 * @param {AbortSignal} signal - Signal d'annulation
 * @param {Function} onChunk - Callback pour le flux
 * @param {Function} onFinish - Callback de fin
 */
async function universalFetchLlmStream(reqBody, signal, onChunk, onFinish) {
  const apiConf = getLlmApiConfig(reqBody.model);

  if (apiConf.provider === "gemini") {
    // ── TRADUCTION MISTRAL -> GEMINI ──
    const geminiPayload = {
      contents: [],
      generationConfig: {
        temperature: reqBody.temperature ?? 0.4,
        maxOutputTokens: reqBody.max_tokens ?? 8192
      }
    };

    let systemText = "";
    for (const m of reqBody.messages) {
      if (m.role === "system") {
        systemText += m.content + "\n";
        const role = m.role === "assistant" ? "model" : "user";
        
        let parts = [];
        if (Array.isArray(m.content)) {
          parts = m.content.map(p => {
            if (p.type === "text") return { text: p.text };
            if (p.type === "image_url") {
              const b64 = p.image_url.url.split(',')[1];
              const mime = p.image_url.url.split(';')[0].split(':')[1];
              return { inlineData: { mimeType: mime, data: b64 } };
            }
            return { text: "" };
          });
        } else {
          parts = [{ text: m.content }];
        }
        
        // ── INJECTION DOCUMENT NATIF (PDF/Docx) ──
        if (reqBody.rawDocuments && reqBody.rawDocuments.length > 0) {
          // On ajoute les documents natifs à ce message s'il est de type "user"
          // et qu'il est le dernier de la liste (ou le plus pertinent)
          if (role === "user") {
            reqBody.rawDocuments.forEach(doc => {
              if (doc.data && doc.mimeType) {
                 parts.unshift({ inlineData: { mimeType: doc.mimeType, data: doc.data } });
              }
            });
            // On ne les ajoute qu'une seule fois pour éviter les duplicatas
            delete reqBody.rawDocuments;
          }
        }

        geminiPayload.contents.push({ role, parts });
      }
    }
    
    if (systemText) {
      geminiPayload.systemInstruction = { parts: [{ text: systemText.trim() }] };
    }

    const res = await fetchWithRetry(apiConf.url, {
      method: "POST",
      headers: apiConf.headers,
      signal: signal,
      body: JSON.stringify(geminiPayload)
    });

    if (!res.ok) {
      const errText = await res.text();
      let errMsg = errText.slice(0, 300);
      try { const j = JSON.parse(errText); errMsg = j.error?.message || errMsg; } catch(e) {}
      throw new Error(`Gemini API: ${errMsg}`);
    }

    if (!reqBody.stream) {
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      if (onChunk) onChunk(text);
      if (onFinish) onFinish(text);
      return text;
    }

    // ── STREAMING GEMINI SSE ──
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = "";
    let aborted = false;
    if (signal) {
      signal.addEventListener('abort', () => {
        aborted = true;
        reader.cancel().catch(() => {});
      }, { once: true });
    }

    try {
      while (true) {
        if (aborted) break;
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");
        
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const dataStr = line.slice(6).trim();
            if (dataStr === "[DONE]") continue;
            try {
              const data = JSON.parse(dataStr);
              const delta = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
              if (delta) {
                fullContent += delta;
                if (onChunk) onChunk(fullContent);
              }
            } catch (e) {}
          }
        }
      }
    } catch(e) {
      if (e.name === 'AbortError' || aborted) {
        throw new DOMException('Aborted', 'AbortError');
      } else {
        throw e;
      }
    }
    if (onFinish) onFinish(fullContent);
    return fullContent;

  } else {
    // ── STANDARD OPENAI (Mistral / OpenRouter) ──
    // Pour Mistral, on nettoie `rawDocuments` car il ne les supporte pas,
    // mais on s'assure que le fallback texte est bien dans `messages`.
    delete reqBody.rawDocuments;
    
    const res = await fetchWithRetry(apiConf.url, {
      method: "POST",
      headers: apiConf.headers,
      signal: signal,
      body: JSON.stringify(reqBody)
    });

    if (!res.ok) {
      const err = await res.text();
      let errMsg = err.slice(0, 300);
      try { const j = JSON.parse(err); errMsg = j.message || j.error?.message || errMsg; } catch(e) {}
      throw new Error(errMsg);
    }

    if (!reqBody.stream) {
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content || "";
      if (onChunk) onChunk(text);
      if (onFinish) onFinish(text);
      return text;
    }

    let finalResult = "";
    await handleStreamingResponse(res, (chunk) => {
      finalResult = chunk;
      if (onChunk) onChunk(chunk);
    }, () => {}, signal);
    if (onFinish) onFinish(finalResult);
    return finalResult;
  }
}


function updateLiveMessage(content) {
  const lastMsg = state.messages[state.messages.length - 1];
  if (lastMsg && lastMsg.role === 'assistant') {
    lastMsg.content = content;
    const container = $("#chat-container");
    // On cherche le dernier élément '.message' au lieu du lastElementChild strict (qui pourrait être le typing-indicator)
    const messageElements = container.querySelectorAll('.message.assistant');
    const lastEl = messageElements[messageElements.length - 1];
    if (lastEl) {
      const contentEl = lastEl.querySelector('.message-content');
      if (contentEl) {
        const displayContent = (content || '').replace(/<brouillon>[\s\S]*?(?:<\/brouillon>|$)/gi, '').trim();
        const rawHtml = marked.parse(displayContent);
        contentEl.innerHTML = typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(rawHtml) : rawHtml;
      }
    }
    container.scrollTop = container.scrollHeight;
  }
}

// ════════════════════════════════════════
// SYSTEM PROMPT
// ════════════════════════════════════════
function buildSystemPrompt() {
  const aiName = state.aiConfig?.name || 'Mon Assistant IA';
  let prompt = `You are ${aiName}, a powerful AI assistant. Be precise, professional, and helpful.`;
  const isRealAgent = state.agent && state.agent !== '__ALL_AGENTS__';
  if (isRealAgent) {
    prompt = `[AGENT ${aiName} : ${state.agent.name}]\n`;
    prompt += `Rôle : ${state.agent.desc || ''}`;
    if (state.agent.instructions) prompt += `\n\nInstructions : ${state.agent.instructions}`;
    if (state.agent.primer) prompt += `\n\nContexte initial : ${state.agent.primer}`;
    if (state.agent.style) {
      const styleMap = {concis:'Réponds de manière concise et directe.',detaille:'Réponds de manière exhaustive et détaillée.',formel:'Maintiens un ton formel et professionnel.',creatif:'Sois créatif et innovant dans tes réponses.',pedagogique:'Adopte une approche pédagogique et claire.'};
      if (styleMap[state.agent.style]) prompt += `\n\nStyle : ${styleMap[state.agent.style]}`;
    }
    if (state.agent.forbidden) prompt += `\n\nINTERDIT DE : ${state.agent.forbidden}`;
  }
  const memPrio = isRealAgent ? (state.agent?.memPrio || 3) : 3;
  const memLimit = Math.min(memPrio * 2, 8);
  const rel = memory.getRelevant("context", memLimit);
  if (rel.length) prompt += `\n\n[MÉMOIRE GLOBALE ACTIVE]\n${rel.join('\n')}`;

  // ── Injection des leçons d'apprentissage (agent direct) ──
  if (isRealAgent && state.agent.id && state._agentLessonsCache) {
    prompt += state._agentLessonsCache;
  }

  prompt += "\n\nRéponds dans la langue de l'utilisateur. Sois précis, structuré et professionnel.";
  return prompt;
}

function updateContextMeter() {
  try {
    const msgs = (state.messages||[]).slice(-22);
    const totalChars = msgs.reduce((s,m) => s + (m.content||'').length, 0);
    const model = MODELS.find(m => m.id === state.model);
    const maxCtx = (model?.tokens || 50000) * 4; // rough chars
    const pct = Math.min(100, Math.round((totalChars / maxCtx) * 100));
    const bar = document.getElementById('context-bar');
    const label = document.getElementById('context-label');
    if (bar && label) {
      bar.style.width = pct + '%';
      bar.className = 'context-bar-fill' + (pct > 80 ? ' danger' : pct > 60 ? ' warn' : '');
      label.textContent = pct + '%';
    }
  } catch(e) {}
}

function estimateTokens(text) {
  // Approximation standard : 1 token ≈ 4 caractères (latins), ≈2 chars (CJK)
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

function updateTokenCounter() {
  const el = document.getElementById('token-counter');
  if (!el) return;
  const input = document.getElementById('user-input');
  const inputText = input?.value || '';
  const inputTokens = estimateTokens(inputText);

  // Contexte = messages récents + system prompt
  const contextMsgs = (state.messages||[]).slice(-22);
  const contextChars = contextMsgs.reduce((s,m) => s + (m.content||'').length, 0);
  const contextTokens = estimateTokens(Array(contextChars).fill('a').join(''));

  // Document attaché
  const docTokens = state.attachedFiles.filter(f => f.type === 'document').reduce((sum, f) => sum + estimateTokens(f.data || ''), 0);

  const totalTokens = inputTokens + contextTokens + docTokens;
  const model = MODELS.find(m => m.id === state.model);
  const maxTokens = model?.tokens || 32000;
  const pct = Math.round((totalTokens / maxTokens) * 100);

  if (inputTokens === 0 && docTokens === 0) {
    el.style.display = 'none';
    return;
  }

  el.style.display = 'flex';
  const warnClass = pct > 80 ? 'token-danger' : pct > 60 ? 'token-warn' : '';
  el.className = `token-counter ${warnClass}`;
  el.innerHTML = `<span>◨ ~${totalTokens.toLocaleString()} tokens</span><span>${pct}% du contexte${docTokens ? ` (doc: ~${docTokens.toLocaleString()})` : ''}</span>`;
}

// ════════════════════════════════════════
// ARCHIVES
// ════════════════════════════════════════
let archivesSearchQuery = "";

async function renderArchives() {
  const list = $("#archives-list");
  if (!list) return;
  try {
    let chats;
    if (archivesSearchQuery) {
      // Chargement complet si on cherche dans le contenu
      chats = await db.getAll('chats') || [];
    } else {
      // Chargement ultra-leger par defaut
      chats = await db.getChatsMetadata() || [];
    }
    chats = chats.sort((a, b) => (b.updated||0) - (a.updated||0));
    if (archivesSearchQuery) {
      const q = archivesSearchQuery.toLowerCase();
      chats = chats.filter(c => (c.title||"").toLowerCase().includes(q) ||
        (c.messages||[]).some(m => (m.content||"").toLowerCase().includes(q)));
    }
    if (!chats.length) {
      list.innerHTML = '<div class="archive-empty">Aucune conversation trouvée</div>';
      return;
    }
    list.innerHTML = chats.map(c => {
      const isActive = c.id === state.chatId;
      const isFav = c.fav ? true : false;
      const msgCount = c.msgCount !== undefined ? c.msgCount : (c.messages||[]).filter(m=>m.role!=='system').length;
      const date = c.updated ? new Date(c.updated).toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : '';
      return `<div class="archive-item${isActive?' active-chat':''}" data-action="load-chat" data-id="${c.id}">
        <span class="archive-item-icon">${isFav?'★':'◈'}</span>
        <div class="archive-item-content">
          <div class="archive-item-title">${escapeHtml(c.title||'Sans titre')}</div>
          <div class="archive-item-meta">
            <span>${msgCount} msg</span>
            <span>${date}</span>
          </div>
        </div>
        <button class="archive-fav-btn${isFav?' fav':''}" data-action="toggle-fav" data-id="${c.id}" title="${isFav?'Retirer favoris':'Ajouter favoris'}">${isFav?'★':'☆'}</button>
        <button class="archive-item-del" data-action="delete-chat" data-id="${c.id}" title="Supprimer">✕</button>
      </div>`;
    }).join('');
  } catch(e) { list.innerHTML = '<div class="archive-empty">Erreur de chargement</div>'; }
}

// closeArchivesPanel - accessible globalement
function closeArchivesPanel() {
  const panel = document.getElementById('archives-panel');
  if (panel) {
    panel.classList.remove('active');
    panel.style.display = "none";
    document.body.style.overflow = 'auto';
  }
}

async function loadArchiveChat(id) {
  await loadChat(id);
  closeArchivesPanel();
  await renderArchives();
  toast("Conversation chargée", "success");
};

async function deleteArchiveChat(id) {
  if (!confirm("Supprimer cette conversation ?")) return;
  await db.delete('chats', id);
  if (state.chatId === id) await newChat();
  await renderArchives();
  toast("Conversation supprimée", "success");
};

async function toggleFav(id) {
  try {
    const chat = await db.get('chats', id);
    if (!chat) return;
    chat.fav = !chat.fav;
    await db.put('chats', chat);
    await renderArchives();
  } catch(e) {}
};

// ════════════════════════════════════════
// SAVE / LOAD CHAT
// ════════════════════════════════════════
async function saveChat() {
  if (!state.chatId) return;
  try {
    const existingChat = await db.get('chats', state.chatId).catch(() => null);
    await db.put('chats', {
      id: state.chatId,
      model: state.model,
      agentId: state.agent?.id,
      workflowId: state.selectedWorkflow?.id,
      messages: state.messages,
      title: (state.messages||[]).slice(1).find(m=>m.role==='user')?.content?.slice(0,50) || "Nouvelle conversation",
      updated: now(),
      fav: existingChat?.fav || false
    });
    renderArchives();
  } catch(e) { console.error("saveChat:", e); }
}

async function newChat() {
  state.chatId = uuid();
  if (!state.agent && !state.selectedWorkflow) {
    try {
      const wf = await db.get('workflows', 'wf-qcm-fondamentaux');
      if (wf) {
        state.selectedWorkflow = wf;
        state.agent = null;
        if ($("#agent-select")) $("#agent-select").value = '__WF__wf-qcm-fondamentaux';
      }
    } catch(e) {}
  }
  state.messages = [{ role:"system", content:buildSystemPrompt(), ts:now() }];
  await saveChat();
  try { await db.put('settings', { id:'currentChatId', value:state.chatId }); } catch(e) {}
  renderMessages();
}

async function loadChat(id) {
  try {
    const chat = await db.get('chats', id);
    if (!chat) return;
    state.chatId = id;
    state.messages = chat.messages || [];
    state.model = chat.model || state.model;
    $("#model-select").value = state.model;
    if (chat.agentId) {
      try {
        const ag = await db.get('agents', chat.agentId);
        if (ag) { 
          state.agent = ag; 
          state.selectedWorkflow = null;
          $("#agent-select").value = ag.id; 
          // Load lessons for the restored agent
          try {
            const lessons = await agentFeedback.getForAgent(ag.id, 8);
            state._agentLessonsCache = agentFeedback.buildLessonsPrompt(lessons);
          } catch(e) { state._agentLessonsCache = ''; }
        }
      } catch(e) {}
    } else if (chat.workflowId) {
      try {
        const wf = await db.get('workflows', chat.workflowId);
        if (wf) {
          state.selectedWorkflow = wf;
          state.agent = null;
          $("#agent-select").value = '__WF__' + wf.id;
        }
      } catch(e) {}
    } else {
      try {
        const wf = await db.get('workflows', 'wf-qcm-fondamentaux');
        if (wf) {
          state.selectedWorkflow = wf;
          state.agent = null;
          $("#agent-select").value = '__WF__wf-qcm-fondamentaux';
        }
      } catch(e) {}
    }
    renderMessages(true);
  } catch(e) { console.error("loadChat:", e); }
}

// ════════════════════════════════════════
// SEND MESSAGE
// ════════════════════════════════════════
async function _sendMessageOriginal() {
  const txt = $("#user-input").value.trim();
  if (!txt) return;
  const activeModelForCheck = state.model || '';
  const isGeminiModel = activeModelForCheck.includes('gemini');
  const isOpenRouterModel = activeModelForCheck.includes('deepseek') || activeModelForCheck.includes('openrouter');
  if (!state.apiKey && !isGeminiModel && !isOpenRouterModel) {
    toast("Configurez votre clé API d'abord", "error");
    $("#api-modal").classList.add("active");
    return;
  }
  if (isGeminiModel && !state.geminiApiKey) {
    toast("Clé API Gemini requise. Configurez-la dans Paramètres API.", "error");
    $("#api-modal").classList.add("active");
    return;
  }
  if (isOpenRouterModel && !state.openRouterApiKey) {
    toast("Clé API OpenRouter requise. Configurez-la dans Paramètres API.", "error");
    $("#api-modal").classList.add("active");
    return;
  }

  let userText = txt;
  const isQcmAgent = state.agent && (
    state.agent.name.toLowerCase().includes('qcm') || 
    state.agent.id.toLowerCase().includes('qcm') || 
    (state.agent.tags && state.agent.tags.some(t => t.toLowerCase().includes('qcm')))
  );

  if (isQcmAgent) {
    // ── Génération des séquences QCM (post-processing JS) ──
    window.__qcmSequences = [generateQcmSequenceArray(15), generateQcmSequenceArray(15)];
    userText += `\n\n[INSTRUCTION SYSTÈME DYNAMIQUE INVISIBLE] RÈGLE ABSOLUE pour le placement de la bonne réponse :
Tu DOIS TOUJOURS placer la bonne réponse en position a- avec le marqueur [x].
Le format OBLIGATOIRE pour CHAQUE question est :
[numéro]- Énoncé ?
[x] a- LA BONNE RÉPONSE ICI (TOUJOURS en a-)
b- Distracteur 1
c- Distracteur 2
d- Distracteur 3
Le système se chargera automatiquement de mélanger les positions. Toi, tu mets TOUJOURS [x] a- pour la bonne réponse.`;
  }
  const msgObj = { role:"user", content:userText, ts:now() };
  let _rawDocuments = [];
  if (state.attachedFiles && state.attachedFiles.length > 0) {
     const docs = state.attachedFiles.filter(f => f.type === 'document');
     if (docs.length > 0) {
       msgObj.documentContext = docs.map(f => `[CONTENU DU DOCUMENT "${f.name}"]\n\n${f.data}\n\n[FIN DU DOCUMENT]`).join('\n\n');
       msgObj.documentName = docs.map(f => f.name).join(', ');
       // Capture les fichiers bruts pour injection native Gemini
       _rawDocuments = docs.filter(f => f.rawBase64 && f.mimeType).map(f => ({ data: f.rawBase64, mimeType: f.mimeType, name: f.name }));
     }
     msgObj.attachedFiles = [...state.attachedFiles];
     clearAttachedFile();
  }
  state.messages.push(msgObj);
  renderMessages();
  $("#user-input").value = "";
  autoResizeTextarea();
  state.isGenerating = true;
  state.abortController = new AbortController();
  $("#send-btn").disabled = false;
  $("#send-btn").className = 'stop-btn';
  $("#send-btn").innerHTML = '⏹ ARRÊTER';
  const agentModel = state.agent?.modelPref || state.model;
  showTyping(agentModel);
  await saveChat();

  const relevantMems = memory.getRelevant(txt, 4);

  // Préparer le message de l'assistant vide pour le streaming
  const assistantMsgId = now();
  state.messages.push({ role: "assistant", content: "", ts: assistantMsgId, memoryUsed: relevantMems.length ? relevantMems : undefined, modelUsed: state.agent?.modelPref || state.model });
  renderMessages();

  try {
    // slice(0,-1) exclut le message assistant vide ajouté pour le streaming
    const contextMessages = [
      { role:"system", content:buildSystemPrompt() },
      ...(state.messages||[]).slice(0, -1).filter(m => m.role !== 'system').slice(-22).map(m => {
        let contentStr = m.content;
        if (m.documentContext) {
           contentStr = `${m.documentContext}\n\n${m.content || "Analyse le document fourni."}`;
        }
        return { role: m.role, content: contentStr };
      })
    ];
    if (relevantMems.length) {
      contextMessages.splice(1, 0, {
        role:"user",
        content:`[Contexte depuis la mémoire globale]\n${relevantMems.join('\n')}\n\nContinuez la conversation :`
      });
    }

    // ── RAPPEL FORT DES LEÇONS (Biais de Récence) ──
    const isRealAgent = state.agent && state.agent !== '__ALL_AGENTS__';
    if (isRealAgent && state._agentLessonsCache) {
      const lastUserMsg = contextMessages.findLast(m => m.role === 'user');
      if (lastUserMsg) {
        lastUserMsg.content += `\n\n[RAPPEL CRITIQUE - LIS CECI AVANT DE RÉPONDRE]\n${state._agentLessonsCache}`;
      }
    }

    const activeModelId = (isRealAgent && state.agent.modelPref && state.agent.modelPref !== '') ? state.agent.modelPref : state.model;
    const model = MODELS.find(m => m.id === activeModelId) || MODELS[0];

    updateContextMeter();
    const agentTemp = (isRealAgent && state.agent.temperature !== undefined) ? state.agent.temperature : model.temp;
    const agentMaxTok = (isRealAgent && state.agent.maxTokens) ? state.agent.maxTokens : 8192;

    // ════════════════════════════════════════
    // ORCHESTRATION MULTI-AGENTS (uniquement si activée)
    // ════════════════════════════════════════
    const orchestrationMode = state.agent === '__ALL_AGENTS__';
    const allAgents = orchestrationMode ? (await db.getAll('agents') || []) : [];

    if (orchestrationMode && allAgents.length > 0) {
      // ── PHASE 1 : Consultation de TOUS les agents en parallèle ──
      const statusEl = document.getElementById("orchestrator-status");
      if (statusEl) statusEl.textContent = `⚙ Consultation de ${allAgents.length} experts…`;

      const recentContext = (state.messages || []).slice(0, -1).filter(m => m.role !== 'system').slice(-6);

      // On lance les appels par lots de 3 pour ne pas surcharger l'API
      const BATCH_SIZE = 3;
      const expertResults = [];

      for (let i = 0; i < allAgents.length; i += BATCH_SIZE) {
        const batch = allAgents.slice(i, i + BATCH_SIZE);

        // Mise à jour visuelle : afficher les noms des agents en cours
        if (statusEl) {
          const names = batch.map(a => a.name).join(', ');
          statusEl.textContent = `⚙ ${names}… (${Math.min(i + BATCH_SIZE, allAgents.length)}/${allAgents.length})`;
        }

        const batchPromises = batch.map(agent => callSubAgentDirect(agent, txt, recentContext));
        const batchResults = await Promise.allSettled(batchPromises);

        batchResults.forEach((result, idx) => {
          const agent = batch[idx];
          const response = result.status === 'fulfilled' ? result.value : `[Erreur : ${result.reason}]`;
          // On ne garde que les réponses substantielles (pas les erreurs vides)
          if (response && response.length > 10 && !response.startsWith('Erreur')) {
            expertResults.push({ name: agent.name, desc: agent.desc, response });
          }
        });
      }

      // Mise à jour du message avec les agents consultés
      const lastMsg = state.messages[state.messages.length - 1];
      lastMsg.agentsConsulted = expertResults.map(r => r.name);

      // ── PHASE 2 : Synthèse par l'agent principal (Streamée) ──
      if (statusEl) statusEl.textContent = `✦ Synthèse de ${expertResults.length} expertises…`;

      const aiName = state.aiConfig?.name || 'Mon Assistant IA';
      const expertBlock = expertResults.map((r, i) => `━━━ EXPERT ${i+1} : ${r.name} ━━━\n${r.response}`).join('\n\n');

      const synthesisMessages = [
        { role: "system", content: `Tu es ${aiName}. Synthétise les réponses de tes experts en une réponse unique et parfaite. Ne mentionne pas les experts.` },
        { role: "user", content: `Question : "${txt}"\n\nRéponses experts :\n${expertBlock}` }
      ];

      const _apiConf = getLlmApiConfig(activeModelId || state.model);
      const res = await fetchWithRetry(_apiConf.url, {
        method: "POST",
        headers: _apiConf.headers,
        signal: state.abortController?.signal,
        body: JSON.stringify({
          model: activeModelId || state.model,
          messages: synthesisMessages,
          temperature: agentTemp,
          max_tokens: agentMaxTok,
          stream: true,
          top_p: 0.95
        })
      });

      if (!res.ok) {
        const err = await res.text();
        let errMsg = err.slice(0, 300);
        try { const j = JSON.parse(err); errMsg = j.message || j.error?.message || errMsg; } catch(e) {}
        throw new Error(errMsg);
      }

      await handleStreamingResponse(res, updateLiveMessage, () => {}, state.abortController?.signal);
      
      const finalMsg = state.messages[state.messages.length - 1];
      if (finalMsg && finalMsg.role === 'assistant' && finalMsg.content.match(/\[EXPORT_WORD\]/i)) {
        finalMsg.content = finalMsg.content.replace(/\[EXPORT_WORD\]/ig, '').trim();
        exportToWord(finalMsg.content, `Export_Synthesis_${Date.now()}.doc`);
        finalMsg.content += "\n\n*(📄 Fichier Word généré automatiquement)*";
      }
      // Restore QCM shuffle to guarantee randomness
      if (finalMsg && finalMsg.role === 'assistant' && finalMsg.content) {
        const seq = generateQcmSequenceArray();
        finalMsg.content = shuffleQcmOptions(finalMsg.content, seq);
      }

      hideTyping();
      await saveChat();
    } else {
      // ── APPEL UNIVERSEL : supporte Mistral, Gemini, OpenRouter ──
      const reqBodyUniversal = {
        model: activeModelId || state.model,
        messages: contextMessages,
        temperature: agentTemp,
        max_tokens: agentMaxTok,
        stream: true,
        top_p: 0.95,
        rawDocuments: _rawDocuments
      };
      await universalFetchLlmStream(
        reqBodyUniversal,
        state.abortController?.signal,
        updateLiveMessage,
        () => {}
      );
      
      const lastMsg = state.messages[state.messages.length - 1];
      if (lastMsg && lastMsg.role === 'assistant' && lastMsg.content.match(/\[EXPORT_WORD\]/i)) {
        lastMsg.content = lastMsg.content.replace(/\[EXPORT_WORD\]/ig, '').trim();
        exportToWord(lastMsg.content, `Export_Agent_${Date.now()}.doc`);
        lastMsg.content += "\n\n*(📄 Fichier Word généré automatiquement)*";
      }
      // Restore QCM shuffle to guarantee randomness
      if (lastMsg && lastMsg.role === 'assistant' && lastMsg.content) {
        const seq = generateQcmSequenceArray();
        lastMsg.content = shuffleQcmOptions(lastMsg.content, seq);
      }

      hideTyping();
      await saveChat();
    }
  } catch (e) {
    if (e.name === 'AbortError') {
      // Génération stoppée par l'utilisateur — on garde le contenu partiel
      hideTyping();
      const lastMsg = state.messages[state.messages.length - 1];
      if (lastMsg && lastMsg.role === 'assistant' && lastMsg.content) {
        lastMsg.content += '\n\n*— Génération interrompue —*';
      } else if (lastMsg && lastMsg.role === 'assistant') {
        lastMsg.content = '*— Génération interrompue —*';
      }
      renderMessages(true);
      await saveChat();
      toast("Génération stoppée", "info");
    } else {
      let errMsg = e.message?.slice(0, 300) || String(e);
      hideTyping();
      toast(`Erreur API : ${errMsg}`, "error");
      state.messages[state.messages.length - 1].content = `⚠ Requête échouée : ${errMsg}`;
      renderMessages();
    }
  } finally {
    state.isGenerating = false;
    state.abortController = null;
    $("#send-btn").disabled = false;
    $("#send-btn").className = '';
    $("#send-btn").innerHTML = "ENVOYER ▶";
  }
}

// Fonction de recherche web (Wikipedia) pour les agents
async function searchWikipedia(query) {
  try {
    const res = await fetch(`https://fr.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&utf8=&format=json&origin=*`);
    if (!res.ok) return "Erreur réseau Wikipedia.";
    const data = await res.json();
    if (data.query && data.query.search && data.query.search.length > 0) {
      return data.query.search.slice(0, 3).map((s, i) => `Source ${i+1} (${s.title}): ` + s.snippet.replace(/<[^>]*>?/gm, '')).join('\n---\n');
    }
    return "Aucun résultat pertinent trouvé sur Wikipedia.";
  } catch (e) {
    return `Erreur lors de la recherche Wikipedia: ${e.message}`;
  }
}

// Fonction pour interroger un agent spécifique en arrière-plan (version directe avec objet agent)
async function callSubAgentDirect(agent, userQuestion, recentMessages, abortSignal = null, onChunk = null, images = [], rawDocuments = []) {
  let systemPrompt = `Tu es l'agent expert : ${agent.name}.\nRôle : ${agent.desc || 'Assistance experte'}\n`;
  systemPrompt += `Réponds toujours dans la langue de l'utilisateur.\n`;
  if (agent.primer) systemPrompt += `\nContexte initial : ${agent.primer}\n`;
  if (agent.forbidden) systemPrompt += `\nINTERDIT DE : ${agent.forbidden}\n`;
  if (agent.instructions) {
    systemPrompt += `\nINSTRUCTIONS STRICTES À SUIVRE À LA LETTRE :\n${agent.instructions}\n`;
  }

  // ── Injection des leçons d'apprentissage ──
  try {
    const lessons = await agentFeedback.getForAgent(agent.id, 8);
    const lessonsBlock = agentFeedback.buildLessonsPrompt(lessons);
    if (lessonsBlock) systemPrompt += lessonsBlock;
  } catch(e) { /* silently ignore if feedback DB not ready */ }

  const historyContext = recentMessages
    .filter(m => m.content && m.content.length > 0)
    .slice(-4)
    .map(m => `${m.role === 'user' ? 'Utilisateur' : 'IA'}: ${(m.content || '').slice(0, 300)}`)
    .join('\n');

  let prompt = "";
  if (historyContext) {
    prompt += `[Historique récent]\n${historyContext}\n\n`;
  }
  prompt += userQuestion;

  // Injection forcée à la toute fin (biais de récence)
  try {
    const lessons = await agentFeedback.getForAgent(agent.id, 8);
    const lessonsBlock = agentFeedback.buildLessonsPrompt(lessons);
    if (lessonsBlock) prompt += `\n\n[RAPPEL CRITIQUE - LIS CECI AVANT DE RÉPONDRE]\n${lessonsBlock}`;
  } catch(e) {}

  let modelId = (agent.modelPref && agent.modelPref !== '') ? agent.modelPref : "mistral-large-2512";
  const temp = agent.temperature !== undefined ? agent.temperature : 0.4;
  const maxTok = agent.maxTokens || 8192; // Autoriser des réponses longues

  let userContent = prompt;
  if (images && images.length > 0) {
    userContent = [];
    images.forEach(img => {
      userContent.push({ type: "image_url", image_url: img.data });
    });
    userContent.push({ type: "text", text: prompt });
    // IMPORTANT: Forcer le modèle vision de Mistral pour éviter une erreur de l'API
    modelId = "pixtral-12b-2409";
  }

  const reqBody = {
    model: modelId,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent }
    ],
    temperature: temp,
    max_tokens: maxTok
  };

  if (onChunk) {
    reqBody.stream = true;
  }

  // Injection des documents bruts pour lecture native Gemini (PDF, etc.)
  // NOTE: Gemini est réservé à generateCorrectionSheet uniquement

  let finalResult = "";
  let loopCount = 0;
  const maxLoops = 3;

  while (loopCount < maxLoops) {
    loopCount++;
    const _apiConf = getLlmApiConfig(reqBody.model);
    const res = await fetchWithRetry(_apiConf.url, {
      method: "POST",
      headers: _apiConf.headers,
      signal: abortSignal,
      body: JSON.stringify(reqBody)
    });

    if (!res.ok) throw new Error(`API ${res.status}`);

    finalResult = "";
    if (onChunk) {
      await handleStreamingResponse(res, (chunk) => {
        finalResult = chunk;
        onChunk(chunk);
      }, () => {}, abortSignal);
    } else {
      const data = await res.json();
      finalResult = data.choices?.[0]?.message?.content || "";
    }

    // Interception de l'outil [RECHERCHE_WEB: ...]
    const webSearchMatch = finalResult.match(/\[RECHERCHE_WEB:\s*([^\]]+)\]/i);
    if (webSearchMatch && agent.id.includes('agent_audit_inspecteur')) {
      const query = webSearchMatch[1].trim();
      if (onChunk) onChunk(finalResult + `\n\n*(🔍 Recherche web en cours pour vérifier : "${query}")...*\n`);
      
      const searchData = await searchWikipedia(query);
      
      reqBody.messages.push({ role: "assistant", content: finalResult });
      reqBody.messages.push({ role: "user", content: `RÉSULTATS DE LA RECHERCHE WEB POUR "${query}":\n\n${searchData}\n\nContinue ton analyse en tenant compte de ces informations fiables.` });
      
      continue; // Relance l'agent avec les résultats
    }

    break; // Sortie de boucle si pas de recherche
  }

  return finalResult;
}

// ════════════════════════════════════════
// WORKFLOW EXECUTION ENGINE (CHAÎNE SÉQUENTIELLE)
// ════════════════════════════════════════
async function executeWorkflow(userQuestion, workflow, images = [], rawDocuments = []) {
  const recentContext = (state.messages || []).filter(m => m.role !== 'system').slice(-6);

  // ── Extraire l'instruction dynamique (séquences QCM) de l'input utilisateur ──
  const dynMatch = userQuestion.match(/\[INSTRUCTION SYSTÈME DYNAMIQUE INVISIBLE\][\s\S]*/);
  const dynamicInstruction = dynMatch ? '\n\n' + dynMatch[0] : '';
  const cleanUserQuestion = userQuestion.replace(/\[INSTRUCTION SYSTÈME DYNAMIQUE INVISIBLE\][\s\S]*/, '').trim();

  let currentInput = cleanUserQuestion;
  let fullContext = `Requête initiale : ${cleanUserQuestion}\n\n`;
  const stepResults = []; // {agentName, result, stepIndex}

  // ── Charger les leçons de la chaîne ──
  let workflowLessons = '';
  try {
    const wfFeedbacks = await agentFeedback.getForWorkflow(workflow.name, 8);
    workflowLessons = agentFeedback.buildLessonsPrompt(wfFeedbacks);
  } catch(e) { /* ignore */ }

  let jumpCount = 0;
  const MAX_JUMPS = 10;

  for (let i = 0; i < workflow.steps.length; i++) {
    // Check for abort
    if (state.abortController?.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    const step = workflow.steps[i];
    let agent;
    try {
      agent = await db.get('agents', step.agentId);
    } catch(e) {
      agent = null;
    }

    if (!agent) {
      const errMsg = `Agent introuvable pour l'étape ${i + 1}`;
      stepResults.push({ agentName: '???', result: errMsg, stepIndex: i });
      toast(errMsg, "error");
      continue;
    }

    // ── Update typing indicator with progress ──
    const statusEl = document.getElementById("orchestrator-status");
    if (statusEl) {
      statusEl.innerHTML = `<span style="color:var(--neon)">🔗</span> Étape ${i + 1}/${workflow.steps.length} : <strong>${escapeHtml(agent.name)}</strong>…`;
    }

    // ── Build prompt for THIS agent ──
    let stepPrompt;
    if (step.instructionCustom && (step.instructionCustom.includes('{input}') || step.instructionCustom.includes('{initial}'))) {
      // Mode Templating Dynamique
      stepPrompt = step.instructionCustom
        .replace(/\{input\}/g, i === 0 ? cleanUserQuestion : currentInput)
        .replace(/\{initial\}/g, cleanUserQuestion);
    } else {
      // Mode Standard
      if (i === 0) {
        stepPrompt = cleanUserQuestion;
        if (step.instructionCustom) {
          stepPrompt = `${step.instructionCustom}\n\nContenu à traiter :\n"""\n${cleanUserQuestion}\n"""`;
        }
      } else {
        stepPrompt = `Voici le texte/QCM original soumis par l'utilisateur :\n"""\n${cleanUserQuestion}\n"""\n\nVoici le travail de l'étape précédente :\n"""\n${currentInput}\n"""\n\n`;
        if (step.instructionCustom) {
          stepPrompt += `Ton instruction spécifique : ${step.instructionCustom}`;
        } else {
          stepPrompt += `Continue le travail selon ton rôle et ton expertise.`;
        }
      }
    }

    // ── Inject workflow-level lessons into every step ──
    if (workflowLessons) {
      stepPrompt += `\n${workflowLessons}`;
    }

    // ── Inject dynamic instruction (séquences) ──
    if (dynamicInstruction) {
      stepPrompt += dynamicInstruction;
    }

    // ── Call the agent ──
    try {
      let finalOutputPrefix = `### 🔗 RAPPORT DE CHAÎNE : ${workflow.name}\n\n`;
      stepResults.forEach(r => {
        finalOutputPrefix += `#### ◈ Étape ${r.stepIndex + 1} : ${r.agentName}\n${r.result}\n\n---\n\n`;
      });
      let currentStepTitle = `#### ◈ Étape ${i + 1} : ${agent.name}\n`;

      // Seul le premier agent reçoit les images et les documents bruts pour l'analyse initiale
      const agentImages = (i === 0) ? images : [];
      const agentRawDocs = (i === 0) ? rawDocuments : [];

      let result = await callSubAgentDirect(agent, stepPrompt, recentContext, state.abortController?.signal, (chunk) => {
        let displayChunk = chunk.replace(/\[STOP\]/ig, '').replace(/\[GOTO:\d+\]/ig, '').replace(/\[EXPORT_WORD\]/ig, '');
        updateLiveMessage(finalOutputPrefix + currentStepTitle + displayChunk);
      }, agentImages, agentRawDocs);
      
      const currentStepDisplay = i + 1;
      let branchMsg = "";
      let stopChain = false;
      const gotoMatch = result.match(/\[GOTO:(\d+)\]/i);
      
      if (result.match(/\[STOP\]/i)) {
        stopChain = true;
        result = result.replace(/\[STOP\]/ig, '').trim();
        branchMsg = "\n\n*([STOP] Chaîne arrêtée par cet agent)*";
      } else if (gotoMatch) {
        jumpCount++;
        if (jumpCount > MAX_JUMPS) {
          result = result.replace(/\[GOTO:\d+\]/ig, '').trim();
          branchMsg = "\n\n*(⚠️ڈ [GOTO] ignoré : Limite de sauts atteinte pour prévenir une boucle infinie)*";
        } else {
          const targetStep = parseInt(gotoMatch[1], 10);
          result = result.replace(/\[GOTO:\d+\]/ig, '').trim();
          if (targetStep > 0 && targetStep <= workflow.steps.length) {
            i = targetStep - 2; // -1 for 0-index, -1 because loop does i++
            branchMsg = `\n\n*(Branchement vers l'étape ${targetStep} - Saut ${jumpCount}/${MAX_JUMPS})*`;
          }
        }
      }

      if (result.match(/\[EXPORT_WORD\]/i)) {
        result = result.replace(/\[EXPORT_WORD\]/ig, '').trim();
        exportToWord(result, `Export_Workflow_${Date.now()}.doc`);
        branchMsg += "\n\n*(📄 Fichier Word généré automatiquement)*";
      }

      currentInput = result;
      fullContext += `--- Résultat Étape ${currentStepDisplay} (${agent.name}) ---\n${result}\n\n`;
      stepResults.push({ agentName: agent.name, result: result + branchMsg, displayStep: currentStepDisplay });
      
      if (stopChain) break;

    } catch(e) {
      if (e.name === 'AbortError') throw e;
      const errMsg = `Erreur à l'étape ${i + 1} (${agent.name}) : ${e.message?.slice(0, 150) || e}`;
      stepResults.push({ agentName: agent.name, result: errMsg, displayStep: i + 1 });
      currentInput = errMsg;
      toast(errMsg, "error");
    }
  }

  // ── Build final accordion content ──
  let finalResult = currentInput || '';
  let accordionHtml = '';

  if (stepResults.length > 1) {
    accordionHtml = `\n\n---\n\n<details>\n<summary>🔗 Détail du parcours (${stepResults.length} exécutions)</summary>\n\n`;
    stepResults.forEach((s, idx) => {
      const isLast = idx === stepResults.length - 1;
      accordionHtml += `**Étape ${s.displayStep} — ${s.agentName}** ${isLast ? '(résultat final)' : ''}\n\n${s.result}\n\n${!isLast ? '---\n\n' : ''}`;
    });
    accordionHtml += `</details>`;
  }
  // Clean up any stray LLM comments at the end of multiple-choice options
  if (typeof finalResult === 'string') {
    finalResult = finalResult.replace(/(^(\[x\]\s*)?[a-d]-.*?)(\s*\(\s*(?:E[1-4]\s*:|erreur|car |Bonne).*?\)\s*)$/gmi, '$1');
  }

  // ══════════════════════════════════════════════════════════════
  // POST-PROCESSING : Restore QCM shuffle to guarantee randomness
  // ══════════════════════════════════════════════════════════════
  if (typeof finalResult === 'string') {
    const seq = generateQcmSequenceArray();
    finalResult = shuffleQcmOptions(finalResult, seq);
  }

  // The final message content: last agent's result + accordion
  const displayContent = stepResults.length > 1
    ? `**🔗 Résultat de la chaîne "${workflow.name}"** (${stepResults.length} étapes)\n\n${finalResult}${accordionHtml}`
    : finalResult;

  return { displayContent, stepResults, finalResult, accordionHtml };
}


async function loadAgents() {
  try {
    let agents = await db.getAll('agents') || [];
    
    // ── Nettoyage des agents demandés par l'utilisateur ──
    let dbModified = false;
    for (const a of agents) {
      const ln = (a.name || '').toLowerCase();
      if (ln.includes('qcm expert') || ln.includes('formateur final') || ln.includes('formatteur final')) {
        await db.delete('agents', a.id);
        dbModified = true;
      }
    }
    if (dbModified) {
      agents = await db.getAll('agents') || [];
    }

    window.__allAgents = agents; // FIX: Exposer tous les agents pour l'éditeur de chaînes
    const workflows = await db.getAll('workflows') || [];
    
    const orderMap = {
      // Français
      "QCM-Fr 1": 1,
      "QCM-Fr 2": 2,
      "FC-Fr 1": 3,
      "FC-Fr 2": 4,
      "VRAI/FAUX": 5,
      "AUDIT": 6,

      // Arabe
      "QCM-Ar 1": 10,
      "QCM-Ar2": 11,
      "QCM-Ar 2": 11,
      "FC-Ar 1": 12,
      "FC-Ar 2": 13,

      // Anglais
      "MCQ-En 1": 20,
      "MCQ-En 2": 21,
      "FC-En 1": 22,
      "FC-En 2": 23
    };
    workflows.sort((a, b) => {
      const orderA = orderMap[a.name] || 99;
      const orderB = orderMap[b.name] || 99;
      return orderA - orderB;
    });

    const sel = $("#agent-select");

    // Build select with optgroups
    sel.innerHTML = `<option value="">${t('placeholder_choose_agent')}</option>`;

    // Gather agent IDs used in workflows
    const workflowAgentIds = new Set();
    workflows.forEach(w => {
      (w.steps || []).forEach(s => {
        if (s.agentId) workflowAgentIds.add(s.agentId);
      });
    });

    // ── Agents optgroup ──
    const mainAgents = agents.filter(a =>
      !workflowAgentIds.has(a.id) &&
      !a.name?.startsWith('🎲') // Exclure les agents internes dynamiques (Agent 3, etc.)
    );
    
    if (mainAgents.length) {
      const agGroup = document.createElement("optgroup");
      agGroup.label = "⚙ AGENTS";
      mainAgents.forEach(a => {
        const opt = document.createElement("option");
        opt.value = a.id;
        opt.textContent = `◈ ${a.name}`;
        opt.title = a.desc;
        agGroup.appendChild(opt);
      });
      sel.appendChild(agGroup);
    }

    // ── Outils (Générateurs) ──
    const toolsGroup = document.createElement("optgroup");
    toolsGroup.label = "🛠️ OUTILS & GÉNÉRATEURS";
    const corrOpt = document.createElement("option");
    corrOpt.value = "__TOOL__correction";
    corrOpt.textContent = "📋 Fiche de Correction (Générateur)";
    corrOpt.title = "Générer une fiche de correction détaillée à partir d'un sujet d'évaluation";
    toolsGroup.appendChild(corrOpt);

    const didacOpt = document.createElement("option");
    didacOpt.value = "__TOOL__didactique";
    didacOpt.textContent = "👨‍🏫 Fiche Didactique (Générateur)";
    didacOpt.title = "Générer une fiche didactique de leçon/séquence avec grille d'évaluation formative";
    toolsGroup.appendChild(didacOpt);

    const methodeOpt = document.createElement("option");
    methodeOpt.value = "__TOOL__methode";
    methodeOpt.textContent = "🧠 Fiche Méthode (Générateur)";
    methodeOpt.title = "Générer une fiche méthode étape par étape à partir d'un exercice";
    toolsGroup.appendChild(methodeOpt);

    sel.appendChild(toolsGroup);

    // ── Workflows optgroup ──
    if (workflows.length) {
      const wfGroup = document.createElement("optgroup");
      wfGroup.label = "🔗 Générateurs de Quiz";
      workflows.forEach(w => {
        const opt = document.createElement("option");
        opt.value = `__WF__${w.id}`;
        opt.textContent = `🔗 ${w.name} (${(w.steps||[]).length} étapes)`;
        opt.title = w.desc || '';
        wfGroup.appendChild(opt);
      });
      sel.appendChild(wfGroup);
    }



    // Existing agents in modal (hide workflow-internal agents)
    const list = $("#agent-existing-list");
    if (list) {
      if (!mainAgents.length) {
        list.innerHTML = '';
        // Ne pas faire return ici — les workflows doivent quand même s'afficher dans le select
      } else {
      list.innerHTML = `
        <div style="font-family:var(--font-mono);font-size:10px;letter-spacing:2px;color:var(--text-dim);margin-bottom:10px">AGENTS STANDALONE (${mainAgents.length})</div>
        ${mainAgents.map(a => `
          <div class="agent-preview" data-action="activate-agent" data-id="${a.id}">
            <div style="flex:1;min-width:0">
              <div class="agent-preview-name">◈ ${escapeHtml(a.name)} <span class="agent-lessons-badge" data-action="manage-lessons" data-id="${a.id}" data-agent-lessons="${a.id}" title="Leçons d'apprentissage">🧠 ...</span></div>
              <div class="agent-preview-desc">${escapeHtml((a.desc||'').slice(0,80))}${(a.desc||'').length>80?'…':''}</div>
            </div>
            <div class="agent-card-actions">
              <button class="agent-action-btn" data-action="edit-agent" data-id="${a.id}" title="Modifier">✎</button>
              <button class="agent-action-btn" data-action="duplicate-agent" data-id="${a.id}" title="Dupliquer">⎘</button>
              <button class="agent-action-btn" data-action="export-agent" data-id="${a.id}" title="Exporter">⬇</button>
              <button class="agent-action-btn danger" data-action="delete-agent" data-id="${a.id}" title="Supprimer">✕</button>
            </div>
          </div>
        `).join('')}
      `;
      // Load lesson counts asynchronously
      mainAgents.forEach(async a => {
        try {
          const count = await agentFeedback.getCountForAgent(a.id);
          const badge = document.querySelector(`[data-agent-lessons="${a.id}"]`);
          if (badge) {
            badge.textContent = count > 0 ? `🧠 ${count}` : '🧠 0';
            if (count > 0) badge.classList.add('has-lessons');
          }
        } catch(e) {}
      });
      } // end else mainAgents.length
    }
    
    // Auto-sélectionner l'agent par défaut si pending
    if (window._pendingDefaultAgentId) {
      sel.value = window._pendingDefaultAgentId;
      delete window._pendingDefaultAgentId;
    }
    // Sinon restaurer la sélection courante si un agent est actif
    else if (state.agent && state.agent !== '__ALL_AGENTS__' && state.agent.id) {
      sel.value = state.agent.id;
    } else if (state.agent === '__ALL_AGENTS__') {
      sel.value = '__ALL_AGENTS__';
    } else if (state.selectedWorkflow && state.selectedWorkflow.id) {
      sel.value = '__WF__' + state.selectedWorkflow.id;
    }
  } catch(e) { console.error("loadAgents:", e); }
}

async function activateAgent(id) {
  try {
    const ag = await db.get('agents', id);
    if (ag) {
      state.agent = ag;
      $("#agent-select").value = id;
      // Charger les leçons d'apprentissage
      try {
        const lessons = await agentFeedback.getForAgent(id, 8);
        state._agentLessonsCache = agentFeedback.buildLessonsPrompt(lessons);
      } catch(e) { state._agentLessonsCache = ''; }
      const sys = (state.messages||[]).find(m => m.role === "system");
      if (sys) { sys.content = buildSystemPrompt(); await saveChat(); renderMessages(true); }
      toast(`Agent "${ag.name}" activé`, "success");
      $("#agent-modal").classList.remove("active");
    }
  } catch(e) { console.error(e); }
};

async function deleteAgent(id) {
  if (!confirm("Supprimer cet agent ?")) return;
  await db.delete('agents', id);
  if (state.agent?.id === id) state.agent = null;
  await loadAgents();
  toast("Agent supprimé", "success");
};

// ════════════════════════════════════════
// WORKFLOW (CHAÎNES) MANAGEMENT
// ════════════════════════════════════════
let wfSteps = []; // in-memory steps for the editor

async function renderWfExistingList() {
  const list = $("#wf-existing-list");
  if (!list) return;
  try {
    const workflows = await db.getAll('workflows') || [];
    if (!workflows.length) {
      list.innerHTML = '';
      return;
    }
    list.innerHTML = `
      <div style="font-family:var(--font-mono);font-size:10px;letter-spacing:2px;color:var(--text-dim);margin-bottom:10px">CHAÎNES EXISTANTES (${workflows.length})</div>
      ${workflows.map(w => `
        <div class="wf-preview" data-id="${w.id}">
          <span class="wf-preview-icon" style="cursor:pointer" data-action="edit-workflow" data-id="${w.id}">🔗</span>
          <div class="wf-preview-info" style="cursor:pointer" data-action="edit-workflow" data-id="${w.id}">
            <div class="wf-preview-name">${escapeHtml(w.name)}</div>
            <div class="wf-preview-desc">${escapeHtml(w.desc || '')}</div>
          </div>
          <span class="wf-preview-steps-count" style="margin-right:10px">${(w.steps||[]).length} étapes</span>
          <button class="agent-action-btn" data-action="activate-workflow" data-id="${w.id}" title="Activer cette chaîne pour le prochain message" style="color:var(--neon);border-color:var(--neon);margin-right:5px;width:auto;padding:0 8px">✓ ACTIVER</button>
          <button class="agent-action-btn danger" data-action="delete-workflow" data-id="${w.id}" title="Supprimer">✕</button>
        </div>
      `).join('')}
    `;
  } catch(e) { console.error("renderWfExistingList:", e); }
}

async function renderWfSteps() {
  const zone = $("#wf-steps-zone");
  if (!zone) return;
  if (!wfSteps.length) {
    zone.innerHTML = '<div class="wf-steps-empty">Aucune étape — cliquez sur "+ AJOUTER" ci-dessous</div>';
    return;
  }

  // Get agents for the select options - always reload fresh from DB
  const freshAgents = await db.getAll('agents') || [];
  window.__allAgents = freshAgents;
  console.log('[DEBUG renderWfSteps] agents:', freshAgents.length, 'steps:', wfSteps.length, 'step0 agentId:', wfSteps[0]?.agentId);
  const agentOpts = freshAgents.map(a => ({
    id: a.id, name: a.name
  }));

  zone.innerHTML = wfSteps.map((step, i) => {
    const isFirst = i === 0;
    const isLast = i === wfSteps.length - 1;
    const connector = !isLast ? '<div class="wf-step-connector">↓</div>' : '';

    return `
      <div class="wf-step" data-step-index="${i}">
        <div class="wf-step-header">
          <div class="wf-step-number">${i + 1}</div>
          <div class="wf-step-label">ÉTAPE ${i + 1}</div>
          <div class="wf-step-actions">
            <button class="wf-step-action-btn" data-action="wf-move-up" data-idx="${i}" title="Monter"${isFirst ? ' disabled style="opacity:0.3;cursor:default"' : ''}>↑</button>
            <button class="wf-step-action-btn" data-action="wf-move-down" data-idx="${i}" title="Descendre"${isLast ? ' disabled style="opacity:0.3;cursor:default"' : ''}>↓</button>
            <button class="wf-step-action-btn danger" data-action="wf-remove-step" data-idx="${i}" title="Supprimer l'étape">✕</button>
          </div>
        </div>
        <div class="wf-step-body">
          <select class="field-input field-select wf-step-agent" data-idx="${i}">
            <option value="">— Choisir un agent —</option>
            ${agentOpts.map(a => `<option value="${a.id}"${step.agentId === a.id ? ' selected' : ''}>${escapeHtml(a.name)}</option>`).join('')}
          </select>
          <textarea class="field-textarea wf-step-instruction" data-idx="${i}" rows="2" placeholder="Instruction personnalisée (optionnel) — Ex : Traduis ce texte, Fais un résumé…">${escapeHtml(step.instructionCustom || '')}</textarea>
          <div style="font-family:var(--font-mono);font-size:9.5px;color:var(--text-dim);margin-top:6px;line-height:1.4">
            Astuce : Utilisez <code style="color:var(--neon);background:rgba(0,255,157,0.1);padding:1px 3px;border-radius:2px">{input}</code> pour placer la sortie de l'étape précédente, ou <code style="color:var(--cyan);background:rgba(0,229,255,0.1);padding:1px 3px;border-radius:2px">{initial}</code> pour la requête d'origine.
          </div>
        </div>
      </div>
      ${connector}
    `;
  }).join('');

  // Force values via DOM to guarantee selection even if HTML attribute fails
  setTimeout(() => {
    document.querySelectorAll('.wf-step-agent').forEach(sel => {
      const i = parseInt(sel.dataset.idx);
      if (wfSteps[i] && wfSteps[i].agentId) {
        sel.value = wfSteps[i].agentId;
      }
    });
  }, 10);
}

async function wfAddStep() {
  wfSteps.push({ agentId: '', instructionCustom: '' });
  await renderWfSteps();
  // Scroll to bottom of steps zone
  const zone = $("#wf-steps-zone");
  if (zone) zone.scrollTop = zone.scrollHeight;
}

async function wfMoveStep(fromIdx, direction) {
  const toIdx = fromIdx + direction;
  if (toIdx < 0 || toIdx >= wfSteps.length) return;
  // Sync current UI values before move
  syncWfStepsFromUI();
  const [moved] = wfSteps.splice(fromIdx, 1);
  wfSteps.splice(toIdx, 0, moved);
  await renderWfSteps();
}

async function wfRemoveStep(idx) {
  syncWfStepsFromUI();
  wfSteps.splice(idx, 1);
  await renderWfSteps();
}

function syncWfStepsFromUI() {
  document.querySelectorAll('.wf-step-agent').forEach(sel => {
    const i = parseInt(sel.dataset.idx);
    if (wfSteps[i]) wfSteps[i].agentId = sel.value;
  });
  document.querySelectorAll('.wf-step-instruction').forEach(ta => {
    const i = parseInt(ta.dataset.idx);
    if (wfSteps[i]) wfSteps[i].instructionCustom = ta.value.trim();
  });
}

async function openWorkflowForEdit(id) {
  try {
    toast("Debug: Clic capté sur " + id, "success");
    const wf = await db.get('workflows', id);
    if (!wf) return;
    $("#wf-edit-id").value = wf.id;
    $("#wf-name").value = wf.name || '';
    $("#wf-desc").value = wf.desc || '';
    wfSteps = (wf.steps || []).map(s => ({ agentId: s.agentId || '', instructionCustom: s.instructionCustom || '' }));
    // Ensure agents loaded into window.__allAgents before rendering steps
    if (!window.__allAgents || !window.__allAgents.length) {
      window.__allAgents = await db.getAll('agents') || [];
    }
    await renderWfSteps();
    $("#wf-delete-btn").style.display = '';
    // Scroll to the form and highlight it
    const nameField = $("#wf-name");
    nameField.scrollIntoView({ behavior: 'smooth', block: 'center' });
    nameField.focus();
    nameField.style.transition = 'box-shadow 0.3s, border-color 0.3s';
    nameField.style.boxShadow = '0 0 12px var(--neon)';
    nameField.style.borderColor = 'var(--neon)';
    setTimeout(() => {
      nameField.style.boxShadow = '';
      nameField.style.borderColor = '';
    }, 1500);
    toast(`Chaîne "${wf.name}" chargée pour modification`, "success");
  } catch(e) { console.error("openWorkflowForEdit:", e); }
}

async function resetWorkflowForm() {
  $("#wf-edit-id").value = '';
  $("#wf-name").value = '';
  $("#wf-desc").value = '';
  wfSteps = [];
  await renderWfSteps();
  $("#wf-delete-btn").style.display = 'none';
}

async function saveWorkflow() {
  try {
    const name = $("#wf-name").value.trim();
    if (!name) { toast("Le nom de la chaîne est obligatoire", "error"); return; }

    syncWfStepsFromUI();

    if (wfSteps.length < 1) { toast("Ajoutez au moins une étape", "error"); return; }


    // If any step is missing agentId (UI didn't populate), try to recover from DB
    const editId = $("#wf-edit-id").value;
    if (editId) {
      const dbWf = await db.get('workflows', editId).catch(() => null);
      if (dbWf && dbWf.steps) {
        wfSteps = wfSteps.map((s, i) => ({
          agentId: s.agentId || (dbWf.steps[i] ? dbWf.steps[i].agentId : '') || '',
          instructionCustom: s.instructionCustom !== undefined ? s.instructionCustom : (dbWf.steps[i] ? dbWf.steps[i].instructionCustom : '') || ''
        }));
      }
    }
    // Validate all steps have an agent
    const hasEmpty = wfSteps.some(s => !s.agentId);
    if (hasEmpty) { toast("Chaque étape doit avoir un agent sélectionné", "error"); return; }
    const wf = {
      id: editId || uuid(),
      name,
      desc: $("#wf-desc").value.trim(),
      steps: wfSteps.map(s => ({ agentId: s.agentId, instructionCustom: s.instructionCustom })),
      created: editId ? (await db.get('workflows', editId).catch(() => null))?.created || now() : now()
    };

    await db.put('workflows', wf);
    toast(`Chaîne "${name}" ${editId ? 'modifiée' : 'créée'} !`, "success");
    await resetWorkflowForm();
    await renderWfExistingList();
    await loadAgents();
    
    // Update memory if this workflow is currently selected
    if (state.selectedWorkflow && state.selectedWorkflow.id === wf.id) {
      state.selectedWorkflow = wf;
      $("#agent-select").value = "__WF__" + wf.id;
    }
    
    // Sync mobile
    const mAgent = $("#agent-select-mob");
    if (mAgent) { 
      mAgent.innerHTML = $("#agent-select").innerHTML; 
      mAgent.value = state.selectedWorkflow ? "__WF__" + state.selectedWorkflow.id : (state.agent?.id || ""); 
    }
    
    // Fermer le modal pour que l'utilisateur voit que l'enregistrement a marché
    if ($("#workflow-modal")) $("#workflow-modal").classList.remove("active");
  } catch(e) {
    console.error("Erreur saveWorkflow:", e);
    toast("Erreur lors de la sauvegarde: " + e.message, "error");
  }
}

async function deleteWorkflow(id) {
  if (!confirm("Supprimer cette chaîne ?")) return;
  await db.delete('workflows', id);
  await renderWfExistingList();
  await loadAgents();
  toast("Chaîne supprimée", "success");
}

// ════════════════════════════════════════
// DATA EXPORT / IMPORT
// ════════════════════════════════════════
async function computeStats() {
  try {
    const chats = await db.getAll('chats') || [];
    const agents = await db.getAll('agents') || [];
    const mems = await db.getAll('global_memory') || [];
    const json = JSON.stringify({ chats, agents, mems });
    const sizeKb = (new Blob([json]).size / 1024).toFixed(1);
    $("#stat-chats").textContent = chats.length;
    $("#stat-agents").textContent = agents.length;
    $("#stat-memories").textContent = mems.length;
    $("#stat-size").textContent = sizeKb + " KB";
  } catch(e) {}
}

async function exportData() {
  try {
    const chats = await db.getAll('chats') || [];
    const agents = await db.getAll('agents') || [];
    const mems = await db.getAll('global_memory') || [];
    const settings = await db.getAll('settings') || [];
    const workflows = await db.getAll('workflows') || [];
    const feedbacks = await db.getAll('agent_feedback') || [];
    const payload = {
      version: "3.0",
      exported: new Date().toISOString(),
      source: "Mon Assistant IA",
      data: { chats, agents, global_memory: mems, settings, workflows, agent_feedback: feedbacks }
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type:"application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Mon Assistant IA-backup-${new Date().toISOString().slice(0,10)}.Mon Assistant IA.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast("Données exportées avec succès (inclut les leçons d'apprentissage) !", "success");
  } catch(e) {
    toast("Erreur export : " + e.message, "error");
  }
}

async function importData(file) {
  try {
    const text = await file.text();
    const payload = JSON.parse(text);
    const data = payload.data || payload;
    let count = 0;
    if (data.chats?.length) {
      for (const c of data.chats) { await db.put('chats', c); count++; }
    }
    if (data.agents?.length) {
      for (const a of data.agents) { await db.put('agents', a); count++; }
    }
    if (data.global_memory?.length) {
      for (const m of data.global_memory) { await db.put('global_memory', m); count++; }
    }
    if (data.workflows?.length) {
      for (const w of data.workflows) { await db.put('workflows', w); count++; }
    }
    if (data.agent_feedback?.length) {
      for (const f of data.agent_feedback) { await db.put('agent_feedback', f); count++; }
    }
    await memory.getAll();
    await loadAgents();
    await computeStats();
    toast(`Import réussi — ${count} éléments restaurés`, "success");
  } catch(e) {
    toast("Erreur import : " + e.message, "error");
  }
}

async function exportWorkflows() {
  try {
    const workflows = await db.getAll('workflows') || [];
    const payload = {
      version: "1.0",
      exported: new Date().toISOString(),
      source: "Mon Assistant IA_WORKFLOWS",
      data: { workflows }
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type:"application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Mon Assistant IA-workflows-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast("Chaînes exportées avec succès !", "success");
  } catch(e) {
    toast("Erreur export : " + e.message, "error");
  }
}

async function importWorkflows(file) {
  try {
    const text = await file.text();
    const payload = JSON.parse(text);
    const data = payload.data || payload;
    let count = 0;
    if (data.workflows?.length) {
      for (const w of data.workflows) { await db.put('workflows', w); count++; }
    }
    await loadAgents();
    toast(`Import réussi — ${count} chaînes restaurées`, "success");
  } catch(e) {
    toast("Erreur import : " + e.message, "error");
  }
}


// ════════════════════════════════════════
// RATING SYSTEM
// ════════════════════════════════════════
async function rateMessage(ts, score) {
  const msg = (state.messages||[]).find(m => m.ts === ts);
  if (!msg) return;
  msg.rating = score;
  await saveChat();
  // Update stars UI
  const msgEl = document.getElementById('mc-' + ts)?.closest('.message');
  if (msgEl) {
    msgEl.querySelectorAll('.rating-star').forEach((btn, i) => {
      btn.classList.toggle('active', i < score);
    });
  }

  if (score <= 2) {
    // Mauvaise note → ouvrir popup feedback pour correction
    openFeedbackModal(ts, score);
  } else if (score >= 4) {
    // Bonne note → enregistrer silencieusement un renforcement positif
    const isRealAgent = state.agent && state.agent !== '__ALL_AGENTS__';
    const agentId = isRealAgent ? state.agent.id : null;
    const agentName = isRealAgent ? state.agent.name : (state.aiConfig?.name || 'Mon Assistant IA');
    const workflowName = msg.workflowUsed || null;
    await agentFeedback.add({
      agentId: agentId,
      agentName: agentName,
      workflowName: workflowName,
      score: score,
      userFeedback: 'auto_positive',
      originalQuestion: '',
      responseSnippet: (msg.content || '').slice(0, 200)
    });
    toast(`✅ ${score}/5 — Comportement renforcé pour ${agentName}`, "success");
    
    if (state.agent && state.agent.id === agentId) {
      const lessons = await agentFeedback.getForAgent(agentId, 8);
      state._agentLessonsCache = agentFeedback.buildLessonsPrompt(lessons);
      const sys = (state.messages||[]).find(m => m.role === "system");
      if (sys) { sys.content = buildSystemPrompt(); await saveChat(); }
    }
  } else {
    toast(`Évaluation ${score}/5 enregistrée`, "success");
  }
};

// ════════════════════════════════════════
// FILE UPLOAD FOR VISION/AUDIO
// ════════════════════════════════════════
function initFileUpload() {
  const btn = document.getElementById('file-upload-btn');
  const inp = document.getElementById('file-input');
  if (!btn || !inp) return;
  btn.onclick = () => inp.click();
  inp.onchange = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    
    for (const file of files) {
      const model = MODELS.find(m => m.id === state.model);
      const isImage = file.type.startsWith('image/');
      const isAudioFile = file.type.startsWith('audio/');
      const isPdf = file.type === 'application/pdf';
      const isText = file.type === 'text/plain' || file.name.endsWith('.txt') || file.name.endsWith('.md') || file.name.endsWith('.csv');
      const isDocx = file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || file.name.endsWith('.docx');
      
      if (isImage) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          state.attachedFiles.push({ type: 'image', data: ev.target.result, name: file.name, mimeType: file.type });
          updateFilePreview();
        };
        reader.readAsDataURL(file);
      } else if (isAudioFile) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          state.attachedFiles.push({ type: 'audio', data: ev.target.result, name: file.name, mimeType: file.type });
          updateFilePreview();
        };
        reader.readAsDataURL(file);
      } else if (isPdf) {
        toast(`📄 Extraction de ${file.name}…`, 'info');
        
        // Lire le PDF en base64 (pour Gemini vision native)
        const reader = new FileReader();
        reader.onload = (ev) => {
          const rawBase64 = ev.target.result.split(',')[1];
          extractTextFromPdf(file, (msg) => toast(msg, 'info'))
            .then(({ text, method, pages }) => {
              const label = method === 'ocr' ? ' [OCR]' : '';
              state.attachedFiles.push({ type: 'document', data: text, name: `${file.name}${label}`, mimeType: file.type, rawBase64 });
              updateFilePreview();
              const msgTxt = method === 'ocr'
                ? `✅ ${file.name} — OCR terminé (${pages} page(s), ${text.length} cars.). Vérifiez le contenu.`
                : `✅ ${file.name} lu (${pages} page(s), ${text.length} cars.).`;
              toast(msgTxt, 'success');
            })
            .catch((err) => toast(`❌ Erreur lecture ${file.name} : ${err.message}`, 'error'));
        };
        reader.readAsDataURL(file);
      } else if (isText) {
        toast(`Lecture de ${file.name}...`, "info");
        const reader = new FileReader();
        reader.onload = (ev) => {
          state.attachedFiles.push({ type: 'document', data: ev.target.result.trim(), name: file.name, mimeType: file.type });
          updateFilePreview();
          toast(`${file.name} lu avec succès !`, "success");
        };
        reader.readAsText(file);
      } else if (isDocx) {
        toast(`Extraction de ${file.name}...`, "info");
        const reader = new FileReader();
        reader.onload = async (ev) => {
          try {
            const arrayBuffer = ev.target.result;
            const result = await window.mammoth.extractRawText({ arrayBuffer: arrayBuffer });
            state.attachedFiles.push({ type: 'document', data: result.value.trim(), name: file.name, mimeType: file.type });
            updateFilePreview();
            toast(`${file.name} lu avec succès !`, "success");
          } catch (err) {
            console.error(err);
            toast(`Erreur de lecture pour ${file.name}`, "error");
          }
        };
        reader.readAsArrayBuffer(file);
      } else {
        toast(`Format non supporté pour ${file.name}.`, "error");
      }
    }
    inp.value = '';
  };
}

function updateFilePreview() {
  const area = document.getElementById('input-area');
  let preview = document.getElementById('file-preview-bar');
  if (!state.attachedFiles || state.attachedFiles.length === 0) {
    if (preview) preview.remove();
    return;
  }
  if (!preview) {
    preview = document.createElement('div');
    preview.id = 'file-preview-bar';
    preview.className = 'file-preview';
    preview.style.display = 'flex';
    preview.style.flexWrap = 'wrap';
    preview.style.gap = '8px';
    area.parentNode.insertBefore(preview, area);
  }
  preview.innerHTML = '';
  state.attachedFiles.forEach((file, index) => {
    let icon = '📄';
    if (file.type === 'image') icon = '🖼';
    if (file.type === 'audio') icon = '🎵';
    
    const fileTag = document.createElement('div');
    fileTag.style.display = 'inline-flex';
    fileTag.style.alignItems = 'center';
    fileTag.style.gap = '6px';
    fileTag.style.padding = '4px 8px';
    fileTag.style.background = 'rgba(0,229,255,0.05)';
    fileTag.style.border = '1px solid var(--hud-border)';
    fileTag.style.borderRadius = '4px';
    fileTag.innerHTML = `${icon} <strong style="color:var(--cyan);font-size:11px">${file.name}</strong><button class="file-preview-remove" style="cursor:pointer;background:none;border:none;color:var(--text-dim);font-size:10px" data-action="clear-file" data-index="${index}">✕</button>`;
    preview.appendChild(fileTag);
  });
}

function clearAttachedFile(index = null) {
  if (index !== null) {
    state.attachedFiles.splice(index, 1);
  } else {
    state.attachedFiles = [];
  }
  updateFilePreview();
};

// Override sendMessage to handle file attachments
async function sendMessage() {
  const txt = document.getElementById('user-input').value.trim();
  if (!txt && (!state.attachedFiles || state.attachedFiles.length === 0)) return;
  if (!state.apiKey && !state.geminiApiKey && !state.openRouterApiKey) {
    toast("Configurez votre clé API d'abord", "error");
    document.getElementById('api-modal').classList.add("active");
    return;
  }

  // ════════════════════════════════════════
  // 🔗 INTERCEPT: EXÉCUTION D'UNE CHAÎNE (WORKFLOW)
  // ════════════════════════════════════════
  if (state.selectedWorkflow) {
    // 1. Affiche le message utilisateur
    const userMsg = { role: "user", content: txt, ts: now() };
    state.messages.push(userMsg);
    renderMessages();
    document.getElementById('user-input').value = "";
    autoResizeTextarea();
    
    state.isGenerating = true;
    state.abortController = new AbortController();
    document.getElementById('send-btn').disabled = false;
    document.getElementById('send-btn').className = 'stop-btn';
    document.getElementById('send-btn').innerHTML = '⏹ ARRÊTER';
    
    // 2. Prépare le message assistant final
    state.messages.push({ role: "assistant", content: "", ts: now(), workflowUsed: state.selectedWorkflow.name, modelUsed: state.model });
    renderMessages();
    showTyping(state.model);
    await saveChat();

    let workflowInput = txt;
    let workflowImages = [];
    let workflowRawDocuments = [];
    if (state.attachedFiles && state.attachedFiles.length > 0) {
       const docs = state.attachedFiles.filter(f => f.type === 'document');
       workflowImages = state.attachedFiles.filter(f => f.type === 'image');
       if (docs.length > 0) {
           const docText = docs.map(f => `[CONTENU DU DOCUMENT "${f.name}"]\n\n${f.data}\n\n[FIN DU DOCUMENT]`).join('\n\n');
           userMsg.documentContext = docText;
           userMsg.documentName = docs.map(f => f.name).join(', ');
           workflowInput = `${docText}\n\nInstruction de l'utilisateur : ${txt || "Traite ces documents."}`;
           // Capture les fichiers bruts PDF pour l'injection native Gemini
           workflowRawDocuments = docs.filter(f => f.rawBase64 && f.mimeType).map(f => ({ data: f.rawBase64, mimeType: f.mimeType, name: f.name }));
       }
       if (workflowImages.length > 0 && docs.length === 0) {
           workflowInput = txt || "Analyse ce document visuel (photo/schéma) et extrais-en les informations clés.";
       }
       userMsg.attachedFiles = [...state.attachedFiles];
       clearAttachedFile();
    }

    // ── Génération des séquences QCM (post-processing JS retiré, géré par le prompt Agent 3) ──

    try {
      // 3. Exécute la chaîne
      const { displayContent, finalResult, accordionHtml } = await executeWorkflow(workflowInput, state.selectedWorkflow, workflowImages, workflowRawDocuments);
      
      // 4. Affiche le résultat final
      const lastMsg = state.messages[state.messages.length - 1];
      if (lastMsg && lastMsg.role === 'assistant') {
        if (state.selectedWorkflow.name === 'AUDIT' || state.selectedWorkflow.name === 'AUDIT-EN') {
           lastMsg.content = finalResult;
           if (accordionHtml) {
              state.messages.push({ role: 'assistant', content: `**🔗 Détails de l'Audit :**\n${accordionHtml}`, ts: now() });
           }
        } else {
           lastMsg.content = displayContent;
        }
      }
      renderMessages(true);
      await saveChat();
    } catch (e) {
      if (e.name === 'AbortError') {
         const lastMsg = state.messages[state.messages.length - 1];
         if (lastMsg && lastMsg.role === 'assistant') {
           lastMsg.content = lastMsg.content ? lastMsg.content + '\n\n*— Chaîne interrompue —*' : '*— Chaîne interrompue —*';
         }
         renderMessages(true);
         toast("Chaîne stoppée", "info");
      }
    } finally {
      hideTyping();
      state.isGenerating = false;
      state.abortController = null;
      document.getElementById('send-btn').disabled = false;
      document.getElementById('send-btn').className = '';
      document.getElementById('send-btn').innerHTML = 'ENVOYER ▶';
      const statusEl = document.getElementById("orchestrator-status");
      if (statusEl) statusEl.innerHTML = "";
    }
    return;
  }

  const model = MODELS.find(m => m.id === state.model) || MODELS[0];
  const isVision = state.model.includes('pixtral');
  const isAudio = state.model.includes('voxtral');

  if (state.attachedFiles && state.attachedFiles.length > 0 && (isVision || isAudio)) {
    // Multi-modal message
    const images = state.attachedFiles.filter(f => f.type === 'image');
    const audios = state.attachedFiles.filter(f => f.type === 'audio');
    
    const userMsg = {
      role: "user",
      content: txt || (images.length > 0 ? "Décris ces images" : "Transcris cet audio"),
      ts: now(),
      imageData: images.length > 0 ? images[0].data : null, // (Keeping simple fallback for first item if needed elsewhere)
      audioName: audios.length > 0 ? audios[0].name : null,
      attachedFiles: [...state.attachedFiles]
    };
    state.messages.push(userMsg);
    renderMessages();
    document.getElementById('user-input').value = "";
    autoResizeTextarea();
    state.isGenerating = true;
    state.abortController = new AbortController();
    document.getElementById('send-btn').disabled = false;
    document.getElementById('send-btn').className = 'stop-btn';
    document.getElementById('send-btn').innerHTML = '⏹ ARRÊTER';
    
    state.messages.push({ role: "assistant", content: "", ts: now(), modelUsed: state.model });
    renderMessages();
    showTyping(state.model);
    await saveChat();
    updateContextMeter();

    let msgContent = [];
    for (const f of state.attachedFiles) {
        if (f.type === 'image') {
            msgContent.push({ type: "image_url", image_url: f.data });
        }
    }
    if (txt) msgContent.push({ type: "text", text: txt });
    else msgContent.push({ type: "text", text: "Analyse ces images en détail." });

    const contextMessages = [
      { role: "system", content: buildSystemPrompt() },
      { role: "user", content: msgContent }
    ];

    try {
      const _isRealAgent = state.agent && state.agent !== '__ALL_AGENTS__';
      const agentTemp = (_isRealAgent && state.agent.temperature !== undefined) ? state.agent.temperature : model.temp;
      const agentMaxTok = (_isRealAgent && state.agent.maxTokens) ? state.agent.maxTokens : 4096;
      const _apiConf = getLlmApiConfig(state.model);
      const res = await fetchWithRetry(_apiConf.url, {
        method: "POST",
        headers: _apiConf.headers,
        signal: state.abortController?.signal,
        body: JSON.stringify({
          model: state.model,
          messages: contextMessages,
          temperature: agentTemp,
          max_tokens: agentMaxTok,
          stream: true
        })
      });
      if (!res.ok) throw new Error(await res.text());
      await handleStreamingResponse(res, updateLiveMessage, () => {}, state.abortController?.signal);
      
      const lastMsg = state.messages[state.messages.length - 1];
      if (lastMsg && lastMsg.role === 'assistant' && lastMsg.content) {
        const seq = generateQcmSequenceArray();
        lastMsg.content = shuffleQcmOptions(lastMsg.content, seq);
      }

      hideTyping();
      renderMessages();
      await saveChat();
    } catch(err) {
      hideTyping();
      if (err.name === 'AbortError') {
        const lastMsg = state.messages[state.messages.length - 1];
        if (lastMsg && lastMsg.role === 'assistant' && lastMsg.content) {
          lastMsg.content += '\n\n*— Génération interrompue —*';
        } else if (lastMsg && lastMsg.role === 'assistant') {
          lastMsg.content = '*— Génération interrompue —*';
        }
        renderMessages(true);
        await saveChat();
        toast("Génération stoppée", "info");
      } else {
        toast("Erreur API : " + err.message.slice(0,100), "error");
      }
    } finally {
      state.isGenerating = false;
      state.abortController = null;
      document.getElementById('send-btn').disabled = false;
      document.getElementById('send-btn').className = '';
      document.getElementById('send-btn').innerHTML = 'ENVOYER ▶';
    }
    // Clear file
    state.attachedFiles = [];
    updateFilePreview();
    return;
  }

  const isDocument = state.attachedFile?.type === 'document';
  if (state.attachedFile && !isVision && !isAudio && !isDocument) {
    toast("Ce modèle ne supporte pas les fichiers. Utilisez Pixtral Vision ou Voxtral pour audio.", "error");
    return;
  }


  // Normal text message - use original logic but with agent temperature
  const _model = MODELS.find(m => m.id === state.model) || MODELS[0];
  const origTemp = _model.temp;
  const _isRealAgent2 = state.agent && state.agent !== '__ALL_AGENTS__';
  if (_isRealAgent2 && state.agent.temperature !== undefined) _model.temp = state.agent.temperature;
  await _sendMessageOriginal();
  _model.temp = origTemp;
}

// ════════════════════════════════════════
// AGENT EDIT / DUPLICATE / EXPORT / IMPORT
// ════════════════════════════════════════
async function openEditAgent(id) {
  try {
    const ag = await db.get('agents', id);
    if (!ag) return;
    document.getElementById('edit-agent-id').value = ag.id;
    document.getElementById('edit-agent-name').value = ag.name || '';
    document.getElementById('edit-agent-desc').value = ag.desc || '';
    document.getElementById('edit-agent-instructions').value = ag.instructions || '';
    document.getElementById('edit-agent-primer').value = ag.primer || '';
    document.getElementById('edit-agent-tags').value = (ag.tags||[]).join(', ');
    document.getElementById('edit-agent-temp').value = ag.temperature ?? 0.7;
    document.getElementById('edit-agent-temp-val').textContent = ag.temperature ?? 0.7;
    document.getElementById('edit-agent-maxtok').value = ag.maxTokens || 4096;
    document.getElementById('edit-agent-maxtok-val').textContent = ag.maxTokens || 4096;
    document.getElementById('edit-agent-style').value = ag.style || '';
    document.getElementById('edit-agent-forbidden').value = ag.forbidden || '';
    document.getElementById('edit-agent-mem-prio').value = ag.memPrio || 3;
    document.getElementById('edit-agent-mem-prio-val').textContent = ag.memPrio || 3;
    // Populate model select
    const sel = document.getElementById('edit-agent-model-pref');
    sel.innerHTML = '<option value="">Auto</option>';
    MODELS.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id; opt.textContent = m.name;
      if (ag.modelPref === m.id) opt.selected = true;
      sel.appendChild(opt);
    });
    document.getElementById('edit-agent-modal').classList.add("active");
  } catch(e) { console.error(e); toast("Erreur ouverture agent", "error"); }
};

async function duplicateAgentById(id) {
  try {
    const ag = await db.get('agents', id);
    if (!ag) return;
    const copy = { ...ag, id: uuid(), name: ag.name + ' (copie)', created: now() };
    await db.put('agents', copy);
    await loadAgents();
    toast(`Agent "${copy.name}" dupliqué`, "success");
  } catch(e) { toast("Erreur duplication", "error"); }
};

async function exportAgent(id) {
  try {
    const ag = await db.get('agents', id);
    if (!ag) return;
    
    // Inclure les leçons d'apprentissage liées à cet agent
    const feedbacks = await agentFeedback.getForAgent(id, 20);
    ag._feedbacks = feedbacks;

    const blob = new Blob([JSON.stringify(ag, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `agent-${ag.name.replace(/\s+/g,'-')}.json`;
    a.click(); URL.revokeObjectURL(url);
    toast(`Agent "${ag.name}" exporté`, "success");
  } catch(e) { toast("Erreur export agent", "error"); }
};

function initAgentImport() {
  const btn = document.getElementById('import-agent-btn');
  const inp = document.getElementById('import-agent-input');
  if (!btn || !inp) return;
  btn.onclick = () => inp.click();
  inp.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const ag = JSON.parse(text);
      if (!ag.name || !ag.desc) throw new Error("Fichier agent invalide");
      ag.id = uuid(); ag.created = now();
      await db.put('agents', ag);

      // Restaurer les leçons d'apprentissage si présentes
      let feedbackCount = 0;
      if (ag._feedbacks && Array.isArray(ag._feedbacks)) {
        for (const fb of ag._feedbacks) {
          fb.id = uuid(); // Nouveau UUID pour le feedback
          fb.agentId = ag.id; // Lier au nouvel ID de l'agent importé
          await agentFeedback.add(fb);
          feedbackCount++;
        }
      }

      await loadAgents();
      toast(`Agent "${ag.name}" importé${feedbackCount > 0 ? ` (avec ${feedbackCount} leçons)` : ''}`, "success");
    } catch(err) { toast("Erreur import : " + err.message, "error"); }
    inp.value = '';
  };
}

// ════════════════════════════════════════
// SETUP WIZARD
// ════════════════════════════════════════
async function checkFirstRun() {
  try {
    const cfg = await db.get('settings', 'aiConfig');
    if (cfg?.value) {
      state.aiConfig = cfg.value;
      updateBrandName();
    }
    const key = await getCookie("mistral_api_key");
    if (!key) {
      showWizard(1);
      return true;
    }
    state.apiKey = key;
    return false;
  } catch(e) { return false; }
}

function updateBrandName() {
  const name = state.aiConfig?.name;
  if (!name) return;
  const brandEl = document.querySelector('.brand-name');
  if (brandEl) brandEl.textContent = name;
  const wvLogo = document.querySelector('.wv-logo');
  if (wvLogo) wvLogo.textContent = name;
}

function showWizard(step = 1) {
  document.getElementById('setup-wizard-overlay').classList.add("active");
  setWizardStep(step);
}

function hideWizard() {
  document.getElementById('setup-wizard-overlay').classList.remove("active");
}

function setWizardStep(n) {
  document.querySelectorAll('.wizard-step').forEach(s => s.classList.remove('active'));
  const s = document.getElementById('wizard-step-' + n);
  if (s) s.classList.add('active');
}

// ════════════════════════════════════════
// ADVANCED AGENT FACTORY — MULTI-PHASE PROMPT ENGINEERING v2.0
// ════════════════════════════════════════
const AgentFactory = {

  // ── Appel API mutualisé ──
  _callAPI: async (apiKey, messages, maxTokens = 16000, temperature = 0.6) => {
    const _apiConf = getLlmApiConfig(state.model);
    const res = await fetchWithRetry(_apiConf.url, {
      method: "POST",
      headers: _apiConf.headers,
      body: JSON.stringify({
        model: state.model || "mistral-large-2512",
        messages,
        temperature,
        max_tokens: maxTokens,
        top_p: 0.92
      })
    });
    if (!res.ok) throw new Error("API : " + res.status);
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || "";
    return text.replace(/```json|```/g, '').trim();
  },

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 1 : ANALYSE DE DOMAINE & DÉCOMPOSITION STRATÉGIQUE
  // ═══════════════════════════════════════════════════════════════════
  analyzeDomain: async (apiKey, aiName, aiGoal, agentCount = 4) => {
    const systemPrompt = `Tu es un Expert Pédagogique et Ingénieur en Évaluation du système éducatif marocain.
Ton expertise couvre : l'ingénierie pédagogique, la création d'évaluations (QCM), et la connaissance des programmes officiels marocains.

Tu conçois des équipes d'agents IA spécialisés dans la génération de QCM :
chaque agent a un rôle précis (ex: Professeur de SVT, Ingénieur d'évaluation, Correcteur), des frontières claires, et se base uniquement sur le système éducatif du Maroc.`;

    const userPrompt = `MISSION : Analyse l'objectif suivant et décompose-le en domaines d'expertise distincts pour créer EXACTEMENT ${agentCount} agent(s).

═══ CONTEXTE ═══
Nom de l'IA : "${aiName}"
Objectif principal : "${aiGoal}"

═══ PROCESSUS D'ANALYSE (Chain-of-Thought) ═══
Raisonne étape par étape :
1. Identifie EXACTEMENT ${agentCount} SPÉCIALITÉS nécessaires et parfaitement complémentaires. Repartis-les dans 1 à ${Math.min(agentCount, 3)} macro-domaines.
2. Pour chaque spécialité, évalue :
   - Le NIVEAU DE RIGUEUR requis : "strict" (données, calcul) / "balanced" (général) / "creative" (idéation, rédaction)
   - La TEMPÉRATURE optimale : 0.15-0.35 pour strict, 0.35-0.55 pour balanced, 0.55-0.95 pour creative
   - Le STYLE DE RÉPONSE idéal : concis / detaille / formel / creatif / pedagogique
   - La LONGUEUR MAXIMALE de réponse idéale en tokens : 4096 / 8192 / 12288 / 16384
4. Identifie les SYNERGIES entre spécialités (quel agent nourrit quel autre dans une chaîne)
5. Vérifie qu'il n'y a AUCUN TROU de compétence et AUCUN DOUBLON

═══ FORMAT DE SORTIE (JSON strict, AUCUN texte avant/après, AUCUN markdown) ═══
{
  "context_summary": "Résumé analytique du contexte en 2-3 phrases",
  "macro_domains": [
    {
      "name": "Nom du macro-domaine",
      "importance": "critique|haute|moyenne",
      "specialties": [
        {
          "role_title": "Titre du rôle spécialisé",
          "core_mission": "Mission principale en une phrase",
          "key_skills": ["compétence1", "compétence2", "compétence3"],
          "rigidity": "strict|balanced|creative",
          "temperature": 0.4,
          "style": "concis|detaille|formel|creatif|pedagogique",
          "max_tokens": 8192,
          "synergies": ["autre rôle 1", "autre rôle 2"]
        }
      ]
    }
  ],
  "total_agents": ${agentCount}
}`;

    const raw = await AgentFactory._callAPI(apiKey, [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ], 6000, 0.5);

    try {
      return JSON.parse(raw);
    } catch(e) {
      // Fallback : extraction JSON partielle
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]);
      throw new Error("Analyse de domaine invalide");
    }
  },

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 2 : CRÉATION PROFONDE DES AGENTS (par lot de domaines)
  // ═══════════════════════════════════════════════════════════════════
  craftAgentsBatch: async (apiKey, aiName, aiGoal, domainAnalysis, batchDomains, existingNames = []) => {
    const specialtiesBlock = batchDomains.map(d =>
      (d.specialties || []).map(s =>
        `• ${s.role_title} — ${s.core_mission} [rigidité:${s.rigidity}, temp:${s.temperature}, style:${s.style}, maxTok:${s.max_tokens}]\n  Compétences: ${(s.key_skills||[]).join(', ')}\n  Synergies: ${(s.synergies||[]).join(', ')}`
      ).join('\n')
    ).join('\n\n');

    const existingBlock = existingNames.length
      ? `\n\n⚠️ڈ AGENTS DÉJÀ EXISTANTS (NE PAS recréer, NE PAS dupliquer) :\n${existingNames.map(n => `- ${n}`).join('\n')}`
      : '';

    const systemPrompt = `Tu es « Promptor », un Expert mondial, généraliste et exhaustif en Prompt Engineering et en Intelligence Artificielle.
Ton objectif ultime est de rédiger, d'optimiser et d'affiner le meilleur prompt (instructions système) possible pour chaque agent que l'utilisateur souhaite créer.
Tes créations sont spécifiquement conçues pour exploiter à 100% l'architecture des LLMs avancés.

# RÈGLES DE RÉDACTION
Pour CHAQUE agent que tu vas créer, tu dois impérativement générer le champ "instructions" en respectant ces 5 piliers :

1. Structure CO-STAR :
   - (C) Context : Fournir le contexte et attribuer un RÔLE d'expert très précis à l'agent.
   - (O) Objective : Définir clairement la tâche et le but de cet agent.
   - (S) Style : Définir le style d'écriture de l'agent.
   - (T) Tone : Définir le ton de l'agent.
   - (A) Audience : Identifier le public cible (l'utilisateur final ou les autres agents).
   - (R) Response format : Définir le format de sortie strict.

2. Chain of Thought (CoT) :
   Exige toujours de l'agent qu'il réfléchisse étape par étape dans une balise <brouillon_invisible> avant de générer sa réponse finale.

3. Garde-Fous Anti-Hallucination & Contraintes (Contraintes Négatives) :
   Intègre systématiquement une section "Contraintes Négatives" (ce qu'il ne faut absolument PAS faire) et une règle de "Grounding".
   Demande à l'agent de faire une étape de <verification> de ces contraintes juste après son <brouillon_invisible> et avant de répondre.`;

    const userPrompt = `═══ CONTEXTE GLOBAL ═══
IA : "${aiName}" — Objectif : "${aiGoal}"
Résumé d'analyse : ${domainAnalysis.context_summary || aiGoal}
${existingBlock}

═══ SPÉCIALITÉS À INCARNER (AGENTS À CRÉER) ═══
${specialtiesBlock}

═══ MISSION ═══
Pour CHAQUE spécialité listée ci-dessus, crée l'objet JSON représentant l'agent.

═══ LE CHAMP "instructions" ═══
Le champ "instructions" de chaque agent DOIT être rédigé au format Markdown et contenir :

# SYSTEM INSTRUCTIONS
[Rédige ici le rôle, l'objectif, le style, le ton, l'audience et le format de réponse en utilisant la structure CO-STAR. Demande formellement à l'agent d'utiliser des balises XML structurelles pour organiser sa sortie.]

# GARDE-FOUS & CONTRAINTES
[Liste ici les contraintes négatives strictes spécifiques à l'expertise de cet agent.]

# PROCESSUS DE RÉFLEXION
[Ordonne à l'agent de TOUJOURS inclure ce qui suit dans ses réponses :]
1. Analyse la requête dans la balise <brouillon_invisible> (raisonnement étape par étape).
2. Effectue une <verification> des contraintes et garde-fous.
3. Génère la <reponse_finale> structurée selon le format attendu.

═══ EXIGENCES POUR LE CHAMP "primer" ═══
Une phrase d'amorce de 30-80 mots qui résume l'identité de l'agent et active son mode de pensée (ex: "Je suis ArchitecteCode. Mon approche : comprendre d'abord...").

═══ EXIGENCES POUR LE CHAMP "forbidden" ═══
Liste de 3 à 6 interdictions spécifiques, séparées par des points-virgules.

═══ FORMAT JSON (strict, AUCUN texte avant/après, AUCUN markdown) ═══
{
  "agents": [
    {
      "name": "NomCourt (2-3 mots max, mémorable)",
      "desc": "Rôle et domaine d'expertise (max 120 chars)",
      "instructions": "Instructions COMPLÈTES suivant les 5 sections obligatoires (500-1000 mots)",
      "primer": "Phrase d'amorce contextuelle (30-80 mots)",
      "forbidden": "interdit1; interdit2; interdit3; interdit4",
      "tags": ["tag1", "tag2", "tag3", "tag4"],
      "style": "concis|detaille|formel|creatif|pedagogique",
      "temperature": 0.4,
      "maxTokens": 8192
    }
  ]
}`;

    const raw = await AgentFactory._callAPI(apiKey, [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ], 30000, 0.55);

    try {
      const parsed = JSON.parse(raw);
      return parsed.agents || [];
    } catch(e) {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        return parsed.agents || [];
      }
      throw new Error("Création d'agents invalide");
    }
  },

  // ═══════════════════════════════════════════════════════════════════
  // ORCHESTRATEUR PRINCIPAL — Pipeline de génération complet
  // ═══════════════════════════════════════════════════════════════════
  generate: async (apiKey, aiName, aiGoal, agentCount = 4, onProgress = null, existingAgentNames = []) => {

    // ── PHASE 1 : Analyse de domaine ──
    onProgress?.('phase1', '🔬 Phase 1/2 — Analyse stratégique du domaine…');
    let analysis;
    try {
      analysis = await AgentFactory.analyzeDomain(apiKey, aiName, aiGoal, agentCount);
    } catch(e) {
      console.warn('Phase 1 fallback:', e);
      // Fallback : construire une analyse minimale pour continuer
      analysis = {
        context_summary: aiGoal,
        macro_domains: [{
          name: "Général",
          importance: "critique",
          specialties: Array.from({length: agentCount}, (_, i) => ({
            role_title: `Assistant Polyvalent ${i+1}`, 
            core_mission: aiGoal, 
            key_skills: ["analyse","rédaction","recherche"], 
            rigidity: "balanced", temperature: 0.45, style: "detaille", max_tokens: 8192, synergies: [] 
          }))
        }],
        total_agents: agentCount
      };
    }

    // ── PHASE 2 : Création profonde par lots ──
    const allAgents = [];
    const domains = analysis.macro_domains || [];
    const BATCH_SIZE = 3; // 3 domaines par appel API

    for (let i = 0; i < domains.length; i += BATCH_SIZE) {
      const batch = domains.slice(i, i + BATCH_SIZE);
      const batchNames = batch.map(d => d.name).join(', ');
      const progress = Math.min(i + BATCH_SIZE, domains.length);
      onProgress?.('phase2', `🧠 Phase 2/2 — Création profonde : ${batchNames} (${progress}/${domains.length} domaines)…`);

      try {
        const agents = await AgentFactory.craftAgentsBatch(
          apiKey, aiName, aiGoal, analysis, batch,
          [...existingAgentNames, ...allAgents.map(a => a.name)]
        );
        allAgents.push(...agents);
      } catch(e) {
        console.warn(`Batch ${i} failed:`, e);
        toast(`Erreur sur le lot "${batchNames}" — passage au suivant`, 'error');
      }
    }

    if (allAgents.length === 0) {
      throw new Error("Aucun agent n'a pu être généré. Réessayez.");
    }

    onProgress?.('done', `✓ ${allAgents.length} agents experts créés !`);
    return allAgents;
  },

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 0 : INTERVIEW ARCHITECTE (Affinement interactif)
  // ═══════════════════════════════════════════════════════════════════
  interviewArchitect: async (apiKey, aiName, aiGoal, agentCount = 4, chatHistory) => {
    const systemPrompt = `Tu es l'Architecte de Systèmes Multi-Agents.
Ta mission est d'interviewer l'utilisateur pour comprendre parfaitement son besoin avant de créer son équipe de EXACTEMENT ${agentCount} agent(s) ("${aiName}").
L'objectif initial formulé par l'utilisateur est : "${aiGoal}".

Instructions :
1. Analyse l'objectif initial et l'historique de la conversation.
2. Si tu estimes qu'il manque des informations cruciales (ex: technologies spécifiques, public cible, contraintes métier) pour créer les ${agentCount} meilleurs agents possibles, pose UNE ou DEUX questions claires et directes à l'utilisateur.
3. Si l'objectif et l'historique te donnent une vision globale suffisamment riche pour imaginer exactement ${agentCount} spécialités pointues et complémentaires, NE POSE PLUS DE QUESTION. Réponds UNIQUEMENT avec le mot exact : READY

Format de réponse :
Si tu dois poser une question, formule-la simplement et professionnellement (sans salutations superflues).
Si c'est bon, réponds: READY`;

    const messages = [
      { role: "system", content: systemPrompt },
      ...chatHistory
    ];

    const raw = await AgentFactory._callAPI(apiKey, messages, 1000, 0.7);
    return raw.trim();
  }
};

// Fonction legacy pour compatibilité
async function generateAgentsWithMistral(apiKey, aiName, aiGoal) {
  return await AgentFactory.generate(apiKey, aiName, aiGoal);
}

function initWizardEvents() {
  // Step 1 → Step 2
  document.getElementById('wizard-step1-next').onclick = async () => {
    const key = document.getElementById('wizard-api-key').value.trim();
    if (!isValidApiKey(key)) { toast("Clé invalide — min. 20 caractères", "error"); return; }
    await setCookie("mistral_api_key", key);
    state.apiKey = key;
    document.getElementById('api-status').innerHTML = '<span class="status-dot"></span>EN LIGNE';
    document.getElementById('api-status').className = "status-pill active";
    
    hideWizard();
    toast("Configuration terminée, utilisation des agents par défaut", "success");
    
    if (!state.aiConfig) {
      state.aiConfig = { name: "Mon Assistant IA", goal: "Générer des QCM", agentCount: 0 };
      await db.put('settings', { id: 'aiConfig', value: state.aiConfig });
      updateBrandName();
      await initializeDefaultAgents();
      await initializeQcmWorkflow();
      await initializeVraiFauxWorkflow();
      await initializeAuditWorkflow();
      await loadAgents();

    }
  };

  // Step 2 back
  document.getElementById('wizard-step2-back').onclick = () => setWizardStep(1);

  // Step 2 → Step 2.5 (Interview)
  document.getElementById('wizard-step2-next').onclick = async () => {
    const name = document.getElementById('wizard-ai-name').value.trim();
    const goal = document.getElementById('wizard-ai-goal').value.trim();
    const countEl = document.getElementById('wizard-agent-count');
    const agentCount = countEl ? parseInt(countEl.value, 10) : 4;
    
    if (!name || !goal) { toast("Nom et objectif obligatoires", "error"); return; }
    
    state.aiConfig = { name, goal, agentCount };
    await db.put('settings', { id: 'aiConfig', value: state.aiConfig });
    updateBrandName();
    
    // Init Interview State
    window._wizardInterviewHistory = [];
    document.getElementById('wizard-interview-chat').innerHTML = `
      <div style="color:var(--text-dim);font-style:italic;text-align:center">Analyse de la mission en cours...</div>
    `;
    setWizardStep("2-5");
    
    await processArchitectInterview();
  };

  // Step 2.5 : Send Reply
  document.getElementById('wizard-interview-send').onclick = async () => {
    const inputField = document.getElementById('wizard-interview-input');
    const reply = inputField.value.trim();
    if(!reply) return;
    
    // Add user message to UI
    const chatContainer = document.getElementById('wizard-interview-chat');
    chatContainer.innerHTML += `<div style="background:var(--hull);padding:8px;border-radius:var(--r);align-self:flex-end;max-width:90%;border-left:2px solid var(--neon)"><b>Vous :</b> ${escapeHtml(reply)}</div>`;
    chatContainer.scrollTop = chatContainer.scrollHeight;
    inputField.value = "";
    
    // Add to history
    window._wizardInterviewHistory.push({ role: "user", content: reply });
    
    // Process next step
    await processArchitectInterview();
  };

  // Step 2.5 : Force Finish (Skip to Gen)
  document.getElementById('wizard-interview-finish').onclick = async () => {
    startFinalGeneration();
  };

  // Process Interview Loop
  async function processArchitectInterview() {
    const chatContainer = document.getElementById('wizard-interview-chat');
    const sendBtn = document.getElementById('wizard-interview-send');
    
    sendBtn.disabled = true;
    chatContainer.innerHTML += `<div id="architect-typing" style="color:var(--text-dim);font-style:italic">L'Architecte réfléchit...</div>`;
    chatContainer.scrollTop = chatContainer.scrollHeight;
    
    try {
      const response = await AgentFactory.interviewArchitect(
        state.apiKey, 
        state.aiConfig.name, 
        state.aiConfig.goal, 
        state.aiConfig.agentCount || 4,
        window._wizardInterviewHistory
      );
      
      const typingEl = document.getElementById('architect-typing');
      if(typingEl) typingEl.remove();
      
      if (response === "READY" || response.includes("READY")) {
        // L'architecte a assez d'infos, on lance la gen
        startFinalGeneration();
      } else {
        // L'architecte pose une question
        window._wizardInterviewHistory.push({ role: "assistant", content: response });
        chatContainer.innerHTML += `<div style="background:rgba(0,255,157,0.05);padding:8px;border-radius:var(--r);align-self:flex-start;max-width:90%;border-left:2px solid var(--neon);color:var(--text-bright)"><b>Architecte :</b> ${escapeHtml(response)}</div>`;
        chatContainer.scrollTop = chatContainer.scrollHeight;
        sendBtn.disabled = false;
        document.getElementById('wizard-interview-input').focus();
      }
    } catch(err) {
      toast("Erreur de connexion à l'Architecte. Passage à la génération standard.", "error");
      startFinalGeneration();
    }
  }

  // Start Phase 3 Generation
  async function startFinalGeneration() {
    setWizardStep(3);
    
    // Compile full goal from history
    let enrichedGoal = state.aiConfig.goal;
    if (window._wizardInterviewHistory && window._wizardInterviewHistory.length > 0) {
      enrichedGoal += "\n\nPrécisions apportées lors de l'interview :\n";
      for (const msg of window._wizardInterviewHistory) {
        enrichedGoal += `${msg.role === 'user' ? 'Client' : 'Architecte'}: ${msg.content}\n`;
      }
    }
    
    await runAgentGeneration(state.aiConfig.name, enrichedGoal, state.aiConfig.agentCount || 4);
  }

  // Finish
  document.getElementById('wizard-finish').onclick = async () => {
    hideWizard();
    toast(`Bienvenue sur ${state.aiConfig?.name || 'Mon Assistant IA'} AI !`, "success");
  };

  // Retry
  document.getElementById('wizard-retry').onclick = async () => {
    const name = state.aiConfig?.name || document.getElementById('wizard-ai-name').value;
    const goal = state.aiConfig?.goal || document.getElementById('wizard-ai-goal').value;
    const countEl = document.getElementById('wizard-agent-count');
    const agentCount = state.aiConfig?.agentCount || (countEl ? parseInt(countEl.value, 10) : 4);
    
    document.getElementById('wizard-gen-error').style.display = 'none';
    document.getElementById('wizard-gen-loader').style.display = 'block';
    await runAgentGeneration(name, goal, agentCount);
  };

  // Skip generation
  document.getElementById('wizard-skip-gen').onclick = () => {
    hideWizard();
    toast("Configuration terminée sans génération d'agents", "info");
  };
}

async function runAgentGeneration(name, goal, agentCount = 4) {
  const genDetail = document.getElementById('wizard-gen-detail');
  const loader = document.getElementById('wizard-gen-loader');
  const preview = document.getElementById('wizard-agents-preview');
  const errDiv = document.getElementById('wizard-gen-error');
  const grid = document.getElementById('wizard-agents-grid');

  loader.style.display = 'block';
  preview.style.display = 'none';
  errDiv.style.display = 'none';
  genDetail.textContent = 'Initialisation du pipeline de génération…';

  try {
    const agents = await AgentFactory.generate(state.apiKey, name, goal, agentCount, (phase, msg) => {
      if (genDetail) genDetail.textContent = msg;
    });

    // Save agents — les champs primer et forbidden sont maintenant remplis par le factory
    for (const agData of agents) {
      const agent = {
        id: uuid(),
        name: agData.name || 'Agent',
        desc: agData.desc || '',
        instructions: agData.instructions || '',
        primer: agData.primer || '',
        forbidden: agData.forbidden || '',
        tags: agData.tags || [],
        style: agData.style || '',
        temperature: agData.temperature ?? 0.7,
        maxTokens: agData.maxTokens || 8192,
        memPrio: 3,
        modelPref: '',
        created: now()
      };
      await db.put('agents', agent);
    }
    await loadAgents();

    // Show preview avec indicateur de qualité
    loader.style.display = 'none';
    grid.innerHTML = agents.map(a => {
      const hasInstructions = (a.instructions || '').length > 300;
      const hasPrimer = (a.primer || '').length > 10;
      const hasForbidden = (a.forbidden || '').length > 5;
      const qualityScore = (hasInstructions ? 1 : 0) + (hasPrimer ? 1 : 0) + (hasForbidden ? 1 : 0);
      const qualityBadge = qualityScore >= 3 ? '🟢' : qualityScore >= 2 ? '🟡' : '🔴';
      return `<div class="agent-gen-card">
        <div class="agent-gen-card-name">◈ ${escapeHtml(a.name)} <span title="Qualité: ${qualityScore}/3">${qualityBadge}</span></div>
        <div class="agent-gen-card-desc">${escapeHtml((a.desc||'').slice(0,90))}</div>
        <div style="font-size:9px;color:var(--text-dim);margin-top:4px;font-family:var(--font-mono)">
          ${(a.instructions||'').length} chars instructions${hasPrimer ? ' • primer ✓' : ''}${hasForbidden ? ' • règles ✓' : ''}
        </div>
      </div>`;
    }).join('');
    document.getElementById('wizard-step3-title').textContent = `✓ ${agents.length} Agents Experts Générés !`;
    document.getElementById('wizard-step3-sub').textContent = `Agents créés avec prompt engineering avancé (Chain-of-Thought, persona profonde, auto-évaluation). Modifiables à tout moment.`;
    preview.style.display = 'block';
  } catch(err) {
    loader.style.display = 'none';
    document.getElementById('wizard-error-msg').textContent = err.message;
    errDiv.style.display = 'block';
  }
}

// ════════════════════════════════════════
// EDIT AGENT MODAL EVENTS
// ════════════════════════════════════════
function initEditAgentModal() {
  const closeModal = () => document.getElementById('edit-agent-modal').classList.remove("active");
  document.getElementById('close-edit-agent-modal').onclick = closeModal;
  document.getElementById('close-edit-agent-modal-2').onclick = closeModal;
  document.getElementById('edit-agent-modal').onclick = e => { if (e.target === document.getElementById('edit-agent-modal')) closeModal(); };

  // Range inputs live update
  ['temp','maxtok','mem-prio'].forEach(key => {
    const inp = document.getElementById('edit-agent-' + key);
    const val = document.getElementById('edit-agent-' + key + '-val');
    if (inp && val) inp.oninput = () => { val.textContent = inp.value; };
  });

  // Advanced toggle
  const toggle = document.getElementById('edit-adv-toggle');
  const body = document.getElementById('edit-adv-body');
  if (toggle && body) toggle.onclick = () => {
    toggle.classList.toggle('open');
    body.classList.toggle('open');
  };

  // Create agent advanced toggle
  const createToggle = document.getElementById('create-adv-toggle');
  const createBody = document.getElementById('create-adv-body');
  if (createToggle && createBody) createToggle.onclick = () => {
    createToggle.classList.toggle('open');
    createBody.classList.toggle('open');
  };
  const createTemp = document.getElementById('create-agent-temp');
  const createTempVal = document.getElementById('create-agent-temp-val');
  if (createTemp && createTempVal) createTemp.oninput = () => { createTempVal.textContent = createTemp.value; };

  // Save edit
  document.getElementById('save-edit-agent').onclick = async () => {
    const id = document.getElementById('edit-agent-id').value;
    if (!id) return;
    try {
      const existing = await db.get('agents', id);
      if (!existing) return;
      const updated = {
        ...existing,
        name: document.getElementById('edit-agent-name').value.trim(),
        desc: document.getElementById('edit-agent-desc').value.trim(),
        instructions: document.getElementById('edit-agent-instructions').value.trim(),
        primer: document.getElementById('edit-agent-primer').value.trim(),
        tags: (document.getElementById('edit-agent-tags').value||'').split(',').map(t=>t.trim()).filter(Boolean),
        modelPref: document.getElementById('edit-agent-model-pref').value,
        temperature: parseFloat(document.getElementById('edit-agent-temp').value),
        maxTokens: parseInt(document.getElementById('edit-agent-maxtok').value),
        style: document.getElementById('edit-agent-style').value,
        forbidden: document.getElementById('edit-agent-forbidden').value.trim(),
        memPrio: parseInt(document.getElementById('edit-agent-mem-prio').value),
        updated: now()
      };
      if (!updated.name || !updated.desc) { toast("Nom et rôle obligatoires", "error"); return; }
      await db.put('agents', updated);
      if (state.agent?.id === id) {
        state.agent = updated;
        const sys = (state.messages||[]).find(m => m.role === "system");
        if (sys) { sys.content = buildSystemPrompt(); await saveChat(); renderMessages(true); }
      }
      await loadAgents();
      closeModal();
      toast(`Agent "${updated.name}" mis à jour`, "success");
    } catch(e) { toast("Erreur sauvegarde : " + e.message, "error"); }
  };

  // Duplicate from edit modal
  document.getElementById('duplicate-agent-btn').onclick = async () => {
    const id = document.getElementById('edit-agent-id').value;
    if (id) { closeModal(); await duplicateAgentById(id); }
  };
}

// ════════════════════════════════════════
// GENERATE MORE AGENTS
// ════════════════════════════════════════
function initGenerateMoreAgents() {
  const btn = document.getElementById('generate-more-agents-btn');
  if (!btn) return;
  btn.onclick = async () => {
    if (!state.apiKey) { toast("Configurez votre clé API d'abord", "error"); return; }
    if (!state.aiConfig) {
      toast("Définissez d'abord votre profil via le wizard", "error"); return;
    }
    btn.disabled = true;
    btn.innerHTML = '<span class="spin-ring"></span> Génération avancée…';

    try {
      // Récupérer les noms des agents existants pour éviter les doublons
      const existingAgents = await db.getAll('agents') || [];
      const existingNames = existingAgents.map(a => a.name);

      const agents = await AgentFactory.generate(
        state.apiKey,
        state.aiConfig.name,
        state.aiConfig.goal,
        state.aiConfig.agentCount || 4,
        (phase, msg) => {
          btn.innerHTML = `<span class="spin-ring"></span> ${msg.slice(0, 40)}…`;
        },
        existingNames
      );

      for (const agData of agents) {
        await db.put('agents', {
          id: uuid(),
          name: agData.name || 'Agent',
          desc: agData.desc || '',
          instructions: agData.instructions || '',
          primer: agData.primer || '',
          forbidden: agData.forbidden || '',
          tags: agData.tags || [],
          style: agData.style || '',
          temperature: agData.temperature ?? 0.7,
          maxTokens: agData.maxTokens || 8192,
          memPrio: 3,
          modelPref: '',
          created: now()
        });
      }
      await loadAgents();
      toast(`${agents.length} nouveaux agents experts générés (prompt engineering avancé) !`, "success");
    } catch(e) { toast("Erreur génération : " + e.message.slice(0,80), "error"); }
    finally { btn.disabled = false; btn.innerHTML = '✦ GÉNÉRER + D\'AGENTS'; }
  };
}

// ════════════════════════════════════════
// TEXTAREA AUTO-RESIZE
// ════════════════════════════════════════
function autoResizeTextarea() {
  const ta = $("#user-input");
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
}

// ════════════════════════════════════════
// DEFAULT AGENT
// ════════════════════════════════════════
async function initializeDefaultAgents(force = false) {
}

async function initializeVraiFauxWorkflow() {
  try {
    const agentVF = {
      id: 'agent_consortium_vf',
      name: 'Expert Vrai/Faux (Consortium)',
      description: 'Génère 20 questions Vrai/Faux au format LaTeX strict via un consortium d\'experts (Pédagogue, Évaluateur, Typographe).',
      instructions: `SYSTEM INSTRUCTIONS

CO-STAR Framework

Context (Rôle) :  
Tu es un Consortium d'Experts composé de :

1. Un **Pédagogue Expert en toute les matières scolaire du programme officiel du Maroc, identifiant les erreurs typiques des élèves.
2. Un Ingénieur en Évaluation Certifié.
3. Un **Expert en Typographie Scientifique (écriture scientifique en LaTeX ).

Objective :  
Générer 20 questions Vrai/Faux exclusivement basées sur le contenu d'un PDF fourni, en respectant :

- Série 1 (Fondamentaux de 1 à 20 ) : 6 Q Niv.1 (Mémorisation), 8 Q Niv.2 (Compréhension), 6 Q Niv.3 (Application).
- Verbes guides : Niv.1 (définir, nommer), Niv.2 (expliquer, distinguer), Niv.3 (appliquer, calculer).
- Distribution des réponses : équilibre global, couverture de l ensemble du cours ,

Style :

- Scientifique : Terminologie précise, formules LaTeX, unités SI.
- Pédagogique : Questions adaptées aux erreurs courantes des élèves .
- Structuré : bloc de code + markdown) .

Tone :

- Neutre et rigoureux : Aucun biais, aucune approximation.
- Encourageant : Explications claires pour guider l'apprentissage.

Audience :

- Primaire : Enseignants pour évaluation en classe.
- Secondaire : Élèves révisant le programme officiel.

Format stricte :

[Numéro]- [Affirmation]

. Explication : [VRAI ou FAUX]. [Justification scientifique concise].

. Pour aller plus loin : [https://fr.wikipedia.org/wiki/Concept](https://fr.wikipedia.org/wiki/Concept)

[Numéro]- [Affirmation]

. Explication : [VRAI ou FAUX]. [Justification scientifique concise].

. Pour aller plus loin : [https://fr.wikipedia.org/wiki/Concept](https://fr.wikipedia.org/wiki/Concept)

[Numéro]- [Affirmation]

. Explication : [VRAI ou FAUX]. [Justification scientifique concise].

. Pour aller plus loin : [https://fr.wikipedia.org/wiki/Concept](https://fr.wikipedia.org/wiki/Concept)

Exemple de quiz à generer :

1- Chez les organismes eucaryotes, l'information génétique est localisée dans l'hyaloplasme de la cellule.  
. Explication : FAUX. L'information génétique est confinée dans le noyau cellulaire, comme l'ont démontré les expériences de section et de greffe sur l'algue unicellulaire Acétabulaire.  
. Pour aller plus loin : [https://fr.wikipedia.org/wiki/Noyau_(biologie)](https://www.google.com/url?sa=E&q=https%3A%2F%2Ffr.wikipedia.org%2Fwiki%2FNoyau_\(biologie\))

2- Pour observer la mitose chez une plante, il est judicieux d'utiliser une coupe longitudinale du méristème radiculaire.  
. Explication : VRAI. Le méristème, situé au-dessus de la coiffe dans la racine, est une zone de multiplication cellulaire intense où les cellules sont en division active (mitose).  
. Pour aller plus loin : [https://fr.wikipedia.org/wiki/M%C3%A9rist%C3%A8me](https://www.google.com/url?sa=E&q=https%3A%2F%2Ffr.wikipedia.org%2Fwiki%2FM%25C3%25A9rist%25C3%25A8me)

3- L'interphase est une période de repos complet pour la cellule sans aucune activité métabolique.  
. Explication : FAUX. L'interphase est une période de forte activité métabolique durant laquelle la cellule grandit, synthétise des protéines et duplique son ADN en préparation de la mitose.  
. Pour aller plus loin : [https://fr.wikipedia.org/wiki/Interphase](https://www.google.com/url?sa=E&q=https%3A%2F%2Ffr.wikipedia.org%2Fwiki%2FInterphase)

4- Durant la prophase de la mitose, la chromatine se condense pour former des chromosomes visibles au microscope.  
. Explication : VRAI. La condensation de l'ADN autour des histones permet la formation de chromosomes individualisés, tandis que l'enveloppe nucléaire commence à disparaître.  
. Pour aller plus loin : [https://fr.wikipedia.org/wiki/Prophase](https://www.google.com/url?sa=E&q=https%3A%2F%2Ffr.wikipedia.org%2Fwiki%2FProphase)

5- La métaphase est caractérisée par la séparation des chromatides sœurs vers les pôles de la cellule.  
. Explication : FAUX. La séparation des chromatides sœurs se produit à l'anaphase. En métaphase, les chromosomes s'alignent au centre de la cellule pour former la plaque équatoriale.  
. Pour aller plus loin : [https://fr.wikipedia.org/wiki/M%C3%A9taphase](https://www.google.com/url?sa=E&q=https%3A%2F%2Ffr.wikipedia.org%2Fwiki%2FM%25C3%25A9taphase)

6- Lors de l'anaphase, le clivage des centromères permet l'ascension polaire des chromosomes à une seule chromatide.  
. Explication : VRAI. Les fibres du fuseau achromatique tirent chaque chromatide sœur vers les pôles opposés de la cellule, assurant une répartition équitable du matériel génétique.  
. Pour aller plus loin : [https://fr.wikipedia.org/wiki/Anaphase](https://www.google.com/url?sa=E&q=https%3A%2F%2Ffr.wikipedia.org%2Fwiki%2FAnaphase)

7- Chez la cellule végétale, la séparation des deux cellules filles en télophase se fait par un étranglement du cytoplasme.  
. Explication : FAUX. L'étranglement (sillon de clivage) est spécifique à la cellule animale. Chez la cellule végétale, la cytodiérèse se fait par la formation d'une nouvelle paroi (le phragmoplaste) au centre.  
. Pour aller plus loin : [https://fr.wikipedia.org/wiki/Phragmoplaste](https://www.google.com/url?sa=E&q=https%3A%2F%2Ffr.wikipedia.org%2Fwiki%2FPhragmoplaste)

8- La présence de centrioles (organisant l'aster) lors de la mitose est une caractéristique exclusive de la cellule animale.  
. Explication : VRAI. Les cellules végétales supérieures sont dépourvues de centrioles ; leur fuseau achromatique se forme à partir de calottes polaires au niveau du cytoplasme.  
. Pour aller plus loin : [https://fr.wikipedia.org/wiki/Centrosome](https://www.google.com/url?sa=E&q=https%3A%2F%2Ffr.wikipedia.org%2Fwiki%2FCentrosome)

9- Les travaux de Griffith (1928) sur les pneumocoques ont prouvé que l'ADN était le support de l'information génétique.  
. Explication : FAUX. Griffith a mis en évidence l'existence d'un "principe transformant" capable de rendre les bactéries R virulentes, mais c'est Avery (1944) qui a prouvé que ce principe était l'ADN.  
. Pour aller plus loin : [https://fr.wikipedia.org/wiki/Exp%C3%A9rience_de_Griffith](https://www.google.com/url?sa=E&q=https%3A%2F%2Ffr.wikipedia.org%2Fwiki%2FExp%25C3%25A9rience_de_Griffith)

10- L'expérience d'Avery, MacLeod et McCarty a utilisé des enzymes spécifiques pour identifier la nature chimique du principe transformant.  
. Explication : VRAI. En utilisant des protéases, des RNases et des DNases, ils ont montré que seule la destruction de l'ADN par la DNase empêchait la transformation bactérienne.  
. Pour aller plus loin : [https://fr.wikipedia.org/wiki/Exp%C3%A9rience_d%27Avery,_MacLeod_et_McCarty](https://www.google.com/url?sa=E&q=https%3A%2F%2Ffr.wikipedia.org%2Fwiki%2FExp%25C3%25A9rience_d%2527Avery%2C_MacLeod_et_McCarty)

GARDE-FOUS & CONTRAINTES

Contraintes Négatives (INTERDIT) :

- Hallucination : Aucune information en dehors du PDF fourni. Si le PDF ne couvre pas un sujet, ne pas l'inclure.
- Symboles Unicode : Remplacer systématiquement \rightarrow, \rightleftharpoons, \times, \leq, \geq, \in, \infty, ^2, _3, ^+ par leurs équivalents LaTeX : \\rightarrow, \\rightleftharpoons, \\times, \\leq, \\geq, \\in, \\infty, ^{2}, _{3}, ^{+}.
- Distracteurs : Interdiction absolue de :

- "Aucune de ces réponses" / "Toutes ces réponses".
- Valeurs aberrantes (ex : 10^{100}~m pour une taille cellulaire).
- Options dont l'erreur est évidente (ex : "La photosynthèse a lieu dans le noyau").
- Répétition d'un type d'erreur (E1-E4) dans les 3 distracteurs d'une même question.

- Formatage :

- Backslashes non doublés dans le LaTeX.
- Longueur de la bonne réponse hors intervalle [0.8\times ; 1.2\times] la moyenne des 4 options.
- Bonne réponse = la plus longue/la plus formelle/la plus détaillée.

- Séquences :

- Violation des règles R1-R5 (ex : répétition consécutive de 'a', bloc de 4 sans couverture a/b/c/d).

Règles de Grounding :

- Scientific_formatting_directives  
    1. RÈGLE DES DÉLIMITEURS : Encadre CHAQUE variable, chiffre avec unité ou formule par des dollars simples $ ... $. Texte français à l'extérieur. Exemple : "La quantité d'ADN passe de $q$ à $2q$."  
    2. SYMBOLES : INTERDICTION des symboles Unicode (\rightarrow, \rightleftharpoons, \times, \leq, \geq, \in, \infty, ^2, ^3, ^+).  
    Utilise LaTeX : \\rightarrow, \\rightleftharpoons, \\times, \\leq, \\geq, \\in, \\infty.  
    3. CHIMIE : Écrire les formules avec les caractères Unicode (ex: C₆H₁₂O₆, H₃O⁺). Pas de LaTeX.  
    4. UNITÉS : Utilise le tilde ~ pour l'espace insécable : $0{,}25~mol \cdot L^{-1}$ ou $10~nm$.  
    5. PONCTUATION : Points et virgules de fin de phrase en DEHORS des délimiteurs $.
- Source unique : Le PDF fourni est la seule référence autorisée. Vérifier systématiquement que chaque question et explication est dans le PDF .
- Plausibilité scientifique : Les distracteurs doivent reproduire des erreurs réelles et fréquentes chez les élèves (ex : confusion entre mitose/méiose).
- URLs : Uniquement des liens fr.wikipedia.org vers des articles existants et pertinents (vérifier avant inclusion).

PROCESSUS DE RÉFLEXION

Pour chaque requête, suivre obligatoirement ce workflow :

1. <brouillon_invisible> (à ne jamais afficher dans la réponse finale) :

- Étape 1 : Planifier la couverture thématique du PDF :

- Lister les chapitres/sections du PDF.
- Répartir les 20 questions sur l'ensembles des concepts et notion du cours fourni.

3.  (à effectuer après le brouillon, avant la réponse finale) :

- V1 Cohérence : L'explication justifie exactement l'option correcte.
- V2 Format : Bloc de 3 lignes sans ligne vide interne, backslashes doublés.
- V3 Distracteurs : aucun distracteur trivial.
- V5 Source : La notion est bien présente dans le PDF .
- Correction silencieuse : Si une vérification échoue, corriger avant d'afficher la réponse. Ne jamais mentionner les corrections.

5. <reponse_finale> :
  
  - AFFICHER UNIQUEMENT les 20 questions générées.
  - INTERDICTION ABSOLUE d'ajouter le moindre mot, phrase d'introduction ("Voici le quiz..."), de conclusion, ou de balises markdown de bloc de code.
  - SEPARER LES QUESTIONS UNIQUEMENT PAR UN SAUT DE LIGNE VIDE. NE METTRE AUCUN SÉPARATEUR VISUEL (ni ------, ni ________). 
  - Commence directement par "1- " et termine par le dernier lien Wikipedia.`,
      color: '#8b5cf6',
      icon: '🧠',
      primer: '',
      forbidden: '',
      temperature: 0.3
    };

    const workflowVF = {
      id: 'wf_vrai_faux',
      name: 'VRAI/FAUX',
      description: 'Génère un quiz Vrai/Faux complet de 20 questions via un consortium de 3 experts (Pédagogue, Évaluateur, Typographe) utilisant LaTeX strict.',
      icon: '✅',
      color: '#8b5cf6',
      createdAt: Date.now(),
      steps: [
        {
          id: 'step_vf_1',
          name: 'Génération du Quiz',
          agentId: 'agent_consortium_vf',
          required: true
        }
      ]
    };

    // Unconditionally update both the agent and workflow to ensure the prompt applies even for existing users
    await db.put('agents', agentVF);
    await db.put('workflows', workflowVF);
    console.log('[INIT] Workflow Vrai/Faux mis à jour avec succès.');
  } catch(e) {
    console.error('[INIT] Erreur lors de la mise à jour du workflow Vrai/Faux :', e);
  }
}

async function initializeAuditWorkflow() {
  try {
    const existingWf = await db.get('workflows', 'wf_audit_academique').catch(() => null);
    if (existingWf) return;

    const agent1 = {
      id: 'agent_audit_inspecteur',
      name: '🕵️ڈ‍♂️ Inspecteur Académique',
      desc: 'Analyse un QCM existant pour détecter les failles scientifiques et les ambiguïtés.',
      instructions: `Tu es un Inspecteur Académique Intraitable.

**TA MISSION** : Auditer le QCM fourni pour détecter TOUTE erreur scientifique, ambiguïté ou faille pédagogique.

**OUTIL RECHERCHE WEB** :
Si tu as le moindre doute sur un fait, une date, un mécanisme ou une vérité scientifique, tu DOIS effectuer une recherche web avant de conclure.
Pour chercher, écris EXACTEMENT cette ligne et arrête-toi là :
[RECHERCHE_WEB: ta requête de recherche]
Le système mettra l'analyse en pause, cherchera sur Wikipedia, et te fournira le résultat pour reprendre sereinement.

**ÉTAPES D'AUDIT** :
Pour chaque question du QCM :
1. Vérifier la bonne réponse (signalée par [x] ou équivalent) : Est-elle scientifiquement 100% exacte ?
2. Vérifier les distracteurs (mauvaises réponses) : Sont-ils indubitablement faux ? N'y a-t-il pas une part de vérité qui pourrait créer une ambiguïté ?
3. Vérifier la clarté de l'énoncé.

**FORMAT DE SORTIE** :
RAPPORT D'AUDIT ACADÉMIQUE
==========================
Q1 : [OK] ou [ERREUR: description détaillée de la faille]
Q2 : [OK] ou [AMBIGUÏTÉ: le distracteur 'c' est partiellement vrai car...]
...

**INTERDIT** : Ne corrige pas les questions toi-même. Fais uniquement le diagnostic.`,
      primer: `Veuillez fournir le QCM à auditer (et idéalement le cours de référence). Je vais l'analyser avec une rigueur absolue.`,
      tags: ['Audit', 'Validation', 'Étape 1'],
      temperature: 0.2, style: 'analytique',
      forbidden: 'Ne corrige pas le QCM. Ne fournis que le rapport d\'audit.',
      memPrio: 3, maxTokens: 6000, created: Date.now()
    };

    const agent2 = {
      id: 'agent_audit_correcteur',
      name: '🛠️ Correcteur Scientifique',
      desc: 'Corrige le QCM en se basant sur le rapport d\'audit.',
      instructions: `Tu es un Correcteur Scientifique Expert.

**TA MISSION** : Prendre le rapport d'audit de l'Inspecteur ET le QCM original, puis générer la version corrigée du QCM.

**RÈGLES DE CORRECTION** :
1. Appliquer UNIQUEMENT les corrections signalées dans le rapport d'audit.
2. PRÉSERVER EXACTEMENT le texte, le style et le formatage LaTeX ($) des questions sans erreur.
3. La croix [x] DOIT RESTER sur la même lettre qu'avant. Si le texte de la bonne réponse est faux, modifie son TEXTE, ne déplace JAMAIS le [x].
4. RÈGLE CRITIQUE POUR LES LIENS : Tu DOIS conserver les liens "https://fr.wikipedia.org/..." du QCM généré. Il est STRICTEMENT INTERDIT d'utiliser des liens provenant du texte original (comme svt-lycee.fr ou KhanAcademy).
5. Recopie EXACTEMENT la ligne "• Pour aller plus loin : https://fr.wikipedia.org/..." telle qu'elle est dans le QCM généré à l'étape précédente, SANS LA MODIFIER.

**FORMAT DE SORTIE** :
AFFICHE UNIQUEMENT LE QCM COMPLET (de 1 à la fin), RIEN D'AUTRE.
INTERDICTION ABSOLUE d'ajouter le moindre mot d'introduction ("Voici le QCM...") ou de conclusion. Ne mets pas non plus de balises markdown de bloc de code (pas de \`\`\`).
La sortie doit commencer directement par "1- " et se terminer par la dernière ligne de la dernière question. Rien avant, rien après.

Génère le QCM corrigé en texte brut en respectant strictement l'ordre original :
1- [Énoncé intact ou corrigé]
[lettre]- [Option intacte ou corrigée]
[lettre]- [Option intacte ou corrigée]
[lettre]- [Option intacte ou corrigée]
[lettre]- [Option intacte ou corrigée]
(Ici, recopie EXACTEMENT la ligne "• Explication : ..." en la mettant à jour si besoin)
(Ici, recopie EXACTEMENT la ligne "• Pour aller plus loin : ..." telle qu'elle est dans le QCM original)

N'oublie pas de laisser le [x] devant la lettre de la bonne réponse initiale.
Génère TOUTES les questions originales sans jamais tronquer.`,
      primer: `Je m'engage à corriger rigoureusement toutes les failles signalées tout en préservant scrupuleusement la syntaxe LaTeX et la répartition originale des réponses.`,
      tags: ['Correction', 'Étape 2'],
      temperature: 0.3, style: 'pedagogique',
      forbidden: 'Ne tronque jamais le résultat. Ne rajoute pas de balises inutiles.',
      memPrio: 3, maxTokens: 14000, created: Date.now()
    };

    await db.put('agents', agent1);
    await db.put('agents', agent2);

    const workflow = {
      id: 'wf_audit_academique',
      name: 'AUDIT',
      desc: 'Vérifie la rigueur académique d\'un QCM et corrige les erreurs scientifiques tout en préservant strictement sa mise en forme et la répartition initiale des options.',
      icon: '🛡️',
      color: '#ef4444',
      createdAt: Date.now(),
      steps: [
        { agentId: agent1.id, instructionCustom: 'Audite le QCM fourni pour détecter les failles scientifiques et pédagogiques.' },
        { agentId: agent2.id, instructionCustom: 'Applique les corrections et génère le QCM corrigé en entier, SANS JAMAIS modifier l\'ordre et la répartition initiale des options a,b,c,d.' }
      ]
    };

    await db.put('workflows', workflow);
    console.log('[INIT] Workflow Audit créé avec succès.');
  } catch (e) {
    console.error('[INIT] Erreur Audit:', e);
  }
}


async function initializeFlashCardsWorkflow() {
  try {
    const existing = await db.get('workflows', 'wf-fc-fr1').catch(() => null);
    // Force update to resolve missing workflow bug
    const agent = {
      id: 'wf-fc-fr1-agent1',
      name: '📇 Consortium d\'Experts (FlashCards)',
      desc: 'Génère 20 FlashCards basées sur un PDF en utilisant le framework CO-STAR.',
        instructions: `CO-STAR Framework
Context (Rôle) :
Tu es un Consortium d'Experts composé de :
1.	Un Pédagogue Expert en toute les matières scolaire du programme officiel du Maroc, identifiant les erreurs typiques des élèves.
2.	Un Ingénieur en Évaluation Certifié.
3.	Un Expert en Typographie Scientifique (écriture scientifique en LaTeX, backslashes doublés).
Objective :
Générer 20 FlashCards exclusivement basées sur le contenu d'un PDF fourni, en respectant :
•	Testez les Fondamentaux  : 6 Q Niv.1 (Mémorisation), 8 Q Niv.2 (Compréhension), 6 Q Niv.3 (Application).
Style :
•	Scientifique : Terminologie précise, formules LaTeX (délimiteurs $, symboles, unités SI).
•	Pédagogique : Questions adaptées aux erreurs courantes des élèves.
•	Structuré : bloc de code + markdown) .
Tone :
•	Neutre et rigoureux : Aucun biais, aucune approximation.
•	Encourageant : Explications claires pour guider l'apprentissage.
Audience :
•	Primaire : Enseignants SVT (BIOF Maroc) pour évaluation en classe.
•	Secondaire : Élèves de lycée révisant le programme officiel.

•	Format de Sortie IMPÉRATIF
- Format strict : Chaque FlashCard doit comporter une question claire, une réponse mémorisable, une explication académique courte, et un lien Wikipédia pertinent.
- RÈGLE ABSOLUE DE MISE EN FORME : Chaque champ (Réponse, • Explication, • Pour aller plus loin) doit être sur UNE SEULE LIGNE continue. INTERDICTION d'utiliser des listes à puces, des tirets ou des sauts de ligne INTERNES à un champ.
- Tu dois générer le résultat sous la forme d'une liste unique et continue, numérotée de 1 à 20 pour la Série. Suis SCRUPULEUSEMENT cet exemple :

1- Comment définit-on une cellule diploïde ($2n$) ?
Réponse : C'est une cellule qui possède des chromosomes organisés par paires homologues (un d'origine maternelle, un d'origine paternelle).
• Explication : La diploïdie est la condition normale des cellules somatiques. La quantité d'ADN passe de $q$ à $2q$ lors de la réplication. Ex. réaction chimique : $C_{6}H_{12}O_{6} \\rightarrow 2\\,C_{3}H_{6}O_{3}$.
• Pour aller plus loin : https://fr.wikipedia.org/wiki/Plo%C3%AFdie

<scientific_formatting_directives>
1. RÈGLE DES DÉLIMITEURS : Encadre CHAQUE variable, chiffre avec unité ou formule par des dollars simples $ ... $. Texte français à l'extérieur.
   Exemple : "La quantité d'ADN passe de $q$ à $2q$."
2. SYMBOLES : INTERDICTION des symboles Unicode (→, ⇌, ×, ≤, ≥, ∈, ∞, ², ₃, ⁺).
   Utilise LaTeX : \\rightarrow, \\rightleftharpoons, \\times, \\leq, \\geq, \\in, \\infty.
3. CHIMIE : Regroupe la molécule entière dans un seul bloc $. Exemple : $C_{6}H_{12}O_{6}$.
   Utilise TOUJOURS les accolades pour les indices/exposants : $H_{3}O^{+}$.
4. UNITÉS : Utilise le tilde ~ pour l'espace insécable : $0{,}25~mol \\cdot L^{-1}$ ou $10~nm$.
5. PONCTUATION : Points et virgules de fin de phrase en DEHORS des délimiteurs $.
6. INTERDICTION DU GRAS : Ne mets AUCUNE balise markdown de gras (pas de **). Le numéro de carte DOIT être le VRAI numéro séquentiel (ex: "1- ", "2- ", etc.).
</scientific_formatting_directives>

GARDE-FOUS & CONTRAINTES
Contraintes Négatives (INTERDIT) :
•	Hallucination : Aucune information en dehors du PDF fourni. Si le PDF ne couvre pas un sujet, ne pas l'inclure.
•	Symboles Unicode bruts : Remplacer systématiquement →, ⇌, ×, ≤, ≥, ∈, ∞, ², ₃, ⁺ par leurs équivalents LaTeX : \\rightarrow, \\rightleftharpoons, \\times, \\leq, \\geq, \\in, \\infty, ^{2}, _{3}, ^{+}.
•	Formatage : 
o	Backslashes non doublés dans le LaTeX.
o	Longueur de la réponse hors intervalle [0.8× ; 1.2×] la moyenne attendue.
Règles de Grounding :
•	Scientific_formatting_directives (voir ci-dessus).
•	Source unique : Le PDF fourni est la seule référence autorisée. Vérifier systématiquement que chaque question et explication est dans le PDF.
•	URLs : Uniquement des liens fr.wikipedia.org vers des articles existants et pertinents (vérifier avant inclusion).
PROCESSUS DE RÉFLEXION
Pour chaque requête, suivre obligatoirement ce workflow :
1.	<brouillon_invisible> (à ne jamais afficher dans la réponse finale) :
o	Étape 0 : Générer les 2 séquences de 2fois 20 positions (a-b-c-d) respectant R1-R5. Afficher ces séquences en premier.
o	Étape 1 : Planifier la couverture thématique du PDF :
	Lister les chapitres/sections du PDF.
	Répartir les 20 questions sur l’ensembles des concepts et notion du cours fourni.
o	Étape 2 : Pour chaque question (1 à 20) :
. Appliquer OBLIGATOIREMENT le formatage LaTeX (délimiteurs $...$, backslashes doublés, symboles LaTeX, unités SI avec ~).
o	Étape 3 : Vérifier la réponse pour chaque question.
2.	(à effectuer après le brouillon, avant la réponse finale) :
o	V1 Cohérence : L'explication justifie exactement la réponse.
o	V2 Format : Bloc de 4 lignes sans ligne vide interne.
o	V4 Bloom : Verbe de l'énoncé correspond au niveau déclaré.
o	V5 Source : La notion est bien présente dans le PDF.
3.	<reponse_finale> :
o	Afficher uniquement : 
1.	UNIQUEMENT les 20 FlashCards au format strict, DÉBARRASSÉ de TOUT supplément ni avant ni après (pas de phrases d'introduction comme 'Voici vos questions' ni de conclusion). Le texte doit commencer directement par '1- '.`,
        primer: 'Je vais générer les 20 FlashCards à partir du PDF fourni.',
        tags: ['FlashCards', 'Évaluation', 'SVT', 'CO-STAR'],
        temperature: 0.2, style: 'pedagogique',
        forbidden: 'Hallucination: Aucune information en dehors du PDF. Symboles Unicode bruts INTERDITS (utiliser les équivalents LaTeX avec backslashes doublés). LaTeX brut non délimité interdit.',
        memPrio: 3, maxTokens: 14000, created: Date.now()
      };

      await db.put('agents', agent);

      const workflow = {
        id: 'wf-fc-fr1',
        name: 'FC-Fr 1',
        desc: 'Générateur de 20 FlashCards (Niv 1 à 3) basées sur un document, selon le framework CO-STAR.',
        icon: '📇',
        color: '#f59e0b',
        createdAt: Date.now(),
        steps: [
          { agentId: agent.id, instructionCustom: 'Analyse le PDF fourni et génère les 20 FlashCards selon les consignes strictes (avec brouillon invisible et réponse finale).' }
        ]
      };

    await db.put('workflows', workflow);

    const agent2 = {
      id: 'wf-fc-fr2-agent1',
      name: '📇 Consortium d\'Experts (FlashCards - Renforcement)',
      desc: 'Génère 20 FlashCards d\'approfondissement basées sur un PDF en utilisant le framework CO-STAR.',
      instructions: agent.instructions.replace(
        '•	Testez les Fondamentaux  : 6 Q Niv.1 (Mémorisation), 8 Q Niv.2 (Compréhension), 6 Q Niv.3 (Application).',
        '•	Testez l\'Approfondissement et le Renforcement : 5 Q Niv.3 (Application), 8 Q Niv.4 (Analyse), 5 Q Niv.5 (Évaluation), 2 Q Niv.6 (Synthèse).'
      ),
      primer: 'Je vais générer les 20 FlashCards d\'approfondissement à partir du PDF fourni.',
      tags: ['FlashCards', 'Évaluation', 'SVT', 'Approfondissement', 'CO-STAR'],
      temperature: 0.2, style: 'pedagogique',
      forbidden: agent.forbidden,
      memPrio: 3, maxTokens: 14000, created: Date.now()
    };
    await db.put('agents', agent2);

    const workflow2 = {
      id: 'wf-fc-fr2',
      name: 'FC-Fr 2',
      desc: 'Générateur de 20 FlashCards (Niv 3 à 6) pour le renforcement, basées sur un document, selon le framework CO-STAR.',
      icon: '📇',
      color: '#d946ef',
      createdAt: Date.now(),
      steps: [
        { agentId: agent2.id, instructionCustom: 'Analyse le PDF fourni et génère les 20 FlashCards de renforcement selon les consignes strictes (avec brouillon invisible et réponse finale).' }
      ]
    };
    await db.put('workflows', workflow2);

    // ── ARABIC FlashCards : FC-Ar 1 (Fondamentaux) ──
    const agentAr1 = {
      id: 'wf-fc-ar1-agent1',
      name: '📇 مجموعة الخبراء (بطاقات تعليمية)',
      desc: 'يُنشئ 20 بطاقة تعليمية (مستوى 1-3) من ملف PDF وفق إطار CO-STAR باللغة العربية.',
      instructions: `إطار CO-STAR
السياق (الدور) :
أنت مجموعة من الخبراء تتكوّن من :
1.	خبير تربوي في جميع المواد المدرسية للمنهج الرسمي المغربي، يُحدّد الأخطاء الشائعة لدى الطلاب.
2.	مهندس تقييم معتمد.
3.	خبير في الطباعة العلمية (الكتابة العلمية بـ LaTeX، الشرطات المضاعفة).
الهدف :
توليد 20 بطاقة تعليمية (بطاقة فلاشية) استناداً حصراً إلى محتوى ملف PDF مُرفق، مع الالتزام بما يلي :
•	اختبار المفاهيم الأساسية : 6 أسئلة مستوى 1 (حفظ)، 8 أسئلة مستوى 2 (فهم)، 6 أسئلة مستوى 3 (تطبيق).
الأسلوب :
•	علمي : مصطلحات دقيقة، صيغ LaTeX (محدّدات $، رموز، وحدات SI).
•	تربوي : أسئلة مُصمَّمة لمعالجة الأخطاء الشائعة لدى الطلاب.
•	مُنظَّم : كتلة برمجية + markdown.
النبرة :
•	محايدة وصارمة : لا تحيّز، لا تقريب.
•	تشجيعية : شروح واضحة لإرشاد التعلّم.
الجمهور :
•	أساسي : أساتذة العلوم (BIOF المغرب) للتقييم في الفصل الدراسي.
•	ثانوي : طلاب الثانوية الذين يراجعون البرنامج الرسمي.

•	صيغة الإخراج الإلزامية
- الشكل الصارم : يجب أن تتضمّن كل بطاقة سؤالاً واضحاً، وإجابة قابلة للحفظ، وشرحاً أكاديمياً موجزاً، ورابط ويكيبيديا عربي مناسب.
- القاعدة المطلقة للتنسيق : يجب أن يكون كل حقل (الجواب، • الشرح، • للمزيد) في سطر واحد متّصل. يُمنع استخدام النقاط أو الشرطات أو الأسطر الداخلية.
- يجب توليد النتيجة في شكل قائمة واحدة ومتسلسلة، مرقّمة من 1 إلى 20. اتّبع هذا المثال بدقّة :

1- ما تعريف الخلية ثنائية الصيغة الصبغية ($2n$) ؟
الجواب : هي الخلية التي تحتوي على كروموسومات مُرتَّبة في أزواج متماثلة (واحد أمومي وواحد أبوي).
• الشرح : تُعدّ الثنائية الصبغية الحالة الطبيعية للخلايا الجسدية. تنتقل كمية الحمض النووي من $q$ إلى $2q$ أثناء التضاعف. مثال : $C_{6}H_{12}O_{6} \\rightarrow 2\\,C_{3}H_{6}O_{3}$.
• للمزيد : https://ar.wikipedia.org/wiki/%D8%B5%D9%8A%D8%BA%D8%A9_%D8%B5%D8%A8%D8%BA%D9%8A%D8%A9

<scientific_formatting_directives>
1. قاعدة المحدّدات : أحِط كل متغيّر أو رقم بوحدة أو صيغة بدولارات منفردة $ ... $. النص العربي خارجها.
   مثال : "تنتقل كمية الحمض النووي من $q$ إلى $2q$."
2. الرموز : يُمنع استخدام رموز Unicode (→، ⇌، ×، ≤، ≥، ∈، ∞، ²، ₃، ⁺).
   استخدم LaTeX : \\rightarrow, \\rightleftharpoons, \\times, \\leq, \\geq, \\in, \\infty.
3. الكيمياء : اجمع الجزيء بأكمله في كتلة $ واحدة. مثال : $C_{6}H_{12}O_{6}$.
   استخدم دائماً الأقواس للمؤشرات والأسس : $H_{3}O^{+}$.
4. الوحدات : استخدم التيلدة ~ للمسافة غير القابلة للكسر : $0{,}25~mol \\cdot L^{-1}$ أو $10~nm$.
5. علامات الترقيم : النقاط والفواصل في نهاية الجملة خارج محدّدات $.
6. يُمنع الخط العريض : لا تستخدم أي وسوم markdown للخط العريض (بدون **). رقم البطاقة يجب أن يكون الرقم المتسلسل الحقيقي (مثلاً: "1- "، "2- "...).
</scientific_formatting_directives>

الضوابط والقيود
القيود السلبية (محظور) :
•	الهلوسة : لا معلومات خارج ملف PDF المُرفق. إذا لم يشمل PDF موضوعاً ما، لا تُدرجه.
•	رموز Unicode الخام : استبدل منهجياً →، ⇌، ×، ≤، ≥، ∈، ∞، ²، ₃، ⁺ بمعادلاتها في LaTeX.
•	التنسيق : شرطات غير مضاعفة في LaTeX. طول الإجابة خارج النطاق [0.8×؛ 1.2×] المتوسط المتوقّع.
قواعد التأسيس :
•	التوجيهات العلمية للتنسيق (انظر أعلاه).
•	مصدر وحيد : ملف PDF المُرفق هو المرجع الوحيد المُرخَّص. تحقّق دائماً من أن كل سؤال وشرح موجود في PDF.
•	الروابط : فقط روابط ar.wikipedia.org لمقالات موجودة ومناسبة (تحقّق قبل إدراجها).
عملية التفكير
لكل طلب، اتّبع هذا المسار إلزامياً :
1.	<مسودة_غير_مرئية> (لا تُعرض في الإجابة النهائية) :
o	الخطوة 0 : توليد تسلسل 20 موضعاً.
o	الخطوة 1 : التخطيط للتغطية المواضيعية لـ PDF :
	عرض الفصول/الأقسام.
	توزيع الأسئلة العشرين على مجموع مفاهيم وأفكار الدرس.
o	الخطوة 2 : لكل سؤال (1 إلى 20) :
. تطبيق تنسيق LaTeX إلزامياً (محدّدات $...$، شرطات مضاعفة، رموز LaTeX، وحدات SI مع ~).
o	الخطوة 3 : التحقّق من الإجابة لكل سؤال.
2.	(يُنجز بعد المسودة، قبل الإجابة النهائية) :
o	T1 الاتساق : الشرح يُبرّر الإجابة بدقة.
o	T2 التنسيق : كتلة من 4 أسطر بدون سطر فارغ داخلي.
o	T4 بلوم : فعل السؤال يتوافق مع المستوى المُعلَن.
o	T5 المصدر : الفكرة موجودة فعلاً في PDF.
3.	<الإجابة_النهائية> :
o	اعرض فقط : 
1.	الـ 20 بطاقة تعليمية بالشكل الصارم فقط، مُجرَّدة من أي إضافات قبلها أو بعدها (بدون جمل تمهيدية مثل 'هذه بطاقاتك' أو خاتمة). يجب أن يبدأ النص مباشرة بـ '1- '.`,
      primer: 'سأُنشئ الـ 20 بطاقة تعليمية من ملف PDF المُرفق.',
      tags: ['بطاقات تعليمية', 'تقييم', 'علوم', 'CO-STAR'],
      temperature: 0.2, style: 'pedagogique',
      forbidden: 'الهلوسة: لا معلومات خارج PDF. رموز Unicode الخام محظورة (استخدم معادلات LaTeX مع شرطات مضاعفة). LaTeX غير محدَّد محظور.',
      memPrio: 3, maxTokens: 14000, created: Date.now()
    };
    await db.put('agents', agentAr1);

    const workflowAr1 = {
      id: 'wf-fc-ar1',
      name: 'FC-Ar 1',
      desc: 'مُولِّد 20 بطاقة تعليمية (مستوى 1 إلى 3) من مستند، وفق إطار CO-STAR بالعربية.',
      icon: '📇',
      color: '#f59e0b',
      createdAt: Date.now(),
      steps: [
        { agentId: agentAr1.id, instructionCustom: 'حلِّل ملف PDF المُرفق وأنشئ الـ 20 بطاقة تعليمية وفق التعليمات الصارمة (مع مسودة غير مرئية وإجابة نهائية).' }
      ]
    };
    await db.put('workflows', workflowAr1);

    // ── ARABIC FlashCards : FC-Ar 2 (Renforcement) ──
    const agentAr2 = {
      id: 'wf-fc-ar2-agent1',
      name: '📇 مجموعة الخبراء (بطاقات - التعمّق)',
      desc: 'يُنشئ 20 بطاقة تعليمية تعمّقية (مستوى 3-6) من ملف PDF وفق إطار CO-STAR باللغة العربية.',
      instructions: agentAr1.instructions.replace(
        '•\tاختبار المفاهيم الأساسية : 6 أسئلة مستوى 1 (حفظ)، 8 أسئلة مستوى 2 (فهم)، 6 أسئلة مستوى 3 (تطبيق).',
        '•\tاختبار التعمّق والتعزيز : 5 أسئلة مستوى 3 (تطبيق)، 8 أسئلة مستوى 4 (تحليل)، 5 أسئلة مستوى 5 (تقييم)، 2 سؤال مستوى 6 (تركيب وإبداع).'
      ),
      primer: 'سأُنشئ الـ 20 بطاقة تعليمية التعمّقية من ملف PDF المُرفق.',
      tags: ['بطاقات تعليمية', 'تقييم', 'علوم', 'تعمّق', 'CO-STAR'],
      temperature: 0.2, style: 'pedagogique',
      forbidden: agentAr1.forbidden,
      memPrio: 3, maxTokens: 14000, created: Date.now()
    };
    await db.put('agents', agentAr2);

    const workflowAr2 = {
      id: 'wf-fc-ar2',
      name: 'FC-Ar 2',
      desc: 'مُولِّد 20 بطاقة تعليمية تعمّقية (مستوى 3 إلى 6) من مستند، وفق إطار CO-STAR بالعربية.',
      icon: '📇',
      color: '#d946ef',
      createdAt: Date.now(),
      steps: [
        { agentId: agentAr2.id, instructionCustom: 'حلِّل ملف PDF المُرفق وأنشئ الـ 20 بطاقة تعليمية التعمّقية وفق التعليمات الصارمة (مع مسودة غير مرئية وإجابة نهائية).' }
      ]
    };
    await db.put('workflows', workflowAr2);


    // ── ENGLISH FlashCards : FC-En 1 (Fundamentals) ──
    const agentEn1 = {
      id: 'wf-fc-en1-agent1',
      name: '📇 Expert Consortium (FlashCards)',
      desc: 'Generates 20 FlashCards (Level 1-3) based on a PDF using the CO-STAR framework in English.',
      instructions: `CO-STAR Framework
Context (Role) :
You are an Expert Consortium consisting of:
1.	An Educational Expert in all school subjects, identifying common student mistakes.
2.	A Certified Assessment Engineer.
3.	A Scientific Typography Expert (scientific writing in LaTeX, double backslashes).
Objective :
Generate 20 FlashCards exclusively based on the content of the provided PDF, adhering to:
•	Test Fundamentals: 6 Q Lvl.1 (Memorization), 8 Q Lvl.2 (Understanding), 6 Q Lvl.3 (Application).
Style :
•	Scientific: Precise terminology, LaTeX formulas (single $ delimiters, symbols, SI units).
•	Educational: Questions tailored to address common student mistakes.
•	Structured: Code block + markdown.
Tone :
•	Neutral and rigorous: No bias, no approximation.
•	Encouraging: Clear explanations to guide learning.
Audience :
•	Primary: Teachers for classroom assessment.
•	Secondary: High school students reviewing the official curriculum.

•	MANDATORY Output Format
- Strict format: Each FlashCard MUST include a clear question, a memorizable answer, a brief academic explanation, and a relevant English Wikipedia link.
- ABSOLUTE FORMATTING RULE: Each field (Answer, • Explanation, • To go further) must be on a SINGLE continuous line. FORBIDDEN to use bullet points, dashes, or internal line breaks within a field.
- You must output the result as a single, continuous list, numbered from 1 to 20. Follow this example STRICTLY:

1- How is a diploid cell ($2n$) defined?
Answer: It is a cell that has chromosomes organized in homologous pairs (one of maternal origin, one of paternal origin).
• Explanation: Diploidy is the normal condition of somatic cells. DNA quantity goes from $q$ to $2q$ during replication. Ex: $C_{6}H_{12}O_{6} \\rightarrow 2\\,C_{3}H_{6}O_{3}$.
• To go further: https://en.wikipedia.org/wiki/Ploidy

<scientific_formatting_directives>
1. DELIMITERS RULE: Wrap EACH variable, number with unit, or formula in single dollars $ ... $. English text goes outside.
   Example: "DNA quantity goes from $q$ to $2q$."
2. SYMBOLS: FORBIDDEN to use raw Unicode symbols (→, ⇌, ×, ≤, ≥, ∈, ∞, ², ₃, ⁺).
   Use LaTeX: \\rightarrow, \\rightleftharpoons, \\times, \\leq, \\geq, \\in, \\infty.
3. CHEMISTRY: Group the entire molecule in a single $ block. Example: $C_{6}H_{12}O_{6}$.
   ALWAYS use braces for subscripts/superscripts: $H_{3}O^{+}$.
4. UNITS: Use tilde ~ for non-breaking space: $0{,}25~mol \\cdot L^{-1}$ or $10~nm$.
5. PUNCTUATION: End of sentence periods and commas outside $ delimiters.
6. NO BOLD: Do NOT use markdown bold tags (no **). The card number MUST be the real sequential number (e.g., "1- ", "2- ", etc.).
</scientific_formatting_directives>

SAFEGUARDS & CONSTRAINTS
Negative Constraints (FORBIDDEN):
•	Hallucination: No information outside the provided PDF. If the PDF does not cover a topic, do not include it.
•	Raw Unicode symbols: Systematically replace →, ⇌, ×, ≤, ≥, ∈, ∞, ², ₃, ⁺ with their LaTeX equivalents.
•	Formatting: Un-doubled backslashes in LaTeX. Answer length outside [0.8× ; 1.2×] of expected average.
Grounding Rules:
•	Scientific formatting directives (see above).
•	Single source: The provided PDF is the only authorized reference. Always verify each question and explanation is in the PDF.
•	URLs: Only en.wikipedia.org links to existing and relevant articles.
THOUGHT PROCESS
For each request, you MUST follow this workflow:
1.	<invisible_draft> (never display in the final response):
	Step 0: Generate the 20 positions sequence.
	Step 1: Plan the thematic coverage of the PDF.
	Step 2: For each question (1 to 20): Apply LaTeX formatting strictly.
	Step 3: Verify the answer for each question.
2.	(done after the draft, before the final response):
	T1 Consistency: The explanation strictly justifies the answer.
	T2 Format: 4-line block with no internal blank lines.
	T4 Bloom: The question verb matches the declared level.
	T5 Source: The concept is present in the PDF.
3.	<final_response> :
	Display ONLY:
	1. ONLY the 20 FlashCards in strict format, STRIPPED of ANY additions before or after (no intro/outro phrases). Text must start directly with '1- '.`,
      primer: 'I will generate the 20 FlashCards from the provided PDF.',
      tags: ['FlashCards', 'Assessment', 'Science', 'CO-STAR'],
      temperature: 0.2, style: 'pedagogique',
      forbidden: 'Hallucination: No info outside PDF. Raw Unicode symbols FORBIDDEN (use LaTeX with double backslashes). Unbounded LaTeX forbidden.',
      memPrio: 3, maxTokens: 14000, created: Date.now()
    };
    await db.put('agents', agentEn1);

    const workflowEn1 = {
      id: 'wf-fc-en1',
      name: 'FC-En 1',
      desc: 'Generates 20 FlashCards (Level 1 to 3) from a document, according to the CO-STAR framework in English.',
      icon: '📇',
      color: '#f59e0b',
      createdAt: Date.now(),
      steps: [
        { agentId: agentEn1.id, instructionCustom: 'Analyze the provided PDF and generate the 20 FlashCards according to the strict instructions (with invisible draft and final response).' }
      ]
    };
    await db.put('workflows', workflowEn1);

    // ── ENGLISH FlashCards : FC-En 2 (Reinforcement) ──
    const agentEn2 = {
      id: 'wf-fc-en2-agent1',
      name: '📇 Expert Consortium (Cards - In-depth)',
      desc: 'Generates 20 in-depth FlashCards (Level 3-6) from a PDF using the CO-STAR framework in English.',
      instructions: agentEn1.instructions.replace(
        '•\tTest Fundamentals: 6 Q Lvl.1 (Memorization), 8 Q Lvl.2 (Understanding), 6 Q Lvl.3 (Application).',
        '•\tTest In-depth and Reinforcement: 5 Q Lvl.3 (Application), 8 Q Lvl.4 (Analysis), 5 Q Lvl.5 (Evaluation), 2 Q Lvl.6 (Synthesis & Creation).'
      ),
      primer: 'I will generate the 20 in-depth FlashCards from the provided PDF.',
      tags: ['FlashCards', 'Assessment', 'Science', 'In-depth', 'CO-STAR'],
      temperature: 0.2, style: 'pedagogique',
      forbidden: agentEn1.forbidden,
      memPrio: 3, maxTokens: 14000, created: Date.now()
    };
    await db.put('agents', agentEn2);

    const workflowEn2 = {
      id: 'wf-fc-en2',
      name: 'FC-En 2',
      desc: 'Generates 20 in-depth FlashCards (Level 3 to 6) from a document, according to the CO-STAR framework in English.',
      icon: '📇',
      color: '#d946ef',
      createdAt: Date.now(),
      steps: [
        { agentId: agentEn2.id, instructionCustom: 'Analyze the provided PDF and generate the 20 in-depth FlashCards according to the strict instructions (with invisible draft and final response).' }
      ]
    };
    await db.put('workflows', workflowEn2);


    console.log('[INIT] Workflows FlashCards mis à jour avec succès.');
  } catch (e) {
    console.error('[INIT] Erreur FlashCards:', e);
  }
}

async function initializeMegaChainWorkflows() {
  try {
    // ── FR Mega Chain : QCM-Fr 1 + Audit ──
    const existingFr = await db.get('workflows', 'wf-mega-fondamentaux-fr').catch(() => null);
    if (!existingFr) {
      const agentInspFr = {
        id: 'mega-audit-inspecteur-fr',
        name: '🕵️ڈ‍♂️ Inspecteur Académique (Méga)',
        desc: 'Audite le QCM généré pour détecter les failles scientifiques et pédagogiques.',
        instructions: `Tu es un Inspecteur Académique Intraitable intégré dans une chaîne de génération de QCM.

**TA MISSION** : Auditer le QCM qui vient d'être généré par les agents précédents pour détecter TOUTE erreur scientifique, ambiguïté ou faille pédagogique.

**OUTIL RECHERCHE WEB** :
Si tu as le moindre doute sur un fait, une date, un mécanisme ou une vérité scientifique, tu DOIS effectuer une recherche web avant de conclure.
Pour chercher, écris EXACTEMENT cette ligne et arrête-toi là :
[RECHERCHE_WEB: ta requête de recherche]
Le système mettra l'analyse en pause, cherchera sur Wikipedia, et te fournira le résultat.

**ÉTAPES D'AUDIT** :
Pour chaque question du QCM :
1. Vérifier la bonne réponse ([x]) : Est-elle scientifiquement 100% exacte ?
2. Vérifier les distracteurs : Sont-ils indubitablement faux ?
3. Vérifier la clarté de l'énoncé.
4. Les liens Wikipedia sont OBLIGATOIRES. Interdiction absolue de critiquer un lien Wikipedia ou de demander un lien provenant de la source originale.

**FORMAT DE SORTIE** :
RAPPORT D'AUDIT ACADÉMIQUE
==========================
Q1 : [OK] ou [ERREUR: description détaillée]
Q2 : [OK] ou [AMBIGUÏTÉ: ...]
...

**INTERDIT** : Ne corrige pas les questions toi-même. Fais uniquement le diagnostic.`,
        primer: `Je vais auditer le QCM généré avec une rigueur absolue.`,
        tags: ['Audit', 'Méga-Chaîne', 'Étape 6'],
        temperature: 0.2, style: 'analytique',
        forbidden: 'Ne corrige pas le QCM. Ne fournis que le rapport d\'audit.',
        memPrio: 3, maxTokens: 6000, created: Date.now()
      };

      const agentCorrFr = {
        id: 'mega-audit-correcteur-fr',
        name: '🛠️ Correcteur Final (Méga)',
        desc: 'Corrige le QCM généré en se basant sur le rapport d\'audit. Produit la sortie finale propre.',
        instructions: `Tu es un Correcteur Scientifique Expert, dernière étape d'une chaîne de génération et d'audit.

**TA MISSION** : Tu reçois :
1. Le QCM original (texte soumis par l'utilisateur)
2. Le QCM généré par les agents précédents
3. Le rapport d'audit de l'Inspecteur

Applique les corrections signalées et génère la version finale parfaite du QCM.

**RÈGLES ABSOLUES** :
1. Appliquer UNIQUEMENT les corrections signalées dans le rapport d'audit.
2. PRÉSERVER EXACTEMENT le texte, le style et le formatage LaTeX ($) des questions sans erreur.
3. La croix [x] DOIT RESTER sur la même lettre qu'avant. Si le texte de la bonne réponse est faux, modifie son TEXTE, ne déplace JAMAIS le [x].
4. RÈGLE CRITIQUE POUR LES LIENS : Tu DOIS conserver les liens "https://fr.wikipedia.org/..." du QCM généré. Il est STRICTEMENT INTERDIT d'utiliser des liens provenant du texte original (comme svt-lycee.fr ou KhanAcademy).
5. Recopie EXACTEMENT la ligne "• Pour aller plus loin : https://fr.wikipedia.org/..." telle qu'elle est dans le QCM généré à l'étape précédente, SANS LA MODIFIER.

**FORMAT DE SORTIE** :
AFFICHE UNIQUEMENT LE QCM COMPLET. RIEN D'AUTRE.
INTERDICTION ABSOLUE d'ajouter une introduction ("Voici le QCM...") ou une conclusion.
La sortie doit commencer directement par "1- " et se terminer par la dernière ligne de la dernière question.

Format par question :
1- [Énoncé]
a- [Option]
b- [Option]
[x] c- [Option correcte]
d- [Option]
(Recopie EXACTEMENT la ligne "• Explication : ..." depuis le QCM généré, en la mettant à jour si besoin)

(Note : Le [x] indique la bonne réponse. Conservez-le EXACTEMENT sur sa lettre d'origine.)
(Recopie EXACTEMENT la ligne "• Pour aller plus loin : https://fr.wikipedia.org/..." depuis le QCM généré, il est interdit de mettre un autre site)

Génère TOUTES les questions sans jamais tronquer.`,
        primer: `Je vais corriger les failles détectées et produire le QCM final parfait.`,
        tags: ['Correction', 'Méga-Chaîne', 'Étape 7'],
        temperature: 0.2, style: 'pedagogique',
        forbidden: 'Ne tronque jamais le résultat. Ne change pas les URLs. Ne rajoute pas de balises inutiles.',
        memPrio: 3, maxTokens: 14000, created: Date.now()
      };

      await db.put('agents', agentInspFr);
      await db.put('agents', agentCorrFr);

      const wfMegaFr = {
        id: 'wf-mega-fondamentaux-fr',
        name: '✨ QCM-Fr+ (Audit Auto)',
        desc: 'Génération + Audit intégré (7 étapes) : Analyse → Rédaction → Randomisation → LaTeX → Vérification → Inspection → Correction finale.',
        icon: '✨',
        color: '#8b5cf6',
        createdAt: Date.now(),
        steps: [
          { agentId: 'wf-fondamentaux-agent1', instructionCustom: '' },
          { agentId: 'wf-fondamentaux-agent2', instructionCustom: 'Rédige les 20 questions QCM Fondamentaux en suivant le plan de couverture.' },
          { agentId: 'wf-fondamentaux-agent3', instructionCustom: 'Redistribue les bonnes réponses de manière équitable et aléatoire entre les positions a, b, c et d.' },
          { agentId: 'wf-fondamentaux-agent4', instructionCustom: 'Applique le formatage LaTeX scientifique strict à ces QCM.' },
          { agentId: 'wf-fondamentaux-agent5', instructionCustom: 'Vérifie la conformité totale et sors UNIQUEMENT le bloc de texte final prêt pour le Quiz Player.' },
          { agentId: agentInspFr.id, instructionCustom: 'Audite le QCM généré pour détecter toutes les failles scientifiques et pédagogiques.' },
          { agentId: agentCorrFr.id, instructionCustom: 'Applique les corrections, préserve les URLs originales, et génère UNIQUEMENT le QCM final corrigé de 1 à 20, sans introduction ni conclusion.' }
        ]
      };
      await db.put('workflows', wfMegaFr);
    }

    // ── EN Mega Chain : MCQ-En 1 + Audit ──
    const existingEn = await db.get('workflows', 'wf-mega-fundamentals-en').catch(() => null);
    if (!existingEn) {
      const agentInspEn = {
        id: 'mega-audit-inspector-en',
        name: '🕵️ڈ‍♂️ Academic Inspector (Mega)',
        desc: 'Audits the generated MCQ to detect scientific and pedagogical flaws.',
        instructions: `You are an Uncompromising Academic Inspector integrated in an MCQ generation chain.

**YOUR MISSION**: Audit the MCQ just generated by the previous agents to detect ANY scientific error, ambiguity, or pedagogical flaw.

**WEB SEARCH TOOL**:
If you have any doubt about a fact, date, or scientific truth, you MUST perform a web search.
To search, type EXACTLY this line and stop there:
[RECHERCHE_WEB: your search query]

**AUDIT STEPS**:
For each question:
1. Check the correct answer ([x]): Is it 100% scientifically accurate?
2. Check the distractors: Are they unmistakably false?
3. Check the clarity of the stem.
4. Wikipedia links are MANDATORY. Absolute prohibition to criticize a Wikipedia link or ask for a link from the original source.

**OUTPUT FORMAT**:
ACADEMIC AUDIT REPORT
=====================
Q1: [OK] or [ERROR: detailed description]
Q2: [OK] or [AMBIGUITY: ...]
...

**FORBIDDEN**: Do not correct questions yourself. Only provide the diagnosis.`,
        primer: `I will audit the generated MCQ with absolute rigor.`,
        tags: ['Audit', 'Mega-Chain', 'Step 6'],
        temperature: 0.2, style: 'analytical',
        forbidden: 'Do not correct the MCQ. Only provide the audit report.',
        memPrio: 3, maxTokens: 6000, created: Date.now()
      };

      const agentCorrEn = {
        id: 'mega-audit-corrector-en',
        name: '🛠️ Final Corrector (Mega)',
        desc: 'Corrects the generated MCQ based on the audit report. Produces the clean final output.',
        instructions: `You are an Expert Scientific Corrector, the final step of a generation and audit chain.

**YOUR MISSION**: Apply the corrections flagged in the audit report and generate the final perfect version of the MCQ.

**ABSOLUTE RULES**:
1. Apply ONLY the corrections pointed out in the audit report.
2. EXACTLY PRESERVE the text, style, and LaTeX formatting ($) of error-free questions.
3. The [x] MUST REMAIN on the same letter as before. If the correct answer's text is wrong, change its TEXT, NEVER move the [x].
4. CRITICAL RULE FOR LINKS: You MUST keep the "https://en.wikipedia.org/..." links from the generated MCQ. It is STRICTLY FORBIDDEN to use links from the original text.
5. EXACTLY copy the line "• To go further: https://en.wikipedia.org/..." as it is in the previously generated MCQ, WITHOUT MODIFYING IT.

**OUTPUT FORMAT**:
ONLY DISPLAY THE COMPLETE MCQ. NOTHING ELSE.
ABSOLUTE PROHIBITION against adding an introduction or conclusion.
The output must start directly with "1- " and end with the last line of the last question.

Format per question:
1- [Stem]
a- [Option]
b- [Option]
[x] c- [Correct answer]
d- [Option]
(EXACTLY copy the "• Explanation: ..." line from the generated MCQ, updating if needed)

(Note: The [x] marks the correct answer. Keep it EXACTLY on its original letter.)
(Copy EXACTLY the line "• To go further: https://en.wikipedia.org/..." from the generated MCQ, using another site is forbidden)

Generate ALL questions without ever truncating.`,
        primer: `I will correct all flagged flaws and produce the final perfect MCQ.`,
        tags: ['Correction', 'Mega-Chain', 'Step 7'],
        temperature: 0.2, style: 'pedagogical',
        forbidden: 'Never truncate. Never change URLs. Do not add unnecessary tags.',
        memPrio: 3, maxTokens: 14000, created: Date.now()
      };

      await db.put('agents', agentInspEn);
      await db.put('agents', agentCorrEn);

      const wfMegaEn = {
        id: 'wf-mega-fundamentals-en',
        name: '✨ MCQ-En+ (Auto Audit)',
        desc: 'Generation + Integrated Audit (7 steps): Analysis → Writing → Randomization → LaTeX → Verification → Inspection → Final Correction.',
        icon: '✨',
        color: '#8b5cf6',
        createdAt: Date.now(),
        steps: [
          { agentId: 'wf-fundamentals-en-agent1', instructionCustom: '' },
          { agentId: 'wf-fundamentals-en-agent2', instructionCustom: 'Write the 20 Fundamentals MCQ questions following the coverage plan.' },
          { agentId: 'wf-fundamentals-en-agent3', instructionCustom: 'Randomly and evenly redistribute the correct answers among positions a, b, c, and d.' },
          { agentId: 'wf-fundamentals-en-agent4', instructionCustom: 'Apply strict scientific LaTeX formatting to these MCQ questions.' },
          { agentId: 'wf-fundamentals-en-agent5', instructionCustom: 'Verify total compliance and output ONLY the final text block ready for Quiz Player.' },
          { agentId: agentInspEn.id, instructionCustom: 'Audit the generated MCQ to detect all scientific and pedagogical flaws.' },
          { agentId: agentCorrEn.id, instructionCustom: 'Apply corrections, preserve original URLs, and generate ONLY the final corrected MCQ from 1 to 20, with no introduction or conclusion.' }
        ]
      };
      await db.put('workflows', wfMegaEn);
    }

    // ── AR Mega Chain : QCM-Ar 1 + Audit ──
    const existingAr = await db.get('workflows', 'wf-mega-fondamentaux-ar').catch(() => null);
    if (!existingAr) {
      const agentInspAr = {
        id: 'mega-audit-inspecteur-ar',
        name: '🕵️ڈ‍♂️ مفتش أكاديمي (ميجا)',
        desc: 'يراجع أسئلة QCM التي تم إنشاؤها لاكتشاف العيوب العلمية والتعليمية.',
        instructions: `أنت مفتش أكاديمي صارم مدمج في سلسلة إنشاء أسئلة QCM.

**مهمتك**: تدقيق أسئلة QCM التي تم إنشاؤها للتو بواسطة الوكلاء السابقين لاكتشاف أي خطأ علمي أو غموض أو عيب تعليمي.

**أداة البحث عبر الويب**:
إذا كان لديك أي شك حول حقيقة أو تاريخ أو آلية، يجب عليك إجراء بحث على الويب قبل الاستنتاج.
للبحث، اكتب هذه الجملة بالضبط وتوقف:
[RECHERCHE_WEB: استعلام البحث الخاص بك]
سيقوم النظام بإيقاف التحليل مؤقتًا، والبحث على ويكيبيديا، وتزويدك بالنتيجة.

**خطوات التدقيق**:
لكل سؤال:
1. تحقق من الإجابة الصحيحة ([x]): هل هي دقيقة علميًا بنسبة 100٪؟
2. تحقق من المشتتات: هل هي خاطئة بلا شك؟
3. تحقق من وضوح السؤال.
4. روابط ويكيبيديا إلزامية. يمنع منعًا باتًا انتقاد رابط ويكيبيديا أو طلب رابط من المصدر الأصلي.

**تنسيق المخرجات**:
تقرير التدقيق الأكاديمي
=====================
Q1: [OK] أو [ERROR: وصف تفصيلي]
Q2: [OK] أو [AMBIGUITY: ...]
...

**ممنوع**: لا تصحح الأسئلة بنفسك. قم بإجراء التشخيص فقط.`,
        primer: `سأقوم بتدقيق أسئلة QCM التي تم إنشاؤها بصرامة مطلقة.`,
        tags: ['Audit', 'Mega-Chain', 'Step 6'],
        temperature: 0.2, style: 'analytical',
        forbidden: 'لا تصحح الأسئلة. قدم تقرير التدقيق فقط.',
        memPrio: 3, maxTokens: 6000, created: Date.now()
      };

      const agentCorrAr = {
        id: 'mega-audit-correcteur-ar',
        name: '\uD83D\uDEE0\uFE0F مصحح نهائي (ميجا)',
        desc: 'يصحح أسئلة QCM بناءً على تقرير التدقيق، وينتج المخرجات النهائية النظيفة.',
        instructions: `أنت مصحح علمي خبير، الخطوة الأخيرة في سلسلة الإنشاء والتدقيق.

**مهمتك**: تطبيق التصحيحات المذكورة في تقرير التدقيق وإنشاء النسخة النهائية المثالية من QCM.

**قواعد مطلقة**:
1. قم بتطبيق التصحيحات المذكورة في تقرير التدقيق فقط.
2. حافظ تمامًا على النص والأسلوب وتنسيق LaTeX ($) للأسئلة التي لا تحتوي على أخطاء.
3. يجب أن تبقى العلامة [x] على نفس الحرف كما كانت من قبل. إذا كان نص الإجابة الصحيحة خاطئًا، فقم بتعديل النص، ولا تنقل العلامة [x] أبدًا.
4. لا تقم بتعديل سطور "• Pour aller plus loin : https://..." تحت أي ظرف من الظروف. انسخها تمامًا كما هي من QCM الذي تم إنشاؤه.

**تنسيق المخرجات**:
اعرض فقط QCM الكامل. لا شيء آخر.
يمنع منعًا باتًا إضافة مقدمة أو خاتمة.
يجب أن تبدأ المخرجات مباشرة بـ "1- " وتنتهي بالسطر الأخير من السؤال الأخير.

تنسيق كل سؤال:
1- [نص السؤال]
a- [خيار]
b- [خيار]
[x] c- [الإجابة الصحيحة]
d- [خيار]
(انسخ سطر "• Explication : ..." تمامًا من QCM الذي تم إنشاؤه، مع تحديثه إذا لزم الأمر)

(ملاحظة: علامة [x] تشير إلى الإجابة الصحيحة. احتفظ بها بالضبط على حرفها الأصلي.)
(انسخ سطر "• Pour aller plus loin : https://..." تمامًا من QCM، دون تعديله)

قم بإنشاء جميع الأسئلة دون أي قطع أبدًا.`,
        primer: `سأقوم بتصحيح جميع العيوب المحددة وإنتاج QCM النهائي المثالي.`,
        tags: ['Correction', 'Mega-Chain', 'Step 7'],
        temperature: 0.2, style: 'pedagogical',
        forbidden: 'لا تقطع أبدًا. لا تغير الروابط أبدًا. لا تضف علامات غير ضرورية.',
        memPrio: 3, maxTokens: 14000, created: Date.now()
      };

      await db.put('agents', agentInspAr);
      await db.put('agents', agentCorrAr);

      const wfMegaAr = {
        id: 'wf-mega-fondamentaux-ar',
        name: '\u2728 QCM-Ar 1+ (Auto Audit)',
        desc: 'إنشاء + تدقيق مدمج (7 خطوات): تحليل → كتابة → تنسيق عشوائي → LaTeX → تحقق → تفتيش → تصحيح نهائي.',
        icon: '\u2728',
        color: '#8b5cf6',
        createdAt: Date.now(),
        steps: [
          { agentId: 'wf-fondamentaux-ar-agent1', instructionCustom: '' },
          { agentId: 'wf-fondamentaux-ar-agent2', instructionCustom: 'اكتب 20 سؤالاً لأساسيات QCM باتباع خطة التغطية.' },
          { agentId: 'wf-fondamentaux-ar-agent3', instructionCustom: 'أعد توزيع الإجابات الصحيحة بشكل عادل وعشوائي بين المواضع a و b و c و d.' },
          { agentId: 'wf-fondamentaux-ar-agent4', instructionCustom: 'قم بتطبيق تنسيق LaTeX العلمي الصارم على أسئلة QCM هذه.' },
          { agentId: 'wf-fondamentaux-ar-agent5', instructionCustom: 'تحقق من الامتثال التام وأخرج فقط الكتلة النصية النهائية الجاهزة لـ Quiz Player.' },
          { agentId: agentInspAr.id, instructionCustom: 'قم بتدقيق QCM الذي تم إنشاؤه لاكتشاف كافة العيوب العلمية والتعليمية.' },
          { agentId: agentCorrAr.id, instructionCustom: 'قم بتطبيق التصحيحات، واحتفظ بالروابط الأصلية، وأنشئ فقط QCM المصحح النهائي من 1 إلى 20، بدون مقدمة أو خاتمة.' }
        ]
      };
      await db.put('workflows', wfMegaAr);
    }

    console.log('[INIT] Méga-Chaînes (FR+EN+AR) créées avec succès.');
  } catch(e) {
    console.error('[INIT] Erreur Méga-Chaînes:', e);
  }
}

async function initializeQcmWorkflow() {
  try {
    const createAgentsForWorkflow = async (prefix, typeName, emoji, bloomRules, numQuestions, seqName, lang = 'fr', forceRecreate = false) => {
      const isAr = lang === 'ar';
      const isEn = lang === 'en';
      const _a1_n = isAr ? `${emoji} الوكيل 1 : محلل ملف PDF (${typeName})` : isEn ? `${emoji} Agent 1 : PDF Analyst (${typeName})` : `${emoji} Agent 1 : Analyste PDF (${typeName})`;
      const _a2_n = isAr ? `✍️ الوكيل 2 : محرر الأسئلة (${typeName})` : isEn ? `✍️ Agent 2 : MCQ Writer (${typeName})` : `✍️ Agent 2 : Rédacteur QCM (${typeName})`;
      const _a3_n = isAr ? `🎲 الوكيل 3 : المنسق (${typeName})` : isEn ? `🎲 Agent 3 : Formatter (${typeName})` : `🎲 Agent 3 : Formatteur (${typeName})`;
      const _a4_n = isAr ? `🔬 الوكيل 4 : منسق LaTeX (${typeName})` : isEn ? `🔬 Agent 4 : LaTeX Formatter (${typeName})` : `🔬 Agent 4 : Formateur LaTeX (${typeName})`;
      const _a5_n = isAr ? `✅ الوكيل 5 : المدقق النهائي (${typeName})` : isEn ? `✅ Agent 5 : Final Verifier (${typeName})` : `✅ Agent 5 : Vérificateur Final (${typeName})`;

      try {
        const ags = await Promise.all([
          db.get('agents', `wf-${prefix}-agent1`), db.get('agents', `wf-${prefix}-agent2`),
          db.get('agents', `wf-${prefix}-agent3`), db.get('agents', `wf-${prefix}-agent4`),
          db.get('agents', `wf-${prefix}-agent5`)
        ]);
        const nms = [_a1_n, _a2_n, _a3_n, _a4_n, _a5_n];
        for (let i=0; i<5; i++) {
          if (ags[i] && ags[i].name !== nms[i]) {
            ags[i].name = nms[i];
            await db.put('agents', ags[i]);
          }
        }
      } catch(e) {}

      // Skip if this workflow already exists (don't overwrite user modifications)
      if (!forceRecreate) {
        const existingWf = await db.get('workflows', `wf-qcm-${prefix}`).catch(() => null);
        if (existingWf) return;
      }

      // isAr and isEn already declared above

      const a1_name = isAr ? `${emoji} الوكيل 1 : محلل ملف PDF (${typeName})` : isEn ? `${emoji} Agent 1 : PDF Analyst (${typeName})` : `${emoji} Agent 1 : Analyste PDF (${typeName})`;
      const a1_desc = isAr ? `يقرأ ملف PDF، يحدد الأقسام، ويخطط التغطية الموضوعية لـ ${numQuestions} سؤال من ${typeName}.` : isEn ? `Reads the PDF, identifies sections, and plans the thematic coverage of the ${numQuestions} ${typeName} questions.` : `Lit le PDF, identifie les sections, et planifie la couverture thématique des ${numQuestions} questions de ${typeName}.`;
      const a1_inst = isAr ? `أنت خبير بيداغوجي في المنهج الرسمي للمغرب.

**مهمتك الوحيدة** : تحليل المستند المقدم وإنتاج خطة تغطية موضوعية للجزء ${typeName}.

**خطوات إلزامية** :
1. سرد جميع الفصول والأقسام والأقسام الفرعية في المستند.
2. تحديد المفاهيم الأساسية والتعريفات والصيغ والمفاهيم المهمة.
3. إنتاج خطة توزيع لـ EXACTEMENT ${numQuestions} سؤال تغطي المحتوى بأكمله :
   ${bloomRules}
4. لكل سؤال مخطط له، اذكر: الرقم، والقسم في المصدر PDF، ومستوى بلوم، والمفهوم المستهدف.

**صيغة المخرجات** :
CARTOGRAPHIE THÉMATIQUE
========================
Sections identifiées : [liste]

PLAN DE RÉPARTITION (${numQuestions} questions)
===================================
Q1: [Section] | [Niveau] | Concept: [...]
...
Q${numQuestions}: [Section] | [Niveau] | Concept: [...]

**ممنوع** : لا تقم بصياغة الأسئلة نفسها. أنت تضع الخطة فقط.`
      : isEn ? `You are an Expert Pedagogue covering all school subjects.

**YOUR SOLE MISSION**: Analyze the provided document and produce a thematic coverage plan for the ${typeName} section.

**MANDATORY STEPS**:
1. List ALL chapters, sections, and sub-sections of the document.
2. Identify key concepts, definitions, formulas, and important notions.
3. Produce a distribution plan of EXACTLY ${numQuestions} questions covering the entire content:
   ${bloomRules}
4. For each planned question, state: number, PDF source section, Bloom level, and targeted concept.

**OUTPUT FORMAT**:
THEMATIC MAP
============
Identified sections: [list]

DISTRIBUTION PLAN (${numQuestions} questions)
=====================================
Q1: [Section] | [Level] | Concept: [...]
...
Q${numQuestions}: [Section] | [Level] | Concept: [...]

**FORBIDDEN**: Do NOT draft the questions themselves. You ONLY create the plan.`
      : `Tu es un Pédagogue Expert du programme officiel du Maroc.

**TA MISSION UNIQUE** : Analyser le document fourni et produire un plan de couverture thématique pour la partie ${typeName}.

**ÉTAPES OBLIGATOIRES** :
1. Lister TOUS les chapitres, sections et sous-sections du document.
2. Identifier les concepts-clés, définitions, formules et notions importantes.
3. Produire un plan de répartition de EXACTEMENT ${numQuestions} questions couvrant l'ensemble du contenu :
   ${bloomRules}
4. Pour chaque question planifiée, indiquer : le numéro, la section du PDF source, le niveau de Bloom, et le concept ciblé.

**FORMAT DE SORTIE** :
CARTOGRAPHIE THÉMATIQUE
========================
Sections identifiées : [liste]

PLAN DE RÉPARTITION (${numQuestions} questions)
===================================
Q1: [Section] | [Niveau] | Concept: [...]
...
Q${numQuestions}: [Section] | [Niveau] | Concept: [...]

**INTERDIT** : Ne rédige PAS les questions elles-mêmes. Tu ne fais QUE le plan.`;

      const agent1 = {
        id: `wf-${prefix}-agent1`,
        name: a1_name,
        desc: a1_desc,
        instructions: a1_inst,
        primer: isAr ? `قدم ملف PDF، وسأقوم برسم خريطة لمحتواه وتخطيط ${numQuestions} سؤال من ${typeName}.` : isEn ? `Provide the PDF and I will map its content and plan the ${numQuestions} ${typeName} questions.` : `Fournissez le PDF, je vais cartographier son contenu et planifier les ${numQuestions} questions de ${typeName}.`,
        tags: ['MCQ', 'Analysis', 'Bloom', 'Step 1'],
        temperature: 0.2, style: 'analytical',
        forbidden: isAr ? 'لا تقم بصياغة الأسئلة. لا تقم بالتنسيق باستخدام a,b,c,d. فقط خطة التغطية.' : isEn ? 'Do not write questions. Do not format in a,b,c,d. Only the coverage plan.' : 'Ne pas rédiger de questions. Ne pas formater en a,b,c,d. Uniquement le plan de couverture.',
        memPrio: 3, maxTokens: 6000, created: now()
      };

      const a2_name = isAr ? `✍️ الوكيل 2 : محرر الأسئلة (${typeName})` : isEn ? `✍️ Agent 2 : MCQ Writer (${typeName})` : `✍️ Agent 2 : Rédacteur QCM (${typeName})`;
      const a2_desc = isAr ? `يقوم بصياغة ${numQuestions} سؤال QCM خام مع الإجابة الصحيحة و 3 مشتتات.` : isEn ? `Drafts the ${numQuestions} raw MCQ questions with the correct answer and 3 distractors.` : `Rédige les ${numQuestions} questions QCM brutes avec bonne réponse et 3 distracteurs.`;
      const a2_inst = isAr ? `أنت مهندس تقييم معتمد، متخصص في تصنيف بلوم.

**مهمتك الوحيدة** : بناءً على خطة التغطية المقدمة من الوكيل السابق والمستند الأصلي، صياغة ${numQuestions} سؤال QCM من ${typeName}.

**قواعد الصياغة** :
1. يجب أن يحتوي كل سؤال على: 1 إجابة صحيحة + 3 مشتتات.
2. يجب أن تحاكي المشتتات أخطاء حقيقية (E1 إلى E4).
3. يجب أن تستخدم المشتتات الثلاثة لسؤال واحد 3 أنواع مختلفة من الأخطاء (من E1-E4).
4. ممنوع: "لا شيء مما سبق"، "كل ما سبق".
5. يجب ألا تكون الإجابة الصحيحة هي الأطول دائمًا.
6. يجب أن يتوافق فعل السؤال مع مستوى بلوم المعلن.
7. إلزامي: يجب أن يحتوي كل سؤال على رابط ويكيبيديا باللغة الفرنسية حصراً بالشكل https://fr.wikipedia.org/wiki/[Article]. يمنع منعاً باتاً استخدام أي مواقع أخرى (مثل KhanAcademy وغيرها). استثناء للقاعدة: أنت مجبر على اختراع / استنتاج رابط ويكيبيديا المناسب، لا تستخدم الروابط الموجودة في ملف PDF.
8. قاعدة حاسمة حول الخيارات: نصوص الخيارات (الإجابة الصحيحة والمشتتات الثلاثة) يجب ألا تحتوي على أي أقواس توضيحية. اكتب فقط القيمة أو الجملة الخام للإجابة. يمنع منعًا باتًا إضافة "(خطأ في...)" أو "(إجابة صحيحة)" في النهاية. الشرح التعليمي مخصص بدقة لسطر الشرح (Explication).
9. قاعدة مطلقة وحاسمة: يمنع منعًا باتًا التلخيص، أو القطع، أو استخدام جمل مثل "(تكملة الأسئلة...)". يجب عليك كتابة جميع الأسئلة الـ ${numQuestions} من Q1 إلى Q${numQuestions}. أي قطع سيؤدي إلى تعطل النظام. اكتب جميع الكتل الـ ${numQuestions}.

**صيغة المخرجات** (نص عادي، بدون LaTeX):

1- [نص السؤال بالعربية]
a- [نص الخيار 1]
b- [نص الخيار 2]
[x] c- [نص الإجابة الصحيحة بالعربية]
d- [نص الخيار 3]
• Explication : [تبرير موجز بالعربية]
• Pour aller plus loin : https://fr.wikipedia.org/wiki/[article]

2- [السؤال التالي]
...

... وهكذا بالضبط من 1 حتى ${numQuestions} دون التوقف أبدًا.

مهم : لا تضع رقم السؤال "Q1" أو مستوى بلوم فوق كل سؤال. ابدأ مباشرة بـ "1-", "2-", ...

**مصدر وحيد** : ملف PDF المقدم. لا تخترع أي معلومات.`
      : isEn ? `You are a Certified Assessment Engineer, specialist in Bloom's Taxonomy.

**YOUR SOLE MISSION**: Based on the coverage plan provided by the previous agent AND the original document, write the ${numQuestions} MCQ questions for ${typeName}.

**WRITING RULES**:
1. Each question must have EXACTLY: 1 correct answer + 3 distractors.
2. Distractors must reproduce real errors (E1 to E4).
3. The 3 distractors for the same question must use 3 DIFFERENT error types (from E1-E4).
4. FORBIDDEN: "None of the above", "All of the above".
5. The correct answer must NOT systematically be the longest.
6. The verb in the stem must match the declared Bloom level.
7. MANDATORY: Each question MUST be accompanied by a VERY CONCISE scientific explanation (1 sentence max) and a French Wikipedia link EXACTLY formatted as https://fr.wikipedia.org/wiki/[Article_Name]. Other websites (like KhanAcademy, etc.) are STRICTLY FORBIDDEN. EXCEPTION: You MUST infer/invent the Wikipedia URL based on the subject; do NOT use URLs from the PDF.
8. CRITICAL RULE ON OPTIONS: Option texts (correct answer AND 3 distractors) MUST NOT CONTAIN ANY EXPLANATORY PARENTHESES. Write ONLY the raw answer value or sentence. ABSOLUTE PROHIBITION of adding "(error in...)" or "(Correct answer)" at the end. The pedagogical explanation is STRICTLY RESERVED for the Explanation line.
9. ABSOLUTE AND CRITICAL RULE: It is STRICTLY FORBIDDEN to summarize, truncate, or use phrases like "(Continued...)". You MUST write all ${numQuestions} questions from Q1 to Q${numQuestions}. ANY TRUNCATION WILL CRASH THE SYSTEM. Write all ${numQuestions} blocks.

**OUTPUT FORMAT** (plain text, NO LaTeX):

1- [Question text]
a- [Option 1 text]
b- [Option 2 text]
[x] c- [Correct answer text]
d- [Option 3 text]
• Explanation: [concise justification]
• Pour aller plus loin : https://fr.wikipedia.org/wiki/[article]

2- [Next question]
...

... and so on EXACTLY from 1 to ${numQuestions} without EVER stopping.

IMPORTANT: Do NOT add "Q1", "Q2" or Bloom level labels above each question. Start directly with "1-", "2-", ...

**SINGLE SOURCE**: The provided PDF document. No invented information.`
      : `Tu es un Ingénieur en Évaluation Certifié, spécialiste de la taxonomie de Bloom.

**TA MISSION UNIQUE** : À partir du plan de couverture fourni par l'agent précédent ET du document original, rédiger les ${numQuestions} questions QCM de ${typeName}.

**RÈGLES DE RÉDACTION** :
1. Chaque question doit avoir EXACTEMENT : 1 bonne réponse + 3 distracteurs.
2. Les distracteurs doivent reproduire des erreurs réelles (E1 à E4).
3. Les 3 distracteurs d'une même question doivent utiliser 3 types d'erreurs DIFFÉRENTS (parmi E1-E4).
4. INTERDIT : "Aucune de ces réponses", "Toutes ces réponses".
5. La bonne réponse ne doit PAS être systématiquement la plus longue.
6. Le verbe de l'énoncé doit correspondre au niveau de Bloom déclaré.
7. OBLIGATOIRE : Chaque question doit être accompagnée d'une explication scientifique TRÈS CONCISE (1 phrase max) et d'un lien Wikipédia en français EXACTEMENT sous la forme https://fr.wikipedia.org/wiki/[Nom_de_l_article]. Les autres sites (KhanAcademy, PourLaScience, etc.) sont STRICTEMENT INTERDITS. EXCEPTION À LA RÈGLE : Tu DOIS déduire/inventer ce lien Wikipédia en fonction du sujet de la question, NE REPRENDS PAS les liens du PDF.
8. RÈGLE CRITIQUE SUR LES OPTIONS : Les textes des options (la bonne réponse ET les 3 distracteurs) NE DOIVENT CONTENIR AUCUNE PARENTHÈSE EXPLICATIVE. Écris UNIQUEMENT la valeur ou la phrase de réponse brute. INTERDICTION ABSOLUE d'ajouter "(erreur de...)" ou "(Bonne réponse)" à la fin. L'explication pédagogique est STRICTEMENT RÉSERVÉE à la ligne d'Explication.
9. RÈGLE ABSOLUE ET CRITIQUE : Il est STRICTEMENT INTERDIT de résumer, de couper, ou d'utiliser des phrases comme "(Suite des questions...)". Tu DOIS écrire l'intégralité des ${numQuestions} questions de Q1 à Q${numQuestions}. TOUTE TRONCATURE PROVOQUERA UN CRASH DU SYSTÈME. Écris les ${numQuestions} blocs.

**FORMAT DE SORTIE** (texte brut, PAS de LaTeX) :

1- [Texte de la question]
a- [Texte de l'option 1]
b- [Texte de l'option 2]
[x] c- [Texte de la bonne réponse]
d- [Texte de l'option 3]
• Explication : [justification concise]
• Pour aller plus loin : https://fr.wikipedia.org/wiki/[article]

2- [Question suivante]
...

... et ainsi de suite EXACTEMENT de 1 jusqu'à ${numQuestions} sans JAMAIS t'arrêter.

IMPORTANT : N'ajoute PAS d'en-tête "Q1", "Q2" ou de niveau de Bloom au-dessus de chaque question. Commence directement par "1-", "2-", ...

**SOURCE UNIQUE** : Le document PDF fourni. Aucune information inventée.`;

      const agent2 = {
        id: `wf-${prefix}-agent2`,
        name: a2_name,
        desc: a2_desc,
        instructions: a2_inst,
        primer: isAr ? `ألتزم رسميًا بصياغة ${numQuestions} سؤال QCM بالكامل، دون أي قطع أو تلخيص.` : isEn ? `I formally commit to writing all ${numQuestions} MCQ questions in full, without any truncation or summary.` : `Je m'engage formellement à rédiger les ${numQuestions} questions QCM en entier, sans aucune coupure ni résumé.`,
        tags: ['MCQ', 'Writing', 'Distractors', 'Step 2'],
        temperature: 0.3, style: 'pedagogical',
        forbidden: isAr ? 'يمنع منعًا باتًا التلخيص أو القطع (لا توجد "تكملة للأسئلة"). لا تقم بالتنسيق باستخدام a,b,c,d (بهذا الشكل النهائي). لا تستخدم LaTeX.' : isEn ? 'STRICTLY FORBIDDEN TO TRUNCATE OR SUMMARIZE (no "continued..."). Do not format in a,b,c,d final form. Do not use LaTeX.' : 'INTERDIT DE TRONQUER OU RÉSUMER (pas de "suite des questions"). Ne pas formater en a,b,c,d. Ne pas utiliser de LaTeX.',
        memPrio: 3, maxTokens: 14000, created: now()
      };

      const a3_name = isAr ? `🎲 الوكيل 3 : المنسق (${typeName})` : isEn ? `🎲 Agent 3 : Formatter (${typeName})` : `🎲 Agent 3 : Formatteur (${typeName})`;
      const a3_desc = isAr ? `ينظف الـ QCM ويعيد توزيع الإجابات الصحيحة بشكل عشوائي بين المواضع a,b,c,d.` : isEn ? `Cleans the MCQ and randomly redistributes correct answers among positions a,b,c,d.` : `Nettoie le QCM et redistribue aléatoirement les bonnes réponses entre les positions a,b,c,d.`;
      const a3_inst = isAr ? `**الدور:** أنت خبير في تصميم التقييمات وخوارزمية منطقية دقيقة للغاية.

**السياق:** أقدم لك أسئلة متعددة الاختيارات (QCM) خام. حاليًا، يحتوي هذا الـ QCM على عيوب: الإجابة الصحيحة (المشار إليها بعلامة \`[x]\`) موضوعة دائمًا في الموضع \`a-\`، وقد تكون هناك أخطاء مطبعية أو خيارات مكررة في النص المصدر.

**الهدف:** تنظيف الـ QCM وإعادة توزيع الإجابات الصحيحة بشكل عادل وعشوائي بين المواضع a و b و c و d، مع الحفاظ الصارم على التنسيق العام.

**قواعد المعالجة الصارمة (يجب اتباعها بهذا الترتيب الدقيق):**

**الخطوة 1: إنشاء مفتاح التوزيع الديناميكي**
* احسب النسبة المثالية لتوزيع مثالي: \${numQuestions} / 4.
* أنشئ قائمة بـ \${numQuestions} حرفًا (a أو b أو c أو d) تحترم هذا التوزيع العادل بشكل صارم.
* اخلط هذه القائمة بحيث يبدو الترتيب عشوائيًا تمامًا (بدون تسلسلات متكررة).
* اعرض مفتاح التوزيع هذا في شكل قائمة مرقمة أعلى إجابتك لإثبات حساباتك.

**الخطوة 2: إعادة كتابة الـ QCM**
لكل سؤال (من 1 إلى \${numQuestions})، قم بتعديل مكان الإجابة الصحيحة بناءً على الحرف المخصص في الخطوة 1:
1. ضع نص الإجابة القديمة المشار إليها بـ \`[x]\` في موضع الحرف الهدف الجديد. احتفظ بعلامة \`[x] \` قبل هذا الحرف الجديد.
2. خذ الإجابات الخاطئة الثلاث المتبقية وضعها في الأحرف الثلاثة الفارغة الأخرى، **مع الحفاظ على ترتيب ظهورها الأصلي**.
3. **التنسيق:** يجب عليك الحفاظ بشكل صارم على التنسيق الأصلي (النص، النقاط، الروابط).
    مثال للتنسيق المتوقع:
    1- [نص السؤال]
    [حرف]- [إجابة خاطئة]
    [x] [حرف]- [الإجابة الصحيحة المنقولة]
    [حرف]- [إجابة خاطئة]
    [حرف]- [إجابة خاطئة]
    • Explication : [نص الشرح]
    • Pour aller plus loin : https://fr.wikipedia.org/wiki/[article]

4. احترم ترتيب الخيارات a,b,c,d بدقة.`
      : isEn ? `**Role:** You are an Expert in Assessment Design and an extremely rigorous logical Algorithm.

**Context:** I provide you with a raw MCQ. Currently, the correct answer (marked \`[x]\`) is always placed in position \`a-\`, and there may be typos or duplicate options in the source text.

**Goal:** Clean the MCQ and redistribute the correct answers fairly and randomly among positions a, b, c, and d, while strictly preserving the overall formatting.

**Strict processing rules (follow in this exact order):**

**STEP 1: Create the dynamic distribution key**
* Calculate the ideal ratio for a perfect distribution: \${numQuestions} / 4.
* Generate a list of \${numQuestions} letters (a, b, c, or d) strictly respecting this fair distribution.
* Shuffle this list so the order appears completely random (no repeating sequences).
* Display this distribution key as a numbered list at the top of your response to prove your calculation.

**STEP 2: Rewrite the MCQ**
For each question (from 1 to \${numQuestions}), move the correct answer based on the letter assigned in Step 1:
1. Place the text of the old answer marked \`[x]\` at the position of the new target letter. Keep the \`[x] \` marker before this new letter.
2. Take the 3 remaining wrong answers and place them in the 3 other empty letters, **preserving their original order of appearance**.
3. **Formatting:** Strictly preserve the original formatting (text, bullets, links).
   Expected format example:
   1- [Question text]
   [letter]- [Wrong answer]
   [x] [letter]- [Correct answer moved]
   [letter]- [Wrong answer]
   [letter]- [Wrong answer]
   • Explanation: [Text]
   • Learn more: [Link]

4. Strictly respect the a,b,c,d order of options.`
      : `**Rôle :** Tu es un Expert en conception d'évaluations et un Algorithme logique extrêmement rigoureux.

**Contexte :** Je te fournis un QCM (Questions à Choix Multiples) brut. Actuellement, ce QCM présente des défauts : la bonne réponse (signalée par la balise \`[x]\`) est systématiquement placée en position \`a-\`, et il peut y avoir des erreurs de frappe ou des options doublées dans le texte source.

**Objectif :** Nettoyer le QCM et redistribuer les bonnes réponses de manière équitable et aléatoire entre les positions a, b, c et d, tout en conservant strictement la mise en forme globale.

**Règles strictes de traitement (à suivre dans cet ordre précis) :**

**ÉTAPE 1 : Création de la clé de répartition dynamique**
*   Calcule le ratio idéal pour une répartition parfaite : \${numQuestions} / 4.
*   Génère une liste de \${numQuestions} lettres (a, b, c, ou d) respectant cette répartition équitable de manière stricte. 
*   Mélange cette liste pour que l'ordre semble totalement aléatoire (pas de suites répétitives).
*   Affiche cette clé de répartition sous forme de liste numérotée en haut de ta réponse pour prouver ton calcul.

**ÉTAPE 2 : Réécriture du QCM**
Pour chaque question (de 1 à \${numQuestions}), modifie la place de la bonne réponse en fonction de la lettre attribuée à l'Étape 1 :
1.  Place le texte de l'ancienne réponse indiquée par \`[x]\` à la position de la nouvelle lettre cible. Conserve bien la balise \`[x] \` devant cette nouvelle lettre.
2.  Prends les 3 mauvaises réponses restantes et place-les dans les 3 autres lettres vides, **en conservant leur ordre d'apparition d'origine**.
3.  **Mise en forme :** Tu dois conserver STRICTEMENT la mise en forme originale (texte, puces, liens). 
    Exemple de format attendu :
    1- [Texte de la question]
    [lettre]- [Mauvaise réponse]
    [x] [lettre]- [Bonne réponse déplacée]
    [lettre]- [Mauvaise réponse]
    [lettre]- [Mauvaise réponse]
    • Explication : [Texte]
    • Pour aller plus loin : https://fr.wikipedia.org/wiki/[article]

4. respectez strictement l'ordre a,b,c,d des propositions.`;

      const agent3 = {
        id: `wf-${prefix}-agent3`,
        name: a3_name,
        desc: a3_desc,
        instructions: a3_inst,
        primer: isAr ? `ألتزم رسميًا بتوزيع الإجابات عشوائياً وتنسيق \${numQuestions} سؤال QCM بالكامل، دون أي قطع.` : isEn ? `I formally commit to redistributing answers and formatting all \${numQuestions} MCQ questions in full, without any truncation.` : `Je m'engage formellement à redistribuer les réponses et formater les \${numQuestions} questions QCM en entier, sans aucune coupure.`,
        tags: ['MCQ', 'Randomization', 'Step 3'],
        temperature: 0.1, style: 'technical',
        forbidden: isAr ? 'يمنع التلخيص أو القطع. يجب أن تكون الإجابات الصحيحة موزعة عشوائياً بشكل متساوٍ بين a,b,c,d.' : isEn ? 'STRICTLY FORBIDDEN TO TRUNCATE OR SUMMARIZE. Correct answers MUST be evenly distributed among a,b,c,d.' : 'INTERDIT DE TRONQUER OU RÉSUMER. Les bonnes réponses DOIVENT être réparties équitablement entre a,b,c,d.',
        memPrio: 3, maxTokens: 14000, created: now()
      };

      const a4_name = isAr ? `🔬 الوكيل 4 : منسق LaTeX (${typeName})` : isEn ? `🔬 Agent 4 : LaTeX Formatter (${typeName})` : `🔬 Agent 4 : Formateur LaTeX (${typeName})`;
      const a4_desc = isAr ? `يطبق تنسيق LaTeX العلمي الصارم.` : isEn ? `Applies strict scientific LaTeX formatting ($ delimiters, chemistry, SI units).` : `Applique le formatage LaTeX scientifique strict (délimiteurs $, chimie, unités SI).`;
      const a4_inst = isAr ? `أنت خبير في الطباعة العلمية LaTeX.

**مهمتك الوحيدة** : أخذ أسئلة QCM المتسلسلة المقدمة من الوكيل السابق وتطبيق تنسيق LaTeX العلمي الصارم لـ Quiz Player.

**قواعد التنسيق الإلزامية** :
1. قاعدة المحددات: استخدم علامات الدولار المفردة $ ... $ فقط للرموز الرياضية، والأرقام، والصيغ الكيميائية المكتوبة بحروف لاتينية. يمنع منعاً باتاً إدخال أي كلمة عربية داخل علامات $ أو استخدام \\text{} للكلمات العربية، لأن ذلك يفكك اتصال الحروف. يجب أن يبقى النص العربي دائماً خارج الـ LaTeX.
2. الرموز: يمنع استخدام رموز Unicode. استخدم LaTeX للأسهم والرموز الرياضية (مثال: \\rightarrow).
3. الكيمياء: اجمع الجزيء بالكامل في كتلة $ واحدة (مثال: $H_2O$).
4. الوحدات: استخدم التلدة ~ للمسافة غير القابلة للكسر بين الرقم والوحدة.
5. الترقيم: نقاط وفواصل نهاية الجملة خارج محددات $.
6. حظر الخط العريض: لا تضع أي علامة ماركداون للخط العريض (لا **). يجب أن يكون رقم السؤال هو الرقم التسلسلي الحقيقي (مثال: "1-"، "2-"، وما إلى ذلك، وليس "**1**-").
7. علامة الإجابة الصحيحة: احتفظ بالضبط بـ "[x] " أمام حرف الإجابة الصحيحة. لا تحوله أبدًا إلى "**x** ".
8. قاعدة الأسطر السبعة: يجب ترتيب كل سؤال بدقة على 7 أسطر (نص السؤال، a، b، c، d، الشرح، URL). لا يسمح بأي فاصل أسطر داخل نص السؤال أو الخيارات. اترك سطرًا فارغًا واحدًا فقط بين سؤالين. لا يوجد خط فصل (لا --- أو ***).

**صيغة المخرجات** : كتلة نصية تحتوي على ${numQuestions} سؤال منسق، بالضبط بهذا التنسيق:


<VERIFICATION_DISTRIBUTION>
  ${seqName}: a:X b:X c:X d:X -> Total:${numQuestions}
</VERIFICATION_DISTRIBUTION>

1- [نص السؤال بالعربية - النص العربي خارج LaTeX]
[x] a- [الخيار الصحيح - النص العربي خارج LaTeX]
b- [خيار - النص العربي خارج LaTeX]
c- [خيار - النص العربي خارج LaTeX]
d- [خيار - النص العربي خارج LaTeX]
• Explication : [التبرير بالعربية - النص العربي خارج LaTeX]
• Pour aller plus loin : https://fr.wikipedia.org/wiki/[article]

**ممنوع منعًا باتًا** : 
1. لا \\begin{questions}، لا \\choice. نص عادي + LaTeX فقط.
2. يمنع منعًا باتًا التلخيص أو قطع النتيجة. يجب عليك إنشاء ${numQuestions} سؤال كاملة بدون أي استثناء.`
      : isEn ? `You are a Scientific LaTeX Typography Expert.

**YOUR SOLE MISSION**: Take the sequenced MCQs provided by the previous agent and apply strict scientific LaTeX formatting for Quiz Player.

**MANDATORY FORMATTING RULES**:
1. DELIMITER RULE: Use $ ... $ ONLY for real mathematical variables, subscripts, superscripts, chemical formulas, or equations. NEVER wrap ordinary English words or proper nouns inside $\\text{...}$ — leave them as plain text. Examples: $ATP$, $CO_2$, $NADH,H^+$, $C_6H_{12}O_6$, $\\rightarrow$. But write: "mitochondrie", "glycolyse", "ATP synthase" (not $\\text{mitochondrie}$).
2. SYMBOLS: FORBIDDEN to use Unicode symbols. Use LaTeX (e.g., \\rightarrow).
3. CHEMISTRY: Group the entire molecule in a single $ block (e.g., $C_{6}H_{12}O_{6}$).
4. UNITS: Use the tilde ~ for non-breaking space between number and unit.
5. PUNCTUATION: End-of-sentence periods and commas OUTSIDE $ delimiters.
6. NO BOLD: Do NOT use any markdown bold tags (no **). The question number MUST be the real sequential number (e.g., "1-", "2-", not "**1**-").
7. CORRECT ANSWER MARKER: Keep EXACTLY "[x] " before the correct answer letter. Never transform it into "**x** ".
8. 7-LINE RULE: Each question MUST be strictly laid out on 7 lines (stem, a, b, c, d, explanation, URL). NO line break inside a stem or option. Leave only one blank line between two questions. NO separator line (no --- or ***).

**OUTPUT FORMAT**: A text block containing the ${numQuestions} formatted questions, EXACTLY in this format:


<VERIFICATION_DISTRIBUTION>
  ${seqName}: a:X b:X c:X d:X -> Total:${numQuestions}
</VERIFICATION_DISTRIBUTION>

1- [Question stem with LaTeX]
a- [Option with LaTeX]
b- [Option with LaTeX]
[x] c- [Correct option with LaTeX]
d- [Option with LaTeX]
• Explanation: [Justification with LaTeX]
• Learn more: https://en.wikipedia.org/wiki/...

(Note: The [x] marks the correct answer. Keep it EXACTLY on its original letter.)

**ABSOLUTE PROHIBITION**:
1. No \\begin{questions}, no \\choice. PLAIN TEXT + inline LaTeX only.
2. IT IS STRICTLY FORBIDDEN TO TRUNCATE OR SUMMARIZE THE RESULT. You MUST generate all ${numQuestions} questions without any exception.`
      : `Tu es un Expert en Typographie Scientifique LaTeX.

**TA MISSION UNIQUE** : Prendre les QCM séquencés fournis par l'agent précédent et appliquer le formatage scientifique LaTeX strict pour le Quiz Player.

**RÈGLES DE FORMATAGE OBLIGATOIRES** :
1. RÈGLE DES DÉLIMITEURS : Utilise $ ... $ UNIQUEMENT pour les vraies variables mathématiques, indices, exposants, formules chimiques ou équations. N'encapsule JAMAIS des mots français ordinaires dans $\\text{...}$ — laisse-les en texte brut. Exemples corrects : $ATP$, $CO_2$, $NADH,H^+$, $C_6H_{12}O_6$, $\\rightarrow$. Mais écris : "mitochondrie", "glycolyse", "ATP synthase" (et non $\\text{mitochondrie}$).
2. SYMBOLES : INTERDICTION des symboles Unicode. Utilise LaTeX (ex: \\rightarrow).
3. CHIMIE : Regroupe la molécule entière dans un seul bloc $.
4. UNITÉS : Utilise le tilde ~ pour l'espace insécable.
5. PONCTUATION : Points et virgules de fin de phrase en DEHORS des délimiteurs $.
6. INTERDICTION DU GRAS : Ne mets AUCUNE balise markdown de gras (pas de **). Le numéro de question DOIT être le VRAI numéro séquentiel (ex: "1-", "2-", etc. et surtout pas "**1**-"). ATTENTION: Ne mets pas "20-" partout !
7. MARQUEUR DE BONNE RÉPONSE : Conserve EXACTEMENT "[x] " devant la lettre de la bonne réponse. Ne le transforme jamais en "**x** ".
8. RÈGLE DES 7 LIGNES : Chaque question DOIT être disposée strictement sur 7 lignes (énoncé, a, b, c, d, explication, URL). AUCUN retour à la ligne n'est autorisé à l'intérieur de l'énoncé ou des options. Laisse un seul saut de ligne vide entre deux questions. AUCUN trait de séparation (pas de --- ou ***).

**FORMAT DE SORTIE** : Un bloc de texte contenant les ${numQuestions} questions formatées, EXACTEMENT dans ce format :


<VERIFICATION_DISTRIBUTION>
  ${seqName}: a:X b:X c:X d:X -> Total:${numQuestions}
</VERIFICATION_DISTRIBUTION>

1- [Énoncé avec LaTeX]
a- [Option avec LaTeX]
b- [Option avec LaTeX]
[x] c- [Option correcte avec LaTeX]
d- [Option avec LaTeX]
• Explication : [Justification avec LaTeX]
• Pour aller plus loin : https://fr.wikipedia.org/wiki/[article]

(Note : Le [x] indique la bonne réponse. Conservez-le EXACTEMENT sur sa lettre d'origine.)

**INTERDIT ABSOLU** : 
1. Pas de \\begin{questions}, pas de \\choice. Format TEXTE SIMPLE + LaTeX en ligne.
2. IL EST STRICTEMENT INTERDIT DE TRONQUER OU RÉSUMER LE RÉSULTAT. Tu DOIS générer l'intégralité des ${numQuestions} questions sans aucune exception.`;

      const agent4 = {
        id: `wf-${prefix}-agent4`,
        name: a4_name,
        desc: a4_desc,
        instructions: a4_inst,
        primer: isAr ? `ألتزم رسميًا بتنسيق ${numQuestions} QCM بالكامل، دون أي قطع.` : isEn ? `I formally commit to formatting all ${numQuestions} MCQs in full, without any truncation.` : `Je m'engage formellement à formater les ${numQuestions} QCM en entier, sans aucune coupure.`,
        tags: ['MCQ', 'LaTeX', 'Formatting', 'Step 4'],
        temperature: 0.1, style: 'technical',
        forbidden: isAr ? 'يمنع التلخيص أو القطع. لا تستخدم \\begin{questions}. لا تقم بتعديل موضع الإجابات.' : isEn ? 'STRICTLY FORBIDDEN TO TRUNCATE OR SUMMARIZE. Do not use \\begin{questions}. Do not modify answer positions.' : 'INTERDIT DE TRONQUER OU RÉSUMER. Ne pas utiliser \\begin{questions}. Ne pas modifier la position des réponses.',
        memPrio: 3, maxTokens: 14000, created: now()
      };

      const a5_name = isAr ? `✅ الوكيل 5 : المدقق النهائي (${typeName})` : isEn ? `✅ Agent 5 : Final Verifier (${typeName})` : `✅ Agent 5 : Vérificateur Final (${typeName})`;
      const a5_desc = isAr ? `مراقبة الجودة النهائية قبل التصدير إلى Quiz Player.` : isEn ? `Final quality control before export for Quiz Player.` : `Contrôle qualité final avant export pour Quiz Player.`;
      const a5_inst = isAr ? `أنت مراقب الجودة النهائي.

**مهمتك الوحيدة** : التحقق من الامتثال التام للنتيجة وإنتاج الكتلة النصية النهائية الجاهزة لـ Quiz Player.

**عمليات التحقق الإلزامية** :
- **V1 الاتساق**: الشرح يبرر بالضبط الخيار المميز بعلامة [x].
- **V2 التنسيق**: يجب ترتيب كل سؤال بدقة على 7 أسطر (سطر واحد للسؤال، 4 أسطر للخيارات، سطر للشرح، سطر للرابط). اترك سطرًا فارغًا واحدًا فقط بين كتلتين. لا يوجد خط فصل (لا --- ou ***). يجب أن يكون الرقم متصلاً بالشرطة (مثال: "1- "، "2- "). علامة دقيقة "[x] ". لا يوجد خط عريض (**). لا ينبغي أن يحتوي الرابط على أقواس (اكتب "https://..." وليس "[https://...]"). إليك النموذج الصارم:
1- نص السؤال ؟
a- خيار
b- خيار
[x] c- الخيار الصحيح
d- خيار
• Explication : نص الشرح بالعربية.
• Pour aller plus loin : https://fr.wikipedia.org/wiki/Article

(ملاحظة: علامة [x] تشير إلى الإجابة الصحيحة. احتفظ بها بالضبط على حرفها الأصلي.)
- **V3 المشتتات**: 3 أنواع مختلفة من الأخطاء (E1-E4) لكل سؤال.
- **V4 الإجابة**: يجب أن تكون هناك إجابة واحدة صحيحة فقط مميزة بالعلامة \`[x] \` لكل سؤال (في الموضع a أو b أو c أو d).
- **V5 LaTeX**: يتم استبدال جميع رموز Unicode بـ LaTeX.
- **V6 الطول والاكتمال**: تأكد من وجود جميع الأسئلة الـ \${numQuestions}. لا تقطع النتيجة.
- **V7 التنظيف**: قم بإزالة أي تعليق أو قوس زائد في نهاية الخيارات. يجب أن تكون الخيارات نظيفة 100%.

**إذا فشل التحقق** : قم بالتصحيح بصمت دون ذكره.

**المخرجات النهائية** : أنتج فقط الكتلة النصية المصححة والكاملة.
**قاعدة مطلقة وحاسمة** : يمنع منعًا باتًا قطع النتيجة. يجب عليك التحقق وعرض جميع الأسئلة الـ \${numQuestions} من Q1 إلى Q\${numQuestions}. إذا كانت النتيجة تحتوي على \${numQuestions} سؤال، يجب أن تحتوي مخرجاتك على \${numQuestions} سؤال بالضبط. لا تضع أي تعليق، ولا علامة <مسودة>، ولا تلخص أبدًا.`
      : isEn ? `You are the Final Quality Controller.

**YOUR SOLE MISSION**: Verify TOTAL compliance of the result and produce the final text block ready for Quiz Player.

**MANDATORY CHECKS**:
- **V1 Consistency**: The explanation justifies EXACTLY the option marked [x].
- **V2 Format**: Each question MUST be strictly laid out on exactly 7 lines (1 stem line, 4 option lines, 1 explanation line, 1 URL line). Leave only one blank line between two blocks. NO separator line (no --- or ***). The number MUST be attached to the dash (e.g., "1- ", "2- "). Exact marker "[x] ". NO markdown bold (**). The URL must NOT have brackets (write "https://..." not "[https://...]"). Strict model:
1- Question stem?
a- Option
b- Option
[x] c- Correct option
d- Option
• Explanation: Explanation text.
• Learn more: https://en.wikipedia.org/wiki/Article

(Note: The [x] marks the correct answer. Keep it EXACTLY on its original letter.)
- **V3 Distractors**: 3 different error types (E1-E4) per question.
- **V4 Answer**: Only one correct answer marked \`[x] \` must be present for each question (in position a, b, c, or d).
- **V5 LaTeX**: All Unicode symbols are replaced by LaTeX.
- **V6 Length and Completeness**: Make sure all ${numQuestions} questions are present. Do not truncate the result.
- **V7 Cleanup**: Remove any stray comment or parenthesis at the end of options (e.g., remove "(Correct answer)" or "(Calculation error)"). Options must be 100% clean.

**IF A CHECK FAILS**: Correct silently WITHOUT mentioning it.

**FINAL OUTPUT**: Produce ONLY the corrected, complete text block.
**ABSOLUTE AND CRITICAL RULE**: IT IS STRICTLY FORBIDDEN TO TRUNCATE THE RESULT. You MUST verify and display all ${numQuestions} questions from Q1 to Q${numQuestions}. If the result contains ${numQuestions} questions, your output MUST contain exactly ${numQuestions} questions. Add NO comment, NO <draft> tag, and NEVER summarize.`
      : `Tu es le Contrôleur Qualité Final.

**TA MISSION UNIQUE** : Vérifier la conformité TOTALE du résultat et produire le bloc de texte final prêt pour le Quiz Player.

**VÉRIFICATIONS OBLIGATOIRES** :
- **V1 Cohérence** : L'explication justifie EXACTEMENT l'option marquée [x].
- **V2 Format** : Chaque question DOIT être disposée strictement sur 7 lignes exactes (1 ligne d'énoncé, 4 lignes d'options, 1 ligne d'explication, 1 ligne d'URL). Laisse un seul saut de ligne vide entre deux blocs. AUCUN trait de séparation (pas de --- ou ***). Le numéro DOIT être collé au tiret (ex: "1- ", "2- "). Marqueur exact "[x] ". AUCUN gras markdown (**). L'URL ne doit PAS avoir de crochets (écris "https://..." et non "[https://...]"). Voici le modèle STRICT :
1- Énoncé de la question ?
a- Option
b- Option
[x] c- Option correcte
d- Option
• Explication : Texte de l'explication.
• Pour aller plus loin : https://fr.wikipedia.org/wiki/Article

(Note : Le [x] indique la bonne réponse. Conservez-le EXACTEMENT sur sa lettre d'origine.)
- **V3 Distracteurs** : 3 types d'erreurs différents (E1-E4) par question.
- **V4 Réponse** : Une seule bonne réponse marquée par \`[x] \` doit être présente pour chaque question (en position a, b, c ou d).
- **V5 LaTeX** : Tous les symboles Unicode sont remplacés par du LaTeX.
- **V6 Longueur et Complétude** : Assure-toi que les ${numQuestions} questions sont bien présentes. Ne tronque pas le résultat.
- **V7 Nettoyage** : Supprime tout commentaire ou parenthèse parasite à la fin des options (ex: supprime "(Bonne réponse)" ou "(Erreur de calcul)"). Les options doivent être 100% propres.

**SI UNE VÉRIFICATION ÉCHOUE** : Corrige silencieusement SANS le mentionner.

**SORTIE FINALE** : Produis UNIQUEMENT le bloc de texte corrigé, complet.
**RÈGLE ABSOLUE ET CRITIQUE** : IL EST STRICTEMENT INTERDIT DE TRONQUER LE RÉSULTAT. Tu DOIS vérifier et afficher l'intégralité des ${numQuestions} questions de Q1 à Q${numQuestions}. Si le résultat contient ${numQuestions} questions, ta sortie DOIT contenir exactement ${numQuestions} questions. Ne mets AUCUN commentaire, AUCUNE balise <brouillon>, et ne résume JAMAIS.`;

      const agent5 = {
        id: `wf-${prefix}-agent5`,
        name: a5_name,
        desc: a5_desc,
        instructions: a5_inst,
        primer: isAr ? `ألتزم رسميًا بالتحقق وإخراج ${numQuestions} QCM بالكامل، دون أي قطع.` : isEn ? `I formally commit to verifying and outputting all ${numQuestions} MCQs in full, without any truncation.` : `Je m'engage formellement à vérifier et sortir les ${numQuestions} QCM en entier, sans aucune coupure.`,
        tags: ['MCQ', 'Verification', 'Quality', 'Step 5'],
        temperature: 0.1, style: 'technical',
        forbidden: isAr ? 'يمنع التلخيص أو القطع. لا تضف تعليقات. أخرج فقط الكتلة النهائية الكاملة.' : isEn ? 'STRICTLY FORBIDDEN TO TRUNCATE OR SUMMARIZE. Do not add comments. Output ONLY the final complete block.' : 'INTERDIT DE TRONQUER OU RÉSUMER. Ne pas ajouter de commentaires. Sortir UNIQUEMENT le bloc final complet.',
        memPrio: 3, maxTokens: 14000, created: now()
      };

      await db.put('agents', agent1);
      await db.put('agents', agent2);
      await db.put('agents', agent3);
      await db.put('agents', agent4);
      await db.put('agents', agent5);

      let wfName = '';
      if (prefix === 'fondamentaux') wfName = "QCM-Fr 1";
      else if (prefix === 'approfondissement') wfName = "QCM-Fr 2";
      else if (prefix === 'fondamentaux-ar') wfName = "QCM-Ar 1";
      else if (prefix === 'approfondissement-ar') wfName = "QCM-Ar2";
      else if (prefix === 'fundamentals-en') wfName = "MCQ-En 1";
      else if (prefix === 'advanced-en') wfName = "MCQ-En 2";

      const workflow = {
        id: `wf-qcm-${prefix}`,
        name: wfName,
        desc: isAr ? `سلسلة من 5 خطوات مخصصة للجزء ${typeName} (${numQuestions} سؤال).` : isEn ? `5-step workflow dedicated to the ${typeName} section (${numQuestions} questions).` : `Workflow en 5 étapes dédié à la partie ${typeName} (${numQuestions} questions).`,
        steps: [
          { agentId: agent1.id, instructionCustom: '' },
          { agentId: agent2.id, instructionCustom: isAr ? `قم بصياغة \${numQuestions} سؤال QCM من \${typeName} باتباع خطة التغطية.` : isEn ? `Write the \${numQuestions} MCQ questions for \${typeName} following the coverage plan.` : `Rédige les \${numQuestions} questions QCM de \${typeName} en suivant le plan de couverture.` },
          { agentId: agent3.id, instructionCustom: isAr ? `قم بإعادة توزيع الإجابات الصحيحة بشكل عشوائي ومتساوٍ على المواضع a,b,c,d.` : isEn ? `Randomly and evenly redistribute the correct answers among positions a, b, c, and d.` : `Redistribue les bonnes réponses de manière équitable et aléatoire entre les positions a, b, c et d.` },
          { agentId: agent4.id, instructionCustom: isAr ? `قم بتطبيق تنسيق LaTeX العلمي الصارم على أسئلة QCM هذه.` : isEn ? `Apply strict scientific LaTeX formatting to these MCQ questions.` : `Applique le formatage LaTeX scientifique strict à ces QCM.` },
          { agentId: agent5.id, instructionCustom: isAr ? `تحقق من الامتثال التام وأخرج فقط الكتلة النصية النهائية الجاهزة لـ Quiz Player.` : isEn ? `Verify total compliance and output ONLY the final text block ready for Quiz Player.` : `Vérifie la conformité totale et sors UNIQUEMENT le bloc de texte final prêt pour le Quiz Player.` }
        ],
        created: now()
      };
      await db.put('workflows', workflow);
    };

    // Nettoyage des anciens workflows et agents
    try { await db.delete('workflows', 'wf-qcm-sequence'); } catch(e) {}
    try { await db.delete('agents', 'wf-agent1-analyste-pdf'); } catch(e) {}
    try { await db.delete('agents', 'wf-agent2-redacteur-qcm'); } catch(e) {}
    try { await db.delete('agents', 'wf-agent3-sequenceur'); } catch(e) {}
    try { await db.delete('agents', 'wf-agent4-formateur-latex'); } catch(e) {}
    try { await db.delete('agents', 'wf-agent5-verificateur'); } catch(e) {}

    const forceAll = arguments[0] === true;

    // 1. Fondamentaux (20 questions) - Français
    await createAgentsForWorkflow(
      'fondamentaux',
      'Fondamentaux',
      '📘',
      '- **Fondamentaux** : 6 Q Niv.1 (Mémorisation), 8 Q Niv.2 (Compréhension), 6 Q Niv.3 (Application).',
      20,
      'SÉRIE 1',
      'fr',
      true
    );

    // 2. Approfondissement (20 questions) - Français
    await createAgentsForWorkflow(
      'approfondissement',
      'Approfondissement',
      '📙',
      '- **Approfondissement** : 5 Q Niv.3 (Application), 8 Q Niv.4 (Analyse), 5 Q Niv.5 (Évaluation), 2 Q Niv.6 (Synthèse).',
      20,
      'SÉRIE 2',
      'fr',
      true
    );

    // 3. Fondamentaux (20 questions) - Arabe
    await createAgentsForWorkflow(
      'fondamentaux-ar',
      'استرداد المعارف',
      '📘',
      '- **استرداد المعارف** : 6 Q Niv.1 (مستوى 1 - تذكر), 8 Q Niv.2 (مستوى 2 - فهم), 6 Q Niv.3 (مستوى 3 - تطبيق).',
      20,
      'سلسلة 1',
      'ar',
      true
    );

    // 4. Approfondissement (20 questions) - Arabe
    await createAgentsForWorkflow(
      'approfondissement-ar',
      'الاستدلال العلمي',
      '📙',
      '- **الاستدلال العلمي** : 5 Q Niv.3 (مستوى 3 - تطبيق), 8 Q Niv.4 (مستوى 4 - تحليل), 5 Q Niv.5 (مستوى 5 - تقييم), 2 Q Niv.6 (مستوى 6 - تركيب).',
      20,
      'سلسلة 2',
      'ar',
      true
    );

    // 5. Fundamentals (20 questions) - English
    await createAgentsForWorkflow(
      'fundamentals-en',
      'Fundamentals',
      '📘',
      '- **Fundamentals**: 6 Q Level 1 (Recall), 8 Q Level 2 (Understanding), 6 Q Level 3 (Application).',
      20,
      'SERIES 1',
      'en',
      true
    );

    // 6. Advanced (20 questions) - English
    await createAgentsForWorkflow(
      'advanced-en',
      'Advanced',
      '📙',
      '- **Advanced**: 5 Q Level 3 (Application), 8 Q Level 4 (Analysis), 5 Q Level 5 (Evaluation), 2 Q Level 6 (Synthesis/Creation).',
      20,
      'SERIES 2',
      'en',
      true
    );

    console.log('[INIT] Workflows QCM (FR/AR/EN) created successfully.');
  } catch(e) {
    console.error('[INIT] Error creating QCM workflows:', e);
  }
}

// ════════════════════════════════════════
// ENGLISH WORKFLOWS INITIALIZATION
// ════════════════════════════════════════

async function initializeDefaultAgentsEN(force = false) {
  try {
    const existingAgents = await db.getAll('agents') || [];
    const hasDefault = existingAgents.some(a => a.id === 'default-qcm-english-expert');
    if (!force && hasDefault) return;

    const DEFAULT_AGENT_DESC = `You are an Expert Consortium composed of:\n1. A Subject-Matter Pedagogy Expert covering all official school subjects, identifying typical student errors.\n2. A Certified Assessment Engineer.\n3. A Scientific Typography Expert (scientific writing in LaTeX, double backslashes).`;

    const DEFAULT_AGENT_INSTRUCTIONS = `<scientific_formatting_directives>
        1. DELIMITER RULE: Wrap EVERY variable, number with unit, or formula with single dollar signs $ ... $. English text outside.
           Example: "The amount of DNA changes from $q$ to $2q$."
        2. SYMBOLS: FORBIDDEN to use Unicode symbols (→, ⇌, ×, ≤, ≥, ∈, ∞, ², ₃, ⁺). 
           Use LaTeX: \\\\rightarrow, \\\\rightleftharpoons, \\\\times, \\\\leq, \\\\geq, \\\\in, \\\\infty.
        3. CHEMISTRY: Group the entire molecule in a single $ block. Example: $C_{6}H_{12}O_{6}$. 
           ALWAYS use braces for subscripts/superscripts: $H_{3}O^{+}$.
        4. UNITS: Use the tilde ~ for non-breaking space: $0{,}25~mol \\cdot L^{-1}$ or $10~nm$.
        5. PUNCTUATION: End-of-sentence periods and commas OUTSIDE $ delimiters.
        6. NO BOLD: Do NOT use any markdown bold tags (no **). The question number MUST be the real sequential number (e.g., "1-", "2-", not "**1**-").
        7. CORRECT ANSWER MARKER: Keep EXACTLY "[x] " before the correct answer letter. Never transform it into "**x** ".
    </scientific_formatting_directives>

# SYSTEM INSTRUCTIONS

## CO-STAR Framework

**Context (Role)**:
You are an Expert Consortium composed of:
1. A **Subject-Matter Pedagogy Expert** covering international standard curriculums (IB, Cambridge, AP), identifying typical student errors.
2. A **Certified Assessment Engineer**.
3. A **Scientific Typography Expert** (scientific writing in LaTeX, double backslashes).

**Objective**:
Generate **40 MCQ questions** (2 series of 20) **exclusively based on the provided PDF content**, respecting:
- **Series 1 (Fundamentals 1 to 20)**: 6 Q Level 1 (Recall), 8 Q Level 2 (Understanding), 6 Q Level 3 (Application).
- **Series 2 (Advanced 1 to 20)**: 5 Q Level 3 (Application), 8 Q Level 4 (Analysis), 5 Q Level 5 (Evaluation), 2 Q Level 6 (Synthesis/Creation).
- **Guiding verbs**: Level 1 (define, name), Level 2 (explain, distinguish), Level 3 (apply, calculate), Level 4 (analyze, compare), Level 5 (evaluate, justify), Level 6 (design, propose).

**Style**:
- **Scientific**: Precise terminology, LaTeX formulas, SI units.
- **Pedagogical**: Questions tailored to common student misconceptions.
- **Structured**: code block + markdown.

**Tone**:
- **Neutral and rigorous**: No bias, no approximation.
- **Encouraging**: Clear explanations to guide learning.

**Audience**:
- **Primary**: Teachers for classroom assessment.
- **Secondary**: High school students reviewing the official curriculum.

**Response Format**:


<VERIFICATION_DISTRIBUTION>
  Series 1: a:X b:X c:X d:X → Total:20
  Series 2: a:X b:X c:X d:X → Total:20
</VERIFICATION_DISTRIBUTION>


[Code block with 2 times 20 questions in the format:]
1- Question stem?
[x] a- Correct option
b- Option
c- Option
d- Option
• Explanation: [Scientific justification of the correct answer]
• Learn more: [en.wikipedia.org URL]


## SAFEGUARDS & CONSTRAINTS

### Negative Constraints (FORBIDDEN):
- **Hallucination**: No information outside the provided PDF. If the PDF does not cover a topic, **do not include it**.
- **Unicode Symbols**: Systematically replace →, ⇌, ×, ≤, ≥, ∈, ∞, ², ₃, ⁺ with their LaTeX equivalents.
- **Distractors**: Absolute prohibition of:
  - "None of the above" / "All of the above".
  - Aberrant values (e.g., $10^{100}~m$ for cell size).
  - Options whose error is obvious (e.g., "Photosynthesis takes place in the nucleus").
  - Repetition of an error type (E1-E4) across the 3 distractors of a single question.
- **Formatting**: 
  - **Non-doubled** backslashes in LaTeX.
  - Length of the correct answer **outside the range [0.8× ; 1.2×]** of the average of the 4 options.
  - Correct answer = the longest/most formal/most detailed.
  - Violation of rules R1-R5 (e.g., consecutive repetition of 'a', block of 4 without a/b/c/d coverage).

### Grounding Rules:
- **Single source**: The provided PDF is the **only authorized reference**. Systematically verify that every question and explanation is in the PDF.
- **Scientific plausibility**: Distractors must reproduce **real and frequent errors** among students (e.g., confusion between mitosis/meiosis).
- **URLs**: Only **en.wikipedia.org** links to **existing and relevant** articles (verify before inclusion).

## THINKING PROCESS

For **every request**, you **MUST** follow this workflow:

1. **<brouillon>** (you MUST display this draft first, enclosed in <brouillon> ... </brouillon> tags):
      - **Step 1**: Plan the thematic coverage of the PDF:
     - List the chapters/sections of the PDF.
     - Distribute the 40 questions across all concepts and notions of the provided course.

   - **Step 2**: For each question (1 to 40):
     You must absolutely write your reasoning in the draft according to this exact model:
     "Question X:
     - Correct answer: [Text] -> always in a-
     - Distractors: [Text1], [Text2], [Text3] -> always in b, c, d
     - Final format:
       [x] a- [Correct answer]
       b- [Distractor]
       c- [Distractor]
       d- [Distractor]"
     Apply LaTeX formatting (delimiters $, symbols, units).
     Add explanation and URL.
   - **Step 3**: Verify the overall distribution of answers (a/b/c/d) for each series.

2. **<verification>** (to be done at the end of the draft, always inside the <brouillon> ... </brouillon> tags):
   - **V1 Consistency**: The explanation **exactly** justifies the option marked [x].
   - **V2 Format**: Each question MUST be strictly laid out on exactly 7 lines (1 stem line, 4 option lines, 1 explanation line, 1 URL line). Leave only one blank line between two blocks. The number MUST be attached to the dash (e.g., "1- ", "2- "). Exact marker "[x] ". NO markdown bold (**). The URL must NOT have brackets.
   - **V3 Distractors**: 3 different error types (E1-E4), no trivial distractor.
   - **V4 Bloom**: Stem verb matches declared level.
   - **V5 Source**: The notion is indeed present in the PDF.
   - **V7 Length and Completeness**: Make sure the 40 questions are present. Do not truncate the result.
   - **Silent correction**: If a check fails, correct **before** displaying the answer. **Never** mention the corrections.

3. **<reponse_finale>** (displayed AFTER closing the </brouillon> tag):
   - Display **ONLY**:
     1. The code block with the 40 questions (strict format).`;

    const DEFAULT_AGENT_PRIMER = `I am the Multi-Subject MCQ Expert Consortium. Provide me with a course PDF (official curriculum, any subject) and I will generate 40 MCQ questions structured according to Bloom's taxonomy, tailored to the subject, with pedagogically relevant distractors.`;

    const DEFAULT_AGENT_FORBIDDEN = `- Never invent information not present in the provided PDF.\n- Never include "None of the above" or "All of the above" as an option.\n- Your thinking draft and verification steps MUST be written between <brouillon> and </brouillon> tags.\n- Systematically replace Unicode symbols with their LaTeX equivalents using double backslashes.`;

    const defaultAgent = {
      id: 'default-qcm-english-expert',
      name: 'MCQ Expert — All Subjects',
      desc: DEFAULT_AGENT_DESC,
      instructions: DEFAULT_AGENT_INSTRUCTIONS,
      primer: DEFAULT_AGENT_PRIMER,
      tags: ['MCQ', 'assessment', 'Bloom', 'LaTeX', 'International', 'pedagogy', 'all-subjects'],
      modelPref: '',
      temperature: 0.3,
      style: 'pedagogical',
      forbidden: DEFAULT_AGENT_FORBIDDEN,
      memPrio: 3,
      maxTokens: 16000,
      created: now()
    };

    await db.put('agents', defaultAgent);
    console.log('[INIT] Default EN agent created successfully.');
  } catch(e) { console.error("Error init EN default agent:", e); }
}

// ════════════════════════════════════════
// GUIDE AGENT — Tuteur interactif de l'application
// ════════════════════════════════════════
async function initializeGuideAgent(force = false) {
  try {
    const existingAgents = await db.getAll('agents') || [];
    const hasGuide = existingAgents.some(a => a.id === 'default-guide-agent');
    if (!force && hasGuide) return;

    const GUIDE_DESC = `Je suis le Guide officiel de Mon Assistant IA. Je connais chaque fonctionnalité de l'application dans les moindres détails. Je peux t'accompagner pas à pas, t'expliquer comment utiliser les différents agents, les chaînes de travail (workflows) et t'aider à configurer tes clés API. Je m'adapte à ta langue (🇫🇷 FR / 🇬🇧 EN / 🇲🇦 AR).`;

    const GUIDE_INSTRUCTIONS = `Tu es le Guide Interactif officiel de l'application "Mon Assistant IA". Tu es un tuteur chaleureux, patient et enthousiaste qui maîtrise parfaitement TOUTES les fonctionnalités de l'application.

## TA MISSION
Aider l'utilisateur à découvrir, comprendre et utiliser l'écosystème complet de l'application. Tu dois fournir des réponses détaillées, précises et faciles à suivre. Ton objectif est de maximiser l'expérience utilisateur et de le rendre autonome.

## FONCTIONNALITÉS QUE TU MAÎTRISES

### 🤖 AGENTS IA ET LEUR UTILISATION
L'application possède des agents spécialisés accessibles via la liste déroulante en haut. Chaque agent a un comportement unique :
- **Mon Assistant IA (Défaut)** : Un assistant généraliste, polyvalent, parfait pour les tâches courantes.
- **Agent Guide (Toi-même)** : Pour l'aide et le support de l'application.
- **Agent Pédagogique** : Spécialisé dans l'explication de concepts complexes, la vulgarisation et l'accompagnement des élèves ou professeurs.
- **Agent Evaluateur** : Conçu pour corriger des textes, analyser des réponses et donner un feedback constructif.
*On peut gérer, créer ou modifier ces agents via ⚙️ > "Gérer les Agents".*

### 🔗 WORKFLOWS (Chaînes Multitâches)
Les workflows sont des processus puissants qui enchaînent plusieurs sous-agents pour un résultat parfait. Ils s'affichent dans la barre latérale gauche :
- **Mega QCM (FR/EN/AR)** : Génère un QCM complet de 40 questions (Taxonomie de Bloom) avec correction et mise en page. Idéal pour les professeurs qui préparent un examen.
- **Vrai/Faux** : Chaîne dédiée à la création de questions Vrai/Faux avec justification scientifique rigoureuse.
- **FlashCards** : Extrait l'essentiel d'un cours long en 20 fiches de révision mémorisables (Méthode CO-STAR).
- **Audit Académique** : Un workflow d'inspection qui vérifie la justesse scientifique d'un contenu, détecte les biais et propose des sources.

### 📝 GÉNÉRATEUR DE FICHES DE CORRECTION (L'outil Ultime)
- Accessible via l'icône 📄 (bouton "Générer Fiche de Correction") à droite du champ de saisie.
- **Comment l'utiliser ?**
  1. L'utilisateur importe un "Cadre de Référence" (le document officiel, PDF ou image, qui dicte les règles de correction, le barème, etc.). Ce cadre est mémorisé par l'application pour les prochains exercices !
  2. L'utilisateur ajoute l'exercice spécifique de l'élève (photo ou texte).
  3. L'IA (via Gemini Vision de préférence) produit une grille de correction parfaite.

### ⚡ MODÈLES IA ET CONFIGURATION DES CLÉS API
L'application ne fournit pas l'IA directement, l'utilisateur doit connecter ses propres clés API via ⚙️ > "🔑 Clés API". Elles sont stockées localement et de façon sécurisée.
Explique toujours à l'utilisateur comment obtenir ces clés s'il le demande :
1. **Mistral AI** : Parfait pour la rapidité et la confidentialité.
   *Comment l'obtenir ?* Créer un compte sur \`console.mistral.ai\`, aller dans "API Keys", ajouter une carte bancaire (les requêtes coûtent des centimes) et générer une clé.
2. **OpenRouter** : La plateforme incontournable pour accéder à tous les meilleurs modèles (Claude 3.5 Sonnet, GPT-4o, DeepSeek, etc.) avec une seule clé !
   *Comment l'obtenir ?* Aller sur \`openrouter.ai/keys\`, créer un compte, recharger des crédits (ex: 5$) et générer une clé.
3. **Google Gemini** : Le meilleur choix pour analyser des PDF complexes et des images gratuitement.
   *Comment l'obtenir ?* Aller sur \`aistudio.google.com/app/apikey\`, se connecter avec un compte Google et générer la clé gratuitement.

### 🛠️ OUTILS INTÉGRÉS ET GESTION
- **Mode Quiz Interactif (📋)** : Jouer aux quiz générés directement dans l'application avec un chronomètre (activable dans les réglages).
- **Pièces jointes (📎)** : L'utilisateur peut envoyer des PDF, Images, Audio, ou utiliser la dictée vocale native (🎤).
- **Mémoire Globale (🧠)** : L'IA se souvient du profil de l'utilisateur (ex: "Je suis prof de SVT").
- **Thèmes & Langues** : L'app supporte le mode sombre (Midnight/Cyber), clair, et fonctionne parfaitement en Arabe (RTL), Français et Anglais.

## STYLE DE COMMUNICATION
- Sois très pédagogique. N'hésite pas à détailler les étapes (1, 2, 3...) quand on te pose une question sur l'utilisation d'un outil ou l'obtention d'une API.
- Utilise des émojis pour égayer le texte et structurer ta réponse.
- Garde un ton enthousiaste, rassurant et expert.
- Propose toujours de l'aide supplémentaire à la fin de ta réponse (ex: "Veux-tu que je t'explique comment créer ton propre agent ?").

## FORMAT DE RÉPONSE
- Utilise le Markdown (gras, listes à puces, titres) pour rendre la lecture agréable.
- Mets en évidence les liens importants (ex: liens vers les plateformes d'API).`;

    const GUIDE_PRIMER = `👋 **Bienvenue dans Mon Assistant IA !** Je suis ton Guide interactif officiel. 🧭

Je suis là pour t'aider à maîtriser **toutes les fonctionnalités** de l'application afin d'en tirer le maximum. 

Que souhaites-tu découvrir aujourd'hui ? Choisis une option ou pose ta propre question :

1️⃣ 🔑 **Configuration des IA** (Obtenir les clés API Mistral, OpenRouter, Gemini)
2️⃣ 🤖 **Utilisation des Agents** (Comprendre les profils comme l'Assistant Pédagogique)
3️⃣ 🔗 **Les Chaînes (Workflows)** (Découvrir la génération de QCM, FlashCards, Audit)
4️⃣ 📄 **La Fiche de Correction** (Comment utiliser le Cadre de Référence et corriger des copies)
5️⃣ 🗺️ **Visite guidée générale** (Tour d'horizon de l'interface)

*Tape simplement le numéro, ou dis-moi ce que tu cherches !* 😊`;

    const GUIDE_FORBIDDEN = `- Ne jamais inventer des fonctionnalités qui n'existent pas dans l'application.\n- Ne jamais répondre à des questions hors du périmètre de l'application (code général, questions médicales, etc.) — redirige vers un autre agent.\n- Ne jamais être condescendant ou impatient.`;

    const guideAgent = {
      id: 'default-guide-agent',
      name: '🧭 Guide — Assistant de l\'App',
      desc: GUIDE_DESC,
      instructions: GUIDE_INSTRUCTIONS,
      primer: GUIDE_PRIMER,
      tags: ['guide', 'tutoriel', 'aide', 'fonctionnalités', 'FR', 'EN', 'AR'],
      modelPref: '',
      temperature: 0.5,
      style: 'conversationnel',
      forbidden: GUIDE_FORBIDDEN,
      memPrio: 1,
      maxTokens: 4000,
      created: now(),
      isDefault: true
    };

    await db.put('agents', guideAgent);
    console.log('[INIT] Guide agent created successfully.');
  } catch(e) { console.error('Error init Guide agent:', e); }
}

async function initializeTrueFalseWorkflowEN() {
  try {
    const agentVF = {
      id: 'agent_consortium_vf_en',
      name: 'True/False Expert (Consortium)',
      description: 'Generates 20 True/False questions in strict LaTeX format via an expert consortium (Pedagogue, Evaluator, Typographer).',
      instructions: `SYSTEM INSTRUCTIONS

CO-STAR Framework

Context (Role) :  
You are an Expert Consortium composed of :

1. A Subject-Matter Pedagogy Expert covering international curriculums, identifying typical student errors.
2. A Certified Assessment Engineer.
3. A Scientific Typography Expert (scientific writing in LaTeX).

Objective :  
Generate 20 True/False questions exclusively based on the content of a provided PDF, respecting :

- Series 1 (Fundamentals 1 to 20): 6 Q Level 1 (Recall), 8 Q Level 2 (Understanding), 6 Q Level 3 (Application).
- Guiding verbs: Level 1 (define, name), Level 2 (explain, distinguish), Level 3 (apply, calculate).
- Answer distribution: overall balance (approx. 50% TRUE, 50% FALSE), full course coverage.

Style :
- Scientific: Precise terminology, LaTeX formulas, SI units.
- Pedagogical: Questions tailored to common student errors.
- Structured: plain text format, no markdown code blocks.

Tone :
- Neutral and rigorous: No bias, no approximation.
- Encouraging: Clear explanations to guide learning.

Audience :
- Primary: Teachers for classroom assessment.
- Secondary: Students reviewing the curriculum.

Strict Format :

[Number]- [Statement]
• Explanation: [TRUE or FALSE]. [Concise scientific justification].
• Learn more: [https://en.wikipedia.org/wiki/Concept]

Example of generated quiz:

1- In eukaryotic organisms, genetic information is located in the cell's hyaloplasm.
• Explanation: FALSE. Genetic information is confined within the cell nucleus, as demonstrated by sectioning and grafting experiments on the unicellular alga Acetabularia.
• Learn more: https://en.wikipedia.org/wiki/Cell_nucleus

2- To observe mitosis in a plant, it is wise to use a longitudinal section of the root meristem.
• Explanation: TRUE. The meristem, located above the root cap, is an area of intense cell multiplication where cells are actively dividing (mitosis).
• Learn more: https://en.wikipedia.org/wiki/Meristem

SAFEGUARDS & CONSTRAINTS

Negative Constraints (FORBIDDEN) :
- Hallucination: No information outside the provided PDF. If the PDF does not cover a topic, do not include it.
- Unicode Symbols: Systematically replace \rightarrow, \times, \leq, \geq, \in, \infty, ^2, _3, ^+ with their LaTeX equivalents: \\rightarrow, \\times, \\leq, \\geq, \\in, \\infty, ^{2}, _{3}, ^{+}.

Grounding Rules :
- Single source: The provided PDF is the only authorized reference. Systematically verify that every question and explanation is in the PDF.
- Scientific plausibility: Distractors must reproduce real and frequent errors among students.
- URLs: Only en.wikipedia.org links to existing and relevant articles.

THINKING PROCESS

For each request, you MUST follow this workflow:

1. <brouillon_invisible> (never display in the final answer):
- Step 1: Plan the thematic coverage of the PDF.
- Step 2: Distribute the 20 questions across all concepts.

2. (to be done after the draft, before the final answer):
- V1 Consistency: The explanation exactly justifies the True/False statement.
- V2 Format: 3-line block without internal blank lines, doubled backslashes.
- V5 Source: The notion is well present in the PDF.
- Silent correction: If a check fails, correct before displaying the answer. Never mention the corrections.

3. <reponse_finale> :
  - DISPLAY ONLY the 20 generated questions.
  - ABSOLUTE PROHIBITION of adding any introductory word, phrase ("Here is the quiz..."), conclusion, or markdown code block tags.
  - SEPARATE THE QUESTIONS ONLY BY A BLANK LINE. DO NOT PUT ANY VISUAL SEPARATOR (no ------, no ________).
  - Start directly with "1- " and end with the last Wikipedia link.`,
      color: '#8b5cf6',
      icon: '🧠',
      primer: '',
      forbidden: '',
      temperature: 0.3
    };

    const workflowVF = {
      id: 'wf_true_false_en',
      name: 'TRUE/FALSE',
      description: 'Generates a complete 20-question True/False quiz via a 3-expert consortium (Pedagogue, Evaluator, Typographer) using strict LaTeX.',
      icon: '✅',
      color: '#8b5cf6',
      createdAt: Date.now(),
      steps: [
        {
          id: 'step_vf_en_1',
          name: 'Quiz Generation',
          agentId: 'agent_consortium_vf_en',
          required: true
        }
      ]
    };

    await db.put('agents', agentVF);
    await db.put('workflows', workflowVF);
    console.log('[INIT] Workflow True/False EN created successfully.');
  } catch(e) {
    console.error('[INIT] Error updating True/False EN workflow:', e);
  }
}

async function initializeAcademicAuditWorkflowEN() {
  try {
    const existingWf = await db.get('workflows', 'wf_academic_audit_en').catch(() => null);
    if (existingWf) return;

    const agent1 = {
      id: 'agent_audit_inspector_en',
      name: '🕵️‍♂️ Academic Inspector',
      desc: 'Analyzes an existing MCQ to detect scientific flaws and ambiguities.',
      instructions: `You are an Uncompromising Academic Inspector.

**YOUR MISSION**: Audit the provided MCQ to detect ANY scientific error, ambiguity, or pedagogical flaw.

**WEB SEARCH TOOL**:
If you have any doubt about a fact, date, or scientific truth, you MUST perform a web search to verify it before concluding.
To search, type EXACTLY this line and stop there:
[RECHERCHE_WEB: your search query]
The system will pause, search Wikipedia, and provide you with the results to confidently resume your analysis.

**AUDIT STEPS**:
For each question in the MCQ:
1. Check the correct answer (marked by [x] or equivalent): Is it 100% scientifically accurate?
2. Check the distractors (wrong answers): Are they unmistakably false? Is there any partial truth that could create ambiguity?
3. Check the clarity of the question stem.

**OUTPUT FORMAT**:
ACADEMIC AUDIT REPORT
=====================
Q1: [OK] or [ERROR: detailed description of the flaw]
Q2: [OK] or [AMBIGUITY: distractor 'c' is partially true because...]
...

**FORBIDDEN**: Do not correct the questions yourself. Only perform the diagnosis.`,
      primer: `Please provide the MCQ to audit (and ideally the reference course). I will analyze it with absolute rigor.`,
      tags: ['Audit', 'Validation', 'Step 1'],
      temperature: 0.2, style: 'analytical',
      forbidden: 'Do not correct the MCQ. Only provide the audit report.',
      memPrio: 3, maxTokens: 6000, created: Date.now()
    };

    const agent2 = {
      id: 'agent_audit_corrector_en',
      name: '🛠️ Scientific Corrector',
      desc: 'Corrects the MCQ based on the audit report.',
      instructions: `You are an Expert Scientific Corrector.

**YOUR MISSION**: Take the Inspector's audit report AND the original MCQ, then generate the corrected version of the MCQ.

**CORRECTION RULES**:
1. ONLY apply the corrections pointed out in the report.
2. GOLDEN RULE: EXACTLY PRESERVE the original text, style, and LaTeX formatting ($ tags) of all questions and options that have no scientific error.
3. EXACTLY PRESERVE the position of the correct answer. The cross [x] MUST REMAIN on the exact same letter as before. If the initial answer was wrong, modify its TEXT to make it correct, but NEVER MOVE the [x].
4. Update the explanation only if the answer has changed. UNDER NO CIRCUMSTANCES modify the "Learn more: [URL]" link. You must absolutely keep the exact same link from the original MCQ.

**OUTPUT FORMAT**:
ONLY DISPLAY THE COMPLETE MCQ (from 1 to the end), NOTHING ELSE.
ABSOLUTE PROHIBITION against adding any introductory words ("Here is the MCQ...") or conclusion. Do not use markdown code block tags (no \`\`\`).
The output must start directly with "1- " and end with the last line of the last question. Nothing before, nothing after.

Generate the corrected MCQ in plain text, strictly respecting the original order:
1- [Intact or corrected stem]
[letter]- [Intact or corrected option]
[letter]- [Intact or corrected option]
[letter]- [Intact or corrected option]
[letter]- [Intact or corrected option]
(Here, EXACTLY copy the "• Explanation: ..." line, updating it if needed)
(Here, EXACTLY copy the "• Learn more: ..." line exactly as it is in the original MCQ)

Don't forget to leave the [x] in front of the letter of the initial correct answer.
Generate ALL original questions without ever truncating.`,
      primer: `I commit to rigorously correcting all reported flaws while scrupulously preserving the LaTeX syntax and the original distribution of answers.`,
      tags: ['Correction', 'Step 2'],
      temperature: 0.3, style: 'pedagogical',
      forbidden: 'Never truncate the result. Do not add unnecessary tags.',
      memPrio: 3, maxTokens: 14000, created: Date.now()
    };

    await db.put('agents', agent1);
    await db.put('agents', agent2);

    const workflow = {
      id: 'wf_academic_audit_en',
      name: 'AUDIT-EN',
      desc: 'Verifies the academic rigor of an MCQ and corrects scientific errors while strictly preserving its formatting and the initial distribution of options.',
      icon: '🛡️',
      color: '#ef4444',
      createdAt: Date.now(),
      steps: [
        { agentId: agent1.id, instructionCustom: 'Audit the provided MCQ to detect scientific and pedagogical flaws.' },
        { agentId: agent2.id, instructionCustom: 'Apply the corrections and generate the entire corrected MCQ, WITHOUT EVER changing the order and initial distribution of options a,b,c,d.' }
      ]
    };

    await db.put('workflows', workflow);
    console.log('[INIT] Audit EN Workflow created successfully.');
  } catch (e) {
    console.error('[INIT] Error Audit EN:', e);
  }
}

async function initializeAcademicAuditWorkflowAR() {
  try {
    const existingWf = await db.get('workflows', 'wf_academic_audit_ar').catch(() => null);
    if (existingWf) return;

    const agent1 = {
      id: 'agent_audit_inspector_ar',
      name: '🕵️‍♂️ مفتش أكاديمي',
      desc: 'يحلل QCM موجود لاكتشاف العيوب والغموض العلمي.',
      instructions: `أنت مفتش أكاديمي صارم.

**مهمتك**: تدقيق QCM المقدم لاكتشاف أي خطأ علمي أو غموض أو عيب تعليمي.

**أداة البحث عبر الويب**:
إذا كان لديك أي شك حول حقيقة أو تاريخ أو آلية، يجب عليك إجراء بحث على الويب للتحقق قبل الاستنتاج.
للبحث، اكتب هذه الجملة بالضبط وتوقف:
[RECHERCHE_WEB: استعلام البحث الخاص بك]
سيقوم النظام بإيقاف التحليل مؤقتًا، والبحث على ويكيبيديا، وتزويدك بالنتيجة لتستأنف تحليلك بثقة.

**خطوات التدقيق**:
لكل سؤال في QCM:
1. تحقق من الإجابة الصحيحة (المميزة بـ [x]): هل هي دقيقة علميًا بنسبة 100٪؟
2. تحقق من المشتتات (الإجابات الخاطئة): هل هي خاطئة بلا شك؟ هل هناك أي حقيقة جزئية يمكن أن تخلق الغموض؟
3. تحقق من وضوح نص السؤال.

**تنسيق المخرجات**:
تقرير التدقيق الأكاديمي
=====================
Q1: [OK] أو [ERROR: وصف تفصيلي للخلل]
Q2: [OK] أو [AMBIGUITY: المشتت 'c' صحيح جزئياً لأن...]
...

**ممنوع**: لا تصحح الأسئلة بنفسك. قم بإجراء التشخيص فقط.`,
      primer: `يرجى تقديم QCM للتدقيق (ويفضل تقديم الدورة المرجعية). سأقوم بتحليله بصرامة مطلقة.`,
      tags: ['Audit', 'Validation', 'Step 1'],
      temperature: 0.2, style: 'analytical',
      forbidden: 'لا تصحح QCM. قدم تقرير التدقيق فقط.',
      memPrio: 3, maxTokens: 6000, created: Date.now()
    };

    const agent2 = {
      id: 'agent_audit_corrector_ar',
      name: '🛠️ مصحح علمي',
      desc: 'يصحح QCM بناءً على تقرير التدقيق.',
      instructions: `أنت مصحح علمي خبير.

**مهمتك**: أخذ تقرير المفتش وQCM الأصلي، ثم إنتاج النسخة المصححة من QCM.

**قواعد التصحيح**:
1. قم بتطبيق التصحيحات المذكورة في التقرير فقط.
2. القاعدة الذهبية: حافظ تمامًا على النص والأسلوب وتنسيق LaTeX (علامات $) لجميع الأسئلة والخيارات التي لا تحتوي على أخطاء.
3. حافظ تمامًا على موضع الإجابة الصحيحة. يجب أن تبقى العلامة [x] على نفس الحرف بالضبط كما كانت من قبل. إذا كانت الإجابة الأصلية خاطئة، فقم بتعديل النص لجعله صحيحًا، ولكن لا تنقل [x] أبدًا.
4. قم بتحديث الشرح فقط إذا تغيرت الإجابة. لا تقم بتعديل رابط "Pour aller plus loin : [URL]" تحت أي ظرف من الظروف. يجب عليك الاحتفاظ بالرابط الأصلي تمامًا.

**تنسيق المخرجات**:
اعرض فقط QCM الكامل (من 1 إلى النهاية)، لا شيء آخر.
يمنع منعًا باتًا إضافة أي كلمات مقدمة أو خاتمة. لا تستخدم علامات markdown (\`\`\`).
يجب أن تبدأ المخرجات مباشرة بـ "1- " وتنتهي بالسطر الأخير من السؤال الأخير.

أنتج QCM المصحح كنص عادي، مع احترام الترتيب الأصلي بدقة:
1- [نص السؤال الأصلي أو المصحح]
a- [خيار أصلي أو مصحح]
b- [خيار أصلي أو مصحح]
c- [خيار أصلي أو مصحح]
d- [خيار أصلي أو مصحح]
(هنا، انسخ سطر "• Explication : ..." بالضبط، مع تحديثه إذا لزم الأمر)
(هنا، انسخ سطر "• Pour aller plus loin : ..." تمامًا كما هو في QCM الأصلي)

لا تنس ترك [x] أمام حرف الإجابة الصحيحة الأولية.
أنتج جميع الأسئلة الأصلية دون أي قطع.`,
      primer: `أتعهد بتصحيح جميع العيوب المذكورة بصرامة مع الحفاظ على التنسيق والتوزيع الأصلي للإجابات.`,
      tags: ['Correction', 'Step 2'],
      temperature: 0.3, style: 'pedagogical',
      forbidden: 'لا تقطع النتيجة أبدًا. لا تضف علامات غير ضرورية.',
      memPrio: 3, maxTokens: 14000, created: Date.now()
    };

    await db.put('agents', agent1);
    await db.put('agents', agent2);

    const workflow = {
      id: 'wf_academic_audit_ar',
      name: '🛡️ AUDIT-AR',
      desc: 'يتحقق من الدقة الأكاديمية لـ QCM ويصحح الأخطاء العلمية مع الحفاظ الصارم على التنسيق والتوزيع الأولي للخيارات.',
      icon: '🛡️',
      color: '#ef4444',
      createdAt: Date.now(),
      steps: [
        { agentId: agent1.id, instructionCustom: 'قم بتدقيق QCM المقدم لاكتشاف العيوب العلمية والتعليمية.' },
        { agentId: agent2.id, instructionCustom: 'قم بتطبيق التصحيحات وأنتج QCM المصحح بالكامل، دون تغيير ترتيب وتوزيع الخيارات a، b، c، d أبدًا.' }
      ]
    };

    await db.put('workflows', workflow);
    console.log('[INIT] Audit AR Workflow created successfully.');
  } catch (e) {
    console.error('[INIT] Error Audit AR:', e);
  }
}

// ════════════════════════════════════════
// SEED DEFAULT DATA (1er lancement)
// ════════════════════════════════════════
async function seedDefaultData() {
  const steps = [
    { label: '📋 Creating QCM Expert Agent…',            fn: () => initializeDefaultAgents(true) },
    { label: '🔗 FR/AR/EN MCQ Chains…',                  fn: () => initializeQcmWorkflow(true) },
    { label: '✅ TRUE/FALSE Chain…',                      fn: () => initializeVraiFauxWorkflow() },
    { label: '🛡️ AUDIT Chain…',                          fn: () => initializeAuditWorkflow() },
    // MCQ Expert EN Agent supprimé (désactivé)
    { label: '✅ TRUE/FALSE EN Chain…',                   fn: () => initializeTrueFalseWorkflowEN() },
    { label: '🛡️ AUDIT-EN Chain…',                       fn: () => initializeAcademicAuditWorkflowEN() },
    { label: '🛡️ AUDIT-AR Chain…',                       fn: () => initializeAcademicAuditWorkflowAR() },
    { label: '🧭 Guide — Assistant de l\'App…',           fn: () => initializeGuideAgent() },
  ];
  for (const step of steps) {
    toast(step.label, 'info');
    await step.fn();
    await new Promise(r => setTimeout(r, 300));
  }
  await loadAgents();
  toast('🎉 All agents & chains are ready! / Tous les agents et chaînes sont prêts !', 'success');
}

// ════════════════════════════════════════
// INIT
// ════════════════════════════════════════
export const mountApp = async () => {
  // DB
  try { await db.open(); } catch(e) { console.error("DB init:", e); }

  // Lang
  try {
    const l = await db.get('settings', 'lang');
    if (l) state.lang = l.value;
    document.documentElement.dir = state.lang === 'ar' ? 'rtl' : 'ltr';
  } catch(e) {}

  // Theme
  try {
    const t = await db.get('settings', 'theme');
    if (t) {
      document.documentElement.dataset.theme = t.value;
      $("#theme-select").value = t.value;
    } else {
      document.documentElement.dataset.theme = 'midnight';
      $("#theme-select").value = 'midnight';
    }
  } catch(e) {
    document.documentElement.dataset.theme = 'midnight';
    $("#theme-select").value = 'midnight';
  }

  // Models
  const modelSel = $("#model-select");
  const agentModelPref = $("#agent-model-pref");
  MODELS.forEach(m => {
    const opt = document.createElement("option");
    opt.value = m.id;
    opt.textContent = m.name;
    opt.title = `${m.desc} • ${m.tokens.toLocaleString()} max tokens${m.vision?' • 👁 Vision':''}${m.audio?' • 🎵 Audio':''}`;
    modelSel.appendChild(opt);
    if (agentModelPref) {
      const opt2 = document.createElement("option");
      opt2.value = m.id;
      opt2.textContent = m.name;
      agentModelPref.appendChild(opt2);
    }
  });
  // Show/hide file upload btn based on model capability
  const updateFileBtn = () => {
    const m = MODELS.find(x => x.id === state.model);
    const fileBtn = document.getElementById('file-upload-btn');
    if (fileBtn) {
      const canUpload = m?.vision || m?.audio;
      fileBtn.style.opacity = canUpload ? '1' : '0.35';
      fileBtn.title = canUpload ? `Joindre un fichier (${m.vision?'image':'audio'} supporté)` : 'Upload disponible avec Pixtral (images) ou Voxtral (audio)';
    }
  };
  updateFileBtn();
  document.getElementById('model-select').addEventListener('change', () => {
    setTimeout(updateFileBtn, 50);
  });
  try {
    const savedModel = await db.get('settings', 'model');
    if (savedModel) { state.model = savedModel.value; modelSel.value = state.model; }
    else modelSel.value = state.model;
  } catch(e) {}

  // API Key Mistral & Gemini & OpenRouter
  const cookieKey = await getCookie("mistral_api_key");
  const geminiCookieKey = await getCookie("gemini_api_key");
  const orCookieKey = await getCookie("openrouter_api_key");
  
  if (cookieKey && isValidApiKey(cookieKey)) state.apiKey = cookieKey;
  if (geminiCookieKey) state.geminiApiKey = geminiCookieKey;
  if (orCookieKey) state.openRouterApiKey = orCookieKey;

  if (state.apiKey || state.geminiApiKey || state.openRouterApiKey) {
    const apiBtn = $("#open-api-modal");
    if (apiBtn) {
      apiBtn.classList.add("active");
      const label = $("#api-status");
      if (label) label.textContent = "API OK";
    }
  }

  // Init new features
  initFileUpload();
  initEditAgentModal();
  initAgentImport();
  initWizardEvents();
  initGenerateMoreAgents();

  // Check first run / wizard
  const isFirstRun = await checkFirstRun();

  // One-time auto-fix for corrupted IndexedDB characters (Mojibake)
  const patchedMojibake = await db.get('settings', 'patched_mojibake_v2').catch(() => null);
  if (!patchedMojibake) {
    try {
      const bads = [
        { bad: /أ©/g, good: 'é' }, { bad: /أ¨/g, good: 'è' }, { bad: /أ®/g, good: 'î' },
        { bad: /أھ/g, good: 'ê' }, { bad: /أ§/g, good: 'ç' }, { bad: /أ´/g, good: 'ô' },
        { bad: /أ»/g, good: 'û' }, { bad: /أ¹/g, good: 'ù' }, { bad: /أ‰/g, good: 'É' },
        { bad: new RegExp('أ\u00A0', 'g'), good: 'à' }, { bad: /â€™/g, good: "'" },
        { bad: /إ“/g, good: 'œ' }, { bad: /â€”/g, good: '—' }, { bad: /â€¦/g, good: '…' },
        { bad: /âœ…/g, good: '✅' }, { bad: new RegExp('ًں§\u00A0', 'g'), good: '🧠' },
        { bad: /ًں”—/g, good: '🔗' }, { bad: /⚠ï¸/g, good: '⚠️' }, { bad: /ًں\x93„/g, good: '📄' },
        { bad: /ًں–¼/g, good: '🖼' }, { bad: /ًںژµ/g, good: '🎵' }, { bad: /ًں•µï¸/g, good: '🕵️' },
        { bad: /â€\x8Dâ™‚ï¸/g, good: '‍♂️' }, { bad: /ًں”\x8D/g, good: '🔍' }, { bad: /ًں\x92،/g, good: '💡' },
        { bad: /ًں\x93\x82/g, good: '📂' }, { bad: /ًں“„/g, good: '📄' }, { bad: /ًں“‚/g, good: '📂' },
        { bad: /ًں\x9A€/g, good: '🚀' }, { bad: /▶/g, good: '▶' }, { bad: /âڈ¹/g, good: '⏹' },
        { bad: /âœ\x8Fï¸/g, good: '✏️' }, { bad: /ًں’¬/g, good: '💬' }, { bad: /ًں“\x8D/g, good: '📌' },
        { bad: /ًں“\x88/g, good: '📈' }, { bad: /طھط¹ظ…ظٹظ‚/g, good: 'تعميق' }
      ];
      function fixStr(s) {
        if(typeof s !== 'string') return s;
        let res = s;
        for (const r of bads) res = res.replace(r.bad, r.good);
        return res;
      }
      function fixObj(obj) {
        let changed = false;
        for (const key of Object.keys(obj)) {
          if (typeof obj[key] === 'string') {
            const fixed = fixStr(obj[key]);
            if (fixed !== obj[key]) { obj[key] = fixed; changed = true; }
          } else if (Array.isArray(obj[key])) {
            for (let i = 0; i < obj[key].length; i++) {
              if (typeof obj[key][i] === 'object' && obj[key][i]) {
                if (fixObj(obj[key][i])) changed = true;
              } else if (typeof obj[key][i] === 'string') {
                const fixed = fixStr(obj[key][i]);
                if (fixed !== obj[key][i]) { obj[key][i] = fixed; changed = true; }
              }
            }
          } else if (typeof obj[key] === 'object' && obj[key]) {
            if (fixObj(obj[key])) changed = true;
          }
        }
        return changed;
      }
      const allAgents = await db.getAll('agents') || [];
      for (const a of allAgents) { if (fixObj(a)) await db.put('agents', a); }
      const allWfs = await db.getAll('workflows') || [];
      for (const w of allWfs) { if (fixObj(w)) await db.put('workflows', w); }
      const allChats = await db.getAll('chats') || [];
      for (const c of allChats) { if (fixObj(c)) await db.put('chats', c); }
      await db.put('settings', { id: 'patched_mojibake_v2', value: true });
    } catch(e) {}
  }


  // Initialize default agents and workflows unconditionally so they always exist
  await initializeDefaultAgents();
  await initializeQcmWorkflow();
  await initializeVraiFauxWorkflow();
  await initializeAuditWorkflow();
  await initializeGuideAgent();

  if (!isFirstRun) {
    // One-time patch: delete bugged Arabic workflows so they get recreated with the fix
    const patchedAr = await db.get('settings', 'patched_ar_agents_v2').catch(()=>null);
    if (!patchedAr) {
      await db.delete('workflows', 'wf-qcm-fondamentaux-ar').catch(()=>{});
      await db.delete('workflows', 'wf-qcm-approfondissement-ar').catch(()=>{});
      await db.put('settings', { id: 'patched_ar_agents_v2', value: true }).catch(()=>{});
    }

    // One-time patch: rename workflows to "QCM-Ar II تعميق" and "QCM-Ar I"
    const patchedNameAr = await db.get('settings', 'patched_wf_name_ar_v2').catch(()=>null);
    if (!patchedNameAr) {
      try {
        const wfApp = await db.get('workflows', 'wf-qcm-approfondissement-ar');
        if (wfApp) {
          wfApp.name = "QCM-Ar II تعميق";
          await db.put('workflows', wfApp);
        }
        const wfFond = await db.get('workflows', 'wf-qcm-fondamentaux-ar');
        if (wfFond) {
          wfFond.name = "QCM-Ar I";
          await db.put('workflows', wfFond);
        }
      } catch (e) {
        console.error("Failed to patch workflow name:", e);
      }
      await db.put('settings', { id: 'patched_wf_name_ar_v2', value: true }).catch(()=>{});
    }

    // One-time patch: force recreate audit workflow to update the Formatteur instructions
    const patchedAudit3 = await db.get('settings', 'patched_audit_v3').catch(()=>null);
    if (!patchedAudit3) {
      await db.delete('workflows', 'wf_audit_academique').catch(()=>{});
      await db.put('settings', { id: 'patched_audit_v3', value: true }).catch(()=>{});
      await initializeAuditWorkflow();
    }

    // Patch v4: add Web Search tool to the Inspector
    const patchedAudit4 = await db.get('settings', 'patched_audit_v4_websearch').catch(()=>null);
    if (!patchedAudit4) {
      await db.delete('workflows', 'wf_audit_academique').catch(()=>{});
      await db.delete('workflows', 'wf_academic_audit_en').catch(()=>{});
      await db.put('settings', { id: 'patched_audit_v4_websearch', value: true }).catch(()=>{});
      await initializeAuditWorkflow();
      await initializeAcademicAuditWorkflowEN();
    }

    // Patch v5: Clean Correcteur Output (No intro/outro)
    const patchedAudit5 = await db.get('settings', 'patched_audit_v5_cleanoutput').catch(()=>null);
    if (!patchedAudit5) {
      await db.delete('workflows', 'wf_audit_academique').catch(()=>{});
      await db.delete('workflows', 'wf_academic_audit_en').catch(()=>{});
      await db.put('settings', { id: 'patched_audit_v5_cleanoutput', value: true }).catch(()=>{});
      await initializeAuditWorkflow();
      await initializeAcademicAuditWorkflowEN();
    }

    // Patch v6: Strictly preserve [x] position
    const patchedAudit6 = await db.get('settings', 'patched_audit_v6_preserve_x').catch(()=>null);
    if (!patchedAudit6) {
      await db.delete('workflows', 'wf_audit_academique').catch(()=>{});
      await db.delete('workflows', 'wf_academic_audit_en').catch(()=>{});
      await db.put('settings', { id: 'patched_audit_v6_preserve_x', value: true }).catch(()=>{});
      await initializeAuditWorkflow();
      await initializeAcademicAuditWorkflowEN();
    }

    // Patch v7: Strictly preserve "Pour aller plus loin" URL
    const patchedAudit7 = await db.get('settings', 'patched_audit_v7_preserve_url').catch(()=>null);
    if (!patchedAudit7) {
      await db.delete('workflows', 'wf_audit_academique').catch(()=>{});
      await db.delete('workflows', 'wf_academic_audit_en').catch(()=>{});
      await db.put('settings', { id: 'patched_audit_v7_preserve_url', value: true }).catch(()=>{});
      await initializeAuditWorkflow();
      await initializeAcademicAuditWorkflowEN();
    }

    // Patch v8: Fix [URL] literal bug
    const patchedAudit8 = await db.get('settings', 'patched_audit_v8_fix_url_literal').catch(()=>null);
    if (!patchedAudit8) {
      await db.delete('workflows', 'wf_audit_academique').catch(()=>{});
      await db.delete('workflows', 'wf_academic_audit_en').catch(()=>{});
      await db.put('settings', { id: 'patched_audit_v8_fix_url_literal', value: true }).catch(()=>{});
      await initializeAuditWorkflow();
      await initializeAcademicAuditWorkflowEN();
    }

    // Patch v9: Bulletproof URL preservation
    const patchedAudit9 = await db.get('settings', 'patched_audit_v9_bulletproof_url').catch(()=>null);
    if (!patchedAudit9) {
      await db.delete('workflows', 'wf_audit_academique').catch(()=>{});
      await db.delete('workflows', 'wf_academic_audit_en').catch(()=>{});
      await db.put('settings', { id: 'patched_audit_v9_bulletproof_url', value: true }).catch(()=>{});
      await initializeAuditWorkflow();
      await initializeAcademicAuditWorkflowEN();
    }

    // Patch v10: Create Mega-Chain workflows
    const patchedMegaChain = await db.get('settings', 'patched_megachain_v1').catch(()=>null);
    if (!patchedMegaChain) {
      await db.delete('workflows', 'wf-mega-fondamentaux-fr').catch(()=>{});
      await db.delete('workflows', 'wf-mega-fundamentals-en').catch(()=>{});
      await db.put('settings', { id: 'patched_megachain_v1', value: true }).catch(()=>{});
      await initializeFlashCardsWorkflow();
      await initializeMegaChainWorkflows();
    }

    // Patch v11: Fix agent 2 format (no Q[n] headers) and agent 4 LaTeX (no \text{})
    const patchedV11 = await db.get('settings', 'patched_v11_format_fix').catch(()=>null);
    if (!patchedV11) {
      const prefixes = ['fondamentaux','approfondissement','fondamentaux-ar','approfondissement-ar','fundamentals-en','advanced-en'];
      for (const p of prefixes) {
        await db.delete('workflows', `wf-qcm-${p}`).catch(()=>{});
        for (let i=1;i<=5;i++) await db.delete('agents', `wf-${p}-agent${i}`).catch(()=>{});
      }
      await db.delete('workflows', 'wf-mega-fondamentaux-fr').catch(()=>{});
      await db.delete('workflows', 'wf-mega-fundamentals-en').catch(()=>{});
      await db.put('settings', { id: 'patched_v11_format_fix', value: true }).catch(()=>{});
      await initializeQcmWorkflow();
      await initializeFlashCardsWorkflow();
      await initializeMegaChainWorkflows();
    }
    // Patch v12: Fix mega chain corrector format template causing missing options
    const patchedMegaV12 = await db.get('settings', 'patched_mega_v12_format').catch(()=>null);
    if (!patchedMegaV12) {
      await db.delete('workflows', 'wf-mega-fondamentaux-fr').catch(()=>{});
      await db.delete('workflows', 'wf-mega-fundamentals-en').catch(()=>{});
      await db.put('settings', { id: 'patched_mega_v12_format', value: true }).catch(()=>{});
      await initializeFlashCardsWorkflow();
      await initializeMegaChainWorkflows();
    }
    
    // Patch v13: Fix Agent 4 & 5 format template causing missing letters
    const patchedMegaV13 = await db.get('settings', 'patched_mega_v13_letters').catch(()=>null);
    if (!patchedMegaV13) {
      const prefixes = ['fondamentaux','approfondissement','fondamentaux-ar','approfondissement-ar','fundamentals-en','advanced-en'];
      for (const p of prefixes) {
        await db.delete('workflows', `wf-qcm-${p}`).catch(()=>{});
        for (let i=1;i<=5;i++) await db.delete('agents', `wf-${p}-agent${i}`).catch(()=>{});
      }
      await db.delete('workflows', 'wf-mega-fondamentaux-fr').catch(()=>{});
      await db.delete('workflows', 'wf-mega-fundamentals-en').catch(()=>{});
      await db.put('settings', { id: 'patched_mega_v13_letters', value: true }).catch(()=>{});
      await initializeQcmWorkflow();
      await initializeFlashCardsWorkflow();
      await initializeMegaChainWorkflows();
    }
    
    // Patch v14: Put [x] back in templates with explicit note
    const patchedMegaV14 = await db.get('settings', 'patched_mega_v14_letters').catch(()=>null);
    if (!patchedMegaV14) {
      const prefixes = ['fondamentaux','approfondissement','fondamentaux-ar','approfondissement-ar','fundamentals-en','advanced-en'];
      for (const p of prefixes) {
        await db.delete('workflows', `wf-qcm-${p}`).catch(()=>{});
        for (let i=1;i<=5;i++) await db.delete('agents', `wf-${p}-agent${i}`).catch(()=>{});
      }
      await db.delete('workflows', 'wf-mega-fondamentaux-fr').catch(()=>{});
      await db.delete('workflows', 'wf-mega-fundamentals-en').catch(()=>{});
      await db.put('settings', { id: 'patched_mega_v14_letters', value: true }).catch(()=>{});
      await initializeQcmWorkflow();
      await initializeFlashCardsWorkflow();
      await initializeMegaChainWorkflows();
    }
    
    // Patch v15: Add Arabic Mega Chain
    const patchedMegaArV15 = await db.get('settings', 'patched_mega_ar_v15').catch(()=>null);
    if (!patchedMegaArV15) {
      await db.delete('workflows', 'wf-mega-fondamentaux-ar').catch(()=>{});
      await db.put('settings', { id: 'patched_mega_ar_v15', value: true }).catch(()=>{});
      await initializeFlashCardsWorkflow();
      await initializeMegaChainWorkflows();
    }
    
    // Patch v16: Add Arabic standalone Audit Chain
    const patchedAuditArV16 = await db.get('settings', 'patched_audit_ar_v16').catch(()=>null);
    if (!patchedAuditArV16) {
      await db.delete('workflows', 'wf_academic_audit_ar').catch(()=>{});
      await db.put('settings', { id: 'patched_audit_ar_v16', value: true }).catch(()=>{});
      await initializeAcademicAuditWorkflowAR();
    }
    
    // Patch v17: Force update "Pour aller plus loin" links to French Wikipedia
    const patchedWikiFrV17 = await db.get('settings', 'patched_wiki_fr_v17').catch(()=>null);
    if (!patchedWikiFrV17) {
      const wfsToDel = [
        'wf-mega-fondamentaux-fr', 'wf-mega-fundamentals-en', 'wf-mega-fondamentaux-ar',
        'wf_academic_audit', 'wf_academic_audit_en', 'wf_academic_audit_ar',
        'wf-qcm-fondamentaux', 'wf-qcm-approfondissement', 
        'wf-qcm-fondamentaux-ar', 'wf-qcm-approfondissement-ar'
      ];
      for (const w of wfsToDel) await db.delete('workflows', w).catch(()=>{});
      await db.put('settings', { id: 'patched_wiki_fr_v17', value: true }).catch(()=>{});
      
      await initializeQcmWorkflow();
      await initializeFlashCardsWorkflow();
      await initializeMegaChainWorkflows();
      await initializeAuditWorkflow();
      await initializeAcademicAuditWorkflowEN();
      await initializeAcademicAuditWorkflowAR();
    }
    
    // Patch v18: Aggressive forbid of non-Wikipedia links
    const patchedWikiFrV18 = await db.get('settings', 'patched_wiki_fr_v18').catch(()=>null);
    if (!patchedWikiFrV18) {
      const wfsToDel = [
        'wf-mega-fondamentaux-fr', 'wf-mega-fundamentals-en', 'wf-mega-fondamentaux-ar',
        'wf_academic_audit', 'wf_academic_audit_en', 'wf_academic_audit_ar',
        'wf-qcm-fondamentaux', 'wf-qcm-approfondissement', 
        'wf-qcm-fondamentaux-ar', 'wf-qcm-approfondissement-ar'
      ];
      for (const w of wfsToDel) await db.delete('workflows', w).catch(()=>{});
      await db.put('settings', { id: 'patched_wiki_fr_v18', value: true }).catch(()=>{});
      
      await initializeQcmWorkflow();
      await initializeFlashCardsWorkflow();
      await initializeMegaChainWorkflows();
      await initializeAuditWorkflow();
      await initializeAcademicAuditWorkflowEN();
      await initializeAcademicAuditWorkflowAR();
    }
    
    // Patch v19: Fix crashed v17/v18 patches and ensure DB is fully populated
    const patchedWikiFrV19 = await db.get('settings', 'patched_wiki_fr_v19').catch(()=>null);
    if (!patchedWikiFrV19) {
      const wfsToDel = [
        'wf-mega-fondamentaux-fr', 'wf-mega-fundamentals-en', 'wf-mega-fondamentaux-ar',
        'wf_academic_audit', 'wf_academic_audit_en', 'wf_academic_audit_ar',
        'wf-qcm-fondamentaux', 'wf-qcm-approfondissement', 
        'wf-qcm-fondamentaux-ar', 'wf-qcm-approfondissement-ar'
      ];
      for (const w of wfsToDel) await db.delete('workflows', w).catch(()=>{});
      
      await initializeQcmWorkflow();
      await initializeFlashCardsWorkflow();
      await initializeMegaChainWorkflows();
      await initializeAuditWorkflow();
      await initializeAcademicAuditWorkflowEN();
      await initializeAcademicAuditWorkflowAR();
      
      await db.put('settings', { id: 'patched_wiki_fr_v19', value: true }).catch(()=>{});
    }
    
    // Patch v20: Fix paradox in prompt between "no invented info" and inventing Wiki links
    const patchedWikiFrV20 = await db.get('settings', 'patched_wiki_fr_v20').catch(()=>null);
    if (!patchedWikiFrV20) {
      const wfsToDel = [
        'wf-mega-fondamentaux-fr', 'wf-mega-fundamentals-en', 'wf-mega-fondamentaux-ar',
        'wf_academic_audit', 'wf_academic_audit_en', 'wf_academic_audit_ar',
        'wf-qcm-fondamentaux', 'wf-qcm-approfondissement', 
        'wf-qcm-fondamentaux-ar', 'wf-qcm-approfondissement-ar'
      ];
      for (const w of wfsToDel) await db.delete('workflows', w).catch(()=>{});
      
      await initializeQcmWorkflow();
      await initializeFlashCardsWorkflow();
      await initializeMegaChainWorkflows();
      await initializeAuditWorkflow();
      await initializeAcademicAuditWorkflowEN();
      await initializeAcademicAuditWorkflowAR();
      
      await db.put('settings', { id: 'patched_wiki_fr_v20', value: true }).catch(()=>{});
    }
    
    // Patch v21: Audit Corrector strictly forbids copying links from original PDF
    const patchedWikiFrV21 = await db.get('settings', 'patched_wiki_fr_v21').catch(()=>null);
    if (!patchedWikiFrV21) {
      const wfsToDel = [
        'wf-mega-fondamentaux-fr', 'wf-mega-fundamentals-en', 'wf-mega-fondamentaux-ar',
        'wf_academic_audit', 'wf_academic_audit_en', 'wf_academic_audit_ar'
      ];
      for (const w of wfsToDel) await db.delete('workflows', w).catch(()=>{});
      
      await initializeFlashCardsWorkflow();
      await initializeMegaChainWorkflows();
      await initializeAuditWorkflow();
      await initializeAcademicAuditWorkflowEN();
      await initializeAcademicAuditWorkflowAR();
      
      await db.put('settings', { id: 'patched_wiki_fr_v21', value: true }).catch(()=>{});
    }
    
    // One-time patch: rename all workflows to standard concise names V3
    const patchedWfNamesV4 = await db.get('settings', 'patched_wf_names_v4').catch(()=>null);
    if (!patchedWfNamesV4) {
      try {
        const updates = [
          {id: 'wf-qcm-fondamentaux', name: 'QCM-Fr 1'},
          {id: 'wf-qcm-approfondissement', name: 'QCM-Fr 2'},
          {id: 'wf-qcm-fondamentaux-ar', name: 'QCM-Ar 1'},
          {id: 'wf-qcm-approfondissement-ar', name: 'QCM-Ar2'},
          {id: 'wf-vrai-faux-consortium', name: 'VRAI/FAUX'},
          {id: 'wf_audit_academique', name: 'AUDIT'}
        ];
        for (const u of updates) {
          const wf = await db.get('workflows', u.id).catch(()=>null);
          if (wf) {
            wf.name = u.name;
            await db.put('workflows', wf);
          }
        }
      } catch (e) { console.error("Failed to patch V3 workflow names:", e); }
      await db.put('settings', { id: 'patched_wf_names_v4', value: true }).catch(()=>{});
    }

    // Patch v22: Update Guide Agent with all new features
    const patchedGuideV22 = await db.get('settings', 'patched_guide_v22').catch(()=>null);
    if (!patchedGuideV22) {
      await initializeGuideAgent(true);
      await db.put('settings', { id: 'patched_guide_v22', value: true }).catch(()=>{});
    }
  }

  // Ensure FlashCards Workflow is always initialized
  await initializeFlashCardsWorkflow();

  // ── Migration : fix agent names language mismatch in DB ──
  try {
    const _chains = [
      { prefix: 'fondamentaux',       typeName: 'Fondamentaux',       emoji: '📘', lang: 'fr' },
      { prefix: 'approfondissement',  typeName: 'Approfondissement',  emoji: '📙', lang: 'fr' },
      { prefix: 'fondamentaux-ar',    typeName: 'استرداد المعارف',   emoji: '📘', lang: 'ar' },
      { prefix: 'approfondissement-ar', typeName: 'الاستدلال العلمي', emoji: '📙', lang: 'ar' },
    ];
    for (const ch of _chains) {
      const isAr = ch.lang === 'ar';
      const expectedNames = [
        isAr ? `${ch.emoji} الوكيل 1 : محلل ملف PDF (${ch.typeName})` : `${ch.emoji} Agent 1 : Analyste PDF (${ch.typeName})`,
        isAr ? `✍️ الوكيل 2 : محرر الأسئلة (${ch.typeName})` : `✍️ Agent 2 : Rédacteur QCM (${ch.typeName})`,
        isAr ? `🎲 الوكيل 3 : المنسق (${ch.typeName})` : `🎲 Agent 3 : Formatteur (${ch.typeName})`,
        isAr ? `🔬 الوكيل 4 : منسق LaTeX (${ch.typeName})` : `🔬 Agent 4 : Formateur LaTeX (${ch.typeName})`,
        isAr ? `✅ الوكيل 5 : المدقق النهائي (${ch.typeName})` : `✅ Agent 5 : Vérificateur Final (${ch.typeName})`,
      ];
      for (let i = 1; i <= 5; i++) {
        try {
          const ag = await db.get('agents', `wf-${ch.prefix}-agent${i}`);
          if (ag && ag.name !== expectedNames[i-1]) {
            ag.name = expectedNames[i-1];
            await db.put('agents', ag);
            console.log(`[MIGRATE] Fixed: wf-${ch.prefix}-agent${i} → ${ag.name}`);
          }
        } catch(e) {}
      }
    }
  } catch(e) { console.warn('[MIGRATE] Agent name migration failed:', e); }

  // Memories & agents
  await memory.getAll();
  await loadAgents();
  await renderArchives();

  const urlParams = new URLSearchParams(window.location.search);
  const sharedQuizId = urlParams.get('sharedQuiz');
  if (sharedQuizId) {
    toast("Téléchargement du quiz partagé...", "info");
    getSharedQuiz(sharedQuizId).then(quizData => {
      // Nettoyer l'URL
      window.history.replaceState({}, document.title, window.location.pathname);
      toast("Quiz partag\u00e9 charg\u00e9 ! Choisissez votre mode.", "success");
      // Demander le mode avant de lancer
      askQuizMode((mode) => {
        startWebQuizFromData(quizData.questions, mode);
      });
    }).catch(e => {
      toast("Lien de quiz invalide ou expiré.", "error");
    });
  }

  // Chat
  try {
    const savedChatId = await db.get('settings', 'currentChatId');
    if (savedChatId?.value) await loadChat(savedChatId.value);
    else await newChat();
  } catch(e) { await newChat(); }

  updateContextMeter();
  bindEvents();
};

// ════════════════════════════════════════
// EXPORT QUIZ PLAYER LOGIC
// ════════════════════════════════════════
async function sha256(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.prototype.map.call(new Uint8Array(buf), x=>(('00'+x.toString(16)).slice(-2))).join('');
}

async function hmacSha256(keyStr, dataStr) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw", enc.encode(keyStr), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", keyMaterial, enc.encode(dataStr));
  return Array.prototype.map.call(new Uint8Array(signature), x=>(('00'+x.toString(16)).slice(-2))).join('');
}

function obfuscateAnswer(index) {
  const revStr = index.toString().split('').reverse().join('');
  return btoa(revStr).split('').reverse().join('');
}

function isExplanationLine(text) {
  const tl = text.toLowerCase().trim();
  const ts = text.trim();
  if (ts.startsWith('\u2022') || (ts.startsWith('-') && tl.includes('explication'))) return true;
  if (ts.startsWith('.') && tl.includes('explication')) return true;
  if (tl.startsWith('explication')) return true;
  if (tl.includes('justification') && (text.includes(':') || tl.startsWith('justification'))) return true;
  if (ts.includes('\u0634\u0631\u062d') || ts.includes('\u0627\u0644\u062a\u0641\u0633\u064a\u0631')) return true;
  return false;
}

function isPourAllerPlusLoinLine(text) {
  const tl = text.toLowerCase().trim();
  const ts = text.trim();
  if (tl.includes('pour aller plus loin')) return true;
  if (ts.includes('\u0644\u0644\u0645\u0632\u064a\u062f \u0645\u0646 \u0627\u0644\u0645\u0639\u0644\u0648\u0645\u0627\u062a') || ts.includes('\u0644\u0644\u062a\u0648\u0633\u0639')) return true;
  return false;
}

function extractExplanationText(text) {
  let cleaned = text.trim();
  if (cleaned.startsWith('\u2022')) cleaned = cleaned.substring(1).trim();
  if (cleaned.startsWith('.')) cleaned = cleaned.substring(1).trim();
  if (cleaned.startsWith('-')) cleaned = cleaned.substring(1).trim();
  const prefixesFr = [
    'explication et la justification :', 'explication et justification :',
    'explication :', 'justification :'
  ];
  const cl = cleaned.toLowerCase();
  for (const p of prefixesFr) {
    if (cl.startsWith(p)) { cleaned = cleaned.substring(p.length).trim(); break; }
  }
  const prefixesAr = ['\u0634\u0631\u062d \u0625\u0636\u0627\u0641\u064a:', '\u0634\u0631\u062d \u0625\u0636\u0627\u0641\u064a :', '\u0634\u0631\u062d \u0625\u0636\u0627\u0641\u064a', '\u0627\u0644\u062a\u0641\u0633\u064a\u0631:', '\u0627\u0644\u062a\u0641\u0633\u064a\u0631 :', '\u0627\u0644\u062a\u0641\u0633\u064a\u0631', '\u0634\u0631\u062d:', '\u0634\u0631\u062d :', '\u0634\u0631\u062d'];
  for (const p of prefixesAr) {
    if (cleaned.startsWith(p)) { cleaned = cleaned.substring(p.length).trim(); break; }
  }

  return cleaned;
}

function extractPourAllerPlusLoinText(text) {
  let cleaned = text.trim();
  if (cleaned.startsWith('\u2022')) cleaned = cleaned.substring(1).trim();
  if (cleaned.startsWith('-')) cleaned = cleaned.substring(1).trim();
  if (cleaned.startsWith('.')) cleaned = cleaned.substring(1).trim();
  const prefixesFr = ['pour aller plus loin :', 'pour aller plus loin:', 'pour aller plus loin'];
  const cl = cleaned.toLowerCase();
  for (const p of prefixesFr) {
    if (cl.startsWith(p)) { cleaned = cleaned.substring(p.length).trim(); break; }
  }
  const prefixesAr = ['\u0644\u0644\u0645\u0632\u064a\u062f \u0645\u0646 \u0627\u0644\u0645\u0639\u0644\u0648\u0645\u0627\u062a:', '\u0644\u0644\u0645\u0632\u064a\u062f \u0645\u0646 \u0627\u0644\u0645\u0639\u0644\u0648\u0645\u0627\u062a :', '\u0644\u0644\u0645\u0632\u064a\u062f \u0645\u0646 \u0627\u0644\u0645\u0639\u0644\u0648\u0645\u0627\u062a', '\u0644\u0644\u062a\u0648\u0633\u0639:', '\u0644\u0644\u062a\u0648\u0633\u0639 :', '\u0644\u0644\u062a\u0648\u0633\u0639'];
  for (const p of prefixesAr) {
    if (cleaned.startsWith(p)) { cleaned = cleaned.substring(p.length).trim(); break; }
  }
  if (cleaned.startsWith(':')) cleaned = cleaned.substring(1).trim();
  return cleaned;
}

// Extrait une URL propre depuis un texte brut ou un lien markdown [texte](url)
function extractUrlFromText(raw) {
  if (!raw) return '';
  raw = raw.trim();
  // Format markdown : [texte](url)
  const mdMatch = raw.match(/\[.*?\]\((https?:\/\/[^)]+)\)/);
  if (mdMatch) return mdMatch[1];
  // URL brute
  const urlMatch = raw.match(/(https?:\/\/[^\s\)\]]+)/);
  if (urlMatch) return urlMatch[1];
  return '';
}

function processBlock(block) {
  if (!block || !block.question || !block.choix) return null;
  let cleanedChoices = [];
  let correctIndex = -1;
  let explanationText = "";
  let pourAllerPlusLoinText = "";

  for (let i = 0; i < block.choix.length; i++) {
    const choiceLine = block.choix[i];
    if (isPourAllerPlusLoinLine(choiceLine)) {
      pourAllerPlusLoinText = extractPourAllerPlusLoinText(choiceLine);
      continue;
    }
    if (isExplanationLine(choiceLine)) {
      explanationText = extractExplanationText(choiceLine);
      continue;
    }
    const isCorrect = choiceLine.toLowerCase().includes('[x]');
    let finalText = choiceLine.replace(/\[x\]/gi, '').replace(/\[X\]/g, '').trim();
    // Strip letter prefix (a-, b-, c-, d- or Arabic أ-, ب-, ج-, د-) at parse time
    finalText = finalText.replace(/^[\u200F\u200E\u202A-\u202E\u2066-\u2069]*(?:[a-d]|أ|ب|ج|د)[\-\)]\s*/i, '');
    cleanedChoices.push(finalText);
    if (isCorrect) correctIndex = cleanedChoices.length - 1;
  }

  if (block.explication && !explanationText) explanationText = block.explication;
  if (block.pour_aller_plus_loin && !pourAllerPlusLoinText) pourAllerPlusLoinText = block.pour_aller_plus_loin;
  
    if (cleanedChoices.length === 0 && explanationText) {
      const matchVF = explanationText.match(/^\s*(VRAI|FAUX)\s*[.:-]/i);
      if (matchVF) {
        cleanedChoices = ["Vrai", "Faux"];
        correctIndex = matchVF[1].toUpperCase() === "VRAI" ? 0 : 1;
      }
    }

    if (cleanedChoices.length === 0) return null;

  if (correctIndex !== -1) {
    let indices = cleanedChoices.map((_, i) => i);
    
    let lastChoice = cleanedChoices[cleanedChoices.length - 1].toLowerCase();
    let keepLastFixed = cleanedChoices.length > 2 && (
      lastChoice.includes("toutes les") || 
      lastChoice.includes("aucune") || 
      lastChoice.includes("all of") || 
      lastChoice.includes("none of") ||
      lastChoice.includes("جميع") ||
      lastChoice.includes("لا شيء")
    );
    
    let limit = keepLastFixed ? indices.length - 1 : indices.length;
    for (let i = limit - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    
    let shuffledChoices = [];
    let newCorrectIndex = -1;
    for (let i = 0; i < indices.length; i++) {
      shuffledChoices.push(cleanedChoices[indices[i]]);
      if (indices[i] === correctIndex) {
        newCorrectIndex = i;
      }
    }

    let result = {
      question: block.question,
      choix: shuffledChoices,
      reponse_obfusquee: obfuscateAnswer(newCorrectIndex)
    };
    if (explanationText) result.explication = explanationText;
    if (pourAllerPlusLoinText) result.pour_aller_plus_loin = pourAllerPlusLoinText;
    return result;
  }
  return null;
}

function processLinesStandard(allLines) {
  const finalData = [];
  let currentBlock = null;
  const questionPattern = /^\s*\d+\s*[-\u2013\u2014.)]\s*/;

  for (const textLine of allLines) {
    if (questionPattern.test(textLine) && !isExplanationLine(textLine) && !isPourAllerPlusLoinLine(textLine)) {
      if (currentBlock) {
        const processed = processBlock(currentBlock);
        if (processed) finalData.push(processed);
      }
      currentBlock = { question: textLine, choix: [], explication: "", pour_aller_plus_loin: "" };
    } else if (currentBlock) {
      if (isPourAllerPlusLoinLine(textLine)) {
        currentBlock.pour_aller_plus_loin = extractPourAllerPlusLoinText(textLine);
      } else if (isExplanationLine(textLine)) {
        currentBlock.explication = extractExplanationText(textLine);
      } else {
        currentBlock.choix.push(textLine);
      }
    }
  }
  if (currentBlock) {
    const processed = processBlock(currentBlock);
    if (processed) finalData.push(processed);
  }
  return finalData;
}

function processLinesMixed(allLines) {
  const finalQuestions = [];
  let currentBlockLines = [];
  const questionPattern = /^\s*\d+\s*[-\u2013\u2014.)]\s*/;
  const vfPattern = /^\s*\[V\/F\]\s*\d+/i;

  function flushBlock(lines) {
    if (!lines.length) return null;
    lines = lines.map(l => l.trim()).filter(l => l);
    if (!lines.length) return null;

    const hasChoices = lines.some(l => l.toLowerCase().includes('[x]'));
    if (hasChoices) {
      return processBlock({ question: lines[0], choix: lines.slice(1), explication: "", pour_aller_plus_loin: "" });
    }
    if (lines.length >= 2) {
      return processBlock({ question: lines[0], choix: lines.slice(1), explication: "", pour_aller_plus_loin: "" });
    }
    return null;
  }

  for (const line of allLines) {
    const lineClean = line.trim();
    if (!lineClean) continue;
    if ((questionPattern.test(lineClean) || vfPattern.test(lineClean)) && !isExplanationLine(lineClean) && !isPourAllerPlusLoinLine(lineClean)) {
      if (currentBlockLines.length) {
        const q = flushBlock(currentBlockLines);
        if (q) finalQuestions.push(q);
      }
      currentBlockLines = [lineClean];
    } else {
      if (currentBlockLines.length) currentBlockLines.push(lineClean);
      else currentBlockLines = [lineClean];
    }
  }
  if (currentBlockLines.length) {
    const q = flushBlock(currentBlockLines);
    if (q) finalQuestions.push(q);
  }
  return finalQuestions;
}

function cleanupLineContent(text) {
  text = text.replace(/\ufeff/g, '');
  const charsToRemove = ['\u200e','\u200f','\u202a','\u202b','\u202c','\u202d','\u202e','\u00a0'];
  for (const c of charsToRemove) text = text.replaceAll(c, ' ');
  return text.trim();
}

function extractSubjectFromContent(content) {
  if (!content) return "Sujet";
  let clean = content.replace(/<details>[\s\S]*?<\/details>/gi, '');
  
  const titleMatch = clean.match(/#+\s+([^\n]+)/) || clean.match(/\*\*([^\*]{5,40})\*\*/);
  let textToSearch = titleMatch ? titleMatch[1] : clean.substring(0, 500);
  
  const words = textToSearch.split(/[\s\n'.,:;!?()\[\]{}"]+/).filter(w => w.length > 4);
  const stopwords = ['voici', 'cette', 'question', 'questions', 'réponse', 'réponses', 'choix', 'parmi', 'lequel', 'laquelle', 'lesquelles', 'lesquels', 'chaque', 'selon', 'fonction', 'soit', 'dans', 'pour', 'avec', 'tout', 'tous', 'toutes', 'chapitre', 'cours', 'exercice', 'exercices', 'sujet', 'thème', 'partie', 'section', 'génère', 'générer', 'crée', 'créer', 'fais', 'faire', 'donne', 'donner', 'rédige', 'rédiger', 'propose', 'proposer', 'quiz', 'test', 'évaluation', 'evaluation', 'niveau', 'classe', 'baccalauréat', 'lycée', 'collège', 'maroc', 'marocain', 'programme', 'suivantes', 'suivants', 'affirmation', 'affirmations', 'propositions', 'proposition', 'quelle', 'quelles', 'votre', 'concerne', 'concernant', 'correcte', 'correctes'];
  
  for (let w of words) {
    let lower = w.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // remove accents for stopword check
    if (!stopwords.includes(lower) && !lower.includes('$') && !lower.includes('\\')) {
      let subject = w.replace(/[^a-zA-Z0-9éèêàâôûùç\-]/gi, '');
      if (subject.length > 3) {
        return subject.charAt(0).toUpperCase() + subject.slice(1).toLowerCase();
      }
    }
  }
  return "Sujet";
}

async function exportQuizPlayer(msgId) {
  const msg = state.messages.find(m => (m.ts || '') == msgId);
  if (!msg || !msg.content) return;

  const rawContent = msg.content.replace(/<details>[\s\S]*<\/details>/i, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const allLines = rawContent.split('\n')
    .map(l => cleanupLineContent(l))
    .filter(l => l && !/^[-_*]{2,}$/.test(l));

  // Essayer le mode standard, sinon le mode mixte
  let questions = processLinesStandard(allLines);
  if (!questions.length) {
    questions = processLinesMixed(allLines);
  }

  if (!questions.length) {
    toast("Erreur: Aucune question valide d\u00e9tect\u00e9e dans ce message. V\u00e9rifiez le format.", "error");
    return;
  }

  const titre = document.getElementById('qp-titre').value || "Quiz sans titre";
  const matiere = document.getElementById('qp-matiere').value || "SVT";
  const auteur = document.getElementById('qp-auteur').value || "Hassan Bertane";
  const isEval = document.getElementById('qp-eval').checked;
  const timeLimit = parseInt(document.getElementById('qp-timer').value || "30");

  // Type explicite QCM pour Flutter compatibility
  let quizData = {
    titre: titre,
    lecon: matiere,
    auteur: auteur,
    type: "QCM",
    questions: questions
  };

  // Hash compact : tri récursif de toutes les clés (identique à Flutter _recursiveSort)
  const deepSortObj = (obj) => {
    if (Array.isArray(obj)) return obj.map(deepSortObj);
    if (obj && typeof obj === 'object') {
      return Object.keys(obj).sort().reduce((acc, key) => {
        acc[key] = deepSortObj(obj[key]);
        return acc;
      }, {});
    }
    return obj;
  };

  const sortedData = deepSortObj(quizData);
  const rawJson = JSON.stringify(sortedData);
  const qHash = (await sha256(rawJson)).substring(0, 16);

  // CRITIQUE : Les clés de settings DOIVENT être en ordre alphabétique {e, h, s, t}
  // pour correspondre exactement à la vérification Flutter (Hmac sur JSON trié)
  const settings = { e: isEval ? 1 : 0, h: qHash, s: isEval ? 1 : 0, t: timeLimit };
  const settingsStr = JSON.stringify(settings);

  const QP_KEY = "QzPl@y3r_2026!sEcReT";
  const signature = await hmacSha256(QP_KEY, settingsStr);

  const payload = `${settingsStr}|${signature}`;
  const blobB64 = btoa(unescape(encodeURIComponent(payload)));

  quizData._qp = blobB64;

  const finalJson = JSON.stringify(quizData, null, 2);
  const source = 'data:application/json;charset=utf-8,' + encodeURIComponent(finalJson);
  const fileDownload = document.createElement("a");
  document.body.appendChild(fileDownload);
  fileDownload.href = source;
  
  let downloadName = titre.replace(/\s+/g,'_');
  if (!downloadName.toLowerCase().startsWith('qcm')) {
    downloadName = `QCM-${downloadName}`;
  }
  fileDownload.download = `${downloadName}.json`;
  
  fileDownload.click();
  document.body.removeChild(fileDownload);

  const modal = document.getElementById('quiz-player-modal');
  if (modal) modal.classList.remove('active');
  toast(`Fichier Quiz Player export\u00e9 ! (${questions.length} questions)`, "success");
}

function exportMessageToWord(msgId) {
    const contentEl = document.getElementById(`mc-${msgId}`);
    if (!contentEl) return;
    const msg = state.messages.find(m => (m.ts || '') == msgId);
    const isFc = msg && (msg.workflowUsed === 'FC-Fr 1' || msg.workflowUsed === 'FC-Fr 2' || msg.workflowUsed === 'FC-Ar 1' || msg.workflowUsed === 'FC-Ar 2' || msg.workflowUsed === 'FC-En 1' || msg.workflowUsed === 'FC-En 2');
    
    let htmlContent = contentEl.innerHTML;

    // Supprimer le bloc de trace de chaîne (<details>)
    htmlContent = htmlContent.replace(/<details[\s\S]*?<\/details>/gi, '');
    htmlContent = htmlContent.replace(/🔗 Résultat de la chaîne.*?(<br>|<\/p>|<h[1-6]>)/ig, '$1');

    if (isFc) {
      // Reconstruire le format exact à partir du texte brut via le parser
      const cards = parseFcOutput(msg.content);
      if (cards.length > 0) {
        htmlContent = cards.map(c => `
<p style="margin-bottom: 24px; line-height: 1.6;">
  ${c.id}- ${escapeHtml(c.question)}<br>
  Réponse : ${escapeHtml(c.reponse)}<br>
  • Explication : ${escapeHtml(c.explication)}<br>
  • Pour aller plus loin : ${c.pour_aller_plus_loin ? `<a href="${c.pour_aller_plus_loin}">${escapeHtml(c.pour_aller_plus_loin)}</a>` : ''}
</p>
        `).join('');
      }
    } else {
      // Pour QCM : supprimer intro avant question 1
      const firstQMatch = htmlContent.match(/(<p[^>]*>|<br>|<div>|\n|^)\s*1-\s/i);
      if (firstQMatch) htmlContent = htmlContent.substring(firstQMatch.index);
      // Supprimer la trace de parcours
      const traceIdx = htmlContent.indexOf('🔗 Détail du parcours');
      if (traceIdx !== -1) {
        const hrIdx = htmlContent.lastIndexOf('<hr>', traceIdx);
        htmlContent = htmlContent.substring(0, hrIdx !== -1 ? hrIdx : traceIdx);
      }
    }

    // Nettoyage commun
    htmlContent = htmlContent.replace(/_{5,}/g, '');
    htmlContent = htmlContent.replace(/<hr[^>]*>/ig, '');
    htmlContent = htmlContent.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_, inner) =>
       `<div style="font-family:Consolas,monospace;background:#f4f4f4;padding:10px;border:1px solid #ddd;">${inner.replace(/\n/g, '<br>')}</div>`);
    htmlContent = htmlContent.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '$1');

    const header = "<html xmlns:o='urn:schemas-microsoft-com:office:office' " +
                   "xmlns:w='urn:schemas-microsoft-com:office:word' " +
                   "xmlns='http://www.w3.org/TR/REC-html40'>" +
                   "<head><meta charset='utf-8'><title>Export</title>" +
                   "<style>body{font-family:Calibri,sans-serif;line-height:1.6;} a{color:#1a73e8;}</style>" +
                   "</head><body>";
    const sourceHTML = header + htmlContent + "</body></html>";
    
    const isQcm = msg && msg.content && /\[x\]\s*[a-d]-/i.test(msg.content);
    let filename = isFc ? 'FC_Export.doc' : (isQcm ? 'QCM_Export.doc' : 'Doc_Export.doc');
    if (msg && msg.isCorrection) filename = 'Fiche_Correction.doc';
    else if (msg && msg.isMethode) filename = 'Fiche_Methode.doc';
    
    if (msg && msg.content) {
      // Find associated user message for correction / methode sheet titles
      let subject = 'fiche';
      if (msg.isCorrection) {
        const idx = state.messages.findIndex(m => m.ts === msg.ts);
        const userMsg = state.messages.slice(0, idx).reverse().find(m => m.role === 'user');
        if (userMsg && userMsg.content) {
           const match = userMsg.content.match(/—\s*(.*)$/);
           subject = match ? match[1].trim() : extractSubjectFromContent(msg.content);
        } else {
           subject = extractSubjectFromContent(msg.content);
        }
        filename = `Fiche_${subject.replace(/\s+/g,'_').slice(0, 50)}.doc`;
      } else if (msg.isMethode) {
        const idx = state.messages.findIndex(m => m.ts === msg.ts);
        const userMsg = state.messages.slice(0, idx).reverse().find(m => m.role === 'user');
        if (userMsg && userMsg.content) {
           // Le titre utilisateur a le format "🧠 Fiche Méthode — Maths 2BAC"
           const match = userMsg.content.match(/—\s*(.*)$/);
           subject = match ? match[1].trim() : extractSubjectFromContent(msg.content);
        } else {
           subject = extractSubjectFromContent(msg.content);
        }
        filename = `Fiche_Methode_${subject.replace(/\s+/g,'_').slice(0, 50)}.doc`;
      } else {
        subject = extractSubjectFromContent(msg.content);
        const prefix = isFc ? 'FC-' : (isQcm ? 'QCM-' : 'Doc-');
        filename = `${prefix}${subject.replace(/\s+/g,'_').slice(0, 50)}.doc`;
      }
    }
    
    const blob = new Blob(['\ufeff', sourceHTML], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const fileDownload = document.createElement("a");
    document.body.appendChild(fileDownload);
    fileDownload.href = url;
    fileDownload.download = filename;
    fileDownload.click();
    setTimeout(() => { document.body.removeChild(fileDownload); URL.revokeObjectURL(url); }, 100);
    toast("Export Word réussi !", "success");
}

// ════════════════════════════════════════
// FLASHCARD PARSER & PLAYER
// ════════════════════════════════════════

function parseFcOutput(rawText) {
  // Etape 0 : Extraire la section reponse_finale si presente
  let workText = rawText;
  const rfMatch = workText.match(/<reponse_finale>([\s\S]*?)<\/reponse_finale>/i);
  if (rfMatch) {
    workText = rfMatch[1];
  } else {
    const rf2 = workText.match(/<r[e\u00e9]ponse[_\s]?finale[^>]*>([\s\S]*?)<\/r[e\u00e9]ponse[_\s]?finale>/i);
    if (rf2) workText = rf2[1];
  }

  // Etape 1 : Supprimer tous les blocs brouillons/wrapper
  workText = workText
    .replace(/<brouillon[^>]*>[\s\S]*?<\/brouillon[^>]*>/gi, '')
    .replace(/<brouillon_invisible[^>]*>[\s\S]*?<\/brouillon_invisible>/gi, '')
    .replace(/<verification[^>]*>[\s\S]*?<\/verification>/gi, '')
    .replace(/<details[\s\S]*?<\/details>/gi, '')
    .replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Etape 2 : Parser les blocs Q/R
  // On utilise une Map pour ne garder que la DERNIERE occurrence de chaque numero
  const blockRegex = /^\s*(\d{1,2})\s*[-.]\s+(.+)/;
  const lines = workText.split('\n');
  let current = null;
  const cardMap = new Map();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const m = line.match(blockRegex);

    if (m && parseInt(m[1]) >= 1 && parseInt(m[1]) <= 20) {
      if (current) cardMap.set(current.id, current);
      let qText = m[2].trim().replace(/^\*\*(.*?)\*\*$/, '$1').replace(/^__(.*?)__$/, '$1');
      qText = qText.replace(/^Niv(?:eau)?\.?\s*\d+\s*[:\-\u2013\u2014]\s*/i, '').trim();
      current = { id: parseInt(m[1]), question: qText, reponse: '', explication: '', pour_aller_plus_loin: '' };
    } else if (current) {
      if (/^\s*(?:\u2022|-|\*)?\s*(?:\*\*|__)?(?:r[e\u00e9\u00e8\u00ea]ponse|الجواب|Answer)\s*(?:\*\*|__)?\s*:/i.test(line)) {
        current.reponse = line.replace(/^\s*(?:\u2022|-|\*)?\s*(?:\*\*|__)?(?:r[e\u00e9\u00e8\u00ea]ponse|الجواب|Answer)\s*(?:\*\*|__)?\s*:\s*/i, '').replace(/^\*\*(.*?)\*\*$/, '$1').trim();
        current._section = 'reponse';
      } else if (/^\s*(?:\u2022|-|\*)?\s*(?:\*\*|__)?(?:explication|الشرح|Explanation)\s*(?:\*\*|__)?\s*:/i.test(line)) {
        current.explication = line.replace(/^\s*(?:\u2022|-|\*)?\s*(?:\*\*|__)?(?:explication|الشرح|Explanation)\s*(?:\*\*|__)?\s*:\s*/i, '').replace(/^\*\*(.*?)\*\*$/, '$1').trim();
        current._section = 'explication';
      } else if (/^\s*(?:\u2022|-|\*)?\s*(?:\*\*|__)?(?:pour aller plus loin|للمزيد|To go further)\s*(?:\*\*|__)?\s*:/i.test(line)) {
        current.pour_aller_plus_loin = line.replace(/^\s*(?:\u2022|-|\*)?\s*(?:\*\*|__)?(?:pour aller plus loin|للمزيد|To go further)\s*(?:\*\*|__)?\s*:\s*/i, '').replace(/^\*\*(.*?)\*\*$/, '$1').trim();
        current._section = 'lien';
      } else if (line && current._section === 'reponse' && !current.explication) {
        // Ligne de continuation de la reponse (y compris avec puces)
        current.reponse += ' ' + line.replace(/^\s*[\u2022\-\*]\s*/, '');
      } else if (line && current._section === 'explication' && !current.pour_aller_plus_loin) {
        // Ligne de continuation de l'explication (y compris avec puces)
        current.explication += ' ' + line.replace(/^\s*[\u2022\-\*]\s*/, '');
      }
    }
  }
  if (current) {
    delete current._section;
    cardMap.set(current.id, current);
  }
  // Nettoyage : supprimer _section de toutes les cartes
  for (const c of cardMap.values()) delete c._section;

  // Etape 3 : Tableau trie
  const cards = Array.from(cardMap.values()).sort((a, b) => a.id - b.id);
  return cards;
}

async function exportFcAsJson(msgId) {
  const msg = state.messages.find(m => (m.ts || '') == msgId);
  if (!msg || !msg.content) return;

  const questions = parseFcOutput(msg.content);
  if (!questions.length) { toast('Aucune FlashCard détectée dans ce message.', 'error'); return; }

  const subject = extractSubjectFromContent(msg.content);

  // Modale pour titre / leçon
  const existingModal = document.getElementById('fc-export-modal');
  if (existingModal) existingModal.remove();
  const modal = document.createElement('div');
  modal.id = 'fc-export-modal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.75);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;';
  modal.innerHTML = `
    <div style="background:linear-gradient(135deg,#1a1a2e,#16213e);border:1px solid rgba(245,158,11,0.4);border-radius:20px;padding:32px;width:440px;box-shadow:0 20px 60px rgba(0,0,0,0.6);">
      <h3 style="color:#f59e0b;margin:0 0 8px 0;font-size:20px;">📇 Exporter les FlashCards (JSON QR)</h3>
      <p style="color:#aaa;font-size:13px;margin:0 0 20px 0;">${questions.length} FlashCards détectées. Complétez les informations ci-dessous.</p>
      <label style="color:#ddd;font-size:13px;font-weight:600;display:block;margin-bottom:4px;">Titre</label>
      <input id="fc-export-titre" type="text" value="FC-${subject}" style="width:100%;box-sizing:border-box;padding:8px 12px;border-radius:10px;border:1px solid rgba(245,158,11,0.3);background:rgba(255,255,255,0.07);color:#fff;font-size:14px;outline:none;margin-bottom:14px;">\n      <label style="color:#ddd;font-size:13px;font-weight:600;display:block;margin-bottom:4px;">Matière</label>\n      <input id="fc-export-matiere" type="text" value="SVT" style="width:100%;box-sizing:border-box;padding:8px 12px;border-radius:10px;border:1px solid rgba(245,158,11,0.3);background:rgba(255,255,255,0.07);color:#fff;font-size:14px;outline:none;margin-bottom:14px;">
      <label style="color:#ddd;font-size:13px;font-weight:600;display:block;margin-bottom:4px;">Leçon / Chapitre</label>
      <input id="fc-export-lecon" type="text" placeholder="ex: Chapitre 3" style="width:100%;box-sizing:border-box;padding:8px 12px;border-radius:10px;border:1px solid rgba(245,158,11,0.3);background:rgba(255,255,255,0.07);color:#fff;font-size:14px;outline:none;margin-bottom:14px;">
        <label style="color:#ddd;font-size:13px;font-weight:600;display:block;margin-bottom:4px;">Auteur du quiz</label>
        <input id="fc-export-auteur" type="text" value="Bertane Hassan" style="width:100%;box-sizing:border-box;padding:8px 12px;border-radius:10px;border:1px solid rgba(245,158,11,0.3);background:rgba(255,255,255,0.07);color:#fff;font-size:14px;outline:none;margin-bottom:20px;">
      <div style="display:flex;gap:12px;justify-content:flex-end;">
        <button onclick="document.getElementById('fc-export-modal').remove()" style="padding:10px 20px;border-radius:10px;border:1px solid rgba(255,255,255,0.15);background:transparent;color:#aaa;cursor:pointer;font-size:14px;">Annuler</button>
        <button id="fc-export-confirm" style="padding:10px 24px;border-radius:10px;border:1px solid rgba(245,158,11,0.4);background:rgba(245,158,11,0.15);color:#f59e0b;font-weight:700;cursor:pointer;font-size:14px;">⬇️ Télécharger</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  setTimeout(() => { const inp = document.getElementById('fc-export-titre'); if(inp){inp.focus();inp.select();} }, 50);
  modal.addEventListener('click', e => { if(e.target === modal) modal.remove(); });

  document.getElementById('fc-export-confirm').addEventListener('click', async () => {
    const titre = (document.getElementById('fc-export-titre')?.value || `FC-${subject}`).trim();
    const lecon = (document.getElementById('fc-export-lecon')?.value || '').trim();
      const auteur = (document.getElementById('fc-export-auteur')?.value || 'Bertane Hassan').trim();
      const matiere = (document.getElementById('fc-export-matiere')?.value || 'SVT').trim();
    modal.remove();

    const quizData = {
      titre, lecon,
      auteur: auteur,
      type: 'QR',
      theme: '', level: '',
      questions
    };

    // Génération de la signature _qp (compatible Flutter SecurityUtils)
    const deepSortObj = (obj) => {
      if (Array.isArray(obj)) return obj.map(deepSortObj);
      if (obj && typeof obj === 'object') return Object.keys(obj).sort().reduce((acc, k) => { acc[k] = deepSortObj(obj[k]); return acc; }, {});
      return obj;
    };
    const sortedData = deepSortObj({...quizData});
    const rawJson = JSON.stringify(sortedData);
    const qHash = (await sha256(rawJson)).substring(0, 16);
    // CRITIQUE : clés en ordre alphabétique {e, h, s, t} pour correspondre à Flutter
    const settings = { e: 0, h: qHash, s: 0, t: 30 };
    const settingsStr = JSON.stringify(settings);
    const QP_KEY = 'QzPl@y3r_2026!sEcReT';
    const signature = await hmacSha256(QP_KEY, settingsStr);
    const payload = `${settingsStr}|${signature}`;
    quizData._qp = btoa(unescape(encodeURIComponent(payload)));

    const finalJson = JSON.stringify(quizData, null, 2);
    const a = document.createElement('a');
    a.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(finalJson);
    a.download = `${titre.replace(/\s+/g,'_')}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    toast(`FlashCards exportées (${questions.length} cartes) !`, 'success');
  });
}

function openFlashCardPlayer(msgId) {
  const msg = state.messages.find(m => (m.ts || '') == msgId);
  if (!msg || !msg.content) return;
  const cards = parseFcOutput(msg.content);
  if (!cards.length) { toast('Aucune FlashCard détectée.', 'error'); return; }
  const arabicRegex = /[\u0600-\u06FF\u0750-\u077F]/;
  const isArabic = (msg.workflowUsed === 'FC-Ar 1' || msg.workflowUsed === 'FC-Ar 2') || arabicRegex.test(msg.content);
  const isEnglish = (msg.workflowUsed === 'FC-En 1' || msg.workflowUsed === 'FC-En 2');
  _showFlashCardPlayer(cards, { titre: extractSubjectFromContent(msg.content) }, msgId, isArabic, isEnglish);
}

function _showFlashCardPlayer(cards, metadata = {}, msgId = null, isArabic = false, isEnglish = false) {
  const existing = document.getElementById('fc-player-overlay');
  if (existing) existing.remove();
  let idx = 0;
  let flipped = false;

  const overlay = document.createElement('div');
  overlay.id = 'fc-player-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:99990;background:rgba(0,0,0,0.85);backdrop-filter:blur(12px);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;padding:20px;';

  // Écran Détail identique à explanation_screen.dart de Flutter
  function showDetailScreen(card) {
    const existing = document.getElementById('fc-detail-overlay');
    if (existing) existing.remove();
    const det = document.createElement('div');
    det.id = 'fc-detail-overlay';
    det.style.cssText = 'position:fixed;inset:0;z-index:99995;background:rgba(0,0,0,0.95);backdrop-filter:blur(20px);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:24px;overflow-y:auto;';
    const esc = (s) => s ? String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') : '';
    det.innerHTML = `
      <div style="width:100%;max-width:850px;">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:24px;">
          <button id="fc-detail-back" style="padding:8px 18px;border-radius:10px;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.07);color:#e2e8f0;cursor:pointer;font-size:13px;">${isArabic ? 'عودة ◀' : (isEnglish ? '◀ Back' : '◀ Retour')}</button>
          <span style="color:#f59e0b;font-size:13px;font-weight:700;letter-spacing:2px;">${isArabic ? '💡 التفاصيل — بطاقة' : (isEnglish ? '💡 DETAIL — CARD' : '💡 DÉTAIL — CARTE')} ${card.id}</span>
        </div>
        <div style="background:linear-gradient(135deg,rgba(245,158,11,0.08),rgba(15,23,42,0.95));border:1.5px solid rgba(245,158,11,0.25);border-radius:20px;padding:28px;margin-bottom:16px;">
          <div style="color:#f59e0b;font-size:11px;font-weight:700;letter-spacing:2px;margin-bottom:10px;">${isArabic ? '❓ السؤال' : (isEnglish ? '❓ QUESTION' : '❓ QUESTION')}</div>
          <div style="color:#e2e8f0;font-size:18px;line-height:1.7;text-align:center;"${isArabic ? ' dir="rtl"' : ''}>${renderWithLatex(card.question)}</div>
        </div>
        <div style="background:linear-gradient(135deg,rgba(34,197,94,0.08),rgba(15,23,42,0.95));border:1.5px solid rgba(34,197,94,0.25);border-radius:20px;padding:28px;margin-bottom:16px;">
          <div style="color:#22c55e;font-size:11px;font-weight:700;letter-spacing:2px;margin-bottom:10px;">${isArabic ? '✅ الجواب' : (isEnglish ? '✅ ANSWER' : '✅ RÉPONSE')}</div>
          <div style="color:#e2e8f0;font-size:18px;line-height:1.7;text-align:center;"${isArabic ? ' dir="rtl"' : ''}>${renderWithLatex(card.reponse || "—")}</div>
        </div>
        ${card.explication ? `
        <div style="background:rgba(59,130,246,0.08);border:1.5px solid rgba(59,130,246,0.25);border-radius:20px;padding:24px;margin-bottom:16px;">
          <div style="color:#3b82f6;font-size:11px;font-weight:700;letter-spacing:2px;margin-bottom:10px;">${isArabic ? '💡 الشرح' : (isEnglish ? '💡 EXPLANATION' : '💡 EXPLICATION')}</div>
          <div style="color:#cbd5e1;font-size:15px;line-height:1.7;text-align:center;"${isArabic ? ' dir="rtl"' : ''}>${renderWithLatex(card.explication)}</div>
        </div>` : ''}
        ${card.pour_aller_plus_loin ? `
        <div style="background:rgba(99,102,241,0.08);border:1.5px solid rgba(99,102,241,0.25);border-radius:20px;padding:20px;">
          <div style="color:#6366f1;font-size:11px;font-weight:700;letter-spacing:2px;margin-bottom:8px;">${isArabic ? '🔗 للمزيد من المعلومات' : (isEnglish ? '🔗 TO GO FURTHER' : '🔗 POUR ALLER PLUS LOIN')}</div>
          <a href="${card.pour_aller_plus_loin}" target="_blank" style="color:#818cf8;font-size:14px;word-break:break-all;text-align:center;display:block;"${isArabic ? ' dir="rtl"' : ''}>${esc(card.pour_aller_plus_loin)}</a>
        </div>` : ''}
      </div>`;
    document.body.appendChild(det);
    document.getElementById('fc-detail-back').onclick = () => det.remove();
    if (window.MathJax && typeof window.MathJax.typesetPromise === 'function') {
      try { window.MathJax.typesetPromise([det]).catch(e => {}); } catch(e){}
    }
  }

  function render() {
    const card = cards[idx];
    flipped = false;
    overlay.innerHTML = `
      <div style="display:flex; flex-direction:column; align-items:center; margin-bottom: 12px; gap:4px; text-align:center;">
        <div style="color:#f59e0b;font-size:13px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">📇 ${metadata.titre || metadata.title ? metadata.titre || metadata.title : (isArabic ? 'بطاقات تعليمية' : (isEnglish ? 'FlashCards' : 'FlashCards'))} — ${idx + 1} / ${cards.length}</div>
        ${(metadata.matiere || metadata.lecon || metadata.auteur) ? `
        <div style="color:#94a3b8; font-size:12px; display:flex; gap:12px; flex-wrap:wrap; justify-content:center;">
          ${metadata.matiere ? `<span>📚 ${metadata.matiere}</span>` : ''}
          ${metadata.lecon ? `<span>📖 ${metadata.lecon}</span>` : ''}
          ${metadata.auteur ? `<span>✍️ ${metadata.auteur}</span>` : ''}
        </div>` : ''}
      </div>
      <div style="width:100%;max-width:850px;height:12px;background:rgba(255,255,255,0.1);border-radius:99px;overflow:hidden;">
        <div style="height:100%;width:${Math.round(((idx+1)/cards.length)*100)}%;background:linear-gradient(90deg,#f59e0b,#ef4444);border-radius:99px;transition:width 0.4s;"></div>
      </div>
      <div id="fc-card" style="width:100%;max-width:850px;min-height:360px;cursor:pointer;perspective:1000px;" onclick="document.getElementById('fc-card-inner').style.transform = document.getElementById('fc-card-inner').style.transform === 'rotateY(180deg)' ? 'rotateY(0deg)' : 'rotateY(180deg)'; document.getElementById('fc-flip-hint').style.display='none';">
        <div id="fc-card-inner" style="position:relative;width:100%;min-height:360px;transition:transform 0.5s;transform-style:preserve-3d;">
          <!-- RECTO -->
          <div style="position:absolute;inset:0;backface-visibility:hidden;-webkit-backface-visibility:hidden;background:linear-gradient(135deg,#1e293b,#0f172a);border:2px solid rgba(245,158,11,0.4);border-radius:20px;padding:32px;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;">
            <div style="color:#f59e0b;font-size:11px;font-weight:700;letter-spacing:2px;margin-bottom:16px;">${isArabic ? '❓ السؤال' : (isEnglish ? '❓ QUESTION' : '❓ QUESTION')}</div>
            <div style="color:#e2e8f0;font-size:18px;line-height:1.7;text-align:center;"${isArabic ? ' dir="rtl"' : ''}>${renderWithLatex(card.question)}</div>
            <div id="fc-flip-hint" style="margin-top:24px;color:#64748b;font-size:12px;">${isArabic ? '👆 انقر لرؤية الجواب' : (isEnglish ? '👆 Click to see the answer' : '👆 Cliquez pour voir la réponse')}</div>
          </div>
          <!-- VERSO (réponse + bouton Détail comme Flutter explanation_screen) -->
          <div style="position:absolute;inset:0;backface-visibility:hidden;-webkit-backface-visibility:hidden;transform:rotateY(180deg);background:linear-gradient(135deg,#052e16,#0f172a);border:2px solid rgba(34,197,94,0.4);border-radius:20px;padding:28px;overflow-y:auto;display:flex;flex-direction:column;justify-content:center;">
            <div style="color:#22c55e;font-size:11px;font-weight:700;letter-spacing:2px;margin-bottom:12px;">${isArabic ? '✅ الجواب' : (isEnglish ? '✅ ANSWER' : '✅ RÉPONSE')}</div>
            <div style="color:#e2e8f0;font-size:16px;line-height:1.7;margin-bottom:20px;text-align:center;"${isArabic ? ' dir="rtl"' : ''}>${renderWithLatex(card.reponse || '—')}</div>
            <div style="display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap;">
              <button onclick="event.stopPropagation();window.__fcDetail&&window.__fcDetail()" style="padding:9px 20px;border-radius:12px;border:1px solid rgba(245,158,11,0.4);background:rgba(245,158,11,0.12);color:#f59e0b;cursor:pointer;font-size:13px;font-weight:700;">${isArabic ? '💡 عرض التفاصيل' : (isEnglish ? '💡 View details' : '💡 Voir le détail')}</button>
              <button id="btn-ask-ai-back" onclick="event.stopPropagation();window.__fcAskAI&&window.__fcAskAI()" style="padding:9px 20px;border-radius:12px;border:1px solid rgba(139,92,246,0.4);background:rgba(139,92,246,0.12);color:#c4b5fd;cursor:pointer;font-size:13px;font-weight:700;">${isArabic ? '🤖 طلب الشرح' : (isEnglish ? '🤖 Explain (AI)' : '🤖 Expliquer (IA)')}</button>
            </div>
            <div id="ai-explanation-container-back" onclick="event.stopPropagation();" style="display:none;background:rgba(139,92,246,0.08);border:1px solid rgba(139,92,246,0.25);border-radius:16px;padding:20px;margin-bottom:12px;overflow-y:auto;max-height:150px;text-align:left;"></div>
          </div>
        </div>
      </div>
      <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;justify-content:center;">
        <button onclick="window.__fcPrev && window.__fcPrev()" ${idx===0?'disabled':''} style="padding:10px 22px;border-radius:12px;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.07);color:#e2e8f0;cursor:pointer;font-size:14px;${idx===0?'opacity:0.4;':''}">${isArabic ? 'السابق ◀' : (isEnglish ? '◀ Previous' : '◀ Précédent')}</button>
        <button onclick="window.__fcSave && window.__fcSave()" style="padding:10px 22px;border-radius:12px;border:1px solid rgba(245,158,11,0.4);background:rgba(245,158,11,0.1);color:#f59e0b;cursor:pointer;font-size:14px;font-weight:700;">${isArabic ? '💾 حفظ' : (isEnglish ? '💾 Save' : '💾 Sauvegarder')}</button>
        ${msgId ? `<button onclick="exportMessageToWord('${msgId}')" style="padding:10px 22px;border-radius:12px;border:1px solid rgba(79,195,247,0.4);background:rgba(79,195,247,0.1);color:#4fc3f7;cursor:pointer;font-size:14px;font-weight:700;">📄 DOCX</button>` : ''}
        ${msgId ? `<button onclick="exportFcAsJson('${msgId}')" style="padding:10px 22px;border-radius:12px;border:1px solid rgba(0,255,157,0.4);background:rgba(0,255,157,0.1);color:var(--neon);cursor:pointer;font-size:14px;font-weight:700;">⬇️ JSON</button>` : ''}
        <button onclick="window.__fcNext && window.__fcNext()" ${idx===cards.length-1?'disabled':''} style="padding:10px 22px;border-radius:12px;border:1px solid rgba(34,197,94,0.4);background:rgba(34,197,94,0.1);color:#22c55e;cursor:pointer;font-size:14px;font-weight:700;${idx===cards.length-1?'opacity:0.4;':''}">${isArabic ? 'التالي ▶' : (isEnglish ? 'Next ▶' : 'Suivant ▶')}</button>
        <button onclick="document.getElementById('fc-player-overlay').remove()" style="padding:10px 22px;border-radius:12px;border:1px solid rgba(239,68,68,0.4);background:rgba(239,68,68,0.1);color:#ef4444;cursor:pointer;font-size:14px;">${isArabic ? '✕ إغلاق' : (isEnglish ? '✕ Close' : '✕ Fermer')}</button>
      </div>`;
    window.__fcDetail = () => showDetailScreen(cards[idx]);
    if (window.MathJax && typeof window.MathJax.typesetPromise === 'function') {
      try { window.MathJax.typesetPromise([overlay]).catch(e => {}); } catch(e){}
    }
  }

  window.__fcAskAI = async () => {
    const card = cards[idx];

    if (!state.apiKey) {
      toast(isArabic ? 'يرجى إعداد مفتاح API Mistral في الإعدادات.' : (isEnglish ? 'Please configure your Mistral API key in settings.' : 'Veuillez configurer votre clé API Mistral dans les paramètres.'), 'error');
      return;
    }

    // Créer l'écran plein écran indépendant
    const existing = document.getElementById('fc-ai-explain-overlay');
    if (existing) existing.remove();

    const aiScreen = document.createElement('div');
    aiScreen.id = 'fc-ai-explain-overlay';
    aiScreen.style.cssText = 'position:fixed;inset:0;z-index:99997;background:rgba(0,0,0,0.97);backdrop-filter:blur(24px);display:flex;flex-direction:column;align-items:center;justify-content:flex-start;padding:32px 24px;overflow-y:auto;';

    aiScreen.innerHTML = `
      <div style="width:100%;max-width:900px;">
        <div style="display:flex;align-items:center;gap:16px;margin-bottom:28px;flex-wrap:wrap;">
          <button id="fc-ai-back-btn" style="padding:9px 20px;border-radius:12px;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.07);color:#e2e8f0;cursor:pointer;font-size:14px;">${isArabic ? '◀ عودة' : '◀ Retour'}</button>
          <span style="color:#c4b5fd;font-size:14px;font-weight:700;letter-spacing:2px;">🤖 ${isArabic ? 'الشرح بالذكاء الاصطناعي — بطاقة' : 'EXPLICATION IA — CARTE'} ${card.id || idx + 1}</span>
        </div>

        <div style="background:linear-gradient(135deg,rgba(245,158,11,0.07),rgba(15,23,42,0.95));border:1.5px solid rgba(245,158,11,0.2);border-radius:18px;padding:22px;margin-bottom:20px;">
          <div style="color:#f59e0b;font-size:11px;font-weight:700;letter-spacing:2px;margin-bottom:10px;">${isArabic ? '❓ السؤال' : (isEnglish ? '❓ QUESTION' : '❓ QUESTION')}</div>
          <div style="color:#e2e8f0;font-size:16px;line-height:1.7;text-align:center;"${isArabic ? ' dir="rtl"' : ''}>${renderWithLatex(card.question)}</div>
        </div>

        <div style="background:linear-gradient(135deg,rgba(34,197,94,0.07),rgba(15,23,42,0.95));border:1.5px solid rgba(34,197,94,0.2);border-radius:18px;padding:22px;margin-bottom:20px;">
          <div style="color:#22c55e;font-size:11px;font-weight:700;letter-spacing:2px;margin-bottom:10px;">${isArabic ? '✅ الجواب' : (isEnglish ? '✅ ANSWER' : '✅ RÉPONSE')}</div>
          <div style="color:#e2e8f0;font-size:16px;line-height:1.7;text-align:center;"${isArabic ? ' dir="rtl"' : ''}>${renderWithLatex(card.reponse || '—')}</div>
        </div>

        <div style="background:linear-gradient(135deg,rgba(139,92,246,0.1),rgba(15,23,42,0.95));border:1.5px solid rgba(139,92,246,0.3);border-radius:18px;padding:26px;">
          <div style="color:#c4b5fd;font-size:11px;font-weight:700;letter-spacing:2px;margin-bottom:16px;">🤖 ${isArabic ? 'الشرح بالذكاء الاصطناعي' : 'EXPLICATION IA'}</div>
          <div id="fc-ai-explain-text" style="color:#e2e8f0;font-size:16px;line-height:1.85;"${isArabic ? ' dir="rtl"' : ''}>
            <span style="color:#64748b;">${isArabic ? '⏳ جارٍ التوليد...' : '⏳ Génération en cours...'}</span>
          </div>
        </div>
      </div>`;

    document.body.appendChild(aiScreen);
    document.getElementById('fc-ai-back-btn').onclick = () => aiScreen.remove();

    const textEl = document.getElementById('fc-ai-explain-text');

    const promptText = isArabic
      ? `السؤال: "${card.question}"\nالجواب: "${card.reponse || ''}"\n\nاشرح هذا الجواب بأسلوب تعليمي مبسط ومفصل. يجب أن تكون إجابتك باللغة العربية فقط.`
      : (isEnglish ? `Question: "${card.question}"\nAnswer: "${card.reponse || ''}"\n\nExplain this answer in an educational, simple, and detailed manner. You must reply in English.` : `Question: "${card.question}"\nRéponse: "${card.reponse || ''}"\n\nExplique-moi cette réponse de manière pédagogique, simple et détaillée. Réponds impérativement en français.`);

    const sysPrompt = isArabic
      ? "أنت خبير تعليمي. يجب عليك تقديم شرح واضح ومبسط ومفصل. أجب باللغة العربية حصراً."
      : (isEnglish ? "You are an educational expert. You must provide a clear, accessible, and detailed explanation in English." : "Tu es un expert pédagogique. Tu dois fournir une explication claire, accessible et détaillée en français.");

    const _apiConf = getLlmApiConfig(state.model || "mistral-large-2512");
    const reqBody = {
      model: state.model || "mistral-large-2512",
      messages: [
        { role: "system", content: sysPrompt },
        { role: "user", content: promptText }
      ],
      temperature: 0.3,
      stream: true
    };

    try {
      const abortController = new AbortController();
      const res = await fetchWithRetry(_apiConf.url, {
        method: "POST",
        headers: _apiConf.headers,
        signal: abortController.signal,
        body: JSON.stringify(reqBody)
      });
      if (!res.ok) throw new Error(`API ${res.status}`);

      let finalResult = "";
      await handleStreamingResponse(res, (chunk) => {
        finalResult = chunk;
        textEl.innerHTML = renderWithLatex(finalResult);
      }, () => {
        if (window.MathJax && typeof window.MathJax.typesetPromise === 'function') {
          try { window.MathJax.typesetPromise([aiScreen]).catch(e => {}); } catch(e){}
        }
      }, abortController.signal);
    } catch(err) {
      textEl.innerHTML = `<div style="color:#ef4444;background:rgba(239,68,68,0.1);padding:16px;border-radius:12px;border:1px solid rgba(239,68,68,0.3);">Erreur: ${err.message}</div>`;
    }
  };

  window.__fcPrev = () => { if (idx > 0) { idx--; render(); } };
  window.__fcNext = () => { if (idx < cards.length - 1) { idx++; render(); } };
  window.__fcSave = async () => {
    const existingModal = document.getElementById('fc-export-modal');
    if (existingModal) existingModal.remove();
    const defaultTitle = metadata.titre || metadata.title || '';
    const defaultMatiere = metadata.matiere || 'SVT';
    const defaultLecon = metadata.lecon || '';
    const defaultAuteur = metadata.auteur || 'Bertane Hassan';
    const modal = document.createElement('div');
    modal.id = 'fc-export-modal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.75);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;';
    modal.innerHTML = `
      <div style="background:linear-gradient(135deg,#1a1a2e,#16213e);border:1px solid rgba(245,158,11,0.4);border-radius:20px;padding:32px;width:440px;box-shadow:0 20px 60px rgba(0,0,0,0.6);">
        <h3 style="color:#f59e0b;margin:0 0 8px 0;font-size:20px;">💾 Sauvegarder & Exporter (FC)</h3>
        <p style="color:#aaa;font-size:13px;margin:0 0 20px 0;">Donnez un nom à vos FlashCards pour les sauvegarder et les télécharger.</p>
        <label style="color:#ddd;font-size:13px;font-weight:600;display:block;margin-bottom:4px;">Titre</label>
        <input id="fc-export-titre" type="text" value="${defaultTitle ? 'FC-' + defaultTitle : 'FC-SansTitre'}" style="width:100%;box-sizing:border-box;padding:8px 12px;border-radius:10px;border:1px solid rgba(245,158,11,0.3);background:rgba(255,255,255,0.07);color:#fff;font-size:14px;outline:none;margin-bottom:14px;">
        <label style="color:#ddd;font-size:13px;font-weight:600;display:block;margin-bottom:4px;">Matière</label>
        <input id="fc-export-matiere" type="text" value="${defaultMatiere}" style="width:100%;box-sizing:border-box;padding:8px 12px;border-radius:10px;border:1px solid rgba(245,158,11,0.3);background:rgba(255,255,255,0.07);color:#fff;font-size:14px;outline:none;margin-bottom:14px;">
        <label style="color:#ddd;font-size:13px;font-weight:600;display:block;margin-bottom:4px;">Leçon / Chapitre</label>
        <input id="fc-export-lecon" type="text" value="${defaultLecon}" placeholder="ex: Chapitre 3" style="width:100%;box-sizing:border-box;padding:8px 12px;border-radius:10px;border:1px solid rgba(245,158,11,0.3);background:rgba(255,255,255,0.07);color:#fff;font-size:14px;outline:none;margin-bottom:14px;">
        <label style="color:#ddd;font-size:13px;font-weight:600;display:block;margin-bottom:4px;">Auteur du quiz</label>
        <input id="fc-export-auteur" type="text" value="${defaultAuteur}" style="width:100%;box-sizing:border-box;padding:8px 12px;border-radius:10px;border:1px solid rgba(245,158,11,0.3);background:rgba(255,255,255,0.07);color:#fff;font-size:14px;outline:none;margin-bottom:20px;">
        <div style="display:flex;gap:12px;justify-content:flex-end;">
          <button onclick="document.getElementById('fc-export-modal').remove()" style="padding:10px 20px;border-radius:10px;border:1px solid rgba(255,255,255,0.15);background:transparent;color:#aaa;cursor:pointer;font-size:14px;">Annuler</button>
          <button id="fc-export-confirm" style="padding:10px 24px;border-radius:10px;border:1px solid rgba(245,158,11,0.4);background:rgba(245,158,11,0.15);color:#f59e0b;font-weight:700;cursor:pointer;font-size:14px;">📥 Enregistrer</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    setTimeout(() => { const inp = document.getElementById('fc-export-titre'); if(inp){inp.focus();inp.select();} }, 50);

    document.getElementById('fc-export-confirm').addEventListener('click', async () => {
      const titre = (document.getElementById('fc-export-titre')?.value || 'FC-SansTitre').trim();
      const lecon = (document.getElementById('fc-export-lecon')?.value || '').trim();
      const auteur = (document.getElementById('fc-export-auteur')?.value || 'Bertane Hassan').trim();
      const matiere = (document.getElementById('fc-export-matiere')?.value || 'SVT').trim();
      modal.remove();

      // Sauvegarde interne (Mes Quiz)
      const quizToSave = { id: Date.now().toString(), title: `📇 ${titre}`, matiere, lecon, auteur, date: Date.now(), type: 'QR', questions: cards };
      try {
        await db.put('saved_quizzes', quizToSave);
        if(typeof renderQuizzes === 'function') renderQuizzes();
      } catch(e) { console.error(e); }

      // Génération JSON avec HMAC pour Flutter
      const quizData = { titre, matiere, lecon, auteur: auteur, type: 'QR', theme: '', level: '', questions: cards };
      const deepSortObj = (obj) => {
        if (Array.isArray(obj)) return obj.map(deepSortObj);
        if (obj && typeof obj === 'object') return Object.keys(obj).sort().reduce((acc, k) => { acc[k] = deepSortObj(obj[k]); return acc; }, {});
        return obj;
      };
      const sortedData = deepSortObj({...quizData});
      const qHash = (await sha256(JSON.stringify(sortedData))).substring(0, 16);
      const settingsStr = JSON.stringify({ e: 0, h: qHash, s: 0, t: 30 });
      const signature = await hmacSha256('QzPl@y3r_2026!sEcReT', settingsStr);
      quizData._qp = btoa(unescape(encodeURIComponent(`${settingsStr}|${signature}`)));

      // Téléchargement
      const finalJson = JSON.stringify(quizData, null, 2);
      const a = document.createElement('a');
      a.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(finalJson);
      a.download = `${titre.replace(/\s+/g,'_')}.json`;
      document.body.appendChild(a); a.click(); a.remove();

      toast(`FlashCards "${titre}" sauvegardées et téléchargées !`, 'success');
    });
  };

  document.body.appendChild(overlay);
  render();
  overlay.addEventListener('keydown', e => { if(e.key==='Escape') overlay.remove(); if(e.key==='ArrowRight') window.__fcNext(); if(e.key==='ArrowLeft') window.__fcPrev(); });
  overlay.setAttribute('tabindex', '0'); overlay.focus();
}

// ════════════════════════════════════════
// EVENTS
// ════════════════════════════════════════
function bindEvents() {

  // ══ EVENT DELEGATION (Centralized Click Handler) ══
  document.addEventListener('click', async e => {
    const actionEl = e.target.closest('[data-action]');
    if (!actionEl) return;
    
    const action = actionEl.dataset.action;
    const id = actionEl.dataset.id;

    if (action === "copy-msg") { copyMsg(id); }
    else if (action === "save-memo") { saveToMemory(id); }
    else if (action === "print") { window.print(); }
    else if (action === "export-word") { exportMessageToWord(id); }
    else if (action === "export-fc-json") { exportFcAsJson(id); }
    else if (action === "test-fc-player") { openFlashCardPlayer(id); }
    else if (action === "export-qp-modal") {
      const qpModal = document.getElementById('quiz-player-modal');
      if (qpModal) {
        document.getElementById('qp-msg-id').value = id;
        
        const msg = state.messages.find(m => (m.ts || '') == id);
        if (msg && msg.content) {
          const subject = extractSubjectFromContent(msg.content);
          document.getElementById('qp-titre').value = `QCM-${subject}`;
        }
        
        qpModal.classList.add('active');
      }
    }
    else if (action === "test-web-quiz") {
      openWebQuizPlayer(id);
    }
    else if (action === "rate") { rateMessage(parseInt(id), parseInt(actionEl.dataset.score)); }
    else if (action === "delete-memory") { memoryDelete(id); }
    else if (action === "load-chat") { loadArchiveChat(id); }
    else if (action === "delete-chat") { e.stopPropagation(); deleteArchiveChat(id); }
    else if (action === "toggle-fav") { e.stopPropagation(); toggleFav(id); }
    else if (action === "activate-agent") { activateAgent(id); }
    else if (action === "edit-agent") { e.stopPropagation(); openEditAgent(id); }
    else if (action === "duplicate-agent") { e.stopPropagation(); duplicateAgentById(id); }
    else if (action === "export-agent") { e.stopPropagation(); exportAgent(id); }
    else if (action === "delete-agent") { e.stopPropagation(); deleteAgent(id); }
    else if (action === "clear-file") { clearAttachedFile(); }
    else if (action === "edit-msg") { editMessage(id); }
    else if (action === "regen-msg") { regenerateMessage(id); }
    else if (action === "manage-lessons") { e.stopPropagation(); manageLessons(id); }
    // ─── WORKFLOW ACTIONS ───────────────────────────────────────────────
    else if (action === "edit-workflow") {
      e.stopPropagation();
      if (id) await openWorkflowForEdit(id);
    }
    else if (action === "activate-workflow") {
      e.stopPropagation();
      if (id) {
        const wf = await db.get('workflows', id);
        if (wf) {
          $("#agent-select").value = '__WF__' + id;
          if ($("#agent-select-mob")) $("#agent-select-mob").value = '__WF__' + id;
          state.selectedWorkflow = wf;
          toast('Chaîne "' + wf.name + '" activée', 'success');
          $("#workflow-modal").classList.remove('active');
        }
      }
    }
    else if (action === "delete-workflow") {
      e.stopPropagation();
      if (id) await deleteWorkflow(id);
    }
    else if (action === "wf-move-up") {
      const idx = parseInt(actionEl.dataset.idx);
      if (!isNaN(idx)) await wfMoveStep(idx, -1);
    }
    else if (action === "wf-move-down") {
      const idx = parseInt(actionEl.dataset.idx);
      if (!isNaN(idx)) await wfMoveStep(idx, 1);
    }
    else if (action === "wf-remove-step") {
      const idx = parseInt(actionEl.dataset.idx);
      if (!isNaN(idx)) await wfRemoveStep(idx);
    }
  });

  // Archives panel
  const archivesBtn = $("#archives-btn");
  const archivesPanel = $("#archives-panel");
  const openArchivesDesktop = $("#open-archives-desktop");
  const archivesMob = $("#archives-mob");

  const openArchivesPanel = () => {
    archivesPanel.style.display = "flex";
    archivesPanel.classList.add("active");
    if (window.innerWidth < 768) document.body.style.overflow = 'hidden';
    renderArchives();
  };

  // closeArchivesPanel is now defined globally (above loadArchiveChat)

  if (archivesBtn) {
    archivesBtn.onclick = e => {
      e.stopPropagation();
      openArchivesPanel();
    };
  }

  if (openArchivesDesktop) {
    openArchivesDesktop.onclick = openArchivesPanel;
  }

  if (archivesMob) {
    archivesMob.onclick = () => {
      closeBurger();
      openArchivesPanel();
    };
  }

  document.addEventListener('click', e => {
    if (archivesPanel.classList.contains("active") && !archivesPanel.contains(e.target) && e.target !== archivesBtn && e.target !== openArchivesDesktop) {
      closeArchivesPanel();
    }
  });

  if ($("#archives-new-btn")) {
    $("#archives-new-btn").onclick = e => { e.stopPropagation(); newChat(); closeArchivesPanel(); };
  }
  if ($("#archives-search-input")) {
    $("#archives-search-input").oninput = e => { archivesSearchQuery = e.target.value; renderArchives(); };
    $("#archives-search-input").onclick = e => e.stopPropagation();
  }

  // ─── QUIZZES PANEL ──────────────────────────────────────────────────
  const quizzesBtn = $("#quizzes-btn");
  const quizzesPanel = $("#quizzes-panel");
  let quizzesSearchQuery = "";

  window.openQuizzesPanel = () => {
    quizzesPanel.style.display = "flex";
    quizzesPanel.classList.add("active");
    if (window.innerWidth < 768) document.body.style.overflow = 'hidden';
    renderQuizzes();
  };

  window.closeQuizzesPanel = () => {
    quizzesPanel.classList.remove("active");
    quizzesPanel.style.display = "none";
    document.body.style.overflow = 'auto';
  };

  if (quizzesBtn) {
    quizzesBtn.onclick = e => {
      e.stopPropagation();
      if(window.openQuizzesPanel) window.openQuizzesPanel();
      closeArchivesPanel(); // Close other panels
      if(typeof closeMemoryPanel !== 'undefined') closeMemoryPanel();
    };
  }

  document.addEventListener('click', e => {
    if (quizzesPanel && quizzesPanel.classList.contains("active") && !quizzesPanel.contains(e.target) && e.target !== quizzesBtn) {
      closeQuizzesPanel();
    }
  });

  if ($("#quizzes-search-input")) {
    $("#quizzes-search-input").oninput = e => { quizzesSearchQuery = e.target.value; renderQuizzes(); };
    $("#quizzes-search-input").onclick = e => e.stopPropagation();
  }

  window.renderQuizzes = async function() {
    const list = $("#quizzes-list");
    if (!list) return;
    try {
      let quizzes = await db.getAll('saved_quizzes') || [];
      quizzes = quizzes.sort((a, b) => (b.date||0) - (a.date||0));
      if (quizzesSearchQuery) {
        const q = quizzesSearchQuery.toLowerCase();
        quizzes = quizzes.filter(c => (c.title||"").toLowerCase().includes(q));
      }
      if (!quizzes.length) {
        list.innerHTML = '<div class="archive-empty">Aucun quiz trouvé</div>';
        return;
      }
      list.innerHTML = quizzes.map(q => {
        const isFcType = q.type === 'QR';
        const icon = isFcType ? '📇' : '📝';
        const badge = isFcType ? '<span style="font-size:9px;background:rgba(245,158,11,0.2);color:#f59e0b;border:1px solid rgba(245,158,11,0.4);border-radius:4px;padding:1px 5px;margin-left:6px;">FlashCards</span>' : '';
        const playLabel = isFcType ? '📇 Lire' : '▶️ Jouer';
        const shareBtn = !isFcType ? `<button class="text-xs bg-blue-500/20 text-blue-500 px-2 py-1 rounded hover:bg-blue-500/40 transition-colors" onclick="event.stopPropagation(); doShareQuiz('${q.id}')">🔗 Partager</button>` : '';
        return `
        <div class="archive-item flex flex-col gap-1 p-2 rounded hover:bg-white/5 cursor-pointer transition-colors border-l-2 border-transparent hover:border-yellow-500" onclick="loadSavedQuiz('${q.id}')">
          <div class="font-bold text-yellow-500 truncate">${icon} ${escapeHtml(q.title || 'Quiz')}${badge}</div>
          <div class="flex justify-between items-center text-xs opacity-70">
            <span>${new Date(q.date).toLocaleString()}</span>
            <span>${q.questions ? q.questions.length : 0} ${isFcType ? 'cartes' : 'Q'}</span>
          </div>
          <div class="flex justify-end gap-2 mt-1">
             <button class="text-xs bg-error/20 text-error px-2 py-1 rounded hover:bg-error/40 transition-colors" onclick="event.stopPropagation(); deleteSavedQuiz('${q.id}')">🗑️ Supprimer</button>
             ${shareBtn}
             <button class="text-xs bg-yellow-500/20 text-yellow-500 px-2 py-1 rounded hover:bg-yellow-500/40 transition-colors" onclick="event.stopPropagation(); loadSavedQuiz('${q.id}')">${playLabel}</button>
          </div>
        </div>`;
      }).join('');
    } catch(e) { console.error("Erreur renderQuizzes:", e); }
  };

  window.saveCurrentQuiz = function() {
    console.log("saveCurrentQuiz() appelée !");
    const btn = document.getElementById('wq-score-save');
    if (btn) btn.innerText = "⏳ Préparation...";

    if (!wqState || !wqState.questions || wqState.questions.length === 0) {
      toast("Aucun quiz actif à sauvegarder.", "error");
      if (btn) btn.innerText = "Sauvegarder ce Quiz";
      return;
    }

    const existingModal = document.getElementById('quiz-save-modal');
    if (existingModal) existingModal.remove();

    const defaultTitle = "Quiz du " + new Date().toLocaleDateString();

    const modal = document.createElement('div');
    modal.id = 'quiz-save-modal';
    modal.style.cssText = `
      position:fixed; inset:0; z-index:99999;
      background:rgba(0,0,0,0.7); backdrop-filter:blur(8px);
      display:flex; align-items:center; justify-content:center;
    `;
    modal.innerHTML = `
      <div style="
        background:linear-gradient(135deg,#1a1a2e,#16213e);
        border:1px solid rgba(0,229,255,0.3);
        border-radius:20px; padding:32px; width:440px;
        box-shadow:0 20px 60px rgba(0,0,0,0.5);
      ">
        <h3 style="color:var(--cyan,#00e5ff); margin:0 0 8px 0; font-size:20px;">💾 Sauvegarder ce Quiz</h3>
        <p style="color:#aaa; font-size:13px; margin:0 0 20px 0;">Complétez les métadonnées de votre quiz avant de l'enregistrer.</p>

        <label style="color:#ddd; font-size:14px; font-weight:600; display:block; margin-bottom:6px;">Nom du quiz</label>
        <input id="quiz-save-name" type="text" value="${defaultTitle}"
          style="width:100%; box-sizing:border-box; padding:10px 14px; border-radius:10px;
                 border:1px solid rgba(0,229,255,0.3); background:rgba(255,255,255,0.07);
                 color:#fff; font-size:14px; outline:none; margin-bottom:14px;">

        <label style="color:#ddd; font-size:14px; font-weight:600; display:block; margin-bottom:6px;">Matière</label>
        <input id="quiz-save-matiere" type="text" value="SVT"
          style="width:100%; box-sizing:border-box; padding:10px 14px; border-radius:10px;
                 border:1px solid rgba(0,229,255,0.3); background:rgba(255,255,255,0.07);
                 color:#fff; font-size:14px; outline:none; margin-bottom:14px;">

        <label style="color:#ddd; font-size:14px; font-weight:600; display:block; margin-bottom:6px;">Leçon / Chapitre</label>
        <input id="quiz-save-lecon" type="text" placeholder="ex: Chapitre 1"
          style="width:100%; box-sizing:border-box; padding:10px 14px; border-radius:10px;
                 border:1px solid rgba(0,229,255,0.3); background:rgba(255,255,255,0.07);
                 color:#fff; font-size:14px; outline:none; margin-bottom:14px;">

        <label style="color:#ddd; font-size:14px; font-weight:600; display:block; margin-bottom:6px;">Auteur du quiz</label>
        <input id="quiz-save-auteur" type="text" value="Bertane Hassan"
          style="width:100%; box-sizing:border-box; padding:10px 14px; border-radius:10px;
                 border:1px solid rgba(0,229,255,0.3); background:rgba(255,255,255,0.07);
                 color:#fff; font-size:14px; outline:none; margin-bottom:20px;">

        <div style="display:flex; gap:12px; justify-content:flex-end;">
          <button onclick="document.getElementById('quiz-save-modal').remove()"
            style="padding:10px 20px; border-radius:10px; border:1px solid rgba(255,255,255,0.15);
                   background:transparent; color:#aaa; cursor:pointer; font-size:14px;">
            Annuler
          </button>
          <button id="quiz-save-confirm"
            style="padding:10px 24px; border-radius:10px; border:1px solid rgba(0,229,255,0.4);
                   background:rgba(0,229,255,0.15); color:#00e5ff; font-weight:700; cursor:pointer; font-size:14px;">
            📥 Enregistrer
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    setTimeout(() => {
      const inp = document.getElementById('quiz-save-name');
      if (inp) { inp.focus(); inp.select(); }
    }, 50);

    document.getElementById('quiz-save-confirm').addEventListener('click', async () => {
      const titleInput = document.getElementById('quiz-save-name');
      const title = (titleInput?.value || defaultTitle).trim() || defaultTitle;
      const lecon = (document.getElementById('quiz-save-lecon')?.value || '').trim();
      const auteur = (document.getElementById('quiz-save-auteur')?.value || 'Bertane Hassan').trim();
      const matiere = (document.getElementById('quiz-save-matiere')?.value || 'SVT').trim();
      modal.remove();

      const safeTitle = title.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'quiz';
      const fileName = `quiz_${safeTitle}.json`;
      const questionsCopy = JSON.parse(JSON.stringify(wqState.questions));

      // 1. Sauvegarde interne dans Mes Quiz
      const quizToSave = {
        id: Date.now().toString(),
        title: title,
        matiere: matiere,
        lecon: lecon,
        auteur: auteur,
        date: Date.now(),
        type: 'QCM',
        questions: questionsCopy
      };

      // 2. Export JSON compatible Flutter (avec _qp)
      const quizData = {
        titre: title,
        matiere: matiere,
        lecon: lecon,
        auteur: auteur,
        type: 'QCM',
        questions: questionsCopy
      };

      const deepSortObj = (obj) => {
        if (Array.isArray(obj)) return obj.map(deepSortObj);
        if (obj && typeof obj === 'object') return Object.keys(obj).sort().reduce((acc, k) => { acc[k] = deepSortObj(obj[k]); return acc; }, {});
        return obj;
      };
      
      try {
        const sortedData = deepSortObj({...quizData});
        const qHash = (await sha256(JSON.stringify(sortedData))).substring(0, 16);
        const isEval = wqState.mode === 'evaluation';
        const timeLimit = wqState.secondsPerQuestion || 30;
        const settingsStr = JSON.stringify({ e: isEval ? 1 : 0, h: qHash, s: isEval ? 1 : 0, t: timeLimit });
        const signature = await hmacSha256('QzPl@y3r_2026!sEcReT', settingsStr);
        quizData._qp = btoa(unescape(encodeURIComponent(`${settingsStr}|${signature}`)));

        const fileContent = JSON.stringify(quizData, null, 2);
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(fileContent);
        const a = document.createElement('a');
        a.href = dataStr;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();

        await db.put('saved_quizzes', quizToSave);
        if(typeof renderQuizzes === 'function') renderQuizzes();
        
        const btn = document.getElementById('wq-score-save');
        if(btn) { btn.innerText = '✅ Sauvegardé'; btn.disabled = true; }
        toast(`Quiz "${title}" téléchargé et sauvegardé !`, "success");
      } catch(e) {
        console.error("Erreur sauvegarde interne:", e);
        toast("Erreur lors de la sauvegarde.", "error");
      }
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });
  };

  window.loadSavedQuiz = async function(id) {
    try {
      const q = await db.get('saved_quizzes', id);
      if (!q || !q.questions) { toast("Quiz introuvable", "error"); return; }
      closeQuizzesPanel();

      // Si c'est un quiz de type FlashCards (QR), ouvrir le lecteur FC
      if (q.type === 'QR') {
        _showFlashCardPlayer(q.questions, q);
        return;
      }

      const questionsToLoad = q.questions;
      // Demander le mode avant de lancer
      askQuizMode((mode) => {
        startWebQuizFromData(questionsToLoad, mode);
      });
    } catch(e) {
      console.error(e);
      toast("Erreur lors du chargement.", "error");
    }
  };

  window.deleteSavedQuiz = async function(id) {
    if (!confirm("Supprimer ce quiz définitivement ?")) return;
    try {
      await db.delete('saved_quizzes', id);
      renderQuizzes();
      toast("Quiz supprimé", "success");
    } catch(e) {
      console.error(e);
    }
  };

  // ─── PROFILE PANEL ──────────────────────────────────────────────────
  if ($("#delete-api-key")) {
    $("#delete-api-key").onclick = () => {
      if (!confirm("Supprimer vos clés API sauvegardées ?")) return;
      deleteCookie("mistral_api_key");
      deleteCookie("gemini_api_key");
      state.apiKey = null;
      state.geminiApiKey = null;
      $("#api-key-input").value = "";
      if ($("#gemini-api-key-input")) $("#gemini-api-key-input").value = "";
      $("#api-status").innerHTML = "HORS LIGNE";
      $("#api-status").className = "status-pill";
      if ($("#api-status-mob")) { $("#api-status-mob").innerHTML = "HORS LIGNE"; $("#api-status-mob").className = "status-pill"; }
      closeApiModal();
      toast("Clés supprimées", "info");
    };
  }

  const profileBtn = $("#profile-btn");
  const profilePanel = $("#profile-panel");
  
  window.openProfilePanel = () => {
    if(profilePanel) {
      profilePanel.style.display = 'flex';
      if (window.innerWidth < 768) document.body.style.overflow = 'hidden';
    }
  };
  window.closeProfilePanel = () => {
    if(profilePanel) {
      profilePanel.style.display = 'none';
      document.body.style.overflow = 'auto';
    }
  };

  if (profileBtn) {
    profileBtn.onclick = e => {
      e.stopPropagation();
      openProfilePanel();
      closeArchivesPanel(); 
      if(typeof closeQuizzesPanel !== 'undefined') closeQuizzesPanel();
      if(typeof closeMemoryPanel !== 'undefined') closeMemoryPanel();
    };
  }

  // Auth Status update
  let currentUser = null;
  onAuthChange(async (user) => {
    currentUser = user;
    const authStatus = $("#auth-status");
    const scoresContainer = $("#user-scores-container");
    const scoresList = $("#user-scores-list");
    if(!authStatus) return;

    if (user) {
      authStatus.innerHTML = `
        <div class="flex items-center justify-center gap-3 mb-2">
           <img src="${escapeHtml(user.photoURL || '')}" class="w-10 h-10 rounded-full border-2 border-green-500">
           <div class="text-left">
             <div class="font-bold text-green-500">${escapeHtml(user.displayName || '')}</div>
             <div class="text-xs text-gray-400">${escapeHtml(user.email || '')}</div>
           </div>
        </div>
        <button id="logout-btn" class="mt-2 bg-white/10 hover:bg-white/20 px-4 py-1 rounded text-white text-xs">Se déconnecter</button>
      `;
      document.getElementById('logout-btn').onclick = logout;
      
      // Load scores
      if(scoresContainer && scoresList) {
        scoresContainer.style.display = 'flex';
        scoresList.innerHTML = '<div class="text-center opacity-50">Chargement des scores...</div>';
        const scores = await getUserScores();
        if(scores.length > 0) {
          scoresList.innerHTML = scores.map(s => `
            <div class="bg-white/5 p-2 rounded flex justify-between items-center">
              <div class="truncate max-w-[150px]" title="${escapeHtml(s.quizTitle)}">${escapeHtml(s.quizTitle)}</div>
              <div class="font-bold ${s.score >= s.maxScore/2 ? 'text-green-500' : 'text-orange-500'}">${s.score}/${s.maxScore}</div>
            </div>
          `).join('');
        } else {
          scoresList.innerHTML = '<div class="text-center opacity-50">Aucun score enregistré.</div>';
        }
      }
    } else {
      authStatus.innerHTML = `
        <div class="mb-3">Connectez-vous pour sauvegarder vos scores et partager vos quiz.</div>
        <button id="login-btn" class="bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-4 rounded w-full flex justify-center items-center gap-2">
          <span class="material-symbols-outlined">login</span> Connexion Google
        </button>
      `;
      document.getElementById('login-btn').onclick = loginWithGoogle;
      if(scoresContainer) scoresContainer.style.display = 'none';
    }
  });

  window.doShareQuiz = async function(quizId) {
    if(!currentUser) {
      toast("Veuillez vous connecter dans 'Mon Profil' pour partager un quiz.", "error");
      openProfilePanel();
      return;
    }
    try {
      const q = await db.get('saved_quizzes', quizId);
      if (!q) return;
      toast("Création du lien...", "info");
      const sharedId = await shareQuiz(q);
      const shareUrl = window.location.origin + window.location.pathname + '?sharedQuiz=' + sharedId;
      navigator.clipboard.writeText(shareUrl);
      toast("Lien copié dans le presse-papier !", "success");
    } catch(e) {
      toast("Erreur de partage (Backend non configuré)", "error");
    }
  };

  // ── Référentiel compétences par discipline ──────────────────────────────
  const CORRECTION_COMPETENCES = {
    "SVT":             "Décrire et analyser des données scientifiques, Déduire et interpréter, Réaliser un schéma fonctionnel, Raisonner en mobilisant les connaissances, Proposer et formuler des hypothèses",
    "Physique-Chimie": "Analyser des données expérimentales, Modéliser une situation physique, Calculer et appliquer des formules, Raisonner et argumenter, Réaliser et exploiter un graphe",
    "Maths":           "Modéliser et traduire en équation, Calculer et appliquer, Raisonner et démontrer, Représenter graphiquement, Communiquer une démarche",
    "Informatique":    "Analyser un problème algorithmique, Concevoir et implémenter un algorithme, Tester et déboguer, Modéliser des données, Raisonner sur la complexité",
    "Français":        "Comprendre et analyser un texte, Identifier les procédés littéraires, Rédiger avec cohérence et style, Argumenter et défendre un point de vue, Maîtriser l'orthographe et la grammaire",
    "Anglais":         "Compréhension écrite (Reading), Expression écrite (Writing), Maîtrise grammaticale, Richesse du vocabulaire, Cohérence et cohésion du discours",
    "Arabe":           "فهم النص وتحليله, استخلاص الأفكار الرئيسية, التعبير الكتابي السليم, توظيف الرصيد اللغوي, قواعد اللغة والنحو",
    "Espagnol":        "Comprensión lectora, Expresión escrita, Gramática y conjugación, Vocabulario y léxico, Coherencia del discurso",
    "Philosophie":     "Analyser et problématiser une notion, Construire une argumentation logique, Mobiliser des références philosophiques, Rédiger avec rigueur et clarté, Prendre du recul et nuancer",
    "Histoire-Géo":    "Contextualiser dans le temps et l'espace, Analyser et critiquer des documents, Rédiger un développement structuré, Utiliser le vocabulaire géo-historique, Argumenter et mettre en relation",
    "Économie":        "Analyser un document économique, Mobiliser des notions et mécanismes, Argumenter et nuancer, Rédiger une réponse construite, Lire et interpréter des données statistiques",
    "Géographie":      "Localiser et situer dans l'espace, Analyser des cartes et documents, Identifier les acteurs et enjeux, Réaliser un croquis ou schéma, Rédiger une réponse géographique",
    "EPS":             "Réaliser et maîtriser des actions motrices, Méthode et organisation de l'effort, Observer et analyser une performance, Respecter les règles et l'éthique sportive, Gérer sa sécurité et celle d'autrui",
    "Arts":            "Observer et analyser une œuvre artistique, Pratiquer des techniques plastiques ou musicales, Développer sa sensibilité et son regard critique, Situer l'œuvre dans son contexte historique et culturel, Communiquer et justifier ses choix créatifs",
    "Autre":           "Analyser et comprendre, Restituer les connaissances, Argumenter et justifier, Communiquer avec clarté, Faire preuve de rigueur méthodologique"
  };

  // ── Prompt système expert ─────────────────────────────────────────────
  const SVT_SYSTEM_PROMPT = `<system_instructions>

  <role>
    Tu es un expert en didactique des Sciences de la Vie et de la Terre (SVT) et un concepteur pédagogique chevronné. Ton rôle est de générer une fiche de correction détaillée pour un contrôle de SVT en t'appuyant STRICTEMENT sur le cadre de référence pédagogique marocain fourni.
    Tu dois analyser le sujet fourni pour déduire automatiquement le thème principal, le chapitre concerné et les connaissances scientifiques en jeu.
  </role>

  <contexte_imperatif>
    - Niveau Scolaire : 2ème année du baccalauréat, filière Sciences Physiques (SP), option internationale (enseignement en français).
    - Public Cible : Élèves marocains avec un niveau de français B2, pour qui le français reste une langue seconde. La clarté et la simplicité du vocabulaire sont primordiales.
    - Approche Pédagogique : Approche par compétences et par investigation scientifique. La correction doit mettre en évidence le raisonnement attendu, pas seulement le résultat final.
    - Contraintes Matérielles : La correction doit être exploitable avec des ressources simples (tableau blanc, vidéoprojecteur).
  </contexte_imperatif>

  <referentiel_pedagogique>
    Le référentiel officiel marocain définit les compétences et habilités à évaluer. Tu DOIS utiliser la terminologie exacte de ce référentiel pour remplir la colonne "Compétence évaluée".

    ### A. Compétences et Habilités Visées
    - Déterminer et formuler un problème scientifique.
    - Utiliser des connaissances, sélectionner et organiser des informations.
    - Relier les informations avec les acquis pour résoudre le problème.
    - Proposer et formuler une ou des hypothèses.
    - Mobiliser des informations pour résoudre le problème scientifique.
    - Proposer les outils adéquats pour vérifier l'hypothèse.
    - Décrire et analyser des données scientifiques.
    - Comparer et expliquer/interpréter des résultats.
    - Déduire et généraliser.
    - Utiliser des principes, des lois, des modèles pour expliquer/interpréter.
    - Réaliser une synthèse (texte ou schéma).
    - Exprimer une opinion et l'argumenter.
    - Représenter par un schéma.
    - Traduire des données (tableau, graphique, texte).
    - Réaliser un schéma fonctionnel ou de synthèse.

    ### B. Objectifs Méthodologiques
    - Décrire et interpréter des documents scientifiques (graphiques, tableaux, schémas, textes).
    - Extraire les informations pertinentes d'un document.
    - Formuler, valider ou invalider une hypothèse.
    - Réaliser des schémas annotés.
    - Calculer un rendement énergétique.
    - Communiquer des résultats de manière claire et précise.
    - Rédiger des conclusions synthétiques.
    - Utiliser un vocabulaire scientifique approprié.
  </referentiel_pedagogique>

  <co_star>
    <context>
      L'utilisateur est un enseignant de SVT au lycée marocain. Il te fournit un sujet d'évaluation pour une classe de 2ème année Bac SP. Ta mission est de produire une fiche de correction opérationnelle qui suit la démarche d'investigation scientifique et le référentiel pédagogique marocain.
    </context>

    <objective>
      Générer une fiche de correction composée de deux parties :
      1. Le tableau de correction à 4 colonnes : (Numéro de la question | Réponse attendue rédigée et explicitée | Critères d'évaluation + barème détaillé | Compétence évaluée)
      2. Les conseils pour l'Enseignant (points de vigilance, stratégie de correction interactive).
      L'objectif est de fournir un outil "prêt à projeter" ou "prêt à imprimer" pour la classe.
    </objective>

    <style>
      - Réponse attendue : Rédige en français simple (niveau B2). Explique le cheminement intellectuel étape par étape : "D'après le document 1, on observe que...", "En combinant cette information avec nos connaissances sur...", "On en déduit donc que...". La démarche est plus importante que la réponse brute.
      - Critères d'évaluation + barème : Décompose le barème total de la question en points attribués pour chaque étape du raisonnement. Exemple : "Identification correcte de la courbe (0.25 pt) / Extraction de la valeur (0.25 pt) / Formulation d'une phrase d'analyse correcte (0.5 pt) / Conclusion valide (0.5 pt)".
      - Compétence évaluée : Choisis l'intitulé le plus pertinent parmi la liste du Référentiel Pédagogique. Tu peux combiner deux compétences si nécessaire (ex: "Analyser un graphique et déduire").
      - Intégration des schémas-blocs fonctionnels en ASCII : Lorsque le sujet demande de réaliser ou légender un schéma, produis une représentation en art ASCII compact (max 5 lignes) avec des flèches (-->, =>), des barres (|) et des encadrés ([Nom du bloc]).
    </style>

    <tone>
      Professionnel, pédagogique, adapté au contexte marocain. Vocabulaire scientifique rigoureux mais accessible (B2).
    </tone>

    <audience>
      - Principal : L'enseignant de SVT (pour corriger et préparer sa séance).
      - Secondaire : Les élèves de 2e Bac SP (quand la fiche est projetée). D'où l'importance de la clarté et des schémas-blocs fonctionnels.
    </audience>

    <response_format>
      Le format exact de la sortie est défini par l'utilisateur. Si le format tableau est demandé, tu DOIS générer un tableau Markdown strict à 4 colonnes, suivi des conseils.

      STRUCTURE ATTENDUE :

      ### Fiche de Correction — SVT · 2e Bac SP

      | Numéro de la question | Réponse attendue rédigée et explicitée | Critères d'évaluation + barème détaillé | Compétence évaluée |
      |---|---|---|---|
      | **1** | **Démarche :** D'après le document 1, on observe que...<br>**Analyse :** On peut donc en déduire que...<br>**Conclusion :** ... | **Observation (0.5 pt)**<br>**Analyse (1 pt)**<br>**Conclusion (0.5 pt)**<br>**Total : 2 pts** | Décrire et analyser des données scientifiques / Déduire et généraliser |

      ### Conseils pour l'Enseignant

      **1. Points de vigilance :**
      - Erreurs classiques attendues des élèves sur ce sujet...

      **2. Stratégie de correction interactive :**
      - Pour la question X, projeter le graphique et demander à un élève de venir tracer la tendance...
      
      À la toute fin de ta réponse, tu DOIS obligatoirement ajouter une ligne sous ce format pour donner un titre court et représentatif au sujet (ce titre servira de nom de fichier) :
      [TITRE_SVT: Nom court du thème déduit]
    </response_format>
  </co_star>

  <chain_of_thought>
    Dans ta balise <brouillon_invisible>, suis scrupuleusement ces étapes :
    1. Analyse du sujet SVT : Identifie les questions, déduis automatiquement le chapitre/thème abordé et les connaissances scientifiques mobilisées, et analyse les documents (graphiques, tableaux, schémas).
    2. Identification des compétences du référentiel marocain : Pour chaque question, associe la ou les compétences pertinentes de la liste officielle.
    3. Rédaction de la réponse niveau bon élève (B2) : Démarche d'investigation claire, étape par étape.
    4. Application du barème : Si fourni, colle-toi à chaque sous-point. Si absent, structure des espaces [À définir].
    5. Conseils pour l'enseignant : Identifie les 2-3 erreurs classiques et propose une stratégie de correction interactive.
  </chain_of_thought>

  <gardes_fous>
    <contraintes_negatives>
      - NE PAS inventer de barème : Utilise [Barème à définir] si non fourni.
      - NE PAS faire de hors-sujet sur le format de sortie.
      - NE PAS ignorer le référentiel marocain : La colonne compétence DOIT utiliser la terminologie officielle fournie.
      - NE PAS dépasser le niveau B2 dans la formulation des réponses attendues.
    </contraintes_negatives>

    <grounding>
      - Strict : Utilise uniquement les informations du sujet et du barème fournis.
      - N'utilise PAS de balises LaTeX ($...) pour les variables ou les gènes, écris-les normalement en texte brut.
    </grounding>
  </gardes_fous>

</system_instructions>`;

  const CORRECTION_SYSTEM_PROMPT = `<system_instructions>

  <role>
    Tu es un expert en didactique et en évaluation scolaire, polyvalent sur toutes les disciplines (scientifiques, littéraires, linguistiques). Tu maîtrises l'art de transformer un sujet d'examen brut en une fiche de correction opérationnelle, claire, concise et visuelle, parfaitement adaptée aux besoins explicites de l'enseignant.
  </role>

  <co_star>
    <context>
      L'utilisateur est un enseignant. Il te fournit un sujet d'évaluation, ainsi que des indications sur le barème, les compétences et le format souhaité. Ton travail est de produire la correction la plus fidèle possible à ses attentes, en ne faisant aucune supposition sur les points qu'il n'a pas précisés. Tu dois systématiquement signaler les zones d'ombre.
    </context>

    <objective>
      Générer une fiche de correction composée de deux parties :
      1. Le tableau ou la grille de correction : détaillant pour chaque question la réponse attendue, le barème (strictement celui fourni) et la compétence évaluée.
      2. Les conseils pédagogiques pour l'enseignant (points de vigilance, stratégie interactive, approfondissement).
      L'objectif est de fournir un outil "prêt à imprimer" ou "prêt à projeter".
    </objective>

    <style>
      - Concis et précis : La réponse attendue doit être celle d'un très bon élève du niveau visé. Phrases courtes, vocabulaire exact, structuration logique (étapes numérotées).
      - Intégration des schémas-blocs fonctionnels en ASCII (NOUVEAU) : Lorsque le sujet demande de réaliser, compléter ou légender un schéma, tu dois produire une représentation en art ASCII. Privilégie impérativement des schémas-blocs fonctionnels compacts (2 à 5 lignes maximum) utilisant des flèches (-->, =>), des barres (|), des signes + et des encadrés textuels ([Nom du bloc]). Les schémas doivent représenter des flux, des chaînes de réactions, des relations logiques ou des étapes. Évite les dessins ASCII trop encombrants (plus de 5 lignes) qui nuisent à la lisibilité de la fiche. Ajoute toujours une légende textuelle en dessous du schéma pour expliciter chaque symbole.
      - Structuration en puces ou numérotations pour faciliter la lecture et la notation.
    </style>

    <tone>
      Professionnel, neutre et pédagogique. Pas de jargon infantilisant, mais pas de complexité gratuite.
    </tone>

    <audience>
      - Principal : L'enseignant (pour corriger et préparer sa séance).
      - Secondaire : Les élèves (quand la fiche est projetée). D'où l'importance des schémas-blocs fonctionnels, immédiatement lisibles.
    </audience>

    <response_format>
      Le format exact de la sortie est défini par l'utilisateur dans la variable [format_sortie_souhaite]. Si l'utilisateur demande le tableau par défaut, tu DOIS générer un tableau Markdown strict à 4 colonnes, suivi des conseils.
      
      EXEMPLE DE STRUCTURE ATTENDUE :
      
      ### Fiche de Correction
      
      | Numéro de la question | Réponse attendue rédigée et explicitée | Critères d'évaluation + barème détaillé | Compétence évaluée |
      |---|---|---|---|
      | **1** | **Description :** L'analyse...<br>- Point 1...<br>- Point 2... | **Description (1 pt) :**<br>- Critère A (0,5 pt)<br>- Critère B (0,5 pt)<br>**Total : 1 pt** | Décrire et analyser des données scientifiques et Déduire. |
      | **2** | ... | ... | ... |
      
      ### Conseils pour l'Enseignant
      
      **1. Points de vigilance :**
      - Question 1 : Les élèves confondent souvent...
      
      **2. Stratégie de correction interactive :**
      - Pour la question X, la correction peut être très dynamique...
      
      **3. Approfondissement (pour les élèves avancés) :**
      - Après avoir corrigé l'ensemble...
    </response_format>
  </co_star>

  <chain_of_thought>
    Dans ta balise <brouillon_invisible>, suis scrupuleusement ces étapes :
    1. Analyse du sujet : Identifie les questions. Repère celles qui impliquent un schéma, un graphique ou une légende.
    2. Recensement des données fournies : Vérifie le barème, les critères, le cadre. Note les manquants.
    3. Rédaction de la réponse (niveau bon élève) : Rédige de manière concise. Si schéma, conçois-le en ASCII sous forme de schéma-bloc fonctionnel (max 5 lignes).
    4. Application du barème : Si fourni, colle-toi à chaque sous-point. Si absent, structure des espaces vides avec [À définir].
    5. Sélection des compétences : Choisis dans la liste fournie. Si absente, propose des intitulés génériques mais signale-le.
    6. Élaboration du guide de levée d'ambiguïté : Prépare la section obligatoire listant les hypothèses et les manques.
  </chain_of_thought>

  <gardes_fous>
    <contraintes_negatives>
      - NE PAS inventer de barème : Utilise [Barème à définir] si non fourni.
      - NE PAS faire de hors-sujet sur le format de sortie.
      - NE PAS être trop long : Une réponse (hors schéma-bloc) ne doit pas dépasser 10 lignes.
      - NE PAS utiliser d'images, d'emojis ou d'ASCII complexes de plus de 5 lignes : seul le schéma-bloc fonctionnel est autorisé.
    </contraintes_negatives>

    <grounding>
      - Strict : Utilise uniquement les informations du sujet et du barème fournis.
      - Si un document est manquant, dis-le.
      - Scientific_formatting_directives :
        1. RÈGLE DES DÉLIMITEURS : Encadre CHAQUE variable, chiffre avec unité ou formule par des dollars simples $ ... $. Texte français à l'extérieur. Exemple : "La quantité d'ADN passe de $q$ à $2q$."
        2. SYMBOLES : INTERDICTION des symboles Unicode (→, ⇌, ×, ≤, ≥, ∈, ∞, ², ₃, ⁺). Utilise LaTeX : \\rightarrow, \\rightleftharpoons, \\times, \\leq, \\geq, \\in, \\infty
        3. CHIMIE : Regroupe la molécule entière dans un seul bloc $. Exemple : $C_{6}H_{12}O_{6}$. Utilise TOUJOURS les accolades pour les indices/exposants : $H_{3}O^{+}$.
        4. UNITÉS : Utilise le tilde ~ pour l'espace insécable : $0{,}25~mol \\cdot L^{-1}$ ou $10~nm$.
        5. PONCTUATION : Points et virgules de fin de phrase en DEHORS des délimiteurs $.
        6. Symboles Unicode : Remplacer systématiquement →, ⇌, ×, ≤, ≥, ∈, ∞, ², ₃, ⁺ par leurs équivalents LaTeX : \\rightarrow, \\rightleftharpoons, \\times, \\leq, \\geq, \\in, \\infty, ^{2}, _{3}, ^{+}.
    </grounding>

    <guide_ambiguite_obligatoire>
      À la fin de ta réponse, avant les conseils, insère la section ambiguites_et_verifications listant :
      - Ce que tu as supposé.
      - Ce qui est manquant et nécessite une action de l'enseignant.
      - Une invitation explicite à modifier la fiche si les attentes diffèrent.
    </guide_ambiguite_obligatoire>
  </gardes_fous>

</system_instructions>`;

  // ── Assemblage du prompt utilisateur dynamique ─────────────────────────
  const buildCorrectionUserPrompt = (cfg) => {
    const langInstruction = getOutputLanguageInstruction(cfg.outputLanguage || 'fr');
    return `<user_prompt>
${langInstruction ? langInstruction + '\n---\n' : ''}
  <checklist_prealable>
    - [x] Sujet fourni : OUI
    - [${cfg.bareme ? 'x' : ' '}] Barème : ${cfg.bareme ? 'FOURNI' : 'NON FOURNI — à définir'}
    - [${cfg.competences ? 'x' : ' '}] Compétences : ${cfg.competences ? 'FOURNIES' : 'Propositions génériques utilisées'}
    - [x] Format de sortie : ${cfg.format || 'Tableau classique + Conseils (défaut)'}
  </checklist_prealable>

  <sujet_complet>
    ${cfg.sujet}
  </sujet_complet>

  <contexte_imperatif>
    - Discipline : ${cfg.discipline}
    - Niveau Scolaire : ${cfg.niveau}
    - Filière : ${cfg.filiere}
    - Option (Langue) : ${cfg.option}
    - Type d'évaluation : ${cfg.typeEval}
    ${cfg.niveauLangue ? `- Niveau de langue attendu : ${cfg.niveauLangue}` : ''}
    - Langue de sortie : ${cfg.outputLanguage === 'ar' ? 'العربية' : cfg.outputLanguage === 'en' ? 'English' : 'Français'}
  </contexte_imperatif>

  <format_sortie_souhaite>
    ${cfg.format || 'Tableau classique à 4 colonnes (Numéro, Réponse attendue, Critères+Barème, Compétence) + Conseils pédagogiques'}
  </format_sortie_souhaite>

  <bareme_detaille>
    ${cfg.bareme || '[Non fourni — créer des espaces [Barème à définir] pour chaque question]'}
  </bareme_detaille>

  <criteres_evaluation_personnalises>
    ${cfg.criteres || '[Aucun critère personnalisé spécifié — utiliser des critères génériques]'}
  </criteres_evaluation_personnalises>

  <cadre_reference>
    ${cfg.competences || '[Non fourni — proposer des compétences génériques adaptées à la discipline]'}
  </cadre_reference>

  <consignes_supplementaires>
    ${cfg.consignes || '[Aucune consigne supplémentaire]'}
  </consignes_supplementaires>

  <exemples_correction>
    ${cfg.exemple || '[Aucun exemple modèle fourni]'}
  </exemples_correction>

  <instruction>
    Applique rigoureusement les System Instructions.
    Génère la fiche complète au format demandé.
    ${cfg.exportWord ? "À la toute fin de ta réponse, ajoute le marqueur [EXPORT_WORD] sur une ligne seule." : ''}
    ${cfg.exportHtml ? "À la toute fin de ta réponse, ajoute le marqueur [EXPORT_HTML] sur une ligne seule." : ''}
    ${cfg.exportPdf ? "À la toute fin de ta réponse, ajoute le marqueur [EXPORT_PDF] sur une ligne seule." : ''}
  </instruction>

</user_prompt>`;
  };


  // ── Stockage temporaire du Fichier chargé (PDF/Image) pour Gemini Vision ──
  let _corrPdfName   = '';     // nom du fichier
  let _corrPdfBase64 = null;   // Fichier brut en base64 pour Gemini Vision
  let _corrPdfMime   = '';     // MimeType du fichier

  // ── Stockage temporaire du Cadre de Référence importé ──
  let _corrRefName   = '';     // nom du fichier cadre de référence
  let _corrRefText   = '';     // texte extrait du cadre de référence (TXT/MD)
  let _corrRefBase64 = null;   // base64 du PDF cadre de référence pour Gemini Vision
  let _corrRefMime   = '';     // MimeType du cadre de référence PDF

  // ── Stockage temporaire de l'Exemple Modèle ──
  let _corrExempleName   = '';
  let _corrExempleText   = '';
  let _corrExempleBase64 = null;
  let _corrExempleMime   = '';

  const saveCorrectionConfigData = async () => {
    const name = prompt("Entrez un nom pour cette sauvegarde (ex: 1Bac SVT - Respiration) :");
    if (!name || !name.trim()) return;
    try {
      const get = (id) => ($(`#${id}`)?.value || '');
      const configToSave = {
        name: name.trim(),
        discipline: get('corr-discipline'),
        customDiscipline: get('corr-custom-discipline'),
        niveau: get('corr-niveau'),
        filiere: get('corr-filiere'),
        option: get('corr-option'),
        typeEval: get('corr-type-eval'),
        niveauLangue: get('corr-niveau-langue'),
        outputLanguage: get('corr-output-lang'),
        sujet: get('corr-sujet'),
        format: get('corr-format'),
        competences: get('corr-competences'),
        bareme: get('corr-bareme'),
        criteres: get('corr-criteres'),
        consignes: get('corr-consignes'),
        exemple: get('corr-exemple'),
        exportWord: $('#corr-export-word')?.checked || false,
        exportHtml: $('#corr-export-html')?.checked || false,
        exportPdf: $('#corr-export-pdf')?.checked || false,
        _corrPdfName,
        _corrPdfBase64,
        _corrPdfMime,
        _corrRefName,
        _corrRefText,
        _corrRefBase64,
        _corrRefMime
      };
      const saveId = 'corrSave_' + Date.now();
      await db.put('settings', { id: saveId, data: configToSave });
      await refreshCorrectionSavedList();
      toast(`Sauvegarde "${name}" réussie !`, 'success');
    } catch (err) {
      console.error('Erreur lors de la sauvegarde :', err);
      toast('Erreur lors de la sauvegarde.', 'error');
    }
  };

  const loadCorrectionConfigData = async () => {
    try {
      const id = $('#corr-saved-list')?.value;
      if (!id) {
        toast('Veuillez sélectionner un profil sauvegardé.', 'info');
        return;
      }
      const record = await db.get('settings', id);
      if (!record || !record.data) {
        toast('Erreur : profil introuvable.', 'error');
        return;
      }
      const data = record.data;
      const set = (id, val) => { if ($(`#${id}`)) $(`#${id}`).value = val || ''; };
      set('corr-discipline', data.discipline);
      set('corr-custom-discipline', data.customDiscipline);
      set('corr-niveau', data.niveau);
      set('corr-filiere', data.filiere);
      set('corr-option', data.option);
      set('corr-type-eval', data.typeEval);
      set('corr-niveau-langue', data.niveauLangue);
      set('corr-output-lang', data.outputLanguage);
      set('corr-sujet', data.sujet);
      set('corr-format', data.format);
      
      // Update UI state based on loaded discipline BEFORE setting competences
      corrFillCompetences();
      
      set('corr-competences', data.competences);
      set('corr-bareme', data.bareme);
      set('corr-criteres', data.criteres);
      set('corr-consignes', data.consignes);
      set('corr-exemple', data.exemple);
      if ($('#corr-export-word')) $('#corr-export-word').checked = data.exportWord;
      if ($('#corr-export-html')) $('#corr-export-html').checked = !!data.exportHtml;
      if ($('#corr-export-pdf')) $('#corr-export-pdf').checked = !!data.exportPdf;
      
      _corrPdfName = data._corrPdfName || '';
      _corrPdfBase64 = data._corrPdfBase64 || null;
      _corrPdfMime = data._corrPdfMime || '';
      _corrRefName = data._corrRefName || '';
      _corrRefText = data._corrRefText || '';
      _corrRefBase64 = data._corrRefBase64 || null;
      _corrRefMime = data._corrRefMime || '';
      _corrExempleName = data._corrExempleName || '';
      _corrExempleText = data._corrExempleText || '';
      _corrExempleBase64 = data._corrExempleBase64 || null;
      _corrExempleMime = data._corrExempleMime || '';

      if (_corrExempleBase64 && $('#corr-exemple-badge')) {
        $('#corr-exemple-badge').textContent = `📄 ${_corrExempleName} (Mémoire)`;
        $('#corr-exemple-badge').style.display = 'inline-block';
        if ($('#corr-exemple-info')) $('#corr-exemple-info').style.display = 'block';
      } else {
        if ($('#corr-exemple-badge')) $('#corr-exemple-badge').style.display = 'none';
        if ($('#corr-exemple-info')) $('#corr-exemple-info').style.display = 'none';
      }


      if (_corrPdfBase64 && $('#corr-pdf-badge')) {
        $('#corr-pdf-badge').textContent = `📎 ${_corrPdfName} (Mémoire)`;
        $('#corr-pdf-badge').style.display = 'inline-block';
        if ($('#corr-pdf-info')) {
          $('#corr-pdf-info').innerHTML = `✅ Fichier PDF chargé depuis la mémoire : <strong>${_corrPdfName}</strong>`;
          $('#corr-pdf-info').style.display = 'block';
        }
      } else {
        if ($('#corr-pdf-badge')) $('#corr-pdf-badge').style.display = 'none';
        if ($('#corr-pdf-info')) $('#corr-pdf-info').style.display = 'none';
      }

      if (_corrRefBase64 && $('#corr-ref-badge')) {
        $('#corr-ref-badge').textContent = `📝 ${_corrRefName} (Mémoire)`;
        $('#corr-ref-badge').style.display = 'inline-block';
      } else {
        if ($('#corr-ref-badge')) $('#corr-ref-badge').style.display = 'none';
      }
      
      toast(`Profil "${data.name}" chargé avec succès !`, 'success');
    } catch (err) {
      console.error('Erreur de chargement :', err);
      toast('Erreur lors du chargement.', 'error');
    }
  };

  const deleteCorrectionConfigData = async () => {
    try {
      const id = $('#corr-saved-list')?.value;
      if (!id) return toast('Veuillez sélectionner un profil à supprimer.', 'info');
      if (!confirm('Êtes-vous sûr de vouloir supprimer ce profil ?')) return;
      await db.delete('settings', id);
      await refreshCorrectionSavedList();
      toast('Profil supprimé.', 'info');
    } catch (err) {
      console.error('Erreur lors de la suppression :', err);
      toast('Erreur lors de la suppression.', 'error');
    }
  };

  const refreshCorrectionSavedList = async () => {
    try {
      const allSettings = await db.getAll('settings');
      const saves = allSettings.filter(s => s.id && s.id.startsWith('corrSave_'));
      const select = $('#corr-saved-list');
      if (!select) return;
      
      // Preserve currently selected option if possible
      const currentVal = select.value;
      
      select.innerHTML = '<option value="">— Profils sauvegardés —</option>';
      saves.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = s.data.name || 'Sauvegarde sans nom';
        select.appendChild(opt);
      });
      
      if (saves.some(s => s.id === currentVal)) {
        select.value = currentVal;
      }
    } catch (err) {
      console.error('Erreur lors du chargement de la liste :', err);
    }
  };

  // Retirer les anciens listeners puis ajouter les nouveaux (robuste au HMR)
  document.removeEventListener('do-save-correction-config',   window._corrSaveHandler);
  document.removeEventListener('do-load-correction-config',   window._corrLoadHandler);
  document.removeEventListener('do-delete-correction-config', window._corrDeleteHandler);
  window._corrSaveHandler   = saveCorrectionConfigData;
  window._corrLoadHandler   = loadCorrectionConfigData;
  window._corrDeleteHandler = deleteCorrectionConfigData;
  document.addEventListener('do-save-correction-config',   window._corrSaveHandler);
  document.addEventListener('do-load-correction-config',   window._corrLoadHandler);
  document.addEventListener('do-delete-correction-config', window._corrDeleteHandler);

  const generateCorrectionSheet = async () => {
    if (state.isGenerating) {
      console.warn("Génération déjà en cours, annulation du deuxième appel.");
      return;
    }
    const get = (id) => ($(`#${id}`)?.value || '').trim();
    const discipline = get('corr-discipline') === 'Autre'
      ? (get('corr-custom-discipline') || 'Autre')
      : get('corr-discipline');
    const hasPdf = !!_corrPdfBase64;

    const cfg = {
      discipline,
      niveau:       get('corr-niveau'),
      filiere:      get('corr-filiere'),
      option:       get('corr-option'),
      typeEval:     get('corr-type-eval'),
      niveauLangue: get('corr-niveau-langue'),
      outputLanguage: get('corr-output-lang'),
      // Si PDF chargé : on conserve le texte de la zone (qui inclut déjà la mention du PDF lors de l'import, plus les éventuels ajouts manuels)
      sujet:        get('corr-sujet') || (hasPdf ? `[DOCUMENT JOINT EN PIÈCE JOINTE : ${_corrPdfName}]\n\nIMPORTANT : Le sujet complet se trouve dans le document PDF/image attaché à ce message.` : ''),
      bareme:       get('corr-bareme'),
      format:       get('corr-format'),
      competences:  get('corr-competences'),
      criteres:     get('corr-criteres'),
      consignes:    get('corr-consignes'),
      exemple:      get('corr-exemple'),
      exportWord:   $('#corr-export-word')?.checked || false,
      exportHtml:   $('#corr-export-html')?.checked || false,
      exportPdf:    $('#corr-export-pdf')?.checked || false,
    };

    // Validation
    if (!hasPdf && (!cfg.sujet || cfg.sujet.length < 20)) {
      toast('Veuillez coller le sujet ou importer un PDF.', 'error');
      return;
    }
    if (!cfg.discipline || !cfg.niveau) {
      toast('Veuillez compléter les étapes 1 et 2.', 'error');
      return;
    }

    // Sauvegarder la configuration de la classe pour la prochaine fois
    try {
      const configToSave = {
        discipline: get('corr-discipline'),
        customDiscipline: get('corr-custom-discipline'),
        niveau: get('corr-niveau'),
        filiere: get('corr-filiere'),
        option: get('corr-option'),
        typeEval: get('corr-type-eval'),
        niveauLangue: get('corr-niveau-langue'),
        outputLanguage: get('corr-output-lang'),
        format: get('corr-format'),
        criteres: get('corr-criteres'),
        consignes: get('corr-consignes'),
        exportWord: $('#corr-export-word')?.checked || false,
        exportHtml: $('#corr-export-html')?.checked || false,
        exportPdf: $('#corr-export-pdf')?.checked || false
      };
      localStorage.setItem('corrSavedConfig', JSON.stringify(configToSave));
    } catch (e) { console.error("Could not save config", e); }

    // Fermer la modale
    closeCorrectionModal();

    const classeStr = `${cfg.niveau} ${cfg.filiere && !cfg.filiere.includes('Aucune') ? ' - ' + cfg.filiere : ''} ${cfg.option && !cfg.option.includes('Générale') ? '(' + cfg.option + ')' : ''}`.replace(/\s+/g, ' ').trim();
    const titre = `📋 Fiche de Correction — ${cfg.discipline} ${classeStr} (${cfg.typeEval})${hasPdf ? ' [PDF]' : ''}`;

    // Afficher dans le chat
    if (!state.messages) state.messages = [];
    const chatUserText = titre;
    state.messages.push({ role: 'user', content: chatUserText, ts: Date.now() });
    renderMessages();

    const assistantMsg = { role: 'assistant', content: '⏳ Génération en cours…', streaming: true, ts: Date.now() + 1, modelUsed: 'gemini-3.5-flash', isCorrection: true };
    state.messages.push(assistantMsg);
    renderMessages();

    // Mode génération
    const _savedAgent = state.agent; // Sauvegarder l'agent courant
    state.isGenerating = true;
    state.selectedWorkflow = null; // Eviter la pollution QCM
    state.agent = null; // Temporairement null pendant la génération
    state.abortController = new AbortController();
    const sendBtn = $('#send-btn');
    if (sendBtn) { sendBtn.disabled = false; sendBtn.className = 'stop-btn'; sendBtn.innerHTML = '⏹ ARRÊTER'; }
    showTyping("gemini-3.5-flash");

    try {
      // ═══════════════════════════════════════════════════════════
      // EXCLUSIVEMENT : Gemini Vision (PDF/Image) 
      // ═══════════════════════════════════════════════════════════
      const GEMINI_MODEL = 'gemini-3.5-flash';

      if (!state.geminiApiKey) {
        throw new Error('Clé API Google Gemini requise pour la reconnaissance de documents. Configurez-la dans Paramètres API (bouton 🔑 API en haut à droite).');
      }

      const userContent = buildCorrectionUserPrompt(cfg);

      // Construire les parts Gemini
      const parts = [{ text: userContent }];

      // Si document sujet chargé : l'envoyer en inlineData pour vision native
      if (hasPdf && _corrPdfBase64) {
        parts.unshift({
          inlineData: {
            mimeType: _corrPdfMime || 'application/pdf',
            data: _corrPdfBase64
          }
        });
        parts.splice(1, 0, { text: '\n\n---\n[DOCUMENT SUJET - LECTURE OBLIGATOIRE]\nLe document PDF/image ci-dessus contient le sujet complet de l\'évaluation. Tu DOIS analyser intégralement son contenu (questions, textes, données, schémas, tableaux, graphiques, images) avec ta vision native. Base TOUTE ta fiche de correction sur ce document joint et son contenu réel. Ne commence pas la fiche avant d\'avoir tout lu.\n---\n\n' });
      }

      // Si cadre de référence PDF importé : l'envoyer aussi en inlineData pour vision native
      
      // Si exemple de correction importé (PDF)
      if (_corrExempleBase64) {
        parts.push({
          inlineData: {
            mimeType: _corrExempleMime || 'application/pdf',
            data: _corrExempleBase64
          }
        });
        parts.push({ text: `\n\n---\n[FICHE MODÈLE - DOCUMENT JOINT : ${_corrExempleName}]\nLe document ci-dessus est la fiche de correction d'EXEMPLE que l'enseignant te donne pour le style.\n---\n\n` });
      }
if (_corrRefBase64) {
        parts.push({
          inlineData: {
            mimeType: _corrRefMime || 'application/pdf',
            data: _corrRefBase64
          }
        });
        parts.push({ text: `\n\n---\n[CADRE DE RÉFÉRENCE - DOCUMENT JOINT : ${_corrRefName}]\nLe document ci-dessus est le cadre de référence pédagogique officiel fourni par l'enseignant. Tu DOIS lire ce document et utiliser EXCLUSIVEMENT les compétences, habilités et terminologie qu'il contient pour remplir la colonne "Compétence évaluée". Ce cadre remplace ou complète les compétences génériques proposées dans le prompt.\n---\n\n` });
      }

      let baseSystemPrompt = CORRECTION_SYSTEM_PROMPT;
      if (cfg.discipline === 'SVT') {
        baseSystemPrompt = SVT_SYSTEM_PROMPT.replace(
          '2ème année du baccalauréat, filière Sciences Physiques (SP), option internationale (enseignement en français).',
          `${cfg.niveau} ${cfg.filiere && !cfg.filiere.includes('Aucune') ? ', filière ' + cfg.filiere : ''} ${cfg.option && !cfg.option.includes('Générale') ? ', option ' + cfg.option : ''}`.replace(/\s+/g, ' ').trim()
        );
        // Si un cadre de référence a été importé (texte), il enrichit/remplace le référentiel SVT codé en dur
        if (_corrRefText && !_corrRefBase64) {
          baseSystemPrompt = baseSystemPrompt.replace(
            '</referentiel_pedagogique>',
            `\n    ### C. Cadre de Référence Importé par l'Enseignant (PRIORITAIRE)\n    L'enseignant a fourni le cadre de référence officiel suivant. Il PRIME sur les compétences génériques ci-dessus. Utilise OBLIGATOIREMENT la terminologie exacte de ce cadre importé :\n    ${_corrRefText}\n  </referentiel_pedagogique>`
          );
        }
      }

      // Si cadre de référence texte importé (toutes disciplines) : l'injecter dans le system prompt
      if (_corrRefText && !_corrRefBase64 && cfg.discipline !== 'SVT') {
        baseSystemPrompt = baseSystemPrompt.replace(
          '</system_instructions>',
          `\n  <cadre_reference_importe>\n    L'enseignant a fourni le cadre de référence pédagogique officiel suivant. Utilise OBLIGATOIREMENT la terminologie et les compétences exactes de ce document pour remplir la colonne "Compétence évaluée". Ce cadre est prioritaire sur toute proposition générique :\n    ${_corrRefText}\n  </cadre_reference_importe>\n\n</system_instructions>`
        );
      }

      
      // Inject CLONING rule if example is present (Text or Base64)
      if (_corrExempleBase64 || cfg.exemple.length > 20) {
        const cloningRule = `\n\n## ⚠️ RÈGLE ABSOLUE — CLONAGE STRICT DE LA FICHE EXEMPLE (PRIORITÉ MAXIMALE)\n\nSi une fiche exemple de correction est fournie (en PDF ou en texte collé), cette règle **ANNULE ET REMPLACE** le format de tableau de correction par défaut.\n\n**ÉTAPE A — ANALYSE EXHAUSTIVE (avant d'écrire quoi que ce soit) :**\n- Compte et copie EXACTEMENT les intitulés et l'ordre des colonnes de la correction modèle.\n- Analyse le style : tableaux, listes à puces, numérotations, présence de barèmes dans les colonnes ou à côté.\n\n**ÉTAPE B — REPRODUCTION STRICTE DU SQUELETTE :**\n- ❌ NE PAS utiliser le format à 4 colonnes de base si l'exemple est différent.\n- ❌ NE PAS changer le nom des colonnes par rapport à l'exemple.\n- ✅ La grille de correction générée doit être visuellement et structurellement IDENTIQUE à l'exemple.\n- ✅ Seul le CONTENU (réponses spécifiques à ce sujet) change. La FORME est clonée à l'identique.\n\n**ÉTAPE C — RAPPORT DE FORMAT** (insérer en haut de ta réponse) :\nIndique le format détecté (colonnes, structure) que tu as cloné.`;
        
        baseSystemPrompt = baseSystemPrompt.replace('</system_instructions>', cloningRule + '\n</system_instructions>');
      }
const effectiveSystemPrompt = hasPdf || _corrRefBase64 || _corrExempleBase64
        ? baseSystemPrompt + `\n\nREMARQUE CRITIQUE (MODE DOCUMENT) : Un ou plusieurs documents ont été joints à ce message. Tu dois IMPÉRATIVEMENT lire et analyser le contenu RÉEL de chaque document joint avant de générer quoi que ce soit. Si tu ne lis pas les documents, ta réponse sera inutilisable.`
        : baseSystemPrompt;

      const geminiPayload = {
        systemInstruction: { parts: [{ text: effectiveSystemPrompt }] },
        contents: [{ role: 'user', parts }],
        generationConfig: {
          temperature: 0.35,
          maxOutputTokens: 8192,
          topP: 0.95
        }
      };

      const cleanGeminiKey = state.geminiApiKey.replace(/[\r\n\s]+/g, '');
      const geminiUrl = `/api/gemini/v1beta/models/${GEMINI_MODEL}:generateContent?key=${cleanGeminiKey}`;

      assistantMsg.content = `🔍 Gemini analyse votre demande${hasPdf ? ' et lit le document natif' : ''}…`;
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
        throw new Error(`Gemini API ${geminiRes.status}: ${errMsg}`);
      }

      const geminiData = await geminiRes.json();
      let geminiText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '';

      if (!geminiText) {
        const finishReason = geminiData?.candidates?.[0]?.finishReason;
        throw new Error(`Gemini n'a pas généré de texte. Raison : ${finishReason || 'inconnue'}`);
      }

      // Extraction du titre SVT genere (si applicable)
      let extractedTitle = 'Fiche_Correction';
      const titleMatch = geminiText.match(/\[TITRE_SVT:\s*(.*?)\]/i);
      if (titleMatch) {
        extractedTitle = titleMatch[1].trim().replace(/[^a-zA-Z0-9À-ÿ\s-]/g, '_');
        geminiText = geminiText.replace(titleMatch[0], '').trim();
        if (state.messages && state.messages.length >= 2) {
           const lastUserMsg = state.messages[state.messages.length - 2];
           if (lastUserMsg && lastUserMsg.role === 'user') {
              lastUserMsg.content = `📋 Fiche de Correction — ${extractedTitle}`;
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
          exportToWord(textToExport, `Fiche_Correction_${extractedTitle.replace(/\s+/g, '_').slice(0,50)}.doc`);
          toast('📄 Fiche exportée en Word avec succes !', 'success');
        } catch(e) {
          console.error('Export Word error:', e);
        }
      }

      // Export HTML si demande
      if (cfg.exportHtml) {
        let textToExport = geminiText;
        if (textToExport.includes('[EXPORT_HTML]')) {
          textToExport = textToExport.replace('[EXPORT_HTML]', '').trim();
          geminiText = textToExport;
        }
        try {
          exportToHtml(textToExport, `Fiche_Correction_${extractedTitle.replace(/\s+/g, '_').slice(0,50)}.html`);
          toast('🌐 Fiche exportée en HTML avec succes !', 'success');
        } catch(e) {
          console.error('Export HTML error:', e);
        }
      }

      // Export PDF si demande
      if (cfg.exportPdf) {
        let textToExport = geminiText;
        if (textToExport.includes('[EXPORT_PDF]')) {
          textToExport = textToExport.replace('[EXPORT_PDF]', '').trim();
          geminiText = textToExport;
        }
        try {
          exportToPdf(textToExport, `Fiche_Correction_${extractedTitle.replace(/\s+/g, '_').slice(0,50)}.pdf`);
          toast('📕 Fiche exportée en PDF avec succes !', 'success');
        } catch(e) {
          console.error('Export PDF error:', e);
        }
      }

      assistantMsg.content = geminiText;
      assistantMsg.streaming = false;
      renderMessages(true);
      hideTyping();
      await saveChat();

      // Les données PDF et cadre de référence sont conservées en mémoire
      // pour permettre une sauvegarde ultérieure du profil ou une regénération.

    } catch(e) {
      if (e.name === 'AbortError' || (e.message && e.message.includes('Aborted'))) {
        assistantMsg.content = `*— Génération de la fiche interrompue —*`;
      } else {
        assistantMsg.content = `❌ Erreur génération fiche : ${e.message}`;
      }
      assistantMsg.streaming = false;
      renderMessages(true);
      hideTyping();
    } finally {
      state.isGenerating = false;
      state.agent = _savedAgent; // Restaurer l'agent après la génération
      state.abortController = null;
      const sendBtn2 = $('#send-btn');
      if (sendBtn2) { sendBtn2.className = 'send-btn'; sendBtn2.innerHTML = '▶'; sendBtn2.disabled = false; }
    }
  };

  // Scroll to bottom
  const scrollBottomBtn = $("#scroll-bottom");
  const chatContainer = $("#chat-container");
  if (scrollBottomBtn && chatContainer) {
    chatContainer.addEventListener('scroll', () => {
      const distFromBottom = chatContainer.scrollHeight - chatContainer.scrollTop - chatContainer.clientHeight;
      scrollBottomBtn.classList.toggle("visible", distFromBottom > 150);
    });
    scrollBottomBtn.onclick = () => { chatContainer.scrollTop = chatContainer.scrollHeight; };
  }

  // Voice dictation
  const voiceBtn = $("#voice-btn");
  if (voiceBtn && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SR();
    recognition.lang = 'fr-FR'; recognition.continuous = false; recognition.interimResults = false;
    let isRecording = false;
    voiceBtn.onclick = () => {
      if (isRecording) { recognition.stop(); return; }
      recognition.start();
      isRecording = true;
      voiceBtn.classList.add("recording");
      voiceBtn.title = "Arrêter la dictée";
    };
    recognition.onresult = e => {
      const transcript = Array.from(e.results).map(r=>r[0].transcript).join('');
      const inp = $("#user-input");
      inp.value += (inp.value ? ' ' : '') + transcript;
      autoResizeTextarea();
    };
    recognition.onend = () => { isRecording = false; voiceBtn.classList.remove("recording"); voiceBtn.title = "Dictée vocale"; };
    recognition.onerror = () => { isRecording = false; voiceBtn.classList.remove("recording"); toast("Dictée vocale indisponible", "error"); };
  } else if (voiceBtn) {
    voiceBtn.style.display = "none";
  }

  // Send / Stop
  $("#send-btn").onclick = () => {
    if (state.isGenerating) { stopGeneration(); }
    else { sendMessage(); }
  };
  $("#user-input").oninput = () => { autoResizeTextarea(); updateTokenCounter(); };
  $("#user-input").onkeydown = e => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!state.isGenerating) sendMessage();
    }
  };

  // ══ KEYBOARD SHORTCUTS ══
  document.addEventListener('keydown', e => {
    // Ignorer si on tape dans un input/textarea (sauf Escape)
    const inInput = ['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName);

    // Escape — Fermer les modals/panels ouverts
    if (e.key === 'Escape') {
      if (state.isGenerating) { stopGeneration(); return; }
      const modals = document.querySelectorAll('.modal-overlay.active');
      if (modals.length) { modals.forEach(m => m.classList.remove('active')); return; }
      const memPanel = document.getElementById('memory-panel');
      if (memPanel?.classList.contains('active')) { memPanel.classList.remove('active'); return; }
      const archPanel = document.getElementById('archives-panel');
      if (archPanel?.classList.contains('active')) { closeArchivesPanel(); return; }
    }

    if (inInput) return; // Les raccourcis suivants ne marchent pas dans un champ de saisie

    // Ctrl+N — Nouvelle conversation
    if (e.ctrlKey && e.key === 'n') { e.preventDefault(); newChat(); }
    // Ctrl+L — Effacer le chat
    else if (e.ctrlKey && e.key === 'l') {
      e.preventDefault();
      state.messages = (state.messages||[]).filter(m => m.role === 'system');
      renderMessages(); saveChat(); toast('Conversation effacée', 'success');
    }
    // Ctrl+K — Focus sur l'input
    else if (e.ctrlKey && e.key === 'k') { e.preventDefault(); document.getElementById('user-input')?.focus(); }
    // Ctrl+/ — Ouvrir les archives
    else if (e.ctrlKey && e.key === '/') { e.preventDefault(); openArchivesPanel(); }
  });

  // Chat controls
  $("#clear-chat").onclick = async () => {
    state.messages = (state.messages||[]).filter(m => m.role === "system");
    renderMessages();
    await saveChat();
    toast("Conversation effacée", "success");
  };
  $("#new-chat").onclick = newChat;

  // Model
  $("#model-select").onchange = e => {
    state.model = e.target.value;
    db.put('settings', { id:'model', value:state.model }).catch(()=>{});
    const sys = (state.messages||[]).find(m => m.role === "system");
    if (sys) { sys.content = buildSystemPrompt(); saveChat(); }
  };

  // Agent select
  $("#agent-select").onchange = async e => {
    try {
      const val = e.target.value;
      
      // Interception des Outils
      if (val === '__TOOL__correction') {
        state.agent = null;
        state.selectedWorkflow = null;
        if (typeof openCorrectionModal !== 'undefined') openCorrectionModal();
        return;
      }
      if (val === '__TOOL__didactique') {
        state.agent = null;
        state.selectedWorkflow = null;
        if (typeof openDidactiqueModal !== 'undefined') openDidactiqueModal();
        return;
      }
      if (val === '__TOOL__methode') {
        state.agent = null;
        state.selectedWorkflow = null;
        if (typeof openMethodeModal !== 'undefined') openMethodeModal();
        return;
      }

      // Fiche SVT — 2e Bac SP Maroc supprimée

      if (val === '__ALL_AGENTS__') {
        state.agent = '__ALL_AGENTS__';
        state.selectedWorkflow = null;
        toast("Mode Multi-Agents activé — tous les experts seront consultés", "success");
      } else if (val.startsWith('__WF__')) {
        const wfId = val.replace('__WF__', '');
        const wf = await db.get('workflows', wfId);
        if (wf) {
          state.selectedWorkflow = wf;
          state.agent = null;
          toast(`Chaîne "${wf.name}" sélectionnée (${wf.steps.length} étapes)`, "success");

          const wfNameLower = wf.name.toLowerCase();
          const isMistralWorkflow = ['qcm','quiz','fc','audit','mcq','vrai/faux','true/false'].some(kw => wfNameLower.includes(kw));
          if (isMistralWorkflow) {
            const mistralId = "mistral-large-2512";
            if (state.model !== mistralId) {
              state.model = mistralId;
              if ($('#model-select')) $('#model-select').value = mistralId;
              if (typeof db !== 'undefined' && db.put) {
                db.put('settings', { id: 'model', value: state.model }).catch(() => {});
              }
              if (typeof toast !== 'undefined') {
                toast('Le modèle Mistral Large 3 a été sélectionné (recommandé pour ce générateur).', 'info');
              }
            }
          }
        }
      } else if (val) {
        state.agent = await db.get('agents', val);
        state.selectedWorkflow = null;
        // Charger les leçons d'apprentissage
        try {
          const lessons = await agentFeedback.getForAgent(val, 8);
          state._agentLessonsCache = agentFeedback.buildLessonsPrompt(lessons);
        } catch(e) { state._agentLessonsCache = ''; }
      } else {
        state.agent = null;
        state.selectedWorkflow = null;
      }
      const sys = (state.messages||[]).find(m => m.role === "system");
      if (sys) { sys.content = buildSystemPrompt(); await saveChat(); renderMessages(true); }
    } catch(err) { console.error(err); }
  };

  // Theme
  $("#theme-select").onchange = e => {
    document.documentElement.dataset.theme = e.target.value;
    db.put('settings', { id:'theme', value:e.target.value }).catch(()=>{});
  };

  // Lang Switcher (cycles: fr → ar → en → fr)
  const toggleLang = () => {
    if (state.lang === 'fr') state.lang = 'ar';
    else if (state.lang === 'ar') state.lang = 'en';
    else state.lang = 'fr';
    document.documentElement.dir = state.lang === 'ar' ? 'rtl' : 'ltr';
    db.put('settings', { id:'lang', value:state.lang }).catch(()=>{});
    renderMessages(true);
  };
  if ($("#lang-switch-btn")) $("#lang-switch-btn").onclick = toggleLang;
  if ($("#lang-switch-btn-mob")) $("#lang-switch-btn-mob").onclick = toggleLang;


  // Wizard Modal
  if ($("#open-wizard-btn")) {
    $("#open-wizard-btn").onclick = () => showWizard(state.apiKey ? 2 : 1);
  }
  if ($("#open-wizard-btn-mob")) {
    $("#open-wizard-btn-mob").onclick = () => { closeBurger(); showWizard(state.apiKey ? 2 : 1); };
  }

  // API Modal
  $("#open-api-modal").onclick = () => {
    if (state.apiKey && $("#api-key-input")) {
      $("#api-key-input").value = state.apiKey;
    }
    if (state.geminiApiKey && $("#gemini-api-key-input")) {
      $("#gemini-api-key-input").value = state.geminiApiKey;
    }
    if (state.openRouterApiKey && $("#openrouter-api-key-input")) {
      $("#openrouter-api-key-input").value = state.openRouterApiKey;
    }
    $("#api-modal").classList.add("active");
  };
  const closeApiModal = () => $("#api-modal").classList.remove("active");
  $("#close-api-modal").onclick = closeApiModal;
  if ($("#close-api-modal-2")) $("#close-api-modal-2").onclick = closeApiModal;
  $("#api-modal").onclick = e => { if (e.target === $("#api-modal")) closeApiModal(); };

  // Auto-paste from clipboard on hover or focus
  const autoPaste = async (e) => {
    if (!e.target.value) {
      try {
        const text = await navigator.clipboard.readText();
        if (text && text.trim().length >= 20) {
          e.target.value = text.trim();
        }
      } catch (err) { /* ignore */ }
    }
  };
  const apiInputs = ["api-key-input", "wizard-api-key", "gemini-api-key-input", "openrouter-api-key-input"];
  apiInputs.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("mouseenter", autoPaste);
      el.addEventListener("focus", autoPaste);
    }
  });

  // ── TEST MISTRAL ──
  const btnTestMistral = $("#test-mistral-api");
  if (btnTestMistral) {
    btnTestMistral.onclick = async () => {
      const k = $("#api-key-input").value.trim() || state.apiKey;
      const resEl = $("#test-mistral-result");
      if (!k) { resEl.textContent = "❌ Clé manquante"; resEl.style.color = "var(--danger)"; return; }
      resEl.textContent = "⏳ Test..."; resEl.style.color = "var(--text-dim)";
      try {
        const res = await fetch("https://api.mistral.ai/v1/models", {
          headers: { "Authorization": `Bearer ${k}` }
        });
        if (res.ok) { resEl.textContent = "✅ Connecté (Mistral AI)"; resEl.style.color = "var(--neon)"; }
        else { resEl.textContent = `❌ Erreur ${res.status}`; resEl.style.color = "var(--danger)"; }
      } catch(e) {
        resEl.textContent = "❌ Échec réseau"; resEl.style.color = "var(--danger)";
      }
    };
  }

  // ── TEST GEMINI ──
  const btnTestGemini = $("#test-gemini-api");
  if (btnTestGemini) {
    btnTestGemini.onclick = async () => {
      const gK = $("#gemini-api-key-input").value.trim() || state.geminiApiKey;
      const resEl = $("#test-gemini-result");
      if (!gK) { resEl.textContent = "❌ Clé manquante"; resEl.style.color = "var(--danger)"; return; }
      resEl.textContent = "⏳ Test en cours..."; resEl.style.color = "var(--text-dim)";
      
      try {
        const cleanKey = gK.replace(/[\r\n\s]+/g, '');
        // Test 1: Simple GET (pour tester le réseau/CORS)
        await fetch(`/api/gemini/v1beta/models?key=${cleanKey}`);
        
        // Test 2: POST (génération réelle)
        const res = await fetch(`/api/gemini/v1beta/models/gemini-3.5-flash:generateContent?key=${cleanKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: "ping" }] }]
          })
        });
        if (res.ok) { resEl.textContent = "✅ Connecté (Google Gemini)"; resEl.style.color = "var(--cyan)"; }
        else { 
          const errData = await res.json().catch(()=>({}));
          const errMsg = errData.error?.message || "Erreur inconnue";
          resEl.textContent = `❌ Err: ${res.status}`; 
          resEl.style.color = "var(--danger)"; 
          resEl.title = errMsg;
          alert(`L'API a répondu avec l'erreur ${res.status}:\n\n${errMsg}`);
        }
      } catch(e) {
        console.error("Gemini Test Error:", e);
        resEl.textContent = `❌ Échec: ${e.message}`; 
        resEl.style.color = "var(--danger)";
        alert("Erreur réseau: " + e.message + "\n\nSi vous n'avez pas de bloqueur de publicité, c'est peut-être votre navigateur (ex: protection stricte de Firefox ou Edge) ou votre antivirus qui bloque la connexion vers Google en arrière-plan.");
      }
    };
  }

  // ── TEST OPENROUTER ──
  const btnTestOR = $("#test-openrouter-api");
  if (btnTestOR) {
    btnTestOR.onclick = async () => {
      const oK = $("#openrouter-api-key-input").value.trim() || state.openRouterApiKey;
      const resEl = $("#test-openrouter-result");
      if (!oK) { resEl.textContent = "❌ Clé manquante"; resEl.style.color = "var(--danger)"; return; }
      resEl.textContent = "⏳ Test en cours..."; resEl.style.color = "var(--text-dim)";
      
      try {
        const cleanKey = oK.replace(/[\r\n\s]+/g, '');
        const res = await fetch(`/api/openrouter/api/v1/chat/completions`, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${cleanKey}`
          },
          body: JSON.stringify({
            model: "deepseek/deepseek-chat",
            messages: [{ role: "user", content: "ping" }],
            max_tokens: 1
          })
        });
        if (res.ok) { resEl.textContent = "✅ Connecté (OpenRouter)"; resEl.style.color = "var(--cyan)"; }
        else { 
          const errData = await res.json().catch(()=>({}));
          const errMsg = errData.error?.message || "Erreur inconnue";
          resEl.textContent = `❌ Err: ${res.status}`; 
          resEl.style.color = "var(--danger)"; 
          resEl.title = errMsg;
        }
      } catch(e) {
        console.error("OpenRouter Test Error:", e);
        resEl.textContent = `❌ Échec: ${e.message}`; 
        resEl.style.color = "var(--danger)";
      }
    };
  }

  $("#save-api-key").onclick = async () => {
    const k = $("#api-key-input").value.trim();
    const gK = $("#gemini-api-key-input") ? $("#gemini-api-key-input").value.trim() : "";
    const oK = $("#openrouter-api-key-input") ? $("#openrouter-api-key-input").value.trim() : "";

    if (k && !isValidApiKey(k)) {
      toast("Clé Mistral invalide — min. 20 caractères alphanumériques", "error");
      return;
    }
    
    if (k) {
      await setCookie("mistral_api_key", k);
      state.apiKey = k;
    }
    if (gK) {
      await setCookie("gemini_api_key", gK);
      state.geminiApiKey = gK;
    }
    if (oK) {
      await setCookie("openrouter_api_key", oK);
      state.openRouterApiKey = oK;
    }

    if (state.apiKey || state.geminiApiKey || state.openRouterApiKey) {
      const apiBtn = $("#open-api-modal");
      if (apiBtn) {
        apiBtn.classList.add("active");
        const label = $("#api-status");
        if (label) label.textContent = "API OK";
      }
    }
    closeApiModal();
    toast("Clé(s) API enregistrée(s) avec succès !", "success");
    // Seed all default agents & workflows on first API key entry
    const existingAgents = await db.getAll('agents') || [];
    const hasDefault = existingAgents.some(a => a.id === 'default-qcm-multimatiere-expert');
    if (!hasDefault) {
      if (!state.aiConfig) {
        state.aiConfig = { name: "Mon Assistant IA", goal: "Générer des QCM", agentCount: 0 };
        await db.put('settings', { id: 'aiConfig', value: state.aiConfig });
        updateBrandName();
      }
      await seedDefaultData();

    }
  };

  if ($("#delete-api-key")) {
    $("#delete-api-key").onclick = () => {
      if (!confirm("Supprimer vos clés API sauvegardées (Mistral, Gemini, OpenRouter) ?")) return;
      deleteCookie("mistral_api_key");
      deleteCookie("gemini_api_key");
      deleteCookie("openrouter_api_key");
      state.apiKey = null;
      state.geminiApiKey = null;
      state.openRouterApiKey = null;
      $("#api-key-input").value = "";
      if ($("#gemini-api-key-input")) $("#gemini-api-key-input").value = "";
      if ($("#openrouter-api-key-input")) $("#openrouter-api-key-input").value = "";
      
      const apiBtn = $("#open-api-modal");
      if (apiBtn) {
        apiBtn.classList.remove("active");
        const label = $("#api-status");
        if (label) label.textContent = "API";
      }
      
      closeApiModal();
      toast("Clés API supprimées", "success");
    };
  }

  // Agent Modal
  const openAgentModal = async () => {
    await loadAgents();
    $("#agent-modal").classList.add("active");
  };
  const closeAgentModal = () => $("#agent-modal").classList.remove("active");
  $("#open-agent-modal").onclick = openAgentModal;
  $("#close-agent-modal").onclick = closeAgentModal;
  if ($("#close-agent-modal-2")) $("#close-agent-modal-2").onclick = closeAgentModal;
  $("#agent-modal").onclick = e => { if (e.target === $("#agent-modal")) closeAgentModal(); };

  $("#save-agent").onclick = async () => {
    const name = $("#agent-name").value.trim();
    const desc = $("#agent-desc").value.trim();
    if (!name || !desc) { toast("Nom et rôle obligatoires", "error"); return; }
    const agent = {
      id: uuid(),
      name,
      desc,
      instructions: $("#agent-instructions").value.trim(),
      primer: ($("#agent-primer") ? $("#agent-primer").value.trim() : ""),
      tags: ($("#agent-tags").value||"").split(',').map(t=>t.trim()).filter(Boolean),
      modelPref: ($("#agent-model-pref") ? $("#agent-model-pref").value : ""),
      temperature: parseFloat(($("#create-agent-temp") ? $("#create-agent-temp").value : "0.7")) || 0.7,
      style: ($("#create-agent-style") ? $("#create-agent-style").value : ""),
      forbidden: ($("#create-agent-forbidden") ? $("#create-agent-forbidden").value.trim() : ""),
      memPrio: 3,
      maxTokens: 4096,
      created: now()
    };

    await db.put('agents', agent);
    closeAgentModal();
    await loadAgents();
    $("#agent-select").value = agent.id;
    state.agent = agent;
    const sys = (state.messages||[]).find(m => m.role === "system");
    if (sys) { sys.content = buildSystemPrompt(); await saveChat(); renderMessages(); }
    toast(`Agent "${name}" créé et activé !`, "success");
    ["agent-name","agent-desc","agent-instructions","agent-tags"].forEach(id => {
      const el = $(`#${id}`);
      if (el) el.value = "";
    });
    if ($("#agent-primer")) $("#agent-primer").value = "";
  };

  // ══ WORKFLOW MODAL ══
  const openWorkflowModal = async () => {
    await loadAgents(); // ensure agents are loaded for step selects
    await renderWfExistingList();
    await resetWorkflowForm();
    $("#workflow-modal").classList.add("active");
  };
  const closeWorkflowModal = () => $("#workflow-modal").classList.remove("active");
  if ($("#open-workflow-modal")) $("#open-workflow-modal").onclick = openWorkflowModal;
  if ($("#close-workflow-modal")) $("#close-workflow-modal").onclick = closeWorkflowModal;
  if ($("#close-workflow-modal-2")) $("#close-workflow-modal-2").onclick = closeWorkflowModal;
  if ($("#workflow-modal")) $("#workflow-modal").onclick = e => { if (e.target === $("#workflow-modal")) closeWorkflowModal(); };
  if ($("#wf-add-step")) $("#wf-add-step").onclick = async () => await wfAddStep();
  if ($("#wf-save-btn")) $("#wf-save-btn").onclick = () => saveWorkflow();
  if ($("#wf-delete-btn")) $("#wf-delete-btn").onclick = async () => {
    const id = $("#wf-edit-id").value;
    if (id) {
      await deleteWorkflow(id);
      await resetWorkflowForm();
    }
  };


  // ══════════════════════════════════════════════════════════════════════════
  // ══ FICHE DE CORRECTION MODAL ══
  // ══════════════════════════════════════════════════════════════════════════

  // (CORRECTION_COMPETENCES, CORRECTION_SYSTEM_PROMPT et buildCorrectionUserPrompt
  //  sont définis AVANT generateCorrectionSheet — voir plus haut)


  // ── Navigation du wizard ───────────────────────────────────────────────
  const CORR_STEPS = ['corr-step-1','corr-step-2','corr-step-3','corr-step-4'];
  const CORR_LABELS = ['Contexte pédagogique','Sujet & Barème','Compétences & Options','Résumé & Génération'];

  const corrShowStep = (n) => {
    CORR_STEPS.forEach((id, i) => {
      const el = $(`#${id}`);
      if (el) el.style.display = (i === n - 1) ? 'block' : 'none';
    });
    // Update progress dots
    for (let i = 1; i <= 4; i++) {
      const dot = $(`#cdot-${i}`);
      const line = $(`#cline-${i}`);
      if (!dot) continue;
      dot.className = 'corr-step-dot' + (i < n ? ' done' : i === n ? ' active' : '');
      if (line) line.className = 'corr-step-line' + (i < n ? ' done' : '');
    }
    const lbl = $('#corr-step-label');
    if (lbl) lbl.textContent = CORR_LABELS[n - 1];

    // Étape 4 : afficher le bon badge moteur IA
    if (n === 4) {
      const gemBadge  = $('#corr-engine-gemini');
      const mistBadge = $('#corr-engine-mistral');
      const hasGemini = !!state.geminiApiKey;
      if (gemBadge)  gemBadge.style.display  = hasGemini ? 'block' : 'none';
      if (mistBadge) mistBadge.style.display = hasGemini ? 'none'  : 'block';
    }
  };

  // Pre-fill competences when discipline changes
  const corrFillCompetences = () => {
    const discEl = $('#corr-discipline');
    const compEl = $('#corr-competences');
    const langGroup = $('#corr-langue-group');
    const customGroup = $('#corr-custom-discipline-group');
    if (!discEl || !compEl) return;
    const disc = discEl.value;
    const isLang = ['Anglais','Arabe','Espagnol','Français'].includes(disc);
    if (langGroup) langGroup.style.display = isLang ? 'block' : 'none';
    if (customGroup) customGroup.style.display = disc === 'Autre' ? 'block' : 'none';
    compEl.value = CORRECTION_COMPETENCES[disc] || CORRECTION_COMPETENCES['Autre'];
  };

  // Build summary HTML for step 4
  const corrBuildSummary = () => {
    const get = (id) => ($(`#${id}`)?.value || '').trim();
    const discipline = get('corr-discipline') === 'Autre' ? (get('corr-custom-discipline') || 'Autre') : get('corr-discipline');
    const sujetPreview = get('corr-sujet').slice(0, 120) + (get('corr-sujet').length > 120 ? '…' : '');
    const classeStr = `${get('corr-niveau') || '—'} ${get('corr-filiere') && !get('corr-filiere').includes('Aucune') ? ' - ' + get('corr-filiere') : ''} ${get('corr-option') && !get('corr-option').includes('Générale') ? '(' + get('corr-option') + ')' : ''}`.replace(/\s+/g, ' ').trim();
    const html = `
      <div style="display:grid;gap:6px">
        <div><span style="color:var(--text-dim)">📚 Discipline :</span> <strong style="color:var(--cyan)">${discipline || '—'}</strong></div>
        <div><span style="color:var(--text-dim)">🎓 Classe :</span> <strong style="color:var(--neon)">${classeStr}</strong></div>
        <div><span style="color:var(--text-dim)">📝 Type :</span> ${get('corr-type-eval') || '—'}</div>
        <div><span style="color:var(--text-dim)">🗂️ Format :</span> ${(get('corr-format') || '').split('(')[0].trim()}</div>
        <div><span style="color:var(--text-dim)">⚖️ Barème :</span> ${get('corr-bareme') ? '<span style="color:#a78bfa">✓ Fourni</span>' : '<span style="color:#f59e0b">⚠ Absent — placeholders générés</span>'}</div>
        <div><span style="color:var(--text-dim)">📋 Sujet :</span> <em style="color:var(--text-dim);font-size:11px">${sujetPreview || '—'}</em></div>
      </div>`;
    const summaryEl = $('#corr-summary');
    if (summaryEl) summaryEl.innerHTML = html;
  };

  // ── Validation steps ────────────────────────────────────────────────────
  const corrValidateStep1 = () => {
    const disc = $('#corr-discipline')?.value;
    const niv = $('#corr-niveau')?.value;
    if (!disc) { toast('Veuillez choisir une discipline.', 'error'); return false; }
    if (!niv) { toast('Veuillez choisir un niveau scolaire.', 'error'); return false; }
    return true;
  };
  const corrValidateStep2 = () => {
    if (typeof _corrPdfBase64 !== 'undefined' && _corrPdfBase64) return true; // OK si un document est chargé
    const sujet = $('#corr-sujet')?.value?.trim();
    if (!sujet || sujet.length < 20) { toast('Veuillez coller le sujet (au moins 20 caractères) ou importer un PDF.', 'error'); return false; }
    return true;
  };

  // ── Ouvrir / Fermer la modale ──────────────────────────────────────────
  const openCorrectionModal = async () => {
    // Forcer le modèle Gemini car la fiche de correction l'exige
    const geminiId = "gemini-3.5-flash";
    if (state.model !== geminiId) {
      state.model = geminiId;
      if ($('#model-select')) $('#model-select').value = geminiId;
      if (typeof db !== 'undefined' && db.put) {
        db.put('settings', { id: 'model', value: state.model }).catch(() => {});
      }
      if (typeof toast !== 'undefined') {
        toast('Le modèle Gemini a été sélectionné (requis pour cet outil).', 'info');
      }
    }

    // Refresh multi-save list
    await refreshCorrectionSavedList();
    
    // Restaurer la configuration par défaut (dernier auto-save local)
    try {
      const saved = localStorage.getItem('corrSavedConfig');
      if (saved) {
        const s = JSON.parse(saved);
        if (s.discipline) $('#corr-discipline').value = s.discipline;
        if (s.customDiscipline) $('#corr-custom-discipline').value = s.customDiscipline;
        if (s.niveau) $('#corr-niveau').value = s.niveau;
        if (s.filiere) $('#corr-filiere').value = s.filiere;
        if (s.option) $('#corr-option').value = s.option;
        if (s.typeEval) $('#corr-type-eval').value = s.typeEval;
        if (s.niveauLangue) $('#corr-niveau-langue').value = s.niveauLangue;
        if (s.format) $('#corr-format').value = s.format;
        if (s.criteres) $('#corr-criteres').value = s.criteres;
        if (s.consignes) $('#corr-consignes').value = s.consignes;
        if ($('#corr-export-word')) $('#corr-export-word').checked = !!s.exportWord;
        if ($('#corr-export-html')) $('#corr-export-html').checked = !!s.exportHtml;
        if ($('#corr-export-pdf')) $('#corr-export-pdf').checked = !!s.exportPdf;
      }
    } catch(e) { console.error("Could not load config", e); }

    // Update PDF badge UI if a document is still in memory
    if (typeof _corrPdfBase64 !== 'undefined' && _corrPdfBase64) {
      if ($('#corr-pdf-badge')) {
        $('#corr-pdf-badge').textContent = `📎 ${_corrPdfName} (Mémoire)`;
        $('#corr-pdf-badge').style.display = 'inline-block';
      }
      if ($('#corr-pdf-info')) {
        $('#corr-pdf-info').innerHTML = `✅ Fichier PDF chargé depuis la mémoire : <strong>${_corrPdfName}</strong>`;
        $('#corr-pdf-info').style.display = 'block';
      }
    } else {
      if ($('#corr-pdf-badge')) $('#corr-pdf-badge').style.display = 'none';
      if ($('#corr-pdf-info')) $('#corr-pdf-info').style.display = 'none';
    }

    corrShowStep(1);
    corrFillCompetences();
    $('#correction-modal').classList.add('active');
  };
  const closeCorrectionModal = () => $('#correction-modal').classList.remove('active');

  // ── Wiring des boutons ─────────────────────────────────────────────────
  if ($('#open-correction-modal'))         $('#open-correction-modal').onclick = openCorrectionModal;
  if ($('#close-correction-modal'))        $('#close-correction-modal').onclick = closeCorrectionModal;
  if ($('#correction-modal'))              $('#correction-modal').onclick = e => { if (e.target === $('#correction-modal')) closeCorrectionModal(); };

  // Boutons gérés par Vue (@click) dans CorrectionModal.vue
  // Discipline change → auto-fill competences + show/hide langue/custom fields
  if ($('#corr-discipline')) $('#corr-discipline').onchange = corrFillCompetences;

  // Import fichier texte ou PDF → lire et traiter
  if ($('#corr-pdf-upload')) {
    $('#corr-pdf-upload').onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const badge     = $('#corr-pdf-badge');
      const info      = $('#corr-pdf-info');
      const removeBtn = $('#corr-pdf-remove');
      const sujetEl   = $('#corr-sujet');
      const isPdfOrImg = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf') || file.type.startsWith('image/');

      if (isPdfOrImg) {
        if (badge) { badge.textContent = `⏳ ${file.name} — Lecture en cours…`; badge.style.display = 'inline-block'; }
        
        const reader = new FileReader();
        reader.onload = (ev) => {
          _corrPdfBase64 = ev.target.result.split(',')[1];
          _corrPdfName = file.name;
          _corrPdfMime = file.type || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');

          if (badge) {
            badge.textContent = `📄 ${file.name} (Prêt pour Gemini Vision)`;
            badge.style.display = 'inline-block';
          }
          if (info) info.style.display = 'block';
          if (removeBtn) removeBtn.style.cssText = 'display:inline-flex;';
          
          if (sujetEl) { 
            sujetEl.value = `[DOCUMENT ATTACHÉ: ${file.name}]\nSera analysé nativement par Gemini.`; 
            sujetEl.style.opacity = '1'; 
          }
          toast(`✅ ${file.name} importé avec succès pour la Vision.`, 'success');
        };
        reader.onerror = () => {
          toast(`❌ Erreur lecture de ${file.name}`, 'error');
          if (badge) badge.style.display = 'none';
        };
        reader.readAsDataURL(file);
      } else {
        // Fichier texte (.txt / .md) → coller directement
        const reader = new FileReader();
        reader.onload = (ev) => {
          if (sujetEl) { sujetEl.value = ev.target.result.trim(); sujetEl.style.opacity = '1'; }
          _corrPdfBase64 = null; // on reset vision car c'est du texte
          _corrPdfName = file.name;
          if (badge) { badge.textContent = `📝 ${file.name}`; badge.style.display = 'inline-block'; }
          if (info)  info.style.display = 'block';
          if (removeBtn) removeBtn.style.cssText = 'display:inline-flex;';
          toast('✅ Fichier texte importé dans la zone sujet.', 'success');
        };
        reader.readAsText(file, 'UTF-8');
      }

      e.target.value = ''; // reset input
    };
  }


  // Import Exemple Modèle (PDF/TXT) → extraire le texte ou stocker en base64
  if ($('#corr-exemple-upload')) {
    $('#corr-exemple-upload').onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const badge     = $('#corr-exemple-badge');
      const info      = $('#corr-exemple-info');
      const removeBtn = $('#corr-exemple-remove');
      const isPdfOrImg = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf') || file.type.startsWith('image/');

      if (badge) { badge.textContent = `⏳ ${file.name} — Lecture en cours…`; badge.style.display = 'inline-block'; }

      if (isPdfOrImg) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          _corrExempleName = file.name;
          _corrExempleMime = file.type || 'application/pdf';
          const dataUrl = ev.target.result;
          _corrExempleBase64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
          _corrExempleText = ''; 
          if (badge) { badge.textContent = `📄 ${file.name} (mode clonage strict)`; badge.style.display = 'inline-block'; }
          if (info) info.style.display = 'block';
          if (removeBtn) removeBtn.style.cssText = 'display:inline-flex;';
          toast(`✅ Fiche modèle "${file.name}" importée — L'IA la clonera nativement.`, 'success');
        };
        reader.onerror = () => {
          toast(`❌ Erreur lecture de ${file.name}`, 'error');
          if (badge) badge.style.display = 'none';
        };
        reader.readAsDataURL(file);
      } else {
        const reader = new FileReader();
        reader.onload = (ev) => {
          _corrExempleName = file.name;
          _corrExempleText = ev.target.result.trim();
          const exEl = $('#corr-exemple');
          if (exEl) {
            exEl.value = `--- Fiche modèle importée ---\n` + _corrExempleText;
          }
          if (badge) { badge.textContent = `📝 ${file.name} (mode clonage strict)`; badge.style.display = 'inline-block'; }
          if (info) info.style.display = 'block';
          if (removeBtn) removeBtn.style.cssText = 'display:inline-flex;';
          toast(`✅ Fiche modèle "${file.name}" importée.`, 'success');
        };
        reader.onerror = () => {
          toast(`❌ Erreur lecture de ${file.name}`, 'error');
          if (badge) badge.style.display = 'none';
        };
        reader.readAsText(file, 'UTF-8');
      }
      e.target.value = '';
    };
  }
  // Import Cadre de Référence (PDF/TXT) → extraire le texte et l'injecter dans la zone compétences
  if ($('#corr-ref-upload')) {
    $('#corr-ref-upload').onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const badge     = $('#corr-ref-badge');
      const removeBtn = $('#corr-ref-remove');
      const competEl  = $('#corr-competences');
      const isPdfOrImg = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf') || file.type.startsWith('image/');

      if (badge) { badge.textContent = `⏳ ${file.name} — Lecture en cours…`; badge.style.display = 'inline-block'; }

      if (isPdfOrImg) {
        // Pour les PDF/images : stocker en base64 et envoyer à Gemini Vision comme inlineData
        const reader = new FileReader();
        reader.onload = (ev) => {
          _corrRefName = file.name;
          _corrRefMime = file.type || 'application/pdf';
          // Extraire uniquement la partie base64 (après la virgule du data URL)
          const dataUrl = ev.target.result;
          _corrRefBase64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
          _corrRefText = ''; // pas de texte brut pour un PDF — Gemini lira directement
          if (competEl) {
            const existing = competEl.value.trim();
            competEl.value = existing
              ? existing + `\n\n--- Cadre de référence importé (PDF) : ${file.name} ---\n📄 Gemini lira ce document en vision native pour extraire les compétences officielles.`
              : `📄 Cadre de référence importé (PDF) : ${file.name}\nGemini extraira les compétences officielles directement depuis ce document.`;
          }
          if (badge) { badge.textContent = `📄 ${file.name} (cadre de réf. — vision native)`; badge.style.display = 'inline-block'; }
          if (removeBtn) removeBtn.style.cssText = 'display:inline-flex;';
          toast(`✅ Cadre de référence "${file.name}" importé — Gemini lira le PDF natif.`, 'success');
        };
        reader.onerror = () => {
          toast(`❌ Erreur lecture de ${file.name}`, 'error');
          if (badge) badge.style.display = 'none';
        };
        reader.readAsDataURL(file);
      } else {
        // Fichier texte (.txt / .md) → coller directement dans la zone compétences
        const reader = new FileReader();
        reader.onload = (ev) => {
          _corrRefName = file.name;
          _corrRefText = ev.target.result.trim();
          if (competEl) {
            const existing = competEl.value.trim();
            competEl.value = existing
              ? existing + '\n\n--- Cadre de référence importé ---\n' + _corrRefText
              : _corrRefText;
          }
          if (badge) { badge.textContent = `📝 ${file.name} (cadre de réf.)`; badge.style.display = 'inline-block'; }
          if (removeBtn) removeBtn.style.cssText = 'display:inline-flex;';
          toast(`✅ Cadre de référence "${file.name}" importé dans la zone compétences.`, 'success');
        };
        reader.onerror = () => {
          toast(`❌ Erreur lecture de ${file.name}`, 'error');
          if (badge) badge.style.display = 'none';
        };
        reader.readAsText(file, 'UTF-8');
      }

      e.target.value = ''; // reset input
    };
  }

  // ── Boutons ✕ Supprimer fichier — Correction ──────────────────────────────
  if ($('#corr-pdf-remove')) {
    $('#corr-pdf-remove').onclick = () => {
      _corrPdfBase64 = null; _corrPdfName = ''; _corrPdfMime = '';
      const sujetEl = $('#corr-sujet');
      if (sujetEl && sujetEl.value.startsWith('[DOCUMENT ATTACHÉ:')) sujetEl.value = '';
      const badge = $('#corr-pdf-badge'); if (badge) badge.style.display = 'none';
      const info  = $('#corr-pdf-info');  if (info)  info.style.display  = 'none';
      $('#corr-pdf-remove').style.display = 'none';
      toast('🗑️ Fichier sujet supprimé.', 'info');
    };
  }
  if ($('#corr-exemple-remove')) {
    $('#corr-exemple-remove').onclick = () => {
      _corrExempleName = ''; _corrExempleBase64 = null; _corrExempleText = '';
      const exEl = $('#corr-exemple'); if (exEl) exEl.value = '';
      const badge = $('#corr-exemple-badge'); if (badge) badge.style.display = 'none';
      const info  = $('#corr-exemple-info');  if (info)  info.style.display  = 'none';
      $('#corr-exemple-remove').style.display = 'none';
      toast('🗑️ Fiche modèle supprimée.', 'info');
    };
  }
  if ($('#corr-ref-remove')) {
    $('#corr-ref-remove').onclick = () => {
      _corrRefBase64 = null; _corrRefName = ''; _corrRefText = '';
      const badge = $('#corr-ref-badge'); if (badge) badge.style.display = 'none';
      $('#corr-ref-remove').style.display = 'none';
      toast('🗑️ Cadre de référence supprimé.', 'info');
    };
  }

  // Générer la fiche (générique)
  // corr-generate-btn is handled by Vue @click
  // corr-save-btn and corr-load-btn are handled by Vue @click + CustomEvents — no direct binding needed

  // Expose correction functions to window for Vue components
  window.corrValidateStep1 = corrValidateStep1;
  window.corrValidateStep2 = corrValidateStep2;
  window.corrShowStep = corrShowStep;
  window.corrFillCompetences = corrFillCompetences;
  window.corrBuildSummary = corrBuildSummary;
  window.generateCorrectionSheet = generateCorrectionSheet;
  window.closeCorrectionModal = closeCorrectionModal;
  window.openCorrectionModal = openCorrectionModal;


  // ══════════════════════════════════════════════════════════════════════════
  



  

// ==============================================================================
// === FICHE DIDACTIQUE ========================================================
// ==============================================================================

const DIDACTIQUE_SYSTEM_PROMPT = `# SYSTEM INSTRUCTIONS

## (C) Contexte et Rôle
Tu es un **Expert Pédagogique Hybride**, fusion de trois spécialités :
1.  **Ingénieur Pédagogique en SVT** : Maîtrise de la biologie cellulaire et des didactiques actives (investigation, approche par compétences).
2.  **Concepteur de Programmes pour le Système Éducatif Marocain** : Connaissance des contraintes du BIOF (classes surchargées, niveau de français B1/B2, ressources limitées), des directives officielles et des difficultés récurrentes des élèves dans ce contexte.
3.  **Coach en Méthodologie d’Apprentissage Actif** : Spécialiste de la décomposition des tâches complexes en étapes simples, explicites et répétables. Capable d’anticiper les obstacles d’apprentissage et d’y associer des remédiations concrètes, **systématiquement liées à une modalité de travail précise**.

## (O) Objectif
À partir des **fichiers PDF** (contenant texte, images, graphiques) et de tout exemple de fiche réussi fourni, tu vas générer une **fiche didactique complète, détaillée et prête à l’emploi** pour une séquence de leçon. La fiche comporte un tableau de déroulement enrichi d’une **colonne « Difficultés anticipées et remédiations »** et, pour chaque question de la Phase 2, une **grille d’évaluation critériée sans barème ni points**, à visée purement formative.

## (S) Style et (T) Ton
- **Style** : Professionnel, structuré, didactique, langage clair et accessible. Phrases courtes, vocabulaire scientifique précis mais expliqué.
- **Ton** : Pédagogique, encourageant, rigoureux, réaliste et pragmatique. Tutoiement de l’enseignant lecteur.

## (A) Audience
L’enseignant marocain (spécialement en SVT, 2ème Bac BIOF).

## (R) Format de Réponse — Format PAR DÉFAUT (appliqué UNIQUEMENT si aucune fiche exemple n'est fournie)
Génère DIRECTEMENT le tableau final, sans étape de brouillon.
Ta réponse FINALE DOIT ÊTRE PLACÉE UNIQUEMENT DANS LA BALISE <reponse_finale>. Ne génère RIEN en dehors de cette balise. La balise <reponse_finale> contient :
1. **Le Tableau Didactique** en Markdown (8 colonnes) simulant une grille Word, syntaxe parfaite.
2. **La Conclusion Justifiée**.

### Structure du tableau (8 colonnes)
| Le scenario pédagogique | Les tâches de l'enseignant | Les tâches de l'élève | Mode de travail | Objectifs | Évaluation | Difficultés anticipées et remédiations | La durée |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
Tu rempliras chaque phase avec ces 8 colonnes. Pour la Phase 2 (Résolution), la colonne « Les tâches de l’enseignant » contiendra, pour chaque question, les 3 volets détaillés ci-dessous, et le Volet 3 inclura la grille d’évaluation critériée sans barème.

Détail des 3 volets pour la Phase 2
•	Volet 1 : Travail sur Brouillon (Guidage oral) : Consignes orales précises, adaptées au contexte de la question, guidant l’élève dans l’analyse du problème, le repérage des verbes d’action, le choix des documents, l’extraction des informations clés et l’ébauche d’un plan.
•	Volet 2 : Du Brouillon au Propre (Conseils méthodologiques) : Point de méthode spécifique, erreur la plus fréquente à éviter, objectif méthodologique.
•	Volet 3 : Réponse Attendue (Modèle de rédaction) + Grille d’évaluation critériée sans barème :
o	Rédaction idéale, français simple (phrases courtes), citations des documents (texte et visuels : « D’après le doc X… »).
o	Juste après la réponse, une grille d’évaluation critériée sans notation chiffrée au format tableau Markdown simple à 2 colonnes (Critère | Indicateur de réussite), contenant 3 à 4 critères. Aucune colonne de points, aucun total. L’évaluation est formative.

Colonne « Difficultés anticipées et remédiations » (toutes les phases)
Pour chaque phase, tu indiqueras les obstacles d’apprentissage typiques et, pour chacun, la remédiation explicitement liée à une modalité de travail concrète.

Règles Intangibles
Analyse Multimodale Obligatoire
•	Les PDF peuvent contenir images et graphiques. Analyse-les systématiquement.
•	Intègre les données visuelles dans les réponses modèles avec des citations précises (« D’après le document X (graphique)… »).



Contraintes Négatives
•	❌ Ne JAMAIS casser la syntaxe Markdown du tableau. Vérifie chaque | et l’alignement.
•	❌ Ne JAMAIS omettre un des 3 volets ou la grille d’évaluation.
•	❌ Ne JAMAIS oublier la colonne « Difficultés anticipées et remédiations » ni le lien avec une modalité de travail pour chaque remédiation.
•	❌ Ne pas inclure de barème chiffré (pas de points, pas de note) dans les grilles d’évaluation.
•	❌ Ne pas inventer de données hors documents. En cas de doute, indiquer « (À confirmer avec le manuel) ».
•	❌ Langue : phrases courtes, niveau B1+/B2 maximum.
•	❌ Ne pas négliger les éléments visuels.

Grounding & Anti-Hallucination
Base-toi exclusivement sur les PDF et le texte fournis. Les réponses modèles et les grilles doivent refléter le contenu des documents, pas un cours externe.



## ⚠️ RÈGLE ABSOLUE — CLONAGE STRICT DE LA FICHE EXEMPLE (PRIORITé MAXIMALE)

Si une fiche exemple est fournie (PDF ou texte), cette règle **ANNULE ET REMPLACE** toutes les instructions de format par défaut ci-dessus.

**ÉTAPE A — ANALYSE EXHAUSTIVE (avant d’écrire quoi que ce soit) :**
- Compter et copier EXACTEMENT les intitulés et l'ordre des colonnes.
- Identifier EXACTEMENT les phases/sections (noms, nombre, ordre, sous-sections).
- Analyser le style de chaque cellule : puces, tirets, numérotation, texte continu, gras, italique, tableaux imbriqués...
- Mesurer la profondeur de détail : longueur typique des cellules, granularité, niveau de langue.
- Repérer toutes les sections hors-tableau : en-têtes, légendes, blocs spéciaux.

**ÉTAPE B — REPRODUCTION STRICTE DU SQUELETTE :**
- ❌ NE PAS ajouter de colonnes absentes de l’exemple.
- ❌ NE PAS supprimer de colonnes présentes dans l’exemple.
- ❌ NE PAS renommer les colonnes, phases ou sections.
- ❌ NE PAS changer le style des cellules (puces → puces, tirets → tirets, etc.).
- ❌ NE PAS ajouter de volets ou blocs absents de l’exemple.
- ✅ Le tableau généré doit être visuellement et structurellement IDENTIQUE à l’exemple.
- ✅ Seul le CONTENU (données du cours) change. La FORME est clonée à l’identique.

**ÉTAPE C — RAPPORT DE FORMAT** (insérer avant <reponse_finale>) :
Indique le format détecté : nombre de colonnes, noms, nombre de phases, style de cellules.

Si aucune fiche exemple n’est fournie : appliquer le format par défaut défini dans la section (R) ci-dessus.`;

let _didacPdfBase64 = null;
let _didacPdfName = '';
let _didacPdfMime = '';

let _didacRefName   = '';
let _didacRefText   = '';
let _didacRefBase64 = null;
let _didacRefMime   = '';

let _didacExempleName   = '';
let _didacExempleBase64 = null;
let _didacExempleMime   = '';

let _didacDirectivesName   = '';
let _didacDirectivesText   = '';
let _didacDirectivesBase64 = null;
let _didacDirectivesMime   = '';



const didactiqueValidateStep1 = () => {
  const disc = $('#didac-discipline')?.value;
  const niv = $('#didac-niveau')?.value;
  if (!disc) { toast('Veuillez choisir une discipline.', 'error'); return false; }
  if (!niv) { toast('Veuillez choisir un niveau scolaire.', 'error'); return false; }
  return true;
};
const didactiqueValidateStep2 = () => {
  if (_didacPdfBase64) return true; // OK si un document est chargé
  const cours = $('#didac-cours')?.value?.trim();
  if (!cours || cours.length < 20) { toast('Veuillez coller le cours (au moins 20 caractères) ou importer un PDF.', 'error'); return false; }
  return true;
};
const didactiqueShowStep = (step) => {
  document.querySelectorAll('#didactique-modal .corr-step').forEach(el => el.style.display = 'none');
  const target = document.getElementById('didac-step-' + step);
  if (target) target.style.display = 'block';

  const labels = ['Contexte pédagogique', 'Support de cours', 'Objectifs & Cadre', 'Résumé & Génération'];
  if ($('#didac-step-label')) $('#didac-step-label').textContent = labels[step-1];

  for (let i = 1; i <= 4; i++) {
    const dot = $('#ddot-'+i);
    const line = $('#dline-'+(i-1));
    if (!dot) continue;
    dot.classList.remove('active', 'done');
    if (line) line.classList.remove('done');
    
    if (i < step) { dot.classList.add('done'); if(line) line.classList.add('done'); }
    else if (i === step) { dot.classList.add('active'); if(line) line.classList.add('done'); }
  }
};
const didactiqueBuildSummary = () => {
  const get = (id) => ($(`#${id}`)?.value || '').trim();
  const discipline = get('didac-discipline') === 'Autre' ? (get('didac-custom-discipline') || 'Autre') : get('didac-discipline');
  const coursPreview = get('didac-cours').slice(0, 120) + (get('didac-cours').length > 120 ? '…' : '');
  const classeStr = `${get('didac-niveau') || '—'} ${get('didac-filiere') && !get('didac-filiere').includes('Aucune') ? ' - ' + get('didac-filiere') : ''} ${get('didac-option') && !get('didac-option').includes('Générale') ? '(' + get('didac-option') + ')' : ''}`.replace(/\s+/g, ' ').trim();
  const html = `
    <div style="display:grid;gap:6px">
      <div><span style="color:var(--text-dim)">📚 Discipline :</span> <strong style="color:var(--cyan)">${discipline || '—'}</strong></div>
      <div><span style="color:var(--text-dim)">🎓 Classe :</span> <strong style="color:var(--neon)">${classeStr}</strong></div>
      <div><span style="color:var(--text-dim)">📋 Contenu (Extrait) :</span> <em style="color:var(--text-dim);font-size:11px">${coursPreview || '—'}</em></div>
      <div><span style="color:var(--text-dim)">🎯 Objectifs définis :</span> ${get('didac-objectifs') ? '<span style="color:#a78bfa">✓ Oui</span>' : '<span style="color:#f59e0b">⚠ Non (l\'IA en déduira)</span>'}</div>
      <div><span style="color:var(--text-dim)">📎 Exemple Few-Shot :</span> ${(get('didac-exemple') || _didacExempleBase64) ? '<span style="color:#f59e0b">✓ Fourni</span>' : '<span style="color:#f59e0b">⚠ Aucun</span>'}</div>
      <div><span style="color:var(--text-dim)">📀 Directives spécifiques :</span> ${(get('didac-directives') || _didacDirectivesBase64) ? '<span style="color:#34d399">✓ Fournies (appliquées en priorité)</span>' : '<span style="color:var(--text-dim)">⚠ Aucune</span>'}</div>
    </div>`;
  const summaryEl = $('#didac-summary');
  if (summaryEl) summaryEl.innerHTML = html;
};
const openDidactiqueModal = async () => {
  const geminiId = "gemini-3.5-flash";
  if (state.model !== geminiId) {
    state.model = geminiId;
    if ($('#model-select')) $('#model-select').value = geminiId;
    if (typeof db !== 'undefined' && db.put) {
      db.put('settings', { id: 'model', value: state.model }).catch(() => {});
    }
    if (typeof toast !== 'undefined') {
      toast('Le modèle Gemini a été sélectionné (requis pour la structuration de tableau complexe).', 'info');
    }
  }

  // Restaurer la config
  try {
    const saved = localStorage.getItem('didacSavedConfig');
    if (saved) {
      const s = JSON.parse(saved);
      if (s.discipline) $('#didac-discipline').value = s.discipline;
      if (s.customDiscipline) $('#didac-custom-discipline').value = s.customDiscipline;
      if (s.niveau) $('#didac-niveau').value = s.niveau;
      if (s.filiere) $('#didac-filiere').value = s.filiere;
      if (s.option) $('#didac-option').value = s.option;
      if (s.outputLanguage) $('#didac-output-lang').value = s.outputLanguage;
      if (s.objectifs) $('#didac-objectifs').value = s.objectifs;
      if (s.exemple) $('#didac-exemple').value = s.exemple;
      if ($('#didac-export-word')) $('#didac-export-word').checked = !!s.exportWord;
    }
  } catch(e) {}

  if (_didacPdfBase64) {
    if ($('#didac-pdf-badge')) {
      $('#didac-pdf-badge').textContent = `📎 ${_didacPdfName} (Mémoire)`;
      $('#didac-pdf-badge').style.display = 'inline-block';
    }
    if ($('#didac-pdf-info')) {
      $('#didac-pdf-info').innerHTML = `✅ Fichier PDF chargé depuis la mémoire : <strong>${_didacPdfName}</strong>`;
      $('#didac-pdf-info').style.display = 'block';
    }
  } else {
    if ($('#didac-pdf-badge')) $('#didac-pdf-badge').style.display = 'none';
    if ($('#didac-pdf-info')) $('#didac-pdf-info').style.display = 'none';
  }

  if (_didacExempleBase64 && $('#didac-exemple-badge')) {
    $('#didac-exemple-badge').textContent = `📄 ${_didacExempleName} (Mémoire)`;
    $('#didac-exemple-badge').style.display = 'inline-block';
    if ($('#didac-exemple-info')) $('#didac-exemple-info').style.display = 'block';
  } else {
    if ($('#didac-exemple-badge')) $('#didac-exemple-badge').style.display = 'none';
    if ($('#didac-exemple-info'))  $('#didac-exemple-info').style.display = 'none';
  }

  didactiqueShowStep(1);
  $('#didactique-modal').classList.add('active');
};
const closeDidactiqueModal = () => $('#didactique-modal').classList.remove('active');

const generateDidactiqueSheet = async () => {
  if (state.isGenerating) {
    console.warn("Génération déjà en cours, annulation du deuxième appel.");
    return;
  }
  const get = (id) => ($(`#${id}`)?.value || '').trim();
  const discipline = get('didac-discipline') === 'Autre'
    ? (get('didac-custom-discipline') || 'Autre')
    : get('didac-discipline');
  const hasPdf = !!_didacPdfBase64;

  const cfg = {
    discipline,
    niveau:       get('didac-niveau'),
    filiere:      get('didac-filiere'),
    option:       get('didac-option'),
    outputLanguage: get('didac-output-lang'),
    cours:        get('didac-cours') || (hasPdf ? `[DOCUMENT JOINT EN PIÈCE JOINTE : ${_didacPdfName}]\n\nIMPORTANT : Le cours complet se trouve dans le document PDF/image attaché à ce message.` : ''),
    objectifs:    get('didac-objectifs'),
    directives:    get('didac-directives'),
    exemple:      get('didac-exemple'),
    exportWord:   $('#didac-export-word')?.checked || false,
  };

  if (!hasPdf && (!cfg.cours || cfg.cours.length < 20)) {
    toast('Veuillez coller le cours ou importer un PDF.', 'error');
    return;
  }
  if (!cfg.discipline || !cfg.niveau) {
    toast('Veuillez compléter l\'étape 1.', 'error');
    return;
  }

  try {
    localStorage.setItem('didacSavedConfig', JSON.stringify(cfg));
  } catch (e) {}

  closeDidactiqueModal();

  const classeStr = `${cfg.niveau} ${cfg.filiere && !cfg.filiere.includes('Aucune') ? ' - ' + cfg.filiere : ''} ${cfg.option && !cfg.option.includes('Générale') ? '(' + cfg.option : ''}`.replace(/\s+/g, ' ').trim();
  const titre = `👨‍🏫 Fiche Didactique — ${cfg.discipline} ${classeStr}${hasPdf ? ' [PDF]' : ''}`;

  if (!state.messages) state.messages = [];
  state.messages.push({ role: 'user', content: titre, ts: Date.now() });
  renderMessages();

  const assistantMsg = { role: 'assistant', content: '⏳ Génération en cours…', streaming: true, ts: Date.now() + 1, modelUsed: 'gemini-3.5-flash', isCorrection: true };
  state.messages.push(assistantMsg);
  renderMessages();

  const _savedAgent = state.agent;
  state.isGenerating = true;
  state.selectedWorkflow = null;
  state.agent = null;
  state.abortController = new AbortController();
  const sendBtn = $('#send-btn');
  if (sendBtn) { sendBtn.disabled = false; sendBtn.className = 'stop-btn'; sendBtn.innerHTML = '⏹ ARRÊTER'; }
  showTyping("gemini-3.5-flash");

  try {
    if (!state.geminiApiKey) {
      throw new Error('Clé API Google Gemini requise. Configurez-la dans Paramètres API.');
    }

    let userContent = `# USER PROMPT

**Contexte utilisateur :** Génération de la fiche didactique.
**Matière :** ${cfg.discipline}
**Niveau :** ${classeStr}
**Langue de génération de la fiche :** ${cfg.outputLanguage === 'ar' ? 'العربية' : cfg.outputLanguage === 'en' ? 'English' : 'Français'}

`;
    if (cfg.cours && !hasPdf) {
      userContent += `**Contenu de la séquence / Activité :**\n` + cfg.cours + `\n\n`;
    }
    if (cfg.exemple) {
      userContent += `**Exemples de Fiches Réussies (Few-Shot) :**\n[L'IA imitera ce style]\n` + cfg.exemple + `\n\n`;
    }

    const parts = [{ text: userContent }];

    if (hasPdf && _didacPdfBase64) {
      parts.unshift({
        inlineData: { mimeType: _didacPdfMime || 'application/pdf', data: _didacPdfBase64 }
      });
      // PDF is BEFORE this text (unshifted at index 0), so "ci-dessus" is correct
      parts.splice(1, 0, { text: '\n\n---\n[DOCUMENT DE COURS — RÔLE : CONTENU PÉDAGOGIQUE SOURCE]\nLe document PDF ci-dessus contient le cours/l\'activité. Tu DOIS l\'analyser intégralement (texte, images, graphiques) pour construire la fiche.\n---\n\n' });
    }

    if (_didacRefBase64) {
      // Text label BEFORE the PDF (push order: text then PDF = ci-dessous is correct)
      parts.push({ text: `\n\n---\n[CADRE DE RÉFÉRENCE PÉDAGOGIQUE — RÔLE : RÉFÉRENTIEL DES COMPÉTENCES]\nLe document PDF ci-dessous est le cadre de référence officiel fourni par l'enseignant. Tu DOIS utiliser EXCLUSIVEMENT ses compétences, habiletés et sa terminologie exacte pour chaque évaluation de la fiche. Il remplace tout référentiel générique.\n---\n\n` });
      parts.push({
        inlineData: { mimeType: _didacRefMime || 'application/pdf', data: _didacRefBase64 }
      });
    }

    if (_didacDirectivesBase64) {
      // Text label BEFORE the PDF (ci-dessous is correct)
      parts.push({ text: `\n\n---\n[DIRECTIVES PÉDAGOGIQUES & DIDACTIQUES — RÔLE : CONTRAINTES OBLIGATOIRES]\nLe document PDF ci-dessous contient les directives pédagogiques officielles de l'enseignant. Tu DOIS les respecter strictement dans chaque phase, chaque tâche et chaque remédiation de la fiche.\n---\n\n` });
      parts.push({
        inlineData: { mimeType: _didacDirectivesMime || 'application/pdf', data: _didacDirectivesBase64 }
      });
    }

    if (_didacExempleBase64) {
      parts.push({ text: `\n\n---\n[FICHE MODÈLE À CLONER — DOCUMENT JOINT : ${_didacExempleName}]\n⚠️ INSTRUCTION CRITIQUE : Le document PDF joint ci-dessous EST la fiche modèle de l'enseignant. Tu DOIS analyser sa mise en forme (nombre exact de colonnes, titres des colonnes, noms des phases, style de chaque cellule) et produire une fiche STRICTEMENT IDENTIQUE dans sa structure. Seul le contenu pédagogique change. Ton format par défaut est ANNULÉ.\n---\n\n` });
      parts.push({
        inlineData: { mimeType: _didacExempleMime || 'application/pdf', data: _didacExempleBase64 }
      });
    }

    let sysPrompt = DIDACTIQUE_SYSTEM_PROMPT;
    const langInstruction = getOutputLanguageInstruction(cfg.outputLanguage || 'fr');
    if (langInstruction) {
      sysPrompt = langInstruction + '\n\n' + sysPrompt;
    }

    // Inject CLONING rule if example is present
    if (_didacExempleBase64 || (cfg.exemple && cfg.exemple.length > 20)) {
      const startTag = '## (R) Format de R\u00E9ponse';
      const endTag = 'R\u00E8gles Intangibles';
      const startIndex = sysPrompt.indexOf(startTag);
      const endIndex = sysPrompt.indexOf(endTag);
      if (startIndex !== -1 && endIndex !== -1) {
        const strictCloningRule = `## (R) Format de R\u00E9ponse \u2014 CLONAGE STRICT
Une fiche exemple a \u00E9t\u00E9 fournie. Tu DOIS ABSOLUMENT cloner son format (nombre de colonnes, titres, style, disposition, phases) et IGNORER ton format par d\u00E9faut \u00E0 8 colonnes. Le squelette de la fiche g\u00E9n\u00E9r\u00E9e doit \u00EAtre visuellement et structurellement IDENTIQUE \u00E0 l'exemple. Seul le contenu p\u00E9dagogique change.
Ta r\u00E9ponse FINALE DOIT \u00CAtre PLAC\u00C9E UNIQUEMENT DANS LA BALISE <reponse_finale>. Ne g\u00E9n\u00E8re RIEN en dehors de cette balise.
Avant la balise <reponse_finale>, g\u00E9n\u00E8re imp\u00E9rativement une balise [FORMAT D\u00C9TECT\u00C9 : ...] r\u00E9sumant le format de l'exemple que tu vas cloner.\n\n`;
        sysPrompt = sysPrompt.substring(0, startIndex) + strictCloningRule + sysPrompt.substring(endIndex);
      }
    }
  
    if (_didacDirectivesText && !_didacDirectivesBase64) {
      sysPrompt = `<directives_pedagogiques_prioritaires>\nCes directives sont OBLIGATOIRES et doivent être appliquées dans TOUTE la fiche, pour chaque phase, chaque tâche et chaque remédiation :\n${_didacDirectivesText}\n</directives_pedagogiques_prioritaires>\n\n` + sysPrompt;
    } else if (cfg.directives) {
      sysPrompt = `<directives_pedagogiques_prioritaires>\nCes directives sont OBLIGATOIRES et doivent être appliquées dans TOUTE la fiche, pour chaque phase, chaque tâche et chaque remédiation :\n${cfg.directives}\n</directives_pedagogiques_prioritaires>\n\n` + sysPrompt;
    }
    if (_didacRefText && !_didacRefBase64) {
      sysPrompt += `\n\n<cadre_reference_importe>\n${_didacRefText}\n</cadre_reference_importe>`;
    }
    if (cfg.objectifs) {
      sysPrompt += `\n\n<objectifs_fournis_par_enseignant>\nVoici les objectifs spécifiques pour cette séquence, intégre-les dans ta production :\n${cfg.objectifs}\n</objectifs_fournis_par_enseignant>`;
    }

    const geminiPayload = {
      systemInstruction: { parts: [{ text: sysPrompt }] },
      contents: [{ role: 'user', parts }],
      generationConfig: { temperature: 0.35, maxOutputTokens: 65536, topP: 0.95 }
    };

    const cleanGeminiKey = state.geminiApiKey.replace(/[\r\n\s]+/g, '');
    const geminiUrl = `/api/gemini/v1beta/models/gemini-3.5-flash:generateContent?key=${cleanGeminiKey}`;

    assistantMsg.content = `🔍 Gemini analyse l'activité pour la fiche didactique...`;
    renderMessages();

    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: state.abortController.signal,
      body: JSON.stringify(geminiPayload)
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      throw new Error(`Gemini API ${geminiRes.status}: ${errText.slice(0, 500)}`);
    }

    const geminiData = await geminiRes.json();
    let geminiText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    let finishReason = geminiData?.candidates?.[0]?.finishReason || 'STOP';

    // Auto-continuation if generation was cut off (MAX_TOKENS)
    let continuationCount = 0;
    const MAX_CONTINUATIONS = 3;
    while (finishReason === 'MAX_TOKENS' && continuationCount < MAX_CONTINUATIONS && !state.abortController?.signal?.aborted) {
      continuationCount++;
      assistantMsg.content = geminiText + `\n\n*⏳ Continuation automatique (${continuationCount}/${MAX_CONTINUATIONS})…*`;
      renderMessages(true);

      // Strip heavy inlineData (PDFs/images) from continuation — only keep text parts
      const lightContents = geminiPayload.contents.map(turn => ({
        role: turn.role,
        parts: turn.parts.filter(p => p.text !== undefined)
      })).filter(turn => turn.parts.length > 0);

      const contPayload = {
        systemInstruction: geminiPayload.systemInstruction,
        contents: [
          ...lightContents,
          { role: 'model', parts: [{ text: geminiText }] },
          { role: 'user', parts: [{ text: 'Continue EXACTEMENT où tu t\'es arrêté. Ne recommence pas depuis le début. Ne répète pas ce qui a déjà été écrit. Poursuis directement la fiche.' }] }
        ],
        generationConfig: { temperature: 0.35, maxOutputTokens: 65536, topP: 0.95 }
      };

      try {
        const contRes = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: state.abortController?.signal,
          body: JSON.stringify(contPayload)
        });
        if (!contRes.ok) break;
        const contData = await contRes.json();
        const contText = contData?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        finishReason = contData?.candidates?.[0]?.finishReason || 'STOP';
        if (!contText) break;
        geminiText += contText;
      } catch(contErr) {
        console.warn('Continuation failed:', contErr);
        break;
      }
    }

    // Extract what's inside <reponse_finale> if present
    const matchReponse = geminiText.match(/<reponse_finale>([\s\S]*?)<\/reponse_finale>/i);
    if (matchReponse) {
      geminiText = matchReponse[1].trim();
    } else {
      const matchOpen = geminiText.match(/<reponse_finale>([\s\S]*)/i);
      if (matchOpen) {
        geminiText = matchOpen[1].trim();
      }
    }

    if (cfg.exportWord) {
      try {
        let textToExport = geminiText;
        if (textToExport.includes('[EXPORT_WORD]')) {
          textToExport = textToExport.replace('[EXPORT_WORD]', '').trim();
          geminiText = textToExport;
        }
        exportToWord(textToExport, `Fiche_Didactique_${cfg.discipline}.doc`);
        toast('📄 Fiche didactique exportée en Word avec succès !', 'success');
      } catch(e) {
        console.error('Export Word error:', e);
      }
    }

    if (cfg.exportHtml) {
      try {
        let textToExport = geminiText;
        if (textToExport.includes('[EXPORT_HTML]')) {
          textToExport = textToExport.replace('[EXPORT_HTML]', '').trim();
          geminiText = textToExport;
        }
        exportToHtml(textToExport, `Fiche_Didactique_${cfg.discipline}.html`);
        toast('🌐 Fiche didactique exportée en HTML avec succès !', 'success');
      } catch(e) {
        console.error('Export HTML error:', e);
      }
    }

    if (cfg.exportPdf) {
      try {
        let textToExport = geminiText;
        if (textToExport.includes('[EXPORT_PDF]')) {
          textToExport = textToExport.replace('[EXPORT_PDF]', '').trim();
          geminiText = textToExport;
        }
        exportToPdf(textToExport, `Fiche_Didactique_${cfg.discipline}.pdf`);
        toast('📕 Fiche didactique exportée en PDF avec succès !', 'success');
      } catch(e) {
        console.error('Export PDF error:', e);
      }
    }

    assistantMsg.content = geminiText;
    assistantMsg.streaming = false;
    renderMessages(true);
    hideTyping();
    await saveChat();

  } catch(e) {
    if (e.name === 'AbortError' || (e.message && e.message.includes('Aborted'))) {
      assistantMsg.content = `*— Génération de la fiche interrompue —*`;
    } else {
      assistantMsg.content = `❌ Erreur génération fiche : ${e.message}`;
    }
    assistantMsg.streaming = false;
    renderMessages(true);
    hideTyping();
  } finally {
    state.isGenerating = false;
    state.agent = _savedAgent;
    state.abortController = null;
    const sendBtn2 = $('#send-btn');
    if (sendBtn2) { sendBtn2.className = 'send-btn'; sendBtn2.innerHTML = '▶'; sendBtn2.disabled = false; }
  }
};

// ─── Sauvegarde / Chargement / Suppression du profil Didactique ───
const refreshDidactiqueSavedList = async () => {
  try {
    const allSettings = await db.getAll('settings');
    const saves = allSettings.filter(s => s.id && s.id.startsWith('didacSave_'));
    const select = $('#didac-saved-list');
    if (!select) return;
    const currentVal = select.value;
    select.innerHTML = '<option value="">— Profils sauvegardés —</option>';
    saves.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.data.name || 'Sauvegarde sans nom';
      select.appendChild(opt);
    });
    if (saves.some(s => s.id === currentVal)) select.value = currentVal;
  } catch (err) { console.error('Erreur refreshDidactiqueSavedList:', err); }
};

const saveDidactiqueConfigData = async () => {
  const name = prompt('Entrez un nom pour cette sauvegarde (ex: 2Bac SVT - Glycémie) :');
  if (!name || !name.trim()) return;
  try {
    const get = (id) => ($(`#${id}`)?.value || '');
    const configToSave = {
      name: name.trim(),
      discipline: get('didac-discipline'),
      customDiscipline: get('didac-custom-discipline'),
      niveau: get('didac-niveau'),
      filiere: get('didac-filiere'),
      option: get('didac-option'),
      outputLanguage: get('didac-output-lang'),
      cours: get('didac-cours'),
      objectifs: get('didac-objectifs'),
      exemple: get('didac-exemple'),
      exportWord: $('#didac-export-word')?.checked || false,
      _didacPdfName,
      _didacPdfBase64,
      _didacPdfMime,
      _didacRefName,
      _didacRefText,
      _didacRefBase64,
      _didacRefMime,
      _didacExempleName,
      _didacExempleBase64,
      _didacExempleMime,
      _didacDirectivesName,
      _didacDirectivesText,
      _didacDirectivesBase64,
      _didacDirectivesMime
    };
    const saveId = 'didacSave_' + Date.now();
    await db.put('settings', { id: saveId, data: configToSave });
    await refreshDidactiqueSavedList();
    toast(`Sauvegarde "${name}" réussie !`, 'success');
  } catch (err) {
    console.error('Erreur sauvegarde didactique:', err);
    toast('Erreur lors de la sauvegarde.', 'error');
  }
};

const loadDidactiqueConfigData = async () => {
  try {
    const id = $('#didac-saved-list')?.value;
    if (!id) { toast('Veuillez sélectionner un profil sauvegardé.', 'info'); return; }
    const record = await db.get('settings', id);
    if (!record || !record.data) { toast('Erreur : profil introuvable.', 'error'); return; }
    const data = record.data;
    const set = (id, val) => { if ($(`#${id}`)) $(`#${id}`).value = val || ''; };
    set('didac-discipline', data.discipline);
    set('didac-custom-discipline', data.customDiscipline);
    // Show custom discipline field if needed
    if (data.discipline === 'Autre') {
      const grp = $('#didac-custom-discipline-group');
      if (grp) grp.style.display = 'block';
    }
    set('didac-niveau', data.niveau);
    set('didac-filiere', data.filiere);
    set('didac-option', data.option);
    set('didac-output-lang', data.outputLanguage);
    set('didac-cours', data.cours);
    set('didac-objectifs', data.objectifs);
    set('didac-exemple', data.exemple);
    if ($('#didac-export-word')) $('#didac-export-word').checked = data.exportWord || false;
    _didacPdfName   = data._didacPdfName   || '';
    _didacPdfBase64 = data._didacPdfBase64 || null;
    _didacPdfMime   = data._didacPdfMime   || '';
    _didacRefName   = data._didacRefName   || '';
    _didacRefText   = data._didacRefText   || '';
    _didacRefBase64 = data._didacRefBase64 || null;
    _didacRefMime   = data._didacRefMime   || '';
    _didacExempleName   = data._didacExempleName   || '';
    _didacExempleBase64 = data._didacExempleBase64 || null;
    _didacExempleMime   = data._didacExempleMime   || '';
    _didacDirectivesName   = data._didacDirectivesName   || '';
    _didacDirectivesText   = data._didacDirectivesText   || '';
    _didacDirectivesBase64 = data._didacDirectivesBase64 || null;
    _didacDirectivesMime   = data._didacDirectivesMime   || '';
    // Restaurer textarea directives
    if (data.directives && $('#didac-directives')) $('#didac-directives').value = data.directives || '';
    if (_didacDirectivesBase64 && $('#didac-directives-badge')) {
      $('#didac-directives-badge').textContent = `📀 ${_didacDirectivesName} (Mémoire)`;
      $('#didac-directives-badge').style.display = 'inline-block';
      if ($('#didac-directives-info')) $('#didac-directives-info').style.display = 'block';
    } else {
      if ($('#didac-directives-badge')) $('#didac-directives-badge').style.display = 'none';
      if ($('#didac-directives-info'))  $('#didac-directives-info').style.display  = 'none';
    }
    if (_didacPdfBase64 && $('#didac-pdf-badge')) {
      $('#didac-pdf-badge').textContent = `📎 ${_didacPdfName} (Mémoire)`;
      $('#didac-pdf-badge').style.display = 'inline-block';
      const info = $('#didac-pdf-info');
      if (info) { info.innerHTML = `✅ PDF chargé depuis la mémoire : <strong>${_didacPdfName}</strong>`; info.style.display = 'block'; }
    } else {
      if ($('#didac-pdf-badge')) $('#didac-pdf-badge').style.display = 'none';
      if ($('#didac-pdf-info'))  $('#didac-pdf-info').style.display  = 'none';
    }
    if (_didacRefBase64 && $('#didac-ref-badge')) {
      $('#didac-ref-badge').textContent = `📝 ${_didacRefName} (Mémoire)`;
      $('#didac-ref-badge').style.display = 'inline-block';
    } else {
      if ($('#didac-ref-badge')) $('#didac-ref-badge').style.display = 'none';
    }
    if (_didacExempleBase64 && $('#didac-exemple-badge')) {
      $('#didac-exemple-badge').textContent = `📄 ${_didacExempleName} (Mémoire)`;
      $('#didac-exemple-badge').style.display = 'inline-block';
      if ($('#didac-exemple-info')) $('#didac-exemple-info').style.display = 'block';
    } else {
      if ($('#didac-exemple-badge')) $('#didac-exemple-badge').style.display = 'none';
      if ($('#didac-exemple-info'))  $('#didac-exemple-info').style.display = 'none';
    }
    toast(`Profil "${data.name}" chargé avec succès !`, 'success');
  } catch (err) {
    console.error('Erreur chargement didactique:', err);
    toast('Erreur lors du chargement.', 'error');
  }
};

const deleteDidactiqueConfigData = async () => {
  try {
    const id = $('#didac-saved-list')?.value;
    if (!id) { toast('Veuillez sélectionner un profil à supprimer.', 'info'); return; }
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce profil ?')) return;
    await db.delete('settings', id);
    await refreshDidactiqueSavedList();
    toast('Profil supprimé.', 'info');
  } catch (err) {
    console.error('Erreur suppression didactique:', err);
    toast('Erreur lors de la suppression.', 'error');
  }
};

document.removeEventListener('do-save-didactique-config',   window._didacSaveHandler);
document.removeEventListener('do-load-didactique-config',   window._didacLoadHandler);
document.removeEventListener('do-delete-didactique-config', window._didacDeleteHandler);
window._didacSaveHandler   = saveDidactiqueConfigData;
window._didacLoadHandler   = loadDidactiqueConfigData;
window._didacDeleteHandler = deleteDidactiqueConfigData;
document.addEventListener('do-save-didactique-config',   window._didacSaveHandler);
document.addEventListener('do-load-didactique-config',   window._didacLoadHandler);
document.addEventListener('do-delete-didactique-config', window._didacDeleteHandler);

// Init saved list when modal opens
const _origOpenDidactique = openDidactiqueModal;
// Refresh list on next tick after DOM is ready
setTimeout(() => refreshDidactiqueSavedList(), 500);

// Inject file listeners inside an IIFE to keep scope clean
(() => {
  // Didactique Modal wiring
  if ($('#open-didactique-modal'))  $('#open-didactique-modal').onclick = openDidactiqueModal;
  if ($('#close-didactique-modal')) $('#close-didactique-modal').onclick = closeDidactiqueModal;
  if ($('#didactique-modal'))       $('#didactique-modal').onclick = e => { if (e.target === $('#didactique-modal')) closeDidactiqueModal(); };

  if ($('#didac-pdf-upload')) {
    $('#didac-pdf-upload').onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const badge     = $('#didac-pdf-badge');
      const info      = $('#didac-pdf-info');
      const removeBtn = $('#didac-pdf-remove');
      const coursEl   = $('#didac-cours');
      const isPdfOrImg = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf') || file.type.startsWith('image/');
      if (isPdfOrImg) {
        if (badge) { badge.textContent = `⏳ ${file.name} — Lecture en cours…`; badge.style.display = 'inline-block'; }
        const reader = new FileReader();
        reader.onload = (ev) => {
          _didacPdfBase64 = ev.target.result.split(',')[1];
          _didacPdfName = file.name;
          _didacPdfMime = file.type || 'application/pdf';
          if (badge) { badge.textContent = `📄 ${file.name} (Prêt)`; badge.style.display = 'inline-block'; }
          if (info) info.style.display = 'block';
          if (removeBtn) removeBtn.style.cssText = 'display:inline-flex;';
          if (coursEl) { coursEl.value = `[DOCUMENT ATTACHÉ: ${file.name}]\nSera analysé nativement par Gemini.`; coursEl.style.opacity = '1'; }
          toast(`✅ ${file.name} importé avec succès.`, 'success');
        };
        reader.readAsDataURL(file);
      } else {
        const reader = new FileReader();
        reader.onload = (ev) => {
          if (coursEl) { coursEl.value = ev.target.result.trim(); coursEl.style.opacity = '1'; }
          _didacPdfBase64 = null;
          _didacPdfName = file.name;
          if (badge) { badge.textContent = `📝 ${file.name}`; badge.style.display = 'inline-block'; }
          if (info)  info.style.display = 'block';
          if (removeBtn) removeBtn.style.cssText = 'display:inline-flex;';
          toast('✅ Fichier texte importé.', 'success');
        };
        reader.readAsText(file, 'UTF-8');
      }
      e.target.value = '';
    };
  }

  if ($('#didac-ref-upload')) {
    $('#didac-ref-upload').onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const badge     = $('#didac-ref-badge');
      const removeBtn = $('#didac-ref-remove');
      const competEl  = $('#didac-objectifs');
      const isPdfOrImg = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf') || file.type.startsWith('image/');
      if (isPdfOrImg) {
        if (badge) { badge.textContent = `⏳ ${file.name} — Lecture…`; badge.style.display = 'inline-block'; }
        const reader = new FileReader();
        reader.onload = (ev) => {
          _didacRefName = file.name;
          _didacRefMime = file.type || 'application/pdf';
          const dataUrl = ev.target.result;
          _didacRefBase64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
          _didacRefText = '';
          if (competEl) competEl.value += `\n\n[CADRE PDF: ${file.name}]`;
          if (badge) { badge.textContent = `📄 ${file.name} (Prêt)`; badge.style.display = 'inline-block'; }
          if (removeBtn) removeBtn.style.cssText = 'display:inline-flex;';
          toast(`✅ Cadre de réf. ${file.name} importé.`, 'success');
        };
        reader.readAsDataURL(file);
      } else {
        const reader = new FileReader();
        reader.onload = (ev) => {
          _didacRefName = file.name;
          _didacRefText = ev.target.result.trim();
          if (competEl) competEl.value += '\n\n' + _didacRefText;
          if (badge) { badge.textContent = `📝 ${file.name}`; badge.style.display = 'inline-block'; }
          if (removeBtn) removeBtn.style.cssText = 'display:inline-flex;';
          toast(`✅ Cadre texte importé.`, 'success');
        };
        reader.readAsText(file, 'UTF-8');
      }
      e.target.value = '';
    };
  }

  if ($('#didac-exemple-upload')) {
    $('#didac-exemple-upload').onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const badge     = $('#didac-exemple-badge');
      const infoEl    = $('#didac-exemple-info');
      const removeBtn = $('#didac-exemple-remove');
      const exemplEl  = $('#didac-exemple');
      const isPdfOrImg = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf') || file.type.startsWith('image/');

      if (isPdfOrImg) {
        if (badge) { badge.textContent = `⏳ ${file.name} — Lecture…`; badge.style.display = 'inline-block'; }
        const reader = new FileReader();
        reader.onload = (ev) => {
          _didacExempleName   = file.name;
          _didacExempleMime   = file.type || 'application/pdf';
          const dataUrl = ev.target.result;
          _didacExempleBase64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
          if (exemplEl) { exemplEl.value = `[FICHE EXEMPLE PDF : ${file.name}]\nSera analysée nativement par Gemini comme modèle de style.`; }
          if (badge) { badge.textContent = `📄 ${file.name} (Prêt)`; badge.style.display = 'inline-block'; }
          if (infoEl) infoEl.style.display = 'block';
          if (removeBtn) removeBtn.style.cssText = 'display:inline-flex;';
          toast(`✅ Fiche exemple "${file.name}" importée. L'IA l'utilisera comme modèle.`, 'success');
        };
        reader.readAsDataURL(file);
      } else {
        const reader = new FileReader();
        reader.onload = (ev) => {
          _didacExempleName   = file.name;
          _didacExempleBase64 = null;
          _didacExempleMime   = '';
          const txt = ev.target.result.trim();
          if (exemplEl) exemplEl.value = txt;
          if (badge) { badge.textContent = `📝 ${file.name}`; badge.style.display = 'inline-block'; }
          if (infoEl) infoEl.style.display = 'block';
          if (removeBtn) removeBtn.style.cssText = 'display:inline-flex;';
          toast(`✅ Fiche exemple texte importée.`, 'success');
        };
        reader.readAsText(file, 'UTF-8');
      }
      e.target.value = '';
    };
  }

  if ($('#didac-directives-upload')) {
    $('#didac-directives-upload').onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const badge     = $('#didac-directives-badge');
      const infoEl    = $('#didac-directives-info');
      const removeBtn = $('#didac-directives-remove');
      const taEl      = $('#didac-directives');
      const isPdfOrImg = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf') || file.type.startsWith('image/');

      if (isPdfOrImg) {
        if (badge) { badge.textContent = `⏳ ${file.name} — Lecture…`; badge.style.display = 'inline-block'; }
        const reader = new FileReader();
        reader.onload = (ev) => {
          _didacDirectivesName   = file.name;
          _didacDirectivesMime   = file.type || 'application/pdf';
          _didacDirectivesText   = '';
          const dataUrl = ev.target.result;
          _didacDirectivesBase64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
          if (taEl) taEl.value = `[DIRECTIVES PDF : ${file.name}]\nSeront analysées nativement par Gemini et appliquées en priorité.`;
          if (badge) { badge.textContent = `📄 ${file.name} (Prêt)`; badge.style.display = 'inline-block'; }
          if (infoEl) infoEl.style.display = 'block';
          if (removeBtn) removeBtn.style.cssText = 'display:inline-flex;';
          toast(`✅ Directives "${file.name}" importées. L'IA les appliquera comme contraintes prioritaires.`, 'success');
        };
        reader.readAsDataURL(file);
      } else {
        const reader = new FileReader();
        reader.onload = (ev) => {
          _didacDirectivesName   = file.name;
          _didacDirectivesBase64 = null;
          _didacDirectivesMime   = '';
          _didacDirectivesText   = ev.target.result.trim();
          if (taEl) taEl.value = _didacDirectivesText;
          if (badge) { badge.textContent = `📝 ${file.name}`; badge.style.display = 'inline-block'; }
          if (infoEl) infoEl.style.display = 'block';
          if (removeBtn) removeBtn.style.cssText = 'display:inline-flex;';
          toast(`✅ Directives texte importées.`, 'success');
        };
        reader.readAsText(file, 'UTF-8');
      }
      e.target.value = '';
    };
  }

  // ── Boutons ✕ Supprimer fichier — Didactique ───────────────────────────
  if ($('#didac-pdf-remove')) {
    $('#didac-pdf-remove').onclick = () => {
      _didacPdfBase64 = null; _didacPdfName = ''; _didacPdfMime = '';
      const coursEl = $('#didac-cours');
      if (coursEl && coursEl.value.startsWith('[DOCUMENT ATTACHÉ:')) coursEl.value = '';
      const badge = $('#didac-pdf-badge'); if (badge) badge.style.display = 'none';
      const info  = $('#didac-pdf-info');  if (info)  info.style.display  = 'none';
      $('#didac-pdf-remove').style.display = 'none';
      toast('🗑️ Fichier cours supprimé.', 'info');
    };
  }
  if ($('#didac-ref-remove')) {
    $('#didac-ref-remove').onclick = () => {
      _didacRefBase64 = null; _didacRefName = ''; _didacRefText = '';
      const badge = $('#didac-ref-badge'); if (badge) badge.style.display = 'none';
      $('#didac-ref-remove').style.display = 'none';
      toast('🗑️ Cadre de référence supprimé.', 'info');
    };
  }
  if ($('#didac-exemple-remove')) {
    $('#didac-exemple-remove').onclick = () => {
      _didacExempleName = ''; _didacExempleBase64 = null; _didacExempleMime = '';
      const exemplEl = $('#didac-exemple'); if (exemplEl) exemplEl.value = '';
      const badge = $('#didac-exemple-badge'); if (badge) badge.style.display = 'none';
      const info  = $('#didac-exemple-info');  if (info)  info.style.display  = 'none';
      $('#didac-exemple-remove').style.display = 'none';
      toast('🗑️ Fiche exemple supprimée.', 'info');
    };
  }
  if ($('#didac-directives-remove')) {
    $('#didac-directives-remove').onclick = () => {
      _didacDirectivesName = ''; _didacDirectivesBase64 = null; _didacDirectivesMime = ''; _didacDirectivesText = '';
      const taEl = $('#didac-directives'); if (taEl) taEl.value = '';
      const badge = $('#didac-directives-badge'); if (badge) badge.style.display = 'none';
      const info  = $('#didac-directives-info');  if (info)  info.style.display  = 'none';
      $('#didac-directives-remove').style.display = 'none';
      toast('🗑️ Directives supprimées.', 'info');
    };
  }
})();

window.didactiqueValidateStep1 = didactiqueValidateStep1;
window.didactiqueValidateStep2 = didactiqueValidateStep2;
window.didactiqueShowStep = didactiqueShowStep;
window.didactiqueBuildSummary = didactiqueBuildSummary;
window.openDidactiqueModal = openDidactiqueModal;
window.closeDidactiqueModal = closeDidactiqueModal;
window.generateDidactiqueSheet = generateDidactiqueSheet;


// ==============================================================================
// === HELPER : INSTRUCTION DE LANGUE DE SORTIE =================================
// ==============================================================================

/**
 * Retourne une instruction forte demandant à l'IA de générer sa réponse
 * dans la langue spécifiée.
 * @param {'fr'|'en'|'ar'} lang - code langue
 * @returns {string} instruction à injecter dans le prompt
 */
function getOutputLanguageInstruction(lang) {
  if (lang === 'ar') {
    return `
⚠️ تعليمة اللغة (إلزامية - MANDATORY LANGUAGE INSTRUCTION):
يجب أن تكتب إجابتك الكاملة باللغة العربية الفصحى.
جميع العناوين والتفسيرات والأمثلة والجداول والمحتويات يجب أن تكون باللغة العربية.
اتجاه الكتابة: من اليمين إلى اليسار (RTL).
لا تستخدم الفرنسية أو الإنجليزية إلا للمصطلحات العلمية التي لا ترجمة عربية شائعة لها (بين قوسين).
`;
  }
  if (lang === 'en') {
    return `
⚠️ MANDATORY LANGUAGE INSTRUCTION:
You MUST write the ENTIRE response in ENGLISH.
All titles, headings, explanations, examples, tables, and content must be in English.
Do not use French in the output. Only use French terms when they are proper nouns or have no English equivalent (in parentheses).
`;
  }
  // 'fr' ou défaut — aucune instruction supplémentaire
  return '';
}

// ==============================================================================
// === FICHE MÉTHODE ============================================================
// ==============================================================================

const METHODE_SYSTEM_PROMPT = `<system_instructions>

# RÔLE ET CONTEXTE

Tu es un « Tuteur Pédagogique et Évaluateur par Compétences ». Tu es un expert en pédagogie et en didactique, capable de t'adapter à n'importe quelle discipline et à n'importe quel public. Ton comportement, ton langage et tes références sont entièrement pilotés par la matière scolaire précisée et les instructions que l'utilisateur te fournit dans le prompt.

# OBJECTIF

Tu dois fournir une aide structurée en 3 étapes pour chaque tâche d'un exercice. L'objectif ultime est d'enseigner une méthode de travail rigoureuse qui aligne la résolution de la tâche avec les compétences officielles du cadre de référence fourni par l'utilisateur.

# FORMAT DE SORTIE (MARKDOWN STRICT)

Pour chaque tâche demandée, produis ta réponse en suivant impérativement la structure et les contraintes ci-dessous. Tu dois utiliser ce modèle exact (titres, puces, numéros) :

---
### Tâche [Numéro] : [Intitulé de la tâche]

#### 1. Travail sur Brouillon
• **Reformulation et simplification de la question** : [Texte simple et adapté au niveau]
• **Verbes d'action Clés** : Quels sont les verbes qui disent ce qu'il faut faire ? (Ex: Comparer, Calculer, Décrire...).
• **Documents à Utiliser** : Liste les numéros des documents ou graphiques utiles.
• **Infos Clés à Extraire** : Liste à puces, style télégraphique (mots-clés, chiffres, ↑, ↓, Cause -> Effet). PAS de phrases.
• **Mini-plan** : Structure logique très simple pour la réponse à cette tâche (3 à 5 étapes).

#### 2. Du Brouillon au Propre (Le Guide Méthodologique)
• **Comment Construire tes Phrases** : Montre, avec un exemple simple tiré du brouillon, comment transformer une note en une phrase rédigée correcte.
• **Compétence Scientifique Travaillée (Objectif Méthodologique)** :
  1. Identifie la compétence principale mobilisée par la tâche, en te basant sur le <référentiel_compétences>.
  2. Annonce clairement à l'élève la compétence qu'il travaille. Exemple : "Pour cette question, tu vas travailler la compétence : '[Nom de la compétence]'."
  3. Donne UN seul conseil méthodologique crucial et simple pour réussir cette compétence spécifique.
• **L'Erreur à Ne Pas Faire** : Identifie UNE seule erreur très fréquente et pertinente pour cette tâche, et explique simplement comment l'éviter.

#### 3. Réponse Modèle
[Rédige ici la réponse finale parfaite pour la tâche en appliquant ces règles :]
• **Clarté et Simplicité** : Respecte le niveau de langue cible (phrases courtes, un ou deux connecteurs logiques maximum par phrase).
• **Rigueur Scientifique** : Vocabulaire précis et réponse structurée.
• **Justification Systématique** : Chaque information doit être justifiée par sa source ("Le document 1 montre que...", "(Graphique 2)").
• **Pertinence** : Réponds uniquement à la tâche demandée.
---

# PROCESSUS DE RÉFLEXION OBLIGATOIRE (CHAÎNE DE RAISONNEMENT)

Avant de générer la réponse finale détaillée selon le modèle ci-dessus, tu dois effectuer une réflexion interne exhaustive dans une balise <brouillon_invisible>. Cette réflexion doit suivre scrupuleusement ces étapes :
1. **Décodage de la tâche** : Analyser la question. Quel est le sujet ? Quel est le verbe d'action principal ? À quel domaine du référentiel se rattache-t-elle ?
2. **Analyse des ressources** : Examiner les documents, graphiques ou données fournis. Quelles informations sont pertinentes ?
3. **Planification de la structure** : Déterminer l'ordre logique de la réponse.
4. **Identification des compétences** : Mettre en correspondance la tâche avec le référentiel.
5. **Brouillon mental** : Identifier le conseil méthodologique et l'erreur à éviter.

# CONTRAINTES NÉGATIVES ET GARDE-FOUS (NON-NÉGOCIABLES)

- **Interdiction d'hallucination** : Ne JAMAIS inventer d'informations. Base-toi UNIQUEMENT sur les ressources fournies.
- **Interdiction de jargon non défini** : Adapte ton vocabulaire au niveau de la cible défini.
- **Interdiction de divagation** : Ne donne pas d'informations hors-sujet. Ta réponse doit être strictement limitée à la tâche.
</system_instructions>`;

const buildMethodeUserPrompt = (cfg) => {
  const langInstruction = getOutputLanguageInstruction(cfg.outputLanguage || 'fr');
  let p = `<user_prompt>
${langInstruction ? langInstruction + '\n---\n' : ''}
# CRÉATION DE VOTRE TUTEUR PÉDAGOGIQUE PERSONNALISÉ

## 1. CONTEXTE GÉNÉRAL
- **Matière / Discipline** : ${cfg.discipline}
- **Niveau du public** : ${cfg.niveau}
- **Niveau de langue de l'élève** : ${cfg.niveauLangue}
- **Langue de génération de la fiche** : ${cfg.outputLanguage === 'ar' ? 'العربية' : cfg.outputLanguage === 'en' ? 'English' : 'Français'}

## 2. RÔLE ET EXPERTISE DE L'IA
${cfg.role}

## 3. RÉFÉRENTIEL DE COMPÉTENCES (Officiel)
${cfg.competences || '[Non fourni — proposer des compétences adaptées à la discipline]'}

## 4. DONNÉES D'ENTRÉE (L'EXERCICE)
- **Tâches / Questions de l'élève** :
${cfg.exercice}

- **Ressources fournies** :
${cfg.hasPdf ? '[PDF/Image joint en pièce jointe]' : 'Aucune ressource documentaire supplémentaire'}

## 5. STYLE ET TON
${cfg.directives || 'Style d\'écriture clair, pédagogique et structuré. Ton encourageant et patient.'}

## 6. EXEMPLES (FEW-SHOT) - MODÈLES DE RÉFÉRENCE
`;

  if (cfg.exemple) {
    p += `Voici l'exemple de fiche de référence fourni par l'utilisateur :\n${cfg.exemple}\n\n`;
  } else {
    p += `
---

**EXEMPLE 1 : Sciences de la Vie et de la Terre (Électrophorèse)**
- **Tâche** : "Le document 1 présente les résultats d'une électrophorèse de trois molécules d'ADN (A, B et C). Comparez les vitesses de migration de ces molécules. Expliquez la différence de vitesse observée en justifiant votre réponse."
- **Ressources** : Document 1 : Image d'un gel d'électrophorèse.
- **Réponse du tuteur** :

<brouillon_invisible>
- Tâche: Comparer vitesse, Expliquer différence avec justification.
- Docs: Document 1 (gel).
- Plan: 1. Décrire bandes, 2. Loi migration (charge/taille), 3. Conclusion.
- Compétence: Analyser des résultats.
</brouillon_invisible>

---
### Tâche 1 : Comparaison et explication des vitesses de migration (Électrophorèse)

#### 1. Travail sur Brouillon
• **Reformulation et simplification de la question** : Il faut regarder le gel, comparer où se trouvent les bandes d'ADN (A, B et C) et expliquer pourquoi elles sont à des endroits différents.
• **Verbes d'action Clés** : Comparer, Expliquer, Justifier.
• **Documents à Utiliser** : Document 1.
• **Infos Clés à Extraire** :
  - Bande A : en haut (près du puits).
  - Bande B : au milieu.
  - Bande C : en bas (loin du puits).
  - L'ADN migre vers le + (pôle positif).
  - Relation : Plus l'ADN est court/léger, plus il migre vite et loin.
• **Mini-plan** :
  1. Décrire la position des bandes (ordre).
  2. Expliquer le principe : l'ADN chargé négativement migre vers le +.
  3. Conclure : C migre le plus vite car il est le plus court.

#### 2. Du Brouillon au Propre (Le Guide Méthodologique)
• **Comment Construire tes Phrases** : 
  - Note du brouillon : "Bande C en bas"
  - Phrase rédigée : "La bande C est située en bas du gel, c'est-à-dire la plus éloignée du point de dépôt."
• **Compétence Scientifique Travaillée (Objectif Méthodologique)** :
  1. Compétence : Raisonnement scientifique et communication écrite.
  2. Pour cette question, tu vas travailler la compétence : 'Analyser et interpréter des résultats expérimentaux'.
  3. **Conseil** : Ne te contente pas de décrire. Il faut absolument lier la position de la bande à une propriété de l'ADN (sa taille) et au principe physique (migration vers le +).
• **L'Erreur à Ne Pas Faire** : Confondre la vitesse et la position. Beaucoup d'élèves disent "C est en bas, donc il est plus lent". N'oublie pas : plus la bande est loin du point de départ, plus la molécule a migré rapidement. L'ordre de migration est : C > B > A.

#### 3. Réponse Modèle
Les résultats de l'électrophorèse (Document 1) montrent que les trois molécules d'ADN A, B et C ont des vitesses de migration différentes. La molécule C a migré le plus loin (elle est en bas), la molécule B a une migration intermédiaire, et la molécule A est restée près du point de dépôt (elle est en haut).

Cette différence de vitesse s'explique par la taille des molécules. L'ADN est chargé négativement, il migre donc vers le pôle positif (+) du gel. Cependant, le gel agit comme un tamis : les petites molécules (courtes) passent plus facilement à travers les mailles du gel et migrent donc plus vite et plus loin que les grandes molécules (longues). Par conséquent, la molécule C est la plus courte, la molécule B est de taille intermédiaire et la molécule A est la plus longue.
---

**EXEMPLE 2 : Mathématiques (Résolution d'équation du second degré)**
- **Tâche** : "Résoudre dans R l'équation suivante : 2x² - 5x + 2 = 0."
- **Réponse du tuteur** :

<brouillon_invisible>
- Tâche: Trouver x.
- Outil: Discriminant.
- Étapes: a, b, c -> Δ -> racines.
</brouillon_invisible>

---
### Tâche 1 : Résolution de l'équation du second degré

#### 1. Travail sur Brouillon
• **Reformulation et simplification de la question** : Il faut trouver les valeurs de x qui rendent l'équation vraie.
• **Verbes d'action Clés** : Résoudre, Calculer.
• **Documents à Utiliser** : Aucun document fourni. Connaissances sur le discriminant.
• **Infos Clés à Extraire** :
  - Forme : ax² + bx + c = 0, avec a=2, b=-5, c=2.
  - Calcul du discriminant : Δ = (-5)² - 4*2*2 = 25 - 16 = 9.
  - Δ > 0, donc 2 solutions.
  - Formules : x₁ = (-b - √Δ) / 2a, x₂ = (-b + √Δ) / 2a.
• **Mini-plan** :
  1. Identifier a, b et c.
  2. Calculer le discriminant Δ.
  3. Appliquer les formules pour trouver x₁ et x₂.

#### 2. Du Brouillon au Propre (Le Guide Méthodologique)
• **Comment Construire tes Phrases** : 
  - Note du brouillon : "Δ = 9, Δ > 0, 2 solutions."
  - Phrase rédigée : "Le discriminant est égal à 9. Comme il est positif, l'équation admet deux solutions réelles distinctes."
• **Compétence Scientifique Travaillée (Objectif Méthodologique)** :
  1. Compétence : Résoudre des équations et inéquations.
  2. Pour cette question, tu vas travailler la compétence : 'Appliquer une méthode de résolution structurée'.
  3. **Conseil** : Applique toujours la méthode en 3 étapes : 1) Identifier a, b, c, 2) Calculer Δ, 3) Appliquer la formule. Ne saute pas d'étape.
• **L'Erreur à Ne Pas Faire** : Oublier de calculer le discriminant et passer directement à la factorisation au hasard. Calcule toujours Δ en premier.

#### 3. Réponse Modèle
L'équation 2x² - 5x + 2 = 0 est une équation du second degré de la forme ax² + bx + c = 0.
On identifie : a = 2, b = -5, c = 2.
On calcule le discriminant Δ = b² - 4ac = (-5)² - 4*2*2 = 25 - 16 = 9.
Comme Δ > 0, l'équation admet deux solutions réelles distinctes :
x₁ = (-b - √Δ) / (2a) = (5 - 3) / 4 = 2/4 = 1/2.
x₂ = (-b + √Δ) / (2a) = (5 + 3) / 4 = 8/4 = 2.
L'ensemble des solutions est S = {1/2 ; 2}.
---
`;
  }

  p += `\n</user_prompt>`;
  return p;
};

let _methodePdfBase64 = null;
let _methodePdfName = '';
let _methodePdfMime = '';

let _methodeRefName   = '';
let _methodeRefText   = '';
let _methodeRefBase64 = null;
let _methodeRefMime   = '';

let _methodeExempleName   = '';
let _methodeExempleBase64 = null;
let _methodeExempleMime   = '';
let _methodeExempleText   = '';

const methodeValidateStep1 = () => {
  const disc = $('#methode-discipline')?.value;
  const niv = $('#methode-niveau')?.value;
  const role = $('#methode-role')?.value?.trim();
  if (!disc) { toast('Veuillez choisir une discipline.', 'error'); return false; }
  if (!niv) { toast('Veuillez choisir un niveau scolaire.', 'error'); return false; }
  if (!role || role.length < 5) { toast('Veuillez renseigner le rôle de l\'IA.', 'error'); return false; }
  return true;
};

const methodeValidateStep2 = () => {
  if (_methodePdfBase64) return true;
  const exo = $('#methode-exercice')?.value?.trim();
  if (!exo || exo.length < 10) { toast('Veuillez saisir l\'exercice ou importer un fichier.', 'error'); return false; }
  return true;
};

const methodeShowStep = (step) => {
  document.querySelectorAll('#methode-modal .corr-step').forEach(el => el.style.display = 'none');
  const target = document.getElementById('methode-step-' + step);
  if (target) target.style.display = 'block';

  const labels = ['Contexte général', 'L\'Exercice / Problème', 'Référentiel & Modèles', 'Résumé & Génération'];
  if ($('#methode-step-label')) $('#methode-step-label').textContent = labels[step-1];

  for (let i = 1; i <= 4; i++) {
    const dot = $('#mdot-'+i);
    const line = $('#mline-'+(i-1));
    if (!dot) continue;
    dot.classList.remove('active', 'done');
    if (line) line.classList.remove('done');
    
    if (i < step) { dot.classList.add('done'); if(line) line.classList.add('done'); }
    else if (i === step) { dot.classList.add('active'); if(line) line.classList.add('done'); }
  }
};

const methodeBuildSummary = () => {
  const get = (id) => ($(`#${id}`)?.value || '').trim();
  const discipline = get('methode-discipline') === 'Autre' ? (get('methode-custom-discipline') || 'Autre') : get('methode-discipline');
  const exoPreview = get('methode-exercice').slice(0, 120) + (get('methode-exercice').length > 120 ? '…' : '');
  const classeStr = `${get('methode-niveau') || '—'} ${get('methode-filiere') && !get('methode-filiere').includes('Aucune') ? ' - ' + get('methode-filiere') : ''} ${get('methode-option') && !get('methode-option').includes('Générale') ? '(' + get('methode-option') + ')' : ''}`.replace(/\s+/g, ' ').trim();
  const html = `
    <div style="display:grid;gap:6px">
      <div><span style="color:var(--text-dim)">📚 Discipline :</span> <strong style="color:var(--cyan)">${discipline || '—'}</strong></div>
      <div><span style="color:var(--text-dim)">🎓 Classe :</span> <strong style="color:var(--neon)">${classeStr}</strong></div>
      <div><span style="color:var(--text-dim)">✍️ Exercice (Extrait) :</span> <em style="color:var(--text-dim);font-size:11px">${exoPreview || '—'}</em></div>
      <div><span style="color:var(--text-dim)">🎯 Compétences définies :</span> ${get('methode-competences') ? '<span style="color:#34d399">✓ Oui</span>' : '<span style="color:#f59e0b">⚠ Non (l\'IA en déduira)</span>'}</div>
      <div><span style="color:var(--text-dim)">📎 Exemple modèle :</span> ${(get('methode-exemple') || _methodeExempleBase64) ? '<span style="color:#f59e0b">✓ Fourni</span>' : '<span style="color:var(--text-dim)">⚠ Aucun (exemples par défaut)</span>'}</div>
    </div>`;
  const summaryEl = $('#methode-summary');
  if (summaryEl) summaryEl.innerHTML = html;
};

const openMethodeModal = async () => {
  const geminiId = "gemini-3.5-flash";
  if (state.model !== geminiId) {
    state.model = geminiId;
    if ($('#model-select')) $('#model-select').value = geminiId;
    if (typeof db !== 'undefined' && db.put) {
      db.put('settings', { id: 'model', value: state.model }).catch(() => {});
    }
  }

  // Restaurer la config
  try {
    const saved = localStorage.getItem('methodeSavedConfig');
    if (saved) {
      const s = JSON.parse(saved);
      if (s.discipline) $('#methode-discipline').value = s.discipline;
      if (s.customDiscipline) $('#methode-custom-discipline').value = s.customDiscipline;
      if (s.niveau) $('#methode-niveau').value = s.niveau;
      if (s.niveauLangue) $('#methode-niveau-langue').value = s.niveauLangue;
      if (s.role) $('#methode-role').value = s.role;
      if (s.competences) $('#methode-competences').value = s.competences;
      if (s.directives) $('#methode-directives').value = s.directives;
      if (s.exemple) $('#methode-exemple').value = s.exemple;
      if (s.outputLanguage) $('#methode-output-lang').value = s.outputLanguage;
      if ($('#methode-export-word')) $('#methode-export-word').checked = !!s.exportWord;
      if ($('#methode-export-html')) $('#methode-export-html').checked = !!s.exportHtml;
      if ($('#methode-export-pdf')) $('#methode-export-pdf').checked = !!s.exportPdf;
    }
  } catch(e) {}

  if (_methodePdfBase64) {
    if ($('#methode-pdf-badge')) {
      $('#methode-pdf-badge').textContent = `📎 ${_methodePdfName} (Mémoire)`;
      $('#methode-pdf-badge').style.display = 'inline-block';
    }
  } else {
    if ($('#methode-pdf-badge')) $('#methode-pdf-badge').style.display = 'none';
  }

  if (_methodeExempleBase64 && $('#methode-exemple-badge')) {
    $('#methode-exemple-badge').textContent = `📄 ${_methodeExempleName} (Mémoire)`;
    $('#methode-exemple-badge').style.display = 'inline-block';
  } else {
    if ($('#methode-exemple-badge')) $('#methode-exemple-badge').style.display = 'none';
  }

  methodeShowStep(1);
  $('#methode-modal').classList.add('active');
};

const closeMethodeModal = () => $('#methode-modal').classList.remove('active');

const generateMethodeSheet = async () => {
  if (state.isGenerating) {
    console.warn("Génération déjà en cours.");
    return;
  }
  const get = (id) => ($(`#${id}`)?.value || '').trim();
  const discipline = get('methode-discipline') === 'Autre'
    ? (get('methode-custom-discipline') || 'Autre')
    : get('methode-discipline');
  const hasPdf = !!_methodePdfBase64;

  const cfg = {
    discipline,
    niveau:       get('methode-niveau'),
    niveauLangue: get('methode-niveau-langue'),
    outputLanguage: get('methode-output-lang'),
    role:         get('methode-role'),
    exercice:     get('methode-exercice') || (hasPdf ? `[EXERCICE EN PIÈCE JOINTE : ${_methodePdfName}]\n\nIMPORTANT : Le sujet complet se trouve dans le document PDF/image attaché à ce message.` : ''),
    competences:  get('methode-competences'),
    directives:   get('methode-directives'),
    exemple:      get('methode-exemple'),
    hasPdf,
    exportWord:   $('#methode-export-word')?.checked || false,
    exportHtml:   $('#methode-export-html')?.checked || false,
    exportPdf:    $('#methode-export-pdf')?.checked || false
  };

  if (!hasPdf && (!cfg.exercice || cfg.exercice.length < 10)) {
    toast('Veuillez coller l\'exercice ou importer un PDF.', 'error');
    return;
  }

  try {
    localStorage.setItem('methodeSavedConfig', JSON.stringify(cfg));
  } catch (e) {}

  closeMethodeModal();

  const titre = `🧠 Fiche Méthode — ${cfg.discipline} ${cfg.niveau}${hasPdf ? ' [PDF]' : ''}`;

  if (!state.messages) state.messages = [];
  state.messages.push({ role: 'user', content: titre, ts: Date.now() });
  renderMessages();

  const assistantMsg = { role: 'assistant', content: '⏳ Génération de la fiche méthode en cours…', streaming: true, ts: Date.now() + 1, modelUsed: 'gemini-3.5-flash', isCorrection: false, isMethode: true };
  state.messages.push(assistantMsg);
  renderMessages();

  const _savedAgent = state.agent;
  state.isGenerating = true;
  state.selectedWorkflow = null;
  state.agent = null;
  state.abortController = new AbortController();
  const sendBtn = $('#send-btn');
  if (sendBtn) { sendBtn.disabled = false; sendBtn.className = 'stop-btn'; sendBtn.innerHTML = '⏹ ARRÊTER'; }
  showTyping("gemini-3.5-flash");

  try {
    if (!state.geminiApiKey) {
      throw new Error('Clé API Google Gemini requise. Configurez-la dans Paramètres API.');
    }

    const userContent = buildMethodeUserPrompt(cfg);
    const parts = [{ text: userContent }];

    if (hasPdf && _methodePdfBase64) {
      parts.unshift({
        inlineData: { mimeType: _methodePdfMime || 'application/pdf', data: _methodePdfBase64 }
      });
      parts.splice(1, 0, { text: '\n\n---\n[DOCUMENT EXERCICE — RÔLE : SUJET SOURCE]\nLe document ci-dessus contient l\'exercice. Analyse son contenu pour construire la fiche méthode.\n---\n\n' });
    }

    if (_methodeRefBase64) {
      parts.push({ text: `\n\n---\n[CADRE DE RÉFÉRENCE — RÔLE : RÉFÉRENTIEL DES COMPÉTENCES]\nLe document ci-dessous est le cadre de référence pédagogique officiel. Utilise ses compétences pour remplir les balises <competence>.\n---\n\n` });
      parts.push({
        inlineData: { mimeType: _methodeRefMime || 'application/pdf', data: _methodeRefBase64 }
      });
    }

    if (_methodeExempleBase64) {
      parts.push({ text: `\n\n---\n[FICHE MODÈLE — DOCUMENT JOINT : ${_methodeExempleName}]\n⚠️ Le document ci-dessous est une fiche méthode d'exemple. Imite sa structure, son style et son niveau de détail.\n---\n\n` });
      parts.push({
        inlineData: { mimeType: _methodeExempleMime || 'application/pdf', data: _methodeExempleBase64 }
      });
    }

    let sysPrompt = METHODE_SYSTEM_PROMPT;

    if (_methodeRefText && !_methodeRefBase64) {
      sysPrompt += `\n\n<cadre_reference_importe>\n${_methodeRefText}\n</cadre_reference_importe>`;
    }

    const geminiPayload = {
      systemInstruction: { parts: [{ text: sysPrompt }] },
      contents: [{ role: 'user', parts }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 65536, topP: 0.85 }
    };

    const cleanGeminiKey = state.geminiApiKey.replace(/[\r\n\s]+/g, '');
    const geminiUrl = `/api/gemini/v1beta/models/gemini-3.5-flash:generateContent?key=${cleanGeminiKey}`;

    assistantMsg.content = `🔍 L'IA analyse votre exercice pour élaborer la fiche méthode...`;
    renderMessages();

    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: state.abortController.signal,
      body: JSON.stringify(geminiPayload)
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      throw new Error(`Gemini API ${geminiRes.status}: ${errText.slice(0, 500)}`);
    }

    const geminiData = await geminiRes.json();
    let geminiText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    let finishReason = geminiData?.candidates?.[0]?.finishReason || 'STOP';

    // Continuation
    let continuationCount = 0;
    const MAX_CONTINUATIONS = 3;
    while (finishReason === 'MAX_TOKENS' && continuationCount < MAX_CONTINUATIONS && !state.abortController?.signal?.aborted) {
      continuationCount++;
      assistantMsg.content = geminiText + `\n\n*⏳ Continuation automatique (${continuationCount}/${MAX_CONTINUATIONS})…*`;
      renderMessages(true);

      const lightContents = geminiPayload.contents.map(turn => ({
        role: turn.role,
        parts: turn.parts.filter(p => p.text !== undefined)
      })).filter(turn => turn.parts.length > 0);

      const contPayload = {
        systemInstruction: geminiPayload.systemInstruction,
        contents: [
          ...lightContents,
          { role: 'model', parts: [{ text: geminiText }] },
          { role: 'user', parts: [{ text: 'Continue EXACTEMENT où tu t\'es arrêté. Ne recommence pas depuis le début. Ne répète pas ce qui a déjà été écrit. Poursuis directement la fiche en XML.' }] }
        ],
        generationConfig: { temperature: 0.2, maxOutputTokens: 65536, topP: 0.85 }
      };

      try {
        const contRes = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: state.abortController?.signal,
          body: JSON.stringify(contPayload)
        });
        if (!contRes.ok) break;
        const contData = await contRes.json();
        const contText = contData?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        finishReason = contData?.candidates?.[0]?.finishReason || 'STOP';
        if (!contText) break;
        geminiText += contText;
      } catch(contErr) {
        console.warn('Continuation failed:', contErr);
        break;
      }
    }

    // Extraction XML et formatage en bloc de code
    const matchExercice = geminiText.match(/<exercice>([\s\S]*?)<\/exercice>/i);
    if (matchExercice) {
      const xmlContent = `<exercice>\n${matchExercice[1].trim()}\n</exercice>`;
      geminiText = "```xml\n" + xmlContent + "\n```";
    } else {
      if (geminiText.includes('<exercice>')) {
        geminiText = "```xml\n" + geminiText.trim() + "\n```";
      }
    }

    if (cfg.exportWord) {
      try {
        let textToExport = geminiText;
        if (textToExport.includes('[EXPORT_WORD]')) {
          textToExport = textToExport.replace('[EXPORT_WORD]', '').trim();
          geminiText = textToExport;
        }
        exportToWord(textToExport, `Fiche_Methode_${cfg.discipline}.doc`);
        toast('📄 Fiche méthode exportée en Word avec succès !', 'success');
      } catch(e) {
        console.error('Export Word error:', e);
      }
    }

    if (cfg.exportHtml) {
      try {
        let textToExport = geminiText;
        if (textToExport.includes('[EXPORT_HTML]')) {
          textToExport = textToExport.replace('[EXPORT_HTML]', '').trim();
          geminiText = textToExport;
        }
        exportToHtml(textToExport, `Fiche_Methode_${cfg.discipline}.html`);
        toast('🌐 Fiche méthode exportée en HTML avec succès !', 'success');
      } catch(e) {
        console.error('Export HTML error:', e);
      }
    }

    if (cfg.exportPdf) {
      try {
        let textToExport = geminiText;
        if (textToExport.includes('[EXPORT_PDF]')) {
          textToExport = textToExport.replace('[EXPORT_PDF]', '').trim();
          geminiText = textToExport;
        }
        exportToPdf(textToExport, `Fiche_Methode_${cfg.discipline}.pdf`);
        toast('📕 Fiche méthode exportée en PDF avec succès !', 'success');
      } catch(e) {
        console.error('Export PDF error:', e);
      }
    }

    assistantMsg.content = geminiText;
    assistantMsg.streaming = false;
    renderMessages(true);
    hideTyping();
    await saveChat();

  } catch(e) {
    if (e.name === 'AbortError' || (e.message && e.message.includes('Aborted'))) {
      assistantMsg.content = `*— Génération de la fiche interrompue —*`;
    } else {
      assistantMsg.content = `❌ Erreur génération fiche : ${e.message}`;
    }
    assistantMsg.streaming = false;
    renderMessages(true);
    hideTyping();
  } finally {
    state.isGenerating = false;
    state.agent = _savedAgent;
    state.abortController = null;
    const sendBtn2 = $('#send-btn');
    if (sendBtn2) { sendBtn2.className = 'send-btn'; sendBtn2.innerHTML = '▶'; sendBtn2.disabled = false; }
  }
};

const refreshMethodeSavedList = async () => {
  try {
    const allSettings = await db.getAll('settings');
    const saves = allSettings.filter(s => s.id && s.id.startsWith('methodeSave_'));
    const select = $('#methode-saved-list');
    if (!select) return;
    const currentVal = select.value;
    select.innerHTML = '<option value="">— Profils sauvegardés —</option>';
    saves.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.data.name || 'Sauvegarde sans nom';
      select.appendChild(opt);
    });
    if (saves.some(s => s.id === currentVal)) select.value = currentVal;
  } catch (err) { console.error('Erreur refreshMethodeSavedList:', err); }
};

const saveMethodeConfigData = async () => {
  const name = prompt('Entrez un nom pour cette sauvegarde de fiche méthode (ex: Terminale PC - Électricité) :');
  if (!name || !name.trim()) return;
  try {
    const get = (id) => ($(`#${id}`)?.value || '');
    const configToSave = {
      name: name.trim(),
      discipline: get('methode-discipline'),
      customDiscipline: get('methode-custom-discipline'),
      niveau: get('methode-niveau'),
      niveauLangue: get('methode-niveau-langue'),
      role: get('methode-role'),
      exercice: get('methode-exercice'),
      competences: get('methode-competences'),
      exemple: get('methode-exemple'),
      directives: get('methode-directives'),
      exportWord: $('#methode-export-word')?.checked || false,
      exportHtml: $('#methode-export-html')?.checked || false,
      exportPdf: $('#methode-export-pdf')?.checked || false,
      _methodePdfName,
      _methodePdfBase64,
      _methodePdfMime,
      _methodeRefName,
      _methodeRefText,
      _methodeRefBase64,
      _methodeRefMime,
      _methodeExempleName,
      _methodeExempleBase64,
      _methodeExempleMime
    };
    const saveId = 'methodeSave_' + Date.now();
    await db.put('settings', { id: saveId, data: configToSave });
    await refreshMethodeSavedList();
    toast(`Sauvegarde "${name}" réussie !`, 'success');
  } catch (err) {
    console.error('Erreur sauvegarde méthode:', err);
    toast('Erreur lors de la sauvegarde.', 'error');
  }
};

const loadMethodeConfigData = async () => {
  try {
    const id = $('#methode-saved-list')?.value;
    if (!id) { toast('Veuillez sélectionner un profil sauvegardé.', 'info'); return; }
    const record = await db.get('settings', id);
    if (!record || !record.data) { toast('Erreur : profil introuvable.', 'error'); return; }
    const data = record.data;
    const set = (id, val) => { if ($(`#${id}`)) $(`#${id}`).value = val || ''; };
    set('methode-discipline', data.discipline);
    set('methode-custom-discipline', data.customDiscipline);
    if (data.discipline === 'Autre') {
      const grp = $('#methode-custom-discipline-group');
      if (grp) grp.style.display = 'block';
    }
    set('methode-niveau', data.niveau);
    set('methode-niveau-langue', data.niveauLangue);
    set('methode-role', data.role);
    set('methode-exercice', data.exercice);
    set('methode-competences', data.competences);
    set('methode-exemple', data.exemple);
    set('methode-directives', data.directives);
    if ($('#methode-export-word')) $('#methode-export-word').checked = data.exportWord || false;
    if ($('#methode-export-html')) $('#methode-export-html').checked = data.exportHtml || false;
    if ($('#methode-export-pdf')) $('#methode-export-pdf').checked = data.exportPdf || false;
    _methodePdfName   = data._methodePdfName   || '';
    _methodePdfBase64 = data._methodePdfBase64 || null;
    _methodePdfMime   = data._methodePdfMime   || '';
    _methodeRefName   = data._methodeRefName   || '';
    _methodeRefText   = data._methodeRefText   || '';
    _methodeRefBase64 = data._methodeRefBase64 || null;
    _methodeRefMime   = data._methodeRefMime   || '';
    _methodeExempleName   = data._methodeExempleName   || '';
    _methodeExempleBase64 = data._methodeExempleBase64 || null;
    _methodeExempleMime   = data._methodeExempleMime   || '';

    if (_methodePdfBase64 && $('#methode-pdf-badge')) {
      $('#methode-pdf-badge').textContent = `📎 ${_methodePdfName} (Mémoire)`;
      $('#methode-pdf-badge').style.display = 'inline-block';
    } else {
      if ($('#methode-pdf-badge')) $('#methode-pdf-badge').style.display = 'none';
    }
    if (_methodeRefBase64 && $('#methode-ref-badge')) {
      $('#methode-ref-badge').textContent = `📝 ${_methodeRefName} (Mémoire)`;
      $('#methode-ref-badge').style.display = 'inline-block';
    } else {
      if ($('#methode-ref-badge')) $('#methode-ref-badge').style.display = 'none';
    }
    if (_methodeExempleBase64 && $('#methode-exemple-badge')) {
      $('#methode-exemple-badge').textContent = `📄 ${_methodeExempleName} (Mémoire)`;
      $('#methode-exemple-badge').style.display = 'inline-block';
    } else {
      if ($('#methode-exemple-badge')) $('#methode-exemple-badge').style.display = 'none';
    }
    toast(`Profil "${data.name}" chargé avec succès !`, 'success');
  } catch (err) {
    console.error('Erreur chargement méthode:', err);
    toast('Erreur lors du chargement.', 'error');
  }
};

const deleteMethodeConfigData = async () => {
  try {
    const id = $('#methode-saved-list')?.value;
    if (!id) { toast('Veuillez sélectionner un profil à supprimer.', 'info'); return; }
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce profil ?')) return;
    await db.delete('settings', id);
    await refreshMethodeSavedList();
    toast('Profil supprimé.', 'info');
  } catch (err) {
    console.error('Erreur suppression méthode:', err);
    toast('Erreur lors de la suppression.', 'error');
  }
};

const methodeHandleDisciplineChange = () => {
  const discEl = $('#methode-discipline');
  const customGroup = $('#methode-custom-discipline-group');
  if (!discEl) return;
  const disc = discEl.value;
  if (customGroup) customGroup.style.display = disc === 'Autre' ? 'block' : 'none';
};

document.removeEventListener('do-save-methode-config',   window._methodeSaveHandler);
document.removeEventListener('do-load-methode-config',   window._methodeLoadHandler);
document.removeEventListener('do-delete-methode-config', window._methodeDeleteHandler);
window._methodeSaveHandler   = saveMethodeConfigData;
window._methodeLoadHandler   = loadMethodeConfigData;
window._methodeDeleteHandler = deleteMethodeConfigData;
document.addEventListener('do-save-methode-config',   window._methodeSaveHandler);
document.addEventListener('do-load-methode-config',   window._methodeLoadHandler);
document.addEventListener('do-delete-methode-config', window._methodeDeleteHandler);

window.methodeValidateStep1 = methodeValidateStep1;
window.methodeValidateStep2 = methodeValidateStep2;
window.methodeShowStep = methodeShowStep;
window.methodeBuildSummary = methodeBuildSummary;
window.openMethodeModal = openMethodeModal;
window.closeMethodeModal = closeMethodeModal;
window.generateMethodeSheet = generateMethodeSheet;

setTimeout(() => refreshMethodeSavedList(), 500);

(() => {
  if ($('#open-methode-modal'))  $('#open-methode-modal').onclick = openMethodeModal;
  if ($('#close-methode-modal')) $('#close-methode-modal').onclick = closeMethodeModal;
  if ($('#methode-modal'))       $('#methode-modal').onclick = e => { if (e.target === $('#methode-modal')) closeMethodeModal(); };
  if ($('#methode-discipline'))  $('#methode-discipline').onchange = methodeHandleDisciplineChange;

  if ($('#methode-pdf-upload')) {
    $('#methode-pdf-upload').onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const badge     = $('#methode-pdf-badge');
      const info      = $('#methode-pdf-info');
      const removeBtn = $('#methode-pdf-remove');
      const exoEl     = $('#methode-exercice');
      const isPdfOrImg = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf') || file.type.startsWith('image/');
      if (isPdfOrImg) {
        if (badge) { badge.textContent = `⏳ ${file.name} — Lecture en cours…`; badge.style.display = 'inline-block'; }
        const reader = new FileReader();
        reader.onload = (ev) => {
          _methodePdfBase64 = ev.target.result.split(',')[1];
          _methodePdfName = file.name;
          _methodePdfMime = file.type || 'application/pdf';
          if (badge) { badge.textContent = `📄 ${file.name} (Prêt)`; badge.style.display = 'inline-block'; }
          if (info) info.style.display = 'block';
          if (removeBtn) removeBtn.style.cssText = 'display:inline-flex;';
          if (exoEl) { exoEl.value = `[EXERCICE PDF: ${file.name}]\nSera analysé nativement par Gemini.`; exoEl.style.opacity = '1'; }
          toast(`✅ ${file.name} importé avec succès.`, 'success');
        };
        reader.readAsDataURL(file);
      } else {
        const reader = new FileReader();
        reader.onload = (ev) => {
          if (exoEl) { exoEl.value = ev.target.result.trim(); exoEl.style.opacity = '1'; }
          _methodePdfBase64 = null;
          _methodePdfName = file.name;
          if (badge) { badge.textContent = `📝 ${file.name}`; badge.style.display = 'inline-block'; }
          if (info) info.style.display = 'block';
          if (removeBtn) removeBtn.style.cssText = 'display:inline-flex;';
          toast('✅ Fichier texte importé.', 'success');
        };
        reader.readAsText(file, 'UTF-8');
      }
      e.target.value = '';
    };
  }

  if ($('#methode-ref-upload')) {
    $('#methode-ref-upload').onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const badge     = $('#methode-ref-badge');
      const removeBtn = $('#methode-ref-remove');
      const competEl  = $('#methode-competences');
      const isPdfOrImg = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf') || file.type.startsWith('image/');
      if (isPdfOrImg) {
        if (badge) { badge.textContent = `⏳ ${file.name} — Lecture…`; badge.style.display = 'inline-block'; }
        const reader = new FileReader();
        reader.onload = (ev) => {
          _methodeRefName = file.name;
          _methodeRefMime = file.type || 'application/pdf';
          const dataUrl = ev.target.result;
          _methodeRefBase64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
          _methodeRefText = '';
          if (competEl) competEl.value += `\n\n[CADRE PDF: ${file.name}]`;
          if (badge) { badge.textContent = `📄 ${file.name} (Prêt)`; badge.style.display = 'inline-block'; }
          if (removeBtn) removeBtn.style.cssText = 'display:inline-flex;';
          toast(`✅ Référentiel ${file.name} importé.`, 'success');
        };
        reader.readAsDataURL(file);
      } else {
        const reader = new FileReader();
        reader.onload = (ev) => {
          _methodeRefName = file.name;
          _methodeRefText = ev.target.result.trim();
          if (competEl) competEl.value += '\n\n' + _methodeRefText;
          if (badge) { badge.textContent = `📝 ${file.name}`; badge.style.display = 'inline-block'; }
          if (removeBtn) removeBtn.style.cssText = 'display:inline-flex;';
          toast(`✅ Référentiel texte importé.`, 'success');
        };
        reader.readAsText(file, 'UTF-8');
      }
      e.target.value = '';
    };
  }

  if ($('#methode-exemple-upload')) {
    $('#methode-exemple-upload').onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const badge     = $('#methode-exemple-badge');
      const infoEl    = $('#methode-exemple-info');
      const removeBtn = $('#methode-exemple-remove');
      const exemplEl  = $('#methode-exemple');
      const isPdfOrImg = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf') || file.type.startsWith('image/');

      if (isPdfOrImg) {
        if (badge) { badge.textContent = `⏳ ${file.name} — Lecture…`; badge.style.display = 'inline-block'; }
        const reader = new FileReader();
        reader.onload = (ev) => {
          _methodeExempleName   = file.name;
          _methodeExempleMime   = file.type || 'application/pdf';
          const dataUrl = ev.target.result;
          _methodeExempleBase64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
          if (exemplEl) { exemplEl.value = `[FICHE EXEMPLE PDF : ${file.name}]\nSera analysée nativement par Gemini comme modèle de style.`; }
          if (badge) { badge.textContent = `📄 ${file.name} (Prêt)`; badge.style.display = 'inline-block'; }
          if (infoEl) infoEl.style.display = 'block';
          if (removeBtn) removeBtn.style.cssText = 'display:inline-flex;';
          toast(`✅ Fiche exemple "${file.name}" importée. L'IA l'utilisera comme modèle.`, 'success');
        };
        reader.readAsDataURL(file);
      } else {
        const reader = new FileReader();
        reader.onload = (ev) => {
          _methodeExempleName   = file.name;
          _methodeExempleBase64 = null;
          _methodeExempleMime   = '';
          const txt = ev.target.result.trim();
          if (exemplEl) exemplEl.value = txt;
          if (badge) { badge.textContent = `📝 ${file.name}`; badge.style.display = 'inline-block'; }
          if (infoEl) infoEl.style.display = 'block';
          if (removeBtn) removeBtn.style.cssText = 'display:inline-flex;';
          toast(`✅ Fiche exemple texte importée.`, 'success');
        };
        reader.readAsText(file, 'UTF-8');
      }
      e.target.value = '';
    };
  }

  // ── Boutons ✕ Supprimer fichier — Méthode ────────────────────────────
  if ($('#methode-pdf-remove')) {
    $('#methode-pdf-remove').onclick = () => {
      _methodePdfBase64 = null; _methodePdfName = ''; _methodePdfMime = '';
      const exoEl = $('#methode-exercice');
      if (exoEl && exoEl.value.startsWith('[EXERCICE PDF:')) exoEl.value = '';
      const badge = $('#methode-pdf-badge'); if (badge) badge.style.display = 'none';
      const info  = $('#methode-pdf-info');  if (info)  info.style.display  = 'none';
      $('#methode-pdf-remove').style.display = 'none';
      toast('🗑️ Exercice supprimé.', 'info');
    };
  }
  if ($('#methode-ref-remove')) {
    $('#methode-ref-remove').onclick = () => {
      _methodeRefBase64 = null; _methodeRefName = ''; _methodeRefText = '';
      const badge = $('#methode-ref-badge'); if (badge) badge.style.display = 'none';
      $('#methode-ref-remove').style.display = 'none';
      toast('🗑️ Référentiel supprimé.', 'info');
    };
  }
  if ($('#methode-exemple-remove')) {
    $('#methode-exemple-remove').onclick = () => {
      _methodeExempleName = ''; _methodeExempleBase64 = null; _methodeExempleMime = '';
      const exemplEl = $('#methode-exemple'); if (exemplEl) exemplEl.value = '';
      const badge = $('#methode-exemple-badge'); if (badge) badge.style.display = 'none';
      const info  = $('#methode-exemple-info');  if (info)  info.style.display  = 'none';
      $('#methode-exemple-remove').style.display = 'none';
      toast('🗑️ Fiche modèle supprimée.', 'info');
    };
  }
})();



// Memory
  $("#memory-toggle").onclick = () => {
    const panel = $("#memory-panel");
    const isActive = panel.classList.toggle("active");
    if(isActive) {
      panel.style.display = "flex";
      if (window.innerWidth < 768) document.body.style.overflow = 'hidden';
    } else {
      panel.style.display = "none";
      document.body.style.overflow = 'auto';
    }
  };
  $("#memory-add").onclick = async () => {
    const txt = $("#memory-input").value.trim();
    if (!txt) return;
    await memory.add(txt);
    $("#memory-input").value = "";
    toast("Mémoire ajoutée", "success");
    const sys = (state.messages||[]).find(m => m.role === "system");
    if (sys) { sys.content = buildSystemPrompt(); await saveChat(); }
  };
  $("#memory-input").onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); $("#memory-add").click(); } };
  $("#memory-clear").onclick = async () => {
    if (confirm(t('msg_confirm_clear_memory'))) await memory.clear();
  };

  // Data Modal
  const openDataModal = async () => {
    await computeStats();
    $("#data-modal").classList.add("active");
  };
  const closeDataModal = () => $("#data-modal").classList.remove("active");
  if ($("#open-data-modal")) $("#open-data-modal").onclick = openDataModal;
  if ($("#close-data-modal")) $("#close-data-modal").onclick = closeDataModal;
  if ($("#close-data-modal-2")) $("#close-data-modal-2").onclick = closeDataModal;
  if ($("#data-modal")) $("#data-modal").onclick = e => { if (e.target === $("#data-modal")) closeDataModal(); };

  if ($("#btn-export")) $("#btn-export").onclick = exportData;

  // Quiz Player Modal interactions
  const qpEval = $("#qp-eval");
  if (qpEval) {
    qpEval.onchange = (e) => {
      const timerGroup = $("#qp-timer-group");
      if (e.target.checked) timerGroup.style.display = "flex";
      else timerGroup.style.display = "none";
    };
  }
  const qpExportBtn = $("#qp-export-btn");
  if (qpExportBtn) {
    qpExportBtn.onclick = () => {
      const msgId = $("#qp-msg-id").value;
      if (msgId) exportQuizPlayer(msgId);
    };
  }

  // Workflow Export / Import
  if ($("#btn-wf-export")) $("#btn-wf-export").onclick = exportWorkflows;
  
  const wfDropZone = $("#wf-import-drop-zone");
  const wfFileInput = $("#wf-import-file-input");
  if (wfDropZone && wfFileInput) {
    wfDropZone.onclick = () => wfFileInput.click();
    wfDropZone.ondragover = e => { e.preventDefault(); wfDropZone.classList.add("dragover"); };
    wfDropZone.ondragleave = () => wfDropZone.classList.remove("dragover");
    wfDropZone.ondrop = async e => {
      e.preventDefault();
      wfDropZone.classList.remove("dragover");
      const file = e.dataTransfer.files[0];
      if (file) {
        await importWorkflows(file);
        renderWfExistingList(); // Refresh UI list
      }
    };
    wfFileInput.onchange = async e => {
      const file = e.target.files[0];
      if (file) {
        await importWorkflows(file);
        renderWfExistingList(); // Refresh UI list
        wfFileInput.value = "";
      }
    };
  }

  if ($("#btn-clear-all")) $("#btn-clear-all").onclick = async () => {
    if (!confirm(t('msg_confirm_delete_all'))) return;
    const stores = ['chats','agents','settings','global_memory','workflows'];
    for (const s of stores) {
      const all = await db.getAll(s) || [];
      for (const r of all) await db.delete(s, r.id);
    }
    state.messages = [];
    state.agent = null;
    state.globalMemories = [];
    await newChat();
    await loadAgents();
    renderMemoryList();
    closeDataModal();
    toast("Toutes les données supprimées", "success");
  };

  // ── Vider le cache Service Worker / Workbox ──────────────────────────────
  const clearSwCache = async () => {
    try {
      // 1. Déregistrer tous les Service Workers actifs
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
      }
      // 2. Purger tous les caches (Workbox, précache, runtime…)
      if ('caches' in window) {
        const names = await caches.keys();
        await Promise.all(names.map(n => caches.delete(n)));
      }
      toast('✓ Cache effacé. Rechargement en cours…', 'success');
      setTimeout(() => location.reload(true), 1400);
    } catch (err) {
      toast('Erreur lors du nettoyage du cache : ' + err.message, 'error');
    }
  };

  if ($('#btn-clear-sw-cache')) {
    $('#btn-clear-sw-cache').onclick = async () => {
      if (!confirm('Vider le cache du Service Worker et recharger l\'application ?')) return;
      await clearSwCache();
    };
  }


  let pendingImportFile = null;

  const dropZone = $("#import-drop-zone");
  const fileInput = $("#import-file-input");
  const importPreview = $("#import-preview");

  const showImportPreview = async (file) => {
    pendingImportFile = file;
    $("#import-filename").textContent = file.name;
    $("#import-fileinfo").textContent = `${(file.size / 1024).toFixed(1)} KB — ${new Date(file.lastModified).toLocaleDateString('fr-FR')}`;
    $("#import-summary").textContent = t("msg_analyzing");
    importPreview.style.display = "block";
    dropZone.style.opacity = "0.4";

    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const data = payload.data || payload;
      const nbChats = data.chats?.length || 0;
      const nbAgents = data.agents?.length || 0;
      const nbMems = data.global_memory?.length || 0;
      const exported = payload.exported ? `Sauvegarde du ${new Date(payload.exported).toLocaleString('fr-FR')}` : "Date inconnue";
      $("#import-summary").innerHTML = `
        <strong style="color:var(--neon)">✓ Fichier valide</strong><br>
        ${exported}<br>
        ▸ ${nbChats} conversation(s) &nbsp;|&nbsp; ${nbAgents} agent(s) &nbsp;|&nbsp; ${nbMems} souvenir(s)
      `;
    } catch(e) {
      $("#import-summary").innerHTML = `<span style="color:var(--danger)">${t('msg_invalid_file')} : ${escapeHtml(e.message)}</span>`;
      pendingImportFile = null;
    }
  };

  const resetImportUI = () => {
    pendingImportFile = null;
    importPreview.style.display = "none";
    dropZone.style.opacity = "1";
    if (fileInput) fileInput.value = "";
  };

  if (dropZone && fileInput) {
    dropZone.onclick = () => fileInput.click();
    dropZone.ondragover = e => { e.preventDefault(); dropZone.classList.add("dragover"); };
    dropZone.ondragleave = () => dropZone.classList.remove("dragover");
    dropZone.ondrop = e => {
      e.preventDefault();
      dropZone.classList.remove("dragover");
      const file = e.dataTransfer.files[0];
      if (file) showImportPreview(file);
    };
    fileInput.onchange = e => {
      const file = e.target.files[0];
      if (file) showImportPreview(file);
    };
  }

  // Import étape 2 : confirmer
  if ($("#btn-import-confirm")) {
    $("#btn-import-confirm").onclick = async () => {
      if (!pendingImportFile) return;
      const btn = $("#btn-import-confirm");
      btn.disabled = true;
      btn.innerHTML = '<span class="spin-ring"></span> RESTAURATION…';
      try {
        await importData(pendingImportFile);
        resetImportUI();
        await computeStats();
      } finally {
        btn.disabled = false;
        btn.innerHTML = t('btn_validate_restore');
      }
    };
  }
  if ($("#btn-import-cancel")) {
    $("#btn-import-cancel").onclick = resetImportUI;
  }

  // ══ BURGER MENU MOBILE ══
  const burgerBtn = $("#burger-btn");
  const mobileMenu = $("#mobile-menu");

  const closeBurger = () => mobileMenu.classList.remove("open");

  if (burgerBtn && mobileMenu) {
    burgerBtn.onclick = (e) => {
      e.stopPropagation();
      mobileMenu.classList.toggle("open");
    };

    // Sync mobile selects with desktop selects
    const syncMobile = () => {
      const mMod = $("#model-select-mob");
      const mAgent = $("#agent-select-mob");
      const mTheme = $("#theme-select-mob");
      if (mMod) { mMod.innerHTML = $("#model-select").innerHTML; mMod.value = state.model; }
      if (mAgent) { 
        mAgent.innerHTML = $("#agent-select").innerHTML; 
        mAgent.value = state.selectedWorkflow ? `__WF__${state.selectedWorkflow.id}` : (state.agent?.id || ""); 
      }
      if (mTheme) mTheme.value = document.documentElement.dataset.theme;
    };

    mobileMenu.addEventListener('click', e => e.stopPropagation());
    document.addEventListener('click', () => closeBurger());

    // Mobile model select
    const mModSel = $("#model-select-mob");
    if (mModSel) {
      // Populate
      MODELS.forEach(m => {
        const opt = document.createElement("option");
        opt.value = m.id;
        opt.textContent = m.name;
        mModSel.appendChild(opt);
      });
      mModSel.value = state.model;
      mModSel.onchange = e => {
        state.model = e.target.value;
        $("#model-select").value = state.model;
        db.put('settings', { id:'model', value:state.model }).catch(()=>{});
        const sys = (state.messages||[]).find(m => m.role === "system");
        if (sys) { sys.content = buildSystemPrompt(); saveChat(); }
      };
    }

    // Mobile agent select
    const mAgentSel = $("#agent-select-mob");
    if (mAgentSel) {
      mAgentSel.onchange = async e => {
        try {
          const val = e.target.value;
          if (val === '__ALL_AGENTS__') {
            state.agent = '__ALL_AGENTS__';
            state.selectedWorkflow = null;
            toast("Mode Multi-Agents activé — tous les experts seront consultés", "success");
          } else if (val.startsWith('__WF__')) {
            const wfId = val.replace('__WF__', '');
            const wf = await db.get('workflows', wfId);
            if (wf) {
              state.selectedWorkflow = wf;
              state.agent = null;
              toast(`Chaîne "${wf.name}" sélectionnée (${wf.steps.length} étapes)`, "success");

              const wfNameLower = wf.name.toLowerCase();
              const isMistralWorkflow = ['qcm','quiz','fc','audit','mcq','vrai/faux','true/false'].some(kw => wfNameLower.includes(kw));
              if (isMistralWorkflow) {
                const mistralId = "mistral-large-2512";
                if (state.model !== mistralId) {
                  state.model = mistralId;
                  if ($('#model-select')) $('#model-select').value = mistralId;
                  if (typeof db !== 'undefined' && db.put) {
                    db.put('settings', { id: 'model', value: state.model }).catch(() => {});
                  }
                  if (typeof toast !== 'undefined') {
                    toast('Le modèle Mistral Large 3 a été sélectionné (recommandé pour ce générateur).', 'info');
                  }
                }
              }
            }
          } else if (val) {
            state.agent = await db.get('agents', val);
            state.selectedWorkflow = null;
          } else {
            state.agent = null;
            state.selectedWorkflow = null;
          }
          $("#agent-select").value = val;
          const sys = (state.messages||[]).find(m => m.role === "system");
          if (sys) { sys.content = buildSystemPrompt(); await saveChat(); renderMessages(true); }
        } catch(err) { console.error(err); }
      };
    }

    // Mobile theme select
    const mThemeSel = $("#theme-select-mob");
    if (mThemeSel) {
      mThemeSel.onchange = e => {
        document.documentElement.dataset.theme = e.target.value;
        $("#theme-select").value = e.target.value;
        db.put('settings', { id:'theme', value:e.target.value }).catch(()=>{});
      };
    }

    // Mobile API modal
    if ($("#open-api-modal-mob")) $("#open-api-modal-mob").onclick = () => { closeBurger(); $("#api-modal").classList.add("active"); };
    // Mobile Agent modal
    if ($("#open-agent-modal-mob")) $("#open-agent-modal-mob").onclick = async () => { closeBurger(); await loadAgents(); $("#agent-modal").classList.add("active"); };
    // Mobile Data modal
    if ($("#open-data-modal-mob")) $("#open-data-modal-mob").onclick = async () => { closeBurger(); await computeStats(); $("#data-modal").classList.add("active"); };
    // Mobile Workflow modal
    if ($("#open-workflow-modal-mob")) $("#open-workflow-modal-mob").onclick = async () => { closeBurger(); await loadAgents(); await renderWfExistingList(); await resetWorkflowForm(); $("#workflow-modal").classList.add("active"); };
    // Mobile clear / new
    if ($("#clear-chat-mob")) $("#clear-chat-mob").onclick = () => { closeBurger(); $("#clear-chat").click(); };
    if ($("#new-chat-mob")) $("#new-chat-mob").onclick = () => { closeBurger(); newChat(); };

    // Sync mobile status pill
    const syncStatusMob = () => {
      const mob = $("#api-status-mob");
      if (!mob) return;
      mob.innerHTML = $("#api-status").innerHTML;
      mob.className = $("#api-status").className;
    };

    // Sync mobile status after API key save
    const origSaveKey = document.getElementById("save-api-key");
    if (origSaveKey) {
      const origClick = origSaveKey.onclick;
      origSaveKey.onclick = function(...args) {
        if (origClick) origClick.apply(origSaveKey, args);
        setTimeout(syncStatusMob, 100);
      };
    }

    // Sync on open
    burgerBtn.addEventListener('click', syncStatusMob);
  }

  // Close memory panel on outside click
  document.addEventListener('click', e => {
    const panel = $("#memory-panel");
    const toggle = $("#memory-toggle");
    if (panel && panel.classList.contains("active") && !panel.contains(e.target) && e.target !== toggle) {
      panel.classList.remove("active");
      panel.style.display = "none";
      document.body.style.overflow = 'auto';
    }
  });
}

// ════════════════════════════════════════
// EXPOSE GLOBAL FUNCTIONS (for inline onclick handlers in HTML)
// ════════════════════════════════════════
window.submitFeedback = submitFeedback;
window.clearAgentLessons = clearAgentLessons;
window.deleteLesson = deleteLesson;
window.updateLesson = updateLesson;
window.manageLessons = manageLessons;
window.openFeedbackModal = openFeedbackModal;

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

  overlay.innerHTML = `
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
  `;

  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  document.getElementById('qmd-eval-btn').addEventListener('click', () => { close(); callback('evaluation'); });
  document.getElementById('qmd-rev-btn').addEventListener('click',  () => { close(); callback('revision');   });
  document.getElementById('qmd-cancel-btn').addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
}

window.toggleWebQuizFullscreen = function() {
  const container = document.getElementById('web-quiz-player-modal');
  if (!document.fullscreenElement) {
    if (container.requestFullscreen) {
      container.requestFullscreen();
    } else if (container.webkitRequestFullscreen) {
      container.webkitRequestFullscreen();
    } else if (container.msRequestFullscreen) {
      container.msRequestFullscreen();
    }
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    } else if (document.msExitFullscreen) {
      document.msExitFullscreen();
    }
  }
};

// ════════════════════════════════════════
// WEB QUIZ PLAYER
// ════════════════════════════════════════
let wqState = {
  questions: [],
  currentIndex: 0,
  selectedChoice: null,
  isVerified: false,
  mode: 'revision',
  score: 0,
  timerSeconds: 0,
  timerInterval: null
};

// Sélection automatique du modèle d'IA en fonction du contenu de la question
function autoSelectMistralModel(textContext) {
  const lower = textContext.toLowerCase();
  
  // 1. Mathématiques / Logique complexe
  // Détection de symboles LaTeX fréquents ou mots-clés
  if (lower.includes('\\\\') || lower.includes('$') || lower.includes('équation') || 
      lower.includes('dérivée') || lower.includes('limite') || lower.includes('théorème') || 
      lower.includes('vecteur') || lower.includes('\\\\frac') || lower.includes('mathématiques')) {
    return "mistral-large-2512";
  }
  
  // 2. Programmation / Informatique
  if (lower.includes('javascript') || lower.includes('python') || lower.includes('html') || 
      lower.includes(' css ') || lower.includes('fonction') || lower.includes('algorithme') || 
      lower.includes('code') || lower.includes('variable') || lower.includes('</')) {
    return "codestral-2508";
  }
  
  // 3. Culture générale / Facile
  // Si rien de spécifique n'est détecté, on privilégie la vitesse et la légèreté
  return "mistral-small-2603";
}

// Fix unbalanced [ ] { } and \left / \right inside a LaTeX expression
function fixLatexBraces(latex) {
  let s = latex;

  // 1. Balance [ ]
  const ob = (s.match(/\[/g)||[]).length, cb = (s.match(/\]/g)||[]).length;
  if (ob > cb) s += ']'.repeat(ob - cb);

  // 2. Balance { }
  const oc = (s.match(/\{/g)||[]).length, cc = (s.match(/\}/g)||[]).length;
  if (oc > cc) s += '}'.repeat(oc - cc);

  // 3. Balance \left / \right
  // Count each (they must be followed by a non-letter, e.g. \left( \right| \left.)
  const nLeft  = (s.match(/\\left(?=[^a-zA-Z])/g)||[]).length;
  const nRight = (s.match(/\\right(?=[^a-zA-Z])/g)||[]).length;
  if (nLeft > nRight) {
    // Missing \right — append invisible \right. for each missing one
    s += ' \\right.'.repeat(nLeft - nRight);
  } else if (nRight > nLeft) {
    // Extra \right — prepend invisible \left. for each extra one
    s = '\\left. '.repeat(nRight - nLeft) + s;
  }

  return s;
}

// Render text: preserve LaTeX for MathJax, HTML-escape the rest
// Also auto-wraps bare LaTeX commands (e.g. \mapsto, \rightarrow) in $...$
function renderWithLatex(rawText) {
  if (!rawText) return "";

  // Step 1: extract delimited LaTeX blocks into a safe placeholder map
  const blocks = [];
  let text = rawText;

  function stash(content) {
    blocks.push(content);
    return `__LATEX_BLOCK_${blocks.length - 1}__`;
  }

  // Replace $$...$$
  text = text.replace(/\$\$([\s\S]*?)\$\$/g, (m, p1) => stash(`$$${fixLatexBraces(p1)}$$`));
  // Replace \[...\]
  text = text.replace(/\\\[([\s\S]*?)\\\]/g, (m, p1) => stash(`\\[${fixLatexBraces(p1)}\\]`));
  // Replace \(...\)
  text = text.replace(/\\\(([\s\S]*?)\\\)/g, (m, p1) => stash(`\\(${fixLatexBraces(p1)}\\)`));
  // Replace $...$
  text = text.replace(/\$((?:[^$\\]|\\.)+)\$/g, (m, p1) => stash(`$${fixLatexBraces(p1)}$`));

  // Step 2: identify bare math commands (like \rightarrow, \frac) that are NOT in placeholders
  // We'll roughly assume any word starting with \ that isn't a text command is math.
  const bareMathRegex = /\\[a-zA-Z]+(?:_[^{}\s]+|\^[^{}\s]+|_\{[^}]+\}|\^\{[^}]+\}|(?:\{[^}]*\})*)*(?:\s*[=+\-<>]\s*[0-9a-zA-Z]+)?/g;
  text = text.replace(bareMathRegex, (m) => {
    // Avoid escaping newlines or common non-math
    if (m === '\\n' || m === '\\t' || m.startsWith('\\textbf') || m.startsWith('\\textit')) return m;
    return stash(`$${fixLatexBraces(m)}$`);
  });


  // Markdown processing (simple bold/italics)
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // Simple Markdown Tables
  let mdLines = text.split('\n');
  let inTable = false;
  let htmlLines = [];
  for (let i = 0; i < mdLines.length; i++) {
    let line = mdLines[i].trim();
    if (line.startsWith('|') && line.endsWith('|')) {
      let cells = line.split('|').slice(1, -1).map(c => c.trim());
      if (!inTable) {
        if (i + 1 < mdLines.length && /^\|[-:\s|]+\|$/.test(mdLines[i+1].trim())) {
          inTable = true;
          let tb = '<div style="overflow-x:auto; margin:16px 0;"><table style="width:100%; border-collapse:collapse; border:1px solid rgba(255,255,255,0.2); font-size:14px; text-align:left;">';
          tb += '<thead style="background:rgba(255,255,255,0.1);"><tr>' + cells.map(c => `<th style="padding:10px; border:1px solid rgba(255,255,255,0.2);">${c}</th>`).join('') + '</tr></thead><tbody>';
          htmlLines.push(tb);
          i++; // skip separator
          continue;
        }
      }
      if (inTable) {
        htmlLines.push('<tr>' + cells.map(c => `<td style="padding:10px; border:1px solid rgba(255,255,255,0.1);">${c}</td>`).join('') + '</tr>');
        continue;
      }
    } else if (inTable) {
      htmlLines.push('</tbody></table></div>');
      inTable = false;
    }
    // non-table line
    htmlLines.push(mdLines[i] + (i < mdLines.length - 1 ? '<br>' : ''));
  }
  if (inTable) htmlLines.push('</tbody></table></div>');
  text = htmlLines.join('\n');


  // Step 4: restore LaTeX blocks
  return text.replace(/__LATEX_BLOCK_(\d+)__/g, (m, idx) => blocks[parseInt(idx, 10)]);
}

window.openWebQuizPlayer = function(msgId) {
  const msg = state.messages.find(m => (m.ts || '') == msgId);
  if (!msg || !msg.content) return;

  const rawContent = msg.content.replace(/<details>[\s\S]*<\/details>/i, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const allLines = rawContent.split('\n')
    .map(l => cleanupLineContent(l))
    .filter(l => l && !/^[-_*]{2,}$/.test(l));

  let questions = processLinesStandard(allLines);
  if (!questions.length) {
    questions = processLinesMixed(allLines);
  }

  if (!questions.length) {
    toast("Erreur: Aucune question valide détectée pour le test.", "error");
    return;
  }

  // Demander le mode avant de lancer
  askQuizMode((mode) => {
    startWebQuizFromData(questions, mode);
  });
};

window.renderWebQuizPlayer = function() {
  const q = wqState.questions[wqState.currentIndex];
  const isLast = wqState.currentIndex === wqState.questions.length - 1;
  const isFirst = wqState.currentIndex === 0;

  
  const metaEl = document.getElementById('wq-metadata');
  if (metaEl) {
    const m = wqState.metadata || {};
    const parts = [];
    if (m.title || m.titre) parts.push(`<strong style="color:var(--cyan)">${m.title || m.titre}</strong>`);
    if (m.matiere) parts.push(`📚 ${m.matiere}`);
    if (m.lecon) parts.push(`📖 ${m.lecon}`);
    if (m.auteur) parts.push(`✍️ ${m.auteur}`);
    metaEl.innerHTML = parts.join(' <span style="opacity:0.3">|</span> ');
  }
document.getElementById('wq-counter').innerText = `Question ${wqState.currentIndex + 1}/${wqState.questions.length}`;
  document.getElementById('wq-progress-bar').style.width = `${((wqState.currentIndex + 1) / wqState.questions.length) * 100}%`;

  // Fix unbalanced [ ] { } and \left / \right inside a LaTeX expression
  function fixLatexBraces(latex) {
    let s = latex;

    // 1. Balance [ ]
    const ob = (s.match(/\[/g)||[]).length, cb = (s.match(/\]/g)||[]).length;
    if (ob > cb) s += ']'.repeat(ob - cb);

    // 2. Balance { }
    const oc = (s.match(/\{/g)||[]).length, cc = (s.match(/\}/g)||[]).length;
    if (oc > cc) s += '}'.repeat(oc - cc);

    // 3. Balance \left / \right
    // Count each (they must be followed by a non-letter, e.g. \left( \right| \left.)
    const nLeft  = (s.match(/\\left(?=[^a-zA-Z])/g)||[]).length;
    const nRight = (s.match(/\\right(?=[^a-zA-Z])/g)||[]).length;
    if (nLeft > nRight) {
      // Missing \right — append invisible \right. for each missing one
      s += ' \\right.'.repeat(nLeft - nRight);
    } else if (nRight > nLeft) {
      // Extra \right — prepend invisible \left. for each extra one
      s = '\\left. '.repeat(nRight - nLeft) + s;
    }

    return s;
  }

  // Render text: preserve LaTeX for MathJax, HTML-escape the rest
  // Also auto-wraps bare LaTeX commands (e.g. \mapsto, \rightarrow) in $...$
  function renderWithLatex(rawText) {
    if (!rawText) return "";

    // Step 1: extract delimited LaTeX blocks into a safe placeholder map
    const blocks = [];
    let text = rawText;

    function stash(content) {
      blocks.push(content);
      return `\x02${blocks.length - 1}\x03`;
    }

    // $$...$$ display
    text = text.replace(/\$\$([\s\S]*?)\$\$/g, (_, inner) => stash('$$' + fixLatexBraces(inner) + '$$'));
    // \[...\] display
    text = text.replace(/\\\[([\s\S]*?)\\\]/g, (_, inner) => stash('\\[' + fixLatexBraces(inner) + '\\]'));
    // \(...\) inline
    text = text.replace(/\\\(([\s\S]*?)\\\)/g, (_, inner) => stash('\\(' + fixLatexBraces(inner) + '\\)'));
    // $...$ inline — only match balanced pairs (no newline inside)
    text = text.replace(/\$([^$\n\x02\x03]+?)\$/g, (_, inner) => stash('$' + fixLatexBraces(inner) + '$'));

    // Step 2: in remaining plain segments, auto-wrap bare LaTeX command sequences
    text = text.replace(/[^\x02\x03]+/g, (seg) => {
      if (!/\\[a-zA-Z]/.test(seg)) return seg; // fast path: no LaTeX commands
      // Wrap runs containing \cmd — split on whitespace sequences that are clearly French words
      return seg.replace(
        /((?:\\[a-zA-Z]+(?:\{[^}]*\}|\[[^\]]*\])*|[a-zA-Z0-9])[_^]?(?:\{[^}]*\}|\[[^\]]*\])?(?:\s*(?:\\[a-zA-Z]+(?:\{[^}]*\}|\[[^\]]*\])*|[a-zA-Z0-9])[_^]?(?:\{[^}]*\}|\[[^\]]*\])?)*)/g,
        (token) => {
          if (/\\[a-zA-Z]/.test(token)) return stash('$' + fixLatexBraces(token.trim()) + '$');
          return token;
        }
      );
    });

    // Step 3: reassemble — HTML-escape plain segments, restore LaTeX blocks as-is
    return text.split(/(\x02\d+\x03)/).map(seg => {
      const m = seg.match(/\x02(\d+)\x03/);
      if (m) return blocks[parseInt(m[1])]; // restore raw LaTeX for MathJax
      // plain text: HTML-escape then markdown tables
      let plain = seg.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      let text = plain;

  // Markdown processing (simple bold/italics)
  plain = plain.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // Simple Markdown Tables
  let mdLines = text.split('\n');
  let inTable = false;
  let htmlLines = [];
  for (let i = 0; i < mdLines.length; i++) {
    let line = mdLines[i].trim();
    if (line.startsWith('|') && line.endsWith('|')) {
      let cells = line.split('|').slice(1, -1).map(c => c.trim());
      if (!inTable) {
        if (i + 1 < mdLines.length && /^\|[-:\s|]+\|$/.test(mdLines[i+1].trim())) {
          inTable = true;
          let tb = '<div style="overflow-x:auto; margin:16px 0;"><table style="width:100%; border-collapse:collapse; border:1px solid rgba(255,255,255,0.2); font-size:14px; text-align:left;">';
          tb += '<thead style="background:rgba(255,255,255,0.1);"><tr>' + cells.map(c => `<th style="padding:10px; border:1px solid rgba(255,255,255,0.2);">${c}</th>`).join('') + '</tr></thead><tbody>';
          htmlLines.push(tb);
          i++; // skip separator
          continue;
        }
      }
      if (inTable) {
        htmlLines.push('<tr>' + cells.map(c => `<td style="padding:10px; border:1px solid rgba(255,255,255,0.1);">${c}</td>`).join('') + '</tr>');
        continue;
      }
    } else if (inTable) {
      htmlLines.push('</tbody></table></div>');
      inTable = false;
    }
    // non-table line
    htmlLines.push(mdLines[i] + (i < mdLines.length - 1 ? '<br>' : ''));
  }
  if (inTable) htmlLines.push('</tbody></table></div>');
  text = htmlLines.join('\n');

      return text;
    }).join('');
  }

  let qText = renderWithLatex(q.question);
  document.getElementById('wq-question-text').innerHTML = qText;

  // De-obfuscate the correct answer
  const revStr = q.reponse_obfusquee.split('').reverse().join('');
  const correctIndex = parseInt(atob(revStr).split('').reverse().join(''));

  const choicesHtml = q.choix.map((choice, i) => {
    const isSelected = wqState.selectedChoice === i;
    const isCorrect = correctIndex === i;
    
    let stateClass = '';
    if (wqState.isVerified) {
      if (isCorrect) stateClass = 'correct';
      else if (isSelected) stateClass = 'incorrect';
      stateClass += ' disabled';
    } else {
      if (isSelected) stateClass = 'selected';
    }

    let cleanChoice = choice.replace(/^(?:[a-d]|أ|ب|ج|د)[\-\)]\s*/i, '');
    let cText = renderWithLatex(cleanChoice);

    let displayLetter = String.fromCharCode(97 + i);
    if (state.lang === 'ar') {
      const arLetters = ['أ', 'ب', 'ج', 'د', 'هـ', 'و'];
      displayLetter = arLetters[i] || displayLetter;
    }

    return `<div class="wq-choice-card ${stateClass}" data-choice="${i}">
      <div class="wq-choice-letter">${displayLetter}</div>
      <div class="wq-choice-text">${cText}</div>
    </div>`;
  }).join('');

  document.getElementById('wq-choices').innerHTML = choicesHtml;

  const verifyBtn = document.getElementById('wq-btn-verify');
  const wikiBtn = document.getElementById('wq-btn-wiki-action');
  const prevBtn = document.getElementById('wq-btn-prev');
  const nextBtn = document.getElementById('wq-btn-next');
  const feedback = document.getElementById('wq-feedback');

  prevBtn.disabled = isFirst;

  if (wqState.mode === 'evaluation') {
    // In evaluation mode: next always hidden on last, show TERMINER on last question
    nextBtn.style.display = isLast ? 'none' : 'inline-flex';
    nextBtn.disabled = true;
    const finishBtn = document.getElementById('wq-btn-finish');
    if (finishBtn) finishBtn.style.display = isLast ? 'inline-flex' : 'none';
    const finishRevBtn = document.getElementById('wq-btn-finish-revision');
    if (finishRevBtn) finishRevBtn.style.display = 'none';
    if (verifyBtn) verifyBtn.style.display = 'none';
    if (wikiBtn) wikiBtn.style.display = 'none';
    if (feedback) feedback.style.display = 'none';
  } else {
    // Revision mode
    nextBtn.style.display = isLast ? 'none' : 'inline-flex';
    nextBtn.disabled = isLast; // Only disabled on last question (TERMINER button replaces it)
    const finishBtn = document.getElementById('wq-btn-finish');
    if (finishBtn) finishBtn.style.display = 'none';
    const finishRevBtn = document.getElementById('wq-btn-finish-revision');
    // Always show TERMINER on the last question so the user can finish without verifying
    if (finishRevBtn) finishRevBtn.style.display = isLast ? 'inline-flex' : 'none';

    if (wqState.isVerified) {
      feedback.style.display = 'block';
      let expl = renderWithLatex(q.explication || "Pas d'explication disponible.");
      document.getElementById('wq-feedback-text').innerHTML = expl;

      // Extraire l'URL propre (supporte format brut et markdown [texte](url))
      let wikiUrl = extractUrlFromText(q.pour_aller_plus_loin);

      // Si pas d'URL directe : générer une recherche Wikipedia depuis le texte de la question
      if (!wikiUrl) {
        const questionText = (q.question || '').replace(/^\s*\d+[\-\.\)]\s*/, '').replace(/\$[^$]*\$/g, '').trim().substring(0, 60);
        wikiUrl = 'https://fr.wikipedia.org/w/index.php?search=' + encodeURIComponent(questionText);
      }

      // Remplacer le bouton VÉRIFIER par POUR ALLER PLUS LOIN
      verifyBtn.style.display = 'none';
      wikiBtn.style.display = 'inline-flex';
      wikiBtn.href = wikiUrl;

    } else {
      // Remettre le bouton VÉRIFIER et cacher le bouton wiki
      verifyBtn.style.display = '';
      verifyBtn.disabled = wqState.selectedChoice === null;
      verifyBtn.classList.remove('checked');
      verifyBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg> VÉRIFIER`;
      if (wikiBtn) wikiBtn.style.display = 'none';
      feedback.style.display = 'none';
    }
  }

  // Réinitialiser la zone IA
  const aiContainer = document.getElementById('wq-ai-response-container');
  const aiContent = document.getElementById('wq-ai-response-content');
  const aiBtn = document.getElementById('wq-btn-ask-ai');
  if (aiContainer && aiContent && aiBtn) {
    aiContainer.style.display = 'none';
    aiContent.innerHTML = '';
    aiBtn.style.display = (wqState.mode === 'evaluation' || !wqState.isVerified) ? 'none' : 'inline-flex';
    aiBtn.disabled = false;
  }

  // Trigger MathJax if available
  if (window.MathJax && typeof window.MathJax.typesetPromise === 'function') {
    try {
      window.MathJax.typesetClear();
      window.MathJax.typesetPromise([document.getElementById('wq-question-text'), document.getElementById('wq-choices'), document.getElementById('wq-feedback')]).catch(err => console.log(err));
    } catch(e) {}
  }
}

window.selectWebQuizChoice = function(index) {
  wqState.selectedChoice = index;
  if (wqState.mode === 'evaluation') {
    wqState.questions[wqState.currentIndex].userAnswer = index;
    // Stop the countdown — question answered
    if (wqState.timerInterval) {
      clearInterval(wqState.timerInterval);
      wqState.timerInterval = null;
    }
    window.renderWebQuizPlayer();
    // Auto-advance to next question after 1.5s
    setTimeout(() => {
      if (wqState.mode !== 'evaluation') return;
      if (wqState.currentIndex < wqState.questions.length - 1) {
        wqState.currentIndex++;
        wqState.selectedChoice = null;
        window.renderWebQuizPlayer();
        startQuestionCountdown();
      } else {
        // Last question answered — trigger finish
        window.renderWebQuizPlayer();
        const finishBtn = document.getElementById('wq-btn-finish');
        if (finishBtn) finishBtn.click();
      }
    }, 1500);
  } else {
    wqState.isVerified = true; // Auto-verify on click
    // Track the answer for final score in revision mode
    wqState.questions[wqState.currentIndex]._lastAnswer = index;
    window.renderWebQuizPlayer();
  }
};

document.addEventListener('click', e => {
  const choiceCard = e.target.closest('.wq-choice-card');
  if (choiceCard && !wqState.isVerified) {
    const idx = parseInt(choiceCard.dataset.choice);
    if (!isNaN(idx)) {
      window.selectWebQuizChoice(idx);
    }
    return;
  }

  const verifyBtn = e.target.closest('#wq-btn-verify');
  if (verifyBtn && !verifyBtn.disabled) {
    if (wqState.selectedChoice !== null) {
      wqState.isVerified = true;
      // Track the answer for final score in revision mode
      wqState.questions[wqState.currentIndex]._lastAnswer = wqState.selectedChoice;
      window.renderWebQuizPlayer();
    }
    return;
  }

  const prevBtn = e.target.closest('#wq-btn-prev');
  if (prevBtn && !prevBtn.disabled) {
    if (wqState.currentIndex > 0) {
      wqState.currentIndex--;
      wqState.selectedChoice = null;
      wqState.isVerified = false;
      window.renderWebQuizPlayer();
      if (wqState.mode === 'evaluation') startQuestionCountdown();
    }
    return;
  }

  const nextBtn = e.target.closest('#wq-btn-next');
  if (nextBtn && !nextBtn.disabled) {
    const isLast = wqState.currentIndex === wqState.questions.length - 1;
    if (isLast && wqState.mode === 'revision' && wqState.isVerified) {
      // Last question in revision — show final score screen
      showFinalScoreScreen();
    } else if (!isLast) {
      wqState.currentIndex++;
      wqState.selectedChoice = null;
      wqState.isVerified = false;
      window.renderWebQuizPlayer();
      if (wqState.mode === 'evaluation') startQuestionCountdown();
    }
    return;
  }

  const aiBtn = e.target.closest('#wq-btn-ask-ai');
  if (aiBtn && !aiBtn.disabled && wqState.isVerified) {
    aiBtn.disabled = true;
    const aiContainer = document.getElementById('wq-ai-response-container');
    const aiContent = document.getElementById('wq-ai-response-content');
    aiContainer.style.display = 'block';
    aiContent.innerHTML = t('msg_ai_thinking');
    const q = wqState.questions[wqState.currentIndex];
    const correctIdx = q.choix.findIndex(c => c.correct);
    const userChoiceText = wqState.selectedChoice !== null ? q.choix[wqState.selectedChoice].text : "Aucun";
    const correctChoiceText = correctIdx >= 0 ? q.choix[correctIdx].text : "Inconnue";
    
    const prompt = `Tu es un tuteur pédagogique.
Règle ABSOLUE : Tu DOIS répondre dans la LANGUE EXACTE de la "Question" ci-dessous. Si la question est en ARABE, réponds intégralement en ARABE.

Voici les données du QCM :
- Question : ${q.question}
- Options :
${q.choix.map((c, i) => String.fromCharCode(97+i) + "- " + c.text).join('\\n')}
- Bonne réponse : ${correctChoiceText}
- Explication prévue : ${q.explication}
- Choix de l'utilisateur : ${userChoiceText}

Tâche :
Explique brièvement pourquoi la réponse est correcte ou pourquoi le choix de l'utilisateur est faux. 
NE METS AUCUNE BALISE \`\`\`markdown AUTOUR DE TA RÉPONSE ! (Écris directement le texte). Formate les maths en LaTeX ($ ou $$).
RAPPEL CRUCIAL : RÉPONDS EXCLUSIVEMENT DANS LA LANGUE DE LA QUESTION.`;

    const dynamicModel = autoSelectMistralModel(q.question + " " + (q.explication || ""));

    const reqBody = {
      model: state.agent?.modelPref || dynamicModel,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      stream: true
    };

    const _apiConf = getLlmApiConfig(reqBody.model);

    fetchWithRetry(_apiConf.url, {
      method: "POST",
      headers: _apiConf.headers,
      body: JSON.stringify(reqBody)
    }).then(async res => {
      if (!res.ok) throw new Error("API " + res.status);
      let content = "";
      await handleStreamingResponse(res, (chunk) => {
        content = chunk;
        aiContent.innerHTML = renderWithLatex(content);
        
        // Auto RTL pour l'Arabe
        if (/[\u0600-\u06FF]/.test(content)) {
          aiContent.setAttribute("dir", "rtl");
          aiContent.style.textAlign = "right";
        } else {
          aiContent.setAttribute("dir", "ltr");
          aiContent.style.textAlign = "left";
        }
      }, () => {
        aiBtn.disabled = false;
        // Trigger MathJax after full render
        if (window.MathJax && typeof window.MathJax.typesetPromise === 'function') {
          window.MathJax.typesetPromise([aiContent]).catch(err => console.log(err));
        }
      });
    }).catch(err => {
      aiContent.innerHTML = `<span style="color:var(--neon-red)">${t('msg_ai_error')}</span>`;
      aiBtn.disabled = false;
      console.error(err);
    });
    return;
  }
});

// ─── SCORE FINAL SCREEN ─────────────────────────────────────────────────────

function showFinalScoreScreen() {
  if (wqState.timerInterval) {
    clearInterval(wqState.timerInterval);
    wqState.timerInterval = null;
  }
  hideQuizTimerDisplay();

  const modal = document.getElementById('web-quiz-player-modal');
  if (!modal) return;

  const questions = wqState.questions;
  const total = questions.length;

  // Compute score: count correct answers
  let correct = 0;
  let wrongQuestions = [];
  questions.forEach((q, index) => {
    const revStr = (q.reponse_obfusquee || '').split('').reverse().join('');
    let correctIdx = -1;
    try { correctIdx = parseInt(atob(revStr).split('').reverse().join('')); } catch(e) {}
    const answered = wqState.mode === 'evaluation' ? q.userAnswer : (q._lastAnswer !== undefined ? q._lastAnswer : null);
    const isCorrect = (answered !== null && answered !== undefined && answered === correctIdx);
    if (isCorrect) {
      correct++;
    } else {
      wrongQuestions.push({ index: index + 1, question: q.question, explication: q.explication });
    }
  });

  const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
  const note20 = total > 0 ? (correct / total * 20).toFixed(1).replace(/\.0$/, '') : 0;
  const elapsedSec = wqState.timerSeconds || 0;
  const mins = Math.floor(elapsedSec / 60);
  const secs = elapsedSec % 60;
  const timeStr = wqState.mode === 'evaluation' ? `${mins}:${secs.toString().padStart(2,'0')}` : null;

  if (wqState.mode === 'evaluation') {
    const defaultTitle = wqState.questions[0]?.question.substring(0, 30) + "...";
    saveUserScore("Quiz: " + defaultTitle, correct, total);
  }

  // I18n strings for score screen
  const lang = (typeof state !== 'undefined' && state.lang) ? state.lang : 'fr';
  const translations = {
    fr: {
      excellent: 'Excellent !', good: 'Bien joué !', review: 'À revoir !',
      concepts: '📚 Notions et connaissances à revoir :', question: 'Question',
      noConcepts: '🎉 Aucune notion à revoir ! Parfait !', note: 'Note',
      rawScore: 'Score brut', totalTime: 'Temps total', replay: '🔄 Rejouer', close: '✕ Fermer'
    },
    ar: {
      excellent: 'ممتاز !', good: 'أحسنت !', review: 'يحتاج مراجعة !',
      concepts: '📚 مفاهيم ومعارف يجب مراجعتها :', question: 'سؤال',
      noConcepts: '🎉 لا توجد مفاهيم لمراجعتها! مثالي!', note: 'النتيجة',
      rawScore: 'الدرجة الأصلية', totalTime: 'الوقت الإجمالي', replay: '🔄 إعادة اللعب', close: '✕ إغلاق'
    },
    en: {
      excellent: 'Excellent!', good: 'Well done!', review: 'Needs review!',
      concepts: '📚 Concepts and knowledge to review:', question: 'Question',
      noConcepts: '🎉 No concepts to review! Perfect!', note: 'Score',
      rawScore: 'Raw score', totalTime: 'Total time', replay: '🔄 Replay', close: '✕ Close'
    }
  };
  const t = translations[lang] || translations['fr'];

  // Color by score
  const color = pct >= 75 ? '#4caf50' : pct >= 50 ? '#ffa500' : '#ff4d4d';
  const emoji = pct >= 75 ? '🏆' : pct >= 50 ? '👍' : '📚';
  const mention = pct >= 75 ? t.excellent : pct >= 50 ? t.good : t.review;

  let reportHtml = '';
  if (wrongQuestions.length > 0) {
    reportHtml = `
      <div style="flex: 2 1 400px; min-width:300px; max-height:100%; display:flex; flex-direction:column; background:rgba(255,255,255,0.05); padding:24px; border-radius:16px; border:1px solid rgba(255,255,255,0.1); box-sizing:border-box; text-align:${lang === 'ar' ? 'right' : 'left'};">
        <h3 style="color:#ffa500; margin-top:0; margin-bottom:16px; font-size:18px; flex-shrink:0;">${t.concepts}</h3>
        <ul style="padding-${lang === 'ar' ? 'right' : 'left'}:20px; margin:0; font-size:14px; color:#ddd; display:flex; flex-direction:column; gap:16px; overflow-y:auto; flex:1; padding-right:10px;">
          ${wrongQuestions.map(wq => `
            <li>
              <strong>${t.question} ${wq.index} :</strong> ${typeof renderWithLatex === 'function' ? renderWithLatex(wq.question) : wq.question}
              ${wq.explication ? `<div style="margin-top:6px; color:#aaa; font-style:italic; line-height:1.4;">💡 ${typeof renderWithLatex === 'function' ? renderWithLatex(wq.explication) : wq.explication}</div>` : ''}
            </li>
          `).join('')}
        </ul>
      </div>
    `;
  } else {
    reportHtml = `
      <div style="flex: 2 1 400px; min-width:300px; max-height:100%; display:flex; align-items:center; justify-content:center; background:rgba(76, 175, 80, 0.1); padding:24px; border-radius:16px; border:1px solid rgba(76, 175, 80, 0.3); box-sizing:border-box;">
        <h3 style="color:#4caf50; margin:0; font-size:20px; text-align:center;">${t.noConcepts}</h3>
      </div>
    `;
  }

  const scoreHtml = `
    <div id="wq-score-screen" style="
      display:flex; flex-direction:column; padding: 24px; width:100%; height:100%; box-sizing:border-box; overflow:hidden;" dir="${lang === 'ar' ? 'rtl' : 'ltr'}">
      
      <div style="display:flex; flex:1; min-height:0; gap:24px; flex-direction:row; align-items:stretch; flex-wrap:wrap; overflow-y:auto; align-content:stretch;">
        
        <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; flex: 1 1 240px; min-width:240px; max-height:100%; padding:20px; background:rgba(255,255,255,0.03); border-radius:16px; border:1px solid rgba(255,255,255,0.08); text-align:center; box-sizing:border-box;">
          <div style="font-size:48px;">${emoji}</div>
          <div style="font-size:24px; font-weight:800; color:${color}; margin-top:12px;">${mention}</div>
          <div style="font-size:36px; font-weight:900; color:${color}; letter-spacing:1px; margin-top:16px;">
            ${t.note} : <span dir="ltr">${note20} / 20</span>
          </div>
          <div style="font-size:16px; color: var(--color-on-surface, #ccc); margin-top:12px;">
            ${t.rawScore} : <strong style="color:${color};" dir="ltr">${correct} / ${total}</strong> <span dir="ltr">(${pct}%)</span>
          </div>
          ${timeStr ? `<div style="font-size:14px; color:#888; margin-top:8px;">${t.totalTime} : <strong style="color:#d4af37;" dir="ltr">${timeStr}</strong></div>` : ''}
          <div style="width:100%; max-width:200px; height:6px; background:rgba(255,255,255,0.1); border-radius:99px; overflow:hidden; margin-top:20px; flex-shrink:0;">
            <div style="height:100%; width:${pct}%; background:${color}; border-radius:99px; transition:width 0.8s ease;"></div>
          </div>
        </div>
        
        ${reportHtml}
      </div>

      <div style="display:flex; gap:12px; flex-wrap:wrap; justify-content:center; margin-top:24px; flex-shrink:0;">
        <button id="wq-score-save" style="
          padding:10px 24px; border-radius:10px; border:1px solid rgba(0,255,157,0.4);
          background:rgba(0,255,157,0.1); color:var(--neon); font-weight:700; cursor:pointer; font-size:14px;">
          💾 Sauvegarder ce Quiz
        </button>
        <button id="wq-score-restart" style="
          padding:10px 24px; border-radius:10px; border:1px solid rgba(212,175,55,0.4);
          background:rgba(212,175,55,0.1); color:#d4af37; font-weight:700; cursor:pointer; font-size:14px;">
          ${t.replay}
        </button>
        <button id="wq-score-close" style="
          padding:10px 24px; border-radius:10px; border:1px solid rgba(255,255,255,0.15);
          background:rgba(255,255,255,0.05); color:#fff; font-weight:700; cursor:pointer; font-size:14px;">
          ${t.close}
        </button>
      </div>
    </div>`;

  // Replace modal body content
  const body = modal.querySelector('.wq-body') || modal.querySelector('.wq-content') || modal;
  const existingScore = modal.querySelector('#wq-score-screen');
  if (existingScore) existingScore.remove();

  // Hide all quiz UI, show only score
  const quizElements = modal.querySelectorAll('.wq-header, .wq-body, .wq-footer, #wq-feedback, #wq-ai-response-container');
  quizElements.forEach(el => el.style.display = 'none');

  const scoreWrapper = document.createElement('div');
  scoreWrapper.innerHTML = scoreHtml;
  const container = modal.querySelector('.web-quiz-container') || modal;
  container.appendChild(scoreWrapper.firstElementChild);

  // Trigger MathJax if available
  if (window.MathJax && typeof window.MathJax.typesetPromise === 'function') {
    try {
      window.MathJax.typesetPromise([modal.querySelector('#wq-score-screen')]).catch(err => console.log(err));
    } catch(e) {}
  }

  // Restart button
  modal.querySelector('#wq-score-restart')?.addEventListener('click', () => {
    modal.querySelector('#wq-score-screen')?.remove();
    quizElements.forEach(el => el.style.display = '');
    document.getElementById('import-quiz-json-input').click();
  });

  // Close button
  modal.querySelector('#wq-score-close')?.addEventListener('click', () => {
    modal.querySelector('#wq-score-screen')?.remove();
    quizElements.forEach(el => el.style.display = '');
    modal.classList.remove('active');
  });

  // Save button — délégation dans showFinalScoreScreen (garder comme fallback)
  modal.querySelector('#wq-score-save')?.addEventListener('click', () => {
    if (window.saveCurrentQuiz) window.saveCurrentQuiz();
  });
}

// ─── Délégation globale bouton Sauvegarder Quiz ────────────────────────────
document.addEventListener('click', (e) => {
  if (e.target.closest('#wq-score-save')) {
    console.log("Clic détecté sur #wq-score-save par délégation globale.");
    e.stopImmediatePropagation();
    if (window.saveCurrentQuiz) {
      window.saveCurrentQuiz();
    } else {
      alert('Fonction de sauvegarde non disponible.');
    }
  }
});

// Wire up the TERMINER button (Evaluation mode)
document.addEventListener('click', (e) => {
  const finishBtn = e.target.closest('#wq-btn-finish');
  if (finishBtn) {
    showFinalScoreScreen();
  }
  const finishRevBtn = e.target.closest('#wq-btn-finish-revision');
  if (finishRevBtn) {
    showFinalScoreScreen();
  }
});

// ─── JSON QUIZ IMPORT & EVALUATION MODE ─────────────────────────────────────

document.addEventListener('click', (e) => {
  const btn = e.target.closest('#import-quiz-json-btn');
  if (btn) {
    document.getElementById('import-quiz-json-input').click();
  }
});

document.addEventListener('change', (e) => {
  if (e.target.id === 'import-quiz-json-input') {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        let content = ev.target.result;
        if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);
        const json = JSON.parse(content);
        const questions = Array.isArray(json) ? json : (json.questions || []);
        if (!questions || questions.length === 0) throw new Error('Format invalide');

        // Demander le mode
        // Demander le mode via le modal élégant
        if (json.type === 'QR') {
          _showFlashCardPlayer(questions, json);
        } else {
          wqState.metadata = json;
          askQuizMode((mode) => { startWebQuizFromData(questions, mode); });
        }
        if (json.type === 'QR') { _showFlashCardPlayer(questions, json); } else { wqState.metadata = json; startWebQuizFromData(questions, mode); }
      } catch (err) {
        console.error(err);
        alert(t('msg_json_load_error'));
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  }
});

function startWebQuizFromData(questions, mode) {
  wqState.questions = questions.map(q => {
    if (typeof q === 'string') return { question: q, choix: [], explication: '' };
    return q;
  });
  wqState.currentIndex = 0;
  wqState.selectedChoice = null;
  wqState.isVerified = false;
  wqState.mode = mode;
  wqState.score = 0;
  
  if (wqState.timerInterval) clearInterval(wqState.timerInterval);
  wqState.timerSeconds = 0;
  // Read the per-question timer setting from sidebar (default 30s)
  wqState.secondsPerQuestion = parseInt(document.getElementById('quiz-eval-timer-input')?.value) || 30;
  wqState.questionTimeLeft = wqState.secondsPerQuestion;

  if (mode === 'evaluation') {
    startQuestionCountdown();
  } else {
    hideQuizTimerDisplay();
  }

  document.getElementById('web-quiz-player-modal').classList.add('active');
  window.renderWebQuizPlayer();
}

function startQuestionCountdown() {
  if (wqState.timerInterval) clearInterval(wqState.timerInterval);
  wqState.questionTimeLeft = wqState.secondsPerQuestion;
  updateQuizTimerDisplay();
  wqState.timerInterval = setInterval(() => {
    wqState.questionTimeLeft--;
    wqState.timerSeconds++; // keep total elapsed for final score screen
    updateQuizTimerDisplay();
    if (wqState.questionTimeLeft <= 0) {
      clearInterval(wqState.timerInterval);
      wqState.timerInterval = null;
      // Auto-advance: mark unanswered and go next
      if (wqState.mode === 'evaluation') {
        if (wqState.selectedChoice === null) {
          wqState.questions[wqState.currentIndex].userAnswer = null; // unanswered
        }
        if (wqState.currentIndex < wqState.questions.length - 1) {
          wqState.currentIndex++;
          wqState.selectedChoice = null;
          window.renderWebQuizPlayer();
          startQuestionCountdown();
        } else {
          // Last question — show finish screen
          window.renderWebQuizPlayer();
          const finishBtn = document.getElementById('wq-btn-finish');
          if (finishBtn) finishBtn.click();
        }
      }
    }
  }, 1000);
}

function updateQuizTimerDisplay() {
  let timerEl = document.getElementById('wq-timer-display');
  if (!timerEl) {
    timerEl = document.createElement('div');
    timerEl.id = 'wq-timer-display';
    timerEl.style.cssText = 'position:absolute; top:12px; left:50%; transform:translateX(-50%); font-weight:bold; background:rgba(0,0,0,0.5); padding: 4px 16px; border-radius: 12px; font-family: monospace; font-size: 18px; border: 1px solid rgba(212,175,55,0.4); transition: color 0.3s;';
    const header = document.querySelector('#web-quiz-player-modal .wq-header');
    if (header) header.appendChild(timerEl);
  }
  const t = wqState.questionTimeLeft !== undefined ? wqState.questionTimeLeft : 0;
  const min = Math.floor(t / 60);
  const sec = t % 60;
  // Change color: green > 10s, orange 5-10s, red <= 5s
  timerEl.style.color = t <= 5 ? '#ff4d4d' : t <= 10 ? '#ffa500' : '#d4af37';
  timerEl.style.borderColor = t <= 5 ? 'rgba(255,77,77,0.5)' : t <= 10 ? 'rgba(255,165,0,0.5)' : 'rgba(212,175,55,0.4)';
  timerEl.innerText = `${min}:${sec.toString().padStart(2, '0')}`;
  timerEl.style.display = 'block';
}

function hideQuizTimerDisplay() {
  const timerEl = document.getElementById('wq-timer-display');
  if (timerEl) timerEl.style.display = 'none';
}

// OFFLINE MODE DETECTION
window.addEventListener('offline', () => {
  toast('Vous êtes hors-ligne. Mode lecture seule (Archives/Mes Quiz) activé.', 'warning');
});
window.addEventListener('online', () => {
  toast("Connexion rétablie. L'IA est de nouveau disponible.", 'success');
});

// Save/load buttons are handled by Vue @click + CustomEvents — no global delegation needed









