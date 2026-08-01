/** 关于、玩法说明与社区入口。仅翻译玩家可见说明，不改外链和许可证。 */
export const ABOUT_ZH_CN: Readonly<Record<string, string>> = Object.freeze({
  'A classic-MMO-inspired idle/incremental RPG that runs entirely in a single HTML file — no install, no server, no build step.':
    '一款受经典网游启发的放置修仙游戏，整个游戏运行于单个网页文件中，无需安装、服务器或构建步骤。',
  'EmberQuest is a love-letter to the late-90s era of online roleplaying games. Roll a character, pick a hunting ground, and grind your way from the newbie fields to the endgame — by hand or on full auto-battle. Everything (markup, styles, and game logic) lives in one self-contained page, and your progress is saved locally in your browser.':
    '《凡修录》向九十年代末的经典网络角色扮演游戏致意。创建修士、选择历练之地，从初入仙途一路修炼至后期；可亲自操作，也可开启自动历练。界面、样式与游戏逻辑均位于同一页面，进度保存在当前浏览器中。',

  'Deep character creation.': '丰富的角色创建。',
  '16 races and 16 classes, with up to 24 character slots per account.':
    '16 种灵根与 16 种初始传承，每份道籍最多可容纳 24 名修士。',
  'Six ability scores.': '六维属性。',
  'A D&D-style STR/DEX/CON/INT/WIS/CHA layer drives attack, crit, dodge, mitigation, spell power, mana regen, and gold find. Scores grow with level, gear, and Ascension.':
    '根骨、身法、体魄、悟性、神识与机缘共同影响攻击、会心、闪避、减伤、功法威力、回灵与灵石获取；属性会随修为、装备与飞升提升。',
  'Turn-based combat.': '回合斗法。',
  'HP/MP, attack/defense, criticals, dodges, weapon procs, item sets, and a colour-coded combat log.':
    '斗法包含气血、法力、攻防、会心、闪避、法器特效、套装效果与分色战报。',
  'Zones from level 1 to 88.': '从一阶至高阶的历练区域。',
  'Each hunting ground has its own monsters, XP/gold multipliers, and a rare chase item.':
    '每处历练之地都有专属妖物、修为与灵石倍率，以及可追寻的稀有物品。',
  'Loot, affixes, and sets.': '战利品、词条与套装。',
  'Random drops roll prefix/suffix affixes (now including ability-score rolls), set bonuses, and six rarity tiers from Common to Mythic.':
    '随机掉落可生成前后缀与六维属性，并含套装加成及从凡品到通天的六阶品质。',
  'Runes & runewords.': '炼器符纹与符纹造物。',
  'Collect runes, choose which to socket, and forge runewords that grant stats and special effects (crit, lifesteal, gold/XP find) and evolve through tiers with use.':
    '收集并嵌入炼器符纹，铸成可提供属性、会心、吸血与资源获取特效的符纹造物，使用过程中还可持续进化。',
  'Spellbook & gems.': '功法典籍与功法槽。',
  'Casters memorise spells into gem slots and meditate to recover mana.':
    '术修可将功法配置至功法槽，并通过打坐恢复法力。',
  'Quests & elite contracts.': '委托与精英契约。',
  'Kill quests, a class epic quest with a legendary reward, and a rotating elite-contract chain with AFK pinning.':
    '包含诛妖委托、奖励传说之物的传承试炼，以及可置顶追踪的轮换精英契约链。',
  'Auto-Battle (AFK).': '自动历练（闭关挂机）。',
  'Auto-fight, loot, rest, pot, and restock toward a chosen goal; long offline sessions are simulated on return.':
    '可按目标自动斗法、拾取、调息、用丹与补给；长时间离线后会在返回时结算。',
  'Alternate Ascension.': '悟道。',
  'Unlocks at level 51 — spend points on archetype trees, unique class nodes, a capstone, and attribute nodes that raise your six ability scores.':
    '修为等级 51 时解锁；可消耗悟道点数学习传承分支、专属节点、终极节点与六维属性节点。',
  'Prestige.': '重修。',
  'At the level cap, reset for permanent perks.': '达到修为上限后可重修，换取永久加成。',
  'Companions in the Group tab.': '同行队伍与伙伴。',
  'Pets and full per-mercenary gear sets, plus grouping your own alts to share experience.':
    '可携带灵兽、为护道者配置完整装备，并与同道籍中的其他修士组队分享修为。',
  'Shop & crafting.': '坊市与炼制。',
  'Tiered potions that scale as you level, a crafting bench, targeted rerolls, occultist reforge, and rune transmutation.':
    '坊市提供随修为提升的分阶丹药、炼制工坊、定向重铸、随机淬炼与符纹转化。',

  The: '',
  'tab is your main view; the': '栏是主要视图；',
  'tab is where you travel to tougher hunting grounds.': '栏用于前往更危险的历练之地。',
  and: '与',
  'unlock at levels 51 and the cap respectively.': '会分别在修为等级 51 和上限时解锁。',
  'Configure the': '请在右侧设置',
  'panel on the right, and pin an elite contract from the Quests tab so AFK chases the target you want.':
    '面板，并在委托中置顶精英契约，使闭关挂机会追踪指定目标。',

  'Need help, want to report a bug, or want to follow updates? Open the': '如需求助、报告问题或关注更新，请打开',
  'panel for live counts and a direct join link.': '面板查看在线数据与加入入口。',
  'Progress autosaves to your browser\'s local storage and syncs to the cloud when you\'re signed in. Clearing your browser data can erase local characters, so use':
    '进度会自动保存在浏览器本地，登录道籍后也可同步至云端。清除浏览器数据可能删除本地修士，因此请使用',
  'on the topbar to download a backup;': '下载备份；',
  'restores it, and Settings can export a full recovery bundle with local snapshots and diagnostics.':
    '可恢复备份，设置中还可导出包含本地快照和诊断信息的完整恢复包。',

  'Mercenary gear.': '护道者装备。',
  'Mercenaries now use full player-style gear slots and have a dedicated gear/inventory modal.':
    '护道者现可使用与修士相同的全套装备槽，并有独立的装备与储物界面。',
  'Casino expansion.': '赌石坊扩展。',
  'Blackjack, Roulette, and Dragon Dice join the Golden Ember Casino with session and lifetime win/loss stats.':
    '金焰赌石坊新增二十一点、天机轮盘与龙纹骰，并记录本次及累计胜负数据。',
  'Roulette trends.': '天机轮盘走势。',
  'The table now shows the last 20 balls, hot/cold numbers, and red/black, odd/even, high/low, dozen, and zero counts.':
    '现可查看最近 20 次结果、冷热数字以及颜色、单双、高低、区间与零点统计。',
  'Pachinko layout.': '落珠盘布局。',
  'Reward and session-stat space is now reserved so drop buttons stay fixed when rewards appear.':
    '预留奖励与本次统计空间，使掉落按钮在显示结果时保持稳定。',
  'Version metadata.': '版本信息。',
  'Static and runtime version metadata is aligned to v1.6.19.': '静态页面与运行时版本信息已统一至 1.6.19 版。',
  'Review fixes.': '审查修复。',
  'Generated action handlers now pass dynamic IDs through JavaScript-safe attributes for news, crafting, raid, and More-menu controls, and version metadata is aligned to v1.6.15.':
    '动态操作现通过安全属性传递标识，修复公告、炼制、团本与更多菜单的调用问题，并统一 1.6.15 版信息。',
  'Cloud background publishing now handles rejected async work cleanly, character-name validation is tighter, and version metadata is aligned to v1.6.14.':
    '云端后台发布现可稳定处理失败的异步任务，道号校验更严谨，并统一 1.6.14 版信息。',
  'Code cleanup.': '代码整理。',
  'Source-history comments now live in the audit log, and the static title/version metadata is aligned to v1.6.13.':
    '源码历史说明已移入审计记录，静态标题与版本信息已统一至 1.6.13 版。',
  'Discord Community.': '修士交流。',
  'The About/desktop tabs/Mobile v2 More menu now expose a lightweight member-count card and direct join link instead of the oversized widget.':
    '关于面板、桌面栏与移动端更多菜单现使用轻量人数卡片和直接加入入口，不再嵌入过大组件。',
  'Mobile UI v2.': '第二版移动界面。',
  'A new one-thumb portrait layout with persistent HP/MP/XP HUD, bottom navigation, safe-area support, swipe gestures, and bottom-sheet popups.':
    '新增适合单手操作的竖屏布局，包含常驻气血、法力与修为提示、底部导航、安全区适配、滑动手势和底部弹层。',
  'Bestiary Codex.': '万灵图鉴。',
  'Defeated creatures are now recorded with kill counts, max level seen, zone, and notable traits.':
    '万灵图鉴现会记录已击败妖物的数量、所见最高等级、出没区域与特殊性质。',
  'Objective HUD.': '目标提示栏。',
  'Combat now surfaces your best next daily, class quest, elite contract, and craftable potion prompt.':
    '斗法界面现会提示推荐的日常委托、传承试炼、精英契约与可炼制丹药。',
  'Crafting Pinboard.': '炼制提示板。',
  'Alchemy recipes light up when your herb inventory can craft them, with direct shortcuts into Alchemy.':
    '当现有灵草足以炼制时，对应丹方会高亮，并可直接前往炼丹。',
  'Version notes modal.': '版本说明窗口。',
  'A short What’s New sheet appears once per version bump and links back here.':
    '每次版本更新后会显示一次简要更新说明，并可返回此处查看详情。',

  'A fan tribute to the classic massively-multiplayer RPGs of the late 1990s, made in the spirit of homage and not affiliated with or endorsed by any rights holder. UI icons from':
    '本作品向九十年代末的经典大型多人角色扮演游戏致意，与任何权利方均无隶属或授权关系。界面图标来自',
  '. Released under the': '。本项目依',
  '— free to use, modify, and redistribute, with derivatives shipping their source under the same license.':
    '发布，可自由使用、修改与再分发，衍生作品需依同一许可证提供源码。',
  'Source on GitHub': '代码托管平台源码',
  'No hardcore deaths recorded yet.': '尚无生死道途修士陈亡记录。',

  'EmberQuest Discord': '凡修录修士交流',
  'Join the community for patch notes, feedback, bug reports, balance talk, and player help. This panel intentionally avoids the full Discord iframe and only fetches lightweight count data when Discord allows it.':
    '加入修士交流区，获取更新说明、提交反馈与问题、讨论平衡或互相帮助。此面板仅在交流平台允许时读取轻量人数数据。',
  'Community server': '修士交流服务器',
  'Hop in for updates, bug reports, balance talk, and feature ideas.': '欢迎参与更新、问题、平衡与新玩法讨论。',
  'Online now': '当前在线',
  'Total members': '修士总数',
  'Counts load when this panel opens.': '打开面板时读取人数。',
  'Join Discord': '加入修士交流',
  'Refresh Counts': '刷新人数',
  'Counts come from Discord\'s public invite/widget endpoints. If Discord blocks the request or the server disables public data, the join link still works.':
    '人数来自交流平台的公开邀请与小组件接口。若请求被拦截或服务器关闭公开数据，加入链接仍可使用。',
})
