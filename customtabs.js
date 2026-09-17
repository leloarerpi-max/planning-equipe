/* ==========================================================================
   customtabs.js — tout le code des onglets personnalisés (Dossiers,
   Anomalies, Contacts, et tous ceux que tu ajouteras). Ce fichier ne touche
   JAMAIS aux données ou fonctions du Planning — tu peux le modifier sans
   risque de casser l'onglet "Planning & Objectif".
   ========================================================================== */

const CUSTOMTABS_INDEX_KEY = 'po:customtabs-index';
function customTabKey(id){ return 'po:customtab:' + id; }

let customTabs = [];           // [{id, name}]
let activeAppTab = 'planning'; // 'planning' or a custom tab id
let activeCustomTabId = null;
let activeCustomTabData = null; // {columns:[{id,label}], rows:[{id, cells:{colId:val}}]}
let customTabListenerRef = null;
let customSortState = { colId: null, dir: null };  // tri d'affichage uniquement, non enregistré
let customSearchTerm = '';                          // recherche d'affichage uniquement, non enregistrée
let genericStatsOpen = false;                       // panneau "Statistiques par personne et par mois" (tableau libre)

function defaultCustomTabData(){
  return {
    type: 'generic',
    columns: [
      {id:'c1', label:'Colonne 1', align:'left', color:null, width:160, fontSize:null, cellType:'text'},
      {id:'c2', label:'Colonne 2', align:'left', color:null, width:160, fontSize:null, cellType:'text'}
    ],
    rows: [ {id: cryptoId(), cells: {}} ]
  };
}
/* --- Personnalisation des colonnes (tableau libre) : couleur, alignement, largeur, taille de texte, type --- */
const CUSTOM_COL_DEFAULT_WIDTH = 160;
const CUSTOM_COL_DEFAULT_FONTSIZE = 13;
function colContrastColor(hex){
  if(!hex || hex.length !== 7) return null;
  const r = parseInt(hex.substr(1,2),16), g = parseInt(hex.substr(3,2),16), b = parseInt(hex.substr(5,2),16);
  if([r,g,b].some(isNaN)) return null;
  const lum = (0.299*r + 0.587*g + 0.114*b) / 255;
  return lum > 0.6 ? '#242220' : '#ffffff';
}
/* --- Statistiques "par personne et par mois" pour un onglet tableau libre (ex : fichier Urgences importé) --- */
const STATS_MONTH_NAMES = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
function extractMonthKeyFromValue(val){
  if(val === undefined || val === null || val === '') return null;
  const s = String(val).trim();
  let m = s.match(/^(\d{4})-(\d{2})-\d{2}/);           // date au format ISO (colonne de type "Date")
  if(m) return `${m[1]}-${m[2]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);     // jj/mm/aaaa ou jj/mm/aa
  if(m){
    let yy = m[3];
    if(yy.length === 2) yy = '20' + yy;
    return `${yy}-${m[2].padStart(2,'0')}`;
  }
  m = s.match(/^(\d{1,2})\/(\d{1,2})$/);                // jj/mm sans année (comme dans le fichier Urgences)
  if(m) return `mois-${m[2].padStart(2,'0')}`;
  return null;
}
function monthKeyLabel(key){
  if(key.indexOf('mois-') === 0){
    const mm = parseInt(key.slice(5), 10);
    return STATS_MONTH_NAMES[mm-1] || key;
  }
  const parts = key.split('-');
  return `${STATS_MONTH_NAMES[parseInt(parts[1],10)-1] || parts[1]} ${parts[0]}`;
}
function guessGenericStatsColumn(d, kind){
  const cols = d.columns;
  if(!cols.length) return null;
  if(kind === 'date'){
    const dateCol = cols.find(c => c.cellType === 'date') || cols.find(c => /date/i.test(c.label));
    return (dateCol || cols[0]).label;
  }
  const personCol = cols.find(c => /personne|gestionnaire|traite|trait/i.test(c.label));
  if(personCol) return personCol.label;
  return cols[Math.min(8, cols.length-1)].label; // à défaut, colonne I (9e colonne) comme dans le fichier Urgences
}
function ensureGenericStatsPanel(){
  if(document.getElementById('genericStatsPanel')) return;
  const shell = document.getElementById('customTableShell');
  if(!shell || !shell.parentElement) return;
  const panel = document.createElement('div');
  panel.id = 'genericStatsPanel';
  panel.className = 'summary';
  panel.style.display = 'none';
  panel.innerHTML = `<h2>📊 Statistiques — lignes par personne et par mois</h2>
    <p class="hint">Choisis la colonne qui contient la personne, et la colonne qui contient la date. Ça se recalcule tout seul à chaque import ou modification.</p>
    <div id="genericStatsConfig"></div>
    <div id="genericStatsResult"></div>`;
  shell.parentElement.insertBefore(panel, shell.nextSibling);
}
function toggleGenericStatsPanel(){
  ensureGenericStatsPanel();
  genericStatsOpen = !genericStatsOpen;
  const panel = document.getElementById('genericStatsPanel');
  if(panel) panel.style.display = genericStatsOpen ? '' : 'none';
  if(genericStatsOpen) renderGenericStatsPanel();
}
function renderGenericStatsPanel(){
  const d = activeCustomTabData;
  if(!d || d.type !== 'generic') return;
  ensureGenericStatsPanel();
  const configEl = document.getElementById('genericStatsConfig');
  const resultEl = document.getElementById('genericStatsResult');
  if(!configEl || !resultEl) return;
  if(!d.columns.length){
    configEl.innerHTML = '';
    resultEl.innerHTML = '<p class="hint">Ajoute ou importe des colonnes pour pouvoir calculer une statistique.</p>';
    return;
  }
  d.statsConfig = d.statsConfig || {};
  const labels = d.columns.map(c => c.label);
  let personLabel = d.statsConfig.personColLabel;
  let dateLabel = d.statsConfig.dateColLabel;
  if(!personLabel || labels.indexOf(personLabel) === -1) personLabel = guessGenericStatsColumn(d, 'person');
  if(!dateLabel || labels.indexOf(dateLabel) === -1) dateLabel = guessGenericStatsColumn(d, 'date');

  configEl.innerHTML = `
    <div style="display:flex;flex-wrap:wrap;gap:14px;align-items:center;margin-bottom:16px;">
      <label style="font-size:12.5px;color:var(--ink-soft);">Colonne « personne » :
        <select id="statsPersonCol" style="margin-left:6px;padding:5px 8px;border:1px solid var(--line-strong);border-radius:4px;font-family:inherit;">
          ${labels.map(l => `<option value="${escapeHtml(l)}" ${l===personLabel?'selected':''}>${escapeHtml(l)}</option>`).join('')}
        </select>
      </label>
      <label style="font-size:12.5px;color:var(--ink-soft);">Colonne « date » :
        <select id="statsDateCol" style="margin-left:6px;padding:5px 8px;border:1px solid var(--line-strong);border-radius:4px;font-family:inherit;">
          ${labels.map(l => `<option value="${escapeHtml(l)}" ${l===dateLabel?'selected':''}>${escapeHtml(l)}</option>`).join('')}
        </select>
      </label>
      <button class="btn" id="statsRecalcBtn">Calculer et retenir ce choix</button>
    </div>`;

  document.getElementById('statsRecalcBtn').addEventListener('click', async () => {
    d.statsConfig = {
      personColLabel: document.getElementById('statsPersonCol').value,
      dateColLabel: document.getElementById('statsDateCol').value
    };
    await persistCustomTab();
    renderGenericStatsResult(d, d.statsConfig.personColLabel, d.statsConfig.dateColLabel);
  });

  renderGenericStatsResult(d, personLabel, dateLabel);
}
function renderGenericStatsResult(d, personLabel, dateLabel){
  const resultEl = document.getElementById('genericStatsResult');
  if(!resultEl) return;
  const personCol = d.columns.find(c => c.label === personLabel);
  const dateCol = d.columns.find(c => c.label === dateLabel);
  if(!personCol || !dateCol){
    resultEl.innerHTML = '<p class="hint">Choisis les deux colonnes ci-dessus puis clique sur « Calculer ».</p>';
    return;
  }
  const counts = {};
  const persons = new Set();
  let ignored = 0;
  d.rows.forEach(row => {
    const personVal = (row.cells[personCol.id] || '').toString().trim();
    const dateVal = row.cells[dateCol.id];
    if(!personVal) return;
    const monthKey = extractMonthKeyFromValue(dateVal);
    if(!monthKey){ ignored++; return; }
    persons.add(personVal);
    counts[monthKey] = counts[monthKey] || {};
    counts[monthKey][personVal] = (counts[monthKey][personVal] || 0) + 1;
  });
  const monthKeys = Object.keys(counts).sort();
  const personList = Array.from(persons).sort((a,b) => a.localeCompare(b, 'fr'));
  if(!monthKeys.length){
    resultEl.innerHTML = `<p class="hint">Aucune ligne exploitable pour l'instant. Vérifie que « ${escapeHtml(dateCol.label)} » contient bien des dates et que « ${escapeHtml(personCol.label)} » n'est pas vide.</p>`;
    return;
  }
  let html = '<div class="table-shell" style="overflow:auto;"><table class="stats-matrix"><thead><tr><th>Mois</th>';
  personList.forEach(p => { html += `<th>${escapeHtml(p)}</th>`; });
  html += '<th>Total</th></tr></thead><tbody>';
  const totalsByPerson = {};
  personList.forEach(p => { totalsByPerson[p] = 0; });
  let grandTotal = 0;
  monthKeys.forEach(mk => {
    html += `<tr><td class="stats-task-name">${escapeHtml(monthKeyLabel(mk))}</td>`;
    let rowTotal = 0;
    personList.forEach(p => {
      const n = counts[mk][p] || 0;
      rowTotal += n;
      totalsByPerson[p] += n;
      html += `<td class="${n>0?'stats-count-hi':'stats-count-0'}">${n || '—'}</td>`;
    });
    grandTotal += rowTotal;
    html += `<td style="font-weight:800;">${rowTotal}</td></tr>`;
  });
  html += `<tr style="font-weight:800;border-top:2px solid var(--ink);"><td class="stats-task-name">Total</td>`;
  personList.forEach(p => { html += `<td>${totalsByPerson[p]}</td>`; });
  html += `<td>${grandTotal}</td></tr>`;
  html += '</tbody></table></div>';
  if(ignored) html += `<p class="hint" style="margin-top:8px;">${ignored} ligne(s) ignorée(s) car la date n'a pas été reconnue.</p>`;
  resultEl.innerHTML = html;
}
function injectCustomTabExtraStyles(){
  if(document.getElementById('customtab-extra-styles')) return;
  const style = document.createElement('style');
  style.id = 'customtab-extra-styles';
  style.textContent = `
    table.custom-table{ table-layout:fixed; }
    .custom-col-head{ position:relative; padding-right:4px; }
    .custom-col-head .custom-col-input{ width:auto; }
    .custom-col-gear{
      flex-shrink:0; background:none; border:none; color:var(--ink-soft); opacity:.4;
      cursor:pointer; font-size:13px; padding:2px 5px; border-radius:3px; line-height:1;
    }
    .custom-col-gear:hover{ opacity:1; color:var(--violet); background:rgba(91,75,138,.1); }
    .custom-col-resize{
      position:absolute; top:0; right:-4px; width:7px; height:100%; cursor:col-resize; z-index:3;
    }
    .custom-col-resize:hover, .custom-col-resize.resizing{ background:var(--violet); opacity:.35; }
    .col-settings-popover{
      position:fixed; z-index:200; background:#fff; border:1px solid var(--line-strong); border-radius:6px;
      box-shadow:0 10px 28px rgba(0,0,0,.2); padding:14px; font-family:'IBM Plex Sans', sans-serif; font-size:12.5px;
      min-width:200px; display:none;
    }
    .col-settings-popover.open{ display:block; }
    .col-settings-title{ font-weight:700; font-size:12.5px; margin-bottom:10px; color:var(--ink); }
    .col-settings-row{ display:flex; align-items:center; gap:8px; margin-bottom:11px; }
    .col-settings-row:last-of-type{ margin-bottom:0; }
    .col-settings-label{ color:var(--ink-soft); font-size:11.5px; width:64px; flex-shrink:0; }
    .col-settings-popover input[type=color]{ width:32px; height:26px; padding:0; border:1px solid var(--line-strong); border-radius:4px; cursor:pointer; background:none; }
    .col-align-group{ display:flex; gap:4px; flex:1; }
    .col-align-btn{
      flex:1; background:var(--paper); border:1px solid var(--line-strong); border-radius:4px; padding:6px 0;
      cursor:pointer; font-size:13px; color:var(--ink-soft);
    }
    .col-align-btn.active{ background:var(--violet); border-color:var(--violet); color:#fff; }
    .col-settings-popover input[type=range]{ flex:1; accent-color:var(--violet); }
    .col-type-btn{
      flex:1; background:var(--paper); border:1px solid var(--line-strong); border-radius:4px; padding:6px 4px;
      cursor:pointer; font-size:12px; color:var(--ink-soft);
    }
    .col-type-btn.active{ background:var(--violet); border-color:var(--violet); color:#fff; }
    .col-settings-reset{ background:none; border:none; color:var(--ink-soft); text-decoration:underline; cursor:pointer; font-size:11px; padding:0; flex-shrink:0; }
    .col-settings-clear{ background:none; border:none; color:var(--ink-soft); text-decoration:underline; cursor:pointer; font-size:11.5px; padding:0; }
    .col-settings-delete{ width:100%; background:none; border:1px solid var(--danger); color:var(--danger); border-radius:4px; padding:7px 0; cursor:pointer; font-size:12px; margin-top:12px; }
    .col-settings-delete:hover{ background:var(--danger); color:#fff; }
    .col-status-option-row{ display:flex; align-items:center; gap:6px; }
    .col-status-option-row input[type=color]{ width:24px; height:24px; }
    .col-status-option-row input[type=text]{
      flex:1; min-width:0; border:1px solid var(--line-strong); border-radius:4px; padding:5px 6px;
      font-family:inherit; font-size:12px; color:var(--ink);
    }
    .col-status-opt-del{ background:none; border:none; color:var(--ink-soft); opacity:.5; cursor:pointer; font-size:12px; flex-shrink:0; }
    .col-status-opt-del:hover{ opacity:1; color:var(--danger); }
    .custom-col-sort{
      flex-shrink:0; background:none; border:none; color:var(--ink-soft); opacity:.35;
      cursor:pointer; font-size:11px; padding:2px 3px; border-radius:3px; line-height:1;
    }
    .custom-col-sort:hover{ opacity:1; }
    .custom-col-sort.active{ opacity:1; color:var(--violet); }
    .custom-search-bar{ display:flex; align-items:center; gap:10px; padding:10px 10px 12px; }
    .custom-search-bar input{
      flex:1; max-width:320px; border:1px solid var(--line-strong); border-radius:20px; padding:7px 14px;
      font-family:inherit; font-size:13px; background:#fff; color:var(--ink);
    }
    .custom-search-bar input:focus{ outline:1px solid var(--violet); }
    .custom-search-count{ font-size:12px; color:var(--ink-soft); white-space:nowrap; }
    .custom-status-select{
      width:auto; min-width:70px; max-width:96%; border:none; font-family:inherit; font-weight:700;
      padding:7px 12px; cursor:pointer; text-align:center; text-align-last:center; border-radius:12px;
      appearance:none; -webkit-appearance:none; box-shadow:inset 0 0 0 1px rgba(0,0,0,.08);
    }
    table.custom-table tfoot td{ border-top:2px solid var(--ink); background:var(--panel); font-size:12.5px; }
    table.custom-table th[draggable="true"]{ cursor:grab; }
    table.custom-table th.custom-col-dragover{ outline:2px dashed var(--violet); outline-offset:-2px; }
  `;
  document.head.appendChild(style);
}
function livePreviewColumnColor(colId, color){
  const shell = document.getElementById('customTableShell');
  if(!shell) return;
  const txtColor = colContrastColor(color);
  shell.querySelectorAll(`[data-colhead="${colId}"], [data-colcell="${colId}"]`).forEach(el => {
    el.style.background = color || '';
  });
  shell.querySelectorAll(`input[data-colid="${colId}"]`).forEach(inp => {
    inp.style.color = txtColor || '';
  });
}
function livePreviewColumnFontSize(colId, size){
  const shell = document.getElementById('customTableShell');
  if(!shell) return;
  const scale = Math.max(.75, Math.min(1.8, size / CUSTOM_COL_DEFAULT_FONTSIZE));
  shell.querySelectorAll(`input[type="text"][data-colid="${colId}"]`).forEach(inp => {
    inp.style.fontSize = size + 'px';
  });
  shell.querySelectorAll(`input[type="checkbox"][data-colid="${colId}"]`).forEach(cb => {
    cb.style.transform = `scale(${scale})`;
  });
}
function closeColSettingsPopover(){
  const p = document.getElementById('colSettingsPopover');
  if(p) p.classList.remove('open');
  document.removeEventListener('mousedown', handleOutsideColPopoverClick, true);
}
function handleOutsideColPopoverClick(e){
  const p = document.getElementById('colSettingsPopover');
  if(p && p.classList.contains('open') && !p.contains(e.target) && !e.target.closest('[data-colgear]')){
    closeColSettingsPopover();
  }
}
function openColSettingsPopover(colId, anchorBtn){
  const d = activeCustomTabData;
  const col = d.columns.find(c => c.id === colId);
  if(!col) return;
  let p = document.getElementById('colSettingsPopover');
  if(!p){
    p = document.createElement('div');
    p.id = 'colSettingsPopover';
    p.className = 'col-settings-popover';
    document.body.appendChild(p);
  }
  const align = col.align || 'left';
  const fontSize = col.fontSize || CUSTOM_COL_DEFAULT_FONTSIZE;
  const cellType = col.cellType || 'text';
  if(cellType === 'status' && !Array.isArray(col.options)) col.options = [];
  const statusOptionsHtml = (col.options||[]).map(o => `
    <div class="col-status-option-row" data-optid="${o.id}">
      <input type="color" class="col-status-opt-color" value="${o.color || '#8E7CC3'}" />
      <input type="text" class="col-status-opt-label" value="${escapeHtml(o.label)}" />
      <button class="col-status-opt-del" data-optdel="${o.id}" title="Supprimer cette option">✕</button>
    </div>`).join('');
  p.innerHTML = `
    <div class="col-settings-title">Réglages de la colonne</div>
    <div class="col-settings-row">
      <span class="col-settings-label">Couleur</span>
      <input type="color" id="colSettingsColorInput" value="${col.color || '#ffffff'}" />
      <button class="col-settings-clear" id="colSettingsClearColor">Aucune</button>
    </div>
    <div class="col-settings-row">
      <span class="col-settings-label">Alignement</span>
      <div class="col-align-group">
        <button class="col-align-btn ${align==='left'?'active':''}" data-align="left" title="Aligner à gauche">⟵</button>
        <button class="col-align-btn ${align==='center'?'active':''}" data-align="center" title="Centrer">≡</button>
        <button class="col-align-btn ${align==='right'?'active':''}" data-align="right" title="Aligner à droite">⟶</button>
      </div>
    </div>
    <div class="col-settings-row">
      <span class="col-settings-label">Taille</span>
      <input type="range" id="colSettingsFontSize" min="11" max="22" step="1" value="${fontSize}" />
      <span id="colSettingsFontSizeVal" style="width:32px;text-align:right;color:var(--ink-soft);">${fontSize}px</span>
      <button class="col-settings-reset" id="colSettingsFontReset" title="Revenir à la taille par défaut">↺</button>
    </div>
    <div class="col-settings-row">
      <span class="col-settings-label">Contenu</span>
      <select id="colSettingsType" style="flex:1;padding:6px;border:1px solid var(--line-strong);border-radius:4px;font-family:inherit;font-size:12.5px;background:#fff;">
        <option value="text" ${cellType==='text'?'selected':''}>Texte libre</option>
        <option value="number" ${cellType==='number'?'selected':''}>Nombre</option>
        <option value="date" ${cellType==='date'?'selected':''}>Date</option>
        <option value="checkbox" ${cellType==='checkbox'?'selected':''}>Case à cocher</option>
        <option value="status" ${cellType==='status'?'selected':''}>Liste déroulante (statuts)</option>
      </select>
    </div>
    ${cellType === 'status' ? `
    <div class="col-settings-row" style="align-items:flex-start;">
      <span class="col-settings-label">Options</span>
      <div id="colStatusOptions" style="flex:1;display:flex;flex-direction:column;gap:6px;">
        ${statusOptionsHtml}
        <button class="col-settings-reset" id="colStatusOptAdd" style="text-decoration:none;">+ Ajouter une option</button>
      </div>
    </div>` : ''}
    ${d.columns.length > 1 ? `<button class="col-settings-delete" id="colSettingsDelete">✕ Supprimer la colonne</button>` : ''}
  `;
  const rect = anchorBtn.getBoundingClientRect();
  const popW = 240;
  p.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - popW - 8)) + 'px';
  p.style.top = (rect.bottom + 6) + 'px';
  p.dataset.colid = colId;
  p.classList.add('open');

  p.querySelector('#colSettingsColorInput').addEventListener('input', (e) => {
    col.color = e.target.value;
    livePreviewColumnColor(colId, col.color);
  });
  p.querySelector('#colSettingsColorInput').addEventListener('change', async () => {
    await persistCustomTab();
  });
  p.querySelector('#colSettingsClearColor').addEventListener('click', async () => {
    col.color = null;
    livePreviewColumnColor(colId, null);
    p.querySelector('#colSettingsColorInput').value = '#ffffff';
    await persistCustomTab();
  });
  p.querySelectorAll('.col-align-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      col.align = btn.dataset.align;
      p.querySelectorAll('.col-align-btn').forEach(b => b.classList.toggle('active', b === btn));
      const shell = document.getElementById('customTableShell');
      const align2 = col.align;
      const txtColor = colContrastColor(col.color);
      shell.querySelectorAll(`input[data-colid="${colId}"]`).forEach(inp => {
        inp.style.textAlign = align2;
      });
      await persistCustomTab();
    });
  });
  p.querySelector('#colSettingsFontSize').addEventListener('input', (e) => {
    const size = parseInt(e.target.value, 10);
    col.fontSize = size;
    p.querySelector('#colSettingsFontSizeVal').textContent = size + 'px';
    livePreviewColumnFontSize(colId, size);
  });
  p.querySelector('#colSettingsFontSize').addEventListener('change', async () => {
    await persistCustomTab();
  });
  p.querySelector('#colSettingsFontReset').addEventListener('click', async () => {
    col.fontSize = null;
    p.querySelector('#colSettingsFontSize').value = CUSTOM_COL_DEFAULT_FONTSIZE;
    p.querySelector('#colSettingsFontSizeVal').textContent = CUSTOM_COL_DEFAULT_FONTSIZE + 'px';
    livePreviewColumnFontSize(colId, CUSTOM_COL_DEFAULT_FONTSIZE);
    await persistCustomTab();
  });
  p.querySelector('#colSettingsType').addEventListener('change', async (e) => {
    col.cellType = e.target.value;
    if(col.cellType === 'status' && !Array.isArray(col.options)) col.options = [];
    renderCustomTable();
    await persistCustomTab();
    openColSettingsPopover(colId, document.querySelector(`[data-colgear="${colId}"]`) || anchorBtn);
  });
  const optAdd = p.querySelector('#colStatusOptAdd');
  if(optAdd) optAdd.addEventListener('click', async () => {
    col.options = col.options || [];
    col.options.push({id: cryptoId(), label: 'Nouvelle option', color: '#8E7CC3'});
    renderCustomTable();
    await persistCustomTab();
    openColSettingsPopover(colId, document.querySelector(`[data-colgear="${colId}"]`) || anchorBtn);
  });
  p.querySelectorAll('.col-status-opt-color').forEach(inp => {
    inp.addEventListener('change', async () => {
      const row = inp.closest('.col-status-option-row');
      const opt = (col.options||[]).find(o => o.id === row.dataset.optid);
      if(!opt) return;
      opt.color = inp.value;
      renderCustomTable();
      await persistCustomTab();
      openColSettingsPopover(colId, document.querySelector(`[data-colgear="${colId}"]`) || anchorBtn);
    });
  });
  p.querySelectorAll('.col-status-opt-label').forEach(inp => {
    inp.addEventListener('change', async () => {
      const row = inp.closest('.col-status-option-row');
      const opt = (col.options||[]).find(o => o.id === row.dataset.optid);
      if(!opt) return;
      opt.label = inp.value;
      renderCustomTable();
      await persistCustomTab();
      openColSettingsPopover(colId, document.querySelector(`[data-colgear="${colId}"]`) || anchorBtn);
    });
  });
  p.querySelectorAll('[data-optdel]').forEach(btn => {
    btn.addEventListener('click', async () => {
      col.options = (col.options||[]).filter(o => o.id !== btn.dataset.optdel);
      renderCustomTable();
      await persistCustomTab();
      openColSettingsPopover(colId, document.querySelector(`[data-colgear="${colId}"]`) || anchorBtn);
    });
  });
  const delBtn = p.querySelector('#colSettingsDelete');
  if(delBtn) delBtn.addEventListener('click', async () => {
    d.columns = d.columns.filter(c => c.id !== colId);
    closeColSettingsPopover();
    renderCustomTable();
    await persistCustomTab();
  });

  setTimeout(() => document.addEventListener('mousedown', handleOutsideColPopoverClick, true), 0);
}
function wireCustomColumnResize(shell, d){
  shell.querySelectorAll('[data-colresize]').forEach(handle => {
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const colId = handle.dataset.colresize;
      const col = d.columns.find(c => c.id === colId);
      if(!col) return;
      const table = shell.querySelector('table.custom-table');
      const colIndex = d.columns.findIndex(c => c.id === colId);
      const colEl = table.querySelectorAll('colgroup col')[colIndex];
      if(!colEl) return;
      const startX = e.clientX;
      const startWidth = colEl.getBoundingClientRect().width;
      handle.classList.add('resizing');
      function onMove(ev){
        const newWidth = Math.max(60, Math.round(startWidth + (ev.clientX - startX)));
        colEl.style.width = newWidth + 'px';
      }
      function onUp(){
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        handle.classList.remove('resizing');
        col.width = parseInt(colEl.style.width, 10) || CUSTOM_COL_DEFAULT_WIDTH;
        persistCustomTab();
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  });
}
function defaultMealPlanningData(){
  return {
    type: 'mealplanning',
    people: ['Régis','Ben','Clara','Charlotte','Pierrick','Anaïs'].map(n => ({id: cryptoId(), name: n})),
    days: []
    // shifts key: dayId + '|' + personId -> free text value (e.g. "12h", "13h", anything)
  };
}
const MEAL_PALETTE = ['#6FA8DC', '#A9564A', '#8E7CC3', '#D9A63C', '#4F9D6E', '#4A7FC1', '#C2708C', '#7FA0A6'];
function mealPersonColor(data, personId){
  const idx = data.people.findIndex(p => p.id === personId);
  if(idx < 0) return null;
  return MEAL_PALETTE[idx % MEAL_PALETTE.length];
}
function defaultChecklistData(){
  return { type: 'checklist', rows: [] };
}

/* ---------- Suivi Excel (import EASY_SUIVI : une ligne par jour) ---------- */
// col = index de colonne (0-based) dans les feuilles mensuelles du fichier EASY_SUIVI_2026.xlsx
const SUIVI_COLUMNS = [
  {id:'mails_courtier',            label:'Mails courtier',        col:1,  type:'num'},
  {id:'mail_resil_echanges_resil', label:'Mail résil + éch. résil', col:2, type:'num'},
  {id:'mails_avenant',             label:'Mails avenant',         col:3,  type:'num'},
  {id:'stock_matin',               label:'Stock matin',           col:4,  type:'formula'},
  {id:'stock_soir',                label:'Stock soir',            col:6,  type:'num'},
  {id:'recu',                      label:'Reçu',                  col:8,  type:'formula'},
  {id:'traite',                    label:'Traité',                col:9,  type:'formula'},
  {id:'impayes_traites',           label:'Impayés traités',       col:12, type:'num'},
  {id:'mise_demeure_traites',      label:'MED traités',           col:13, type:'num'},
  {id:'echange_client',            label:'Éch. client',           col:15, type:'num'},
  {id:'se_msa',                    label:'SE MSA',                col:16, type:'num'},
  {id:'date_mail_prio',            label:'Date mail prio',        col:18, type:'date'},
  {id:'delai_prio',                label:'Délai prio',            col:19, type:'num'},
  {id:'date_non_prio',             label:'Date non prio',         col:20, type:'date'},
  {id:'delai_non_prio',            label:'Délai non prio',        col:21, type:'num'},
  {id:'echange_courtier_vip',      label:'Éch. courtier+VIP',     col:23, type:'num'},
  {id:'nbre_etp',                  label:'ETP',                   col:25, type:'num'},
  {id:'productivite',              label:'Productivité',          col:26, type:'formula'},
];
// Champs calculés automatiquement (non saisissables), recalculés dès que leurs sources changent
const SUIVI_FORMULA_TRIGGER_COLS = [
  'mails_courtier','mail_resil_echanges_resil','mails_avenant','stock_soir',
  'impayes_traites','mise_demeure_traites','echange_client','se_msa','echange_courtier_vip','nbre_etp'
];
function suiviToNum(v){
  if(typeof v === 'number') return v;
  if(v === undefined || v === null || v === '') return 0;
  const n = Number(String(v).replace(',', '.'));
  return isNaN(n) ? 0 : n;
}
function recomputeSuiviDerivedFields(row){
  row.values = row.values || {};
  const stockSourceCols = ['mails_courtier','mail_resil_echanges_resil','mails_avenant','stock_soir'];
  const hasStockSources = stockSourceCols.some(k => row.values[k] !== undefined && row.values[k] !== null && row.values[k] !== '');
  if(!hasStockSources){
    delete row.values.stock_matin; delete row.values.recu; delete row.values.traite;
  } else {
    const mc = suiviToNum(row.values.mails_courtier);
    const mr = suiviToNum(row.values.mail_resil_echanges_resil);
    const ma = suiviToNum(row.values.mails_avenant);
    const stockSoir = suiviToNum(row.values.stock_soir);
    const stockMatin = mc + mr + ma;
    row.values.stock_matin = stockMatin;
    row.values.recu = stockMatin;
    row.values.traite = stockMatin - stockSoir;
  }

  // Productivité = SIERREUR( (Reçu + Impayés traités + MED traités + Éch. client + SE MSA + Éch. courtier+VIP) / ETP ; "" )
  const prodSourceCols = ['recu','impayes_traites','mise_demeure_traites','echange_client','se_msa','echange_courtier_vip','nbre_etp'];
  const hasProdSources = prodSourceCols.some(k => row.values[k] !== undefined && row.values[k] !== null && row.values[k] !== '');
  if(!hasProdSources){
    delete row.values.productivite;
  } else {
    const etp = suiviToNum(row.values.nbre_etp);
    if(!etp){
      row.values.productivite = '';
    } else {
      const sum = suiviToNum(row.values.recu) + suiviToNum(row.values.impayes_traites) + suiviToNum(row.values.mise_demeure_traites)
                + suiviToNum(row.values.echange_client) + suiviToNum(row.values.se_msa) + suiviToNum(row.values.echange_courtier_vip);
      row.values.productivite = Math.round((sum/etp) * 100) / 100;
    }
  }
}
// Correspondance entre les badges du Planning (voir TASK_CATEGORIES dans planning.js) et les colonnes Suivi
const CATEGORY_TO_SUIVI_COL = {
  'MAIL': 'mails_courtier',
  'AVENANTS': 'mails_avenant',
  'ECHANGES CLTS': 'echange_client',
  'EDITIONS': 'se_msa',
  'ECHANGE': 'echange_courtier_vip',
  'RESIL': 'mail_resil_echanges_resil',
};
function defaultSuiviData(){
  return { type: 'suivi', days: [] }; // days: [{id, date:'YYYY-MM-DD', values:{colId:val}}]
}
function defaultPhonePlanningData(){
  return {
    type: 'phoneplanning',
    people: ['Clara','Charlotte','Ben','Anaïs'].map(n => ({id: cryptoId(), name: n})),
    slots: ['09h-10h','10h-11h','11h-12h','12h-13h','13h-14h','14h-15h','15h-16h','16h-17h'].map(l => ({id: cryptoId(), label: l})),
    days: [],
    shifts: {}
  };
}
function phonePersonColorByName(d, name){
  const idx = d.people.findIndex(p => p.name.trim().toLowerCase() === (name||'').trim().toLowerCase());
  if(idx < 0) return null;
  return MEAL_PALETTE[idx % MEAL_PALETTE.length];
}

async function initCustomTabs(){
  customTabs = await storageGet(CUSTOMTABS_INDEX_KEY);
  if(!customTabs || !customTabs.length){
    customTabs = [
      {id: cryptoId(), name: 'Dossiers'},
      {id: cryptoId(), name: 'Anomalies'},
      {id: cryptoId(), name: 'Contacts'}
    ];
    await storageSet(CUSTOMTABS_INDEX_KEY, customTabs);
    for(const t of customTabs){
      await storageSet(customTabKey(t.id), defaultCustomTabData());
    }
  }
  attachCustomTabsIndexListener();
  renderAppTabs();
}

function attachCustomTabsIndexListener(){
  fbDb.ref(dbPath(CUSTOMTABS_INDEX_KEY)).on('value', snap => {
    if(!snap.exists()) return;
    let fresh;
    try{ fresh = JSON.parse(snap.val()); } catch(e){ return; }
    if(!fresh || !Array.isArray(fresh)) return;
    if(JSON.stringify(fresh) === JSON.stringify(customTabs)) return;
    customTabs = fresh;
    renderAppTabs();
  });
}

function renderAppTabs(){
  const bar = document.getElementById('appTabs');
  let html = `<button class="apptab-btn ${activeAppTab==='planning'?'active':''}" data-apptab="planning">Planning</button>`;
  customTabs.forEach(t => {
    html += `<button class="apptab-btn ${activeAppTab===t.id?'active':''}" data-apptab="${t.id}">${escapeHtml(t.name)}<span class="apptab-del" data-apptab-del="${t.id}" title="Supprimer cet onglet (superviseur)">✕</span></button>`;
  });
  html += `<button class="apptab-add" id="btnAddAppTab">+ Nouvel onglet</button>`;
  bar.innerHTML = html;

  bar.querySelectorAll('.apptab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      if(e.target.classList.contains('apptab-del')) return;
      switchAppTab(btn.dataset.apptab);
    });
  });
  bar.querySelectorAll('.apptab-del').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteAppTab(btn.dataset.apptabDel);
    });
  });
  document.getElementById('btnAddAppTab').addEventListener('click', addAppTab);
}

function normalizeMealDataOnLoad(d){
  if(d && d.type === 'mealplanning' && !d.shifts) d.shifts = {};
  if(d && d.type === 'suivi' && !d.days) d.days = [];
  if(d && Array.isArray(d.columns)){
    d.columns.forEach(col => {
      if(col.align === undefined) col.align = 'left';
      if(col.color === undefined) col.color = null;
      if(!col.width) col.width = CUSTOM_COL_DEFAULT_WIDTH;
      if(col.fontSize === undefined) col.fontSize = null;
      if(!col.cellType) col.cellType = 'text';
      if(col.cellType === 'status' && !Array.isArray(col.options)) col.options = [];
    });
  }
  return d;
}

async function switchAppTab(tabId){
  closeColSettingsPopover();
  customSortState = { colId: null, dir: null };
  customSearchTerm = '';
  genericStatsOpen = false;
  const gsp0 = document.getElementById('genericStatsPanel');
  if(gsp0) gsp0.style.display = 'none';
  activeAppTab = tabId;
  document.getElementById('app-tab-planning').style.display = tabId === 'planning' ? '' : 'none';
  document.getElementById('app-tab-custom').style.display = tabId === 'planning' ? 'none' : '';
  renderAppTabs();
  if(tabId === 'planning') return;

  activeCustomTabId = tabId;
  const tabMeta = customTabs.find(t => t.id === tabId);
  document.getElementById('customTabTitle').textContent = tabMeta ? tabMeta.name : 'Onglet';
  document.getElementById('customTableShell').innerHTML = '<div class="empty-note">Chargement…</div>';
  activeCustomTabData = await storageGet(customTabKey(tabId));
  if(!activeCustomTabData || (!activeCustomTabData.columns && !activeCustomTabData.people && !activeCustomTabData.rows && !activeCustomTabData.slots && !activeCustomTabData.days)){
    activeCustomTabData = defaultCustomTabData();
  }
  normalizeMealDataOnLoad(activeCustomTabData);
  attachCustomTabListener(tabId);
  renderCustomTable();
  updateCustomToolbarForType();
}

function updateCustomToolbarForType(){
  const type = activeCustomTabData && activeCustomTabData.type;
  const isMeal = type === 'mealplanning';
  const isChecklist = type === 'checklist';
  const isPhone = type === 'phoneplanning';
  const isSuivi = type === 'suivi';
  const isGeneric = !isMeal && !isChecklist && !isPhone && !isSuivi;
  document.getElementById('btnAddColumn').style.display = isGeneric ? '' : 'none';
  document.getElementById('btnAddRow').style.display = isGeneric ? '' : 'none';
  document.getElementById('btnAddMealDate').style.display = isMeal ? '' : 'none';
  document.getElementById('btnAddMealMonth').style.display = isMeal ? '' : 'none';
  document.getElementById('btnSaveMealTemplate').style.display = isMeal ? '' : 'none';
  document.getElementById('btnAddMealPerson').style.display = isMeal ? '' : 'none';
  document.getElementById('btnConvertMealPlanning').style.display = isGeneric ? '' : 'none';
  document.getElementById('btnAddChecklistRow').style.display = isChecklist ? '' : 'none';
  document.getElementById('btnImportExcel').style.display = isChecklist ? '' : 'none';
  document.getElementById('btnConvertChecklist').style.display = isGeneric ? '' : 'none';
  document.getElementById('btnAddPhoneDate').style.display = isPhone ? '' : 'none';
  document.getElementById('btnAddPhoneMonth').style.display = isPhone ? '' : 'none';
  document.getElementById('btnAddPhoneSlot').style.display = isPhone ? '' : 'none';
  document.getElementById('btnAddPhonePerson').style.display = isPhone ? '' : 'none';
  document.getElementById('btnRenamePhonePerson').style.display = isPhone ? '' : 'none';
  document.getElementById('btnSavePhoneTemplate').style.display = isPhone ? '' : 'none';
  document.getElementById('btnConvertPhonePlanning').style.display = isGeneric ? '' : 'none';
  document.getElementById('btnAddSuiviDate').style.display = isSuivi ? '' : 'none';
  document.getElementById('btnImportSuiviExcel').style.display = isSuivi ? '' : 'none';
  document.getElementById('btnExportSuivi').style.display = isSuivi ? '' : 'none';
  document.getElementById('btnConvertSuivi').style.display = isGeneric ? '' : 'none';
  ensureGenericToolbarButtons();
  const genericBtnIds = ['btnGenericSaveTemplate','btnGenericExportExcel','btnGenericImportExcel','btnGenericStats'];
  genericBtnIds.forEach(id => { const el = document.getElementById(id); if(el) el.style.display = isGeneric ? '' : 'none'; });
  if(!isGeneric){
    genericStatsOpen = false;
    const gsp = document.getElementById('genericStatsPanel');
    if(gsp) gsp.style.display = 'none';
  }
}
/* --- Boutons de barre d'outils créés dynamiquement pour le tableau libre (modèle, import/export Excel) --- */
const GENERIC_COLUMN_TEMPLATE_KEY = 'po:generic-column-template';
function ensureGenericToolbarButtons(){
  if(document.getElementById('btnGenericExportExcel')) return;
  const anchor = document.getElementById('btnAddRow');
  if(!anchor || !anchor.parentElement) return;
  const toolbar = anchor.parentElement;

  const btnTemplate = document.createElement('button');
  btnTemplate.type = 'button';
  btnTemplate.className = 'btn';
  btnTemplate.id = 'btnGenericSaveTemplate';
  btnTemplate.textContent = '💾 Enregistrer les colonnes comme modèle';
  toolbar.insertBefore(btnTemplate, anchor.nextSibling);

  const btnExport = document.createElement('button');
  btnExport.type = 'button';
  btnExport.className = 'btn';
  btnExport.id = 'btnGenericExportExcel';
  btnExport.textContent = '⬇️ Exporter en Excel';
  toolbar.insertBefore(btnExport, btnTemplate.nextSibling);

  const btnImport = document.createElement('button');
  btnImport.type = 'button';
  btnImport.className = 'btn';
  btnImport.id = 'btnGenericImportExcel';
  btnImport.textContent = '📥 Importer un fichier Excel';
  toolbar.insertBefore(btnImport, btnExport.nextSibling);

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.id = 'genericExcelFileInput';
  fileInput.accept = '.xlsx,.xls,.csv';
  fileInput.style.display = 'none';
  toolbar.insertBefore(fileInput, btnImport.nextSibling);

  const btnStats = document.createElement('button');
  btnStats.type = 'button';
  btnStats.className = 'btn';
  btnStats.id = 'btnGenericStats';
  btnStats.textContent = '📊 Statistiques par personne/mois';
  toolbar.insertBefore(btnStats, fileInput.nextSibling);

  btnImport.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', handleGenericExcelImport);
  btnExport.addEventListener('click', handleGenericExcelExport);
  btnTemplate.addEventListener('click', handleSaveGenericColumnTemplate);
  btnStats.addEventListener('click', toggleGenericStatsPanel);
}
function genericCellDisplayValue(col, val){
  const type = col.cellType || 'text';
  if(type === 'checkbox') return val === true ? 'Oui' : 'Non';
  if(type === 'status'){
    const opt = (col.options || []).find(o => o.id === val);
    return opt ? opt.label : '';
  }
  return (val === undefined || val === null) ? '' : val;
}
async function handleGenericExcelExport(){
  if(typeof XLSX === 'undefined'){
    alert("La librairie Excel n'a pas pu se charger. Vérifie ta connexion et réessaie.");
    return;
  }
  const d = activeCustomTabData;
  const header = d.columns.map(c => c.label);
  const aoa = [header];
  d.rows.forEach(row => {
    aoa.push(d.columns.map(col => genericCellDisplayValue(col, row.cells[col.id])));
  });
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  const tabName = (customTabs.find(t => t.id === activeCustomTabId) || {}).name || 'Tableau';
  XLSX.utils.book_append_sheet(wb, ws, tabName.replace(/[\[\]\*\/\\\?:]/g,'').slice(0,31) || 'Feuille1');
  const safeName = tabName.replace(/[^a-z0-9_\-]+/gi, '_');
  XLSX.writeFile(wb, `${safeName}-${todayIso()}.xlsx`);
  logChange(`a exporté l'onglet « ${tabName} » en fichier Excel`);
}
async function handleGenericExcelImport(e){
  const file = e.target.files[0];
  e.target.value = '';
  if(!file) return;
  if(typeof XLSX === 'undefined'){
    alert("La librairie Excel n'a pas pu se charger. Vérifie ta connexion et réessaie.");
    return;
  }
  if(!confirm("Importer ce fichier va remplacer les colonnes et les lignes actuelles de cet onglet par le contenu du fichier. Continuer ?")) return;
  try{
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, {type:'array', cellDates:true});
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, {header:1, raw:false, defval:''});
    if(!rows.length){ alert('Fichier vide.'); return; }
    const header = rows[0];
    const newColumns = header.map((label, i) => ({
      id: cryptoId(), label: String(label || `Colonne ${i+1}`), align:'left', color:null,
      width: CUSTOM_COL_DEFAULT_WIDTH, fontSize:null, cellType:'text'
    }));
    const newRows = [];
    for(let r=1; r<rows.length; r++){
      const rawRow = rows[r] || [];
      if(rawRow.every(v => v === '' || v === undefined || v === null)) continue;
      const cells = {};
      newColumns.forEach((col, i) => { cells[col.id] = rawRow[i] !== undefined ? String(rawRow[i]) : ''; });
      newRows.push({id: cryptoId(), cells});
    }
    activeCustomTabData.columns = newColumns;
    activeCustomTabData.rows = newRows.length ? newRows : [{id: cryptoId(), cells: {}}];
    customSortState = {colId:null, dir:null};
    customSearchTerm = '';
    renderCustomTable();
    await persistCustomTab();
    const tabName = (customTabs.find(t => t.id === activeCustomTabId) || {}).name || 'Tableau';
    logChange(`a importé un fichier Excel dans « ${tabName} » (${newColumns.length} colonne(s), ${newRows.length} ligne(s))`);
    alert(`Import terminé : ${newColumns.length} colonne(s), ${newRows.length} ligne(s).`);
  } catch(err){
    alert("Impossible de lire ce fichier. Vérifie qu'il s'agit bien d'un fichier Excel/CSV valide.\n\n" + (err && err.message ? err.message : ''));
  }
}
async function handleSaveGenericColumnTemplate(){
  const d = activeCustomTabData;
  const template = d.columns.map(c => ({
    label: c.label, align: c.align, color: c.color, width: c.width, fontSize: c.fontSize,
    cellType: c.cellType || 'text',
    options: (c.cellType === 'status') ? (c.options || []).map(o => ({label: o.label, color: o.color})) : undefined
  }));
  await storageSet(GENERIC_COLUMN_TEMPLATE_KEY, template);
  const tabName = (customTabs.find(t => t.id === activeCustomTabId) || {}).name || 'Tableau';
  logChange(`a enregistré la structure de colonnes de « ${tabName} » comme modèle`);
  alert('Modèle de colonnes enregistré. Il sera proposé à la création du prochain nouvel onglet.');
}

function attachCustomTabListener(tabId){
  if(customTabListenerRef) customTabListenerRef.off();
  customTabListenerRef = fbDb.ref(dbPath(customTabKey(tabId)));
  customTabListenerRef.on('value', snap => {
    if(!snap.exists()) return;
    let fresh;
    try{ fresh = JSON.parse(snap.val()); } catch(e){ return; }
    if(!fresh || (!fresh.columns && !fresh.people && !fresh.rows && !fresh.slots && !fresh.days)) return;
    normalizeMealDataOnLoad(fresh);
    const active = document.activeElement;
    if(active && active.tagName === 'INPUT' && active.type === 'text') return; // don't disrupt typing
    if(JSON.stringify(fresh) === JSON.stringify(activeCustomTabData)) return;
    activeCustomTabData = fresh;
    renderCustomTable();
    updateCustomToolbarForType();
  });
}

async function persistCustomTab(){
  setStatus2('customStatus', 'Enregistrement…', 'saving');
  const ok = await storageSet(customTabKey(activeCustomTabId), activeCustomTabData);
  setStatus2('customStatus', ok ? 'Enregistré' : "Échec de l'enregistrement — réessaie", ok ? '' : 'error');
  if(ok) setTimeout(() => { const s=document.getElementById('customStatus'); if(s.textContent==='Enregistré') s.textContent=''; }, 1200);
}
function setStatus2(elId, text, cls){ const el = document.getElementById(elId); el.textContent = text; el.className = 'status' + (cls ? ' '+cls : ''); }

/* --- Tri d'affichage, recherche, et rendu de cellule selon le type de colonne (tableau libre) --- */
function sortRowsForDisplay(d, sortState){
  if(!sortState || !sortState.colId) return d.rows;
  const col = d.columns.find(c => c.id === sortState.colId);
  if(!col) return d.rows;
  const dir = sortState.dir === 'desc' ? -1 : 1;
  const rows = [...d.rows];
  const type = col.cellType || 'text';
  rows.sort((a, b) => {
    let va = a.cells[col.id], vb = b.cells[col.id];
    if(type === 'number'){
      va = (va === undefined || va === '') ? null : parseFloat(va);
      vb = (vb === undefined || vb === '') ? null : parseFloat(vb);
      if(va === null && vb === null) return 0;
      if(va === null) return 1;
      if(vb === null) return -1;
      return (va - vb) * dir;
    }
    if(type === 'checkbox'){
      return (((va === true) ? 1 : 0) - ((vb === true) ? 1 : 0)) * dir;
    }
    if(type === 'status'){
      const opts = col.options || [];
      const ia = opts.findIndex(o => o.id === va), ib = opts.findIndex(o => o.id === vb);
      return ((ia < 0 ? 9999 : ia) - (ib < 0 ? 9999 : ib)) * dir;
    }
    return String(va || '').localeCompare(String(vb || ''), 'fr', {numeric: true}) * dir;
  });
  return rows;
}
function rowMatchesSearch(d, row, term){
  const t = term.toLowerCase();
  return d.columns.some(col => {
    const v = row.cells[col.id];
    if(v === undefined || v === null || v === '') return false;
    const type = col.cellType || 'text';
    if(type === 'checkbox') return false;
    if(type === 'status'){
      const opt = (col.options || []).find(o => o.id === v);
      return !!opt && opt.label.toLowerCase().includes(t);
    }
    return String(v).toLowerCase().includes(t);
  });
}
function buildCustomCellHtml(col, row){
  const cellType = col.cellType || 'text';
  const align = col.align || 'left';
  const txtColor = colContrastColor(col.color);
  const fontSize = col.fontSize || CUSTOM_COL_DEFAULT_FONTSIZE;
  const scale = Math.max(.75, Math.min(1.8, fontSize / CUSTOM_COL_DEFAULT_FONTSIZE));
  const tdStyle = col.color ? `background:${col.color};` : '';
  const txtStyle = `text-align:${align};font-size:${fontSize}px;${txtColor ? `color:${txtColor};` : ''}`;
  if(cellType === 'checkbox'){
    const checked = row.cells[col.id] === true;
    return `<td class="custom-cell" style="${tdStyle}text-align:center;" data-colcell="${col.id}"><input type="checkbox" data-colid="${col.id}" ${checked?'checked':''} style="cursor:pointer;transform:scale(${scale});accent-color:var(--violet);" /></td>`;
  }
  if(cellType === 'date'){
    const val = row.cells[col.id] || '';
    return `<td class="custom-cell" style="${tdStyle}" data-colcell="${col.id}"><input type="date" value="${escapeHtml(val)}" data-colid="${col.id}" style="${txtStyle}" /></td>`;
  }
  if(cellType === 'number'){
    const val = row.cells[col.id];
    return `<td class="custom-cell" style="${tdStyle}" data-colcell="${col.id}"><input type="number" step="any" value="${(val===undefined||val===null||val==='')?'':val}" data-colid="${col.id}" style="${txtStyle}" /></td>`;
  }
  if(cellType === 'status'){
    const options = col.options || [];
    const selectedId = row.cells[col.id] || '';
    const selOpt = options.find(o => o.id === selectedId);
    const bg = selOpt ? selOpt.color : '#ffffff';
    const fg = selOpt ? (colContrastColor(selOpt.color) || '#242220') : 'var(--ink-soft)';
    let selHtml = `<select data-colid="${col.id}" class="custom-status-select" style="background:${bg};color:${fg};font-size:${fontSize}px;">`;
    selHtml += `<option value="">—</option>`;
    options.forEach(o => { selHtml += `<option value="${o.id}" ${o.id===selectedId?'selected':''}>${escapeHtml(o.label)}</option>`; });
    selHtml += '</select>';
    return `<td class="custom-cell" style="${tdStyle}text-align:center;" data-colcell="${col.id}">${selHtml}</td>`;
  }
  const val = row.cells[col.id] || '';
  return `<td class="custom-cell" style="${tdStyle}" data-colcell="${col.id}"><input type="text" value="${escapeHtml(val)}" data-colid="${col.id}" style="${txtStyle}" /></td>`;
}

function renderCustomTable(){
  if(activeCustomTabData && activeCustomTabData.type === 'mealplanning'){
    renderMealPlanningGrid();
    return;
  }
  if(activeCustomTabData && activeCustomTabData.type === 'checklist'){
    renderChecklistTable();
    return;
  }
  if(activeCustomTabData && activeCustomTabData.type === 'phoneplanning'){
    renderPhonePlanningGrid();
    return;
  }
  if(activeCustomTabData && activeCustomTabData.type === 'suivi'){
    renderSuiviTable();
    return;
  }
  const shell = document.getElementById('customTableShell');
  const d = activeCustomTabData;
  if(!d.columns.length){
    shell.innerHTML = '<div class="empty-note">Aucune colonne. Ajoute-en une pour commencer.</div>';
    return;
  }
  injectCustomTabExtraStyles();

  const activeEl = document.activeElement;
  const hadSearchFocus = activeEl && activeEl.id === 'customSearchInput';
  const searchCaret = hadSearchFocus ? activeEl.selectionStart : null;

  const hasNumberCol = d.columns.some(c => c.cellType === 'number');
  let displayRows = sortRowsForDisplay(d, customSortState);
  if(customSearchTerm) displayRows = displayRows.filter(r => rowMatchesSearch(d, r, customSearchTerm));

  let html = `<div class="custom-search-bar">
    <input type="text" id="customSearchInput" placeholder="🔎 Rechercher dans ce tableau…" value="${escapeHtml(customSearchTerm)}" />
    ${customSearchTerm ? `<span class="custom-search-count">${displayRows.length} / ${d.rows.length} ligne(s)</span>` : ''}
  </div>`;

  html += '<table class="custom-table"><colgroup>';
  d.columns.forEach(col => { html += `<col style="width:${col.width || CUSTOM_COL_DEFAULT_WIDTH}px">`; });
  html += '<col style="width:76px"></colgroup><thead><tr>';
  d.columns.forEach((col, idx) => {
    const align = col.align || 'left';
    const txtColor = colContrastColor(col.color);
    const fontSize = col.fontSize || CUSTOM_COL_DEFAULT_FONTSIZE;
    const frozen = idx === 0 ? 'position:sticky;left:0;z-index:3;' : '';
    const thStyle = `${col.color ? `background:${col.color};` : (idx===0 ? 'background:var(--panel);' : '')}${frozen}`;
    const txtStyle = `text-align:${align};font-size:${fontSize}px;${txtColor ? `color:${txtColor};` : ''}`;
    const sortDir = customSortState.colId === col.id ? customSortState.dir : null;
    const sortIcon = sortDir === 'asc' ? '▲' : sortDir === 'desc' ? '▼' : '⇅';
    html += `<th style="${thStyle}" data-colhead="${col.id}" draggable="true"><div class="custom-col-head">
      <input type="text" value="${escapeHtml(col.label)}" data-colid="${col.id}" class="custom-col-input" style="${txtStyle}" />
      <button class="custom-col-sort ${sortDir?'active':''}" data-colsort="${col.id}" title="Trier par cette colonne">${sortIcon}</button>
      <button class="custom-col-gear" data-colgear="${col.id}" title="Réglages de la colonne (couleur, alignement, taille, type, suppression)">⚙</button>
      <span class="custom-col-resize" data-colresize="${col.id}" title="Glisser pour redimensionner"></span>
    </div></th>`;
  });
  html += '<th style="width:76px;"></th></tr></thead><tbody>';

  if(!displayRows.length){
    html += `<tr><td colspan="${d.columns.length+1}" style="padding:18px;text-align:center;color:var(--ink-soft);">${customSearchTerm ? 'Aucune ligne ne correspond à la recherche' : 'Aucune ligne'}</td></tr>`;
  }
  displayRows.forEach(row => {
    html += `<tr data-rowid="${row.id}">`;
    d.columns.forEach((col, idx) => {
      let cellHtml = buildCustomCellHtml(col, row);
      if(idx === 0){
        cellHtml = cellHtml.replace('style="', `style="position:sticky;left:0;z-index:1;background:${col.color || 'var(--panel)'};`);
      }
      html += cellHtml;
    });
    html += `<td class="custom-row-actions">
      <button class="remove-x" data-rowdup="${row.id}" title="Dupliquer cette ligne" style="opacity:.5;">⧉</button>
      <button class="remove-x" data-rowdel="${row.id}" title="Supprimer la ligne">✕</button>
    </td></tr>`;
  });
  html += '</tbody>';

  if(hasNumberCol){
    html += '<tfoot><tr class="custom-total-row">';
    d.columns.forEach((col, idx) => {
      if(idx === 0){
        html += `<td style="font-weight:700;padding:8px;position:sticky;left:0;background:var(--panel);">Total</td>`;
      } else if(col.cellType === 'number'){
        const sum = displayRows.reduce((acc, r) => acc + (parseFloat(r.cells[col.id]) || 0), 0);
        html += `<td style="font-weight:700;text-align:${col.align||'left'};padding:8px;">${Math.round(sum*100)/100}</td>`;
      } else {
        html += '<td></td>';
      }
    });
    html += '<td></td></tr></tfoot>';
  }
  html += '</table>';
  shell.innerHTML = html;

  const searchInput = document.getElementById('customSearchInput');
  if(searchInput){
    searchInput.addEventListener('input', (e) => {
      customSearchTerm = e.target.value;
      renderCustomTable();
    });
    if(hadSearchFocus){
      searchInput.focus();
      try{ searchInput.setSelectionRange(searchCaret, searchCaret); } catch(e){}
    }
  }

  shell.querySelectorAll('.custom-col-input').forEach(inp => {
    inp.addEventListener('change', async () => {
      const col = d.columns.find(c => c.id === inp.dataset.colid);
      if(!col) return;
      col.label = inp.value;
      await persistCustomTab();
    });
  });
  shell.querySelectorAll('[data-colsort]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const colId = btn.dataset.colsort;
      if(customSortState.colId !== colId){ customSortState = {colId, dir:'asc'}; }
      else if(customSortState.dir === 'asc'){ customSortState.dir = 'desc'; }
      else { customSortState = {colId:null, dir:null}; }
      renderCustomTable();
    });
  });
  shell.querySelectorAll('[data-colgear]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const p = document.getElementById('colSettingsPopover');
      if(p && p.classList.contains('open') && p.dataset.colid === btn.dataset.colgear){
        closeColSettingsPopover();
        return;
      }
      openColSettingsPopover(btn.dataset.colgear, btn);
    });
  });
  wireCustomColumnResize(shell, d);
  wireCustomColumnReorder(shell, d);
  shell.querySelectorAll('tr[data-rowid]').forEach(tr => {
    const rowId = tr.dataset.rowid;
    tr.querySelectorAll('td.custom-cell input, td.custom-cell select').forEach(inp => {
      inp.addEventListener('change', async () => {
        const row = d.rows.find(r => r.id === rowId);
        if(!row) return;
        row.cells[inp.dataset.colid] = inp.type === 'checkbox' ? inp.checked : inp.value;
        if(inp.tagName === 'SELECT'){
          renderCustomTable();
        }
        await persistCustomTab();
      });
    });
  });
  shell.querySelectorAll('[data-rowdup]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const rowId = btn.dataset.rowdup;
      const idx = d.rows.findIndex(r => r.id === rowId);
      if(idx < 0) return;
      const copy = {id: cryptoId(), cells: Object.assign({}, d.rows[idx].cells)};
      d.rows.splice(idx+1, 0, copy);
      renderCustomTable();
      await persistCustomTab();
    });
  });
  shell.querySelectorAll('[data-rowdel]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const rowId = btn.dataset.rowdel;
      const removedRow = d.rows.find(r => r.id === rowId);
      d.rows = d.rows.filter(r => r.id !== rowId);
      renderCustomTable();
      await persistCustomTab();
      if(removedRow){
        showUndoToast('Ligne supprimée', async () => {
          d.rows.push(removedRow);
          renderCustomTable();
          await persistCustomTab();
        });
      }
    });
  });
  wireCustomTableNav(shell);
  if(genericStatsOpen) renderGenericStatsPanel();
}
function wireCustomColumnReorder(shell, d){
  let dragColId = null;
  shell.querySelectorAll('th[data-colhead]').forEach(th => {
    th.addEventListener('dragstart', (e) => {
      if(e.target.closest('.custom-col-resize') || e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON'){
        e.preventDefault();
        return;
      }
      dragColId = th.dataset.colhead;
      e.dataTransfer.effectAllowed = 'move';
    });
    th.addEventListener('dragover', (e) => {
      e.preventDefault();
      th.classList.add('custom-col-dragover');
    });
    th.addEventListener('dragleave', () => th.classList.remove('custom-col-dragover'));
    th.addEventListener('drop', async (e) => {
      e.preventDefault();
      th.classList.remove('custom-col-dragover');
      const targetColId = th.dataset.colhead;
      if(!dragColId || dragColId === targetColId) return;
      const fromIdx = d.columns.findIndex(c => c.id === dragColId);
      const toIdx = d.columns.findIndex(c => c.id === targetColId);
      if(fromIdx < 0 || toIdx < 0) return;
      const [moved] = d.columns.splice(fromIdx, 1);
      d.columns.splice(toIdx, 0, moved);
      dragColId = null;
      renderCustomTable();
      await persistCustomTab();
    });
  });
}
function wireCustomTableNav(shell){
  const inputs = Array.from(shell.querySelectorAll('td.custom-cell input'));
  inputs.forEach((inp, idx) => {
    inp.addEventListener('keydown', (e) => {
      if(e.key === 'ArrowDown' || e.key === 'Enter'){
        e.preventDefault();
        const next = inputs[idx+1];
        if(next){ next.focus(); next.select(); }
      } else if(e.key === 'ArrowUp'){
        e.preventDefault();
        const prev = inputs[idx-1];
        if(prev){ prev.focus(); prev.select(); }
      }
    });
    inp.addEventListener('focus', () => inp.select());
  });
}

/* ---------- Planning Repas (grille personnes x dates) ---------- */
function fmtMealDate(iso){
  const d = new Date(iso+'T00:00:00');
  const wd = ['dim.','lun.','mar.','mer.','jeu.','ven.','sam.'][d.getDay()];
  return { wd, ddmm: String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0') };
}
function mealWeekLabel(iso){
  const d = new Date(iso+'T00:00:00');
  const day = d.getDay() === 0 ? 7 : d.getDay();
  const monday = new Date(d); monday.setDate(d.getDate() - (day-1));
  return monday.getFullYear()+'-'+String(monday.getMonth()+1).padStart(2,'0')+'-'+String(monday.getDate()).padStart(2,'0');
}
function mealCellClass(val){
  const v = (val||'').toLowerCase().replace(/[^0-9]/g,'');
  if(v.startsWith('12')) return 'meal-12';
  if(v.startsWith('13')) return 'meal-13';
  return '';
}
function mealMonthLabel(iso){
  const d = new Date(iso+'T00:00:00');
  return d.toLocaleDateString('fr-FR', {month:'long', year:'numeric'});
}
function renderMealPlanningGrid(){
  const shell = document.getElementById('customTableShell');
  const d = activeCustomTabData;
  if(!d.people.length){
    shell.innerHTML = '<div class="empty-note">Aucune personne. Ajoute-en une pour commencer.</div>';
    return;
  }
  const sortedDays = [...d.days].sort((a,b) => a.date.localeCompare(b.date));

  let html = '<table class="meal-table"><thead><tr><th style="text-align:center;">Date</th>';
  d.people.forEach(p => {
    const c = mealPersonColor(d, p.id);
    html += `<th class="meal-person-head"><span class="meal-person-name" style="background:${c};color:#fff;">${escapeHtml(p.name)}<button class="meal-person-del" data-persondel="${p.id}" title="Supprimer cette personne">✕</button></span></th>`;
  });
  html += '</tr></thead><tbody>';

  function monthSummaryRow(monthKey, counts){
    let row = `<tr class="meal-month-summary" data-monthkey="${monthKey}"><td class="meal-date-cell">Total 12h — ${mealMonthLabel(monthKey+'-01')}</td>`;
    d.people.forEach(p => { row += `<td data-personcount="${p.id}">${counts[p.id] || 0}</td>`; });
    row += '</tr>';
    return row;
  }

  if(!sortedDays.length){
    html += `<tr><td colspan="${d.people.length+1}" class="empty-note">Aucune date. Clique sur "+ Ajouter une date".</td></tr>`;
  } else {
    let lastWeek = null;
    let currentMonth = null;
    let monthCounts = {};
    sortedDays.forEach((day, idx) => {
      const monthKey = day.date.slice(0,7);
      if(currentMonth !== null && monthKey !== currentMonth){
        html += monthSummaryRow(currentMonth, monthCounts);
        monthCounts = {};
      }
      currentMonth = monthKey;

      const wk = mealWeekLabel(day.date);
      if(wk !== lastWeek){
        html += `<tr class="meal-week-sep"><td colspan="${d.people.length+1}">Semaine du ${fmtMealDate(wk).ddmm}</td></tr>`;
        lastWeek = wk;
      }
      const {wd, ddmm} = fmtMealDate(day.date);
      const isToday = day.date === todayIso();
      html += `<tr class="${isToday ? 'meal-today-row' : ''}"><td class="meal-date-cell"><div class="row-inner"><span>${ddmm} <span style="color:var(--ink-soft);font-weight:400;">${wd}</span>${isToday ? '<span class="meal-today-badge">AUJOURD\u2019HUI</span>' : ''}</span><button class="remove-x" data-daydel="${day.id}" title="Supprimer cette date">✕</button></div></td>`;
      d.people.forEach(p => {
        const key = day.id+'|'+p.id;
        const val = (d.shifts && d.shifts[key]) || '';
        const cls = mealCellClass(val);
        if(cls === 'meal-12') monthCounts[p.id] = (monthCounts[p.id]||0) + 1;
        html += `<td class="meal-cell ${val?'filled':'empty'} ${cls}"><input type="text" value="${escapeHtml(val)}" data-day="${day.id}" data-person="${p.id}" placeholder="—" /></td>`;
      });
      html += '</tr>';

      if(idx === sortedDays.length-1){
        html += monthSummaryRow(currentMonth, monthCounts);
      }
    });
  }
  html += '</tbody></table>';
  shell.innerHTML = html;

  shell.querySelectorAll('td.meal-cell input').forEach(inp => {
    inp.addEventListener('change', async () => {
      d.shifts = d.shifts || {};
      const key = inp.dataset.day + '|' + inp.dataset.person;
      if(inp.value.trim() === ''){ delete d.shifts[key]; }
      else { d.shifts[key] = inp.value.trim(); }
      const cls = mealCellClass(inp.value.trim());
      inp.closest('td').className = 'meal-cell ' + (inp.value.trim() ? 'filled' : 'empty') + (cls ? ' '+cls : '');
      updateMealMonthSummaryInPlace(shell, inp.dataset.day);
      await persistCustomTab();
    });
  });
  shell.querySelectorAll('[data-persondel]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const personId = btn.dataset.persondel;
      const removedPerson = d.people.find(p => p.id === personId);
      if(!removedPerson) return;
      d.people = d.people.filter(p => p.id !== personId);
      Object.keys(d.shifts || {}).forEach(k => { if(k.endsWith('|'+personId)) delete d.shifts[k]; });
      renderMealPlanningGrid();
      await persistCustomTab();
      showUndoToast(`${removedPerson.name} retiré(e) du planning`, async () => {
        if(!d.people.some(p => p.id === personId)) d.people.push(removedPerson);
        renderMealPlanningGrid();
        await persistCustomTab();
      });
    });
  });
  shell.querySelectorAll('[data-daydel]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const dayId = btn.dataset.daydel;
      const removedDay = d.days.find(x => x.id === dayId);
      if(!removedDay) return;
      d.days = d.days.filter(x => x.id !== dayId);
      renderMealPlanningGrid();
      await persistCustomTab();
      showUndoToast(`Date du ${fmtMealDate(removedDay.date).ddmm} supprimée`, async () => {
        if(!d.days.some(x => x.id === dayId)) d.days.push(removedDay);
        renderMealPlanningGrid();
        await persistCustomTab();
      });
    });
  });
  wireMealNav(shell);
}
function updateMealMonthSummaryInPlace(shell, dayId){
  const d = activeCustomTabData;
  const day = d.days.find(x => x.id === dayId);
  if(!day) return;
  const monthKey = day.date.slice(0,7);
  const row = shell.querySelector(`.meal-month-summary[data-monthkey="${monthKey}"]`);
  if(!row) return;
  const monthDayIds = new Set(d.days.filter(x => x.date.slice(0,7) === monthKey).map(x => x.id));
  const counts = {};
  Object.keys(d.shifts || {}).forEach(key => {
    const [dId, pId] = key.split('|');
    if(!monthDayIds.has(dId)) return;
    if(mealCellClass(d.shifts[key]) === 'meal-12') counts[pId] = (counts[pId]||0) + 1;
  });
  d.people.forEach(p => {
    const cell = row.querySelector(`[data-personcount="${p.id}"]`);
    if(cell) cell.textContent = counts[p.id] || 0;
  });
}
function wireMealNav(shell){
  const inputs = Array.from(shell.querySelectorAll('td.meal-cell input'));
  inputs.forEach((inp, idx) => {
    inp.addEventListener('keydown', (e) => {
      if(e.key === 'ArrowDown' || e.key === 'Enter'){
        e.preventDefault();
        const next = inputs[idx+1];
        if(next){ next.focus(); next.select(); }
      } else if(e.key === 'ArrowUp'){
        e.preventDefault();
        const prev = inputs[idx-1];
        if(prev){ prev.focus(); prev.select(); }
      }
    });
    inp.addEventListener('focus', () => inp.select());
  });
}

document.getElementById('btnAddMealDate').addEventListener('click', async () => {
  const input = prompt('Date à ajouter (JJ/MM/AAAA) :');
  if(!input) return;
  const m = input.trim().match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if(!m){ alert('Format invalide. Utilise JJ/MM/AAAA.'); return; }
  const iso = m[3]+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0');
  const d = activeCustomTabData;
  if(d.days.some(x => x.date === iso)){ alert('Cette date existe déjà.'); return; }
  d.days.push({id: cryptoId(), date: iso});
  renderMealPlanningGrid();
  await persistCustomTab();
});
document.getElementById('btnAddMealMonth').addEventListener('click', async () => {
  const now = new Date();
  const suggestion = String(now.getMonth()+1).padStart(2,'0') + '/' + now.getFullYear();
  const input = prompt('Mois à remplir (MM/AAAA) :', suggestion);
  if(!input) return;
  const m = input.trim().match(/^(\d{1,2})[\/\-](\d{4})$/);
  if(!m){ alert('Format invalide. Utilise MM/AAAA (ex: 10/2026).'); return; }
  const month = parseInt(m[1], 10) - 1;
  const year = parseInt(m[2], 10);
  if(month < 0 || month > 11){ alert('Mois invalide (01 à 12).'); return; }

  const d = activeCustomTabData;
  const existing = new Set(d.days.map(x => x.date));
  const added = [];
  const cursor = new Date(year, month, 1);
  while(cursor.getMonth() === month){
    const day = cursor.getDay(); // 0 = dimanche, 6 = samedi
    if(day >= 1 && day <= 5){
      const iso = cursor.getFullYear()+'-'+String(cursor.getMonth()+1).padStart(2,'0')+'-'+String(cursor.getDate()).padStart(2,'0');
      if(!existing.has(iso)){
        d.days.push({id: cryptoId(), date: iso});
        added.push(iso);
      }
    }
    cursor.setDate(cursor.getDate()+1);
  }
  if(!added.length){ alert('Toutes les dates ouvrées de ce mois existent déjà.'); return; }

  // If a template was saved, auto-fill the new days by cycling through it
  // (matched to each new day's position among the newly-added dates).
  if(Array.isArray(d.template) && d.template.length){
    d.shifts = d.shifts || {};
    const nameToId = {}; d.people.forEach(p => { nameToId[p.name] = p.id; });
    added.sort();
    added.forEach((iso, i) => {
      const dayObj = d.days.find(x => x.date === iso);
      if(!dayObj) return;
      const templateRow = d.template[i % d.template.length];
      Object.keys(templateRow).forEach(personName => {
        const pid = nameToId[personName];
        if(!pid) return; // person no longer exists / renamed
        d.shifts[dayObj.id+'|'+pid] = templateRow[personName];
      });
    });
  }

  renderMealPlanningGrid();
  await persistCustomTab();
  logChange(`a ajouté ${added.length} jours ouvrés (${m[1]}/${m[2]}) au Planning Repas`);
});
document.getElementById('btnSaveMealTemplate').addEventListener('click', async () => {
  const d = activeCustomTabData;
  const sortedDays = [...d.days].sort((a,b) => a.date.localeCompare(b.date));
  const filledDays = sortedDays.filter(day => d.people.some(p => (d.shifts||{})[day.id+'|'+p.id]));
  if(!filledDays.length){
    alert('Aucune case remplie à enregistrer comme modèle. Remplis d\u2019abord un planning, puis reviens ici.');
    return;
  }
  if(!confirm(`Enregistrer le planning actuel (${filledDays.length} jour(s) remplis) comme modèle ? Il sera réappliqué automatiquement à chaque nouveau mois ajouté.`)) return;
  const template = filledDays.map(day => {
    const row = {};
    d.people.forEach(p => {
      const val = (d.shifts||{})[day.id+'|'+p.id];
      if(val) row[p.name] = val;
    });
    return row;
  });
  d.template = template;
  await persistCustomTab();
  alert(`Modèle enregistré (${template.length} jour(s)). Il s\u2019appliquera automatiquement au prochain mois ajouté.`);
});
document.getElementById('btnAddMealPerson').addEventListener('click', async () => {
  const name = prompt('Nom de la personne à ajouter :');
  if(!name || !name.trim()) return;
  activeCustomTabData.people.push({id: cryptoId(), name: name.trim()});
  renderMealPlanningGrid();
  await persistCustomTab();
});
document.getElementById('btnConvertMealPlanning').addEventListener('click', async () => {
  if(!isAdmin){
    alert("Réservé au superviseur. Clique d'abord sur \"🔒 Mode superviseur\" et entre le mot de passe.");
    return;
  }
  if(!confirm('Transformer cet onglet en "Planning Repas" ? Le contenu actuel de ce tableau sera remplacé.')) return;
  activeCustomTabData = defaultMealPlanningData();
  renderCustomTable();
  updateCustomToolbarForType();
  await persistCustomTab();
});

document.getElementById('btnAddColumn').addEventListener('click', async () => {
  activeCustomTabData.columns.push({id: cryptoId(), label: 'Nouvelle colonne', align:'left', color:null, width: CUSTOM_COL_DEFAULT_WIDTH, fontSize:null, cellType:'text'});
  renderCustomTable();
  await persistCustomTab();
});
document.getElementById('btnAddRow').addEventListener('click', async () => {
  activeCustomTabData.rows.push({id: cryptoId(), cells: {}});
  renderCustomTable();
  await persistCustomTab();
});
document.getElementById('btnRenameTab').addEventListener('click', async () => {
  const tabMeta = customTabs.find(t => t.id === activeCustomTabId);
  if(!tabMeta) return;
  const name = prompt('Nouveau nom de l\u2019onglet :', tabMeta.name);
  if(!name || !name.trim()) return;
  tabMeta.name = name.trim();
  document.getElementById('customTabTitle').textContent = tabMeta.name;
  renderAppTabs();
  await storageSet(CUSTOMTABS_INDEX_KEY, customTabs);
});
async function addAppTab(){
  const name = prompt('Nom du nouvel onglet :', 'Nouvel onglet');
  if(!name || !name.trim()) return;
  const newTab = {id: cryptoId(), name: name.trim()};
  customTabs.push(newTab);
  await storageSet(CUSTOMTABS_INDEX_KEY, customTabs);
  let initialData = defaultCustomTabData();
  try{
    const template = await storageGet(GENERIC_COLUMN_TEMPLATE_KEY);
    if(Array.isArray(template) && template.length && confirm(`Un modèle de colonnes est enregistré (${template.length} colonne(s)). L'utiliser pour ce nouvel onglet ?`)){
      initialData = {
        type: 'generic',
        columns: template.map(t => ({
          id: cryptoId(), label: t.label, align: t.align || 'left', color: t.color || null,
          width: t.width || CUSTOM_COL_DEFAULT_WIDTH, fontSize: t.fontSize || null, cellType: t.cellType || 'text',
          options: (t.cellType === 'status') ? (t.options || []).map(o => ({id: cryptoId(), label: o.label, color: o.color})) : undefined
        })),
        rows: [{id: cryptoId(), cells: {}}]
      };
    }
  } catch(e){ /* pas de modèle disponible, tant pis */ }
  await storageSet(customTabKey(newTab.id), initialData);
  renderAppTabs();
  switchAppTab(newTab.id);
}
async function deleteAppTab(tabId){
  if(!isAdmin){
    alert("Réservé au superviseur. Clique d'abord sur \"🔒 Mode superviseur\" et entre le mot de passe.");
    return;
  }
  const tabMeta = customTabs.find(t => t.id === tabId);
  if(!tabMeta) return;
  if(!confirm(`Supprimer définitivement l'onglet "${tabMeta.name}" et tout son contenu ?`)) return;
  customTabs = customTabs.filter(t => t.id !== tabId);
  await storageSet(CUSTOMTABS_INDEX_KEY, customTabs);
  await storageDelete(customTabKey(tabId));
  if(activeAppTab === tabId){
    if(customTabListenerRef){ customTabListenerRef.off(); customTabListenerRef = null; }
    switchAppTab('planning');
  } else {
    renderAppTabs();
  }
}

document.getElementById('btnDeleteTab').addEventListener('click', () => deleteAppTab(activeCustomTabId));

/* ---------- Avenants WF (checklist importé depuis Excel) ---------- */
function renderChecklistTable(){
  const shell = document.getElementById('customTableShell');
  const d = activeCustomTabData;
  if(!d.rows.length){
    shell.innerHTML = '<div class="empty-note">Aucune ligne. Importe un fichier Excel ou ajoute une ligne à la main.</div>';
    return;
  }
  let html = '<table class="checklist-table"><thead><tr><th>Information</th><th style="text-align:center;">Fait</th><th></th></tr></thead><tbody>';
  d.rows.forEach(row => {
    html += `<tr data-rowid="${row.id}" class="${row.done ? 'checklist-done' : ''}">
      <td class="checklist-text"><input type="text" value="${escapeHtml(row.text||'')}" data-field="text" /></td>
      <td class="checklist-check"><input type="checkbox" data-field="done" ${row.done?'checked':''} /></td>
      <td class="checklist-row-actions"><button class="remove-x" data-rowdel="${row.id}" title="Supprimer la ligne">✕</button></td>
    </tr>`;
  });
  html += '</tbody></table>';
  shell.innerHTML = html;

  shell.querySelectorAll('tr[data-rowid]').forEach(tr => {
    const rowId = tr.dataset.rowid;
    const row = d.rows.find(r => r.id === rowId);
    tr.querySelector('[data-field="text"]').addEventListener('change', async (e) => {
      row.text = e.target.value;
      await persistCustomTab();
    });
    tr.querySelector('[data-field="done"]').addEventListener('change', async (e) => {
      row.done = e.target.checked;
      tr.className = row.done ? 'checklist-done' : '';
      await persistCustomTab();
    });
  });
  shell.querySelectorAll('[data-rowdel]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const rowId = btn.dataset.rowdel;
      const removedRow = d.rows.find(r => r.id === rowId);
      d.rows = d.rows.filter(r => r.id !== rowId);
      renderChecklistTable();
      await persistCustomTab();
      if(removedRow){
        showUndoToast('Ligne supprimée', async () => {
          d.rows.push(removedRow);
          renderChecklistTable();
          await persistCustomTab();
        });
      }
    });
  });
  wireCustomTableNav(shell); // reuses the same generic up/down arrow-key navigation, works on any text input
}

document.getElementById('btnAddChecklistRow').addEventListener('click', async () => {
  activeCustomTabData.rows.push({id: cryptoId(), text: '', done: false});
  renderChecklistTable();
  await persistCustomTab();
});

document.getElementById('btnImportExcel').addEventListener('click', () => document.getElementById('excelFileInput').click());
document.getElementById('excelFileInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if(!file) return;
  if(typeof XLSX === 'undefined'){
    alert("La librairie de lecture Excel n'a pas pu se charger. Vérifie ta connexion et réessaie.");
    return;
  }
  try{
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, {type:'array'});
    const firstSheet = wb.Sheets[wb.SheetNames[0]];
    const rows2d = XLSX.utils.sheet_to_json(firstSheet, {header:1});
    let values = rows2d.map(r => (r && r[0] !== undefined && r[0] !== null) ? String(r[0]).trim() : '').filter(v => v !== '');
    if(!values.length){ alert('Aucune donnée trouvée dans la première colonne de ce fichier.'); return; }
    if(values.length && confirm(`Première ligne détectée : "${values[0]}"\n\nEst-ce un titre de colonne à ignorer (plutôt qu'une vraie donnée) ?`)){
      values = values.slice(1);
    }
    if(!values.length){ alert('Plus aucune ligne à importer après avoir retiré le titre.'); return; }
    const d = activeCustomTabData;
    const existingTexts = new Set(d.rows.map(r => r.text));
    let added = 0;
    values.forEach(v => {
      if(existingTexts.has(v)) return; // avoid duplicating identical lines on re-import
      d.rows.push({id: cryptoId(), text: v, done: false});
      added++;
    });
    renderChecklistTable();
    await persistCustomTab();
    logChange(`a importé ${added} ligne(s) depuis un fichier Excel dans « ${(customTabs.find(t=>t.id===activeCustomTabId)||{}).name || 'Avenants WF'} »`);
    alert(`${added} ligne(s) importée(s)${added < values.length ? ` (${values.length - added} déjà présente(s), ignorée(s))` : ''}.`);
  } catch(err){
    alert("Impossible de lire ce fichier. Vérifie qu'il s'agit bien d'un fichier Excel (.xlsx) ou CSV valide.");
  }
});

document.getElementById('btnConvertChecklist').addEventListener('click', async () => {
  if(!isAdmin){
    alert("Réservé au superviseur. Clique d'abord sur \"🔒 Mode superviseur\" et entre le mot de passe.");
    return;
  }
  if(!confirm('Transformer cet onglet en liste "Avenants WF" (Information + case Fait) ? Le contenu actuel de ce tableau sera remplacé.')) return;
  activeCustomTabData = defaultChecklistData();
  renderCustomTable();
  updateCustomToolbarForType();
  await persistCustomTab();
});

/* ---------- Planning Tel (créneaux horaires en colonnes) ---------- */
function fmtPhoneDate(iso){
  const d = new Date(iso+'T00:00:00');
  const wd = ['dim.','lun.','mar.','mer.','jeu.','ven.','sam.'][d.getDay()];
  return { wd, ddmm: String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0') };
}
function phoneWeekLabel(iso){
  const d = new Date(iso+'T00:00:00');
  const day = d.getDay() === 0 ? 7 : d.getDay();
  const monday = new Date(d); monday.setDate(d.getDate() - (day-1));
  return monday.getFullYear()+'-'+String(monday.getMonth()+1).padStart(2,'0')+'-'+String(monday.getDate()).padStart(2,'0');
}
function renderPhonePlanningGrid(){
  const shell = document.getElementById('customTableShell');
  const d = activeCustomTabData;
  if(!d.slots.length){
    shell.innerHTML = '<div class="empty-note">Aucun créneau. Clique sur "+ Ajouter un créneau".</div>';
    return;
  }
  const sortedDays = [...d.days].sort((a,b) => a.date.localeCompare(b.date));

  let html = '<table class="phone-table"><thead><tr><th style="text-align:center;">Date</th>';
  d.slots.forEach(slot => {
    html += `<th><div class="phone-slot-head"><input type="text" value="${escapeHtml(slot.label)}" data-slotid="${slot.id}" class="phone-slot-input" />
      ${d.slots.length > 1 ? `<button class="phone-slot-del" data-slotdel="${slot.id}" title="Supprimer ce créneau">✕</button>` : ''}
    </div></th>`;
  });
  html += '</tr></thead><tbody>';

  if(!sortedDays.length){
    html += `<tr><td colspan="${d.slots.length+1}" class="empty-note">Aucune date. Clique sur "+ Ajouter une date".</td></tr>`;
  } else {
    let lastWeek = null;
    const today = todayIso();
    sortedDays.forEach(day => {
      const wk = phoneWeekLabel(day.date);
      if(wk !== lastWeek){
        html += `<tr class="phone-week-sep"><td colspan="${d.slots.length+1}">Semaine du ${fmtPhoneDate(wk).ddmm}</td></tr>`;
        lastWeek = wk;
      }
      const {wd, ddmm} = fmtPhoneDate(day.date);
      const isToday = day.date === today;
      html += `<tr class="${isToday ? 'phone-today-row' : ''}"><td class="phone-date-cell"><div class="row-inner"><span>${ddmm} <span style="color:var(--ink-soft);font-weight:400;">${wd}</span>${isToday ? '<span class="phone-today-badge">AUJOURD\u2019HUI</span>' : ''}</span><button class="remove-x" data-daydel="${day.id}" title="Supprimer cette date">✕</button></div></td>`;
      d.slots.forEach(slot => {
        const key = day.id+'|'+slot.id;
        const val = (d.shifts && d.shifts[key]) || '';
        const c = val ? phonePersonColorByName(d, val) : null;
        const style = c ? `background:${c};color:#fff;` : '';
        html += `<td class="phone-cell" style="${style}"><input type="text" value="${escapeHtml(val)}" data-day="${day.id}" data-slot="${slot.id}" placeholder="—" list="phonePeopleList" /></td>`;
      });
      html += '</tr>';
    });
  }
  html += '</tbody></table>';
  html += `<datalist id="phonePeopleList">${d.people.map(p => `<option value="${escapeHtml(p.name)}">`).join('')}</datalist>`;
  shell.innerHTML = html;

  shell.querySelectorAll('td.phone-cell input').forEach(inp => {
    inp.addEventListener('change', async () => {
      d.shifts = d.shifts || {};
      const key = inp.dataset.day + '|' + inp.dataset.slot;
      const val = inp.value.trim();
      if(val === ''){ delete d.shifts[key]; } else { d.shifts[key] = val; }
      const c = val ? phonePersonColorByName(d, val) : null;
      inp.closest('td').style.cssText = c ? `background:${c};color:#fff;` : '';
      await persistCustomTab();
    });
  });
  shell.querySelectorAll('.phone-slot-input').forEach(inp => {
    inp.addEventListener('change', async () => {
      const slot = d.slots.find(s => s.id === inp.dataset.slotid);
      if(!slot) return;
      slot.label = inp.value;
      await persistCustomTab();
    });
  });
  shell.querySelectorAll('[data-slotdel]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const slotId = btn.dataset.slotdel;
      const removedSlot = d.slots.find(s => s.id === slotId);
      d.slots = d.slots.filter(s => s.id !== slotId);
      Object.keys(d.shifts || {}).forEach(k => { if(k.endsWith('|'+slotId)) delete d.shifts[k]; });
      renderPhonePlanningGrid();
      await persistCustomTab();
      if(removedSlot){
        showUndoToast(`Créneau "${removedSlot.label}" supprimé`, async () => {
          if(!d.slots.some(s => s.id === slotId)) d.slots.push(removedSlot);
          renderPhonePlanningGrid();
          await persistCustomTab();
        });
      }
    });
  });
  shell.querySelectorAll('[data-daydel]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const dayId = btn.dataset.daydel;
      const removedDay = d.days.find(x => x.id === dayId);
      if(!removedDay) return;
      d.days = d.days.filter(x => x.id !== dayId);
      renderPhonePlanningGrid();
      await persistCustomTab();
      showUndoToast(`Date du ${fmtPhoneDate(removedDay.date).ddmm} supprimée`, async () => {
        if(!d.days.some(x => x.id === dayId)) d.days.push(removedDay);
        renderPhonePlanningGrid();
        await persistCustomTab();
      });
    });
  });
  wirePhoneNav(shell);
}
function wirePhoneNav(shell){
  const inputs = Array.from(shell.querySelectorAll('td.phone-cell input'));
  inputs.forEach((inp, idx) => {
    inp.addEventListener('keydown', (e) => {
      if(e.key === 'ArrowDown' || e.key === 'Enter'){
        e.preventDefault();
        const next = inputs[idx+1];
        if(next){ next.focus(); next.select(); }
      } else if(e.key === 'ArrowUp'){
        e.preventDefault();
        const prev = inputs[idx-1];
        if(prev){ prev.focus(); prev.select(); }
      }
    });
    inp.addEventListener('focus', () => inp.select());
  });
}

document.getElementById('btnAddPhoneDate').addEventListener('click', async () => {
  const input = prompt('Date à ajouter (JJ/MM/AAAA) :');
  if(!input) return;
  const m = input.trim().match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if(!m){ alert('Format invalide. Utilise JJ/MM/AAAA.'); return; }
  const iso = m[3]+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0');
  const d = activeCustomTabData;
  if(d.days.some(x => x.date === iso)){ alert('Cette date existe déjà.'); return; }
  d.days.push({id: cryptoId(), date: iso});
  renderPhonePlanningGrid();
  await persistCustomTab();
});
document.getElementById('btnAddPhoneMonth').addEventListener('click', async () => {
  const now = new Date();
  const suggestion = String(now.getMonth()+1).padStart(2,'0') + '/' + now.getFullYear();
  const input = prompt('Mois à remplir (MM/AAAA) :', suggestion);
  if(!input) return;
  const m = input.trim().match(/^(\d{1,2})[\/\-](\d{4})$/);
  if(!m){ alert('Format invalide. Utilise MM/AAAA (ex: 10/2026).'); return; }
  const month = parseInt(m[1], 10) - 1;
  const year = parseInt(m[2], 10);
  if(month < 0 || month > 11){ alert('Mois invalide (01 à 12).'); return; }

  const d = activeCustomTabData;
  const existing = new Set(d.days.map(x => x.date));
  const added = [];
  const cursor = new Date(year, month, 1);
  while(cursor.getMonth() === month){
    const day = cursor.getDay();
    if(day >= 1 && day <= 5){
      const iso = cursor.getFullYear()+'-'+String(cursor.getMonth()+1).padStart(2,'0')+'-'+String(cursor.getDate()).padStart(2,'0');
      if(!existing.has(iso)){ d.days.push({id: cryptoId(), date: iso}); added.push(iso); }
    }
    cursor.setDate(cursor.getDate()+1);
  }
  if(!added.length){ alert('Toutes les dates ouvrées de ce mois existent déjà.'); return; }

  if(Array.isArray(d.template) && d.template.length){
    d.shifts = d.shifts || {};
    const labelToId = {}; d.slots.forEach(s => { labelToId[s.label] = s.id; });
    added.sort();
    added.forEach((iso, i) => {
      const dayObj = d.days.find(x => x.date === iso);
      if(!dayObj) return;
      const templateRow = d.template[i % d.template.length];
      Object.keys(templateRow).forEach(slotLabel => {
        const sid = labelToId[slotLabel];
        if(!sid) return;
        d.shifts[dayObj.id+'|'+sid] = templateRow[slotLabel];
      });
    });
  }

  renderPhonePlanningGrid();
  await persistCustomTab();
  logChange(`a ajouté ${added.length} jours ouvrés (${m[1]}/${m[2]}) au Planning Tel`);
});
document.getElementById('btnAddPhoneSlot').addEventListener('click', async () => {
  const label = prompt('Nom du créneau (ex: 17h-18h) :');
  if(!label || !label.trim()) return;
  activeCustomTabData.slots.push({id: cryptoId(), label: label.trim()});
  renderPhonePlanningGrid();
  await persistCustomTab();
});
document.getElementById('btnAddPhonePerson').addEventListener('click', async () => {
  const name = prompt('Nom de la personne à ajouter (pour la couleur / suggestion) :');
  if(!name || !name.trim()) return;
  activeCustomTabData.people.push({id: cryptoId(), name: name.trim()});
  renderPhonePlanningGrid();
  await persistCustomTab();
});
document.getElementById('btnSavePhoneTemplate').addEventListener('click', async () => {
  const d = activeCustomTabData;
  const sortedDays = [...d.days].sort((a,b) => a.date.localeCompare(b.date));
  const filledDays = sortedDays.filter(day => d.slots.some(s => (d.shifts||{})[day.id+'|'+s.id]));
  if(!filledDays.length){
    alert('Aucune case remplie à enregistrer comme modèle. Remplis d\u2019abord un planning, puis reviens ici.');
    return;
  }
  if(!confirm(`Enregistrer le planning actuel (${filledDays.length} jour(s) remplis) comme modèle ? Il sera réappliqué automatiquement à chaque nouveau mois ajouté.`)) return;
  const template = filledDays.map(day => {
    const row = {};
    d.slots.forEach(s => {
      const val = (d.shifts||{})[day.id+'|'+s.id];
      if(val) row[s.label] = val;
    });
    return row;
  });
  d.template = template;
  await persistCustomTab();
  alert(`Modèle enregistré (${template.length} jour(s)). Il s\u2019appliquera automatiquement au prochain mois ajouté.`);
});
document.getElementById('btnConvertPhonePlanning').addEventListener('click', async () => {
  if(!isAdmin){
    alert("Réservé au superviseur. Clique d'abord sur \"🔒 Mode superviseur\" et entre le mot de passe.");
    return;
  }
  if(!confirm('Transformer cet onglet en "Planning Tel" ? Le contenu actuel de ce tableau sera remplacé.')) return;
  activeCustomTabData = defaultPhonePlanningData();
  renderCustomTable();
  updateCustomToolbarForType();
  await persistCustomTab();
});

/* ---------- Suivi Excel (grille jours x indicateurs, importée depuis EASY_SUIVI) ---------- */
function renderSuiviTable(){
  const shell = document.getElementById('customTableShell');
  const d = activeCustomTabData;
  d.days = d.days || [];
  const sortedDays = [...d.days].sort((a,b) => a.date.localeCompare(b.date));

  let html = '<table class="suivi-table"><thead><tr><th style="text-align:center;">Date</th>';
  SUIVI_COLUMNS.forEach(col => { html += `<th title="${escapeHtml(col.label)}">${escapeHtml(col.label)}</th>`; });
  html += '</tr></thead><tbody>';

  // Ces colonnes doivent afficher une MOYENNE dans la ligne "Total" du mois, pas une somme
  const SUIVI_AVERAGE_COLS = ['delai_prio','delai_non_prio','nbre_etp','productivite'];

  function monthSummaryRow(monthKey, sums, counts){
    let row = `<tr class="suivi-month-summary" data-monthkey="${monthKey}"><td class="suivi-date-cell">Total — ${mealMonthLabel(monthKey+'-01')}</td>`;
    SUIVI_COLUMNS.forEach(col => {
      let display = '';
      if(col.type === 'num' || col.type === 'formula'){
        if(SUIVI_AVERAGE_COLS.includes(col.id)){
          const c = counts[col.id] || 0;
          if(c > 0) display = Math.round((sums[col.id]/c) * 100) / 100;
        } else if(sums[col.id] != null){
          display = sums[col.id];
        }
      }
      row += `<td data-colsum="${col.id}">${display}</td>`;
    });
    row += '</tr>';
    return row;
  }

  if(!sortedDays.length){
    html += `<tr><td colspan="${SUIVI_COLUMNS.length+1}" class="empty-note">Aucune donnée. Importe le fichier Excel ou ajoute une date à la main.</td></tr>`;
  } else {
    let lastWeek = null, currentMonth = null, monthSums = {}, monthCounts = {};
    sortedDays.forEach((day, idx) => {
      const monthKey = day.date.slice(0,7);
      if(currentMonth !== null && monthKey !== currentMonth){
        html += monthSummaryRow(currentMonth, monthSums, monthCounts);
        monthSums = {}; monthCounts = {};
      }
      currentMonth = monthKey;

      const wk = mealWeekLabel(day.date);
      if(wk !== lastWeek){
        html += `<tr class="suivi-week-sep"><td colspan="${SUIVI_COLUMNS.length+1}">Semaine du ${fmtMealDate(wk).ddmm}</td></tr>`;
        lastWeek = wk;
      }
      const {wd, ddmm} = fmtMealDate(day.date);
      const isToday = day.date === todayIso();
      html += `<tr class="${isToday ? 'suivi-today-row' : ''}"><td class="suivi-date-cell"><div class="row-inner"><span>${ddmm} <span style="color:var(--ink-soft);font-weight:400;">${wd}</span>${isToday ? '<span class="meal-today-badge">AUJOURD\u2019HUI</span>' : ''}</span><button class="remove-x" data-daydel="${day.id}" title="Supprimer cette ligne">✕</button></div></td>`;
      SUIVI_COLUMNS.forEach(col => {
        const raw = (day.values && day.values[col.id] != null) ? day.values[col.id] : '';
        if((col.type === 'num' || col.type === 'formula') && typeof raw === 'number'){
          monthSums[col.id] = (monthSums[col.id]||0) + raw;
          monthCounts[col.id] = (monthCounts[col.id]||0) + 1;
        }
        if(col.type === 'formula'){
          html += `<td class="suivi-cell suivi-formula" title="Calculé automatiquement">${raw === '' ? '—' : escapeHtml(String(raw))}</td>`;
        } else {
          html += `<td class="suivi-cell"><input type="text" value="${escapeHtml(String(raw))}" data-day="${day.id}" data-col="${col.id}" data-type="${col.type}" /></td>`;
        }
      });
      html += '</tr>';

      if(idx === sortedDays.length-1){
        html += monthSummaryRow(currentMonth, monthSums, monthCounts);
      }
    });
  }
  html += '</tbody></table>';
  shell.innerHTML = html;

  shell.querySelectorAll('td.suivi-cell input').forEach(inp => {
    inp.addEventListener('change', async () => {
      const day = d.days.find(x => x.id === inp.dataset.day);
      if(!day) return;
      day.values = day.values || {};
      let val = inp.value.trim();
      if(inp.dataset.type === 'num' && val !== ''){
        const n = Number(val.replace(',', '.'));
        if(!isNaN(n)) val = n;
      }
      if(val === ''){ delete day.values[inp.dataset.col]; } else { day.values[inp.dataset.col] = val; }
      if(SUIVI_FORMULA_TRIGGER_COLS.includes(inp.dataset.col)) recomputeSuiviDerivedFields(day);
      renderSuiviTable();
      await persistCustomTab();
    });
  });
  shell.querySelectorAll('[data-daydel]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const dayId = btn.dataset.daydel;
      const removedDay = d.days.find(x => x.id === dayId);
      if(!removedDay) return;
      d.days = d.days.filter(x => x.id !== dayId);
      renderSuiviTable();
      await persistCustomTab();
      showUndoToast(`Ligne du ${fmtMealDate(removedDay.date).ddmm} supprimée`, async () => {
        if(!d.days.some(x => x.id === dayId)) d.days.push(removedDay);
        renderSuiviTable();
        await persistCustomTab();
      });
    });
  });
  wireSuiviNav(shell);
}
function wireSuiviNav(shell){
  const inputs = Array.from(shell.querySelectorAll('td.suivi-cell input'));
  inputs.forEach((inp, idx) => {
    inp.addEventListener('keydown', (e) => {
      if(e.key === 'ArrowDown' || e.key === 'Enter'){
        e.preventDefault();
        const next = inputs[idx+1];
        if(next){ next.focus(); next.select(); }
      } else if(e.key === 'ArrowUp'){
        e.preventDefault();
        const prev = inputs[idx-1];
        if(prev){ prev.focus(); prev.select(); }
      }
    });
    inp.addEventListener('focus', () => inp.select());
  });
}

document.getElementById('btnAddSuiviDate').addEventListener('click', async () => {
  const input = prompt('Date à ajouter (JJ/MM/AAAA) :');
  if(!input) return;
  const m = input.trim().match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if(!m){ alert('Format invalide. Utilise JJ/MM/AAAA.'); return; }
  const iso = m[3]+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0');
  const d = activeCustomTabData;
  d.days = d.days || [];
  if(d.days.some(x => x.date === iso)){ alert('Cette date existe déjà.'); return; }
  d.days.push({id: cryptoId(), date: iso, values: {}});
  renderSuiviTable();
  await persistCustomTab();
});

document.getElementById('btnConvertSuivi').addEventListener('click', async () => {
  if(!isAdmin){
    alert("Réservé au superviseur. Clique d'abord sur \"🔒 Mode superviseur\" et entre le mot de passe.");
    return;
  }
  if(!confirm('Transformer cet onglet en "Suivi Excel" (une ligne par jour, colonnes du fichier EASY_SUIVI) ? Le contenu actuel de ce tableau sera remplacé.')) return;
  activeCustomTabData = defaultSuiviData();
  renderCustomTable();
  updateCustomToolbarForType();
  await persistCustomTab();
});

/* --- Import du fichier EASY_SUIVI_2026.xlsx (une feuille par mois) --- */
function pad2(n){ return String(n).padStart(2,'0'); }
function isoFromXlsxDate(v){
  if(v instanceof Date && !isNaN(v)) return v.getUTCFullYear()+'-'+pad2(v.getUTCMonth()+1)+'-'+pad2(v.getUTCDate());
  if(typeof v === 'number' && typeof XLSX !== 'undefined' && XLSX.SSF && XLSX.SSF.parse_date_code){
    const dc = XLSX.SSF.parse_date_code(v);
    if(dc) return dc.y+'-'+pad2(dc.m)+'-'+pad2(dc.d);
  }
  return null;
}
function frFromXlsxDate(v){
  const iso = isoFromXlsxDate(v);
  if(!iso) return (v==null ? '' : String(v));
  const [y,m,day] = iso.split('-');
  return day+'/'+m+'/'+y;
}
function parseSuiviWorkbookToDays(wb){
  const result = {}; // iso -> {colId: value}
  wb.SheetNames.forEach(sheetName => {
    if(/total/i.test(sheetName)) return; // on ignore la feuille récap "TOTAL"
    const ws = wb.Sheets[sheetName];
    if(!ws) return;
    const rows = XLSX.utils.sheet_to_json(ws, {header:1, raw:true, defval:null});
    for(let r=1; r<rows.length; r++){ // r=0 est la ligne d'en-têtes
      const row = rows[r];
      if(!row || row[0] === null || row[0] === undefined || row[0] === '') continue;
      if(typeof row[0] === 'string' && /total/i.test(row[0])) continue;
      const iso = isoFromXlsxDate(row[0]);
      if(!iso) continue;
      const values = {};
      SUIVI_COLUMNS.forEach(def => {
        const raw = row[def.col];
        if(raw === undefined || raw === null || raw === '') return;
        values[def.id] = def.type === 'date' ? frFromXlsxDate(raw) : raw;
      });
      if(Object.keys(values).length) result[iso] = Object.assign({}, values, result[iso] || {});
    }
  });
  return result;
}
document.getElementById('btnImportSuiviExcel').addEventListener('click', () => document.getElementById('suiviExcelFileInput').click());
document.getElementById('suiviExcelFileInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if(!file) return;
  if(typeof XLSX === 'undefined'){
    alert("La librairie de lecture Excel n'a pas pu se charger. Vérifie ta connexion et réessaie.");
    return;
  }
  try{
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, {type:'array', cellDates:true});
    const dayMap = parseSuiviWorkbookToDays(wb);
    const isoList = Object.keys(dayMap);
    if(!isoList.length){ alert("Aucune ligne journalière reconnue dans ce fichier (vérifie qu'il s'agit bien du format EASY_SUIVI)."); return; }
    const d = activeCustomTabData;
    d.days = d.days || [];
    let created = 0, updated = 0;
    isoList.forEach(iso => {
      let row = d.days.find(x => x.date === iso);
      if(!row){ row = {id: cryptoId(), date: iso, values: {}}; d.days.push(row); created++; }
      else { updated++; }
      row.values = Object.assign({}, row.values, dayMap[iso]);
    });
    renderSuiviTable();
    await persistCustomTab();
    const tabName = (customTabs.find(t=>t.id===activeCustomTabId)||{}).name || 'Suivi Excel';
    logChange(`a importé un fichier Excel dans « ${tabName} » (${created} jour(s) créé(s), ${updated} mis à jour)`);
    alert(`Import terminé : ${created} nouveau(x) jour(s), ${updated} jour(s) mis à jour.`);
  } catch(err){
    alert("Impossible de lire ce fichier. Vérifie qu'il s'agit bien d'un fichier Excel (.xlsx) valide.\n\n" + (err && err.message ? err.message : ''));
  }
});

/* --- Pont avec le Planning : reporter les badges (MAIL, AVENANTS, ...) dans la bonne ligne/colonne --- */
async function findSuiviTab(){
  for(const t of customTabs){
    let data;
    if(activeCustomTabId === t.id && activeCustomTabData){
      data = activeCustomTabData;
    } else {
      data = await storageGet(customTabKey(t.id));
    }
    if(data && data.type === 'suivi') return {id: t.id, name: t.name, data};
  }
  return null;
}
async function reportCategoryTotalsToSuivi(dateIso, catTotals, extraValues){
  const found = await findSuiviTab();
  if(!found) return {ok:false, reason:'not-found'};
  const data = found.data;
  data.days = data.days || [];
  let row = data.days.find(x => x.date === dateIso);
  if(!row){ row = {id: cryptoId(), date: dateIso, values: {}}; data.days.push(row); }
  row.values = row.values || {};
  let count = 0;
  catTotals.forEach(c => {
    const colId = CATEGORY_TO_SUIVI_COL[c.label];
    if(!colId) return;
    row.values[colId] = c.sum;
    count++;
  });
  if(extraValues){
    Object.keys(extraValues).forEach(colId => {
      row.values[colId] = extraValues[colId];
      count++;
    });
  }
  recomputeSuiviDerivedFields(row);
  await storageSet(customTabKey(found.id), data);
  if(activeCustomTabId === found.id){
    activeCustomTabData = data;
    renderCustomTable();
  }
  logChange(`a reporté les chiffres du ${dateIso} (${count} indicateur(s)) dans « ${found.name} »`);
  return {ok:true, tabName: found.name, count};
}

document.getElementById('btnRenamePhonePerson').addEventListener('click', async () => {
  const d = activeCustomTabData;
  if(!d.people.length){ alert('Aucune personne enregistrée dans ce planning.'); return; }
  const names = d.people.map(p => p.name).join(', ');
  const oldName = prompt(`Renommer qui ? (personnes actuelles : ${names})`);
  if(!oldName || !oldName.trim()) return;
  const person = d.people.find(p => p.name.trim().toLowerCase() === oldName.trim().toLowerCase());
  if(!person){ alert(`Personne "${oldName}" introuvable parmi : ${names}`); return; }
  const newName = prompt(`Nouveau prénom pour "${person.name}" :`, person.name);
  if(!newName || !newName.trim()) return;
  const oldLower = person.name.trim().toLowerCase();
  const finalName = newName.trim();
  person.name = finalName;
  d.shifts = d.shifts || {};
  let replaced = 0;
  Object.keys(d.shifts).forEach(key => {
    if((d.shifts[key] || '').trim().toLowerCase() === oldLower){
      d.shifts[key] = finalName;
      replaced++;
    }
  });
  renderPhonePlanningGrid();
  await persistCustomTab();
  logChange(`a renommé "${oldName}" en "${finalName}" dans le Planning Tel (${replaced} case(s) mise(s) à jour)`);
  alert(`"${oldName}" renommé(e) en "${finalName}" (${replaced} case(s) mise(s) à jour).`);
});

document.getElementById('btnExportSuivi').addEventListener('click', () => {
  if(typeof XLSX === 'undefined'){
    alert("La librairie Excel n'a pas pu se charger. Vérifie ta connexion et réessaie.");
    return;
  }
  const d = activeCustomTabData;
  const sortedDays = [...(d.days || [])].sort((a,b) => a.date.localeCompare(b.date));
  if(!sortedDays.length){ alert('Aucune donnée à exporter dans cet onglet.'); return; }
  const header = ['Date', ...SUIVI_COLUMNS.map(c => c.label)];
  const aoa = [header];
  sortedDays.forEach(day => {
    const [y,m,dd] = day.date.split('-');
    const row = [dd+'/'+m+'/'+y];
    SUIVI_COLUMNS.forEach(col => {
      const v = (day.values && day.values[col.id] != null) ? day.values[col.id] : '';
      row.push(v);
    });
    aoa.push(row);
  });
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Suivi');
  const tabName = (customTabs.find(t=>t.id===activeCustomTabId)||{}).name || 'Suivi Excel';
  const safeName = tabName.replace(/[^a-z0-9_\-]+/gi, '_');
  XLSX.writeFile(wb, `${safeName}-${todayIso()}.xlsx`);
  logChange(`a exporté l'onglet « ${tabName} » en fichier Excel`);
});

initCustomTabs();
