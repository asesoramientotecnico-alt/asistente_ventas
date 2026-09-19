import { describe, expect, it } from "vitest";
import { itemTieneMedida, medidasDeItem, ordenarMedidas, valorNumerico } from "./medida.ts";

/**
 * Todos los valores de estos tests son literales de la columna `Diametrodinpulgadas` del
 * dossier, con la frecuencia con que aparecen sobre las 16.973 filas. No hay casos
 * inventados: las seis formas que se prueban son las seis que trae el archivo.
 */

describe("valorNumerico", () => {
  it("resuelve enteros y fracciones", () => {
    expect(valorNumerico('2"')).toBe(2);
    expect(valorNumerico('1 1/2"')).toBe(1.5);
    expect(valorNumerico('3/4"')).toBe(0.75);
    expect(valorNumerico('1/8"')).toBe(0.125);
    expect(valorNumerico('2 1/2"')).toBe(2.5);
  });

  it("devuelve null para lo que no es una medida", () => {
    expect(valorNumerico("DIC 100")).toBeNull();
    expect(valorNumerico("'-")).toBeNull();
    expect(valorNumerico("")).toBeNull();
  });
});

describe("medidasDeItem", () => {
  it("normaliza la forma limpia, que son 5.977 de las filas con valor", () => {
    expect(medidasDeItem('2"')).toEqual(['2"']);
    expect(medidasDeItem('1 1/2"')).toEqual(['1 1/2"']);
    expect(medidasDeItem('3/4"')).toEqual(['3/4"']);
  });

  it("unifica las dos formas de comilla rota del archivo", () => {
    // 152 filas traen `4''` y 186 traen `3/4""`. Las dos son una sola comilla.
    expect(medidasDeItem("4''")).toEqual(['4"']);
    expect(medidasDeItem('3/4""')).toEqual(['3/4"']);
    expect(medidasDeItem('1 1/2""')).toEqual(['1 1/2"']);
  });

  it("devuelve las DOS medidas de una reduccion", () => {
    // 959 filas. Una reduccion sirve a las dos lineas: esconderla de una de las dos
    // busquedas es el error que el asesor no perdona.
    expect(medidasDeItem('2" X 1 1/2"')).toEqual(['2"', '1 1/2"']);
    expect(medidasDeItem('3/4" X 1"')).toEqual(['3/4"', '1"']);
    expect(medidasDeItem('3" X 2 1/2"')).toEqual(['3"', '2 1/2"']);
  });

  it("toma la pulgada cuando el DN trae su equivalente", () => {
    // 131 filas.
    expect(medidasDeItem('DN100 - 4"')).toEqual(['4"']);
    expect(medidasDeItem('DN65 - 2 1/2"')).toEqual(['2 1/2"']);
    expect(medidasDeItem('DN10 - 1/2"')).toEqual(['1/2"']);
  });

  it("resuelve el DN suelto por la correspondencia nominal", () => {
    // 76 filas. DN50 son 2": es un numero de referencia, no una medida en mm.
    expect(medidasDeItem("DN50")).toEqual(['2"']);
    expect(medidasDeItem("DN32")).toEqual(['1 1/4"']);
    expect(medidasDeItem("DN100")).toEqual(['4"']);
  });

  it("no inventa una medida donde el dato no la tiene", () => {
    // `A` es un rango, no dos medidas concretas: un item que sirve de 1/2 a 3/4 no es un
    // item de 1/2 ni uno de 3/4.
    expect(medidasDeItem('1/2" A 3/4"')).toEqual([]);
    expect(medidasDeItem('1 1/2" A 2"')).toEqual([]);
    expect(medidasDeItem("DIC 100")).toEqual([]);
    expect(medidasDeItem("'-")).toEqual([]);
    expect(medidasDeItem("PH68")).toEqual([]);
    expect(medidasDeItem("")).toEqual([]);
    expect(medidasDeItem(null)).toEqual([]);
  });

  it("no repite la medida cuando la reduccion trae dos iguales", () => {
    expect(medidasDeItem('2" X 2"')).toEqual(['2"']);
  });

  it("descarta la fraccion impropia, que siempre es un espacio faltante", () => {
    // 4 filas del catalogo traen `11/4"` y `11/2"`: la descripcion del item ("KIT
    // TUERCA+VIROLAS 11/4\"OD") deja claro que son 1 1/4" y 1 1/2", no 2,75" y 5,5".
    // Aceptarlas crearia una medida que nadie va a buscar.
    expect(medidasDeItem('11/4"')).toEqual([]);
    expect(medidasDeItem('11/2"')).toEqual([]);
    // La fraccion propia sigue funcionando, incluida la parte fraccionaria de un mixto.
    expect(medidasDeItem('3/4"')).toEqual(['3/4"']);
    expect(medidasDeItem('1 3/4"')).toEqual(['1 3/4"']);
  });
});

describe("itemTieneMedida", () => {
  it("una reduccion matchea sus dos medidas", () => {
    const reduccion = medidasDeItem('2" X 1 1/2"');
    expect(itemTieneMedida(reduccion, '2"')).toBe(true);
    expect(itemTieneMedida(reduccion, '1 1/2"')).toBe(true);
    expect(itemTieneMedida(reduccion, '3"')).toBe(false);
  });
});

describe("ordenarMedidas", () => {
  it("ordena por tamaño real, no alfabeticamente", () => {
    // Alfabeticamente "10\"" iria antes que "2\"", que en mostrador no tiene sentido.
    expect(ordenarMedidas(['2"', '1/2"', '10"', '1 1/2"', '1/8"'])).toEqual([
      '1/8"',
      '1/2"',
      '1 1/2"',
      '2"',
      '10"',
    ]);
  });
});
