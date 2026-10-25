# ByteMD 现代化与瘦身计划

> 范围：只改本地 fork `bigJiHua/bytemd`，不碰 Main。目标：先修正确性/安全，再砍冗余依赖与发布格式；保持现有主题/示例可用。暂缓：Svelte 5、CodeMirror 6 属于重写级迁移，不在前几阶段。

## 决策基线

- 不先动 Svelte 版本，不先动 CodeMirror 版本。
- UMD/CJS 发布格式裁剪会改变包的兼容面，等确认后再做。
- 每批修改后至少跑：`pnpm test`、`pnpm build`、playground 冒烟。
- 安全审计使用官方 registry（当前镜像的 audit 接口返回 405）。

## 阶段

### Phase 0 — 基线可测（完成）

- [x] 修复 `editor.test.ts > value` 的 CodeMirror/jsdom 挂载问题
  - 根因：Vitest 在 Node 条件下把 `svelte` 解析到 SSR 入口，`onMount/afterUpdate` 是 no-op
  - 修复：`vitest.config.mjs` 强制 `browser/module/import` condition
- [x] 修复 `editor.test.ts > plugin > editor effect`、`viewer.test.ts > plugin` 的 effect 时序
- [x] CI 固定 Node 22 / pnpm 8.15.9，`pnpm install --frozen-lockfile` + `pnpm test` + `pnpm build`

### Phase 1 — 死代码、泄漏与链接（完成）

- [x] 移除 toolbar 未使用的 `on:key` 链路
- [x] 移除未使用的 `vfile`、`icons.Callout`
- [x] 清理 ResizeObserver / 分屏拖拽 / tippy delegate 的卸载泄漏
- [x] Source 按钮、README 与 playground 链接指向 fork
- [ ] npm 包 repository/author/name 等发布元数据（Phase 3 发布前处理）

### Phase 2 — 安全依赖与小依赖（完成，残留 moderate/low）

- [x] 移除 `lodash-es`，用本地 `src/debounce.ts` 替代
- [x] `js-yaml` 升级到 `4.3.2`
- [x] `mermaid` 升级到 `11.17.2`，playground 实测通过
- [x] `katex` 升级到 `0.16.47`；仍有 6 条 moderate，需 rehype-katex 7 / unified 11 才能继续消，后置到 Phase 5
- [x] `@types/lodash-es` 移除；`@types/codemirror` / `hast` / `mdast` 因公共 `.d.ts` 引用保留，不移到 dev
- [x] 移除未直接使用的 `@popperjs/core` 直接依赖（tippy 仍带）
- [x] 移除 playground 未使用的 `github-markdown-css`
- [x] 通过 `pnpm.overrides` 把 mermaid 传递的 `lodash-es` 升到 4.18.1
- [x] 官方 registry audit：发布依赖 **high 清零**；剩 6 moderate（katex）+ 1 low（mermaid 传递的 diff）

### Phase 3 — 发布体积（待确认）

- [ ] 评估/移除 UMD；确认是否保留 CJS
- [ ] 插件包 UMD/CJS 裁剪（mermaid 的 UMD/chunk 是最大头）
- [ ] 移除 postinstall 对 package.json/tsconfig/README 的自动改写
- [ ] 评估 Lerna 移除、Node engines、pnpm 版本
- [ ] bundlewatch 改为盯 ESM/CSS

### Phase 4 — 体验与健壮性（完成）

- [x] 窄屏 tab 模式下保留全部格式/插入动作（tablist + 横向滚动动作条）
- [x] 工具栏/侧栏/分屏 handle 的键盘与 aria
  - 图标 `role=button`/`tabindex=0`/`aria-label`，Enter/Space 触发
  - 下拉项 `role=menuitem`，嵌套菜单 `aria-haspopup`；侧栏关闭按钮可聚焦
  - 分屏 handle `aria-valuenow`，方向键 ±5、Enter 复位
- [x] 自定义语法文案 i18n（en / zh_Hans，其余语言回退 en）
- [x] timeline 空行分隔解析、pinyin/accordion 解析补强
- [x] 宽表横向滚动、暗色主题 token
  - 表格在 `markdown.css` 内 `display: block; overflow-x: auto`，不做 JS wrapper（避免与 Main 重复包装）
  - `.dark .markdown-body` 覆盖文本/表面/callout/timeline 色
  - 打印隐藏工具栏属于宿主壳层职责，内容主题不接管
- [x] README 补自定义语法与主题接入（`dist/markdown.css` 可选引入）

### Phase 5 — 大版本现代化（后置）

- [ ] unified 11 / remark 11 / rehype 10 生态
- [ ] Vite/Vitest/TypeScript/Prettier/jsdom 工具链
- [ ] Svelte 5、CodeMirror 6（单独项目，不做混合迁移）

## 功能同步与开发约定

- [x] 代码复制：Svelte、React、Vue 2、Vue 3 Viewer 共用核心包导出的 `addCopyButtons` / `copyCodeFromButton`，挂载和内容更新时补充按钮，点击复制不依赖插件。
- [x] Vue 3 Viewer：监听实际渲染文件变化，向 `viewerEffect` 传递 VFile，并清理更新/卸载时的插件效果。
- [x] `maxLength` 保持提示行为：按 `value.length`（UTF-16 code units）判定超限，不阻止输入或粘贴、不截断内容；宿主按需在保存前校验。默认 `Infinity`，已同步类型注释和使用文档。
- [x] 新语法同步清单写入 README：解析/安全过滤、工具栏/帮助、样式/暗色主题、en/zh_Hans 文案/类型、示例/文档、各框架 DOM 行为及测试。
- [x] 开发文档明确 `postinstall` 自动改写范围与 `--ignore-scripts` 用法；playground 依赖生成的 `svelte/` / `dist/`，源码变更后需重新构建，测试直接读取源码。
- [x] 构建清理改为 Node 脚本，解决 Windows 下 `rm` 不存在导致 `pnpm build` 失败的问题。
- [ ] Phase 3 继续处理发布格式和 postinstall 自动改写；Phase 5 继续处理大版本迁移。

## 进度日志

- 2026-10-24：完成审计与计划；尚未开始修改。
- 2026-10-24：Phase 0 完成。全量 `pnpm test` 38/38 通过；根因是测试环境的 Svelte SSR 入口。
- 2026-10-24：Phase 1 完成。死代码/卸载泄漏清理，Source/README/演示链接改指向 fork。
- 2026-10-24：Phase 2 完成。lodash-es 移除；mermaid 11.17.2 / js-yaml 4.3.2 / katex 0.16.47；官方 audit 发布依赖 high 清零。`pnpm build` 通过；playground 实测 mermaid/KaTeX/frontmatter/时间线/手风琴/拼音正常。
- 2026-10-24：Phase 4 完成。窄屏 tab 模式保留全部动作；工具栏/侧栏/分屏 handle 键盘与 aria；自定义语法 i18n；timeline 空行块解析；宽表横向滚动与暗色 token；README/示例更新。`vitest run` 40/40，`pnpm build` 通过；浏览器实测 actions 27 个图标、tab aria、en/zh 文案与 `.dark` 计算色。截图：`.screenshots/toolbar-narrow.png`。
- 2026-10-24：新增字号控制。闭合区间 `[size=20]…[/size]`（8–96，支持嵌套与行内节点，不跨空行）；工具栏“字号”下拉 12–48，无选区包裹当前行。`vitest run` 45/45，`pnpm build` 通过，playground 实测生效。
- 2026-10-24：追加字体颜色与背景色。`[color=#e03131]…[/color]`、`[bg=#fff3bf]…[/bg]`，仅接受 3/6/8 位十六进制；工具栏两个色板下拉，与字号共用区间解析。`vitest run` 50/50，`pnpm build` 通过，playground 实测生效。
- 2026-10-25：新增带文字分割线 `---文字---`（单行、标签居中、两侧横线；标签支持行内 Markdown、字号/颜色区间和图片，图片自动限制为 2em 高/8em 宽）；普通 `---` 保持 `<hr>`，工具栏加入“文字分割线”。`vitest run` 57/57，`pnpm build` 通过，playground 实测生效。
- 2026-10-25：按需求禁用分割线图片点击放大（此前误解为要支持放大）。`@bytemd/plugin-medium-zoom` 的 filter 跳过 `.bytemd-hr-text` 内图片，普通正文图片仍可放大；分割线图片内联限高 2em/8em。57/57 测试、构建通过，浏览器实测分割线图片无 medium-zoom 类、正文图片正常。
- 2026-10-25：图片灯箱升级。暗色模糊蒙层、关闭按钮、title/alt 标题、多图计数与左右切换、键盘/焦点/滚动锁定；overlay/大图/UI 的 z-index 提升到 2147483645/2147483646/2147483647。headless 实测 1/2 → 2/2 → 关闭并恢复滚动。57/57 测试、构建通过。
- 2026-10-25：同步 React/Vue 2/Vue 3 的代码复制；修复 Vue 3 Viewer 文件传递与更新监听；保留 `maxLength` 提示行为，同步类型注释、README、文档页、核心包说明与开发清单。新增四个框架共用的 Viewer 测试，覆盖无插件复制、内容更新、插件 VFile/清理和标题跳转。12 个测试文件、69/69 用例通过；`pnpm build` 通过；playground 实测复制按钮反馈、代码语言标签与超限后继续输入/预览。截图：`.screenshots/viewer-sync.png`。
- 待确认：Phase 3 的 UMD/CJS 裁剪（体积最大项，会改变包的兼容面）；Phase 5（unified/remark/rehype 与工具链）为下一阶段，开始前需确认。
