# 🎓 Mon Assistant IA Pédagogique 2026

> **Application éducative IA** — Assistant intelligent pour les enseignants et les élèves, optimisé smartphone et desktop.

[![Made with Vue.js](https://img.shields.io/badge/Vue.js-3.x-4FC08D?logo=vue.js)](https://vuejs.org/)
[![Powered by Mistral & Gemini](https://img.shields.io/badge/AI-Mistral_&_Gemini-blue)](https://mistral.ai/)
[![Mobile First](https://img.shields.io/badge/Mobile-First-blue)](https://github.com/bertanehassan/Assistant_Pedagogique-1.0)

---

## 📱 À propos

**Mon Assistant IA Pédagogique** est une application web progressive (PWA-ready) permettant de :

- 💬 **Dialoguer avec des experts IA** spécialisés (Maths, Physique, Langues...)
- 📝 **Générer des fiches de correction** complètes à partir de PDF ou d'images.
- 🎮 **Créer des quiz (QCM, Vrai/Faux) interactifs** à partir de n'importe quel cours.
- 👁️ **Analyser des documents** via la vision de Gemini 2.5 Flash et Mistral Large.
- 🧠 **Mémoriser** le profil de l'utilisateur grâce à la persistance des données locales (IndexedDB).
- 📂 **Archiver** et exporter les travaux (PDF, Word, TXT).

> Développé par **Hassan Bertane** — 2026

---

## 🚀 Fonctionnalités principales

| Fonctionnalité | Description |
|---|---|
| 🤖 Multi-modèles | Basculement automatique intelligent (Gemini Vision pour les PDF, Mistral Large pour les quiz). |
| 📝 Fiche de correction | Outil expert pour corriger des devoirs et exporter en Word (.doc). |
| 🎮 Générateurs | Création automatique de QCM, Vrai/Faux, Flashcards (FC). |
| 📄 Extraction PDF | Lecture intelligente des fichiers PDF (texte natif + OCR de secours). |
| 🧠 Mémoire locale | L'IA retient vos préférences et vos historiques sans base de données lourde. |
| 🌐 Multilingue | Support natif Français / Arabe (RTL) / Anglais. |
| 🌙 Design Glassmorphism | Interface moderne, thèmes Cyber / Midnight / Light. |
| 📱 Mobile First | Interface totalement fluide sur smartphone (bottom nav, safe-area). |

---

## 🛠️ Stack technique

- **Frontend** : Vue.js 3 (Composition API) + Vite
- **Styling** : CSS Custom (Glassmorphism moderne) sans framework lourd
- **IA** : API Google Gemini & Mistral AI
- **Stockage Local** : IndexedDB (Dexie)
- **Déploiement** : Vercel
- **BaaS (Optionnel)** : Firebase (Partage de quiz, Auth)

---

## ⚡ Installation & Démarrage

```bash
# Cloner le projet
git clone https://github.com/bertanehassan/Assistant_Pedagogique-1.0.git
cd Assistant_Pedagogique-1.0

# Installer les dépendances
npm install

# Lancer l'environnement de développement
npm run dev
# OU utiliser le script fourni :
# start.bat
```

L'application sera accessible sur **http://localhost:5174**.

---

## 🔑 Configuration des clés API

### 1. Clés d'Intelligence Artificielle (Mistral / Gemini)
L'application stocke les clés API **localement sur votre navigateur** (IndexedDB). 
- Au premier lancement, une modale vous demandera vos clés (Mistral, Gemini, etc.).
- Elles ne quittent jamais votre machine.

### 2. Configuration Firebase (Optionnel)
Si vous souhaitez activer les fonctionnalités avancées (partage public de quiz, connexion Google), vous devez configurer Firebase :
1. Ouvrez `src/firebase.js`.
2. Remplacez l'objet `firebaseConfig` par vos propres identifiants trouvés dans la console Firebase.
3. Si vous laissez les clés fictives, l'application continuera de fonctionner parfaitement en mode local/hors-ligne.

---

## 📁 Structure du projet

```
Assistant_Pedagogique-1.0/
├── src/
│   ├── components/
│   │   ├── AppHeader.vue        # Header adaptatif
│   │   ├── AppChat.vue          # Zone de chat
│   │   ├── MobileBottomNav.vue  # Barre de navigation mobile
│   │   └── modals/              # Modales (Correction, QCM, API, Agents...)
│   ├── assets/
│   │   └── styles.css           # Design system complet Glassmorphism
│   ├── composables/             # Logique Vue extraite
│   ├── legacy.js                # Logique métier IA et workflows
│   ├── firebase.js              # Configuration base de données
│   ├── state.js                 # État global réactif
│   └── config.js                # Liste des modèles et agents
├── index.html                   # Point d'entrée PWA
├── vercel.json                  # Règles de sécurité et proxy pour Vercel
├── vite.config.js               # Config du bundler
└── start.bat                    # Script de lancement facile
```

---

## 📄 Licence

© 2026 Hassan Bertane — Tous droits réservés.  
Ce projet est protégé. Toute reproduction ou utilisation commerciale sans autorisation est interdite.
