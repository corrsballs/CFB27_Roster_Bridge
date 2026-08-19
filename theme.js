(() => {
    const KEY = "cfb27_theme";
    const root = document.documentElement;
    let stored = null;
    try {
        stored = localStorage.getItem(KEY);
    } catch (e) {}
    if (stored !== "light") root.dataset.theme = "dark";
    document.addEventListener("DOMContentLoaded", () => {
        const btn = document.getElementById("themeBtn");
        if (!btn) return;
        const paint = () => {
            const dark = root.dataset.theme === "dark";
            btn.textContent = dark ? "☀" : "☾";
            btn.title = dark ? "Switch to light theme" : "Switch to dark theme";
        };
        btn.addEventListener("click", () => {
            const toDark = root.dataset.theme !== "dark";
            if (toDark) root.dataset.theme = "dark"; else delete root.dataset.theme;
            try {
                localStorage.setItem(KEY, toDark ? "dark" : "light");
            } catch (e) {}
            paint();
        });
        paint();
        const modal = document.getElementById("modal");
        const closeModal = () => modal?.classList.remove("open");
        document.getElementById("modalClose")?.addEventListener("click", closeModal);
        modal?.addEventListener("click", e => {
            if (e.target === modal) closeModal();
        });
        document.addEventListener("keydown", e => {
            if (e.key === "Escape" && modal?.classList.contains("open")) closeModal();
        });
        const info = document.getElementById("infoBtn");
        if (info) info.addEventListener("click", () => {
            const t = document.getElementById("modalTitle");
            const s = document.getElementById("modalSub");
            const b = document.getElementById("modalBody");
            const m = document.getElementById("modal");
            if (!t || !b || !m) return;
            t.textContent = "What this editor does";
            if (s) s.innerHTML = "Pull a roster from EA Team Builder, reshape it, push it back — nothing leaves your browser.";
            b.innerHTML = `\n        <h3 style="margin:0 0 6px;font-size:12px">Connect &mdash; the Team Builder bar</h3>\n        <ul style="margin:0 0 14px;padding-left:18px">\n          <li><b>Find my team</b> &mdash; scans your open Team Builder tab for the roster EA is serving. If there's more than one, a picker appears.</li>\n          <li><b>Pull team</b> &mdash; copies that roster into the editor. The game's own file is untouched until you push.</li>\n          <li><b>Push to Team Builder</b> &mdash; serves your edited roster back through the same path TB loads from, so the next reload shows your version. Chrome briefly shows a "started debugging this browser" banner &mdash; expected; just don't click its Cancel mid-push.</li>\n        </ul>\n        <h3 style="margin:0 0 6px;font-size:12px">Step 1 &mdash; Ratings</h3>\n        <ul style="margin:0 0 14px;padding-left:18px">\n          <li><b>Offense / Defense targets</b> &mdash; the numbers you want the game to display. Slider or box.</li>\n          <li><b>Team overall</b> &mdash; derived from the two targets.</li>\n          <li><b>Generate ratings</b> &mdash; builds a roster that Team Builder's own rating engine scores at exactly your targets: the number you ask for is the number the game shows. If a target sits below what a roster can physically reach, it lands on the floor and the editor says so.</li>\n        </ul>\n        <h3 style="margin:0 0 6px;font-size:12px">Step 2 &mdash; Names</h3>\n        <ul style="margin:0 0 14px;padding-left:18px">\n          <li><b>Recruiting reach</b> &mdash; how much of each position comes from your pipelines vs. elsewhere (details at the bottom).</li>\n          <li><b>Recruiting pipelines</b> &mdash; search and add states/regions to recruit from. <b>Top 10</b> seeds a strong set; <b>Clear</b> empties it. A live count shows whether they can fill the roster.</li>\n          <li><b>Name roster from pool</b> &mdash; gives every player the name and bio of a real college player. The pool is players from FCS and D2/D3 programs &mdash; real rosters that don't feature in CFB 27 &mdash; and each gets a stock in-game head of a similar complexion to their public team photo (that's the only likeness matching &mdash; usually close, not always, never a lookalike). Identity only &mdash; ratings, dev, and stars are untouched.</li>\n          <li><b>Pool browser + pins</b> &mdash; search by name, school, or hometown; filter by position or pipeline. <b>Pin</b> players you want guaranteed; the draw fills the rest.</li>\n          <li><b>Used players</b> &mdash; a verified push claims that team's players, so your next team skips them &mdash; no duplicates across teams. <b>Forget all teams</b> clears it.</li>\n        </ul>\n        <h3 style="margin:0 0 6px;font-size:12px">Roster table</h3>\n        <ul style="margin:0 0 14px;padding-left:18px">\n          <li><b>Search / Position filter</b> &mdash; narrow the visible rows.</li>\n          <li><b>Click a player's name</b> &mdash; edit any attribute by hand; the popup shows the rating TB will compute, live, as you type. <b>Apply</b> keeps the edits, closing discards. Generate ratings or an archetype swap rebuilds the sheet over hand edits.</li>\n          <li><b>OVR</b> &mdash; the rating TB will show for him, computed with TB's own engine. Moves with hand edits, holds through archetype swaps. The file's raw number (which TB ignores) is in the hover tooltip.</li>\n          <li><b>Archetype</b> &mdash; what Team Builder lists for him. Picking another rebuilds his ratings from a real player of that archetype while holding his rating &mdash; the same points, spent that archetype's way.</li>\n          <li><b>Class</b> &mdash; the class draw, <b>RS</b> prefix for redshirts.</li>\n          <li><b>Dev</b> and <b>HS &starf;</b> &mdash; inline-editable, cosmetic to the team overall. All of it survives TB's own Save.</li>\n          <li><b>&rlarr;</b> &mdash; swap one player out (drill-down or random re-roll). Everyone else stays identical.</li>\n        </ul>\n        <h3 style="margin:16px 0 6px;font-size:12px;border-top:1px solid var(--line);padding-top:16px">How the pipeline draw works</h3>\n        <p style="margin:0 0 8px">Every real player belongs to <b>one pipeline</b> &mdash; their home state/region (or <b>International</b>). Naming draws from that pool one position at a time, without replacement, so no player appears twice.</p>\n        <ul style="margin:0;padding-left:18px">\n          <li><b>Reach sets the split</b> &mdash; your pipelines vs. everyone else, per position. The "everyone else" share tries <b>bordering</b> regions before going nationwide &mdash; so even at 100% you may see a neighboring-state player where local talent ran out.</li>\n          <li><b>Tier sets the order among your pipelines</b> &mdash; tiers 1&ndash;5; higher tiers get drawn from more often. Tier never moves the local-vs-rest split.</li>\n          <li><b>Reach can cap itself</b> &mdash; if your pipelines can't fill a position, the draw spills over and lowers the effective reach to match. It always tells you when it does.</li>\n        </ul>`;
            m.classList.add("open");
        });
    });
})();
