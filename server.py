"""Servidor de producción optimizado para despliegue en la nube (Railway, Render, Fly.io).
Sirve los archivos de TiendaScan DSS con soporte para streaming de modelos TensorFlow.js,
tipos MIME correctos y enlace al puerto asignado por el entorno ($PORT).
"""
import http.server
import os
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
PORT = int(os.environ.get("PORT", 8080))
HOST = "0.0.0.0"

class ProductionHandler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".json": "application/json",
        ".wasm": "application/wasm",
        ".bin": "application/octet-stream",
        ".css": "text/css",
        ".webmanifest": "application/manifest+json",
        "": "application/octet-stream",
    }
    timeout = 60

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(BASE_DIR), **kwargs)

    def end_headers(self):
        path = self.path.split("?")[0]
        # Permitir caché estática de modelos y bibliotecas; revalidar UI y catálogo
        if path.endswith(".bin") or "/modelo/" in path or "/vendor/" in path:
            self.send_header("Cache-Control", "public, max-age=86400")
        else:
            self.send_header("Cache-Control", "no-cache, must-revalidate")
        
        # Permitir acceso seguro a la cámara en el navegador
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Permissions-Policy", "camera=(self)")
        super().end_headers()

    def log_message(self, format, *args):
        sys.stdout.write(f"[{self.log_date_time_string()}] {format % args}\n")
        sys.stdout.flush()

class ThreadedHTTPServer(http.server.ThreadingHTTPServer):
    daemon_threads = True

def main():
    print(f"==================================================")
    print(f" TiendaScan DSS - Servidor de Produccion (Railway)")
    print(f" Escuchando en http://{HOST}:{PORT}")
    print(f" Directorio base: {BASE_DIR}")
    print(f"==================================================")
    server = ThreadedHTTPServer((HOST, PORT), ProductionHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido.")
        server.server_close()

if __name__ == "__main__":
    main()
