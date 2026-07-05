const fs = require('fs');
let code = fs.readFileSync('src/legacy.js', 'utf8');

const target1 = `  if ($("#workflow-modal")) {
    $("#workflow-modal").addEventListener('click', async e => {`;

const repl1 = `  // FIX VUE LISTENER
  document.addEventListener('click', async e => {
    if (!e.target.closest('#workflow-modal')) return;`;

const target2 = `      }
    });
  }`;

const repl2 = `      }
  });`;

const t1Index = code.indexOf(target1);
if (t1Index > -1) {
  code = code.substring(0, t1Index) + repl1 + code.substring(t1Index + target1.length);
  
  const t2Index = code.indexOf(target2, t1Index);
  if (t2Index > -1) {
    code = code.substring(0, t2Index) + repl2 + code.substring(t2Index + target2.length);
  }
}

code = code.replace("case 'edit-workflow':\n          if (id) await openWorkflowForEdit(id);", "case 'edit-workflow':\n          if (id) { toast('Debug', 'success'); await openWorkflowForEdit(id); }");

fs.writeFileSync('src/legacy.js', code, 'utf8');
