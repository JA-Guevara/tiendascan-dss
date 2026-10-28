// Editor del catálogo: las fotos se reducen antes de guardarlas en el navegador.
export function prepararEditor(obtenerInventario, alGuardar, obtenerCaptura = () => null) {
  const $ = id => document.getElementById(id);
  const dialogo = $("editorProducto"), form = $("formProducto");
  let referencias = [];
  let actual = null, foto = null, cargando = false, turno = 0;
  function mostrarFoto() { $("cantidadFotos").textContent=`${referencias.length} foto(s) de referencia. Puedes trabajar con una sola foto; añadir otras es opcional (hasta 6).`; $("fotoProducto").hidden = !foto; if (foto) $("fotoProducto").src = foto; }
  function abrir(producto = null, sugeridos = {}) {
    turno++; actual = producto; foto = producto?.foto || obtenerCaptura(); cargando = false; form.reset();
    referencias=[...new Set([foto,...(producto?.fotos||[])].filter(Boolean))].slice(0,6);
    $("errorProducto").textContent = "";
    $("tituloEditor").textContent = producto ? "Editar botella" : "Agregar botella";
    for (const campo of ["nombre", "marca", "codigo", "presentacion", "stockInicial", "stockMinimo", "stockObjetivo", "precioCompra", "precioVenta"]) {
      if (producto) form.elements[campo].value = producto[campo] ?? "";
      else if(sugeridos[campo])form.elements[campo].value=sugeridos[campo];
    }
    const bloqueado = Boolean(producto && obtenerInventario().movimientos.some(m => m.productoId === producto.id));
    form.elements.stockInicial.disabled = bloqueado; $("notaStock").hidden = !bloqueado;
    mostrarFoto(); dialogo.showModal(); form.elements.nombre.focus();
  }
  $("agregarProducto").addEventListener("click", () => abrir());
  $("cancelarProducto").addEventListener("click", () => { turno++; dialogo.close(); });
  dialogo.addEventListener("cancel", () => { turno++; });
  $("quitarFoto").addEventListener("click", () => { turno++; foto = null; referencias=[]; cargando = false; form.elements.foto.value = ""; mostrarFoto(); });
  $("capturarReferencia").addEventListener("click",()=>{
    const captura=obtenerCaptura();
    if(!captura){$("errorProducto").textContent="Primero carga una foto o activa la cámara.";return;}
    if(referencias.length>=6){$("errorProducto").textContent="Ya hay 6 referencias. Quita las fotos para reemplazarlas.";return;}
    if(!referencias.includes(captura))referencias.push(captura);foto=referencias[0];mostrarFoto();
  });
  form.elements.foto.addEventListener("change", async () => {
    const archivos=[...form.elements.foto.files]; if (!archivos.length) return;
    const solicitud = ++turno; cargando = true; $("errorProducto").textContent = "";
    try {
      if(referencias.length+archivos.length>6)throw new Error("Puedes guardar hasta 6 fotos por producto.");
      const nuevas=[];
      for(const archivo of archivos){
        if (!["image/jpeg", "image/png", "image/webp"].includes(archivo.type) || archivo.size > 15 * 1024 * 1024) throw new Error("Elige imágenes JPG, PNG o WEBP de hasta 15 MB.");
        const bitmap=await createImageBitmap(archivo);
        try {
          if(solicitud!==turno)return;
          const escala=Math.min(1,360/Math.max(bitmap.width,bitmap.height));
          const canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(bitmap.width*escala));canvas.height=Math.max(1,Math.round(bitmap.height*escala));
          canvas.getContext("2d").drawImage(bitmap,0,0,canvas.width,canvas.height);
          nuevas.push(canvas.toDataURL("image/jpeg",.85));
        }finally{bitmap.close();}
      }
      if(solicitud!==turno)return;
      referencias=[...new Set([...referencias,...nuevas])];foto=referencias[0]||null;mostrarFoto();
    }catch(error){if(solicitud===turno)$("errorProducto").textContent=error.message;}
    finally{if(solicitud===turno)cargando=false;}
  });
  form.addEventListener("submit", event => {
    event.preventDefault();
    try {
      if (cargando) throw new Error("Espera a que termine de cargar la foto.");
      const id = actual?.id || `botella-${globalThis.crypto?.randomUUID?.() || Date.now()}`;
      const guardado = obtenerInventario().guardarProducto({id, nombre: form.elements.nombre.value,
        presentacion: form.elements.presentacion.value.trim(),
        marca: form.elements.marca.value.trim(), codigo: form.elements.codigo.value.trim(),
        stockInicial: Number(form.elements.stockInicial.value), stockMinimo: Number(form.elements.stockMinimo.value),
        stockObjetivo: Number(form.elements.stockObjetivo.value),
        precioCompra: Number(form.elements.precioCompra?.value || 0),
        precioVenta: Number(form.elements.precioVenta?.value || 0),
        foto, fotos: referencias,
        clase: actual?.clase || id, color: actual?.color || "#2457d6"});
      dialogo.close(); alGuardar(guardado);
    } catch (error) { $("errorProducto").textContent = error.message; }
  });
  return { abrir };
}
