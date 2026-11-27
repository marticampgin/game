# The Shattered Ring in play

[Watch the 18-second turn recording](arena-turn.mp4). Moss inspects Golden Shell, takes it, aims Bastion Bash at Rowan and crosses the ring. The next bot, Aster, announces Time Bolt against Flint before the projectile travels. The recording ends with the battle log open. It comes from a live 1440 × 900 Chromium session at normal bot speed, with sound off.

The recording begins in round 11 of the eight-seat solo seed `ring-at-dusk-3`. The shared match engine played the earlier turns through its normal bot commands. The captured draft, target selection and confirmation used the game controls. In seat order, the lineup is Moss (Guardian), Cinder (Berserker), Ember (Chronomancer), Rowan (Guardian), Juniper (Alchemist), Aster (Chronomancer), Flint (Guardian) and Vesper (Berserker).

| View | Draft | Action |
| --- | --- | --- |
| Eight contenders, desktop at 1672 × 941 | [Inspecting Fortune Chip](desktop-draft.webp) | [Aiming a shield bash](desktop.webp) |
| Eight contenders, phone at 390 × 844 | [All three rewards above the recap](phone-draft.webp) | [Vesper selected on the field](phone.webp) |
| Two contenders, phone at 390 × 844 | | [Venom Flask in flight](duel-phone.webp) |

## What the visual review changed

- A foreground fighter could hide a rear fighter’s HP while the draft was open. We staggered the seats and adjusted fighter scale on the shallower draft floor. The browser tests check which element actually receives a tap at the center of every name and HP label, before and after the draft, for every roster size from two to eight.
- An eight-seat room can contain eight players of the same class. Names on desktop portraits and short labels on phones now identify the player. Matching names fall back to a stable seat number. Full names and builds are available by tapping the portrait.
- Landing a hit now changes the HP bar, number and damaged outfit on the impact frame. The melee and projectile checks sample the wind-up and reaction separately and measure the burst against the chosen target. At rest, each class has its own equipment gestures, damaged props and critical posture. [Compare all four founder skins at two sizes](founder-health.png).
- The turn recap identifies the actor, target, outcome and next decision. The journal groups events under the turn on which they occurred and attributes delayed effects to their source. An open journal preserves the reader’s search and place as the room advances. [Read the recorded turn in the journal](journal.webp).

## Verification

- The desktop and touch room matrix used two and eight human-controlled seats. Two independent browser clients played and observed the handoff. Each seat’s server view was checked for the same outcome and appropriate private draft data.
- Automated checks cover target selection, item replacement, repeated names, long loadouts, keyboard use, action cancellation, reduced motion, knockouts, revivals, hidden choices, bot takeover and skin persistence. All 36 browser tests passed in each of Chromium, Firefox and WebKit. All 72 Node rules and server tests passed.
- In a separate eight-seat phone run with Chromium CPU throttling set to 4×, the first visible impact followed the start of Bastion Bash by 474 ms and Time Bolt by 627 ms. The viewport stayed at 390 pixels through both handoffs. These are observations from that run.
- Twelve seeded duels and twelve seeded eight-seat simulations played to completion. The seed prefix was `arena-qa`.
- The phone captures used a touch-enabled browser viewport. Physical-device frame pacing, thumb reach and players’ ability to recognize an attack at a glance still need a hands-on playtest. On the smallest screens, the critical pose and lowered weapon are easier to distinguish than individual chips in the armor.
