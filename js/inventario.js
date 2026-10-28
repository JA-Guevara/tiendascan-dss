// Catálogo de productos y movimientos de inventario.
// El stock no se guarda: se calcula con el stock inicial y los movimientos, así siempre se puede auditar.

const CLAVE = "inventario-botellas-v1";
const TIPOS = { entrada: 1, salida: -1 };

export async function cargarCatalogo(url) {
  const respuesta = await fetch(url, { cache: "no-store" });
  if (!respuesta.ok) throw new Error(`No se encontró data/productos.json (HTTP ${respuesta.status}).`);
  let datos;
  try {
    datos = await respuesta.json();
  } catch {
    throw new Error("data/productos.json no es un JSON válido.");
  }
  let personalizados = [];
  try { personalizados = JSON.parse(localStorage.getItem("catalogo-botellas-v1") || "[]"); } catch { /* Usar catálogo base. */ }
  const base = normalizarCatalogo(datos);
  if (!Array.isArray(personalizados)) return base;
  try {
    const todos = new Map(base.map(p => [p.id, p]));
    for (const p of normalizarCatalogo({productos: personalizados.length ? personalizados : base})) todos.set(p.id, p);
    return [...todos.values()];
  } catch { return base; }
}

// Valida el catálogo y completa valores por defecto.
export function normalizarCatalogo(datos) {
  const lista = Array.isArray(datos?.productos) ? datos.productos : [];
  if (!lista.length) throw new Error("data/productos.json no tiene productos.");

  const ids = new Set();
  return lista.map((p, i) => {
    if (!p.id || ids.has(p.id)) throw new Error(`Producto ${i + 1} de productos.json: falta "id" o está repetido.`);
    ids.add(p.id);
    const minimo = entero(p.stockMinimo, 0);
    return Object.freeze({
      id: p.id,
      nombre: p.nombre || p.id,
      presentacion: p.presentacion || "",
      marca: String(p.marca || "").trim(),
      codigo: String(p.codigo || "").trim(),
      categoria: String(p.categoria || "Bebidas").trim(),
      precioCompra: Number(p.precioCompra) >= 0 ? Number(p.precioCompra) : 0,
      precioVenta: Number(p.precioVenta) >= 0 ? Number(p.precioVenta) : 0,
      clase: normalizarClase(p.clase || p.id),
      color: p.color || null,
      fotos: [...new Set([p.foto,...(Array.isArray(p.fotos)?p.fotos:[])].filter(f=>typeof f === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(f)))].slice(0,6),
      foto: typeof p.foto === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(p.foto) ? p.foto : null,
      stockInicial: entero(p.stockInicial, 0),
      stockMinimo: minimo,
      stockObjetivo: Math.max(entero(p.stockObjetivo, minimo * 2), minimo),
    });
  });
}

// "Coca Cola 500" y "coca_cola_500" se consideran la misma clase (sin tildes, mayúsculas ni espacios).
export function normalizarClase(texto) {
  return String(texto)
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function entero(valor, porDefecto) {
  const n = Number(valor);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : porDefecto;
}

export class Inventario {
  constructor(productos) {
    this.productos = productos;
    this.porId = new Map(productos.map((p) => [p.id, p]));
    this.porClase = new Map(productos.map((p) => [p.clase, p]));
    const stocks = new Map(productos.map((p) => [p.id, p.stockInicial]));
    this.movimientos = leer().filter((m) => {
      if (!stocks.has(m.productoId)) return false;
      const siguiente = stocks.get(m.productoId) + TIPOS[m.tipo] * m.cantidad;
      if (!Number.isSafeInteger(siguiente) || siguiente < 0) return false;
      stocks.set(m.productoId, siguiente);
      return true;
    });
    this.persistente = true;
  }

  guardarProducto(datos) {
    const anterior = this.porId.get(datos.id);
    if (!String(datos.nombre || "").trim()) throw new Error("Escribe el nombre del producto.");
    for (const campo of ["stockInicial", "stockMinimo", "stockObjetivo"]) {
      if (!Number.isSafeInteger(Number(datos[campo])) || Number(datos[campo]) < 0) throw new Error("Las cantidades deben ser enteros positivos o cero.");
    }
    if (Number(datos.stockObjetivo) < Number(datos.stockMinimo)) throw new Error("El objetivo debe ser mayor o igual al mínimo.");
    if (anterior && this.movimientos.some(m => m.productoId === datos.id) && Number(datos.stockInicial) !== anterior.stockInicial) throw new Error("El stock inicial no puede cambiar después de registrar movimientos. Usa entradas o ventas.");
    const producto = normalizarCatalogo({productos: [{...datos, nombre: datos.nombre.trim()}]})[0];
    if (this.productos.some(p => p.id !== producto.id && p.clase === producto.clase)) throw new Error("La clase ya pertenece a otro producto.");
    if (producto.codigo && this.productos.some(p => p.id !== producto.id && p.codigo === producto.codigo)) throw new Error("Ese código ya pertenece a otro producto. Selecciónalo en el inventario.");
    const lista = anterior ? this.productos.map(p => p.id === producto.id ? producto : p) : [...this.productos, producto];
    try { localStorage.setItem("catalogo-botellas-v1", JSON.stringify(lista)); }
    catch { throw new Error("No hay espacio para guardar el catálogo. Prueba con una foto más pequeña o exporta una copia."); }
    this.productos = lista;
    this.porId = new Map(lista.map(p => [p.id, p]));
    this.porClase = new Map(lista.map(p => [p.clase, p]));
    return producto;
  }

  productoDeClase(clase) {
    return this.porClase.get(normalizarClase(clase)) || null;
  }

  stock(id) {
    const inicial = this.porId.get(id).stockInicial;
    return this.movimientos.reduce((s, m) => (m.productoId === id ? s + TIPOS[m.tipo] * m.cantidad : s), inicial);
  }

  // Soporte a la decisión: estado del producto, unidades a reponer y costo estimado.
  estado(id) {
    const p = this.porId.get(id);
    const s = this.stock(id);
    const reponer = Math.max(0, p.stockObjetivo - s);
    const costoReponer = reponer * (p.precioCompra || 0);
    const gananciaReponer = reponer * Math.max(0, (p.precioVenta || 0) - (p.precioCompra || 0));
    if (s <= 0) return { nivel: "agotado", texto: "Agotado", reponer, costoReponer, gananciaReponer };
    if (s <= p.stockMinimo) return { nivel: "bajo", texto: "Bajo el mínimo", reponer, costoReponer, gananciaReponer };
    return { nivel: "ok", texto: "Stock suficiente", reponer: 0, costoReponer: 0, gananciaReponer: 0 };
  }

  resumen() {
    let total = 0;
    let alertas = 0;
    let valorStock = 0;
    let gananciaProyectada = 0;
    for (const p of this.productos) {
      const s = this.stock(p.id);
      total += s;
      valorStock += s * (p.precioCompra || 0);
      gananciaProyectada += s * Math.max(0, (p.precioVenta || 0) - (p.precioCompra || 0));
      if (this.estado(p.id).nivel !== "ok") alertas += 1;
    }
    return { total, alertas, valorStock, gananciaProyectada };
  }

  registrar(productoId, tipo, { origen = "manual", confianza = null, cantidad = 1 } = {}) {
    if (!this.porId.has(productoId)) throw new Error("Producto desconocido.");
    if (!Object.hasOwn(TIPOS, tipo)) throw new Error(`Tipo de movimiento no válido: ${tipo}.`);
    if (!Number.isSafeInteger(cantidad) || cantidad < 1) throw new Error("Cantidad no válida.");
    if (!Number.isSafeInteger(this.stock(productoId) + TIPOS[tipo] * cantidad)) throw new Error("Cantidad demasiado grande.");
    if (tipo === "salida" && this.stock(productoId) < cantidad) throw new Error("No hay stock para registrar una venta.");
    const movimiento = {
      id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      fecha: new Date().toISOString(),
      productoId,
      tipo,
      cantidad,
      origen,
      confianza: Number.isFinite(confianza) ? Math.round(confianza * 1000) / 1000 : null,
    };
    this.movimientos.push(movimiento);
    this.persistente = guardar(this.movimientos);
    return movimiento;
  }

  deshacer() {
    const ultimo = this.movimientos.pop() || null;
    this.persistente = guardar(this.movimientos);
    return ultimo;
  }

  reiniciar() {
    this.movimientos = [];
    this.persistente = guardar(this.movimientos);
  }

  // Movimientos con el stock que quedó después de cada uno (más reciente primero).
  historial(limite = Infinity) {
    const stocks = new Map(this.productos.map((p) => [p.id, p.stockInicial]));
    const filas = this.movimientos.map((m) => {
      const despues = stocks.get(m.productoId) + TIPOS[m.tipo] * m.cantidad;
      stocks.set(m.productoId, despues);
      return { ...m, producto: this.porId.get(m.productoId), stockDespues: despues };
    });
    return filas.reverse().slice(0, limite);
  }

  // CSV con ";" y BOM para que Excel en español lo abra bien.
  exportarCSV() {
    const encabezado = ["fecha", "producto", "presentacion", "tipo", "cantidad", "stock_despues", "origen", "confianza"];
    const filas = this.historial().reverse().map((m) => [
      m.fecha, m.producto.nombre, m.producto.presentacion, m.tipo === "salida" ? "venta" : "entrada",
      m.cantidad, m.stockDespues, m.origen, m.confianza === null ? "" : String(m.confianza).replace(".", ","),
    ]);
    const texto = [encabezado, ...filas].map((f) => f.map(celdaCSV).join(";")).join("\r\n");
    return `﻿${texto}\r\n`;
  }

  exportarJSON() {
    return JSON.stringify({
      exportado: new Date().toISOString(),
      productos: this.productos.map((p) => ({ ...p, stockActual: this.stock(p.id), estado: this.estado(p.id).nivel })),
      movimientos: this.movimientos,
    }, null, 2);
  }
}

function celdaCSV(valor) {
  const texto = String(valor ?? "");
  return /[";\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

// El inventario se guarda solo en este navegador. Si el almacenamiento falla, la página sigue
// funcionando y avisa que no se conservarán los cambios al recargar.
function leer() {
  try {
    const datos = JSON.parse(localStorage.getItem(CLAVE) || "[]");
    return Array.isArray(datos)
      ? datos.filter((m) => m && typeof m.productoId === "string" && Object.hasOwn(TIPOS, m.tipo)
        && Number.isSafeInteger(m.cantidad) && m.cantidad > 0
        && typeof m.fecha === "string" && Number.isFinite(Date.parse(m.fecha)))
      : [];
  } catch {
    return [];
  }
}

function guardar(movimientos) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(movimientos));
    return true;
  } catch {
    return false;
  }
}
