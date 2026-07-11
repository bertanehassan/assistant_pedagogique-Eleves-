# 🎓 Mon Quiz Generator Mobile

> **Application éducative IA** — Assistant intelligent pour les élèves, optimisé smartphone

[![Made with Vue.js](https://img.shields.io/badge/Vue.js-3.x-4FC08D?logo=vue.js)](https://vuejs.org/)
[![Powered by Mistral AI](https://img.shields.io/badge/AI-Mistral-orange)](https://mistral.ai/)
[![Mobile First](https://img.shields.io/badge/Mobile-First-blue)](https://github.com/bertanehassan/mon-quiz-generator-mobile)

---

## 📱 À propos

**Mon Quiz Generator Mobile** est une application web progressive (PWA-ready) permettant aux élèves de :

- 💬 **Dialoguer avec un assistant IA** (powered by Mistral AI)
- 🎮 **Générer et jouer des quiz** interactifs à partir de leurs cours
- 📚 **Réviser efficacement** grâce à des modes d'évaluation chronométrés
- 🧠 **Mémoriser** grâce au système de mémoire persistante
- 📂 **Archiver** leurs conversations pour réviser plus tard

> Développé par **Hassan Bertane** — 2026

---

## 🚀 Fonctionnalités principales

| Fonctionnalité | Description |
|---|---|
| 🤖 Multi-agents | Sélection d'agents IA spécialisés (Mathématiques, Physique, Arabe...) |
| 🎮 Quiz interactif | Génération automatique de QCM depuis les cours |
| ⏱️ Mode évaluation | Timer configurable par question |
| 🧠 Mémoire globale | L'IA se souvient du profil de l'élève |
| 📂 Archives | Historique des conversations |
| 🌐 Multilingue | Français / Arabe / Anglais |
| 🌙 Thèmes | Cyber / Midnight / Light |
| 📱 Mobile First | Optimisé pour smartphone (bottom nav, safe-area iPhone) |

---

## 🛠️ Stack technique

- **Frontend** : Vue.js 3 (Composition API) + Vite
- **Styling** : Tailwind CSS + CSS custom (Glassmorphism)
- **IA** : Mistral AI API
- **Auth & DB** : Firebase
- **Fonts** : Plus Jakarta Sans, Inter, Tajawal (Arabe)
- **Icônes** : Google Material Symbols

---

## ⚡ Installation & Démarrage

```bash
# Cloner le projet
git clone https://github.com/bertanehassan/mon-quiz-generator-mobile.git
cd mon-quiz-generator-mobile

# Installer les dépendances
npm install

# Configurer les variables d'environnement
cp .env.example .env
# Remplir VITE_MISTRAL_API_KEY dans .env

# Lancer en développement
npm run dev
```

Ouvrir **http://localhost:5173** dans votre navigateur.

---

## 📁 Structure du projet

```
src/
├── components/
│   ├── AppHeader.vue        # Header adaptatif (desktop/mobile)
│   ├── AppChat.vue          # Zone de chat principale
│   ├── MobileBottomNav.vue  # Barre de navigation mobile
│   └── AppModals.vue        # Modales (API key, agents...)
├── assets/
│   └── styles.css           # Design system complet
├── i18n.js                  # Traductions FR/AR/EN
├── legacy.js                # Logique métier principale
├── firebase.js              # Configuration Firebase
└── config.js                # Configuration agents & modèles
```

---

## 📄 Licence

© 2026 Hassan Bertane — Tous droits réservés.  
Ce projet est protégé. Toute reproduction ou utilisation commerciale sans autorisation est interdite.
