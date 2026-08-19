function initCFB27Dashboard(data) {
    const STATS = data.stats || null;
    const basis = () => typeof CFB27_CONFIG !== "undefined" && CFB27_CONFIG.deficitBasis === "full" ? "full" : "usable";
    function buildCoverageModel(stats, b) {
        if (!stats || !Array.isArray(stats.pipelines)) return null;
        const rows = stats.pipelines.map(p => ({
            id: p.id,
            name: p.name,
            tier: p.tier,
            usable: p.usable,
            full: p.full,
            deficit: p[b].gap > 0
        }));
        return {
            basis: b,
            rows: rows,
            deficits: rows.filter(r => r.deficit).length,
            photo: stats.photoCoverage,
            tones: stats.tones,
            depth: stats.depth,
            collected: stats.collected,
            usable: stats.usable,
            placed: stats.placed,
            unplaced: stats.unplaced
        };
    }
    let sortKey = "gap";
    let sortDir = -1;
    const sorters = {
        name: r => r.name,
        tier: r => r.tier,
        have: r => r[basis()].have,
        target: r => r[basis()].target,
        gap: r => r[basis()].gap
    };
    const fmtGap = gap => gap > 0 ? `<span class="gapbad">−${gap}</span>` : `<span class="gapok">+${-gap}</span>`;
    function render() {
        const body = document.getElementById?.("dashBody");
        if (!body) return;
        const model = buildCoverageModel(STATS, basis());
        if (!model) {
            body.innerHTML = '<div class="muted small" style="padding:10px 0">No stats.json in the kit ' + "— re-run the ingest recipe (pool/validate_pool.py now writes it).</div>";
            return;
        }
        const key = sorters[sortKey] ? sortKey : "gap";
        const rows = [ ...model.rows ].sort((a, b) => {
            const x = sorters[key](a), y = sorters[key](b);
            return (x < y ? -1 : x > y ? 1 : 0) * sortDir;
        });
        const arrow = k => k === key ? sortDir < 0 ? " ▾" : " ▴" : "";
        const th = (k, label, title) => `<th class="dashsort" data-key="${k}" title="${title}">${label}${arrow(k)}</th>`;
        const acting = model.basis, other = acting === "usable" ? "full" : "usable";
        const pipeTable = `<table class="dashtable"><thead><tr>` + th("name", "Pipeline", "The 42 recruiting pipelines") + th("tier", "Tier", "Talent tier from the game’s own ranking") + th("have", `${acting} have`, "Players placed here on the acting basis") + th("target", `${acting} target`, "Talent-proportional share of the placed pool") + th("gap", `${acting} gap`, "target − have · red = the pool is thin here") + `<th title="The other basis, so the number is never ambiguous">${other} have / target / gap</th>` + `</tr></thead><tbody>` + rows.map(r => {
            const a = r[acting], o = r[other];
            return `<tr${r.deficit ? ' class="dashdef"' : ""}>` + `<td>${r.name}</td><td>${r.tier}</td>` + `<td class="num">${a.have}</td><td class="num">${a.target}</td>` + `<td class="num">${fmtGap(a.gap)}</td>` + `<td class="num muted">${o.have} / ${o.target} / ${o.gap > 0 ? "−" + o.gap : "+" + -o.gap}</td>` + `</tr>`;
        }).join("") + `</tbody></table>`;
        const toneMax = Math.max(1, ...Object.values(model.tones));
        const toneBars = `<div class="dashtones">` + Object.entries(model.tones).map(([t, n]) => `<div class="dashtone" title="tone ${t}: ${n} players">` + `<div class="dashtonebar" style="height:${Math.max(2, Math.round(34 * n / toneMax))}px"></div>` + `<span class="muted small">${t}</span><span class="small">${n}</span></div>`).join("") + `</div>`;
        const depthRow = (label, d) => `<tr><td>${label}</td>` + Object.values(d.byPos).map(n => `<td class="num">${n}</td>`).join("") + `<td class="num">${d.rosters}</td></tr>`;
        const depthTable = `<table class="dashtable"><thead><tr><th>Basis</th>` + Object.keys(model.depth.usable.byPos).map(p => `<th>${p}</th>`).join("") + `<th title="Complete 85-man rosters this basis can fill">Rosters</th></tr></thead><tbody>` + depthRow("usable", model.depth.usable) + depthRow("full", model.depth.full) + `</tbody></table>`;
        body.innerHTML = `<div class="dashmeta muted small">` + `<b>${model.usable}</b> usable (tone-filled) of <b>${model.collected}</b> in the pool · ` + `photo coverage <b>${model.photo.pct}%</b> · ` + `placed ${model.placed[acting]} on the ${acting} basis (${model.unplaced[acting]} in no pipeline) · ` + `acting basis: <b>${acting}</b> (config.js — both shown either way)</div>` + `<div class="dashh">Per-pipeline supply vs talent-proportional target ` + `<span class="muted small">click a column to sort · red rows are deficits on the ${acting} basis</span></div>` + pipeTable + `<div class="dashh">Skin-tone distribution <span class="muted small">usable players per tone 1–8</span></div>` + toneBars + `<div class="dashh">Per-position depth</div>` + depthTable;
        for (const el of body.querySelectorAll(".dashsort")) {
            el.addEventListener("click", () => {
                const k = el.dataset.key;
                if (k === sortKey) sortDir = -sortDir; else {
                    sortKey = k;
                    sortDir = k === "name" || k === "tier" ? 1 : -1;
                }
                render();
            });
        }
    }
    if (typeof document !== "undefined") {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", render);
        } else {
            render();
        }
    }
    window.CFB27Dashboard = {
        buildCoverageModel: buildCoverageModel,
        render: render,
        STATS: STATS
    };
}

if (typeof window !== "undefined") window.initCFB27Dashboard = initCFB27Dashboard;
