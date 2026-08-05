import { cp, mkdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const source = path.join(root, "src", "web", "public");
const target = path.join(root, "dist", "web", "public");

await mkdir(target, { recursive: true });
await cp(source, target, { recursive: true });
