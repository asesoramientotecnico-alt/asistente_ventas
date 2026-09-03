import { sesionActual } from "@/datos/perfil";
import { rolAlcanza, rolRequerido } from "@/logica/acceso";

/**
 * Puerta del panel. El middleware ya garantizo que hay sesion; lo que falta chequear es
 * el rol, y eso necesita una consulta a la base que no conviene hacer en el middleware.
 *
 * Esto es conveniencia de UI: aunque alguien llegue igual, las politicas de RLS de 0008
 * no le van a dejar escribir nada.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const sesion = await sesionActual();
  const minimo = rolRequerido("/admin");

  if (minimo !== null && !rolAlcanza(sesion?.perfil.rol, minimo)) {
    return (
      <main className="mx-auto max-w-4xl p-6">
        <h1 className="text-xl font-semibold">Panel de Oficina Técnica</h1>
        <p className="mt-2 text-slate-600">
          Tu usuario no tiene acceso a esta sección. Si necesitás entrar, pedile a
          Administración que te cambie el rol.
        </p>
      </main>
    );
  }

  return <>{children}</>;
}
