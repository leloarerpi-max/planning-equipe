/* ==========================================================================
   planning.js — tout le code de l'onglet "Planning & Objectif" uniquement.
   Tu peux modifier ce fichier sans risque de casser les autres onglets
   (customtabs.js), tant que tu ne renommes pas une fonction utilisée par
   shared.js ou customtabs.js (fbDb, dbPath, storageGet, storageSet,
   escapeHtml, cryptoId, showUndoToast, isAdmin — définies dans shared.js).
   ========================================================================== */

const PEOPLE_KEY = 'po:people';

/* --- Supervisor lock for objectifs ---------------------------------------
   Change ADMIN_PASSWORD below to whatever you want before publishing.
   Note: this is a soft deterrent, not real security — anyone who reads the
   page source (e.g. on GitHub) can see this password. It stops casual
   colleagues from changing targets by accident, not a determined person. */
const INDEX_KEY = 'po:days-index';
function dayKey(d){ return 'po:day:' + d; }
const PERSON_PALETTE = ['#6FA8DC', '#A9564A', '#8E7CC3', '#D9A63C', '#4F9D6E', '#4A7FC1', '#C2708C', '#7FA0A6'];
const EXPRESS_ID = '__express__';
const EXPRESS_NAME = 'Express';
const EXPRESS_COLOR = '#5A5550';

function personColor(personId){
  if(personId === EXPRESS_ID) return EXPRESS_COLOR;
  const idx = people.findIndex(p => p.id === personId);
  if(idx < 0) return null;
  return PERSON_PALETTE[idx % PERSON_PALETTE.length];
}
function personNameById(personId){
  if(personId === EXPRESS_ID) return EXPRESS_NAME;
  const p = people.find(x => x.id === personId);
  return p ? p.name : '';
}
function latestDayDate(){
  if(!daysIndex.length) return null;
  return [...daysIndex].sort().slice(-1)[0];
}
function isDayEditable(){
  return isAdmin || currentDate === todayIso();
}
function textColorFor(bg){ return '#ffffff'; }
function fmtDday(iso){
  const d = new Date(iso+'T00:00:00');
  return String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0');
}
function todayIso(){
  const d = new Date();
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function addDaysIso(iso, n){
  const d = new Date(iso+'T00:00:00');
  d.setDate(d.getDate()+n);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function parseFrDate(str){
  const m = str.trim().match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if(!m) return null;
  const dd = m[1].padStart(2,'0'), mm = m[2].padStart(2,'0'), yyyy = m[3];
  return yyyy+'-'+mm+'-'+dd;
}
function toFr(iso){
  const [y,m,d] = iso.split('-');
  return d+'/'+m+'/'+y;
}

let people = [];
let daysIndex = [];
let currentDate = null;
let dayData = null; // {tasks: [...]}
const dayCache = {};

function expectedStatusForObjectif(val){
  if(val === '' || val === null || val === undefined) return '';
  return Number(val) === 0 ? 'fait' : 'afaire';
}

async function loadDayData(date, opts){
  opts = opts || {};
  if(!opts.force && dayCache[date]) return dayCache[date];
  let d = await storageGet(dayKey(date));
  if(!d || !d.tasks){
    await new Promise(r => setTimeout(r, 350));
    d = await storageGet(dayKey(date));
  }
  if(!d || !d.tasks){
    await new Promise(r => setTimeout(r, 900));
    d = await storageGet(dayKey(date));
  }
  if(!d || !d.tasks) d = {tasks: []};
  dayCache[date] = d;
  return d;
}
function setDayCache(date, data){ dayCache[date] = data; }

function defaultPeople(){
  return ['Régis','Ben','Clara','Charlotte','Pierrick','Anaïs'].map(n => ({id: cryptoId(), name:n, objectif: ''}));
}

function defaultTasksForDay(byName){
  const raw = [
    ['Vérif se mail', [], '', 53, 'rose'],
    ['Décompte matin', [], 'afaire', null, 'rose'],
    ['Décompte soir', [], 'afaire', null, 'rose'],
    ['Tri', [], 'afaire', null, 'rose'],
    ['Tableau de bord édition', ['Régis'], 'fait', 2, 'rose'],
    ['Certificat à générer', [], 'fait', 0, 'rose'],
    ['Workflow instantanéité Xpress', [], 'afaire', 9, 'rose'],
    ['À reprendre sheet vérif', [], 'fait', 0, 'rose'],
    ['Sheet "hors périmètre" matin', ['Ben'], 'fait', 7, 'rose'],
    ['Anomalie à surveiller sheet vérif', [], 'fait', 0, 'rose'],
    ['Lecture TA Lemoine', [], 'fait', 0, 'rose'],
    ['Édition mail', ['Régis'], 'afaire', 17, 'rose'],
    ['Échange client + échange résil J+1', ['Anaïs'], 'afaire', 40, 'rose'],
    ['Affaire nouvelle', [], 'fait', 0, 'rose'],
    ['Avenants (mail)', [], 'afaire', 49, 'rose'],
    ['Avenant (workflow résil 2 - sheet planning)', ['Charlotte'], 'fait', 8, 'rose'],
    ['Échange édition TN', [], 'afaire', 33, 'rose'],
    ['Échange édition BPA', ['Régis'], 'fait', 2, 'rose'],
    ['Échange avenant sur acquisition', ['Ben'], 'fait', 2, 'rose'],
    ['Échange avenant modification banque', ['Ben'], 'afaire', 33, 'rose'],
    ['Échange avenant acceptation banque', ['Clara'], 'fait', 7, 'peche'],
    ['Échange résiliation', ['Ben'], 'afaire', 14, 'peche'],
    ['Échange suivi substi', ['Charlotte'], 'fait', 6, 'peche'],
    ['Échange modif RIB', ['Clara'], 'fait', 2, 'peche'],
    ['Échange attestation', ['Clara'], 'fait', 4, 'peche'],
    ['Échange autre', ['Clara'], 'afaire', 12, 'peche'],
    ['Échange VIP', [], 'fait', 0, 'peche'],
    ['Mail résil', ['Régis'], 'afaire', 14, 'peche'],
    ['Mail prélèvement', ['Charlotte'], 'fait', 12, 'peche'],
    ['Mail RIB', [], 'afaire', 10, 'peche'],
    ['Impayé', ['Charlotte'], 'afaire', 140, 'peche'],
    ['Mise en demeure', [], 'afaire', 35, 'peche'],
    ['Mail mobilité', [], 'afaire', null, 'peche'],
    ['Avis de corrections et domiciliations', [], 'afaire', null, 'peche'],
    ['Chèque (bureau de Pierrick)', [], 'afaire', null, 'peche'],
    ['Avenant en cours (Pierrick) - Avnt cloche', [], 'afaire', null, 'peche'],
    ['Vérif chèque lutin', [], 'afaire', null, 'peche'],
    ['Mail demande attestation', [], 'afaire', null, 'bleu'],
    ['Mail NPAI', [], 'afaire', null, 'bleu'],
    ['Mail retour IT', [], 'afaire', null, 'bleu'],
  ];
  return raw.map(([name, persons, status, objectif, priority]) => ({
    id: cryptoId(), name,
    personIds: persons.map(n => byName[n]).filter(Boolean),
    status: (objectif===null||objectif===undefined) ? '' : (objectif === 0 ? 'fait' : 'afaire'), priority: priority || '',
    objectif: (objectif===null||objectif===undefined) ? '' : objectif,
    multiMode: name === 'Vérif se mail'
  }));
}

let dayListenerRef = null;
let indexListenerAttached = false;
let peopleListenerAttached = false;

function attachDayListener(date){
  if(dayListenerRef) dayListenerRef.off();
  dayListenerRef = fbDb.ref(dbPath(dayKey(date)));
  dayListenerRef.on('value', snap => {
    if(!snap.exists()) return;
    let fresh;
    try{ fresh = JSON.parse(snap.val()); } catch(e){ return; }
    if(!fresh || !fresh.tasks) return;
    const active = document.activeElement;
    const shell = document.getElementById('tableShell');
    if(active && active.tagName === 'INPUT' && active.type === 'text') return; // don't disrupt someone mid-typing
    if(JSON.stringify(fresh) === JSON.stringify(dayData)) return;
    dayData = fresh;
    setDayCache(date, dayData);
    renderTable();
  });
}

function attachIndexListener(){
  if(indexListenerAttached) return;
  indexListenerAttached = true;
  fbDb.ref(dbPath(INDEX_KEY)).on('value', snap => {
    if(!snap.exists()) return;
    let fresh;
    try{ fresh = JSON.parse(snap.val()); } catch(e){ return; }
    if(!fresh || !Array.isArray(fresh)) return;
    if(JSON.stringify(fresh) === JSON.stringify(daysIndex)) return;
    daysIndex = fresh;
    renderDayBar();
  });
}

function attachPeopleListener(){
  if(peopleListenerAttached) return;
  peopleListenerAttached = true;
  fbDb.ref(dbPath(PEOPLE_KEY)).on('value', snap => {
    if(!snap.exists()) return;
    let fresh;
    try{ fresh = JSON.parse(snap.val()); } catch(e){ return; }
    if(!fresh || !Array.isArray(fresh)) return;
    const active = document.activeElement;
    const shell = document.getElementById('tableShell');
    if(active && active.tagName === 'INPUT' && active.type === 'text') return;
    if(JSON.stringify(fresh) === JSON.stringify(people)) return;
    people = fresh;
    renderFilterOptions();
    renderTable();
  });
}

async function init(){
  try{
    ensureMyName();
    people = await storageGet(PEOPLE_KEY);
    if(!people){ people = defaultPeople(); await storageSet(PEOPLE_KEY, people); }

    daysIndex = await storageGet(INDEX_KEY);
    const today = todayIso();

    if(!daysIndex || !daysIndex.length){
      // Very first run ever: seed with today's date, not a hardcoded one.
      const byName = {}; people.forEach(p => byName[p.name] = p.id);
      const tasks = defaultTasksForDay(byName);
      daysIndex = [today];
      currentDate = today;
      dayData = {tasks};
      setDayCache(today, dayData);
      await storageSet(dayKey(today), dayData);
      await storageSet(INDEX_KEY, daysIndex);
      attachDayListener(currentDate);
      attachIndexListener();
      attachPeopleListener();
      renderAll();
      return;
    }

    daysIndex = [...daysIndex].sort();

    if(!daysIndex.includes(today)){
      // A new calendar day started: auto-create it (same rule as "+ Nouveau jour"),
      // cloned from the most recent existing day, statuses/objectifs/personnes cleared.
      const latest = latestDayDate();
      const latestData = await loadDayData(latest);
      const clonedTasks = (latestData.tasks || []).map(t => ({...t, id: cryptoId(), status: '', objectif: '', personIds: []}));
      daysIndex.push(today);
      daysIndex.sort();
      dayData = {tasks: clonedTasks};
      setDayCache(today, dayData);
      await storageSet(dayKey(today), dayData);
      await storageSet(INDEX_KEY, daysIndex);
      currentDate = today;
      logChange(`nouvelle journée créée automatiquement (${toFr(today)})`);
    } else {
      currentDate = today;
      dayData = await loadDayData(currentDate);
    }

    attachDayListener(currentDate);
    attachIndexListener();
    attachPeopleListener();
    renderAll();
  } catch(err){
    document.getElementById('tableShell').innerHTML =
      `<div class="empty-note">Un problème est survenu au chargement (${escapeHtml(String(err && err.message || err))}). <button class="btn" id="btnRetryInit" style="margin-left:8px;">Réessayer</button></div>`;
    const btn = document.getElementById('btnRetryInit');
    if(btn) btn.addEventListener('click', init);
  }
}

async function persistDay(){
  setStatus('Enregistrement…', 'saving');
  const ok = await storageSet(dayKey(currentDate), dayData);
  if(ok){
    setDayCache(currentDate, dayData);
    setStatus('Enregistré', '');
    setTimeout(() => { const s=document.getElementById('status'); if(s.textContent==='Enregistré') s.textContent=''; }, 1200);
  } else {
    setStatus("Échec de l'enregistrement — réessaie", 'error');
  }
}

// Fetches the latest server version of the day and merges in just one local task's
// current state, instead of overwriting the whole day. This means if a teammate
// changed a different task in the meantime, that change is not lost.
async function syncTask(taskId){
  setStatus('Enregistrement…', 'saving');
  let serverDay = await storageGet(dayKey(currentDate));
  if(!serverDay || !serverDay.tasks) serverDay = {tasks: []};
  // Use our current local tasks as the base — this naturally includes every
  // local edit made so far, even ones from another syncTask() call that's
  // still in flight. We only fold in tasks that exist on the server but not
  // locally (e.g. a teammate added one while we were mid-edit).
  const localTasks = dayData.tasks;
  const localIds = new Set(localTasks.map(t => t.id));
  const extraFromServer = serverDay.tasks.filter(t => !localIds.has(t.id));
  const mergedTasks = [...localTasks, ...extraFromServer];
  const merged = {tasks: mergedTasks};
  // Only force a full re-render if we actually pulled in something new
  // from someone else — otherwise a rebuild here would steal focus
  // mid-typing/navigation.
  const needsRerender = extraFromServer.length > 0;
  // Update local state BEFORE writing: our own real-time listener fires
  // synchronously as part of the write, and comparing against stale local
  // data there would trigger a redundant, focus-stealing re-render.
  dayData = merged;
  setDayCache(currentDate, dayData);
  const ok = await storageSet(dayKey(currentDate), merged);
  if(ok){
    if(needsRerender) renderTable(); else renderSummary();
    setStatus('Enregistré', '');
    setTimeout(() => { const s=document.getElementById('status'); if(s.textContent==='Enregistré') s.textContent=''; }, 1200);
  } else {
    setStatus("Échec de l'enregistrement — réessaie", 'error');
  }
}

async function syncTaskRemoval(taskId){
  setStatus('Enregistrement…', 'saving');
  let serverDay = await storageGet(dayKey(currentDate));
  if(!serverDay || !serverDay.tasks) serverDay = {tasks: []};
  const localTasks = dayData.tasks.filter(t => t.id !== taskId);
  const localIds = new Set(localTasks.map(t => t.id));
  const extraFromServer = serverDay.tasks.filter(t => t.id !== taskId && !localIds.has(t.id));
  const merged = {tasks: [...localTasks, ...extraFromServer]};
  const needsRerender = extraFromServer.length > 0;
  dayData = merged;
  setDayCache(currentDate, dayData);
  const ok = await storageSet(dayKey(currentDate), merged);
  if(ok){
    if(needsRerender) renderTable();
    setStatus('Enregistré', '');
    setTimeout(() => { const s=document.getElementById('status'); if(s.textContent==='Enregistré') s.textContent=''; }, 1200);
  } else {
    setStatus("Échec de l'enregistrement — réessaie", 'error');
  }
}
async function persistPeople(){ await storageSet(PEOPLE_KEY, people); }
async function persistIndex(){ await storageSet(INDEX_KEY, daysIndex); }

/* ---------- day bar ---------- */
function renderDayBar(){
  const bar = document.getElementById('dayBar');
  const sorted = [...daysIndex].sort();
  let html = '';
  sorted.forEach(d => {
    const delBtn = isAdmin ? `<button class="day-del" data-date-del="${d}" title="Supprimer ce jour">✕</button>` : '';
    html += `<span class="day-pill ${d===currentDate?'active':''}" data-date="${d}">${fmtDday(d)}${delBtn}</span>`;
  });
  bar.innerHTML = html + '<button class="btn-newday" id="btnNewDay">+ Nouveau jour</button>';

  bar.querySelectorAll('.day-pill').forEach(pill => {
    pill.addEventListener('click', async (e) => {
      if(e.target.classList.contains('day-del')) return;
      const d = pill.dataset.date;
      if(d === currentDate) return;
      currentDate = d;
      dayData = await loadDayData(currentDate);
      attachDayListener(currentDate);
      renderAll();
    });
  });
  bar.querySelectorAll('.day-del').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if(!isAdmin){
        alert("Réservé au superviseur. Clique d'abord sur \"🔒 Mode superviseur\" et entre le mot de passe.");
        return;
      }
      const d = btn.dataset.dateDel;
      if(daysIndex.length <= 1){ alert('Impossible de supprimer le dernier jour restant.'); return; }
      if(!confirm(`Supprimer définitivement le jour du ${toFr(d)} ?`)) return;
      const removedDayData = await loadDayData(d); // snapshot before deletion, for undo
      daysIndex = daysIndex.filter(x => x !== d);
      delete dayCache[d];
      await persistIndex();
      if(currentDate === d){
        currentDate = latestDayDate();
        dayData = await loadDayData(currentDate);
        attachDayListener(currentDate);
      }
      renderAll();
      logChange(`a supprimé le jour du ${toFr(d)}`);
      showUndoToast(`Jour du ${toFr(d)} supprimé`, async () => {
        if(!daysIndex.includes(d)){
          daysIndex.push(d);
          daysIndex.sort();
        }
        setDayCache(d, removedDayData);
        await persistIndex();
        await storageSet(dayKey(d), removedDayData);
        currentDate = d;
        dayData = removedDayData;
        attachDayListener(currentDate);
        renderAll();
        logChange(`a annulé la suppression du jour du ${toFr(d)}`);
      });
    });
  });
  document.getElementById('btnNewDay').addEventListener('click', createNewDay);
}

async function createNewDay(){
  const suggestion = toFr(addDaysIso(currentDate, 1));
  const input = prompt('Date du nouveau jour (JJ/MM/AAAA) :', suggestion);
  if(!input) return;
  const iso = parseFrDate(input);
  if(!iso){ alert('Format invalide. Utilise JJ/MM/AAAA.'); return; }
  if(daysIndex.includes(iso)){
    if(!confirm('Ce jour existe déjà. Voulez-vous l\u2019ouvrir ?')) return;
    currentDate = iso;
    dayData = await loadDayData(currentDate);
    attachDayListener(currentDate);
    renderAll();
    return;
  }
  // Clone current day's tasks: keep name/priority, reset status to "À faire", clear objectif and personnes
  const clonedTasks = dayData.tasks.map(t => ({...t, id: cryptoId(), status: '', objectif: '', personIds: []}));
  daysIndex.push(iso);
  daysIndex.sort();
  currentDate = iso;
  dayData = {tasks: clonedTasks};
  setDayCache(currentDate, dayData);
  attachDayListener(currentDate);
  await persistIndex();
  await persistDay();
  renderAll();
  logChange(`a créé le jour du ${toFr(iso)}`);
}

async function clearDayStatuses(){
  if(!isDayEditable()){ alert('Ce jour est archivé (lecture seule).'); return; }
  if(!confirm('Vider tous les statuts (Fait/À faire) de ce jour ? Les tâches, priorités et personnes restent.')) return;
  dayData.tasks.forEach(t => { t.status = ''; });
  renderAll();
  await persistDay();
  logChange(`a vidé les statuts du jour du ${toFr(currentDate)}`);
}

/* ---------- filters ---------- */
function currentFilters(){
  return {
    person: document.getElementById('filterPerson').value,
    priority: document.getElementById('filterPriority').value,
    status: document.getElementById('filterStatus').value,
  };
}
function taskMatchesFilters(t, f){
  if(f.person){
    if(f.person === '__none__'){ if(t.personIds.length) return false; }
    else if(!t.personIds.includes(f.person)) return false;
  }
  if(f.priority){
    if(f.priority === 'none'){ if(t.priority) return false; }
    else if(t.priority !== f.priority) return false;
  }
  if(f.status){
    if(f.status === 'none'){ if(t.status) return false; }
    else if(t.status !== f.status) return false;
  }
  return true;
}
function renderFilterOptions(){
  const fp = document.getElementById('filterPerson');
  const current = fp.value;
  fp.innerHTML = '<option value="">Toutes les personnes</option>' +
    people.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
  if([...fp.options].some(o => o.value === current)) fp.value = current;
}

/* ---------- main render ---------- */
function renderAll(){
  renderDayBar();
  renderFilterOptions();
  renderTable();
}

function taskRowHtml(t){
  const editable = isDayEditable();
  const dis = editable ? '' : 'disabled';
  const stCls = t.status === 'fait' ? 'st-fait' : (t.status === 'afaire' ? 'st-afaire' : 'st-empty');
  const prCls = t.priority ? 'pr-'+t.priority : 'pr-empty';
  const rowCls = t.priority ? 'row-'+t.priority : 'row-empty';
  const primaryId = t.personIds[0] || '';
  const helperId = t.personIds[1] || '';
  const helper2Id = t.personIds[2] || '';
  function slotSelect(field, value, excludeIds){
    const opts = people.filter(p => !excludeIds.includes(p.id));
    if(!excludeIds.includes(EXPRESS_ID)) opts.push({id: EXPRESS_ID, name: EXPRESS_NAME});
    const c = value ? personColor(value) : null;
    const style = c ? `background:${c};color:${textColorFor(c)};` : '';
    return `<select class="person-slot-select ${value?'has-person':''}" data-slot="${field}" style="${style}" ${dis}>
      <option value="">—</option>
      ${opts.map(p => `<option value="${p.id}" ${p.id===value?'selected':''}>${escapeHtml(p.name)}</option>`).join('')}
    </select>`;
  }

  let peopleCells;
  if(t.multiMode){
    const boxes = people.map(p => {
      const checked = t.personIds.includes(p.id);
      const c = personColor(p.id);
      const style = `background:${c};color:${textColorFor(c)};opacity:${checked?'1':'.5'};`;
      return `<label class="checklist-item" style="${style}">
        <input type="checkbox" data-person="${p.id}" ${checked?'checked':''} ${dis} />
        <span>${checked?'✓ ':''}${escapeHtml(p.name)}</span>
      </label>`;
    }).join('');
    peopleCells = `<td class="person-slot-cell checklist-cell" colspan="3"><div class="checklist-group">${boxes}</div></td>`;
  } else {
    peopleCells = `<td class="person-slot-cell">${slotSelect('primary', primaryId, [helperId, helper2Id].filter(Boolean))}</td>
    <td class="person-slot-cell">${slotSelect('helper', helperId, [primaryId, helper2Id].filter(Boolean))}</td>
    <td class="person-slot-cell">${slotSelect('helper2', helper2Id, [primaryId, helperId].filter(Boolean))}</td>`;
  }

  const statusNombreCells = t.multiMode
    ? `<td class="status-cell"></td><td class="obj-cell"></td>`
    : `<td class="status-cell"><select class="status-select ${stCls}" data-field="status" ${dis}>
      <option value="" ${t.status===''?'selected':''}>—</option>
      <option value="fait" ${t.status==='fait'?'selected':''}>Fait</option>
      <option value="afaire" ${t.status==='afaire'?'selected':''}>À faire</option>
    </select></td>
    <td class="obj-cell"><input class="obj-input" type="number" min="0" value="${t.objectif===''?'':t.objectif}" data-field="objectif" placeholder="—" ${dis} /></td>`;

  return `<tr class="task-row ${rowCls}" data-task="${t.id}">
    <td class="task-name"><input type="text" value="${escapeHtml(t.name)}" data-field="name" ${dis} /></td>
    ${peopleCells}
    ${statusNombreCells}
    <td>${(editable && isAdmin) ? `<button class="remove-x" data-action="remove-task" title="Supprimer">✕</button>` : ''}</td>
  </tr>`;
}

function renderTable(){
  const shell = document.getElementById('tableShell');
  const editable = isDayEditable();

  const btnAddTask = document.getElementById('btnAddTask');
  const btnClearDay = document.getElementById('btnClearDay');
  if(btnAddTask){ btnAddTask.disabled = !editable; btnAddTask.style.opacity = editable ? '1' : '.45'; }
  if(btnClearDay){ btnClearDay.disabled = !editable; btnClearDay.style.opacity = editable ? '1' : '.45'; }

  const banner = document.getElementById('archiveBanner');
  if(banner) banner.style.display = editable ? 'none' : 'flex';

  if(!dayData.tasks.length){
    shell.innerHTML = '<div class="empty-note">Aucune tâche pour ce jour.' + (editable ? ' <button class="btn" id="btnReloadDefaults" style="margin-left:8px;">Recharger la liste de tâches par défaut</button>' : '') + '</div>';
    document.getElementById('teamObjectif').style.display = 'none';
    document.getElementById('summaryByPerson').style.display = 'none';
    const btn = document.getElementById('btnReloadDefaults');
    if(btn) btn.addEventListener('click', reloadDefaultsIntoCurrentDay);
    return;
  }
  const f = currentFilters();
  const visible = dayData.tasks.filter(t => taskMatchesFilters(t, f));

  if(!visible.length){
    shell.innerHTML = '<div class="empty-note">Aucune tâche ne correspond aux filtres.</div>';
  } else {
    let html = '<table><thead><tr><th>Tâche</th><th style="text-align:center;">Personne</th><th style="text-align:center;">Aide</th><th style="text-align:center;">Aide 2</th><th style="text-align:center;">Statut</th><th>Nombre</th><th></th></tr></thead><tbody>';
    visible.forEach(t => { html += taskRowHtml(t); });
    html += '</tbody></table>';
    shell.innerHTML = html;

    shell.querySelectorAll('tr[data-task]').forEach(row => {
      const id = row.dataset.task;
      row.querySelectorAll('[data-field]').forEach(el => el.addEventListener('change', () => onFieldChange(id, el)));
      const rmBtn = row.querySelector('[data-action="remove-task"]');
      if(rmBtn) rmBtn.addEventListener('click', () => removeTask(id));
      row.querySelectorAll('.person-slot-select').forEach(sel => sel.addEventListener('change', () => onPersonSlotChange(id, sel.dataset.slot, sel.value)));
      row.querySelectorAll('.checklist-item input').forEach(cb => cb.addEventListener('change', () => onChecklistToggle(id, cb.dataset.person, cb.checked)));
    });
    wireObjNav(shell);
  }

  renderSummary();
}

function wireObjNav(shell){
  const inputs = Array.from(shell.querySelectorAll('.obj-input'));
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

function updateStatusSelectInPlace(taskId, status){
  const row = document.querySelector(`tr[data-task="${taskId}"]`);
  if(!row) return;
  const sel = row.querySelector('.status-select');
  if(!sel) return;
  sel.value = status;
  sel.className = 'status-select ' + (status==='fait'?'st-fait':(status==='afaire'?'st-afaire':'st-empty'));
}

async function onFieldChange(id, el){
  if(!isDayEditable()) return;
  const task = dayData.tasks.find(t => t.id === id);
  if(!task) return;
  const field = el.dataset.field;
  let val = el.value;
  if(field === 'objectif'){ val = val === '' ? '' : Number(val); }
  const fieldLabels = {name:'le nom', priority:'la couleur', status:'le statut', objectif:'le nombre'};
  task[field] = val;
  let statusChanged = false;
  if(field === 'objectif'){
    const newStatus = expectedStatusForObjectif(val);
    if(task.status !== newStatus){
      task.status = newStatus;
      statusChanged = true;
    }
  }
  if(field === 'status'){
    el.className = 'status-select ' + (val==='fait'?'st-fait':(val==='afaire'?'st-afaire':'st-empty'));
    const row = el.closest('tr.task-row');
    if(val === 'fait' && row){
      row.classList.remove('just-done'); void row.offsetWidth; row.classList.add('just-done');
      const cell = el.closest('td');
      if(cell && !cell.querySelector('.status-check')){
        const check = document.createElement('span');
        check.className = 'status-check';
        check.textContent = '✓';
        cell.appendChild(check);
        setTimeout(() => { check.remove(); }, 900);
      }
    }
  }
  if(field === 'priority'){
    el.className = 'priority-select ' + (val ? 'pr-'+val : 'pr-empty');
    const row = el.closest('tr.task-row');
    if(row) row.className = 'task-row ' + (val ? 'row-'+val : 'row-empty');
  }
  await syncTask(id);
  if(statusChanged) updateStatusSelectInPlace(id, task.status);
  renderSummary();
  const label = fieldLabels[field] || field;
  logChange(`a modifié ${label} de « ${task.name} » → ${val === '' ? '(vide)' : val}`);
  if(statusChanged) logChange(`« ${task.name} » statut ajusté automatiquement → ${task.status === '' ? '(vide)' : (task.status === 'fait' ? 'Fait' : 'À faire')} (Nombre = ${val === '' ? 'vide' : val})`);
}

async function onPersonSlotChange(id, slot, value){
  if(!isDayEditable()) return;
  const task = dayData.tasks.find(t => t.id === id);
  if(!task) return;
  const slotIndex = {primary:0, helper:1, helper2:2}[slot];
  const arr = [task.personIds[0]||'', task.personIds[1]||'', task.personIds[2]||''];
  arr[slotIndex] = value;
  // deux emplacements ne peuvent pas contenir la même personne : on vide l'autre le cas échéant
  if(value){
    for(let i=0;i<3;i++){ if(i !== slotIndex && arr[i] === value) arr[i] = ''; }
  }
  task.personIds = arr.filter(v => v);
  renderTable();
  await syncTask(id);
  const pname = value ? (personNameById(value) || '?') : '(retiré)';
  const slotLabel = slot === 'primary' ? 'Personne' : (slot === 'helper' ? 'Aide' : 'Aide 2');
  logChange(`a mis ${pname} en ${slotLabel} sur « ${task.name} »`);
}
async function onChecklistToggle(id, personId, checked){
  if(!isDayEditable()) return;
  const task = dayData.tasks.find(t => t.id === id);
  if(!task) return;
  if(checked){
    if(!task.personIds.includes(personId)) task.personIds.push(personId);
  } else {
    task.personIds = task.personIds.filter(pid => pid !== personId);
  }
  renderTable();
  await syncTask(id);
  const pname = people.find(p => p.id === personId)?.name || '?';
  logChange(`a ${checked?'coché':'décoché'} ${pname} sur « ${task.name} »`);
}
async function removeTask(id){
  if(!isDayEditable()) return;
  if(!isAdmin){
    alert("Réservé au superviseur. Clique d'abord sur \"🔒 Mode superviseur\" et entre le mot de passe.");
    return;
  }
  const task = dayData.tasks.find(t => t.id === id);
  if(!task) return;
  const taskCopy = {...task};
  dayData.tasks = dayData.tasks.filter(t => t.id !== id);
  renderTable();
  await syncTaskRemoval(id);
  logChange(`a supprimé la tâche « ${taskCopy.name} »`);
  showUndoToast(`Tâche « ${taskCopy.name} » supprimée`, async () => {
    if(!dayData.tasks.some(t => t.id === taskCopy.id)) dayData.tasks.push(taskCopy);
    renderTable();
    await syncTask(taskCopy.id);
    logChange(`a annulé la suppression de « ${taskCopy.name} »`);
  });
}

const TASK_CATEGORIES = [
  {label:'MAIL', tasks:['Édition mail','Mail prélèvement','Mail RIB','Affaire nouvelle']},
  {label:'AVENANTS', tasks:['Avenants (mail)','Avenant (workflow résil 2 - sheet planning)']},
  {label:'ECHANGES CLTS', tasks:['Échange client + échange résil J+1']},
  {label:'EDITIONS', tasks:['Sheet "hors périmètre" matin','Certificat à générer','Tableau de bord édition']},
  {label:'ECHANGE', tasks:['Échange édition TN','Échange édition BPA','Échange avenant sur acquisition','Échange avenant modification banque','Échange avenant acceptation banque','Échange suivi substi','Échange modif RIB','Échange attestation','Échange autre','Échange VIP']},
  {label:'RESIL', tasks:['Échange résiliation','Mail résil']},
];
function normTaskName(s){ return (s||'').trim().toLowerCase(); }
function buildTaskObjectifByName(visible){
  const byName = {};
  visible.forEach(t => {
    const key = normTaskName(t.name);
    byName[key] = (byName[key] || 0) + (Number(t.objectif) || 0);
  });
  return byName;
}
function computeCategoryTotals(visible){
  const byName = buildTaskObjectifByName(visible);
  return TASK_CATEGORIES.map(cat => ({
    label: cat.label,
    sum: cat.tasks.reduce((s, name) => s + (byName[normTaskName(name)] || 0), 0)
  }));
}
// Colonnes du Suivi Excel alimentées directement depuis une tâche précise du Planning (pas une catégorie/badge)
const EXTRA_SUIVI_TASK_MAP = {
  'impayes_traites': 'IMPAYÉ',
  'mise_demeure_traites': 'MISE EN DEMEURE',
};
function isoToFrFull(iso){
  const [y,m,d] = iso.split('-');
  return d+'/'+m+'/'+y;
}
// Date de traitement (prio / non prio) = la veille, sauf le lundi où c'est le vendredi précédent
function prevBusinessDateFr(iso){
  const dow = new Date(iso+'T00:00:00').getDay(); // 0=dim, 1=lun, ... 6=sam
  const prevIso = dow === 1 ? addDaysIso(iso, -3) : addDaysIso(iso, -1);
  return isoToFrFull(prevIso);
}
function computeExtraSuiviValues(visible, dateIso){
  const byName = buildTaskObjectifByName(visible);
  const values = {};
  Object.keys(EXTRA_SUIVI_TASK_MAP).forEach(colId => {
    values[colId] = byName[normTaskName(EXTRA_SUIVI_TASK_MAP[colId])] || 0;
  });
  values['date_mail_prio'] = prevBusinessDateFr(dateIso);
  values['date_non_prio'] = prevBusinessDateFr(dateIso);
  return values;
}
function categoryTotalsBadgesHtml(catTotals){
  let grandTotal = 0;
  let badges = '';
  catTotals.forEach(c => {
    grandTotal += c.sum;
    badges += `<span class="cat-badge">${escapeHtml(c.label)} <b>${c.sum}</b></span>`;
  });
  badges += `<span class="cat-badge cat-badge-total">TOTAL <b>${grandTotal}</b></span>`;
  return badges;
}

function renderSummary(){
  const f = currentFilters();
  const visible = dayData.tasks.filter(t => taskMatchesFilters(t, f));

  const totalObjectif = visible.reduce((s,t) => s + (Number(t.objectif)||0), 0);
  const doneObjectif = visible.filter(t => t.status==='fait').reduce((s,t) => s + (Number(t.objectif)||0), 0);
  const pct = totalObjectif > 0 ? Math.min(100, Math.round(doneObjectif/totalObjectif*100)) : 0;
  const reached = totalObjectif > 0 && doneObjectif >= totalObjectif;

  const box = document.getElementById('teamObjectif');
  box.style.display = 'flex';
  const r = 34, circ = 2*Math.PI*r;
  const dash = circ * pct/100;
  const ringColor = reached ? 'var(--teal)' : 'var(--ochre)';
  const catTotals = computeCategoryTotals(visible);
  box.innerHTML = `
    <div class="today-ring">
      <svg width="88" height="88" viewBox="0 0 88 88">
        <circle cx="44" cy="44" r="${r}" fill="none" stroke="var(--line)" stroke-width="9"/>
        <circle cx="44" cy="44" r="${r}" fill="none" stroke="${ringColor}" stroke-width="9"
          stroke-dasharray="${dash} ${circ}" stroke-linecap="round"
          transform="rotate(-90 44 44)" style="transition:stroke-dasharray .4s ease;"/>
        <text x="44" y="49" text-anchor="middle" class="ring-pct">${pct}%</text>
      </svg>
    </div>
    <div class="today-info">
      <div class="today-date">Aujourd'hui · ${toFr(currentDate)}</div>
      <div class="today-nums"><b>${doneObjectif}</b> / ${totalObjectif} réalisé · <b>${visible.filter(t=>t.status==='fait').length}</b> / ${visible.length} tâches faites</div>
      <div class="bar-track" style="width:220px;"><div class="bar-fill ${reached?'reached':''}" style="width:${pct}%"></div></div>
    </div>
    <div class="cat-badges-row">${categoryTotalsBadgesHtml(catTotals)}<button class="btn-ghost" id="btnReportSuivi" style="margin-left:6px;">📌 Reporter dans Suivi Excel</button></div>
  `;
  const btnReportSuivi = document.getElementById('btnReportSuivi');
  if(btnReportSuivi){
    btnReportSuivi.addEventListener('click', async () => {
      if(typeof reportCategoryTotalsToSuivi !== 'function'){ alert('Fonctionnalité indisponible.'); return; }
      btnReportSuivi.disabled = true;
      const extraValues = computeExtraSuiviValues(visible, currentDate);
      const res = await reportCategoryTotalsToSuivi(currentDate, catTotals, extraValues);
      btnReportSuivi.disabled = false;
      if(res && res.ok){
        alert(`Chiffres du ${toFr(currentDate)} reportés dans l'onglet « ${res.tabName} ».`);
      } else {
        alert('Aucun onglet "Suivi Excel" trouvé.\n\nCrée-le d\u2019abord : "+ Nouvel onglet", puis dans cet onglet clique sur "🧮 Transformer en Suivi Excel" (mode superviseur).');
      }
    });
  }

  const byPerson = {};
  people.forEach(p => byPerson[p.id] = {id:p.id, name:p.name, assigned:0, done:0, target: (p.objectif===''||p.objectif==null)?'':Number(p.objectif), color:personColor(p.id)});
  visible.forEach(t => {
    const n = t.personIds.length || 0;
    if(n === 0) return;
    const share = (Number(t.objectif)||0) / n;
    t.personIds.forEach(pid => {
      if(!byPerson[pid]) return;
      byPerson[pid].assigned += share;
      if(t.status==='fait') byPerson[pid].done += share;
    });
  });
  const entries = Object.values(byPerson);
  lastByPersonStats = byPerson;
  const rows = entries
    .sort((a,b) => b.assigned - a.assigned)
    .map(v => {
      const hasTarget = v.target !== '' && v.target > 0;
      const p2 = hasTarget ? Math.min(100, Math.round(v.done/v.target*100)) : 0;
      const r2 = hasTarget && v.done >= v.target;
      const dot = v.color ? `<i style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${v.color};margin-right:6px;flex-shrink:0;"></i>` : '';
      const targetInput = v.id ? `<input type="number" min="0" class="person-obj-input" data-person="${v.id}" value="${v.target}" placeholder="—" ${isAdmin?'':'disabled title="Réservé au superviseur"'} />` : `<span style="width:52px;display:inline-block;text-align:center;color:var(--ink-soft);">—</span>`;
      const doneDisplay = Number.isInteger(v.done) ? v.done : v.done.toFixed(1);
      return `<div class="bar-row" data-person-row="${v.id||''}">
        <div class="bar-label">${dot}${escapeHtml(v.name)}</div>
        <div class="bar-track"><div class="bar-fill ${r2?'reached':''}" style="width:${p2}%"></div></div>
        <div class="bar-count">${doneDisplay}${hasTarget ? ' / '+v.target : ''}</div>
        ${targetInput}
      </div>`;
    }).join('');
  document.getElementById('summaryByPerson').style.display = rows ? 'block' : 'none';
  document.getElementById('barsByPerson').innerHTML = rows;
  document.querySelectorAll('.person-obj-input').forEach(inp => {
    inp.addEventListener('change', async () => {
      const p = people.find(x => x.id === inp.dataset.person);
      if(!p) return;
      p.objectif = inp.value === '' ? '' : Math.max(0, Number(inp.value));
      await persistPeople();
      updatePersonBarRowInPlace(p.id);
    });
  });
  wirePersonObjNav();
}

let lastByPersonStats = {};
function updatePersonBarRowInPlace(personId){
  const p = people.find(x => x.id === personId);
  const stats = lastByPersonStats[personId];
  if(!p || !stats) return;
  const target = (p.objectif===''||p.objectif==null) ? '' : Number(p.objectif);
  stats.target = target;
  const hasTarget = target !== '' && target > 0;
  const p2 = hasTarget ? Math.min(100, Math.round(stats.done/target*100)) : 0;
  const reached = hasTarget && stats.done >= target;
  const doneDisplay = Number.isInteger(stats.done) ? stats.done : stats.done.toFixed(1);
  const row = document.querySelector(`.bar-row[data-person-row="${personId}"]`);
  if(!row) return;
  const fill = row.querySelector('.bar-fill');
  const count = row.querySelector('.bar-count');
  if(fill){ fill.style.width = p2 + '%'; fill.className = 'bar-fill ' + (reached ? 'reached' : ''); }
  if(count){ count.textContent = doneDisplay + (hasTarget ? ' / ' + target : ''); }
}
function wirePersonObjNav(){
  const inputs = Array.from(document.querySelectorAll('.person-obj-input'));
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

/* ---------- add task / person ---------- */
async function reloadDefaultsIntoCurrentDay(){
  const byName = {}; people.forEach(p => byName[p.name] = p.id);
  dayData = {tasks: defaultTasksForDay(byName)};
  renderTable();
  await persistDay();
}

async function addTask(){
  if(!isDayEditable()){ alert('Ce jour est archivé (lecture seule).'); return; }
  const name = prompt('Nom de la tâche :');
  if(!name || !name.trim()) return;
  const newTask = {id: cryptoId(), name: name.trim(), personIds: [], status: '', priority: '', objectif: '', multiMode: false};
  dayData.tasks.push(newTask);
  renderTable();
  await syncTask(newTask.id);
  logChange(`a ajouté la tâche « ${newTask.name} »`);
}
async function addPerson(){
  const name = prompt('Nom de la personne à ajouter :');
  if(!name || !name.trim()) return;
  people.push({id: cryptoId(), name: name.trim(), objectif: ''});
  renderFilterOptions();
  renderTable();
  await persistPeople();
  logChange(`a ajouté ${name.trim()} à l'équipe`);
}

async function resetAll(){
  if(!isAdmin){
    alert("Réservé au superviseur. Clique d'abord sur \"🔒 Mode superviseur\" et entre le mot de passe.");
    return;
  }
  const confirmWord = prompt("Cette action efface TOUT pour TOUTE l'équipe (personnes, tous les jours). Tape RESET pour confirmer :");
  if(confirmWord !== 'RESET') return;
  Object.keys(dayCache).forEach(k => delete dayCache[k]);
  const byName = {};
  people = defaultPeople();
  people.forEach(p => byName[p.name] = p.id);
  const d0 = '2026-09-10';
  daysIndex = [d0];
  dayData = {tasks: defaultTasksForDay(byName)};
  currentDate = d0;
  setDayCache(d0, dayData);
  attachDayListener(currentDate);
  await persistPeople();
  await persistIndex();
  await persistDay();
  renderAll();
  logChange('a réinitialisé complètement l\u2019outil');
}

document.getElementById('btnAddTask').addEventListener('click', addTask);
document.getElementById('btnAddPerson').addEventListener('click', addPerson);
document.getElementById('btnClearDay').addEventListener('click', clearDayStatuses);
document.getElementById('btnResetAll').addEventListener('click', resetAll);
document.getElementById('filterPerson').addEventListener('change', renderTable);
document.getElementById('filterPriority').addEventListener('change', renderTable);
document.getElementById('filterStatus').addEventListener('change', renderTable);

document.getElementById('btnStats').addEventListener('click', toggleStatsPanel);
document.getElementById('btnJournal').addEventListener('click', toggleJournalPanel);
let journalOpen = false;
async function toggleJournalPanel(){
  const panel = document.getElementById('journalPanel');
  journalOpen = !journalOpen;
  panel.style.display = journalOpen ? 'block' : 'none';
  if(journalOpen) await loadJournal();
}
async function loadJournal(){
  const loading = document.getElementById('journalLoading');
  const list = document.getElementById('journalList');
  loading.style.display = 'block';
  list.innerHTML = '';
  try{
    const snap = await fbDb.ref(dbPath('po:changelog')).limitToLast(100).get();
    loading.style.display = 'none';
    if(!snap.exists()){
      list.innerHTML = '<div class="empty-note">Aucune activité enregistrée pour l\'instant.</div>';
      return;
    }
    const entries = Object.values(snap.val()).sort((a,b) => b.ts - a.ts);
    list.innerHTML = entries.map(e => `<div class="journal-entry">
      <span class="journal-time">${fmtLogTime(e.ts)}</span>
      <span class="journal-name">${escapeHtml(e.name || 'Quelqu\u2019un')}</span>
      <span>${escapeHtml(e.text || '')}</span>
    </div>`).join('');
  } catch(err){
    loading.style.display = 'none';
    list.innerHTML = '<div class="empty-note">Impossible de charger le journal.</div>';
  }
}
let statsOpen = false;
async function toggleStatsPanel(){
  const panel = document.getElementById('statsPanel');
  statsOpen = !statsOpen;
  panel.style.display = statsOpen ? 'block' : 'none';
  if(statsOpen) await computeAndRenderStats();
}

async function computeAndRenderStats(){
  const loading = document.getElementById('statsLoading');
  const totalsEl = document.getElementById('statsTotals');
  const tableShell = document.getElementById('statsTableShell');
  const echangesShell = document.getElementById('statsEchangesShell');
  loading.style.display = 'block';
  totalsEl.innerHTML = '';
  tableShell.innerHTML = '';
  echangesShell.innerHTML = '';

  // Load every day (cache avoids re-fetching days already seen this session)
  const allDaysWithDate = await Promise.all(daysIndex.map(async d => ({date: d, data: await loadDayData(d)})));

  const perPersonTotal = {}; // personId -> completed count
  const perPersonTask = {};  // personId -> { taskName -> count }
  const taskNamesSet = new Set();
  people.forEach(p => { perPersonTotal[p.id] = 0; perPersonTask[p.id] = {}; });

  const echangesClientNames = (TASK_CATEGORIES.find(c => c.label === 'ECHANGES CLTS') || {tasks:[]}).tasks.map(normTaskName);
  const monthlyEchanges = {}; // monthKey (YYYY-MM) -> { personId: sommeCumulée }

  allDaysWithDate.forEach(({date, data}) => {
    const monthKey = date.slice(0,7);
    (data.tasks || []).forEach(t => {
      const nameKey = (t.name || '').trim().toUpperCase();
      if(!nameKey) return;
      taskNamesSet.add(nameKey);
      if(t.status === 'fait'){
        (t.personIds || []).forEach(pid => {
          if(!(pid in perPersonTotal)) return; // person no longer exists
          perPersonTotal[pid] += 1;
          perPersonTask[pid][nameKey] = (perPersonTask[pid][nameKey] || 0) + 1;
        });
      }
      if(echangesClientNames.includes(normTaskName(t.name))){
        const ids = t.personIds || [];
        if(!ids.length) return;
        const share = (Number(t.objectif) || 0) / ids.length;
        ids.forEach(pid => {
          if(!people.some(p => p.id === pid)) return; // person no longer exists
          monthlyEchanges[monthKey] = monthlyEchanges[monthKey] || {};
          monthlyEchanges[monthKey][pid] = (monthlyEchanges[monthKey][pid] || 0) + share;
        });
      }
    });
  });

  loading.style.display = 'none';

  // Totals cards
  const totalsSorted = people.map(p => ({p, count: perPersonTotal[p.id] || 0})).sort((a,b) => b.count - a.count);
  totalsEl.innerHTML = totalsSorted.map(({p, count}) => {
    const c = personColor(p.id);
    const dot = c ? `<i style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${c};"></i>` : '';
    return `<div class="stat-card"><div class="stat-name">${dot}${escapeHtml(p.name)}</div><div class="stat-value">${count}</div></div>`;
  }).join('') || '<div class="empty-note">Aucune donnée pour l\'instant.</div>';

  // Matrix: tasks x people
  const taskNames = [...taskNamesSet].sort((a,b) => {
    const totalA = people.reduce((s,p) => s + (perPersonTask[p.id][a]||0), 0);
    const totalB = people.reduce((s,p) => s + (perPersonTask[p.id][b]||0), 0);
    return totalB - totalA;
  });

  if(!taskNames.length || !people.length){
    tableShell.innerHTML = '<div class="empty-note">Pas encore assez de données.</div>';
  } else {
    let html = '<table class="stats-matrix"><thead><tr><th style="text-align:left;position:sticky;left:0;background:var(--panel);">Tâche</th>';
    people.forEach(p => { html += `<th>${escapeHtml(p.name)}</th>`; });
    html += '</tr></thead><tbody>';
    taskNames.forEach(name => {
      html += `<tr><td class="stats-task-name">${escapeHtml(name)}</td>`;
      const rowCounts = people.map(p => perPersonTask[p.id][name] || 0);
      const rowMax = Math.max(...rowCounts, 0);
      people.forEach((p, i) => {
        const count = rowCounts[i];
        const cls = count === 0 ? 'stats-count-0' : (count === rowMax && rowMax > 0 ? 'stats-count-hi' : '');
        html += `<td class="${cls}">${count}</td>`;
      });
      html += '</tr>';
    });
    html += '</tbody></table>';
    tableShell.innerHTML = html;
  }

  // Échanges clients par personne et par mois
  const monthKeys = Object.keys(monthlyEchanges).sort();
  if(!monthKeys.length || !people.length){
    echangesShell.innerHTML = '<div class="empty-note">Pas encore assez de données.</div>';
  } else {
    let html2 = '<table class="stats-matrix"><thead><tr><th style="text-align:left;position:sticky;left:0;background:var(--panel);">Mois</th>';
    people.forEach(p => { html2 += `<th>${escapeHtml(p.name)}</th>`; });
    html2 += '<th>Total</th></tr></thead><tbody>';
    monthKeys.forEach(mk => {
      html2 += `<tr><td class="stats-task-name">${escapeHtml(mealMonthLabel(mk+'-01'))}</td>`;
      const rowVals = people.map(p => Math.round((monthlyEchanges[mk][p.id] || 0) * 10) / 10);
      const rowMax = Math.max(...rowVals, 0);
      let rowTotal = 0;
      people.forEach((p, i) => {
        const v = rowVals[i];
        rowTotal += v;
        const cls = v === 0 ? 'stats-count-0' : (v === rowMax && rowMax > 0 ? 'stats-count-hi' : '');
        html2 += `<td class="${cls}">${v || ''}</td>`;
      });
      html2 += `<td style="font-weight:700;">${Math.round(rowTotal*10)/10}</td></tr>`;
    });
    html2 += '</tbody></table>';
    echangesShell.innerHTML = html2;
  }
}

document.getElementById('btnExport').addEventListener('click', exportData);
document.getElementById('btnImport').addEventListener('click', () => document.getElementById('importFileInput').click());
document.getElementById('importFileInput').addEventListener('change', importData);

async function exportData(){
  setStatus('Préparation de l\u2019export…', 'saving');
  try{
    const allDays = {};
    await Promise.all(daysIndex.map(async d => { allDays[d] = await loadDayData(d); }));
    const bundle = {
      exportedAt: new Date().toISOString(),
      people,
      daysIndex,
      days: allDays
    };
    const blob = new Blob([JSON.stringify(bundle, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `planning-export-${todayIso()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setStatus('Export prêt', '');
    logChange('a exporté toutes les données');
    setTimeout(() => { const s=document.getElementById('status'); if(s.textContent==='Export prêt') s.textContent=''; }, 1500);
  } catch(e){
    setStatus('Échec de l\u2019export', 'error');
  }
}

async function exportEverything(){
  setStatus('Préparation de la sauvegarde complète…', 'saving');
  try{
    const allDays = {};
    await Promise.all(daysIndex.map(async d => { allDays[d] = await loadDayData(d); }));
    const customTabsBundle = {};
    if(typeof customTabs !== 'undefined'){
      for(const t of customTabs){
        let data;
        if(typeof activeCustomTabId !== 'undefined' && activeCustomTabId === t.id && activeCustomTabData){
          data = activeCustomTabData;
        } else {
          data = await storageGet(customTabKey(t.id));
        }
        customTabsBundle[t.id] = { name: t.name, data };
      }
    }
    const bundle = {
      exportedAt: new Date().toISOString(),
      planning: { people, daysIndex, days: allDays },
      customTabs: customTabsBundle
    };
    const blob = new Blob([JSON.stringify(bundle, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sauvegarde-complete-${todayIso()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setStatus('Sauvegarde complète prête', '');
    logChange('a fait une sauvegarde complète de tout l\u2019outil (Planning + tous les onglets)');
    setTimeout(() => { const s=document.getElementById('status'); if(s.textContent==='Sauvegarde complète prête') s.textContent=''; }, 2000);
  } catch(e){
    setStatus('Échec de la sauvegarde complète', 'error');
  }
}
document.getElementById('btnExportAll').addEventListener('click', exportEverything);

async function importData(e){
  const file = e.target.files[0];
  e.target.value = ''; // allow re-selecting the same file later
  if(!file) return;
  if(!isAdmin){
    alert("Réservé au superviseur. Clique d'abord sur \"🔒 Mode superviseur\" et entre le mot de passe.");
    return;
  }
  let bundle;
  try{
    const text = await file.text();
    bundle = JSON.parse(text);
  } catch(e){
    alert('Fichier JSON invalide.');
    return;
  }
  if(!bundle || !Array.isArray(bundle.people) || !Array.isArray(bundle.daysIndex) || typeof bundle.days !== 'object'){
    alert('Ce fichier ne correspond pas au format attendu (people, daysIndex, days).');
    return;
  }
  if(!confirm(`Importer ce fichier va REMPLACER toutes les données actuelles pour toute l'équipe (${bundle.daysIndex.length} jour(s), ${bundle.people.length} personne(s)). Continuer ?`)) return;

  setStatus('Import en cours…', 'saving');
  try{
    Object.keys(dayCache).forEach(k => delete dayCache[k]);
    people = bundle.people;
    daysIndex = [...bundle.daysIndex].sort();
    await persistPeople();
    await persistIndex();
    for(const d of daysIndex){
      const dayPayload = bundle.days[d] || {tasks: []};
      setDayCache(d, dayPayload);
      await storageSet(dayKey(d), dayPayload);
    }
    currentDate = latestDayDate();
    if(currentDate){
      dayData = await loadDayData(currentDate, {force:true});
      attachDayListener(currentDate);
    }
    renderAll();
    setStatus('Import terminé', '');
    logChange(`a importé des données (${daysIndex.length} jour(s))`);
    setTimeout(() => { const s=document.getElementById('status'); if(s.textContent==='Import terminé') s.textContent=''; }, 1500);
  } catch(err){
    setStatus('Échec de l\u2019import', 'error');
  }
}

/* ==========================================================================
   ONGLETS PERSONNALISÉS (comme des feuilles Excel en plus du Planning)
   ========================================================================== */
init();
