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

## Founder art sources

The individual base and breakdown paintings are packed under [scripts/art/founders](../scripts/art/founders). Each class has 16 primary paintings and four extra weapon or arm breakdowns in each of the three health bands. The builder registers the painted surfaces to create intermediate exposures, keeps the hard silhouette edge, preserves the original color palette and packs the sheets for the browser. Each class also has twelve separately painted footwork drawings in the shipped footwork sheet.

With Python, Pillow, NumPy and OpenCV installed, regenerate the standing and motion atlases and save a health-stage comparison. The game serves prebuilt images directly.

```sh
python -m pip install pillow numpy opencv-python-headless
python scripts/build-fighter-skins.py --review founder-health.png
```

## Registration and roster

Place the artwork in `public/assets/skins/`. Register the class, skin ID, standing sheet and any optional sheet URLs before the first battle render. IDs start with a lowercase letter and support lowercase letters and digits separated by single hyphens, up to 40 characters total. Each class has a built-in `founder` skin.

```js
import { registerFighterSkin } from './animation.js';

registerFighterSkin(
  'guardian',
  'dawn-order',
  '/assets/skins/guardian-dawn-order.webp',
  '/assets/skins/guardian-dawn-order-motions.webp',
  '/assets/skins/guardian-dawn-order-footwork.webp',
  '/assets/skins/guardian-dawn-order-ambient.webp',
);
```

Pass the optional `skinId` in the original match roster. The match saves the ID, projects it to the other seats and retains it for replays. Clients missing a registration display the class founder, as do older saves without a selection.

```js
const players = [
  { id: 'p1', name: 'Rune', classId: 'guardian', skinId: 'dawn-order' },
  { id: 'p2', name: 'Owl', classId: 'alchemist' },
];
const state = createMatch({ seed: 'dawn', players });
```
