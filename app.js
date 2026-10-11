// GATE IN ビューア：家のパソコンが Google ドライブ（GATEIN_data/view）に置いた写しを読むだけの画面
// 2026/10/11 作り直し：今日（実際に買う分の収支・複勝転がし・これから買う予定・買った馬券）／レース（1レースずつ：買う予定・予想・全部の買い目・結果）／収支／反省会／設定
'use strict';
const CFG = window.GATEIN_CONFIG || {};
const SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const $ = s => document.querySelector(s);
const yen = v => (v < 0 ? '−' : '') + Math.abs(Math.round(v || 0)).toLocaleString('ja-JP') + '円';
const sgn = v => (v > 0 ? '+' : v === 0 ? '±' : '') + yen(v);
const cls = v => v > 0 ? 'plus' : v < 0 ? 'minus' : '';
const P = v => v == null || !isFinite(v) ? '-' : Math.round(v * 100) + '%';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const WD = '日月火水木金土';
const dObj = d => new Date(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8));
const ymd = d => `${d.slice(0, 4)}/${d.slice(4, 6)}/${d.slice(6, 8)}`;
const mdw = d => `${+d.slice(4, 6)}/${+d.slice(6, 8)}（${WD[dObj(d).getDay()]}）`;
const todayStr = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' }).replace(/-/g, '');
const tmin = t => { const m = String(t || '').match(/(\d{1,2}):(\d{2})/); return m ? +m[1] * 60 + +m[2] : null; };
const nowMin = () => tmin(new Date().toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour12: false, hour: '2-digit', minute: '2-digit' }));
const hhmm = m => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
const tstr = v => v && typeof v === 'object' ? String(v.to || v.from || '') : String(v || '');   // 発走時刻（変更があると {from, to}）
const atHM = v => String(v || '').replace(/^(\d{1,2}:\d{2}):\d{2}$/, '$1');
const fmtT = t => { const m = Math.floor(t / 60), s = (t - m * 60).toFixed(1); return m ? `${m}:${s.padStart(4, '0')}` : s; };
const CIRC = '①②③④⑤⑥⑦⑧⑨⑩';
const TJ = { tan: '単勝', fuku: '複勝', waku: '枠連', umaren: '馬連', wide: 'ワイド', umatan: '馬単', sanfuku: '3連複', santan: '3連単' };
const PAYJP = [['tan', '単勝'], ['fuku', '複勝'], ['waku', '枠連'], ['umaren', '馬連'], ['wide', 'ワイド'], ['umatan', '馬単'], ['sanfuku', '3連複'], ['santan', '3連単']];
// 買い方の名前（PCのアプリと同じ）。3連単は買わないので出さない（2026/10/11 ご指示）
const PK = { value: '狙い目 単勝', tan1: '◎の単勝', fuku1: '複勝◎', umaren: '馬連 流し', wide1: 'ワイド 1点', wideana: 'ワイド 穴流し', sanfuku: '3連複 軸1頭＋5頭', sanfuku6: '3連複 軸1頭＋6頭',
  box5: '3連複 5頭ボックス', box6: '3連複 6頭ボックス', jiku2: '3連複 2頭軸流し', jiku2s: '3連複 2頭軸 3点', box4: '3連複 4頭ボックス',
  _bought: '実際に買った馬券（自動投票）', _koro: '複勝転がし', _shobuW: '勝負レースW（記録）', _shobu: '勝負レース B（記録だけ）', _shobuC: '勝負レース C（記録だけ）' };
const PK_IDS = ['value', 'tan1', 'fuku1', 'umaren', 'wide1', 'wideana', 'sanfuku', 'sanfuku6', 'box5', 'box6', 'jiku2', 'jiku2s', 'box4'];
const MARKS = ['◎', '○', '▲', '△', '△'];
const JYO = { '01': '札幌', '02': '函館', '03': '福島', '04': '新潟', '05': '東京', '06': '中山', '07': '中京', '08': '京都', '09': '阪神', '10': '小倉' };
const jyoOf = k => String(k).split('-')[2] || '';
const rnOf = k => +String(k).split('-')[5] || 0;

// ---------- 端末に覚えること（見る場所・開いた欄など。読めなくても動く） ----------
function storeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function storeSet(k, v) { try { localStorage.setItem(k, v); } catch { } }
const jsonGet = (k, d) => { try { const v = JSON.parse(storeGet(k) || 'null'); return v == null ? d : v; } catch { return d; } };

// ---------- ログイン（リダイレクト方式：ホーム画面に追加したアプリでも動く。トークンは1時間で切れ、切れたら自動で取り直す） ----------
let token = null, tokenExp = 0, started = false;
const REDIRECT = location.origin + location.pathname.replace(/index\.html$/, '');
function authRedirect(prompt) {
  if (prompt === 'none') {   // 行ったり来たりが続かないように：自動の取り直しは1分に1回まで
    const last = +storeGet('gatein_auto') || 0;
    if (Date.now() - last < 60000) { storeSet('gatein_signed', ''); showLogin(); $('#loginMsg').textContent = 'もう一度ログインしてください'; return; }
    storeSet('gatein_auto', String(Date.now()));
  }
  $('#login').hidden = false; $('#loginMsg').textContent = 'Google に確認しています…';
  const st = Math.random().toString(36).slice(2); storeSet('gatein_state', st);
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  Object.entries({ client_id: CFG.clientId, redirect_uri: REDIRECT, response_type: 'token', scope: SCOPE, include_granted_scopes: 'true', state: st, prompt })
    .forEach(([k, v]) => v && u.searchParams.set(k, v));
  location.replace(u.toString());
}
function readHash() {   // Google から戻ってきたとき：#access_token=… を受け取る
  if (!location.hash.includes('access_token') && !location.hash.includes('error')) return;
  const h = new URLSearchParams(location.hash.slice(1)); history.replaceState(null, '', REDIRECT);
  if (h.get('state') !== storeGet('gatein_state')) return;
  if (h.get('error')) { storeSet('gatein_signed', ''); $('#loginMsg').textContent = h.get('error') === 'interaction_required' || h.get('error') === 'login_required' ? 'もう一度ログインしてください' : 'ログインできませんでした：' + h.get('error'); return; }
  token = h.get('access_token'); tokenExp = Date.now() + ((+h.get('expires_in') || 3600) - 60) * 1000;
  storeSet('gatein_tok', JSON.stringify({ token, tokenExp })); storeSet('gatein_signed', '1');
}
function initAuth() {
  readHash();
  if (!token) { const t = jsonGet('gatein_tok', null); if (t && Date.now() < t.tokenExp) { token = t.token; tokenExp = t.tokenExp; } }
  if (token) { started = true; start(); return; }
  if (storeGet('gatein_signed') === '1' && !$('#loginMsg').textContent) { authRedirect('none'); return; }   // 前にログインした：画面を出さずに取り直す
  showLogin();
}
function showLogin() { $('#login').hidden = false; $('#tabs').hidden = true; $('#main').hidden = true; }
$('#signin').addEventListener('click', () => authRedirect('select_account'));
function ensureToken() {
  if (token && Date.now() < tokenExp) return Promise.resolve();
  token = null; authRedirect(storeGet('gatein_signed') === '1' ? 'none' : 'select_account');
  return new Promise(() => { });   // ページが切り替わるので待つだけ
}

// ---------- Google ドライブ ----------
async function drive(path, params = {}, raw = false) {
  await ensureToken();
  const u = new URL('https://www.googleapis.com/drive/v3/' + path);
  Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
  const r = await fetch(u, { headers: { Authorization: 'Bearer ' + token } });
  if (r.status === 401) { token = null; tokenExp = 0; storeSet('gatein_tok', ''); return drive(path, params, raw); }
  if (!r.ok) throw new Error('ドライブ ' + r.status);
  return raw ? r.text() : r.json();
}
const folderCache = jsonGet('gatein_folders', {});
async function folder(name, parent) {
  const ck = (parent || 'root') + '/' + name;
  if (folderCache[ck]) return folderCache[ck];
  const q = `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false` + (parent ? ` and '${parent}' in parents` : '');
  const r = await drive('files', { q, fields: 'files(id,name)', pageSize: 10 });
  const id = r.files && r.files[0] && r.files[0].id;
  if (id) { folderCache[ck] = id; storeSet('gatein_folders', JSON.stringify(folderCache)); }
  return id || null;
}
async function list(parent) {
  if (!parent) return [];
  const r = await drive('files', { q: `'${parent}' in parents and trashed=false`, fields: 'files(id,name,modifiedTime,size)', pageSize: 1000 });
  return r.files || [];
}
async function readJson(id) { if (!id) return null; try { return JSON.parse(await drive('files/' + id, { alt: 'media' }, true)); } catch { return null; } }
async function viewPath(...names) {   // GATEIN_data/view/… のフォルダ ID
  let id = await folder(CFG.rootFolder || 'GATEIN_data');
  for (const n of ['view', ...names]) { if (!id) return null; id = await folder(n, id); }
  return id;
}

// ---------- 表示の色（自動＝スマホの設定に合わせる／ライト／ダーク） ----------
const THEMES = [['auto', '自動'], ['light', 'ライト'], ['dark', 'ダーク']];
function applyTheme(t) {
  if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t); else document.documentElement.removeAttribute('data-theme');
}
applyTheme(storeGet('gatein_theme') || 'auto');

// ---------- 画面の状態 ----------
const S = {
  idx: null, days: [], day: null, D: {}, status: null, hb: null, loadedAt: 0,
  tab: storeGet('gatein_tab2') || 'today', venue: storeGet('gatein_venue') || '', race: {},
  fold: jsonGet('gatein_vfold', {}), pdAll: storeGet('gatein_pdall2') === 'all', tcOn: storeGet('gatein_tc') !== '0', pl: null, rv: {},
  rsub: storeGet('gatein_rsub') === 'pdk' ? 'pdk' : 'pred', pkSort: storeGet('gatein_pksort') === 'no' ? 'no' : 'rank'
};
const foldOpen = (id, def) => S.fold[id] == null ? !!def : !!S.fold[id];
function fold(id, title, right, body, def, sub) {   // 折りたためる欄（開け閉めは覚える）
  return `<details class="fold" data-f="${esc(id)}"${foldOpen(id, def) ? ' open' : ''}><summary><span class="t">${title}${sub ? `<small>${sub}</small>` : ''}</span>${right ? `<span class="r">${right}</span>` : ''}</summary><div class="fb">${body}</div></details>`;
}
document.addEventListener('toggle', e => {
  const el = e.target; if (!el || el.tagName !== 'DETAILS' || !el.dataset.f) return;
  S.fold[el.dataset.f] = el.open ? 1 : 0; storeSet('gatein_vfold', JSON.stringify(S.fold));
}, true);

// ---------- タブ ----------
function setTab(t) {
  if (!document.querySelector(`#tabs button[data-tab="${t}"]`)) t = 'today';
  S.tab = t; storeSet('gatein_tab2', t);
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  document.querySelectorAll('main section').forEach(s => s.hidden = s.dataset.view !== t);
}
$('#tabs').addEventListener('click', e => {
  const b = e.target.closest('button[data-tab]'); if (!b) return;
  setTab(b.dataset.tab); window.scrollTo(0, 0); renderTab();
});
async function renderTab() {
  try {
    if (S.tab === 'today') { await ensureDay(S.day); renderToday(); }
    else if (S.tab === 'race') { await ensureDay(S.day); renderRace(); }
    else if (S.tab === 'pl') await renderPL();
    else if (S.tab === 'review') await renderReview();
    else renderSetting();
  } catch (e) { console.error(e); $('#foot').textContent = '表示に失敗しました：' + e.message; }
}

// ---------- 読み込み ----------
async function start() {
  $('#login').hidden = true; $('#tabs').hidden = false; $('#main').hidden = false;
  setTab(S.tab);
  try { await loadIndex(); await renderTab(); stamp(); }
  catch (e) { console.error(e); $('#foot').textContent = '読み込みに失敗しました：' + e.message; }
}
function stamp() { $('#foot').textContent = '読み込み：' + new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) + '（家のパソコンの写し。数十秒〜数分遅れることがあります）'; }
async function loadIndex() {
  $('#foot').textContent = '読み込み中…';
  const viewId = await viewPath();
  if (!viewId) { $('#foot').textContent = 'ドライブに GATEIN_data/view が見つかりません（家のパソコンで GATE IN を起動すると作られます）'; return; }
  const top = await list(viewId);
  const names = ['autobet', 'results', 'shobu', 'win5', 'cards', 'predict', 'paddock', 'improve'];
  const ids = await Promise.all(names.map(n => folder(n, viewId)));
  const F = Object.fromEntries(names.map((n, i) => [n, ids[i]]));
  const [logId, rvId] = await Promise.all([F.autobet ? folder('log', F.autobet) : null, F.improve ? folder('review', F.improve) : null]);
  const [lg, rs, sb, w5, cd, pd, pdk, ab, rv] = await Promise.all([logId, F.results, F.shobu, F.win5, F.cards, F.predict, F.paddock, F.autobet, rvId].map(list));
  // 小さすぎるファイル（開催のない日の空の写し）は日付の一覧に入れない
  const byDay = (fs, min) => Object.fromEntries((fs || []).filter(f => /^\d{8}\.json$/.test(f.name) && !(min && f.size != null && +f.size < min)).map(f => [f.name.slice(0, 8), f.id]));
  S.idx = { log: byDay(lg), res: byDay(rs), sb: byDay(sb), w5: byDay(w5), cd: byDay(cd), pd: byDay(pd), pdk: byDay(pdk), rv: byDay(rv),
    cdBig: byDay(cd, 6000), resBig: byDay(rs, 2000), pdBig: byDay(pd, 6000), rvTotal: ((rv || []).find(f => f.name === 'total.json') || {}).id };
  const [hb, st] = await Promise.all([readJson((top.find(f => f.name === 'heartbeat.json') || {}).id), readJson(((ab || []).find(f => f.name === 'status.json') || {}).id)]);
  S.hb = hb; S.status = st; S.loadedAt = Date.now();
  renderHome();
  const I = S.idx, today = todayStr();
  const days = new Set([...Object.keys(I.cdBig), ...Object.keys(I.pdBig), ...Object.keys(I.sb), ...Object.keys(I.log), ...Object.keys(I.resBig)]);
  S.days = [...days].sort().reverse();
  if (!S.day || !S.days.includes(S.day)) S.day = S.days.includes(today) ? today : (S.days.find(d => d < today) || S.days[S.days.length - 1] || null);
  fillDays();
}
function fillDays() {
  const today = todayStr();
  const html = S.days.map(d => `<option value="${d}"${d === S.day ? ' selected' : ''}>${mdw(d)}${d === today ? '・今日' : d > today ? '・これから' : ''}</option>`).join('') || '<option>記録なし</option>';
  $('#day').innerHTML = html; $('#rday').innerHTML = html;
}
for (const sel of ['#day', '#rday']) $(sel).addEventListener('change', e => { S.day = e.target.value; fillDays(); renderTab(); });
function renderHome() {
  const hb = S.hb;
  if (!hb) { $('#home').textContent = '家のPC：記録なし'; return; }
  const min = Math.round((Date.now() / 1000 - hb.t) / 60);
  $('#home').innerHTML = (min <= 10 ? '<span class="ok">家のPC 動作中</span>' : '<span class="ng">家のPC 止まっている？</span>') + `<br>${esc(hb.at)} の写し${min > 1 ? `（${min}分前）` : ''}`;
}
async function reload() {
  const b = $('#reload'); b.disabled = true; b.textContent = '読込中';
  try { S.D = {}; S.pl = null; S.rv = {}; await loadIndex(); await renderTab(); stamp(); }
  catch (e) { $('#foot').textContent = '読み込みに失敗しました：' + e.message; }
  finally { b.disabled = false; b.textContent = '更新'; }
}
$('#reload').addEventListener('click', reload);
// 今日を見ているときは、画面に戻ったときと2分ごとに読み直す（ログインが切れているときは読み直さない）
async function autoRefresh() {
  if (!started || document.visibilityState !== 'visible' || !token || Date.now() > tokenExp - 60000) return;
  if (S.day !== todayStr() || Date.now() - S.loadedAt < 100000) return;
  if (S.tab !== 'today' && S.tab !== 'race') return;
  try {
    const keep = window.scrollY; delete S.D[S.day]; await loadIndex(); await renderTab(); stamp(); window.scrollTo(0, keep);
  } catch { }
}
setInterval(autoRefresh, 30000);
document.addEventListener('visibilitychange', autoRefresh);

// ---------- 1日分の写し ----------
async function ensureDay(d) {
  if (!d || !S.idx) return null;
  if (S.D[d]) return S.D[d];
  const I = S.idx;
  const [log, res0, sb, w5, cd, pd] = await Promise.all([readJson(I.log[d]), readJson(I.res[d]), readJson(I.sb[d]), readJson(I.w5[d]), readJson(I.cd[d]), readJson(I.pd[d])]);
  let L = log || {};
  const st = S.status;
  if (d === todayStr() && st && st.date === d && st.log && Object.keys(st.log).length) L = { ...L, ...st.log };   // 今日の分は自動投票の状態の写しも見る
  let res = res0 || {};
  if (!Object.keys(res).length && I.rv[d]) {   // 結果の写しがまだ無い日は、反省会の記録（実際に買った分の払戻）を使う
    const rv = await readJson(I.rv[d]);
    for (const r of (rv && rv.races) || []) res[r.key] = { result: (r.top3 || []).join('-'), order: r.top3 || [], _ret: r.bought ? +r.bought.ret || 0 : null, payout: {} };
  }
  const pre = `${d.slice(0, 4)}-${d.slice(4)}-`;
  const X = { d, log: L, res, sb: sb || null, w5: w5 || null, cd: (cd && cd.races) || {}, cdMade: cd && cd.made,
    pd: Object.fromEntries(Object.entries(pd || {}).filter(([k]) => k.startsWith(pre))), pdk: undefined };
  S.D[d] = X;
  return X;
}
async function ensurePaddock(X) {
  if (X.pdk !== undefined) return X.pdk;
  X.pdk = null;
  try {
    let fid = S.idx.pdk[X.d];
    if (!fid) {   // 写しが無ければ元のファイル（GATEIN_data/paddock）
      const gid = await folder(CFG.rootFolder || 'GATEIN_data'), pid = gid ? await folder('paddock', gid) : null;
      if (pid) fid = ((await list(pid)).find(f => f.name === X.d + '.json') || {}).id;
    }
    const v = fid ? await readJson(fid) : null;
    X.pdk = (v && v.races) || null;
  } catch { X.pdk = null; }
  return X.pdk;
}

// ---------- レースの情報 ----------
function raceKeys(X) {
  const pre = `${X.d.slice(0, 4)}-${X.d.slice(4)}-`, ks = new Set();
  for (const o of [X.cd, X.pd, X.res, X.log]) for (const k of Object.keys(o || {})) if (k.startsWith(pre)) ks.add(k);
  const sb = X.sb || {};
  for (const c of ((sb.W || {}).cands || [])) ks.add(c.key);
  for (const k of Object.keys((sb.W || {}).races || {})) ks.add(k);
  for (const q of ((sb.K || {}).plan || [])) ks.add(q.key);
  return [...ks].filter(k => k.startsWith(pre));
}
function sbName(X, k) {   // 勝負レースの記録にある名前と時刻（「東京9R 鷹巣山特別」）
  const sb = X.sb || {}, W = sb.W || {}, K = sb.K || {};
  return (W.races || {})[k] || (W.cands || []).find(c => c.key === k) || (K.plan || []).find(q => q.key === k) || (K.legs || []).find(l => l.key === k) || null;
}
function meta(X, k) {
  const c = X.cd[k] || {}, p = X.pd[k] || {}, r = X.res[k] || {}, l = (X.log[k] || {}).plan || {}, s = sbName(X, k) || {};
  const sn = String(s.name || '').replace(/^\S+?\d+R\s*/, '');
  return { track: c.track || p.track || r.track || l.track || JYO[jyoOf(k)] || '', no: c.raceNo || p.raceNo || r.raceNo || l.raceNo || rnOf(k),
    name: c.name || p.name || r.name || l.name || sn || '', time: tstr(c.time) || tstr(p.time) || tstr(r.time) || tstr(l.time) || tstr(s.time) || '', tchg: c.time && typeof c.time === 'object' && c.time.from ? c.time.from : '',
    surface: c.surface || p.surface || r.surface || '', dist: c.dist || p.dist || r.dist || '', n: c.n || p.n || ((c.horses || []).filter(h => !h.scr).length) || '', going: c.going || '' };
}
const rTitle = m => `${esc(m.track)}${m.no}R ${esc(m.name)}`;
function horseName(X, k, no) {
  const c = ((X.cd[k] || {}).horses || []).find(h => +h.no === +no); if (c && c.name) return c.name;
  const p = ((X.pd[k] || {}).horses || []).find(h => +h.no === +no); if (p && p.name) return p.name;
  return ((X.res[k] || {}).names || {})[no] || '';
}
const wakuOf = (X, k, no) => { const c = ((X.cd[k] || {}).horses || []).find(h => +h.no === +no); return c && !(X.cd[k] || {}).gateUnknown ? c.w : 0; };
const uChip = (no, w) => `<span class="u w${w || 0}">${esc(no)}</span>`;
const isDone = r => !!(r && ((r.order || []).length || r.result));
function payOf(X, k, type, key) { return +((((X.res[k] || {}).payout || {})[type] || {})[key] || 0); }
const isK = b => b.pk === 'korogashi' || b.title === '複勝転がし';
const isW = b => b.title === '勝負レースW';
function settle(X, k, e) {   // 1レースの購入額・払戻
  const p = e.plan || {}, bought = e.status === '購入済み', r = X.res[k];
  let ret = 0; const hit = new Set();
  for (const b of p.bets || []) { const y = payOf(X, k, b.type, b.key) * Math.floor((+b.yen || 0) / 100); if (y > 0) { ret += y; hit.add(b); } }
  if (r && r._ret != null) ret = r._ret;
  return { cost: bought ? +(p.total || 0) : 0, ret: bought ? ret : 0, hit, done: isDone(r), bought };
}
// 勝負レースW：今のオッズのままなら、どの候補を買うかの見込み（家のPCのアプリと同じ考え方。表示だけ）
function wProj(sb) {
  const W = sb && sb.W; if (!W) return null;
  const cap = sb.wCap === undefined ? 5 : sb.wCap;   // null は上限なし
  const picked = Object.values(W.races || {}).filter(x => x && x.pick).length;
  const wsc = c => c ? (c.wsc != null ? +c.wsc : (+c.estRoi || 0) * Math.sqrt(Math.max(0, +c.hit || 0))) : 0;
  const cs = (W.cands || []).map((c, i) => ({ c, rank: i + 1, sc: wsc(c), t: tmin(c.time) ?? 9999 })).sort((x, y) => x.t - y.t);
  let slots = cap == null ? Infinity : cap - picked; const map = {};
  cs.forEach((x, j) => {
    const better = cs.slice(j + 1).filter(y => y.sc > x.sc).length;
    let st = 'buy', why = '';
    if (slots <= 0) { st = 'skip'; why = `今日はもう${cap}R選ぶ見込み`; }
    else if (cap != null && better >= slots) { st = 'skip'; why = `このあとにもっと良いレースが${better}つ`; }
    else slots -= 1;
    map[x.c.key] = { st, why, rank: x.rank };
  });
  return { cap, picked, left: cap == null ? null : Math.max(0, cap - picked), map };
}
function wInfo(X, k) {
  const sb = X.sb, W = sb && sb.W; if (!W) return null;
  const r = (W.races || {})[k];
  if (r) return r.pick ? { st: 'pick', plan: r.plan || {}, at: r.at, settled: r.settled, ret: r.ret } : { st: 'skip', why: r.why, at: r.at };
  const i = (W.cands || []).findIndex(c => c.key === k); if (i < 0) return null;
  const c = W.cands[i], PJ = wProj(sb), pj = PJ && PJ.map[k];
  return { st: 'cand', rank: i + 1, proj: pj, plan: { tickets: c.tickets || [], pks: c.pks || [], cost: c.cost, estRoi: c.estRoi, hit: c.hit, tierName: c.tierName } };
}
function kInfo(X, k) {
  const K = X.sb && X.sb.K; if (!K) return null;
  const i = (K.plan || []).findIndex(q => q.key === k); if (i < 0) return null;
  const L = K.legs || [];
  return { i, q: K.plan[i], leg: L.find(l => l.key === k && !l.cancel), cx: L.find(l => l.key === k && l.cancel), sk: (K.skips || {})[k], K };
}
function kRes(l) {   // 転がし1回分の結果
  if (!l) return '';
  if (l.settled) return l.refund ? `返還 ${yen(l.ret)}` : l.ret ? `当たり ${yen(l.ret)}` : '外れ';
  if (l.prov != null) return l.refund ? '返還（取消・除外）' : l.prov ? `当たり（仮 ${yen(l.prov)}）` : '外れ';
  return '結果待ち';
}
const kBuyMode = (X, K) => { const live = ((K && K.legs) || []).filter(l => !l.cancel); if (live.length) return live.every(l => l.buy) ? '実際に買う' : live[0].buy ? '途中から記録だけ' : '記録だけ'; const on = S.status && S.status.settings && S.status.settings.korogashi; return X.d === todayStr() ? (on ? '実際に買う' : '記録だけ') : ''; };

// 買い目の行（Wの計画：買い方ごと）。1点なら組と馬名、何点もある買い方は使う馬
function planLines(X, k, plan, lab) {
  const tks = plan.tickets || [], pks = plan.pks && plan.pks.length ? plan.pks : null;
  const nums = ks => [...new Set(ks.flatMap(x => String(x).split(/[-→]/)).map(Number))].sort((a, b) => a - b);
  if (!pks) return tks.map(t => `<div class="l"><span><span class="lab w">${lab}</span>：${esc(TJ[t.type] || t.type)} <b>${esc(t.key)}</b></span><span>${yen(t.yen || 0)}</span></div>` +
    `<div class="who">${String(t.key).split(/[-→]/).map(n => `${n} ${esc(horseName(X, k, n))}`).join('・')}</div>`).join('');
  return pks.map(p => {
    const ks = tks.filter(t => (t.pk || []).includes(p.id)), one = ks.length === 1 ? ks[0] : null;
    const head = one ? `${esc(TJ[one.type] || one.type)} <b>${esc(one.key)}</b>` : `${esc(p.title || PK[p.id] || p.id)}`;
    const who = one ? String(one.key).split(/[-→]/).map(n => `${n} ${esc(horseName(X, k, n))}`).join('・')
      : `${nums(ks.map(t => t.key)).join('・')}（${p.n || ks.length}点×${((p.unit || 1) * 100).toLocaleString()}円）`;
    return `<div class="l"><span><span class="lab w">${lab}</span>：${head}</span><span>${yen(p.cost || ks.reduce((a, t) => a + (+t.yen || 0), 0))}</span></div><div class="who">${who}</div>`;
  }).join('');
}
const estLine = plan => `${plan.tierName ? esc(plan.tierName) + '・' : ''}当たる見込み ${P(plan.hit)}・推定回収率 <b>${P(plan.estRoi)}</b>`;

// ============ 今日 ============
function renderToday() {
  const box = $('#today'), X = S.D[S.day];
  if (!X) { box.innerHTML = '<p class="empty">この日の記録はありません</p>'; return; }
  const d = X.d, today = d === todayStr(), now = nowMin(), sb = X.sb || {}, W = sb.W || null, K = sb.K || null;
  const st = S.status || {}, se = st.settings || {};
  const ents = Object.entries(X.log).map(([k, e]) => ({ k, e, m: meta(X, k), s: settle(X, k, e) }));
  const bought = ents.filter(x => x.s.bought).sort((a, b) => (tmin(a.m.time) ?? 9999) - (tmin(b.m.time) ?? 9999) || rnOf(a.k) - rnOf(b.k));
  const cost = bought.reduce((a, x) => a + x.s.cost, 0), ret = bought.reduce((a, x) => a + x.s.ret, 0), open = bought.filter(x => !x.s.done).length;
  const hits = bought.filter(x => x.s.ret > 0).length;
  const skips = ents.filter(x => !x.s.bought && !x.e.error);
  const fails = ents.filter(x => !x.s.bought && x.e.error);
  const PJ = wProj(sb), cap = PJ ? PJ.cap : (sb.wCap === undefined ? 5 : sb.wCap);
  const nW = W ? Object.values(W.races || {}).filter(x => x.pick).length : bought.filter(x => (x.e.plan.bets || []).some(isW)).length;
  // これから買う予定（今日だけ）：Wの候補（今のオッズなら買う予定のもの）と、複勝転がしのまだ決めていない回
  const up = [], others = [];
  if (today) {
    const boughtK = new Set(bought.map(x => x.k));
    for (const c of (W && W.cands) || []) {
      if (boughtK.has(c.key)) continue;
      const t = tmin(c.time); if (t != null && t < now - 1) continue;
      const pj = PJ && PJ.map[c.key];
      (pj && pj.st === 'buy' ? up : others).push({ t: t ?? 9999, k: c.key, w: { st: 'cand', proj: pj, plan: c } });
    }
    for (const [k, r] of Object.entries((W && W.races) || {})) {
      if (!r.pick || boughtK.has(k)) continue;
      const t = tmin(r.time); if (t != null && t < now - 3) continue;
      up.push({ t: t ?? 9999, k, w: { st: 'pick', plan: r.plan || {}, at: r.at } });
    }
    if (K && K.status === 'alive') {
      let first = true;
      for (const [i, q] of (K.plan || []).entries()) {
        const x = kInfo(X, q.key); if (!x || x.leg || x.sk || x.cx) continue;
        const t = tmin(q.time); if (t != null && t < now - 1) continue;
        const it = up.find(u => u.k === q.key);
        const kk = { i, q, next: first }; first = false;
        if (it) it.kq = kk; else up.push({ t: t ?? 9999, k: q.key, kq: kk });
      }
    }
    up.sort((a, b) => a.t - b.t); others.sort((a, b) => a.t - b.t);
  }
  // ---- 収支のまとめ ----
  const pl = ret - cost;
  const nextUp = up[0];
  const mini = today
    ? [['勝負レースW', `${nW} / ${cap == null ? '−' : cap}R`],
       ['複勝転がし', K ? `${yen(K.bank || 0)}` : se.korogashi ? '朝に決める' : 'OFF'],
       nextUp ? ['次に買う', `${hhmm(nextUp.t)}<small>${esc(meta(X, nextUp.k).track)}${meta(X, nextUp.k).no}R</small>`] : ['当たり', `${hits} / ${bought.length}R`]]
    : [['買ったレース', `${bought.length}R`], ['当たり', `${hits}R`], ['見送り', `${skips.length}R`]];
  let state = '';
  if (today) {
    const hb = S.hb, min = hb ? Math.round((Date.now() / 1000 - hb.t) / 60) : 999;
    if (min > 10) state = `<div class="state warn">家のパソコンの写しが${hb ? ` ${esc(hb.at)} から` : ''}止まっています。家のPCで GATE IN が動いているか確かめてください</div>`;
    else if (!se.enabled) state = '<div class="state warn">自動投票は止まっています（家のPCで「開始」を押すと買います）</div>';
    else if (st.state && st.state.msg) state = `<div class="state">${esc(st.state.msg)}</div>`;
  }
  let h = `<div class="sum"><div class="hd"><span>${today ? '今日' : 'この日'}の収支（実際に買った分）</span><b>${mdw(d)}</b></div>
    <div class="big"><span class="pl ${cls(pl)}">${sgn(pl)}</span><span class="io">投資 ${yen(cost)}・払戻 ${yen(ret)}${open ? `<br>結果待ち ${open}R` : ''}</span></div>
    <div class="mini">${mini.map(([k, v]) => `<div><div class="k">${k}</div><div class="v">${v}</div></div>`).join('')}</div>${state}</div>`;
  // ---- 複勝転がし ----
  h += kCardHtml(X, today);
  // ---- これから買う予定 ----
  if (today) {
    h += `<div class="sh"><h2>これから買う予定</h2><span>発走の順</span></div>`;
    h += up.length ? up.map(u => upCard(X, u)).join('') : `<p class="empty">${W && (W.cands || []).length ? '今のオッズで買う予定のレースはありません' : 'いまのところ買う予定のレースはありません'}</p>`;
    if (others.length) h += fold('t.others', `ほかのWの候補 ${others.length}R`, '今のままなら見送り', others.map(u => upCard(X, u)).join(''));
    if (W) h += `<p class="foot2">Wは、締切の約1分40秒前に最新のオッズで買うかどうかを決めます。${W.candsAt ? `候補は ${esc(W.candsAt)} の計算。` : ''}1日${cap == null ? '何R' : cap + 'R'}まで。</p>`;
  }
  // ---- 買った馬券 ----
  h += `<div class="sh"><h2>買った馬券</h2><span>${bought.length}R</span></div>`;
  h += bought.length ? bought.map(x => boughtCard(X, x)).join('') : `<p class="empty">${today ? 'まだありません。買ったら、ここに券種・組・金額・結果が出ます' : 'この日に買った馬券はありません'}</p>`;
  if (fails.length) h += fails.map(x => `<div class="tl w"><div class="h"><div class="tm">${esc(x.m.time || '')}</div><div class="bds"><span class="bd w">買えなかった</span></div></div><div class="rn">${rTitle(x.m)}</div><div class="x minus">${esc(x.e.error)}</div></div>`).join('');
  // ---- 折りたたみ ----
  if (skips.length) {
    const why = {}; for (const x of skips) { const w = String(x.e.reason || '理由なし').replace(/^勝負レースW：/, '').replace(/（[^）]*）/g, ''); why[w] = (why[w] || 0) + 1; }
    const top = Object.entries(why).sort((a, b) => b[1] - a[1]);
    h += fold('t.skip', `見送ったレース ${skips.length}R`, '',
      `<ul class="lst">${skips.sort((a, b) => (tmin(a.m.time) ?? 9999) - (tmin(b.m.time) ?? 9999) || rnOf(a.k) - rnOf(b.k)).map(x => `<li><b>${esc(x.m.time || '')}</b> ${rTitle(x.m)}<span class="sub">${esc(String(x.e.reason || '').replace(/^勝負レースW：/, ''))}</span></li>`).join('')}</ul>`,
      false, top.slice(0, 3).map(([w, n]) => `${esc(w.length > 26 ? w.slice(0, 25) + '…' : w)} ${n}R`).join('／'));
  }
  h += bcHtml(X) + win5Html(X);
  try { const ps = predStats(X, null); if (ps.n) h += fold('t.ans', '予想の答え合わせ（買い方ごと）', `${ps.n}R`, predStatsHTML(ps)); } catch { }
  box.innerHTML = h;
}
function kCardHtml(X, today) {
  const sb = X.sb || {}, K = sb.K, on = S.status && S.status.settings && S.status.settings.korogashi;
  if (!K) {
    if (!today || !on) return '';
    const ts = raceKeys(X).map(k => tmin(meta(X, k).time)).filter(t => t != null), first = ts.length ? Math.min(...ts) : null;
    return `<div class="sh"><h2>複勝転がし</h2><span>実際に買う</span></div><div class="kcard"><div class="sub">最初のレースの10分前${first ? `（${hhmm(first - 10)}ごろ）` : ''}に、今日の5Rを決めます。1,000円から始めて、当たったら払戻を全部次へ。外れたらその日は終わりです。</div></div>`;
  }
  const md = kBuyMode(X, K), plan = K.plan || [];
  const stTxt = { alive: '転がし中', lost: '外れて終わり', done: '今日の分は終わり' }[K.status] || '';
  let nextI = -1;
  const chips = plan.map((q, i) => {
    const x = kInfo(X, q.key) || {}, l = x.leg; let c = '', s = '';
    if (l) {
      if (l.settled) { c = l.ret ? 'hit' : 'lost'; s = l.refund ? '返還' : l.ret ? yen(l.ret) : '外れ'; }
      else if (l.prov != null) { c = l.prov ? 'hit' : 'lost'; s = l.prov ? '当たり' : '外れ'; }
      else { c = 'wait'; s = '結果待ち'; }
    } else if (x.sk || x.cx) { c = 'skip'; s = '見送り'; }
    else if (K.status !== 'alive') { c = 'skip'; s = '買わない'; }
    else if (nextI < 0) { nextI = i; c = 'now'; s = '次'; }
    else s = `${esc(String(q.name || '').split(' ')[0])}`;
    return `<span class="${c}">${CIRC[i] || i + 1}${esc(q.time || '')}<small>${s}</small></span>`;
  }).join('');
  let note = '';
  const legs = (K.legs || []).filter(l => !l.cancel);
  if (K.status === 'lost') { const l = legs.find(l => (l.settled && !l.ret) || (l.prov === 0)); note = l ? `${esc(l.name || '')}で外れて、今日の転がしは終わりました（外れたらその日は終わり）` : '今日の転がしは終わりました'; }
  else if (K.status === 'done') note = `今日の分は終わりました：${yen(K.start || 1000)} → <b>${yen(K.bank || 0)}</b>`;
  else if (nextI >= 0) {
    const q = plan[nextI];
    note = `次は ${CIRC[nextI]} ${esc(q.name || '')} ${esc(q.time || '')}：朝の時点では <b>${esc(q.no)} ${esc(q.horse || '')}</b>（3着内率 ${P(q.p)}）。締切の直前に買う馬を決め直して、持ち金 <b>${yen(K.bank || 0)}</b> を全部（100円未満は残す）。`;
  } else if (legs.some(l => !l.settled && l.prov == null)) note = '結果待ちです。当たったら払戻を全部次へ。';
  return `<div class="sh"><h2>複勝転がし${md ? `（${md}）` : ''}</h2><span>${K.fixedAt ? `${esc(K.fixedAt)}に決めた${plan.length}R` : ''}</span></div>
    <div class="kcard"><div class="h"><b>今 ${yen(K.bank || 0)}・${stTxt}</b><span class="bd ${K.status === 'alive' ? 'k' : K.status === 'lost' ? 'miss' : 'hit'}">${K.status === 'alive' && nextI >= 0 ? `${CIRC[nextI]}へ` : stTxt}</span></div>
    ${plan.length ? `<div class="kchips">${chips}</div>` : ''}${note ? `<div class="sub note">${note}</div>` : ''}</div>`;
}
function upCard(X, u) {
  const m = meta(X, u.k), w = u.w, kq = u.kq;
  const bds = [];
  if (w) bds.push(w.st === 'pick' ? '<span class="bd w">W 買う</span>' : w.proj && w.proj.st === 'buy' ? '<span class="bd w">W 買う予定</span>' : '<span class="bd wq">W 候補</span>');
  if (kq) bds.push(`<span class="bd k">転がし ${CIRC[kq.i]}</span>`);
  let body = '';
  if (w) body += `<div class="tk">${planLines(X, u.k, w.plan, 'W')}<div class="x">${estLine(w.plan)}${w.proj && w.proj.st !== 'buy' && w.proj.why ? `<br>${esc(w.proj.why)}` : ''}</div></div>`;
  if (kq) {
    const K = X.sb.K, q = kq.q;
    body += `<div class="tk"><div class="l"><span><span class="lab k">転がし</span>：複勝 <b>${esc(q.no)}</b> ${esc(q.horse || '')}</span><span>${kq.next ? yen(K.bank || 0) : '持ち金ぜんぶ'}</span></div>` +
      `<div class="x">3着内率 ${P(q.p)}・朝の予定（馬は締切の直前に決め直す）</div></div>`;
  }
  return `<div class="tl ${w ? 'w' : 'k'}"><div class="h"><div class="tm">${esc(m.time || '')}</div><div class="bds">${bds.join('')}</div></div><div class="rn">${rTitle(m)}</div>${body}</div>`;
}
function betGroups(X, k, bets) {   // 買った券：同じ種類で何点もあるもの（3連複など）はまとめる
  const out = [], by = {};
  for (const b of bets) { const g = `${isK(b) ? 'K' : isW(b) ? 'W' : 'O'}|${b.type}|${b.title || ''}`; (by[g] || (by[g] = [])).push(b); }
  for (const [g, bs] of Object.entries(by)) {
    const kind = g[0], lab = kind === 'K' ? '<span class="lab k">転がし</span>' : kind === 'W' ? '<span class="lab w">W</span>' : `<span class="lab">${esc(bs[0].title || '買い目')}</span>`;
    const got = bs.reduce((a, b) => a + payOf(X, k, b.type, b.key) * Math.floor((+b.yen || 0) / 100), 0), cost = bs.reduce((a, b) => a + (+b.yen || 0), 0);
    if (bs.length <= 2) for (const b of bs) {
      const y = payOf(X, k, b.type, b.key) * Math.floor((+b.yen || 0) / 100);
      out.push(`<div class="l"><span>${lab}：${esc(TJ[b.type] || b.type)} <b>${esc(b.key)}</b></span><span>${yen(+b.yen || 0)}</span></div>` +
        `<div class="who">${String(b.key).split(/[-→]/).map(n => `${n} ${esc(horseName(X, k, n))}`).join('・')}${y ? ` → <b class="plus nw">払戻 ${yen(y)}</b>` : ''}</div>`);
    }
    else out.push(`<div class="l"><span>${lab}：${esc(TJ[bs[0].type] || bs[0].type)} ${bs.length}点</span><span>${yen(cost)}</span></div>` +
      `<div class="x">${bs.map(b => esc(b.key)).join('・')}${got ? ` → <b class="plus nw">払戻 ${yen(got)}</b>` : ''}</div>`);
  }
  return out.join('');
}
function boughtCard(X, x) {
  const { k, e, m, s } = x, bets = (e.plan && e.plan.bets) || [], r = X.res[k];
  const hasW = bets.some(isW), hasK = bets.some(isK);
  const bd = !s.done ? '<span class="bd wait">結果待ち</span>' : s.ret > 0 ? `<span class="bd hit">当たり ${sgn(s.ret - s.cost)}</span>` : '<span class="bd miss">外れ</span>';
  const ord = r && (r.order || []).length ? (r.order || []).slice(0, 3).join('-') : r && r.result ? r.result : '';
  const w = wInfo(X, k);
  return `<div class="tl ${s.ret > 0 ? 'hit' : hasW ? 'w' : hasK ? 'k' : ''}"><div class="h"><div class="tm">${esc(m.time || '')}</div><div class="bds">${bd}</div></div>
    <div class="rn">${rTitle(m)}${e.at ? `<small>${esc(atHM(e.at))} 購入</small>` : ''}</div>
    <div class="tk">${betGroups(X, k, bets)}${w && w.st === 'pick' && w.plan ? `<div class="x">${estLine(w.plan)}</div>` : ''}</div>
    <div class="res"><span>${ord ? `着順 ${esc(ord)}` : '結果はまだ'}</span>${s.done ? `<b class="${cls(s.ret - s.cost)}">${sgn(s.ret - s.cost)}</b>` : `<b>${yen(s.cost)}</b>`}</div></div>`;
}
function bcHtml(X) {   // 勝負レース B・C（記録だけ。実際には買わない）
  const D = X.sb; if (!D) return '';
  const C = D.C, bp = Object.values(D.races || {}).filter(x => x.pick), cp = C ? Object.values(C.races || {}).filter(x => x.pick) : [];
  if (!bp.length && !cp.length && !(D.cands || []).length && !C) return '';
  const card = x => { const pl = x.plan || {}, pm = (x.ret || 0) - (pl.cost || 0);
    return `<li><b>${esc(x.time || '')}</b> ${esc(x.name || '')}<span class="sub">${yen(pl.cost || 0)}・推定回収率 ${P(pl.estRoi)}・当たる見込み ${P(pl.hit)}${x.settled ? `・<b class="${cls(pm)}">${sgn(pm)}</b>` : '・結果待ち'}<br>${(pl.pks || []).map(p => `${esc(p.title || p.id)}（${p.n}点）`).join('・')}</span></li>`; };
  const sum = sm => sm && sm.settled ? `<p class="sub">記録の収支：${yen(sm.cost)} → ${yen(sm.ret)}（<b class="${cls(sm.ret - sm.cost)}">${sgn(sm.ret - sm.cost)}</b>）</p>` : '';
  const body = `<h3 class="s" style="margin-top:4px">B：直前に決める</h3>${bp.length ? `<ul class="lst">${bp.map(card).join('')}</ul>` : '<p class="sub">選んだレースはありません</p>'}${sum(D.sum)}` +
    `<h3 class="s">C：朝に候補</h3>${C ? (cp.length ? `<ul class="lst">${cp.map(card).join('')}</ul>` : '<p class="sub">選んだレースはありません</p>') + sum(C.sum) : '<p class="sub">最初のレースの15分前に決まります</p>'}` +
    '<p class="sub">B・C は比べるための記録で、実際には買っていません。</p>';
  return fold('t.bc', '記録だけの比較（B・C）', `${bp.length + cp.length}R`, body);
}
function win5Html(X) {
  const W = X.w5; if (!W || !W.legs) return '';
  const p = W.plans && W.plans.hit; if (!p) return '';
  const pc = v => v == null ? '-' : (v * 100 >= 10 ? Math.round(v * 100) : (v * 100).toFixed(1)) + '%';
  const body = `<ul class="lst">${W.legs.map((l, i) => `<li><b>${i + 1}. ${esc(l.name)}</b><span class="sub">${(p.picks[i] || []).map(h => `${h.no} ${esc(h.name || '')}`).join('・')}</span></li>`).join('')}</ul>` +
    `<p class="sub">5つとも当たる確率 ${pc(p.hit)}・${esc(W.made || '')}時点${W.known ? '' : '（対象は推定）'}。締切は1レース目（${esc(W.close || '')} 発走）の前。購入は手動です。</p>`;
  return fold('t.w5', 'WIN5（手動）', `${p.points}点・${yen(p.cost)}`, body);
}
// 保存した予想の買い目を100円ずつ買った場合の成績（買い方ごと）。結果と払戻が出たレースだけ
function predStats(X, venue) {
  const T = {}; let n = 0;
  for (const [k, r] of Object.entries(X.pd || {})) {
    const R = X.res[k]; if (!r || !R || !(R.order || []).length || !R.payout || !Object.keys(R.payout).length) continue;
    if (venue && meta(X, k).track !== venue) continue;
    n++;
    for (const id of PK_IDS) {
      const p = (r.pk || {})[id]; if (!p || !(p.keys || []).length) continue;
      const got = p.keys.reduce((s, key) => s + (((R.payout[p.type] || {})[key]) || 0), 0), inv = p.keys.length * 100;
      const t = T[id] || (T[id] = { n: 0, hit: 0, inv: 0, ret: 0 }); t.n++; t.inv += inv; t.ret += got; if (got) t.hit++;
    }
  }
  return { T, n };
}
function predStatsHTML(sv) {
  const ids = PK_IDS.filter(id => sv.T[id]); if (!ids.length) return '';
  const roi = x => x.inv ? Math.round(x.ret / x.inv * 100) + '%' : '-', nm = v => Math.round(v).toLocaleString('ja-JP');
  const all = ids.reduce((s, id) => ({ inv: s.inv + sv.T[id].inv, ret: s.ret + sv.T[id].ret }), { inv: 0, ret: 0 });
  const row = (l, x, c) => `<tr${c ? ` class="${c}"` : ''}><td>${l}</td><td>${x.n ?? ''}</td><td>${x.hit ?? ''}</td><td>${nm(x.inv)}</td><td>${nm(x.ret)}</td><td class="${cls(x.ret - x.inv)}">${roi(x)}</td></tr>`;
  return `<div class="tw"><div class="scroll"><table class="st2"><tr><th>買い方</th><th>R</th><th>的中</th><th>投資</th><th>払戻</th><th>回収率</th></tr>` +
    ids.map(id => row(esc(PK[id] || id), sv.T[id])).join('') + row('合計', { inv: all.inv, ret: all.ret }, 'sum') + `</table></div></div>` +
    '<p class="sub">保存した予想の買い目を100円ずつ買った場合（結果が出たレース・金額は円）。実際に買った馬券とは別です。</p>';
}

// ============ レース ============
function venueList(X, keys) {
  const m = new Map();
  for (const k of keys) { const t = meta(X, k).track; if (t && !m.has(t)) m.set(t, jyoOf(k) || '99'); }
  return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(x => x[0]);
}
function marksOf(X, k) {   // レース番号のボタンの印：W・転がし・当たり
  const w = wInfo(X, k), kx = kInfo(X, k), e = X.log[k], s = e ? settle(X, k, e) : null, o = [];
  if ((w && (w.st === 'pick' || (w.st === 'cand' && w.proj && w.proj.st === 'buy'))) || (e && s.bought && (e.plan.bets || []).some(isW))) o.push('<i class="w">W</i>');
  if (kx && !kx.sk && !kx.cx && (kx.leg || kx.K.status === 'alive')) o.push('<i class="k">転</i>');
  if (s && s.bought && s.ret > 0) o.push('<i class="h">当</i>');
  return o.join('');
}
$('#rVenues').addEventListener('click', e => {
  const b = e.target.closest('button[data-v]'); if (!b) return;
  S.venue = b.dataset.v; storeSet('gatein_venue', S.venue); renderRace();
});
$('#rSel').addEventListener('click', e => {
  const b = e.target.closest('button[data-k]'); if (!b) return;
  S.race[S.day + '|' + S.venue] = b.dataset.k; renderRace();
  const t = $('#race'), top = $('.bar').offsetHeight; if (t.getBoundingClientRect().top < top) window.scrollTo(0, t.getBoundingClientRect().top + window.scrollY - top - 8);
});
function renderRace() {
  const X = S.D[S.day];
  if (!X) { $('#rVenues').hidden = true; $('#rSel').innerHTML = ''; $('#race').innerHTML = '<p class="empty">この日の記録はありません</p>'; return; }
  const keys = raceKeys(X), vs = venueList(X, keys);
  if (!vs.length) { $('#rVenues').hidden = true; $('#rSel').innerHTML = ''; $('#race').innerHTML = '<p class="empty">この日のレースはありません</p>'; return; }
  const v = vs.includes(S.venue) ? S.venue : vs[0];
  const badge = {}; for (const k of keys) if (marksOf(X, k)) { const t = meta(X, k).track; badge[t] = (badge[t] || 0) + 1; }
  $('#rVenues').hidden = false;
  $('#rVenues').innerHTML = vs.map(x => `<button type="button" data-v="${esc(x)}" class="${x === v ? 'on' : ''}">${esc(x)}${badge[x] ? `<i>${badge[x]}</i>` : ''}</button>`).join('');
  const ks = keys.filter(k => meta(X, k).track === v).sort((a, b) => rnOf(a) - rnOf(b));
  let cur = S.race[S.day + '|' + v];
  if (!ks.includes(cur)) {   // 最初に開くレース：今日はこれから走るレース。終わった日は W・転がしのレース
    const now = nowMin(), today = X.d === todayStr();
    cur = (today && ks.find(k => !isDone(X.res[k]) && (tmin(meta(X, k).time) ?? 9999) >= now - 2)) || ks.find(k => marksOf(X, k)) || ks[0];
  }
  $('#rSel').innerHTML = ks.map(k => { const m = meta(X, k), mk = marksOf(X, k);
    return `<button type="button" data-k="${esc(k)}" class="${k === cur ? 'on' : ''}${isDone(X.res[k]) ? ' done' : ''}">${m.no}R<small>${esc(m.time || '')}</small>${mk ? `<span class="m">${mk}</span>` : ''}</button>`; }).join('');
  $('#race').innerHTML = raceHtml(X, cur);
  ensurePaddock(X).then(pdk => { if (pdk && S.tab === 'race' && S.D[S.day] === X && $('#race').dataset.k === cur && !$('#race').dataset.pk) { $('#race').innerHTML = raceHtml(X, cur); $('#race').dataset.pk = '1'; } });
  $('#race').dataset.k = cur; delete $('#race').dataset.pk;
}
function raceHtml(X, k) {
  if (!k) return '<p class="empty">レースがありません</p>';
  const m = meta(X, k), c = X.cd[k] || null, p = X.pd[k] || null, r = X.res[k] || null, done = isDone(r);
  const stc = done ? '<span class="st done">確定</span>' : c && c.gateUnknown ? '<span class="st gate">枠順未定</span>' : '<span class="st pre">発走前</span>';
  let h = `<div class="rhead"><div class="h"><b>${rTitle(m)}</b><span class="tm">${esc(m.time || '')}</span></div>
    <div class="meta">${esc(m.surface)}${m.dist ? m.dist + 'm' : ''}${m.n ? `・${m.n}頭` : ''}${m.going ? `・${esc(m.going)}` : ''}${m.tchg ? `・発走時刻の変更（${esc(m.tchg)}→${esc(m.time)}）` : ''}${stc}</div>${dayTrend(X, k)}</div>`;
  // 予想・買い目／パドック（馬ごと・前回との比較）を分ける（2026/10/11 ご要望）
  const PDK = pkInfoOf(X, k), npk = PDK ? Object.keys(PDK).length : 0;
  h += `<div class="rsub"><button type="button" data-rsub="pred" class="${S.rsub === 'pred' ? 'on' : ''}">予想・買い目</button><button type="button" data-rsub="pdk" class="${S.rsub === 'pdk' ? 'on' : ''}">パドック${npk ? `<small>${npk}頭</small>` : ''}</button></div>`;
  if (S.rsub === 'pdk') return h + paddockHtml(X, k);
  h += buyBoxes(X, k);
  h += predTable(X, k);
  h += betTable(X, k);
  if (done) h += resultHtml(X, k);
  if (c && (c.horses || []).length) h += fold('r.card', '出馬表（騎手・斤量・馬体重・調教）', '', cardTable(X, k, c));
  return h;
}
function dayTrend(X, k) {   // その日の馬場の傾向（家のPCの予想に入っているもの）
  const p = X.pd[k] || {}, gb = p.gb, ds = p.ds, o = [];
  if (gb && gb.bg != null && Math.abs(gb.bg) >= 0.08) o.push(`今日は${gb.bg > 0 ? '外枠' : '内枠'}有利<small>（${gb.races}R から・予想に入れている）</small>`);
  if (p.pb && p.pb.races && p.pb.label) o.push(`${esc(p.pb.label)}<small>（${p.pb.races}R から・表示だけ）</small>`);
  if (ds && Math.abs(ds.dev) >= 0.15) o.push(`今日は時計が${ds.dev < 0 ? '速い' : 'かかる'}<small>（予想タイムだけに使う）</small>`);
  return o.length ? `<div class="trend">${o.map(x => `<span>${x}</span>`).join('')}</div>` : '';
}
function buyBoxes(X, k) {
  const e = X.log[k], s = e ? settle(X, k, e) : null, w = wInfo(X, k), kx = kInfo(X, k);
  let h = '';
  if (e && s.bought) {
    const bets = (e.plan && e.plan.bets) || [], hasW = bets.some(isW);
    h += `<div class="buy ${hasW ? 'w' : 'k'}"><h3>このレースで買った馬券<span>${!s.done ? '<span class="bd wait">結果待ち</span>' : s.ret > 0 ? `<span class="bd hit">当たり ${sgn(s.ret - s.cost)}</span>` : '<span class="bd miss">外れ</span>'}</span></h3>
      <div class="tk" style="border-top:0;margin-top:0">${betGroups(X, k, bets)}</div>${w && w.st === 'pick' && w.plan ? `<div class="est">${estLine(w.plan)}</div>` : ''}</div>`;
  } else if (w) {
    if (w.st === 'skip') h += `<div class="buy"><h3>勝負レースW：見送り<span class="bd wq">見送り</span></h3><div class="sub">${esc(String(w.why || '').replace(/^勝負レースW：/, ''))}</div></div>`;
    else {
      const buyP = w.st === 'pick' || (w.proj && w.proj.st === 'buy');
      h += `<div class="buy w"><h3>${w.st === 'pick' ? `勝負レースW：買う${w.at ? `（${esc(w.at)} に決定）` : ''}` : `勝負レースW：${buyP ? '買う予定' : '候補（今のままなら見送り）'}`}<span class="bd ${buyP ? 'w' : 'wq'}">W</span></h3>
        <div class="tk" style="border-top:0;margin-top:0">${planLines(X, k, w.plan, 'W')}</div><div class="est">${estLine(w.plan)}</div>
        ${w.st === 'cand' ? `<div class="sub" style="margin-top:6px">${!buyP && w.proj && w.proj.why ? esc(w.proj.why) + '。' : ''}締切の約1分40秒前に、最新のオッズで決めます。</div>` : ''}</div>`;
    }
  }
  if (kx && !(e && s.bought && (e.plan.bets || []).some(isK))) {
    const K = kx.K, l = kx.leg, md = kBuyMode(X, K);
    let body;
    if (l) body = `<b>${esc(l.no)} ${esc(l.horse || '')}</b> の複勝に <b>${yen(l.yen)}</b>（${l.buy ? '購入' : '記録だけ'}・3着内率 ${P(l.p)}）　結果：<b>${esc(kRes(l))}</b>`;
    else if (kx.sk) body = esc(kx.sk.why);
    else if (kx.cx) body = esc(kx.cx.why || '買えなかった');
    else if (K.status !== 'alive') body = '今日の転がしは終わったので、このレースは買いません';
    else body = `締切の約1分40秒前に、最新の予想で買う馬を選びます（朝の時点では <b>${esc(kx.q.no)} ${esc(kx.q.horse || '')}</b>・3着内率 ${P(kx.q.p)}）。今の持ち金 <b>${yen(K.bank || 0)}</b> を全部`;
    h += `<div class="buy k"><h3>複勝転がし ${CIRC[kx.i]}（${(K.plan || []).length}Rの${kx.i + 1}つ目${md ? '・' + md : ''}）<span class="bd k">転</span></h3><div class="sub" style="color:var(--ink)">${body}</div></div>`;
  }
  return h;
}
// パドック（馬ごと）のタブ（2026/10/11 ご要望）：今回の診断と、同じ馬の前回の診断（200日以内）との比較をカードで
function paddockHtml(X, k) {
  if (X.pdk === undefined) return '<p class="empty">読み込み中…</p>';
  const PDK = pkInfoOf(X, k), c = X.cd[k], p = X.pd[k], r = X.res[k], done = isDone(r);
  if (!PDK || !Object.keys(PDK).length) return `<p class="empty">このレースのパドック診断は${done ? 'ありません' : 'まだありません。パドックの周回が始まると、家のPCが自動で診断します（発走の20〜30分前）'}</p>`;
  const pr = Object.fromEntries(((p && p.horses) || []).map(h => [+h.no, h]));
  let hs = ((c && c.horses) || []).filter(h => !h.scr).map(h => ({ no: +h.no, name: h.name, w: (c || {}).gateUnknown ? 0 : h.w, pop: h.pop }));
  if (!hs.length) hs = ((p && p.horses) || []).map(h => ({ no: +h.no, name: h.name, w: 0, pop: h.pop }));
  const fin = no => { const i = ((r && r.order) || []).indexOf(+no); return i >= 0 ? i + 1 : null; };
  const rows = hs.map(h => ({ h, pk: PDK[String(h.no)] || null }));
  rows.sort((a, b) => S.pkSort === 'no' ? a.h.no - b.h.no : ((a.pk && a.pk.rank != null ? a.pk.rank : 99) - (b.pk && b.pk.rank != null ? b.pk.rank : 99)) || a.h.no - b.h.no);
  const nPrev = rows.filter(x => x.pk && x.pk.prev).length;
  const cards = rows.map(({ h, pk }) => {
    const q = pr[h.no], f = done ? fin(h.no) : null;
    const head = `<div class="pch">${uChip(h.no, h.w)}<b>${esc(h.name || (q && q.name) || '')}</b>${pk ? `<span class="pk pk-${pdkTier(pk)}">${pk.rank != null ? pk.rank + '位' : (pkT(pk) ?? '-') + '点'}</span>` : ''}</div>` +
      `<div class="sub">${q ? `勝率 ${P(q.win)}・3着内 ${P(q.fuku)}` : ''}${h.pop ? `・${h.pop}人気` : ''}${f ? `・<b class="${f <= 3 ? 'plus' : ''}">${f}着</b>` : ''}</div>`;
    const body = pk ? pkDetail(pk, { noNote: true }) + (pk.rubric === 'v4' && !pk.prev ? '<div class="sub nop">前回の診断なし（200日以内）</div>' : '') : '<div class="sub">まだ診断がありません</div>';
    return `<div class="pc" id="pc-${h.no}">${head}<div class="pb">${body}</div></div>`;
  }).join('');
  return `<div class="seg"><span>並び</span><button type="button" data-pks="rank" class="${S.pkSort !== 'no' ? 'on' : ''}">パドックの順位</button><button type="button" data-pks="no" class="${S.pkSort === 'no' ? 'on' : ''}">馬番</button><span>前回の診断あり ${nPrev}頭</span></div>` +
    cards + '<p class="foot2">80点＝問題なし（悪い所を引いた点）。赤は減点になった値・緑は良い値。前回との比較：緑＝良くなった・赤＝悪くなった。予想・買い目には入れていません。</p>';
}
function pkInfoOf(X, k) { return X.pdk && X.pdk[k] ? X.pdk[k].horses || {} : null; }
function predTable(X, k) {
  const p = X.pd[k], c = X.cd[k], r = X.res[k], done = isDone(r);
  const ch = Object.fromEntries(((c && c.horses) || []).map(h => [+h.no, h]));
  let hs = p && (p.horses || []).length ? p.horses.map(h => ({ ...h })) : ((c && c.horses) || []).filter(h => !h.scr).map(h => ({ no: h.no, name: h.name, win: h.win, fuku: h.f3, pop: h.pop, odds: h.odds })).sort((a, b) => (b.win || 0) - (a.win || 0));
  if (!hs.length) return '';
  const PDK = pkInfoOf(X, k), fin = no => { const i = ((r && r.order) || []).indexOf(+no); return i >= 0 ? i + 1 : null; };
  const show = S.pdAll ? hs : hs.slice(0, 6);
  const rows = show.map((h, i) => {
    const cc = ch[+h.no] || {}, f = fin(h.no), pk = PDK ? PDK[String(h.no)] || null : null;
    const odds = cc.odds || h.odds, pop = cc.pop || h.pop;
    return `<tr class="${cc.scr ? 'scr' : ''}${done && f && f <= 3 ? ' t3' : ''}${pk ? ' haspk' : ''}"${pk ? ` data-no="${esc(h.no)}"` : ''}>` +
      `<td class="mk">${MARKS[hs.indexOf(h)] || ''}</td><td class="nm"><div class="n">${uChip(h.no, cc.w != null && !(c || {}).gateUnknown ? cc.w : 0)}<span>${esc(h.name || cc.name || '')}</span></div></td>` +
      `<td>${P(h.win)}</td><td>${P(h.fuku)}</td><td><span class="o">${odds ? Number(odds).toFixed(1) : '-'}</span>${pop ? `<div class="sub">${pop}人気</div>` : ''}</td>` +
      (PDK ? `<td>${pkCell(pk)}</td>` : '') + (done ? `<td class="fin">${f || (cc.scr ? '消' : '-')}</td>` : '') + '</tr>';
  }).join('');
  const head = `<tr><th></th><th style="text-align:left">馬</th><th>勝率</th><th>3着内</th><th>オッズ</th>${PDK ? '<th>パドック</th>' : ''}${done ? '<th>着</th>' : ''}</tr>`;
  const at = p && p.savedAt ? new Date(p.savedAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : '';
  return `<div class="sh"><h2>予想</h2><span>勝率の順${at ? `・${at}の予想` : ''}</span></div>
    <div class="tw"><div class="scroll"><table class="pt" data-k="${esc(k)}">${head}${rows}</table></div>${hs.length > 6 ? `<button type="button" class="tmore" data-pdall="1">${S.pdAll ? '上位6頭だけにする ▲' : `全頭を見る（${hs.length}頭） ▶`}</button>` : ''}</div>
    ${PDK ? '<p class="foot2">パドックの欄を押すと、AIの診断の中身が出ます（予想・買い目には入れていません）。</p>' : ''}`;
}
function betTable(X, k) {
  const p = X.pd[k]; if (!p || !p.pk) return '';
  const st = p.pkStats || {}, w = wInfo(X, k), used = new Set(w && w.plan && w.plan.pks ? w.plan.pks.map(x => x.id) : []);
  const done = isDone(X.res[k]);
  const rows = PK_IDS.filter(id => p.pk[id] && (p.pk[id].keys || []).length).map(id => ({ id, ...p.pk[id], s: st[id] || {} }))
    .sort((a, b) => ((b.s.roi ?? -1) - (a.s.roi ?? -1)));
  if (!rows.length) return '';
  const tr = rows.map(x => {
    const got = done ? x.keys.reduce((a, key) => a + payOf(X, k, x.type, key), 0) : 0;
    return `<tr class="cl${used.has(x.id) ? ' wu' : ''}"><td><div class="t">${esc(PK[x.id] || x.id)}${used.has(x.id) ? ' <span class="bd w">W</span>' : ''}</div><div class="ks">${x.keys.map(esc).join('・')}</div>${got ? `<div class="gotp">当たり 払戻 ${yen(got)}（100円ずつ）</div>` : ''}</td>` +
      `<td>${x.keys.length}点</td><td class="roi">${P(x.s.roi)}</td><td>${P(x.s.hit)}</td></tr>`;
  }).join('');
  return `<div class="sh"><h2>買い目（全部の買い方）</h2><span>推定回収率の高い順</span></div>
    <div class="tw"><div class="scroll"><table class="bt"><tr><th>買い方・組</th><th>点数</th><th>推定回収率</th><th>当たる見込み</th></tr>${tr}</table></div></div>
    <p class="foot2">${used.size ? '赤い行＝勝負レースWで使う買い方。' : ''}行を押すと組を全部出します。ワイド・複勝は、オッズの幅のまん中で計算しています。</p>`;
}
function ttLine(R) {   // 1〜3着のタイム・上がり3F
  const tt = (R && R.top3t) || {};
  const xs = ((R && R.order) || []).slice(0, 3).map((no, i) => { const x = tt[String(no)]; return x && (x.t || x.l3) ? `<span><b>${i + 1}着</b> ${x.t ? fmtT(x.t) : ''}${x.l3 ? ` 上がり${x.l3.toFixed(1)}` : ''}</span>` : ''; }).filter(Boolean);
  return xs.length ? `<div class="tt">${xs.join('')}</div>` : '';
}
function payoutHtml(p) {
  if (!p) return '';
  const rows = PAYJP.flatMap(([t, l]) => Object.entries(p[t] || {}).map(([k, v], i) => `<tr><td>${i ? '' : l}</td><td class="k">${esc(k)}</td><td class="y">${yen(v)}</td></tr>`));
  return rows.length ? `<div class="tw"><table class="pay">${rows.join('')}</table></div>` : '';
}
function resultHtml(X, k) {
  const r = X.res[k]; if (!r) return '';
  const top = (r.order || []).slice(0, 3);
  return `<div class="sh"><h2>結果</h2><span>100円あたりの払戻</span></div>
    <div class="rhead"><div class="order">${top.length ? top.map((n, i) => `<b>${i + 1}着</b> ${uChip(n, wakuOf(X, k, n))} ${esc(horseName(X, k, n))}`).join('<br>') : esc(r.result || '確定待ち')}</div>${ttLine(r)}</div>
    ${payoutHtml(r.payout) || ''}`;
}
// 調教の前走比：今回・前走時・2走前時の 東スポの最終追い切りと JRA-VAN の速い追い切りの点・28日の本数・そのときの着順
function tcRow(h, nc) {
  const c = h.tc; if (!S.tcOn || !c || c.length < 2) return '';
  const cur = c[0], cp = cur.ts ? cur.ts[5] : null;
  const line = (o, i) => {
    const lab = o.l === '今回' ? '今回' : o.l + '時', f = o.r ? +o.r[1] : 0;
    const res = o.r ? `<span class="tr">${esc(o.r[0] || '')} <b class="${f === 1 ? 'f1' : f && f <= 3 ? 'f3' : ''}">${o.r[1] ?? '-'}着</b></span>` : '';
    const pd = i && cp != null && o.ts && o.ts[5] != null ? cp - o.ts[5] : null;
    const ts = o.ts ? `<span>${esc(o.ts[0] || '')} ${esc(o.ts[1] || '')}${esc(o.ts[2] || '')} ${esc(String(o.ts[3] || '').split('-').slice(-2).join('-'))} ${esc(String(o.ts[4] || '').replace(/\s*\(\d+\)/, ''))} <b class="${pd == null ? '' : pd > 0 ? 'up' : pd < 0 ? 'dn' : ''}">評${o.ts[5] ?? '-'}</b></span>` : '<span class="sub">東スポなし</span>';
    const same = i && o.wd && o.wd === cur.wd, d = i && !same && cur.s != null && o.s != null ? cur.s - o.s : null;
    const sc = o.s == null ? '<span class="sub">点－</span>' : `<span class="${d == null ? '' : d >= 0.5 ? 'up' : d <= -0.5 ? 'dn' : ''}">点${o.s > 0 ? '+' : ''}${Number(o.s).toFixed(1)}</span>`;
    return `<div class="tcl"><span class="lb">${lab}</span>${ts}${sc}<span class="sub">${o.n ?? 0}本</span>${same ? '<span class="sub">今回と同じ追い切り</span>' : ''}${res}</div>`;
  };
  const p1 = c[1], dd = (x, y) => { const f = v => new Date(+String(v).slice(0, 4), +String(v).slice(4, 6) - 1, +String(v).slice(6, 8)); return (f(x) - f(y)) / 864e5; };
  const up = cur.s != null && p1.s != null && cur.n != null && p1.n != null && cur.wd && p1.wd && cur.n - p1.n >= 3 && cur.s - p1.s >= 0.5 && (!cur.d || !p1.d || dd(cur.d, p1.d) <= 120);
  return `<tr class="tcx"><td colspan="${nc}">${up ? '<div class="tcu">調教の量と質が前走時より上<span class="sub">（過去11年で人気より来た：3着内 1.07倍）</span></div>' : ''}${c.map(line).join('')}</td></tr>`;
}
function cardTable(X, k, r) {
  const done = isDone(X.res[k]);
  const hs = (r.horses || []).slice().sort((a, b) => a.no - b.no);
  const rows = hs.map(h => `<tr class="${h.scr ? 'scr' : ''}${done && h.fin && h.fin <= 3 ? ' top3' : ''}">${done ? `<td class="fin">${h.fin || (h.scr ? '消' : '-')}</td>` : ''}` +
    `<td>${uChip(h.no, r.gateUnknown ? 0 : h.w)}</td><td class="mk">${esc(h.mk || '')}</td>` +
    `<td class="nm"><b>${esc(h.name || '')}</b><div class="sub">${esc(h.sa || '')}・${h.kg ?? '-'}kg・${esc(h.jk || '')}${h.jkb ? `（${esc(h.jkb)}から）` : ''}${h.wt ? `・${h.wt}kg${h.wd != null && h.wd !== '' ? `（${h.wd > 0 ? '+' : ''}${h.wd}）` : ''}` : ''}${h.note ? `・${esc(h.note)}` : ''}</div></td>` +
    `<td><b>${h.odds ? Number(h.odds).toFixed(1) : '-'}</b><div class="sub">${h.pop ? h.pop + '人気' : ''}</div></td></tr>` + tcRow(h, done ? 5 : 4)).join('');
  const head = `<tr>${done ? '<th>着</th>' : ''}<th>馬番</th><th></th><th style="text-align:left">馬名・騎手</th><th>オッズ</th></tr>`;
  const tc = hs.some(h => h.tc) ? `<div class="seg"><span>調教の前走比</span><button type="button" data-tc="1" class="${S.tcOn ? 'on' : ''}">出す</button><button type="button" data-tc="0" class="${S.tcOn ? '' : 'on'}">出さない</button></div>` : '';
  return `${tc}<div class="tw"><div class="scroll"><table class="ct">${head}${rows}</table></div></div>` +
    (r.gateUnknown ? '<p class="sub">枠順が決まる前の確定出走馬です。馬番は馬名の50音順に付けた仮の番号です。</p>' : '') +
    `<p class="sub">${X.cdMade ? `${esc(X.cdMade)} 時点の写し。` : ''}オッズ・馬体重は写した時点のものです。</p>`;
}
$('#race').addEventListener('click', e => {
  const rs = e.target.closest('button[data-rsub]');
  if (rs) { S.rsub = rs.dataset.rsub; storeSet('gatein_rsub', S.rsub); renderRace(); return; }
  const ps = e.target.closest('button[data-pks]');
  if (ps) { S.pkSort = ps.dataset.pks; storeSet('gatein_pksort', S.pkSort); renderRace(); return; }
  const gp = e.target.closest('button[data-gopdk]');
  if (gp) {
    S.rsub = 'pdk'; storeSet('gatein_rsub', 'pdk'); renderRace();
    const el = document.getElementById('pc-' + gp.dataset.gopdk), top = $('.bar').offsetHeight;
    if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - top - 8);
    return;
  }
  const t = e.target.closest('button[data-tc]');
  if (t) { S.tcOn = t.dataset.tc === '1'; storeSet('gatein_tc', S.tcOn ? '1' : '0'); renderRace(); return; }
  if (e.target.closest('button[data-pdall]')) { S.pdAll = !S.pdAll; storeSet('gatein_pdall2', S.pdAll ? 'all' : '6'); renderRace(); return; }
  const br = e.target.closest('table.bt tr.cl'); if (br) { br.classList.toggle('full'); return; }
  const tr = e.target.closest('table.pt tr.haspk'); if (!tr) return;   // パドック診断の中身を開く・閉じる
  const nx = tr.nextElementSibling;
  if (nx && nx.classList.contains('pkd')) { nx.remove(); tr.classList.remove('open'); return; }
  const X = S.D[S.day], k = tr.closest('table').dataset.k, PDK = X && pkInfoOf(X, k), pk = PDK ? PDK[tr.dataset.no] : null; if (!pk) return;
  const row = document.createElement('tr'); row.className = 'pkd';
  row.innerHTML = `<td colspan="${tr.children.length}">${pkDetail({ ...pk, no: tr.dataset.no }, { noPrev: true })}</td>`;
  tr.after(row); tr.classList.add('open');
});

// ---------- パドック診断（AI）：v3＝9項目を1〜10点、v4＝6項目（100点満点・ふつう80） ----------
const PDK_ITEM3 = [['spirit', '気合い'], ['calm', '落ち着き'], ['muscle', '張り'], ['coat', '毛ヅヤ'], ['stride', '踏み込み'], ['gait', '歩様'], ['neck', '首の使い方'], ['focus', '集中'], ['build', '仕上がり']];
const PDK_WARN = ['発汗多い', '入れ込み', '制御できない', '二人引き', '外傷・腫れ', '馬っ気'];
const PDK_ITEM4 = [['gait', '歩様'], ['control', '制御'], ['tension', 'テンション'], ['neck', '首'], ['body', '馬体'], ['coat', '毛ヅヤ']];
const PDK_BODY = { '-2': '細い', '-1': 'やや細', '0': 'ちょうど', '1': 'やや太', '2': '太い' }, PDK_COAT = { 1: '悪い', 2: 'ふつう', 3: '良い' };
const pk4Txt = (k, v) => v == null ? '－' : k === 'tension' ? (v > 0 ? '+' + v : String(v)) : k === 'body' ? PDK_BODY[String(v)] || String(v) : k === 'coat' ? PDK_COAT[v] || String(v) : String(v);
function pk4Cls(pk, k, v) {
  if (v == null) return ' na';
  if (k === 'tension') { const b = pk.band || [-2, 1]; return v < b[0] || v > b[1] ? ' lo' : ''; }
  if (k === 'body') return Math.abs(v) >= 2 ? ' lo' : '';
  if (k === 'coat') return v <= 1 ? ' lo' : v >= 3 ? ' hi' : '';
  return v <= 2 ? ' lo' : v >= 4 ? ' hi' : '';
}
function pkPrevDir(pk, k, a, b) {
  if (a == null || b == null || a === b) return 0;
  if (k === 'tension') { const B = pk.band || [-2, 1], o = v => Math.max(0, B[0] - v, v - B[1]); return o(b) < o(a) ? 1 : o(b) > o(a) ? -1 : 0; }
  if (k === 'body') return Math.abs(b) < Math.abs(a) ? 1 : Math.abs(b) > Math.abs(a) ? -1 : 0;
  return b > a ? 1 : -1;
}
function pkPrev4(pk) {
  const p = pk && pk.prev; if (!p) return '';
  const pv = p.vals || {}, cv = pk.vals || {}, parts = [];
  for (const [k, nm] of PDK_ITEM4) { const a = pv[k], b = cv[k]; if (a != null && b != null && a !== b) parts.push([`${nm} ${pk4Txt(k, a)}→${pk4Txt(k, b)}`, pkPrevDir(pk, k, a, b)]); }
  for (const f of p.new || []) parts.push([`新たに${f}`, -1]);
  for (const f of p.gone || []) parts.push([`${f}が消えた`, 1]);
  const d = p.date || '', yr = d.slice(0, 4) !== String(new Date().getFullYear()) ? d.slice(0, 4) + '/' : '';
  return `<div class="pkp"><span class="h">前走比（${esc(yr)}${+d.slice(4, 6)}/${+d.slice(6, 8)} ${esc(p.race || '')}・${p.total ?? '-'}点${p.overall ? ' ' + esc(p.overall) : ''}）</span>` +
    (parts.length ? parts.map(([t, c]) => `<span class="${c > 0 ? 'g' : c < 0 ? 'w' : ''}">${esc(t)}</span>`).join('') : '<span>変わりなし</span>') +
    (p.dt ? `<span class="${p.dt > 0 ? 'g' : 'w'}">合計${p.dt > 0 ? '+' : ''}${p.dt}</span>` : '') + '</div>';
}
function pkDetail4(pk, o = {}) {   // o.noPrev：前回との比較を出さない（予想の表）・o.noNote：下の説明を出さない（パドックのタブ）
  const its = PDK_ITEM4.map(([k, nm]) => { const v = (pk.vals || {})[k]; return `<span class="pki${pk4Cls(pk, k, v)}"><i>${nm}</i><b>${esc(pk4Txt(k, v))}</b></span>`; }).join('');
  const fl = (pk.flags || []).map(f => `<span class="${f.lv === '重' ? 'w' : f.lv === '中' ? 'm' : ''}">${esc(f.f)}${f.lv !== '情報' ? `（${esc(f.lv)}）` : ''}</span>`).join('') + (pk.gear || []).map(g => `<span>${esc(g)}</span>`).join('');
  const cm = pk.cmp && pk.cmp.note && pk.score_by === '見比べ' ? pk.cmp.note : '';
  return `<div class="pkh">パドック診断（AI${pk.score_by === '見比べ' ? '・全馬を見比べ' : ''}）<b>${pk.total ?? '-'}</b>/100点・総合 <b>${esc(pk.overall || '-')}</b> ${esc(pk.label || '')}${pk.rank != null ? `（${pk.rank}位/${pk.rank_n}頭）` : ''}</div>` +
    `<div class="pkg">${its}</div>${fl ? `<div class="pkf">${fl}</div>` : ''}${o.noPrev ? '' : pkPrev4(pk)}${cm ? `<div><b>${esc(cm)}</b></div>` : ''}<div>${esc(pk.comment || '')}</div>` +
    `${pk.no_ok === false ? '<div class="sub">※ゼッケンの読み取りが馬番と違います（参考）</div>' : ''}` +
    (o.noPrev && pk.prev ? `<button type="button" class="gopk" data-gopdk="${esc(String(pk.no || ''))}">前回との比較を見る（パドックのタブ）▶</button>` : '') +
    (o.noNote ? '' : '<div class="sub">80点＝問題なし（悪い所を引いた点）。赤は減点になった値・緑は良い値。予想・買い目には入れていません</div>');
}
const pkv = v => v && typeof v === 'object' ? v.v : v;
function pdkTier(x) {
  if (x.rubric === 'v4') return x.overall || 'B';
  const t = x.dev == null ? (x.overall || 'B') : x.dev >= 60 ? 'A' : x.dev >= 45 ? 'B' : x.dev >= 35 ? 'C' : 'D';
  return (x.notes || []).some(n => n === '入れ込み' || n === '制御できない') && (t === 'A' || t === 'B') ? 'C' : t;
}
const pkC = pk => pk && pk.cmp && pk.cmp.items ? pk.cmp : null;
const pkT = pk => { if (pk.rubric === 'v4') return pk.total; const C = pkC(pk); return C && C.total != null ? C.total : pk.total; };
function pkCell(pk) {
  if (!pk) return '<span class="sub">-</span>';
  if (pk.rubric === 'v3' || pk.rubric === 'v4') {
    return pkT(pk) == null ? '<span class="sub">-</span>' : `<span class="pk pk-${pdkTier(pk)}">${pk.rank != null ? pk.rank + '位' : pkT(pk) + '点'}</span><div class="sub">${pkT(pk)}点</div>`;   // 前回との比較はパドックのタブ
  }
  return pk.overall ? `<span class="pk pk-${esc(pk.overall)}">${esc(pk.overall)}</span>` : '<span class="sub">-</span>';
}
function pkDetail(pk, o = {}) {
  if (pk.rubric === 'v4') return pkDetail4(pk, o);
  const fl = (pk.notes || []).map(n => `<span class="${PDK_WARN.includes(n) ? 'w' : ''}">${esc(n)}</span>`).join('') + (pk.gear || []).map(g => `<span>${esc(g)}</span>`).join('');
  const note = pk.no_ok === false ? '<div class="sub">※ゼッケンの読み取りが馬番と違います（参考）</div>' : '';
  if (pk.rubric !== 'v3') return `<div class="pkh">パドック診断（AI）<b>${esc(pk.overall || '-')}</b> ${esc(pk.label || '')}</div>${fl ? `<div class="pkf">${fl}</div>` : ''}<div>${esc(pk.comment || '')}</div>${note}`;
  const vs = pk.vs || {}, C = pkC(pk), src = C ? C.items : (pk.items || {});
  const bars = PDK_ITEM3.map(([k, nm]) => {
    const v = pkv(src[k]), d = vs[k];
    return `<span class="pdn">${nm}</span><span class="pdbar${v == null ? '' : v <= 3 ? ' lo' : v >= 8 ? ' hi' : ''}">${v == null ? '' : `<i style="width:${v * 10}%"></i>`}</span>` +
      `<span class="pdv">${v == null ? '－' : v}${k === 'build' && pk.build_dir && pk.build_dir !== 'ちょうど' ? `<small>${esc(pk.build_dir)}</small>` : ''}${d != null && Math.abs(d) >= 1.5 ? `<small class="${d > 0 ? 'up' : 'dn'}">${d > 0 ? '▲' : '▼'}${Math.abs(d).toFixed(1)}</small>` : ''}</span>`;
  }).join('');
  return `<div class="pkh">パドック診断（AI${C ? '・全馬を見比べ' : ''}）合計 <b>${pkT(pk) ?? '-'}</b>/90点${pk.dev != null ? `・偏差値${Math.round(pk.dev)}（${pk.rank}位/${pk.rank_n}頭）` : ''}</div>` +
    `<div class="pkb">${bars}</div>${fl ? `<div class="pkf">${fl}</div>` : ''}${C && C.note ? `<div><b>${esc(C.note)}</b></div>` : ''}<div>${esc(pk.comment || '')}</div>${note}` +
    '<div class="sub">1〜10点（5＝ふつう）。3以下は赤・8以上は緑。予想・買い目には入れていません</div>';
}

// ============ 収支（実際に買った分・直近14開催日） ============
async function renderPL() {
  const box = $('#pl');
  if (!S.pl) {
    box.innerHTML = '<p class="empty">読み込み中…</p>';
    const days = Object.keys(S.idx.log).sort().reverse().slice(0, 14);
    const out = [];
    for (const d of days) {
      const X = await ensureDay(d);
      const t = { d, cost: 0, ret: 0, n: 0, hit: 0, wc: 0, wr: 0, kc: 0, kr: 0 };
      for (const [k, e] of Object.entries(X.log)) {
        const s = settle(X, k, e); if (!s.bought) continue;
        t.n++; t.cost += s.cost; t.ret += s.ret; if (s.ret > 0) t.hit++;
        for (const b of e.plan.bets || []) {
          const y = payOf(X, k, b.type, b.key) * Math.floor((+b.yen || 0) / 100);
          if (isK(b)) { t.kc += +b.yen || 0; t.kr += y; } else if (isW(b)) { t.wc += +b.yen || 0; t.wr += y; }
        }
      }
      out.push(t);
    }
    S.pl = out;
  }
  const out = S.pl, T = out.reduce((a, r) => { for (const k of ['cost', 'ret', 'n', 'hit', 'wc', 'wr', 'kc', 'kr']) a[k] += r[k]; return a; }, { cost: 0, ret: 0, n: 0, hit: 0, wc: 0, wr: 0, kc: 0, kr: 0 });
  const roi = (c, r) => c ? Math.round(r / c * 100) + '%' : '-';
  box.innerHTML = `<div class="cards">${[['投資（直近）', yen(T.cost)], ['払戻', yen(T.ret)], ['収支', `<span class="${cls(T.ret - T.cost)}">${sgn(T.ret - T.cost)}</span>`], ['回収率', roi(T.cost, T.ret)]]
      .map(([k, v]) => `<div class="card"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('')}</div>
    <div class="tw"><table class="st2"><tr><th>内わけ</th><th>投資</th><th>払戻</th><th>回収率</th></tr>
      <tr><td>勝負レースW</td><td>${yen(T.wc)}</td><td>${yen(T.wr)}</td><td class="${cls(T.wr - T.wc)}">${roi(T.wc, T.wr)}</td></tr>
      <tr><td>複勝転がし</td><td>${yen(T.kc)}</td><td>${yen(T.kr)}</td><td class="${cls(T.kr - T.kc)}">${roi(T.kc, T.kr)}</td></tr></table></div>
    <h3 class="s">日ごと</h3>
    <div class="tw"><div class="scroll"><table class="st2"><tr><th>日付</th><th>R</th><th>的中</th><th>投資</th><th>払戻</th><th>収支</th></tr>${out.map(r => `<tr><td>${mdw(r.d)}</td><td>${r.n}</td><td>${r.hit}</td><td>${yen(r.cost)}</td><td>${yen(r.ret)}</td><td class="${cls(r.ret - r.cost)}">${sgn(r.ret - r.cost)}</td></tr>`).join('')}</table></div></div>
    <p class="sub">自動投票で実際に買った分です。結果が出ていないレースは払戻0円で数えています。複勝転がしは1回ごとの払戻（前の回の払戻を次に全部）で数えています。</p>`;
}

// ============ 反省会 ============
async function renderReview() {
  const I = S.idx || {}, days = Object.keys(I.rv || {}).sort().reverse();
  $('#rvDay').innerHTML = days.map(d => `<option value="${d}"${d === S.rvDay ? ' selected' : ''}>${mdw(d)}</option>`).join('') || '<option>反省会の記録なし</option>';
  if (!days.length) { $('#review').innerHTML = '<p class="empty">まだ反省会の記録がありません（その日の全レースが終わってから、家のPCが作ります）</p>'; return; }
  if (!S.rvDay || !days.includes(S.rvDay)) S.rvDay = days[0];
  $('#rvDay').value = S.rvDay;
  const [r, tot] = await Promise.all([S.rv[S.rvDay] !== undefined ? S.rv[S.rvDay] : readJson(I.rv[S.rvDay]), S.rv._total !== undefined ? S.rv._total : readJson(I.rvTotal)]);
  S.rv[S.rvDay] = r; S.rv._total = tot;
  $('#review').innerHTML = reviewHtml(r, tot);
}
$('#rvDay').addEventListener('change', e => { S.rvDay = e.target.value; renderReview(); });
function kpiHtml(K, lab) {   // 着順の当たり具合：オッズなしの見立て・最終の予想・人気順
  if (!K || !K.order) return '';
  const O = K.order, cols = [['mitate', '見立て'], ['final', '最終'], ['ninki', '人気順']].filter(([k]) => O[k]);
  if (!cols.length) return '';
  const row = (name, f, fmt, lower) => {
    const vs = cols.map(([k]) => f(O[k])), b = lower ? Math.min(...vs) : Math.max(...vs);
    return `<tr><td>${name}</td>${vs.map(v => `<td>${v === b && cols.length > 1 ? `<b class="plus">${fmt(v)}</b>` : fmt(v)}</td>`).join('')}</tr>`;
  };
  return `<h3 class="s">着順の当たり具合（${lab}・${O[cols[0][0]].n}R）</h3>
    <div class="tw"><table class="st2"><tr><th></th>${cols.map(([, t]) => `<th>${t}</th>`).join('')}</tr>` +
    row('順位の相関', o => o.sp, v => v.toFixed(2)) + row('着順のずれ', o => o.mae, v => v.toFixed(2) + '着', true) +
    row('上位3頭→3着内', o => o.in3, v => v.toFixed(2) + '頭') + row('上位5頭→掲示板', o => o.in5, v => v.toFixed(2) + '頭') +
    row('1番手の勝率', o => o.win, P) + row('1番手の3着内', o => o.top3, P) + row('1番手の大敗', o => o.big, P, true) + `</table></div>` +
    '<p class="sub">見立て＝オッズを使わない能力モデル。最終＝締切前のオッズと検証を入れた予想。太字はその行でいちばん良いもの。</p>';
}
function trackHtml(T, lab) {   // 表示した的中率・回収率と、実際（実際に買ったレースの積み上げ）
  if (!T) return '';
  const rows = [];
  const add = (name, x) => { if (!x || !x.n) return; rows.push(`<tr><td>${name}</td><td>${x.n}</td><td>${P(x.estHit / x.n)}</td><td><b>${P(x.hit / x.n)}</b></td><td>${x.estCost ? P(x.estRet / x.estCost) : '-'}</td><td class="${cls(x.ret - x.cost)}"><b>${x.cost ? P(x.ret / x.cost) : '-'}</b></td></tr>`); };
  for (const [t, x] of Object.entries(T.W || {})) add(`W ${esc(x.name || t)}`, x);
  if (Object.keys(T.W || {}).length > 1) add('W 合計', T.Wall);
  add('複勝転がし', T.K);
  if (!rows.length) return '';
  return `<h3 class="s">表示した数字と実際（${lab}）</h3><div class="tw"><div class="scroll"><table class="st2"><tr><th></th><th>R</th><th>的中<br>表示</th><th>的中<br>実際</th><th>回収<br>表示</th><th>回収<br>実際</th></tr>${rows.join('')}</table></div></div>` +
    '<p class="sub">実際に買ったレースで、買う前に表示していた「当たる見込み・推定回収率」と、実際の結果を並べています。これからの数字が積み上がるほど確かになります。</p>';
}
function pdkHtml(T, lab) {   // パドックの点と結果（予想の3着内率と比べて来たか）
  if (!T || !Object.keys(T).length) return '';
  const order = ['上位（1〜3位）', '中くらい', '下位', 'A', 'B', 'C', 'D'];
  const rows = Object.entries(T).sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0])).map(([k, x]) => `<tr><td>${esc(k)}</td><td>${x.n}</td><td>${P(x.pred)}</td><td><b>${P(x.top3)}</b></td><td class="${cls(x.top3 - x.pred)}">${x.top3 - x.pred >= 0 ? '+' : ''}${Math.round((x.top3 - x.pred) * 100)}</td></tr>`).join('');
  return `<h3 class="s">パドック診断と結果（${lab}）</h3><div class="tw"><table class="st2"><tr><th>パドック</th><th>頭数</th><th>予想の3着内</th><th>実際</th><th>差</th></tr>${rows}</table></div>` +
    '<p class="sub">パドックの点が良かった馬が、予想の3着内率より来たかどうか。予想にはまだ入れていません。積み上がって差がはっきりしたら、予想に入れるかを決めます。</p>';
}
function reviewHtml(r, tot) {
  if (!r) return '<p class="empty">読めませんでした</p>';
  const s = r.summary || {}, pk = s.pk || {}, sh = s.shape || {};
  const rows = Object.entries(pk).filter(([k]) => k !== 'santan').map(([k, v]) => ({ k, ...v })).sort((a, b) => (b.ret / (b.cost || 1)) - (a.ret / (a.cost || 1)));
  const top = rows.filter(v => v.k.startsWith('_')), rest = rows.filter(v => !v.k.startsWith('_'));
  const row = v => `<tr><td>${esc(PK[v.k] || v.k)}${v.k === '_koro' && v.buy === false ? '（記録だけ）' : ''}</td><td>${v.races}</td><td>${v.hit}</td><td>${yen(v.cost)}</td><td>${yen(v.ret)}</td><td class="${cls(v.ret - v.cost)}">${v.cost ? Math.round(v.ret / v.cost * 100) + '%' : '-'}</td></tr>`;
  const all = tot && tot.all, rec = tot && tot.recent;
  return `<div class="cards">
      <div class="card"><div class="k">レース</div><div class="v">${s.races ?? '-'}</div></div>
      <div class="card"><div class="k">本命の3着内</div><div class="v">${s.axisIn3 ?? '-'}/${s.races ?? '-'}</div></div>
      <div class="card"><div class="k">3連複 的中</div><div class="v">${s.hit ?? '-'}</div></div>
      <div class="card"><div class="k">位置取りの当たり</div><div class="v">${sh.posCorr != null ? sh.posCorr.toFixed(2) : '-'}</div></div></div>
    ${trackHtml(s.track, 'この日')}
    ${rec && rec.track ? trackHtml(rec.track, '直近8週') : ''}
    <h3 class="s">買い方ごとの成績（この日）</h3>
    <div class="tw"><div class="scroll"><table class="st2"><tr><th>買い方</th><th>R</th><th>的中</th><th>購入</th><th>払戻</th><th>回収率</th></tr>${top.map(row).join('')}${rest.length && top.length ? '<tr class="grp"><td colspan="6">予想の買い目を100円ずつ買った場合</td></tr>' : ''}${rest.map(row).join('')}</table></div></div>
    ${pdkHtml(s.paddock, 'この日')}${rec && rec.paddock ? pdkHtml(rec.paddock, '直近8週') : ''}
    ${kpiHtml(s.kpi, 'この日')}
    ${rec && rec.kpi ? kpiHtml(rec.kpi, '直近8週') : ''}
    ${s.miss ? `<h3 class="s">外れた理由</h3><div class="tw"><table class="st2">${Object.entries(s.miss).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${v}R</td></tr>`).join('')}</table></div>` : ''}
    ${all && all.track ? trackHtml(all.track, 'これまで全部') : ''}`;
}

// ============ 設定 ============
function renderSetting() {
  const st = S.status || {}, se = st.settings || {}, sa = st.state || {};
  const types = (se.types || []).map(t => t === 'shobuW' ? '勝負レースW' : PK[t] || t).join('・') || 'なし';
  const th = storeGet('gatein_theme') || 'auto';
  $('#setting').innerHTML = `<h3 class="s" style="margin-top:4px">自動投票（家のPCの設定）</h3><div class="tw"><table class="kv">
    <tr><td>自動投票</td><td>${se.enabled ? '<b class="plus">ON</b>' : 'OFF'}</td></tr>
    <tr><td>買い方</td><td>${esc(types)}</td></tr>
    <tr><td>複勝転がし</td><td>${se.korogashi ? '<b class="plus">買う</b>（1,000円から・1日5R・負けの上限の外）' : '買わない（記録だけ）'}</td></tr>
    <tr><td>1日の負けの上限</td><td>${se.dayLoss ? yen(se.dayLoss) : 'なし'}</td></tr>
    <tr><td>締切の何分前に判断</td><td>${se.closeOffset ?? se.beforeClose ?? '-'}分</td></tr>
    <tr><td>いまの状態</td><td>${esc(sa.msg || sa.need || '-')}</td></tr></table></div>
    <p class="sub">設定の変更や購入は家のパソコンだけでできます。この画面からは何も変えません。</p>
    <h3 class="s">表示の色</h3><div class="themes">${THEMES.map(([k, l]) => `<button type="button" data-th="${k}" class="${k === th ? 'on' : ''}">${l}</button>`).join('')}</div>
    <h3 class="s">ログイン</h3><button class="btn ghost" id="signout" type="button">ログアウト</button>`;
}
$('#setting').addEventListener('click', e => {
  const b = e.target.closest('button[data-th]');
  if (b) { storeSet('gatein_theme', b.dataset.th); applyTheme(b.dataset.th); renderSetting(); return; }
  if (e.target.closest('#signout')) {
    if (token) fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(token), { method: 'POST' }).catch(() => { });
    token = null; started = false; storeSet('gatein_tok', ''); storeSet('gatein_signed', ''); showLogin();
  }
});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { });
if (!CFG.clientId || CFG.clientId.startsWith('ここに')) { showLogin(); $('#signin').disabled = true; $('#loginMsg').textContent = 'config.js にクライアントIDを入れてください'; }
else initAuth();
