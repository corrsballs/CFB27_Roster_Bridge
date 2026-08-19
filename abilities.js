function initCFB27Abilities(abilities) {
    const PHYS = abilities && abilities.physical || {};
    const MENTAL = abilities && abilities.mental || {};
    const TIER_NAMES = abilities && abilities.tierNames || [ "None", "Bronze", "Silver", "Gold", "Platinum" ];
    const archOf = p => String(parseInt(p.PLYR_PLAYERTYPE, 10) || 0);
    function highestTier(player, ability) {
        for (let i = ability.tiers.length - 1; i >= 0; i--) {
            const t = ability.tiers[i];
            if (t.req.every(r => (parseInt(player[r.stat], 10) || 0) >= r.value)) return t.tier;
        }
        return 0;
    }
    function assignPhysical(player) {
        const pool = PHYS[archOf(player)];
        if (!pool) return [];
        const slots = pool.map(a => {
            const tier = highestTier(player, a);
            return tier > 0 ? {
                guid: a.id,
                tier: tier
            } : null;
        });
        return slots.some(Boolean) ? slots : [];
    }
    function mentalQuota(dev, rng) {
        if (dev >= 3) return {
            count: 2,
            tier: 3
        };
        if (dev === 2) return {
            count: rng() < .5 ? 2 : 1,
            tier: 2
        };
        if (dev === 1) return {
            count: 1,
            tier: 1
        };
        return {
            count: 0,
            tier: 0
        };
    }
    function assignMental(player, rng) {
        const pool = MENTAL[archOf(player)];
        if (!pool || !pool.length) return [];
        const dev = parseInt(player.PLYR_TRAITDEVELOPMENT, 10) || 0;
        const {count: count, tier: tier} = mentalQuota(dev, rng);
        const cands = [ ...pool ];
        const picked = [];
        for (let n = 0; n < Math.min(count, cands.length, 3); n++) {
            const idx = Math.floor(rng() * cands.length);
            picked.push({
                guid: cands[idx].id,
                tier: tier
            });
            cands.splice(idx, 1);
        }
        return picked;
    }
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
    function assignAll(playersById, ca, rng) {
        if (!ca) return null;
        const rand = rng || mulberry32(179401189);
        const counts = {
            players: 0,
            physical: 0,
            mental: 0,
            byTier: [ 0, 0, 0, 0, 0 ]
        };
        for (const [pid, p] of Object.entries(playersById)) {
            const phys = assignPhysical(p);
            const mental = assignMental(p, rand);
            ca[pid] = {
                0: phys,
                1: mental
            };
            counts.players++;
            for (const s of phys) if (s) {
                counts.physical++;
                counts.byTier[s.tier]++;
            }
            counts.mental += mental.length;
        }
        return counts;
    }
    const NAME_BY_GUID = {};
    for (const pool of [ ...Object.values(PHYS), ...Object.values(MENTAL) ]) {
        for (const a of pool) NAME_BY_GUID[a.id] = a.name;
    }
    function summarize(caEntry) {
        if (!caEntry) return "";
        const label = s => `${NAME_BY_GUID[s.guid] || "?"} ${(TIER_NAMES[s.tier] || "?")[0]}`;
        const phys = (caEntry["0"] || []).filter(Boolean).map(label);
        const mental = (caEntry["1"] || []).map(label);
        return [ ...phys, ...mental ].join(" · ");
    }
    const SKILL_CAPS = abilities && abilities.skillCaps || [];
    const YEAR_KEYS = [ "freshman", "sophmore", "junior", "senior" ];
    function capModifier(potential, schoolYear) {
        const tier = SKILL_CAPS.find(t => t.id === potential) || SKILL_CAPS[0];
        if (!tier) return null;
        const y = Math.max(0, Math.min(3, parseInt(schoolYear, 10) || 0));
        return tier[YEAR_KEYS[y]];
    }
    function pools(player) {
        const arch = archOf(player);
        return {
            physical: PHYS[arch] || [],
            mental: MENTAL[arch] || []
        };
    }
    const api = {
        highestTier: highestTier,
        assignPhysical: assignPhysical,
        assignMental: assignMental,
        assignAll: assignAll,
        summarize: summarize,
        pools: pools,
        tierNames: TIER_NAMES,
        skillCaps: SKILL_CAPS,
        capModifier: capModifier,
        mulberry32: mulberry32
    };
    if (typeof window !== "undefined") window.CFB27Abilities = api;
    return api;
}

if (typeof window !== "undefined") window.initCFB27Abilities = initCFB27Abilities;
