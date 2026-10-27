/* P.A.C.H.I.R.I.S.U. - profils des equipes meta (teams/ag-meta.txt, teams/ou-meta.txt).
 *
 * Quand ton equipe correspond a un profil (au moins 5 Pokemon sur 6), l'outil
 * utilise ses roles (qui preserver, pourquoi), affiche le travail du Pokemon
 * actif et le plan de la phase en cours, et sait qui est le cleaner de fin de
 * partie.
 *
 * preserve: 0 sacrifiable, 1 normal, 2 important, 3 a garder absolument.
 * lead: bonus pour le choix du lead au teampreview.
 * cleaner: { move, setup } attaque prioritaire de fin de partie et son boost.
 */
(() => {
  'use strict';

  const id = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

  window.AG_TEAMS = [
    {
      id: 'ag-meta',
      name: 'AG meta: offense with two phazers',
      format: 'anythinggoes',
      members: {
        miraidon: { role: 'lead / pivot', preserve: 1, lead: 0.35,
          job: 'Lead. Volt Switch to scout their lead and get out. Its Electric Terrain stops sleep on grounded mons.' },
        tinglu: { role: 'hazards + phaze', preserve: 3,
          why: 'your answer to Baton Pass and setup (Whirlwind)',
          job: 'Lay Spikes (up to 3 layers) when it is safe, then keep Whirlwind for anything that boosts.' },
        hooh: { role: 'mur special + phaze', preserve: 2, why: 'your special wall and your 2nd Whirlwind',
          job: 'Takes special hits and pivots out (Regenerator). Whirlwind the setups. Tera Grass against Water, Electric, Ground and Spore.' },
        koraidon: { role: 'breaker', preserve: 2, why: 'your physical breaker',
          job: 'Swords Dance on a forced switch, then Scale Shot (Loaded Dice). Tera Fire for Flare Blitz.' },
        calyrexshadow: { role: 'sweeper special', preserve: 2, why: 'your special sweeper',
          job: 'Nasty Plot when it can\'t kill you (Focus Sash at full HP), then Astral Barrage.' },
        arceus: { role: 'cleaner', preserve: 3, why: 'your late-game cleaner (Extreme Speed)',
          job: 'Keep it healthy. Swords Dance once Spikes have done their job, then Extreme Speed.',
          cleaner: { move: 'extremespeed', setup: 'swordsdance' } }
      },
      plan: {
        early: 'Early: Miraidon lead, Spikes with Ting-Lu as soon as possible.',
        mid: 'Mid: Koraidon and Calyrex break. Whirlwind anything that boosts or receives a Baton Pass.',
        late: 'Late: +2 Arceus Extreme Speed cleans up what is left.'
      }
    },
    {
      id: 'ou-meta',
      name: 'OU meta: Cinderace balance',
      format: 'ou',
      members: {
        landorustherian: { role: 'hazards / pivot', preserve: 1, lead: 0.35,
          job: 'Lead. Stealth Rock, then U-turn. Intimidate weakens physical attackers.' },
        cinderace: { role: 'hazard control', preserve: 1,
          job: 'Court Change as soon as you have 2 or more hazards on your side. Will-O-Wisp physical attackers, U-turn to pivot.' },
        slowkinggalar: { role: 'pivot defensif', preserve: 2, why: 'your special pivot and your snow',
          job: 'Chilly Reception sets snow and pivots out without losing a turn. Regenerator on every switch.' },
        kyurem: { role: 'breaker special', preserve: 2, why: 'your special breaker',
          job: 'Freeze-Dry the Water types, Earth Power the Steel types. Bulkier in snow.' },
        ogerponwellspring: { role: 'breaker', preserve: 2, why: 'your Swords Dance breaker',
          job: 'Swords Dance on a forced switch, then Ivy Cudgel.' },
        kingambit: { role: 'cleaner', preserve: 3, why: 'your late-game win condition',
          job: 'Save it for the end: the more fainted allies, the harder it hits. Sucker Punch finishes weakened Pokémon.',
          cleaner: { move: 'suckerpunch', setup: 'swordsdance' } }
      },
      plan: {
        early: 'Early: Lando-T sets Stealth Rock, then pivots. Keep your side clean with Court Change.',
        mid: 'Mid: Kyurem and Ogerpon break under Slowking\'s snow. Don\'t lose Kingambit.',
        late: 'Late: Kingambit, Swords Dance then Sucker Punch on what is left.'
      }
    }
  ];

  /* The profile whose members cover at least 5 of our 6 species, or null. */
  window.AG_MATCH_TEAM = function (speciesNames) {
    const ids = new Set(speciesNames.map(id));
    let best = null, bestN = 0;
    for (const p of window.AG_TEAMS) {
      const n = Object.keys(p.members).filter((k) => ids.has(k)).length;
      if (n >= 5 && n > bestN) { best = p; bestN = n; }
    }
    return best;
  };
})();
