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

function defaultCustomTabData(){
  return {
    type: 'generic',
    columns: [ {id:'c1', label:'Colonne 1'}, {id:'c2', label:'Colonne 2'} ],
    rows: [ {id: cryptoId(), cells: {}} ]
  };
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
  return d;
}

async function switchAppTab(tabId){
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
  let html = '<table class="custom-table"><thead><tr>';
  d.columns.forEach(col => {
    html += `<th><div class="custom-col-head">
      <input type="text" value="${escapeHtml(col.label)}" data-colid="${col.id}" class="custom-col-input" />
      ${d.columns.length > 1 ? `<button class="custom-col-del" data-coldel="${col.id}" title="Supprimer la colonne">✕</button>` : ''}
    </div></th>`;
  });
  html += '<th style="width:36px;"></th></tr></thead><tbody>';
  d.rows.forEach(row => {
    html += `<tr data-rowid="${row.id}">`;
    d.columns.forEach(col => {
      const val = row.cells[col.id] || '';
      html += `<td class="custom-cell"><input type="text" value="${escapeHtml(val)}" data-colid="${col.id}" /></td>`;
    });
    html += `<td class="custom-row-actions"><button class="remove-x" data-rowdel="${row.id}" title="Supprimer la ligne">✕</button></td></tr>`;
  });
  html += '</tbody></table>';
  shell.innerHTML = html;

  shell.querySelectorAll('.custom-col-input').forEach(inp => {
    inp.addEventListener('change', async () => {
      const col = d.columns.find(c => c.id === inp.dataset.colid);
      if(!col) return;
      col.label = inp.value;
      await persistCustomTab();
    });
  });
  shell.querySelectorAll('.custom-col-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      d.columns = d.columns.filter(c => c.id !== btn.dataset.coldel);
      renderCustomTable();
      await persistCustomTab();
    });
  });
  shell.querySelectorAll('tr[data-rowid]').forEach(tr => {
    const rowId = tr.dataset.rowid;
    tr.querySelectorAll('td.custom-cell input').forEach(inp => {
      inp.addEventListener('change', async () => {
        const row = d.rows.find(r => r.id === rowId);
        if(!row) return;
        row.cells[inp.dataset.colid] = inp.value;
        await persistCustomTab();
      });
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
  activeCustomTabData.columns.push({id: cryptoId(), label: 'Nouvelle colonne'});
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
  await storageSet(customTabKey(newTab.id), defaultCustomTabData());
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

  function monthSummaryRow(monthKey, sums){
    let row = `<tr class="suivi-month-summary" data-monthkey="${monthKey}"><td class="suivi-date-cell">Total — ${mealMonthLabel(monthKey+'-01')}</td>`;
    SUIVI_COLUMNS.forEach(col => {
      const v = sums[col.id];
      row += `<td data-colsum="${col.id}">${((col.type==='num'||col.type==='formula') && v!=null) ? v : ''}</td>`;
    });
    row += '</tr>';
    return row;
  }

  if(!sortedDays.length){
    html += `<tr><td colspan="${SUIVI_COLUMNS.length+1}" class="empty-note">Aucune donnée. Importe le fichier Excel ou ajoute une date à la main.</td></tr>`;
  } else {
    let lastWeek = null, currentMonth = null, monthSums = {};
    sortedDays.forEach((day, idx) => {
      const monthKey = day.date.slice(0,7);
      if(currentMonth !== null && monthKey !== currentMonth){
        html += monthSummaryRow(currentMonth, monthSums);
        monthSums = {};
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
        if((col.type === 'num' || col.type === 'formula') && typeof raw === 'number') monthSums[col.id] = (monthSums[col.id]||0) + raw;
        if(col.type === 'formula'){
          html += `<td class="suivi-cell suivi-formula" title="Calculé automatiquement">${raw === '' ? '—' : escapeHtml(String(raw))}</td>`;
        } else {
          html += `<td class="suivi-cell"><input type="text" value="${escapeHtml(String(raw))}" data-day="${day.id}" data-col="${col.id}" data-type="${col.type}" /></td>`;
        }
      });
      html += '</tr>';

      if(idx === sortedDays.length-1){
        html += monthSummaryRow(currentMonth, monthSums);
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
