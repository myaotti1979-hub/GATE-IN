// GATE IN ビューア：家のパソコンが Google ドライブ（GATEIN_data/view）に置いた写しを読むだけの画面
'use strict';
const CFG = window.GATEIN_CONFIG || {};
const SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const $ = s => document.querySelector(s);
const yen = v => (v < 0 ? '−' : '') + Math.abs(Math.round(v)).toLocaleString('ja-JP') + '円';
const sgn = v => (v > 0 ? '+' : '') + yen(v);
const cls = v => v > 0 ? 'plus' : v < 0 ? 'minus' : '';
const ymd = d => `${d.slice(0, 4)}/${d.slice(4, 6)}/${d.slice(6, 8)}`;
const ymdw = d => `${ymd(d)}（${'日月火水木金土'[new Date(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8)).getDay()]}）`;   // 曜日つき（2026/10）
const todayStr = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' }).replace(/-/g, '');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const PK = { value: '狙い目 単勝', tan1: '◎の単勝', umaren: '馬連 流し', wide1: 'ワイド 1点', wideana: 'ワイド 穴流し', sanfuku: '3連複 軸1頭＋5頭', sanfuku6: '3連複 軸1頭＋6頭', box5: '3連複 5頭BOX', box6: '3連複 6頭BOX', jiku2: '3連複 2頭軸流し', santan: '3連単 フォーメーション', _bought: '実際に買った分', _shobu: '勝負レース B（記録だけ）', _shobuC: '勝負レース C（記録だけ）', _shobuW: '勝負レース W（記録だけ）' };

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

// ---------- 表示の色（自動＝スマホの設定に合わせる／ライト／ダーク）（2026/10） ----------
const THEMES = [['auto', '自動'], ['light', 'ライト'], ['dark', 'ダーク']];
function applyTheme(t) {
  if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t); else document.documentElement.removeAttribute('data-theme');
  const b = document.getElementById('themeBtn'); if (b) b.textContent = '表示：' + (THEMES.find(x => x[0] === t) || THEMES[0])[1];
  const dark = t === 'dark' || (t !== 'light' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute('content', dark ? '#0a0f15' : '#ffffff');
}
applyTheme(storeGet('gatein_theme') || 'auto');
document.getElementById('themeBtn').addEventListener('click', () => {
  const cur = storeGet('gatein_theme') || 'auto', i = THEMES.findIndex(x => x[0] === cur), nx = THEMES[(i + 1) % THEMES.length][0];
  storeSet('gatein_theme', nx); applyTheme(nx);
});

// ---------- 画面 ----------
const S = { logs: [], res: {}, status: null, rv: [] };
document.querySelectorAll('#tabs button').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('#tabs button').forEach(x => x.classList.toggle('on', x === b));
  document.querySelectorAll('main section').forEach(s => s.hidden = s.dataset.view !== b.dataset.tab);
}));

// ---------- 開催場のタブ（開催日・出馬表・予想で共通。最後に押した場を覚えて、ほかの画面・ほかの日でもその場を開く）（2026/10） ----------
const JYO = { '01': '札幌', '02': '函館', '03': '福島', '04': '新潟', '05': '東京', '06': '中山', '07': '中京', '08': '京都', '09': '阪神', '10': '小倉' };
const jyoOf = k => String(k).split('-')[2] || '';
const trackOf = (k, t) => t || JYO[jyoOf(k)] || '';
S.venuePref = storeGet('gatein_venue') || '';
function venueList(pairs) {   // [[レースのキー, 場の名前]] → 場の名前の一覧（競馬場コードの順）
  const m = new Map();
  for (const [k, t] of pairs) { const n = trackOf(k, t); if (n && !m.has(n)) m.set(n, jyoOf(k) || '99'); }
  return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(x => x[0]);
}
function drawVenues(sel, venues, badge) {   // タブを描いて、いま開く場を返す（覚えている場がこの日になければ最初の場）
  const el = $(sel);
  if (!venues.length) { el.hidden = true; el.innerHTML = ''; return ''; }
  const v = venues.includes(S.venuePref) ? S.venuePref : venues[0];
  el.hidden = false;
  el.innerHTML = venues.map(x => `<button type="button" data-v="${esc(x)}" class="${x === v ? 'on' : ''}">${esc(x)}${badge && badge[x] ? `<i>${badge[x]}</i>` : ''}</button>`).join('');
  return v;
}
function setTopH() { const t = document.querySelector('.top'); if (t) document.documentElement.style.setProperty('--toph', t.offsetHeight + 'px'); }
window.addEventListener('resize', setTopH); setTopH();
function onVenue(sel, render) {
  $(sel).addEventListener('click', e => {
    const b = e.target.closest('button[data-v]'); if (!b) return;
    S.venuePref = b.dataset.v; storeSet('gatein_venue', b.dataset.v); render();
    // 下まで読んでいたら、切り替えた場の1レース目が見える位置へ
    const a = $(sel).previousElementSibling, th = document.querySelector('.top').offsetHeight;
    if (a && a.classList.contains('vanchor') && a.getBoundingClientRect().top < th) window.scrollTo(0, a.getBoundingClientRect().top + window.scrollY - th);
  });
}

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
  const [logFiles, resFiles, statusFile, sbFiles, w5Files, cdFiles] = await Promise.all([list(logId), list(await folder('results', viewId)), list(abId), list(await folder('shobu', viewId)), list(await folder('win5', viewId)), list(await folder('cards', viewId))]);
  S.sbFiles = Object.fromEntries(sbFiles.map(f => [f.name.slice(0, 8), f.id]));
  S.w5Files = Object.fromEntries(w5Files.map(f => [f.name.slice(0, 8), f.id]));
  S.logs = logFiles.filter(f => /^\d{8}\.json$/.test(f.name)).sort((a, b) => b.name.localeCompare(a.name));
  S.resFiles = Object.fromEntries(resFiles.map(f => [f.name.slice(0, 8), f.id]));
  S.status = await readJson((statusFile.find(f => f.name === 'status.json') || {}).id);
  // 開催日の一覧：自動投票の記録・勝負レース・WIN5に加えて、結果の写しがある日（自動投票の記録がない過去の日も）（2026/10）
  const days = [...new Set([...S.logs.map(f => f.name.slice(0, 8)), ...Object.keys(S.sbFiles), ...Object.keys(S.w5Files), ...Object.keys(S.resFiles).filter(d => /^\d{8}$/.test(d))])].sort().reverse();
  const today = todayStr();
  $('#day').innerHTML = days.map((d, i) => `<option value="${d}">${ymdw(d)}${d === today ? '・今日' : i === 0 ? '・最新' : ''}</option>`).join('') || '<option>記録なし</option>';
  await loadReview(viewId);
  await loadPred(viewId);
  await loadCards(cdFiles);
  if (days.length) await showDay(days[0]);
  renderSetting(); loadPL();
  $('#foot').textContent = '読み込み：' + new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) + '（家のパソコンの写し。数十秒〜数分遅れることがあります）';
}
function renderHome(hb) {
  if (!hb) { $('#home').textContent = '家のPC：記録なし'; setTopH(); return; }
  const min = Math.round((Date.now() / 1000 - hb.t) / 60);
  $('#home').innerHTML = (min <= 10 ? '<span class="ok">家のPC 動作中</span>' : '<span class="ng">家のPC 停止中？</span>') + `<br>${esc(hb.at)}（${min}分前）`;
  setTopH();
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
// 今日の勝負レース（記録だけ。実際には買わない）
async function showShobu(d) {
  const box = $('#shobu'); if (!box) return;
  const D = S.sbFiles && S.sbFiles[d] ? await readJson(S.sbFiles[d]) : null;
  if (!D || !D.races) { box.innerHTML = ''; return; }
  const P = v => v == null ? '-' : Math.round(v * 100) + '%';
  const cards = RS => { const picks = Object.values(RS || {}).filter(x => x.pick); return picks.length ? picks.map(x => { const pl = x.plan, pm = (x.ret || 0) - pl.cost;
      return `<div class="race"><div class="h"><div class="t">${esc(x.name)}</div><div class="${x.settled ? cls(pm) : ''}">${x.settled ? sgn(pm) : '結果待ち'}</div></div>
        <div class="meta">${esc(x.time || '')} 発走・${x.at ? esc(x.at) + ' 判断・' : ''}${yen(pl.cost)}・自信 ${pl.score ?? '-'}点（推定回収率 ${P(pl.estRoi)}・的中期待率 ${P(pl.hit)}${pl.retHit ? `・当たれば ${yen(pl.retHit)}` : ''}）${x.settled ? `・払戻 ${yen(x.ret || 0)}` : ''}</div>
        <div class="bets">${pl.pks.map(p => `<div><span>${esc(p.title)}（${p.n}点×${((p.unit || pl.unit || 1) * 100).toLocaleString()}円）</span><span>推定 ${P(p.roi)}</span></div>`).join('')}</div></div>`; }).join('') : '<p class="sub">まだ選んだレースはありません。</p>'; };
  const sum = sm => sm && sm.settled ? `<p class="sub">記録の収支：${yen(sm.cost)} → ${yen(sm.ret)}（${sgn(sm.ret - sm.cost)}）</p>` : '';
  const cands = (D.cands || []).filter(c => !D.races[c.key]);
  const C = D.C, nm = k => { const c = (C && C.cands || []).find(x => x.key === k); return c ? `${esc(c.name)} ${esc(c.time || '')}` : k; };
  box.innerHTML = `<h3>勝負レース B：直前に決める（記録だけ）　${(D.sum && D.sum.races) || 0}/3R</h3>${cards(D.races)}` +
    (cands.length ? `<p class="sub">これからの候補（${esc(D.candsAt || '')}時点）：${cands.map(c => `${esc(c.name)} ${esc(c.time || '')}（自信${c.score ?? '-'}点）`).join('／')}</p>` : '') + sum(D.sum) +
    `<h3>勝負レース W：ワイド・2頭軸・5頭BOX（推定回収率90%以上）　${(D.W && D.W.sum && D.W.sum.races) || 0}/3R</h3>${cards(D.W && D.W.races)}` + sum(D.W && D.W.sum) +
    `<h3>勝負レース C：朝に候補（記録だけ）　${(C && C.sum && C.sum.races) || 0}/3R</h3>` +
    (C ? `<p class="sub">${esc(C.fixedAt)}の予定：${C.plan.map(nm).join('／')}${C.reserve.length ? `<br>控え：${C.reserve.map(nm).join('／')}` : ''}</p>${cards(C.races)}` +
      Object.values(C.races).filter(x => !x.pick).map(x => `<p class="sub">見送り：${esc(x.name)}（${esc(x.why || '')}）${x.up ? ` → ${nm(x.up)} を繰り上げ` : ''}</p>`).join('') + sum(C.sum) : '<p class="sub">最初のレースの15分前に決まります。</p>');
}
// WIN5 の買い目（見るだけ）
async function showWin5(d) {
  const box = $('#win5'); if (!box) return;
  const W = S.w5Files && S.w5Files[d] ? await readJson(S.w5Files[d]) : null;
  if (!W || !W.legs) { box.innerHTML = ''; return; }
  const P = v => v == null ? '-' : (v * 100 >= 10 ? Math.round(v * 100) : (v * 100).toFixed(1)) + '%';
  const plan = p => p ? `<div class="race"><div class="h"><div class="t">オッズなしの見立て</div><div>${p.points}点 ${yen(p.cost)}</div></div>
      <div class="meta">5つとも当たる確率 ${P(p.hit)}</div>
      <div class="bets">${W.legs.map((l, i) => `<div><span>${i + 1}. ${esc(l.name)}</span><span><b>${p.picks[i].map(h => h.no).join('・')}</b></span></div>`).join('')}</div></div>` : '';
  box.innerHTML = `<h3>WIN5 の買い目（${esc(W.made || '')}時点${W.known ? '' : '・対象は推定'}）</h3><p class="sub">締切は1レース目（${esc(W.close || '')} 発走）の前。購入は手動です。</p>` + plan(W.plans && W.plans.hit);
}
// ===== 出馬表（家のパソコンが置いた写し：9/1〜3日先の開催日。結果が出たら着順と確定払戻も）（2026/10） =====
const PAYJP = [['tan', '単勝'], ['fuku', '複勝'], ['waku', '枠連'], ['umaren', '馬連'], ['wide', 'ワイド'], ['umatan', '馬単'], ['sanfuku', '3連複'], ['santan', '3連単']];
function payoutHtml(p) {
  if (!p) return '';
  const rows = PAYJP.flatMap(([t, l]) => Object.entries(p[t] || {}).map(([k, v], i) => `<tr><td>${i ? '' : l}</td><td class="k">${esc(k)}</td><td class="y">${yen(v)}</td></tr>`));
  return rows.length ? `<div class="tablewrap" style="margin:6px 0 0"><table class="pay">${rows.join('')}</table></div>` : '';
}
const uChip = (no, w) => `<span class="u w${w || 0}">${esc(no)}</span>`;
function loadCards(files) {
  S.cdFiles = Object.fromEntries((files || []).filter(f => /^\d{8}\.json$/.test(f.name)).map(f => [f.name.slice(0, 8), f.id]));
  const days = Object.keys(S.cdFiles).sort().reverse();
  const today = todayStr();
  const pick = days.includes(today) ? today : (days.filter(d => d > today).sort()[0] || days[0]);
  $('#cdDay').innerHTML = days.map(d => `<option value="${d}"${d === pick ? ' selected' : ''}>${ymdw(d)}${d === today ? '・今日' : d > today ? '・これから' : ''}</option>`).join('') || '<option>出馬表の写しなし</option>';
  if (pick) return showCards(pick);
  $('#cdVenues').hidden = true;
  $('#cards').innerHTML = '<p class="empty">まだ出馬表の写しがありません。家のパソコンで新しい版の GATE IN を起動すると、9/1からの開催日（3日先まで）の分が少しずつ置かれます。</p>';
}
$('#cdDay').addEventListener('change', e => showCards(e.target.value));
async function showCards(d) {
  if (!S.cdFiles || !S.cdFiles[d]) return;
  const C = await readJson(S.cdFiles[d]) || {};
  S.cdData = { d, made: C.made, R: Object.entries(C.races || {}).map(([k, r]) => ({ k, ...r })) };
  renderCardList();
}
S.cdSort = storeGet('gatein_cdsort') === 'fin' ? 'fin' : 'no';   // 確定したレースの並び：馬番順／着順
function renderCardList() {
  const { R, made } = S.cdData || { R: [] };
  const v = drawVenues('#cdVenues', venueList(R.map(r => [r.k, r.track])));
  const rs = R.filter(r => trackOf(r.k, r.track) === v).sort((a, b) => a.raceNo - b.raceNo);
  const nDone = rs.filter(r => r.result).length, allDone = rs.length > 0 && nDone === rs.length;
  $('#cdTop').innerHTML = (made ? `<p class="sub">${allDone ? `レース確定後の写しです（${esc(made)}）。オッズ・人気は最終のものです。` : `${esc(made)} 時点の写しです（家のパソコンが、当日の発走前は10分ごと・先の日は1時間ごとに更新）。オッズ・馬体重は写した時点のものです。`}</p>` : '') +
    (nDone ? `<div class="seg"><span>確定したレースの並び</span><button type="button" data-s="no" class="${S.cdSort === 'no' ? 'on' : ''}">馬番順</button><button type="button" data-s="fin" class="${S.cdSort === 'fin' ? 'on' : ''}">着順</button></div>` : '');
  $('#cards').innerHTML = rs.length ? rs.map(cardHtml).join('') : '<p class="empty">この日の出馬表はありません</p>';
}
onVenue('#cdVenues', renderCardList);
$('#cdTop').addEventListener('click', e => { const b = e.target.closest('button[data-s]'); if (!b) return; S.cdSort = b.dataset.s; storeSet('gatein_cdsort', S.cdSort); renderCardList(); });
function cardHtml(r) {
  const done = !!r.result, P = v => v == null ? '-' : Math.round(v * 100) + '%';
  const st = done ? '<span class="st done">確定</span>' : r.gateUnknown ? '<span class="st gate">枠順未定</span>' : '<span class="st pre">発走前</span>';
  const hs = (r.horses || []).slice().sort((a, b) => done && S.cdSort === 'fin' ? ((a.fin || 99) - (b.fin || 99)) || (a.no - b.no) : a.no - b.no);
  const rows = hs.map(h => `<tr class="${h.scr ? 'scr' : ''}${done && h.fin && h.fin <= 3 ? ' top3' : ''}">${done ? `<td class="fin">${h.fin || (h.scr ? '消' : '-')}</td>` : ''}` +
    `<td>${uChip(h.no, r.gateUnknown ? 0 : h.w)}</td><td class="mk">${esc(h.mk || '')}</td>` +
    `<td class="nm"><b>${esc(h.name || '')}</b><div class="sub">${esc(h.sa || '')}・${h.kg ?? '-'}kg・${esc(h.jk || '')}${h.jkb ? `（${esc(h.jkb)}から）` : ''}${h.wt ? `・${h.wt}kg${h.wd != null && h.wd !== '' ? `（${h.wd > 0 ? '+' : ''}${h.wd}）` : ''}` : ''}</div></td>` +
    `<td><span class="odds">${h.odds ? Number(h.odds).toFixed(1) : '-'}</span><div class="sub">${h.pop ? h.pop + '人気' : ''}</div></td>` +
    `<td>${P(h.f3)}<div class="sub">勝${P(h.win)}</div></td></tr>`).join('');
  const head = `<tr>${done ? '<th>着</th>' : ''}<th>馬番</th><th></th><th style="text-align:left">馬名・騎手</th><th>オッズ</th><th>3着内</th></tr>`;
  return `<details class="rc"${S.cdOpen === r.k ? ' open' : ''} data-k="${esc(r.k)}"><summary><span class="rn">${r.raceNo}R</span><span class="ti"><b>${esc(r.name || '')}</b><span>${esc(r.time || '')}${r.time ? ' 発走・' : ''}${esc(r.surface || '')}${r.dist || ''}m・${(r.horses || []).filter(h => !h.scr).length}頭${r.going ? '・' + esc(r.going) : ''}</span></span>${st}</summary>` +
    `<div class="tablewrap" style="margin:0;border:0;border-radius:0"><table class="ct">${head}${rows}</table></div>` +
    (r.gateUnknown ? '<p class="note2">枠順が決まる前の確定出走馬です。馬番は馬名の50音順に付けた仮の番号です。</p>' : '') +
    (done ? `<h3 style="margin:12px 14px 6px">確定払戻（100円あたり）</h3><div style="padding:0 14px 6px">${payoutHtml(r.payout) || '<p class="sub">払戻のデータがありません</p>'}</div>` : '') +
    `<p class="note2">印・3着内率は家のパソコンの予想（${r.by ? '保存した予想' : 'その時点の能力モデル'}）。オッズは写した時点のものです。</p></details>`;
}
$('#cards').addEventListener('toggle', e => { const el = e.target; if (el && el.tagName === 'DETAILS' && el.open) S.cdOpen = el.dataset.k; }, true);

// 結果のカード（自動投票の記録がないレース用）：1〜3着・払戻と、保存していた予想の印（◎○▲△△）が何着だったか（2026/10）
function resultCard(k, r, pr) {
  const top = (r.order || []).slice(0, 3), p = r.payout || {}, srt = a => a.slice().sort((x, y) => x - y);
  const pay = Object.keys(p).length ? `<details style="margin-top:6px"><summary class="sub" style="cursor:pointer;font-weight:700">確定払戻（全券種）を見る</summary>${payoutHtml(p)}</details>` : '';
  const fin = no => { const i = (r.order || []).indexOf(no); return i >= 0 ? i + 1 : null; };
  const hs = pr ? (pr.horses || []).slice(0, 5) : [];
  const mk = hs.length ? `<div class="meta">予想：${hs.map((h, i) => { const f = fin(h.no); return `${MARKS[i]}${h.no}${esc(h.name || '')}${f ? `（<b class="${f <= 3 ? 'plus' : ''}">${f}着</b>）` : ''}`; }).join('　')}</div>` : '';
  const names = top.map(n => `${n} ${esc((r.names || {})[n] || '')}`).join(' › ');
  const title = `${esc(r.track || (pr && pr.track) || '')}${r.raceNo || (pr && pr.raceNo) || ''}R ${esc(r.name || (pr && pr.name) || '')}`;
  return `<div class="race"><div class="h"><div class="t">${title}</div><div class="sub">${esc(r.time || (pr && pr.time) || '')}</div></div>
    <div class="meta">結果 ${top.length ? names : '確定待ち'}</div>${mk}${pay}</div>`;
}
async function showDay(d) {
  showShobu(d); showWin5(d);
  const { log, res } = await dayData(d);
  const pv = S.pdByDay && S.pdByDay[d] ? (await readJson(S.pdByDay[d]) || {}) : {};
  S.dayView = { d, log, res, pv };
  renderDay();
}
function renderDay() {   // 合計はその日の全場。買った馬券と結果は開催場のタブで分ける（2026/10）
  const { log, res, pv } = S.dayView || { log: {}, res: {}, pv: {} };
  const rk = (a, b) => (+a.split('-')[5] - +b.split('-')[5]) || a.localeCompare(b);
  const tk = k => trackOf(k, ((log[k] || {}).plan || {}).track || (res[k] || {}).track || (pv[k] || {}).track);
  const extraAll = Object.keys(res).filter(k => !log[k] && /^\d{4}-\d{4}-/.test(k) && (res[k].order || []).length);
  const all = Object.entries(log).map(([k, e]) => ({ k, e, s: settle(e, res[k]) }));
  const t = all.reduce((a, r) => ({ cost: a.cost + r.s.cost, ret: a.ret + r.s.ret, n: a.n + (r.s.bought ? 1 : 0), hit: a.hit + (r.s.ret > 0 ? 1 : 0), open: a.open + (r.s.bought && !r.s.done ? 1 : 0) }), { cost: 0, ret: 0, n: 0, hit: 0, open: 0 });
  $('#dayTotal').innerHTML = [['購入', yen(t.cost)], ['払戻', yen(t.ret)], ['収支', `<span class="${cls(t.ret - t.cost)}">${sgn(t.ret - t.cost)}</span>`], ['的中', `${t.hit}/${t.n}R` + (t.open ? `（結果待ち${t.open}）` : '')]]
    .map(([k, v]) => `<div class="card"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');
  const badge = {}; for (const r of all) if (r.s.bought) { const n = tk(r.k); badge[n] = (badge[n] || 0) + 1; }   // タブの数字＝その場で買ったレース数
  const v = drawVenues('#dayVenues', venueList([...all.map(r => [r.k, tk(r.k)]), ...extraAll.map(k => [k, tk(k)])]), badge);
  const rows = all.filter(r => tk(r.k) === v).sort((a, b) => rk(a.k, b.k));   // レース番号の順
  const extra = extraAll.filter(k => tk(k) === v).sort(rk);
  $('#racesHead').hidden = !rows.length; $('#racesHead').textContent = `自動投票で買った馬券（${v}）`;
  $('#races').innerHTML = rows.length ? rows.map(({ k, e, s }) => {
    const p = e.plan || {}, groups = {};
    for (const b of p.bets || []) { const g = groups[b.title || b.type] || (groups[b.title || b.type] = { n: 0, yen: 0, hit: 0 }); g.n++; g.yen += +b.yen || 0; if (s.hits.includes(b)) g.hit += ((((res[k] || {}).payout || {})[b.type] || {})[b.key] || 0) * Math.floor((+b.yen || 0) / 100); }
    const r = res[k];
    return `<div class="race"><div class="h"><div class="t">${esc(p.track || '')}${p.raceNo || ''}R ${esc(p.name || e.name || '')}<span class="chip${s.ret > 0 ? ' hit' : ''}">${esc(e.status || '')}</span></div>
      <div class="${cls(s.ret - s.cost)}">${s.bought ? (s.done ? sgn(s.ret - s.cost) : '結果待ち') : ''}</div></div>
      <div class="meta">${p.time ? esc(p.time) + ' 発走・' : ''}${e.at ? esc(e.at) + ' 判断' : ''}${r && r.result ? '・結果 ' + esc(r.result) : ''}${(p.top || []).length ? '・本命 ' + p.top.slice(0, 2).map(h => `${h.no}${esc(h.name)}`).join('／') : ''}</div>
      ${Object.keys(groups).length ? `<div class="bets">${Object.entries(groups).map(([ti, g]) => `<div><span>${esc(ti)}（${g.n}点）</span><span>${yen(g.yen)}${g.hit ? ` → <b class="plus">${yen(g.hit)}</b>` : ''}</span></div>`).join('')}</div>` : ''}
      ${e.error ? `<div class="meta minus">${esc(e.error)}</div>` : ''}</div>`;
  }).join('') + (extra.length ? `<h3>そのほかのレースの結果（${esc(v)}）</h3>` + extra.map(k => resultCard(k, res[k], pv[k])).join('') : '')
    : extra.length ? `<h3>レースの結果（${esc(v)}）</h3>` + extra.map(k => resultCard(k, res[k], pv[k])).join('') : '<p class="empty">この日の記録はありません</p>';
}
onVenue('#dayVenues', renderDay);

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

// 家のパソコンが計算して保存した予想（見るだけ。2台目のパソコンと同じ数字）
const MARKS = ['◎', '○', '▲', '△', '△'];
async function loadPred(viewId) {
  const pid = await folder('predict', viewId);
  const fs = (await list(pid)).filter(f => /^\d{8}\.json$/.test(f.name)).sort((a, b) => b.name.localeCompare(a.name));
  S.pd = fs; S.pdByDay = Object.fromEntries(fs.map(f => [f.name.slice(0, 8), f.id]));
  const today = todayStr();
  const pick = fs.find(f => f.name.slice(0, 8) === today) || fs.find(f => f.name.slice(0, 8) > today) || fs[0];
  $('#pdDay').innerHTML = fs.map(f => `<option value="${f.id}"${pick && f.id === pick.id ? ' selected' : ''}>${ymdw(f.name.slice(0, 8))}${f.name.slice(0, 8) === today ? '・今日' : ''}</option>`).join('') || '<option>予想の写しなし</option>';
  if (pick) showPred(pick.id, pick.name.slice(0, 8)); else $('#pred').innerHTML = '<p class="empty">まだ予想の写しがありません（家のパソコンで GATE IN を新しい版で起動すると、開催日に置かれます）</p>';
}
$('#pdDay').addEventListener('change', e => { const f = (S.pd || []).find(x => x.id === e.target.value); if (f) showPred(f.id, f.name.slice(0, 8)); });
async function showPred(id, d) {
  const PD = await readJson(id) || {};
  const RES = S.resFiles && S.resFiles[d] ? (await readJson(S.resFiles[d]) || {}) : {};
  S.pdView = { d, PD, RES };
  renderPred();
}
onVenue('#pdVenues', renderPred);
function renderPred() {   // 開催場のタブで分ける（2026/10）
  const { d, PD, RES } = S.pdView || {};
  if (!d) return;
  const pre = `${d.slice(0, 4)}-${d.slice(4)}-`;
  const all = Object.entries(PD).filter(([k]) => k.startsWith(pre));
  const ven = drawVenues('#pdVenues', venueList(all.map(([k, r]) => [k, r.track])));
  const rows = all.filter(([k, r]) => trackOf(k, r.track) === ven)
    .sort((a, b) => (+a[0].split('-')[5] - +b[0].split('-')[5]) || a[0].localeCompare(b[0]));
  const nAb = rows.filter(([, r]) => r.by === '自動投票').length;
  $('#pdTop').innerHTML = rows.length ? `<p class="sub">${esc(ven)}の予想 ${rows.length}レース（締切前に最終判断した予想 ${nAb}レース・それ以外は朝〜発走20分前の予想）。家のパソコンが計算したものの写しです。</p>` : '';
  const PJ = { S: 'スロー', M: 'ミドル', H: 'ハイ' };
  $('#pred').innerHTML = rows.length ? rows.map(([k, r]) => {
    const hs = r.horses || [], pc = r.pace ? Object.entries(r.pace).sort((a, b) => b[1] - a[1])[0] : null;
    const at = r.savedAt ? new Date(r.savedAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : '';
    const nums = id => r.pk && r.pk[id] ? [...new Set(r.pk[id].keys.flatMap(k => String(k).split(/[-→]/)))].map(Number) : [];
    const b6 = nums('box6'), j2 = r.pk && r.pk.jiku2 ? r.pk.jiku2.keys.map(k => String(k).split('-').map(Number)) : [];
    const jAx = j2.length ? j2[0].filter(n => j2.every(k => k.includes(n))) : [];
    const pk = [b6.length ? `<div><span>3連複 6頭ボックス（20点）</span><span>${b6.join('・')}</span></div>` : '',
      jAx.length === 2 ? `<div><span>3連複 2頭軸（${j2.length}点）</span><span>${jAx.join('・')} → ${j2.map(k => k.find(n => !jAx.includes(n))).join('・')}</span></div>` : ''].join('');
    return `<div class="race"><div class="h"><div class="t">${esc(r.track || '')}${r.raceNo || ''}R ${esc(r.name || '')}<span class="chip${r.by === '自動投票' ? ' hit' : ''}">${r.by === '自動投票' ? '最終' : '途中'}</span></div><div class="sub">${at}</div></div>
      <div class="meta">${r.surface || ''}${r.dist || ''}m・${r.n}頭${pc ? `・ペース ${PJ[pc[0]]}（${Math.round(pc[1] * 100)}%）` : ''}</div>
      ${(RES[k] && (RES[k].order || []).length) ? `<div class="meta">結果 ${(RES[k].order || []).slice(0, 3).map(n => `${n} ${esc((RES[k].names || {})[n] || '')}`).join(' › ')}</div>` : ''}
      <div class="tablewrap" style="margin:6px 0 0"><table class="pdt"><tr><th>印</th><th>馬</th><th>勝率</th><th>3着内</th><th>人気</th>${RES[k] ? '<th>着</th>' : ''}</tr>${hs.slice(0, 5).map((h, i) => { const fi = RES[k] ? (RES[k].order || []).indexOf(h.no) + 1 : 0; return `<tr><td>${MARKS[i]}</td><td>${h.no} ${esc(h.name || '')}</td><td>${Math.round(h.win * 100)}%</td><td>${Math.round(h.fuku * 100)}%</td><td>${h.pop ?? '-'}${h.odds ? `<div class="sub">${h.odds}倍</div>` : ''}</td>${RES[k] ? `<td>${fi ? `<b class="${fi <= 3 ? 'plus' : ''}">${fi}</b>` : '-'}</td>` : ''}</tr>`; }).join('')}</table></div>
      ${pk ? `<div class="bets">${pk}</div>` : ''}</div>`;
  }).join('') : '<p class="empty">この日の予想はありません</p>';
}

async function loadReview(viewId) {
  const imId = await folder('improve', viewId); const rvId = imId ? await folder('review', imId) : null;
  const fs = (await list(rvId)).filter(f => /^\d{8}\.json$/.test(f.name)).sort((a, b) => b.name.localeCompare(a.name));
  S.rv = fs.map(f => ({ ...f }));
  const tf = (await list(rvId)).find(f => f.name === 'total.json');
  S.total = tf ? await readJson(tf.id) : null;
  $('#rvDay').innerHTML = fs.map(f => `<option value="${f.id}">${ymdw(f.name.slice(0, 8))}</option>`).join('') || '<option>反省会の記録なし</option>';
  if (fs.length) showReview(fs[0].id);
}
$('#rvDay').addEventListener('change', e => showReview(e.target.value));
// 着順の当たり具合：オッズなしの見立て・最終の予想・人気順をならべる
function kpiHtml(K, lab) {
  if (!K || !K.order) return '';
  const O = K.order, cols = [['mitate', '見立て'], ['final', '最終'], ['ninki', '人気順']].filter(([k]) => O[k]);
  const P = v => v == null ? '-' : Math.round(v * 100) + '%';
  const row = (name, f, fmt, lower) => {
    const vs = cols.map(([k]) => f(O[k])), b = lower ? Math.min(...vs) : Math.max(...vs);
    return `<tr><td>${name}</td>${vs.map(v => `<td>${v === b && cols.length > 1 ? `<b class="plus">${fmt(v)}</b>` : fmt(v)}</td>`).join('')}</tr>`;
  };
  const D = K.dis || {}, G = K.gap || {}, m = D.mitate;
  return `<h3>着順の当たり具合（${lab}・${O[cols[0][0]].n}R）</h3>
    <div class="tablewrap"><table><tr><th></th>${cols.map(([, t]) => `<th>${t}</th>`).join('')}</tr>` +
    row('順位の相関', o => o.sp, v => v.toFixed(2)) + row('着順のずれ', o => o.mae, v => v.toFixed(2) + '着', true) +
    row('上位3頭→3着内', o => o.in3, v => v.toFixed(2) + '頭') + row('上位5頭→掲示板', o => o.in5, v => v.toFixed(2) + '頭') +
    row('1番手の勝率', o => o.win, P) + row('1番手の3着内', o => o.top3, P) + row('1番手の大敗', o => o.big, P, true) + `</table></div>` +
    (m ? `<div class="tablewrap"><table><tr><th>人気と違う見立て</th><th>頭数</th><th>結果</th></tr>
      <tr><td>6番人気以下を上位3頭に</td><td>${m.up.n}</td><td>3着内 ${P(m.up.top3)}<br><span class="sub">全体 ${P(m.up.base)}</span></td></tr>
      <tr><td>3番人気以内を6番手以下に</td><td>${m.down.n}</td><td>4着以下 ${P(m.down.out)}<br><span class="sub">全体 ${P(m.down.base)}</span></td></tr>
      <tr><td>人気と3つ以上ずらした</td><td>${m.dir.n}</td><td>向きが合った ${P(m.dir.ok)}</td></tr></table></div>` : '') +
    (G.beat && G.beat.n ? `<p class="sub">人気より3つ以上上に来た馬（${G.beat.n}頭）を見立てで人気より上に見ていた：${P(G.beat.mitate)}。5番人気以内で3つ以上沈んだ馬（${G.sank.n}頭）を下に見ていた：${P(G.sank.mitate)}。</p>` : '') +
    `<p class="sub">見立て＝オッズを使わない能力モデル。最終＝締切前のオッズと検証を入れた予想。太字はその行でいちばん良いもの。</p>`;
}
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
    ${kpiHtml(s.kpi, 'この日')}
    ${S.total && S.total.recent && S.total.recent.kpi ? kpiHtml(S.total.recent.kpi, '直近8週') : ''}
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
