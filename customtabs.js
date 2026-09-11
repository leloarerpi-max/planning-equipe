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
  let html = `<button class="apptab-btn ${activeAppTab==='planning'?'active':''}" data-apptab="planning">Planning &amp; Objectif</button>`;
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
  if(!activeCustomTabData || (!activeCustomTabData.columns && !activeCustomTabData.people)){
    activeCustomTabData = defaultCustomTabData();
  }
  normalizeMealDataOnLoad(activeCustomTabData);
  attachCustomTabListener(tabId);
  renderCustomTable();
  updateCustomToolbarForType();
}

function updateCustomToolbarForType(){
  const isMeal = activeCustomTabData && activeCustomTabData.type === 'mealplanning';
  document.getElementById('btnAddColumn').style.display = isMeal ? 'none' : '';
  document.getElementById('btnAddRow').style.display = isMeal ? 'none' : '';
  document.getElementById('btnAddMealDate').style.display = isMeal ? '' : 'none';
  document.getElementById('btnAddMealPerson').style.display = isMeal ? '' : 'none';
  document.getElementById('btnConvertMealPlanning').style.display = isMeal ? 'none' : '';
}

function attachCustomTabListener(tabId){
  if(customTabListenerRef) customTabListenerRef.off();
  customTabListenerRef = fbDb.ref(dbPath(customTabKey(tabId)));
  customTabListenerRef.on('value', snap => {
    if(!snap.exists()) return;
    let fresh;
    try{ fresh = JSON.parse(snap.val()); } catch(e){ return; }
    if(!fresh || (!fresh.columns && !fresh.people)) return;
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
function renderMealPlanningGrid(){
  const shell = document.getElementById('customTableShell');
  const d = activeCustomTabData;
  if(!d.people.length){
    shell.innerHTML = '<div class="empty-note">Aucune personne. Ajoute-en une pour commencer.</div>';
    return;
  }
  const sortedDays = [...d.days].sort((a,b) => a.date.localeCompare(b.date));

  let html = '<table class="meal-table"><thead><tr><th style="text-align:left;">Date</th>';
  d.people.forEach(p => {
    const c = mealPersonColor(d, p.id);
    html += `<th class="meal-person-head"><span class="meal-person-name" style="background:${c};color:#fff;">${escapeHtml(p.name)}<button class="meal-person-del" data-persondel="${p.id}" title="Supprimer cette personne">✕</button></span></th>`;
  });
  html += '</tr></thead><tbody>';

  if(!sortedDays.length){
    html += `<tr><td colspan="${d.people.length+1}" class="empty-note">Aucune date. Clique sur "+ Ajouter une date".</td></tr>`;
  } else {
    let lastWeek = null;
    sortedDays.forEach(day => {
      const wk = mealWeekLabel(day.date);
      if(wk !== lastWeek){
        html += `<tr class="meal-week-sep"><td colspan="${d.people.length+1}">Semaine du ${fmtMealDate(wk).ddmm}</td></tr>`;
        lastWeek = wk;
      }
      const {wd, ddmm} = fmtMealDate(day.date);
      html += `<tr><td class="meal-date-cell"><div class="row-inner"><span>${ddmm} <span style="color:var(--ink-soft);font-weight:400;">${wd}</span></span><button class="remove-x" data-daydel="${day.id}" title="Supprimer cette date">✕</button></div></td>`;
      d.people.forEach(p => {
        const key = day.id+'|'+p.id;
        const val = (d.shifts && d.shifts[key]) || '';
        html += `<td class="meal-cell ${val?'filled':'empty'}"><input type="text" value="${escapeHtml(val)}" data-day="${day.id}" data-person="${p.id}" placeholder="—" /></td>`;
      });
      html += '</tr>';
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
      inp.closest('td').className = 'meal-cell ' + (inp.value.trim() ? 'filled' : 'empty');
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

initCustomTabs();
