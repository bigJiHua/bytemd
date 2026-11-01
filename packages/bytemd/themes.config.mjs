// ByteMD 官方主题色板(单一事实源)。
//
// 设计原则(与 juejin-markdown-themes 的逐主题硬编码相对):
//   1. 主题 = markdown.css 之上的稀疏变量预设 —— 结构/排版/自定义块样式全部来自
//      markdown.css 与 custom-blocks.css,主题只声明"彩色身份"(中性色 + 强调色),
//      ~20 个 token/主题;juejin 主题每份 ~8.8KB 全量硬编码且互相复制。
//   2. 语义色恒定 —— callout(success/warning/info/danger)与 timeline 家族是语义
//      信息色,跨主题保持默认(element-plus 系 hues),保证可读性与一致性;主题
//      可以按契约覆盖它们,但官方预设不覆盖。
//   3. 亮色主题免配暗色 —— 宿主容器带 .dark / [data-theme='dark'] 时,
//      markdown.css 的暗色 token 块(0-2-0 特异性)自动压过主题(0-1-0)。
//   4. 排版归宿主 —— 字号/行高由宿主(--md-font-size/--md-line-height 或站点层)
//      决定,官方主题不碰排版三要素。
//
// 消费方式:
//   a) 链接置换(站点现状):`<link href="bytemd/themes/verdant.min.css">` 挂到
//      markdown.css 之后;
//   b) 属性切换(免重载):引 `themes/all.css`,宿主在 .markdown-body 上写
//      `data-bytemd-theme="<id>"` 即时切换。
// 主题文件必须晚于 markdown.css / custom-blocks.css 引入(预设覆盖默认值)。

export const officialThemes = [
  {
    id: 'daylight',
    label: 'Daylight · 日光',
    dark: false,
    tokens: {
      '--md-text': '#1f2d3d',
      '--md-muted': '#64748b',
      '--md-border': '#e2e8f0',
      '--md-border-soft': '#eff4f9',
      '--md-border-strong': '#cbd5e1',
      '--md-bg-soft': '#f5f8fc',
      '--md-surface': '#ffffff',
      '--md-link': '#2563eb',
      '--md-link-hover': '#1d4ed8',
      '--md-accent': '#2563eb',
      '--md-quote-border': '#93c5fd',
      '--md-code-bg': '#f6f8fb',
      '--md-inline-code-bg': 'rgba(37, 99, 235, 0.08)',
      '--md-code-header-bg': 'rgba(37, 99, 235, 0.05)',
      '--md-copy-color': '#4b5c74',
      '--md-copy-bg': 'rgba(255, 255, 255, 0.85)',
      '--md-copy-border': '#cbd5e1',
    },
  },
  {
    id: 'verdant',
    label: 'Verdant · 苍翠',
    dark: false,
    tokens: {
      '--md-text': '#1d2a22',
      '--md-muted': '#5f7a6a',
      '--md-border': '#dfe9e2',
      '--md-border-soft': '#edf4ef',
      '--md-border-strong': '#b9cfc2',
      '--md-bg-soft': '#f4f9f6',
      '--md-surface': '#ffffff',
      '--md-link': '#2f845e',
      '--md-link-hover': '#256d4e',
      '--md-accent': '#2b7a4b',
      '--md-quote-border': '#86c8a3',
      '--md-code-bg': '#f4f9f6',
      '--md-inline-code-bg': 'rgba(43, 122, 75, 0.09)',
      '--md-code-header-bg': 'rgba(43, 122, 75, 0.06)',
      '--md-copy-color': '#4e6657',
      '--md-copy-bg': 'rgba(255, 255, 255, 0.85)',
      '--md-copy-border': '#b9cfc2',
    },
  },
  {
    id: 'azure',
    label: 'Azure · 湛蓝',
    dark: false,
    tokens: {
      '--md-text': '#14262e',
      '--md-muted': '#5b7a86',
      '--md-border': '#dce9ee',
      '--md-border-soft': '#ebf4f7',
      '--md-border-strong': '#b3ccd6',
      '--md-bg-soft': '#f2f9fb',
      '--md-surface': '#ffffff',
      '--md-link': '#0891b2',
      '--md-link-hover': '#0e7490',
      '--md-accent': '#0e7490',
      '--md-quote-border': '#7dd3e8',
      '--md-code-bg': '#f2f9fb',
      '--md-inline-code-bg': 'rgba(14, 116, 144, 0.09)',
      '--md-code-header-bg': 'rgba(14, 116, 144, 0.05)',
      '--md-copy-color': '#48626c',
      '--md-copy-bg': 'rgba(255, 255, 255, 0.85)',
      '--md-copy-border': '#b3ccd6',
    },
  },
  {
    id: 'sunset',
    label: 'Sunset · 暮橙',
    dark: false,
    tokens: {
      '--md-text': '#2d2420',
      '--md-muted': '#8a7264',
      '--md-border': '#f0e4dc',
      '--md-border-soft': '#f9efe8',
      '--md-border-strong': '#e2c4b0',
      '--md-bg-soft': '#fdf6f2',
      '--md-surface': '#ffffff',
      '--md-link': '#ea580c',
      '--md-link-hover': '#c2410c',
      '--md-accent': '#ea580c',
      '--md-quote-border': '#fdba8c',
      '--md-code-bg': '#fdf6f2',
      '--md-inline-code-bg': 'rgba(234, 88, 12, 0.08)',
      '--md-code-header-bg': 'rgba(234, 88, 12, 0.05)',
      '--md-copy-color': '#7a6a5f',
      '--md-copy-bg': 'rgba(255, 255, 255, 0.85)',
      '--md-copy-border': '#e2c4b0',
    },
  },
  {
    id: 'violet',
    label: 'Violet · 雾紫',
    dark: false,
    tokens: {
      '--md-text': '#241f33',
      '--md-muted': '#6f6a8a',
      '--md-border': '#e6e2f2',
      '--md-border-soft': '#f0edf9',
      '--md-border-strong': '#c4bce4',
      '--md-bg-soft': '#f7f5fc',
      '--md-surface': '#ffffff',
      '--md-link': '#7c3aed',
      '--md-link-hover': '#6d28d9',
      '--md-accent': '#7c3aed',
      '--md-quote-border': '#c4b5fd',
      '--md-code-bg': '#f7f5fc',
      '--md-inline-code-bg': 'rgba(124, 58, 237, 0.08)',
      '--md-code-header-bg': 'rgba(124, 58, 237, 0.05)',
      '--md-copy-color': '#5f5a78',
      '--md-copy-bg': 'rgba(255, 255, 255, 0.85)',
      '--md-copy-border': '#c4bce4',
    },
  },
  {
    id: 'rose',
    label: 'Rose · 蔷薇',
    dark: false,
    tokens: {
      '--md-text': '#2d1f26',
      '--md-muted': '#8a6574',
      '--md-border': '#f2e0e6',
      '--md-border-soft': '#faedf1',
      '--md-border-strong': '#e5b8c6',
      '--md-bg-soft': '#fdf4f6',
      '--md-surface': '#ffffff',
      '--md-link': '#e11d48',
      '--md-link-hover': '#be123c',
      '--md-accent': '#e11d48',
      '--md-quote-border': '#fda4af',
      '--md-code-bg': '#fdf4f6',
      '--md-inline-code-bg': 'rgba(225, 29, 72, 0.08)',
      '--md-code-header-bg': 'rgba(225, 29, 72, 0.05)',
      '--md-copy-color': '#7a5c67',
      '--md-copy-bg': 'rgba(255, 255, 255, 0.85)',
      '--md-copy-border': '#e5b8c6',
    },
  },
  {
    id: 'ink',
    label: 'Ink · 玄墨',
    dark: true,
    tokens: {
      '--md-text': '#e6edf3',
      '--md-muted': '#9ba7b4',
      '--md-border': '#3d444d',
      '--md-border-soft': '#30363d',
      '--md-border-strong': '#484f58',
      '--md-bg-soft': '#161b22',
      '--md-surface': '#0d1117',
      '--md-link': '#79c0ff',
      '--md-link-hover': '#a5d6ff',
      '--md-accent': '#79c0ff',
      '--md-quote-border': '#484f58',
      '--md-code-bg': '#161b22',
      '--md-inline-code-bg': 'rgba(110, 118, 129, 0.4)',
      '--md-code-header-bg': 'rgba(255, 255, 255, 0.05)',
      '--md-copy-color': '#c9d1d9',
      '--md-copy-bg': 'rgba(30, 35, 42, 0.85)',
      '--md-copy-border': '#444c56',
      '--md-callout-default-bg': 'rgba(64, 158, 255, 0.14)',
      '--md-callout-default-text': '#a0cfff',
      '--md-callout-success-bg': 'rgba(103, 194, 58, 0.14)',
      '--md-callout-success-text': '#b3e19d',
      '--md-callout-warning-bg': 'rgba(230, 162, 60, 0.16)',
      '--md-callout-warning-text': '#f3d19e',
      '--md-callout-info-bg': 'rgba(144, 147, 153, 0.16)',
      '--md-callout-info-text': '#c8c9cc',
      '--md-callout-danger-bg': 'rgba(245, 108, 108, 0.16)',
      '--md-callout-danger-text': '#fab6b6',
      '--md-timeline-line': '#3b4148',
      '--md-timeline-doing-line': 'rgba(120, 170, 255, 0.18)',
      '--md-timeline-dashed': '#3b4148',
      '--md-timeline-done': '#69db7c',
      '--md-timeline-doing': '#8ce99a',
      '--md-timeline-error': '#ff8787',
      '--md-timeline-error-text': '#ff8787',
      '--md-timeline-milestone': '#ffc078',
      '--md-timeline-milestone-text': '#ffc078',
      '--md-timeline-done-bg': 'rgba(64, 192, 87, 0.16)',
      '--md-timeline-doing-bg': 'rgba(43, 122, 75, 0.22)',
      '--md-timeline-todo-bg': 'rgba(144, 147, 153, 0.16)',
      '--md-timeline-error-bg': 'rgba(245, 108, 108, 0.16)',
      '--md-timeline-milestone-bg': 'rgba(230, 162, 60, 0.16)',
      '--md-timeline-todo-text': '#aab4be',
      '--md-timeline-hover': 'rgba(104, 211, 145, 0.12)',
    },
  },
]

/**
 * 暗色主题的画布声明:亮色宿主页面上,暗色预设必须自绘底色,否则白字落白底不可读。
 * canvas 是结构性最小集(底色/圆角/color-scheme),仍不是完整主题样式。
 */
function canvasLines(theme, indent) {
  if (!theme.dark) return []
  return [
    `${indent}background-color: var(--md-surface);`,
    `${indent}color-scheme: dark;`,
    `${indent}border-radius: var(--md-radius);`,
  ]
}

/**
 * 生成单主题 CSS(仅变量预设,作用于 .markdown-body)。
 * 输出形态与 markdown.css 的 token 契约一一对应,便于 diff 与审查。
 */
export function renderThemeCss(theme) {
  const lines = [
    `/* ByteMD official theme: ${theme.label} (${theme.id}) */`,
    `/* Token preset only: load AFTER markdown.css / custom-blocks.css. */`,
    `.markdown-body {`,
  ]
  for (const [name, value] of Object.entries(theme.tokens)) {
    lines.push(`  ${name}: ${value};`)
  }
  lines.push(...canvasLines(theme, '  '))
  lines.push('}', '')
  return lines.join('\n')
}

/**
 * 生成 all.css:全部主题按 data-bytemd-theme 属性作用域合并,
 * 宿主切换主题无需置换 <link>(特异性 0-2-0,压过 markdown.css 默认 0-1-0)。
 */
export function renderAllThemesCss(themes) {
  const blocks = themes.map((theme) => {
    const body = Object.entries(theme.tokens)
      .map(([name, value]) => `  ${name}: ${value};`)
      .join('\n')
    const canvas = canvasLines(theme, '  ').join('\n')
    const inner = canvas ? body + '\n' + canvas : body
    return `.markdown-body[data-bytemd-theme='${theme.id}'] {\n${inner}\n}`
  })
  const head = `/* ByteMD official themes (${themes.map((t) => t.id).join(', ')}) */\n/* Switch via .markdown-body[data-bytemd-theme='<id>'] — no <link> swap needed. */\n`
  return head + blocks.join('\n\n') + '\n'
}

/** 主题清单(manifest),供宿主/文档/切换器消费。 */
export function renderManifest(themes) {
  return (
    JSON.stringify(
      {
        version: 1,
        themes: themes.map(({ id, label, dark }) => ({ id, label, dark })),
      },
      null,
      2,
    ) + '\n'
  )
}
