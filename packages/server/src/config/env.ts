import { existsSync } from "fs";
import { resolve } from "path";
import { config } from "dotenv";

const roots = [process.cwd(), resolve(process.cwd(), "../..")];

for (const root of roots) {
  const envPath = resolve(root, ".env");
  if (existsSync(envPath)) {
    config({ path: envPath });
  }
}

for (const root of roots) {
  const examplePath = resolve(root, ".env.example");
  if (existsSync(examplePath)) {
    config({ path: examplePath });
  }
}
