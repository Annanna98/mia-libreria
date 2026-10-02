import { normalizeIsbn, isLikelyIsbn } from './book-api.js';

let nativeStream=null,nativeTimer=null,zxingControls=null,lastCode='',lastTime=0;

function accepted(raw){
  const code=normalizeIsbn(raw);
  if(!isLikelyIsbn(code)) return null;
  const now=Date.now();
  if(code===lastCode && now-lastTime<1800) return null;
  lastCode=code;lastTime=now;return code;
}
async function startNative(video,onCode){
  if(!('BarcodeDetector' in window)) throw new Error('BarcodeDetector unavailable');
  const supported=await window.BarcodeDetector.getSupportedFormats();
  if(!supported.includes('ean_13') && !supported.includes('ean_8')) throw new Error('EAN unsupported');
  const detector=new window.BarcodeDetector({formats:['ean_13','ean_8']});
  nativeStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080}},audio:false});
  video.srcObject=nativeStream;await video.play();
  nativeTimer=setInterval(async()=>{
    if(video.readyState<2)return;
    try{
      const codes=await detector.detect(video);
      const code=codes[0]?.rawValue && accepted(codes[0].rawValue);
      if(code)onCode(code);
    }catch{}
  },280);
}
async function startZXing(video,onCode){
  const mod=await import('https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/+esm');
  const reader=new mod.BrowserMultiFormatReader(undefined,{delayBetweenScanAttempts:250,delayBetweenScanSuccess:1200});
  zxingControls=await reader.decodeFromVideoDevice(undefined,video,(result)=>{
    if(!result)return;
    const code=accepted(result.getText());
    if(code)onCode(code);
  });
}
export async function startScanner(video,onCode,onStatus=()=>{}){
  stopScanner();
  if(!navigator.mediaDevices?.getUserMedia) throw new Error('Fotocamera non supportata');
  onStatus('Avvio fotocamera…');
  try{await startNative(video,onCode);onStatus('Inquadra il codice ISBN nel riquadro')}
  catch{stopScanner();onStatus('Avvio scanner compatibile…');await startZXing(video,onCode);onStatus('Inquadra il codice ISBN nel riquadro')}
}
export function stopScanner(){
  if(nativeTimer){clearInterval(nativeTimer);nativeTimer=null}
  if(nativeStream){nativeStream.getTracks().forEach(t=>t.stop());nativeStream=null}
  if(zxingControls){try{zxingControls.stop()}catch{}zxingControls=null}
}