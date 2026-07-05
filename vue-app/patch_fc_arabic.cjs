const fs = require('fs');
const path = require('path');

const filepath = path.join(__dirname, 'src', 'legacy.js');
let content = fs.readFileSync(filepath, 'utf8');

// The exact strings in the file:
const target1 = `/^\\s*(?:\\u2022|-|\\*)?\\s*(?:\\*\\*|__)?r[e\\u00e9\\u00e8\\u00ea]ponse\\s*(?:\\*\\*|__)?\\s*:/i`;
const target1r = `replace(/^\\s*(?:\\u2022|-|\\*)?\\s*(?:\\*\\*|__)?r[e\\u00e9\\u00e8\\u00ea]ponse\\s*(?:\\*\\*|__)?\\s*:\\s*/i, '')`;

const target2 = `/^\\s*(?:\\u2022|-|\\*)?\\s*(?:\\*\\*|__)?explication\\s*(?:\\*\\*|__)?\\s*:/i`;
const target2r = `replace(/^\\s*(?:\\u2022|-|\\*)?\\s*(?:\\*\\*|__)?explication\\s*(?:\\*\\*|__)?\\s*:\\s*/i, '')`;

const target3 = `/^\\s*(?:\\u2022|-|\\*)?\\s*(?:\\*\\*|__)?pour aller plus loin\\s*(?:\\*\\*|__)?\\s*:/i`;
const target3r = `replace(/^\\s*(?:\\u2022|-|\\*)?\\s*(?:\\*\\*|__)?pour aller plus loin\\s*(?:\\*\\*|__)?\\s*:\\s*/i, '')`;

const rep1 = `/^\\s*(?:\\u2022|-|\\*)?\\s*(?:\\*\\*|__)?(?:r[e\\u00e9\\u00e8\\u00ea]ponse|الجواب)\\s*(?:\\*\\*|__)?\\s*:/i`;
const rep1r = `replace(/^\\s*(?:\\u2022|-|\\*)?\\s*(?:\\*\\*|__)?(?:r[e\\u00e9\\u00e8\\u00ea]ponse|الجواب)\\s*(?:\\*\\*|__)?\\s*:\\s*/i, '')`;

const rep2 = `/^\\s*(?:\\u2022|-|\\*)?\\s*(?:\\*\\*|__)?(?:explication|الشرح)\\s*(?:\\*\\*|__)?\\s*:/i`;
const rep2r = `replace(/^\\s*(?:\\u2022|-|\\*)?\\s*(?:\\*\\*|__)?(?:explication|الشرح)\\s*(?:\\*\\*|__)?\\s*:\\s*/i, '')`;

const rep3 = `/^\\s*(?:\\u2022|-|\\*)?\\s*(?:\\*\\*|__)?(?:pour aller plus loin|للمزيد)\\s*(?:\\*\\*|__)?\\s*:/i`;
const rep3r = `replace(/^\\s*(?:\\u2022|-|\\*)?\\s*(?:\\*\\*|__)?(?:pour aller plus loin|للمزيد)\\s*(?:\\*\\*|__)?\\s*:\\s*/i, '')`;

content = content.replace(target1, rep1).replace(target1r, rep1r);
content = content.replace(target2, rep2).replace(target2r, rep2r);
content = content.replace(target3, rep3).replace(target3r, rep3r);

fs.writeFileSync(filepath, content, 'utf8');
console.log('Patch complete.');
