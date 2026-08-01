# 游戏机制调整指南

当前项目已经把主要玩法规则从页面与 DOM 中分离出来。后续调整机制时，以 `src/game-core` 为唯一修改入口；冻结基线 `legacy/fanxiulu-monolith.html` 只用于对照，禁止直接修改。

## 修改入口

| 机制 | 主要文件 | 必须补充或更新的测试 |
| --- | --- | --- |
| 角色创建、升级、AA 分流 | `src/game-core/save/legacy-character.factory.ts`、`src/game-core/systems/progression/legacy-progression.ts` | `legacy-character.migration.test.ts`、`legacy-progression.test.ts` |
| 装备属性、品质与词缀 | `src/game-core/systems/equipment/item-stats.ts`、`item-variant.ts` | `legacy-item-stats.test.ts`、`legacy-item-normalizer.test.ts` |
| 穿脱、自动换装、打孔、符文与重铸 | `legacy-equipment.commands.ts`、`legacy-equipment-customization.ts` | `legacy-equipment.commands.test.ts`、`legacy-equipment-customization.test.ts` |
| 背包容量与容器替换 | `legacy-container.commands.ts` | `legacy-container.commands.test.ts` |
| 功法购买、记忆、消耗、自动施法与效果 | `src/game-core/systems/spells` | `legacy-spell.commands.test.ts`、`legacy-spell-engine.test.ts`、`legacy-spell.autocast.test.ts` |
| 单人攻击、怪物反击与奖励 | `legacy-combat.formulas.ts`、`legacy-combat.resolution.ts` | 对应的 formulas/resolution 测试 |
| 状态、武器触发、吸血与命名怪机制 | `legacy-combat-effects.ts` | `legacy-combat-effects.test.ts` |
| 区域首领、冷却、额外掉落与敌方回合顺序 | `legacy-boss.ts`、`legacy-named-mechanic.turn.ts` | `legacy-boss.test.ts`、`legacy-named-mechanic.turn.test.ts` |
| 结构化战报导出、恢复与汇总 | `legacy-combat.journal.ts` | `legacy-combat.journal.test.ts`、`native-domain-stores.test.ts` |
| 队伍、佣兵、宠物与怪物包 | `legacy-party-combat.ts`、`legacy-companion-combat.ts`、`legacy-mob-pack.ts` | `legacy-party-companion-combat.test.ts`、`legacy-mob-pack.test.ts` |
| 挂机、目标规划、队伍分发与地下城离线 | `src/game-core/systems/afk` | 四个 AFK/地下城测试文件及 `native-domain-stores.test.ts` |
| 旧档迁移与字段兼容 | `src/game-core/save/legacy-character.migration.ts`、`native-save.envelope.ts`、`native-runtime.gate.ts` | `legacy-character.migration.test.ts`、`legacy-save.shadow.test.ts`、`native-save.envelope.test.ts`、`native-runtime.gate.test.ts` |

## 数据与规则的边界

- `src/game-core/data/*.generated.ts` 是从冻结旧版生成的兼容基线，不手工编辑。
- 只调整公式时，修改对应纯系统模块并增加固定输入/固定随机数测试。
- 要改变职业、装备、功法、区域等静态定义时，先建立新的可编辑规则表或版本化覆盖层，再让核心读取新规则；不要把新定义反写进冻结单体。
- 新增或删除存档字段时，在迁移器中同时提供默认值、旧值清洗和影子对比用例；不兼容变更必须提升 schema，并更新原生信封解析规则。
- 机制尚未定稿时，不修改 CloudBase 的权威结算，也不部署云函数。

## 每次调整的验收顺序

1. 为预期行为先增加或修改单元测试。
2. 修改 `game-core`，保持函数不依赖 Vue、Pinia、DOM、浏览器存储或云 SDK。
3. 涉及存档字段时，用 `compareLegacySaveShadow` 检查具体差异路径，并确认差异都是有意变更；切换入口必须继续由 `evaluateNativeRuntimeGate` 决定，不得只凭查询参数绕过。
4. 执行 `npm run verify:full`。
5. 在 `REFACTORING_LOG.md` 记录变更目的、旧行为、新行为、存档影响和测试结果。

## 恢复 CloudBase 对接前的检查点

游戏机制定稿后，再按以下顺序恢复云端工作：

1. 确认客户端和服务端共用同一套版本化规则或规则版本号。
2. 更新服务端存档校验、挂机结算、装备命令和 PvP 挑战规则。
3. 决定旧云端存档迁移策略与并发冲突处理方式。
4. 接入真实身份、环境 ID、集合权限和云函数部署。
5. 完成真实环境端到端测试后，才把状态从“源码准备完成”改为“已接入”。

## 当前冻结项

- 默认 `/` 继续运行旧版完整 UI、战斗场景、角色/怪物画面和装备对比交互。
- `/?native=1` 仍是实验入口，不作为最终玩家界面。
- 皮肤、布局和交互最后统一设计，当前机制调整不得顺带替换玩家可见结构。
