# Authoring fighter skins

A skin identifies the same fighter across idle, attacks, reactions and three levels of injury. The founders have separate head portraits for the command deck, class selection and turn order. Their full-body drawings use the arena’s dusk palette.

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
| Class idles, optional | 2880 × 1350, sixteen columns and nine rows | Rest, equipment check and a second mannerism for each health band. The artwork is cropped to `(14, 0, 194, 150)` in its original cel. |
| Alternate windups, optional | 1040 × 996, five columns and six rows | Five alternate preparation drawings for basic attack and signature in each band |
| Drink and use, optional | 2496 × 498, twelve columns and three rows | One reach, raise, hold and return sequence per health band |
| Collapse, optional | 1872 × 498, nine columns and three rows | Recoil, knee, hip and ground through each injury palette |
| Celebration, optional | 1872 × 498, nine columns and three rows | Rest, preparation, signature gesture and winner’s hold in each injury band |

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

### Class idles and alternate windups

Set each founder’s `idlePeriodMs` in `public/fighter-kit.json` for the period of its mannerisms. Each health band’s `previewRatio` supplies the same starting HP fraction to the Outfitter and Sandbox. In the Outfitter, **Poses** plays the resting breath, equipment check, flourish, recoil, victory or fall on demand. **Actions** uses the combat performances, props and sound cues.

The PC renderer plays each fighter's resting breath, first equipment check and second mannerism on its own clock. A single opaque drawing is visible at each exposure. Critical fighters move more slowly and breathe through a shorter arc. Reduced motion holds a single pose. A costume with an ambient sheet can still perform its twelve-frame equipment check.

The outfit's three health boards supply its resting stance, equipment check and combat keys. To add a custom mannerism, paint a transparent three-by-three board for the costume. Each row is one injury band, with the resting pose, a halfway drawing and a held expression in that order. Place objects in the hand at every stage. Keep the same foot line and facing across the gesture.

```sh
python scripts/build-idle-performances.py --role guardian --skin harbor-warden --import-sequence harbor-warden-focus.png
python scripts/build-idle-performances.py --role guardian --skin harbor-warden
```

The builder registers the middle and held paintings once in `scripts/art/idles`. It then packs the idle loops and derives a second attack and signature from the class's preparation poses. The alternate windup joins the original clip on frame six. Both takes therefore share the release, weapon contact and end pose. Include `idles` and `variations` in a founder's layers, or add the two image URLs to an outfit descriptor. Each class's body anchors, timing and chamber choices are defined in the builder. A new class needs those entries only once.

See the [eight-class PC arena](qa/pc-combat/eight-class-ring.webp) and [four signatures in play](qa/pc-combat/class-signatures.webm) at playing size.

### Grounded defeat

Paint three full-body poses per outfit as the fighter takes a knee, braces on one hip and settles on the floor. The staff, hammer or loose cards can come to rest beside the hand. Keep the lowest contact on the arena baseline. The registered source is three 208 × 166 cels across in `scripts/art/defeats/<look>.webp`. To import three costumes together, arrange the founder and its two outfits in columns in manifest order, with the three poses in rows and transparent gutters between drawings.

```sh
python scripts/fighter_defeat.py --role necromancer --import-board necromancer-defeats.png
python scripts/check-fighter-skins.py
```

The packer connects the existing recoil with the three paintings and applies the corresponding outfit palette in each injury band. It copies the final floor drawing into the standing sheet as well. A replay, an eliminated seat, and a reduced-motion knockout can therefore show the same endpoint immediately. The standard fighter and costume builds pick up the registered paintings automatically.

### Victory performances and injury overrides

The winner’s gesture has its own paintings. Guardian plants the shield and salutes with the hammer. Trickster bows with the mirror at the chest. Artificer checks the gauntlet and rests the hammer on one shoulder. In a live finish the winning outfit performs once. Reopening a finished match shows the held pose. Restorative effects in combat use the fighter’s recovery poses.

Register a complete costume family as columns, or pass `--skin` and supply one vertical strip of three drawings. `--injury wounded` and `--injury critical` register independent paintings under `scripts/art/victories` or `scripts/art/defeats`. Each outfit can supply these independently. The builder uses the ordinary paintings with the band’s own palette wherever an override is absent.

```sh
python scripts/fighter_endings.py --layer celebrate --role guardian --skin harbor-warden --import-board harbor-salute.png
python scripts/fighter_endings.py --layer celebrate --role guardian --skin harbor-warden --injury critical --import-board harbor-injured-salute.png
```

For a fast-moving weapon or prop, an outfit can supply all nine exposures. Pass `--exposures 9` with an import board arranged in nine rows, from opening stance to final hold. Artists working at native size can also save nine registered 208 × 166 cels side by side at the usual source path. The packer takes the opening frame from the live standing sheet and copies the last exposure back to its held pose. Each outfit and injury band can independently use three key paintings or the full strip.

`endingTimingMs` in the class manifest sets three times in milliseconds for each performance. They mark the first pose, the accent and the final hold. The remaining exposures fall between these landmarks. Both the arena and Outfitter read the same timing and drawings. Packs that supply only a standing sheet use its victory and fallen paintings directly.

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

Guardian, Berserker, Chronomancer and Alchemist use the original [founder paintings](../scripts/art/founders). Each has 16 primary paintings and four weapon or arm breakdowns in every health band. The builder registers the painted surfaces to create intermediate exposures and keeps the hard silhouette edge. Gambler, Necromancer, Trickster and Artificer use the five-column costume format below for their founders and alternates.

With Python, Pillow, NumPy and OpenCV installed, regenerate the standing and motion atlases and save a health-stage comparison. The game serves prebuilt images directly.

```sh
python -m pip install pillow numpy opencv-python-headless
python scripts/build-fighter-skins.py --review founder-health.png
```

## Registration and roster

### Painting an outfit

The alternate outfits use [twenty painted poses per health band](../scripts/art/costumes) and one separate portrait. Keep the costume’s distinguishing equipment visible in profile. Paint its damaged form into each wounded and critical pose so it stays damaged when the fighter attacks, kneels or drinks.

The [24-look outfit reference](qa/pc-combat/class-outfits.webp) shows each portrait beside the healthy, wounded and critical stance from left to right. Compare costume detail in the [founder lineup](qa/pc-combat/eight-fighters.webp) and silhouettes at playing size in the [eight-class desktop arena](qa/pc-combat/arena-ru.webp). Generate an updated reference after registering a new look with `python scripts/check-fighter-skins.py --wardrobe-board wardrobe.webp`.

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

For a founder, substitute `--founder --class-id gambler` for the skin selection. The builder establishes the class's foot position and emits the conventional founder sheet, portrait and inspection paths. Subsequent costumes use that founder’s individual poses as fitting guides.

An optional detail sheet supplies **six columns with one row per health band**. Paint an empty grip at the belt, the same grip at the lips, early weapon wind-up, weapon acceleration, signature acceleration, and the recovery toward rest. The compiler uses those four weapon breakdowns in the basic and native signature tracks. Each track retains its contact on frame seven. To rebuild the Gambler’s corrected gestures, import its detail sheet and repack both motion sets.

```sh
python scripts/build-costume-skins.py --founder --class-id gambler --import-details gambler-details.png
python scripts/build-fighter-skins.py --role gambler
python scripts/build-idle-performances.py --role gambler --skin founder
```

Measure the occupied waist in the rest pose, the hand and mouth in the two empty-grip poses, and the cache beside the reaching hand. Register those four points for each health band. A painted weapon remains with its outfit through every take. Acquired trinkets and held consumables use the shared renderer at the measured sockets.

For a long reach from belt to lips, add `consume-lift.webp` beside the costume masters. Use 208 × 166 cels with one row per health band. A single column holds the empty grip halfway between that band's hand and mouth sockets. For a longer lift, paint three columns with the grip at one-quarter, one-half and three-quarters of the reach. Plant the boots on their idle marks. The builder uses the middle drawing on the rise at exposure 4 and again on the return at exposure 9.

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

Leave a one-pixel margin around each pose, including the tip of a weapon at full extension. The Pillow checker reads the game manifest and validates this margin on every animation layer, along with the sheet dimensions, injury bands and final poses.

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
