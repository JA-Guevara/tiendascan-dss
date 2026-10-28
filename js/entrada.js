// Fuentes de imagen: cámara (frontal/trasera), archivo, arrastrar y soltar, pegar.

const TAMANO_MAXIMO = 15 * 1024 * 1024; // 15 MB

export class Camara {
  constructor(video) {
    this.video = video;
    this.stream = null;
    this.orientacion = "environment"; // trasera en el celular
  }

  get activa() {
    return Boolean(this.stream);
  }

  lista() {
    return this.activa && this.video.readyState >= 2 && this.video.videoWidth > 0;
  }

  async iniciar() {
    this.detener();
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("La cámara necesita https:// o http://localhost y un navegador compatible.");
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: this.orientacion }, width: { ideal: 640 }, height: { ideal: 640 } },
      });
    } catch (error) {
      throw new Error(mensajeCamara(error));
    }
    this.video.srcObject = this.stream;
    try {
      await this.video.play();
    } catch (error) {
      this.detener();
      throw error;
    }
    const ajustes = this.stream.getVideoTracks()[0]?.getSettings?.() || {};
    this.video.classList.toggle("espejo", (ajustes.facingMode || this.orientacion) === "user");
  }

  async cambiar() {
    this.orientacion = this.orientacion === "user" ? "environment" : "user";
    await this.iniciar();
  }

  detener() {
    this.stream?.getTracks().forEach((pista) => pista.stop());
    this.stream = null;
    this.video.srcObject = null;
  }
}

function mensajeCamara(error) {
  switch (error?.name) {
    case "NotAllowedError": return "Permiso de cámara denegado. Habilítalo en el candado de la barra de direcciones.";
    case "NotFoundError": return "No se encontró ninguna cámara en este equipo.";
    case "NotReadableError": return "La cámara está en uso por otra aplicación.";
    default: return `No se pudo activar la cámara: ${error?.message || error}`;
  }
}

// Carga un archivo de imagen en el <img> indicado. Devuelve una promesa que se resuelve al cargar.
export function cargarImagen(archivo, img) {
  return new Promise((resolver, rechazar) => {
    if (!archivo) return rechazar(new Error("No se seleccionó ningún archivo."));
    if (!archivo.type.startsWith("image/")) return rechazar(new Error("El archivo no es una imagen."));
    if (archivo.size > TAMANO_MAXIMO) return rechazar(new Error("La imagen supera los 15 MB."));

    const url = URL.createObjectURL(archivo);
    img.onload = () => { URL.revokeObjectURL(url); resolver(img); };
    img.onerror = () => { URL.revokeObjectURL(url); rechazar(new Error("No se pudo abrir la imagen. Prueba con JPG, PNG o WEBP.")); };
    img.src = url;
  });
}

// Arrastrar y soltar sobre el visor, y pegar (Ctrl+V) en cualquier parte de la página.
export function escucharArchivos(visor, alRecibir) {
  const evitar = (e) => { e.preventDefault(); e.stopPropagation(); };
  ["dragenter", "dragover"].forEach((tipo) => visor.addEventListener(tipo, (e) => {
    evitar(e);
    visor.classList.add("arrastrando");
  }));
  ["dragleave", "drop"].forEach((tipo) => visor.addEventListener(tipo, (e) => {
    evitar(e);
    visor.classList.remove("arrastrando");
  }));
  visor.addEventListener("drop", (e) => {
    const archivo = e.dataTransfer?.files?.[0];
    if (archivo) alRecibir(archivo);
  });
  document.addEventListener("paste", (e) => {
    const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith("image/"));
    if (item) alRecibir(item.getAsFile());
  });
}
