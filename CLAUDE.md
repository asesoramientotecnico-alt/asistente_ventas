# CLAUDE.md

Contexto persistente del proyecto. Leer antes de escribir código.

## Qué es esto

App interna de Famiq SRL (acero inoxidable, Argentina) para los asesores comerciales.
El asesor carga lo que el cliente pide y la app sugiere, de forma incremental, las
**familias** de productos complementarias. La salida son links al ecommerce de Famiq
para que el asesor verifique precio y stock.

Usuario: asesor de mostrador o de salón. Español (es-AR). No es una app de cara al cliente.

## Stack

- Next.js (App Router) + TypeScript estricto
- Supabase: Postgres + Auth. Migraciones SQL versionadas en `supabase/migrations/`
- Tailwind
- Vercel

## Invariantes de dominio

Estos no se negocian. Si una tarea parece pedir romper alguno, parar y preguntar.

1. **Nunca sugerir algo que no esté en el catálogo.** Toda familia sugerida tiene que
   existir en el archivo importado con ítems > 0. No agregar gas de soldadura, EPP, cinta
   de teflón ni fluido de corte por más lógico que parezca: Famiq no los vende, y sugerirlos
   destruye la confianza del asesor en la herramienta.

2. **Sugerencias a nivel familia, nunca SKU individual.** La bajada a producto la hace el
   ecommerce. No inventar códigos de material.

3. **La app no decide el grado de acero.** Sugiere el típico del proceso, muestra el motivo,
   y el asesor lo puede cambiar siempre. Para un servicio puntual crítico, la app deriva a
   Oficina Técnica. Elegir mal entre 304 y 316 en servicio con cloruros es un problema real,
   no un detalle de UX.

4. **Servicio agresivo se responde "fuera de catálogo".** No hay dúplex (2205/2507) en el
   catálogo y el 904L es un solo ítem. Con cloruros altos o ácidos reductores la salida
   correcta es derivar, no forzar un 316L.

5. **Cero URLs del ecommerce en el código.** Se resuelven contra `link_categoria` y `config`.

6. **Nada de LLM en decisiones técnicas.** No usar modelos para elegir grado, sugerir
   productos ni redactar justificaciones técnicas. Si más adelante se agrega parseo de texto
   libre, es solo para mapear a parámetros y requiere confirmación explícita del asesor.

7. **Las reglas viven en la base, no en los componentes.** Si aparece un `if categoria ===
   'brida'` en un componente de UI, está mal: eso va en `complemento` / `complemento_categoria`.

## Nomenclatura

El dominio está en español y las tablas también. **No traducir los términos del negocio**:
`negocio`, `familia`, `calidad`, `grado`, `aporte`, `junta`, `brida`, `caño`, `niple`,
`decapante`, `pasivante`, `tipo_producto`, `complemento`, `proceso`.

Prioridades, siempre estos tres valores: `oblig` | `reco` | `opc`.

Código y comentarios en español. Identificadores de código sin tildes ni ñ.

## Datos de origen

Excel: `BAJADoc Dossier caracteristicas de materiales.xlsx`, 16.973 filas, 43 columnas.

- La hoja de datos es `'Doc Dossier caracteristicas de '` — **con espacio al final**.
  Buscarla por nombre normalizado con trim, nunca por índice.
- La hoja `'Mozart Reports'` es metadata del export; ignorarla.
- Columnas del clasificador: `Negocio` (AC), `Familia` (T), `Tipo` (AP),
  `Material Desc` (B), `Calidad` (L), `Material_ID` (A), `Norma` (AD).
- Antes de importar, validar el hash del set de headers contra el último import exitoso.
  Si cambió, **rechazar con diff**. Nunca importar a ciegas.

## El clasificador

Vive en código (no en la base) y corre en la importación. Es una cascada de condiciones
sobre `Negocio` → `Familia` → `Tipo` → `Material Desc`.

- **El orden de las condiciones importa.** `JUNTA` se evalúa antes de las líneas de válvulas
  y bombas porque los kits de sello vienen rotulados dentro de esas líneas. No reordenar
  "para que quede más limpio".
- Todo en mayúsculas para comparar.
- Fallback `'otro'`. Después de cada import, reportar cuántas filas cayeron ahí; si sube
  respecto al import previo, el catálogo cambió y hay que revisar.
- Referencia: `crosssell_bot.py`, función `clasificar()`. Portar tal cual.
- Los tests usan filas reales del archivo, no casos inventados.

## UI

- Progresivo: no mostrar todo el detalle de entrada. Acordeones cerrados por defecto.
  El asesor está frente a un cliente; no lo abrumes.
- Cada sugerencia muestra **por qué** se sugiere. El motivo no es decorativo: es lo que el
  asesor le repite al cliente.
- Los `oblig` vienen premarcados; el asesor desmarca.
- `Abrir todos` los links tiene que dispararse desde el click directo del usuario o el
  navegador lo bloquea. Avisar cuántas pestañas se van a abrir; si son más de 6, sugerir
  copiar la lista.
- Estado de navegación en la URL para poder compartir el link de una vista.
- Sin dependencias de UI pesadas. Tailwind y componentes propios.

## Trazabilidad

Cada sugerencia mostrada se registra con la regla que la disparó y si el asesor la aceptó.
Es lo que después permite afinar reglas con datos. No lo dejes para el final: el esquema
tiene que soportarlo desde F1 aunque el panel de métricas venga en F3.

## Cómo trabajar

- Migraciones SQL versionadas, nunca cambios manuales al esquema.
- El seed de reglas se lee de `crosssell_rules.json`. No duplicar la lógica a mano.
- Antes de dar por cerrada una tarea, correr typecheck, lint y los tests del clasificador.
- No agregar features fuera del alcance de la fase actual. El alcance está en `BLUEPRINT.md`.
- Si un requerimiento choca con un invariante de dominio, preguntar antes de implementar.

## Fuera de alcance (F1–F3)

SKU individuales, precio, stock, integración con Mozart (el ERP), carga de pedidos,
compartir links al cliente, multi-idioma.
