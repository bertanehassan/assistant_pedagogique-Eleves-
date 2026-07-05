import sys

with open('src/legacy.js', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Remove the bad block at the bottom
bad_start = code.find("  // Event delegation for workflow step actions + existing list", 4000)
bad_end = code.find("  return cleaned;", bad_start)
if bad_start > 0 and bad_end > bad_start:
    code = code[:bad_start] + code[bad_end:]

# 2. Fix the original block
target = """  // Event delegation for workflow step actions + existing list
  if ($("#workflow-modal")) {
    $("#workflow-modal").addEventListener('click', async e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      const idx = parseInt(btn.dataset.idx);
      const id = btn.dataset.id;
      
      switch (action) {
        case 'wf-move-up':
          if (!isNaN(idx)) await wfMoveStep(idx, -1);
          break;
        case 'wf-move-down':
          if (!isNaN(idx)) await wfMoveStep(idx, 1);
          break;
        case 'wf-remove-step':
          if (!isNaN(idx)) await wfRemoveStep(idx);
          break;
        case 'activate-workflow':
          if (id) {
            e.stopPropagation();
            const wf = await db.get('workflows', id);
            if (wf) {
              $("#agent-select").value = `__WF__${id}`;
              if ($("#agent-select-mob")) $("#agent-select-mob").value = `__WF__${id}`;
              state.selectedWorkflow = wf;
              toast(`Chaîne "${wf.name}" activée`, "success");
              $("#workflow-modal").classList.remove("active");
              if (state.messages.length === 0) {
                const sys = (state.messages||[]).find(m => m.role === "system");
                if (sys) { sys.content = buildSystemPrompt(); await saveChat(); renderMessages(); }
              }
            }
          }
          break;
        case 'edit-workflow':
          if (id) await openWorkflowForEdit(id);
          break;
        case 'delete-workflow':
          if (id) {
            e.stopPropagation();
            await deleteWorkflow(id);
          }
          break;
      }
    });
  }"""

replacement = """  // Event delegation for workflow step actions + existing list
  document.addEventListener('click', async e => {
    if (!e.target.closest('#workflow-modal')) return;
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const idx = parseInt(btn.dataset.idx);
    const id = btn.dataset.id;
    
    switch (action) {
      case 'wf-move-up':
        if (!isNaN(idx)) await wfMoveStep(idx, -1);
        break;
      case 'wf-move-down':
        if (!isNaN(idx)) await wfMoveStep(idx, 1);
        break;
      case 'wf-remove-step':
        if (!isNaN(idx)) await wfRemoveStep(idx);
        break;
      case 'activate-workflow':
        if (id) {
          e.stopPropagation();
          const wf = await db.get('workflows', id);
          if (wf) {
            $("#agent-select").value = `__WF__${id}`;
            if ($("#agent-select-mob")) $("#agent-select-mob").value = `__WF__${id}`;
            state.selectedWorkflow = wf;
            toast(`Chaîne "${wf.name}" activée`, "success");
            $("#workflow-modal").classList.remove("active");
            if (state.messages.length === 0) {
              const sys = (state.messages||[]).find(m => m.role === "system");
              if (sys) { sys.content = buildSystemPrompt(); await saveChat(); renderMessages(); }
            }
          }
        }
        break;
      case 'edit-workflow':
        if (id) {
          toast("Debug: Edit capté sur " + id, "success");
          await openWorkflowForEdit(id);
        }
        break;
      case 'delete-workflow':
        if (id) {
          e.stopPropagation();
          await deleteWorkflow(id);
        }
        break;
    }
  });"""

if target in code:
    code = code.replace(target, replacement)
    with open('src/legacy.js', 'w', encoding='utf-8') as f:
        f.write(code)
    print("SUCCESS")
else:
    print("TARGET NOT FOUND")
