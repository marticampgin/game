# Authoring fighter skins

A skin identifies the same fighter across idle, attacks, reactions and three levels of injury. The four founders have separate head portraits for the command deck, class selection and turn order. Their full-body drawings use the arena’s dusk palette.

## Framing and health

Paint the fighter facing right in a **208 × 166 pixel** transparent cel. The standing body is about 120 pixels high, centered on **x = 104** with the feet on the **y = 144** baseline. The camera mirrors the cel for left-facing seats. Allow room for the weapon on either side and keep the soles planted between idle drawings. The back row of a PC arena is a good place to judge a face, broken shield or vial at playing size.

All sheets use the same health bands in the same order. Healthy fighters are above 65% HP, wounded fighters are above 30% through 65%, and critical fighters have 30% or less. Each band has its own paintings. In particular, damaged equipment and a lowered posture persist into the attack.

## Standing, motion and footwork sheets

| Asset | Dimensions | Paintings |
| --- | --- | --- |
| Standing, required | 832 × 1494, four columns and nine rows | Three rows per health band |
| Motion, optional | 2496 × 3486, twelve columns and twenty-one rows | Seven clips per health band |
| Return footwork, optional | 832 × 498, four columns and three rows | One counterstep sequence per health band |
| Ambient gesture, optional | 2496 × 498, twelve columns and three rows | One equipment check per health band |
| Drink and use, optional | 2496 × 498, twelve columns and three rows | One reach, raise, hold and return sequence per health band |

Pack cels edge to edge with transparent space inside each cel. PNG and lossless WebP are both supported. Older standing sheets remain usable on their own.

For the standing sheet, repeat the following three rows in each health band.

| Row | Left to right |
| --- | --- |
| 1 | Idle, breathe, inspect equipment, settle |
| 2 | Wind-up, strike, channel, release |
| 3 | Guard, hurt, fallen, victory |

Within each motion band, the seven rows are **idle, basic attack, signature, cast, utility, brace and hurt**. Number the twelve drawings within each row from zero. The actor’s release or contact lands on frame 7 of an offensive clip. Wound recoil peaks on frame 2 and the braced guard holds through frames 6–9. Frame 11 returns to the resting stance. The idle loops into frame 0 with feet on the same baseline. Utility handles a low search or pickup. Brace keeps the hands, equipment and eyes up in guard.

The footwork sheet has four drawings per band. The fighter faces the rival throughout the return. Retract the weapon and load the front leg, draw the boot under the hip, reach back with the opposite boot, then catch the weight with bent knees.

The ambient sheet starts and ends in the normal resting pose. Frames 5–7 hold a short, recognizable equipment check, such as the Guardian inspecting a gauntlet or the Alchemist checking a vial. Keep the boot soles planted. An attack can interrupt this short gesture at any time.

The consume strip drives drinks and held items. Start at rest, reach to the belt, raise the empty grip, hold it at the face or chest, then lower it. The runtime adds the bottle or item to the grip. Use each character’s own shoulders, wrists and weight shift. A skin with the motion sheet alone uses its braced pose for this gesture. A standing-only skin uses its guard painting.

## Which animation plays

A reward definition supplies the action’s category, target and effects. The acting character supplies the drawings. For example, a new enemy-targeted consumable with a Shock status spins toward its target and bursts with a Shock impact even when its ID has never appeared in the animation code. A new self-targeted healing flask uses the same drink strip as Red Tonic. A self-targeted rune consumable uses the held-item gesture.

| Action | Body and staging |
| --- | --- |
| Waiting | Loop idle with occasional equipment checks. A command interrupts the check. |
| Weapon strike | Approach, contact, counterstep and return. The fighter’s weapon determines the ordinary strike. Armor-scaled hits use the shield bash. |
| Native signature | The ability named in the class's `ability` field uses the painted signature clip. When another fighter acquires that ability it performs the same movement and effect with its own attack or cast drawings. |
| Spell or throw | Channel, release, then allow travel time before contact. Status keys color the projectile and impact. |
| Guard | Brace, hold and recover. |
| Scavenge | Reach down and collect the loot at the fighter’s forward foot. |
| Drink or use | Raise the hand to the mouth or chest. Reuse the same painting sequence for bottles, bells and activated items. |
| Hit and recovery | Enter the hurt clip on impact, update the health band and recover in that band. Lethal damage selects fallen. The surviving winner has a victory pose. |

Override a move only when its delivery needs different staging. Whiteout declares `presentation: { move: 'wave' }`; its Chill effect supplies the frost art. A healing item can declare `presentation: { move: 'ring', prop: 'bell' }`. The supported moves, effect atlas rows, projectile types, release times and impact times live together in [combat-motion.js](../public/combat-motion.js). The chosen gesture also selects the sound at contact.

## Reusing a condition

A spell or consumable that inflicts an existing status inherits its on-target animation, stack icon and timed damage readout. Give the reward its ordinary status effect in the catalog. Burn, Poison, Bleed, Shock, Chill, Freeze, Curse and Doom each have their own drawing. Applications, ticks and removals use the same identity throughout the arena, result strip and battle log.

To paint a new condition, register its row, color, target anchor and sound in [status-effects.js](../public/status-effects.js) and extend the [status art generator](../scripts/build-status-effects.py). Update both atlas grids for the new row. Rebuild the sheets and check an application, a shielded tick if applicable, and removal on a rear seat. The [desktop examples](qa/pc-combat/conditions.webp) show the eight founder conditions at playing size.

## Founder art sources

The individual base and breakdown paintings are packed under [scripts/art/founders](../scripts/art/founders). Each class has 16 primary paintings and four extra weapon or arm breakdowns in each of the three health bands. The builder registers the painted surfaces to create intermediate exposures, keeps the hard silhouette edge, preserves the original color palette and packs the sheets for the browser. Each class also has twelve separately painted footwork drawings in the shipped footwork sheet.

With Python, Pillow, NumPy and OpenCV installed, regenerate the standing and motion atlases and save a health-stage comparison. The game serves prebuilt images directly.

```sh
python -m pip install pillow numpy opencv-python-headless
python scripts/build-fighter-skins.py --review founder-health.png
```

## Registration and roster

### Painting an outfit

The alternate outfits use [twenty painted poses per health band](../scripts/art/costumes) and one separate portrait. Keep the costume’s distinguishing equipment visible in profile. Paint its damaged form into each wounded and critical pose so it stays damaged when the fighter attacks, kneels or drinks.

The [outfit reference](qa/pc-combat/class-outfits.webp) shows each portrait beside its healthy, wounded and critical stance. Compare the silhouettes at playing size in the [eight-contender desktop arena](qa/career/arena.webp).

Lay out the twenty right-facing poses on a transparent board. Leave a gap between adjacent silhouettes, including extended weapons. Each row reads from left to right.

| Row | 1 | 2 | 3 | 4 | 5 |
| --- | --- | --- | --- | --- | --- |
| 1 | Rest | Breathe | Equipment check | Reach to cache | Basic anticipation |
| 2 | Basic wind-up | Basic contact | Basic recovery | Signature anticipation | Signature wind-up |
| 3 | Signature contact | Signature recovery | Cast wind-up | Cast release | Brace |
| 4 | Hit reaction | Empty grip at belt | Empty grip at lips | Load front foot | Step back |

Use the [costume builder](../scripts/build-costume-skins.py) to register each painting against the class stance. It keeps a common scale for a board, locates both boots, and retains detached hair tips, glass and spell particles. The registered masters live at `scripts/art/costumes/<id>/<health>.webp`. The rebuild makes 372 playable cels and the inspection model from those three masters. The profile portrait is packed separately.

```sh
python scripts/build-costume-skins.py --skin harbor-warden --class-id guardian --health healthy --import-board healthy.png
python scripts/build-costume-skins.py --skin harbor-warden --class-id guardian --health wounded --import-board wounded.png
python scripts/build-costume-skins.py --skin harbor-warden --class-id guardian --health critical --import-board critical.png
python scripts/build-costume-skins.py --skin harbor-warden --import-portrait portrait.png
python scripts/build-costume-skins.py --skin harbor-warden
```

Measure the occupied waist in the rest pose, the hand and mouth in the two empty-grip poses, and the cache beside the reaching hand. Register those four points for each health band. A painted weapon remains with its outfit through every take. Acquired trinkets and held consumables use the shared renderer at the measured sockets.

### Registering the art

The runtime and atlas builder read the frame layout, artistic defaults and skin registrations in [fighter-kit.json](../public/fighter-kit.json). Place alternate artwork under `public/assets/skins/` and append a descriptor to the manifest’s `skins` array. IDs start with a lowercase letter and support lowercase letters and digits separated by single hyphens, up to 40 characters total.

```json
{
  "classId": "guardian",
  "id": "dawn-order",
  "name": "Dawn Order",
  "sheet": "/assets/skins/dawn/standing.png",
  "motions": "/assets/skins/dawn/motions.webp",
  "footwork": "/assets/skins/dawn/footwork.webp",
  "ambient": "/assets/skins/dawn/ambient.webp",
  "consume": "/assets/skins/dawn/consume.webp",
  "portrait": "/assets/skins/dawn/head.webp",
  "model": "/assets/skins/dawn/full.png",
  "anchors": {
    "mouth": [112, 41],
    "hand": [122, 81],
    "wounded": { "mouth": [111, 47] },
    "critical": { "mouth": [109, 61], "hand": [119, 86] }
  }
}
```

Only the class, ID and standing sheet are required. The turn rail and command deck use the portrait. Inspection uses the full model. Omitted portraits and models use the class art. Optional anchor pairs are pixel coordinates from the top left of the right-facing cel. Use a `healthy`, `wounded` or `critical` object when a painted pose moves the mouth, grip or cache. In the example a wounded fighter keeps the usual hand position. The critical fighter lowers both hand and mouth. Each missing point falls back to the skin’s shared point, then the class’s band or shared point, then the default humanoid for that band. Class artists can supply the same `anchors` object in their founder entry. Measure the hand at the center of the belt grip and the mouth where the bottle neck should touch the lips. A held item stops halfway between these points. Place the ground anchor at the center of the cache’s base beside the forward boot. The renderer handles facing and display scale. Pack authors can also call `registerFighterSkin(classId, id, descriptor)` during startup. The older positional call for standing, motion, footwork and ambient sheets remains supported.

For a new class, define its stats and signature `ability` in [catalog.js](../src/game/catalog.js). Add one entry in the manifest’s `founders` object for its weapon, emblem, display title and available layers. Supply `/assets/skins/<class>-founder.png` and `/assets/skins/<class>-<layer>.webp` for each declared layer, plus `/assets/portrait-<class>.webp` and `/assets/<class>.png`. A class with only standing art can start with an empty layer list. Weapon choices include hammer, saber, dagger, focus and sickle; a new weapon uses the standard swing until it needs a distinct movement.

Validate the packed sheet sizes, every cel and the three band openings before inspecting in-game playback. The checker needs Pillow and reads the same manifest as the game.

```sh
python scripts/check-fighter-skins.py
python scripts/check-fighter-skins.py --class-id guardian --skin dawn-order
node --test tests/animation-grammar.test.js
```

Open the desktop lobby and select the class. When it has alternate registrations, the **Skin** menu previews the selected portrait and model. Choose a costume before starting a solo match or creating/joining a free-choice room. In a draft or randomly assigned room, the menu follows the assigned class in the waiting lobby. Guests and hosts can change their own costume until the host starts. Set `name` in the manifest to control the display label. The default capitalizes words in the skin ID.

For a match created in code, pass the optional `skinId` in the original roster. The match saves the ID, projects it to the other seats and retains it for replays. Clients missing a registration display the class founder, as do older saves without a selection.

```js
const players = [
  { id: 'p1', name: 'Rune', classId: 'guardian', skinId: 'dawn-order' },
  { id: 'p2', name: 'Owl', classId: 'alchemist' },
];
const state = createMatch({ seed: 'dawn', players });
```

### Visible equipment

Ward Lantern, Mender’s Bell and Vial Sash share a belt socket across all outfits. The last compatible equipped ability slot takes the hook, with the sash as the fallback. The renderer reads the public equipped slots and artifacts. A concealed consumable never appears on a rival. The held prop replaces the belt image during its own use gesture.

Add a compatible reward to `public/worn-gear.js` with its pixel icon and width in native cel pixels. Each class has a default belt point and the motion tracks follow the waist through anticipation and recovery. An outfit can set `anchors.critical.belt: [x, y]` in the fighter manifest when its costume changes the fit. Weapons drawn as part of the outfit carry through its signature attack.
