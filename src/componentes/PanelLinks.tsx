"use client";

import { useEffect, useRef, useState } from "react";
import { Boton } from "./Boton";
import {
  MAXIMO_PESTANAS_COMODO,
  configCompleta,
  listaParaCopiar,
  resolverLinks,
  type ConfigEcommerce,
  type LinkCategoria,
} from "@/logica/links";
import type { ItemCarrito } from "@/carrito/estado";
import { clienteNavegador } from "@/datos/supabase-navegador";
import { marcarLinksGenerados } from "@/datos/trazabilidad";

const ETIQUETA_RESOLUCION = {
  url_fija: "URL propia",
  busqueda_con_terminos: "búsqueda",
  busqueda_por_etiqueta: "búsqueda por nombre",
} as const;

/**
 * Panel de salida: los links al ecommerce para verificar precio y stock.
 *
 * `Abrir todos` NO puede esperar nada antes de llamar a window.open: si hay un await en
 * el medio, el navegador deja de considerarlo un click del usuario y bloquea las
 * pestañas. Por eso los links ya vienen resueltos cuando se muestra el boton.
 */
export function PanelLinks({
  items,
  config,
  links,
}: {
  items: readonly ItemCarrito[];
  config: ConfigEcommerce;
  links: Readonly<Record<string, LinkCategoria>>;
}) {
  const [copiado, setCopiado] = useState(false);
  const [abiertas, setAbiertas] = useState<number | null>(null);
  const [bloqueadas, setBloqueadas] = useState(0);

  const resueltos = resolverLinks(items, config, links);
  const conLink = resueltos.filter((r) => r.link !== null);
  const sinLink = resueltos.filter((r) => r.link === null);
  const demasiadas = conLink.length > MAXIMO_PESTANAS_COMODO;

  // Traza: que sugerencias llegaron a tener un link. Se marca una sola vez, cuando el
  // panel se muestra, que es el momento en que el link efectivamente se genero.
  const yaMarcadas = useRef(false);
  useEffect(() => {
    if (yaMarcadas.current) return;
    const ids = conLink.map((r) => r.item.trazaId).filter((id): id is string => id !== null);
    if (ids.length === 0) return;
    yaMarcadas.current = true;
    void marcarLinksGenerados(clienteNavegador(), ids);
  }, [conLink]);

  function abrirTodos() {
    let fallaron = 0;
    for (const r of conLink) {
      if (r.link === null) continue;
      // Sin `noopener` en las features: con esa opcion window.open devuelve null SIEMPRE,
      // por especificacion, y entonces no habria forma de distinguir una pestaña abierta
      // de una bloqueada. El opener se corta despues, que logra lo mismo.
      const pestana = window.open(r.link.url, "_blank");
      if (pestana === null) fallaron += 1;
      else pestana.opener = null;
    }
    setBloqueadas(fallaron);
    setAbiertas(conLink.length - fallaron);
  }

  async function copiar() {
    const texto = listaParaCopiar(resueltos);
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
    } catch {
      // Sin permiso de portapapeles queda el textarea de abajo para copiar a mano.
      setCopiado(false);
    }
  }

  return (
    <section className="space-y-4">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-texto-tenue">
        Links al ecommerce
      </h2>

      {!configCompleta(config) && (
        <p role="alert" className="rounded-md bg-aviso-50 p-3 text-sm text-aviso-900">
          Falta cargar la base del ecommerce y la plantilla de búsqueda. Hasta que Oficina
          Técnica las configure, solo se generan los links de las familias que tienen URL
          propia. La app no arma links a mano: uno roto en el mostrador es peor que ninguno.
        </p>
      )}

      {conLink.length > 0 && (
        <>
          <ul className="tarjeta divide-y divide-borde">
            {conLink.map((r) => (
              <li key={r.item.clave} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 p-4">
                <span className="font-semibold">{r.item.etiqueta}</span>
                <span className="text-xs text-texto-tenue">
                  {r.link !== null && ETIQUETA_RESOLUCION[r.link.resolucion]}
                </span>
                <a
                  href={r.link?.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full truncate text-sm text-texto-suave underline sm:w-auto"
                >
                  {r.link?.url}
                </a>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-center gap-3">
            <Boton onClick={abrirTodos}>
              Abrir todos ({conLink.length} {conLink.length === 1 ? "pestaña" : "pestañas"})
            </Boton>
            <Boton variante="secundario" onClick={() => void copiar()}>
              Copiar lista
            </Boton>
            {copiado && (
              <span role="status" className="text-sm text-texto-suave">
                Lista copiada.
              </span>
            )}
          </div>

          {demasiadas && (
            <p className="text-sm text-texto-suave">
              Son {conLink.length} pestañas. Conviene copiar la lista y abrirlas de a poco.
            </p>
          )}

          {/*
            La deteccion de bloqueo no es del todo confiable: algunos navegadores devuelven
            un objeto igual para una pestaña que no abrieron. Por eso, despues de abrir, el
            aviso aparece siempre, y el numero solo cuando se pudo contar.
          */}
          {abiertas !== null && (
            <p
              role="alert"
              className={`rounded-md p-3 text-sm ${
                bloqueadas > 0 ? "bg-aviso-50 text-aviso-900" : "bg-fondo text-texto"
              }`}
            >
              {bloqueadas > 0
                ? `El navegador bloqueó ${bloqueadas} de las ${conLink.length} pestañas. `
                : `Se abrieron ${abiertas} ${abiertas === 1 ? "pestaña" : "pestañas"}. `}
              Si falta alguna, el navegador la bloqueó sin avisar: habilitá las ventanas
              emergentes para este sitio, o abrí los links de arriba de a uno.
            </p>
          )}

          <details className="text-sm">
            <summary className="cursor-pointer text-texto-suave">
              Ver la lista para copiar a mano
            </summary>
            <textarea
              readOnly
              rows={Math.min(conLink.length + 1, 12)}
              value={listaParaCopiar(resueltos)}
              className="mt-2 w-full rounded-md border border-borde-fuerte p-2 font-mono text-xs"
            />
          </details>
        </>
      )}

      {sinLink.length > 0 && (
        <div className="rounded-md bg-fondo p-3 text-sm text-texto">
          <p className="font-medium">Sin link ({sinLink.length}):</p>
          <p className="mt-1">{sinLink.map((r) => r.item.etiqueta).join(", ")}.</p>
          <p className="mt-1 text-texto-suave">
            Estas familias hay que buscarlas a mano en el ecommerce hasta que se configure la
            resolución.
          </p>
        </div>
      )}
    </section>
  );
}
