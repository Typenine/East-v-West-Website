# Draft broadcast graphics: Hype Chamber material pilot

Status: **a WebGL2 draft-pick stage prototype is committed on feature/draft-broadcast-materials-v1; not approved for production**.

## Source of truth and preservation

The user licensed and exported Epic/Capacity Studios' Broadcast Hype Chamber sample (Unreal Engine 4.27) for a private conversion feasibility study. The full export files are **NOT included in this public repository**. They are retained in the user's private ChatGPT Library folder:

`/East v West/Broadcast Research/`

Archive inventory:
- `HypeChamber_TeamClose_VisualAssets.zip` (textures, supplemental meshes, material parameters, export logs).
- `LS_FS_HypeChamber_Team_Close.fbx` (full sequencer FBX export).
- `hype_chamber_inventory.json` (569 Unreal asset entries).
- `materials.json` (24 material / material-instance parameter records).
- `export_log.json` (21 texture attempts: 16 successes, 5 failures; 2 mesh exports succeeded).
- `hype_chamber_export_geometry_test.glb` (early geometry portability study).
- `hype_chamber_export_analysis.json`, `hype_chamber_report.py`, `evw_hype_chamber_batch_export.py` (analysis and reproducing exports).

Original Unreal project is on the user's PC. Do **not** commit original or extracted licensed source assets to this public repository. Fab Standard License permits licensed incorporation in projects but limits redistribution of standalone source assets. Verify exact package terms before shipping any Epic-derived optimized media.

## What the exports proved

- Original FBX geometry and some keyframed motion can be converted outside Unreal.
- The exported mesh, motion and material data **do not** reproduce Unreal lighting, Niagara, Blueprints, geometry caches or complete sequence composition.
- Material parameter records reveal the desired look: varying roughness, metallic accents, clear coat, worn edge masks, emissive accents, hex / logo treatments, and animated texture/sweep offsets.
- Some source textures failed extraction: T_Flakes_D3_Data, T_Flakes_D3_Normal, T_OrangePeel_N, T_WornEdge_Mask, T_Marquee_URL_A.

## This pilot's implementation

`src/components/draft-overlay/BroadcastMaterialStage.tsx` and its CSS module implement a **browser-native approximation of specific recovered material effects**, not a copy of the Unreal shaders:
- color-driven emissive ambience
- geometric logo/hex background
- layered surface wear / scratched-metal hints
- reflective lighting sweep
- stage-ring highlights and faux floor reflections

It is used as a decorative layer in the existing draft-pick reveal, event logo reveal, player reveal, trade-alert introduction, and full-screen on-clock animation. It takes live team and event colors; GSAP animation events, roster data, pick ordering, player photos, draft controls and audio are unchanged. Honors reduced-motion preferences.

The code deliberately does **not** bundle raw Fab source textures, which would both inflate deployment size and expose standalone licensed files in this public repository.

## October 25 browser smoke test

Rendered a 1440x810 static HTML composition in Chromium using the pilot's material CSS formulas. Background gradients, hex line pattern, reflective ring and contrasting type successfully rendered. This is a **visual CSS smoke test**, not a working Next.js or draft-overlay run; it does not verify the site build, GSAP timing, player/league data, or mobile overlay stacking.

The tested look is a relatively subtle background effect, **not yet Epic-grade 3D motion graphics**. Do not ship this as the final visual-quality upgrade. A proper next quality gate is a browser-native animated logo / pick reveal that uses selected optimized 3D geometry with intentionally rebuilt materials (prefer private prototype until licensing and visual quality are verified). If this fails to materially outperform existing draft graphics, do not add 3D payload to production.

## Testing before merging or releasing

1. Verify Next.js TS/CSS build and lint in CI.
2. Replay the existing animation tester with short/long team names and players with/without photos.
3. Check 1920x1080 broadcast, mobile, and reduced-motion playback, especially stacking order.
4. Compare the new material pass visually against current production and the original Epic reference.
5. Measure client performance; cap motion/effects if required.
6. Do not merge until visually approved. Follow the user's **one production deployment** preference and avoid preview deployments where configurable.

## If deeper Hype Chamber fidelity is worthwhile

Use the **privately archived** exports for a separate nonpublic conversion experiment. Geometry and shader reconstruction (Three.js / WebGL) should only be added if the visual gain merits the device and maintenance cost; never blindly replace the live draft logic. The source package is **not** browser-ready.

## October 25: original 3D pick reveal milestone

New: `src/components/draft-overlay/DraftPick3DStage.tsx`, integrated into the `gsap-team-intro` phase of `DraftPickAnimation.tsx`.

- Real WebGL2 3D render loop (no Three.js dependency or new npm packages).
- Procedurally generated concentric platform tiers, rotating metallic hex elements and stage-light rings.
- Physically inspired shading with two lights, Fresnel-style edge reflection and specular highlights.
- Dynamic fantasy-team primary and secondary colors.
- Reduced-motion and WebGL-unavailable fallback to the existing 2D material stage.
- Pixel ratio cap (1.4), page visibility pause and proper WebGL resource cleanup.
- Existing GSAP event ordering and draft selection data are unaffected.

**Important distinction:** the website's WebGL geometry is independently generated, based on dimensions and design techniques observed in Epic's assets, not a copy of Epic's extracted model. No proprietary asset was added to this public repository. The original exported **Platform_Main** and **Platform_Center** meshes were loaded into a private standalone WebGL proof of concept with dynamic team/player/pick fields, and retained in the user's **private Library**:
- `epic-geometry-private-draft-prototype.html`
- `epic-geometry-software-preview.png` (software-rendered illustrative still, not a browser capture)

The interactive private prototype's JavaScript syntax checks, but automated Chromium in the current environment has WebGL2 disabled and cannot validate GPU playback. It must be checked on a WebGL2-capable browser. Local Next.js build / TypeScript lint have not been verified: source writes occurred through connected GitHub tooling, with no build environment. Do not represent this as production-tested.

### Intellectual property clearance

Epic's current Fab Broadcast Sample listing and the general Fab license information do not conclusively establish whether this particular sample is **UE-Only Content**, especially in light of its Unreal sample-program history. Confirm the acquisition-specific license terms before putting extracted models, logos, images, or textures onto the public website. A private feasibility prototype is not grounds to assume commercial/public browser reuse is permitted.

### Quality gate

Visual assessment: the first software-rendered still shows a genuine 3D platform but remains simpler than Epic's finished broadcast graphics. Do **not** auto-merge or production deploy as the final graphics solution. For a fuller result, add choreography and GPU effects only after a real-browser test. Use one production deployment once approved.

### Preview deployment caveat

The connected Vercel Git integration automatically attempted preview deployments for earlier branch commits despite the user's preference to avoid preview deployments. An in-progress preview was explicitly canceled; Vercel's project setting to disable preview deployments was submitted through its API on October 25. Verify the effective setting before any additional writes. No production deployment was initiated.
