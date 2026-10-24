import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { fetchPostpass, prepareSnapshot, sameSnapshot, updateHistory, validHistory, validSnapshot } from "./data-core.mjs";
const published = async (file, valid) => {
  const response = await fetch(`https://atarom.github.io/CuinaCatalanaOSM/${file}?checked=${Date.now()}`, { cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`${file} publicat HTTP ${response.status}`);
  const data = await response.json();
  if (!valid(data)) throw new Error(`${file} publicat invàlid`);
  return data;
};
if (process.env.GITHUB_EVENT_NAME === "push") {
  const [snapshot, history] = await Promise.all([published("snapshot.json", validSnapshot), published("history.json", validHistory)]);
  await mkdir("site", { recursive: true });
  await writeFile("site/snapshot.json", JSON.stringify(snapshot));
  await writeFile("site/history.json", JSON.stringify(history));
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, "publish=true\n");
  console.log("Desplegant dades publicades sense consultar Postpass");
} else {
  const snapshot = prepareSnapshot(await fetchPostpass());
  if (!validSnapshot(snapshot)) throw new Error("El JSON generat no és vàlid");
  let previous = null, history = null;
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
  try {
    history = JSON.parse(await readFile("history.json", "utf8"));
    if (!validHistory(history)) throw new Error("Historial anterior invàlid");
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  if (!previous && history) throw new Error("No es pot comparar sense les dades publicades anteriors");
  const unchanged = previous !== null && sameSnapshot(previous, snapshot);
  const { history: nextHistory, changed: historyChanged, changes } = updateHistory(previous, snapshot, history);
  if (historyChanged) await writeFile("history.json", JSON.stringify(nextHistory));
  const publish = process.env.GITHUB_EVENT_NAME !== "schedule" || !unchanged || historyChanged;
  if (publish) {
    await mkdir("site", { recursive: true });
    await writeFile("site/snapshot.json", JSON.stringify(unchanged ? previous : snapshot));
    await writeFile("site/history.json", JSON.stringify(nextHistory));
  }
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `publish=${publish}\n`);
  console.log(`Historial: ${changes.filter((e) => e.action === "added").length} altes, ${changes.filter((e) => e.action === "removed").length} baixes`);
  console.log(unchanged ? "Sense canvis en els establiments ni les etiquetes" : `Dades noves: ${snapshot.all.length} establiments, ${snapshot.errors.length} errors`);
  console.log(publish ? "Cal publicar GitHub Pages" : "Es conserva la publicació existent");
}
