# Plan de Fase 2 — Medida, grado y detalle por ítem

Documento de acuerdo previo a escribir código. Alcance: que la sugerencia deje de ser
genérica. El asesor carga la medida que pide el cliente, la app filtra las familias
complementarias por lo que corresponda en cada caso, y muestra qué ítems del catálogo
quedan.

Incluye además el panel de reglas y procesos que el `BLUEPRINT.md` ya tenía en F2, y un
defecto de F1 que conviene arreglar acá porque toca el mismo componente.

---

## 1. La decisión que habilita esta fase

El invariante 2 decía "sugerencias a nivel familia, nunca SKU individual". Queda reescrito
como **"la app enumera, el asesor elige"**:

- La **sugerencia** se sigue decidiendo a nivel familia. Eso no cambia.
- La app **puede listar** los ítems del catálogo que sobreviven al filtro de medida y grado,
  con descripción y link.
- La app **no puede** premarcar un ítem, presentarlo como el correcto, ni afirmar precio o
  stock.

El motivo de la restricción original sigue vigente y por eso la mitad de arriba se mantiene:
**el Excel no trae precio ni stock**, y el catálogo es una foto del día del import. Enumerar
lo que hay es una afirmación que los datos sostienen; elegir uno, no.

---

## 2. "La medida" no es un parámetro, son cuatro

Este es el punto que más cambia respecto de la intuición inicial. No hay una medida global
que se propague del disparador a todos sus complementos.

| Cadena | Qué la filtra | Columna | Cobertura |
|---|---|---|---|
| caño → accesorio → brida | **Medida** | `Diametrodinpulgadas` | 96-98 % |
| caño → consumible de aporte | **Grado** | `Calidad` | 97-100 % |
| bulón → tuerca / arandela | **Rosca** | `Rosca` | 96 % / 100 % |
| química, abrasivos | nada | — | familias de 12 a 53 ítems |

### 2.1 Por qué el aporte no se filtra por la medida del caño

```
varilla_tig: 29 items | %Diametro 97 | %Calidad 97
    VARILLA TIG 1,60 308L BOHLER | dia=1.60 cal=308L
    VARILLA TIG 2,40 316L BOHLER | dia=2.40 cal=316L
```

El `Diametro` de la varilla es el de **la varilla** (1,60 / 2,40 mm), no el del caño. Un caño
de 2" no restringe en nada qué varilla lleva. Lo que une caño y aporte es el **grado**, que la
app ya resuelve desde F1 con `aporte_por_grado` y `grado_equivalencia`.

Si se implementara una "medida" global que se propaga a todos los complementos, el resultado
sería filtrar la varilla TIG por 2" y no devolver nada, o peor, devolver la de 2,40 mm porque
el número se parece.

**Consecuencia de diseño:** el criterio de filtrado vive en `complemento_categoria`, por par
disparador-familia, no en una variable global de la sesión.

### 2.2 Las dos series y por qué las pulgadas las reconcilian

En milímetros, la línea industrial y la sanitaria no coinciden nunca. En pulgadas, sí:

| Designación | Industrial (NPS) | Sanitaria |
|---|---|---|
| 1 1/2" | 48,30 mm | 38,10 mm |
| 2" | 60,30 mm | 50,80 mm |
| 3" | 88,90 mm | 76,20 mm |
| 4" | 114,30 mm | 101,60 mm |

`Diametrodinpulgadas` (columna R del Excel) trae esa designación y **hoy no la importamos**.
Es la que hay que usar como clave de match, no los milímetros.

**Cuidado con lo obvio:** una brida industrial de 2" (60,30) no monta en un tubo sanitario de
2" (50,80). La designación en pulgadas es ambigua *entre* líneas. Como el asesor entra por
línea de producto antes de elegir el tipo, el match se hace siempre **dentro del mismo
dominio**. No cruzar líneas.

**Calidad del dato:** hay inconsistencia de formato — aparece `4"` y también `4''`. Normalizar
en la importación, no al leer.

---

## 3. Qué falta importar

Dos cosas, las dos con el mismo patrón que ya usa el import de catálogo.

### 3.1 `Diametrodinpulgadas`

Columna R, hoy descartada. Se agrega a `catalogo_item` junto a las otras dimensiones que ya
se importan desde F1 (`diametro`, `espesor`, `rosca`, `schedule`, `serie`, `tipojunta`,
`acabado`).

Cambia el layout esperado, así que **el hash de headers no cambia** (los headers son los
mismos 43), pero sí cambia el importador y la tabla.

### 3.2 Link por ítem

Archivo aparte: `SKU` → `https://www.famiq.com.ar/producto/{id}`. 13.991 filas.

Cobertura medida contra el catálogo:

| | |
|---|---|
| Ítems del catálogo con link | 13.909 de 16.973 (**81,9 %**) |
| Ítems sin link | 3.064 |
| SKU del archivo que ya no están en el catálogo | 82 |

Y no está parejo por familia:

| Familia | Ítems | Con link |
|---|---|---|
| `instrumentacion` | 730 | 100 % |
| `tapa_puerta` | 806 | 98 % |
| `junta` | 589 | 96 % |
| `bulon` | 2.023 | 85 % |
| `cano` | 1.213 | 77 % |
| `acc_bomba` | 369 | 67 % |
| `tubo` | 492 | 64 % |
| `chapa` | 2.082 | 49 % |
| `griferia`, `acc_bano` | 137 + — | **0 %** |

**Consecuencia:** la enumeración por ítem necesita fallback sí o sí. Un ítem sin link se
muestra igual —con su descripción— pero el botón lleva al listado filtrado de la familia, no
a una URL rota.

**Invariante 5 sigue en pie:** el mapeo va a una tabla por importación, no al código.

---

## 4. El filtro del ecommerce

El sitio acepta por URL, además de `nombreEs`:

- `categoria`, `familia`, `sub-familia` — navegación por catálogo
- `caracteristica_calidad` — el grado
- `caracteristica_diametro`, `_espesor`, `_ancho`, `_largo`, `_lado`, `_forma`, `_terminacion`

Esto es mejor que la búsqueda por nombre que quedó configurada en F1, y `caracteristica_calidad`
permite algo que hoy se desaprovecha: **la app ya sabe el grado y no lo pone en el link**.

`caracteristica_diametro` es un filtro de rango en pulgadas (los presets del sitio son
`Menores de 1"`, `De 1" a 4"`, `Mayores a 4"`).

**Bloqueante:** el formato exacto del parámetro no se puede averiguar sin estar logueado —el
ecommerce es B2B y el listado lo arma JavaScript. Hay que aplicar un filtro en el sitio y
copiar la URL resultante. Hasta entonces, el resolvedor de links no se puede extender.

---

## 5. Defecto de F1 que se arregla acá

La prioridad vive en `complemento`, pero el premarcado se aplica a **todas** las familias de
adentro. Un complemento `oblig` con cuatro familias premarca las cuatro.

Donde más se nota:

| Complemento | Familias | Qué debería pasar |
|---|---|---|
| Consumible de aporte | TIG + MIG + electrodo | Una. El soldador usa un proceso |
| Química de terminación | decapante + pasivante + neutralizante | Las tres. Es una secuencia |
| Abrasivos: corte y acabado | disco + flap + lija + vellón | Al menos una |

O sea que no alcanza con "premarcar solo la primera": hay complementos donde el conjunto
entero es obligatorio y otros donde es una alternativa.

**Propuesta:** agregar `complemento.modo_seleccion` con valores `uno` | `varios`. Con `uno` se
premarca la primera por `orden` y el resto se muestran como alternativas. Va en la base, no en
el componente (invariante 7), y el valor de cada uno de los 100 complementos lo define Oficina
Técnica — con un default conservador y revisión posterior, igual que `proceso.revisado`.

---

## 6. Orden de ataque

| # | Bloque | Depende de |
|---|---|---|
| 1 | Importar `Diametrodinpulgadas` + normalizar `4''` → `4"` | — |
| 2 | Importar el mapeo SKU → link a tabla propia | — |
| 3 | `complemento.modo_seleccion` + arreglo del premarcado | — |
| 4 | Criterio de filtrado por par en `complemento_categoria` (medida / grado / rosca / ninguno) | 1 |
| 5 | Entrada de medida en la puerta A y propagación según el criterio del par | 4 |
| 6 | Enumeración de ítems con descripción y link, sin premarcar | 2, 5 |
| 7 | Extender el resolvedor con `caracteristica_*` | Formato del parámetro |
| 8 | Panel de reglas y de procesos para Oficina Técnica | 3 |
| 9 | Puerta B por proceso | 8 |

Los bloques 1 a 6 no dependen de nada externo. El 7 está bloqueado por el dato del ecommerce.

---

## 7. Riesgos

- **Filtrar de más deja al asesor sin sugerencia.** Si la medida no matchea ningún ítem, la
  respuesta correcta es mostrar la familia completa avisando que no hay coincidencia exacta,
  nunca una lista vacía.
- **36 de 69 familias no tienen ninguna dimensión usable.** El filtro por medida es por par de
  familias, no global, y en buena parte del catálogo simplemente no aplica.
- **El 18 % sin link.** Sin el fallback al listado filtrado, se rompe la promesa de que la app
  no genera links muertos.
- **La enumeración abruma si la familia es grande.** `chapa` tiene 2.082 ítems: sin filtro
  efectivo no se enumera, se lista la familia y listo. Definir un tope por encima del cual no
  se enumera.

---

## 8. Rediseño de la pantalla de mostrador

La primera versión del filtro por medida se probó contra el catálogo real y no resiste el
uso. Esta sección es la corrección, y nace de tres cosas que se vieron en pantalla.

### 8.1 Lo que estaba mal

**Bujes roscados ofrecidos como accesorios para soldar.** Bajo "Accesorios para soldar",
arriba de todo, aparecían `BNS3 2" x h 1 1/2" BSPT` y `... NPT`: fittings roscados forjados
clase 3000, que no se sueldan.

La causa no es el filtro sino **el orden**. Son 15 ítems sobre 1.142 (1,3 %), y salen
primeros porque la lista se ordena alfabéticamente por descripción: `BNS3` gana contra
`CURVA`. Las curvas de 90°, que son 158 y lo más pedido de la familia, no se veían.

**La familia es un balde demasiado grueso.** `acc_soldar_ind` mezcla cosas que el vendedor
jamás mezclaría:

| Ítems | `Tipo` |
|---|---|
| 252 | REDUCCIÓN CONCÉNTRICA |
| 160 | REDUCCIÓN EXCÉNTRICA |
| 158 | CURVA 90° |
| 133 | Tee |
| 121 | Collar |
| 103 | TEE DE REDUCCIÓN |
| 67 | CASQUETE PARA SOLDAR |
| 47 | CURVA 45° |
| 15 | BUJE DE REDUCCIÓN ← los roscados |

**Faltan criterios.** Medida y grado no alcanzan para identificar un material.

### 8.2 `Tipo` es el eje que falta

Medido sobre las 16.973 filas:

| Columna | Cobertura | Valores |
|---|---|---|
| **`Tipo`** | **95 %** | **455** |
| `Norma` | 60 % | 126 |
| `Terminación` | 55 % | 83 |
| `Forma` | 42 % | 296 |
| `Rosca` | 17 % | 14 |
| `Schedule` | 6 % | 15 |
| `Tipojunta` | 5 % | 55 |

`Tipo` está casi siempre, y sus valores son los que usa el mostrador: "CURVA 90°",
"REDUCCIÓN CONCÉNTRICA", "Collar". Es el dato que hoy se importa y no se usa para nada.

**Los ejes son distintos en cada familia**, no hay un set universal:

| Familia | Ejes que discriminan |
|---|---|
| `cano` | Tipo (con/sin costura), medida, grado, Schedule, Norma |
| `chapa` | **Terminación (21 valores)**, espesor, grado |
| `bulon` | Tipo (19), Rosca, Forma, medida |
| `acc_soldar_ind` | **Tipo (23)**, medida, grado, Norma, Serie |
| `tapa_puerta` | **Tipojunta (30)**, Forma |
| `instrumentacion` | Rosca, medida |

### 8.3 Lo que NO se va a hacer: adivinar la conexión

La salida tentadora al problema de los NPT es derivar un eje "tipo de conexión"
(soldar / roscado / clamp) parseando descripción y norma. Se probó y **no da**:

| Familia | Sin determinar |
|---|---|
| `cano` | 100 % |
| `acc_rosc_sw` | 44 % |
| `acc_soldar_ind` | 23 % |

Con ese nivel de indeterminación, filtrar por conexión derivada esconde stock real sin que
nadie se entere. Es inventar un dato que el catálogo no tiene. Se descarta: `Tipo` está al
95 % y es explícito.

### 8.4 El embudo, con su trampa

Simulado sobre caño:

```
CAÑO                      1.213 ítems
  → Tipo "con costura"      626
  → Medida 2"               102
  → Grado 316L               43
  → Schedule SCH10            1
```

Cierra bien hasta el grado. Pero **el schedule está vacío en 37 de esos 43 ítems**: pedirlo
como paso obligatorio esconde el 86 % del stock.

De ahí la regla que gobierna todo el flujo:

> Un eje se ofrece solo si está poblado en la mayoría de los ítems que quedan y si
> realmente parte el conjunto. Un eje mayormente vacío se ofrece como refinamiento
> opcional, nunca como paso, y elegirlo **no** descarta los ítems que no declaran el valor.

### 8.5 El flujo nuevo

Reemplaza la pantalla de selectores sueltos por pasos que se arman solos con los datos.

1. **Identificar el material.** Pasos cortos, uno por eje, en orden de poder discriminante.
   Cada opción muestra cuántos ítems quedan. Reglas:
   - Un eje con una sola opción **no se pregunta**, se aplica y se muestra como dato.
   - Un eje mayormente vacío no es paso, es refinamiento opcional.
   - Nunca se ofrece una opción que lleva a cero.
   - Se puede cortar en cualquier momento: los pasos que faltan son refinamiento.
2. **Ficha del material.** Una línea compacta con lo elegido —`Caño con costura · 2" ·
   316L`— editable por chip, sin volver atrás.
3. **Sugerencias.** Recién acá, y heredando lo que corresponde por par según el criterio
   de `complemento_categoria`.

### 8.6 Ordenar por lo que se vende, no por abecedario

El orden alfabético es lo que puso los bujes NPT arriba. La alternativa no es una heurística:
son los **641.661 renglones de pedido de 2025-2026** que ya están cargados y verificados
(98,6 % clasificado, `scripts/historico/`).

Ordenar cada familia por volumen real de venta pone "CURVA 90°" arriba y "BUJE DE REDUCCIÓN"
donde corresponde, sin escribir una sola regla a mano. Es el primer uso productivo del
histórico y no depende del resto de F4.

**Cuidado:** esto ordena, no filtra. Un ítem que se vende poco sigue estando; aparece más
abajo. No se esconde stock por baja rotación.

### 8.7 Qué hay que construir

| # | Bloque | Depende de |
|---|---|---|
| 1 | Importar `Tipo`, `Norma`, `Terminación`, `Forma` a columnas consultables | — |
| 2 | Tabla de ejes por familia, con su cobertura, generada desde el catálogo | 1 |
| 3 | RPC de facetas: opciones y conteos del conjunto que queda | 2 |
| 4 | Pantalla de pasos + ficha del material | 3 |
| 5 | Ranking de venta por familia y `Tipo`, desde el histórico | `scripts/historico/` |
| 6 | Herencia de criterios a las sugerencias | 4 |

Los bloques 1 a 4 no dependen de nada externo. El 5 usa datos que ya están cargados.
