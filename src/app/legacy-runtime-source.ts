import { parse } from '@babel/parser'

import { getCultivationTextMap } from '../game-core/data/localization.zh-cn'

const EXACT_DECLARATION = /  const EXACT = (\{[^\r\n]*\});/
const LEGACY_LOCALIZATION_SCRIPT = /\s*<script id="fanxiulu-xiuxian-localization">[\s\S]*?<\/script>\s*/
const STATIC_HTML_TOKEN = /<!--[\s\S]*?-->|<script\b[\s\S]*?<\/script\s*>|<style\b[\s\S]*?<\/style\s*>|<[^>]+>|[^<]+/gi
const TEXT_ATTRIBUTE = /(\s(?:title|placeholder|aria-label|alt)=)(["'])([\s\S]*?)\2/gi
const SCRIPT_BLOCK = /(<script\b[^>]*>)([\s\S]*?)(<\/script\s*>)/gi

const STATIC_CONTEXT_REPLACEMENTS: ReadonlyArray<readonly [string, string]> = [
  [
    '<span class="shop-section-label">Slots</span>',
    '<span class="shop-section-label">灵轮机</span>',
  ],
]

type LooseAstNode = {
  type: string
  start?: number | null
  end?: number | null
  [key: string]: unknown
}

type SourceReplacement = {
  start: number
  end: number
  value: string
}

function applyDynamicDisplayPatterns(value = '') {
  let output = value

  output = output.replace(/^You were (.+) away in (.+)$/i, (_match, duration, zone) => {
    const localizedDuration = String(duration)
      .replace(/(\d+)m\b/g, '$1 分')
      .replace(/(\d+)s\b/g, '$1 秒')
    return `你离开了 ${localizedDuration}，期间在${zone}自动历练。`
  })
  output = output.replace(/^(\d+)\s+potions owned$/i, '现有 $1 瓶丹药')
  output = output.replace(/^(\d+)\s+machines\s*·\s*5 reels\s*·\s*wilds, scatters\s*&\s*free spins!$/i, '$1 台灵轮机 · 五列转轮 · 含百搭、散布与免费旋转')
  output = output.replace(/^Welcome to the (?:Golden Ember Casino|金焰赌石坊) — your (?:gold|灵石): ([\d,]+)(?:g|\s*灵石)\. Spin, scratch, draw, bluff, guess, or roll for (?:gold|灵石) and chase rewards\.$/i, '欢迎来到金焰赌石坊——你持有 $1 枚灵石。可旋转、刮符、斗牌、猜签或掷骰赢取奖励。')
  output = output.replace(/^(?:Faction|声望):\s*(.+?)\s*\((-?\d+)\)\s*·\s*(?:Occultist services available\.|淬炼服务现已开放。)$/i, '声望：$1（$2）· 淬炼服务现已开放。')
  output = output.replace(/^(?:Showing|正在查看)\s*(.+?)\s*·\s*(?:Slots|道册位|格位)\s*(\d+)-(\d+)\s*·\s*(?:Total items|物品总数):\s*(\d+)/i, '正在查看 $1 · 格位 $2–$3 · 物品总数：$4')
  output = output.replace(/^All bags\s*·\s*(\d+)\s+items?$/i, '全部储物袋 · $1 件物品')
  output = output.replace(/\s*·\s*(?:Active Sets|生效套装):\s*(.+?)\s*\(\+(\d+)\s*(?:ATK|攻击),\s*\+(\d+)\s*(?:DEF|防御)\)$/i, ' · 生效套装：$1（攻击 +$2，防御 +$3）')
  output = output.replace(/^Step\s+(\d+)\/(\d+)/i, '第 $1/$2 阶段')
  output = output.replace(/^Objective:\s*/i, '目标：')
  output = output.replace(/^History zone:\s*/i, '历练区域：')
  output = output.replace(/^Zone:\s*/i, '区域：')
  output = output.replace(/\bLv\s+(\d+)(?:\s*[–-]\s*(\d+))?/gi, (_match, minimum, maximum) => (
    maximum ? `等级 ${minimum}–${maximum}` : `等级 ${minimum}`
  ))
  output = output.replace(/\s*·\s*You are here\b/gi, ' · 你在此处')
  output = output.replace(/\s*—\s*Ready to claim in Quests\b/gi, '——可前往委托领取')
  output = output.replace(/^casts\s+(.+?)\s+on$/i, '施展$1攻击')
  output = output.replace(/^casts\s+(.+?)\s+and heals$/i, '施展$1并疗愈')
  output = output.replace(/^attacks$/i, '攻击')
  output = output.replace(/^ambushes$/i, '突袭')
  output = output.replace(/^Shards:\s*Common\s+(\d+)\s*·\s*Magic\s+(\d+)\s*·\s*Rare\s+(\d+)\s*·\s*Epic\s+(\d+)$/i, '炼材碎片：凡品 $1 · 灵品 $2 · 珍品 $3 · 极品 $4')
  output = output.replace(/^Cost:\s*10 Common\s*\+\s*6 Magic\s*\+\s*2 Rare\s*\+\s*([\d,]+)g$/i, '消耗：10 凡品碎片 + 6 灵品碎片 + 2 珍品碎片 + $1 灵石')
  output = output.replace(/^From\s+([\d,]+)g$/i, '起步价：$1 灵石')
  output = output.replace(/^Offer gold for \+(\d+) faction \(daily cap (\d+)\)\.$/i, '供奉灵石可获得 $1 点声望（每日上限 $2）。')
  output = output.replace(/^([\d,]+)g\s*·\s*Remaining today:\s*(\d+|MAXED)$/i, (_match, gold, remaining) => (
    remaining === 'MAXED'
      ? `${gold} 灵石 · 今日已达上限`
      : `${gold} 灵石 · 今日剩余 ${remaining} 次`
  ))
  output = output.replace(/^Permanently change your character's name\. Current:\s*(.+)$/i, '永久更改当前道号。现用道号：$1')
  output = output.replace(/^Change your race\. Must be compatible with (.+?)\. Current:\s*(.+)$/i, '更换灵根与体质，需与$1兼容。当前：$2')

  const generatedItem = /^([\u3400-\u9fffA-Za-z'· -]+)\s+of\s+([\u3400-\u9fffA-Za-z'· -]+?)(\s+\[E\d+\])?$/.exec(output)
  if (generatedItem && /[\u3400-\u9fff]/.test(output) && output.length <= 72) {
    const left = generatedItem[1].trim().replace(/([\u3400-\u9fff])\s+([\u3400-\u9fff])/g, '$1·$2')
    const right = generatedItem[2].trim().replace(/([\u3400-\u9fff])\s+([\u3400-\u9fff])/g, '$1·$2')
    output = `${left}·${right}${generatedItem[3] || ''}`
  }

  return output
}

function createDisplayTranslator(textMap: Readonly<Record<string, string>>): (value: string) => string {
  const entries = Object.entries(textMap)
    .filter(([from, to]) => (
      from
      && from !== to
      && from === from.trim()
      && /[A-Za-z]/.test(from)
      && !['and', 'the', 'for', 'of', 'to', 'in', 'on', 'or'].includes(from.toLowerCase())
    ))
    .sort((a, b) => b[0].length - a[0].length)

  return (value: string): string => {
    const rawWhole = textMap[value]
    if (rawWhole !== undefined) return rawWhole
    const whitespace = value.match(/^(\s*)([\s\S]*?)(\s*)$/)
    if (!whitespace) return value
    const [, leading, content, trailing] = whitespace
    const normalized = content.replace(/\s+/g, ' ')
    const lookupLabel = normalized.replace(/&amp;/g, '&')
    const wholeLabel = textMap[lookupLabel]
    if (wholeLabel !== undefined) return `${leading}${wholeLabel}${trailing}`
    if (!/[A-Za-z]/.test(content)) return value

    let translated = applyDynamicDisplayPatterns(content)
    for (const [from, to] of entries) {
      if (!translated.includes(from)) continue
      translated = /^[A-Za-z]+$/.test(from)
        ? translated.replace(new RegExp(`\\b${from}\\b`, 'g'), to)
        : translated.split(from).join(to)
    }
    translated = textMap[translated] ?? translated
    translated = translated.replace(/^(Collapse|Expand)\s+(.+)$/, (_match, action: string, target: string) => (
      `${action === 'Collapse' ? '收起' : '展开'}${target}`
    ))
    translated = translated.replace(/^Go:\s*(.+)$/, '前往：$1')
    translated = translated.replace(/^欢迎回来，\s*(.+)!\s*You are in\s*(.+)\.$/, '欢迎回来，$1！当前位于$2。')
    translated = translated.replace(/^!\s*You are in\s*(.+)\.$/, '！当前位于$1。')
    translated = translated.replace(/^(🔥\s*)?Login streak Day\s+(\d+):\s*\+([\d,]+)(?:g|\s*灵石)$/i, '$1连续登录第 $2 日：获得 $3 枚灵石')
    translated = translated.replace(/^(⬆\s*)?修为等级\s+(\d+)!\s*气血,\s*法力\s+and stats increased\.$/i, '$1修为等级提升至 $2！气血、法力与属性均已提升。')
    translated = translated
      .replace(/^Step\s+(\d+)\s+of\s+(\d+)$/i, '第 $1 步，共 $2 步')
      .replace(/^([\d.]+)s\s*\/\s*action$/i, '每 $1 秒行动一次')
      .replace(/^(\d+)\s+pots?$/i, '$1 瓶')
      .replace(/^Bag\s+(\d+)\s+\((\d+)\)$/i, '储物袋 $1（$2 格）')
    translated = applyDynamicDisplayPatterns(translated)
    return `${leading}${translated}${trailing}`
  }
}

function createExactDisplayTranslator(textMap: Readonly<Record<string, string>>): (value: string) => string {
  return (value: string): string => {
    const rawWhole = textMap[value]
    if (rawWhole !== undefined) return rawWhole
    const whitespace = value.match(/^(\s*)([\s\S]*?)(\s*)$/)
    if (!whitespace) return value
    const [, leading, content, trailing] = whitespace
    const normalized = content.replace(/\s+/g, ' ').replace(/&amp;/g, '&')
    const wholeLabel = textMap[normalized]
    return wholeLabel === undefined ? value : `${leading}${wholeLabel}${trailing}`
  }
}

function localizeStaticHtml(
  source: string,
  translate: (value: string) => string,
): string {
  return source.replace(STATIC_HTML_TOKEN, (token) => {
    if (/^<!--|^<script\b|^<style\b/i.test(token)) return token
    if (token.startsWith('<')) {
      return token.replace(TEXT_ATTRIBUTE, (_match, prefix: string, quote: string, value: string) => (
        `${prefix}${quote}${translate(value)}${quote}`
      ))
    }
    return translate(token)
  })
}

function localizeKnownStaticContexts(source: string): string {
  return STATIC_CONTEXT_REPLACEMENTS.reduce(
    (output, [from, to]) => output.split(from).join(to),
    source,
  )
}

function isAstNode(value: unknown): value is LooseAstNode {
  return !!value && typeof value === 'object' && typeof (value as LooseAstNode).type === 'string'
}

function walkAst(node: LooseAstNode, visit: (candidate: LooseAstNode) => void): void {
  visit(node)
  for (const [key, value] of Object.entries(node)) {
    if (key === 'loc' || key === 'extra' || key === 'errors') continue
    if (Array.isArray(value)) {
      value.forEach((entry) => {
        if (isAstNode(entry)) walkAst(entry, visit)
      })
    } else if (isAstNode(value)) {
      walkAst(value, visit)
    }
  }
}

function memberName(node: unknown): string | null {
  if (!isAstNode(node) || node.type !== 'MemberExpression') return null
  const property = node.property
  if (!isAstNode(property)) return null
  if (property.type === 'Identifier' && node.computed !== true) return String(property.name)
  if (property.type === 'StringLiteral') return String(property.value)
  return null
}

function callMemberName(node: LooseAstNode): string | null {
  if (node.type !== 'CallExpression') return null
  return memberName(node.callee)
}

function callName(node: LooseAstNode): string | null {
  if (node.type !== 'CallExpression' || !isAstNode(node.callee)) return null
  if (node.callee.type === 'Identifier') return String(node.callee.name)
  return memberName(node.callee)
}

function nodeRange(node: unknown): { start: number; end: number } | null {
  if (!isAstNode(node) || typeof node.start !== 'number' || typeof node.end !== 'number') return null
  return { start: node.start, end: node.end }
}

function applySourceReplacements(source: string, replacements: SourceReplacement[]): string {
  const unique = new Map<string, SourceReplacement>()
  replacements.forEach((replacement) => {
    unique.set(`${replacement.start}:${replacement.end}`, replacement)
  })
  return [...unique.values()]
    .sort((a, b) => b.start - a.start || b.end - a.end)
    .reduce((output, replacement) => (
      `${output.slice(0, replacement.start)}${replacement.value}${output.slice(replacement.end)}`
    ), source)
}

function parseLegacyScript(source: string): LooseAstNode {
  return parse(source, {
    sourceType: 'script',
    allowReturnOutsideFunction: true,
    errorRecovery: false,
  }) as unknown as LooseAstNode
}

function collectDisplayLiteralReplacements(
  node: unknown,
  mode: 'text' | 'html',
  source: string,
  translate: (value: string) => string,
  translateExact: (value: string) => string,
  replacements: SourceReplacement[],
  fragment = false,
): void {
  if (!isAstNode(node)) return
  if (node.type === 'StringLiteral') {
    const range = nodeRange(node)
    if (!range) return
    const original = String(node.value)
    const activeTranslate = fragment ? translateExact : translate
    const translated = mode === 'html'
      ? localizeStaticHtml(original, activeTranslate)
      : activeTranslate(original)
    if (translated !== original) {
      replacements.push({ ...range, value: JSON.stringify(translated) })
    }
    return
  }
  if (node.type === 'ArrayExpression' && Array.isArray(node.elements)) {
    node.elements.forEach((element) => collectDisplayLiteralReplacements(
      element,
      mode,
      source,
      translate,
      translateExact,
      replacements,
      true,
    ))
    return
  }
  if (node.type === 'BinaryExpression' && node.operator === '+') {
    collectDisplayLiteralReplacements(node.left, mode, source, translate, translateExact, replacements, true)
    collectDisplayLiteralReplacements(node.right, mode, source, translate, translateExact, replacements, true)
    return
  }
  if (node.type === 'ConditionalExpression') {
    collectDisplayLiteralReplacements(node.consequent, mode, source, translate, translateExact, replacements, fragment)
    collectDisplayLiteralReplacements(node.alternate, mode, source, translate, translateExact, replacements, fragment)
    return
  }
  if (node.type === 'LogicalExpression') {
    collectDisplayLiteralReplacements(node.left, mode, source, translate, translateExact, replacements, fragment)
    collectDisplayLiteralReplacements(node.right, mode, source, translate, translateExact, replacements, fragment)
    return
  }
  if (node.type === 'ParenthesizedExpression') {
    collectDisplayLiteralReplacements(node.expression, mode, source, translate, translateExact, replacements, fragment)
  }
}

function displaySink(node: LooseAstNode): { expression: LooseAstNode; mode: 'text' | 'html' } | null {
  if (node.type === 'AssignmentExpression') {
    const property = memberName(node.left)
    const expression = node.right
    if (!isAstNode(expression)) return null
    if (property === 'innerHTML') return { expression, mode: 'html' }
    if (property === 'textContent' || property === 'innerText' || property === 'title' || property === 'text') {
      return { expression, mode: 'text' }
    }
    return null
  }

  if (node.type !== 'CallExpression' || !Array.isArray(node.arguments)) return null
  const name = callMemberName(node)
  if (name === 'createTextNode') {
    const expression = node.arguments[0]
    return isAstNode(expression) ? { expression, mode: 'text' } : null
  }
  if (name === 'insertAdjacentHTML') {
    const expression = node.arguments[1]
    return isAstNode(expression) ? { expression, mode: 'html' } : null
  }
  if (name === 'setAttribute') {
    const attribute = node.arguments[0]
    const expression = node.arguments[1]
    if (!isAstNode(attribute) || attribute.type !== 'StringLiteral' || !isAstNode(expression)) return null
    return ['title', 'placeholder', 'aria-label', 'alt'].includes(String(attribute.value).toLowerCase())
      ? { expression, mode: 'text' }
      : null
  }
  return null
}

function directlyLocalizeDisplayLiterals(
  script: string,
  translate: (value: string) => string,
  translateExact: (value: string) => string,
): string {
  const ast = parseLegacyScript(script)
  const replacements: SourceReplacement[] = []
  walkAst(ast, (node) => {
    const sink = displaySink(node)
    if (sink) {
      collectDisplayLiteralReplacements(
        sink.expression,
        sink.mode,
        script,
        translate,
        translateExact,
        replacements,
      )
    }

    const directCall = callName(node)
    if (!directCall || !Array.isArray(node.arguments)) return
    const callArguments = node.arguments
    const displayArgumentIndexes = directCall === 'section'
      ? [0, 1]
      : ['log', 'showToast', '_toast', 'alert', 'confirm', 'prompt'].includes(directCall)
        ? [0]
        : []
    displayArgumentIndexes.forEach((index) => {
      collectDisplayLiteralReplacements(
        callArguments[index],
        'text',
        script,
        translate,
        translateExact,
        replacements,
        true,
      )
    })
  })
  return applySourceReplacements(script, replacements)
}

function wrapDynamicDisplayWrites(script: string): string {
  const ast = parseLegacyScript(script)
  const replacements: SourceReplacement[] = []
  walkAst(ast, (node) => {
    const sink = displaySink(node)
    if (!sink) return
    const range = nodeRange(sink.expression)
    if (!range) return
    const expressionSource = script.slice(range.start, range.end)
    if (/^window\.__fanxiuluDisplay(?:Text|Html)\(/.test(expressionSource)) return
    const helper = sink.mode === 'html' ? 'window.__fanxiuluDisplayHtml' : 'window.__fanxiuluDisplayText'
    replacements.push({ ...range, value: `${helper}(${expressionSource})` })
  })
  return applySourceReplacements(script, replacements)
}

function localizeDynamicDisplayWrites(
  source: string,
  translate: (value: string) => string,
  translateExact: (value: string) => string,
): string {
  return source.replace(SCRIPT_BLOCK, (block, openTag: string, script: string, closeTag: string) => {
    if (/\bsrc\s*=/i.test(openTag) || /\btype\s*=\s*["'](?:application\/json|application\/ld\+json)["']/i.test(openTag)) {
      return block
    }
    const withDirectLiterals = directlyLocalizeDisplayLiterals(script, translate, translateExact)
    return `${openTag}${wrapDynamicDisplayWrites(withDirectLiterals)}${closeTag}`
  })
}

function createSynchronousDisplayRuntime(textMap: Readonly<Record<string, string>>): string {
  return `<script id="fanxiulu-display-runtime">
(function() {
  'use strict';
  const EXACT = ${JSON.stringify(textMap)};
  const ATTRS = new Set(['title', 'placeholder', 'aria-label', 'alt']);
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE', 'TEXTAREA']);
  const sorted = Object.entries(EXACT).filter(([from, to]) => from && from !== to && from === from.trim() && /[A-Za-z]/.test(from) && !['and', 'the', 'for', 'of', 'to', 'in', 'on', 'or'].includes(from.toLowerCase())).sort((a, b) => b[0].length - a[0].length);
  ${applyDynamicDisplayPatterns.toString()}
  function tr(input) {
    if (input == null) return input;
    const raw = String(input);
    if (Object.prototype.hasOwnProperty.call(EXACT, raw)) return EXACT[raw];
    const whitespace = raw.match(/^(\\s*)([\\s\\S]*?)(\\s*)$/);
    if (!whitespace) return raw;
    const leading = whitespace[1], content = whitespace[2], trailing = whitespace[3];
    const normalized = content.replace(/\\s+/g, ' ');
    const lookupLabel = normalized.replace(/&amp;/g, '&');
    if (Object.prototype.hasOwnProperty.call(EXACT, lookupLabel)) return leading + EXACT[lookupLabel] + trailing;
    if (!/[A-Za-z]/.test(content)) return raw;
    let value = applyDynamicDisplayPatterns(content);
    for (const [from, to] of sorted) {
      if (!value.includes(from)) continue;
      value = /^[A-Za-z]+$/.test(from)
        ? value.replace(new RegExp('\\\\b' + from + '\\\\b', 'g'), to)
        : value.split(from).join(to);
    }
    if (Object.prototype.hasOwnProperty.call(EXACT, value)) value = EXACT[value];
    value = value.replace(/^(Collapse|Expand)\\s+(.+)$/, (_, action, target) => (action === 'Collapse' ? '收起' : '展开') + target);
    value = value.replace(/^Go:\\s*(.+)$/, '前往：$1');
    value = value.replace(/^欢迎回来，\\s*(.+)!\\s*You are in\\s*(.+)\\.$/, '欢迎回来，$1！当前位于$2。');
    value = value.replace(/^!\\s*You are in\\s*(.+)\\.$/, '！当前位于$1。');
    value = value.replace(/^(🔥\\s*)?Login streak Day\\s+(\\d+):\\s*\\+([\\d,]+)(?:g|\\s*灵石)$/i, '$1连续登录第 $2 日：获得 $3 枚灵石');
    value = value.replace(/^(⬆\\s*)?修为等级\\s+(\\d+)!\\s*气血,\\s*法力\\s+and stats increased\\.$/i, '$1修为等级提升至 $2！气血、法力与属性均已提升。');
    value = value.replace(/^Step\\s+(\\d+)\\s+of\\s+(\\d+)$/i, '第 $1 步，共 $2 步');
    value = value.replace(/^([\\d.]+)s\\s*\\/\\s*action$/i, '每 $1 秒行动一次');
    value = value.replace(/^(\\d+)\\s+pots?$/i, '$1 瓶');
    value = value.replace(/^Bag\\s+(\\d+)\\s+\\((\\d+)\\)$/i, '储物袋 $1（$2 格）');
    value = applyDynamicDisplayPatterns(value);
    return leading + value + trailing;
  }

  window.__fanxiuluDisplayText = tr;
  function translateTree(root) {
    for (const child of Array.from(root.childNodes || [])) {
      if (child.nodeType === 3) {
        child.nodeValue = tr(child.nodeValue);
      } else if (child.nodeType === 1 && !SKIP.has(child.tagName)) {
        for (const attribute of ATTRS) {
          if (child.hasAttribute(attribute)) child.setAttribute(attribute, tr(child.getAttribute(attribute)));
        }
        translateTree(child);
      }
    }
  }
  function translateHtml(value) {
    if (value == null || !/[A-Za-z]/.test(String(value))) return value;
    const template = document.createElement('template');
    template.innerHTML = String(value);
    translateTree(template.content);
    return template.innerHTML;
  }

  window.__fanxiuluDisplayHtml = translateHtml;
})();
</script>`
}

const RUNTIME_FINISH = `<script id="fanxiulu-display-runtime-finish">
(function() {
  'use strict';
  document.documentElement.lang = 'zh-CN';
  document.title = '凡修录：洞府问道';
  try {
    if (typeof buildAvatarSvg === 'function' && !window.__fanxiuluAvatarPatched) {
      const originalBuildAvatarSvg = buildAvatarSvg;
      buildAvatarSvg = function(race, id, appearance) { return originalBuildAvatarSvg('Human', id, appearance); };
      window.__fanxiuluAvatarPatched = true;
    }
  } catch (error) {
    console.warn('凡修录头像补丁未应用', error);
  }
})();
</script>`

/**
 * 从冻结文件生成实际运行的中文副本：静态文字和动态模板中的显示字面量在构建时
 * 直接写入；兼作规则 ID 的动态值只在旧版具体 DOM 写入表达式中同步转换。没有
 * 原型覆写、整页观察器、延时扫描或点击后补写；英文规则 ID 与存档字段保持原样。
 */
export function createLocalizedLegacyRuntime(source: string): string {
  const dictionaryMatch = source.match(EXACT_DECLARATION)
  if (!dictionaryMatch) throw new Error('冻结单体中缺少可识别的中文显示词典。')
  if (!LEGACY_LOCALIZATION_SCRIPT.test(source)) {
    throw new Error('冻结单体中缺少可替换的旧中文运行层。')
  }

  const embeddedText = JSON.parse(dictionaryMatch[1]) as Record<string, string>
  const effectiveText = {
    ...embeddedText,
    ...getCultivationTextMap(),
  }
  const translate = createDisplayTranslator(effectiveText)
  const translateExact = createExactDisplayTranslator(effectiveText)
  const withoutLegacyLocalization = source.replace(LEGACY_LOCALIZATION_SCRIPT, '\n')
  const withKnownStaticContexts = localizeKnownStaticContexts(withoutLegacyLocalization)
  const withLocalizedDisplayWrites = localizeDynamicDisplayWrites(
    withKnownStaticContexts,
    translate,
    translateExact,
  )
  const directlyLocalized = localizeStaticHtml(withLocalizedDisplayWrites, translate)
  const withDisplayRuntime = directlyLocalized.replace(
    '</head>',
    `${createSynchronousDisplayRuntime(effectiveText)}\n</head>`,
  )
  return withDisplayRuntime.replace('</body>', `${RUNTIME_FINISH}\n</body>`)
}
