export const POSTPASS_URL = "https://postpass.geofabrik.de/api/interpreter";
export const POSTPASS_QUERY = "SELECT DISTINCT ON (osm_type, osm_id) osm_type, osm_id, tags, ST_Centroid(ST_Envelope(geom)) AS geom FROM postpass_pointlinepolygon WHERE tags ? 'cuisine' AND tags @? '$.cuisine ? (@ like_regex \"(^|;| )catal\" flag \"i\")' ORDER BY osm_type, osm_id, ST_Dimension(geom) DESC";
const tidy = (s) => typeof s == "string" && s.trim() ? s.trim() : "";
const valid = (p) => Array.isArray(p) && p.length > 1 && Number.isFinite(p[0]) && Number.isFinite(p[1]);
const isCatalan = (e) => /(^|;| )catalan( |;|$)/.test(tidy(e?.properties?.tags?.cuisine));
const rows = (m) => [...m].map(([v, c]) => ({ v, c })).sort((a, b) => b.c - a.c || a.v.localeCompare(b.v));
const process = (a) => a.map((e) => {
  const t = e?.properties?.tags || {}, p = e?.geometry?.type == "Point" ? e.geometry.coordinates : null, n = tidy(t.name), raw = tidy(t.cuisine) || "Sense etiqueta";
  const type = { N: "node", W: "way", R: "relation" }[e?.properties?.osm_type];
  return { n: n || "❌Sense nom❌", isU: !n, p: valid(p) ? p : null, u: `https://www.openstreetmap.org/${type || ""}/${e?.properties?.osm_id ?? ""}`, t, raw, vals: raw == "Sense etiqueta" ? [] : raw.split(";").map(tidy).filter(Boolean) };
}).filter((o) => valid(o.p)).sort((a, b) => a.isU == b.isU ? a.n.localeCompare(b.n) : a.isU ? -1 : 1).map((o, i) => ({ ...o, i }));
export const validResponse = (d) => d?.type == "FeatureCollection" && Array.isArray(d.features) && d.features.length > 0;
export const prepareSnapshot = (d, updatedAt = new Date().toISOString()) => {
  if (!validResponse(d)) throw new Error("Resposta invàlida o buida de Postpass");
  const good = [], bad = [];
  d.features.forEach((e) => (isCatalan(e) ? good : bad).push(e));
  const all = process(good);
  if (!all.length) throw new Error("La consulta no ha retornat establiments vàlids");
  const cnt = new Map(), ucnt = new Map();
  all.forEach(({ raw, vals }) => {
    cnt.set(raw, (cnt.get(raw) || 0) + 1);
    vals.forEach((v) => ucnt.set(v, (ucnt.get(v) || 0) + 1));
  });
  const errors = process(bad).map(({ n, raw, u }) => ({ n, c: raw, u }));
  return { version: 1, updatedAt, all, multi: rows(cnt), unique: rows(ucnt), errors };
};
export const validSnapshot = (d) => d?.version === 1 && Number.isFinite(Date.parse(d.updatedAt)) && Array.isArray(d.all) && d.all.length > 0 && d.all.every((o, i) => o.i === i && valid(o.p) && typeof o.n === "string" && typeof o.u === "string" && o.t && typeof o.t === "object" && typeof o.raw === "string" && Array.isArray(o.vals)) && Array.isArray(d.multi) && Array.isArray(d.unique) && Array.isArray(d.errors);
export const fetchPostpass = async () => {
  const r = await fetch(POSTPASS_URL + "?data=" + encodeURIComponent(POSTPASS_QUERY), { cache: "no-store" });
  if (!r.ok) throw new Error(`Postpass HTTP ${r.status} ${r.statusText}`);
  const d = await r.json();
  if (!validResponse(d)) throw new Error(d?.error || "Resposta invàlida o buida de Postpass");
  return d;
};
export const cooldownSeconds = (last, now = Date.now()) => Number.isFinite(last) && last > 0 && last <= now ? Math.max(0, Math.ceil((last + 180000 - now) / 1000)) : 0;
const canonical = (value) => JSON.stringify(value, (_, v) => v && !Array.isArray(v) && typeof v === "object" ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v);
const comparable = (d) => ({ all: d.all.map(({ i, ...o }) => o).sort((a, b) => a.u.localeCompare(b.u)), multi: [...d.multi].sort((a, b) => a.v.localeCompare(b.v)), unique: [...d.unique].sort((a, b) => a.v.localeCompare(b.v)), errors: [...d.errors].sort((a, b) => a.u.localeCompare(b.u)) });
export const sameSnapshot = (a, b) => validSnapshot(a) && validSnapshot(b) && canonical(comparable(a)) === canonical(comparable(b));
