# 凡修录 P1 回合制战斗与五行构筑实施计划

> 依据：`凡修录_P1_回合制战斗与五行构筑.md`。
>
> 状态：已按 P1 边界完成实现并通过全量门禁。

## 1. 不可越界原则

- `legacy/fanxiulu-monolith.html` 永久冻结；legacy 角色继续使用旧规则，v2 角色只使用新规则，两套公式不得混用。
- 保留 P0 的登录卡、角色库舞台、暗绿/金色三栏、战斗场景、角色/妖兽画面、六槽装备和装备比较；P1 不换皮、不重做交互结构。
- P1 只实现 1v1、身法先攻、每轮各一次行动、普通攻击、三个功法位、调息、遁走、五行、抗性、灵根亲和、状态和统一策略状态机。
- 不实现多人、行动条、一轮多动、第四功法位、元素反应、境界突破、经验曲线调整、天赋树、洞府、炼丹、PvP 或正式 CloudBase 接入。

## 2. 固定调用链

```text
Vue 旧式界面
  → Pinia action
  → V2 Application Service
  → ruleset v2 / BattleStateMachine
  → BattleState + BattleEvent
  → Pinia 保存角色快照
  → Vue 依据事件渲染日志与标记
```

Pinia 不包含伤害、先攻、亲和、抗性、冷却或状态持续公式；Vue 不直接修改 `BattleState`。

## 3. 实施阶段

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| P1-0 | 审计 P0 架构、冻结 legacy、建立 `ruleset` 存档字段 | 完成 |
| P1-1 | 五行、亲和、抗性、先攻、功法、状态与伤害分解纯规则 | 完成 |
| P1-2 | 1v1 `BattleStateMachine`、命令、事件、固定 seed 与四种策略 | 完成 |
| P1-3 | 4 传承、5 灵根、5 区域、22 敌人、12 功法、29 装备内容子集 | 完成 |
| P1-4 | `V2BattleApplication`、`V2EquipmentApplication`、存档与角色隔离 | 完成 |
| P1-5 | 在旧 UI/交互骨架内接入战斗、三功法、属性、区域和装备信息 | 完成 |
| P1-6 | 单元、回放、Application、Pinia、legacy 回归与 E2E 验收 | 完成 |

## 4. P1 战斗流程

```text
INITIALIZING
→ ROUND_START
→ BUILD_TURN_ORDER
→ WAITING_FOR_COMMAND
→ RESOLVING_ACTION
→ APPLYING_EFFECTS
→ CHECKING_RESULT
→ ROUND_END
→ 下一轮

胜利 / 失败 / 遁走
→ SETTLEMENT
→ COMPLETED
```

每轮重新读取当前身法；同身法用固定 seed 决定。眩晕与冻结跳过行动，降低身法会影响下一轮排序，任一单位死亡后立即停止本轮后续行动。

## 5. 最终验收门槛

- 新旧角色按 `ruleset` 完全分流。
- 三功法限制、战斗中锁定、法力、冷却、目标验证生效。
- 五行、抗性、灵根亲和和完整伤害分解可见。
- 手动与自动战斗共用同一状态机；固定 seed 可完整复现。
- v2 只启用五个区域、五个精英和两个区域首领。
- v2 不运行旧挂机、离线收益、符纹、套装与长期成长加成。
- legacy 基线哈希、旧存档往返和旧 UI 核心流程不回归。

## 6. P1 结束后的后续顺序

P2 或后续玩法应先基于 v2 规则集扩展属性相克、回合流程、灵根/天赋成长和修行玩法；最终皮肤与交互统一设计仍单独进行。CloudBase 等规则和存档结构稳定后再接入。
