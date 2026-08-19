(function() {
    const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    }[c]));
    const CLASSES = [ "FR", "SO", "JR", "SR" ];
    const DEV_NAMES = [ "Normal", "Impact", "Star", "Elite" ];
    const el = id => document.getElementById(id);
    const POSITION_ORDER = [ "QB", "HB", "FB", "WR", "TE", "LT", "LG", "C", "RG", "RT", "LE", "RE", "DT", "LOLB", "MLB", "ROLB", "CB", "FS", "SS", "K", "P" ];
    const posRank = pos => {
        const i = POSITION_ORDER.indexOf(pos);
        return i === -1 ? POSITION_ORDER.length : i;
    };
    const groupRank = g => {
        const own = posRank(g);
        if (own < POSITION_ORDER.length) return own;
        const ranks = Object.entries(window.D?.positionGroup || {}).filter(([, grp]) => grp === g).map(([pos]) => posRank(pos));
        return ranks.length ? Math.min(...ranks) : POSITION_ORDER.length;
    };
    const STATE_ABBRS = [ "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY" ];
    const US_STATE_ABBR = (() => {
        const m = {};
        STATE_ABBRS.forEach(a => {
            m[a] = a;
        });
        [ "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware", "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota", "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming" ].forEach((n, i) => {
            m[n.toUpperCase()] = STATE_ABBRS[i];
        });
        [ "D.C.", "DISTRICT OF COLUMBIA", "WASHINGTON D.C.", "WASHINGTON DC" ].forEach(k => {
            m[k] = "DC";
        });
        m.DC = "DC";
        return m;
    })();
    function hometownOf(p) {
        const town = String(p.PLYR_HOME_TOWN ?? "").trim();
        if (!town) return "—";
        const cut = town.lastIndexOf(",");
        if (cut !== -1) {
            const st = US_STATE_ABBR[town.slice(cut + 1).trim().toUpperCase()];
            return st ? `${town.slice(0, cut).trim()}, ${st}` : town;
        }
        const st = STATE_ABBRS[parseInt(p.PLYR_HOME_STATE, 10)];
        return st ? `${town}, ${st}` : town;
    }
    const posOf = p => (window.D?.positionCodes || {})[String(parseInt(p.PLYR_POSITION, 10))] || "?";
    function htWtOf(p) {
        const h = parseInt(p.PLYR_HEIGHT, 10);
        const w = parseInt(p.PLYR_WEIGHT, 10);
        const ht = Number.isNaN(h) ? null : `${Math.floor(h / 12)}'${h % 12}"`;
        const wt = Number.isNaN(w) ? null : `${w + 160} lbs`;
        return [ ht, wt ].filter(Boolean).join(" · ");
    }
    function toastMsg(msg, kind) {
        const t = el("toast");
        if (!t) return;
        t.textContent = msg;
        t.className = "toast show" + (kind === "warn" ? " warn" : kind ? " bad" : "");
        setTimeout(() => {
            t.className = "toast";
        }, kind === "warn" ? 5e3 : 3200);
    }
    const ptIdOf = (g, name) => {
        const key = (window.D?.archetypeOvrKey || {})[g]?.[name];
        const id = key != null ? (window.D?.playerTypeIds || {})[key] : undefined;
        return id == null ? null : id;
    };
    function ptNameOf(p, pos) {
        const g = archGroupOf(pos);
        const id = parseInt(p.PLYR_PLAYERTYPE, 10);
        if (Number.isNaN(id)) return null;
        for (const n of (window.D?.archetypesByGroup || {})[g] || []) if (ptIdOf(g, n) === id) return n;
        return null;
    }
    const archGroupOf = pos => (window.D?.positionGroup || {})[pos] || pos;
    function archCell(pid, p, pos) {
        const names = (window.D?.archetypesByGroup || {})[archGroupOf(pos)] || [];
        const built = typeof ASSIGN !== "undefined" ? ASSIGN[pid] : null;
        const cur = ptNameOf(p, pos) || (built && names.includes(built) ? built : null);
        if (!names.length) return "<td>—</td>";
        return `<td><select class="sec" data-arch="${esc(pid)}" title="Archetype — the label Team Builder lists for him (the file's own field). Picking another rebuilds his attributes to that mold from a real player of that archetype AND writes the label, holding the rating TB will show; the file OVR may shift a point or two to make that true. Generate re-deals archetypes with the ratings.">${names.map(n => `<option value="${esc(n)}"${n === cur ? " selected" : ""}>${esc(n)}</option>`).join("")}</select></td>`;
    }
    function setArchetype(pid, archetype) {
        const G = window.CFB27Generator, D = window.D, P = window.CFB27Predict;
        const p = WORK?.teamData?.roster?.playerData?.[pid];
        if (!G?.generateAttributes || !D || !p) return null;
        const pos = posOf(p);
        const g = archGroupOf(pos);
        const from = parseInt(p.PLYR_OVERALLRATING, 10) || 0;
        const dev = (D.devTraitCodes || {})[String(parseInt(p.PLYR_TRAITDEVELOPMENT, 10) || 0)];
        const exact = !!G.generateAttributes(g, archetype, dev, from).meta?.exact;
        const raw = RAW?.teamData?.roster?.playerData?.[pid];
        const baseOvr = raw ? parseInt(raw.PLYR_OVERALLRATING, 10) : NaN;
        const want = P?.predictPlayer ? P.predictPlayer(p, null) : null;
        const rebuildAt = t => {
            if (raw) for (const key of Object.values(D.attrToJson)) if (key in raw) p[key] = raw[key];
            const {attrs: attrs} = G.generateAttributes(g, archetype, dev, t);
            if (G.shiftUncovered && !Number.isNaN(baseOvr)) G.shiftUncovered(p, attrs, baseOvr, t);
            for (const [a, v] of Object.entries(attrs)) {
                const key = D.attrToJson[a];
                if (key && key in p) p[key] = String(v);
            }
            p.PLYR_OVERALLRATING = String(t);
        };
        rebuildAt(from);
        let drift = 0, target = from;
        if (want != null) {
            let t = from, bestT = from, bestErr = Infinity;
            const seen = new Set([ t ]);
            for (let step = 0; step < 24; step++) {
                const got = P.predictPlayer(p, null);
                if (got == null) break;
                const err = want - got;
                if (Math.abs(err) < Math.abs(bestErr)) {
                    bestErr = err;
                    bestT = t;
                }
                if (err === 0) break;
                const next = Math.max(40, Math.min(99, t + (err > 0 ? 1 : -1)));
                if (next === t || seen.has(next)) break;
                seen.add(next);
                t = next;
                rebuildAt(t);
            }
            if (t !== bestT) rebuildAt(bestT);
            drift = bestErr === Infinity ? 0 : bestErr;
            target = bestT;
        }
        const ptId = ptIdOf(g, archetype);
        if (ptId != null) p.PLYR_PLAYERTYPE = String(ptId);
        if (typeof ASSIGN !== "undefined") ASSIGN[pid] = archetype;
        return {
            exact: exact,
            want: want,
            drift: drift,
            from: from,
            target: target,
            ptId: ptId
        };
    }
    const UNGROUPED = new Set([ "LT", "LG", "C", "RG", "RT", "FS", "SS" ]);
    const groupOf = pos => UNGROUPED.has(pos) ? pos : (window.D?.positionGroup || {})[pos] || pos;
    function classOf(p) {
        const cls = CLASSES[+p.PLYR_SCHOOLYEAR] || "?";
        return Number(p.PLYR_REDSHIRTED || 0) !== 0 ? `RS ${cls}` : cls;
    }
    let SORT = null;
    function render() {
        const body = el("tbody");
        if (!body || typeof WORK === "undefined" || !WORK) return;
        const pd = WORK.teamData?.roster?.playerData || {};
        const rows = Object.entries(pd).map(([pid, p]) => {
            const pos = posOf(p);
            const ovr = parseInt(p.PLYR_OVERALLRATING, 10) || 0;
            const pred = window.CFB27Predict?.predictPlayer?.(p, null);
            const home = hometownOf(p);
            const cut = home.lastIndexOf(",");
            const homeKey = home === "—" ? "￿" : cut !== -1 ? `${home.slice(cut + 1).trim()}|${home.slice(0, cut)}` : `￾${home}`;
            return {
                pid: pid,
                p: p,
                pos: pos,
                pred: pred,
                home: home,
                homeKey: homeKey,
                group: groupOf(pos),
                rank: posRank(pos),
                name: `${p.PLYR_FIRSTNAME} ${p.PLYR_LASTNAME}`,
                ovr: ovr,
                shownOvr: pred ?? ovr
            };
        });
        const filter = el("filterGroup");
        if (filter && !filter.options.length) {
            const groups = [ ...new Set(rows.map(r => r.group)) ].sort((a, b) => groupRank(a) - groupRank(b));
            filter.innerHTML = '<option value="">all positions</option>' + groups.map(g => `<option value="${esc(g)}">${esc(g)}</option>`).join("");
        }
        const q = (el("search")?.value || "").trim().toLowerCase();
        const group = filter?.value || "";
        const shown = rows.filter(r => (!q || r.name.toLowerCase().includes(q)) && (!group || r.group === group));
        const defaultCmp = (a, b) => a.rank - b.rank || b.shownOvr - a.shownOvr;
        if (!SORT) shown.sort(defaultCmp); else {
            const val = {
                ovr: r => r.shownOvr,
                class: r => +r.p.PLYR_SCHOOLYEAR || 0,
                dev: r => parseInt(r.p.PLYR_TRAITDEVELOPMENT, 10) || 0,
                stars: r => {
                    const gc = parseInt(r.p.GC_PLYR_PROSPECTSTARRATING, 10);
                    return gc >= 5 || Number.isNaN(gc) ? 0 : gc + 1;
                }
            }[SORT.key] || (() => 0);
            shown.sort((a, b) => (SORT.key === "home" ? SORT.dir * a.homeKey.localeCompare(b.homeKey) : SORT.dir * (val(b) - val(a))) || defaultCmp(a, b));
        }
        body.innerHTML = shown.map(({pid: pid, p: p, pos: pos, name: name, ovr: ovr, pred: pred, home: home}) => {
            const ovrCell = pred == null ? `<span title="file overall: ${ovr || "—"}">${ovr || "—"}</span>` : `<input type="number" class="sec" data-ovr="${esc(pid)}" min="40" max="99" step="1" value="${pred}"\n             style="width:56px;min-width:0;padding:4px 6px"\n             title="The rating TB will show (file overall: ${ovr || "—"}). Type a target — his attributes scale in proportion to his archetype's weights until TB will show it; an out-of-reach target lands on the closest and says so.">`;
            return `\n      <tr>\n        <td class="num">${esc(p.PLYR_JERSEYNUM ?? "")}</td>\n        <td class="pname" data-edit="${esc(pid)}" title="Edit this player's attributes">${esc(name)}${(hw => hw ? `<div class="muted small" style="font-size:11px">${esc(hw)}</div>` : "")(htWtOf(p))}</td>\n        <td><span class="pos">${esc(pos)}</span></td>\n        <td class="num">${ovrCell}</td>\n        ${archCell(pid, p, pos)}\n        <td>${esc(classOf(p))}</td>\n        <td><select class="sec" data-dev="${esc(pid)}" title="Dev trait — cosmetic, never moves the team overall">${DEV_NAMES.map((n, i) => `<option value="${i}"${(parseInt(p.PLYR_TRAITDEVELOPMENT, 10) || 0) === i ? " selected" : ""}>${n}</option>`).join("")}</select></td>\n        <td><select class="sec" data-stars="${esc(pid)}" title="High-school star rating as Team Builder displays it — cosmetic; applied through TB's own UI via 'Apply ★ in TB' (trusted clicks, so what you pick is what TB shows). '—' = no stars.">${[ "—", 1, 2, 3, 4, 5 ].map(s => {
                const gc = parseInt(p.GC_PLYR_PROSPECTSTARRATING, 10);
                const v = s === "—" ? 0 : s;
                const sel = s === "—" ? gc >= 5 || Number.isNaN(gc) : gc === v - 1;
                return `<option value="${v}"${sel ? " selected" : ""}>${s === "—" ? "—" : "★".repeat(s)}</option>`;
            }).join("")}</select></td>\n        <td>${esc(home)}</td>\n        <td class="num"><button class="sec reroll" data-swappick="${esc(pid)}"\n          title="Swap this player out — position is fixed by the slot; pick a replacement by pipeline and search, or take a random re-roll. Only who he is changes; the slot's ratings stay, everyone else is untouched.">⇄</button></td>\n      </tr>`;
        }).join("");
        document.querySelectorAll?.("th[data-sortcol] .sortmark")?.forEach(m => {
            const k = m.parentElement.dataset.sortcol;
            const active = SORT ? SORT.key === k : k === "pos";
            m.textContent = active ? SORT && SORT.dir === -1 ? " ▲" : " ▼" : "";
        });
        const count = el("count");
        if (count) count.textContent = `${shown.length} of ${rows.length}`;
        const box = el("rosterBox");
        if (box) box.style.display = "";
    }
    window.CFB27Table = {
        render: render,
        reroll: reroll
    };
    function reroll(pid) {
        const R = window.CFB27Roster;
        if (!R?.swapSlots) return;
        const r = R.swapSlots({
            [pid]: null
        }, {
            usedKeys: window.CFB27UsedRegistry?.excludedKeys?.()
        });
        const toast = (msg, bad) => {
            const t = el("toast");
            if (!t) return;
            t.textContent = msg;
            t.className = "toast show" + (bad ? " bad" : "");
            setTimeout(() => {
                t.className = "toast";
            }, 2600);
        };
        if (!r || r.error) return toast(r?.error || "No roster loaded.", true);
        if (r.rejected.length) return toast(`Swap failed: ${r.rejected[0].reason}`, true);
        const a = r.applied[0];
        window.CFB27PoolBrowser?.clearPin?.(pid);
        render();
        if (typeof changeBlip === "function") changeBlip();
        console.info(`[CFB27] re-rolled ${a.pos}: ${a.out} → ${a.in}`);
        toast(`${a.pos}: ${a.out} → ${a.in}`);
    }
    function openAttrEditor(pid) {
        const D = window.D, P = window.CFB27Predict;
        const p = WORK?.teamData?.roster?.playerData?.[pid];
        const m = el("modal"), title = el("modalTitle"), sub = el("modalSub"), body = el("modalBody");
        if (!D || !p || !m || !title || !body) return;
        const pos = posOf(p);
        const lo = D.attrMin ?? 5, hi = D.attrMax ?? 99;
        const fields = Object.entries(D.attrToJson).filter(([, key]) => key in p);
        title.textContent = `${p.PLYR_FIRSTNAME} ${p.PLYR_LASTNAME} — ${pos}, attribute editor`;
        const scorable = P?.predictPlayer?.(p, null) != null;
        if (sub) sub.innerHTML = `TB will show <b id="attrPred">—</b>${scorable ? ` — or type a target <input id="attrOvr" type="number" min="40" max="99" step="1"\n           style="width:56px;min-width:0;padding:2px 6px"\n           title="Scale his attributes toward this overall, in proportion to his archetype's weights — the fields that move light up. Apply writes them; closing discards. The file overall (${esc(p.PLYR_OVERALLRATING)}) stays as is — the game re-rates from attributes — and a Generate or archetype swap rebuilds the sheet over hand edits.">` : ""}`;
        const wk = P?.weightedAttrKeys?.(p);
        const weighted = new Set(wk?.keys || []);
        const byKey = new Map(fields.map(([ab, key]) => [ key, ab ]));
        const posFields = (wk?.keys || []).filter(k => byKey.has(k)).map(k => [ byKey.get(k), k ]);
        const restFields = fields.filter(([, key]) => !weighted.has(key));
        const grid = fs => `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:8px 10px">${fs.map(([ab, key]) => `<label class="f" title="${esc(key)}">${esc(ab)}\n        <input type="number" data-attrkey="${esc(key)}" min="${lo}" max="${hi}" step="1"\n          value="${esc(parseInt(p[key], 10))}" style="min-width:0;padding:5px 7px"></label>`).join("")}</div>`;
        const A = window.CFB27Abilities;
        const fb = WORK.teamData?.frostbiteData;
        const abName = key => byKey.get(key) || key.replace("PLYR_", "");
        let abPools = null, TIERS = null;
        let cardHtml = "";
        if (A?.pools && fb) {
            const ca = fb.characterAbilities?.[pid] || {
                0: [],
                1: []
            };
            const pools = abPools = A.pools(p);
            TIERS = A.tierNames;
            const cur0 = ca["0"] || [], cur1 = ca["1"] || [];
            const gc = parseInt(p.GC_PLYR_PROSPECTSTARRATING, 10);
            const curStars = gc >= 5 || Number.isNaN(gc) ? 0 : gc + 1;
            const mentals = (D.mentalAttrs || []).filter(ab => D.attrToJson[ab] in p).map(ab => `${esc(ab)} <b>${esc(parseInt(p[D.attrToJson[ab]], 10))}</b>`).join(" · ");
            const physRows = pools.physical.map((a, i) => {
                const cur = cur0[i]?.tier || 0;
                const opts = [ 0, 1, 2, 3, 4 ].map(t => {
                    if (t === 0) return `<option value="0"${cur === 0 ? " selected" : ""}>None</option>`;
                    const tier = a.tiers[t - 1];
                    const met = tier.req.every(r => (parseInt(p[r.stat], 10) || 0) >= r.value);
                    const req = tier.req.map(r => `${abName(r.stat)} ${r.value}`).join(" + ");
                    return `<option value="${t}"${cur === t ? " selected" : ""}>${esc(TIERS[t])} — ${esc(req)}${met ? "" : " ✗ not met"}</option>`;
                }).join("");
                return `<label class="f" title="${esc(a.description || "")}">${esc(a.name)}\n          <select data-abphys="${i}" data-prev="${cur}" style="min-width:0">${opts}</select></label>`;
            }).join("");
            const mentalRows = pools.mental.length ? [ 0, 1, 2 ].map(s => {
                const cur = cur1[s] || null;
                const abOpts = `<option value="">None</option>` + pools.mental.map(mm => `<option value="${esc(mm.id)}"${cur?.guid === mm.id ? " selected" : ""}>${esc(mm.name)}</option>`).join("");
                const tierOpts = [ 1, 2, 3, 4 ].map(t => `<option value="${t}"${(cur?.tier || 1) === t ? " selected" : ""}>${esc(TIERS[t])}</option>`).join("");
                return `<span style="display:flex;gap:6px"><select data-abmental="${s}" style="flex:1;min-width:0">${abOpts}</select><select data-abmtier="${s}" style="min-width:0">${tierOpts}</select></span>`;
            }).join("") : `<span class="muted small">This archetype has no mental abilities — TB's own dropdown offers only None.</span>`;
            cardHtml = `\n      <div class="muted small" style="margin:16px 0 6px">Player card</div>\n      <div class="small" style="display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin-bottom:10px">\n        <span>Archetype <b>${esc(ptNameOf(p, pos) || "—")}</b></span>\n        <label>Dev <select data-cdev style="min-width:0;padding:3px 6px">${DEV_NAMES.map((n, i) => `<option value="${i}"${(parseInt(p.PLYR_TRAITDEVELOPMENT, 10) || 0) === i ? " selected" : ""}>${n}</option>`).join("")}</select></label>\n        <label>HS ★ <select data-cstars style="min-width:0;padding:3px 6px">${[ 0, 1, 2, 3, 4, 5 ].map(s => `<option value="${s}"${curStars === s ? " selected" : ""}>${s === 0 ? "—" : "★".repeat(s)}</option>`).join("")}</select></label>\n        <label title="TB's skill-group growth caps. When the fields are absent, TB displays Low — its default.">Potential <select data-cpot style="min-width:0;padding:3px 6px">${(A.skillCaps || []).map(sc => {
                const cur = parseInt(p.GC_PLYR_POTENTIAL, 10);
                const sel = (cur >= 0 && cur <= 2 ? cur : 0) === sc.id;
                return `<option value="${sc.id}"${sel ? " selected" : ""}>${esc(sc.name)}</option>`;
            }).join("")}</select></label>\n      </div>\n      ${mentals ? `<div class="small" style="margin-bottom:10px"><span class="muted">Mental ratings:</span> ${mentals}</div>` : ""}\n      <div class="muted small" style="margin:8px 0 6px" title="Each option shows EA's own attribute requirement for that tier. Picking an unmet tier still pushes, but in Team Builder's UI the same pick triggers its attribute auto-adjust — never accept that; it moves the overall.">Physical abilities (tier — requirement)</div>\n      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px 10px">${physRows}</div>\n      <div class="muted small" style="margin:12px 0 6px">Mental abilities (up to 3)</div>\n      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:8px 10px">${mentalRows}</div>`;
        }
        body.innerHTML = (posFields.length ? `<div class="muted small" style="margin:2px 0 8px">${esc(pos)}${wk?.label ? ` — ${esc(wk.label)}` : ""} ratings (what TB scores him on, heaviest first)</div>${grid(posFields)}\n         <div class="muted small" style="margin:14px 0 8px">Other ratings</div>${grid(restFields)}` : grid(fields)) + cardHtml + `\n      <div class="bar" style="margin-top:14px">\n        <span class="muted small" style="align-self:center">Apply writes the sheet; closing without it discards.</span>\n        <span style="flex:1"></span>\n        <button id="attrApply" data-attrfor="${esc(pid)}">Apply</button>\n      </div>`;
        const trialOf = () => {
            const trial = {
                ...p
            };
            body.querySelectorAll("[data-attrkey]").forEach(inp => {
                const v = parseInt(inp.value, 10);
                if (!Number.isNaN(v)) trial[inp.dataset.attrkey] = String(Math.max(lo, Math.min(hi, v)));
            });
            return trial;
        };
        const readout = () => {
            const out = sub?.querySelector("#attrPred");
            if (!out || !P?.predictPlayer) return;
            const got = P.predictPlayer(trialOf(), null);
            out.textContent = got == null ? "—" : String(got);
            const ovr = sub?.querySelector("#attrOvr");
            if (ovr && document.activeElement !== ovr) ovr.value = got == null ? "" : String(got);
        };
        const refreshAbilityOptions = () => {
            if (!abPools) return;
            const trial = trialOf();
            body.querySelectorAll("[data-abphys]").forEach(sel => {
                const a = abPools.physical[+sel.dataset.abphys];
                [ ...sel.options ].forEach(o => {
                    const t = +o.value;
                    if (!t) return;
                    const tier = a.tiers[t - 1];
                    const met = tier.req.every(r => (parseInt(trial[r.stat], 10) || 0) >= r.value);
                    const req = tier.req.map(r => `${abName(r.stat)} ${r.value}`).join(" + ");
                    o.textContent = `${TIERS[t]} — ${req}${met ? "" : " ✗ not met"}`;
                });
            });
        };
        body.oninput = e => {
            if (!e.target?.dataset?.attrkey) return;
            e.target.style.outline = "";
            readout();
            refreshAbilityOptions();
        };
        body.onchange = e => {
            const t = e.target;
            if (t?.dataset?.abphys == null || !abPools) return;
            const v = parseInt(t.value, 10) || 0;
            if (v > 0) {
                const a = abPools.physical[+t.dataset.abphys];
                const tier = a.tiers[v - 1];
                const trial = trialOf();
                const unmet = tier.req.filter(r => (parseInt(trial[r.stat], 10) || 0) < r.value);
                if (unmet.length) {
                    const missing = unmet.filter(r => !body.querySelector(`[data-attrkey="${r.stat}"]`));
                    if (missing.length) {
                        toastMsg(`${a.name} — ${TIERS[v]} needs ${missing.map(r => abName(r.stat)).join(", ")}, which this file doesn't carry.`, true);
                        t.value = t.dataset.prev || "0";
                        return;
                    }
                    const ask = `${a.name} — ${TIERS[v]} requires ` + unmet.map(r => `${abName(r.stat)} to be ${r.value} (currently ${parseInt(trial[r.stat], 10) || 0})`).join(" and ") + `. Increase the rating${unmet.length > 1 ? "s" : ""}? The overall readout will move; Apply writes it.`;
                    if (window.confirm(ask)) {
                        for (const r of unmet) {
                            const inp = body.querySelector(`[data-attrkey="${r.stat}"]`);
                            inp.title = `${r.stat} — was ${inp.value}`;
                            inp.value = r.value;
                            inp.style.outline = "2px solid var(--acc)";
                        }
                        readout();
                        refreshAbilityOptions();
                    } else {
                        t.value = t.dataset.prev || "0";
                        return;
                    }
                }
            }
            t.dataset.prev = t.value;
        };
        sub?.querySelector("#attrOvr")?.addEventListener("change", e => {
            const target = Math.max(40, Math.min(99, parseInt(e.target.value, 10)));
            if (Number.isNaN(target)) {
                readout();
                return;
            }
            const r = P?.scaleToTarget?.(trialOf(), target);
            if (!r) {
                toastMsg("This player can't be scored — OVR edit skipped.", true);
                readout();
                return;
            }
            body.querySelectorAll("[data-attrkey]").forEach(inp => {
                const v = r.changes[inp.dataset.attrkey];
                if (v == null) return;
                inp.title = `${inp.dataset.attrkey} — was ${inp.value}`;
                inp.value = v;
                inp.style.outline = "2px solid var(--acc)";
            });
            e.target.value = String(r.achieved);
            if (r.achieved !== target) toastMsg(`${target} is out of reach for his attributes — closest is ${r.achieved}.`, "warn");
            readout();
            refreshAbilityOptions();
        });
        readout();
        m.classList.add("open");
    }
    function applyAttrEdits(pid) {
        const D = window.D;
        const p = WORK?.teamData?.roster?.playerData?.[pid];
        const body = el("modalBody");
        if (!D || !p || !body) return;
        const lo = D.attrMin ?? 5, hi = D.attrMax ?? 99;
        const changed = [];
        body.querySelectorAll("[data-attrkey]").forEach(inp => {
            const key = inp.dataset.attrkey;
            const v = parseInt(inp.value, 10);
            if (Number.isNaN(v) || !(key in p)) return;
            const clamped = String(Math.max(lo, Math.min(hi, v)));
            if (String(p[key]) !== clamped) {
                changed.push(`${key.replace("PLYR_", "")} ${p[key]}→${clamped}`);
                p[key] = clamped;
            }
        });
        const A = window.CFB27Abilities;
        const fb = WORK?.teamData?.frostbiteData;
        if (A?.pools && fb && body.querySelector("[data-abphys],[data-abmental]")) {
            if (!fb.characterAbilities) fb.characterAbilities = {};
            const ca = fb.characterAbilities[pid] || (fb.characterAbilities[pid] = {
                0: [],
                1: []
            });
            const pools = A.pools(p);
            const slots = pools.physical.map((a, i) => {
                const t = parseInt(body.querySelector(`[data-abphys="${i}"]`)?.value, 10) || 0;
                return t > 0 ? {
                    guid: a.id,
                    tier: t
                } : null;
            });
            const next0 = slots.some(Boolean) ? slots : [];
            if (JSON.stringify(ca["0"] || []) !== JSON.stringify(next0)) {
                ca["0"] = next0;
                changed.push("physical abilities");
            }
            const seen = new Set, next1 = [];
            body.querySelectorAll("[data-abmental]").forEach(sel => {
                const guid = sel.value;
                if (!guid || seen.has(guid)) return;
                seen.add(guid);
                const t = parseInt(body.querySelector(`[data-abmtier="${sel.dataset.abmental}"]`)?.value, 10) || 1;
                next1.push({
                    guid: guid,
                    tier: t
                });
            });
            if (JSON.stringify(ca["1"] || []) !== JSON.stringify(next1)) {
                ca["1"] = next1;
                changed.push("mental abilities");
            }
        }
        const devSel = body.querySelector("[data-cdev]");
        if (devSel && String(parseInt(p.PLYR_TRAITDEVELOPMENT, 10) || 0) !== devSel.value) {
            p.PLYR_TRAITDEVELOPMENT = String(devSel.value);
            changed.push(`dev → ${DEV_NAMES[+devSel.value]}`);
        }
        const stSel = body.querySelector("[data-cstars]");
        if (stSel) {
            const stored = String(Number(stSel.value) === 0 ? 5 : Number(stSel.value) - 1);
            if (String(p.GC_PLYR_PROSPECTSTARRATING) !== stored) {
                p.GC_PLYR_PROSPECTSTARRATING = stored;
                changed.push(`HS ★ → ${Number(stSel.value) === 0 ? "none" : stSel.value}`);
            }
        }
        const potSel = body.querySelector("[data-cpot]");
        if (potSel && A?.capModifier) {
            const want = parseInt(potSel.value, 10) || 0;
            const curRaw = parseInt(p.GC_PLYR_POTENTIAL, 10);
            const cur = curRaw >= 0 && curRaw <= 2 ? curRaw : null;
            if (want !== (cur ?? 0)) {
                p.GC_PLYR_POTENTIAL = String(want);
                p.GC_PLYR_SKILLGROUPCAPMODIFIER = String(A.capModifier(want, p.PLYR_SCHOOLYEAR));
                changed.push(`potential → ${A.skillCaps[want]?.name || want}`);
            }
        }
        el("modal")?.classList.remove("open");
        if (!changed.length) return;
        DIRTY = true;
        if (typeof changeBlip === "function") changeBlip();
        console.info(`[CFB27] ${p.PLYR_FIRSTNAME} ${p.PLYR_LASTNAME}: ${changed.length} attribute${changed.length === 1 ? "" : "s"} hand-edited — ${changed.join(", ")}`);
        render();
    }
    const wire = () => {
        el("search")?.addEventListener("input", render);
        el("filterGroup")?.addEventListener("change", render);
        el("rosterBox")?.querySelector?.("thead")?.addEventListener("click", e => {
            const k = e.target.closest("th[data-sortcol]")?.dataset?.sortcol;
            if (!k) return;
            SORT = k === "pos" ? null : SORT?.key === k ? {
                key: k,
                dir: -SORT.dir
            } : {
                key: k,
                dir: 1
            };
            render();
        });
        el("tbody")?.addEventListener("click", e => {
            const pick = e.target?.closest?.("[data-swappick]")?.dataset?.swappick;
            if (pick) window.CFB27PoolBrowser?.openSwapChooser?.(pick);
            const edit = e.target?.closest?.("[data-edit]")?.dataset?.edit;
            if (edit) openAttrEditor(edit);
        });
        el("modalBody")?.addEventListener("click", e => {
            const pid = e.target?.closest?.("#attrApply")?.dataset?.attrfor;
            if (pid) applyAttrEdits(pid);
        });
        el("tbody")?.addEventListener("change", e => {
            const t = e.target;
            const pid = t?.dataset?.dev ?? t?.dataset?.stars ?? t?.dataset?.arch ?? t?.dataset?.ovr;
            if (pid == null || typeof WORK === "undefined" || !WORK) return;
            const p = WORK.teamData?.roster?.playerData?.[pid];
            if (!p) return;
            if (t.dataset.arch != null) {
                let r;
                try {
                    r = setArchetype(pid, t.value);
                } catch (err) {
                    toastMsg(String(err?.message || err), true);
                    render();
                    return;
                }
                const name = `${p.PLYR_FIRSTNAME} ${p.PLYR_LASTNAME}`;
                console.info(`[CFB27] ${name}: archetype → ${t.value}` + (r?.want != null ? ` — predicted held at ${r.want - r.drift}${r.drift ? ` (asked ${r.want})` : ""}, file target ${r.from} → ${r.target}` : " (predictor unavailable — rebuilt at the file overall)") + (r?.ptId != null ? `, PLYR_PLAYERTYPE → ${r.ptId}` : ", PLYR_PLAYERTYPE unmapped — label NOT written") + (r && !r.exact ? "; no mold of that exact archetype on file — nearest in the group used" : ""));
                const bits = [];
                if (r && !r.exact) bits.push(`no ${t.value} mold on file — built from the nearest in the group`);
                if (r?.want != null && Math.abs(r.drift) >= 2) bits.push(`his rating couldn't quite be held: ${r.want} → ${r.want - r.drift}`);
                if (bits.length) toastMsg(`${name}: ${bits.join("; ")}.`, "warn");
                render();
            } else if (t.dataset.ovr != null) {
                const target = Math.max(40, Math.min(99, parseInt(t.value, 10)));
                const r = Number.isNaN(target) ? undefined : window.CFB27Predict?.scaleToTarget?.(p, target);
                if (Number.isNaN(target)) {
                    render();
                    return;
                }
                if (!r) {
                    toastMsg("This player can't be scored — OVR edit skipped.", true);
                    render();
                    return;
                }
                const moved = Object.entries(r.changes);
                if (!moved.length) {
                    render();
                    return;
                }
                for (const [key, v] of moved) p[key] = v;
                const name = `${p.PLYR_FIRSTNAME} ${p.PLYR_LASTNAME}`;
                console.info(`[CFB27] ${name}: OVR ${r.before} → ${r.achieved} (asked ${target}) — ` + `${moved.length} attribute${moved.length === 1 ? "" : "s"} scaled by ${r.label} weights: ` + moved.map(([k, v]) => `${k.replace("PLYR_", "")}→${v}`).join(", "));
                if (r.achieved !== target) toastMsg(`${name}: ${target} is out of reach for his attributes — closest is ${r.achieved}.`, "warn");
                render();
            } else if (t.dataset.dev != null) {
                p.PLYR_TRAITDEVELOPMENT = String(t.value);
                console.info(`[CFB27] ${p.PLYR_FIRSTNAME} ${p.PLYR_LASTNAME}: dev trait → ${DEV_NAMES[+t.value]}`);
            } else {
                p.GC_PLYR_PROSPECTSTARRATING = String(Number(t.value) === 0 ? 5 : Number(t.value) - 1);
                console.info(`[CFB27] ${p.PLYR_FIRSTNAME} ${p.PLYR_LASTNAME}: HS stars → ${Number(t.value) === 0 ? "none" : t.value}`);
            }
            DIRTY = true;
            if (typeof changeBlip === "function") changeBlip();
        });
        el("applyStars")?.addEventListener("click", () => {
            if (typeof WORK === "undefined" || !WORK) return;
            const toast = (msg, bad) => {
                const t = el("toast");
                if (!t) return;
                t.textContent = msg;
                t.className = "toast show" + (bad ? " bad" : "");
                setTimeout(() => {
                    t.className = "toast";
                }, 5e3);
            };
            const list = Object.values(WORK.teamData?.roster?.playerData || {}).map(p => {
                const gc = parseInt(p.GC_PLYR_PROSPECTSTARRATING, 10);
                return {
                    first: p.PLYR_FIRSTNAME,
                    last: p.PLYR_LASTNAME,
                    jersey: String(p.PLYR_JERSEYNUM ?? ""),
                    stars: gc >= 5 || Number.isNaN(gc) ? 0 : gc + 1,
                    rs: Number(p.PLYR_REDSHIRTED || 0) !== 0 ? 1 : 0
                };
            });
            if (!list.length) return toast("No players on this roster.", true);
            toast(`Applying stars + redshirts to ${list.length} players in Team Builder…`);
            chrome.runtime.sendMessage({
                type: "TB_APPLY_STARS",
                payload: list
            }, res => {
                if (chrome.runtime.lastError) return toast(chrome.runtime.lastError.message, true);
                if (!res?.ok) return toast(res?.error || "Star apply failed.", true);
                const off = (res.missing?.length || 0) + (res.failed?.length || 0) + (res.rsFailed?.length || 0);
                console.info(`[CFB27] stars/RS applied in TB — ★ ${res.applied}/${res.total}, RS ${res.rsApplied}/${res.total}` + (res.missing?.length ? `, not found: ${res.missing.join(", ")}` : "") + (res.failed?.length ? `, ★ failed: ${res.failed.join(", ")}` : "") + (res.rsFailed?.length ? `, RS failed: ${res.rsFailed.join(", ")}` : ""));
                if (res.rsNoWidget) console.warn("[CFB27] Team Builder showed no Redshirt dropdown on the Bio tab — redshirt flags could not be verified.");
                toast(`Stars: ${res.applied}/${res.total}, RS: ${res.rsApplied}/${res.total} set` + (off ? `, ${off} skipped (console has names)` : "") + (res.rsNoWidget ? " — TB has no Redshirt control (see console)" : "") + " — press SAVE in Team Builder to keep them.", !!off || !!res.rsNoWidget);
            });
        });
    };
    if (typeof document !== "undefined" && document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", wire);
    } else {
        wire();
    }
})();
