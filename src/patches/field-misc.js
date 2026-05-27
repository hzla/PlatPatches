(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory;
    return;
  }
  root.PlatinumPatcherFieldMiscPatches = factory(root.PlatinumPatcherCore);
})(typeof globalThis !== "undefined" ? globalThis : this, function (core) {
  "use strict";

  if (!core) {
    throw new Error("PlatinumPatcherCore failed to load for field-misc patches.");
  }

  const {
    PatchError,
    OVERLAY_5,
    OVERLAY_16,
    hex,
    bytesFromHex,
    bytesEqual,
    writeBytes,
    requireBytes,
    getOverlayRange,
    overlayOffset,
    findNeedle,
    locateNearby,
  } = core;

  const ACCURACY_TRAMPOLINE = bytesFromHex(`
    20 f0 b5 fd 00 20 08 b0 f8 bd c0 46 c0 46 c0 46 c0 46
  `);

  const ACCURACY_CAVE = bytesFromHex(`
    a0 42 07 dd 68 6e c0 07 04 d0 03 49 01 20 6a 58
    10 43 68 50 70 47 c0 46 6c 21 00 00
  `);



  const OVERWORLD_POISON_REL = 0x1ba4;
  const OVERWORLD_POISON_ORIGINAL = bytesFromHex(`
    28 1C 05 21 01 22 17 F0 F3 FE 28 1C 00 F0 30 F9
    01 28 01 D1 01 20 F8 BD
  `);
  const OVERWORLD_POISON_PATCHED = bytesFromHex(`
    28 1C 05 21 01 22 17 F0 F3 FE 05 E0 C0 46 C0 46
    C0 46 C0 46 C0 46 C0 46
  `);

  function patchNoOverworldPoison(rom, force, log) {
    const preferred = overlayOffset(rom, OVERLAY_5, OVERWORLD_POISON_REL, OVERWORLD_POISON_ORIGINAL.length);
    const located = locateNearby(
      rom,
      preferred.offset,
      OVERWORLD_POISON_ORIGINAL,
      OVERWORLD_POISON_PATCHED,
      0x100,
      "Remove overworld poison"
    );
    const state = requireBytes(
      rom,
      located.offset,
      OVERWORLD_POISON_ORIGINAL,
      OVERWORLD_POISON_PATCHED,
      force,
      "Remove overworld poison"
    );

    if (state === "already") {
      log.push("Remove overworld poison: already patched.");
      return;
    }

    writeBytes(rom, located.offset, OVERWORLD_POISON_PATCHED);
    log.push(
      `Remove overworld poison: disabled step-based poison damage at overlay 5+${hex(
        located.offset - preferred.overlay.start
      )}${located.usedFallback ? " (fallback scan)" : ""}.`
    );
  }



  function thumbBl(fromAddress, toAddress) {
    const offset = toAddress - (fromAddress + 4);
    if (offset % 2 !== 0 || offset < -0x400000 || offset > 0x3ffffe) {
      throw new PatchError(`Cannot encode Thumb BL from ${hex(fromAddress)} to ${hex(toAddress)}.`);
    }
    const first = 0xf000 | ((offset >> 12) & 0x7ff);
    const second = 0xf800 | ((offset >> 1) & 0x7ff);
    return [first & 0xff, first >> 8, second & 0xff, second >> 8];
  }

  function accuracyTrampoline(fromAddress, caveAddress) {
    const patch = new Uint8Array(ACCURACY_TRAMPOLINE);
    patch.set(thumbBl(fromAddress, caveAddress), 0);
    return patch;
  }

  function findFillRun(data, start, end, value, size, preferredOffset) {
    const runs = [];
    let i = start;
    while (i <= end - size) {
      if (data[i] !== value) {
        i += 1;
        continue;
      }
      let j = i + 1;
      while (j < end && data[j] === value) {
        j += 1;
      }
      if (j - i >= size) {
        runs.push(i);
      }
      i = j;
    }
    if (!runs.length) {
      return -1;
    }
    runs.sort((a, b) => Math.abs(a - preferredOffset) - Math.abs(b - preferredOffset));
    return runs[0];
  }

  function patchPlayerAccuracy(rom, force, log) {
    const overlay = getOverlayRange(rom, OVERLAY_16);
    const expectedRel = 0x140fa;
    const caveRel = 0x34c68;
    const trampExpected = bytesFromHex(`
      04 dd 0c 49 01 20 6a 58 10 43 68 50 00 20 08 b0 f8 bd
    `);
    const caveExpected = new Uint8Array(ACCURACY_CAVE.length).fill(0xff);
    const preferredCaveAt = overlayOffset(rom, OVERLAY_16, caveRel, ACCURACY_CAVE.length).offset;
    const caveHits = findNeedle(
      rom,
      ACCURACY_CAVE,
      Math.max(overlay.start, preferredCaveAt - 0x400),
      overlay.end
    );
    let caveAt = caveHits.length === 1 ? caveHits[0] : preferredCaveAt;
    if (caveHits.length !== 1 && !bytesEqual(rom, caveAt, caveExpected)) {
      const dynamicCave = findFillRun(
        rom,
        overlay.start,
        overlay.end,
        0xff,
        ACCURACY_CAVE.length,
        preferredCaveAt
      );
      if (dynamicCave !== -1) {
        caveAt = dynamicCave;
      }
    }
    const actualCaveRel = caveAt - overlay.start;
    const caveAddress = overlay.loadAddress + actualCaveRel;
    const searchStart = Math.max(overlay.start, overlay.start + expectedRel - 0x100);
    const searchEnd = Math.min(overlay.end, overlay.start + expectedRel + 0x100);
    const expectedHits = findNeedle(rom, trampExpected, searchStart, searchEnd);
    let trampAt = expectedHits.length === 1 ? expectedHits[0] : overlay.start + expectedRel;
    let trampRel = trampAt - overlay.start;
    let trampFallback = trampRel !== expectedRel;
    let trampoline = accuracyTrampoline(overlay.loadAddress + trampRel, caveAddress);

    if (expectedHits.length !== 1) {
      for (let rel = expectedRel - 0x100; rel <= expectedRel + 0x100; rel += 2) {
        if (rel < 0 || overlay.start + rel + ACCURACY_TRAMPOLINE.length > overlay.end) {
          continue;
        }
        const candidate = accuracyTrampoline(overlay.loadAddress + rel, caveAddress);
        if (bytesEqual(rom, overlay.start + rel, candidate)) {
          trampAt = overlay.start + rel;
          trampRel = rel;
          trampFallback = trampRel !== expectedRel;
          trampoline = candidate;
          break;
        }
      }
    }

    const trampState = requireBytes(
      rom,
      trampAt,
      trampExpected,
      trampoline,
      force,
      "Player accuracy trampoline"
    );
    const caveState = requireBytes(
      rom,
      caveAt,
      caveExpected,
      ACCURACY_CAVE,
      force,
      "Player accuracy code cave"
    );

    if (trampState === "already" && caveState === "already") {
      log.push("Player accuracy bypass: already patched.");
      return;
    }

    writeBytes(rom, caveAt, ACCURACY_CAVE);
    writeBytes(rom, trampAt, trampoline);
    log.push(
      `Player accuracy bypass: standard misses are skipped for player-side attackers at overlay 16+${hex(trampRel)}; helper at +${hex(actualCaveRel)}.`
        .replace(
          ".",
          `${trampFallback || actualCaveRel !== caveRel ? " (fallback scan)" : ""}.`
        )
    );
  }


  return {
    noOverworldPoison: patchNoOverworldPoison,
    playerAccuracy: patchPlayerAccuracy,
  };
});
