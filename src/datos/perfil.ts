import { cache } from "react";
import type { Perfil, Sesion } from "@/tipos/dominio";
import { clienteServidor } from "./supabase-servidor";

/**
 * Sesion del usuario actual con su perfil.
 *
 * Va con `cache()` de React: durante un mismo render, layout y pagina la piden por
 * separado y esto la resuelve una sola vez.
 *
 * Devuelve null si no hay sesion valida o si el perfil no existe. Lo segundo no deberia
 * pasar —el trigger de 0001 lo crea en el alta— pero si pasa, la app trata al usuario
 * como no autenticado en vez de asumirle un rol.
 */
export const sesionActual = cache(async (): Promise<Sesion | null> => {
  const supabase = await clienteServidor();

  // getUser() valida el token contra Supabase. getSession() lee la cookie sin verificar
  // y no sirve para decidir permisos.
  const { data: auth, error: errorAuth } = await supabase.auth.getUser();
  if (errorAuth !== null || auth.user === null) return null;

  const { data: perfil, error } = await supabase
    .from("perfil")
    .select("user_id, nombre, sucursal, rol")
    .eq("user_id", auth.user.id)
    .maybeSingle<Perfil>();

  if (error !== null || perfil === null) return null;

  return { usuario: { id: auth.user.id, email: auth.user.email ?? null }, perfil };
});
