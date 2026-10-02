const OL='https://openlibrary.org';
const GOOGLE_BOOKS='https://www.googleapis.com/books/v1/volumes';

export function normalizeIsbn(value=''){
  return String(value).toUpperCase().replace(/[^0-9X]/g,'');
}

export function isLikelyIsbn(value){
  const v=normalizeIsbn(value);
  return v.length===10 || v.length===13;
}

async function safeJson(url, timeout=8000){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeout);
  try{
    const r=await fetch(url,{signal:controller.signal,headers:{Accept:'application/json'}});
    if(!r.ok)return null;
    return await r.json();
  }catch{return null}finally{clearTimeout(timer)}
}

function yearFrom(value=''){
  return (String(value).match(/\b(1[5-9]\d{2}|20\d{2}|21\d{2})\b/)||[])[0] || '';
}

function cleanCover(url=''){
  return String(url||'').replace(/^http:\/\//i,'https://');
}

async function fromGoogleBooks(isbn){
  const data=await safeJson(`${GOOGLE_BOOKS}?q=${encodeURIComponent('isbn:'+isbn)}&maxResults=5&printType=books`);
  if(!Array.isArray(data?.items) || !data.items.length)return null;

  const exact=data.items.find(item=>
    item?.volumeInfo?.industryIdentifiers?.some(x=>normalizeIsbn(x?.identifier)===isbn)
  );
  const item=exact || data.items[0];
  const v=item?.volumeInfo || {};
  if(!v.title)return null;

  return {
    isbn,
    title:v.title || '',
    author:Array.isArray(v.authors)?v.authors.join(', '):'',
    publisher:v.publisher || '',
    year:yearFrom(v.publishedDate),
    cover:cleanCover(v.imageLinks?.thumbnail || v.imageLinks?.smallThumbnail || ''),
    source:'Google Books'
  };
}

async function fromOpenLibrarySearch(isbn){
  const fields='title,author_name,publisher,first_publish_year,cover_i,isbn';
  const data=await safeJson(`${OL}/search.json?isbn=${encodeURIComponent(isbn)}&fields=${encodeURIComponent(fields)}&limit=3`);
  if(!Array.isArray(data?.docs) || !data.docs.length)return null;

  const exact=data.docs.find(d=>Array.isArray(d.isbn) && d.isbn.some(x=>normalizeIsbn(x)===isbn));
  const d=exact || data.docs[0];
  if(!d?.title)return null;

  return {
    isbn,
    title:d.title || '',
    author:Array.isArray(d.author_name)?d.author_name.join(', '):'',
    publisher:Array.isArray(d.publisher)?d.publisher.slice(0,3).join(', '):'',
    year:d.first_publish_year ? String(d.first_publish_year) : '',
    cover:d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : '',
    source:'Open Library'
  };
}

async function fromOpenLibraryEdition(isbn){
  const edition=await safeJson(`${OL}/isbn/${encodeURIComponent(isbn)}.json`);
  if(!edition?.title)return null;

  let authorNames=[];
  if(Array.isArray(edition.authors)){
    const limited=edition.authors.slice(0,4);
    authorNames=(await Promise.all(limited.map(async a=>{
      if(!a?.key)return null;
      const data=await safeJson(`${OL}${a.key}.json`,5000);
      return data?.name || null;
    }))).filter(Boolean);
  }

  return {
    isbn,
    title:edition.title || '',
    author:authorNames.join(', '),
    publisher:Array.isArray(edition.publishers)?edition.publishers.join(', '):'',
    year:yearFrom(edition.publish_date),
    cover:`https://covers.openlibrary.org/b/isbn/${encodeURIComponent(isbn)}-M.jpg?default=false`,
    source:'Open Library'
  };
}

function mergeRecords(primary, secondary){
  if(!primary)return secondary;
  if(!secondary)return primary;
  return {
    isbn:primary.isbn || secondary.isbn,
    title:primary.title || secondary.title || '',
    author:primary.author || secondary.author || '',
    publisher:primary.publisher || secondary.publisher || '',
    year:primary.year || secondary.year || '',
    cover:primary.cover || secondary.cover || '',
    source:[primary.source,secondary.source].filter(Boolean).filter((x,i,a)=>a.indexOf(x)===i).join(' + ')
  };
}

export async function lookupBookByIsbn(rawIsbn){
  const isbn=normalizeIsbn(rawIsbn);
  if(!isLikelyIsbn(isbn))return null;

  // Interroghiamo più cataloghi in parallelo: Google Books tende ad avere
  // una copertura migliore delle edizioni commerciali italiane, mentre
  // Open Library è un ottimo fallback e può completare campi mancanti.
  const [google,olSearch]=await Promise.all([
    fromGoogleBooks(isbn),
    fromOpenLibrarySearch(isbn)
  ]);

  let merged=mergeRecords(google,olSearch);

  // Se mancano ancora titolo/autore, proviamo anche l'endpoint edizione ISBN.
  if(!merged?.title || !merged?.author){
    const olEdition=await fromOpenLibraryEdition(isbn);
    merged=mergeRecords(merged,olEdition);
  }

  return merged?.title ? merged : null;
}
