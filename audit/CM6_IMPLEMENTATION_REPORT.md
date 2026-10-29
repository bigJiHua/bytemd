# CM6 实施报告（2026-10-28，2026-10-29 收尾批次更新）

- 分支：`feat/cm6`
- 状态：**P0-P4 完成（含收尾批次），已作为实验分支提交；未推送、未发版**
- 目标：验证 CodeMirror 6 是否可替换现有 CM5 内核，并保持插件/宿主 API 可用

## 1. 目的

1. 按 `audit/CM6_PLAN.md` 的 P1-P4 验证 CM6 可行性，降低 CM5 大文档布局、销毁、IME 风险。
2. 采用 B 方案（CM5 形状适配器），避免直接暴露 CM6 `EditorView` 造成第三方插件全面失效。
3. 在真实 playground 生产构建上实测 500 KiB 编辑、滚动、预览、移动端、IME、暗色与动作，而不是只做裸编辑器 benchmark。

## 2. 做了什么

### 2.1 内核与适配器

- 新增 `CM6CompatEditor`：用 CM6 `EditorView` 实现 CM5 风格 API（值、选区、range、滚动信息、`heightAtLine`、keymap、事件、销毁等）。
- `createCodeMirror()` 改为返回 CM6 工厂；`codemirror.Pos` 与 `codemirror.signal` 保留兼容。
- `editor.ts` 的 `createEditorUtils` 与内置 actions 继续复用适配器，不重写动作逻辑。
- `editor.svelte` 保留现有调用面，仅调整类型、透传 `editorExtensions`。
- `cancelEditorInteractions` 改为 `EditorView.destroy()`，释放 DOM/监听器。

### 2.2 能力与主题

- CM6 扩展：markdown（GFM `markdownLanguage`）、history、lineNumbers、drawSelection、highlightSpecialChars、默认 keymap、placeholder、行换行、tabSize/indentUnit。
- 高亮：`HighlightStyle` + `--bytemd-syntax-*` 亮/暗 token。
- 样式：移除 `codemirror-ssr` CSS import；补 `.cm-editor/.cm-content/.cm-gutters/.cm-cursor/.cm-selectionBackground` 等布局与主题规则。
- 依赖：加入 `@codemirror/state`、`view`、`commands`、`language`、`lang-markdown`、`@lezer/highlight`；移除 `codemirror-ssr`、`@types/codemirror`。

### 2.3 测试与计量

- `editor-runtime` 中依赖 CM5 私有实现的断言改为 CM6 语义（销毁、选区、文档独立性）。
- 100 次挂载/卸载用例超时从 20s 调整为 120s；断言强度未降低。
- 生产实测脚本覆盖：500 KiB 加载、输入、滚动同步、粗体动作、暗色、390 移动端、CDP IME 合成。

## 3. 涉及文件

### 新增

| 文件 | 作用 |
| --- | --- |
| `packages/bytemd/src/cm6-editor.ts` | CM6 适配器、CM6 工厂、高亮与选项映射 |
| `audit/CM6_PROD_RESULT.md` | 生产实测数据与限制 |
| `audit/CM6_SPIKE_RESULT.md`（前序） | P0 裸编辑器/完整场景对比与结论 |
| `audit/cm6-spike/`（本地，已 gitignore） | 实验页面与测量脚本，不入库 |

### 修改

| 文件 | 变化 |
| --- | --- |
| `packages/bytemd/src/editor.ts` | 工厂切到 CM6；移除 CM5 imports；`cancelEditorInteractions` 改为 destroy；类型切换 |
| `packages/bytemd/src/editor.svelte` | 类型改为 `CM6CompatEditor`；新增 `editorExtensions` 透传；保留既有 API 调用 |
| `packages/bytemd/src/types.ts` | `BytemdEditorContext` 改用 CM6 类型；`editorConfig` 放宽；新增 `editorExtensions` |
| `packages/bytemd/src/index.scss` | 移除 CM5 CSS import；补 CM6 布局/主题；新增 `--bytemd-syntax-*` 亮/暗值 |
| `packages/bytemd/package.json` | 新增 CM6 依赖；移除 `codemirror-ssr`、`@types/codemirror` |
| `pnpm-lock.yaml` | 依赖图更新 |
| `packages/bytemd/test/editor-runtime.test.ts` | CM5 私有行为断言改为 CM6 语义 |
| `packages/bytemd/test/framework-lifecycle.test.ts` | 100 次循环超时 20s→120s |
| `PLAN.md` | 记录 CM6 批次与生产结论 |
| `audit/CM6_PLAN.md` | P1-P4 勾选、生产实测与遗留缺口 |

## 4. 依据

1. `audit/CM6_PLAN.md`：P0 价值实测、P1-P5 迁移路径、API 破坏清单、回滚要求。
2. 既有基线：`audit/LARGE_DOCUMENT.md` 的 500 KiB 根布局 112–152ms；`audit/PROD_PERF.md` 的销毁/监听器成本。
3. P0 实测：裸 CM5/CM6 与完整页面 Trace（`audit/CM6_SPIKE_RESULT.md`）。
4. 本轮生产实测：playground 生产构建 + CDP，数据见 `audit/CM6_PROD_RESULT.md`。
5. 回归门槛：231/231 测试、26/26 脚本、`pnpm build`、`pnpm generate:check`、Node 模块导入。

## 5. 验证结果

- 核心测试：**231/231** 通过。
- 脚本测试：**26/26** 通过。
- `pnpm build`、`pnpm generate:check` 通过。
- `node` 导入 `bytemd/dist/index.mjs` 通过（SSR 顶层无 DOM 访问）。

### 500 KiB 生产实测（1280×800）

| 项 | 结果 |
| --- | --- |
| 加载 | 3718.4ms；Layout 235.37ms；Task 3479.76ms；heap +66.2MB（含预览与插件渲染） |
| 同步输入（无 containment） | 169.1ms |
| 同步输入（开启 `layoutContainment`） | **14.0ms** |
| 预览隐藏输入 | 16.9ms |
| `heightAtLine` 全量 12,802 行 | 14.3ms |
| 输入总计（含预览/插件渲染） | 3441.5ms；Layout 171.23ms |
| 双向滚动同步 | 编辑器 155081 → 预览 213400；预览 → 编辑器 155381 |
| 粗体动作 | 选中 “# Lon” → `**# Lon**g d` |
| 暗色 | 背景 `rgb(13,17,23)`、文字 `rgb(230,237,243)` |
| 390×844 | 无横向溢出；编辑器 368px；工具栏 148px（11/11/9 三行） |
| CDP IME | 插入“中文”成功 |
| Console | 无 error/warning |

**关键结论**：CM6 输入慢的根因是 500 KiB 预览的布局传播，不是 CM6 内核；`layoutContainment` 将同步输入从 169ms 降到 14ms。大文档宿主必须开启该选项。

## 6. 当前结论（2026-10-29 收尾批次后更新）

- **技术上可运行**：CM6 内核、GFM、主题、滚动同步、动作、移动布局、CDP IME 均通过生产页面验证。
- **收尾批次已完成**（2026-10-29）：frontmatter 高亮（装饰 + `.bytemd-yaml-*`，CM5 yaml token 对位）、inline HTML 高亮（lang-markdown 内嵌 html 解析器）、`editorConfig` 映射补齐（`extraKeys/readOnly/autofocus/undoDepth`）、`wrapText/replaceLines/appendBlock` 原生单事务、死 CM5 CSS 清理、`cm6-capabilities` 9 例新测试、生产消费页 CDP 复验（亮/暗逐 token 色、Enter 续行、100 次挂载/销毁 0/0）。overlay 高亮经核对为计划误记——CM5 从未实际使用 overlayMode，无需迁移。复验另修复 `.CodeMirror` 兼容类被 CM6 update 抹掉（改 attribute facets）与 `appendBlock` 落点钳位错误；详见 `CM6_PROD_RESULT.md` §5。
- **不建议直接合并默认发布**：P5 剩余（版本策略 major/minor、tarball + Nuxt SSR 外部消费验证）未做；真实 OS IME/真实移动设备未人工验证。
- **性能结论**：CM6 不是无条件提速；500 KiB 加载仍由预览/插件渲染主导（约 3.7s）。确定性收益来自 `layoutContainment`（输入 169→14ms），该结论同时适用于宿主配置，不应被表述为“CM6 内核单独解决大文档问题”。
- **状态**：`feat/cm6` 分支已提交（实验分支），未推送、未发版。

## 7. 后续

1. ~~审阅本分支 diff；决定是否作为实验分支提交~~（已提交至 `feat/cm6`）。
2. ~~补 frontmatter / inline HTML / overlay 高亮与 `editorConfig` 全量映射~~（2026-10-29 完成；overlay 经核对无需迁移）。
3. 真实 OS 中文 IME、真实移动设备（需人工/设备，保持 incomplete）。
4. P5 剩余：版本策略（major/minor 拍板）、tarball + Nuxt SSR 独立消费验证（覆盖 `viewer`/`async` 子入口）。
5. ~~在文档中明确：大文档宿主开启 `layoutContainment`~~（三份 README 已强化）。
