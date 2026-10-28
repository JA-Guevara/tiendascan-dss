// Localiza la zona con tinta de la etiqueta, excluyendo tapa y base del envase.
export function regionEtiqueta(rgba,w,h){
  const filas=new Float32Array(h);
  for(let y=Math.floor(h*.20);y<Math.floor(h*.82);y++){
    let total=0,n=0;
    for(let x=Math.floor(w*.08);x<w*.92;x++){
      const i=(y*w+x)*4,r=rgba[i],g=rgba[i+1],b=rgba[i+2],max=Math.max(r,g,b),min=Math.min(r,g,b);
      if(max>45&&(max-min)/max>.25)total++;
      n++;
    }
    filas[y]=total/Math.max(1,n);
  }
  const ventana=Math.max(1,Math.round(h*.20));let inicio=Math.round(h*.3),mejor=0;
  for(let y=Math.floor(h*.20);y+ventana<h*.84;y++){
    let score=0;for(let k=y;k<y+ventana;k++)score+=filas[k];
    if(score>mejor){mejor=score;inicio=y;}
  }
  const margen=Math.round(h*.04);
  return {x:0,y:Math.max(0,inicio-margen),w,h:Math.min(h-inicio+margen,ventana+margen*2),visible:mejor/ventana>.12};
}
export function colorEtiqueta(rgba,w,region){
  const hist=new Array(12).fill(0);
  for(let y=region.y;y<region.y+region.h;y++)for(let x=region.x;x<region.x+region.w;x++){
    const i=(y*w+x)*4,r=rgba[i]/255,g=rgba[i+1]/255,b=rgba[i+2]/255;
    const max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;
    if(max<.18||d/Math.max(max,.001)<.25)continue;
    let hue=max===r?((g-b)/d)%6:max===g?(b-r)/d+2:(r-g)/d+4;
    hue=(hue*60+360)%360;
    const bin=hue/30,a=Math.floor(bin),frac=bin-a;
    hist[a%12]+=(1-frac)*d;hist[(a+1)%12]+=frac*d;
  }
  return hist;
}
export function combinar(envase,etiqueta,color){
  return .30*envase+.55*etiqueta+.15*color;
}
export function evaluarComparacion(a,b,coseno){
  const envase=coseno(a.envase,b.envase);
  const etiqueta=coseno(a.etiqueta,b.etiqueta);
  const color=coseno(a.color,b.color);
  const mismaImagen=Boolean(a.pixeles&&b.pixeles&&a.pixeles.length===b.pixeles.length&&a.pixeles.length>0
    && 1-a.pixeles.reduce((s,v,i)=>s+Math.abs(v-b.pixeles[i]),0)/(255*a.pixeles.length)>=.97
    && envase>=.985&&etiqueta>=.97);
  const usaEtiqueta=a.visible&&b.visible;
  const puntaje=mismaImagen?Math.max(.995,envase):usaEtiqueta?combinar(envase,etiqueta,color):envase;
  const compatible=mismaImagen|| (usaEtiqueta?envase>=.72&&etiqueta>=.78&&color>=.65:envase>=.95);
  return {puntaje,compatible,envase,etiqueta,color,usaEtiqueta,mismaImagen};
}
