# 凡修录

《凡修录：洞府问道》的 Vue 组件化保真迁移项目。当前根入口已经由 Vue 3、TypeScript、Vite 和 Pinia 接管，完整旧版游戏暂时通过兼容桥运行。

当前产品决策是先完成所有非 UI 重构，最后统一设计皮肤。默认 `/` 保持旧版结构与交互；`/?native=1` 仅为未通过等价验收的实验原型，且必须通过本地存档影子门禁后才会开启，不能作为最终界面。

CloudBase 当前只保留隔离的契约、权威服务源码、数据规则和构建准备；待游戏内部机制调整并定稿后再接入、部署和联调，避免服务端规则与本地玩法重复返工。

## 本地运行

```bash
npm install
npm run dev
```

默认开发地址为 `http://127.0.0.1:5173/`。

## 质量检查

```bash
npm run typecheck
npm run test
npm run test:coverage
npm run lint:locale
npm run build
npm run test:e2e
npm run verify:full
```

`npm run verify` 会检查 TypeScript、单元测试、生产构建、入口行数，以及冻结旧版文件的 SHA-256。`npm run verify:full` 额外执行桌面端与移动端端到端测试。

## 迁移约束

- 调整装备、功法、战斗、挂机、掉落或成长规则时，只修改版本化的纯核心入口，并同步固定随机数回归；不得把新规则反写进冻结单体。
- `legacy/fanxiulu-monolith.html` 是冻结回归基线，修改会导致校验失败。
- 新核心逻辑放入 `src/game-core`，不得依赖 DOM、Vue、Pinia 或云 SDK。
- 玩家可见文案使用简体中文，内部字段为兼容旧存档可以继续保留英文。
- 参考文档的权威术语按类别集中在 `src/game-core/locales/zh-CN/`；`src/game-core/data/localization.zh-cn.ts` 与 `localization-content.zh-cn.ts` 保留历史兼容别名和完整内容名。新核心的角色身份已改用中文正式 ID，后续机制应依赖 `src/game-core/domain/`，不要直接依赖冻结数据中的英文键。
- `npm run lint:locale` 会检查权威词表、完整静态内容名覆盖和中文运行副本生成；静态标签与完整动态句式在构建或明确显示边界直接写入，拼接式战报只转换精确片段并在最终写入时完成整句处理，兼作规则 ID 的动态名称不会写回存档。禁止覆写 DOM 原型、整页观察、延时扫描和点击后补翻译。
- 旧单体和 `EmberQuest_slots` 仍使用英文兼容 ID；`SaveStore` 会在边界把 `Human/Warrior` 等旧值一次性导入为“五行杂灵根/炼体士”，保存时再导出旧格式。新玩法内部不要自行做中英文映射。
- 原生实验入口只读生成版本化候选存档信封，并核对格式版本、载荷哈希、旧档来源哈希和 24 槽字段差异；校验失败自动保留旧版入口，不改写 `EmberQuest_slots`。
- 测试夹具必须脱敏，不得提交真实账号或玩家数据。

完整阶段记录见 [`REFACTORING_LOG.md`](REFACTORING_LOG.md)，当前兼容边界与冻结基线见 [`legacy/migration-notes.md`](legacy/migration-notes.md)。准备调整玩法时，先按 [`GAMEPLAY_CHANGE_GUIDE.md`](GAMEPLAY_CHANGE_GUIDE.md) 选择纯规则入口和回归测试。

进入最终 UI 阶段前必须逐项通过 [`NON_UI_READINESS.md`](NON_UI_READINESS.md) 的完成门禁。
