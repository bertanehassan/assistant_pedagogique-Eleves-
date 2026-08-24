<template>
  <AppHeader />
  <AppChat />
  <AppModals />
  <ReloadPrompt />
</template>

<script setup>
import { onMounted } from 'vue';
import AppHeader from './components/AppHeader.vue';
import AppChat from './components/AppChat.vue';
import AppModals from './components/AppModals.vue';
import ReloadPrompt from './components/ReloadPrompt.vue';
import { mountApp } from './legacy.js';

onMounted(async () => {
  await mountApp();

  // ── PWA File Handling : ouvrir un quiz .json depuis WhatsApp ──
  
  // Méthode 1 : Web Share Target (Android Share Menu)
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('shared_file') === 'true') {
    try {
      const { db } = await import('./storage.js');
      // legacy.js initialise la connexion DB dans mountApp
      const pendingQuiz = await db.get('settings', 'shared_quiz_pending');
      if (pendingQuiz && pendingQuiz.value) {
        // Nettoyer l'URL
        window.history.replaceState({}, document.title, window.location.pathname);
        
        // Petite attente pour s'assurer que l'UI est prête
        await new Promise(resolve => setTimeout(resolve, 500));
        
        if (typeof window.handleQuizJsonText === 'function') {
          window.handleQuizJsonText(pendingQuiz.value);
        } else {
          alert('Erreur interne : handleQuizJsonText non défini.');
        }
        
        // Supprimer le fichier en attente
        await db.put('settings', { id: 'shared_quiz_pending', value: null });
      } else {
        const swDebug = urlParams.get('sw_debug') || 'Non passé';
        alert(`Erreur : Aucun fichier valide reçu. SW = ${swDebug}`);
      }
    } catch (err) {
      console.error('[WebShareTarget] Erreur lecture fichier partagé:', err);
    }
  }

  // Méthode 2 : launchQueue (PC/Mac File Handlers)
  if ('launchQueue' in window) {
    window.launchQueue.setConsumer(async (launchParams) => {
      if (!launchParams.files || launchParams.files.length === 0) return;
      try {
        const fileHandle = launchParams.files[0];
        const file = await fileHandle.getFile();
        const text = await file.text();
        await new Promise(resolve => setTimeout(resolve, 500));
        if (typeof window.handleQuizJsonText === 'function') {
          window.handleQuizJsonText(text);
        }
      } catch (err) {
        console.error('[launchQueue] Erreur lecture fichier quiz:', err);
      }
    });
  }
});
</script>

<style>
/* Les styles globaux sont dans assets/styles.css */
</style>