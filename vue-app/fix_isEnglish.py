import os

filepath = os.path.join(os.path.dirname(__file__), 'src', 'legacy.js')
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

target1 = "function _showFlashCardPlayer(cards, metadata = {}, msgId = null, isArabic = false) {"
replacement1 = "function _showFlashCardPlayer(cards, metadata = {}, msgId = null, isArabic = false, isEnglish = false) {"

target2 = "_showFlashCardPlayer(cards, { titre: extractSubjectFromContent(msg.content) }, msgId, isArabic);"
replacement2 = "_showFlashCardPlayer(cards, { titre: extractSubjectFromContent(msg.content) }, msgId, isArabic, isEnglish);"

if target1 in content and target2 in content:
    content = content.replace(target1, replacement1)
    content = content.replace(target2, replacement2)
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Fixed isEnglish scope")
else:
    print("Error: Target not found")
