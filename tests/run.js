// 个人工作台 · 测试台（jsdom 驱动真实 index.html）
// 用法：node tests/run.js <stage|all>   stage ∈ {1,2,3,4,5,6,7,8,9}
const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require(path.join(
  process.env.NODE_WORKSPACE || "C:/Users/27056/.workbuddy/binaries/node/workspace", "node_modules", "jsdom"));

const HTML_PATH = path.join(__dirname, "..", "workbench", "index.html");
const html = fs.readFileSync(HTML_PATH, "utf8");

let passed = 0, failed = 0;
const fails = [];
function ok(cond, msg){ if(cond){ passed++; } else { failed++; fails.push(msg); console.log("  ✗ "+msg); } }
function eq(a,b,msg){ ok(JSON.stringify(a)===JSON.stringify(b), msg+"  (得到 "+JSON.stringify(a)+")"); }

function loadApp(){
  return new Promise((resolve)=>{
    const errors = [];
    const vc = new VirtualConsole();
    vc.on("jsdomError", e=> errors.push(String(e)));
    vc.on("error", (...a)=> errors.push(a.join(" ")));
    const dom = new JSDOM(html, {
      runScripts: "dangerously",
      resources: "usable",
      url: "http://localhost/",
      virtualConsole: vc,
      beforeParse(window){
        window.confirm = ()=>true;
        window.alert = ()=>{};
      }
    });
    const w = dom.window;
    setTimeout(()=> resolve({ window:w, errors, dom }), 80);
  });
}

/* ============ 阶段1：脚手架+导航（A1） ============ */
async function stage1(){
  const { window, errors } = await loadApp();
  ok(errors.length===0, "初始化无控制台错误: "+errors.join(" | "));
  const App = window.App;
  ok(!!App, "window.App 已暴露");
  const pages = ["home","today","algo","cet6","school","settings"];
  for(const p of pages){
    App.switchPage(p);
    const sec = window.document.getElementById("page-"+p);
    ok(sec && sec.classList.contains("active"), "切到页面 "+p+" 且 section 激活");
  }
  // 导航按钮数量
  const navBtns = window.document.querySelectorAll("#nav .navbtn").length;
  const botBtns = window.document.querySelectorAll("#bottomnav .navbtn").length;
  eq(navBtns, 6, "侧栏导航 6 个入口");
  eq(botBtns, 6, "底部导航 6 个入口");
  ok(errors.length===0, "切换页面后无运行时错误: "+errors.join(" | "));
  window.close();
}

/* ============ 阶段2：数据模型与通用CRUD（A2/A3） ============ */
async function stage2(){
  const { window } = await loadApp();
  const App = window.App;
  // 默认结构
  const s = App.state;
  ok(Array.isArray(s.tasks), "tasks 为数组");
  ok(s.algorithm && Array.isArray(s.algorithm.leetcode), "algorithm.leetcode 存在");
  ok(s.cet6 && Array.isArray(s.cet6.mock), "cet6.mock 存在");
  ok(s.school && Array.isArray(s.school.hw), "school.hw 存在");
  ok(s.checkin && s.checkin.algorithm, "checkin.algorithm 存在");

  // 变更即持久化：直接加一条任务再 save
  App.state.tasks.push({ id:"t1", title:"测试任务", status:"未开始", priority:"高",
    cat:"手动", source:"手动", refId:null, refType:null, repeat:"无", generatedDate:App.todayStr(), createdAt:Date.now() });
  App.save();
  const raw = window.localStorage.getItem("personal_workbench_v1");
  ok(raw && raw.includes("测试任务"), "save() 后 localStorage 含新任务（A2）");

  // 模拟“刷新”：重新 load，数据应仍在（A3）
  App.load();
  eq(App.state.tasks.length, 1, "刷新后 tasks 仍保留 1 条（A3）");
  eq(App.state.tasks[0].title, "测试任务", "刷新后任务标题一致（A3）");

  // 空存储时回退默认
  window.localStorage.removeItem("personal_workbench_v1");
  App.load();
  eq(App.state.tasks.length, 0, "清空存储后 load 回退默认（tasks 为空）");

  // 通用 CRUD
  const arr = App.state.algorithm.leetcode;
  const item = { id:"q1", no:"1", diff:"简单" };
  App.upsert(arr, item);
  eq(arr.length, 1, "upsert 新增成功");
  App.upsert(arr, { id:"q1", no:"2", diff:"中等" });
  eq(arr.length, 1, "upsert 同 id 覆盖而非新增");
  eq(arr[0].no, "2", "upsert 覆盖后字段更新");
  App.removeById(arr, "q1");
  eq(arr.length, 0, "removeById 删除成功");

  window.close();
}

/* ============ 阶段3：今日计划（B1-B4） ============ */
async function stage3(){
  const { window } = await loadApp();
  const App = window.App;
  App.switchPage("today");
  // B1：新增带属性
  const t = App.addTask({ title:"写报告", priority:"高", cat:"工作", repeat:"无" });
  ok(App.state.tasks.length===1, "新增任务后 tasks=1（B1）");
  const t2 = App.addTask({ title:"每日背单词", priority:"中", cat:"学习", repeat:"每天" });
  ok(t2.repeat==="每天", "重复任务 repeat=每天（B1）");
  ok(t.priority==="高" && t.cat==="工作", "优先级/分类记录正确（B1）");

  // B2：状态切换并持久化
  App.cycleStatus(t.id);
  eq(App.state.tasks.find(x=>x.id===t.id).status, "进行中", "一次切换→进行中（B2）");
  App.cycleStatus(t.id);
  eq(App.state.tasks.find(x=>x.id===t.id).status, "已完成", "二次切换→已完成（B2）");
  App.cycleStatus(t.id);
  eq(App.state.tasks.find(x=>x.id===t.id).status, "未开始", "三次切换→未开始循环（B2）");
  // 持久化：save 已调用，load 后仍为 已完成 之前状态（这里回到未开始）
  App.load();
  eq(App.state.tasks.find(x=>x.id===t.id).status, "未开始", "刷新后状态保持（B2）");

  // DOM 渲染含该行
  App.switchPage("today");
  const row = window.document.querySelector(`#page-today .item[data-id="${t.id}"]`);
  ok(row && row.textContent.includes("写报告"), "DOM 渲染出任务行（B1）");

  // B3：每天重复次日仍出现且状态重置
  App.setNow("2026-09-01");
  App.dailyRoll();
  App.setNow("2026-09-02");
  App.dailyRoll();
  const rep = App.state.tasks.find(x=>x.id===t2.id);
  ok(!!rep, "次日重复任务仍存在（B3）");
  eq(rep.status, "未开始", "次日重复任务状态重置为未开始（B3）");
  eq(rep.generatedDate, "2026-09-02", "次日重复任务 generatedDate 更新为今天（B3）");
  App.setNow(null);

  // B4：筛选
  App.cycleStatus(t.id); App.cycleStatus(t.id); // 设为已完成
  App.setFilter("已完成");
  const done = App.getFilteredTasks();
  ok(done.every(x=>x.status==="已完成") && done.length>=1, "筛选‘已完成’只返回已完成（B4）");
  App.setFilter("未完成");
  ok(App.getFilteredTasks().every(x=>x.status!=="已完成"), "筛选‘未完成’不含已完成（B4）");
  App.setFilter("all");
  // DOM 筛选：切换已完成时列表只剩已完成行
  App.setFilter("已完成");
  App.switchPage("today");
  const domRows = window.document.querySelectorAll("#page-today .item");
  ok([...domRows].every(r=>r.textContent.includes("已完成")), "DOM 筛选‘已完成’仅显示已完成行（B4）");
  App.setFilter("all");

  window.close();
}

/* ============ 阶段4：算法题（C1-C3） ============ */
async function stage4(){
  const { window } = await loadApp();
  const App = window.App;
  App.switchPage("algo");
  // C1：四平台各自 CRUD，字段齐
  const q1 = App.addAlgoQuestion("leetcode", { no:"1", diff:"简单", tags:["数组","双指针"], mastery:"了解", status:"待刷" });
  ok(App.state.algorithm.leetcode.length===1, "LeetCode 新增题目（C1）");
  eq(q1.tags, ["数组","双指针"], "题型标签数组保存正确（C1）");
  const q2 = App.addAlgoQuestion("nowcoder", { no:"100", diff:"中等", tags:["图"], mastery:"熟悉", status:"刷过" });
  ok(App.state.algorithm.nowcoder.length===1 && App.state.algorithm.leetcode.length===1, "四平台各自独立（C1）");
  App.updateAlgoQuestion("leetcode", q1.id, { status:"已掌握" });
  eq(App.state.algorithm.leetcode.find(x=>x.id===q1.id).status, "已掌握", "更新题目状态（C1）");
  App.deleteAlgoQuestion("leetcode", q1.id);
  eq(App.state.algorithm.leetcode.length, 0, "删除题目（C1）");

  // C2：派任务去重 + 已派标记
  App.setAlgoPlatform("nowcoder");
  const r1 = App.dispatchAlgo("nowcoder", q2.id);
  ok(r1===true, "首次派任务成功（C2）");
  ok(App.state.algorithm.nowcoder.find(x=>x.id===q2.id).dispatched===true, "源题标记 dispatched（C2）");
  const taskCount = App.state.tasks.filter(t=>t.refType==="algorithm" && t.refId===q2.id).length;
  eq(taskCount, 1, "今日计划生成 1 条派发任务（C2）");
  const r2 = App.dispatchAlgo("nowcoder", q2.id);
  ok(r2===false, "再次派任务被去重（C2）");
  eq(App.state.tasks.filter(t=>t.refType==="algorithm" && t.refId===q2.id).length, 1, "重复派发不生成第 2 条（C2）");
  // DOM：已派标记显示
  App.switchPage("algo");
  const row = window.document.querySelector(`#page-algo .item[data-id="${q2.id}"]`);
  ok(row && row.textContent.includes("已派"), "DOM 显示‘已派’标记（C2）");

  // C3：打卡连续天数
  App.setNow("2026-09-01");
  let c1 = App.doCheckin("algorithm");
  eq(c1.streak, 1, "首次打卡 streak=1（C3）");
  eq(c1.lastDate, "2026-09-01", "lastDate=今天（C3）");
  const c1b = App.doCheckin("algorithm"); // 同一天再点
  eq(c1b.streak, 1, "同一天再打卡不累加（C3）");
  App.setNow("2026-09-02");
  let c2 = App.doCheckin("algorithm");
  eq(c2.streak, 2, "连续第二天 streak=2（C3）");
  App.setNow("2026-09-04"); // 跳过 09-03
  let c3 = App.doCheckin("algorithm");
  eq(c3.streak, 1, "断签一天再打卡重置为 1（C3）");
  App.setNow(null);
  window.close();
}

/* ============ 阶段5：六级备考（D1-D4） ============ */
async function stage5(){
  const { window } = await loadApp();
  const App = window.App;
  App.switchPage("cet6");
  // D1：真题模考 CRUD，字段齐
  const m = App.addMock({ date:"2026-09-01", listenErr:3, readErr:5, time:"45min", weak:["词汇","匹配"] });
  ok(App.state.cet6.mock.length===1, "新增模考记录（D1）");
  eq([m.listenErr, m.readErr], [3,5], "听力/阅读错题数保存（D1）");
  eq(m.weak, ["词汇","匹配"], "弱项标签保存（D1）");
  App.updateMock(m.id, { listenErr:2 });
  eq(App.state.cet6.mock.find(x=>x.id===m.id).listenErr, 2, "更新模考（D1）");
  App.deleteMock(m.id);
  eq(App.state.cet6.mock.length, 0, "删除模考（D1）");

  // D2：写作/翻译模板范文 CRUD
  const t = App.addTemplate({ type:"写作", title:"图表作文模板", body:"第一段描述趋势……" });
  ok(App.state.cet6.templates.length===1, "新增模板/范文（D2）");
  eq(t.type, "写作", "类型保存（D2）");
  App.updateTemplate(t.id, { body:"改写后内容" });
  eq(App.state.cet6.templates.find(x=>x.id===t.id).body, "改写后内容", "更新模板内容（D2）");
  App.deleteTemplate(t.id);
  eq(App.state.cet6.templates.length, 0, "删除模板（D2）");

  // D3：单词/听力派任务
  const w = App.addWord("背50个单词");
  ok(App.state.cet6.words.length===1, "新增单词/听力条目（D3）");
  const r = App.dispatchWord(w.id);
  ok(r===true, "派任务成功（D3）");
  ok(App.state.cet6.words.find(x=>x.id===w.id).dispatched===true, "条目标记已派（D3）");
  eq(App.state.tasks.filter(x=>x.refType==="cet6-words" && x.refId===w.id).length, 1, "今日计划生成 1 条（D3）");
  const r2 = App.dispatchWord(w.id);
  ok(r2===false, "重复派任务去重（D3）");

  // D4：打卡逻辑同 C3
  App.setNow("2026-09-01");
  let c1 = App.doCheckin("cet6"); eq(c1.streak, 1, "六级首次打卡=1（D4）");
  App.setNow("2026-09-02");
  let c2 = App.doCheckin("cet6"); eq(c2.streak, 2, "六级连续=2（D4）");
  App.setNow("2026-09-05");
  let c3 = App.doCheckin("cet6"); eq(c3.streak, 1, "六级断签重置=1（D4）");
  App.setNow(null);
  window.close();
}

/* ============ 阶段6：学校事务（E1-E3） ============ */
async function stage6(){
  const { window } = await loadApp();
  const App = window.App;
  App.switchPage("school");
  // E1：四类型 CRUD，字段齐
  App.setSchoolType("hw");
  const a = App.addSchool("hw", { title:"数据结构作业", ddl:"2026-09-10", status:"待处理", note:"用C++", leadDays:3 });
  ok(App.state.school.hw.length===1, "学科作业新增（E1）");
  eq(a.ddl, "2026-09-10", "DDL 保存（E1）");
  eq(a.leadDays, 3, "提前天数保存（E1）");
  const b = App.addSchool("contest", { title:"蓝桥省赛", ddl:"2026-10-01", status:"待处理", note:"", leadDays:5 });
  ok(App.state.school.contest.length===1, "竞赛类型独立（E1）");
  App.updateSchool("hw", a.id, { status:"进行中" });
  eq(App.state.school.hw.find(x=>x.id===a.id).status, "进行中", "更新状态（E1）");
  App.deleteSchool("hw", a.id);
  eq(App.state.school.hw.length, 0, "删除（E1）");

  // E2：提前窗口内自动派发且不重复
  const item = App.addSchool("hw", { title:"高数作业", ddl:"2026-09-10", leadDays:3 });
  App.setNow("2026-09-04"); // ddl-lead = 2026-09-07，今天未进入窗口
  App.autoDispatchSchool();
  eq(App.state.tasks.filter(t=>t.refType==="school" && t.refId===item.id).length, 0, "窗口外不派发（E2）");
  App.setNow("2026-09-08"); // ddl-lead=09-07，今天>=09-07 进入窗口
  App.autoDispatchSchool();
  eq(App.state.tasks.filter(t=>t.refType==="school" && t.refId===item.id).length, 1, "窗口内自动派发 1 条（E2）");
  ok(App.state.school.hw.find(x=>x.id===item.id).dispatched===true, "源条目标记 dispatched（E2）");
  App.autoDispatchSchool(); // 再调不应重复
  eq(App.state.tasks.filter(t=>t.refType==="school" && t.refId===item.id).length, 1, "重复调用不重复派发（E2）");

  // E3：源条目保持已派（单向，今日计划勾完成不回写）
  const task = App.state.tasks.find(t=>t.refType==="school" && t.refId===item.id);
  App.cycleStatus(task.id); App.cycleStatus(task.id); // 未开始→进行中→已完成
  eq(App.state.tasks.find(t=>t.id===task.id).status, "已完成", "今日计划任务可勾完成（E3）");
  ok(App.state.school.hw.find(x=>x.id===item.id).dispatched===true, "学校源条目仍保持已派（单向，E3）");

  App.setNow(null);
  window.close();
}

/* ============ 阶段7：首页总览（F1-F4） ============ */
async function stage7(){
  const { window } = await loadApp();
  const App = window.App;
  // 准备数据：今日计划含一条未完成；打卡；学校事务即将到期
  App.addTask({ title:"首页测试任务", priority:"中", cat:"", repeat:"无" });
  App.setNow("2026-09-01");
  App.doCheckin("algorithm"); App.doCheckin("cet6");
  App.addSchool("hw", { title:"即将到期作业", ddl:"2026-09-03", leadDays:1 });

  App.switchPage("home");
  // F1：未完成摘要可勾完成并回写
  const incBefore = App.state.tasks.filter(t=>t.status!=="已完成").length;
  ok(incBefore>=1, "首页存在未完成任务（F1）");
  const firstIncomplete = App.state.tasks.find(t=>t.status!=="已完成");
  App.completeTask(firstIncomplete.id);
  eq(App.state.tasks.find(t=>t.id===firstIncomplete.id).status, "已完成", "勾完成后状态回写为已完成（F1）");
  // DOM 完成按钮存在
  App.switchPage("home");
  ok(window.document.querySelector('#page-home [data-act="done"]') || App.state.tasks.filter(t=>t.status!=="已完成").length===0,
    "首页有完成按钮或无未完成项（F1）");

  // F2：打卡天数与今日状态展示
  App.switchPage("home");
  const homeText = window.document.getElementById("page-home").textContent;
  ok(homeText.includes("算法题连续打卡") && homeText.includes("1"), "首页展示算法题连续打卡天数（F2）");
  ok(homeText.includes("已打卡"), "首页展示今日已打卡状态（F2）");

  // F3：学校事务即将到期计数
  ok(homeText.includes("学校事务即将到期") && /\d/.test(homeText), "首页有即将到期计数卡（F3）");

  // F4：快速备忘持久化
  App.setMemo("买牛奶");
  eq(App.state.memo, "买牛奶", "备忘写入 state（F4）");
  App.save();
  App.load();
  eq(App.state.memo, "买牛奶", "刷新后备忘仍在（F4）");
  // DOM 显示备忘
  App.switchPage("home");
  const memoEl = window.document.querySelector("#page-home #memo");
  ok(memoEl && memoEl.value==="买牛奶", "DOM 显示备忘内容（F4）");

  App.setNow(null);
  window.close();
}

/* ============ 阶段8：打卡算法 & 数据与设置（G1-G5 / H1-H2） ============ */
async function stage8(){
  const { window } = await loadApp();
  const App = window.App;
  // 打卡断签保持：昨天打卡、今天未打卡 → 显示昨天 streak，今天仍可补
  App.setNow("2026-09-01"); App.doCheckin("algorithm"); // streak=1 lastDate=09-01
  App.setNow("2026-09-02"); App.doCheckin("algorithm"); // streak=2 lastDate=09-02
  App.setNow("2026-09-03"); // 今天还没打卡
  eq(App.state.checkin.algorithm.streak, 2, "断签保持：今天未打卡仍显示昨天 streak=2");
  App.doCheckin("algorithm"); // 今天补
  eq(App.state.checkin.algorithm.streak, 3, "今天补打卡接续为 3");
  App.setNow(null);

  // G1：导出
  App.addTask({ title:"导出测试", priority:"中", cat:"", repeat:"无" });
  const exported = App.exportData();
  ok(typeof exported==="string" && exported.includes("导出测试"), "导出返回含数据的 JSON 字符串（G1）");
  ok(JSON.parse(exported).tasks.length>=1, "导出 JSON 可解析且含任务（G1）");

  // G2：导入恢复（applyImport 为核心）
  const snapshot = App.serialize();
  App.applyClear("all");
  eq(App.state.tasks.length, 0, "清空后 tasks 为 0（G2 前）");
  App.applyImport(snapshot);
  ok(App.state.tasks.length>=1 && App.state.tasks.some(t=>t.title==="导出测试"), "导入恢复数据（G2）");

  // H1/H2：跨设备往返一致
  const before = App.serialize();
  const round = JSON.parse(before);
  App.applyImport(JSON.stringify(round));
  eq(App.serialize(), before, "导出→导入往返数据一致（H1/H2）");

  // G3：主题切换持久
  App.setTheme("dark");
  eq(App.state.settings.theme, "dark", "主题写入 state（G3）");
  eq(window.document.documentElement.getAttribute("data-theme"), "dark", "DOM 应用深色（G3）");
  App.save(); App.load();
  eq(App.state.settings.theme, "dark", "刷新后主题保持（G3）");

  // G4：存储信息展示
  App.switchPage("settings");
  const st = window.document.getElementById("page-settings").textContent;
  ok(st.includes("localStorage") && st.includes("今日计划") && /\d/.test(st), "设置页展示存储说明与模块数量（G4）");

  // G5：按模块清空 + 全部清空（二次确认）
  App.addTask({ title:"待清空", priority:"中", cat:"", repeat:"无" });
  App.applyClear("tasks");
  eq(App.state.tasks.length, 0, "按模块清空今日计划生效（G5）");
  App.addAlgoQuestion("leetcode", { no:"9", diff:"简单" });
  App.applyClear("algo");
  eq(App.state.algorithm.leetcode.length, 0, "按模块清空算法题生效（G5）");
  App.applyClear("all");
  eq(App.state.tasks.length, 0, "全部清空生效（G5）");
  // confirm 门控：confirm=false 时不清除
  App.addTask({ title:"不可被误清", priority:"中", cat:"", repeat:"无" });
  window.confirm = ()=>false; // 模拟用户取消
  App.clearData("all");
  eq(App.state.tasks.length, 1, "二次确认取消时不清空（G5）");
  window.confirm = ()=>true;

  window.close();
}

/* ============ 阶段9：收尾（空态引导 + 必填校验） ============ */
async function stage9(){
  const { window } = await loadApp();
  const App = window.App;
  App.applyClear("all");
  // 空态引导：各页无数据时显示 .empty
  for(const p of ["home","today","algo","cet6","school"]){
    App.switchPage(p);
    ok(window.document.querySelector(`#page-${p} .empty`), p+" 页面无数据时显示空态引导（空态）");
  }
  // 必填校验：标题为空不添加
  App.switchPage("today");
  const beforeTasks = App.state.tasks.length;
  window.document.querySelector("#page-today #tTitle").value = "";
  window.document.querySelector("#page-today #tAdd").click();
  eq(App.state.tasks.length, beforeTasks, "今日计划：空标题不保存（校验）");

  App.switchPage("algo");
  const beforeAlgo = App.state.algorithm.leetcode.length;
  window.document.querySelector("#page-algo #aNo").value = "";
  window.document.querySelector("#page-algo #aAdd").click();
  eq(App.state.algorithm.leetcode.length, beforeAlgo, "算法题：空题号不保存（校验）");

  App.switchPage("school");
  const beforeSchool = App.state.school.hw.length;
  window.document.querySelector("#page-school #sTitle").value = "";      // 标题空
  window.document.querySelector("#page-school #sDdl").value = "2026-10-01";
  window.document.querySelector("#page-school #sAdd").click();
  eq(App.state.school.hw.length, beforeSchool, "学校事务：空标题不保存（校验）");
  // DDL 为空也不保存
  window.document.querySelector("#page-school #sTitle").value = "有标题";
  window.document.querySelector("#page-school #sDdl").value = "";
  window.document.querySelector("#page-school #sAdd").click();
  eq(App.state.school.hw.length, beforeSchool, "学校事务：空 DDL 不保存（校验）");

  // 正常添加应通过校验
  window.document.querySelector("#page-school #sTitle").value = "有效作业";
  window.document.querySelector("#page-school #sDdl").value = "2026-10-01";
  window.document.querySelector("#page-school #sAdd").click();
  eq(App.state.school.hw.length, beforeSchool+1, "学校事务：有效输入可保存（校验）");

  window.close();
}

const stages = { 1: stage1, 2: stage2, 3: stage3, 4: stage4, 5: stage5, 6: stage6, 7: stage7, 8: stage8, 9: stage9 };
(async ()=>{
  const arg = process.argv[2] || "all";
  const want = arg==="all" ? Object.keys(stages).map(Number) : [Number(arg)];
  for(const n of want){
    if(!stages[n]){ console.log("未知阶段: "+n); continue; }
    console.log("\n=== 阶段 "+n+" 测试 ===");
    try{ await stages[n](); }catch(e){ failed++; fails.push("阶段"+n+" 抛异常: "+e.message); console.log("  ✗ 异常: "+e.stack); }
  }
  console.log(`\n结果：通过 ${passed}，失败 ${failed}`);
  if(failed>0){ console.log("失败项：\n - "+fails.join("\n - ")); process.exit(1); }
  else { console.log("全部通过 ✅"); process.exit(0); }
})();
