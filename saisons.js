/* ==========================================================================
   saisons.js — décor de saison pour tout le site (Planning + onglets).
   Chargé EN DERNIER (voir index.html) : s'il manquait ou plantait, le reste du
   site continuerait de fonctionner. Ne touche à AUCUNE donnée : uniquement
   l'apparence (couleurs de fond, motif discret, bandeau coloré en haut).

   - Par défaut, la saison est choisie automatiquement d'après la date du jour.
   - Un petit bouton rond (en bas à gauche) permet à chacun de choisir son décor
     (gardé sur son poste). Le superviseur peut IMPOSER un décor à toute l'équipe
     et gérer les anniversaires (bannière du jour). Seules 2 clés Firebase sont
     ajoutées : po:season-forced et po:birthdays.
   ========================================================================== */
(function(){
  const LS_KEY = 'po-season';
  const FORCED_KEY = 'po:season-forced';   // décor imposé à toute l'équipe (Firebase)
  const BDAY_KEY = 'po:birthdays';         // anniversaires de l'équipe (Firebase)
  const BDAY_DISMISS = 'po-bday-dismissed';

  function easterSunday(year){
    const a = year % 19, b = Math.floor(year / 100), c = year % 100;
    const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(year, month - 1, day);
  }
  function addDays(d, n){ return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
  function dayDiff(a, b){
    return Math.round((Date.UTC(a.getFullYear(), a.getMonth(), a.getDate()) - Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())) / 86400000);
  }
  /* Fête des mères (France) : dernier dimanche de mai, sauf si c'est la Pentecôte -> 1er dimanche de juin */
  function mothersDay(year){
    let d = new Date(year, 4, 31);
    while(d.getDay() !== 0) d = addDays(d, -1);
    if(dayDiff(d, addDays(easterSunday(year), 49)) === 0) d = addDays(d, 7);
    return d;
  }
  /* Fête des pères : 3e dimanche de juin */
  function fathersDay(year){
    let d = new Date(year, 5, 1);
    while(d.getDay() !== 0) d = addDays(d, 1);
    return addDays(d, 14);
  }
  /* Ordre de priorité : fêtes ponctuelles d'abord, puis la saison */
  function seasonFromDate(d){
    const md = (d.getMonth() + 1) * 100 + d.getDate();
    const y = d.getFullYear();
    if(md >= 1201 && md <= 1225) return 'christmas';
    if(md >= 1226 || md <= 103) return 'newyear';
    if(md >= 104 && md <= 112) return 'galette';
    if(md === 131 || md === 201 || md === 202) return 'chandeleur';
    if(md >= 207 && md <= 214) return 'valentine';
    const easter = easterSunday(y);
    const de = dayDiff(d, easter);
    if(de >= -51 && de <= -47) return 'carnaval';        // week-end gras -> Mardi gras
    if(de >= -7 && de <= 1) return 'easter';
    if(md >= 315 && md <= 317) return 'patrick';
    if(md === 429 || md === 430 || md === 501) return 'muguet';
    const dm = dayDiff(d, mothersDay(y));
    if(dm >= -6 && dm <= 0) return 'meres';
    if(md === 620 || md === 621) return 'musique';
    const dp = dayDiff(d, fathersDay(y));
    if(dp >= -6 && dp <= 0) return 'peres';
    if(md >= 708 && md <= 714) return 'bastille';
    if(md >= 1020 && md <= 1031) return 'halloween';
    if(md >= 1001 && md <= 1019) return 'pink';
    if(md >= 901 && md <= 915) return 'rentree';
    if(md >= 320 && md <= 620) return 'spring';
    if(md >= 621 && md <= 922) return 'summer';
    if(md >= 923 && md <= 1220) return 'autumn';
    return 'winter';
  }
  const NAMES = { autumn: 'Automne', winter: 'Hiver', spring: 'Printemps', summer: 'Été', halloween: 'Halloween', christmas: 'Noël',
    pink: 'Octobre rose', valentine: 'Saint-Valentin', easter: 'Pâques', newyear: 'Nouvel An', rentree: 'Rentrée', bastille: '14 juillet', galette: 'Galette des rois', chandeleur: 'Chandeleur', carnaval: 'Mardi gras', patrick: 'Saint-Patrick', muguet: '1er mai', meres: 'Fête des mères', musique: 'Fête de la musique', peres: 'Fête des pères', none: 'Sans décor' };
  const ICONS = { autumn: '🍂', winter: '❄️', spring: '🌸', summer: '☀️', halloween: '🎃', christmas: '🎄',
    pink: '🎀', valentine: '💝', easter: '🐣', newyear: '🎆', rentree: '🎒', bastille: '🎇', galette: '👑', chandeleur: '🥞', carnaval: '🎭', patrick: '🍀', muguet: '💐', meres: '🌷', musique: '🎵', peres: '👔', none: '🎨' };

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
    },
    pink: {
      paper: '#FAEEF2', line: '#EBD3DC', lineStrong: '#D3A5B8',
      gradTop: '#FDF3F6', gradBottom: '#F5DAE4',
      bar: ['#E0518A', '#F29BBB', '#B5336A'],
      opacity: 0.22
    },
    valentine: {
      paper: '#FAEEEE', line: '#EBD0D2', lineStrong: '#D3A0A6',
      gradTop: '#FDF2F2', gradBottom: '#F5D9DC',
      bar: ['#C8283E', '#F08CA0', '#8E1B33'],
      opacity: 0.20
    },
    easter: {
      paper: '#F6F4E8', line: '#E3DEC4', lineStrong: '#BFB98A',
      gradTop: '#FAF9EE', gradBottom: '#ECEFD6',
      bar: ['#F2D16B', '#A9D6A0', '#C9B3E6'],
      opacity: 0.24
    },
    newyear: {
      paper: '#F7F1E1', line: '#E6DBBC', lineStrong: '#C9B77F',
      gradTop: '#FBF6E8', gradBottom: '#EFE3C4',
      bar: ['#1F2A5A', '#D9A93E', '#8A9BD6'],
      opacity: 0.22
    },
    rentree: {
      paper: '#F2F2EA', line: '#DEDECB', lineStrong: '#B9BA95',
      gradTop: '#F8F8EF', gradBottom: '#E8EAD4',
      bar: ['#2F6FB0', '#E8A33D', '#C7452F'],
      opacity: 0.20
    },
    bastille: {
      paper: '#F2F2F6', line: '#D9DBE6', lineStrong: '#A9AECB',
      gradTop: '#F7F8FC', gradBottom: '#E1E4F0',
      bar: ['#2B4C9B', '#E4E6F0', '#D32F3F'],
      opacity: 0.20
    },
    galette: { paper: '#F8F0DC', line: '#E8D9AE', lineStrong: '#CDB36F', gradTop: '#FCF6E4', gradBottom: '#F1E1B4', bar: ['#D9A93E', '#F2D16B', '#B5832A'], opacity: 0.22 },
    chandeleur: { paper: '#F8F0E0', line: '#E8D8B8', lineStrong: '#CDB380', gradTop: '#FCF5E6', gradBottom: '#F0E0BC', bar: ['#E2A94B', '#F6D58A', '#B98232'], opacity: 0.22 },
    carnaval: { paper: '#F4EEF6', line: '#E0D2E6', lineStrong: '#BBA2C8', gradTop: '#F9F3FB', gradBottom: '#E9DAF0', bar: ['#8E4FBF', '#F2B93B', '#2FA3A0'], opacity: 0.22 },
    patrick: { paper: '#EEF4E8', line: '#D2E2C5', lineStrong: '#9FBF8A', gradTop: '#F4F9EE', gradBottom: '#DCEBCD', bar: ['#2E8B4F', '#7CC47F', '#D9A93E'], opacity: 0.22 },
    muguet: { paper: '#F1F6EE', line: '#D5E3CF', lineStrong: '#A6BFA0', gradTop: '#F7FBF4', gradBottom: '#E1EEDB', bar: ['#5FA36A', '#FFFFFF', '#8CC59A'], opacity: 0.24 },
    meres: { paper: '#FAEFF3', line: '#EDD5DE', lineStrong: '#D3A9BA', gradTop: '#FDF4F7', gradBottom: '#F6DCE6', bar: ['#E2799E', '#F6B6CB', '#B8517A'], opacity: 0.22 },
    musique: { paper: '#F0F0F8', line: '#D8D9EC', lineStrong: '#A9ABD3', gradTop: '#F6F6FC', gradBottom: '#E0E1F2', bar: ['#5B5FC7', '#E8573D', '#F2B93B'], opacity: 0.22 },
    peres: { paper: '#EDF1F6', line: '#D1DAE6', lineStrong: '#9EB0C8', gradTop: '#F3F6FA', gradBottom: '#DAE3EF', bar: ['#2F5D8C', '#7FA3C7', '#8A5A2B'], opacity: 0.22 }
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
  function heart(x, y, rot, sc, c){
    return `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${sc})"><path d="M0,12 C-20,-2 -13,-16 0,-7 C13,-16 20,-2 0,12Z" fill="${c}"/></g>`;
  }
  function ribbon(x, y, rot, sc, c){
    return `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${sc})" fill="none" stroke="${c}" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"><path d="M0,-18 C-14,-18 -14,2 0,9 C14,2 14,-18 0,-18Z"/><path d="M0,9 L-10,24 M0,9 L10,24"/></g>`;
  }
  function egg(x, y, rot, sc, c, band){
    return `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${sc})"><path d="M0,-17 C11,-17 14,4 14,8 C14,16 8,20 0,20 C-8,20 -14,16 -14,8 C-14,4 -11,-17 0,-17Z" fill="${c}"/><path d="M-13,6 L-7,1 L-2,6 L3,1 L8,6 L13,2" stroke="${band}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/></g>`;
  }
  function confetti(x, y, rot, sc, c){
    return `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${sc})"><circle cx="-8" cy="-6" r="2.6" fill="${c}"/><rect x="4" y="-8" width="9" height="3.4" rx="1.4" fill="${c}"/><circle cx="2" cy="8" r="2.2" fill="${c}"/><rect x="-12" y="6" width="8" height="3.2" rx="1.4" fill="${c}" transform="rotate(35 -8 7)"/></g>`;
  }
  function pencil(x, y, rot, sc, c){
    return `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${sc})"><rect x="-4" y="-22" width="8" height="30" fill="${c}"/><polygon points="-4,8 4,8 0,18" fill="#D9B27C"/><rect x="-4" y="-26" width="8" height="5" fill="#C7452F"/></g>`;
  }
  function notebook(x, y, rot, sc, c){
    return `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${sc})"><rect x="-13" y="-16" width="26" height="32" rx="3" fill="${c}"/><path d="M-6,-8H7M-6,-1H7M-6,6H7" stroke="#ffffff" stroke-opacity=".7" stroke-width="2" stroke-linecap="round"/></g>`;
  }
  function burst(x, y, sc, c){
    let rays = '';
    for(let i = 0; i < 10; i++){
      rays += `<path d="M0,-7V-17" stroke="${c}" stroke-width="2.4" stroke-linecap="round" transform="rotate(${i * 36})"/>`;
    }
    return `<g transform="translate(${x} ${y}) scale(${sc})">${rays}<circle r="2.6" fill="${c}"/></g>`;
  }

  function crown(x, y, rot, sc, c){
    return `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${sc})"><path d="M-16,10 L-18,-8 L-8,0 L0,-12 L8,0 L18,-8 L16,10Z" fill="${c}"/><rect x="-16" y="10" width="32" height="5" rx="1.5" fill="${c}"/></g>`;
  }
  function crepe(x, y, rot, sc, c){
    return `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${sc})"><circle r="16" fill="${c}"/><circle cx="-5" cy="-4" r="3" fill="#ffffff" fill-opacity=".45"/><circle cx="6" cy="5" r="2.4" fill="#ffffff" fill-opacity=".45"/></g>`;
  }
  function mask(x, y, rot, sc, c){
    return `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${sc})"><path d="M-20,-8 C-12,-14 12,-14 20,-8 C20,6 10,12 0,12 C-10,12 -20,6 -20,-8Z" fill="${c}"/><ellipse cx="-8" cy="-2" rx="4.5" ry="3" fill="#ffffff" fill-opacity=".85"/><ellipse cx="8" cy="-2" rx="4.5" ry="3" fill="#ffffff" fill-opacity=".85"/></g>`;
  }
  function shamrock(x, y, rot, sc, c){
    return `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${sc})"><circle cx="0" cy="-8" r="7.5" fill="${c}"/><circle cx="-8" cy="2" r="7.5" fill="${c}"/><circle cx="8" cy="2" r="7.5" fill="${c}"/><path d="M0,2 C0,10 2,16 6,20" stroke="${c}" stroke-width="3" stroke-linecap="round" fill="none"/></g>`;
  }
  function muguet(x, y, rot, sc, c){
    return `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${sc})"><path d="M0,22 C0,8 0,-4 8,-14" stroke="#5FA36A" stroke-width="2.6" stroke-linecap="round" fill="none"/><circle cx="-1" cy="-2" r="4.4" fill="${c}" stroke="#8CC59A" stroke-width="1.6"/><circle cx="4" cy="-9" r="4.2" fill="${c}" stroke="#8CC59A" stroke-width="1.6"/><circle cx="9" cy="-15" r="3.8" fill="${c}" stroke="#8CC59A" stroke-width="1.6"/><path d="M0,22 C-10,14 -12,6 -10,0" stroke="#5FA36A" stroke-width="2.6" stroke-linecap="round" fill="none"/></g>`;
  }
  function note(x, y, rot, sc, c){
    return `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${sc})"><ellipse cx="-6" cy="12" rx="6.5" ry="4.6" fill="${c}"/><path d="M0,12 L0,-14 L12,-9" stroke="${c}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"/></g>`;
  }
  function tie(x, y, rot, sc, c){
    return `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${sc})"><path d="M-7,-16 L7,-16 L4,-8 L-4,-8Z" fill="${c}"/><path d="M-4,-8 L4,-8 L10,12 L0,20 L-10,12Z" fill="${c}"/></g>`;
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
    } else if(season === 'pink'){
      inner = ribbon(44, 48, -10, 1, '#E0518A') + heart(170, 30, 12, .6, '#F29BBB') + ribbon(112, 124, 8, .8, '#F29BBB')
            + heart(222, 150, -10, .7, '#E0518A') + ribbon(54, 206, 12, .9, '#E0518A') + heart(160, 226, 8, .6, '#F29BBB');
    } else if(season === 'valentine'){
      inner = heart(42, 48, -12, 1, '#C8283E') + heart(170, 30, 14, .7, '#F08CA0') + heart(112, 124, 6, 1.1, '#C8283E')
            + heart(222, 150, -14, .8, '#F08CA0') + heart(52, 206, 12, .9, '#C8283E') + heart(160, 226, -6, .7, '#F08CA0');
    } else if(season === 'easter'){
      inner = egg(42, 48, -10, 1, '#F2B8CE', '#ffffff') + flower(170, 30, 10, .8, '#F4C6D1', '#F2D16B') + egg(112, 124, 8, 1.1, '#B9DDF2', '#F2D16B')
            + flower(222, 150, 0, .8, '#C9B3E6', '#F2D16B') + egg(54, 206, 12, .9, '#CDE5A8', '#ffffff') + egg(160, 226, -8, .85, '#F6DC8E', '#ffffff');
    } else if(season === 'newyear'){
      inner = star(42, 48, 10, 1, '#D9A93E') + confetti(170, 30, 20, 1, '#1F2A5A') + star(112, 124, 0, .8, '#8A9BD6')
            + confetti(222, 150, -30, .9, '#D9A93E') + star(54, 206, 20, .9, '#1F2A5A') + confetti(160, 226, 40, 1, '#8A9BD6');
    } else if(season === 'rentree'){
      inner = pencil(44, 48, 30, 1, '#E8A33D') + notebook(170, 32, 8, .8, '#2F6FB0') + pencil(112, 124, -25, 1.1, '#2F6FB0')
            + notebook(222, 150, -10, .8, '#E8A33D') + pencil(54, 206, 50, .9, '#2F6FB0') + notebook(160, 226, 6, .8, '#C7452F');
    } else if(season === 'bastille'){
      inner = burst(44, 48, 1, '#2B4C9B') + star(170, 30, 10, .8, '#D32F3F') + burst(112, 124, 1.2, '#D32F3F')
            + star(222, 150, 0, .8, '#2B4C9B') + burst(54, 206, .9, '#D32F3F') + star(160, 226, 18, .8, '#2B4C9B');
    } else if(season === 'galette'){
      inner = crown(44, 48, -8, 1, '#D9A93E') + star(170, 30, 10, .7, '#F2D16B') + crown(112, 124, 6, 1.1, '#B5832A')
            + star(222, 150, 0, .7, '#D9A93E') + crown(54, 206, 10, .9, '#D9A93E') + star(160, 226, 18, .7, '#F2D16B');
    } else if(season === 'chandeleur'){
      inner = crepe(44, 48, 0, 1, '#E2A94B') + crepe(170, 30, 0, .7, '#F6D58A') + crepe(112, 124, 0, 1.1, '#E2A94B')
            + crepe(222, 150, 0, .8, '#F6D58A') + crepe(54, 206, 0, .9, '#B98232') + crepe(160, 226, 0, .75, '#E2A94B');
    } else if(season === 'carnaval'){
      inner = mask(44, 48, -10, 1, '#8E4FBF') + confetti(170, 30, 20, 1, '#F2B93B') + mask(112, 124, 8, 1.1, '#2FA3A0')
            + confetti(222, 150, -30, .9, '#8E4FBF') + mask(54, 206, 12, .9, '#F2B93B') + confetti(160, 226, 40, 1, '#2FA3A0');
    } else if(season === 'patrick'){
      inner = shamrock(44, 48, -8, 1, '#2E8B4F') + shamrock(170, 30, 14, .7, '#7CC47F') + shamrock(112, 124, 6, 1.1, '#2E8B4F')
            + shamrock(222, 150, -12, .8, '#7CC47F') + shamrock(54, 206, 10, .9, '#2E8B4F') + star(160, 226, 18, .7, '#D9A93E');
    } else if(season === 'muguet'){
      inner = muguet(44, 48, -8, 1, '#FFFFFF') + leaf(170, 30, 40, .6, '#5FA36A') + muguet(112, 124, 10, 1.1, '#FFFFFF')
            + muguet(222, 150, -12, .9, '#FFFFFF') + muguet(54, 206, 8, .9, '#FFFFFF') + leaf(160, 226, -10, .6, '#5FA36A');
    } else if(season === 'meres'){
      inner = flower(42, 46, 10, 1, '#E2799E', '#F2D16B') + heart(170, 30, 12, .6, '#F6B6CB') + flower(112, 122, 0, 1.1, '#F6B6CB', '#F2D16B')
            + heart(222, 150, -10, .7, '#E2799E') + flower(52, 204, 20, .9, '#E2799E', '#F2D16B') + heart(160, 226, 8, .6, '#F6B6CB');
    } else if(season === 'musique'){
      inner = note(44, 48, -8, 1, '#5B5FC7') + note(170, 30, 12, .8, '#E8573D') + note(112, 124, 6, 1.1, '#F2B93B')
            + note(222, 150, -12, .9, '#5B5FC7') + note(54, 206, 10, .9, '#E8573D') + star(160, 226, 18, .7, '#F2B93B');
    } else if(season === 'peres'){
      inner = tie(44, 48, -8, 1, '#2F5D8C') + star(170, 30, 10, .7, '#7FA3C7') + tie(112, 124, 6, 1.1, '#8A5A2B')
            + star(222, 150, 0, .7, '#2F5D8C') + tie(54, 206, 10, .9, '#7FA3C7') + star(160, 226, 18, .7, '#8A5A2B');
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
    #seasonMenu{ max-height:70vh; overflow-y:auto; }
    #seasonMenu .season-sep{ padding:8px 10px 3px; font-size:11px; letter-spacing:.4px; text-transform:uppercase; color:var(--ink-soft); }
    #seasonMenu.open{ display:block; }
    #seasonMenu button{ display:flex; align-items:center; gap:8px; width:100%; text-align:left; border:none; background:none;
      padding:7px 10px; font:inherit; font-size:13px; color:var(--ink); cursor:pointer; border-radius:5px; }
    #seasonMenu button:hover{ background:var(--violet-bg); }
    #seasonMenu button.current{ font-weight:700; }
    #seasonMenu button:disabled{ opacity:.45; cursor:not-allowed; }
    #seasonMenu button[data-impose=auto]{ white-space:normal; font-weight:600; }
    #seasonMenu .season-note{ padding:6px 10px; font-size:12px; color:var(--ink-soft); max-width:230px; }
    #birthdayBanner{ display:flex; align-items:center; gap:10px; margin:0 0 12px; padding:10px 14px; border-radius:8px;
      background:linear-gradient(90deg,#FFE3EC,#FFF1C9); border:1px solid #F0B7C8; color:#7A2342; font-weight:600; font-size:15px; }
    #birthdayBanner .bday-text{ flex:1; }
    #birthdayBanner .bday-close{ border:none; background:none; cursor:pointer; font-size:16px; color:#7A2342; }
    #bdayOverlay{ position:fixed; inset:0; background:rgba(0,0,0,.4); z-index:100; display:flex; align-items:center; justify-content:center; padding:16px; }
    #bdayOverlay .bday-modal{ background:var(--panel,#fff); color:var(--ink,#222); border-radius:10px; padding:18px; width:100%; max-width:440px; max-height:85vh; overflow-y:auto; box-shadow:0 10px 30px rgba(0,0,0,.3); }
    #bdayOverlay h3{ margin:0 0 6px; } #bdayOverlay p{ margin:0 0 10px; font-size:13px; opacity:.8; }
    #bdayOverlay .bday-row{ display:flex; gap:6px; margin-bottom:6px; }
    #bdayOverlay .b-name{ flex:1; min-width:0; } #bdayOverlay .b-day, #bdayOverlay .b-month{ width:58px; }
    #bdayOverlay input{ padding:6px; border:1px solid var(--line-strong,#ccc); border-radius:5px; font:inherit; }
    #bdayOverlay .bday-actions{ display:flex; gap:8px; margin-top:10px; }
    #bdayOverlay button{ padding:6px 12px; border-radius:6px; border:1px solid var(--line-strong,#ccc); background:var(--panel,#fff); cursor:pointer; font:inherit; }
    #bdayOverlay .b-save{ background:#5B3A8C; color:#fff; border-color:#5B3A8C; }
    @media (max-width:600px){ #seasonBtn{ bottom:78px; } #seasonMenu{ bottom:122px; } }
    @media print{ #seasonBtn, #seasonMenu, #birthdayBanner, #bdayOverlay{ display:none !important; } }
  `;
  document.head.appendChild(baseCss);

  /* --- état : choix personnel, décor imposé, anniversaires ------------------ */
  let choice = 'auto';
  try{ choice = localStorage.getItem(LS_KEY) || 'auto'; } catch(e){}
  if(choice !== 'auto' && choice !== 'none' && !THEMES[choice]) choice = 'auto';
  let forced = null;      // {season, until:'YYYY-MM-DD'|'', by}
  let birthdays = [];     // [{name, day, month}]

  function todayIso(){
    const n = new Date();
    return n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-' + String(n.getDate()).padStart(2, '0');
  }
  function forcedActive(){
    if(!forced) return { season: 'auto', until: '' };           // par défaut : décor automatique pour toute l'équipe
    if(forced.season === 'free') return null;                   // le superviseur a rendu le choix libre
    if(forced.season !== 'auto' && !THEMES[forced.season]) return { season: 'auto', until: '' };
    if(forced.until && todayIso() > forced.until) return null;   // expiré
    return forced;
  }
  function activeSeason(){
    if(choice === 'none') return 'none';          // "Sans décor" personnel reste respecté
    const f = forcedActive();
    if(f) return f.season === 'auto' ? seasonFromDate(new Date()) : f.season;
    return choice === 'auto' ? seasonFromDate(new Date()) : choice;
  }
  function adminNow(){ try{ return typeof isAdmin !== 'undefined' && !!isAdmin; } catch(e){ return false; } }
  function frDate(iso){ const p = String(iso).split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : iso; }

  const btn = document.createElement('button');
  btn.id = 'seasonBtn'; btn.type = 'button'; btn.setAttribute('aria-label', 'Choisir le décor de saison');
  const menu = document.createElement('div');
  menu.id = 'seasonMenu';
  let menuMode = 'main';   // 'main' | 'impose'

  const FETES = ['pink', 'halloween', 'christmas', 'newyear', 'galette', 'chandeleur', 'valentine', 'carnaval', 'easter', 'patrick', 'muguet', 'meres', 'musique', 'peres', 'rentree', 'bastille'];
  const SAISONS = ['autumn', 'winter', 'spring', 'summer'];

  function renderMenu(){
    const f = forcedActive();
    let h = '';
    if(menuMode === 'impose'){
      h += '<div class="season-sep">Décor précis avec date de fin</div>';
      h += SAISONS.concat(FETES).map(k => `<button type="button" data-impose="${k}">${ICONS[k]} ${NAMES[k]}</button>`).join('');
      h += '<button type="button" data-act="back">← Retour</button>';
      menu.innerHTML = h;
      return;
    }
    if(f) h += `<div class="season-note">📌 Décor imposé par le superviseur : ${f.season === 'auto' ? '🔄 Automatique (selon la date)' : ICONS[f.season] + ' ' + NAMES[f.season]}${f.until ? ' (jusqu’au ' + frDate(f.until) + ')' : ''}</div>`;
    const dis = f ? ' disabled' : '';
    const item = (k, label) => `<button type="button" data-season="${k}"${dis} class="${k === choice ? 'current' : ''}">${label}${k === choice ? ' ✓' : ''}</button>`;
    h += item('auto', `${ICONS[seasonFromDate(new Date())]} Automatique (selon la date)`);
    SAISONS.forEach(k => { h += item(k, `${ICONS[k]} ${NAMES[k]}`); });
    h += '<div class="season-sep">Fêtes et événements</div>';
    FETES.forEach(k => { h += item(k, `${ICONS[k]} ${NAMES[k]}`); });
    h += `<button type="button" data-season="none" class="${choice === 'none' ? 'current' : ''}">${ICONS.none} Sans décor${choice === 'none' ? ' ✓' : ''}</button>`;
    if(adminNow()){
      h += '<div class="season-sep">Superviseur</div>';
      h += '<button type="button" data-impose="auto">📌 Imposer le décor AUTOMATIQUE à l’équipe (change selon les dates)</button>';
      h += '<button type="button" data-act="impose">📌 Imposer un décor précis (avec date de fin)…</button>';
      if(f) h += '<button type="button" data-act="unforce">✖ Rendre le choix libre à l’équipe</button>';
      h += '<button type="button" data-act="birthdays">🎂 Gérer les anniversaires…</button>';
    }
    menu.innerHTML = h;
  }

  function apply(){
    const s = activeSeason();
    styleEl.textContent = buildCss(s);
    document.documentElement.setAttribute('data-season', s);
    btn.textContent = ICONS[s] || '🎨';
    const f = forcedActive();
    btn.title = (f && choice !== 'none') ? `Décor imposé${f.season === 'auto' ? ' (automatique)' : ''} : ${NAMES[s]}` : (choice === 'auto' ? `Décor : ${NAMES[s]} (automatique)` : `Décor : ${NAMES[s]}`);
    renderMenu();
  }

  function fbRef(key){ return fbDb.ref(dbPath(key)); }
  async function imposeSeason(key){
    let until = '';
    if(key !== 'auto'){
      until = prompt('Jusqu’à quelle date imposer ce décor ?\nFormat AAAA-MM-JJ (ex. 2026-12-26).\nLaisser vide = jusqu’à ce que vous le retiriez.', '');
      if(until === null) return;
    }
    until = until.trim();
    if(until && !/^\d{4}-\d{2}-\d{2}$/.test(until)){ alert('Date non reconnue. Utilisez le format AAAA-MM-JJ.'); return; }
    const ok = await storageSet(FORCED_KEY, { season: key, until: until, by: (typeof myName !== 'undefined' && myName) || '' });
    if(!ok) alert('Impossible d’enregistrer (connexion ?). Réessayez.');
  }
  async function unforceSeason(){ await storageSet(FORCED_KEY, { season: 'free' }); }

  btn.addEventListener('click', e => { e.stopPropagation(); menuMode = 'main'; renderMenu(); menu.classList.toggle('open'); });
  menu.addEventListener('click', e => {
    e.stopPropagation();
    const b = e.target.closest('button');
    if(!b || b.disabled) return;
    if(b.dataset.season){
      choice = b.dataset.season;
      try{ localStorage.setItem(LS_KEY, choice); } catch(err){}
      menu.classList.remove('open');
      apply();
    } else if(b.dataset.impose){
      menu.classList.remove('open'); menuMode = 'main';
      imposeSeason(b.dataset.impose);
    } else if(b.dataset.act === 'impose'){ menuMode = 'impose'; renderMenu(); }
    else if(b.dataset.act === 'back'){ menuMode = 'main'; renderMenu(); }
    else if(b.dataset.act === 'unforce'){ menu.classList.remove('open'); unforceSeason(); }
    else if(b.dataset.act === 'birthdays'){ menu.classList.remove('open'); openBirthdayEditor(); }
  });
  document.addEventListener('click', () => menu.classList.remove('open'));

  /* --- anniversaires --------------------------------------------------------- */
  const MOIS = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  /* Messages pour une date donnée : le jour même ; le vendredi, ceux du week-end ; le lundi, ceux du week-end passé */
  function birthdayMessages(list, now){
    const out = [];
    const dow = now.getDay();
    const is = (b, d) => b.day === d.getDate() && b.month === d.getMonth() + 1;
    (list || []).forEach(b => {
      if(!b || !b.name || !b.day || !b.month) return;
      if(is(b, now)){ out.push(`🎂 Joyeux anniversaire ${b.name} ! 🎉`); return; }
      if(dow === 5){
        const sat = addDays(now, 1), sun = addDays(now, 2);
        if(is(b, sat) || is(b, sun)) out.push(`🎁 Anniversaire ${is(b, sat) ? 'samedi' : 'dimanche'} : ${b.name} — pensez à le souhaiter !`);
      }
      if(dow === 1){
        const sat = addDays(now, -2), sun = addDays(now, -1);
        if(is(b, sat) || is(b, sun)) out.push(`🎈 C’était l’anniversaire de ${b.name} ${is(b, sat) ? 'samedi' : 'dimanche'} — joyeux anniversaire en retard !`);
      }
    });
    return out;
  }
  function bdayDismissKey(msgs){ return todayIso() + '|' + msgs.join('§'); }
  function renderBirthdayBanner(){
    const old = document.getElementById('birthdayBanner');
    const msgs = birthdayMessages(birthdays, new Date());
    if(!msgs.length){ if(old) old.remove(); return; }
    let dismissed = '';
    try{ dismissed = localStorage.getItem(BDAY_DISMISS) || ''; } catch(e){}
    if(dismissed === bdayDismissKey(msgs)){ if(old) old.remove(); return; }
    const el = old || document.createElement('div');
    el.id = 'birthdayBanner';
    el.innerHTML = `<div class="bday-text">${msgs.map(m => `<div>${escapeHtml(m)}</div>`).join('')}</div><button type="button" class="bday-close" aria-label="Fermer" title="Fermer">✕</button>`;
    el.querySelector('.bday-close').addEventListener('click', () => {
      try{ localStorage.setItem(BDAY_DISMISS, bdayDismissKey(msgs)); } catch(e){}
      el.remove();
    });
    if(!old){
      const wrap = document.querySelector('.wrap') || document.body;
      wrap.insertBefore(el, wrap.firstChild);
    }
  }
  function openBirthdayEditor(){
    const ov = document.createElement('div');
    ov.id = 'bdayOverlay';
    const rows = (birthdays.length ? birthdays : [{ name: '', day: '', month: '' }]);
    const rowHtml = b => `<div class="bday-row"><input type="text" class="b-name" placeholder="Prénom" value="${escapeHtml(b.name || '')}"><input type="number" class="b-day" min="1" max="31" placeholder="JJ" value="${b.day || ''}"><input type="number" class="b-month" min="1" max="12" placeholder="MM" value="${b.month || ''}"><button type="button" class="b-del" title="Supprimer">✕</button></div>`;
    ov.innerHTML = `<div class="bday-modal"><h3>🎂 Anniversaires de l’équipe</h3><p>Prénom + jour + mois. La bannière s’affiche pour toute l’équipe le jour J (et le vendredi / lundi pour les week-ends).</p><div class="bday-rows">${rows.map(rowHtml).join('')}</div><div class="bday-actions"><button type="button" class="b-add">+ Ajouter</button><span style="flex:1"></span><button type="button" class="b-cancel">Annuler</button><button type="button" class="b-save">Enregistrer</button></div></div>`;
    document.body.appendChild(ov);
    const rowsEl = ov.querySelector('.bday-rows');
    ov.addEventListener('click', async e => {
      if(e.target === ov || e.target.classList.contains('b-cancel')){ ov.remove(); return; }
      if(e.target.classList.contains('b-add')){ rowsEl.insertAdjacentHTML('beforeend', rowHtml({})); return; }
      if(e.target.classList.contains('b-del')){ e.target.closest('.bday-row').remove(); return; }
      if(e.target.classList.contains('b-save')){
        const list = [];
        let bad = false;
        rowsEl.querySelectorAll('.bday-row').forEach(r => {
          const name = r.querySelector('.b-name').value.trim();
          const day = parseInt(r.querySelector('.b-day').value, 10);
          const month = parseInt(r.querySelector('.b-month').value, 10);
          if(!name && !day && !month) return;
          if(!name || !(day >= 1 && day <= 31) || !(month >= 1 && month <= 12)){ bad = true; return; }
          list.push({ name, day, month });
        });
        if(bad){ alert('Vérifiez chaque ligne : prénom, jour (1-31) et mois (1-12).'); return; }
        const ok = await storageSet(BDAY_KEY, list);
        if(!ok){ alert('Impossible d’enregistrer (connexion ?). Réessayez.'); return; }
        birthdays = list; renderBirthdayBanner(); ov.remove();
      }
    });
  }

  document.body.appendChild(btn);
  document.body.appendChild(menu);
  apply();

  /* Écoute en direct des deux réglages partagés (si Firebase est indisponible, le reste marche quand même) */
  try{
    fbRef(FORCED_KEY).on('value', snap => {
      let v = null;
      try{ v = snap.exists() && snap.val() ? JSON.parse(snap.val()) : null; } catch(e){}
      forced = v && v.season ? v : null;
      apply();
    });
    fbRef(BDAY_KEY).on('value', snap => {
      let v = [];
      try{ v = snap.exists() && snap.val() ? JSON.parse(snap.val()) : []; } catch(e){}
      birthdays = Array.isArray(v) ? v : [];
      renderBirthdayBanner();
    });
  } catch(e){}
  setInterval(() => { apply(); renderBirthdayBanner(); }, 3600 * 1000);   // site ouvert plusieurs jours : suit la date
  if(typeof window !== 'undefined'){ window.__saisons = { seasonFromDate, birthdayMessages, mothersDay, fathersDay, easterSunday }; }
})();
