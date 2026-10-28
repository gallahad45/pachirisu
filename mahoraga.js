/* mahoraga.js - analyse le dataset de combats de P.A.C.H.I.R.I.S.U.
 *
 * Exporte le dataset depuis l'onglet Defaites, puis:
 *   node mahoraga.js pachirisu-dataset.jsonl          rapport lisible
 *   node mahoraga.js pachirisu-dataset.jsonl --json   rapport brut (JSON)
 *
 * Questions auxquelles il repond:
 *  - Quelles regles du tool font perdre des Pokemon quand tu les suis ?
 *  - Le calcul de degats sous-estime-t-il ou surestime-t-il ?
 *  - Qu'est-ce qui revient dans tes defaites (sweepers, bourreaux, hazards) ?
 *
 * Ne s'execute que sur ta machine, ne touche a rien d'autre que le fichier lu.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

/* Reuse the extension's log parser rather than duplicating it. */
function loadHistory() {
  const sb = {
    console, setTimeout, location: { origin: '' },
    document: { documentElement: { dataset: {} } },
    localStorage: { getItem: () => null, setItem: () => {} },
    addEventListener: () => {}, postMessage: () => {}
  };
  sb.window = sb;
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'history.js'), 'utf8'), sb);
  return sb.AG_HISTORY;
}

const pct = (a, b) => (b ? Math.round((100 * a) / b) : null);
const inc = (o, k, n) => { o[k] = (o[k] || 0) + (n === undefined ? 1 : n); };

function compute(records, H) {
  const rep = {
    games: records.length,
    wins: records.filter((r) => r.result === 'win').length,
    losses: records.filter((r) => r.result === 'lose').length,
    rules: {},          // rule -> {n, followed, diedFollowed, diedIgnored, ignored, winFollowed, gamesFollowed}
    calibration: { foe: { n: 0, inside: 0, above: 0, below: 0, worst: [] }, me: { n: 0, inside: 0, above: 0, below: 0, worst: [] } },
    lossReasons: {},
    killers: {},
    sweepers: {},
    follow: { judged: 0, followed: 0, winRateHigh: null, winRateLow: null },
    byTool: {}          // tool version -> {games, wins}
  };
  const gameFollow = [];

  for (const rec of records) {
    const me = rec.me;
    const T = rep.byTool[rec.tool || 'before 1.12'] || (rep.byTool[rec.tool || 'before 1.12'] = { games: 0, wins: 0 });
    T.games++; if (rec.result === 'win') T.wins++;
    const log = H.parseBattle(rec.log || []);
    // Multi-hit moves log one -damage per hit: merge the hits of one use on one target.
    const merged = [];
    for (const h of log.hits) {
      const last = merged[merged.length - 1];
      if (last && last.use === h.use && last.target.side === h.target.side && last.target.species === h.target.species) last.after = h.after;
      else merged.push(Object.assign({}, h, { target: Object.assign({}, h.target), by: Object.assign({}, h.by) }));
    }
    log.hits = merged;
    let judged = 0, followed = 0;

    for (const d of rec.decisions || []) {
      const rule = d.rule || 'unknown';
      const R = rep.rules[rule] || (rep.rules[rule] = { n: 0, followed: 0, ignored: 0, diedFollowed: 0, diedIgnored: 0, gameWinsFollowed: 0 });
      R.n++;
      if (d.followed === true) { R.followed++; if (d.died) R.diedFollowed++; if (rec.result === 'win') R.gameWinsFollowed++; }
      if (d.followed === false) { R.ignored++; if (d.died) R.diedIgnored++; }
      if (d.followed !== null && d.followed !== undefined) { judged++; if (d.followed) followed++; }

      // Calibration: predicted range vs damage actually dealt that turn.
      const check = (bucket, predicted, hit) => {
        const dealt = hit.before - hit.after;
        const C = rep.calibration[bucket];
        C.n++;
        // A KO hides the true damage: we only know it was >= the HP the target had.
        // If it had more HP than our max and still fell, we under-estimated.
        if (hit.after === 0) {
          if (hit.before > predicted.hi + 1) {
            C.above++;
            C.worst.push({ game: rec.id, turn: d.turn, move: predicted.name, predicted: `${predicted.lo}-${predicted.hi}`, dealt: Math.round(dealt), ko: true });
          } else C.inside++;
          return;
        }
        if (dealt < predicted.lo - 1) C.below++;
        else if (dealt > predicted.hi + 1) C.above++;
        else C.inside++;
        const off = dealt > predicted.hi ? dealt - predicted.hi : dealt < predicted.lo ? predicted.lo - dealt : 0;
        if (off > 8) C.worst.push({ game: rec.id, turn: d.turn, move: predicted.name, predicted: `${predicted.lo}-${predicted.hi}`, dealt: Math.round(dealt) });
      };
      if (d.me && !d.forced) {
        for (const t of (d.threats || []).filter((x) => x.kind === 'damage')) {
          const hit = log.hits.find((h) => h.turn === d.turn && h.by.side !== me && h.by.move === t.name
            && h.target.side === me && h.target.species === d.me.name);
          if (hit) check('foe', t, hit);
        }
        if (d.played && d.played.kind === 'move') {
          const m = (d.moves || []).find((x) => x.name === d.played.name && x.kind === 'damage');
          const hit = m && log.hits.find((h) => h.turn === d.turn && h.by.side === me && h.by.move === m.name && h.target.side !== me);
          if (hit) check('me', m, hit);
        }
      }
    }
    rep.follow.judged += judged; rep.follow.followed += followed;
    if (judged >= 3) gameFollow.push({ rate: followed / judged, win: rec.result === 'win' });

    if (rec.result === 'lose' && rec.loss) {
      for (const k of new Set((rec.loss.reasons || []).map((r) => r.kind))) inc(rep.lossReasons, k);
      for (const k of rec.loss.killers || []) inc(rep.killers, k.species, k.n);
      for (const r of (rec.loss.reasons || []).filter((x) => x.kind === 'setup')) {
        const sp = r.text.split(' set up ')[0];
        inc(rep.sweepers, sp);
      }
    }
  }

  // Does following the tool more often go with winning more?
  const hi = gameFollow.filter((g) => g.rate >= 0.7), lo = gameFollow.filter((g) => g.rate < 0.7);
  rep.follow.winRateHigh = hi.length ? pct(hi.filter((g) => g.win).length, hi.length) : null;
  rep.follow.winRateLow = lo.length ? pct(lo.filter((g) => g.win).length, lo.length) : null;
  rep.follow.gamesHigh = hi.length; rep.follow.gamesLow = lo.length;

  // Flag rules whose advice, when followed, loses a mon more often than when ignored.
  rep.suspects = Object.keys(rep.rules).map((k) => {
    const R = rep.rules[k];
    return {
      rule: k, n: R.n,
      diedWhenFollowed: pct(R.diedFollowed, R.followed), diedWhenIgnored: pct(R.diedIgnored, R.ignored),
      followed: R.followed, ignored: R.ignored
    };
  }).filter((x) => x.followed >= 5 && x.ignored >= 3 && x.diedWhenFollowed > x.diedWhenIgnored + 10)
    .sort((a, b) => (b.diedWhenFollowed - b.diedWhenIgnored) - (a.diedWhenFollowed - a.diedWhenIgnored));

  for (const b of ['foe', 'me']) rep.calibration[b].worst.sort((x, y) => y.dealt - x.dealt).splice(8);
  return rep;
}

const RULE_LABEL = {
  'free-switch': 'free switch (immunity)', 'losing-trade': 'losing trade -> switch',
  'losing-gamble': 'losing gamble -> switch', 'outsped-ko': 'it kills you before your KO -> switch', 'clean-kill': 'clean kill, stay',
  'kill-no-return': 'kill with no return, stay', 'preserve-critical': 'preserve a critical mon',
  'preserve-important': 'preserve an important mon', walled: 'walled -> switch',
  'no-offense': 'no offensive move', 'setup-window': 'setup window', 'forced-switch': 'forced switch (KO)',
  'best-move': 'strongest move (default)', 'anti-setup': 'anti-setup (counter)', endgame: 'endgame (cleaner)', 'hazard-plan': 'hazard plan', 'no-offense-fallback': 'switch for lack of a useful move',
  'anti-wall': 'defensive anti-setup', 'stall-spin': 'Rapid Spin against stall', 'stall-out': 'leave Leech Seed / trap', 'anti-stall': 'Taunt against stall', 'asleep': 'asleep'
};
const REASON_LABEL = {
  mvp: 'one of its mons swept you', ignored: 'advice ignored before a KO', setup: 'enemy setup sweep',
  speed: 'outsped', hazards: 'hazards', luck: 'bad luck', residual: 'worn down',
  set: 'unexpected set', matchup: 'bad matchup', close: 'close loss', forfeit: 'forfeit',
  timer: 'timer', unknown: 'nothing clear'
};

function format(rep) {
  const L = [];
  const top = (o, n) => Object.keys(o).sort((a, b) => o[b] - o[a]).slice(0, n);
  L.push('MAHORAGA - P.A.C.H.I.R.I.S.U. adaptation', '');
  L.push(`${rep.games} battles: ${rep.wins} wins, ${rep.losses} losses`
    + (rep.games ? ` (${pct(rep.wins, rep.games)}% win rate)` : ''));
  if (rep.follow.judged) {
    L.push(`Advice followed: ${pct(rep.follow.followed, rep.follow.judged)}% (${rep.follow.followed}/${rep.follow.judged})`);
    if (rep.follow.winRateHigh !== null && rep.follow.winRateLow !== null) {
      L.push(`  when you follow >=70% of advice: ${rep.follow.winRateHigh}% win rate (${rep.follow.gamesHigh} battles)`);
      L.push(`  when you follow less           : ${rep.follow.winRateLow}% win rate (${rep.follow.gamesLow} battles)`);
    }
  }

  const tools = Object.keys(rep.byTool || {});
  if (tools.length > 1) {
    L.push('', 'BY TOOL VERSION');
    for (const k of tools.sort()) L.push(`  ${k.padEnd(12)} ${rep.byTool[k].games} battles, ${pct(rep.byTool[k].wins, rep.byTool[k].games)}% win rate`);
  }

  L.push('', 'RULES (how often my mon fell that turn)');
  const rules = Object.keys(rep.rules).sort((a, b) => rep.rules[b].n - rep.rules[a].n);
  for (const k of rules) {
    const R = rep.rules[k];
    const df = pct(R.diedFollowed, R.followed), di = pct(R.diedIgnored, R.ignored);
    L.push(`  ${(RULE_LABEL[k] || k).padEnd(30)} x${String(R.n).padEnd(4)} followed ${String(R.followed).padEnd(3)}`
      + ` -> KO ${df === null ? '-' : df + '%'} | ignored ${String(R.ignored).padEnd(3)} -> KO ${di === null ? '-' : di + '%'}`);
  }
  if (rep.suspects.length) {
    L.push('', 'SUSPECT RULES (following loses more mons than ignoring):');
    for (const s of rep.suspects) {
      L.push(`  ! ${RULE_LABEL[s.rule] || s.rule}: ${s.diedWhenFollowed}% KO when followed vs ${s.diedWhenIgnored}% when ignored.`);
    }
  } else {
    L.push('', 'No suspect rule so far (needs at least 5 followed and 3 ignored per rule).');
  }

  L.push('', 'DAMAGE CALC (predicted vs actual)');
  for (const [b, label] of [['foe', 'its hits on you'], ['me', 'your hits on it']]) {
    const C = rep.calibration[b];
    if (!C.n) { L.push(`  ${label}: no data yet`); continue; }
    L.push(`  ${label.padEnd(18)}: ${pct(C.inside, C.n)}% within range, ${pct(C.above, C.n)}% above (underestimated), ${pct(C.below, C.n)}% below (overestimated) over ${C.n} hits`);
    for (const w of C.worst.slice(0, 3)) L.push(`      ${w.game} T${w.turn} ${w.move}: predicted ${w.predicted}%, actual ${w.ko ? '>= ' : ''}${w.dealt}%${w.ko ? ' (KO)' : ''}`);
  }

  if (rep.losses) {
    L.push('', 'WHAT KEEPS COMING BACK IN YOUR LOSSES');
    for (const k of top(rep.lossReasons, 6)) L.push(`  ${String(pct(rep.lossReasons[k], rep.losses) + '%').padEnd(5)} ${REASON_LABEL[k] || k}`);
    const killers = top(rep.killers, 5);
    if (killers.length) L.push('', 'NEMESES: ' + killers.map((k) => `${k} (${rep.killers[k]} KO)`).join(', '));
    const sw = top(rep.sweepers, 5);
    if (sw.length) {
      L.push('SETUP SWEEPERS that got you: ' + sw.map((k) => `${k} x${rep.sweepers[k]}`).join(', '));
      L.push('  -> that is the tool\'s "strategic" limit: it does not see setup coming.');
      L.push('     Idea: a rule that raises the threat of boosters when they can set up without dying.');
    }
  }
  return L.join('\n');
}

function readJSONL(file) {
  return fs.readFileSync(file, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean).map((l, i) => {
    try { return JSON.parse(l); } catch (e) { throw new Error(`ligne ${i + 1} illisible : ${e.message}`); }
  });
}

module.exports = { compute, format, readJSONL, loadHistory };

if (require.main === module) {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: node mahoraga.js pachirisu-dataset.jsonl [--json]');
    process.exit(2);
  }
  const rep = compute(readJSONL(file), loadHistory());
  console.log(process.argv.includes('--json') ? JSON.stringify(rep, null, 2) : format(rep));
}
