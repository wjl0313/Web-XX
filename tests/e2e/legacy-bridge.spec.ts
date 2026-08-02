import { readFileSync } from 'node:fs'

import { expect, test, type Page } from '@playwright/test'

const emptySlotsFixture = readFileSync(
  new URL('../fixtures/saves/empty-slots-v1.json', import.meta.url),
  'utf8',
).trim()
const existingSlotsFixture = readFileSync(
  new URL('../fixtures/saves/legacy-character-v2.json', import.meta.url),
  'utf8',
).trim()
const highLevelClericSlotsFixture = (() => {
  const slots = JSON.parse(existingSlotsFixture) as Array<Record<string, unknown> | null>
  const character = slots[0]!
  character.cls = 'Cleric'
  character.level = 129
  character.gold = 100_000_000
  character.aa = { points: 0, spent: 0, xpProgress: 0, xpAllocPct: 0, nodes: {}, legacy: {}, legacySpent: 0 }
  character.prestige = { rank: 0, points: 0, spent: 0, perks: {}, lastStarterGrantRank: 0 }
  return JSON.stringify(slots)
})()

const newsFixture = Array.from({ length: 5 }, (_, index) => ({
  id: `news-${index + 1}`,
  category: 'patch',
  title: `凡修录更新 ${index + 1}`,
  body_md: '本次更新用于验证公告较多时仍可进入本地游戏。',
  is_pinned: index === 0,
  published_at: `2026-06-${String(12 - index).padStart(2, '0')}T00:00:00.000Z`,
  expires_at: null,
}))

async function openGamePanel(page: Page, name: string) {
  const mobileNavigation = page.getByRole('navigation', { name: '移动端功能导航' })
  if (await mobileNavigation.isVisible()) {
    await mobileNavigation.getByRole('button', { name }).click()
    return
  }
  await page.getByRole('navigation', { name: '游戏功能' }).getByRole('button', { name }).click()
}

test.beforeEach(async ({ page }) => {
  await page.route('**/supabase-js@2', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: `window.supabase={createClient:function(){return{auth:{getSession:async function(){return{data:{session:null}}}}}}};`,
    })
  })
  await page.route('**/rest/v1/news_posts**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(newsFixture),
    })
  })
  await page.addInitScript((serializedSlots) => {
    window.localStorage.setItem('EmberQuest_slots', serializedSlots)
  }, emptySlotsFixture)
})

test('默认入口加载原生角色道册并通过四步流程创建角色', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle('凡修录')
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')
  await expect(page.getByRole('heading', { name: '凡修录', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '进入本地修仙界' }).click()
  await expect(page.getByRole('heading', { name: '选择修士' })).toBeVisible()
  await expect(page.locator('iframe')).toHaveCount(0)

  await page.getByRole('button', { name: '槽位 1 创建角色' }).click()
  await expect(page.getByRole('group', { name: '选择灵根与体质' })).toBeVisible()
  await page.getByRole('button', { name: '下一步' }).click()
  await expect(page.getByRole('group', { name: '选择初始传承' })).toBeVisible()
  await page.getByRole('button', { name: '下一步' }).click()
  await expect(page.getByRole('group', { name: '设置角色外观' })).toBeVisible()
  await page.getByRole('button', { name: '下一步' }).click()
  await page.getByLabel('道号').fill('云岫')
  await page.getByRole('button', { name: '创建并进入' }).click()

  await expect(page.getByRole('heading', { name: '云岫', level: 1 })).toBeVisible()
  const primaryNavigation = (page.viewportSize()?.width || 1280) <= 900
    ? page.getByRole('navigation', { name: '移动端功能导航' })
    : page.getByRole('navigation', { name: '游戏功能' })
  await expect(primaryNavigation).toBeVisible()
  await expect(page.getByRole('heading', { name: '斗法场景' })).toBeVisible()

  const metrics = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    bodyScrollWidth: document.body.scrollWidth,
  }))

  expect(metrics.bodyScrollWidth).toBeLessThanOrEqual(metrics.viewportWidth)
})

test('实验原生界面可以寻敌并切换主要面板', async ({ page }) => {
  await page.goto('/?mode=equivalent')
  await page.getByRole('button', { name: '进入本地修仙界' }).click()
  await page.getByRole('button', { name: '槽位 1 创建角色' }).click()
  await page.getByRole('button', { name: '下一步' }).click()
  await page.getByRole('button', { name: '下一步' }).click()
  await page.getByRole('button', { name: '下一步' }).click()
  await page.getByLabel('道号').fill('归鹤')
  await page.getByRole('button', { name: '创建并进入' }).click()

  await page.getByRole('button', { name: '寻敌', exact: true }).click()
  await expect(page.getByText('交战中')).toBeVisible()

  await openGamePanel(page, '储物袋')
  await expect(page.getByRole('heading', { name: '储物袋', exact: true })).toBeVisible()
  await openGamePanel(page, '历练区域')
  await expect(page.getByRole('heading', { name: '历练区域', exact: true })).toBeVisible()
})

test('v2 模式进入原生玩法且不加载旧版 iframe', async ({ page }) => {
  await page.goto('/?mode=v2')

  await expect(page.getByRole('button', { name: '进入本地修仙界' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '新玩法尚未开放' })).toHaveCount(0)
  await expect(page.locator('iframe')).toHaveCount(0)
})

test('损坏旧存档会被隔离但不会把默认入口退回 iframe', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('EmberQuest_slots', '{')
  })

  await page.goto('/')
  await expect(page.locator('iframe')).toHaveCount(0)
  await expect(page.getByText(/检测到 1 项旧存档问题/)).toBeVisible()
  await page.getByRole('button', { name: '进入本地修仙界' }).click()
  await expect(page.getByRole('heading', { name: '选择修士' })).toBeVisible()

  const quarantined = await page.evaluate(() => Object.keys(window.localStorage).some((key) => key.startsWith('EmberQuest_slots.corrupt.')))
  expect(quarantined).toBe(true)
})

test('显式 legacy 入口加载冻结的旧版登录页', async ({ page }) => {
  await page.goto('/?mode=legacy')

  const frame = page.frameLocator('iframe[title="凡修录游戏界面"]')
  await expect(frame.getByRole('heading', { name: '凡修录', exact: true })).toBeVisible()
  await expect(frame.locator('#login-local')).toBeVisible()
  await expect(frame.locator('#login-local')).toHaveText('本地进入（无需道籍）')
  await expect(frame.getByRole('button', { name: '查看' })).toHaveCount(5)
  await expect(frame.getByRole('button', { name: '忽略' })).toHaveCount(5)

  const metrics = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    bodyScrollWidth: document.body.scrollWidth,
    frameCount: document.querySelectorAll('iframe').length,
  }))

  expect(metrics.frameCount).toBe(1)
  expect(metrics.bodyScrollWidth).toBeLessThanOrEqual(metrics.viewportWidth)
})

test('冻结版本的本地模式仍可进入角色道册', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

  await page.goto('/?mode=legacy')
  const frame = page.frameLocator('iframe[title="凡修录游戏界面"]')
  const localEntry = frame.locator('#login-local')

  await expect(localEntry).toBeVisible()
  // 等待足够长再进入，保护曾出现过的延迟卡死路径。
  await page.waitForTimeout(3_000)
  await localEntry.click()

  await expect(frame.locator('#screen-charselect')).toHaveClass(/active/)
  await expect(frame.locator('#screen-login')).not.toHaveClass(/active/)
  await expect(frame.locator('#screen-charselect').getByText('角色库', { exact: true })).toBeVisible()
  await expect(frame.locator('#charselect-panel .cs-bottomrow .rpg-primary')).toHaveText('进入修仙界')
  expect(pageErrors).toEqual([])
  const emptySlots = frame.locator('#cs-slotlist .rpg-charslot')
  await expect(emptySlots).toHaveCount(24)
  await expect(emptySlots).toHaveText(Array.from({ length: 24 }, () => '创建角色'))
  const slotTextBeforeInteraction = await emptySlots.allTextContents()
  await frame.locator('#charselect-panel').getByText('轮换', { exact: true }).click()
  await page.waitForTimeout(1_200)
  expect(await emptySlots.allTextContents()).toEqual(slotTextBeforeInteraction)
  await expect(emptySlots.filter({ hasText: '开辟新道途' })).toHaveCount(0)
  expect(pageErrors.filter((message) => message.includes('MutationObserver'))).toEqual([])
})

test('冻结版本长等待后仍可进入主游戏并切换面板', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.addInitScript((serializedSlots) => {
    window.localStorage.setItem('EmberQuest_slots', serializedSlots)
    window.localStorage.setItem('EmberQuest_seenVersion', '1.6.19')
  }, existingSlotsFixture)

  await page.goto('/?mode=legacy')
  const frame = page.frameLocator('iframe[title="凡修录游戏界面"]')
  await page.waitForTimeout(3_000)
  await frame.locator('#login-local').click()
  await expect(frame.locator('#charselect-panel .cs-header')).toHaveText('角色库')
  await expect(frame.locator('#charselect-panel .cs-bottomrow .rpg-primary')).toHaveText('进入修仙界')
  await frame.locator('#charselect-panel .cs-bottomrow .rpg-primary').click()
  await expect(frame.locator('#screen-game')).toHaveClass(/active/)

  // 长等待后仍能使用旧版交互，并记录文本以防点击后换成另一套译名。
  await page.waitForTimeout(3_000)
  await expect(frame.locator('#game-topbar .title')).toContainText('版本')
  await expect(frame.locator('#char-class-disp')).toContainText('炼体士')
  await expect(frame.locator('#tour-step')).toHaveText('第 1 步，共 5 步')
  await expect(frame.locator('#tour-text')).not.toContainText('Spacebar')
  const classTextBeforeInteraction = await frame.locator('#char-class-disp').textContent()
  const abilityLabels = frame.locator('#abilities-disp > span > span:first-child')
  await expect(abilityLabels).toHaveText(['根骨', '身法', '体魄', '悟性', '神识', '机缘'])
  const abilityTextBeforeInteraction = await abilityLabels.allTextContents()

  await frame.locator('#tour-next').click()
  await expect(frame.locator('#tour-step')).toHaveText('第 2 步，共 5 步')
  await page.waitForTimeout(1_200)
  expect(await frame.locator('#char-class-disp').textContent()).toBe(classTextBeforeInteraction)
  expect(await abilityLabels.allTextContents()).toEqual(abilityTextBeforeInteraction)
  await expect(frame.locator('#tab-inv')).toBeVisible()
  await expect(frame.locator('#tab-inv').getByRole('heading', { name: '已装备', exact: true })).toBeVisible()
  await expect(frame.locator('#tab-inv').getByRole('heading', { name: '储物袋', exact: true })).toBeVisible()
  await expect(frame.locator('#tab-inv').getByRole('option', { name: '排序：默认' })).toBeAttached()
  await expect(frame.locator('#tab-inv').getByText('Backpack', { exact: true })).toHaveCount(0)
  expect(pageErrors.filter((message) => message.includes('MutationObserver'))).toEqual([])
})

test('隐藏面板首次打开即为稳定中文且不会在交互后换词', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.addInitScript((serializedSlots) => {
    window.localStorage.setItem('EmberQuest_slots', serializedSlots)
    window.localStorage.setItem('EmberQuest_seenVersion', '1.6.19')
    window.localStorage.setItem('EQ_tourDone', '1')
  }, highLevelClericSlotsFixture)

  await page.goto('/?mode=legacy')
  const frame = page.frameLocator('iframe[title="凡修录游戏界面"]')
  await page.waitForTimeout(3_000)
  await frame.locator('#login-local').click()
  await frame.locator('#charselect-panel .cs-bottomrow .rpg-primary').click()
  await expect(frame.locator('#screen-game')).toHaveClass(/active/)
  const tourSkip = frame.locator('#tour-tip .tour-skip')
  if (await tourSkip.isVisible()) await tourSkip.click()

  await frame.locator('button[onclick="openSettingsModal(event)"]').first().dispatchEvent('click')
  const settings = frame.locator('#settings-modal')
  await expect(settings).toHaveClass(/open/)
  await expect(settings.locator('#settings-modal-title')).toContainText('设置')
  await expect(settings).toContainText('静音全部声音')
  await expect(settings).toContainText('存档维护工具')
  await expect(settings).not.toContainText(/organized into collapsible containers|Mute all sound|Stability Tools/)
  const settingsTitleBefore = await settings.locator('#settings-modal-title').textContent()
  await settings.getByRole('button', { name: '全部收起' }).click()
  await settings.getByRole('button', { name: '全部展开' }).click()
  await page.waitForTimeout(800)
  expect(await settings.locator('#settings-modal-title').textContent()).toBe(settingsTitleBefore)
  await settings.getByRole('button', { name: '关闭', exact: true }).last().click()

  await frame.locator('#pbtn-spells').dispatchEvent('click')
  const popup = frame.locator('#popup-backdrop')
  await expect(popup).toHaveClass(/open/)
  await expect(frame.locator('#tab-spells')).toContainText('功法槽配置')
  await expect(frame.locator('#tab-spells')).toContainText('已参悟功法')
  await expect(frame.locator('#tab-spells')).not.toContainText(/Gem Loadout|Known Spells|Spell Vendor|Empty Slot/)
  const spellTextBefore = await frame.locator('#tab-spells').textContent()
  await frame.locator('#popup-close').click()

  await frame.locator('#pbtn-group').dispatchEvent('click')
  await expect(frame.locator('#tab-group')).toContainText('战斗阵型')
  await expect(frame.locator('#tab-group')).not.toContainText(/Group your other characters|Battle Lineup|No group members/)
  await frame.locator('#popup-close').click()

  await frame.locator('#pbtn-dungeon').dispatchEvent('click')
  await expect(frame.locator('#tab-dungeon')).toContainText('进入秘境')
  await expect(frame.locator('#tab-dungeon')).not.toContainText(/Enter Dungeon|Leave Dungeon|Challenge Floor/)
  await frame.locator('#popup-close').click()

  await frame.locator('#pbtn-spells').dispatchEvent('click')
  await page.waitForTimeout(800)
  expect(await frame.locator('#tab-spells').textContent()).toBe(spellTextBefore)
  await frame.locator('#popup-close').click()

  await frame.locator('#tabbtn-casino').dispatchEvent('click')
  const casino = frame.locator('#tab-casino')
  await expect(casino).toContainText('金焰赌石坊')
  await expect(casino).toContainText('灵轮机')
  await expect(casino).toContainText('五灵斗牌')
  await expect(casino).not.toContainText(/Golden Ember|Scratch Tickets|Pachinko|Texas Hold|Blackjack|Roulette|Dragon Dice|Ember Hi-Lo|Keno 20/)

  await frame.locator('#tabbtn-shop').dispatchEvent('click')
  const shop = frame.locator('#tab-shop')
  await expect(shop).toContainText('坊市商贩')
  await expect(shop).toContainText('修行服务')
  await expect(shop).not.toContainText(/Occultist services available|potions owned|Equipment & containers|Crafting, reforge|Sell by rarity/)

  await frame.locator('#tabbtn-zone').dispatchEvent('click')
  const zones = frame.locator('#tab-zone')
  await expect(zones).toContainText('可前往区域')
  await expect(zones).toContainText('契约链追踪')
  await expect(zones).not.toContainText(/Available Zones|Bind Here|Gate to Bind|Contract Chain Tracker|Hunt Target \(Optional\)|random zone mobs|Quick Travel/)

  await frame.locator('#tabbtn-shop').dispatchEvent('click')
  await frame.locator('button[onclick="openShopSection(\'services\')"]').dispatchEvent('click')
  const servicePopup = frame.locator('#popup-backdrop')
  await expect(servicePopup).toHaveClass(/open/)
  await expect(servicePopup.locator('#popup-body')).toContainText('炼器台')
  await expect(servicePopup.locator('#popup-body')).toContainText('易容令')
  await expect(servicePopup.locator('#popup-body')).not.toContainText(/Crafting Bench|Shards:|Salvage Gear|Targeted Reroll|Occultist Reforge|Mystic Reforge|Mystic Chest|Faction Tribute|Change Appearance Token|Name Change Token|Race Change Token|Purchase & Use/)
  await frame.locator('#popup-close').click()

  await frame.locator('#pbtn-prestige').dispatchEvent('click')
  const prestige = frame.locator('#tab-prestige')
  await expect(prestige).toContainText('重修层数')
  await expect(prestige).toContainText('宿世见闻')
  await expect(prestige).toContainText('预计飞升所得')
  await expect(prestige).not.toContainText(/Prestige Rank|Unspent Prestige Points|Ascension requirement|Estimated ascension reward|Current bonuses|Veteran Lore|Golden Touch|Relic Hunter|Battle Legacy|Ancestral Ward|Ascendant Momentum|Invest 1 Prestige/)
  expect(await prestige.textContent()).not.toMatch(/[A-Za-z]{2,}/)
  await frame.locator('#popup-close').click()

  await frame.locator('#pbtn-aa').dispatchEvent('click')
  const ascension = frame.locator('#tab-aa')
  await expect(ascension).toContainText('悟道修为进度')
  await expect(ascension).toContainText('无尽悟道')
  await expect(ascension).toContainText('力极传承')
  await expect(ascension).not.toContainText(/Alternate Ascension|Unspent Points|Legacy Ranks|Class Specialization|Choose one specialization|AA XP Progress|XP to AA|Legacy AA|Endless Progression|Legacy of Might|Legacy of the Guard|Endless Wellspring|Fortune's Echo|Sage's Legacy|Start Simulator/)
  expect(await ascension.textContent()).not.toMatch(/[A-Za-z]{2,}/)
  await frame.locator('#popup-close').click()

  await frame.locator('#tabbtn-combat').dispatchEvent('click')
  await frame.locator('button[onclick="spawnMob()"]')
    .dispatchEvent('click')
  await frame.locator('#attack-btn').dispatchEvent('click')
  const combatLog = frame.locator('#combat-log')
  await expect(combatLog).not.toContainText(/You hit|points of damage|moves to attack you|You have slain|experience!|gold from the corpse/)
  await expect(combatLog).toContainText(/攻击|伤害/)

  const legacyFrame = page.frames().find((candidate) => candidate !== page.mainFrame())
  expect(legacyFrame).toBeDefined()
  const translatedSamples = await legacyFrame!.evaluate(() => {
    const tr = (window as unknown as {
      __fanxiuluDisplayText: (value: string) => string
    }).__fanxiuluDisplayText
    return [
      tr('You were 6s away in Voidwrack Expanse'),
      tr('Welcome to the Golden Ember Casino — your gold: 98,243,030g. Spin, scratch, draw, bluff, guess, or roll for gold and chase rewards.'),
      tr('Showing Tailored Backpack · Slots 1-40 · Total items: 111 · Active Sets: Fallen God (+18 ATK, +18 DEF)'),
      tr('Radiant Bloodletter Shiv of the Strong'),
      tr('Faction: Ally (500) · Occultist services available.'),
      tr('You switch targets to '),
      tr('You cycle targets to '),
      tr('You sweep the enemy pack for '),
      tr(' total damage. (-'),
      tr(' MP)'),
      tr('Prestige Rank: 0 · Unspent Prestige Points: 0'),
      tr('Ascension requirement: Level 100+'),
      tr('Estimated ascension reward: Reach level 100 to earn 1 Prestige Point.'),
      tr('AA XP Progress: 0/635,049 · Next point in 635,049 AA XP'),
      tr('XP to AA: 0%'),
      tr('Legacy of Might · Rank 0'),
      tr('Current: +0.0% physical and spell damage · Next: +0.8% physical and spell damage'),
      tr('Invest 5 AA'),
    ]
  })
  expect(translatedSamples).toEqual([
    '你离开了 6 秒，期间在虚空废土自动历练。',
    '欢迎来到金焰赌石坊——你持有 98,243,030 枚灵石。可旋转、刮符、斗牌、猜签或掷骰赢取奖励。',
    '正在查看 百宝储物袋 · 格位 1–40 · 物品总数：111 · 生效套装：陨神古宝套装（攻击 +18，防御 +18）',
    '流光·饮血短刃·强者',
    '声望：同盟（500）· 淬炼服务现已开放。',
    '你切换目标至',
    '你轮换目标至',
    '你横扫敌群，共造成',
    '点总伤害（消耗 ',
    ' 点法力）',
    '重修层数：0 · 未分配重修点：0',
    '飞升条件：修为等级 100 以上',
    '预计飞升所得：修为等级达到 100 后可获得 1 点重修点数。',
    '悟道修为进度：0/635,049 · 距下一点还需 635,049 点悟道修为',
    '修为转入悟道：0%',
    '力极传承 · 层数 0',
    '当前：+0.0% 物理与功法伤害 · 下一层：+0.8% 物理与功法伤害',
    '投入 5 点悟道',
  ])
  expect(pageErrors).toEqual([])
})
