#!/usr/bin/env node
"use strict";

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const core = require("../src/core.js");
const app = require("../app.js");
const itemExpansion = require("../src/patches/item-expansion.js")(core);
const modernHeldItems = require("../src/patches/modern-held-items.js")(core, itemExpansion);

const cleanRomPath = path.resolve(process.argv[2] || path.join(__dirname, "..", "..", "cleanplat.nds"));

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function markerCount(bytes, marker) {
  const data = Buffer.from(bytes);
  const needle = Buffer.from(marker, "ascii");
  let count = 0;
  let offset = 0;
  while ((offset = data.indexOf(needle, offset)) !== -1) {
    count += 1;
    offset += needle.length;
  }
  return count;
}

function itemText(rom, member, itemId) {
  const file = core.findFileByPath(rom, "msgdata/pl_msg.narc");
  const narc = rom.slice(file.start, file.end);
  return core.messageBankEntries(core.narcMemberBytes(narc, member))[itemId];
}

function locateSyntheticHook(rom, overlay, preferredRel, expectedTarget) {
  const start = Math.max(overlay.start, overlay.start + preferredRel - 0x100);
  const end = Math.min(overlay.end - 8, overlay.start + preferredRel + 0x100);
  const matches = [];
  for (let offset = start + (start & 1); offset <= end; offset += 2) {
    if (
      core.readU32(rom, offset) === 0x47184b00 &&
      (core.readU32(rom, offset + 4) & ~1) === expectedTarget
    ) {
      matches.push(offset);
    }
  }
  assert.strictEqual(matches.length, 1, `expected one synthetic hook near overlay 16+0x${preferredRel.toString(16)}`);
  return matches[0] - overlay.start;
}

async function main() {
  const clean = new Uint8Array(fs.readFileSync(cleanRomPath));
  const evolutionInfo = modernHeldItems.buildEvolvableSpeciesTable(clean);
  assert.strictEqual(evolutionInfo.speciesCount, 508);
  assert.strictEqual(evolutionInfo.table[1], 1, "Bulbasaur should be Eviolite-eligible");
  assert.strictEqual(evolutionInfo.table[3], 0, "Venusaur should not be Eviolite-eligible");
  assert.strictEqual(evolutionInfo.table[133], 1, "Eevee should be Eviolite-eligible");

  const soloRows = itemExpansion.normalizedExpandedItemRows({ modernHeldItemsAutoExpandedItems: true }, clean);
  assert.strictEqual(soloRows.length, 4);
  assert.deepStrictEqual(
    { itemId: soloRows[0].itemId, cloneFrom: soloRows[0].cloneFrom, iconFrom: soloRows[0].iconFrom },
    { itemId: 468, cloneFrom: 92, iconFrom: 229 }
  );
  assert.deepStrictEqual(
    {
      itemId: soloRows[1].itemId,
      cloneFrom: soloRows[1].cloneFrom,
      iconFrom: soloRows[1].iconFrom,
      kind: soloRows[1].heldItemKind,
    },
    { itemId: 469, cloneFrom: 92, iconFrom: 277, kind: "loadedDice" }
  );
  assert.deepStrictEqual(
    {
      itemId: soloRows[2].itemId,
      cloneFrom: soloRows[2].cloneFrom,
      iconFrom: soloRows[2].iconFrom,
      kind: soloRows[2].heldItemKind,
    },
    { itemId: 470, cloneFrom: 92, iconFrom: 224, kind: "clearAmulet" }
  );
  assert.deepStrictEqual(
    {
      itemId: soloRows[3].itemId,
      cloneFrom: soloRows[3].cloneFrom,
      iconFrom: soloRows[3].iconFrom,
      kind: soloRows[3].heldItemKind,
    },
    { itemId: 471, cloneFrom: 92, iconFrom: 238, kind: "rockyHelmet" }
  );

  const composedRows = itemExpansion.normalizedExpandedItemRows(
    {
      extraTmsAutoExpandedItems: true,
      natureMintsAutoExpandedItems: true,
      bottleCapsAutoExpandedItems: true,
      modernHeldItemsAutoExpandedItems: true,
    },
    clean
  );
  assert.strictEqual(composedRows.find((row) => row.heldItemKind === "eviolite").itemId, 560);
  assert.strictEqual(composedRows.find((row) => row.heldItemKind === "loadedDice").itemId, 561);
  assert.strictEqual(composedRows.find((row) => row.heldItemKind === "clearAmulet").itemId, 562);
  assert.strictEqual(composedRows.find((row) => row.heldItemKind === "rockyHelmet").itemId, 563);

  const first = await app.applySelectedPatches(clean, ["modernHeldItems"], {});
  const second = await app.applySelectedPatches(first.rom, ["modernHeldItems"], {});
  assert.strictEqual(Buffer.compare(Buffer.from(first.rom), Buffer.from(second.rom)), 0, "reapply changed ROM bytes");

  const syntheticMember = core.readSyntheticOverlayMember(first.rom).member;
  assert.strictEqual(markerCount(syntheticMember, "ITEMEXPV2"), 1);
  assert.strictEqual(markerCount(syntheticMember, "MODHELDITEMV2"), 1);
  assert.strictEqual(itemText(first.rom, 392, 468), "Eviolite");
  assert.match(itemText(first.rom, 391, 468), /raises Defense and Sp\. Def/);
  assert.strictEqual(itemText(first.rom, 392, 469), "Loaded Dice");
  assert.match(itemText(first.rom, 391, 469), /strike multiple times/);
  assert.strictEqual(itemText(first.rom, 392, 470), "Clear Amulet");
  assert.match(itemText(first.rom, 391, 470), /stat reductions/);
  assert.strictEqual(itemText(first.rom, 392, 471), "Rocky Helmet");
  assert.match(itemText(first.rom, 391, 471), /direct contact/);

  const markerOffset = Buffer.from(syntheticMember).indexOf(Buffer.from("MODHELDITEMV2", "ascii"));
  assert(markerOffset >= 0);
  const damageHelperOffset = markerOffset + 16 + 0x100;
  const damageHelper = syntheticMember.slice(damageHelperOffset, damageHelperOffset + 0x80);
  const loadedDiceHelperOffset = markerOffset + 16 + 0x180;
  const loadedDiceHelper = syntheticMember.slice(loadedDiceHelperOffset, loadedDiceHelperOffset + 0x80);
  const registryOffset = markerOffset + 16 + 0x200;
  assert.strictEqual(core.readU16(syntheticMember, registryOffset), 4);
  assert.deepStrictEqual(
    Array.from(syntheticMember.slice(registryOffset + 2, registryOffset + 18)),
    [0xd4, 0x01, 152, 0, 0xd5, 0x01, 153, 0, 0xd6, 0x01, 154, 0, 0xd7, 0x01, 155, 0]
  );
  assert(
    core.findNeedle(damageHelper, core.bytesFromHex("04 98 41 08 40 18 04 90"), 0, damageHelper.length)
      .length === 1,
    "Eviolite helper must scale the spDefenseStat local at SP+0x10"
  );
  assert(
    core.findNeedle(damageHelper, core.bytesFromHex("01 98 41 08 40 18 01 90"), 0, damageHelper.length)
      .length === 0,
    "Eviolite helper must not overwrite the BattleSystem pointer at SP+0x04"
  );

  const overlay = core.getOverlayRange(first.rom, core.OVERLAY_16);
  const payloadHelperAddress = core.SYNTH_OVERLAY_RAM_BASE + markerOffset + 16;
  const lookupHookRel = locateSyntheticHook(first.rom, overlay, 0x1ffbc, payloadHelperAddress);
  const damageHookRel = locateSyntheticHook(first.rom, overlay, 0x1f658, payloadHelperAddress + 0x100);
  const multiHitHookRel = locateSyntheticHook(first.rom, overlay, 0x718a, payloadHelperAddress + 0x180);
  const clearAmuletHookRel = locateSyntheticHook(first.rom, overlay, 0x72c0, payloadHelperAddress + 0x480);
  const rockyOnHitHookRel = locateSyntheticHook(first.rom, overlay, 0x1d77c, payloadHelperAddress + 0x280);
  const rockyPivotHookRel = locateSyntheticHook(first.rom, overlay, 0x200e8, payloadHelperAddress + 0x380);
  assert(lookupHookRel >= 0);
  assert(clearAmuletHookRel >= 0 && rockyOnHitHookRel >= 0 && rockyPivotHookRel >= 0);
  const damageReturnAddress = overlay.loadAddress + damageHookRel + 8;
  const returnLiteral = new Uint8Array(4);
  core.writeU32(returnLiteral, 0, damageReturnAddress | 1);
  assert.strictEqual(
    core.findNeedle(damageHelper, returnLiteral, 0, damageHelper.length).length,
    1,
    "Eviolite helper must resume after the full eight-byte damage hook"
  );
  assert.strictEqual(
    core.findNeedle(damageHelper, core.bytesFromHex("2f 23 70 47"), 0, damageHelper.length).length,
    1,
    "Eviolite helper must restore the overwritten mov r3, #HOLD_EFFECT_HALVE_SPEED instruction before resuming"
  );
  assert.deepStrictEqual(
    Array.from(first.rom.slice(overlay.start + multiHitHookRel - 0xc, overlay.start + multiHitHookRel - 8)),
    [0x00, 0x2c, 0x16, 0xd1],
    "Loaded Dice must leave the fixed-hit/variable-hit gate intact"
  );
  assert(
    core.findNeedle(loadedDiceHelper, core.bytesFromHex("5c 28"), 0, loadedDiceHelper.length).length === 1,
    "Loaded Dice helper must preserve Skill Link's five-hit behavior"
  );
  assert(
    core.findNeedle(loadedDiceHelper, core.bytesFromHex("67 28"), 0, loadedDiceHelper.length).length === 1,
    "Loaded Dice helper must reject Klutz holders"
  );
  const loadedDiceTarget = core.readU32(first.rom, overlay.start + multiHitHookRel + 4) & ~1;
  assert.strictEqual(loadedDiceTarget, core.SYNTH_OVERLAY_RAM_BASE + loadedDiceHelperOffset);

  const bagOverlay = core.getOverlayRange(first.rom, core.OVERLAY_84);
  const inventory = require("../src/patches/item-inventory.js")(core).installed(first.rom);
  assert(inventory, "modern held items install the hardened inventory runtime");
  const pocketSizesOffset = bagOverlay.start + (0x02241118 - bagOverlay.loadAddress);
  assert.strictEqual(first.rom[pocketSizesOffset], 165, "native pocket table stays unchanged; runtime owns rendered capacities");
  for (const [ram, target] of [
    [0x0223bfbc, inventory.loadNames],
    [0x0223c158, inventory.initNames],
    [0x0223c178, inventory.freeNames],
  ]) {
    const hookOffset = bagOverlay.start + (ram - bagOverlay.loadAddress);
    assert.strictEqual(core.readU32(first.rom, hookOffset), 0x47184b00);
    assert.strictEqual(core.readU32(first.rom, hookOffset + 4) & ~1, target);
  }

  const subscriptFile = core.findFileByPath(first.rom, "battle/skill/sub_seq.narc");
  const subscriptNarc = first.rom.slice(subscriptFile.start, subscriptFile.end);
  const subscriptParsed = core.parseNarc(subscriptNarc);
  assert.strictEqual(subscriptParsed.entries.length, 298);
  const rockySubscript = core.narcMemberBytes(subscriptNarc, 297);
  assert.strictEqual(core.readU32(rockySubscript, rockySubscript.length - 4), 222, "Rocky subscript must end normally");
  assert.strictEqual(
    core.findNeedle(rockySubscript, core.bytesFromHex("ca 00 00 00"), 0, rockySubscript.length).length,
    0,
    "Rocky Helmet's persistent recoil subscript must not remove the item"
  );

  console.log(`Modern Held Items smoke test passed: ${sha256(first.rom)}`);
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
