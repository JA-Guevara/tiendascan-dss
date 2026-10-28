// Una sola decisión para el mensaje, el botón y la confirmación manual.
export function estadoDeteccion({cantidad=0,producto=false,identificado=false,registrado=false,ocupado=false,analizado=false,manual=false,cantidadRegistrada=0}){
  const puedeConfirmar=producto&&!registrado&&!ocupado&&(cantidad>0||identificado||manual);
  const mostrarManual=cantidad===0&&!identificado&&!registrado;
  let texto='Carga una foto o activa la cámara.';
  if(registrado)texto=`Entrada de ${cantidadRegistrada} unidad(es) confirmada. Esta toma ya está registrada.`;
  else if(identificado)texto=cantidad>0?`${cantidad} botella(s) detectada(s) · producto identificado.`:'Producto identificado · verifica la cantidad a ingresar.';
  else if(analizado)texto=cantidad>0?`${cantidad} botella(s) detectada(s)`:'No se pudo contar automáticamente. Selecciona un producto y confirma la cantidad manualmente.';
  return {texto,puedeConfirmar,mostrarManual};
}
