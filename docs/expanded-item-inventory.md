# Expanded Item Inventory Runtime

## Stable Data

Inventory hardening preserves item IDs 468-595, the public `ITEMEXPV2` and
`EXTRATMSV1` tables, personal/TM compatibility data, and the `ITEMBAG2` save format.
It does not recover inventory already erased by older ROMs.

`ITEMEXPV2` remains responsible for archive lookup, authoritative overflow rows,
GeoNet protection, and post-mutation checksums. The new `ITEMUIV3` payload is a
separate 4 KB allocator-managed reservation in `data/weather_sys.narc` member 9.
Never assume its ROM offset or RAM address is fixed.

## Runtime Ownership

- Field overlay 84 retains the original `BagController` layout through `+0x4A4`.
  Its allocated tail contains original pocket pointers, 293 name pointers, and
  eight merged views. Each view is sized for its native pocket plus configured
  expanded definitions. View headers identify the owning Bag, native array,
  capacity, and pocket type.
- `BagApplicationPocket +0x0A` holds the full list count. The old byte at `+9` is
  saturated, not used by the patched list consumers. List counts include the
  original top/bottom padding and close entry where appropriate.
- The heap-allocated `BagCursor` grows from `0x24` to `0x44` bytes for eight pairs
  of 16-bit field positions. Vanilla byte-based callers remain supported. This
  does not change the saved Bag structure. New/zero cursor positions start at
  row 1, skipping the native list's top padding, including without a cursor cache.
- Extra TMs widen only the TM/HM pocket's text offset to 43 pixels. Berries keep
  their vanilla 35-pixel offset; the other pockets keep zero indentation.
- Views are read-only representations except for temporary UI operations.
  Use/toss/sell immediately call the authoritative inventory API, then rebuild
  the view. Vanilla reordering updates the native pocket first. Expanded rows
  cannot be reordered. Closing restores context pointers before freeing the
  controller; there is no close-time inventory copy-back.
- Battle overlay 13 retains its original `BattleBag` offsets through `+0x115C`.
  Its allocated tail holds 16-bit counts, an empty-slot sentinel, and category
  arrays sized from item definitions. Native render callers use bounded slot
  adapters. Page size stays six; existing byte page fields are sufficient for
  all supported definitions.

Item-data NARC members must be 34-byte records or 36-byte padded records. The
battle item table loads members separately at a 36-byte stride, including the
appended mint/cap data, with out-of-range indexes falling back to entry zero.

Unsupported expanded capture-ball, mail composition, berry planting/Poffin/tag,
and key-item actions are blocked. These categories still display and persist.
Shop TM presentation, Day Care inheritance, and HM move-deletion rules are not
modified.

## Automated Verification

Run from the patcher repository, with a legally obtained US Platinum Rev 1 ROM
at `../cleanplat.nds` or supplied via `ROM_PATH`:

```sh
node scripts/smoke-armips.js
node scripts/test-modern-held-items.js
UNICORN_PYTHON=python3 node scripts/test-item-inventory.js
```

The Python interpreter must have `unicorn` installed. Without `UNICORN_PYTHON`,
the inventory script runs ROM patch/upgrade checks but skips ARM execution.
Set `BASELINE_REPO` to a separate pre-hardening checkout to generate an older
patched ROM in an isolated worker and verify its upgrade. The checkout and input
ROM are read-only; temporary worker ROMs are removed afterward.

Coverage includes typed invalid-ID fallbacks, per-member padding, lookup bounds,
clean/repeated application, configuration changes, dynamically shifted payloads,
conflict rejection, public table preservation, GeoNet rollover/contact writes,
checksums, all eight pockets, 293 Items, 160 TM/HMs, fresh/cached 16-bit cursors,
native menu indentation and legacy spacing upgrades, immediate
removals/reordering, large battle categories, last-used selection, and native
battle name/quantity/description callers. Archive, save, allocation and graphics
services are stubbed in ARM tests; these are not full emulator tests.

## Emulator Checklist

Repatch with the same item configuration (including any manual expanded rows),
then boot from a normal battery save, not an old savestate.
Keep a backup of that save before testing.

- Confirm all vanilla medicine remains visible with mints/caps, and machine
  order is TM01-TM92, extra TMs, HM01-HM08.
- Fill Items beyond 255 entries. Scroll across 255/256, switch pockets, close and
  reopen, and make a party-menu round trip without losing position or entries.
- Use, toss, sell, give/take, and reorder vanilla items. Repeat supported actions
  on expanded items. Reopen and save/reload to verify quantities persist; failed
  actions must consume nothing.
- Check expanded Balls, Berries, Mail, and Key Items display, while unsupported
  actions fail safely. Test a native berry tag and planting/Poffin selection too.
- Populate a battle category beyond 36 items. Check later/final pages, names,
  descriptions, quantities, last-used selection, consumption, and reopening.
  Mints/caps should not appear as battle consumables with their normal data.
- Enter battle with a held mint/cap and with a normal held item. Check regular
  medicines and Infinite Candy/Infinite TMs when selected.
- Cross a day boundary and save/reload. Expanded quantities must remain intact.

In-game testing is intentionally left to the user before release.
