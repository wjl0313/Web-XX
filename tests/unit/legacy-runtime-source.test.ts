import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { createLocalizedLegacyRuntime } from '../../src/app/legacy-runtime-source'

const frozenSource = readFileSync(
  new URL('../../legacy/fanxiulu-monolith.html', import.meta.url),
  'utf8',
)

describe('冻结页单源中文运行副本', () => {
  it('writes static labels directly and keeps reference names for dynamic display values', () => {
    const runtime = createLocalizedLegacyRuntime(frozenSource)

    expect(runtime).toMatch(/class="cs-header">\s*角色库\s*<\/div>/)
    expect(runtime).toContain('"Character Select":"角色库"')
    expect(runtime).toContain('"Create a New Character":"创建角色"')
    expect(runtime).toContain('"Human":"五行杂灵根"')
    expect(runtime).toContain('"Warrior":"炼体士"')
    expect(runtime).toContain('"STR":"根骨"')
    expect(runtime).toContain('"CON":"体魄"')
    expect(runtime).toContain('"Level":"修为等级"')
    const exactMatch = runtime.match(/  const EXACT = (\{[^\r\n]*\});/)
    expect(exactMatch).not.toBeNull()
    const runtimeDictionary = JSON.parse(exactMatch![1]) as Record<string, string>
    const runtimeKeys = Object.keys(runtimeDictionary)
    expect(runtimeKeys.length).toBeGreaterThan(1_000)
    expect(runtimeKeys.length).toBeLessThan(2_500)
    expect(runtimeDictionary.Radiant).toBe('流光')
    expect(runtimeDictionary['Bloodletter Shiv']).toBe('饮血短刃')
    expect(runtimeDictionary['the Strong']).toBe('强者')
    expect(runtimeDictionary['Voidwrack Expanse']).toBe('虚空废土')
    expect(runtimeDictionary.Slots).toBe('道册位')
    expect(runtimeDictionary['Veteran Lore']).toBe('宿世见闻')
    expect(runtimeDictionary.Soulkeeper).toBe('护魂使')
    expect(runtimeDictionary['Legacy of Might']).toBe('力极传承')
    expect(runtime).toContain('<span class="shop-section-label">灵轮机</span>')
    expect(runtime).toContain('<span class="shop-section-label">五灵斗牌</span>')
    expect(runtime).toContain('"你切换目标至"')
    expect(runtime).toContain('"你轮换目标至"')
    expect(runtime).toContain('"你横扫敌群，共造成"')
    expect(runtime).toContain('"点总伤害（消耗 "')
    expect(runtime).toContain('" 点法力）"')
    expect(runtime).not.toContain("'You switch targets to '")
    expect(runtime).not.toContain("'You cycle targets to '")
    expect(runtime).not.toContain("'You sweep the enemy pack for '")
  })

  it('uses explicit synchronous display writes without prototype hooks, observers, or delayed passes', () => {
    const runtime = createLocalizedLegacyRuntime(frozenSource)

    expect(runtime).toContain('id="fanxiulu-display-runtime"')
    expect(runtime).not.toContain('id="fanxiulu-xiuxian-localization"')
    expect(runtime).not.toContain('setTimeout(applyAll,80)')
    expect(runtime).not.toContain('setTimeout(applyAll,500)')
    expect(runtime).not.toContain('setTimeout(applyAll,1800)')
    expect(runtime).toContain("const normalized = content.replace(/\\s+/g, ' ')")
    expect(runtime).toContain("value = value.replace(/^Step\\s+(\\d+)\\s+of\\s+(\\d+)$/i, '第 $1 步，共 $2 步')")
    expect(runtime).toContain('let value = applyDynamicDisplayPatterns(content)')
    expect(runtime).toContain('let value = applyDynamicDisplayPatterns(content);')
    expect(runtime).toContain('row.textContent = window.__fanxiuluDisplayText("创建角色")')
    expect(runtime).toContain('text.textContent = window.__fanxiuluDisplayText(message)')
    expect(runtime).toContain('window.__fanxiuluDisplayHtml')
    expect(runtime).not.toContain("Object.getOwnPropertyDescriptor(Node.prototype, 'textContent')")
    expect(runtime).not.toContain("Object.defineProperty(Node.prototype, 'textContent'")
    expect(runtime).not.toContain('Element.prototype.setAttribute =')
    expect(runtime).not.toContain('Document.prototype.createTextNode =')
    expect(runtime.match(/new MutationObserver/g)).toBeNull()
    expect(frozenSource).toContain('"Create a New Character":"开辟新道途"')
    expect(frozenSource).toContain('setTimeout(applyAll,80)')
  })

  it('directly writes high-priority hidden-panel labels in the generated copy', () => {
    const runtime = createLocalizedLegacyRuntime(frozenSource)
    const withoutDisplayDictionary = runtime.replace(
      /\s*<script id="fanxiulu-display-runtime">[\s\S]*?<\/script>\s*/,
      '\n',
    )
    const staticUi = withoutDisplayDictionary
      .replace(/<script\b[\s\S]*?<\/script\s*>/gi, '')
      .replace(/<style\b[\s\S]*?<\/style\s*>/gi, '')

    expect(staticUi).toContain('按分类折叠整理')
    expect(staticUi).toContain('静音全部声音')
    expect(staticUi).toContain('进入秘境')
    expect(staticUi).toContain('查找战报')
    expect(staticUi).toContain('坊市商贩')
    expect(staticUi).not.toContain('organized into collapsible containers')
    expect(staticUi).not.toContain('Mute all sound')
    expect(staticUi).not.toContain('Search combat log...')
    expect(staticUi).not.toContain('Village Merchant')
  })

  it('fails closed when the frozen localization contract is missing', () => {
    expect(() => createLocalizedLegacyRuntime('<html></html>'))
      .toThrow('冻结单体中缺少可识别的中文显示词典。')
  })
})
