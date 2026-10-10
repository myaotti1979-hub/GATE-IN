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
const fmtT = t => { const m = Math.floor(t / 60), s = (t - m * 60).toFixed(1); return m ? `${m}:${s.padStart(4, '0')}` : s; };   // 走破タイム（秒→1:20.0）
const P100 = v => v == null ? '-' : Math.round(v * 100) + '%';
// 1〜3着のタイム・上がり3F（家のPCの結果の写しに top3t があるとき。2026/10/10）
function ttLine(R) {
  const tt = (R && R.top3t) || {};
  const xs = ((R && R.order) || []).slice(0, 3).map((no, i) => { const x = tt[String(no)]; return x && (x.t || x.l3) ? `<span><b>${i + 1}着</b> ${x.t ? fmtT(x.t) : ''}${x.l3 ? ` 上がり${x.l3.toFixed(1)}` : ''}</span>` : ''; }).filter(Boolean);
  return xs.length ? `<div class="tt">${xs.join('')}</div>` : '';
}
const PK = { fuku1: '複勝◎',  value: '狙い目 単勝', tan1: '◎の単勝', umaren: '馬連 流し', wide1: 'ワイド 1点', wideana: 'ワイド 穴流し', sanfuku: '3連複 軸1頭＋5頭', sanfuku6: '3連複 軸1頭＋6頭', box5: '3連複 5頭BOX', box6: '3連複 6頭BOX', jiku2: '3連複 2頭軸流し', santan: '3連単 フォーメーション', _bought: '実際に買った分', _shobu: '勝負レース B（記録だけ）', _shobuC: '勝負レース C（記録だけ）', _shobuW: '勝負レース W（記録だけ）' };

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
    wHtml(D, cards, sum, P) +
    `<h3>勝負レース C：朝に候補（記録だけ）　${(C && C.sum && C.sum.races) || 0}/3R</h3>` +
    (C ? `<p class="sub">${esc(C.fixedAt)}の予定：${C.plan.map(nm).join('／')}${C.reserve.length ? `<br>控え：${C.reserve.map(nm).join('／')}` : ''}</p>${cards(C.races)}` +
      Object.values(C.races).filter(x => !x.pick).map(x => `<p class="sub">見送り：${esc(x.name)}（${esc(x.why || '')}）${x.up ? ` → ${nm(x.up)} を繰り上げ` : ''}</p>`).join('') + sum(C.sum) : '<p class="sub">最初のレースの15分前に決まります。</p>');
}
// 勝負レースW（自動投票で買う）：決めたレース、まだ決めていない候補（指標と「買う予定／見送り予定」）、見送ったレース（2026/10/10）
function wHtml(D, cards, sum, P) {
  const W = D.W; if (!W) return '';
  const PJ = wProjOf(D), cands = W.cands || [], skips = Object.values(W.races || {}).filter(x => !x.pick);
  const nPick = Object.values(W.races || {}).filter(x => x.pick).length;
  const cand = cands.map((c, i) => { const pj = PJ && PJ.map[c.key], buy = pj && pj.st === 'buy';
    return `<div class="wc${buy ? ' buy' : ''}"><div class="h"><b>${buy ? '買う予定' : '見送り予定'}</b><span>候補${i + 1}・指標 ${PJ ? PJ.wsc(c).toFixed(2) : '-'}</span></div>` +
      `<div class="meta">${esc(c.name || '')} ${esc(c.time || '')}${c.time ? ' 発走' : ''}</div>` +
      `<div class="sub">${yen(c.cost || 0)}・推定回収率 ${P(c.estRoi)}・的中見込み ${P(c.hit)}${(c.pks || []).length ? '・' + c.pks.map(p => `${esc(p.title || p.id)}${p.n ? ` ${p.n}点` : ''}`).join('・') : ''}</div>` +
      `${!buy && pj && pj.why ? `<div class="sub">${esc(pj.why)}</div>` : ''}</div>`; }).join('');
  return `<h3>勝負レース W（自動投票で買う）　${nPick}/${PJ && PJ.cap != null ? PJ.cap : 3}R</h3>` +
    (PJ ? `<p class="sub">${PJ.cap == null ? '1日のレース数の上限なし' : `買う枠：残り <b>${PJ.left}R</b>（1日${PJ.cap}Rまで）`}。指標＝推定回収率×√的中見込み。「予定」は今のオッズでの見込みで、締切の直前に最新のオッズで決めます${W.candsAt ? `（${esc(W.candsAt)} 時点）` : ''}</p>` : '') +
    (nPick ? cards(W.races) : '') + cand +
    (!nPick && !cands.length ? '<p class="sub">今のところ候補のレースはありません。</p>' : '') +
    (skips.length ? `<p class="sub">見送り ${skips.length}R：${skips.slice(-4).map(x => `${esc(x.name || '')}${x.why ? `（${esc(String(x.why).slice(0, 40))}）` : ''}`).join('／')}</p>` : '') + sum(W.sum);
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
    (nDone ? `<div class="seg"><span>確定したレースの並び</span><button type="button" data-s="no" class="${S.cdSort === 'no' ? 'on' : ''}">馬番順</button><button type="button" data-s="fin" class="${S.cdSort === 'fin' ? 'on' : ''}">着順</button></div>` : '') +
    (rs.some(r => (r.horses || []).some(h => h.tc)) ? `<div class="seg"><span>調教の前走比</span><button type="button" data-tc="1" class="${S.tcOn ? 'on' : ''}">出す</button><button type="button" data-tc="0" class="${S.tcOn ? '' : 'on'}">出さない</button></div>` : '');
  $('#cards').innerHTML = rs.length ? rs.map(cardHtml).join('') : '<p class="empty">この日の出馬表はありません</p>';
}
onVenue('#cdVenues', renderCardList);
$('#cdTop').addEventListener('click', e => {
  const t = e.target.closest('button[data-tc]'); if (t) { S.tcOn = t.dataset.tc === '1'; storeSet('gatein_tc', S.tcOn ? '1' : '0'); renderCardList(); return; }
  const b = e.target.closest('button[data-s]'); if (!b) return; S.cdSort = b.dataset.s; storeSet('gatein_cdsort', S.cdSort); renderCardList();
});
// 調教の前走比（2026/10/10 夜）：今回・前走時・2走前時の 東スポの最終追い切り（コース・強さ・評価）と JRA-VAN の速い追い切りの点・28日の本数・そのときの着順
S.tcOn = storeGet('gatein_tc') !== '0';
function tcRow(h, nc) {
  const c = h.tc; if (!S.tcOn || !c || c.length < 2) return '';
  const cur = c[0], cp = cur.ts ? cur.ts[5] : null;
  const line = (o, i) => {
    const lab = o.l === '今回' ? '今回' : o.l + '時';
    const f = o.r ? +o.r[1] : 0;
    const res = o.r ? `<span class="tr">${esc(o.r[0] || '')} <b class="${f === 1 ? 'f1' : f && f <= 3 ? 'f3' : ''}">${o.r[1] ?? '-'}着</b></span>` : '';
    const pd = i && cp != null && o.ts && o.ts[5] != null ? cp - o.ts[5] : null;
    const ts = o.ts ? `<span>${esc(o.ts[0] || '')} ${esc(o.ts[1] || '')}${esc(o.ts[2] || '')} ${esc(String(o.ts[3] || '').split('-').slice(-2).join('-'))} ${esc(String(o.ts[4] || '').replace(/\s*\(\d+\)/, ''))} <b class="${pd == null ? '' : pd > 0 ? 'up' : pd < 0 ? 'dn' : ''}">評${o.ts[5] ?? '-'}</b></span>` : '<span class="sub">東スポなし</span>';
    const same = i && o.wd && o.wd === cur.wd;
    const d = i && !same && cur.s != null && o.s != null ? cur.s - o.s : null;
    const sc = o.s == null ? '<span class="sub">点－</span>' : `<span class="${d == null ? '' : d >= 0.5 ? 'up' : d <= -0.5 ? 'dn' : ''}">点${o.s > 0 ? '+' : ''}${Number(o.s).toFixed(1)}</span>`;
    return `<div class="tcl"><span class="lb">${lab}</span>${ts}${sc}<span class="sub">${o.n ?? 0}本</span>${same ? '<span class="sub">今回と同じ追い切り</span>' : ''}${res}</div>`;
  };
  // 調教の量と質が前走時より上（28日の追い切り日数＋3日以上・点＋0.5以上・前走から120日以内）：過去11年で3着内がオッズの見込みの1.07倍（10番人気以下 1.17倍）
  const p1 = c[1], dd = (x, y) => { const f = v => new Date(+String(v).slice(0, 4), +String(v).slice(4, 6) - 1, +String(v).slice(6, 8)); return (f(x) - f(y)) / 864e5; };
  const up = cur.s != null && p1.s != null && cur.n != null && p1.n != null && cur.wd && p1.wd && cur.n - p1.n >= 3 && cur.s - p1.s >= 0.5 && (!cur.d || !p1.d || dd(cur.d, p1.d) <= 120);
  return `<tr class="tcx"><td colspan="${nc}">${up ? '<div class="tcu">調教の量と質が前走時より上<span class="sub">（過去11年で人気より来た：3着内 1.07倍）</span></div>' : ''}${c.map(line).join('')}</td></tr>`;
}
function cardHtml(r) {
  const done = !!r.result, P = v => v == null ? '-' : Math.round(v * 100) + '%';
  const st = done ? '<span class="st done">確定</span>' : r.gateUnknown ? '<span class="st gate">枠順未定</span>' : '<span class="st pre">発走前</span>';
  const hs = (r.horses || []).slice().sort((a, b) => done && S.cdSort === 'fin' ? ((a.fin || 99) - (b.fin || 99)) || (a.no - b.no) : a.no - b.no);
  const rows = hs.map(h => `<tr class="${h.scr ? 'scr' : ''}${done && h.fin && h.fin <= 3 ? ' top3' : ''}">${done ? `<td class="fin">${h.fin || (h.scr ? '消' : '-')}</td>` : ''}` +
    `<td>${uChip(h.no, r.gateUnknown ? 0 : h.w)}</td><td class="mk">${esc(h.mk || '')}</td>` +
    `<td class="nm"><b>${esc(h.name || '')}</b><div class="sub">${esc(h.sa || '')}・${h.kg ?? '-'}kg・${esc(h.jk || '')}${h.jkb ? `（${esc(h.jkb)}から）` : ''}${h.wt ? `・${h.wt}kg${h.wd != null && h.wd !== '' ? `（${h.wd > 0 ? '+' : ''}${h.wd}）` : ''}` : ''}</div></td>` +
    `<td><span class="odds">${h.odds ? Number(h.odds).toFixed(1) : '-'}</span><div class="sub">${h.pop ? h.pop + '人気' : ''}</div></td>` +
    `<td>${P(h.f3)}<div class="sub">勝${P(h.win)}</div></td></tr>` + tcRow(h, done ? 6 : 5)).join('');
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
    <div class="meta">結果 ${top.length ? names : '確定待ち'}</div>${ttLine(r)}${mk}${pay}</div>`;
}
async function showDay(d) {
  showShobu(d); showWin5(d);
  const { log, res } = await dayData(d);
  const pv = S.pdByDay && S.pdByDay[d] ? (await readJson(S.pdByDay[d]) || {}) : {};
  S.dayView = { d, log, res, pv };
  renderDay();
}
// 保存した予想の買い目を100円ずつ買った場合の成績（買い方ごと）。結果と払戻が出たレースだけ。venue を渡すとその場だけ（2026/10/10）
const DAY_PK = ['value', 'tan1', 'fuku1', 'umaren', 'wide1', 'wideana', 'sanfuku', 'sanfuku6', 'box5', 'box6', 'jiku2', 'santan'];
function predStats(pv, res, venue) {
  const T = {}, F = {}; let n = 0;
  for (const [k, r] of Object.entries(pv || {})) {
    const R = res[k]; if (!r || !R || !(R.order || []).length || !R.payout || !Object.keys(R.payout).length) continue;
    if (venue && trackOf(k, r.track || R.track) !== venue) continue;
    n++;
    for (const id of DAY_PK) {
      const p = (r.pk || {})[id]; if (!p || !(p.keys || []).length) continue;
      const got = p.keys.reduce((s, key) => s + (((R.payout[p.type] || {})[key]) || 0), 0), inv = p.keys.length * 100;
      const t = T[id] || (T[id] = { n: 0, hit: 0, inv: 0, ret: 0 }); t.n++; t.inv += inv; t.ret += got; if (got) t.hit++;
      const ps = (r.pkStats || {})[id];
      for (const [fk, ok] of [['roi90', ps && ps.roi != null && ps.roi >= 0.9], ['hit20', ps && ps.hit != null && ps.hit >= 0.2]]) {
        if (!ok) continue; const f = F[fk] || (F[fk] = { n: 0, hit: 0, inv: 0, ret: 0 }); f.n++; f.inv += inv; f.ret += got; if (got) f.hit++;
      }
    }
  }
  return { T, F, n };
}
function predStatsHTML(sv, v, sa) {
  const ids = DAY_PK.filter(id => sv.T[id]);
  if (!ids.length) return '';
  const roi = x => x.inv ? Math.round(x.ret / x.inv * 100) + '%' : '-';
  const nm = v => Math.round(v).toLocaleString('ja-JP');   // 金額（円）。幅を詰めるため「円」は付けない
  const row = (l, x, c) => `<tr${c ? ` class="${c}"` : ''}><td>${l}</td><td>${x.n ?? ''}</td><td>${x.hit ?? ''}</td><td>${nm(x.inv)}</td><td>${nm(x.ret)}</td><td class="${cls(x.ret - x.inv)}">${roi(x)}</td></tr>`;
  const all = ids.reduce((s, id) => ({ inv: s.inv + sv.T[id].inv, ret: s.ret + sv.T[id].ret }), { inv: 0, ret: 0 });
  const FL = [['roi90', '予想回収率90%以上だけ'], ['hit20', '的中率20%以上だけ']].filter(([k]) => sv.F[k]);
  const allDay = sa && sa !== sv ? DAY_PK.filter(id => sa.T[id]).reduce((s, id) => ({ inv: s.inv + sa.T[id].inv, ret: s.ret + sa.T[id].ret }), { inv: 0, ret: 0 }) : null;
  return `<h3>予想の成績（${esc(v)}・${sv.n}R）</h3><p class="sub">保存した予想の買い目を100円ずつ買った場合（結果が出たレース。金額は円）。家のパソコンの予想一覧と同じ数え方です。</p>` +
    `<div class="tablewrap"><table class="pst"><tr><th>買い方</th><th>R</th><th>的中</th><th>投資</th><th>払戻</th><th>回収率</th></tr>` +
    ids.map(id => row(esc(PK[id] || id), sv.T[id])).join('') +
    row('合計', { inv: all.inv, ret: all.ret }, 'sum') +
    (FL.length ? `<tr class="fhd"><th>買い方を絞った場合</th><th>式数</th><th>的中</th><th>投資</th><th>払戻</th><th>回収率</th></tr>` + FL.map(([k, l]) => row(l, sv.F[k], 'frow')).join('') : '') +
    `</table></div>${FL.length ? '<p class="sub">絞った場合は、1レースの1つの買い方を1式と数えます（予想の推定の回収率・的中率で絞る）。</p>' : ''}` +
    (allDay && allDay.inv ? `<p class="sub">全場の合計：投資 ${yen(allDay.inv)} → 払戻 ${yen(allDay.ret)}（回収率 <b class="${cls(allDay.ret - allDay.inv)}">${roi(allDay)}</b>）</p>` : '');
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
  try { $('#dayPred').innerHTML = v ? predStatsHTML(predStats(pv, res, v), v, predStats(pv, res, null)) : ''; } catch { $('#dayPred').innerHTML = ''; }
  const rows = all.filter(r => tk(r.k) === v).sort((a, b) => rk(a.k, b.k));   // レース番号の順
  const extra = extraAll.filter(k => tk(k) === v).sort(rk);
  $('#racesHead').hidden = !rows.length; $('#racesHead').textContent = `自動投票で買った馬券（${v}）`;
  $('#races').innerHTML = rows.length ? rows.map(({ k, e, s }) => {
    const p = e.plan || {}, r = res[k], pay = ((r || {}).payout) || {};
    // 印は、家のPCが締切前に判断したときの予想（検証後の勝率の順）から（2026/10/10 ご指摘：シミュの勝率の順の「本命」が◎と食い違って紛らわしい）
    const PR = pv[k], mk = PR && (PR.horses || []).length ? PR.horses.slice(0, 3).map((h, i) => `${MARKS[i]}${h.no}${esc(h.name || '')}`).join(' ') : '';
    // 買い目：買ったレースだけ金額を出す。勝負レースWは組番まで（ワイド 1-13 など）。見送りは理由だけ
    let bets = '';
    if (s.bought) {
      const TJ = { tan: '単勝', fuku: '複勝', umaren: '馬連', wide: 'ワイド', umatan: '馬単', sanfuku: '3連複', santan: '3連単', waku: '枠連' };
      const won = b => ((pay[b.type] || {})[b.key] || 0) * Math.floor((+b.yen || 0) / 100);
      const W = (p.bets || []).filter(b => b.title === '勝負レースW'), groups = {};
      for (const b of (p.bets || []).filter(b => b.title !== '勝負レースW')) { const g = groups[b.title || b.type] || (groups[b.title || b.type] = { n: 0, yen: 0, hit: 0 }); g.n++; g.yen += +b.yen || 0; g.hit += won(b); }
      bets = W.map(b => `<div><span>勝負レースW　<b>${esc(TJ[b.type] || b.type)} ${esc(b.key)}</b></span><span>${yen(+b.yen || 0)}${won(b) ? ` → <b class="plus">${yen(won(b))}</b>` : ''}</span></div>`).join('') +
        Object.entries(groups).map(([ti, g]) => `<div><span>${esc(ti)}（${g.n}点）</span><span>${yen(g.yen)}${g.hit ? ` → <b class="plus">${yen(g.hit)}</b>` : ''}</span></div>`).join('');
    }
    const why = !s.bought && e.reason ? `<div class="meta sub">${esc(String(e.reason).replace(/^勝負レースW：/, ''))}</div>` : '';
    return `<div class="race${s.bought ? '' : ' skipped'}"><div class="h"><div class="t">${esc(p.track || '')}${p.raceNo || ''}R ${esc(p.name || e.name || '')}<span class="chip${s.ret > 0 ? ' hit' : ''}">${esc(e.status || '')}</span></div>
      <div class="${cls(s.ret - s.cost)}">${s.bought ? (s.done ? sgn(s.ret - s.cost) : '結果待ち') : ''}</div></div>
      <div class="meta">${p.time ? esc(p.time) + ' 発走・' : ''}${e.at ? esc(e.at) + ' 判断' : ''}${r && r.result ? '・結果 ' + esc(r.result) : ''}</div>
      ${mk ? `<div class="meta">${mk}</div>` : ''}${why}
      ${bets ? `<div class="bets">${bets}</div>` : ''}
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
// ===== 予想タブ（2026/10/10）：全頭／上位5頭・見出しをタップで並び替え（もう一度で逆順）・発走時刻・勝負レースW・パドック診断（AI） =====
const PD_COLS = {   // [値の取り出し, 最初のタップの向き（1＝小さい順・-1＝大きい順）]
  mk: [x => x.mi < 5 ? x.mi : null, 1], no: [x => x.h.no, 1], win: [x => x.h.win, -1], fuku: [x => x.h.fuku, -1], pop: [x => x.h.pop || null, 1],
  pdk: [x => !x.pk ? null : (x.pk.rubric === 'v3' || x.pk.rubric === 'v4') ? (x.pk.rank != null ? x.pk.rank : null) : ({ A: 1, B: 2, C: 3, D: 4 }[x.pk.overall] || null), 1],
  fin: [x => x.fin || null, 1]
};
S.pdSort = (() => { try { const v = JSON.parse(storeGet('gatein_pdsort') || 'null'); return v && PD_COLS[v.k] ? v : null; } catch { return null; } })();
S.pdAll = storeGet('gatein_pdall') !== '5';
S.pdCache = {};
// パドック診断（AI）：v3＝9項目を1〜10点（大きいほど良い・5＝ふつう）・合計90点満点・レースの中での順位と偏差値。v2（10/10の午前まで）は A〜D
const PDK_ITEM3 = [['spirit', '気合い'], ['calm', '落ち着き'], ['muscle', '張り'], ['coat', '毛ヅヤ'], ['stride', '踏み込み'], ['gait', '歩様'], ['neck', '首の使い方'], ['focus', '集中'], ['build', '仕上がり']];
const PDK_WARN = ['発汗多い', '入れ込み', '制御できない', '二人引き', '外傷・腫れ', '馬っ気'];
// v4（2026/10/10 夜〜）：6項目（歩様・制御・首は1〜5で3＝ふつう、テンションは-3〜+3で0＝適度、馬体は-2〜+2で0＝ちょうど、毛ヅヤは1〜3）。100点満点（ふつう80）。所見は 重・中・情報
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
// 前走比（2026/10/10 夜）：同じ馬の前回のパドック診断（200日以内）との差。良くなった＝緑・悪くなった＝赤
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
  const dt = p.dt;
  return `<div class="pkp"><span class="h">前走比（${esc(yr)}${+d.slice(4, 6)}/${+d.slice(6, 8)} ${esc(p.race || '')}・${p.total ?? '-'}点${p.overall ? ' ' + esc(p.overall) : ''}）</span>` +
    (parts.length ? parts.map(([t, c]) => `<span class="${c > 0 ? 'g' : c < 0 ? 'w' : ''}">${esc(t)}</span>`).join('') : '<span>変わりなし</span>') +
    (dt ? `<span class="${dt > 0 ? 'g' : 'w'}">合計${dt > 0 ? '+' : ''}${dt}</span>` : '') + '</div>';
}
function pkDetail4(pk) {
  const its = PDK_ITEM4.map(([k, nm]) => { const v = (pk.vals || {})[k]; return `<span class="pki${pk4Cls(pk, k, v)}"><i>${nm}</i><b>${esc(pk4Txt(k, v))}</b></span>`; }).join('');
  const fl = (pk.flags || []).map(f => `<span class="${f.lv === '重' ? 'w' : f.lv === '中' ? 'm' : ''}">${esc(f.f)}${f.lv !== '情報' ? `（${esc(f.lv)}）` : ''}</span>`).join('') + (pk.gear || []).map(g => `<span>${esc(g)}</span>`).join('');
  const cm = pk.cmp && pk.cmp.note && pk.score_by === '見比べ' ? pk.cmp.note : '';
  return `<div class="pkh">パドック診断（AI${pk.score_by === '見比べ' ? '・全馬を見比べ' : ''}）<b>${pk.total ?? '-'}</b>/100点・総合 <b>${esc(pk.overall || '-')}</b> ${esc(pk.label || '')}${pk.rank != null ? `（${pk.rank}位/${pk.rank_n}頭）` : ''}</div>` +
    `<div class="pkg">${its}</div>${fl ? `<div class="pkf">${fl}</div>` : ''}${pkPrev4(pk)}${cm ? `<div><b>${esc(cm)}</b></div>` : ''}<div>${esc(pk.comment || '')}</div>` +
    `${pk.no_ok === false ? '<div class="sub">※ゼッケンの読み取りが馬番と違います（参考）</div>' : ''}` +
    '<div class="sub">80点＝問題なし（悪い所を引いた点）。赤は減点になった値・緑は良い値。前走比は同じ馬の前回の診断との差（赤＝悪くなった・緑＝良くなった）。予想・買い目には入れていません</div>';
}
const pkv = v => v && typeof v === 'object' ? v.v : v;   // 写し（数字）でも元のファイル（{v:…}）でも
function pdkTier(x) {
  if (x.rubric === 'v4') return x.overall || 'B';
  const t = x.dev == null ? (x.overall || 'B') : x.dev >= 60 ? 'A' : x.dev >= 45 ? 'B' : x.dev >= 35 ? 'C' : 'D';
  return (x.notes || []).some(n => n === '入れ込み' || n === '制御できない') && (t === 'A' || t === 'B') ? 'C' : t;
}
const pkC = pk => pk && pk.cmp && pk.cmp.items ? pk.cmp : null;   // 見比べ（全馬を1回で見比べた点。2026/10/10 午後〜）
const pkT = pk => { if (pk.rubric === 'v4') return pk.total; const C = pkC(pk); return C && C.total != null ? C.total : pk.total; };
function pkCell(pk) {
  if (!pk) return '<span class="sub">-</span>';
  if (pk.rubric === 'v3' || pk.rubric === 'v4') {
    const p = pk.rubric === 'v4' ? pk.prev : null, mk = !p || p.dt == null ? '' : p.dt <= -5 || (p.new || []).length ? '<b class="pkdn">▼</b>' : p.dt >= 5 ? '<b class="pkup">▲</b>' : '';
    return pkT(pk) == null ? '<span class="sub">-</span>' : `<span class="pk pk-${pdkTier(pk)}">${pk.rank != null ? pk.rank + '位' : pkT(pk) + '点'}</span><div class="sub">${pkT(pk)}点${mk}</div>`;
  }
  return pk.overall ? `<span class="pk pk-${esc(pk.overall)}">${esc(pk.overall)}</span>` : '<span class="sub">-</span>';
}
function pkDetail(pk, h) {
  if (pk.rubric === 'v4') return pkDetail4(pk);
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
    '<div class="sub">1〜10点（5＝ふつう）。3以下は赤・8以上は緑。▲▼はこのレースの平均との差。予想・買い目には入れていません</div>';
}
async function dayFile(kind, d) {   // その日のファイル（view/kind/d.json）。パドックは写しが無ければ元のファイル（GATEIN_data/paddock）を読む
  const ck = kind + '/' + d, c = S.pdCache[ck];
  if (c && (d !== todayStr() || Date.now() - c.at < 60000)) return c.v;
  let v = null;
  try {
    let fid = null;
    const vid = await viewPath(kind);
    if (vid) fid = ((await list(vid)).find(f => f.name === d + '.json') || {}).id;
    if (!fid && kind === 'paddock') {
      const gid = await folder(CFG.rootFolder || 'GATEIN_data'), pid = gid ? await folder('paddock', gid) : null;
      if (pid) fid = ((await list(pid)).find(f => f.name === d + '.json') || {}).id;
    }
    v = fid ? await readJson(fid) : null;
  } catch { v = c ? c.v : null; }
  S.pdCache[ck] = { at: Date.now(), v };
  return v;
}
// 勝負レースW：今のオッズのままなら、どの候補を買うかの見込み（家のPCのアプリと同じ考え方。表示だけ）
function wProjOf(D) {
  const W = D && D.W; if (!W) return null;
  const cap = D.wCap === undefined ? 3 : D.wCap;   // null は上限なし
  const picked = Object.values(W.races || {}).filter(x => x && x.pick).length;
  const wsc = c => c ? (c.wsc != null ? +c.wsc : (+c.estRoi || 0) * Math.sqrt(Math.max(0, +c.hit || 0))) : 0;
  const tm = t => { const m = String(t || '').match(/(\d+):(\d+)/); return m ? +m[1] * 60 + +m[2] : 9999; };
  const cs = (W.cands || []).map((c, i) => ({ c, rank: i + 1, sc: wsc(c), t: tm(c.time) })).sort((x, y) => x.t - y.t);
  let slots = cap == null ? Infinity : cap - picked; const map = {};
  cs.forEach((x, j) => {
    const better = cs.slice(j + 1).filter(y => y.sc > x.sc).length;
    let st = 'buy', why = '';
    if (slots <= 0) { st = 'skip'; why = `今日はもう${cap}R選ぶ見込み`; }
    else if (cap != null && better >= slots) { st = 'skip'; why = `このあとに指標が上のレースが${better}つ`; }
    else slots -= 1;
    map[x.c.key] = { st, why, sc: x.sc, rank: x.rank };
  });
  return { cap, picked, left: cap == null ? null : Math.max(0, cap - picked), map, wsc };
}
function wChip(D, k) {
  const W = D && D.W; if (!W) return '';
  const r = (W.races || {})[k];
  if (r) return r.pick ? '<span class="chip w">W 買う</span>' : '<span class="chip wq">W 見送り</span>';
  const PJ = wProjOf(D), pj = PJ && PJ.map[k];
  return pj ? `<span class="chip ${pj.st === 'buy' ? 'w' : 'wq'}">W ${pj.st === 'buy' ? '買う予定' : '候補'}${pj.rank}</span>` : '';
}
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
  S.pdView = { d, PD, RES, PDK: null, SB: null, CT: {} };
  renderPred();
  // 追加の読み込み（パドック診断・勝負レースW・発走時刻）。読めたら出し直す
  const [pdk, sb, cd] = await Promise.all([dayFile('paddock', d), S.sbFiles && S.sbFiles[d] ? readJson(S.sbFiles[d]) : null, S.cdFiles && S.cdFiles[d] ? readJson(S.cdFiles[d]) : null]);
  if (!S.pdView || S.pdView.d !== d) return;
  S.pdView.PDK = (pdk && pdk.races) || null; S.pdView.SB = sb;
  for (const [k, r] of Object.entries((cd && cd.races) || {})) if (r && r.time) S.pdView.CT[k] = r.time;
  renderPred();
}
onVenue('#pdVenues', renderPred);
function renderPred() {   // 開催場のタブで分ける（2026/10）。全頭・並び替え・発走時刻・W・パドック（2026/10/10）
  const { d, PD, RES, PDK, SB, CT } = S.pdView || {};
  if (!d) return;
  const pre = `${d.slice(0, 4)}-${d.slice(4)}-`;
  const all = Object.entries(PD).filter(([k]) => k.startsWith(pre));
  const ven = drawVenues('#pdVenues', venueList(all.map(([k, r]) => [k, r.track])));
  const rows = all.filter(([k, r]) => trackOf(k, r.track) === ven)
    .sort((a, b) => (+a[0].split('-')[5] - +b[0].split('-')[5]) || a[0].localeCompare(b[0]));
  const nAb = rows.filter(([, r]) => r.by === '自動投票').length;
  const st = S.pdSort || { k: 'win', d: -1 };
  $('#pdTop').innerHTML = rows.length ? `<p class="sub">${esc(ven)}の予想 ${rows.length}レース（締切前に最終判断した予想 ${nAb}レース・それ以外は朝〜発走20分前の予想）。家のパソコンが計算したものの写しです。</p>` +
    `<div class="seg"><span>表示</span><button type="button" data-pa="all" class="${S.pdAll ? 'on' : ''}">全頭</button><button type="button" data-pa="5" class="${S.pdAll ? '' : 'on'}">上位5頭</button><span>見出しをタップで並び替え${PDK ? '・パドックの欄をタップで項目の点数' : ''}</span></div>` : '';
  const PJ = { S: 'スロー', M: 'ミドル', H: 'ハイ' };
  $('#pred').innerHTML = rows.length ? rows.map(([k, r]) => {
    const hs = r.horses || [], pc = r.pace ? Object.entries(r.pace).sort((a, b) => b[1] - a[1])[0] : null;
    const at = r.savedAt ? new Date(r.savedAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : '';
    const nums = id => r.pk && r.pk[id] ? [...new Set(r.pk[id].keys.flatMap(k => String(k).split(/[-→]/)))].map(Number) : [];
    const b6 = nums('box6'), j2 = r.pk && r.pk.jiku2 ? r.pk.jiku2.keys.map(k => String(k).split('-').map(Number)) : [];
    const jAx = j2.length ? j2[0].filter(n => j2.every(k => k.includes(n))) : [];
    const pk = [b6.length ? `<div><span>3連複 6頭ボックス（20点）</span><span>${b6.join('・')}</span></div>` : '',
      jAx.length === 2 ? `<div><span>3連複 2頭軸（${j2.length}点）</span><span>${jAx.join('・')} → ${j2.map(k => k.find(n => !jAx.includes(n))).join('・')}</span></div>` : ''].join('');
    const R = RES[k], P = PDK && PDK[k] ? PDK[k].horses || {} : null, time = r.time || CT[k] || (R && R.time) || '';
    const xs = hs.map((h, i) => ({ h, mi: i, fin: R ? (R.order || []).indexOf(h.no) + 1 : 0, pk: P ? P[String(h.no)] || null : null }));
    const c = PD_COLS[st.k] || PD_COLS.win, nv = v => v == null || !isFinite(v) ? null : +v;
    xs.sort((x, y) => { const p = nv(c[0](x)), q = nv(c[0](y)); if (p == null && q == null) return x.mi - y.mi; if (p == null) return 1; if (q == null) return -1; return (p - q) * st.d || x.mi - y.mi; });
    const show = S.pdAll ? xs : xs.slice(0, 5);
    const th = (key, l) => `<th data-ps="${key}" class="ps${st.k === key ? ' on' : ''}">${l}<span class="ar">${st.k === key ? (st.d === 1 ? '▲' : '▼') : ''}</span></th>`;
    const head = `<tr>${th('mk', '印')}${th('no', '馬')}${th('win', '勝率')}${th('fuku', '3着内')}${th('pop', '人気')}${P ? th('pdk', 'パドック') : ''}${R ? th('fin', '着') : ''}</tr>`;
    const body = show.map(x => { const h = x.h;
      return `<tr${x.pk ? ` class="haspk" data-k="${esc(k)}" data-no="${h.no}"` : ''}><td>${MARKS[x.mi] || ''}</td><td>${h.no} ${esc(h.name || '')}</td><td>${Math.round(h.win * 100)}%</td><td>${Math.round(h.fuku * 100)}%</td><td>${h.pop ?? '-'}${h.odds ? `<div class="sub">${h.odds}倍</div>` : ''}</td>` +
        `${P ? `<td>${pkCell(x.pk)}</td>` : ''}${R ? `<td>${x.fin ? `<b class="${x.fin <= 3 ? 'plus' : ''}">${x.fin}</b>` : '-'}</td>` : ''}</tr>`; }).join('');
    return `<div class="race"><div class="h"><div class="t">${esc(r.track || '')}${r.raceNo || ''}R ${esc(r.name || '')}<span class="chip${r.by === '自動投票' ? ' hit' : ''}">${r.by === '自動投票' ? '最終' : '途中'}</span>${wChip(SB, k)}</div><div class="sub">${at}</div></div>
      <div class="meta">${time ? `<b>${esc(time)} 発走</b>・` : ''}${r.surface || ''}${r.dist || ''}m・${r.n}頭${pc ? `・ペース ${PJ[pc[0]]}（${Math.round(pc[1] * 100)}%）` : ''}</div>
      ${(R && (R.order || []).length) ? `<div class="meta">結果 ${(R.order || []).slice(0, 3).map(n => `${n} ${esc((R.names || {})[n] || '')}`).join(' › ')}</div>${ttLine(R)}` : ''}
      <div class="tablewrap" style="margin:6px 0 0"><table class="pdt">${head}${body}</table></div>
      ${!S.pdAll && hs.length > 5 ? `<p class="sub" style="margin:4px 0 0">ほか${hs.length - 5}頭（「全頭」で表示）</p>` : ''}
      ${pk ? `<div class="bets">${pk}</div>` : ''}</div>`;
  }).join('') : '<p class="empty">この日の予想はありません</p>';
}
$('#pdTop').addEventListener('click', e => { const b = e.target.closest('button[data-pa]'); if (!b) return; S.pdAll = b.dataset.pa === 'all'; storeSet('gatein_pdall', S.pdAll ? 'all' : '5'); renderPred(); });
$('#pred').addEventListener('click', e => {
  const th = e.target.closest('th[data-ps]');
  if (th) {   // 並び替え（全レースの表で同じ並び。選んだ並びは覚える）
    const k = th.dataset.ps, c = PD_COLS[k]; if (!c) return;
    const st = S.pdSort || { k: 'win', d: -1 };
    S.pdSort = st.k === k ? { k, d: -st.d } : { k, d: c[1] };
    if (S.pdSort.k === 'win' && S.pdSort.d === -1) S.pdSort = null;   // 既定（勝率の高い順）に戻った
    storeSet('gatein_pdsort', S.pdSort ? JSON.stringify(S.pdSort) : ''); renderPred(); return;
  }
  const tr = e.target.closest('tr.haspk'); if (!tr) return;   // パドック診断の項目を開く・閉じる
  const nx = tr.nextElementSibling;
  if (nx && nx.classList.contains('pkd')) { nx.remove(); tr.classList.remove('open'); return; }
  const v = S.pdView || {}, pk = v.PDK && v.PDK[tr.dataset.k] ? (v.PDK[tr.dataset.k].horses || {})[tr.dataset.no] : null; if (!pk) return;
  const row = document.createElement('tr'); row.className = 'pkd';
  row.innerHTML = `<td colspan="${tr.children.length}">${pkDetail(pk)}</td>`;
  tr.after(row); tr.classList.add('open');
});

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
