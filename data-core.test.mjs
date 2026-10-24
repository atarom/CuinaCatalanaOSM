import assert from "node:assert/strict";
import test from "node:test";
import { fetchPostpass, prepareSnapshot, sameSnapshot, updateHistory, validHistory, validSnapshot } from "./data-core.mjs";
import * as client from "./data-client.mjs";
const feature = (id, name, cuisine, type = "N") => ({ type: "Feature", geometry: { type: "Point", coordinates: [2.1 + id / 100, 41.3] }, properties: { osm_type: type, osm_id: id, tags: { name, cuisine, amenity: "restaurant" } } });
const response = { type: "FeatureCollection", features: [feature(1, "", "catalan;mediterranean"), feature(2, "Restaurant", "catalan"), feature(3, "Error", "catalana"), feature(4, "Bar", "catalan;mediterranean", "W")] };
test("manté establiments, comptadors, etiquetes i possibles errors", () => {
  const snapshot = prepareSnapshot(response, "2026-10-22T04:17:00.000Z");
  assert.ok(validSnapshot(snapshot));
  assert.equal(snapshot.all.length, 3);
  assert.equal(snapshot.all[0].n, "❌Sense nom❌");
  assert.equal(snapshot.all[0].t.amenity, "restaurant");
  assert.deepEqual(snapshot.multi, [{ v: "catalan;mediterranean", c: 2 }, { v: "catalan", c: 1 }]);
  assert.deepEqual(snapshot.unique, [{ v: "catalan", c: 3 }, { v: "mediterranean", c: 2 }]);
  assert.equal(snapshot.errors[0].c, "catalana");
  assert.equal(snapshot.all[2].u, "https://www.openstreetmap.org/node/2");
});
test("rebutja dades buides o corruptes", () => {
  assert.throws(() => prepareSnapshot({ type: "FeatureCollection", features: [] }));
  assert.throws(() => prepareSnapshot({ type: "FeatureCollection", features: [feature(1, "Error", "catalana")] }));
  assert.equal(validSnapshot({ version: 1, updatedAt: "avui", all: [], multi: [], unique: [], errors: [] }), false);
});
test("consulta Postpass sense caché i gestiona errors", async () => {
  const previousFetch = globalThis.fetch;
  try {
    let url, options;
    globalThis.fetch = async (u, o) => { url = u; options = o; return { ok: true, json: async () => response }; };
    assert.deepEqual(await fetchPostpass(), response);
    assert.ok(url.includes("postpass.geofabrik.de/api/interpreter?data="));
    assert.equal(options.cache, "no-store");
    globalThis.fetch = async () => ({ ok: false, status: 503, statusText: "Unavailable" });
    await assert.rejects(fetchPostpass(), /Postpass HTTP 503/);
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ type: "FeatureCollection", features: [] }) });
    await assert.rejects(fetchPostpass(), /buida/);
  } finally {
    globalThis.fetch = previousFetch;
  }
});
test("publica només les validacions necessàries al navegador", () => {
  assert.deepEqual(Object.keys(client).sort(), ["validHistory", "validPoint", "validSnapshot"]);
  assert.equal(client.validPoint([2.1, 41.3]), true);
  assert.equal(client.validPoint([null, 41.3]), false);
});
test("no considera canvis la data, l'ordre dels tags o dels establiments", () => {
  const before = prepareSnapshot(response, "2026-10-21T04:17:00Z");
  const shuffled = { ...response, features: [...response.features].reverse().map((f) => ({ ...f, properties: { ...f.properties, tags: { cuisine: f.properties.tags.cuisine, amenity: "restaurant", name: f.properties.tags.name } } })) };
  const after = prepareSnapshot(shuffled, "2026-10-22T04:17:00Z");
  assert.equal(sameSnapshot(before, after), true);
  after.all[0].t.amenity = "bar";
  assert.equal(sameSnapshot(before, after), false);
});
test("detecta canvis en els errors, els comptadors i els punts", () => {
  const before = prepareSnapshot(response);
  const after = structuredClone(before);
  after.errors[0].c = "catalana;other";
  assert.equal(sameSnapshot(before, after), false);
  after.errors[0].c = before.errors[0].c;
  after.multi[0].c++;
  assert.equal(sameSnapshot(before, after), false);
  after.multi[0].c--;
  after.all[0].p[0] += 0.01;
  assert.equal(sameSnapshot(before, after), false);
});
test("inicialitza l'historial sense donar d'alta tot l'inventari", () => {
  const snapshot = prepareSnapshot(response, "2026-10-22T04:17:00Z");
  const result = updateHistory(null, snapshot, null);
  assert.equal(result.changed, true);
  assert.equal(result.history.baselineAt, snapshot.updatedAt);
  assert.deepEqual(result.history.events, []);
  assert.ok(validHistory(result.history));
});
test("registra les altes i baixes per identificador OSM", () => {
  const before = prepareSnapshot(response, "2026-10-21T04:17:00Z");
  const nextResponse = { type: "FeatureCollection", features: [response.features[0], response.features[2], response.features[3], feature(5, "Nou", "catalan", "W")] };
  const after = prepareSnapshot(nextResponse, "2026-10-22T04:17:00Z");
  const { history, changes } = updateHistory(before, after, null, "2026-10-22T04:18:00Z");
  assert.equal(history.baselineAt, before.updatedAt);
  assert.equal(changes.length, 2);
  assert.deepEqual(changes.map((c) => [c.action, c.url]), [["added", "https://www.openstreetmap.org/way/5"], ["removed", "https://www.openstreetmap.org/node/2"]]);
  assert.equal(changes[1].name, "Restaurant");
  assert.equal(changes[0].cuisine, "catalan");
  assert.ok(validHistory(history));
  const repeated = updateHistory(before, after, history, "2026-10-23T04:17:00Z");
  assert.equal(repeated.changed, false);
  assert.deepEqual(repeated.history.events, history.events);
});
test("no registra canvis de nom o etiquetes com altes ni baixes", () => {
  const before = prepareSnapshot(response, "2026-10-21T04:17:00Z");
  const updated = structuredClone(before);
  updated.all[1].n = "Nou nom";
  updated.all[1].t.cuisine = "catalan;mediterranean";
  const initial = updateHistory(null, before, null).history;
  const result = updateHistory(before, updated, initial);
  assert.equal(result.changed, false);
  assert.equal(result.history.events.length, 0);
});
test("rebutja historials malformats sense perdre l'anterior", () => {
  const snapshot = prepareSnapshot(response);
  const initial = updateHistory(null, snapshot, null).history;
  assert.equal(validHistory({ version: 1, baselineAt: "avui", events: [] }), false);
  assert.equal(validHistory({ ...initial, events: [{ action: "added", url: "javascript:alert(1)", at: snapshot.updatedAt, sourceAt: snapshot.updatedAt, name: "X", cuisine: "catalan", p: [2, 41] }] }), false);
  assert.throws(() => updateHistory(snapshot, snapshot, { version: 5, events: [] }));
});
