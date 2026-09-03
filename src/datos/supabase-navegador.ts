import { createBrowserClient } from "@supabase/ssr";
import { clavePublicaSupabase, urlSupabase } from "./entorno";

/** Cliente de Supabase para componentes del navegador. */
export function clienteNavegador() {
  return createBrowserClient(urlSupabase(), clavePublicaSupabase());
}
