export function normalizeIsbn(value=''){
  return String(value).toUpperCase().replace(/[^0-9X]/g,'');
}

// Usato dallo scanner per inoltrare al livello applicativo codici
// che potrebbero essere ISBN. La validazione definitiva avviene sotto.
export function isLikelyIsbn(value){
  const v=normalizeIsbn(value);
  return v.length===10 || v.length===13;
}

function validIsbn13(v){
  if(!/^\d{13}$/.test(v) || !/^(978|979)/.test(v)) return false;
  const sum=v.slice(0,12).split('').reduce((s,d,i)=>s+Number(d)*(i%2?3:1),0);
  const check=(10-(sum%10))%10;
  return check===Number(v[12]);
}

function validIsbn10(v){
  if(!/^\d{9}[\dX]$/.test(v)) return false;
  let sum=0;
  for(let i=0;i<10;i++){
    const n=(i===9 && v[i]==='X')?10:Number(v[i]);
    sum+=(10-i)*n;
  }
  return sum%11===0;
}

export function isValidBookIsbn(value){
  const v=normalizeIsbn(value);
  return v.length===13 ? validIsbn13(v) : v.length===10 ? validIsbn10(v) : false;
}

export function isbnIssue(value){
  const v=normalizeIsbn(value);
  if(v.length===13 && /^\d{13}$/.test(v) && !/^(978|979)/.test(v)){
    return 'Questo barcode è un EAN commerciale, non un ISBN (gli ISBN-13 iniziano con 978 o 979).';
  }
  if(v.length!==10 && v.length!==13) return 'Il codice non ha 10 o 13 caratteri.';
  if(!isValidBookIsbn(v)) return 'Il codice sembra un ISBN, ma la cifra di controllo non è valida. Riprova la scansione.';
  return '';
}