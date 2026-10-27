/* P.A.C.H.I.R.I.S.U. - carnet des defaites et dataset de combats
 *
 * A la fin d'un combat perdu, relit le journal du combat (protocole Showdown)
 * et ce que l'outil t'a conseille a chaque decision, puis en tire les raisons
 * probables de la defaite.
 *
 * En plus, chaque combat joue (gagne ou perdu) est garde en entier pour
 * mahoraga.js : journal sans le chat, equipes, et a chaque decision ce que
 * l'outil voyait, ce qu'il conseillait et ce que tu as joue. Les victoires
 * servent de point de comparaison: sans elles, impossible de savoir si une
 * regle fait perdre ou si elle est juste souvent la.
 *
 * Stockage: chrome.storage (via bridge.js), ou localStorage sans le pont.
 *
 * Ne lit que l'etat du client. N'envoie rien au serveur.
 */
(() => {
  'use strict';

  const toID = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  const MAX_RECORDS = 300;
  const LOG_WINS = true; // false: le dataset ne garde que les defaites

  /* ---------------------------------------------------------------- */
  /* Log parsing                                                      */
  /* ---------------------------------------------------------------- */

  /* "p1a: Nick" -> { side: 'p1', nick: 'Nick' } */
  function ident(s) {
    const m = String(s || '').match(/^(p\d)[a-z]?:\s*(.*)$/);
    return m ? { side: m[1], nick: m[2].trim() } : null;
  }
  const fromTag = (parts) => {
    const t = parts.find((p) => p.startsWith('[from]'));
    return t ? t.slice(6).trim().replace(/^(item|ability|move):\s*/, '') : null;
  };

  /* Turns the raw protocol lines into the facts the loss analysis needs. */
  function parseBattle(lines) {
    const out = {
      tier: '', players: {}, teamsize: {}, winner: null, tie: false,
      forfeit: null, inactive: null, turns: 0,
      species: {},            // "p1:Nick" -> species
      seen: { p1: [], p2: [] },
      faints: [],             // {turn, side, species, by: {side, species, move} | {residual}}
      actions: [],            // {turn, seq, side, kind: 'move'|'switch', name, species, afterMyFaint}
      hazards: [],            // {turn, side, name}
      hazardHits: [],         // {turn, side, species, what}
      crits: [],              // {turn, side (of the target), species}
      misses: [],             // {turn, side (of the attacker), move}
      moves: { p1: {}, p2: {} }, // species -> move names actually used
      hits: [],               // {turn, by: {side, species, move}, target: {side, species}, before, after}
      boosts: []              // {turn, seq, side, species, stat, amount, move}
    };
    const hp = {};            // "p1:Nick" -> current HP in % of max
    const hpPct = (str) => {
      const t = String(str || '').split(' ')[0];
      if (t === '0') return 0;
      const m = t.match(/^(\d+)\/(\d+)$/);
      return m && +m[2] > 0 ? (100 * +m[1]) / +m[2] : null;
    };
    let turn = 0, seq = 0, cur = null, use = 0;
    const faintedThisTurn = { p1: false, p2: false };
    const lastHit = {}; // "p1:Nick" -> cause
    const sp = (id) => (id && out.species[id.side + ':' + id.nick]) || (id && id.nick) || '?';

    for (const raw of lines) {
      const line = String(raw || '');
      if (!line.startsWith('|')) continue;
      const parts = line.slice(1).split('|');
      const cmd = parts[0];
      seq++;
      switch (cmd) {
        case 'tier': out.tier = parts[1] || ''; break;
        case 'player': if (parts[1] && parts[2]) out.players[parts[1]] = parts[2]; break;
        case 'teamsize': out.teamsize[parts[1]] = +parts[2] || 0; break;
        case 'turn':
          turn = +parts[1] || turn + 1; out.turns = turn; cur = null;
          faintedThisTurn.p1 = faintedThisTurn.p2 = false;
          break;
        case 'switch': case 'drag': case 'replace': {
          const id = ident(parts[1]);
          if (!id) break;
          const species = String(parts[2] || '').split(',')[0].trim();
          if (species) {
            out.species[id.side + ':' + id.nick] = species;
            if (out.seen[id.side] && !out.seen[id.side].includes(species)) out.seen[id.side].push(species);
          }
          const h0 = hpPct(parts[3]);
          if (h0 !== null) hp[id.side + ':' + id.nick] = h0;
          if (cmd === 'switch') {
            out.actions.push({ turn, seq, side: id.side, kind: 'switch', name: species, species,
              afterMyFaint: faintedThisTurn[id.side] });
          }
          break;
        }
        case 'detailschange': {
          const id = ident(parts[1]);
          const species = String(parts[2] || '').split(',')[0].trim();
          if (id && species) out.species[id.side + ':' + id.nick] = species;
          break;
        }
        case 'move': {
          const id = ident(parts[1]);
          if (!id) break;
          const move = parts[2] || '';
          const called = !!fromTag(parts.slice(3)); // Copycat, Dancer, Magic Bounce...
          cur = { side: id.side, species: sp(id), move, use: ++use };
          if (!called) {
            out.actions.push({ turn, seq, side: id.side, kind: 'move', name: move, species: sp(id),
              afterMyFaint: faintedThisTurn[id.side] });
            const bag = out.moves[id.side];
            if (bag) (bag[sp(id)] = bag[sp(id)] || []).includes(move) || bag[sp(id)].push(move);
          }
          break;
        }
        case '-damage': {
          const id = ident(parts[1]);
          if (!id) break;
          const from = fromTag(parts.slice(3));
          const key = id.side + ':' + id.nick;
          const after = hpPct(parts[2]);
          const before = hp[key];
          if (after !== null) hp[key] = after;
          if (!from && cur && after !== null && typeof before === 'number') {
            out.hits.push({ turn, use: cur.use, by: { side: cur.side, species: cur.species, move: cur.move },
              target: { side: id.side, species: sp(id) }, before, after });
          }
          if (from) {
            lastHit[key] = { residual: from };
            if (/stealth rock|spikes/i.test(from)) {
              out.hazardHits.push({ turn, side: id.side, species: sp(id), what: from });
            }
          } else if (cur) {
            lastHit[key] = { side: cur.side, species: cur.species, move: cur.move };
          }
          break;
        }
        case '-heal': case '-sethp': {
          const id = ident(parts[1]);
          const v = hpPct(parts[2]);
          if (id && v !== null) hp[id.side + ':' + id.nick] = v;
          break;
        }
        case '-boost': {
          const id = ident(parts[1]);
          if (!id) break;
          // Only self-inflicted boosts from a move (Swords Dance, Dragon Dance...)
          const own = cur && cur.side === id.side && cur.species === sp(id) && !fromTag(parts.slice(4));
          if (own) out.boosts.push({ turn, seq, side: id.side, species: sp(id), stat: parts[2], amount: +parts[3] || 1, move: cur.move });
          break;
        }
        case '-crit': {
          const id = ident(parts[1]);
          if (id) out.crits.push({ turn, side: id.side, species: sp(id), by: cur && cur.move });
          break;
        }
        case '-miss': {
          const id = ident(parts[1]);
          if (id) out.misses.push({ turn, side: id.side, move: cur ? cur.move : '' });
          break;
        }
        case '-sidestart': {
          const side = String(parts[1] || '').slice(0, 2);
          const name = String(parts[2] || '').replace(/^move:\s*/, '');
          if (/stealth rock|spikes|toxic spikes|sticky web/i.test(name)) out.hazards.push({ turn, side, name });
          break;
        }
        case 'faint': {
          const id = ident(parts[1]);
          if (!id) break;
          faintedThisTurn[id.side] = true;
          out.faints.push({ turn, seq, side: id.side, species: sp(id), by: lastHit[id.side + ':' + id.nick] || null });
          break;
        }
        case 'win': out.winner = parts[1] || ''; break;
        case 'tie': out.tie = true; break;
        case '-message': case 'raw': case '': {
          const msg = parts.slice(1).join('|');
          let m = msg.match(/^(.+?) forfeited\.?$/);
          if (m) out.forfeit = m[1];
          m = msg.match(/^(.+?) lost due to inactivity\.?$/);
          if (m) out.inactive = m[1];
          break;
        }
        default: break;
      }
    }
    return out;
  }

  /* ---------------------------------------------------------------- */
  /* Advice vs what was actually played                               */
  /* ---------------------------------------------------------------- */

  /* decisions: [{turn, forced, kind, target, text}] recorded live.
   * Normal decision of turn T -> my first action in T.
   * Forced switch of turn T   -> my next switch made after one of my faints in T. */
  function matchDecisions(decisions, log, me) {
    const mine = log.actions.filter((a) => a.side === me && a.turn > 0);
    const used = new Set();
    return (decisions || []).map((d) => {
      const pool = mine.filter((a) => a.turn === d.turn && !used.has(a.seq)
        && (d.forced ? (a.kind === 'switch' && a.afterMyFaint) : !a.afterMyFaint));
      const act = pool[0] || null;
      if (act) used.add(act.seq);
      let followed = null;
      if (act && d.target) {
        followed = d.kind === 'switch'
          ? act.kind === 'switch' && toID(act.species) === toID(d.target)
          : act.kind === 'move' && toID(act.name) === toID(d.target);
      }
      // Did one of my mons fall later in that same turn?
      let died = act ? log.faints.find((f) => f.side === me && f.turn === d.turn && f.seq > act.seq) : null;
      // No action at all: my active fell before moving. A switch would have
      // gone first, so if I was told to switch, I stayed in.
      if (!act && !d.forced) {
        const fell = log.faints.find((f) => f.side === me && f.turn === d.turn);
        if (fell) {
          died = fell;
          followed = d.kind === 'switch' ? false : null;
          return Object.assign({}, d, { played: { kind: 'stay', name: 'rester' }, followed, died });
        }
      }
      return Object.assign({}, d, { played: act, followed, died: died || null });
    });
  }

  /* ---------------------------------------------------------------- */
  /* Loss analysis                                                    */
  /* ---------------------------------------------------------------- */

  function plural(n, one, many) { return n + ' ' + (n > 1 ? many : one); }

  /* opts: { lines, me ('p1'|'p2'), myName, decisions, roomId, now, infer } */
  function analyzeLoss(opts) {
    const log = parseBattle(opts.lines || []);
    const me = opts.me;
    const foe = me === 'p1' ? 'p2' : 'p1';
    const reasons = [];
    const add = (weight, kind, text) => reasons.push({ weight, kind, text });

    const myFaints = log.faints.filter((f) => f.side === me);
    const foeFaints = log.faints.filter((f) => f.side === foe);
    const foeSize = log.teamsize[foe] || Math.max(log.seen[foe].length, 1);
    const foeLeft = Math.max(0, foeSize - foeFaints.length);

    // 1. Forfeit / timer
    const myName = opts.myName || log.players[me] || '';
    if (log.forfeit && toID(log.forfeit) === toID(myName)) add(100, 'forfeit', 'You forfeited.');
    if (log.inactive && toID(log.inactive) === toID(myName)) add(100, 'timer', 'Lost on timer (inactivity).');

    // 2. Advice ignored right before losing a mon
    const matched = matchDecisions(opts.decisions, log, me);
    const judged = matched.filter((d) => d.followed !== null);
    const costly = matched.filter((d) => d.followed === false && d.died);
    for (const d of costly.slice(0, 3)) {
      add(80, 'ignored',
        `Turn ${d.turn}: I suggested "${d.text}", `
        + (d.played.kind === 'stay' ? 'you stayed in' : `you played ${d.played.kind === 'switch' ? 'switch to ' : ''}${d.played.name}`)
        + `, and ${d.died.species} fell right after.`);
    }

    // 3. Their MVP
    const byFoe = {};
    for (const f of myFaints) {
      if (f.by && f.by.species && f.by.side === foe) {
        const k = f.by.species;
        (byFoe[k] = byFoe[k] || { n: 0, moves: [] }).n++;
        if (!byFoe[k].moves.includes(f.by.move)) byFoe[k].moves.push(f.by.move);
      }
    }
    const mvps = Object.keys(byFoe).sort((a, b) => byFoe[b].n - byFoe[a].n);
    if (mvps[0] && byFoe[mvps[0]].n >= 2) {
      const m = byFoe[mvps[0]];
      add(70 + 5 * m.n, 'mvp',
        `${mvps[0]} KO'd ${plural(m.n, 'of your Pokémon', 'of your Pokémon')} (${m.moves.join(', ')}). You lacked a real answer to it.`);
    }

    // 3b. Setup sweep: the long-term play the tool doesn't see coming
    const sweeps = {};
    for (const b of log.boosts.filter((x) => x.side === foe)) {
      if (sweeps[b.species]) continue;
      const after = myFaints.filter((f) => f.seq > b.seq && f.by && f.by.species === b.species);
      if (after.length >= 2) sweeps[b.species] = { boost: b, kos: after.length };
    }
    for (const k of Object.keys(sweeps)) {
      const w = sweeps[k];
      add(78, 'setup',
        `${k} set up ${w.boost.move} on turn ${w.boost.turn}, then got ${w.kos} KOs. It had to be punished before (KO, phaze, Taunt, Haze), or you needed a priority check.`);
    }

    // 4. Outsped and KO'd before acting
    const outsped = myFaints.filter((f) => f.by && f.by.move && f.turn > 0
      && !log.actions.some((a) => a.side === me && a.turn === f.turn && a.kind === 'move' && a.seq < f.seq && !a.afterMyFaint));
    if (outsped.length >= 2) {
      add(55, 'speed', `${plural(outsped.length, 'Pokémon', 'Pokémon')} KO'd before getting to attack (${outsped.map((f) => f.species).join(', ')}): it was faster or had priority.`);
    }

    // 5. Hazards
    const myHazards = log.hazards.filter((h) => h.side === me).map((h) => h.name);
    const hazardKOs = myFaints.filter((f) => f.by && f.by.residual && /stealth rock|spikes/i.test(f.by.residual));
    const hazardHits = log.hazardHits.filter((h) => h.side === me).length;
    if (myHazards.length && (hazardKOs.length || hazardHits >= 2)) {
      add(hazardKOs.length ? 60 : 40, 'hazards',
        `${[...new Set(myHazards)].join(' + ')} on your side: ${plural(hazardHits, 'switch punished', 'switches punished')}`
        + (hazardKOs.length ? `, and ${hazardKOs.map((f) => f.species).join(', ')} died to it.` : '.') + ' Remember to clear them (Defog, Rapid Spin).');
    }

    // 6. Bad luck
    const critKOs = log.crits.filter((c) => c.side === me
      && myFaints.some((f) => f.turn === c.turn && f.species === c.species));
    if (critKOs.length) add(45, 'luck', `Decisive critical hit on ${critKOs.map((c) => c.species).join(', ')}.`);
    const myMisses = log.misses.filter((m) => m.side === me);
    if (myMisses.length >= 2) add(35, 'luck', `${plural(myMisses.length, 'missed attack', 'missed attacks')} on your side (${[...new Set(myMisses.map((m) => m.move))].join(', ')}).`);

    // 7. Residual
    const residual = myFaints.filter((f) => f.by && f.by.residual && !/stealth rock|spikes/i.test(f.by.residual));
    if (residual.length) add(30, 'residual', `Worn down: ${residual.map((f) => `${f.species} (${f.by.residual})`).join(', ')}.`);

    // 8. Off-meta sets: moves outside every known set for that species
    if (typeof opts.infer === 'function') {
      const odd = [];
      for (const species of Object.keys(log.moves[foe] || {})) {
        const info = opts.infer(species, {});
        if (!info || !info.hasData) continue;
        const known = new Set(info.moves.map(toID));
        for (const mv of log.moves[foe][species]) if (!known.has(toID(mv))) odd.push(`${species} with ${mv}`);
      }
      if (odd.length) add(30, 'set', `Unexpected set: ${odd.slice(0, 3).join(', ')}. My estimates were wrong there.`);
    }

    // 9. Score
    if (foeLeft >= 4) add(50, 'matchup', `Heavy loss: it still had ${foeLeft} Pokémon. A team matchup problem more than a play problem.`);
    else if (foeLeft === 1) add(25, 'close', `It was close: it had only one Pokémon left.`);

    if (!reasons.length) add(10, 'unknown', 'No clear reason in the log: an even game lost at the end.');
    reasons.sort((a, b) => b.weight - a.weight);

    return {
      id: opts.roomId || ('battle-' + (opts.now || Date.now())),
      date: new Date(opts.now || Date.now()).toISOString(),
      format: log.tier,
      opponent: log.players[foe] || '?',
      turns: log.turns,
      myTeam: log.seen[me],
      foeTeam: log.seen[foe],
      foeLeft,
      kos: myFaints.map((f) => ({
        turn: f.turn, species: f.species,
        by: f.by ? (f.by.residual ? f.by.residual : `${f.by.species} (${f.by.move})`) : '?'
      })),
      killers: mvps.map((k) => ({ species: k, n: byFoe[k].n })),
      advice: { judged: judged.length, followed: judged.filter((d) => d.followed).length, costly: costly.length },
      reasons
    };
  }

  /* ---------------------------------------------------------------- */
  /* Full battle record for the dataset                               */
  /* ---------------------------------------------------------------- */

  // Chat, joins/leaves and timestamps aren't battle data (and are other people's words).
  const NOISE = /^\|(c|c:|chat|j|J|join|l|L|leave|n|N|name|raw|html|uhtml|uhtmlchange|t:|inactive|inactiveoff|-anim|-hint|-message)\|/;
  function cleanLog(lines) {
    return (lines || []).map(String).filter((l) => l.startsWith('|') && l !== '|' && !NOISE.test(l)
      || /forfeited|lost due to inactivity/.test(l));
  }

  /* opts: { lines, me, myName, decisions, roomId, team, result, loss, now } */
  function buildRecord(opts) {
    const lines = cleanLog(opts.lines);
    const log = parseBattle(lines);
    const foe = opts.me === 'p1' ? 'p2' : 'p1';
    const decisions = matchDecisions(opts.decisions, log, opts.me).map((d) => Object.assign({}, d, {
      played: d.played ? { kind: d.played.kind, name: d.played.name } : null,
      died: d.died ? d.died.species : null
    }));
    return {
      v: 1,
      // Version of the tool that gave the advice, to compare before/after a change.
      tool: opts.tool || (window.PACHIRISU && window.PACHIRISU.version) || null,
      id: opts.roomId,
      date: new Date(opts.now || Date.now()).toISOString(),
      format: log.tier,
      result: opts.result,
      me: opts.me,
      opponent: log.players[foe] || '?',
      turns: log.turns,
      myTeam: opts.team || log.seen[opts.me].map((species) => ({ species })),
      foeTeam: log.seen[foe].map((species) => ({ species, moves: (log.moves[foe] || {})[species] || [] })),
      decisions,
      loss: opts.loss || null,
      log: lines
    };
  }

  /* Compact copy of what the tool showed at a decision point. */
  function snapshot(battle, req, data) {
    const r = (x) => (typeof x === 'number' ? Math.round(x * 10) / 10 : x);
    const mon = (m) => m && { name: m.name, hp: r(m.hpPct), boosts: m.boosts || {}, status: m.status || '',
      ability: m.ability || '', item: m.item || '', tera: m.terastallized || '' };
    const v = data.verdict;
    return {
      turn: Math.max(0, battle.turn || 0),
      rqid: req.rqid,
      forced: !!(req.forceSwitch || data.forced),
      kind: v.kind, target: v.target || '', text: v.text, rule: v.rule || '',
      me: mon(data.me), foe: mon(data.foe),
      field: data.field || null,
      speed: data.speed || null,
      hazards: Object.keys(data.myHazards || {}),
      advice: (data.advice || []).map((a) => ({ rule: a.rule, score: a.score, level: a.level })),
      moves: (data.moves || []).slice(0, 6).map((m) => ({ name: m.name, kind: m.kind, lo: r(m.lo), hi: r(m.hi),
        ko: m.koGuaranteed ? 2 : m.koPossible ? 1 : 0 })),
      threats: (data.threats || []).slice(0, 5).map((t) => ({ name: t.name, kind: t.kind, lo: r(t.lo), hi: r(t.hi),
        kills: t.killsGuaranteed ? 2 : t.kills ? 1 : 0, priority: t.priority || 0 })),
      switches: (data.switches || []).slice(0, 4).map((x) => ({ name: x.name, hp: r(x.hpPct), lo: r(x.lo), hi: r(x.hi),
        score: r(x.score), immune: !!x.immune, dies: !!x.dies })),
      guessed: !!data.threatsGuessed,
      inferred: data.inferInfo && data.inferInfo.hasData
        ? { total: data.inferInfo.total, left: data.inferInfo.sets.length, sets: data.inferInfo.sets.map((x) => x.name) }
        : null
    };
  }

  function teamFrom(req) {
    return ((req && req.side && req.side.pokemon) || []).map((p) => ({
      species: String(p.details || '').split(',')[0],
      item: p.item || '', ability: p.baseAbility || p.ability || '',
      moves: p.moves || [], tera: p.teraType || '', stats: p.stats || null
    }));
  }

  /* ---------------------------------------------------------------- */
  /* Storage                                                          */
  /* ---------------------------------------------------------------- */

  const LS_KEY = 'pachirisu.losses';
  let reqId = 0;
  const pending = {};

  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data || e.data.agc !== 'res' || !pending[e.data.id]) return;
    pending[e.data.id](e.data);
    delete pending[e.data.id];
  });

  function viaBridge(op, data) {
    return new Promise((resolve, reject) => {
      const id = ++reqId;
      pending[id] = (res) => (res.ok ? resolve(res.data) : reject(new Error(res.error || 'storage')));
      window.postMessage({ agc: 'req', id, op, data }, location.origin);
      setTimeout(() => { if (pending[id]) { delete pending[id]; reject(new Error('timeout')); } }, 4000);
    });
  }
  const hasBridge = () => document.documentElement.dataset.agcBridge === '1';
  const lsRead = () => { try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch (e) { return []; } };
  const lsWrite = (v) => { try { localStorage.setItem(LS_KEY, JSON.stringify(v)); } catch (e) { /* full or blocked */ } };

  const store = {
    all() { return hasBridge() ? viaBridge('losses:get').then((v) => v || []) : Promise.resolve(lsRead()); },
    add(rec) {
      if (hasBridge()) return viaBridge('losses:add', rec);
      const all = lsRead().filter((r) => r.id !== rec.id);
      all.unshift(rec);
      lsWrite(all.slice(0, MAX_RECORDS));
      return Promise.resolve(true);
    },
    clear() { return hasBridge() ? viaBridge('losses:clear') : Promise.resolve(lsWrite([])); }
  };

  const LS_BATTLES = 'pachirisu.battles';
  const lsB = () => { try { return JSON.parse(localStorage.getItem(LS_BATTLES) || '[]'); } catch (e) { return []; } };
  const battles = {
    /* [{id, date, result, format, opponent, turns}] newest first */
    index() {
      if (hasBridge()) return viaBridge('battles:index').then((v) => v || []);
      return Promise.resolve(lsB().map((b) => ({ id: b.id, date: b.date, result: b.result, format: b.format, opponent: b.opponent, turns: b.turns })));
    },
    all() { return hasBridge() ? viaBridge('battles:all').then((v) => v || []) : Promise.resolve(lsB()); },
    add(rec) {
      if (hasBridge()) return viaBridge('battles:add', rec);
      const all = lsB().filter((b) => b.id !== rec.id);
      all.unshift(rec);
      try { localStorage.setItem(LS_BATTLES, JSON.stringify(all.slice(0, 50))); } catch (e) { /* full */ }
      return Promise.resolve(true);
    },
    clear() {
      if (hasBridge()) return viaBridge('battles:clear');
      try { localStorage.removeItem(LS_BATTLES); } catch (e) { /* ignore */ }
      return Promise.resolve(true);
    }
  };

  /* ---------------------------------------------------------------- */
  /* Live recorder, fed by copilot.js on every tick                   */
  /* ---------------------------------------------------------------- */

  const live = {};
  const listeners = [];

  function resultReceived(battle) {
    const q = battle.stepQueue || [];
    for (let i = q.length - 1; i >= 0 && i >= q.length - 80; i--) {
      const l = String(q[i] || '');
      if (l.startsWith('|win|') || l === '|tie' || l.startsWith('|tie|')) return true;
    }
    return false;
  }

  function onTick(room, data) {
    const req = room && room.request;
    const battle = room && room.battle;
    if (!req || !req.side || !battle) return; // spectating: nothing to record
    const id = room.id || 'room';
    const st = live[id] || (live[id] = { decisions: [], rqid: null, saved: false, team: null });
    if (!st.team && req.side.pokemon && req.side.pokemon.length) st.team = teamFrom(req);

    // One decision per request; keep refreshing it until the next request so we
    // keep the verdict you were looking at when you clicked.
    const decides = !req.wait && !req.teamPreview && (req.active || req.forceSwitch);
    if (decides && data && data.verdict) {
      const d = snapshot(battle, req, data);
      if (req.rqid !== st.rqid) { st.rqid = req.rqid; st.decisions.push(d); }
      else st.decisions[st.decisions.length - 1] = d;
    }

    // The |win| line lands in stepQueue as soon as the server sends it, while
    // battle.ended waits for the animation: don't lose a game closed early.
    if ((battle.ended || resultReceived(battle)) && !st.saved) {
      st.saved = true;
      const lines = battle.stepQueue || [];
      const log = parseBattle(lines);
      const myName = req.side.name || '';
      if (log.winner === null && !log.tie) return; // ended without a result line (replay cut, etc.)
      const result = log.tie ? 'tie' : toID(log.winner) === toID(myName) ? 'win' : 'lose';
      const warn = (e) => console.warn('[P.A.C.H.I.R.I.S.U.] sauvegarde impossible', e);

      let loss = null;
      if (result === 'lose') {
        loss = analyzeLoss({
          lines, me: req.side.id, myName, decisions: st.decisions, roomId: id,
          infer: window.AG_INFER
        });
        store.add(loss).then(() => listeners.forEach((f) => { try { f(loss); } catch (e) { /* ignore */ } })).catch(warn);
      }
      if (result !== 'win' || LOG_WINS) {
        battles.add(buildRecord({
          lines, me: req.side.id, myName, decisions: st.decisions, roomId: id,
          team: st.team, result, loss
        })).catch(warn);
      }
    }
  }

  window.AG_HISTORY = {
    parseBattle, matchDecisions, analyzeLoss, buildRecord, cleanLog, snapshot, store, battles, onTick,
    onSaved(f) { listeners.push(f); }
  };
})();
