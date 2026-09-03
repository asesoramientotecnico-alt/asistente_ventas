/**
 * Normalizacion de grado de material.
 *
 * `normalizarGrado()` es port literal de `normalizar_grado()` de crosssell_bot.py:
 * mapea los aportes de soldadura a su grado y, si `Calidad` viene vacia, intenta
 * extraerlo de la descripcion.
 *
 * `familiaDeGrado()` NO esta en el original. Resuelve el problema de que
 * `aporte_por_grado` esta indexada por 304 / 316 / 310 mientras que la columna
 * `Calidad` del catalogo trae 304L / 316L / 310S en la mayoria de las filas: sin
 * este colapso, un cano 316L no recibe la justificacion tecnica del aporte.
 *
 * La tabla de equivalencias vive en la base (`grado_equivalencia`) para que Oficina
 * Tecnica la amplie sin redeploy. Esta funcion no la conoce: la recibe.
 */

/** Aportes de soldadura mapeados a su grado. Del original. */
const EQUIVALENCIA_APORTE = new Map<string, string>([
  ["E308", "308L"],
  ["E316", "316L"],
  ["E310", "310"],
  ["E312", "312"],
  ["310L", "310"],
  ["312L", "312"],
]);

/** Grados que se buscan en la descripcion cuando `Calidad` viene vacia. El orden importa. */
const GRADOS_EN_DESCRIPCION = [
  "316L",
  "304L",
  "316",
  "304",
  "430",
  "420",
  "310",
  "309L",
  "312",
  "308L",
] as const;

export function normalizarGrado(calidad: string | null | undefined, desc = ""): string | null {
  const g = (calidad ?? "").toUpperCase().trim();

  const equivalente = EQUIVALENCIA_APORTE.get(g);
  if (equivalente !== undefined) return equivalente;
  if (g !== "" && g !== "NONE") return g;

  const u = (desc ?? "").toUpperCase();
  for (const k of GRADOS_EN_DESCRIPCION) {
    if (u.includes(k)) return k;
  }
  return null;
}

/**
 * Semilla de `grado_equivalencia`. Deliberadamente minima: solo las variantes L / H / S / Ti
 * de los tres grados que hoy tienen aporte definido. Un grado que no este aca cae en el
 * motivo generico del complemento, que es el comportamiento actual — no se inventa un
 * aporte para grados sobre los que Oficina Tecnica no se pronuncio.
 */
export const EQUIVALENCIAS_GRADO_SEMILLA: ReadonlyArray<{ grado: string; familia: string }> = [
  { grado: "304", familia: "304" },
  { grado: "304L", familia: "304" },
  { grado: "304H", familia: "304" },
  { grado: "316", familia: "316" },
  { grado: "316L", familia: "316" },
  { grado: "316TI", familia: "316" },
  { grado: "310", familia: "310" },
  { grado: "310S", familia: "310" },
];

/** Colapsa un grado a la familia con la que se busca el aporte. `null` si no hay equivalencia. */
export function familiaDeGrado(
  grado: string | null | undefined,
  equivalencias: ReadonlyMap<string, string>,
): string | null {
  if (grado === null || grado === undefined) return null;
  return equivalencias.get(grado.toUpperCase().trim()) ?? null;
}
