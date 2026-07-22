#!/usr/bin/env node

import process from "node:process";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const serverEntry = require.resolve("dooray-mcp-js/src/index.js");
const child = spawn(process.execPath, [serverEntry, ...process.argv.slice(2), "--profile", "read"], {
  stdio: "inherit",
  env: process.env
});

child.on("error", (error) => {
  console.error(`failed to start dooray-mcp-js: ${error.message}`);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
