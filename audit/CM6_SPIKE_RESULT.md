# CM6 P0 Spike 结果（2026-10-28）

> 目标：对比 CodeMirror 5 与 CodeMirror 6 在 500 KiB Markdown 下的编辑/布局/销毁成本，决定是否进入 P1。实验代码在 `audit/cm6-spike/`（本地，已 gitignore）。本文包含两轮：裸编辑器对照与完整页面场景。

## 1. 第一轮：裸编辑器（参考）

- 同一样本，CM5 markdown vs CM6 lang-markdown，480px 视口，插入换行，3 次中位数。
- 100 KiB：CM5 输入 9.0 ms / Task 4.43 ms；CM6 27.7 ms / 14.84 ms。
- 500 KiB：CM5 加载 44.5 ms、输入 15.3 ms；CM6 加载 2074.5 ms、输入 27.1 ms。
- 销毁 10 次：两者节点与 window/document 监听器增量均 0。
- 局限：裸编辑器没有预览、滚动同步、sourceMap，且 CM5/CM6 解析策略不同（CM5 视口惰性解析，CM6 全量 Lezer），不能代表生产 Editor。

## 2. 第二轮：完整页面场景（生产构建）

- CM5：现有 bytemd 完整 Editor（playground 生产构建），含工具栏、预览、滚动同步、sourceMap。
- CM6：CM6 编辑区 + 同一 `bytemd/processor` 预览（300ms 防抖）+ `measureScrollMap` 双向滚动同步；仍无工具栏/状态栏/上传与插件。
- 同一 500 KiB / 100 KiB fixture（`audit/performance-fixtures.mjs`），1280×800，生产构建，CDP Trace 统计 `Layout` / `UpdateLayoutTree` / `RunTask`（阶段内总和与最大值）。
- 操作：加载全文 → 滚动到 50% → 在文档中部插入字符。

### 500 KiB

| 实现 | 阶段   | Layout 总/最大         | Style 总/最大 | Task 总/最大   |
| ---- | ------ | ---------------------- | ------------- | -------------- |
| CM5  | load   | 233.84 / **226.85** ms | —             | —              |
| CM6  | load   | 227.65 / **205.33** ms | —             | —              |
| CM5  | scroll | 273.89 / **169.91** ms | —             | —              |
| CM6  | scroll | 383.62 / **101.71** ms | —             | —              |
| CM5  | type   | 175.18 / **92.88** ms  | —             | 540.2 / 184.19 |
| CM6  | type   | 93.16 / **90.30** ms   | —             | 1500.8 / 104.7 |

### 100 KiB

| 实现 | 阶段   | Layout 总/最大   | Task 总/最大   |
| ---- | ------ | ---------------- | -------------- |
| CM5  | load   | 58.17 / 49.92 ms | —              |
| CM6  | load   | 67.29 / 43.39 ms | —              |
| CM5  | scroll | 41.32 / 20.99 ms | —              |
| CM6  | scroll | 43.77 / 22.93 ms | —              |
| CM5  | type   | 74.43 / 34.49 ms | 835.8 / 322.0  |
| CM6  | type   | 76.21 / 54.01 ms | 1790.2 / 364.2 |

## 3. 结论

**按预设“500 KiB 单次根布局 ≤75 ms”门槛：仍不通过。**

- 500 KiB 完整场景（CM6 已含滚动同步）：CM6 Layout 最大值为 load 205.33 / scroll 101.71 / type 90.30 ms，均 >75 ms；CM5 为 226.85 / 169.91 / 92.88 ms。
- CM6 相比 CM5 的布局峰值下降：load 最大 -9.5%、scroll 最大 -40.1%、type 最大 -2.8%；但累计 Layout 在 scroll 反而更高（383.62 vs 273.89 ms）。
- Task 总时长并非全面下降：500 KiB type CM6 1500.8 ms vs CM5 540.2 ms；100 KiB type CM6 1790.2 ms vs CM5 835.8 ms。布局变低不等于输入整体更快。
- 100 KiB 的 Layout 总量与 CM5 基本持平（58/41/74 vs 67/44/76 ms），type 最大值偏高（54.01 vs 34.49 ms），没有明显退化，也没有明显收益。
- CM6 原型仍无工具栏、状态栏、上传与插件；滚动同步为 sourceMap 简化版，TOC 点击/块定位未实现，仍非生产等价。
- 销毁：第一轮裸测两者 10 次均为节点 0 / 监听器 0；完整页面销毁未单独复测。

**建议：暂缓 P1，不建议直接启动破坏性迁移。**

理由：完整场景下 CM6 有布局峰值收益，但未达 75 ms 目标；CM6 侧缺失滚动同步，不能证明生产等价；且公开 API 破坏面大、迁移成本高。若产品愿意把目标改为“相对改善”并接受分阶段迁移，应先做 P1 原型（CM6 + 完整滚动同步 + 工具栏），在同一 fixture 下复测，再决定是否发 major。

## 4. 限制

- 无头 Chrome，本地无网络/设备抖动；不代表真实 IME/移动端。
- CM6 原型已含 sourceMap 滚动同步，但仍无工具栏/插件/TOC 点击，属于“编辑 + 预览 + 滚动”子集。
- Trace 统计包含预览渲染与页面其他布局，未能完全隔离 `updateHeightsInViewport` 调用栈。
- 500 KiB 为字符数近似字节数，fixture 为 ASCII。
- 输入后预览文本长度未变化（插入点可能与渲染文本重复），但编辑操作本身已执行。
