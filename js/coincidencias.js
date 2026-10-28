import {regionEtiqueta,colorEtiqueta,evaluarComparacion} from './etiqueta.js';
import {detectar,recortarBotella} from './detector.js';
let cargando=null;
const cache=new Map();
export function cargarIdentificador(){
  if(!cargando)cargando=(async()=>{
    const tf=globalThis.tf;
    const base=await tf.loadLayersModel(new URL('../modelo/identificador/model.json',import.meta.url).href);
    try{return tf.model({inputs:base.inputs,outputs:base.getLayer('conv_pw_13_relu').output});}
    catch(error){base.dispose();throw error;}
  })().catch(error=>{cargando=null;throw error;});
  return cargando;
}
export function similitud(a,b){
  if(!a.length||a.length!==b.length)return 0;
  let dot=0,aa=0,bb=0;
  for(let i=0;i<a.length;i++){dot+=a[i]*b[i];aa+=a[i]*a[i];bb+=b[i]*b[i];}
  return aa&&bb?Math.max(-1,Math.min(1,dot/Math.sqrt(aa*bb))):0;
}
async function descriptor(fuente){
  const modelo=await cargarIdentificador(),tf=globalThis.tf;
  const canvas=document.createElement('canvas');canvas.width=canvas.height=224;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  ctx.drawImage(fuente,0,0,224,224);
  const rgba=ctx.getImageData(0,0,224,224).data;
  const region=regionEtiqueta(rgba,224,224);
  const etiqueta=document.createElement('canvas');etiqueta.width=etiqueta.height=224;
  etiqueta.getContext('2d').drawImage(canvas,region.x,region.y,region.w,region.h,0,0,224,224);
  const tensor=tf.tidy(()=>{
    const imagen=tf.stack([tf.browser.fromPixels(canvas),tf.browser.fromPixels(etiqueta)]).toFloat().div(127.5).sub(1);
    return modelo.predict(imagen).mean([1,2]);
  });
  try{
    const datos=Array.from(await tensor.data()),dimension=datos.length/2;
    const muestra=document.createElement('canvas');muestra.width=muestra.height=32;
    const ctxMini=muestra.getContext('2d',{willReadFrequently:true});ctxMini.drawImage(canvas,0,0,32,32);
    return {envase:datos.slice(0,dimension),etiqueta:datos.slice(dimension),color:colorEtiqueta(rgba,224,region),visible:region.visible,pixeles:Array.from(ctxMini.getImageData(0,0,32,32).data)};
  }finally{tensor.dispose();}
}
function leerFoto(foto){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('No se pudo abrir una foto de referencia.'));img.src=foto;});}
async function referencia(foto,detector){
  if(!cache.has(foto))cache.set(foto,(async()=>{
    const imagen=await leerFoto(foto);
    // Conservar la referencia original: una captura guardada puede estar ya recortada.
    const variantes=[await descriptor(imagen)];
    if(detector){const resultado=await detectar(detector,imagen,false);if(resultado.cajas.length===1)variantes.push(await descriptor(recortarBotella(resultado.canvas,resultado.cajas)));}
    return variantes;
  })().catch(error=>{cache.delete(foto);throw error;}));
  return cache.get(foto);
}
export async function buscarCoincidencias(foto,productos,detector,fotoOriginal=null){
  const entradas=[await descriptor(await leerFoto(foto))];
  if(fotoOriginal&&fotoOriginal!==foto)entradas.push(await descriptor(await leerFoto(fotoOriginal)));
  const resultados=[];
  const vigentes=new Set();
  for(const producto of productos){
    const fotos=[...new Set([producto.foto,...(producto.fotos||[])].filter(Boolean))];
    let mejor=null;
    for(const ref of fotos){vigentes.add(ref);try{const variantes=await referencia(ref,detector);
      for(const entrada of entradas)for(const variante of variantes){
        const resultado=evaluarComparacion(entrada,variante,similitud);
        if(!mejor||resultado.compatible&&!mejor.compatible||resultado.compatible===mejor.compatible&&resultado.puntaje>mejor.puntaje)mejor=resultado;
      }}catch{/* Una foto dañada no invalida las otras referencias. */}}
    if(mejor)resultados.push({producto,...mejor});
  }
  for(const clave of cache.keys())if(!vigentes.has(clave))cache.delete(clave);
  if(productos.length&&!resultados.length)throw new Error("No se pudo procesar ninguna foto de referencia.");
  return resultados.sort((a,b)=>b.puntaje-a.puntaje);
}
// Puntaje combinado de envase, etiqueta y color; exige compatibilidad y margen.
// La similitud no es probabilidad de acierto ni lectura del volumen.
export function elegirSugerencia(resultados){
  const exactos=resultados.filter(r=>r.mismaImagen);
  if(exactos.length)return exactos.length===1?exactos[0]:null;
  const [a,b]=resultados;
  return a&&a.compatible&&a.puntaje>=.80&&(!b||a.puntaje-b.puntaje>=.08)?a:null;
}
