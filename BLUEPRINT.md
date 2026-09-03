# Blueprint — Asistente de Venta Cruzada Famiq

Herramienta interna para asesores comerciales de acero inoxidable. El asesor carga lo que
el cliente pide y la app va sugiriendo, de forma incremental, las familias de productos
complementarias. La salida son links al ecommerce de Famiq para verificar precio y stock.

---

## 1. Decisiones cerradas

| Tema | Decisión |
|---|---|
| Entrada | Dos puertas al mismo carrito: **por producto** y **por proceso/material** |
| Nivel de sugerencia | **Familia**, nunca SKU individual |
| Precio y stock | **No viven en la app.** Los resuelve el ecommerce vía link |
| Salida | Panel de links: `Abrir todos`, `Copiar lista` |
| Grado de material | Se **sugiere** el típico del proceso; el asesor lo puede cambiar siempre |
| Catálogo | Carga periódica del Excel por Oficina Técnica, versionada |
| Reglas | En base de datos, editables sin redeploy |
| Clasificador | En código (determinístico, corre en la importación) |
| LLM | Fuera de toda decisión técnica. Opcional solo para parsear texto libre |
| Stack | Next.js (App Router) + TypeScript + Supabase + Vercel |
| Idioma | Español (es-AR) únicamente |

### Invariantes de dominio (no negociables)

1. **Nada fuera de catálogo.** Toda familia sugerida existe en el archivo con ítems > 0.
   No se sugiere gas de soldadura, EPP, cinta de teflón ni fluido de corte: no los vendemos.
2. **La app no decide el grado.** Sugiere el típico del proceso con su motivo; el asesor
   confirma o cambia. Para servicio puntual crítico deriva a Oficina Técnica.
3. **Servicio agresivo = fuera de catálogo.** No hay dúplex (2205/2507) y el 904L es un
   solo ítem. Con cloruros altos o ácidos reductores la respuesta correcta es
   "fuera de catálogo, cotizar especial", no forzar un 316L.
4. **Sin URLs hardcodeadas.** El resolvedor de links se configura en el panel.
5. **Trazabilidad.** Cada sugerencia registra qué regla la disparó y si el asesor la aceptó.

---

## 2. Fuente de datos

Archivo: `BAJADoc Dossier caracteristicas de materiales.xlsx` — 16.973 filas.

**Cuidado con dos detalles del archivo:**
- La hoja de datos se llama `'Doc Dossier caracteristicas de '` — **con espacio al final**.
  No buscar por índice 0 a ciegas; buscar por nombre normalizado (trim).
- Hay una segunda hoja `'Mozart Reports'` (2 celdas) que es metadata del export. Ignorarla.

### Columnas relevantes (43 en total, estas son las que usa el clasificador)

| Col | Header | Uso |
|---|---|---|
| A | `Material_ID` | Clave del ítem |
| B | `Material Desc` | Descripción; el clasificador matchea keywords acá |
| L | `Calidad` | Grado de material (304, 316L, E308, EPDM, …) |
| T | `Familia` | Subfamilia comercial |
| AC | `Negocio` | Línea de negocio — **eje principal del clasificador** |
| AD | `Norma` | ASTM/ASME/DIN aplicable |
| AP | `Tipo` | Tipo de producto (usado sobre todo en la línea INOXSALE) |

Columnas de dimensión que conviene importar aunque no se usen todavía:
`Acabado`, `Diametro`, `Espesor`, `Norma`, `Rosca`, `Schedule`, `Serie`, `Tipojunta`.

### Validación de layout
Al subir el Excel, calcular un hash del set de headers. Si cambió respecto al último import
exitoso, **rechazar el archivo y mostrar el diff** en vez de importar datos corridos.

---

## 3. Modelo de datos (Postgres / Supabase)

### Catálogo (se reemplaza en cada import)

```sql
import_batch (
  id, archivo, subido_por, subido_at, filas, layout_hash,
  estado  -- pendiente | validado | activo | descartado
)

catalogo_item (
  id, import_batch_id,
  material_id, descripcion,
  negocio, familia, tipo, calidad, norma,
  acabado, diametro, espesor, rosca, schedule, serie, tipojunta,
  categoria_codigo,   -- derivado por el clasificador
  grado_norm          -- derivado por normalizar_grado()
)
```

Solo un `import_batch` está `activo` a la vez. El anterior se conserva para poder volver atrás.

### Taxonomía y reglas (editable por Oficina Técnica)

```sql
dominio (id, codigo, nombre, icono, orden)          -- 9 líneas

categoria (id, codigo, etiqueta, activo)            -- 69 categorías funcionales
  -- el conteo de ítems se calcula contra catalogo_item del batch activo

tipo_producto (                                     -- 27 disparadores
  id, codigo, dominio_id, nombre, pregunta_grado bool, orden
)

complemento (                                       -- la regla de venta cruzada
  id, tipo_producto_id, nombre,
  prioridad,          -- oblig | reco | opc
  motivo text,        -- el "por qué" que ve el asesor
  depende_del_grado bool,
  orden
)

complemento_categoria (complemento_id, categoria_id, orden)

aporte_por_grado (grado, aporte, motivo)            -- 304→308L, 316→316L, 310→310

proceso (                                           -- 8 procesos
  id, codigo, nombre, grado_tipico, motivo_grado, nota, orden
)

proceso_categoria (proceso_id, categoria_id, prioridad, orden)

nota_tecnica (id, ambito, ambito_id, texto, orden)  -- ambito: dominio | proceso | tipo
```

### Links al ecommerce

```sql
link_categoria (
  categoria_id primary key,
  url_fija text null,           -- si existe, gana
  terminos_busqueda text null   -- fallback para la plantilla
)

config (clave primary key, valor)
  -- ecommerce_base_url        ej. https://www.famiq.com.ar
  -- ecommerce_search_template ej. {base}/buscar?q={q}
```

**Resolución:** `url_fija` → si es null, `search_template` con `terminos_busqueda` (o la
etiqueta de la categoría si tampoco hay términos). El panel muestra un reporte de cobertura
con las familias que resuelven por fallback, para irlas completando.

### Trazabilidad

```sql
sesion (id, usuario_id, puerta, iniciada_at, cerrada_at)
  -- puerta: producto | proceso | material

sesion_sugerencia (
  id, sesion_id, complemento_id null, proceso_categoria_id null,
  categoria_id, prioridad, aceptada bool, generado_link bool
)
```

Con esto se puede medir qué sugerencias acepta el asesor y qué regla no sirve. Es la base
para afinar las reglas con datos en vez de intuición.

### Usuarios

Supabase Auth con email corporativo. Tabla `perfil (user_id, nombre, sucursal, rol)`
con rol en `asesor | oficina_tecnica | admin`. RLS: los asesores solo leen taxonomía y
escriben sus propias sesiones; `oficina_tecnica` escribe reglas; `admin` gestiona usuarios
e imports.

---

## 4. El clasificador

Portar a TypeScript la función `clasificar()` de `crosssell_bot.py` (adjunto). Corre una
sola vez por fila durante la importación y persiste en `catalogo_item.categoria_codigo`.

Reglas del port:
- Es una cascada de condiciones sobre `Negocio`, `Familia`, `Tipo`, `Material Desc`, en
  ese orden de prioridad. **Mantener el orden exacto** — hay casos que dependen de él
  (por ejemplo `JUNTA` se evalúa antes de las líneas de válvulas y bombas, porque los kits
  de sello vienen rotulados dentro de esas líneas).
- Toda comparación en mayúsculas.
- El fallback es `'otro'`. Después del import, listar cuántas filas cayeron en `'otro'`;
  si sube mucho respecto al import anterior, es señal de que el catálogo cambió.
- `normalizar_grado()` mapea los aportes de soldadura a su grado (`E308`→`308L`) y, si la
  columna `Calidad` viene vacía, intenta extraer el grado de la descripción.

Los tests del clasificador van con casos reales del archivo, no inventados.

---

## 5. Semilla de reglas

`crosssell_rules.json` (adjunto) ya tiene la lógica completa lista para sembrar:
27 tipos, 69 categorías, sus complementos con prioridad y motivo, el aporte por grado y
las notas por dominio. El seed lo lee y llena `dominio`, `categoria`, `tipo_producto`,
`complemento`, `complemento_categoria`, `aporte_por_grado` y `nota_tecnica`.

Los 8 procesos hay que sembrarlos aparte (tabla en la sección 7). La columna de grado
típico es **borrador pendiente de firma de Oficina Técnica**: dejar el campo con un flag
`revisado bool default false` y mostrar un aviso en el panel hasta que se revise.

---

## 6. Pantallas

### `/` — Selección de puerta
Dos accesos grandes: "El cliente pide un producto" y "El cliente describe un proceso o
un material". Nada más.

### Puerta A — `/producto`
Tres niveles, con migas de pan y estado en la URL para poder compartir el link:

1. **Línea** (9 dominios)
2. **Producto** (los tipos de ese dominio)
3. **Complementos** — acordeón. Cada grupo muestra nombre, prioridad, motivo y las
   familias que agrupa. Cerrado por defecto: el detalle aparece al abrir.
   Si el tipo tiene `pregunta_grado`, aparece un selector de grado que reescribe el motivo
   del complemento de aporte con la justificación correcta.

Cada familia tiene un check para sumarla al carrito. Los `oblig` vienen premarcados.

### Puerta B — `/proceso`
El asesor elige uno de los 8 procesos. La app muestra:
- El grado típico sugerido, **con su motivo y editable**
- Las familias típicas de esa línea, premarcadas según prioridad
- Las notas técnicas del proceso
- Un botón "Este caso es crítico → derivar a Oficina Técnica" que corta el flujo y
  registra la consulta

Sub-entrada `/material`: el cliente ya dijo el grado. Se elige el grado y la app filtra
los formatos disponibles en ese grado (contra el batch activo) y arranca la venta cruzada
desde ahí. Acá la app no sugiere ningún grado porque ya lo trajo el cliente.

### `/carrito`
Checklist de todo lo acumulado, agrupado por prioridad. El asesor desmarca lo que no va.
Al confirmar: panel de links con `Abrir todos` y `Copiar lista`.

`Abrir todos` avisa cuántas pestañas va a abrir y **debe dispararse desde el click directo
del usuario**, o el navegador lo bloquea. Si son más de 6, sugerir copiar la lista.

### `/admin` (rol `oficina_tecnica` / `admin`)
- **Import**: subir Excel, ver validación de layout, previsualizar, activar batch, volver atrás
- **Reglas**: CRUD de tipos, complementos, prioridades y motivos
- **Procesos**: CRUD, grado típico, familias asociadas, marcar como revisado
- **Links**: configuración de base y plantilla, `url_fija` por familia, reporte de cobertura
- **Métricas**: tasa de aceptación por regla, familias más sugeridas, sesiones por sucursal

---

## 7. Semilla de procesos

Grado típico = borrador, pendiente de revisión de Oficina Técnica.

| Proceso | Familias asociadas | Grado típico |
|---|---|---|
| Cervecería | acc. cerveceros, uniones sanitarias, válvulas sanitarias, bombas, acc. soldar san. | 304L / 316L en contacto |
| Lácteos y alimentos | acc. soldar san., uniones sanitarias, bombas, tapas y puertas, válvulas san. | 304L / 316L |
| Farma | accesorios pharma, tubos, juntas, uniones sanitarias | 316L |
| Vinos y tanques | tapas y puertas, acc. tanque, sistema de limpieza, juntas, válvulas san. | 304L / 316L |
| Química e industrial | caños, acc. soldar ind., bridas, válvulas ind., juntas | 304L / 316L / 310 con temperatura |
| O&G y alta presión | instrumentación, acc. rosc/SW, válvulas ind., niples | 316L |
| Arquitectura | barandas, grifería, herrajes, acc. vidrio, acc. baño | 304 interior / 316 exterior y costa |
| Estructural y taller | chapa, barra, planchuela, ángulo, caños | 304 / 430 según exposición |

---

## 8. Fases

**F1 — MVP usable en mostrador**
Import + validación de layout + clasificador + puerta por producto + carrito +
resolvedor de links + auth. Reglas sembradas desde el JSON, todavía sin panel de edición.

**F2 — Autonomía de Oficina Técnica**
Panel de reglas, panel de procesos, puerta por proceso y por material, configuración de links.
A partir de acá las reglas se cambian sin tocar código.

**F3 — Datos**
Trazabilidad completa, métricas de aceptación, historial por asesor. Con eso se decide qué
reglas afinar.

**Fuera de alcance por ahora:** SKU individuales, precio, stock, integración con Mozart,
carga de pedidos al ERP, compartir links al cliente.

---

## 9. Riesgos

| Riesgo | Mitigación |
|---|---|
| El grado sugerido se toma como recomendación técnica firme | Motivo visible, editable, y salida explícita a Oficina Técnica. Flag `revisado` |
| Cambia el layout del Excel y entran datos corridos | Hash de headers, rechazo con diff, batch versionado con rollback |
| Cambia el ecommerce y los links mueren | Sin URLs en código; reporte de cobertura; fallback a búsqueda |
| El clasificador degrada con catálogo nuevo | Monitorear el conteo de `'otro'` por import |
| Las reglas envejecen | Métricas de aceptación en F3 |
