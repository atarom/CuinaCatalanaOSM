import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { fetchPostpass, prepareSnapshot, sameSnapshot, validSnapshot } from "./data-core.mjs";
const snapshot = prepareSnapshot(await fetchPostpass());
if (!validSnapshot(snapshot)) throw new Error("El JSON generat no és vàlid");
let previous = null;
try {
  const url = "https://atarom.github.io/CuinaCatalanaOSM/snapshot.json?checked=" + Date.now();
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`JSON publicat HTTP ${response.status}`);
  const data = await response.json();
  if (!validSnapshot(data)) throw new Error("JSON publicat invàlid");
  previous = data;
} catch (e) {
  console.warn("No s'ha pogut comprovar la publicació anterior:", e.message);
}
const unchanged = previous !== null && sameSnapshot(previous, snapshot);
const publish = process.env.GITHUB_EVENT_NAME !== "schedule" || !unchanged;
if (publish) {
  await mkdir("site", { recursive: true });
  await writeFile("site/snapshot.json", JSON.stringify(unchanged ? previous : snapshot));
}
if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `publish=${publish}
`);
console.log(unchanged ? "Sense canvis en els establiments ni les etiquetes" : `Dades noves: ${snapshot.all.length} establiments, ${snapshot.errors.length} errors`);
console.log(publish ? "Cal publicar GitHub Pages" : "Es conserva la publicació existent");
