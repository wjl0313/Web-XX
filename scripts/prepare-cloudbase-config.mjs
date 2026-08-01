import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const environmentId = String(process.env.CLOUDBASE_ENV_ID || '').trim()
if (!environmentId) throw new Error('CLOUDBASE_ENV_ID is required')

const templatePath = resolve(root, 'cloudbase/cloudbaserc.example.json')
const outputPath = resolve(root, 'cloudbaserc.json')
const template = await readFile(templatePath, 'utf8')
await writeFile(outputPath, template.replaceAll('__CLOUDBASE_ENV_ID__', environmentId), 'utf8')
console.log('Generated cloudbaserc.json from the environment-specific template.')
