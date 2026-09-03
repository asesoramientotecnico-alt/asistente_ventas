import { NextResponse, type NextRequest } from "next/server";
import { clienteServidor } from "@/datos/supabase-servidor";

/** Cierre de sesion. Va por POST para que no lo dispare un prefetch del navegador. */
export async function POST(request: NextRequest) {
  const supabase = await clienteServidor();
  await supabase.auth.signOut();

  const destino = request.nextUrl.clone();
  destino.pathname = "/login";
  destino.search = "";
  return NextResponse.redirect(destino, { status: 303 });
}
