# Eight-class balance playtest

## Guardian and the armor build

The initial eight-class rules gave Guardian 213 wins in 224 ordinary bot duels. A Guardian that sought out armor, Molten Mail and Haste and used Bash whenever available won **224 of 224**. Across a full eight-seat table, the same specialized plan won **0 of 96**. A large armor total drew concentrated fire from several rivals.

The current rules give Bastion Bash 5 base damage plus half the first 30 armor. Defend grants up to 18 shield per use. Shields still accumulate, and armor above 30 continues to mitigate incoming damage and fuel Fortress Oath. Molten Mail applies 2 Burn on an armor strike. The ability preview reports the resulting Burn, including Phoenix Feather. A slower Bash tested worse because its longer recovery gave the armor build more turns to Defend.

| Guardian strategy on the current rules | Wins | Estimated 95% range |
| --- | ---: | ---: |
| Seek Iron Shards, Stillwater Ring and Fortress Oath against ordinary rivals | 127 / 224 duels (56.7%) | 47.4–65.5% |
| Prioritize Haste, Molten Mail and Amplify as well as armor | 142 / 224 duels (63.4%) | 54.2–71.7% |
| Same optimized Guardian against opponents drafting for armor-piercing Poison or hits and Doom | 111 / 224 duels (49.6%) | 40.5–58.7% |
| Same optimized Guardian against seven ordinary rivals | 0 / 96 matches | 0–7.4% |

These scenarios use the `rivet-armor` seeds. The opponent reads equipped abilities and avoids investing in Poison against a visible Reverse Polarity. Every decision uses a legal command. In the final rules the armor-focused Guardian finished its duels at a median of 124 armor. The more offensive build finished at 100.5.

## Ordinary bots

The independent `bellfoundry-check` set ran 896 duels, 280 four-seat matches and 144 eight-seat matches. Each class appeared 224, 140 and 144 times respectively. Every pair and every four-class lineup participated. A draw counts as a win for neither contender. The set produced 7, 4 and 5 draws respectively.

| Class | Duel wins | Estimated 95% range | Four-seat wins | Eight-seat wins |
| --- | ---: | ---: | ---: | ---: |
| Guardian | 41.5% | 32.8–50.8% | 22.9% | 8.3% |
| Berserker | 57.6% | 48.3–66.3% | 27.1% | 13.2% |
| Chronomancer | 50.0% | 40.9–59.1% | 24.3% | 11.1% |
| Alchemist | 50.0% | 40.9–59.1% | 27.1% | 9.7% |
| Gambler | 50.0% | 40.9–59.1% | 20.7% | 12.5% |
| Necromancer | 52.2% | 43.1–61.3% | 25.0% | 10.4% |
| Trickster | 45.1% | 36.2–54.3% | 22.9% | 14.6% |
| Artificer | 50.4% | 41.3–59.5% | 27.1% | 16.7% |

Alchemist was Guardian’s hardest duel opponent, winning 22 of 32. Alchemist also beat Trickster 27–4 with one draw, and lost 6–26 to Berserker. The second `silent-gear` set reproduced the Alchemist–Trickster mismatch at 25–7. Across the two sets Alchemist’s four-seat results ranged from 27.1% to 37.1%. These matchups deserve human playtests, particularly how often a Trickster player chooses to copy Poison while a cleanse is publicly equipped. A fixed armor build also performed poorly in a crowd despite its strong duel results.

An action trace across 96 Alchemist–Trickster duels counted 2,220 Mirror Feints copying Poison. In 1,131 of those casts the Alchemist already had Reverse Polarity equipped. That ability converts Poison into health and permanent regeneration. Alchemist won 70 of the 79 games where it acquired Reverse Polarity, versus 3 of 17 where it never acquired it. Longer games also create more draft opportunities. This shows how often the bot feeds a visible counter and identifies a decision for human playtesting.

| Table size | Median final round | Median first elimination round | Median credited health damage per seat |
| --- | ---: | ---: | ---: |
| 2 | 38 | 38 | 634.5 |
| 4 | 43.5 | 28.5 | 698.5 |
| 8 | 47 | 23 | 693.5 |

The opening eight-class rules on `silent-gear` gave Alchemist 62 wins in 144 eight-seat matches. The current rules yielded 13 on those same seeds. Bots now consider public regeneration and spell power alongside health, attack and armor. They give a little less priority to rivals who have already drawn several attacks that round. Blood Cleave applies 2 Bleed and recovers in three personal turns. Artificer's draft affinity includes attack, the stat used by its piston.

## Personal objectives

In a separate `coins-and-cloth` sample of 228 starter-pool matches, the two personal objectives awarded a median of 30 coins in duels and 25 coins in both larger formats. Of 928 seats, 141 earned zero objective coins. Lifetime awards are tallied separately. Bots played their ordinary combat strategy with no incentive to chase a quest. At full eight-seat tables, all 88 seats assigned Spellwork completed it, while only 2 of 84 assigned Trail Seeker found time to Scavenge twice. This difference matters when comparing the effort of objective pairs in a crowd.

Repeat the comparison with `node scripts/playtest-roster.js 2 1 coins-and-cloth`, then with `4 1` and `8 16` on the same seed prefix. The output includes completion counts and coin yield for all eight classes.

## Reproducing the matches

Start each seat with the ordinary new-career reward pool. The runner uses a separate deterministic seed for each lineup and repetition, shuffles the initial seat order, then plays twice with reversed seating. The estimated intervals use a Wilson score calculation with one effective observation per paired seed. This conservatively keeps the two results of a shared seed together, including sweeps. The rates describe these policies and draft pools. Human targeting, unlocked licenses and unusual combinations can change them.

```sh
node scripts/playtest-roster.js 2 16 bellfoundry-check
node scripts/playtest-roster.js 4 2 bellfoundry-check
node scripts/playtest-roster.js 8 72 bellfoundry-check
node scripts/playtest-roster.js 2 16 rivet-armor guardian iron
node scripts/playtest-roster.js 2 16 rivet-armor guardian armor
node scripts/playtest-roster.js 2 16 rivet-armor guardian counter
node scripts/playtest-roster.js 8 48 rivet-armor guardian armor
```

Older solo tickets keep their original ability formulas, defense scaling, reward order and bot decisions. Regression tests replay 305 pre-expansion commands and 611 opening-roster commands from persisted untagged state. A separate HTTP check restored real saves produced by builds `efbc5b9` and `acb002b` at command 87, uploaded overlapping 37-command batches, restarted the server midway and retried the final batch. Both verified the original final inventories, health, winner, random generator state and career counters. Duplicate delivery left the wallet and completed-match count unchanged.
