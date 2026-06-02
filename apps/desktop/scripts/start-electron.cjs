const { spawn } = require("node:child_process");
const path = require("node:path");

const electronPath = require("electron");
const desktopRoot = path.resolve(__dirname, "..");
const env = { ...process.env };

delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronPath, [desktopRoot], {
  cwd: desktopRoot,
  env,
  stdio: "inherit"
});

child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});

child.on("close", (code) => {
  process.exit(code ?? 0);
});
