// Script clásico (no es módulo) para que se ejecute incluso al abrir la página con doble clic.
// Con file:// el navegador bloquea los módulos y la lectura de model.json, así que se avisa aquí.
(function () {
  "use strict";
  if (window.location.protocol !== "file:") return;
  window.__abiertoComoArchivo = true;
  var estado = document.getElementById("estado");
  if (!estado) return;
  estado.setAttribute("data-tipo", "error");
  estado.textContent = "Abriste la página con doble clic (file://). Ejecuta iniciar_servidor.bat " +
    "en esta carpeta y abre http://localhost:8001";
})();
