// Fetches the speech-to-text model named in speech-model.json into
// public/models/<dir>/, so Vite copies it into dist and the server serves it
// (ADR 0003). Files already present with the right checksum are kept, so a
// rebuild needs no network. A file whose SHA-256 doesn't match is an error.
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const web = join(dirname(fileURLToPath(import.meta.url)), "..");
const model = JSON.parse(await readFile(join(web, "speech-model.json"), "utf8"));
const out = join(web, "public", "models", model.dir);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

for (const [file, want] of Object.entries(model.files)) {
  const dest = join(out, file);
  const have = await readFile(dest).then(sha256, () => null);
  if (have === want) continue;
  const url = `https://huggingface.co/${model.repo}/resolve/${model.revision}/${file}`;
  console.log(`fetching ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}\n${await res.text()}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  const got = sha256(bytes);
  if (got !== want) throw new Error(`${url}: SHA-256 ${got}, expected ${want}`);
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(`${dest}.part`, bytes);
  await rename(`${dest}.part`, dest);
}
