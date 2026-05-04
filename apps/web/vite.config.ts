import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const packageJson = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __SST_WEB_VERSION__: JSON.stringify(packageJson.version),
  },
  server: {
    port: 3000,
    host: true, // Listen on all network interfaces (0.0.0.0) for remote access
    // Note: Proxy is disabled for remote API connections
    // The dashboard connects directly to the API URL configured in Settings
    // Uncomment proxy below for local development with API on localhost:3001
    // proxy: {
    //   '/api': {
    //     target: 'http://localhost:3001',
    //     changeOrigin: true,
    //     rewrite: (path) => path.replace(/^\/api/, '')
    //   },
    //   '/auth': {
    //     target: 'http://localhost:3001',
    //     changeOrigin: true
    //   }
    // }
  }
})
