<template>
  <Teleport to="body">
    <div v-if="needRefresh" class="pwa-update-overlay" role="dialog" aria-modal="true" aria-label="Mise à jour disponible">
      <div class="pwa-update-card">
        <div class="pwa-update-icon">🚀</div>
        <h3 class="pwa-update-title">Nouvelle version disponible !</h3>
        <p class="pwa-update-desc">
          Une mise à jour est prête. Actualisez maintenant pour profiter des dernières nouveautés et corrections.
        </p>
        <div class="pwa-update-actions">
          <button @click="doUpdate" class="pwa-update-btn pwa-update-btn--primary">
            <span class="pwa-update-btn-icon">⬆️</span> Mettre à jour
          </button>
          <button @click="close" class="pwa-update-btn pwa-update-btn--secondary">
            Plus tard
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { useRegisterSW } from 'virtual:pwa-register/vue'

const {
  needRefresh,
  updateServiceWorker,
} = useRegisterSW({
  onRegistered(r) {
    // Vérifier les mises à jour périodiquement (toutes les 2 heures)
    r && setInterval(() => {
      r.update()
    }, 2 * 60 * 60 * 1000)
  }
})

const doUpdate = () => {
  updateServiceWorker(true)
}

const close = async () => {
  needRefresh.value = false
}
</script>

<style scoped>
.pwa-update-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 99999;
  padding: 20px;
  pointer-events: auto;
  animation: pwa-fade-in 0.25s ease-out;
}

.pwa-update-card {
  background: linear-gradient(145deg, #161b22, #0d1117);
  border: 1px solid rgba(79, 195, 247, 0.3);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6), 0 0 30px rgba(79, 195, 247, 0.08);
  border-radius: 16px;
  padding: 32px 28px;
  max-width: 380px;
  width: 100%;
  text-align: center;
  pointer-events: auto;
  animation: pwa-slide-up 0.35s ease-out;
}

.pwa-update-icon {
  font-size: 48px;
  margin-bottom: 12px;
}

.pwa-update-title {
  font-family: 'Segoe UI', Arial, sans-serif;
  font-size: 1.3rem;
  font-weight: 700;
  color: #e6edf3;
  margin: 0 0 10px 0;
}

.pwa-update-desc {
  font-family: 'Segoe UI', Arial, sans-serif;
  font-size: 0.92rem;
  color: #8b949e;
  line-height: 1.5;
  margin: 0 0 24px 0;
}

.pwa-update-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.pwa-update-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 14px 20px;
  border-radius: 10px;
  font-size: 1rem;
  font-weight: 700;
  font-family: 'Segoe UI', Arial, sans-serif;
  cursor: pointer;
  transition: all 0.2s ease;
  border: none;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}

.pwa-update-btn--primary {
  background: linear-gradient(135deg, #4fc3f7, #00bcd4);
  color: #000;
  box-shadow: 0 4px 16px rgba(79, 195, 247, 0.35);
}

.pwa-update-btn--primary:hover,
.pwa-update-btn--primary:active {
  background: linear-gradient(135deg, #81d4fa, #26c6da);
  box-shadow: 0 6px 24px rgba(79, 195, 247, 0.5);
  transform: translateY(-1px);
}

.pwa-update-btn--secondary {
  background: transparent;
  color: #8b949e;
  border: 1px solid rgba(139, 148, 158, 0.3);
}

.pwa-update-btn--secondary:hover,
.pwa-update-btn--secondary:active {
  background: rgba(139, 148, 158, 0.1);
  color: #c9d1d9;
}

.pwa-update-btn-icon {
  font-size: 1.1rem;
}

@keyframes pwa-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes pwa-slide-up {
  from {
    transform: translateY(30px) scale(0.95);
    opacity: 0;
  }
  to {
    transform: translateY(0) scale(1);
    opacity: 1;
  }
}
</style>
