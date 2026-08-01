import { copyFile, mkdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'

import { build } from 'vite'

const root = resolve(import.meta.dirname, '..')
const sourceDirectory = resolve(root, 'cloudbase/functions/game')
const outputDirectory = resolve(root, 'cloudbase/dist/game')

await rm(outputDirectory, { recursive: true, force: true })
await mkdir(outputDirectory, { recursive: true })
await build({
  configFile: false,
  root,
  logLevel: 'warn',
  build: {
    target: 'node20',
    outDir: outputDirectory,
    emptyOutDir: false,
    minify: false,
    sourcemap: true,
    lib: {
      entry: resolve(sourceDirectory, 'index.ts'),
      formats: ['cjs'],
      fileName: () => 'index.js',
    },
    rollupOptions: {
      external: ['@cloudbase/node-sdk'],
    },
  },
})
await copyFile(resolve(sourceDirectory, 'package.json'), resolve(outputDirectory, 'package.json'))

console.log('CloudBase function bundle created at cloudbase/dist/game.')
