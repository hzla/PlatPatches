(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory;
  } else {
    root.PlatinumPatcherSummaryScreenPatches = factory(root.PlatinumPatcherCore);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (core) {
  "use strict";

  if (!core) {
    throw new Error("Summary-screen patches require PlatinumPatcherCore to load first.");
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

  const HELPER_TEMPLATE = bytesFromHex(`
    f0 b5 81 b0 04 46 0d 46 1f 46 91 20 80 00 20 58
    29 1a 09 09 00 26 01 29 01 d1 01 26 0e e0 02 29
    01 d1 02 26 0a e0 03 29 01 d1 04 26 06 e0 04 29
    01 d1 05 26 02 e0 05 29 0b d1 03 26 a1 20 80 00
    01 38 20 5c 31 46 00 00 00 00 01 28 05 d0 00 28
    01 d4 06 4a 02 e0 06 4a 00 e0 06 4a 20 46 29 46
    3b 46 00 00 00 00 01 b0 f0 bd c0 46 00 02 01 00
    00 04 03 00 00 06 05 00
  `);

  const AFFINITY_BL_OFFSET = 0x46;
  const PRINT_BL_OFFSET = 0x62;
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

  function buildNatureStatColorPayload(payloadAddress) {
    const helperAddress = payloadAddress + MARKER.length;
    const helper = new Uint8Array(HELPER_TEMPLATE);
    helper.set(
      thumbBl(helperAddress + AFFINITY_BL_OFFSET, POKEMON_GET_STAT_AFFINITY_OF),
      AFFINITY_BL_OFFSET
    );
    helper.set(thumbBl(helperAddress + PRINT_BL_OFFSET, PRINT_STRING_TO_WINDOW), PRINT_BL_OFFSET);

    const bytes = new Uint8Array(MARKER.length + helper.length);
    bytes.set(MARKER);
    bytes.set(helper, MARKER.length);
    return { bytes, entryAddress: helperAddress };
  }

  function patchNatureStatColors(rom, force, log) {
    const allocator = new SyntheticOverlayAllocator(rom, log);
    const allocation = allocator.allocate({
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
