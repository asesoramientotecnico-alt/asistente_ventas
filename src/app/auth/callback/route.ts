import { NextResponse, type NextRequest } from "next/server";
import { clienteServidor } from "@/datos/supabase-servidor";

/**
 * Cierre del enlace de acceso enviado por correo.
 *
 * Segun como este armada la plantilla del mail, Supabase vuelve con `code` (flujo PKCE)
 * o con `token_hash` + `type`. Se contemplan los dos para no depender de esa config.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
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

  const destino = url.clone();
  destino.search = "";

  if (error !== null) {
    destino.pathname = "/login";
    destino.searchParams.set("error", "El enlace no es válido o ya venció. Pedí uno nuevo.");
    return NextResponse.redirect(destino);
  }

  // `volver` solo puede ser una ruta interna: si no, seria un redirect abierto.
  destino.pathname = volver !== null && volver.startsWith("/") && !volver.startsWith("//") ? volver : "/";
  return NextResponse.redirect(destino);
}
