# P2 实施计划与完成记录

依据：`凡修录_P2_成长闭环联网与洞府炼丹.md`。

## 边界

- 保留 P0 旧 UI 风格、主布局、战斗场景、角色画面、妖兽旧图标、六槽装备和装备比较；当前不新增妖兽 SVG，等待后续 PNG 素材。
- 不修改 `legacy/fanxiulu-monolith.html`，legacy 与 v2 公式继续隔离。
- P2 只开放一名修士、六件装备、三门功法、五行构筑、自动历练、离线收益、单秘境、洞府参悟、四种丹药、公开快照、异步斗法和三类排行榜。
- 悟道、转世、飞升、符纹、禁制、赌场、队伍、多目标、护道者、灵兽、旧炼丹、实时 PvP、公会和社交继续冻结。

## 实施阶段

| 阶段 | 内容 | 状态 | 主要落点 |
| --- | --- | --- | --- |
| P2-1 | 31 种标准灵根组合、功法学习限制、天赋、境界、突破、成长策略和旧等级迁移 | 完成 | `src/game-core/domain/progression/` |
| P2-2 | 战斗奖励、掉落、图鉴、任务、背包容量 | 完成 | `reward.rules.ts`、`loot.tables.ts` |
| P2-3 | 自动历练、补给阈值、短/长离线、8 小时上限 | 完成 | `auto-battle.ts`、`offline-simulator.ts` |
| P2-4 | 20 层幽竹秘境、检查点、首次奖励、自动深入 | 完成 | `dungeon.rules.ts` |
| P2-5 | 单功法洞府参悟、四级熟练度 | 完成 | `cave-training.ts`、`technique-mastery.ts` |
| P2-6 | `AlchemyV2` 五灵草、四丹药、单队列五次 | 完成 | `alchemy.rules.ts` |
| P2-7 | Application Service 与 Pinia 接入 | 完成 | `src/application/v2/`、P2 stores |
| P2-8 | 旧页面原位置控件 | 完成 | 角色栏、挂机栏、区域、功法、背包、设置页 |
| P2-9 | 云端权威校验、六集合、异步 PvP、排行榜 | 完成代码 | `src/services/cloudbase/`、`cloudbase/` |
| P2-10 | 单元、安全、构建、冻结哈希和 E2E 回归 | 完成 | `tests/unit/p2-*`、`tests/e2e/` |

## 固定调用链

```text
Vue 旧界面原位控件
→ Pinia action
→ Application Service
→ progression / ruleset v2
→ BattleState / BattleEvent / RewardResult
→ Pinia 保存
→ Vue 渲染
```

云端调用固定为：

```text
Vue 设置页
→ cloud.store
→ GameCloudRepository
→ CloudBase 云函数
→ 服务端校验与 ruleset v2
→ 六个服务端集合
```

## 发布说明

新 v2 角色只以 `rootId` 作为灵根真值。使用废弃灵根 ID 的旧 v2 槽位不兼容，载入时先创建本地备份再过滤；legacy 角色继续在独立规则集中运行。代码、规则、构建和本地服务端模拟已经完成。仓库不包含 CloudBase 环境 ID 或凭据，因此未执行真实环境部署；部署和跨设备联调必须按 `P2_RELEASE_CHECKLIST.md` 的上线项单独完成。
