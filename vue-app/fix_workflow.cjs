const fs = require('fs');
const filePath = 'c:/Users/USER/Desktop/Mon Assistant IA 2026/agent IA1/vue-app/src/legacy.js';
let content = fs.readFileSync(filePath, 'utf8');

// Add debug console.log inside renderWfSteps, just after agents are loaded
const target = `  // Get agents for the select options - always reload fresh from DB
  const freshAgents = await db.getAll('agents') || [];
  window.__allAgents = freshAgents;
  const agentOpts = freshAgents.map(a => ({
    id: a.id, name: a.name
  }));`;

const replacement = `  // Get agents for the select options - always reload fresh from DB
  const freshAgents = await db.getAll('agents') || [];
  window.__allAgents = freshAgents;
  console.log('[DEBUG renderWfSteps] agents:', freshAgents.length, 'steps:', wfSteps.length, 'step0 agentId:', wfSteps[0]?.agentId);
  const agentOpts = freshAgents.map(a => ({
    id: a.id, name: a.name
  }));`;

if (content.includes(target)) {
  content = content.replace(target, replacement);
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Debug log added to renderWfSteps');
} else {
  console.log('Target not found! Trying with newline variations...');
  // Try with \r\n
  const target2 = '  // Get agents for the select options - always reload fresh from DB\n  const freshAgents = await db.getAll(\'agents\') || [];\n  window.__allAgents = freshAgents;';
  if (content.includes(target2)) {
    const newContent = content.replace(target2, 
      '  // Get agents for the select options - always reload fresh from DB\n  const freshAgents = await db.getAll(\'agents\') || [];\n  window.__allAgents = freshAgents;\n  console.log(\'[DEBUG renderWfSteps] agents:\', freshAgents.length, \'steps:\', wfSteps.length, \'step0 agentId:\', wfSteps[0]?.agentId);');
    fs.writeFileSync(filePath, newContent, 'utf8');
    console.log('Debug log added via target2');
  } else {
    console.log('FAILED - manual edit needed');
    // Show the actual lines around "Get agents"
    const idx = content.indexOf('Get agents for the select options');
    console.log('Context:\n', JSON.stringify(content.substring(idx - 5, idx + 200)));
  }
}
