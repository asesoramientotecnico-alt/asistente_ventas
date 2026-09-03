import Link from "next/link";
import { ImportadorExcel } from "@/componentes/ImportadorExcel";
import { listarBatches } from "@/datos/importacion";
import { clienteServidor } from "@/datos/supabase-servidor";

export const metadata = { title: "Importar catálogo — Panel" };

export default async function ImportarCatalogo() {
  const supabase = await clienteServidor();
  const batches = await listarBatches(supabase);

  return (
    <main className="mx-auto max-w-4xl p-6">
      <Link href="/admin" className="text-sm text-slate-600 hover:underline">
        ← Panel
      </Link>
      <h1 className="mt-2 mb-6 text-xl font-semibold">Importar catálogo</h1>
      <ImportadorExcel batches={batches} />
    </main>
  );
}
