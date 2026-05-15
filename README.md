# Pokemon Platinum ROM Patcher

Open `index.html` in a browser, choose a US Pokemon Platinum `.nds` ROM, select patches, and download the patched copy.

The patching is local browser-side JavaScript. No ROM data is uploaded.

Included patches:

- No critical hits
- Random IV range, configurable from 0-31
- Wild nature filter with 25 selectable nature toggles
- Experimental framerate unlock, configurable as battle-only or global
- Faster player walk/run/cycling movement
- Fairy Patch with optional Pokemon type updates
- Shiny odds, configurable by integer percentage from 0% to 100%
- Experimental normal async text speed, configurable from 2x to 10x
- Player-side standard accuracy bypass

Notes:

- These offsets target `pkaizo.nds` first, with clean US Pokemon Platinum as the compatibility baseline.
- The nature filter intentionally replaces wild nature generation with an allowed-nature table, so Synchronize no longer forces banned wild natures. It defaults to all 25 natures allowed; toggle off any natures you want to block.
- The IV range patch rerolls each generated IV until it lands between the selected minimum and maximum, inclusive. The default range is `15-31`.
- The movement patch now edits player movement constants instead of global movement action function tables. If it sees the older global movement edits made by this patcher, it restores those pointers before applying the safer player-scoped version.
- The framerate unlock patch skips the extra VBlank wait by preventing `gSystem.frameCounter` from being cleared in selected contexts. Battle-only mode installs a tiny ARM9 helper that mirrors the known battle cheat's overlay signature check; global mode applies the simpler main-loop edit everywhere. This is closer to 60 FPS than an emulator-style uncapped framerate.
- The Fairy Patch replaces the existing ??? type slot (`0x09`) with Fairy battle logic, battle UI assets, and Pokedex type icon assets. Its optional Pokemon type update changes only personal-data type bytes for the Kanto-Sinnoh base-form retypes, leaving Altaria unchanged because Platinum has no Mega Evolution form.
- For quick Fairy battle testing, the browser console can enable `window.PlatinumPatcher.config.debugFairyBattleTest = true` before applying Fairy Patch. This hidden debug mode also applies Pokemon type updates, turns non-Fairy Pokemon into mono Fighting, changes all moves into Fairy type, and changes wild encounter species slots to Jigglypuff.
- The shiny odds patch edits the ARM9 `Pokemon_IsPersonalityShiny` threshold. The UI maps integer percentages from `0%` to `100%` onto the closest threshold out of `65536`; for example `50%` becomes threshold `32768`, and `100%` becomes threshold `65536`. Thresholds up to `255` use the original one-byte `cmp r0, #imm8` edit; higher thresholds rewrite the small shiny predicate in place so no code cave is needed.
- `100%` shiny odds can stall event/gift routines that explicitly reroll until a Pokemon is not shiny.
- The experimental text speed patch first applies the fastest normal async text speed, then hooks the async text-printer task to render the selected number of normal characters per frame, from 2x to 10x. Callback-driven text falls back to one render per frame for safety, but timing quirks are still possible.
- The player accuracy patch bypasses the standard accuracy miss roll. It does not remove type immunities, Protect, or semi-invulnerable state checks.
- Several patches sanity-check their expected bytes and scan nearby if a compatible ROM has shifted code. The log calls out fallback scan usage and the patched offset.

## ARM9 usage map

These are the ARM9 static binary regions this patcher may currently claim. ROM file offsets below assume the normal US Platinum / pkaizo ARM9 mapping of file `0x4000` loaded at RAM `0x02000000`; the patcher computes offsets from the ROM header and may fallback-scan nearby on compatible romhacks.

| Patch | ARM9 RAM range | ROM file range | Size | Notes |
| --- | --- | --- | --- | --- |
| Unlock framerate, global | `0x02000DF8-0x02000DF9` | `0x00004DF8-0x00004DF9` | `0x2` | NOPs the `gSystem.frameCounter` reset halfword. |
| Unlock framerate, battle only hook | `0x02000DF2-0x02000DF9` | `0x00004DF2-0x00004DF9` | `0x8` | Replaces the surrounding VBlank counter/reset sequence with a `bl` hook. |
| Unlock framerate, battle only helper | `0x020F93D0-0x020F93EB` | `0x000FD3D0-0x000FD3EB` | `0x1C` | Preferred helper cave. Reads the battle overlay signature at `0x0224A948`. |
| Shiny odds, simple threshold | `0x02075E50` | `0x00079E50` | `0x1` | Edits the immediate byte in `cmp r0, #imm8`; the containing instruction is `0x02075E50-0x02075E51`. |
| Shiny odds, advanced threshold | `0x02075E38-0x02075E63` | `0x00079E38-0x00079E63` | `0x2C` | Rewrites the shiny predicate for thresholds above one byte. |
| Random IV range | `0x02073F48-0x02073FCB` | `0x00077F48-0x00077FCB` | `0x84` | Replaces the random IV generation block; includes an inline reroll helper. |
| Faster movement constants | `0x0205FE22-0x0205FE23` | `0x00063E22-0x00063E23` | `0x2` | Walk base action. |
| Faster movement constants | `0x0205FE3E-0x0205FE3F` | `0x00063E3E-0x00063E3F` | `0x2` | Run base action. |
| Faster movement constants | `0x0205FF92-0x0205FF93` | `0x00063F92-0x00063F93` | `0x2` | Distortion World walk base action. |
| Faster movement constants | `0x0205FFB0-0x0205FFB1` | `0x00063FB0-0x00063FB1` | `0x2` | Distortion World run base action. |
| Faster movement constants | `0x02060394-0x02060395` | `0x00064394-0x00064395` | `0x2` | Bike default action. |
| Faster movement constants | `0x020603A8-0x020603A9` | `0x000643A8-0x000643A9` | `0x2` | Bike low-gear action. |
| Faster movement constants | `0x020603AC-0x020603AD` | `0x000643AC-0x000643AD` | `0x2` | Bike mid-gear action. |
| Faster movement constants | `0x020603B0-0x020603B1` | `0x000643B0-0x000643B1` | `0x2` | Bike high-gear action. |
| Force fast text | `0x02027AC0-0x02027AD9` | `0x0002BAC0-0x0002BAD9` | `0x1A` | Field text-speed helper. |
| Experimental text speed hook | `0x0201D97C-0x0201D983` | `0x0002197C-0x00021983` | `0x8` | Hooks the async text-printer task runner. |
| Experimental text speed helper | `0x020795E0-0x0207969B` | `0x0007D5E0-0x0007D69B` | `0xBC` | Preferred helper cave; can fallback to another free ARM9 fill run. |
| Fairy Patch ARM9 helper | `0x020F9400-0x020F943F` | `0x000FD400-0x000FD43F` | `0x40` | Type-effectiveness nibble-table reader helper. |

The movement patch can also repair the older pointer-table version of this patcher if it sees it. That compatibility repair may touch these 4-byte ARM9 words: `0x020EF53C`, `0x020EF530`, `0x020EF524`, `0x020EF518`, `0x020EF50C`, `0x020EF500`, `0x020EF4F4`, `0x020EF4E8`, `0x020EF4DC`, `0x020EF4D0`, `0x020EF4C4`, `0x020EF4B8`, `0x020EF194`, `0x020EF224`, `0x020EF440`, and `0x020EF470`.

These current patches do not modify ARM9: No critical hits, wild nature filter, player accuracy bypass, and the non-helper portions of Fairy Patch. They use overlays and/or NARC files instead.

## Overlay usage map

These are overlay regions this patcher may currently claim. The ROM file ranges below are the observed pkaizo / US Platinum overlay file locations from the normal FAT layout. The safer coordinate for other devs is the overlay-relative range, because the patcher resolves overlay files from the overlay table and FAT.

Observed overlay bases:

| Overlay | Loaded RAM base | pkaizo ROM file range | Notes |
| --- | --- | --- | --- |
| Overlay 6 | `0x0223E140` | `0x00182A00-0x0018E1FF` | Wild encounter-related routines. |
| Overlay 16 | `0x0223B140` | `0x001DC600-0x0021209F` | Battle code and battle type-effectiveness logic. |
| Overlay 21 | `0x021D0D80` | `0x0026BE00-0x00284FFF` | Pokedex display code. |

| Patch | Overlay | Relative range | Loaded RAM range | pkaizo ROM file range | Size | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Wild nature filter | 6 | `0x39A4-0x39FF` | `0x02241AE4-0x02241B3F` | `0x001863A4-0x001863FF` | `0x5C` | Replaces the wild nature generation routine with the allowed-nature table patch. |
| No critical hits | 16 | `0x1FDA4-0x1FDA7` clean, `0x1FDC0-0x1FDC3` pkaizo | `0x0225AEE4-0x0225AEE7` clean, `0x0225AF00-0x0225AF03` pkaizo | `0x001FC3C0-0x001FC3C3` pkaizo | `0x4` | Writes a return stub in the critical-hit multiplier function. Offset follows the crit-rate table fallback shift. |
| Force fast text / Experimental text speed | 16 | `0x3CB0-0x3CD7` | `0x0223EDF0-0x0223EE17` | `0x001E02B0-0x001E02D7` | `0x28` | Battle text-speed helper. Experimental text speed also uses the ARM9 hook/helper listed above. |
| Fairy type table | 16 | `0x33B94-0x33CE2` | `0x0226ECD4-0x0226EE22` | `0x00210194-0x002102E2` | `0x14F` | Compressed type-effectiveness table and Fairy relationships. |
| Fairy read hook 1 | 16 | `0x1A01A-0x1A025` clean, `0x1A022-0x1A02D` pkaizo | `0x0225515A-0x02255165` clean, `0x02255162-0x0225516D` pkaizo | `0x001F6622-0x001F662D` pkaizo | `0xC` | Redirects type-effectiveness reads to the ARM9 Fairy helper. |
| Fairy read hook 2 | 16 | `0x1A074-0x1A07F` clean, `0x1A07C-0x1A087` pkaizo | `0x022551B4-0x022551BF` clean, `0x022551BC-0x022551C7` pkaizo | `0x001F667C-0x001F6687` pkaizo | `0xC` | Second type-effectiveness read hook. |
| Fairy loop step 1 | 16 | `0x19FB6-0x19FB7` clean, `0x19FBE-0x19FBF` pkaizo | `0x022550F6-0x022550F7` clean, `0x022550FE-0x022550FF` pkaizo | `0x001F65BE-0x001F65BF` pkaizo | `0x2` | Changes table iteration from triplets to pairs. |
| Fairy loop step 2 | 16 | `0x1A084-0x1A087` clean, `0x1A08C-0x1A08F` pkaizo | `0x022551C4-0x022551C7` clean, `0x022551CC-0x022551CF` pkaizo | `0x001F668C-0x001F668F` pkaizo | `0x4` | Changes table iteration from triplets to pairs. |
| Fairy loop step 3 | 16 | `0x1A766-0x1A767` clean, `0x1A76E-0x1A76F` pkaizo | `0x022558A6-0x022558A7` clean, `0x022558AE-0x022558AF` pkaizo | `0x001F6D6E-0x001F6D6F` pkaizo | `0x2` | Changes table iteration from triplets to pairs. |
| Player accuracy trampoline | 16 | `0x140FA-0x1410B` clean, `0x140FE-0x1410F` pkaizo | `0x0224F23A-0x0224F24B` clean, `0x0224F23E-0x0224F24F` pkaizo | `0x001F06FE-0x001F070F` pkaizo | `0x12` | Branches standard accuracy miss handling to the overlay helper. |
| Player accuracy helper | 16 | `0x34C68-0x34C83` preferred, `0x34C84-0x34C9F` pkaizo observed | `0x0226FDB8-0x0226FDD3` preferred, `0x0226FDC4-0x0226FDDF` pkaizo observed | `0x00211284-0x0021129F` pkaizo observed | `0x1C` | Preferred `0xFF` overlay code cave; can fallback to another free `0xFF` fill run. |
| Fairy Pokedex type display | 21 | `0xE408-0xE477` | `0x021DF188-0x021DF1F7` | `0x0027A208-0x0027A277` | `0x70` | Pokedex type icon routing for type `0x09`. |

The Fairy Patch also modifies NARC assets outside overlays: `battle/graphic/pl_batt_obj.narc` members `74` and `236`, and `resource/eng/zukan/zukan.narc` members `88`, `89`, and `90`. Optional Fairy Pokemon type updates modify only bytes `6` and `7` of selected entries in `poketool/personal/pl_personal.narc`.

Fairy type research credit: Mikelan98 and BagBoy, "Fairy Type in Pokemon Platinum" (`pokehacking.com/r/20071800`).
