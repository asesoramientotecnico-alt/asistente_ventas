# Plan de Fase 1 — Asistente de Venta Cruzada

Documento de acuerdo previo a escribir código. Alcance: sección 8 del `BLUEPRINT.md`
(import + validación de layout + clasificador + puerta por producto + carrito +
resolvedor de links + auth).

---

## 1. Observaciones previas

Cinco puntos que salieron de leer el material. Los tres primeros afectan el diseño de F1.

### 1.1 El aporte por grado no dispara en el caso más común (bug real)

`sugerir()` hace `grado in RULES["aporte_por_grado"]` y esa tabla tiene solo `304`, `316`, `310`.
Pero `normalizar_grado()` devuelve el valor literal de `Calidad`, que en el catálogo es
`304L`, `316L`, `310S` en la mayoría de las filas. Verificado:

| Grado normalizado | Motivo del complemento "Consumible de aporte" |
|---|---|
| `316` | "Aporte 316L: para conservar el molibdeno y la resistencia al picado…" |
| `316L` | motivo genérico, sin justificación de aporte |

Es decir: un caño 316L —el caso típico— no recibe la justificación técnica del aporte.
Esto no es un problema del clasificador (que se porta tal cual) sino de la resolución del
aporte, que en esta app vive en la tabla `aporte_por_grado`.

**Propuesta:** agregar una función `familia_de_grado()` que colapse `304L/304H → 304`,
`316L/316Ti → 316`, `310S → 310`, y buscar el aporte por esa clave. La tabla mantiene su
forma; la equivalencia se persiste en `grado_equivalencia (grado, familia)` para que Oficina
Técnica la pueda editar en F2 en vez de quedar en código.

### 1.2 El hash de headers, si es de un *set*, no detecta reordenamiento

El riesgo declarado en la sección 9 del blueprint es "entran datos corridos". Datos corridos
es exactamente lo que pasa cuando se reordenan columnas, y un hash sobre un conjunto no
ordenado no lo ve.

**Propuesta:** dos defensas independientes.
1. Hash sobre la **lista ordenada** de headers normalizados (trim + upper). Detecta rename,
   alta, baja y reorden.
2. Leer cada celda **por nombre de header**, nunca por índice. Así, si Oficina Técnica
   aprueba un reorden, el import sigue siendo correcto en vez de correr los datos.

La letra de columna (A, B, L, T, AC, AD, AP) queda como documentación, no como forma de acceso.

### 1.3 El JSON da un test de regresión del port sobre las 16.973 filas

Cada categoría del JSON trae `total_en_catalogo`, y esos números salieron de correr el
clasificador Python sobre el archivo real. La suma da 16.576 sobre 16.973 → 397 filas en
`'otro'` (2,34 %).

Eso permite una verificación fuerte del port sin inventar nada: al terminar el primer import,
comparar el conteo por `categoria_codigo` contra los `total_en_catalogo` del JSON. Si los 69
números coinciden y `'otro'` da 397, el port es equivalente al original sobre el universo
completo. Queda como paso de aceptación del bloque de importación.

### 1.4 En F1 no hay panel de links, pero sí resolvedor

`link_categoria` y `config` se cargan por seed y se editan por SQL hasta F2. Sin URLs en
código igual: el resolvedor lee la base siempre. El reporte de cobertura (qué familias caen
en el fallback de búsqueda) lo expongo ya en F1 como página de solo lectura en `/admin`,
porque es lo que te va a decir qué cargar cuando revises el sitio.

### 1.5 Falta el Excel

`data/BAJADoc Dossier caracteristicas de materiales.xlsx` no está en el repo. Bloquea dos
cosas puntuales: los fixtures de tests con filas reales y la verificación de 1.3. No bloquea
nada más. Detalle en la sección 5.

---

## 2. Estructura de carpetas

```
asistente_ventas/
├─ CLAUDE.md
├─ BLUEPRINT.md
├─ PLAN-F1.md
├─ data/
│  └─ crosssell_rules.json          # fuente del seed de reglas
├─ referencia/
│  └─ crosssell_bot.py              # referencia del port, no se ejecuta
├─ supabase/
│  └─ migrations/                   # SQL versionado, ver sección 3
├─ scripts/
│  ├─ seed-reglas.ts                # lee data/crosssell_rules.json
│  ├─ seed-procesos.ts              # tabla de la sección 7 del blueprint
│  └─ verificar-conteos.ts          # 1.3: conteos del batch vs. JSON
├─ src/
│  ├─ app/
│  │  ├─ layout.tsx  page.tsx                    # selección de puerta
│  │  ├─ login/page.tsx
│  │  ├─ auth/callback/route.ts
│  │  ├─ producto/page.tsx                       # nivel 1: línea
│  │  │  └─ [dominio]/page.tsx                   # nivel 2: producto
│  │  │     └─ [tipo]/page.tsx                   # nivel 3: complementos
│  │  ├─ carrito/page.tsx
│  │  └─ admin/
│  │     ├─ import/page.tsx
│  │     └─ links/page.tsx                       # solo lectura en F1
│  ├─ logica/                       # dominio puro: sin React, sin Supabase
│  │  ├─ clasificador.ts            # port de clasificar()
│  │  ├─ clasificador.test.ts
│  │  ├─ grado.ts                   # normalizar_grado() + familia_de_grado()
│  │  ├─ grado.test.ts
│  │  ├─ layout-excel.ts            # headers esperados, hash, diff
│  │  ├─ layout-excel.test.ts
│  │  ├─ links.ts                   # url_fija → plantilla → etiqueta
│  │  └─ links.test.ts
│  ├─ datos/                        # único lugar que habla con Supabase
│  │  ├─ supabase-navegador.ts
│  │  ├─ supabase-servidor.ts
│  │  ├─ taxonomia.ts               # dominios, tipos, complementos
│  │  ├─ catalogo.ts                # conteos por categoría del batch activo
│  │  ├─ importacion.ts
│  │  └─ sesiones.ts                # trazabilidad
│  ├─ componentes/
│  │  ├─ Acordeon.tsx  FilaFamilia.tsx  SelectorGrado.tsx
│  │  ├─ EtiquetaPrioridad.tsx  PanelLinks.tsx  MigasDePan.tsx
│  ├─ carrito/
│  │  ├─ estado.ts                  # carrito en sessionStorage + URL
│  └─ tipos/
│     ├─ base-de-datos.ts           # generado con supabase gen types
│     └─ dominio.ts
└─ tests/
   └─ fixtures/
      └─ filas-reales.json          # extraído del Excel, ver 5.1
```

Dos decisiones de nombre que conviene fijar ahora:

- `src/logica/` y no `src/dominio/`, porque `dominio` ya es una entidad del negocio
  (las 9 líneas). Tener las dos cosas con el mismo nombre se presta a confusión.
- `src/datos/` concentra todo el acceso a Supabase. Ningún componente importa el cliente
  directamente; así el invariante 7 de `CLAUDE.md` (reglas en la base, no en los componentes)
  es verificable con un grep.

---

## 3. Migraciones, en orden

Una migración por bloque conceptual. Se aplican en orden; ninguna depende de una posterior.

| # | Archivo | Contenido |
|---|---|---|
| 0001 | `0001_perfil.sql` | Enum `rol_usuario (asesor, oficina_tecnica, admin)`. Tabla `perfil (user_id fk auth.users, nombre, sucursal, rol default 'asesor')`. Trigger `on auth.users insert` que crea el perfil. Función `es_oficina_tecnica()` / `es_admin()` en `security definer` para usar en las políticas sin recursión. |
| 0002 | `0002_catalogo.sql` | `import_batch` (con `layout_hash`, `estado`, `filas`, `filas_otro`, `archivo_storage`). Índice único parcial `where estado='activo'` → un solo batch activo, garantizado por la base. `catalogo_item` con las 15 columnas de dimensión + `categoria_codigo` + `grado_norm`. Índices por `(import_batch_id, categoria_codigo)` y `(import_batch_id, grado_norm)`. |
| 0003 | `0003_taxonomia.sql` | `dominio`, `categoria`, `tipo_producto`, `complemento`, `complemento_categoria`, `aporte_por_grado`, `grado_equivalencia`, `nota_tecnica`. FKs por código, no por uuid, donde el código es estable (`categoria.codigo`) — el seed queda idempotente y el JSON sigue siendo la fuente. |
| 0004 | `0004_procesos.sql` | `proceso` (con `grado_tipico`, `motivo_grado`, `nota`, `revisado bool not null default false`) y `proceso_categoria`. Se siembra en F1, la UI es F2. |
| 0005 | `0005_links.sql` | `link_categoria (categoria_id pk, url_fija, terminos_busqueda)` y `config (clave pk, valor)` con las dos claves del blueprint sembradas vacías. |
| 0006 | `0006_trazabilidad.sql` | `sesion`, `sesion_sugerencia`. Existe desde F1 aunque las métricas sean F3. |
| 0007 | `0007_vistas.sql` | `v_conteo_categoria` (ítems por categoría del batch activo), `v_cobertura_links` (qué categorías resuelven por fallback), `v_familias_vacias` (categorías referenciadas por alguna regla con 0 ítems en el batch activo → invariante 1). |
| 0008 | `0008_rls.sql` | RLS en todas las tablas. Lectura de taxonomía y catálogo: cualquier usuario autenticado. Escritura de reglas y procesos: `oficina_tecnica` + `admin`. Import y perfiles: `admin`. `sesion` / `sesion_sugerencia`: cada asesor escribe y lee las propias; `oficina_tecnica` y `admin` leen todas. |

RLS última a propósito: se escribe sobre un esquema ya completo y se puede leer entera de
un archivo, en vez de quedar repartida en ocho.

---

## 4. Orden de ataque de F1

Nueve bloques. Cada uno cierra con typecheck + lint + tests en verde, y te lo paso para
revisar antes de seguir.

| # | Bloque | Por qué acá |
|---|---|---|
| 1 | Andamiaje: Next.js App Router, TS estricto, Tailwind, Vitest, scripts de verificación | Sin esto no hay dónde correr un test. Es el bloque más corto. |
| 2 | Migraciones 0001–0008 | Todo lo demás consulta el esquema. Cambiarlo después obliga a reescribir consumidores. |
| 3 | Clasificador + `grado.ts` + tests | Es la única pieza con lógica de dominio pura y testeable en aislamiento, y el importador la consume. Va antes que el importador para que el importador no arranque sobre lógica sin verificar. |
| 4 | Seed de reglas y de procesos | La UI lee de la base; sin datos no se puede desarrollar contra nada real. Y el seed valida que el esquema del bloque 2 aguanta el JSON. |
| 5 | Auth, perfil y verificación de RLS | Va antes de las pantallas, no después. Cada consulta se escribe bajo las políticas que va a tener en producción; meter auth al final significa reescribir el acceso a datos entero. |
| 6 | Importación: validación de layout, preview, activación, rollback, reporte de `'otro'` | Primer bloque que junta clasificador + esquema + auth. Cierra con la verificación de 1.3 contra las 16.973 filas. |
| 7 | Puerta A `/producto`: tres niveles, acordeón, selector de grado | Consumidor puro de lo anterior. Acá recién aparece UI. |
| 8 | Carrito + resolvedor de links + panel de salida | Depende del 7 para tener qué acumular. `Abrir todos` con el aviso de cantidad y el corte en 6. |
| 9 | Cierre: registro de trazabilidad en las dos pantallas, cobertura de links en `/admin`, verificación completa | La trazabilidad se conecta cuando ya existen los puntos donde se muestra una sugerencia. El esquema, en cambio, existe desde el bloque 2. |

El criterio general: **esquema → lógica pura → datos → seguridad → pantallas**. Lo que más
cuesta cambiar va primero.

---

## 5. Definiciones que necesito

Cada una con el default que aplico si no decís otra cosa, para no frenar.

### 5.1 El Excel (bloquea parte del bloque 3)

Necesito `BAJADoc Dossier caracteristicas de materiales.xlsx` para los fixtures de tests con
filas reales y para la verificación de 1.3. Subilo al repo en `data/` (queda ignorado por git,
no se commitea) o a Supabase Storage.

Sin el archivo, las ramas del clasificador que matchean sobre `Negocio` y `Familia` sí las
puedo cubrir: los strings `"NEGOCIO ▸ SUBFAMILIA"` del JSON son valores reales del archivo.
Las que matchean sobre `Material Desc` y `Tipo` —`SOLDADURA`, `AUXILIARES`, `ABRASIVOS`,
`INOXSALE`, o sea 4 de las 9 líneas— quedan sin cubrir, porque inventar descripciones va
contra `CLAUDE.md`. **Default:** avanzo con los bloques 1 y 2 completos y con la parte
cubrible del 3, y dejo el resto marcado como pendiente hasta que llegue el archivo.

### 5.2 Corrección del aporte por grado (1.1)

**Default:** la implemento como está propuesta. El clasificador se porta tal cual; la
equivalencia `316L → 316` vive en `grado_equivalencia`, editable, no en el componente.

### 5.3 Auth

Tres cosas sin definir: si se restringe el registro al dominio `@famiq.com.ar`, si es magic
link o contraseña, y si el alta de asesores la hace un admin o es autoservicio.
**Default:** magic link, dominio restringido a `@famiq.com.ar`, alta automática con rol
`asesor` y promoción manual por admin. Es lo que menos fricción tiene en mostrador —no hay
contraseña que recordar— pero requiere que el asesor tenga el mail a mano.

### 5.4 Familias con 0 ítems en el batch activo

El invariante 1 dice que toda familia sugerida existe en el catálogo con ítems > 0. Si un
import deja una categoría en 0, hay dos salidas: no mostrar esa familia, o mostrarla igual y
avisar en `/admin`. **Default:** no mostrarla en las sugerencias y listarla en el reporte de
`/admin`. Prefiero que al asesor le falte una sugerencia antes que ofrecerle algo sin stock
en el catálogo.

### 5.5 Import: dónde corre el parseo

17.000 filas por una función serverless de Vercel pelea con el límite de tamaño de body y con
el de duración. **Default:** parseo y clasificación en el navegador con SheetJS —el mismo
módulo `src/logica/clasificador.ts`, sin duplicar lógica— e inserción en lotes de 1.000 vía
supabase-js bajo RLS de admin. El archivo original se sube a Storage para auditoría. Evita
los dos límites y no obliga a mantener dos implementaciones del clasificador.

### 5.6 Gestor de paquetes y tests

**Default:** pnpm y Vitest. Criterio técnico mío, no requerimiento tuyo: si preferís npm,
es cambiar una línea.
