# ByteMD 核心功能审计与优化方案

初始审计日期：2026-10-25，最新复盘：2026-10-26。对象是当前本地工作区的 ByteMD v1 定制版本，包含此前尚未提交的功能和修复；不是对上游原版或某个发布版本的结论。初始审计阶段只增加报告、探针和测量产物；随后按用户授权实施核心源码修复及同大版本依赖补修。当前仍使用 Svelte 3 / CodeMirror 5，保留 ESM/CJS/UMD 发布格式。最新变更与证据索引见 [audit/REASSESSMENT.md](./audit/REASSESSMENT.md)。

## 本轮复盘与验收 — 2026-10-26

本轮全量验收：核心 **24 文件 221/221**、Node 脚本 **20/20**，完整构建、generate:check、style 与纯入口/SSR 检查通过。CI 运行 `pnpm run test:scripts:coverage`，覆盖全部 Node 脚本回归；generate、CDP client、archiver、summarizer 四个关键模块的聚合覆盖率为 **lines/statements 84.75%、branches 85.12%、functions 80%**，通过 80%/80%/80%/75% 门槛。这不代表全部审计脚本或核心组件的覆盖率。日志与 JSON 在 `audit/prod-perf-reassessment-20261026/`，保留前几批证据。

普通 Vite 4.5.14 开发页冒烟也通过：Editor 存在，手风琴 1 组/3 项、时间线 1 组/5 项、公式 2 个、高亮块 5 个、图表 1 个、复制按钮 5 个，错误提示和 pending 均为 0，控制台 error 为空；点击“点击展开更多”后对应项确实展开。记录和截图见 `audit/prod-perf-reassessment-20261026/playground.json` / `playground.png`。此项是功能冒烟。

本轮修复 comparison 汇总遗漏自定义尺寸/插件矩阵的问题，以及 CDP 同步发送失败和关闭后的 pending/定时器清理；回归覆盖实际分组与指标、发送失败、远端关闭及主动 disconnect。浏览器定向复验无错误，覆盖 12 个 CDP composition 场景、10 KiB/core 的 baseline/body-size 各 1 次、目录/手风琴/错误恢复/过期结果等交互。1 轮内存检查在销毁后等待 1 秒并强制 GC，nodes/listeners 增量 **0/0**，JS heap 增量 **+709,296 bytes**；即时销毁计数也保留。单循环结果不证明无泄漏，两次单样本对照不支持整体性能提升结论。本轮浏览器流程的 build/regression 如实为 skipped；构建和回归通过来自独立验收日志。

官方 registry 审计的工作区 `--prod` 图为 **0 critical / 3 high / 14 moderate / 5 low**，完整依赖图为 **3 critical / 20 high / 37 moderate / 8 low**。`--prod` 图包含私有 playground，不能直接等同于已发布包运行时漏洞数。旧嵌套 KaTeX 0.13.24/0.15.6 已在工作区通过定向 overrides 收敛到 0.16.47；根 overrides 不随 npm 包发布或继承，外部 ESM 消费者仍需独立安装验收。KaTeX low、Svelte 3 moderate 及 Vite/Vitest/Tinypool 等工具链公告仍待独立迁移，不能宣称安全清零。

第七/八批桌面自动化验收已完成，人工操作系统中文输入法和真实移动设备仍为 **incomplete**。第九批工具整理及同大版本补修完成，剩余安全工具链迁移待续；第十批发布格式与大版本迁移未启动。

## 第七批初始记录：生产大文档交互与内存验收 — 2026-10-26（历史记录，后续已完成桌面复验）

本节保留工具首次实现时的记录；当时只完成工具与构建，真实浏览器采样尚待执行，不能据此称为性能/IME/内存验收完成。后续已补桌面实测及第八批优化，实际状态见 [生产验收](./audit/PROD_PERF.md)、[定向优化](./audit/LARGE_DOCUMENT.md) 和 [本轮复盘](./audit/REASSESSMENT.md)。

**初始结论：采样与验收工具链已实现，被测对象零侵入，回归与构建通过；真实浏览器采样当时未完成。** 新增生产消费页（固定 1280×800 视口，复用 `performanceFixture` 与 Worker renderer 契约，CDP 回传约定前缀接口），CDP 自动化驱动层（客户端、浏览器启动、键盘/composition 注入、堆快照/GC/DOM counters），证据归档器（第七批前缀白名单，不覆盖前六批 112 文件），采样探针组（零侵入插件契约，composition 捕获、成本四项标记、内存计数），采样编排脚本（性能/IME/内存/成本/移动设备），复现脚本与汇总器。

被测对象零侵入：所有探针通过既有 `editorEffect`/`viewerEffect` 契约注入，未修改 bytemd 核心源码。成本四项分离用 `performance.mark`/`measure` 标记 CodeMirror 更新、Worker 通信、解析、DOM 插入布局。composition 证据区分 `automated-cdp` 与 `manual-os-ime`，纯文本插入标注 `notIME:true`。内存循环每阶段后强制 GC，保留对象变化报告含检查口径与已知盲区，不凭堆估计或 DOM 清零宣称无泄漏。移动设备未取得时显式 `status:'incomplete'`，不用桌面模拟代替。

验收：回归 **21 文件 206/206** 通过（与第六批基线一致），完整构建含 TypeScript 退出 0，生产消费页 `vite build` 退出 0。证据：[构建日志](./audit/build-prod-perf.log)、[完整构建日志](./audit/build-prod-perf-full.log)，文档见 [audit/PROD_PERF.md](./audit/PROD_PERF.md)。本批新增文件全部在 `audit/` 目录，不进入发布包 `files` 字段。前六批证据保留。

当时未完成项：真实移动设备验证（`status:'incomplete'`）、人工 OS 输入法 IME 证据（需人工验证者）、CDP composition 与真实输入法差异对比。后续第八批桌面优化与自动化验收已完成，人工/真实移动项仍待验。复现入口：`node audit/prod-perf-reproduce.mjs`。

## 第六批：安装与显式生成 — 2026-10-25（完成）

**审计结论：根安装生命周期不再隐式重写工作区，配置与手写文档由显式生成约定维护。** 已删除 postinstall，`pnpm generate` 校验全部计划后仅写有差异文件，`pnpm generate:check` 只读并报告漂移。保留现有自定义配置、依赖/版本/元数据、Worker/Svelte/CSS 出口及未标记 README；标记文档仅更新指定区域。CI 与发布命令显式准备和检查，本批未发布或升级依赖。

两次普通离线 frozen 安装、重复生成与异地 cwd 检查没有改写记录；两次完整构建含 TypeScript 通过，各自 226 个源文件/链接记录不变，209 个产物记录完全相同。生成器 9/9 回归，核心最终 21 文件 206/206，纯入口/SSR、全库 style 与 Git 空白检查通过。详细口径和原始证据见 [audit/GENERATING.md](./audit/GENERATING.md)。

本批首次全库格式化破坏了 playground 手风琴/时间线换行，并折行故意用于横向滚动测试的代码。已精确恢复原始 fixture，将其排除于通用 Markdown formatter，新增直接读取 fixture 的渲染回归；实际格式命令前后 SHA-256 不变，浏览器确认手风琴 1 组/3 项、时间线 1 组/5 项及公式/高亮/图表正常。三份共享使用文档与 PLAN 已同步。

下一项仍是前台生产性能、中文 IME、真实堆快照和大 DOM/CodeMirror 评估；发布依赖范围、工具链、fork 元数据、发布格式裁剪及大版本迁移仍待独立完成。

## 第五批：可选 Worker 渲染 — 2026-10-25（实现与验收完成）

新增无 UI/CSS 运行时依赖的 processor/worker 入口及宿主拥有的 Worker renderer。四框架 Editor / Viewer 接受可选 `renderer`；默认同步输出保持，异步 SSR 显示 pending 并在挂载后启动。请求携带 AbortSignal/版本，过期结果和失败不覆盖新文档，pending/error 清除旧预览、effect 与目录，成功后还原 VFile、HAST 和源码块。支持 queue/restart、启动/活动超时、共享请求和显式 destroy。

函数不能传入 Worker，默认遇到 remark/rehype/sanitize/handlers 回调回退同步；显式注册必须完整映射解析语义，非法 JSON 或不可克隆 metadata 明确报错。DOM 插件保留在主线程。真实验收发现 Vite 4 的浏览器实体解码入口依赖 document，Worker 接入须选择 `worker` 条件；模块分包使用 ES 格式及独立 Worker 文件名前缀。完整可运行配置与契约见 [audit/WORKER.md](./audit/WORKER.md)。

**审计结论：Worker 改善本次实测主线程响应，但大 DOM/CodeMirror 阻塞仍未解决。** 同页 20 个正式样本中，100 KiB core 每模式 3 次真实单键，最大主线程长任务中位数 1468→65ms，总阻塞 1435→19ms，最大 RAF 间隔 1534.3→130.6ms。500 KiB 单次真实单键最大长任务 24754→380ms，但 Worker 最大 RAF 间隔仍约 653ms。两线程执行相同解析代码却有显著管线时长差异，保留结果，不认定稳定总吞吐或解析算法提速；大文档单次样本不推导 p95。重型插件实际生成 154 个公式、77 个高亮块和 3 个图表，无插件错误。

验收：20 文件 **205/205** 全量回归，完整构建含 TypeScript 退出 0；纯入口 ESM/CJS 无 DOM Node 渲染、Svelte/React SSR 输出/不启动异步线程检查通过。四框架 async 契约与 Editor 源码块/目录由回归覆盖；真实 Worker 开发页复制、目录定位、错误反馈/清空/恢复和旧结果丢弃通过。证据：[回归](./audit/worker-regression-results.json)、[构建](./audit/build-worker.log)、[入口/SSR](./audit/worker-entry-results.json)、[性能原始数据](./audit/worker-performance-results.json)、[汇总](./audit/worker-performance-summary.json)、[交互](./audit/worker-ui-results.json)、[截图](./audit/worker-playground.png)。前几批证据保留。

消费页生产构建退出 0；实际加载生产 JS 和模块 Worker，生成 14 个公式、7 个高亮块、3 个图表，VFile/source blocks 保留。证据：[生产构建](./audit/build-worker-consumer.log)、[生产冒烟](./audit/worker-production-results.json)、[截图](./audit/worker-production.png)。只作为打包与加载验收，没有重测生产性能。尚未完成中文 IME、真实堆快照、移动设备或前台生产性能基线。该批规划的显式安装生成已在第六批完成；Worker 的 DOM 预览策略和依赖/发布格式仍按 PLAN 分项推进。

## 第四批：长文档端到端基线与插件调度 — 2026-10-25（完成）

本批使用构建后的 Svelte Editor、核心和插件 ESM，固定 10/100/500 KiB 两类文档。前后各保存 36 个正式挂载/API 编辑样本、2 个预热样本和 3 个真实键盘样本；额外保留插件专项前后各 3 次及同页交替对照 6 次。完整口径、原始数据和后续设计见 [audit/PERFORMANCE.md](./audit/PERFORMANCE.md)。

KaTeX/highlight 的连续 DOM 库处理改为约 8ms 软预算，优先原生 `scheduler.yield()`，不支持时使用可取消定时器。更新/卸载停止旧批次，原生 yield 晚恢复也不会处理旧节点；单个库调用不能被中断。失败反馈、成功后的原文恢复及各框架生命周期契约保持一致，没有新增公共参数或依赖。

**审计结论：插件调度降低连续阻塞，长文档同步解析仍是主要待处理问题。** 同页 500 KiB 有效内容对照中，最大长任务中位数从 1075ms 降到 221ms，总阻塞从 1428ms 降到 714ms，总完成时间从 1653.8ms 增至 2731.9ms。三对样本均正确生成 774 个公式、387 个 JS 高亮块与 3 个图表。该结果明确存在完成时间代价，不能称为整体提速。

完整 Editor 两轮的 core 解析耗时也出现大幅波动，尽管本批没有修改 core 管线；不把整表时间差归因于插件修复。500 KiB core 真实单键从按键至预览约 32.65/32.96 秒，后测最大长任务 32082ms；增强文档后测 parse/AST 转换仍约 26.6/8.1 秒。10/100 KiB 每轮实际 5 键；500 KiB 前测发送第一个键后工具超时，后测明确用 1 键对照。未声称输入已流畅，也未定位运行时波动的具体原因。

后测及同页对照都符合预期 DOM 数量、无插件错误，已完成卸载样本的 sandbox DOM 均为零；浏览器 JS 堆仅是估计，没有堆快照或泄漏证明。同页对照报告 DOM 可见性为 visible、支持原生 scheduler；工具页面保持在用户界面后台，RAF 存在调度波动。定时器回退、取消与晚恢复由测试覆盖；真实前台生产环境、中文 IME、移动设备和内存曲线尚未补测。

验收：**19 个文件、180/180 回归用例**；完整 `pnpm build` 含 TypeScript build 退出 0。证据：[回归](./audit/performance-regression-results.json)、[构建](./audit/build-performance.log)、[完整前后汇总](./audit/performance-summary.json)、[专项/交替汇总](./audit/performance-plugins-summary.json)。前几批数据保留。README、文档页、核心包和插件说明已同步调度行为及限制。

当时规划的可选 Worker 已在第五批实施，保留同步兼容并明确插件注册/回退契约；大 DOM、中文 IME、真实堆快照与前台生产基线继续独立评估，见 PLAN.md。

## 第三批：Mermaid 配置隔离与插件失败反馈 — 2026-10-25（完成）

Mermaid 的 `initialize` 修改共享配置，原实现只在插件工厂首次加载时初始化，后续 Viewer 或更新可能使用其他实例的配置；失败时也会把原代码块留成空容器。本批把配置初始化和 awaited render 放在共享队列中，给每次渲染分配唯一 ID，跳过过期任务，失败不阻断后续图表。源码在渲染和交互绑定成功前保持可见；临时容器不携带重复源码块标识，避免等待图表期间暂停滚动映射。成功替换与临时节点都有生命周期清理。

四框架通过核心 `runViewerEffects` 统一局部 alert、`locale.pluginError` 和冒泡的 `bytemd-plugin-error` DOM 事件。事件 detail 为 `{ error, plugin, element, file }`；诊断信息不插入提示 HTML。消息放在所属顶层块之后，避免行内公式产生嵌套段落。旧渲染与卸载后的报告被丢弃，更新时移除提示；单个同步 effect 或 cleanup 抛错不会阻止其他插件运行/清理。自定义异步 effect 仍需自行捕获异常并调用 `reportError`，返回 Promise 不在既有插件接口契约内。

KaTeX 的抛错和 `.katex-error` 输出均保留原公式并报告。浏览器复查发现 `throwOnError: false` 会把未知命令渲染成红色文本，却不生成 `.katex-error`，因此内部强制 `throwOnError: true` 并捕获异常；最终验证 `\unknowncommand` 保留原文并出现提示，同段后续 `$x^2$` 正常渲染。highlight 的模块/初始化/节点失败保留源码并报告，其他节点继续渲染。highlight 只在异步 init 完成后发布可用实例，避免多个 Viewer 共用工厂时抢先渲染。成功公式和高亮在 cleanup 时还原源码，语言更新可安全重建 effect。失败的加载 Promise 从插件缓存清除；真实网络恢复与浏览器模块重试策略未在本批模拟。

最终回归 **19 个文件、173/173 用例通过**。Mermaid 专项 8 项，KaTeX/highlight 异步专项 7 项，模块加载失败/卸载专项 6 项；共享 Viewer 契约在 Svelte、React、Vue 2、Vue 3 均验证局部提示、事件、旧报告失效和同步 effect/cleanup 隔离。前两批结果和初始审计证据保留。

最终源码的全量构建产物已完成，`pnpm exec tsc --build` 返回 0。第一轮构建在 Mermaid CJS 转换阶段退出且没有源码诊断，原日志保留；随后完整复跑通过。构建日志包含已有的 UMD 外部 Vue 全局名称提示，不影响构建完成。

浏览器从最新产物验收：A/dark 图表填充色 `rgb(31, 32, 32)`，B/forest 为 `rgb(205, 228, 152)`；更新 A 后保留自身主题，B 的图表 ID 和颜色保持。非法 Mermaid 保留 `invalid diagram` 源码、出现中文 alert，后续合法图表仍渲染；未知 KaTeX 命令保留原公式，合法公式继续渲染。语言切换后提示变为英文；highlight 初始化失败保留代码，恢复后高亮与图表正常、alert 清空。错误事件由宿主收集；专项记录未采集到控制台 error/warn，不把这一结果等同于未发生已报告的插件失败。

默认 Editor 冒烟确认 1 个 Mermaid 图表、2 个公式、5 个高亮代码块及 5 个复制按钮、79 个源码块标识，alert 为 0；首次目录跳转至“Mermaid 图表”后高亮正确，标题距预览顶部约 33.4px。临时 5176 服务、验证标签及 playground 入口已清理，原有开发服务保留。

| 本批证据 | 文件 |
| --- | --- |
| 最终完整回归 | [plugin-regression-results.json](D:/Code/jihau_top/AICode/bytemd/audit/plugin-regression-results.json) |
| 最终构建 / 首次尝试 | [build-plugin.log](D:/Code/jihau_top/AICode/bytemd/audit/build-plugin.log)、[build-plugin-attempt.log](D:/Code/jihau_top/AICode/bytemd/audit/build-plugin-attempt.log) |
| 浏览器验收 | [plugin-ui-results.json](D:/Code/jihau_top/AICode/bytemd/audit/plugin-ui-results.json) |
| 主题 / 失败降级 / Editor 截图 | [plugin-themes.png](D:/Code/jihau_top/AICode/bytemd/audit/plugin-themes.png)、[plugin-errors.png](D:/Code/jihau_top/AICode/bytemd/audit/plugin-errors.png)、[plugin-playground.png](D:/Code/jihau_top/AICode/bytemd/audit/plugin-playground.png) |
| 可复现专项页面 | [plugin-ui.svelte](D:/Code/jihau_top/AICode/bytemd/audit/plugin-ui.svelte)、[plugin-ui.html](D:/Code/jihau_top/AICode/bytemd/audit/plugin-ui.html) |

本批的配置队列只协调同一插件模块创建的任务，不能隔离宿主绕过插件直接调用 Mermaid 全局 API，也不提供进行中渲染的取消。重型插件与全量解析的端到端性能仍待下一批实测。

## 源码块映射与布局更新 — 2026-10-25

第二批处理滚动映射和目录定位。Editor 在最终 HAST 上给有源码位置的顶层块写入每次渲染的 `data-bytemd-block` 标识；预览按该标识关联源码行，而非按 AST/DOM 子节点顺序配对。DOM 插件包裹或删除块后，其余块仍可同步；替换节点需保留原标识，Mermaid 已同步。重复、重排、不可测量或没有剩余标识的布局安全跳过映射。

滚动几何改成失效缓存：正常滚动只插值，内容/DOM 变化、图片 load/error、手风琴 toggle、字体 loadingdone 或观察到的尺寸变化后，下次滚动重建映射。尺寸签名也会直接检查滚动范围与宽度，避免等待观察器时继续使用旧布局。编辑内容领先于防抖预览时暂停同步；回到已渲染内容时可以立即恢复。程序触发的滚动按预期位置抑制回环，避免吞掉后续手动滚动。布局失效不清除待处理的防回环标记，防止 CodeMirror 在首次跳转时修正未显示区域的行高后，再次反向调整预览；该浏览器追加问题已有独立回归。

目录跳转按源码块标识定位，高亮使用对应的源码块索引，并尊重 CSS `scroll-margin-top` / `scroll-padding-top`。浏览器发现默认标题约 34px 的滚动留白会让跳转后的高亮落在上一节，已加入留白处理及回归。DOM 插件插入嵌套标题不会改变跳转顺序。渲染失败时清空旧目录，切换文档时重置最浅标题级别，修复目录缩进残留。

新回归覆盖块身份、包裹/删除、重复/重排、非法范围、插值边界、缓存复用/失效、字体与事件清理、防抖预览、手动滚动、目录定位/失败/层级更新及独立 Viewer HTML；Mermaid 新增元数据保留验证。验证结果另存 `audit/scroll-regression-results.json`、`audit/build-scroll.log` 和浏览器记录，不覆盖上一批或初始证据。

第二批完整回归 **17 个文件、147/147 用例通过**，其中源码块/布局/目录回归 24 项、Mermaid 异步回归 3 项。旧防抖测试改为验证段落数量与文本，避免把 Editor 内部元数据当成内容回归；独立 Viewer 的原始 HTML 契约仍由测试验证。

最终源码的完整 `pnpm build` 已通过。playground 从重新构建并强制刷新依赖的 5176 临时服务验收：79 个源码块标识、Mermaid 容器保留标识；首次目录跳转后标题留白约 33.5px，高亮正确显示“Mermaid 图表”；编辑区与预览区手动滚动均继续同步。手风琴展开使预览高度从 7758px 增至 7834px，随后目录跳转与同步仍正确。记录同时保留修复前的错误高亮，便于对照。日志没有采集到 error，较早的 Tippy 开发警告保留在记录中。临时页面与服务已关闭，用户原有 5173 页面保留。

| 本批证据 | 文件 |
| --- | --- |
| 完整回归结果 | [scroll-regression-results.json](D:/Code/jihau_top/AICode/bytemd/audit/scroll-regression-results.json) |
| 源码块与布局回归 | [scroll.test.ts](D:/Code/jihau_top/AICode/bytemd/packages/bytemd/test/scroll.test.ts) |
| 完整构建日志 | [build-scroll.log](D:/Code/jihau_top/AICode/bytemd/audit/build-scroll.log) |
| 浏览器验收 | [scroll-ui-results.json](D:/Code/jihau_top/AICode/bytemd/audit/scroll-ui-results.json)、[目录与图表截图](D:/Code/jihau_top/AICode/bytemd/audit/scroll-preview.png) |

这些标识只用于一次渲染内的源码/DOM 关联，不是跨编辑持久 ID。映射仍为块级插值；不实现段落内逐行定位、增量解析、Worker 或虚拟预览。尚未重测 100/500 KiB 端到端性能和堆快照，不能把几何缓存验证当成长文档性能结论。异步插件配置与反馈已在第三批完成；后续按 [PLAN.md](./PLAN.md) 的验收顺序推进性能基线、安装生成和依赖工作。

## 第一批核心修复进度 — 2026-10-25

原始审计发现的 13 项缺陷已完成对应修复，另修复浏览器复查发现的 Mermaid 旧图残留。下面的历史审计保留原始复现、性能与依赖基线；其中失败数量描述修复前状态。

| 问题 | 本轮修复 | 验证范围 |
| --- | --- | --- |
| P1-01 / P2-08 | Vue 2/3 Editor 注销事件并销毁核心实例；补齐 `overridePreview` / `maxLength`，可选参数撤销后恢复默认值 | 两框架各 100 次挂载/卸载，参数动态更新与撤销 |
| P1-02 | Viewer 分别持有图片、配置、UI 与清理；每个 document 共用底层 zoom 协调器；卸载仅移除自身图片，丢弃迟到的模块加载 | 同一插件服务双 Viewer、打开灯箱时销毁、模块加载前销毁 |
| P1-03 | 内置行内样式限制 64 层、每个行内容器 10,000 个生成节点；内置转换前迭代检查 Markdown AST 深度 128 / 节点 100,000，超限显示原始文本 | 64/65/4096 层、宽区间与深层 Markdown；未把这项保护当成长文档性能优化 |
| P1-04 | 节点数不匹配、零滚动范围、非有限值或重复位置时安全跳过同步，清理滚动订阅 | 插件删除顶层块及不可滚动布局；源码块映射随后在第二批完成 |
| P2-01 | 图片 alt/title/URL 转义；空返回、失败或卸载后完成不插入 | 特殊文件名、标题、URL 与异步上传边界 |
| P2-02 / P2-03 | debounce/throttle 可取消，销毁清理排队任务；防抖参数动态生效；Editor effect 使用最新上下文 | 300→0、0→300、连续更新、销毁后回调及初始 effect |
| P2-04 | 四框架渲染失败清理旧内容与 effect，显示可本地化 alert，后续正常输入可恢复 | Svelte / React / Vue 2 / Vue 3 共用契约测试 |
| P2-05 | 用绝对偏移计算包裹与取消包裹的选区，保留选择方向 | 多行、反向选择、再次切换 |
| P2-06 | 只拆分含标记的段落，保留加粗、链接、代码等节点；未闭合容器保留原始段落 | 连续行、空行、行内 Markdown、列表与围栏代码 |
| P2-07 | 等待复制真实结果；处理剪贴板拒绝、fallback false；清理临时节点并恢复焦点 | 四框架复制失败契约、本地化反馈与浏览器成功反馈 |
| P2-09 | 四框架共用 ID 匹配与片段解码，支持链接内部标签点击 | 编码片段、非法片段、嵌套标签 |
| 浏览器追加问题 | Mermaid cleanup 还原原始 `<pre>`，让 Svelte 正确移除旧 SVG；Mermaid/KaTeX/highlight 增加过期结果保护；Svelte Viewer 仅在文件/插件变化时重建 effect | Mermaid 延迟渲染、成功渲染后更新与卸载，实际 playground 复查 |

medium-zoom 没有 destroy API，`detach()` 也不会注销库自身的 document/window 监听器，因此使用每个 document 一个协调器把这类监听器数量固定下来。Viewer 自身的监听器、图片成员、UI 和滚动锁在清理时释放；不声称依赖库的全局监听器归零。

资源预算在 Markdown 解析后、内置转换前执行，不限制解析器自身或可信 remark/rehype 插件的耗时与节点扩张。`maxLength` 仍按用户确认只提示超限，宿主需要另行控制保存校验和输入资源。源码块映射、长文档基线、Worker 和显式安装生成已分别在后续批次完成；堆快照、前台性能、工具链升级及发布裁剪仍按 [PLAN.md](./PLAN.md) 推进。

本轮默认回归 **16 个文件、122/122 用例通过**，独立修复探针 **37/37 通过**；原始 `probe-results.json` 的 24 项 / 15 项失败保留不覆盖。最终构建与浏览器验收记录在下方修复验证表。

**最终验收：** 最新 `pnpm build` 完整通过。实际 playground 默认演示验证了 5 个复制按钮、5 个提示块、3 个手风琴、2 组拼音、2 个 KaTeX 公式、1 个 Mermaid 图表、2 张可缩放正文图片；分割线图片不参与缩放。替换为审计样例后，旧 Mermaid 容器及 SVG 均为 0，手风琴保留加粗/链接，中文复制提示“已复制”，`maxLength=10` 仍允许输入与预览；非法锚点没有产生新的控制台错误。灯箱 1/2→2/2 后，在打开过渡完成时按 Escape，UI/蒙层归零并恢复滚动。

原有开发服务在构建删除/重建生成文件时记录了 HMR 导入失败，并继续显示旧插件代码；最终浏览器验收使用新的 `vite --force` 服务重新加载优化依赖。旧服务日志保留在 UI 结果的 `staleDevErrors`，新服务错误列表为空。开发指南已补充构建后重启及 `--force` 用法。

| 证据 | 文件 |
| --- | --- |
| 默认回归结果 | [regression-repair-results.json](D:/Code/jihau_top/AICode/bytemd/audit/regression-repair-results.json) |
| 独立修复探针结果 | [repair-results.json](D:/Code/jihau_top/AICode/bytemd/audit/repair-results.json) |
| Mermaid 异步回归 | [plugin-async.test.ts](D:/Code/jihau_top/AICode/bytemd/packages/bytemd/test/plugin-async.test.ts) |
| 完整构建日志 | [build-repair.log](D:/Code/jihau_top/AICode/bytemd/audit/build-repair.log) |
| 浏览器验收 | [ui-repair-results.json](D:/Code/jihau_top/AICode/bytemd/audit/ui-repair-results.json)、[预览截图](D:/Code/jihau_top/AICode/bytemd/audit/repair-preview.png)、[灯箱截图](D:/Code/jihau_top/AICode/bytemd/audit/repair-lightbox.png) |

## 初始审计结论（修复前基线）

**常规 Markdown 编辑、内置语法、四框架 Viewer 和单实例图片灯箱的主要路径可用，但当前版本在生命周期、插件实例隔离、异常输入和长文档处理上仍有明确缺口。适合继续迭代；在多编辑器页面、频繁路由切换或处理外部输入的宿主中，应先修复 P1 项再扩大使用。**

- 常规回归：12 个文件，69/69 用例通过。
- 独立边界探测：24 个探针，9 个通过、15 个未满足预期，归并为下面 13 项功能问题。失败探针用于复现现有问题，不是本次引入的回归。
- 默认渲染管线：7 组常见 XSS 输入被过滤。本次没有复现默认管线的脚本执行；这不能替代完整安全认证。
- 大文档：当前机器上，约 100 KiB 的混合 Markdown 同步处理约 789 ms，500 KiB 约 3275 ms。4096 层字号嵌套、约 64 KiB 输入触发栈溢出。
- 单实例灯箱：打开、1/2 → 2/2、标题、Tab 焦点循环、Escape 关闭、滚动锁定和恢复通过实际浏览器验证；共享同一个插件对象的双 Viewer 隔离失败。
- 依赖：发布包路径上有 7 条去重公告（5 moderate、2 low，涉及 KaTeX 和 diff），没有 high/critical。完整工作区的 `audit --prod` 输出为 26 high、38 moderate、8 low；其中所有 high 路径均属于 playground 工具链。两种范围不能混用。

## 方法与证据

| 层面 | 方法 | 证据 |
| --- | --- | --- |
| 常规行为 | 重新运行现有 Vitest 测试 | `pnpm exec vitest run --threads false`，69/69 |
| 边界行为 | 实际挂载 Svelte/Vue 编辑器、调用上传/文本操作、共享真实 medium-zoom 实例 | [探针源码](D:/Code/jihau_top/AICode/bytemd/audit/core.probes.test.ts)、[框架探针](D:/Code/jihau_top/AICode/bytemd/audit/framework.probes.test.ts)、[结果](D:/Code/jihau_top/AICode/bytemd/audit/probe-results.json) |
| 浏览器 | 独立 playground 页，读取 DOM、点击图片、切换灯箱、Tab/Escape | [UI 结果](D:/Code/jihau_top/AICode/bytemd/audit/ui-results.json)、[截图](D:/Code/jihau_top/AICode/bytemd/audit/lightbox-probe.png) |
| 性能 | Node 22.20.0，Windows，AMD Ryzen 5 4600U；三次样本中位数 | [测量脚本](D:/Code/jihau_top/AICode/bytemd/audit/benchmark.mjs)、[结果](D:/Code/jihau_top/AICode/bytemd/audit/benchmark-results.json) |
| 依赖 | 官方 npm registry，工作区 production 依赖路径；再过滤发布包路径 | [原始依赖报告](D:/Code/jihau_top/AICode/bytemd/audit/dependencies.json) |
| 构建 | 引用上一轮已完成的完整构建，同时检查当前产物与源码 | 本轮未改生产源码，因此未重复完整构建；本轮探针直接使用源码，性能测量使用上一轮生成的 ESM |

优先级含义：P1 为扩大使用前应处理的可靠性/资源问题；P2 为日常正确性、接口一致性和失败反馈问题。下面的优先级不是 CVSS 评分，也不意味着已证明远程漏洞。

## 初始已确认问题与方案（历史记录）

### P1-01：Vue 2 / Vue 3 Editor 没有销毁核心编辑器

位置：[Vue 2 editor.vue](D:/Code/jihau_top/AICode/bytemd/packages/vue/src/editor.vue:22)、[Vue 3 editor.vue](D:/Code/jihau_top/AICode/bytemd/packages/vue-next/src/editor.vue:41)。

**复现：** 挂载带 `editorEffect` 的 Editor，然后卸载 Vue 组件。初始化效果各调用 1 次，返回的清理函数调用 0 次。两个框架都没有调用核心实例的 `$destroy()`。

**影响：** 宿主路由切换后，核心 `onDestroy` 不运行，插件清理与 ResizeObserver 断开等逻辑不会执行。可能保留脱离页面的编辑器实例和观察对象。探针直接确认清理缺失；未用堆快照量化实际内存增长。

**方案：** Vue 2 在 `beforeDestroy`、Vue 3 在 `onBeforeUnmount` 或 `onUnmounted` 中销毁核心实例，并清空引用；在同一生命周期里注销事件订阅。

**验收：** 连续挂载/卸载 100 次，初始化/清理次数匹配；观察器断开；销毁后不再触发插件或宿主回调。

### P1-02：共享 mediumZoom 插件对象时，Viewer 实例互相干扰

位置：[plugin-medium-zoom/index.ts](D:/Code/jihau_top/AICode/bytemd/packages/plugin-medium-zoom/src/index.ts:185)。

**复现：** 同一个插件对象分别绑定 Viewer A、B。两边图片均被初始化。执行 A 的清理函数后，B 的 `medium-zoom-image` 类被移除；A 原图片反而没有按预期清理。

**原因：** `zoom`、`images`、`ui`、`uiCleanup` 位于插件工厂作用域，后一次 `viewerEffect` 覆盖前一次状态；清理函数引用共享状态。这与宿主复用一个 `plugins` 数组的常见用法冲突。

**方案：** 模块加载缓存可以共享；每个 Viewer 的 zoom、图片列表、UI 和清理状态必须放进该次 `viewerEffect` 的局部作用域。若要全局仅允许一个灯箱，另外实现显式协调器。

**验收：** 同一插件对象服务至少两个 Viewer；任意一方更新/卸载不影响另一方；切换或卸载时无残留蒙层、滚动锁或 document 监听器。

### P1-03：同步全量渲染缺少资源边界，深层语法可触发栈溢出

位置：[utils.ts](D:/Code/jihau_top/AICode/bytemd/packages/bytemd/src/utils.ts:714)、[viewer.svelte](D:/Code/jihau_top/AICode/bytemd/packages/bytemd/src/viewer.svelte:86)。

**复现：** `'[size=20]'.repeat(4096) + 'text' + '[/size]'.repeat(4096)`，输入 65,540 bytes；同步管线抛出 `RangeError: Maximum call stack size exceeded`。这是整条处理管线的结果，尚未将栈溢出归因到单个 AST 阶段。

**影响：** 防抖只减少执行频率，无法消除一次全量解析的阻塞。长文档和大量嵌套仍可卡住浏览器主线程；服务端同步渲染也需要输入资源限制。

**方案：** 先限制自定义节点嵌套深度/总节点数，超限明确降级为字面文本或返回错误；再引入长文档策略、后台解析或分块更新。`maxLength` 继续保留用户确认的提示行为，资源限制应使用独立配置。

**验收：** 深层输入不抛未处理异常，不留下旧预览；100/500 KiB 压测时记录端到端耗时、主线程长任务和内存，按宿主需求制定可用阈值。

### P1-04：滚动同步假设 AST 与 DOM 顶层节点严格一一对应

位置：[editor.svelte](D:/Code/jihau_top/AICode/bytemd/packages/bytemd/src/editor.svelte:238)。

**复现：** 合法 `viewerEffect` 移除一个顶层块，再触发编辑器滚动。读取 `rightNode.offsetTop` 时出现 `TypeError`。

**影响：** 插件修改、合并或移除块时，滚动映射可能错位或抛异常。图片、字体、公式、Mermaid 异步改变布局也会让缓存位置失效，但本轮只直接复现了节点数量不匹配。

**方案：** 短期增加缺失节点/零高度/无有效映射的保护，并安全跳过同步。长期以源码位置或稳定块 ID 建立映射，明确插件保留映射信息的约定；布局变化时重新测量。

**验收：** 删除/包裹/替换顶层块、空文档、无滚动空间、异步图片及图表均不抛异常，编辑/预览同步可以安全降级。

### P2 问题及方案

| 编号 | 已确认行为 | 位置 | 优化与验收 |
| --- | --- | --- | --- |
| P2-01 图片插入未转义 | 文件名 `pic](unwanted.png) ![x.png` 上传后生成 2 个图片节点，而不是 1 个；可产生意外资源请求。未证明绕过 sanitizer 执行脚本 | [editor.ts](D:/Code/jihau_top/AICode/bytemd/packages/bytemd/src/editor.ts:147) | 使用 Markdown AST 序列化或可靠的 alt/title/URL 转义；特殊文件名和标题仍生成一个正确图片节点；补失败、空返回、并发和上传后卸载测试 |
| P2-02 销毁后仍执行预览任务 | 销毁 Editor 后，排队的 `overridePreview` 仍调用一次，接收已脱离页面的预览节点 | [editor.svelte](D:/Code/jihau_top/AICode/bytemd/packages/bytemd/src/editor.svelte:162)、[debounce.ts](D:/Code/jihau_top/AICode/bytemd/packages/bytemd/src/debounce.ts:1) | debounce/throttle 提供 `cancel`，销毁时取消；异步插件用生命周期标记或版本号丢弃过期结果 |
| P2-03 防抖参数更新无效 | 把 `previewDebounce` 从 300 改为 0，后续内容在 1 ms 后仍显示旧值 | [editor.svelte](D:/Code/jihau_top/AICode/bytemd/packages/bytemd/src/editor.svelte:162) | 改变配置时取消旧任务并重新建立调度器；覆盖 300→0、0→300 与连续更新 |
| P2-04 渲染失败留下旧预览 | 成功渲染后输入深层嵌套，异常被 `console.error` 吞掉，屏幕仍显示上一份内容 | [viewer.svelte](D:/Code/jihau_top/AICode/bytemd/packages/bytemd/src/viewer.svelte:77) | 增加统一错误事件/状态和清晰的过期预览提示；Svelte/React/Vue 2/Vue 3 使用一致策略；错误恢复后正常重渲染 |
| P2-05 多行包裹选区错误 | 对 `first\nsecond` 加粗后，文本正确变成 `**first\nsecond**`，但只选中 `second` | [editor.ts](D:/Code/jihau_top/AICode/bytemd/packages/bytemd/src/editor.ts:47) | 使用绝对文本偏移与 `indexFromPos`/`posFromIndex` 计算选区；覆盖多行、反向选区、再次切换和撤销 |
| P2-06 手风琴与行内 Markdown 不兼容 | 连续行 `+++ Title\n**bold**\n+++` 不能生成预期的 `<details><strong>`；有无空行会改变解析路径 | [utils.ts](D:/Code/jihau_top/AICode/bytemd/packages/bytemd/src/utils.ts:145) | 从原始块边界解析容器，保留内部 Markdown AST；连续行与空行写法的加粗、链接、代码、列表保持一致 |
| P2-07 复制失败被误报成功 | `document.execCommand('copy')` 返回 false 时仍显示“已复制”；`writeText` 的拒绝也没有处理 | [utils.ts](D:/Code/jihau_top/AICode/bytemd/packages/bytemd/src/utils.ts:1046) | 只在真实成功后提示成功，处理权限拒绝/不支持并允许手动复制；恢复焦点、清理临时节点；文案国际化 |
| P2-08 Editor 封装参数不一致 | Vue 3 未声明 `maxLength`；Vue 2/3 均未声明 `overridePreview` | [Vue 2 Editor](D:/Code/jihau_top/AICode/bytemd/packages/vue/src/editor.vue:9)、[Vue 3 Editor](D:/Code/jihau_top/AICode/bytemd/packages/vue-next/src/editor.vue:8) | 从核心 `EditorProps` 建立统一封装契约；覆盖传入、动态更新、撤销可选值；继续保留 `maxLength` 提示语义 |
| P2-09 锚点字符串直接拼入 CSS 选择器 | 点击 `<a href="#&quot;">broken</a>` 产生一次选择器异常；四个 Viewer 均采用相同拼接方式 | [Svelte Viewer](D:/Code/jihau_top/AICode/bytemd/packages/bytemd/src/viewer.svelte:55)、[React Viewer](D:/Code/jihau_top/AICode/bytemd/packages/react/src/viewer.tsx:51) | 通过 ID 查找/安全转义定位，并处理编码、空目标和内部标签点击；非法片段安全忽略，不抛异常 |

## 安全边界与依赖结论（初始审计基线）

默认管线过滤了 script、事件属性、javascript 链接、SVG onload、iframe/srcdoc、危险原始 style 和非法颜色标记。字号/颜色回填由固定范围及十六进制校验控制，本次样例没有发现可执行 CSS 注入。

**rehype 插件位于 sanitizer 之后，是可信代码边界。** 探针确认，插件可在该阶段添加 `<script>` 并原样输出。这是现有扩展能力，不应报告为普通 Markdown 的 XSS 漏洞；文档必须明确插件和自定义 sanitize 的信任要求。若引入不可信扩展，需要独立隔离设计，不能只依赖前面的 sanitizer。

下表保留初始依赖报告，当前数量与修复边界见顶部本轮复盘及 [audit/REASSESSMENT.md](./audit/REASSESSMENT.md)。依赖报告应按范围阅读：

| 范围 | 初始结果 | 解释 |
| --- | --- | --- |
| 发布包路径，去重公告 | 0 high/critical，5 moderate、2 low | KaTeX 6 条、diff 1 条；包含旧传递 KaTeX 和当前 KaTeX 的低危公告 |
| 全工作区 `--prod` | 26 high、38 moderate、8 low、0 critical | playground 将开发工具放在 production dependencies，导致 Vite、Svelte、Rollup、PostCSS 等进入此范围；所有 high 路径均属于 playground |

**方案：** 将 playground 开发工具按实际用途迁至 devDependencies；单独扫描发布包与开发环境。对 Vite 等工具链升级制定兼容验证，对旧传递 KaTeX 评估版本覆盖或相关插件迁移。公告涉及 `trust`、原型污染或特定解析 API 时，进一步检查实际调用路径；不要把“存在依赖公告”直接等同于“当前编辑器可被利用”。

历史计划中的“high 清零”不能当成今天整个工作区或外部消费者的安全结论。`postinstall` 自动重写已在第六批移除，fork 发布元数据与工具整理已在第九批完成；剩余安全工具链迁移及外部消费者的嵌套依赖验收仍待推进。

## 初始同步处理与包体积基线（历史数据）

测量只包括 Markdown→HTML 同步处理，不包括 DOM 更新、布局、语法高亮、KaTeX、Mermaid、图片加载和宿主 React/Vue 渲染。样本为重复的标题/段落/强调/链接/字号/颜色混合文本；每类仅 3 次，存在 JIT、顺序和机器负载偏差，不是浏览器 SLA 或 p95。

| 输入规模   | 每次新建 processor，中位数 | 复用 processor，中位数 |
| ---------- | -------------------------- | ---------------------- |
| 约 10 KiB  | 120.58 ms                  | 75.70 ms               |
| 约 100 KiB | 788.73 ms                  | 698.91 ms              |
| 约 500 KiB | 3275.09 ms                 | 3392.26 ms             |

仅缓存 processor 不能解决长文档问题。优先减小每次解析/DOM 替换的工作量，给重型 DOM 插件增加可见区域或空闲调度，并让过期任务可丢弃。

Worker 可作为纯解析管线的可选优化，但任意函数形式的 `remark`/`rehype` 插件不能直接传给 Worker。需要可序列化的插件注册方式或在兼容模式下保留主线程执行；DOM `viewerEffect` 必须留在主线程。

初始审计时的构建产物中，核心 `dist/` 约 2.10 MB，Mermaid 插件 `dist/` 约 10.35 MB；这些是目录总字节数，包含 ESM/CJS/UMD 和多个 chunk，**不是页面实际下载量**。ESM 包还引用外部依赖，入口文件大小也不代表完整加载成本。格式裁剪应先统计宿主使用方式，再按 PLAN 独立处理。

## 初始建议实施顺序与验收

| 批次 | 工作 | 验收 |
| --- | --- | --- |
| 1：生命周期和实例隔离 | 修复 Vue Editor 销毁；mediumZoom 状态局部化；调度器 cancel；过期异步结果保护；封装参数补齐 | 路由往返 100 次、双 Viewer 共享插件、打开灯箱时卸载、上传/渲染未完成时卸载均无串扰和残留；对应探针转绿 |
| 2：编辑/预览正确性 | 上传 Markdown 序列化；多行选区；统一容器解析；锚点定位；防抖参数更新；复制错误反馈；统一渲染错误状态 | 特殊文件名、反向多行选择、撤销/重做、Markdown 混排、非法片段和权限失败均有确定结果；四框架契约一致 |
| 3：长文档与滚动 | 嵌套深度/节点预算；稳定块映射；布局失效检测；解析任务版本控制；评估 Worker/分块/虚拟预览 | 深层输入安全降级；空文档/插件替换块不异常；固定机器与文档集记录端到端 p50/p95、长任务和内存，证明优化收益 |
| 4：工程和依赖 | 开发/发布依赖分层；升级受影响工具链；取消隐式 postinstall 改写；明确源码 dev 与发布产物验证；清理 fork 元数据 | 安装不修改 tracked 文件；发布范围独立 audit；构建和四框架消费示例通过；体积统计可解释 |
| 5：大版本迁移 | unified/remark/rehype、Svelte 5、CodeMirror 6 单独评估 | 先冻结语法、插件、事件、封装契约与现有回归集；分项目迁移，不与前述修复混在一起 |

初始方案中的批次 1/2、安全降级保护、源码块映射、异步插件配置与反馈、长文档端到端基线、插件调度及可选 Worker 核心已完成。桌面生产性能、CDP composition、真实堆快照、可选尺寸隔离和发布工具整理已在后续批次验收；人工 OS 输入法、真实移动设备、进一步降低完整预览成本，以及安全工具链/发布格式/大版本迁移仍待推进。

## 保留的设计行为与待测范围

- `maxLength` 按用户确认继续只提示超限；宿主负责保存校验。它不是输入拦截，也不能承担渲染资源限制。
- 编辑器受控：宿主接收 `change` 后更新 `value`。探针确认外部 value 更新也会发一次完整 change，宿主需避免无意义的持久化/循环。
- 初始审计没有使用移动设备、真实中文 IME、读屏器或堆快照；后续已补桌面堆快照与 CDP composition，人工 OS 输入法、真实移动设备、触摸拖拽、读屏体验及长期内存曲线仍需补测。
- SSR 验证覆盖了无 DOM 的同步处理管线，未重新跑所有 React/Vue/Svelte 服务端消费示例。
- Mermaid 旧图残留、三个异步 DOM 插件的过期结果保护、多实例配置隔离与统一插件错误 UI 已完成回归和浏览器专项验证；配置队列仅协调本插件模块，直接调用 Mermaid 全局 API 和真实网络恢复仍需宿主自行处理。
- 手工浏览器验证覆盖的是 Svelte playground；框架边界问题由真实组件的 jsdom 探针验证，不能替代全部宿主浏览器 E2E。

## 复现命令

```sh
# 当前全量回归（24 文件 221 用例），不覆盖历史结果文件
pnpm run test --run --threads false

# Node 脚本回归与四个关键模块覆盖率门槛（20 用例）
pnpm run test:scripts:coverage

# 独立修复探针，37 个用例预期通过；保留原始失败结果
pnpm exec vitest run --config audit/vitest.config.mjs --threads false --reporter=default --reporter=json --outputFile audit/repair-results.json

# 完整构建
pnpm build

# 插件专项浏览器复验（构建后运行；结束后删除临时 playground 入口）
cp audit/plugin-ui.html playground/plugin-audit.html
pnpm --filter playground dev --host 127.0.0.1 --port 5176 --strictPort --force
# 浏览器访问 http://127.0.0.1:5176/playground/plugin-audit.html

# 另存新的性能测量，使用已构建的核心 ESM，不覆盖原始基线
node audit/benchmark.mjs audit/benchmark-repair-results.json

# 官方 registry 的工作区 dependency audit
pnpm audit --prod --json --registry=https://registry.npmjs.org
```

修复场景已迁入默认回归集；独立探针导入同一测试源码，属于另一入口的复验，不能与默认回归相加当成不同用例数量。
