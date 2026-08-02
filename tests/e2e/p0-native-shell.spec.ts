import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { expect, test, type Page } from '@playwright/test'

const lowSlots = readFileSync(new URL('../../legacy/baseline-save-samples/01-low-warrior.json', import.meta.url), 'utf8')
const midSlots = readFileSync(new URL('../../legacy/baseline-save-samples/02-mid-cleric.json', import.meta.url), 'utf8')
const highSlots = readFileSync(new URL('../../legacy/baseline-save-samples/03-high-wizard.json', import.meta.url), 'utf8')
const updateBaselineScreenshots = process.env.UPDATE_P0_BASELINE === '1'

async function enterSingleCharacter(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: '进入本地修仙界' }).click()
  await page.getByRole('button', { name: '进入修仙界' }).click()
}

test('中等级样本可完成背包对比、六槽装备、功法与挂机方案操作', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes('mobile'))
  const pageErrors: Error[] = []
  page.on('pageerror', (error) => pageErrors.push(error))
  const slots = JSON.parse(midSlots) as Array<Record<string, any> | null>
  slots[0]!.spellCooldowns = { greater_heal: Date.now() + 60_000 }
  await page.addInitScript((raw) => localStorage.setItem('EmberQuest_slots', raw), JSON.stringify(slots))
  await enterSingleCharacter(page)

  await page.getByRole('button', { name: '储物袋' }).first().click()
  const inventory = page.locator('.content-panel').filter({
    has: page.getByRole('heading', { name: '储物袋', exact: true }),
  })
  await expect(inventory).toBeVisible()
  await inventory.getByRole('heading', { name: '符纹法锤', exact: true }).click()
  await expect(page.getByLabel('物品详情与装备对比').getByText('当前装备')).toBeVisible()
  await page.getByLabel('物品详情与装备对比').getByRole('button', { name: '锁定' }).click()
  await page.waitForTimeout(50)
  expect(pageErrors).toEqual([])
  await expect(page.getByLabel('物品详情与装备对比').getByRole('button', { name: '出售' })).toBeDisabled()
  await page.getByLabel('物品详情与装备对比').getByRole('button', { name: '取消锁定' }).click()
  await page.getByLabel('物品详情与装备对比').getByRole('button', { name: '取消收藏' }).click()
  await page.getByLabel('物品详情与装备对比').getByRole('button', { name: '出售' }).click()
  await expect(page.getByRole('heading', { name: '出售物品' })).toBeVisible()
  await page.getByRole('button', { name: '确认出售' }).click()
  await expect(inventory.getByText('5 / 40 格')).toBeVisible()

  await page.getByRole('button', { name: '随身装备' }).first().click()
  await expect(page.locator('.equipment-slot')).toHaveCount(6)
  await expect(page.getByRole('heading', { name: '随身装备' })).toBeVisible()

  await page.getByRole('button', { name: '功法典籍' }).first().click()
  await expect(page.locator('.memory-slot-list > li')).toHaveCount(4)
  await expect(page.getByText(/调息剩余 \d+ 秒/)).toBeVisible()
  const firstAuto = page.locator('.memory-slot-list input[type="checkbox"]').first()
  await firstAuto.uncheck()
  await expect(firstAuto).not.toBeChecked()
  await page.getByRole('button', { name: '取消铭刻' }).first().click()
  await expect(page.getByText('空功法位').first()).toBeVisible()

  await page.getByRole('button', { name: '保存挂机方案 2' }).click()
  await expect(page.getByText('挂机方案 2 已保存。')).toBeVisible()
  await page.getByLabel('挂机设置').getByRole('button', { name: '读取' }).nth(1).click()
  await expect(page.getByText('已读取挂机方案 2。')).toBeVisible()
  await page.getByLabel('挂机设置').getByRole('button', { name: '开始挂机' }).click()
  await expect(page.getByLabel('挂机设置').getByText('运行中')).toBeVisible()
  await page.getByLabel('挂机设置').getByRole('button', { name: '停止挂机' }).click()
  await expect(page.getByLabel('挂机设置').getByText('已停止')).toBeVisible()

  await page.getByRole('button', { name: '设置' }).first().click()
  await page.getByLabel('选择本地存档文件').setInputFiles(fileURLToPath(new URL('../../legacy/baseline-save-samples/01-low-warrior.json', import.meta.url)))
  await expect(page.getByRole('button', { name: 'Choose File' })).toHaveCount(0)
  await expect(page.locator('.compatibility-list code')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: '1 位修士可导入' })).toBeVisible()
  await expect(page.getByText('1 个同槽冲突')).toBeVisible()
  await page.getByRole('button', { name: '创建快照' }).click()
  await expect(page.getByText('手动快照').first()).toBeVisible()
})

test('高等级样本可领取离线收益并挑战中文区域首领', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes('mobile'))
  const pageErrors: Error[] = []
  page.on('pageerror', (error) => pageErrors.push(error))
  const slots = JSON.parse(highSlots) as Array<Record<string, any> | null>
  slots[0]!.afkEnabled = true
  slots[0]!.lastAfkAt = Date.now() - 10 * 60_000
  slots[0]!.bossCooldowns = {}
  await page.addInitScript((raw) => localStorage.setItem('EmberQuest_slots', raw), JSON.stringify(slots))
  await enterSingleCharacter(page)

  await expect(page.getByLabel('离线收益')).toBeVisible()
  await expect(page.getByLabel('离线收益')).toContainText('修为')
  await expect(page.getByLabel('离线收益')).toContainText('符纹')
  if (updateBaselineScreenshots) {
    await page.screenshot({
      path: fileURLToPath(new URL('../../legacy/baseline-screenshots/11-native-offline-summary.png', import.meta.url)),
      fullPage: true,
    })
  }
  await page.getByRole('button', { name: '领取并继续' }).click()

  await page.getByRole('button', { name: '历练区域' }).first().click()
  const currentZone = page.locator('.zone-row').filter({ has: page.getByRole('heading', { name: '赤焰荒原' }) })
  await expect(currentZone).toContainText('首领：惊魂巨兽')
  await currentZone.getByRole('button', { name: '挑战首领' }).click()
  await page.waitForTimeout(50)
  expect(pageErrors).toEqual([])
  await expect(page.getByRole('heading', { name: '斗法场景' })).toBeVisible()
  await expect(page.locator('.legacy-mob-heading').getByText('【区域首领】惊魂巨兽', { exact: true })).toBeVisible()
  await expect(page.locator('iframe')).toHaveCount(0)
})

test('390px 移动端保留 HUD、底部导航且无横向溢出', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes('mobile'))
  await page.addInitScript((raw) => localStorage.setItem('EmberQuest_slots', raw), lowSlots)
  await enterSingleCharacter(page)

  await expect(page.getByRole('navigation', { name: '移动端功能导航' })).toBeVisible()
  if (updateBaselineScreenshots) {
    await page.screenshot({
      path: fileURLToPath(new URL('../../legacy/baseline-screenshots/12-native-mobile-390.png', import.meta.url)),
      fullPage: true,
    })
  }
  await page.getByRole('navigation', { name: '移动端功能导航' }).getByRole('button', { name: '储物袋' }).click()
  await expect(page.getByRole('heading', { name: '储物袋', exact: true })).toBeVisible()
  const metrics = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.body.scrollWidth }))
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.width)
})
