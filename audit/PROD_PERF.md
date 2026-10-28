# 生产大文档验收：实测与复核

2026-10-26。第七批原先完成了工具和构建，但原采样报告只有路径错误，尚不能称作性能、IME 或内存验收完成。本轮修复测量链路并执行真实桌面 Chrome 生产页采样；第八批首轮优化见 [LARGE_DOCUMENT.md](./LARGE_DOCUMENT.md)。人工 OS 输入法和真实移动设备仍未完成。

## 实际完成情况

- 核心回归：23 文件 **210/210**；Node 脚本回归 **17/17**（生成器 9 项、测量工具 8 项）。完整 `pnpm build` 含 TypeScript 通过。
- 生产消费页来自已构建的 `packages/*/dist` 与 `bytemd/svelte`，再执行 `vite build` / `vite preview`；真实有界面 Chrome，独立临时用户配置，固定 1280×800 CSS 视口，样本记录页面可见性。
- 10/100/500 KiB × 同步/Worker × core/enhanced，每组 3 个有效键盘样本，共 **36 个**。10/100 KiB 每样本 5 键，500 KiB 每样本 1 键；逐一核对事件数量、最终文本和最新预览。
- 同步/Worker × 10/100/500 KiB 的 CDP composition 提交、取消，共 **12 个**场景。页面捕获开始、更新、结束事件；提交场景有限等待组合期间异步结果返回（5 秒），未采集到时显式标注 `asyncResultNotCovered`（spec 5.2.3 异常 2），再验证提交文本和预览，取消核对原文恢复。
- 内存使用 100 KiB enhanced/Worker，插件与 Worker 预热后执行 **3 轮**挂载、编辑、销毁，4 阶段强制 GC 和真实堆快照，共 **12 份快照/次完整验收**。解析快照真实节点字段，报告对象类型增量。

## 修复的测量问题

原 HTTP `request` 未结束，浏览器发现可挂起；Windows `file://` 主入口判断失效；启动脚本依赖错误路径、共享浏览器配置和盲目杀端口。现统一以脚本目录定位仓库，通过 `pathToFileURL` 判断入口，使用独立 Chrome 配置和本次拥有的进程；端口冲突报错，退出清理本次服务。

原脚本在触发动作后才订阅同步完成消息，重复顶层 `const` 的页面求值也会出错但被忽略。现先订阅、后执行；求值包在函数中，检查 `exceptionDetails`；拒绝迟到结果、失败样本和归档冲突。每次运行归档到新目录，不覆盖前几批证据。

原成本标记从 `viewerEffect` 才开始测 DOM，并把整个 Worker 往返标成通信、用零替代不可测项，还会把较晚 CodeMirror 更新误算成按键更新。当前使用下列边界：

| 指标 | 边界与限制 |
| --- | --- |
| CodeMirror 首次更新 | 捕获 keydown 至该键第一个 CodeMirror update；包含同步宿主回调，不是纯库 CPU 时间 |
| 首帧、RAF 间隔 | 请求期间 RAF 可执行时间及相邻帧最大间隔；不是操作系统实际呈现延迟 |
| 解析 | 相同处理器报告 `renderMs`；Worker 只传时长，不混用两线程绝对时基 |
| Worker 往返 | 含队列、启动、解析、传输及还原；扣除解析后的剩余值仍不是纯通信时延；同步模式记 null |
| DOM 提交/复制 | renderer 返回至 viewerEffect 开始；包括 Svelte 调度、HTML 提交和复制按钮 |
| 首次布局 | viewerEffect 中第一次强制读取预览高度的耗时 |
| 插件完成 | viewerEffect 开始至公式、高亮、图表达到 fixture 预期数量，包含其间布局和 RAF 等待 |

这些区间有包含关系，不是可以相加的穷尽四项成本分解。每组只有 3 个样本，报告中位数/范围，不报告 p95 或生产 SLA。`prod-perf-ui.svelte` 是本轮实际接入的测量实现；早期独立 probe/cost/tracker 模块未作为实测证据来源。

本轮进一步修复：composition 的异步结果等待从硬等 180 秒改为有限 5 秒并标注未覆盖（spec 5.2.3 异常 2）；阶段失败从中断后续改为各阶段独立继续；interaction 的 TOC 滚动同步阈值从固定 3px 改为动态减去 CSS `scroll-margin-top: 1.5em`（约 33.6px）后容差 16px，匹配 `scrollIntoView` 的设计边距。

## 默认模式的生产数据

以下是首轮核心修复后、未开启尺寸隔离的键盘样本中位数；所有规模和配置见 `prod-perf-review-final-analysis.json`。

| 规模/插件        | 模式   | 首 RAF ms | 最大长任务 ms | 请求至预览完成 ms |
| ---------------- | ------ | --------- | ------------- | ----------------- |
| 100 KiB core     | sync   | 44.6      | 487           | 1087.6            |
| 100 KiB core     | worker | 43.3      | 94            | 1107.1            |
| 500 KiB core     | sync   | 197.0     | 2447          | 2959.2            |
| 500 KiB core     | worker | 200.4     | 460           | 2922.9            |
| 500 KiB enhanced | sync   | 260.3     | 2828          | 4985.3            |
| 500 KiB enhanced | worker | 403.2     | 476           | 5116.5            |

Worker 明显降低解析引起的主线程长任务，但不减少总解析量，也没有消除大 DOM、布局和插件长任务。第八批可选尺寸隔离的同页对照和实际开启后的复验另列，不能把前后独立运行的差异全部归因于优化。

## 内存口径与结果

原始采样先发现每轮销毁后约 20,000 个节点/36 个监听器的增量。堆引用路径显示 DevTools 控制台保存的 DOM 参数保留旧预览，排除控制台根后，CodeMirror 的短时光标/blur 定时器仍会保留刚销毁的实例。下轮基线又确认每个新工厂长期增加约 100 个测量节点和 2 个全局监听器。

核心现按 document 复用已初始化的 CodeMirror 工厂，编辑器文档、历史、配置和选区仍各自独立；销毁通过公共选项停止光标闪烁并释放输入焦点。采样在每阶段清理 DevTools console roots，销毁阶段同时记录即时强制 GC 与 **等待 1 秒后再 GC** 的计数。

`prod-perf-review-full-final` 的三轮等待清理后结果：DOM 节点和监听器增量均为 **0**；JS 堆变化分别为 **-11,808 / +21,560 / +21,908 bytes**（GC 不确定性，非泄漏证明）。即时销毁仍有约 20,000 个节点的短时保留，已在原始记录中保存。快照对象/原生节点存在小幅变化；这不是"无泄漏"证明，也不覆盖 WeakMap、插件任意外部引用或长期会话。

## 证据与复现

| 内容 | 路径 |
| --- | --- |
| 复核前失败报告（保留） | `prod-perf-sampling-report.json` |
| 原始自动化基线 | `prod-perf-review-baseline/` |
| 排除控制台根的对照 | `prod-perf-review-memory-cleared/` |
| 核心初始化/清理修复后的完整采样、快照和 CPU/布局 trace | `prod-perf-review-final/`、`prod-perf-review-final-analysis.json` |
| 尺寸隔离开启后的完整采样与交互复验 | `prod-perf-review-optimized/` |
| 四阶段全链路闭环（performance+composition+memory+interaction） | `prod-perf-review-full-final/` |
| 堆引用路径 | `prod-perf-review-retainers-before-filtered.json`、`prod-perf-review-retainers-cleared.json` |
| 回归、生成、构建 | `prod-perf-review-containment-regression.json`、`prod-perf-review-script-tests.log`、`build-prod-perf-review-containment.log` |

```sh
# 完整复现：回归、包构建、生产页构建、独立浏览器、采样和清理。
node audit/prod-perf-reproduce.mjs

# 已有包构建时，只重建生产页并验证可选优化。
node audit/prod-perf-reproduce.mjs --skip-build --skip-regression --layout-containment --phases=performance,composition,memory,interaction

# 单独测量，自动生成独立运行目录；也可指定不存在的 --audit-dir。
node audit/prod-perf-reproduce.mjs --skip-build --skip-regression --phases=memory
node audit/prod-perf-summarize.mjs audit/实际运行目录
```

脚本默认 preview 4178、调试端口 9238；可设置 `--preview-port` / `--debug-port`。Chrome 路径可由 `CHROME_PATH` 指定。`--skip-*` 如实记为 skipped，不能据此声称构建/回归通过。原有 `prod-perf-run-sampling.mjs` 入口转发至统一复现流程。

## 未完成项

- 人工操作系统中文输入法及与自动化结果的差异验证；CDP composition 是自动化证据。
- 真实移动设备；当前标记 `incomplete`，固定桌面视口不替代真实设备。
- 进一步降低完整预览的解析、DOM 和插件成本；增量/分块/虚拟预览尚未实现。
- 依赖与发布工具链、发布格式、大版本迁移仍属后续独立批次。
