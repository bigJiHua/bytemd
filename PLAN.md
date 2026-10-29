# ByteMD 现代化与瘦身计划

> 范围：只改本地 fork `bigJiHua/bytemd`，不碰 Main。目标：先修正确性/安全，再砍冗余依赖与发布格式；保持现有主题/示例可用。暂缓：Svelte 5、CodeMirror 6 属于重写级迁移，不在前几阶段。

## 决策基线

- 不先动 Svelte 版本，不先动 CodeMirror 版本。
- UMD/CJS 发布格式裁剪会改变包的兼容面，等确认后再做。
- 每批修改后至少跑：`pnpm test`、`pnpm build`、playground 冒烟。
- 安全审计使用官方 registry（当前镜像的 audit 接口返回 405）。

## 阶段

### 核心审计修复 — 2026-10-25（完成，优先于发布裁剪和迁移）

依据 [AUDIT.md](./AUDIT.md) 的 13 项已确认问题，先保持 Svelte 3 / CodeMirror 5 和现有发布格式，完成以下修复。

#### R1 — 生命周期、实例隔离与异常保护

- [x] P1-01：Vue 2/3 Editor 卸载销毁核心实例、注销事件；可选参数更新/撤销一致。
- [x] P1-02：mediumZoom 每个 Viewer 独立持有图片、配置、UI 与清理状态；每个 document 共用一个底层协调器，避免依赖库全局监听器随挂载累积；异步加载结束后检查是否已卸载；灯箱清理不影响其他实例。
- [x] P2-02/P2-03：debounce/throttle 支持取消；销毁取消预览/刷新/滚动任务；previewDebounce 动态更新生效；阻止过期 effect 回调。
- [x] P1-03：内置区间语法增加嵌套深度/节点预算，超限降级为字面文本；保留 maxLength 仅提示行为。
- [x] P1-04：滚动映射检查节点对应关系、可滚动高度、有限值；不匹配时安全跳过；清理滚动订阅和观察器。

#### R2 — 编辑与预览正确性

- [x] P2-01：上传图片 alt/title/URL 序列化转义；上传失败、空返回和卸载后完成不插入内容。
- [x] P2-04：四框架 Viewer 渲染失败清理旧预览与 effect，显示错误状态，恢复后重新渲染。
- [x] P2-05：按绝对文本偏移计算多行/反向包裹与取消包裹选区。
- [x] P2-06：手风琴按块边界识别，保留内部 Markdown 节点，覆盖连续行及空行内容。
- [x] P2-07：复制仅在真实成功后提示；处理权限拒绝和 fallback 失败，清理临时节点并恢复焦点。
- [x] P2-08：Vue Editor 补齐核心参数并覆盖动态更新、可选值撤销。
- [x] P2-09：四框架共用安全锚点定位，支持内部标签、编码片段，非法目标不抛异常。
- [x] 浏览器追加问题：Mermaid 清理时还原被替换的原始节点，避免内容更新后残留旧 SVG；Mermaid/KaTeX/highlight 丢弃过期异步结果；Svelte Viewer 只在文件或插件变化时重建 effect，保留首次异步初始化。

#### R3 — 验收与文档

- [x] 将修复场景迁入默认回归集；保留审计时的原始结果，单独记录修复后探针结果。
- [x] `pnpm run test --run --threads false`、独立探针、`pnpm build` 通过；playground 从最新构建产物冒烟。
- [x] 更新 AUDIT.md 修复状态、README 使用语义和本计划的验证结果；只标记实测通过的工作。

#### 后续优化（本轮不承诺性能或依赖升级完成）

- [x] 每次渲染的源码/DOM 块身份映射及布局失效检测（见第二批完成记录）。
- [x] 10/100/500 KiB 端到端性能与长任务基线（第四/第五批）。
- [x] 可选 Worker、函数插件兼容策略与四框架异步契约（第五批）；增量/分块/虚拟预览仍待独立评估。
- [x] 桌面生产消费页、自动化 composition 与真实堆快照采样（第七/八批复核）；人工 OS 输入法与真实移动设备仍未完成。
- [x] 移除 postinstall 隐式改写，显式生成与安装/构建幂等验证（第六批）。
- [x] 开发/发布依赖范围、Lerna 移除、engines 与 fork repository（第九批）。
- [ ] 受影响工具链的大版本升级；发布裁剪和框架迁移仍按 Phase 3/5 单独推进。

### 第二批：源码块映射与布局更新 — 2026-10-25（完成）

- [x] Editor 预览在最终 HAST 上标记源码块；按标识匹配 DOM，支持包裹、删除和保留标识的替换；重复或重排的标识安全降级。
- [x] 使用失效缓存代替每秒节流测量；内容、图片加载、手风琴、字体、尺寸和 DOM 插件变化后重新测量；销毁清理订阅；布局失效保留待处理的防回环标记，修复 CodeMirror 首次跳转时修正行高导致的预览回跳。
- [x] 编辑内容领先于防抖预览时暂停同步，渲染失败清空目录；目录高亮关联源码块并处理 CSS 滚动留白，跳转不受嵌套标题影响。
- [x] Mermaid 替换容器保留源码块标识；24 项滚动专项、17 文件 147/147 完整回归及全量构建通过；浏览器验证首次目录跳转、高亮、双向手动同步和手风琴布局变化。
- [x] 更新 AUDIT / README 的插件契约与进度；长文档端到端性能、Worker、工具链及发布格式仍单独推进。

### 第三批：Mermaid 配置隔离与异步插件失败反馈 — 2026-10-25（完成）

- [x] Mermaid 配置与渲染在共享队列中成对执行；唯一图表 ID，过期任务跳过，失败不阻塞后续任务。
- [x] Mermaid 失败保留原代码块，临时渲染节点与成功替换均可清理；调用图表交互绑定。
- [x] 四框架统一 viewerEffect 错误报告、局部本地化提示和 DOM 错误事件；更新/卸载屏蔽迟到报告。
- [x] KaTeX/highlight 模块或单节点失败保留原内容，并继续处理其他节点；highlight 初始化完成后才发布实例。KaTeX 内部启用并捕获解析异常，使未知命令也有可识别反馈。
- [x] 19 个文件、173/173 默认回归，完整构建、TypeScript 检查与实际浏览器验证通过；更新 AUDIT、插件契约和进度，保留前两批证据。

### 第四批：长文档端到端基线与插件调度 — 2026-10-25（完成）

- [x] 固定 10/100/500 KiB 文档与插件密度，使用真实 Editor 记录解析、转换、HTML、DOM、布局、插件完成时间和长任务；前后各 38 个样本另加 3 个键盘样本。
- [x] 分开验证程序化编辑与真实键盘输入；10/100 KiB 每轮实际 5 键，500 KiB 每轮实际 1 键，记录 300ms 防抖、首 RAF 与末键至预览。500 KiB 单键仍约 33 秒，未宣称不卡顿。
- [x] KaTeX/highlight 以约 8ms 软预算分批，优先原生 scheduler、回退可取消定时器；更新/卸载忽略旧工作，失败反馈保持一致。同页交替对照：最大长任务中位数 1075→221ms，总阻塞 1428→714ms，总完成 1653.8→2731.9ms，明确记录取舍。
- [x] 记录 DOM 与浏览器堆估计；已完成卸载样本的测量 DOM 均为零，未做堆快照或泄漏证明。
- [x] 19 文件 180/180 回归、全量构建和浏览器实际插件渲染通过；更新 AUDIT、共享使用文档与 [性能结果/后续方案](./audit/PERFORMANCE.md)，保留前几批证据。

### 第五批：可选 Worker 渲染入口 — 2026-10-25（实现与验收完成）

- [x] 抽出 `bytemd/processor` / `bytemd/worker` 纯入口，新增 ES/CJS exports，保留默认同步与异步 SSR pending；无 DOM Node 入口及 Svelte/React SSR 验证通过。
- [x] Worker 内注册可信解析插件，配置 JSON 校验、请求/结果/错误协议与 VFile/源码块还原；未映射回调同步兼容，不静默丢弃。宿主控制创建、共享与 destroy。
- [x] 四框架共用任务版本、AbortSignal、旧结果丢弃、错误 UI、effect 清理；异步 Editor 目录/source blocks 回归。queue/restart 的取消、共享 peer、超时、线程异常与 destroy 均有回归验证，未宣称 restart 性能更优。
- [x] 真线程开发页同页 20 个性能样本，10/100/500 KiB core 及 100 KiB enhanced；真实按键、首 RAF、最大帧间隔、启动/通信、长任务及总完成时间。100 KiB core 单键每模式各 3 次，其余每组 1 次，不宣称 p95。主线程长任务显著减少，大 DOM 仍阻塞。
- [x] 20 文件 205/205 全量回归及 `pnpm build` 含 TypeScript 退出 0。真实开发页复制、目录、错误清理/恢复、旧结果丢弃通过；Vite 4 Worker 条件、ES 分包与独立文件名前缀接入说明已补充。消费页生产构建退出 0，生产产物真实 Worker/公式/高亮/图表冒烟通过，未将其称为生产性能基线。
- [ ] 中文 IME、真实堆快照、移动设备和前台生产性能专项；Worker 不减少总解析量，大 DOM / CodeMirror 仍需独立评估。

入口、完整接入例子、共享生命周期、性能限制与证据见 [audit/WORKER.md](./audit/WORKER.md)。

### 第六批：安装与显式生成 — 2026-10-25（完成）

- [x] 删除根 postinstall，新增 `pnpm generate` / `pnpm generate:check`；只补缺失配置，保留自定义字段、依赖、版本、Worker/Svelte/CSS 出口与手写文档。文档只更新指定标记区域。
- [x] CI 显式生成/检查/Git diff，三个工作流统一 Node 22 / pnpm 8.15.9；发布命令显式准备与检查，本批没有执行发布。
- [x] 两次离线 frozen 安装不改写文件，重复生成及异地 cwd 检查零差异。两次完整构建含 TypeScript 通过，各自 226 个源文件/链接记录不变；209 个产物记录逐一相同。
- [x] 生成器 9/9 回归；新增 playground 原始 Markdown 渲染回归，最终核心 21 文件 206/206。全库 style、生成检查与 Git 空白检查通过。
- [x] 恢复并保护被通用 Markdown 格式化破坏的手风琴/时间线示例和故意长代码行；格式命令前后 fixture SHA-256 不变。实际浏览器语法与异步插件冒烟通过，三份共享开发说明与审计进度同步。

生成范围、维护约定与证据见 [audit/GENERATING.md](./audit/GENERATING.md)。本批不升级依赖或裁剪发布格式。

### 后续分批路线 — 2026-10-26

#### 第七批：生产大文档交互与内存验收 — 2026-10-26（桌面自动化实测完成，人工与移动设备待验）

- [x] 使用完整构建后的生产消费页，在浏览器前台固定 10/100/500 KiB 文档、视口和插件密度；分别记录同步/Worker 的真实键盘输入、composition、首帧、预览完成、长任务和 RAF 间隔，保留原始样本，不用开发页或功能冒烟替代生产性能。
- [x] CDP 实测同步/Worker × 10/100/500 KiB 的提交与取消共 12 个场景，捕获真实页面 composition 事件，并确认组合期间有异步结果返回；最终文本与预览一致。
- [ ] 人工操作系统中文输入法及与 CDP 的差异对照；自动化结果不替代此项。
- [x] 在生产页执行重复挂载、编辑、销毁循环，强制 GC 后采集真实堆快照、JS 堆和 DOM counters；报告保留变化与检查口径，不仅凭堆估计或 DOM 清零宣称无泄漏。
- [x] 分开记录解析、Worker 往返/剩余开销、DOM 提交/复制、首次布局、插件完成和按键至首次 CodeMirror 更新；保留计时边界与不确定性。成本不是穷尽且可相加的四项分解。
- [ ] 真实移动设备；当前无设备，保持 `incomplete`，桌面固定视口仅用于桌面采样。
- [x] 回归、完整构建、复现脚本与专项文档通过；原始 JSON、堆快照和日志独立保存，不覆盖前六批证据。

#### 第八批：大 DOM 与 CodeMirror 定向优化（完成，人工 OS IME 与移动设备待验）

- [x] 基于真实生产数据和 CPU/布局 trace 选择固定高度编辑器主体的尺寸隔离；简单 `contain: layout` 的 36 个对照样本收益不一致，继续对照后选择 `contain: size`。
- [ ] 若 DOM 插入/布局主导，评估分块提交、可见区插件调度或虚拟预览，并明确查找、目录、滚动映射、打印和无障碍契约。
- [x] 增加四框架可选 `layoutContainment`（默认 false），降低 CodeMirror 尺寸读取牵连整页布局；保持完整 DOM、原有选区与滚动映射。内容撑高与打印展开保持关闭。
- [x] CodeMirror 工厂按 document 复用，消除每实例新建全局监听器/测量节点；销毁时停止光标闪烁并释放输入焦点。3 轮强制 GC/堆快照复验中，等待清理后的 DOM 和监听器增量均为 0。
- [x] 主体尺寸隔离的 36 个同页交替样本（每组 3 次）证实首帧收益；四框架参数开启/撤销回归、完整构建及桌面生产自动化复验通过。见 [大文档优化与结果](./audit/LARGE_DOCUMENT.md)。
- [x] 使用同页交替样本验证交互收益和总完成时间代价；核心回归、四框架契约、生产 IME/内存复验及完整构建通过后才宣称完成。

#### 第九批：依赖范围与发布工具链（工具整理与同 major 修补完成，剩余安全迁移待续）

- [x] 分开统计发布包与开发环境依赖；移除未使用根 devDeps（conventional-changelog-cli、sort-json）；修复 examples/svelte 依赖归属与 examples/nuxt3 缺 private/version。
- [x] 添加根 engines（node >=20）；统一 workspaces 与 pnpm-workspace.yaml；升级 release.yml actions 至 v4 并固定 Node 22。
- [x] 移除 Lerna（删除 lerna.json + devDep，pub 脚本改用 `pnpm -r publish --no-git-checks`）；14 个包 repository.url 修正指向 fork（bigJiHua/bytemd）；author/name 保留原版权（fork 不修改）。
- [x] 同大版本安全修补：Vite 4.5.14，按版本分支约束 glob/CSS/构建依赖，修补 Babel/form-data；工作区旧嵌套 KaTeX 收敛至 0.16.47（本轮复盘补修）。
- [ ] 剩余 Vite/Vitest/Tinypool 公告须独立迁移；外部消费者的 ESM 传递依赖还需独立安装验收，仓库 overrides 不随包发布。
- [x] 保持发布格式裁剪与大版本迁移不在本批混入；安全公告按实际依赖路径和影响范围记录。

#### 第十批：发布格式与大版本迁移 — 2026-10-28（格式裁剪 + unified 11 + 工具链 critical 清零 + Svelte 5 完成；vite 6+/CM6 独立评估待续）

- [x] 发布格式裁剪为 ESM/CJS：构建移除 UMD（mermaid 插件 3.4MB UMD 不再产出），全部包删除 jsdelivr/unpkg 字段（CDN 走 jsDelivr /+esm），bundlewatch 改盯 bytemd ESM+CSS 并设 maxSize（本地实测 PASS），生成器按 locales 目录存在性写 `./locales/*` 导出（修复 9 个包声明不存在子路径的问题），legacy-browser 示例改写为无打包器 ESM 用法，README/docs 传统浏览器章节同步。
- [x] unified 11 生态迁移：unified 11 / remark-parse 11 / remark-rehype 11 / rehype-raw 7 / rehype-sanitize 6 / rehype-stringify 10 / hast-util-sanitize 5 / vfile 6 / remark-gfm 4 / remark-math 6 / rehype-katex 7 / remark-frontmatter 5 / remark-breaks 4 / remark-gemoji 8 / rehype-highlight 7。关键适配：sanitize schema 改 structuredClone（JSON 克隆会破坏 v5 新增的 code language-\* 正则白名单）；plugin-math 选择器适配 remark-math 6 的 `code.language-math` DOM；math-ssr 保留响亮失败契约（rehype-katex 7 把失败降级为 vfile message，插件检测后重新抛出）；highlight-ssr 移除 v7 已删除的 ignoreMissing；bytemd 补 processor/worker 根转发文件（node10 TS 解析）。
- [x] 工具链迁移：Vite 5.4 + Vitest 3.2（threads 池 + testTimeout 20s 保持重套件稳定）+ jsdom 24 + `@vitejs/plugin-vue2` 替换停止维护的 vite-plugin-vue2 + `@vitejs/plugin-vue` 5 + tinypool 2.1.2 override + vitest server.deps.inline 保留 katex/highlight.js 的 vi.mock 能力。Svelte 3 保留（vite-plugin-svelte 2.5.3，peer vite 4 警告为已知折衷）。
- [x] 安全结果：完整开发图 **0 critical / 5 high / 25 moderate / 4 low**（原 3 critical / 17 high）；`--prod` 图 **18 条（0 critical / 1 high / 14 moderate / 3 low）**（原 22 条 3 high）。残留：vite high（需 6.4.4+）、svgo high（需 4.x）、katex low（需 0.18.2）、deepmerge low（无修补）。
- [x] Svelte 5 迁移：svelte 5.57.3 + @sveltejs/vite-plugin-svelte 4.0.4 + @testing-library/svelte 5.4.2 + svelte2tsx 0.7.62 + svelte-preprocess 6.0.5 + prettier 3（含 prettier-plugin-svelte 3、sort-imports 5）。关键适配：
  - 新增 `src/legacy-compat.ts` 用 `createClassComponent` 桥接 `new/$set/$on/$destroy`，react/vue/vue-next 三个包装无需改调用面；`$on` 事件只在 compat 实例上派发，测试改走该实例。
  - 导出 `EditorComponent/ViewerComponent` 原始组件，供 Svelte 宿主模板渲染（Svelte 5 模板无法实例化 class）。
  - 移除 5 个组件的 `svelte:options immutable`（legacy 模式下与 compat props 代理冲突）；`viewer.svelte` 的 `const $` 局部变量与编译产物内部命名冲突，改名。
  - Svelte 5 的 afterUpdate 早于模板 DOM 生效，按钮/插件效果改为 `tick()` 后应用；`onDestroy` 在 DOM 移除后执行，光标计时器改为直接清理 CodeMirror blinker 句柄。
  - 组件内可变的 `let`/`const` 会被 legacy 编译器响应化，回调里赋值会重跑 beforeUpdate 清理并清空刚绑定的效果；改为 `context="module"` 的 WeakMap 按宿主保存状态。
  - render-controller 增加同请求去重（粗粒度 props 代理会重复触发渲染并丢弃在途结果）。
  - 测试侧：RTL 5 的 `rerender()/unmount()` 取代 `$set/$destroy`；vitest alias 固定 katex/highlight.js 单模块 id，恢复 `vi.mock` 能力；tsconfig 加 `verbatimModuleSyntax`（否则模板专用导入被 TS 擦除）。
  - playground 入口改 `mount()`（`new App()` 跳过 `init_operations`，模板辅助函数全部 undefined），并改为从源码编译 ByteMD 以共享同一 Svelte 运行时。
- [x] 本轮验收：核心 26 文件 230/230、脚本 26/26 + 覆盖率门槛（85.28%）、完整构建、generate:check、style、bundlewatch（index.mjs 63.98KB gzip）、无头 Chrome 实测 playground（编辑器/37 工具栏/28 标题/KaTeX×2/mermaid/高亮×5/复制按钮×6/交互重渲染/暗色 #0d1117，仅 favicon 404）。
- [x] 评审修复（2026-10-28）：svelte 条件入口改导出 Editor/Viewer 组件（dist 入口保留兼容类）；Viewer 的 beforeUpdate 仅在 file/plugins/locale 变化时清理，恢复与 tick 重绑的配对；render-controller 改为插件数组内容快照比较、对象参数不再走快捷路径；删除 viewer 未使用的 lifecycle。核心 26 文件 231/231、脚本 26/26、完整构建、style、generate:check 通过；真实 Svelte 宿主与 Svelte 3 的 examples/svelte 未实测。
- [ ] Vite 6/7、CodeMirror 6 仍为独立评估项目：@sveltejs/vite-plugin-svelte 4 的 peer 仍为 vite ^5。

#### 复盘补修：核心边界、测量工具与依赖安全 — 2026-10-26（完成）

- [x] 核对当前实现和七/八/九批真实验收记录，修正陈旧待办与依赖影响面；完整结论见 [audit/REASSESSMENT.md](./audit/REASSESSMENT.md)。
- [x] 修复 CodeMirror 活动选区/文本拖拽卸载的 document 监听器清理；当前实例正文/doc 身份不变、无 change、其他实例手势与选区保留。CM5 私有回调兼容风险保留在报告中。
- [x] Worker 在配置回调/序列化期间 abort/destroy 后立即拒绝，避免取消后入队或永久 pending；JSON 校验允许无环共享引用，继续拒绝循环。
- [x] comparison 按实际矩阵分组；CDP 同步发送失败/连接关闭释放 pending/timer 并拒绝后续请求。核心新增 8 用例，脚本新增 3 用例。
- [x] 根/playground Vite 更新到 4.5.14，按版本分支收敛传递依赖并修补 Babel/form-data；旧嵌套 KaTeX 0.13.24/0.15.6 在工作区收敛到 0.16.47，补 3 项数学 SSR 安全/兼容回归。外部 npm 消费者不继承根 overrides，仍需独立验收。
- [x] CI 脚本回归改为带 c8 门槛的命令；四个关键模块聚合 lines/statements 84.75%、branches 85.12%、functions 80%。不代表全部脚本或核心组件覆盖；summarizer 单文件 59.7% 待补测。
- [x] 核心 24 文件 221/221、Node 脚本 20/20、完整构建含 TypeScript、离线 frozen 安装、无 DOM/SSR 入口、全库 style、generate:check 和 Git 空白检查通过。
- [x] 普通 playground 默认插件/语法与手风琴展开通过；生产消费页专项 comparison 两组、composition 12 场景、memory 1 循环/4 堆快照、interaction 通过。DOM nodes/listeners 增量 0/0，JS heap +709,296 bytes；未重跑完整 performance 矩阵，不更新历史性能基线。
- [x] 官方 `--prod` 工作区图从 72 条降到 22 条（0 critical / 3 high / 14 moderate / 5 low）；完整开发图仍 3 critical / 20 high / 37 moderate / 8 low。保留 Vite/Vitest/Tinypool、Svelte 3 与 KaTeX 等遗留问题，未宣称安全清零。
- [ ] 人工 OS IME、真实移动设备保持 incomplete；剩余工具链大版本安全迁移和外部发布消费验证进入下一批。

本批原始证据为 `audit/prod-perf-reassessment-20261026/`（本地、Git 忽略）。生产复现命令的 build/regression 为 skipped，完整构建与全量回归在独立命令中通过；没有覆盖历史采样、提交或发布。

### 后续执行顺序与验收

| 顺序 | 范围 | 验收与推进条件 |
| --- | --- | --- |
| 1 | Vite/Vitest/Tinypool 安全迁移 | ✅ 2026-10-28 完成：Vite 5.4 + Vitest 3.2 + tinypool 2.1.2，开发图 critical 清零；Vite 6+ 受插件 peer（vite ^5）限制进入独立评估 |
| 2 | 外部发布消费与测量工具覆盖 | 干净安装不继承根 overrides，核对数学插件实际依赖及入口；补 summarizer 和浏览器失败清理关键路径 |
| 3（第十批） | 发布格式与解析/框架迁移 | ✅ 格式裁剪（ESM/CJS）、unified 11、Svelte 5 完成（2026-10-28）；CodeMirror 6 / vite 6+ 独立评估 |
| 4（七/八批待验） | 人工与设备、进一步大 DOM 优化 | 人工 OS IME、真实移动设备仍 incomplete；更多循环内存趋势与虚拟预览契约另行验证，不重复标记桌面自动化未完成 |

Worker 核心、显式安装生成、桌面生产验证、可选尺寸隔离和第九批发布工具整理已实施；工具链安全升级（critical 清零）、发布格式裁剪、unified 11 与 Svelte 5 已于 2026-10-28 完成。源码块标识仅在一次预览渲染内关联源码与 DOM，不是跨编辑持久 ID，也不实现段落内逐行定位或虚拟预览。

### Phase 0 — 基线可测（完成）

- [x] 修复 `editor.test.ts > value` 的 CodeMirror/jsdom 挂载问题
  - 根因：Vitest 在 Node 条件下把 `svelte` 解析到 SSR 入口，`onMount/afterUpdate` 是 no-op
  - 修复：`vitest.config.mjs` 强制 `browser/module/import` condition
- [x] 修复 `editor.test.ts > plugin > editor effect`、`viewer.test.ts > plugin` 的 effect 时序
- [x] CI 固定 Node 22 / pnpm 8.15.9，`pnpm install --frozen-lockfile` + `pnpm test` + `pnpm build`

### Phase 1 — 死代码、泄漏与链接（完成）

- [x] 移除 toolbar 未使用的 `on:key` 链路
- [x] 移除未使用的 `vfile`、`icons.Callout`
- [x] 清理 ResizeObserver / 分屏拖拽 / tippy delegate 的卸载泄漏
- [x] Source 按钮、README 与 playground 链接指向 fork
- [x] npm 包 repository 指向 fork；author/name/LICENSE 按原版权保留（第九批）

### Phase 2 — 安全依赖与小依赖（历史批次完成，最新安全结论见复盘补修）

- [x] 移除 `lodash-es`，用本地 `src/debounce.ts` 替代
- [x] `js-yaml` 升级到 `4.3.2`
- [x] `mermaid` 升级到 `11.17.2`，playground 实测通过
- [x] 直接 `katex` 升级到 `0.16.47`；旧嵌套版本曾被遗漏，本轮定向 overrides 已修补工作区路径。当前仍有 low，外部消费约束与后续迁移继续待验。
- [x] `@types/lodash-es` 移除；`@types/codemirror` / `hast` / `mdast` 因公共 `.d.ts` 引用保留，不移到 dev
- [x] 移除未直接使用的 `@popperjs/core` 直接依赖（tippy 仍带）
- [x] 移除 playground 未使用的 `github-markdown-css`
- [x] 通过 `pnpm.overrides` 把 mermaid 传递的 `lodash-es` 升到 4.18.1
- [x] 保留本阶段官方 registry audit 的历史记录；本轮复盘纠正嵌套依赖遗漏与影响面，当前工作区/完整开发图数量以 [复盘报告](./audit/REASSESSMENT.md) 为准，不沿用安全清零结论。

### Phase 3 — 发布体积（UMD 裁剪完成，2026-10-28）

- [x] 移除 UMD；CJS 保留（构建只产 ESM/CJS + d.ts，CDN 走 jsDelivr /+esm）
- [x] 插件包 UMD 裁剪（mermaid 3.4MB UMD 不再产出；CJS 保留以兼容 Node 工具链）
- [x] 移除 postinstall 对 package.json/tsconfig/README 的自动改写；显式生成、文档区域维护与幂等验收见第六批
- [x] 移除 Lerna，根 engines 为 Node >=20；CI 固定 Node 22 / pnpm 8.15.9（第九批）
- [x] bundlewatch 改为盯 ESM/CSS（bytemd index.mjs/index.css/markdown.css，均设 maxSize，实测 PASS）

### Phase 4 — 体验与健壮性（完成）

- [x] 窄屏 tab 模式下保留全部格式/插入动作（tablist + 横向滚动动作条）
- [x] 工具栏/侧栏/分屏 handle 的键盘与 aria
  - 图标 `role=button`/`tabindex=0`/`aria-label`，Enter/Space 触发
  - 下拉项 `role=menuitem`，嵌套菜单 `aria-haspopup`；侧栏关闭按钮可聚焦
  - 分屏 handle `aria-valuenow`，方向键 ±5、Enter 复位
- [x] 自定义语法文案 i18n（en / zh_Hans，其余语言回退 en）
- [x] timeline 空行分隔解析、pinyin/accordion 解析补强
- [x] 宽表横向滚动、暗色主题 token
  - 表格在 `markdown.css` 内 `display: block; overflow-x: auto`，不做 JS wrapper（避免与 Main 重复包装）
  - `.dark .markdown-body` 覆盖文本/表面/callout/timeline 色
  - 打印隐藏工具栏属于宿主壳层职责，内容主题不接管
- [x] README 补自定义语法与主题接入（`dist/markdown.css` 可选引入）

### Phase 5 — 大版本现代化（后置）

- [x] unified 11 / remark 15 / rehype 13 生态（2026-10-28，见第十批）
- [x] Vite 5 / Vitest 3 / jsdom 24 工具链（2026-10-28，critical 清零）；TypeScript 5 保持
- [x] Prettier 3 + prettier-plugin-svelte 3 / sort-imports 5（2026-10-28，全库格式化通过；`generate.mjs` 改为 await 异步 `prettier.format`）
- [x] Svelte 5（2026-10-28，见第十批；`legacy-compat` 保留类 API）
- [ ] CodeMirror 6（单独项目，不做混合迁移）：规划与价值评估见 [audit/CM6_PLAN.md](./audit/CM6_PLAN.md)，建议先做 P0 spike 实测再决定是否投入

## 功能同步与开发约定

- [x] 代码复制：Svelte、React、Vue 2、Vue 3 Viewer 共用核心包导出的 `addCopyButtons` / `copyCodeFromButton`，挂载和内容更新时补充按钮，点击复制不依赖插件。
- [x] Vue 3 Viewer：监听实际渲染文件变化，向 `viewerEffect` 传递 VFile，并清理更新/卸载时的插件效果。
- [x] `maxLength` 保持提示行为：按 `value.length`（UTF-16 code units）判定超限，不阻止输入或粘贴、不截断内容；宿主按需在保存前校验。默认 `Infinity`，已同步类型注释和使用文档。
- [x] 新语法同步清单写入 README：解析/安全过滤、工具栏/帮助、样式/暗色主题、en/zh_Hans 文案/类型、示例/文档、各框架 DOM 行为及测试。
- [x] 开发文档同步普通安装与显式 `generate` / `generate:check`、文档维护区域和格式保护；playground 依赖生成的 `svelte/` / `dist/`，源码变更后需重新构建，测试直接读取源码。
- [x] 构建清理改为 Node 脚本，解决 Windows 下 `rm` 不存在导致 `pnpm build` 失败的问题。
- [x] Lerna/engines 与 fork 发布元数据整理完成（第九批）。
- [ ] Phase 3 继续处理外部消费验证；Phase 5 仅剩 CodeMirror 6 与 vite 6+。

## 进度日志

- 2026-10-29：CM6 收尾批次完成（`feat/cm6`，本批次前 13 个文件未提交状态一并收口）。P1 能力映射补全：yaml-frontmatter 高亮以 CM6 `ViewPlugin` 装饰实现（`.bytemd-yaml-*` 六类，token 色/暗色与 CM5 yaml 模式对位；核对确认 CM5 的 overlay addon 从未实际调用，自定义语法本无高亮、无需迁移）；inline HTML 由 lang-markdown 内嵌 html 解析器 + HighlightStyle 覆盖并生产页实测（tag/attribute/string 色）；`editorConfig` 映射补齐 `extraKeys`（适配器此前静默丢弃——Enter 列表续行实际失效）/`readOnly`（Compartment）/`autofocus`/`undoDepth`。P2：`wrapText`/`replaceLines`/`appendBlock` 改原生 CM6 单事务（单步撤销、选区随撤销恢复），顺带修复适配器 `appendBlock` 无空行路径落点钳位错误（非空文档图片上传/代码块/分割线/手风琴会插错位置并与末行拼接）。P3：补 `processingInstruction`/`contentSeparator`/`atom` token；删除暗色区 21 条死 CM5 `.cm-*` 规则。P4：新增 `cm6-capabilities.test.ts` 9 例；生产消费页 CDP 复验 100 次挂载/销毁 **0/0**、Enter 续行、亮/暗逐 token 色（`audit/cm6-closeout-verify.mjs`，数据入 `CM6_PROD_RESULT.md` §5）。复验揪出并修复关键缺陷：**`.CodeMirror` 兼容类被 CM6 update 抹掉**（改 `editorAttributes`/`contentAttributes` facet——修复前 focus 一次 `querySelector('.CodeMirror')` 即为 null）；`handleKeydown` 改 `stopImmediatePropagation`。审计工具链 Svelte 5 遗留修复：prod-perf 页 `new App()`→`mount()`、消费页改源码入口、移除 `resolve.conditions: ['worker']`（svelte 5 exports 的 worker 条件使主构建解析到 server 运行时）。P5 部分：三份 README 补 `editorExtensions`/`editorConfig` 子集/CM6 实例迁移说明并强化 `layoutContainment` 大文档指引（手工区，generate:check 不受影响）。验收：核心 27 文件 240/240、脚本 26/26、完整构建、generate:check、style、bundlewatch（index.mjs 67.79KB gzip PASS）。未完成：真实 OS IME/移动设备（需人工）、tarball+SSR 外部消费验证、major/minor 版本策略（待拍板）。

- 2026-10-28（续）：Svelte 5 迁移完成。依赖：svelte 5.57.3、@sveltejs/vite-plugin-svelte 4.0.4、@testing-library/svelte 5.4.2、svelte2tsx 0.7.62、svelte-preprocess 6.0.5、prettier 3.9 + prettier-plugin-svelte 3.5 + @trivago/sort-imports 5.2。核心适配：`legacy-compat.ts` 用 `createClassComponent` 维持 `new/$set/$on/$destroy`（react/vue/vue-next 包装零改动）、导出 `EditorComponent/ViewerComponent` 供 Svelte 宿主模板；移除 `svelte:options immutable`、`const $` 改名、按钮/效果改 `tick()` 后应用、`onDestroy` 直接清理 CodeMirror blinker、组件状态迁到 `context="module"` WeakMap（组件内可变绑定被响应化会清空刚绑定的效果）、render-controller 同请求去重；测试改 RTL 5 的 `rerender/unmount`，vitest alias 固定 katex/highlight.js 单模块 id。踩坑记录：playground 的 `new App()` 跳过 `init_operations`（改 `mount()`）；缺 `verbatimModuleSyntax` 时模板专用导入被 TS 擦除（`Editor is not defined`）；`bytemd/dist` 内含独立 Svelte 运行时，宿主要从源码或 `svelte` 条件消费。验收：核心 26 文件 230/230、脚本 26/26 + 覆盖率 85.28%、完整构建、generate:check、style、bundlewatch PASS（index.mjs 63.98KB gzip）、无头 Chrome 实测 playground 全绿（编辑器/37 工具栏/28 标题/KaTeX×2/mermaid/高亮×5/复制按钮×6/交互重渲染/暗色 #0d1117）。未提交或发布。

- 2026-10-28：剩余部分审计修复 + 第十批主体完成。先修复 [audit/REMAINING.md](./audit/REMAINING.md) 审计确认的 11 项问题（medium-zoom 关闭竞态/reportError/ownerDocument/样式注入、生成器 locales 按需导出、bytemd processor/worker 根转发、mermaid 全局配置恢复、frontmatter 静默失败兜底、gfm 固定 clipPath id、help 快捷区漏项、toolbar Escape/Enter 切换/tab roving、deploy.sh 版本固定）。随后完成第十批：UMD 移除（ESM/CJS + d.ts，bundlewatch 盯 ESM+CSS maxSize 实测 PASS）、unified 11 生态迁移（sanitize schema structuredClone、language-math 选择器、math-ssr 响亮失败、@vitejs/plugin-vue2）、Vite 5.4/Vitest 3.2/jsdom 24（threads 池 + 20s 超时保持重套件稳定，tinypool 2.1.2 override）。验收：核心 26 文件 230/230、脚本 26/26、覆盖率门槛、完整构建、generate:check、bundlewatch PASS、官方源 audit 开发图 0 critical（原 3）/prod 18 条 1 high（原 22 条 3 high）。残留：vite 6+/svgo 4 需 Svelte 3 之外支持、katex 0.18、人工 IME/移动设备 incomplete；vitest server.deps.inline 保持 katex/highlight.js 可 mock。未提交或发布。

- 2026-10-27：复盘补修文档收尾。新增 `audit/REASSESSMENT.md`，同步 PLAN/AGENTS/AUDIT 当前阶段、实际验收范围、安全遗留及下一批顺序；文档定向格式、generate:check、Git 空白检查通过。本批数据和截图仍保留在 `audit/prod-perf-reassessment-20261026/`，临时开发页和本轮 5179 服务已清理；没有提交或发布。

- 2026-10-26：当前工作区复盘补修完成。确认七/八批桌面实测与九批工具整理已实施、第十批未启动；修复 CodeMirror 活动手势卸载、Worker 回调期间取消及 JSON 共享引用、comparison 自定义矩阵汇总、CDP 失败/关闭清理；补数学 SSR 安全回归。根/playground Vite 4.5.14，版本分支 overrides 修补传递依赖并收敛工作区旧 KaTeX；修复 Vue 测试 runtime 实路径解析。最终核心 24 文件 221/221、脚本 20/20、四关键模块覆盖率门槛、完整构建、离线 frozen 安装、无 DOM/SSR、style、generate:check 和 Git 空白检查通过。普通 playground 默认语法/插件和手风琴展开通过；生产定向复验 errors=[]、composition 12 场景、memory 1 轮/4 堆快照、nodes/listeners 增量 0/0、heap +709,296 bytes，完整 performance 矩阵未重跑。官方 prod 工作区图为 0 critical/3 high/14 moderate/5 low，完整开发图为 3 critical/20 high/37 moderate/8 low；根 overrides 不随包发布，外部消费仍需验收。下一优先项是 Vite/Vitest/Tinypool 独立迁移；人工 OS IME/真实移动设备保持 incomplete。证据：`audit/prod-perf-reassessment-20261026/`；结论：[audit/REASSESSMENT.md](./audit/REASSESSMENT.md)。以下旧日志保留历史时点结论，存在遗漏或过时信息时以此复盘为准。

- 2026-10-26：新建 `AGENTS.md`（agent 说明文档：命令、6 条关键纪律、批次状态、安全审计结论、P0-P3 后续计划划分）。跑生产依赖安全审计（官方源，镜像 405）：72 条（0 critical / 26 high / 38 moderate / 8 low）；影响面区分——vite x22 high 及 rollup/braces 等全部在 dev 工具链不进发布 dist；发布产物实际暴露仅 katex 1 条 low（需 0.18.2+，大版本）与 svelte 3.59 的 7 条 moderate（6 条 SSR、1 条 mXSS 需 4.2.19+，属第十批）。后续计划按优先级写入 AGENTS.md：P0 快速收尾（CI 补 test:scripts、vite ^4.5.2 同 major 升级、overrides 收敛传递依赖）；P1 第十批前置（格式调研、覆盖率）；P2 大版本迁移（unified 11 / Svelte 5 / CodeMirror 6）；P3 人工验收（OS IME、移动设备）。原始审计结果存 `audit/audit-prod-result.json`（gitignore，本地）。

- 2026-10-26：全量回测审计（七/八/九批全部修改点）。6 项审计通过：① 回归 210/210、脚本 17/17、构建、generate:check；② 四阶段生产采样重跑全通过（12×3 样本、composition 12 场景无未覆盖、内存增量 0/0、TOC 偏差 0.09px）；③Lerna 零残留、`pnpm -r publish` 可解析、14 包 repository 指向 fork、author 保留原版权；④release.yml v4/Node 22、examples 修复到位、未用依赖零引用；⑤.gitignore 验证；⑥ 发布包 76 文件含完整入口/locales/svelte，无测试审计资产泄漏。审计发现并修复 2 个回归：prettier 曾重排 generate 产物（README.md/docs/index.md/packages/bytemd/README.md）破坏 generate:check，重新 generate 并加入 .prettierignore 防复发；.gitignore 逐目录枚举漏掉新命名运行目录，统一为 `audit/prod-perf-*-*/` 通配（入库文件 88→35）。证据：`audit/prod-perf-audit-verify/`。

- 2026-10-26：第九批继续。移除 Lerna（删除 lerna.json + devDep，pub 脚本改用 `pnpm -r publish --no-git-checks`）；14 个包 repository.url 从 bytedance/bytemd 修正指向 fork bigJiHua/bytemd；author/name 保留原版权（fork 不修改）。.gitignore 补充忽略采样运行目录（prod-perf-review-_/、diag-_/、run-_/）、堆快照（_.heapsnapshot）、CPU profile、采样数据（audit/_.json）、探针测试（audit/_.ts）、截图（audit/_.png）、脚本测试（audit/_.test.mjs）；保留验收文档和复现脚本。核心回归 23 文件 210/210、构建、generate:check 通过。可兼容升级属 Phase 5。

- 2026-10-26：第九批依赖范围与发布工具链部分完成。移除未使用根 devDeps（conventional-changelog-cli、sort-json）；修复 examples/svelte 依赖归属和 examples/nuxt3 缺 private/version；添加根 engines（node >=20）；统一 workspaces 与 pnpm-workspace.yaml；升级 release.yml actions 至 v4 并固定 Node 22。核心回归 23 文件 210/210、构建、generate:check 通过。Lerna 移除已评估（仅 pub 脚本使用），暂保留；可兼容升级属 Phase 5 范围。

- 2026-10-26：第七/八批全链路闭环。修复 composition 异步结果等待（硬等 180s → 有限 5s + 未覆盖标注，spec 5.2.3 异常 2）、阶段失败中断（break → continue）、interaction TOC 滚动阈值（固定 3px → 动态减 scroll-margin-top 1.5em 后容差 16px）。完整四阶段生产采样通过：performance 12 组 ×3 样本、composition 12 场景（事件链完整，submit 异步结果覆盖）、memory 3 轮（DOM 节点/监听器增量=0）、interaction（TOC/手风琴/错误恢复/过期结果）。核心回归 23 文件 210/210、脚本 8/8 通过。证据见 `audit/prod-perf-review-full-final/`。第八批标记完成；人工 OS IME 与真实移动设备仍待验。

- 2026-10-26：复核第七批时发现原采样报告只有路径错误，计划勾选领先于实测。修正 CDP HTTP 发现/事件等待、Windows 入口、隔离浏览器与清理、页面异常处理、成本口径和样本计数；补真实生产样本、页面 composition、12 份堆快照及引用链。排除 DevTools 控制台保留，分离即时销毁和 1 秒清理后的计数，再修复 CodeMirror 重复工厂初始化。继续第八批：同页交替验证主体尺寸隔离，落入默认关闭的 `layoutContainment`，四框架支持动态撤销。核心 23 文件 210/210、脚本 17/17、完整构建通过；人工 OS IME、真实移动设备及进一步降低完整预览长任务仍待推进。证据与实际状态见 `audit/PROD_PERF.md` / `audit/LARGE_DOCUMENT.md`；前几批原始证据未覆盖。

- 2026-10-26：第七批生产大文档交互与内存验收实现完成。新增生产消费页（`audit/prod-perf-ui.html`/`.svelte`/`prod-perf-vite.config.mjs`），固定 1280×800 视口，复用 `performanceFixture` 与 Worker renderer 契约；CDP 驱动层（客户端、浏览器启动、键盘/composition 注入、堆快照/GC/DOM counters）；证据归档器（第七批前缀白名单 `prod-perf-*`/`ime-*`/`heap-*`/`mobile-*`/`cost-*`/`build-prod-perf-*`，不覆盖前六批）；采样探针组（零侵入插件契约，composition 捕获、成本四项标记、内存计数）；采样编排脚本（性能/IME/内存/成本/移动设备）；复现脚本与汇总器。被测对象零侵入：未修改 bytemd 核心源码，所有探针通过既有 `editorEffect`/`viewerEffect` 契约注入。回归 21 文件 206/206 通过，完整构建含 TypeScript 退出 0，生产消费页 `vite build` 退出 0。证据见 `audit/build-prod-perf.log`/`audit/build-prod-perf-full.log`，文档见 `audit/PROD_PERF.md`。采样执行需在真实浏览器环境运行 `node audit/prod-perf-reproduce.mjs`；未完成项：真实移动设备验证（`status:'incomplete'`）、人工 OS 输入法 IME 证据。下一项为第八批大 DOM 与 CodeMirror 定向优化（依据本批成本分项数据）。

- 2026-10-25：第六批显式生成完成。普通安装不再改写工作区；9 个脚本回归、21 文件 206/206 核心回归及纯入口/SSR 检查通过。两次完整构建的 209 个产物记录相同，安装/生成/构建源文件对比零变化。追加修复格式化破坏演示自定义语法的问题，保护原始 fixture 并补渲染回归；浏览器与 style 验收通过。证据见 `audit/generation-*` / `audit/build-generation-*.log`，维护说明见 `audit/GENERATING.md`。下一项为前台性能、IME/内存及大 DOM；依赖和发布迁移仍未实施。

- 2026-10-25：第五批可选 Worker 实现与验收完成。四框架接入可选 renderer，保留默认同步/SSR；纯 processor/worker 入口、JSON 注册、未映射回调兼容、请求取消/旧结果丢弃、共享 queue/restart 与 timeout/destroy 已实现。20 文件 205/205 全量回归、完整构建及纯入口/SSR 检查通过；消费页生产构建和真线程 DOM 插件冒烟通过。20 个正式同页性能样本：100 KiB core 真实单键最大长任务中位数 1468→65ms，500 KiB 单次 24754→380ms，但仍有约 653ms 帧间隔；不宣称解析算法提速或流畅。证据保留于 `audit/worker-*` / `audit/build-worker.log` / `audit/build-worker-consumer.log`，文档见 `audit/WORKER.md`。下一项改为显式安装生成；中文 IME、堆快照、生产性能仍待专项。

- 2026-10-25：第四批长文档基线与插件调度完成。前后各 41 个完整 Editor/键盘样本、插件专项各 3 次，同页调度交替 6 次；19 文件 180/180 回归及全量构建通过。插件分批降低专项长任务和总阻塞，但增加完成时间；完整前后运行存在明显环境波动，未认定整体提速。500 KiB 真实单键约 33 秒，同步 parse/AST 阻塞仍需 Worker 方案。原始 JSON、汇总、复现工具及构建日志保留于 `audit/performance-*` / `audit/build-performance.log`；真实堆快照、中文 IME、前台生产环境和 Worker 尚待下一批。

- 2026-10-25：第三批 Mermaid 配置隔离与异步插件失败反馈完成。四框架共用局部本地化 alert 与 `bytemd-plugin-error` 事件；Mermaid 成对排队配置/渲染，失败保留源码并继续后续任务；KaTeX 未知命令保留原公式，highlight 等待初始化并支持失败后重新初始化。最终回归 19 个文件、173/173，完整构建与 `pnpm exec tsc --build` 通过；浏览器验证双主题更新、图表/公式/初始化失败、本地化、恢复及默认 Editor 的目录跳转。证据另存 `audit/plugin-*` 和 `audit/build-plugin.log`；临时入口与服务已清理。下一步建立 10/100/500 KiB 长文档端到端基线，再决定解析调度方案。

- 2026-10-25：第二批源码块映射、布局失效缓存与目录修复完成。Editor 用每次渲染的块身份关联预览与源码，Mermaid 保留标识；修复防抖预览错位、目录层级残留、CSS 滚动留白高亮以及 CodeMirror 首次跳转的预览回跳。17 个文件、147/147 回归，全量 `pnpm build` 与最新产物浏览器验收通过。证据另存 `audit/scroll-*` 和 `audit/build-scroll.log`，保留第一批与初始审计结果；下一步按专项验收推进 Mermaid 配置隔离与插件错误反馈，再测长文档端到端性能。

- 2026-10-25：核心修复 R1/R2/R3 完成，13 项审计缺陷已修复；追加修复 Mermaid 旧 SVG 残留及首次异步 effect 被取消。默认回归 16 个文件、122/122，独立复验 37/37，最新 `pnpm build` 通过；playground 重新加载依赖后，验证默认语法、手风琴混排、复制、非法锚点、超限输入、旧图清理及灯箱切换/关闭。结果与截图见 AUDIT.md / audit/；原始审计与性能基线保留。长文档性能、稳定块映射、依赖和发布工作仍待后续。

- 2026-10-25：核心审计完成：常规回归 69/69；独立探针 24 项、15 项失败，归并 13 项已确认问题。新增 R1/R2/R3 修复批次，开始核心修复；原始证据保留在 audit/，完整结论见 AUDIT.md。

- 2026-10-24：完成审计与计划；尚未开始修改。
- 2026-10-24：Phase 0 完成。全量 `pnpm test` 38/38 通过；根因是测试环境的 Svelte SSR 入口。
- 2026-10-24：Phase 1 完成。死代码/卸载泄漏清理，Source/README/演示链接改指向 fork。
- 2026-10-24：Phase 2 完成。lodash-es 移除；mermaid 11.17.2 / js-yaml 4.3.2 / katex 0.16.47；官方 audit 发布依赖 high 清零。`pnpm build` 通过；playground 实测 mermaid/KaTeX/frontmatter/时间线/手风琴/拼音正常。
- 2026-10-24：Phase 4 完成。窄屏 tab 模式保留全部动作；工具栏/侧栏/分屏 handle 键盘与 aria；自定义语法 i18n；timeline 空行块解析；宽表横向滚动与暗色 token；README/示例更新。`vitest run` 40/40，`pnpm build` 通过；浏览器实测 actions 27 个图标、tab aria、en/zh 文案与 `.dark` 计算色。截图：`.screenshots/toolbar-narrow.png`。
- 2026-10-24：新增字号控制。闭合区间 `[size=20]…[/size]`（8–96，支持嵌套与行内节点，不跨空行）；工具栏“字号”下拉 12–48，无选区包裹当前行。`vitest run` 45/45，`pnpm build` 通过，playground 实测生效。
- 2026-10-24：追加字体颜色与背景色。`[color=#e03131]…[/color]`、`[bg=#fff3bf]…[/bg]`，仅接受 3/6/8 位十六进制；工具栏两个色板下拉，与字号共用区间解析。`vitest run` 50/50，`pnpm build` 通过，playground 实测生效。
- 2026-10-25：新增带文字分割线 `---文字---`（单行、标签居中、两侧横线；标签支持行内 Markdown、字号/颜色区间和图片，图片自动限制为 2em 高/8em 宽）；普通 `---` 保持 `<hr>`，工具栏加入“文字分割线”。`vitest run` 57/57，`pnpm build` 通过，playground 实测生效。
- 2026-10-25：按需求禁用分割线图片点击放大（此前误解为要支持放大）。`@bytemd/plugin-medium-zoom` 的 filter 跳过 `.bytemd-hr-text` 内图片，普通正文图片仍可放大；分割线图片内联限高 2em/8em。57/57 测试、构建通过，浏览器实测分割线图片无 medium-zoom 类、正文图片正常。
- 2026-10-25：图片灯箱升级。暗色模糊蒙层、关闭按钮、title/alt 标题、多图计数与左右切换、键盘/焦点/滚动锁定；overlay/大图/UI 的 z-index 提升到 2147483645/2147483646/2147483647。headless 实测 1/2 → 2/2 → 关闭并恢复滚动。57/57 测试、构建通过。
- 2026-10-25：同步 React/Vue 2/Vue 3 的代码复制；修复 Vue 3 Viewer 文件传递与更新监听；保留 `maxLength` 提示行为，同步类型注释、README、文档页、核心包说明与开发清单。新增四个框架共用的 Viewer 测试，覆盖无插件复制、内容更新、插件 VFile/清理和标题跳转。12 个测试文件、69/69 用例通过；`pnpm build` 通过；playground 实测复制按钮反馈、代码语言标签与超限后继续输入/预览。截图：`.screenshots/viewer-sync.png`。
- 待调研：Phase 3 的 UMD/CJS 宿主使用面与裁剪方案；Phase 5 的工具链/解析链迁移按独立批次推进，先冻结回归基线与兼容契约。

- 2026-10-27：Viewer 锚点与 Editor 按需加载批次完成。Viewer 默认生成 GitHub slug 标题 id（中文/重复标题/前缀/关闭可配），并修复缺失锚点放行浏览器默认 hash 导航、把宿主页面（含编辑器）带回视口的问题；补齐 16 个语言包的 `renderError`/`renderPending`/`pluginError` 文案。新增 `bytemd/viewer`、`@bytemd/vue-next/viewer`、`@bytemd/vue-next/async` 子入口与根转发文件；`AsyncEditor` 覆盖 SSR 固定高度占位、加载超时、失败重试、卸载后 resolve 竞态、props/事件透传。Nuxt 3 生产 SSR 实测：首屏只有占位无编辑器 DOM，Viewer 主 chunk 不含 CodeMirror，编辑器 315KB 为异步 chunk；阻断该 chunk 后显示错误与重试，解除阻断点击重试可恢复，console 无错误。核心 26 文件 230/230、脚本 20/20、`pnpm build`、`pnpm generate:check` 通过。工具栏信息架构与站点侧正文清洗按约定不在本批范围。

- 2026-10-27：编辑器 UI 主题适配完成。`index.scss` 全量 token 化为 `--bytemd-*`，支持 `.dark`、`[data-theme="dark"]` 与元素自身 class/data-theme；同步 CodeMirror 背景、gutter、光标、选区、行高亮与暗色语法配色，tippy 下拉通过 `setProps({ theme })` + `onShow` 动态跟随主题；`markdown.scss` 补 `data-theme` 选择器；playground 增加 Theme 切换按钮及页面暗色样式。实测亮/暗下工具栏、编辑区、预览、侧栏/目录、状态栏、下拉颜色均正确切换，230/230 测试、20/20 脚本、构建与 `generate:check` 通过。宿主可通过覆盖 `--bytemd-*` 变量做品牌化。

- 2026-10-28：CM6 P0 spike 完成，结论暂缓 P1。裸 CM5/CM6 同口径（100/500 KiB Markdown、1280×800、无头 Chrome）：100 KiB 输入 CM6 27.7 ms vs CM5 9.0 ms、Task 14.84 vs 4.43 ms；500 KiB 初次加载 CM6 2074.5 ms vs CM5 44.5 ms，输入 27.1 vs 15.3 ms；两者 Layout 均 0.4–1.0 ms，未复现既有 112–152 ms 根布局基线。销毁各 10 次节点与 window/document 监听器增量均为 0。依据“100 KiB 无退化”未满足且未复现基线，`audit/CM6_PLAN.md` 更新为暂缓，重判前需在完整 ByteMD 场景（预览/滚动同步/heightAtLine）复现基线。实验页 `audit/cm6-spike/` 本地保留并已 gitignore，数据见 `audit/CM6_SPIKE_RESULT.md`。

- 2026-10-28：CM6 P0 补做完整场景复测（生产构建，CDP Trace）。CM5 使用 playground 完整 bytemd（工具栏/预览/滚动同步），CM6 使用编辑区 + 同一 bytemd 渲染预览（未含滚动同步/工具栏），同一 500/100 KiB fixture。500 KiB：CM5 Layout 最大 270.88（load）/226.35（scroll）/98.22（type）ms，CM6 201.96/100.41/88.79 ms；CM6 峰值下降但均 >75 ms 门槛；100 KiB 两者 Layout 总量基本持平（69/42/74 vs 69/43/73 ms），CM6 type 峰值略高（51.38 vs 34.35 ms）。CM6 500 KiB type Task 总时长 1501.6 ms vs CM5 646.3 ms，布局降低不等于输入整体更快。CM6 侧缺滚动同步导致 scroll 对比不等价。结论维持暂缓 P1，重判需含滚动同步的 CM6 原型；数据与限制见 `audit/CM6_SPIKE_RESULT.md`，`audit/CM6_PLAN.md` 已同步。

- 2026-10-28：CM6 P0 原型补滚动同步后复测。CM6 页面接入 `measureScrollMap` 双向同步（sourceMap），仍无工具栏/插件/TOC 点击。500 KiB：CM6 Layout 峰值 load 205.33 / scroll 101.71 / type 90.30 ms，CM5 226.85 / 169.91 / 92.88 ms；scroll 峰值下降约 40%，但均 >75 ms；CM6 type Task 总时长 1500.8 ms vs CM5 540.2 ms。100 KiB：load/scroll 接近，CM6 type 峰值 54.01 vs 34.49 ms。结论仍为不达门槛、暂缓 P1；数据与限制见 `audit/CM6_SPIKE_RESULT.md`。

- 2026-10-28：在 `feat/cm6` 分支完成 CodeMirror 6 最小内核原型（未提交）。新增 `CM6CompatEditor`（CM5 形状适配器，保留插件 `editor`/`codemirror.Pos` 调用面），`editor.ts` 工厂切到 CM6，`editor.svelte` 仅改类型；CM6 依赖替换 CM5 `codemirror-ssr`/`@types/codemirror`；`HighlightStyle` 接入 `--bytemd-syntax-*` 亮/暗 token；`.cm-*` 样式补编辑器高度/内容区/gutter/光标/选区。验证：231/231 测试、26/26 脚本、`pnpm build`、`generate:check`；playground 实测挂载/输入/预览/双向滚动同步/暗色/粗体动作。缺口：适配器仅覆盖子集（gfm 嵌套、frontmatter、overlay、keymap 全量、editorConfig 全量子集未完全），IME/移动/上传边界与 100 次挂载循环未人工复验；未提交、未发版。

- 2026-10-28：CM6 原型推进到生产实测（`feat/cm6`，未提交）。启用 GFM（`markdownLanguage`）、`HighlightStyle` + `--bytemd-syntax-*`、`layoutContainment` 下的 CM6 编辑器；playground 生产构建实测 500 KiB：加载 3718.4ms（含预览/插件）、输入同步无 containment 169.1ms、开启 containment 14.0ms、`heightAtLine` 全量 14.3ms、双 rolling 同步/粗体/暗色/390 移动端/CDP IME 均通过；231/231、26/26、build、generate:check 通过。关键结论：CM6 输入瓶颈是预览布局传播，不是内核；大文档宿主必须开启 `layoutContainment`。未完成：frontmatter/inline HTML/overlay 高亮、editorConfig 全量等价、真实 OS IME/移动设备；详见 `audit/CM6_PROD_RESULT.md`。
