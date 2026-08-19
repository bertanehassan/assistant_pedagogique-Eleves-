<template>
  <div id="tutor-panel" class="fixed md:absolute top-14 md:top-24 left-0 md:left-auto md:right-4 w-full md:w-[600px] h-[calc(100dvh-56px)] md:h-[640px] md:max-h-[85vh] glass-panel p-0 md:rounded-2xl z-[70] flex flex-col shadow-2xl border-0 md:border border-white/10 bg-black/95 md:bg-black/80 backdrop-blur-xl transition-transform duration-300 transform translate-x-full" style="display:none;">
    
    <!-- HEADER -->
    <div class="flex justify-between items-center p-3 md:p-4 border-b border-white/10 bg-gradient-to-r from-cyan/20 to-transparent md:rounded-t-2xl flex-shrink-0">
      <div class="flex items-center gap-3">
        <div class="w-8 h-8 md:w-10 md:h-10 rounded-full bg-cyan/20 flex items-center justify-center text-lg md:text-xl shadow-[0_0_15px_rgba(192,193,255,0.3)] border border-cyan/30">
          🎓
        </div>
        <div>
          <h3 class="font-bold text-on-surface text-sm">{{ t('tutor_expert') }}</h3>
          <div class="text-[9px] md:text-[10px] text-cyan font-mono tracking-widest uppercase opacity-80">{{ t('tutor_assistance') }}</div>
        </div>
      </div>
      <div class="flex items-center gap-1 md:gap-2">
        <!-- Badge modèle actif -->
        <div id="tutor-model-badge" class="hidden md:flex items-center gap-1 bg-white/5 border border-white/10 rounded-full px-2 py-1 md:px-3 text-[10px] font-mono text-on-surface-variant whitespace-nowrap max-w-[90px] md:max-w-[130px] overflow-hidden text-ellipsis" title="Modèle actif">
          <span style="font-size:10px;">🤖</span>
          <span id="tutor-model-name">—</span>
        </div>
        <!-- Bouton Synthèse Vocale (TTS) -->
        <button id="tutor-tts-btn" onclick="toggleTutorTTS()" class="panel-close-btn" :title="t('tutor_tts_title')">
          <span id="tutor-tts-icon" class="material-symbols-outlined" style="font-size: 18px;">volume_off</span>
        </button>
        <!-- Bouton Export -->
        <div class="relative" id="tutor-export-menu-wrapper">
          <button onclick="toggleTutorExportMenu()" class="panel-close-btn" :title="t('tutor_export_title')" style="color: #a78bfa;">
            <span class="material-symbols-outlined" style="font-size: 18px;">download</span>
          </button>
          <div id="tutor-export-menu" class="hidden absolute right-0 top-full mt-1 bg-black/90 border border-white/15 rounded-xl shadow-2xl overflow-hidden z-50 w-44 backdrop-blur-xl">
            <button onclick="tutorExport('copy')" class="tutor-export-item">{{ t('tutor_export_copy') }}</button>
            <button onclick="tutorExport('html')" class="tutor-export-item">{{ t('tutor_export_html') }}</button>
            <button onclick="tutorExport('txt')" class="tutor-export-item">{{ t('tutor_export_txt') }}</button>
            <button onclick="tutorExport('word')" class="tutor-export-item">{{ t('tutor_export_word') }}</button>
            <button onclick="tutorExport('pdf')" class="tutor-export-item">{{ t('tutor_export_pdf') }}</button>
          </div>
        </div>
        <!-- Bouton Sauvegarder la conversation -->
        <button onclick="saveTutorSession()" class="panel-close-btn" title="Sauvegarder la conversation" style="color: #4cd7f6;">
          <span class="material-symbols-outlined" style="font-size: 18px;">save</span>
        </button>
        <!-- Bouton Historique des conversations -->
        <button onclick="toggleTutorHistoryDrawer()" class="panel-close-btn" title="Historique des conversations" style="color: #c4b5fd;">
          <span class="material-symbols-outlined" style="font-size: 18px;">history</span>
        </button>
        <!-- Bouton Plein Écran -->
        <button onclick="toggleTutorFullscreen()" class="panel-close-btn hidden md:flex" :title="t('tutor_fullscreen')">
          <span id="tutor-fullscreen-icon" class="material-symbols-outlined" style="font-size: 18px;">fullscreen</span>
        </button>
        <!-- Bouton Nouvelle Conversation -->
        <button onclick="clearTutorConversation()" class="panel-close-btn" :title="t('tutor_new_chat')" style="color: var(--cyan);">
          <span class="material-symbols-outlined" style="font-size: 18px;">add_comment</span>
        </button>
        <!-- Bouton Fermer -->
        <button class="panel-close-btn" onclick="closeTutorPanel()" :title="t('tutor_close')">
          <span class="material-symbols-outlined" style="font-size: 18px;">close</span>
        </button>
      </div>
    </div>

    <!-- DRAWER HISTORIQUE DES CONVERSATIONS -->
    <div id="tutor-history-drawer" style="display:none;max-height:55dvh;" class="flex-shrink-0 flex-col border-b border-white/10 bg-black/60 backdrop-blur-xl">
      <!-- En-tête du drawer -->
      <div class="flex items-center justify-between px-4 py-2.5 border-b border-white/10">
        <div class="flex items-center gap-2">
          <span class="material-symbols-outlined" style="font-size:16px;color:#c4b5fd;">history</span>
          <span class="text-xs font-semibold text-on-surface">Conversations sauvegardées</span>
        </div>
        <button onclick="closeTutorHistoryDrawer()" class="panel-close-btn" style="width:28px;height:28px;" title="Fermer">
          <span class="material-symbols-outlined" style="font-size:16px;">close</span>
        </button>
      </div>
      <!-- Liste scrollable -->
      <div id="tutor-history-list" class="overflow-y-auto custom-scrollbar p-3 flex flex-col gap-2" style="max-height:45dvh;min-height:80px;">
        <!-- Rempli dynamiquement par loadTutorSessions() -->
      </div>
    </div>

    <!-- BARRE DE CONTEXTE (toujours visible) -->
    <div class="flex-shrink-0 px-3 md:px-4 py-2 border-b border-white/10 bg-black/30 overflow-y-auto max-h-[25dvh] md:max-h-none custom-scrollbar">
      <div class="flex gap-2 md:gap-3 mb-2">
        <div class="flex-1">
          <label class="block text-[9px] md:text-[10px] text-on-surface-variant mb-1 uppercase tracking-wider">🎓 {{ t('tutor_level') }}</label>
          <select id="tutor-niveau" class="w-full bg-black/50 border border-white/15 rounded-lg px-2 py-1 md:px-3 md:py-1.5 text-[11px] md:text-xs text-on-surface focus:outline-none focus:border-cyan transition-colors">
            <option value="">{{ t('tutor_level_unspecified') }}</option>
            <option value="Primaire">{{ t('tutor_level_primary') }}</option>
            <option value="Collège">{{ t('tutor_level_middle') }}</option>
            <option value="Lycée">{{ t('tutor_level_high') }}</option>
            <option value="Supérieur">{{ t('tutor_level_higher') }}</option>
          </select>
        </div>
        <div class="flex-1">
          <label class="block text-[9px] md:text-[10px] text-on-surface-variant mb-1 uppercase tracking-wider">📚 {{ t('tutor_subject') }}</label>
          <select id="tutor-domaine" class="w-full bg-black/50 border border-white/15 rounded-lg px-2 py-1 md:px-3 md:py-1.5 text-[11px] md:text-xs text-on-surface focus:outline-none focus:border-cyan transition-colors">
            <option value="">{{ t('tutor_subject_unspecified') }}</option>
            <option value="Mathématiques">{{ t('tutor_subject_maths') }}</option>
            <option value="Physique-Chimie">{{ t('tutor_subject_physics') }}</option>
            <option value="SVT">{{ t('tutor_subject_svt') }}</option>
            <option value="Français">{{ t('tutor_subject_french') }}</option>
            <option value="Anglais">{{ t('tutor_subject_english') }}</option>
            <option value="Histoire-Géographie">{{ t('tutor_subject_history') }}</option>
            <option value="Philosophie">{{ t('tutor_subject_philosophy') }}</option>
            <option value="Informatique">{{ t('tutor_subject_computer') }}</option>
            <option value="Autre">{{ t('tutor_subject_other') }}</option>
          </select>
        </div>
      </div>
      <!-- Niveau de guidage -->
      <div class="flex md:block items-center gap-2">
        <label class="hidden md:block text-[10px] text-on-surface-variant mb-1.5 uppercase tracking-wider">🧭 {{ t('tutor_guidance') }}</label>
        <div class="tutor-guidance-selector flex-1 flex flex-wrap gap-1" id="tutor-guidance-selector">
          <button class="guidance-btn active py-1 md:py-1.5" data-value="socratic" onclick="setTutorGuidance('socratic', this)" :title="t('tutor_guidance_hint_socratic')">
            <span class="guidance-label">{{ t('tutor_guidance_socratic') }}</span>
          </button>
          <button class="guidance-btn py-1 md:py-1.5" data-value="balanced" onclick="setTutorGuidance('balanced', this)" :title="t('tutor_guidance_hint_balanced')">
            <span class="guidance-label">{{ t('tutor_guidance_balanced') }}</span>
          </button>
          <button class="guidance-btn py-1 md:py-1.5" data-value="corrector" onclick="setTutorGuidance('corrector', this)" :title="t('tutor_guidance_hint_corrector')">
            <span class="guidance-label">{{ t('tutor_guidance_corrector') }}</span>
          </button>
        </div>
        <div id="tutor-guidance-hint" class="hidden md:block text-[10px] text-on-surface-variant/60 mt-1 italic">{{ t('tutor_guidance_hint_socratic') }}</div>
      </div>
    </div>

    <!-- CHAT AREA -->
    <div id="tutor-chat-container" class="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-4 custom-scrollbar text-sm">
      <!-- Les messages seront injectés ici par legacy.js -->
      <div id="tutor-welcome-banner" class="text-center opacity-90 mt-6">
        <div class="text-4xl mb-3">👋</div>
        <div class="text-cyan font-bold mb-2">{{ t('tutor_welcome_title') }}</div>
        <div class="text-on-surface-variant text-xs px-4">{{ t('tutor_welcome_text') }}</div>
        <div class="text-on-surface-variant/50 text-[10px] mt-3">{{ t('tutor_welcome_sub') }}</div>
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
                :title="t('tutor_attach_title')">
          <span class="material-symbols-outlined" style="font-size:20px">attach_file</span>
        </button>
        <div class="flex-1 bg-white/5 border border-white/10 rounded-xl flex items-center px-3 py-2 min-h-[44px]">
          <textarea id="tutor-user-input"
                    class="bg-transparent border-none focus:ring-0 text-on-surface placeholder:text-on-surface-variant/50 w-full font-body-md resize-none py-1 px-1 focus:outline-none text-sm" 
                    :placeholder="t('tutor_input_placeholder')"
                    rows="1"
                    dir="auto"
                    oninput="this.style.height = ''; this.style.height = Math.min(this.scrollHeight, 120) + 'px';"
                    onkeydown="if(event.key==='Enter' && !event.shiftKey){ event.preventDefault(); sendTutorMessage(); }"></textarea>
          <!-- Bouton micro pour dictée vocale dans le tuteur -->
          <button id="tutor-voice-btn" onclick="toggleTutorVoice()"
                  class="tutor-voice-btn flex-shrink-0 ml-1"
                  :title="t('tutor_mic_title')">
            <span id="tutor-voice-icon" class="material-symbols-outlined" style="font-size:20px">mic</span>
          </button>
        </div>
        <button id="tutor-send-btn" class="w-11 h-11 min-w-[44px] rounded-xl flex items-center justify-center bg-cyan/20 text-cyan border border-cyan/30 hover:bg-cyan/30 transition-colors" onclick="sendTutorMessage()">
          <span class="material-symbols-outlined font-bold" style="font-size: 20px">send</span>
        </button>
      </div>
    </div>

  </div>
</template>

<script setup>
import { t } from '../../i18n.js';
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
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: rgba(255,255,255,0.08);
  border: none;
  cursor: pointer;
  color: rgba(218, 226, 253, 0.6);
  transition: all 0.15s ease;
}
@media (min-width: 768px) {
  .panel-close-btn {
    width: 36px;
    height: 36px;
  }
}
.panel-close-btn:hover {
  background: rgba(255,255,255,0.15);
  color: #fff;
}

/* Bouton micro dans le tuteur */
.tutor-voice-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: transparent;
  border: none;
  cursor: pointer;
  color: rgba(218, 226, 253, 0.5);
  transition: all 0.2s ease;
  flex-shrink: 0;
}
.tutor-voice-btn:hover {
  color: var(--cyan, #4cd7f6);
  background: rgba(76, 215, 246, 0.1);
}
/* État enregistrement : pulsation rouge */
.tutor-voice-btn.recording {
  color: #f87171;
  background: rgba(248, 113, 113, 0.15);
  animation: tutor-mic-pulse 1.2s ease-in-out infinite;
}
@keyframes tutor-mic-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(248, 113, 113, 0.4); }
  50% { box-shadow: 0 0 0 6px rgba(248, 113, 113, 0); }
}

/* Bouton TTS actif → vert */
.panel-close-btn.tts-active {
  background: rgba(76, 215, 246, 0.15);
  color: var(--cyan, #4cd7f6);
  border: 1px solid rgba(76, 215, 246, 0.35);
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
