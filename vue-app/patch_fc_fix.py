import re

file_path = "src/legacy.js"

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Locate the end of the patched_wf_names_v4 block and insert the unconditional call
search_str = """      await db.put('settings', { id: 'patched_wf_names_v4', value: true }).catch(()=>{});
    }
  }

  // ── Migration : fix agent names language mismatch in DB ──"""

replace_str = """      await db.put('settings', { id: 'patched_wf_names_v4', value: true }).catch(()=>{});
    }
  }

  // Ensure FlashCards Workflow is always initialized
  await initializeFlashCardsWorkflow();

  // ── Migration : fix agent names language mismatch in DB ──"""

if search_str in content:
    content = content.replace(search_str, replace_str)
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Fix applied successfully!")
else:
    print("Search string not found in legacy.js!")
