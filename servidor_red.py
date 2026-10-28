"""Sirve la app en la red Wi-Fi local para abrirla desde otro equipo o el celular.

Uso: doble clic en iniciar_servidor_red.bat (o: python servidor_red.py)

- HTTPS en el puerto 8443: necesario para usar la CAMARA desde otro equipo o el celular.
  Usa un certificado propio (autofirmado), por eso el navegador muestra una advertencia
  la primera vez: «Configuracion avanzada» -> «Continuar».
- HTTP en el puerto 8002: sirve para fotos, pero los navegadores bloquean la camara
  (salvo en este mismo equipo, con http://localhost:8002/).

El certificado esta en la carpeta ..\\_certificado_local (fuera de la app). No lo subas a
GitHub ni lo compartas. Solo usa la biblioteca estandar de Python.
"""
import http.server
import socket
import ssl
import sys
import threading
from pathlib import Path

APP = Path(__file__).resolve().parent
CERTIFICADOS = APP.parent / "_certificado_local"
CERT = CERTIFICADOS / "certificado.pem"
CLAVE = CERTIFICADOS / "clave.pem"
PUERTO_HTTPS = 8443
PUERTO_HTTP = 8002  # distinto de iniciar_servidor.bat (8001) para poder usar los dos
ERRORES_DE_RED = (ssl.SSLError, ConnectionError, TimeoutError, OSError)


class Manejador(http.server.SimpleHTTPRequestHandler):
    # En Windows, el registro a veces asigna .js como text/plain y los modulos no cargan.
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json",
        ".wasm": "application/wasm", ".css": "text/css",
        ".webmanifest": "application/manifest+json", "": "application/octet-stream",
    }
    timeout = 60  # segundos sin actividad antes de cerrar una conexion colgada

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(APP), **kwargs)

    def setup(self):
        # El saludo TLS se hace aqui, en el hilo de cada conexion: un navegador que
        # se queda en la pantalla de advertencia no bloquea a los demas.
        if isinstance(self.request, ssl.SSLSocket):
            self.request.settimeout(15)
            self.request.do_handshake()
        super().setup()

    def end_headers(self):
        # "no-cache" (revalidar), no "no-store": con no-store Chromium deja colgadas
        # las descargas paralelas de los pesos del modelo.
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, formato, *args):
        pass  # sin ruido en la ventana


class Servidor(http.server.ThreadingHTTPServer):
    daemon_threads = True

    def handle_error(self, request, client_address):
        if not isinstance(sys.exc_info()[1], ERRORES_DE_RED):
            super().handle_error(request, client_address)


class ServidorHTTPS(Servidor):
    def __init__(self, direccion, contexto):
        super().__init__(direccion, Manejador)
        self.contexto = contexto

    def get_request(self):
        conexion, direccion = self.socket.accept()
        return self.contexto.wrap_socket(conexion, server_side=True,
                                         do_handshake_on_connect=False), direccion


def ips_locales():
    """IPs de este equipo en la red local (no envia datos a internet)."""
    ips = []
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))
        ips.append(s.getsockname()[0])
    except OSError:
        pass
    finally:
        s.close()
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ip = info[4][0]
            if ip not in ips and not ip.startswith(("127.", "169.254.")):
                ips.append(ip)
    except OSError:
        pass
    return ips or ["127.0.0.1"]


def servir(servidor):
    threading.Thread(target=servidor.serve_forever, daemon=True).start()


def main():
    ips = ips_locales()
    try:
        servir(Servidor(("0.0.0.0", PUERTO_HTTP), Manejador))
    except OSError:
        print(f"  El puerto {PUERTO_HTTP} esta ocupado (¿otro servidor abierto?). Cierralo y vuelve a intentar.")
        input("  Enter para salir...")
        return

    https_ok = CERT.is_file() and CLAVE.is_file()
    if https_ok:
        contexto = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        contexto.load_cert_chain(str(CERT), str(CLAVE))
        try:
            servir(ServidorHTTPS(("0.0.0.0", PUERTO_HTTPS), contexto))
        except OSError:
            https_ok = False
            print(f"  El puerto {PUERTO_HTTPS} esta ocupado: solo HTTP.")

    print()
    print("  Inventario de botellas - servidor para la red Wi-Fi")
    print("  ----------------------------------------------------")
    if https_ok:
        print(f"  Desde otro equipo o el celular (con camara):  https://{ips[0]}:{PUERTO_HTTPS}/")
    else:
        print(f"  Falta el certificado en {CERTIFICADOS}: solo HTTP (sin camara en otros equipos).")
    print(f"  Solo fotos, sin camara:                       http://{ips[0]}:{PUERTO_HTTP}/")
    print(f"  En este mismo equipo (con camara):            http://localhost:{PUERTO_HTTP}/")
    if len(ips) > 1:
        print(f"  Si la direccion de arriba no abre, prueba con: {', '.join(ips[1:])}")
    print()
    print("  - Los dos equipos deben estar en la misma red Wi-Fi.")
    print("  - Si Windows pregunta por el Firewall, permite el acceso en redes privadas.")
    print("  - La primera vez el navegador avisa que la conexion no es privada:")
    print("    Configuracion avanzada -> Continuar. Luego permite la camara.")
    print("  - Deja esta ventana abierta. Cierrala para detener el servidor.")
    print()
    try:
        threading.Event().wait()
    except KeyboardInterrupt:
        sys.exit(0)


if __name__ == "__main__":
    main()
