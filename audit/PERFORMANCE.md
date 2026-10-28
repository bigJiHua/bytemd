# 长文档性能基线与调度方案

本批使用真实 Svelte Editor 和构建后的核心/插件 ESM，固定 10/100/500 KiB ASCII 文档。core 包含标题、链接、强调、字号、颜色、引用和手风琴；enhanced 启用 GFM，每八节有一个 JS 代码块及两个公式，每篇有三个 Mermaid 图表。两种插件密度使用同一个确定性生成器，分别重复三次挂载及三次程序化编辑。真实键盘输入单独记录，不把 `replaceRange` 当作用户输入事件。

## 测量口径

- `parseMs`：unified 的 parse 调用，包含冻结处理器的开销。
- `transformMs`：unified 的整个 AST 转换阶段，包括内置语法、remark/rehype、HTML AST 与过滤。
- `stringifyMs`：HTML 序列化。
- `domAndCopyMs`：序列化完成至第一个 viewerEffect，含旧效果清理、Svelte DOM、代码复制按钮及这一段内的 Editor 工作；不是纯 innerHTML 的耗时。
- `forcedLayoutMs`：一次 scrollHeight 读取；其他隐式布局可能发生在其他阶段。
- `pluginsSettleMs`：从第一个 effect 至观察到所有预期公式、高亮和图表的完成时间；挂载时也包含后续 Editor 初始化，不是插件独占 CPU 时间。
- `endToEndMs`：从挂载/编辑事件开始至预期预览完成，编辑包含默认 300ms 防抖。
- `firstFrameMs`：下一次 requestAnimationFrame 的可用时间；不是操作系统实际显示时间，也不能代表防抖后的解析仍可响应输入。
- 长任务按与样本时间区间相交统计；包含开始于挂载计时之前的当前帧任务。挂载前的小量任务开销也可能计入，原始相对 startMs 保留。
- JS 堆是 `performance.memory` 的粗略估计，无强制 GC；DOM 数量只统计测量实例。卸载后 DOM 为零不能证明没有闭包或依赖库泄漏。

每组只有三个样本，汇总中位数与最差长任务，不宣称 p95 或生产 SLA。测试使用后台 in-app browser 标签页（Chrome 155、12 个逻辑线程、1280×720），部分 RAF 约 1 秒才触发；页面可见性与浏览器调度会影响结果。Vite 开发测量壳、浏览器负载、JIT、模块缓存及固定运行顺序也会影响绝对值；原始环境和每次样本保留在 JSON 中。

## 本批优化范围

KaTeX 和 highlight 在连续 DOM 工作约 8ms 后，优先通过 `scheduler.yield()` 让出主线程；浏览器不支持时使用可取消的 `setTimeout(0)`。单个表达式/代码块不能被中断，因此 8ms 是软预算。恢复处理时重新检查该次 Viewer 是否仍有效；更新和卸载清理待处理定时器并结束暂停的旧任务。原生 yield 本身不能取消，但恢复后不会继续处理旧节点。失败反馈、原文回退及成功后的 cleanup 语义保持一致。

该调度只拆开插件批量工作，不消除 Markdown 的全量同步 parse/AST/HTML 阶段，也不减少总解析量。长任务最大值可能仍由解析阶段决定；不能仅凭插件分批声称长文档已不卡顿。

## 完整 Editor 结果

两轮各保存 38 个样本（36 个正式挂载/编辑样本、2 个模块预热样本），另有 3 个真实键盘样本。以下为每组三次的端到端中位数，单位 ms；所有正式样本都达到预期 DOM 数量，无插件错误。

| 文档             |  挂载前 |  挂载后 | API 编辑前 | API 编辑后 |
| ---------------- | ------: | ------: | ---------: | ---------: |
| core 10 KiB      |   210.7 |   126.0 |      405.6 |      414.0 |
| core 100 KiB     |  2214.3 |  1059.8 |     2112.9 |      966.7 |
| core 500 KiB     | 28668.7 |  6233.6 |    31795.4 |     3875.3 |
| enhanced 10 KiB  |   372.3 |   329.3 |      486.1 |      683.0 |
| enhanced 100 KiB |  2572.6 |  2423.4 |     2543.7 |     3706.9 |
| enhanced 500 KiB | 35985.4 | 53115.2 |    37109.1 |    49231.7 |

**不能把整表时间差当作修复收益。** 本批没有修改 core 解析管线，但其 500 KiB 挂载 parse 中位数从 19384.2ms 变成 1052.9ms；同一后测页面的 core 500 KiB 真实单键 parse 又达到 22965.3ms。环境、运行顺序和运行时状态存在明显波动，尚未定位具体原因。增强文档的总完成时间反而变长，不能宣称长文档整体提速。

500 KiB 增强文档后测挂载的 parse/AST 转换中位数为 26945.0/8383.4ms；API 编辑为 26588.6/8144.3ms。分批插件仍发生在同步解析之后，无法移除这段主线程阻塞。插件完成时间中位数从挂载 5171.4ms 增至 14832.1ms、编辑 3276.0ms 增至 10842.1ms；它包含浏览器调度、DOM/布局和观察开销，不是纯库调用 CPU 时间。

完整数据：[前测](./performance-before.json)、[后测](./performance-after.json)、[汇总](./performance-summary.json)。初始 Node 同步基线的文档与运行环境不同，不能与本表相减。

## 插件专项与同页交替对照

插件专项预先生成 HTML、安装复制按钮并触发布局，解析和 HTML 准备不计入样本。每次使用新 DOM；测量覆盖 KaTeX、highlight、Mermaid 的实际完成以及期间浏览器任务。除了保留的前/后专项，还在同一页面交替执行“不分批/分批”各三次，顺序为 control、batched、batched、control、control、batched，降低固定先后顺序的偏差。

控制代码由当前插件移除批次让出逻辑而来；高亮复用生产插件初始化后的同一个库实例，初始化在计时前完成；公式使用同一 KaTeX ESM 入口和 `output: 'html'`。GFM、Mermaid、有效节点渲染、错误回退及 cleanup 保持一致。控制组用于有效内容的调度对照，不代表独立生产插件或失败重试的验收。

| 500 KiB 插件专项，3 次中位数（ms） | 总完成时间 | 每样本最大长任务 | 总阻塞时间 |
| --- | --: | --: | --: |
| 原始前测 | 1876.9 | 1068 | 1483 |
| 分批后测 | 3383.8 | 259 | 844 |
| 同页不分批控制 | 1653.8 | 1075 | 1428 |
| 同页分批 | 2731.9 | 221 | 714 |

同页对照中，最大长任务中位数下降约 79%，总阻塞时间下降 50%，总完成时间增加约 65%。六个样本均达到 774 个公式、387 个 JS 高亮块、3 个图表，无错误，卸载后 DOM 均为零。该结果支持“拆开连续插件任务”，不支持“插件更快完成”或“整篇长文档不卡顿”。每次让出后的布局、DOM 观察和浏览器调度也可能产生超过 8ms 的任务；8ms 只限制连续库处理的软预算，不是整个页面的帧耗时上限。

同页对照时，浏览器报告 `document.visibilityState = 'visible'`，且支持原生 `scheduler.yield()`；工具将页面保持在用户界面后台，不能由此推断 DOM 可见性为 hidden。定时器回退由回归测试验证，这组专项没有覆盖不支持原生 scheduler 的真实浏览器。真实输入仍有约 32 秒长任务，因此下一步优先处理同步解析和大 DOM 布局。

证据：[前专项](./performance-plugins-before.json)、[后专项](./performance-plugins-after.json)、[同页交替](./performance-plugins-paired.json)、[专项汇总](./performance-plugins-summary.json)，控制源见 `performance-control-highlight.ts` / `performance-control-math.ts`。

## 真实键盘结果

下表各规模每轮只有一个键盘样本，单位 ms。“末键 → 预览”包含默认 300ms 防抖；首 RAF 只表示解析开始前后的一次帧机会，不能证明整个编辑过程流畅。

| core 文档 | 实际按键数（前/后） | 首 RAF（前/后） | 末键 → 预览（前/后） |
| --------- | ------------------- | --------------- | -------------------- |
| 10 KiB    | 5 / 5               | 22.0 / 34.9     | 452.9 / 471.3        |
| 100 KiB   | 5 / 5               | 175.0 / 162.9   | 2306.2 / 3125.8      |
| 500 KiB   | 1 / 1               | 668.7 / 653.3   | 32651.4 / 32963.5    |

500 KiB 前测原本尝试发送 `abcde`，浏览器工具在首键后的同步解析期间超时，仅实际送入一个键。后测明确使用单键对照；没有把这两条记录伪装成五键输入测试。后测单键最大长任务 32082ms，长文档输入阻塞仍然存在。

## DOM、内存与验收

| KiB | core 节数 | enhanced 节数 | enhanced 公式 / JS 块 / 图表 | core / enhanced 预览节点 |
| --- | --: | --: | --- | --- |
| 10 | 69 | 62 | 14 / 7 / 3 | 595 / 1400 |
| 100 | 688 | 623 | 154 / 77 / 3 | 5937 / 13098 |
| 500 | 3423 | 3102 | 774 / 387 / 3 | 29519 / 64808 |

保存的已完成卸载样本中，测量 sandbox 的剩余 DOM 均为零。JS 堆估计保留每次挂载前、完成后和销毁后的值，但没有强制 GC、堆快照或真实内存曲线，不能据此认定没有泄漏。样本按固定顺序运行，缓存和旧对象可能影响后续测量。

最终源码回归 **19 文件、180/180 用例**，新增测试覆盖让出线程、更新取消、inline/display 并发卸载和原生调度晚恢复。全量 `pnpm build`（含 TypeScript build）退出 0；记录见 [回归结果](./performance-regression-results.json) 与 [构建日志](./build-performance.log)。构建保留了既有 Vue UMD external global 名称提示。

默认 Editor 从最新构建产物加载，中文 locale 更新后仍有 2 个公式、5 个高亮代码块和 1 个 Mermaid 图表，插件 alert 为零。见 [UI 结果](./performance-ui-results.json) 和 [截图](./performance-playground.png)。临时 5176 服务与 playground 测量入口在验收后清理，原有 5173 页面保留。

## 当时规划的后续解析方案

以下方案已在第五批实现可选 Worker 入口、注册/兼容与四框架契约；实测、生产打包要求和仍未完成的专项见 [WORKER.md](./WORKER.md)。本报告的第四批历史数据保持原样。

优先建立可选 Worker 渲染入口，保留当前同步管线作为兼容模式。Worker 需要独立纯处理器入口，避免核心 UI/CSS 模块；在 Worker 入口注册可信插件，只传 `{ requestId, value, serializableOptions }`，返回 HTML、HAST/源码块元数据及明确错误。DOM viewerEffect 留在主线程。

任意 remark/rehype、sanitize 回调和 remarkRehype handlers 是函数，不能直接结构化克隆给 Worker。不能静默丢弃这些扩展；应显式选择已注册处理器，无法支持的配置保留同步模式。四框架必须共用异步渲染、旧结果丢弃、错误反馈、插件清理和源码块映射契约。

Worker 转移 CPU 工作能改善主线程响应，但不会自动降低解析总耗时。还要测量首次启动、传输、旧任务结果丢弃，以及“活动任务 + 最新待处理内容”与 terminate/restart 的取舍。当前渲染内块 ID 不是跨编辑身份；引用链接、容器和全局插件也会跨块影响结果，因此不能直接按段落切片实现通用增量解析。

## 复现

```sh
pnpm build
cp audit/performance-ui.html playground/performance-audit.html
pnpm --filter playground dev --host 127.0.0.1 --port 5176 --strictPort --force
# 浏览器访问 /playground/performance-audit.html，运行完整基线。
# “准备真实输入”后在编辑区输入 abcde，再保存键盘测量。
# 500 KiB 使用单个按键，以便和保留的前测实际按键数一致。
# “运行插件专项”测三次；“运行调度对照”同页交替测六次。
# JSON 另存 performance-before.json / performance-after.json；结束后删除临时入口。
node audit/performance-summarize.mjs audit/performance-before.json audit/performance-after.json --out=audit/performance-summary.json
node audit/performance-summarize.mjs audit/performance-plugins-before.json audit/performance-plugins-after.json audit/performance-plugins-paired.json --out=audit/performance-plugins-summary.json
```

首轮测量漏计挂载所在长任务，未完成数据保留为 `performance-before-attempt.json`，不能使用其长任务字段评价优化。最终前后数据采用修正后的相同测量口径。
