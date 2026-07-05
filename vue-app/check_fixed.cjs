const fs = require('fs');
const text = fs.readFileSync('src/legacy_fixed.js', 'utf8');
const bads = [
  'أ©', 'أ¨', 'أ®', 'أھ', 'أ§', 'أ´', 'أ»', 'أ¹', 'أ‰', 'أ\u00A0', 'â€™', 'إ“', 'â€”', 'â€¦', 'âœ…', 'ًں§\u00A0', 'ًں”—', 'âڑ ï¸', 'ًں\x93„', 'ًں–¼', 'ًںژµ', 'ًں•µï¸', 'â€\x8Dâ™‚ï¸'
];

let remaining = 0;
for (const b of bads) {
  const count = (text.match(new RegExp(b, 'g')) || []).length;
  if (count > 0) {
    console.log(`Found ${count} occurrences of ${b}`);
    remaining += count;
  }
}
console.log('Total remaining bad strings:', remaining);
