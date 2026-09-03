import js from "@eslint/js";
import tseslint from "typescript-eslint";
import next from "eslint-config-next";

const config = [
  { ignores: [".next/**", "node_modules/**", "referencia/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...next,
];

export default config;
