import { notFound } from "next/navigation";
import { IdentificarMaterial } from "@/componentes/IdentificarMaterial";
import { ListaComplementos } from "@/componentes/ListaComplementos";
import { MigasDePan } from "@/componentes/MigasDePan";
import { aporteParaGrado, tipoConComplementos } from "@/datos/taxonomia";
import { contarItems, facetasDeCategoria, itemsDeCategoria } from "@/datos/facetas";
import { clienteServidor } from "@/datos/supabase-servidor";
import { filtrosSegunCriterio, type ItemsDeFamilia } from "@/datos/items";
import type { Seleccion } from "@/logica/facetas";
import { claveSeleccion, prepararSugerencias } from "@/logica/sugerencias";

/** Un parametro vacio es "sin elegir", no un filtro por string vacio. */
const opcional = (v: string | undefined): string | null =>
  v === undefined || v.trim() === "" ? null : v;

export default async function Complementos({
  params,
  searchParams,
}: {
  params: Promise<{ dominio: string; tipo: string }>;
  searchParams: Promise<{
    tipo?: string;
    medida?: string;
    grado?: string;
    terminacion?: string;
    norma?: string;
  }>;
}) {
  const { dominio, tipo: codigoTipo } = await params;
  const q = await searchParams;

  const seleccion: Seleccion = {
    tipo: opcional(q.tipo),
    medida: opcional(q.medida),
    grado: opcional(q.grado),
    terminacion: opcional(q.terminacion),
    norma: opcional(q.norma),
  };

  const supabase = await clienteServidor();
  const tipo = await tipoConComplementos(supabase, codigoTipo);
  if (tipo === null || tipo.dominio.codigo !== dominio) notFound();

  const [facetas, totalItems, itemsDisparador, aporte] = await Promise.all([
    facetasDeCategoria(supabase, tipo.codigo, seleccion),
    contarItems(supabase, tipo.codigo, seleccion),
    itemsDeCategoria(supabase, tipo.codigo, seleccion, 6),
    aporteParaGrado(supabase, seleccion.grado ?? null),
  ]);

  const complementos = prepararSugerencias(tipo.complementos, aporte);
  const sinCatalogo = tipo.complementos.length > 0 && complementos.length === 0;

  /**
   * Los ítems de cada familia complementaria, filtrados por el criterio de ESE par.
   *
   * Se resuelve en el servidor: el navegador no consulta el catálogo familia por familia
   * mientras el asesor tiene al cliente enfrente.
   */
  const itemsPorFamilia: Record<string, ItemsDeFamilia> = {};
  await Promise.all(
    complementos.flatMap((c) =>
      c.familias.map(async (f) => {
        const filtros = filtrosSegunCriterio(
          f.criterio,
          seleccion.medida ?? null,
          seleccion.grado ?? null,
          aporte?.aporte ?? null,
        );
        const conFiltro: Seleccion = { medida: filtros.medida, grado: filtros.grado };
        const [total, items] = await Promise.all([
          contarItems(supabase, f.codigo, conFiltro),
          itemsDeCategoria(supabase, f.codigo, conFiltro, 6),
        ]);

        // Filtrar de más deja al asesor sin nada: si la medida no matchea, se muestra la
        // familia entera avisando, nunca una lista vacía.
        if (total === 0 && (conFiltro.medida !== null || conFiltro.grado !== null)) {
          const [totalSinFiltro, itemsSinFiltro] = await Promise.all([
            contarItems(supabase, f.codigo, {}),
            itemsDeCategoria(supabase, f.codigo, {}, 6),
          ]);
          itemsPorFamilia[claveSeleccion(c.id, f.codigo)] = {
            items: itemsSinFiltro,
            total: totalSinFiltro,
            sinCoincidencia: true,
          };
          return;
        }

        itemsPorFamilia[claveSeleccion(c.id, f.codigo)] = {
          items,
          total,
          sinCoincidencia: false,
        };
      }),
    ),
  );

  return (
    <main className="mx-auto max-w-4xl px-5 py-8">
      <MigasDePan
        pasos={[
          { texto: "Inicio", href: "/" },
          { texto: "Línea", href: "/producto" },
          { texto: tipo.dominio.nombre, href: `/producto/${dominio}` },
          { texto: tipo.nombre },
        ]}
      />
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">{tipo.nombre}</h1>
      <p className="mt-1 mb-6 text-texto-suave">
        Identificá lo que pide el cliente y abajo aparece lo que suele ir junto.
      </p>

      <div className="tarjeta mb-6 p-5">
        <IdentificarMaterial
          categoria={tipo.codigo}
          facetas={facetas}
          seleccion={seleccion}
          totalItems={totalItems}
        />

        {itemsDisparador.length > 0 && (
          <div className="mt-5 border-t border-borde pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-texto-tenue">
              Lo que hay en catálogo
            </h3>
            <ul className="mt-2 space-y-0.5">
              {itemsDisparador.map((i) => (
                <li key={i.materialId} className="flex gap-2 text-xs text-texto-suave">
                  <span className="shrink-0 tabular text-texto-tenue">{i.materialId}</span>
                  <span className="min-w-0 flex-1 truncate">{i.descripcion}</span>
                </li>
              ))}
            </ul>
            {totalItems > itemsDisparador.length && (
              <p className="mt-1 text-xs text-texto-tenue">
                y {(totalItems - itemsDisparador.length).toLocaleString("es-AR")} más
              </p>
            )}
          </div>
        )}
      </div>

      {tipo.preguntaGrado && seleccion.grado !== null && aporte === null && (
        <p
          role="alert"
          className="mb-6 rounded-md border border-aviso-200 bg-aviso-50 p-3 text-sm text-aviso-900"
        >
          Para <strong>{seleccion.grado}</strong> no hay aporte definido por Oficina Técnica. El
          consumible se sugiere igual, pero sin justificación de grado: confirmalo antes de
          cerrar la venta.
        </p>
      )}

      {sinCatalogo ? (
        <p className="rounded-lg border border-aviso-200 bg-aviso-50 p-4 text-sm text-aviso-900">
          Las familias que complementan este producto no tienen ítems en el catálogo vigente.
          Avisale a Oficina Técnica antes de seguir.
        </p>
      ) : (
        <ListaComplementos
          tipo={tipo.codigo}
          nombreTipo={tipo.nombre}
          complementos={complementos}
          grado={seleccion.grado ?? null}
          medida={seleccion.medida ?? null}
          itemsPorFamilia={itemsPorFamilia}
          aporte={aporte}
        />
      )}

      {tipo.notas.length > 0 && (
        <section className="mt-10">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-texto-tenue">
            Notas técnicas de la línea
          </h2>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-texto-suave">
            {tipo.notas.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
