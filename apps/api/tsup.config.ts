import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node22",
  platform: "node",
  clean: true,
  sourcemap: true,
  // O pacote shared é TypeScript puro do workspace: entra no bundle.
  noExternal: ["@elpatron/shared"],
});
