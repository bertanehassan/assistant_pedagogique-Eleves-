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
      }
    }
  },
  plugins: [
    vue(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: 'auto',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,json,woff2,ttf}'],
        maximumFileSizeToCacheInBytes: 5000000,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'jsdelivr-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            urlPattern: /^https:\/\/cdnjs\.cloudflare\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'cdnjs-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'google-fonts-cache'
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 365 }
            }
          }
        ]
      },
      manifest: {
        name: 'Mon Assistant Pédagogique - Élèves-',
        short_name: 'Assistant Pédagogique',
        description: 'Assistant IA de révision et QCM',
        theme_color: '#0d1117',
        background_color: '#0d1117',
        display: 'standalone',
        icons: [
          {
            src: 'favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml'
          }
        ]
      }
    }),
    // Obfuscation activée uniquement en production
    mode === 'production' && obfuscatorPlugin({
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
