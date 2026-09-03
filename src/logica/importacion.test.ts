import { describe, expect, it } from "vitest";
import { HEADERS_ESPERADOS } from "./layout-excel.ts";
import { UMBRAL_ALERTA_OTRO, analizar, compararConAnterior } from "./importacion.ts";
import fixtures from "../../tests/fixtures/filas-reales.json" with { type: "json" };

/**
 * Las filas son reales: se arman a partir de tests/fixtures/filas-reales.json, extraido
 * del Excel de catalogo. Lo que se construye aca es la grilla de celdas, para poder
 * probar la lectura por nombre de header y los casos de archivo mal formado.
 */
const H = [...HEADERS_ESPERADOS];
const columna = (h: string) => H.indexOf(h);

function filaDesde(f: (typeof fixtures.filas)[number], headers: readonly string[] = H): unknown[] {
  const fila = new Array<unknown>(headers.length).fill("");
  const poner = (h: string, v: string) => {
    const i = headers.indexOf(h);
    if (i !== -1) fila[i] = v;
  };
  poner("Material_ID", f.material_id);
  poner("Material Desc", f.descripcion);
  poner("Negocio", f.negocio);
  poner("Familia", f.familia);
  poner("Tipo", f.tipo);
  poner("Calidad", f.calidad);
  return fila;
}

const cano = fixtures.filas.find((f) => f.esperado === "cano")!;
const tungsteno = fixtures.filas.find((f) => f.esperado === "tungsteno")!;
const otro = fixtures.filas.find((f) => f.esperado === "otro")!;

describe("analizar", () => {
  it("clasifica y normaliza el grado de cada fila", async () => {
    const a = await analizar(H, [filaDesde(cano), filaDesde(tungsteno), filaDesde(otro)]);

    expect(a.importable).toBe(true);
    expect(a.filas).toBe(3);
    expect(a.conteo).toEqual({ cano: 1, tungsteno: 1, otro: 1 });
    expect(a.filasOtro).toBe(1);
    expect(a.items[0]?.categoria_codigo).toBe("cano");
    expect(a.items[0]?.grado_norm).toBe(cano.grado_norm);
    expect(a.items[1]?.grado_norm).toBeNull();
  });

  it("lee por nombre de header, no por posicion", async () => {
    const invertidos = [...H].reverse();
    const a = await analizar(invertidos, [filaDesde(cano, invertidos)], invertidos);

    expect(a.items[0]?.material_id).toBe(cano.material_id);
    expect(a.items[0]?.negocio).toBe(cano.negocio);
    expect(a.items[0]?.categoria_codigo).toBe("cano");
  });

  it("rechaza el archivo si el layout no coincide con el del ultimo import", async () => {
    const movido = [...H];
    movido[columna("Calidad")] = "Calidad2";
    const a = await analizar(movido, [filaDesde(cano, movido)]);

    expect(a.importable).toBe(false);
    expect(a.diff.hayCambios).toBe(true);
    expect(a.motivos[0]).toContain("layout");
  });

  it("acepta un layout reordenado si se compara contra el del import que lo trajo", async () => {
    const movido = [...H];
    const i = columna("Calidad");
    const j = columna("Familia");
    [movido[i], movido[j]] = [movido[j] as string, movido[i] as string];

    expect((await analizar(movido, [], H)).diff.hayCambios).toBe(true);
    expect((await analizar(movido, [filaDesde(cano, movido)], movido)).importable).toBe(true);
  });

  it("frena antes de insertar si hay Material_ID repetidos", async () => {
    const a = await analizar(H, [filaDesde(cano), filaDesde(cano), filaDesde(tungsteno)]);

    expect(a.importable).toBe(false);
    expect(a.duplicados).toEqual([cano.material_id]);
    expect(a.filas).toBe(2);
    expect(a.motivos.some((m) => m.includes("repetidos"))).toBe(true);
  });

  it("frena si hay filas con datos y sin Material_ID", async () => {
    const rota = filaDesde(cano);
    rota[columna("Material_ID")] = "";
    const a = await analizar(H, [filaDesde(tungsteno), rota]);

    expect(a.importable).toBe(false);
    expect(a.sinMaterialId).toBe(1);
  });

  it("ignora las filas totalmente vacias del final sin contarlas como problema", async () => {
    const vacia = new Array<unknown>(H.length).fill("");
    const a = await analizar(H, [filaDesde(cano), vacia, vacia]);

    expect(a.importable).toBe(true);
    expect(a.filas).toBe(1);
    expect(a.filasVacias).toBe(2);
  });

  it("un archivo sin filas utiles no es importable", async () => {
    expect((await analizar(H, [])).importable).toBe(false);
  });

  it("el hash del layout viaja con el analisis", async () => {
    const a = await analizar(H, [filaDesde(cano)]);
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("compararConAnterior", () => {
  it("sin import previo no hay con que comparar", () => {
    expect(compararConAnterior({ cano: 10 }, null)).toBeNull();
  });

  it("avisa cuando 'otro' sube mas del umbral", () => {
    const antes = { cano: 9900, otro: 100 }; // 1,00 %
    const ahora = { cano: 9700, otro: 300 }; // 3,00 %
    const c = compararConAnterior(ahora, antes)!;

    expect(c.deltaPuntos).toBeCloseTo(2, 5);
    expect(c.deltaPuntos).toBeGreaterThan(UMBRAL_ALERTA_OTRO);
    expect(c.alerta).toBe(true);
  });

  it("no avisa por una variacion chica", () => {
    const c = compararConAnterior({ cano: 9890, otro: 110 }, { cano: 9900, otro: 100 })!;
    expect(c.alerta).toBe(false);
  });

  it("avisa si una familia que se sugeria quedo sin items, aunque 'otro' no suba", () => {
    const c = compararConAnterior({ cano: 10000, otro: 0 }, { cano: 9950, mirilla: 50, otro: 0 })!;

    expect(c.categoriasVaciadas).toEqual(["mirilla"]);
    expect(c.alerta).toBe(true);
  });

  it("lista las categorias que aparecen por primera vez", () => {
    const c = compararConAnterior({ cano: 100, fresa: 5 }, { cano: 100 })!;
    expect(c.categoriasNuevas).toEqual(["fresa"]);
    expect(c.categoriasVaciadas).toEqual([]);
  });
});
