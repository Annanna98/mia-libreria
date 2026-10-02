const DB_NAME = 'mia-libreria-db';
const DB_VERSION = 1;
const STORE = 'books';

function openDb(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,DB_VERSION);
    req.onerror=()=>reject(req.error);
    req.onupgradeneeded=()=>{
      const db=req.result;
      if(!db.objectStoreNames.contains(STORE)){
        const store=db.createObjectStore(STORE,{keyPath:'id'});
        store.createIndex('isbn','isbn',{unique:false});
        store.createIndex('addedAt','addedAt',{unique:false});
      }
    };
    req.onsuccess=()=>resolve(req.result);
  });
}
function request(req){return new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
export async function getAllBooks(){const db=await openDb();try{return await request(db.transaction(STORE,'readonly').objectStore(STORE).getAll())}finally{db.close()}}
export async function getBook(id){const db=await openDb();try{return await request(db.transaction(STORE,'readonly').objectStore(STORE).get(id))}finally{db.close()}}
export async function findByIsbn(isbn){const db=await openDb();try{return await request(db.transaction(STORE,'readonly').objectStore(STORE).index('isbn').get(isbn))}finally{db.close()}}
export async function saveBook(book){const db=await openDb();try{await request(db.transaction(STORE,'readwrite').objectStore(STORE).put(book));return book}finally{db.close()}}
export async function deleteBook(id){const db=await openDb();try{return await request(db.transaction(STORE,'readwrite').objectStore(STORE).delete(id))}finally{db.close()}}
export async function bulkSaveBooks(books){
  const db=await openDb();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,'readwrite');const store=tx.objectStore(STORE);
    books.forEach(b=>store.put(b));
    tx.oncomplete=()=>{db.close();resolve()};
    tx.onerror=()=>{db.close();reject(tx.error)};
  });
}