import os
import re

filepath = os.path.join(os.path.dirname(__file__), 'src', 'legacy.js')
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

table_parser_code = """
  // Markdown processing (simple bold/italics)
  text = text.replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>').replace(/\\*([^*]+)\\*/g, '<em>$1</em>');

  // Simple Markdown Tables
  let mdLines = text.split('\\n');
  let inTable = false;
  let htmlLines = [];
  for (let i = 0; i < mdLines.length; i++) {
    let line = mdLines[i].trim();
    if (line.startsWith('|') && line.endsWith('|')) {
      let cells = line.split('|').slice(1, -1).map(c => c.trim());
      if (!inTable) {
        if (i + 1 < mdLines.length && /^\\|[-:\\s|]+\\|$/.test(mdLines[i+1].trim())) {
          inTable = true;
          let tb = '<div style="overflow-x:auto; margin:16px 0;"><table style="width:100%; border-collapse:collapse; border:1px solid rgba(255,255,255,0.2); font-size:14px; text-align:left;">';
          tb += '<thead style="background:rgba(255,255,255,0.1);"><tr>' + cells.map(c => `<th style="padding:10px; border:1px solid rgba(255,255,255,0.2);">${c}</th>`).join('') + '</tr></thead><tbody>';
          htmlLines.push(tb);
          i++; // skip separator
          continue;
        }
      }
      if (inTable) {
        htmlLines.push('<tr>' + cells.map(c => `<td style="padding:10px; border:1px solid rgba(255,255,255,0.1);">${c}</td>`).join('') + '</tr>');
        continue;
      }
    } else if (inTable) {
      htmlLines.push('</tbody></table></div>');
      inTable = false;
    }
    // non-table line
    htmlLines.push(mdLines[i] + (i < mdLines.length - 1 ? '<br>' : ''));
  }
  if (inTable) htmlLines.push('</tbody></table></div>');
  text = htmlLines.join('\\n');
"""

# Replace in the first renderWithLatex
old_step3_1 = """  // Step 3: Markdown processing (simple bold/italics to HTML)
  text = text
    .replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>')
    .replace(/\\*([^*]+)\\*/g, '<em>$1</em>')
    .replace(/\\n/g, '<br>');"""

if old_step3_1 in content:
    content = content.replace(old_step3_1, table_parser_code)
else:
    print("Could not find first renderWithLatex Step 3")

# Replace in the second renderWithLatex
old_step3_2 = """      // plain text: HTML-escape then markdown
      let plain = seg.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\\n/g,'<br>');
      if (typeof marked !== 'undefined') plain = marked.parseInline(plain);
      return plain;"""

new_step3_2 = """      // plain text: HTML-escape then markdown tables
      let plain = seg.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      let text = plain;
""" + table_parser_code.replace("text = text.replace", "plain = plain.replace") + """
      return text;"""

if old_step3_2 in content:
    content = content.replace(old_step3_2, new_step3_2)
else:
    print("Could not find second renderWithLatex Step 3")

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print("Tables support added!")
