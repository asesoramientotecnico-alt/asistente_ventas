import { NextResponse } from "next/server";
import { clienteServidor } from "@/datos/supabase-servidor";

/** Cierre de sesion. Va por POST para que no lo dispare un prefetch del navegador. */
export async function POST() {
  const supabase = await clienteServidor();
  await supabase.auth.signOut();

  // Location relativo: ver el comentario en auth/callback/route.ts.
  return new NextResponse(null, { status: 303, headers: { Location: "/login" } });
}
