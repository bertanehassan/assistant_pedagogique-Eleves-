<template>
  <AppHeader />
  <AppChat />
  <AppModals />
</template>

<script setup>
import { onMounted } from 'vue';
import AppHeader from './components/AppHeader.vue';
import AppChat from './components/AppChat.vue';
import AppModals from './components/AppModals.vue';
import { mountApp } from './legacy.js';

onMounted(() => {
  mountApp();
});
</script>

<style>
/* Les styles globaux sont dans assets/styles.css */
</style>