# 游戏机制调整指南

当前项目已把旧玩法的主要公式、命令和结算主路径抽成可测试纯函数，但默认玩家运行时仍由冻结单体承载，因此这是“兼容迁移基座”，还不是新游戏的最终模块化架构。后续新增机制应以 `src/game-core` 为唯一规则入口；冻结基线 `legacy/fanxiulu-monolith.html` 禁止直接修改，并必须在原生运行时接管后退出正式运行链路。

## 当前真实边界

- 已完成的基础：随机数、存档适配、装备、功法、单人/队伍战斗、挂机与离线结算已有脱离 DOM 的纯模块和固定输入回归。
- 尚未完成的运行时替换：默认 `/` 仍由 `LegacyGameFrame.vue` 加载生成自冻结单体的完整游戏；修改纯核心不会自动改变这条旧运行链路里的实际玩法。
- 尚未完成的领域模型：原生角色仍以宽泛旧档对象为主，多个系统使用 `Record<string, any>`；这适合兼容导入，不适合承载属性相克、天赋成长和版本化新修行体系。
- 尚未完成的战斗模型：当前原生战斗仍是“角色攻击后妖物反击”的固定过程，没有回合阶段、行动队列、身法先攻、伤害属性和效果触发管线。
- 尚未完成的可编辑规则层：大部分职业、区域、装备和功法定义仍来自冻结单体生成文件；新游戏数据必须迁入版本化、可手工维护的规则目录。
- 原生 Vue 界面只是实验功能壳，尚未保真覆盖旧版场景、角色/妖物画面、六槽纸娃娃、装备比较和全部玩法面板，不能直接替换默认入口。

结论：可以在纯核心中安全试验新规则，但在完成下述原生化阶段前，不能认为已经彻底摆脱旧 HTML，也不能直接删除冻结单体。

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

## 下一阶段：面向新玩法的彻底模块化

按以下顺序执行，期间默认旧版只承担可玩的兼容入口，不再向其中添加新机制：

1. **建立强类型中文领域模型与规则集**：新增角色、六维、灵根、天赋、元素、功法、效果、敌人和修行状态类型；旧英文存档只通过适配器导入导出。建立 `rulesets/v2` 可编辑规则目录，停止让新机制直接读取冻结生成数据。
2. **建立回合制战斗状态机**：以 `BattleState`、`Combatant`、`Action`、`Effect`、`BattleEvent` 和纯命令为边界，明确开战、计算先攻、选择行动、结算效果、回合结束、胜负与奖励阶段。身法决定行动顺序，同值再由可注入随机源裁决。
3. **接入属性相克与效果管线**：相克表、伤害属性、抗性、功法属性和灵根亲和度作为版本化规则注入战斗引擎，不写死在 Vue、Store 或具体技能函数中；单人、队伍、挂机与离线结算共用同一结算内核。
4. **重建天赋、灵根成长和修行系统**：将基础成长、每级成长、境界突破、天赋修正、灵根修正和修行产出拆成独立策略；新增字段提升原生存档 schema，并提供旧档迁移和规则版本迁移。
5. **收紧应用层与状态层**：Pinia 只保存界面状态并派发用例命令，不再编排伤害公式或直接修改宽泛角色对象；统一保存、战报、回放、挂机和在线战斗事件。
6. **完成原生功能等价壳**：在不定最终皮肤的前提下，先让 Vue 原生运行时完整承载战斗场景、角色/妖物、装备比较、背包、功法、队伍和修行入口；功能等价后再统一设计战斗 UI、主画面和删减功能。
7. **切换默认运行时**：默认 `/` 不再创建 `LegacyGameFrame`，Vite 不再把冻结单体生成物作为玩家运行资产；旧 HTML 仅保留为回归夹具和存档对照，最后再清理不再需要的兼容代码。

彻底模块化的验收条件：

- 新玩法规则不导入 Vue、Pinia、DOM、浏览器存储、云 SDK 或冻结 HTML。
- 默认入口不加载 iframe 或 `fanxiulu-monolith.html`。
- 新角色状态有明确类型和 schema，不再以 `Record<string, any>` 作为正式领域模型。
- 在线战斗、挂机和离线结算共享版本化战斗/成长规则；固定随机种子可完整回放。
- 属性相克、身法先攻、天赋/灵根成长和新修行玩法均可通过修改规则表与纯策略扩展，不需要编辑 UI 组件。
- 完成存档迁移、桌面/移动 E2E 和旧档导入回归后，才移除旧运行时开关。

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
