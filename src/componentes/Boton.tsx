import type { ComponentProps } from "react";

/**
 * Boton de la app. Existe para que las ocho pantallas no vayan derivando cada una su
 * propio boton, y para que el area de click sea grande: se usa de pie, en un mostrador.
 */

type Variante = "primario" | "secundario" | "texto";

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45";

const VARIANTE: Record<Variante, string> = {
  primario: "bg-acento-600 text-white hover:bg-acento-700 px-4 py-2.5",
  secundario:
    "border border-borde-fuerte bg-superficie text-texto hover:border-acento-600 px-4 py-2.5",
  texto: "text-texto-suave hover:text-texto hover:underline px-1 py-1",
};

export function Boton({
  variante = "primario",
  className = "",
  ...props
}: ComponentProps<"button"> & { variante?: Variante }) {
  return <button type="button" className={`${BASE} ${VARIANTE[variante]} ${className}`} {...props} />;
}
