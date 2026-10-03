import * as maplibregl from "https://unpkg.com/maplibre-gl@6.11.1/dist/maplibre-gl.mjs";
document.addEventListener("DOMContentLoaded", () => {
  const $ = document.getElementById.bind(document);
  const ce = (t, c, x) => Object.assign(document.createElement(t), { className: c || "", textContent: x ?? "" });
  const ld = $("loading"), er = $("error-list"), el = $("establishment-list"), ml = $("shared-left-list"), ul = $("shared-right-list");
  const show = (v) => (ld.style.display = v ? "flex" : "none");
  const msg = (s) => (ld.firstElementChild.textContent = s);
  const ent = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const esc = (s) => String(s).replace(/[&<>"']/g, (m) => ent[m]);
  const tidy = (s) => typeof s == "string" && s.trim() ? s.trim() : "";
  const num = Number.isFinite;
  const valid = (p) => Array.isArray(p) && p.length > 1 && num(p[0]) && num(p[1]);
  const pos = (e) => e.type == "node" ? [e.lon, e.lat] : [e.center?.lon, e.center?.lat];
  const ok = (d) => d && typeof d == "object" && !d.remark && !d.error && Array.isArray(d.elements);
  const json = async (u) => {
    const k = "overpass:" + u;
    let c;
    try { c = JSON.parse(localStorage.getItem(k)); } catch {}
    if (c && ok(c.d) && Date.now() - c.t < 60000) return c.d;
    const r = await fetch(u);
    if (!r.ok) throw new Error(`Overpass HTTP ${r.status} ${r.statusText}`);
    const d = await r.json();
    if (!ok(d)) throw new Error(d?.remark || d?.error || "Resposta invàlida d'Overpass");
    try { localStorage.setItem(k, JSON.stringify({ t: Date.now(), d })); } catch {}
    return d;
  };
  const OP = "https://overpass-api.de/api/interpreter?data=";
  const Q = '[out:json][timeout:32][maxsize:16Mi];nwr[cuisine~"(^|;| )catal",i];out qt tags center;';
  const IMG = "./MapMarker.png";
  const isCatalan = (e) => /(^|;| )catalan( |;|$)/.test(tidy(e?.tags?.cuisine));
  const map = new maplibregl.Map({ container: "map", style: "https://tiles.openfreemap.org/styles/bright", center: [1.6, 41.6], zoom: 8, minZoom: 0, maxZoom: 18, renderWorldCopies: false, attributionControl: false });
  const pop = new maplibregl.Popup({ closeButton: true, closeOnClick: false, maxWidth: "520px", offset: 38 });
  const markers = {};
  let screen = {}, all = [], filter = "", selected = null;
  map.addControl(new maplibregl.NavigationControl({ showCompass: true }), "top-left");
  map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
  const rm = (s) => document.querySelectorAll(s).forEach((e) => e.classList.remove("selected"));
  const clr = () => rm("#shared-left-list li.selected,#shared-right-list li.selected,#establishment-list li.selected,#error-list li.selected");
  const clrN = () => rm("#establishment-list li.selected");
  const blur = (v) => $("map").classList.toggle("blur-map", !!v);
  const href = (t, id) => `https://www.openstreetmap.org/${t}/${id}`;
  const rows = (m) => [...m].map(([v, c]) => ({ v, c })).sort((a, b) => b.c - a.c || a.v.localeCompare(b.v));
  const tags = (t) => Object.entries(t || {}).sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => {
    v = Array.isArray(v) ? v.join("; ") : v;
    const p = k == "amenity" || k == "cuisine" ? " tag-priority" : "";
    return `<div class="tag${p}"><b>${esc(k)}</b><span class="v" title="${esc(v)}">${esc(v)}</span></div>`;
  }).join("");
  const card = (o) => `<div class="popup-card"><div class="popup-head"><h3>${esc(o.n)}</h3><a class="mobile-osm-btn" href="${o.u}" target="_blank" rel="noopener">OSM ↗</a></div><div class="tag-list">${tags(o.t)}</div><a class="edit-btn" href="${o.u}" target="_blank" rel="noopener">Veure a OSM</a></div>`;
  const usesName = (v) => typeof v == "string" ? v == "name" || /^name[:_]/.test(v) || /\{name(?::[^}]+|_[^}]+)?\}/.test(v) : Array.isArray(v) ? v.some(usesName) : v && typeof v == "object" ? Object.values(v).some(usesName) : false;
  const catalanize = () => (map.getStyle()?.layers || []).forEach((l) => {
    const f = l.layout?.["text-field"];
    if (l.type != "symbol" || f == null || !usesName(f)) return;
    try { map.setLayoutProperty(l.id, "text-field", ["coalesce", ["get", "name:ca"], ["get", "name_ca"], ["get", "name"], ["get", "name:latin"], ["get", "name:en"]]); }
    catch (e) { console.warn(l.id, e); }
  });
  const reset = () => {
    if (selected != null) markers[selected]?.getElement().classList.remove("active");
    selected = null;
  };
  const activate = (o) => {
    reset();
    selected = o.i;
    markers[selected]?.getElement().classList.add("active");
  };
  const open = (p, h) => {
    if (!valid(p)) return;
    pop.setLngLat(p).setHTML(h).addTo(map);
    blur(1);
  };
  const select = (o, li, zoom) => {
    if (!o || !valid(o.p)) return;
    clrN();
    li?.classList.add("selected");
    activate(o);
    if (zoom) map.easeTo({ center: o.p, zoom: map.getMaxZoom(), duration: 450 });
    open(o.p, card(o));
  };
  const geo = (a) => ({ type: "FeatureCollection", features: a.map((o) => ({ type: "Feature", id: o.i, geometry: { type: "Point", coordinates: o.p }, properties: { idx: o.i } })) });
  const setPoints = (a) => {
    Object.values(screen).forEach((m) => m.remove());
    screen = {};
    map.getSource("pois")?.setData(geo(a));
  };
  const list = (p, a) => p.replaceChildren(...a.map(({ v, c }) => {
    const li = ce("li");
    li.dataset.v = v;
    li.append(ce("span", "badge", c), ce("span", "text", v));
    return li;
  }));
  const proc = (a) => Array.isArray(a) ? a.map((e) => {
    const t = e?.tags || {}, p = pos(e || {}), n = tidy(t.name), raw = tidy(t.cuisine) || "Sense etiqueta";
    return { n: n || "❌Sense nom❌", isU: !n, p: valid(p) ? p : null, u: href(e?.type || "", e?.id || ""), t, raw, vals: raw == "Sense etiqueta" ? [] : raw.split(";").map(tidy).filter(Boolean) };
  }).filter((o) => valid(o.p)).sort((a, b) => a.isU == b.isU ? a.n.localeCompare(b.n) : a.isU ? -1 : 1).map((o, i) => ({ ...o, i })) : [];
  const fitAll = (a) => {
    const b = a.reduce((b, o) => b.extend(o.p), new maplibregl.LngLatBounds());
    if (!b.isEmpty()) map.fitBounds(b, { padding: 60, maxZoom: 18, duration: 450 });
  };
  const clear = (restore = 1) => {
    reset();
    clr();
    filter = "";
    setPoints(all);
    pop.remove();
    blur();
    if (restore) fitAll(all);
  };
  const poi = (o) => {
    const e = ce("div", "poi-img"), i = ce("i");
    i.style.setProperty("--img", `url("${IMG}")`);
    e.appendChild(i);
    e.onclick = (ev) => {
      ev.stopPropagation();
      select(o, el.querySelector(`li[data-idx="${o.i}"]`));
    };
    return e;
  };
  const updateMarkers = () => {
    if (!map.getSource("pois") || !map.isSourceLoaded("pois")) return;
    const next = {};
    map.querySourceFeatures("pois").forEach((f) => {
      if (f.properties?.cluster) return;
      const idx = Number(f.properties?.idx), o = all[idx];
      if (!Number.isInteger(idx) || !o || !valid(o.p) || next[idx]) return;
      const marker = markers[idx] ||= new maplibregl.Marker({ element: poi(o), anchor: "center" }).setLngLat(o.p);
      marker.getElement().classList.toggle("active", idx === selected);
      next[idx] = marker;
      if (!screen[idx]) marker.addTo(map);
    });
    Object.keys(screen).forEach((i) => !next[i] && screen[i].remove());
    screen = next;
  };
  const addPois = () => {
    const cf = ["has", "point_count"];
    map.addSource("pois", { type: "geojson", data: geo([]), cluster: true, clusterMaxZoom: 17, clusterRadius: 50 });
    map.addLayer({ id: "clusters", type: "circle", source: "pois", filter: cf, paint: { "circle-color": "#f6d32d", "circle-radius": ["step", ["get", "point_count"], 20, 20, 24, 50, 29], "circle-stroke-color": "#315f76", "circle-stroke-width": 3 } });
    map.addLayer({ id: "cluster-count", type: "symbol", source: "pois", filter: cf, layout: { "text-field": "{point_count_abbreviated}", "text-font": ["Noto Sans Regular"], "text-size": 13, "text-allow-overlap": true, "text-ignore-placement": true }, paint: { "text-color": "#182027" } });
  };
  const closePopup = () => {
    reset();
    blur();
    clrN();
  };
  const filterBy = (li, mode, test) => {
    const v = li.dataset.v, key = mode + v;
    if (filter == key) return clear();
    clear(0);
    li.classList.add("selected");
    const a = all.filter((o) => test(o, v));
    filter = key;
    setPoints(a);
    fitAll(a);
  };
  el.onclick = (e) => {
    const li = e.target.closest("li[data-idx]");
    if (!li || !el.contains(li)) return;
    const o = all[Number(li.dataset.idx)];
    if (!o) return;
    if (!li.classList.contains("selected")) return select(o, li, 1);
    li.classList.remove("selected");
    reset();
    pop.remove();
    blur();
    fitAll(all);
  };
  const bindFilter = (p, mode, test) => p.onclick = (e) => {
    const li = e.target.closest("li[data-v]");
    if (li && p.contains(li)) filterBy(li, mode, test);
  };
  bindFilter(ml, "m:", (o, v) => o.raw == v);
  bindFilter(ul, "u:", (o, v) => o.vals.includes(v));
  er.onclick = (e) => {
    const li = e.target.closest("li[data-url]");
    if (!li || !er.contains(li)) return;
    rm("#error-list li.selected");
    li.classList.add("selected");
    window.open(li.dataset.url, "_blank", "noopener");
  };
  pop.on("close", closePopup);
  (async () => {
    show(1);
    msg("Iniciant mapa…");
    await new Promise((resolve) => map.once("load", resolve));
    catalanize();
    addPois();
    map.on("idle", updateMarkers);
    map.on("click", "clusters", async (e) => {
      const f = e.features?.[0], p = f?.geometry?.coordinates, id = f?.properties?.cluster_id;
      if (!valid(p) || id == null) return;
      const z = await map.getSource("pois")?.getClusterExpansionZoom(id);
      if (num(z)) map.easeTo({ center: p, zoom: z, duration: 450 });
    });
    map.on("mouseenter", "clusters", () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", "clusters", () => (map.getCanvas().style.cursor = ""));
    map.on("click", (e) => {
      if (map.queryRenderedFeatures(e.point, { layers: ["clusters"] }).length) return;
      pop.remove();
      closePopup();
    });
    msg("Descarregant…");
    const r = await json(OP + encodeURIComponent(Q)), good = [], bad = [];
    r.elements.forEach((e) => (isCatalan(e) ? good : bad).push(e));
    all = proc(good);
    $("list-title").textContent = `${all.length} establiments amb cuina catalana`;
    el.replaceChildren(...all.map((o) => {
      const li = ce("li", o.isU ? "undefined-name" : "", o.n);
      li.dataset.idx = o.i;
      return li;
    }));
    setPoints(all);
    fitAll(all);
    msg("Comptant valors…");
    const cnt = new Map(), ucnt = new Map();
    all.forEach(({ raw, vals }) => {
      cnt.set(raw, (cnt.get(raw) || 0) + 1);
      vals.forEach((v) => ucnt.set(v, (ucnt.get(v) || 0) + 1));
    });
    list(ml, rows(cnt));
    list(ul, rows(ucnt));
    msg("Comprovant possibles errors…");
    const errs = proc(bad).map((o) => ({ ...o, c: o.raw }));
    er.replaceChildren(...(errs.length ? errs.map(({ n, c, u }) => {
      const li = ce("li", "error-item", `${n} (${c})`);
      li.dataset.url = u;
      return li;
    }) : [ce("li", "no-click", "Sense errors. La cuina ben feta no té fronteres 🥳")]));
    show(0);
  })().catch((e) => {
    console.error(e);
    msg("Error");
    er.appendChild(ce("li", "error-item", "Error: " + (e?.message || String(e))));
    show(0);
  });
  const guide = document.querySelector(".guide"), summary = guide?.querySelector("summary");
  document.addEventListener("click", (e) => guide && !guide.contains(e.target) && (guide.open = false));
  summary?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    guide.open = !guide.open;
  });
  document.addEventListener("keydown", (e) => e.key == "Escape" && (guide.open = false));
});
