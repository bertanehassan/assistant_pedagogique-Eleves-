<template>
  <!-- â•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گ MODAL : DATA â•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گ -->
  <div class="modal-overlay" id="data-modal">
    <div class="modal-box">
      <div class="corner-deco corner-tl"></div>
      <div class="corner-deco corner-tr"></div>
      <div class="corner-deco corner-bl"></div>
      <div class="corner-deco corner-br"></div>
      <div class="modal-header">
        <div class="modal-title">{{ t('mdl_data_title') }}</div>
        <button class="modal-close" id="close-data-modal">{{ t('btn_close_x') }}</button>
      </div>
      <div class="modal-body">

        <div class="info-block">
          <strong>{{ t('mdl_data_storage_title') }}</strong><br>
          {{ t('mdl_data_storage_desc') }}
        </div>

        <!-- STATS -->
        <div class="data-grid" id="data-stats">
          <div class="data-card">
            <div class="data-card-value" id="stat-chats">—</div>
            <div class="data-card-label">{{ t('mdl_data_lbl_chats') }}</div>
          </div>
          <div class="data-card">
            <div class="data-card-value" id="stat-agents">—</div>
            <div class="data-card-label">{{ t('mdl_data_lbl_agents') }}</div>
          </div>
          <div class="data-card">
            <div class="data-card-value" id="stat-memories">—</div>
            <div class="data-card-label">{{ t('mdl_data_lbl_memories') }}</div>
          </div>
          <div class="data-card">
            <div class="data-card-value" id="stat-size">—</div>
            <div class="data-card-label">{{ t('mdl_data_lbl_size') }}</div>
          </div>
        </div>

        <!-- EXPORT -->
        <div class="section-title">{{ t('mdl_data_export_title') }}</div>
        <p style="font-size:12px;color:var(--text-dim);margin-bottom:12px;line-height:1.6"><span v-html="t('mdl_data_export_desc')"></span></p>
        <button class="btn-primary" id="btn-export"
          style="width:100%;justify-content:center;display:flex;gap:8px;align-items:center">
          {{ t('btn_download_all') }}
        </button>

        <!-- IMPORT -->
        <div class="section-title">{{ t('mdl_data_import_title') }}</div>
        <p style="font-size:12px;color:var(--text-dim);margin-bottom:12px;line-height:1.6"><span v-html="t('mdl_data_import_desc')"></span></p>

        <!-- Zone sélection fichier -->
        <div class="export-zone" id="import-drop-zone">
          <div class="export-zone-icon">⬆</div>
          <div class="export-zone-text">
            <span v-html="t('mdl_data_drag_drop')"></span>
          </div>
        </div>
        <input type="file" id="import-file-input" accept=".json,.Mon Assistant IA.json" style="display:none">

        <!-- Aperçu fichier sélectionné (caché par défaut) -->
        <div id="import-preview"
          style="display:none;background:var(--hull);border:var(--hud-border);border-radius:var(--r);padding:14px 16px;margin-top:10px">
          <div
            style="font-family:var(--font-mono);font-size:10px;letter-spacing:2px;color:var(--cyan);margin-bottom:8px">
            {{ t('mdl_data_file_sel') }}</div>
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
            <span style="font-size:22px">📄</span>
            <div>
              <div id="import-filename" style="font-family:var(--font-mono);font-size:12px;color:var(--text-bright)">—
              </div>
              <div id="import-fileinfo"
                style="font-family:var(--font-mono);font-size:10px;color:var(--text-dim);margin-top:2px">—</div>
            </div>
          </div>
          <div id="import-summary"
            style="font-size:12px;color:var(--text);line-height:1.7;background:var(--void);border-radius:var(--r);padding:10px 12px;margin-bottom:12px;border:1px solid var(--grid)">
            {{ t('mdl_data_analyzing') }}
          </div>
          <div style="display:flex;gap:8px">
            <button class="btn-ghost" id="btn-import-cancel" style="flex:1">{{ t('btn_cancel_import') }}</button>
            <button class="btn-primary" id="btn-import-confirm"
              style="flex:2;justify-content:center;display:flex;gap:6px;align-items:center">
              {{ t('btn_confirm_import') }}
            </button>
          </div>
        </div>

        <!-- DANGER ZONE -->
        <div class="section-title" style="border-top-color:rgba(255,51,102,0.3);color:rgba(255,51,102,0.6)">{{ t('mdl_data_critical') }}</div>
        <button class="btn-ghost" id="btn-clear-all"
          style="width:100%;justify-content:center;display:flex;border-color:rgba(255,51,102,0.3);color:var(--danger)">
          {{ t('btn_del_local') }}
        </button>

        <!-- Reset Service Worker / Cache Workbox -->
        <button class="btn-ghost" id="btn-clear-sw-cache"
          style="width:100%;justify-content:center;display:flex;margin-top:8px;border-color:rgba(255,165,0,0.35);color:#ffaa44;"
          title="Déregistre le Service Worker et purge tous les caches Workbox pour forcer le rechargement de la dernière version">
          🗑️ Vider le cache / Réinitialiser le SW
        </button>

        <div class="btn-row" style="border-top:none;margin-top:12px;padding-top:0">
          <button class="btn-ghost" id="close-data-modal-2">{{ t('btn_close_data') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { t } from '../../i18n.js';
</script>
