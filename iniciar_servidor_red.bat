@echo off
REM Sirve la app en la red Wi-Fi para abrirla desde otro equipo o el celular.
REM Muestra la direccion a usar. Deja la ventana abierta; cierrala para detener el servidor.
cd /d "%~dp0"
python servidor_red.py || py servidor_red.py
pause
