/**
 * Verificacion de equivalencia del port del clasificador.
 *
 * Los `total_en_catalogo` de las 69 categorias de crosssell_rules.json salieron de correr
 * `clasificar()` de crosssell_bot.py sobre el archivo real. Si el port en TypeScript
 * reproduce esos 69 numeros sobre las 16.973 filas, es equivalente al original sobre el
 * universo completo — que es una garantia mas fuerte que cualquier conjunto de casos.
 *
 * Uso:  pnpm verificar:conteos [ruta-del-xlsx]
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import * as XLSX from "xlsx";
import { clasificar, CATEGORIA_OTRO } from "../src/logica/clasificador.ts";
import { normalizarGrado } from "../src/logica/grado.ts";
import {
  HOJA_DATOS,
  celda,
  diffLayout,
  hashLayout,
  indicesPorHeader,
  normalizarNombreHoja,
} from "../src/logica/layout-excel.ts";

const argumentos = process.argv.slice(2);
const RUTA_XLSX =
  argumentos.find((a) => !a.startsWith("-")) ??
  "data/BAJADoc Dossier caracteristicas de materiales.xlsx";
const RUTA_REGLAS = "data/crosssell_rules.json";
const RUTA_FIXTURES = "tests/fixtures/filas-reales.json";

interface Reglas {
  categorias: Record<string, { etiqueta: string; catalogo: { total_en_catalogo: number } }>;
}

if (!existsSync(RUTA_XLSX)) {
  console.error(`No esta el archivo de catalogo: ${RUTA_XLSX}`);
  process.exit(1);
}

const reglas = JSON.parse(readFileSync(RUTA_REGLAS, "utf8")) as Reglas;
const libro = XLSX.read(readFileSync(RUTA_XLSX));

const nombreHoja = libro.SheetNames.find((n) => normalizarNombreHoja(n) === HOJA_DATOS);
if (nombreHoja === undefined) {
  console.error(`No se encontro la hoja de datos. Hojas: ${JSON.stringify(libro.SheetNames)}`);
  process.exit(1);
}
const hoja = libro.Sheets[nombreHoja];
if (hoja === undefined) throw new Error(`Hoja inaccesible: ${nombreHoja}`);

const filas = XLSX.utils.sheet_to_json<unknown[]>(hoja, { header: 1, raw: false, defval: "" });
const headers = (filas[0] ?? []).map(String);
const indices = indicesPorHeader(headers);
const datos = filas.slice(1);

const diff = diffLayout(headers);
console.log(`Hoja:    "${nombreHoja}"`);
console.log(`Layout:  ${headers.length} columnas | hash ${await hashLayout(headers)}`);
console.log(`Layout:  ${diff.hayCambios ? "CAMBIOS DETECTADOS" : "coincide con el esperado"}`);
console.log(`Filas:   ${datos.length}\n`);

const conteo = new Map<string, number>();
const ejemplos = new Map<string, Record<string, string>>();

for (const fila of datos) {
  const item = {
    material_id: celda(fila, indices, "Material_ID"),
    descripcion: celda(fila, indices, "Material Desc"),
    negocio: celda(fila, indices, "Negocio"),
    familia: celda(fila, indices, "Familia"),
    tipo: celda(fila, indices, "Tipo"),
    calidad: celda(fila, indices, "Calidad"),
  };
  const categoria = clasificar({
    negocio: item.negocio,
    familia: item.familia,
    tipo: item.tipo,
    desc: item.descripcion,
  });
  conteo.set(categoria, (conteo.get(categoria) ?? 0) + 1);
  if (!ejemplos.has(categoria)) {
    ejemplos.set(categoria, {
      ...item,
      grado_norm: normalizarGrado(item.calidad, item.descripcion) ?? "",
      esperado: categoria,
    });
  }
}

let diferencias = 0;
const linea = (estado: string, cat: string, esp: number, obt: number) =>
  console.log(`${estado} ${cat.padEnd(22)} esperado ${String(esp).padStart(5)}  obtenido ${String(obt).padStart(5)}`);

for (const [codigo, def] of Object.entries(reglas.categorias)) {
  const esperado = def.catalogo.total_en_catalogo;
  const obtenido = conteo.get(codigo) ?? 0;
  if (esperado !== obtenido) {
    diferencias += 1;
    linea("DIFIERE", codigo, esperado, obtenido);
  }
}

const otro = conteo.get(CATEGORIA_OTRO) ?? 0;
const sumaEsperada = Object.values(reglas.categorias).reduce(
  (a, c) => a + c.catalogo.total_en_catalogo,
  0,
);
const otroEsperado = datos.length - sumaEsperada;
if (otro !== otroEsperado) {
  diferencias += 1;
  linea("DIFIERE", CATEGORIA_OTRO, otroEsperado, otro);
}

const desconocidas = [...conteo.keys()].filter(
  (c) => c !== CATEGORIA_OTRO && !(c in reglas.categorias),
);
if (desconocidas.length > 0) {
  diferencias += 1;
  console.log(`DIFIERE  categorias fuera del JSON de reglas: ${desconocidas.join(", ")}`);
}

if (diferencias === 0) {
  console.log(`OK  las ${Object.keys(reglas.categorias).length} categorias coinciden con el JSON.`);
  console.log(`OK  '${CATEGORIA_OTRO}': ${otro} filas (${((otro / datos.length) * 100).toFixed(2)} %).`);
} else {
  console.log(`\n${diferencias} diferencia(s). El port NO es equivalente al original.`);
}

if (argumentos.includes("--fixtures")) {
  mkdirSync(dirname(RUTA_FIXTURES), { recursive: true });
  const ordenadas = [...ejemplos.entries()].sort(([a], [b]) => a.localeCompare(b));
  writeFileSync(
    RUTA_FIXTURES,
    `${JSON.stringify(
      {
        _meta: {
          descripcion:
            "Una fila real por categoria, extraida del Excel de catalogo. Generado con: pnpm verificar:conteos -- --fixtures. No editar a mano.",
          archivo: RUTA_XLSX,
          filas_del_archivo: datos.length,
        },
        filas: ordenadas.map(([, v]) => v),
      },
      null,
      2,
    )}\n`,
  );
  console.log(`\nFixtures escritos: ${RUTA_FIXTURES} (${ordenadas.length} filas)`);
}

process.exit(diferencias === 0 ? 0 : 1);
