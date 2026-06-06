import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // In dev the SW runs only when explicitly enabled; in prod it's always active.
      devOptions: { enabled: false },
      manifest: {
        name: 'FTTH GIS Editor',
        short_name: 'FTTH GIS',
        description: 'Editor GIS para redes de fibra óptica FTTH',
        theme_color: '#0d1a2e',
        background_color: '#060e1a',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        // Add PNG icons at public/icon-192.png and public/icon-512.png for home-screen install.
        icons: [],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        // Precache all static assets produced by Vite.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,woff,ttf}'],
        // SPA fallback: all navigate requests that don't match a precached asset
        // return index.html so client-side routing continues to work offline.
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/zabbix-proxy\//],
        runtimeCaching: [
          // ── OSM tiles ──────────────────────────────────────────────────────
          {
            urlPattern: /^https:\/\/[a-z0-9]+\.tile\.openstreetmap\.org\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'map-tiles-osm',
              expiration: { maxEntries: 300, maxAgeSeconds: 7 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // ── OpenTopoMap tiles ────────────────────────────────────────────────
          {
            urlPattern: /^https:\/\/[a-z0-9]+\.tile\.opentopomap\.org\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'map-tiles-topo',
              expiration: { maxEntries: 200, maxAgeSeconds: 7 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // ── Google Maps tiles ────────────────────────────────────────────────
          {
            urlPattern: /^https:\/\/mt[0-3]\.google\.com\/vt\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'map-tiles-google',
              expiration: { maxEntries: 300, maxAgeSeconds: 7 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // ── Esri tiles ──────────────────────────────────────────────────────
          {
            urlPattern: /^https:\/\/server\.arcgisonline\.com\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'map-tiles-esri',
              expiration: { maxEntries: 200, maxAgeSeconds: 7 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // ── CartoDB tiles ────────────────────────────────────────────────────
          // NetworkFirst: el export usa fetch() con cache:'no-store' para evitar
          // respuestas opacas que taintan el canvas. El SW no interfiere.
          {
            urlPattern: /^https:\/\/[a-z0-9]+\.basemaps\.cartocdn\.com\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'map-tiles-carto',
              networkTimeoutSeconds: 8,
              expiration: { maxEntries: 300, maxAgeSeconds: 7 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [200] },
            },
          },
          // ── Nominatim geocoding (short-lived) ────────────────────────────────
          {
            urlPattern: /^https:\/\/nominatim\.openstreetmap\.org\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'nominatim',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  base: '/',
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/zabbix-proxy': {
        target: process.env.VITE_ZABBIX_TARGET ?? 'http://10.20.200.247',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/zabbix-proxy/, ''),
      },
    },
  },
})
