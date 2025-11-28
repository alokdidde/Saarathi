import {
  defineConfig
} from "../../chunk-4VYGHWFL.mjs";
import "../../chunk-D3LN4XZ7.mjs";
import {
  init_esm
} from "../../chunk-CN7XIEEA.mjs";

// trigger.config.ts
init_esm();
var trigger_config_default = defineConfig({
  project: "proj_sfaertvpxktmueomniyd",
  runtime: "node",
  logLevel: "info",
  maxDuration: 300,
  // 5 minutes max per task
  dirs: ["src/trigger"],
  retries: {
    enabledInDev: false,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1e3,
      maxTimeoutInMs: 1e4,
      factor: 2,
      randomize: true
    }
  },
  build: {}
});
var resolveEnvVars = void 0;
export {
  trigger_config_default as default,
  resolveEnvVars
};
//# sourceMappingURL=trigger.config.mjs.map
