# 1.22.4 升级复核修复验收（2026-11-04）

对应 `PLAN.md` 第十一批。已修复本轮确认的 8 项问题，并处理阻碍验收的 Svelte 5 SSR 脚本和 Windows 换行格式问题。代码与验收记录留在本地，本批未发布 npm。

## 修复结果

| 问题 | 修复 | 验证 |
| --- | --- | --- |
| 发布依赖与导入名不一致 | 原导入键保持 `bytemd`，发布依赖写为 `npm:@jihua/bytemd@<version>`；明确版本范围不再拼接重复版本 | 核心/三包装实际 tarball，三包装 ESM/CJS 六个入口、Vue 3 Viewer/Async 子入口与两种异步分块通过 |
| Svelte 运行入口与类型不一致、props 变 any | Svelte 条件优先选择对应声明；类型生成排除无类型 env 声明，使用 v4 shims；生成和复制准确组件声明 | 正常 Editor/Viewer/Component 模板通过；数值 value 和非法 mode 被拒绝；imperative 类 API 与 React 包装类型通过 |
| Tool 按钮提交宿主表单 | 三处原生按钮明确 `type="button"` | Chrome 点击/键盘操作后 submit=0 |
| 预设键盘重复切换 | 移除原生 button 的重复 keydown，使用浏览器 click 激活 | Chrome Enter 展开、Space 收起，执行动作仅 1 次 |
| resize 监听残留 | onMount 返回清理移除同一个 measureContainer | Chrome 销毁后 0，两轮后仍 0；回归覆盖同页 peer 保持可用 |
| 窄屏强制 split 的 tab 误切 | tab 事件使用 effectiveSplit | 桌面 Chrome 390px 模拟中重复选择预览仍可见且 aria-selected=true |
| all.css 亮色预设压过暗色容器 | 属性选择器包入 :where，不增加特异性 | daylight 在暗色宿主保持暗色；亮色 daylight 与独立 ink 均正常 |
| CI 漏跑发布/主题脚本测试 | 统一脚本测试发现器，覆盖率命令执行全部文件；CI 构建后执行 test:packages | 全部 44 个 Node 测试实际执行，聚合覆盖率门槛通过 |

实际包消费检查还发现预处理后的 `.svelte` 模板保留 `entry.children!`，外部宿主构建报错。改为普通 JavaScript 的 `entry.children ?? []` 后，打包 Svelte 宿主生产构建以及真实 Chrome 挂载、编辑、双 Viewer 更新均通过。

`audit/worker-entry-check.mjs` 已改用 Svelte 5 `render()`，标题断言允许新生成的 id 属性。Prettier 使用 `endOfLine: auto`，使 Windows 的 CRLF 检出可持续通过格式校验；本轮也格式化了原先报告的 23 个文件，生成 README 三份文件未手动编辑。

## 回测证据

| 检查 | 实测结果 | 本地证据 |
| --- | --- | --- |
| pnpm test | 27 文件，236/236，0 失败 | audit/prod-perf-review-20261104/fix-core-tests.log |
| pnpm run test:scripts | 44/44，0 skipped | audit/prod-perf-review-20261104/fix-script-tests.log |
| pnpm run test:scripts:coverage | 44/44；lines/statements 85.75%、branches 85.84%、functions 80%，门槛通过 | audit/prod-perf-review-20261104/fix-coverage.log |
| pnpm build | 退出 0 | audit/prod-perf-review-20261104/fix-build.log |
| pnpm run test:packages | 打包/运行导入/类型/Svelte 生产构建通过；processor/worker ESM/CJS 与 Svelte/React 默认/异步 SSR 通过 | audit/prod-perf-review-20261104/fix-package-tests.log；audit/prod-perf-packages-x5yLO5/results.json |
| Chrome 定向复验 | errors=[]，表单/键盘/resize/主题/390px tab/打包 Svelte 宿主交互通过 | audit/prod-perf-fixes-20261104/upgrade-ui-results.json、browser.log |
| 全 14 包发布演练与字节还原 | 14/14 包 dry-run 成功；14/14 manifests SHA-256 一致，发布备份已清理 | audit/prod-perf-fixes-20261104/publish-results.json、publish-dry-run.log |
| generate:check、style、Git 空白检查 | 三项均退出 0；生成产物一致，Prettier 检查通过，无 Git 空白错误 | audit/prod-perf-fixes-20261104/generate-check.log、style.log、git-diff-check.log |

依赖运行环境为 Node 22.20.0、pnpm 8.15.9。tarball 消费检查使用实际打包字节和已安装 lockfile 依赖图，通过本地链接提供依赖和 npm alias；没有联网重新安装消费者依赖，也没有检查或替换 registry 已发布的 tarball。

原始复核结果保留在 `audit/prod-perf-review-20261104/`，后验数据另存，未覆盖原始 consumer/browser/layout-theme JSON。原始失败日志不是当前验收结论。

## 复现

```sh
pnpm test
pnpm run test:scripts
pnpm run test:scripts:coverage
pnpm build
pnpm run test:packages
pnpm generate:check
pnpm style
node scripts/publish-jihua.mjs --dry-run
```

`test:packages` 会打印本次 `audit/prod-perf-packages-*` 输出目录。将其中 `svelte-consumer-dist` 传给浏览器复验：

```sh
node audit/upgrade-ui-reproduce.mjs audit/prod-perf-fixes-repeat audit/prod-perf-packages-<run>/svelte-consumer-dist
```

脚本使用独立无头 Chrome，默认 HTTP 5196/5197、CDP 9396；结束清理服务与浏览器。未提供打包宿主目录时该项如实标记 skipped。

人工操作系统 IME、真实移动设备继续 incomplete；本批未重跑完整性能/堆快照矩阵或官方 registry 安全审计。236 个核心测试不是完整核心组件覆盖率，四模块 c8 聚合结果也不代表全部审计脚本覆盖率。
