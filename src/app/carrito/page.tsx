import { MigasDePan } from "@/componentes/MigasDePan";
import { VistaCarrito } from "@/componentes/VistaCarrito";
import { configEcommerce, todosLosLinks } from "@/datos/links";
import { clienteServidor } from "@/datos/supabase-servidor";

export const metadata = { title: "Carrito" };

export default async function Carrito() {
  const supabase = await clienteServidor();
  const [config, links] = await Promise.all([configEcommerce(supabase), todosLosLinks(supabase)]);

  return (
    <main className="mx-auto max-w-3xl p-6">
      <MigasDePan pasos={[{ texto: "Inicio", href: "/" }, { texto: "Carrito" }]} />
      <h1 className="mt-2 mb-1 text-xl font-semibold">Carrito</h1>
      <p className="mb-6 text-slate-600">
        Quitá lo que no va y después generá los links para verificar precio y stock.
      </p>
      <VistaCarrito config={config} links={links} />
    </main>
  );
}
