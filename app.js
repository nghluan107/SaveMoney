/* =========================================================
   Sổ Thu Chi Gia Đình — dữ liệu lưu trong localStorage
   ========================================================= */
(function () {
  'use strict';

  const STORE_KEY = 'sm-data-v1';
  const THEME_KEY = 'sm-theme';

  // ---------- Danh mục ----------
  // color: slot màu cố định theo danh mục (màu đi theo danh mục, không theo thứ hạng)
  const EXPENSE_CATS = [
    { id: 'an', name: 'Ăn uống', icon: '🍜', color: 's1' },
    { id: 'nha', name: 'Nhà cửa', icon: '🏠', color: 's2' },
    { id: 'dilai', name: 'Đi lại', icon: '🛵', color: 's3' },
    { id: 'hoadon', name: 'Hóa đơn', icon: '⚡', color: 's4' },
    { id: 'muasam', name: 'Mua sắm', icon: '🛍️', color: 's5' },
    { id: 'suckhoe', name: 'Sức khỏe', icon: '💊', color: 's6' },
    { id: 'con', name: 'Con cái & Học', icon: '🎓', color: 's7' },
    { id: 'giaitri', name: 'Giải trí', icon: '🎬', color: 's8' },
    { id: 'hieuhi', name: 'Hiếu hỉ', icon: '💐', color: 's-other' },
    { id: 'khac', name: 'Khác', icon: '📦', color: 's-other' },
  ];
  const INCOME_CATS = [
    { id: 'luong', name: 'Lương', icon: '💼', color: 's1' },
    { id: 'thuong', name: 'Thưởng', icon: '🎉', color: 's1' },
    { id: 'kinhdoanh', name: 'Kinh doanh', icon: '📈', color: 's1' },
    { id: 'dautu', name: 'Đầu tư', icon: '💹', color: 's1' },
    { id: 'duoccho', name: 'Được tặng', icon: '🎁', color: 's1' },
    { id: 'thukhac', name: 'Thu khác', icon: '💵', color: 's1' },
  ];
  const ALL_CATS = [...EXPENSE_CATS, ...INCOME_CATS];
  const catById = (id) => ALL_CATS.find((c) => c.id === id) || EXPENSE_CATS[EXPENSE_CATS.length - 1];
  const GOAL_ICONS = ['🛟', '🏡', '✈️', '🚗', '👶', '🎓', '💍', '📱', '🏖️', '💎', '🩺', '🎯'];

  // ---------- State ----------
  const defaultState = () => ({
    version: 1,
    members: ['Chồng', 'Vợ'],
    budget: 0,
    transactions: [],
    goals: [],
    deposits: [],
  });

  // Trong trang Artifact (claude.ai) dữ liệu nằm ở kho chung `db`; mở file trên máy thì dùng localStorage.
  const IN_ARTIFACT = !!(window.claude && typeof window.claude.use === 'function');
  let mode = 'local'; // 'local' | 'cloud'
  let db = null;
  let canWrite = true;
  let state = IN_ARTIFACT ? defaultState() : load();
  const now = new Date();
  let viewY = now.getFullYear();
  let viewM = now.getMonth(); // 0-based
  let currentView = 'dashboard';
  const charts = {};

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) return Object.assign(defaultState(), JSON.parse(raw));
    } catch (e) { /* ignore */ }
    return defaultState();
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
    catch (e) { toast('⚠️ Không lưu được dữ liệu trên trình duyệt này'); }
  }

  // =========================================================
  // DATA LAYER — ghi vào kho chung (cloud) hoặc localStorage (local)
  // =========================================================
  const COLLS = ['transactions', 'goals', 'deposits'];

  function setSync(s) {
    const el = document.getElementById('sync-pill');
    if (!el) return;
    const map = {
      local: ['💾 Lưu trên máy này', ''],
      loading: ['⏳ Đang tải dữ liệu…', ''],
      slow: ['⚠️ Chưa kết nối được, dữ liệu có thể chưa mới', 'warn'],
      cloud: ['☁️ Đã đồng bộ', 'ok'],
      readonly: ['👀 Chỉ xem', 'warn'],
      error: ['⚠️ Mất kết nối, hãy tải lại trang', 'warn'],
    };
    const [text, cls] = map[s] || map.local;
    el.textContent = text;
    el.className = 'sync-pill ' + cls;
  }

  let renderTimer = null;
  function scheduleRender() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(renderView, 60);
  }

  let unsubs = [];
  let fbUser = null;

  async function initStore() {
    if (IN_ARTIFACT) {
      setSync('loading');
      let cap = null;
      try { cap = await window.claude.use('db'); } catch (e) { cap = null; }
      if (!cap) { state = load(); setSync('local'); renderView(); return; }
      db = cap; mode = 'cloud';
      subscribeAll();
      return;
    }
    if (USE_FIREBASE) { initFirebase(); return; }
    setSync('local');
  }

  // ---------- Firebase (dùng khi web chạy trên GitHub Pages) ----------
  const USE_FIREBASE = !IN_ARTIFACT && !!window.FIREBASE_CONFIG && !!window.firebase;

  function showLogin(msg, opts) {
    const o = opts || {};
    $('#login-screen').hidden = false;
    $('#login-msg').textContent = msg;
    $('#login-btn').hidden = !!o.hideButton;
    $('#login-switch').hidden = !o.showSwitch;
  }

  function initFirebase() {
    firebase.initializeApp(window.FIREBASE_CONFIG);
    const auth = firebase.auth();
    const fs = firebase.firestore();
    try { fs.settings({ ignoreUndefinedProperties: true, merge: true }); } catch (e) { /* ignore */ }
    // Lưu tạm trên máy để mở nhanh và dùng được khi mất mạng
    fs.enablePersistence({ synchronizeTabs: true }).catch(() => {});
    db = fs;
    showLogin('Đang kiểm tra đăng nhập…', { hideButton: true });

    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    $('#login-btn').addEventListener('click', async () => {
      try { await auth.signInWithPopup(provider); }
      catch (e) {
        if (e && (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment')) {
          auth.signInWithRedirect(provider);
        } else if (e && e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') {
          toast('⚠️ Đăng nhập không thành công, hãy thử lại');
        }
      }
    });
    $('#login-switch').addEventListener('click', () => auth.signOut());
    $('#logout-btn').addEventListener('click', async () => {
      if (await askConfirm('Đăng xuất khỏi tài khoản này?', 'Đăng xuất')) auth.signOut();
    });

    auth.onAuthStateChanged((user) => {
      unsubs.forEach((u) => u()); unsubs = [];
      fbUser = user;
      if (!user) {
        mode = 'local'; state = defaultState(); renderView();
        showLogin('Đăng nhập để xem và ghi chép thu chi chung của gia đình.');
        return;
      }
      $('#login-screen').hidden = true;
      mode = 'cloud';
      state = defaultState();
      subscribeAll();
      renderView();
    });
  }

  function subscribeAll() {
    setSync('loading');
    const pending = new Set([...COLLS, 'settings']);
    const timer = setTimeout(() => setSync('slow'), 10000);
    const done = (name, snap) => {
      if (snap.metadata.fromCache) return;
      pending.delete(name);
      if (!pending.size) { clearTimeout(timer); setSync(canWrite ? 'cloud' : 'readonly'); }
    };
    const onErr = (e) => {
      clearTimeout(timer);
      if (USE_FIREBASE && e && e.code === 'permission-denied') {
        unsubs.forEach((u) => u()); unsubs = [];
        showLogin(`Tài khoản ${fbUser ? fbUser.email : ''} không có quyền xem sổ thu chi này. Hãy đăng nhập bằng email của chồng hoặc vợ.`, { hideButton: true, showSwitch: true });
        return;
      }
      setSync('error');
    };
    COLLS.forEach((name) => {
      unsubs.push(db.collection(name).onSnapshot((snap) => {
        state[name] = snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
        done(name, snap);
        scheduleRender();
      }, onErr));
    });
    unsubs.push(db.doc('settings/main').onSnapshot((snap) => {
      const d = snap.exists ? snap.data() : {};
      state.members = Array.isArray(d.members) && d.members.length ? [...d.members] : ['Chồng', 'Vợ'];
      state.budget = Number(d.budget) || 0;
      done('settings', snap);
      scheduleRender();
    }, onErr));
  }

  async function guard(promise) {
    try { await promise; return true; }
    catch (e) {
      const code = e && e.code;
      if (code === 'invalid_argument' || code === 'permission-denied') { canWrite = false; setSync('readonly'); toast('👀 Bạn chỉ có quyền xem, không sửa được dữ liệu'); }
      else if (code === 'quota_exceeded') toast('⚠️ Kho dữ liệu đã đầy, hãy xóa bớt dữ liệu cũ');
      else toast('⚠️ Chưa lưu được, hãy thử lại');
      return false;
    }
  }

  // Firebase giữ thay đổi trên máy và tự gửi lên khi có mạng, nên không chờ máy chủ trả lời
  function write(p) {
    if (USE_FIREBASE) { guard(p); return Promise.resolve(true); }
    return guard(p);
  }

  async function upsert(coll, obj) {
    if (mode === 'cloud') {
      const body = Object.assign({}, obj); delete body.id;
      return write(db.collection(coll).doc(obj.id).set(body));
    }
    const arr = state[coll];
    const i = arr.findIndex((x) => x.id === obj.id);
    if (i >= 0) arr[i] = obj; else arr.push(obj);
    save(); renderView();
    return true;
  }

  async function removeDoc(coll, id) {
    if (mode === 'cloud') return write(db.collection(coll).doc(id).delete());
    state[coll] = state[coll].filter((x) => x.id !== id);
    save(); renderView();
    return true;
  }

  async function saveSettingsData(members, budget) {
    if (mode === 'cloud') return write(db.doc('settings/main').set({ members, budget }));
    state.members = members; state.budget = budget;
    save(); renderView();
    return true;
  }

  // Thay toàn bộ dữ liệu (nhập file, dữ liệu mẫu, xóa hết)
  async function replaceAll(data) {
    if (mode !== 'cloud') { state = Object.assign(defaultState(), data); save(); renderView(); return true; }
    const ops = [];
    COLLS.forEach((c) => state[c].forEach((x) => ops.push(() => db.collection(c).doc(x.id).delete())));
    COLLS.forEach((c) => (data[c] || []).forEach((x) => {
      const body = Object.assign({}, x); delete body.id;
      ops.push(() => db.collection(c).doc(x.id).set(body));
    }));
    ops.push(() => db.doc('settings/main').set({ members: data.members || state.members, budget: data.budget || 0 }));
    let ok = true;
    for (let i = 0; i < ops.length; i += 10) {
      toast(`Đang lưu… ${Math.min(i + 10, ops.length)}/${ops.length}`);
      const res = await Promise.all(ops.slice(i, i + 10).map((f) => guard(f())));
      if (res.includes(false)) { ok = false; break; }
    }
    return ok;
  }

  // Hộp thoại xác nhận (confirm() không dùng được trong Artifact)
  function askConfirm(message, okLabel) {
    return new Promise((resolve) => {
      const dlg = document.getElementById('confirm-modal');
      document.getElementById('confirm-text').textContent = message;
      const ok = document.getElementById('confirm-ok');
      ok.textContent = okLabel || 'Đồng ý';
      const finish = (v) => { ok.onclick = null; dlg.onclose = null; if (dlg.open) dlg.close(); resolve(v); };
      ok.onclick = () => finish(true);
      dlg.onclose = () => finish(false);
      dlg.showModal();
    });
  }

  // ---------- Helpers ----------
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const nf = new Intl.NumberFormat('vi-VN');
  const fmt = (n) => nf.format(Math.round(n || 0)) + ' ₫';
  const fmtShort = (n) => {
    const a = Math.abs(n);
    if (a >= 1e9) return (n / 1e9).toLocaleString('vi-VN', { maximumFractionDigits: 1 }) + ' tỷ';
    if (a >= 1e6) return (n / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 1 }) + ' tr';
    if (a >= 1e3) return Math.round(n / 1e3) + 'k';
    return String(n);
  };
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const mkey = (y, m) => `${y}-${pad(m + 1)}`;
  const shiftMonth = (y, m, k) => { const d = new Date(y, m + k, 1); return [d.getFullYear(), d.getMonth()]; };
  const daysIn = (y, m) => new Date(y, m + 1, 0).getDate();
  const parseMoney = (s) => Number(String(s || '').replace(/\D/g, '')) || 0;
  const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue('--' + name).trim();
  const esc = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const monthName = (y, m) => `Tháng ${m + 1}/${y}`;
  const memberName = (i) => state.members[i] || state.members[0];

  function txOfMonth(y, m) {
    const k = mkey(y, m);
    return state.transactions.filter((t) => t.date.startsWith(k));
  }
  function sumBy(list, type) {
    return list.filter((t) => !type || t.type === type).reduce((s, t) => s + t.amount, 0);
  }
  function totalSaving(untilDate) {
    return state.deposits
      .filter((d) => !untilDate || d.date <= untilDate)
      .reduce((s, d) => s + d.amount, 0);
  }

  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), 2200);
  }

  // ---------- Theme ----------
  function effectiveTheme() {
    const t = document.documentElement.getAttribute('data-theme');
    if (t) return t;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function setTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem(THEME_KEY, t); } catch (e) { /* ignore */ }
    syncThemeButtons();
    renderView();
  }
  function syncThemeButtons() {
    const t = effectiveTheme();
    $$('[data-theme-set]').forEach((b) => b.classList.toggle('active', b.dataset.themeSet === t));
  }

  // ---------- Chart defaults ----------
  function chartTheme() {
    const text2 = cssVar('text-2');
    Chart.defaults.font.family = '"Be Vietnam Pro", system-ui, sans-serif';
    Chart.defaults.font.size = 12;
    Chart.defaults.color = cssVar('muted');
    return {
      grid: cssVar('grid'),
      axis: cssVar('axis'),
      surface: cssVar('surface'),
      text: cssVar('text'),
      text2,
      tooltip: {
        backgroundColor: cssVar('surface'),
        titleColor: cssVar('text'),
        bodyColor: text2,
        borderColor: cssVar('border'),
        borderWidth: 1,
        padding: 10,
        cornerRadius: 10,
        boxPadding: 4,
        usePointStyle: true,
        titleFont: { weight: '600' },
      },
    };
  }
  function makeChart(id, config) {
    if (charts[id]) charts[id].destroy();
    const ctx = document.getElementById(id);
    if (!ctx || typeof Chart === 'undefined') return;
    charts[id] = new Chart(ctx, config);
  }

  // =========================================================
  // RENDER
  // =========================================================
  const VIEW_META = {
    dashboard: ['Tổng quan', 'Tình hình tài chính trong tháng'],
    transactions: ['Giao dịch', 'Tất cả khoản thu chi trong tháng'],
    savings: ['Tiết kiệm', 'Quỹ tiết kiệm và các mục tiêu của gia đình'],
    settings: ['Cài đặt', 'Thành viên, ngân sách và sao lưu dữ liệu'],
  };

  function switchView(v) {
    currentView = v;
    $$('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.view === v));
    $$('.view').forEach((s) => s.classList.toggle('active', s.id === 'view-' + v));
    $('#view-title').textContent = VIEW_META[v][0];
    $('#view-sub').textContent = VIEW_META[v][1];
    $('.month-picker').style.visibility = v === 'settings' ? 'hidden' : 'visible';
    window.scrollTo({ top: 0, behavior: 'smooth' });
    renderView();
  }

  function renderView() {
    $('#month-label').textContent = monthName(viewY, viewM);
    if (currentView === 'dashboard') renderDashboard();
    else if (currentView === 'transactions') renderTransactions();
    else if (currentView === 'savings') renderSavings();
    else renderSettings();
  }

  // ---------- Dashboard ----------
  function deltaHtml(cur, prev, upIsBad) {
    if (!prev) return '<span class="muted">Chưa có dữ liệu tháng trước</span>';
    const p = ((cur - prev) / prev) * 100;
    const up = p >= 0;
    const cls = up === upIsBad ? 'up-bad' : 'down-good';
    return `<span class="${cls}">${up ? '▲' : '▼'} ${Math.abs(p).toFixed(0)}%</span> so với tháng trước`;
  }

  function renderDashboard() {
    const list = txOfMonth(viewY, viewM);
    const [py, pm] = shiftMonth(viewY, viewM, -1);
    const prev = txOfMonth(py, pm);
    const inc = sumBy(list, 'income');
    const exp = sumBy(list, 'expense');
    const pInc = sumBy(prev, 'income');
    const pExp = sumBy(prev, 'expense');
    const monthEnd = `${mkey(viewY, viewM)}-${pad(daysIn(viewY, viewM))}`;
    const depMonth = state.deposits.filter((d) => d.date.startsWith(mkey(viewY, viewM))).reduce((s, d) => s + d.amount, 0);

    $('#kpi-income').textContent = fmt(inc);
    $('#kpi-expense').textContent = fmt(exp);
    $('#kpi-balance').textContent = fmt(inc - exp);
    $('#kpi-balance').style.color = inc - exp < 0 ? 'var(--bad)' : '';
    $('#kpi-saving').textContent = fmt(totalSaving(monthEnd));
    $('#kpi-income-delta').innerHTML = deltaHtml(inc, pInc, false);
    $('#kpi-expense-delta').innerHTML = deltaHtml(exp, pExp, true);
    $('#kpi-balance-note').textContent = inc ? `Đã chi ${Math.round((exp / inc) * 100)}% thu nhập` : '';
    $('#kpi-saving-note').innerHTML = depMonth
      ? `<span class="${depMonth > 0 ? 'down-good' : 'up-bad'}">${depMonth > 0 ? '+' : ''}${fmt(depMonth)}</span> trong tháng`
      : 'Chưa gửi thêm tháng này';

    // Ngân sách
    const bc = $('#budget-card');
    if (state.budget > 0) {
      bc.style.display = '';
      const pct = (exp / state.budget) * 100;
      $('#budget-text').textContent = `· ${fmt(exp)} / ${fmt(state.budget)}`;
      const bar = $('#budget-bar');
      bar.style.width = Math.min(pct, 100) + '%';
      bar.style.background = pct > 100 ? 'var(--bad)' : pct > 85 ? 'var(--s4)' : 'var(--accent)';
      const badge = $('#budget-badge');
      badge.className = 'badge ' + (pct > 100 ? 'over' : pct > 85 ? 'warn' : 'ok');
      badge.textContent = pct > 100
        ? `⛔ Vượt ${fmt(exp - state.budget)}`
        : pct > 85 ? `⚠️ Đã dùng ${pct.toFixed(0)}%` : `✓ Còn ${fmt(state.budget - exp)}`;
    } else {
      bc.style.display = 'none';
    }

    renderDonut(list, exp);
    renderBar();
    renderLine();
    renderRecent(list);
  }

  function renderDonut(list, total) {
    const th = chartTheme();
    // gộp theo danh mục; các danh mục màu xám gộp vào "Khác"
    const map = new Map();
    list.filter((t) => t.type === 'expense').forEach((t) => {
      const c = catById(t.category);
      const key = c.color === 's-other' ? 'khac' : c.id;
      map.set(key, (map.get(key) || 0) + t.amount);
    });
    const order = EXPENSE_CATS.filter((c) => c.color !== 's-other').map((c) => c.id).concat('khac');
    const items = order.filter((k) => map.get(k)).map((k) => {
      const c = catById(k);
      return { id: k, name: k === 'khac' ? 'Khác' : c.name, icon: c.icon, color: cssVar(c.color), value: map.get(k) };
    });
    // legend sắp xếp theo giá trị, màu vẫn theo danh mục
    const sorted = [...items].sort((a, b) => b.value - a.value);

    $('#donut-total').textContent = fmtShort(total) + (total >= 1000 ? '' : ' ₫');
    $('#donut-sub').textContent = items.length ? `${items.length} danh mục` : '';
    $('#cat-legend').innerHTML = sorted.length
      ? sorted.map((i) => `<li><i class="sw" style="background:${i.color}"></i><span>${i.icon} ${i.name}</span><span class="amt">${fmt(i.value)}</span><span class="pct">${((i.value / total) * 100).toFixed(0)}%</span></li>`).join('')
      : '<li class="empty" style="display:block"><span class="big">🧾</span>Chưa có khoản chi nào trong tháng</li>';

    makeChart('chart-donut', {
      type: 'doughnut',
      data: {
        labels: items.length ? items.map((i) => i.name) : ['Trống'],
        datasets: [{
          data: items.length ? items.map((i) => i.value) : [1],
          backgroundColor: items.length ? items.map((i) => i.color) : [cssVar('surface-2')],
          borderColor: th.surface,
          borderWidth: 2,
          borderRadius: 4,
          hoverOffset: 8,
        }],
      },
      options: {
        cutout: '70%',
        maintainAspectRatio: false,
        layout: { padding: 8 },
        animation: { animateRotate: true, duration: 900, easing: 'easeOutQuart' },
        plugins: {
          legend: { display: false },
          tooltip: items.length ? {
            ...th.tooltip,
            callbacks: { label: (c) => ` ${c.label}: ${fmt(c.raw)} (${((c.raw / total) * 100).toFixed(1)}%)` },
          } : { enabled: false },
        },
      },
    });
  }

  function renderBar() {
    const th = chartTheme();
    const labels = [], inc = [], exp = [];
    for (let k = -5; k <= 0; k++) {
      const [y, m] = shiftMonth(viewY, viewM, k);
      const l = txOfMonth(y, m);
      labels.push(`T${m + 1}/${String(y).slice(2)}`);
      inc.push(sumBy(l, 'income'));
      exp.push(sumBy(l, 'expense'));
    }
    makeChart('chart-bar', {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Thu', data: inc, backgroundColor: cssVar('s-income'), borderRadius: { topLeft: 4, topRight: 4 }, borderSkipped: 'bottom', maxBarThickness: 22, categoryPercentage: 0.6, barPercentage: 0.9 },
          { label: 'Chi', data: exp, backgroundColor: cssVar('s-expense'), borderRadius: { topLeft: 4, topRight: 4 }, borderSkipped: 'bottom', maxBarThickness: 22, categoryPercentage: 0.6, barPercentage: 0.9 },
        ],
      },
      options: {
        maintainAspectRatio: false,
        animation: { duration: 800, easing: 'easeOutQuart' },
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: { grid: { display: false }, border: { color: th.axis } },
          y: { beginAtZero: true, grid: { color: th.grid }, border: { display: false }, ticks: { callback: fmtShort, maxTicksLimit: 5 } },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            ...th.tooltip,
            callbacks: {
              label: (c) => ` ${c.dataset.label}: ${fmt(c.raw)}`,
              footer: (items) => { const d = (items[0]?.raw || 0) - (items[1]?.raw || 0); return `Chênh lệch: ${d >= 0 ? '+' : ''}${fmt(d)}`; },
            },
            footerColor: th.text,
          },
        },
      },
    });
  }

  function cumulative(y, m, limitDay) {
    const days = daysIn(y, m);
    const perDay = new Array(days).fill(0);
    txOfMonth(y, m).filter((t) => t.type === 'expense').forEach((t) => {
      perDay[Number(t.date.slice(8, 10)) - 1] += t.amount;
    });
    let run = 0;
    return perDay.map((v, i) => { run += v; return limitDay && i + 1 > limitDay ? null : run; });
  }

  function renderLine() {
    const th = chartTheme();
    const days = daysIn(viewY, viewM);
    const isCurrent = viewY === now.getFullYear() && viewM === now.getMonth();
    const cur = cumulative(viewY, viewM, isCurrent ? now.getDate() : 0);
    const [py, pm] = shiftMonth(viewY, viewM, -1);
    const prev = cumulative(py, pm).slice(0, days);
    const expColor = cssVar('s-expense');
    const labels = Array.from({ length: days }, (_, i) => i + 1);

    // gradient fill
    const canvas = document.getElementById('chart-line');
    const g = canvas.getContext('2d').createLinearGradient(0, 0, 0, 260);
    g.addColorStop(0, expColor + '40');
    g.addColorStop(1, expColor + '00');

    makeChart('chart-line', {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Tháng này', data: cur, borderColor: expColor, backgroundColor: g, fill: true, borderWidth: 2, tension: 0.3, pointRadius: 0, pointHoverRadius: 5, pointHoverBorderColor: th.surface, pointHoverBorderWidth: 2, pointHoverBackgroundColor: expColor },
          { label: 'Tháng trước', data: prev, borderColor: cssVar('muted'), borderDash: [5, 4], borderWidth: 2, tension: 0.3, pointRadius: 0, pointHoverRadius: 4, fill: false },
        ],
      },
      options: {
        maintainAspectRatio: false,
        animation: { duration: 900 },
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: { grid: { display: false }, border: { color: th.axis }, ticks: { maxTicksLimit: 8, maxRotation: 0, callback: (v, i) => labels[i] } },
          y: { beginAtZero: true, grid: { color: th.grid }, border: { display: false }, ticks: { callback: fmtShort, maxTicksLimit: 5 } },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            ...th.tooltip,
            callbacks: {
              title: (items) => `Ngày ${items[0].label}`,
              label: (c) => c.raw == null ? null : ` ${c.dataset.label}: ${fmt(c.raw)}`,
            },
          },
        },
      },
      plugins: [crosshairPlugin],
    });
  }

  // vạch dọc khi rê chuột
  const crosshairPlugin = {
    id: 'crosshair',
    afterDatasetsDraw(chart) {
      const a = chart.tooltip && chart.tooltip.getActiveElements();
      if (!a || !a.length) return;
      const x = a[0].element.x;
      const { top, bottom } = chart.chartArea;
      const ctx = chart.ctx;
      ctx.save();
      ctx.strokeStyle = cssVar('axis');
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke();
      ctx.restore();
    },
  };

  function txItemHtml(t) {
    const c = catById(t.category);
    const isIn = t.type === 'income';
    const color = isIn ? 'var(--s-income)' : `var(--${c.color})`;
    const d = new Date(t.date + 'T00:00:00');
    return `<li class="tx-item" data-tx="${t.id}">
      <div class="tx-icon" style="background:color-mix(in srgb, ${color} 16%, transparent)">${c.icon}</div>
      <div style="min-width:0">
        <div class="tx-title">${esc(t.note) || c.name}</div>
        <div class="tx-meta">${c.name} · ${esc(memberName(t.member))} · ${pad(d.getDate())}/${pad(d.getMonth() + 1)}</div>
      </div>
      <div class="tx-amt ${isIn ? 'in' : ''}">${isIn ? '+' : '−'}${fmt(t.amount)}</div>
    </li>`;
  }

  function renderRecent(list) {
    const items = [...list].sort((a, b) => b.date.localeCompare(a.date) || b.created - a.created).slice(0, 6);
    $('#recent-list').innerHTML = items.length
      ? items.map(txItemHtml).join('')
      : `<li class="empty"><span class="big">✍️</span>Chưa có giao dịch. Bấm <b>＋ Thêm giao dịch</b> để bắt đầu,<br/>hoặc vào Cài đặt → tạo dữ liệu mẫu để xem thử.</li>`;
  }

  // ---------- Transactions ----------
  function renderTransactions() {
    const fCat = $('#f-cat');
    if (fCat.options.length <= 1) {
      fCat.innerHTML = '<option value="">Tất cả danh mục</option>' +
        '<optgroup label="Khoản chi">' + EXPENSE_CATS.map((c) => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join('') + '</optgroup>' +
        '<optgroup label="Khoản thu">' + INCOME_CATS.map((c) => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join('') + '</optgroup>';
    }
    const fMem = $('#f-member');
    const keepMem = fMem.value;
    fMem.innerHTML = '<option value="">Cả nhà</option>' + state.members.map((m, i) => `<option value="${i}">${esc(m)}</option>`).join('');
    fMem.value = keepMem;

    const q = $('#f-search').value.trim().toLowerCase();
    const type = $('#f-type').value;
    const cat = fCat.value;
    const mem = fMem.value;
    const list = txOfMonth(viewY, viewM)
      .filter((t) => (!type || t.type === type) && (!cat || t.category === cat) && (mem === '' || String(t.member) === mem) &&
        (!q || (t.note || '').toLowerCase().includes(q) || catById(t.category).name.toLowerCase().includes(q)))
      .sort((a, b) => b.date.localeCompare(a.date) || b.created - a.created);

    const inc = sumBy(list, 'income'), exp = sumBy(list, 'expense');
    $('#tx-summary').innerHTML = `<span>${list.length} giao dịch</span><span>Thu: <b class="pos">+${fmt(inc)}</b></span><span>Chi: <b class="neg">−${fmt(exp)}</b></span>`;

    if (!list.length) {
      $('#tx-list').innerHTML = '<li class="empty"><span class="big">🔍</span>Không có giao dịch nào phù hợp</li>';
      return;
    }
    let html = '', lastDay = '';
    const dayFmt = new Intl.DateTimeFormat('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit' });
    list.forEach((t) => {
      if (t.date !== lastDay) {
        lastDay = t.date;
        const dayList = list.filter((x) => x.date === t.date);
        const net = sumBy(dayList, 'income') - sumBy(dayList, 'expense');
        html += `<li class="tx-day"><span>${dayFmt.format(new Date(t.date + 'T00:00:00'))}</span><span>${net >= 0 ? '+' : '−'}${fmt(Math.abs(net))}</span></li>`;
      }
      html += txItemHtml(t);
    });
    $('#tx-list').innerHTML = html;
  }

  // ---------- Savings ----------
  function goalSaved(id) {
    return state.deposits.filter((d) => d.goalId === id).reduce((s, d) => s + d.amount, 0);
  }

  function renderSavings() {
    const th = chartTheme();
    const k = mkey(viewY, viewM);
    const monthEnd = `${k}-${pad(daysIn(viewY, viewM))}`;
    const total = totalSaving(monthEnd);
    const depM = state.deposits.filter((d) => d.date.startsWith(k)).reduce((s, d) => s + d.amount, 0);
    const inc = sumBy(txOfMonth(viewY, viewM), 'income');
    $('#sv-total').textContent = fmt(total);
    $('#sv-month').textContent = (depM > 0 ? '+' : '') + fmt(depM);
    $('#sv-rate').textContent = inc ? Math.round((depM / inc) * 100) + '%' : '—';

    // chart 12 tháng
    const labels = [], data = [], added = [];
    for (let i = -11; i <= 0; i++) {
      const [y, m] = shiftMonth(viewY, viewM, i);
      labels.push(`T${m + 1}/${String(y).slice(2)}`);
      data.push(totalSaving(`${mkey(y, m)}-${pad(daysIn(y, m))}`));
      added.push(state.deposits.filter((d) => d.date.startsWith(mkey(y, m))).reduce((s, d) => s + d.amount, 0));
    }
    const col = cssVar('s-saving');
    const g = document.getElementById('chart-saving').getContext('2d').createLinearGradient(0, 0, 0, 300);
    g.addColorStop(0, col + '55');
    g.addColorStop(1, col + '00');
    makeChart('chart-saving', {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Tổng tiết kiệm', data, borderColor: col, backgroundColor: g, fill: true, borderWidth: 2, tension: 0.35,
          pointRadius: 4, pointBackgroundColor: col, pointBorderColor: th.surface, pointBorderWidth: 2, pointHoverRadius: 7,
        }],
      },
      options: {
        maintainAspectRatio: false,
        animation: { duration: 1000, easing: 'easeOutQuart' },
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: { grid: { display: false }, border: { color: th.axis } },
          y: { beginAtZero: true, grid: { color: th.grid }, border: { display: false }, ticks: { callback: fmtShort, maxTicksLimit: 5 } },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            ...th.tooltip,
            callbacks: {
              label: (c) => ` Tổng: ${fmt(c.raw)}`,
              afterLabel: (c) => { const a = added[c.dataIndex]; return a ? ` Trong tháng: ${a > 0 ? '+' : ''}${fmt(a)}` : ''; },
            },
          },
        },
      },
      plugins: [crosshairPlugin],
    });

    // goals
    $('#goals').innerHTML = state.goals.length
      ? state.goals.map((g2) => {
        const saved = goalSaved(g2.id);
        const pct = g2.target ? Math.min((saved / g2.target) * 100, 100) : 0;
        let dl = '';
        if (g2.deadline) {
          const months = Math.max(1, Math.round((new Date(g2.deadline) - now) / (30.4 * 864e5)));
          const remain = Math.max(0, g2.target - saved);
          dl = remain > 0 ? `Cần ~${fmt(remain / months)}/tháng · hạn ${g2.deadline.split('-').reverse().join('/')}` : '🎉 Đã đạt mục tiêu!';
        } else if (saved >= g2.target) dl = '🎉 Đã đạt mục tiêu!';
        return `<div class="card goal" data-goal="${g2.id}">
          <div class="goal-top"><div class="goal-icon">${g2.icon}</div>
            <div style="min-width:0"><div class="goal-name">${esc(g2.name)}</div><div class="muted small">${dl || 'Mục tiêu: ' + fmt(g2.target)}</div></div></div>
          <div class="progress"><div class="progress-bar" style="width:${pct}%"></div></div>
          <div class="goal-amt"><span><b>${fmt(saved)}</b></span><span>${pct.toFixed(0)}% / ${fmtShort(g2.target)}</span></div>
        </div>`;
      }).join('')
      : '<div class="card empty" style="grid-column:1/-1"><span class="big">🐷</span>Chưa có mục tiêu nào. Tạo mục tiêu đầu tiên như “Quỹ khẩn cấp” hoặc “Mua nhà”.</div>';

    // history
    const deps = [...state.deposits].sort((a, b) => b.date.localeCompare(a.date) || b.created - a.created).slice(0, 30);
    $('#deposit-list').innerHTML = deps.length
      ? deps.map((d) => {
        const goal = state.goals.find((x) => x.id === d.goalId);
        const isIn = d.amount >= 0;
        return `<li class="tx-item" data-dep="${d.id}">
          <div class="tx-icon" style="background:color-mix(in srgb, var(--s-saving) 16%, transparent)">${goal ? goal.icon : '🐷'}</div>
          <div style="min-width:0"><div class="tx-title">${esc(d.note) || (isIn ? 'Gửi tiết kiệm' : 'Rút tiết kiệm')}</div>
          <div class="tx-meta">${goal ? esc(goal.name) : 'Không rõ'} · ${esc(memberName(d.member))} · ${d.date.split('-').reverse().join('/')}</div></div>
          <div class="tx-amt ${isIn ? 'in' : ''}">${isIn ? '+' : '−'}${fmt(Math.abs(d.amount))}</div>
        </li>`;
      }).join('')
      : '<li class="empty">Chưa có lần gửi tiền nào</li>';
  }

  // ---------- Settings ----------
  function renderSettings() {
    $('#m1').value = state.members[0] || '';
    $('#m2').value = state.members[1] || '';
    $('#budget-input').value = state.budget ? nf.format(state.budget) : '';
    $('#backup-note').textContent = mode === 'cloud'
      ? 'Dữ liệu được lưu chung trên mạng và tự đồng bộ: vợ hoặc chồng cập nhật thì người kia thấy ngay. Vẫn nên xuất file sao lưu định kỳ.'
      : 'Dữ liệu được lưu ngay trên trình duyệt này. Hãy xuất file sao lưu thường xuyên, và nhập file đó trên máy của vợ/chồng để dùng chung dữ liệu.';
    $('#account-box').hidden = !fbUser;
    if (fbUser) $('#account-email').textContent = fbUser.email || '';
    let localHas = false;
    try { const raw = localStorage.getItem(STORE_KEY); localHas = !!raw && (JSON.parse(raw).transactions || []).length > 0; } catch (e) { /* ignore */ }
    $('#migrate-btn').hidden = !(mode === 'cloud' && localHas);
  }

  // =========================================================
  // MODALS
  // =========================================================
  function defaultDate() {
    const isCurrent = viewY === now.getFullYear() && viewM === now.getMonth();
    return isCurrent ? ymd(now) : `${mkey(viewY, viewM)}-01`;
  }
  function fillMembers(sel, val) {
    sel.innerHTML = state.members.map((m, i) => `<option value="${i}">${esc(m)}</option>`).join('');
    sel.value = String(val ?? 0);
  }

  // --- Transaction modal ---
  let txEditing = null, txType = 'expense', txCat = 'an';
  function buildCatGrid() {
    const cats = txType === 'income' ? INCOME_CATS : EXPENSE_CATS;
    if (!cats.find((c) => c.id === txCat)) txCat = cats[0].id;
    $('#tx-cat-grid').innerHTML = cats.map((c) =>
      `<button type="button" class="cat-opt ${c.id === txCat ? 'active' : ''}" data-cat="${c.id}"><span class="e">${c.icon}</span>${c.name}</button>`).join('');
    $$('#tx-type-seg button').forEach((b) => b.classList.toggle('active', b.dataset.type === txType));
  }
  function openTx(t) {
    txEditing = t || null;
    txType = t ? t.type : 'expense';
    txCat = t ? t.category : (txType === 'income' ? 'luong' : 'an');
    $('#tx-modal-title').textContent = t ? 'Sửa giao dịch' : 'Thêm giao dịch';
    $('#tx-amount').value = t ? nf.format(t.amount) : '';
    $('#tx-date').value = t ? t.date : defaultDate();
    $('#tx-note').value = t ? t.note || '' : '';
    fillMembers($('#tx-member'), t ? t.member : lastMember());
    $('#tx-delete').hidden = !t;
    buildCatGrid();
    $('#tx-modal').showModal();
    setTimeout(() => $('#tx-amount').focus(), 50);
  }

  // --- Goal modal ---
  let goalEditing = null, goalIcon = GOAL_ICONS[0];
  function openGoal(g) {
    goalEditing = g || null;
    goalIcon = g ? g.icon : GOAL_ICONS[0];
    $('#goal-modal-title').textContent = g ? 'Sửa mục tiêu' : 'Mục tiêu tiết kiệm mới';
    $('#goal-name').value = g ? g.name : '';
    $('#goal-target').value = g ? nf.format(g.target) : '';
    $('#goal-deadline').value = g ? g.deadline || '' : '';
    $('#goal-delete').hidden = !g;
    renderGoalIcons();
    $('#goal-modal').showModal();
  }
  function renderGoalIcons() {
    $('#goal-icons').innerHTML = GOAL_ICONS.map((i) => `<button type="button" class="${i === goalIcon ? 'active' : ''}" data-icon="${i}">${i}</button>`).join('');
  }

  // --- Deposit modal ---
  let depEditing = null, depType = 'in';
  function openDep(d) {
    if (!state.goals.length) { toast('Hãy tạo một mục tiêu tiết kiệm trước'); openGoal(); return; }
    depEditing = d || null;
    depType = d && d.amount < 0 ? 'out' : 'in';
    $$('#dep-type-seg button').forEach((b) => b.classList.toggle('active', b.dataset.type === depType));
    $('#dep-goal').innerHTML = state.goals.map((g) => `<option value="${g.id}">${g.icon} ${esc(g.name)}</option>`).join('');
    if (d) $('#dep-goal').value = d.goalId;
    $('#dep-amount').value = d ? nf.format(Math.abs(d.amount)) : '';
    $('#dep-date').value = d ? d.date : defaultDate();
    $('#dep-note').value = d ? d.note || '' : '';
    fillMembers($('#dep-member'), d ? d.member : lastMember());
    $('#dep-delete').hidden = !d;
    $('#dep-modal').showModal();
  }

  // =========================================================
  // SAMPLE DATA
  // =========================================================
  function makeSample() {
    const rnd = (a, b) => Math.round((a + Math.random() * (b - a)) / 1000) * 1000;
    const tx = [], deps = [];
    const goals = [
      { id: uid(), name: 'Quỹ khẩn cấp', target: 60000000, icon: '🛟', deadline: '' },
      { id: uid(), name: 'Mua nhà', target: 800000000, icon: '🏡', deadline: `${now.getFullYear() + 4}-12-31` },
      { id: uid(), name: 'Du lịch Nhật Bản', target: 40000000, icon: '✈️', deadline: `${now.getFullYear() + 1}-04-30` },
    ];
    const add = (type, category, amount, date, note, member) =>
      tx.push({ id: uid(), type, category, amount, date, note, member, created: Date.now() + tx.length });
    for (let k = -7; k <= 0; k++) {
      const [y, m] = shiftMonth(now.getFullYear(), now.getMonth(), k);
      const last = k === 0 ? now.getDate() : daysIn(y, m);
      const d = (day) => `${mkey(y, m)}-${pad(Math.min(day, last))}`;
      add('income', 'luong', rnd(18e6, 19e6), d(5), 'Lương tháng', 0);
      add('income', 'luong', rnd(13e6, 14e6), d(10), 'Lương tháng', 1);
      if (Math.random() > 0.6) add('income', 'thuong', rnd(2e6, 6e6), d(20), 'Thưởng dự án', Math.random() > 0.5 ? 1 : 0);
      if (Math.random() > 0.5) add('income', 'kinhdoanh', rnd(1e6, 3e6), d(15), 'Bán hàng online', 1);
      add('expense', 'nha', 6500000, d(1), 'Tiền thuê nhà', 0);
      add('expense', 'hoadon', rnd(900e3, 1.4e6), d(8), 'Điện nước, internet', 1);
      add('expense', 'con', rnd(2.5e6, 3.5e6), d(6), 'Học phí của con', 1);
      for (let day = 1; day <= last; day += Math.ceil(Math.random() * 3)) {
        add('expense', 'an', rnd(80e3, 450e3), d(day), ['Đi chợ', 'Ăn sáng', 'Siêu thị', 'Ăn tối ngoài', 'Cà phê'][Math.floor(Math.random() * 5)], Math.random() > 0.5 ? 1 : 0);
        if (Math.random() > 0.7) add('expense', 'dilai', rnd(50e3, 300e3), d(day), 'Xăng xe / Grab', Math.random() > 0.5 ? 1 : 0);
      }
      for (let i = 0; i < 3; i++) add('expense', 'muasam', rnd(200e3, 1.5e6), d(3 + i * 9), ['Quần áo', 'Đồ gia dụng', 'Mỹ phẩm'][i], i === 1 ? 0 : 1);
      if (Math.random() > 0.4) add('expense', 'suckhoe', rnd(150e3, 800e3), d(12), 'Thuốc, khám bệnh', 1);
      add('expense', 'giaitri', rnd(300e3, 1.5e6), d(18), 'Xem phim, đi chơi cuối tuần', 0);
      if (Math.random() > 0.6) add('expense', 'hieuhi', 500000, d(22), 'Đám cưới bạn', 0);
      // tiết kiệm
      deps.push({ id: uid(), goalId: goals[0].id, amount: rnd(3e6, 4e6), date: d(11), note: 'Gửi quỹ khẩn cấp', member: 0, created: Date.now() });
      deps.push({ id: uid(), goalId: goals[1].id, amount: rnd(4e6, 6e6), date: d(12), note: 'Tiết kiệm mua nhà', member: 1, created: Date.now() });
      if (k > -5) deps.push({ id: uid(), goalId: goals[2].id, amount: rnd(1.5e6, 2.5e6), date: d(14), note: 'Quỹ du lịch', member: 1, created: Date.now() });
    }
    deps.forEach((x, i) => { x.created = Date.now() + i; });
    return { members: state.members, budget: state.budget || 18000000, transactions: tx, goals, deposits: deps };
  }

  // =========================================================
  // EVENTS
  // =========================================================
  function bind() {
    $$('.nav-item').forEach((b) => b.addEventListener('click', () => switchView(b.dataset.view)));
    $$('[data-goto]').forEach((b) => b.addEventListener('click', () => switchView(b.dataset.goto)));
    $('#prev-month').addEventListener('click', () => { [viewY, viewM] = shiftMonth(viewY, viewM, -1); renderView(); });
    $('#next-month').addEventListener('click', () => { [viewY, viewM] = shiftMonth(viewY, viewM, 1); renderView(); });

    $$('[data-theme-set]').forEach((b) => b.addEventListener('click', () => setTheme(b.dataset.themeSet)));
    $('#theme-toggle-mobile').addEventListener('click', () => setTheme(effectiveTheme() === 'dark' ? 'light' : 'dark'));
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (!document.documentElement.getAttribute('data-theme')) { syncThemeButtons(); renderView(); }
    });

    // money inputs
    $$('.money').forEach((inp) => inp.addEventListener('input', () => {
      const v = parseMoney(inp.value);
      inp.value = v ? nf.format(v) : '';
    }));

    // close buttons
    $$('[data-close]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));

    // open modals
    $('#add-btn').addEventListener('click', () => openTx());
    document.addEventListener('click', (e) => {
      const tx = e.target.closest('[data-tx]');
      if (tx) { openTx(state.transactions.find((t) => t.id === tx.dataset.tx)); return; }
      const g = e.target.closest('[data-goal]');
      if (g) { openGoal(state.goals.find((x) => x.id === g.dataset.goal)); return; }
      const d = e.target.closest('[data-dep]');
      if (d) openDep(state.deposits.find((x) => x.id === d.dataset.dep));
    });

    // tx modal
    $('#tx-type-seg').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      txType = b.dataset.type; buildCatGrid();
    });
    $('#tx-cat-grid').addEventListener('click', (e) => {
      const b = e.target.closest('[data-cat]'); if (!b) return;
      txCat = b.dataset.cat; buildCatGrid();
    });
    $('#tx-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const amount = parseMoney($('#tx-amount').value);
      if (!amount) { toast('Vui lòng nhập số tiền'); return; }
      const data = { type: txType, category: txCat, amount, date: $('#tx-date').value, note: $('#tx-note').value.trim(), member: Number($('#tx-member').value) };
      rememberMember(data.member);
      const editing = !!txEditing;
      const obj = Object.assign({}, txEditing || { id: uid(), created: Date.now() }, data);
      $('#tx-modal').close();
      // chuyển tới tháng của giao dịch
      const [y, m] = data.date.split('-').map(Number);
      viewY = y; viewM = m - 1;
      if (await upsert('transactions', obj)) { renderView(); toast(editing ? '✓ Đã cập nhật giao dịch' : '✓ Đã thêm giao dịch'); }
    });
    $('#tx-delete').addEventListener('click', async () => {
      if (!txEditing) return;
      const t = txEditing;
      if (!(await askConfirm('Xóa giao dịch này?', 'Xóa'))) return;
      $('#tx-modal').close();
      if (await removeDoc('transactions', t.id)) toast('Đã xóa giao dịch');
    });

    // goal modal
    $('#add-goal-btn').addEventListener('click', () => openGoal());
    $('#goal-icons').addEventListener('click', (e) => {
      const b = e.target.closest('[data-icon]'); if (!b) return;
      goalIcon = b.dataset.icon; renderGoalIcons();
    });
    $('#goal-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const target = parseMoney($('#goal-target').value);
      const name = $('#goal-name').value.trim();
      if (!name || !target) { toast('Vui lòng nhập tên và số tiền mục tiêu'); return; }
      const data = { name, target, icon: goalIcon, deadline: $('#goal-deadline').value };
      const obj = Object.assign({}, goalEditing || { id: uid(), created: Date.now() }, data);
      $('#goal-modal').close();
      if (await upsert('goals', obj)) toast('✓ Đã lưu mục tiêu');
    });
    $('#goal-delete').addEventListener('click', async () => {
      if (!goalEditing) return;
      const g = goalEditing;
      if (!(await askConfirm('Xóa mục tiêu này và toàn bộ lịch sử gửi/rút của nó?', 'Xóa'))) return;
      $('#goal-modal').close();
      for (const d of state.deposits.filter((x) => x.goalId === g.id)) await removeDoc('deposits', d.id);
      if (await removeDoc('goals', g.id)) toast('Đã xóa mục tiêu');
    });

    // deposit modal
    $('#add-deposit-btn').addEventListener('click', () => openDep());
    $('#dep-type-seg').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      depType = b.dataset.type;
      $$('#dep-type-seg button').forEach((x) => x.classList.toggle('active', x === b));
    });
    $('#dep-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const amt = parseMoney($('#dep-amount').value);
      if (!amt) { toast('Vui lòng nhập số tiền'); return; }
      const data = { goalId: $('#dep-goal').value, amount: depType === 'out' ? -amt : amt, date: $('#dep-date').value, note: $('#dep-note').value.trim(), member: Number($('#dep-member').value) };
      rememberMember(data.member);
      const obj = Object.assign({}, depEditing || { id: uid(), created: Date.now() }, data);
      $('#dep-modal').close();
      if (await upsert('deposits', obj)) toast('✓ Đã lưu');
    });
    $('#dep-delete').addEventListener('click', async () => {
      if (!depEditing) return;
      const d = depEditing;
      if (!(await askConfirm('Xóa lần gửi/rút này?', 'Xóa'))) return;
      $('#dep-modal').close();
      if (await removeDoc('deposits', d.id)) toast('Đã xóa');
    });

    // filters
    ['#f-search', '#f-type', '#f-cat', '#f-member'].forEach((s) => $(s).addEventListener('input', renderTransactions));

    // settings
    $('#save-settings').addEventListener('click', async () => {
      const members = [$('#m1').value.trim() || 'Chồng', $('#m2').value.trim() || 'Vợ'];
      if (await saveSettingsData(members, parseMoney($('#budget-input').value))) toast('✓ Đã lưu cài đặt');
    });
    $('#export-btn').addEventListener('click', () => {
      download(`so-thu-chi-${ymd(new Date())}.json`, JSON.stringify(state, null, 2), 'application/json');
    });
    $('#export-csv-btn').addEventListener('click', () => {
      const rows = [['Ngày', 'Loại', 'Danh mục', 'Số tiền', 'Ghi chú', 'Người ghi']];
      [...state.transactions].sort((a, b) => a.date.localeCompare(b.date)).forEach((t) =>
        rows.push([t.date, t.type === 'income' ? 'Thu' : 'Chi', catById(t.category).name, t.amount, t.note || '', memberName(t.member)]));
      const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
      download(`giao-dich-${ymd(new Date())}.csv`, '﻿' + csv, 'text/csv');
    });
    $('#import-file').addEventListener('change', (e) => {
      const f = e.target.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = async () => {
        e.target.value = '';
        let data;
        try {
          data = JSON.parse(r.result);
          if (!Array.isArray(data.transactions)) throw new Error('bad');
        } catch (err) { toast('⚠️ File không hợp lệ, hãy chọn file .json đã xuất từ ứng dụng này'); return; }
        if (!(await askConfirm('Nhập dữ liệu sẽ THAY THẾ toàn bộ dữ liệu hiện tại của cả nhà. Tiếp tục?', 'Nhập và thay thế'))) return;
        if (await replaceAll(data)) toast('✓ Đã nhập dữ liệu');
      };
      r.readAsText(f);
    });
    $('#sample-btn').addEventListener('click', async () => {
      if (state.transactions.length && !(await askConfirm('Dữ liệu mẫu sẽ THAY THẾ toàn bộ dữ liệu hiện tại. Tiếp tục?', 'Tạo dữ liệu mẫu'))) return;
      viewY = now.getFullYear(); viewM = now.getMonth();
      if (await replaceAll(makeSample())) { switchView('dashboard'); toast('✨ Đã tạo dữ liệu mẫu'); }
    });
    $('#migrate-btn').addEventListener('click', async () => {
      let local;
      try { local = JSON.parse(localStorage.getItem(STORE_KEY)); } catch (e) { local = null; }
      if (!local || !Array.isArray(local.transactions)) { toast('Không tìm thấy dữ liệu trên máy này'); return; }
      const msg = `Đưa ${local.transactions.length} giao dịch, ${(local.goals || []).length} mục tiêu trên máy này lên kho chung? Dữ liệu đang có trong kho chung sẽ bị THAY THẾ.`;
      if (!(await askConfirm(msg, 'Đưa lên kho chung'))) return;
      if (await replaceAll(Object.assign(defaultState(), local))) {
        try { localStorage.removeItem(STORE_KEY); } catch (e) { /* ignore */ }
        toast('✓ Đã đưa dữ liệu lên kho chung'); renderView();
      }
    });
    $('#reset-btn').addEventListener('click', async () => {
      if (!(await askConfirm('Xóa TOÀN BỘ giao dịch, mục tiêu và tiền tiết kiệm? Không thể hoàn tác nếu chưa xuất file sao lưu.', 'Xóa toàn bộ'))) return;
      if (await replaceAll({ members: state.members, budget: state.budget, transactions: [], goals: [], deposits: [] })) toast('Đã xóa toàn bộ dữ liệu');
    });
  }

  // Ghi nhớ "người ghi" mặc định trên từng máy (vợ dùng máy vợ, chồng dùng máy chồng)
  function rememberMember(i) { try { localStorage.setItem('sm-member', String(i)); } catch (e) { /* ignore */ } }
  function lastMember() { try { return Number(localStorage.getItem('sm-member')) || 0; } catch (e) { return 0; } }

  async function download(name, content, type) {
    if (IN_ARTIFACT) {
      let dl = null;
      try { dl = await window.claude.use('downloads'); } catch (e) { dl = null; }
      if (dl) {
        try { await dl.save({ filename: name, data: content }); toast('✓ Đã tải file'); }
        catch (e) { if (!e || e.code !== 'declined') toast('⚠️ Không tải được file ở đây'); }
        return;
      }
    }
    const blob = new Blob([content], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ---------- Init ----------
  bind();
  syncThemeButtons();
  switchView('dashboard');
  initStore();
})();
