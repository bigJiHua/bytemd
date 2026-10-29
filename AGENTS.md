# AGENTS.md — ByteMD fork 开发说明

供代码智能体（agent）和后续会话使用的项目约定。权威进度与验收记录见 `PLAN.md`；最新复盘见 [audit/REASSESSMENT.md](./audit/REASSESSMENT.md)，生产性能与内存证据见 `audit/PROD_PERF.md`、`audit/LARGE_DOCUMENT.md`。

## 项目概述

- ByteMD v1 定制 fork（上游 pd4d10/bytemd，本仓库 bigJiHua/bytemd），基于 ByteMD v1 定制开发。

- Monorepo：pnpm workspace（`packages/**` 14 个发布包 + `playground` 私有包；examples 不在 workspace 内）。
- 技术栈：TypeScript + Svelte 5（bytemd 核心，`legacy-compat` 保留 `$set/$on/$destroy` 类 API）、CodeMirror 5、unified 11 / remark 15 / rehype 13；四框架包装（react / vue / vue-next）。
- 构建：`scripts/build.mjs`（产物 ESM/CJS + d.ts）；测试：Vitest（jsdom）。

## 常用命令

```sh
pnpm build          # 完整构建（clean + build.mjs + tsc --build）
pnpm test           # Vitest 核心回归（当前 26 文件 230 用例）
pnpm run test:scripts  # Node 脚本测试（generate + audit 工具，20 用例）
pnpm run test:scripts:coverage # 四个关键脚本的覆盖率门槛，CI 执行此命令
pnpm generate       # 生成 README.md / docs/index.md / packages/bytemd/README.md
pnpm generate:check # 校验生成产物与源一致（防漂移）
pnpm format         # prettier + sort-package-json
pnpm pub            # generate → check → build → pnpm -r publish --no-git-checks
```

安全审计需绕过华为云镜像（不支持 audit POST 端点）： `pnpm audit --prod --registry=https://registry.npmjs.org`

## 关键纪律（违反会产生回归）

1. **generate 与 prettier 冲突**：`README.md`、`docs/index.md`、`packages/bytemd/README.md` 是 `scripts/generate.mjs` 的生成产物，已列入 `.prettierignore`。若被误格式化导致 `generate:check` 失败，运行 `pnpm generate` 恢复，不要手工编辑这三个文件。
2. **验收不虚报**：每批任务以实测证据闭环（采样目录、测试输出、构建日志），`--skip-*` 运行如实记为 skipped；人工/设备未验证的项标 incomplete，不勾选完成。
3. **fork 版权**：不修改包的 `author`/`name`/LICENSE；`repository.url` 已统一指向 fork（bigJiHua/bytemd）。
4. **测试数据不入库**：`.gitignore` 已忽略 `audit/prod-perf-*-*/`（采样运行目录）、`audit/cm6-spike/`（CM6 spike 本地实验）、`*.heapsnapshot`、`*.cpuprofile`、`audit/**/*.{json,ts,png,test.mjs}`（递归，任意 audit 子目录）。入库的只有验收文档（.md）和复现脚本/页面（.mjs/.html/.svelte）。
5. **测量先订阅后执行**：CDP 事件等待必须在触发动作之前订阅；页面求值包在函数中并检查 `exceptionDetails`。
6. **批处理纪律**：一次一个批次，每批完成即跑全量回归（`pnpm test` + `pnpm run test:scripts` + `pnpm build` + `pnpm generate:check`）并更新 `PLAN.md` 进度日志。
7. **本地化/工具镜像目录**：仓库不再使用 git 符号链接（Windows `core.symlinks=false` 下不可用）。各插件包保留双份目录：`packages/*/src/locales/`（构建消费）与 `packages/*/locales/`（npm 发布，唯一内容源），以及 `packages/plugin-math-ssr/{locales,src/utils}/` 镜像 `packages/plugin-math/{locales,src/utils}/`。修改文案/共享 utils 时只改源侧（顶层 `locales/`、`plugin-math/src/utils/`），并把镜像侧同步为字节一致；`scripts/test/hygiene.test.mjs` 会校验两侧一致，`packages/bytemd/src/locales` 已删除且不得重建。

## 当前状态（2026-10-26）

| 批次 | 状态 |
| --- | --- |
| 核心审计修复 R1-R3 ~ 第六批 | 完成 |
| 第七批 生产大文档交互与内存验收 | 桌面自动化验收完成；人工 OS IME、真实移动设备 incomplete |
| 第八批 大 DOM 与 CodeMirror 定向优化 | 桌面自动化验收完成；layoutContainment 默认关闭，同上两项 incomplete |
| 第九批 依赖范围与发布工具链 | 工具整理与同大版本补修完成；剩余安全工具链迁移待续 |
| 第十批 发布格式与大版本迁移 | 格式裁剪（ESM/CJS）+ unified 11 + Vite 5/Vitest 3 + Svelte 5 完成（2026-10-28）；CM6 迁移 P0-P4 已在 `feat/cm6` 实验分支完成（2026-10-29，待拍板合入/发版）；vite 6+ 评估待续 |

本轮全量验收通过：核心 24 文件 221/221、脚本 20/20、四个关键脚本覆盖率门槛、完整构建、generate:check、style、纯入口/SSR 检查及普通 playground 冒烟。证据在 `audit/prod-perf-reassessment-20261026/`，本地不入库；此前完整桌面矩阵复验保留在 `audit/prod-perf-audit-verify/`。

本轮浏览器定向复验覆盖 12 个 CDP composition 场景、10 KiB/core 两种尺寸隔离方案各 1 次及交互检查，不是完整性能矩阵重测。1 轮内存检查等待销毁 1 秒并强制 GC 后，nodes/listeners 增量为 0/0，JS heap 增量为 +709,296 bytes；该结果不证明无泄漏或整体性能提升。浏览器流程自身的 build/regression 标为 skipped，独立全量验收日志另存。

## 安全审计结论（2026-10-28，pnpm audit 官方 registry）

- `--prod` 工作区图（含私有 playground，不等同已发布包运行时）：**18 条（0 critical / 1 high / 14 moderate / 3 low）**，较 2026-10-26 的 22 条（3 high/5 low）下降。残留 1 high 为 vite（修补需 ≥6.4.4，受 Svelte 3 插件限制无法升 vite 6）；katex low 需 0.18.2（大版本）；deepmerge low 无修补版本。
- 完整开发依赖图：**34 条（0 critical / 5 high / 25 moderate / 4 low）**，critical 已清零（Vitest 3.2.7 + tinypool 2.1.2 override）。残留 high：svgo（修补需 4.x，dev-only 图标工具）、lodash（无修补发布）等；axios/cross-spawn/vue-next 测试工具已通过 override 或升级收敛。
- 根 overrides 不随 npm 包发布或继承，外部消费者仍需独立验收；原始结果与复现命令见安全段历史记录。

## 后续计划（按优先级）

### P0 工具链安全补修（本轮完成，残留公告待迁移）

- [x] 核实 CI 已执行脚本测试；本轮改为带覆盖率门槛的 `pnpm run test:scripts:coverage`，包含全部 Node 脚本回归。
- [x] 根/playground Vite 同步为 `^4.5.14`；旧 `^4.5.2` 建议不足以覆盖当前公告。
- [x] 按各依赖大版本收敛安全修补：braces/minimatch/brace-expansion/nanoid/picomatch、micromatch/postcss/rollup/immutable/source-map-js、Babel traverse/form-data；保留其他大版本分支。
- [x] 下一优先项：独立升级 Vite/Vitest/Tinypool，处理残留 high/critical（Vitest 3.2.7 + tinypool 2.1.2 override 完成，开发图 critical 清零；Vite 6+ 受插件/Svelte 约束，残留 high 见安全段）。

### P1 第十批前置（确认兼容面）

- [x] 调研宿主实际使用的模块格式（ESM/CJS/UMD），决定发布格式裁剪；bundlewatch 从盯 UMD（653KB）改为盯 ESM+CSS（裁剪为 ESM/CJS，bundlewatch 设 maxSize 实测 PASS）。
- [x] 为 generate、CDP client、archiver、summarizer 四个关键模块启用 c8 聚合门槛：lines/statements/branches >=80%、functions >=75%。本轮 lines/statements 84.75%、branches 85.12%、functions 80%，不代表全部审计脚本或核心组件覆盖率。
- [ ] 补充剩余浏览器采样/堆快照路径和核心组件覆盖率；当前 summarizer 单文件覆盖率仍低于整体门槛。

### P2 大版本迁移（各自独立批次，冻结回归基线）

- [x] unified 11 及对应 remark/rehype 插件分步升级（2026-10-28 完成：unified 11 / remark-parse 11 / remark-rehype 11 / rehype-raw 7 / rehype-sanitize 6 / rehype-stringify 10 / remark-gfm 4 / remark-math 6 / rehype-katex 7 / remark-frontmatter 5 / remark-breaks 4 / remark-gemoji 8 / rehype-highlight 7；KaTeX low 修复路径仍需 0.18 大版本）。
- [x] Svelte 5 迁移（2026-10-28 完成：svelte 5.57 + vite-plugin-svelte 4 + RTL 5 + svelte2tsx 0.7 + prettier 3；`legacy-compat` 桥保留 `new/$set/$on/$destroy` 供 react/vue 包装；导出 `EditorComponent/ViewerComponent` 供 Svelte 宿主模板渲染；playground 改 `mount()` 入口并加 `verbatimModuleSyntax`）。
- [ ] Vite 6+ 评估（vps 4 的 peer 仍为 vite ^5）。
- [x] CodeMirror 6（B 方案适配器，`feat/cm6` 实验分支，2026-10-28/29）：规划、P0 spike、P1 内核替换 + 生产实测、P1-P4 收尾批次与浏览器复验完成，见 [audit/CM6_PLAN.md](./audit/CM6_PLAN.md) 与 `audit/CM6_PROD_RESULT.md`；真实 OS IME/移动设备、外部消费验证与版本策略待续

### P3 人工验收项（需人工/设备）

- [ ] 人工操作系统中文输入法验证（CDP composition 是自动化证据，不替代人工）。
- [ ] 真实移动设备验证。

## 环境备注

- Node >= 20（engines），CI 用 Node 22 + pnpm 8.15.9。
- Windows 开发环境：shell 为 git-bash；npm registry 默认华为云镜像（audit 需切官方源，见上）。
- IDE 内置浏览器存在，但自动安全检查可能拒绝本地 URL；生产采样用 `audit/prod-perf-reproduce.mjs` 启动的独立 Chrome（CDP）。
