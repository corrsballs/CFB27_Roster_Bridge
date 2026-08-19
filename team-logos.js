function initCFB27TeamLogos() {
    const el = id => document.getElementById(id);
    const STORE_PREFIX = "cfb27.logo.";
    const THUMB = 192;
    const EA_CDN = /^https:\/\/cdn\.mcr\.ea\.com\//i;
    function logoUrlOf(raw) {
        if (typeof raw !== "string" || !raw) return null;
        try {
            const meta = JSON.parse(raw);
            const url = meta && typeof meta.pngUrl === "string" ? meta.pngUrl : null;
            return url && EA_CDN.test(url) ? url : null;
        } catch {
            return null;
        }
    }
    const teamKey = () => {
        const ti = typeof WORK !== "undefined" && WORK ? WORK.teamData?.teamInfos : null;
        return ti ? `${ti.TEAM_NAME || ""} ${ti.TEAM_NICKNAME || ""}`.trim() : "";
    };
    function cacheGet(team) {
        try {
            const c = JSON.parse(localStorage.getItem(STORE_PREFIX + team) || "null");
            return c && typeof c.dataUri === "string" && c.dataUri.startsWith("data:image/") && c.thumb === THUMB ? c : null;
        } catch {
            return null;
        }
    }
    function cachePut(team, url, dataUri) {
        try {
            localStorage.setItem(STORE_PREFIX + team, JSON.stringify({
                url: url,
                dataUri: dataUri,
                thumb: THUMB,
                at: Date.now()
            }));
        } catch {}
    }
    function markHtml(team, colors) {
        const c = team ? cacheGet(team) : null;
        if (c) return `<img class="teamlogo" src="${c.dataUri}" alt="">`;
        return window.CFB27TeamColors?.swatchHtml?.(colors) || "";
    }
    async function capture(team, url) {
        if (typeof fetch !== "function" || typeof document?.createElement !== "function" || typeof createImageBitmap !== "function") return;
        try {
            const response = await fetch(url, {
                cache: "no-store"
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const bitmap = await createImageBitmap(await response.blob());
            const canvas = document.createElement("canvas");
            const scale = Math.min(1, THUMB / Math.max(bitmap.width, bitmap.height));
            canvas.width = Math.max(1, Math.round(bitmap.width * scale));
            canvas.height = Math.max(1, Math.round(bitmap.height * scale));
            canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
            cachePut(team, url, canvas.toDataURL("image/png"));
            if (teamKey() === team) paint();
            window.CFB27UsedRegistry?.render?.();
        } catch (e) {
            console.log(`[CFB27] logo capture skipped for ${team}: ${e.message}`);
        }
    }
    function paint() {
        const chip = el("teamChip");
        if (!chip) return;
        const team = teamKey();
        const c = team ? cacheGet(team) : null;
        if (c) chip.innerHTML = `<img class="teamlogo" src="${c.dataUri}" alt="">`;
    }
    function onRosterLoaded() {
        const team = teamKey();
        if (!team) return;
        paint();
        const ti = WORK.teamData?.teamInfos;
        const url = logoUrlOf(ti?.TEAM_PRIMARY_LOGO);
        if (url && cacheGet(team)?.url !== url) capture(team, url);
    }
    window.CFB27TeamLogos = {
        logoUrlOf: logoUrlOf,
        markHtml: markHtml,
        cacheGet: cacheGet,
        cachePut: cachePut,
        paint: paint,
        onRosterLoaded: onRosterLoaded
    };
}

if (typeof window !== "undefined") window.initCFB27TeamLogos = initCFB27TeamLogos;
