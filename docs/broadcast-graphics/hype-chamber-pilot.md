# Draft broadcast graphics: Hype Chamber material pilot

Status: **first visual-material pass implemented on feature/draft-broadcast-materials-v1; not deployed or visually signed off**.

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

It is used as a decorative layer in the existing draft-pick reveal, event logo reveal, player reveal, and trade-alert introduction. It takes live team and event colors; GSAP animation events, roster data, pick ordering, player photos, draft controls and audio are unchanged. Honors reduced-motion preferences.

The code deliberately does **not** bundle raw Fab source textures, which would both inflate deployment size and expose standalone licensed files in this public repository.

## Testing before merging or releasing

1. Verify Next.js TS/CSS build and lint in CI.
2. Replay the existing animation tester with short/long team names and players with/without photos.
3. Check 1920x1080 broadcast, mobile, and reduced-motion playback, especially stacking order.
4. Compare the new material pass visually against current production and the original Epic reference.
5. Measure client performance; cap motion/effects if required.
6. Do not merge until visually approved. Follow the user's **one production deployment** preference and avoid preview deployments where configurable.

## If deeper Hype Chamber fidelity is worthwhile

Use the **privately archived** exports for a separate nonpublic conversion experiment. Geometry and shader reconstruction (Three.js / WebGL) should only be added if the visual gain merits the device and maintenance cost; never blindly replace the live draft logic. The source package is **not** browser-ready.
