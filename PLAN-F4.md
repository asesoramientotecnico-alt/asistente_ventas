# Plan de Fase 4 — Afinado con histórico de pedidos

Documento de acuerdo previo a escribir código. Alcance: usar los pedidos reales de 2025 a
la fecha para (a) medir qué tan buenas son las 100 reglas sembradas, (b) proponer reglas
nuevas que hoy no existen, y (c) sacar un listado accionable de clientes que compraron
incompleto.

---

## 1. Por qué esta fase va antes de lo que parece

El `BLUEPRINT.md` define **F3 — Datos** como trazabilidad propia: qué sugirió la app, qué
aceptó el asesor, métricas de aceptación. Eso es telemetría **hacia adelante** y tiene un
problema de calendario: recién sirve cuando haya meses de uso real acumulado. Con un puñado
de asesores en mostrador, llegar a volumen estadístico para 100 reglas puede llevar un año.

El histórico de pedidos es el mismo tipo de evidencia pero **hacia atrás**, y ya existe:
nueve meses y medio de 2025 con todas las sucursales operando. No hay que esperar a
acumularlo.

| | F3 — telemetría propia | F4 — histórico del ERP |
|---|---|---|
| Qué mide | Qué aceptó el asesor de lo sugerido | Qué compró realmente el cliente |
| Disponible | Dentro de ~1 año de uso | Hoy |
| Sesgo | Sesgada por lo que la app propone | Sesgada por lo que el asesor ofreció |
| Sirve para | Afinar prioridades y redacción de motivos | Validar las reglas y descubrir las que faltan |

No se reemplazan: F3 dice si la herramienta funciona, F4 dice si las reglas son ciertas.
Pero **F4 se puede empezar ahora** y no depende de que F2 esté terminada.

---

## 2. Qué es y qué no es (alcance)

El blueprint pone **"integración con Mozart"** explícitamente fuera de alcance para F1–F3.
Esta fase no la contradice, pero conviene dejar la distinción por escrito antes de arrancar:

- **Sí:** una exportación puntual, un archivo, cargado a mano, igual que el Excel de catálogo.
- **No:** una conexión viva a Mozart, un job que sincroniza, credenciales del ERP en la app.

Si más adelante se quiere refrescar el análisis, se exporta de nuevo y se vuelve a cargar.
Mismo patrón que el import de catálogo, que ya está resuelto y auditado.

**Default:** avanzo con exportación puntual. Si querés conexión viva, es otra discusión y
cambia el alcance de seguridad del proyecto entero.

---

## 3. El export — lo que efectivamente llegó

Esta sección se escribió pidiendo campos antes de ver los archivos. Ya llegaron, así que
queda actualizada con lo que hay de verdad. Lo medido está en el bloque 1
(`scripts/historico/`).

**Dos archivos con formatos distintos**, los dos con una fila por línea de comprobante:

| | `data/pedidos_2025.xlsx` | `data/pedidos_2026.csv` |
|---|---|---|
| Formato | xlsx, 1 hoja | CSV `;`, Latin-1 |
| Líneas | 392.604 | 249.057 |
| Rango | 1/1/2025 – 31/12/2025 | 1/1/2026 – 31/8/2026 |
| Columnas | Fecha, Cliente, Documento, Material, Descripción, Gr.Art., Cant.Vta, Creador | Fecha, Cliente, Razón Social, Documento, Material, Cant.Vta, Creador |

Total: **641.661 líneas** en 20 meses.

`sucursal` y `vendedor_id` **no vienen** en ninguno de los dos. Lo único que se pierde es
poder distinguir si un patrón es del cliente o de la costumbre del asesor; no bloquea nada.

### 3.1 Dos trampas de formato, las dos verificadas

1. **El orden de la fecha está invertido entre archivos**: 2025 es `M/D/AA` y 2026 es
   `D/M/AAAA`. Tratarlos igual no falla, corrompe: `12/31/25` leído como D/M pide el mes 31.
   Cada cargador declara su orden y `validarAnio()` corta si alguna línea cae fuera del año
   de su archivo.
2. **La coma es separador de miles**, no decimal: `4,000.000` son 4000 unidades. Un replace
   de coma por punto las vuelve `NaN`, y devolverlas como 0 borra justo las ventas más
   grandes — 8.932 líneas, con la cantidad máxima real en 140.280.

Las dos están cubiertas por tests con strings literales de los archivos.

### 3.2 La cobertura resultó mucho mejor de lo previsto

El plan asumía que los discontinuados se iban a comer una parte grande del histórico y que
por eso hacía falta pedir `Negocio` / `Familia` / `Tipo` / `Material Desc` en cada línea.
**No hizo falta**: cruzando `Material` contra `Material_ID` del dossier alcanza.

| | Líneas | % |
|---|---|---|
| Clasificadas en alguna de las 69 categorías | 632.721 | **98,6 %** |
| En el dossier pero `clasificar()` → `'otro'` | 6.975 | 1,1 % |
| Sin match contra el dossier | 1.965 | 0,3 % |

Y ese 0,3 % casi no son discontinuados: **1.526 líneas son códigos administrativos** de 1 a
4 dígitos con `Creador = "SIN ASIGNAR"` — `2170` es "corte estándar", `2160` es "Anticipo de
Cliente". Nunca fueron material. Los discontinuados reales son 439 líneas y 212 materiales.

Las **69 categorías aparecen con pedidos reales**: ninguna familia sembrada está huérfana de
demanda.

### 3.3 La columna `Creador` no se usa

Trae la familia comercial ya clasificada (`CAÑOS`, `BULONERIA`, `BRIDAS INDUSTRIALES`…),
pero son 33 valores contra las 69 categorías del clasificador. Se descartó como atajo: el
análisis tiene que ser comparable contra las 100 reglas sembradas, y para eso la
granularidad tiene que ser la misma. Se usa solo para diagnóstico, como en el caso de
`SIN ASIGNAR` de arriba.

### 3.2 Anonimato

Para el análisis de canastas no hace falta razón social ni CUIT: alcanza un `cliente_id`
opaco y estable. Para el listado de oportunidad sí hace falta poder volver al cliente, pero
eso se puede resolver dejando el mapeo `cliente_id → cliente` fuera de la app, del lado de
Comercial.

**Default:** el export va con `cliente_id` opaco. El cruce a nombre lo hace Comercial con su
propia planilla.

---

## 4. Riesgos metodológicos

Esto es lo que hace que el análisis sirva o sea un generador de ruido con formato de tabla.

### 4.1 Comprar junto no es necesitar junto

Dos familias pueden aparecer juntas por promoción, por costumbre del asesor, porque estaban
en la misma góndola o porque un vendedor las upselleó bien. Nada de eso las vuelve
técnicamente necesarias.

**Consecuencia de diseño, no negociable:** lo que sale del análisis son **candidatas**. Se
le presentan a Oficina Técnica para revisión y recién ahí se publican. Ninguna regla entra
al motor de forma automática. Es la misma lógica del invariante 3 y del flag `revisado` de
`proceso`.

### 4.2 La asimetría que más importa

Si los datos muestran que una regla `oblig` casi nunca se cumple, eso **no prueba que la
regla esté mal**. Puede ser que:

- el cliente compra esa familia en otro proveedor (Famiq solo ve sus propias ventas);
- el asesor nunca la ofreció, que es justamente el problema que esta app viene a resolver;
- la familia se pidió en otro pedido, días después.

Es decir: **los datos pueden subir la confianza en una regla, pero no pueden bajar su validez
técnica.** Bajarla solo la puede Oficina Técnica. Una junta sigue siendo obligatoria para una
brida aunque el 80 % de los clientes la compre en otro lado — de hecho, ese 80 % es la
oportunidad, no el desmentido.

Esta asimetría tiene que estar escrita en el panel, al lado de cada número, o alguien va a
borrar una regla correcta mirando un porcentaje bajo.

### 4.3 La obra no entra en un solo pedido

Un trabajo de cañería se compra en varias veces: primero el caño, a los tres días los
accesorios, la semana siguiente la química. Si la canasta se define como "un `pedido_id`", ese
patrón se pierde entero y todas las reglas van a parecer incumplidas.

**Default:** la unidad de análisis no es el pedido sino la **ventana por cliente**. Calculo
con tres ventanas en paralelo —mismo pedido, 7 días, 30 días— y reporto las tres. La elección
final se hace mirando los datos, no antes.

### 4.4 Soporte mínimo

Con 69 familias hay 2.346 pares posibles. Con suficiente ruido, siempre va a haber pares con
lift alto y tres casos de respaldo.

**Default:** no se reporta ningún par con menos de 30 canastas de soporte, y el reporte
muestra siempre soporte y confianza junto al lift. Nunca el lift solo.

### 4.5 Validación fuera de muestra

El umbral de soporte filtra ruido, pero no alcanza: con 2.346 pares posibles, algunos van a
pasar el umbral por casualidad.

Como el histórico cubre 2025 completo más 2026 hasta la fecha, se puede partir: **derivar con
2025, verificar contra 2026**. Un par que es fuerte en 2025 y se sostiene en 2026 es un
patrón; uno que se cae era ruido. Recién después de esa verificación se calcula la métrica
final sobre el período completo.

Es la razón principal para pedir los dos años y no solo el último.

---

## 5. Los tres entregables

Van en orden de menor a mayor esfuerzo, y el primero es el que más plata mueve.

### 5.1 Reporte de oportunidad perdida (no toca la app)

Para cada regla `oblig` del seed: clientes que compraron el disparador y **no** compraron la
familia complementaria en la ventana elegida.

Salida: una planilla por sucursal, ordenada por monto del disparador, con cliente, fecha,
qué compró y qué le faltó. Eso es una lista de llamados para Comercial, y se puede entregar
sin tocar una línea del código de la app.

Es el entregable que justifica la fase por sí solo.

### 5.2 Validación de las 100 reglas existentes

Para cada una de las 100 reglas: soporte, confianza y lift observados. Con eso se arma una
tabla de cuatro cuadrantes:

| | Confianza alta | Confianza baja |
|---|---|---|
| **Prioridad `oblig`** | Regla confirmada | Revisar: ¿o es la oportunidad más grande? (ver 4.2) |
| **Prioridad `opc`** | Candidata a subir a `reco` | Regla de bajo valor, candidata a sacar |

El cuadrante de abajo a la izquierda es el más interesante: reglas marcadas como opcionales
que en la práctica se compran siempre juntas.

### 5.3 Reglas candidatas nuevas

Pares de familias con soporte y lift altos que **no** están en las 100 reglas. Cada candidata
va con su evidencia y entra a la cola de revisión de Oficina Técnica, nunca al motor.

Acá hay que tener cuidado con lo obvio: caño y accesorio van a salir con lift altísimo y ya
son regla. El valor está en los pares inesperados, y esos son también los que más revisión
técnica necesitan antes de publicarse.

---

## 6. Dónde se conecta con la pregunta de la medida

El histórico responde con datos una pregunta de diseño que hoy está abierta: si un caño de
60.30 se compra con bridas de 60.30 o con bridas de cualquier medida.

El catálogo ya trae la dimensión y ya la estamos importando (`catalogo_item.diametro`,
`.rosca`, `.espesor`, desde F1). Cruzando el histórico contra esas columnas se puede medir la
tasa real de coincidencia dimensional dentro de una misma canasta, por par de familias.

Eso convierte "habría que preguntar la medida" en una decisión con evidencia: se activa el
filtro por medida en los pares donde la coincidencia observada es alta, y no en los demás.

Cobertura dimensional del catálogo actual, medida sobre las 16.973 filas:

| Familia | Ítems | % con `Diametro` | % con `Rosca` | % con `Espesor` |
|---|---|---|---|---|
| `acc_soldar_san` | 803 | 100 | 0 | 89 |
| `tubo` | 492 | 100 | 0 | 99 |
| `union_sanitaria` | 497 | 99 | 0 | 3 |
| `barra` | 269 | 99 | 0 | 0 |
| `acc_soldar_ind` | 1.142 | 98 | 0 | 97 |
| `brida` | 240 | 98 | 8 | 0 |
| `valvula_san` | 490 | 93 | 0 | 0 |
| `cano` | 1.213 | 81 | 0 | 99 |
| `instrumentacion` | 730 | 73 | 84 | 0 |
| `junta` | 589 | 62 | 0 | 0 |
| `valvula_ind` | 499 | 42 | 1 | 0 |
| `tuerca` | 176 | 0 | 100 | 0 |
| `bulon` | 2.023 | 1 | 96 | 0 |
| `planchuela` | 287 | 0 | 0 | 100 |
| `chapa` | 2.082 | 0 | 0 | 98 |
| `niple` | 189 | 0 | 2 | 0 |
| `acc_rosc_sw` | 736 | 1 | 4 | 0 |
| `tapa_puerta` | 806 | 0 | 0 | 0 |
| `bomba` | 547 | 0 | 0 | 0 |

En total: **19 de 69 familias tienen `Diametro` en el 80 % o más de sus ítems, y 36 de 69 no
tienen ninguna dimensión usable.**

Tres conclusiones que salen de ahí:

1. La cadena **tubería industrial** (caño → accesorio → brida) matchea bien y además usa la
   misma serie: 21.30, 33.40, 48.30, 60.30, 88.90, 114.30, 168.30, 219.10 mm, que son los
   diámetros exteriores de ASME B36.19 / B36.10 de 1/2" a 8". El cruce es igualdad numérica
   directa, sin normalizar nada.
2. La cadena **sanitaria** usa la otra serie —12.70, 25.40, 38.10, 50.80, 63.50, 76.20,
   101.60— que es pulgada por 25,4. También limpia, pero es **otra** serie: un match ingenuo
   entre las dos líneas va a fallar.
3. **Bulonería matchea por `Rosca`, no por diámetro** (`bulon` 96 %, `tuerca` 100 %). Que es
   exactamente lo que ya dice el motivo sembrado de esa regla: "todo bulón necesita su tuerca
   del mismo paso".

Y los roscados (`niple` 0 %, `acc_rosc_sw` 1 %) no tienen la medida en ninguna columna: está
adentro del texto de `Material Desc`. Para esas familias el filtro por medida requiere parsear
descripciones, que es un trabajo distinto y bastante más frágil.

---

## 7. Orden de ataque

| # | Bloque | Depende de |
|---|---|---|
| 1 | Cargar el export, mapear `material_id` → familia, reportar cobertura y descartes | El export |
| 2 | Armar canastas con las tres ventanas (pedido / 7 d / 30 d) y elegir | 1 |
| 3 | Reporte de oportunidad perdida (entregable 5.1) | 2 |
| 4 | Validación de las 100 reglas (entregable 5.2) | 2 |
| 5 | Candidatas nuevas con umbral de soporte (entregable 5.3) | 2 |
| 6 | Medición de coincidencia dimensional por par de familias | 2 |
| 7 | Panel de revisión de candidatas para Oficina Técnica | F2 |

Los bloques 1 a 6 son análisis offline: no tocan la app, no necesitan F2 y se pueden correr
con el histórico apenas esté. El 7 es el único que necesita el panel de reglas de F2.

---

## 8. Definiciones que necesito

Cada una con el default que aplico si no decís otra cosa.

1. ~~**Período.**~~ **Resuelto:** 1/1/2025 al 31/8/2026, los dos años, para validar fuera
   de muestra según 4.5.
2. **Pedidos o facturas.** Los archivos se llaman "Pedidos" y la columna de agrupación es
   `Documento`. **Falta confirmar** si son pedidos o comprobantes facturados. Cambia la
   lectura del resultado: si son pedidos, hay cancelados y parciales adentro.
3. **Devoluciones y notas de crédito.** No se identificaron en los archivos: no hay columna
   de tipo de comprobante ni cantidades negativas (mínimo observado: 0). **Falta confirmar**
   si el reporte ya las excluye o si vienen mezcladas sin marca.
4. **Clientes internos y transferencias entre sucursales.** Tampoco hay columna que las
   marque. Lo único detectado son los códigos administrativos de `Creador = "SIN ASIGNAR"`
   (anticipos, servicios de corte), que quedan afuera solos porque no cruzan contra el
   dossier. **Falta confirmar** si el reporte ya excluye las transferencias.
5. **Umbral de soporte.** **Default:** 30 canastas, ajustable después de ver la distribución.
6. **Dónde vive el análisis.** **Resuelto:** `scripts/historico/`, offline, fuera del
   runtime de la app. La base solo recibe las reglas candidatas cuando Oficina Técnica las
   aprueba en F2.

Los puntos 2, 3 y 4 no bloquean el bloque 2, pero conviene resolverlos antes de sacar
conclusiones: si hay pedidos cancelados o notas de crédito mezcladas, inflan el soporte de
los pares sin que se note.

---

## 9. Lo que esta fase no va a resolver

- **No ve lo que el cliente compró en otro lado.** Toda conclusión sobre "no lo necesita" es
  inválida por construcción (ver 4.2).
- **No distingue causa de correlación.** Si dos familias se venden juntas porque el mismo
  asesor las ofrece siempre, el análisis lo ve igual que una necesidad técnica.
- **No sustituye a Oficina Técnica.** Ordena la cola de revisión; no decide.
- **No arregla el catálogo.** Si una familia está mal clasificada, el histórico la va a
  arrastrar mal clasificada también.
