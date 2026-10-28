export function normalizarTexto(texto){return String(texto||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}
const GENERICAS=new Set(['agua','bebida','botella','sabor','original','gaseosa','refresco','purificada','mineral','natural','sin','con','azucar','litro','litros','ml']);
export function volumenesTexto(texto){
  const valores=[];
  for(const m of String(texto||'').toLowerCase().matchAll(/(\d{1,4}(?:[.,]\d{1,3})?)\s*(ml|m[l1i|]|cl|litros?|lts?|l)\b/g)){
    const cantidad=Number(m[1].replace(',','.')),unidad=m[2];
    const ml=cantidad*(unidad==='cl'?10:unidad.startsWith('m')?1:1000);
    if(ml>=30&&ml<=20000)valores.push(Math.round(ml));
  }
  return [...new Set(valores)];
}
function distancia(a,b){const fila=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){let diagonal=fila[0];fila[0]=i;for(let j=1;j<=b.length;j++){const previo=fila[j];fila[j]=Math.min(fila[j]+1,fila[j-1]+1,diagonal+(a[i-1]===b[j-1]?0:1));diagonal=previo;}}return fila[b.length];}
export function marcaProducto(p){return normalizarTexto(p.marca||String(p.nombre).replace(/\d+(?:[.,]\d+)?\s*(?:ml|cl|l|litros?)\b/gi,'')).split(' ').filter(w=>w.length>=3&&!GENERICAS.has(w)&&!/^\d+$/.test(w)).join(' ');}
export function evidenciaTexto(lectura,producto){
  const tokens=normalizarTexto(lectura?.texto).split(' '),marca=marcaProducto(producto),palabras=marca.split(' ').filter(Boolean);
  const marcaCoincide=palabras.length>0&&palabras.every(p=>tokens.some(t=>p===t||(p.length>=5&&t.length>=4&&distancia(p,t)<=1)));
  const esperados=volumenesTexto(producto.presentacion),leidos=lectura?.volumenes||[];
  // 100 ml suele ser la base de información nutricional, no el contenido neto.
  const contenidos=leidos.length>1?leidos.filter(v=>v!==100):leidos;
  const volumenCoincide=esperados.length===1&&contenidos.length===1&&esperados[0]===contenidos[0];
  const volumenContradice=esperados.length===1&&contenidos.length===1&&!volumenCoincide;
  return {marca,marcaCoincide,volumenCoincide,volumenContradice};
}
export function combinarLectura(candidatos,productos,lectura){
  const porId=new Map(candidatos.map(c=>[c.producto.id,c]));
  const marcaConocida=productos.some(p=>evidenciaTexto(lectura,p).marcaCoincide);
  const resultados=productos.map(producto=>{
    const visual=porId.get(producto.id)||{producto,puntaje:0,compatible:false};
    const texto=evidenciaTexto(lectura,producto);
    const contradiccion=texto.volumenContradice||marcaConocida&&!texto.marcaCoincide;
    const porTexto=texto.marcaCoincide&&texto.volumenCoincide;
    return {...visual,texto,compatible:!contradiccion&&(visual.compatible||porTexto),mismaImagen:!contradiccion&&visual.mismaImagen,puntaje:contradiccion?Math.min(visual.puntaje,.49):porTexto?Math.max(.99,visual.puntaje):visual.puntaje,porTexto};
  });
  return resultados.sort((a,b)=>b.puntaje-a.puntaje);
}
export function leerTSV(tsv){
  const lineas=String(tsv||'').trim().split('\n').slice(1),palabras=[];
  for(const linea of lineas){const c=linea.split('\t');if(c.length>=12&&Number(c[10])>=40&&c[11].trim())palabras.push(c[11].trim());}
  return palabras.join(' ');
}
