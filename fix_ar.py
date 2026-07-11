import os

filepath = os.path.join(os.path.dirname(__file__), 'src', 'legacy.js')
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

target = "const isArabic = (msg.workflowUsed === 'FC-Ar 1' || msg.workflowUsed === 'FC-Ar 2' || msg.workflowUsed === 'FC-En 1' || msg.workflowUsed === 'FC-En 2') || arabicRegex.test(msg.content);"
replacement = "const isArabic = (msg.workflowUsed === 'FC-Ar 1' || msg.workflowUsed === 'FC-Ar 2') || arabicRegex.test(msg.content);\n  const isEnglish = (msg.workflowUsed === 'FC-En 1' || msg.workflowUsed === 'FC-En 2');"

content = content.replace(target, replacement)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
print("Fixed isArabic")
