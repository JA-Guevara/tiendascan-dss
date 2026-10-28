export function cargarScript(src, disponible) {
  if (disponible()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const timer = setTimeout(() => { script.remove(); reject(new Error("Tiempo de carga agotado: " + src)); }, 20000);
    script.src = src;
    script.onload = () => { clearTimeout(timer); disponible() ? resolve() : reject(new Error("Biblioteca no disponible.")); };
    script.onerror = () => { clearTimeout(timer); script.remove(); reject(new Error("No se pudo cargar " + src)); };
    document.head.append(script);
  });
}
export async function cargarDetector() {
  await cargarScript(new URL('../vendor/tf.min.js', import.meta.url).href, () => Boolean(globalThis.tf));
  await cargarScript(new URL('../vendor/coco-ssd.min.js', import.meta.url).href, () => Boolean(globalThis.cocoSsd));
  await globalThis.tf.ready();
  return globalThis.cocoSsd.load({base:'mobilenet_v2', modelUrl:new URL('../modelo/detector/model.json', import.meta.url).href});
}
export async function detectar(detector, fuente, camara) {
  const w = fuente.videoWidth || fuente.naturalWidth, h = fuente.videoHeight || fuente.naturalHeight;
  if (!w || !h) throw new Error('La imagen todavía no está lista.');
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 640;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#eef1f6'; ctx.fillRect(0,0,640,640);
  if (camara) { const lado=Math.min(w,h); ctx.drawImage(fuente,(w-lado)/2,(h-lado)/2,lado,lado,0,0,640,640); }
  else { const escala=Math.min(640/w,640/h); ctx.drawImage(fuente,(640-w*escala)/2,(640-h*escala)/2,w*escala,h*escala); }
  const inicio=performance.now();
  const resultados=await detector.detect(canvas,20,.4);
  return {canvas, cajas:resultados.filter(r=>r.class==='bottle' && r.score>=.4), ms:performance.now()-inicio};
}
export function dibujarCajas(canvas, cajas, espejo=false) {
  canvas.width=canvas.height=640; const ctx=canvas.getContext('2d');
  ctx.lineWidth=3; ctx.font='bold 17px sans-serif';
  for(const [i,caja] of cajas.entries()) {
    let [x,y,w,h]=caja.bbox; if(espejo)x=640-x-w;
    ctx.strokeStyle='#16a34a';ctx.strokeRect(x,y,w,h);
    const texto=`Botella ${i+1} · ${Math.round(caja.score*100)} %`;
    const top=Math.max(0,y-26);ctx.fillStyle='#15803d';ctx.fillRect(x,top,ctx.measureText(texto).width+12,26);
    ctx.fillStyle='#fff';ctx.fillText(texto,x+6,top+19);
  }
  canvas.hidden=false;
}

export function recortarBotella(canvas, cajas) {
  if(cajas.length!==1)return canvas;
  const [x,y,w,h]=cajas[0].bbox;
  const margen=.05;const sx=Math.max(0,x-w*margen),sy=Math.max(0,y-h*margen);
  const sw=Math.min(canvas.width-sx,w*(1+2*margen)),sh=Math.min(canvas.height-sy,h*(1+2*margen));
  if(sw<=0||sh<=0)return canvas;
  const recorte=document.createElement('canvas');recorte.width=224;recorte.height=224;
  recorte.getContext('2d').drawImage(canvas,sx,sy,sw,sh,0,0,224,224);
  return recorte;
}
