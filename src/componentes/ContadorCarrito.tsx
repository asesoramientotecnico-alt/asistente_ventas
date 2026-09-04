"use client";

import Link from "next/link";
import { useCarrito } from "@/carrito/estado";

export function ContadorCarrito() {
  const { items, listo } = useCarrito();

  // Antes de leer sessionStorage no se sabe cuántas hay: no se pinta un número que
  // después cambie.
  if (!listo || items.length === 0) return null;

  return (
    <Link
      href="/carrito"
      className="inline-flex items-center gap-2 rounded-md bg-acento-50 px-2.5 py-1 font-medium text-acento-700 hover:bg-acento-100"
    >
      Carrito
      <span className="rounded bg-acento-600 px-1.5 text-xs text-white tabular">
        {items.length}
      </span>
    </Link>
  );
}
