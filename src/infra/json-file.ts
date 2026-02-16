/**
 * JSON file read/write with safe permissions.
 * Adapted from OpenClaw's src/infra/json-file.ts
 */
import fs from "node:fs";
import path from "node:path";

export function loadJsonFile(pathname: string): unknown {
  try {
    if (!fs.existsSync(pathname)) return undefined;
    const raw = fs.readFileSync(pathname, "utf8");
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

/** Write JSON with secure permissions (dir 0o700, file 0o600). */
export function saveJsonFile(pathname: string, data: unknown): void {
  const dir = path.dirname(pathname);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  fs.writeFileSync(pathname, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  fs.chmodSync(pathname, 0o600);
}
