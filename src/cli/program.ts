/**
 * CLI program builder.
 * Pattern from OpenClaw's src/cli/program/build-program.ts + command-registry.ts
 */
import { Command } from "commander";
import { registerAgentCommand } from "./agent-cli.js";
import { registerBrowserCommand } from "./browser-cli.js";
import { registerConfigCommand } from "./config-cli.js";
import { registerDoctorCommand } from "../commands/doctor.js";

export function buildProgram(): Command {
  const program = new Command();

  program
    .name("autopilot")
    .description("Personal AI automation agent — browser control, VSCode integration, multi-channel messaging")
    .version("0.1.0");

  // Register all sub-commands
  registerAgentCommand(program);
  registerBrowserCommand(program);
  registerConfigCommand(program);
  registerDoctorCommand(program);

  return program;
}
