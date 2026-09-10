<template>
  <!-- ═══════════════════ MODAL : WEB QUIZ PLAYER ═══════════════════ -->
  <div class="modal-overlay" id="web-quiz-player-modal">
    <div class="web-quiz-container">
      <!-- Poignées de redimensionnement interactif à la souris -->
      <div class="wq-resizer wq-resizer-l" data-direction="left" title="Glisser pour ajuster la marge gauche"></div>
      <div class="wq-resizer wq-resizer-r" data-direction="right" title="Glisser pour ajuster la marge droite"></div>
      <div class="wq-resizer wq-resizer-t" data-direction="top" title="Glisser pour ajuster la hauteur"></div>
      <div class="wq-resizer wq-resizer-b" data-direction="bottom" title="Glisser pour ajuster la hauteur"></div>
      <div class="wq-resizer wq-resizer-corner" data-direction="corner" title="Glisser pour redimensionner librement"></div>

      <div class="wq-header" ondblclick="resetWebQuizSize()" title="Double-cliquer pour rétablir le plein écran 100%">
        <div class="wq-header-left">
          <div class="wq-counter" id="wq-counter">Question 1/20</div>
          <div class="wq-metadata" id="wq-metadata"></div>
        </div>

        <div class="wq-header-actions">
          <button class="wq-close-btn wq-btn-projector" id="wq-btn-projector" onclick="toggleWebQuizProjectorMode()" :title="t('wq_projector_mode_title')">
            {{ t('wq_projector_mode') }}
          </button>
          <button class="wq-close-btn wq-btn-zoom" id="wq-btn-font-dec" onclick="adjustWebQuizFontSize(-1)" :title="t('wq_font_decrease_title')">
            {{ t('wq_font_decrease') }}
          </button>
          <button class="wq-close-btn wq-btn-zoom" id="wq-btn-font-inc" onclick="adjustWebQuizFontSize(1)" :title="t('wq_font_increase_title')">
            {{ t('wq_font_increase') }}
          </button>
          <button class="wq-close-btn" id="wq-btn-save-header" onclick="saveCurrentQuiz()" title="Sauvegarder ce quiz dans vos archives">
            💾
          </button>
          <button class="wq-close-btn" id="wq-btn-reset-size" onclick="resetWebQuizSize()" title="Rétablir 100% plein écran">
            🗖
          </button>
          <button class="wq-close-btn" onclick="toggleWebQuizFullscreen()" title="Plein écran">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>
          </button>
          <button class="wq-close-btn" onclick="if(document.fullscreenElement) document.exitFullscreen(); document.getElementById('web-quiz-player-modal').classList.remove('active')">✕ {{ t('btn_close') }}</button>
        </div>

        <div class="wq-progress-container">
          <div class="wq-progress-bar" id="wq-progress-bar"></div>
        </div>
      </div>
      
      <div class="wq-body">
        <div class="wq-body-inner">
          <div class="wq-question-box">
            <div id="wq-question-text" class="wq-question-text">{{ t('wq_question') }} ?</div>
          </div>
          
          <div class="wq-choices" id="wq-choices">
            <!-- Dynamically populated -->
          </div>

          <div class="wq-feedback" id="wq-feedback" style="display:none;">
            <div class="wq-feedback-title" id="wq-feedback-title">{{ t('wq_feedback') }}</div>
            <div class="wq-feedback-text" id="wq-feedback-text">...</div>
            <button class="wq-btn wq-btn-ai" id="wq-btn-ask-ai" style="margin-top: 18px;">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"></path></svg>
              Besoin d'explications supplémentaires ?
            </button>
            <div class="wq-ai-response-container" id="wq-ai-response-container" style="display: none; margin-top: 18px;">
              <div class="wq-ai-response-header">{{ t('wq_ai_assistant') }}</div>
              <div class="wq-ai-response-content" id="wq-ai-response-content"></div>
            </div>
          </div>
        </div>
      </div>

      <div class="wq-footer">
        <div class="wq-footer-inner">
          <button class="wq-btn wq-btn-prev" id="wq-btn-prev" disabled>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
          </button>
          <button class="wq-btn wq-btn-verify" id="wq-btn-verify" disabled>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
            VÉRIFIER
          </button>
          <button class="wq-btn wq-btn-verify" id="wq-btn-finish" style="display:none; background: #28a745; color: white;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px"><path d="M5 12l5 5L20 7"></path></svg>
            TERMINER
          </button>
          <button class="wq-btn wq-btn-verify" id="wq-btn-finish-revision" style="display:none; background: linear-gradient(135deg,#4caf50,#2e7d32); color: white; border:none;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px"><path d="M5 12l5 5L20 7"></path></svg>
            TERMINER
          </button>
          <a class="wq-btn wq-btn-verify" id="wq-btn-wiki-action" href="#" target="_blank" rel="noopener noreferrer" style="display:none; text-decoration:none;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px"><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path><circle cx="12" cy="12" r="10"></circle></svg>
            POUR ALLER PLUS LOIN
          </a>
          <button class="wq-btn wq-btn-next" id="wq-btn-next" disabled>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { t } from '../../i18n.js';
</script>
