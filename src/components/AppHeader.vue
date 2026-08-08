<template>
  <!-- ─── Header Bar ─── -->
  <header class="w-full top-0 sticky z-50 backdrop-blur-[40px] border-b border-white/10 bg-white/5 flex justify-between items-center px-3 md:px-4 gap-2 md:gap-3 header-bar" id="hb-header">
    
    <!-- Left: Logo & Title -->
    <div class="flex items-center gap-2 md:gap-3 shrink-0 max-w-[180px] md:max-w-[260px]">
      <!-- Hexagon logo — visible sur tous les écrans -->
      <div class="w-9 h-9 rounded-full border border-white/20 ring-2 ring-primary/20 flex items-center justify-center bg-primary/10 flex-shrink-0">
        <svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" class="w-6 h-6">
          <!-- Open Book Pages -->
          <path d="M18,28 C18,28 10,28 4,24 L4,8 C10,12 18,12 18,12 C18,12 26,12 32,8 L32,24 C26,28 18,28 18,28 Z" stroke="#00e5ff" stroke-width="1.5" fill="none" opacity="0.8"/>
          <path d="M18,12 L18,28" stroke="#00e5ff" stroke-width="1.5" fill="none" opacity="0.5"/>
          <!-- Secondary Pages for depth -->
          <path d="M18,25 C18,25 11,25 6,21" stroke="#00e5ff" stroke-width="1" fill="none" opacity="0.3"/>
          <path d="M18,25 C18,25 25,25 30,21" stroke="#00e5ff" stroke-width="1" fill="none" opacity="0.3"/>
          <!-- AI Core / Spark (Knowledge) -->
          <circle cx="18" cy="6" r="3" fill="#00e5ff" opacity="0.9"/>
          <!-- Sparks -->
          <path d="M18,0 L18,2 M18,10 L18,12 M12,6 L14,6 M22,6 L24,6 M14,2 L15,3 M22,2 L21,3" stroke="#00e5ff" stroke-width="1.5" stroke-linecap="round" opacity="0.6"/>
        </svg>
      </div>
      <!-- Title — visible sur tous les écrans -->
      <div class="flex flex-col leading-tight min-w-0">
        <div class="flex items-center gap-1.5 flex-wrap justify-center">
          <span class="text-xs md:text-sm font-bold text-on-surface tracking-wide whitespace-nowrap">Mon Assistant Pédagogique</span>
          <span style="background:linear-gradient(135deg,#7c3aed,#a855f7);color:#fff;font-size:9px;font-weight:700;letter-spacing:1px;padding:1px 7px;border-radius:20px;white-space:nowrap;text-transform:uppercase;flex-shrink:0;">Élèves</span>
        </div>
        <span class="text-[10px] text-[#FFD700] font-bold opacity-100 hidden md:block text-center w-full">Développé par Hassan Bertane</span>
      </div>
    </div>

    <!-- Center: Selectors & Actions (Scrollable horizontally on all screens) -->
    <div class="scrollable-header-center flex items-center gap-2 md:gap-3 flex-1 justify-start md:justify-center px-2 flex-nowrap whitespace-nowrap overflow-x-auto">
      
      <!-- Selectors -->
      <div class="flex items-center gap-2">
        <select id="agent-select" class="topbar-select" :title="t('title_agents')">
          <option value="">⏳ Chargement...</option>
        </select>
        <select id="model-select" class="topbar-select" :title="t('title_models')"></select>
      </div>
      
      <!-- Actions: Effacer & Nouveau -->
      <div class="flex items-center gap-1 ml-0 md:ml-2">
        <button id="clear-chat" class="topbar-btn" :title="t('title_clear_chat')">
          <span class="material-symbols-outlined" style="font-size:16px">delete_sweep</span>
          <span class="ml-1 text-xs font-semibold">{{ t('btn_clear') }}</span>
        </button>
        <button id="new-chat" class="topbar-btn primary" :title="t('title_new_chat')">
          <span class="material-symbols-outlined" style="font-size:16px">add_comment</span>
          <span class="ml-1 text-xs font-semibold">{{ t('btn_new') }}</span>
        </button>
        <input type="file" id="import-quiz-json-input" accept=".json" style="display: none;" />
        <button id="import-quiz-json-btn" class="topbar-btn" :title="t('title_play_quiz')" style="color: #d4af37; border-color: rgba(212,175,55,0.4);">
          <span class="material-symbols-outlined" style="font-size:16px">play_circle</span>
          <span class="ml-1 text-xs font-semibold">{{ t('btn_play_quiz') }}</span>
        </button>
        <button id="quizzes-btn" onclick="if(window.openQuizzesPanel) window.openQuizzesPanel();" class="topbar-btn" title="Mes Quiz Sauvegardés" style="color: #d4af37; border-color: rgba(212,175,55,0.4);">
          <span class="material-symbols-outlined" style="font-size:16px">quiz</span>
          <span class="ml-1 text-xs font-semibold">Mes Quiz</span>
        </button>
      </div>

    </div>

    <!-- Right: Status & Settings -->
    <div class="flex items-center gap-2 shrink-0">
      <!-- Bouton API cliquable -->
      <button id="open-api-modal"
        class="api-btn-top"
        title="Configurer les clés API (Mistral & Gemini)">
        <span id="api-status-dot-icon">🔑</span>
        <span id="api-status" class="api-btn-label">API</span>
      </button>
      <!-- Sidebar toggle -->
      <button @click="showSidebar = !showSidebar"
              class="sidebar-toggle-btn"
              :class="{ 'active': showSidebar }"
              :title="t('btn_settings')">
        <span class="material-symbols-outlined" style="font-size:22px">
          {{ showSidebar ? 'close' : 'tune' }}
        </span>
      </button>
    </div>
  </header>

  <!-- ─── Backdrop overlay ─── -->
  <Transition name="fade-overlay">
    <div v-show="showSidebar"
         class="fixed inset-0 z-[60]"
         style="background:rgba(0,0,0,0.55); backdrop-filter:blur(3px)"
         @click="showSidebar = false">
    </div>
  </Transition>

  <!-- ─── Sidebar panel ─── -->
  <Transition name="slide-sidebar">
    <aside v-show="showSidebar" class="sidebar-panel">

      <!-- Sidebar header -->
      <div class="sidebar-hdr">
        <div class="flex items-center gap-2">
          <span class="material-symbols-outlined text-primary" style="font-size:18px">tune</span>
          <span class="text-sm font-semibold text-on-surface">{{ t('btn_settings') }}</span>
        </div>
        <button @click="showSidebar = false" class="sidebar-close-btn">
          <span class="material-symbols-outlined" style="font-size:18px">close</span>
        </button>
      </div>

      <!-- Scrollable body -->
      <div class="sidebar-body">

        <!-- Modèle IA (Hidden logic required by legacy.js) -->
        <select id="agent-model-pref" class="sb-select mt-2" style="display:none"></select>

        <!-- ── MOBILE ONLY : Selectors Agent & Modèle ── -->
        <div class="sb-section md:hidden">
          <p class="sb-label">🤖 {{ t('title_agents') }}</p>
          <select id="agent-select-mobile" class="sb-select">
            <option value="">⏳ Chargement...</option>
          </select>
          <p class="sb-label mt-3">⚡ {{ t('title_models') }}</p>
          <select id="model-select-mobile" class="sb-select mt-1"></select>
        </div>

        <!-- ── MOBILE ONLY : Quiz Actions ── -->
        <div class="sb-section md:hidden">
          <p class="sb-label">🎮 Quiz</p>
          <div class="flex flex-col gap-2">
            <button class="sb-btn" style="color: #d4af37; border-color: rgba(212,175,55,0.4);"
              onclick="document.getElementById('import-quiz-json-btn') && document.getElementById('import-quiz-json-btn').click(); document.getElementById('showSidebar-close') && document.getElementById('showSidebar-close').click()">
              <span class="material-symbols-outlined" style="font-size:14px">play_circle</span>
              {{ t('btn_play_quiz') }}
            </button>
            <button class="sb-btn" style="color: #d4af37; border-color: rgba(212,175,55,0.4);"
              onclick="if(window.openQuizzesPanel) window.openQuizzesPanel();">
              <span class="material-symbols-outlined" style="font-size:14px">quiz</span>
              Mes Quiz Sauvegardés
            </button>
          </div>
        </div>

        <!-- Contexte utilisé -->
        <div class="sb-section">
          <p class="sb-label">{{ t('ui_context_used') }}</p>
          <div id="context-meter">
            <div class="sb-progress-track">
              <div id="context-bar" class="sb-progress-fill" style="width:0%"></div>
            </div>
            <div id="context-label" class="sb-progress-label">0%</div>
          </div>
        </div>

        <!-- Apparence -->
        <div class="sb-section">
          <p class="sb-label">{{ t('ui_appearance') }}</p>
          <select id="theme-select" class="sb-select">
            <option value="cyber">◈ CYBER</option>
            <option value="midnight">◈ MIDNIGHT</option>
            <option value="light">◈ LIGHT</option>
          </select>
          <button id="lang-switch-btn" class="sb-btn w-full mt-2">
            🌐 &nbsp;عربي / FR / EN
          </button>
        </div>

        <!-- Gestion -->
        <div class="sb-section">
          <p class="sb-label">{{ t('ui_management') }}</p>
          <div class="flex flex-col gap-2">
            <button id="open-api-modal" class="sb-btn sb-btn-neon">
              <span class="material-symbols-outlined" style="font-size:14px">key</span>
              {{ t('ui_api_key') }}
            </button>
            <button id="open-agent-modal" class="sb-btn">
              <span class="material-symbols-outlined" style="font-size:14px">smart_toy</span>
              {{ t('btn_manage_agents') }}
            </button>
            <button id="open-workflow-modal" class="sb-btn">
              <span class="material-symbols-outlined" style="font-size:14px">account_tree</span>
              {{ t('btn_manage_workflows') }}
            </button>
            <button id="open-correction-modal" class="sb-btn" style="color:#a78bfa;border-color:rgba(167,139,250,0.35)">
              <span class="material-symbols-outlined" style="font-size:14px">assignment</span>
              📋 Fiche de Correction
            </button>
            <button id="open-didactique-modal" class="sb-btn" style="color:#60a5fa;border-color:rgba(96,165,250,0.35)">
              <span class="material-symbols-outlined" style="font-size:14px">school</span>
              👨‍🏫 Fiche Didactique
            </button>
            <button id="open-methode-modal" class="sb-btn" style="color:#f59e0b;border-color:rgba(245,158,11,0.35)">
              <span class="material-symbols-outlined" style="font-size:14px">psychology</span>
              🧠 Fiche Méthode
            </button>


            <button id="open-data-modal" class="sb-btn">
              <span class="material-symbols-outlined" style="font-size:14px">database</span>
              {{ t('btn_data_export') }}
            </button>
          </div>
        </div>

        <!-- Mode Évaluation -->
        <div class="sb-section">
          <p class="sb-label">{{ t('ui_eval_mode') }}</p>
          <div class="flex items-center justify-between gap-2 mt-2">
            <span class="text-xs text-on-surface">{{ t('ui_time_per_question') }}</span>
            <input type="number" id="quiz-eval-timer-input" class="sb-select" style="width: 80px;" value="30" min="5" max="300" />
          </div>
        </div>

      </div><!-- /sidebar-body -->
    </aside>
  </Transition>

  <!-- Hidden legacy stubs (mobile-menu compatibility) -->
  <div id="mobile-menu" style="display:none;">
    <span id="api-status-mob"></span>
    <select id="theme-select-mob"></select>
    <button id="lang-switch-btn-mob"></button>
    <select id="model-select-mob"></select>
    <select id="agent-select-mob"></select>
    <button id="open-api-modal-mob"></button>
    <button id="open-agent-modal-mob"></button>
    <button id="open-workflow-modal-mob"></button>
    <button id="open-data-modal-mob"></button>
    <button id="clear-chat-mob"></button>
    <button id="new-chat-mob"></button>
    <button id="burger-btn"></button>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { t } from '../i18n.js';

const showSidebar = ref(false);

// Sync mobile selects with desktop selects (for legacy.js compatibility)
onMounted(() => {
  const syncSelects = (sourceId, targetId) => {
    const source = document.getElementById(sourceId);
    const target = document.getElementById(targetId);
    if (!source || !target) return;
    
    // Copy options when source changes
    const observer = new MutationObserver(() => {
      target.innerHTML = source.innerHTML;
      target.value = source.value;
    });
    observer.observe(source, { childList: true, subtree: true, attributes: true });
    
    // Sync value changes back to source
    target.addEventListener('change', () => {
      source.value = target.value;
      source.dispatchEvent(new Event('change', { bubbles: true }));
    });
    source.addEventListener('change', () => {
      target.value = source.value;
    });
  };

  syncSelects('agent-select', 'agent-select-mobile');
  syncSelects('model-select', 'model-select-mobile');

  // Sync API status dot color with pill
  const updateStatusDot = () => {
    const pill = document.getElementById('api-status');
    const dot = document.getElementById('api-status-dot');
    if (!pill || !dot) return;
    const pillDot = pill.querySelector('.status-dot');
    if (pillDot) {
      const color = getComputedStyle(pillDot).backgroundColor;
      dot.style.backgroundColor = color;
    }
  };
  
  const statusObserver = new MutationObserver(updateStatusDot);
  const apiStatus = document.getElementById('api-status');
  if (apiStatus) statusObserver.observe(apiStatus, { subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
  updateStatusDot();
});
</script>

<style scoped>
/* ── Header height ── */
.header-bar {
  min-height: 56px;
  padding-top: 8px;
  padding-bottom: 8px;
}

/* ── Fallback Media Queries if Tailwind classes fail ── */
@media (max-width: 767px) {
  .desktop-center-actions {
    display: none !important;
  }
}
@media (min-width: 768px) {
  .mobile-center-actions {
    display: none !important;
  }
}

/* ── Mobile quick-action buttons ── */
.mobile-quick-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 12px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 600;
  border: 1px solid rgba(255,255,255,0.15);
  background: rgba(255,255,255,0.06);
  color: var(--text, #dae2fd);
  cursor: pointer;
  transition: all 0.15s ease;
  min-height: 44px;
}
.topbar-select {
  -webkit-appearance: none;
  -moz-appearance: none;
  appearance: none;
  background-color: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: var(--on-surface);
  border-radius: 8px;
  padding: 4px 12px;
  font-size: 12px;
  font-weight: 500;
  outline: none;
  cursor: pointer;
  transition: all 0.2s ease;
  min-width: 100px;
}

.scrollable-header-center {
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none;  /* IE and Edge */
}
.scrollable-header-center::-webkit-scrollbar {
  display: none; /* Chrome, Safari and Opera */
}
.mobile-quick-btn.primary-gradient {
  background: linear-gradient(135deg, var(--cyan, #c0c1ff) 0%, var(--violet, #8083ff) 100%);
  color: #fff;
  border: none;
}
.mobile-quick-btn:active {
  transform: scale(0.95);
}

/* ── Bouton API cliquable (remplace status-pill) ── */
.api-btn-top {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  border: 1.5px solid rgba(255, 51, 102, 0.45);
  background: rgba(255, 51, 102, 0.1);
  color: #ff6680;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
}
.api-btn-top:hover {
  background: rgba(255, 51, 102, 0.2);
  border-color: rgba(255, 51, 102, 0.7);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(255, 51, 102, 0.3);
}
.api-btn-top.active {
  border-color: rgba(52, 211, 153, 0.6);
  background: rgba(52, 211, 153, 0.12);
  color: #34d399;
}
.api-btn-top.active:hover {
  background: rgba(52, 211, 153, 0.22);
  box-shadow: 0 4px 12px rgba(52, 211, 153, 0.25);
}
.api-btn-label {
  font-size: 12px;
  font-weight: 700;
}
</style>
