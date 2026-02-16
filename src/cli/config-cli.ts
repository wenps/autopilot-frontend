/**
 * Config CLI command.
 * Pattern from OpenClaw's src/cli/config-cli.ts
 */
import type { Command } from "commander";
import { loadConfig, writeConfig, resolveConfigPath } from "../config/config.js";

export function registerConfigCommand(program: Command): void {
  const config = program
    .command("config")
    .description("Manage configuration");

  config
    .command("path")
    .description("Show config file path")
    .action(() => {
      console.log(resolveConfigPath());
    });

  config
    .command("show")
    .description("Show current configuration")
    .action(() => {
      const cfg = loadConfig();
      console.log(JSON.stringify(cfg, null, 2));
    });

  config
    .command("set")
    .description("Set a config value (dot notation)")
    .argument("<key>", "Config key (e.g. agent.model)")
    .argument("<value>", "Config value")
    .action((key: string, value: string) => {
      const cfg = loadConfig();
      const parts = key.split(".");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let current: any = cfg;
      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i]!;
        if (typeof current[part] !== "object" || current[part] === null) {
          current[part] = {};
        }
        current = current[part];
      }
      const lastKey = parts[parts.length - 1]!;
      // Try to parse as JSON for booleans/numbers
      try {
        current[lastKey] = JSON.parse(value);
      } catch {
        current[lastKey] = value;
      }
      writeConfig(cfg);
      console.log(`Set ${key} = ${value}`);
    });
}
