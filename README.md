# 凡修录

《凡修录》的 Vue 3、TypeScript、Vite 与 Pinia 原生功能等价迁移及版本化玩法项目。

P0 已完成：默认 `/` 进入无 iframe 的 Vue 原生等价壳。P1 已实现 `ruleset v2` 的 1v1 身法先攻回合制、三个出战功法位、五行、抗性、灵根亲和、状态机和自动策略。P2 已把 v2 接入 31 种标准灵根组合、功法学习限制、天赋、境界、成长策略、奖励掉落、自动历练、8 小时离线收益、20 层秘境、洞府参悟、简化炼丹、云存档、异步 PvP 和三类排行榜。legacy 角色继续运行独立旧规则；废弃灵根 ID 的旧 v2 槽位不兼容。

P0-P2 人工验收审计仍有两项 P2 门禁：历练目标尚未改变实际策略、护脉丹层数尚未接入突破流程。v2 已开放旧版全部历练区域、怪物和装备，并统一进入数值配置与奖励白名单。具体配置和验收步骤见 [P0-P2 游戏配置与人工验收指南](P0_P2_MANUAL_ACCEPTANCE_GUIDE.md)。

原生界面严格以 GitHub 基线提交 `07919d3` 的旧 UI 与交互为准，保留旧式登录卡、角色库舞台、暗绿/金色面板、顶部工具条、桌面左角色栏—中内容区—右挂机栏、战斗场景、角色画面、妖兽旧图标、六槽装备和装备比较。当前不新增妖兽 SVG，后续使用产品提供的 PNG 替换。P0 不承担换皮或交互重做，最终皮肤将在玩法定稿后单独设计。

CloudBase 已完成 P2 客户端仓储、权威服务源码、六集合、索引、安全规则和构建准备。仓库未保存真实环境 ID 或凭据，因此默认本地构建明确显示未配置云环境；真实部署、账号提供商绑定和跨设备联调仍需在目标 CloudBase 环境完成。

## 运行入口

| 入口 | 用途 |
| --- | --- |
| `/` | 默认 Vue 原生壳；按角色 `ruleset` 运行 legacy 或 v2 |
| `/?mode=equivalent` | 显式打开原生等价壳 |
| `/?mode=legacy` | 冻结旧版回归与旧档查看 |
| `/?mode=v2` | 直接打开可创建/运行 P2 角色的原生壳 |
| `/?native=1` | 旧链接兼容，映射到 equivalent |

## 本地运行

```bash
npm install
npm run dev
```

默认开发地址为 `http://127.0.0.1:5173/`。

## 质量检查

```bash
npm run data:verify
npm run typecheck
npm run test
npm run build
npm run cloudbase:build
node scripts/verify-baseline.mjs
npm run test:e2e
```

`npm run verify` 执行静态数据、类型、单元/回归、生产构建、CloudBase 隔离构建和冻结基线检查；`npm run verify:full` 额外执行桌面与移动端 E2E。

## P0/P1/P2 边界

- `legacy/fanxiulu-monolith.html` 已冻结；不得新增玩法或改动 UI，冻结 SHA-256 由基线脚本校验。
- P1 已实现回合制、身法先攻、五行相克、抗性、灵根亲和和三功法限制；P2 使用五/四/三/双/天灵根共 31 种组合，灵根决定可学功法范围和修炼速度，功法属性决定战斗克制，并新增轻量天赋、境界/突破、成长策略、奖励与挂机闭环、单秘境、洞府和简化炼丹，但不做天赋树或多人战斗。
- 规则调用链固定为 Vue → Pinia action → Application Service → `game-core`/旧规则适配器 → 新状态与事件 → Pinia 保存 → Vue 渲染。
- Pinia 不保存伤害、会心、闪避、掉落、装备合成、升级、敌人生成或离线模拟公式，也不直接使用 `Math.random()`。
- 赌场、聊天、宗门、Discord、管理员和 LFG 在默认原生入口冻结隐藏；v2 不读取悟道、重修/飞升、符纹、同行、灵兽、套装和旧挂机长期加成。
- 玩家可见内容使用简体中文；内部字段和冻结存档兼容键可以继续使用英文。
- CloudBase 代码已实现服务器权威挂机、突破、装备/功法校验和异步 PvP；真实环境部署与联调未在仓库内执行。

## 文档

- [v2 全局数值配置与战后恢复建议](V2_GAME_BALANCE_CONFIGURATION.md)
- [P0-P2 游戏配置与人工验收指南](P0_P2_MANUAL_ACCEPTANCE_GUIDE.md)
- [P0 实施计划](P0_IMPLEMENTATION_PLAN.md)
- [P0 功能矩阵](P0_FEATURE_MATRIX.md)
- [P0 冻结功能](P0_FROZEN_FEATURES.md)
- [P0 已知差异](P0_KNOWN_DIFFERENCES.md)
- [P1 实施计划](P1_IMPLEMENTATION_PLAN.md)
- [P1 功能矩阵](P1_FEATURE_MATRIX.md)
- [P1 冻结功能](P1_FROZEN_FEATURES.md)
- [P1 已知差异](P1_KNOWN_DIFFERENCES.md)
- [P2 实施计划](P2_IMPLEMENTATION_PLAN.md)
- [P2 功能矩阵](P2_FEATURE_MATRIX.md)
- [P2 冻结功能](P2_FROZEN_FEATURES.md)
- [P2 数值报告](P2_BALANCE_REPORT.md)
- [P2 发布清单](P2_RELEASE_CHECKLIST.md)
- [P2 已知差异](P2_KNOWN_DIFFERENCES.md)
- [完整游戏机制目录](GAME_MECHANICS_CATALOG.md)
- [玩法调整指南](GAMEPLAY_CHANGE_GUIDE.md)
- [重构日志](REFACTORING_LOG.md)

继续开发后续玩法前必须维持 P0/P1/P2 全部门禁；最终 UI/皮肤阶段开始前，还需通过 [非 UI 准备度](NON_UI_READINESS.md)。
