import { notFound } from "next/navigation";
import { ListaComplementos } from "@/componentes/ListaComplementos";
import { MigasDePan } from "@/componentes/MigasDePan";
import { aporteParaGrado, gradosDisponibles, tipoConComplementos } from "@/datos/taxonomia";
import { clienteServidor } from "@/datos/supabase-servidor";
import { prepararSugerencias } from "@/logica/sugerencias";

export default async function Complementos({
  params,
  searchParams,
}: {
  params: Promise<{ dominio: string; tipo: string }>;
  searchParams: Promise<{ grado?: string }>;
}) {
  const { dominio, tipo: codigoTipo } = await params;
  const { grado: gradoCrudo } = await searchParams;
  const grado = gradoCrudo === undefined || gradoCrudo === "" ? null : gradoCrudo;

  const supabase = await clienteServidor();
  const tipo = await tipoConComplementos(supabase, codigoTipo);

  if (tipo === null || tipo.dominio.codigo !== dominio) notFound();

  // El selector solo se muestra donde la regla dice que el grado importa.
  const [grados, aporte] = await Promise.all([
    tipo.preguntaGrado ? gradosDisponibles(supabase, tipo.codigo) : Promise.resolve([]),
    aporteParaGrado(supabase, grado),
  ]);

  const complementos = prepararSugerencias(tipo.complementos, aporte);
  const sinCatalogo = tipo.complementos.length > 0 && complementos.length === 0;

  return (
    <main className="mx-auto max-w-3xl p-6">
      <MigasDePan
        pasos={[
          { texto: "Inicio", href: "/" },
          { texto: "Línea", href: "/producto" },
          { texto: tipo.dominio.nombre, href: `/producto/${dominio}` },
          { texto: tipo.nombre },
        ]}
      />
      <h1 className="mt-2 mb-1 text-xl font-semibold">{tipo.nombre}</h1>
      <p className="mb-6 text-slate-600">
        Lo que suele ir junto. Los obligatorios vienen marcados; desmarcá lo que no va.
      </p>

      {sinCatalogo ? (
        <p className="rounded-md bg-amber-50 p-4 text-sm text-amber-900">
          Las familias que complementan este producto no tienen ítems en el catálogo vigente.
          Avisale a Oficina Técnica antes de seguir.
        </p>
      ) : (
        <ListaComplementos
          tipo={tipo.codigo}
          nombreTipo={tipo.nombre}
          complementos={complementos}
          grados={grados}
          grado={grado}
          gradoSinAporte={grado !== null && aporte === null}
        />
      )}

      {tipo.notas.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Notas técnicas de la línea
          </h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
            {tipo.notas.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
