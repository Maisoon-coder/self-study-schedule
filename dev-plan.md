# 个人工作台 APP · 开发计划（可直接执行）

> 依据：PRD.md (v1.0, 2026-08-29)
> 目标：单 HTML 文件、原生 JS、localStorage、零联网、PC+手机本地运行
> 状态：待执行

---

## 0. 总体技术约定（先定死，避免返工）

- **交付物**：单个文件 `C:\Users\27056\Desktop\我的app\workbench\index.html`（内含 `<style>` 与 `<script>`，无外部依赖、无构建步骤）。
- **存储 key**：`personal_workbench_v1`，存一份整体 JSON。
- **全局状态**：`const state = {...}`；任何变更后调 `save()` 写 localStorage；启动时 `load()`。
- **页面切换**：`let currentPage` + `render()` 按页重绘对应 section（不用框架）。
- **主题**：CSS 变量 + `data-theme` 属性，写在 `state.settings.theme`。
- **ID 生成**：`uid()` 用 `Date.now()+随机`，所有条目唯一 id。

---

## 阶段 1 — 脚手架 + 状态层 + 导航（验收 A1）
**目标**：能打开、能切 6 页、能存能读。
**具体步骤**：
1. 写 `index.html` 骨架：`<header>` 放标题/日期；`<nav>` 做响应式（PC 左侧栏、手机底部标签栏，用 CSS `@media` 控制）；6 个 `<section>` 容器。
2. 定义 `state` 初始结构（见下"数据模型"）。
3. 实现 `load()` / `save()` / `uid()` / `switchPage(name)` / `render()`。
4. 实现主题切换函数 `applyTheme()`，启动时读取 `state.settings.theme` 套到 `<html data-theme>`。
**完成标志**：浏览器打开 6 页可切，控制台无报错（A1）。

## 阶段 2 — 数据模型与通用 CRUD（验收 A2/A3）
**目标**：数据变更即时持久化，刷新/关闭/重启不丢。
**数据模型（state）**：
```
tasks: [{id,title,status,priority,cat,source,refId,refType,repeat,generatedDate,createdAt}]
algorithm: {leetcode:[],nowcoder:[],luogu:[],lanqiao:[]}  每项{id,no,diff,tags[],mastery,status,dispatched}
cet6: {mock:[{id,date,listenErr,readErr,time,weak[]}], templates:[{id,type,title,body}], words:[{id,text,dispatched}]}
school: {hw:[],contest:[],meeting:[],notice:[]}  每项{id,title,ddl,status,note,leadDays,dispatched}
checkin: {algorithm:{streak,lastDate}, cet6:{streak,lastDate}}
memo: ""   settings: {theme:"light"}
```
**步骤**：写一个通用 `upsert(arr,item)` / `removeById(arr,id)`；每个模块页面调用它们并结尾 `save()`。
**完成标志**：任一处增删改后刷新页面数据仍在（A2/A3）。

## 阶段 3 — 今日计划（验收 B1–B4）
**步骤**：
1. 列表渲染 `tasks`（显示状态圆点、优先级、分类、来源标记"派"、重复标记"每天"）。
2. 新增表单：标题/优先级/分类/重复（无|每天）。
3. 状态切换：点圆点在 未开始→进行中→已完成 循环。
4. 删除、编辑（至少可改标题/分类/优先级）。
5. 顶部筛选 chips：按状态（全部/未完成/已完成）。
6. **每天重复重置** `dailyRoll()`：启动时对 `repeat:'每天'` 且 `generatedDate<今天` 的任务，状态重置为未开始、`generatedDate=今天`（保持单实例，不复制）。
**完成标志**：B1 新增带属性；B2 状态切换持久；B3 重复任务次日仍在；B4 可筛选。

## 阶段 4 — 算法题（验收 C1–C3）
**步骤**：
1. 顶部 4 平台 tab 切换（LeetCode/牛客/洛谷/蓝桥），各自独立数组。
2. 题目表单：题号/难度(简单|中|难)/题型标签(可多个)/掌握程度/刷题状态；增删改。
3. "派任务"按钮：调 `dispatchToToday({refType:'algorithm',refId,refPlatform,title})`——若今日已存在同 `refId+refType` 任务则跳过，否则建 `source:'派'` 任务，源题 `dispatched=true`。
4. 顶部"今日打卡" + 连续天数（用 `doCheckin('algorithm')`）。
**完成标志**：C1 四板块各自 CRUD 字段齐；C2 派任务去重且标记已派；C3 打卡天数正确。

## 阶段 5 — 六级备考（验收 D1–D4）
**步骤**：
1. 真题/模考区：表单（日期/听力错/阅读错/用时/弱项标签），增删改。
2. 写作/翻译区：卡片列表（类型/标题/内容纯文本），增删改。
3. 单词/听力区：添加条目 + "派任务到今日计划"（同 `dispatchToToday`，`refType:'cet6-words'`）。
4. 顶部"今日打卡" + 连续天数（`doCheckin('cet6')`）。
**完成标志**：D1 模考字段齐；D2 模板范文增删改；D3 单词听力可派；D4 打卡逻辑同 C3。

## 阶段 6 — 学校事务（验收 E1–E3）
**步骤**：
1. 4 类 tab（学科作业/竞赛/活动会议/学院通知），各自增删改，字段：标题/DDL/状态/注意事项/提前天数。
2. 每类"提前天数"设置（统一存每条 `leadDays`）。
3. **自动派发** `autoDispatchSchool()`：在 `dailyRoll()` 与首页渲染时调用——对每条 `!dispatched` 且 `今天 ≥ DDL - leadDays` 的条目，建 `source:'派'` 今日任务并置 `dispatched=true`（去重：已存在同 refId 不建）。
**完成标志**：E1 四类型 CRUD 字段齐；E2 到提前窗口自动入今日计划且不重复；E3 源条目保持已派标记（单向，勾完成不回写）。

## 阶段 7 — 首页总览（验收 F1–F4）
**步骤**：
1. 顶部日期 + 快速备忘文本框（输入即存 `state.memo`）。
2. 今日计划未完成摘要：读 `tasks` 中状态≠已完成，可勾完成（回写 tasks）。
3. 各模块摘要卡：算法题/六级连续天数 + 今日是否已打卡；学校事务"未来 N 天即将到期"条数（按各自 `leadDays` 口径统计 `DDL - leadDays ≤ 今天+N` 的未派/未完条目）。
4. 首页渲染前先调 `dailyRoll()`（含重复重置 + 学校事务自动派发）。
**完成标志**：F1 未完成摘要可勾；F2 打卡天数展示；F3 即将到期计数；F4 备忘持久。

## 阶段 8 — 打卡算法 & 数据与设置（验收 G1–G5 / H1–H2）
**A. 打卡连续天数 `doCheckin(key)`**：
- 读 `checkin[key]`；若 `lastDate==今天` → 不变（已打卡）；
- 若 `lastDate==昨天` → `streak+1`；否则 `streak=1`；写 `lastDate=今天`。
- 首页展示采用"断签保持"：今天未打卡但昨天打卡 → 显示昨天 `streak`（今天仍可补）。
**B. 数据与设置页**：
1. 导出：`exportData()` 把 `state` 序列化为 JSON，`Blob` + `a.download` 下载 `workbench-data-YYYYMMDD.json`。
2. 导入：`importData(file)` → 读文件 → **二次确认弹窗** → `state=解析结果; save(); render()`。
3. 主题切换 UI（浅/深），调 `applyTheme()`。
4. 存储信息：遍历各数组算条数 + `JSON.stringify(state).length` 估算占用，文字展示"数据存于浏览器本地 localStorage"。
5. 清空：按模块清空 + 全部清空，均弹**二次确认**后执行并 `save()`。
**完成标志**：G1 导出下载成功；G2 导入二次确认后恢复；G3 主题即时持久；G4 条数/占用展示；G5 二次确认清空。H1/H2 跨设备导出导入往返一致。

## 阶段 9 — 收尾与全量自测（验收兜底）
**步骤**：
1. 每个列表加**空态引导**（无数据时显示"去添加"入口跳对应页）。
2. **必填校验**：标题/题号/DDL 缺失时禁用保存并提示。
3. 按 PRD 第 10 节 A1–H2 逐条在浏览器实测，记录结果。
4. 在手机浏览器打开同一 HTML，验证导航（底部 tab）与基础操作。
**完成标志**：A1–H2 全部通过；空态与校验就位。

---

## 建议执行顺序（依赖关系）
`阶段1 → 阶段2 → 阶段3 → 阶段4 → 阶段5 → 阶段6 → 阶段7 → 阶段8 → 阶段9`
（阶段 7 依赖阶段 3–6 的派发/打卡函数；阶段 8 的自动派发依赖阶段 6）

## 两个编码时必须遵守的细节
- **派发去重**：今日任务带 `refId+refType`，任何派发前先查重，避免重复建。
- **单向回写**：今日计划勾完成只改 `tasks`，不动源条目（算法题/六级/学校事务的"已派"标记保持）。

## 验收标准索引（映射到 PRD 第 10 节）
- A1–A3 持久化与运行 → 阶段1、2
- B1–B4 今日计划 → 阶段3
- C1–C3 算法题 → 阶段4
- D1–D4 六级备考 → 阶段5
- E1–E3 学校事务 → 阶段6
- F1–F4 首页 → 阶段7
- G1–G5 数据设置 → 阶段8
- H1–H2 跨设备搬运 → 阶段8
