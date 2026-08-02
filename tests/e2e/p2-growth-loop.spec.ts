import { expect, test, type Page } from '@playwright/test'

async function createP2Character(page: Page, name: string) {
  await page.goto('/')
  await page.getByRole('button', { name: '进入本地修仙界' }).click()
  await page.getByRole('button', { name: '槽位 1 创建角色' }).click()
  const creator = page.locator('.legacy-create-backdrop')
  await creator.getByRole('button', { name: /^天灵根\s+天灵根 · 5 种组合$/ }).click()
  await creator.getByRole('button', { name: '火天灵根', exact: true }).click()
  await expect(creator).toContainText('可学属性火')
  await page.getByRole('button', { name: '下一步' }).click()
  await page.getByRole('button', { name: '五行法修', exact: true }).click()
  await expect(page.locator('.legacy-create-backdrop')).toContainText('本槽位固定提供以下三个天赋，不提供重抽')
  await expect(page.locator('.legacy-create-backdrop').getByText(/^主：/)).toHaveCount(3)
  await page.getByRole('button', { name: '下一步' }).click()
  await page.getByRole('button', { name: '下一步' }).click()
  await page.getByPlaceholder('至少两个字符').fill(name)
  await page.getByRole('button', { name: '创建并进入' }).click()
  await expect(page.getByRole('heading', { name })).toBeVisible()
}

test('P2 成长、自动历练、秘境、洞府和炼丹保持在旧页面原位置', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes('mobile'))
  const pageErrors: Error[] = []
  page.on('pageerror', (error) => pageErrors.push(error))
  await createP2Character(page, '闭环青岚')

  const status = page.getByLabel('角色状态')
  await expect(status).toContainText('火天灵根')
  await expect(status).toContainText('炼气一层')
  await expect(status).toContainText('主天赋')
  await expect(status).toContainText('副天赋')
  await expect(status.getByLabel('成长策略')).toHaveValue('balanced')
  await expect(status.getByRole('button', { name: '突破境界' })).toBeDisabled()

  const afk = page.getByLabel('挂机设置')
  await expect(afk).toContainText('冲击境界')
  await expect(afk).toContainText('寻找功法')
  await expect(afk).toContainText('气血丹阈值')
  await expect(afk).toContainText('离线最多结算 8 小时')

  const tabs = page.getByRole('navigation', { name: '游戏功能' })
  await tabs.getByRole('button', { name: '历练区域' }).click()
  await expect(page.getByText('幽竹秘境', { exact: true })).toBeVisible()
  await expect(page.getByText('单人二十层 · 每五层首领 · 死亡退回检查点')).toBeVisible()

  await tabs.getByRole('button', { name: '功法典籍' }).click()
  await expect(page.getByText('洞府参悟', { exact: true })).toBeVisible()
  await expect(page.getByText('单功法队列')).toBeVisible()
  await expect(page.getByRole('button', { name: '开始参悟' })).toBeVisible()

  await tabs.getByRole('button', { name: '储物袋' }).click()
  await expect(page.getByText('简化炼丹', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '加入炼丹队列' })).toBeVisible()

  await tabs.getByRole('button', { name: '设置' }).click()
  await expect(page.getByRole('heading', { name: '云存档与异步斗法' })).toBeVisible()
  await expect(page.getByText('当前构建未配置云环境。')).toBeVisible()
  expect(pageErrors).toEqual([])
})

test('P2 移动端可访问核心二级页面且无横向溢出', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes('mobile'))
  await createP2Character(page, '移动青岚')
  const navigation = page.getByRole('navigation', { name: '移动端功能导航' })
  await expect(navigation).toBeVisible()

  await navigation.getByRole('button', { name: '历练区域' }).click()
  await expect(page.getByText('幽竹秘境', { exact: true })).toBeVisible()
  await navigation.getByRole('button', { name: '功法典籍' }).click()
  await expect(page.getByText('洞府参悟', { exact: true })).toBeVisible()
  await navigation.getByRole('button', { name: '储物袋' }).click()
  await expect(page.getByText('简化炼丹', { exact: true })).toBeVisible()

  const metrics = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scrollWidth: document.body.scrollWidth,
  }))
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.width)
})
