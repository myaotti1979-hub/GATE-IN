// GATE IN ビューア：家のパソコンが Google ドライブ（GATEIN_data/view）に置いた写しを読むだけの画面
'use strict';
const CFG = window.GATEIN_CONFIG || {};
const SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const $ = s => document.querySelector(s);
const yen = v => (v < 0 ? '−' : '') + Math.abs(Math.round(v)).toLocaleString('ja-JP') + '円';
const sgn = v => (v > 0 ? '+' : '') + yen(v);
const cls = v => v > 0 ? 'plus' : v < 0 ? 'minus' : '';
const ymd = d => `${d.slice(0, 4)}/${d.slice(4, 6)}/${d.slice(6, 8)}`;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const PK = { value: '狙い目 単勝', tan1: '◎の単勝', umaren: '馬連 流し', wide1: 'ワイド 1点', wideana: 'ワイド 穴流し', sanfuku: '3連複 軸1頭＋5頭', sanfuku6: '3連複 軸1頭＋6頭', box5: '3連複 5頭BOX', box6: '3連複 6頭BOX', jiku2: '3連複 2頭軸流し', santan: '3連単 フォーメーション', _bought: '実際に買った分' };

// ---------- ログイン（リダイレクト方式：ホーム画面に追加したアプリでも動く。トークンは1時間で切れ、切れたら自動で取り直す） ----------
let token = null, tokenExp = 0, started = false;
function storeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function storeSet(k, v) { try { localStorage.setItem(k, v); } catch { } }
const REDIRECT = location.origin + location.pathname.replace(/index\.html$/, '');
function authRedirect(prompt) {
  // 行ったり来たりが続かないように：自動の取り直しは1分に1回まで
  if (prompt === 'none') {
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
  if (!token) { try { const t = JSON.parse(storeGet('gatein_tok') || 'null'); if (t && Date.now() < t.tokenExp) { token = t.token; tokenExp = t.tokenExp; } } catch { } }
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
const folderCache = JSON.parse(storeGet('gatein_folders') || '{}');
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
  const r = await drive('files', { q: `'${parent}' in parents and trashed=false`, fields: 'files(id,name,modifiedTime)', pageSize: 1000 });
  return r.files || [];
}
async function readJson(id) { if (!id) return null; try { return JSON.parse(await drive('files/' + id, { alt: 'media' }, true)); } catch { return null; } }
async function viewPath(...names) {   // GATEIN_data/view/… のフォルダ ID
  let id = await folder(CFG.rootFolder || 'GATEIN_data');
  for (const n of ['view', ...names]) { if (!id) return null; id = await folder(n, id); }
  return id;
}

// ---------- 画面 ----------
const S = { logs: [], res: {}, status: null, rv: [] };
document.querySelectorAll('#tabs button').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('#tabs button').forEach(x => x.classList.toggle('on', x === b));
  document.querySelectorAll('main section').forEach(s => s.hidden = s.dataset.view !== b.dataset.tab);
}));

async function start() {
  $('#login').hidden = true; $('#tabs').hidden = false; $('#main').hidden = false;
  try { await loadAll(); } catch (e) { $('#foot').textContent = '読み込みに失敗しました：' + e.message; }
}
async function loadAll() {
  $('#foot').textContent = '読み込み中…';
  const viewId = await viewPath();
  if (!viewId) { $('#foot').textContent = 'ドライブに GATEIN_data/view が見つかりません（家のパソコンで GATE IN を起動すると作られます）'; return; }
  const top = await list(viewId);
  const hb = await readJson((top.find(f => f.name === 'heartbeat.json') || {}).id);
  renderHome(hb);
  const abId = await folder('autobet', viewId);
  const logId = abId ? await folder('log', abId) : null;
  const [logFiles, resFiles, statusFile] = await Promise.all([list(logId), list(await folder('results', viewId)), list(abId)]);
  S.logs = logFiles.filter(f => /^\d{8}\.json$/.test(f.name)).sort((a, b) => b.name.localeCompare(a.name));
  S.resFiles = Object.fromEntries(resFiles.map(f => [f.name.slice(0, 8), f.id]));
  S.status = await readJson((statusFile.find(f => f.name === 'status.json') || {}).id);
  const days = S.logs.map(f => f.name.slice(0, 8));
  $('#day').innerHTML = days.map(d => `<option value="${d}">${ymd(d)}</option>`).join('') || '<option>記録なし</option>';
  await loadReview(viewId);
  if (days.length) await showDay(days[0]);
  renderSetting(); loadPL();
  $('#foot').textContent = '読み込み：' + new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) + '（家のパソコンの写し。数十秒〜数分遅れることがあります）';
}
function renderHome(hb) {
  if (!hb) { $('#home').textContent = '家のPC：記録なし'; return; }
  const min = Math.round((Date.now() / 1000 - hb.t) / 60);
  $('#home').innerHTML = (min <= 10 ? '<span class="ok">家のPC 動作中</span>' : '<span class="ng">家のPC 停止中？</span>') + `<br>${esc(hb.at)}（${min}分前）`;
}

async function dayData(d) {
  const lf = S.logs.find(f => f.name.startsWith(d));
  const [log, res0] = await Promise.all([readJson(lf && lf.id), readJson(S.resFiles[d])]);
  let res = res0 || {};
  if (!Object.keys(res).length) {   // 結果の写しがまだ無い日は、反省会の記録（実際に買った分の払戻）を使う
    const rf = (S.rv || []).find(f => f.name.startsWith(d));
    const rv = rf ? await readJson(rf.id) : null;
    for (const r of (rv && rv.races) || []) res[r.key] = { result: (r.top3 || []).join('-'), _ret: r.bought ? +r.bought.ret || 0 : null, payout: {} };
  }
  return { log: log || {}, res };
}
function settle(e, res) {   // 1レースの購入額・払戻
  const p = e.plan || {}, bought = e.status === '購入済み';
  const cost = bought ? +(p.total || 0) : 0, pay = (res || {}).payout || {};
  let ret = 0, hits = [];
  for (const b of p.bets || []) {
    const y = ((pay[b.type] || {})[b.key] || 0) * Math.floor((+b.yen || 0) / 100);
    if (y > 0) { ret += y; hits.push(b); }
  }
  if (res && res._ret != null) ret = res._ret;   // 反省会の記録から
  return { cost, ret: bought ? ret : 0, hits, done: !!(res && res.result), bought };
}
$('#day').addEventListener('change', e => showDay(e.target.value));
$('#reload').addEventListener('click', () => { S.resFiles = {}; loadAll(); });
async function showDay(d) {
  const { log, res } = await dayData(d);
  const rows = Object.entries(log).map(([k, e]) => ({ k, e, s: settle(e, res[k]) }))
    .sort((a, b) => (+a.k.split('-')[5] - +b.k.split('-')[5]) || a.k.localeCompare(b.k));   // レース番号の順（同じ番号は競馬場の順）
  const t = rows.reduce((a, r) => ({ cost: a.cost + r.s.cost, ret: a.ret + r.s.ret, n: a.n + (r.s.bought ? 1 : 0), hit: a.hit + (r.s.ret > 0 ? 1 : 0), open: a.open + (r.s.bought && !r.s.done ? 1 : 0) }), { cost: 0, ret: 0, n: 0, hit: 0, open: 0 });
  $('#dayTotal').innerHTML = [['購入', yen(t.cost)], ['払戻', yen(t.ret)], ['収支', `<span class="${cls(t.ret - t.cost)}">${sgn(t.ret - t.cost)}</span>`], ['的中', `${t.hit}/${t.n}R` + (t.open ? `（結果待ち${t.open}）` : '')]]
    .map(([k, v]) => `<div class="card"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');
  $('#races').innerHTML = rows.length ? rows.map(({ k, e, s }) => {
    const p = e.plan || {}, groups = {};
    for (const b of p.bets || []) { const g = groups[b.title || b.type] || (groups[b.title || b.type] = { n: 0, yen: 0, hit: 0 }); g.n++; g.yen += +b.yen || 0; if (s.hits.includes(b)) g.hit += ((((res[k] || {}).payout || {})[b.type] || {})[b.key] || 0) * Math.floor((+b.yen || 0) / 100); }
    const r = res[k];
    return `<div class="race"><div class="h"><div class="t">${esc(p.track || '')}${p.raceNo || ''}R ${esc(p.name || e.name || '')}<span class="chip${s.ret > 0 ? ' hit' : ''}">${esc(e.status || '')}</span></div>
      <div class="${cls(s.ret - s.cost)}">${s.bought ? (s.done ? sgn(s.ret - s.cost) : '結果待ち') : ''}</div></div>
      <div class="meta">${p.time ? esc(p.time) + ' 発走・' : ''}${e.at ? esc(e.at) + ' 判断' : ''}${r && r.result ? '・結果 ' + esc(r.result) : ''}${(p.top || []).length ? '・本命 ' + p.top.slice(0, 2).map(h => `${h.no}${esc(h.name)}`).join('／') : ''}</div>
      ${Object.keys(groups).length ? `<div class="bets">${Object.entries(groups).map(([ti, g]) => `<div><span>${esc(ti)}（${g.n}点）</span><span>${yen(g.yen)}${g.hit ? ` → <b class="plus">${yen(g.hit)}</b>` : ''}</span></div>`).join('')}</div>` : ''}
      ${e.error ? `<div class="meta minus">${esc(e.error)}</div>` : ''}</div>`;
  }).join('') : '<p class="empty">この日の記録はありません</p>';
}

async function loadPL() {
  const days = S.logs.map(f => f.name.slice(0, 8)).slice(0, 14);
  const out = [];
  for (const d of days) {
    const { log, res } = await dayData(d);
    let cost = 0, ret = 0, n = 0, hit = 0;
    for (const [k, e] of Object.entries(log)) { const s = settle(e, res[k]); if (!s.bought) continue; n++; cost += s.cost; ret += s.ret; if (s.ret > 0) hit++; }
    out.push({ d, cost, ret, n, hit });
  }
  const T = out.reduce((a, r) => ({ cost: a.cost + r.cost, ret: a.ret + r.ret, n: a.n + r.n }), { cost: 0, ret: 0, n: 0 });
  $('#plTotal').innerHTML = [['購入（直近）', yen(T.cost)], ['払戻', yen(T.ret)], ['収支', `<span class="${cls(T.ret - T.cost)}">${sgn(T.ret - T.cost)}</span>`], ['回収率', T.cost ? Math.round(T.ret / T.cost * 100) + '%' : '-']]
    .map(([k, v]) => `<div class="card"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');
  $('#plTable').innerHTML = `<div class="tablewrap"><table><tr><th>日付</th><th>レース</th><th>的中</th><th>購入</th><th>払戻</th><th>収支</th></tr>${out.map(r => `<tr><td>${ymd(r.d)}</td><td>${r.n}</td><td>${r.hit}</td><td>${yen(r.cost)}</td><td>${yen(r.ret)}</td><td class="${cls(r.ret - r.cost)}">${sgn(r.ret - r.cost)}</td></tr>`).join('')}</table></div><p class="sub">結果が出ていないレースは払戻0円で数えています。家のPCの結果の写しが無い日は、反省会の記録の払戻を使います。</p>`;
}

async function loadReview(viewId) {
  const imId = await folder('improve', viewId); const rvId = imId ? await folder('review', imId) : null;
  const fs = (await list(rvId)).filter(f => /^\d{8}\.json$/.test(f.name)).sort((a, b) => b.name.localeCompare(a.name));
  S.rv = fs.map(f => ({ ...f }));
  $('#rvDay').innerHTML = fs.map(f => `<option value="${f.id}">${ymd(f.name.slice(0, 8))}</option>`).join('') || '<option>反省会の記録なし</option>';
  if (fs.length) showReview(fs[0].id);
}
$('#rvDay').addEventListener('change', e => showReview(e.target.value));
async function showReview(id) {
  const r = await readJson(id); const s = (r && r.summary) || {};
  if (!r) { $('#review').innerHTML = '<p class="empty">読めませんでした</p>'; return; }
  const pk = s.pk || {};
  const rows = Object.entries(pk).map(([k, v]) => ({ k, ...v })).sort((a, b) => (b.ret / (b.cost || 1)) - (a.ret / (a.cost || 1)));
  const sh = s.shape || {};
  $('#review').innerHTML = `<div class="cards">
      <div class="card"><div class="k">レース</div><div class="v">${s.races ?? '-'}</div></div>
      <div class="card"><div class="k">本命の3着内</div><div class="v">${s.axisIn3 ?? '-'}/${s.races ?? '-'}</div></div>
      <div class="card"><div class="k">3連複 的中</div><div class="v">${s.hit ?? '-'}</div></div>
      <div class="card"><div class="k">位置取りの当たり</div><div class="v">${sh.posCorr != null ? sh.posCorr.toFixed(2) : '-'}</div></div></div>
    <h3>買い方ごとの成績（その日）</h3>
    <div class="tablewrap"><table><tr><th>買い方</th><th>R</th><th>的中</th><th>購入</th><th>払戻</th><th>回収率</th></tr>${rows.map(v => `<tr><td>${esc(PK[v.k] || v.k)}</td><td>${v.races}</td><td>${v.hit}</td><td>${yen(v.cost)}</td><td>${yen(v.ret)}</td><td class="${cls(v.ret - v.cost)}">${v.cost ? Math.round(v.ret / v.cost * 100) + '%' : '-'}</td></tr>`).join('')}</table></div>
    ${s.miss ? `<h3>外れた理由</h3><div class="tablewrap"><table>${Object.entries(s.miss).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${v}R</td></tr>`).join('')}</table></div>` : ''}`;
}

function renderSetting() {
  const st = S.status || {}, se = st.settings || {}, sa = st.state || {};
  const types = (se.types || []).map(t => PK[t] || t).join('・') || 'なし';
  $('#setting').innerHTML = `<div class="tablewrap"><table>
    <tr><td>自動投票</td><td>${se.enabled ? '<b class="plus">ON</b>' : 'OFF'}</td></tr>
    <tr><td>買い方</td><td>${esc(types)}</td></tr>
    <tr><td>1点の金額</td><td>${se.unit ? yen(se.unit) : '-'}</td></tr>
    <tr><td>買うレースを絞る</td><td>${se.narrow ? `する（推定回収率${se.minRoi}%以上）` : 'しない'}</td></tr>
    <tr><td>1日の負けの上限</td><td>${se.dayLoss ? yen(se.dayLoss) : 'なし'}</td></tr>
    <tr><td>締切の何分前に判断</td><td>${se.beforeClose ?? '-'}分</td></tr>
    <tr><td>いまの状態</td><td>${esc(sa.msg || sa.need || '-')}</td></tr></table></div>
    <p class="sub">設定の変更や購入は家のパソコンだけでできます。この画面からは何も変えません。</p>
    <button class="btn ghost" id="signout">ログアウト</button>`;
  $('#signout').addEventListener('click', () => { if (token) fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(token), { method: 'POST' }).catch(() => { }); token = null; started = false; storeSet('gatein_tok', ''); storeSet('gatein_signed', ''); showLogin(); });
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { });
if (!CFG.clientId || CFG.clientId.startsWith('ここに')) { showLogin(); $('#signin').disabled = true; $('#loginMsg').textContent = 'config.js にクライアントIDを入れてください'; }
else initAuth();
