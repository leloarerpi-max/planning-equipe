/* ==========================================================================
   impaye.js — encart « Suivi impayé » de l'onglet Planning.
   Chargé EN DERNIER (voir index.html) : s'il manquait ou plantait, le reste
   du site continuerait de fonctionner.
   Données : une seule liste partagée (clé Firebase 'po:impaye'), sous la forme
   { rows: [ { id, date:'AAAA-MM-JJ', count:Nombre|'', done:true|false } ] }.
   Chaque modification (ajout, changement d'un champ, statut, suppression) est une
   TRANSACTION Firebase portant sur UNE ligne : deux personnes peuvent saisir en
   même temps sans s'écraser.
   ========================================================================== */
(function(){
  const IMPAYE_KEY = 'po:impaye';
  let impaye = { rows: [] };
  let loaded = false;
  let dirty = false; // une mise à jour est arrivée pendant une saisie : on l'affichera après

  const card = document.getElementById('impayeCard');
  if(!card) return;

  /* --- style (reprend les couleurs du site) ------------------------------ */
  const st = document.createElement('style');
  st.textContent = `
    .impaye-card{ margin-top:22px; max-width:440px; }
    .impaye-head{ display:flex; align-items:baseline; justify-content:space-between; gap:10px; flex-wrap:wrap; margin-bottom:8px; }
    .impaye-head h2{ font-family:'Fraunces', Georgia, serif; font-weight:600; font-size:19px; margin:0; }
    .impaye-actions{ display:flex; gap:6px; align-items:center; }
    .impaye-table{ width:100%; border-collapse:collapse; background:var(--panel); border:2px solid var(--ink); }
    .impaye-table td{ border:1px solid var(--ink); padding:0; height:34px; text-align:center; }
    .impaye-table input{ width:100%; height:32px; border:none; background:transparent; text-align:center; font:inherit; color:inherit; padding:0 4px; }
    .impaye-table input:focus{ outline:2px solid var(--violet); outline-offset:-2px; background:#fff; }
    .impaye-first td{ background:var(--ochre-bg); }
    .impaye-status{ width:100%; height:32px; border:none; background:transparent; font:inherit; font-weight:600; letter-spacing:.3px; cursor:pointer; color:var(--ink); }
    .impaye-status:hover{ background:var(--teal-bg); }
    .impaye-status:empty::after{ content:'·'; color:var(--line-strong); }
    td.impaye-x{ width:26px; border:none !important; background:transparent !important; }
    .impaye-x button{ border:none; background:none; color:var(--ink-soft); cursor:pointer; opacity:0; font-size:13px; }
    .impaye-table tr:hover .impaye-x button{ opacity:.8; }
    .impaye-x button:hover{ color:var(--danger); opacity:1; }
    .impaye-total td{ background:var(--teal-bg); font-weight:600; }
    .impaye-total td:first-child{ letter-spacing:.2px; }
    .impaye-empty td{ color:var(--ink-soft); font-size:13px; padding:10px; }
    @media (max-width:520px){ .impaye-x button{ opacity:.6; } }
  `;
  document.head.appendChild(st);

  /* --- utilitaires -------------------------------------------------------- */
  function norm(v){
    const rows = (v && Array.isArray(v.rows)) ? v.rows : [];
    return { rows: rows.filter(r => r && r.id).map(r => ({
      id: r.id,
      date: r.date || '',
      count: (r.count === '' || r.count == null) ? '' : (Number(r.count) || 0),
      done: !!r.done
    })) };
  }
  function todayLocalIso(){
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  }
  function frDate(iso){ const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); return m ? `${m[3]}/${m[2]}` : '(sans date)'; }
  function total(){ return impaye.rows.reduce((s, r) => s + (Number(r.count) || 0), 0); }
  function inputFocusedInside(){
    const a = document.activeElement;
    return !!(a && card.contains(a) && a.tagName === 'INPUT');
  }

  /* --- affichage ---------------------------------------------------------- */
  function render(focusRowId){
    dirty = false;
    let body = '';
    if(!impaye.rows.length){
      body = `<tr class="impaye-empty"><td colspan="3">Aucune ligne. Clique sur « + Ajouter une ligne ».</td><td class="impaye-x"></td></tr>`;
    } else {
      body = impaye.rows.map((r, i) => `
        <tr data-id="${escapeHtml(r.id)}" class="${i === 0 ? 'impaye-first' : ''}">
          <td><input type="date" data-f="date" value="${escapeHtml(r.date)}" aria-label="Date"></td>
          <td><input type="number" min="0" step="1" data-f="count" value="${r.count === '' ? '' : r.count}" aria-label="Nombre d'impayés"></td>
          <td><button class="impaye-status" data-act="toggle" title="Cliquer pour marquer FAIT / retirer">${r.done ? 'FAIT' : ''}</button></td>
          <td class="impaye-x"><button data-act="del" title="Supprimer cette ligne" aria-label="Supprimer">✕</button></td>
        </tr>`).join('');
    }
    card.innerHTML = `
      <div class="impaye-head">
        <h2>Suivi impayé</h2>
        <div class="impaye-actions">
          <button class="btn" data-act="add">+ Ajouter une ligne</button>
          <button class="btn-ghost" data-act="clear" title="Réservé au superviseur">Vider</button>
        </div>
      </div>
      <table class="impaye-table"><tbody>
        ${body}
        <tr class="impaye-total"><td>TOTAL IMPAYÉ</td><td data-total>${total()}</td><td></td><td class="impaye-x"></td></tr>
      </tbody></table>`;
    if(focusRowId){
      const inp = card.querySelector(`tr[data-id="${CSS.escape(focusRowId)}"] input[data-f="count"]`);
      if(inp) inp.focus();
    }
  }
  function updateTotalOnly(){
    const t = card.querySelector('[data-total]');
    if(t) t.textContent = total();
  }
  function refreshIfIdle(focusRowId){
    if(inputFocusedInside() && !focusRowId){ dirty = true; updateTotalOnly(); return; }
    render(focusRowId);
  }
  card.addEventListener('focusout', () => {
    setTimeout(() => { if(dirty && !inputFocusedInside()) render(); }, 0);
  });

  /* --- écritures (transactions, une ligne à la fois) ---------------------- */
  let statusTimer = null;
  async function mutate(mutator, opts){
    opts = opts || {};
    setStatus('Enregistrement…', 'saving');
    try{
      const res = await storageTransaction(IMPAYE_KEY, cur => { const d = norm(cur); mutator(d); return d; });
      impaye = norm(res.value);
      loaded = true;
      refreshIfIdle(opts.focusRowId);
      setStatus('Enregistré', '');
      clearTimeout(statusTimer);
      statusTimer = setTimeout(() => { const s = document.getElementById('status'); if(s && s.textContent === 'Enregistré') s.textContent = ''; }, 1200);
      return true;
    } catch(e){
      setStatus("Échec de l'enregistrement — réessaie", 'error');
      return false;
    }
  }
  function findLocal(id){ return impaye.rows.find(r => r.id === id); }

  async function addRow(){
    ensureMyName();
    const row = { id: cryptoId(), date: todayLocalIso(), count: '', done: false };
    const ok = await mutate(d => { d.rows.push(row); }, { focusRowId: row.id });
    if(ok) logChange('a ajouté une ligne au suivi impayé');
  }
  async function setField(id, field, value){
    const before = findLocal(id);
    if(!before) return;
    const oldVal = before[field];
    if(oldVal === value) return;
    before[field] = value; // affichage immédiat du total
    updateTotalOnly();
    const ok = await mutate(d => { const r = d.rows.find(x => x.id === id); if(r) r[field] = value; });
    if(!ok){ const cur = findLocal(id); if(cur) cur[field] = oldVal; refreshIfIdle(); return; } // échec : on revient à la valeur d'avant plutôt que d'afficher une valeur non enregistrée
    {
      if(field === 'count') logChange(`suivi impayé : ligne du ${frDate(before.date)} → ${value === '' ? '(vide)' : value}`);
      if(field === 'date') logChange(`suivi impayé : date modifiée → ${frDate(value)}`);
    }
  }
  async function toggleDone(id){
    const r = findLocal(id);
    if(!r) return;
    const next = !r.done;
    const ok = await mutate(d => { const x = d.rows.find(y => y.id === id); if(x) x.done = next; });
    if(ok) logChange(`suivi impayé : ligne du ${frDate(r.date)} (${r.count === '' ? '—' : r.count}) ${next ? 'marquée FAIT' : 'remise à faire'}`);
  }
  async function deleteRow(id){
    const idx = impaye.rows.findIndex(r => r.id === id);
    if(idx < 0) return;
    const removed = {...impaye.rows[idx]};
    const ok = await mutate(d => { d.rows = d.rows.filter(r => r.id !== id); });
    if(!ok) return;
    logChange(`a supprimé une ligne du suivi impayé (${frDate(removed.date)}, ${removed.count === '' ? '—' : removed.count})`);
    showUndoToast('Ligne supprimée', async () => {
      await mutate(d => { if(!d.rows.some(r => r.id === removed.id)) d.rows.splice(Math.min(idx, d.rows.length), 0, removed); });
    });
  }
  async function clearAll(){
    if(!isAdmin){ alert("Réservé au superviseur. Clique d'abord sur \"🔒 Mode superviseur\" et entre le mot de passe."); return; }
    if(!impaye.rows.length) return;
    if(!confirm('Vider tout le tableau « Suivi impayé » ? (Tu pourras annuler pendant quelques secondes.)')) return;
    const backup = impaye.rows.map(r => ({...r}));
    const ok = await mutate(d => { d.rows = []; });
    if(!ok) return;
    logChange(`a vidé le suivi impayé (${backup.length} ligne(s))`);
    showUndoToast('Tableau vidé', async () => {
      await mutate(d => { backup.forEach(b => { if(!d.rows.some(r => r.id === b.id)) d.rows.push(b); }); });
    });
  }

  /* --- événements (délégation : le tableau est redessiné) ----------------- */
  card.addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if(!b) return;
    const act = b.dataset.act;
    const tr = b.closest('tr[data-id]');
    if(act === 'add') addRow();
    else if(act === 'clear') clearAll();
    else if(act === 'toggle' && tr) toggleDone(tr.dataset.id);
    else if(act === 'del' && tr) deleteRow(tr.dataset.id);
  });
  card.addEventListener('change', e => {
    const inp = e.target.closest('input[data-f]');
    const tr = e.target.closest('tr[data-id]');
    if(!inp || !tr) return;
    if(inp.dataset.f === 'count'){
      const v = inp.value === '' ? '' : Math.max(0, Math.round(Number(inp.value)) || 0);
      setField(tr.dataset.id, 'count', v);
    } else {
      setField(tr.dataset.id, 'date', inp.value);
    }
  });

  /* --- chargement + synchro temps réel ------------------------------------ */
  async function load(){
    try{
      const v = await storageGetStrict(IMPAYE_KEY); // erreur réseau => exception, jamais un tableau « vide » écrit par erreur
      impaye = norm(v);
      loaded = true;
      render();
    } catch(e){
      card.innerHTML = `<div class="empty-note">Suivi impayé : connexion impossible, rien n'a été modifié. <button class="btn" data-retry style="margin-left:8px;">Réessayer</button></div>`;
      const r = card.querySelector('[data-retry]');
      if(r) r.addEventListener('click', load);
      return;
    }
    fbDb.ref(dbPath(IMPAYE_KEY)).on('value', snap => {
      let fresh;
      try{ fresh = norm(snap.exists() && snap.val() ? JSON.parse(snap.val()) : null); } catch(e){ return; }
      if(JSON.stringify(fresh) === JSON.stringify(impaye)) return;
      impaye = fresh;
      refreshIfIdle();
    });
  }
  load();
})();
