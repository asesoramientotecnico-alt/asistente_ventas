"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { Prioridad } from "@/tipos/dominio";

/**
 * Carrito del asesor: lo que va acumulando mientras recorre productos.
 *
 * Vive en sessionStorage y no en la base. Es una lista de trabajo de una atencion en el
 * mostrador, no un pedido: se arma, se convierte en links y se descarta. Lo que si se
 * persiste es la traza de que se sugirio y que acepto el asesor (bloque 9).
 *
 * sessionStorage y no localStorage: si el asesor cierra la pestaña, la atencion termino.
 * No conviene que el carrito del cliente anterior aparezca con el siguiente.
 *
 * Se lee con useSyncExternalStore porque es justo eso: un store fuera de React, con
 * varios componentes suscritos (la lista y el contador del encabezado).
 */

const CLAVE = "asistente-ventas.carrito";
const EVENTO = "asistente-ventas:carrito";

export interface ItemCarrito {
  /** `complementoId:categoriaCodigo`. Ver claveSeleccion en logica/sugerencias. */
  readonly clave: string;
  readonly categoria: string;
  readonly etiqueta: string;
  readonly prioridad: Prioridad;
  readonly motivo: string;
  /** De donde salio, para que el asesor sepa por que lo tiene en la lista. */
  readonly origen: {
    readonly tipo: string;
    readonly nombreTipo: string;
    readonly grado: string | null;
  };
  readonly complementoId: string | null;
  /** Fila de `sesion_sugerencia` que registro esta sugerencia. Null si el registro fallo. */
  readonly trazaId: string | null;
}

const VACIO: ItemCarrito[] = [];

function parsear(crudo: string | null): ItemCarrito[] {
  if (crudo === null) return VACIO;
  try {
    const datos: unknown = JSON.parse(crudo);
    return Array.isArray(datos) ? (datos as ItemCarrito[]) : VACIO;
  } catch {
    return VACIO;
  }
}

function crudo(): string | null {
  try {
    return window.sessionStorage.getItem(CLAVE);
  } catch {
    // sessionStorage puede fallar (modo privado, cuotas). Un carrito vacio es un arranque
    // valido; no hay que romper la pantalla por esto.
    return null;
  }
}

// useSyncExternalStore exige que getSnapshot devuelva la MISMA referencia mientras el
// store no cambie, o React vuelve a renderizar sin parar. Se cachea contra el crudo.
let ultimoCrudo: string | null = null;
let ultimoValor: ItemCarrito[] = VACIO;

function instantanea(): ItemCarrito[] {
  const actual = crudo();
  if (actual !== ultimoCrudo) {
    ultimoCrudo = actual;
    ultimoValor = parsear(actual);
  }
  return ultimoValor;
}

function suscribir(alCambiar: () => void): () => void {
  window.addEventListener(EVENTO, alCambiar);
  // Otra pestaña del mismo asesor.
  window.addEventListener("storage", alCambiar);
  return () => {
    window.removeEventListener(EVENTO, alCambiar);
    window.removeEventListener("storage", alCambiar);
  };
}

function leer(): ItemCarrito[] {
  return parsear(crudo());
}

function escribir(items: readonly ItemCarrito[]): void {
  try {
    window.sessionStorage.setItem(CLAVE, JSON.stringify(items));
  } catch {
    // Idem: si no se puede persistir, no se pierde nada mas que la persistencia.
  }
  window.dispatchEvent(new Event(EVENTO));
}

export function useCarrito() {
  const items = useSyncExternalStore(suscribir, instantanea, () => VACIO);
  // En el servidor todavia no se sabe que hay guardado. Sirve para no pintar un carrito
  // vacio que un instante despues cambia.
  const listo = useSyncExternalStore(
    suscribir,
    () => true,
    () => false,
  );

  const agregar = useCallback((nuevos: readonly ItemCarrito[]) => {
    const porClave = new Map(leer().map((i) => [i.clave, i]));
    for (const item of nuevos) porClave.set(item.clave, item);
    escribir([...porClave.values()]);
  }, []);

  const quitar = useCallback((clave: string) => {
    escribir(leer().filter((i) => i.clave !== clave));
  }, []);

  const vaciar = useCallback(() => {
    escribir(VACIO);
  }, []);

  return { items, listo, agregar, quitar, vaciar };
}
