import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { CLASS_EPIC_CONTENT, SPELLBOOK_BY_CLASS } from '../src/game-core/data'
import { createEmptyLegacySlots, createLegacyCharacter, type LegacyCharacterSave } from '../src/game-core/save'

const root = resolve(import.meta.dirname, '..')
const outputDir = resolve(root, 'legacy/baseline-save-samples')
const sourceCommit = '07919d35ba192e28570c9bf4a19a52da5dd86ff9'
const fixedNow = Date.parse('2026-08-01T00:00:00+08:00')

function equipment(
  base: string,
  quality: 'Magic' | 'Rare' | 'Epic' | 'Runeword' | 'Legendary' | 'Mythic',
  ilvl: number,
  rolls: Record<string, number>,
  extra: Record<string, unknown> = {},
) {
  return { base, name: base, quality, ilvl, levelReq: Math.max(1, ilvl - 3), rolls, ...extra }
}

function createCharacter(name: string, classId: 'Warrior' | 'Cleric' | 'Wizard' | 'Rogue'): LegacyCharacterSave {
  return createLegacyCharacter({ name, race: 'Human', classId, now: fixedNow })
}

function knownSpellIds(classId: keyof typeof SPELLBOOK_BY_CLASS, count: number): string[] {
  return SPELLBOOK_BY_CLASS[classId].slice(0, count).map((spell) => spell.id)
}

function makeLowWarrior(): LegacyCharacterSave {
  const character = createCharacter('青锋', 'Warrior')
  return Object.assign(character, {
    level: 4,
    xp: 165,
    xpNext: 400,
    hp: 208,
    maxHp: 208,
    mp: 52,
    maxMp: 52,
    atk: 24,
    def: 17,
    gold: 86,
    zone: 0,
    inventory: [
      'Bronze Hatchet',
      equipment('Tattered Robe', 'Magic', 3, { def: 2, hp: 12 }, { locked: true }),
      'Minor Healing Potion',
    ],
    equipment: {
      weapon: equipment('Worn Shortsword', 'Magic', 4, { atk: 3 }),
      chest: null,
      legs: 'Patchwork Leggings',
      feet: 'Rawhide Boots',
      offhand: null,
      charm: null,
    },
    knownSpells: knownSpellIds('Warrior', 2),
    memorizedSpells: ['shield_slam', 'taunting_blow'],
    quests: [{ name: 'Rat Extermination', mob: 'Field Rat', count: 5, prog: 3, done: false }],
    stats: { ...character.stats as object, kills: 14, xpEarned: 365, goldEarned: 86 },
    appearance: { sex: 'male', hairstyle: '束发', tone: '自然', robe: '青衣' },
  })
}

function makeMidCleric(): LegacyCharacterSave {
  const character = createCharacter('栖月', 'Cleric')
  return Object.assign(character, {
    level: 28,
    xp: 3_420,
    xpNext: 5_600,
    hp: 780,
    maxHp: 920,
    mp: 1_110,
    maxMp: 1_280,
    atk: 96,
    def: 82,
    mpRegen: 17,
    gold: 8_640,
    faction: 44,
    zone: 24,
    bindZone: 22,
    healpotions: 18,
    manapotions: 24,
    inventory: [
      equipment('Runed Mace', 'Rare', 27, { atk: 8, mp: 30, wis: 2 }, { favorite: true }),
      equipment('Frostwoven Mantle', 'Magic', 26, { def: 7, hp: 48 }),
      equipment('Storm Orb', 'Rare', 28, { atk: 5, mp: 42, int: 2 }, { locked: true }),
      'Greater Healing Potion',
      'Greater Mana Potion',
      'Recipe Scroll',
    ],
    equipment: {
      weapon: equipment('Runed Mace', 'Rare', 28, { atk: 10, mp: 36, wis: 3 }),
      chest: equipment('Frostwoven Mantle', 'Rare', 27, { def: 9, hp: 62, mp: 30 }),
      legs: equipment('Runed Greaves', 'Magic', 26, { def: 6, hp: 42 }),
      feet: equipment('Glacier Treads', 'Magic', 27, { def: 5, hp: 38 }),
      offhand: equipment('Storm Orb', 'Rare', 28, { atk: 6, mp: 54, int: 3 }),
      charm: equipment('Astral Loop', 'Rare', 27, { mp: 48, wis: 3, cha: 2 }),
    },
    knownSpells: knownSpellIds('Cleric', 4),
    memorizedSpells: ['holy_bolt', 'greater_heal', 'benediction', 'clr_sanctuary'],
    aa: { ...(character.aa as object), extraSpellSlots: 2 },
    autoSkillSlots: [true, true, true, false, true, true],
    spellCooldowns: { greater_heal: fixedNow + 5_000 },
    quests: [
      { name: 'Sanctum Purge', mob: 'Fear Elemental', count: 10, prog: 8, done: false },
      { name: 'Crypt Warden Hunt', mob: 'Crypt Warden', count: 6, prog: 6, done: true },
    ],
    runeStash: ['Rune: El', 'Rune: Tir', 'Rune: Tal'],
    huntTargets: { 24: 'Mordana Cultist' },
    afkProfiles: {
      slot1: { afkGoal: 'balanced', zone: 24, huntTarget: 'Mordana Cultist', autoRestHpPercent: 45, autoRestMpPercent: 30, afkIntervalMs: 1_200 },
      slot2: null,
      slot3: null,
    },
    stats: { ...character.stats as object, kills: 1_420, namedKills: 18, eliteKills: 44, bossKills: 3, xpEarned: 64_200, goldEarned: 31_800 },
    appearance: { sex: 'female', hairstyle: '云髻', tone: '白皙', robe: '月白' },
  })
}

function makeHighWizard(): LegacyCharacterSave {
  const character = createCharacter('照玄', 'Wizard')
  const epicSpell = CLASS_EPIC_CONTENT.Wizard.spell.id
  return Object.assign(character, {
    level: 92,
    xp: 88_200,
    xpNext: 110_400,
    hp: 6_840,
    maxHp: 7_100,
    mp: 14_880,
    maxMp: 15_600,
    atk: 1_260,
    def: 820,
    mpRegen: 62,
    gold: 486_000,
    faction: 1_840,
    zone: 15,
    bindZone: 14,
    inventory: [
      equipment('Godshard Edge', 'Legendary', 91, { atk: 82, int: 9, wis: 6 }, { locked: true, favorite: true }),
      equipment('Godshard Plate', 'Mythic', 92, { def: 74, hp: 620, mp: 420, int: 8 }),
      equipment('Arcane Lodestone', 'Legendary', 90, { atk: 36, mp: 540, int: 10, wis: 7 }),
      'Legendary Healing Potion',
      'Legendary Mana Potion',
      'Mystic Chest',
    ],
    equipment: {
      weapon: equipment('Stormcaller Staff', 'Mythic', 92, { atk: 108, mp: 780, int: 12, wis: 8 }, { maxSockets: 2, sockets: ['Rune: Sol', 'Rune: Lyr'] }),
      chest: equipment('Godshard Plate', 'Legendary', 91, { def: 88, hp: 760, mp: 340, con: 7 }, { maxSockets: 2, sockets: ['Rune: Vald', 'Rune: Morr'] }),
      legs: equipment('Godshard Legplates', 'Legendary', 91, { def: 62, hp: 520, int: 6 }),
      feet: equipment('Godshard Striders', 'Legendary', 90, { def: 48, hp: 410, dex: 7 }),
      offhand: equipment('Aether Codex', 'Mythic', 92, { atk: 70, mp: 920, int: 13, wis: 9 }, { maxSockets: 2, sockets: ['Rune: Tir', 'Rune: Zhar'] }),
      charm: equipment('Arcane Lodestone', 'Legendary', 91, { atk: 42, mp: 610, int: 11, cha: 6 }),
    },
    knownSpells: [...knownSpellIds('Wizard', 6), epicSpell],
    memorizedSpells: ['fireball', 'ice_comet', 'clarity', 'wiz_chain_lightning', 'wiz_starfire', 'wiz_arcane_well'],
    classQuest: { ...character.classQuest as object, progress: 28, completed: true, claimed: true },
    runeStash: ['Rune: El', 'Rune: Tir', 'Rune: Tal', 'Rune: Ort', 'Rune: Sol', 'Rune: Dol', 'Rune: Kor', 'Rune: Bron', 'Rune: Lyr', 'Rune: Vald', 'Rune: Zhar', 'Rune: Morr'],
    discoveredRunewords: ['Runeword: Steel', 'Runeword: Mana Weave', 'Runeword: Stormcaller', 'Runeword: Frostheart'],
    prestige: { rank: 3, points: 7, spent: 5, perks: { xp: 2, gold: 1, loot: 1, power: 1, ward: 0 }, lastStarterGrantRank: 3 },
    aa: { points: 21, spent: 14, nodes: { veteran_lore: 4, arcane_mastery: 5, soulkeeper: 5 }, xpProgress: 72_000, xpAllocPct: 25, extraSpellSlots: 4 },
    dungeon: { active: false, floor: 38, best: 38, checkpoint: 35, marks: 720, essence: 1_480, bossesCleared: 12, relicRanks: { ember: 4, moon: 3 }, theme: 'moon', autoDescend: false, autoLeaveOnDeath: true, modifier: 'hard' },
    huntTargets: { 15: 'Ash Drake' },
    bossCooldowns: { 15: fixedNow + 180_000 },
    stats: { ...character.stats as object, kills: 38_500, namedKills: 680, eliteKills: 1_260, bossKills: 88, deaths: 7, xpEarned: 4_820_000, goldEarned: 2_930_000 },
    appearance: { sex: 'male', hairstyle: '披发', tone: '冷白', robe: '玄紫' },
  })
}

function makeLegacyHeavyRogue(): LegacyCharacterSave {
  const character = createCharacter('无迹', 'Rogue')
  const runewordWeapon = equipment('Voidpiercer Lance', 'Runeword', 74, { atk: 62, dex: 8, cha: 4 }, {
    locked: true,
    favorite: true,
    maxSockets: 2,
    sockets: ['Rune: El', 'Rune: Tir'],
    runeword: { name: 'Runeword: Steel', bonus: { atk: 12, mp: 20 }, xp: 840 },
  })
  return Object.assign(character, {
    level: 74,
    xp: 54_600,
    xpNext: 73_000,
    hp: 5_260,
    maxHp: 5_800,
    mp: 4_320,
    maxMp: 4_900,
    atk: 980,
    def: 610,
    gold: 228_400,
    faction: 980,
    zone: 13,
    bindZone: 11,
    inventory: [
      runewordWeapon,
      equipment('Warden Plate', 'Epic', 73, { def: 54, hp: 480, con: 5 }, { epicId: 'warden_plate_bastion', locked: true }),
      equipment('Stormstride Boots', 'Rare', 72, { def: 30, hp: 240, dex: 8 }, { favorite: true }),
      'Epic Healing Potion',
      'Epic Mana Potion',
      'Recipe Scroll',
    ],
    equipment: {
      weapon: runewordWeapon,
      chest: equipment('Warden Plate', 'Epic', 73, { def: 54, hp: 480, con: 5 }, { epicId: 'warden_plate_bastion' }),
      legs: equipment('Stormforged Tassets', 'Legendary', 74, { def: 45, hp: 350, dex: 6 }),
      feet: equipment('Stormstride Boots', 'Rare', 72, { def: 30, hp: 240, dex: 8 }),
      offhand: equipment('Godshard Ward', 'Legendary', 74, { def: 56, hp: 410, mp: 260 }),
      charm: equipment('Bloodforged Charm', 'Legendary', 74, { atk: 32, hp: 330, dex: 7, cha: 5 }),
    },
    knownSpells: [...knownSpellIds('Rogue', 6), CLASS_EPIC_CONTENT.Rogue.spell.id],
    memorizedSpells: ['backstab', 'poison_strike', 'shadow_mend', 'rog_heartseeker', 'rog_eviscerate', 'rog_smoke_recovery'],
    runeStash: ['Rune: El', 'Rune: Tir', 'Rune: Tal', 'Rune: Ort', 'Rune: Sol', 'Rune: Dol', 'Rune: Kor', 'Rune: Bron'],
    discoveredRunewords: ['Runeword: Steel', 'Runeword: Bloodfang', 'Runeword: Tempo', 'Runeword: Swiftfoot'],
    group: [{ id: 'legacy-companion-1', name: '丹霞', cls: 'Cleric', level: 70 }],
    lfg: true,
    lfgParty: [{ id: 'borrowed-hero-1', name: '破军', cls: 'Warrior', level: 72, owner: 'legacy-player' }],
    partyLineup: ['self', 'legacy-companion-1', 'mercenary'],
    partyHp: { units: { self: 5_260, 'legacy-companion-1': 4_100, mercenary: 4_800 } },
    groupSplitGold: true,
    groupMercs: ['Vanguard'],
    groupMercNames: ['铁山'],
    groupMercGear: [{ weapon: 'Steel Longsword', chest: 'Warden Plate' }],
    mercenary: {
      type: 'Vanguard', customName: '铁山', totalPaid: 98_000, hires: 14, lastHiredAt: fixedNow - 86_400_000,
      totalUpkeepPaid: 41_000, nextUpkeepAt: fixedNow + 3_600_000, lastUpkeepPaidAt: fixedNow - 3_600_000,
      actionReadyAt: fixedNow, gear: { weapon: 'Steel Longsword', chest: 'Warden Plate', legs: 'Warden Legplates', feet: 'Warden Sabatons', offhand: 'Tower Shield', charm: 'Wardstone Amulet' },
    },
    pets: { active: 'shadow-wolf', owned: [{ id: 'shadow-wolf', name: '墨影', level: 31, bond: 880 }], lastActionAt: fixedNow - 60_000 },
    prestige: { rank: 2, points: 6, spent: 4, perks: { xp: 1, gold: 1, loot: 1, power: 1, ward: 0 }, lastStarterGrantRank: 2 },
    aa: { points: 18, spent: 12, nodes: { veteran_lore: 3, shadow_step: 5, soulkeeper: 4 }, xpProgress: 46_000, xpAllocPct: 20, extraSpellSlots: 4 },
    crafting: { shards: { common: 1_420, magic: 620, rare: 188, epic: 24 }, alchemyLevel: 19, smithingLevel: 23, recipes: ['Recipe Scroll'] },
    dungeon: { active: false, floor: 29, best: 34, checkpoint: 30, marks: 460, essence: 980, bossesCleared: 9, relicRanks: { abyssal: 3, ember: 2 }, theme: 'abyssal', autoDescend: true, autoLeaveOnDeath: true, modifier: 'hard' },
    achievements: { first_blood: true, named_hunter: true, dungeon_depth_25: true },
    activeTitle: 'Night Contract',
    unlockedTitles: ['Night Contract', 'Veteran Lore'],
    dailyQuests: [{ id: 'daily-rat-hunt', progress: 20, target: 20, claimed: true }],
    dailyReset: fixedNow + 86_400_000,
    bossCooldowns: { 11: fixedNow + 120_000, 13: fixedNow + 240_000 },
    afkProfiles: {
      slot1: { afkGoal: 'balanced', zone: 13, huntTarget: 'Bone Lord', autoRestHpPercent: 40, autoRestMpPercent: 25, afkIntervalMs: 900 },
      slot2: { afkGoal: 'loot', zone: 11, huntTarget: 'Plague Bearer', autoRestHpPercent: 55, autoRestMpPercent: 35, afkIntervalMs: 1_200 },
      slot3: { afkGoal: 'xp', zone: 10, huntTarget: '', autoRestHpPercent: 50, autoRestMpPercent: 30, afkIntervalMs: 800 },
    },
    loadouts: {
      slot1: { name: '猎妖', equipment: { weapon: runewordWeapon }, memorizedSpells: ['backstab', 'poison_strike', 'shadow_mend'] },
      slot2: { name: '首领', equipment: { weapon: 'Godshard Edge' }, memorizedSpells: ['rog_heartseeker', 'rog_eviscerate'] },
      slot3: null,
    },
    activeLoadout: 'slot1',
    guild: { id: 'legacy-guild', name: '听雨楼', rank: 'elder', contribution: 12_600 },
    casino: { spins: 184, wins: 37, netGold: -8_400 },
    social: { muted: ['old-player-id'], friends: ['friend-a', 'friend-b'] },
    shrine: { deity: 'old-shadow-idol', favor: 320, lastPrayerAt: fixedNow - 86_400_000 },
    collection: { itemSets: ['Stormforged'], bestiary: { 'Field Rat': 120, 'Bone Lord': 22 } },
    stats: { ...character.stats as object, kills: 27_400, namedKills: 510, eliteKills: 940, bossKills: 61, deaths: 12, xpEarned: 3_260_000, goldEarned: 1_980_000 },
    appearance: { sex: 'female', hairstyle: '高马尾', tone: '小麦', robe: '墨衣' },
  })
}

const samples = [
  { file: '01-low-warrior.json', role: '青锋', level: 4, className: '炼体士', coverage: '创建、低等级战斗、基础功法、六槽空位、背包标记', character: makeLowWarrior() },
  { file: '02-mid-cleric.json', role: '栖月', level: 28, className: '丹医', coverage: '治疗、四功法位、冷却、任务、完整六槽、挂机方案', character: makeMidCleric() },
  { file: '03-high-wizard.json', role: '照玄', level: 92, className: '五行法修', coverage: '高阶功法、首领、符纹、悟道/转世、秘境只读数据', character: makeHighWizard() },
  { file: '04-legacy-heavy-rogue.json', role: '无迹', level: 74, className: '影修', coverage: '大量旧字段、同行、护道者、灵兽、符纹、炼制、宗门、赌石、社交字段保真', character: makeLegacyHeavyRogue() },
] as const

mkdirSync(outputDir, { recursive: true })
const rows: string[] = []
for (const sample of samples) {
  const slots = createEmptyLegacySlots()
  slots[0] = sample.character
  const body = `${JSON.stringify(slots, null, 2)}\n`
  writeFileSync(resolve(outputDir, sample.file), body, 'utf8')
  const hash = createHash('sha256').update(body).digest('hex').toUpperCase()
  rows.push(`| \`${sample.file}\` | ${sample.role} | ${sample.className} | ${sample.level} | \`${hash}\` | ${sample.coverage} |`)
}

const readme = `# P0 冻结存档样本

本目录保存 P0 功能等价回归使用的四类确定性存档。样本不会随普通测试自动重写，不含真实账号凭据、云端令牌或个人信息。

- 冻结版本：\`1.6.19\`
- 存档 schema：\`2\`
- 来源提交：\`${sourceCommit}\`
- 角色槽：每个文件均使用第 1 槽，其余 23 槽为空
- 生成命令：\`.\\node_modules\\.bin\\vite-node.cmd scripts/generate-p0-baseline-saves.ts\`

| 文件 | 角色 | 传承 | 等级 | SHA-256 | 覆盖字段与目的 |
| --- | --- | --- | ---: | --- | --- |
${rows.join('\n')}

这些样本用于验证旧存档读取、新壳写回、未知字段保真、战斗/装备/功法/挂机/离线摘要，以及只读兼容数据不会被默认原生流程意外推进。
`
writeFileSync(resolve(outputDir, 'README.md'), readme, 'utf8')

console.log(`已生成 ${samples.length} 个 P0 冻结存档样本。`)
