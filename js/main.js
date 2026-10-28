import {estadoDeteccion} from './estado-deteccion.js';
import {leerEtiqueta,recortarParaLectura} from './lector-etiqueta.js';
import {combinarLectura,evidenciaTexto} from './texto-producto.js';
import {buscarCoincidencias, elegirSugerencia, cargarIdentificador} from './coincidencias.js';
import {prepararEditor} from './catalogo.js';
import {Camara, cargarImagen, escucharArchivos} from './entrada.js';
import {Inventario, cargarCatalogo} from './inventario.js';
import {cargarDetector, detectar, dibujarCajas, recortarBotella} from './detector.js';
import * as ui from './ui.js';
const $ = id => document.getElementById(id);
const camara = new Camara($('video'));
const app = {inv:null, detector:null, modo:'imagen', hayImagen:false, ocupado:false, vivo:false, timer:null, turno:0, cajas:[], registrado:false, analizado:false, cantidadRegistrada:0, actual:null};
let crearDesdeDeteccion=false;
let sugerencia=null;
let seleccionAutomatica=false;
let comparacionPendiente=0;
let cicloId=0;
let fotoDeteccion=null;
let fotoLectura=null;
let lecturaActual=null;
let datosSugeridos={};
const editor=prepararEditor(()=>app.inv,(guardado)=>{
  refrescar();
  if(crearDesdeDeteccion){ seleccionAutomatica=false; $('productoDetectado').value=guardado.id; crearDesdeDeteccion=false; seleccionar(); }
  ui.estado('ok','Producto guardado. Selecciona cuántas unidades deseas ingresar.');
}, capturarProducto);
function capturarProducto(){return fotoDeteccion||capturarOriginal();}
function capturarOriginal(limite=360){
  const fuente=app.modo==='camara'?(camara.lista()?$('video'):null):(app.hayImagen?$('imagen'):null);
  if(!fuente)return null;
  const w=fuente.videoWidth||fuente.naturalWidth,h=fuente.videoHeight||fuente.naturalHeight;
  if(!w||!h)return null;
  const canvas=document.createElement('canvas');const escala=Math.min(1,limite/Math.max(w,h));
  canvas.width=Math.round(w*escala);canvas.height=Math.round(h*escala);
  canvas.getContext('2d').drawImage(fuente,0,0,canvas.width,canvas.height);
  return canvas.toDataURL('image/jpeg',limite>360?.92:.75);
}
function controles(){
  const lista=Boolean(app.inv), cam=app.modo==='camara';
  $('agregarProducto').disabled=$('crearDetectado').disabled=!lista;
  $('modoImagen').setAttribute('aria-pressed',String(!cam));$('modoCamara').setAttribute('aria-pressed',String(cam));
  $('btnFuente').textContent=cam?'Cambiar cámara':'Elegir foto';$('btnFuente').disabled=!lista;
  $('btnReconocer').disabled=!app.detector||app.ocupado||!(cam?camara.lista():app.hayImagen);
  $('btnEnVivo').disabled=!app.detector||!cam||!camara.activa;
  $('btnEnVivo').setAttribute('aria-pressed',String(app.vivo));
  $('btnEnVivo').textContent=app.vivo?'Pausar':'En vivo';
  const resultado=estadoDeteccion({cantidad:app.cajas.length,producto:Boolean(app.actual),identificado:seleccionAutomatica,registrado:app.registrado,ocupado:app.ocupado,analizado:app.analizado,manual:$('confirmarManual').checked,cantidadRegistrada:app.cantidadRegistrada});
  $('confirmarDeteccion').disabled=!resultado.puedeConfirmar;
  $('confirmarManual').closest('label').hidden=!resultado.mostrarManual;
  $('conteoDetectado').textContent=resultado.texto;
  for(const id of ['btnCsv','btnJson','btnReiniciar'])$(id).disabled=!lista;
}
function refrescar(){
  ui.mostrarInventario(app.inv,(id,tipo)=>movimiento(id,tipo),p=>{crearDesdeDeteccion=false;editor.abrir(p);});
  ui.mostrarMovimientos(app.inv.historial(25),app.inv.movimientos.length);
  const seleccionado=$('productoDetectado').value;
  const opciones=[new Option('Selecciona el producto detectado',''),...app.inv.productos.map(p=>new Option(`${p.nombre} ${p.presentacion}`,p.id))];
  $('productoDetectado').replaceChildren(...opciones);$('productoDetectado').value=seleccionado;
  seleccionar();controles();
}
function seleccionar(){
  const producto=app.inv?.porId.get($('productoDetectado').value);
  app.actual=producto||null;
  if(producto)ui.mostrarReconocido({producto,confianza:null,origen:'manual',stock:app.inv.stock(producto.id),estado:app.inv.estado(producto.id)});
  else ui.mostrarReconocido(null);
  if(producto)$('recDetalle').textContent=seleccionAutomatica?(sugerencia?.porTexto?'Identificado por la marca y el contenido leídos en la etiqueta. Revisa y confirma la entrada.':'Identificado por el modelo usando tu referencia. Revisa la presentación y confirma la entrada.'):'Producto seleccionado manualmente.';
  controles();
}
function movimiento(id,tipo,opciones={origen:'manual'}){
  try{app.inv.registrar(id,tipo,opciones);refrescar();ui.estado(app.inv.persistente?'ok':'aviso',app.inv.persistente?'Movimiento registrado.':'Movimiento aplicado, pero no se pudo guardar. Exporta una copia antes de cerrar.');return true;}
  catch(e){ui.estado('error',e.message);return false;}
}
function pausar(){app.vivo=false;cicloId++;clearTimeout(app.timer);controles();}
function iniciarAutomatico(){
  if(!app.detector||app.modo!=='camara'||!camara.activa||app.vivo)return;
  app.vivo=true;const id=++cicloId;controles();ciclo(id);
}
function nuevaToma(){
  pausar();
  app.turno++;
  app.cajas=[];
  fotoDeteccion=null;fotoLectura=null;lecturaActual=null;datosSugeridos={};
  $('lecturaEtiqueta').textContent='';$('candidatosProducto').replaceChildren();
  app.registrado=false;app.analizado=false;app.cantidadRegistrada=0;
  app.actual=null;
  seleccionAutomatica=false;
  crearDesdeDeteccion=false;
  $('productoDetectado').value='';
  sugerencia=null;comparacionPendiente++;
  $('usarSugerencia').hidden=true;
  $('estadoCoincidencia').textContent='Se comparará la captura con las fotos guardadas.';
  $('confirmarManual').checked=false;
  const canvas=$('cajasDeteccion');
  canvas.getContext('2d').clearRect(0,0,canvas.width,canvas.height);
  canvas.hidden=true;
  $('conteoDetectado').textContent='Toma nueva: pulsa Detectar botellas.';
  $('cantidadDetectada').value=1;
  $('tiempo').textContent='';
  ui.mostrarReconocido(null);
  ui.limpiarBarras();
  if(app.inv)ui.estado('ok','Toma nueva. Selecciona una imagen o detecta las botellas de la cámara.');
  controles();
}
async function reconocer(){
  const fuente=app.modo==='camara'?(camara.lista()?$('video'):null):(app.hayImagen?$('imagen'):null);
  if(!app.detector||!fuente||app.ocupado)return;
  const turno=app.turno;app.ocupado=true;controles();
  try{
    const fotoAlta=capturarOriginal(1400);
    const resultado=await detectar(app.detector,fuente,app.modo==='camara');
    if(turno!==app.turno)return;
    app.cajas=resultado.cajas;app.analizado=true;
    fotoLectura=await recortarParaLectura(fotoAlta,app.modo==='camara',app.cajas);
    if(turno!==app.turno)return;
    fotoDeteccion=recortarBotella(resultado.canvas,app.cajas).toDataURL('image/jpeg',.85);
    dibujarCajas($('cajasDeteccion'),app.cajas,app.modo==='camara'&&$('video').classList.contains('espejo'));
    $('tiempo').textContent=`${Math.round(resultado.ms)} ms`;
    $('conteoDetectado').textContent=app.registrado?'Esta toma ya fue registrada. Pulsa Nueva toma para otro ingreso.':app.cajas.length?`${app.cajas.length} botella(s) detectada(s)`:'No se detectaron botellas. Acerca la imagen o mejora la luz.';
    if(!app.registrado)$('cantidadDetectada').value=Math.max(1,app.cajas.length);
    if(!app.registrado&&(!app.actual||seleccionAutomatica))await compararCatalogo(turno);
  }catch(e){ui.estado('error',e.message);pausar();}
  finally{app.ocupado=false;controles();}
}
async function compararCatalogo(turno){
  const foto=capturarProducto();if(!foto)return;
  const solicitud=++comparacionPendiente;
  function quitarAutomatico(){if(seleccionAutomatica){seleccionAutomatica=false;$('productoDetectado').value='';seleccionar();}}
  if(app.cajas.length>1){quitarAutomatico();$('usarSugerencia').hidden=true;sugerencia=null;$('estadoCoincidencia').textContent='Para identificar un producto muestra una sola botella. Puedes contar varias y seleccionar el producto manualmente.';return;}
  const conFoto=app.inv.productos.filter(p=>p.foto||p.fotos?.length);
  $('estadoCoincidencia').textContent='Identificando producto y leyendo etiqueta…';
  try{
    const [visual,lectura]=await Promise.allSettled([
      conFoto.length?buscarCoincidencias(foto,conFoto,app.detector,capturarOriginal()):Promise.resolve([]),
      leerEtiqueta(fotoLectura||foto)
    ]);
    if(turno!==app.turno||solicitud!==comparacionPendiente)return;
    lecturaActual=lectura.status==='fulfilled'?lectura.value:null;
    $('lecturaEtiqueta').textContent=lecturaActual?.texto?`Texto leído: ${lecturaActual.texto.slice(0,180)}${lecturaActual.volumenes.length?' · Volumen: '+lecturaActual.volumenes.join(', ')+' ml':''}`:lectura.status==='rejected'?'La lectura de etiqueta no está disponible. Se usará la imagen.':'Etiqueta sin texto legible. Se usará la imagen.';
    const candidatos=combinarLectura(visual.status==='fulfilled'?visual.value:[],app.inv.productos,lecturaActual);
    const porMarca=candidatos.find(c=>c.texto.marcaCoincide);
    if(lecturaActual?.texto)$('lecturaEtiqueta').textContent=`${porMarca?'Marca leída: '+(porMarca.producto.marca||porMarca.texto.marca):'Marca sin confirmar'}${lecturaActual.volumenes.length?' · Contenido leído: '+lecturaActual.volumenes.join(', ')+' ml':' · Contenido sin confirmar'}`;
    datosSugeridos=porMarca?{nombre:porMarca.producto.marca||porMarca.producto.nombre,marca:porMarca.producto.marca||porMarca.texto.marca,presentacion:lecturaActual?.volumenes.length===1?`${lecturaActual.volumenes[0]} ml`:''}:{};
    if(turno!==app.turno||solicitud!==comparacionPendiente||(app.actual&&!seleccionAutomatica))return;
    sugerencia=elegirSugerencia(candidatos);
    $('usarSugerencia').hidden=true;
    if(sugerencia){
      seleccionAutomatica=true;
      $('productoDetectado').value=sugerencia.producto.id;
      seleccionar();
      pausar();$('candidatosProducto').replaceChildren();
      $('estadoCoincidencia').textContent=`Producto identificado: ${sugerencia.producto.nombre} ${sugerencia.producto.presentacion}. Revisa la cantidad y confirma la entrada. Para otro producto pulsa Nueva toma.`;
    }else{
      quitarAutomatico();
      const [primero,segundo]=candidatos;
      const ambiguo=candidatos.filter(c=>c.mismaImagen).length>1||(primero?.compatible&&primero.puntaje>=.8&&segundo&&primero.puntaje-segundo.puntaje<.08);
      $('estadoCoincidencia').textContent=ambiguo?`La imagen coincide con varios registros: ${primero.producto.nombre} ${primero.producto.presentacion} y ${segundo.producto.nombre} ${segundo.producto.presentacion}. Selecciona el correcto; revisa si registraste el mismo producto dos veces.`:primero?`No se pudo confirmar ${primero.producto.nombre} ${primero.producto.presentacion}. Revisa las fotos guardadas o selecciónalo manualmente.`:'Los productos no tienen referencias utilizables. Añade una foto al producto.';
      ui.mostrarReconocido({desconocido:true,texto:porMarca?'Se identificó la marca, pero falta confirmar la presentación.':'Revisa los productos parecidos o registra uno nuevo.'});
      $('recNombre').textContent=porMarca?`${porMarca.producto.marca||porMarca.texto.marca} · presentación por confirmar`:'Producto por confirmar';
      const opciones=candidatos.filter(c=>c.texto.marcaCoincide||c.puntaje>=.55).slice(0,3);
      $('candidatosProducto').replaceChildren(...opciones.map(c=>{
        const boton=document.createElement('button');boton.type='button';boton.className='btn';
        boton.textContent=`${c.producto.nombre} ${c.producto.presentacion}`;
        boton.addEventListener('click',()=>{pausar();seleccionAutomatica=false;$('productoDetectado').value=c.producto.id;seleccionar();$('candidatosProducto').replaceChildren();});return boton;
      }));
      if(porMarca)$('estadoCoincidencia').textContent='Marca reconocida. Selecciona la presentación correcta de abajo o registra la que falta.';
    }
  }catch(e){if(turno===app.turno){quitarAutomatico();$('estadoCoincidencia').textContent='No se pudo cargar o ejecutar el modelo de identificación. La detección y selección manual siguen disponibles.';}}
}
async function ciclo(id){if(!app.vivo||id!==cicloId)return;await reconocer();if(app.vivo&&id===cicloId)app.timer=setTimeout(()=>ciclo(id),350);}
async function usarImagen(){pausar();camara.detener();app.modo='imagen';nuevaToma();ui.mostrarEnVisor(app.hayImagen?'imagen':'vacio');controles();}
async function usarCamara(){
  pausar();nuevaToma();app.modo='camara';app.hayImagen=false;controles();
  const turno=app.turno;
  try{await camara.iniciar();if(turno!==app.turno){camara.detener();return;}ui.mostrarEnVisor('video');iniciarAutomatico();ui.estado('ok',app.detector?'Cámara activa · detección automática.':'Cámara activa. La detección empezará cuando termine de cargar el modelo.');}
  catch(e){await usarImagen();ui.estado('error',e.message);}controles();
}
async function recibirArchivo(archivo){
  if(!app.inv||!archivo)return;
  await usarImagen();nuevaToma();app.hayImagen=false;const turno=app.turno;
  try{await cargarImagen(archivo,$('imagen'));if(turno!==app.turno)return;app.hayImagen=true;ui.mostrarEnVisor('imagen');await reconocer();}
  catch(e){ui.estado('error',e.message);}finally{$('archivo').value='';controles();}
}
$('modoImagen').addEventListener('click',usarImagen);
$('modoCamara').addEventListener('click',()=>{if(app.modo!=='camara')usarCamara();});
$('btnFuente').addEventListener('click',async()=>{if(app.modo==='imagen')return $('archivo').click();pausar();nuevaToma();try{await camara.cambiar();iniciarAutomatico();}catch(e){ui.estado('error',e.message);}controles();});
$('archivo').addEventListener('change',()=>recibirArchivo($('archivo').files[0]));
escucharArchivos($('visor'),recibirArchivo);
$('btnReconocer').addEventListener('click',reconocer);
$('btnEnVivo').addEventListener('click',()=>{if(app.vivo)pausar();else iniciarAutomatico();});
$('btnLimpiar').addEventListener('click',async()=>{await usarImagen();app.hayImagen=false;$('imagen').removeAttribute('src');ui.mostrarEnVisor('vacio');nuevaToma();controles();});
$('nuevaToma').addEventListener('click',()=>{nuevaToma();iniciarAutomatico();});
$('productoDetectado').addEventListener('change',()=>{seleccionAutomatica=false;pausar();comparacionPendiente++;$('usarSugerencia').hidden=true;seleccionar();});
$('usarSugerencia').addEventListener('click',()=>{if(!sugerencia)return;pausar();$('productoDetectado').value=sugerencia.producto.id;seleccionar();$('usarSugerencia').hidden=true;});
$('confirmarManual').addEventListener('change',()=>{pausar();controles();});
$('agregarProducto').addEventListener('click',()=>{crearDesdeDeteccion=false;});
$('crearDetectado').addEventListener('click',()=>{pausar();crearDesdeDeteccion=true;editor.abrir(null,datosSugeridos);});
$('confirmarDeteccion').addEventListener('click',()=>{
  if(!estadoDeteccion({cantidad:app.cajas.length,producto:Boolean(app.actual),identificado:seleccionAutomatica,registrado:app.registrado,ocupado:app.ocupado,manual:$('confirmarManual').checked}).puedeConfirmar)return;
  pausar();const cantidad=Number($('cantidadDetectada').value);
  const confianza=app.cajas.length?app.cajas.reduce((s,c)=>s+c.score,0)/app.cajas.length:null;
  if(movimiento(app.actual.id,'entrada',{origen:$('confirmarManual').checked?'manual':app.modo==='camara'?'camara':'imagen',confianza:$('confirmarManual').checked?null:confianza,cantidad})){
    app.registrado=true;app.cantidadRegistrada=cantidad;$('conteoDetectado').textContent=`Entrada de ${cantidad} unidad(es) confirmada. Esta toma ya está registrada.`;controles();
  }
});
$('btnSalida').addEventListener('click',()=>{if(app.actual)movimiento(app.actual.id,'salida');});
$('btnEntrada').addEventListener('click',()=>{if(app.actual)movimiento(app.actual.id,'entrada');});
$('btnDeshacer').addEventListener('click',()=>{if(app.inv){app.inv.deshacer();refrescar();ui.estado('ok','Último movimiento deshecho.');}});
function descargar(nombre,contenido,tipo){const url=URL.createObjectURL(new Blob([contenido],{type:tipo}));const a=document.createElement('a');a.href=url;a.download=nombre;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('btnCsv').addEventListener('click',()=>descargar('inventario.csv',app.inv.exportarCSV(),'text/csv;charset=utf-8'));
$('btnJson').addEventListener('click',()=>descargar('inventario.json',app.inv.exportarJSON(),'application/json'));
let reinicio=null;
$('btnReiniciar').addEventListener('click',()=>{
  if(!reinicio){$('btnReiniciar').textContent='¿Seguro?';reinicio=setTimeout(()=>{reinicio=null;$('btnReiniciar').textContent='Reiniciar';},3000);return;}
  clearTimeout(reinicio);reinicio=null;$('btnReiniciar').textContent='Reiniciar';app.inv.reiniciar();nuevaToma();refrescar();
});
document.addEventListener('visibilitychange',()=>{if(document.hidden)pausar();});
window.addEventListener('pagehide',()=>{pausar();camara.detener();});
async function iniciar(){
  controles();
  try{app.inv=new Inventario(await cargarCatalogo(new URL('../data/productos.json',import.meta.url)));refrescar();}
  catch(e){ui.estado('error',e.message);return;}
  ui.estado('cargando','Cargando detector local de botellas…');
  try{app.detector=await cargarDetector();ui.estado('cargando','Detector listo. Cargando identificación por referencias…');try{await cargarIdentificador();ui.estado('ok','Detector e identificador listos · carga una foto o activa la cámara.');}catch{ui.estado('aviso','Detección lista. Identificador no disponible; selección manual habilitada.');}if(app.modo==='camara')iniciarAutomatico();else if(app.hayImagen)await reconocer();}
  catch(e){ui.estado('aviso',`Detector no disponible: ${e.message} El inventario manual sigue funcionando.`);}
  controles();
}
iniciar();
