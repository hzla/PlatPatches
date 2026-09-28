#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawnSync } = require("child_process");
const app = require("../app.js");
const core = require("../src/core.js");

const ROM_PATH = process.env.ROM_PATH || path.resolve(__dirname, "../../cleanplat.nds");
const HOOKS = [
  [0x0202c8c8, "70 b5 06 1c 01 20 0d 1c"],
  [0x0202c918, "f8 b5 07 1c 0d 1c 14 1c 00 93 04 2b"],
  [0x0207d5b2, "01 20 03 b0 f0 bd"],
  [0x0207d650, "01 20 03 b0 f0 bd"],
  [0x0202c9e2, "ff 21 7f 1c 09 01 8f 42"],
];

function payload(rom) {
  const { member } = core.readSyntheticOverlayMember(rom);
  const markers = core.findNeedle(member, core.asciiBytes("ITEMEXPV2"), 0, member.length);
  assert.strictEqual(markers.length, 1);
  const offset = markers[0];
  assert(core.bytesEqual(member, offset + 0x1a90, core.asciiBytes("ITEMSAFEV1")));
  assert.strictEqual(core.findNeedle(member, core.asciiBytes("ITEMSAFEV1"), 0, member.length).length, 1);
  const helper = core.SYNTH_OVERLAY_RAM_BASE + offset + 16;
  const runtime = require("../src/patches/item-inventory.js")(core).installed(rom);
  assert(runtime, "versioned inventory runtime present");
  const overlay = core.getOverlayRange(rom, 84);
  for (const [address, destination, isOverlay] of [
    [0x0223dd22, runtime.removeFromView, true], [0x0223d464, runtime.reorderView, true],
    [0x0207d5b2, helper + 0x1cc0, false], [0x0207d650, helper + 0x1d00, false],
  ]) {
    const at = isOverlay ? overlay.start + address - overlay.loadAddress : core.arm9Offset(rom, address, 4);
    const first = core.readU16(rom, at), second = core.readU16(rom, at + 2);
    assert.strictEqual(first & 0xf800, 0xf000);
    assert.strictEqual(second & 0xf800, 0xf800);
    let delta = ((first & 0x7ff) << 12) | ((second & 0x7ff) << 1);
    if (delta & 0x400000) delta -= 0x800000;
    assert.strictEqual(address + 4 + delta, destination, "persistence call target");
  }
  return { member, offset, helper };
}

function runtimeFixture(rom) {
  const { member, offset, helper } = payload(rom);
  const arm9 = core.getArm9Info(rom);
  const overlay = core.getOverlayRange(rom, 84);
  const itemFile = core.findFileByPath(rom, "itemtool/itemdata/pl_item_data.narc");
  const items = rom.slice(itemFile.start, itemFile.end);
  const count = core.readU16(member, offset + 0x292);
  const pockets = {};
  const battleMasks = {};
  for (let id = 1; id < 468 + count; id += 1) {
    const dataId = id < 468
      ? core.readU16(rom, core.arm9Offset(rom, 0x020f0cc4 + id * 8, 2))
      : core.readU16(member, offset + 0x298 + (id - 468) * 8);
    const data = core.narcMemberBytes(items, dataId);
    pockets[id] = (core.readU16(data, 8) >>> 7) & 15;
    battleMasks[id] = core.readU16(data, 8) >>> 11;
  }
  const segments = [
    [arm9.loadAddress, rom.slice(arm9.fileOffset, arm9.fileOffset + arm9.size)],
    [overlay.loadAddress, rom.slice(overlay.start, overlay.end)],
    [core.SYNTH_OVERLAY_RAM_BASE, member],
    (() => { const battle = core.getOverlayRange(rom, 13); return [battle.loadAddress, rom.slice(battle.start, battle.end)]; })(),
  ].map(([address, data]) => ({ address, data: Buffer.from(data).toString("base64") }));
  const battleDataOverlay = core.getOverlayRange(rom, 16);
  return {
    segments, helper, pockets, battleMasks, count,
    runtime: require("../src/patches/item-inventory.js")(core).installed(rom),
    dataMembers: core.parseNarc(items).entries.map((_, i) => Buffer.from(core.narcMemberBytes(items, i)).toString("base64")),
    battleData: { address: battleDataOverlay.loadAddress, data: Buffer.from(rom.slice(battleDataOverlay.start, battleDataOverlay.end)).toString("base64") },
  };
}

async function main() {
  const clean = new Uint8Array(fs.readFileSync(ROM_PATH));
  const patches = ["extraTMs", "natureMints", "bottleCaps", "modernHeldItems", "infiniteContinuousCandy", "infiniteTMs"];
  const options = {
    expandedItems: [
      { cloneFrom: 79, name: "Overflow Repel", description: "Test item." },
      { cloneFrom: 149, name: "Overflow Berry", description: "Test berry." },
    ],
    extraTms: Array.from({ length: 60 }, () => ({ move: 2, compatiblePokemon: [] })),
  };
  const { rom } = await app.applySelectedPatches(clean, patches, options);
  const current = payload(rom);
  assert.deepStrictEqual((await app.applySelectedPatches(rom, patches, options)).rom, rom, "exact reapply");
  // Upgrade both historical spacing variants: shared 43px and TM-only with
  // berries incorrectly at 0px. Neither may survive a reapplication.
  for (const previous of [
    "fd 30 00 06 00 0e 01 28 01 d8 2b 20 00 e0 00 20 48 75",
    "fd 30 00 06 00 0e 00 28 01 d1 2b 20 00 e0 00 20 48 75",
  ]) {
    const oldSpacing = new Uint8Array(rom);
    const bag = core.getOverlayRange(oldSpacing, 84);
    core.writeBytes(oldSpacing, bag.start + 0x0223c27a - bag.loadAddress, core.bytesFromHex(previous));
    assert.deepStrictEqual((await app.applySelectedPatches(oldSpacing, patches, options)).rom, rom,
      "legacy TM/berry indentation upgrades without changing item data");
  }
  const noConfig = (await app.applySelectedPatches(rom, ["natureMints"], { expandedItems: options.expandedItems })).rom;
  assert.deepStrictEqual(app.detectExtraTmState(noConfig).rows, app.detectExtraTmState(rom).rows,
    "a dependency upgrade preserves unselected TM configuration");
  const noConfigPayload = payload(noConfig);
  assert.deepStrictEqual(noConfigPayload.member.slice(noConfigPayload.offset + 0x290, noConfigPayload.offset + 0x698),
    current.member.slice(current.offset + 0x290, current.offset + 0x698), "a dependency upgrade preserves item IDs and records");

  if (process.env.BASELINE_REPO) {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "platpatches-inventory-"));
    try {
      const outPath = path.join(temp, "legacy.nds");
      const worker = spawnSync(process.execPath, [path.join(__dirname, "compare-armips-migration.js"), "--worker"], {
        input: JSON.stringify({ repoPath: process.env.BASELINE_REPO, romPath: ROM_PATH, patchIds: patches, options, repeat: 1, outPath }),
        encoding: "utf8", maxBuffer: 1024 * 1024,
      });
      assert.strictEqual(worker.status, 0, worker.stderr);
      const oldRom = new Uint8Array(fs.readFileSync(outPath));
      const oldMember = core.readSyntheticOverlayMember(oldRom).member;
      assert.strictEqual(core.findNeedle(oldMember, core.asciiBytes("ITEMUIV3"), 0, oldMember.length).length, 0);
      const oldOffset = core.findNeedle(oldMember, core.asciiBytes("ITEMEXPV2"), 0, oldMember.length)[0];
      const upgraded = (await app.applySelectedPatches(oldRom, patches, options)).rom;
      const updated = payload(upgraded);
      assert.deepStrictEqual(updated.member.slice(updated.offset + 0x290, updated.offset + 0x698),
        oldMember.slice(oldOffset + 0x290, oldOffset + 0x698), "upgrade preserves public item rows");
      assert.deepStrictEqual(app.detectExtraTmState(upgraded).rows, app.detectExtraTmState(oldRom).rows,
        "upgrade preserves TM item IDs, moves and compatibility");
      assert.deepStrictEqual((await app.applySelectedPatches(upgraded, patches, options)).rom, upgraded,
        "released-ROM upgrade reapplies identically at its dynamically allocated address");
      console.log("released-ROM upgrade preserves item/TM tables and is idempotent");
    } finally {
      fs.rmSync(temp, { recursive: true, force: true });
    }
  }

  // Simulate the released V2 payload without changing item IDs or any save data.
  const legacy = new Uint8Array(rom);
  const member = new Uint8Array(current.member);
  member.fill(0, current.offset + 0x1a90, current.offset + 0x1f04);
  core.replaceSyntheticOverlayMember(legacy, member);
  for (const [address, bytes] of HOOKS) {
    core.writeBytes(legacy, core.arm9Offset(legacy, address, bytes.split(" ").length), core.bytesFromHex(bytes));
  }
  core.writeU32(legacy, core.arm9Offset(legacy, 0x0207d828, 4), (current.helper + 0x700) | 1);
  const overlay = core.getOverlayRange(legacy, 84);
  for (const [address, bytes] of [[0x0223dd22, "3f f6 99 fc"], [0x0223d464, "3f f6 c2 fc"]]) {
    core.writeBytes(legacy, overlay.start + address - overlay.loadAddress, core.bytesFromHex(bytes));
  }
  assert.deepStrictEqual((await app.applySelectedPatches(legacy, patches, options)).rom, rom, "V2 upgrade must preserve configuration");

  for (const count of [1, 128]) {
    const expandedItems = Array.from({ length: count }, (_, i) => ({ cloneFrom: 17, name: `Test ${i}`, description: "Test." }));
    const result = await app.applySelectedPatches(clean, ["itemExpansion"], { expandedItems });
    const installed = payload(result.rom);
    assert.strictEqual(core.readU16(installed.member, installed.offset + 0x292), count);
    assert.deepStrictEqual((await app.applySelectedPatches(result.rom, ["itemExpansion"], { expandedItems })).rom, result.rom);
  }

  const conflicting = new Uint8Array(rom);
  core.writeU32(conflicting, core.arm9Offset(conflicting, 0x0207d38c, 4), 0x023c7001);
  await assert.rejects(app.applySelectedPatches(conflicting, patches, options), /hook conflict/);
  const badData = new Uint8Array(clean);
  core.writeU16(badData, core.arm9Offset(badData, 0x020f0cc4 + 79 * 8, 2), 65535);
  await assert.rejects(app.applySelectedPatches(badData, ["itemExpansion"], {
    expandedItems: [{ cloneFrom: 17, name: "Test", description: "Test." }],
  }), /missing data member/);

  const occupied = (await app.applySelectedPatches(clean, ["arm9Expansion"], {})).rom;
  const occupiedMember = core.readSyntheticOverlayMember(occupied).member;
  occupiedMember.fill(0xa5, 0, 0x1800);
  core.replaceSyntheticOverlayMember(occupied, occupiedMember);
  let changed = occupied;
  for (const [count, cloneFrom] of [[1, 17], [128, 79], [60, 17]]) {
    const expandedItems = Array.from({ length: count }, (_, i) => ({ cloneFrom, name: `Update ${i}`, description: "Test." }));
    changed = (await app.applySelectedPatches(changed, ["itemExpansion"], { expandedItems })).rom;
    const state = payload(changed);
    assert(state.member.slice(0, 0x1800).every((byte) => byte === 0xa5), "another payload remains untouched");
    assert.strictEqual(core.readU16(state.member, state.offset + 0x292), count);
    assert.deepStrictEqual((await app.applySelectedPatches(changed, ["itemExpansion"], { expandedItems })).rom, changed,
      "count/category changes at a shifted runtime address are idempotent");
  }

  if (process.env.UNICORN_PYTHON) {
    const fixture = runtimeFixture(rom);
    fixture.capacityCases = [];
    for (const cloneSources of [79, 17, 27, 55, 4].map((id) => Array(128).fill(id)).concat([[79, 17, 4, 328, 149, 137, 55, 450]])) {
      const expandedItems = cloneSources.map((cloneFrom, i) => ({ cloneFrom, name: `Capacity ${i}`, description: "Test." }));
      const result = await app.applySelectedPatches(clean, ["itemExpansion"], { expandedItems });
      fixture.capacityCases.push(runtimeFixture(result.rom));
    }
    const test = spawnSync(process.env.UNICORN_PYTHON, [path.join(__dirname, "test-item-inventory-runtime.py")], {
      input: JSON.stringify(fixture), encoding: "utf8",
    });
    if (test.error) throw test.error;
    process.stdout.write(test.stdout);
    process.stderr.write(test.stderr);
    assert.strictEqual(test.status, 0, "ARM item inventory tests");
  } else {
    console.log("ARM execution tests skipped (set UNICORN_PYTHON to Python with Unicorn).");
  }
  console.log("item inventory patch, upgrade, 1/128-row and combined-patch tests passed");
}

main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
