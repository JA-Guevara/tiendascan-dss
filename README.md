# Inventario de botellas

## Abrir
Ejecuta `iniciar_servidor.bat`. Usa la dirección local indicada y recarga con Ctrl+F5.
No abras el HTML con doble clic. La cámara del celular requiere HTTPS.

## Flujo actual
1. Elige una foto o activa la cámara. Pulsa Detectar botellas o En vivo.
2. COCO-SSD dibuja recuadros y propone cuántas botellas se ven.
3. Selecciona el producto del catálogo o pulsa Registrar producto nuevo.
4. Revisa la cantidad y pulsa Confirmar entrada. Se guarda un único movimiento
   con esa cantidad, origen y confianza promedio de detección.
5. Una toma confirmada no se puede ingresar otra vez hasta pulsar Nueva toma,
   elegir otra foto o cambiar de fuente. Una toma nueva puede contener la misma
   botella física: no existe identificación única entre tomas.

El detector reconoce la categoría botella, no marcas ni presentaciones.
Para una imagen con productos diferentes, sepáralos en tomas y confirma cada producto.
No se agregan existencias automáticamente en cada fotograma. Las ventas y entradas
manuales siguen disponibles en las tarjetas y en el producto seleccionado.
Registrar una foto en el catálogo no entrena la red. Al crear un producto durante
una detección usa stock inicial 0 si vas a confirmar después esa misma entrada.

## Archivos
- `index.html`: interfaz principal.
- `css/`: estilos.
- `js/main.js`: coordinación e ingreso de detecciones.
- `js/detector.js`: COCO-SSD y recuadros.
- `js/inventario.js`: catálogo, movimientos, reposición y exportaciones.
- `js/catalogo.js`: registro y edición de productos.
- `assets/logos/`: imágenes de interfaz.
- `vendor/`: TensorFlow.js 4.22.0 y COCO-SSD 2.2.3 locales.
- `modelo/detector/`: modelo preentrenado oficial SSD MobileNet v2 y pesos.
- `modelo/model.json` y los dos BIN anteriores: red binaria del colega conservada
  como referencia, no utilizada por el flujo actual. El detector funciona por sí solo.
- `entrenamiento/`: cuaderno opcional para entrenar por productos; no es requisito
  para detectar botellas genéricas.
- `data/`: catálogo base. Los cambios y movimientos se guardan en este navegador.

Exporta JSON para conservar catálogo, fotos y movimientos; CSV contiene movimientos.
El detector y las bibliotecas están instalados localmente y no necesitan CDN al abrir.
La primera carga requiere memoria y puede tardar en equipos modestos.

## Validación
Comprobadas sintaxis, referencias de controles, carga del modelo real e inferencia
con tensor de prueba, ingreso de múltiples unidades, validación de cantidades,
deshacer y persistencia. Pendiente la verificación visual en navegador y con cámara
física. La inferencia técnica no demuestra precisión con botellas reales.

Referencias: implementación local de `reciclaapp.io/index.html`, biblioteca oficial
https://github.com/tensorflow/tfjs-models/tree/master/coco-ssd y pesos oficiales
https://storage.googleapis.com/tfjs-models/savedmodel/ssd_mobilenet_v2/model.json

La carpeta ajena `Uagrm/` no pertenece a la aplicación: excluirla de cualquier publicación.


## Identificación mediante modelo y fotos de referencia

Se reemplazó la comparación de píxeles por un extractor MobileNet V1 preentrenado
con ImageNet. El modelo produce 1024 características por imagen; la similitud coseno
se compara contra hasta 6 referencias por producto. No se entrenó desde cero una
red especializada en las marcas del catálogo.

El detector recorta una botella antes de identificarla. Si hay varias botellas,
se permite contar, pero se pide seleccionar el producto manualmente. Las fotos de
referencia antiguas también se recortan cuando el detector encuentra una sola botella.

En Editar producto, añade fotos de la misma marca y presentación desde diferentes
ángulos, fondos y luces, o usa Añadir captura actual como referencia. Las referencias
se guardan junto con el catálogo en este navegador y se incluyen en la exportación JSON.
Los vectores se calculan localmente y se conservan en memoria durante la sesión.
No se envían fotografías a ningún servicio.

Si la similitud supera 0.88 y aventaja al segundo producto por 0.06 se selecciona automáticamente el producto y se muestra su stock. Estos son umbrales conservadores iniciales, pendientes de calibrar
con fotos reales del catálogo; no representan probabilidad de acierto. El usuario
confirma la selección y el movimiento. Si no hay coincidencia clara no se crea un
producto automáticamente. No se leen etiquetas o códigos de barras automáticamente.
Botellas casi iguales de distinto volumen pueden requerir selección manual.

`modelo/identificador/` incluye pesos locales y configuración del extractor.
Probado el modelo real con una foto de botella: salida finita de 1024 características,
similitud de la misma imagen 1.0000 y con brillo +5 % 0.9993. Verificadas sintaxis,
controles, gestión de seis referencias, fotos antiguas y rechazo por ambigüedad.
No se midió todavía precisión por producto ni se verificó visualmente en navegador.

Referencia oficial de extracción de características y aprendizaje por transferencia:
https://github.com/tensorflow/tfjs-examples/tree/master/webcam-transfer-learning


## Resultado automático
Una coincidencia clara ahora actualiza directamente el nombre, presentación, stock
y selector del resultado. La detección se pausa para revisar e ingresar la cantidad.
No se exige un segundo botón Usar producto. Nueva toma limpia el resultado y reanuda
la cámara. Si al reanalizar deja de haber coincidencia, se elimina la selección
automática anterior. Una selección manual explícita se respeta.
Las tarjetas indican cuántas fotos tienen para reconocimiento; no etiquetan todos
los productos como seleccionados manualmente.
Verificado con simulación del flujo: coincidencia → producto/stock; sin coincidencia
→ limpiar selección anterior; preservar selección manual. Pendiente comprobar la
pantalla real tras recargar.


## Mejora con una sola referencia: envase y etiqueta

La identificación ahora localiza la zona de la etiqueta y compara dos descriptores
MobileNet (envase completo y etiqueta), además del color de esta última. Los pesos,
umbral y requisitos de compatibilidad están documentados en
`modelo/identificador/configuracion.json`. La comparación simple del envase se
sustituyó por este resultado combinado. Si no se encuentra etiqueta con color, se
exige una coincidencia del envase mucho más estricta. Sigue siendo posible rechazar
un producto conocido cuando hay cambios grandes de diseño, poca luz o una etiqueta
sin color; no se lee la marca ni el volumen mediante OCR.

Con una referencia Sprite, la otra imagen Sprite pasa y Vital se rechaza. Hay un
segundo control de otra botella de agua. Resultados reales en
`pruebas/resultados-sprite.json`. Repetir con:
`node pruebas/reconocimiento-real.cjs referencia consulta [controles...]`
Requiere Node, Python y Pillow. Usa los modelos locales y no envía imágenes a internet.

Los umbrales de esta sección sustituyen los anteriores: combinado 0.80, margen 0.08,
con mínimos individuales para envase, etiqueta y color. Solo se verificaron estos
casos; no se afirma que se distingan todas las marcas o tamaños. No se necesita añadir
las dos fotos Sprite al mismo producto para reproducir esta prueba.


## Corrección general de identidad
Se conservan descriptores de la foto original y del recorte detectado, tanto en la
consulta como en la referencia. Esto evita perder la identidad cuando una foto
registrada ya estaba recortada y el detector la volvía a recortar de otra manera.
Una comparación casi idéntica exige coincidencia neuronal del envase y etiqueta y
coincidencia adicional de píxeles reducidos. Una identidad única tiene prioridad
sobre candidatos parecidos; dos registros con la misma foto se muestran como
ambiguos, sin asignarlos silenciosamente. Si no hay recuadro, se permite buscar la
identidad; ingresar una cantidad sin detección sigue requiriendo confirmación manual.
Las pruebas del modelo real verificaron identidad de cada una de las dos Sprite,
Vital y otra botella de agua. Los controles negativos anteriores siguen rechazados.
Falta verificar con el catálogo del navegador del usuario: las pruebas no leen ni
modifican ese almacenamiento.


## Identificación combinada con lectura de etiqueta

Se instaló Tesseract.js 6.0.1 y sus datos y núcleos WASM en `vendor/ocr/`.
El procesamiento se realiza localmente. La captura para leer conserva mayor
resolución que la miniatura usada por MobileNet. Se examina la zona de la etiqueta
en color, con letras claras y oscuras, usando segmentación dispersa y de bloque.

La lectura se contrasta con la marca/nombre y presentación estructurados del catálogo.
Marca más volumen coincidentes pueden identificar un producto sin depender de que
la silueta sea idéntica. Un volumen leído contradictorio bloquea la asignación aunque
la imagen sea parecida. Si solo se lee la marca, se ofrecen presentaciones del
catálogo para confirmar, sin inventar un tamaño. Los datos leídos también se proponen
al abrir Registrar producto nuevo. La lectura no garantiza interpretar todos los
logos o letras pequeñas y no sustituye un lector de código de barras.

Verificaciones: `node pruebas/etiquetas.test.mjs` cubre 500ml frente a 2L,
marca/volumen, falta de texto y base nutricional de 100ml. `pruebas/ocr-real.cjs`
ejecuta OCR sobre archivos locales en un entorno temporal con Tesseract.js.
Con las fotos disponibles lee Sprite en ambas imágenes, 500ml en sprite-pet.webp,
y Vital en vital.webp. En las otras no se pudo confirmar el contenido; no se afirma
que se hayan leído todos los textos. La página de prueba `pruebas/lector.html`
confirmó en navegador la lectura de una etiqueta sintética LIMONIA 990ml.

Se verificó la carga de detector e identificador en la interfaz. La prueba de carga
con fotos reales en navegador no se completó: se rechazó el permiso de carga. No se
modificó el catálogo del navegador habitual del usuario. Las pruebas de fotos reales
se hicieron fuera del navegador y no demuestran por sí solas precisión general.
# tiendascan-dss
