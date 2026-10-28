// Interfaz: todo se dibuja a partir del catálogo, del inventario y del resultado del modelo.

const $ = (id) => document.getElementById(id);
const porcentaje = new Intl.NumberFormat("es", { style: "percent", maximumFractionDigits: 0 });
const entero = new Intl.NumberFormat("es");
const hora = new Intl.DateTimeFormat("es", { hour: "2-digit", minute: "2-digit" });
const ORIGENES = { camara: "Cámara", imagen: "Foto", manual: "Manual", demo: "Demo" };

let barras = [];

export function estado(tipo, texto) {
  const chip = $("estado");
  chip.dataset.tipo = tipo;
  chip.textContent = texto;
}

export function mostrarEnVisor(fuente) {
  $("video").hidden = fuente !== "video";
  $("imagen").hidden = fuente !== "imagen";
  $("vacio").hidden = fuente !== "vacio";
  $("visor").classList.toggle("con-contenido", fuente !== "vacio");
}

// ---------- Barras por clase del modelo ----------
export function configurarBarras(clases) {
  const plantilla = $("tplBarra");
  $("barras").replaceChildren();
  barras = clases.map((clase) => {
    const nodo = plantilla.content.firstElementChild.cloneNode(true);
    nodo.querySelector(".barra-nombre").textContent = clase.nombre;
    nodo.querySelector(".barra-nombre").title = clase.nombre;
    if (clase.color) nodo.style.setProperty("--color", clase.color);
    $("barras").append(nodo);
    return { relleno: nodo.querySelector(".barra-relleno"), valor: nodo.querySelector(".barra-valor") };
  });
}

export function mostrarProbabilidades(probabilidades, ms) {
  probabilidades.forEach((p, i) => {
    if (!barras[i]) return;
    barras[i].relleno.style.width = `${(p * 100).toFixed(1)}%`;
    barras[i].valor.textContent = porcentaje.format(p);
  });
  $("tiempo").textContent = Number.isFinite(ms) ? `${Math.round(ms)} ms` : "";
}

export function limpiarBarras() {
  barras.forEach((b) => { b.relleno.style.width = "0"; b.valor.textContent = porcentaje.format(0); });
  $("tiempo").textContent = "";
}

// ---------- Panel "Producto reconocido" ----------
// datos: null (vacío) · { desconocido: true, texto } · { producto, confianza, stock, estado, origen }
export function mostrarReconocido(datos) {
  const caja = $("reconocido");
  const insignia = $("recEstado");
  const sugerencia = $("recSugerencia");

  if (!datos || datos.desconocido) {
    caja.dataset.nivel = datos ? "desconocido" : "vacio";
    $("stock").dataset.nivel = caja.dataset.nivel;
    caja.style.removeProperty("--color");
    $("recNombre").textContent = datos ? "No reconocido" : "Ningún producto";
    $("recDetalle").textContent = datos?.texto || "Apunta la cámara a una botella o elige una foto.";
    $("recStock").textContent = "—";
    insignia.dataset.nivel = caja.dataset.nivel;
    insignia.textContent = "—";
    sugerencia.hidden = true;
    $("btnSalida").disabled = true;
    $("btnEntrada").disabled = true;
    return;
  }

  const { producto, confianza, stock, estado: est, origen } = datos;
  caja.dataset.nivel = est.nivel;
  $("stock").dataset.nivel = est.nivel;
  caja.style.setProperty("--color", producto.color || "");
  $("recNombre").textContent = `${producto.nombre} ${producto.presentacion}`.trim();
  $("recDetalle").textContent = origen === "demo"
    ? "Simulado (modo demostración)"
    : `Confianza ${porcentaje.format(confianza)} · ${ORIGENES[origen] || origen}`;
  $("recStock").textContent = entero.format(stock);
  insignia.dataset.nivel = est.nivel;
  insignia.textContent = est.texto;
  sugerencia.hidden = est.reponer <= 0;
  sugerencia.textContent = est.costoReponer > 0
    ? `Sugerencia: reponer ${entero.format(est.reponer)} u. · Inversión: Bs. ${entero.format(Math.round(est.costoReponer))} (mínimo ${producto.stockMinimo})`
    : `Sugerencia: reponer ${entero.format(est.reponer)} unidades (mínimo ${producto.stockMinimo})`;
  $("btnSalida").disabled = stock <= 0;
  $("btnEntrada").disabled = false;
}

// ---------- Inventario ----------
export function mostrarInventario(inventario, alRegistrar, alEditar, clasesModelo = []) {
  const plantilla = $("tplTarjeta");
  const tarjetas = inventario.productos.map((p) => {
    const nodo = plantilla.content.firstElementChild.cloneNode(true);
    const stock = inventario.stock(p.id);
    const est = inventario.estado(p.id);
    nodo.dataset.nivel = est.nivel;
    const foto = nodo.querySelector(".producto-foto");
    if (p.foto) { foto.src = p.foto; foto.alt = `${p.nombre} ${p.presentacion}`; foto.hidden = false; }
    nodo.querySelector(".tarjeta-reconocimiento").textContent = (p.foto || p.fotos?.length) ? `${p.fotos?.length || 1} foto(s) para reconocimiento` : "Sin fotos de referencia";
    nodo.querySelector('[data-accion="editar"]').addEventListener("click", () => alEditar(p));
    if (p.color) nodo.style.setProperty("--color", p.color);
    nodo.querySelector(".tarjeta-nombre").textContent = p.nombre;
    nodo.querySelector(".tarjeta-presentacion").textContent = p.presentacion;
    nodo.querySelector(".tarjeta-cifra").textContent = entero.format(stock);
    nodo.querySelector(".nivel-relleno").style.width = `${Math.min(100, (stock / Math.max(p.stockObjetivo, 1)) * 100)}%`;
    const pPrecios = nodo.querySelector(".tarjeta-precios");
    if (pPrecios) {
      if (p.precioVenta > 0 || p.precioCompra > 0) {
        pPrecios.textContent = `Venta: Bs. ${Number(p.precioVenta || 0).toFixed(2)} · Costo: Bs. ${Number(p.precioCompra || 0).toFixed(2)}`;
      } else {
        pPrecios.textContent = "";
      }
    }
    nodo.querySelector(".tarjeta-meta").textContent = est.reponer > 0
      ? `Mínimo ${p.stockMinimo} · reponer ${est.reponer}${est.costoReponer > 0 ? ` (Bs. ${entero.format(Math.round(est.costoReponer))})` : ""}`
      : `Mínimo ${p.stockMinimo} · objetivo ${p.stockObjetivo}`;
    nodo.querySelector(".insignia").textContent = est.texto;
    const venta = nodo.querySelector('[data-accion="salida"]');
    const entrada = nodo.querySelector('[data-accion="entrada"]');
    venta.disabled = stock <= 0;
    venta.setAttribute("aria-label", `Registrar venta de ${p.nombre} ${p.presentacion}`);
    entrada.setAttribute("aria-label", `Registrar entrada de ${p.nombre} ${p.presentacion}`);
    venta.addEventListener("click", () => alRegistrar(p.id, "salida"));
    entrada.addEventListener("click", () => alRegistrar(p.id, "entrada"));
    return nodo;
  });
  $("tarjetas").replaceChildren(...tarjetas);

  const { total, alertas, valorStock, gananciaProyectada } = inventario.resumen();
  $("totalUnidades").textContent = entero.format(total);
  $("totalAlertas").textContent = entero.format(alertas);
  $("totalAlertas").parentElement.dataset.nivel = alertas ? "bajo" : "ok";
  if ($("valorTotalStock")) $("valorTotalStock").textContent = `Bs. ${entero.format(Math.round(valorStock || 0))}`;
}

export function mostrarMovimientos(filas, total) {
  const cuerpo = $("filasMovimientos");
  $("cantidadMovimientos").textContent = total ? `${entero.format(total)} en total` : "";
  $("btnDeshacer").disabled = total === 0;
  if (!filas.length) {
    const tr = document.createElement("tr");
    tr.className = "fila-vacia";
    const td = document.createElement("td");
    td.colSpan = 6;
    td.textContent = "Todavía no hay movimientos. Reconoce una botella y registra una venta o una entrada.";
    tr.append(td);
    cuerpo.replaceChildren(tr);
    return;
  }
  cuerpo.replaceChildren(...filas.map((m) => {
    const tr = document.createElement("tr");
    const celdas = [
      [hora.format(new Date(m.fecha))],
      [`${m.producto.nombre} ${m.producto.presentacion}`.trim()],
      [m.tipo === "salida" ? "Venta" : "Entrada", m.tipo === "salida" ? "tipo-salida" : "tipo-entrada"],
      [`${m.tipo === "salida" ? "−" : "+"}${m.cantidad}`, "num"],
      [entero.format(m.stockDespues), "num"],
      [ORIGENES[m.origen] || m.origen],
    ];
    tr.append(...celdas.map(([texto, clase]) => {
      const td = document.createElement("td");
      td.textContent = texto;
      if (clase) td.className = clase;
      return td;
    }));
    return tr;
  }));
}

// ---------- Simulador (modo demostración) ----------
export function mostrarSimulador(opciones, alElegir) {
  const contenedor = $("simuladorBotones");
  contenedor.replaceChildren(...opciones.map((op) => {
    const boton = document.createElement("button");
    boton.type = "button";
    boton.className = "chip-btn";
    boton.textContent = op.nombre;
    if (op.color) boton.style.setProperty("--color", op.color);
    boton.addEventListener("click", () => alElegir(op));
    return boton;
  }));
  $("simulador").hidden = false;
}
