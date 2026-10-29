/* P.A.C.H.I.R.I.S.U. - plan de match.
 *
 * A l'apercu des equipes : son style (Baton Pass, stall, ecrans, Trick Room, meteo,
 * Last Respects, hazards, sommeil, Perish Song) lu dans ses sets probables, ses
 * conditions de victoire (qui chez lui balaye ton equipe, apres un boost s'il en a un)
 * et qui chez toi les arrete.
 * Pendant le combat : les memes calculs sur ce qui reste en vie. Le dernier de tes
 * Pokemon a arreter une menace devient a garder ; celui qui ne bat plus rien de ce
 * qui reste devient sacrifiable.
 * Degats, vitesse et sets viennent de copilot.js (api), rien n'est recalcule ici.
 */
(() => {
  'use strict';

  const id = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  const uniq = (a) => a.filter((x, i) => a.indexOf(x) === i);
  const list = (names) => names.length <= 1 ? (names[0] || '')
    : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];

  const PHAZE = ['whirlwind', 'roar', 'dragontail', 'circlethrow'];
  const HAZE = ['haze', 'clearsmog'];
  // Status answers: his Taunt shuts them off (Dragon Tail / Clear Smog are attacks).
  const TAUNTABLE = ['whirlwind', 'roar', 'haze'];
  const RECOVERY = ['recover', 'roost', 'slackoff', 'softboiled', 'moonlight', 'synthesis', 'morningsun', 'wish',
    'strengthsap', 'shoreup', 'milkdrink', 'rest', 'painsplit'];
  const STALL = ['toxic', 'protect', 'banefulbunker', 'spikyshield', 'kingsshield', 'saltcure', 'leechseed',
    'stockpile', 'toxicspikes', 'infestation', 'willowisp', 'irondefense', 'curse'];
  const SCREENS = ['reflect', 'lightscreen', 'auroraveil'];
  const HAZARDS = ['stealthrock', 'spikes', 'toxicspikes', 'stickyweb'];
  const REMOVAL = ['defog', 'rapidspin', 'courtchange', 'mortalspin', 'tidyup'];
  const SLEEP = ['spore', 'sleeppowder', 'hypnosis', 'darkvoid', 'yawn', 'lovelykiss', 'sing'];
  const SLEEP_PROOF = ['insomnia', 'vitalspirit', 'sweetveil', 'purifyingsalt', 'comatose'];
  const SCREEN_BREAK = ['brickbreak', 'psychicfangs', 'ravagingbull', 'defog'];
  const FIXED = ['ruination', 'superfang', 'naturesmadness', 'seismictoss', 'nightshade'];
  const HALF = ['ruination', 'superfang', 'naturesmadness'];
  const WEATHER = { drought: 'Sun', desolateland: 'Sun', orichalcumpulse: 'Sun', drizzle: 'Rain',
    primordialsea: 'Rain', sandstream: 'Sand', snowwarning: 'Snow' };

  /* Their mons with what we can expect from them. pool: every move of every set (to
   * spot a style); moves: what was revealed plus the top 4 of each set (to fight with,
   * so a Calyrex isn't assumed to carry all eight of its options at once). */
  function prepFoes(foeTeam, field, api) {
    return foeTeam.map(({ mon, raw }) => {
      const c = api.candidates(mon, raw, field);
      api.guess(mon, c.info);
      const sets = (c.info && c.info.sets) || [];
      const seen = api.seen(raw);
      const likely = sets.length ? uniq(seen.concat(sets.flatMap((st) => st.moves.slice(0, 4)))) : c.moves;
      return {
        mon, raw, moves: likely,
        pool: new Set(c.moves.map(id)),
        likely: new Set(likely.map(id)),
        abilities: new Set([id(mon.ability)].concat(sets.map((s) => id(s.ability))).filter(Boolean)),
        items: new Set([id(mon.item)].concat(sets.map((s) => id(s.item))).filter(Boolean))
      };
    });
  }

  /* ---- 1. His style, read from the sets ---- */
  function styles(foes, mine, ctx) {
    const out = [];
    const who = (ids) => foes.filter((f) => ids.some((x) => f.pool.has(x))).map((f) => f.mon.name);
    const mineWith = (ids) => mine.filter((m) => (m.moves || []).some((x) => ids.includes(id(x)))).map((m) => m.name);
    const unaware = mine.filter((m) => id(m.ability) === 'unaware').map((m) => m.name);
    const taunters = who(['taunt']);
    const add = (o) => out.push(Object.assign({ answers: [] }, o));

    const passers = who(['batonpass']);
    if (passers.length >= 2) {
      const ans = uniq(mineWith(PHAZE.concat(HAZE)).concat(unaware));
      add({ id: 'batonpass', label: 'Baton Pass', who: passers, answers: ans,
        plan: 'It boosts, then passes the boosts to a sweeper. Phaze or Haze on the first boost, on the passer, before it passes.'
          + (taunters.length ? ` ${list(taunters)} may have Taunt: phaze before it comes in.` : '')
          + (ans.length ? '' : ' You have no phaze and no Haze: hit the passer before it passes.') });
    }

    const walls = foes.filter((f) => RECOVERY.some((x) => f.pool.has(x)) && STALL.some((x) => f.pool.has(x)));
    if (walls.length >= 3) {
      const breakers = mine.filter((m) => Math.max(m.base.atk, m.base.spa) >= 130).map((m) => m.name);
      add({ id: 'stall', label: 'Stall', who: walls.map((f) => f.mon.name),
        answers: uniq(mineWith(['taunt']).concat(mineWith(FIXED), mineWith(PHAZE.concat(HAZE)), unaware, breakers)),
        plan: 'It wears you down and heals. Keep your big attackers healthy, Taunt stops its recovery, fixed damage (Ruination) and Whirlwind get past its defense boosts. Rotate before Toxic, Salt Cure or Leech Seed eat you up.' });
    }

    // One wall that boosts its defenses and heals (Garganacl, Iron Defense + Recover).
    const DEF_SETUP = ['irondefense', 'curse', 'calmmind', 'bulkup', 'stockpile', 'amnesia', 'cosmicpower', 'acidarmor', 'cottonguard'];
    const blinders = foes.filter((f) => RECOVERY.some((x) => f.likely.has(x)) && DEF_SETUP.some((x) => f.likely.has(x)));
    if (blinders.length && !out.some((x) => x.id === 'stall')) {
      add({ id: 'setupwall', label: 'Boosting wall', who: blinders.map((f) => f.mon.name),
        answers: uniq(mineWith(PHAZE.concat(HAZE)).concat(mineWith(FIXED), mineWith(['taunt']), unaware)),
        plan: `${list(blinders.map((f) => f.mon.name))} boosts its defenses and heals. Whirlwind or Haze on the first boost, Taunt before, or fixed damage (Ruination) that ignores its boosts. Don't let it stack.` });
    }

    const screeners = foes.filter((f) => SCREENS.filter((x) => f.pool.has(x)).length >= 2 || f.items.has('lightclay'));
    if (screeners.length) {
      add({ id: 'screens', label: 'Screens', who: screeners.map((f) => f.mon.name),
        answers: uniq(mineWith(SCREEN_BREAK).concat(mineWith(PHAZE.concat(HAZE)))),
        plan: 'Reflect and Light Screen for 5 turns (8 with Light Clay): don\'t waste your big hits into them, stall the turns out (switch, Protect) and keep something for the sweeper that follows.' });
    }

    const tr = who(['trickroom']);
    const slow = foes.filter((f) => f.mon.base.spe <= 50 && !f.pool.has('trickroom') && id(f.mon.name) !== 'ditto');
    if (tr.length && slow.length >= 2) {
      const mySlow = mine.filter((m) => m.base.spe <= 60).map((m) => m.name);
      add({ id: 'trickroom', label: 'Trick Room', who: tr, answers: mineWith(['taunt']),
        plan: '5 turns where the slower mon moves first. Taunt the setter, or stall the turns out (switch, Protect).'
          + (mySlow.length ? ` ${list(mySlow)} ${mySlow.length > 1 ? 'become' : 'becomes'} fast under it.` : '') });
    }

    for (const f of foes) {
      const w = [...f.abilities].map((a) => WEATHER[a]).find(Boolean);
      if (!w || id(f.mon.name).startsWith('koraidon')) continue;  // Koraidon's sun is AG's default
      const mineW = mine.filter((m) => { const x = WEATHER[id(m.ability)]; return x && x !== w; }).map((m) => m.name);
      const art = 'the';
      add({ id: 'weather', label: w, who: [f.mon.name], answers: mineW,
        plan: `${f.mon.name} sets ${art} ${w.toLowerCase()} on entry.`
          + (mineW.length ? ` ${list(mineW)} replaces it by coming in after.` : ` You have nothing to replace it: go after the setter.`) });
      break;
    }

    const respects = foes.filter((f) => f.pool.has('lastrespects') || f.abilities.has('supremeoverlord')).map((f) => f.mon.name);
    if (respects.length) {
      add({ id: 'lastrespects', label: 'Last Respects', who: respects,
        plan: `${list(respects)} hits harder for every fainted ally: late game it gets huge. Target it early and keep something to stop it.` });
    }

    const setters = who(HAZARDS);
    if (setters.length >= 2) {
      const rem = mineWith(REMOVAL);
      add({ id: 'hazards', label: 'Hazards', who: setters, answers: rem,
        plan: rem.length ? `It stacks hazards: keep ${list(rem)} to clear them.`
          : 'It stacks hazards and you have nothing to clear them: cut needless switches and kill the setters fast.' });
    }

    const sleepers = who(SLEEP);
    if (sleepers.length) {
      const proof = mine.filter((m) => SLEEP_PROOF.includes(id(m.ability)) || (m.types || []).includes('Grass')).map((m) => m.name);
      add({ id: 'sleep', label: 'Sleep', who: sleepers, answers: proof,
        plan: (ctx.sleepClause ? 'Sleep Clause: only one of your Pokémon can be asleep. Let the one you need least take it.'
          : 'No Sleep Clause here: it can put your whole team to sleep.')
          + (proof.length ? ` Immune: ${list(proof)}.` : '') });
    }

    const perish = who(['perishsong']);
    if (perish.length) {
      add({ id: 'perish', label: 'Perish Song', who: perish,
        plan: 'Switch before the count ends, or your Pokémon faints.' });
    }
    return out;
  }

  /* ---- 2. Win conditions: who sweeps us, and who stops it ---- */
  function boostOf(f, api) {
    for (const mv of f.moves) {
      const md = api.moveData(mv);
      const b = md && api.selfBoosts(md, f.mon.baseTypes);
      if (!b) continue;
      // One turn of setup is +2 (Swords Dance), or two of a +1 move (Dragon Dance).
      const times = Math.max(...Object.values(b)) >= 2 ? 1 : 2;
      const boosts = {};
      for (const k of Object.keys(b)) boosts[k] = b[k] * times;
      return { move: md.name, boosts };
    }
    return null;
  }
  const withBoosts = (mon, add) => {
    const boosts = Object.assign({}, mon.boosts || {});
    for (const k of Object.keys(add || {})) boosts[k] = Math.max(-6, Math.min(6, (boosts[k] || 0) + add[k]));
    return Object.assign({}, mon, { boosts });
  };

  function bestHit(atk, def, moves, ctx, profile, onlyPrio) {
    let best = null;
    for (const mv of moves) {
      const r = ctx.api.calcDamage({ move: mv, atk, def, field: ctx.field, defProfile: profile, foeFaintedCount: 0 });
      if (!r || r.immune || r.status || r.nonDamaging || !r.maxPct) continue;
      if (r.fixed === 'half') continue;             // Ruination & co never finish anything
      if (onlyPrio && !(r.priority > 0)) continue;
      const avg = (r.minPct + r.maxPct) / 2;
      if (!best || avg > best.avg) best = { name: r.name, avg, hi: r.maxPct, prio: r.priority || 0 };
    }
    return best;
  }

  /* Does our mon m stop foe f (fB = f after its boost)? KO it first in at most two
   * hits, or phaze / Haze it (not through his Taunt), or wall it (immune to all he has). */
  function duel(m, f, fB, boosted, ctx) {
    const their = bestHit(fB, m, f.moves, ctx);
    const theirHit = their ? their.avg : 0;
    let hp = m.hpPct;
    if (ctx.entry(m)) hp -= theirHit;           // coming in eats one hit
    if (hp <= 0) return null;
    const fHp = f.mon.hpPct;
    const ours = bestHit(m, fB, m.moves || [], ctx, 'bulky');
    if (ours && ours.avg > 0) {
      const prio = bestHit(m, fB, m.moves || [], ctx, 'bulky', true);
      let toKill = Math.ceil(fHp / ours.avg);
      let first = ctx.api.outspeeds(ctx.api.speedOf(m, ctx.field, true), ctx.api.speedOf(fB, ctx.field, false), ctx.field)
        && !(their && their.prio > 0);
      let move = ours.name;
      if (prio && prio.avg >= fHp) { toKill = 1; first = true; move = prio.name; }
      // Ruination & co first: half its HP, then finish it.
      const half = (m.moves || []).some((mv) => HALF.includes(id(mv)))
        && !(ctx.api.calcDamage({ move: (m.moves || []).find((mv) => HALF.includes(id(mv))), atk: m, def: fB, field: ctx.field }) || {}).immune;
      if (half && !(prio && prio.avg >= fHp)) toKill = Math.min(toKill, 1 + Math.ceil(fHp / 2 / ours.avg));
      const toDie = theirHit > 0 ? Math.ceil(hp / theirHit) : 99;
      // Two hits, or three when we sit comfortably on its attacks (a wall that wins slowly).
      const wins = first ? toKill <= toDie : toKill < toDie;
      if (wins && (toKill <= 2 || (toKill === 3 && toDie >= 4))) return { how: 'ko', move };
    }
    if (boosted && ctx.foeBench !== 0) {
      const ph = (m.moves || []).map(id).find((x) => PHAZE.includes(x) || HAZE.includes(x));
      if (ph && hp > theirHit && !(f.likely.has('taunt') && TAUNTABLE.includes(ph))) {
        const md = ctx.api.moveData(ph);
        return { how: 'phaze', move: md ? md.name : ph };
      }
    }
    if (boosted && id(m.ability) === 'unaware') {
      const raw = duel(m, f, f.mon, false, ctx);
      if (raw) return { how: 'unaware', move: raw.move };
    }
    if (!their && ours && ours.avg >= 20) return { how: 'wall', move: ours.name };
    return null;
  }

  function threatsOf(foes, mine, ctx) {
    const alive = mine.filter((m) => !m.fainted);
    const res = [];
    for (const f of foes) {
      if (f.mon.fainted) continue;
      const b = boostOf(f, ctx.api);
      const fB = b ? withBoosts(f.mon, b.boosts) : f.mon;
      // It beats one of ours when that mon can't stop it and takes half its HP or more a hit.
      const answers = [];
      let sweeps = 0;
      for (const m of alive) {
        const d = duel(m, f, fB, !!b, ctx);
        if (d) { answers.push({ name: m.name, how: d.how, move: d.move }); continue; }
        const h = bestHit(fB, m, f.moves, ctx);
        if (h && h.hi >= Math.min(50, m.hpPct)) sweeps++;
      }
      // A booster that beats two of us after one turn, a mon that beats three as is, or
      // (late game) one that beats everything we have left but its answers.
      if (!sweeps || sweeps < Math.min(b ? 2 : 3, alive.length - answers.length)) continue;
      res.push({ name: f.mon.name, boost: b ? b.move : null, sweeps, of: alive.length, answers });
    }
    res.sort((a, b) => (a.answers.length - b.answers.length) || (b.sweeps - a.sweeps));
    return res;
  }

  /* What each of our mons still beats one-on-one (no boost on their side). */
  function beatsOf(foes, mine, ctx) {
    const out = {};
    for (const m of mine.filter((x) => !x.fainted)) {
      out[m.name] = foes.filter((f) => !f.mon.fainted && duel(m, f, f.mon, false, ctx)).map((f) => f.mon.name);
    }
    return out;
  }

  /* Last answer to a live threat: keep it. Beats nothing that is left: it can go. */
  function rolesOf(threats, beats, mine, ctx) {
    const roles = {};
    for (const m of mine.filter((x) => !x.fainted)) {
      let best = null;
      for (const t of threats) {
        // Already facing it: fighting it is its job right now, not a reason to leave.
        if (m.name === ctx.myActive && t.name === ctx.foeActive) continue;
        if (!t.answers.some((a) => a.name === m.name)) continue;
        const n = t.answers.length;
        const p = n === 1 ? 3 : n === 2 ? 2 : 0;
        if (p && (!best || p > best.preserve)) {
          best = { preserve: p, threat: t.name,
            why: n === 1 ? `your only answer to ${t.name}` : `one of your 2 answers to ${t.name}` };
        }
      }
      if (best) roles[id(m.name)] = best;
      else if (ctx.phase === 'battle' && threats.length && !(beats[m.name] || []).length) {
        roles[id(m.name)] = { preserve: 0, spent: true, why: 'it beats nothing that is left' };
      }
    }
    return roles;
  }

  /* ctx: { myTeam, foeTeam: [{mon, raw}], field, api, phase: 'preview'|'battle',
   *        myActive, foeActive, foeBench, sleepClause } */
  function build(ctx) {
    const c = Object.assign({}, ctx);
    // In battle, a mon on the bench has to come in (and take a hit) to answer.
    c.entry = (m) => c.phase === 'battle' && m.name !== c.myActive;
    const foes = prepFoes(c.foeTeam, c.field, c.api);
    const mine = c.myTeam;
    const st = styles(foes, mine, c);
    const threats = threatsOf(foes, mine, c);
    const beats = beatsOf(foes, mine, c);
    const roles = rolesOf(threats, beats, mine, c);
    const keep = Object.keys(roles).filter((k) => roles[k].preserve >= 3)
      .map((k) => ({ name: (mine.find((m) => id(m.name) === k) || {}).name || k, why: roles[k].why }));
    const aces = Object.keys(beats).map((n) => ({ name: n, beats: beats[n] }))
      .filter((a) => a.beats.length >= 2).sort((a, b) => b.beats.length - a.beats.length).slice(0, 2);
    return { styles: st, threats, roles, keep, aces };
  }

  window.AG_GAMEPLAN = { build, styles, threatsOf, duel };
})();
