# CM6 依赖与宿主适配测试（2026-11-04）

**核心依赖、内置插件及既有回归通过；Vue 2/Vue 3 包装组件遗漏 `editorExtensions`，Vue 3 async 同样受影响。正式发布 2.1.0 前应补齐并重新验收。**

## 范围与环境

按用户“测试”要求核验 `feat/cm6`，起始提交 `bab0cd603dcc2108d81ebe04fa1bad688e247ade`，起始工作区干净。Windows、Node 22.20.0、pnpm 8.15.9、Vitest 3.2.7/jsdom。本批没有修改包实现或清单，没有 npm 发布。

专项实例化真实宿主包装组件和 CM6 EditorView，传入两项原生扩展：`EditorView.editorAttributes` 添加 `data-cm6-probe="active"`，`EditorView.domEventHandlers` 注册 F9 键盘回调。确认编辑器已挂载后读取实际 DOM 属性，向 `contentDOM` 派发键盘事件并检查回调次数，同时核对编辑值不变。Vue 3 async 使用真实异步包装组件，测试 loader 返回已导入的 Vue 3 编辑器，因此不覆盖网络下载或分块失败。

本批未重跑独立 Chrome 生产矩阵、30 分钟回收、人工 OS IME 或真实移动设备；上述历史结果仍按第十三批原口径理解。

## 专项结果

| 宿主        | DOM 属性 | F9 回调次数 | 结果   |
| ----------- | -------- | ----------: | ------ |
| Svelte      | active   |           1 | passed |
| React       | active   |           1 | passed |
| Vue 2       | null     |           0 | failed |
| Vue 3       | null     |           0 | failed |
| Vue 3 async | null     |           0 | failed |

五个场景均成功挂载 CM6，编辑值保持不变。最终专项为 **2 passed / 3 failed，退出码 1**；三项失败各包含 DOM 属性和键盘回调两条失败断言。初次运行在属性断言失败后停止，原始日志保留；补充 soft assertions 后再次运行，使两个独立行为都得到实测，不改变通过条件。

根因：`packages/vue/src/editor.vue` 与 `packages/vue-next/src/editor.vue` 的 props 列表只有 `editorConfig`，未声明 `editorExtensions`。它们将已声明 props 传入 ByteMD 核心，新增参数未到达 CM6。Vue 3 async 转发 attrs 到 Vue 3 编辑器，随后遇到同一遗漏。核心已声明并消费 `editorExtensions`，React 的 props 转发也包含该参数。

## 既有回归与构建

| 检查 | 结果 | 本批日志 |
| --- | --- | --- |
| 核心 Vitest | 29 文件，256/256 passed | core.log |
| 全部 Node 脚本 | 58/58 passed，0 skipped | scripts.log |
| 完整 ESM/CJS/d.ts/样式构建 | passed，退出码 0 | build.log |
| generate:check | passed，退出码 0 | generate.log |
| 实际 tarball/类型/Svelte 宿主生产构建/纯入口/SSR | passed，退出码 0 | packages.log |

现有核心用例与包消费检查没有验证 Vue 的原生扩展参数；它们通过不代表这项接口已适配。本批未重新测量脚本覆盖率。

## 本地证据与复现

证据目录：`audit/prod-perf-cm6-host-adaptation-20261104-191832/`，按仓库约定被 Git 忽略。包含专项源码 `host-extensions.probes.test.ts`、初次日志 `host-extensions.log`、完整双行为日志 `host-extensions-complete.log`、上表日志及 `commit.log`。

```sh
pnpm exec vitest run --config audit/vitest.config.mjs audit/prod-perf-cm6-host-adaptation-20261104-191832/host-extensions.probes.test.ts --reporter=verbose
pnpm run test --run
pnpm run test:scripts
pnpm build
pnpm generate:check
pnpm run test:packages
```

待修：为两个 Vue 编辑器声明并透传原生扩展参数，把行为验证纳入持续回归，覆盖 Vue 3 async；修复后再执行全量回归、重新构建与实际包消费验收。当前本地 2.1.0 发行包仍含此遗漏。
