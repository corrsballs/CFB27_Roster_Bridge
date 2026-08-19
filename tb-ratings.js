function initCFB27TBRatings(ea) {
    const W = ea.calcInfo, SUBS = ea.depthSubs;
    const TEMPLATE = ea.slotTemplate, SLOT_W = ea.slotWeights, CAT = ea.categories;
    const ATTRIB_FIELD = ea.attribFields;
    const LASTOFFENSE = 9, FIRSTDEFENSE = 10, LASTDEFENSE = 18, LS = 21, K = 19, P = 20, LASTNORMAL = 21, MAXNORMAL = 22, FIRSTSPECIAL = 22;
    const OVR_MIN = 12, OVR_MAX = 99;
    function calc(pos, key, attrs) {
        const entry = (W[String(pos)] || {})[String(key)];
        if (!entry) return null;
        let sumW = 0, acc = 0;
        for (const f in entry) {
            if (f.length < 7 || !f.endsWith("WEIGHT")) continue;
            const w = entry[f];
            if (!w) continue;
            sumW += w;
            const v = Number(attrs[f.slice(0, -6)] ?? "");
            acc += Math.trunc(Number.isFinite(v) ? v : 0) * w;
        }
        const hi = entry.PLYR_RATINGDESIREDHI, lo = entry.PLYR_RATINGDESIREDLO;
        const raw = (acc - lo * sumW) / ((hi - lo) * sumW / OVR_MAX);
        const r = raw - Math.floor(raw) === .5 ? 2 * Math.round(raw / 2) : Math.round(raw);
        return Math.min(Math.max(r, OVR_MIN), OVR_MAX);
    }
    const MEMO = new WeakMap;
    function fingerprint(pl) {
        let fp = pl.PLYR_POSITION + "|" + pl.PLYR_PLAYERTYPE;
        for (let i = 0; i < ATTRIB_FIELD.length; i++) fp += "|" + (pl[ATTRIB_FIELD[i]] ?? "");
        return fp;
    }
    function evaluate(pl) {
        const fp = fingerprint(pl);
        const hit = MEMO.get(pl);
        if (hit && hit.fp === fp) return hit;
        const pos = parseInt(pl.PLYR_POSITION, 10);
        const pt = parseInt(pl.PLYR_PLAYERTYPE, 10);
        const card = Number.isNaN(pt) ? null : calc(pos, pt, pl);
        const subs = [];
        for (const subPosStr in SUBS[String(pos)] || {}) {
            const subPos = parseInt(subPosStr, 10);
            if (!(subPos < FIRSTSPECIAL || pos >= FIRSTSPECIAL)) continue;
            const e = SUBS[String(pos)][subPosStr];
            const sheet = {
                ...pl
            };
            for (let n = 1; n <= 3; n++) {
                const field = ATTRIB_FIELD[e["DCHART_PLYR_ATTRIB" + n]];
                if (field !== undefined) {
                    const base = Number(pl[field] ?? "") || 0;
                    sheet[field] = String(base * e["DCHART_PLYR_PENALTY" + n] / 100);
                }
            }
            let best = 0;
            for (const key in W[String(subPos)] || {}) {
                const r = calc(subPos, key, sheet);
                if (r !== null && r > best) best = r;
            }
            subs.push({
                position: subPos,
                rating: best,
                altDepthGroup: e.DCHART_SUBRANK
            });
        }
        const out = {
            fp: fp,
            pos: pos,
            card: card,
            subs: subs
        };
        MEMO.set(pl, out);
        return out;
    }
    function cardOvr(pl) {
        return evaluate(pl).card;
    }
    function depthOwn(pl) {
        const ev = evaluate(pl);
        for (const s of ev.subs) if (s.position === ev.pos) return s.rating;
        return null;
    }
    function teamRatings(playerData) {
        if (!playerData) return null;
        const players = [];
        for (const pid in playerData) {
            const pl = playerData[pid];
            const ev = evaluate(pl);
            players.push({
                pid: pid,
                pl: pl,
                position: ev.pos,
                card: ev.card,
                subs: ev.subs,
                depthChartRating: ev.card ?? 0
            });
        }
        const byPos = new Map;
        for (const p of players) {
            for (const s of p.subs) {
                const list = byPos.get(s.position) ?? [];
                let i = 0;
                for (;i < list.length && !(s.rating > list[i].weightedRating); ++i) ;
                list.splice(i, 0, {
                    player: p,
                    weightedRating: s.rating,
                    altDepthGroup: s.altDepthGroup
                });
                byPos.set(s.position, list);
            }
        }
        for (const list of byPos.values()) {
            for (let i = 0; i < list.length; ++i) {
                let a = list[i];
                for (let j = i + 1; j < list.length; ++j) {
                    const b = list[j];
                    if (b.altDepthGroup < a.altDepthGroup) {
                        list[i] = b;
                        list[j] = a;
                        a = b;
                    }
                }
            }
        }
        const chart = {
            offense: new Map,
            defense: new Map,
            special: new Map
        };
        const chartFor = pos => pos <= LASTOFFENSE || pos === LS ? chart.offense : pos >= FIRSTDEFENSE && pos <= LASTDEFENSE ? chart.defense : chart.special;
        const starterPlyrIds = [];
        for (let slot = 0; slot < TEMPLATE.length; ++slot) {
            if (starterPlyrIds[slot] != null) continue;
            const flags = new Array(TEMPLATE.length).fill(false);
            for (let p = 0; p < MAXNORMAL; ++p) {
                if (TEMPLATE[slot] !== p) continue;
                const team = chartFor(p);
                const already = team.get(p) ?? [];
                const cands = byPos.get(p) ?? [];
                let assigned = false;
                for (const cand of cands) {
                    let ok = true;
                    for (const st of already) if (cand.player === st) {
                        ok = false;
                        break;
                    }
                    if (ok) {
                        for (let s2 = 0; s2 < TEMPLATE.length; ++s2) if (TEMPLATE[s2] <= LASTNORMAL && starterPlyrIds[s2] === cand.player.pid) {
                            ok = false;
                            break;
                        }
                    }
                    if (ok && TEMPLATE[slot] !== cand.player.position) {
                        for (let s3 = 0; s3 < TEMPLATE.length; ++s3) if (starterPlyrIds[s3] == null && !flags[s3] && TEMPLATE[s3] <= LASTNORMAL && TEMPLATE[s3] === cand.player.position) {
                            flags[s3] = true;
                            ok = false;
                            break;
                        }
                    }
                    if (ok) {
                        starterPlyrIds[slot] = cand.player.pid;
                        cand.player.depthChartRating = cand.weightedRating;
                        already.push(cand.player);
                        team.set(p, already);
                        assigned = true;
                        break;
                    }
                }
                if (assigned) break;
            }
        }
        for (let pos = 0; pos < 35; ++pos) {
            const list = byPos.get(pos) ?? [];
            const team = chartFor(pos);
            const posList = team.get(pos) ?? [];
            for (const cand of list) {
                let add = true;
                for (const st of posList) if (st.pid === cand.player.pid) {
                    add = false;
                    break;
                }
                if (add && pos <= LASTNORMAL) {
                    for (let s = 0; s < TEMPLATE.length; ++s) if (TEMPLATE[s] <= LASTNORMAL && TEMPLATE[s] !== K && TEMPLATE[s] !== P && starterPlyrIds[s] === cand.player.pid) {
                        add = false;
                        break;
                    }
                }
                if (add) {
                    posList.push(cand.player);
                    team.set(pos, posList);
                }
            }
        }
        const seen = new Set, ratings = [];
        for (const pos of TEMPLATE) {
            const team = pos <= LASTOFFENSE ? chart.offense : pos >= FIRSTDEFENSE && pos <= LASTDEFENSE ? chart.defense : chart.special;
            const list = team.get(pos);
            if (list) {
                for (let i = 0; i < list.length; i++) {
                    if (!seen.has(list[i])) {
                        seen.add(list[i]);
                        ratings.push(list[i].depthChartRating);
                        break;
                    }
                }
            } else ratings.push(0);
        }
        const fine = cat => {
            let sum = 0;
            for (let i = 0; i < 38; i++) sum += (ratings[i] ?? 0) * (i < SLOT_W.length ? SLOT_W[i][cat] : 0) || 0;
            let r = (sum + 50) / 100;
            return r > 99 ? 99 : r < 0 ? 0 : r;
        };
        const offFine = fine(CAT.OFF), defFine = fine(CAT.DEF), ovrFine = fine(CAT.OVR);
        return {
            off: Math.floor(offFine),
            def: Math.floor(defFine),
            ovr: Math.floor(ovrFine),
            offFine: offFine,
            defFine: defFine,
            ovrFine: ovrFine
        };
    }
    function attrWeightFields(pl) {
        const pos = parseInt(pl.PLYR_POSITION, 10);
        const pt = parseInt(pl.PLYR_PLAYERTYPE, 10);
        const entry = (W[String(pos)] || {})[String(pt)];
        if (!entry) return null;
        return Object.entries(entry).filter(([f, w]) => f.endsWith("WEIGHT") && w > 0).sort((a, b) => b[1] - a[1]).map(([f]) => f.slice(0, -6));
    }
    function attrWeightEntries(pl) {
        const pos = parseInt(pl.PLYR_POSITION, 10);
        const pt = parseInt(pl.PLYR_PLAYERTYPE, 10);
        const entry = (W[String(pos)] || {})[String(pt)];
        if (!entry) return null;
        return Object.entries(entry).filter(([f, w]) => f.length >= 7 && f.endsWith("WEIGHT") && w > 0).sort((a, b) => b[1] - a[1]).map(([f, w]) => ({
            field: f.slice(0, -6),
            weight: w
        }));
    }
    const api = {
        cardOvr: cardOvr,
        depthOwn: depthOwn,
        teamRatings: teamRatings,
        calc: calc,
        attrWeightFields: attrWeightFields,
        attrWeightEntries: attrWeightEntries
    };
    if (typeof window !== "undefined") window.CFB27TB = api;
    return api;
}

if (typeof window !== "undefined") window.initCFB27TBRatings = initCFB27TBRatings;
