import os

filepath = os.path.join(os.path.dirname(__file__), 'src', 'legacy.js')
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# Fix Answer
content = content.replace(
    r"/^\s*(?:\u2022|-|\*)?\s*(?:\*\*|__)?(?:r[e\u00e9\u00e8\u00ea]ponse|الجواب)\s*(?:\*\*|__)?\s*:/i",
    r"/^\s*(?:\u2022|-|\*)?\s*(?:\*\*|__)?(?:r[e\u00e9\u00e8\u00ea]ponse|الجواب|Answer)\s*(?:\*\*|__)?\s*:/i"
)
content = content.replace(
    r"/^\s*(?:\u2022|-|\*)?\s*(?:\*\*|__)?(?:r[e\u00e9\u00e8\u00ea]ponse|الجواب)\s*(?:\*\*|__)?\s*:\s*/i",
    r"/^\s*(?:\u2022|-|\*)?\s*(?:\*\*|__)?(?:r[e\u00e9\u00e8\u00ea]ponse|الجواب|Answer)\s*(?:\*\*|__)?\s*:\s*/i"
)

# Fix Explanation
content = content.replace(
    r"/^\s*(?:\u2022|-|\*)?\s*(?:\*\*|__)?(?:explication|الشرح)\s*(?:\*\*|__)?\s*:/i",
    r"/^\s*(?:\u2022|-|\*)?\s*(?:\*\*|__)?(?:explication|الشرح|Explanation)\s*(?:\*\*|__)?\s*:/i"
)
content = content.replace(
    r"/^\s*(?:\u2022|-|\*)?\s*(?:\*\*|__)?(?:explication|الشرح)\s*(?:\*\*|__)?\s*:\s*/i",
    r"/^\s*(?:\u2022|-|\*)?\s*(?:\*\*|__)?(?:explication|الشرح|Explanation)\s*(?:\*\*|__)?\s*:\s*/i"
)

# Fix To go further
content = content.replace(
    r"/^\s*(?:\u2022|-|\*)?\s*(?:\*\*|__)?(?:pour aller plus loin|للمزيد)\s*(?:\*\*|__)?\s*:/i",
    r"/^\s*(?:\u2022|-|\*)?\s*(?:\*\*|__)?(?:pour aller plus loin|للمزيد|To go further)\s*(?:\*\*|__)?\s*:/i"
)
content = content.replace(
    r"/^\s*(?:\u2022|-|\*)?\s*(?:\*\*|__)?(?:pour aller plus loin|للمزيد)\s*(?:\*\*|__)?\s*:\s*/i",
    r"/^\s*(?:\u2022|-|\*)?\s*(?:\*\*|__)?(?:pour aller plus loin|للمزيد|To go further)\s*(?:\*\*|__)?\s*:\s*/i"
)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print("Regexes updated successfully.")
