/**
 * Ranking de venta real por familia y tipo de producto (PLAN-F2.md, 8.6).
 *
 * El orden alfabetico por descripcion es lo que puso los bujes NPT arriba de "Accesorios
 * para soldar". Esto lo reemplaza por el volumen que cada cosa vende de verdad, sacado de
 * los 641.661 renglones de 2025-2026.
 *
 * Ordena, NO filtra: un item de baja rotacion sigue estando, mas abajo. Esconder stock
 * por poca venta seria peor que el problema que resuelve.
 *
 * Se agrega por (categoria, tipo) y no por material_id a proposito:
 *   - El ranking sobrevive a un cambio de catalogo. Un codigo nuevo de curva de 90 hereda
 *     el lugar de las curvas de 90; si fuera por SKU, entraria ultimo.
 *   - Es agregado: no viaja ningun dato de cliente.
 *
 * Uso:  node --experimental-strip-types scripts/historico/ranking-venta.ts [--sql]
 */
import { readFileSync, writeFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { cargarHistorico, CATEGORIA_SIN_MATCH } from "./cargar-pedidos.ts";
import { CATEGORIA_OTRO } from "../../src/logica/clasificador.ts";
import { HOJA_DATOS, celda, indicesPorHeader, normalizarNombreHoja } from "../../src/logica/layout-excel.ts";

const RUTA_DOSSIER = "data/BAJADoc Dossier caracteristicas de materiales.xlsx";
const RUTA_SQL = "supabase/ranking-venta.sql";

/** material_id -> Tipo, que es el eje del ranking. No esta en LineaPedido. */
function tipoPorMaterial(): Map<string, string> {
  const wb = XLSX.read(readFileSync(RUTA_DOSSIER), { type: "buffer" });
  const nombre = wb.SheetNames.find(
    (n) => normalizarNombreHoja(n) === normalizarNombreHoja(HOJA_DATOS),
  );
  if (nombre === undefined) throw new Error("No se encontro la hoja de datos del dossier");
  const hoja = wb.Sheets[nombre];
  if (hoja === undefined) throw new Error("La hoja de datos vino vacia");

  const filas = XLSX.utils.sheet_to_json<string[]>(hoja, { header: 1, raw: false, defval: "" });
  const idx = indicesPorHeader(filas[0] as string[]);
  const mapa = new Map<string, string>();
  for (let i = 1; i < filas.length; i++) {
    const f = filas[i] as string[];
    const id = celda(f, idx, "Material_ID").trim();
    if (id === "") continue;
    mapa.set(id, celda(f, idx, "Tipo").trim());
  }
  return mapa;
}

interface FilaRanking {
  categoria: string;
  tipo: string;
  lineas: number;
  clientes: number;
}

export function calcularRanking(): FilaRanking[] {
  const { lineas } = cargarHistorico();
  const tipos = tipoPorMaterial();

  // clientes distintos ademas de renglones: 500 renglones de un solo cliente no son lo
  // mismo que 500 de 200 clientes, y lo segundo es mejor senial de demanda general.
  const acum = new Map<string, { lineas: number; clientes: Set<string> }>();
  for (const l of lineas) {
    if (l.categoria === CATEGORIA_SIN_MATCH || l.categoria === CATEGORIA_OTRO) continue;
    const tipo = tipos.get(l.materialId) ?? "";
    if (tipo === "") continue;
    const clave = `${l.categoria}\u0000${tipo}`;
    const e = acum.get(clave) ?? { lineas: 0, clientes: new Set<string>() };
    e.lineas++;
    e.clientes.add(l.clienteId);
    acum.set(clave, e);
  }

  return [...acum.entries()]
    .map(([clave, v]) => {
      const [categoria = "", tipo = ""] = clave.split("\u0000");
      return { categoria, tipo, lineas: v.lineas, clientes: v.clientes.size };
    })
    .sort((a, b) => b.lineas - a.lineas);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const ranking = calcularRanking();
  const categorias = new Set(ranking.map((r) => r.categoria));
  console.log(`Filas de ranking: ${ranking.length} (${categorias.size} familias)`);
  console.log(`\nTop 12 global:`);
  for (const r of ranking.slice(0, 12)) {
    console.log(`  ${String(r.lineas).padStart(6)} renglones  ${String(r.clientes).padStart(5)} clientes  ${r.categoria}/${r.tipo}`);
  }
  console.log(`\nacc_soldar_ind, que es el caso del bug:`);
  for (const r of ranking.filter((r) => r.categoria === "acc_soldar_ind").slice(0, 12)) {
    console.log(`  ${String(r.lineas).padStart(6)} renglones  ${r.tipo}`);
  }

  if (process.argv.includes("--sql")) {
    const esc = (s: string) => `'${s.replace(/'/g, "''")}'`;
    const sql = [
      "-- GENERADO por scripts/historico/ranking-venta.ts. No editar a mano.",
      "-- Agregado de 2025-2026 por familia y tipo. Sin dato de cliente: solo conteos.",
      "begin;",
      "delete from ranking_venta;",
      "insert into ranking_venta (categoria_codigo, tipo, lineas, clientes) values",
      ranking.map((r) => `  (${esc(r.categoria)}, ${esc(r.tipo)}, ${r.lineas}, ${r.clientes})`).join(",\n") + ";",
      "commit;",
      "",
    ].join("\n");
    writeFileSync(RUTA_SQL, sql);
    console.log(`\nEscrito ${RUTA_SQL} — ${sql.length} caracteres`);
  }
}
