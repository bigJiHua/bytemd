# 剩余未改造部分审计 — 2026-10-28

对象是本地 fork 工作区（HEAD `d3b8433`）中**本轮改造未触及**的代码与发布面，不是对已修批次结论的复述。方法：只读阅读源码、依赖源码（medium-zoom 1.0.8 / tippy 6.3.7 / mermaid 类型声明）、包元数据与构建脚本；对照既有测试判断是否已被覆盖。**未运行测试、构建、浏览器复现**，下文逐条标注证据类型。

## 范围

- 插件包：`plugin-breaks`、`plugin-gemoji`、`plugin-frontmatter`、`plugin-gfm`、`plugin-highlight`、`plugin-highlight-ssr`、`plugin-math-ssr`、`plugin-mermaid`、`plugin-medium-zoom`、`plugin-math/src/utils`
- 核心未改文件：`help.svelte`、`status.svelte`、`icons.ts`、`toolbar.svelte`、`toc.svelte`、`react|vue|vue-next` 薄包装
- 发布面：14 包 `exports`/`files`、`scripts/build.mjs` 产物、bundlewatch、CI、`scripts/deploy.sh`、`examples/*`

## 结论

确认 11 项（2 major / 9 minor），无 critical；另有 4 项待实测观察。插件 `breaks`、`gemoji`、`highlight`、`highlight-ssr`、`math-ssr`、`math/src/utils` 在生命周期、清理与 SSR 安全上未发现新缺陷；`status.svelte`、`icons.ts`、四框架 props 转发无漂移。

## 主要问题

### 1. [major] lightbox 关闭动画竞态：UI 消失但缩放与滚动锁残留

`packages/plugin-medium-zoom/src/index.ts:301-304` 的关闭按钮调用 `zoom.close()`；`356-361` 的 `onClose` 只给 UI 加 `is-closing`（CSS `32-34` 仅置 `opacity:0`，按钮仍 `pointer-events:auto`），真正清理在 `onClosed`。

medium-zoom 1.0.8 的 `close()` 在 `isAnimating` 时直接 resolve、不做任何关闭（`dist/medium-zoom.esm.js:469-474`），而 `isAnimating` 在 open 动画期间为 true（同文件 `379`）。因此在图片打开动画（约 300ms）内点 ×：遮罩变透明、缩放未取消、`closed` 事件不触发 → `hideUi`/`unlock` 不执行，`body` 仍 `overflow:hidden` 且透明按钮拦截点击。再次点击图片可恢复，属可自愈但用户可感知的故障。

现有测试只覆盖卸载路径（`packages/bytemd/test/framework-lifecycle.test.ts:104-142`），该路径恰有合成 `transitionend` 兜底（`index.ts:415-426`）；交互关闭路径没有同等兜底。

修复方向：把 `415-426` 的 transitionend 冲刷抽成辅助函数，在 `onClose`/`go` 前对 `.medium-zoom-image--opened` 调用，保证 `closed` 必然到达。

**证据：插件源码 + 依赖发行版源码；未浏览器复现。**

### 2. [major] 9 个包声明了不存在的 `locales` 子路径

`scripts/generate.mjs:139-148`、`182-189` 对**所有**包无条件写入 `"./locales/*"`、`"./lib/locales/*"` 出口与 `files:["locales"]`。实测 `react`、`vue`、`vue-next`、`plugin-breaks`、`plugin-frontmatter`、`plugin-gemoji`、`plugin-highlight`、`plugin-highlight-ssr`、`plugin-medium-zoom` 均无 `locales` 目录。

后果：这些包发布后，消费者按 bytemd 的既有惯例 `import '@bytemd/react/locales/zh_Hans.json'` 会直接解析失败；`files` 中的 `locales` 项对 npm 无害但失真。因 `package.json` 与生成器输出一致，`generate:check` 不会报警，缺陷被固化。

修复方向：生成器按目录是否存在（或包是否声明 locale）决定是否写这两个出口与 `files` 项，并补生成器回归。

**证据：目录枚举 + 原始 package.json 匹配；未执行 `npm pack` 或实际 import。**

### 3. [minor] bytemd 缺 `processor`/`worker` 根转发文件

`scripts/build.mjs:213-219` 只为 `viewer` 写根级 `viewer.{mjs,js,d.ts}`；`processor`、`worker` 只有 `dist` 产物与 `exports` 条件。对 `moduleResolution: node`（node10）的 TypeScript 消费者与不认 `exports` 的旧运行时，`import 'bytemd/processor'` 无法解析，而 `README` 明确指引这些子路径。

修复方向：与 `viewer` 同法补两份转发文件并纳入 `.gitignore`；或统一改为只承诺 `exports` 感知的解析方式并在 README 说明。

**证据：包根文件枚举 + `packages/bytemd/package.json:24-33` + README 指引；未做实际消费解析测试。**

### 4. [minor] medium-zoom 未接 `reportError`，失败只落 console

`packages/plugin-medium-zoom/src/index.ts:215` 的 `viewerEffect` 只解构 `markdownBody`；动态导入失败走 `399-402` 的 `console.error`。其余异步插件（math `56`、highlight `61-69`、mermaid `210-212`）都经 `reportError` 上报并触发 `bytemd-plugin-error`。失败时用户只会发现图片不可缩放，无任何提示。

**证据：源码对照 + `packages/bytemd/src/viewer-effects.ts:47-53` 注入逻辑。**

### 5. [minor] mermaid 每次渲染改写库全局配置且不恢复

`packages/plugin-mermaid/src/index.ts:169-173` 在每个图表前 `m.initialize({...mermaidConfig, startOnLoad:false, suppressErrorRendering:true})`：强制覆盖宿主传入的这两项，并改写 mermaid 模块级全局配置，卸载后不恢复。宿主页自身使用 mermaid 时会继承 bytemd 的配置。

修复方向：任务内保存/恢复配置，或调用 `mermaidAPI.globalReset()`。

**证据：源码 + mermaid 11.17.2 类型声明（globalReset 存在）；未在宿主页实测。**

### 6. [minor] 其余小问题

| 位置 | 问题 | 证据 |
| --- | --- | --- |
| `plugin-frontmatter/src/index.ts:27-31` | 未传 `onError` 时 YAML 解析失败被完全吞掉，预览静默丢内容 | 源码 |
| `plugin-gfm/src/icons.ts:6` | `CheckCorrect` 固定 `clipPath id="a"`，与宿主同名 id 冲突时图标主体不渲染，重复插入产生重复 id | 源码 |
| `plugin-medium-zoom/src/index.ts:277,306,334` | 全局 `document` 与 `markdownBody.ownerDocument` 混用；iframe 场景灯箱挂错 body、锁与键监听错配 | 源码推理，未 iframe 实测 |
| `plugin-medium-zoom/src/index.ts:154-160,363` | `ensureStyles()` 在无图片时也注入且从不移除；`redured-motion` 规则是否被库覆盖未验证 | 源码；层叠结论未验证 |
| `help.svelte:8-22,45` | `flatItems` 只收有 `cheatsheet` 的动作，仅有 `shortcut` 的自定义动作不进快捷键区；无 `icon` 时 `{@html}` 输出字面 `undefined` | 源码 + jsdom 观察（内置动作均带 icon，当前不触发） |
| `toolbar.svelte:286-304,260-270` | 下拉只能靠 focus 打开；无 Escape 关闭（tippy 6.3.7 不处理），Enter 被 `preventDefault` 后因 `type!=='action'` 丢弃；嵌套下拉无法键盘展开 | 源码 + tippy 发行版 grep |
| `toolbar.svelte:311,325-348` | 窄屏 tab 双 `tabindex=0`、无 `aria-controls`/方向键；`role=toolbar` 的 `aria-label` 误用 `locale.cheatsheet` | 源码 + jsdom 观察 |
| `package.json:64-76` | bundlewatch 只盯 UMD 且无 `maxSize`，ESM/CSS 未纳入，体积回归不会失败；`npx bundlewatch` 未列入 devDependencies | 配置读取 |
| `scripts/build.mjs:222-223` | `index.min.css` 只是 `index.css` 的字节副本（24,399B 相同），非压缩产物 | 构建脚本 + dist 哈希 |
| `examples/legacy-browser/index.html:9,14-15` | 指向上游 `bytemd@1.11.0` 的 `index.es5.min.js`，本 fork 只产 UMD | 源码 |
| `scripts/deploy.sh:3,11-12` | `npm i -g pnpm` 不锁版本，docs 混用 npm/pnpm，与 packageManager 8.15.9 不一致 | 脚本 |

## 待实测观察（未判定为缺陷）

- `toc.svelte:30-53` 在每次滚动与每次预览渲染时重建目录条目并全量 patch；侧栏关闭时仍执行。是否构成实际开销未做 profiling。
- `react/src/viewer.tsx:32-40` 每次请求新建 render controller，core 与 vue/vue-next 复用单实例；功能无差异，仅为一致性差异。
- `packages/react/dist/viewer.d.ts` 有声明无 JS，且 `exports` 无 `./viewer`，属发布包内不可达产物。
- `packages/bytemd` 的 `exports` 无 `./dist/index.umd.js` 或 `./dist/*`，`jsdelivr/unpkg` 仍指向 UMD；是否影响宿主接入未验证。

## 与 PLAN 记录一致、无新发现

Vite 4.5.14 / Vitest 0.29.8 / Tinypool 0.4.0 / esbuild 0.18.20 / diff 5.1.0 / Svelte 3.59.2 的遗留公告与 PLAN、AGENTS 记录一致；`pnpm.overrides` 在 lockfile 中确实生效（lodash-es 4.18.1、nanoid 3.3.20、postcss 8.5.31、KaTeX 全部 0.16.47）；CI 的 pnpm 8.15.9 / Node 22 与 `packageManager`、`engines` 一致，无 lerna/postinstall 残留。

## 局限

- 未运行 `pnpm test`、`pnpm build`、`pnpm audit` 或浏览器复现；除标注“源码确认”的条目外，用户可见症状均为控制流推导。
- 未审计样式文件（`index.scss`、`markdown.scss`）的视觉与主题细节，按项目约定视为已确认设计。
- 未覆盖 `examples/*` 的可运行性、docs 站点构建与 Netlify 部署链路。
