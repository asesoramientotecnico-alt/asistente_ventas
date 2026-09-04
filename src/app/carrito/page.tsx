import { MigasDePan } from "@/componentes/MigasDePan";
import { VistaCarrito } from "@/componentes/VistaCarrito";
import { configEcommerce, todosLosLinks } from "@/datos/links";
import { clienteServidor } from "@/datos/supabase-servidor";

export const metadata = { title: "Carrito" };

export default async function Carrito() {
  const supabase = await clienteServidor();
  const [config, links] = await Promise.all([configEcommerce(supabase), todosLosLinks(supabase)]);

  return (
    <main className="mx-auto max-w-4xl px-5 py-8">
      <MigasDePan pasos={[{ texto: "Inicio", href: "/" }, { texto: "Carrito" }]} />
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Carrito</h1>
      <p className="mt-1 mb-6 text-texto-suave">
        Quitá lo que no va y después generá los links para verificar precio y stock.
      </p>
      <VistaCarrito config={config} links={links} />
    </main>
  );
}
