import Link from "next/link";

export default function Panel() {
  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="text-xl font-semibold">Panel de Oficina Técnica</h1>
      <ul className="mt-4 space-y-2">
        <li>
          <Link href="/admin/import" className="text-slate-900 hover:underline">
            Importar catálogo
          </Link>
          <p className="text-sm text-slate-600">
            Subir el Excel, validar el layout, previsualizar y activar.
          </p>
        </li>
      </ul>
    </main>
  );
}
