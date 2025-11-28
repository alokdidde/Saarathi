import { defineConfig } from "@trigger.dev/sdk";
import { prismaExtension } from "@trigger.dev/build/extensions/prisma";

export default defineConfig({
  project: "proj_sfaertvpxktmueomniyd",
  runtime: "node",
  logLevel: "info",
  maxDuration: 300, // 5 minutes max per task
  dirs: ["src/trigger"],
  retries: {
    enabledInDev: false,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10000,
      factor: 2,
      randomize: true,
    },
  },
  build: {
    external: [
      "@prisma/client",
      "@prisma/client-runtime-utils",
      "@prisma/adapter-pg",
      "import-in-the-middle",
    ],
    extensions: [
      prismaExtension({
        mode: "modern",
      }),
    ],
  },
});
