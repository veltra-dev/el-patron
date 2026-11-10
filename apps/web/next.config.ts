import type { NextConfig } from "next";

const config: NextConfig = {
  // O pacote shared é TypeScript puro do monorepo.
  transpilePackages: ["@elpatron/shared"],
};

export default config;
