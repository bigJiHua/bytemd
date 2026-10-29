# bytemd 2.0.0（CM6 内核）本地发布验证（2026-10-29）

> 分支 `feat/cm6`。**未推送、未发布**——tarball 仅存在于 `audit/local-release-2.0.0/`（gitignore），全部验证在本地完成。

## 1. 版本策略决策：全家族 2.0.0（major）

依据：

1. 内核世代更换（CM5→CM6）本身是 semver 定义级变更；适配器遮住的是 TypeScript 可见面，遮不住行为差异（撤销语义、滚动/渲染内部、包体 63.98→67.95KB gzip）。
2. `.cm-*` token 类不再产出、CM5 完整 `Editor` 类型收敛为适配器子集——对仓库之外未知第三方插件是事实破坏面，major 把升级选择权交给宿主。
3. react/vue/vue-next wrapper 以 `workspace:*` 精确锁定核心版本，无论核心怎么选都必须随核心发版；13 个包统一 2.0.0 最清晰。
4. 插件 peer 依赖放宽为 `bytemd ^1.5.0 || ^2.0.0`：插件 dist 只使用文档化 context API（两代内核都提供），同一 dist 可服务两代核心。

## 2. 插件审计（反推源码 + 上游 README 对照）

- 上游 README 承诺的插件面：`remark`/`rehype`/`actions`（`click(ctx)`，ctx 为 `BytemdEditorContext`）/`viewerEffect`（`markdownBody`）；`editorConfig` 仅作为 Editor 选项提及。权威面是 TS 定义，与本仓库 types 一致。
- 9 个插件（breaks/frontmatter/gemoji/gfm/highlight/highlight-ssr/math/math-ssr/medium-zoom/mermaid）**均无 `editorEffect`**，不触碰编辑器实例。
- 有 `editor` 交互的仅 gfm 与 mermaid 的工具栏动作，调用面为 `wrapText`/`replaceLines`/`appendBlock`/`setSelection`/`codemirror.Pos`/`focus`——适配器全覆盖且经生产构建实测（见 §4）。
- examples 无 `.cm-*`/`editorConfig`/CM5 API 引用。
- **结论：插件侧无隐藏坑。**

## 3. tarball 净室消费验证（TEMP 目录，不继承 workspace）

`bytemd-2.0.0.tgz` + `plugin-gfm` + `plugin-math` 干净安装后 Node 22 实测（脚本随 cleanroom 保留于 TEMP，断言清单如下）：

| 项 | 结果 |
| --- | --- |
| SSR `renderMarkdown({value})`（无 DOM） | `file.toString()` 输出 `<h1 id="标题">`/`<strong>` ✓ |
| `getProcessor({plugins:[gfm(),math()]})` | gfm 删除线+表格 ✓；math 输出 `code.language-math`（KaTeX 由 viewerEffect 浏览器端渲染，SSR 变体才是 rehype-katex）✓ |
| 导出面 | 兼容类 `Editor`/`Viewer` + `EditorComponent`/`ViewerComponent` ✓ |
| CJS 入口 `require('bytemd')` | `Editor`/`getProcessor` 可用 ✓ |
| worker 子入口 `require('bytemd/worker')` | `installWorkerRenderer` 可用 ✓ |
| locales 导出 + 包元数据 | `locales/zh_Hans.json` 存在、版本 2.0.0、`./locales/*` 声明 ✓ |

## 4. playground 生产构建模拟输入实测（CDP，`audit/cm6-v2-input-verify.mjs`）

1280×800 无头 Chrome，真实 `Input.insertText`/`dispatchKeyEvent`/`imeSetComposition` 注入；**18/18 断言通过，console 0 错误/警告**（favicon 404 为已知产物已排除）：

| 场景 | 断言 |
| --- | --- |
| 真实键盘输入（含 CJK/ASCII 混排） | 编辑器值逐字符一致 ✓；预览渲染出相同文本 ✓ |
| Enter 换行 | `second line` 落在新行 ✓ |
| 粗体动作（选区→工具栏） | 值 `bold **target** here` ✓；预览 `<strong>` ✓ |
| 单步撤销（Ctrl+Z） | 一步回到包裹前文本 ✓ |
| gfm Table 动作（插件动作：appendBlock+setSelection） | 表格 markdown ✓；光标落在表头单元格（ch=2，空文档时表体在第 1 行——空行作分隔，符合语义）✓；预览 `<table>` ✓ |
| Mermaid 下拉动作 | ` ```mermaid ` 围栏插入 ✓；预览渲染出 SVG ✓ |
| math 插件 viewerEffect | 预览出现 `.katex` ✓ |
| highlight 插件 | 预览出现 `.hljs` token ✓ |
| frontmatter | 编辑器 `.bytemd-yaml-key` = `title,num` ✓；预览不渲染 yaml 内容、正文保留 ✓ |
| composition IME（CDP imeSetComposition+insertText） | 最终值 `before 中文输入` ✓；预览一致 ✓（`Input.compositionEvent` 采样为 0——无头环境未派发该事件，以值/预览断言为准） |
| 往返完整性 | `setValue→getValue` 与原文完全一致（含 CJK/标点/行内代码/链接）✓ |

### 实测发现并修复的缺陷：Enter 吞键

适配器 `handleKeydown` 原实现对字符串命令一律 `preventDefault`，而 `insertNewlineContinueMarkup` 在**非列表上下文返回 false**（等价 CM5 的 `CodeMirror.Pass`）——普通文本按 Enter 被拦截后既不续行也不走 CM6 默认插入，**Enter 在普通段落完全失效**（jsdom 未覆盖该组合，浏览器模拟输入抓出）。修复：命令返回 false 时不消费事件、继续落到 CM6 keymap；函数型动作仍无条件消费。修复后本节全部断言通过。

### 工具注记（CDP 观察值，非产品问题）

本环境的 `Runtime.evaluate`+`returnByValue` 对**对象/布尔完成值**间歇性回报 `type: undefined`（副作用全部生效，仅完成值丢失；字符串完成值不受影响）。脚本因此统一采用字符串回传（页面内 `JSON.stringify`/`join`）+ 单次重试（`readString`），断言全部落在稳定通道上。

## 5. 状态

- 版本：13 包 2.0.0，插件 peer `^1.5.0 || ^2.0.0`；lockfile/format/generate:check 同步。
- 验收：核心 27 文件 240/240、脚本 26/26、完整构建、generate:check、style、bundlewatch PASS。
- **未推送 GitHub、未发布 npm**；tarball 在 `audit/local-release-2.0.0/`（本地）。
- 待办：真实 OS IME/移动设备；推送与 `pnpm pub` 需维护者执行。
