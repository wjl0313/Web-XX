import { describe, expect, it } from 'vitest'

import {
  ALL_ITEM_DATA,
  ALL_WEAPON_PROCS,
  CLASS_EPIC_CONTENT,
  CONTAINER_ITEMS,
  CULTIVATION_PHRASES,
  DUNGEON_THEMES,
  EPIC_ITEM_BY_BASE,
  FRESH_QUESTS,
  ITEM_AFFIX_POOL,
  ITEM_SETS,
  NAMED_BY_ZONE,
  NAMED_MECHANICS,
  RUNE_DATA,
  RUNEWORD_RECIPES_BY_SLOT,
  SPELLBOOK_BY_CLASS,
  ZONE_EVENTS,
  ZONES,
  ZH_CN_REFERENCE_TEXT,
  formatCultivationPhrase,
  formatCultivationText,
  translateLegacyText,
} from '../../src/game-core/data'

describe('修仙化中文显示层', () => {
  it('keeps the supplied reference terminology as the authoritative display layer', () => {
    expect(ZH_CN_REFERENCE_TEXT.Level).toBe('修为等级')
    expect(ZH_CN_REFERENCE_TEXT.Human).toBe('五行杂灵根')
    expect(ZH_CN_REFERENCE_TEXT.Warrior).toBe('炼体士')
    expect(ZH_CN_REFERENCE_TEXT.Fireball).toBe('火弹术')
    expect(ZH_CN_REFERENCE_TEXT['Main Hand']).toBe('主手法器')
    expect(ZH_CN_REFERENCE_TEXT.Legendary).toBe('古宝')
    expect(ZH_CN_REFERENCE_TEXT.Forest).toBe('灵木谷')
    expect(ZH_CN_REFERENCE_TEXT['Kill Quest']).toBe('诛妖委托')
    expect(ZH_CN_REFERENCE_TEXT['Invalid email or password.']).toBe('道籍或口令有误。')
    expect(Object.values(ZH_CN_REFERENCE_TEXT).filter((value) => /[A-Za-z]/.test(value))).toEqual([])
  })

  it('maps the reference character terminology without changing internal IDs', () => {
    expect(translateLegacyText('Human')).toBe('五行杂灵根')
    expect(translateLegacyText('Goliath')).toBe('厚土灵体')
    expect(translateLegacyText('Warrior')).toBe('炼体士')
    expect(translateLegacyText('Wizard')).toBe('五行法修')
    expect(translateLegacyText('Berserker')).toBe('血煞体修')
    expect(translateLegacyText('STR')).toBe('根骨')
    expect(translateLegacyText('CON')).toBe('体魄')
    expect(translateLegacyText('INT')).toBe('悟性')
    expect(translateLegacyText('WIS')).toBe('神识')
    expect(translateLegacyText('CHA')).toBe('机缘')
  })

  it('maps resources, slots, qualities, and functional labels', () => {
    expect(translateLegacyText('Level')).toBe('修为等级')
    expect(translateLegacyText('Mana')).toBe('法力')
    expect(translateLegacyText('Gold')).toBe('灵石')
    expect(translateLegacyText('Inventory')).toBe('储物袋')
    expect(translateLegacyText('Equipment')).toBe('随身装备')
    expect(translateLegacyText('weapon')).toBe('主手法器')
    expect(translateLegacyText('offhand')).toBe('副手法器')
    expect(translateLegacyText('Sword')).toBe('飞剑')
    expect(translateLegacyText('damage_weaken')).toBe('削弱攻伐')
    expect(translateLegacyText('Legendary')).toBe('古宝')
    expect(translateLegacyText('Runeword')).toBe('符纹造物')
    expect(translateLegacyText('Unknown display value')).toBe('Unknown display value')
  })

  it('formats parameterized wording without interpreting missing values', () => {
    expect(formatCultivationText('你在{zone}遭遇了{enemy}。', { zone: '灵木谷', enemy: '赤目妖狼' }))
      .toBe('你在灵木谷遭遇了赤目妖狼。')
    expect(formatCultivationPhrase('rewardXp', { xp: 120 })).toBe('你获得了120点修为。')
    expect(formatCultivationPhrase('spellCast', { spell: '火弹术' })).toBe('你掐诀施法，释放火弹术。')
    expect(formatCultivationText('缺少{value}。')).toBe('缺少{value}。')
    expect(CULTIVATION_PHRASES.offlineTitle).toBe('闭关所得')
  })

  it('covers every extracted phase-two content name with Chinese display text', () => {
    const sourceText = [
      ...ZONES.flatMap((zone) => [zone.name, zone.rare, ...zone.mobs]),
      ...Object.values(NAMED_BY_ZONE).flat(),
      ...NAMED_MECHANICS.map((entry) => entry.name),
      ...ZONE_EVENTS.map((entry) => entry.name),
      ...Object.values(DUNGEON_THEMES).flatMap((theme) => [theme.label, ...theme.mobs]),
      ...FRESH_QUESTS.flatMap((quest) => [quest.name, quest.mob]),
      ...Object.keys(ALL_ITEM_DATA),
      ...Object.keys(ITEM_SETS),
      ...Object.values(ALL_ITEM_DATA).map((item) => item.type),
      ...Object.values(ITEM_AFFIX_POOL).flatMap((affixes) => affixes.flatMap((affix) => [affix.prefix, affix.suffix])),
      ...Object.values(EPIC_ITEM_BY_BASE).flatMap((items) => items.map((item) => item.name)),
      ...Object.keys(CONTAINER_ITEMS),
      ...Object.values(ALL_WEAPON_PROCS).map((proc) => proc.name),
      ...Object.values(SPELLBOOK_BY_CLASS).flatMap((spells) => spells.flatMap((spell) => [spell.name, spell.kind])),
      ...Object.values(CLASS_EPIC_CONTENT).flatMap((entry) => [
        entry.questName,
        entry.target,
        entry.spell.name,
        entry.spell.kind,
      ]),
      ...Object.keys(RUNE_DATA),
      ...Object.values(RUNEWORD_RECIPES_BY_SLOT).flatMap((recipes) => recipes.map((recipe) => recipe.name)),
    ]

    const residualEnglish = [...new Set(
      sourceText
        .map((value) => translateLegacyText(value))
        .filter((value) => /[A-Za-z]{2,}/.test(value)),
    )]

    expect(residualEnglish).toEqual([])
    expect(translateLegacyText('Minor Healing Potion')).toBe('回春丹')
    expect(translateLegacyText('Legendary Mana Potion')).toBe('天元回灵丹')
    expect(translateLegacyText('Recipe Scroll')).toBe('符纹方卷')
  })
})
