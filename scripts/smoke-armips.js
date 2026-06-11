#!/usr/bin/env node
"use strict";

const assembler = require("../src/asm/armips-assembler.js");
const templates = require("../src/asm/templates.js");

function hex(bytes) {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join(" ");
}

function equalBytes(a, b) {
  return a.length === b.length && a.every((byte, index) => byte === b[index]);
}

async function assertTemplate(name, source, expectedHex) {
  const actual = await assembler.assembleArmips({ source });
  const expected = Uint8Array.from(
    expectedHex
      .split(/\s+/)
      .filter(Boolean)
      .map((byte) => parseInt(byte, 16))
  );
  if (!equalBytes(actual, expected)) {
    throw new Error(`${name} mismatch: ${hex(actual)}`);
  }
}

(async () => {
  await assertTemplate(
    "Tiny THUMB fixture",
    `.nds
.create "output.bin",0
.thumb
.org 0
  mov r0,1
  bx lr
.close
`,
    "01 20 70 47"
  );

  await assertTemplate(
    "Modern Paralysis Thunder Wave helper",
    templates.modernParalysisThunderWaveHelper({
      helperAddress: 0x020f318c,
    }),
    `
      0c 49 60 50 0c 4a a2 58 56 2a 12 d1 e2 6e c0 23
      5a 43 0a 4b a2 18 d0 5c 0d 28 03 d0 01 33 d0 5c
      0d 28 06 d1 06 4a a0 58 06 23 98 43 08 23 18 43
      a0 50 70 47 44 21 00 00 44 30 00 00 64 2d 00 00
      6c 21 00 00
    `
  );

  await assertTemplate(
    "Modern Burn helper",
    templates.modernBurnHelper({
      helperAddress: 0x020f3168,
    }),
    `
      12 98 10 21 08 42 0c d0 3e 2f 0a d0 02 98 83 21
      49 00 01 31 88 42 04 d0 21 98 c1 0f 41 18 48 10
      21 90 70 47
    `
  );

  await assertTemplate(
    "Modern Sleep helper",
    templates.modernSleepHelper({
      helperAddress: 0x020f321c,
      battleSystemRandNextAddress: 0x0223f4bc,
    }),
    `
      1c b5 0d 4b d4 58 07 20 20 40 03 28 00 d9 03 20
      01 38 01 28 08 d1 0a 98 4c f1 42 f9 07 49 88 42
      01 d2 00 20 00 e0 01 20 07 21 8c 43 04 43 00 9a
      01 4b d4 50 21 1c 1c bd b0 2d 00 00 55 55 00 00
    `
  );

  await assertTemplate(
    "Modern Freeze helper",
    templates.modernFreezeHelper({
      helperAddress: 0x020f3300,
      battleSystemRandNextAddress: 0x0223f4bc,
    }),
    `
      10 b5 0c 1c 62 6e c0 21 4a 43 09 49 89 18 09 19
      0a 88 01 32 0a 80 03 2a 06 d2 4c f1 cf f8 03 21
      08 42 01 d0 01 20 10 bd 00 22 0a 80 00 20 10 bd
      ba 2d 00 00
    `
  );

  await assertTemplate(
    "Modern Confusion helper",
    templates.modernConfusionHelper({
      helperAddress: 0x020f3260,
      battleSystemRandNextAddress: 0x0223f4bc,
    }),
    `
      00 b5 4c f1 2b f9 02 49 88 42 01 d2 00 20 00 bd
      01 20 00 bd 55 55 00 00
    `
  );

  await assertTemplate(
    "Nature Stat Colors helper",
    templates.natureStatColorsHelper({
      helperAddress: 0x023c8010,
      pokemonGetStatAffinityOfAddress: 0x02075c60,
      printStringToWindowAddress: 0x020900d8,
    }),
    `
      f0 b5 81 b0 04 46 0d 46 1f 46 91 20 80 00 20 58
      29 1a 09 09 00 26 01 29 01 d1 01 26 0e e0 02 29
      01 d1 02 26 0a e0 03 29 01 d1 04 26 06 e0 04 29
      01 d1 05 26 02 e0 05 29 0b d1 03 26 a1 20 80 00
      01 38 20 5c 31 46 ad f4 03 fe 01 28 05 d0 00 28
      01 d4 06 4a 02 e0 06 4a 00 e0 06 4a 20 46 29 46
      3b 46 c8 f4 31 f8 01 b0 f0 bd c0 46 00 02 01 00
      00 04 03 00 00 06 05 00
    `
  );

  await assertTemplate(
    "Item Renewal writeback helper",
    templates.itemRenewalWritebackHelper({
      helperAddress: 0x023c8010,
      flagIndexAddress: 0x020787cc,
      battleSystemGetBattleContextAddress: 0x0223df10,
    }),
    `
      30 b5 04 9d 65 20 80 00 2d 18 6d 78 70 78 00 07
      00 0f b0 f4 d3 fb 04 1c b1 68 01 43 b1 60 b2 89
      00 2a 0e d1 03 98 75 f6 6b ff 71 21 89 00 2a 1c
      01 23 1a 40 d2 00 89 18 42 58 23 1c db 05 1a 43
      42 50 70 78 00 07 30 bd
    `
  );

  await assertTemplate(
    "Item Renewal party held-item helper",
    templates.itemRenewalPartyHeldItemHelper({
      helperAddress: 0x023c8054,
      flagIndexAddress: 0x020787cc,
      battleSystemGetBattleContextAddress: 0x0223df10,
    }),
    `
      ee b5 07 1c 07 9e 36 68 b0 68 75 f6 57 ff 05 1c
      09 98 31 1c 2c 31 08 5c 06 28 0e d2 b0 f4 ac fb
      71 21 89 00 b2 6a 01 23 1a 40 d2 00 89 18 6a 58
      03 1c db 05 1a 42 00 d0 00 27 e7 83 60 68 ee bd
    `
  );

  await assertTemplate(
    "Infinite Candy chain helper",
    templates.infiniteCandyChainHelper({
      helperAddress: 0x023c8012,
      bagCanRemoveItemAddress: 0x0207d688,
      windowEraseMessageBoxAddress: 0x0200e084,
      partyMenuPrintToWindow32Address: 0x020826e0,
    }),
    `
      20 b5 08 70 00 28 22 d1 b4 20 c0 00 04 30 21 18
      0d 68 68 68 dd 21 49 00 01 39 01 22 0c 23 b5 f4
      2a fb 00 28 13 d0 dd 21 49 00 01 39 24 20 28 18
      01 80 20 1c 89 21 89 00 40 18 00 21 46 f4 19 f8
      20 1c 20 21 01 22 ba f4 42 fb 04 20 20 bd 20 20
      20 bd 00 e0 00 00
    `
  );

  await assertTemplate(
    "Infinite Candy Bag_TryRemoveItem helper",
    templates.infiniteCandyBagRemovalHelper({
      helperAddress: 0x023c8018,
      bagTryRemoveItemSlotAddress: 0x0207d5e8,
      bagTryRemoveItemResumeAddress: 0x0207d61c,
    }),
    `
      08 bc 01 b4 dd 20 40 00 01 38 81 42 01 bc 01 d1
      01 20 70 47 f0 b5 83 b0 06 1c 0f 1c 15 1c 1c 1c
      b5 f4 d6 fa 00 4b 18 47 1d d6 07 02
    `
  );

  await assertTemplate(
    "Infinite Candy Pocket_TryRemoveItem helper",
    templates.infiniteCandyPocketRemovalHelper({
      helperAddress: 0x023c8044,
      pocketTryRemoveItemCountAddress: 0x0207d5b8,
      pocketTryRemoveItemResumeAddress: 0x0207d664,
    }),
    `
      08 bc 01 b4 dd 20 40 00 01 38 82 42 01 bc 01 d1
      01 20 70 47 70 b5 05 1c 0e 1c 1c 1c b5 f4 aa fa
      00 4b 18 47 65 d6 07 02
    `
  );

  console.log("armips smoke fixtures passed.");
})();
