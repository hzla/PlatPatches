"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const core = require("../src/core.js");
const format = require("../src/battle-log-format.js");
const battleLogAsm = require("../src/asm/battle-log.js");
const app = require("../app.js");

function equalArray(actual, expected, label) {
  assert.deepStrictEqual(Array.from(actual), Array.from(expected), label);
}

function recordPackingTests() {
  const record = {
    trainerId: 1023,
    playerCount: 6,
    playerSpecies: [1, 255, 256, 511, 512, 1023],
    playerKoCreditsByEnemy: [1, 2, 3, 4, 5, 6],
    aiKoCreditsByPlayer: [6, 5, 4, 3, 2, 1],
    heldItems: [7, 8, 9, 10, 11, 1023],
    moves: Array.from({ length: 6 }, (_, slot) =>
      Array.from({ length: 4 }, (_, move) => 1 + slot * 4 + move)
    ),
  };
  const packed = format.packRecord(record);
  assert.strictEqual(packed.length, 52);
  assert.strictEqual(format.readBits(packed, 0, 10), 1023);
  assert.strictEqual(format.readBits(packed, 10, 3), 6);
  assert.strictEqual(format.readBits(packed, 13, 10), 1);
  assert.strictEqual(format.readBits(packed, 73 + 5 * 3, 3), 6);
  assert.strictEqual(format.readBits(packed, 91, 3), 6);
  assert.strictEqual(format.readBits(packed, 109 + 5 * 10, 10), 1023);
  assert.strictEqual(format.readBits(packed, 169 + 23 * 10, 10), 24);
  for (let bit = 409; bit < 416; bit += 1) {
    assert.strictEqual(format.readBits(packed, bit, 1), 0, `padding bit ${bit}`);
  }
  assert.deepStrictEqual(format.unpackRecord(packed), record);

  const normalized = format.unpackRecord(
    format.packRecord({
      trainerId: 1024,
      playerCount: 9,
      playerSpecies: [-1, 1024],
      playerKoCreditsByEnemy: [7],
      aiKoCreditsByPlayer: [-1],
      heldItems: [Infinity, 1024],
      moves: [1023, 1024],
    })
  );
  assert.strictEqual(normalized.trainerId, 0);
  assert.strictEqual(normalized.playerCount, 6);
  equalArray(normalized.playerSpecies, [0, 0, 0, 0, 0, 0]);
  equalArray(normalized.playerKoCreditsByEnemy, [0, 0, 0, 0, 0, 0]);
  equalArray(normalized.aiKoCreditsByPlayer, [0, 0, 0, 0, 0, 0]);
  equalArray(normalized.heldItems, [0, 0, 0, 0, 0, 0]);
  assert.strictEqual(normalized.moves[0][0], 1023);
  assert.strictEqual(normalized.moves[0][1], 0);
}

function pageAndAggregateTests() {
  for (let page = 0; page < format.LOG_SECTORS.length; page += 1) {
    const bytes = format.createLogPage(page);
    assert(format.validateLogPage(bytes, page));
    assert.strictEqual(format.readU16(bytes, 10), format.PAGE_CAPACITIES[page]);
    const corrupt = new Uint8Array(bytes);
    corrupt[100] ^= 0x80;
    assert(!format.validateLogPage(corrupt, page));
  }
  assert.strictEqual(format.PAGE_CAPACITIES.reduce((sum, value) => sum + value, 0), 600);

  const counts = new Uint16Array(1024);
  counts[1] = 3;
  counts[493] = 600;
  const aggregate = format.createAggregatePage(600, counts);
  assert(format.validateAggregatePage(aggregate));
  assert.strictEqual(format.readU16(aggregate, 8), 600);
  assert.strictEqual(format.readU16(aggregate, 32 + 493 * 2), 600);
  const corrupt = new Uint8Array(aggregate);
  corrupt[32] ^= 1;
  assert(!format.validateAggregatePage(corrupt));

  const sample = (trainerId, species = 1, credits = 1) => ({
    trainerId,
    playerCount: 1,
    playerSpecies: [species],
    playerKoCreditsByEnemy: [credits],
  });
  const boundaryStart = format.appendRecordsToPages([], Array.from({ length: 77 }, (_, id) => sample(id)));
  const boundary = format.appendRecordsToPages(boundaryStart.pages, [sample(77), sample(78)]);
  assert(boundary.appended, "two-record boundary transaction should append");
  assert.strictEqual(format.readU16(boundary.pages[0], 12), 78);
  assert.strictEqual(format.readU16(boundary.pages[1], 12), 1);
  assert(format.validateLogPage(boundary.pages[0], 0));
  assert(format.validateLogPage(boundary.pages[1], 1));

  const full = format.appendRecordsToPages(
    [],
    Array.from({ length: 600 }, (_, id) => sample(id & 0x3ff, (id % 493) + 1, id % 2))
  );
  assert(full.appended);
  assert.strictEqual(format.recordsFromLogPages(full.pages).length, 600);
  const beforeOverflow = full.pages.map((page) => new Uint8Array(page));
  const overflow = format.appendRecordsToPages(full.pages, [sample(900), sample(901)]);
  assert(!overflow.appended, "full log must reject the complete transaction");
  assert(overflow.overflow);
  for (let page = 0; page < overflow.pages.length - 1; page += 1) {
    equalArray(overflow.pages[page], beforeOverflow[page], `atomic overflow page ${page}`);
  }
  assert.strictEqual(format.readU16(overflow.pages[7], 12), 54);
  assert.strictEqual(format.readU16(overflow.pages[7], 14) & 1, 1);

  const aggregateSource = format.appendRecordsToPages([], [
    { trainerId: 1, playerCount: 2, playerSpecies: [4, 5], playerKoCreditsByEnemy: [1, 1] },
    { trainerId: 2, playerCount: 2, playerSpecies: [4, 5], playerKoCreditsByEnemy: [1, 1, 1] },
    { trainerId: 3, playerCount: 1, playerSpecies: [5], playerKoCreditsByEnemy: [1] },
  ]);
  const rebuilt = format.rebuildAggregatePage(aggregateSource.pages);
  assert(format.validateAggregatePage(rebuilt));
  assert.strictEqual(format.readU16(rebuilt, 8), 3);
  assert.strictEqual(format.readU16(rebuilt, 32 + 4 * 2), 5);
  assert.strictEqual(format.readU16(rebuilt, 32 + 5 * 2), 1);
}

function evolutionMember(targetsBySource, count, memberSize = 44) {
  return Array.from({ length: count }, (_, source) => {
    const member = new Uint8Array(memberSize);
    const targets = targetsBySource[source] || [];
    targets.forEach((target, index) => {
      format.writeU16(member, index * 6, 4);
      format.writeU16(member, index * 6 + 2, 16);
      format.writeU16(member, index * 6 + 4, target);
    });
    return member;
  });
}

function ancestryHas(result, species, ancestor) {
  const row = 16 + species * result.stride;
  return Boolean(result.bytes[row + (ancestor >>> 3)] & (1 << (ancestor & 7)));
}

function ancestryTests() {
  const linear = format.buildAncestryMember(evolutionMember({ 1: [2], 2: [3] }, 5));
  assert(format.ancestryHeader(linear.bytes));
  assert(ancestryHas(linear, 3, 1));
  assert(ancestryHas(linear, 3, 2));
  assert(ancestryHas(linear, 3, 3));
  assert(!ancestryHas(linear, 1, 3));

  const branch = format.buildAncestryMember(evolutionMember({ 1: [2, 3] }, 5, 42));
  assert(ancestryHas(branch, 2, 1));
  assert(ancestryHas(branch, 3, 1));
  assert(!ancestryHas(branch, 2, 3));

  const multipleParents = format.buildAncestryMember(evolutionMember({ 1: [3], 2: [3] }, 5));
  assert(ancestryHas(multipleParents, 3, 1));
  assert(ancestryHas(multipleParents, 3, 2));

  assert.throws(
    () => format.buildAncestryMember(evolutionMember({ 1: [2], 2: [1] }, 4)),
    /cycle/
  );
  assert.throws(
    () => format.buildAncestryMember(evolutionMember({ 1: [9] }, 4)),
    /invalid target/
  );
  const malformed = evolutionMember({}, 4);
  malformed[2] = new Uint8Array(41);
  assert.throws(() => format.buildAncestryMember(malformed), /neither a 42-byte table/);
}

function attributionModelTests() {
  function attribute({ doubles, victimSide, victimSlot, victimTrainer = 0, last, facing }) {
    if (victimSide === "partner" || last === "partner") {
      return null;
    }
    const credited = doubles && Number.isInteger(last) ? last : facing;
    if (!Number.isInteger(credited) || credited < 0 || credited >= 6) {
      return null;
    }
    return victimSide === "enemy"
      ? { trainer: victimTrainer, field: "playerKoCreditsByEnemy", index: victimSlot, value: credited + 1 }
      : { trainer: victimTrainer, field: "aiKoCreditsByPlayer", index: victimSlot, value: credited + 1 };
  }

  assert.deepStrictEqual(
    attribute({ doubles: false, victimSide: "enemy", victimSlot: 2, last: 5, facing: 0 }),
    { trainer: 0, field: "playerKoCreditsByEnemy", index: 2, value: 1 },
    "singles must use the directly facing battler"
  );
  assert.deepStrictEqual(
    attribute({ doubles: true, victimSide: "enemy", victimSlot: 4, last: 5, facing: 0 }),
    { trainer: 0, field: "playerKoCreditsByEnemy", index: 4, value: 6 },
    "doubles must use the last resolved targeter party slot"
  );
  assert.deepStrictEqual(
    attribute({ doubles: true, victimSide: "enemy", victimSlot: 4, last: null, facing: 1 }),
    { trainer: 0, field: "playerKoCreditsByEnemy", index: 4, value: 2 },
    "indirect faint without a targeter must fall back to the facing battler"
  );
  assert.deepStrictEqual(
    attribute({ doubles: true, victimSide: "player", victimSlot: 3, victimTrainer: 1, last: 2, facing: 0 }),
    { trainer: 1, field: "aiKoCreditsByPlayer", index: 3, value: 3 },
    "AI credit must be stored on the correct opponent record and player victim slot"
  );
  assert.strictEqual(
    attribute({ doubles: true, victimSide: "enemy", victimSlot: 0, last: "partner", facing: 1 }),
    null,
    "NPC partner KOs must be ignored"
  );
  assert.strictEqual(
    attribute({ doubles: true, victimSide: "partner", victimSlot: 0, last: 1, facing: 1 }),
    null,
    "NPC partner faints must be ignored"
  );
}

function staticRuntimeTests() {
  const source = battleLogAsm.battleLogSource({
    helperAddress: 0x023c9000,
    ancestryMember: 508,
    ancestrySpeciesCount: 508,
    ancestryStride: 64,
  });
  for (const required of [
    "HookInit:",
    "HookDefender:",
    "RecordResolvedTarget:",
    "HookFaint:",
    "RecordFaint:",
    "HookExit:",
    "HookFieldUpdate:",
    "FlushPending:",
    "AvailableRecordSlots:",
    "AppendPendingRecords:",
    "RebuildAggregate:",
    "HookSummary:",
    "HookSaveRecording:",
  ]) {
    assert(source.includes(required), `missing static runtime section ${required}`);
  }
  assert(source.includes("mov r1,0x18"), "two-trainer/tag classification is missing");
  assert(source.includes("StateLastPlayer"), "resolved player target tracking is missing");
  assert(source.includes("StateLastEnemy"), "resolved enemy target tracking is missing");
  assert(source.includes("strb r2,[r5,r0]"), "faint sentinel used to distinguish a new KO is missing");
  assert(source.includes("cmp r3,0xFF\n  beq @@rf_done"), "NPC partner KO suppression is missing");
  assert(source.includes("cmp r0,3\n  bne @@exit_original"), "aborted/fled result rejection is missing");
  assert(source.includes("mov r0,104"), "aggregate sector 104 access is missing");
}

async function patchedRomTests() {
  const cleanPath = path.resolve(__dirname, "../../cleanplat.nds");
  if (!fs.existsSync(cleanPath)) {
    console.log("Battle Log ROM integration test skipped: cleanplat.nds is absent.");
    return;
  }
  const clean = new Uint8Array(fs.readFileSync(cleanPath));
  const beforeEvoFile = core.findFileByPath(clean, "poketool/personal/evo.narc");
  const beforeEvo = clean.slice(beforeEvoFile.start, beforeEvoFile.end);
  const beforeMembers = Array.from({ length: core.parseNarc(beforeEvo).entries.length }, (_, index) =>
    core.narcMemberBytes(beforeEvo, index)
  );

  const result = await app.applySelectedPatches(clean, ["battleLog"], {});
  const patched = result.rom;
  assert(result.log.some((line) => line.includes("patched 12 verified hook")));
  assert(result.log.some((line) => line.includes("DSPRE ARM9 expansion")));

  const afterEvoFile = core.findFileByPath(patched, "poketool/personal/evo.narc");
  assert.strictEqual(afterEvoFile.fileId, beforeEvoFile.fileId, "evo.narc NitroFS ID changed");
  const afterEvo = patched.slice(afterEvoFile.start, afterEvoFile.end);
  const afterParsed = core.parseNarc(afterEvo);
  assert.strictEqual(afterParsed.entries.length, beforeMembers.length + 1);
  for (let index = 0; index < beforeMembers.length; index += 1) {
    equalArray(core.narcMemberBytes(afterEvo, index), beforeMembers[index], `evo member ${index}`);
  }
  assert(format.ancestryHeader(core.narcMemberBytes(afterEvo, beforeMembers.length)));

  const messageFile = core.findFileByPath(patched, "msgdata/pl_msg.narc");
  const messageNarc = patched.slice(messageFile.start, messageFile.end);
  assert.strictEqual(core.messageBankEntryText(core.narcMemberBytes(messageNarc, 455), 15), "Frags");

  const overlay = core.getOverlayRange(patched, 16);
  assert(!core.bytesEqual(patched, overlay.start + 0x13a, core.bytesFromHex("00 f0 89 fa")));
  assert.strictEqual(core.readU32(patched, overlay.start + 0x3365c) & 1, 1);
  equalArray(
    patched.slice(core.arm9Offset(patched, 0x02024d9a, 2), core.arm9Offset(patched, 0x02024d9a, 2) + 2),
    core.bytesFromHex("02 2c"),
    "download validation guard"
  );

  const reapplied = await app.applySelectedPatches(new Uint8Array(patched), ["battleLog"], {});
  assert.strictEqual(
    Buffer.compare(Buffer.from(reapplied.rom), Buffer.from(patched)),
    0,
    "Battle Log reapplication must be byte-identical"
  );
}

(async () => {
  recordPackingTests();
  pageAndAggregateTests();
  ancestryTests();
  attributionModelTests();
  staticRuntimeTests();
  await patchedRomTests();
  console.log("Battle Log tests passed.");
})().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
