/* P.A.C.H.I.R.I.S.U.
 * Petit Assistant de Combat Hyper-Intelligent, Rodent: Insolent, Sarcastic, yet Useful.
 *
 * Lit l'etat du combat depuis le client Pokemon Showdown, calcule les degats
 * dans les deux sens, et classe tes options.
 *
 * Affiche seulement. Ne clique jamais, n'envoie jamais rien au serveur.
 */
(() => {
  'use strict';
  if (window.__AG_COPILOT__) return;
  window.__AG_COPILOT__ = true;

  /* ------------------------------------------------------------------ */
  /* Helpers                                                             */
  /* ------------------------------------------------------------------ */

  const toID = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

  function dex() { return window.BattlePokedex || null; }
  function movedex() { return window.BattleMovedex || null; }
  function typechart() { return window.BattleTypeChart || null; }

  function species(name) {
    const d = dex();
    if (!d) return null;
    let e = d[toID(name)];
    // Unknown forme (e.g. "Arceus-*" at teampreview): fall back to the base species.
    if (!e && String(name || '').includes('-')) e = d[toID(String(name).split('-')[0])];
    return e || null;
  }

  function moveData(name) {
    const m = movedex();
    if (!m) return null;
    return m[toID(name)] || null;
  }

  /* Effectiveness of an attacking type against a defending type.
   * BattleTypeChart[def].damageTaken[Atk]: 0 normal, 1 weak(x2), 2 resist(x0.5), 3 immune.
   * The live client keys rows by lowercase id ("dark"), columns by type name ("Dark"). */
  function typeMult(atkType, defTypes) {
    const tc = typechart();
    if (!tc || !atkType) return 1;
    let mult = 1;
    for (const dt of defTypes || []) {
      const row = tc[toID(dt)] || tc[dt];
      if (!row || !row.damageTaken) continue;
      const v = row.damageTaken[atkType];
      if (v === 1) mult *= 2;
      else if (v === 2) mult *= 0.5;
      else if (v === 3) mult *= 0;
    }
    return mult;
  }

  /* Stat formulas (gen 3+). Random Battle mons are below level 100. */
  function statAt(base, ev, natureMult, iv, level) {
    iv = (iv === undefined) ? 31 : iv;
    level = level || 100;
    return Math.floor((Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100) + 5) * natureMult);
  }
  function hpAt(base, ev, level, iv) {
    iv = (iv === undefined) ? 31 : iv;
    level = level || 100;
    return Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100) + level + 10;
  }
  function statAt100(base, ev, natureMult, iv) { return statAt(base, ev, natureMult, iv, 100); }
  function hpAt100(base, ev) { return hpAt(base, ev, 100); }

  function boostMult(stage) {
    stage = clamp(stage || 0, -6, 6);
    return stage >= 0 ? (2 + stage) / 2 : 2 / (2 - stage);
  }

  /* ------------------------------------------------------------------ */
  /* Battle state reading                                                */
  /* ------------------------------------------------------------------ */

  function getRoom() {
    const app = window.app;
    if (!app) return null;
    const room = app.curRoom;
    if (room && room.battle) return room;
    // Fallback: scan open rooms for a battle.
    if (app.rooms) {
      for (const k of Object.keys(app.rooms)) {
        const r = app.rooms[k];
        if (r && r.battle) return r;
      }
    }
    return null;
  }

  function sides(battle) {
    const mine = battle.mySide || (battle.sides && battle.sides[0]) || null;
    let foe = battle.farSide || null;
    if (!foe && battle.sides) foe = battle.sides.find((s) => s !== mine) || null;
    return { mine, foe };
  }

  function activeOf(side) {
    if (!side || !side.active) return null;
    return side.active.find((p) => p && !p.fainted) || side.active[0] || null;
  }

  /* Read the opposing active. We never know their EVs, so we estimate. */
  function readFoe(p) {
    if (!p) return null;
    const name = p.speciesForme || p.species || p.name;
    const sp = species(name);
    if (!sp) return null;

    // Transform / Imposter: the client keeps speciesForme ("Ditto") and stores
    // the copy in volatiles.transform = ['transform', target] and
    // volatiles.formechange = ['formechange', copiedSpecies]. A transformed mon
    // fights with the target's types, stats (except HP), moves and boosts.
    const vol = p.volatiles || {};
    const tr = vol.transform;
    let copy = null;
    if (tr) {
      const fc = vol.formechange;
      const tName = (fc && fc[1]) || (tr[1] && tr[1].speciesForme) || '';
      copy = species(tName);
    }
    const look = copy || sp;

    const terastallized = p.terastallized || null;
    // Tera Stellar keeps the original types on defense. Protean / Libero / Soak /
    // Burn Up... show up as volatiles.typechange ("Fire/Flying"), Trick-or-Treat and
    // Forest's Curse as volatiles.typeadd.
    let types = (look.types || []).slice();
    if (vol.typechange && vol.typechange[1]) types = String(vol.typechange[1]).split('/').filter((t) => t && t !== '???');
    if (vol.typeadd && vol.typeadd[1] && !types.includes(vol.typeadd[1])) types.push(vol.typeadd[1]);
    if (terastallized && terastallized !== 'Stellar') types = [terastallized];

    // Unrevealed ability: if the species has only one possible ability, it's that one.
    let ability = p.ability || p.baseAbility || '';
    const abs = sp.abilities ? Object.keys(sp.abilities) : [];
    if (!ability && abs.length === 1) ability = sp.abilities[abs[0]];

    let hpPct = 100;
    if (typeof p.hp === 'number' && typeof p.maxhp === 'number' && p.maxhp > 0) {
      hpPct = (p.hp / p.maxhp) * 100;
    }

    return {
      name,
      // HP always stays the user's own; the rest is copied when transformed.
      base: copy ? Object.assign({}, copy.baseStats, { hp: sp.baseStats.hp }) : sp.baseStats,
      types,
      baseTypes: look.types || [],
      terastallized,
      hpPct,
      fainted: !!p.fainted,
      boosts: p.boosts || {},
      status: p.status || '',
      ability,
      item: p.item || '',
      level: p.level || 100,
      weightkg: look.weightkg || 0,
      timesAttacked: p.timesAttacked || 0,
      transformed: copy ? (copy.name || name) : null,
      transformTarget: copy && tr ? tr[1] || null : null,
      baseSpecies: sp.name || name,
      volatiles: Object.keys(vol),
      nfe: !!(sp.evos && sp.evos.length),
      // Item gone (Knock Off, Sash used...): don't guess one from the sets.
      itemLost: !!p.prevItem,
      known: true
    };
  }

  /* Read one of our own mons. The protocol request gives us exact stats. */
  function readMine(reqMon, clientMon) {
    if (!reqMon) return null;
    const detail = String(reqMon.details || '').split(',')[0];
    const name = detail || (clientMon && clientMon.speciesForme) || '';
    const sp = species(name);
    if (!sp) return null;

    let cur = 0, max = 0, fainted = false;
    const cond = String(reqMon.condition || '');
    if (cond.includes('fnt')) { fainted = true; }
    const m = cond.match(/^(\d+)\/(\d+)/);
    if (m) { cur = +m[1]; max = +m[2]; }

    // The request is only refreshed once per decision, the client battle state
    // follows the log live. Trust the client for faints and HP once the mon has
    // been out (unrevealed mons sit at hp 0 / maxhp 1000 there, so skip those).
    if (clientMon) {
      if (clientMon.fainted) fainted = true;
      else if (clientMon.hp > 0 && clientMon.maxhp > 0 && max > 0) {
        cur = Math.round((clientMon.hp / clientMon.maxhp) * max);
      }
    }

    const tera = reqMon.terastallized || (clientMon && clientMon.terastallized) || null;
    const types = (tera && tera !== 'Stellar') ? [tera] : (sp.types || []);

    return {
      name,
      base: sp.baseStats,
      stats: reqMon.stats || null,   // {atk,def,spa,spd,spe} exact
      maxhp: max,
      curhp: cur,
      hpPct: max > 0 ? (cur / max) * 100 : 0,
      types,
      baseTypes: sp.types || [],
      terastallized: tera,
      fainted,
      boosts: (clientMon && clientMon.boosts) || {},
      status: String(reqMon.condition || '').includes(' ')
        ? String(reqMon.condition).split(' ')[1]
        : ((clientMon && clientMon.status) || ''),
      ability: reqMon.baseAbility || (clientMon && clientMon.ability) || '',
      item: reqMon.item || (clientMon && clientMon.item) || '',
      moves: reqMon.moves || [],
      active: !!reqMon.active,
      level: +((String(reqMon.details || '').match(/, L(\d+)/) || [])[1] || 100),
      teraType: reqMon.teraType || '',
      weightkg: sp.weightkg || 0,
      volatiles: Object.keys((clientMon && clientMon.volatiles) || {}),
      nfe: !!(sp.evos && sp.evos.length),
      known: true
    };
  }

  function readField(battle) {
    const weather = toID(battle.weather || '');
    let terrain = '';
    const pw = battle.pseudoWeather || [];
    for (const e of pw) {
      const id = toID(Array.isArray(e) ? e[0] : (e && e.id) || e);
      if (id.includes('terrain')) terrain = id;
    }
    // Random Battle: fixed spreads (84 EVs, neutral nature) and levels per mon.
    const random = /random/i.test(battle.tier || '');
    // "[Gen 9] Anything Goes" -> "anythinggoes", "[Gen 9] OU" -> "ou" (keys of AG_META)
    const format = toID(String(battle.tier || '').replace(/\[[^\]]*\]/g, ''));
    const trickroom = pw.some((e) => toID(Array.isArray(e) ? e[0] : (e && e.id) || e) === 'trickroom');
    // Tailwind lives on each side's sideConditions.
    const sd = battle.mySide || battle.farSide || battle.sides ? sides(battle) : { mine: null, foe: null };
    const tw = (x) => !!(x && x.sideConditions && x.sideConditions.tailwind);
    return { weather, terrain, random, format, trickroom, tailwind: { mine: tw(sd.mine), foe: tw(sd.foe) } };
  }

  /* ------------------------------------------------------------------ */
  /* Damage engine                                                       */
  /* ------------------------------------------------------------------ */

  const SUN = ['sunnyday', 'desolateland'];
  const RAIN = ['raindance', 'primordialsea'];

  /* Opponent stat estimates. We use two defensive profiles so the output is a
   * range instead of a single misleading number. */
  function foeStat(foe, key, profile, field) {
    const base = foe.base && foe.base[key];
    if (!base) return 100;
    const L = foe.level || 100;

    // Random Battle: every set is 84 EVs / 31 IVs / neutral, no guessing needed.
    if (field && field.random) {
      return key === 'hp' ? hpAt(base, 84, L) : statAt(base, 84, 1.0, 31, L);
    }

    // Offensive stats: always assume the worst for us (max EV, boosting nature).
    if (key === 'atk' || key === 'spa' || key === 'spe') {
      return statAt(base, 252, 1.1, 31, L);
    }

    // Defensive stats and HP: the profile decides.
    //  'bulky'   -> fully invested, gives the LOW end of our damage range
    //  'offense' -> uninvested,     gives the HIGH end of our damage range
    if (key === 'hp') {
      return hpAt(base, profile === 'bulky' ? 252 : 0, L);
    }
    if (profile === 'bulky') return statAt(base, 252, 1.1, 31, L);
    return statAt(base, 0, 1.0, 31, L);
  }

  /* Weight-based base power. */
  function lowKickPower(kg) {
    if (!kg) return 100; // unknown weight: middle of the road
    return kg >= 200 ? 120 : kg >= 100 ? 100 : kg >= 50 ? 80 : kg >= 25 ? 60 : kg >= 10 ? 40 : 20;
  }
  function heavySlamPower(userKg, targetKg) {
    if (!userKg || !targetKg) return 100;
    const r = userKg / targetKg;
    return r >= 5 ? 120 : r >= 4 ? 100 : r >= 3 ? 80 : r >= 2 ? 60 : 40;
  }

  function abilityImmunity(abilityId, moveType, md) {
    // Wind Rider blocks wind moves (any type), not Flying moves.
    if (abilityId === 'windrider') return !!(md && md.flags && md.flags.wind);
    const map = {
      levitate: 'Ground',
      flashfire: 'Fire',
      waterabsorb: 'Water',
      stormdrain: 'Water',
      dryskin: 'Water',
      voltabsorb: 'Electric',
      lightningrod: 'Electric',
      motordrive: 'Electric',
      sapsipper: 'Grass',
      eartheater: 'Ground',
      wellbakedbody: 'Fire'
    };
    return map[abilityId] === moveType;
  }

  const PLATES = {
    dracoplate: 'Dragon', dreadplate: 'Dark', earthplate: 'Ground', fistplate: 'Fighting',
    flameplate: 'Fire', icicleplate: 'Ice', insectplate: 'Bug', ironplate: 'Steel',
    meadowplate: 'Grass', mindplate: 'Psychic', pixieplate: 'Fairy', skyplate: 'Flying',
    splashplate: 'Water', spookyplate: 'Ghost', stoneplate: 'Rock', toxicplate: 'Poison',
    zapplate: 'Electric'
  };

  // Items that boost one type by x1.2.
  const TYPE_ITEMS = {
    silkscarf: 'Normal', charcoal: 'Fire', mysticwater: 'Water', seaincense: 'Water', waveincense: 'Water',
    magnet: 'Electric', miracleseed: 'Grass', roseincense: 'Grass', nevermeltice: 'Ice', blackbelt: 'Fighting',
    poisonbarb: 'Poison', softsand: 'Ground', sharpbeak: 'Flying', twistedspoon: 'Psychic', oddincense: 'Psychic',
    silverpowder: 'Bug', hardstone: 'Rock', rockincense: 'Rock', spelltag: 'Ghost', dragonfang: 'Dragon',
    blackglasses: 'Dark', metalcoat: 'Steel', fairyfeather: 'Fairy'
  };
  // Legendary orbs / cores: x1.2 on Dragon and the holder's other type.
  const ORBS = {
    griseouscore: 'Ghost', griseousorb: 'Ghost', adamantcrystal: 'Steel', adamantorb: 'Steel',
    lustrousglobe: 'Water', lustrousorb: 'Water'
  };
  // Berries that halve one super effective hit of their type (Chilan: any Normal hit).
  const RESIST_BERRIES = {
    occaberry: 'Fire', passhoberry: 'Water', wacanberry: 'Electric', rindoberry: 'Grass', yacheberry: 'Ice',
    chopleberry: 'Fighting', kebiaberry: 'Poison', shucaberry: 'Ground', cobaberry: 'Flying', payapaberry: 'Psychic',
    tangaberry: 'Bug', chartiberry: 'Rock', kasibberry: 'Ghost', habanberry: 'Dragon', colburberry: 'Dark',
    babiriberry: 'Steel', roseliberry: 'Fairy'
  };
  // Normal moves turned into another type, x1.2.
  const ATE = { pixilate: 'Fairy', aerilate: 'Flying', refrigerate: 'Ice', galvanize: 'Electric' };
  // Mold Breaker and co. ignore the defender's ability (Shadow Shield / Prism Armor excepted).
  const MOLD = ['moldbreaker', 'teravolt', 'turboblaze', 'myceliummight'];
  const UNBREAKABLE = ['shadowshield', 'prismarmor', 'fullmetalbody', 'multitype', 'asonespectrier', 'asoneglastrier'];
  const TERRAIN_TYPE = { electricterrain: 'Electric', grassyterrain: 'Grass', psychicterrain: 'Psychic' };

  /* Touching the ground: terrains apply, Ground moves hit. */
  function grounded(mon) {
    if ((mon.types || []).includes('Flying')) return false;
    if (toID(mon.ability) === 'levitate') return false;
    if (toID(mon.item) === 'airballoon') return false;
    return true;
  }

  /* Protosynthesis / Quark Drive boost the highest stat; the client shows
   * which one as a volatile ("protosynthesisatk", "quarkdrivespe"...). */
  function paradoxBoost(mon, key) {
    const v = mon.volatiles || [];
    return v.includes('protosynthesis' + key) || v.includes('quarkdrive' + key);
  }

  /* Returns {min, max} damage as a percentage of the defender's max HP. */
  function calcDamage(opts) {
    const {
      move, atk, def, field,
      atkProfile, defProfile,
      foeFaintedCount, movesLast
    } = opts;

    const md = moveData(move);
    if (!md) return null;
    if (md.category === 'Status') return { status: true, name: md.name };

    let power = md.basePower || 0;
    let mType = md.type;
    const aItem = toID(atk.item);
    const dItem = toID(def.item);
    const mid = toID(move);
    const aAb = toID(atk.ability);
    // Mold Breaker: the defender's ability does nothing (except the unbreakable ones).
    const dAbRaw = toID(def.ability);
    const dAb = (MOLD.includes(aAb) && !UNBREAKABLE.includes(dAbRaw)) ? '' : dAbRaw;
    const flags = md.flags || {};

    // Move type changes.
    if (mid === 'judgment') {
      // Plate if known, else the Arceus forme says it ("Arceus-Fairy").
      if (PLATES[aItem]) mType = PLATES[aItem];
      else if (/^arceus-/i.test(atk.baseSpecies || atk.name || '') && (atk.baseTypes || [])[0]) mType = atk.baseTypes[0];
    }
    if (mid === 'terablast' && atk.terastallized && atk.terastallized !== 'Stellar') mType = atk.terastallized;
    let ateBoost = false;
    if (aAb === 'normalize') { mType = 'Normal'; ateBoost = true; }
    else if (ATE[aAb] && mType === 'Normal') { mType = ATE[aAb]; ateBoost = true; }

    // A few variable-power moves worth special casing.
    if (mid === 'grassknot' || mid === 'lowkick') power = lowKickPower(def.weightkg);
    // Payback doubles when the user moves last (unknown: assume it does).
    if (mid === 'payback') power = movesLast === false ? 50 : 100;
    // Powers that grow during the game.
    const positiveBoosts = Object.values(atk.boosts || {}).reduce((n, v) => n + (v > 0 ? v : 0), 0);
    if (mid === 'storedpower' || mid === 'powertrip') power = 20 + 20 * positiveBoosts;
    if (mid === 'lastrespects') power = 50 + 50 * clamp(foeFaintedCount || 0, 0, 100);
    if (mid === 'ragefist') power = Math.min(350, 50 + 50 * (atk.timesAttacked || 0));
    if (mid === 'heavyslam' || mid === 'heatcrash') power = heavySlamPower(atk.weightkg, def.weightkg);
    if (power <= 0) return { nonDamaging: true, name: md.name };

    // Always-crit moves (Wicked Blow, Surging Strikes, Flower Trick...): x1.5,
    // ignore our Atk drops, their Def boosts and screens. Blocked by Shell/Battle Armor.
    const crit = !!md.willCrit && !['battlearmor', 'shellarmor'].includes(toID(def.ability));

    const rawStat = (mon, key, profile) => (mon.stats ? mon.stats[key] : foeStat(mon, key, profile, field));
    const boosted = (mon, key, profile) => rawStat(mon, key, profile) * boostMult(mon.boosts && mon.boosts[key]);

    let physical = md.category === 'Physical';
    // Moves whose category follows the user's stats.
    if (mid === 'photongeyser' || mid === 'lightthatburnsthesky' || (mid === 'terablast' && atk.terastallized)) {
      physical = boosted(atk, 'atk', 'offense') > boosted(atk, 'spa', 'offense');
    } else if (mid === 'shellsidearm') {
      physical = boosted(atk, 'atk', 'offense') / boosted(def, 'def', defProfile)
        > boosted(atk, 'spa', 'offense') / boosted(def, 'spd', defProfile);
    }

    // --- attacking stat ---
    // Foul Play uses the target's Atk (and its boosts), Body Press the user's Def.
    const aKey = mid === 'bodypress' ? 'def' : physical ? 'atk' : 'spa';
    const aSrc = mid === 'foulplay' ? def : atk;
    let A;
    if (aSrc.stats) {
      A = aSrc.stats[aKey];
    } else {
      A = foeStat(aSrc, aKey, 'offense', field);
    }
    let aStage = (aSrc.boosts && aSrc.boosts[aKey]) || 0;
    if (dAb === 'unaware') aStage = 0;           // Unaware target ignores our boosts
    A = Math.floor(A * boostMult(crit ? Math.max(0, aStage) : aStage));
    if (aSrc === atk && paradoxBoost(atk, aKey)) A = Math.floor(A * 1.3);

    // --- defending stat ---
    // Psyshock / Psystrike / Secret Sword are special but hit Defense.
    const dKey = (physical || md.overrideDefensiveStat === 'def') ? 'def' : 'spd';
    let D, maxHP;
    if (def.stats) {
      D = def.stats[dKey];
      maxHP = def.maxhp || (field && field.random ? hpAt(def.base.hp, 84, def.level) : hpAt(def.base.hp, 252, def.level));
    } else {
      D = foeStat(def, dKey, defProfile, field);
      maxHP = foeStat(def, 'hp', defProfile, field);
    }
    let dStage = (def.boosts && def.boosts[dKey]) || 0;
    // Our Unaware, and Sacred Sword / Darkest Lariat / Chip Away, ignore their boosts.
    if (aAb === 'unaware' || md.ignoreDefensive) dStage = 0;
    D = Math.floor(D * boostMult(crit ? Math.min(0, dStage) : dStage));
    if (paradoxBoost(def, dKey)) D = Math.floor(D * 1.3);

    // --- ability and item modifiers on raw stats ---
    if (aAb === 'guts' && atk.status && physical) A = Math.floor(A * 1.5);
    if (aAb === 'hustle' && physical) A = Math.floor(A * 1.5);
    if (dAb === 'thickfat' && (mType === 'Fire' || mType === 'Ice')) A = Math.floor(A * 0.5);
    if (dAb === 'furcoat' && dKey === 'def') D = Math.floor(D * 2);
    if (dItem === 'assaultvest' && dKey === 'spd') D = Math.floor(D * 1.5);
    if (dItem === 'eviolite' && def.nfe) D = Math.floor(D * 1.5);

    if (aAb === 'orichalcumpulse' && SUN.includes(field.weather) && physical) A = Math.floor(A * 1.3333);
    if (aAb === 'hadronengine' && field.terrain.includes('electric') && !physical) A = Math.floor(A * 1.3333);
    if (aAb === 'supremeoverlord') A = Math.floor(A * (1 + 0.1 * clamp(foeFaintedCount || 0, 0, 5)));
    if (aAb === 'hugepower' || aAb === 'purepower') A = Math.floor(A * 2);

    // Ruin abilities lower the stat of every OTHER mon on the field:
    // Snow: Ice types get x1.5 Def. Sandstorm: Rock types get x1.5 SpD.
    const wx = field && field.weather;
    if ((wx === 'snowscape' || wx === 'snow') && dKey === 'def' && (def.types || []).includes('Ice')) D = Math.floor(D * 1.5);
    if (wx === 'sandstorm' && dKey === 'spd' && (def.types || []).includes('Rock')) D = Math.floor(D * 1.5);

    // Vessel/Tablets on the defender lower our SpA/Atk, Sword/Beads on the
    // attacker lower the defender's Def/SpD.
    if (dAb === 'vesselofruin' && !physical) A = Math.floor(A * 0.75);
    if (dAb === 'tabletsofruin' && physical) A = Math.floor(A * 0.75);
    if (aAb === 'swordofruin' && dKey === 'def') D = Math.floor(D * 0.75);
    if (aAb === 'beadsofruin' && dKey === 'spd') D = Math.floor(D * 0.75);

    // Air Lock / Cloud Nine on either side suppress weather effects.
    const noWeather = ['airlock', 'cloudnine'];
    const weather = (noWeather.includes(aAb) || noWeather.includes(dAb)) ? '' : field.weather;

    // --- immunities ---
    if (abilityImmunity(dAb, mType, md)) {
      return { immune: true, name: md.name, reason: def.ability };
    }
    if (dAb === 'bulletproof' && flags.bullet) return { immune: true, name: md.name, reason: def.ability };
    if (dAb === 'soundproof' && flags.sound) return { immune: true, name: md.name, reason: def.ability };
    if (mType === 'Ground' && dItem === 'airballoon' && mid !== 'thousandarrows') {
      return { immune: true, name: md.name, reason: def.item };
    }
    const eff = typeMult(mType, def.types);
    if (eff === 0) return { immune: true, name: md.name, reason: 'type' };
    if (dAb === 'wonderguard' && eff <= 1) return { immune: true, name: md.name, reason: def.ability };

    // Terrains only touch grounded mons.
    const terrain = (field && field.terrain) || '';
    const atkGrounded = grounded(atk), defGrounded = grounded(def);
    // Psychic Terrain blocks priority moves aimed at a grounded target.
    if (terrain === 'psychicterrain' && (md.priority || 0) > 0 && defGrounded) {
      return { immune: true, name: md.name, reason: 'Psychic Terrain' };
    }

    // --- base power modifiers ---
    let bp = 1;
    if (ateBoost) bp *= 1.2;
    if (aAb === 'technician' && power <= 60) bp *= 1.5;
    if (aAb === 'toughclaws' && flags.contact) bp *= 1.3;
    if (aAb === 'sharpness' && flags.slicing) bp *= 1.5;
    if (aAb === 'strongjaw' && flags.bite) bp *= 1.5;
    if (aAb === 'ironfist' && flags.punch) bp *= 1.2;
    if (aAb === 'megalauncher' && flags.pulse) bp *= 1.5;
    if (aAb === 'punkrock' && flags.sound) bp *= 1.3;
    if (aAb === 'reckless' && md.recoil) bp *= 1.2;
    if (aAb === 'sheerforce' && (md.secondary || md.secondaries)) bp *= 1.3;
    if (aAb === 'transistor' && mType === 'Electric') bp *= 1.3;
    if (aAb === 'dragonsmaw' && mType === 'Dragon') bp *= 1.5;
    if (aAb === 'rockypayload' && mType === 'Rock') bp *= 1.5;
    if ((aAb === 'steelworker' || aAb === 'steelyspirit') && mType === 'Steel') bp *= 1.5;
    if (aAb === 'waterbubble' && mType === 'Water') bp *= 2;
    if (dAb === 'heatproof' && mType === 'Fire') bp *= 0.5;
    if (dAb === 'dryskin' && mType === 'Fire') bp *= 1.25;
    if (aItem === 'muscleband' && physical) bp *= 1.1;
    if (aItem === 'wiseglasses' && !physical) bp *= 1.1;
    if (aItem === 'punchingglove' && flags.punch) bp *= 1.1;
    if (TYPE_ITEMS[aItem] === mType) bp *= 1.2;
    if (ORBS[aItem] && (mType === 'Dragon' || mType === ORBS[aItem])) bp *= 1.2;
    // Ogerpon's masks boost every move.
    if (['wellspringmask', 'hearthflamemask', 'cornerstonemask'].includes(aItem)) bp *= 1.2;
    if (TERRAIN_TYPE[terrain] === mType && atkGrounded) bp *= 1.3;
    if (terrain === 'grassyterrain' && ['earthquake', 'bulldoze', 'magnitude'].includes(mid) && defGrounded) bp *= 0.5;
    if (terrain === 'mistyterrain' && mType === 'Dragon' && defGrounded) bp *= 0.5;
    if (mid === 'risingvoltage' && terrain === 'electricterrain' && defGrounded) bp *= 2;
    if (mid === 'expandingforce' && terrain === 'psychicterrain' && atkGrounded) bp *= 1.5;
    power = Math.max(1, Math.floor(power * bp));

    // --- base damage ---
    const levelFactor = Math.floor((2 * (atk.level || 100)) / 5) + 2;
    let base = Math.floor(Math.floor(levelFactor * power * A / D) / 50) + 2;

    // --- multiplicative modifiers ---
    let mod = 1;

    // weather
    if (mType === 'Fire') {
      if (SUN.includes(weather)) mod *= 1.5;
      if (weather === 'primordialsea') mod *= 0;
      else if (RAIN.includes(weather)) mod *= 0.5;
    }
    if (mType === 'Water') {
      if (RAIN.includes(weather)) mod *= 1.5;
      if (weather === 'desolateland') mod *= 0;
      else if (SUN.includes(weather)) mod *= 0.5;
    }

    // STAB (Gen 9). Tera Stellar keeps the original-type STAB only.
    const origTypes = atk.baseTypes || [];
    const tera = atk.terastallized;
    const adapt = aAb === 'adaptability';
    const teraMatch = !!tera && tera === mType;
    const origMatch = origTypes.includes(mType);
    if (teraMatch && origMatch) mod *= adapt ? 2.25 : 2;
    else if (teraMatch) mod *= adapt ? 2 : 1.5;
    else if (origMatch) mod *= (adapt && !tera) ? 2 : 1.5;

    // type effectiveness
    mod *= eff;

    // items
    if (aItem === 'lifeorb') mod *= 1.3;
    if (aItem === 'choicespecs' && !physical) mod *= 1.5;
    if (aItem === 'choiceband' && physical) mod *= 1.5;
    if (aItem === 'expertbelt' && eff > 1) mod *= 1.2;
    if (PLATES[aItem] === mType) mod *= 1.2;
    if (aItem === 'souldew' && (mType === 'Psychic' || mType === 'Dragon')) mod *= 1.2;
    if ((mid === 'electrodrift' || mid === 'collisioncourse') && eff > 1) mod *= 5461 / 4096;
    if (RESIST_BERRIES[dItem] === mType && eff > 1) mod *= 0.5;
    if (dItem === 'chilanberry' && mType === 'Normal') mod *= 0.5;

    // abilities on the final damage
    if (aAb === 'tintedlens' && eff < 1) mod *= 2;
    if (['filter', 'solidrock', 'prismarmor'].includes(dAb) && eff > 1) mod *= 0.75;
    if (aAb === 'neuroforce' && eff > 1) mod *= 1.25;
    if (dAb === 'fluffy') {
      if (flags.contact) mod *= 0.5;
      if (mType === 'Fire') mod *= 2;
    }
    if (dAb === 'icescales' && !physical) mod *= 0.5;
    if (dAb === 'purifyingsalt' && mType === 'Ghost') mod *= 0.5;
    if (dAb === 'waterbubble' && mType === 'Fire') mod *= 0.5;
    if (dAb === 'punkrock' && flags.sound) mod *= 0.5;

    // critical hit
    if (crit) mod *= 1.5;

    // screens on the defender's side (a crit or Infiltrator goes through)
    const sc = def.screens || {};
    if (!crit && aAb !== 'infiltrator'
      && ((physical && (sc.reflect || sc.auroraveil)) || (!physical && (sc.lightscreen || sc.auroraveil)))) {
      mod *= 0.5;
    }

    // burn
    if (toID(atk.status) === 'brn' && physical && aAb !== 'guts') mod *= 0.5;

    // multiscale / shadow shield at full HP
    if ((dAb === 'multiscale' || dAb === 'shadowshield') && def.hpPct >= 99.5) mod *= 0.5;

    // multi-hit: md.multihit is a number (fixed) or [min, max].
    let hitsLo = 1, hitsHi = 1;
    if (Array.isArray(md.multihit)) {
      [hitsLo, hitsHi] = md.multihit;
      if (aAb === 'skilllink') hitsLo = hitsHi;
      else if (aItem === 'loadeddice') hitsLo = Math.max(hitsLo, hitsHi - 1);
    } else if (typeof md.multihit === 'number') {
      hitsLo = hitsHi = md.multihit;
    }

    // Disguise (intact Mimikyu): the first hit only costs 1/8 HP, the next hits land.
    const disguise = dAb === 'disguise' && !/busted/i.test(def.name || '') && def.hpPct >= 99.5;
    const minHits = disguise ? hitsLo - 1 : hitsLo, maxHits = disguise ? hitsHi - 1 : hitsHi;
    const chip = disguise ? Math.floor(maxHP / 8) : 0;
    const min = Math.floor(base * 0.85 * mod) * minHits + chip;
    const max = Math.floor(base * 1.0 * mod) * maxHits + chip;

    return {
      name: md.name,
      type: mType,
      eff,
      priority: md.priority || 0,
      category: physical ? 'Physical' : 'Special',
      power,
      multiHit: hitsHi > 1,
      crit,
      disguise,
      minPct: (min / maxHP) * 100,
      maxPct: (max / maxHP) * 100
    };
  }

  /* ------------------------------------------------------------------ */
  /* Speed                                                               */
  /* ------------------------------------------------------------------ */

  function speedOf(mon, field, isMine) {
    let spe;
    if (mon.stats) spe = mon.stats.spe;
    else if (field && field.random) spe = statAt(mon.base.spe, 84, 1.0, 31, mon.level);
    else spe = statAt(mon.base.spe, 252, 1.1, 31, mon.level); // worst case for the foe

    spe = Math.floor(spe * boostMult(mon.boosts && mon.boosts.spe));

    const ab = toID(mon.ability);
    const it = toID(mon.item);
    const wx = (field && field.weather) || '';
    if (ab === 'swiftswim' && RAIN.includes(wx)) spe *= 2;
    if (ab === 'chlorophyll' && SUN.includes(wx)) spe *= 2;
    if (ab === 'sandrush' && wx === 'sandstorm') spe *= 2;
    if (ab === 'slushrush' && (wx === 'snowscape' || wx === 'snow' || wx === 'hail')) spe *= 2;
    if (ab === 'surgesurfer' && field && field.terrain === 'electricterrain') spe *= 2;
    if (ab === 'unburden' && mon.itemLost) spe *= 2;
    if (paradoxBoost(mon, 'spe')) spe = Math.floor(spe * 1.5);
    if (it === 'choicescarf' || (!isMine && mon.assumeScarf)) spe = Math.floor(spe * 1.5);
    if (it === 'ironball') spe = Math.floor(spe * 0.5);
    if (field && field.tailwind && field.tailwind[isMine ? 'mine' : 'foe']) spe *= 2;
    if (toID(mon.status) === 'par') spe = Math.floor(spe * 0.5);

    return spe;
  }

  /* Who moves first at equal priority: the faster one, the slower one under Trick Room. */
  function outspeeds(a, b, field) {
    return field && field.trickroom ? a < b : a > b;
  }

  /* What the turns already played say about each foe's real speed.
   * Every turn where both sides used a move of the same priority tells us
   * whether he was slower or faster than us. We keep it as a ratio to our
   * worst-case guess for him: {max} "he is at most this x our guess",
   * {min} "at least". Turns with Trick Room, Quick Claw & co, or a possible
   * Prankster / Gale Wings / Triage are skipped. */
  const ORDER_NOISE = /Quick Claw|Custap|Quick Draw|Trick Room|\[from\]/;
  function speedObservations(battle, me, myTeam) {
    const out = {};
    const q = (battle && battle.stepQueue) || [];
    if (!q.length || !me) return out;
    const foeSide = me === 'p1' ? 'p2' : 'p1';
    const nickSpecies = {}, nickLevel = {};
    const st = { p1: { spe: 0, par: false, para: false, tw: false, active: '' }, p2: { spe: 0, par: false, para: false, tw: false, active: '' } };
    let weather = '', terrain = '', turnMoves = [], noisy = false;
    const who = (x) => { const m = String(x || '').match(/^(p\d)[a-z]?:\s*(.*)$/); return m ? { side: m[1], nick: m[2].trim() } : null; };
    const prio = (moveName, sideId) => {
      const md = moveData(moveName);
      if (!md) return null;
      let pr = md.priority || 0;
      if (sideId === foeSide) {
        const spc = species(nickSpecies[foeSide + ':' + st[foeSide].active]);
        const abs = spc && spc.abilities ? Object.values(spc.abilities).map(toID) : [];
        if (md.category === 'Status' && abs.includes('prankster')) return null;
        if (md.type === 'Flying' && abs.includes('galewings')) return null;
        if (md.flags && md.flags.heal && abs.includes('triage')) return null;
      } else {
        const mine = myTeam.find((m) => toID(m.name) === toID(nickSpecies[me + ':' + st[me].active]));
        const ab = mine ? toID(mine.ability) : '';
        if ((ab === 'prankster' && md.category === 'Status') || (ab === 'galewings' && md.type === 'Flying')
          || (ab === 'triage' && md.flags && md.flags.heal)) return null;
      }
      return pr;
    };
    const judge = () => {
      if (noisy || turnMoves.length < 2) return;
      const a = turnMoves.find((x) => x.side === me), b = turnMoves.find((x) => x.side === foeSide);
      if (!a || !b || a.prio === null || b.prio === null || a.prio !== b.prio) return;
      const mine = myTeam.find((m) => toID(m.name) === toID(a.species));
      const foeSp = species(b.species);
      if (!mine || !mine.stats || !foeSp) return;
      const f = { weather, terrain, random: false, trickroom: false, tailwind: { mine: a.tw, foe: b.tw } };
      const my = speedOf(Object.assign({}, mine, { boosts: { spe: a.spe }, status: a.par ? 'par' : '', volatiles: a.para ? ['protosynthesisspe'] : [] }), f, true);
      const foeMon = { base: foeSp.baseStats, level: b.level, boosts: { spe: b.spe }, status: b.par ? 'par' : '', volatiles: b.para ? ['quarkdrivespe'] : [], ability: '', item: '' };
      const worst = speedOf(foeMon, Object.assign({}, f, { random: !!battle.tier && /random/i.test(battle.tier) }), false);
      if (!worst) return;
      const r = my / worst;
      const k = toID(b.species);
      const o = out[k] || (out[k] = { max: Infinity, min: 0, n: 0 });
      o.n++;
      // Moving first means strictly slower (a speed tie is rare enough to ignore).
      if (turnMoves.indexOf(a) < turnMoves.indexOf(b)) o.max = Math.min(o.max, r * 0.999); else o.min = Math.max(o.min, r);
    };
    for (const line of q) {
      const parts = String(line).slice(1).split('|');
      const cmd = parts[0];
      const w = who(parts[1]);
      if (cmd === 'turn') { judge(); turnMoves = []; noisy = false; continue; }
      if (ORDER_NOISE.test(line) && cmd !== 'move') noisy = true;
      if (cmd === 'move' && /\[from\]/.test(line)) continue;
      switch (cmd) {
        case 'switch': case 'drag': case 'replace':
          if (w) { nickSpecies[w.side + ':' + w.nick] = String(parts[2] || '').split(',')[0];
            nickLevel[w.side + ':' + w.nick] = +((String(parts[2] || '').match(/, L(\d+)/) || [])[1] || 100); st[w.side].active = w.nick; st[w.side].spe = 0; st[w.side].para = false; }
          if (cmd === 'replace') noisy = true;
          break;
        case 'move':
          if (w && !turnMoves.some((x) => x.side === w.side)) {
            turnMoves.push({ side: w.side, species: nickSpecies[w.side + ':' + w.nick], level: nickLevel[w.side + ':' + w.nick] || 100, prio: prio(parts[2], w.side),
              spe: st[w.side].spe, par: st[w.side].par, para: st[w.side].para, tw: st[w.side].tw });
          }
          break;
        case '-boost': case '-unboost':
          if (w && parts[2] === 'spe') st[w.side].spe = Math.max(-6, Math.min(6, st[w.side].spe + (cmd === '-boost' ? 1 : -1) * (+parts[3] || 0)));
          break;
        case '-setboost': if (w && parts[2] === 'spe') st[w.side].spe = +parts[3] || 0; break;
        case '-clearboost': case '-clearallboost': for (const k of ['p1', 'p2']) if (cmd === '-clearallboost' || (w && w.side === k)) st[k].spe = 0; break;
        case '-status': if (w && parts[2] === 'par') st[w.side].par = true; break;
        case '-curestatus': if (w) st[w.side].par = false; break;
        case '-start': if (w && /(protosynthesis|quarkdrive)spe/.test(String(parts[2]).replace(/\W/g, '').toLowerCase())) st[w.side].para = true; break;
        case '-end': if (w && /protosynthesis|quarkdrive/i.test(parts[2])) st[w.side].para = false; break;
        case '-sidestart': if (/Tailwind/.test(parts[2])) st[String(parts[1]).slice(0, 2)].tw = true; break;
        case '-sideend': if (/Tailwind/.test(parts[2])) st[String(parts[1]).slice(0, 2)].tw = false; break;
        case '-weather': weather = parts[2] === 'none' ? '' : toID(parts[2]); break;
        case '-fieldstart': if (/Terrain/.test(parts[1])) terrain = toID(String(parts[1]).replace(/^move:\s*/, '')); if (/Trick Room/.test(parts[1])) noisy = true; break;
        case '-fieldend': if (/Terrain/.test(parts[1])) terrain = ''; break;
        case 'faint': if (w) st[w.side].par = false; break;
        default: break;
      }
    }
    // If he went first once and last once at about the same ratio, something
    // (a Scarf Tricked away, Quick Claw) broke the picture: drop it.
    for (const k of Object.keys(out)) if (out[k].min > out[k].max) delete out[k];
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Estimating an unrevealed foe's moves                                */
  /* ------------------------------------------------------------------ */

  /* Strongest "realistic STAB" per type, computed once. 80-120 BP keeps out
   * recharge nukes and two-turn moves that nobody actually runs. */
  let _bestByType = null;
  function bestMoveOfType(t) {
    if (!_bestByType) {
      _bestByType = {};
      const all = movedex() || {};
      for (const id of Object.keys(all)) {
        const m = all[id];
        if (!m || m.category === 'Status') continue;
        const bp = m.basePower || 0;
        if (bp < 80 || bp > 120) continue;
        const cur = _bestByType[m.type];
        if (!cur || bp > cur.basePower) _bestByType[m.type] = m;
      }
    }
    return _bestByType[t] || null;
  }

  /* What we've literally watched them click. */
  function seenMoves(rawMon) {
    const seen = [];
    if (rawMon && rawMon.moveTrack) {
      for (const t of rawMon.moveTrack) {
        // moveTrack entries are [moveName, ppUsed]. A leading "*" marks a move
        // used while Transformed: it belongs to the target, not to this set.
        const nm = Array.isArray(t) ? t[0] : t;
        if (nm && !String(nm).startsWith('*')) seen.push(String(nm));
      }
    }
    return seen;
  }

  /* Sleep threats (Spore, Sleep Powder, Hypnosis, Yawn...). Who on our side
   * can't be put to sleep, and does Sleep Clause already protect us? */
  const SLEEP_PROOF_ABILITIES = ['insomnia', 'vitalspirit', 'sweetveil', 'purifyingsalt', 'comatose'];
  function sleepRisk(ctx) {
    const { cand, foeMon, myTeam, field, battle } = ctx;
    const sleepMoves = cand.moves.filter((mv) => {
      const md = moveData(mv);
      return md && (md.status === 'slp' || toID(md.name) === 'yawn');
    });
    if (!sleepMoves.length) return null;
    const md = moveData(sleepMoves[0]);
    const powder = !!(md.flags && md.flags.powder);
    const terrainBlocks = ['electricterrain', 'mistyterrain'].includes(field.terrain);

    const alive = myTeam.filter((m) => !m.fainted);
    const immune = alive.filter((m) => {
      const ab = toID(m.ability), it = toID(m.item);
      if (SLEEP_PROOF_ABILITIES.includes(ab)) return true;
      if (powder && ((m.types || []).includes('Grass') || ab === 'overcoat' || it === 'safetygoggles')) return true;
      return !!m.status && toID(m.status) !== 'slp' && toID(m.status) !== 'fnt'; // already statused
    }).map((m) => m.name);

    // Showdown announces the format's clauses as "|rule|Sleep Clause Mod: ..." lines.
    const q = (battle && battle.stepQueue) || [];
    const clauseRule = q.some((l) => /^\|rule\|Sleep Clause/i.test(String(l)));
    const sleeper = alive.find((m) => toID(m.status) === 'slp');
    return {
      move: md.name,
      seen: seenMoves(ctx.foeRaw || null).some((mv) => toID(mv) === toID(md.name)) || !cand.guessed,
      powder, terrainBlocks, immune,
      clauseRule,
      clause: clauseRule && !!sleeper,
      sleeper: sleeper ? sleeper.name : null
    };
  }

  /* Will this foe survive any single hit at 1 HP? {what, sure} or null.
   * Sure when Focus Sash / Sturdy is revealed, possible when their sets carry it. */
  function survivalAt1(foeMon, info) {
    if (!foeMon || foeMon.hpPct < 99.5) return null;
    const item = toID(foeMon.item), ab = toID(foeMon.ability);
    if (item === 'focussash') return { what: 'Focus Sash', sure: !foeMon.itemGuessed };
    if (ab === 'sturdy') return { what: 'Sturdy', sure: true };
    if (item) return null; // another item is known: no Sash
    const sets = (info && info.sets) || [];
    const sashSet = sets.some((st) => toID(st.item) === 'focussash'
      || (Array.isArray(st.items) && st.items.some((i) => toID(i) === 'focussash')));
    const sturdySet = !ab && sets.some((st) => toID(st.ability) === 'sturdy'
      || (Array.isArray(st.abilities) && st.abilities.some((a) => toID(a) === 'sturdy')));
    if (sashSet) return { what: 'Focus Sash', sure: false };
    if (sturdySet) return { what: 'Sturdy', sure: false };
    return null;
  }

  /* The mon we pulled out last turn (not a faint), if the same foe is still in.
   * Sending it straight back is the ping-pong the dataset showed (Arceus -> Ho-Oh ->
   * Arceus): it takes the very hit we were avoiding. */
  function justLeft(battle, me) {
    const q = (battle && battle.stepQueue) || [];
    const turns = [];
    q.forEach((l, i) => { if (String(l).startsWith('|turn|')) turns.push(i); });
    if (!turns.length) return null;
    const from = turns.length > 1 ? turns[turns.length - 2] : 0, to = turns[turns.length - 1];
    let mine = null, foe = null, left = null, foeThen = null, fainted = false;
    q.forEach((l, i) => {
      const parts = String(l).slice(1).split('|');
      const side = String(parts[1] || '').slice(0, 2);
      const sp = String(parts[2] || '').split(',')[0];
      if (parts[0] === 'faint' && side === me) fainted = true;
      if (parts[0] !== 'switch' && parts[0] !== 'drag') return;
      if (side === me) {
        if (i > from && i < to && parts[0] === 'switch' && mine && !fainted) { left = mine; foeThen = foe; }
        mine = sp; fainted = false;
      } else foe = sp;
    });
    return left && foeThen === foe && left !== mine ? left : null;
  }

  /* Types each foe has already been immune to in this battle ("It doesn't affect..."),
   * by nickname: catches Illusion (a Zoroark-Hisui shown as Smeargle), an unrevealed
   * ability, anything our type chart missed. Forgotten when that mon Terastallizes or
   * changes type. Only damaging moves count (Thunder Wave on an Electric type isn't
   * an Electric immunity). */
  function seenImmunities(battle, me) {
    const out = {};
    const q = (battle && battle.stepQueue) || [];
    let last = null;
    for (const line of q) {
      const parts = String(line).slice(1).split('|');
      const cmd = parts[0];
      const m = String(parts[1] || '').match(/^(p\d)[a-z]?:\s*(.*)$/);
      if (cmd === 'move') {
        const md = moveData(parts[2]);
        last = m && m[1] === me && md && md.category !== 'Status' ? md.type : null;
      } else if (cmd === '-immune' && m && m[1] !== me && last && !parts.slice(2).some((x) => /\[from\]/.test(x))) {
        (out[m[2].trim()] = out[m[2].trim()] || new Set()).add(last);
      } else if (m && m[1] !== me && (cmd === '-terastallize' || cmd === 'detailschange'
        || (cmd === '-start' && /typechange|typeadd/i.test(parts[2] || '')))) {
        delete out[m[2].trim()];
      } else if (cmd === 'turn') last = null;
    }
    return out;
  }

  /* Random Battle: the pkmn set data (randbats.js), narrowed to the roles that
   * contain every move seen so far. Same shape as AG_INFER's answer. */
  function inferRandom(foeMon, seen) {
    const data = window.AG_RANDBATS;
    if (!data) return null;
    const entry = data[toID(foeMon.name)] || data[toID(foeMon.baseSpecies)] || data[toID(String(foeMon.name).split('-')[0])];
    if (!entry || !entry.roles) return null;
    const all = Object.keys(entry.roles).map((k) => Object.assign({ name: k }, entry.roles[k]));
    const seenIds = seen.map(toID);
    let sets = all.filter((r) => seenIds.every((id) => (r.moves || []).some((m) => toID(m) === id)));
    if (!sets.length) sets = all;
    const moves = [];
    const push = (m) => { if (!moves.some((x) => toID(x) === toID(m))) moves.push(m); };
    seen.forEach(push);
    sets.forEach((r) => (r.moves || []).forEach(push));
    return {
      hasData: true, total: all.length, sets, moves,
      narrowed: sets.length < all.length, spread: 'random', level: entry.level
    };
  }

  /* Unrevealed item / ability: take it from the candidate sets when they all
   * agree (Lugia's Multiscale, a Choice Scarf every set runs...). Never
   * overrides what the battle showed. */
  function guessFromSets(foeMon, info) {
    const sets = (info && info.sets) || [];
    if (!sets.length || foeMon.transformed) return;
    const one = (list) => {
      const ids = new Set(list.map(toID).filter(Boolean));
      return ids.size === 1 ? list.find((x) => toID(x)) : null;
    };
    if (!foeMon.item && !foeMon.itemLost) {
      const it = one(sets.flatMap((s) => (s.items ? s.items : [s.item]).filter(Boolean)));
      if (it) { foeMon.item = it; foeMon.itemGuessed = true; }
    }
    if (!foeMon.ability) {
      const ab = one(sets.flatMap((s) => (s.abilities ? s.abilities : [s.ability]).filter(Boolean)));
      if (ab) { foeMon.ability = ab; foeMon.abilityGuessed = true; }
    }
  }

  const isDamaging = (mv) => { const md = moveData(mv); return !!md && md.category !== 'Status' && (md.basePower || 0) > 0; };

  /* Candidate moves, best source first:
   *   0. a Transformed foe has exactly the target's moves
   *   1. the set database (AG sets, or Random Battle sets), narrowed by what was revealed
   *   2. moves we've seen, if the species isn't in the database
   *   3. a crude strongest-STAB-per-type guess, also added whenever we only
   *      know status moves (Curse, Spore...) so threats are never "none". */
  function foeCandidateMoves(foeMon, rawMon, field) {
    if (foeMon.copiedMoves && foeMon.copiedMoves.length) {
      return { moves: foeMon.copiedMoves, guessed: false, info: null };
    }
    const seen = seenMoves(rawMon);
    let res = null;

    if (field && field.random) {
      const info = inferRandom(foeMon, seen);
      if (info) res = { moves: info.moves, guessed: !seen.length, info };
    }
    if (!res && typeof window.AG_INFER === 'function') {
      const info = window.AG_INFER(foeMon.name, {
        moves: seen,
        item: foeMon.item,
        ability: foeMon.ability
      }, field && field.format);
      if (info.hasData) res = { moves: info.moves, guessed: !info.narrowed, info };
    }
    if (!res && seen.length) res = { moves: seen, guessed: false, info: null };
    if (!res) res = { moves: [], guessed: true, info: null };

    if (!res.moves.some(isDamaging)) {
      for (const t of (foeMon.baseTypes || [])) {
        const m = bestMoveOfType(t);
        if (m && !res.moves.includes(m.name)) res.moves = res.moves.concat(m.name);
      }
      res.guessed = true;
    }
    return res;
  }

  /* ------------------------------------------------------------------ */
  /* Teampreview                                                         */
  /* ------------------------------------------------------------------ */

  /* Lead: who checks their likely leads best (Smogon checks, weighted by how
   * often each of their mons leads), plus the profile's usual lead. */
  function pickLead(myTeam, foeTeam, profile, field) {
    if (!myTeam.length) return null;
    const meta = window.AG_META && field && window.AG_META[field.format];
    const scores = myTeam.map((m) => {
      const me = toID(m.name);
      let s = (profile && profile.members[me] && profile.members[me].lead) || 0;
      const notes = [];
      if (meta) {
        const w = foeTeam.map((f) => (meta.leads[toID(f.name)] || 0.2));
        const tot = w.reduce((a, b) => a + b, 0) || 1;
        foeTeam.forEach((f, i) => {
          const fid = toID(f.name);
          const iCheck = (meta.checks[fid] || {})[me] || 0;   // I beat him
          const heChecks = (meta.checks[me] || {})[fid] || 0; // he beats me
          s += (w[i] / tot) * (iCheck - heChecks);
          if (w[i] / tot >= 0.2 && iCheck >= 0.4) notes.push(`bat ${f.name}`);
          if (w[i] / tot >= 0.2 && heChecks >= 0.4) notes.push(`craint ${f.name}`);
        });
      }
      return { name: m.name, score: s, notes };
    }).sort((a, b) => b.score - a.score);
    const best = scores[0];
    const isUsual = profile && profile.members[toID(best.name)] && profile.members[toID(best.name)].lead;
    const why = (isUsual ? 'the team\'s usual lead' : 'best matchup against their likely leads')
      + (best.notes.length ? ' (' + best.notes.slice(0, 3).join(', ') + ')' : '');
    return { name: best.name, why, ranking: scores.slice(0, 3) };
  }

  function analyzeTeamPreview(room, battle, mine, foe, field) {
    const req = room.request;

    const myTeam = (req && req.side && Array.isArray(req.side.pokemon))
      ? req.side.pokemon.map((rm) => readMine(rm, null)).filter(Boolean)
      : [];

    const foeTeam = (foe.pokemon || [])
      .map((p) => readFoe(p))
      .filter(Boolean);

    if (!myTeam.length || !foeTeam.length) {
      return { mode: 'teampreview', error: 'Teams not readable yet.' };
    }

    const rows = [];
    for (const me of myTeam) {
      let faster = 0, threatens = 0, threatened = 0;
      const immuneTo = [];
      const mySpe = speedOf(me, field, true);

      for (const them of foeTeam) {
        // Speed: their worst case for us.
        if (outspeeds(mySpe, speedOf(them, field, false), field)) faster++;

        // Our best hit on them, assuming they're an offensive (frail) spread.
        let bestPct = 0;
        for (const mv of (me.moves || [])) {
          const r = calcDamage({
            move: mv, atk: me, def: them, field, defProfile: 'offense'
          });
          if (r && r.maxPct && r.maxPct > bestPct) bestPct = r.maxPct;
        }
        if (bestPct >= 100) threatens++;

        // Their best estimated hit on us.
        const cand = foeCandidateMoves(them, null, field);
        let worstPct = 0;
        let allImmune = cand.moves.length > 0;
        for (const mv of cand.moves) {
          const r = calcDamage({ move: mv, atk: them, def: me, field });
          if (!r) { allImmune = false; continue; }
          if (r.immune) continue;
          allImmune = false;
          if (r.maxPct && r.maxPct > worstPct) worstPct = r.maxPct;
        }
        if (worstPct >= 100) threatened++;
        if (allImmune) immuneTo.push(them.name);
      }

      rows.push({
        name: me.name,
        n: foeTeam.length,
        faster, threatens, threatened, immuneTo
      });
    }

    // Sort by a rough "safe and useful lead" score, not a verdict.
    rows.sort((a, b) =>
      (b.faster + b.threatens - b.threatened) -
      (a.faster + a.threatens - a.threatened));

    const profile = window.AG_MATCH_TEAM ? window.AG_MATCH_TEAM(myTeam.map((m) => m.name)) : null;
    const lead = pickLead(myTeam, foeTeam, profile, field);
    const warnings = [];
    if (foeTeam.some((f) => toID(f.name) === 'ditto')) {
      warnings.push('Ditto (Imposter): it will copy your lead on entry (types, stats, boosts, moves), '
        + 'often with a Choice Scarf to move first. Avoid leading with your best sweeper or a mon that KOs itself.');
    }

    return {
      mode: 'teampreview',
      field,
      foeNames: foeTeam.map((f) => f.name),
      rows,
      warnings,
      profile,
      lead,
      error: null
    };
  }

  /* ------------------------------------------------------------------ */
  /* Analysis                                                            */
  /* ------------------------------------------------------------------ */

  function analyze() {
    const room = getRoom();
    if (!room) return { error: 'No battle open.' };
    const battle = room.battle;
    if (!dex() || !movedex() || !typechart()) {
      return { error: 'Client data not loaded yet. Wait a second.' };
    }

    const { mine, foe } = sides(battle);
    if (!mine || !foe) return { error: 'Can\'t read both sides.' };

    const field = readField(battle);
    const req = room.request || null;

    const foeActiveRaw = activeOf(foe);
    const foeMon = readFoe(foeActiveRaw);

    // Teampreview: no active mon on either side yet.
    const inPreview = (req && req.teamPreview)
      || (!foeMon && !activeOf(mine));
    if (inPreview) {
      return analyzeTeamPreview(room, battle, mine, foe, field);
    }

    if (!foeMon) return { error: 'No active enemy Pokémon.' };

    // Our team from the request (exact stats), matched to client objects.
    let myTeam = [];
    if (req && req.side && Array.isArray(req.side.pokemon)) {
      myTeam = req.side.pokemon.map((rm) => {
        const nm = String(rm.details || '').split(',')[0];
        const cm = (mine.pokemon || []).find(
          (p) => toID(p.speciesForme || p.species) === toID(nm)
        );
        return readMine(rm, cm);
      }).filter(Boolean);
    }

    // Reflect / Light Screen / Aurora Veil live on each side's sideConditions.
    const screensOf = (sd) => {
      const c = (sd && sd.sideConditions) || {};
      return { reflect: !!c.reflect, lightscreen: !!c.lightscreen, auroraveil: !!c.auroraveil };
    };
    foeMon.screens = screensOf(foe);
    const myScreens = screensOf(mine);
    for (const m of myTeam) m.screens = myScreens;

    const myActive = myTeam.find((m) => m.active && !m.fainted) || null;

    // How many of OUR mons have fainted (for Supreme Overlord on our side).
    const myFainted = myTeam.filter((m) => m.fainted).length;
    // How many of THEIR mons have fainted.
    const foeFainted = (foe.pokemon || []).filter((p) => p && p.fainted).length;

    const out = {
      field,
      foe: foeMon,
      me: myActive,
      moves: [],
      threats: [],
      switches: [],
      speed: null,
      advice: [],
      error: null
    };

    // Narrow their set once, reuse it everywhere this turn.
    // A Transformed foe (Imposter Ditto) is a copy of one of our mons: same
    // stats except HP, same moves. AG Ditto runs Choice Scarf: assume it.
    if (foeMon.transformed) {
      const tgt = myTeam.find((m) => toID(m.name) === toID(foeMon.transformed));
      if (tgt) {
        foeMon.stats = Object.assign({}, tgt.stats);
        foeMon.copiedMoves = (tgt.moves || []).map((id) => { const md = moveData(id); return md ? md.name : id; });
      }
      if (toID(foeMon.baseSpecies) === 'ditto' && !foeMon.item) foeMon.assumeScarf = true;
    }

    const cand = foeCandidateMoves(foeMon, foeActiveRaw, field);
    out.threatsGuessed = cand.guessed;
    out.inferInfo = cand.info;
    guessFromSets(foeMon, cand.info);

    // Baton Pass seen anywhere on their team: boosts can be handed over.
    out.batonPass = (foe.pokemon || []).filter((p) => p && seenMoves(p).some((m) => toID(m) === 'batonpass'))
      .map((p) => p.speciesForme || p.name);
    // Evasion: a 100%-accurate move hits 3/(3+n) of the time at +n.
    const ev = (foeMon.boosts && foeMon.boosts.evasion) || 0;
    out.evasion = ev > 0 ? { stage: ev, hit: Math.round((300 / (3 + ev))) } : null;

    out.sleepRisk = sleepRisk({ cand, foeMon, myTeam, field, battle, foeRaw: foeActiveRaw });

    // If inference pinned down their build, the damage range tightens.
    let loProfile = 'bulky', hiProfile = 'offense';
    if (cand.info && cand.info.narrowed) {
      const p = (cand.info.spread === 'offense') ? 'offense' : 'bulky';
      loProfile = p; hiProfile = p;
    }

    // Our active is down (or we're on the switch screen): only the switch-in matters.
    out.forced = !myActive || !!(req && req.forceSwitch);

    /* ---- speed ---- */
    // Worst case for him, capped by what the turns already played showed.
    const seenSpeed = speedObservations(battle, (req && req.side && req.side.id) || mine.sideid, myTeam);
    // The ratio was measured against a "no item, no ability" guess: apply it to the same guess now.
    const foeSpeed = (f) => {
      const raw = speedOf(f, field, false);
      const o = seenSpeed[toID(f.name)];
      if (!o || !(o.max < Infinity)) return raw;
      const neutral = speedOf(Object.assign({}, f, { item: '', ability: '', assumeScarf: false }), field, false);
      return Math.min(raw, Math.floor(neutral * o.max));
    };
    if (myActive) {
      const mySpe = speedOf(myActive, field, true);
      const foeSpe = foeSpeed(foeMon);
      out.speed = {
        mine: mySpe,
        foeWorst: foeSpe,
        faster: outspeeds(mySpe, foeSpe, field),
        trickroom: !!field.trickroom,
        // Seen in this battle: he was slower than us at this speed at least once.
        learned: foeSpe < speedOf(foeMon, field, false)
      };
    }

    /* ---- Focus Sash / Sturdy ---- */
    const foeSurvival = survivalAt1(foeMon, cand.info);

    /* ---- our moves onto them ---- */
    if (myActive && myActive.moves && myActive.moves.length) {
      const active0 = (req && req.active && req.active[0]) || null;
      const usable = active0 && Array.isArray(active0.moves)
        ? active0.moves.filter((m) => !m.disabled).map((m) => m.id || m.move)
        : myActive.moves;

      // Immunities this exact mon already showed this battle.
      const immuneSeen = seenImmunities(battle, (req && req.side && req.side.id) || mine.sideid)[String(foeActiveRaw && foeActiveRaw.name || '')] || null;
      for (const mv of usable) {
        const movesLast = !(out.speed && out.speed.faster);
        const bulky = calcDamage({
          move: mv, atk: myActive, def: foeMon, field,
          defProfile: loProfile, foeFaintedCount: myFainted, movesLast
        });
        const frail = calcDamage({
          move: mv, atk: myActive, def: foeMon, field,
          defProfile: hiProfile, foeFaintedCount: myFainted, movesLast
        });
        if (!bulky) continue;
        if (bulky.status || bulky.nonDamaging) {
          out.moves.push({ name: bulky.name, kind: 'status' });
          continue;
        }
        if (bulky.immune) {
          out.moves.push({ name: bulky.name, kind: 'immune', reason: bulky.reason });
          continue;
        }
        if (immuneSeen && immuneSeen.has(bulky.type)) {
          out.moves.push({ name: bulky.name, kind: 'immune', reason: 'seen this battle' });
          continue;
        }
        const remaining = foeMon.hpPct;
        let koGuaranteed = bulky.minPct >= remaining;
        let koPossible = (frail ? frail.maxPct : bulky.maxPct) >= remaining;
        // Focus Sash / Sturdy: at full HP a single hit leaves them at 1 HP
        // (multi-hit moves go through). Sure if revealed, possible if in their sets.
        let sash = null;
        if (koPossible && !bulky.multiHit && foeSurvival) {
          sash = foeSurvival;
          koGuaranteed = false;
          if (foeSurvival.sure) koPossible = false;
        }
        out.moves.push({
          name: bulky.name,
          kind: 'damage',
          type: bulky.type,
          eff: bulky.eff,
          priority: bulky.priority,
          lo: bulky.minPct,
          hi: frail ? frail.maxPct : bulky.maxPct,
          koGuaranteed,
          koPossible,
          sash: sash ? sash.what : null
        });
      }

      out.moves.sort((a, b) => {
        const ka = a.koGuaranteed ? 2 : a.koPossible ? 1 : 0;
        const kb = b.koGuaranteed ? 2 : b.koPossible ? 1 : 0;
        if (ka !== kb) return kb - ka;
        // Among guaranteed KOs the safest roll wins; otherwise the hardest hit.
        if (ka === 2) return (b.lo || 0) - (a.lo || 0);
        return (b.hi || 0) - (a.hi || 0);
      });
    }

    /* ---- their likely moves onto us ---- */
    const mySurvival = myActive && myActive.hpPct >= 99.5
      && (toID(myActive.item) === 'focussash' || toID(myActive.ability) === 'sturdy')
      ? { what: toID(myActive.item) === 'focussash' ? 'Focus Sash' : 'Sturdy', sure: true } : null;
    if (myActive) {
      const candidate = cand.moves;

      for (const mv of candidate.slice(0, 6)) {
        const r = calcDamage({
          move: mv, atk: foeMon, def: myActive, field, movesLast: !!(out.speed && out.speed.faster),
          foeFaintedCount: foeFainted
        });
        if (!r || r.status || r.nonDamaging) continue;
        if (r.immune) {
          out.threats.push({ name: r.name, kind: 'immune' });
          continue;
        }
        out.threats.push({
          name: r.name,
          kind: 'damage',
          type: r.type,
          eff: r.eff,
          lo: r.minPct,
          hi: r.maxPct,
          priority: r.priority,
          // our own Focus Sash / Sturdy, at full HP, against a single hit
          kills: r.maxPct >= myActive.hpPct && !(mySurvival && !r.multiHit),
          killsGuaranteed: r.minPct >= myActive.hpPct && !(mySurvival && !r.multiHit),
          sash: (mySurvival && !r.multiHit && r.maxPct >= myActive.hpPct) ? mySurvival.what : null
        });
      }
      out.threats.sort((a, b) => (b.hi || 0) - (a.hi || 0));
    }

    /* ---- switch-ins ----
     * For each healthy bench mon: their best hit on it, its best hit back,
     * and speed. Ranked by "HP left after their best hit" plus what it
     * threatens in return. */
    const foeSpe = foeSpeed(foeMon);
    const wentOut = justLeft(battle, (req && req.side && req.side.id) || mine.sideid);
    const seeds = cand.moves.some((mv) => toID(mv) === 'leechseed');
    for (const m of myTeam) {
      if (!m || m.fainted || m.active) continue;

      let taken = null, anyDamage = false, immuneAll = true;
      for (const mv of cand.moves) {
        const r = calcDamage({ move: mv, atk: foeMon, def: m, field, foeFaintedCount: foeFainted });
        if (!r || r.status || r.nonDamaging) continue;
        anyDamage = true;
        if (r.immune) continue;
        immuneAll = false;
        if (!taken || r.maxPct > taken.hi) taken = { name: r.name, lo: r.minPct, hi: r.maxPct };
      }
      const immune = anyDamage && immuneAll;

      let hitBack = null;
      for (const mv of (m.moves || [])) {
        const r = calcDamage({
          move: mv, atk: m, def: foeMon, field,
          defProfile: hiProfile, foeFaintedCount: myFainted
        });
        if (r && r.maxPct && (!hitBack || r.maxPct > hitBack.hi)) {
          hitBack = { name: r.name, lo: r.minPct, hi: r.maxPct };
        }
      }

      const hi = taken ? taken.hi : 0;
      const dies = !immune && hi >= m.hpPct;
      const faster = outspeeds(speedOf(m, field, true), foeSpe, field);
      const hz = hazardCost(m, mine && mine.sideConditions);
      const left = (immune ? m.hpPct : m.hpPct - hi) - hz;
      const sleepProof = out.sleepRisk && !out.sleepRisk.clause && out.sleepRisk.immune.includes(m.name);
      const back = m.name === wentOut;
      const seedProof = seeds && ((m.types || []).includes('Grass') || toID(m.ability) === 'magicguard');
      const score = (dies ? -100 : left) + (sleepProof ? 15 : 0) + (seedProof ? 10 : 0)
        + 0.4 * Math.min(100, hitBack ? hitBack.hi : 0)
        + (faster ? 10 : 0) + (immune ? 25 : 0) - (back ? 60 : 0);

      let why;
      if (immune) why = 'immune to everything we know it has';
      else if (dies) why = `dies to ${taken.name} (${pct(taken.lo)}-${pct(taken.hi)}%)`;
      else if (taken) why = `takes ${taken.name} ${pct(taken.lo)}-${pct(taken.hi)}%`;
      else why = 'no known enemy move';
      if (!dies && hitBack) why += `, hits back with ${hitBack.name} ${pct(hitBack.lo)}-${pct(hitBack.hi)}%`;
      if (!dies && faster) why += ', faster';
      if (!dies && sleepProof) why += `, immune to ${out.sleepRisk.move}`;
      if (hz > 0) why += `, hazards -${pct(hz)}% on entry`;
      if (back) why += ', just switched out against it';
      if (!dies && seedProof) why += ', immune to Leech Seed';

      out.switches.push({
        name: m.name, hpPct: m.hpPct,
        lo: taken ? taken.lo : 0, hi, immune, dies, faster,
        taken, hitBack, score, why, hazardCost: hz, justLeft: back
      });
    }
    out.switches.sort((a, b) => b.score - a.score);

    /* ---- anti-setup ---- */
    out.setupRisk = myActive
      ? setupRisk({ myActive, myTeam, foeMon, foeRaw: foeActiveRaw, cand, field, foeFainted,
        ourMoves: out.moves, switches: out.switches, threats: out.threats, speed: out.speed })
      : null;
    out.wallRisk = myActive
      ? wallRisk({ myActive, myTeam, foeMon, foeRaw: foeActiveRaw, cand, field, myFainted,
        ourMoves: out.moves, switches: out.switches, speed: out.speed })
      : null;
    out.stall = myActive
      ? stallState({ myActive, clientMon: activeOf(mine), foeMon, cand, field, req, ourMoves: out.moves })
      : null;

    out.asleep = myActive ? sleepState(myActive, activeOf(mine), out.moves) : null;

    /* ---- team profile (teams.js) ---- */
    out.profile = window.AG_MATCH_TEAM ? window.AG_MATCH_TEAM(myTeam.map((m) => m.name)) : null;
    const roles = out.profile ? profileRoles(out.profile) : null;
    out.roles = roles;
    if (out.profile) {
      out.plan = {
        phase: gamePhase(battle, myTeam, foe),
        job: myActive && out.profile.members[toID(myActive.name)] ? out.profile.members[toID(myActive.name)].job : null,
        name: myActive ? myActive.name : null
      };
      out.plan.text = out.profile.plan[out.plan.phase];
    }

    /* ---- Tera ---- */
    const canTera = req && req.active && req.active[0] && req.active[0].canTerastallize;
    out.tera = myActive && canTera ? teraAdvice({ myActive, foeMon, cand, field, foeFainted, myFainted,
      threats: out.threats, moves: out.moves, teraType: myActive.teraType || canTera, loProfile, hiProfile, speed: out.speed }) : null;

    /* ---- end of game ---- */
    out.endgame = endgame({ myTeam, myActive, foe, foeMon, field, profile: out.profile, threats: out.threats, myFainted });

    /* ---- hazards on both sides ---- */
    out.hazardPlan = myActive ? hazardPlan({ myActive, mine, foe, threats: out.threats, moves: out.moves }) : null;

    /* ---- advisor ---- */
    out.myHazards = (mine && mine.sideConditions) || {};
    out.foeHazards = (foe && foe.sideConditions) || {};
    if (typeof window.AG_ADVISE === 'function') {
      try {
        out.advice = window.AG_ADVISE({
          me: myActive, foe: foeMon,
          moves: out.moves, threats: out.threats, switches: out.switches,
          speed: out.speed, myHazards: out.myHazards, inferInfo: out.inferInfo,
          setupRisk: out.setupRisk, wallRisk: out.wallRisk, stall: out.stall, asleep: out.asleep,
          roles, endgame: out.endgame, hazardPlan: out.hazardPlan
        });
      } catch (e) { out.advice = []; }
    }

    out.verdict = verdict(out);
    // Asleep: the move only goes off if it wakes up first.
    const zz = out.asleep;
    if (out.verdict && zz && !zz.sleepTalk && zz.wake < 1 && out.verdict.kind !== 'switch') {
      out.verdict.why += zz.wake
        ? ` · asleep: ${Math.round(zz.wake * 100)}% chance it wakes up and hits`
        : ' · still asleep this turn: the move won\'t go off, but staying in brings its wake-up closer';
    }
    // Tera rides along with the verdict when it changes the outcome.
    if (out.verdict && out.tera && out.verdict.kind !== 'switch'
      && (out.tera.kind === 'defense' || !out.tera.move || out.tera.move === out.verdict.target)) {
      out.verdict.tera = out.tera.type;
    }
    if (!myActive && !out.verdict) out.error = 'No active Pokémon on your side.';
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Team profile, Tera, end of game, hazards                            */
  /* ------------------------------------------------------------------ */

  function profileRoles(profile) {
    const roles = {};
    for (const k of Object.keys(profile.members)) {
      const m = profile.members[k];
      roles[k] = { preserve: m.preserve, why: m.why || m.role };
    }
    return roles;
  }

  /* early: nobody down yet and turn <= 6; late: 3 or fewer left on a side. */
  function gamePhase(battle, myTeam, foe) {
    const myLeft = myTeam.filter((m) => !m.fainted).length;
    const total = foe.totalPokemon || 6;
    const foeDown = (foe.pokemon || []).filter((p) => p && p.fainted).length;
    const foeLeft = total - foeDown;
    if (myLeft <= 3 || foeLeft <= 3) return 'late';
    if ((battle.turn || 0) <= 6 && myLeft === myTeam.length && foeDown === 0) return 'early';
    return 'mid';
  }

  /* Does terastallizing now save us or win the exchange? */
  function teraAdvice(ctx) {
    const { myActive, foeMon, cand, field, foeFainted, myFainted, threats, moves, teraType, loProfile, hiProfile, speed } = ctx;
    if (!teraType || myActive.terastallized) return null;
    const T = teraType.charAt(0).toUpperCase() + teraType.slice(1).toLowerCase();
    const tMon = Object.assign({}, myActive, { terastallized: T, types: T === 'Stellar' ? myActive.types : [T] });
    const movesLast = !(speed && speed.faster);

    // Their best hit, before and after.
    let worstNow = null, worstTera = null;
    for (const t of threats.filter((x) => x.kind === 'damage')) if (!worstNow || t.hi > worstNow.hi) worstNow = t;
    for (const mv of cand.moves) {
      const r = calcDamage({ move: mv, atk: foeMon, def: tMon, field, foeFaintedCount: foeFainted, movesLast: !movesLast });
      if (r && r.maxPct && !r.immune && (!worstTera || r.maxPct > worstTera.hi)) worstTera = { name: r.name, lo: r.minPct, hi: r.maxPct };
    }
    const killedNow = !!(worstNow && worstNow.hi >= myActive.hpPct);
    const killedTera = !!(worstTera && worstTera.hi >= myActive.hpPct);
    const r0 = (x) => Math.round(x);
    if (killedNow && !killedTera) {
      return { type: T, kind: 'defense',
        why: `Tera ${T}: ${worstNow.name} goes from ${r0(worstNow.lo)}-${r0(worstNow.hi)}% to ` +
          (worstTera ? `${r0(worstTera.lo)}-${r0(worstTera.hi)}% (${worstTera.name})` : '0%') + ', you survive.' };
    }

    // Our best hit, before and after.
    const bestNow = moves.find((m) => m.kind === 'damage');
    if (bestNow && bestNow.koGuaranteed) return null;
    let gain = null;
    for (const m of moves.filter((x) => x.kind === 'damage')) {
      const lo = calcDamage({ move: m.name, atk: tMon, def: foeMon, field, defProfile: loProfile, foeFaintedCount: myFainted, movesLast });
      const hi = calcDamage({ move: m.name, atk: tMon, def: foeMon, field, defProfile: hiProfile, foeFaintedCount: myFainted, movesLast });
      if (lo && lo.minPct >= foeMon.hpPct && !(gain && gain.lo >= lo.minPct)) gain = { move: lo.name, lo: lo.minPct, hi: hi ? hi.maxPct : lo.maxPct, before: m };
    }
    // Only if the Tera doesn't hand him a KO on us while he moves first.
    if (gain && !(killedTera && movesLast)) {
      return { type: T, kind: 'attack', move: gain.move,
        why: `Tera ${T}: ${gain.move} goes from ${r0(gain.before.lo)}-${r0(gain.before.hi)}% to ${r0(gain.lo)}-${r0(gain.hi)}%, guaranteed KO.` };
    }
    return null;
  }

  /* Can one of our priority users finish every foe left (now, or after one boost)? */
  function endgame(ctx) {
    const { myTeam, myActive, foe, foeMon, field, profile, threats, myFainted } = ctx;
    const foesAlive = (foe.pokemon || []).filter((p) => p && !p.fainted).map((p) => readFoe(p)).filter(Boolean);
    if (!foesAlive.length) return null;
    const unseen = Math.max(0, (foe.totalPokemon || 6) - (foe.pokemon || []).length);
    const results = [];
    for (const m of myTeam) {
      if (m.fainted) continue;
      const prof = profile && profile.members[toID(m.name)] && profile.members[toID(m.name)].cleaner;
      const prio = prof ? [prof.move] : (m.moves || []).filter((mv) => { const md = moveData(mv); return md && md.priority > 0 && md.category !== 'Status' && md.basePower > 0; });
      if (!prio.length) continue;
      const setupId = prof ? prof.setup : (m.moves || []).find((mv) => ['swordsdance', 'dragondance', 'bulkup', 'nastyplot'].includes(toID(mv)));
      const isActive = myActive && m.name === myActive.name;
      const cur = isActive ? (myActive.boosts || {}) : {};
      const tryWith = (boosts) => {
        const att = Object.assign({}, m, { boosts });
        let all = true, sure = true; const targets = [];
        for (const f of foesAlive) {
          const lo = calcDamage({ move: prio[0], atk: att, def: f, field, defProfile: 'bulky', foeFaintedCount: myFainted });
          const hi = calcDamage({ move: prio[0], atk: att, def: f, field, defProfile: 'offense', foeFaintedCount: myFainted });
          const ok = lo && !lo.immune && hi && hi.maxPct >= f.hpPct;
          if (!ok) all = false;
          if (!(lo && !lo.immune && lo.minPct >= f.hpPct)) sure = false;
          targets.push({ name: f.name, hp: f.hpPct, lo: lo && !lo.immune ? lo.minPct : 0, hi: hi && !hi.immune ? hi.maxPct : 0 });
        }
        return { all: all && unseen === 0, sure: sure && unseen === 0, targets };
      };
      const now = tryWith(cur);
      let res = { now, needsSetup: false };
      if (!now.all && setupId && (cur.atk || 0) < 2) {
        const up = Object.assign({}, cur, { atk: Math.min(6, (cur.atk || 0) + 2) });
        const after = tryWith(up);
        if (after.all) res = { now: after, needsSetup: true };
      }
      const md = moveData(prio[0]);
      results.push({ m, isActive, moveName: md ? md.name : prio[0], setupId, res });
    }
    if (!results.length) return null;
    results.sort((a, b) => (b.res.now.all - a.res.now.all) || (b.isActive - a.isActive));
    const r = results[0];
    const incoming = (threats || []).filter((t) => t.kind === 'damage').reduce((x, t) => Math.max(x, t.hi), 0);
    const left = foesAlive.length + unseen;
    const setupName = r.setupId ? ((moveData(r.setupId) || {}).name || r.setupId) : '';
    const text = r.res.now.all
      ? (r.res.needsSetup ? `${r.m.name}: ${setupName} then ${r.moveName} KOs the ${left} left.`
        : `${r.m.name}: ${r.moveName} KOs the ${left} left${r.res.now.sure ? '' : ' (depending on rolls)'}.`)
      : `${r.m.name} (${r.moveName}) is your cleaner: keep it alive for the end.`;
    return {
      mon: r.m.name, move: r.moveName, moveName: r.moveName, setupId: r.setupId,
      clean: r.res.now.all, guaranteed: r.res.now.sure, needsSetup: r.res.needsSetup,
      activeIsCleaner: r.isActive, unseen, targets: r.res.now.targets, text,
      safeToSetup: r.isActive && myActive && incoming < myActive.hpPct
    };
  }

  /* Our last mon standing: can it beat everything left on its own?
   * Each foe in turn: hits we need (average roll on a bulky spread, at most 3)
   * against what it hits back with at worst, faster or slower. Used to pick the
   * "last stand" cinematic instead of Kira's. */
  function soloWin(room) {
    const battle = room && room.battle, req = room && room.request;
    if (!battle || !req || !req.side || !Array.isArray(req.side.pokemon)) return false;
    const { mine, foe } = sides(battle);
    const field = readField(battle);
    const alive = req.side.pokemon.map((rm) => {
      const nm = String(rm.details || '').split(',')[0];
      const cm = (mine.pokemon || []).find((p) => toID(p.speciesForme || p.species) === toID(nm));
      return readMine(rm, cm);
    }).filter((m) => m && !m.fainted);
    if (alive.length !== 1) return false;
    const me = alive[0];
    if ((foe.totalPokemon || 6) > (foe.pokemon || []).length) return false; // unseen foes left
    const foes = (foe.pokemon || []).filter((p) => p && !p.fainted).map((p) => ({ raw: p, f: readFoe(p) })).filter((x) => x.f);
    if (!foes.length) return false;
    let hp = me.hpPct;
    const mySpe = speedOf(me, field, true);
    for (const { raw, f } of foes) {
      let best = 0;
      for (const mv of me.moves || []) {
        const r = calcDamage({ move: mv, atk: me, def: f, field, defProfile: 'bulky' });
        if (r && !r.immune && r.maxPct) best = Math.max(best, (r.minPct + r.maxPct) / 2);
      }
      if (best <= 0) return false;
      const hits = Math.ceil(f.hpPct / best);
      if (hits > 3) return false;
      // Its worst hit, and its worst priority hit (that one lands first even if we're faster).
      let worst = 0, worstPrio = 0;
      for (const mv of foeCandidateMoves(f, raw, field).moves) {
        const r = calcDamage({ move: mv, atk: f, def: me, field });
        if (!r || r.immune || !r.maxPct) continue;
        worst = Math.max(worst, r.maxPct);
        if (r.priority > 0) worstPrio = Math.max(worstPrio, r.maxPct);
      }
      hp -= outspeeds(mySpe, speedOf(f, field, false), field) ? worst * (hits - 1) + worstPrio : worst * hits;
      if (hp <= 0) return false;
    }
    return true;
  }

  /* % of max HP lost on switching in (Stealth Rock, Spikes). */
  function hazardCost(m, sc) {
    if (!sc || toID(m.item) === 'heavydutyboots' || toID(m.ability) === 'magicguard') return 0;
    let cost = 0;
    if (sc.stealthrock) cost += 12.5 * typeMult('Rock', m.types || []);
    const grounded = !(m.types || []).includes('Flying') && toID(m.ability) !== 'levitate' && toID(m.item) !== 'airballoon';
    const layers = sc.spikes ? (sc.spikes[1] || 1) : 0;
    if (grounded && layers) cost += [0, 12.5, 100 / 6, 25][Math.min(3, layers)];
    return cost;
  }

  function hazardCount(sc) {
    if (!sc) return 0;
    return (sc.stealthrock ? 1 : 0) + (sc.spikes ? (sc.spikes[1] || 1) : 0)
      + (sc.toxicspikes ? (sc.toxicspikes[1] || 1) : 0) + (sc.stickyweb ? 1 : 0);
  }

  /* Lay ours when it's free, send theirs back when they pile up. */
  function hazardPlan(ctx) {
    const { myActive, mine, foe, threats } = ctx;
    const has = (mv) => (myActive.moves || []).some((x) => toID(x) === mv);
    const incoming = (threats || []).filter((t) => t.kind === 'damage').reduce((x, t) => Math.max(x, t.hi), 0);
    const safe = incoming < 40 && !(threats || []).some((t) => t.kills);
    const mySc = (mine && mine.sideConditions) || {};
    const foeSc = (foe && foe.sideConditions) || {};
    const mine2 = hazardCount(mySc);
    if (mine2 >= 2 && hazardCount(foeSc) < mine2 && has('courtchange') && incoming < 60) {
      return { kind: 'clear', moveName: 'Court Change', why: `${mine2} hazards on your side: Court Change sends them all to its side.` };
    }
    for (const [mv, label] of [['defog', 'Defog'], ['rapidspin', 'Rapid Spin'], ['mortalspin', 'Mortal Spin'], ['tidyup', 'Tidy Up']]) {
      if (mine2 >= 2 && has(mv) && incoming < 60) return { kind: 'clear', moveName: label, why: `${mine2} hazards on your side: ${label} clears them.` };
    }
    if (!safe) return null;
    if (has('stealthrock') && !foeSc.stealthrock) return { kind: 'set', moveName: 'Stealth Rock', why: 'It doesn\'t threaten you: set Stealth Rock.' };
    const layers = foeSc.spikes ? (foeSc.spikes[1] || 1) : 0;
    if (has('spikes') && layers < 3) return { kind: 'set', moveName: 'Spikes', why: `It doesn\'t threaten you: Spikes layer ${layers + 1}.` };
    return null;
  }

  /* ------------------------------------------------------------------ */
  /* Anti-setup                                                          */
  /* ------------------------------------------------------------------ */

  const PHAZE = ['whirlwind', 'roar', 'dragontail', 'circlethrow'];
  const HAZE = ['haze', 'clearsmog'];

  /* Offensive self-boosts of a move, from the dex's own `boosts` field
   * (Swords Dance {atk:2}, Dragon Dance {atk:1,spe:1}...). */
  // Setup moves whose boosts live in code, not in the dex's `boosts` field.
  const EXTRA_BOOSTS = { bellydrum: { atk: 6 }, tidyup: { atk: 1, spe: 1 }, takeheart: { spa: 1 } };

  function selfBoosts(md, userTypes) {
    if (!md || md.category !== 'Status') return null;
    const id = toID(md.name);
    if (EXTRA_BOOSTS[id]) return EXTRA_BOOSTS[id];
    // Curse boosts Atk/Def unless the user is a Ghost type (then it's the HP-cost curse).
    if (id === 'curse') return (userTypes || []).includes('Ghost') ? null : { atk: 1 };
    if (!md.boosts || md.target !== 'self') return null;
    const pos = {};
    let any = false;
    for (const k of ['atk', 'spa', 'spe']) if (md.boosts[k] > 0) { pos[k] = md.boosts[k]; any = true; }
    return any ? pos : null;
  }

  /* Asleep (Gen 9): 1 to 3 turns without moving, drawn evenly; the counter only
   * goes down on the field. wake = chance it wakes this turn (it then moves). */
  function sleepState(myActive, clientMon, ourMoves) {
    if (toID(myActive.status) !== 'slp' || toID(myActive.ability) === 'comatose') return null;
    const slept = Math.min(3, (clientMon && clientMon.statusData && clientMon.statusData.sleepTurns) || 0);
    const rest = clientMon && clientMon.lastMove === 'rest';
    const wake = rest ? (slept >= 2 ? 1 : 0) : [0, 1 / 3, 1 / 2, 1][slept];
    const has = (id) => ourMoves.some((m) => toID(m.name) === id);
    return { slept, wake, sleepTalk: has('sleeptalk'), snore: has('snore') };
  }

  /* Taunt on their side: our status answers may never go off. Whirlwind / Roar are -6,
   * so his Taunt always lands first; the rest only goes first if we outspeed (no Prankster).
   * Removes the blocked ids from `have` and says which one was lost. */
  const TAUNT_PRONE = ['haze', 'encore', 'taunt', 'willowisp', 'thunderwave', 'whirlwind', 'roar'];
  function tauntBlock(have, ctx) {
    const { cand, foeRaw, foeMon, myActive, speed } = ctx;
    if (!cand || !cand.moves.some((mv) => toID(mv) === 'taunt')) return null;
    if (['oblivious', 'aromaveil'].includes(toID(myActive && myActive.ability))) return null;
    const seen = seenMoves(foeRaw).some((m) => toID(m) === 'taunt');
    const weFirst = !!(speed && speed.faster) && toID(foeMon.ability) !== 'prankster';
    const blocked = [];
    for (const id of TAUNT_PRONE) {
      if (!have.has(id)) continue;
      if (id === 'whirlwind' || id === 'roar' || !weFirst) { have.delete(id); blocked.push(id); }
    }
    return blocked.length ? { seen, blocked } : null;
  }
  const tauntNote = (tb) => {
    if (!tb) return '';
    const md = moveData(tb.blocked[0]);
    return `. It ${tb.seen ? 'has' : 'may have'} Taunt and goes before ${md ? md.name : tb.blocked[0]}: forget status moves, attack or switch`;
  };

  /* Could the foe boost this turn and then run through us? Simulates the boost
   * on their best hit and picks the cleanest answer we actually have. */
  function setupRisk(ctx) {
    const { myActive, myTeam, foeMon, foeRaw, cand, field, foeFainted, ourMoves, switches, threats, speed } = ctx;
    const cur = foeMon.boosts || {};
    const already = ['atk', 'spa', 'spe'].some((k) => (cur[k] || 0) > 0);

    let pick = null;
    for (const mv of cand.moves) {
      const md = moveData(mv);
      const b = selfBoosts(md, foeMon.baseTypes);
      if (b) { pick = { move: md.name, boosts: b }; break; }
    }
    if (!pick && !already) return null;

    // If we take them out right now, there is nothing to answer.
    const bestNow = ourMoves.find((m) => m.kind === 'damage');
    if (bestNow && bestNow.koGuaranteed) return null;

    const boosts = Object.assign({}, cur);
    if (pick) for (const k of Object.keys(pick.boosts)) boosts[k] = clamp((boosts[k] || 0) + pick.boosts[k], -6, 6);
    const boostedMon = Object.assign({}, foeMon, { boosts });

    const bestHitOn = (target) => {
      let top = null;
      for (const mv of cand.moves) {
        const r = calcDamage({ move: mv, atk: boostedMon, def: target, field, foeFaintedCount: foeFainted });
        if (r && r.maxPct && !r.immune && (!top || r.maxPct > top.hi)) top = { name: r.name, lo: r.minPct, hi: r.maxPct };
      }
      return top;
    };
    const boosted = bestHitOn(myActive);
    const alive = myTeam.filter((m) => !m.fainted);
    const sweep = alive.filter((m) => { const h = bestHitOn(m); return h && h.hi >= m.hpPct; }).length;
    const boostedKills = !!boosted && boosted.hi >= myActive.hpPct;
    if (!already && !boostedKills && sweep < 2) return null;

    const seen = !!pick && seenMoves(foeRaw).some((m) => toID(m) === toID(pick.move));
    const justBoosted = already && foeRaw && !!selfBoosts(moveData(foeRaw.lastMove), foeMon.baseTypes);

    // Our usable moves (status ones included) this turn.
    const have = new Set(ourMoves.map((m) => toID(m.name)));
    const taunted = tauntBlock(have, ctx);
    const first = (ids) => ids.find((id) => have.has(id));
    const nameOf = (id) => { const md = moveData(id); return md ? md.name : id; };
    const foeTypes = foeMon.types || [];
    const canBurn = !foeMon.status && !foeTypes.includes('Fire') && boosts.atk > 0;
    const canPara = !foeMon.status && !foeTypes.includes('Electric') && !foeTypes.includes('Ground') && boosts.spe > 0;
    const unaware = (switches || []).find((sw) => !sw.dies
      && myTeam.some((m) => m.name === sw.name && toID(m.ability) === 'unaware'));

    // A counter only works if it actually gets to act:
    //  - Taunt / Encore must land before his move -> we must be faster;
    //  - against an already boosted foe, Haze / phaze need us to survive his hit
    //    (phazing moves are -6, they always go last).
    // Against evasion boosts, keep only phazing that can't miss (Whirlwind, Roar).
    const phaze = (cur.evasion || 0) > 0 ? ['whirlwind', 'roar'] : PHAZE;
    const faster = !!(speed && speed.faster);
    const killedNow = (threats || []).some((t) => t.kind === 'damage' && t.kills);
    const actsInTime = faster || !killedNow;

    let counter = null;
    const move = (id, why) => { counter = { kind: 'move', name: nameOf(id), why }; };
    if (justBoosted && faster && have.has('encore')) {
      move('encore', 'Encore locks it into its boost for 3 turns: you buy time and switch safely.');
    } else if (already && actsInTime && first(HAZE)) {
      move(first(HAZE), `${nameOf(first(HAZE))} wipes its boosts.`);
    } else if (already && !killedNow && first(phaze)) {
      move(first(phaze), `${nameOf(first(phaze))} sends it back, boosts lost.`);
    } else if (!already && faster && have.has('taunt')) {
      move('taunt', 'Taunt stops it from boosting.');
    } else if (canBurn && actsInTime && have.has('willowisp')) {
      move('willowisp', 'Will-O-Wisp halves its Attack, boost included.');
    } else if (canPara && actsInTime && have.has('thunderwave')) {
      move('thunderwave', 'Thunder Wave cancels its Speed gain.');
    } else if (unaware) {
      counter = { kind: 'switch', name: unaware.name, why: `${unaware.name} (Unaware) ignores its boosts.` };
    } else if (!already && first(phaze)) {
      move(first(phaze), `${nameOf(first(phaze))}: if it boosts, it goes back and loses everything.`);
    } else if (!already && first(HAZE)) {
      move(first(HAZE), `${nameOf(first(HAZE))} will wipe its boosts.`);
    }

    const r0 = (x) => Math.round(x);
    const danger = already ? `${foeMon.name} is already boosted`
      : `${foeMon.name} ${seen ? 'has' : 'may have'} ${pick.move}`;
    const after = boosted
      ? `: ${already && !pick ? '' : 'after boosting, '}${boosted.name} does ${r0(boosted.lo)}-${r0(boosted.hi)}% to you`
        + (sweep >= 2 ? ` and it OHKOs ${sweep} of your ${alive.length}` : '')
      : '';

    return {
      move: pick ? pick.move : null, boosts, already, justBoosted, seen,
      boosted, boostedKills, sweep, alive: alive.length,
      counter, taunted, summary: danger + after + tauntNote(taunted)
    };
  }

  /* ---- Defensive setup and stall ---- */

  // Defensive self-boosts the dex doesn't describe in `boosts` (Stockpile lives in code).
  const DEF_EXTRA = { stockpile: { def: 1, spd: 1 } };
  const RECOVERY = ['recover', 'roost', 'slackoff', 'softboiled', 'moonlight', 'synthesis', 'morningsun', 'wish',
    'strengthsap', 'shoreup', 'milkdrink', 'rest', 'junglehealing', 'lunarblessing', 'swallow', 'leechseed', 'painsplit'];
  const STALL_MOVES = ['leechseed', 'toxic', 'protect', 'detect', 'kingsshield', 'spikyshield', 'banefulbunker', 'saltcure',
    'sandtomb', 'whirlpool', 'firespin', 'infestation', 'magmastorm', 'bind', 'wrap', 'thundercage', 'substitute', 'willowisp'];
  const PIVOTS = ['uturn', 'voltswitch', 'flipturn', 'partingshot', 'teleport', 'chillyreception', 'shedtail', 'batonpass'];
  const SPINNERS = ['rapidspin', 'mortalspin'];

  function defBoosts(md) {
    if (!md || md.category !== 'Status') return null;
    const id = toID(md.name);
    if (DEF_EXTRA[id]) return DEF_EXTRA[id];
    if (!md.boosts || md.target !== 'self') return null;
    const out = {};
    let any = false;
    for (const k of ['def', 'spd']) if (md.boosts[k] > 0) { out[k] = md.boosts[k]; any = true; }
    return any ? out : null;
  }

  /* Could it boost its defenses until we can't outdamage its recovery? Simulates the
   * boost on our best hit. Answers: Haze / phaze / Encore / Taunt, an Unaware switch,
   * or a move that ignores the boost (crit moves, Sacred Sword, Psyshock vs SpD). */
  function wallRisk(ctx) {
    const { myActive, myTeam, foeMon, foeRaw, cand, field, myFainted, ourMoves, switches, speed } = ctx;
    if (!myActive || !foeMon) return null;
    const cur = foeMon.boosts || {};
    let pick = null;
    for (const mv of cand.moves) {
      const b = defBoosts(moveData(mv));
      if (b) { pick = { move: moveData(mv).name, boosts: b }; break; }
    }
    const already = (cur.def || 0) >= 2 || (cur.spd || 0) >= 2;
    if (!pick && !already) return null;
    const bestNow = ourMoves.find((m) => m.kind === 'damage');
    if (bestNow && bestNow.koGuaranteed) return null;

    // Two uses of its boost (Stockpile x2, Iron Defense x2): that is when it starts to wall.
    const boosts = Object.assign({}, cur);
    if (pick) for (const k of Object.keys(pick.boosts)) boosts[k] = clamp((boosts[k] || 0) + 2 * pick.boosts[k], -6, 6);
    const walledMon = Object.assign({}, foeMon, { boosts });
    let after = null, through = null;
    for (const m of ourMoves.filter((x) => x.kind === 'damage')) {
      const hit = (target) => calcDamage({ move: m.name, atk: myActive, def: target, field, defProfile: 'bulky', foeFaintedCount: myFainted });
      const r = hit(walledMon), now = hit(foeMon);
      if (!r || r.immune || !r.maxPct) continue;
      if (!after || r.maxPct > after.hi) after = { name: r.name, hi: r.maxPct };
      // A move the boost doesn't touch keeps (almost) all its damage.
      if (now && now.maxPct > 0 && r.maxPct >= 0.9 * now.maxPct && (!through || r.maxPct > through.hi)) through = { name: r.name, hi: r.maxPct };
    }
    const seen = seenMoves(foeRaw).map(toID);
    const heals = cand.moves.map(toID).some((m) => RECOVERY.includes(m)) || ['leftovers', 'blacksludge'].includes(toID(foeMon.item));
    // Walled: our best hit, once it is boosted, can't beat what it heals back.
    const limit = heals ? 50 : 25;
    const walled = !after || after.hi < limit;
    if (!walled) return null;

    const have = new Set(ourMoves.map((m) => toID(m.name)));
    const taunted = tauntBlock(have, ctx);
    const firstOf = (ids) => ids.find((id) => have.has(id));
    const nameOf = (id) => { const md = moveData(id); return md ? md.name : id; };
    const faster = !!(speed && speed.faster);
    const unaware = (switches || []).find((sw) => !sw.dies && myTeam.some((m) => m.name === sw.name && toID(m.ability) === 'unaware'));
    const justBoosted = foeRaw && !!defBoosts(moveData(foeRaw.lastMove));
    let counter = null;
    const move = (id, why) => { counter = { kind: 'move', name: nameOf(id), why }; };
    if ((already || justBoosted) && firstOf(HAZE)) move(firstOf(HAZE), `${nameOf(firstOf(HAZE))} wipes its defensive boosts.`);
    else if ((already || justBoosted) && firstOf(PHAZE)) move(firstOf(PHAZE), `${nameOf(firstOf(PHAZE))} sends it back, boosts and all.`);
    else if (justBoosted && faster && have.has('encore')) move('encore', 'Encore locks it into its boost: it can neither attack nor heal.');
    else if (have.has('taunt') && (faster || !already)) move('taunt', 'Taunt: no boosting or healing for 3 turns.');
    else if (through && through.hi >= limit) move(toID(through.name), `${through.name} goes right through its boosts.`);
    else if (unaware) counter = { kind: 'switch', name: unaware.name, why: `${unaware.name} (Unaware) ignores its boosts.` };

    const r0 = (x) => Math.round(x);
    const what = already ? `${foeMon.name} already has boosted defenses` : `${foeMon.name} ${seen.includes(toID(pick.move)) ? 'has' : 'may have'} ${pick.move}`;
    const summary = `${what}: ${after ? `your best hit would drop to ${r0(after.hi)}%` : 'you would do nothing to it'}`
      + (heals ? ', less than it heals back' : '') + tauntNote(taunted);
    return { move: pick ? pick.move : null, already, after, heals, counter, taunted, summary };
  }

  /* What eats our active every turn (Leech Seed, Sand Tomb & co, Salt Cure, poison...)
   * and whether we can even leave (the request says when we're trapped). */
  function stallState(ctx) {
    const { myActive, clientMon, foeMon, cand, field, req, ourMoves } = ctx;
    if (!myActive) return null;
    const vol = (clientMon && clientMon.volatiles) || {};
    const ab = toID(myActive.ability), it = toID(myActive.item);
    const types = myActive.types || [];
    const magic = ab === 'magicguard';
    const parts = [];
    const add = (pct, what) => { if (!magic) parts.push({ pct, what }); };
    if (vol.leechseed) add(12.5, 'Leech Seed');
    if (vol.partiallytrapped) add(it === 'bindingband' ? 16.7 : 12.5, (vol.partiallytrapped[1] && vol.partiallytrapped[1].name) || String(vol.partiallytrapped[1] || 'trap'));
    if (vol.saltcure) add(types.includes('Water') || types.includes('Steel') ? 25 : 12.5, 'Salt Cure');
    if (vol.curse) add(25, 'Curse');
    const st = toID(myActive.status);
    if (st === 'tox') {
      const n = (clientMon && clientMon.statusData && clientMon.statusData.toxicTurns) || 1;
      add(Math.min(100, 6.25 * (n + 1)), 'Toxic');
    } else if (st === 'psn' && ab !== 'poisonheal') add(12.5, 'poison');
    else if (st === 'brn') add(6.25, 'burn');
    const wx = field && field.weather;
    if (wx === 'sandstorm' && !types.some((t) => ['Rock', 'Ground', 'Steel'].includes(t))
      && !['sandveil', 'sandrush', 'sandforce', 'overcoat'].includes(ab) && it !== 'safetygoggles') add(6.25, 'Sandstorm');
    let heal = 0;
    if (it === 'leftovers' || (it === 'blacksludge' && types.includes('Poison'))) heal += 6.25;
    if (field && field.terrain === 'grassyterrain' && grounded(myActive)) heal += 6.25;
    if (st === 'psn' && ab === 'poisonheal') heal += 12.5;
    const loss = parts.reduce((x, p) => x + p.pct, 0);
    const net = Math.max(0, loss - heal);

    const a0 = req && req.active && req.active[0];
    const trapped = !!(a0 && (a0.trapped || a0.maybeTrapped));
    const have = new Set((ourMoves || []).map((m) => toID(m.name)));
    const pivot = PIVOTS.find((p) => have.has(p)) || null;
    const spin = SPINNERS.find((p) => have.has(p)) || null;
    // It plays stall: seeds, traps, poisons, protects and heals.
    const stallSeen = (cand ? cand.moves : []).map(toID).filter((m) => STALL_MOVES.includes(m) || RECOVERY.includes(m));
    const seededBy = vol.leechseed || vol.partiallytrapped;
    if (!net && !trapped && stallSeen.length < 2) return null;
    return {
      parts, loss, heal, net, turnsLeft: net > 0 ? Math.floor(myActive.hpPct / net) : null,
      trapped, pivot: pivot ? moveData(pivot).name : null, spin: spin && seededBy ? moveData(spin).name : null,
      seeded: !!vol.leechseed, bound: !!vol.partiallytrapped,
      stall: stallSeen.length >= 2, taunt: have.has('taunt'), foe: foeMon && foeMon.name
    };
  }

  /* What the tool would click in your place. Reads the advisor's strongest
   * non-warning rule, falls back to the hardest-hitting move. `rule` records
   * which branch decided, so logged games can be analysed per rule. */
  function verdict(out) {
    const v = pickVerdict(out);
    if (v && !v.rule) v.rule = 'best-move';
    return v;
  }

  function pickVerdict(out) {
    // Not straight back to the mon we just pulled out, unless it's the only one that lives.
    const safe = out.switches.find((s) => !s.dies && !s.justLeft) || out.switches.find((s) => !s.dies) || null;
    const best = out.moves.find((m) => m.kind === 'damage') || null;
    const top = (out.advice || []).find((a) => a.level !== 'warn' && a.score >= 60) || null;

    if (out.forced) {
      if (safe) return { rule: 'forced-switch', kind: 'switch', target: safe.name, text: `Send in ${safe.name}`, why: safe.why };
      if (out.switches[0]) {
        return { rule: 'forced-switch', kind: 'switch', target: out.switches[0].name, text: `Send in ${out.switches[0].name}`,
          why: 'nobody takes its best hit, this is the least bad' };
      }
      return null;
    }

    // Trapped (Sand Tomb, Shadow Tag...): a switch can't be clicked. Pivot out if we can.
    if (top && top.level === 'switch' && out.stall && out.stall.trapped) {
      if (out.stall.pivot) return { rule: top.rule + '/trapped', kind: 'move', target: out.stall.pivot, text: out.stall.pivot, why: `${top.text} You are trapped: ${out.stall.pivot} is your only way out.` };
      if (best) return { rule: top.rule + '/trapped', kind: 'move', target: best.name, text: best.name, why: `${top.text} But you are trapped and can't switch: attack.` };
    }
    if (top && top.level === 'switch') {
      const target = (top.target && out.switches.find((s) => s.name === top.target)) || safe;
      if (target) return { rule: top.rule, kind: 'switch', target: target.name, text: `Switch to ${target.name}`, why: top.text };
      if (best) return { rule: top.rule + '/no-safe-switch', kind: 'move', target: best.name, text: best.name, why: `${top.text} But no switch holds: attack.` };
    }
    if (top && top.level === 'setup' && top.move) {
      const md = moveData(top.move);
      return { rule: top.rule, kind: 'setup', target: md ? md.name : top.move, text: md ? md.name : top.move, why: top.text };
    }
    if (top && top.level === 'stay' && (top.moveName || best)) {
      const mv = top.moveName || best.name;
      return { rule: top.rule, kind: 'move', target: mv, text: mv, why: top.text };
    }

    if (best) {
      return { kind: 'move', target: best.name, text: best.name,
        why: `your strongest hit here (${pct(best.lo)}-${pct(best.hi)}%)` };
    }
    if (safe) return { rule: 'no-offense-fallback', kind: 'switch', target: safe.name, text: `Switch to ${safe.name}`, why: 'no useful attacking move here' };
    return null;
  }

  /* ------------------------------------------------------------------ */
  /* UI                                                                  */
  /* ------------------------------------------------------------------ */

  const CSS = `
  .agc-panel{background:#12151c;color:#e6e9ef;
    font:13px/1.55 "Avenir Next","Avenir","Segoe UI Variable Text","Segoe UI","Ubuntu","Cantarell","Noto Sans",system-ui,sans-serif;box-sizing:border-box;
    -webkit-font-smoothing:antialiased}
  .agc-panel *{box-sizing:border-box}
  #agcopilot.agc-panel{position:fixed;top:12px;right:12px;width:340px;z-index:999999;
    border:1px solid #2a3040;border-radius:10px;box-shadow:0 8px 28px rgba(0,0,0,.5);
    max-height:88vh;overflow:auto}
  #agcopilot.collapsed .agc-scroll{display:none}
  .agc-head{display:flex;align-items:center;justify-content:space-between;
    padding:7px 12px;background:#1a1f2b;border-bottom:1px solid #2a3040;cursor:move;
    position:sticky;top:0;z-index:2}
  .agc-title{font-weight:700;letter-spacing:.3px}
  .agc-title b{color:#fcd34d}
  .agc-toggle{cursor:pointer;opacity:.6;padding:0 4px}
  .agc-toggle:hover{opacity:1}
  .agc-scroll{padding:12px 14px 14px}

  /* dock inside the battle room, over the chat column */
  .agc-dockwrap{position:absolute;inset:0;pointer-events:none;z-index:20}
  .agc-dockwrap > *{pointer-events:auto}
  .agc-dockpanel{position:absolute;overflow:auto;border-left:1px solid #2a3040}
  .agc-dockpanel.agc-off{display:none}
  .agc-dockpanel .agc-scroll{padding-top:46px}
  .agc-tabs{position:absolute;display:flex;gap:2px;padding:2px;border-radius:999px;
    background:rgba(18,21,28,.92);border:1px solid #2a3040;box-shadow:0 2px 8px rgba(0,0,0,.35);
    font:600 12px/1 "Avenir Next","Avenir","Segoe UI Variable Text","Segoe UI","Ubuntu","Cantarell","Noto Sans",system-ui,sans-serif;letter-spacing:.02em}
  .agc-tabs button{all:unset;cursor:pointer;padding:6px 11px;border-radius:999px;color:#aab4c8}
  .agc-tabs button:hover{color:#fff}
  .agc-tabs button.on{background:#fcd34d;color:#1b1b2a}

  .agc-hero{display:flex;align-items:center;gap:10px;margin-bottom:12px}
  .agc-herotext{flex:1;min-width:0}

  /* matchup header */
  .agc-vs{display:grid;grid-template-columns:1fr auto 1fr;gap:6px;align-items:center}
  .agc-side{min-width:0}
  .agc-side.foe{text-align:right}
  .agc-mon{display:flex;align-items:center;gap:2px;font-weight:700;font-size:13px;
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .agc-side.foe .agc-mon{justify-content:flex-end}
  .agc-vsdot{color:#6b7488;font-size:11px;font-weight:700}
  .agc-ico{display:inline-block;width:40px;height:30px;flex:none;margin:-4px -2px -4px -6px}
  .agc-hp{height:6px;border-radius:3px;background:#262c3a;overflow:hidden;margin-top:3px}
  .agc-hp i{display:block;height:100%;border-radius:3px}
  .agc-hptxt{font-size:11px;color:#8b95ad;margin-top:1px}
  .agc-boosts{display:flex;flex-wrap:wrap;gap:3px;margin-top:4px}
  .agc-side.foe .agc-boosts{justify-content:flex-end}
  .agc-boost{font-size:10px;font-weight:800;padding:1px 5px;border-radius:4px}
  .agc-boost.up{background:#4c1d1d;color:#fca5a5}
  .agc-side:not(.foe) .agc-boost.up{background:#14532d;color:#86efac}
  .agc-boost.down{background:#1f2937;color:#93c5fd}

  .agsec{margin-top:16px}
  .aglabel{color:#8b95ad;font-size:11px;font-weight:700;letter-spacing:.7px;
    text-transform:uppercase;margin-bottom:7px}

  /* verdict */
  .agpick{display:flex;gap:10px;align-items:center;padding:11px 12px;border-radius:8px;
    background:#1a2230;border:1px solid #2b3a55}
  .agpick-move{background:linear-gradient(90deg,#163020,#14241a);border-color:#2f6b45}
  .agpick-switch{background:linear-gradient(90deg,#3a1a1d,#2a1618);border-color:#7a3236}
  .agpick-setup{background:linear-gradient(90deg,#172743,#1a2230);border-color:#2f5390}
  .agpick-emoji{font-size:24px;line-height:1}
  .agpick-main{font-size:17px;font-weight:800;letter-spacing:.2px}
  .agpick-why{color:#c3cad8;font-size:12px;margin-top:2px}

  /* rows */
  .agc-row{padding:7px 0}
  .agc-row + .agc-row{border-top:1px solid #1e2330}
  .agc-rowtop{display:flex;align-items:center;gap:7px}
  .agc-rank{color:#6b7488;font-size:11px;font-weight:700;min-width:16px}
  .agc-rank.top{color:#fcd34d}
  .agname{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:600}
  .agnum{font-variant-numeric:tabular-nums;white-space:nowrap;color:#aab4c8}
  .agsub{color:#8b95ad;font-size:12px;margin-top:2px}
  .agc-type{font-size:10px;font-weight:800;letter-spacing:.3px;text-transform:uppercase;
    padding:2px 6px;border-radius:4px;color:#fff;text-shadow:0 1px 1px rgba(0,0,0,.45);flex:none}
  .agc-eff{font-size:10px;font-weight:800;padding:1px 5px;border-radius:4px;flex:none}
  .agc-eff.up{background:#14532d;color:#86efac}
  .agc-eff.down{background:#3b2a12;color:#fcd34d}
  .agc-pill{font-size:10px;font-weight:800;padding:2px 7px;border-radius:999px;flex:none}
  .agc-pill.ko{background:#4ade80;color:#0b2414}
  .agc-pill.maybe{background:#fbbf24;color:#2a1d02}
  .agc-pill.bad{background:#f87171;color:#2a0b0b}
  .agc-pill.safe{background:#60a5fa;color:#0b1a2e}
  .agc-bar{position:relative;height:7px;border-radius:4px;background:#262c3a;margin-top:6px;overflow:hidden}
  .agc-bar .lo,.agc-bar .hi{position:absolute;top:0;bottom:0;left:0}
  .agc-bar .hi{opacity:.4}
  .agc-bar .mark{position:absolute;top:-2px;bottom:-2px;width:2px;background:#fff;opacity:.8}
  .agrisk{padding:5px 0 5px 16px;position:relative;color:#d7dce6}
  .agrisk:before{content:"";position:absolute;left:3px;top:12px;width:6px;height:6px;
    border-radius:50%;background:#fbbf24}
  .agrisk.bad:before{background:#f87171}
  .dim{color:#6b7488}
  .agfoot{color:#6b7488;font-size:11px;margin-top:16px;line-height:1.4}
  .agerr{color:#f87171;padding:4px 0}
  .agc-title{font-weight:800;letter-spacing:1.2px;color:#fcd34d;font-size:15px}
  .agc-acro{color:#8b95ad;font-size:10.5px;line-height:1.35;margin-top:1px}
  .aglabel,.agc-title,.agpick-main,.agc-pet-name{font-family:"Avenir Next Condensed","Futura","Bahnschrift SemiCondensed","Bahnschrift","Ubuntu Condensed","DejaVu Sans Condensed","Liberation Sans Narrow","Arial Narrow",sans-serif;font-style:italic}
  .aglabel{font-weight:800;letter-spacing:.12em}
  .agnum,.agc-stats b{font-family:ui-monospace,"SF Mono",Menlo,"Cascadia Mono",Consolas,"DejaVu Sans Mono","Liberation Mono",monospace;font-size:12px}
  .agpick-tag{font:800 italic 11px/1 "Avenir Next Condensed","Futura","Bahnschrift SemiCondensed","Bahnschrift","Ubuntu Condensed","DejaVu Sans Condensed","Liberation Sans Narrow","Arial Narrow",sans-serif;letter-spacing:.14em;padding:5px 7px;
    border-radius:4px;background:rgba(255,255,255,.08);color:#e6e9ef;align-self:flex-start;margin-top:3px;white-space:nowrap}
  .agpick-move .agpick-tag{background:#14532d;color:#86efac}
  .agpick-switch .agpick-tag{background:#7f1d1d;color:#fecaca}
  .agpick-setup .agpick-tag{background:#1e3a8a;color:#bfdbfe}
  .agc-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
  .agc-stats div{background:#1a1f2b;border:1px solid #262c3a;border-radius:8px;padding:8px 6px;text-align:center}
  .agc-stats b{display:block;font-size:18px;color:#fcd34d}
  .agc-stats span{font-size:10.5px;color:#8b95ad;line-height:1.2;display:block}
  .agc-loss{border:1px solid #262c3a;border-radius:8px;margin-bottom:6px;background:#161a24}
  .agc-loss summary{list-style:none;cursor:pointer;padding:8px 10px;display:flex;flex-wrap:wrap;gap:6px;align-items:baseline}
  .agc-loss summary::-webkit-details-marker{display:none}
  .agc-loss summary .agsub{flex-basis:100%;margin:0}
  .agc-loss[open] summary{border-bottom:1px solid #262c3a}
  .agc-lossdate{color:#6b7488;font-size:11px;font-variant-numeric:tabular-nums}
  .agc-lossbody{padding:6px 10px 10px}
  .agc-btns{display:flex;gap:8px;margin-top:14px}
  .agc-btn{all:unset;cursor:pointer;font-size:12px;font-weight:700;padding:7px 11px;border-radius:7px;
    background:#1f2533;color:#d7dce6;border:1px solid #2f3a55}
  .agc-btn:hover{background:#273046}
  .agc-btn.danger{color:#fca5a5;border-color:#5a2a2e}
  .agc-wait{color:#8b95ad;padding:8px 0}
  `;

  const TYPE_COLORS = {
    Normal: '#9a9a6e', Fire: '#ee8130', Water: '#6390f0', Electric: '#d9b41c', Grass: '#5fae3a',
    Ice: '#5fbfba', Fighting: '#c22e28', Poison: '#a33ea1', Ground: '#c9a24a', Flying: '#8b74e8',
    Psychic: '#f95587', Bug: '#8ea11a', Rock: '#a8932f', Ghost: '#735797', Dragon: '#6f35fc',
    Dark: '#705746', Steel: '#8f8fb0', Fairy: '#d685ad', Stellar: '#40b5a5'
  };

  function pct(n) { return (n === undefined || n === null) ? '?' : n.toFixed(0); }
  function esc(s) {
    return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  const sec = (label, inner) =>
    `<div class="agsec"><div class="aglabel">${label}</div>${inner}</div>`;

  function icon(name) {
    const D = window.Dex;
    if (!D || typeof D.getPokemonIcon !== 'function') return '';
    try { return `<span class="agc-ico" style="${esc(D.getPokemonIcon(name))}"></span>`; } catch (e) { return ''; }
  }
  function typeChip(t) {
    if (!t) return '';
    return `<span class="agc-type" style="background:${TYPE_COLORS[t] || '#555'}">${esc(t)}</span>`;
  }
  function effChip(eff) {
    if (!eff || eff === 1) return '';
    if (eff > 1) return `<span class="agc-eff up">x${eff}</span>`;
    return `<span class="agc-eff down">x${eff === 0.5 ? '&frac12;' : eff === 0.25 ? '&frac14;' : eff}</span>`;
  }
  const BOOST_LABEL = { atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Vit', accuracy: 'Prec', evasion: 'Esq' };
  function boostChips(b) {
    const parts = Object.keys(BOOST_LABEL).filter((k) => b && b[k]).map((k) =>
      `<span class="agc-boost ${b[k] > 0 ? 'up' : 'down'}">${b[k] > 0 ? '+' : ''}${b[k]} ${BOOST_LABEL[k]}</span>`);
    return parts.length ? `<div class="agc-boosts">${parts.join('')}</div>` : '';
  }

  function hpColor(p) { return p > 50 ? '#4ade80' : p > 20 ? '#fbbf24' : '#f87171'; }
  function hpBar(p) {
    const v = Math.max(0, Math.min(100, p || 0));
    return `<div class="agc-hp"><i style="width:${v}%;background:${hpColor(v)}"></i></div>`;
  }
  /* lo..hi damage on a 0-100% max-HP scale, white mark = HP the target has left. */
  function dmgBar(lo, hi, left, color) {
    const a = Math.max(0, Math.min(100, lo || 0)), b = Math.max(0, Math.min(100, hi || 0));
    const m = Math.max(0, Math.min(100, left || 0));
    return `<div class="agc-bar"><span class="hi" style="width:${b}%;background:${color}"></span>`
      + `<span class="lo" style="width:${a}%;background:${color}"></span>`
      + `<span class="mark" style="left:calc(${m}% - 1px)"></span></div>`;
  }

  function teampreviewHTML(data) {
    if (data.error) return `<div class="agc-wait">${esc(data.error)}</div>`;
    const n = data.rows[0].n;
    let h = `<div class="agc-herotext"><div class="agc-mon">Teampreview</div>
      <div class="agsub">${data.foeNames.map((f) => icon(f) + esc(f)).join(' ')}</div></div>`;

    let leads = '';
    data.rows.slice(0, 3).forEach((r, i) => {
      const bits = [`outspeeds ${r.faster}/${n}`];
      if (r.threatens) bits.push(`can OHKO ${r.threatens}`);
      bits.push(r.threatened ? `<span style="color:#f87171">OHKO'd by ${r.threatened}</span>` : 'no OHKO taken');
      if (r.immuneTo.length) bits.push(`walls ${r.immuneTo.map(esc).join(', ')}`);
      leads += `<div class="agc-row"><div class="agc-rowtop">
          <span class="agc-rank${i === 0 ? ' top' : ''}">#${i + 1}</span>${icon(r.name)}
          <span class="agname">${esc(r.name)}</span>
          ${i === 0 ? '<span class="agc-pill ko">LEAD</span>' : ''}</div>
        <div class="agsub">${bits.join(' · ')}</div></div>`;
    });
    h += sec('Leads', leads);

    if (data.lead) {
      h += sec('Suggested lead', `<div class="agpick agpick-move"><div class="agpick-tag">LEAD</div>
        <div><div class="agpick-main">${icon(data.lead.name)}${esc(data.lead.name)}</div>
        <div class="agpick-why">${esc(data.lead.why)}</div></div></div>`);
    }
    if (data.profile) h += `<div class="agsub" style="margin-top:6px">Team recognised: ${esc(data.profile.name)}. ${esc(data.profile.plan.early)}</div>`;
    for (const w of (data.warnings || [])) h += sec('Watch out', `<div class="agrisk bad">${esc(w)}</div>`);

    const worst = data.rows[data.rows.length - 1];
    if (data.rows.length > 3 && worst.threatened) {
      h += sec('Don\'t lead with',
        `<div class="agrisk bad">${esc(worst.name)}: OHKO'd by ${worst.threatened} of their ${n}</div>`);
    }
    h += `<div class="agfoot">Before turn one only species are visible: these numbers come from types and speeds.</div>`;
    return h;
  }

  const TAG = { move: 'ATTACK', switch: 'SWITCH', setup: 'BOOST' };

  function renderHTML(data) {
    if (data.mode === 'teampreview') return teampreviewHTML(data);
    if (data.error && !data.foe) return `<div class="agc-wait">${esc(data.error)}</div>`;

    const me = data.me, foe = data.foe;
    let h = '';

    // Matchup header: icons + HP bars
    h += `<div class="agc-vs">
      <div class="agc-side">
        <div class="agc-mon">${me ? icon(me.name) + esc(me.name) : '<span class="dim">fainted, switch</span>'}</div>
        ${me ? hpBar(me.hpPct) + `<div class="agc-hptxt">you ${pct(me.hpPct)}%</div>` + boostChips(me.boosts) : ''}
      </div>
      <div class="agc-vsdot">VS</div>
      <div class="agc-side foe">
        <div class="agc-mon">${foe.transformed ? `<span class="dim">${esc(foe.name)} &rarr;</span> ${esc(foe.transformed)}` : esc(foe.name)}${icon(foe.transformed || foe.name)}</div>
        ${hpBar(foe.hpPct)}<div class="agc-hptxt">them ${pct(foe.hpPct)}%${data.field.weather ? ' · ' + esc(data.field.weather) : ''}</div>${boostChips(foe.boosts)}
      </div></div>`;

    // What the tool would do
    const v = data.verdict;
    if (v) {
      h += sec('In your shoes', `<div class="agpick agpick-${v.kind}">
        <div class="agpick-tag">${TAG[v.kind] || ''}</div>
        <div><div class="agpick-main">${esc(v.text)}${v.tera ? ` <span class="agc-pill safe">+ Tera ${esc(v.tera)}</span>` : ''}</div>
        <div class="agpick-why">${esc(v.why)}</div>
        ${data.tera ? `<div class="agpick-why" style="margin-top:4px">${esc(data.tera.why)}</div>` : ''}</div></div>`);
    }

    // Team plan (recognised profile) and end-of-game outlook
    if (data.profile || data.endgame) {
      let pl = '';
      if (data.plan && data.plan.job) pl += `<div class="agrisk"><b>${esc(data.plan.name)}</b> : ${esc(data.plan.job)}</div>`;
      if (data.plan && data.plan.text) pl += `<div class="agrisk">${esc(data.plan.text)}</div>`;
      if (data.endgame) pl += `<div class="agrisk${data.endgame.clean ? '' : ' bad'}"><b>Endgame</b>: ${esc(data.endgame.text)}</div>`;
      const hzMine = data.myHazards || {}, hzFoe = (data.foeHazards || {});
      const hzTxt = (sc) => [sc.stealthrock ? 'SR' : '', sc.spikes ? `Spikes x${sc.spikes[1] || 1}` : '', sc.toxicspikes ? 'T-Spikes' : '', sc.stickyweb ? 'Web' : ''].filter(Boolean).join(' + ') || 'none';
      pl += `<div class="agsub">Hazards: their side ${esc(hzTxt(hzFoe))} · your side ${esc(hzTxt(hzMine))}</div>`;
      h += sec('Game plan', pl);
    }

    // Best moves
    if (!data.forced) {
      const dmg = data.moves.filter((m) => m.kind === 'damage');
      const other = data.moves.filter((m) => m.kind !== 'damage');
      let mv = '';
      // Against his most dangerous attack: priority first, then speed (Trick Room included).
      const vs = (data.threats || []).find((t) => t.kind === 'damage');
      const tie = data.speed && data.speed.foeWorst === data.speed.mine;
      const order = (m) => {
        if (!data.speed || !vs) return '';
        const a = m.priority || 0, b = vs.priority || 0;
        if (a === b && tie) return ' <span class="agc-pill maybe">50/50</span>';
        const first = a > b || (a === b && data.speed.faster);
        return first ? ' <span class="agc-pill safe">moves first</span>' : ' <span class="agc-pill maybe">moves second</span>';
      };
      dmg.slice(0, 3).forEach((m, i) => {
        const pill = m.koGuaranteed ? '<span class="agc-pill ko">KO</span>'
          : m.koPossible ? `<span class="agc-pill maybe">KO ?${m.sash ? ' ' + esc(m.sash) : ''}</span>`
          : m.sash ? `<span class="agc-pill safe">${esc(m.sash)}</span>` : '';
        const pri = m.priority > 0 ? ` <span class="dim">prio +${m.priority}</span>` : '';
        const color = m.koGuaranteed ? '#4ade80' : m.koPossible ? '#fbbf24' : '#60a5fa';
        mv += `<div class="agc-row"><div class="agc-rowtop">
            <span class="agc-rank${i === 0 ? ' top' : ''}">${i + 1}</span>${typeChip(m.type)}
            <span class="agname">${esc(m.name)}${pri}</span>${effChip(m.eff)}
            <span class="agnum">${pct(m.lo)}-${pct(m.hi)}%</span>${pill}${order(m)}</div>
          ${dmgBar(m.lo, m.hi, foe.hpPct, color)}</div>`;
      });
      const immune = other.filter((m) => m.kind === 'immune').map((m) => esc(m.name));
      if (immune.length) mv += `<div class="agsub">Useless here: ${immune.join(', ')} (immune)</div>`;
      if (!mv) mv = '<div class="dim">No readable moves.</div>';
      h += sec('Your moves', mv);
    }

    // Risks
    let risks = '';
    for (const t of data.threats.filter((x) => x.kind === 'damage').slice(0, 2)) {
      const pill = t.killsGuaranteed ? '<span class="agc-pill bad">KILLS YOU</span>'
        : t.kills ? '<span class="agc-pill maybe">CAN KILL</span>' : '';
      risks += `<div class="agc-row"><div class="agc-rowtop">${typeChip(t.type)}
          <span class="agname">${esc(t.name)}</span>${effChip(t.eff)}
          <span class="agnum">${pct(t.lo)}-${pct(t.hi)}%</span>${pill}</div>
        ${me ? dmgBar(t.lo, t.hi, me.hpPct, t.kills ? '#f87171' : '#a78bfa') : ''}</div>`;
    }
    if (data.speed && data.speed.foeWorst === data.speed.mine) {
      risks += `<div class="agrisk">Possible speed tie (${data.speed.mine}): 50/50 on who moves first</div>`;
    } else if (data.speed && !data.speed.faster) {
      const prioMove = (data.moves || []).find((m) => m.kind === 'damage' && m.priority > 0);
      const tr = data.speed.trickroom ? ', Trick Room' : '';
      risks += `<div class="agrisk">It may move before you (${data.speed.foeWorst} max vs ${data.speed.mine}${tr})`
        + (prioMove ? `, except against ${esc(prioMove.name)} (priority)` : '') + '</div>';
    } else if (data.speed && data.speed.trickroom) {
      risks += `<div class="agrisk">Trick Room: the slower one moves first, that's you.</div>`;
    }
    if (data.batonPass && data.batonPass.length) {
      risks += `<div class="agrisk bad"><b>Baton Pass team</b> (${data.batonPass.map(esc).join(', ')}): its boosts will be passed on.
        Phaze (Whirlwind, Roar) or Haze as soon as something is boosted, Taunt to stop the setup.</div>`;
    }
    if (data.evasion) {
      risks += `<div class="agrisk bad"><b>Evasion +${data.evasion.stage}</b>: your 100% moves only hit about ${data.evasion.hit}% of the time.
        Whirlwind, Roar, Haze and never-miss moves still land.</div>`;
    }
    if (data.sleepRisk) {
      const z = data.sleepRisk;
      let t = `<b>${esc(z.move)}</b> : `;
      if (z.clause) t += `${esc(z.sleeper)} is already asleep, Sleep Clause protects the others. Keep it asleep in play or on the bench rather than sacrificing it.`;
      else if (z.terrainBlocks) t += 'the current terrain prevents sleep for grounded Pokémon.';
      else {
        t += z.immune.length ? `immune on your team: ${z.immune.map(esc).join(', ')}. ` : 'none of your Pokémon is immune to it. ';
        t += z.clauseRule ? 'Sleep Clause: only one of your Pokémon can be asleep at a time.' : 'No Sleep Clause in this format: it can put your whole team to sleep.';
      }
      risks += `<div class="agrisk${z.clause ? '' : ' bad'}">${t}</div>`;
    }
    if (data.setupRisk) {
      risks += `<div class="agrisk bad"><b>Setup</b> : ${esc(data.setupRisk.summary)}.`
        + (data.setupRisk.counter ? ` <span class="dim">Counter: ${esc(data.setupRisk.counter.name)}</span>` : '') + `</div>`;
    }
    if (data.wallRisk && data.wallRisk.counter) {
      risks += `<div class="agrisk bad"><b>Walling up</b>: ${esc(data.wallRisk.summary)}.`
        + ` <span class="dim">Counter: ${esc(data.wallRisk.counter.name)}</span></div>`;
    }
    for (const a of (data.advice || []).filter((x) => x.level === 'warn' && x.rule !== 'anti-setup')) {
      risks += `<div class="agrisk">${esc(a.text)}</div>`;
    }
    if (data.threatsGuessed) {
      risks += `<div class="agrisk">No move seen: its threats are estimated</div>`;
    }
    if (risks) h += sec('Dangers', risks);

    // Switches: top 3 with a reason
    if (data.switches.length) {
      let sw = '';
      data.switches.slice(0, 3).forEach((s, i) => {
        const pill = s.immune ? '<span class="agc-pill safe">IMMUNE</span>'
          : s.dies ? '<span class="agc-pill bad">DIES</span>'
          : `<span class="agnum">${pct(s.lo)}-${pct(s.hi)}%</span>`;
        sw += `<div class="agc-row"><div class="agc-rowtop">
            <span class="agc-rank${i === 0 ? ' top' : ''}">#${i + 1}</span>${icon(s.name)}
            <span class="agname">${esc(s.name)} <span class="dim">${pct(s.hpPct)}%</span></span>${pill}</div>
          <div class="agsub">${esc(s.why)}</div></div>`;
      });
      h += sec(data.forced ? 'Who to send in' : 'Switches', sw);
    }

    h += `<div class="agfoot">Estimated numbers: we know neither its EVs nor its item. Bar: solid = min, light = max, line = HP left.</div>`;
    return h;
  }

  /* ------------------------------------------------------------------ */
  /* Loss log view                                                       */
  /* ------------------------------------------------------------------ */

  const KIND_LABEL = {
    mvp: 'One enemy Pokémon swept everything', ignored: 'Advice ignored right before a KO',
    speed: 'Outsped', hazards: 'Hazards on your side', luck: 'Bad luck (crits, misses)',
    residual: 'Worn down', set: 'Unexpected enemy set', matchup: 'Bad team matchup',
    close: 'Close loss', forfeit: 'Forfeit', timer: 'Timer', unknown: 'Nothing clear'
  };

  let histCache = null, dataIndex = null;
  function loadHistory() {
    if (!window.AG_HISTORY) { histCache = []; dataIndex = []; return; }
    window.AG_HISTORY.store.all().then((r) => { histCache = r; }).catch(() => { histCache = []; });
    window.AG_HISTORY.battles.index().then((r) => { dataIndex = r; }).catch(() => { dataIndex = []; });
  }

  function datasetHTML(index) {
    if (!index) return '';
    const w = index.filter((b) => b.result === 'win').length;
    const l = index.filter((b) => b.result === 'lose').length;
    return sec('Data for Mahoraga', `<div class="agsub" style="margin-bottom:8px">${index.length} full battles
        recorded (${w} wins, ${l} losses): log, teams, and at every decision what I saw,
        what I suggested and what you played.</div>
      <div class="agc-btns" style="margin-top:0"><button class="agc-btn" data-act="export-dataset">Export dataset (JSONL)</button>
      <button class="agc-btn danger" data-act="clear-dataset">Clear</button></div>
      <div class="agfoot" style="margin-top:6px">Analysis: <code>node mahoraga.js pachirisu-dataset.jsonl</code></div>`);
  }

  function fmtDate(iso) {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' })
        + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    } catch (e) { return ''; }
  }

  function historyHTML(recs, index) {
    if (!recs) return '<div class="agc-wait">Opening the log...</div>';
    if (!recs.length) {
      return sec('Loss log', '<div class="agc-wait">No loss recorded. Long may it last.</div>')
        + '<div class="agfoot">Every lost battle will be logged here with the likely reasons.</div>'
        + datasetHTML(index);
    }
    let h = '';

    // Stats
    const judged = recs.reduce((n, r) => n + ((r.advice && r.advice.judged) || 0), 0);
    const followed = recs.reduce((n, r) => n + ((r.advice && r.advice.followed) || 0), 0);
    const costly = recs.reduce((n, r) => n + ((r.advice && r.advice.costly) || 0), 0);
    h += `<div class="agc-stats">
      <div><b>${recs.length}</b><span>losses</span></div>
      <div><b>${judged ? Math.round(100 * followed / judged) + '%' : '-'}</b><span>advice followed</span></div>
      <div><b>${costly}</b><span>advice ignored, then KO</span></div></div>`;

    // Who beats you
    const killers = {};
    for (const r of recs) for (const k of (r.killers || [])) killers[k.species] = (killers[k.species] || 0) + k.n;
    const topK = Object.keys(killers).sort((a, b) => killers[b] - killers[a]).slice(0, 3);
    if (topK.length) {
      h += sec('Your nemeses', topK.map((k, i) => `<div class="agc-row"><div class="agc-rowtop">
        <span class="agc-rank${i === 0 ? ' top' : ''}">#${i + 1}</span>${icon(k)}
        <span class="agname">${esc(k)}</span><span class="agnum">${killers[k]} KO</span></div></div>`).join(''));
    }

    // Recurring reasons
    const kinds = {};
    for (const r of recs) for (const k of new Set((r.reasons || []).map((x) => x.kind))) kinds[k] = (kinds[k] || 0) + 1;
    const topR = Object.keys(kinds).sort((a, b) => kinds[b] - kinds[a]).slice(0, 4);
    h += sec('What keeps coming back', topR.map((k) =>
      `<div class="agrisk${k === 'ignored' || k === 'mvp' ? ' bad' : ''}">${esc(KIND_LABEL[k] || k)}
        <span class="dim">· ${kinds[k]}/${recs.length}</span></div>`).join(''));

    // Each loss
    let list = '';
    for (const r of recs.slice(0, 25)) {
      const top = (r.reasons || [])[0];
      list += `<details class="agc-loss"><summary>
          <span class="agc-lossdate">${esc(fmtDate(r.date))}</span>
          <span class="agname">vs ${esc(r.opponent)}</span>
          <span class="agnum">${r.turns || '?'} turns</span>
          <div class="agsub">${esc(top ? KIND_LABEL[top.kind] || top.kind : '')} · ${esc(r.format || '')}</div>
        </summary>
        <div class="agc-lossbody">
          ${(r.reasons || []).slice(0, 5).map((x) => `<div class="agrisk${x.weight >= 70 ? ' bad' : ''}">${esc(x.text)}</div>`).join('')}
          ${(r.kos || []).length ? `<div class="agsub" style="margin-top:6px">KO : ${r.kos.map((k) => `T${k.turn} ${esc(k.species)} &larr; ${esc(k.by)}`).join(' · ')}</div>` : ''}
          <div class="agsub">Your team: ${(r.myTeam || []).map(esc).join(', ') || '?'}</div>
          <div class="agsub">Theirs: ${(r.foeTeam || []).map(esc).join(', ') || '?'}${r.foeLeft ? ` (${r.foeLeft} still standing)` : ''}</div>
        </div></details>`;
    }
    h += sec('Latest losses', list);

    h += `<div class="agc-btns"><button class="agc-btn" data-act="export">Export log (JSON)</button>
      <button class="agc-btn danger" data-act="clear">Clear log</button></div>`;
    h += datasetHTML(index);
    return h;
  }

  function wireHistoryButtons(body) {
    body.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b || !window.AG_HISTORY) return;
      const download = (name, text, type) => {
        const url = URL.createObjectURL(new Blob([text], { type }));
        const a = document.createElement('a');
        a.href = url; a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      };
      if (b.dataset.act === 'export-dataset') {
        window.AG_HISTORY.battles.all().then((recs) =>
          download('pachirisu-dataset.jsonl', recs.map((r) => JSON.stringify(r)).join('\n') + '\n', 'application/x-ndjson'));
        return;
      }
      if (b.dataset.act === 'clear-dataset') {
        // eslint-disable-next-line no-alert
        if (window.confirm('Clear the whole battle dataset? This cannot be undone (export it first).')) {
          window.AG_HISTORY.battles.clear().then(loadHistory);
        }
        return;
      }
      if (b.dataset.act === 'export') {
        window.AG_HISTORY.store.all().then((recs) => {
          const url = URL.createObjectURL(new Blob([JSON.stringify(recs, null, 2)], { type: 'application/json' }));
          const a = document.createElement('a');
          a.href = url; a.download = 'pachirisu-losses.json';
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 2000);
        });
      } else if (b.dataset.act === 'clear') {
        // eslint-disable-next-line no-alert
        if (window.confirm('Clear the whole loss log? This cannot be undone.')) {
          window.AG_HISTORY.store.clear().then(loadHistory);
        }
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* Mounting: a tab docked over the battle chat column, or a floating   */
  /* panel when that column isn't visible (small layouts).               */
  /* Only our own nodes are added; Showdown's elements are never touched. */
  /* ------------------------------------------------------------------ */

  const TAB_KEY = 'agc.tab';
  let activeTab = 'copilot';
  try { activeTab = localStorage.getItem(TAB_KEY) || 'copilot'; } catch (e) { /* private mode */ }

  let styleMounted = false;
  function mountStyle() {
    if (styleMounted || document.getElementById('agc-style')) { styleMounted = true; return; }
    const style = document.createElement('style');
    style.id = 'agc-style';
    style.textContent = CSS;
    document.head.appendChild(style);
    styleMounted = true;
  }

  function makePanelInner(panel) {
    panel.innerHTML = `<div class="agc-scroll">
        <div class="agc-hero">
          <div class="agc-herotext"><div class="agc-title">P.A.C.H.I.R.I.S.U.</div>
          <div class="agc-acro" title="Display only, never plays">Pocket Assistant for Combat, Hyper-Intelligent,
            Rodent: Insolent, Sarcastic, yet Useful</div></div></div>
        <div class="agc-body"><div class="agc-wait">Waiting for a battle...</div></div>
      </div>`;
    return {
      body: panel.querySelector('.agc-body')
    };
  }

  let floating = null;
  function getFloating() {
    if (floating) return floating;
    const el = document.createElement('div');
    el.id = 'agcopilot';
    el.className = 'agc-panel';
    const head = document.createElement('div');
    head.className = 'agc-head';
    head.innerHTML = '<span class="agc-title">P.A.C.H.I.R.I.S.U.</span>'
      + '<span><span class="agc-toggle agc-histbtn" title="Loss log">log</span>'
      + '<span class="agc-toggle agc-min">&minus;</span></span>';
    const inner = document.createElement('div');
    el.append(head, inner);
    const parts = makePanelInner(inner);
    document.body.appendChild(el);

    head.querySelector('.agc-histbtn').addEventListener('click', (e) => {
      e.stopPropagation();
      setTab(activeTab === 'history' ? 'copilot' : 'history');
    });
    head.querySelector('.agc-min').addEventListener('click', (e) => {
      e.stopPropagation();
      el.classList.toggle('collapsed');
      e.target.innerHTML = el.classList.contains('collapsed') ? '+' : '&minus;';
    });
    let dragging = false, ox = 0, oy = 0;
    head.addEventListener('mousedown', (e) => {
      dragging = true;
      const r = el.getBoundingClientRect();
      ox = e.clientX - r.left; oy = e.clientY - r.top;
      e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      el.style.left = (e.clientX - ox) + 'px';
      el.style.top = (e.clientY - oy) + 'px';
      el.style.right = 'auto';
    });
    document.addEventListener('mouseup', () => { dragging = false; });

    floating = Object.assign({ el, lastHTML: null }, parts);
    wireHistoryButtons(floating.body);
    return floating;
  }

  const docks = new WeakMap(); // room element -> dock
  const liveDocks = new Set();
  function roomElement(room) {
    return room.el || (room.$el && room.$el[0]) || null;
  }

  function setTab(t) {
    activeTab = t;
    try { localStorage.setItem(TAB_KEY, activeTab); } catch (err) { /* ignore */ }
    if (t === 'history') loadHistory();
    for (const d of liveDocks) applyTab(d);
  }

  function applyTab(d) {
    d.panel.classList.toggle('agc-off', activeTab === 'chat');
    d.tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.tab === activeTab));
  }

  function getDock(rEl) {
    let d = docks.get(rEl);
    if (d) return d;
    const wrap = document.createElement('div');
    wrap.className = 'agc-dockwrap';
    const panel = document.createElement('div');
    panel.className = 'agc-panel agc-dockpanel';
    const tabs = document.createElement('div');
    tabs.className = 'agc-tabs';
    tabs.innerHTML = '<button data-tab="chat">Chat</button>'
      + '<button data-tab="copilot">Battle</button>'
      + '<button data-tab="history">Log</button>';
    wrap.append(panel, tabs);
    rEl.appendChild(wrap);
    d = Object.assign({ wrap, panel, tabs, lastHTML: null }, makePanelInner(panel));
    tabs.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b) setTab(b.dataset.tab);
    });
    wireHistoryButtons(d.body);
    applyTab(d);
    docks.set(rEl, d);
    liveDocks.add(d);
    return d;
  }

  /* Copy the chat column's box. False if it isn't visible (small layout). */
  function layoutDock(d, rEl) {
    const log = rEl.querySelector('.battle-log');
    if (!log || log.offsetWidth < 220 || log.offsetHeight < 160) {
      d.wrap.style.display = 'none';
      return false;
    }
    d.wrap.style.display = '';
    const s = d.panel.style;
    s.left = log.offsetLeft + 'px';
    s.top = log.offsetTop + 'px';
    s.width = log.offsetWidth + 'px';
    s.height = log.offsetHeight + 'px';
    d.tabs.style.top = (log.offsetTop + 8) + 'px';
    d.tabs.style.right = Math.max(0, rEl.clientWidth - log.offsetLeft - log.offsetWidth + 22) + 'px';
    applyTab(d);
    return true;
  }

  let mascot = null;
  const endedSeen = new WeakSet(); // rooms whose end we already reacted to
  function getMascot() {
    if (!mascot && window.AG_MASCOT) mascot = window.AG_MASCOT.create();
    return mascot;
  }

  function paint(target, data) {
    const html = activeTab === 'history' ? historyHTML(histCache, dataIndex) : renderHTML(data);
    if (html !== target.lastHTML) { target.body.innerHTML = html; target.lastHTML = html; }
  }

  function render(data) {
    const f = getFloating();
    paint(f, data);
  }

  /* ------------------------------------------------------------------ */
  /* Loop                                                                */
  /* ------------------------------------------------------------------ */

  function tick() {
    let target = null;
    try {
      recordAllBattles();
      const room = getRoom();
      if (!room) {
        if (floating) floating.el.style.display = 'none';
        if (mascot) mascot.show(false);
        if (window.AG_MUSIC) window.AG_MUSIC.update({ current: false });
        return;
      }
      mountStyle();
      const isCurrent = room && window.app && window.app.curRoom === room;
      const rEl = room && roomElement(room);

      if (rEl && isCurrent) {
        const d = getDock(rEl);
        if (layoutDock(d, rEl)) target = d;
      }
      const f = getFloating();
      if (!target && isCurrent) target = f;
      f.el.style.display = (target === f) ? '' : 'none';
      if (mascot) mascot.show(!!isCurrent);
      if (window.AG_MUSIC) {
        try {
          window.AG_MUSIC.update({
            roomId: room.id, current: !!isCurrent,
            player: !!(room.request && room.request.side),
            ended: !!(room.battle && room.battle.ended),
            turn: (room.battle && room.battle.turn) || 0
          });
        } catch (e) { report('musique', e); }
      }
      if (!target) return;

      // JoJo cinematics first, so a big moment can hold back the Mahoraga wheel.
      if (window.AG_CINE && room.battle) {
        try {
          const sd = sides(room.battle);
          // Only worked out when a cinematic needs it (our second-to-last mon just fell).
          window.AG_CINE.update(room.id || 'room', room.battle, sd.mine, sd.foe, { get soloWin() { return soloWin(room); } });
        } catch (e) { report('cinematique', e); }
      }

      // Pachirisu first, on its own: a bug in the analysis or the loss log
      // must never stop it (or the Mahoraga wheel) from reacting.
      const m = getMascot();
      if (m && room.battle) {
        try {
          const { mine, foe } = sides(room.battle);
          m.update(room.id || 'room', room.battle, mine, foe);
        } catch (e) { report('mascotte', e); }
      }

      let data;
      try { data = analyze(); } catch (e) {
        report('analyse', e);
        data = { error: 'Analysis error: ' + e.message };
      }

      if (window.AG_HISTORY) {
        // The room on screen also feeds this tick's decision (what the tool showed).
        try { window.AG_HISTORY.onTick(room, data); } catch (e) { report('carnet', e); }
        if (room.battle && room.battle.ended && !endedSeen.has(room)) { endedSeen.add(room); setTimeout(loadHistory, 500); }
      }
      paint(target, data);
    } catch (err) {
      if (target && target.body) target.body.innerHTML = `<div class="agerr">Error: ${esc(err.message)}</div>`;
      report('affichage', err);
    }
  }

  /* Every open battle gets its end-of-game save, even the ones not on screen
   * (a game that ends while you look at the lobby still counts). */
  function recordAllBattles() {
    const H = window.AG_HISTORY;
    const rooms = window.app && window.app.rooms;
    if (!H || !rooms) return;
    for (const id of Object.keys(rooms)) {
      const r = rooms[id];
      if (!r || !r.battle || r === window.app.curRoom) continue;
      try { H.onTick(r, null); } catch (e) { report('carnet', e); }
    }
  }

  /* Errors are logged once each and kept for PACHIRISU.diag(). */
  const VERSION = '1.16.0';
  const lastErrors = [];
  function report(where, e) {
    const msg = `${where}: ${(e && e.message) || e}`;
    if (lastErrors.some((x) => x.msg === msg)) return;
    lastErrors.push({ at: new Date().toISOString(), msg, stack: e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : '' });
    if (lastErrors.length > 10) lastErrors.shift();
    // eslint-disable-next-line no-console
    console.error('[P.A.C.H.I.R.I.S.U.] ' + where, e);
  }

  function boot() {
    if (!document.body) return setTimeout(boot, 300);
    if (window.AG_HISTORY) {
      window.AG_HISTORY.onSaved((rec) => {
        loadHistory();
        const m = getMascot();
        if (m && m.say) m.say('Logged: ' + (rec.reasons[0] ? KIND_LABEL[rec.reasons[0].kind] || 'loss' : 'loss').toLowerCase() + '.');
        // Second trigger for the defeat wheel, in case the live detection missed it.
        if (window.AG_MASCOT && window.AG_MASCOT.spinFor) window.AG_MASCOT.spinFor(rec.id + ':end');
      });
    }
    if (activeTab === 'history') loadHistory();
    // Every cinematic gets a matching Pachirisu reaction.
    if (window.AG_CINE && window.AG_CINE.onPlay) {
      window.AG_CINE.onPlay((key) => { const m = getMascot(); if (m && m.react) m.react(key); });
    }
    setInterval(tick, 900);
    tick();
  }

  // Exposed so you can sanity-check a number by hand from the console.
  window.__AG_COPILOT_DEBUG__ = {
    calcDamage, guessFromSets, soloWin, typeMult, statAt, hpAt, statAt100, hpAt100, speedOf, analyze, renderHTML, historyHTML
  };
  window.PACHIRISU = {
    version: VERSION,
    defaites: () => (window.AG_HISTORY ? window.AG_HISTORY.store.all() : Promise.resolve([])),
    /* Fait tourner la roue tout de suite: si rien n'apparait, l'extension n'est pas a jour. */
    roue: () => { if (window.AG_MASCOT) window.AG_MASCOT.spinWheel(); return 'wheel spun'; },
    /* PACHIRISU.musique() -> etat ; musique(0.5) -> volume ; musique(false) / musique(true) -> couper / remettre */
    musique: (v) => {
      const M = window.AG_MUSIC;
      if (!M) return 'music module missing';
      if (typeof v === 'number') M.setVolume(v);
      else if (typeof v === 'boolean') M.setMuted(!v);
      return M.state();
    },
    /* Ce que voit P.A.C.H.I.R.I.S.U. en ce moment, pour comprendre un bug. */
    diag: () => {
      const room = getRoom();
      const b = room && room.battle;
      const sd = b ? sides(b) : {};
      const ko = (side) => ((side && side.pokemon) || []).filter((p) => p && p.fainted).map((p) => p.speciesForme || p.name);
      return {
        version: VERSION,
        modules: { sets: !!window.AG_INFER, advisor: !!window.AG_ADVISE, mascotte: !!window.AG_MASCOT, carnet: !!window.AG_HISTORY, musique: !!window.AG_MUSIC },
        musique: window.AG_MUSIC ? window.AG_MUSIC.state() : null,
        pont: document.documentElement.dataset.agcBridge === '1',
        salle: room ? room.id : null,
        salleCourante: !!(room && window.app && window.app.curRoom === room),
        joueur: !!(room && room.request && room.request.side),
        combatFini: !!(b && b.ended),
        mesKO: ko(sd.mine), sesKO: ko(sd.foe),
        mascotte: mascot && mascot.state ? mascot.state(room && room.id) : null,
        erreurs: lastErrors.slice()
      };
    },
    debug: window.__AG_COPILOT_DEBUG__
  };

  boot();
})();
