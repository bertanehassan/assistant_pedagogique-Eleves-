<template>
  <!-- â•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گ MODAL : SETUP WIZARD â•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گ -->

  <div id="setup-wizard-overlay">
    <div class="wizard-box">
      <div class="corner-deco corner-tl"></div>
      <div class="corner-deco corner-tr"></div>
      <div class="corner-deco corner-bl"></div>
      <div class="corner-deco corner-br"></div>

      <!-- STEP 1: Welcome & API Key -->
      <div class="wizard-step active" id="wizard-step-1">
        <div class="wizard-logo">
          <div class="wizard-logo-text">Mon Assistant Pédagogique</div>
          <div class="wizard-logo-sub">Plateforme Mon Assistant Pédagogique v4.0</div>
        </div>
        <div class="wizard-progress">
          <div class="wizard-dot active" id="wdot-1"></div>
          <div class="wizard-dot" id="wdot-2"></div>
          <div class="wizard-dot" id="wdot-3"></div>
        </div>
        <div class="wizard-title">Bienvenue sur Mon Assistant Pédagogique</div>
        <div class="wizard-subtitle">Votre IA personnelle, configurée selon votre vision.<br>Commençons par activer
          votre accès Mistral.</div>
        <div class="field-group">
          <label class="field-label">🔑 Clé API Mistral <span style="color:var(--danger)">*</span></label>
          <input type="password" class="field-input" id="wizard-api-key"
            placeholder="Collez votre clé API Mistral ici…">
          <div class="field-hint">Obtenez votre clé gratuite sur <a href="https://console.mistral.ai" target="_blank"
              rel="noopener noreferrer"
              style="color:var(--cyan)">console.mistral.ai</a> → API Keys</div>
        </div>
        <div class="btn-row" style="border-top:none;padding-top:0">
          <button class="btn-primary" id="wizard-step1-next"
            style="width:100%;justify-content:center;display:flex">CONTINUER →</button>
        </div>
      </div>

      <!-- STEP 2: AI Goal & Name -->
      <div class="wizard-step" id="wizard-step-2">
        <div class="wizard-progress">
          <div class="wizard-dot done" id="wdot-1b"></div>
          <div class="wizard-dot active" id="wdot-2b"></div>
          <div class="wizard-dot" id="wdot-3b"></div>
        </div>
        <div class="wizard-title">Définissez votre IA</div>
        <div class="wizard-subtitle">Ces informations permettront à Mon Assistant Pédagogique de générer automatiquement une équipe de 1 à 4 agents experts parfaitement adaptés à vos besoins.</div>
        <div class="field-group">
          <label class="field-label">🎯 Nom de votre IA <span style="color:var(--danger)">*</span></label>
          <input type="text" class="field-input" id="wizard-ai-name"
            placeholder="Ex : Atlas, Sentinel, Nexus, MyAssistant…">
          <div class="field-hint">Ce nom sera affiché dans l'interface et utilisé par vos agents.</div>
        </div>
        <div class="field-group">
          <label class="field-label">🚀 But principal de votre IA <span style="color:var(--danger)">*</span></label>
          <textarea class="field-textarea" id="wizard-ai-goal" rows="3"
            placeholder="Décrivez votre contexte et objectif. Ex : &#10;'Je suis développeur freelance web, j'ai besoin d'une IA pour m'aider avec le code, la gestion de projets clients, la rédaction de propositions commerciales et la veille technologique.'&#10;ou&#10;'Je suis étudiant en médecine, j'ai besoin d'aide pour réviser, comprendre des cas cliniques, préparer mes examens et m'organiser.'"></textarea>
          <div class="field-hint">▸ Plus vous êtes précis, plus les agents générés seront pertinents.</div>
        </div>
        <div class="field-group">
          <label class="field-label">🤖 Nombre d'agents à générer</label>
          <select class="field-input field-select" id="wizard-agent-count">
            <option value="1">1 agent spécialisé</option>
            <option value="2">2 agents (Ex: Planificateur + Exécutant)</option>
            <option value="3">3 agents (Ex: Équipe complète)</option>
            <option value="4" selected>4 agents (Ex: Architecture complexe)</option>
          </select>
          <div class="field-hint">Choisissez la taille de votre équipe d'IA (de 1 à 4).</div>
        </div>
        <div class="btn-row" style="border-top:none;padding-top:0">
          <button class="btn-ghost" id="wizard-step2-back">{{ t('wiz_btn_back') }}</button>
          <button class="btn-primary" id="wizard-step2-next">{{ t('wiz_btn_next') }}</button>
        </div>
      </div>

      <!-- STEP 2.5: Interactive Interview -->
      <div class="wizard-step" id="wizard-step-2-5">
        <div class="wizard-progress">
          <div class="wizard-dot done"></div>
          <div class="wizard-dot done"></div>
          <div class="wizard-dot active" style="background:var(--neon);box-shadow:0 0 8px var(--neon)"></div>
        </div>
        <div class="wizard-title">{{ t('wiz_step3_title') }}</div>
        <div class="wizard-subtitle">{{ t('wiz_step3_desc') }}</div>
        
        <div class="interview-chat" id="wizard-interview-chat" style="max-height:250px;overflow-y:auto;background:var(--void);border:1px solid var(--grid);border-radius:var(--r);padding:10px;margin-bottom:12px;display:flex;flex-direction:column;gap:10px;font-size:13px">
          <!-- Chat messages will be injected here -->
        </div>

        <div class="field-group" style="margin-bottom:8px">
          <textarea class="field-textarea" id="wizard-interview-input" rows="2" placeholder="Répondez ici..."></textarea>
        </div>
        
        <div class="btn-row" style="border-top:none;padding-top:0;justify-content:space-between">
          <button class="btn-ghost" id="wizard-interview-send" style="color:var(--neon);border-color:rgba(0,255,157,0.3)">{{ t('wiz_btn_send') }}</button>
          <button class="btn-primary" id="wizard-interview-finish">{{ t('wiz_btn_finish') }}</button>
        </div>
      </div>

      <!-- STEP 3: Generating -->
      <div class="wizard-step" id="wizard-step-3">
        <div class="wizard-progress">
          <div class="wizard-dot done"></div>
          <div class="wizard-dot done"></div>
          <div class="wizard-dot active"></div>
        </div>
        <div class="wizard-title" id="wizard-step3-title">{{ t('wiz_step3_title') }}</div>
        <div class="wizard-subtitle" id="wizard-step3-sub">Mistral analyse votre profil et crée 20 agents
          ultra-spécialisés…</div>
        <div class="wizard-generating" id="wizard-gen-loader">
          <div class="wizard-gen-icon">⚙</div>
          <div class="wizard-gen-status">{{ t('wiz_gen_status') }}</div>
          <div class="wizard-gen-detail" id="wizard-gen-detail">Connexion à Mistral AI…</div>
        </div>
        <div id="wizard-agents-preview" style="display:none">
          <div class="agent-gen-grid" id="wizard-agents-grid"></div>
          <div class="btn-row" style="border-top:none;padding-top:8px">
            <button class="btn-primary" id="wizard-finish" style="width:100%;justify-content:center;display:flex">🚀
              LANCER Mon Assistant Pédagogique →</button>
          </div>
        </div>
        <div id="wizard-gen-error" style="display:none">
          <div class="info-block" style="border-left-color:var(--danger)">
            <strong style="color:var(--danger)">Erreur de génération</strong><br>
            <span id="wizard-error-msg"></span>
          </div>
          <div class="btn-row" style="border-top:none;padding-top:8px">
            <button class="btn-ghost" id="wizard-retry">{{ t('wiz_btn_retry') }}</button>
            <button class="btn-primary" id="wizard-skip-gen">{{ t('wiz_btn_skip') }}</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { t } from '../../i18n.js';
</script>
