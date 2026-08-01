import type { LegacySlots } from '../../save'
import {
  applyLegacySharedPartyExperience,
  buildLegacyPartyCombatants,
} from '../combat'
import {
  simulateLegacyAfkReturn,
  type LegacyAfkOptions,
  type LegacyAfkResult,
} from './legacy-afk-simulator'

export interface LegacyPartyAfkMemberAward {
  slot: number
  xp: number
  levelsGained: number
}

export interface LegacyPartyAfkResult extends LegacyAfkResult {
  slots: LegacySlots
  partySize: number
  localMemberAwards: LegacyPartyAfkMemberAward[]
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function simulateLegacyPartyAfkReturn(
  sourceSlots: readonly (Record<string, any> | null)[],
  activeSlot: number,
  options: LegacyAfkOptions,
): LegacyPartyAfkResult {
  const slots = clone(sourceSlots) as LegacySlots
  const slot = Math.floor(Number(activeSlot))
  const source = slot >= 0 && slot < slots.length ? slots[slot] : null
  if (!source) throw new RangeError('离线队伍结算缺少有效的当前角色槽位')

  const party = buildLegacyPartyCombatants({
    character: source,
    slots,
    activeSlot: slot,
  })
  const partySize = Math.max(1, party.units.length)
  const result = simulateLegacyAfkReturn(source, {
    ...options,
    modifiers: {
      ...(options.modifiers || {}),
      groupSize: partySize,
      groupShareSize: partySize,
    },
  })
  slots[slot] = result.character
  const localMemberAwards: LegacyPartyAfkMemberAward[] = []
  if (result.summary.applied && result.summary.xp > 0) {
    for (const memberSlot of party.localGroupSlots) {
      const member = slots[memberSlot]
      if (!member) continue
      const applied = applyLegacySharedPartyExperience(member, result.summary.xp)
      slots[memberSlot] = applied.character
      localMemberAwards.push({
        slot: memberSlot,
        xp: result.summary.xp,
        levelsGained: applied.levelsGained,
      })
    }
  }

  return {
    ...result,
    character: slots[slot]!,
    slots,
    partySize,
    localMemberAwards,
  }
}
