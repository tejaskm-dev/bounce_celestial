# Asset brief — BOUNCE

You are improving the **visual assets** of an existing, working Three.js game.
The structure, physics and performance work are done and must not regress.
Your job is the craft of the models, materials and textures.

---

## The game

An endless arcade game. A ball bounces along a ruined stone causeway suspended
above a sea of cloud. It always bounces; holding SPACE makes the bounce higher.
The camera is a third-person chase, low and close, looking down the bridge.

## The art direction

**"Above the Cloudline."** A high-altitude celestial ruin, sunlit, in the vein
of a Genshin Impact loading screen: white marble colonnades receding into thick
white mist, gold banding, ogee arches, spired towers, a sea of cumulus below.

The single governing rule is **value inversion**: this is a *light field with
soft marks*, not a dark field with bright marks. The sky is the light source.
Nothing emits its own light except the brazier flames. Shadows are **tinted
toward the sky**, never darkened toward black — mixing a surface with black is
what makes cel shading read as posterised 3D instead of drawn.

The colour grammar is strict and lives in `src/rendering/Palette.ts`:

| Role | Meaning |
| --- | --- |
| `alabaster` | ground you can stand on |
| `marble` | architecture — columns, arches, balustrades |
| `gilt` | direction, reward, the lip of the floor |
| `blush` | machinery: it moves you, it never kills you |
| `verdant` | life, decorative only |
| `danger` (lacquer crimson) | **it will kill you. Nothing else is red.** |

---

## HARD CONSTRAINTS — violating these produces silently broken output

Each of these has already bitten this codebase. Read them before writing code.

**1. Unit-space authoring.** Every geometry in `src/rendering/Architecture.ts`
is authored one unit tall (and one unit long, for runs like the balustrade), so
an instance's *scale is its real size in metres*. Keep this. New shapes follow
the same convention.

**2. Merges must go through `mergeParts()`.** `mergeGeometries` refuses to
combine indexed with non-indexed geometry. Three's lathes / cylinders / cones
come back **indexed**; its polyhedra (Octahedron, Icosahedron, …) come back
**non-indexed**. Mixing them fails, logs to console, and silently falls back to
a single part. Use the `mergeParts()` helper in `Architecture.ts`, which
normalises first.

**3. Custom vertex shaders MUST support instancing.** All this scenery is drawn
with `InstancedMesh` via `src/rendering/InstancePool.ts`. Three injects
`instanceMatrix` but only *applies* it inside its own shader chunks. A
hand-written vertex stage that does `modelMatrix * vec4(position, 1.0)` will
draw every instance stacked at the origin — the whole colonnade disappears.
Use the `INSTANCE_VS` macros already defined in `CelShaders.ts`:

```glsl
vec4 worldPosition = modelMatrix * vec4(OBJ_POS, 1.0);
vNormal = normalize(normalMatrix * OBJ_NRM);
```

**4. Every raw `ShaderMaterial` must end with the output tail.** Shading here
happens in linear space, but three hands us an sRGB buffer and does not insert
the conversion for hand-written materials. Without this, mid-tones land on
screen about half as bright as authored:

```glsl
gl_FragColor = vec4(colour, 1.0);
#include <tonemapping_fragment>
#include <colorspace_fragment>
```

**5. Every world material must call `applyFog(...)`** before writing
`gl_FragColor`, or the object will float in front of the mist instead of
sitting in it. Signature: `applyFog(colour, length(vViewPosition), vWorldPosition.y)`.

**6. No new hex literals.** Every colour comes from `HEX` in `Palette.ts`. Add
palette entries if you need new tones; do not inline them.

**7. Stay instanceable.** One geometry per `InstancePool`. Do not add per-object
`Mesh`es to the scenery — draw calls were 983 before this was fixed and are 239
now. Surface detail belongs in the *shader* or in merged geometry, not in extra
meshes.

**8. Detail frequency must derive from instance dimensions.** A 5-unit baluster
and a 150-unit tower share a geometry; a fixed detail period turns the tower
into moiré. See how `createStoneMaterial` takes `flutes` / `courses` per use.

---

## Where the assets live

| File | Contains |
| --- | --- |
| `src/rendering/Architecture.ts` | `flutedColumn`, `columnDrum`, `bandRing`, `skyTower`, `archedGate`, `balustrade`, `brazier`, `floatingIsland` — all lathe/merge based |
| `src/rendering/CelShaders.ts` | `createStoneMaterial` (fluting, course lines, veining), `createCelMaterial`, `createOutlineMaterial`, `createNeonMaterial` |
| `src/rendering/TextureGenerator.ts` | Canvas-drawn textures: `getComicTileTexture`, `getHazardTexture`, `getBounceTargetTexture`, `getBallFaceTexture` |
| `src/rendering/Skybox.ts` | The sky-dome shader (gradient, sun, god rays, cumulus bank, cloud sea) and the scenery layout |
| `src/world/BridgeSpine.ts` | The continuous causeway: balustrades, arched supports, piers |
| `src/world/Obstacles.ts` | `TrackPlatform` — the playable deck, merged by material |

---

## What to improve, in priority order

**1. The deck is the weakest thing in the frame.** It is a plain slab with a
gold edge and a generic tiled panel. The reference has *engraved stone*: maze
and key-fret borders, inset star motifs, worn inscription running down the
centre, joints between courses. Rework `getComicTileTexture` into a real carved
stone panel (it still carries its neon-era name and layout), and give the deck
edge a moulded profile rather than a box.

**2. Everything is one column.** `flutedColumn` is scaled to every size and
used for piers too. Author **three or four distinct orders** — plain shaft,
fluted shaft with a moulded capital, banded drum stack, a squat pier — plus
**ruined variants**: cracked shafts, broken-off tops, columns missing their
capitals. A celestial *ruin* needs damage; right now nothing is broken and it
reads as a showroom.

**3. The arches are undetailed.** `archedGate` is an extruded ogee outline. Give
it archivolt mouldings, a keystone, impost blocks, and relief in the spandrels.
Add two or three arch variants so a run of them is not obviously repeated.

**4. The towers read as a single silhouette.** Vary the roof forms, gallery
heights, and finials; add a couple of ruined ones.

**5. Materials need more surface.** `createStoneMaterial` does fluting, course
lines and veining. It could use: weathering that pools in crevices, subtle
ambient occlusion at course joints, edge wear that lightens exposed corners,
and gold that tarnishes in shadow rather than staying uniformly bright.

**6. The cloud sea is billow noise.** It works but it is soft. It could use
better-defined cumulus lobes, wispier edges, and shadow cast from the towers.

---

## Budget

Currently **239 draw calls / 386k triangles**. Draw calls have headroom;
**triangles do not** — that is the number to watch. Anything you add to the far
ranks should be cheaper than what is near the camera. There is currently **no
LOD**: the colonnade at 182 units uses the same geometry as the one at 44.
Adding a cheap far-variant would buy back a lot of budget for detail up close.

## Verifying your work

```bash
npm run dev        # localhost:5180
npx tsc --noEmit   # must stay clean
npm run probe      # course fairness — must still report "solvable"
npm run playtest   # autopilot run; prints draw calls and triangles
npm run playtest -- --shots   # writes frames to tests/screenshots/playtest/
```

**Look at the rendered frames.** Every bug listed in the constraints section
above typecheck-passed and looked correct in the source. They were only ever
visible in a screenshot.
