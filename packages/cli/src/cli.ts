#!/usr/bin/env node
import { runCli } from "./commands.js";
import { printError } from "./output.js";
const args = process.argv.slice(2);
runCli(args).catch((error) => {
  printError(
    error,
    args
      .slice(0, args.indexOf("--") === -1 ? undefined : args.indexOf("--"))
      .includes("--json"),
  );
  process.exitCode = 1;
});
