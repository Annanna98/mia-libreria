import {getAllBooks,findByIsbn,saveBook,deleteBook,bulkSaveBooks} from './db.js?v=4';
import {lookupBookByIsbn,normalizeIsbn,isLikelyIsbn} from './book-api.js?v=4';
import {startScanner,stopScanner} from './scanner.js?v=4';

const $=s=>document.querySelector(s);const $$=s=>[...document.querySelectorAll(s)];
const els={
  home:$('#homeView'),stats:$('#statsView'),grid:$('#bookGrid'),empty:$('#emptyState'),search:$('#searchInput'),filter:$('#filterPanel'),sort:$('#sortSelect'),
  scanner:$('#scannerDialog'),video:$('#scannerVideo'),cameraMessage:$('#cameraMessage'),rapid:$('#rapidMode'),isbnInput:$('#isbnInput'),
  bookDialog:$('#bookDialog'),bookForm:$('#bookForm'),toast:$('#toast')
};
let books=[];let activeFilter='all';let scannerBusy=false;let installPrompt=null;

function uid(){return (crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`)}
function esc(v=''){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function statusLabel(s){return ({unread:'Da leggere',reading:'In lettura',read:'Letto'})[s]||'Da leggere'}
function toast(message,type='ok'){els.toast.textContent=message;els.toast.className=`toast ${type} show`;clearTimeout(toast.t);toast.t=setTimeout(()=>els.toast.classList.remove('show'),2300)}

async function refresh(){books=await getAllBooks();render();renderStats()}
function filteredBooks(){
  const q=els.search.value.trim().toLowerCase();
  let list=books.filter(b=>activeFilter==='all'||b.status===activeFilter).filter(b=>!q||[b.title,b.author,b.isbn].some(x=>String(x||'').toLowerCase().includes(q)));
  if(els.sort.value==='title-asc')list.sort((a,b)=>(a.title||'').localeCompare(b.title||'','it'));
  else if(els.sort.value==='author-asc')list.sort((a,b)=>(a.author||'').localeCompare(b.author||'','it'));
  else list.sort((a,b)=>(b.addedAt||'').localeCompare(a.addedAt||''));
  return list;
}
function render(){
  const list=filteredBooks();
  $('#bookCountHero').textContent=`${books.length} ${books.length===1?'libro':'libri'}`;
  const read=books.filter(b=>b.status==='read').length;$('#readingStats').textContent=books.length?`${read} letti · ${books.length-read} da esplorare`:'Inizia scansionando il primo libro';
  els.empty.classList.toggle('hidden',books.length>0 || els.search.value || activeFilter!=='all');
  els.grid.innerHTML=list.map(b=>`<article class="book-card" data-id="${esc(b.id)}">
    <div class="book-cover">${b.cover?`<img src="${esc(b.cover)}" alt="Copertina di ${esc(b.title)}" loading="lazy" onerror="this.style.display='none'">`:''}<div class="fallback">▤</div><span class="status-dot">${esc(statusLabel(b.status))}</span></div>
    <div class="book-meta"><h3>${esc(b.title||'Senza titolo')}</h3><p>${esc(b.author||'Autore non indicato')}</p></div></article>`).join('');
  $$('.book-card').forEach(card=>card.addEventListener('click',()=>openEdit(card.dataset.id)));
}
function renderStats(){
  $('#statTotal').textContent=books.length;$('#statRead').textContent=books.filter(b=>b.status==='read').length;$('#statUnread').textContent=books.filter(b=>b.status==='unread').length;
  $('#statAuthors').textContent=new Set(books.flatMap(b=>(b.author||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean))).size;
}
function switchView(name){
  const home=name==='home';els.home.classList.toggle('active',home);els.stats.classList.toggle('active',!home);$('#pageTitle').textContent=home?'I miei libri':'Gestisci libreria';
  $$('.nav-item').forEach(x=>x.classList.toggle('active',x.dataset.view===name));
}

async function openScanner(){
  if(!window.isSecureContext && location.hostname!=='localhost'){toast('Per usare la fotocamera apri l’app tramite HTTPS.','warn');return}
  els.scanner.showModal();els.isbnInput.value='';scannerBusy=false;
  try{await startScanner(els.video,handleScannedCode,m=>els.cameraMessage.textContent=m)}
  catch(e){els.cameraMessage.textContent='Non riesco ad accedere alla fotocamera. Puoi inserire l’ISBN qui sotto.';toast('Fotocamera non disponibile: usa l’inserimento ISBN.','warn')}
}
function closeScanner(){stopScanner();if(els.scanner.open)els.scanner.close();scannerBusy=false}

async function handleScannedCode(code){
  if(scannerBusy)return;scannerBusy=true;
  if(navigator.vibrate)navigator.vibrate(80);
  els.cameraMessage.textContent=`ISBN ${code} rilevato…`;
  const existing=await findByIsbn(code);
  if(existing){
    toast(`✓ Ce l’hai già: ${existing.title||code}`,'warn');
    els.cameraMessage.textContent=`Già presente: ${existing.title||code}`;
    scannerBusy=false;return;
  }
  els.cameraMessage.textContent='Cerco titolo e autore…';
  const data=await lookupBookByIsbn(code);
  if(data){ els.cameraMessage.textContent=`Trovato: ${data.title}${data.source?` · ${data.source}`:''}`; }
  else { els.cameraMessage.textContent='ISBN letto, ma nessun catalogo ha restituito i dati del libro.'; toast('ISBN letto, ma non trovato nei cataloghi online.','warn'); }
  const sameTitle=data?findPossibleDuplicate(data.title,data.author):null;
  if(data && els.rapid.checked && !sameTitle){
    const book={...data,id:uid(),status:'unread',location:'',notes:'',addedAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
    await saveBook(book);await refresh();toast(`✓ Aggiunto: ${book.title||code}`);els.cameraMessage.textContent='Aggiunto. Inquadra il prossimo libro';scannerBusy=false;return;
  }
  stopScanner();
  if(sameTitle) toast(`⚠️ Hai già un'altra edizione di ${sameTitle.title}`,'warn');
  openBookForm(data||{isbn:code,title:'',author:'',publisher:'',year:'',cover:''},false);
  scannerBusy=false;
}

async function lookupManualIsbn(){
  const isbn=normalizeIsbn(els.isbnInput.value);if(!isLikelyIsbn(isbn)){toast('Inserisci un ISBN di 10 o 13 cifre.','warn');return}
  await handleScannedCode(isbn);
}

function setCover(url){
  $('#formCover').value=url||'';const img=$('#formCoverPreview');const ph=$('#coverPlaceholder');
  if(url){img.src=url;img.style.display='block';ph.style.display='grid';img.onerror=()=>{img.style.display='none'}}else{img.removeAttribute('src');img.style.display='none'}
}
function fillForm(data={}){
  $('#formId').value=data.id||'';$('#formIsbn').value=data.isbn||'';$('#formTitle').value=data.title||'';$('#formAuthor').value=data.author||'';$('#formPublisher').value=data.publisher||'';$('#formYear').value=data.year||'';$('#formStatus').value=data.status||'unread';$('#formLocation').value=data.location||'';$('#formNotes').value=data.notes||'';setCover(data.cover||'');
}
function findPossibleDuplicate(title,author,excludeId=''){
  const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu,'').replace(/[^a-z0-9]+/g,' ').trim();
  const t=norm(title);if(t.length<4)return null;const a=norm(author);
  return books.find(b=>b.id!==excludeId && norm(b.title)===t && (!a || !norm(b.author) || norm(b.author)===a));
}
function updateDuplicateWarning(){
  const id=$('#formId').value;const dup=findPossibleDuplicate($('#formTitle').value,$('#formAuthor').value,id);const box=$('#possibleDuplicate');
  if(dup){box.innerHTML=`⚠️ Potresti già possedere questo titolo: <strong>${esc(dup.title)}</strong>${dup.isbn?` (ISBN ${esc(dup.isbn)})`:''}. Puoi comunque salvarlo se è un’altra edizione.`;box.classList.remove('hidden')}else box.classList.add('hidden');
}
function openBookForm(data={},editing=false){
  fillForm(data);$('#bookDialogKicker').textContent=editing?'DETTAGLI LIBRO':'NUOVO LIBRO';$('#bookDialogTitle').textContent=editing?'Modifica libro':'Aggiungi alla libreria';$('#deleteBookBtn').classList.toggle('hidden',!editing);updateDuplicateWarning();els.bookDialog.showModal();
}
function closeBookForm(){if(els.bookDialog.open)els.bookDialog.close();if(els.scanner.open && !els.video.srcObject){try{startScanner(els.video,handleScannedCode,m=>els.cameraMessage.textContent=m)}catch{}}}
async function openEdit(id){const b=books.find(x=>x.id===id);if(b)openBookForm(b,true)}

async function submitBook(e){
  e.preventDefault();const fd=new FormData(els.bookForm);const id=String(fd.get('id')||'')||uid();const isbn=normalizeIsbn(fd.get('isbn'));
  if(isbn){const existing=await findByIsbn(isbn);if(existing&&existing.id!==id){toast(`Questo ISBN è già presente: ${existing.title}`,'warn');return}}
  const old=books.find(x=>x.id===id);
  const book={id,isbn,title:String(fd.get('title')||'').trim(),author:String(fd.get('author')||'').trim(),publisher:String(fd.get('publisher')||'').trim(),year:String(fd.get('year')||'').trim(),status:String(fd.get('status')||'unread'),location:String(fd.get('location')||'').trim(),notes:String(fd.get('notes')||'').trim(),cover:String(fd.get('cover')||''),addedAt:old?.addedAt||new Date().toISOString(),updatedAt:new Date().toISOString()};
  await saveBook(book);els.bookDialog.close();await refresh();toast(old?'Modifiche salvate':'Libro aggiunto alla libreria');
}
async function removeCurrentBook(){const id=$('#formId').value;if(!id)return;if(!confirm('Eliminare questo libro dalla libreria?'))return;await deleteBook(id);els.bookDialog.close();await refresh();toast('Libro eliminato')}

function exportBackup(){
  const payload={app:'mia-libreria',version:1,exportedAt:new Date().toISOString(),books};const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`mia-libreria-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(a.href);toast('Backup esportato')
}
async function importBackup(file){
  try{const data=JSON.parse(await file.text());const incoming=Array.isArray(data)?data:data.books;if(!Array.isArray(incoming))throw new Error();const cleaned=incoming.filter(b=>b&&b.id&&b.title).map(b=>({...b,updatedAt:b.updatedAt||new Date().toISOString()}));await bulkSaveBooks(cleaned);await refresh();toast(`${cleaned.length} libri importati`)}catch{toast('Backup non valido.','error')}
}

$$('[data-action="scan"]').forEach(b=>b.addEventListener('click',openScanner));
$$('.nav-item').forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.view)));
$('#closeScannerBtn').addEventListener('click',closeScanner);els.scanner.addEventListener('close',stopScanner);$('#lookupIsbnBtn').addEventListener('click',lookupManualIsbn);els.isbnInput.addEventListener('keydown',e=>{if(e.key==='Enter')lookupManualIsbn()});
$('#closeBookBtn').addEventListener('click',()=>els.bookDialog.close());els.bookForm.addEventListener('submit',submitBook);$('#deleteBookBtn').addEventListener('click',removeCurrentBook);$('#manualAddBtn').addEventListener('click',()=>openBookForm({},false));
['input','change'].forEach(ev=>{els.search.addEventListener(ev,render);els.sort.addEventListener(ev,render)});$('#filterBtn').addEventListener('click',()=>els.filter.classList.toggle('hidden'));$$('.chip').forEach(c=>c.addEventListener('click',()=>{activeFilter=c.dataset.filter;$$('.chip').forEach(x=>x.classList.toggle('active',x===c));render()}));
['input','change'].forEach(ev=>{$('#formTitle').addEventListener(ev,updateDuplicateWarning);$('#formAuthor').addEventListener(ev,updateDuplicateWarning)});$('#exportBtn').addEventListener('click',exportBackup);$('#importInput').addEventListener('change',e=>e.target.files[0]&&importBackup(e.target.files[0]));

window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;$('#installBtn').classList.remove('hidden')});$('#installBtn').addEventListener('click',async()=>{if(!installPrompt)return;await installPrompt.prompt();installPrompt=null;$('#installBtn').classList.add('hidden')});
if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
refresh();
