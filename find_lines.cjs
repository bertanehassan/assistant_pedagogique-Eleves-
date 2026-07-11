const fs = require('fs');
const lines = fs.readFileSync('./src/legacy.js', 'utf8').split('\n');

const patterns = [
  'let wqState = {',
  'window.openWebQuizPlayer',
  'window.loadSavedQuiz',
  'sharedQuizId',
  'import-quiz-json-input',
  "window.confirm('Voulez",
];

patterns.forEach(p => {
  const i = lines.findIndex(l => l.includes(p));
  console.log(`"${p}" -> line ${i + 1}`);
});
