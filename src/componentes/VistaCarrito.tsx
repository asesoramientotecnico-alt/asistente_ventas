"use client";

import { useState } from "react";
import Link from "next/link";
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

  if (!listo) return <p className="text-slate-600">Cargando…</p>;

  if (items.length === 0) {
    return (
      <p className="text-slate-600">
        El carrito está vacío.{" "}
        <Link href="/producto" className="underline">
          Empezá por un producto
        </Link>
        .
      </p>
    );
  }

  const ordenados = [...items].sort(
    (a, b) =>
      ORDEN_PRIORIDAD[a.prioridad] - ORDEN_PRIORIDAD[b.prioridad] ||
      a.etiqueta.localeCompare(b.etiqueta, "es-AR"),
  );

  return (
    <div className="space-y-6">
      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
        {ordenados.map((i) => (
          <li key={i.clave} className="flex items-start gap-3 p-4">
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{i.etiqueta}</span>
                <EtiquetaPrioridad prioridad={i.prioridad} />
              </div>
              <p className="mt-1 text-sm text-slate-600">{i.motivo}</p>
              <p className="mt-1 text-xs text-slate-500">
                Desde {i.origen.nombreTipo}
                {i.origen.grado !== null && ` · grado ${i.origen.grado}`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                quitar(i.clave);
                setConfirmado(false);
              }}
              className="text-sm text-slate-500 hover:text-slate-900 hover:underline"
            >
              Quitar
            </button>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-4">
        {!confirmado && (
          <button
            type="button"
            onClick={() => setConfirmado(true)}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white"
          >
            Generar los links ({items.length})
          </button>
        )}
        <Link href="/producto" className="text-sm text-slate-600 hover:underline">
          Seguir agregando
        </Link>
        <button
          type="button"
          onClick={() => {
            vaciar();
            setConfirmado(false);
          }}
          className="text-sm text-slate-600 hover:underline"
        >
          Vaciar el carrito
        </button>
      </div>

      {confirmado && <PanelLinks items={ordenados} config={config} links={links} />}
    </div>
  );
}
