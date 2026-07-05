import re
import os

filepath = os.path.join(os.path.dirname(__file__), 'src', 'legacy.js')
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update isFcMsg and isFc and isArabic definitions
content = content.replace(
    "msg.workflowUsed === 'FC-Ar 1' || msg.workflowUsed === 'FC-Ar 2'",
    "msg.workflowUsed === 'FC-Ar 1' || msg.workflowUsed === 'FC-Ar 2' || msg.workflowUsed === 'FC-En 1' || msg.workflowUsed === 'FC-En 2'"
)
content = content.replace(
    "m.workflowUsed === 'FC-Ar 1' || m.workflowUsed === 'FC-Ar 2'",
    "m.workflowUsed === 'FC-Ar 1' || m.workflowUsed === 'FC-Ar 2' || m.workflowUsed === 'FC-En 1' || m.workflowUsed === 'FC-En 2'"
)

# 2. Add isEnglish definition where isArabic is defined
# In renderFlashcards, around line 6679
content = content.replace(
    "const isArabic = (msg.workflowUsed === 'FC-Ar 1' || msg.workflowUsed === 'FC-Ar 2') || arabicRegex.test(msg.content);",
    "const isArabic = (msg.workflowUsed === 'FC-Ar 1' || msg.workflowUsed === 'FC-Ar 2') || arabicRegex.test(msg.content);\n  const isEnglish = (msg.workflowUsed === 'FC-En 1' || msg.workflowUsed === 'FC-En 2');"
)

# 3. Add to priorities (around line 1678)
content = content.replace(
    "\"FC-Ar 2\": 4.6,",
    "\"FC-Ar 2\": 4.6,\n      \"FC-En 1\": 5.5,\n      \"FC-En 2\": 5.6,"
)

# 4. English translations for UI (isArabic ? 'ar' : 'fr' -> isArabic ? 'ar' : (isEnglish ? 'en' : 'fr'))
replacements = [
    ("isArabic ? 'عودة ◀' : '◀ Retour'", "isArabic ? 'عودة ◀' : (isEnglish ? '◀ Back' : '◀ Retour')"),
    ("isArabic ? '💡 التفاصيل — بطاقة' : '💡 DÉTAIL — CARTE'", "isArabic ? '💡 التفاصيل — بطاقة' : (isEnglish ? '💡 DETAIL — CARD' : '💡 DÉTAIL — CARTE')"),
    ("isArabic ? '❓ السؤال' : '❓ QUESTION'", "isArabic ? '❓ السؤال' : (isEnglish ? '❓ QUESTION' : '❓ QUESTION')"),
    ("isArabic ? '✅ الجواب' : '✅ RÉPONSE'", "isArabic ? '✅ الجواب' : (isEnglish ? '✅ ANSWER' : '✅ RÉPONSE')"),
    ("isArabic ? '💡 الشرح' : '💡 EXPLICATION'", "isArabic ? '💡 الشرح' : (isEnglish ? '💡 EXPLANATION' : '💡 EXPLICATION')"),
    ("isArabic ? '🔗 للمزيد من المعلومات' : '🔗 POUR ALLER PLUS LOIN'", "isArabic ? '🔗 للمزيد من المعلومات' : (isEnglish ? '🔗 TO GO FURTHER' : '🔗 POUR ALLER PLUS LOIN')"),
    ("isArabic ? 'بطاقات تعليمية' : 'FlashCards'", "isArabic ? 'بطاقات تعليمية' : (isEnglish ? 'FlashCards' : 'FlashCards')"),
    ("isArabic ? '👆 انقر لرؤية الجواب' : '👆 Cliquez pour voir la réponse'", "isArabic ? '👆 انقر لرؤية الجواب' : (isEnglish ? '👆 Click to see the answer' : '👆 Cliquez pour voir la réponse')"),
    ("isArabic ? '💡 عرض التفاصيل' : '💡 Voir le détail'", "isArabic ? '💡 عرض التفاصيل' : (isEnglish ? '💡 View details' : '💡 Voir le détail')"),
    ("isArabic ? '🤖 طلب الشرح' : '🤖 Expliquer (IA)'", "isArabic ? '🤖 طلب الشرح' : (isEnglish ? '🤖 Explain (AI)' : '🤖 Expliquer (IA)')"),
    ("isArabic ? 'السابق ◀' : '◀ Précédent'", "isArabic ? 'السابق ◀' : (isEnglish ? '◀ Previous' : '◀ Précédent')"),
    ("isArabic ? '💾 حفظ' : '💾 Sauvegarder'", "isArabic ? '💾 حفظ' : (isEnglish ? '💾 Save' : '💾 Sauvegarder')"),
    ("isArabic ? 'التالي ▶' : 'Suivant ▶'", "isArabic ? 'التالي ▶' : (isEnglish ? 'Next ▶' : 'Suivant ▶')"),
    ("isArabic ? '✕ إغلاق' : '✕ Fermer'", "isArabic ? '✕ إغلاق' : (isEnglish ? '✕ Close' : '✕ Fermer')"),
    ("isArabic ? 'يرجى إعداد مفتاح API Mistral في الإعدادات.' : 'Veuillez configurer votre clé API Mistral dans les paramètres.'", "isArabic ? 'يرجى إعداد مفتاح API Mistral في الإعدادات.' : (isEnglish ? 'Please configure your Mistral API key in settings.' : 'Veuillez configurer votre clé API Mistral dans les paramètres.')"),
]

for old, new in replacements:
    content = content.replace(old, new)

# 5. Fix prompt mapping for explanations
prompt_ar = "السؤال: \\\"${card.question}\\\"\\nالجواب: \\\"${card.reponse || ''}\\\"\\n\\nاشرح هذا الجواب بأسلوب تعليمي مبسط ومفصل. يجب أن تكون إجابتك باللغة العربية فقط."
prompt_fr = "Question: \\\"${card.question}\\\"\\nRéponse: \\\"${card.reponse || ''}\\\"\\n\\nExplique-moi cette réponse de manière pédagogique, simple et détaillée. Réponds impérativement en français."
prompt_en = "Question: \\\"${card.question}\\\"\\nAnswer: \\\"${card.reponse || ''}\\\"\\n\\nExplain this answer in an educational, simple, and detailed manner. You must reply in English."

sys_ar = "أنت خبير تعليمي. يجب عليك تقديم شرح واضح ومبسط ومفصل. أجب باللغة العربية حصراً."
sys_fr = "Tu es un expert pédagogique. Tu dois fournir une explication claire, accessible et détaillée en français."
sys_en = "You are an educational expert. You must provide a clear, accessible, and detailed explanation in English."

content = content.replace(
    f"const promptText = isArabic \n      ? `{prompt_ar}`\n      : `{prompt_fr}`;",
    f"const promptText = isArabic \n      ? `{prompt_ar}`\n      : (isEnglish ? `{prompt_en}` : `{prompt_fr}`);"
)

content = content.replace(
    f"const sysPrompt = isArabic\n      ? \"{sys_ar}\"\n      : \"{sys_fr}\";",
    f"const sysPrompt = isArabic\n      ? \"{sys_ar}\"\n      : (isEnglish ? \"{sys_en}\" : \"{sys_fr}\");"
)

# 6. Parse Regex Update
content = content.replace(
    "const rep1 = `/^\\s*(?:\\u2022|-|\\*)?\\s*(?:\\*\\*|__)?(?:r[eéèê]ponse|الجواب)\\s*(?:\\*\\*|__)?\\s*:/i`;",
    "const rep1 = `/^\\s*(?:\\u2022|-|\\*)?\\s*(?:\\*\\*|__)?(?:r[eéèê]ponse|الجواب|Answer)\\s*(?:\\*\\*|__)?\\s*:/i`;"
)
content = content.replace(
    "replace(/^\\s*(?:\\u2022|-|\\*)?\\s*(?:\\*\\*|__)?(?:r[eéèê]ponse|الجواب)\\s*(?:\\*\\*|__)?\\s*:\\s*/i, '')",
    "replace(/^\\s*(?:\\u2022|-|\\*)?\\s*(?:\\*\\*|__)?(?:r[eéèê]ponse|الجواب|Answer)\\s*(?:\\*\\*|__)?\\s*:\\s*/i, '')"
)
content = content.replace(
    "const rep2 = `/^\\s*(?:\\u2022|-|\\*)?\\s*(?:\\*\\*|__)?(?:explication|الشرح)\\s*(?:\\*\\*|__)?\\s*:/i`;",
    "const rep2 = `/^\\s*(?:\\u2022|-|\\*)?\\s*(?:\\*\\*|__)?(?:explication|الشرح|Explanation)\\s*(?:\\*\\*|__)?\\s*:/i`;"
)
content = content.replace(
    "replace(/^\\s*(?:\\u2022|-|\\*)?\\s*(?:\\*\\*|__)?(?:explication|الشرح)\\s*(?:\\*\\*|__)?\\s*:\\s*/i, '')",
    "replace(/^\\s*(?:\\u2022|-|\\*)?\\s*(?:\\*\\*|__)?(?:explication|الشرح|Explanation)\\s*(?:\\*\\*|__)?\\s*:\\s*/i, '')"
)
content = content.replace(
    "const rep3 = `/^\\s*(?:\\u2022|-|\\*)?\\s*(?:\\*\\*|__)?(?:pour aller plus loin|للمزيد)\\s*(?:\\*\\*|__)?\\s*:/i`;",
    "const rep3 = `/^\\s*(?:\\u2022|-|\\*)?\\s*(?:\\*\\*|__)?(?:pour aller plus loin|للمزيد|To go further)\\s*(?:\\*\\*|__)?\\s*:/i`;"
)
content = content.replace(
    "replace(/^\\s*(?:\\u2022|-|\\*)?\\s*(?:\\*\\*|__)?(?:pour aller plus loin|للمزيد)\\s*(?:\\*\\*|__)?\\s*:\\s*/i, '')",
    "replace(/^\\s*(?:\\u2022|-|\\*)?\\s*(?:\\*\\*|__)?(?:pour aller plus loin|للمزيد|To go further)\\s*(?:\\*\\*|__)?\\s*:\\s*/i, '')"
)
# And the parseCard loop
content = content.replace(
    "const isRep = /^\\s*(?:\\u2022|-|\\*)?\\s*(?:\\*\\*|__)?(?:r[eéèê]ponse|الجواب)\\s*(?:\\*\\*|__)?\\s*:/i.test(l);",
    "const isRep = /^\\s*(?:\\u2022|-|\\*)?\\s*(?:\\*\\*|__)?(?:r[eéèê]ponse|الجواب|Answer)\\s*(?:\\*\\*|__)?\\s*:/i.test(l);"
)
content = content.replace(
    "const isExp = /^\\s*(?:\\u2022|-|\\*)?\\s*(?:\\*\\*|__)?(?:explication|الشرح)\\s*(?:\\*\\*|__)?\\s*:/i.test(l);",
    "const isExp = /^\\s*(?:\\u2022|-|\\*)?\\s*(?:\\*\\*|__)?(?:explication|الشرح|Explanation)\\s*(?:\\*\\*|__)?\\s*:/i.test(l);"
)
content = content.replace(
    "const isPlus = /^\\s*(?:\\u2022|-|\\*)?\\s*(?:\\*\\*|__)?(?:pour aller plus loin|للمزيد)\\s*(?:\\*\\*|__)?\\s*:/i.test(l);",
    "const isPlus = /^\\s*(?:\\u2022|-|\\*)?\\s*(?:\\*\\*|__)?(?:pour aller plus loin|للمزيد|To go further)\\s*(?:\\*\\*|__)?\\s*:/i.test(l);"
)
content = content.replace(
    "l = l.replace(/^\\s*(?:\\u2022|-|\\*)?\\s*(?:\\*\\*|__)?(?:r[eéèê]ponse|الجواب)\\s*(?:\\*\\*|__)?\\s*:\\s*/i, '');",
    "l = l.replace(/^\\s*(?:\\u2022|-|\\*)?\\s*(?:\\*\\*|__)?(?:r[eéèê]ponse|الجواب|Answer)\\s*(?:\\*\\*|__)?\\s*:\\s*/i, '');"
)
content = content.replace(
    "l = l.replace(/^\\s*(?:\\u2022|-|\\*)?\\s*(?:\\*\\*|__)?(?:explication|الشرح)\\s*(?:\\*\\*|__)?\\s*:\\s*/i, '');",
    "l = l.replace(/^\\s*(?:\\u2022|-|\\*)?\\s*(?:\\*\\*|__)?(?:explication|الشرح|Explanation)\\s*(?:\\*\\*|__)?\\s*:\\s*/i, '');"
)
content = content.replace(
    "l = l.replace(/^\\s*(?:\\u2022|-|\\*)?\\s*(?:\\*\\*|__)?(?:pour aller plus loin|للمزيد)\\s*(?:\\*\\*|__)?\\s*:\\s*/i, '');",
    "l = l.replace(/^\\s*(?:\\u2022|-|\\*)?\\s*(?:\\*\\*|__)?(?:pour aller plus loin|للمزيد|To go further)\\s*(?:\\*\\*|__)?\\s*:\\s*/i, '');"
)

# 7. Inject FC-En Workflows
# Read workflowAr2 to see where to insert
wf_en_str = r'''

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
'''

content = content.replace("await db.put('workflows', workflowAr2);", "await db.put('workflows', workflowAr2);\n" + wf_en_str)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
print("Patch applied successfully.")
