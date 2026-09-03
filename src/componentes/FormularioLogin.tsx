"use client";

import { useState } from "react";
import { clienteNavegador } from "@/datos/supabase-navegador";

const DOMINIO = "@famiq.com.ar";

type Estado = { tipo: "inicial" } | { tipo: "enviando" } | { tipo: "enviado" } | { tipo: "error"; mensaje: string };

export function FormularioLogin({ volver }: { volver?: string }) {
  const [email, setEmail] = useState("");
  const [estado, setEstado] = useState<Estado>({ tipo: "inicial" });

  async function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const direccion = email.trim().toLowerCase();

    // El dominio lo hace cumplir la base (trigger de 0001). Esto es solo para dar un
    // mensaje decente sin esperar la ida y vuelta.
    if (!direccion.endsWith(DOMINIO)) {
      setEstado({ tipo: "error", mensaje: `Usá tu correo de Famiq (${DOMINIO}).` });
      return;
    }

    setEstado({ tipo: "enviando" });
    const destino = new URL("/auth/callback", window.location.origin);
    if (volver !== undefined && volver !== "") destino.searchParams.set("volver", volver);

    const { error } = await clienteNavegador().auth.signInWithOtp({
      email: direccion,
      options: { emailRedirectTo: destino.toString() },
    });

    setEstado(error === null ? { tipo: "enviado" } : { tipo: "error", mensaje: error.message });
  }

  if (estado.tipo === "enviado") {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
        <p className="font-medium text-emerald-900">Te mandamos un enlace a {email.trim().toLowerCase()}.</p>
        <p className="mt-1 text-sm text-emerald-800">
          Abrilo desde este mismo dispositivo. Vence en una hora.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={enviar} className="space-y-4">
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-slate-700">
          Correo de Famiq
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          autoFocus
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (estado.tipo === "error") setEstado({ tipo: "inicial" });
          }}
          placeholder={`nombre${DOMINIO}`}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-slate-900"
        />
      </div>

      {estado.tipo === "error" && (
        <p role="alert" className="text-sm text-red-700">
          {estado.mensaje}
        </p>
      )}

      <button
        type="submit"
        disabled={estado.tipo === "enviando"}
        className="w-full rounded-md bg-slate-900 px-4 py-2 font-medium text-white disabled:opacity-50"
      >
        {estado.tipo === "enviando" ? "Enviando…" : "Entrar"}
      </button>

      <p className="text-sm text-slate-500">
        No hay contraseña: te llega un enlace de acceso por correo.
      </p>
    </form>
  );
}
