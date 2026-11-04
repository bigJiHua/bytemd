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

CDP 会话与通用求值/等待位于 `audit/prod-perf-cdp-client.mjs`；`prod-perf-sample.mjs` 保留兼容转导出。页面求值统一检查异常，事件等待在动作前订阅。无人引用的 `prod-perf-debug-mount.mjs` 临时诊断入口已移除；历史验收文档、原始证据与仍有用途的复现脚本保留。

采样目录与原始 JSON/截图保持 Git 忽略。新增 Node 脚本回归放入 `scripts/test/`，普通测试和覆盖率入口会一起发现它。
