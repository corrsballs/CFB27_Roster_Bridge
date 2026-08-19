(function() {
    const el = id => document.getElementById(id);
    const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    }[c]));
    const VERIFY_AFTER_MS = 6e3;
    let candidates = [];
    let sourceUrl = "";
    let pulledText = "";
    let lastPush = null;
    function fingerprint(text) {
        let h = 2166136261;
        for (let i = 0; i < text.length; i++) {
            h ^= text.charCodeAt(i);
            h = h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)) >>> 0;
        }
        return h.toString(16).padStart(8, "0");
    }
    function say(html, tone) {
        const box = el("tbStatus");
        box.className = "tbstatus" + (tone ? " " + tone : "");
        box.innerHTML = html;
    }
    function ask(message) {
        return new Promise(resolve => {
            chrome.runtime.sendMessage(message, response => {
                if (chrome.runtime.lastError) {
                    resolve({
                        ok: false,
                        error: chrome.runtime.lastError.message
                    });
                    return;
                }
                resolve(response || {
                    ok: false,
                    error: "No response from the extension."
                });
            });
        });
    }
    const NAME_CACHE_KEY = "cfb27.teamNames";
    function teamNames() {
        try {
            return JSON.parse(localStorage.getItem(NAME_CACHE_KEY)) || {};
        } catch {
            return {};
        }
    }
    function rememberTeamName(teamId, ti) {
        const name = [ ti?.TEAM_NAME, ti?.TEAM_NICKNAME ].filter(Boolean).join(" ").trim();
        if (!teamId || !name) return;
        const map = teamNames();
        if (map[teamId] === name) return;
        map[teamId] = name;
        try {
            localStorage.setItem(NAME_CACHE_KEY, JSON.stringify(map));
        } catch {}
    }
    function describe(entry) {
        const team = teamNames()[entry.teamId] || (entry.teamId ? `Team ${entry.teamId.slice(0, 8)}` : "unknown team");
        const when = new Date(entry.seenAt || Date.now()).toLocaleTimeString();
        return `${team} · seen ${when}`;
    }
    async function labelCandidates(list) {
        for (const entry of list) {
            if (!entry.teamId || teamNames()[entry.teamId]) continue;
            const response = await ask({
                type: "TB_FETCH",
                url: entry.url
            });
            if (!response.ok) continue;
            let parsed;
            try {
                parsed = JSON.parse(response.text);
            } catch {
                continue;
            }
            rememberTeamName(entry.teamId, parsed?.teamData?.teamInfos);
            if (candidates === list) {
                const select = el("tbUrl");
                list.forEach((e, i) => {
                    if (select.options[i]) select.options[i].textContent = describe(e);
                });
            }
        }
    }
    function paintCandidates(urls, tab) {
        candidates = urls || [];
        const select = el("tbUrl");
        select.innerHTML = candidates.length ? candidates.map((entry, i) => `<option value="${i}">${esc(describe(entry))}</option>`).join("") : '<option value="">nothing found yet</option>';
        select.disabled = !candidates.length;
        el("tbFetch").disabled = !candidates.length;
        const wrap = el("tbUrlWrap");
        if (wrap) wrap.style.display = candidates.length > 1 ? "" : "none";
        if (candidates.length > 1) labelCandidates(candidates);
        if (!candidates.length) {
            say(tab ? "Team Builder is open, but its roster file has not been requested yet. Click into the <b>Roster</b> tab on that page, then press Find my team again." : `No Team Builder tab found. Open your team at <b>ea.com</b> &rarr; Team Builder, then press\n           Find my team.<br>If it <i>is</i> open, press <b>Diagnostics</b> — the usual causes are the\n           tab being in a different Chrome profile or an incognito window (where the extension is off\n           by default), or the page having been open since before the extension was loaded, which\n           needs a reload of that tab.`, "warn");
            return;
        }
        say(candidates.length > 1 ? `Found <b>${candidates.length}</b> roster payloads. Pick one and pull it in.` : `Found your team — press <b>Pull team</b>.`, "ok");
    }
    async function refresh(quiet) {
        if (!quiet) say("Looking for an open Team Builder tab&hellip;");
        const response = await ask({
            type: "TB_STATUS"
        });
        if (!response.ok) return say(`Could not talk to the extension: ${response.error}`, "bad");
        paintCandidates(response.urls, response.tab);
        const served = response.status?.lastServed;
        if (served) {
            el("tbPushed").style.display = "block";
            el("tbPushed").innerHTML = `Team Builder last loaded your edited roster at\n        <b>${new Date(served.at).toLocaleTimeString()}</b>.\n        Press <b>Save</b> in Team Builder to keep it — the edit only becomes permanent when you do.`;
        }
        return response;
    }
    const since = t0 => `${((performance.now() - t0) / 1e3).toFixed(1)}s`;
    function failureDetail(status, fallback) {
        return status.pageError?.text && `Team Builder threw: <code>${esc(status.pageError.text)}</code>` || status.pageLog?.text && `Team Builder logged: <code>${esc(status.pageLog.text)}</code>` || status.lastError && `The extension reported: <code>${esc(status.lastError)}</code>` || fallback;
    }
    function renderSummary() {
        const ti = WORK.teamData.teamInfos;
        const count = Object.keys(WORK.teamData.roster.playerData).length;
        el("summary").style.display = "flex";
        el("summary").innerHTML = `\n      <div class="stat team"><span id="teamChip"></span>\n        <div class="stat"><label>Team</label><b>${esc(ti.TEAM_NAME || "—")} ${esc(ti.TEAM_NICKNAME || "")}</b></div></div>\n      <div class="stat"><label>Players</label><b>${count}</b></div>\n      <div class="stat" title="teamInfos.TEAM_RATINGOVR — the overall the game wrote back on the last Save."><label>Overall</label><b>${esc(ti.TEAM_RATINGOVR ?? "—")}</b></div>\n      <div class="stat" title="teamInfos.TEAM_RATINGOFF"><label>Offense</label><b>${esc(ti.TEAM_RATINGOFF ?? "—")}</b></div>\n      <div class="stat" title="teamInfos.TEAM_RATINGDEF"><label>Defense</label><b>${esc(ti.TEAM_RATINGDEF ?? "—")}</b></div>\n      <div class="stat"><label>Home</label><b>${esc([ ti.CITY_NAME, ti.CITY_STATE ].filter(Boolean).join(", ") || "—")}</b></div>\n      <div class="stat"><label>Stadium</label><b>${esc(ti.STADIUM_NAME || "—")}</b></div>\n      <div class="stat"><label>Founded</label><b>${esc(ti.YEAR_FOUNDED ?? "—")}</b></div>`;
    }
    function shapeError(parsed) {
        const playerData = parsed?.teamData?.roster?.playerData;
        if (!playerData || typeof playerData !== "object") return "no teamData.roster.playerData — that is not a Team Builder payload";
        if (!Object.keys(playerData).length) return "roster contains no players";
        if (!parsed?.teamData?.teamInfos) return "no teamData.teamInfos — the team header is missing";
        return "";
    }
    async function pull() {
        const index = Number(el("tbUrl").value || 0);
        const entry = candidates[index];
        if (!entry) return;
        const t0 = performance.now();
        say("Downloading your roster from EA&hellip;");
        const response = await ask({
            type: "TB_FETCH",
            url: entry.url
        });
        if (!response.ok) return say(`Download failed: ${response.error}`, "bad");
        const downloaded = since(t0);
        const size = (response.text.length / 1048576).toFixed(1);
        const t1 = performance.now();
        let parsed;
        try {
            parsed = JSON.parse(response.text);
        } catch (error) {
            return say(`EA's payload is not valid JSON: ${esc(error.message)}`, "bad");
        }
        const shape = shapeError(parsed);
        if (shape) return say(`Pulled file rejected: ${shape}.`, "bad");
        sourceUrl = entry.url;
        pulledText = response.text;
        rememberTeamName(entry.teamId, parsed.teamData.teamInfos);
        RAW = parsed;
        WORK = JSON.parse(response.text);
        DIRTY = false;
        ASSIGN = {};
        renderSummary();
        window.CFB27Table?.render?.();
        window.CFB27Roster?.autoSelect?.(entry.url);
        window.CFB27Generator?.onRosterLoaded?.();
        window.CFB27PoolBrowser?.onRosterLoaded?.();
        window.CFB27UsedRegistry?.onRosterLoaded?.();
        window.CFB27TeamColors?.onRosterLoaded?.();
        window.CFB27TeamLogos?.onRosterLoaded?.();
        window.CFB27Predict?.update();
        el("tbPush").disabled = false;
        const count = Object.keys(WORK.teamData.roster.playerData).length;
        const fp = fingerprint(pulledText);
        console.log(`[CFB27 Roster Bridge] ${RB_VERSION} — pulled ${count} players, ${pulledText.length} bytes, fingerprint ${fp}`);
        say(`Pulled <b>${count} players</b> from Team Builder — ${size} MB in ${downloaded},\n         parsed in ${since(t1)}. Fingerprint <code>${fp}</code>. Push sends these exact bytes back.`, "ok");
    }
    let unnamedPushAcknowledged = false;
    async function push() {
        if (!WORK || !pulledText) return say("Pull a roster in first.", "bad");
        if (!sourceUrl) return say("This roster was opened from a file, so there is nothing to push it back to. Use Find my team, then Pull.", "bad");
        const a = window.CFB27Roster?.audit?.();
        if (window.CFB27Roster?.looksUnnamed?.(a) && !unnamedPushAcknowledged) {
            unnamedPushAcknowledged = true;
            return say(`<b>Not one of the ${a.total} names differs from the file you pulled</b> — this roster\n        still has EA's own names in it. Press <b>Name roster from pool</b> first, or press Push again to\n        send it as it is.<br><span class="muted small">${a.build} · ${a.pool} players in the pool.\n        If you did press Name roster, something replaced the roster afterwards — a second Pull does that.</span>`, "warn");
        }
        unnamedPushAcknowledged = false;
        const ti = WORK.teamData.teamInfos;
        say("Sending the roster and reloading Team Builder&hellip;");
        const t0 = performance.now();
        const text = DIRTY ? JSON.stringify(WORK) : pulledText;
        const serialised = since(t0);
        const fp = fingerprint(text);
        const t1 = performance.now();
        const pushedAt = Date.now();
        const response = await ask({
            type: "TB_PUSH",
            url: sourceUrl,
            text: text,
            teamName: `${ti.TEAM_NAME || ""} ${ti.TEAM_NICKNAME || ""}`.trim(),
            players: Object.keys(WORK.teamData.roster.playerData).length
        });
        if (!response.ok) return say(`Push failed: ${response.error}`, "bad");
        const staged = since(t1);
        lastPush = {
            at: pushedAt,
            url: sourceUrl,
            fingerprint: fp,
            players: Object.keys(WORK.teamData.roster.playerData).length,
            teamName: `${ti.TEAM_NAME || ""} ${ti.TEAM_NICKNAME || ""}`.trim()
        };
        const pendingClaim = window.CFB27UsedRegistry?.snapshot?.() || null;
        console.log(`[CFB27 Roster Bridge] ${RB_VERSION} — push fingerprint ${fp} (${text.length} bytes, untouched=${text === pulledText})`);
        el("tbPushed").style.display = "block";
        el("tbPushed").innerHTML = `Sent — Team Builder is reloading with your roster.\n      <b>Nothing is permanent until you press Save there.</b>\n      <span class="muted">Chrome's yellow "debugging this browser" banner is expected and detaches itself.</span>`;
        const sent = a?.comparable ? ` <b>${a.changed} of ${a.total}</b> names differ from the pull.` : "";
        say(`Pushed — check the roster in Team Builder, then press <b>Save</b> there.${sent}\n         <span class="muted">Serialised ${serialised}, staged ${staged} · fingerprint <code>${fp}</code>${text === pulledText ? " · byte-identical to the pull" : ""}.\n         Any wait now is Team Builder's own reload.</span>`, "ok");
        verifyServed(pushedAt, pendingClaim);
    }
    async function verifyServed(pushedAt, pendingClaim) {
        await new Promise(resolve => setTimeout(resolve, VERIFY_AFTER_MS));
        const response = await ask({
            type: "TB_STATUS"
        });
        if (!response?.ok) return;
        const status = response.status || {};
        const served = status.lastServed;
        if (served && (served.at || 0) >= pushedAt) {
            const claimed = pendingClaim ? window.CFB27UsedRegistry?.commit?.(pendingClaim) : null;
            return say(`Pushed <b>${served.players || 0}</b> players${served.teamName ? " to <b>" + esc(served.teamName) + "</b>" : ""}\n        — press <b>Save</b> in Team Builder.${claimed && claimed.keys ? ` <span class="muted">${claimed.keys} pool players registered to ${esc(pendingClaim.teamKey)} —\n          other teams' draws will skip them.</span>` : ""}`, "ok");
        }
        const detail = failureDetail(status, "Nothing was recorded, which usually means the roster request never reached that tab.");
        say(`<b>Your roster was NOT served.</b> The tab reloaded with EA's own copy, so nothing you\n      pushed is in Team Builder.<br>${detail}\n      <br><span class="muted small">Check the yellow debugging banner appeared on the right tab,\n      then push again. If Team Builder redirected you to My Teams, reload the team page first —\n      an expired session does that on its own, before this extension is involved.</span>`, "bad");
    }
    async function testTransport() {
        if (!sourceUrl) return say("Press <b>Find my team</b> first — there is no roster URL to test with.", "bad");
        say("Serving EA&rsquo;s <b>untouched</b> roster through the interception path&hellip;");
        const at = Date.now();
        const response = await ask({
            type: "TB_PASSTHROUGH",
            url: sourceUrl
        });
        if (!response.ok) return say(`Could not start the test: ${response.error}`, "bad");
        await new Promise(resolve => setTimeout(resolve, VERIFY_AFTER_MS));
        const status = (await ask({
            type: "TB_STATUS"
        }))?.status || {};
        const served = status.lastServed;
        const ea = status.eaResponse;
        const eaLine = ea ? `<br><span class="muted small">EA answered HTTP ${esc(ea.status)} with:\n      ${esc((ea.headers || []).join(" · "))}</span>` : "";
        if (served && (served.at || 0) >= at && served.mode === "passthrough") {
            return say(`<b>Transport is sound.</b> EA's own roster (${served.bytes || 0} bytes) was\n        intercepted and substituted successfully — attach, pause, encode and fulfil all work.\n        So if a normal Push fails, the cause is in the <b>edited payload</b>, not the plumbing.\n        Team Builder is showing EA's unmodified team right now; press <b>Clear</b> before your\n        next real push.${eaLine}`, "ok");
        }
        const detail = failureDetail(status, "Nothing was recorded — the roster request never reached the tab we attached to.");
        say(`<b>Transport is broken — and your payload is innocent.</b> Even EA's own untouched\n      roster could not be served, so nothing the editor produces is the cause. Look at the\n      debugger session, the roster URL match, host permissions, or EA.<br>${detail}${eaLine}`, "bad");
    }
    function loadFile(event) {
        const f = event.target.files[0];
        if (!f) return;
        if (!sourceUrl) {
            say("Pull your team in first — a loaded file needs the push address the pull provides.", "bad");
            event.target.value = "";
            return;
        }
        f.text().then(text => {
            let parsed;
            try {
                parsed = JSON.parse(text);
            } catch (error) {
                return say(`That file is not valid JSON: ${esc(error.message)}`, "bad");
            }
            const shape = shapeError(parsed);
            if (shape) return say(`Loaded file rejected: ${shape}.`, "bad");
            RAW = parsed;
            WORK = JSON.parse(text);
            DIRTY = true;
            ASSIGN = {};
            renderSummary();
            window.CFB27Table?.render?.();
            window.CFB27Generator?.onRosterLoaded?.();
            window.CFB27PoolBrowser?.onRosterLoaded?.();
            window.CFB27UsedRegistry?.onRosterLoaded?.();
            if (typeof changeBlip === "function") changeBlip();
            window.CFB27TeamColors?.onRosterLoaded?.();
            window.CFB27TeamLogos?.onRosterLoaded?.();
            const count = Object.keys(WORK.teamData.roster.playerData).length;
            const fp = fingerprint(JSON.stringify(WORK));
            console.log(`[CFB27 Roster Bridge] ${RB_VERSION} — loaded file "${f.name}", ${count} players, fingerprint ${fp}`);
            say(`Loaded <b>${esc(f.name)}</b> — ${count} players, fingerprint <code>${fp}</code>.\n        Push sends THIS roster to the team you pulled. <span class="muted">The pull's own bytes are\n        no longer what will push.</span>`, "warn");
        });
        event.target.value = "";
    }
    async function clearPush() {
        const response = await ask({
            type: "TB_CLEAR"
        });
        if (!response.ok) return say(`Could not clear: ${response.error}`, "bad");
        el("tbPushed").style.display = "none";
        say("Cleared. Team Builder will load EA's own copy again on the next reload.", "ok");
    }
    async function diagnose() {
        const box = el("tbDiag");
        box.style.display = "block";
        box.textContent = "Collecting…";
        const response = await ask({
            type: "TB_DIAG"
        });
        if (!response.ok) {
            box.textContent = `Diagnostics failed: ${response.error}`;
            return;
        }
        const r = response.report;
        const cs = r.contentScript;
        const audit = window.CFB27Roster?.audit?.();
        const poolSize = window.CFB27Roster?.POOL?.players?.length ?? 0;
        const lines = [ `extension v${r.version}   ${r.at}`, `editor ${RB_VERSION} · ${poolSize} players in the pool`, audit ? `loaded roster: ${audit.total} players · ${audit.changed} names changed since pull · ` + `${audit.fromPool} matching the pool · ${audit.visualsDisagree} visuals disagreeing` : "loaded roster: none", pulledText ? `pulled payload: ${pulledText.length.toLocaleString()} bytes · fingerprint ${fingerprint(pulledText)} · ` + `TB preset id ${WORK?.teamData?.teamInfos?.MY_SCHOOL_TEMPLATE_ID ?? "—"}` : null, "", `EA tabs visible to the extension : ${r.eaTabs ? r.eaTabs.length : "?"}`, `  (of ${r.tabsTotal ?? "?"} tabs total, ${r.tabsWithUrl ?? "?"} with a readable URL)`, `exact-pattern query matched      : ${r.filteredQueryCount ?? r.filteredQueryError ?? "?"}`, `host permission granted          : ${r.hostPermission ?? r.hostPermissionError ?? "?"}`, `content script answered          : ${cs ? "yes" : "NO" + (r.contentScriptError ? " — " + r.contentScriptError : "")}`, cs ? `  resource entries on the page   : ${cs.resourceCount}` : null, cs ? `  EA CDN requests seen           : ${(cs.cdnSample || []).length}` : null, cs ? `  roster payloads matched        : ${(cs.rosterUrls || []).length}` : null, `roster URLs stored               : ${(r.storedUrls || []).length}`, "", "last push - what Team Builder did:", `  served         : ${r.status && r.status.lastServed ? (r.status.lastServed.players || 0) + " players @ " + new Date(r.status.lastServed.at).toLocaleTimeString() : "nothing served"}`, `  TB exception   : ${r.status && r.status.pageError ? (r.status.pageError.text || "") + (r.status.pageError.url ? "  @ " + r.status.pageError.url + ":" + r.status.pageError.line : "") : "(none captured)"}`, `  TB console err : ${r.status && r.status.pageLog ? r.status.pageLog.text || "" : "(none)"}`, `  extension err  : ${r.status && r.status.lastError ? r.status.lastError : "(none)"}`, "", "EA tabs:", ...r.eaTabs && r.eaTabs.length ? r.eaTabs.map(t => `  [${t.id}]${t.active ? " active" : ""}${t.incognito ? " INCOGNITO" : ""} ${t.url}`) : [ "  (none)" ], "", "EA CDN requests the page made (most recent last):", ...cs && cs.cdnSample && cs.cdnSample.length ? cs.cdnSample.map(u => "  " + u) : [ "  (none seen — the roster file has not been requested in this tab)" ], "", "stored roster URLs:", ...(r.storedUrls || []).length ? r.storedUrls.map(u => "  " + u) : [ "  (none)" ] ].filter(line => line !== null);
        box.textContent = lines.join("\n");
    }
    async function copyDiag() {
        try {
            await navigator.clipboard.writeText(el("tbDiag").textContent);
            say("Diagnostics copied — paste it into the chat.", "ok");
        } catch {
            say("Could not copy automatically. Select the text below and copy it by hand.", "warn");
        }
    }
    window.CFB27Transport = {
        fingerprint: fingerprint,
        lastPush: () => lastPush,
        sourceUrl: () => sourceUrl
    };
    window.addEventListener("DOMContentLoaded", () => {
        el("tbFind").onclick = () => refresh(false);
        el("tbFetch").onclick = pull;
        el("tbPush").onclick = push;
        el("tbClear").onclick = clearPush;
        el("tbDiagBtn").onclick = diagnose;
        el("tbDiagCopy").onclick = copyDiag;
        el("tbPassThrough").onclick = testTransport;
        el("tbFile").addEventListener("change", loadFile);
        refresh(true);
    });
})();
