# Playground 实测与脚本清理（2026-11-04）

对应 PLAN 第十二批。使用 Node 22.20.0、pnpm 8.15.9、独立无头 Chrome，通过 CDP 注入鼠标和键盘，检查实际 playground 开发服务与生产 preview。桌面视口 1280×900，窄屏视口 390×900（桌面浏览器模拟）。

## 实测发现与修复

- 灯箱切换下一张图片后立即按 Escape，底层 medium-zoom 在打开动画期间会忽略 close()，且不发出 close 事件。修复关闭按钮/Escape 统一关闭路径：主动安排清理、完成待处理动画并请求关闭；避免重试过程中遗留二次定时器。回归覆盖打开动画尚未结束时点击关闭与按 Escape。
- Tool 字号父项“使用”应按示例插入 20px，但匹配代码查找标题 `20`，实际菜单标题为 `20px`，因此退回首项 12px。修复两种名称兼容，新增真实 Editor 用例检查最终 Markdown。
- 窄屏处于 Preview 时，Tool 插入内容后仅关闭侧栏，编辑区仍隐藏。使用后按有效分屏状态切回 Write，并在布局更新后恢复 CodeMirror 尺寸与焦点；真实 Editor 回归与浏览器检查均验证 Markdown 改变和编辑区显示。
- playground 插件徽章采用绝对定位，遮挡主题/插件控件。改为普通流和可换行布局，编辑器通过 flex 使用剩余视口高度。
- playground 最大长度输入清空后，宿主传递 undefined，编辑器仍保留上次限制。将空输入明确传为 Infinity，保留 0 等有效数值；浏览器检查同时验证超限仍可继续编辑与清空后提示消失。
- 原 playground smoke 依赖外部服务、固定输出文件，并只等待 Mermaid SVG 出现，会读到临时渲染容器。新入口自管服务/浏览器，每次创建独立证据目录，等待图表最终挂载，成功/失败均保存结果。

首次失败与后续结果分别留存。本地初始截图/结果在 `audit/prod-perf-playground-20261104/probe.png`、`probe-results.json`；灯箱失败截图在 `audit/prod-perf-playground-5HVLt7/dev-failure.png`；字号失败截图在 `audit/prod-perf-playground-B02O6u/dev-failure.png`。初始失败不代表修复后的验收结论。

## 脚本清理

- 根命令 `pnpm run test:playground` 统一调用已有 smoke 入口，默认开发与生产两种环境顺序验收，支持单环境及已有本地 URL。
- `evalInPage` / `waitForPage` 合并到 `prod-perf-cdp-client.mjs`；采样模块保留兼容转导出，升级复验脚本也复用它们。补充延迟就绪与超时回归。
- `prod-perf-reproduce.mjs` 移除 Vitest 3 已不支持的 `--threads false`，同步生成复现文档的现行命令。
- 移除无人引用的 `prod-perf-debug-mount.mjs` 和本批临时探查入口，保留原始证据与历史正式复现脚本。脚本目录说明见 [SCRIPTS.md](./SCRIPTS.md)。
- 将旧灯箱回归的固定 100ms 睡眠改为等待图片完成绑定，避免并行构建时动态导入尚未结束的误报。

## 验收结果

| 检查 | 结果 | 本地证据 |
| --- | --- | --- |
| 核心回归 | 27 文件 239/239，0 失败 | audit/prod-perf-playground-20261104/core-tests-verified.log |
| Node 脚本 | 46/46，0 skipped | audit/prod-perf-playground-20261104/script-tests-verified.log |
| 四模块聚合覆盖率 | statements/lines 86.17%、branches 86.03%、functions 81.08%，门槛通过 | audit/prod-perf-playground-20261104/coverage-verified.log |
| 完整构建 | 全部修复后退出 0 | audit/prod-perf-playground-20261104/build-verified.log |
| 打包消费/类型/Svelte 宿主/SSR | 全部修复后的复验通过 | audit/prod-perf-playground-20261104/package-tests-verified.log；audit/prod-perf-packages-J25I3D/results.json |
| Playground 开发 + 生产浏览器 | 两环境各 18/18，共 36 项通过；runtimeErrors 均为空；生产构建通过 | audit/prod-perf-playground-63KjRg/results.json、dev-results.json、preview-results.json；audit/prod-perf-playground-20261104/browser-verified-final.log |
| 升级复验脚本 | 全部通过，errors=[]，打包 Svelte 宿主挂载/编辑/双 Viewer 更新通过 | audit/prod-perf-playground-upgrade-final-20261104/upgrade-ui-results.json；audit/prod-perf-playground-20261104/upgrade-verified.log |
| generate:check / style / Git 空白检查 | 全部退出 0，生成产物无漂移 | audit/prod-perf-playground-20261104/generate-check.log、style.log、git-diff-check.log |

浏览器覆盖默认内置语法和插件、目录定位、手风琴、系统剪贴板读回、灯箱翻页/关闭、暗色和中文 locale、文字插入与 Ctrl+B/Ctrl+Z、Tool Enter/Space 与使用、长度提示、八种插件启停、全屏、tab 方向键、窄屏强制 split 与插入后返回编辑。

中文文字使用 CDP Input.insertText 注入，人工 OS IME 和真实移动设备继续 incomplete。本批没有重测完整性能/堆快照矩阵，也没有发布 npm；Svelte 编译器现有自闭合 div/交互元素提醒不计为浏览器运行时异常，未宣称编译警告清零。

## 复现

```sh
pnpm build
pnpm run test:playground
pnpm run test --run
pnpm run test:scripts
pnpm run test:scripts:coverage
pnpm run test:packages
pnpm generate:check
pnpm style
```

Playground 输出目录包含 `dev-results.json`、`preview-results.json`、`results.json`、各环境的桌面/暗色/窄屏截图与生产构建。升级复验需要将 test:packages 本次输出的 `svelte-consumer-dist` 传给 `audit/upgrade-ui-reproduce.mjs`。
