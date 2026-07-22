<template>
  <div v-if="needRefresh" class="pwa-toast" role="alert">
    <div class="message">
      <span style="font-weight: 600; display: block; margin-bottom: 4px;">Nouvelle version disponible ! 🚀</span>
      Mettez à jour pour profiter des dernières nouveautés.
    </div>
    <button @click="updateServiceWorker()" class="update-btn">Actualiser</button>
    <button @click="close" class="close-btn">Fermer</button>
  </div>
</template>

<script setup>
import { useRegisterSW } from 'virtual:pwa-register/vue'

const {
  needRefresh,
  updateServiceWorker,
} = useRegisterSW({
  onRegistered(r) {
    // Vérifier les mises à jour périodiquement (ex: toutes les 6 heures)
    r && setInterval(() => {
      r.update()
    }, 6 * 60 * 60 * 1000)
  }
})

const close = async () => {
  needRefresh.value = false
}
</script>

<style scoped>
.pwa-toast {
  position: fixed;
  right: 20px;
  bottom: 20px;
  background-color: var(--surface);
  border: 1px solid var(--border);
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.4);
  padding: 16px;
  border-radius: 8px;
  z-index: 9999;
  text-align: left;
  max-width: 300px;
  color: var(--on-surface);
  font-family: var(--font-primary);
  animation: slide-up 0.3s ease-out;
}

.pwa-toast .message {
  margin-bottom: 12px;
  font-size: 0.95rem;
  line-height: 1.4;
}

.update-btn {
  background: var(--primary);
  color: #000;
  border: none;
  padding: 6px 12px;
  border-radius: 4px;
  font-weight: 600;
  cursor: pointer;
  margin-right: 8px;
  transition: all 0.2s;
}

.update-btn:hover {
  background: var(--cyan);
}

.close-btn {
  background: transparent;
  color: var(--on-surface-variant);
  border: 1px solid var(--border);
  padding: 6px 12px;
  border-radius: 4px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.close-btn:hover {
  background: var(--surface-hover);
  color: var(--on-surface);
}

@keyframes slide-up {
  from {
    transform: translateY(100%);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}
</style>
