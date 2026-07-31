import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'

const legacyFile = fileURLToPath(new URL('./legacy/fanxiulu-monolith.html', import.meta.url))
const legacyUrl = '/legacy/fanxiulu-monolith.html'

function legacyGameBridge(): Plugin {
  const serveLegacyFile = () => {
    return (
      request: { url?: string },
      response: { setHeader(name: string, value: string): void; end(body: Buffer): void },
      next: () => void,
    ) => {
      if (request.url?.split('?')[0] !== legacyUrl) {
        next()
        return
      }

      response.setHeader('Content-Type', 'text/html; charset=utf-8')
      response.setHeader('Cache-Control', 'no-cache')
      response.end(readFileSync(legacyFile))
    }
  }

  return {
    name: 'fanxiulu-legacy-game-bridge',
    configureServer(server) {
      server.middlewares.use(serveLegacyFile())
    },
    configurePreviewServer(server) {
      server.middlewares.use(serveLegacyFile())
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: legacyUrl.slice(1),
        source: readFileSync(legacyFile),
      })
    },
  }
}

export default defineConfig({
  plugins: [legacyGameBridge(), vue()],
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
  },
})
