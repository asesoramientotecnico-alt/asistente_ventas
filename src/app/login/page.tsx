import { FormularioLogin } from "@/componentes/FormularioLogin";

export const metadata = { title: "Entrar — Asistente de venta cruzada" };

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ volver?: string; error?: string }>;
}) {
  const { volver, error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-6">
      <h1 className="text-xl font-semibold">Asistente de venta cruzada</h1>
      <p className="mt-1 mb-6 text-sm text-slate-600">Herramienta interna de Famiq.</p>

      {error !== undefined && (
        <p role="alert" className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      )}

      <FormularioLogin {...(volver === undefined ? {} : { volver })} />
    </main>
  );
}
