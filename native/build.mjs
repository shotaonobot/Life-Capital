import { cp, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = fileURLToPath(new URL(".", import.meta.url));
const output = fileURLToPath(new URL("www/", import.meta.url));
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(fileURLToPath(new URL("../dist/", import.meta.url)), output, { recursive: true });
await build({ entryPoints: [root + "platform.js"], outfile: output + "platform.js", bundle: true, format: "esm", target: "safari15", minify: true });
console.log("Native web assets built; native storage, local notifications and sharing are bundled.");
