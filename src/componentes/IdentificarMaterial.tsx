"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { clienteNavegador } from "@/datos/supabase-navegador";
import { buscarItems, type ItemEncontrado } from "@/datos/facetas";
import {
  ETIQUETA_EJE,
  chipsDeSeleccion,
  clasificarEjes,
  proximoPaso,
  type Eje,
  type Faceta,
  type Seleccion,
} from "@/logica/facetas";

const numero = (n: number) => n.toLocaleString("es-AR");

/**
 * Identificacion del material: buscador arriba, pasos abajo, sobre el mismo estado.
 *
 * Los dos caminos llevan al mismo lugar. El buscador es para el que ya sabe lo que
 * quiere y lo escribe; los pasos son para el que explora o para cuando el cliente
 * describe en vez de nombrar. Elegir un resultado del buscador completa los pasos, y
 * completar los pasos filtra lo que el buscador ofreceria.
 *
 * Todo el estado viaja en la URL: la pantalla queda compartible y el servidor vuelve a
 * filtrar las sugerencias con lo elegido.
 */
export function IdentificarMaterial({
  categoria,
  facetas,
  seleccion,
  totalItems,
}: {
  categoria: string;
  facetas: readonly Faceta[];
  seleccion: Seleccion;
  totalItems: number;
}) {
  const router = useRouter();
  const ruta = usePathname();
  const [navegando, navegar] = useTransition();

  const ejes = useMemo(() => clasificarEjes(facetas), [facetas]);
  const paso = useMemo(() => proximoPaso(ejes, seleccion), [ejes, seleccion]);
  const chips = useMemo(() => chipsDeSeleccion(seleccion), [seleccion]);
  const [verRefinamientos, setVerRefinamientos] = useState(false);

  function irA(cambios: Partial<Record<Eje, string | null>>) {
    const p = new URLSearchParams();
    const actual: Record<string, string | null | undefined> = { ...seleccion, ...cambios };
    for (const [k, v] of Object.entries(actual)) {
      if (v !== null && v !== undefined && v !== "") p.set(k, v);
    }
    const qs = p.toString();
    navegar(() => router.replace(qs === "" ? ruta : `${ruta}?${qs}`, { scroll: false }));
  }

  return (
    <section className="space-y-4">
      <Buscador categoria={categoria} alElegir={irA} />

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-widest text-texto-tenue">
            Material
          </span>
          {chips.map((c) => (
            <button
              key={c.eje}
              type="button"
              onClick={() => irA({ [c.eje]: null })}
              disabled={navegando}
              title={`Quitar ${ETIQUETA_EJE[c.eje].toLowerCase()}`}
              className="inline-flex items-center gap-1.5 rounded-full bg-acento-50 py-1 pl-3 pr-2 text-sm font-medium text-acento-900 hover:bg-acento-100"
            >
              {c.valor}
              <span aria-hidden="true" className="text-acento-700">
                ×
              </span>
            </button>
          ))}
          <span className="text-sm text-texto-tenue tabular">{numero(totalItems)} ítems</span>
        </div>
      )}

      {paso !== null ? (
        <PasoFaceta faceta={paso} alElegir={irA} deshabilitado={navegando} />
      ) : (
        chips.length > 0 && (
          <p className="text-sm text-texto-suave">
            Ya no queda nada más que preguntar para esta familia. Abajo están las sugerencias.
          </p>
        )
      )}

      {ejes.refinamientos.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setVerRefinamientos((v) => !v)}
            className="text-sm font-medium text-acento-700 hover:underline"
          >
            {verRefinamientos ? "Menos filtros" : `Más filtros (${ejes.refinamientos.length})`}
          </button>
          {verRefinamientos && (
            <div className="mt-3 space-y-3">
              {/* Estos ejes están vacíos en la mayoría de los ítems. Elegir uno acota
                  fuerte, y por eso no se preguntan como paso: esconderían el resto. */}
              <p className="text-sm text-texto-suave">
                El catálogo declara esto solo en parte de los ítems. Si filtrás por acá, los
                que no lo declaran quedan afuera.
              </p>
              {ejes.refinamientos.map((f) => (
                <PasoFaceta key={f.eje} faceta={f} alElegir={irA} deshabilitado={navegando} chico />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function PasoFaceta({
  faceta,
  alElegir,
  deshabilitado,
  chico = false,
}: {
  faceta: Faceta;
  alElegir: (c: Partial<Record<Eje, string | null>>) => void;
  deshabilitado: boolean;
  chico?: boolean;
}) {
  const [verTodas, setVerTodas] = useState(false);
  // Las opciones vienen ordenadas por venta real, así que las primeras son las que más
  // se piden. Mostrar 8 alcanza para el 90 % de los casos sin llenar la pantalla.
  const visibles = verTodas ? faceta.opciones : faceta.opciones.slice(0, 8);

  return (
    <div>
      <h3
        className={
          chico
            ? "text-xs font-semibold uppercase tracking-widest text-texto-tenue"
            : "text-sm font-medium"
        }
      >
        {ETIQUETA_EJE[faceta.eje]}
      </h3>
      <div className="mt-2 flex flex-wrap gap-2">
        {visibles.map((o) => (
          <button
            key={o.valor}
            type="button"
            disabled={deshabilitado}
            onClick={() => alElegir({ [faceta.eje]: o.valor })}
            className="inline-flex items-center gap-2 rounded-md border border-borde-fuerte bg-superficie px-3 py-2 text-left text-sm hover:border-acento-600 disabled:opacity-50"
          >
            <span className="font-medium">{o.valor}</span>
            <span className="text-texto-tenue tabular">{numero(o.items)}</span>
          </button>
        ))}
        {faceta.opciones.length > visibles.length && (
          <button
            type="button"
            onClick={() => setVerTodas(true)}
            className="px-2 py-2 text-sm font-medium text-acento-700 hover:underline"
          >
            +{faceta.opciones.length - visibles.length} más
          </button>
        )}
      </div>
    </div>
  );
}

function Buscador({
  categoria,
  alElegir,
}: {
  categoria: string;
  alElegir: (c: Partial<Record<Eje, string | null>>) => void;
}) {
  const [texto, setTexto] = useState("");
  const [resultados, setResultados] = useState<ItemEncontrado[]>([]);
  const [buscando, setBuscando] = useState(false);
  const pedido = useRef(0);

  useEffect(() => {
    const t = texto.trim();
    // Con menos de dos letras no se busca. No hace falta limpiar los resultados viejos:
    // el desplegable ya no se dibuja por debajo de ese largo.
    if (t.length < 2) return;
    // Espera a que deje de tipear: en mostrador se escribe rápido y no tiene sentido
    // consultar por cada tecla.
    const id = setTimeout(() => {
      const mio = ++pedido.current;
      setBuscando(true);
      void buscarItems(clienteNavegador(), t, 8)
        .then((r) => {
          // Descarta la respuesta si ya salió una búsqueda posterior.
          if (mio === pedido.current) setResultados(r);
        })
        .catch(() => {
          if (mio === pedido.current) setResultados([]);
        })
        .finally(() => {
          if (mio === pedido.current) setBuscando(false);
        });
    }, 250);
    return () => clearTimeout(id);
  }, [texto]);

  return (
    <div className="relative">
      <label htmlFor="buscar" className="block text-sm font-medium">
        Buscar en el catálogo
      </label>
      <input
        id="buscar"
        type="search"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="curva 2 316"
        autoComplete="off"
        className="mt-1.5 w-full rounded-md border border-borde-fuerte bg-superficie px-3 py-2.5 text-base"
      />
      <p className="mt-1 text-sm text-texto-tenue">
        Escribí como te lo pide el cliente. Elegir un ítem completa los pasos de abajo.
      </p>

      {texto.trim().length >= 2 && (
        <ul className="mt-2 divide-y divide-borde overflow-hidden rounded-md border border-borde">
          {resultados.length === 0 && !buscando && (
            <li className="px-3 py-2.5 text-sm text-texto-suave">
              Nada con esas palabras. Probá con menos.
            </li>
          )}
          {resultados.map((r) => (
            <li key={r.materialId}>
              <button
                type="button"
                onClick={() => {
                  alElegir({
                    tipo: r.tipo ?? null,
                    medida: r.medidas[0] ?? null,
                    grado: r.grado ?? null,
                  });
                  setTexto("");
                }}
                className="flex w-full items-baseline gap-3 px-3 py-2.5 text-left hover:bg-fondo"
              >
                <span className="shrink-0 text-xs tabular text-texto-tenue">{r.materialId}</span>
                <span className="min-w-0 flex-1 truncate text-sm">{r.descripcion}</span>
                {r.categoria !== categoria && (
                  <span className="shrink-0 rounded bg-aviso-50 px-1.5 py-0.5 text-xs text-aviso-900">
                    {r.etiqueta}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
