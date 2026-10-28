# 安装与显式生成流程

2026-10-25，第六批。根项目已移除 `postinstall`，旧 `scripts/postinstall.mjs` 由显式 `scripts/generate.mjs` 替代。默认安装不再重写源码、package.json、tsconfig、README 或 locale，也不再触发全库格式化。框架、依赖版本与 ESM/CJS/UMD 格式保持原有范围。

## 开发命令

```sh
pnpm install --frozen-lockfile
pnpm generate
pnpm generate:check
pnpm test:scripts
pnpm exec vitest run --threads false
pnpm build
pnpm dev
```

`generate` 在仓库根目录规划所有变更、校验完成后只写有差异的文件，并输出清单。路径依据脚本位置确定，从其他 cwd 调用也不会写到错误目录。`generate:check` 只读；存在生成差异时退出 1。配置本身的构建/消费正确性仍需 TypeScript、测试与包入口验证。生成器使用严格 JSON；无法解析的配置或不支持的 exports 结构会先报错，保留现有文件。

新增包、调整发布出口或插件清单时显式执行 `pnpm generate`。新检出目录的包内 LICENSE 是忽略文件，需该步骤准备；构建本身不重新生成维护者配置。发布命令会显式准备/检查生成内容后构建；本批没有执行发布。普通消费者安装遵循 pnpm 自身的依赖生命周期策略，根项目不再附加工作区重写。

## 生成范围与维护边界

| 内容 | 行为 |
| --- | --- |
| 包配置 | 补缺失的传统 ESM/CJS/UMD/type 出口、locale 别名和 files；核心包含 processor/worker/Svelte/CSS。保留已有自定义字段、条件出口、依赖、版本、作者和 repository，不强制改回上游。types 条件置于运行时条件前 |
| TypeScript | 缺失时补默认 extends/include/rootDir/outDir/核心引用；已有 include、exclude、compilerOptions、扩展配置和引用保留。根 references 只追加缺失的包，识别 Windows 反斜线，保留额外项目 |
| LICENSE | 从根 LICENSE 准备各包的忽略产物，仅有差异时写入 |
| 插件列表 | 只更新根 README、docs/index、核心 README 的 `bytemd:plugins` 标记区域；私有插件不进公开表格 |
| 插件 README | 现有未标记文档完整保留。缺失 README 时从模板创建；带 `bytemd:usage` 标记的文档只更新使用示例区域。手写失败说明、灯箱契约、Options/Example 和标记外内容不覆盖 |
| 格式 | `pnpm format` 单独执行。Windows/Unix 使用兼容的双引号 glob，覆盖 mjs 等源码；历史审计 JSON 与原始 playground Markdown fixture 不被格式器改写 |

插件列表区域示例：

```md
<!-- bytemd:plugins:start -->

表格由生成器维护。

<!-- bytemd:plugins:end -->
```

已有插件文档如需采用模板使用区，手工在该区域放入 `<!-- bytemd:usage:start -->` / `<!-- bytemd:usage:end -->`；先把定制说明移到区域外，再运行生成器。标记缺失时保留原文，重复、倒置或单边标记会拒绝整次计划。目标链接或目录链接指向工作区外时拒绝写入；规划后检测到文件已被手动改动也会在应用前停止。

## CI 与验证

测试和 bundlewatch 工作流在安装后显式运行生成器及只读检查，再检查 Git diff，防止未提交的生成差异被 CI 隐式修补。测试工作流同时运行生成脚本回归。Node 22 / pnpm 8.15.9 在三个工作流中统一；style 在不经过安装格式化的情况下检查仓库。首次移除隐式 formatter 后，修正了 Windows 单引号 glob 问题，并一次性规范已有源文件格式；该变化不作为运行时功能修复或性能优化。

已实际完成两次 `pnpm install --offline --frozen-lockfile`，未使用 `--ignore-scripts`。首次对比 220 个文件/链接记录，重复安装扩大到 226 个（含 playground），均没有变化。连续两次 `pnpm generate` 及只读检查同样没有变化，包含新增 Worker 出口与所有手写插件文档。另从 `D:/Code` 调用脚本验证 cwd 不影响目标根目录。

9 个 Node 脚本回归覆盖自定义配置/条件出口保留、新包默认配置/许可证/使用文档、第二次运行零差异、未标记文档/区域外内容保留、私有插件过滤、异常规划无写入、晚修改检测、CRLF/错误标记与目录链接边界，以及拒绝把条件式根 exports 混入子路径映射。格式规范化后核心 20 文件 / 205 用例通过，追加示例保护后最终为 **21 文件 / 206 用例**。

两次完整 `pnpm build` 含 TypeScript 均退出 0。每轮构建分别对比自身前后 226 个源文件/链接记录，零变化；两个构建的 **209 个产物记录完全相同**。独立 ESM/CJS 纯入口和 Svelte/React SSR 检查通过。包源文件在最后的示例修复中没有变化，未进行无关的第三次构建。

浏览器验收发现本批全库 Prettier 把自定义手风琴与时间线合为单行，也折行了故意用于验证横向滚动的代码。该演示文件在本批开始时没有未提交修改，已从格式化前的 HEAD 精确恢复，并加入 `.prettierignore`；新增直接读取真实示例、验证节点与描述的回归。实际运行 `pnpm format` 前后 fixture SHA-256 完全相同。通用 Markdown formatter 不认识这里的块语法，后续维护应手工保留行边界，而不能只依赖核心独立语法测试。

恢复的真实 playground 基于既有包构建产物：手风琴 1 组/3 项、时间线 1 组/5 项，默认展开及描述正确；提示块 5 个、拼音 2 个、公式 2 个、高亮块 5 个、图表 1 个、复制按钮 5 个；无错误提示，预览非 pending。全库 style、只读生成与 Git 空白检查通过。本次属于功能冒烟，没有重测性能、中文 IME 或内存泄漏。

证据前缀为 `generation-*`；保留前几批所有历史数据。本批完成前的 205 用例报告保留，最终追加示例后的结果另存。

| 验证 | 证据 |
| --- | --- |
| 普通/重复安装、重复生成与源文件比对 | `generation-install*.log`、`generation-before-install-vs-after-install.json`、`generation-before-repeat-vs-after-repeat.json`、`generation-before-repeat-vs-after-generation.json` |
| 两次构建与逐文件相同产物 | `build-generation-first.log`、`build-generation-second.log`、`generation-outputs-first-vs-outputs-second.json`、`generation-before-build*-vs-after-build*.json` |
| 生成器回归 | `generation-script-tests-final.log` |
| 最终 206 用例与入口/SSR | `generation-final-regression-results.json`、`generation-entry-results.json` |
| 格式保护与 style/生成检查 | `generation-fixture-format-results.json`、`generation-format-final.log`、`generation-style-final.log`、`generation-check-final.log` |
| 浏览器 DOM 与截图 | `generation-ui-results.json`、`generation-playground.png` |

## 仍待完成

- 桌面生产消费页、CDP composition 与真实堆快照已在第七/八批复核中补测，见 [生产验收](./PROD_PERF.md)；人工 OS 输入法和真实移动设备仍待完成。
- 大文档首帧已增加可选主体尺寸隔离，见 [定向优化](./LARGE_DOCUMENT.md)；完整预览的解析、DOM 和插件长任务仍在，Worker 不减少总解析工作量，分块/虚拟预览仍待独立评估。
- 开发/发布依赖范围、Lerna/engines 与维护工具链的后续决策。本批不升级依赖。
- 包发布元数据、ESM/CJS/UMD 使用范围与格式裁剪，及 unified/remark/rehype、Svelte 5、CodeMirror 6 迁移；这些仍是独立阶段。
