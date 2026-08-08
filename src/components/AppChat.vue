<template>
  <!-- ════════════════════════════════════════ CHAT ════════════════════════════════════════ -->
  <main id="chat-container" class="flex-1 overflow-y-auto px-3 md:px-4 py-6 flex flex-col gap-6 custom-scrollbar min-h-0 chat-main-area"></main>

  <!-- ═══════════════════ INPUT AREA ═══════════════════ -->
  <footer id="input-area" class="z-40 pt-2 shrink-0 input-footer">
    <div class="max-w-4xl mx-auto w-full px-3 md:px-4 flex flex-col gap-3">
      
      <!-- ─── INPUT BOX ─── -->
      <div class="flex items-end gap-2 md:gap-3">
        <div class="flex-1 input-glass rounded-2xl flex items-center px-3 md:px-4 py-2 min-h-[52px] md:min-h-[56px]">
          <button id="file-upload-btn" class="input-action-btn -ml-1" :title="t('title_attach_file')">
            <span class="material-symbols-outlined" style="font-size: 22px">attach_file</span>
          </button>
          <input type="file" id="file-input" accept="image/*,audio/*,.pdf,.txt,.md,.csv,.docx" multiple style="display:none">
          
          <textarea id="user-input"
                    class="bg-transparent border-none focus:ring-0 text-on-surface placeholder:text-on-surface-variant/50 w-full font-body-md resize-none py-2 px-2 focus:outline-none" 
                    @input="autoResize($event)"
                    :placeholder="t('ui_placeholder_chat')"
                    rows="1">
          </textarea>
                    
          <button id="voice-btn" class="input-action-btn -mr-1" :title="t('title_voice_dictation')">
            <span class="material-symbols-outlined" style="font-size: 22px">mic</span>
          </button>
        </div>

        <button id="send-btn" class="send-btn primary-gradient">
          <span class="material-symbols-outlined text-white font-bold" style="font-size: 24px">send</span>
        </button>
      </div>
      
      <div id="token-counter" class="text-center text-xs text-on-surface-variant pb-1"></div>
    </div>
  </footer>

  <!-- ════════════════════════════════════════ FLOATING ACTIONS ════════════════════════════════════════ -->
  <!-- Ces boutons sont toujours dans le DOM pour la compatibilité avec legacy.js.
       Sur desktop : visibles en flottant à droite.
       Sur mobile : invisibles (la bottom nav déclenche les mêmes panneaux). -->
  <div class="floating-actions-desktop">
    <button id="archives-btn" class="floating-fab" :title="t('title_archives')">
      <span class="material-symbols-outlined text-cyan" style="font-size:20px">history</span>
    </button>
    <button id="memory-toggle" class="floating-fab" :title="t('title_global_memory')">
      <span class="material-symbols-outlined" style="font-size:20px; color: var(--violet, #ddb7ff)">memory</span>
    </button>
    <button id="profile-btn" class="floating-fab" title="Mon Profil & Partage">
      <span class="material-symbols-outlined" style="font-size:20px; color: #4caf50">person</span>
    </button>
    <button id="tutor-btn" class="floating-fab" title="Tuteur Pédagogique Expert" onclick="openTutorPanel()">
      <span style="font-size:20px;">🎓</span>
    </button>
  </div>

  <button id="scroll-bottom" class="fixed bottom-32 md:bottom-8 right-4 w-10 h-10 rounded-full bg-cyan/20 flex items-center justify-center z-30 transition-colors backdrop-blur-md border border-cyan/30" :title="t('title_scroll_down')" style="display:none;">
    <span class="material-symbols-outlined text-cyan">arrow_downward</span>
  </button>

  <!-- ════════════════════════════════════════ PANELS ════════════════════════════════════════ -->
  <div id="archives-panel" class="fixed md:absolute top-0 md:top-24 left-0 md:left-auto md:right-16 w-full md:w-80 h-full md:h-auto glass-panel p-4 md:rounded-xl z-[60] flex flex-col gap-3 shadow-2xl border-0 md:border border-white/10 bg-black/95 md:bg-black/20 backdrop-blur-xl" style="display:none;">
    <div class="flex justify-between items-center">
      <h3 class="font-bold text-on-surface">{{ t('btn_archives') }}</h3>
      <div class="flex gap-2">
        <button id="archives-new-btn" class="text-xs bg-white/10 px-3 py-2 rounded-lg hover:bg-cyan/20 hover:text-cyan transition-colors">{{ t('btn_new') }}</button>
        <button class="panel-close-btn" onclick="document.getElementById('archives-panel').style.display='none'">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>
    </div>
    <input type="text" id="archives-search-input" class="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm text-on-surface focus:outline-none focus:border-cyan transition-colors" :placeholder="t('ui_search_archives')">
    <div id="archives-list" class="flex-1 md:max-h-60 overflow-y-auto text-sm text-on-surface-variant flex flex-col gap-2 pr-1 custom-scrollbar">
      <div class="archive-empty text-center italic opacity-50 py-4">{{ t('ui_no_archives') }}</div>
    </div>
  </div>

  <div id="quizzes-panel" class="fixed md:absolute top-0 md:top-36 left-0 md:left-auto md:right-16 w-full md:w-80 h-full md:h-auto glass-panel p-4 md:rounded-xl z-[60] flex flex-col gap-3 shadow-2xl border-0 md:border border-white/10 bg-black/95 md:bg-black/20 backdrop-blur-xl" style="display:none;">
    <div class="flex justify-between items-center">
      <h3 class="font-bold text-on-surface">Mes Quiz Sauvegardés</h3>
      <button class="panel-close-btn" onclick="document.getElementById('quizzes-panel').style.display='none'">
        <span class="material-symbols-outlined">close</span>
      </button>
    </div>
    <input type="text" id="quizzes-search-input" class="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm text-on-surface focus:outline-none focus:border-yellow-500 transition-colors" placeholder="Rechercher un quiz...">
    <div id="quizzes-list" class="flex-1 md:max-h-60 overflow-y-auto text-sm text-on-surface-variant flex flex-col gap-2 pr-1 custom-scrollbar">
      <div class="archive-empty text-center italic opacity-50 py-4">Aucun quiz sauvegardé.</div>
    </div>
  </div>

  <div id="profile-panel" class="fixed md:absolute top-0 md:top-48 left-0 md:left-auto md:right-16 w-full md:w-80 h-full md:h-auto glass-panel p-4 md:rounded-xl z-[60] flex flex-col gap-3 shadow-2xl border-0 md:border border-white/10 bg-black/95 md:bg-black/20 backdrop-blur-xl" style="display:none;">
    <div class="flex justify-between items-center">
      <h3 class="font-bold text-on-surface">Mon Profil & Partage</h3>
      <button class="panel-close-btn" onclick="document.getElementById('profile-panel').style.display='none'">
        <span class="material-symbols-outlined">close</span>
      </button>
    </div>
    <div id="auth-status" class="text-sm text-center py-2">
      Chargement...
    </div>
    <div id="user-scores-container" style="display:none;" class="flex flex-col gap-2 mt-2 flex-1 min-h-0">
      <h4 class="font-bold text-cyan text-sm border-b border-white/10 pb-1">Ma Progression</h4>
      <div id="user-scores-list" class="flex-1 md:max-h-40 overflow-y-auto text-sm text-on-surface flex flex-col gap-2 custom-scrollbar"></div>
    </div>
  </div>

  <div id="memory-panel" class="fixed md:absolute top-0 md:top-36 left-0 md:left-auto md:right-16 w-full md:w-80 h-full md:h-auto glass-panel p-4 md:rounded-xl z-[60] flex flex-col gap-3 shadow-2xl border-0 md:border border-white/10 bg-black/95 md:bg-black/20 backdrop-blur-xl" style="display:none;">
    <div class="flex justify-between items-center">
      <h3 class="font-bold text-on-surface">{{ t('ui_memory') }}</h3>
      <button id="memory-clear" class="text-xs bg-white/10 px-3 py-2 rounded-lg hover:bg-error/20 hover:text-error transition-colors">{{ t('btn_clear') }}</button>
    </div>
    <div id="memory-list" class="max-h-60 overflow-y-auto text-sm text-on-surface-variant flex flex-col gap-2 pr-1 custom-scrollbar"></div>
    <div class="flex gap-2 pt-2 border-t border-white/5">
      <input type="text" id="memory-input" class="flex-1 bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm text-on-surface focus:outline-none focus:border-violet transition-colors" :placeholder="t('ui_add_memory')">
      <button id="memory-add" class="bg-violet/20 text-violet w-11 rounded-xl flex items-center justify-center hover:bg-violet/40 transition-colors">
        <span class="material-symbols-outlined" style="font-size:20px">add</span>
      </button>
    </div>
  </div>

</template>

<script setup>
import { t } from '../i18n.js';

function autoResize(event) {
  const el = event.target;
  el.style.height = '';
  // Limiter la hauteur max à 40% de l'écran sur mobile
  const maxH = window.innerWidth < 768 ? window.innerHeight * 0.35 : 300;
  el.style.height = Math.min(el.scrollHeight, maxH) + 'px';
}
</script>

<style scoped>
/* ── Chat area ── */
.chat-main-area {
  padding-bottom: 0;
}

/* ── Input footer ── */
.input-footer {
  padding-bottom: 4px;
}


/* ── MOBILE FIX: Force Input Area to be visible ── */
@media (max-width: 767px) {
  .input-footer {
    position: fixed;
    bottom: 0; /* Placed at the very bottom now that nav is gone */
    left: 0;
    width: 100%;
    background-color: var(--background, #0b1326);
    padding-bottom: calc(4px + env(safe-area-inset-bottom, 0px));
    padding-top: 8px;
    border-top: 1px solid rgba(255, 255, 255, 0.05);
    z-index: 50;
  }
  .chat-main-area {
    /* Espace juste pour l'input fixé (~80px) */
    padding-bottom: 80px !important;
  }
}

@media (min-width: 768px) {
  .mb-bottom-nav {
    margin-bottom: 8px;
  }
  .input-footer {
    padding-bottom: 16px;
  }
}

/* ── Input action buttons (attach, mic) ── */
.input-action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  min-height: 40px;
  border-radius: 50%;
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--text-dim, #c7c4d7);
  transition: color 0.15s ease, background 0.15s ease;
  flex-shrink: 0;
}
.input-action-btn:hover {
  color: var(--neon, #4cd7f6);
  background: rgba(76, 215, 246, 0.08);
}
.input-action-btn:active {
  transform: scale(0.9);
}

/* ── Send button ── */
.send-btn {
  width: 52px;
  height: 52px;
  min-width: 52px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 16px rgba(192, 193, 255, 0.25);
  border: none;
  cursor: pointer;
  transition: all 0.15s ease;
  flex-shrink: 0;
}
.send-btn:hover {
  filter: brightness(1.1);
}
.send-btn:active {
  transform: scale(0.93);
}

@media (min-width: 768px) {
  .send-btn {
    width: 56px;
    height: 56px;
    border-radius: 18px;
  }
}

/* ── Panel close button ── */
.panel-close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  min-height: 40px;
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

/* ── Scrollbar ── */
.custom-scrollbar::-webkit-scrollbar { width: 5px; }
.custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 8px; }
.custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.22); }
</style>
