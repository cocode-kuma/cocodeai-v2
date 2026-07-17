import { execSync } from "node:child_process";

execSync("pnpm --filter @cocodeai/desktop build", { stdio: "inherit" });
