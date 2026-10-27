/* =========================================================
   电力交易员中级工 · 刷题 App
   纯前端 / 单机离线 / 数据存于 localStorage
   ========================================================= */
(function () {
'use strict';

var QS = window.QUESTIONS || [];
var byId = Object.create(null);
QS.forEach(function (q) { byId[q.id] = q; });
var ALL_IDS = QS.map(function (q) { return q.id; });
var TYPE_NAME = { single: '单选题', multi: '多选题', judge: '判断题' };
var TYPE_SHORT = { single: '单选', multi: '多选', judge: '判断' };

/* ---------------- 存储 ---------------- */
var STORE_KEY = 'dljy_v1';
var DEF = {
  v: 1,
  rec: {},        // id -> {r 答对次数, w 答错次数, f 收藏, ts 最近作答}
  wrong: {},      // id -> 连续答对次数
  prog: null,     // 断点 {mode,title,order,idx,answered}
  exams: [],      // 模考记录
  daily: {},      // 'YYYY-MM-DD' -> {n 答题数, c 答对数}
  set: { theme: 'auto', fs: 17, autoNext: true, need: 2 }
};
var st = loadState();

function loadState() {
  try {
    var raw = localStorage.getItem(STORE_KEY);
    if (!raw) return JSON.parse(JSON.stringify(DEF));
    var s = JSON.parse(raw);
    var out = JSON.parse(JSON.stringify(DEF));
    if (s && typeof s === 'object') {
      out.rec = s.rec || {};
      out.wrong = s.wrong || {};
      out.prog = s.prog || null;
      out.exams = Array.isArray(s.exams) ? s.exams : [];
      out.daily = s.daily || {};
      if (s.set) for (var k in out.set) if (s.set[k] !== undefined) out.set[k] = s.set[k];
    }
    return out;
  } catch (e) {
    return JSON.parse(JSON.stringify(DEF));
  }
}
var saveTimer = null;
function save() {
  if (saveTimer) return;
  saveTimer = setTimeout(function () {
    saveTimer = null;
    try { localStorage.setItem(STORE_KEY, JSON.stringify(st)); } catch (e) {}
  }, 60);
}
function saveNow() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(st)); } catch (e) {}
}

function rec(id) {
  var r = st.rec[id];
  if (!r) { r = st.rec[id] = { r: 0, w: 0, f: 0, ts: 0 }; }
  return r;
}
function pad2(n) { return n < 10 ? '0' + n : '' + n; }
function todayKey() {
  var d = new Date();
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}
function bumpDaily(ok) {
  var k = todayKey();
  var d = st.daily[k] || (st.daily[k] = { n: 0, c: 0 });
  d.n++; if (ok) d.c++;
  var keys = Object.keys(st.daily);
  if (keys.length > 60) {
    keys.sort();
    for (var i = 0; i < keys.length - 60; i++) delete st.daily[keys[i]];
  }
}
function wrongCount() { return Object.keys(st.wrong).length; }
function favIds() {
  return Object.keys(st.rec).filter(function (id) { return st.rec[id].f; }).map(Number);
}

/* ---------------- DOM 小工具 ---------------- */
function $(id) { return document.getElementById(id); }
function esc(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
var toastTimer = null;
function toast(msg, ms) {
  var t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { t.classList.add('hidden'); }, ms || 1600);
}
function show(id) { $(id).classList.remove('hidden'); }
function hide(id) { $(id).classList.add('hidden'); }

/* ---------------- 主题 ---------------- */
var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
function applyTheme() {
  var dark = st.set.theme === 'dark' || (st.set.theme === 'auto' && mq && mq.matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  document.documentElement.style.setProperty('--fs', st.set.fs + 'px');
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#0b0f14' : '#2563eb');
}
if (mq && mq.addEventListener) mq.addEventListener('change', function () { if (st.set.theme === 'auto') applyTheme(); });

/* ---------------- 导航 ---------------- */
var TABS = ['home', 'wrong', 'fav', 'stats', 'me'];

function go(name) {
  TABS.concat(['quiz', 'result']).forEach(function (v) {
    var el = $('view-' + v);
    if (el) el.classList.add('hidden');
  });
  show('view-' + name);
  var isTab = TABS.indexOf(name) >= 0;
  $('tabbar').classList.toggle('hidden', !isTab);
  document.querySelectorAll('.tab').forEach(function (b) {
    b.classList.toggle('active', b.getAttribute('data-tab') === name);
  });
  if (name === 'home') renderHome();
  if (name === 'wrong') renderWrong();
  if (name === 'fav') renderFav();
  if (name === 'stats') renderStats();
  if (name === 'me') renderMe();
  var sc = $('view-' + name).querySelector('.scroll, .qz-body');
  if (sc) sc.scrollTop = 0;
}

/* ---------------- 首页 ---------------- */
function renderHome() {
  $('home-sub').textContent = '共 ' + QS.length + ' 题 · 单选 ' + cnt('single') + ' · 多选 ' + cnt('multi') + ' · 判断 ' + cnt('judge');
  $('foot-total').textContent = QS.length;

  var d = st.daily[todayKey()];
  $('t-today').textContent = d ? d.n : 0;

  var R = 0, W = 0;
  for (var id in st.rec) { R += st.rec[id].r; W += st.rec[id].w; }
  $('t-acc').textContent = (R + W) ? Math.round(R / (R + W) * 100) + '%' : '--';
  $('t-wrong').textContent = wrongCount();
  $('badge-wrong').textContent = wrongCount();
  $('badge-fav').textContent = favIds().length;

  var p = st.prog;
  if (p && p.order && p.order.length && p.idx < p.order.length) {
    show('resume-card');
    $('resume-title').textContent = p.title || '继续练习';
    $('resume-pos').textContent = '第 ' + (p.idx + 1) + ' / ' + p.order.length + ' 题';
  } else {
    hide('resume-card');
  }
}
function cnt(t) { return QS.filter(function (q) { return q.t === t; }).length; }

/* ---------------- 题目会话 ---------------- */
var S = null;          // 当前会话
var timerId = null;

function startQuiz(o) {
  if (!o.order || !o.order.length) { toast('这里还没有题目'); return; }
  clearInterval(timerId); timerId = null;
  S = {
    mode: o.mode, title: o.title,
    order: o.order.slice(),
    idx: Math.min(o.idx || 0, o.order.length - 1),
    answered: o.answered || {},
    exam: o.exam || null,
    done: false
  };
  go('quiz');
  $('qz-timer').classList.toggle('hidden', !o.exam);
  renderQuiz();
  if (S.exam) startTimer();
}

function cur() { return byId[S.order[S.idx]]; }

function renderQuiz() {
  var q = cur();
  if (!q) { go('home'); return; }
  var n = S.order.length;
  $('qz-title').textContent = S.title;
  $('qz-count').textContent = '第 ' + (S.idx + 1) + ' / ' + n + ' 题';
  $('qz-bar').style.width = ((S.idx + 1) / n * 100) + '%';

  var star = $('qz-star');
  var r = st.rec[q.id];
  star.classList.toggle('on', !!(r && r.f));

  $('qz-card-btn').hidden = !S.exam;

  $('qz-type').textContent = TYPE_NAME[q.t] + ' · 题库第 ' + q.no + ' 题';
  $('qz-stem').textContent = q.q;

  var box = $('qz-opts');
  box.innerHTML = '';
  var ans = S.answered[S.idx];

  q.o.forEach(function (text, i) {
    var b = document.createElement('button');
    b.className = 'opt' + (q.t === 'judge' ? ' opt-big' : '');
    b.dataset.i = i;

    var k = document.createElement('span');
    k.className = 'k';
    k.textContent = q.t === 'judge' ? (i === 0 ? '✓' : '✗') : String.fromCharCode(65 + i);

    var v = document.createElement('span');
    v.className = 'v';
    v.textContent = text;

    b.appendChild(k); b.appendChild(v);
    b.addEventListener('click', function () { onPick(i); });
    box.appendChild(b);
  });

  if (ans) paintAnswered(ans); else paintIdle();

  var noteEl = $('qz-note');
  if (S.exam) noteEl.textContent = '考试模式：答完请点「交卷」，交卷前可随时修改。';
  else if (S.answered[S.idx]) noteEl.textContent = '题库未提供解析，请对照正确答案记忆。';
  else noteEl.textContent = '';
  renderFoot();
  if (!S.exam && S.mode !== 'review') persistProg();
}

function paintIdle() {
  var q = cur(), ans = S.answered[S.idx];
  var sel = ans ? ans.sel : [];
  Array.prototype.forEach.call($('qz-opts').children, function (b) {
    var i = +b.dataset.i;
    b.classList.toggle('sel', sel.indexOf(i) >= 0);
    b.classList.remove('ok', 'bad', 'dim');
  });
  $('qz-fb').classList.add('hidden');
  $('qz-note').textContent = '';
  if (S.exam) {
    $('qz-note').textContent = '考试模式：答完请点「交卷」，交卷前可随时修改。';
  }
}

function paintAnswered(ans) {
  var q = cur();
  var right = q.a.slice().sort().join(',');
  Array.prototype.forEach.call($('qz-opts').children, function (b) {
    var i = +b.dataset.i;
    b.classList.remove('sel', 'ok', 'bad', 'dim');
    var chosen = ans.sel.indexOf(i) >= 0;
    var isAns = q.a.indexOf(i) >= 0;
    if (!S.exam) {
      if (isAns) b.classList.add('ok');
      else if (chosen) b.classList.add('bad');
      else b.classList.add('dim');
    } else {
      if (chosen) b.classList.add('sel');
    }
  });

  if (S.exam) { $('qz-fb').classList.add('hidden'); return; }

  var fb = $('qz-fb');
  fb.classList.remove('hidden', 'ok', 'bad');
  var letters = q.a.map(function (i) { return String.fromCharCode(65 + i); }).join('、');
  var judgeTxt = q.t === 'judge' ? q.o[q.a[0]] : '';
  if (ans.ok) {
    fb.classList.add('ok');
    fb.innerHTML = '<b>✓ 回答正确</b>' +
      (q.t === 'multi' ? '<span class="fb-line">正确答案：' + letters + '</span>' : '');
  } else {
    fb.classList.add('bad');
    fb.innerHTML = '<b>✗ 回答错误</b><span class="fb-line">正确答案：' +
      (q.t === 'judge' ? judgeTxt : letters) + '</span>' +
      (q.t === 'multi' ? '<span class="fb-line">多选题需全部选对才得分</span>' : '');
  }
  $('qz-note').textContent = '题库未提供解析，请对照正确答案记忆。';
}

function onPick(i) {
  var q = cur();
  var ans = S.answered[S.idx];

  if (S.exam) {
    if (S.exam.submitted) return;
    var sel = ans ? ans.sel.slice() : [];
    if (q.t === 'multi') {
      var p = sel.indexOf(i);
      if (p >= 0) sel.splice(p, 1); else sel.push(i);
      S.answered[S.idx] = { sel: sel, ok: null };
      paintExamSel(sel);
      renderFoot();
    } else {
      S.answered[S.idx] = { sel: [i], ok: null };
      paintExamSel([i]);
      renderFoot();
      if (st.set.autoNext) {
        var at = S.idx, me = S;
        clearTimeout(S.adv);
        S.adv = setTimeout(function () {
          if (S === me && S.exam && S.idx === at) nextQ();
        }, 260);
      }
    }
    return;
  }

  if (ans) return;   // 已判分

  if (q.t === 'multi') {
    var s2 = ans ? ans.sel.slice() : (S.picks || []).slice();
    var pi = s2.indexOf(i);
    if (pi >= 0) s2.splice(pi, 1); else s2.push(i);
    S.picks = s2;
    Array.prototype.forEach.call($('qz-opts').children, function (b) {
      b.classList.toggle('sel', s2.indexOf(+b.dataset.i) >= 0);
    });
    renderFoot();
    return;
  }

  grade([i]);
}

function paintExamSel(sel) {
  Array.prototype.forEach.call($('qz-opts').children, function (b) {
    b.classList.toggle('sel', sel.indexOf(+b.dataset.i) >= 0);
  });
}

function grade(sel) {
  var q = cur();
  var a = q.a.slice().sort().join(',');
  var b = sel.slice().sort().join(',');
  var ok = a === b;
  S.answered[S.idx] = { sel: sel.slice(), ok: ok };

  var r = rec(q.id);
  r.ts = Date.now();
  bumpDaily(ok);
  if (ok) {
    r.r++;
    if (st.wrong[q.id] !== undefined) {
      st.wrong[q.id]++;
      if (st.set.need > 0 && st.wrong[q.id] >= st.set.need) delete st.wrong[q.id];
    }
  } else {
    r.w++;
    st.wrong[q.id] = 0;
  }
  save();

  paintAnswered(S.answered[S.idx]);
  renderFoot();

  if (ok && st.set.autoNext) {
    setTimeout(function () { if (S && !S.exam && S.answered[S.idx] && S.answered[S.idx].ok) nextQ(); }, 650);
  }
}

function renderFoot() {
  var q = cur();
  var ans = S.answered[S.idx];
  var main = $('qz-main'), prev = $('qz-prev');
  prev.disabled = S.idx === 0;

  if (S.exam) {
    prev.textContent = '上一题';
    if (q.t === 'multi' && (!ans || ans.ok === null)) {
      main.textContent = '确定并下一题';
      main.disabled = !(ans && ans.sel.length);
    } else if (S.idx === S.order.length - 1) {
      main.textContent = '交卷';
      main.disabled = false;
    } else {
      main.textContent = '下一题';
      main.disabled = false;
    }
    return;
  }

  if (q.t === 'multi' && !ans) {
    var picks = S.picks || [];
    main.textContent = '提交答案';
    main.disabled = picks.length === 0;
  } else if (S.idx === S.order.length - 1) {
    main.textContent = ans ? '完成本组' : '下一题';
    main.disabled = false;
  } else {
    main.textContent = '下一题';
    main.disabled = false;
  }
}

function nextQ() {
  if (S) clearTimeout(S.adv);
  var q = cur();
  if (S.exam) {
    var ans = S.answered[S.idx];
    if (q.t === 'multi' && ans && ans.ok === null) { ans.ok = 'recorded'; }
    if (S.idx === S.order.length - 1) { submitExam(); return; }
    S.idx++; S.picks = null; renderQuiz(); return;
  }

  if (q.t === 'multi' && !S.answered[S.idx]) { submitMulti(); return; }
  if (S.idx === S.order.length - 1) { finishSession(); return; }
  S.idx++; S.picks = null; renderQuiz();
}

function submitMulti() {
  var picks = S.picks || [];
  if (!picks.length) { toast('请先选择答案'); return; }
  grade(picks);
  S.picks = null;
}

function prevQ() {
  if (!S) return;
  clearTimeout(S.adv);
  if (S.idx === 0) return;
  S.idx--; S.picks = null; renderQuiz();
}

function finishSession() {
  var ans = S.answered, total = S.order.length, done = 0, right = 0;
  for (var k in ans) { if (ans[k].ok === true) right++; if (ans[k].ok !== null) done++; }
  var rate = total ? Math.round(right / total * 100) : 0;
  var html = '<h3>本组完成 🎉</h3><p class="sd">' + esc(S.title) + ' · 共 ' + total + ' 题</p>' +
    '<div class="stat-cards"><div class="stat-card"><b>' + right + '</b><span>答对</span></div>' +
    '<div class="stat-card"><b>' + (total - right) + '</b><span>答错/未答</span></div></div>' +
    '<button class="btn btn-pri btn-block" id="fin-again">再来一组</button>' +
    '<button class="btn btn-ghost btn-block" id="fin-home">返回首页</button>';
  openSheet(html);
  $('fin-again').onclick = function () { closeSheet(); restart(); };
  $('fin-home').onclick = function () { closeSheet(); clearProg(); go('home'); };
  clearProg(false);
}

function restart() {
  if (!S) { go('home'); return; }
  var mode = S.mode, title = S.title, exam = S.exam;
  var order = exam ? S.order : buildOrder(mode);
  startQuiz({ mode: mode, title: title, order: order, exam: exam });
}

function clearProg(saveIt) {
  st.prog = null;
  if (saveIt !== false) saveNow();
}

function persistProg() {
  if (!S || S.exam) return;
  st.prog = {
    mode: S.mode, title: S.title, order: S.order,
    idx: S.idx, answered: S.answered, ts: Date.now()
  };
  save();
}

/* ---------------- 模式 ---------------- */
function shuffle(arr) {
  var a = arr.slice();
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

function buildOrder(mode, opt) {
  if (mode === 'seq') return ALL_IDS.slice();
  if (mode === 'rand') return shuffle(ALL_IDS);
  if (mode === 'single' || mode === 'multi' || mode === 'judge') {
    return QS.filter(function (q) { return q.t === mode; }).map(function (q) { return q.id; });
  }
  if (mode === 'wrong') return shuffle(Object.keys(st.wrong).map(Number));
  if (mode === 'fav') return shuffle(favIds());
  if (mode === 'review' && opt) return opt.slice();
  return ALL_IDS.slice();
}

function startMode(mode) {
  var map = {
    seq: ['顺序练习', buildOrder('seq')],
    rand: ['随机练习', buildOrder('rand')],
    wrong: ['错题重练', buildOrder('wrong')],
    fav: ['收藏练习', buildOrder('fav')]
  };
  if (mode === 'type') { openTypeSheet(); return; }
  if (mode === 'exam') { openExamSheet(); return; }
  if (!map[mode]) return;
  var title = map[mode][0], order = map[mode][1];
  if (!order.length) { toast(mode === 'wrong' ? '错题本是空的' : '还没有收藏的题目'); return; }
  st.prog = null;
  startQuiz({ mode: mode, title: title, order: order, idx: 0 });
}

function openTypeSheet() {
  var html = '<h3>专项练习</h3><p class="sd">按题型集中突破</p>' +
    rowBtn('single', '单选题', cnt('single') + ' 题') +
    rowBtn('multi', '多选题', cnt('multi') + ' 题') +
    rowBtn('judge', '判断题', cnt('judge') + ' 题');
  openSheet(html);
  ['single', 'multi', 'judge'].forEach(function (t) {
    $('pick-' + t).onclick = function () {
      closeSheet();
      var order = buildOrder(t);
      st.prog = null;
      startQuiz({ mode: t, title: TYPE_NAME[t] + '专练', order: order, idx: 0 });
    };
  });
}
function rowBtn(id, t, d) {
  return '<button class="opt-row" id="pick-' + id + '"><span>' + t + '</span><span class="r">' + d + '</span></button>';
}

function openExamSheet() {
  var html = '<h3>模拟考试</h3><p class="sd">随机抽题 · 计时交卷 · 自动评分</p>' +
    examRow(0) + examRow(1) + examRow(2);
  openSheet(html);
  [0, 1, 2].forEach(function (i) {
    $('ex-' + i).onclick = function () {
      var cfg = [[20, 20], [50, 45], [100, 90]][i];
      closeSheet();
      startExam(cfg[0], cfg[1]);
    };
  });
}
function examRow(i) {
  var c = [[20, 20], [50, 45], [100, 90]][i];
  return '<button class="opt-row" id="ex-' + i + '"><span>' + c[0] + ' 题</span><span class="r">' + c[1] + ' 分钟</span></button>';
}

function startExam(total, minutes) {
  var order = shuffle(ALL_IDS).slice(0, Math.min(total, ALL_IDS.length));
  startQuiz({
    mode: 'exam', title: '模拟考试',
    order: order,
    exam: { total: order.length, minutes: minutes, startTs: Date.now(), deadline: Date.now() + minutes * 60000 }
  });
  toast('开始考试，' + minutes + ' 分钟');
}

/* ---------------- 计时 ---------------- */
function startTimer() {
  clearInterval(timerId);
  var el = $('qz-timer');
  el.classList.remove('hidden');
  tick();
  timerId = setInterval(tick, 1000);
  function tick() {
    if (!S || !S.exam) { clearInterval(timerId); return; }
    var left = Math.max(0, S.exam.deadline - Date.now());
    var m = Math.floor(left / 60000), s = Math.floor(left % 60000 / 1000);
    el.textContent = pad2(m) + ':' + pad2(s);
    el.classList.toggle('warn', left < 60000);
    if (left <= 0) { clearInterval(timerId); submitExam(true); }
  }
}

function submitExam(auto) {
  if (!S || !S.exam || S.exam.submitted) return;
  S.exam.submitted = true;
  clearInterval(timerId);
  $('qz-timer').classList.add('hidden');

  var right = 0, wrongIds = [];
  var total = S.order.length;
  S.order.forEach(function (id, i) {
    var a = S.answered[i];
    var q = byId[id];
    var ok = false;
    if (a && a.sel && a.sel.length) {
      ok = q.a.slice().sort().join(',') === a.sel.slice().sort().join(',');
    }
    if (ok) right++; else { wrongIds.push(id); }
    var r = rec(id);
    r.ts = Date.now();
    bumpDaily(ok);
    if (ok) r.r++; else { r.w++; st.wrong[id] = 0; }
  });

  var used = Math.round((Date.now() - S.exam.startTs) / 60000);
  var score = Math.round(right / total * 100);
  st.exams.unshift({ ts: Date.now(), total: total, right: right, score: score, used: used });
  if (st.exams.length > 20) st.exams.length = 20;
  saveNow();

  showResult({ total: total, right: right, wrong: wrongIds, used: used, score: score, auto: auto });
}

function showResult(r) {
  var pct = Math.round(r.right / r.total * 100);
  $('rs-ring').style.setProperty('--p', pct + '%');
  $('rs-score').textContent = r.score;
  $('rs-title').textContent = r.auto ? '时间到，已自动交卷' : (pct >= 60 ? '考试完成，通过 🎉' : '考试完成');
  $('rs-sub').textContent = '共 ' + r.total + ' 题 · 正确率 ' + pct + '%';
  $('rs-right').textContent = r.right;
  $('rs-wrong').textContent = r.total - r.right;
  $('rs-used').textContent = r.used;
  $('rs-review').disabled = !r.wrong.length;
  $('rs-review').onclick = function () {
    if (!r.wrong.length) return;
    startQuiz({ mode: 'review', title: '错题重做', order: r.wrong, idx: 0 });
  };
  $('rs-home').onclick = function () { clearProg(); go('home'); };
  go('result');
}

/* ---------------- 错题本 / 收藏 ---------------- */
function renderWrong() {
  var ids = Object.keys(st.wrong).map(Number);
  ids.sort(function (a, b) {
    var ra = st.rec[a] || {}, rb = st.rec[b] || {};
    return (rb.w || 0) - (ra.w || 0);
  });
  $('wrong-sub').textContent = ids.length ? '共 ' + ids.length + ' 题 · 连续答对 ' + (st.set.need || 1) + ' 次自动移出' : '答错自动收录，连续答对后自动移出';
  $('badge-wrong') && ($('badge-wrong').textContent = ids.length);
  var list = $('wrong-list');
  list.innerHTML = '';
  if (!ids.length) { show('wrong-empty'); $('wrong-practice').disabled = true; return; }
  hide('wrong-empty');
  $('wrong-practice').disabled = false;

  ids.forEach(function (id) {
    var q = byId[id]; if (!q) return;
    var r = st.rec[id] || { w: 0 };
    var el = document.createElement('div');
    el.className = 'item';
    el.innerHTML = '<span class="item-n">' + q.no + '</span>' +
      '<span class="item-c"><span class="item-q">' + esc(q.q) + '</span>' +
      '<span class="item-m"><span class="tagm">' + TYPE_SHORT[q.t] + '</span>错 ' + (r.w || 1) + ' 次</span></span>';
    var del = document.createElement('button');
    del.className = 'item-del';
    del.innerHTML = '<svg viewBox="0 0 24 24"><path d="M5 5l14 14M19 5 5 19"/></svg>';
    del.onclick = function (e) {
      e.stopPropagation();
      delete st.wrong[id];
      saveNow(); renderWrong(); toast('已移出错题本');
    };
    el.onclick = function () {
      startQuiz({ mode: 'wrong', title: '错题重练', order: ids, idx: ids.indexOf(id) });
    };
    el.appendChild(del);
    list.appendChild(el);
  });
}

function renderFav() {
  var ids = favIds();
  $('fav-sub').textContent = ids.length ? '共 ' + ids.length + ' 题' : '点题目右上角的星标即可收藏';
  var list = $('fav-list');
  list.innerHTML = '';
  if (!ids.length) { show('fav-empty'); $('fav-practice').disabled = true; return; }
  hide('fav-empty');
  $('fav-practice').disabled = false;
  ids.forEach(function (id) {
    var q = byId[id]; if (!q) return;
    var el = document.createElement('div');
    el.className = 'item';
    el.innerHTML = '<span class="item-n">' + q.no + '</span>' +
      '<span class="item-c"><span class="item-q">' + esc(q.q) + '</span>' +
      '<span class="item-m"><span class="tagm">' + TYPE_SHORT[q.t] + '</span></span></span>';
    var del = document.createElement('button');
    del.className = 'item-del';
    del.innerHTML = '<svg viewBox="0 0 24 24"><path d="M5 5l14 14M19 5 5 19"/></svg>';
    del.onclick = function (e) {
      e.stopPropagation();
      rec(id).f = 0;
      saveNow(); renderFav(); toast('已取消收藏');
    };
    el.onclick = function () {
      startQuiz({ mode: 'fav', title: '收藏练习', order: ids, idx: ids.indexOf(id) });
    };
    el.appendChild(del);
    list.appendChild(el);
  });
}

/* ---------------- 统计 ---------------- */
function renderStats() {
  var R = 0, W = 0, done = 0;
  for (var id in st.rec) {
    R += st.rec[id].r; W += st.rec[id].w;
    if (st.rec[id].r + st.rec[id].w > 0) done++;
  }
  $('s-done').textContent = done;
  $('s-times').textContent = R + W;
  $('s-acc').textContent = (R + W) ? Math.round(R / (R + W) * 100) + '%' : '--';
  $('s-exam').textContent = st.exams.length;

  var bars = $('type-bars');
  bars.innerHTML = '';
  ['single', 'multi', 'judge'].forEach(function (t) {
    var tr = 0, tw = 0;
    QS.forEach(function (q) {
      if (q.t !== t) return;
      var r = st.rec[q.id];
      if (r) { tr += r.r; tw += r.w; }
    });
    var tot = tr + tw;
    var pct = tot ? Math.round(tr / tot * 100) : 0;
    var d = document.createElement('div');
    d.className = 'tbar';
    d.innerHTML = '<div class="tbar-h"><span>' + TYPE_NAME[t] + '</span><span>' +
      (tot ? pct + '% · 共 ' + tot + ' 次' : '还未练习') + '</span></div>' +
      '<div class="tbar-b"><i style="width:' + pct + '%"></i></div>';
    bars.appendChild(d);
  });

  var chart = $('day-chart');
  chart.innerHTML = '';
  var max = 1, days = [];
  for (var i = 6; i >= 0; i--) {
    var dt = new Date(); dt.setDate(dt.getDate() - i);
    var k = dt.getFullYear() + '-' + pad2(dt.getMonth() + 1) + '-' + pad2(dt.getDate());
    var v = (st.daily[k] || {}).n || 0;
    days.push({ k: k, v: v, label: (dt.getMonth() + 1) + '/' + dt.getDate() });
    if (v > max) max = v;
  }
  days.forEach(function (d) {
    var el = document.createElement('div');
    el.className = 'day';
    var h = Math.max(4, Math.round(d.v / max * 88));
    el.innerHTML = '<div class="day-bar" style="height:' + h + 'px"><b>' + (d.v || '') + '</b></div>' +
      '<span class="day-l">' + d.label + '</span>';
    chart.appendChild(el);
  });

  var list = $('exam-list');
  list.innerHTML = '';
  if (!st.exams.length) { show('exam-empty'); return; }
  hide('exam-empty');
  st.exams.slice(0, 8).forEach(function (e) {
    var d = new Date(e.ts);
    var el = document.createElement('div');
    el.className = 'item';
    el.innerHTML = '<span class="item-c"><span class="item-q">模拟考试 · ' + e.score + ' 分</span>' +
      '<span class="item-m">' + (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) +
      ' · 答对 ' + e.right + '/' + e.total + ' · 用时 ' + e.used + ' 分</span></span>';
    list.appendChild(el);
  });
}

/* ---------------- 我的 / 设置 ---------------- */
function renderMe() {
  segSet('seg-theme', st.set.theme);
  segSet('seg-fs', String(st.set.fs));
  segSet('seg-need', String(st.set.need));
  $('sw-auto').checked = !!st.set.autoNext;
}

function segSet(id, v) {
  document.querySelectorAll('#' + id + ' button').forEach(function (b) {
    b.classList.toggle('on', b.getAttribute('data-v') === v);
  });
}

/* ---------------- 弹层 ---------------- */
function openSheet(html) {
  $('sheet-body').innerHTML = html;
  show('mask'); show('sheet');
}
function closeSheet() {
  hide('mask'); hide('sheet');
}

/* ---------------- 搜索 ---------------- */
function openSearch() {
  var html = '<h3>搜索题目</h3>' +
    '<div class="search-bar"><input id="q-input" type="search" placeholder="输入关键词，如：售电公司" autocomplete="off"></div>' +
    '<div id="q-res" class="list"></div>';
  openSheet(html);
  var input = $('q-input');
  var res = $('q-res');
  input.focus();
  var t = null;
  input.addEventListener('input', function () {
    clearTimeout(t);
    t = setTimeout(function () { doSearch(input.value, res); }, 120);
  });
}
function doSearch(kw, res) {
  kw = (kw || '').trim().toLowerCase();
  res.innerHTML = '';
  if (!kw) {
    res.innerHTML = '<div class="empty"><span>输入关键词开始搜索</span></div>';
    return;
  }
  var hit = [];
  for (var i = 0; i < QS.length && hit.length < 40; i++) {
    var q = QS[i];
    if (q.q.toLowerCase().indexOf(kw) >= 0 || q.o.join(' ').toLowerCase().indexOf(kw) >= 0) hit.push(q);
  }
  if (!hit.length) { res.innerHTML = '<div class="empty"><span>没有找到相关题目</span></div>'; return; }
  hit.forEach(function (q) {
    var el = document.createElement('div');
    el.className = 'item';
    el.innerHTML = '<span class="item-n">' + q.no + '</span><span class="item-c"><span class="item-q">' +
      esc(q.q) + '</span><span class="item-m"><span class="tagm">' + TYPE_SHORT[q.t] + '</span></span></span>';
    el.onclick = function () {
      closeSheet();
      startQuiz({ mode: 'review', title: '题目浏览', order: [q.id], idx: 0 });
    };
    res.appendChild(el);
  });
}

/* ---------------- 导入导出 ---------------- */
function exportData() {
  var blob = new Blob([JSON.stringify(st, null, 2)], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  var d = new Date();
  a.href = url;
  a.download = '刷题备份-' + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + '.json';
  document.body.appendChild(a);
  a.click();
  setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
  toast('已导出备份文件');
}

function importData(file) {
  var fr = new FileReader();
  fr.onload = function () {
    try {
      var s = JSON.parse(fr.result);
      if (!s || typeof s !== 'object' || !s.rec) throw new Error('bad');
      st.rec = s.rec || {};
      st.wrong = s.wrong || {};
      st.prog = s.prog || null;
      st.exams = Array.isArray(s.exams) ? s.exams : [];
      st.daily = s.daily || {};
      if (s.set) for (var k in st.set) if (s.set[k] !== undefined) st.set[k] = s.set[k];
      saveNow();
      applyTheme(); go('home');
      toast('导入成功');
    } catch (e) {
      toast('文件格式不正确');
    }
  };
  fr.readAsText(file);
}

/* ---------------- 事件绑定 ---------------- */
function bind() {
  document.querySelectorAll('.tab').forEach(function (b) {
    b.onclick = function () { go(b.getAttribute('data-tab')); };
  });
  document.querySelectorAll('.mode[data-mode]').forEach(function (b) {
    b.onclick = function () { startMode(b.getAttribute('data-mode')); };
  });
  $('go-wrong').onclick = function () { go('wrong'); };
  $('go-fav').onclick = function () { go('fav'); };
  $('resume-go').onclick = function () {
    var p = st.prog;
    if (!p) return;
    startQuiz({ mode: p.mode, title: p.title, order: p.order, idx: p.idx, answered: p.answered });
  };

  $('wrong-practice').onclick = function () {
    var order = buildOrder('wrong');
    if (!order.length) { toast('错题本是空的'); return; }
    startQuiz({ mode: 'wrong', title: '错题重练', order: order, idx: 0 });
  };
  $('fav-practice').onclick = function () {
    var order = buildOrder('fav');
    if (!order.length) { toast('还没有收藏的题目'); return; }
    startQuiz({ mode: 'fav', title: '收藏练习', order: order, idx: 0 });
  };

  $('qz-back').onclick = function () {
    if (S && S.exam && !S.exam.submitted) {
      openSheet('<h3>退出考试？</h3><p class="sd">本次考试进度不会保存</p>' +
        '<button class="btn btn-pri btn-block" id="ex-continue">继续答题</button>' +
        '<button class="btn btn-ghost btn-block" id="ex-quit">退出考试</button>');
      $('ex-continue').onclick = closeSheet;
      $('ex-quit').onclick = function () {
        closeSheet();
        clearInterval(timerId);
        S = null; clearProg(); go('home');
      };
      return;
    }
    if (S && !S.exam) persistProg();
    S = null; clearInterval(timerId); go('home');
  };

  $('qz-star').onclick = function () {
    if (!S) return;
    var q = cur();
    var r = rec(q.id);
    r.f = r.f ? 0 : 1;
    saveNow();
    $('qz-star').classList.toggle('on', !!r.f);
    toast(r.f ? '已收藏' : '已取消收藏');
  };

  $('qz-main').onclick = function () {
    if (!S) return;
    if (S.exam) {
      var q = cur(), ans = S.answered[S.idx];
      if (q.t === 'multi' && (!ans || ans.ok === null)) {
        if (!ans || !ans.sel.length) { toast('请先选择答案'); return; }
        S.answered[S.idx].ok = 'recorded';
        if (S.idx === S.order.length - 1) { submitExam(); return; }
        S.idx++; S.picks = null; renderQuiz(); return;
      }
      if (S.idx === S.order.length - 1) { submitExam(); return; }
      S.idx++; S.picks = null; renderQuiz(); return;
    }
    var curQ = cur();
    if (curQ.t === 'multi' && !S.answered[S.idx]) { submitMulti(); return; }
    nextQ();
  };

  $('qz-prev').onclick = prevQ;

  $('qz-card-btn').onclick = showCardSheet;

  $('btn-search').onclick = openSearch;

  document.querySelectorAll('#seg-theme button').forEach(function (b) {
    b.onclick = function () {
      st.set.theme = b.getAttribute('data-v');
      saveNow(); applyTheme(); segSet('seg-theme', st.set.theme);
    };
  });
  document.querySelectorAll('#seg-fs button').forEach(function (b) {
    b.onclick = function () {
      st.set.fs = +b.getAttribute('data-v');
      saveNow(); applyTheme(); segSet('seg-fs', String(st.set.fs));
    };
  });
  document.querySelectorAll('#seg-need button').forEach(function (b) {
    b.onclick = function () {
      st.set.need = +b.getAttribute('data-v');
      saveNow(); segSet('seg-need', String(st.set.need));
      renderWrong();
    };
  });
  $('sw-auto').onchange = function () {
    st.set.autoNext = this.checked; saveNow();
  };

  $('btn-export').onclick = exportData;
  $('btn-import').onclick = function () {
    var inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'application/json,.json';
    inp.onchange = function () { if (inp.files && inp.files[0]) importData(inp.files[0]); };
    inp.click();
  };
  $('btn-reset').onclick = function () {
    openSheet('<h3>清空所有记录？</h3><p class="sd">答题记录、错题本、收藏、模考成绩都会删除，且无法恢复。</p>' +
      '<button class="btn btn-pri btn-block" id="rs-cancel">取消</button>' +
      '<button class="btn btn-ghost btn-block" id="rs-ok" style="color:#dc2626">确认清空</button>');
    $('rs-cancel').onclick = closeSheet;
    $('rs-ok').onclick = function () {
      closeSheet();
      st = JSON.parse(JSON.stringify(DEF));
      saveNow(); applyTheme(); go('home');
      toast('已清空');
    };
  };

  $('mask').onclick = closeSheet;
}

function showCardSheet() {
  if (!S || !S.exam) return;
  var html = '<h3>答题卡</h3><p class="sd">已答 ' +
    Object.keys(S.answered).length + ' / ' + S.order.length + ' 题</p><div class="cardgrid" id="cardgrid"></div>' +
    '<button class="btn btn-pri btn-block" id="card-submit">交卷</button>';
  openSheet(html);
  var g = $('cardgrid');
  S.order.forEach(function (id, i) {
    var c = document.createElement('button');
    c.className = 'cell' + (S.answered[i] ? ' done' : '') + (i === S.idx ? ' cur' : '');
    c.textContent = i + 1;
    c.onclick = function () { closeSheet(); S.idx = i; S.picks = null; renderQuiz(); };
    g.appendChild(c);
  });
  $('card-submit').onclick = function () { closeSheet(); submitExam(); };
}

/* ---------------- 启动 ---------------- */
var BUILD = 'v1.1 · 2026-10-27';

function init() {
  if (!QS.length) {
    document.body.innerHTML = '<div style="padding:56px 28px;text-align:center;font:16px/1.9 -apple-system,PingFang SC;color:#111">' +
      '<p style="font-size:18px;font-weight:600;margin:0 0 10px">题库没有加载出来</p>' +
      '<p style="color:#666;margin:0">请刷新页面；如果反复出现，说明缓存坏了——<br>在设置里清除该网站的数据后重新打开。</p></div>';
    return;
  }
  var ver = $('me-ver');
  if (ver) ver.textContent = BUILD;

  applyTheme();
  bind();
  go('home');

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js').catch(function () {});
  }

  if (!navigator.standalone && /iphone|ipad|ipod/i.test(navigator.userAgent)) {
    var fn = document.querySelector('#view-home .foot-note');
    if (fn) fn.innerHTML += '<br><br>📲 在 Safari 中点「分享」→「添加到主屏幕」，即可像 App 一样全屏离线使用。';
  }
}

/* 全局错误兜底：显示可点击关闭的提示，便于排查 */
window.addEventListener('error', function (e) {
  var box = document.createElement('div');
  box.style.cssText = 'position:fixed;left:8px;right:8px;bottom:8px;z-index:999;background:#dc2626;color:#fff;' +
    'padding:10px 12px;border-radius:10px;font-size:12px;line-height:1.5;white-space:pre-wrap;word-break:break-all';
  box.textContent = '脚本错误（点一下关闭）\n' + (e.message || e) + '\n' +
    (e.filename || '') + (e.lineno ? ':' + e.lineno : '');
  box.addEventListener('click', function () { box.remove(); });
  document.body.appendChild(box);
});

function boot() {
  try {
    init();
  } catch (err) {
    var box = document.createElement('div');
    box.style.cssText = 'position:fixed;left:10px;right:10px;bottom:10px;z-index:999;background:#dc2626;color:#fff;' +
      'padding:12px;border-radius:10px;font-size:12px;line-height:1.5;white-space:pre-wrap;word-break:break-all';
    box.textContent = '启动失败（点一下关闭）\n' + (err && err.message ? err.message : err) +
      '\n\n请刷新页面；仍失败请清除该网站数据。';
    box.addEventListener('click', function () { box.remove(); });
    document.body.appendChild(box);
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

})();
