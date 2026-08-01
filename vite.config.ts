import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'

import { createLocalizedLegacyRuntime } from './src/app/legacy-runtime-source'

const legacyFile = fileURLToPath(new URL('./legacy/fanxiulu-monolith.html', import.meta.url))
const legacyUrl = '/legacy/fanxiulu-monolith.html'

function localizedLegacyGame(): Plugin {
  const localizedRuntime = () => createLocalizedLegacyRuntime(readFileSync(legacyFile, 'utf8'))
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
      response.end(Buffer.from(localizedRuntime(), 'utf8'))
    }
  }

  return {
    name: 'fanxiulu-localized-legacy-runtime',
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
        source: localizedRuntime(),
      })
    },
  }
}

export default defineConfig({
  plugins: [localizedLegacyGame(), vue()],
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
  },
})
