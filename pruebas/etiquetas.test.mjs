import fs from 'node:fs';
import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url);
const texto=fs.readFileSync(new URL('js/texto-producto.js',root),'utf8');
const {volumenesTexto,combinarLectura,marcaProducto}=await import('data:text/javascript;base64,'+Buffer.from(texto).toString('base64'));
const visual=fs.readFileSync(new URL('js/coincidencias.js',root),'utf8').replace(/^import[^\n]+\n/gm,'');
const {elegirSugerencia}=await import('data:text/javascript;base64,'+Buffer.from(visual).toString('base64'));
const productos=[{id:'s500',nombre:'Sprite',presentacion:'500 ml'},{id:'s2000',nombre:'Sprite',presentacion:'2 L'},{id:'v990',nombre:'Agua Vital',presentacion:'990 ml'}];
assert.deepEqual(volumenesTexto('990ml, 1,5 L, 500 mi'),[990,1500,500]);
assert.equal(marcaProducto({nombre:'Agua Vital 990ml'}),'vital');
const lectura={texto:'Sprite contenido neto 500 ml',volumenes:[500]};
let candidatos=combinarLectura([],productos,lectura);
assert.equal(elegirSugerencia(candidatos).producto.id,'s500');
// La etiqueta contradice una coincidencia visual muy alta de otra presentación.
candidatos=combinarLectura([{producto:productos[1],puntaje:1,compatible:true,mismaImagen:true}],productos,lectura);
assert.equal(elegirSugerencia(candidatos).producto.id,'s500');
assert.equal(candidatos.find(c=>c.producto.id==='s2000').compatible,false);
// Solo la marca, sin volumen ni coincidencia visual, no identifica una presentación.
assert.equal(elegirSugerencia(combinarLectura([],productos,{texto:'Sprite',volumenes:[]})),null);
// La ausencia de OCR no invalida una coincidencia visual ya establecida.
assert.equal(elegirSugerencia(combinarLectura([{producto:productos[2],puntaje:.95,compatible:true}],productos,null)).producto.id,'v990');
// El contenido nutricional de 100ml no desplaza el contenido neto.
assert.equal(elegirSugerencia(combinarLectura([],productos,{texto:'Sprite 100 ml 500 ml',volumenes:[100,500]})).producto.id,'s500');
console.log('OK: marca y volumen, formatos, presentación contradictoria, ausencia de OCR y nutrición.');
