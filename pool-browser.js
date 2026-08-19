function initCFB27PoolBrowser() {
    const R = window.CFB27Roster;
    if (!R) return;
    const D = window.D || {};
    const el = id => document.getElementById(id);
    const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    }[c]));
    const PIPE_NAME = new Map((R.PIPES?.pipelines || []).map(p => [ p.id, p.name ]));
    PIPE_NAME.set("international", "International");
    const pipeOf = p => p.pipeline || "international";
    const pipeFilter = new Set;
    const BY_KEY = new Map(R.POOL.players.map(p => [ R.poolKey(p), p ]));
    const pinMap = new Map;
    const pins = () => pinMap.size ? Object.fromEntries(pinMap) : null;
    const pinnedPlayers = () => [ ...pinMap.values() ].map(k => BY_KEY.get(k)).filter(Boolean);
    const teamName = () => typeof WORK !== "undefined" && WORK ? String(WORK.teamData?.teamInfos?.TEAM_NAME || "") : "";
    const storeKey = () => `cfb27.pins.${teamName()}`;
    function save() {
        if (!teamName()) return;
        try {
            if (pinMap.size) localStorage.setItem(storeKey(), JSON.stringify(Object.fromEntries(pinMap))); else localStorage.removeItem(storeKey());
        } catch {}
    }
    function onRosterLoaded() {
        pinMap.clear();
        const roster = typeof WORK !== "undefined" && WORK ? WORK.teamData?.roster?.playerData : null;
        if (roster && teamName()) {
            try {
                const stored = JSON.parse(localStorage.getItem(storeKey()) || "{}");
                for (const [pid, key] of Object.entries(stored)) {
                    if (roster[pid] && BY_KEY.has(key)) pinMap.set(pid, key);
                }
            } catch {}
            save();
        }
        render();
    }
    const posOfSlot = p => (D.positionCodes || {})[String(parseInt(p.PLYR_POSITION, 10))] || "?";
    function setPin(pid, key) {
        for (const [otherPid, otherKey] of pinMap) if (otherKey === key) pinMap.delete(otherPid);
        pinMap.set(pid, key);
        save();
        render();
        R.paintLocalCap?.();
    }
    function clearPin(pid) {
        pinMap.delete(pid);
        save();
        render();
        R.paintLocalCap?.();
    }
    function slotsFor(player) {
        const roster = typeof WORK !== "undefined" && WORK ? WORK.teamData?.roster?.playerData : null;
        if (!roster) return [];
        return Object.entries(roster).filter(([, p]) => (R.SLOT_SOURCES[posOfSlot(p)] || []).includes(player.pos_group)).map(([pid, p]) => ({
            pid: pid,
            p: p,
            pos: posOfSlot(p)
        }));
    }
    const CLASSES = [ "FR", "SO", "JR", "SR" ];
    const ht = inches => `${Math.floor(inches / 12)}'${inches % 12}"`;
    const ROW_CAP = 120;
    function playerLine(p) {
        return `${esc(p.first_name)} ${esc(p.last_name)} · ${esc(p.pos_group)} · ` + `${esc(p.class)} · ${ht(p.height_in)} ${p.weight_lbs} · ` + `${esc(p.home_town || "—")}${p.home_state ? ", " + esc(p.home_state) : ""}`;
    }
    function renderPins() {
        const box = el("pinList");
        const badge = el("pinCount");
        if (badge) badge.textContent = pinMap.size ? `${pinMap.size} pinned` : "";
        if (!box) return;
        const roster = typeof WORK !== "undefined" && WORK ? WORK.teamData?.roster?.playerData : null;
        if (!pinMap.size || !roster) {
            box.innerHTML = '<div class="muted small" style="padding:2px 0 8px">No pins yet — ' + "search below and hit Pin… to lock a player into a slot before you name the roster.</div>";
            return;
        }
        box.innerHTML = [ ...pinMap.entries() ].map(([pid, key]) => {
            const player = BY_KEY.get(key);
            const slot = roster[pid];
            if (!player || !slot) return "";
            return `<div class="piperow">\n        <span class="pipename"><b>${esc(posOfSlot(slot))}</b> ← ${playerLine(player)}\n          <span class="muted small">${esc(player.source_school)}</span></span>\n        <button class="piperm" data-unpin="${esc(pid)}" title="Unpin this slot">×</button>\n      </div>`;
        }).join("");
    }
    function hits() {
        const q = String(el("browseSearch")?.value || "").trim().toLowerCase();
        const group = el("browseGroup")?.value || "";
        return R.filteredPool().filter(p => (!pipeFilter.size || pipeFilter.has(pipeOf(p))) && (!group || p.pos_group === group) && (!q || `${p.first_name} ${p.last_name}`.toLowerCase().includes(q) || String(p.source_school).toLowerCase().includes(q) || String(p.home_town || "").toLowerCase().includes(q)));
    }
    function renderRows() {
        const box = el("browseRows");
        const count = el("browseCount");
        if (!box) return;
        const pool = R.filteredPool();
        const rows = hits();
        if (count) {
            count.textContent = rows.length === pool.length ? `${pool.length} players` : pipeFilter.size ? rows.length > ROW_CAP ? `first ${ROW_CAP} shown` : "" : `${rows.length} of ${pool.length}${rows.length > ROW_CAP ? ` · first ${ROW_CAP} shown` : ""}`;
        }
        const pinnedKeys = new Set(pinMap.values());
        const reg = window.CFB27UsedRegistry;
        const myTeam = reg?.teamKey?.() || "";
        box.innerHTML = rows.slice(0, ROW_CAP).map(p => {
            const key = R.poolKey(p);
            const already = pinnedKeys.has(key);
            const owner = reg?.ownerOf?.(key);
            const taken = owner && owner !== myTeam;
            const btn = taken ? `<button class="sec" disabled title="Already on ${esc(owner)} — release that team in the Used players panel to free him.">used</button>` : `<button class="sec" data-pin="${esc(key)}"${already ? " disabled" : ""} title="Lock this player into a roster slot — naming fills everyone else around him. He becomes the slot's identity; the slot's ratings stay the solve's.">${already ? "pinned" : "Pin…"}</button>`;
            return `<div class="piperow">\n        <span class="pipename">${playerLine(p)}\n          <span class="muted small">${esc(p.source_school)} · ${esc(PIPE_NAME.get(p.pipeline) || "International")}${taken ? ` · on ${esc(owner)}` : ""}</span></span>\n        ${btn}\n      </div>`;
        }).join("") || '<div class="muted small" style="padding:8px 0">No matches.</div>';
    }
    function renderPipeChips() {
        const box = el("browsePipeSel");
        if (!box) return;
        box.innerHTML = [ ...pipeFilter ].map(id => `<span class="piperow" style="padding:2px 8px">${esc(PIPE_NAME.get(id) || id)}\n        <button class="piperm" data-pipeoff="${esc(id)}" title="Remove this pipeline from the filter">×</button></span>`).join("");
    }
    function render() {
        renderPins();
        renderPipeChips();
        renderRows();
    }
    function setPipeFilter(ids) {
        pipeFilter.clear();
        for (const id of ids || []) pipeFilter.add(id);
        renderPipeChips();
        renderRows();
    }
    function openSlotChooser(key) {
        const player = BY_KEY.get(key);
        if (!player) return;
        const slots = slotsFor(player);
        const title = el("modalTitle"), sub = el("modalSub"), body = el("modalBody");
        if (!title || !body) return;
        title.textContent = `Pin ${player.first_name} ${player.last_name}`;
        if (sub) sub.textContent = slots.length ? `Pick the slot he fills — a ${player.pos_group} can take ${[ ...new Set(slots.map(s => s.pos)) ].join(", ")}. ` + `Pin holds him for the next Name roster; Swap now writes him onto the slot immediately (and pins him so a later naming keeps him).` : "No roster is loaded, or no slot can take his position group.";
        body.innerHTML = slots.map(({pid: pid, p: p, pos: pos}) => {
            const pinnedHere = pinMap.has(pid);
            return `<div class="piperow">\n        <span class="pipename"><b>${esc(pos)}</b> #${esc(p.PLYR_JERSEYNUM ?? "")} ` + `${esc(p.PLYR_FIRSTNAME)} ${esc(p.PLYR_LASTNAME)} · OVR ${esc(p.PLYR_OVERALLRATING)}` + `${pinnedHere ? ' <span class="muted small">(pinned — picking replaces it)</span>' : ""}</span>\n        <button class="sec" data-pinslot="${esc(pid)}" data-pinkey="${esc(key)}" title="Hold him for this slot on the next Name roster run.">Pin</button>\n        <button class="sec" data-swapslot="${esc(pid)}" data-pinkey="${esc(key)}" title="Swap him onto this slot right now — only the slot's identity changes, its ratings stay, everyone else is untouched. The player he replaces goes back to the pool on the next verified push.">Swap now</button>\n      </div>`;
        }).join("") || '<div class="muted small">Nothing to pin to.</div>';
        el("modal")?.classList.add("open");
    }
    function openSwapChooser(pid) {
        const roster = typeof WORK !== "undefined" && WORK ? WORK.teamData?.roster?.playerData : null;
        const slot = roster?.[pid];
        if (!slot) return;
        const pos = posOfSlot(slot);
        const groups = R.SLOT_SOURCES[pos] || [];
        const onRoster = new Set(window.CFB27UsedRegistry?.keysFromWork?.() || []);
        const reg = window.CFB27UsedRegistry;
        const mine = reg?.teamKey?.() || "";
        const eligible = R.filteredPool().filter(p => {
            if (!groups.includes(p.pos_group)) return false;
            const k = R.poolKey(p);
            if (onRoster.has(k)) return false;
            const owner = reg?.ownerOf?.(k);
            return !(owner && owner !== mine);
        });
        const title = el("modalTitle"), sub = el("modalSub"), body = el("modalBody");
        if (!title || !body) return;
        title.textContent = `Swap ${pos} — ${slot.PLYR_FIRSTNAME} ${slot.PLYR_LASTNAME}`;
        if (sub) sub.textContent = "Pick who replaces him — only the slot's identity changes, " + "its ratings stay, everyone else is untouched. Players on this roster or claimed by " + "another team aren't offered.";
        const counts = {};
        for (const p of eligible) counts[pipeOf(p)] = (counts[pipeOf(p)] || 0) + 1;
        const pipeRows = Object.entries(counts).map(([id, n]) => ({
            id: id,
            n: n,
            name: PIPE_NAME.get(id) || id
        })).sort((a, b) => b.n - a.n);
        body.innerHTML = `\n      <div class="piperow">\n        <span class="pipename">Can't decide?</span>\n        <button class="sec" data-swaprand="${esc(pid)}"\n          title="A random eligible player — same rules as the table's ↻.">Random re-roll</button>\n      </div>\n      <div class="bar" style="margin:8px 0 4px">\n        <label class="f">Pipeline<select id="swapPipe">\n          <option value="">all pipelines</option>\n          ${pipeRows.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("")}\n        </select></label>\n        <label class="f">Search<input type="text" id="swapSearch" placeholder="name, school, hometown"></label>\n      </div>\n      <div id="swapList"></div>`;
        const renderList = () => {
            const list = el("swapList");
            if (!list) return;
            const pipe = el("swapPipe")?.value || "";
            const q = String(el("swapSearch")?.value || "").trim().toLowerCase();
            const rows = eligible.filter(p => (!pipe || pipeOf(p) === pipe) && (!q || `${p.first_name} ${p.last_name}`.toLowerCase().includes(q) || String(p.source_school).toLowerCase().includes(q) || String(p.home_town || "").toLowerCase().includes(q))).sort((a, b) => a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name));
            list.innerHTML = rows.slice(0, ROW_CAP).map(p => {
                const key = R.poolKey(p);
                return `<div class="piperow">\n          <span class="pipename">${playerLine(p)}\n            <span class="muted small">${esc(p.source_school)} · ${esc(PIPE_NAME.get(p.pipeline) || "International")}</span></span>\n          <button class="sec" data-swapslot="${esc(pid)}" data-pinkey="${esc(key)}">Swap in</button>\n        </div>`;
            }).join("") || '<div class="muted small" style="padding:8px 0">No matches.</div>';
            const more = rows.length > ROW_CAP ? `<div class="muted small" style="padding:4px 0">first ${ROW_CAP} shown — narrow the search</div>` : "";
            list.innerHTML += more;
        };
        el("swapPipe")?.addEventListener("change", renderList);
        el("swapSearch")?.addEventListener("input", renderList);
        renderList();
        el("modal")?.classList.add("open");
    }
    const POS_ORDER = [ "QB", "HB", "FB", "WR", "TE", "OL", "DL", "EDGE", "DT", "LB", "DB", "CB", "S", "K", "P" ];
    function buildGroupFilter() {
        const sel = el("browseGroup");
        if (!sel || sel.options?.length) return;
        const have = new Set(R.POOL.players.map(p => p.pos_group));
        const groups = [ ...POS_ORDER.filter(g => have.has(g)), ...[ ...have ].filter(g => !POS_ORDER.includes(g)).sort() ];
        sel.innerHTML = '<option value="">all positions</option>' + groups.map(g => `<option value="${esc(g)}">${esc(g)}</option>`).join("");
    }
    function buildPipeFilter() {
        const sel = el("browsePipe");
        if (!sel || sel.options?.length) return;
        const counts = {};
        for (const p of R.POOL.players) counts[pipeOf(p)] = (counts[pipeOf(p)] || 0) + 1;
        const rows = [ ...(R.PIPES?.pipelines || []).map(p => ({
            id: p.id,
            name: p.name
        })), {
            id: "international",
            name: "International"
        } ].filter(p => counts[p.id]);
        sel.innerHTML = '<option value="">whole pool — add a pipeline to filter</option>' + rows.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("");
    }
    const wire = () => {
        if (!el("browseRows")) return;
        buildGroupFilter();
        buildPipeFilter();
        el("browseSearch")?.addEventListener("input", renderRows);
        el("browseGroup")?.addEventListener("change", renderRows);
        el("browsePipe")?.addEventListener("change", e => {
            const id = e.target.value;
            if (!id) return;
            pipeFilter.add(id);
            e.target.value = "";
            renderPipeChips();
            renderRows();
        });
        el("browsePipeSel")?.addEventListener("click", e => {
            const id = e.target?.closest?.("[data-pipeoff]")?.dataset?.pipeoff;
            if (!id) return;
            pipeFilter.delete(id);
            renderPipeChips();
            renderRows();
        });
        el("browseRows")?.addEventListener("click", e => {
            const key = e.target?.closest?.("[data-pin]")?.dataset?.pin;
            if (key) openSlotChooser(key);
        });
        el("pinList")?.addEventListener("click", e => {
            const pid = e.target?.closest?.("[data-unpin]")?.dataset?.unpin;
            if (pid) clearPin(pid);
        });
        el("modalBody")?.addEventListener("click", e => {
            const rand = e.target?.closest?.("[data-swaprand]")?.dataset?.swaprand;
            if (rand) {
                el("modal")?.classList.remove("open");
                window.CFB27Table?.reroll?.(rand);
                return;
            }
            const swap = e.target?.closest?.("[data-swapslot]");
            if (swap) {
                const r = window.CFB27Roster?.swapSlots?.({
                    [swap.dataset.swapslot]: swap.dataset.pinkey
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
                if (!r || r.error || r.rejected.length) {
                    toast(`Swap failed: ${r?.rejected?.[0]?.reason || r?.error || "no roster loaded"}`, true);
                    return;
                }
                const a = r.applied[0];
                setPin(swap.dataset.swapslot, swap.dataset.pinkey);
                el("modal")?.classList.remove("open");
                window.CFB27Table?.render?.();
                if (typeof changeBlip === "function") changeBlip();
                console.info(`[CFB27] swapped in at ${a.pos}: ${a.out} → ${a.in}`);
                toast(`${a.pos}: ${a.out} → ${a.in}`);
                return;
            }
            const btn = e.target?.closest?.("[data-pinslot]");
            if (!btn) return;
            setPin(btn.dataset.pinslot, btn.dataset.pinkey);
            el("modal")?.classList.remove("open");
        });
        render();
    };
    if (typeof document !== "undefined" && document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", wire);
    } else if (typeof document !== "undefined") {
        wire();
    }
    window.CFB27PoolBrowser = {
        pins: pins,
        pinnedPlayers: pinnedPlayers,
        setPin: setPin,
        clearPin: clearPin,
        onRosterLoaded: onRosterLoaded,
        render: render,
        hits: hits,
        setPipeFilter: setPipeFilter,
        openSwapChooser: openSwapChooser
    };
}

if (typeof window !== "undefined") window.initCFB27PoolBrowser = initCFB27PoolBrowser;
