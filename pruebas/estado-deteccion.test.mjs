import fs from 'node:fs';import assert from 'node:assert/strict';
const source=fs.readFileSync(new URL('../js/estado-deteccion.js',import.meta.url),'utf8');
const {estadoDeteccion}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
// Caso de la captura: Coca-Cola identificada, sin caja del contador.
let r=estadoDeteccion({producto:true,identificado:true,cantidad:0,analizado:true});
assert.equal(r.puedeConfirmar,true);assert.equal(r.mostrarManual,false);assert.match(r.texto,/Producto identificado/);assert.doesNotMatch(r.texto,/No se/);
r=estadoDeteccion({producto:true,cantidad:0,analizado:true});assert.equal(r.puedeConfirmar,false);assert.equal(r.mostrarManual,true);
assert.equal(estadoDeteccion({producto:true,cantidad:0,manual:true}).puedeConfirmar,true);
assert.equal(estadoDeteccion({producto:true,identificado:true,ocupado:true}).puedeConfirmar,false);
r=estadoDeteccion({producto:true,identificado:true,registrado:true,cantidadRegistrada:2});assert.equal(r.puedeConfirmar,false);assert.match(r.texto,/2 unidad/);
r=estadoDeteccion({cantidad:1,analizado:true});assert.equal(r.puedeConfirmar,false);assert.match(r.texto,/1 botella/);
assert.equal(estadoDeteccion({}).puedeConfirmar,false);
console.log('OK: identificado sin recuadro, confirmación, cantidad manual, ocupado, toma registrada y reinicio.');
