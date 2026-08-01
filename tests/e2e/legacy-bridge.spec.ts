import { readFileSync } from 'node:fs'

import { expect, test } from '@playwright/test'

const emptySlotsFixture = readFileSync(
  new URL('../fixtures/saves/empty-slots-v1.json', import.meta.url),
  'utf8',
).trim()
const existingSlotsFixture = readFileSync(
  new URL('../fixtures/saves/legacy-character-v2.json', import.meta.url),
  'utf8',
).trim()

const newsFixture = Array.from({ length: 5 }, (_, index) => ({
  id: `news-${index + 1}`,
  category: 'patch',
  title: `凡修录更新 ${index + 1}`,
  body_md: '本次更新用于验证公告较多时仍可进入本地游戏。',
  is_pinned: index === 0,
  published_at: `2026-06-${String(12 - index).padStart(2, '0')}T00:00:00.000Z`,
  expires_at: null,
}))

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

test('实验入口加载原生角色道册并创建角色', async ({ page }) => {
  await page.goto('/?native=1')
  await expect(page).toHaveTitle('凡修录')
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')
  await expect(page.getByRole('heading', { name: '选择修士' })).toBeVisible()
  await expect(page.locator('iframe')).toHaveCount(0)

  await page.getByRole('button', { name: '槽位 1 创建角色' }).click()
  await page.getByLabel('道号').fill('云岫')
  await page.getByRole('button', { name: '创建并进入' }).click()

  await expect(page.getByRole('heading', { name: '云岫' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: '游戏功能' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '遭遇' })).toBeVisible()

  const metrics = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    bodyScrollWidth: document.body.scrollWidth,
  }))

  expect(metrics.bodyScrollWidth).toBeLessThanOrEqual(metrics.viewportWidth)
})

test('实验原生界面可以寻敌并切换主要面板', async ({ page }) => {
  await page.goto('/?native=1')
  await page.getByRole('button', { name: '槽位 1 创建角色' }).click()
  await page.getByLabel('道号').fill('归鹤')
  await page.getByRole('button', { name: '创建并进入' }).click()

  await page.getByRole('button', { name: '寻敌' }).click()
  await expect(page.getByText('交战中')).toBeVisible()

  const menu = page.getByRole('button', { name: '打开导航' })
  if (await menu.isVisible()) await menu.click()
  await page.getByRole('button', { name: '储物袋' }).click()
  await expect(page.getByRole('heading', { name: '储物袋', exact: true })).toBeVisible()
  if (await menu.isVisible()) await menu.click()
  await page.getByRole('button', { name: '历练区域' }).click()
  await expect(page.getByRole('heading', { name: '历练区域', exact: true })).toBeVisible()
})

test('默认入口加载冻结的旧版登录页', async ({ page }) => {
  await page.goto('/')

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

  await page.goto('/')
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

  await page.goto('/')
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
  }, existingSlotsFixture)

  await page.goto('/')
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
    ]
  })
  expect(translatedSamples).toEqual([
    '你离开了 6 秒，期间在虚空废土自动历练。',
    '欢迎来到金焰赌石坊——你持有 98,243,030 枚灵石。可旋转、刮符、斗牌、猜签或掷骰赢取奖励。',
    '正在查看 百宝储物袋 · 格位 1–40 · 物品总数：111 · 生效套装：陨神古宝套装（攻击 +18，防御 +18）',
    '流光·饮血短刃·强者',
    '声望：同盟（500）· 淬炼服务现已开放。',
  ])
  expect(pageErrors).toEqual([])
})
