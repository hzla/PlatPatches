(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    const assembler = require("../asm/armips-assembler.js");
    const templates = require("../asm/templates.js");
    module.exports = (core) => factory(core, assembler, templates);
  } else {
    root.PlatinumPatcherSummaryScreenPatches = factory(
      root.PlatinumPatcherCore,
      root.PlatinumPatcherArmipsAssembler,
      root.PlatinumPatcherAsmTemplates
    );
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (core, assembler, asmTemplates) {
  "use strict";

  if (!core) {
    throw new Error("Summary-screen patches require PlatinumPatcherCore to load first.");
  }
  if (!assembler || !asmTemplates) {
    throw new Error("armips assembler failed to load for summary-screen patches.");
  }

  const {
    PatchError,
    SyntheticOverlayAllocator,
    arm9Offset,
    asciiBytes,
    bytesFromHex,
    bytesEqual,
    hex,
    requireBytes,
    writeBytes,
  } = core;

  const MARKER = asciiBytes("NATSTATCOLOR1\0\0\0");
  const PRINT_STAT_CALLS = [
    { ram: 0x02090a50, original: bytesFromHex("ff f7 42 fb") },
    { ram: 0x02090a74, original: bytesFromHex("ff f7 30 fb") },
    { ram: 0x02090a9a, original: bytesFromHex("ff f7 1d fb") },
    { ram: 0x02090abe, original: bytesFromHex("ff f7 0b fb") },
    { ram: 0x02090ae4, original: bytesFromHex("ff f7 f8 fa") },
  ];

  const POKEMON_GET_STAT_AFFINITY_OF = 0x02075c60;
  const PRINT_STRING_TO_WINDOW = 0x020900d8;

  function thumbBl(fromAddress, toAddress) {
    const offset = toAddress - (fromAddress + 4);
    if (offset % 2 !== 0 || offset < -0x400000 || offset > 0x3ffffe) {
      throw new PatchError(`Cannot encode Thumb BL from ${hex(fromAddress)} to ${hex(toAddress)}.`);
    }
    const first = 0xf000 | ((offset >> 12) & 0x7ff);
    const second = 0xf800 | ((offset >> 1) & 0x7ff);
    return [first & 0xff, first >> 8, second & 0xff, second >> 8];
  }

  async function buildNatureStatColorPayload(payloadAddress) {
    const helperAddress = payloadAddress + MARKER.length;
    let helper;
    try {
      helper = await assembler.assembleArmips({
        source: asmTemplates.natureStatColorsHelper({
          helperAddress,
          pokemonGetStatAffinityOfAddress: POKEMON_GET_STAT_AFFINITY_OF,
          printStringToWindowAddress: PRINT_STRING_TO_WINDOW,
        }),
      });
    } catch (error) {
      throw new PatchError(`Nature stat colors armips helper assembly failed: ${error.message}`);
    }

    const bytes = new Uint8Array(MARKER.length + helper.length);
    bytes.set(MARKER);
    bytes.set(helper, MARKER.length);
    return { bytes, entryAddress: helperAddress };
  }

  async function patchNatureStatColors(rom, force, log) {
    const allocator = new SyntheticOverlayAllocator(rom, log);
    const allocation = await allocator.allocateAsync({
      marker: "NATSTATCOLOR1",
      buildPayload: buildNatureStatColorPayload,
      label: "Nature stat colors",
      alignment: 0x10,
      updateExisting: true,
    });
    const helperAddress = allocation.built.entryAddress;
    const touched = [];
    let changed = false;

    for (const call of PRINT_STAT_CALLS) {
      const offset = arm9Offset(rom, call.ram, call.original.length);
      const patched = new Uint8Array(thumbBl(call.ram, helperAddress));
      const state = requireBytes(
        rom,
        offset,
        call.original,
        patched,
        force,
        "Nature stat colors print hook"
      );
      if (state !== "already") {
        writeBytes(rom, offset, patched);
        changed = true;
      }
      touched.push(hex(call.ram));
    }

    const helperExact = bytesEqual(
      allocator.member,
      allocation.markerOffset,
      allocation.payloadBytes
    );
    log.push(
      `Nature stat colors: ${changed || !helperExact ? "patched" : "already patched"} summary stat print hooks at ARM9 RAM ${touched.join(
        ", "
      )}; helper at synthetic-overlay RAM ${hex(helperAddress)}.`
    );
  }

  return {
    natureStatColors: patchNatureStatColors,
  };
});
