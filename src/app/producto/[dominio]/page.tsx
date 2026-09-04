import Link from "next/link";
import { notFound } from "next/navigation";
import { MigasDePan } from "@/componentes/MigasDePan";
import { dominio as leerDominio } from "@/datos/taxonomia";
import { clienteServidor } from "@/datos/supabase-servidor";

export default async function Productos({
  params,
}: {
  params: Promise<{ dominio: string }>;
}) {
  const { dominio: codigo } = await params;
  const supabase = await clienteServidor();
  const linea = await leerDominio(supabase, codigo);

  if (linea === null) notFound();

  return (
    <main className="mx-auto max-w-3xl p-6">
      <MigasDePan
        pasos={[
          { texto: "Inicio", href: "/" },
          { texto: "Línea", href: "/producto" },
          { texto: linea.nombre },
        ]}
      />
      <h1 className="mt-2 mb-6 text-xl font-semibold">{linea.nombre}</h1>

      <ul className="grid gap-2 sm:grid-cols-2">
        {linea.tipos.map((t) => (
          <li key={t.codigo}>
            <Link
              href={`/producto/${linea.codigo}/${t.codigo}`}
              className="block rounded-lg border border-slate-200 bg-white p-4 hover:border-slate-400"
            >
              <span className="font-medium">{t.nombre}</span>
              {t.pregunta_grado && (
                <span className="mt-0.5 block text-sm text-slate-500">Pregunta el grado</span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
