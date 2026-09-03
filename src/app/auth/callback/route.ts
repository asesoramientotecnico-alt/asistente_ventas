import { NextResponse, type NextRequest } from "next/server";
import { clienteServidor } from "@/datos/supabase-servidor";

/**
 * Cierre del enlace de acceso enviado por correo.
 *
 * Segun como este armada la plantilla del mail, Supabase vuelve con `code` (flujo PKCE)
 * o con `token_hash` + `type`. Se contemplan los dos para no depender de esa config.
 */

/**
 * Redirige con un Location relativo, que el navegador resuelve contra el host que pidio.
 *
 * No se puede armar el destino con `request.url` ni con `request.nextUrl`: en un route
 * handler de Next 16 los dos pueden traer otro host (localhost en vez del que uso el
 * navegador). La cookie de sesion queda atada al host original, con lo cual al llegar al
 * otro ya no viaja y el login vuelve a empezar en un bucle silencioso.
 */
function redirigirA(ruta: string): NextResponse {
  return new NextResponse(null, { status: 303, headers: { Location: ruta } });
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const tipo = url.searchParams.get("type");
  const volver = url.searchParams.get("volver");

  const supabase = await clienteServidor();

  let error: { message: string } | null = { message: "Enlace de acceso invalido." };

  if (code !== null) {
    ({ error } = await supabase.auth.exchangeCodeForSession(code));
  } else if (tokenHash !== null && tipo !== null) {
    ({ error } = await supabase.auth.verifyOtp({
      type: tipo as "magiclink" | "email",
      token_hash: tokenHash,
    }));
  }

  if (error !== null) {
    const motivo = encodeURIComponent("El enlace no es válido o ya venció. Pedí uno nuevo.");
    return redirigirA(`/login?error=${motivo}`);
  }

  // `volver` solo puede ser una ruta interna: si no, seria un redirect abierto.
  const interna = volver !== null && volver.startsWith("/") && !volver.startsWith("//");
  return redirigirA(interna ? volver : "/");
}
