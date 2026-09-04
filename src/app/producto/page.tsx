import Link from "next/link";
import { MigasDePan } from "@/componentes/MigasDePan";
import { listarDominios } from "@/datos/taxonomia";
import { clienteServidor } from "@/datos/supabase-servidor";

export const metadata = { title: "El cliente pide un producto" };

export default async function Lineas() {
  const supabase = await clienteServidor();
  const dominios = await listarDominios(supabase);

  return (
    <main className="mx-auto max-w-3xl p-6">
      <MigasDePan pasos={[{ texto: "Inicio", href: "/" }, { texto: "Línea" }]} />
      <h1 className="mt-2 mb-1 text-xl font-semibold">¿De qué línea es el producto?</h1>
      <p className="mb-6 text-slate-600">Elegí la línea y después el producto puntual.</p>

      <ul className="grid gap-2 sm:grid-cols-2">
        {dominios.map((d) => (
          <li key={d.codigo}>
            <Link
              href={`/producto/${d.codigo}`}
              className="block rounded-lg border border-slate-200 bg-white p-4 hover:border-slate-400"
            >
              <span className="font-medium">{d.nombre}</span>
              <span className="mt-0.5 block text-sm text-slate-500">
                {d.tipos} {d.tipos === 1 ? "producto" : "productos"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
