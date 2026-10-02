import {getAllBooks,findByIsbn,saveBook,deleteBook,bulkSaveBooks} from './db.js?v=5';
import {normalizeIsbn,isValidBookIsbn,isbnIssue} from './book-api.js?v=5';
import {startScanner,stopScanner} from './scanner.js?v=5';

const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const els={
  list:$('#isbnList'),empty:$('#emptyState'),search:$('#searchInput'),
  scanner:$('#scannerDialog'),video:$('#scannerVideo'),cameraMessage:$('#cameraMessage'),
  isbnInput:$('#isbnInput'),toast:$('#toast'),sessionCount:$('#sessionCount')
};

let books=[];
let scannerBusy=false;
let installPrompt=null;
let sessionAdded=0;

function esc(v=''){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function toast(message,type='ok'){
  els.toast.textContent=message;
  els.toast.className=`toast ${type} show`;
  clearTimeout(toast.t);
  toast.t=setTimeout(()=>els.toast.classList.remove('show'),2200);
}
function beep(success=true){
  try{
    const Ctx=window.AudioContext||window.webkitAudioContext;
    const ctx=new Ctx(),osc=ctx.createOscillator(),gain=ctx.createGain();
    osc.frequency.value=success?880:220;gain.gain.value=.045;
    osc.connect(gain);gain.connect(ctx.destination);osc.start();
    setTimeout(()=>{osc.stop();ctx.close()},success?90:180);
  }catch{}
  if(navigator.vibrate) navigator.vibrate(success?60:[80,50,80]);
}
function uid(){return crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}

async function refresh(){
  books=(await getAllBooks()).filter(b=>b?.isbn);
  render();
}
function filtered(){
  const q=normalizeIsbn(els.search.value);
  return books
    .filter(b=>!q || normalizeIsbn(b.isbn).includes(q))
    .sort((a,b)=>(b.addedAt||'').localeCompare(a.addedAt||''));
}
function render(){
  const list=filtered();
  $('#bookCountHero').textContent=`${books.length} ${books.length===1?'ISBN':'ISBN'}`;
  $('#heroHint').textContent=books.length?'Pronti per essere esportati e completati':'Scansiona i libri uno dopo l’altro';
  els.empty.classList.toggle('hidden',books.length>0 || els.search.value);
  els.list.innerHTML=list.map((b,i)=>{
    const when=b.addedAt?new Date(b.addedAt).toLocaleString('it-IT',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'';
    return `<div class="isbn-row">
      <div class="isbn-index">${books.length-i}</div>
      <div class="isbn-code"><strong>${esc(b.isbn)}</strong><small>${esc(when)}</small></div>
      <button class="isbn-delete" data-id="${esc(b.id)}" aria-label="Elimina ISBN">×</button>
    </div>`;
  }).join('');
  $$('.isbn-delete').forEach(btn=>btn.addEventListener('click',async()=>{
    if(!confirm('Eliminare questo ISBN?'))return;
    await deleteBook(btn.dataset.id);await refresh();toast('ISBN eliminato');
  }));
}

async function openScanner(){
  if(!window.isSecureContext && location.hostname!=='localhost'){toast('Apri il sito tramite HTTPS per usare la fotocamera.','warn');return}
  sessionAdded=0;els.sessionCount.textContent='0';scannerBusy=false;els.isbnInput.value='';
  els.scanner.showModal();
  try{
    await startScanner(els.video,handleCode,m=>els.cameraMessage.textContent=m);
  }catch{
    els.cameraMessage.textContent='Fotocamera non disponibile. Puoi inserire l’ISBN qui sotto.';
    toast('Fotocamera non disponibile.','warn');
  }
}
function closeScanner(){stopScanner();if(els.scanner.open)els.scanner.close();scannerBusy=false}

async function saveCode(raw){
  const isbn=normalizeIsbn(raw);
  if(!isValidBookIsbn(isbn)){
    const msg=isbnIssue(isbn)||'Questo codice non è un ISBN valido.';
    els.cameraMessage.textContent=msg;
    toast(msg,'warn');beep(false);
    return false;
  }

  const existing=await findByIsbn(isbn);
  if(existing){
    els.cameraMessage.textContent=`Già scansionato ✓ · ${isbn}`;
    toast(`Già presente: ${isbn}`,'warn');beep(false);
    return false;
  }

  const now=new Date().toISOString();
  await saveBook({
    id:uid(),isbn,title:'',author:'',publisher:'',year:'',cover:'',
    status:'unread',location:'',notes:'',addedAt:now,updatedAt:now
  });
  sessionAdded++;els.sessionCount.textContent=String(sessionAdded);
  els.cameraMessage.textContent=`Salvato ✓ · ${isbn} · Inquadra il prossimo`;
  await refresh();toast(`✓ ISBN salvato: ${isbn}`);beep(true);
  return true;
}

async function handleCode(code){
  if(scannerBusy)return;
  scannerBusy=true;
  try{await saveCode(code)}finally{setTimeout(()=>{scannerBusy=false},500)}
}
async function manualSave(){
  const value=els.isbnInput.value;
  const ok=await saveCode(value);
  if(ok)els.isbnInput.value='';
}

function exportJson(){
  const unique=[...new Map(books.map(b=>[normalizeIsbn(b.isbn),b])).values()];
  const payload={
    app:'mia-libreria-isbn-collector',
    version:2,
    exportedAt:new Date().toISOString(),
    count:unique.length,
    isbns:unique.map(b=>({isbn:normalizeIsbn(b.isbn),scannedAt:b.addedAt||null}))
  };
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=`isbn-libreria-${new Date().toISOString().slice(0,10)}.json`;
  a.click();URL.revokeObjectURL(a.href);
  toast(`Esportati ${unique.length} ISBN`);
}

async function importJson(file){
  try{
    const data=JSON.parse(await file.text());
    let rows=[];
    if(Array.isArray(data)) rows=data;
    else if(Array.isArray(data.isbns)) rows=data.isbns;
    else if(Array.isArray(data.books)) rows=data.books;
    else throw new Error('format');

    const current=new Set(books.map(b=>normalizeIsbn(b.isbn)));
    const additions=[];
    for(const row of rows){
      const isbn=normalizeIsbn(typeof row==='string'?row:row?.isbn);
      if(!isValidBookIsbn(isbn) || current.has(isbn))continue;
      current.add(isbn);
      const now=(typeof row==='object' && (row.scannedAt||row.addedAt)) || new Date().toISOString();
      additions.push({id:uid(),isbn,title:'',author:'',publisher:'',year:'',cover:'',status:'unread',location:'',notes:'',addedAt:now,updatedAt:new Date().toISOString()});
    }
    if(additions.length)await bulkSaveBooks(additions);
    await refresh();toast(`Aggiunti ${additions.length} nuovi ISBN`);
  }catch{toast('JSON non valido.','error')}
}

$$('[data-action="scan"]').forEach(b=>b.addEventListener('click',openScanner));
$('#closeScannerBtn').addEventListener('click',closeScanner);
els.scanner.addEventListener('close',stopScanner);
$('#saveIsbnBtn').addEventListener('click',manualSave);
els.isbnInput.addEventListener('keydown',e=>{if(e.key==='Enter')manualSave()});
els.search.addEventListener('input',render);
$('#exportBtn').addEventListener('click',exportJson);
$('#importInput').addEventListener('change',e=>e.target.files[0]&&importJson(e.target.files[0]));

window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;$('#installBtn').classList.remove('hidden')});
$('#installBtn').addEventListener('click',async()=>{if(!installPrompt)return;await installPrompt.prompt();installPrompt=null;$('#installBtn').classList.add('hidden')});
if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));

refresh();
