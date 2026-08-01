import { AFK_ZH_CN } from './afk'
import { ABOUT_ZH_CN } from './about'
import { CASINO_ZH_CN } from './casino'
import { CHARACTERS_ZH_CN } from './characters'
import { COMBAT_ZH_CN } from './combat'
import { COMMON_ZH_CN } from './common'
import { CREATION_ZH_CN } from './creation'
import { DUNGEON_ZH_CN } from './dungeon'
import { ERRORS_ZH_CN } from './errors'
import { INTERFACE_ZH_CN } from './interface'
import { INVENTORY_ZH_CN } from './inventory'
import { ITEMS_ZH_CN } from './items'
import { SKILLS_ZH_CN } from './skills'
import { SOCIAL_ZH_CN } from './social'
import { SETTINGS_ZH_CN } from './settings'
import { WORLD_ZH_CN } from './world'

export * from './afk'
export * from './about'
export * from './casino'
export * from './characters'
export * from './combat'
export * from './common'
export * from './creation'
export * from './dungeon'
export * from './errors'
export * from './interface'
export * from './inventory'
export * from './items'
export * from './skills'
export * from './social'
export * from './settings'
export * from './world'

/**
 * 参考文档中的权威术语层。它的优先级高于历史生成映射和扩展内容命名，
 * 但仍然只用于显示，不能写回任何规则或存档字段。
 */
export const ZH_CN_REFERENCE_TEXT: Readonly<Record<string, string>> = Object.freeze({
  ...COMMON_ZH_CN,
  ...CHARACTERS_ZH_CN,
  ...SKILLS_ZH_CN,
  ...ITEMS_ZH_CN,
  ...WORLD_ZH_CN,
  ...ERRORS_ZH_CN,
  ...CREATION_ZH_CN,
  ...COMBAT_ZH_CN,
  ...DUNGEON_ZH_CN,
  ...AFK_ZH_CN,
  ...ABOUT_ZH_CN,
  ...CASINO_ZH_CN,
  ...INTERFACE_ZH_CN,
  ...INVENTORY_ZH_CN,
  ...SOCIAL_ZH_CN,
  ...SETTINGS_ZH_CN,
})
