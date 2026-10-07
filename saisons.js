/* ==========================================================================
   saisons.js — décor de saison pour tout le site (Planning + onglets).
   Chargé EN DERNIER (voir index.html) : s'il manquait ou plantait, le reste du
   site continuerait de fonctionner. Ne touche à AUCUNE donnée : uniquement
   l'apparence (couleurs de fond, motif discret, bandeau coloré en haut).

   - Par défaut, la saison est choisie automatiquement d'après la date du jour.
   - Un petit bouton rond (en bas à gauche) permet à chacun de forcer une saison
     ou de retirer le décor ; ce choix est gardé sur son poste uniquement.
   ========================================================================== */
(function(){
  const LS_KEY = 'po-season';

  /* --- saison d'après la date (hémisphère nord) --------------------------- */
  function seasonFromDate(d){
    const md = (d.getMonth() + 1) * 100 + d.getDate();
    if(md >= 1201 && md <= 1225) return 'christmas';   // Noël : du 1er au 25 décembre
    if(md >= 1020 && md <= 1031) return 'halloween';   // Halloween : du 20 au 31 octobre
    if(md >= 320 && md <= 620) return 'spring';
    if(md >= 621 && md <= 922) return 'summer';
    if(md >= 923 && md <= 1220) return 'autumn';
    return 'winter';
  }
  const NAMES = { autumn: 'Automne', winter: 'Hiver', spring: 'Printemps', summer: 'Été', halloween: 'Halloween', christmas: 'Noël', none: 'Sans décor' };
  const ICONS = { autumn: '🍂', winter: '❄️', spring: '🌸', summer: '☀️', halloween: '🎃', christmas: '🎄', none: '🎨' };

  /* --- palettes ------------------------------------------------------------ */
  const THEMES = {
    autumn: {
      paper: '#F4EADB', line: '#E1D0B6', lineStrong: '#C3A67A',
      gradTop: '#F9EFE0', gradBottom: '#EEDBC0',
      bar: ['#B5532A', '#D79A3C', '#7E2F3A'],
      opacity: 0.16
    },
    winter: {
      paper: '#EEF2F6', line: '#D3DDE8', lineStrong: '#A9B9CC',
      gradTop: '#F4F7FB', gradBottom: '#DFE8F2',
      bar: ['#7FA3C7', '#B7CCE2', '#5E7FA3'],
      opacity: 0.20
    },
    spring: {
      paper: '#F2F4EA', line: '#D9E0C9', lineStrong: '#B2BE97',
      gradTop: '#F7F8EF', gradBottom: '#E8F0DA',
      bar: ['#8DBB7A', '#E9A8B8', '#F2D16B'],
      opacity: 0.18
    },
    summer: {
      paper: '#F7F1E2', line: '#E8DBB5', lineStrong: '#CDB97A',
      gradTop: '#FCF5E0', gradBottom: '#F2E3B8',
      bar: ['#F2B93B', '#4FB3BF', '#EE8A4B'],
      opacity: 0.18
    },
    halloween: {
      paper: '#F2EAF0', line: '#DDD0DD', lineStrong: '#B8A3B8',
      gradTop: '#F8F1F6', gradBottom: '#E4D6E6',
      bar: ['#E8731A', '#5B3A8C', '#2B2233'],
      opacity: 0.20
    },
    christmas: {
      paper: '#F5EFE4', line: '#E3D8C6', lineStrong: '#C2AF8E',
      gradTop: '#FAF4E9', gradBottom: '#EBE0CC',
      bar: ['#B3312B', '#2F6F4F', '#D9A93E'],
      opacity: 0.20
    }
  };

  /* --- motifs (SVG en ligne, très discrets) ------------------------------- */
  function leaf(x, y, rot, s, c){
    return `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})"><path d="M0,-30 C18,-22 22,6 0,30 C-22,6 -18,-22 0,-30Z" fill="${c}"/><path d="M0,-26 L0,26" stroke="#ffffff" stroke-opacity=".55" stroke-width="1.6" fill="none"/></g>`;
  }
  function flake(x, y, rot, s, c){
    return `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})"><path d="M0,-14V14M-12,-7L12,7M-12,7L12,-7" stroke="${c}" stroke-width="2.2" stroke-linecap="round" fill="none"/></g>`;
  }
  function flower(x, y, rot, s, c, center){
    let petals = '';
    for(let i = 0; i < 5; i++){
      const a = (i * 72) * Math.PI / 180;
      petals += `<circle cx="${(Math.sin(a) * 8).toFixed(1)}" cy="${(-Math.cos(a) * 8).toFixed(1)}" r="6" fill="${c}"/>`;
    }
    return `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})">${petals}<circle r="4" fill="${center}"/></g>`;
  }
  function sun(x, y, s, c){
    let rays = '';
    for(let i = 0; i < 8; i++){
      rays += `<path d="M0,-15V-21" stroke="${c}" stroke-width="2.4" stroke-linecap="round" transform="rotate(${i * 45})"/>`;
    }
    return `<g transform="translate(${x} ${y}) scale(${s})"><circle r="9" fill="${c}"/>${rays}</g>`;
  }
  function wave(x, y, c){
    return `<path d="M${x},${y} q8,-8 16,0 t16,0 t16,0" stroke="${c}" stroke-width="2.4" stroke-linecap="round" fill="none"/>`;
  }
  function pumpkin(x, y, rot, sc, c){
    return `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${sc})"><ellipse cx="0" cy="2" rx="17" ry="14" fill="${c}"/><path d="M-6,-10 C-9,2 -9,8 -6,16 M6,-10 C9,2 9,8 6,16 M0,-12 L0,16" stroke="#ffffff" stroke-opacity=".4" stroke-width="1.4" fill="none"/><path d="M0,-12 C0,-18 3,-20 6,-21" stroke="#5E7A3A" stroke-width="3" stroke-linecap="round" fill="none"/></g>`;
  }
  function bat(x, y, rot, sc, c){
    return `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${sc})"><path d="M0,-4 C-4,-12 -14,-14 -24,-6 C-20,-6 -18,-2 -16,2 C-12,-2 -8,0 -6,4 C-3,2 -1,2 0,6 C1,2 3,2 6,4 C8,0 12,-2 16,2 C18,-2 20,-6 24,-6 C14,-14 4,-12 0,-4Z" fill="${c}"/></g>`;
  }
  function star(x, y, rot, sc, c){
    let pts = '';
    for(let i = 0; i < 10; i++){
      const r = i % 2 ? 4.5 : 11, a = i * 36 * Math.PI / 180;
      pts += `${(Math.sin(a) * r).toFixed(1)},${(-Math.cos(a) * r).toFixed(1)} `;
    }
    return `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${sc})"><polygon points="${pts.trim()}" fill="${c}"/></g>`;
  }
  function tree(x, y, rot, sc, c){
    return `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${sc})"><polygon points="0,-24 -12,-6 12,-6" fill="${c}"/><polygon points="0,-14 -16,6 16,6" fill="${c}"/><rect x="-3" y="6" width="6" height="7" fill="#8A5A2B"/></g>`;
  }
  function ornament(x, y, sc, c){
    return `<g transform="translate(${x} ${y}) scale(${sc})"><circle r="9" fill="${c}"/><rect x="-3" y="-13" width="6" height="5" fill="#D9A93E"/><path d="M-5,-3 C-3,-6 0,-7 2,-6" stroke="#ffffff" stroke-opacity=".55" stroke-width="1.6" stroke-linecap="round" fill="none"/></g>`;
  }
  function tile(season){
    let inner = '';
    if(season === 'autumn'){
      inner = leaf(40, 46, -25, 1, '#B5532A') + leaf(170, 30, 40, .8, '#D79A3C') + leaf(110, 120, 15, 1.1, '#8C3B2A')
            + leaf(220, 150, -50, .9, '#A8672B') + leaf(50, 200, 60, .85, '#D79A3C') + leaf(160, 225, -10, 1, '#B5532A');
    } else if(season === 'winter'){
      inner = flake(40, 44, 0, 1, '#7FA3C7') + flake(165, 28, 20, .8, '#9DB8D6') + flake(110, 120, 10, 1.1, '#7FA3C7')
            + flake(222, 148, 0, .9, '#9DB8D6') + flake(52, 205, 30, .85, '#7FA3C7') + flake(160, 226, 0, 1, '#9DB8D6');
    } else if(season === 'spring'){
      inner = flower(42, 46, 10, 1, '#E7A1B5', '#F2D16B') + leaf(170, 30, 40, .7, '#8DBB7A') + flower(112, 122, 0, 1.1, '#F4C6D1', '#F2D16B')
            + leaf(222, 150, -50, .75, '#8DBB7A') + flower(52, 204, 20, .9, '#E7A1B5', '#F2D16B') + leaf(160, 226, -10, .75, '#8DBB7A');
    } else if(season === 'halloween'){
      inner = pumpkin(44, 48, -8, 1, '#E8731A') + bat(170, 30, 10, .9, '#5B3A8C') + star(112, 124, 0, .7, '#E8731A')
            + bat(222, 148, -12, .8, '#2B2233') + pumpkin(54, 206, 10, .85, '#E8731A') + bat(160, 226, 0, 1, '#5B3A8C');
    } else if(season === 'christmas'){
      inner = tree(42, 48, 0, 1, '#2F6F4F') + star(170, 30, 15, .9, '#D9A93E') + ornament(112, 124, 1, '#B3312B')
            + flake(222, 148, 0, .9, '#D9A93E') + tree(54, 206, 0, .85, '#2F6F4F') + ornament(160, 226, .9, '#B3312B');
    } else {
      inner = sun(44, 46, 1, '#F2B93B') + wave(150, 34, '#4FB3BF') + sun(118, 124, 1.1, '#F2B93B')
            + wave(190, 150, '#4FB3BF') + wave(24, 206, '#4FB3BF') + sun(170, 224, .9, '#F2B93B');
    }
    const op = THEMES[season].opacity;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="260" height="260" viewBox="0 0 260 260"><g opacity="${op}">${inner}</g></svg>`;
  }

  /* --- feuille de style de la saison -------------------------------------- */
  function buildCss(season){
    if(season === 'none' || !THEMES[season]) return '';
    const t = THEMES[season];
    const url = 'data:image/svg+xml,' + encodeURIComponent(tile(season));
    return `
      :root{ --paper:${t.paper}; --line:${t.line}; --line-strong:${t.lineStrong}; }
      body{
        background-color:${t.paper};
        background-image:url("${url}"), linear-gradient(180deg, ${t.gradTop} 0%, ${t.gradBottom} 100%);
        background-size:260px 260px, 100% 100%;
        background-attachment:fixed, fixed;
      }
      body::before{
        content:''; position:fixed; top:0; left:0; right:0; height:5px; z-index:5; pointer-events:none;
        background:linear-gradient(90deg, ${t.bar[0]}, ${t.bar[1]}, ${t.bar[2]});
      }
      @media print{
        body{ background-image:none; background-color:#fff; }
        body::before{ display:none; }
      }
    `;
  }

  /* --- application --------------------------------------------------------- */
  const styleEl = document.createElement('style');
  styleEl.id = 'po-season-style';
  document.head.appendChild(styleEl);

  const baseCss = document.createElement('style');
  baseCss.textContent = `
    #seasonBtn{ position:fixed; left:12px; bottom:12px; z-index:40; width:36px; height:36px; border-radius:50%;
      border:1px solid var(--line-strong); background:var(--panel); font-size:18px; line-height:1; cursor:pointer;
      box-shadow:0 2px 8px rgba(0,0,0,.15); padding:0; }
    #seasonBtn:hover{ border-color:var(--violet); }
    #seasonMenu{ position:fixed; left:12px; bottom:56px; z-index:41; background:var(--panel); border:1px solid var(--line-strong);
      border-radius:8px; box-shadow:0 6px 18px rgba(0,0,0,.2); padding:6px; display:none; min-width:190px; }
    #seasonMenu.open{ display:block; }
    #seasonMenu button{ display:flex; align-items:center; gap:8px; width:100%; text-align:left; border:none; background:none;
      padding:7px 10px; font:inherit; font-size:13px; color:var(--ink); cursor:pointer; border-radius:5px; }
    #seasonMenu button:hover{ background:var(--violet-bg); }
    #seasonMenu button.current{ font-weight:700; }
    @media (max-width:600px){ #seasonBtn{ bottom:78px; } #seasonMenu{ bottom:122px; } }
    @media print{ #seasonBtn, #seasonMenu{ display:none !important; } }
  `;
  document.head.appendChild(baseCss);

  let choice = 'auto';
  try{ choice = localStorage.getItem(LS_KEY) || 'auto'; } catch(e){}
  if(choice !== 'auto' && choice !== 'none' && !THEMES[choice]) choice = 'auto';

  function activeSeason(){ return choice === 'auto' ? seasonFromDate(new Date()) : choice; }

  const btn = document.createElement('button');
  btn.id = 'seasonBtn'; btn.type = 'button'; btn.setAttribute('aria-label', 'Choisir le décor de saison');
  const menu = document.createElement('div');
  menu.id = 'seasonMenu';

  function apply(){
    const s = activeSeason();
    styleEl.textContent = buildCss(s);
    document.documentElement.setAttribute('data-season', s);
    btn.textContent = ICONS[s] || '🎨';
    btn.title = choice === 'auto' ? `Décor : ${NAMES[s]} (automatique)` : `Décor : ${NAMES[s]}`;
    const items = [['auto', `${ICONS[seasonFromDate(new Date())]} Automatique (selon la date)`],
      ['autumn', `${ICONS.autumn} Automne`], ['winter', `${ICONS.winter} Hiver`], ['spring', `${ICONS.spring} Printemps`],
      ['summer', `${ICONS.summer} Été`], ['halloween', `${ICONS.halloween} Halloween`], ['christmas', `${ICONS.christmas} Noël`],
      ['none', `${ICONS.none} Sans décor`]];
    menu.innerHTML = items.map(([k, label]) => `<button type="button" data-season="${k}" class="${k === choice ? 'current' : ''}">${label}${k === choice ? ' ✓' : ''}</button>`).join('');
  }
  btn.addEventListener('click', e => { e.stopPropagation(); menu.classList.toggle('open'); });
  menu.addEventListener('click', e => {
    const b = e.target.closest('button[data-season]');
    if(!b) return;
    choice = b.dataset.season;
    try{ localStorage.setItem(LS_KEY, choice); } catch(err){}
    menu.classList.remove('open');
    apply();
  });
  document.addEventListener('click', () => menu.classList.remove('open'));

  document.body.appendChild(btn);
  document.body.appendChild(menu);
  apply();
  setInterval(() => { if(choice === 'auto') apply(); }, 3600 * 1000);   // site ouvert plusieurs jours : la saison suit la date
})();
