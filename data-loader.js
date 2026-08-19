const KIT_FILES = [ "exemplars.json", "ea_ratings.json", "generator_constants.json", "pool.json", "pipelines.json", "heads_complete_by_skintone.json", "archetypes.csv", "stats.json", "abilities.json" ];

window.KIT_DATA = (async () => {
    const out = {};
    for (const f of KIT_FILES) {
        const res = await fetch(chrome.runtime.getURL("data/" + f));
        if (!res.ok) throw new Error(`data/${f}: HTTP ${res.status}`);
        out[f] = f.endsWith(".json") ? await res.json() : await res.text();
    }
    return out;
})();

window.KIT_DATA.then(d => {
    const counts = [ `${d["exemplars.json"].length} archetype molds`, `${d["pool.json"].players.length} players`, `${d["pipelines.json"].pipelines.length} pipelines`, `${Object.keys(d["heads_complete_by_skintone.json"]).length} tone buckets` ].join(" / ");
    console.log(`[CFB27 Roster Bridge] ${RB_VERSION} — ${counts}`);
    window.D = {
        ...d["generator_constants.json"],
        headsCompleteByTone: d["heads_complete_by_skintone.json"],
        exemplars: d["exemplars.json"]
    };
    window.initCFB27Roster?.({
        pool: d["pool.json"],
        pipelines: d["pipelines.json"],
        stats: d["stats.json"],
        build: {
            id: RB_VERSION
        },
        constants: window.D
    });
    window.initCFB27PoolBrowser?.();
    window.initCFB27TeamColors?.();
    window.initCFB27TeamLogos?.();
    window.initCFB27UsedRegistry?.();
    const tb = window.initCFB27TBRatings?.(d["ea_ratings.json"]) || null;
    window.initCFB27Predict?.({
        constants: window.D,
        tb: tb
    });
    window.initCFB27Abilities?.(d["abilities.json"]);
    window.initCFB27Generator?.({
        constants: window.D
    });
    window.initCFB27Dashboard?.({
        stats: d["stats.json"]
    });
    const el = document.getElementById("loadStatus");
    if (el) {
        el.style.display = "none";
    }
    const tag = document.getElementById("verTag");
    if (tag) tag.textContent = ` · ${RB_VERSION}`;
}, err => {
    console.error(`[CFB27 Roster Bridge] ${RB_VERSION} — data load FAILED:`, err);
    const el = document.getElementById("loadStatus");
    if (el) {
        el.textContent = `${RB_VERSION} — data load FAILED: ${err.message}`;
        el.classList.add("bad");
    }
});
