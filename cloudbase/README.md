# CloudBase 服务端

本目录包含 P2 云函数共用的服务端源码、部署模板、六集合/索引清单和安全规则。所有客户端数据访问均经过云函数；数据库集合对 Web 客户端默认拒绝直接读写。

## 本地构建与验证

```bash
npm run cloudbase:build
npm test -- --run tests/unit/cloudbase-game.service.test.ts
```

构建输出位于忽略提交的 `cloudbase/dist/game`。同一份 bundle 会按 `cloudbase/cloudbaserc.example.json` 部署到全部 P2 函数，函数名由受信任的 CloudBase 运行时上下文提供，请求体不能伪造操作名。

## 环境准备

1. 在 CloudBase 创建 `cloudbase/database/collections.json` 中的六个集合与索引。
2. 在各集合控制台应用 `cloudbase/rules/database/*.json`，禁止客户端直接读写。
3. 在云函数权限控制中应用 `cloudbase/rules/functions.json`。
4. 设置 `CLOUDBASE_ENV_ID`，执行 `npm run cloudbase:config` 生成不入库的 `cloudbaserc.json`。
5. 在 Web 入口初始化 CloudBase SDK、完成匿名身份后，将 `CloudBaseFunctionClient` 和可选匿名认证适配器注入 `CloudBaseGameRepository`，再调用 `configureGameCloudRepository()`。
6. 登录 CloudBase CLI 后执行 `tcb fn deploy --all --yes`。

仓库不保存环境 ID、登录凭据或第三方 API 密钥。部署后仍必须在真实环境完成匿名认证、账号绑定、并发冲突、8 小时挂机、排行榜索引和跨账号挑战的端到端联调，才能标记为“已上线”。
