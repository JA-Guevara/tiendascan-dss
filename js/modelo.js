// Todo lo que toca TensorFlow.js: backend, carga validada, preprocesamiento y predicción.
// Es genérico: funciona con salida sigmoide (2 clases) o softmax (N clases), gris o color.
/* global tf */

// Pesos para pasar a gris. El cuaderno aplica cv2.COLOR_BGR2GRAY a imágenes RGB,
// por eso en "bgr2gray_sobre_rgb" el rojo pesa 0.114 y el azul 0.299.
const PESOS_GRIS = {
  bgr2gray_sobre_rgb: [0.114, 0.587, 0.299],
  luminancia: [0.299, 0.587, 0.114],
  promedio: [1 / 3, 1 / 3, 1 / 3],
};

const lienzo = document.createElement("canvas");
const contexto = lienzo.getContext("2d", { willReadFrequently: true });

export async function prepararBackend() {
  for (const nombre of ["webgl", "cpu"]) {
    try {
      if (await tf.setBackend(nombre)) {
        await tf.ready();
        return tf.getBackend();
      }
    } catch {
      // Se intenta con el siguiente backend.
    }
  }
  throw new Error("TensorFlow.js no pudo iniciar ningún backend.");
}

export async function cargarModelo(config, urlBase) {
  const url = new URL(config.modelo, urlBase).href;
  const respuesta = await fetch(url, { cache: "no-store" });
  if (!respuesta.ok) {
    const error = new Error(`No se encontró el modelo ${config.modelo} (HTTP ${respuesta.status}).`);
    if (respuesta.status === 404) error.codigo = "SIN_MODELO";
    throw error;
  }

  const json = await respuesta.json();
  const rutas = (json.weightsManifest || []).flatMap((grupo) => grupo.paths || []);
  for (const ruta of rutas) {
    const pesos = await fetch(new URL(ruta, url), { method: "HEAD", cache: "no-store" });
    if (!pesos.ok) throw new Error(`Falta el archivo de pesos ${ruta} junto a ${config.modelo}.`);
  }

  const modelo = await tf.loadLayersModel(url);
  verificarCompatibilidad(modelo, config);

  // Calentamiento: la primera predicción compila los shaders; así la del usuario es rápida.
  const { alto, ancho, canales } = config.entrada;
  tf.tidy(() => { modelo.predict(tf.zeros([1, alto, ancho, canales])).dataSync(); });

  return { modelo, url, parametros: modelo.countParams() };
}

function verificarCompatibilidad(modelo, config) {
  const [, alto, ancho, canales] = modelo.inputs[0].shape;
  const e = config.entrada;
  if (alto !== e.alto || ancho !== e.ancho || canales !== e.canales) {
    throw new Error(`El modelo espera ${alto}×${ancho}×${canales}, pero metadata.json indica ` +
      `${e.alto}×${e.ancho}×${e.canales}.`);
  }
  const salidas = modelo.outputs[0].shape.at(-1);
  const esperadas = config.salida === "sigmoide" ? 1 : config.clases.length;
  if (salidas !== esperadas) {
    throw new Error(`El modelo tiene ${salidas} salida(s) y metadata.json espera ${esperadas} ` +
      `(${config.salida}, ${config.clases.length} clases).`);
  }
}

export function dimensiones(fuente) {
  if (fuente instanceof HTMLVideoElement) return { ancho: fuente.videoWidth, alto: fuente.videoHeight };
  if (fuente instanceof HTMLImageElement) return { ancho: fuente.naturalWidth, alto: fuente.naturalHeight };
  return { ancho: fuente.width, alto: fuente.height };
}

// Convierte la imagen en el arreglo que espera el modelo y dibuja en "vista" lo que el modelo ve.
export function preprocesar(fuente, config, vista) {
  const { alto, ancho, canales } = config.entrada;
  const { gris, escala, recorte } = config.preprocesamiento;
  const origen = dimensiones(fuente);
  if (!origen.ancho || !origen.alto) throw new Error("La imagen todavía no está lista.");

  // La cámara se muestra recortada al centro (visor cuadrado), así que también se recorta al
  // centro para que el modelo vea lo mismo que el usuario. Las imágenes siguen metadata.json.
  let sx = 0, sy = 0, sw = origen.ancho, sh = origen.alto;
  if (recorte === "centro" || fuente instanceof HTMLVideoElement) {
    const lado = Math.min(origen.ancho, origen.alto);
    sx = (origen.ancho - lado) / 2;
    sy = (origen.alto - lado) / 2;
    sw = sh = lado;
  }

  lienzo.width = ancho;
  lienzo.height = alto;
  contexto.drawImage(fuente, sx, sy, sw, sh, 0, 0, ancho, alto);
  const rgba = contexto.getImageData(0, 0, ancho, alto).data;

  const [pr, pg, pb] = PESOS_GRIS[gris];
  const escalar = escala === "-1-1" ? (v) => v / 127.5 - 1 : (v) => v / 255;
  const datos = new Float32Array(alto * ancho * canales);

  for (let p = 0, i = 0; p < rgba.length; p += 4) {
    if (canales === 1) {
      const valor = pr * rgba[p] + pg * rgba[p + 1] + pb * rgba[p + 2];
      datos[i++] = escalar(valor);
      rgba[p] = rgba[p + 1] = rgba[p + 2] = valor;
    } else {
      datos[i++] = escalar(rgba[p]);
      datos[i++] = escalar(rgba[p + 1]);
      datos[i++] = escalar(rgba[p + 2]);
    }
  }

  if (vista) {
    vista.width = ancho;
    vista.height = alto;
    vista.getContext("2d").putImageData(new ImageData(rgba, ancho, alto), 0, 0);
  }
  return datos;
}

export function predecir(modelo, datos, config) {
  const { alto, ancho, canales } = config.entrada;
  const inicio = performance.now();
  const salida = tf.tidy(() =>
    Array.from(modelo.predict(tf.tensor4d(datos, [1, alto, ancho, canales])).dataSync()));
  const ms = performance.now() - inicio;

  if (!salida.every(Number.isFinite)) throw new Error("El modelo devolvió valores no válidos.");

  let probabilidades;
  let indice;
  if (config.salida === "sigmoide") {
    // Sigmoide: un solo valor p = probabilidad de la clase 2; la clase 1 es 1 - p.
    probabilidades = [1 - salida[0], salida[0]];
    indice = salida[0] > config.umbral ? 1 : 0;
  } else {
    probabilidades = salida;
    indice = salida.indexOf(Math.max(...salida));
  }
  return { probabilidades, indice, crudo: salida, ms };
}
