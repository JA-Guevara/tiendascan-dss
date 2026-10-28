// Lee y valida modelo/metadata.json, en formato propio o el de Teachable Machine.
// Todo lo que depende del modelo (clases, tamaño de entrada, preprocesamiento, umbral)
// sale de ese archivo: el resto del código no lo conoce.

const GRISES = ["bgr2gray_sobre_rgb", "luminancia", "promedio"];
const ESCALAS = ["0-1", "-1-1"];
const RECORTES = ["estirar", "centro"];

export async function cargarConfiguracion(url) {
  const respuesta = await fetch(url, { cache: "no-store" });
  if (!respuesta.ok) {
    const error = new Error(`No se encontró ${nombreArchivo(url)} (HTTP ${respuesta.status}).`);
    if (respuesta.status === 404) {
      error.codigo = "SIN_CONFIGURACION";
      error.message = "El modelo está pendiente de configurar: falta metadata.json con las clases y el preprocesamiento del entrenamiento.";
    }
    throw error;
  }
  let datos;
  try {
    datos = await respuesta.json();
  } catch {
    throw new Error(`${nombreArchivo(url)} no es un JSON válido.`);
  }
  // Teachable Machine exporta su propio metadata.json (con "labels"); se traduce al formato propio.
  if (Array.isArray(datos.labels) && !Array.isArray(datos.clases)) datos = desdeTeachableMachine(datos);
  return normalizar(datos);
}

// Teachable Machine (imagen): 224×224 a color, recorte al centro, valores entre −1 y 1, softmax.
function desdeTeachableMachine(tm) {
  const lado = Number(tm.imageSize) || 224;
  return {
    nombre: "Clasificador de productos",
    descripcion: "Modelo entrenado con Teachable Machine",
    modelo: "model.json",
    entrada: { alto: lado, ancho: lado, canales: 3 },
    preprocesamiento: { escala: "-1-1", recorte: "centro" },
    salida: "softmax",
    confianzaMinima: 0.7,
    clases: tm.labels.map((etiqueta) => ({ id: etiqueta, nombre: etiqueta })),
  };
}

function normalizar(m) {
  const entrada = m.entrada || {};
  const prep = m.preprocesamiento || {};
  const clases = Array.isArray(m.clases) ? m.clases : [];
  const errores = [];

  if (!(entrada.alto > 0 && entrada.ancho > 0)) errores.push("entrada.alto y entrada.ancho deben ser positivos");
  if (![1, 3].includes(entrada.canales)) errores.push("entrada.canales debe ser 1 (gris) o 3 (color)");
  if (!["sigmoide", "softmax"].includes(m.salida)) errores.push('salida debe ser "sigmoide" o "softmax"');
  if (clases.length < 2) errores.push("clases debe tener al menos 2 elementos");
  if (m.salida === "sigmoide" && clases.length !== 2) errores.push("con salida sigmoide debe haber exactamente 2 clases");
  if (prep.gris && !GRISES.includes(prep.gris)) errores.push(`preprocesamiento.gris debe ser uno de: ${GRISES.join(", ")}`);
  if (prep.escala && !ESCALAS.includes(prep.escala)) errores.push(`preprocesamiento.escala debe ser uno de: ${ESCALAS.join(", ")}`);
  if (prep.recorte && !RECORTES.includes(prep.recorte)) errores.push(`preprocesamiento.recorte debe ser uno de: ${RECORTES.join(", ")}`);

  if (errores.length) throw new Error(`metadata.json no es válido: ${errores.join("; ")}.`);

  return Object.freeze({
    nombre: m.nombre || "Clasificador de imágenes",
    descripcion: m.descripcion || "",
    modelo: m.modelo || "model.json",
    entrada: { alto: entrada.alto, ancho: entrada.ancho, canales: entrada.canales },
    preprocesamiento: {
      gris: prep.gris || "luminancia",
      escala: prep.escala || "0-1",
      recorte: prep.recorte || "estirar",
    },
    salida: m.salida,
    umbral: Number.isFinite(m.umbral) ? m.umbral : 0.5,
    confianzaMinima: Number.isFinite(m.confianzaMinima) ? m.confianzaMinima : 0,
    clases: clases.map((c, i) => ({
      id: c.id || `clase_${i}`,
      nombre: c.nombre || c.id || `Clase ${i + 1}`,
      color: c.color || null,
    })),
    fps: Math.min(Math.max(Number(m.enVivo?.fps) || 4, 1), 15),
    historial: Math.min(Math.max(Number(m.historial) || 6, 1), 24),
  });
}

function nombreArchivo(url) {
  return String(url).split("/").slice(-2).join("/");
}
