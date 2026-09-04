import { FormularioLogin } from "@/componentes/FormularioLogin";

export const metadata = { title: "Entrar — Asistente de venta cruzada" };

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ volver?: string; error?: string }>;
}) {
  const { volver, error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-5 py-6">
      <h1 className="text-2xl font-semibold tracking-tight">Asistente de venta cruzada</h1>
      <p className="mt-1 mb-8 text-texto-suave">Herramienta interna de Famiq.</p>

      {error !== undefined && (
        <p role="alert" className="mb-4 rounded-md border border-aviso-200 bg-aviso-50 p-3 text-sm text-aviso-900">
          {error}
        </p>
      )}

      <FormularioLogin {...(volver === undefined ? {} : { volver })} />
    </main>
  );
}
