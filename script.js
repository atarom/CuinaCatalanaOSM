import * as maplibregl from "https://unpkg.com/maplibre-gl@6.15.0/dist/maplibre-gl.mjs";
import { validHistory, validSnapshot } from "./data-client.mjs";
document.addEventListener("DOMContentLoaded", () => {
  const mobileSections = [...document.querySelectorAll(".mobile-section")];
  const mobileTabs = [...document.querySelectorAll(".mobile-tab")];
  const mobileLayout = window.matchMedia("(max-width: 900px)");
  let activeMobileSection = "names";
  const showMobileSection = (id) => {
    activeMobileSection = id;
    mobileSections.forEach((section) => section.open = section.dataset.mobileSection === id);
    mobileTabs.forEach((tab) => tab.setAttribute("aria-pressed", String(tab.dataset.mobileTarget === id)));
  };
  const syncMobileSections = () => {
    if (mobileLayout.matches) showMobileSection(activeMobileSection);
    else mobileSections.forEach((section) => section.open = true);
  };
  mobileTabs.forEach((tab) => tab.addEventListener("click", () => showMobileSection(tab.dataset.mobileTarget)));
  mobileSections.forEach((section) => section.addEventListener("toggle", () => {
    if (!mobileLayout.matches && !section.open) section.open = true;
  }));
  syncMobileSections();
  mobileLayout.addEventListener("change", syncMobileSections);
  const $ = document.getElementById.bind(document);
  const ce = (t, c, x) => Object.assign(document.createElement(t), { className: c || "", textContent: x ?? "" });
  const ld = $("loading"), er = $("error-list"), el = $("establishment-list"), ml = $("shared-left-list"), ul = $("shared-right-list"), age = $("data-age");
  const show = (v) => (ld.style.display = v ? "flex" : "none");
  const msg = (s) => (ld.firstElementChild.textContent = s);
  const ent = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const esc = (s) => String(s).replace(/[&<>"']/g, (m) => ent[m]);
  const num = Number.isFinite;
  const valid = (p) => Array.isArray(p) && p.length > 1 && num(p[0]) && num(p[1]);
  const IMG = "./MapMarker.png";
  const map = new maplibregl.Map({ container: "map", style: "https://tiles.openfreemap.org/styles/bright", center: [1.6, 41.6], zoom: 8, minZoom: 0, maxZoom: 18, renderWorldCopies: false, attributionControl: false });
  const pop = new maplibregl.Popup({ closeButton: true, closeOnClick: false, maxWidth: "520px", offset: 90 });
  const markers = {};
  let screen = {}, all = [], filter = "", selected = null;
  map.addControl(new maplibregl.NavigationControl({ showCompass: true }), "top-left");
  map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
  const rm = (s) => document.querySelectorAll(s).forEach((e) => e.classList.remove("selected"));
  const clr = () => rm("#shared-left-list li.selected,#shared-right-list li.selected,#establishment-list li.selected,#error-list li.selected");
  const clrN = () => rm("#establishment-list li.selected");
  const blur = (v) => $("map").classList.toggle("blur-map", !!v);
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
      const marker = markers[idx] ||= new maplibregl.Marker({ element: poi(o), anchor: "bottom" }).setLngLat(o.p);
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
  const render = (data) => {
    if (!validSnapshot(data)) throw new Error("Dades publicades invàlides");
    pop.remove();
    reset();
    clr();
    filter = "";
    blur();
    Object.values(markers).forEach((m) => m.remove());
    Object.keys(markers).forEach((i) => delete markers[i]);
    screen = {};
    all = data.all;
    $("list-title").textContent = `${all.length} establiments amb cuina catalana`;
    el.replaceChildren(...all.map((o) => {
      const li = ce("li", o.isU ? "undefined-name" : "", o.n);
      li.dataset.idx = o.i;
      return li;
    }));
    list(ml, data.multi);
    list(ul, data.unique);
    er.replaceChildren(...(data.errors.length ? data.errors.map(({ n, c, u }) => {
      const li = ce("li", "error-item", `${n} (${c})`);
      li.dataset.url = u;
      return li;
    }) : [ce("li", "no-click", "Sense errors. La cuina ben feta no té fronteres 🥳")]));
    setPoints(all);
    fitAll(all);
    const time = new Date(data.updatedAt);
    age.textContent = `Dades comprovades: ${time.toLocaleString("ca-ES", { dateStyle: "short", timeStyle: "short" })}`;
    age.title = `Consulta: ${time.toISOString()}`;
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
    msg("Iniciant mapa i descarregant dades…");
    const snapshotRequest = fetch("./snapshot.json", { cache: "no-cache" }).then(async (r) => {
      if (!r.ok) throw new Error(`JSON HTTP ${r.status}`);
      const data = await r.json();
      if (!validSnapshot(data)) throw new Error("Dades publicades invàlides");
      return data;
    });
    const mapReady = new Promise((resolve) => map.once("load", () => {
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
      resolve();
    }));
    const [snapshotResult, mapResult] = await Promise.allSettled([snapshotRequest, mapReady]);
    if (mapResult.status === "rejected") throw mapResult.reason;
    if (snapshotResult.status === "rejected") throw snapshotResult.reason;
    render(snapshotResult.value);
    show(0);
  })().catch((e) => {
    console.error(e);
    msg("Error");
    age.textContent = "No s'han pogut carregar les dades";
    age.title = e?.message || String(e);
    er.appendChild(ce("li", "error-item", "Error: " + (e?.message || String(e))));
    show(0);
  });
  const tools = [...document.querySelectorAll(".guide")];
  const historyPanel = document.querySelector(".guide.history"), historyContent = $("history-content");
  let historyLoaded = false, historyLoading = false;
  const displayHistory = (data) => {
    historyContent.replaceChildren();
    if (!data.events.length) {
      historyContent.textContent = "Encara no hi ha altes ni baixes registrades.";
      return;
    }
    let date = "", listElement;
    for (const event of data.events) {
      const day = new Date(event.at).toLocaleDateString("ca-ES", { year: "numeric", month: "long", day: "numeric" });
      if (day !== date) {
        date = day;
        historyContent.appendChild(ce("h4", "history-day", day));
        listElement = ce("ul", "history-list");
        historyContent.appendChild(listElement);
      }
      const li = ce("li", "history-item"), mark = ce("span", `history-mark ${event.action}`, event.action === "added" ? "+" : "−");
      const link = ce("a", "", event.name);
      link.href = event.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      const detail = ce("small", "", `${event.url.split("/").slice(-2).join("/")} · ${event.cuisine}`);
      li.append(mark, link, detail);
      listElement.appendChild(li);
    }
  };
  const loadHistory = async () => {
    if (historyLoaded || historyLoading) return;
    historyLoading = true;
    historyContent.textContent = "Carregant historial…";
    try {
      const response = await fetch("./history.json", { cache: "no-cache" });
      if (!response.ok) throw new Error(`Historial HTTP ${response.status}`);
      const data = await response.json();
      if (!validHistory(data)) throw new Error("Historial invàlid");
      displayHistory(data);
      historyLoaded = true;
    } catch (e) {
      console.error(e);
      historyContent.textContent = "No s'ha pogut carregar l'historial.";
    } finally {
      historyLoading = false;
    }
  };
  tools.forEach((panel) => panel.querySelector("summary")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const opening = !panel.open;
    tools.forEach((item) => (item.open = false));
    panel.open = opening;
    if (opening && panel === historyPanel) loadHistory();
  }));
  document.addEventListener("click", (e) => tools.forEach((panel) => !panel.contains(e.target) && (panel.open = false)));
  document.addEventListener("keydown", (e) => e.key === "Escape" && tools.forEach((panel) => (panel.open = false)));
});
