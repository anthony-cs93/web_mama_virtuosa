# Ventas y pedidos — carrito, checkout, pagos y panel admin

Cómo funciona la compra en **Mamá Virtuosa by Angie**, de punta a punta: del carrito del cliente a la gestión del pedido en `/admin/`.

## 1. Vista general

```
Tienda (#/producto/…)        #/checkout                         #/pedido/CÓDIGO/TOKEN
  Carrito (localStorage) ──▶ Datos + entrega + pago ──────────▶ Seguimiento + instrucciones de pago
  js/app.js                   js/app.js                          js/app.js
                                   │ POST /api/orders                │ GET /api/orders?c=&t=
                                   ▼                                  ▼
                        api/orders.js + api/_orders.js ──▶ Vercel Blob  pedidos/<CÓDIGO>-<token>.json
                                                                       ▲
                                    /admin → Pedidos ──────────────────┘  (api/orders-admin.js)
```

Principios de diseño:

- **El servidor manda sobre los precios.** El navegador solo envía qué producto, opción y cantidad quiere el cliente. Precios, cupón, envío y recargo se recalculan en `buildOrder()` ([api/_orders.js](../api/_orders.js)) contra el catálogo publicado. Lo que se ve en pantalla es una vista previa.
- **Cada pedido es un archivo JSON propio** en Vercel Blob (`pedidos/<CÓDIGO>-<token>.json`). El `token` es aleatorio (128 bits): solo quien tiene el enlace puede ver el pedido. El listado completo solo lo ve el panel.
- **Sin pasarela obligatoria.** Se paga por Yape/Plin, transferencia (BCP) o tarjeta mediante un link de pago que Angie envía por WhatsApp. Nunca se piden datos de tarjeta en la web.
- **Los datos de pago se editan en el panel** (Ajustes → Medios de pago), no en el código.

## 2. Archivos

| Archivo | Rol |
|---|---|
| [js/app.js](../js/app.js) | Carrito, checkout (`#/checkout`), página del pedido (`#/pedido/…`), «Mis pedidos» (`#/pedidos`). |
| [api/orders.js](../api/orders.js) | API pública de pedidos (crear, consultar, cupón, comprobante). |
| [api/_orders.js](../api/_orders.js) | Lógica: validación, precios, cupones, almacenamiento, comprobante, aviso por correo. Los archivos con `_` no son rutas. |
| [api/orders-admin.js](../api/orders-admin.js) | Pedidos para el panel (listar y cambiar estado). Requiere sesión. |
| [api/_lib.js](../api/_lib.js) | Sesión, lectura/escritura del catálogo, medios de pago por defecto y normalización de cupones. |
| [api/data.js](../api/data.js) | Datos públicos de la tienda. **No incluye los cupones.** |
| [admin/admin.js](../admin/admin.js) | Panel: pestaña **Pedidos** y, en **Ajustes**, medios de pago y cupones. |
| [dev-server.js](../dev-server.js) | Servidor local (`npm run dev`). |

## 3. Carrito

- **Estado**: `localStorage`, clave `mv_cart`. Cada línea: `{ id, opt, qty }` (`opt` = talla/color).
- **Reglas**: máximo **10 unidades por línea**. No se controla stock. Al cargar se descartan productos que ya no existen, están ocultos o cuya opción ya no es válida.
- **Agregar**: «Agregar al carrito» muestra el aviso «✓ Agregado al carrito · Ver carrito» sin sacar al cliente de la página; «Comprar ahora» lleva directo al checkout.
- **Cupón**: se valida contra el servidor (`POST /api/orders?op=coupon`). El carrito guarda `{code, type, value, min}` solo para mostrar el descuento; al confirmar, el servidor lo valida de nuevo.
- **Resumen**: subtotal, ahorro por ofertas, cupón, barra de **envío gratis en Lima** (desde `freeShippingFrom`) y la línea «Paga con Yape, Plin, transferencia…» según los medios activos.

## 4. Checkout (`#/checkout`)

Una sola página con tres tarjetas numeradas y el resumen al lado (en celular, desplegable arriba):

1. **Tus datos**: nombres y apellidos en un solo campo, celular de 9 dígitos (WhatsApp), correo opcional y la casilla **«Necesito boleta»**, que al marcarla muestra el campo de **DNI** (8 dígitos). Los campos obligatorios llevan asterisco (*).
2. **Entrega**: Delivery Lima, Agencia a provincia o Recojo en punto, con su costo y plazo (de Ajustes → Envíos). **Delivery Lima** pide el distrito en un **menú desplegable** (los 50 distritos de Lima y Callao; los que no tienen reparto aparecen deshabilitados como «sin reparto», con enlace para consultar por WhatsApp) y la dirección; el costo de envío sale del distrito elegido; provincia pide además departamento y provincia («agencia y dirección»); **Recojo en tienda** (Jr. San José #389 - Comas, con enlace a Google Maps) no pide dirección.
3. **Forma de pago**: Yape/Plin, Transferencia bancaria (BCP) y Tarjeta (link por WhatsApp). Cada una explica qué pasa al confirmar.

Además: nota opcional de hasta 300 caracteres y aceptación de términos.

**Experiencia de formulario**
- Los errores aparecen al salir de cada campo y se corrigen en vivo al escribir; al confirmar con errores el foco va al primero.
- Los datos del cliente (sin nota ni documentos) se recuerdan en `mv_fields` para la próxima compra.
- El botón muestra el total y «Enviando tu pedido…» mientras se procesa; los errores del servidor aparecen sobre el botón.
- Campo trampa `website` (honeypot) contra bots; el servidor lo rechaza si viene lleno.
- Se puede cambiar la cantidad o quitar productos desde el propio resumen.

### Cálculo del total

```
subtotal   = Σ precio_actual × cantidad          (precio del catálogo, nunca del navegador)
descuento  = cupón (solo sobre productos)
envío      = costo del distrito (Lima/Callao) o de la zona (provincia); 0 en Lima si subtotal ≥ freeShippingFrom; 0 en recojo
recargo    = (subtotal − descuento + envío) × % recargo   solo si paga con tarjeta
TOTAL      = subtotal − descuento + envío + recargo
```

### Cupones

Reglas (`evaluateCoupon`): debe existir y estar **activo**; no estar **vencido** (vence al final del día indicado, hora de Lima); cumplir la **compra mínima** (sobre el subtotal de productos); el descuento (**% o S/**) nunca supera el subtotal. Ante un código inválido el servidor espera 0.5 s antes de responder, para frenar la búsqueda de códigos.

Los cupones **no son públicos**: `api/data.js` los elimina. Se crean en el panel → Ajustes → **Cupones**. El formato antiguo (`"BIENVENIDA10": 0.1`) se convierte solo al leerse.

## 5. Página del pedido (`#/pedido/CÓDIGO/TOKEN`)

Al confirmar, el cliente llega aquí (el enlace funciona desde cualquier dispositivo). El código tiene la forma `MV-XXXXXX` (6 caracteres sin letras ambiguas). El pedido también queda en «Mis pedidos» (`#/pedidos`, guardado en `mv_orders` de ese dispositivo).

Contenido: **seguimiento con pasos y fecha**, instrucciones de pago según el medio, entrega con plazo, resumen y botón de WhatsApp con el pedido ya escrito.

`Esperando pago → Comprobante en revisión (Yape/transferencia) → Pago confirmado → En preparación → Listo para recoger / En camino → Entregado` (y `Cancelado`).

## 6. Medios de pago

Se configuran en el panel → Ajustes → **Medios de pago** (cada uno se puede activar o apagar):

| Medio | Recargo | Cómo funciona |
|---|---|---|
| **Yape / Plin** | 0 | Se muestra monto exacto, número y titular (con botón copiar) y QR si hay imagen. El cliente paga y **sube el comprobante**. |
| **Transferencia** | 0 | Banco, cuenta, CCI y titular (con botón copiar). Igual: **sube el comprobante**. |
| **Tarjeta** | configurable (`card.surcharge`, 0 por defecto) | No hay pasarela en el sitio. El cliente pide su **link de pago por WhatsApp** (mensaje ya armado con el pedido) y Angie se lo envía. |

Si Yape o la transferencia no tienen datos cargados, el cliente ve «Te enviamos los datos de pago por WhatsApp» con un botón para pedirlos.

**Comprobante**: la foto se reduce en el navegador (máx. 1400 px, JPEG) y se envía con `POST /api/orders?op=proof`. El servidor valida el tipo real de imagen (máx. 3 MB), la guarda en Blob (`comprobantes/`), pasa el pedido a «Comprobante en revisión», lo anota en el historial y avisa por correo si está configurado. Solo se admite en pedidos Yape/transferencia en estado `pending` o `review`; se puede subir otro si el primero estaba mal.

## 7. Panel admin → Pedidos

Pestaña **Pedidos** (primera de la barra), con un **contador rojo** de pagos por confirmar. Los pedidos **se guardan al instante** (no usan «Guardar cambios»).

- **Lista**: más recientes primero; código, cliente, fecha, medio de pago, total y estado. Filtros: **Por atender** · Por confirmar pago · Pagados · Entregados · Cancelados · Todos.
- **Detalle** (al hacer clic): cliente y contacto, boleta/factura, nota, entrega y dirección, productos, desglose, **comprobante** (imagen ampliable) e historial.
- **Acciones**: **Confirmar pago** (con confirmación), **cambiar estado** (se elige y se aplica con «Guardar estado»), **Cancelar** (ventana con motivo opcional que ve el cliente, y aviso «ya estaba pagado: devuelve su dinero»), **WhatsApp al cliente** y **Ver página del cliente**.
- **Estados**: `pending` · `review` · `paid` · `preparing` · `ready` · `delivered` · `cancelled`. Cada cambio queda en el historial con fecha.
- **Stock**: no se descuenta solo al vender (evita pisar lo que se edita en Productos). Se valida al crear el pedido, pero conviene ajustarlo en **Productos** al confirmar el pago.

## 7b. Panel admin → Envíos

Pestaña **Envíos** con dos bloques:

- **Zonas de entrega**: «Envío gratis en Lima desde», y nombre/plazo de Delivery Lima, Agencia a provincia (con su costo) y Recojo en tienda. Cada modalidad se puede **activar o desactivar**: las desactivadas no aparecen en el checkout y el servidor las rechaza (siempre debe quedar al menos una activa).
- **Delivery Lima: costo por distrito**: tabla de 50 distritos (43 de Lima + 7 del Callao) con **¿Se envía? (Sí/No)**, **costo** y **observación**. Las filas «No» se ven en gris y las «Sí» sin costo en rojo (al guardar quedan como sin reparto). Estos distritos alimentan el desplegable del checkout, y el servidor vuelve a validar el distrito y su costo al crear el pedido.
- **Importar Excel / Descargar Excel**: la plantilla es [costos-envio-distritos.xlsx](../costos-envio-distritos.xlsx) (hoja «Envíos»; creada a partir de la hoja CDM de AC Mueblería, con sus costos iniciales). Se edita en Excel, se importa y se pulsa **Guardar cambios**. El lector de Excel (SheetJS) se carga solo al importar o descargar. Los nombres de distrito son fijos: no se agregan ni se borran filas.

## 8. API

### Pública — `/api/orders`

Todas las escrituras exigen la cabecera `X-Requested-With: mv-shop`.

| Método | Parámetros | Función |
|---|---|---|
| `POST` | `{ name, phone, email?, items:[{id,opt,qty}], ship, address:{depto,prov,distrito,dir,ref}, pay, coupon?, doc?:{type:'boleta',dni}, notes?, website }` | Crea el pedido. Devuelve `{ code, token }`. |
| `GET` | `?c=CÓDIGO&t=TOKEN` | Estado del pedido (`publicOrder`: sin teléfono, correo, DNI/RUC ni dirección). |
| `POST` | `?op=coupon` `{ code, subtotal }` | Valida el cupón y devuelve su regla y descuento. |
| `POST` | `?op=proof` `{ c, t, img }` | Sube el comprobante (data URL). |

Validaciones del servidor: producto existente y visible (no oculto); cantidad 1–10; opción válida (talla/color); celular de 9 dígitos; dirección según la zona; medio de pago activo; DNI de 8 dígitos si pide boleta; honeypot.

### Admin — `/api/orders-admin` (requiere sesión)

`GET` lista los pedidos · `POST { code, status, note? }` cambia el estado (exige además `X-Requested-With: mv-admin`).

## 9. Almacenamiento

| Dato | Dónde |
|---|---|
| Catálogo, medios de pago, cupones, envíos | `store.json` en Vercel Blob |
| Pedidos | `pedidos/<CÓDIGO>-<token>.json` en Vercel Blob |
| Comprobantes | `comprobantes/` en Vercel Blob (públicos, con nombre aleatorio) |
| Carrito y datos recordados | `localStorage` del cliente (`mv_cart`, `mv_coupon`, `mv_fields`, `mv_orders`) |

**Modo local** (`npm run dev`, sin variables de Blob): todo se guarda en `.data/` y no toca lo publicado. Clave del panel local: `dev` (o la que definas en `ADMIN_PASSWORD`). Subir fotos y QR requiere Blob.

## 10. Variables de entorno (Vercel)

| Variable | Para qué | Obligatoria |
|---|---|---|
| `BLOB_READ_WRITE_TOKEN` | Almacenamiento (Vercel Blob) | Sí |
| `ADMIN_PASSWORD` | Clave del panel | Sí |
| `SESSION_SECRET` | Firma de la sesión | Recomendada |
| `RESEND_API_KEY` + `ORDERS_NOTIFY_EMAIL` | Avisos por correo de pedidos nuevos, comprobantes y pagos confirmados | No (sin ellas no se envían correos) |
| `ORDERS_FROM_EMAIL` | Remitente (por defecto el de pruebas de Resend) | No |

## 11. Seguridad y privacidad

- Precios y totales **siempre** los calcula el servidor.
- El enlace del pedido incluye un token de 128 bits; el listado completo solo lo ve el panel.
- La vista pública del pedido no incluye teléfono, correo, DNI/RUC ni dirección.
- Los cupones no se exponen en `/api/data.js`.
- Todo el contenido del cliente se escapa antes de mostrarse (tienda, panel y correos).
- No se piden ni guardan datos de tarjeta.
- **Pendiente de decisión**: el DNI/RUC se guarda en el pedido; no hay purga automática de pedidos antiguos.

## 12. Puesta en marcha / mantenimiento

1. Definir las variables de §10 en Vercel y desplegar.
2. En `/admin/` → **Ajustes**: cargar **Medios de pago** (número de Yape, cuenta, CCI, titular, recargo de tarjeta), revisar **Envíos** y crear los **Cupones**; **Guardar cambios**.
3. Hacer una **compra de prueba** por cada medio de pago y revisarla en **Pedidos**.
4. Probar sin afectar lo publicado: `npm run dev`.

## 13. Pendientes recomendados

- Dirección del punto de recojo (hoy se coordina por WhatsApp).
- Pasarela automática (Izipay / Mercado Pago) para cobrar tarjeta sin intervención.
