# 第八批：大文档首帧与实例资源

2026-10-26，首轮实现与桌面自动化验证。继续使用 Svelte 3 / CodeMirror 5；人工 OS 输入法和真实移动设备尚未闭环。生产测量口径见 [PROD_PERF.md](./PROD_PERF.md)。

## 已落入核心的改动

- CodeMirror 工厂按 document 复用，避免每个 Editor 重装全局 resize/blur 监听器和测量节点；文档、历史、选区和实例选项独立。销毁停止光标闪烁并释放输入焦点。
- 四框架 Editor 新增可选 `layoutContainment`，默认 **false**。开启时给 `.bytemd-body` 施加 `contain: size`，切断大预览内容的固有尺寸向祖先传播；CodeMirror 的尺寸读取因此减少整页布局。开关动态更新保留同一文档和选区，React/Vue 2/Vue 3 撤销参数恢复默认值。
- 保留全部 HTML、源码块、代码复制按钮、目录和插件。尺寸隔离不做虚拟预览，不减少解析工作量，不使用布局/绘制隔离创建新的定位上下文。

固定高度宿主可以开启：

```svelte
<Editor {value} {plugins} {renderer} layoutContainment />
```

React 使用 `<Editor value={value} layoutContainment />`；Vue 2/3 使用 `<Editor :value="value" :layout-containment="true" />`。宿主仍须响应 change 更新 value。内容撑高的 `height:auto` 编辑器及打印展开时保持关闭，或打印前撤销该参数；本批不改变这些宿主的默认行为。

## 选择依据

默认生产页的 500 KiB CPU/布局 trace 显示，CodeMirror 的 `updateHeightsInViewport` 和可用宽度读取触发了两次约 **151.7 / 112.1ms** 的 document 根布局，只有约 19/17 个 dirty objects，却涉及约 **79,000 个布局对象**。预览提交后的 DOM/布局仍有额外成本。

第一次实验分别只给编辑区/预览区添加 `contain: layout`，36 个交替样本没有一致收益，部分 enhanced 首帧反而变慢，未采用。第二次实验对编辑器主体比较 baseline / size / size+layout，每个规模/插件/方案各 3 次，共 36 个同页交替单键样本：

| Worker 配置 | baseline 首 RAF ms | size 首 RAF ms | baseline 完成 ms | size 完成 ms |
| --- | --- | --- | --- | --- |
| 100 KiB core | 38.4 | 8.1 | 802.4 | 752.7 |
| 100 KiB enhanced | 50.3 | 5.1 | 1306.5 | 1076.8 |
| 500 KiB core | 194.6 | 4.4 | 2794.0 | 2703.8 |
| 500 KiB enhanced | 244.3 | 4.8 | 5214.5 | 3860.5 |

`size+layout` 未带来首帧上的必要额外收益，因此选用仅尺寸隔离，以保持定位/绘制语义。表中是每组 3 次的中位数，不是 p95/SLA。同步渲染仍会在 300ms 防抖后阻塞解析；Worker 模式仍有数百毫秒的 DOM/插件长任务，完整预览仍需要数秒。

## 验证与证据

- 核心 23 文件 **210/210**；脚本 **17/17**；完整构建含 TypeScript 通过。
- 四框架动态开启/撤销参数、独立文档/实例选项、焦点光标计时器清理均有回归。
- 开启尺寸隔离后的生产页按相同规模/模式/插件矩阵执行 36 个有效真实键盘样本、12 个自动化 composition 场景和 3 轮真实堆快照循环；交互专项覆盖开关前后尺寸/DOM/选区、目录跳转/滚动同步、手风琴布局变化、线程错误清理/恢复和旧结果丢弃。
- 原始对照：`prod-perf-review-layout-comparison/`、`prod-perf-review-size-comparison/`；汇总 `prod-perf-review-size-analysis.json`。
- 实际参数开启后的证据：`prod-perf-review-optimized/`；完整构建 `build-prod-perf-review-containment.log`，回归 `prod-perf-review-containment-regression.json`。

```sh
node audit/prod-perf-reproduce.mjs --skip-build --skip-regression --layout-containment --phases=performance,composition,memory,interaction
node audit/prod-perf-reproduce.mjs --skip-build --skip-regression --phases=comparison --variants=baseline,body-size,body-size-layout
```

下一步应独立评估完整预览的 DOM 提交/插件调度或分块方案，并验证查找、目录、滚动映射、打印、无障碍和插件兼容。人工 OS IME、真实移动设备仍未完成；依赖/发布与大版本迁移继续按计划后置。
