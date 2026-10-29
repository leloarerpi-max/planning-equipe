/* ==========================================================================
   avent.js — Calendrier de l'avent « Magnolia » (24 épisodes d'un polar).
   Chargé APRÈS saisons.js (voir index.html). S'il manquait ou plantait, le reste du
   site continuerait de fonctionner. Ne modifie AUCUNE donnée du planning.

   - Le bandeau n'apparaît que du 1er décembre au 10 janvier (le superviseur peut
     le voir toute l'année et simuler une date pour tester).
   - Un épisode par jour. Les épisodes du samedi et du dimanche s'ouvrent le lundi
     (comme prévu dans le roman) : le lundi, trois épisodes d'un coup.
   - Lecture suivie sur chaque poste (localStorage) ; carnet d'enquête et suspects
     barrés sont personnels. Seul le VOTE est partagé (Firebase : po:avent-votes).
   - Les « clés de lecture » apparaissent à partir du 25 décembre.
   ========================================================================== */
(function(){
  const LS_OPEN = 'av-open', LS_READ = 'av-read', LS_SIM = 'av-sim', LS_NOTES = 'av-notes', LS_STRIKE = 'av-strike';
  const VOTES_KEY = 'po:avent-votes';
  // Suspects proposés au vote (à modifier ici si besoin)
  const SUSPECTS = [
    {id: 'Clara', icon: '🎀'}, {id: 'Ben', icon: '🧥'}, {id: 'Régis', icon: '😄'}, {id: 'Anaïs', icon: '🎧'},
    {id: 'Julia', icon: '🆕'}, {id: 'Léa', icon: '😤'}, {id: 'Virginie', icon: '🍵'}, {id: 'Pierrick', icon: '📒'}
  ];
  const VOTE_FROM_DAY = 12;   // le vote s'ouvre quand l'épisode 12 est disponible…
  const VOTE_UNTIL_DAY = 24;  // …et se ferme à l'ouverture de l'épisode 24

  let DATA = null;
  try{
    const bin = atob(window.AVENT_B64 || '');
    const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
    DATA = JSON.parse(new TextDecoder('utf-8').decode(bytes));
  } catch(e){ return; }
  if(!DATA || !Array.isArray(DATA.episodes)) return;

  const ls = {
    get(k, d){ try{ const v = localStorage.getItem(k); return v === null ? d : v; } catch(e){ return d; } },
    set(k, v){ try{ localStorage.setItem(k, v); } catch(e){} }
  };
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function adminNow(){ try{ return typeof isAdmin !== 'undefined' && !!isAdmin; } catch(e){ return false; } }

  /* --- dates ---------------------------------------------------------------- */
  function pad(n){ return String(n).padStart(2, '0'); }
  function isoOf(d){ return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function simDate(){
    const s = ls.get(LS_SIM, '');
    if(/^\d{4}-\d{2}-\d{2}$/.test(s)){ const p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
    return null;
  }
  function today(){
    if(adminNow()){ const s = simDate(); if(s) return s; }
    const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate());
  }
  function seasonYear(t){ return t.getMonth() === 0 ? t.getFullYear() - 1 : t.getFullYear(); }
  // Jour d'ouverture de l'épisode n : le jour même, sauf samedi/dimanche -> lundi
  function unlockDate(n, year){
    const d = new Date(year, 11, n);
    const dow = d.getDay();
    if(dow === 6) return new Date(year, 11, n + 2);
    if(dow === 0) return new Date(year, 11, n + 1);
    return d;
  }
  function inWindow(t){
    const y = seasonYear(t);
    return t >= new Date(y, 11, 1) && t <= new Date(y + 1, 0, 10);
  }
  function frDay(d){
    const j = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'][d.getDay()];
    const m = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'][d.getMonth()];
    return j + ' ' + d.getDate() + ' ' + m;
  }

  /* --- état de lecture ------------------------------------------------------- */
  function readSet(){ try{ return new Set(JSON.parse(ls.get(LS_READ, '[]'))); } catch(e){ return new Set(); } }
  function saveRead(s){ ls.set(LS_READ, JSON.stringify(Array.from(s))); }
  function strikeSet(){ try{ return new Set(JSON.parse(ls.get(LS_STRIKE, '[]'))); } catch(e){ return new Set(); } }
  function saveStrike(s){ ls.set(LS_STRIKE, JSON.stringify(Array.from(s))); }

  let votes = {};   // { prénom: {suspect, at} }
  let open = ls.get(LS_OPEN, '0') === '1';
  let panel = null;   // 'carnet' | 'suspects' | 'vote' | 'cles' | null

  function readMin(e){ return Math.max(1, Math.round((e.words || 400) / 170)); }

  /* --- styles ---------------------------------------------------------------- */
  const css = `
#avent{margin:0 0 16px;font-family:'IBM Plex Sans',system-ui,sans-serif}
#avent .av-bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;background:var(--panel);border:1px solid var(--line-strong);border-left:4px solid var(--danger);border-radius:var(--radius);padding:10px 14px;cursor:pointer}
#avent .av-bar b{font-family:Georgia,'Times New Roman',serif;font-size:16px;color:var(--ink)}
#avent .av-bar small{color:var(--ink-soft);font-size:12.5px}
#avent .av-sp{flex:1}
#avent .av-chip{font-size:12px;font-weight:600;color:var(--violet);background:var(--violet-bg);border-radius:12px;padding:3px 10px}
#avent .av-chip.o{color:var(--ochre);background:var(--ochre-bg)}
#avent .av-go{font-size:12.5px;color:var(--ink-soft)}
#avent .av-board{background:var(--panel);border:1px solid var(--line-strong);border-left:4px solid var(--danger);border-radius:var(--radius);padding:0 0 14px;position:relative;overflow:hidden}
#avent .av-lights{display:block;width:100%;height:30px}
#avent .av-head{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:0 18px 4px}
#avent .av-head h3{margin:0;font-family:Georgia,serif;font-size:19px}
#avent .av-head span.s{color:var(--ink-soft);font-size:13px}
#avent .av-grid{display:grid;grid-template-columns:repeat(8,1fr);gap:16px 14px;padding:16px 18px 6px;position:relative}
#avent .c{position:relative;height:74px;transform:rotate(var(--r));cursor:pointer}
#avent .c.locked{cursor:default}
#avent .pin{position:absolute;left:50%;top:-5px;width:9px;height:9px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff,var(--danger) 55%,#6e2218);transform:translateX(-50%);z-index:3;box-shadow:0 1px 2px rgba(0,0,0,.4)}
#avent .e{position:absolute;inset:4px 0 0 0;border-radius:var(--radius);border:1.5px solid var(--violet);background:var(--violet-bg);overflow:hidden;box-shadow:0 2px 5px rgba(0,0,0,.15)}
#avent .e svg{position:absolute;left:0;top:0;width:100%;height:62%}
#avent .e .n{position:absolute;left:0;right:0;bottom:6px;text-align:center;font:700 19px Georgia,serif;color:var(--violet)}
#avent .e .lk{position:absolute;left:50%;top:34%;transform:translate(-50%,-50%);font-size:13px;opacity:.7}
#avent .c.read .e{background:var(--ochre-bg);border-color:var(--ochre)}
#avent .c.read .e .n{color:var(--ochre);font-size:17px}
#avent .c.read .card{position:absolute;left:14%;right:14%;top:12%;height:44%;background:#fff;border:1px solid #E5D6BE;border-radius:2px;transform:rotate(-2deg);padding:4px 5px}
#avent .c.read .card i{display:block;height:2.5px;background:#E3D9C6;margin-bottom:3px;border-radius:2px}
#avent .c.read .card i:nth-child(2){width:75%}
#avent .c.new .e{background:var(--ochre);border-color:#8a4f1c;box-shadow:0 0 0 3px rgba(185,112,46,.25),0 3px 10px rgba(185,112,46,.5);animation:avpulse 2.4s infinite}
#avent .c.new .e .n{color:#fff}
#avent .c.new .e svg path{stroke:#fff}
#avent .c.missed .e{border-color:var(--ochre);background:#fff}
#avent .c.missed .e .n{color:var(--ochre)}
#avent .tag{position:absolute;left:50%;top:-16px;transform:translateX(-50%);background:var(--ink);color:#fff;font-size:10.5px;font-weight:600;padding:2px 8px;border-radius:9px;z-index:4;white-space:nowrap}
#avent svg.str{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:2}
#avent .av-foot{display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:8px 18px 0;font-size:12.5px;color:var(--ink-soft)}
#avent .av-foot b{color:var(--ink)}
#avent .av-btn{border:1px solid var(--line-strong);border-radius:var(--radius);background:var(--panel);padding:5px 10px;font:600 12.5px 'IBM Plex Sans',system-ui,sans-serif;color:var(--ink);cursor:pointer}
#avent .av-btn:hover{border-color:var(--violet)}
#avent .av-btn.p{background:var(--violet);border-color:var(--violet);color:#fff}
#avent .av-adm{padding:8px 18px 0;font-size:12px;color:var(--ink-soft);display:flex;gap:8px;align-items:center;flex-wrap:wrap}
#avent .av-adm input{padding:3px 6px;border:1px solid var(--line-strong);border-radius:3px;font:inherit}
#avmodal{position:fixed;inset:0;background:rgba(36,34,32,.5);z-index:90;display:flex;align-items:center;justify-content:center;padding:16px;font-family:'IBM Plex Sans',sans-serif}
#avmodal .m{width:100%;max-width:860px;max-height:92vh;display:flex;background:var(--panel);border-radius:6px;box-shadow:0 12px 40px rgba(0,0,0,.35);overflow:hidden;border:1px solid var(--line-strong)}
#avmodal .m.one{max-width:640px}
#avmodal .l{flex:1.6;display:flex;flex-direction:column;min-width:0}
#avmodal .l:before{content:'';display:block;flex:0 0 8px;background:repeating-linear-gradient(135deg,#F2C94C 0 10px,#242220 10px 20px)}
#avmodal .t{padding:14px 24px 6px;overflow-y:auto;flex:1}
#avmodal h4{margin:0;font:700 20px Georgia,serif;color:var(--ink)}
#avmodal .wk{font-size:12px;color:var(--violet);font-weight:600;letter-spacing:.3px;text-transform:uppercase}
#avmodal .mt{font-size:12px;color:var(--ink-soft);margin:3px 0 12px}
#avmodal .t p{margin:0 0 11px;font:15.5px/1.65 Georgia,'Times New Roman',serif;color:#2c2417}
#avmodal .t table{border-collapse:collapse;width:100%;font:13px/1.4 'IBM Plex Sans',sans-serif}
#avmodal .t th,#avmodal .t td{border:1px solid var(--line-strong);padding:6px 8px;text-align:left;vertical-align:top}
#avmodal .t th{background:var(--violet-bg)}
#avmodal .acts{display:flex;gap:8px;align-items:center;padding:10px 24px 14px;border-top:1px solid var(--line);flex-wrap:wrap}
#avmodal .acts .sp{flex:1}
#avmodal button.b{border:1px solid var(--line-strong);border-radius:var(--radius);background:var(--panel);padding:6px 12px;font:600 13px 'IBM Plex Sans',sans-serif;color:var(--ink);cursor:pointer}
#avmodal button.b:disabled{opacity:.4;cursor:default}
#avmodal button.b.p{background:var(--violet);border-color:var(--violet);color:#fff}
#avmodal button.b.ok{background:var(--teal);border-color:var(--teal);color:#fff}
#avmodal .r{flex:1;background:var(--violet-bg);padding:16px 18px;font-size:13.5px;color:var(--ink);border-left:1px solid var(--line-strong);overflow-y:auto}
#avmodal .r h5{margin:0 0 6px;font:700 15px Georgia,serif;color:var(--violet)}
#avmodal .r textarea{width:100%;min-height:150px;border:1px solid var(--line-strong);border-radius:3px;padding:8px;font:13.5px/1.45 'IBM Plex Sans',sans-serif;background:#fff;resize:vertical}
#avmodal .su{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:8px}
#avmodal .su div{text-align:center;font-size:12px;cursor:pointer;padding:6px 2px;border-radius:4px}
#avmodal .su div:hover{background:rgba(91,75,138,.1)}
#avmodal .su span{display:block;width:44px;height:44px;margin:0 auto 4px;border-radius:50%;background:#fff;border:1.5px solid var(--violet);line-height:44px;font-size:22px}
#avmodal .su .x{text-decoration:line-through;color:var(--ink-soft)}
#avmodal .su .x span{opacity:.4}
#avmodal .su .sel span{background:var(--violet);border-color:var(--violet)}
#avmodal .hint{font-size:12px;color:var(--ink-soft);margin:6px 0}
#avmodal .res{margin-top:10px}
#avmodal .res .row{display:flex;align-items:center;gap:8px;margin:4px 0;font-size:13px}
#avmodal .res .bar{height:12px;background:var(--violet);border-radius:3px}
@keyframes avpulse{50%{box-shadow:0 0 0 5px rgba(185,112,46,.18),0 3px 14px rgba(185,112,46,.7)}}
@media (max-width:900px){ #avent .av-grid{grid-template-columns:repeat(6,1fr)} }
@media (max-width:640px){ #avent .av-grid{grid-template-columns:repeat(4,1fr);gap:20px 10px} #avmodal .m{flex-direction:column} #avmodal .r{border-left:none;border-top:1px solid var(--line-strong);max-height:40vh} #avmodal .t{padding:12px 16px 6px} #avmodal .acts{padding:10px 16px 12px} }
@media print{ #avent,#avmodal{display:none !important} }
`;
  const st = document.createElement('style'); st.id = 'av-style'; st.textContent = css; document.head.appendChild(st);

  /* --- rendu ----------------------------------------------------------------- */
  const host = document.createElement('div'); host.id = 'avent';
  let mounted = false;
  function mount(){
    if(mounted && host.isConnected) return true;
    const sec = document.getElementById('app-tab-planning');
    if(!sec) return false;
    const h1 = sec.querySelector('h1');
    const desc = h1 && h1.nextElementSibling;
    if(desc) desc.insertAdjacentElement('afterend', host); else sec.insertBefore(host, sec.firstChild);
    mounted = true;
    return true;
  }

  function status(t){
    const year = seasonYear(t);
    const rs = readSet();
    return DATA.episodes.map(e => {
      const ud = unlockDate(e.n, year);
      const unlocked = ud <= t;
      const isNew = unlocked && ud.getTime() === t.getTime() && !rs.has(e.n);
      let st = 'locked';
      if(unlocked) st = rs.has(e.n) ? 'read' : (isNew ? 'new' : 'missed');
      return {e, ud, unlocked, st};
    });
  }

  function lightsSvg(){
    const cols = ['#A23B2E', '#2F6F63', '#B9702E', '#5B4B8A'];
    let b = '';
    for(let i = 0; i < 34; i++){
      const x = 18 + i * 34.2, y = 10 + (i % 2 ? 7 : 2) + Math.sin(i * .8) * 3, c = cols[i % 4];
      b += `<line x1="${x}" y1="${y - 6}" x2="${x}" y2="${y}" stroke="#6b6660" stroke-width="1.5"/><circle cx="${x}" cy="${y + 5}" r="5" fill="${c}"/><circle cx="${x}" cy="${y + 5}" r="9" fill="${c}" opacity=".16"/>`;
    }
    return `<svg class="av-lights" viewBox="0 0 1200 30" preserveAspectRatio="none"><path d="M0,6 Q100,22 200,10 T400,10 T600,10 T800,10 T1000,10 T1200,8" stroke="#6b6660" stroke-width="1.5" fill="none"/>${b}</svg>`;
  }

  function render(){
    if(!mount()) return;
    const t = today();
    const adm = adminNow();
    if(!inWindow(t) && !adm){ host.style.display = 'none'; return; }
    host.style.display = '';
    const sts = status(t);
    const nbUnlocked = sts.filter(s => s.unlocked).length;
    const nbRead = sts.filter(s => s.st === 'read').length;
    const nbToRead = sts.filter(s => s.unlocked && s.st !== 'read').length;
    const sim = adm && simDate();
    const preview = adm && !inWindow(new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())) ? ' <span class="av-chip">aperçu superviseur</span>' : '';

    if(!open){
      host.innerHTML = `<div class="av-bar" id="avBar">🔍 <b>Calendrier de l’avent</b><small>${nbToRead ? '— ' + nbToRead + ' épisode' + (nbToRead > 1 ? 's' : '') + ' à lire' : (nbUnlocked ? '— vous êtes à jour' : '— ouverture le 1er décembre')}</small>${preview}<span class="av-sp"></span>${nbToRead ? `<span class="av-chip o">${nbToRead} nouveau${nbToRead > 1 ? 'x' : ''}</span>` : ''}<span class="av-chip">${nbRead} / 24 lus</span><span class="av-go">▼ Déplier</span></div>`;
      host.querySelector('#avBar').addEventListener('click', () => { open = true; ls.set(LS_OPEN, '1'); render(); });
      return;
    }

    let g = '';
    const rot = [-1.5,1,-.8,1.6,-1.2,.8,1.4,-1,1.5,-1.4,.9,-.7,-1.2,1.4,-1.6,.8,-.9,1.5,1,-1.3,1.2,-1,1.6,-1.2];
    sts.forEach(s => {
      const n = s.e.n;
      const fl = `<svg viewBox="0 0 100 60" preserveAspectRatio="none"><path d="M0,0 L50,46 L100,0" fill="none" stroke="${s.st === 'read' || s.st === 'missed' ? 'var(--ochre)' : 'var(--violet)'}" stroke-width="1.6" opacity=".75"/></svg>`;
      let inner;
      if(s.st === 'read') inner = `<div class="card"><i></i><i></i></div><svg viewBox="0 0 100 60" preserveAspectRatio="none" style="top:auto;bottom:0;height:46%"><path d="M0,60 L50,12 L100,60" fill="#F6E9D9" stroke="var(--ochre)" stroke-width="1.2"/></svg><div class="n">${n}</div>`;
      else if(s.st === 'locked') inner = `${fl}<div class="lk">🔒</div><div class="n" style="opacity:.8">${n}</div>`;
      else inner = `${fl}<div class="lk" style="opacity:1;${s.st === 'new' ? 'color:#fff' : ''}">✉</div><div class="n">${n}</div>`;
      const tip = s.unlocked ? (s.e.head || `Jour ${n} — ${s.e.date}`) : `S’ouvre le ${frDay(s.ud)}`;
      g += `<div class="c ${s.st}" data-n="${n}" title="${esc(tip)}" style="--r:${rot[n - 1]}deg"><div class="pin"></div>${s.st === 'new' ? '<div class="tag">Nouveau</div>' : ''}<div class="e">${inner}</div></div>`;
    });
    const voteOpen = canVote(sts);
    const showKeys = !!DATA.keys && t >= new Date(seasonYear(t), 11, 25);
    host.innerHTML = `<div class="av-board">${lightsSvg()}<div class="av-head"><h3>🔍 ${esc(DATA.title.replace(/^Magnolia — /, ''))}</h3><span class="s">${esc(DATA.subtitle)} — un chapitre par jour ouvré</span>${preview}<span class="av-sp" style="flex:1"></span><span class="av-btn" id="avFold">▲ Replier</span></div><div class="av-grid" id="avGrid">${g}</div><div class="av-foot"><span>🕵️ <b>${nbRead} / 24</b> lus</span><span class="av-sp" style="flex:1"></span><span class="av-btn" data-p="carnet">📓 Carnet d’enquête</span><span class="av-btn" data-p="suspects">👥 Suspects</span>${(voteOpen || votesVisible(sts)) ? `<span class="av-btn p" data-p="vote">🗳️ ${voteOpen ? 'Voter' : 'Résultats du vote'}</span>` : ''}${showKeys ? '<span class="av-btn" data-p="cles">🗝️ Clés de lecture</span>' : ''}</div>${adm ? `<div class="av-adm">🧪 Superviseur : simuler la date <input type="date" id="avSim" value="${sim ? isoOf(sim) : ''}"> <span class="av-btn" id="avSimClear">Date réelle</span><span class="av-btn" id="avReset" title="Efface vos lectures, notes, suspects barrés et votre vote de test">🧹 Effacer mes tests</span><span>(visible par vous seul, sur ce poste)</span></div>` : ''}</div>`;
    host.querySelector('#avFold').addEventListener('click', () => { open = false; ls.set(LS_OPEN, '0'); render(); });
    host.querySelectorAll('.c').forEach(c => c.addEventListener('click', () => onEnvelope(Number(c.dataset.n))));
    host.querySelectorAll('[data-p]').forEach(b => b.addEventListener('click', () => openPanel(b.dataset.p)));
    const simIn = host.querySelector('#avSim');
    if(simIn){
      simIn.addEventListener('change', () => { ls.set(LS_SIM, simIn.value || ''); render(); });
      host.querySelector('#avSimClear').addEventListener('click', () => { ls.set(LS_SIM, ''); render(); });
      host.querySelector('#avReset').addEventListener('click', async () => {
        if(!confirm('Effacer vos tests (épisodes lus, carnet, suspects barrés, date simulée et votre vote) ?')) return;
        [LS_READ, LS_NOTES, LS_STRIKE, LS_SIM].forEach(k => { try{ localStorage.removeItem(k); } catch(e){} });
        const me = myVoteName();
        if(me){ try{ await storageTransaction(VOTES_KEY, cur => { const o = (cur && typeof cur === 'object') ? cur : {}; if(!(me in o)) return undefined; delete o[me]; return o; }); } catch(e){} }
        render();
      });
    }
    drawString();
  }

  function drawString(){
    const gr = document.getElementById('avGrid');
    if(!gr) return;
    const cells = Array.from(gr.querySelectorAll('.c')), b0 = gr.getBoundingClientRect();
    if(!b0.width) return;
    const pts = cells.map(c => { const b = c.getBoundingClientRect(); return [b.left - b0.left + b.width / 2, b.top - b0.top + 1]; });
    const cols = (getComputedStyle(gr).gridTemplateColumns || '').split(' ').filter(Boolean).length || 8;
    let path = '';
    for(let r = 0; r < Math.ceil(cells.length / cols); r++){
      const row = pts.slice(r * cols, r * cols + cols);
      const idxs = cells.slice(r * cols, r * cols + cols).map(c => c.classList.contains('locked'));
      // ficelle entre enveloppes déjà disponibles uniquement
      let started = false;
      for(let i = 0; i < row.length; i++){
        if(idxs[i]){ started = false; continue; }
        if(!started){ path += ' M' + row[i].join(','); started = true; }
        else { const a = row[i - 1], b = row[i]; path += ' Q' + ((a[0] + b[0]) / 2) + ',' + (Math.max(a[1], b[1]) + 12) + ' ' + b.join(','); }
      }
    }
    const old = gr.querySelector('svg.str'); if(old) old.remove();
    const sv = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    sv.setAttribute('class', 'str');
    sv.innerHTML = `<path d="${path}" stroke="var(--danger)" stroke-width="1.6" fill="none" opacity=".85"/>`;
    gr.appendChild(sv);
  }

  /* --- fenêtre de lecture / panneaux ---------------------------------------- */
  let modal = null;
  function closeModal(){ if(modal){ modal.remove(); modal = null; } document.removeEventListener('keydown', onKey); }
  function onKey(e){ if(e.key === 'Escape') closeModal(); }
  function showModal(inner, one){
    closeModal();
    modal = document.createElement('div'); modal.id = 'avmodal';
    modal.innerHTML = `<div class="m${one ? ' one' : ''}">${inner}</div>`;
    modal.addEventListener('click', e => { if(e.target === modal) closeModal(); });
    document.body.appendChild(modal);
    document.addEventListener('keydown', onKey);
    return modal;
  }

  function onEnvelope(n){
    const sts = status(today());
    const s = sts.find(x => x.e.n === n);
    if(!s) return;
    if(!s.unlocked){ showModal(`<div class="l"><div class="t"><h4>🔒 Cette enveloppe est encore scellée</h4><p>Elle s’ouvrira le <b>${esc(frDay(s.ud))}</b>.</p></div><div class="acts"><span class="sp"></span><button class="b" data-close>Fermer</button></div></div>`, true).querySelector('[data-close]').addEventListener('click', closeModal); return; }
    openEpisode(n);
  }

  function openEpisode(n){
    const t = today();
    const sts = status(t);
    const s = sts.find(x => x.e.n === n); if(!s || !s.unlocked) return;
    const prev = sts.find(x => x.e.n === n - 1 && x.unlocked), next = sts.find(x => x.e.n === n + 1 && x.unlocked);
    const rs = readSet();
    const m = showModal(`<div class="l"><div class="t" id="avText">${s.e.week ? `<div class="wk">${esc(s.e.week)}</div>` : ''}<h4>${esc(s.e.head || ('Jour ' + n + ' — ' + s.e.date))}</h4><div class="mt">≈ ${readMin(s.e)} min de lecture</div>${s.e.html}</div><div class="acts"><button class="b" id="avPrev" ${prev ? '' : 'disabled'}>← Précédent</button><button class="b" id="avNext" ${next ? '' : 'disabled'}>Suivant →</button><span class="sp"></span><button class="b ${rs.has(n) ? '' : 'ok'}" id="avMark">${rs.has(n) ? '✓ Lu (annuler)' : '✓ Marquer comme lu'}</button><button class="b" data-close>Fermer</button></div></div>`);
    m.querySelector('[data-close]').addEventListener('click', closeModal);
    m.querySelector('#avPrev').addEventListener('click', () => openEpisode(n - 1));
    m.querySelector('#avNext').addEventListener('click', () => openEpisode(n + 1));
    m.querySelector('#avMark').addEventListener('click', () => {
      const r = readSet(); if(r.has(n)) r.delete(n); else r.add(n); saveRead(r); closeModal(); render();
    });
    // lu automatiquement quand on arrive en bas du texte
    const txt = m.querySelector('#avText');
    const autoRead = () => {
      if(txt.scrollTop + txt.clientHeight >= txt.scrollHeight - 24){
        const r = readSet(); if(!r.has(n)){ r.add(n); saveRead(r); const b = m.querySelector('#avMark'); if(b){ b.textContent = '✓ Lu (annuler)'; b.classList.remove('ok'); } render(); }
      }
    };
    txt.addEventListener('scroll', autoRead);
    setTimeout(autoRead, 100);
  }

  function canVote(sts){
    const t = today();
    const open12 = sts.find(s => s.e.n === VOTE_FROM_DAY);
    const close = sts.find(s => s.e.n === VOTE_UNTIL_DAY);
    return !!(open12 && open12.unlocked && close && !close.unlocked);
  }
  function votesVisible(sts){ const c = sts.find(s => s.e.n === VOTE_UNTIL_DAY); return !!(c && c.unlocked); }
  function myVoteName(){ try{ return (typeof myName !== 'undefined' && myName) || ls.get('po-my-name', ''); } catch(e){ return ''; } }

  function openPanel(p){
    const sts = status(today());
    if(p === 'cles'){
      const m = showModal(`<div class="l"><div class="t"><div class="wk">Après le dénouement</div><h4>🗝️ Clés de lecture</h4><div class="mt">Les indices semés tout au long du récit — pour ceux qui voudront relire.</div>${DATA.keys || ''}</div><div class="acts"><span class="sp"></span><button class="b" data-close>Fermer</button></div></div>`);
      m.querySelector('[data-close]').addEventListener('click', closeModal); return;
    }
    if(p === 'carnet'){
      const m = showModal(`<div class="l"><div class="t"><div class="wk">Personnel</div><h4>📓 Carnet d’enquête</h4><p class="hint" style="font:13px 'IBM Plex Sans'">Vos notes, vos pistes, vos soupçons. Elles restent sur ce poste, personne d’autre ne les voit.</p><textarea id="avNotes" style="width:100%;min-height:260px;border:1px solid var(--line-strong);border-radius:3px;padding:10px;font:15px/1.5 Georgia,serif;background:#fff">${esc(ls.get(LS_NOTES, ''))}</textarea></div><div class="acts"><span class="sp"></span><button class="b" data-close>Fermer</button></div></div>`);
      const ta = m.querySelector('#avNotes'); ta.addEventListener('input', () => ls.set(LS_NOTES, ta.value));
      m.querySelector('[data-close]').addEventListener('click', closeModal); return;
    }
    if(p === 'suspects'){
      const stk = strikeSet();
      const draw = () => SUSPECTS.map(s => `<div data-s="${esc(s.id)}" class="${stk.has(s.id) ? 'x' : ''}"><span>${s.icon}</span>${esc(s.id)}</div>`).join('');
      const m = showModal(`<div class="l"><div class="t"><div class="wk">Personnel</div><h4>👥 Suspects</h4><p class="hint" style="font:13px 'IBM Plex Sans'">Cliquez sur un nom pour le barrer ou le rétablir. Ce tableau reste sur ce poste.</p><div class="su" id="avSu">${draw()}</div></div><div class="acts"><span class="sp"></span><button class="b" data-close>Fermer</button></div></div>`, true);
      m.querySelector('#avSu').addEventListener('click', e => {
        const d = e.target.closest('[data-s]'); if(!d) return;
        const id = d.dataset.s; if(stk.has(id)) stk.delete(id); else stk.add(id);
        saveStrike(stk); m.querySelector('#avSu').innerHTML = draw();
      });
      m.querySelector('[data-close]').addEventListener('click', closeModal); return;
    }
    if(p === 'vote'){ openVote(sts); }
  }

  function openVote(sts){
    const open = canVote(sts), visible = votesVisible(sts);
    const me = myVoteName();
    const mine = me && votes[me] ? votes[me].suspect : '';
    let body;
    if(open){
      body = `<p class="hint" style="font:13px 'IBM Plex Sans'">Qui, selon vous ? Vous pouvez changer d’avis jusqu’à l’ouverture de l’épisode 24. Les résultats seront dévoilés ce jour-là.</p><div class="su" id="avVoteGrid">${SUSPECTS.map(s => `<div data-v="${esc(s.id)}" class="${mine === s.id ? 'sel' : ''}"><span>${s.icon}</span>${esc(s.id)}</div>`).join('')}</div><p class="hint" id="avVoteMsg">${mine ? 'Votre vote : <b>' + esc(mine) + '</b>' : 'Pas encore voté.'}</p>`;
    } else if(visible){
      const tally = {}; SUSPECTS.forEach(s => tally[s.id] = 0);
      Object.keys(votes).forEach(k => { const v = votes[k] && votes[k].suspect; if(v in tally) tally[v]++; });
      const total = Object.keys(votes).length, max = Math.max(1, ...Object.values(tally));
      body = `<p class="hint" style="font:13px 'IBM Plex Sans'">${total} vote${total > 1 ? 's' : ''}.</p><div class="res">${SUSPECTS.map(s => `<div class="row"><span style="width:90px">${s.icon} ${esc(s.id)}</span><span class="bar" style="width:${Math.round(tally[s.id] / max * 220)}px"></span><b>${tally[s.id]}</b></div>`).join('')}</div>${mine ? `<p class="hint">Votre vote : <b>${esc(mine)}</b></p>` : ''}`;
    } else body = '<p>Le vote ouvrira avec l’épisode ' + VOTE_FROM_DAY + '.</p>';
    const m = showModal(`<div class="l"><div class="t"><div class="wk">Partagé avec l’équipe</div><h4>🗳️ ${open ? 'Qui est le coupable ?' : 'Résultats du vote'}</h4>${body}</div><div class="acts"><span class="sp"></span><button class="b" data-close>Fermer</button></div></div>`, true);
    m.querySelector('[data-close]').addEventListener('click', closeModal);
    const grid = m.querySelector('#avVoteGrid');
    if(grid) grid.addEventListener('click', async e => {
      const d = e.target.closest('[data-v]'); if(!d) return;
      let name = myVoteName();
      if(!name && typeof ensureMyName === 'function') name = ensureMyName();
      if(!name || name === 'Quelqu’un'){ return; }
      const choice = d.dataset.v;
      grid.querySelectorAll('[data-v]').forEach(x => x.classList.toggle('sel', x === d));
      try{
        await storageTransaction(VOTES_KEY, cur => { const o = (cur && typeof cur === 'object') ? cur : {}; o[name] = {suspect: choice, at: Date.now()}; return o; });
        const msg = m.querySelector('#avVoteMsg'); if(msg) msg.innerHTML = 'Votre vote : <b>' + esc(choice) + '</b> — enregistré ✓';
      } catch(err){ const msg = m.querySelector('#avVoteMsg'); if(msg) msg.textContent = 'Impossible d’enregistrer le vote (connexion ?). Réessayez.'; }
    });
  }

  /* --- démarrage ------------------------------------------------------------- */
  function start(){
    render();
    try{
      fbDb.ref(dbPath(VOTES_KEY)).on('value', snap => {
        let v = {};
        try{ v = snap.exists() && snap.val() ? JSON.parse(snap.val()) : {}; } catch(e){}
        votes = (v && typeof v === 'object') ? v : {};
      });
    } catch(e){}
    let lastAdm = adminNow();
    setInterval(() => { const a = adminNow(); if(a !== lastAdm){ lastAdm = a; render(); } }, 1500);   // bouton superviseur activé/désactivé
    setInterval(render, 3600 * 1000);   // site ouvert plusieurs jours : suit la date
    window.addEventListener('resize', () => { if(open) drawString(); });
  }
  start();
})();
