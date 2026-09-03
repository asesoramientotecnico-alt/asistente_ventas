import { describe, expect, it } from "vitest";
import { CATEGORIA_OTRO, clasificar } from "./clasificador.ts";
import fixtures from "../../tests/fixtures/filas-reales.json" with { type: "json" };
import reglas from "../../data/crosssell_rules.json" with { type: "json" };

/**
 * Todos los casos son filas reales del Excel de catalogo, no inventadas.
 * Se regeneran con: pnpm verificar:conteos -- --fixtures
 *
 * La equivalencia con el original en Python no la prueba este archivo sino
 * tests/catalogo-completo.test.ts, que compara los 69 conteos sobre las 16.973 filas.
 * Estos casos son la red contra regresiones al editar la cascada.
 */

const filas = fixtures.filas;

describe("clasificar: una fila real por categoria", () => {
  it.each(filas.map((f) => [f.esperado, f.material_id, f.descripcion, f] as const))(
    "%s <- %s %s",
    (esperado, _id, _desc, fila) => {
      expect(
        clasificar({
          negocio: fila.negocio,
          familia: fila.familia,
          tipo: fila.tipo,
          desc: fila.descripcion,
        }),
      ).toBe(esperado);
    },
  );

  it("cubre las 69 categorias del JSON de reglas mas 'otro'", () => {
    const cubiertas = new Set(filas.map((f) => f.esperado));
    const declaradas = Object.keys(reglas.categorias);
    expect([...declaradas].filter((c) => !cubiertas.has(c))).toEqual([]);
    expect(cubiertas.has(CATEGORIA_OTRO)).toBe(true);
  });
});

describe("clasificar: el orden de la cascada", () => {
  // Filas reales del archivo. Los kits de sello vienen rotulados dentro de las lineas de
  // valvulas y bombas: si JUNTA no se evaluara antes, caerian en acc_bomba y valvula_ind.
  it("evalua JUNTA antes que la linea de bombas (material 310679)", () => {
    expect(
      clasificar({
        negocio: "BOMBAS",
        familia: "ACC. P/ BOMBAS",
        tipo: "Junta",
        desc: "PROLAC S28 A 35F JUNTAS 80A/80D VITON",
      }),
    ).toBe("junta");
  });

  it("evalua JUNTA antes que la linea de valvulas industriales (material 313089)", () => {
    expect(
      clasificar({
        negocio: "VALVULAS INDUSTRIALES",
        familia: "VALV. ESFERICA IND",
        tipo: "JUNTA VÁLVULA ESFÉRICA",
        desc: "JU EF 021,3     PTFE 2 CPOS BRIDADA",
      }),
    ).toBe("junta");
  });

  it("un ACC. de valvula sanitaria que no es junta sigue siendo repuesto (material 309223)", () => {
    expect(
      clasificar({
        negocio: "VALVULAS SANITARIAS",
        familia: "ACC. P/ VALVULAS SANITARIAS",
        tipo: "REPUESTOS DE VÁLVULA MARIPOSA",
        desc: "CLAPETA V2 MC 063,5 304L",
      }),
    ).toBe("acc_valvula_san");
  });

  it("no corta la cascada cuando un bloque por negocio no matchea nada (material 344827)", () => {
    // El bloque AUXILIARES no devuelve: la evaluacion sigue bajando hasta 'otro'.
    expect(
      clasificar({
        negocio: "AUXILIARES",
        familia: "DECAPANTES Y PASIVANTES",
        tipo: "LIMPIEZA",
        desc: "Pulverizador WS",
      }),
    ).toBe(CATEGORIA_OTRO);
  });

  it("compara en mayusculas (material 303798 en minusculas)", () => {
    expect(
      clasificar({
        negocio: "caños",
        familia: "caños estructurales",
        tipo: "caño con costura",
        desc: "ca cd 100,0x100,0 2,00 304",
      }),
    ).toBe("cano");
  });

  it("fila vacia cae en 'otro'", () => {
    expect(clasificar({})).toBe(CATEGORIA_OTRO);
  });
});
