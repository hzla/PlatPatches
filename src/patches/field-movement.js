(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory;
    return;
  }
  root.PlatinumPatcherFieldMovementPatches = factory(root.PlatinumPatcherCore);
})(typeof globalThis !== "undefined" ? globalThis : this, function (core) {
  "use strict";

  if (!core) {
    throw new Error("PlatinumPatcherCore failed to load for field-movement patches.");
  }

  const {
    bytesFromHex,
    readU32,
    writeU32,
    writeBytes,
    requireBytes,
    arm9Offset,
    locateNearby,
  } = core;

  function patchMovementSpeed(rom, force, log) {
    const legacyPointerPatches = [
      [0x020ef53c, 0x02065abd, 0x02065b11, "walk north"],
      [0x020ef530, 0x02065ad5, 0x02065b25, "walk south"],
      [0x020ef524, 0x02065ae9, 0x02065b39, "walk west"],
      [0x020ef518, 0x02065afd, 0x02065b4d, "walk east"],
      [0x020ef50c, 0x02065b11, 0x02065b61, "fast walk north"],
      [0x020ef500, 0x02065b25, 0x02065b79, "fast walk south"],
      [0x020ef4f4, 0x02065b39, 0x02065b8d, "fast walk west"],
      [0x020ef4e8, 0x02065b4d, 0x02065ba1, "fast walk east"],
      [0x020ef4dc, 0x02065b61, 0x02065bb9, "bike high north"],
      [0x020ef4d0, 0x02065b79, 0x02065bcd, "bike high south"],
      [0x020ef4c4, 0x02065b8d, 0x02065be1, "bike high west"],
      [0x020ef4b8, 0x02065ba1, 0x02065bf5, "bike high east"],
      [0x020ef194, 0x02065c0d, 0x02065b61, "run north"],
      [0x020ef224, 0x02065c25, 0x02065b79, "run south"],
      [0x020ef440, 0x02065c39, 0x02065b8d, "run west"],
      [0x020ef470, 0x02065c4d, 0x02065ba1, "run east"],
    ];

    let revertedLegacy = 0;
    for (const [ramAddress, expected, replacement] of legacyPointerPatches) {
      const offset = arm9Offset(rom, ramAddress, 4);
      if (readU32(rom, offset) === replacement) {
        writeU32(rom, offset, expected);
        revertedLegacy += 1;
      }
    }

    const constantPatches = [
      [0x0205fe22, "0c 24", "10 24", "walk base action"],
      [0x0205fe3e, "58 24", "14 24", "run base action"],
      [0x0205ff92, "0c 27", "10 27", "Distortion World walk base action"],
      [0x0205ffb0, "58 27", "14 27", "Distortion World run base action"],
      [0x02060394, "4c 24", "50 24", "bike default action"],
      [0x020603a8, "10 24", "14 24", "bike low-gear action"],
      [0x020603ac, "50 24", "14 24", "bike mid-gear action"],
      [0x020603b0, "14 24", "54 24", "bike high-gear action"],
    ];

    let changed = 0;
    let fallbackCount = 0;
    for (const [ramAddress, expectedHex, replacementHex, label] of constantPatches) {
      const expected = bytesFromHex(expectedHex);
      const replacement = bytesFromHex(replacementHex);
      const preferredOffset = arm9Offset(rom, ramAddress, expected.length);
      const located = locateNearby(
        rom,
        preferredOffset,
        expected,
        replacement,
        0x30,
        `Faster movement ${label}`
      );
      const offset = located.offset;
      const state = requireBytes(
        rom,
        offset,
        expected,
        replacement,
        force,
        `Faster movement ${label}`
      );
      if (state === "already") {
        continue;
      }
      writeBytes(rom, offset, replacement);
      changed += 1;
      if (located.usedFallback) {
        fallbackCount += 1;
      }
    }

    const parts = [
      changed ? `updated ${changed} player movement constant(s)` : "already patched",
    ];
    if (revertedLegacy) {
      parts.push(`reverted ${revertedLegacy} legacy global movement pointer(s)`);
    }
    if (fallbackCount) {
      parts.push(`${fallbackCount} via fallback scan`);
    }
    log.push(`Faster movement: ${parts.join("; ")}.`);
  }


  return {
    movementSpeed: patchMovementSpeed,
  };
});
