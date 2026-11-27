# Authoring fighter skins

A skin replaces one class’s arena sprite sheet. The same sheet supplies the standing fighter, attack animation, received-hit pose and health stages. Class portraits have separate assets.

## Sheet layout

Export a transparent PNG or lossless WebP at **832 × 1494 pixels**. It has four columns and nine rows of **208 × 166 pixel** cels, with no gutters. Draw the character facing right. The renderer mirrors the whole cel for left-facing seats.

Use rows 1–3 for healthy fighters above 65% health, rows 4–6 for wounded fighters above 30% and up to 65%, and rows 7–9 for critical fighters at or below 30%. Repeat this pose order in every band.

| Row within band | Column 1 | Column 2 | Column 3 | Column 4 |
| --- | --- | --- | --- | --- |
| First | `idle` | `breathe` | `survey` | `settle` |
| Second | `windup` | `strike` | `channel` | `release` |
| Third | `guard` | `hurt` | `fallen` | `victory` |

The founder characters stand in a nominal 100 × 120 pixel box beginning at **(53, 24)** inside the cel. Keep the standing feet on the baseline at **y = 144**. Use the transparent space to either side for weapons. Keep painted pixels inside each cel throughout the swing. The four idle cels cycle with rests, and `survey` is a brief class-specific gesture. A changed silhouette and lowered or broken equipment should still read at a standing height of 60 pixels.

The founder authoring source is [build-fighter-skins.py](../scripts/build-fighter-skins.py). With Python and Pillow installed, regenerate the founder sheets and a comparison at two sizes with this command.

```sh
python scripts/build-fighter-skins.py --review founder-health.png
```

## Registration and roster

Place the new sheet under `public/assets/skins/`. Register its class, ID and public asset path during client initialization, before the first battle render. IDs begin with a lowercase letter, may contain lowercase letters and digits separated by single hyphens, and have a 40-character limit. Each class has its own registry and a built-in `founder` skin.

```js
import { registerFighterSkin } from './animation.js';

registerFighterSkin('guardian', 'dawn-order', '/assets/skins/guardian-dawn-order.webp');
```

Pass the optional `skinId` on the roster seat when creating a match or replay.

```js
const players = [
  { id: 'p1', name: 'Rune', classId: 'guardian', skinId: 'dawn-order' },
  { id: 'p2', name: 'Owl', classId: 'alchemist' },
];
const state = createMatch({ seed: 'dawn', players });
```

The match saves the ID and includes it in every player’s public view. A client that has registered it loads that class’s selected sheet. A client missing the registration displays the class founder. Older saves with no selection and malformed IDs also resolve to the founder. A replay reproduces the outfit when its original roster includes the selection.
