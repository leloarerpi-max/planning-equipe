/* ==========================================================================
   shared.js — utilitaires communs à TOUT le site (Planning + tous les
   onglets personnalisés). Modifier ce fichier peut affecter tous les onglets,
   donc changements à faire avec précaution. C'est ici qu'est la config
   Firebase et le mot de passe superviseur.
   ========================================================================== */

const ADMIN_PASSWORD = 'Superviseur2026';
let isAdmin = false;

/* ==========================================================================
   FIREBASE CONFIG — remplace les valeurs ci-dessous par celles de TON projet
   Firebase (Console Firebase > Paramètres du projet > Tes applications > Web).
   Ces valeurs ne sont pas secrètes : Firebase est prévu pour qu'elles soient
   visibles côté client. La vraie protection se fait via les "Règles" de la
   Realtime Database (voir les instructions fournies séparément).
   ========================================================================== */
const firebaseConfig = {
  apiKey: "AIzaSyAngj4fTn2CGCIhtUVS2gxb3IPL46wR3HI",
  authDomain: "planning-equipe-c32f4.firebaseapp.com",
  databaseURL: "https://planning-equipe-c32f4-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "planning-equipe-c32f4",
  storageBucket: "planning-equipe-c32f4.firebasestorage.app",
  messagingSenderId: "1076370313453",
  appId: "1:1076370313453:web:993d8bc81b7ab9f0f23ce4"
};
firebase.initializeApp(firebaseConfig);
const fbDb = firebase.database();
function dbPath(key){ return 'planningObjectif/' + String(key).replace(/[.#$\[\]\/]/g, '_'); }

/* --- Journal des modifications ------------------------------------------- */
let myName = '';
try{ myName = localStorage.getItem('po-my-name') || ''; } catch(e){ /* localStorage unavailable */ }
function ensureMyName(){
  if(myName) return myName;
  const n = prompt('Ton prénom (affiché dans le journal des modifications) :');
  if(n && n.trim()){
    myName = n.trim();
    try{ localStorage.setItem('po-my-name', myName); } catch(e){}
  }
  return myName || 'Quelqu\u2019un';
}
function changeMyName(){
  const n = prompt('Ton prénom (affiché dans le journal des modifications) :', myName || '');
  if(n === null) return;
  if(n.trim()){
    myName = n.trim();
    try{ localStorage.setItem('po-my-name', myName); } catch(e){}
    alert(`C'est noté, tu apparaîtras comme "${myName}" dans le journal à partir de maintenant.`);
  }
}
const btnChangeMyName = document.getElementById('btnChangeMyName');
if(btnChangeMyName) btnChangeMyName.addEventListener('click', changeMyName);
async function logChange(text){
  try{
    const name = myName || 'Quelqu\u2019un';
    await fbDb.ref(dbPath('po:changelog')).push({ ts: Date.now(), name, text });
    if(Math.random() < 0.08) trimChangelog(500); // ménage occasionnel en arrière-plan, best-effort
  } catch(e){ /* logging is best-effort, never blocks the app */ }
}
async function trimChangelog(maxEntries){
  try{
    const ref = fbDb.ref(dbPath('po:changelog'));
    const snap = await ref.orderByKey().once('value');
    const obj = snap.val();
    if(!obj) return;
    const keys = Object.keys(obj); // les clés générées par push() sont déjà dans l'ordre chronologique
    if(keys.length <= maxEntries) return;
    const toRemove = keys.slice(0, keys.length - maxEntries);
    const updates = {};
    toRemove.forEach(k => { updates[k] = null; });
    await ref.update(updates);
  } catch(e){ /* nettoyage best-effort, ne doit jamais bloquer l'app */ }
}
function fmtLogTime(ts){
  const d = new Date(ts);
  const dd = String(d.getDate()).padStart(2,'0'), mm = String(d.getMonth()+1).padStart(2,'0');
  const hh = String(d.getHours()).padStart(2,'0'), mi = String(d.getMinutes()).padStart(2,'0');
  return `${dd}/${mm} ${hh}:${mi}`;
}
function cryptoId(){ return 'id-' + Math.random().toString(36).slice(2,10) + Date.now().toString(36).slice(-4); }
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function setStatus(text, cls){ const el = document.getElementById('status'); el.textContent = text; el.className = 'status' + (cls ? ' '+cls : ''); }

let undoToastTimer = null;
function showUndoToast(message, onUndo){
  const old = document.getElementById('undoToast');
  if(old) old.remove();
  if(undoToastTimer) clearTimeout(undoToastTimer);
  const toast = document.createElement('div');
  toast.id = 'undoToast';
  toast.className = 'undo-toast';
  toast.innerHTML = `<span>${escapeHtml(message)}</span><button>Annuler</button>`;
  toast.querySelector('button').addEventListener('click', async () => {
    toast.remove();
    if(undoToastTimer) clearTimeout(undoToastTimer);
    await onUndo();
  });
  document.body.appendChild(toast);
  undoToastTimer = setTimeout(() => { toast.remove(); }, 7000);
}
async function storageGet(key){
  try{
    const snap = await fbDb.ref(dbPath(key)).get();
    if(!snap.exists()) return null;
    const raw = snap.val();
    return raw ? JSON.parse(raw) : null;
  } catch(e){ return null; }
}
async function storageSet(key, val){
  const attempts = [0, 400, 1200];
  for(let i=0; i<attempts.length; i++){
    if(attempts[i]) await new Promise(r => setTimeout(r, attempts[i]));
    try{
      await fbDb.ref(dbPath(key)).set(JSON.stringify(val));
      return true;
    } catch(e){ /* try again */ }
  }
  return false;
}
async function storageDelete(key){
  try{
    await fbDb.ref(dbPath(key)).remove();
    return true;
  } catch(e){ return false; }
}

document.getElementById('btnToggleAdmin').addEventListener('click', toggleAdmin);

function toggleAdmin(){
  if(isAdmin){
    isAdmin = false;
    setAdminButtonLabel();
    renderDayBar();
    renderTable();
    renderSummary();
    return;
  }
  const pw = prompt('Mot de passe superviseur :');
  if(pw === null) return;
  if(pw === ADMIN_PASSWORD){
    isAdmin = true;
    setAdminButtonLabel();
    renderDayBar();
    renderTable();
    renderSummary();
  } else {
    alert('Mot de passe incorrect.');
  }
}
function setAdminButtonLabel(){
  const btn = document.getElementById('btnToggleAdmin');
  if(btn) btn.textContent = isAdmin ? '🔓 Verrouiller les objectifs' : '🔒 Mode superviseur';
  const resetBtn = document.getElementById('btnResetAll');
  if(resetBtn){
    resetBtn.style.opacity = isAdmin ? '1' : '.45';
    resetBtn.title = isAdmin ? '' : 'Réservé au superviseur';
  }
}
