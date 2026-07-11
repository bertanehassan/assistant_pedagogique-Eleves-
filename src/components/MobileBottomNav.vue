<template>
  <!-- ── Bottom Navigation Bar (Mobile Only) ── -->
  <nav class="mobile-bottom-nav md:hidden" role="navigation" aria-label="Navigation principale">
    
    <!-- Chat -->
    <button class="nav-item" :class="{ active: activeTab === 'chat' }" @click="goToChat()" title="Chat">
      <div class="nav-icon-wrap">
        <span class="material-symbols-outlined nav-icon">chat</span>
        <span v-if="chatBadge" class="nav-badge">{{ chatBadge }}</span>
      </div>
      <span class="nav-label">Chat</span>
    </button>

    <!-- Archives -->
    <button class="nav-item" :class="{ active: activeTab === 'archives' }" @click="openArchives()" title="Archives">
      <div class="nav-icon-wrap">
        <span class="material-symbols-outlined nav-icon">history</span>
      </div>
      <span class="nav-label">Archives</span>
    </button>

    <!-- Quiz — bouton central surélevé -->
    <button class="nav-item nav-center-btn" @click="openQuiz()" title="Quiz">
      <div class="nav-center-icon">
        <span class="material-symbols-outlined" style="font-size:24px; color:#fff;">quiz</span>
      </div>
      <span class="nav-label" style="color: #d4af37;">Quiz</span>
    </button>

    <!-- Mémoire -->
    <button class="nav-item" :class="{ active: activeTab === 'memory' }" @click="openMemory()" title="Mémoire">
      <div class="nav-icon-wrap">
        <span class="material-symbols-outlined nav-icon">memory</span>
      </div>
      <span class="nav-label">Mémoire</span>
    </button>

    <!-- Profil -->
    <button class="nav-item" :class="{ active: activeTab === 'profile' }" @click="openProfile()" title="Profil">
      <div class="nav-icon-wrap">
        <span class="material-symbols-outlined nav-icon" style="color: #4caf50">person</span>
      </div>
      <span class="nav-label">Profil</span>
    </button>

  </nav>
</template>

<script setup>
import { ref, onMounted } from 'vue';

const activeTab = ref('chat');
const chatBadge = ref(null);

function setTab(tab) {
  activeTab.value = tab;
}

function triggerBtn(id) {
  const btn = document.getElementById(id);
  if (btn) {
    btn.click();
  }
}

function openArchives() {
  // Si déjà ouvert, refermer et revenir au chat
  const panel = document.getElementById('archives-panel');
  if (panel && panel.style.display !== 'none') {
    panel.style.display = 'none';
    setTab('chat');
    return;
  }
  setTab('archives');
  triggerBtn('archives-btn');
}

function openMemory() {
  const panel = document.getElementById('memory-panel');
  if (panel && panel.style.display !== 'none') {
    panel.style.display = 'none';
    setTab('chat');
    return;
  }
  // legacy.js utilise la classe 'active' pour memory panel
  if (panel) {
    if (panel.classList.contains('active')) {
      panel.classList.remove('active');
      setTab('chat');
    } else {
      panel.classList.add('active');
      setTab('memory');
    }
    return;
  }
  setTab('memory');
  triggerBtn('memory-toggle');
}

function openProfile() {
  const panel = document.getElementById('profile-panel');
  if (panel && panel.style.display !== 'none') {
    panel.style.display = 'none';
    setTab('chat');
    return;
  }
  setTab('profile');
  triggerBtn('profile-btn');
}

function openQuiz() {
  const panel = document.getElementById('quizzes-panel');
  if (panel && panel.style.display !== 'none') {
    panel.style.display = 'none';
    setTab('chat');
    return;
  }
  if (window.openQuizzesPanel) {
    window.openQuizzesPanel();
  } else {
    triggerBtn('quizzes-btn');
  }
}

function goToChat() {
  setTab('chat');
  // Fermer tous les panneaux ouverts
  ['archives-panel', 'quizzes-panel', 'profile-panel', 'memory-panel'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.display = 'none';
    el.classList.remove('active');
  });
  // Scroller en bas du chat
  const chat = document.getElementById('chat-container');
  if (chat) chat.scrollTop = chat.scrollHeight;
}

// Expose pour usage externe
defineExpose({ setTab, chatBadge });
</script>

<style scoped>
/* ── Bottom Navigation Bar ── */
.mobile-bottom-nav {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 50;
  display: flex;
  align-items: stretch;
  justify-content: space-around;
  background: rgba(11, 19, 38, 0.92);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  padding-bottom: env(safe-area-inset-bottom, 8px);
  padding-top: 4px;
  min-height: 64px;
}

/* ── Nav Items ── */
.nav-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  gap: 2px;
  padding: 6px 4px;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
  min-height: 56px;
  position: relative;
  border-radius: 12px;
  margin: 4px 2px;
}

.nav-item:active {
  transform: scale(0.92);
}

/* ── Icon Wrapper ── */
.nav-icon-wrap {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
}

.nav-icon {
  font-size: 22px;
  color: rgba(218, 226, 253, 0.45);
  transition: all 0.25s ease;
}

/* ── Active State ── */
.nav-item.active .nav-icon-wrap::before {
  content: '';
  position: absolute;
  inset: -4px;
  border-radius: 10px;
  background: rgba(192, 193, 255, 0.12);
  animation: pill-pop 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes pill-pop {
  from { transform: scale(0.6); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

.nav-item.active .nav-icon {
  color: var(--cyan, #c0c1ff);
  filter: drop-shadow(0 0 8px rgba(192, 193, 255, 0.5));
}

.nav-item.active .nav-label {
  color: var(--cyan, #c0c1ff);
  font-weight: 600;
}

/* ── Labels ── */
.nav-label {
  font-size: 10px;
  font-weight: 500;
  color: rgba(218, 226, 253, 0.4);
  transition: color 0.2s ease;
  white-space: nowrap;
  letter-spacing: 0.02em;
}

/* ── Badge ── */
.nav-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--cyan, #c0c1ff);
  color: #0b1326;
  font-size: 9px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1.5px solid #0b1326;
}

/* ── Center Elevated Button (Quiz) ── */
.nav-center-btn {
  position: relative;
  flex: 1.2;
  margin-top: -18px;
}

.nav-center-icon {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: linear-gradient(135deg, #d4af37 0%, #f5d36e 50%, #d4af37 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 20px rgba(212, 175, 55, 0.45),
              0 0 0 3px rgba(212, 175, 55, 0.15),
              0 0 0 6px rgba(212, 175, 55, 0.07);
  transition: all 0.2s ease;
}

.nav-center-btn:active .nav-center-icon {
  transform: scale(0.9);
  box-shadow: 0 2px 10px rgba(212, 175, 55, 0.3);
}
</style>
