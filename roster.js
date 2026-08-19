function initCFB27Roster(data) {
    const POOL = data.pool || {
        players: []
    };
    const BUILD = data.build || {
        id: "unstamped"
    };
    const PIPES = data.pipelines || {
        pipelines: [],
        unresolved: 0
    };
    const STATS = data.stats || null;
    const D = data.constants || {};
    const PIPE_NAME = new Map(PIPES.pipelines.map(p => [ p.id, p.name ]));
    const INTL_ID = "international";
    PIPE_NAME.set(INTL_ID, "International");
    const pipeOf = p => p.pipeline || INTL_ID;
    let divFilter = null;
    function filteredPool() {
        return divFilter ? POOL.players.filter(p => divFilter.has(p.source_tier)) : POOL.players;
    }
    function recountPipes() {
        const pool = filteredPool();
        const counts = {};
        for (const p of pool) {
            const id = pipeOf(p);
            counts[id] = (counts[id] || 0) + 1;
        }
        for (const p of PICKER_PIPES) p.count = counts[p.id] || 0;
    }
    const INTL_COUNT = POOL.players.filter(p => !p.pipeline).length;
    const PICKER_PIPES = [ ...PIPES.pipelines.map(p => ({
        ...p
    })), {
        id: INTL_ID,
        name: "International",
        count: INTL_COUNT,
        neighbors: []
    } ];
    recountPipes();
    const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    }[c]));
    const poolKey = p => [ String(p.first_name).toLowerCase(), String(p.last_name).toLowerCase(), p.height_in, p.weight_lbs, String(p.home_town ?? "").trim().toLowerCase() ].join("|");
    const POOL_NAMES = new Set(POOL.players.map(p => `${p.first_name} ${p.last_name}`));
    function audit() {
        if (typeof WORK === "undefined" || !WORK) return null;
        const roster = WORK.teamData?.roster?.playerData || {};
        const visuals = WORK.teamData?.frostbiteData?.characterVisuals || {};
        const source = typeof RAW !== "undefined" && RAW ? RAW.teamData?.roster?.playerData || null : null;
        let total = 0, fromPool = 0, changed = 0, visualsDisagree = 0;
        for (const [pid, p] of Object.entries(roster)) {
            total++;
            const name = `${p.PLYR_FIRSTNAME} ${p.PLYR_LASTNAME}`;
            if (POOL_NAMES.has(name)) fromPool++;
            if (source && source[pid] && `${source[pid].PLYR_FIRSTNAME} ${source[pid].PLYR_LASTNAME}` !== name) changed++;
            const v = visuals[pid];
            if (v && (v.firstName !== p.PLYR_FIRSTNAME || v.lastName !== p.PLYR_LASTNAME)) visualsDisagree++;
        }
        return {
            total: total,
            fromPool: fromPool,
            visualsDisagree: visualsDisagree,
            changed: changed,
            comparable: !!source,
            build: BUILD.id,
            pool: POOL.players.length
        };
    }
    function looksUnnamed(a) {
        return !!a && a.comparable && a.changed === 0 && a.fromPool < a.total * .9;
    }
    const SLOT_SOURCES = {
        QB: [ "QB" ],
        HB: [ "HB" ],
        FB: [ "FB", "HB", "TE" ],
        WR: [ "WR" ],
        TE: [ "TE" ],
        LT: [ "OL" ],
        LG: [ "OL" ],
        C: [ "OL" ],
        RG: [ "OL" ],
        RT: [ "OL" ],
        LE: [ "EDGE", "DL", "DT" ],
        RE: [ "EDGE", "DL", "DT" ],
        DT: [ "DT", "DL", "EDGE" ],
        LOLB: [ "LB", "S", "DL" ],
        MLB: [ "LB", "DL" ],
        ROLB: [ "LB", "S", "DL" ],
        CB: [ "CB", "DB", "S" ],
        FS: [ "S", "DB", "CB" ],
        SS: [ "S", "DB", "CB" ],
        K: [ "K", "P" ],
        P: [ "P", "K" ]
    };
    const FAMILY = {
        DL: "front",
        EDGE: "front",
        DT: "front",
        DB: "back",
        CB: "back",
        S: "back",
        OL: "OL",
        LB: "LB",
        QB: "QB",
        HB: "HB",
        FB: "FB",
        WR: "WR",
        TE: "TE",
        K: "ST",
        P: "ST"
    };
    const LEANS = {
        all: {
            label: "Everyone from your pipelines — 100 / 0",
            w: [ 100, 0 ]
        },
        heavy: {
            label: "Almost all from your pipelines — 85 / 15",
            w: [ 85, 15 ]
        },
        balanced: {
            label: "Mostly your pipelines — 70 / 30",
            w: [ 70, 30 ]
        },
        light: {
            label: "A lean, not a rule — 50 / 50",
            w: [ 50, 50 ]
        },
        nationwide: {
            label: "Nationwide — ignore pipelines",
            w: [ 0, 100 ]
        }
    };
    const WALKON_OVR = 41;
    const DIV_LEANS = {
        off: {
            frac: 0
        },
        on: {
            frac: 1 / 3
        }
    };
    const LOWER_DIVS = new Set([ "D2", "D3" ]);
    const popPref = (q, pref) => {
        if (pref) {
            for (let i = q.length - 1; i >= 0; i--) {
                const lower = LOWER_DIVS.has(q[i].source_tier);
                if (pref === "lower" ? lower : !lower) return q.splice(i, 1)[0];
            }
        }
        return q.pop();
    };
    const AGE_BY_YEAR = {
        0: 18,
        1: 19,
        2: 20,
        3: 21
    };
    const AGE_MAX = 23;
    function writeYearAndAge(player, year) {
        player.PLYR_SCHOOLYEAR = String(year);
        const redshirt = Number(player.PLYR_REDSHIRTED || 0) !== 0;
        player.PLYR_AGE = String(Math.min((AGE_BY_YEAR[year] ?? 19) + (redshirt ? 1 : 0), AGE_MAX));
    }
    const RS_RATE = .35;
    const RS_YES = "3";
    const resolveRS = (poolRS, rng) => poolRS === 1 || poolRS === "1" ? RS_YES : poolRS === 0 || poolRS === "0" ? "0" : rng() < RS_RATE ? RS_YES : "0";
    let RNG = Math.random;
    function pickWeighted(entries) {
        const total = entries.reduce((a, e) => a + e.weight, 0);
        if (total <= 0) return null;
        let r = RNG() * total;
        for (const e of entries) {
            r -= e.weight;
            if (r <= 0) return e;
        }
        return entries[entries.length - 1];
    }
    function shuffled(a) {
        const out = [ ...a ];
        for (let i = out.length - 1; i > 0; i--) {
            const j = Math.floor(RNG() * (i + 1));
            [out[i], out[j]] = [ out[j], out[i] ];
        }
        return out;
    }
    function localSupply(picked, pool) {
        const wantFull = typeof CFB27_CONFIG !== "undefined" && CFB27_CONFIG.deficitBasis === "full";
        if (wantFull && STATS && Array.isArray(STATS.pipelines)) {
            let n = 0;
            for (const id of picked) {
                n += id === INTL_ID ? STATS.unplaced?.full || 0 : STATS.pipelines.find(q => q.id === id)?.full?.have || 0;
            }
            return {
                supply: n,
                basis: "full"
            };
        }
        return {
            supply: pool.filter(p => picked.has(pipeOf(p))).length,
            basis: "usable"
        };
    }
    const clampTier = t => {
        const n = Math.round(Number(t));
        return Number.isFinite(n) ? Math.min(5, Math.max(1, n)) : 3;
    };
    const tierWeight = t => Math.pow(t, 1.25);
    function writeIdentity(ctx, pid, player, chosen) {
        const {visuals: visuals, usedHeads: usedHeads, report: report} = ctx;
        player.PLYR_FIRSTNAME = chosen.first_name;
        player.PLYR_LASTNAME = chosen.last_name;
        player.PLYR_HEIGHT = String(chosen.height_in);
        player.PLYR_WEIGHT = String(chosen.weight_lbs - 160);
        player.PLYR_SCHOOLYEAR = String(chosen.school_year);
        if (chosen.jersey !== "" && chosen.jersey != null) player.PLYR_JERSEYNUM = String(chosen.jersey);
        if (chosen.home_town) player.PLYR_HOME_TOWN = chosen.home_town;
        if (chosen.home_state_code != null) player.PLYR_HOME_STATE = String(chosen.home_state_code);
        if (chosen.skin_tone !== "" && chosen.skin_tone != null) {
            player.PLYR_SKINTONE = String(chosen.skin_tone);
        } else {
            report.noTone++;
        }
        const v = visuals[pid];
        if (!(v && typeof v === "object")) report.noVisuals++;
        if (v && typeof v === "object") {
            v.firstName = chosen.first_name;
            v.lastName = chosen.last_name;
            v.jerseyName = chosen.last_name;
            v.heightInches = chosen.height_in;
            v.weightPounds = chosen.weight_lbs;
            if (chosen.jersey !== "" && chosen.jersey != null) v.jerseyNumber = Number(chosen.jersey);
            if (chosen.skin_tone !== "" && chosen.skin_tone != null) v.skinTone = Number(chosen.skin_tone);
        }
        if (v && typeof v === "object") {
            const complexionOf = r => {
                const m = /_[A-Z]+_(\d+)_\d+$/.exec(r || "");
                return m ? m[1] : null;
            };
            const hasTone = chosen.skin_tone !== "" && chosen.skin_tone != null;
            const tone = hasTone ? String(chosen.skin_tone) : complexionOf(v.genericHeadName || "");
            const catalogue = D.headsCompleteByTone || {};
            const bucket = tone ? catalogue[tone] : null;
            let head = null;
            if (bucket && bucket.length) {
                for (let tries = 0; tries < 40; tries++) {
                    const cand = bucket[RNG() * bucket.length | 0];
                    if (!usedHeads.has(cand[0])) {
                        head = cand;
                        break;
                    }
                }
                if (head === null) head = bucket.find(h => !usedHeads.has(h[0])) || null;
            }
            if (head === null) {
                for (const b of Object.values(catalogue)) {
                    const free = b.find(h => !usedHeads.has(h[0]));
                    if (free) {
                        head = free;
                        break;
                    }
                }
            }
            const noteTone = recipe => {
                const comp = complexionOf(recipe);
                if (comp == null) return;
                if (hasTone && comp !== String(chosen.skin_tone)) report.toneSwapped++;
                player.PLYR_SKINTONE = comp;
                v.skinTone = Number(comp);
            };
            if (head) {
                usedHeads.add(head[0]);
                v.genericHeadName = head[0];
                v.genericHead = head[1];
                player.PLYR_PORTRAIT = String(parseInt(head[0].split("_")[1], 10));
                noteTone(head[0]);
            } else if (v.genericHeadName) {
                usedHeads.add(v.genericHeadName);
                noteTone(v.genericHeadName);
            }
        }
        report.named++;
    }
    function nameRoster(opts) {
        if (typeof WORK === "undefined" || !WORK) return null;
        if (!POOL.players.length) return {
            error: "The player pool is empty. Collect a school first."
        };
        RNG = opts.rng || Math.random;
        const sel = opts.pipelines || [];
        const tierBy = new Map(Array.isArray(sel) ? sel.map(id => [ id, 3 ]) : Object.entries(sel).map(([id, t]) => [ id, clampTier(t) ]));
        const picked = new Set(tierBy.keys());
        const rawLocal = opts.localPct;
        const requestedLocal = rawLocal == null || rawLocal === "" || !Number.isFinite(Number(rawLocal)) ? null : Math.min(100, Math.max(0, Math.round(Number(rawLocal))));
        const NEIGH = {};
        for (const p of PIPES.pipelines || []) NEIGH[p.id] = p.neighbors || [];
        const nearSet = new Set;
        for (const id of picked) for (const n of NEIGH[id] || []) if (!picked.has(n)) nearSet.add(n);
        const tierOf = p => picked.has(pipeOf(p)) ? 0 : nearSet.has(p.pipeline) ? 1 : 2;
        const divs = opts.divisions || divFilter;
        let pool = divs ? POOL.players.filter(p => divs.has(p.source_tier)) : POOL.players;
        const usedRaw = opts.usedKeys ? [ ...opts.usedKeys ] : null;
        const usedSet = usedRaw && usedRaw.length ? new Set(usedRaw) : null;
        let usedExcluded = 0;
        let usedLocalGone = 0;
        if (usedSet) {
            const kept = [];
            for (const p of pool) {
                if (usedSet.has(poolKey(p))) {
                    usedExcluded++;
                    if (picked.has(pipeOf(p))) usedLocalGone++;
                } else kept.push(p);
            }
            pool = kept;
        }
        const pinsIn = opts.pins && Object.keys(opts.pins).length ? opts.pins : null;
        const pinned = new Map;
        const pinRejected = [];
        let drawPool = pool;
        if (pinsIn) {
            const byKey = new Map(pool.map(p => [ poolKey(p), p ]));
            const claimed = new Set;
            const pd = WORK.teamData.roster.playerData;
            for (const [pid, key] of Object.entries(pinsIn).sort((a, b) => Number(a[0]) - Number(b[0]))) {
                const slot = pd[pid];
                if (!slot) {
                    pinRejected.push({
                        pid: pid,
                        key: key,
                        reason: "no such roster slot"
                    });
                    continue;
                }
                if (usedSet && usedSet.has(key)) {
                    pinRejected.push({
                        pid: pid,
                        key: key,
                        reason: "claimed by another team"
                    });
                    continue;
                }
                const cand = byKey.get(key);
                if (!cand) {
                    pinRejected.push({
                        pid: pid,
                        key: key,
                        reason: "not in the pool"
                    });
                    continue;
                }
                if (claimed.has(key)) {
                    pinRejected.push({
                        pid: pid,
                        key: key,
                        reason: "already pinned to another slot"
                    });
                    continue;
                }
                const pos = D.positionCodes[String(parseInt(slot.PLYR_POSITION, 10))];
                if (!(SLOT_SOURCES[pos] || []).includes(cand.pos_group)) {
                    pinRejected.push({
                        pid: pid,
                        key: key,
                        reason: `a ${cand.pos_group} can't fill ${pos}`
                    });
                    continue;
                }
                claimed.add(key);
                pinned.set(pid, cand);
            }
            if (pinned.size) drawPool = pool.filter(p => !claimed.has(poolKey(p)));
        }
        let localCap = null;
        let effectiveLocal = requestedLocal;
        const rosterSize = Object.keys(WORK.teamData.roster.playerData).length;
        const slotsToDraw = rosterSize - pinned.size;
        if (requestedLocal != null && picked.size && slotsToDraw > 0) {
            const {supply: supplyRaw, basis: basis} = localSupply(picked, pool);
            const supply = basis === "full" ? Math.max(0, supplyRaw - usedLocalGone) : supplyRaw;
            const pinnedLocal = [ ...pinned.values() ].filter(p => picked.has(pipeOf(p))).length;
            const left = Math.max(0, supply - pinnedLocal);
            const want = Math.round(slotsToDraw * requestedLocal / 100);
            if (left < want) {
                effectiveLocal = Math.floor(100 * left / slotsToDraw);
                localCap = {
                    supply: left,
                    rosterSize: slotsToDraw,
                    requested: requestedLocal,
                    effective: effectiveLocal,
                    basis: basis
                };
                if (pinned.size) localCap.pinnedLocal = pinnedLocal;
            }
        }
        const [wSel, wRest] = requestedLocal != null ? [ effectiveLocal, 100 - effectiveLocal ] : (LEANS[opts.lean] || LEANS.balanced).w;
        const weights = [ wSel, wRest * .85, wRest * .15 ];
        const divLean = DIV_LEANS[opts.divisionLean] || DIV_LEANS.on;
        const avail = {};
        for (const p of shuffled(drawPool)) {
            const g = p.pos_group;
            const t = tierOf(p);
            const buckets = avail[g] ||= [ new Map, [], [] ];
            if (t === 0) {
                const key = pipeOf(p);
                let q = buckets[0].get(key);
                if (!q) buckets[0].set(key, q = []);
                q.push(p);
            } else {
                buckets[t].push(p);
            }
        }
        const tierLeft = (buckets, t) => t === 0 ? [ ...buckets[0].values() ].reduce((n, q) => n + q.length, 0) : buckets[t].length;
        const groupLeft = g => avail[g] ? tierLeft(avail[g], 0) + tierLeft(avail[g], 1) + tierLeft(avail[g], 2) : 0;
        const roster = WORK.teamData.roster.playerData;
        const visuals = WORK.teamData.frostbiteData?.characterVisuals || {};
        const bandCap = Math.round(Object.keys(roster).length * divLean.frac);
        const bandPids = new Set(!bandCap ? [] : Object.entries(roster).filter(([pid]) => !pinned.has(pid)).map(([pid, p]) => [ pid, parseInt(p.PLYR_OVERALLRATING, 10) || 0 ]).filter(e => e[1] <= WALKON_OVR).sort((a, b) => a[1] - b[1]).slice(0, bandCap).map(e => e[0]));
        const usedHeads = new Set;
        const assigned = [];
        const report = {
            named: 0,
            borrowed: [],
            unfilled: [],
            byTier: [ 0, 0 ],
            byProximity: [ 0, 0 ],
            noTone: 0,
            byPipeline: {},
            noPipeline: 0,
            toneSwapped: 0,
            noVisuals: 0
        };
        if (divLean.frac) report.byDivision = {
            band: bandPids.size,
            lowerInBand: 0,
            lowerOutside: 0
        };
        if (localCap) report.localCap = localCap;
        if (pinsIn) report.pins = {
            applied: pinned.size,
            rejected: pinRejected
        };
        if (usedSet) report.used = {
            excluded: usedExcluded
        };
        const ctx = {
            visuals: visuals,
            usedHeads: usedHeads,
            report: report
        };
        const assignIdentity = (pid, player, chosen, chosenTier) => {
            writeIdentity(ctx, pid, player, chosen);
            assigned.push({
                pid: pid,
                player: player,
                year: Number(chosen.school_year) || 0,
                tier: chosenTier,
                rs: chosen.redshirt
            });
        };
        for (const [pid, chosen] of pinned) assignIdentity(pid, roster[pid], chosen, 0);
        const slots = Object.entries(roster).filter(([pid]) => !pinned.has(pid)).sort((a, b) => {
            const ga = D.positionCodes[String(parseInt(a[1].PLYR_POSITION, 10))];
            const gb = D.positionCodes[String(parseInt(b[1].PLYR_POSITION, 10))];
            const supply = pos => (SLOT_SOURCES[pos] || []).reduce((n, g) => n + groupLeft(g), 0);
            return supply(ga) - supply(gb);
        });
        for (const [pid, player] of slots) {
            const pos = D.positionCodes[String(parseInt(player.PLYR_POSITION, 10))];
            const sources = SLOT_SOURCES[pos] || [];
            const divPref = !divLean.frac ? null : bandPids.has(pid) ? "lower" : "fcs";
            let chosen = null, fromGroup = null, chosenTier = 2;
            const takeFrom = (buckets, tier, g) => {
                if (tier === 0) {
                    const inPlay = [ ...buckets[0].entries() ].filter(([, q]) => q.length).map(([id, q]) => ({
                        q: q,
                        weight: tierWeight(tierBy.get(id) ?? 3)
                    }));
                    chosen = popPref(pickWeighted(inPlay).q, divPref);
                } else {
                    chosen = popPref(buckets[tier], divPref);
                }
                fromGroup = g;
                chosenTier = tier;
                if (tier === 0) report.byTier[0]++; else {
                    report.byTier[1]++;
                    report.byProximity[tier - 1]++;
                }
                if (chosen.pipeline) {
                    report.byPipeline[chosen.pipeline] = (report.byPipeline[chosen.pipeline] || 0) + 1;
                } else {
                    if (tier === 0) report.byPipeline[INTL_ID] = (report.byPipeline[INTL_ID] || 0) + 1;
                    report.noPipeline++;
                }
            };
            for (const g of sources) {
                const buckets = avail[g];
                if (!buckets) continue;
                const options = [ 0, 1, 2 ].map(t => ({
                    tier: t,
                    weight: weights[t],
                    left: tierLeft(buckets, t)
                })).filter(o => o.left && o.weight > 0);
                if (!options.length) continue;
                takeFrom(buckets, pickWeighted(options).tier, g);
                break;
            }
            if (!chosen) for (const g of sources) {
                const buckets = avail[g];
                if (!buckets) continue;
                const fallback = [ 0, 1, 2 ].map(t => ({
                    tier: t,
                    left: tierLeft(buckets, t)
                })).find(o => o.left);
                if (!fallback) continue;
                takeFrom(buckets, fallback.tier, g);
                break;
            }
            if (!chosen) {
                report.unfilled.push(pos);
                continue;
            }
            if (report.byDivision && LOWER_DIVS.has(chosen.source_tier)) {
                report.byDivision[bandPids.has(pid) ? "lowerInBand" : "lowerOutside"]++;
            }
            if (FAMILY[fromGroup] !== FAMILY[sources[0]]) report.borrowed.push(`${pos} ← ${fromGroup}`);
            assignIdentity(pid, player, chosen, chosenTier);
        }
        if (opts.classYears === "off") {
            for (const a of assigned) writeYearAndAge(a.player, a.year);
        } else {
            for (const a of assigned) {
                a.player.PLYR_REDSHIRTED = resolveRS(a.rs, RNG);
                writeYearAndAge(a.player, a.year);
            }
        }
        DIRTY = true;
        return report;
    }
    function swapSlots(requests, opts = {}) {
        if (typeof WORK === "undefined" || !WORK) return null;
        if (!POOL.players.length) return {
            error: "The player pool is empty. Collect a school first."
        };
        const applied = [], rejected = [];
        const reqs = requests && Object.keys(requests).length ? requests : null;
        if (!reqs) return {
            applied: applied,
            rejected: rejected
        };
        RNG = opts.rng || Math.random;
        const roster = WORK.teamData.roster.playerData;
        const visuals = WORK.teamData.frostbiteData?.characterVisuals || {};
        const pool = filteredPool();
        const byKey = new Map(pool.map(p => [ poolKey(p), p ]));
        const onRoster = new Set;
        for (const p of Object.values(roster)) {
            const head = [ String(p.PLYR_FIRSTNAME ?? "").toLowerCase(), String(p.PLYR_LASTNAME ?? "").toLowerCase(), parseInt(p.PLYR_HEIGHT, 10), parseInt(p.PLYR_WEIGHT, 10) + 160 ].join("|");
            const key = `${head}|${String(p.PLYR_HOME_TOWN ?? "").trim().toLowerCase()}`;
            if (byKey.has(key)) onRoster.add(key); else if (byKey.has(`${head}|`)) onRoster.add(`${head}|`);
        }
        const usedRaw = opts.usedKeys ? [ ...opts.usedKeys ] : null;
        const usedSet = usedRaw && usedRaw.length ? new Set(usedRaw) : null;
        const usedHeads = new Set;
        for (const v of Object.values(visuals)) {
            if (v && typeof v === "object" && v.genericHeadName) usedHeads.add(v.genericHeadName);
        }
        const localPref = selection.size ? new Set(selection.keys()) : null;
        const report = {
            named: 0,
            noTone: 0,
            noVisuals: 0,
            toneSwapped: 0
        };
        const ctx = {
            visuals: visuals,
            usedHeads: usedHeads,
            report: report
        };
        const free = k => !onRoster.has(k) && !(usedSet && usedSet.has(k));
        for (const [pid, want] of Object.entries(reqs).sort((a, b) => Number(a[0]) - Number(b[0]))) {
            const slot = roster[pid];
            if (!slot) {
                rejected.push({
                    pid: pid,
                    reason: "no such roster slot"
                });
                continue;
            }
            const pos = D.positionCodes[String(parseInt(slot.PLYR_POSITION, 10))];
            const sources = SLOT_SOURCES[pos] || [];
            let chosen = null;
            if (want) {
                if (usedSet && usedSet.has(want)) {
                    rejected.push({
                        pid: pid,
                        reason: "claimed by another team"
                    });
                    continue;
                }
                const cand = byKey.get(want);
                if (!cand) {
                    rejected.push({
                        pid: pid,
                        reason: "not in the pool"
                    });
                    continue;
                }
                if (onRoster.has(want)) {
                    rejected.push({
                        pid: pid,
                        reason: "already on this roster"
                    });
                    continue;
                }
                if (!sources.includes(cand.pos_group)) {
                    rejected.push({
                        pid: pid,
                        reason: `a ${cand.pos_group} can't fill ${pos}`
                    });
                    continue;
                }
                chosen = cand;
            } else {
                const ovr = parseInt(slot.PLYR_OVERALLRATING, 10) || 0;
                const wantLower = ovr <= WALKON_OVR;
                for (const g of sources) {
                    let cands = pool.filter(p => p.pos_group === g && free(poolKey(p)));
                    if (!cands.length) continue;
                    if (localPref) {
                        const local = cands.filter(p => localPref.has(pipeOf(p)));
                        if (local.length) cands = local;
                    }
                    const pref = cands.filter(p => wantLower ? LOWER_DIVS.has(p.source_tier) : !LOWER_DIVS.has(p.source_tier));
                    if (pref.length) cands = pref;
                    chosen = cands[RNG() * cands.length | 0];
                    break;
                }
                if (!chosen) {
                    rejected.push({
                        pid: pid,
                        reason: `the pool has nobody left for ${pos}`
                    });
                    continue;
                }
            }
            const out = `${slot.PLYR_FIRSTNAME} ${slot.PLYR_LASTNAME}`;
            writeIdentity(ctx, pid, slot, chosen);
            slot.PLYR_REDSHIRTED = resolveRS(chosen.redshirt, RNG);
            writeYearAndAge(slot, Number(chosen.school_year) || 0);
            onRoster.add(poolKey(chosen));
            applied.push({
                pid: pid,
                pos: pos,
                out: out,
                in: `${chosen.first_name} ${chosen.last_name}`,
                key: poolKey(chosen)
            });
        }
        if (applied.length) DIRTY = true;
        return {
            applied: applied,
            rejected: rejected,
            noTone: report.noTone,
            toneSwapped: report.toneSwapped,
            noVisuals: report.noVisuals
        };
    }
    function run() {
        const el = id => document.getElementById(id);
        const out = el("poolOut");
        const fail = msg => {
            if (!out) return;
            out.style.display = "block";
            out.className = "predict bad";
            out.innerHTML = msg;
        };
        if (typeof WORK === "undefined" || !WORK) {
            return fail("No roster loaded. Pull one from Team Builder first.");
        }
        let r;
        try {
            r = nameRoster({
                pipelines: selectedTiers(),
                localPct: Number(el("poolLocal")?.value ?? 100),
                pins: window.CFB27PoolBrowser?.pins?.(),
                usedKeys: window.CFB27UsedRegistry?.excludedKeys?.()
            });
        } catch (e) {
            console.error("[CFB27] naming failed", e);
            return fail(`Naming failed: <b>${esc(e.message)}</b><br>` + `<span class="muted small">build ${BUILD.id} · ${POOL.players.length} players in the pool</span>` + `<pre class="small" style="white-space:pre-wrap">${esc(String(e.stack || ""))}</pre>`);
        }
        if (!r) return fail("No roster loaded. Pull one from Team Builder first.");
        if (r.error) return fail(r.error);
        const a = audit();
        try {
            window.CFB27Table?.render?.();
        } catch (e) {
            console.error("[CFB27] naming succeeded but the redraw failed", e);
            return fail(`Named <b>${r.named}</b> players — the roster table just failed to redraw: ` + `<b>${esc(e.message)}</b>. The edit is in place and safe to push.`);
        }
        if (typeof changeBlip === "function") changeBlip();
        const bits = [ `Named <b>${r.named}</b> players from the pool.` ];
        if (a) {
            const ok = a.fromPool === a.total && !a.visualsDisagree;
            if (ok) {
                console.info(`[CFB27] read back: all ${a.total} rows hold a pool name, ` + `${a.changed} differ from the pulled file, both identity blocks agree`);
            } else {
                bits.push(`<b>Read back: ${a.fromPool} of ${a.total}</b> hold a pool name` + (a.visualsDisagree ? `, and <b>${a.visualsDisagree}</b> characterVisuals disagree with playerData` : "") + ".");
            }
        }
        if (r.pins) {
            if (r.pins.applied) bits.push(`<b>${r.pins.applied}</b> pinned.`);
            if (r.pins.rejected.length) {
                bits.push(`<b>${r.pins.rejected.length} pin(s) skipped:</b> ` + r.pins.rejected.map(x => `${esc(x.key.split("|").slice(0, 2).join(" "))} — ${esc(x.reason)}`).join("; ") + ".");
            }
        }
        if (r.used?.excluded) {
            console.info(`[CFB27] ${r.used.excluded} pool player(s) already on other teams — excluded`);
        }
        if (r.localCap) {
            bits.push(`<b>Reach capped:</b> your pipelines can only fill ${r.localCap.supply} of ` + `${r.localCap.rosterSize} (${r.localCap.basis} basis) — reach capped at ` + `<b>${r.localCap.effective}%</b>, you asked for ${r.localCap.requested}%. ` + `<span class="muted">Collect there, add a pipeline, or lower the slider.</span>`);
        }
        if (r.byTier[0] || r.byTier[1]) {
            const top = Object.entries(r.byPipeline).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([id, n]) => `${PIPE_NAME.get(id) || id} ${n}`).join(", ");
            console.info(`[CFB27] ${r.byTier[0]} from pipelines, ${r.byTier[1]} from outside` + (r.byTier[1] ? ` (${r.byProximity[0]} bordering, ${r.byProximity[1]} national)` : "") + (top ? ` · ${top}` : "") + (r.noPipeline ? ` · ${r.noPipeline} from outside the US` : ""));
        }
        if (r.byDivision?.band) {
            const d = r.byDivision;
            bits.push(`<span class="muted">Walk-ons: <b>${d.lowerInBand}</b> of ${d.band} players ` + `rated ${WALKON_OVR} or lower drew a D2/D3 name` + (d.lowerOutside ? `, ${d.lowerOutside} more landed higher up` : "") + (d.lowerInBand < d.band ? ` — the rest fell back to FCS (the pool or your pipelines are thin in D2/D3 there).` : ".") + "</span>");
        }
        if (r.noTone) bits.push(`${r.noTone} had no skin tone recorded — those keep the template's.`);
        if (r.toneSwapped) {
            bits.push(`<b>${r.toneSwapped}</b> got a face from a different complexion — the head ` + `catalogue ran out in theirs, and their skin tone was changed to match the face. ` + `<span class="muted">A re-roll (⇄) may find a closer match.</span>`);
        }
        if (r.noVisuals) {
            bits.push(`<b>${r.noVisuals}</b> had no characterVisuals entry — renamed, but they keep ` + `the template's face and build in game.`);
        }
        if (r.borrowed.length) {
            const counts = {};
            r.borrowed.forEach(b => {
                counts[b] = (counts[b] || 0) + 1;
            });
            console.info("[CFB27] borrowed across positions: " + Object.entries(counts).map(([k, n]) => `${k}${n > 1 ? " ×" + n : ""}`).join(", "));
        }
        if (r.unfilled.length) {
            bits.push(`<b>${r.unfilled.length} slot(s) left unnamed</b> — pool exhausted at ` + [ ...new Set(r.unfilled) ].join(", ") + ". Collect another school.");
        }
        out.style.display = "block";
        out.className = "predict" + (r.unfilled.length || r.localCap || r.pins?.rejected.length ? " warn" : " good");
        out.innerHTML = bits.join(" ");
    }
    const pipeEl = id => document.getElementById(id);
    const selection = new Map;
    function selectedPipelines() {
        return [ ...selection.keys() ];
    }
    function selectedTiers() {
        const out = {};
        for (const [id, t] of selection) out[id] = t;
        return out;
    }
    const FILL_FAMILY = {
        QB: "QB",
        HB: "HB",
        FB: "HB",
        WR: "WR",
        TE: "TE",
        LT: "OL",
        LG: "OL",
        C: "OL",
        RG: "OL",
        RT: "OL",
        LE: "front",
        RE: "front",
        DT: "front",
        LOLB: "LB",
        MLB: "LB",
        ROLB: "LB",
        CB: "back",
        FS: "back",
        SS: "back",
        K: "ST",
        P: "ST"
    };
    const GROUP_FAMILY = {
        QB: "QB",
        HB: "HB",
        FB: "HB",
        WR: "WR",
        TE: "TE",
        OL: "OL",
        DL: "front",
        EDGE: "front",
        DT: "front",
        LB: "LB",
        DB: "back",
        CB: "back",
        S: "back",
        K: "ST",
        P: "ST"
    };
    function capacity(chosen) {
        if (typeof WORK === "undefined" || !WORK) return null;
        const roster = WORK.teamData?.roster?.playerData;
        if (!roster) return null;
        const need = {};
        for (const p of Object.values(roster)) {
            const pos = D.positionCodes[String(parseInt(p.PLYR_POSITION, 10))];
            const fam = FILL_FAMILY[pos];
            if (fam) need[fam] = (need[fam] || 0) + 1;
        }
        const picked = new Set(chosen);
        const have = {};
        let total = 0;
        const pool = filteredPool();
        for (const p of pool) {
            if (!picked.has(pipeOf(p))) continue;
            total++;
            const fam = GROUP_FAMILY[p.pos_group];
            if (fam) have[fam] = (have[fam] || 0) + 1;
        }
        const short = Object.entries(need).filter(([fam, n]) => (have[fam] || 0) < n).map(([fam, n]) => ({
            fam: fam,
            have: have[fam] || 0,
            need: n
        })).sort((a, b) => b.need - b.have - (a.need - a.have));
        return {
            total: total,
            short: short,
            rosterSize: Object.keys(roster).length
        };
    }
    const FAMILY_LABEL = {
        QB: "quarterback",
        HB: "running back",
        WR: "receiver",
        TE: "tight end",
        OL: "offensive line",
        front: "defensive line",
        LB: "linebacker",
        back: "secondary",
        ST: "kicker/punter"
    };
    function setDivisionFilter(value) {
        if (!value || value === "all") {
            divFilter = null;
        } else {
            divFilter = new Set(value.split(","));
        }
        recountPipes();
        repaintPicker();
    }
    function predictedPipeSplit() {
        if (typeof WORK === "undefined" || !WORK || !WORK.teamData?.roster?.playerData) return null;
        if (!selection.size) return null;
        const slider = pipeEl("poolLocal");
        if (!slider) return null;
        const pct = Number(slider.value);
        const picked = new Set(selection.keys());
        const pinnedPlayers = window.CFB27PoolBrowser?.pinnedPlayers?.() || [];
        const slots = Object.keys(WORK.teamData.roster.playerData).length - pinnedPlayers.length;
        if (slots <= 0) return null;
        const used = window.CFB27UsedRegistry?.excludedKeys?.();
        const pool = used?.size ? filteredPool().filter(p => !used.has(poolKey(p))) : filteredPool();
        const supply = new Map([ ...picked ].map(id => [ id, 0 ]));
        for (const p of pool) {
            const id = pipeOf(p);
            if (supply.has(id)) supply.set(id, supply.get(id) + 1);
        }
        for (const p of pinnedPlayers) {
            const id = pipeOf(p);
            if (supply.has(id)) supply.set(id, Math.max(0, supply.get(id) - 1));
        }
        const totalSupply = [ ...supply.values() ].reduce((a, b) => a + b, 0);
        let localSlots = Math.min(Math.round(slots * pct / 100), totalSupply);
        const alloc = new Map([ ...picked ].map(id => [ id, 0 ]));
        let open = [ ...picked ];
        while (localSlots > 0 && open.length) {
            const wSum = open.reduce((a, id) => a + tierWeight(selection.get(id)), 0);
            let handed = 0;
            const next = [];
            for (const id of open) {
                const room = supply.get(id) - alloc.get(id);
                const share = Math.min(room, Math.round(localSlots * tierWeight(selection.get(id)) / wSum));
                alloc.set(id, alloc.get(id) + share);
                handed += share;
                if (alloc.get(id) < supply.get(id)) next.push(id);
            }
            if (!handed) break;
            localSlots -= handed;
            open = next;
        }
        return [ ...alloc ].map(([id, n]) => ({
            id: id,
            n: n
        }));
    }
    function paintPipeSummary() {
        const chosen = selectedPipelines();
        const label = pipeEl("pipeCount");
        if (!label) return;
        if (!chosen.length) {
            label.innerHTML = "none selected — the roster will come from everywhere";
            paintLocalCap();
            return;
        }
        const cap = capacity(chosen);
        let verdict = "";
        if (cap) {
            const n = cap.rosterSize;
            const art = /^(8|11|18)/.test(String(n)) ? "an" : "a";
            verdict = cap.short.length ? ` · <span class="thin">too thin for ${art} ${n}-man roster at ` + cap.short.slice(0, 3).map(s => `${FAMILY_LABEL[s.fam] || s.fam} (${s.have}/${s.need})`).join(", ") + " — the rest come from outside</span>" : ` · <span class="fills">enough to fill ${art} ${n}-man roster on its own</span>`;
        }
        const split = predictedPipeSplit();
        const perPipe = split ? split.filter(x => x.n > 0).sort((a, b) => b.n - a.n).map(x => `${PIPE_NAME.get(x.id) || x.id} ~${x.n}`).join(", ") : "";
        label.innerHTML = `${chosen.length} selected` + (perPipe ? ` · <span class="muted">${perPipe} of the roster's ${cap?.rosterSize ?? ""} slots</span>` : "") + verdict;
        paintLocalCap();
    }
    function paintLocalCap() {
        const el = pipeEl("poolLocalCap");
        const slider = pipeEl("poolLocal");
        if (!el || !slider) return;
        const pct = Number(slider.value);
        const val = pipeEl("poolLocalVal");
        if (val) val.textContent = String(pct);
        el.innerHTML = "";
        if (typeof WORK === "undefined" || !WORK || !WORK.teamData?.roster?.playerData) return;
        const picked = new Set(selection.keys());
        if (!picked.size || !pct) return;
        const pinnedPlayers = window.CFB27PoolBrowser?.pinnedPlayers?.() || [];
        const size = Object.keys(WORK.teamData.roster.playerData).length - pinnedPlayers.length;
        if (size <= 0) return;
        const used = window.CFB27UsedRegistry?.excludedKeys?.();
        const previewPool = used?.size ? filteredPool().filter(p => !used.has(poolKey(p))) : filteredPool();
        const usedLocalGone = used?.size ? filteredPool().filter(p => used.has(poolKey(p)) && picked.has(pipeOf(p))).length : 0;
        const {supply: countSupply, basis: basis} = localSupply(picked, previewPool);
        const rawSupply = basis === "full" ? Math.max(0, countSupply - usedLocalGone) : countSupply;
        const supply = Math.max(0, rawSupply - pinnedPlayers.filter(p => picked.has(pipeOf(p))).length);
        const want = Math.round(size * pct / 100);
        if (supply >= want) return;
        el.innerHTML = `<span class="capwarn">your pipelines can only fill ${supply} of ${size} ` + `(${basis} basis) — reach will cap at ${Math.floor(100 * supply / size)}%</span>`;
    }
    function addPipeline(id, tier) {
        if (selection.has(id)) return;
        const p = PICKER_PIPES.find(x => x.id === id);
        if (!p || !p.count) return;
        selection.set(id, clampTier(tier ?? 3));
        repaintPicker();
    }
    function removePipeline(id) {
        selection.delete(id);
        repaintPicker();
    }
    function repaintPicker() {
        renderSelected();
        renderMenu();
        paintPipeSummary();
    }
    function renderMenu() {
        const menu = pipeEl("pipeMenu");
        if (!menu) return;
        const q = String(pipeEl("pipeSearch")?.value || "").trim().toLowerCase();
        const rows = PICKER_PIPES.filter(p => !selection.has(p.id)).filter(p => !q || p.name.toLowerCase().includes(q));
        menu.innerHTML = rows.length ? rows.map(p => {
            const empty = !p.count;
            return `<div class="pipeopt${empty ? " off" : ""}" data-pipe="${esc(p.id)}"${empty ? ' title="No players from this pipeline in the pool yet."' : ""}>\n            <span>${esc(p.name)}</span></div>`;
        }).join("") : '<div class="pipeopt off">No matches.</div>';
    }
    function showMenu(open) {
        const menu = pipeEl("pipeMenu");
        if (menu) menu.style.display = open ? "" : "none";
    }
    function renderSelected() {
        const box = pipeEl("pipeSel");
        if (!box) return;
        if (!selection.size) {
            box.innerHTML = '<span class="muted small">No pipelines selected — the roster will come from everywhere.</span>';
            return;
        }
        box.innerHTML = [ ...selection.entries() ].map(([id, tier]) => {
            const p = PICKER_PIPES.find(x => x.id === id);
            return `<div class="piperow">\n        <span class="pipename">${esc(p?.name || id)}</span>\n        <label class="tierpick">Tier <select data-pipetier="${esc(id)}">${[ 1, 2, 3, 4, 5 ].map(t => `<option value="${t}"${t === tier ? " selected" : ""}>${t}</option>`).join("")}</select></label>\n        <button class="piperm" data-piperm="${esc(id)}" title="Remove this pipeline">×</button>\n      </div>`;
        }).join("");
    }
    function buildPipePicker() {
        const menu = pipeEl("pipeMenu");
        const search = pipeEl("pipeSearch");
        const sel = pipeEl("pipeSel");
        if (!menu || !search || !sel) return;
        if (!PIPES.pipelines.length) {
            sel.innerHTML = '<span class="muted small">No pipeline data loaded.</span>';
            return;
        }
        search.addEventListener("focus", () => {
            renderMenu();
            showMenu(true);
        });
        search.addEventListener("input", () => {
            renderMenu();
            showMenu(true);
        });
        search.addEventListener("keydown", e => {
            if (e.key === "Escape") {
                showMenu(false);
                return;
            }
            if (e.key !== "Enter") return;
            const q = String(search.value || "").trim().toLowerCase();
            const first = PICKER_PIPES.find(p => !selection.has(p.id) && p.count && (!q || p.name.toLowerCase().includes(q)));
            if (first) {
                addPipeline(first.id, 3);
                search.value = "";
                renderMenu();
            }
        });
        menu.addEventListener("mousedown", e => {
            const row = e.target?.closest?.("[data-pipe]");
            if (!row || row.classList.contains("off")) return;
            e.preventDefault();
            addPipeline(row.dataset.pipe, 3);
        });
        document.addEventListener?.("mousedown", e => {
            if (!e.target?.closest?.("#pipeSearch, #pipeMenu")) showMenu(false);
        });
        sel.addEventListener("change", e => {
            const id = e.target?.dataset?.pipetier;
            if (!id || !selection.has(id)) return;
            selection.set(id, clampTier(e.target.value));
            paintPipeSummary();
        });
        sel.addEventListener("click", e => {
            const id = e.target?.closest?.("[data-piperm]")?.dataset?.piperm;
            if (id) removePipeline(id);
        });
        pipeEl("pipeTop")?.addEventListener("click", () => {
            for (const p of PIPES.pipelines.filter(p => p.count).slice(0, 10)) {
                if (!selection.has(p.id)) selection.set(p.id, 3);
            }
            repaintPicker();
        });
        pipeEl("pipeNone")?.addEventListener("click", () => {
            selection.clear();
            repaintPicker();
        });
        showMenu(false);
        repaintPicker();
    }
    const BY_EA_ID = new Map(PIPES.pipelines.map(p => [ p.eaId, p.id ]));
    function detectPipelines() {
        if (typeof WORK === "undefined" || !WORK) return null;
        const info = WORK.teamData?.teamInfos || {};
        const stateCode = (PIPES.stateNames || {})[String(info.CITY_STATE || "").trim()];
        const homePipes = (PIPES.byState || {})[stateCode] || [];
        let raw = info.DYNASTY_PIPELINE_INFO;
        if (typeof raw === "string") {
            try {
                raw = JSON.parse(raw);
            } catch {
                raw = null;
            }
        }
        const influences = raw?.pipelineInfluences;
        if (Array.isArray(influences) && influences.length) {
            const strongest = new Map;
            for (const x of influences) {
                const id = BY_EA_ID.get(x.pipelineId) ?? INTL_ID;
                const value = Number(x.pipelineValue) || 0;
                if (value > 0 && value > (strongest.get(id) || 0)) strongest.set(id, value);
            }
            const scored = [ ...strongest.entries() ].map(([id, value]) => ({
                id: id,
                value: value
            })).sort((a, b) => b.value - a.value);
            if (scored.length) {
                const trusted = !homePipes.length || homePipes.includes(scored[0].id);
                if (trusted) {
                    const tiers = {};
                    for (const x of scored) tiers[x.id] = clampTier(5 * x.value / scored[0].value);
                    return {
                        ids: scored.map(x => x.id),
                        tiers: tiers,
                        source: "payload",
                        stateCode: stateCode,
                        why: `read from the team's own recruiting map in the file`
                    };
                }
                console.warn("[CFB27] DYNASTY_PIPELINE_INFO decoded to a pipeline outside " + `${info.CITY_STATE} — ignoring it and falling back to the state.`, {
                    top: scored[0],
                    expected: homePipes
                });
            }
        }
        if (homePipes.length) {
            const tiers = {};
            for (const id of homePipes) tiers[id] = 3;
            return {
                ids: homePipes,
                tiers: tiers,
                source: "state",
                stateCode: stateCode,
                why: `based on the team being in ${info.CITY_STATE}`
            };
        }
        return null;
    }
    let autoKey = null;
    function autoSelect(teamKey) {
        if (!pipeEl("pipeSel")) return;
        const key = teamKey ?? "unkeyed";
        if (autoKey === key) return;
        const switching = autoKey !== null;
        autoKey = key;
        if (switching) selection.clear();
        const found = detectPipelines();
        if (!found || !found.ids.length) {
            if (switching) {
                repaintPicker();
                console.info("[CFB27] new team pulled — previous pipeline selection cleared " + "(no recruiting map detected for this team)");
            }
            return;
        }
        let hit = 0, empty = 0;
        for (const id of found.ids) {
            const p = PICKER_PIPES.find(x => x.id === id);
            if (!p || !p.count) {
                empty++;
                continue;
            }
            if (!selection.has(id)) {
                selection.set(id, clampTier(found.tiers?.[id] ?? 3));
                hit++;
            }
        }
        repaintPicker();
        console.info(`[CFB27] ${switching ? "new team pulled — pipeline selection reset: " : ""}` + `preselected ${hit} pipeline(s) ${found.why}` + (empty ? ` (${empty} skipped — no players in the pool)` : ""));
    }
    window.CFB27Roster = {
        nameRoster: nameRoster,
        swapSlots: swapSlots,
        audit: audit,
        looksUnnamed: looksUnnamed,
        selectedPipelines: selectedPipelines,
        selectedTiers: selectedTiers,
        capacity: capacity,
        detectPipelines: detectPipelines,
        autoSelect: autoSelect,
        setDivisionFilter: setDivisionFilter,
        filteredPool: filteredPool,
        POOL: POOL,
        BUILD: BUILD,
        PIPES: PIPES,
        poolKey: poolKey,
        SLOT_SOURCES: SLOT_SOURCES,
        paintLocalCap: paintLocalCap
    };
    console.info(`[CFB27] roster module ready — ${BUILD.id}, ${POOL.players.length} players in the pool`);
    const wire = () => {
        document.getElementById("poolLocal")?.addEventListener("input", paintPipeSummary);
        buildPipePicker();
        document.getElementById("poolName")?.addEventListener("click", run);
    };
    if (typeof document !== "undefined" && document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", wire);
    } else {
        wire();
    }
}

if (typeof window !== "undefined") window.initCFB27Roster = initCFB27Roster;
