import { expect, test, type Page } from '@playwright/test'

async function createV2Character(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: '进入本地修仙界' }).click()
  await page.getByRole('button', { name: '槽位 1 创建角色' }).click()
  const creator = page.locator('.legacy-create-backdrop')
  await creator.getByRole('button', { name: /^天灵根\s+天灵根 · 5 种组合$/ }).click()
  await creator.getByRole('button', { name: '金天灵根', exact: true }).click()
  await expect(creator).toContainText('天灵根的 100%')
  await page.getByRole('button', { name: '下一步' }).click()
  await page.getByRole('button', { name: '五行法修', exact: true }).click()
  await page.getByRole('button', { name: '下一步' }).click()
  await page.getByRole('button', { name: '下一步' }).click()
  await page.getByPlaceholder('至少两个字符').fill('试剑青岚')
  await page.getByRole('button', { name: '创建并进入' }).click()
  await expect(page.getByRole('heading', { name: '试剑青岚' })).toBeVisible()
}

test('P1 新角色在旧场景与旧交互骨架内完成三功法回合制战斗', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes('mobile'))
  const pageErrors: Error[] = []
  page.on('pageerror', (error) => pageErrors.push(error))
  await createV2Character(page)

  await expect(page.locator('iframe')).toHaveCount(0)
  await expect(page.getByRole('region', { name: '斗法场景' })).toBeVisible()
  await expect(page.getByRole('img', { name: '试剑青岚的战斗形象' })).toBeVisible()
  await expect(page.getByLabel('角色状态')).toContainText('金天灵根')
  await expect(page.getByLabel('角色状态')).toContainText('可学金属性功法')
  await expect(page.getByLabel('角色状态')).toContainText('五行与异属性抗性')
  await expect(page.getByLabel('挂机设置')).toContainText('离线最多结算 8 小时')

  const tabs = page.getByRole('navigation', { name: '游戏功能' })
  await tabs.getByRole('button', { name: '功法典籍' }).click()
  await expect(page.getByRole('heading', { name: '三功法位' })).toBeVisible()
  await expect(page.locator('.memory-slot-list > li')).toHaveCount(3)
  await expect(page.getByText('庚金剑诀', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('金属性').first()).toBeVisible()
  await expect(page.getByText('灵根亲和 100').first()).toBeVisible()

  await tabs.getByRole('button', { name: '斗法' }).click()
  await page.getByRole('button', { name: '寻敌', exact: true }).click()
  await expect(page.locator('.legacy-battle-sprite--enemy')).toBeVisible()
  await expect(page.locator('.legacy-battle-sprite--enemy svg')).toHaveCount(0)
  await expect(page.locator('.legacy-battle-sprite--enemy span')).toContainText(/.+/)
  await expect(page.locator('.legacy-mob-area')).toContainText('当前行动：试剑青岚')
  await expect(page.locator('.legacy-mob-area')).toContainText('行动规则：身法高者先攻，每轮各行动一次')
  await expect(page.getByRole('button', { name: '普通攻击' })).toBeEnabled()
  await expect(page.getByRole('button', { name: '庚金剑诀' })).toBeVisible()
  await page.getByRole('button', { name: '普通攻击' }).click()
  await expect(page.getByText('最近一次伤害分解')).toBeVisible()
  await expect(page.locator('.legacy-combat-log')).toContainText('最终')
  if (await page.getByRole('button', { name: '自动完成战斗' }).isVisible()) {
    await page.getByRole('button', { name: '自动完成战斗' }).click()
  }
  await expect(page.getByRole('button', { name: '自动寻敌并战斗' })).toBeVisible()
  const logAtBottom = await page.locator('.legacy-combat-log').evaluate((element) =>
    Math.abs(element.scrollHeight - element.clientHeight - element.scrollTop) <= 2)
  expect(logAtBottom).toBe(true)

  await page.getByRole('button', { name: '开始自动历练' }).click()
  await expect(page.locator('.legacy-battle-sprite--enemy')).toBeVisible({ timeout: 5_000 })
  await page.waitForFunction(() => Boolean(document.querySelector(
    '.legacy-battle-unit.is-attacking, .legacy-battle-unit.is-casting, .legacy-battle-unit.is-hit',
  )), undefined, { timeout: 8_000 })
  await expect(page.locator('.legacy-battle-popup')).toBeVisible({ timeout: 3_000 })
  await page.getByRole('button', { name: '停止自动历练' }).click()
  expect(pageErrors).toEqual([])
})

test('P1 区域、装备比较与刷新恢复不启用冻结系统', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes('mobile'))
  const pageErrors: Error[] = []
  page.on('pageerror', (error) => pageErrors.push(error))
  await createV2Character(page)
  const tabs = page.getByRole('navigation', { name: '游戏功能' })

  await tabs.getByRole('button', { name: '历练区域' }).click()
  await expect(page.getByText('已解锁 1 / 5')).toBeVisible()
  await expect(page.getByText('尚未开放').first()).toBeVisible()
  await expect(page.getByRole('button', { name: '挑战首领' })).toHaveCount(2)
  await expect(page.getByRole('button', { name: '使用固定历练区域' })).toBeDisabled()

  await tabs.getByRole('button', { name: '储物袋' }).click()
  const bagItems = page.locator('.legacy-bag-grid > button')
  await expect(bagItems).toHaveCount(4)
  await bagItems.first().click()
  await expect(page.getByLabel('物品详情与装备对比')).toContainText('攻击差值')
  await expect(page.getByLabel('物品详情与装备对比')).toContainText('待装备抗性')

  await tabs.getByRole('button', { name: '随身装备' }).click()
  await expect(page.locator('.equipment-slot')).toHaveCount(6)
  await expect(page.getByRole('heading', { name: '符纹匣' })).toBeVisible()
  await expect(page.getByText('符纹数据暂时保留，但不计入符纹、套装与复杂重铸效果。')).toBeVisible()

  await page.evaluate(() => {
    const slots = JSON.parse(localStorage.getItem('EmberQuest_slots') || '[]')
    slots[0].v2AfkEnabled = true
    slots[0].v2LastAfkAt = Date.now() - 60_000
    localStorage.setItem('EmberQuest_slots', JSON.stringify(slots))
  })

  await page.reload()
  await expect(page.getByRole('button', { name: '进入本地修仙界' })).toBeVisible()
  await page.getByRole('button', { name: '进入本地修仙界' }).click()
  await expect(page.getByRole('button', { name: '槽位 1 试剑青岚' })).toContainText('金天灵根')
  await page.getByRole('button', { name: '进入修仙界' }).click()
  await expect(page.getByRole('dialog', { name: '离线收益' })).toBeVisible()
  await expect(page.locator('.legacy-offline-summary')).toHaveCount(0)
  await page.getByRole('button', { name: '领取并继续' }).click()
  await expect(page.getByRole('dialog', { name: '离线收益' })).toHaveCount(0)
  await expect(page.getByRole('region', { name: '斗法场景' })).toBeVisible()
  await tabs.getByRole('button', { name: '功法典籍' }).click()
  await expect(page.locator('.memory-slot-list > li')).toHaveCount(3)
  expect(pageErrors).toEqual([])
})
