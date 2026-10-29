# CM6 生产实测结果（2026-10-28）

> 分支 `feat/cm6`。CM6 内核以 `CM6CompatEditor` 适配器接入；playground 生产构建（`vite build` + `vite preview`）后实测。样本为 `performance-fixtures.mjs` 的 500 KiB Markdown。

## 1. 功能实测（1280×800）

| 项 | 结果 |
| --- | --- |
| CM6 挂载 | `.cm-editor` 存在，工具栏 37 个动作，编辑器高 598px |
| 500 KiB 加载 | 3718.4 ms，Layout 235.37 ms，Task 3479.76 ms，JS heap +66.2 MB |
| 500 KiB 输入（同步，无 containment） | 169.1 ms |
| 500 KiB 输入（开启 `layoutContainment`） | **14.0 ms** |
| 500 KiB 输入（预览隐藏） | 16.9 ms |
| `heightAtLine` 全量（12,802 行） | 14.3 ms，不是瓶颈 |
| 输入总计（含 500 KiB 预览 + 插件渲染） | 3441.5 ms，Layout 171.23 ms，Task 3189.27 ms |
| 双向滚动同步 | 编辑器 155081 → 预览 213400；预览 → 编辑器 155381 |
| 粗体动作 | `**# Lon**g d`（选中 “# Lon” 后加粗） |
| 暗色 | 背景 `rgb(13,17,23)`、文字 `rgb(230,237,243)` |
| 移动端 390×844 | 无横向溢出，编辑器 368px，工具栏 148px（11/11/9 三行） |
| IME（CDP 合成） | 插入“中文”成功，文档长度 +2 |
| 控制台 | 无 error/warning（生产构建） |

**关键结论**：CM6 输入慢不是内核问题，而是 500 KiB 预览的布局传播；开启 `layoutContainment` 后从 169ms 降到 14ms。大文档宿主必须开启该选项，或自行隔离预览布局。

## 2. 产物

- playground 主 chunk：`index-BG_GO6t_.js` 412 KB + `index-CT-yK6QK.js` 299 KB；KaTeX/Mermaid 仍为独立 chunk（与 CM5 一致）。
- `layoutContainment` 为 opt-in（默认 false），CM6 下与前代语义一致。

## 3. 回归

- 231/231 核心测试、26/26 脚本、`pnpm build`、`pnpm generate:check` 通过。
- 生命周期 100 次挂载/卸载用例超时从 20s 调整到 120s；CM6 在 jsdom 中初始化更重，但用例语义未降低。

## 4. 未覆盖/限制

- `editorConfig` 映射了 `lineNumbers/lineWrapping/tabSize/indentUnit/extraKeys/readOnly/autofocus/undoDepth`；其余 CM5 配置项（`mode`、`theme`、`keyMap` 等）被忽略并在 README 迁移说明中列出，等价能力走 `editorExtensions`。
- 真实 OS 中文 IME 未人工验证；本次是 CDP composition 合成。
- 真实移动设备未验证；本次为 CDP 390×844 模拟。
- 完整 CM5 同脚本对照未重跑；CM6 主要收益/成本见 `CM6_SPIKE_RESULT.md`。

## 5. 收尾批次复验（2026-10-29，`audit/cm6-closeout-verify.mjs`）

生产消费页（`audit/prod-perf-ui.html`，vite 生产构建 + CDP）上完成 P1/P2/P4 收尾项的浏览器实测：

| 项 | 结果 |
| --- | --- |
| frontmatter 高亮 | `title/num/flag/note` 命中 `.bytemd-yaml-key/string/number/keyword/comment`，分隔线 `.bytemd-yaml-punct`；正文无装饰 |
| frontmatter 颜色（亮/暗） | key/number `rgb(0,92,197)`→`rgb(121,192,255)`、string `rgb(3,47,98)`→`rgb(165,214,255)`、comment `rgb(106,115,125)`→`rgb(139,148,158)`、keyword `rgb(215,58,73)`→`rgb(255,123,114)`、fence `rgb(111,66,193)`→`rgb(210,168,255)`（与 CM5 yaml 模式 token 对位） |
| inline HTML（lang-markdown 内嵌 html 解析器） | `div`→tag 色 `rgb(34,134,58)`、`class`→attribute `rgb(111,66,193)`、`"x"`→string `rgb(3,47,98)` |
| markdown 记号 | `**` 标记 → `tags.processingInstruction` → comment 色；未加映射前为正文色 |
| 标题 | fontWeight 600、fontSize 18.2px（14px × 1.3em） |
| Enter 列表续行（extraKeys） | `- item` + Enter → `- item\n- `，编辑器存活且同实例（生产构建，合成 keydown） |
| 100 次挂载/销毁 | prepare/destroy ×100 后强制 GC：**DOM nodes +0 / listeners +0**，JS heap +1.28 MB（迭代间抖动量级），耗时 9.4s |
| 控制台 | 无 error/warning（favicon 404 为预览服务器已知产物，已排除） |

**复验中发现并修复的缺陷**：

1. **`.CodeMirror` 兼容类在首次 focus/选区 update 后被 CM6 抹掉**（构造后 `classList.add` 不在 CM6 属性管理内，CM6 每次重写根/内容 class）。已改为 `EditorView.editorAttributes.of({ class: 'CodeMirror' })` + `contentAttributes.of({ class: 'CodeMirror-lines' })`，由 CM6 每次 update 合并保持。修复前 `document.querySelector('.CodeMirror')` 在 focus 后返回 null。
2. **`appendBlock` 无空行路径落点错误**：适配器的 `Pos(lineCount)` 被钳到最后一行**行首**而非文末（CM5 钳到文末），非空文档中图片上传/代码块/分割线/手风琴内容会插错位置并与末行拼接。已在原生事务重写中修正为显式文末插入。
3. **`handleKeydown` 用 `stopPropagation` 不足以拦截 CM6 同元素 keymap**，改为 `stopImmediatePropagation`（CM6 同时尊重 defaultPrevented）。

**审计工具链修复（Svelte 5 迁移遗留，非 CM6 引入）**：

- `audit/prod-perf-ui.html` 仍用 `new App()` 挂载，Svelte 5 下跳过 `init_operations` → 改 `mount()`（与 playground 第十批修复一致）。
- `audit/prod-perf-ui.svelte` 改从 `packages/bytemd/src` 源码入口导入（构建产物 `svelte/` 目录在 svelte-preprocess TS 检查下越过 `rootDir=src`，且 dist 内嵌独立 Svelte 运行时）。
- `audit/prod-perf-vite.config.mjs` 不能再用全局 `resolve.conditions: ['worker']`：svelte 5 的 exports 中 `"worker"` 条件指向 server 运行时且排在 `"browser"` 之前，该全局条件使主构建解析到 server 端 `mount()`（报 `lifecycle_function_unavailable`）。但 worker chunk 确实需要 DOM-free 解码器——`decode-named-character-reference` 的 `"browser"` 条件入口（`index.dom.js`）依赖 `document`，worker 构建含 browser 条件会选中它（报 `document is not defined`）。最终改为全局别名指向默认入口 `index.js`（纯 JS、无 DOM，主线程与 worker 通用）。worker 渲染模式实测恢复（100 KiB enhanced，2s 内渲染完成，0 错误）。`audit/WORKER.md` 的宿主指引如涉及该全局条件需同步复核（svelte 5 宿主禁用全局 worker 条件）。
