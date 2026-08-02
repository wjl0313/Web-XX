# 凡修录 P0 原生功能等价实施计划

> 依据：`凡修录_P0_原生功能等价壳与冻结基线.md`。
>
> 目标：保持旧规则、旧数值和旧存档语义不变，将核心玩家流程迁移到 Vue 原生壳；P0 结束后默认入口不再依赖旧版 iframe。

## 1. 执行原则

- 冻结 `legacy/fanxiulu-monolith.html`，不得向其中新增玩法。
- P0 不实现回合制、身法先攻、五行相克、灵根亲和、境界突破或三功法限制。
- UI 只做功能等价与可用性，不在 P0 统一换皮或重构旧交互设计。
- Vue 组件只负责展示和输入；Pinia 只负责状态；规则必须由 Application Service 调用 `game-core`。
- 每个阶段独立通过类型检查、单元测试、构建和对应 E2E 后再推进。
- CloudBase 权威结算继续延期，直到玩法和存档结构定稿。

## 2. 运行模式

| 入口 | P0 期间职责 | P0 结束状态 |
| --- | --- | --- |
| `/` | 暂时保持冻结旧版，避免半成品接管玩家 | 切换为 `equivalent` |
| `/?mode=legacy` | 冻结旧版回归、旧存档查看 | 永久保留 |
| `/?mode=equivalent` | Vue 原生等价壳 + 旧规则 | 成为默认入口 |
| `/?mode=v2` | 新规则开发占位 | P1 才开始接入新玩法 |
| `/?native=1` | 旧实验链接兼容 | 映射到 `equivalent` |

## 3. 分阶段实施

### P0-0：冻结基线与验收材料

交付：

- `legacy/baseline-version.json`
- `legacy/baseline-behavior-report.md`
- `legacy/baseline-save-samples/`
- `legacy/baseline-screenshots/`
- `P0_FEATURE_MATRIX.md`
- `P0_FROZEN_FEATURES.md`
- `P0_KNOWN_DIFFERENCES.md`

完成标准：冻结 HTML、静态数据、版本、schema 和提交锚点可自动校验；四类代表存档与桌面/移动截图齐全。

### P0-1：原生应用壳与入口

工作项：

- 建立 `LoginLayout`、`CharacterSelectLayout`、`GameLayout`。
- 建立 `LoginView`、`CharacterLibraryView`、`GameView`。
- 支持加载、空状态、错误状态、Toast、确认弹窗和移动端底部导航。
- 完成三模式解析与旧 `native=1` 兼容。

完成标准：三种入口互不串用；`equivalent` 不创建 iframe；损坏存档可进入错误恢复页。

### P0-2：Application Service 边界

新增应用服务：

```text
src/application/legacy/
├── LegacyBattleApplication.ts
├── LegacyAfkApplication.ts
├── LegacyProgressionApplication.ts
└── LegacyEquipmentApplication.ts
```

调用链固定为：

```text
Vue -> Pinia action -> Application Service -> game-core -> 新状态与事件 -> Pinia -> Vue
```

完成标准：Pinia 不包含伤害、闪避、会心、掉落、升级、装备合成、敌人生成或离线模拟公式，也不直接调用 `Math.random()`。

### P0-3：角色与存档等价

工作项：

- 登录/本地进入。
- 24 槽角色库、创建、选择、进入和删除确认。
- 四步创建：灵根/体质、传承、外观、道号与生死道。
- 旧存档导入、新壳读取、普通/加密/单角色导出、自动备份、导入预览、冲突提示。
- 损坏存档隔离，不能阻断应用启动。

完成标准：代表存档全部载入；新壳写回后旧版仍能读取；未知旧字段不丢失。

### P0-4：核心页面功能等价

按依赖顺序完成：

1. 角色状态与六维。
2. 修炼地、绑定区、猎杀目标和首领入口。
3. 战斗、旧功法、疗伤、调息、遁走、精英、命名强敌和首领。
4. 六槽装备、背包分页、容量、搜索、排序、筛选、对比、锁定、收藏、出售和自动装备。
5. 功法学习、记忆、取消记忆、冷却和自动施放。
6. 挂机目标、补给、优先队列、行动间隔和方案。
7. 离线收益领取与继续。

完成标准：文档规定的核心 Playwright 流程一次通过，在线与离线使用同一套旧规则服务。

### P0-5：冻结外围与只读兼容

- 默认原生导航隐藏赌场、Discord、管理员、聊天、宗门和 LFG。
- 悟道、重修/飞升、符纹、禁制套装、护道者、同行、灵兽、旧炼丹、神龛和套装收藏只读展示。
- 不启动冻结功能的轮询、实时订阅、计时器或资源消耗。
- 所有旧字段原样保留，`legacy` 模式仍可完整查看。

完成标准：冻结功能不会在后台推进统计或消耗资源。

### P0-6：默认入口切换与验收

- 将 `DEFAULT_RUNTIME_MODE` 从 `legacy` 改为 `equivalent`。
- 保留 `/?mode=legacy` 回归入口。
- 执行单元、回归、桌面/移动 E2E、中文扫描和截图对比。
- 更新功能矩阵、差异报告、维护日志和非 UI 门禁。

只有 [P0_FEATURE_MATRIX.md](P0_FEATURE_MATRIX.md) 中的 P0 必须项全部通过，才允许进入 P1。

## 4. 当前实施状态

| 阶段 | 状态 |
| --- | --- |
| P0-0 冻结基线 | 完成：版本、哈希、四类存档、行为报告和 13 张截图齐全 |
| P0-1 原生应用壳 | 完成：登录、角色库、四步创建、桌面三栏、移动底栏、弹窗/Toast/状态页齐全 |
| P0-2 Application Service | 完成：四个旧规则应用服务和架构门禁已建立 |
| P0-3 角色与存档等价 | 完成：旧档读取、导入导出、备份、预览、冲突和损坏隔离已验收 |
| P0-4 核心页面等价 | 完成：区域、战斗、六槽装备、背包比较、功法、挂机和离线流程已验收 |
| P0-5 冻结外围 | 完成：默认原生入口隐藏/只读且无后台副作用 |
| P0-6 默认切换 | 完成：默认 `/` 已切换 equivalent，legacy/v2 入口保留 |

## 5. P0 收口结论

- P0 已完成，当前默认运行时不依赖冻结 iframe。
- UI/交互基准锁定为 GitHub 提交 `07919d3` 中的冻结旧版；P0 不允许再次引入独立换皮、纯文字战斗或新的装备展示结构。
- 原生实现保留冻结版暗绿/金色风格、角色库舞台、桌面左—中—右三栏、战斗场景、六槽装备和装备比较交互。
- P1 尚未开始，本文档列出的禁止事项继续有效。
- CloudBase 继续延期到玩法和存档结构定稿之后。
