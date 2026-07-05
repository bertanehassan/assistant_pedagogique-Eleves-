import re

filepath = r"c:\Users\USER\Desktop\Mon Assistant IA 2026\agent IA1\vue-app\src\legacy.js"

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace reponse regex
content = re.sub(
    r'/^\s*\(\?:\u2022\|-\|\*\)\?\s*\(\?:\*\*\|__\)\?r\[e\\u00e9\\u00e8\\u00ea\]ponse\s*\(\?:\*\*\|__\)\?\s*:/i',
    r'/^\\s*(?:\\u2022|-|\\*)?\\s*(?:\\*\\*|__)?(?:r[e\\u00e9\\u00e8\\u00ea]ponse|الجواب)\\s*(?:\\*\\*|__)?\\s*:/i',
    content
)

# Replace reponse string match
content = re.sub(
    r"replace\(/^\\s\*\(\?:\\u2022\|-\|\\\*\)\?\\s\*\(\?:\\\*\\\*\|__\)\?r\[e\\u00e9\\u00e8\\u00ea\]ponse\\s\*\(\?:\\\*\\\*\|__\)\?\\s\*:\\s\*/i, ''\)",
    r"replace(/^\\s*(?:\\u2022|-|\\*)?\\s*(?:\\*\\*|__)?(?:r[e\\u00e9\\u00e8\\u00ea]ponse|الجواب)\\s*(?:\\*\\*|__)?\\s*:\\s*/i, '')",
    content
)

# Replace explication regex
content = re.sub(
    r'/^\s*\(\?:\u2022\|-\|\*\)\?\s*\(\?:\*\*\|__\)\?explication\s*\(\?:\*\*\|__\)\?\s*:/i',
    r'/^\\s*(?:\\u2022|-|\\*)?\\s*(?:\\*\\*|__)?(?:explication|الشرح)\\s*(?:\\*\\*|__)?\\s*:/i',
    content
)

# Replace explication string match
content = re.sub(
    r"replace\(/^\\s\*\(\?:\\u2022\|-\|\\\*\)\?\\s\*\(\?:\\\*\\\*\|__\)\?explication\\s\*\(\?:\\\*\\\*\|__\)\?\\s\*:\\s\*/i, ''\)",
    r"replace(/^\\s*(?:\\u2022|-|\\*)?\\s*(?:\\*\\*|__)?(?:explication|الشرح)\\s*(?:\\*\\*|__)?\\s*:\\s*/i, '')",
    content
)

# Replace pour aller plus loin regex
content = re.sub(
    r'/^\s*\(\?:\u2022\|-\|\*\)\?\s*\(\?:\*\*\|__\)\?pour aller plus loin\s*\(\?:\*\*\|__\)\?\s*:/i',
    r'/^\\s*(?:\\u2022|-|\\*)?\\s*(?:\\*\\*|__)?(?:pour aller plus loin|للمزيد)\\s*(?:\\*\\*|__)?\\s*:/i',
    content
)

# Replace pour aller plus loin string match
content = re.sub(
    r"replace\(/^\\s\*\(\?:\\u2022\|-\|\\\*\)\?\\s\*\(\?:\\\*\\\*\|__\)\?pour aller plus loin\\s\*\(\?:\\\*\\\*\|__\)\?\\s\*:\\s\*/i, ''\)",
    r"replace(/^\\s*(?:\\u2022|-|\\*)?\\s*(?:\\*\\*|__)?(?:pour aller plus loin|للمزيد)\\s*(?:\\*\\*|__)?\\s*:\\s*/i, '')",
    content
)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print("Patch applied successfully.")
