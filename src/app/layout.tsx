import type { Metadata } from "next";
import { Encabezado } from "@/componentes/Encabezado";
import { sesionActual } from "@/datos/perfil";
import "./globals.css";

export const metadata: Metadata = {
  title: "Asistente de venta cruzada — Famiq",
  description: "Herramienta interna para asesores comerciales.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // En /login todavia no hay sesion: ahi el encabezado no se muestra.
  const sesion = await sesionActual();

  return (
    <html lang="es-AR">
      <body className="min-h-screen antialiased">
        {sesion !== null && <Encabezado sesion={sesion} />}
        {children}
      </body>
    </html>
  );
}
