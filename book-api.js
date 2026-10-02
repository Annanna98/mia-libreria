const OL='https://openlibrary.org';

export function normalizeIsbn(value=''){
  return String(value).toUpperCase().replace(/[^0-9X]/g,'');
}

export function isLikelyIsbn(value){
  const v=normalizeIsbn(value);
  return v.length===10 || v.length===13;
}

async function safeJson(url){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),8000);
  try{
    const r=await fetch(url,{signal:controller.signal,headers:{Accept:'application/json'}});
    if(!r.ok)return null;
    return await r.json();
  }catch{return null}finally{clearTimeout(timer)}
}

export async function lookupBookByIsbn(rawIsbn){
  const isbn=normalizeIsbn(rawIsbn);
  if(!isLikelyIsbn(isbn)) return null;
  const edition=await safeJson(`${OL}/isbn/${encodeURIComponent(isbn)}.json`);
  if(!edition)return null;

  let authorNames=[];
  if(Array.isArray(edition.authors)){
    const limited=edition.authors.slice(0,4);
    authorNames=(await Promise.all(limited.map(async a=>{
      if(!a?.key)return null;
      const data=await safeJson(`${OL}${a.key}.json`);
      return data?.name || null;
    }))).filter(Boolean);
  }

  const publishDate=edition.publish_date || '';
  const year=(publishDate.match(/\b(1[5-9]\d{2}|20\d{2}|21\d{2})\b/)||[])[0] || '';
  const publishers=Array.isArray(edition.publishers)?edition.publishers.join(', '):'';
  const cover=`https://covers.openlibrary.org/b/isbn/${encodeURIComponent(isbn)}-M.jpg?default=false`;

  return {isbn,title:edition.title || '',author:authorNames.join(', '),publisher:publishers,year,cover,source:'Open Library'};
}