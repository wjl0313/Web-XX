import {
  CLASS_EPIC_CONTENT,
  CLASSES,
  RACE_CLASS_RULES,
  SPELLBOOK_BY_CLASS,
  isLegacyClassId,
  isLegacyRaceId,
} from '../data'
import { LEGACY_GAME_VERSION } from './constants'
import { createFreshLegacyQuests, rollLegacyClassAbilities } from './legacy-character.migration'
import type { LegacyCharacterSave } from './types'

export interface CreateLegacyCharacterInput {
  name: string
  race: string
  classId: string
  hardcore?: boolean
  now?: number
}

export function createLegacyCharacter(input: CreateLegacyCharacterInput): LegacyCharacterSave {
  if (!isLegacyRaceId(input.race)) throw new TypeError('无效灵根')
  if (!isLegacyClassId(input.classId)) throw new TypeError('无效传承')
  if (!(RACE_CLASS_RULES[input.race] as readonly string[]).includes(input.classId)) {
    throw new TypeError('该灵根无法选择此传承')
  }
  const name = String(input.name || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 24)
  if (name.length < 2) throw new TypeError('道号至少需要两个字符')
  const now = Math.floor(input.now ?? Date.now())
  const base = CLASSES[input.classId]
  const starterSpell = SPELLBOOK_BY_CLASS[input.classId][0]?.id || null
  const epic = CLASS_EPIC_CONTENT[input.classId]

  return {
    version: LEGACY_GAME_VERSION,
    name,
    race: input.race,
    cls: input.classId,
    level: 1,
    xp: 0,
    xpNext: 100,
    hp: base.hp,
    maxHp: base.hp,
    mp: base.mp,
    maxMp: base.mp,
    atk: base.atk,
    def: base.def,
    mpRegen: base.mpRegen,
    gold: 0,
    faction: 0,
    healpotions: 3,
    manapotions: 3,
    healpotions_lhp: 0,
    manapotions_lmp: 0,
    healpotions_ghp: 0,
    manapotions_gmp: 0,
    healpotions_shp: 0,
    manapotions_smp: 0,
    healpotions_heroic: 0,
    manapotions_heroic: 0,
    healpotions_epic: 0,
    manapotions_epic: 0,
    healpotions_legendary: 0,
    manapotions_legendary: 0,
    zone: 0,
    bindZone: 0,
    corpse: null,
    inventory: [],
    runeStash: [],
    discoveredRunewords: [],
    bags: ['Worn Pouch', 'Worn Pouch', 'Worn Pouch', 'Worn Pouch'],
    equipment: { weapon: null, chest: null, legs: null, feet: null, offhand: null, charm: null },
    knownSpells: starterSpell ? [starterSpell] : [],
    memorizedSpells: [starterSpell, null],
    spellShopInitialized: true,
    spellCooldowns: {},
    autoUseSkills: true,
    autoSkillSlots: [true, true, true, true, true, true],
    quests: createFreshLegacyQuests(),
    statusEffects: [],
    abilities: rollLegacyClassAbilities(input.classId, 1),
    pets: { active: 'none', owned: [], lastActionAt: 0 },
    group: [],
    lfg: false,
    lfgParty: [],
    partyLineup: [],
    partyHp: { units: {} },
    groupSplitGold: false,
    groupMercs: [],
    groupMercNames: [],
    groupMercGear: [],
    mercenary: {
      type: 'none', customName: '', totalPaid: 0, hires: 0, lastHiredAt: 0,
      totalUpkeepPaid: 0, nextUpkeepAt: 0, lastUpkeepPaidAt: 0, actionReadyAt: 0,
      gear: { weapon: null, chest: null, legs: null, feet: null, offhand: null, charm: null },
    },
    prestige: { rank: 0, points: 0, spent: 0, perks: { xp: 0, gold: 0, loot: 0, power: 0, ward: 0 }, lastStarterGrantRank: 0 },
    aa: { points: 0, spent: 0, nodes: {}, xpProgress: 0, xpAllocPct: 0 },
    crafting: { shards: { common: 0, magic: 0, rare: 0, epic: 0 } },
    huntTargets: {},
    huntStreak: { zone: null, target: '', count: 0 },
    afkProfiles: { slot1: null, slot2: null, slot3: null },
    loadouts: { slot1: null, slot2: null, slot3: null },
    activeLoadout: '',
    afkRules: { autoBuyPots: true, potMin: 5, autoAdvanceContract: true },
    afkGoal: 'balanced',
    afkEnabled: false,
    lastAfkAt: null,
    classQuest: {
      name: epic.questName, target: epic.target, count: epic.count,
      progress: 0, completed: false, claimed: false,
    },
    dungeon: {
      active: false, floor: 1, best: 1, checkpoint: 1, marks: 0, essence: 0,
      bossesCleared: 0, relicRanks: {}, theme: 'abyssal', autoDescend: false,
      autoLeaveOnDeath: false, modifier: 'balanced',
    },
    lootFilter: {
      autoSellJunk: false, autoSellNormalGear: false, autoSellBlueMagicGear: false,
      autoSellRareGear: false, autoSellEpicGear: false, autoSellLegendaryGear: false,
      autoSellMythicGear: false, autoSellRunewordGear: false, protectRarePlus: true,
      autoEquipEmptySlots: false, autoEquipUpgradedEquipment: false,
      autoVendorOverflow: false, autoSellDisplacedGear: false, autoEquipBeforeAutoSell: false,
    },
    lootFilterPreset: 'balanced',
    hardcore: Boolean(input.hardcore),
    stats: {
      kills: 0, namedKills: 0, eliteKills: 0, bossKills: 0, deaths: 0,
      goldEarned: 0, xpEarned: 0, dailiesClaimed: 0, loginDays: 0, weeklyTiersClaimed: 0,
    },
    achievements: {},
    activeTitle: '',
    unlockedTitles: [],
    dailyQuests: [],
    dailyReset: 0,
    bossCooldowns: {},
    logFilters: { dmg: true, loot: true, info: true },
    lastSaved: now,
  }
}
