import { writeFile } from "node:fs/promises";
import { fetchPostpass, prepareSnapshot, validSnapshot } from "./data-core.mjs";
const snapshot = prepareSnapshot(await fetchPostpass());
if (!validSnapshot(snapshot)) throw new Error("El JSON generat no és vàlid");
await writeFile("site/snapshot.json", JSON.stringify(snapshot));
console.log(`Dades publicades: ${snapshot.all.length} establiments, ${snapshot.errors.length} errors, ${snapshot.updatedAt}`);
