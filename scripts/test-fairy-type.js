#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const app = require("../app.js");
const core = require("../src/core.js");

const CLEAN_ROM = path.resolve(process.argv[2] || path.join(__dirname, "..", "..", "cleanplat.nds"));
const PKAIZO_ROM = path.resolve(process.argv[3] || path.join(__dirname, "..", "..", "pknightfinal.nds"));
const MARKER = Buffer.from("FAIRYTBLV2", "ascii");
const POINTER_SITES = [
  [0x19e60, 1],
  [0x19e64, 2],
  [0x1a18c, 0],
  [0x1a2b4, 0],
  [0x1a300, 1],
  [0x1a304, 2],
  [0x1a780, 0],
  [0x1a784, 1],
  [0x1a788, 2],
  [0x1a7d4, 0],
];

function typeMultiplier(rows, attackingType, defendingType1, defendingType2 = defendingType1) {
  let multiplier = 40;
  for (const [attack, defend, value] of rows) {
    if (attack === 0xff) {
      break;
    }
    if (
      attack === attackingType &&
      (defend === defendingType1 || (defend === defendingType2 && defendingType1 !== defendingType2))
    ) {
      multiplier = (multiplier * value) / 10;
    }
  }
  return multiplier;
}

function validateFairyRom(rom, layoutShift) {
  const synthetic = core.readSyntheticOverlayMember(rom).member;
  const markerOffset = Buffer.from(synthetic).lastIndexOf(MARKER);
  assert(markerOffset >= 0, "missing FAIRYTBLV2 marker");
  assert.strictEqual(core.readU16(synthetic, markerOffset + 0x0a), 2);
  assert.strictEqual(core.readU16(synthetic, markerOffset + 0x0c), 124);
  assert.strictEqual(core.readU16(synthetic, markerOffset + 0x0e), 0x10);

  const tableOffset = markerOffset + 0x10;
  const tableRamAddress = core.SYNTH_OVERLAY_RAM_BASE + tableOffset;
  const rows = [];
  for (let row = 0; row < 124; row += 1) {
    rows.push(Array.from(synthetic.slice(tableOffset + row * 3, tableOffset + row * 3 + 3)));
  }
  assert.deepStrictEqual(rows[120], [0xfe, 0xfe, 0x00]);
  assert.deepStrictEqual(rows[123], [0xff, 0xff, 0x00]);
  assert.strictEqual(rows.slice(0, 120).filter(([attack, defend]) => attack === 9 || defend === 9).length, 12);
  assert(rows.slice(121, 123).every(([, defend, value]) => defend === 7 && value === 0));
  assert(rows.every(([, , value]) => [0, 5, 10, 20].includes(value)));

  assert.strictEqual(typeMultiplier(rows, 16, 9), 0, "Dragon should not affect Fairy");
  assert.strictEqual(typeMultiplier(rows, 9, 16), 80, "Fairy should be super-effective against Dragon");
  assert.strictEqual(typeMultiplier(rows, 8, 9), 80, "Steel should be super-effective against Fairy");
  assert.strictEqual(typeMultiplier(rows, 17, 9), 20, "Dark should be resisted by Fairy");
  for (let defendingType = 0; defendingType <= 17; defendingType += 1) {
    assert(
      [0, 20, 40, 80].includes(typeMultiplier(rows, 5, defendingType)),
      `Stealth Rock received an invalid Rock multiplier for type ${defendingType}`
    );
  }

  const overlay = core.getOverlayRange(rom, core.OVERLAY_16);
  for (const [relative, delta] of POINTER_SITES) {
    assert.strictEqual(
      core.readU32(rom, overlay.start + relative + layoutShift),
      tableRamAddress + delta,
      `stale type-chart pointer at overlay 16+0x${(relative + layoutShift).toString(16)}`
    );
  }
  assert.deepStrictEqual(
    Array.from(rom.slice(overlay.start + 0x19fb6 + layoutShift, overlay.start + 0x19fb8 + layoutShift)),
    [0x20, 0x18]
  );
  assert.deepStrictEqual(
    Array.from(rom.slice(overlay.start + 0x1a084 + layoutShift, overlay.start + 0x1a088 + layoutShift)),
    [0x60, 0x00, 0x21, 0x18]
  );
  assert.deepStrictEqual(
    Array.from(rom.slice(overlay.start + 0x1a766 + layoutShift, overlay.start + 0x1a768 + layoutShift)),
    [0x08, 0x18]
  );
  assert.deepStrictEqual(
    Array.from(rom.slice(overlay.start + 0x1a754 + layoutShift, overlay.start + 0x1a756 + layoutShift)),
    [0x7c, 0x29]
  );
  assert.deepStrictEqual(
    Array.from(rom.slice(overlay.start + 0x1a75c + layoutShift, overlay.start + 0x1a75e + layoutShift)),
    [0x7c, 0x21]
  );
}

function makeLegacyReaderRom(input) {
  const rom = new Uint8Array(input);
  const overlay = core.getOverlayRange(rom, core.OVERLAY_16);
  const legacySites = [
    [0x1a01a, "c0 46 00 49 88 47 01 94 0f 02 c0 46"],
    [0x1a074, "00 49 88 47 01 94 0f 02 c0 46 c0 46"],
    [0x19fb6, "c0 46"],
    [0x1a084, "61 00 c0 46"],
    [0x1a766, "c0 46"],
  ];
  for (const [relative, bytes] of legacySites) {
    core.writeBytes(rom, overlay.start + relative, core.bytesFromHex(bytes));
  }
  return rom;
}

async function verifyRom(input, layoutShift, label) {
  const first = await app.applySelectedPatches(input, ["fairyType"], {});
  const second = await app.applySelectedPatches(first.rom, ["fairyType"], {});
  assert.strictEqual(Buffer.compare(Buffer.from(first.rom), Buffer.from(second.rom)), 0, `${label} reapply changed bytes`);
  validateFairyRom(first.rom, layoutShift);
  return first;
}

async function main() {
  const clean = new Uint8Array(fs.readFileSync(CLEAN_ROM));
  await verifyRom(clean, 0, "clean ROM");

  const migrated = await verifyRom(makeLegacyReaderRom(clean), 0, "legacy Fairy ROM");
  assert(migrated.log.some((line) => line.includes("restored 5 legacy reader edit(s)")));

  const modernSteel = await app.applySelectedPatches(clean, ["fairyType", "modernSteelType"], {});
  const modernSteelReapply = await app.applySelectedPatches(
    modernSteel.rom,
    ["fairyType", "modernSteelType"],
    {}
  );
  assert.strictEqual(Buffer.compare(Buffer.from(modernSteel.rom), Buffer.from(modernSteelReapply.rom)), 0);
  validateFairyRom(modernSteel.rom, 0);

  if (fs.existsSync(PKAIZO_ROM)) {
    const pkaizo = new Uint8Array(fs.readFileSync(PKAIZO_ROM));
    await verifyRom(pkaizo, 8, "pkaizo ROM");
  }

  console.log("Fairy type chart tests passed.");
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
