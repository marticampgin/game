# Career and roster design

## From an arena turn to an unlock

A regular solo match or room snapshots each human contender’s reward licenses when it starts. Each contender draws two personal objectives from the match quest catalog. Closing a draft, collecting a shard, using an ability, defending, scavenging or dealing actual damage to another contender’s health can advance the corresponding objective. Each completion pays its listed coins once. Selecting a quest carries no combat bonus. Damage against shields, overkill and damage from the arena do not count toward career damage.

Lifetime milestones include the first completed match, 1,000 damage, ten wins and 12,000 damage. The journal exposes progress and the exact payout. A completed class match requires playing at least one personal turn and reaching elimination or the end of the match. A class’s twelfth completion awards its mastery outfit if it is still unowned. Players who prefer another class can save coins for that outfit instead.

| Class | Founder | 85 coins | 260 coins or class mastery |
| --- | --- | --- | --- |
| Guardian | Founder | Harbor Warden | Sunspire Paladin |
| Berserker | Founder | Wolf Tracker | Ash Dragon |
| Chronomancer | Founder | Star Cartographer | Glass Oracle |
| Alchemist | Founder | Apiarist | Nightshade Apothecary |

Six of the 54 reward entries require a license. Buying one adds it to eligible draws in subsequent matches. Rarity, class weighting, duplicates, prerequisites and slot limits still apply. Players can inspect the entire catalog in the Atlas and experiment in the Sandbox.

### Damage pacing

In 120 seeded starter-pool bot matches, the original four classes dealt median rival-health damage of 701 per seat in duels, 696 in four-seat matches and 755 in eight-seat matches. Each size used 40 seeds with classes rotated around the table (560 seat results). At those rates the old 100,000 target implied roughly 132–144 matches. Ring Veteran now pays 140 coins at 12,000 damage, roughly 16–17 such matches, just beyond the first class mastery. Actual human pace depends on build and survival. Existing career damage applies, and an already paid milestone keeps its award.

## Extending the catalog

- Add a reward and its gameplay effects in `src/game/catalog.js`. To sell a license, register its ID and coin price in `src/game/progression.js`. The Outfitter, Atlas and draft filter read that definition.
- Define a personal or lifetime quest with its description, metric, threshold and coins in the same progression module. For a new metric, increment it at the authoritative gameplay event and cover its edge conditions in a rules test. Existing metrics need only a new catalog entry.
- A new class uses one founding skin, its role in the motion registry and a catalog starting ability. Alternative wardrobes share the same action, health, weapon and equipment attachment contracts. Production costumes include portraits, action sheets and per-band anchors. The [fighter guide](fighter-skins.md) describes the artwork and registration format.
- The current roster has four playable classes. The project brief reserves four future identities. **Gambler** uses rerolls and probability, **Necromancer** uses death and souls, **Trickster** uses copying and hidden information, and **Artificer** uses equipment and upgrades. Their innate abilities and exact numbers belong to their future gameplay passes.

## Persistence

The server awards from its own room state or by replaying a ticketed solo match’s recorded commands. It verifies bot choices, persists a per-run receipt, and sends only the requesting seat’s profile and objectives. Purchases, duplicate submissions, browser reloads and concurrent tabs are covered by tests. The anonymous device key is bound to the browser’s origin. A single Node server owns the configured profile directory. Keep that directory across restarts when retaining careers.
