function initCFB27Generator(data) {
    const D = data.constants || {};
    const $id = id => typeof document !== "undefined" ? document.getElementById(id) : null;
    const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    }[c]));
    function normGroup(g) {
        return D.aliases[g] || g;
    }
    function pyRound(x) {
        const f = Math.floor(x), d = x - f;
        if (d > .5) return f + 1;
        if (d < .5) return f;
        return f % 2 === 0 ? f : f + 1;
    }
    function tierSensitivity(attr, group) {
        const [lo, hi] = D.clip;
        let s;
        if (group) {
            const pt = D.posSensitivity[normGroup(group)];
            if (pt && attr in pt) s = pt[attr];
        }
        if (s === undefined) s = attr in D.tierSensitivity ? D.tierSensitivity[attr] : D.tierDefault;
        return Math.max(lo, Math.min(hi, s));
    }
    function findExemplars(group, archetype) {
        const g = normGroup(group);
        const exact = D.exemplars.filter(e => normGroup(e.position_group) === g && e.archetype === archetype);
        if (exact.length) return {
            list: exact,
            exact: true
        };
        return {
            list: D.exemplars.filter(e => normGroup(e.position_group) === g),
            exact: false
        };
    }
    function pickExemplar(group, archetype, targetOvr) {
        const {list: list, exact: exact} = findExemplars(group, archetype);
        if (!list.length) throw new Error(`No exemplar data for position '${group}'`);
        let best = list[0];
        for (const e of list) if (Math.abs(e.ovr - targetOvr) < Math.abs(best.ovr - targetOvr)) best = e;
        return {
            exemplar: best,
            exact: exact
        };
    }
    function generateAttributes(group, archetype, devTrait, targetOvr, opts = {}) {
        const {exemplar: exemplar, exact: exact} = pickExemplar(group, archetype, targetOvr);
        const pg = normGroup(group);
        const gap = exemplar.ovr - targetOvr;
        const attrs = {};
        for (const [name, val] of Object.entries(exemplar.attributes)) {
            let v = val - tierSensitivity(name, pg) * gap;
            if (opts.isRecruit && D.mentalAttrs.includes(name)) v -= opts.freshmanDiscount || 0;
            attrs[name] = pyRound(Math.max(D.attrMin, Math.min(D.attrMax, v)));
        }
        return {
            attrs: attrs,
            meta: {
                exemplar: exemplar.player,
                exemplarOvr: exemplar.ovr,
                exact: exact,
                gap: gap
            }
        };
    }
    const players = () => WORK ? WORK.teamData.roster.playerData : {};
    const posOf = p => D.positionCodes[String(parseInt(p.PLYR_POSITION, 10))];
    const groupOf = p => D.positionGroup[posOf(p)];
    const devOf = p => D.devTraitCodes[String(parseInt(p.PLYR_TRAITDEVELOPMENT, 10))];
    const ovrOf = p => parseInt(p.PLYR_OVERALLRATING, 10);
    function assignArchetypes(off, def) {
        const byGroup = {};
        for (const [pid, p] of Object.entries(players())) {
            const g = groupOf(p);
            (byGroup[g] = byGroup[g] || []).push([ ovrOf(p), pid ]);
        }
        const out = {};
        for (const [g, list] of Object.entries(byGroup)) {
            list.sort((a, b) => b[0] - a[0] || (a[1] < b[1] ? 1 : a[1] > b[1] ? -1 : 0));
            let prio = (D.offensiveSchemes[off] || {})[g] || (D.defensiveSchemes[def] || {})[g] || [];
            const valid = D.archetypesByGroup[g] || [];
            prio = prio.filter(a => valid.includes(a));
            if (!prio.length) prio = valid;
            list.forEach(([, pid], i) => {
                out[pid] = prio[i % prio.length];
            });
        }
        return out;
    }
    const OFF_ORDER = [ "QB", "HB", "FB", "WR", "TE", "LT", "LG", "C", "RG", "RT" ];
    const DEF_ORDER = [ "LE", "RE", "DT", "LOLB", "MLB", "ROLB", "CB", "FS", "SS" ];
    const ST_ORDER = [ "K", "P" ];
    const CODE_OF = {};
    for (const [code, pos] of Object.entries(D.positionCodes || {})) CODE_OF[pos] = parseInt(code, 10);
    const isPresetPair = (off, def) => !!(D.offensivePresets && D.offensivePresets[off] && D.defensivePresets && D.defensivePresets[def]);
    function slotArchetypes(template, count) {
        const out = [];
        for (let i = 0; i < count; i++) out.push(template[i % template.length]);
        return out;
    }
    function presetCounts(offKey) {
        const off = D.offensivePresets[offKey];
        return {
            ...off.rosterCounts,
            ...off.defensiveCounts
        };
    }
    function buildRosterSlots(offPresetKey, defPresetKey) {
        if (!isPresetPair(offPresetKey, defPresetKey)) return null;
        const off = D.offensivePresets[offPresetKey];
        const def = D.defensivePresets[defPresetKey];
        const counts = presetCounts(offPresetKey);
        const slots = [];
        const push = (pos, archs) => archs.forEach((archetype, slotIndex) => slots.push({
            position: pos,
            positionCode: CODE_OF[pos],
            slotIndex: slotIndex,
            archetype: archetype
        }));
        for (const pos of OFF_ORDER) push(pos, slotArchetypes(off.archetypeTemplate[pos], counts[pos]));
        for (const pos of DEF_ORDER) push(pos, slotArchetypes(def.archetypeTemplate[pos], counts[pos]));
        for (const pos of ST_ORDER) push(pos, slotArchetypes(off.archetypeTemplate[pos], counts[pos]));
        return slots;
    }
    const byOvrDesc = (a, b) => b[0] - a[0] || (a[1] < b[1] ? 1 : a[1] > b[1] ? -1 : 0);
    function applyPresetPositions(offPresetKey, defPresetKey) {
        if (!isPresetPair(offPresetKey, defPresetKey)) return 0;
        const want = presetCounts(offPresetKey);
        const ORDER = [ ...OFF_ORDER, ...DEF_ORDER, ...ST_ORDER ];
        const byPos = {};
        for (const [pid, p] of Object.entries(players())) {
            const pos = posOf(p);
            (byPos[pos] = byPos[pos] || []).push([ ovrOf(p), pid ]);
        }
        const surplus = [];
        const deficits = [];
        for (const pos of ORDER) {
            const list = (byPos[pos] || []).sort(byOvrDesc);
            const n = want[pos] || 0;
            if (list.length > n) surplus.push(...list.slice(n));
            for (let i = list.length; i < n; i++) deficits.push(pos);
        }
        surplus.sort(byOvrDesc);
        let moved = 0;
        for (const pos of deficits) {
            const take = surplus.shift();
            if (!take) break;
            players()[take[1]].PLYR_POSITION = String(CODE_OF[pos]);
            moved++;
        }
        return moved;
    }
    function assignPresetArchetypes(offPresetKey, defPresetKey) {
        const off = D.offensivePresets[offPresetKey];
        const def = D.defensivePresets[defPresetKey];
        const byPos = {};
        for (const [pid, p] of Object.entries(players())) {
            const pos = posOf(p);
            (byPos[pos] = byPos[pos] || []).push([ ovrOf(p), pid ]);
        }
        const out = {};
        for (const [pos, list] of Object.entries(byPos)) {
            list.sort(byOvrDesc);
            const tpl = off.archetypeTemplate[pos] || def.archetypeTemplate[pos] || D.archetypesByGroup[D.positionGroup[pos]] || [];
            list.forEach(([, pid], i) => {
                out[pid] = tpl[i % tpl.length];
            });
        }
        return out;
    }
    const isSpecialist = e => {
        const pos = posOf(e.player);
        return pos === "K" || pos === "P";
    };
    const DEV_LOTTERY_EXP = 5;
    function mulberry32(seed) {
        let a = seed >>> 0;
        return function() {
            a = a + 1831565813 >>> 0;
            let t = a;
            t = Math.imul(t ^ t >>> 15, t | 1);
            t ^= t + Math.imul(t ^ t >>> 7, t | 61);
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };
    }
    function weightedDraw(pool, k, rng, weightOf) {
        const cands = [ ...pool ], weights = cands.map(weightOf), picked = [];
        for (let n = 0; n < k && cands.length; n++) {
            const total = weights.reduce((a, b) => a + b, 0);
            let r = rng() * total, idx = 0;
            for (;idx < cands.length - 1; idx++) {
                r -= weights[idx];
                if (r < 0) break;
            }
            picked.push(cands[idx]);
            cands.splice(idx, 1);
            weights.splice(idx, 1);
        }
        return picked;
    }
    function assignDevTraits(list, tierIndex, rng) {
        const tier = (D.prestigeTiers || []).find(t => t.tier === Number(tierIndex));
        if (!tier) return null;
        const q = tier.devQuotas;
        const ranked = [ ...list ].sort((a, b) => b.ovr - a.ovr || (String(a.pid) < String(b.pid) ? 1 : String(a.pid) > String(b.pid) ? -1 : 0));
        const counts = {
            elite: 0,
            star: 0,
            impact: 0,
            normal: 0,
            impactFlags: 0
        };
        const names = {
            3: "elite",
            2: "star",
            1: "impact",
            0: "normal"
        };
        const rankIndex = new Map(ranked.map((e, i) => [ e, i ]));
        const tickets = e => Math.pow(ranked.length - rankIndex.get(e), DEV_LOTTERY_EXP);
        const remaining = new Set(ranked);
        const give = (e, dev) => {
            e.dev = dev;
            counts[names[dev]]++;
            e.player.PLYR_TRAITDEVELOPMENT = String(dev);
            e.player.PLYR_IS_IMPACT_PLAYER = "0";
            remaining.delete(e);
        };
        for (const [want, dev] of [ [ q.elite, 3 ], [ q.star, 2 ], [ q.impact, 1 ] ]) {
            const eligible = [ ...remaining ].filter(e => dev < 2 || !isSpecialist(e)).sort((a, b) => rankIndex.get(a) - rankIndex.get(b));
            const drawn = rng ? weightedDraw(eligible, want, rng, tickets) : eligible.slice(0, want);
            for (const e of drawn) give(e, dev);
        }
        for (const e of [ ...remaining ]) give(e, 0);
        let flags = tier.impactPlayerCount;
        for (const minDev of [ 2, 1 ]) {
            for (const e of ranked) {
                if (!flags) break;
                if (e.player.PLYR_IS_IMPACT_PLAYER === "1" || e.dev < minDev) continue;
                e.player.PLYR_IS_IMPACT_PLAYER = "1";
                counts.impactFlags++;
                flags--;
            }
            if (!flags) break;
        }
        return counts;
    }
    function tierForOverall(overall) {
        const tiers = [ ...D.prestigeTiers || [] ].sort((a, b) => b.minOverall - a.minOverall);
        for (const t of tiers) if (overall >= t.minOverall) return t.tier;
        return tiers.length ? tiers[tiers.length - 1].tier : null;
    }
    function assignStars(list, tierIndex) {
        const tier = (D.prestigeTiers || []).find(t => t.tier === Number(tierIndex));
        if (!tier || !tier.starQuotas) return null;
        const q = tier.starQuotas;
        const queue = [ ...list ].sort((a, b) => (b.dev || 0) - (a.dev || 0) || b.ovr - a.ovr || (String(a.pid) < String(b.pid) ? 1 : String(a.pid) > String(b.pid) ? -1 : 0));
        const bands = [ 5, 4, 3, 2, 1 ].map(s => [ q[String(s)] || 0, s ]);
        const lowest = [ 1, 2, 3, 4, 5 ].find(s => (q[String(s)] || 0) > 0) || 1;
        bands.push([ Infinity, lowest ]);
        const counts = {
            5: 0,
            4: 0,
            3: 0,
            2: 0,
            1: 0
        };
        for (const [want, band] of bands) {
            for (let n = 0; n < want && queue.length; n++) {
                let idx = 0;
                if (band > 3) {
                    while (idx < queue.length && isSpecialist(queue[idx])) idx++;
                    if (idx === queue.length) idx = 0;
                }
                const e = queue.splice(idx, 1)[0];
                let stars = band;
                if (e.dev === 3 && stars < 4) stars = 4; else if (e.dev === 2 && stars < 3) stars = 3;
                counts[stars]++;
                e.player.GC_PLYR_PROSPECTSTARRATING = String(stars - 1);
            }
            if (!queue.length) break;
        }
        return counts;
    }
    const WINDOW = 10;
    const OFF_POS = new Set([ "QB", "HB", "FB", "WR", "TE", "LT", "LG", "C", "RG", "RT" ]);
    const DEF_POS = new Set([ "LE", "RE", "DT", "LOLB", "MLB", "ROLB", "CB", "FS", "SS" ]);
    function sideRating(ovrs) {
        if (!ovrs.length) return null;
        const top = [ ...ovrs ].sort((a, b) => b - a).slice(0, WINDOW);
        return top.reduce((a, b) => a + b, 0) / top.length;
    }
    function sideIds(side) {
        return Object.entries(players()).filter(([, p]) => side.has(posOf(p))).map(([pid]) => pid);
    }
    function currentSideRating(side) {
        return sideRating(sideIds(side).map(pid => ovrOf(players()[pid])));
    }
    function rescaleSide(side, target, lo = 40, hi = 99) {
        const ids = sideIds(side);
        let vals = ids.map(pid => ovrOf(players()[pid]));
        for (let i = 0; i < 40; i++) {
            const delta = target - sideRating(vals);
            if (Math.abs(delta) < .02) break;
            vals = vals.map(v => Math.max(lo, Math.min(hi, v + delta)));
        }
        ids.forEach((pid, i) => {
            players()[pid].PLYR_OVERALLRATING = String(pyRound(vals[i]));
        });
        return ids.length;
    }
    const CLASS_OFFSET = {
        0: -5.2,
        1: -.7,
        2: 3.8,
        3: 6.4
    };
    const CLASS_CEILING = {
        0: .88,
        1: .96,
        2: 1,
        3: .97
    };
    const yearOf = p => parseInt(p.PLYR_SCHOOLYEAR, 10);
    function classCurve(entries) {
        if (!entries.length) return {
            out: {},
            converged: true
        };
        const values = entries.map(e => e.ovr).sort((a, b) => b - a);
        const ranked = [ ...entries ].sort((a, b) => b.ovr + (CLASS_OFFSET[b.yr] ?? 0) - (a.ovr + (CLASS_OFFSET[a.yr] ?? 0)));
        const out = {};
        ranked.forEach((e, i) => {
            out[e.key] = values[i];
        });
        const top = values[0];
        const capOf = yr => Math.round(top * (CLASS_CEILING[yr] ?? 1));
        let converged = false;
        for (let pass = 0; pass < 6; pass++) {
            const over = entries.filter(e => out[e.key] > capOf(e.yr));
            if (!over.length) {
                converged = true;
                break;
            }
            for (const e of over) {
                const cands = entries.filter(c => out[c.key] < out[e.key] && out[e.key] <= capOf(c.yr));
                if (!cands.length) {
                    out[e.key] = capOf(e.yr);
                    continue;
                }
                const best = cands.reduce((a, b) => out[a.key] >= out[b.key] ? a : b);
                const t = out[e.key];
                out[e.key] = out[best.key];
                out[best.key] = t;
            }
        }
        if (!converged) converged = !entries.some(e => out[e.key] > capOf(e.yr));
        return {
            out: out,
            converged: converged
        };
    }
    function applyClassCurve(side) {
        const ids = sideIds(side);
        if (!ids.length) return 0;
        const ent = ids.map(pid => ({
            key: pid,
            ovr: ovrOf(players()[pid]),
            yr: yearOf(players()[pid])
        }));
        const {out: out, converged: converged} = classCurve(ent);
        if (!converged) {
            console.warn("[CFB27] class-year curve did not settle in 6 passes; some players remain " + "above their class ceiling. Ratings are usable, the age curve is imperfect.");
        }
        let moved = 0;
        for (const e of ent) {
            if (out[e.key] !== e.ovr) moved++;
            players()[e.key].PLYR_OVERALLRATING = String(out[e.key]);
        }
        return moved;
    }
    function applyTeamRatings() {
        const off = currentSideRating(OFF_POS), def = currentSideRating(DEF_POS);
        const ti = WORK.teamData.teamInfos;
        ti.TEAM_RATINGOFF = String(Math.round(off));
        ti.TEAM_RATINGDEF = String(Math.round(def));
        ti.TEAM_RATINGOVR = String(Math.round((Math.round(off) + Math.round(def)) / 2));
        const md = WORK.metadata;
        if (md) {
            if ("TEAM_RATINGOVR" in md) md.TEAM_RATINGOVR = ti.TEAM_RATINGOVR;
            if ("TEAM_RATINGOFF" in md) md.TEAM_RATINGOFF = ti.TEAM_RATINGOFF;
            if ("TEAM_RATINGDEF" in md) md.TEAM_RATINGDEF = ti.TEAM_RATINGDEF;
        }
        return {
            off: Math.round(off),
            def: Math.round(def)
        };
    }
    function shiftUncovered(p, generated, baseOvr, targetOvr) {
        const delta = targetOvr - baseOvr;
        if (!delta) return 0;
        const covered = new Set(Object.keys(generated).map(a => D.attrToJson[a]).filter(Boolean));
        let n = 0;
        for (const [abbrev, key] of Object.entries(D.attrToJson)) {
            if (!(key in p) || covered.has(key) || abbrev === "LSP") continue;
            const v = pyRound(Math.max(D.attrMin, Math.min(D.attrMax, parseInt(p[key], 10) + tierSensitivity(abbrev) * delta)));
            if (String(p[key]) !== String(v)) n++;
            p[key] = String(v);
        }
        return n;
    }
    function regenerate(off, def, scope, baseOvrs) {
        ASSIGN = isPresetPair(off, def) ? assignPresetArchetypes(off, def) : assignArchetypes(off, def);
        let changed = 0, touched = 0;
        for (const [pid, p] of Object.entries(players())) {
            if (scope && !scope.includes(pid)) continue;
            const target = ovrOf(p);
            const {attrs: attrs} = generateAttributes(groupOf(p), ASSIGN[pid], devOf(p), target);
            touched++;
            if (baseOvrs && baseOvrs[pid] !== undefined) changed += shiftUncovered(p, attrs, baseOvrs[pid], target);
            for (const [a, v] of Object.entries(attrs)) {
                const key = D.attrToJson[a];
                if (key && key in p) {
                    if (String(p[key]) !== String(v)) changed++;
                    p[key] = String(v);
                }
            }
        }
        DIRTY = true;
        return {
            changed: changed,
            touched: touched
        };
    }
    let LAST_SOLVE = null;
    const LOOP_TOL = .25;
    const PRED_TOL_EXACT = .45;
    const LOOP_MAX = 6;
    function fineTune(side, aim) {
        for (let step = 0; step < 20; step++) {
            const ranked = sideIds(side).map(pid => [ ovrOf(players()[pid]), pid ]).sort((a, b) => b[0] - a[0] || (a[1] < b[1] ? 1 : a[1] > b[1] ? -1 : 0));
            const vals = ranked.map(([v]) => v);
            const got = sideRating(vals);
            const r = aim - got;
            if (Math.abs(r) <= .05) break;
            const top = ranked.slice(0, WINDOW);
            let cand = null;
            if (r > 0) {
                cand = [ ...top ].reverse().find(([v]) => v < 99) || null;
            } else {
                for (let i = top.length - 1; i >= 0; i--) {
                    const [v] = top[i];
                    if (v <= 40) continue;
                    const trial = [ ...vals ];
                    trial[i] = v - 1;
                    if (sideRating(trial) < got) {
                        cand = top[i];
                        break;
                    }
                }
            }
            if (!cand) break;
            players()[cand[1]].PLYR_OVERALLRATING = String(cand[0] + (r > 0 ? 1 : -1));
        }
    }
    const teamScore = (P, p) => P.predictPlayerTeam ? P.predictPlayerTeam(p) : P.predictPlayer(p, null);
    function lineupIds(side, P) {
        const byPos = {};
        for (const [pid, p] of Object.entries(players())) {
            const pos = posOf(p);
            if (!side.has(pos)) continue;
            const v = teamScore(P, p);
            if (v === null) continue;
            (byPos[pos] ||= []).push([ v, pid ]);
        }
        const ids = [];
        for (const [pos, list] of Object.entries(byPos)) {
            list.sort((a, b) => b[0] - a[0] || (a[1] < b[1] ? 1 : a[1] > b[1] ? -1 : 0));
            for (const [, pid] of list.slice(0, P.STARTERS[pos] || 1)) ids.push(pid);
        }
        return ids;
    }
    function predictedSide(side, P) {
        return P.sideFine ? P.sideFine(side.has("QB") ? "off" : "def") : null;
    }
    function regenOnePlayer(pid, baseOvrs) {
        const p = players()[pid];
        const raw = RAW.teamData.roster.playerData[pid];
        for (const key of Object.values(D.attrToJson)) if (key in raw) p[key] = raw[key];
        const target = ovrOf(p);
        const {attrs: attrs} = generateAttributes(groupOf(p), ASSIGN[pid], devOf(p), target);
        if (baseOvrs && baseOvrs[pid] !== undefined) shiftUncovered(p, attrs, baseOvrs[pid], target);
        for (const [a, v] of Object.entries(attrs)) {
            const key = D.attrToJson[a];
            if (key && key in p) p[key] = String(v);
        }
    }
    function fineTunePredicted(side, want, P, baseOvrs) {
        for (let step = 0; step < 24; step++) {
            const got = predictedSide(side, P);
            const r = want - got;
            if (Math.abs(r) <= .1) break;
            const dir = r > 0 ? 1 : -1;
            const top = lineupIds(side, P).map(pid => [ teamScore(P, players()[pid]), pid ]).sort((a, b) => b[0] - a[0] || (a[1] < b[1] ? 1 : a[1] > b[1] ? -1 : 0));
            if (r > 0) top.reverse();
            let applied = false;
            for (let i = 0; i < top.length; i++) {
                const pid = top[i][1];
                const p = players()[pid];
                const cur = ovrOf(p);
                const next = cur + dir;
                if (next < 40 || next > 99) continue;
                p.PLYR_OVERALLRATING = String(next);
                regenOnePlayer(pid, baseOvrs);
                const got2 = predictedSide(side, P);
                const own = teamScore(P, p);
                if ((r > 0 && got2 > got + 1e-9 || r < 0 && got2 < got - 1e-9) && own !== null && Math.abs(want - own) <= LEVEL_TOL) {
                    applied = true;
                    break;
                }
                p.PLYR_OVERALLRATING = String(cur);
                regenOnePlayer(pid, baseOvrs);
            }
            if (!applied) break;
        }
    }
    const LEVEL_TOL = 1;
    function walkToward(pid, want, P, baseOvrs) {
        const p = players()[pid];
        const v0 = teamScore(P, p);
        if (v0 === null) return Infinity;
        if (Math.abs(want - v0) <= LEVEL_TOL) return Math.abs(want - v0);
        const start = ovrOf(p);
        const dir = want > v0 ? 1 : -1;
        let bestOvr = start, bestErr = Math.abs(want - v0);
        for (let step = 1; step <= 30; step++) {
            const next = start + dir * step;
            if (next < 40 || next > 99) break;
            p.PLYR_OVERALLRATING = String(next);
            regenOnePlayer(pid, baseOvrs);
            const v = teamScore(P, p);
            if (v === null) break;
            const err = Math.abs(want - v);
            if (err < bestErr) {
                bestErr = err;
                bestOvr = next;
            }
            if (bestErr === 0) break;
            if (dir * (v - want) > 4) break;
        }
        if (ovrOf(p) !== bestOvr) {
            p.PLYR_OVERALLRATING = String(bestOvr);
            regenOnePlayer(pid, baseOvrs);
        }
        return bestErr;
    }
    function levelLineup(side, want, P, baseOvrs) {
        for (let pass = 0; pass < 6; pass++) {
            let moved = false;
            for (const pid of lineupIds(side, P)) {
                const before = ovrOf(players()[pid]);
                const err = walkToward(pid, want, P, baseOvrs);
                if (ovrOf(players()[pid]) !== before) moved = true;
                if (err > LEVEL_TOL) {
                    const pos = posOf(players()[pid]);
                    const bench = Object.entries(players()).filter(([bid, b]) => bid !== pid && posOf(b) === pos).map(([bid, b]) => [ teamScore(P, b), bid ]).filter(([v]) => v !== null).sort((a, b) => b[0] - a[0]);
                    const spare = bench[(P.STARTERS[pos] || 1) - 1];
                    if (spare) {
                        const sBefore = ovrOf(players()[spare[1]]);
                        walkToward(spare[1], want, P, baseOvrs);
                        if (ovrOf(players()[spare[1]]) !== sBefore) moved = true;
                    }
                }
            }
            if (!moved) break;
        }
    }
    function displayTrim(side, want, P, baseOvrs) {
        for (let step = 0; step < 20; step++) {
            const got = predictedSide(side, P);
            if (got === null || got <= want + PRED_TOL_EXACT + 1e-9) break;
            const top = lineupIds(side, P).map(pid => [ teamScore(P, players()[pid]), pid ]).sort((a, b) => b[0] - a[0] || (a[1] < b[1] ? 1 : a[1] > b[1] ? -1 : 0));
            let applied = false;
            for (const [, pid] of top) {
                const p = players()[pid];
                const cur = ovrOf(p);
                if (cur - 1 < 40) continue;
                p.PLYR_OVERALLRATING = String(cur - 1);
                regenOnePlayer(pid, baseOvrs);
                const got2 = predictedSide(side, P);
                const own = teamScore(P, p);
                const card = P.predictPlayer(p, null);
                if (got2 < got - 1e-9 && own !== null && Math.abs(want - own) <= LEVEL_TOL + 1 && card !== null && card >= PRED_FLOOR) {
                    applied = true;
                    break;
                }
                p.PLYR_OVERALLRATING = String(cur);
                regenOnePlayer(pid, baseOvrs);
            }
            if (!applied) break;
        }
    }
    const PRED_FLOOR = 41;
    function floorBench(P, baseOvrs) {
        for (const [pid, p] of Object.entries(players())) {
            const pos = posOf(p);
            if (!OFF_POS.has(pos) && !DEF_POS.has(pos)) continue;
            for (let step = 0; step < 60; step++) {
                const v = P.predictPlayer(p, null);
                if (v === null || v >= PRED_FLOOR) break;
                const next = ovrOf(p) + 1;
                if (next > 99) break;
                p.PLYR_OVERALLRATING = String(next);
                regenOnePlayer(pid, baseOvrs);
            }
        }
    }
    function applyTemplateId(scheme) {
        const name = (D.offensivePresets?.[scheme] || {}).basedOnEATemplate || null;
        const id = name ? (D.eaTemplates?.ids || {})[name] : null;
        const ti = WORK?.teamData?.teamInfos;
        const prev = ti ? ti.MY_SCHOOL_TEMPLATE_ID : undefined;
        if (ti && id !== null && id !== undefined) {
            ti.MY_SCHOOL_TEMPLATE_ID = String(id);
            return {
                name: name,
                id: String(id),
                wrote: true,
                prev: prev
            };
        }
        return {
            name: name,
            id: null,
            wrote: false,
            prev: prev
        };
    }
    function regenerateForDisplay(desiredOff, desiredDef, keepCosmetics = null, devLottery = null) {
        if (typeof RAW === "undefined" || !RAW) return null;
        const P = typeof window !== "undefined" ? window.CFB27Predict : null;
        if (!P) return null;
        const wantPredOff = P.targetFor(desiredOff, "off");
        const wantPredDef = P.targetFor(desiredDef, "def");
        const curveOn = !!$id("classCurve")?.checked;
        const scheme = $id("offScheme")?.value || "Pro Style / Multiple";
        const front = $id("defScheme")?.value || "4-2-5 Nickel";
        const prestige = $id("prestigeTier")?.value || "";
        const clampT = v => Math.max(40, Math.min(99, v));
        let tOff = wantPredOff, tDef = wantPredDef;
        let result = null, baseOvrs = null;
        let gotPredOff = null, gotPredDef = null, gotOff = null, gotDef = null;
        let converged = false;
        for (let pass = 0; pass < LOOP_MAX + 2; pass++) {
            WORK = JSON.parse(JSON.stringify(RAW));
            ASSIGN = {};
            const roster = WORK.teamData.roster.playerData;
            baseOvrs = {};
            for (const [pid, p] of Object.entries(roster)) baseOvrs[pid] = parseInt(p.PLYR_OVERALLRATING, 10);
            rescaleSide(OFF_POS, tOff);
            rescaleSide(DEF_POS, tDef);
            if (curveOn) {
                applyClassCurve(OFF_POS);
                applyClassCurve(DEF_POS);
            }
            fineTune(OFF_POS, tOff);
            fineTune(DEF_POS, tDef);
            result = regenerate(scheme, front, null, baseOvrs);
            levelLineup(OFF_POS, wantPredOff, P, baseOvrs);
            levelLineup(DEF_POS, wantPredDef, P, baseOvrs);
            fineTunePredicted(OFF_POS, wantPredOff, P, baseOvrs);
            fineTunePredicted(DEF_POS, wantPredDef, P, baseOvrs);
            floorBench(P, baseOvrs);
            displayTrim(OFF_POS, wantPredOff, P, baseOvrs);
            displayTrim(DEF_POS, wantPredDef, P, baseOvrs);
            gotPredOff = predictedSide(OFF_POS, P);
            gotPredDef = predictedSide(DEF_POS, P);
            const eOff = wantPredOff - gotPredOff, eDef = wantPredDef - gotPredDef;
            if (Math.abs(eOff) <= PRED_TOL_EXACT + 1e-9 && Math.abs(eDef) <= PRED_TOL_EXACT + 1e-9) break;
            tOff = clampT(tOff + eOff);
            tDef = clampT(tDef + eDef);
        }
        gotPredOff = predictedSide(OFF_POS, P);
        gotPredDef = predictedSide(DEF_POS, P);
        gotOff = currentSideRating(OFF_POS);
        gotDef = currentSideRating(DEF_POS);
        converged = Math.abs(wantPredOff - gotPredOff) <= PRED_TOL_EXACT + 1e-9 && Math.abs(wantPredDef - gotPredDef) <= PRED_TOL_EXACT + 1e-9;
        if (!converged) {
            console.warn(`[CFB27] predictor loop did not settle — predicted ` + `${gotPredOff.toFixed(2)}/${gotPredDef.toFixed(2)} vs want ${wantPredOff.toFixed(2)}/${wantPredDef.toFixed(2)}. ` + `Usually a target at the 40/99 clamp or a heavily-capped class mix.`);
        }
        let devSummary = null, starSummary = null;
        if (prestige) {
            const entries = Object.entries(players()).map(([pid, p]) => ({
                pid: pid,
                player: p,
                ovr: P.predictPlayer(p, null) ?? ovrOf(p)
            }));
            devSummary = assignDevTraits(entries, prestige, devLottery?.rng || null);
            starSummary = assignStars(entries, prestige);
        }
        if (keepCosmetics) {
            for (const [pid, p] of Object.entries(players())) {
                const k = keepCosmetics[pid];
                if (!k) continue;
                p.PLYR_TRAITDEVELOPMENT = k.dev;
                p.PLYR_IS_IMPACT_PLAYER = k.impact;
                p.GC_PLYR_PROSPECTSTARRATING = k.stars;
            }
        }
        let abilitySummary = null;
        if (typeof window !== "undefined" && window.CFB27Abilities && WORK.teamData?.frostbiteData) {
            const fb = WORK.teamData.frostbiteData;
            if (!fb.characterAbilities) fb.characterAbilities = {};
            abilitySummary = window.CFB27Abilities.assignAll(players(), fb.characterAbilities, devLottery?.rng || null);
        }
        const tbTemplate = null;
        applyTeamRatings();
        LAST_SOLVE = {
            at: (new Date).toISOString(),
            desiredOff: desiredOff,
            desiredDef: desiredDef,
            aimOff: tOff,
            aimDef: tDef,
            wantPredOff: wantPredOff,
            wantPredDef: wantPredDef,
            predictedOff: gotPredOff,
            predictedDef: gotPredDef,
            achievedOff: gotOff,
            achievedDef: gotDef,
            loopConverged: converged,
            scheme: scheme,
            front: front,
            tbTemplate: tbTemplate,
            prestigeTier: prestige || null,
            devSummary: devSummary,
            starSummary: starSummary,
            abilitySummary: abilitySummary,
            devSeed: devLottery?.seed ?? null,
            classCurve: curveOn,
            rosterFingerprint: typeof window !== "undefined" && window.CFB27Transport ? window.CFB27Transport.fingerprint(JSON.stringify(WORK)) : null
        };
        return {
            desiredOff: desiredOff,
            desiredDef: desiredDef,
            aimOff: tOff,
            aimDef: tDef,
            wantPredOff: wantPredOff,
            wantPredDef: wantPredDef,
            predictedOff: gotPredOff,
            predictedDef: gotPredDef,
            achievedOff: gotOff,
            achievedDef: gotDef,
            prestigeTier: prestige || null,
            devSummary: devSummary,
            starSummary: starSummary,
            abilitySummary: abilitySummary,
            tbTemplate: tbTemplate,
            loopConverged: converged,
            ...result
        };
    }
    function runSolve() {
        if (typeof WORK === "undefined" || !WORK) return;
        const desiredOff = Number($id("offTarget").value);
        const desiredDef = Number($id("defTarget").value);
        const autoTier = tierForOverall((desiredOff + desiredDef) / 2);
        const tierLabel = (D.prestigeTiers || []).find(t => t.tier === autoTier)?.label || "";
        const modal = $id("modal");
        if (!modal) {
            solveWith(desiredOff, desiredDef, autoTier, tierLabel, true);
            return;
        }
        $id("modalTitle").textContent = "Changing the team overall";
        $id("modalSub").innerHTML = `This can also recalculate every player's <b>dev trait</b> and\n      <b>HS star rating</b> to fit the new overall (${esc(tierLabel)} band). Hand-edited\n      values are replaced if you recalculate; keeping them changes the overall only.`;
        $id("modalBody").innerHTML = `\n      <div class="bar">\n        <button id="solveRecalc">Recalculate dev traits &amp; HS stars</button>\n        <button id="solveKeep" class="sec">Keep mine — change overall only</button>\n        <button id="solveCancel" class="sec">Cancel</button>\n      </div>`;
        const done = fn => () => {
            modal.classList.remove("open");
            fn?.();
        };
        $id("solveRecalc").onclick = done(() => solveWith(desiredOff, desiredDef, autoTier, tierLabel, true));
        $id("solveKeep").onclick = done(() => solveWith(desiredOff, desiredDef, autoTier, tierLabel, false));
        $id("solveCancel").onclick = done();
        modal.classList.add("open");
    }
    function solveWith(desiredOff, desiredDef, autoTier, tierLabel, recalc) {
        let kept = null;
        const pt = $id("prestigeTier");
        if (recalc) {
            if (pt) pt.value = String(autoTier);
        } else {
            if (pt) pt.value = "";
            kept = {};
            for (const [pid, p] of Object.entries(players())) kept[pid] = {
                dev: p.PLYR_TRAITDEVELOPMENT,
                impact: p.PLYR_IS_IMPACT_PLAYER,
                stars: p.GC_PLYR_PROSPECTSTARRATING
            };
        }
        const seed = Math.random() * 4294967296 >>> 0;
        const out = regenerateForDisplay(desiredOff, desiredDef, kept, recalc ? {
            rng: mulberry32(seed),
            seed: seed
        } : null);
        if (!out) return;
        window.CFB27Table?.render?.();
        window.CFB27Predict?.update();
        if (typeof changeBlip === "function") changeBlip();
        const box = $id("solveOut");
        if (box) {
            const bits = [];
            if (out.devSummary) {
                bits.push(`Dev traits (auto, ${esc(tierLabel)} band): <b>${out.devSummary.elite}</b> Elite,\n          <b>${out.devSummary.star}</b> Star, <b>${out.devSummary.impact}</b> Impact dev,\n          <b>${out.devSummary.impactFlags}</b> impact-player flags.`);
            }
            if (out.starSummary) {
                bits.push(`HS stars (auto): <b>${out.starSummary[5]}</b>×5★, <b>${out.starSummary[4]}</b>×4★,\n          <b>${out.starSummary[3]}</b>×3★, <b>${out.starSummary[2]}</b>×2★, <b>${out.starSummary[1]}</b>×1★.`);
            }
            if (kept) {
                bits.push(`<span class="muted">Dev traits & HS stars kept as they were (your choice) —\n          only the overall changed.</span>`);
            }
            if (out.tbTemplate?.wrote) {
                bits.push(`Team Builder preset set to <b>${esc(out.tbTemplate.name)}</b> (id ${esc(out.tbTemplate.id)}).`);
            } else if (out.tbTemplate?.name) {
                bits.push(`<span class="muted">Team Builder's preset was NOT changed —\n          the id for <b>${esc(out.tbTemplate.name)}</b> is not known yet (set it in\n          Team Builder, save, pull, and read "TB preset id" in Advanced → Diagnostics).</span>`);
            }
            if (!out.loopConverged) {
                bits.push(`<b>The generator could not fully close the gap</b> — usually a\n        target at the clamp or a heavily-capped class mix. The attributes score\n        <b>${out.predictedOff.toFixed(2)} / ${out.predictedDef.toFixed(2)}</b> against a required\n        ${out.wantPredOff.toFixed(2)} / ${out.wantPredDef.toFixed(2)} — that is what will actually push.`);
            }
            box.style.display = bits.length ? "block" : "none";
            box.className = "predict " + (out.loopConverged ? "good" : "warn");
            box.innerHTML = bits.join("<br>");
        }
        console.info(`[CFB27] attributes score ${out.predictedOff.toFixed(2)} OFF / ${out.predictedDef.toFixed(2)} DEF ` + `(want ${out.wantPredOff.toFixed(2)}/${out.wantPredDef.toFixed(2)}; file means ` + `${out.achievedOff.toFixed(2)}/${out.achievedDef.toFixed(2)}) to display ${desiredOff}/${desiredDef}`);
    }
    function syncTargets() {
        const off = +($id("offTarget") ? $id("offTarget").value : 0);
        const def = +($id("defTarget") ? $id("defTarget").value : 0);
        const mid = Math.round((off + def) / 2);
        const set = (id, v) => {
            const e = $id(id);
            if (e) e.textContent = v;
        };
        set("teamVal", mid);
        const mirror = (sid, v) => {
            const e = $id(sid);
            if (e && e.value != v) e.value = v;
        };
        mirror("offSlider", off);
        mirror("defSlider", def);
    }
    function setTargets(off, def) {
        const o = $id("offTarget"), d = $id("defTarget");
        if (o) {
            o.value = off;
            o.dataset.orig = off;
        }
        if (d) {
            d.value = def;
            d.dataset.orig = def;
        }
        syncTargets();
    }
    function bindSliderPair(sliderId, boxId) {
        const s = $id(sliderId), b = $id(boxId);
        if (!s || !b) return;
        s.value = b.value;
        s.oninput = () => {
            b.value = s.value;
            syncTargets();
        };
        b.addEventListener("input", () => {
            s.value = b.value;
        });
    }
    function repairStoredOveralls(P) {
        if (!P || typeof WORK === "undefined" || !WORK || typeof RAW === "undefined" || !RAW) return 0;
        const rawPlayers = RAW.teamData?.roster?.playerData || {};
        let repaired = 0;
        for (const [pid, p] of Object.entries(players())) {
            const stored = parseInt(p.PLYR_OVERALLRATING, 10);
            if (stored >= 1) continue;
            const ovr = P.predictPlayer(p, null);
            if (!Number.isFinite(ovr)) continue;
            const fixed = String(Math.max(1, Math.min(99, Math.round(ovr))));
            p.PLYR_OVERALLRATING = fixed;
            if (rawPlayers[pid]) rawPlayers[pid].PLYR_OVERALLRATING = fixed;
            repaired++;
        }
        if (repaired) {
            DIRTY = true;
            console.info(`[CFB27] repaired ${repaired} stored overall(s) that were 0/invalid — ` + `recomputed from attributes; will be included in the next push`);
        }
        return repaired;
    }
    function onRosterLoaded() {
        if (typeof WORK === "undefined" || !WORK) return;
        const P = typeof window !== "undefined" ? window.CFB27Predict : null;
        const repaired = repairStoredOveralls(P);
        if (repaired) {
            window.CFB27Table?.render?.();
            toast(`Repaired ${repaired} player overall(s) EA had stored as 0`);
        }
        if (P) {
            const po = predictedSide(OFF_POS, P), pd = predictedSide(DEF_POS, P);
            setTargets(P.displayFor(po, "off"), P.displayFor(pd, "def"));
        } else {
            setTargets(Math.round(currentSideRating(OFF_POS)), Math.round(currentSideRating(DEF_POS)));
        }
        const bar = $id("solveBar");
        if (bar) bar.style.display = "";
    }
    function toast(msg, bad) {
        const t = $id("toast");
        if (!t) return;
        t.textContent = msg;
        t.className = "toast show" + (bad ? " bad" : "");
        setTimeout(() => t.className = "toast", 2600);
    }
    function revert() {
        if (typeof RAW === "undefined" || !RAW) return;
        WORK = JSON.parse(JSON.stringify(RAW));
        DIRTY = false;
        ASSIGN = {};
        LAST_SOLVE = null;
        window.CFB27Table?.render?.();
        if (typeof changeBlip === "function") changeBlip();
        const box = $id("solveOut");
        if (box) box.style.display = "none";
        toast("Reverted to the pulled file");
    }
    const closeModal = () => $id("modal")?.classList.remove("open");
    function diffReport() {
        if (!RAW || !WORK) return;
        const a = RAW.teamData.roster.playerData, b = players();
        const attrKeys = new Set(Object.values(D.attrToJson));
        let fields = 0, ppl = 0, biggest = [];
        for (const pid of Object.keys(a)) {
            let n = 0;
            for (const k of attrKeys) {
                if (k in a[pid] && String(a[pid][k]) !== String(b[pid][k])) {
                    n++;
                    biggest.push([ Math.abs(a[pid][k] - b[pid][k]), `${esc(b[pid].PLYR_LASTNAME)} ${k.replace("PLYR_", "")}: ${esc(a[pid][k])}→${esc(b[pid][k])}` ]);
                }
            }
            if (n) {
                ppl++;
                fields += n;
            }
        }
        biggest.sort((x, y) => y[0] - x[0]);
        const identity = [ "PLYR_FIRSTNAME", "PLYR_LASTNAME" ];
        const broken = Object.keys(a).filter(pid => identity.some(k => String(a[pid][k]) !== String(b[pid][k])));
        const posMoved = Object.keys(a).filter(pid => String(a[pid].PLYR_POSITION) !== String(b[pid].PLYR_POSITION)).length;
        const traitMoved = Object.keys(a).filter(pid => String(a[pid].PLYR_TRAITDEVELOPMENT) !== String(b[pid].PLYR_TRAITDEVELOPMENT) || String(a[pid].PLYR_IS_IMPACT_PLAYER) !== String(b[pid].PLYR_IS_IMPACT_PLAYER)).length;
        const named = window.CFB27Roster?.audit?.();
        $id("modalTitle").textContent = "Changes vs the file you pulled";
        $id("modalSub").innerHTML = broken.length && !(named && named.changed) ? `<span class="bad">⚠ ${broken.length} player(s) had identity fields altered</span>` : `<span class="ok">✓ names unchanged${named && named.changed ? ` · ${named.changed} names changed by the naming pass` : ""}</span>`;
        $id("modalBody").innerHTML = `<p><b>${fields}</b> attribute values changed across <b>${ppl}</b> players.</p>` + (posMoved ? `<p class="small"><b>${posMoved}</b> player(s) moved position to match the preset's roster counts.</p>` : "") + (traitMoved ? `<p class="small"><b>${traitMoved}</b> player(s) had dev trait / impact flag written by the prestige tier.</p>` : "") + `<p class="muted small">Largest changes:</p>\n       <ul class="small">${biggest.slice(0, 12).map(x => `<li>${x[1]}</li>`).join("")}</ul>`;
        $id("modal").classList.add("open");
    }
    function download() {
        if (typeof WORK === "undefined" || !WORK) return;
        const name = (WORK.teamData.teamInfos.TEAM_NICKNAME || "roster").toLowerCase().replace(/\W+/g, "_");
        const blob = new Blob([ JSON.stringify(WORK, null, 2) ], {
            type: "application/json"
        });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${name}_edited.json`;
        a.click();
        URL.revokeObjectURL(a.href);
        toast("Downloaded");
    }
    const mean = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
    const r2 = x => x === null || x === undefined ? null : Math.round(x * 100) / 100;
    function measurementPlayers(P) {
        const rows = [];
        for (const [pid, player] of Object.entries(players())) {
            const pos = posOf(player);
            const group = groupOf(player);
            const fileOvr = ovrOf(player);
            const assigned = typeof ASSIGN !== "undefined" && ASSIGN ? ASSIGN[pid] || null : null;
            let exemplar = null, exemplarOvr = null, exemplarExact = null;
            try {
                const picked = pickExemplar(group, assigned, fileOvr);
                exemplar = picked.exemplar.player;
                exemplarOvr = picked.exemplar.ovr;
                exemplarExact = picked.exact;
            } catch (e) {}
            rows.push({
                pid: pid,
                pos: pos,
                group: group,
                name: `${player.PLYR_FIRSTNAME} ${player.PLYR_LASTNAME}`,
                side: OFF_POS.has(pos) ? "off" : DEF_POS.has(pos) ? "def" : null,
                dev: D.devTraitCodes[String(parseInt(player.PLYR_TRAITDEVELOPMENT, 10))],
                year: parseInt(player.PLYR_SCHOOLYEAR, 10),
                fileOvr: fileOvr,
                predOvr: P ? P.predictPlayer(player, assigned) : null,
                assigned: assigned,
                exemplar: exemplar,
                exemplarOvr: exemplarOvr,
                exemplarExact: exemplarExact,
                extrapolation: exemplarOvr === null ? null : exemplarOvr - fileOvr
            });
        }
        return rows;
    }
    function summarise(rows, keyOf) {
        const out = {};
        for (const row of rows) {
            const key = keyOf(row);
            if (!key) continue;
            out[key] ||= {
                n: 0,
                fileOvr: [],
                predOvr: [],
                extrapolation: []
            };
            out[key].n++;
            out[key].fileOvr.push(row.fileOvr);
            if (row.predOvr !== null) out[key].predOvr.push(row.predOvr);
            if (row.extrapolation !== null) out[key].extrapolation.push(row.extrapolation);
        }
        for (const [key, v] of Object.entries(out)) {
            out[key] = {
                n: v.n,
                fileMean: r2(mean(v.fileOvr)),
                predMean: r2(mean(v.predOvr)),
                extrapolationMean: r2(mean(v.extrapolation))
            };
        }
        return out;
    }
    function buildMeasurement(observed = {}) {
        if (typeof WORK === "undefined" || !WORK) return null;
        const P = typeof window !== "undefined" ? window.CFB27Predict : null;
        const rows = measurementPlayers(P);
        const fileOff = currentSideRating(OFF_POS);
        const fileDef = currentSideRating(DEF_POS);
        const predOff = P ? predictedSide(OFF_POS, P) : null;
        const predDef = P ? predictedSide(DEF_POS, P) : null;
        const tx = typeof window !== "undefined" ? window.CFB27Transport : null;
        const push = tx?.lastPush?.() || null;
        const live = tx ? tx.fingerprint(JSON.stringify(WORK)) : null;
        const pushMatch = !push ? null : push.fingerprint === live;
        const solveStale = !!(LAST_SOLVE && LAST_SOLVE.rosterFingerprint && live && LAST_SOLVE.rosterFingerprint !== live);
        const ti = WORK.teamData.teamInfos || {};
        const num = v => v === undefined || v === null || v === "" ? null : parseInt(v, 10);
        const ea = {
            off: num(ti.TEAM_RATINGOFF),
            def: num(ti.TEAM_RATINGDEF),
            ovr: num(ti.TEAM_RATINGOVR)
        };
        const eaRewrote = ea.off !== null && ea.def !== null && (ea.off !== Math.round(fileOff) || ea.def !== Math.round(fileDef));
        let obsOff = Number.isFinite(observed.off) ? observed.off : null;
        let obsDef = Number.isFinite(observed.def) ? observed.def : null;
        let observedSource = obsOff !== null && obsDef !== null ? "typed" : null;
        if (obsOff === null && obsDef === null && eaRewrote) {
            obsOff = ea.off;
            obsDef = ea.def;
            observedSource = "file — Team Builder overwrote the team ratings on Save";
        }
        return {
            schema: "cfb27-measurement/2",
            basis: "predicted",
            exportedAt: (new Date).toISOString(),
            build: typeof RB_VERSION !== "undefined" ? RB_VERSION : null,
            exemplarPool: D.exemplars ? D.exemplars.length : null,
            team: {
                name: ti.TEAM_NAME || null,
                nickname: ti.TEAM_NICKNAME || null,
                templateId: WORK.teamData.roster?.templateId ?? null,
                players: rows.length
            },
            asked: solveStale || !LAST_SOLVE ? null : {
                off: LAST_SOLVE.desiredOff,
                def: LAST_SOLVE.desiredDef
            },
            wrote: solveStale || !LAST_SOLVE ? null : {
                fileOff: r2(LAST_SOLVE.aimOff),
                fileDef: r2(LAST_SOLVE.aimDef),
                wantPredOff: r2(LAST_SOLVE.wantPredOff),
                wantPredDef: r2(LAST_SOLVE.wantPredDef)
            },
            inFile: {
                off: r2(fileOff),
                def: r2(fileDef)
            },
            predicted: {
                off: r2(predOff),
                def: r2(predDef)
            },
            solve: solveStale ? null : LAST_SOLVE,
            solveStale: solveStale,
            solveWarning: solveStale ? "The roster changed after the last Generate — most likely a fresh Pull or a loaded file. " + "asked/wrote are withheld; inFile/predicted and the rows describe the roster currently loaded." : null,
            eaTeamRatings: ea,
            eaRewroteTeamRatings: eaRewrote,
            observedSource: observedSource,
            observed: {
                off: obsOff,
                def: obsDef,
                note: observed.note || ""
            },
            pushMatch: pushMatch,
            push: push ? {
                at: push.at,
                players: push.players,
                teamName: push.teamName
            } : null,
            pushWarning: push === null ? "Nothing has been pushed from this editor session, so this export cannot be tied to what the game is showing." : pushMatch ? null : "The roster in the editor is NOT the roster that was pushed — it changed after the push. Any reading here belongs to a different roster.",
            byPosition: summarise(rows, r => r.pos),
            byGroup: summarise(rows, r => r.group),
            players: rows
        };
    }
    function exportMeasurement() {
        const m = buildMeasurement({
            off: Number($id("obsOff")?.value),
            def: Number($id("obsDef")?.value)
        });
        if (!m) {
            toast("Pull a roster first", true);
            return null;
        }
        const slug = (m.team.nickname || m.team.name || "roster").toLowerCase().replace(/\W+/g, "_");
        const stamp = m.exportedAt.slice(0, 16).replace(/[:T-]/g, "");
        const blob = new Blob([ JSON.stringify(m, null, 2) ], {
            type: "application/json"
        });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `cfb27-reading-${slug}-${stamp}.json`;
        a.click();
        URL.revokeObjectURL(a.href);
        if (m.observationLine) console.info("[CFB27] " + m.observationLine);
        const box = $id("solveOut");
        if (box) {
            box.style.display = "block";
            box.className = "predict " + (m.pushWarning ? "bad" : "good");
            box.innerHTML = m.pushWarning ? `<b>Exported, with a caveat.</b> ${esc(m.pushWarning)}` : `Reading exported${m.observed.off === null ? " with no in-game numbers yet" : ` — game showed <b>${m.observed.off} / ${m.observed.def}</b> against predicted\n              <b>${m.predicted.off} / ${m.predicted.def}</b>`}. The paste-ready observation is in\n            the file and the console.`;
        }
        return m;
    }
    window.CFB27Generator = {
        pyRound: pyRound,
        tierSensitivity: tierSensitivity,
        pickExemplar: pickExemplar,
        generateAttributes: generateAttributes,
        assignArchetypes: assignArchetypes,
        assignStars: assignStars,
        tierForOverall: tierForOverall,
        sideRating: sideRating,
        currentSideRating: currentSideRating,
        rescaleSide: rescaleSide,
        classCurve: classCurve,
        applyClassCurve: applyClassCurve,
        applyTeamRatings: applyTeamRatings,
        shiftUncovered: shiftUncovered,
        regenerate: regenerate,
        regenerateForDisplay: regenerateForDisplay,
        runSolve: runSolve,
        onRosterLoaded: onRosterLoaded,
        setTargets: setTargets,
        OFF_POS: OFF_POS,
        DEF_POS: DEF_POS,
        buildRosterSlots: buildRosterSlots,
        applyPresetPositions: applyPresetPositions,
        assignPresetArchetypes: assignPresetArchetypes,
        assignDevTraits: assignDevTraits,
        buildMeasurement: buildMeasurement,
        exportMeasurement: exportMeasurement,
        repairStoredOveralls: repairStoredOveralls,
        lastSolve: () => LAST_SOLVE
    };
    console.info(`[CFB27] generator ready — ${D.exemplars.length} archetype molds, ` + `${Object.values(D.archetypesByGroup).reduce((a, l) => a + l.length, 0)} archetypes`);
    const wire = () => {
        const os = $id("offScheme");
        if (os) os.innerHTML = Object.entries(D.offensivePresets || {}).map(([s, p]) => `<option value="${esc(s)}"${s === "Pro Style / Multiple" ? " selected" : ""}>` + `${esc(s)}${p.basedOnEATemplate ? ` · TB: ${esc(p.basedOnEATemplate)}` : ""}</option>`).join("");
        const ds = $id("defScheme");
        if (ds) ds.innerHTML = Object.keys(D.defensivePresets || {}).map(s => `<option${s === "4-2-5 Nickel" ? " selected" : ""}>${esc(s)}</option>`).join("");
        const pt = $id("prestigeTier");
        if (pt) pt.innerHTML = `<option value="">— keep EA's —</option>` + (D.prestigeTiers || []).map(t => `<option value="${t.tier}">Tier ${t.tier} — ${esc(t.label)}</option>`).join("");
        for (const id of [ "offTarget", "defTarget" ]) {
            const e = $id(id);
            if (e) e.oninput = syncTargets;
        }
        bindSliderPair("offSlider", "offTarget");
        bindSliderPair("defSlider", "defTarget");
        $id("solve")?.addEventListener("click", runSolve);
        $id("exportReading")?.addEventListener("click", exportMeasurement);
        $id("revert")?.addEventListener("click", revert);
        $id("diff")?.addEventListener("click", diffReport);
        $id("save")?.addEventListener("click", download);
        $id("modalClose")?.addEventListener("click", closeModal);
        const modal = $id("modal");
        if (modal) modal.onclick = e => {
            if (e.target.id === "modal") closeModal();
        };
        if (typeof window !== "undefined") {
            window.addEventListener("beforeunload", e => {
                if (DIRTY) {
                    e.preventDefault();
                    e.returnValue = "";
                }
            });
        }
        syncTargets();
    };
    if (typeof document !== "undefined" && document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", wire);
    } else if (typeof document !== "undefined") {
        wire();
    }
}

if (typeof window !== "undefined") window.initCFB27Generator = initCFB27Generator;
