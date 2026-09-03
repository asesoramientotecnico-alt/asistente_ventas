import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { CATEGORIA_OTRO, clasificar } from "../src/logica/clasificador.ts";
import { analizar } from "../src/logica/importacion.ts";
import {
  HEADERS_ESPERADOS,
  HOJA_DATOS,
  celda,
  diffLayout,
  indicesPorHeader,
  normalizarNombreHoja,
} from "../src/logica/layout-excel.ts";
import reglas from "../data/crosssell_rules.json" with { type: "json" };

/**
 * Equivalencia del port contra el original en Python, sobre el universo completo.
 *
 * Los `total_en_catalogo` del JSON de reglas son la salida de `clasificar()` de
 * crosssell_bot.py sobre este mismo archivo. Reproducir los 69 numeros es una garantia
 * mas fuerte que cualquier conjunto de casos elegidos a mano.
 *
 * El Excel no esta versionado (16.973 filas de dato de negocio, ver .gitignore), asi que
 * la suite se saltea si el archivo no esta. Correrla es requisito antes de dar por cerrado
 * cualquier cambio al clasificador.
 */

const RUTA = "data/BAJADoc Dossier caracteristicas de materiales.xlsx";
const hayArchivo = existsSync(RUTA);

describe.skipIf(!hayArchivo)("catalogo completo", () => {
  const libro = XLSX.read(readFileSync(RUTA));
  const nombreHoja = libro.SheetNames.find((n) => normalizarNombreHoja(n) === HOJA_DATOS);
  const hoja = nombreHoja === undefined ? undefined : libro.Sheets[nombreHoja];
  const filas =
    hoja === undefined
      ? []
      : XLSX.utils.sheet_to_json<unknown[]>(hoja, { header: 1, raw: false, defval: "" });
  const headers = (filas[0] ?? []).map(String);
  const indices = indicesPorHeader(headers);
  const datos = filas.slice(1);

  const conteo = new Map<string, number>();
  for (const fila of datos) {
    const c = clasificar({
      negocio: celda(fila, indices, "Negocio"),
      familia: celda(fila, indices, "Familia"),
      tipo: celda(fila, indices, "Tipo"),
      desc: celda(fila, indices, "Material Desc"),
    });
    conteo.set(c, (conteo.get(c) ?? 0) + 1);
  }

  it("la hoja de datos es la que viene con espacio al final", () => {
    expect(nombreHoja).toBe("Doc Dossier caracteristicas de ");
  });

  it("el layout del archivo coincide con el esperado", () => {
    expect(headers).toHaveLength(HEADERS_ESPERADOS.length);
    expect(diffLayout(headers).hayCambios).toBe(false);
  });

  it("tiene 16.973 filas de datos", () => {
    expect(datos).toHaveLength(16973);
  });

  it("reproduce los conteos de las 69 categorias del original", () => {
    const esperados: Record<string, number> = {};
    const obtenidos: Record<string, number> = {};
    for (const [codigo, def] of Object.entries(reglas.categorias)) {
      esperados[codigo] = def.catalogo.total_en_catalogo;
      obtenidos[codigo] = conteo.get(codigo) ?? 0;
    }
    expect(obtenidos).toEqual(esperados);
  });

  it("deja 397 filas en 'otro' (2,34 %)", () => {
    expect(conteo.get(CATEGORIA_OTRO)).toBe(397);
  });

  it("no produce ninguna categoria que no exista en el JSON de reglas", () => {
    const fuera = [...conteo.keys()].filter((c) => c !== CATEGORIA_OTRO && !(c in reglas.categorias));
    expect(fuera).toEqual([]);
  });

  it("el archivo real pasa el analisis de importacion completo", async () => {
    const a = await analizar(headers, datos);

    expect(a.diff.hayCambios).toBe(false);
    expect(a.duplicados).toEqual([]);
    expect(a.sinMaterialId).toBe(0);
    expect(a.filasVacias).toBe(0);
    expect(a.importable).toBe(true);
    expect(a.filas).toBe(16973);
    expect(a.filasOtro).toBe(397);
    expect(Object.keys(a.conteo)).toHaveLength(Object.keys(reglas.categorias).length + 1);
  });
});
