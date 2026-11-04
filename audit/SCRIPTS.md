# 脚本入口与维护

## 日常开发与发布

| 命令 | 用途 |
| --- | --- |
| `pnpm generate` / `pnpm generate:check` | 生成三份文档与包元数据 / 检查漂移 |
| `pnpm build` | 清理包构建目录，生成 ESM/CJS、Svelte 源入口、类型和主题 |
| `pnpm run test --run` | 核心与框架回归，一次运行后退出 |
| `pnpm run test:scripts` | 自动发现 `scripts/test/*.test.mjs` 全部 Node 测试 |
| `pnpm run test:scripts:coverage` | 同一套 Node 测试，额外检查四模块聚合覆盖率 |
| `pnpm run test:packages` | 构建后实际 tarball 消费、类型、Svelte 宿主构建与纯入口/SSR |
| `pnpm style` | 格式检查，生成 README 不参与手工格式化 |
| `node scripts/publish-jihua.mjs --dry-run` | 发布演练与 manifest 还原，不联网发布 |

`scripts/utils.mjs` 提供仓库/包目录和预处理配置。`scripts/icon.mjs` 是图标生成工具；它与历史测量脚本均保留，不属于临时调试文件。

## Playground 浏览器实测

```sh
pnpm build
pnpm run test:playground
pnpm run test:playground --mode dev
pnpm run test:playground --mode preview
pnpm run test:playground --help
```

入口为 `audit/prod-perf-playground-smoke.mjs`。默认依次启动开发服务、构建 playground 并启动生产 preview，在独立无头 Chrome 中检查默认示例、目录/手风琴、系统剪贴板、图片灯箱、语言/主题、键盘编辑与撤销、Tool、长度限制、八种插件开关、全屏与 390px 窄屏。真实鼠标/键盘输入通过 CDP 注入，中文文字插入不替代人工操作系统 IME 验收。

前置要求为已构建的 workspace 包、Node 22（内置 WebSocket）和可用 Chrome；可用 `CHROME_PATH` 指定浏览器。默认 HTTP 5198、CDP 9398，可用 `--port` / `--debug-port` 修改。`--url` 或 `PLAYGROUND_URL` 可测试已有本地服务；此时记录为 external，不宣称完成开发/生产两种环境。

默认每次建立新的 `audit/prod-perf-playground-*` 证据目录。`--output audit/prod-perf-playground-<name>` 指定目录时，目录必须尚不存在。成功/失败均保存检查结果；截图保存在同目录，生产构建也留在该目录。脚本结束关闭自身服务、浏览器，不终止占用端口的其他进程。

## 其他复现入口

| 入口 | 范围 |
| --- | --- |
| `audit/upgrade-ui-reproduce.mjs` | 第十一批表单/键盘/resize/主题/窄屏与可选打包 Svelte 宿主复验 |
| `audit/prod-perf-reproduce.mjs` | 生产大文档采样、内存、composition；默认先核心回归和完整构建 |
| `audit/worker-entry-check.mjs` | 纯入口与默认/异步 SSR，已由 test:packages 调用 |
| `audit/generation-audit.mjs` | 生成/构建的源文件与产物快照对比 |
| `audit/benchmark.mjs` | 历史 Markdown 处理性能复现 |
| `audit/architecture-benchmark.mjs` | CM5/CM6 生产矩阵、隔离内核、默认同步首屏与长时间 soak；每次新证据目录 |
| `audit/prod-perf-worker-entry.mjs` | 生产采样的纯 Worker 入口，纳入版本管理，无 ignored TS 文件依赖 |
| `scripts/stage-release.mjs` | 所有发布包的独立 scope/alias staging，输出 tarball/integrity 清单，不改源码 manifests |
| `scripts/check-release-consumers.mjs` | 仓库外 TEMP 的核心/插件/React/Vue 2/Vue 3 独立 npm 安装和运行 |
| `scripts/check-bundle-size.mjs` | 复用 bundlewatch 的 gzip 预算，纯本地测量，无远程上报依赖 |
| `audit/cm6-v2-input-verify.mjs` | CM6 实键盘、原生事务与插件动作、composition 候选/提交/取消；每次独立证据目录 |
| `audit/cm6-closeout-verify.mjs` | CM6 语法 token 亮/暗、Enter 列表续行与 100 次挂载/销毁；每次独立证据目录 |

架构复测：`node audit/architecture-benchmark.mjs --label=cm6 --samples=3 --startup`。纯长时间测试：`node audit/architecture-benchmark.mjs --label=cm6-soak --skip-matrix --skip-kernel --soak-minutes=30 --heap-snapshots`。独立 HTTP/CDP 端口可通过 `--port` / `--debug-port` 设置。纯 soak 的 matrix/kernel 明确记为 skipped；其独立页面构建仍实际运行。每个 GC checkpoint 清理 DevTools console 引用，再强制 GC。

`publish-jihua.mjs --dry-run` 现在调用独立 staging 打包并核对源清单字节未变；不再执行原地 publish --dry-run。可仍按上游名或 @jihua 名指定目标。staging 允许演练混合版本；正式 release:stage 默认要求所有包统一版本。

CDP 会话与通用求值/等待位于 `audit/prod-perf-cdp-client.mjs`；`prod-perf-sample.mjs` 保留兼容转导出。页面求值统一检查异常，事件等待在动作前订阅。无人引用的 `prod-perf-debug-mount.mjs` 临时诊断入口已移除；历史验收文档、原始证据与仍有用途的复现脚本保留。

`CompositionInjector` 通过 `Runtime.addBinding` 转发页面实际 DOM compositionstart/update/end，注入前安装、结束后移除。CDP Input 域没有 compositionEvent 通知；旧脚本对该不存在事件的订阅已移除。该证据仍不等同 OS 人工 IME。

采样目录与原始 JSON/截图保持 Git 忽略。新增 Node 脚本回归放入 `scripts/test/`，普通测试和覆盖率入口会一起发现它。
