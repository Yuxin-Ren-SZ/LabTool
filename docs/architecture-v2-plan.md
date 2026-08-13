# LabTools 架构重写方案：共享层 v2 与分批迁移路线图

> 状态：v1 定稿（2026-08，全仓审计完成）
> 约束前提：**运行时零依赖、无构建步骤**的纯静态站点；`file://` 直接打开与 GitHub Pages 部署都必须可用；现有浏览器端数据（IndexedDB / localStorage）必须无损迁移。

---

## 第一部分 · 现状审计

### 1.1 系统概览

| 层 | 文件 | 规模 | 职责（现状） |
|---|---|---|---|
| Hub | `index.html` | 430 行 | 工具卡片、分类、搜索（卡片为手写 HTML） |
| 设计系统 | `assets/css/labtools.css` | 1512 行 | 设计令牌 + `lt-` 组件 + **workbench 的 `wb-` 样式 + 工具专属样式** |
| 数据契约 | `assets/js/labtools-types.js` | 368 行 | 迷你 schema 语言 + 6 个业务类型 + `artifact`/`generic` + 工具类型声明 |
| 工作台 | `assets/js/labtools-workbench.js` | 676 行 | IndexedDB 存储 **+ 抽屉 UI + toast + picker + 测试钩子注册** |
| 浏览器工具 | `assets/js/labtools-common.js` | 155 行 | 下载/剪贴板/文件读取 + `?wbLoad` deep-link 手递 |
| 计算库 | `assets/js/labtools-calc.js` | 844 行 | 血球计数 + 单位换算 + qPCR 统计（t 检验/标准曲线/geNorm）+ qPCR 排版 |
| Artifact | `assets/js/labtools-artifact.js` | 394 行 | flatten/unflatten + RFC-4180 CSV + wiring 匹配 + 工具桥 |
| Artifact UI | `assets/js/labtools-artifact-ui.js` | 224 行 | artifact 控制条 + 手填模态（**未接入任何工具 UI**） |
| 工具 | `tools/*/`（11 个） | 共约 22k 行 | 见 §1.4 |

### 1.2 共享层审计（逐文件）

#### labtools-types.js — 数据契约注册表
- ✅ 优点：单一真源、严格校验（`workbench.put` 拒绝 schema 违规）、`keyPattern` 已覆盖 1536 孔。
- ⚠️ 问题：
  1. **schema 能力不足**：无 `optional` 枚举之外的联合类型、无数值范围、无自定义校验、无 schema 版本号。所有校验错误是扁平字符串列表。
  2. **类型与 field-id 两套 ID 系统并存**：workbench 按 `type`（`plate-layout` 等）分组，而 artifact 的跨工具 wiring 按 `outputFields`/`inputPorts` 的 **field-id**（`cell-density` 等）匹配，两套 ID 只在 `docs/output-fields.md` 里靠文档手工协调，代码层无强制。
  3. `producers`/`consumers` 静态写死在注册表里，加一个工具要改共享文件——信息本应由工具自己声明。
  4. 校验函数 `checkType` 是文件级私有函数，测试只能走 `validateWorkbenchType` 黑盒。

#### labtools-workbench.js — 存储与 UI 强耦合
- ⚠️ 问题：
  1. **存储核心与 UI 同文件**：`openDB`/`dbExec` 与抽屉渲染/toast/picker 耦合，Node 单测只能靠 VM shim（见 `tests/unit/workbench-model.test.mjs` 的 monkey-patch 手法）。
  2. **DB_VERSION=1，无迁移框架**：未来 schema 演进没有 `upgradeneeded` 之外的迁移钩子；`updateLabel` 用"get→改→put"手写非原子事务。
  3. **`findByName` + `remove` + `put` 三连实现 upsert**（`labtools-artifact.js` 的 `bridge.save`），非原子，并发下可能残留重复项。
  4. 渲染用 innerHTML 字符串拼接（有 `escapeHtml` 但仍脆弱）；抽屉分组、picker、toast 各写各的 DOM 构建代码。
  5. CSS 前缀不统一：存储/抽屉 UI 用 `wb-`，设计系统约定是 `lt-`（AGENTS.md 明确"Shared UI classes use the `lt-` prefix"）。
  6. `importJSON` 对导入项**不做 schema 校验**（只查 JSON 形状），可注入违规数据。
  7. 公共 API 面（11 个方法 + 3 个全局函数）没有任何语义版本承诺，9 个工具直接依赖（8 个深度使用 + thermal-to-laser 弱耦合加载）。

#### labtools-common.js — 浏览器工具 + 手递
- ⚠️ 问题：
  1. `labtoolsHandoffTo` 依赖 `workbench` 全局，`labtoolsConsumeHandoff` 依赖 `showToast` 全局——共享库之间隐性耦合靠加载顺序保证。
  2. **`?wbLoad=<id>` 是一次性消费**：apply 后立刻 `replaceState` 剥掉参数。用户刷新即丢、无法"断点续跑"、没有多步 workflow 会话概念。
  3. 手递把"业务数据保存"和"导航"绑死在一个函数里；失败路径（put 成功但导航被拦截）会留下孤儿记录。

#### labtools-calc.js — 计算库大杂烩
- ⚠️ 问题：
  1. **844 行装了三类互不相关的领域**：血球计数（§1–6）、药物剂量单位换算（§2）、qPCR 统计与排版（§7–8）。`statMean`/`statSD`/`logGamma`/`betacf`/`betai` 这类通用数学函数以全局裸名暴露，污染命名空间。
  2. `makeDiagram` 是**生成 SVG 字符串**的 UI 函数（硬编码颜色 `#f7f6f3` 等，绕过设计令牌），却放在"纯计算"库里。
  3. `MODES`/`SMALL_ALL`/`SMALL_5` 是 cell-count 专属领域常量，放在共享库反而制造跨工具耦合。
  4. TODO.md 承认 seeding-calc 的 Step-1 计算是 cell-count 的"手同步副本"，未提取共享。

#### labtools-artifact.js — artifact 模型与工具桥
- ⚠️ 问题：
  1. **一库四责**：flatten/unflatten（通用）、CSV codec（通用）、wiring match（workflow）、工具桥（集成）。测试覆盖好（`tests/unit/artifact.test.mjs` + e2e `params→CSV→params` 恒等），但桥是薄封装。
  2. **artifact 与业务类型双轨**：workbench 里同时存在 `plate-layout` 等业务 payload 与 `artifact` 信封，两种保存/消费路径并存（CLAUDE.md 明说 legacy `serializeForWorkbench`/`applyFromWorkbench` 与 artifact 路径"共存"）。一个用户保存的"plate-layout"与另一个工具保存的"artifact(含 plate-layout outputs)"在抽屉里是两类条目，语义割裂。
  3. `bridge.save` 的 upsert 非原子（见 workbench 问题 3）；`bridge.restore` 只恢复 `params`，不应用 `inputs`——完整恢复语义未闭环。
  4. **未接 UI**：所有工具的 Save/Export/handoff 按钮仍走 legacy 路径，`.save()/.exportCsv()/.fromCsv()/matchWiring` 只被测试钩子调用。投入了 8 个工具的迁移代码，用户却一个都用不到。

#### labtools-artifact-ui.js — artifact 的 UI 层
- ⚠️ 问题：
  1. 用 `prompt()` 收集保存标签、inline style 打补丁、自造 `ltaEl`/`ltaModal`——与 `lt-` 组件体系和工作台抽屉是第三套 UI 代码。
  2. `labtoolsResolveInputs` 的手填模态只支持"标量文本输入"，对复杂 payload 端口（如 `plate-layout`）没有可用的手填路径。
  3. 文件处于 `?? `（未跟踪）状态，与其他未提交改动一起躺在 `feat/tool-workflows` 分支上，**尚未进入任何发布**。

#### labtools.css — 设计系统
- ✅ 优点：令牌体系完整（`--surface`/`--radius`/`--fs-*` 等），`lt-` 组件覆盖表单/按钮/徽章/警告/分段/预览等。
- ⚠️ 问题：
  1. `wb-`（抽屉/picker/toast，约 §1167 起）与 `lt-` 双前缀并存。
  2. 含**工具专属样式**（counting mode selector、sheet preview 等），设计系统随工具需求膨胀，边界不清。
  3. 部分组件用内联 `style` 补丁（如 drawer footer 按钮 `style="font-size:0.78rem"`、artifact-ui 全量内联），绕过令牌。

### 1.3 数据流审计（现状两条路径）

```
路径 A（legacy typed payload）              路径 B（artifact envelope）
serializeForWorkbench()  ──┐                readParams/readOutputs ──┐
                          v                                          v
              workbench.put(type, ...)          bridge.save/put('artifact', ...)
                          │                                          │
      deep-link ?wbLoad=<id> ──► 消费者 applyFromWorkbench(data, type)
                                                          │
                              labtoolsConsumeArtifactHandoff → wiring by field-id
```

- 同一对"上下游工具"存在两套接线代码（typed apply + field-port wiring），行为可能漂移。
- `qpcr-analysis` 的手递是"先 stash，等结果文件加载后再 apply"，说明**单点手递已不足以表达真实 workflow 时序**。

### 1.4 工具层审计

11 个工具全部完成分组审计，按"共享层加载 → workbench 集成 → artifact 迁移 → 手递"四条线汇总如下：

| 工具 | 行数 | 结构 | 共享 JS 加载 | artifact 迁移 | 手递 | 本地重复实现 | 迁移工作量 |
|---|---|---|---|---|---|---|---|
| cell-count | 591 | 单文件（script 444 行） | 6 个全量 | ✅ 已迁移（无 inputPorts，纯生产者；applyParams 顺序讲究） | 生产 `→seeding-calc`（legacy sample-list） | makeCsv/downloadCsv/copyResults/fallbackCopyText（与 seeding-calc **逐字重复**） | **小** |
| seeding-calc | 1614 | 单文件（script 1159 行） | 6 个全量 | ✅ 已迁移（含 inputPorts + 写好的 applyInputs，但**wiring 从未接线**） | 消费 conc-data/sample-list；链末端 | 同上 + fmt4（重叠 fmtSig）、双份单位表（BYPASS_CONC_UNITS vs CONC_UNITS）、**⟳SYNC 复制区 310 行** | **中偏大** |
| microplate-layout-planner | 3095 | 单文件（style 824 + script 2127） | 5 个（未加载 calc） | ✅ 已迁移（readParams 含视图选择器） | 生产 `→qpcr-analysis`；消费 planner 的 plate-layout；全 legacy 手递 | escHtml/escAttr、csvCell、parseCsvLine、fallbackDownload*（**永不执行的死代码**） | **大**（~80% bespoke 渲染） |
| qpcr-plate-planner | 497 | 单文件（script 389 行） | 6 个全量 | ✅ 已迁移（readOutputs 抛错返回 null 合法） | 生产 →planner / →qpcr-analysis；消费 sample-list | esc()、planBands 的 anchor 语义与 calc.js 校验拆两处 | **小–中** |
| qpcr-analysis | 3001 | 单文件（script 2446 行，全仓最大之一） | 6 个全量 | ✅ 已迁移（但 applyParams **不同步 DOM 控件**：分段高亮/复选框/lod/thr 输入） | 工作流枢纽：消费 plate-layout + sample-list（含"先 stash 后文件加载"的 pendingHandoffLayout） | esc、parseCsvLine、decodeBuffer、mean/sd/median（calc 已有 statMean/statSD）、3 处 CSV cell()、niceTicks/hexLerp/svgToPng/CSS_VAR_MAP（注释明言 mirrors bca-assay） | **大** |
| rt-calc | 1214 | 单文件（script 841 行） | 5 个（未加载 calc） | ✅ 已迁移（applyParams 不恢复 cfgPreset 下拉与 lblPrimer 文本） | 生产 `→qpcr-analysis`；消费 conc-data/sample-list | escHtml/escAttr、BOM 解码（与 qpcr 各写一份）、buildExportCSV（**无 CSV 转义，真实 bug**）、手写 data-URI 下载、copy 回退 | **小–中** |
| stain-timer | 1699 | 单文件 | 4 个（**漏加载 common.js → Export state CSV 必坏、手递不可用**；calc.js 是死引用） | ✅ 已迁移 | 自产自销 protocol | downloadCsv、csvCell、splitCsvLine、escHtml | **中偏小** |
| bca-assay | 2658 | 单文件 | 5 个（未加载 calc） | ✅ 已迁移（readParams/applyParams 捕获双模式） | 消费 plate-layout；生产 conc-data | 三处 well→group 聚合重复；双轨结果渲染 showResults+showInlineResults；曲线拟合全家桶无共享替代 | **大**（plate/raw 双模式） |
| drug-dosage | 773 + tool.js 2188 | 拆分式（tool.js + 空 protocol-config.js） | 仅 calc/common（**未加载 types/workbench/artifact**） | ❌ 未迁移（禁用态；状态模型反而最干净） | 无 | escapeHtml/escapeAttribute、makeCsv/csvCell（**缺 CSV 公式注入防护**）、slugify、formatDoseAmount（重叠 fmtSig）、toNumber、setStatus | **中**（与"解禁"合并） |
| thermal-to-laser | 685 + tool.js 1831 | 拆分式（**workbench 集成代码在 HTML 里，工具逻辑在 tool.js，双文件割裂**） | common/types/workbench + vendored pdf-lib（加载顺序违反约定） | ❌ 未迁移（有理：输出二进制 + state 依赖内存文件字节不可恢复） | 消费 plate-layout（**弱耦合：只填 presetNotes**） | escapeHtml、setStatus、slugify、toNumber、formatDecimal、inchesToPoints、indentLines | **中** |
| label-generator | 961 + tool.js 1531 | 拆分式（内联 style 690 行全仓最大） | 仅 common（**且零调用，死加载**）+ **跨工具 import thermal-to-laser 的 preset-config.js**（违反工具独立原则） | ❌ 未迁移（CSV/模板/plan 实际可序列化，恢复价值真实；卡点是 690 行自建 UI 成本） | 无（但直读 thermal-to-laser 的 localStorage 键） | escapeHtml、formatDecimal、clamp/plural、inchesToPoints、完整 CSV 解析器、setStatus（**死代码**）、fallbackDownload | **大** |

**已确认的具体缺陷（工具层）**
1. 🔴 **cell-count 与 seeding-calc 的 "Save to Workbench" 按钮实际失效**：`const label` 再赋值（cell-count L478–480、seeding-calc L1435–1437）抛 TypeError。e2e 只驱动测试钩子不点 UI 按钮，所以从未暴露。
2. 🔴 **bca-assay 的 `applyFromWorkbench` 调用未定义函数** `renderSmpRows()`（L2447）、`renderPlateGrid()`（L2457）——Load plate-layout 路径必抛 ReferenceError。
3. 🔴 **qpcr-analysis 的 `serializeForWorkbench` 基因标签丢失**（L2715）：用裸孔位 key 查 `"WELL|DYE"` 键控的 `targetByKey`，gene 永远取不到——保存与 rt-calc 手递链路都受影响。
4. 🔴 **rt-calc 的 `buildExportCSV`（L903–915）不做 CSV 转义**：样本名含逗号/引号即破坏导出。
5. 🟠 **artifact 迁移停留在 API 层**：seeding-calc 的 `applyInputs` 是死代码，`labtoolsConsumeArtifactHandoff`/`labtoolsHandoffArtifact` 全仓库无人调用，所有手递仍走 legacy 类型化信封。
6. 🟠 **stain-timer 未加载 labtools-common.js**：artifact 的 Export state CSV 按钮必坏；workflow 手递不可用；`labtools-calc.js` 是零使用死引用。
7. 🟠 **stain-timer 双轨不一致**：`applyFromWorkbench`（L1576）slot 回退用旧 `protocol.length`，与 artifact 版 `applyParams` 的 `i+1` 不一致。
8. 🟠 **seeding-calc 的 ⟳SYNC 复制区**（L455–765，约 310 行）是 cell-count 计数 UI 的手同步副本，已出现漂移——共享层重写必须先提取"计数 Step-1"共享模块（纯计算已在 calc 层，缺 UI 渲染层）。
9. 🟠 **qpcr-analysis 的 applyParams 不同步 DOM 控件**（分段 active、ddPaired/ddEffCorr 复选框、lod/thr/仪器输入）；rt-calc 的 applyParams 不恢复 cfgPreset 下拉与 lblPrimer 文本——"全状态恢复"卖点不成立，且 e2e 恒等测试只验数据不验 DOM，测不出来。
10. 🟠 cell-count 的 `serializeForWorkbench` 在密度 NaN 时把**原始血球计数当 cells/mL** 存入（L467），且从显示文本正则抠数字（L462）与展示格式强耦合。
11. 🟡 microplate 双 CSV 并存（互操作表格 CSV 与 artifact CSV），工具栏 11 个保存/导出按钮；legacy serialize 不含视图选择器，保存→加载丢视图状态。
12. 🟡 可访问性缺口普遍：无 aria-live 的状态行、`<span>` 当按钮（qpcr-plate-planner combo chip）、模式选择器 div 无键盘支持、prompt/confirm 收集命名。
13. 🟠 **drug-dosage 的"禁用"只在工具页**（body 类 + CSS 隐藏），hub 仍标 Live（root index.html L270–280）；tool.js 仍在隐藏 DOM 上空转全量初始化；解禁门槛 = max-dose 安全上限 + CSV 公式注入修复。
14. 🟠 **thermal-to-laser 与 label-generator 之间有两道非 workbench 耦合**：label-generator 直接 `<script>` 引入 thermal-to-laser 的 preset-config.js（违反工具独立原则）+ 直读其 localStorage 键 `labtools:thermal-to-laser:user-presets:v1`——动一个必坏另一个。
15. 🟠 **label-generator 加载了从不调用的 labtools-common.js（死加载）**；thermal-to-laser 的脚本加载顺序违反约定（common 在 types/workbench 之前，靠惰性引用侥幸可用）；thermal-to-laser 的 workbench 集成代码在 HTML 内联脚本里、工具逻辑在 tool.js（双文件割裂）。
16. 🟡 PDF 工具三方库管理：两份 pdf-lib.min.js 拷贝 + 一份 bwip-js-min.js，无 SRI、无版本声明、无加载失败降级（pdf-lib 缺失时 tool.js:366 直接抛 ReferenceError）。
17. 🟡 drug-dosage 的 `csvCell` 缺 CSV 公式注入防护（leading `= + - @`）；rt-calc 的 `buildExportCSV` 无任何转义——两处真实导出 bug。
18. 🟡 thermal-to-laser 的 `sideMargin`/`leftMargin` 别名链（config 用 sideMargin，代码归一到 leftMargin，导出又写 leftMargin）；label-generator 自身 preset-config.js 里 11 个激光预设是死数据；thermal-to-laser 的 pdf_label_test.html（142 行）是死文件。
19. 🟠 **bca-assay 双轨结果渲染**：`showResults`（右侧面板，L1449–1481）与 `showInlineResults`（L1533–1603）把右侧面板 DOM **连同 SVG 整段复制**进移动端/plate 模式内联区——任何结果 UI 改动要改两处；`runPlateCalc` 临时改写全局 `currentPreset` 再恢复（L1404–1415，隐藏副作用）。
20. 🟠 **bca-assay 的 `readOutputs` 字段 id 是 `concentration`，registry 类型名却是 `conc-data`**——类型 ID 与 field-id 两套命名冲突的具体实例；下游 rt-calc/seeding-calc 的 inputPorts 声明的是 `concentration`，契约 v2 必须定权威名。
21. 🟡 stain-timer 计时用 100ms `setInterval`（L1060–1073），后台 tab 节流下倒计时跳变，无 `visibilitychange` 校正；`renderProtoTable` 每次全量重建丢焦点；无 `beforeunload` 运行中离开保护；协议状态靠"DOM 直写 + 全量重读"双通道同步并存（`updateStep` vs `syncProtocolFromDOM`）。
22. 🟡 microplate 渲染小 bug 与死代码：字段改名只重绘 plate/legend/printSummary，**不更新 colorBy/labelBy 下拉与 value-editor 标题**（L1511–1514，视图短暂不一致）；`drawPngLegend` 的 `columnCount` 恒为 1（L2374–2384，多列逻辑死代码）；well 按钮 `role="gridcell"` 覆盖原生 button 语义、plate-grid 无方向键导航、打印依赖大段 `@media print` 覆盖（L746–835）脆弱。
23. 🟡 qpcr-plate-planner 小问题：input 每键触发两次渲染各跑一次 `compute()`（L293–298，无节流）；gene role select 重建行丢焦点（L317–322）；factors 修改后失效的 `state.skip` 项不清理（L377/450）。
24. 🟡 **qpcr-plate-planner 的 workbench 集成是"手工"路径**：无传统 `serializeForWorkbench`/`applyFromWorkbench`——save 内联为 `compute()→qpcrToPlateLayout→workbench.put`（L384），apply 是 `labtoolsConsumeHandoff` 回调 `seedFromSampleList`（L417–419），hooks 的 `apply` 直接指向 `applyParams`。批次 C1 manifest 化时需把这套 bespoke 集成收敛进 runtime。
25. 🟡 **seeding-calc 的 artifact 实现三处缺口**（其 readParams/applyParams 是仓库最佳之一，但仍有）：step 导航状态（当前在 Step1 还是 Step2）**未纳入 readParams**（"every control is a param"略夸大）；`applyParams` 无条件调用 `calcDilution()`（L1538），恢复"四字段全填且 from=input"的状态会触发 "All fields are filled" 报错条；`readOutputs` 返回 `{'seeding-plan': <整个 payload>}`——嵌套对象当 output field，与 outputFields 的标量 field-id 接线语义不匹配。

**工具层对重写方案的关键约束**
- `plate-layout` 契约是枢纽：qpcr-plate-planner（产）→ microplate（消费+再产）→ qpcr-analysis（消费）三方共享同一 schema。重写契约必须字节兼容，**或三工具 + types.js 同批迁移**。
- 共享 API 表面（`workbench.*`、`showToast/showPicker`、`labtoolsHandoffTo/ConsumeHandoff`、`labtoolsDefineTool`、`labtoolsMountArtifactControls`、`__labtoolsTestHooks` 的键）是 8 个工具 + e2e 的硬契约——重命名 = 全仓批改，需 shim 过渡。
- HTML 转义无共享导出（common.js 缺 `escHtml`，workbench 的是私有）→ 多工具各自实现；UTF-16 BOM 解码（`decodeBuffer`）也是 qpcr/rt 各写一份——共享层应补公开导出。
- 静态 `labtoolsRegisterToolTypes` 显式调用必须保留（`tests/unit/types.test.mjs` 静态扫描该行）——重写时勿"顺手删掉"。
- **localStorage 现状（修正：并非"无持久化"）**：cell-count/seeding-calc/qpcr-plate-planner/microplate 无 localStorage；bca-assay 有 `bca-plate-state`/`bca-manual-state`（7 天过期的自动草稿）；rt-calc 的 `rt-calc-state` 持久化已禁用（init 时主动删除键，原实现整块注释留尸）；thermal-to-laser/label-generator/drug-dosage 存预设配置。批迁移不涉及 IndexedDB 数据迁移，但 bca/rt 的 localStorage 草稿语义需在批次内决定去留。
- **共享层需提供统一加载自检**（如 `labtoolsCheckRuntime()` 校验脚本齐全与加载顺序）：stain-timer 漏引 common.js 导致 artifact Export CSV 按钮与手递静默失效——此类"漏引"会随逐批迁移扩散，必须在 v2 boot 时显式报错。
- **共享 API 缺口的最高优先级清单**（跨工具重复率排序）：① 通用最小二乘拟合（bca 的 linearRegression/quadraticFit/det3/solve3 全家桶，calc 的 `stdCurveFit` 是 qPCR 专用不可复用）；② RFC-4180 CSV（stain-timer 自带 splitCsvLine/csvCell、bca 手写引号包裹，`labtoolsRowsToCsv`/`labtoolsCsvToRows` 已存在却被绕过）；③ 公开的 escapeHtml（workbench 私有，各工具自写且不转义单引号）；④ download/copy 已就绪但多工具弃用。阶段 1 应补齐 ①②③ 并让工具改用。
- 手递链现状：`cell-count → seeding-calc`、`rt-calc → qpcr-analysis`、`qpcr-plate-planner → microplate → qpcr-analysis`、`bca-assay → rt-calc / seeding-calc`，全部走 legacy 类型化信封；bca-assay 是**链条孤岛**（声明了 produces/consumes 但两端都只有手动 Load 按钮，无深链）；qpcr-analysis 的 pendingHandoffLayout（先 stash 后文件加载）语义必须在 artifact 化时保留。
- **e2e 覆盖缺口（三工具）**：thermal-to-laser 只注册了 `state` 钩子（无 serialize/apply，名义满足约定实际不可往返测试），drug-dosage 与 label-generator **无任何测试钩子**——迁移时必须同步补 `labtoolsRegisterTestHooks`（或由 manifest 自动注册），否则 live-validation 安全网覆盖不到这三个工具。
- **跨链迁移期间必须保持双通道**：一条链的两端若分属不同批次，legacy 手递与 artifact 手递需并存到链完整（先接"兼容消费"，后切"生产端"）。
- 三个 PDF/配置类工具的"不迁移"理由要拆开：thermal-to-laser 状态依赖内存文件字节（不可恢复）→ 只做 manifest 化与解耦；label-generator 的 CSV/模板/plan 可序列化 → 恢复价值真实，卡点是 690 行自建 UI 的重写成本，可先做"共享层去重 + 解耦 preset 依赖"的轻迁移。

### 1.5 测试与工程审计

- ✅ 优点：零依赖测试管线成熟——确定性 fixtures（`scripts/gen-fixtures.mjs`）、unit（`node --test`）、puppeteer e2e（条件轮询无固定 sleep、快照权威化、live-serialize→schema 校验兜底网）、人工视觉 QA 页（`tests/review.html`）。
- ⚠️ 问题：
  1. **测试钩子约定是每工具手写注册**（`labtoolsRegisterTestHooks`），harness 靠约定发现；工具忘注册就静默少测。已迁移工具的 hooks 里同时挂 legacy 与 artifact 两套入口，测试面随双轨制膨胀。
  2. `labtoolsRegisterTestHooks` 定义在 workbench.js 里——测试基础设施寄生在运行时文件里。
  3. 共享层脚本在 Node 单测里靠 `loadBrowserJs` VM 加载（`tests/unit/helpers.mjs`），每个新共享文件都要写 shim 样板。
  4. `README.md`/`CONTRIBUTING.md` 的工具清单过时（缺 qpcr-plate-planner、qpcr-analysis、rt-calc、bca-assay、label-generator），issue 模板工具列表同样滞后。

### 1.6 痛点汇总（按主题）

| # | 主题 | 严重度 | 现状 |
|---|---|---|---|
| P1 | 双轨数据模型（typed payload vs artifact） | 🔴 高 | 两套序列化/消费路径并存，语义割裂，artifact 未接 UI |
| P2 | 存储层与 UI 耦合、无迁移框架 | 🔴 高 | workbench.js 单文件 676 行；DB v1 无 upgrade 钩子 |
| P3 | 全局脚本 + 加载顺序脆弱 | 🔴 高 | 6 个共享文件按约定顺序 `<script>` 加载，顺序错即静默失败 |
| P4 | 工具巨石化 | 🟠 中高 | 11 工具约 22k 行单文件 HTML，命令式 innerHTML 渲染 |
| P5 | 共享库利用率不一致、本地重复 | 🟠 中高 | drug-dosage/label-generator 只加载 common.js；stain-timer 未加载 common.js 自实现下载；TODO 承认多处重复 |
| P6 | workflow 缺会话概念 | 🟠 中高 | `?wbLoad` 一次性消费，无断点续跑、无链图 |
| P7 | 类型 ID 与 field-id 两套 ID 靠文档协调 | 🟠 中 | docs/output-fields.md 是唯一协调点，无代码强制 |
| P8 | calc 库领域混杂 + 全局污染 | 🟡 中 | 844 行三领域混装；`statMean` 等裸全局 |
| P9 | CSS 双前缀 + 工具专属样式入侵 | 🟡 中 | `wb-` 与 `lt-` 并存；内联 style 补丁 |
| P10 | 测试钩子手写约定、基础设施寄生 | 🟡 中 | hooks 注册在 workbench.js；漏注册静默 |
| P11 | 文档过时 | 🟡 低 | README/CONTRIBUTING 工具清单滞后 |

---

## 第二部分 · 设计原则

**硬约束（不可妥协）**
1. 运行时零依赖、无构建/bundler；`file://` 与 Pages 部署同等可用。
2. 现有浏览器数据无损迁移（IndexedDB v1 记录、localStorage 配置）。
3. 发布工具不引入任何 npm 依赖（puppeteer 仅限 dev/test）。

**架构决策**
- **D1：不引入模块系统，继续全局注册式，但升级为"命名空间 + 显式加载顺序 + 版本号"**。理由：ES modules 在 `file://` 下有 CORS 限制；全局脚本是当前唯一可靠方案。规范化为单一命名空间 `window.labtools` 下的子命名空间（`labtools.store`、`labtools.ui`、`labtools.artifact`…），每文件声明自己的加载依赖并在入口断言，顺序错时报错而非静默失败。
- **D2：单一数据模型**——workbench 只存一种记录信封；业务类型降级为记录的"契约视图"。见 §3.2。
- **D3：共享层按职责拆文件，每个文件可独立单测**（纯逻辑文件在 Node 里可直接 `require`/VM 加载，不依赖 DOM）。
- **D4：工具以 manifest 声明为核心**——一个对象声明工具元数据、数据契约、输入端口、输出字段、UI 挂载点与测试钩子，共享 runtime 统一接线（注册类型、装抽屉/控制条、注册 hooks、处理手递），把每工具手写的 30–60 行 glue 代码归零。
- **D5：UI 层与存储层彻底分离**（store 无 DOM；workbench UI 是 store 的一个消费者）。
- **D6：新旧共存过渡**——v2 落地时旧 API 保留为薄 shim，legacy typed 记录导入后自动包装为 v2 记录；工具逐批迁移，未迁移工具照常工作。

---

## 第三部分 · 目标架构 v2

### 3.1 分层总览

```
┌────────────────────────────────────────────────────────────────┐
│ tools/<name>/            manifest.js + index.html(薄壳) + 可选 tool.js │
│                          （业务 UI、readParams/applyParams/readOutputs） │
├────────────────────────────────────────────────────────────────┤
│ labtools-runtime.js      manifest 加载、注册、控制条、手递接线、测试钩子  │
├────────────────────────────────────────────────────────────────┤
│ labtools-ui/             drawer、picker、toast、artifact 控制条、表单生成 │
│ labtools-artifact.js     flatten/CSV/wiring/信封（纯逻辑）               │
│ labtools-store.js        IndexedDB 存储核心（纯逻辑、无 DOM、可注入）      │
│ labtools-contracts.js    schema v2 + 校验 + 版本协商（纯逻辑）             │
│ labtools-workflow.js     链图、会话记录、手递（纯逻辑 + 最小 DOM 面）       │
│ labtools-common.js       下载/剪贴板/文件（纯 DOM 工具）                   │
│ labtools-calc.js         按领域拆分的计算函数（纯逻辑）                    │
├────────────────────────────────────────────────────────────────┤
│ labtools.css             设计令牌 + lt- 组件（wb- 迁移并入）              │
└────────────────────────────────────────────────────────────────┘
```

### 3.2 单一数据记录（替代双轨制）

workbench 只存一种记录：

```js
{
  id: 'uuid',              // 主键
  kind: 'result',          // 'result' | 'snapshot' | 'session' | 'legacy'
  tool: 'seeding-calc',    // 生产者
  contract: 'seeding-plan',// 业务契约（可空，snapshot 无契约）
  label: 'P3 seed 2e4',    // 用户可改
  schemaVersion: 2,        // 记录信封版本
  payload: { ... },        // 单一真源
  meta: { ... },           // 展示元数据（wellCount、unit…）
  createdAt, updatedAt,
}
```

- **业务数据与工具状态统一为 `payload`**：artifact 信封 `{schemaVersion, tool, params, inputs, outputs}` 就是 payload 的一种；typed 业务 payload（plate-layout 等）是 `outputs` 的投影。抽屉按 `contract` 分组展示，状态快照按 `kind:'snapshot'` 展示。
- **契约（contract）取代 DATA_TYPES 的 type 注册**：契约 = 一组 `outputs` 字段 schema（field-id → 形状），即把 `docs/output-fields.md` 的协调点**代码化**。wiring 匹配、workbench 校验、抽屉展示全部由契约派生，一套 ID 系统。
- **兼容**：现有 `DATA_TYPES` 的业务 type 自动映射为 v2 契约；旧 IndexedDB 记录在 v2 首次打开时迁移为 `kind:'legacy'` 记录（原样保留 `data` 字段），旧工具继续读写不受影响；导入旧 export JSON 同样包装。

### 3.3 契约与 schema v2

在现有迷你语言基础上补：
- `anyOf`/`oneOf`、数值范围（`min`/`max`）、`pattern`（字符串）、`optional` 明确化、自定义 `validate` 钩子；
- **契约版本号**：`{ version, fields: { 'cell-density': { type:'number', unit:'cells/mL' }, ... } }`，版本不兼容时明确报错（不再"静默按 generic 收"）；
- 契约注册从 `labtoolsRegisterToolTypes` 演进为 manifest 内声明（D4），`labtools-types.js` 的 registry 退化为"共享契约目录 + legacy type 映射"，单测仍强制"声明过的契约必须存在"。

### 3.4 存储层 v2（labtools-store.js）

- 纯 IndexedDB 核心，**无 DOM、无抽屉**；`openDB(name, version, migrations)` 接受迁移函数数组，DB 升到 v2（`items` store 加 `kind`/`contract` 索引，`data` 字段改名迁移）。
- API：`put(record)`（校验契约）、`update(id, patch)`（原子）、`upsert(query, record)`（原子，用索引游标，替代 findByName+remove+put 三连）、`query({kind, tool, contract, label})`、`getAll/byKind/byTool/byContract`、`exportJSON/importJSON`（导入时校验 + 版本协商）、`onChange`（BroadcastChannel 同步逻辑保留）。
- 单测：注入内存 fake（`tests/unit/` 直接测事务语义），无需 VM shim 样板。

### 3.5 workflow 层 v2

- **工具 manifest 声明 `next: [{tool, label}]`** 构成链图；hub 与工具页渲染"下一步"入口，替代硬编码手递按钮文案。
- **会话记录**（`kind:'session'`）：`{ steps: [{ tool, contract, recordId, resolvedInputs, missing }] }`。`?wbLoad` 不再是"读一次就丢"，而是指向会话/记录；消费后仍可从 workbench 或 hub"继续该会话"。
- 手递统一走 artifact 信封：producer `outputs` → consumer `inputPorts` 的 field-id wiring（`labtoolsMatchWiring` 语义保留）；typed 手递只作为旧工具兼容路径保留到迁移完成。
- `labtoolsConsumeHandoff` 的"stash 到文件加载后"模式（qpcr-analysis 现状）泛化为 manifest 的 `consumeWhen: 'immediate' | 'ready'` 声明，由 runtime 处理。

### 3.6 UI 与设计系统 v2

- `wb-*` 样式并入 `lt-` 命名（`lt-drawer`、`lt-toast`、`lt-picker`）；artifact 控制条改为 `lt-` 组件 + 模态表单（废弃 `prompt()` 与 inline style）。
- 新增两个共享组件（按需渐进）：
  - `lt-form`：从 params schema 生成表单（新工具与重写工具用，旧工具不强求）；
  - `lt-sheet`/`lt-plate`：plate 预览组件（microplate/qpcr 两个工具目前各有一套 plate 渲染）。
- 工具专属样式留在各工具 `<style>` 块（现有约定），逐步从 labtools.css 移出。

### 3.7 测试策略 v2

- `labtools-store` 单测用内存 fake 覆盖事务语义；`labtools-contracts` 单测覆盖 schema v2 与迁移协商。
- **manifest 校验测试**：静态扫描所有工具的 manifest，断言契约存在、`readParams/applyParams` 配平、`outputFields` 与 `readOutputs` 键一致——替代"每个工具手写注册"的漏测风险。
- e2e 保留 puppeteer + 条件轮询 + 快照；`__labtoolsTestHooks` 改由 runtime 按 manifest 自动注册（工具仍可追加专属钩子），harness 检查 runtime 版 hook 存在。
- `params→CSV→params` 恒等测试推广到所有迁移工具（当前 8 个中仅部分 e2e 验证）。

---

## 第四部分 · 分阶段迁移路线图

### 阶段 0 — 基线收口（1–2 个 PR）
- 提交/评审当前 `feat/tool-workflows` 未提交改动（artifact 内核 + 8 工具迁移 + 测试），确保 CI 绿。
- 产物：稳定基线 `dev`；明确"artifact 库已测未接 UI"的现状边界。

### 阶段 1 — 共享层 v2 并排落地（3–5 个 PR）
- 新增 `labtools-contracts.js`、`labtools-store.js`、`labtools-workflow.js`、`labtools-runtime.js`（含 **`labtoolsCheckRuntime()` 加载自检**：脚本齐全 + 顺序断言，漏引即显式报错）；`labtools-common.js` 原样保留并**补公开导出**：`escHtml`（含单引号转义）、`decodeBuffer`（UTF-16 BOM）、通用最小二乘拟合（`fitLinear`/`fitQuadratic`，bca 专用；qPCR 的 `stdCurveFit` 保持独立）、`labtoolsRowsToCsv` 升级为推荐 CSV 出口。
- `labtools-types.js` 增加 legacy→v2 契约映射；`labtools-workbench.js` 内部改调 store，公共 API 不变（11 个旧工具零改动）。
- 抽取**共享 preset 数据模型**（thermal-to-laser / label-generator 的 margin 别名与字段序统一）为共享配置模块，先不动两工具调用点。
- 验收：新旧单测全绿；新 store 的内存 fake 单测落位；旧工具 e2e 全部通过。

### 阶段 2 — 存储迁移 + UI 重写（2–3 个 PR）
- DB v1→v2 迁移（`onupgradeneeded` + 数据迁移函数）；`wb-` 样式并入 `lt-`；drawer/picker/toast 组件化。
- 验收：旧数据打开即迁移、无丢失；`tests/review.html` 视觉 QA 通过；e2e 快照重基线。

### 阶段 3 — 工具逐批迁移（每批 1 个 PR/工具）

**通用验收标准（每批）**：该工具 artifact e2e 恒等测试 + live-validation 通过；若在链上，链两端 handoff e2e 通过；视觉 QA；全量测试绿。
**通用原则**：迁移同时修复审计已确认的该工具缺陷；manifest 化（接 runtime、自动 hooks、artifact 控制条接 UI、契约化 outputs/ports）；拆分 tool.js 作为批次前置；沿链从上游迁到下游，跨批期间双通道并存。

| 批次 | 工具（工作量） | 迁移要点 | 顺带修复 |
|---|---|---|---|
| A（模板批） | cell-count（小）、stain-timer（中偏小） | 首批 manifest 化模板；cell-count 补 producer 端 artifact 手递；stain-timer 补加载 common.js（或接入加载自检） | const label Save 按钮 bug ×2；NaN 时原始计数当浓度；复制/下载/CSV 函数换共享 API；stain-timer slot 回退双轨不一致 + 计时 `visibilitychange` 校正 + `beforeunload` 保护 + renderProtoTable 事件委托 |
| B（计数链） | seeding-calc（中偏大）、rt-calc（小–中） | **前置：提取"计数 Step-1"共享 UI 模块**（消灭 ⟳SYNC 310 行复制区）；seeding-calc 接线 applyInputs → `labtoolsConsumeArtifactHandoff`；rt-calc 生产端 artifact 手递 →qpcr-analysis（消费端暂走兼容路径） | 双份单位表合并、fmt4→fmtSig、getNumVal/getBaseVal 合并；rt-calc buildExportCSV 转义、download/copy 换共享 API、applyParams 补 cfgPreset/lblPrimer 恢复、删死代码；seeding-calc 的 step 导航入 readParams + applyParams 不再无条件 calcDilution + readOutputs 改标量字段 |
| C1 | qpcr-plate-planner（小–中） | 契约映射先行（plate-layout 字节兼容）；生产端 artifact 手递；**手工 workbench 集成收敛进 manifest/runtime** | esc()→共享；planBands anchor 语义收进 calc.js；combo chip 键盘可访问性；skip 垃圾键清理 + input 节流 |
| C2 | microplate-layout-planner（大） | 消费端 artifact 手递（兼容旧 plate-layout）+ 生产端切换；manifest 化（保留 bespoke 渲染，不强行泛化；双 CSV 不可合并，互操作表格 CSV 的导入启发式 L2562–2663 保持不动） | 死代码 fallbackDownload*/escAttr/columnCount 恒 1、csvCell/parseCsvLine→labtoolsRowsToCsv/CsvToRows；字段改名同步 colorBy/labelBy/value-editor；plate-grid 方向键 + role 语义；视图状态丢失 |
| C3 | qpcr-analysis（大） | 消费端 artifact 手递（保留 pendingHandoffLayout 语义，manifest 声明 `consumeWhen:'ready'`）；applyParams 补 DOM 同步 | serializeForWorkbench gene 键 bug；decodeBuffer/stat 重复→共享；TSV 转义 |
| D | bca-assay（大） | plate/raw 双模式 manifest 化；接入深链：消费端 `labtoolsConsumeArtifactHandoff`（plate-layout→bca）+ 产出端 "Send to rt/seeding"（conc-data artifact 手递），结束链条孤岛；契约定 `concentration`/`conc-data` 权威名 | renderSmpRows/renderPlateGrid 未定义 bug；well→group 聚合三合一；**showResults/showInlineResults 双轨渲染合并**（SVG 不再复制）；runPlateCalc 的 currentPreset 临时改写副作用；拟合全家桶换共享 fitLinear/fitQuadratic；localStorage 草稿语义决策 + plate 模式 e2e 补测 |
| E（PDF/配置类） | thermal-to-laser（中）、label-generator（大）、drug-dosage（中） | thermal-to-laser：manifest 化（不 artifact 化——内存文件字节不可恢复），workbench 代码从 HTML 并入 tool.js；label-generator：共享 preset 模块接入、**解除跨工具 import 与 localStorage 直读**、死代码清理（不强制 artifact 化）；drug-dosage：manifest 化 + 解禁合并执行（max-dose 安全上限 + CSV 注入修复 + hub 状态同步 + 隐藏态 JS 空转修复） | 两 PDF 工具 pdf-lib 加载降级与版本声明（集中管理两份拷贝）；sideMargin/leftMargin 别名统一、buildSheetGeometry 重复合并进共享 preset 模块；label-generator 死数据预设清理；**三工具补测试钩子 + e2e 落位** |

### 阶段 4 — workflow 会话 + hub 升级（2–3 个 PR）
- 会话记录（`kind:'session'`）、断点续跑、hub 显示链图与"继续会话"；hub 工具卡片改为 manifest 驱动（`tools/*/manifest.js` 聚合生成，替代手写 430 行 HTML）；drug-dosage 卡片状态与工具页解禁同步。

### 阶段 5 — legacy 清理与文档收尾（1–2 个 PR）
- 删除 legacy `serializeForWorkbench`/typed handoff 路径、`DATA_TYPES` 业务 type 注册、旧测试钩子约定；更新 README/AGENTS/CLAUDE/CONTRIBUTING 与 issue 模板工具清单。
- 验收：全量测试绿；`grep` 无遗留旧 API 引用。

### 总工作量概算

| 批次 | 规模 |
|---|---|
| 阶段 0–2（共享层） | 约 8–10 个 PR，为全程最大单一投入，但旧工具零改动、风险可控 |
| 批次 A–B（小工具 + 计数链） | 4 个工具，合计约 5 个 PR，产出 manifest 模板与共享计数模块 |
| 批次 C（plate 枢纽三工具） | 3 个工具（含 2 个"大"），约 4–5 个 PR，风险最高、依赖契约兼容层 |
| 批次 D + E（大工具 + PDF 类） | 3 个工具，约 4 个 PR |
| 阶段 4–5 | 约 3–4 个 PR |

---

## 第五部分 · 风险与开放问题

1. **`file://` 下的约束验证**：IndexedDB/BroadcastChannel 在部分浏览器的 `file://` 行为不一致——v2 必须保持现状同等可用性（store 降级路径待确认）。
2. **旧工具与 v2 并存期**：双轨并存时间越长，测试面越膨胀；每阶段必须明确"哪些路径已冻结不再演进"。
3. **单文件巨石的重写成本**：microplate-layout-planner（3095 行）、qpcr-analysis（3001 行）、bca-assay（2658 行）、label-generator（961+1531 行）的 UI 重写是最大单项风险；方案允许"manifest 化但保留现有 DOM 渲染"的轻迁移路径（微盘的 bespoke 渲染、qpcr 的 4 套 SVG 图表均留在工具内）。
4. **drug-dosage 解禁与迁移绑定**：已确认现状——工具页用 body 类隐藏但 tool.js 照常空转初始化，hub 却标 Live；解禁需先补 max-dose 安全上限与 CSV 公式注入防护（批次 E 与迁移合并执行，不得先迁移后解禁）。
5. **schema v2 与旧数据**：legacy `plate-layout` 等 payload 的 `assignments` 字段与 `wells` 别名（docs 里两者混用）需在契约迁移时定一个权威名；同类问题还有 bca-assay 的 `concentration`（field-id）vs `conc-data`（类型名）两套命名，需与下游 inputPorts 对齐后定权威名。
6. **命名空间升级对 8 个工具的隐性影响**：`workbench`/`showPicker`/`showToast` 等全局名是否保留、保留多久，需在阶段 1 定 deprecation 时间表。
7. **PDF 工具的双耦合**：label-generator 对 thermal-to-laser 的跨工具 import + localStorage 直读，必须与共享 preset 模块同批解除，否则动一坏二。
8. **artifact 恢复的 DOM 同步缺口**（qpcr-analysis/rt-calc 已确认）：e2e 恒等测试只验数据不验 DOM，需在 manifest 校验里加"applyParams 后关键控件状态断言"，否则"全状态恢复"名不副实。
9. **已知功能 bug 是否随迁移修复**：审计已列出 4 个 🔴 缺陷（两个 Save 按钮 const bug、bca renderSmpRows、qpcr gene 键、rt CSV 转义）——本方案按"迁移即修复"处理，但需在批次 PR 里显式标注 fix 与 feat 的边界，保持 one-concern-per-PR 原则。
10. **bca/rt 的 localStorage 草稿语义**：bca 的 7 天过期草稿与 rt 的已禁用持久化（注释留尸）是否并入 v2 的 snapshot/会话机制，需在批次 B/D 明确，避免"半套持久化"并存。

---

## 实施进展（2026-08，分支 feat/shared-layer-v2）

| 阶段 | 状态 | 落地内容 |
|---|---|---|
| 0 基线收口 | ✅ 6b6ceb8 | artifact 内核 + 8 工具迁移 + 本方案文档入基线 |
| 1 共享层 v2 并排 | ✅ 5 提交 | contracts（schema v2+legacy 映射）、store（可注入后端+内存 fake）、common 扩展（escHtml/decodeBuffer/fitLinear/fitQuadratic）、workflow（链图/会话/接线）、runtime（加载自检+manifest 校验）、workbench 存储委派 store + 内联回退（公共 API 不变）；unit 156 + e2e 51 绿 |
| 2 存储迁移 + UI | ✅ 3 提交 | DB v2（records 存储，upgradeV2 双路径共享 schema）+ legacy 无损复制（`__labtoolsV2Records.copyLegacyToRecords`）；wb- 全部并入 lt-（抽屉/picker/toast 组件化 + aria 增强）；unit 160 + e2e 51 绿 |
| 3 工具逐批迁移 | ✅ 完成 | **A**（cell-count feadb07、stain-timer 083841d、计时 adc14e3、事件委托 af56e91）；**B**（labtools-counting.js b448095、cell-count 6a29722、seeding-calc c153bb3、rt-calc 462502b）；**C**（qpcr-analysis ef301a9/f4df806、qpcr-plate-planner 64ce59c、microplate 17277d4、plate 枢纽链切 artifact 手递 0234791）；**D**（bca-assay 996ec2a：坏路径修复/共享拟合/聚合三合一/preset 副作用/manifest/深链）；**E**（thermal-to-laser b4e83c6、drug-dosage 解禁 7214908：max-dose 安全上限+CSV 注入防护、label-generator 解耦 3b2d630：共享 laser-presets 模块）。全部 11 工具 manifest 化。unit 167 + e2e 51 全绿。遗留：bca 双轨结果渲染（showResults/showInlineResults）按风险预案未合并（进展记录在案）；阶段 5 前 legacy 保存/Load 路径保持共存 |
| 4 workflow 会话 + hub | ⏳ | 待阶段 3 |
| 5 legacy 清理 | ⏳ | 待全部工具迁移 |

---

*附：本文档基于 2026-08 全仓审计（共享层 7 文件精读 + 11 工具分组审计 + 测试体系通读）生成，状态为 v1 定稿；工具行号引用以审计时的工作区状态为准，迁移实施时以实际代码为准。*
