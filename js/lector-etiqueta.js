import {cargarScript} from './detector.js';
import {regionEtiqueta} from './etiqueta.js';
import {volumenesTexto,leerTSV} from './texto-producto.js';
let promesa=null,cola=Promise.resolve();
async function worker(){
  if(!promesa)promesa=(async()=>{
    const base=new URL('../vendor/ocr/',import.meta.url);
    await cargarScript(new URL('tesseract.min.js',base).href,()=>Boolean(globalThis.Tesseract));
    const lector=await globalThis.Tesseract.createWorker('eng',1,{workerPath:new URL('worker.min.js',base).href,corePath:base.href,langPath:base.href,workerBlobURL:false});
    await lector.setParameters({tessedit_pageseg_mode:'6',user_defined_dpi:'150'});return lector;
  })().catch(error=>{promesa=null;throw error;});
  return promesa;
}
function imagenDe(foto){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('No se pudo abrir la etiqueta.'));img.src=foto;});}
async function procesar(foto){
  const imagen=await imagenDe(foto),lector=await worker();
  const mini=document.createElement('canvas');mini.width=mini.height=224;const ctx=mini.getContext('2d',{willReadFrequently:true});ctx.drawImage(imagen,0,0,224,224);
  const region=regionEtiqueta(ctx.getImageData(0,0,224,224).data,224,224);
  const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=Math.max(200,Math.round(imagen.naturalHeight*region.h/224*1200/imagen.naturalWidth))+60;
  const c=canvas.getContext('2d',{willReadFrequently:true});c.fillStyle='#fff';c.fillRect(0,0,canvas.width,canvas.height);
  c.drawImage(imagen,0,imagen.naturalHeight*region.y/224,imagen.naturalWidth,imagen.naturalHeight*region.h/224,30,30,1140,canvas.height-60);
  const textos=[];
  const original=c.getImageData(0,0,canvas.width,canvas.height);
  for(const modo of ["color","claro","oscuro"]){
    c.putImageData(original,0,0);
    if(modo!=="color"){const data=c.getImageData(0,0,canvas.width,canvas.height);for(let i=0;i<data.data.length;i+=4){const gris=.299*data.data[i]+.587*data.data[i+1]+.114*data.data[i+2],v=modo==="claro"?(gris>190?0:255):(data.data[i+1]<130?0:255);data.data[i]=data.data[i+1]=data.data[i+2]=v;}c.putImageData(data,0,0);}
    for(const segmentacion of ['11','6']){
      await lector.setParameters({tessedit_pageseg_mode:segmentacion,user_defined_dpi:segmentacion==='11'?'0':'150'});
      const resultado=await lector.recognize(canvas.toDataURL('image/png'),{}, {text:true,tsv:true});
      textos.push(leerTSV(resultado.data.tsv));
    }
  }
  const texto=textos.join(' ').trim();return {texto,volumenes:volumenesTexto(texto)};
}
export function leerEtiqueta(foto){
  const tarea=cola.then(()=>procesar(foto));cola=tarea.catch(()=>{});return tarea;
}

export async function recortarParaLectura(foto,camara,cajas){
  if(!foto)return null;const imagen=await imagenDe(foto);
  const w=imagen.naturalWidth,h=imagen.naturalHeight;
  let sx=0,sy=0,sw=w,sh=h;
  if(cajas.length===1){
    const [x,y,bw,bh]=cajas[0].bbox;
    if(camara){const lado=Math.min(w,h);sx=(w-lado)/2+x*lado/640;sy=(h-lado)/2+y*lado/640;sw=bw*lado/640;sh=bh*lado/640;}
    else {const escala=Math.min(640/w,640/h);sx=(x-(640-w*escala)/2)/escala;sy=(y-(640-h*escala)/2)/escala;sw=bw/escala;sh=bh/escala;}
  }
  sx=Math.max(0,sx);sy=Math.max(0,sy);sw=Math.min(w-sx,sw);sh=Math.min(h-sy,sh);
  if(sw<=0||sh<=0)return foto;
  const canvas=document.createElement('canvas');const escala=Math.min(2,1200/sw);
  canvas.width=Math.max(1,Math.round(sw*escala));canvas.height=Math.max(1,Math.round(sh*escala));
  canvas.getContext('2d').drawImage(imagen,sx,sy,sw,sh,0,0,canvas.width,canvas.height);
  return canvas.toDataURL('image/png');
}
