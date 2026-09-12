#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const app = require("../app.js");
const core = require("../src/core.js");

const ROM_PATH = process.env.ROM_PATH || path.resolve(__dirname, "../../cleanplat.nds");

const EXPECTED_BYTES = [
  [0x0205fe22, "10 24"],
  [0x0205fe3e, "14 24"],
  [0x0205ff92, "10 27"],
  [0x0205ffb0, "14 27"],
  [0x02060394, "4c 24"],
  [0x020603a8, "10 24"],
  [0x020603ac, "50 24"],
  [0x020603b0, "14 24"],
  [0x020603c0, "03 21"],
  [0x02065c0c, "08 b5 09 21 01 22 00 91 00 21 92 03 04 23 ff f7 b1 fe 01 20 08 bd"],
  [0x02065c24, "08 b5 09 21 00 91 01 21 8a 03 04 23 ff f7 a6 fe 01 20 08 bd"],
  [0x02065c38, "08 b5 09 21 00 91 02 21 4a 03 04 23 ff f7 9c fe 01 20 08 bd"],
  [0x02065c4c, "08 b5 09 21 01 22 00 91 03 21 92 03 04 23 ff f7 91 fe 01 20 08 bd"],
];

const LEGACY_POINTERS = [
  [0x020ef53c, 0x02065b11],
  [0x020ef530, 0x02065b25],
  [0x020ef524, 0x02065b39],
  [0x020ef518, 0x02065b4d],
  [0x020ef50c, 0x02065b61],
  [0x020ef500, 0x02065b79],
  [0x020ef4f4, 0x02065b8d],
  [0x020ef4e8, 0x02065ba1],
  [0x020ef4dc, 0x02065bb9],
  [0x020ef4d0, 0x02065bcd],
  [0x020ef4c4, 0x02065be1],
  [0x020ef4b8, 0x02065bf5],
  [0x020ef194, 0x02065b61],
  [0x020ef224, 0x02065b79],
  [0x020ef440, 0x02065b8d],
  [0x020ef470, 0x02065ba1],
];

const INTERIM_RUN_HANDLERS = [
  [0x02065c0c, "08 b5 09 21 02 22 00 91 00 21 92 03 02 23 ff f7 b1 fe 01 20 08 bd"],
  [0x02065c24, "08 b5 09 21 00 91 02 21 8a 03 02 23 ff f7 a6 fe 01 20 08 bd"],
  [0x02065c38, "08 b5 09 21 00 91 04 21 4a 03 02 23 ff f7 9c fe 01 20 08 bd"],
  [0x02065c4c, "08 b5 09 21 02 22 00 91 03 21 92 03 02 23 ff f7 91 fe 01 20 08 bd"],
];

function assertBytes(rom, ramAddress, expectedHex) {
  const expected = core.bytesFromHex(expectedHex);
  const offset = core.arm9Offset(rom, ramAddress, expected.length);
  assert(
    core.bytesEqual(rom, offset, expected),
    `unexpected bytes at ARM9 ${core.hex(ramAddress)}`
  );
}

function writeArm9Bytes(rom, ramAddress, hexBytes) {
  const value = core.bytesFromHex(hexBytes);
  core.writeBytes(rom, core.arm9Offset(rom, ramAddress, value.length), value);
}

function thumbBlTarget(rom, ramAddress) {
  const offset = core.arm9Offset(rom, ramAddress, 4);
  const first = core.readU16(rom, offset);
  const second = core.readU16(rom, offset + 2);
  assert.strictEqual(first & 0xf800, 0xf000, `missing Thumb BL prefix at ${core.hex(ramAddress)}`);
  assert.strictEqual(second & 0xf800, 0xf800, `missing Thumb BL suffix at ${core.hex(ramAddress)}`);
  let displacement = ((first & 0x7ff) << 12) | ((second & 0x7ff) << 1);
  if (displacement & 0x400000) {
    displacement -= 0x800000;
  }
  return (ramAddress + 4 + displacement) >>> 0;
}

async function apply(rom) {
  return (await app.applySelectedPatches(rom, ["movementSpeed"], {})).rom;
}

function assertCurrentPatch(rom) {
  EXPECTED_BYTES.forEach(([address, bytes]) => assertBytes(rom, address, bytes));

  const { member } = core.readSyntheticOverlayMember(rom);
  const markers = core.findNeedle(
    member,
    core.asciiBytes("MOVESPEEDV2"),
    0,
    member.length
  );
  assert.strictEqual(markers.length, 1, "expected exactly one MOVESPEEDV2 payload");
  const helperAddress = core.SYNTH_OVERLAY_RAM_BASE + markers[0] + 0x10;
  assert.strictEqual(thumbBlTarget(rom, 0x0205febe), helperAddress, "field run hook target mismatch");
  assert.strictEqual(
    thumbBlTarget(rom, 0x0205fffe),
    helperAddress,
    "Distortion World run hook target mismatch"
  );
  assert.strictEqual(
    thumbBlTarget(rom, 0x020659b2),
    helperAddress + 0x60,
    "run visual-tier hook target mismatch"
  );

  const animationMarkers = core.findNeedle(member, core.asciiBytes("RUNANIMV1"), 0, member.length);
  assert.strictEqual(animationMarkers.length, 1, "expected exactly one RUNANIMV1 payload");
  const overlay = core.getOverlayRange(rom, 5);
  assert.strictEqual(
    core.readU32(rom, overlay.start + 0x021ff41c - overlay.loadAddress),
    (core.SYNTH_OVERLAY_RAM_BASE + animationMarkers[0] + 0x10) | 1,
    "walking renderer run entry must point to the animation helper"
  );
}

async function main() {
  const clean = new Uint8Array(fs.readFileSync(ROM_PATH));
  const patched = await apply(clean);
  assertCurrentPatch(patched);

  const cleanOverlay = core.getOverlayRange(clean, 5);
  const patchedOverlay = core.getOverlayRange(patched, 5);
  const overlayCopy = patched.slice(patchedOverlay.start, patchedOverlay.end);
  const rendererOffset = 0x021ff41c - patchedOverlay.loadAddress;
  core.writeU32(overlayCopy, rendererOffset, 0x021ebefd);
  assert.deepStrictEqual(
    overlayCopy,
    clean.slice(cleanOverlay.start, cleanOverlay.end),
    "only the walking renderer's run entry may change in Overlay 5 (not bicycle/idle renderers)"
  );

  const previousV2 = new Uint8Array(patched);
  const { member: previousMember } = core.readSyntheticOverlayMember(previousV2);
  const previousMarker = core.findNeedle(previousMember, core.asciiBytes("RUNANIMV1"), 0, previousMember.length)[0];
  const previousBytes = new Uint8Array(previousMember);
  previousBytes.fill(0, previousMarker);
  core.replaceSyntheticOverlayMember(previousV2, previousBytes);
  core.writeU32(previousV2, patchedOverlay.start + rendererOffset, 0x021ebefd);
  assert.deepStrictEqual(await apply(previousV2), patched, "V2 without the animation fix must upgrade cleanly");

  const occupied = new Uint8Array(previousV2);
  const occupiedMember = new Uint8Array(previousBytes);
  const sentinel = new Uint8Array(0x80).fill(0xa5);
  occupiedMember.set(sentinel, previousMarker);
  core.replaceSyntheticOverlayMember(occupied, occupiedMember);
  const movedHelper = await apply(occupied);
  assertCurrentPatch(movedHelper);
  assert.deepStrictEqual(
    core.readSyntheticOverlayMember(movedHelper).member.slice(previousMarker, previousMarker + sentinel.length),
    sentinel,
    "animation upgrade must not overwrite another payload after MOVESPEEDV2"
  );
  assert.deepStrictEqual(await apply(movedHelper), movedHelper, "relocated animation helper must be idempotent");

  const reapplied = await apply(patched);
  assert.deepStrictEqual(reapplied, patched, "movement patch reapply changed the ROM");

  const legacy = new Uint8Array(clean);
  [
    [0x0205fe22, "10 24"],
    [0x0205fe3e, "14 24"],
    [0x0205ff92, "10 27"],
    [0x0205ffb0, "14 27"],
    [0x02060394, "50 24"],
    [0x020603a8, "14 24"],
    [0x020603ac, "14 24"],
    [0x020603b0, "54 24"],
  ].forEach(([address, bytes]) => writeArm9Bytes(legacy, address, bytes));
  for (const [address, pointer] of LEGACY_POINTERS) {
    core.writeU32(legacy, core.arm9Offset(legacy, address, 4), pointer);
  }
  const migratedLegacy = await apply(legacy);
  assert.deepStrictEqual(migratedLegacy, patched, "legacy movement patch did not migrate cleanly");

  const interim = new Uint8Array(clean);
  [
    [0x0205fe22, "10 24"],
    [0x0205ff92, "10 27"],
    [0x02060394, "50 24"],
    [0x020603a8, "14 24"],
    [0x020603ac, "14 24"],
  ].forEach(([address, bytes]) => writeArm9Bytes(interim, address, bytes));
  INTERIM_RUN_HANDLERS.forEach(([address, bytes]) => writeArm9Bytes(interim, address, bytes));
  const migratedInterim = await apply(interim);
  assert.deepStrictEqual(
    migratedInterim,
    patched,
    "shortened-RUN movement patch did not migrate cleanly"
  );

  if (process.env.UNICORN_PYTHON) {
    const arm9 = core.getArm9Info(patched);
    const { member } = core.readSyntheticOverlayMember(patched);
    const segments = [
      [arm9.loadAddress, patched.slice(arm9.fileOffset, arm9.fileOffset + arm9.size)],
      [patchedOverlay.loadAddress, patched.slice(patchedOverlay.start, patchedOverlay.end)],
      [core.SYNTH_OVERLAY_RAM_BASE, member],
    ].map(([address, data]) => ({ address, data: Buffer.from(data).toString("base64") }));
    const runtime = spawnSync(process.env.UNICORN_PYTHON, [path.join(__dirname, "test-run-animation-runtime.py")], {
      input: JSON.stringify({ segments, helper: core.readU32(patched, patchedOverlay.start + rendererOffset) }),
      encoding: "utf8",
    });
    if (runtime.error) throw runtime.error;
    process.stdout.write(runtime.stdout);
    process.stderr.write(runtime.stderr);
    assert.strictEqual(runtime.status, 0, "ARM run-animation regression failed");
  }

  console.log("field movement tests passed");
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
