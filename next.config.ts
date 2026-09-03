import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // `next dev` escribe un bloque de notas para agentes al final de CLAUDE.md.
  // CLAUDE.md es el contexto de dominio del proyecto, no un archivo de herramienta.
  agentRules: false,
};

export default config;
