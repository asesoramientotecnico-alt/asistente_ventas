import { describe, expect, it } from "vitest";
import {
  MAXIMO_PESTANAS_COMODO,
  configCompleta,
  listaParaCopiar,
  resolverLink,
  resolverLinks,
  type ConfigEcommerce,
} from "./links.ts";

/**
 * La configuracion de ejemplo no es la real: todavia no sabemos como esta armado
 * famiq.com.ar. Justamente por eso el resolvedor recibe base y plantilla como datos.
 */
const CONFIG: ConfigEcommerce = {
  baseUrl: "https://www.ejemplo.com.ar",
  plantillaBusqueda: "{base}/buscar?q={q}",
};

describe("configCompleta", () => {
  it("exige base y una plantilla con el marcador de consulta", () => {
    expect(configCompleta(CONFIG)).toBe(true);
    expect(configCompleta(null)).toBe(false);
    expect(configCompleta({ baseUrl: "", plantillaBusqueda: "{base}/buscar?q={q}" })).toBe(false);
    expect(configCompleta({ baseUrl: "   ", plantillaBusqueda: "{base}/buscar?q={q}" })).toBe(false);
    expect(configCompleta({ baseUrl: CONFIG.baseUrl, plantillaBusqueda: "{base}/buscar" })).toBe(false);
  });
});

describe("resolverLink", () => {
  it("la url propia de la familia gana", () => {
    const r = resolverLink(CONFIG, { urlFija: "https://x.com/canos", terminosBusqueda: "caños" }, "Caños");
    expect(r).toEqual({ url: "https://x.com/canos", resolucion: "url_fija" });
  });

  it("la url propia sirve incluso sin configuracion cargada", () => {
    const r = resolverLink(null, { urlFija: "https://x.com/canos", terminosBusqueda: null }, "Caños");
    expect(r?.resolucion).toBe("url_fija");
  });

  it("sin url propia usa la plantilla con los terminos de busqueda", () => {
    const r = resolverLink(CONFIG, { urlFija: null, terminosBusqueda: "varilla tig inox" }, "Varilla TIG");
    expect(r).toEqual({
      url: "https://www.ejemplo.com.ar/buscar?q=varilla%20tig%20inox",
      resolucion: "busqueda_con_terminos",
    });
  });

  it("sin terminos cae en la etiqueta de la familia", () => {
    const r = resolverLink(CONFIG, { urlFija: null, terminosBusqueda: null }, "Caños / tubos");
    expect(r).toEqual({
      url: "https://www.ejemplo.com.ar/buscar?q=Ca%C3%B1os%20%2F%20tubos",
      resolucion: "busqueda_por_etiqueta",
    });
  });

  it("sin fila de link tambien resuelve por etiqueta", () => {
    expect(resolverLink(CONFIG, null, "Bridas")?.resolucion).toBe("busqueda_por_etiqueta");
  });

  it("no genera nada si falta la configuracion: un link roto es peor que ninguno", () => {
    expect(resolverLink(null, { urlFija: null, terminosBusqueda: "bridas" }, "Bridas")).toBeNull();
    expect(
      resolverLink({ baseUrl: "", plantillaBusqueda: "{base}/buscar?q={q}" }, null, "Bridas"),
    ).toBeNull();
  });

  it("no genera nada si no hay con que armar la consulta", () => {
    expect(resolverLink(CONFIG, { urlFija: "  ", terminosBusqueda: "  " }, "   ")).toBeNull();
  });

  it("saca la barra final de la base para no duplicarla", () => {
    const r = resolverLink(
      { baseUrl: "https://www.ejemplo.com.ar///", plantillaBusqueda: "{base}/buscar?q={q}" },
      null,
      "Bridas",
    );
    expect(r?.url).toBe("https://www.ejemplo.com.ar/buscar?q=Bridas");
  });

  it("acepta una plantilla que no use el marcador de base", () => {
    const r = resolverLink(
      { baseUrl: "https://www.ejemplo.com.ar", plantillaBusqueda: "https://otro.com/s?t={q}" },
      null,
      "Bridas",
    );
    expect(r?.url).toBe("https://otro.com/s?t=Bridas");
  });

  it("escapa la consulta", () => {
    const r = resolverLink(CONFIG, { urlFija: null, terminosBusqueda: 'caño 2" 316L & niple' }, "x");
    expect(r?.url).toContain("q=ca%C3%B1o%202%22%20316L%20%26%20niple");
    expect(r?.url).not.toContain("&niple");
  });
});

describe("resolverLinks", () => {
  const items = [
    { categoria: "cano", etiqueta: "Caños / tubos" },
    { categoria: "varilla_tig", etiqueta: "Varilla TIG" },
    { categoria: "brida", etiqueta: "Bridas" },
  ];
  const links = {
    cano: { urlFija: "https://x.com/canos", terminosBusqueda: null },
    varilla_tig: { urlFija: null, terminosBusqueda: "varilla tig inox" },
  };

  it("resuelve cada familia por su mejor via disponible", () => {
    const r = resolverLinks(items, CONFIG, links);
    expect(r.map((x) => x.link?.resolucion)).toEqual([
      "url_fija",
      "busqueda_con_terminos",
      "busqueda_por_etiqueta",
    ]);
  });

  it("sin configuracion solo sobreviven las que tienen url propia", () => {
    const r = resolverLinks(items, null, links);
    expect(r.filter((x) => x.link !== null)).toHaveLength(1);
  });
});

describe("listaParaCopiar", () => {
  it("una familia por linea, salteando las que no resolvieron", () => {
    const r = resolverLinks(
      [
        { categoria: "cano", etiqueta: "Caños / tubos" },
        { categoria: "brida", etiqueta: "Bridas" },
      ],
      null,
      { cano: { urlFija: "https://x.com/canos", terminosBusqueda: null } },
    );
    expect(listaParaCopiar(r)).toBe("Caños / tubos — https://x.com/canos");
  });
});

describe("MAXIMO_PESTANAS_COMODO", () => {
  it("es el umbral del blueprint para sugerir copiar la lista", () => {
    expect(MAXIMO_PESTANAS_COMODO).toBe(6);
  });
});
