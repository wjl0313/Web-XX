# P0 截图基线

本目录保存 P0 功能、布局、旧 UI 风格和关键交互的截图基线。冻结旧版是视觉与交互参考，原生壳不要求复制旧 DOM，但不得擅自换皮或重做结构。

## 已保存截图

1. `01-native-login.png`：原生旧式登录/本地进入。
2. `02-native-character-roster.png`：24 槽角色库与角色舞台。
3. `03-native-character-creation.png`：四步创建流程。
4. `04-native-game-desktop.png`：桌面顶栏与左—中—右三栏。
5. `05-native-combat-scene.png`：战斗场景、角色、妖兽与操作区。
6. `06-native-zones.png`：区域、收益、妖物、绑定与首领。
7. `07-native-equipment.png`：六槽装备与角色纸娃娃布局。
8. `08-native-settings-import.png`：导入预览、冲突和存档工具。
9. `09-native-inventory-comparison.png`：旧式储物袋与并排装备比较。
10. `10-native-spells.png`：功法、记忆槽、冷却和自动施法。
11. `11-native-offline-summary.png`：离线收益摘要。
12. `12-native-mobile-390.png`：390px 移动端 HUD/顶栏和底部导航。
13. `13-legacy-login.png`：冻结旧版登录页对照。

## 更新方式

只有在 P0 边界内修复功能等价或恢复冻结 UI/交互时才允许更新截图：

```powershell
$env:UPDATE_P0_BASELINE='1'
$env:PLAYWRIGHT_EXECUTABLE_PATH='C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
npm run test:e2e
```

更新后必须同时通过冻结哈希、单元测试、桌面与移动端 E2E，并在 `REFACTORING_LOG.md` 说明截图变化原因。

