/**
 * Reporte de cobertura del historico (PLAN-F4.md, bloque 1, cierre).
 *
 * Antes de armar una sola canasta hay que saber cuanto del historico se puede clasificar
 * y donde se pierde el resto. Dos tipos de descarte, no confundir:
 *
 *   sin_match : el Material no esta en el dossier de catalogo (item discontinuado o
 *               fuera del universo importado). No se puede resolver Negocio/Familia/Tipo.
 *   otro      : el Material SI esta en el dossier, pero clasificar() no lo encasilla en
 *               ninguna de las 69 categorias (mismo fallback que usa el importador).
 *
 * Uso: node --experimental-strip-types scripts/historico/reporte-cobertura.ts
 */
import { cargarHistorico, CATEGORIA_SIN_MATCH } from "./cargar-pedidos.ts";
import { CATEGORIA_OTRO } from "../../src/logica/clasificador.ts";

const { lineas } = cargarHistorico();

console.log(`Lineas totales (2025 + 2026): ${lineas.length}`);

const porAnio = new Map<number, number>();
for (const l of lineas) porAnio.set(l.anioOrigen, (porAnio.get(l.anioOrigen) ?? 0) + 1);
for (const [anio, n] of [...porAnio.entries()].sort()) console.log(`  ${anio}: ${n}`);

const sinMatch = lineas.filter((l) => l.categoria === CATEGORIA_SIN_MATCH);
const enOtro = lineas.filter((l) => l.categoria === CATEGORIA_OTRO);
const clasificadas = lineas.length - sinMatch.length - enOtro.length;

console.log(`\nClasificadas en alguna de las 69 categorias: ${clasificadas} (${(clasificadas / lineas.length * 100).toFixed(1)}%)`);
console.log(`Sin match contra el dossier (item discontinuado o fuera de universo): ${sinMatch.length} (${(sinMatch.length / lineas.length * 100).toFixed(1)}%)`);
console.log(`En el dossier pero clasificar() -> 'otro': ${enOtro.length} (${(enOtro.length / lineas.length * 100).toFixed(1)}%)`);

// Los materiales sin match mas repetidos: son los que mas conviene revisar a mano si el
// porcentaje total preocupa.
const conteoSinMatch = new Map<string, number>();
for (const l of sinMatch) conteoSinMatch.set(l.materialId, (conteoSinMatch.get(l.materialId) ?? 0) + 1);
const topSinMatch = [...conteoSinMatch.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
if (topSinMatch.length > 0) {
  console.log(`\nTop 15 materiales sin match (por lineas de pedido):`);
  for (const [id, n] of topSinMatch) console.log(`  ${id.padEnd(12)} ${n} lineas`);
}

// Cobertura por categoria: cuantas familias del catalogo aparecen efectivamente en pedidos,
// y con cuanto volumen. Una familia con 0 pedidos es candidata a revisar (¿nadie la pide,
// o el clasificador la esta mandando a otro lado?).
const porCategoria = new Map<string, number>();
for (const l of lineas) {
  if (l.categoria === CATEGORIA_SIN_MATCH || l.categoria === CATEGORIA_OTRO) continue;
  porCategoria.set(l.categoria, (porCategoria.get(l.categoria) ?? 0) + 1);
}
const ordenado = [...porCategoria.entries()].sort((a, b) => b[1] - a[1]);
console.log(`\nCategorias distintas con pedidos: ${ordenado.length}`);
console.log(`\nTop 15 por volumen de lineas:`);
for (const [cat, n] of ordenado.slice(0, 15)) console.log(`  ${cat.padEnd(22)} ${n}`);
console.log(`\nBottom 10 (menos pedidas, entre las que aparecen):`);
for (const [cat, n] of ordenado.slice(-10)) console.log(`  ${cat.padEnd(22)} ${n}`);
