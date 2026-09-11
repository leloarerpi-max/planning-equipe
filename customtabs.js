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
    columns: [ {id:'c1', label:'Colonne 1'}, {id:'c2', label:'Colonne 2'} ],
    rows: [ {id: cryptoId(), cells: {}} ]
  };
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
  if(!activeCustomTabData || !activeCustomTabData.columns) activeCustomTabData = defaultCustomTabData();
  attachCustomTabListener(tabId);
  renderCustomTable();
}

function attachCustomTabListener(tabId){
  if(customTabListenerRef) customTabListenerRef.off();
  customTabListenerRef = fbDb.ref(dbPath(customTabKey(tabId)));
  customTabListenerRef.on('value', snap => {
    if(!snap.exists()) return;
    let fresh;
    try{ fresh = JSON.parse(snap.val()); } catch(e){ return; }
    if(!fresh || !fresh.columns) return;
    const active = document.activeElement;
    if(active && active.tagName === 'INPUT' && active.type === 'text') return; // don't disrupt typing
    if(JSON.stringify(fresh) === JSON.stringify(activeCustomTabData)) return;
    activeCustomTabData = fresh;
    renderCustomTable();
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

initCustomTabs();
