# Mamá Virtuosa by Angie — Tienda online

Tienda para mamá y peques: belleza, bebé y niños, ropa infantil, gomitas saludables y un podcast. Moneda: soles peruanos (S/). Idioma: español.

## Stack

| Capa | Tecnología |
|---|---|
| Marcado | HTML5 semántico, una sola página (`index.html`) |
| Estilos | CSS plano con variables (`css/styles.css`), sin preprocesador ni framework |
| Lógica | JavaScript vanilla (ES2020), sin dependencias ni paso de build |
| Navegación | SPA con rutas por hash (`#/…`) |
| Persistencia | `localStorage` (carrito, cupón, contador de pedidos) |
| Fuentes | Google Fonts (Quicksand, Sacramento) |
| Servidor local | `python -m http.server 5173` (ver `.claude/launch.json`) |

Para correr en local:

```bash
python -m http.server 5173
```

Luego abrir <http://localhost:5173>.

## Estructura

```
index.html        Estructura base: cabecera, nav, <main id="app">, pie, menú móvil
css/styles.css    Tokens, componentes y responsive
js/config.js      Ajustes editables: WhatsApp, redes, cupones, envío gratis
js/data.js        Catálogo, megamenú, episodios, envíos, pagos, textos de ayuda
js/app.js         Router, páginas, carrito, checkout, podcast, filtros
```

## Rutas

| Ruta | Pantalla |
|---|---|
| `#/` | Inicio |
| `#/categoria/<cat>[/<sub>]` | Categoría o subcategoría |
| `#/ofertas` | Productos con descuento |
| `#/buscar/<texto>` | Resultados de búsqueda |
| `#/producto/<id>` | Detalle de producto |
| `#/carrito` | Carrito |
| `#/checkout` | Datos → Pago → Listo |
| `#/podcast` | Podcast y reproductor |
| `#/ayuda/envios`, `#/ayuda/cambios` | Páginas de ayuda |

## Colores

Definidos como variables en `:root` de `css/styles.css`.

| Variable | Valor | Uso |
|---|---|---|
| `--ink` | `#2a2230` | Texto, botones principales, barra superior y pie |
| `--muted` | `#5a4d62` | Texto secundario |
| `--soft` | `#74667e` | Precios tachados, iconos tenues |
| `--cream` | `#fffcf6` | Fondo de la tienda |
| `--page` | `#f1ecfd` | Fondo de página y bloques suaves |
| `--line` | `#eadff0` | Bordes y separadores |
| `--field` | `#d4c6e6` | Borde de campos y chips |
| `--pink` | `#fbbad9` | Carrito, barra de envío gratis, acentos |
| `--plum` | `#a2449c` | Acento principal, enlaces, estados activos |
| `--plum-d` | `#7a2f75` | Hover de enlaces |
| `--lav` | `#e4defd` | Bloque del podcast, notas de pago |
| `--lav-ink` | `#4a3f8f` | Texto sobre lavanda |
| `--mint` | `#c8fcc8` | Portadas del podcast |
| `--wa` / `--wa-ink` / `--wa-line` | `#2f8a46` / `#2f6a3b` / `#3f7d4a` | WhatsApp |

Fondos de producto (campo `tone` en `js/data.js`): `#fdd9ea`, `#e8d5e6`, `#fbbad9`, `#dcd5fb`, `#fcf3c0`, `#f8dcc6`, `#d9fcd5`, `#c8fcf4`.

Degradado de la portada: `linear-gradient(115deg, #fcfcc8, #f8dcc6, #fbbad9, #c8befa, #c8fcf4, #ccfcc8)`.

## Tipografía

- **Sacramento** (script): logo, títulos de sección y de producto, precios de bloques decorativos. Tamaños típicos: 27–80 px.
- **Quicksand** (sans, pesos 400/500/600/700): texto, botones, formularios, navegación. Tamaño base 15–16 px.

## Componentes y medidas

- **Botones:** forma de píldora (`border-radius: 999px`). Primario oscuro (`--ink`) con hover a `--plum`; secundario con borde de 1.5 px; WhatsApp en verde.
- **Tarjetas y bloques:** radios de 10–20 px; productos 14 px, bloque del podcast 20 px.
- **Margen lateral:** `--px` = 64 px en escritorio, 40 px bajo 1100 px, 16 px bajo 640 px. El contenido se centra hasta unos 1400 px; los fondos van de borde a borde.
- **Breakpoints:** 1100 px (tablet ancha), 900 px (menú móvil, columnas simples), 640 px (móvil).
- **Accesibilidad:** enlace "Saltar al contenido", foco visible, `aria-*` en menús y selectores, `prefers-reduced-motion` respetado, menú móvil con `inert` en el fondo.

## Reglas de negocio

- Envío gratis en Lima desde S/ 150 (`freeShippingFrom` en `config.js`). Delivery Lima S/ 10, provincia S/ 15, recojo gratis.
- Cupón `BIENVENIDA10`: 10 % sobre el subtotal (`coupons` en `config.js`).
- Pago contra entrega solo en Lima.
- Cambios hasta 7 días.

## Configuración pendiente

- `js/config.js`: ya tiene WhatsApp (+51 940 395 933), Instagram (@mama.virtuosa3110) y TikTok (@mama.virtuosa). Faltan Facebook, Spotify, Apple y YouTube.
- `js/data.js`: stock, descripciones y textos de cuidados son de ejemplo. Para fotos reales agregar `img: 'img/archivo.jpg'` al producto; para audio real agregar `audio: 'archivo.mp3'` al episodio.

## Límites actuales (sin backend)

- No se procesan pagos ni se guardan pedidos: al confirmar solo se muestra la pantalla de agradecimiento.
- Newsletter y "Mi cuenta" solo muestran un aviso.
- El reproductor simula la reproducción si el episodio no tiene `audio`.
- No hay reseñas ni calificaciones: se omitieron a propósito para no mostrar datos falsos.

## Origen del diseño

Basado en el diseño de Claude Design (artifact de la web y sus versiones móviles). Los textos, colores y estructura de pantallas siguen ese diseño.
