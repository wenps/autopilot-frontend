/**
 * Browser CLI command.
 * Pattern from OpenClaw's src/cli/browser-cli.ts
 */
import type { Command } from "commander";
import { BrowserController } from "../browser/controller.js";
import { loadConfig } from "../config/config.js";

export function registerBrowserCommand(program: Command): void {
  const browser = program
    .command("browser")
    .description("Control browser automation");

  browser
    .command("open")
    .description("Open a URL in the controlled browser")
    .argument("<url>", "URL to navigate to")
    .option("--headless", "Run in headless mode")
    .action(async (url: string, opts) => {
      const config = loadConfig();
      const controller = new BrowserController({
        headless: opts.headless ?? config.browser?.headless ?? false,
        executablePath: config.browser?.executablePath,
      });
      await controller.launch();
      await controller.navigate(url);
      console.log(`Browser opened: ${url}`);
      console.log("Use Ctrl+C to close, or run 'autopilot browser close'");
    });

  browser
    .command("screenshot")
    .description("Take a screenshot of the current page")
    .option("-o, --output <path>", "Output file path", "screenshot.png")
    .action(async (opts) => {
      const controller = BrowserController.getRunning();
      if (!controller) {
        console.error("No browser is running. Use 'autopilot browser open <url>' first.");
        process.exit(1);
      }
      const path = await controller.screenshot(opts.output);
      console.log(`Screenshot saved: ${path}`);
    });

  browser
    .command("fill")
    .description("Fill a form field by selector")
    .argument("<selector>", "CSS selector of the input")
    .argument("<value>", "Value to fill in")
    .action(async (selector: string, value: string) => {
      const controller = BrowserController.getRunning();
      if (!controller) {
        console.error("No browser is running.");
        process.exit(1);
      }
      await controller.fill(selector, value);
      console.log(`Filled "${selector}" with "${value}"`);
    });

  browser
    .command("click")
    .description("Click an element by selector")
    .argument("<selector>", "CSS selector to click")
    .action(async (selector: string) => {
      const controller = BrowserController.getRunning();
      if (!controller) {
        console.error("No browser is running.");
        process.exit(1);
      }
      await controller.click(selector);
      console.log(`Clicked "${selector}"`);
    });

  browser
    .command("snapshot")
    .description("Get accessibility snapshot of the current page")
    .option("--format <format>", "Output format: aria | text", "text")
    .action(async (opts) => {
      const controller = BrowserController.getRunning();
      if (!controller) {
        console.error("No browser is running.");
        process.exit(1);
      }
      const snapshot = await controller.snapshot(opts.format);
      console.log(snapshot);
    });

  browser
    .command("close")
    .description("Close the controlled browser")
    .action(async () => {
      const controller = BrowserController.getRunning();
      if (controller) {
        await controller.close();
        console.log("Browser closed.");
      } else {
        console.log("No browser is running.");
      }
    });
}
