import { describe, expect, it } from "vitest";
import {
  aplicarAporte,
  claveSeleccion,
  filtrarPorCatalogo,
  motivoConAporte,
  ordenarPorPrioridad,
  prepararSugerencias,
  seleccionInicial,
  type ComplementoSugerido,
} from "./sugerencias.ts";
import reglas from "../../data/crosssell_rules.json" with { type: "json" };

/**
 * Las reglas son las reales: se leen de crosssell_rules.json, que es lo que siembra la
 * base. Lo que varia en cada caso son los conteos del catalogo y el grado elegido.
 */
const tipoCano = reglas.tipos.cano;

function complementosDe(
  tipo: { complementos: Array<{ nombre: string; prioridad: string; motivo: string; familias: string[]; depende_del_grado: boolean }> },
  items: Record<string, number>,
): ComplementoSugerido[] {
  return tipo.complementos.map((c, i) => ({
    id: `c${i}`,
    nombre: c.nombre,
    prioridad: c.prioridad as ComplementoSugerido["prioridad"],
    motivo: c.motivo,
    dependeDelGrado: c.depende_del_grado,
    familias: c.familias.map((f) => ({
      codigo: f,
      etiqueta: (reglas.categorias as Record<string, { etiqueta: string }>)[f]?.etiqueta ?? f,
      items: items[f] ?? 0,
    })),
  }));
}

/** Conteos reales del catalogo para las familias que complementan a un caño. */
const CATALOGO = {
  acc_soldar_ind: 1142,
  varilla_tig: 29,
  alambre_mig: 21,
  electrodo_revestido: 53,
  brida: 240,
  decapante: 12,
  pasivante: 7,
  neutralizante: 3,
  disco_corte: 21,
  flap: 53,
  lija: 16,
};

describe("filtrarPorCatalogo", () => {
  it("no toca nada si todas las familias tienen items", () => {
    const c = filtrarPorCatalogo(complementosDe(tipoCano, CATALOGO));
    expect(c).toHaveLength(tipoCano.complementos.length);
  });

  it("saca la familia que quedo sin items en el batch activo", () => {
    const c = filtrarPorCatalogo(
      complementosDe(tipoCano, { ...CATALOGO, neutralizante: 0 }),
    );
    const quimica = c.find((x) => x.nombre === "Química de terminación");
    expect(quimica?.familias.map((f) => f.codigo)).toEqual(["decapante", "pasivante"]);
  });

  it("hace desaparecer el complemento entero si ninguna familia tiene items", () => {
    const c = filtrarPorCatalogo(
      complementosDe(tipoCano, { ...CATALOGO, decapante: 0, pasivante: 0, neutralizante: 0 }),
    );
    expect(c.map((x) => x.nombre)).not.toContain("Química de terminación");
  });

  it("con el catalogo vacio no sugiere nada", () => {
    expect(filtrarPorCatalogo(complementosDe(tipoCano, {}))).toEqual([]);
  });
});

describe("motivoConAporte", () => {
  const aporte316 = reglas.aporte_por_grado["316"];

  it("antepone la justificacion del aporte al motivo del complemento", () => {
    const motivo = motivoConAporte("Para unir los tramos.", aporte316);
    expect(motivo).toBe(
      "Conserva el molibdeno y la resistencia al picado por cloruros. Para unir los tramos.",
    );
  });

  /**
   * La pantalla muestra el aporte como etiqueta ("Aporte 316L") al lado del complemento.
   * Si el motivo tambien lo nombra, el asesor lee el mismo dato dos veces seguidas.
   * El primer arreglo saco el prefijo de la composicion, pero los motivos del JSON
   * SEGUIAN nombrando el aporte, asi que la repeticion quedo entre la etiqueta y el
   * texto. Este test cubre lo que se ve en pantalla, etiqueta incluida.
   */
  it("el numero del aporte aparece una sola vez entre la etiqueta y el motivo", () => {
    for (const [grado, a] of Object.entries(reglas.aporte_por_grado)) {
      const enPantalla = `Aporte ${a.aporte} ${motivoConAporte("Para unir los tramos.", a)}`;
      const veces = enPantalla.split(a.aporte).length - 1;
      expect(veces, `el aporte de ${grado} aparece ${veces} veces en pantalla`).toBe(1);
    }
  });

  it("sin aporte definido deja el motivo como esta", () => {
    expect(motivoConAporte("Para unir los tramos.", null)).toBe("Para unir los tramos.");
  });
});

describe("aplicarAporte", () => {
  const complementos = complementosDe(tipoCano, CATALOGO);

  it("solo reescribe los complementos que dependen del grado", () => {
    const con = aplicarAporte(complementos, reglas.aporte_por_grado["304"]);
    const aporte = con.find((c) => c.nombre === "Consumible de aporte");
    const bridas = con.find((c) => c.nombre === "Bridas");

    expect(aporte?.motivo).toContain("compensa la dilución");
    expect(bridas?.motivo).toBe("Conexiones desmontables a equipos y válvulas.");
  });

  it("sin grado elegido ningun motivo cambia", () => {
    expect(aplicarAporte(complementos, null)).toEqual(complementos);
  });
});

describe("ordenarPorPrioridad", () => {
  it("primero los oblig, despues reco, despues opc", () => {
    const orden = ordenarPorPrioridad([
      { prioridad: "opc" as const, n: 1 },
      { prioridad: "oblig" as const, n: 2 },
      { prioridad: "reco" as const, n: 3 },
      { prioridad: "oblig" as const, n: 4 },
    ]);
    expect(orden.map((x) => x.prioridad)).toEqual(["oblig", "oblig", "reco", "opc"]);
  });

  it("es estable entre elementos de la misma prioridad", () => {
    const orden = ordenarPorPrioridad([
      { prioridad: "oblig" as const, n: 1 },
      { prioridad: "oblig" as const, n: 2 },
    ]);
    expect(orden.map((x) => x.n)).toEqual([1, 2]);
  });
});

describe("seleccionInicial", () => {
  it("premarca solo las familias de los complementos obligatorios", () => {
    const c = filtrarPorCatalogo(complementosDe(tipoCano, CATALOGO));
    const sel = seleccionInicial(c);

    const obligatorios = c.filter((x) => x.prioridad === "oblig");
    expect(sel).toHaveLength(obligatorios.flatMap((x) => x.familias).length);
    for (const comp of c.filter((x) => x.prioridad !== "oblig")) {
      for (const f of comp.familias) {
        expect(sel).not.toContain(claveSeleccion(comp.id, f.codigo));
      }
    }
  });

  it("no premarca una familia que el catalogo dejo afuera", () => {
    const c = filtrarPorCatalogo(complementosDe(tipoCano, { ...CATALOGO, varilla_tig: 0 }));
    expect(seleccionInicial(c).some((k) => k.endsWith(":varilla_tig"))).toBe(false);
  });
});

describe("prepararSugerencias", () => {
  it("filtra, aplica el aporte y ordena en una pasada", () => {
    const c = prepararSugerencias(
      complementosDe(tipoCano, { ...CATALOGO, lija: 0, flap: 0, disco_corte: 0 }),
      reglas.aporte_por_grado["316"],
    );

    expect(c.map((x) => x.prioridad)).toEqual(["oblig", "oblig", "oblig", "reco"]);
    expect(c.map((x) => x.nombre)).not.toContain("Abrasivos");
    expect(c.find((x) => x.dependeDelGrado)?.motivo).toContain("Conserva el molibdeno");
  });
});
