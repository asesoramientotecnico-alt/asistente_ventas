import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { clavePublicaSupabase, urlSupabase } from "./entorno";

/**
 * Cliente de Supabase para Server Components, Route Handlers y Server Actions.
 *
 * Usa la clave publica, no la de servicio: todas las consultas pasan por las politicas
 * de RLS de 0008. No hay atajos por el service_role en la app.
 */
export async function clienteServidor() {
  const almacen = await cookies();

  return createServerClient(urlSupabase(), clavePublicaSupabase(), {
    cookies: {
      getAll() {
        return almacen.getAll();
      },
      setAll(aEscribir) {
        try {
          for (const { name, value, options } of aEscribir) {
            almacen.set(name, value, options);
          }
        } catch {
          // Un Server Component no puede escribir cookies. El refresco de la sesion lo
          // hace el middleware, asi que ignorar aca es correcto.
        }
      },
    },
  });
}
