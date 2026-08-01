import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

import { parse } from '@babel/parser'

const root = resolve(import.meta.dirname, '..')
const legacyPath = resolve(root, 'legacy/fanxiulu-monolith.html')
const outputDirectory = resolve(root, 'src/game-core/data')
const checkOnly = process.argv.includes('--check')

const groups = {
  'characters.generated.ts': [
    'CLASSES',
    'ABILITIES',
    'ABILITY_LABELS',
    'ABILITY_FULL',
    'ABILITY_EFFECT_TEXT',
    'CLASS_ABILITIES',
    'ABILITY_GROWTH_EVERY',
    'CLASS_ICONS',
    'CLASS_COLORS',
    'CLASS_DESCRIPTIONS',
    'GAME_RACES',
    'RACE_ICONS',
    'RACE_CLASS_RULES',
  ],
  'world.generated.ts': [
    'ZONES',
    'NAMED_BY_ZONE',
    'NAMED_MECHANICS',
    'ZONE_EVENTS',
    'DUNGEON_MOBS',
    'DUNGEON_THEMES',
    'BOSS_BY_ZONE',
  ],
  'items.generated.ts': [
    'ITEM_DATA',
    'ITEM_DATA_EXPANSION',
    'WEAPON_PROCS',
    'ITEM_SETS',
    'LOOT',
    'LOOT_TIER_STARTER',
    'LOOT_TIER_MID',
    'LOOT_TIER_ADVANCED',
    'LOOT_TIER_EPIC',
    'LOOT_TIER_MYTHIC',
    'LOOT_MISC_BASES',
    'ITEM_AFFIX_POOL',
    'EPIC_ITEM_BY_BASE',
    'CONTAINER_ITEMS',
    'RENAMED_ITEMS',
    'RENAMED_MOBS',
  ],
  'runes.generated.ts': [
    'RUNE_DATA',
    'RUNEWORD_RECIPES_BY_SLOT',
    'RUNEWORD_EVOLUTION_THRESHOLDS',
    'RUNEWORD_EVOLUTION_MULT_PER_TIER',
    'RUNE_TRANSMUTE_CHAIN',
    'SHOP_BASE_PRICES',
    'MAX_SHOP_SELLBACK_RATE',
  ],
  'spells.generated.ts': ['SPELLBOOK_BY_CLASS', 'CLASS_EPIC_CONTENT'],
  'companions.generated.ts': ['MERCENARY_TYPES', 'PETS', 'PHASE5'],
  'combat.generated.ts': ['PHASE1', 'PHASE2', 'PHASE4', 'PHASE6', 'GOLD_DROP_MULT'],
}

function inlineScripts(html) {
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(
    (match) => match[1],
  )
  if (!scripts.length) throw new Error('No inline legacy script was found.')
  return scripts
}

function largestInlineScript(scripts) {
  scripts.sort((left, right) => right.length - left.length)
  return scripts[0]
}

function findInitializer(node, name, script) {
  if (!node || typeof node !== 'object') return null
  if (
    node.type === 'VariableDeclarator' &&
    node.id?.type === 'Identifier' &&
    node.id.name === name &&
    node.init
  ) {
    return script.slice(node.init.start, node.init.end)
  }

  for (const [key, value] of Object.entries(node)) {
    if (['loc', 'start', 'end', 'errors', 'comments'].includes(key)) continue
    if (Array.isArray(value)) {
      for (const child of value) {
        const found = findInitializer(child, name, script)
        if (found) return found
      }
    } else if (value && typeof value === 'object' && value.type) {
      const found = findInitializer(value, name, script)
      if (found) return found
    }
  }

  return null
}

function collectDeclarations(script, program) {
  const declarations = new Map()
  let weaponProcExpansion = null

  for (const node of program.body) {
    if (node.type === 'VariableDeclaration') {
      for (const declaration of node.declarations) {
        if (declaration.id.type !== 'Identifier' || !declaration.init) continue
        declarations.set(declaration.id.name, script.slice(declaration.init.start, declaration.init.end))
      }
      continue
    }

    if (node.type !== 'ExpressionStatement' || node.expression.type !== 'CallExpression') continue
    const call = node.expression
    if (
      call.callee.type !== 'MemberExpression' ||
      call.callee.object.type !== 'Identifier' ||
      call.callee.object.name !== 'Object' ||
      call.callee.property.type !== 'Identifier' ||
      call.callee.property.name !== 'assign' ||
      call.arguments[0]?.type !== 'Identifier' ||
      call.arguments[0].name !== 'WEAPON_PROCS' ||
      call.arguments[1]?.type !== 'ObjectExpression'
    ) {
      continue
    }

    weaponProcExpansion = script.slice(call.arguments[1].start, call.arguments[1].end)
  }

  if (!weaponProcExpansion) throw new Error('WEAPON_PROCS expansion was not found.')
  return { declarations, weaponProcExpansion }
}

function collectFunctionReturn(script, program, functionName) {
  const declaration = program.body.find(
    (node) => node.type === 'FunctionDeclaration' && node.id?.name === functionName,
  )
  if (!declaration) throw new Error(`Legacy function ${functionName} was not found.`)

  const returned = declaration.body.body.find((node) => node.type === 'ReturnStatement')
  if (!returned?.argument) throw new Error(`Legacy function ${functionName} has no return value.`)
  return script.slice(returned.argument.start, returned.argument.end)
}

function renderModule(names, declarations, additions = '') {
  const sections = names.map((name) => {
    const initializer = declarations.get(name)
    if (!initializer) throw new Error(`Legacy declaration ${name} was not found.`)
    return `export const ${name} = ${initializer} as const`
  })

  return [
    '// Generated from the frozen monolith by scripts/extract-legacy-static-data.mjs.',
    '// Do not edit this file manually.',
    '',
    ...sections.flatMap((section) => [section, '']),
    additions,
  ]
    .join('\n')
    .trimEnd()
    .concat('\n')
}

const html = readFileSync(legacyPath, 'utf8')
const scripts = inlineScripts(html)
const script = largestInlineScript([...scripts])
const ast = parse(script, { sourceType: 'script', errorRecovery: false })
const { declarations, weaponProcExpansion } = collectDeclarations(script, ast.program)
const freshQuests = collectFunctionReturn(script, ast.program, 'freshQuests')

let exactTranslations = null
for (const candidate of scripts) {
  if (!candidate.includes('const EXACT')) continue
  const candidateAst = parse(candidate, { sourceType: 'script', errorRecovery: false })
  exactTranslations = findInitializer(candidateAst.program, 'EXACT', candidate)
  if (exactTranslations) break
}
if (!exactTranslations) throw new Error('Legacy EXACT translation map was not found.')

mkdirSync(outputDirectory, { recursive: true })
let mismatches = 0

for (const [fileName, names] of Object.entries(groups)) {
  let additions = ''
  if (fileName === 'items.generated.ts') {
    additions = [
      `export const WEAPON_PROCS_EXPANSION = ${weaponProcExpansion} as const`,
      '',
      'export const ALL_ITEM_DATA = Object.freeze({ ...ITEM_DATA, ...ITEM_DATA_EXPANSION })',
      'export const ALL_WEAPON_PROCS = Object.freeze({ ...WEAPON_PROCS, ...WEAPON_PROCS_EXPANSION })',
    ].join('\n')
  }

  const expected = renderModule(names, declarations, additions)
  const outputPath = resolve(outputDirectory, fileName)

  if (checkOnly) {
    let actual = ''
    try {
      actual = readFileSync(outputPath, 'utf8')
    } catch {
      // Report the missing file through the same mismatch path.
    }
    if (actual !== expected) {
      console.error(`Static data is out of date: ${fileName}`)
      mismatches += 1
    }
  } else {
    writeFileSync(outputPath, expected, 'utf8')
    console.log(`Generated ${fileName}`)
  }
}

const localizationFileName = 'localization.generated.ts'
const localizationExpected = renderModule(
  [],
  declarations,
  `export const LEGACY_ZH_CN_EXACT = ${exactTranslations} as const`,
)
const localizationPath = resolve(outputDirectory, localizationFileName)
if (checkOnly) {
  let actual = ''
  try {
    actual = readFileSync(localizationPath, 'utf8')
  } catch {
    // Report the missing file through the same mismatch path.
  }
  if (actual !== localizationExpected) {
    console.error(`Static data is out of date: ${localizationFileName}`)
    mismatches += 1
  }
} else {
  writeFileSync(localizationPath, localizationExpected, 'utf8')
  console.log(`Generated ${localizationFileName}`)
}


const questsFileName = 'quests.generated.ts'
const questsExpected = renderModule(
  [],
  declarations,
  `export const FRESH_QUESTS = ${freshQuests} as const`,
)
const questsPath = resolve(outputDirectory, questsFileName)
if (checkOnly) {
  let actual = ''
  try {
    actual = readFileSync(questsPath, 'utf8')
  } catch {
    // Report the missing file through the same mismatch path.
  }
  if (actual !== questsExpected) {
    console.error(`Static data is out of date: ${questsFileName}`)
    mismatches += 1
  }
} else {
  writeFileSync(questsPath, questsExpected, 'utf8')
  console.log(`Generated ${questsFileName}`)
}

if (mismatches) process.exitCode = 1
else if (checkOnly) console.log('Legacy static data modules match the frozen monolith.')
