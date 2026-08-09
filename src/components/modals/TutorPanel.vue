<template>
  <div id="tutor-panel" class="fixed md:absolute top-14 md:top-24 left-0 md:left-auto md:right-4 w-full md:w-[600px] h-[calc(100vh-56px)] md:h-[640px] md:max-h-[85vh] glass-panel p-0 md:rounded-2xl z-[70] flex flex-col shadow-2xl border-0 md:border border-white/10 bg-black/95 md:bg-black/80 backdrop-blur-xl transition-transform duration-300 transform translate-x-full" style="display:none;">
    
    <!-- HEADER -->
    <div class="flex justify-between items-center p-4 border-b border-white/10 bg-gradient-to-r from-cyan/20 to-transparent md:rounded-t-2xl flex-shrink-0">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-full bg-cyan/20 flex items-center justify-center text-xl shadow-[0_0_15px_rgba(192,193,255,0.3)] border border-cyan/30">
          🎓
        </div>
        <div>
          <h3 class="font-bold text-on-surface text-sm">Tuteur Expert</h3>
          <div class="text-[10px] text-cyan font-mono tracking-widest uppercase opacity-80">Assistance Pédagogique</div>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <!-- Badge modèle actif -->
        <div id="tutor-model-badge" class="flex items-center gap-1 bg-white/5 border border-white/10 rounded-full px-3 py-1 text-[10px] font-mono text-on-surface-variant whitespace-nowrap max-w-[130px] overflow-hidden text-ellipsis" title="Modèle actif">
          <span style="font-size:10px;">🤖</span>
          <span id="tutor-model-name">—</span>
        </div>
        <!-- Bouton Export -->
        <div class="relative" id="tutor-export-menu-wrapper">
          <button onclick="toggleTutorExportMenu()" class="panel-close-btn" title="Exporter la conversation" style="color: #a78bfa;">
            <span class="material-symbols-outlined" style="font-size: 20px;">download</span>
          </button>
          <div id="tutor-export-menu" class="hidden absolute right-0 top-full mt-1 bg-black/90 border border-white/15 rounded-xl shadow-2xl overflow-hidden z-50 w-44 backdrop-blur-xl">
            <button onclick="tutorExport('copy')" class="tutor-export-item">📋 Copier</button>
            <button onclick="tutorExport('html')" class="tutor-export-item">🌐 HTML</button>
            <button onclick="tutorExport('txt')" class="tutor-export-item">📄 Texte (.txt)</button>
            <button onclick="tutorExport('word')" class="tutor-export-item">📝 Word (.doc)</button>
            <button onclick="tutorExport('pdf')" class="tutor-export-item">🔴 PDF</button>
          </div>
        </div>
        <!-- Bouton Plein Écran -->
        <button onclick="toggleTutorFullscreen()" class="panel-close-btn" title="Plein écran">
          <span id="tutor-fullscreen-icon" class="material-symbols-outlined" style="font-size: 20px;">fullscreen</span>
        </button>
        <!-- Bouton Nouvelle Conversation -->
        <button onclick="clearTutorConversation()" class="panel-close-btn" title="Nouvelle conversation" style="color: var(--cyan);">
          <span class="material-symbols-outlined" style="font-size: 20px;">add_comment</span>
        </button>
        <!-- Bouton Fermer -->
        <button class="panel-close-btn" onclick="closeTutorPanel()" title="Fermer">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>
    </div>

    <!-- BARRE DE CONTEXTE (toujours visible) -->
    <div class="flex-shrink-0 px-4 py-3 border-b border-white/10 bg-black/30">
      <div class="flex gap-3 mb-2">
        <div class="flex-1">
          <label class="block text-[10px] text-on-surface-variant mb-1 uppercase tracking-wider">🎓 Niveau scolaire</label>
          <select id="tutor-niveau" class="w-full bg-black/50 border border-white/15 rounded-lg px-3 py-1.5 text-xs text-on-surface focus:outline-none focus:border-cyan transition-colors">
            <option value="">Non précisé</option>
            <option value="Primaire">Primaire</option>
            <option value="Collège">Collège</option>
            <option value="Lycée">Lycée</option>
            <option value="Supérieur">Supérieur</option>
          </select>
        </div>
        <div class="flex-1">
          <label class="block text-[10px] text-on-surface-variant mb-1 uppercase tracking-wider">📚 Domaine / Matière</label>
          <select id="tutor-domaine" class="w-full bg-black/50 border border-white/15 rounded-lg px-3 py-1.5 text-xs text-on-surface focus:outline-none focus:border-cyan transition-colors">
            <option value="">Non précisé</option>
            <option value="Mathématiques">Mathématiques</option>
            <option value="Physique-Chimie">Physique-Chimie</option>
            <option value="SVT">SVT</option>
            <option value="Français">Français</option>
            <option value="Anglais">Anglais</option>
            <option value="Histoire-Géographie">Histoire-Géographie</option>
            <option value="Philosophie">Philosophie</option>
            <option value="Informatique">Informatique</option>
            <option value="Autre">Autre</option>
          </select>
        </div>
      </div>
      <!-- Niveau de guidage -->
      <div>
        <label class="block text-[10px] text-on-surface-variant mb-1.5 uppercase tracking-wider">🧭 Niveau de guidage</label>
        <div class="tutor-guidance-selector" id="tutor-guidance-selector">
          <button class="guidance-btn active" data-value="socratic" onclick="setTutorGuidance('socratic', this)" title="Le tuteur pose des questions et guide par la réflexion, sans jamais donner la réponse">
            <span class="guidance-icon">🧠</span>
            <span class="guidance-label">Socratique</span>
          </button>
          <button class="guidance-btn" data-value="balanced" onclick="setTutorGuidance('balanced', this)" title="Le tuteur donne des indices progressifs et révèle la réponse si l'élève est vraiment bloqué">
            <span class="guidance-icon">⚖️</span>
            <span class="guidance-label">Équilibré</span>
          </button>
          <button class="guidance-btn" data-value="direct" onclick="setTutorGuidance('direct', this)" title="Le tuteur explique complètement et donne la réponse avec des explications détaillées">
            <span class="guidance-icon">💡</span>
            <span class="guidance-label">Directif</span>
          </button>
        </div>
        <div id="tutor-guidance-hint" class="text-[10px] text-on-surface-variant/60 mt-1 italic">Questions guidées · jamais de réponse directe</div>
      </div>
    </div>

    <!-- CHAT AREA -->
    <div id="tutor-chat-container" class="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-4 custom-scrollbar text-sm">
      <!-- Les messages seront injectés ici par legacy.js -->
      <div id="tutor-welcome-banner" class="text-center opacity-90 mt-6">
        <div class="text-4xl mb-3">👋</div>
        <div class="text-cyan font-bold mb-2">Bonjour !</div>
        <div class="text-on-surface-variant text-xs px-4">Je suis votre Tuteur. Posez-moi des questions sur vos exercices, demandez-moi de l'aide pour comprendre une notion, mais ne vous attendez pas à ce que je vous donne les réponses toutes faites ! 😉</div>
        <div class="text-on-surface-variant/50 text-[10px] mt-3">Sélectionnez votre niveau et matière ci-dessus, puis posez votre question. Vous pouvez aussi joindre un PDF, une image ou un texte 📎</div>
      </div>
    </div>

    <!-- FILE PREVIEW BAR -->
    <div id="tutor-file-preview-bar" class="flex-shrink-0 px-3 pt-2 flex-wrap gap-2" style="display:none;"></div>
    
    <!-- INPUT AREA -->
    <div class="flex-shrink-0 p-3 border-t border-white/10 bg-black/40 md:rounded-b-2xl">
      <!-- Input fichier caché -->
      <input type="file" id="tutor-file-input" accept="image/*,.pdf,.txt,.md,.csv,.docx" multiple style="display:none;"
             onchange="tutorHandleFiles(Array.from(this.files)); this.value='';">
      <div class="flex items-end gap-2">
        <!-- Bouton pièce jointe -->
        <button onclick="document.getElementById('tutor-file-input').click()"
                class="w-10 h-10 min-w-[40px] rounded-xl flex items-center justify-center bg-white/5 text-on-surface-variant border border-white/10 hover:bg-cyan/10 hover:text-cyan hover:border-cyan/30 transition-colors"
                title="Joindre un fichier (PDF, image, texte)">
          <span class="material-symbols-outlined" style="font-size:20px">attach_file</span>
        </button>
        <div class="flex-1 bg-white/5 border border-white/10 rounded-xl flex items-center px-3 py-2 min-h-[44px]">
          <textarea id="tutor-user-input"
                    class="bg-transparent border-none focus:ring-0 text-on-surface placeholder:text-on-surface-variant/50 w-full font-body-md resize-none py-1 px-1 focus:outline-none text-sm" 
                    placeholder="Posez votre question... (joignez un document si besoin)"
                    rows="1"
                    dir="auto"
                    oninput="this.style.height = ''; this.style.height = Math.min(this.scrollHeight, 120) + 'px';"
                    onkeydown="if(event.key==='Enter' && !event.shiftKey){ event.preventDefault(); sendTutorMessage(); }"></textarea>
        </div>
        <button id="tutor-send-btn" class="w-11 h-11 min-w-[44px] rounded-xl flex items-center justify-center bg-cyan/20 text-cyan border border-cyan/30 hover:bg-cyan/30 transition-colors" onclick="sendTutorMessage()">
          <span class="material-symbols-outlined font-bold" style="font-size: 20px">send</span>
        </button>
      </div>
    </div>

  </div>
</template>

<script setup>
</script>

<style scoped>
.tutor-export-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 10px 16px;
  font-size: 13px;
  color: rgba(218, 226, 253, 0.85);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: background 0.15s ease;
}
.tutor-export-item:hover {
  background: rgba(255,255,255,0.08);
}

.panel-close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: rgba(255,255,255,0.08);
  border: none;
  cursor: pointer;
  color: rgba(218, 226, 253, 0.6);
  transition: all 0.15s ease;
}
.panel-close-btn:hover {
  background: rgba(255,255,255,0.15);
  color: #fff;
}
.custom-scrollbar::-webkit-scrollbar { width: 4px; }
.custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 8px; }
.custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.22); }

/* Guidance selector */
.tutor-guidance-selector {
  display: flex;
  gap: 6px;
}
.guidance-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 6px 4px;
  border-radius: 10px;
  border: 1px solid rgba(255,255,255,0.1);
  background: rgba(255,255,255,0.04);
  cursor: pointer;
  color: rgba(218,226,253,0.5);
  transition: all 0.2s ease;
}
.guidance-btn:hover {
  background: rgba(255,255,255,0.08);
  border-color: rgba(255,255,255,0.2);
  color: rgba(218,226,253,0.85);
}
.guidance-icon { font-size: 16px; line-height: 1; }
.guidance-label { font-size: 10px; font-weight: 600; letter-spacing: 0.04em; }

/* Socratique actif → violet */
.guidance-btn.active[data-value="socratic"] {
  background: rgba(139, 92, 246, 0.18);
  border-color: rgba(139, 92, 246, 0.5);
  color: #c4b5fd;
  box-shadow: 0 0 10px rgba(139, 92, 246, 0.2);
}
/* Équilibré actif → cyan */
.guidance-btn.active[data-value="balanced"] {
  background: rgba(76, 215, 246, 0.15);
  border-color: rgba(76, 215, 246, 0.45);
  color: var(--cyan, #4cd7f6);
  box-shadow: 0 0 10px rgba(76, 215, 246, 0.18);
}
/* Directif actif → ambre */
.guidance-btn.active[data-value="direct"] {
  background: rgba(251, 191, 36, 0.15);
  border-color: rgba(251, 191, 36, 0.45);
  color: #fbbf24;
  box-shadow: 0 0 10px rgba(251, 191, 36, 0.18);
}

/* Fullscreen mode override */
#tutor-panel.tutor-fullscreen {
  width: 100vw !important;
  height: 100vh !important;
  max-width: none !important;
  max-height: none !important;
  top: 0 !important;
  left: 0 !important;
  right: 0 !important;
  bottom: 0 !important;
  border-radius: 0 !important;
  z-index: 9999 !important;
  transform: none !important;
}

/* Amélioration de la typographie et de l'expérience utilisateur dans le chat du tuteur */
:deep(.tutor-message) {
  line-height: 1.8 !important;
  letter-spacing: 0.015em;
  font-size: 14.5px;
}

:deep(.tutor-response-content strong),
:deep(.tutor-response-content b) {
  color: #fff;
  background: linear-gradient(90deg, rgba(76, 215, 246, 0.15) 0%, transparent 100%);
  padding: 0 4px;
  border-left: 2px solid var(--neon, #4cd7f6);
  border-radius: 2px;
}

:deep(.tutor-response-content h1),
:deep(.tutor-response-content h2),
:deep(.tutor-response-content h3),
:deep(.tutor-response-content h4) {
  color: var(--cyan, #00f0ff);
  margin-top: 1.5em;
  margin-bottom: 0.75em;
  font-weight: 700;
}

:deep(.tutor-response-content h1) { font-size: 1.4em; border-bottom: 1px solid rgba(0,240,255,0.2); padding-bottom: 0.3em; }
:deep(.tutor-response-content h2) { font-size: 1.25em; }
:deep(.tutor-response-content h3) { font-size: 1.1em; }

:deep(.tutor-response-content p) {
  margin-bottom: 1.2em;
}

:deep(.tutor-response-content ul),
:deep(.tutor-response-content ol) {
  margin-left: 1.5em;
  margin-bottom: 1.2em;
}

:deep(.tutor-response-content li) {
  margin-bottom: 0.5em;
}

:deep(.tutor-response-content li::marker) {
  color: var(--neon, #4cd7f6);
  font-weight: bold;
}

:deep(.tutor-response-content code) {
  background: rgba(255, 255, 255, 0.1);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: Consolas, monospace;
  color: #ff9d00;
  font-size: 0.9em;
}

:deep(.tutor-response-content pre) {
  background: rgba(0, 0, 0, 0.4);
  padding: 12px;
  border-radius: 8px;
  border: 1px solid rgba(255,255,255,0.1);
  overflow-x: auto;
  margin-bottom: 1.2em;
}
</style>
