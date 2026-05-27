(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory;
  } else {
    root.PlatinumPatcherFairyPatches = factory(root.PlatinumPatcherCore);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (core) {
  "use strict";

  if (!core) {
    throw new Error("Fairy patches require PlatinumPatcherCore to load first.");
  }

  const {
    OVERLAY_16,
    OVERLAY_21,
    PatchError,
    SPECIES_JIGGLYPUFF,
    arm9Offset,
    bytesEqual,
    bytesFromHex,
    findFileByPath,
    findNeedle,
    getOverlayRange,
    hex,
    parseNarc,
    readU32,
    replaceNarcMembers,
    replaceRomFile,
    writeBytes,
    writeU32,
  } = core;

const FAIRY_TET_PATCH = bytesFromHex(`
  00 05 00 08 0A 0A 0A 0B 0A 0C 0A 0F 0A 06 0A 05
  0A 10 0A 08 0B 0A 0B 0B 0B 0C 0B 04 0B 05 0B 10
  0D 0B 0D 0D 0D 0C 0D 04 0D 02 0D 10 0C 0A 0C 0B
  0C 0C 0C 03 0C 04 0C 02 0C 06 0C 05 0C 10 0C 08
  0F 0B 0F 0C 0F 0F 0F 04 0F 02 0F 10 0F 08 0F 0A
  01 00 01 0F 01 03 01 02 01 0E 01 06 01 05 01 11
  01 08 03 0C 03 03 03 04 03 05 03 07 03 08 04 0A
  04 0D 04 0C 04 03 04 02 04 06 04 05 04 08 02 0D
  02 0C 02 01 02 06 02 05 02 08 0E 01 0E 03 0E 0E
  0E 11 0E 08 06 0A 06 0C 06 01 06 03 06 02 06 0E
  06 07 06 11 06 08 05 0A 05 0F 05 01 05 04 05 02
  05 06 05 08 07 00 07 0E 07 11 07 08 07 07 10 10
  10 08 11 01 11 0E 11 07 11 11 11 08 08 0A 08 0B
  08 0D 08 0F 08 05 08 08 FE FE 00 07 01 07 10 09
  01 09 06 09 11 09 03 09 08 09 09 10 09 01 09 11
  09 08 09 0A 09 03 FF FF 00 00 00 00 00 00 00 00
  00 00 00 00 00 00 00 00 00 00 FF FF 11 11 44 41
  14 41 14 41 41 10 41 14 11 41 14 11 14 14 44 11
  44 11 11 44 44 11 11 04 41 40 14 41 44 41 14 41
  01 14 11 14 14 14 41 14 41 04 12 44 11 44 12 11
  14 41 00 00 11 14 44 44 11 1F FF FF FF FF FF
`);

const FAIRY_READ1_PATCH = bytesFromHex("c0 46 00 49 88 47 01 94 0f 02 c0 46");
const FAIRY_READ2_PATCH = bytesFromHex("00 49 88 47 01 94 0f 02 c0 46 c0 46");
const FAIRY_LOOP1_PATCH = bytesFromHex("c0 46");
const FAIRY_LOOP2_PATCH = bytesFromHex("61 00 c0 46");
const FAIRY_LOOP3_PATCH = bytesFromHex("c0 46");
const FAIRY_ARM9_HELPER = bytesFromHex(`
  01 90 38 b4 0c 4b d2 1a 52 08 86 24 64 00 1b 19
  52 08 9b 5c 03 d2 f0 25 2b 40 1a 09 02 e0 0f 25
  2b 40 1a 46 05 25 6a 43 75 46 06 35 ae 46 38 bc
  28 46 39 46 01 49 08 47 d4 ec 26 02 3d b6 25 02
`);
const FAIRY_POKEDEX_DISPLAY_PATCH = bytesFromHex(`
  49 88 8f 44 22 00 26 00 2a 00 2e 00 32 00 36 00
  3a 00 3e 00 42 00 66 00 46 00 4a 00 4e 00 52 00
  56 00 5a 00 5e 00 62 00 00 20 70 47 06 20 70 47
  0e 20 70 47 0a 20 70 47 08 20 70 47 05 20 70 47
  0b 20 70 47 07 20 70 47 09 20 70 47 01 20 70 47
  03 20 70 47 02 20 70 47 04 20 70 47 0f 20 70 47
  0d 20 70 47 10 20 70 47 0c 20 70 47 12 20 70 47
`);

const FAIRY_PL_BATT_OBJ_ENTRY_74 = bytesFromHex(`
  52 4c 43 4e ff fe 00 01 9e 00 00 00 10 00 02 00
  54 54 4c 50 78 00 00 00 03 00 00 00 00 00 00 00
  a0 01 00 00 10 00 00 00 00 00 5f 1b 5e 19 d2 14
  1c 37 97 1e b1 19 ff 3f b5 3e 7b 63 6e 25 09 1d
  f7 6a 00 00 f0 39 ff 7f 00 00 19 7f 55 7a 6e 4d
  4d 7a 73 6f fa 77 e9 28 7f 45 1f 5b 92 31 14 51
  1b 5e 52 52 f0 39 ff 7f 00 00 f8 33 2f 2b 0b 22
  ee 7c e9 48 97 7e f5 12 9b 1b 4f 0a 9b 6e 7e 7b
  57 62 00 00 f0 39 ff 7f 50 4d 43 50 16 00 00 00
  03 00 ef be 08 00 00 00 00 00 01 00 02 00
`);
const FAIRY_PL_BATT_OBJ_ENTRY_236 = bytesFromHex(`
  10 30 01 00 00 52 47 43 4e ff fe 01 01 00 34 01
  00 00 10 00 01 00 04 52 41 48 43 24 00 0b 02 00
  0f 04 00 03 00 10 13 00 04 10 03 00 1f 40 18 40
  0b b0 bb bb bb ab aa 4a aa 40 01 fa ff 00 03 ee
  00 07 ae e8 10 0b 10 2e 00 1e bb 50 1e ef fa ef
  04 fa ee ef fe ee 00 08 ae ae 10 ff ff ae d0 1f
  ff fe ff ae ba 00 1e ef 00 1e 00 03 60 1f 0b 00
  5e ba ba 20 3f ef b0 03 80 6b 00 6f ea 00 73 aa
  21 aa ac 00 8b c0 cc cc cc 10 aa b0 00 4c ae 10
  6b 00 78 fe aa ee ea fc 00 97 30 a8 00 1e 20 1f
  10 8d 10 6b ff fe 07 ae ef ee ee ae e0 1f 00 a9
  c0 5d a8 20 e8 ca 00 5e 0c 11 0a
`);

const FAIRY_ZUKAN_ENTRY_88 = bytesFromHex(`
  10 5c 02 00 00 52 45 43 4e ff fe 00 01 00 5c 02
  00 00 10 00 03 00 04 4b 42 45 43 4c 00 0b 13 00
  03 01 00 18 00 00 00 00 16 a0 01 08 02 00 07 08
  10 12 17 00 07 05 00 e8 ff f8 ff 10 0f 0c c0 0f
  d5 10 37 90 1f 24 c0 2f 30 c0 3f 3c c0 4f 55 48
  c0 5f 54 c0 6f 60 c0 7f 6c c0 8f 55 78 c0 9f 84
  c0 af 90 c0 bf 9c c0 cf 55 a8 c0 df b4 c0 ef c0
  80 ff 06 01 0f 44 cc a1 0f 18 0a f0 01 37 49 00
  00 0f 00 aa ff dc ff f8 40 00 e8 81 00 00 f8 00
  08 40 24 02 00 10 0b 03 20 10 0b 05 20 92 10 17
  06 10 10 17 08 10 10 23 09 aa 20 17 0b 20 17 0c
  20 17 0e 20 17 0f aa 20 23 11 20 23 12 20 3b 14
  20 3b 15 aa 20 47 17 20 47 18 20 47 1a 20 47 1b
  a4 20 6b 1d 20 6b 1e 30 10 77 20 30 aa 10 83 21
  20 0b 23 20 0b 24 20 17 26 aa 20 17 27 20 9b 29
  20 9b 2a 20 a7 2c aa 20 a7 2d 20 9b 2f 20 9b 30
  20 b3 32 00 20 dc 40 aa e1 33 40 dc 00 40 ea c1
  3b 40 dc 00 2a 00 a0 43 40 f0 40 aa c1 33 c0 00
  05 10 11 f0 00 2a 80 43 40 a0 10 e9 4a 20 71 4b
  30
`);
const FAIRY_ZUKAN_ENTRY_89 = bytesFromHex(`
  10 44 02 00 00 52 4e 41 4e ff fe 00 01 00 44 02
  00 00 10 00 03 00 05 4b 4e 42 41 34 00 0b 13 00
  01 00 18 00 00 00 48 01 00 00 73 e0 00 03 50 01
  30 0a 01 00 00 2e e0 0f 5d 08 c0 1f 10 c0 2f 10
  4f 90 3f 20 c0 4f 55 28 c0 5f 30 c0 6f 38 c0 7f
  40 c0 8f 55 48 c0 9f 50 c0 af 58 c0 bf 60 c0 cf
  55 68 c0 df 70 c0 ef 78 c0 ff 80 c1 0f 50 88 c1
  1f 90 41 36 04 00 ef be 77 04 40 07 11 23 10 0f
  0c 40 17 11 23 10 1f 77 14 40 27 11 73 10 2f 1c
  40 37 11 23 10 3f 77 24 40 47 11 23 10 4f 2c 40
  57 11 23 10 5f 77 34 40 67 11 23 10 6f 3c 40 77
  11 23 10 7f 70 44 40 87 11 23 10 8f 00 00 cc cc
  55 01 00 03 02 00 07 03 00 0b 04 00 0f 55 05 00
  13 06 00 17 07 00 1b 08 00 1f 55 09 00 23 0a 00
  27 0b 00 2b 0c 00 2f 55 0d 00 33 0e 00 37 0f 00
  3b 10 00 3f 50 11 00 43 12 00 47
`);
const FAIRY_ZUKAN_ENTRY_90 = bytesFromHex(`
  10 b0 26 00 00 52 47 43 4e ff fe 01 01 00 b4 26
  00 00 10 00 01 00 04 52 41 48 43 a4 00 0b 0a 00
  0a 20 00 03 00 10 13 20 00 05 00 28 00 80 00 1f
  18 00 0f d0 dd dd 00 dd ed 22 22 22 2d 11 11 00
  11 2d 31 e1 1e 2d 11 e1 6a ee 90 03 00 1e dd 00
  1e 22 00 1e 11 00 e1 1e e1 ee e1 fe ee ee 09 ef
  fe ee ff 00 03 1f ee 00 03 c3 90 1f 00 1e 1e ee
  e1 ee 20 20 30 03 56 ee c0 3f 11 00 1e e1 10 16
  30 03 fe 51 fe 10 6b fe a0 03 31 11 ff 10 8b 0f
  1d 33 33 33 10 9b 10 63 40 03 00 7b 0e e1 ee 11
  ff 00 01 00 ab 00 1e 33 d4 10 9b 00 63 fe 50 6f
  fe 10 98 11 ff 45 f1 90 1f ef fe ff 00 b3 11 00
  b3 8c 30 03 1f ff 11 a0 1f 90 df 11 ee 2b 1e e1
  00 b2 e1 00 df ef 50 03 01 1e 50 0d 01 1e d1 01
  1e d3 1e 11 13 3b d3 fe 00 07 90 03 00 e2 ef 20
  03 40 33 0c 1f ff f1 1f 90 9f 50 2f ee 1e 80 00
  03 fe 11 d3 ff ff 13 d3 d0 10 4b 40 be 0d 21 7f
  88 88 88 8d 07 77 77 77 8d 97 00 03 10 07 80 03
  d0 11 7f 00 1e 88 00 1e 77 77 e7 ee 4c ee 30 03
  fe ff 50 0b 90 1f 7e e7 16 7e e7 fe 00 01 ff 00
  05 00 23 e7 7a 7f 00 0d 90 3f 30 3d 00 23 ef 10
  25 fe 98 00 4d fe e7 d0 6f 50 83 7d 99 99 6c 99
  12 1b 30 6b fe 00 7b 40 03 77 ff df 20 8a 00 1e
  99 12 1b 10 63 10 6b 60 03 c0 1f 3b ee ee 00 8d
  10 73 40 01 ff c0 3f b0 9f 41 7e 00 a3 fe 77 fe
  ff ff 10 ab aa 00 af 7f 10 ff 0d 01 1e d7 01 1e
  d9 1c 77 77 79 00 03 10 07 70 03 fe ff 37 7f 77
  10 95 50 3b ff 00 3b 90 9f d0 2f e0 50 43 40 be
  31 7f 55 55 55 5d 44 08 44 44 5d 64 00 03 44 44
  e4 e8 90 03 12 ff 00 1e 55 00 1e 44 ee ee 91 00
  02 ee 4e 22 67 fe 44 ff 02 fe 68 4e 23 1f 60 1f
  4e 10 1f e4 ee ff b3 03 21 4f 43 04 a0 3f 44 e4
  10 3e 23 3f 43 e4 03 47 e4 fe e4 ee c0 6f 50 83
  06 44 4d 66 66 66 13 9b 02 d5 ee 70 fe 10 2c 13
  00 00 59 f4 ff 4f f4 d2 10 8b 00 1e 66 22 ff fe
  ef 03 66 e4 62 ee 10 6f 20 03 f4 4f ff b0 1f 44
  b3 13 21 44 13 92 10 6f 44 ff 00 01 80 3f e0 90
  df 40 be 13 e0 ef f4 ef ee 4e e8 10 ce 12 ff 01
  1e d4 01 1e d6 44 44 17 46 d6 4e 00 07 fe 00 0b
  00 64 00 0f 04 44 d6 ee 44 f4 04 10 4e e4 c3 13
  eb 00 f4 ee ff 44 f4 a0 7f 50 2f bf 50 33 4f 00
  43 10 4b 40 be d1 7f a1 7b d1 7f 8d 01 5e 44 fe
  44 04 7e 10 03 4e 24 3e c5 13 9f f1 9f ef fe f4
  01 33 44 10 03 f7 b1 bf 20 dc 02 92 04 c1 4f 01
  8b 00 03 a1 7b fb f1 7f 02 bf 44 ae 01 13 04 f8
  e4 41 5e 71 7f fd 02 09 10 03 04 7b 20 6f 41 5e
  71 9f 4f 01 e9 cf 30 03 20 6f f4 4f f1 7f 62 5f
  70 9e 01 51 fd 01 f5 02 2e f1 7f 71 4f 21 87 02
  52 44 52 4c bc 00 9f ff c0 9f 11 a7 b1 83 f1 7f
  ed bb 00 bb bb bd aa aa aa bd ca 0b ea ee bd aa
  20 03 fe 40 07 25 ff a0 00 1e bb 00 1e aa ee ea
  ae aa be 05 fc aa 05 fc 00 0b 00 03 00 0b 90 1f
  ea 20 ee ee 10 03 ef ea fe ff ef b4 00 0b ea 10
  0b a0 3f ee 00 02 ee ae a7 15 a7 fa 00 45 aa fe
  10 73 30 6b 60 6f 08 bd ca aa ff 10 8b ad cc cc
  7c cc 16 9b 10 6b 00 8e 00 7b 41 ba af ff 6c ff
  10 8b 00 1e cc 16 9b 20 6b fe aa ab 10 6b ea 06
  6e af 00 1e af 90 1f 10 63 50 fe 10 b7 ee 00 b3
  ee ff aa fa f9 30 1e 60 3f b0 9f 50 64 06 e1 af
  ea 10 03 d0 22 ff 01 1e da 01 1e dc ee aa ac 05
  dc ee ae aa dc 01 02 dc 00 fe 5c dc 00 52 dc 10
  23 40 2b 20 33 fa af fc 00 d8 80 9f 00 72 20 33
  10 2f 10 33 aa ff 3f ac dc 10 4b 40 be f5 ff f5
  ff 65 ff 45 fe fd a5 c0 a6 1f d5 e0 06 0c f0 1f
  56 00 77 06 26 ff f6 6f d5 ff 06 72 a5 c0 05 fe
  26 00 55 ff 65 d8 cf 15 b8 05 ec 77 f7 05 90 a0
  1f 16 3a 06 98 fc f0 1f e5 ff 06 be 46 28 06 98
  16 38 ee fe 7f 7f f5 ff b5 ff 37 0e f0 9f f5 ff
  f5 ff 67 7f 9d 68 ff 11 e1 09 07 a0 03 98 ff ee
  08 1f b9 07 33 e1 06 9f 08 e5 09 28 ee 1f a0 1f
  eb 08 de 00 1d 20 21 ef 00 25 11 00 29 a9 3f 59
  11 00 33 1e 00 33 09 3a e1 ff 09 26 74 1e 09 2a
  d0 6f 08 ff 11 98 ff fe ff ff 00 2f 09 7a 50 03
  28 fc 98 5f 09 90 00 91 19 1a ce 08 5e 07 6d 11
  f1 a9 1f 49 aa 40 73 1f 3c e1 1f 38 9e f8 ff 19
  bf 46 65 fe f1 3b ee ff 19 2a 19 2e 98 ff 11 08
  ff 08 dc ff 20 03 30 0f 19 0b 30 27 50 2f 09 5e
  a8 ff 50 27 f3 70 07 f8 ff 74 7f 14 0f aa ea 90
  03 f4 3f ea 24 3f 03 cd 17 7f ae a4 9f aa 04 5f
  af fd 0a 74 00 03 5a 80 27 7f 64 bf 14 a1 ae 3a
  bf ff 03 dd 04 c2 14 ef a0 6f 50 83 64 7f 27 7f
  10 2c df 47 7f 04 3f fa 94 7f 17 eb 10 6f 30 77
  00 01 7d fa b0 1f 05 26 05 0f 04 f8 27 be ea 04
  bf db b4 1f 95 5f ae 14 e3 14 e7 af 05 20 04 7f
  6d ae 05 87 94 7f ae 04 7f 05 33 dc 05 00 ef 24
  43 34 93 74 7b fe 04 b3 05 1c a5 1f 50 27 ff 70
  07 f4 7f 81 7f 95 ff 25 97 b1 3f 25 be 2b ff b7
  01 7e af 11 4b a0 bf aa 05 dc 25 a7 61 7e bd a6
  3f ea 00 1d 05 55 6b 5b 1b 67 8d 0a cc ab 40 03
  ee 0b 03 ee 0b 03 f7 9a 7f 1b f7 d0 0a 40 1b e5
  7f 09 58 7f ff 7f f7 f0 a4 5f 1b f3 10 20 2c 54
  7f ee fe f7 3d 7f f7 a4 9f 6b cb 0c b6 00 1e ef
  04 9f ff ea 7f 71 7f 02 1c 12 18 5c bf 0c e0 f5
  ff 35 ff fa 50 03 29 9f 50 03 0a e9 0a df f7 b0
  7f 77 68 d9 10 03 0a d6 d9 05 1d d9 ff 7f f8 fa
  7f f2 ff 72 8f f7 3f 37 3f ee ae ff fe 17 4f c0
  1f a6 bf 16 97 b7 bf 02 fb 1d 47 ff 67 ff 0a a2
  17 8a af ee 12 ff 93 73 e2 ff ff 00 68 02 97 17
  3b f7 3f 2d 7f 76 fb 20 6f d6 ff 3b ff af 07 74
  13 96 60 7b fa f2 ff f8 5f ff 20 73 03 77 18 5f
  67 7f 52 bb 92 d3 03 c8 f8 1f ff f2 ff 03 3b 01
  ab 23 3b f7 7f 7d 7f 12 83 20 03 fd 62 93 ad 3f
  2d 3e 3e ff 0c d4 02 6d ee 16 9f f9 ad 7f 32 8b
  64 7e bd 7f 1c de ee e7 2c 1f 3a ee f7 0f 45 0d
  ae c0 6f fe 0e 03 ff f7 a2 ff 22 f3 0d 08 2d 11
  e7 0d 15 b7 7f 0f 8c 6f 77 8e ff ed 5f ef 03 3d
  40 20 0d ee 03 42 f1 07 a1 fd 7f 50 df 00 01 7e
  ee 7e 1f 4a ef 27 83 0f eb 9d 7f ee 0d 7f 0d 92
  a0 03 13 9b bb 43 9f ef f3 9f 0f bf c0 2f f7 f2
  ff dd 7f f3 a0 03 9d 7f 1d 3e 30 03 fe ff 50 0b
  dc 1f b6 0d a2 4f 10 01 0d 80 4f 10 0b 9d bf e4
  ff 0d 9f 1d 73 2b 5a 40 03 d0 6f dd 7f 30 6b 0c
  f1 9f 50 7b 44 ff bd 5f 20 6d 20 73 0c ff 0d fb
  f8 00 20 9d 9f 50 6b 0d c4 1d 1c ee ff 4f 78 44
  ad bf ce 3f 1e 63 0e 59 4f 44 44 ff 0c 28 10 6d
  dd 7f 3d 87 70 03 0c c4 0d 81 10 2b bf 00 2f fe
  0c 5c 3c 9e 6e 1f d0 2f 50 43 ad 7f fb 78 ff 28
  7b 90 03 98 ff 48 f4 1e 38 de 30 01 ff b8 df 60
  1f 00 23 f0 1f e0 3f 0f ec d0 6f d8 ff e7 50 67
  29 78 18 de ff ff a8 5f 40 17 49 72 ef 09 74 00
  21 c0 1f ff 09 86 60 8f d0 1f a0 df 71 1e 00 01
  29 4c 30 6b e1 ee fe e8 ff ff d8 cf 2a 08 f0 5f
  f8 ff f8 ff fb ff fb ff ab ff fd 1b 21 1b 4d 90
  03 b0 1f 3c 20 0b 70 ff 50 26 cf a4 9f 5c 41 7f
  e7 07 27 14 4b 27 73 fb ff ff 8b ff d0 6f d4 7f
  70 8e 14 9f 14 a3 b7 7f 1b fd de 2b a1 00 6f fe
  00 73 0c 3c ac 3f c5 1f 77 bf 0c 45 77 04 a3 05
  6b 0c ce 0c 49 fb ff bb ff fd 3c 6d b0 3b fb ff
  fb ff f4 7f 2f fb ee 0f fb ff a0 03 b3 9f 04 5f
  0f cd 07 3f 24 5b 14 69 b4 5f ff 00 01 44 5b 03
  c8 03 ed f0 1f 44 7f 60 03 0c 77 88 b0 03 31 11
  f1 9b ff ff 1f ee 37 1f 1f 0b 8b 00 03 ee 30 03
  bb df 0c 19 7f 1f 1c 1d 03 94 1c 6f 52 fe 73 1f
  63 a9 f2 ff fb d4 7f 00 bf 05 1f 3b 1f 0f 01 4f
  15 d3 94 7f 6b 4e 04 7f 05 00 d6 04 9e d6 04 9e
  30 0b bd 39 9b 1f 1c 38 1c 84 d3 7f 00 b4 d3 50
  03 9b 00 a9 d3 ff fb ff 8d 7f e1 0d 0f 20 03 f6
  04 17 20 03 ad 3f 1d 5f ee 0d 81 0b de ef ff 0f
  a6 0d 4a 3a 7f 8d 5f 20 14 10 8e 13 bc 0d a1 94
  c4 9f 1e e1 0f dd e1 3a 7f f1 ef ea 0d a2 0d ef
  a0 6f fe 0e 03 ff ad 7f 1f fe 0d 0c 04 18 24 fc
  14 e0 cd 5f 0d f3 6d 2b ff f4 21 a7 bc ff 10 63
  0e 06 e1 0e 38 ef 11 ff 0c b9 4d 9e fd 7f 1e 3f
  34 7e 1e 61 5d 89 2a 7f a0 5d 7f ee 0d 7f ee 1e
  11 d3 ef 5f fe 0d 83 ff 3d 87 2d 0b 40 33 1e 07
  d1 ff b4 1d af ef 00 33 0e 1c d3 0e 1c d3 ff 6f
  1f fd 7f 77 7f e4 02 ff 20 03 07 17 30 03 f7 a6
  9f 06 9d 03 03 1d 5d ef 06 d1 10 03 a7 7f ab 07
  9f 44 00 1e 4e 0b e2 fe 50 03 a7 7f f2 06 e0 0e
  f6 07 24 0d a4 4f f4 11 c3 e4 fc 91 eb 31 ff b1
  7f 11 0a 0f 46 58 5f ef ff ec 4e c0 5e ff 0f 47
  fe 0f 47 60 6f ff f1 eb 0e 82 92 7f 12 29 1f 2c
  1d ef 15 cf 06 3f d7 ee ff 77 7f e4 00 dd e4 42
  d2 38 d2 97 7f 09 e4 4e 46 d6 08 0a d6 ef 40 03
  7f ee 00 0b 50 eb 59 80 0f 7d b2 ff 11 77 40 03
  39 e1 fe 0e fb 01 b7 9e ff 00 00 f0 01 bf 10 13
  60 08 7f 10 03 f0 1f 30 31 18 7f 18 83 ff f0 3f
  f0 1f f0 63 f0 3f f0 5f f0 5f f0 7f f0 9f ff f0
  9f f0 e1 90 bf 50 e7 f0 07 30 ff f0 02 f0 14 ff
  f0 26 f0 38 f0 4a f0 5c f0 6e f0 80 f0 92 f0 a4
  ff f0 b6 f0 c8 f0 ff 41 ef 50 03 02 00 71 e5 f1
  08 ff f1 1a f1 2c f1 3e f1 50 f1 62 f1 74 f1 86
  f1 98 f5 f1 aa f1 bc f1 ce 12 df 60 12 e3 60 f3
  07 ff f2 e7 f3 2b f3 07 f3 27 f3 27 f3 47 f3 67
  f3 67 ff f3 a9 f3 87 f3 cd f3 a7 f3 f1 f4 03 f3
  df f3 ff ff f3 ff f4 1f f4 3f f4 3f f4 81 f4 5f
  f4 a5 f4 7f ff f4 9f f4 9f f4 bf f3 e2 f3 f4 f4
  06 f4 18 f4 2a ff f4 3c f4 4e f4 60 f4 72 f4 84
  f4 96 f4 a8 f4 ba ff f4 cc f4 de f4 f0 f5 02 f5
  14 f5 26 f5 38 f5 4a ff f5 5c f5 6e f5 80 f5 92
  f5 a4 f5 b6 f5 c8 f4 07 ff f7 09 f6 e7 f7 2d f7
  07 f7 27 f7 27 f7 47 f7 87 ff f7 67 f7 ab f7 87
  f7 a7 f7 a7 f7 f3 f8 05 f7 df ff f7 ff f7 ff a8
  1f 26 4a f8 5f f8 47 f7 66 f7 78 ff f7 8a 75 c2
  f0 03 76 c6 f8 df f8 c7 f7 e6 f7 f8 ff f8 0a f0
  7f f0 8b f9 3e f9 47 f9 47 f9 67 f9 87 bf b1 67
  06 f9 c6 f9 d8 f9 ea 09 fc 1f df 1a 03 df 3f be
  10 01 7f 30 01 3f 2e 1f df 1a 23 1e ff 07 d1 77
  77 71 d1 0f 12 60 03 10 13 26 7f 77 1f 52 ee 7f
  00 07 40 03 f7 fb 2f 11 1e 23 4e ff 20 27 70 07
  71 20 37 40 1e d0 3e ff 0a 84 0d 0f ff 0d 17 77
  e7 e3 00 07 a0 03 90 9f ee ee 7e 0f e5 0c 9f ed
  0f 00 0f ed 0d 8c 7f 2f 1f 60 1f 7e 10 13 f6 00
  90 50 c3 c0 1f 10 40 7f 20 35 50 21 ee 6b ee d0
  6f 00 83 77 10 8b 7d 0f 03 2d 7f 3b ff 7f 1f d6
  60 03 0f de f7 90 df 10 83 8c 90 51 7f f7 7f a0
  1f 00 6f fe 7f f0 0e a2 60 91 c0 1f 1f df 88 88
  88 88 ff f1 7f 71 7f 00 1f f1 7f f1 7f f1 7f f1
  7f f1 7f d7 1e ff 00 80 8d 02 00 8d 01 7f 00 07
  a0 03 fe 90 9f f1 7f 31 7f 60 1f f1 7f a0 1f f1
  7f ee 57 ee d0 6f 7d 01 7f 7d f1 7f f1 7f f1 7f
  e0 f1 7f f1 7f e1 9f
`);

const FAIRY_POKEMON_TYPE_RETAGS = [
  [35, 0x09, 0x09], [36, 0x09, 0x09], [39, 0x00, 0x09], [40, 0x00, 0x09],
  [122, 0x0e, 0x09], [175, 0x09, 0x09], [176, 0x09, 0x02], [183, 0x0b, 0x09],
  [184, 0x0b, 0x09], [209, 0x09, 0x09], [210, 0x09, 0x09], [280, 0x0e, 0x09],
  [281, 0x0e, 0x09], [282, 0x0e, 0x09], [298, 0x00, 0x09], [303, 0x08, 0x09],
  [439, 0x0e, 0x09], [468, 0x09, 0x02],
];

const DEBUG_WILD_ENCOUNTER_SPECIES_OFFSETS = (() => {
  const offsets = [];
  for (let i = 0; i < 12; i += 1) offsets.push(8 + i * 8);
  for (let offset = 100; offset <= 136; offset += 4) offsets.push(offset);
  for (let offset = 164; offset <= 200; offset += 4) offsets.push(offset);
  for (let i = 0; i < 5; i += 1) offsets.push(212 + i * 8);
  for (let i = 0; i < 5; i += 1) offsets.push(300 + i * 8);
  for (let i = 0; i < 5; i += 1) offsets.push(344 + i * 8);
  for (let i = 0; i < 5; i += 1) offsets.push(388 + i * 8);
  return offsets;
})();

function closestHit(hits, preferredOffset, label) {
  if (!hits.length) {
    return null;
  }
  hits.sort((a, b) => Math.abs(a - preferredOffset) - Math.abs(b - preferredOffset));
  if (
    hits.length > 1 &&
    Math.abs(hits[0] - preferredOffset) === Math.abs(hits[1] - preferredOffset)
  ) {
    throw new PatchError(`${label} fallback scan found equally close candidates.`);
  }
  return hits[0];
}

function locatePatchSite(data, preferredOffset, expectedList, patched, radius, label, force) {
  if (bytesEqual(data, preferredOffset, patched)) {
    return { offset: preferredOffset, state: "already", usedFallback: false };
  }
  if (expectedList.some((expected) => bytesEqual(data, preferredOffset, expected))) {
    return { offset: preferredOffset, state: "patch", usedFallback: false };
  }

  const start = preferredOffset - radius;
  const end = preferredOffset + radius;
  const expectedHits = [];
  for (const expected of expectedList) {
    expectedHits.push(...findNeedle(data, expected, start, end));
  }
  const expectedHit = closestHit(Array.from(new Set(expectedHits)), preferredOffset, label);
  if (expectedHit != null) {
    return { offset: expectedHit, state: "patch", usedFallback: expectedHit !== preferredOffset };
  }

  const patchedHit = closestHit(findNeedle(data, patched, start, end), preferredOffset, label);
  if (patchedHit != null) {
    return { offset: patchedHit, state: "already", usedFallback: patchedHit !== preferredOffset };
  }

  if (!force) {
    const found = Array.from(data.slice(preferredOffset, preferredOffset + patched.length))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join(" ");
    throw new PatchError(
      `${label} sanity check failed at ${hex(preferredOffset)}. Found ${found}. Enable compatible modified bytes to patch anyway.`
    );
  }
  return { offset: preferredOffset, state: "patch", usedFallback: false };
}

function patchFairyCodeSite(rom, overlay, relativeOffset, expectedList, patched, label, force, log) {
  const preferred = overlay.start + relativeOffset;
  const located = locatePatchSite(rom, preferred, expectedList, patched, 0x30, label, force);
  if (located.state !== "already") {
    writeBytes(rom, located.offset, patched);
  }
  log.push(
    `${label}: ${located.state === "already" ? "already patched" : "wrote"} overlay 16+${hex(
      located.offset - overlay.start
    )}${located.usedFallback ? " (fallback scan)" : ""}.`
  );
}

function patchFairyType(rom, force, log) {
  const overlay16 = getOverlayRange(rom, OVERLAY_16);
  const tableAt = overlay16.start + 0x33b94;
  const cleanTablePrefix = bytesFromHex("00 05 05 00 08 05 0a 0a");
  const pkaizoTablePrefix = bytesFromHex("80 0d 81 0c 82 0f 83 01");
  if (bytesEqual(rom, tableAt, FAIRY_TET_PATCH)) {
    log.push(`Fairy type table: already patched at overlay 16+0x33B94.`);
  } else {
    const pkaizoCompatibleTable = bytesEqual(rom, tableAt, pkaizoTablePrefix);
    if (
      !bytesEqual(rom, tableAt, cleanTablePrefix) &&
      !pkaizoCompatibleTable &&
      !force
    ) {
      throw new PatchError(
        `Fairy type table sanity check failed at overlay 16+0x33B94. Enable compatible modified bytes to patch anyway.`
      );
    }
    writeBytes(rom, tableAt, FAIRY_TET_PATCH);
    log.push(
      `Fairy type table: wrote compressed table at overlay 16+0x33B94${
        pkaizoCompatibleTable ? " (pkaizo-compatible table area)" : ""
      }.`
    );
  }

  patchFairyCodeSite(
    rom,
    overlay16,
    0x1a01a,
    [
      bytesFromHex("01 90 92 78 28 1c 39 1c 06 f0 6b fa"),
      bytesFromHex("01 90 92 78 28 1c 39 1c 06 f0 75 fa"),
    ],
    FAIRY_READ1_PATCH,
    "Fairy type read hook 1",
    force,
    log
  );
  patchFairyCodeSite(
    rom,
    overlay16,
    0x1a074,
    [
      bytesFromHex("01 90 92 78 28 1c 39 1c 06 f0 3e fa"),
      bytesFromHex("01 90 92 78 28 1c 39 1c 06 f0 48 fa"),
    ],
    FAIRY_READ2_PATCH,
    "Fairy type read hook 2",
    force,
    log
  );
  patchFairyCodeSite(
    rom,
    overlay16,
    0x19fb6,
    [bytesFromHex("20 18")],
    FAIRY_LOOP1_PATCH,
    "Fairy type loop step 1",
    force,
    log
  );
  patchFairyCodeSite(
    rom,
    overlay16,
    0x1a084,
    [bytesFromHex("60 00 21 18")],
    FAIRY_LOOP2_PATCH,
    "Fairy type loop step 2",
    force,
    log
  );
  patchFairyCodeSite(
    rom,
    overlay16,
    0x1a766,
    [bytesFromHex("08 18")],
    FAIRY_LOOP3_PATCH,
    "Fairy type loop step 3",
    force,
    log
  );

  const helperAt = arm9Offset(rom, 0x020f9400, FAIRY_ARM9_HELPER.length);
  if (bytesEqual(rom, helperAt, FAIRY_ARM9_HELPER)) {
    log.push(`Fairy type ARM9 helper: already patched at ARM9 file ${hex(helperAt)} / RAM 0x20F9400.`);
  } else {
    const expectedFill = new Uint8Array(FAIRY_ARM9_HELPER.length);
    if (!bytesEqual(rom, helperAt, expectedFill) && !force) {
      throw new PatchError(
        `Fairy type ARM9 helper cave at ${hex(helperAt)} is occupied. Apply Fairy before experimental text speed on a fresh ROM.`
      );
    }
    writeBytes(rom, helperAt, FAIRY_ARM9_HELPER);
    log.push(`Fairy type ARM9 helper: wrote ${FAIRY_ARM9_HELPER.length} bytes at ARM9 file ${hex(helperAt)} / RAM 0x20F9400.`);
  }

  const overlay21 = getOverlayRange(rom, OVERLAY_21);
  const displayAt = overlay21.start + 0xe408;
  const displayExpected = bytesFromHex("c9 88 09 04 09 14 8f 44");
  if (bytesEqual(rom, displayAt, FAIRY_POKEDEX_DISPLAY_PATCH)) {
    log.push("Fairy Pokedex display: already patched at overlay 21+0xE408.");
  } else {
    if (!bytesEqual(rom, displayAt, displayExpected) && !force) {
      throw new PatchError("Fairy Pokedex display sanity check failed at overlay 21+0xE408.");
    }
    writeBytes(rom, displayAt, FAIRY_POKEDEX_DISPLAY_PATCH);
    log.push("Fairy Pokedex display: wrote type routing at overlay 21+0xE408.");
  }

  const file = findFileByPath(rom, "battle/graphic/pl_batt_obj.narc");
  const currentNarc = rom.slice(file.start, file.end);
  const patchedNarc = replaceNarcMembers(currentNarc, [
    [74, FAIRY_PL_BATT_OBJ_ENTRY_74],
    [236, FAIRY_PL_BATT_OBJ_ENTRY_236],
  ]);
  const assetState = replaceRomFile(rom, file, patchedNarc, "Fairy visual asset NARC");
  log.push(
    `Fairy visual assets: ${assetState === "already" ? "already patched" : "replaced"} battle/graphic/pl_batt_obj.narc file ${file.fileId}, members 74 and 236 (${file.size} -> ${patchedNarc.length} bytes).`
  );

  const zukanFile = findFileByPath(rom, "resource/eng/zukan/zukan.narc");
  const currentZukan = rom.slice(zukanFile.start, zukanFile.end);
  const patchedZukan = replaceNarcMembers(currentZukan, [
    [88, FAIRY_ZUKAN_ENTRY_88],
    [89, FAIRY_ZUKAN_ENTRY_89],
    [90, FAIRY_ZUKAN_ENTRY_90],
  ]);
  const zukanState = replaceRomFile(rom, zukanFile, patchedZukan, "Fairy Pokedex type icon NARC");
  log.push(
    `Fairy Pokedex type icons: ${zukanState === "already" ? "already patched" : "replaced"} resource/eng/zukan/zukan.narc file ${zukanFile.fileId}, members 88, 89 and 90 (${zukanFile.size} -> ${patchedZukan.length} bytes).`
  );
}

function patchFairyPokemonTypes(rom, force, log) {
  const file = findFileByPath(rom, "poketool/personal/pl_personal.narc");
  const narc = rom.slice(file.start, file.end);
  const parsed = parseNarc(narc);
  const changed = [];

  for (const [species, type1, type2] of FAIRY_POKEMON_TYPE_RETAGS) {
    const entry = parsed.entries[species];
    if (!entry) {
      throw new PatchError(`Fairy Pokemon type retag species ${species} is outside pl_personal.narc.`);
    }
    if (entry.end - entry.start < 8) {
      throw new PatchError(`Fairy Pokemon type retag species ${species} has an invalid personal entry.`);
    }
    const offset = file.start + parsed.dataBlock.dataOffset + entry.start + 6;
    if (rom[offset] !== type1 || rom[offset + 1] !== type2) {
      rom[offset] = type1;
      rom[offset + 1] = type2;
      changed.push(species);
    }
  }

  log.push(
    `Update Pokemon Types: ${
      changed.length ? `retagged ${changed.length} entries (${changed.join(", ")})` : "already patched"
    } in poketool/personal/pl_personal.narc file ${file.fileId}.`
  );
}

function patchDebugFairyBattleTest(rom, log) {
  const personalFile = findFileByPath(rom, "poketool/personal/pl_personal.narc");
  const personalNarc = rom.slice(personalFile.start, personalFile.end);
  const personal = parseNarc(personalNarc);
  let pokemonChanged = 0;
  let pokemonKeptFairy = 0;

  for (let species = 0; species < personal.entries.length; species += 1) {
    const entry = personal.entries[species];
    if (entry.end - entry.start < 8) {
      continue;
    }
    const offset = personalFile.start + personal.dataBlock.dataOffset + entry.start + 6;
    if (rom[offset] === 0x09 || rom[offset + 1] === 0x09) {
      pokemonKeptFairy += 1;
      continue;
    }
    if (rom[offset] !== 0x01 || rom[offset + 1] !== 0x01) {
      rom[offset] = 0x01;
      rom[offset + 1] = 0x01;
      pokemonChanged += 1;
    }
  }

  const moveFile = findFileByPath(rom, "poketool/waza/pl_waza_tbl.narc");
  const moveNarc = rom.slice(moveFile.start, moveFile.end);
  const moves = parseNarc(moveNarc);
  let movesChanged = 0;
  for (let move = 0; move < moves.entries.length; move += 1) {
    const entry = moves.entries[move];
    if (entry.end - entry.start < 5) {
      continue;
    }
    const offset = moveFile.start + moves.dataBlock.dataOffset + entry.start + 4;
    if (rom[offset] !== 0x09) {
      rom[offset] = 0x09;
      movesChanged += 1;
    }
  }

  log.push(
    `DEBUG Fairy battle test: changed ${pokemonChanged} non-Fairy Pokemon entries to mono Fighting, kept ${pokemonKeptFairy} Fairy entries, and changed ${movesChanged} moves to Fairy type.`
  );

  patchDebugWildEncountersToSpecies(rom, SPECIES_JIGGLYPUFF, "Jigglypuff", log);
}

function patchDebugWildEncountersToSpecies(rom, species, label, log) {
  const file = findFileByPath(rom, "fielddata/encountdata/pl_enc_data.narc");
  const narc = rom.slice(file.start, file.end);
  const parsed = parseNarc(narc);
  let changedSlots = 0;
  let touchedTables = 0;
  let skippedTables = 0;

  for (const entry of parsed.entries) {
    if (entry.end - entry.start < 424) {
      skippedTables += 1;
      continue;
    }

    let tableChanged = false;
    for (const relative of DEBUG_WILD_ENCOUNTER_SPECIES_OFFSETS) {
      const offset = file.start + parsed.dataBlock.dataOffset + entry.start + relative;
      if (readU32(rom, offset) === species) {
        continue;
      }
      writeU32(rom, offset, species);
      changedSlots += 1;
      tableChanged = true;
    }
    if (tableChanged) {
      touchedTables += 1;
    }
  }

  log.push(
    `DEBUG Fairy battle test encounters: ${
      changedSlots
        ? `changed ${changedSlots} species slot(s) across ${touchedTables} table(s) to ${label}`
        : `all encounter species slots already ${label}`
    } in fielddata/encountdata/pl_enc_data.narc file ${file.fileId}${
      skippedTables ? `; skipped ${skippedTables} short table(s)` : ""
    }.`
  );
}

  return {
    fairyType: patchFairyType,
    fairyPokemonTypes: patchFairyPokemonTypes,
    patchDebugFairyBattleTest,
  };
});
