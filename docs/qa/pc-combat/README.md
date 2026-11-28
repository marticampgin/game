# The Shattered Ring on PC

[Watch the 24-second combat reel](combat.mp4) · [Watch a complete eight-player turn](turn.mp4)

Both recordings capture the playable game at 1440 × 900, with normal-speed animation and the in-game sound enabled. The combat reel cuts between separate encounters. In order, it shows Basic Attack, Bastion Bash, Blood Cleave, Venom Flask, Time Bolt, Whiteout, Cinder Orb, Defend and Scavenge. The encounters use the game engine and a fixed loadout for each clip. Both the caster and the victim are visible through release and recovery.

The uninterrupted turn starts in round 11 of the eight-contender solo seed `ring-at-dusk-3`. Earlier turns were advanced with the engine's normal bot decisions. Moss selects Golden Shell and drives his shield into Rowan. Aster then chooses a reward, announces Time Bolt, casts it at Flint and hands off. The recording ends with the battle log open. [Reward selection](draft.webp) · [Target selection](arena.webp) · [Battle log](journal.webp)

## Conditions and held items

[Watch the 11-second desktop capture with game audio](effects-and-props.mp4) · [Compare all eight conditions](conditions.webp) · [Inspect the reach and drink frames](prop-gestures.webp)

The four clips show a Guardian scavenging in a duel, an injured Berserker drinking Red Tonic, an Alchemist ringing Mender’s Bell, and an eight-seat turn passing from Moss to Cinder. In the last clip, Defend gives Moss a shield. Burn takes 3 HP from Cinder, Poison takes 5 and Doom takes 2. Each tick updates the fighter’s health and surviving conditions while its name is still on screen.

In the original eight-seat replay, separate ticks replaced one another roughly every 280 ms. The default spacing is now 680 ms. A short trail keeps the last three results in view. Skip effects goes straight to the resolved turn, and reduced motion shows stationary receipts. The automated desktop checks also cover both sides of the ring, shielded damage, Scavenge’s bonus reward and labels near the turn portraits.

During a seeded eight-seat game, Flint shield-bashed Juniper as the arena entered round twelve. Blood Moon gave every fighter two Curse stacks together, then Juniper took her personal Burn tick. The round indicator, damage total, target HP and next event all update during that sequence. The screenshot shows the simultaneous applications on all eight seats. [Blood Moon at 1440 × 900](blood-moon.webp)

## What changed under review

- In the first unlabelled recordings, the shield travelled through the opponent and the extended saber slid backward. The near shield rim now stops against the body. A separate counterstep retracts the weapon, transfers weight and catches the landing. A second review caught an empty frame at the change of sheet. Overlapping the painted layers kept all three melee attackers visible in a third frame-by-frame review.
- A shield could conceal the flask impact. The bottle now breaks on the opponent before the ward flashes. Whiteout starts in the caster's hand, drops to the paving and crosses the ring. Scavenge has a visible cache and three coins that travel into the fighter's hand.
- In the recorded round, the engine resolves Bleed and its passive healing before the bash. Those events now play during preparation. Rowan recoils and loses health at the instant of shield contact. The journal retains the full resolution order.
- In eight-seat matches, an acting fighter's gold circle was hard to distinguish from the floor. Jade inlays identify the actor, a gold chevron identifies the target, and the same seat crest appears on the field, turn rail and command portraits. The camera holds its framing when rewards are taken. Keyboard users can close a dialog and return to the control that opened it.
- Each founder has a class-specific equipment check, a braced pose, a hurt reaction and three sets of health-state drawings. In the rear row, the drooping shield, torn cloak and crouched posture read more readily than small painted scratches. [Compare the founders at 100%, 51% and 18% HP](founders.webp).

## Desktop verification

The browser suite exercises two- and eight-seat turns with mouse and keyboard, and tests camera placement and target selection for every roster size in between. Desktop review sizes range from 1280 × 720 to 1920 × 1080. The suite also covers reduced motion, muted audio, legacy skins, missing skins and simultaneous room updates. Twelve seeded duels and twelve seeded eight-seat simulations ran to completion.

In a local Chromium run at 1440 × 900, the median frame interval was 16.7 ms for a two-seat bash, an eight-seat bash and an eight-seat flask throw. The 95th percentile was 16.7–16.8 ms. These timings cover the visible action after the sheets loaded. The fighter illustrations use twelve ordered cels per main motion, with separate countersteps and continuous movement between seats. A separate browser test blocks the main thread for 180 ms across a shield hit and verifies that HP changes on contact drawing 7. A sustained slow-frame test checks that six specific wind-up, contact and recovery drawings still appear.

In the original four-class recording, crests distinguish seats that share a face and costume. The Berserker still straightens quickly after the low cleave in that recording. Readability for first-time players is an open playtest question.

## Eight-class wardrobe

The reference pairs all 24 portraits with their healthy, wounded and critical stances. The full desktop arena shows the eight founders at playing size with their matching turn-order portraits. [Compare the wardrobe](class-outfits.webp) · [Open the eight-class arena](eight-class-ring.webp)

The 1440 × 900 capture shows four playable signatures at normal speed. Riverboat Duelist throws Cut the Deck in a duel, wounded Ossuary Queen casts Soul Tithe in an eight-seat match, critical Carnival Fox uses Mirror Feint in a duel, and Stormglass Engineer closes for Rivet Drive in the full ring. The captures use the normal game controls and frame timings. [Watch the four signatures](class-signatures.webm)

## Outfitter rehearsal

The normal-speed stage recording shows Wolf Tracker striking into open space, opening a coffer and stowing its find. Star Cartographer then casts Time Bolt across the fitting stage. [Watch the gestures](workshop-gestures.mp4)

The 22-second PC walkthrough follows a new profile from the main menu to the locked Wolf Tracker outfit. The player previews the wounded Berserker’s Blood Cleave, takes the outfit into Sandbox, then drafts Fang Shard and lands an 18-damage cleave in a duel. The capture runs uninterrupted at normal speed with game audio. [Watch Wolf Tracker go from Outfitter to arena](wolf-tracker-walkthrough.mp4)
