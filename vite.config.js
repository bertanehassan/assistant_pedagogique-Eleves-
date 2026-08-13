import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import obfuscatorPlugin from 'rollup-plugin-obfuscator'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    port: 5174,
    strictPort: false,
    proxy: {
      '/api/gemini': {
        target: 'https://generativelanguage.googleapis.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/gemini/, '')
      },
      '/api/openrouter': {
        target: 'https://openrouter.ai',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/openrouter/, '')
      },
      '/api/xai': {
        target: 'https://api.x.ai',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/xai/, '')
      }
    }
  },
  plugins: [
    vue(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      registerType: 'prompt',
      injectRegister: 'auto',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,json,woff2,ttf}'],
        maximumFileSizeToCacheInBytes: 5000000,
      },
      // Suppression de la section workbox qui est gérée dans src/sw.js
      manifest: {
        name: 'Mon Assistant Pédagogique - Élèves-',
        short_name: 'Assistant Pédagogique',
        description: 'Assistant IA de révision et QCM',
        theme_color: '#0d1117',
        background_color: '#0d1117',
        display: 'standalone',
        icons: [
          {
            src: 'icon-v2.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          },
          {
            src: 'icon-new.jpg',
            sizes: '1024x1024',
            type: 'image/jpeg'
          }
        ],
        share_target: {
          action: '/?shared_file=true',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: {
            title: 'title',
            text: 'text',
            url: 'url',
            files: [
              {
                name: 'shared_quiz_file',
                accept: ['application/json', '.json']
              }
            ]
          }
        }
      }
    }),
    // Obfuscation activée uniquement en production
    mode === 'production' && obfuscatorPlugin({
      // Exclure tutor-voice.js : controlFlowFlattening casse les callbacks SpeechRecognition
      exclude: [/tutor-voice/],
      options: {
        // ── Encodage des chaînes de caractères ──
        stringArray: true,
        stringArrayEncoding: ['base64'],
        stringArrayThreshold: 0.85,
        stringArrayWrappersCount: 1,
        stringArrayWrappersType: 'variable',
        stringArrayIndexShift: true,
        stringArrayRotate: true,
        stringArrayShuffle: true,

        // ── Aplatissement du flux de contrôle (rend la logique illisible) ──
        controlFlowFlattening: true,
        controlFlowFlatteningThreshold: 0.4,

        // ── Injection de code mort (leurres) ──
        deadCodeInjection: true,
        deadCodeInjectionThreshold: 0.1,

        // ── Renommage des identifiants ──
        identifierNamesGenerator: 'hexadecimal',
        renameGlobals: false,

        // ── Auto-défense: le code se casse si on le reformatte ──
        selfDefending: false,

        // ── Empêche le débogueur de s'attacher ──
        debugProtection: false,
        debugProtectionInterval: 4000,

        // ── Désactive la console ──
        disableConsoleOutput: false, // garder false pour ne pas bloquer les logs légitimes

        // ── Source maps désactivées en prod ──
        sourceMap: false,

        // ── Cible navigateur ──
        target: 'browser',
      }
    }),
  ].filter(Boolean),
}))
