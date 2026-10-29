/* AG Copilot - advisor
 *
 * Des heuristiques, pas une recherche d'arbre. Chaque regle encode une raison
 * concrete de rester ou de partir, celles qu'un joueur applique vraiment.
 * L'outil ne devine pas le plan adverse: il signale les situations ou rester
 * est mesurablement mauvais.
 */
(() => {
  'use strict';

  const id = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

  /* preserve: 0 sacrifiable, 1 fait pour encaisser, 2 important, 3 critique.
   * Un mon critique ne doit pas mourir pour du chip: il a un seul job et la
   * partie se perd s'il n'est plus la pour le faire. */
  window.AG_ROLES = {
    landorustherian: { preserve: 3, why: 'your only fast revenge killer' },
    kingambit:       { preserve: 3, why: 'your late-game cleaner, stronger with every fainted ally' },
    koraidon:        { preserve: 3, why: 'your main win condition' },
    calyrexshadow:   { preserve: 2, why: 'your wallbreaker, and it is frail' },
    arceusfairy:     { preserve: 2, why: 'your defensive backbone' },
    arceus:          { preserve: 2, why: 'your priority cleaner' },
    arceusground:    { preserve: 2, why: 'your Dragon Dance sweeper' },
    zaciancrowned:   { preserve: 2, why: 'your second sweeper' },
    zacian:          { preserve: 2, why: 'your second sweeper' },
    miraidon:        { preserve: 2, why: 'your special breaker' },
    tinglu:          { preserve: 1, why: 'it is there to take hits' },
    arceuswater:     { preserve: 1, why: 'it is there to take hits' },
    hooh:            { preserve: 1, why: 'it is there to take hits' },
    deoxysspeed:     { preserve: 0, why: 'expendable lead once hazards are up' },
    glimmora:        { preserve: 0, why: 'expendable lead once hazards are up' },
    ribombee:        { preserve: 0, why: 'expendable lead once webs are up' }
  };

  const BOOSTING = [
    'swordsdance', 'nastyplot', 'dragondance', 'calmmind', 'quiverdance',
    'bulkup', 'agility', 'shellsmash', 'geomancy', 'irondefense', 'curse',
    'victorydance', 'tidyup'
  ];

  const HAZARD_LABEL = {
    stealthrock: 'Stealth Rock',
    spikes: 'Spikes',
    toxicspikes: 'Toxic Spikes',
    stickyweb: 'Sticky Web'
  };

  const moveLabel = (mv) => {
    const md = window.BattleMovedex && window.BattleMovedex[id(mv)];
    return md ? md.name : mv;
  };

  function roleOf(name) {
    return window.AG_ROLES[id(name)] || { preserve: 1, why: '' };
  }

  /* ctx = { me, foe, moves, threats, switches, speed, myHazards, inferInfo } */
  window.AG_ADVISE = function advise(ctx) {
    const out = [];
    const me = ctx.me, foe = ctx.foe;
    if (!me || !foe) return out;

    // rule: stable id so logged games can tell which rule fired (see mahoraga.js)
    const add = (rule, score, level, text, extra) => out.push(Object.assign({ rule, score, level, text }, extra));

    const dmgMoves = (ctx.moves || []).filter((m) => m.kind === 'damage');
    const best = dmgMoves[0] || null;
    const worstThreat = (ctx.threats || []).find((t) => t.kind === 'damage') || null;

    // A recognised team profile (teams.js) brings its own roles.
    const role = (ctx.roles && ctx.roles[id(me.name)]) || roleOf(me.name);
    const faster = ctx.speed ? ctx.speed.faster : false;
    // Who acts first depends on the move: priority first, then speed.
    const myPrio = (best && best.priority) || 0;
    const lands = (t) => (t.priority || 0) > myPrio || ((t.priority || 0) === myPrio && !faster);
    const bestFirst = !!best && (myPrio > 0 || faster);              // before his usual attack

    const iKO = best && best.koGuaranteed;
    const iMightKO = best && best.koPossible;
    const theyKO = worstThreat && worstThreat.killsGuaranteed;
    const theyMightKO = worstThreat && worstThreat.kills;
    const dmgThreats = (ctx.threats || []).filter((t) => t.kind === 'damage');
    const killerFirst = dmgThreats.some((t) => t.killsGuaranteed && lands(t));   // he kills before our best lands
    const mightKillFirst = dmgThreats.some((t) => t.kills && lands(t));
    const incoming = worstThreat ? worstThreat.hi : 0;
    const myBestOut = best ? best.hi : 0;

    /* 1. Un mon du banc est immunise a tout ce qu'il peut faire. */
    // Dataset (9 games): fired 47 times, ignored 27, cost a mon only 3 times.
    // Only offer it when staying actually hurts, and never over a clean KO.
    const freeIn = (ctx.switches || []).find((s) => s.immune && !s.justLeft);
    const threatened = theyMightKO || incoming >= 40;
    if (freeIn && threatened && !(iKO && bestFirst && !killerFirst)) {
      add('free-switch', 84, 'switch',
        `Free switch: ${freeIn.name} fears nothing it has shown.`,
        { target: freeIn.name });
    }

    /* 2. Tu perds l'echange sec: il te tue, tu ne le tues pas. */
    if (theyKO && !iMightKO) {
      add('losing-trade', 90, 'switch',
        `Losing trade: it kills you${killerFirst ? ' before you move' : ''}, and your best hit only does ${Math.round(myBestOut)}%.`);
    } else if (theyKO && iMightKO && killerFirst && !iKO) {
      add('losing-gamble', 86, 'switch',
        `It moves first and can kill you. Your KO isn't guaranteed: don't flip a coin.`);
    } else if (theyKO && iKO && killerFirst && !dmgMoves.some((m) => m.koGuaranteed && (m.priority || 0) > myPrio)) {
      // Our KO is real but never lands: he moves first and we're gone.
      add('outsped-ko', 89, 'switch',
        `It moves first and kills you: ${best.name} will never go off.`);
    }

    /* 3. Kill propre: tu passes avant et tu le tues. */
    // The guaranteed KO that lands before anything of his that kills (Extreme Speed when slower).
    const before = (m, t) => (t.priority || 0) < (m.priority || 0) || ((t.priority || 0) === (m.priority || 0) && faster);
    const koFirst = dmgMoves.find((m) => m.koGuaranteed && ((m.priority || 0) > 0 || faster)
      && dmgThreats.every((t) => !t.killsGuaranteed || before(m, t)));
    if (koFirst) {
      add('clean-kill', 88, 'stay', `Stay in: ${koFirst.name} KOs it, and you move first${(koFirst.priority || 0) > 0 && !faster ? ' thanks to priority' : ''}.`,
        { move: koFirst.name, moveName: koFirst.name });
    } else if (iKO && !bestFirst && !theyKO) {
      add('kill-no-return', 82, 'stay', `Stay in: ${best.name} KOs it, and it can't kill you back.`, { move: best.name });
    }

    /* 4. Preservation d'un mon critique. */
    if (role.preserve >= 3 && !iKO && incoming >= 45) {
      add('preserve-critical', 85, 'switch',
        `Pull ${me.name} out: it is ${role.why}. It would take ${Math.round(incoming)}% for nothing.`);
    } else if (role.preserve >= 2 && !iMightKO && incoming >= 60) {
      add('preserve-important', 72, 'switch',
        `${me.name} would take ${Math.round(incoming)}% without KOing anything. It is ${role.why}: keep it.`);
    }

    /* 5. Tu es mure: tu ne fais rien a ce mon. */
    if (best && myBestOut < 25 && !theyKO) {
      add('walled', 70, 'switch',
        `You're walled: your best hit tops out at ${Math.round(myBestOut)}%. Every turn here is a wasted turn.`);
    } else if (!dmgMoves.length && (ctx.moves || []).length) {
      add('no-offense', 68, 'switch', `Nothing useful to do to it here.`);
    }

    /* 6. Fenetre de setup. */
    const boost = (me.moves || []).find((m) => BOOSTING.includes(id(m)));
    if (boost && incoming > 0 && incoming < 25 && !theyMightKO) {
      const nice = (me.moves || []).find((m) => BOOSTING.includes(id(m)));
      add('setup-window', 75, 'setup',
        `Setup window: it only does ${Math.round(incoming)}% to you. Use ${moveLabel(nice)}.`,
        { move: nice });
    }

    /* 7. Danger priorite. */
    const prio = (ctx.threats || []).find((t) => t.kind === 'damage' && t.priority > 0 && t.kills);
    if (prio) {
      add('priority-danger', 80, 'warn',
        `${prio.name} has priority and can kill you: your speed doesn't help here.`);
    }

    /* 8. Hazards: cout du switch. */
    const hz = Object.keys(ctx.myHazards || {})
      .filter((k) => HAZARD_LABEL[k])
      .map((k) => HAZARD_LABEL[k]);
    if (hz.length && out.some((a) => a.level === 'switch')) {
      add('hazard-cost', 40, 'warn', `${hz.join(' + ')} on your side: every switch costs you HP.`);
    }

    /* 9. Set adverse encore flou. */
    const inf = ctx.inferInfo;
    if (inf && inf.hasData && !inf.narrowed) {
      add('set-unknown', 20, 'warn',
        `${foe.name}'s set is still unclear (${inf.total} possible): its damage is estimated at worst.`);
    } else if (inf && inf.narrowed && inf.sets.length === 1) {
      add('set-identified', 30, 'warn', `Set identified: ${inf.sets[0].name}.`);
    }

    /* 11. Fin de partie: le cleaner peut tout finir. */
    const eg = ctx.endgame;
    if (eg && eg.activeIsCleaner && eg.clean) {
      if (!eg.needsSetup) {
        add('endgame', 92, 'stay', eg.text, { moveName: eg.moveName });
      } else if (eg.safeToSetup) {
        add('endgame', 87, 'setup', eg.text, { move: eg.setupId });
      }
    }

    /* 12. Plan des hazards: poser les siens, renvoyer les tiens. */
    const hp = ctx.hazardPlan;
    if (hp) add('hazard-plan', hp.kind === 'clear' ? 76 : 72, 'stay', hp.why, { moveName: hp.moveName });

    /* 10. Anti-setup: il peut booster puis tout balayer. */
    const sr = ctx.setupRisk;
    if (sr) {
      const c = sr.counter;
      if (c && c.kind === 'move') {
        add('anti-setup', 86, 'stay', `${sr.summary}. ${c.why}`, { moveName: c.name });
      } else if (c && c.kind === 'switch') {
        add('anti-setup', 86, 'switch', `${sr.summary}. ${c.why}`, { target: c.name });
      } else {
        add('anti-setup', 79, 'warn', sr.taunted ? `${sr.summary}.`
          : `${sr.summary}. No answer at hand (Taunt, Haze, phaze, Unaware): hit hard now to bring it into range.`);
      }
    }

    /* 13. Setup defensif: il se blinde jusqu'a ce qu'on ne lui fasse plus rien. */
    const wr = ctx.wallRisk;
    if (wr) {
      const c = wr.counter;
      if (c && c.kind === 'move') add('anti-wall', 83, 'stay', `${wr.summary}. ${c.why}`, { moveName: c.name });
      else if (c && c.kind === 'switch') add('anti-wall', 83, 'switch', `${wr.summary}. ${c.why}`, { target: c.name });
      else add('anti-wall', 60, 'warn', wr.taunted ? `${wr.summary}.`
        : `${wr.summary}. No answer (Haze, phaze, Taunt, Unaware): hit it now, before it is too late.`);
    }

    /* 14. Stall: ce qui te ronge chaque tour, et comment en sortir. */
    const st = ctx.stall;
    if (st) {
      const what = st.parts.map((p) => p.what).join(' + ');
      if (st.trapped) {
        add('trapped', 88, 'warn', `You are trapped: you can't switch${st.pivot ? `, except with ${st.pivot}` : ''}.`);
      }
      if (st.spin && st.net > 0 && !theyKO) {
        add('stall-spin', 78, 'stay', `${st.spin} frees you from ${what}.`, { moveName: st.spin });
      } else if ((st.seeded || st.bound) && !st.trapped && st.loss >= 12.5 && !iKO && myBestOut < 50) {
        // Leech Seed counts in full even behind Leftovers: what we lose, it heals.
        add('stall-out', 74, 'switch', `${what} costs you ${Math.round(st.loss)}% a turn and you're not breaking it: get out, ${st.seeded ? 'Leech Seed goes away when you switch' : 'the trap ends when you switch'}.`);
      }
      if (st.stall && st.taunt && !iKO && !theyMightKO) {
        add('anti-stall', 77, 'stay', `${st.foe} is playing stall (recovery, Leech Seed, Toxic, Protect...): Taunt shuts all of that off for 3 turns.`, { moveName: 'Taunt' });
      }
      if (st.net > 0) {
        add('residual', 45, 'warn', `You lose about ${Math.round(st.net)}% a turn (${what})`
          + (st.turnsLeft !== null ? `, that is ${st.turnsLeft} turn${st.turnsLeft > 1 ? 's' : ''} before you fall doing nothing.` : '.'));
      }
    }

    /* 15. Endormi: ses coups ne partent pas tant qu'il dort. */
    const zz = ctx.asleep;
    if (zz && zz.sleepTalk) {
      add('asleep', 90, 'stay', `${me.name} is asleep: Sleep Talk calls one of its other moves.`, { moveName: 'Sleep Talk' });
    } else if (zz && zz.wake < 1) {
      const odds = zz.wake ? `${Math.round(zz.wake * 100)}% chance to wake up this turn` : 'it can\'t wake up this turn';
      const sw = (ctx.switches || []).find((s) => !s.dies && !s.justLeft);
      if ((theyMightKO || incoming >= 40 || ctx.setupRisk) && sw) {
        add('asleep', 89, 'switch', `${me.name} is asleep (${odds}) and takes hits without answering: ${sw.name} takes them instead.`, { target: sw.name });
      } else {
        add('asleep', 70, 'warn', `${me.name} is asleep (${odds}). Staying in brings its wake-up closer.`);
      }
    }

    /* 16. Perish Song: le compte a rebours disparait au banc. */
    const pe = ctx.perish || {};
    const trapped = !!(ctx.stall && ctx.stall.trapped);
    if (pe.mine === 1 && !trapped) {
      add('perish', 95, 'switch', `Perish Song: ${me.name} faints at the end of the turn. Switch now, the count is cleared on the bench.`);
    } else if (pe.mine === 1) {
      add('perish', 70, 'warn', `Perish Song: ${me.name} faints at the end of the turn and you are trapped. Deal as much damage as you can.`);
    } else if (pe.mine === 2 || pe.mine === 3) {
      add('perish', 55, 'warn', `Perish Song: ${me.name} faints in ${pe.mine} turns if it stays in. Switch before the end.`);
    }
    if (pe.foe === 1 && pe.mine == null) {
      add('perish-foe', 50, 'warn', `${foe.name} faints at the end of the turn (Perish Song) unless it switches.`);
    }

    /* 17. Bloque par un Choice sur un coup qui ne sert plus. */
    const lk = ctx.locked;
    if (lk) {
      const m = (ctx.moves || []).find((x) => x.name === lk.move);
      const useless = !m || m.kind === 'immune' || (m.kind === 'damage' && !m.koPossible && m.hi < 30);
      const sw = (ctx.switches || []).find((x) => !x.dies && !x.justLeft);
      if (useless && sw) {
        add('choice-locked', 82, 'switch', `Locked into ${lk.move} by ${lk.item}${m && m.kind === 'damage' ? ` (${Math.round(m.hi)} % max)` : ''}: switch to unlock.`, { target: sw.name });
      }
    }

    out.sort((a, b) => b.score - a.score);
    return out;
  };
})();
