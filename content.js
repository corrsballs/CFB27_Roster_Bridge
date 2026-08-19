const reported = new Set;

const cdnSeen = [];

try {
    performance.setResourceTimingBufferSize(1e3);
    performance.addEventListener?.("resourcetimingbufferfull", () => {
        scanBuffer();
        try {
            performance.clearResourceTimings();
        } catch {}
    });
} catch {}

function teamIdFromUrl(href = location.href) {
    try {
        const match = new URL(href).pathname.match(TEAM_PAGE);
        return match ? match[1] : "";
    } catch {
        return "";
    }
}

function send(type, payload) {
    try {
        chrome.runtime.sendMessage({
            type: type,
            payload: payload
        }, () => void chrome.runtime.lastError);
    } catch {}
}

function noteCdn(url) {
    if (!EA_CDN.test(url) || cdnSeen.includes(url)) return;
    cdnSeen.push(url);
    if (cdnSeen.length > 60) cdnSeen.shift();
}

function reportUrl(url) {
    if (!url) return;
    noteCdn(url);
    if (reported.has(url) || !ROSTER_JSON.test(url)) return;
    reported.add(url);
    send("TB_URL_FOUND", {
        url: url,
        pageUrl: location.href,
        teamId: teamIdFromUrl(),
        title: document.title,
        seenAt: Date.now()
    });
}

function reportPage() {
    send("TB_PAGE_SEEN", {
        pageUrl: location.href,
        teamId: teamIdFromUrl(),
        title: document.title,
        active: document.visibilityState === "visible",
        seenAt: Date.now()
    });
}

function scanBuffer() {
    try {
        for (const entry of performance.getEntriesByType("resource")) reportUrl(entry.name);
    } catch {}
}

try {
    new PerformanceObserver(list => {
        for (const entry of list.getEntries()) reportUrl(entry.name);
    }).observe({
        type: "resource",
        buffered: true
    });
} catch {
    try {
        new PerformanceObserver(list => {
            for (const entry of list.getEntries()) reportUrl(entry.name);
        }).observe({
            entryTypes: [ "resource" ]
        });
    } catch {}
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === "TB_RESCAN") {
        reported.clear();
        scanBuffer();
        reportPage();
        sendResponse({
            ok: true,
            teamId: teamIdFromUrl(),
            pageUrl: location.href
        });
        return false;
    }
    if (message?.type === "TB_PING") {
        let resourceCount = 0;
        try {
            resourceCount = performance.getEntriesByType("resource").length;
        } catch {}
        sendResponse({
            ok: true,
            pageUrl: location.href,
            teamId: teamIdFromUrl(),
            resourceCount: resourceCount,
            rosterUrls: [ ...reported ],
            cdnSample: cdnSeen.slice(-25)
        });
        return false;
    }
    if (message?.type === "TB_STAR_PREP") {
        starPrep(message.payload || {}).then(sendResponse).catch(error => sendResponse({
            ok: false,
            error: String(error?.message || error)
        }));
        return true;
    }
    if (message?.type === "TB_STAR_VERIFY") {
        starVerify(message.payload || {}).then(sendResponse).catch(error => sendResponse({
            ok: false,
            error: String(error?.message || error)
        }));
        return true;
    }
    if (message?.type === "TB_RS_SET") {
        rsSet(message.payload || {}).then(sendResponse).catch(error => sendResponse({
            ok: false,
            error: String(error?.message || error)
        }));
        return true;
    }
    return false;
});

const starSleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const starVoted = () => document.querySelectorAll("app-roster-content app-rate-star .rating-voted").length;

async function starPrep(want) {
    if (!/\/team-create\/roster\//i.test(location.pathname)) {
        return {
            ok: false,
            error: "Open your team's ROSTER tab in Team Builder first, then Apply ★ again."
        };
    }
    const name = `${want.first} ${want.last}`.trim().toLowerCase();
    const ticket = [ ...document.querySelectorAll("app-players-tickets button.player-ticket") ].find(t => String(t.getAttribute("aria-label") || "").replace(/^Select:\s*/i, "").trim().toLowerCase() === name);
    if (!ticket) return {
        ok: false,
        notFound: true
    };
    ticket.click();
    let up = false;
    for (let i = 0; i < 30 && !up; i++) {
        await starSleep(100);
        up = (document.querySelector("app-roster-content")?.textContent || "").toLowerCase().includes(String(want.last).toLowerCase());
    }
    const buttons = document.querySelectorAll("app-roster-content app-rate-star button");
    if (!up || buttons.length !== 5) return {
        ok: false
    };
    const stars = Math.min(5, Math.max(0, parseInt(want.stars, 10) || 0));
    if (stars === 0) {
        buttons[4].click();
        await starSleep(150);
        return starVoted() === 5 ? {
            ok: true,
            done: true
        } : {
            ok: false
        };
    }
    const target = buttons[stars - 1];
    target.scrollIntoView({
        block: "center"
    });
    await starSleep(200);
    const rect = target.getBoundingClientRect();
    if (!rect.width) return {
        ok: false
    };
    return {
        ok: true,
        x: Math.round(rect.left + rect.width / 2),
        y: Math.round(rect.top + rect.height / 2)
    };
}

async function rsSet(want) {
    const findSelect = () => {
        for (const wrap of document.querySelectorAll("app-roster-content .select-wrapper")) {
            const label = wrap.querySelector("label")?.textContent?.trim().toLowerCase() || "";
            if (label.includes("redshirt")) return wrap.querySelector("select");
        }
        return null;
    };
    let select = findSelect();
    let back = null;
    if (!select) {
        const tabs = [ ...document.querySelectorAll("app-roster-content button.tab-button") ];
        const bio = tabs.find(b => b.textContent.toLowerCase().includes("bio"));
        if (!bio) return {
            ok: false,
            noWidget: true
        };
        back = tabs.find(b => b.getAttribute("aria-selected") === "true" || /active|selected/i.test(b.className)) || tabs[0] || null;
        if (back === bio) back = null;
        bio.click();
        for (let i = 0; i < 20 && !(select = findSelect()); i++) await starSleep(100);
    }
    const done = async result => {
        if (back) {
            back.click();
            await starSleep(150);
        }
        return result;
    };
    if (!select) return done({
        ok: false,
        noWidget: true
    });
    const wantText = want.rs ? "yes" : "no";
    const current = () => select.selectedOptions[0]?.textContent?.trim().toLowerCase() || "";
    if (current() === wantText) return done({
        ok: true
    });
    const option = [ ...select.options ].find(o => o.textContent.trim().toLowerCase() === wantText);
    if (!option) return done({
        ok: false,
        noWidget: true
    });
    option.selected = true;
    select.value = option.value;
    select.dispatchEvent(new Event("change", {
        bubbles: true,
        composed: true
    }));
    select.blur();
    for (let i = 0; i < 10; i++) {
        if (current() === wantText) return done({
            ok: true
        });
        await starSleep(100);
    }
    return done({
        ok: false,
        saw: current()
    });
}

async function starVerify(want) {
    const stars = Math.min(5, Math.max(1, parseInt(want.stars, 10) || 0));
    for (let i = 0; i < 10; i++) {
        if (starVoted() === stars) return {
            ok: true
        };
        await starSleep(100);
    }
    return {
        ok: false,
        saw: starVoted()
    };
}

scanBuffer();

reportPage();

const scanTimer = setInterval(() => {
    scanBuffer();
    if (reported.size) stopPolling();
}, 2e3);

const pageTimer = setInterval(reportPage, 4e3);

function stopPolling() {
    clearInterval(scanTimer);
    clearInterval(pageTimer);
}

if (reported.size) stopPolling();

for (const event of [ "focus", "pageshow", "visibilitychange" ]) {
    (event === "visibilitychange" ? document : window).addEventListener(event, reportPage);
}
