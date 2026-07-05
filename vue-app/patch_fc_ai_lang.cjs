const fs = require('fs');
const path = require('path');

const filepath = path.join(__dirname, 'src', 'legacy.js');
let content = fs.readFileSync(filepath, 'utf8');

const oldCode = `    const promptText = isArabic 
      ? \`اشرح بأسلوب تعليمي مبسط ومفصل الجواب عن هذا السؤال. السؤال: "\${card.question}". الجواب: "\${card.reponse || ''}". أجب باللغة العربية.\`
      : \`Explique-moi de manière pédagogique, simple et détaillée la réponse à cette question. Question: "\${card.question}". Réponse: "\${card.reponse || ''}". Réponds en français.\`;

    const reqBody = {
      model: "mistral-large-latest",
      messages: [
        { role: "system", content: "Tu es un expert pédagogique. Tu dois fournir une explication claire, accessible et détaillée." },
        { role: "user", content: promptText }
      ],`;

const newCode = `    const promptText = isArabic 
      ? \`السؤال: "\${card.question}"\\nالجواب: "\${card.reponse || ''}"\\n\\nاشرح هذا الجواب بأسلوب تعليمي مبسط ومفصل. يجب أن تكون إجابتك باللغة العربية فقط.\`
      : \`Question: "\${card.question}"\\nRéponse: "\${card.reponse || ''}"\\n\\nExplique-moi cette réponse de manière pédagogique, simple et détaillée. Réponds impérativement en français.\`;

    const sysPrompt = isArabic
      ? "أنت خبير تعليمي. يجب عليك تقديم شرح واضح ومبسط ومفصل. أجب باللغة العربية حصراً."
      : "Tu es un expert pédagogique. Tu dois fournir une explication claire, accessible et détaillée en français.";

    const reqBody = {
      model: "mistral-large-latest",
      messages: [
        { role: "system", content: sysPrompt },
        { role: "user", content: promptText }
      ],`;

content = content.replace(oldCode, newCode);

fs.writeFileSync(filepath, content, 'utf8');
console.log('Patch complete.');
