function initCFB27Predict(data) {
    const D = data.constants || {};
    const ARCH_MAP = D.archetypeOvrKey || {};
    const TB = data.tb || typeof window !== "undefined" && window.CFB27TB || null;
    const STARTERS = {
        QB: 1,
        HB: 1,
        FB: 1,
        WR: 4,
        TE: 2,
        LT: 1,
        LG: 1,
        C: 1,
        RG: 1,
        RT: 1,
        LE: 1,
        RE: 1,
        DT: 2,
        LOLB: 1,
        MLB: 1,
        ROLB: 1,
        CB: 3,
        FS: 1,
        SS: 1
    };
    let PT_NAMES = null;
    function labelOf(player, group) {
        const id = parseInt(player?.PLYR_PLAYERTYPE, 10);
        if (Number.isNaN(id)) return null;
        if (!PT_NAMES) {
            PT_NAMES = {};
            const ids = D.playerTypeIds || {};
            for (const [g, m] of Object.entries(ARCH_MAP)) {
                for (const [name, key] of Object.entries(m)) {
                    if (ids[key] != null) (PT_NAMES[g] ||= {})[ids[key]] = name;
                }
            }
        }
        return (PT_NAMES[group] || {})[id] ?? null;
    }
    function predictPlayer(player, archetypeName) {
        return TB ? TB.cardOvr(player) : null;
    }
    function predictPlayerTeam(player) {
        return TB ? TB.depthOwn(player) : null;
    }
    function predictTeam() {
        if (!TB || typeof WORK === "undefined" || !WORK) return null;
        const exact = TB.teamRatings(WORK.teamData.roster.playerData);
        return exact ? {
            off: exact.off,
            def: exact.def,
            ovr: exact.ovr
        } : null;
    }
    function update() {}
    const clampTarget = v => Math.max(40, Math.min(99, v));
    function displayFor(predictedValue, side) {
        return Math.floor(Math.max(0, Math.min(predictedValue, 99)));
    }
    function targetFor(desired, side) {
        return clampTarget(desired) + .5;
    }
    function sideFine(side) {
        if (!TB || typeof WORK === "undefined" || !WORK) return null;
        const exact = TB.teamRatings(WORK.teamData.roster.playerData);
        return exact ? side === "off" ? exact.offFine : exact.defFine : null;
    }
    function scaleToTarget(player, target) {
        if (!TB) return null;
        const entry = TB.attrWeightEntries(player);
        const before = predictPlayer(player, null);
        if (!entry || !entry.length || before === null) return null;
        const pos = D.positionCodes[String(parseInt(player.PLYR_POSITION, 10))];
        const group = D.positionGroup[pos];
        const label = labelOf(player, group);
        const lo = D.attrMin ?? 15, hi = D.attrMax ?? 99;
        const shown = new Set(Object.values(D.attrToJson));
        const wmax = Math.max(...entry.map(e => e.weight));
        const parts = [];
        for (const {field: field, weight: weight} of entry) {
            if (!shown.has(field) || !(field in player)) continue;
            const base = parseInt(player[field], 10);
            if (Number.isFinite(base)) parts.push({
                key: field,
                base: base,
                rate: weight / wmax,
                lo: Math.min(base, lo),
                hi: Math.max(base, hi)
            });
        }
        if (!parts.length || !(wmax > 0)) return null;
        const trialAt = k => {
            const t = {
                ...player
            };
            for (const {key: key, base: base, rate: rate, lo: lo, hi: hi} of parts) t[key] = String(Math.max(lo, Math.min(hi, Math.round(base + k * rate))));
            return t;
        };
        const predAt = k => predictPlayer(trialAt(k), null);
        let lower = -(hi - lo), upper = hi - lo;
        for (let i = 0; i < 40; i++) {
            const mid = (lower + upper) / 2;
            if ((predAt(mid) ?? -Infinity) < target) lower = mid; else upper = mid;
        }
        const dir = Math.sign(target - before);
        let bestK = 0, bestErr = Math.abs(before - target), bestGot = before;
        for (let k = Math.floor(upper) - 1; k <= Math.ceil(upper) + 1; k += .1) {
            const got = predAt(k);
            if (got === null) continue;
            const err = Math.abs(got - target);
            const moves = Math.sign(got - before) === dir, bestMoves = Math.sign(bestGot - before) === dir;
            if (err < bestErr || err === bestErr && (moves && !bestMoves || moves === bestMoves && Math.abs(k) < Math.abs(bestK))) {
                bestErr = err;
                bestK = k;
                bestGot = got;
            }
        }
        let chosen = trialAt(bestK);
        let achieved = predAt(bestK);
        if (achieved !== null && achieved !== target) {
            const dirStep = Math.sign(target - achieved);
            const order = [ ...parts ].sort((a, b) => a.rate - b.rate);
            let cur = chosen, curGot = achieved;
            let best = chosen, bestGap = Math.abs(achieved - target);
            for (let pass = 0; pass < 6 && curGot !== target; pass++) {
                let touched = false;
                for (const part of order) {
                    const v = parseInt(cur[part.key], 10);
                    const nv = Math.max(part.lo, Math.min(part.hi, v + dirStep));
                    if (nv === v) continue;
                    const t = {
                        ...cur,
                        [part.key]: String(nv)
                    };
                    const got = predictPlayer(t, null);
                    if (got === null || Math.abs(got - target) > Math.abs(curGot - target)) continue;
                    cur = t;
                    curGot = got;
                    touched = true;
                    if (Math.abs(got - target) < bestGap) {
                        best = t;
                        bestGap = Math.abs(got - target);
                    }
                    if (curGot === target) break;
                }
                if (!touched) break;
            }
            chosen = best;
            achieved = predictPlayer(best, null);
        }
        const changes = {};
        for (const {key: key} of parts) if (chosen[key] !== String(player[key])) changes[key] = chosen[key];
        return {
            changes: changes,
            achieved: achieved,
            before: before,
            label: label ?? "EA card"
        };
    }
    function weightedAttrKeys(player) {
        if (!TB) return null;
        const fields = TB.attrWeightFields(player);
        if (!fields) return null;
        const pos = D.positionCodes[String(parseInt(player.PLYR_POSITION, 10))];
        const group = D.positionGroup[pos];
        const shown = new Set(Object.values(D.attrToJson));
        return {
            label: labelOf(player, group),
            keys: fields.filter(f => shown.has(f))
        };
    }
    const exact = !!TB;
    const api = {
        update: update,
        predictTeam: predictTeam,
        predictPlayer: predictPlayer,
        predictPlayerTeam: predictPlayerTeam,
        scaleToTarget: scaleToTarget,
        targetFor: targetFor,
        displayFor: displayFor,
        sideFine: sideFine,
        exact: exact,
        weightedAttrKeys: weightedAttrKeys,
        STARTERS: STARTERS
    };
    if (typeof window !== "undefined") window.CFB27Predict = api;
    console.info(TB ? `[CFB27] predictor ready — TB's own engine active (exact cards + header)` : `[CFB27] predictor NOT ready — tb-ratings engine missing (data/ea_ratings.json?)`);
    return api;
}

if (typeof window !== "undefined") window.initCFB27Predict = initCFB27Predict;
