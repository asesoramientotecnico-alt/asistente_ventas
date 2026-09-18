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

/**
 * "4,000.000" -> 4000. La coma es separador de MILES y el punto el decimal.
 *
 * 8.932 lineas del historico vienen asi, y son las de mayor volumen. Un replace de coma
 * por punto las convierte en "4.000.000" -> NaN, y devolverlas como 0 en silencio borra
 * justo las ventas mas grandes. Por eso devuelve null y el que llama lo cuenta.
 */
export function numero(s: string): number | null {
  const limpio = s.trim().replace(/,/g, "");
  if (limpio === "") return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

/**
 * Los dos archivos traen la fecha con el orden INVERTIDO. No es un detalle menor: tratarlos
 * igual corrompe en silencio las ventanas de 7 y 30 dias.
 *
 *   pedidos_2025.xlsx -> M/D/AA    (primer campo llega a 12, el segundo a 31)
 *   pedidos_2026.csv  -> D/M/AAAA  (primer campo llega a 31, el segundo a 8)
 *
 * Verificado sobre los dos archivos completos. Si se regenera el export, `validarAnio()`
 * avisa si el orden cambio en vez de dejar pasar fechas mal parseadas.
 */
export type OrdenFecha = "MDA" | "DMA";

export function parsearFecha(s: string, orden: OrdenFecha): Date | null {
  const partes = s.trim().split("/");
  if (partes.length !== 3) return null;
  const n = partes.map(Number);
  if (n.some((x) => !Number.isFinite(x))) return null;

  const [p0, p1, p2] = n as [number, number, number];
  const mes = orden === "MDA" ? p0 : p1;
  const dia = orden === "MDA" ? p1 : p0;
  const anio = p2 < 100 ? 2000 + p2 : p2;

  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  const f = new Date(anio, mes - 1, dia);
  // Rebote: new Date(2025, 1, 30) da 2 de marzo. Si el dia no sobrevive, la fecha no existia.
  if (f.getMonth() !== mes - 1 || f.getDate() !== dia) return null;
  return f;
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
    const fecha = parsearFecha(String(f[0] ?? ""), "MDA");
    if (fecha === null) {
      descartes.fechaIlegible++;
      continue;
    }
    const cantidad = numero(String(f[6] ?? ""));
    if (cantidad === null) descartes.cantidadIlegible++;
    out.push({
      fecha,
      anioOrigen: 2025,
      clienteId: String(f[1] ?? "").trim(),
      documento: String(f[2] ?? "").trim(),
      materialId,
      cantidad: cantidad ?? 0,
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
    const fecha = parsearFecha(c[0] ?? "", "DMA");
    if (fecha === null) {
      descartes.fechaIlegible++;
      continue;
    }
    const cantidad = numero(c[5] ?? "");
    if (cantidad === null) descartes.cantidadIlegible++;
    out.push({
      fecha,
      anioOrigen: 2026,
      clienteId: (c[1] ?? "").trim(),
      documento: (c[3] ?? "").trim(),
      materialId,
      cantidad: cantidad ?? 0,
      categoria: resolverCategoria(materialId, dossier),
    });
  }
  return out;
}

export interface Descartes {
  fechaIlegible: number;
  cantidadIlegible: number;
}

/** Contador compartido por los dos cargadores. Se resetea en cada cargarHistorico(). */
const descartes: Descartes = { fechaIlegible: 0, cantidadIlegible: 0 };

export interface HistoricoCargado {
  readonly lineas: readonly LineaPedido[];
  readonly dossier: ReadonlyMap<string, FilaDossier>;
  readonly descartes: Readonly<Descartes>;
}

/**
 * Toda linea tiene que caer en el anio de su archivo. Si el export se regenera con otro
 * orden de fecha, esto falla fuerte en vez de dejar pasar ventanas corrompidas.
 */
function validarAnio(lineas: readonly LineaPedido[]): void {
  const fuera = lineas.filter((l) => l.fecha.getFullYear() !== l.anioOrigen);
  if (fuera.length === 0) return;
  const m = fuera.slice(0, 3).map((l) => `${l.fecha.toISOString().slice(0, 10)} (archivo ${l.anioOrigen})`);
  throw new Error(
    `${fuera.length} lineas con fecha fuera del anio de su archivo. ` +
      `Probablemente cambio el orden D/M vs M/D en el export. Ejemplos: ${m.join(", ")}`,
  );
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

  descartes.fechaIlegible = 0;
  descartes.cantidadIlegible = 0;

  const dossier = cargarDossier(rutaDossier);
  const lineas = [...cargar2025(ruta2025, dossier), ...cargar2026(ruta2026, dossier)];
  validarAnio(lineas);
  return { lineas, dossier, descartes: { ...descartes } };
}

// Ejecutado directo (no importado): imprime un resumen minimo de carga.
if (import.meta.url === `file://${process.argv[1]}`) {
  const { lineas } = cargarHistorico();
  const porAnio = new Map<number, number>();
  for (const l of lineas) porAnio.set(l.anioOrigen, (porAnio.get(l.anioOrigen) ?? 0) + 1);
  console.log(`Lineas cargadas: ${lineas.length}`);
  for (const [anio, n] of [...porAnio.entries()].sort()) console.log(`  ${anio}: ${n}`);
}
