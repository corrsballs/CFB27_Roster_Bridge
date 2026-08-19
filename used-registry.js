function initCFB27UsedRegistry() {
    const R = window.CFB27Roster;
    if (!R) return;
    const el = id => document.getElementById(id);
    const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    }[c]));
    const STORE_KEY = "cfb27.used";
    const TEAM_CAP = typeof CFB27_CONFIG !== "undefined" && CFB27_CONFIG.usedTeamCap || 32;
    const BY_KEY = new Map(R.POOL.players.map(p => [ R.poolKey(p), p ]));
    let claims = {};
    try {
        claims = JSON.parse(localStorage.getItem(STORE_KEY) || "{}") || {};
    } catch {
        claims = {};
    }
    for (const [team, c] of Object.entries(claims)) {
        if (!c || !Array.isArray(c.keys)) delete claims[team];
    }
    function persist() {
        try {
            if (Object.keys(claims).length) localStorage.setItem(STORE_KEY, JSON.stringify(claims)); else localStorage.removeItem(STORE_KEY);
        } catch {}
    }
    const teamKey = () => {
        const ti = typeof WORK !== "undefined" && WORK ? WORK.teamData?.teamInfos : null;
        return ti ? `${ti.TEAM_NAME || ""} ${ti.TEAM_NICKNAME || ""}`.trim() : "";
    };
    function keysFromWork() {
        const roster = typeof WORK !== "undefined" && WORK ? WORK.teamData?.roster?.playerData : null;
        if (!roster) return [];
        const out = [];
        const seen = new Set;
        for (const p of Object.values(roster)) {
            const head = [ String(p.PLYR_FIRSTNAME ?? "").toLowerCase(), String(p.PLYR_LASTNAME ?? "").toLowerCase(), parseInt(p.PLYR_HEIGHT, 10), parseInt(p.PLYR_WEIGHT, 10) + 160 ].join("|");
            const key = `${head}|${String(p.PLYR_HOME_TOWN ?? "").trim().toLowerCase()}`;
            const hit = BY_KEY.has(key) ? key : BY_KEY.has(`${head}|`) ? `${head}|` : null;
            if (hit && !seen.has(hit)) {
                seen.add(hit);
                out.push(hit);
            }
        }
        return out;
    }
    const snapshot = () => {
        const team = teamKey();
        if (!team) return null;
        const ti = typeof WORK !== "undefined" && WORK ? WORK.teamData?.teamInfos : null;
        return {
            teamKey: team,
            keys: keysFromWork(),
            colors: window.CFB27TeamColors?.colorsOf?.(ti) || null
        };
    };
    function excludedKeys() {
        const mine = teamKey();
        const out = new Set;
        for (const [team, c] of Object.entries(claims)) {
            if (team === mine) continue;
            for (const k of c.keys) out.add(k);
        }
        return out.size ? out : null;
    }
    function ownerOf(key) {
        for (const [team, c] of Object.entries(claims)) if (c.keys.includes(key)) return team;
        return null;
    }
    function commit(snap) {
        if (!snap || !snap.teamKey) return null;
        claims[snap.teamKey] = {
            keys: [ ...new Set(snap.keys || []) ],
            at: Date.now()
        };
        if (snap.colors) claims[snap.teamKey].colors = snap.colors;
        persist();
        render();
        window.CFB27PoolBrowser?.render?.();
        return {
            teams: Object.keys(claims).length,
            keys: claims[snap.teamKey].keys.length
        };
    }
    function release(team) {
        delete claims[team];
        persist();
        render();
        window.CFB27PoolBrowser?.render?.();
    }
    function resetAll() {
        claims = {};
        persist();
        render();
        window.CFB27PoolBrowser?.render?.();
    }
    const teams = () => Object.entries(claims).map(([team, c]) => ({
        team: team,
        count: c.keys.length,
        at: c.at || 0,
        colors: c.colors || null
    })).sort((a, b) => b.at - a.at);
    function onRosterLoaded() {
        render();
    }
    function render() {
        const list = el("usedList");
        const badge = el("usedCount");
        const warn = el("usedWarn");
        const rows = teams();
        const totalKeys = rows.reduce((n, t) => n + t.count, 0);
        if (badge) badge.textContent = rows.length ? `${rows.length} team${rows.length > 1 ? "s" : ""} · ${totalKeys} players` : "";
        if (warn) {
            const over = rows.length >= TEAM_CAP;
            warn.style.display = over ? "block" : "none";
            if (over) {
                warn.innerHTML = `<span class="capwarn">${rows.length} teams registered — Team Builder holds at most\n          ${TEAM_CAP}. A renamed or dropped team leaves a stale entry still holding its players:\n          release the one you no longer recognise.</span>`;
            }
        }
        if (!list) return;
        if (!rows.length) {
            list.innerHTML = '<div class="muted small" style="padding:2px 0 8px">No teams registered yet — ' + "a verified push registers that team's players, and other teams' draws skip them.</div>";
            return;
        }
        const mine = teamKey();
        const mark = (team, colors) => window.CFB27TeamLogos?.markHtml?.(team, colors) ?? (window.CFB27TeamColors?.swatchHtml?.(colors) || "");
        list.innerHTML = rows.map(({team: team, count: count, colors: colors}) => `<div class="piperow">\n      <span class="pipename">${mark(team, colors)}${team === mine ? `<b>${esc(team)}</b> <span class="muted small">(this team)</span>` : esc(team)}\n        <span class="muted small">· ${count} player${count === 1 ? "" : "s"}</span></span>\n      <button class="piperm" data-release="${esc(team)}"\n        title="Release this team's claims — its players become available to every draw again">×</button>\n    </div>`).join("");
    }
    const wire = () => {
        if (!el("usedList")) return;
        el("usedList")?.addEventListener("click", e => {
            const team = e.target?.closest?.("[data-release]")?.dataset?.release;
            if (team) release(team);
        });
        el("usedReset")?.addEventListener("click", () => {
            if (!teams().length) return;
            if (typeof confirm !== "function" || confirm("Forget every team's claims? Every pool player becomes available to every draw.")) resetAll();
        });
        render();
    };
    if (typeof document !== "undefined" && document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", wire);
    } else if (typeof document !== "undefined") {
        wire();
    }
    window.CFB27UsedRegistry = {
        teamKey: teamKey,
        keysFromWork: keysFromWork,
        snapshot: snapshot,
        excludedKeys: excludedKeys,
        ownerOf: ownerOf,
        commit: commit,
        release: release,
        resetAll: resetAll,
        teams: teams,
        onRosterLoaded: onRosterLoaded,
        render: render
    };
}

if (typeof window !== "undefined") window.initCFB27UsedRegistry = initCFB27UsedRegistry;
