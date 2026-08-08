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
        <button class="panel-close-btn" onclick="closeTutorPanel()">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>
    </div>

    <!-- BARRE DE CONTEXTE (toujours visible) -->
    <div class="flex-shrink-0 px-4 py-3 border-b border-white/10 bg-black/30">
      <div class="flex gap-3">
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
</style>
