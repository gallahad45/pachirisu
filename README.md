<p align="center"><img src="icons/icon128.png" width="96" alt=""></p>

# P.A.C.H.I.R.I.S.U.

> **P**ocket **A**ssistant for **C**ombat, **H**yper-**I**ntelligent **R**odent: **I**nsolent, **S**arcastic, yet **U**seful.

An **experience enhancer** for beginner and intermediate Pokémon Showdown players.

It is not a bot, and it doesn't claim to find *the* optimal line. It reads the
battle, guesses the opponent's set, and shows you **everything you can do that
isn't a blunder, ranked by efficiency**: damage, KOs, who moves first, switches
that hold, setup threats. You make the call.

And because Showdown deserves better, it adds **animations**: anime cinematics on
the big moments, Mahoraga's wheel when you lose a Pokémon, a Pachirisu mascot that
comments on the game, and battle music.

**It only displays. It never clicks. It sends nothing to the server.**

## Install

1. Download this repository (Code > Download ZIP) and unzip it somewhere it will stay.
2. Open `chrome://extensions` (or `edge://extensions`, `brave://extensions`).
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and pick the folder that contains `manifest.json`.
5. Open https://play.pokemonshowdown.com/ in a **new** tab.

Chrome, Edge, Brave, Opera or Vivaldi 111 or newer. Firefox isn't supported.

In a battle, the panel opens **in the chat column** with tabs at the top right:
`Chat` / `Battle` / `Log` (your choice is remembered). On a screen too narrow for
that column it becomes a floating panel you can drag. It only adds its own
elements to the page: it never changes, hides or clicks anything of Showdown's.

## What it shows

**At team preview**: your best leads against their team (who outspeeds, who
OHKOs, who walls), a suggested lead based on usage stats, and warnings (Ditto).

**In battle**:

- **In your shoes**: what the tool would do, and why.
- **Your moves**, ranked: damage range, KO / possible KO, Focus Sash or Sturdy,
  and whether each move goes **before or after** its most dangerous attack
  (priority first, then Speed, Trick Room and Tailwind included).
- **Dangers**: its attacks on you, speed risk, setup threats with the counter you
  have, Baton Pass teams, evasion, sleep (who is immune, Sleep Clause or not).
- **Switches**, ranked, with a reason each: damage taken on entry, hazards,
  immunity, return damage. It won't send you straight back to the mon you just
  pulled out.
- **Game plan** when your team matches one of the two meta profiles in `teams/`.

## How it thinks

- **Set inference**: Smogon usage stats (`sets-meta.js`) for Anything Goes and OU,
  official Random Battle sets (`randbats.js`), narrowed by every move, item and
  ability revealed. When all remaining sets agree on an item or ability, it is
  assumed (Lugia's Multiscale, a Scarf every set runs).
- **Damage calc** (Gen 9): levels, Random Battle spreads, Tera (Stellar included),
  weather, terrains (and grounded checks), screens, crits, burn, multi-hit,
  Transform / Imposter, variable-power moves (Low Kick, Stored Power, Last Respects,
  Rage Fist, Payback...), Foul Play, Body Press, Photon Geyser, Judgment, Tera Blast,
  and the abilities and items that matter (Protosynthesis / Quark Drive, Mold
  Breaker, Unaware, Multiscale, Disguise, Fluffy, Technician, -ate abilities, Life
  Orb, Choice items, type boosters, Assault Vest, Eviolite, Air Balloon, resist
  berries, and more). Accuracy: about 1 HP from the official Smogon calc.
- **Speed**: worst case for the opponent, then corrected by what the turns already
  played showed (if you moved first at equal priority, it is slower than you).
- **Defensive setup and stall**: it simulates two Stockpile / Iron Defense / Cosmic
  Power boosts and warns you when your best hit would no longer beat its recovery,
  with the answer you have (Haze, phaze, Encore, Taunt, an Unaware switch, or a move
  that ignores boosts). It shows what eats you each turn (Leech Seed, Sand Tomb and
  other traps, Salt Cure, poison...) and how many turns you have left, never tells
  you to switch while you are trapped, and suggests Rapid Spin or Taunt when they
  get you out.
- **Taunt and sleep**: if the foe has Taunt, it stops offering status answers it
  would block (Whirlwind and Roar always go after it). When your mon is asleep it
  shows the odds of waking up this turn, and suggests Sleep Talk or a switch.
- **Endgame details**: no phazing or hazards against its last Pokémon; fixed-damage
  moves (Ruination, Super Fang, Seismic Toss...) are calculated and go through
  Defense boosts; Perish Song count with a switch on the last turn; Choice lock
  flagged with a switch when the locked move is useless; physical hits on a Toxic
  Debris Glimmora are marked.
- **Immunities**: types, abilities, items, type changes (Protean, Libero, Soak,
  Trick-or-Treat), and anything that already "doesn't affect" that mon this battle
  (it catches Illusion).

## Loss log, dataset and Mahoraga

Every lost battle goes into the **Log** tab with the likely reasons (a mon that
swept you, advice ignored before a KO, outsped, hazards, setup sweep, bad luck...).
Every battle (wins too) is also kept in full for analysis: the log without chat,
your exact team, and at each decision what the tool saw, what it suggested and
what you played.

Export the dataset from the Log tab, then:

```
node mahoraga.js pachirisu-dataset.jsonl
```

The report tells you, for each advice rule, how often you lose a mon when you
follow it versus when you ignore it, whether the damage calc under- or
over-estimates, your win rate per tool version, and what keeps coming back in
your losses.

## Animations

One cinematic at a time; the battle music pauses while it plays.

| Moment | Clip |
|---|---|
| Both actives at 10% or less | JoJo face-off, FINAL FACE OFF |
| It makes a big blunder / its boosted mon gets phazed | Death Note, KEIKAKU DŌRI / BOOSTS GONE |
| You make a big blunder | BLUNDER |
| A Pokémon falls in one hit from full HP | ONE SHOT |
| A move misses | UFC, MISS |
| Critical hit | Hollow Purple |
| Turn 60 | Gojo vs Sukuna, BLOW FOR BLOW |
| First KO of the battle, then 2nd / 3rd / 4th / 5th KO by the same mon | First Blood, Double Kill, Triple Kill, TRVE POKEMASTER, Monster Kill |
| Your second-to-last mon falls | LAST ONE, or a hype clip if your last one can win alone |
| You win with one mon left | ORA ORA ORA, or the rest of the hype clip |

Small overlays on the sprite: a boost aura when a mon sets up, Zoro in the rain
when a mon survives on 1 HP. Mahoraga's wheel turns one notch each time you lose a
Pokémon ("P.A.C.H.I.R.I.S.U. will remember this."). Battle music loops during your
games and switches track at turn 40.

## Files

| File | Role |
|---|---|
| `copilot.js` | Reads the battle, damage calc, speed, UI |
| `advisor.js` | The advice rules (each has a stable id for Mahoraga) |
| `sets.js`, `sets-meta.js`, `randbats.js` | Set data and inference |
| `teams.js`, `teams/` | The two meta team profiles and importable teams |
| `history.js` | Loss log and dataset |
| `cinematics.js`, `mascot.js`, `music.js` | Animations, Pachirisu, music |
| `bridge.js` | Storage bridge (the only script outside the page's world) |
| `mahoraga.js` | Offline dataset analysis (Node) |

## Limits

- It reasons about the current turn. It doesn't plan "keep this mon for turn 12";
  team profiles are an approximation of that.
- An off-meta set will fool the inference until it reveals itself.
- No Gravity, no doubles.
- For exact calcs, Showdex is better. Both run together without conflict.

## Media

The images, clips and sounds in `assets/` are excerpts from works that belong to
their owners (Pokémon, JoJo's Bizarre Adventure, Death Note, Jujutsu Kaisen, One
Piece, Deltarune, Overlord and others). They are not covered by this repository's
code and are here for personal, non-commercial use only.
