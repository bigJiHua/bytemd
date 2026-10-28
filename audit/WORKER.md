# 可选 Worker 渲染入口

2026-10-25。本批把纯 Markdown 管线拆到 `bytemd/processor`，新增 `bytemd/worker` 注册入口和 `createWorkerRenderer` 客户端。Svelte、React、Vue 2、Vue 3 的 Editor / Viewer 都接受可选 `renderer`。未配置时保持同步渲染；没有升级依赖、框架或删除既有发布格式。

## 最小接入

宿主创建独立 Worker 文件，由打包器处理其 URL。不要在 Worker 中导入 `bytemd` 的 UI 主入口。

```ts
// markdown-worker.ts
import { installWorkerRenderer } from 'bytemd/worker'

installWorkerRenderer(self)
```

```ts
// host.ts — Vite 风格的模块 Worker
import { createWorkerRenderer, Editor } from 'bytemd'

const renderer = createWorkerRenderer(
  () =>
    new Worker(new URL('./markdown-worker.ts', import.meta.url), {
      type: 'module',
    })
)
const editor = new Editor({
  target: document.querySelector('#editor')!,
  props: { value: '# Hello', renderer },
})
editor.$on('change', (event) => {
  editor.$set({ value: event.detail.value })
})
// 宿主销毁其拥有的整个资源；单个 Viewer 卸载只取消自己的请求。
function dispose() {
  editor.$destroy()
  renderer.destroy()
}
```

React / Vue 封装使用相同的 `renderer` 参数。默认同步模式的 SSR 仍输出 Markdown HTML；选择异步 renderer 时 SSR 输出本地化 pending 状态，挂载后才开始请求。需要完整服务端 HTML 的宿主应在服务端使用默认同步模式或单独调用 `renderMarkdown`，并自行协调水合。

### 打包条件与 CSP

本仓库 Vite 4 的默认浏览器解析会把 `decode-named-character-reference` 选到使用 `document` 的入口。该依赖提供 `worker` 条件，真实线程接入必须让打包器选择它。已验证的 Vite 4 配置为：

```ts
// vite.config.ts
import { defineConfig } from 'vite'

export default defineConfig({
  resolve: { conditions: ['worker'] },
  worker: {
    format: 'es',
    rollupOptions: {
      output: {
        entryFileNames: 'assets/worker-[name]-[hash].js',
        chunkFileNames: 'assets/worker-[name]-[hash].js',
      },
    },
  },
})
```

该配置也让主线程选择可移植的实体表解码器。模块 Worker 设置 `format: 'es'`，避免 Vite 4 默认 IIFE 与插件动态 import 分包冲突；独立 Worker 文件名前缀避免 Vite 4 把主线程和 Worker 的 KaTeX 动态产物写成同名文件。注册完整插件工厂可能包含不会执行的 DOM 模块动态 import，宿主也可直接注册纯 remark/rehype 插件以减少线程产物。其他打包器应启用相应的 Worker 条件，并验证注册插件的所有依赖均可在线程中加载。Worker URL、模块加载方式和 CSP `worker-src` 由宿主管理；库不会修改 CSP。创建失败、启动/执行超时、通信异常均显示渲染错误，不会自动掩盖为成功。

## 函数插件与注册表

默认客户端只把不含解析回调、`sanitize` 回调及不可序列化 `remarkRehype` 的请求送给 Worker。仅有 `viewerEffect` / `editorEffect` / 工具栏动作的插件可以保留。任意 `remark`、`rehype`、`sanitize` 或 `remarkRehype.handlers` 函数均不能 structured-clone；无法映射的请求返回同步兼容结果（`mode: 'sync'`），不会静默丢弃函数。

解析插件需在线程中重新实例化，宿主的 `resolveOptions` 必须完整匹配每个解析回调及顺序、选项、sanitize 和 handlers。不要只比较插件数量、名称或宽泛地返回 `{}`；那会改变解析语义。下面是只注册 GFM 的例子：

```ts
// markdown-worker.ts
import gfm from '@bytemd/plugin-gfm'
import { installWorkerRenderer } from 'bytemd/worker'

const registered = gfm()
installWorkerRenderer(self, (config) => {
  if (
    !config ||
    typeof config !== 'object' ||
    Array.isArray(config) ||
    config.profile !== 'gfm' ||
    Object.keys(config).length !== 1
  )
    throw new Error('Unknown parser configuration')
  return { plugins: [registered] }
})
```

```ts
// host.ts
import gfm from '@bytemd/plugin-gfm'
import { createWorkerRenderer } from 'bytemd'

const registered = gfm()
const plugins = [registered] // 可追加仅有 DOM effect 的插件
const renderer = createWorkerRenderer(
  () =>
    new Worker(new URL('./markdown-worker.ts', import.meta.url), {
      type: 'module',
    }),
  {
    resolveOptions(input) {
      if (input.sanitize || input.remarkRehype !== undefined) return undefined
      const parsers = input.plugins?.filter((p) => p.remark || p.rehype) ?? []
      if (
        parsers.length === 1 &&
        parsers[0].remark === registered.remark &&
        parsers[0].rehype === registered.rehype
      )
        return { profile: 'gfm' }
      return undefined
    },
  }
)
// 将 plugins 和 renderer 一起传给 Editor / Viewer。
```

配置仅接受 JSON：函数、循环、特殊对象、非有限数字等明确拒绝。返回 `undefined` 才选择同步兼容路径。渲染后的 HTML、HAST、源码块、VFile data/history/cwd/messages 会传回；不可克隆的插件 metadata 明确报错，不会丢失后继续。客户端恢复 VFile 和消息方法，DOM 插件仍在主线程执行。remark/rehype 异步 transformer 不属于现有 `processSync` 契约，必须在自定义 renderer 中自行实现。

## 请求与生命周期

- 每次请求带版本与 `AbortSignal`；新请求取消旧请求，晚完成/失败及卸载后的结果被丢弃。pending/error 清空旧 HTML 和目录映射；ready 后按返回 value、HAST、源码块恢复预览、代码复制及 DOM effects。
- 默认 `strategy: 'queue'`：一个活动解析加等待队列。单个 Viewer 的旧排队请求被移除，其他 Viewer 请求保留。活动解析不可中断；取消后仍须等其返回或超时，最新请求才执行。
- `strategy: 'restart'`：取消活动请求时终止 Worker，保留其他排队请求并重建线程。可减少等待旧解析的时间，但付出冷启动、模块初始化和缓存丢失成本。单个 Viewer 不应调用共享 renderer 的 `destroy()`。
- 默认 `timeoutMs: 60000`，分别限制启动和活动执行；`0` 关闭超时。排队等待没有单独期限。超时/线程错误拒绝当前请求，终止线程并让后续排队工作重试；创建/启动失败拒绝当时等待的请求。
- `renderer.destroy()` 是宿主拥有的终止操作：结束线程、拒绝活动和排队请求，后续调用返回 AbortError。Viewer 只 abort 自己的请求。

`RenderResult.timings.renderMs` 是管线总时长；Worker 的 `queueMs` 含排队和冷启动等待，`startupMs` 暖请求为 0，`totalMs` 含排队、通信及 VFile 恢复，不含 Viewer DOM 插入、布局和插件。Worker 与主线程的 `performance.now()` 时基不同，只传阶段时长；不能相减两边的绝对时间。

## 验收与复现

全量 20 文件 / 205 用例通过；完整 `pnpm build` 含 TypeScript stage 退出 0。纯入口 ESM/CJS 在无 DOM Node 环境渲染成功；Svelte / React SSR 默认 HTML 与异步不启动线程通过。四框架共享回归覆盖 pending、过期结果、失败/恢复、metadata、复制、effect 清理及卸载；Editor 回归覆盖异步源码块与目录清空/恢复。

证据：[全量回归](./worker-regression-results.json)、[构建日志](./build-worker.log)、[入口/SSR 检查](./worker-entry-results.json)。Worker unit transport 是 structuredClone/EventTarget bridge；真实浏览器验收另存数据，不能把 bridge 称为真实线程测试。

复现浏览器页面，先 `pnpm build`，把 `audit/worker-ui.html` 复制为 `playground/worker-audit.html`，再运行：

```sh
pnpm --filter playground dev --config ../audit/worker-vite.config.mjs --host 127.0.0.1 --port 5176 --strictPort --force
```

打开 `/playground/worker-audit.html`。页面使用最新核心/插件产物与真实模块 Worker；固定 fixture 来源与第四批相同。两组使用相同异步 Viewer 生命周期，同步对照通过适配器在主线程调用 `renderMarkdown`，用于隔离线程位置的差异。首 RAF、最大帧间隔和 longtask 是浏览器可执行回调的证据，不是操作系统实际呈现延迟；单次大文档样本不用于 p95 或稳定吞吐量承诺。

### 实测结果

同页保留 20 个正式样本：两模式 10/100/500 KiB core 挂载和真实单键，100 KiB enhanced 挂载和单键，另加 100 KiB core 每模式 2 个单键，使该组各 3 次。Worker 实际执行成功，所有预期公式、高亮、图表、源码块和 VFile 方法均保留，没有插件错误。100 KiB enhanced 每次生成 154 个公式、77 个 JS 高亮块、3 个图表。复制成功反馈、目录定位、线程错误清理/恢复与真实旧结果丢弃均通过。

下表为真实单键；100 KiB core 是各 3 次中位数，其余各 1 次，不能推导 p95。阻塞总量为所有相交长任务的 `max(duration - 50, 0)` 之和。两模式均含默认 300ms 防抖和完整 DOM/plugin 完成。

| 文档 | 最大主线程长任务 ms（同步 →Worker） | 最大 RAF 间隔 ms | 总阻塞 ms | 预览完成 ms |
| --- | --- | --- | --- | --- |
| 10 KiB core | 91 → 0 | 104.1 → 27.5 | 41 → 0 | 404.2 → 388.8 |
| 100 KiB core | 1468 → 65 | 1534.3 → 130.6 | 1435 → 19 | 1870.2 → 860.6 |
| 500 KiB core | 24754 → 380 | 25058.4 → 652.9 | 25211 → 928 | 25630 → 3529 |
| 100 KiB enhanced | 1687 → 104 | 1765.1 → 250.6 | 1730 → 130 | 2670.8 → 1610.3 |

**结论：解析移出主线程改善了本次实测响应，但大 DOM 仍有可感知停顿。** 500 KiB Worker 单键仍有 380ms 长任务与约 653ms 最大帧间隔，不能称为流畅。500 KiB 两线程管线耗时约 24.4 秒 / 2.1 秒，尽管执行相同解析代码；与第四批一样，环境和不同运行时实例存在显著波动，未确定其原因。因此保留观察到的总耗时，不将差异宣称为解析算法或稳定吞吐量提速。10 KiB 冷启动挂载反而约 218ms，比同步 149ms 慢。取消策略的功能由自动测试覆盖，没有宣称实测 restart 更快。

证据：[原始数据](./worker-performance-results.json)、[分组汇总](./worker-performance-summary.json)、[交互结果](./worker-ui-results.json)、[截图](./worker-playground.png)。页面 DOM 可见性为 visible，工具仍保持在用户界面后台；真实浏览器数据来自 Vite 开发页，不等同于前台生产基线。

消费页 Vite 生产构建退出 0，preview 实际加载 `/playground/assets/worker-audit-*.js` 与模块 Worker，正确生成 14 个公式、7 个高亮块、3 个图表，8 个复制按钮、154 个源码块、VFile 方法均保留。证据：[生产构建](./build-worker-consumer.log)、[生产冒烟](./worker-production-results.json)、[截图](./worker-production.png)。使用 `worker-vite.config.mjs` 的 build 配置可复现；输出和临时服务在验收后清理。该样本仅验证打包/运行，不与开发性能混为一组。两次消费打包失败的日志保留，最终使用 Worker ES 格式和独立文件名前缀通过；没有升级 Vite。

中文 IME、真实堆快照、移动设备和前台生产消费页仍待专项测试。Worker 不减少解析工作量；500 KiB 的 DOM 插入、布局、结构化克隆和 CodeMirror 更新仍可能产生长任务。下一批优先把安装生成改为显式命令，再评估大 DOM 预览策略；发布裁剪和大版本迁移仍单独处理。
