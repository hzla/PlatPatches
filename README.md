# Pokemon Platinum ROM Patcher

Open `index.html` in a browser, choose a US Pokemon Platinum `.nds` ROM, select patches, and download the patched copy.

The patching is local browser-side JavaScript. No ROM data is uploaded.

Included patches:

- No critical hits
- Random IVs 15-31
- Wild natures never lower Attack, Special Attack, or Speed
- Faster player walk/run/cycling movement
- Force fastest normal field and battle text
- Experimental normal async text speed, configurable from 2x to 10x
- Player-side standard accuracy bypass

Notes:

- These offsets target `pkaizo.nds` first, with clean US Pokemon Platinum as the compatibility baseline.
- The nature filter intentionally replaces wild nature generation with an allowed-nature table, so Synchronize no longer forces banned wild natures.
- The movement patch now edits player movement constants instead of global movement action function tables. If it sees the older global movement edits made by this patcher, it restores those pointers before applying the safer player-scoped version.
- The text patch uses the fastest normal async text speed, which is one character per frame. The engine's true instant text path is synchronous and can leave field scripts waiting on a printer that no longer exists.
- The experimental text speed patch first applies Force fast text, then hooks the async text-printer task to render the selected number of normal characters per frame, from 2x to 10x. Callback-driven text falls back to one render per frame for safety, but timing quirks are still possible.
- The player accuracy patch bypasses the standard accuracy miss roll. It does not remove type immunities, Protect, or semi-invulnerable state checks.
- Several patches sanity-check their expected bytes and scan nearby if a compatible ROM has shifted code. The log calls out fallback scan usage and the patched offset.
