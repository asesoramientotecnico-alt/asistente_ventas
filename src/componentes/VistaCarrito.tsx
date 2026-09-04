"use client";

import { useState } from "react";
import Link from "next/link";
import { Boton } from "./Boton";
import { EtiquetaPrioridad } from "./EtiquetaPrioridad";
import { PanelLinks } from "./PanelLinks";
import { useCarrito } from "@/carrito/estado";
import { ORDEN_PRIORIDAD } from "@/logica/sugerencias";
import type { ConfigEcommerce, LinkCategoria } from "@/logica/links";

/**
 * Checklist de lo acumulado, agrupado por prioridad. Al confirmar aparece el panel de
 * links.
 *
 * La resolucion de links se hace aca y no en el servidor porque el carrito vive en el
 * navegador: el servidor no sabe que junto el asesor. La config y las URLs propias de las
 * 69 familias vienen del servidor de una sola vez.
 */
export function VistaCarrito({
  config,
  links,
}: {
  config: ConfigEcommerce;
  links: Readonly<Record<string, LinkCategoria>>;
}) {
  const { items, listo, quitar, vaciar } = useCarrito();
  const [confirmado, setConfirmado] = useState(false);

  if (!listo) return <p className="text-texto-suave">Cargando…</p>;

  if (items.length === 0) {
    return (
      <p className="text-texto-suave">
        El carrito está vacío.{" "}
        <Link href="/producto" className="underline">
          Empezá por un producto
        </Link>
        .
      </p>
    );
  }

  // Con todo viniendo del mismo producto, repetir el origen en cada fila es ruido: se
  // muestra una vez arriba. Con varios origenes si hace falta fila por fila.
  const origenes = [...new Set(items.map((i) => `${i.origen.nombreTipo}|${i.origen.grado ?? ""}`))];
  const unSoloOrigen = origenes.length === 1;

  const ordenados = [...items].sort(
    (a, b) =>
      ORDEN_PRIORIDAD[a.prioridad] - ORDEN_PRIORIDAD[b.prioridad] ||
      a.etiqueta.localeCompare(b.etiqueta, "es-AR"),
  );

  return (
    <div className="space-y-6">
      {unSoloOrigen && (
        <p className="text-sm text-texto-suave">
          Todo desde <strong className="font-semibold text-texto">{items[0]?.origen.nombreTipo}</strong>
          {items[0]?.origen.grado !== null && ` · grado ${items[0]?.origen.grado}`}
        </p>
      )}

      <ul className="tarjeta divide-y divide-borde">
        {ordenados.map((i) => (
          <li key={i.clave} className="flex items-start gap-4 p-5">
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{i.etiqueta}</span>
                <EtiquetaPrioridad prioridad={i.prioridad} />
              </div>
              <p className="mt-1.5 text-texto-suave">{i.motivo}</p>
              {!unSoloOrigen && (
                <p className="mt-1.5 text-xs text-texto-tenue">
                  Desde {i.origen.nombreTipo}
                  {i.origen.grado !== null && ` · grado ${i.origen.grado}`}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                quitar(i.clave);
                setConfirmado(false);
              }}
              className="text-sm text-texto-tenue hover:text-texto hover:underline"
            >
              Quitar
            </button>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-4">
        {!confirmado && (
          <Boton onClick={() => setConfirmado(true)}>Generar los links ({items.length})</Boton>
        )}
        <Link href="/producto" className="text-sm text-texto-suave hover:underline">
          Seguir agregando
        </Link>
        <Boton
          variante="texto"
          className="text-sm"
          onClick={() => {
            vaciar();
            setConfirmado(false);
          }}
        >
          Vaciar el carrito
        </Boton>
      </div>

      {confirmado && <PanelLinks items={ordenados} config={config} links={links} />}
    </div>
  );
}
