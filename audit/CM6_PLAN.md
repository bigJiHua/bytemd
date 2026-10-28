# CodeMirror 6 迁移规划（待接手）

2026-10-28。本文是 **CodeMirror 5 → 6 的升级规划与价值评估**，当前只做取证与规划，未改任何代码。权威进度见 `PLAN.md`，验收纪律见 `AGENTS.md`。

## 0. 2026-10-28 进展衔接

今日已完成（均未提交，工作区约 92 项改动）：

- 工具栏：Ribbon 分组、桌面 20 / 移动 10 自适应换行、触控热区与下拉触摸打开。
- Viewer：标题 GitHub slug（`headingIds` 默认开启）、缺失锚点兜底、16 个语言包反馈文案。
- Editor 按需加载：`bytemd/viewer`、`@bytemd/vue-next/viewer`、`@bytemd/vue-next/async` 子入口；Nuxt 3 SSR 首屏占位、编辑器 chunk 失败重试已验证。
- 主题：`--bytemd-*` token、`.dark`/`data-theme`、CodeMirror 语法色、tippy 下拉动态主题。
- 回归：核心 230/230、脚本 20/20、构建、generate:check 通过。

对 CM6 的直接影响：

- **P3 主题前置已完成**：token 与暗色选择器可直接映射到 `EditorView.theme` / `HighlightStyle`；迁移时不要回退 `.cm-*` 暗色规则，需逐 token 对照亮/暗两套。
- **P5 消费面扩大**：新增 `viewer`/`async` 子入口与 Nuxt SSR 验证；CM6 后必须重跑 tarball 安装、首屏占位、chunk 失败重试与 bundlewatch。
- **P4 测试增加**：新增 `heading-ids.test.ts`、`async.test.ts`；测试助手需同时覆盖 CM6 容器与异步组件生命周期。
- **P2 动作契约不变**：工具栏已分组/自适应，但 `BytemdAction` 与 `createEditorUtils` 未变；迁移必须保持多行包裹、反向选区、上传落点与快捷键。
- **锚点 slug 与 CM6 无关**，但 Editor 预览的 `headingIds` 默认开启，P1 改造后需保留。
- **P0 spike 已完成（两轮）**：裸编辑器 + 完整页面（CM5 完整 bytemd vs CM6 编辑+预览，生产构建，CDP Trace）。完整 500 KiB 场景（CM6 已含 sourceMap 滚动同步）CM6 的 Layout 峰值为 load 205.33 / scroll 101.71 / type 90.30 ms，CM5 为 226.85 / 169.91 / 92.88 ms，均高于 75 ms 门槛；100 KiB 两者接近。CM6 布局峰值有下降（scroll 约 -40%），但 Task 总时长未全面下降，且仍无工具栏/插件/TOC 点击，不能证明生产等价。结论仍为**暂缓 P1**；重判需先做含滚动同步的 CM6 原型。数据见 `audit/CM6_SPIKE_RESULT.md`。

## 1. 结论先行

| 项 | 结论 |
| --- | --- |
| 价值 | **中等偏高，且高度依赖场景**：收益集中在 ≥100 KiB 大文档编辑、移动端/IME、销毁内存；常规 <50 KiB 文档几乎无感 |
| 风险 | **高（破坏性）**：公开插件 API `BytemdEditorContext.editor / codemirror` 与 `EditorProps.editorConfig` 都是 CM5 类型，迁移必然破坏第三方插件 |
| 建议路径 | **P0 spike 已完成（2026-10-28，两轮）**：完整 500 KiB 场景 CM6 Layout 峰值低于 CM5，但均 >75 ms；CM6 侧缺滚动同步，Task 总时长未全面下降。结论**暂缓 P1**，重判需 CM6 滚动同步原型；详见 `audit/CM6_SPIKE_RESULT.md` |
| 前置条件 | 先提交当前工作区基线（约 92 项改动，含 Svelte 5、工具栏、锚点、异步入口、主题），建立可回滚点；P0 spike 本身不改主干，可先做 |

## 2. 价值证据（来自本仓库既有审计）

| 证据 | 出处 | 对 CM6 的意义 |
| --- | --- | --- |
| 500 KiB 页面 CPU/布局 trace：CM5 `updateHeightsInViewport` + 可用宽度读取触发两次约 **151.7 / 112.1 ms** 的 document 根布局，仅 19/17 个 dirty objects 却涉及约 **79,000 个布局对象** | `audit/LARGE_DOCUMENT.md:21` | CM6 用视口测量 + `requestMeasure` 批处理，是该问题最直接的对症方案 |
| 每轮销毁后约 20,000 节点 / 36 监听器增量，堆引用指向 CM5 光标/blur 短时定时器保留旧实例；每个新工厂长期 +约 100 测量节点 + 2 个全局监听器 | `audit/PROD_PERF.md:52` | CM6 `EditorView.destroy()` 正规销毁，可移除「按 document 复用工厂」补丁 |
| `cancelEditorInteractions` 依赖 CM5 **私有**活动回调（`state.selectingText/draggingText`），升级需重新审查 | `audit/REASSESSMENT.md:22` | CM6 无该类私有耦合，但该补丁需重写 |
| 中文 OS IME 与真实移动设备仍为 incomplete | `PLAN.md` P3 | CM6 composition/移动端处理更完整，可一并收敛 |

反证（说明收益有限的一面）：`layoutContainment`（默认关闭）与按 document 复用工厂已把两个已知痛点部分绕开；脚本/worker/预览侧与 CM 无关，迁移不改善解析与 DOM 插入成本（`audit/WORKER.md:165`）。

## 3. 现状耦合面

| 文件 | 规模 | CM5 依赖 |
| --- | --- | --- |
| `packages/bytemd/src/editor.ts` | 672 行 | CM5 工厂 + 7 个 mode/addon 注册；`createEditorUtils`（wrapText / replaceLines / appendBlock）全用 CM5 位置模型（`Pos`/`indexFromPos`/`posFromIndex`/`getRange`/`replaceRange`/`setSelection`） |
| `packages/bytemd/src/editor.svelte` | 637 行 | 25 处 `editor.*` 调用（`getValue/setValue/on/off/addKeyMap/removeKeyMap/heightAtLine/scrollTo/refresh/focus/blur/setOption…`） |
| `packages/bytemd/src/types.ts` | — | 公开类型：`codemirror: typeof CodeMirror`、`editor: Editor`（CM5 实例）、`editorConfig?: Omit<EditorConfiguration, 'value' \| 'placeholder'>` |
| `packages/bytemd/src/index.scss` | 21 条 `.cm-*` | CM5 token 与暗色覆盖（`.cm-header/.cm-keyword/.cm-quote…`） |
| `packages/bytemd/src/scroll.ts` | 解耦 | 仅注入 `heightAtLine(line) => number`，**无需改** |
| 测试 | 5 个文件 | `actions / core-regressions / editor-runtime / editor / scroll` 直接读 `.CodeMirror` 实例与 `createCodeMirror()` |

CM5 提供的编辑器能力清单（迁移必须逐项补回）：markdown / gfm / xml(内联 HTML) / yaml / yaml-frontmatter 高亮、`overlay`（自定义内联语法如 `[size=20]`、`[color=red]`）、placeholder、`continuelist`（列表续行）、行高查询与滚动同步、光标闪烁与焦点处理、upload 的 drop/paste 处理。

## 4. 公开 API 破坏清单

| 破坏点 | 影响 | 缓解选项 |
| --- | --- | --- |
| `BytemdEditorContext.editor`（CM5 实例） | 所有用 `editorEffect` 直接操作文档的第三方插件失效 | A) 直接暴露 CM6 `EditorView`（干净但强破坏）；B) 提供 CM5 风格适配器（`getValue/setValue/getCursor/listSelections/replaceRange/setSelection` 等最小集），把破坏降到少数 API |
| `BytemdEditorContext.codemirror`（CM5 构造器，用于 `Pos()`） | 插件里 `codemirror.Pos()` 失效 | 适配器同时提供 `Pos(line, ch)` |
| `EditorProps.editorConfig`（CM5 `EditorConfiguration`） | 传 CM5 配置项的宿主失效 | 新增 `editorExtensions?: Extension[]`（CM6 原生），旧字段标记 deprecated 并忽略 |
| 键盘 `extraKeys` / `keyMap`（CM5 keymap 字符串） | 自定义快捷键失效 | 迁移到 CM6 `keymap.of([...])`，文档给映射表 |
| `.cm-*` CSS token | 主题定制失效 | 改用 CM6 `HighlightStyle` + CSS 变量，保留 `.markdown-body` 主题不受影响 |

结论：若选 A 方案，必须发 major 版本并在 README/CHANGELOG 给出 CM5→CM6 迁移指南；选 B 方案可发 minor，但适配器本身要长期维护。

## 5. 分阶段计划

每阶段独立验收，**任一阶段不达标即回滚到上一提交**，不与其它大版本迁移混批（`AGENTS.md` 纪律 6）。

### P0 — Spike 价值实测（只做实验，不改主干）

- [x] 建 `audit/cm6-spike/`（不入库，已加入 `.gitignore`）：最小 CM6 页面 + CM5 页面，同一 100/500 KiB 样本
- [x] 测量：加载、高度重测、输入换行、Layout/Style/Task、销毁后节点与 window/document 监听器增量
- [ ] 通过条件（建议）：500 KiB 单次根布局 **≤75 ms**（现状 112–152 ms），销毁增量 0/0，且 100 KiB 场景无退化 —— **完整场景未满足**：CM6 500 KiB Layout 峰值 load 205.33 / scroll 101.71 / type 90.30 ms；100 KiB Layout 总量与 CM5 持平；裸测销毁均 0/0
- [x] 产出：`audit/CM6_SPIKE_RESULT.md`（结论：**暂缓 P1**）

### P1 — 内核替换（`editor.ts` + `editor.svelte`）

- [ ] 依赖：`@codemirror/state`、`@codemirror/view`、`@codemirror/commands`、`@codemirror/language`、`@codemirror/lang-markdown`、`@codemirror/lang-yaml`、`@codemirror/lang-html`、`@lezer/highlight`（frontmatter 需自建扩展或评估社区包）
- [ ] 能力映射：markdown/gfm → `lang-markdown`；内联 HTML → `lang-html`（嵌套）；yaml-frontmatter → 自定义 state field；overlay 自定义语法 → `MatchDecorator` + `ViewPlugin` 装饰器；placeholder → `view` 的 `placeholder`；列表续行 → `lang-markdown` 的 `insertNewlineContinueMarkup`
- [ ] 保留能力：`maxLength` 提示、`layoutContainment`、`previewDebounce`、`mode`(auto/split/tab)、全屏、TOC、滚动同步（继续复用 `scroll.ts`，只需重写 `heightAtLine` 来源）
- [ ] 删除：`codemirror-ssr` 依赖、`cancelEditorInteractions` 私有回调补丁（改由 `EditorView.destroy()` 覆盖，需用测试证明监听器释放）
- [ ] 验收：`pnpm build` 通过；`packages/bytemd/test/editor*.test.ts` 改造后全绿

### P2 — 编辑工具与动作（`createEditorUtils` + `getBuiltinActions`）

- [ ] `wrapText` / `replaceLines` / `appendBlock` 改用 CM6 `state.selection` + `changes` 事务；保持多行包裹、反向选区、撤销后选区行为
- [ ] 内置 action（标题、粗斜体、引用、列表、任务、表格、分割线、代码块、图片上传落点、颜色/字号）逐条迁移并保留快捷键
- [ ] 验收：`actions.test.ts` + `core-regressions.test.ts` 全绿（含上传失败/卸载后落点等边界）

### P3 — 样式与主题

- [ ] 21 条 `.cm-*` 迁为 CM6 `HighlightStyle`（`tags.heading1/2/3…`、`tags.keyword`、`tags.string`、`tags.quote`…）+ `EditorView.theme`（`--bytemd-*` token 与暗色选择器已于 2026-10-28 落地，迁移时逐 token 对照，不保留 CM5 规则）
- [ ] 保留 `--bytemd-*` 变量与 `.dark` 暗色自动适配；`index.css` 体积纳入 bundlewatch
- [ ] 验收：无头 Chrome 对比亮/暗两种主题的 token 颜色与行高、gutter、选区

### P4 — 测试与契约

- [ ] 测试助手改为 CM6：`createCodeMirror()` → 构造 `EditorView`；`.CodeMirror` 选择器 → CM6 容器；`getDoc()/listSelections()` 语义映射
- [ ] `framework-lifecycle.test.ts` 的 100 次挂载/卸载循环、`editor-runtime` 的销毁监听器断言必须在 CM6 下重测
- [ ] 保持用例语义等价，不降低断言强度（`AGENTS.md` 纪律 2）

### P5 — 文档、发布与消费验证

- [ ] README / `packages/bytemd/README.md` / 插件模板补 CM5→CM6 迁移说明（`editorConfig`、`editor` 实例、keymap）
- [ ] `scripts/generate.mjs` 模板同步；`pnpm generate && pnpm generate:check`
- [ ] 版本策略：选 A 方案发 major，选 B 方案发 minor；`bundlewatch` 预算按实测重设
- [ ] 外部消费验证：干净安装（不继承根 overrides）分别验证 Svelte / React / Vue2 / Vue3 与 SSR 入口；复用 2026-10-28 的 tarball + `audit/nuxt-ssr-review` 流程，并覆盖 `viewer`/`async` 子入口

## 6. 每阶段统一回归门槛（缺一不可）

```sh
pnpm test                          # 核心（当前 26 文件 230 用例）
pnpm run test:scripts              # Node 脚本 26 用例
pnpm run test:scripts:coverage     # 覆盖率门槛
pnpm build                         # 全包 ESM/CJS + d.ts
pnpm generate:check                # 生成产物防漂移
pnpm style                         # prettier
pnpm exec bundlewatch              # ESM+CSS 体积预算
```

浏览器实测（无内置浏览器时的做法）：`pnpm --filter playground build` + `vite preview --port 4173`，用 Playwright `channel='chrome'`（本机 Chrome，不下载浏览器）核对编辑器挂载、工具栏、KaTeX/mermaid/高亮/复制按钮、输入后重渲染、暗色背景。

## 7. 风险登记与回滚

| 风险 | 触发条件 | 应对 |
| --- | --- | --- |
| 大文档收益不达标 | P0 布局耗时 >75 ms 或内存退化 | 停止迁移，记录「暂缓」，保留 CM5 |
| 插件生态破坏超预期 | 适配器覆盖不了常用插件调用 | 转 A 方案 + major + 迁移指南 |
| 滚动同步错位 | `heightAtLine` 语义变化 | 用 `scroll.test.ts` 25 个用例对齐偏差 |
| SSR/纯入口回归 | CM6 包在 import 期触碰 DOM | 复验 `audit/worker-entry-check.mjs` 的无 DOM 入口断言 |
| 主题回归 | 21 条 `.cm-*` 遗漏 | 亮/暗两套截图逐 token 对比 |
| 与其它迁移混批 | 同时改解析链或发布格式 | 禁止；本批只动编辑器 |

回滚：每阶段独立提交，失败 `git revert` 该阶段提交即可回到 CM5 绿基线。

## 8. 接手清单

1. 先确认基线：`git status`（当前约 92 项改动 **未提交**，含 Svelte 5、工具栏、锚点、异步入口、主题），建议先 commit + push 再动 CM6
2. 读顺序：`PLAN.md` 第十批 → 本文 → `audit/LARGE_DOCUMENT.md` → `audit/PROD_PERF.md` → `packages/bytemd/src/editor.ts` → `editor.svelte`
3. 先跑一次全量门槛（第 6 节）确认起点为绿
4. 从 P0 spike 开始，先拿数据再决定是否投入 P1-P5
5. 记录：每阶段完成即更新 `PLAN.md` 进度日志与本文勾选项

## 9. 待决定项（需产品/维护者拍板）

| 决策 | 选项 | 影响 |
| --- | --- | --- |
| 是否启动 | ① P0 已完成并建议暂缓 ② 直接 P1 ③ 关闭本项 | 当前数据不支持 P1；若要重判，先补完整 ByteMD 场景基线复现 |
| 插件 API | A) 暴露 CM6 `EditorView` B) CM5 风格适配器 | A 干净但 major；B 兼容但要长期维护 |
| 发布版本 | major / minor | 取决于上一项 |
