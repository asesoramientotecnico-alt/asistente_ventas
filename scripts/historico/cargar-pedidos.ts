/**
 * Carga y normalizacion del historico de pedidos (PLAN-F4.md, bloque 1).
 *
 * Dos archivos, dos formatos distintos, mismo destino: una lista de LineaPedido con la
 * categoria de las 69 del clasificador ya resuelta. Todo offline, nada de esto toca la
 * base — la base solo recibe las reglas candidatas que Oficina Tecnica apruebe (F2).
 *
 * Fuentes:
 *   data/pedidos_2025.xlsx  — 8 columnas: Fecha, Cliente, Documento, Material,
 *                              Descripcion, Gr.Art., Cant.Vta, Creador
 *   data/pedidos_2026.csv   — 7 columnas, separado por ';', Latin-1: Fecha, Cliente,
 *                              Razon Social, Documento, Material, Cant.Vta, Creador
 *
 * La categoria se resuelve cruzando Material contra Material_ID del dossier y corriendo
 * clasificar() con sus Negocio/Familia/Tipo/Material Desc reales (invariante: portar el
 * clasificador tal cual, no reinventar una clasificacion aparte para el historico).
 * Si el material no esta en el dossier (item discontinuado), cae a CATEGORIA_SIN_MATCH:
 * NO es lo mismo que 'otro' (que es un item que existe pero no matchea ninguna regla del
 * clasificador). Mezclarlos ensuciaria el reporte de cobertura de 3.1.
 */
import { readFileSync, existsSync } from "node:fs";
import * as XLSX from "xlsx";
import { clasificar } from "../../src/logica/clasificador.ts";
import { HOJA_DATOS, celda, indicesPorHeader, normalizarNombreHoja } from "../../src/logica/layout-excel.ts";

export const CATEGORIA_SIN_MATCH = "sin_match";

export interface LineaPedido {
  readonly fecha: Date;
  readonly anioOrigen: 2025 | 2026;
  readonly clienteId: string;
  readonly documento: string;
  readonly materialId: string;
  readonly cantidad: number;
  readonly categoria: string;
}

interface FilaDossier {
  readonly negocio: string;
  readonly familia: string;
  readonly tipo: string;
  readonly desc: string;
}

const RUTA_DOSSIER = "data/BAJADoc Dossier caracteristicas de materiales.xlsx";
const RUTA_2025 = "data/pedidos_2025.xlsx";
const RUTA_2026 = "data/pedidos_2026.csv";

/** Material_ID -> datos del clasificador, para resolver la categoria del historico. */
export function cargarDossier(ruta = RUTA_DOSSIER): Map<string, FilaDossier> {
  const wb = XLSX.read(readFileSync(ruta), { type: "buffer" });
  const nombreHoja = wb.SheetNames.find(
    (n) => normalizarNombreHoja(n) === normalizarNombreHoja(HOJA_DATOS),
  );
  if (nombreHoja === undefined) throw new Error(`No se encontro la hoja "${HOJA_DATOS}" en ${ruta}`);
  const hoja = wb.Sheets[nombreHoja];
  if (hoja === undefined) throw new Error(`La hoja "${nombreHoja}" no tiene datos en ${ruta}`);

  const filas = XLSX.utils.sheet_to_json<string[]>(hoja, {
    header: 1,
    raw: false,
    defval: "",
  });
  const idx = indicesPorHeader(filas[0] as string[]);

  const mapa = new Map<string, FilaDossier>();
  for (let i = 1; i < filas.length; i++) {
    const f = filas[i] as string[];
    const id = celda(f, idx, "Material_ID").trim();
    if (id === "") continue;
    mapa.set(id, {
      negocio: celda(f, idx, "Negocio"),
      familia: celda(f, idx, "Familia"),
      tipo: celda(f, idx, "Tipo"),
      desc: celda(f, idx, "Material Desc"),
    });
  }
  return mapa;
}

/** "12,50" o "12.50" -> 12.5. El 2025 y el 2026 coinciden en punto decimal, pero no confiar. */
function numero(s: string): number {
  const limpio = s.trim().replace(",", ".");
  const n = Number(limpio);
  return Number.isFinite(n) ? n : 0;
}

/** "1/1/25" o "1/1/2026" -> Date. Ambos archivos vienen D/M/AA(AA), sin ceros a la izquierda. */
function fechaDDMMAA(s: string): Date {
  const partes = s.trim().split("/").map(Number);
  const d = partes[0] ?? 1;
  const m = partes[1] ?? 1;
  const a = partes[2] ?? 2000;
  const anio = a < 100 ? 2000 + a : a;
  return new Date(anio, m - 1, d);
}

function resolverCategoria(materialId: string, dossier: ReadonlyMap<string, FilaDossier>): string {
  const fila = dossier.get(materialId);
  if (fila === undefined) return CATEGORIA_SIN_MATCH;
  return clasificar({ negocio: fila.negocio, familia: fila.familia, tipo: fila.tipo, desc: fila.desc });
}

function cargar2025(ruta: string, dossier: ReadonlyMap<string, FilaDossier>): LineaPedido[] {
  const wb = XLSX.read(readFileSync(ruta), { type: "buffer" });
  const primeraHoja = wb.SheetNames[0];
  if (primeraHoja === undefined) throw new Error(`${ruta} no tiene hojas`);
  const hoja = wb.Sheets[primeraHoja];
  if (hoja === undefined) throw new Error(`La hoja "${primeraHoja}" no tiene datos en ${ruta}`);
  const filas = XLSX.utils.sheet_to_json<string[]>(hoja, {
    header: 1,
    raw: false,
    defval: "",
  });
  // Fecha, Cliente, Documento, Material, Descripcion, Gr.Art., Cant.Vta, Creador
  const out: LineaPedido[] = [];
  for (let i = 1; i < filas.length; i++) {
    const f = filas[i] as string[];
    const materialId = String(f[3] ?? "").trim();
    if (materialId === "") continue;
    out.push({
      fecha: fechaDDMMAA(String(f[0] ?? "")),
      anioOrigen: 2025,
      clienteId: String(f[1] ?? "").trim(),
      documento: String(f[2] ?? "").trim(),
      materialId,
      cantidad: numero(String(f[6] ?? "0")),
      categoria: resolverCategoria(materialId, dossier),
    });
  }
  return out;
}

function cargar2026(ruta: string, dossier: ReadonlyMap<string, FilaDossier>): LineaPedido[] {
  const texto = readFileSync(ruta, "latin1");
  const lineas = texto.split(/\r?\n/).filter((l) => l.trim() !== "");
  // Fecha; Cliente; Razon Social; Documento; Material; Cant.Vta; Creador
  const out: LineaPedido[] = [];
  for (let i = 1; i < lineas.length; i++) {
    const c = (lineas[i] ?? "").split(";");
    const materialId = (c[4] ?? "").trim();
    if (materialId === "") continue;
    out.push({
      fecha: fechaDDMMAA(c[0] ?? ""),
      anioOrigen: 2026,
      clienteId: (c[1] ?? "").trim(),
      documento: (c[3] ?? "").trim(),
      materialId,
      cantidad: numero(c[5] ?? "0"),
      categoria: resolverCategoria(materialId, dossier),
    });
  }
  return out;
}

export interface HistoricoCargado {
  readonly lineas: readonly LineaPedido[];
  readonly dossier: ReadonlyMap<string, FilaDossier>;
}

export function cargarHistorico(opts?: {
  dossier?: string;
  archivo2025?: string;
  archivo2026?: string;
}): HistoricoCargado {
  const rutaDossier = opts?.dossier ?? RUTA_DOSSIER;
  const ruta2025 = opts?.archivo2025 ?? RUTA_2025;
  const ruta2026 = opts?.archivo2026 ?? RUTA_2026;

  for (const [ruta, etiqueta] of [
    [rutaDossier, "dossier de catalogo"],
    [ruta2025, "pedidos 2025"],
    [ruta2026, "pedidos 2026"],
  ] as const) {
    if (!existsSync(ruta)) throw new Error(`Falta el archivo de ${etiqueta}: ${ruta}`);
  }

  const dossier = cargarDossier(rutaDossier);
  const lineas = [...cargar2025(ruta2025, dossier), ...cargar2026(ruta2026, dossier)];
  return { lineas, dossier };
}

// Ejecutado directo (no importado): imprime un resumen minimo de carga.
if (import.meta.url === `file://${process.argv[1]}`) {
  const { lineas } = cargarHistorico();
  const porAnio = new Map<number, number>();
  for (const l of lineas) porAnio.set(l.anioOrigen, (porAnio.get(l.anioOrigen) ?? 0) + 1);
  console.log(`Lineas cargadas: ${lineas.length}`);
  for (const [anio, n] of [...porAnio.entries()].sort()) console.log(`  ${anio}: ${n}`);
}
