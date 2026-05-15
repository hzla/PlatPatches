# Pokemon Platinum ROM Patcher

Open `index.html` in a browser, choose a US Pokemon Platinum `.nds` ROM, select patches, and download the patched copy.

The patching is local browser-side JavaScript. No ROM data is uploaded.

Included patches:

- No critical hits
- Random IVs 15-31
- Wild natures never lower Attack, Special Attack, or Speed
- Faster player walk/run/cycling movement
- Fairy Patch with optional Pokemon type updates
- Shiny odds, configurable by integer percentage from 0% to 100%
- Experimental normal async text speed, configurable from 2x to 10x
- Player-side standard accuracy bypass

Notes:

- These offsets target `pkaizo.nds` first, with clean US Pokemon Platinum as the compatibility baseline.
- The nature filter intentionally replaces wild nature generation with an allowed-nature table, so Synchronize no longer forces banned wild natures.
- The movement patch now edits player movement constants instead of global movement action function tables. If it sees the older global movement edits made by this patcher, it restores those pointers before applying the safer player-scoped version.
- The Fairy Patch replaces the existing ??? type slot (`0x09`) with Fairy battle logic and visual assets. Its optional Pokemon type update changes only personal-data type bytes for the Kanto-Sinnoh base-form retypes, leaving Altaria unchanged because Platinum has no Mega Evolution form.
- For quick Fairy battle testing, the browser console can enable `window.PlatinumPatcher.config.debugFairyBattleTest = true` before applying Fairy Patch. This hidden debug mode also applies Pokemon type updates, then turns non-Fairy Pokemon into mono Fighting and all moves into Fairy type.
- The shiny odds patch edits the ARM9 `Pokemon_IsPersonalityShiny` threshold. The UI maps integer percentages from `0%` to `100%` onto the closest threshold out of `65536`; for example `50%` becomes threshold `32768`, and `100%` becomes threshold `65536`. Thresholds up to `255` use the original one-byte `cmp r0, #imm8` edit; higher thresholds rewrite the small shiny predicate in place so no code cave is needed.
- `100%` shiny odds can stall event/gift routines that explicitly reroll until a Pokemon is not shiny.
- The experimental text speed patch first applies the fastest normal async text speed, then hooks the async text-printer task to render the selected number of normal characters per frame, from 2x to 10x. Callback-driven text falls back to one render per frame for safety, but timing quirks are still possible.
- The player accuracy patch bypasses the standard accuracy miss roll. It does not remove type immunities, Protect, or semi-invulnerable state checks.
- Several patches sanity-check their expected bytes and scan nearby if a compatible ROM has shifted code. The log calls out fallback scan usage and the patched offset.

Fairy type research credit: Mikelan98 and BagBoy, "Fairy Type in Pokemon Platinum" (`pokehacking.com/r/20071800`).
