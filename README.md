# Pokemon Platinum ROM Patcher

Open `index.html` in a browser, choose a US Pokemon Platinum `.nds` ROM, select patches, and download the patched copy.

The patching is local browser-side JavaScript. No ROM data is uploaded.

Included patches:

- DSPRE ARM9 expansion infrastructure
- No critical hits
- Critical hit odds, configurable as the base critical-hit divisor
- Critical damage 1.5x
- Remove EV gain
- Modern paralysis mechanics: Thunder Wave fails on Electric-type targets, 12.5% full paralysis, and 50% Speed reduction
- Modern burn mechanics: Facade ignores burn's physical damage reduction, and burn chip damage is 1/16 max HP
- Modern sleep mechanics: two-turn maximum with a 33% second-turn wake chance
- Modern freeze mechanics: 25% thaw chance with a forced third-action thaw
- Modern confusion mechanics: one-third self-hit chance
- Universal infatuation, allowing Attract-style infatuation to ignore gender restrictions, with optional trainer AI scoring support
- Modern snow mechanics: Hail no longer deals chip damage and Ice-types get the physical Defense boost
- Random IV range, configurable from 0-31
- Wild nature filter with 25 selectable nature toggles
- Experimental framerate unlock, configurable as battle-only or global
- Faster player walk/run/cycling movement
- Remove overworld poison step damage
- Infinite Candy, replacing the Red Chain key item
- Item Renewal, restoring consumed/lost player-side held items only after battle ends
- Instant party healing
- Remove time-of-day evolution clock checks
- VS Seeker QoL
- Remove Surf/Waterfall party move checks
- Forgettable HMs
- Instant Pokeradar recharge
- Infinite TMs
- Dry Skin AI fix
- Fairy Patch with optional Pokemon type updates
- Shiny odds, configurable by integer percentage from 0% to 100%
- Experimental normal async text speed, configurable from 2x to 10x
- Player-side standard accuracy bypass
- Nature stat colors on the Pokemon summary screen

Notes:

- These offsets target `pkaizo.nds` first, with clean US Pokemon Platinum as the compatibility baseline.
- The DSPRE ARM9 expansion patch installs the small ARM9 loader branch and expands `data/weather_sys.narc` member `9` to the synthetic-overlay size used by DSPRE and G4Patcher. If the ROM already has the expansion, the patcher preserves the existing synthetic overlay contents instead of blanking it.
- The nature filter intentionally replaces wild nature generation with an allowed-nature table, so Synchronize no longer forces banned wild natures. It defaults to all 25 natures allowed; toggle off any natures you want to block.
- The IV range patch rerolls each generated IV until it lands between the selected minimum and maximum, inclusive. The default range is `15-31`.
- The movement patch now edits player movement constants instead of global movement action function tables. If it sees the older global movement edits made by this patcher, it restores those pointers before applying the safer player-scoped version.
- The remove overworld poison patch disables the step-based poison damage routine in the field. It does not change poison damage in battle.
- The Infinite Candy patch turns the Red Chain key item into a reusable Rare Candy-style party item. It requires the player to already own the Red Chain, renames it to Infinite Candy, keeps it in Key Items, blocks tossing, prevents removal when used, and returns to the party target prompt after ordinary successful level-ups. Evolution and other special item flows are left to the normal game code.
- The Item Renewal patch preserves player-side saved held items by masking held-item writeback messages instead of restoring from a separate snapshot table. Item loss still affects the current battle: consumed or lost items mark the matching battle-side knocked-off mask, so switching out and back in, opening the battle party screen, and viewing the battle party summary all keep the item absent until battle ends. Player-side doubles and tag partners use the same behavior; partner party data is temporary.
- The G4Patcher simple patches are direct byte edits ported into the browser patcher with sanity checks. They do not use the DSPRE synthetic overlay.
- The framerate unlock patch skips the extra VBlank wait by preventing `gSystem.frameCounter` from being cleared in selected contexts. Battle-only mode installs a tiny ARM9 helper that mirrors the known battle cheat's overlay signature check; global mode applies the simpler main-loop edit everywhere. This is closer to 60 FPS than an emulator-style uncapped framerate.
- The critical hit odds patch edits the base critical-hit rate divisor table in overlay 16. Vanilla is `1/16`; the UI defaults to `1/24`. This does not override the No critical hits patch, which stubs the critical-hit routine entirely.
- The critical damage patch hooks the two battle damage multiplication sites so normal crits scale to `1.5x` instead of `2x`. Sniper crits scale from `3x` to `2.25x`.
- The modern paralysis patch changes the full-paralysis turn-loss roll from `1/4` to `1/8`, changes the Speed penalty from `1/4` Speed to `1/2` Speed, and makes Thunder Wave use the normal no-effect path against Electric-type targets. Non-Electric paralysis effects such as Glare, Body Slam, and Static can still paralyze Electric-type battlers.
- The modern burn patch hooks the physical damage burn reduction so move `0x0107` / Facade skips that halving, and changes residual burn damage from `1/8` max HP to `1/16` max HP. It does not change Guts or Facade's existing status power boost.
- The modern sleep patch changes newly applied battle sleep from a random `2-4` counter to a fixed `3` counter, then hooks the battle sleep decrement path. That gives a guaranteed first asleep action, a roughly 33% wake chance on the second action, and a guaranteed wake on the third action.
- The modern confusion patch leaves confusion duration alone, but changes the self-hit roll from `BattleSystem_RandNext & 1` to a one-third threshold check.
- The universal infatuation patch removes the same-gender and genderless failure branches from `BtlCmd_TryAttract`, while keeping the already-infatuated check. Because Attract, Cute Charm, and held-item infatuation share this command, all of those effects can infatuate targets regardless of gender. Existing Oblivious checks still use the normal battle-script flow. Its optional trainer AI checkbox patches `battle/tr_ai/tr_ai_seq.narc` so the basic AI no longer scores Attract badly due to same-gender or genderless targets, while still penalizing already-infatuated or Oblivious targets.
- The modern snow MVP keeps Platinum's existing Hail weather slot and text/resources. It removes end-of-turn Hail chip damage, preserves Ice Body healing, and adds the modern Ice-type physical Defense boost while Hail/Snow is active. Existing Hail interactions such as Blizzard, Solar Beam, Weather Ball, Snow Cloak, and Forecast continue to use the same weather flag.
- The Fairy Patch replaces the existing ??? type slot (`0x09`) with Fairy battle logic, battle UI assets, and Pokedex type icon assets. Its optional Pokemon type update changes only personal-data type bytes for the Kanto-Sinnoh base-form retypes, leaving Altaria unchanged because Platinum has no Mega Evolution form.
- For quick Fairy battle testing, the browser console can enable `window.PlatinumPatcher.config.debugFairyBattleTest = true` before applying Fairy Patch. This hidden debug mode also applies Pokemon type updates, turns non-Fairy Pokemon into mono Fighting, changes all moves into Fairy type, and changes wild encounter species slots to Jigglypuff.
- The shiny odds patch edits the ARM9 `Pokemon_IsPersonalityShiny` threshold. The UI maps integer percentages from `0%` to `100%` onto the closest threshold out of `65536`; for example `50%` becomes threshold `32768`, and `100%` becomes threshold `65536`. Thresholds up to `255` use the original one-byte `cmp r0, #imm8` edit; higher thresholds rewrite the small shiny predicate in place so no code cave is needed.
- `100%` shiny odds can stall event/gift routines that explicitly reroll until a Pokemon is not shiny.
- The experimental text speed patch first applies the fastest normal async text speed, then hooks the async text-printer task to render the selected number of normal characters per frame, from 2x to 10x. Callback-driven text falls back to one render per frame for safety, but timing quirks are still possible.
- The player accuracy patch bypasses the standard accuracy miss roll. It does not remove type immunities, Protect, or semi-invulnerable state checks.
- The nature stat colors patch colors summary-screen stats the same way later Gen 4 games do: red for nature boosts, blue for nature drops, black for neutral stats. It automatically installs/preserves the DSPRE ARM9 expansion so its helper can live in the synthetic overlay.
- Several patches sanity-check their expected bytes and scan nearby if a compatible ROM has shifted code. The log calls out fallback scan usage and the patched offset.

## ARM9 usage map

These are the ARM9 static binary regions this patcher may currently claim. ROM file offsets below assume the normal US Platinum / pkaizo ARM9 mapping of file `0x4000` loaded at RAM `0x02000000`; the patcher computes offsets from the ROM header and may fallback-scan nearby on compatible romhacks.

| Patch | ARM9 RAM range | ROM file range | Size | Notes |
| --- | --- | --- | --- | --- |
| DSPRE ARM9 expansion branch | `0x02000CB4-0x02000CB7` | `0x00004CB4-0x00004CB7` | `0x4` | Branches into the synthetic-overlay loader setup used by DSPRE. |
| DSPRE ARM9 synthetic-overlay loader | `0x02101574-0x0210158C` | `0x00105574-0x0010558C` | `0x19` | Loader init stub for `data/weather_sys.narc` member `9` at RAM `0x023C8000`. |
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
| Instant party healing | `0x02085734-0x02085735` | `0x00089734-0x00089735` | `0x2` | Speeds up party-menu item healing. |
| Remove time evo clock checks | `0x02076DFA-0x02076DFD` | `0x0007ADFA-0x0007ADFD` | `0x4` | First held-item time evolution clock check. |
| Remove time evo clock checks | `0x02076DE2-0x02076DE5` | `0x0007ADE2-0x0007ADE5` | `0x4` | Second held-item time evolution clock check. |
| Forgettable HMs | `0x0208CDD2-0x0208CDD7` | `0x00090DD2-0x00090DD7` | `0x6` | ARM9 HM forget check. |
| Instant Pokeradar recharge | `0x02069A42` | `0x0006DA42` | `0x1` | Pokeradar recharge step count. |
| Infinite TMs | `0x020865EB` | `0x0008A5EB` | `0x1` | ARM9 item-use branch byte. |
| Infinite Candy chain hook | `0x02085EC6-0x02085EC9` | `0x00089EC6-0x00089EC9` | `0x4` | Branches to the continuous-use helper. Existing Kalaay/Yako/Mixone Rare Candy chain hooks in the synthetic overlay are detected and migrated to the Red Chain item ID. |
| Infinite Candy Bag_TryRemoveItem hook | `0x0207D60C-0x0207D613` | `0x0008160C-0x00081613` | `0x8` | Literal jump to the synthetic-overlay helper. Red Chain / Infinite Candy returns TRUE without reducing quantity; other items replay the overwritten prologue and return to the original function. |
| Infinite Candy Pocket_TryRemoveItem hook | `0x0207D658-0x0207D65F` | `0x00081658-0x0008165F` | `0x8` | Same infinite-removal guard for bag-pocket removal paths. |
| Infinite Candy item-table graphics | `0x020F1A8E-0x020F1A91` | `0x000F5A8E-0x000F5A91` | `0x4` | Red Chain item-table icon and palette pointers are changed to Rare Candy's icon and palette. |
| Force fast text | `0x02027AC0-0x02027AD9` | `0x0002BAC0-0x0002BAD9` | `0x1A` | Field text-speed helper. |
| Experimental text speed hook | `0x0201D97C-0x0201D983` | `0x0002197C-0x00021983` | `0x8` | Hooks the async text-printer task runner. |
| Experimental text speed helper | `0x020795E0-0x0207969B` | `0x0007D5E0-0x0007D69B` | `0xBC` | Preferred helper cave; can fallback to another free ARM9 fill run. |
| Nature stat colors hooks | `0x02090A50`, `0x02090A74`, `0x02090A9A`, `0x02090ABE`, `0x02090AE4` | `0x00094A50`, `0x00094A74`, `0x00094A9A`, `0x00094ABE`, `0x00094AE4` | `0x4` each | Redirects summary stat value printing to the synthetic-overlay helper. |
| Fairy Patch ARM9 helper | `0x020F9400-0x020F943F` | `0x000FD400-0x000FD43F` | `0x40` | Type-effectiveness nibble-table reader helper. |
| Modern paralysis compatibility helper | `0x020F30B4-0x020F30F7` | `0x000F70B4-0x000F70F7` | `0x44` | Pass-through shim for the old status-write hook; Thunder Wave Electric immunity is handled by the helper below. |
| Modern paralysis Thunder Wave helper | `0x020F318C-0x020F31CF` | `0x000F718C-0x000F71CF` | `0x44` | Marks `MOVE_STATUS_INEFFECTIVE` when Thunder Wave targets an Electric-type battler, letting the vanilla no-effect message path run. |
| Modern burn helper | `0x020F3168-0x020F318B` | `0x000F7168-0x000F718B` | `0x24` | Runs the original burn damage-reduction check, but skips the halving when the move is Facade. |
| Modern sleep helper | `0x020F321C-0x020F325B` | `0x000F721C-0x000F725B` | `0x40` | Handles clamped sleep decrement and the second-turn wake roll. |
| Modern freeze helper | `0x020F3300-0x020F3333` preferred | `0x000F7300-0x000F7333` preferred | `0x34` | Tracks freeze action count in `BattleMon.padding007A`, rolls a 25% thaw chance, and forces thaw on the third frozen action. Can fallback to another nearby zero-filled ARM9 cave. |
| Modern confusion helper | `0x020F3260-0x020F3277` | `0x000F7260-0x000F7277` | `0x18` | Calls the battle RNG and returns whether confusion should self-hit under the new one-third odds. |
| Modern snow Defense helper | `0x020F32D0-0x020F32FB` preferred | `0x000F72D0-0x000F72FB` preferred | `0x2C` | Applies the Ice-type physical Defense boost before returning to the damage routine; can fallback to another nearby zero-filled ARM9 cave. |

The movement patch can also repair the older pointer-table version of this patcher if it sees it. That compatibility repair may touch these 4-byte ARM9 words: `0x020EF53C`, `0x020EF530`, `0x020EF524`, `0x020EF518`, `0x020EF50C`, `0x020EF500`, `0x020EF4F4`, `0x020EF4E8`, `0x020EF4DC`, `0x020EF4D0`, `0x020EF4C4`, `0x020EF4B8`, `0x020EF194`, `0x020EF224`, `0x020EF440`, and `0x020EF470`.

Synthetic-overlay allocations used by this patcher live in `data/weather_sys.narc` member `9`, which is loaded at RAM `0x023C8000` after the DSPRE ARM9 expansion is installed. The shared `SyntheticOverlayAllocator` scans member `9` for an existing ASCII marker first, then dynamically places new payloads into the first large enough aligned zero-filled run. Infinite Candy allocates `chain_candy_red_v1` for party-menu chaining and `inf_redchain_remove_v1` for the Red Chain removal guard. Item Renewal allocates `item_renewal_v12` for its held-item writeback and battle-party display helpers. Nature stat colors allocates `NATSTATCOLOR1` for its summary print helper. Older `chain_candy_start`, `inf_candy_remove_v1`, and older Item Renewal helpers are detected so already-patched ROMs can migrate cleanly.

These current patches do not modify ARM9: No critical hits, critical hit odds, critical damage 1.5x, Remove EV gain, universal infatuation, wild nature filter, Remove Surf/Waterfall checks, VS Seeker QoL, Dry Skin AI fix, player accuracy bypass, and the non-helper portions of Fairy Patch. They use overlays and/or NARC files instead.

## Overlay usage map

These are overlay regions this patcher may currently claim. The ROM file ranges below are the observed pkaizo / US Platinum overlay file locations from the normal FAT layout. The safer coordinate for other devs is the overlay-relative range, because the patcher resolves overlay files from the overlay table and FAT.

Observed overlay bases:

| Overlay | Loaded RAM base | pkaizo ROM file range | Notes |
| --- | --- | --- | --- |
| Overlay 5 | `0x021D0D80` | `0x00151600-0x0018299F` | Overworld field routines. |
| Overlay 6 | `0x0223E140` | `0x00182A00-0x0018E1FF` | Wild encounter-related routines. |
| Overlay 13 | `0x0221FC20` | `0x001C2C00-0x001CCDFF` | Move-learning and party menu routines. |
| Overlay 14 | `0x0221FC20` | `0x001CCE00-0x001DC25F` | Trainer AI routines. |
| Overlay 16 | `0x0223B140` | `0x001DC600-0x0021209F` | Battle code and battle type-effectiveness logic. |
| Overlay 21 | `0x021D0D80` | `0x0026BE00-0x00284FFF` | Pokedex display code. |
| Overlay 84 | `0x0223B5A0` | `0x00366600-0x0036C49F` | Item-use overlay used by TM consumption. |

| Patch | Overlay | Relative range | Loaded RAM range | pkaizo ROM file range | Size | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Remove overworld poison | 5 | `0x1BA4-0x1BBB` | `0x021D1BE4-0x021D1BFB` | `0x001531A4-0x001531BB` | `0x18` | Skips the step-based poison damage/check sequence in the overworld. |
| Remove Surf/Waterfall checks | 5 | `0x1AB2-0x1AB5` | `0x021D2832-0x021D2835` | `0x001530B2-0x001530B5` | `0x4` | Allows Surf and Waterfall without requiring the matching HM move in the party. |
| VS Seeker QoL | 5 | `0xAE44-0xAE46` | `0x021DBBC4-0x021DBBC6` | `0x0015C444-0x0015C446` | `0x3` | Recharge/rematch byte edit. |
| VS Seeker QoL | 5 | `0xAFA8` | `0x021DBD28` | `0x0015C5A8` | `0x1` | Rematch chance byte edit. |
| Wild nature filter | 6 | `0x39A4-0x39FF` | `0x02241AE4-0x02241B3F` | `0x001863A4-0x001863FF` | `0x5C` | Replaces the wild nature generation routine with the allowed-nature table patch. |
| Forgettable HMs | 13 | `0x94E-0x953` | `0x0222056E-0x02220573` | `0x001C354E-0x001C3553` | `0x6` | Overlay HM forget check. |
| Dry Skin AI fix | 14 | `0x4DAC` | `0x022249CC` | `0x001D1BAC` | `0x1` | Corrects the trainer AI value used for Dry Skin. |
| Remove EV gain | 16 | `0xEA3C-0xEA3F` | `0x02249B7C-0x02249B7F` | `0x001EB03C-0x001EB03F` | `0x4` | Removes the EV reward write in battle. |
| Critical hit odds table | 16 | `0x33A60-0x33A64` clean, `0x33A7C-0x33A80` pkaizo | `0x0226EBA0-0x0226EBA4` clean, `0x0226EBBC-0x0226EBC0` pkaizo | `0x0021007C-0x00210080` pkaizo | `0x5` | Edits only the base divisor byte; the rest of the stage divisor table remains `08 04 03 02`. |
| No critical hits | 16 | `0x1FDA4-0x1FDA7` clean, `0x1FDC0-0x1FDC3` pkaizo | `0x0225AEE4-0x0225AEE7` clean, `0x0225AF00-0x0225AF03` pkaizo | `0x001FC3C0-0x001FC3C3` pkaizo | `0x4` | Writes a return stub in the critical-hit multiplier function. Offset follows the crit-rate table fallback shift. |
| Critical damage 1.5x normal hook | 16 | `0x62B8-0x62C3` | `0x022413F8-0x02241403` | `0x001E28B8-0x001E28C3` | `0xC` | Replaces the normal damage critical multiplier with a branch to the overlay helper. |
| Critical damage 1.5x Beat Up hook | 16 | `0xAD5A-0xAD65` | `0x02245E9A-0x02245EA5` | `0x001E735A-0x001E7365` | `0xC` | Replaces Beat Up's separate critical multiplier with the same helper. |
| Critical damage 1.5x helper | 16 | `0x34CA0-0x34CBB` preferred | `0x0226FDE0-0x0226FDFB` preferred | `0x002112A0-0x002112BB` preferred | `0x1C` | Preferred `0xFF` overlay code cave; can fallback to another free `0xFF` fill run. |
| Modern paralysis chance | 16 | `0x13B4E-0x13B59` | `0x0224EC8E-0x0224EC99` | `0x001F014E-0x001F0159` | `0xC` | Changes the full-paralysis roll from modulo 4 to modulo 8. |
| Modern paralysis Speed divisor, battler 1 | 16 | `0x17FCA-0x17FCB` clean, `0x17FD2-0x17FD3` pkaizo | `0x0225310A-0x0225310B` clean, `0x02253112-0x02253113` pkaizo | `0x001F45D2-0x001F45D3` pkaizo | `0x2` | Changes the paralysis Speed penalty from divide-by-4 to divide-by-2. |
| Modern paralysis Speed divisor, battler 2 | 16 | `0x18176-0x18177` clean, `0x1817E-0x1817F` pkaizo | `0x022532B6-0x022532B7` clean, `0x022532BE-0x022532BF` pkaizo | `0x001F477E-0x001F477F` pkaizo | `0x2` | Same Speed penalty change for the second battler in the speed comparison routine. |
| Modern paralysis Thunder Wave Electric-target hook | 16 | `0x1360C-0x1360F` | `0x0224E74C-0x0224E74F` | `0x001EFC0C-0x001EFC0F` | `0x4` | Redirects the type-chart result path to the ARM9 helper listed above before the vanilla no-effect flag check. |
| Modern paralysis status compatibility hook | 16 | `0x79E2-0x79E5` | `0x02242B22-0x02242B25` | `0x001E3FE2-0x001E3FE5` | `0x4` | Redirects the battle-script status write to the pass-through ARM9 helper so already-patched ROMs migrate without restoring the original call. |
| Universal infatuation | 16 | `0xA4F4-0xA509` | `0x02245634-0x02245649` | `0x001E6AF4-0x001E6B09` | `0x16` | Removes same-gender and genderless failure branches from `BtlCmd_TryAttract`, while preserving the already-infatuated failure branch. Optional trainer AI support also patches `battle/tr_ai/tr_ai_seq.narc` member `0` around `+0x14F0`. |
| Item Renewal held-item writeback hook | 16 | `0x213A4-0x213A7` clean, `0x213C0-0x213C3` pkaizo | `0x0225C4E4-0x0225C4E7` clean, `0x0225C500-0x0225C503` pkaizo | `0x001FD9C0-0x001FD9C3` pkaizo | `0x4` | Masks held-item writeback messages and marks the matching battle-side knocked-off mask when a battler item is consumed or lost. |
| Item Renewal battle party display hook | 13 | `0x14D8-0x14DB` | `0x022210F8-0x022210FB` | `0x001C40D8-0x001C40DB` | `0x4` | Masks the battle party held-item cache for the current battler side so item icons and summary item text stay hidden mid-battle after consumption/loss. |
| Modern burn Facade hook | 16 | `0x1FAF2-0x1FB07` clean, `0x1FB0E-0x1FB23` pkaizo | `0x0225AC32-0x0225AC47` clean, `0x0225AC4E-0x0225AC63` pkaizo | `0x001FCB0E-0x001FCB23` pkaizo | `0x16` | Replaces the burn damage-halving block with a branch to the ARM9 helper listed above. |
| Modern sleep counter hook | 16 | `0x13A62-0x13A77` | `0x0224EBA2-0x0224EBB7` | `0x001F0062-0x001F0077` | `0x16` | Branches the sleep counter decrement to the ARM9 helper listed above. |
| Modern freeze thaw hook | 16 | `0x13B48-0x13B59` | `0x0224EC88-0x0224EC99` | `0x001F0148-0x001F0159` | `0x12` | Replaces the vanilla `BattleSystem_RandNext() % 5` thaw check with a branch to the ARM9 helper listed above. |
| Modern confusion self-hit hook | 16 | `0x13A7E-0x13A87` | `0x0224EBBE-0x0224EBC7` | `0x001F007E-0x001F0087` | `0xA` | Replaces the vanilla 50% confusion self-hit check with a branch to the ARM9 helper listed above. |
| Modern snow hail chip removal | 16 | `0xA1EC-0xA205` | `0x0224532C-0x02245345` | `0x001E67EC-0x001E6805` | `0x1A` | Changes the Snow Cloak skip branch into an unconditional skip so Hail/Snow no longer deals end-of-turn chip damage; Ice Body healing remains. |
| Modern snow Defense hook | 16 | `0x1F9D2-0x1F9D5` clean, `0x1F9EE-0x1F9F1` pkaizo | `0x0225AB12-0x0225AB15` clean, `0x0225AB2E-0x0225AB31` pkaizo | `0x001FBFEE-0x001FBFF1` pkaizo | `0x4` | Branches to the ARM9 helper inside the existing weather-not-suppressed block. |
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
| Infinite TMs | 84 | `0x4372-0x4375` | `0x0223F912-0x0223F915` | `0x0036A972-0x0036A975` | `0x4` | NOPs the TM consume call in the item-use overlay. |

The Fairy Patch also modifies NARC assets outside overlays: `battle/graphic/pl_batt_obj.narc` members `74` and `236`, and `resource/eng/zukan/zukan.narc` members `88`, `89`, and `90`. Optional Fairy Pokemon type updates modify only bytes `6` and `7` of selected entries in `poketool/personal/pl_personal.narc`.

Infinite Candy also modifies NARC data outside overlays: `itemtool/itemdata/pl_item_data.narc` member `0x1A3`, replacing Red Chain item data with Rare Candy party-use behavior while keeping it in the Key Items pocket. Its ARM9 item-table entry points to Rare Candy's existing icon and palette in `itemtool/itemdata/item_icon.narc`; no icon members are duplicated. It also renames Red Chain text through `msgdata/pl_msg.narc` members `391`, `392`, `393`, and `394`, entry `441`. Its helper code is stored in `data/weather_sys.narc` member `9`, alongside other DSPRE/G4Patcher-style synthetic-overlay code.

The DSPRE ARM9 expansion modifies NARC storage outside overlays: `data/weather_sys.narc` member `9` is expanded to `0x16000` bytes. On ROMs without enough padding after that NARC, the installer grows the ROM, shifts later file data forward, updates affected FAT entries, and updates the NDS size/capacity header fields.

Modern sleep also edits the battle script byte sequence for `subscript_fall_asleep`, changing `Random 3, 2` to `Random 1, 3` before `BATTLEMON_STATUS` is updated. Observed ROM offsets are `0x008BDC08` in pkaizo and `0x03960E00` in clean US Platinum.

Modern burn also edits the battle script byte sequence for `subscript_burn_damage`, changing `DivideVarByValue BTLVAR_HP_CALC_TEMP, 8` to `DivideVarByValue BTLVAR_HP_CALC_TEMP, 16`. Observed divisor offsets are `0x008BEDC4` in pkaizo and `0x03961FBC` in clean US Platinum.

Fairy type research credit: Mikelan98 and BagBoy, "Fairy Type in Pokemon Platinum" (`pokehacking.com/r/20071800`).

G4Patcher simple patch references credit: Kalaay.

Continuous Rare Candy reference credit: Yako, Kalaay, Mixone; pokeplatinum team; Mikelan98 and Nomura for the ARM9 expansion basis.

Nature stat colors guide credit: RavePossum.
