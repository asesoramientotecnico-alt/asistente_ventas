"use client";

import Link from "next/link";
import { useCarrito } from "@/carrito/estado";

export function ContadorCarrito() {
  const { items, listo } = useCarrito();

  // Antes de leer sessionStorage no se sabe cuántas hay: no se pinta un número que
  // después cambie.
  if (!listo || items.length === 0) return null;

  return (
    <Link href="/carrito" className="hover:text-slate-900 hover:underline">
      Carrito <span className="rounded bg-slate-900 px-1.5 py-0.5 text-xs text-white">{items.length}</span>
    </Link>
  );
}
