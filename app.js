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
    el.title = s === 'slow' || s === 'error'
      ? 'Kiểm tra: máy có mạng không; trình chặn quảng cáo có chặn firestore.googleapis.com không; trên Firebase đã tạo Firestore Database chưa.'
      : '';
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
    const ONLINE_URL = 'https://nghluan107.github.io/SaveMoney/';
    const loginError = (e) => {
      const code = (e && e.code) || 'unknown';
      const hint = code === 'auth/unauthorized-domain'
        ? 'Tên miền này chưa được thêm vào Firebase → Authentication → Settings → Authorized domains.'
        : 'Đăng nhập không thành công, hãy thử lại.';
      showLogin(hint + ' (Mã lỗi: ' + code + ')');
    };
    $('#login-btn').addEventListener('click', async () => {
      if (location.protocol === 'file:') {
        showLogin('Google không cho đăng nhập khi mở file trên máy. Hãy mở web tại ' + ONLINE_URL);
        return;
      }
      try { await auth.signInWithPopup(provider); }
      catch (e) {
        if (e && (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment')) {
          auth.signInWithRedirect(provider).catch(loginError);
        } else if (e && e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') {
          loginError(e);
        }
      }
    });
    auth.getRedirectResult().catch(loginError);
    $('#login-switch').addEventListener('click', () => auth.signOut());
    let loggedOut = false;
    const logout = async () => {
      if ($('#profile-modal').open) $('#profile-modal').close();
      if (await askConfirm('Đăng xuất khỏi tài khoản này?', 'Đăng xuất')) { loggedOut = true; auth.signOut(); }
    };
    $('#logout-btn').addEventListener('click', logout);
    $('#pf-logout').addEventListener('click', logout);

    auth.onAuthStateChanged((user) => {
      unsubs.forEach((u) => u()); unsubs = [];
      fbUser = user;
      if (!user) {
        stopSocial();
        mode = 'local'; state = defaultState(); renderView();
        showLogin(loggedOut
          ? '👋 Bạn đã đăng xuất. Đăng nhập lại để tiếp tục ghi chép thu chi của gia đình.'
          : 'Đăng nhập để xem và ghi chép thu chi chung của gia đình.');
        loggedOut = false;
        return;
      }
      $('#login-screen').hidden = true;
      mode = 'cloud';
      state = defaultState();
      subscribeAll();
      startSocial(user);
      renderView();
    });
  }

  function subscribeAll() {
    setSync('loading');
    const pending = new Set([...COLLS, 'settings']);
    const timer = setTimeout(() => setSync('slow'), 10000);
    const done = (name, snap) => {
      if (snap.metadata.fromCache || !pending.has(name)) return;
      pending.delete(name);
      if (!pending.size) { clearTimeout(timer); setSync(canWrite ? 'cloud' : 'readonly'); }
    };
    const onErr = (e) => {
      clearTimeout(timer);
      if (USE_FIREBASE && e && e.code === 'permission-denied') {
        unsubs.forEach((u) => u()); unsubs = [];
        stopSocial();
        showLogin(`Tài khoản ${fbUser ? fbUser.email : ''} không có quyền xem sổ thu chi này. Hãy đăng nhập bằng email của chồng hoặc vợ.`, { hideButton: true, showSwitch: true });
        return;
      }
      setSync('error');
    };
    // Firebase: cần includeMetadataChanges để biết khi dữ liệu đã được máy chủ xác nhận
    // (nếu không, khi dữ liệu trên máy giống máy chủ thì không có sự kiện nào báo "đã kết nối").
    const listen = (ref, onNext) => (USE_FIREBASE
      ? ref.onSnapshot({ includeMetadataChanges: true }, onNext, onErr)
      : ref.onSnapshot(onNext, onErr));
    COLLS.forEach((name) => {
      unsubs.push(listen(db.collection(name), (snap) => {
        state[name] = snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
        done(name, snap);
        scheduleRender();
      }));
    });
    unsubs.push(listen(db.doc('settings/main'), (snap) => {
      const d = snap.exists ? snap.data() : {};
      state.members = Array.isArray(d.members) && d.members.length ? [...d.members] : ['Chồng', 'Vợ'];
      state.budget = Number(d.budget) || 0;
      done('settings', snap);
      scheduleRender();
    }));
  }

  // =========================================================
  // HỒ SƠ & NHẮN TIN (chỉ khi đăng nhập Firebase)
  // =========================================================
  let profiles = {};       // uid -> hồ sơ
  let messages = [];       // tin nhắn, cũ -> mới
  let socialUnsubs = [];
  let chatReady = false;   // đã nhận lần tải đầu (để không báo tin cũ là tin mới)
  const ROLE_NAME = { chong: 'Chồng', vo: 'Vợ' };
  const readKey = () => 'sm-chat-read-' + (fbUser ? fbUser.uid : '');
  const getLastRead = () => { try { return Number(localStorage.getItem(readKey())) || 0; } catch (e) { return 0; } };
  const setLastRead = (t) => { try { localStorage.setItem(readKey(), String(t)); } catch (e) { /* ignore */ } };

  function myProfile() {
    if (!fbUser) return {};
    return profiles[fbUser.uid] || { name: fbUser.displayName || '', email: fbUser.email, photoURL: fbUser.photoURL || '' };
  }
  function partnerProfile() {
    if (!fbUser) return null;
    const uid = Object.keys(profiles).find((u) => u !== fbUser.uid);
    return uid ? Object.assign({ uid }, profiles[uid]) : null;
  }
  function displayName(uid, fallback) {
    const p = profiles[uid];
    return (p && p.name) || fallback || 'Không rõ';
  }
  function initials(name) {
    const parts = String(name || '?').trim().split(/\s+/);
    return (parts[parts.length - 1] || '?').charAt(0).toUpperCase();
  }
  function avatarHtml(p) {
    const name = (p && p.name) || '?';
    return p && p.photoURL
      ? `<img src="${esc(p.photoURL)}" alt="" referrerpolicy="no-referrer" />`
      : esc(initials(name));
  }
  // Tuổi và số ngày tới sinh nhật
  function ageInfo(bday) {
    if (!bday) return '';
    const [y, m, d] = bday.split('-').map(Number);
    const t = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let age = t.getFullYear() - y - (t < new Date(t.getFullYear(), m - 1, d) ? 1 : 0);
    let next = new Date(t.getFullYear(), m - 1, d);
    if (next < t) next = new Date(t.getFullYear() + 1, m - 1, d);
    const days = Math.round((next - t) / 864e5);
    const bd = days === 0 ? '🎉 Hôm nay là sinh nhật!' : `🎂 Sinh nhật sau ${days} ngày`;
    return age >= 0 && age < 150 ? `${age} tuổi · ${bd}` : '';
  }

  function startSocial(user) {
    stopSocial();
    if (!USE_FIREBASE) return;
    $('#user-btn').hidden = false;
    $('#chat-fab').hidden = false;
    renderUserButton();
    const warn = (e) => console.warn('Hồ sơ / tin nhắn:', e && e.code);
    socialUnsubs.push(db.collection('profiles').onSnapshot((snap) => {
      profiles = {};
      snap.docs.forEach((d) => { profiles[d.id] = d.data(); });
      // Lần đầu đăng nhập: tạo hồ sơ từ tài khoản Google
      if (!snap.metadata.fromCache && !profiles[user.uid]) {
        write(db.collection('profiles').doc(user.uid).set({
          name: user.displayName || '', email: user.email || '', photoURL: user.photoURL || '', role: '', updated: Date.now(),
        }, { merge: true }));
      } else if (profiles[user.uid] && user.photoURL && profiles[user.uid].photoURL !== user.photoURL) {
        write(db.collection('profiles').doc(user.uid).set({ photoURL: user.photoURL }, { merge: true }));
      }
      renderUserButton();
      renderChat();
      if ($('#profile-modal').open) renderPartnerCard();
    }, warn));
    socialUnsubs.push(db.collection('messages').orderBy('clientTime', 'desc').limit(200).onSnapshot((snap) => {
      const prevIds = new Set(messages.map((m) => m.id));
      messages = snap.docs.map((d) => Object.assign({ id: d.id, pending: d.metadata.hasPendingWrites }, d.data())).reverse();
      if (chatReady && $('#chat-panel').hidden) {
        const fresh = messages.filter((m) => !prevIds.has(m.id) && m.uid !== user.uid);
        if (fresh.length) toast(`💬 ${displayName(fresh[0].uid, fresh[0].name)}: ${fresh[fresh.length - 1].text.slice(0, 60)}`);
      }
      chatReady = true;
      renderChat();
    }, warn));
  }
  function stopSocial() {
    socialUnsubs.forEach((u) => u()); socialUnsubs = [];
    profiles = {}; messages = []; chatReady = false;
    const hide = (s) => { const el = document.querySelector(s); if (el) el.hidden = true; };
    hide('#user-btn'); hide('#chat-fab'); hide('#chat-panel');
    document.body.classList.remove('chat-open');
    const pm = document.getElementById('profile-modal');
    if (pm && pm.open) pm.close();
  }

  function renderUserButton() {
    const p = myProfile();
    $('#user-avatar').innerHTML = avatarHtml(p);
    $('#user-btn').title = (p.name || 'Hồ sơ của tôi') + (p.email ? ' · ' + p.email : '');
  }

  // ---------- Hồ sơ ----------
  function openProfile() {
    const p = myProfile();
    $('#pf-avatar').innerHTML = avatarHtml(p);
    $('#pf-title').textContent = p.name || 'Hồ sơ của tôi';
    $('#pf-email').textContent = (fbUser && fbUser.email) || '';
    $('#pf-name').value = p.name || '';
    $('#pf-role').value = p.role || '';
    $('#pf-birthday').value = p.birthday || '';
    $('#pf-phone').value = p.phone || '';
    $('#pf-job').value = p.job || '';
    $('#pf-hometown').value = p.hometown || '';
    $('#pf-note').value = p.note || '';
    updateAge();
    renderPartnerCard();
    $('#profile-modal').showModal();
  }
  function updateAge() {
    const t = ageInfo($('#pf-birthday').value);
    $('#pf-age').hidden = !t;
    $('#pf-age').textContent = t;
  }
  function renderPartnerCard() {
    const q = partnerProfile();
    const box = $('#pf-partner');
    box.hidden = !q;
    if (!q) return;
    const rows = [
      ['Vai trò', ROLE_NAME[q.role]], ['Ngày sinh', q.birthday && fmtDate(q.birthday) + (ageInfo(q.birthday) ? ' · ' + ageInfo(q.birthday) : '')],
      ['Điện thoại', q.phone], ['Nghề nghiệp', q.job], ['Quê quán', q.hometown], ['Email', q.email], ['Ghi chú', q.note],
    ].filter((r) => r[1]);
    box.innerHTML = `<div class="p-top"><span class="avatar">${avatarHtml(q)}</span>
        <div><b>${esc(q.name || 'Chưa đặt tên')}</b><div class="muted small">${q.role === 'vo' ? 'Hồ sơ của vợ' : q.role === 'chong' ? 'Hồ sơ của chồng' : 'Người còn lại trong gia đình'}</div></div></div>
      <dl>${rows.map((r) => `<dt>${r[0]}</dt><dd>${esc(r[1])}</dd>`).join('') || '<dd class="muted">Chưa cập nhật thông tin</dd>'}</dl>`;
  }
  async function saveProfile() {
    const data = {
      name: $('#pf-name').value.trim(), role: $('#pf-role').value, birthday: $('#pf-birthday').value,
      phone: $('#pf-phone').value.trim(), job: $('#pf-job').value.trim(), hometown: $('#pf-hometown').value.trim(),
      note: $('#pf-note').value.trim(), email: fbUser.email || '', photoURL: fbUser.photoURL || '', updated: Date.now(),
    };
    if (!data.name) { toast('Vui lòng nhập họ tên'); return; }
    $('#profile-modal').close();
    await write(db.collection('profiles').doc(fbUser.uid).set(data, { merge: true }));
    // Đồng bộ tên vào danh sách thành viên (Chồng = người thứ 1, Vợ = người thứ 2)
    const idx = data.role === 'chong' ? 0 : data.role === 'vo' ? 1 : -1;
    if (idx >= 0 && state.members[idx] !== data.name) {
      const members = [...state.members];
      members[idx] = data.name;
      await saveSettingsData(members, state.budget);
    }
    toast('✓ Đã lưu hồ sơ');
  }

  // ---------- Nhắn tin ----------
  function msgTime(m) { return new Date(m.clientTime || Date.now()); }
  function renderChat() {
    const fab = document.getElementById('chat-fab');
    if (!fab || !fbUser) return;
    const open = !$('#chat-panel').hidden;
    if (open && messages.length) setLastRead(Math.max(getLastRead(), messages[messages.length - 1].clientTime || 0));
    const lastRead = getLastRead();
    const unread = messages.filter((m) => m.uid !== fbUser.uid && (m.clientTime || 0) > lastRead).length;
    $('#chat-badge').hidden = !unread;
    $('#chat-badge').textContent = unread > 9 ? '9+' : String(unread);

    const partner = partnerProfile();
    $('#chat-title').textContent = partner && partner.name ? partner.name : 'Nhắn tin gia đình';
    $('#chat-avatar').innerHTML = partner ? avatarHtml(partner) : '💬';
    if (!open) return;

    const body = $('#chat-body');
    const atBottom = body.scrollHeight - body.scrollTop - body.clientHeight < 80;
    if (!messages.length) {
      body.innerHTML = '<div class="chat-empty"><div style="font-size:34px">💬</div>Chưa có tin nhắn nào.<br>Gửi lời nhắn đầu tiên cho vợ / chồng nhé!</div>';
      return;
    }
    let html = '', lastDay = '', lastUid = null, lastT = 0;
    messages.forEach((m) => {
      const t = msgTime(m);
      const day = ymd(t);
      if (day !== lastDay) {
        const today = ymd(new Date());
        const yest = ymd(new Date(Date.now() - 864e5));
        html += `<div class="chat-day">${day === today ? 'Hôm nay' : day === yest ? 'Hôm qua' : fmtDate(day)}</div>`;
        lastDay = day; lastUid = null;
      }
      const me = m.uid === fbUser.uid;
      const cont = m.uid === lastUid && t - lastT < 5 * 60e3;
      const who = profiles[m.uid] || { name: m.name };
      html += `<div class="msg ${me ? 'me' : ''} ${cont ? 'cont' : ''} ${m.pending ? 'pending' : ''}">
        ${me ? '' : `<span class="avatar sm">${avatarHtml(who)}</span>`}
        <div><div class="bubble">${esc(m.text)}</div>
        <div class="time">${m.pending ? 'Đang gửi…' : pad(t.getHours()) + ':' + pad(t.getMinutes())}</div></div>
      </div>`;
      lastUid = m.uid; lastT = t;
    });
    body.innerHTML = html;
    if (atBottom || body.dataset.first !== '1') { body.scrollTop = body.scrollHeight; body.dataset.first = '1'; }
  }
  function openChat() {
    $('#chat-panel').hidden = false;
    document.body.classList.add('chat-open');
    $('#chat-body').dataset.first = '0';
    renderChat();
    if (window.innerWidth > 760) $('#chat-text').focus();
  }
  function closeChat() { $('#chat-panel').hidden = true; document.body.classList.remove('chat-open'); renderChat(); }
  function sendMessage() {
    const ta = $('#chat-text');
    const text = ta.value.trim();
    if (!text || !fbUser) return;
    ta.value = ''; autoGrow();
    const p = myProfile();
    write(db.collection('messages').add({
      text, uid: fbUser.uid, name: p.name || fbUser.displayName || fbUser.email || '',
      clientTime: Date.now(), created: firebase.firestore.FieldValue.serverTimestamp(),
    }));
    const body = $('#chat-body');
    body.dataset.first = '0';
  }
  function autoGrow() {
    const ta = $('#chat-text');
    ta.style.height = 'auto';
    ta.style.height = Math.max(42, Math.min(ta.scrollHeight, 120)) + 'px';
    ta.style.overflowY = ta.scrollHeight > 120 ? 'auto' : 'hidden';
  }
  function bindSocial() {
    $('#user-btn').addEventListener('click', openProfile);
    $('#pf-birthday').addEventListener('input', updateAge);
    $('#profile-form').addEventListener('submit', (e) => { e.preventDefault(); saveProfile(); });
    $('#chat-fab').addEventListener('click', () => ($('#chat-panel').hidden ? openChat() : closeChat()));
    $('#chat-close').addEventListener('click', closeChat);
    $('#chat-form').addEventListener('submit', (e) => { e.preventDefault(); sendMessage(); });
    $('#chat-text').addEventListener('input', autoGrow);
    $('#chat-text').addEventListener('keydown', (e) => {
      // Enter để gửi, Shift+Enter để xuống dòng (trên điện thoại dùng nút Gửi)
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && window.innerWidth > 760) { e.preventDefault(); sendMessage(); }
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#chat-panel').hidden) closeChat(); });
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

  // ---------- Nơi gửi & lãi suất ----------
  const PLACES = {
    bank: { icon: '🏦', name: 'Ngân hàng' },
    home: { icon: '🔐', name: 'Két sắt / tại nhà' },
    app: { icon: '📱', name: 'Ví điện tử / App' },
    gold: { icon: '🪙', name: 'Vàng' },
    other: { icon: '📦', name: 'Khác' },
  };
  const hasInterest = (place) => place === 'bank' || place === 'app';
  // Tên hiển thị của nơi gửi, VD "Vietcombank" hoặc "Két sắt / tại nhà"
  function placeLabel(d) {
    if (!d.place) return 'Chưa ghi nơi gửi';
    const p = PLACES[d.place] || PLACES.other;
    return d.place !== 'home' && d.bank ? d.bank : p.name;
  }
  function placeIcon(d) { return d.place ? (PLACES[d.place] || PLACES.other).icon : '❔'; }
  function addMonths(dateStr, n) {
    const [y, m, dd] = dateStr.split('-').map(Number);
    // Giữ nguyên ngày; nếu tháng đích ngắn hơn thì lấy ngày cuối tháng (VD 31/01 + 1 tháng = 28/02)
    const lastDay = new Date(y, m + n, 0).getDate();
    return ymd(new Date(y, m - 1 + n, Math.min(dd, lastDay)));
  }
  const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);
  // Lãi đơn, trả cuối kỳ (cách tính phổ biến của sổ tiết kiệm ngân hàng)
  function interestInfo(d) {
    if (!(d.amount > 0) || !hasInterest(d.place) || !(d.rate > 0)) return null;
    const today = ymd(now);
    if (d.term > 0) {
      const maturity = addMonths(d.date, d.term);
      const interest = d.amount * (d.rate / 100) * (daysBetween(d.date, maturity) / 365);
      return { maturity, interest, daysLeft: daysBetween(today, maturity), term: d.term };
    }
    // Không kỳ hạn: lãi tạm tính tới hôm nay
    const days = Math.max(0, daysBetween(d.date, today));
    return { maturity: null, interest: d.amount * (d.rate / 100) * (days / 365), daysLeft: null, term: 0 };
  }
  const fmtRate = (r) => String(r).replace('.', ',') + '%';
  const fmtDate = (s) => s.split('-').reverse().join('/');

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
    renderPlacesAndBooks();

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
          <div class="tx-meta">${goal ? esc(goal.name) : 'Tiết kiệm chung'} · ${d.place ? placeIcon(d) + ' ' + esc(placeLabel(d)) + ' · ' : ''}${isIn && d.term ? d.term + ' th · ' : ''}${isIn && d.rate && hasInterest(d.place) ? fmtRate(d.rate) + ' · ' : ''}${esc(memberName(d.member))} · ${fmtDate(d.date)}</div></div>
          <div class="tx-amt ${isIn ? 'in' : ''}">${isIn ? '+' : '−'}${fmt(Math.abs(d.amount))}</div>
        </li>`;
      }).join('')
      : '<li class="empty">Chưa có lần gửi tiền nào</li>';
  }

  function renderPlacesAndBooks() {
    const today = ymd(now);
    // Tiền đang nằm ở đâu (gộp gửi và rút theo nơi gửi)
    const groups = new Map();
    state.deposits.filter((d) => d.date <= today).forEach((d) => {
      const key = (d.place || '') + '|' + (d.place && d.place !== 'home' ? (d.bank || '').trim().toLowerCase() : '');
      const g = groups.get(key) || { icon: placeIcon(d), label: placeLabel(d), amount: 0, count: 0 };
      g.amount += d.amount; g.count++;
      groups.set(key, g);
    });
    const places = [...groups.values()].filter((g) => Math.round(g.amount) !== 0).sort((a, b) => b.amount - a.amount);
    const sum = places.reduce((s, g) => s + Math.max(0, g.amount), 0);
    $('#place-list').innerHTML = places.length
      ? places.map((g) => {
        const pct = sum && g.amount > 0 ? (g.amount / sum) * 100 : 0;
        return `<li>
          <div class="place-top"><span class="place-name">${g.icon} ${esc(g.label)}</span>
            <span class="place-amt">${fmt(g.amount)}<span class="muted small"> · ${pct.toFixed(0)}%</span></span></div>
          <div class="progress thin"><div class="progress-bar" style="width:${pct}%"></div></div>
        </li>`;
      }).join('')
      : '<li class="empty">Chưa có khoản tiết kiệm nào</li>';

    // Sổ có lãi suất: đang gửi trước (sắp đáo hạn lên đầu), đã đáo hạn sau
    const books = state.deposits.map((d) => ({ d, info: interestInfo(d) })).filter((x) => x.info);
    const active = books.filter((x) => x.info.daysLeft === null || x.info.daysLeft >= 0);
    const totalInterest = active.reduce((s, x) => s + x.info.interest, 0);
    const principal = active.reduce((s, x) => s + x.d.amount, 0);
    $('#sv-interest').textContent = (totalInterest > 0 ? '+' : '') + fmt(totalInterest);
    $('#sv-interest-note').textContent = active.length ? `${active.length} sổ · gốc ${fmtShort(principal)}` : 'Chưa có sổ có lãi suất';

    books.sort((a, b) => {
      const ra = a.info.daysLeft === null ? 1e6 : a.info.daysLeft < 0 ? 2e6 - a.info.daysLeft : a.info.daysLeft;
      const rb = b.info.daysLeft === null ? 1e6 : b.info.daysLeft < 0 ? 2e6 - b.info.daysLeft : b.info.daysLeft;
      return ra - rb;
    });
    $('#book-list').innerHTML = books.length
      ? books.map(({ d, info }) => {
        let status;
        if (info.daysLeft === null) status = '<span class="badge">Không kỳ hạn · lãi tạm tính</span>';
        else if (info.daysLeft < 0) status = `<span class="badge">Đã đáo hạn ${fmtDate(info.maturity)}</span>`;
        else if (info.daysLeft <= 30) status = `<span class="badge warn">Đáo hạn ${fmtDate(info.maturity)} · còn ${info.daysLeft} ngày</span>`;
        else status = `<span class="badge ok">Đáo hạn ${fmtDate(info.maturity)}</span>`;
        return `<li class="tx-item" data-dep="${d.id}">
          <div class="tx-icon" style="background:color-mix(in srgb, var(--s-saving) 16%, transparent)">${placeIcon(d)}</div>
          <div style="min-width:0"><div class="tx-title">${esc(placeLabel(d))} · ${fmt(d.amount)}</div>
          <div class="tx-meta">${info.term ? info.term + ' tháng' : 'Không kỳ hạn'} · ${fmtRate(d.rate)}/năm · gửi ${fmtDate(d.date)}</div>
          <div style="margin-top:4px">${status}</div></div>
          <div class="tx-amt in" title="Tiền lãi dự kiến">+${fmt(info.interest)}</div>
        </li>`;
      }).join('')
      : '<li class="empty">Chưa có sổ nào. Bấm <b>＋ Thêm sổ tiết kiệm</b> để ghi khoản gửi ngân hàng, kỳ hạn và lãi suất.</li>';
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
  function openDep(d, preset) {
    depEditing = d || null;
    depType = d && d.amount < 0 ? 'out' : 'in';
    $$('#dep-type-seg button').forEach((b) => b.classList.toggle('active', b.dataset.type === depType));
    $('#dep-goal').innerHTML = '<option value="">💰 Tiết kiệm chung (không thuộc mục tiêu)</option>' + state.goals.map((g) => `<option value="${g.id}">${g.icon} ${esc(g.name)}</option>`).join('');
    $('#dep-goal').value = d ? d.goalId || '' : (state.goals.length === 1 ? state.goals[0].id : '');
    $('#dep-amount').value = d ? nf.format(Math.abs(d.amount)) : '';
    $('#dep-date').value = d ? d.date : defaultDate();
    $('#dep-note').value = d ? d.note || '' : '';
    fillMembers($('#dep-member'), d ? d.member : lastMember());
    $('#dep-place').value = (d && d.place) || (preset && preset.place) || 'bank';
    $('#dep-bank').value = d ? d.bank || '' : '';
    $('#dep-term').value = String((d && d.term) || (preset && preset.term) || 0);
    $('#dep-rate').value = d && d.rate ? String(d.rate).replace('.', ',') : '';
    updateDepFields();
    $('#dep-delete').hidden = !d;
    $('#dep-modal').showModal();
  }
  const parseRate = (s) => {
    const n = parseFloat(String(s || '').replace(',', '.').replace(/[^\d.]/g, ''));
    return isFinite(n) && n > 0 && n < 100 ? Math.round(n * 100) / 100 : 0;
  };
  // Ẩn/hiện ô theo nơi gửi và loại (gửi/rút), xem trước tiền lãi
  function updateDepFields() {
    const place = $('#dep-place').value;
    const isIn = depType === 'in';
    $('#dep-place-label').textContent = isIn ? 'Gửi ở đâu' : 'Rút từ đâu';
    $('#dep-bank-field').hidden = place === 'home';
    $('#dep-bank-label').textContent = place === 'bank' ? 'Tên ngân hàng' : 'Tên nơi gửi';
    $('#dep-bank').placeholder = place === 'bank' ? 'VD: Vietcombank' : place === 'app' ? 'VD: MoMo' : place === 'gold' ? 'VD: SJC 1 lượng' : '';
    const showInterest = isIn && hasInterest(place);
    $('#dep-interest-row').hidden = !showInterest;
    const info = showInterest && interestInfo({
      amount: parseMoney($('#dep-amount').value), place, rate: parseRate($('#dep-rate').value),
      term: Number($('#dep-term').value), date: $('#dep-date').value || ymd(now),
    });
    const pv = $('#dep-interest-preview');
    pv.hidden = !info;
    if (info) {
      pv.innerHTML = info.term
        ? `💡 Tiền lãi dự kiến: <b style="color:var(--good)">+${fmt(info.interest)}</b> · đáo hạn ${fmtDate(info.maturity)}`
        : `💡 Không kỳ hạn: lãi ~<b style="color:var(--good)">${fmt(parseMoney($('#dep-amount').value) * parseRate($('#dep-rate').value) / 100 / 12)}</b>/tháng`;
    }
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
      deps.push({ id: uid(), goalId: goals[0].id, amount: rnd(3e6, 4e6), date: d(11), note: 'Gửi quỹ khẩn cấp', place: 'home', bank: '', term: 0, rate: 0, member: 0, created: Date.now() });
      deps.push({ id: uid(), goalId: goals[1].id, amount: rnd(4e6, 6e6), date: d(12), note: 'Tiết kiệm mua nhà', place: 'bank', bank: k % 2 ? 'Vietcombank' : 'Techcombank', term: k % 2 ? 6 : 12, rate: k % 2 ? 4.5 : 4.8, member: 1, created: Date.now() });
      if (k > -5) deps.push({ id: uid(), goalId: goals[2].id, amount: rnd(1.5e6, 2.5e6), date: d(14), note: 'Quỹ du lịch', place: 'app', bank: 'MoMo', term: 0, rate: 3.5, member: 1, created: Date.now() });
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
    $('#add-book-btn').addEventListener('click', () => { depType = 'in'; openDep(null, { place: 'bank', term: 6 }); });
    $('#dep-type-seg').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      depType = b.dataset.type;
      $$('#dep-type-seg button').forEach((x) => x.classList.toggle('active', x === b));
      updateDepFields();
    });
    ['#dep-place', '#dep-term', '#dep-date'].forEach((s) => $(s).addEventListener('change', updateDepFields));
    ['#dep-amount', '#dep-rate'].forEach((s) => $(s).addEventListener('input', updateDepFields));
    $('#dep-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const amt = parseMoney($('#dep-amount').value);
      if (!amt) { toast('Vui lòng nhập số tiền'); return; }
      const place = $('#dep-place').value;
      const withInterest = depType === 'in' && hasInterest(place);
      const data = {
        goalId: $('#dep-goal').value, amount: depType === 'out' ? -amt : amt, date: $('#dep-date').value, note: $('#dep-note').value.trim(), member: Number($('#dep-member').value),
        place, bank: place === 'home' ? '' : $('#dep-bank').value.trim(),
        term: withInterest ? Number($('#dep-term').value) : 0,
        rate: withInterest ? parseRate($('#dep-rate').value) : 0,
      };
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
  bindSocial();
  syncThemeButtons();
  switchView('dashboard');
  initStore();
})();
