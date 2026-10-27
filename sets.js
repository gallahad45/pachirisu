/* AG Copilot - base de sets et inference
 *
 * On ne connait jamais le set adverse. Mais on peut partir de la liste des sets
 * reellement joues en AG, puis eliminer au fur et a mesure que le combat revele
 * des infos: un move vu, un objet revele, un talent, une resistance anormale.
 *
 * spread: profil defensif suppose du set
 *   offense    -> 0 HP / 0 def, max en attaque et vitesse
 *   bulkyphys  -> 252 HP / 252 Def
 *   bulkyspec  -> 252 HP / 252 SpD
 *   mixedbulk  -> 252 HP, defenses partagees
 */
(() => {
  'use strict';

  const S = (name, item, ability, spread, moves, role) =>
    ({ name, item, ability, spread, moves, role });

  window.AG_SETS = {
    koraidon: [
      S('SD Loaded Dice', 'Loaded Dice', 'Orichalcum Pulse', 'offense',
        ['Flare Blitz', 'Low Kick', 'Scale Shot', 'Swords Dance'], 'sweeper'),
      S('SD Life Orb', 'Life Orb', 'Orichalcum Pulse', 'offense',
        ['Close Combat', 'Flare Blitz', 'Outrage', 'Swords Dance'], 'sweeper'),
      S('Choice Band', 'Choice Band', 'Orichalcum Pulse', 'offense',
        ['Close Combat', 'Flare Blitz', 'Outrage', 'U-turn'], 'wallbreaker')
    ],
    miraidon: [
      S('Choice Specs', 'Choice Specs', 'Hadron Engine', 'offense',
        ['Electro Drift', 'Draco Meteor', 'Volt Switch', 'Overheat'], 'wallbreaker'),
      S('Choice Scarf', 'Choice Scarf', 'Hadron Engine', 'offense',
        ['Electro Drift', 'Draco Meteor', 'Volt Switch', 'U-turn'], 'revenge'),
      S('Calm Mind', 'Leftovers', 'Hadron Engine', 'mixedbulk',
        ['Electro Drift', 'Draco Meteor', 'Calm Mind', 'Substitute'], 'sweeper')
    ],
    calyrexshadow: [
      S('Choice Specs', 'Choice Specs', 'As One (Spectrier)', 'offense',
        ['Astral Barrage', 'Psyshock', 'Grass Knot', 'Trick'], 'wallbreaker'),
      S('Life Orb Nasty Plot', 'Life Orb', 'As One (Spectrier)', 'offense',
        ['Astral Barrage', 'Psychic', 'Grass Knot', 'Nasty Plot'], 'sweeper'),
      S('Choice Scarf', 'Choice Scarf', 'As One (Spectrier)', 'offense',
        ['Astral Barrage', 'Psyshock', 'Trick', 'Encore'], 'revenge')
    ],
    zaciancrowned: [
      S('SD Rusted Sword', 'Rusted Sword', 'Intrepid Sword', 'offense',
        ['Behemoth Blade', 'Close Combat', 'Play Rough', 'Swords Dance'], 'sweeper'),
      S('Assault Vest', 'Rusted Sword', 'Intrepid Sword', 'mixedbulk',
        ['Behemoth Blade', 'Close Combat', 'Play Rough', 'Wild Charge'], 'tank')
    ],
    zacian: [
      S('SD Rusted Sword', 'Rusted Sword', 'Intrepid Sword', 'offense',
        ['Behemoth Blade', 'Close Combat', 'Play Rough', 'Swords Dance'], 'sweeper')
    ],
    arceus: [
      S('Extreme Killer', 'Mental Herb', 'Multitype', 'offense',
        ['Extreme Speed', 'Shadow Claw', 'Swords Dance', 'Taunt'], 'cleaner'),
      S('Support', 'Leftovers', 'Multitype', 'mixedbulk',
        ['Judgment', 'Recover', 'Will-O-Wisp', 'Defog'], 'wall')
    ],
    arceusground: [
      S('Dragon Dance', 'Earth Plate', 'Multitype', 'offense',
        ['Earthquake', 'Stone Edge', 'Dragon Dance', 'Taunt'], 'sweeper'),
      S('Defensive', 'Earth Plate', 'Multitype', 'bulkyphys',
        ['Judgment', 'Recover', 'Toxic', 'Stealth Rock'], 'wall')
    ],
    arceusfairy: [
      S('Defensive', 'Pixie Plate', 'Multitype', 'bulkyphys',
        ['Judgment', 'Recover', 'Thunder Wave', 'Power Gem'], 'wall'),
      S('Calm Mind', 'Pixie Plate', 'Multitype', 'mixedbulk',
        ['Judgment', 'Recover', 'Calm Mind', 'Taunt'], 'sweeper')
    ],
    arceuswater: [
      S('Defensive', 'Splash Plate', 'Multitype', 'bulkyphys',
        ['Judgment', 'Recover', 'Toxic', 'Defog'], 'wall')
    ],
    tinglu: [
      S('Hazards', 'Leftovers', 'Vessel of Ruin', 'bulkyspec',
        ['Earthquake', 'Spikes', 'Whirlwind', 'Payback'], 'wall'),
      S('Stealth Rock', 'Leftovers', 'Vessel of Ruin', 'bulkyphys',
        ['Earthquake', 'Stealth Rock', 'Whirlwind', 'Ruination'], 'wall')
    ],
    kingambit: [
      S('Swords Dance', 'Leftovers', 'Supreme Overlord', 'mixedbulk',
        ['Kowtow Cleave', 'Iron Head', 'Sucker Punch', 'Swords Dance'], 'cleaner'),
      S('Choice Band', 'Choice Band', 'Supreme Overlord', 'offense',
        ['Kowtow Cleave', 'Iron Head', 'Sucker Punch', 'Low Kick'], 'wallbreaker')
    ],
    hooh: [
      S('Defensive', 'Heavy-Duty Boots', 'Regenerator', 'bulkyspec',
        ['Sacred Fire', 'Brave Bird', 'Recover', 'Whirlwind'], 'wall'),
      S('Offensive', 'Heavy-Duty Boots', 'Regenerator', 'offense',
        ['Sacred Fire', 'Brave Bird', 'Earthquake', 'Substitute'], 'wallbreaker')
    ],
    kyogre: [
      S('Choice Specs', 'Choice Specs', 'Drizzle', 'offense',
        ['Water Spout', 'Origin Pulse', 'Ice Beam', 'Thunder'], 'wallbreaker'),
      S('Choice Scarf', 'Choice Scarf', 'Drizzle', 'offense',
        ['Water Spout', 'Origin Pulse', 'Ice Beam', 'Thunder'], 'revenge'),
      S('Defensive', 'Leftovers', 'Drizzle', 'bulkyspec',
        ['Origin Pulse', 'Ice Beam', 'Calm Mind', 'Rest'], 'wall')
    ],
    groudon: [
      S('Swords Dance', 'Life Orb', 'Drought', 'offense',
        ['Precipice Blades', 'Stone Edge', 'Swords Dance', 'Fire Punch'], 'sweeper')
    ],
    eternatus: [
      S('Defensive', 'Black Sludge', 'Pressure', 'bulkyphys',
        ['Dynamax Cannon', 'Toxic', 'Recover', 'Toxic Spikes'], 'wall'),
      S('Offensive', 'Life Orb', 'Pressure', 'offense',
        ['Dynamax Cannon', 'Sludge Bomb', 'Fire Blast', 'Recover'], 'wallbreaker')
    ],
    giratinaorigin: [
      S('Defog', 'Griseous Core', 'Levitate', 'mixedbulk',
        ['Shadow Force', 'Defog', 'Will-O-Wisp', 'Dragon Tail'], 'wall'),
      S('Offensive', 'Griseous Core', 'Levitate', 'offense',
        ['Shadow Force', 'Shadow Sneak', 'Outrage', 'Stone Edge'], 'wallbreaker')
    ],
    necrozmaduskmane: [
      S('Dragon Dance', 'Weakness Policy', 'Prism Armor', 'offense',
        ['Sunsteel Strike', 'Photon Geyser', 'Dragon Dance', 'Earthquake'], 'sweeper')
    ],
    deoxysspeed: [
      S('Offensive lead', 'Focus Sash', 'Pressure', 'offense',
        ['Psycho Boost', 'Skill Swap', 'Spikes', 'Taunt'], 'lead'),
      S('Hazard lead', 'Focus Sash', 'Pressure', 'offense',
        ['Stealth Rock', 'Spikes', 'Taunt', 'Magic Coat'], 'lead')
    ],
    smeargle: [
      S('Sticky Web lead', 'Focus Sash', 'Own Tempo', 'offense',
        ['Sticky Web', 'Spore', 'Stealth Rock', 'Whirlwind'], 'lead'),
      S('Baton Pass', 'Focus Sash', 'Own Tempo', 'offense',
        ['Spore', 'Shell Smash', 'Baton Pass', 'Substitute'], 'support')
    ],
    deoxysattack: [
      S('Sash lead', 'Focus Sash', 'Pressure', 'offense',
        ['Psycho Boost', 'Superpower', 'Knock Off', 'Extreme Speed'], 'lead'),
      S('Stored Power', 'Focus Sash', 'Pressure', 'offense',
        ['Stored Power', 'Nasty Plot', 'Psycho Boost', 'Extreme Speed'], 'wallbreaker')
    ],
    ditto: [
      S('Choice Scarf Imposter', 'Choice Scarf', 'Imposter', 'mixedbulk',
        ['Transform'], 'revenge')
    ],
    rayquaza: [
      S('Dragon Dance', 'Life Orb', 'Air Lock', 'offense',
        ['Dragon Ascent', 'Dragon Dance', 'Earthquake', 'Extreme Speed'], 'sweeper')
    ],
    xerneas: [
      S('Geomancy', 'Power Herb', 'Fairy Aura', 'offense',
        ['Geomancy', 'Moonblast', 'Thunder', 'Focus Blast'], 'sweeper')
    ],
    yveltal: [
      S('Defensive', 'Heavy-Duty Boots', 'Dark Aura', 'bulkyspec',
        ['Oblivion Wing', 'Foul Play', 'Toxic', 'Roost'], 'wall'),
      S('Offensive', 'Life Orb', 'Dark Aura', 'offense',
        ['Oblivion Wing', 'Dark Pulse', 'Heat Wave', 'Roost'], 'wallbreaker')
    ],
    chienpao: [
      S('Choice Band', 'Choice Band', 'Sword of Ruin', 'offense',
        ['Icicle Crash', 'Crunch', 'Sacred Sword', 'Ice Shard'], 'wallbreaker'),
      S('Swords Dance', 'Heavy-Duty Boots', 'Sword of Ruin', 'offense',
        ['Icicle Crash', 'Crunch', 'Swords Dance', 'Ice Shard'], 'sweeper')
    ],
    urshifurapidstrike: [
      S('Choice Band', 'Choice Band', 'Unseen Fist', 'offense',
        ['Surging Strikes', 'Close Combat', 'Aqua Jet', 'U-turn'], 'wallbreaker')
    ],
    urshifu: [
      S('Choice Band', 'Choice Band', 'Unseen Fist', 'offense',
        ['Wicked Blow', 'Close Combat', 'Sucker Punch', 'U-turn'], 'wallbreaker')
    ],
    landorustherian: [
      S('Choice Scarf', 'Choice Scarf', 'Intimidate', 'offense',
        ['Earthquake', 'Stone Edge', 'U-turn', 'Crunch'], 'revenge'),
      S('Defensive', 'Leftovers', 'Intimidate', 'bulkyphys',
        ['Earthquake', 'Stealth Rock', 'U-turn', 'Toxic'], 'wall')
    ],
    glimmora: [
      S('Hazard lead', 'Focus Sash', 'Toxic Debris', 'offense',
        ['Stealth Rock', 'Spiky Shield', 'Mortal Spin', 'Earth Power'], 'lead')
    ],
    ribombee: [
      S('Sticky Web', 'Focus Sash', 'Shield Dust', 'offense',
        ['Sticky Web', 'Moonblast', 'Stun Spore', 'U-turn'], 'lead')
    ],
    grimmsnarl: [
      S('Screens', 'Light Clay', 'Prankster', 'mixedbulk',
        ['Reflect', 'Light Screen', 'Spirit Break', 'Thunder Wave'], 'support')
    ],
    gholdengo: [
      S('Nasty Plot', 'Leftovers', 'Good as Gold', 'mixedbulk',
        ['Make It Rain', 'Shadow Ball', 'Nasty Plot', 'Recover'], 'sweeper')
    ],
    blissey: [
      S('Cleric', 'Heavy-Duty Boots', 'Natural Cure', 'bulkyspec',
        ['Seismic Toss', 'Soft-Boiled', 'Toxic', 'Teleport'], 'wall')
    ],
    clodsire: [
      S('Unaware', 'Leftovers', 'Unaware', 'bulkyspec',
        ['Earthquake', 'Recover', 'Toxic', 'Toxic Spikes'], 'wall')
    ],
    skeledirge: [
      S('Unaware', 'Heavy-Duty Boots', 'Unaware', 'mixedbulk',
        ['Torch Song', 'Slack Off', 'Will-O-Wisp', 'Hex'], 'wall')
    ],
    alomomola: [
      S('Wish Tect', 'Rocky Helmet', 'Regenerator', 'bulkyphys',
        ['Wish', 'Protect', 'Flip Turn', 'Scald'], 'wall')
    ],
    dialgaorigin: [
      S('Offensive', 'Adamant Crystal', 'Pressure', 'mixedbulk',
        ['Roar of Time', 'Flash Cannon', 'Draco Meteor', 'Stealth Rock'], 'wallbreaker')
    ],
    palkiaorigin: [
      S('Choice Specs', 'Lustrous Globe', 'Pressure', 'offense',
        ['Spacial Rend', 'Hydro Pump', 'Draco Meteor', 'Fire Blast'], 'wallbreaker')
    ],
    ogerponwellspring: [
      S('Swords Dance', 'Wellspring Mask', 'Water Absorb', 'offense',
        ['Ivy Cudgel', 'Power Whip', 'Swords Dance', 'Horn Leech'], 'sweeper')
    ],
    ogerponhearthflame: [
      S('Swords Dance', 'Hearthflame Mask', 'Mold Breaker', 'offense',
        ['Ivy Cudgel', 'Power Whip', 'Swords Dance', 'Horn Leech'], 'sweeper')
    ]
  };

  /* ---------------------------------------------------------------- */
  /* Inference                                                        */
  /* ---------------------------------------------------------------- */

  const id = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

  /* Returns { sets, moves, spread, narrowed, total }
   *  sets    : candidate sets still possible
   *  moves   : union of their moves, seen ones first
   *  spread  : most likely defensive profile among candidates
   *  narrowed: true if revealed info eliminated at least one set */
  window.AG_INFER = function infer(speciesName, revealed, format) {
    revealed = revealed || {};
    const seenMoves = (revealed.moves || []).map(id);
    const seenItem = id(revealed.item);
    const seenAbility = id(revealed.ability);

    // Sets from the Smogon stats of this format (sets-meta.js) when we have them,
    // else the hand-written AG base below.
    const meta = format && window.AG_META && window.AG_META[format];
    const all = (meta && meta.sets[id(speciesName)]) || window.AG_SETS[id(speciesName)] || [];
    const total = all.length;

    let cands = all.slice();

    if (seenItem) {
      const f = cands.filter((s) => id(s.item) === seenItem);
      if (f.length) cands = f;
    }
    if (seenAbility) {
      const f = cands.filter((s) => id(s.ability) === seenAbility);
      if (f.length) cands = f;
    }
    for (const mv of seenMoves) {
      const f = cands.filter((s) => s.moves.some((m) => id(m) === mv));
      if (f.length) cands = f;
    }

    // Union of candidate moves, with anything actually observed listed first.
    const out = [];
    const push = (m) => { if (!out.some((x) => id(x) === id(m))) out.push(m); };
    for (const m of (revealed.moves || [])) push(m);
    for (const s of cands) for (const m of s.moves) push(m);

    // Most common spread among the survivors.
    const tally = {};
    for (const s of cands) tally[s.spread] = (tally[s.spread] || 0) + 1;
    let spread = 'offense', best = -1;
    for (const k of Object.keys(tally)) if (tally[k] > best) { best = tally[k]; spread = k; }

    return {
      sets: cands,
      moves: out,
      spread,
      narrowed: total > 0 && cands.length < total,
      total,
      hasData: total > 0
    };
  };
})();
