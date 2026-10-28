# 项目复盘与补充审计 — 2026-10-26

本轮审计与修补验收记录始于 2026-10-26，文档收尾于 2026-10-27；原始证据保留在同一批次目录。

## 当前阶段

本次以当前工作区、`PLAN.md`、`AGENTS.md`、[生产性能记录](./PROD_PERF.md)、[大文档验收](./LARGE_DOCUMENT.md)及本地原始证据复盘。核心修复至第六批、七/八批桌面自动化验收、九批发布工具整理均已实施。第十批发布格式与框架/解析链大版本迁移未启动；人工操作系统中文输入法与真实移动设备仍为 `incomplete`。

本轮是已有实现的补充审计与修补，保持 Svelte 3、CodeMirror 5、现有 ESM/CJS/UMD 出口，`maxLength` 仍只提示，`layoutContainment` 默认关闭。已有工作区变更与历史证据保留；没有提交或发布。

## 确认问题与修复

| 问题 | 原行为与影响 | 本轮处理与证据 |
| --- | --- | --- |
| CodeMirror 活动手势卸载 | 原生选区/文本拖拽中卸载，当前实例的 document mousemove/mouseup 监听器可残留 | 销毁前调用 `cancelEditorInteractions`，仅结束当前实例活动回调；回归验证正文/doc 身份不变、无 change、peer 选区和手势保留、监听器释放、延迟不再聚焦 |
| Worker 配置期间取消 | `resolveOptions` 或序列化回调中 abort/destroy，任务可在取消后入队并永久 pending | 配置回调与序列化后重新检查取消/销毁；立即 reject，不创建无效任务 |
| Worker JSON 共享引用 | 全局 visited 集合把无环共享对象误判为循环，导致合法配置回退或拒绝 | 仅检测祖先链循环，允许共享引用；继续拒绝真正的循环结构 |
| 性能 comparison 汇总遗漏 | 汇总写死 size/profile/variant，遗漏合法的自定义矩阵并输出空组 | 按实际样本分组；10 KiB/core 两组真实浏览器样本被正确保留，Node 回归覆盖自定义矩阵 |
| CDP 连接失败清理 | 同步发送抛错、远端 close 或主动 disconnect 后，请求/定时器可继续挂起 | 同步失败清理 pending/timer；关闭时拒绝待请求与后续发送，新增及加强脚本回归 |
| 数学插件嵌套旧 KaTeX | 旧结论只检查直接依赖，遗漏实际加载的 0.13.24/0.15.6；选择性信任 `htmlData` 时旧版可输出注入的属性名 | 工作区定向 overrides 收敛为 0.16.47；新增合法 inline/display/htmlData、属性注入拒绝与恢复、默认禁止 javascript href 三项回归 |

CodeMirror 清理使用 CM5 私有活动回调，后续升级需重新审查。未移动的拖拽收尾可能收起已销毁实例选区；测试确认正文、doc 身份及其他实例选区保留。此实现没有向 document 广播合成 mouseup。

KaTeX 的真实旧版 PoC 为 `\htmlData{x onmouseover=alert(1)}{X}`，0.15.6 在信任该命令时输出 `<span class="enclosing" data-x onmouseover="alert(1)">`；0.16.47 拒绝该属性名。这里的暴露条件是宿主启用对应 trust 配置，不能描述成默认配置下任意公式执行脚本。

另同步修补根/playground Vite 到 `^4.5.14`，按各依赖大版本约束 glob/CSS/构建传递依赖，以及 Babel traverse/form-data。升级后 Vue 3 生命周期测试暴露 pnpm 嵌套 runtime 解析失败；Vitest resolver 使用 `realpathSync` 返回真实路径后恢复通过。全库格式扫描排除 Git 已忽略的 `.codeartsdoer/` IDE 数据，未修改其中的文件。

CI 原先已包含脚本测试，旧待办不再适用。本轮将 CI 命令改为 `pnpm run test:scripts:coverage`，执行全部 Node 回归，并对 generate、CDP client、archiver、summarizer 四个关键模块设置聚合门槛：lines/statements/branches >=80%，functions >=75%。

## 实测验收

原始证据目录：`audit/prod-perf-reassessment-20261026/`。该目录被 Git 忽略，只在本地保存；本报告入库。没有覆盖前几批采样或旧 audit JSON。

| 验收 | 实际结果 | 本地证据 |
| --- | --- | --- |
| 核心与四框架回归 | 24 文件，221/221，通过；本轮新增 11 用例 | `regression.json`、`regression.log` |
| Node 脚本回归 | 20/20，通过，0 skipped；本轮新增 3 用例 | `script-tests.log` |
| 四个关键模块覆盖率 | lines/statements 84.75%，branches 85.12%，functions 80%，聚合门槛通过 | `coverage-gate.log`、`coverage-scripts/` |
| 完整构建含 TypeScript | `pnpm build` 退出 0 | `build.log` |
| 显式生成与格式 | `pnpm generate:check` 零漂移；全库 `pnpm style`、`git diff --check` 通过 | `generate-check.log`、`style-final.log` |
| 锁文件可复现安装 | `pnpm install --offline --frozen-lockfile` 退出 0 | `frozen-install.log` |
| 无 DOM 与 SSR 入口 | ESM/CJS processor/worker 渲染通过；Svelte/React SSR 默认 HTML、异步 pending、不启动 Worker 通过 | `entry-check.log` |
| 普通 playground | Vite 4.5.14，编辑器存在；手风琴 1/details 3、时间线 1/项 5、公式 2、高亮 5、Mermaid 1、复制按钮 5；alert/pending 0；点击展开成功，捕获的 console error 为 0 | `playground.json`、`playground.png` |

覆盖率仅针对四个模块，不能称全部审计工具或核心组件覆盖完成。summarizer 单文件 lines/statements 59.7%，仍须补齐未覆盖的性能、composition、memory 汇总分支。

### 生产消费页定向复验

使用当前完整构建产物和独立 Chrome/CDP 执行，命令退出 0，`errors=[]`：

```sh
node audit/prod-perf-reproduce.mjs --skip-build --skip-regression --layout-containment --phases=comparison,composition,memory,interaction --sizes=10 --profiles=core --modes=worker --samples=1 --memory-loops=1 --variants=baseline,body-size --audit-dir=audit/prod-perf-reassessment-20261026/browser
```

- comparison：10 KiB/core，baseline/body-size 各 1 个样本，汇总保留这两个实际组。
- composition：脚本采用固定矩阵，实际执行同步/Worker × 10/100/500 KiB 的提交/取消共 12 场景；6 个提交场景均覆盖组合期间返回的异步结果。
- memory：1 轮挂载/编辑/卸载、4 份真实堆快照；等待清理后 DOM nodes/listeners 增量为 0/0，JS heap 增量 **+709,296 bytes**。样本不足以判断堆增长趋势，零计数增量也不证明无泄漏。
- interaction：尺寸隔离开关保留几何、完整 DOM 和选区；目录定位扣除 scroll-margin 后偏差约 0.0875px；手风琴布局变化、错误清理与恢复、过期结果丢弃通过。

证据为 `browser.log`、`browser/prod-perf-summary.json`、`browser-analysis.json` 及 `browser/` 内原始样本/堆快照。该复现命令中的 build/regression 为 **skipped**，本轮全量构建与回归是在上表的独立命令中完成。完整 performance 矩阵没有重跑（`performance=null`），不更新历史性能基线，不宣称整体提速。自动 CDP composition 与桌面视口不替代人工 OS IME 或真实移动设备。

## 最新依赖安全结论

官方 registry 同日审计结果如下。数量按 pnpm 当前依赖路径统计，不能直接解释为独立漏洞数。

| 依赖图                   | critical | high | moderate | low | 总计 |
| ------------------------ | -------- | ---- | -------- | --- | ---- |
| 修补前 `--prod` 工作区图 | 0        | 26   | 38       | 8   | 72   |
| 修补后 `--prod` 工作区图 | 0        | 3    | 14       | 5   | 22   |
| 修补后完整开发依赖图     | 3        | 20   | 37       | 8   | 68   |

证据分别为 `audit-prod-before.json`、`audit-prod-final.json`、`audit-all-final.json`。`--prod` 工作区图包含私有 playground，不能当作所有已发布包运行时的统计。

- Vite 4.5.14 仍有 3 high/6 moderate/3 low；这些公告没有 Vite 4 修补版本。Vitest 0.29.8 和 Tinypool 0.4.0 在完整开发图中仍带来 3 critical，需独立升级测试与开发工具链。
- 工作区旧嵌套 KaTeX 的 moderate 已消除，0.16.47 仍有 low；Svelte 3 的 7 条 moderate、esbuild moderate、diff low 仍存在，不能宣称安全清零。
- **仓库的 pnpm overrides 不随 npm 包继承。** ESM 构建 external 的 rehype-katex/remark-math 由外部消费者重新安装，其嵌套 KaTeX 仍需独立依赖约束和安装验收；本轮不能宣称所有发布消费场景均已修复。

## 下一批优化与验收方案

1. **测试和开发工具链独立迁移。** 确认 Svelte 3 插件与 Vue resolver 兼容面，选择有公告修补版本的 Vite/Vitest 组合及对应覆盖率工具，处理 Tinypool 传递依赖；冻结当前 221/20 用例，验收 CI、完整构建、普通开发页、生产消费页和两种依赖图。
2. **外部发布消费验证。** 在不继承根 overrides 的干净目录安装打包产物，检查数学插件实际 KaTeX 路径，补 ESM/CJS/UMD 与 SSR/Worker 消费矩阵，再决定发布依赖修补方式。
3. **扩大测量工具覆盖。** 优先补 summarizer 的空样本、性能/内存/composition 分支及浏览器启动/失败清理关键路径；聚合覆盖率保持当前门槛，逐步建立单模块门槛。
4. **第十批按兼容面拆分。** 调研宿主使用 ESM/CJS/UMD 的范围后再裁剪格式/调整 bundlewatch；unified 11 及对应 remark/rehype 插件升级、Svelte 5、CodeMirror 6 各自独立评估，避免同时改变多个契约。
5. **保留人工待验项。** 人工 OS 中文输入法、真实移动设备和更多循环的内存趋势验证继续待完成。虚拟预览/分块 DOM 仍属评估项，需先明确目录、查找、打印、滚动映射和无障碍契约。
