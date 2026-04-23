import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Absolute app root so Turbopack does not pick a parent `package-lock.json` (e.g. `C:\\Users\\user\\`). */
const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: {
    root: projectRoot,
    resolveAlias: {
      tailwindcss: path.join(projectRoot, "node_modules", "tailwindcss"),
      "tw-animate-css": path.join(projectRoot, "node_modules", "tw-animate-css"),
      shadcn: path.join(projectRoot, "node_modules", "shadcn"),
    },
  },
};

export default nextConfig;