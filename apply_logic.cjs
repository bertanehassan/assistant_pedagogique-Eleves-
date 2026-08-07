const fs = require('fs');

const code = `
// ════════════════════════════════════════
// UTILS: NAKED LATEX AUTO-FIXER
// ════════════════════════════════════════
const KNOWN_LATEX_CMDS = new Set([
  'frac','sqrt','overline','underline','vec','hat','bar','tilde','dot','ddot',
  'widehat','widetilde','left','right','cdot','times','pm','mp',
  'leq','geq','neq','approx','equiv','infty','iff','implies','to',
  'rightarrow','leftarrow','leftrightarrow','Rightarrow','Leftarrow','longrightarrow',
  'alpha','beta','gamma','delta','epsilon','theta','lambda','mu','nu','pi',
  'sigma','tau','omega','Omega','Delta','Sigma','Pi',
  'int','sum','prod','lim','log','ln','sin','cos','tan','arg','pmod','mod','binom',
  'text','mathrm','mathbf','mathit','begin','end','lvert','rvert','lVert','rVert',
  'quad','qquad','forall','exists','partial','nabla',
  'in','notin','subset','subseteq','cup','cap','otimes','oplus'
]);

const LATEX_STOP_WORDS = new Set([
  'et','ou','de','du','le','la','les','un','une','des','en','au','aux',
  'ce','sa','se','si','ne','ni','on','il','je','tu','me','te','ma','ta',
  'par','car','est','que','qui','sur','son','ses','nos','vos','pas','peu',
  'the','and','for','are','was','has','had','its','but','not','you','all',
  'can','her','him','his','how','may','new','now','old','our','out','own',
  'Calcul','calcul','module','Module','argument','Argument','forme','Forme',
  'soit','Soit','donc','Donc','avec','Avec','pour','Pour',
  'dans','Dans','sous','Sous','ici','Ici','voir','Voir',
  'valeur','Valeur','vaut','Vaut','Passage','passage','aux','Aux',
  'Conclusion','conclusion','ensemble','Ensemble','points','Points','Or','or'
]);

function isNaturalLanguageWord(word) {
  if (!word || word.length === 0) return false;
  if (KNOWN_LATEX_CMDS.has(word)) return false;
  if (LATEX_STOP_WORDS.has(word)) return true;
  if (word.length === 1) return false;
  if (word.length >= 3) return true;
  return false;
}

function scanBackwardMath(t, pos) {
  let i = pos - 1;
  while (i >= 0 && t[i] === ' ') i--;
  while (i >= 0) {
    const ch = t[i];
    if (ch === '\\x00' || ch === '\\n') return i + 1;
    if (ch === '>' || ch === '<') return i + 1;
    if (ch === '*' && i > 0 && t[i-1] === '*') return i;
    if (ch === '|') {
      const isMathPipe = (i > 0 && t[i-1] === '\\\\') ||
                         (i < t.length - 1 && /[0-9a-zA-Z_\\-+=\\\/()\\[\\]]/.test(t[i+1] || ''));
      if (!isMathPipe) return i + 1;
    }
    if (/[a-zA-Zéèêëàâäùûüîïôöçœæ]/.test(ch)) {
      let wordStart = i;
      while (wordStart > 0 && /[a-zA-Zéèêëàâäùûüîïôöçœæ]/.test(t[wordStart - 1])) {
        wordStart--;
      }
      const word = t.substring(wordStart, i + 1);
      if (isNaturalLanguageWord(word)) {
        return i + 1;
      }
      i = wordStart - 1;
      while (i >= 0 && t[i] === ' ') i--;
      continue;
    }
    if (/[0-9_^+\\-=\\*/.,(){}\\|]/.test(ch)) {
      i--;
      continue;
    }
    if (ch === "'") return i + 1;
    if (ch === ' ') {
      i--;
      continue;
    }
    return i + 1;
  }
  return 0;
}

function scanForwardMath(t, pos) {
  let j = pos;
  let braceDepth = 0;
  while (j < t.length) {
    if (t[j] === '\\x00') break;
    if (t[j] === '\\n' && braceDepth === 0) break;
    if (t[j] === '<' && braceDepth === 0) break;
    if (t[j] === '*' && j < t.length - 1 && t[j+1] === '*' && braceDepth === 0) break;
    if (t[j] === '|') {
      const isMathPipe = (j > 0 && t[j-1] === '\\\\') ||
                         (j < t.length - 1 && /[0-9a-zA-Z_\\-+=\\\/()\\[\\]]/.test(t[j+1] || ''));
      if (!isMathPipe && braceDepth === 0) break;
    }
    if (t[j] === '{' || t[j] === '[' || t[j] === '(') braceDepth++;
    else if (t[j] === '}' || t[j] === ']' || t[j] === ')') braceDepth = Math.max(0, braceDepth - 1);
    
    if (braceDepth === 0 && /[a-zA-Zéèêëàâäùûüîïôöçœæ]/.test(t[j])) {
      let wordEnd = j;
      while (wordEnd < t.length && /[a-zA-Zéèêëàâäùûüîïôöçœæ]/.test(t[wordEnd])) {
        wordEnd++;
      }
      const word = t.substring(j, wordEnd);
      if (isNaturalLanguageWord(word)) {
        break;
      }
      j = wordEnd;
      while (j < t.length && t[j] === ' ') j++;
      continue;
    }
    if (/[0-9_^+\\-=\\*/.,(){}\\| ]/.test(t[j])) {
      j++;
      continue;
    }
    if (t[j] === "'") { j++; continue; }
    if (t[j] === '\\\\') {
      let cmdEnd = j + 1;
      while (cmdEnd < t.length && /[a-zA-Z]/.test(t[cmdEnd])) cmdEnd++;
      j = cmdEnd;
      continue;
    }
    break;
  }
  return j;
}

function wrapNakedLatex(text) {
  if (!text) return text;
  let inMath = false;
  let inDisplayMath = false;
  let t = text;
  let i = 0;
  
  const regions = [];
  while (i < t.length) {
    if (t.startsWith('$$', i)) {
      inDisplayMath = !inDisplayMath;
      i += 2; continue;
    }
    if (t[i] === '$') {
      if (!inDisplayMath) inMath = !inMath;
      i++; continue;
    }
    if (t.startsWith('\\\\\\[', i)) { inDisplayMath = true; i += 2; continue; }
    if (t.startsWith('\\\\\\]', i)) { inDisplayMath = false; i += 2; continue; }
    if (t.startsWith('\\\\(', i)) { inMath = true; i += 2; continue; }
    if (t.startsWith('\\\\)', i)) { inMath = false; i += 2; continue; }
    if (inMath || inDisplayMath) { i++; continue; }
    
    if (t[i] === '\\\\') {
      let cmdEnd = i + 1;
      while (cmdEnd < t.length && /[a-zA-Z]/.test(t[cmdEnd])) cmdEnd++;
      const cmd = t.substring(i + 1, cmdEnd);
      if (KNOWN_LATEX_CMDS.has(cmd)) {
        const start = scanBackwardMath(t, i);
        const end = scanForwardMath(t, cmdEnd);
        regions.push({ start, end });
        i = end;
        continue;
      }
    }
    i++;
  }
  
  if (regions.length === 0) return t;
  
  const merged = [];
  let cur = regions[0];
  for (let k = 1; k < regions.length; k++) {
    const next = regions[k];
    if (next.start <= cur.end + 5) {
      const gap = t.substring(cur.end, next.start);
      if (gap.trim() === '' || /^[+\\-=\\,.]/.test(gap.trim())) {
        cur.end = Math.max(cur.end, next.end);
      } else {
        merged.push(cur);
        cur = next;
      }
    } else {
      merged.push(cur);
      cur = next;
    }
  }
  merged.push(cur);
  
  let result = '';
  let lastEnd = 0;
  for (const r of merged) {
    result += t.substring(lastEnd, r.start);
    const content = t.substring(r.start, r.end);
    result += '$' + content.trim() + '$';
    lastEnd = r.end;
  }
  result += t.substring(lastEnd);
  return result;
}

function normalizeAiOutput(text) {
  if (!text) return text;
  text = text.replace(/<\\s*br\\s*\\/?\\s*>/gi, '<br>');

  text = text.replace(/\\$\\$([\\s\\S]+?)\\$\\$/g, (match, inner) => {
    if (/<br\\s*\\/?>/i.test(inner) || /\\*\\*[\\s\\S]+?\\*\\*/.test(inner)) {
      const parts = inner.split(/(<br\\s*\\/?>|\\*\\*[\\s\\S]+?\\*\\*)/gi);
      return parts.map(part => {
        if (/^<br\\s*\\/?>$/i.test(part) || /^\\*\\*[\\s\\S]+?\\*\\*$/.test(part)) return part;
        part = part.trim();
        return part ? \`$$\\${part}$$\` : '';
      }).join('');
    }
    return match;
  });

  text = text.replace(/\\$([\\s\\S]+?)\\$/g, (match, inner) => {
    if (match.startsWith('$$')) return match; 
    if (/<br\\s*\\/?>/i.test(inner) || /\\*\\*[\\s\\S]+?\\*\\*/.test(inner)) {
      const parts = inner.split(/(<br\\s*\\/?>|\\*\\*[\\s\\S]+?\\*\\*)/gi);
      return parts.map(part => {
        if (/^<br\\s*\\/?>$/i.test(part) || /^\\*\\*[\\s\\S]+?\\*\\*$/.test(part)) return part;
        part = part.trim();
        return part ? \`$\\${part}$\` : '';
      }).join('');
    }
    return match;
  });

  return text;
}

const original = fs.readFileSync('C:/Users/USER/Desktop/agent IA _ Assistant Pedagogique -/src/legacy.js', 'utf8');
const searchString = \`function parseMarkdownSafeMath(rawText, filename = "", msg = null) {\`;
const index = original.indexOf(searchString);

if (index !== -1) {
    const newContent = original.substring(0, index) + code + '\\n' + original.substring(index);
    fs.writeFileSync('C:/Users/USER/Desktop/agent IA _ Assistant Pedagogique -/src/legacy.js', newContent);
    console.log('Successfully inserted logic.');
} else {
    console.log('Could not find insertion point.');
}
`;
fs.writeFileSync('C:/Users/USER/Desktop/agent IA _ Assistant Pedagogique -/apply_logic.js', code);
