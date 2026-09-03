import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { clavePublicaSupabase, urlSupabase } from "@/datos/entorno";
import { esRutaPublica } from "@/logica/acceso";

/**
 * Refresca la sesion en cada request y saca a la pantalla de login a quien no la tenga.
 *
 * Aca NO se chequea el rol: eso implicaria una consulta a la base en cada request. El rol
 * lo verifica el layout de la seccion protegida (src/app/admin/layout.tsx), y la ultima
 * palabra la tienen las politicas de RLS.
 *
 * El archivo se llama `proxy` y no `middleware`: Next 16 renombro la convencion.
 */
export async function proxy(request: NextRequest) {
  let respuesta = NextResponse.next({ request });

  const supabase = createServerClient(urlSupabase(), clavePublicaSupabase(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(aEscribir) {
        for (const { name, value } of aEscribir) {
          request.cookies.set(name, value);
        }
        respuesta = NextResponse.next({ request });
        for (const { name, value, options } of aEscribir) {
          respuesta.cookies.set(name, value, options);
        }
      },
    },
  });

  // Llamar a getUser() es lo que dispara el refresco del token. No sacar.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const ruta = request.nextUrl.pathname;

  if (user === null && !esRutaPublica(ruta)) {
    const destino = request.nextUrl.clone();
    destino.pathname = "/login";
    destino.search = "";
    // Para volver a donde el asesor queria ir despues de iniciar sesion.
    if (ruta !== "/") destino.searchParams.set("volver", `${ruta}${request.nextUrl.search}`);
    return NextResponse.redirect(destino);
  }

  if (user !== null && ruta === "/login") {
    const destino = request.nextUrl.clone();
    destino.pathname = "/";
    destino.search = "";
    return NextResponse.redirect(destino);
  }

  return respuesta;
}

export const config = {
  matcher: [
    // Todo menos lo interno de Next y los assets.
    //
    // El prefijo `_next/` va entero, no solo `_next/static` y `_next/image`: por
    // `_next/hmr` pasa el websocket del servidor de desarrollo, y redirigirlo a /login
    // rompe el handshake.
    "/((?!_next/|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
