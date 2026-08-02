import { describe, expect, it } from 'vitest'

import {
  V2_CLASS_TECHNIQUES,
  V2_ENABLED_BOSS_IDS,
  V2_ENABLED_CLASS_IDS,
  V2_ENABLED_ELITE_IDS,
  V2_ENABLED_EQUIPMENT_IDS,
  V2_ENABLED_MOB_IDS,
  V2_ENABLED_ROOT_IDS,
  V2_ENABLED_TECHNIQUE_IDS,
  V2_ENABLED_ZONE_INDEXES,
  V2_ENEMIES,
  V2_ROOT_PROFILES,
  V2_TECHNIQUES,
  V2_ZONES,
  getV2CharacterTechniqueIds,
  normalizeTechniqueLoadout,
  validateTechniqueLoadout,
} from '../../src/game-core/rulesets/v2'
import {
  createNativeCharacter,
  importLegacyCharacterIdentity,
  importLegacySlotsToNative,
} from '../../src/game-core/save'

describe('P1 内容子集', () => {
  it('只启用 4 传承、31 种标准灵根、5 区域、15 普通妖兽、5 精英和 2 首领', () => {
    expect(V2_ENABLED_CLASS_IDS).toHaveLength(4)
    expect(V2_ENABLED_ROOT_IDS).toHaveLength(31)
    expect(V2_ENABLED_ZONE_INDEXES).toEqual([0, 1, 2, 3, 4])
    expect(V2_ZONES).toHaveLength(5)
    expect(V2_ENABLED_MOB_IDS).toHaveLength(15)
    expect(V2_ENABLED_ELITE_IDS).toHaveLength(5)
    expect(V2_ENABLED_BOSS_IDS).toHaveLength(2)
    expect(Object.values(V2_ENEMIES).filter((enemy) => enemy.rank === 'normal')).toHaveLength(15)
    expect(Object.values(V2_ENEMIES).filter((enemy) => enemy.rank === 'elite')).toHaveLength(5)
    expect(Object.values(V2_ENEMIES).filter((enemy) => enemy.rank === 'boss')).toHaveLength(2)
    expect(V2_ZONES.filter((zone) => zone.bossId)).toHaveLength(2)
  })

  it('锁定 12 门功法与 3/2/2/2/2/1 属性分布', () => {
    expect(V2_ENABLED_TECHNIQUE_IDS).toHaveLength(12)
    const counts = Object.values(V2_TECHNIQUES).reduce<Record<string, number>>((result, technique) => {
      result[technique.element] = (result[technique.element] || 0) + 1
      return result
    }, {})
    expect(counts).toMatchObject({ neutral: 3, metal: 2, wood: 2, water: 2, fire: 2, earth: 1 })
    expect(Object.values(V2_CLASS_TECHNIQUES).every((ids) => ids.length === 3)).toBe(true)
  })

  it('P1 装备白名单保持在 20～30 件范围', () => {
    expect(V2_ENABLED_EQUIPMENT_IDS.length).toBeGreaterThanOrEqual(20)
    expect(V2_ENABLED_EQUIPMENT_IDS.length).toBeLessThanOrEqual(30)
    expect(new Set(V2_ENABLED_EQUIPMENT_IDS).size).toBe(V2_ENABLED_EQUIPMENT_IDS.length)
  })

  it('灵根亲和与抗性配置覆盖全部标准灵根', () => {
    expect(Object.keys(V2_ROOT_PROFILES).sort()).toEqual([...V2_ENABLED_ROOT_IDS].sort())
    for (const root of Object.values(V2_ROOT_PROFILES)) {
      expect(Object.values(root.affinities).every((value) => Number(value) >= 0 && Number(value) <= 100)).toBe(true)
    }
  })
})

describe('P1 三功法构筑与存档隔离', () => {
  it('固定三个槽位，拒绝未知功法与重复功法', () => {
    const known = ['a', 'b', 'c', 'd']
    expect(normalizeTechniqueLoadout({ slots: ['a', 'b', 'c', 'd'] }, known)).toEqual({ slots: ['a', 'b', 'c'] })
    expect(validateTechniqueLoadout({ slots: ['a', 'a', null] }, known)).toEqual({
      valid: false, reason: 'duplicate-technique',
    })
    expect(validateTechniqueLoadout({ slots: ['a', 'missing', null] }, known)).toEqual({
      valid: false, reason: 'unknown-technique',
    })
    expect(validateTechniqueLoadout({ slots: ['a', 'b', 'c'] }, known)).toEqual({ valid: true })
  })

  it('旧角色缺少规则字段时导入 legacy，不被静默迁移到 v2', () => {
    const imported = importLegacyCharacterIdentity({
      name: '旧修士', level: 8, race: 'Human', cls: 'Warrior',
    })
    expect(imported).toMatchObject({ ruleset: 'legacy', race: '五行杂灵根', cls: '炼体士' })
  })

  it('载入角色槽时移除使用废弃灵根 ID 的旧规则角色', () => {
    const slots = importLegacySlotsToNative([
      { name: '旧规则角色', ruleset: 'v2', v2Progression: { rootId: '金灵根' } },
      { name: '当前规则角色', ruleset: 'v2', v2Progression: { rootId: '金天灵根' } },
    ])
    expect(slots[0]).toBeNull()
    expect(slots[1]).toMatchObject({ name: '当前规则角色', ruleset: 'v2' })
  })

  it('新建 v2 角色写入规则、内容版本和三功法字段，并关闭生死劫', () => {
    const character = createNativeCharacter({
      name: '青岚', race: '金天灵根', classId: '五行法修', ruleset: 'v2', rootId: '金天灵根', hardcore: true,
    })
    expect(character).toMatchObject({
      ruleset: 'v2',
      v2ContentVersion: 2,
      v2KnownTechniques: ['gengjin_sword_art', 'mountain_breaking_fist', 'golden_bell_guard'],
      v2TechniqueLoadout: { slots: ['gengjin_sword_art', 'mountain_breaking_fist', 'golden_bell_guard'] },
      v2AutoTechniqueSlots: [true, true, true],
      hardcore: false,
      zone: 0,
    })
  })

  it('已获得功法可跨初始传承保留，但必须属于 P1 的 12 门功法', () => {
    const character = createNativeCharacter({
      name: '青岚', race: '木天灵根', classId: '丹医', ruleset: 'v2', rootId: '木天灵根',
    })
    character.v2KnownTechniques = [
      ...(character.v2KnownTechniques as string[]),
      'thorn_decay',
      'scarlet_flame_art',
      'not-a-p1-technique',
    ]
    expect(getV2CharacterTechniqueIds(character)).toEqual([
      'verdant_rejuvenation',
      'mountain_breaking_fist',
      'golden_bell_guard',
      'thorn_decay',
    ])
  })

  it('创建入口拒绝范围外的灵根与传承', () => {
    expect(() => createNativeCharacter({
      name: '越界灵根', race: '精灵', classId: '炼体士', ruleset: 'v2', rootId: '精灵',
    })).toThrow('请选择有效的灵根资质')
    expect(() => createNativeCharacter({
      name: '越界传承', race: '五行伪灵根', classId: '圣骑士', ruleset: 'v2', rootId: '五行伪灵根',
    })).toThrow('当前仅开放炼体士、丹医、五行法修与影修')
  })
})
