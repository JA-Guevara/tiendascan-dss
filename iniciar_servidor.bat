@echo off
REM Levanta un servidor local para que el navegador pueda leer el modelo y los datos
cd /d "%~dp0"
echo.
echo   Inventario de botellas: http://localhost:8001/index.html
echo   Deja esta ventana abierta mientras lo usas. Cierrala para detener el servidor.
echo   Si la pagina carga en blanco, pulsa F5.
echo.
start "" "http://localhost:8001/index.html"
python -m http.server 8001 --bind 127.0.0.1 || py -m http.server 8001 --bind 127.0.0.1
pause
