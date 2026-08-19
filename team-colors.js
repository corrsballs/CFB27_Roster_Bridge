function initCFB27TeamColors() {
    const el = id => document.getElementById(id);
    const chan = v => {
        if (v == null || v === "") return null;
        const n = Number(v);
        return Number.isFinite(n) && n >= 0 && n <= 255 ? Math.round(n) : null;
    };
    const hex = (r, g, b) => "#" + [ r, g, b ].map(n => n.toString(16).padStart(2, "0")).join("");
    function colorsOf(ti) {
        if (!ti || typeof ti !== "object") return null;
        const trip = suffix => {
            const r = chan(ti[`TEAM_BACKGROUNDCOLORR${suffix}`]);
            const g = chan(ti[`TEAM_BACKGROUNDCOLORG${suffix}`]);
            const b = chan(ti[`TEAM_BACKGROUNDCOLORB${suffix}`]);
            return r == null || g == null || b == null ? null : hex(r, g, b);
        };
        const c = [ trip(""), trip("2"), trip("3") ];
        return c[0] && c[1] ? c : null;
    }
    function swatchHtml(colors) {
        if (!colors || !colors[0] || !colors[1]) return "";
        const edge = colors[2] ? `;box-shadow:inset 0 -3px 0 ${colors[2]}` : "";
        return `<span class="teamswatch" style="background:linear-gradient(135deg,` + `${colors[0]} 0 50%,${colors[1]} 50% 100%)${edge}"></span>`;
    }
    function render() {
        const ti = typeof WORK !== "undefined" && WORK ? WORK.teamData?.teamInfos : null;
        const colors = colorsOf(ti);
        const chip = el("teamChip");
        if (chip) chip.innerHTML = colors ? swatchHtml(colors) : "";
        const summary = el("summary");
        if (summary) summary.style.borderTop = colors ? `3px solid ${colors[0]}` : "";
        return colors;
    }
    window.CFB27TeamColors = {
        colorsOf: colorsOf,
        swatchHtml: swatchHtml,
        render: render,
        onRosterLoaded: render
    };
}

if (typeof window !== "undefined") window.initCFB27TeamColors = initCFB27TeamColors;
