(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory;
    return;
  }
  root.PlatinumPatcherWeatherPatches = factory(root.PlatinumPatcherCore);
})(typeof globalThis !== "undefined" ? globalThis : this, function (core) {
  "use strict";

  if (!core) {
    throw new Error("PlatinumPatcherCore failed to load for weather patches.");
  }

  const {
    PatchError,
    OVERLAY_16,
    hex,
    bytesFromHex,
    bytesEqual,
    writeBytes,
    requireBytes,
    getArm9Info,
    arm9Offset,
    getOverlayRange,
    findNeedle,
    locateNearby,
  } = core;

  function thumbBl(fromAddress, toAddress) {
    const offset = toAddress - (fromAddress + 4);
    if (offset % 2 !== 0 || offset < -0x400000 || offset > 0x3ffffe) {
      throw new PatchError(`Cannot encode Thumb BL from ${hex(fromAddress)} to ${hex(toAddress)}.`);
    }
    const first = 0xf000 | ((offset >> 12) & 0x7ff);
    const second = 0xf800 | ((offset >> 1) & 0x7ff);
    return [first & 0xff, first >> 8, second & 0xff, second >> 8];
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

  const MODERN_SNOW_HAIL_CHIP_REL = 0xa1ec;
  const MODERN_SNOW_HAIL_CHIP_ORIGINAL = bytesFromHex(`
    51 28 0e d0 43 49 08 1c 22 30 29 50 40 48 a9 19
    09 58 00 20 c0 43 48 43 10 21
  `);
  const MODERN_SNOW_HAIL_CHIP_PATCHED = bytesFromHex(`
    51 28 0e e0 43 49 08 1c 22 30 29 50 40 48 a9 19
    09 58 00 20 c0 43 48 43 10 21
  `);
  const MODERN_SNOW_DEFENSE_HOOK_REL = 0x1f9ee;
  const MODERN_SNOW_DEFENSE_SIGNATURES = [
    bytesFromHex(`
      07 98 00 28 12 d0 7a 20 00 90 01 98 09 9b 29 1c
      01 22 fa f7 34 fd 00 28 08 d0 1f 99 0f 20 48 43
    `),
    bytesFromHex(`
      07 98 00 28 12 d0 7a 20 00 90 01 98 09 9b 29 1c
      01 22 fa f7 3e fd 00 28 08 d0 1f 99 0f 20 48 43
    `),
  ];
  const MODERN_SNOW_HELPER_RAM = 0x020f32d0;
  const MODERN_SNOW_HELPER_SEARCH_START_RAM = 0x020f3278;
  const MODERN_SNOW_HELPER_SEARCH_END_RAM = 0x020f3800;
  const MODERN_SNOW_HELPER = bytesFromHex(`
    0e b5 2c 99 c0 22 11 42 0d d0 24 99 00 29 0a d1
    12 99 0f 29 02 d0 11 99 0f 29 04 d1 22 99 03 22
    51 43 49 08 22 91 0b 98 00 28 0e bd
  `);

  function modernSnowDefenseHook(fromAddress, helperAddress) {
    return new Uint8Array(thumbBl(fromAddress, helperAddress));
  }

  function modernSnowDefensePatchedBytes(originalBytes, fromAddress, helperAddress) {
    const patched = new Uint8Array(originalBytes);
    patched.set(modernSnowDefenseHook(fromAddress, helperAddress), 0);
    return patched;
  }

  function findModernSnowDefenseHook(rom, overlay, helperAddress) {
    const preferred = overlay.start + MODERN_SNOW_DEFENSE_HOOK_REL;
    const preferredAddress = overlay.loadAddress + MODERN_SNOW_DEFENSE_HOOK_REL;
    for (const originalBytes of MODERN_SNOW_DEFENSE_SIGNATURES) {
      const preferredPatched = modernSnowDefensePatchedBytes(originalBytes, preferredAddress, helperAddress);
      if (bytesEqual(rom, preferred, originalBytes) || bytesEqual(rom, preferred, preferredPatched)) {
        return {
          offset: preferred,
          usedFallback: false,
          hookBytes: modernSnowDefenseHook(preferredAddress, helperAddress),
          originalBytes,
          patchedBytes: preferredPatched,
        };
      }
    }

    const hits = [];
    const start = Math.max(overlay.start, preferred - 0x300);
    const end = Math.min(overlay.end, preferred + 0x300);
    const signatureLength = MODERN_SNOW_DEFENSE_SIGNATURES[0].length;
    for (let offset = start; offset <= end - signatureLength; offset += 2) {
      const address = overlay.loadAddress + (offset - overlay.start);
      for (const originalBytes of MODERN_SNOW_DEFENSE_SIGNATURES) {
        const patchedBytes = modernSnowDefensePatchedBytes(originalBytes, address, helperAddress);
        if (bytesEqual(rom, offset, originalBytes) || bytesEqual(rom, offset, patchedBytes)) {
          hits.push({
            offset,
            hookBytes: modernSnowDefenseHook(address, helperAddress),
            originalBytes,
            patchedBytes,
          });
          break;
        }
      }
    }

    if (hits.length === 1) {
      return { ...hits[0], usedFallback: true };
    }
    if (hits.length > 1) {
      throw new PatchError(
        `Modern snow Defense hook fallback scan found multiple candidates: ${hits
          .map((hit) => `overlay 16+${hex(hit.offset - overlay.start)}`)
          .join(", ")}.`
      );
    }

    return {
      offset: preferred,
      usedFallback: false,
      hookBytes: modernSnowDefenseHook(preferredAddress, helperAddress),
      originalBytes: MODERN_SNOW_DEFENSE_SIGNATURES[0],
      patchedBytes: modernSnowDefensePatchedBytes(
        MODERN_SNOW_DEFENSE_SIGNATURES[0],
        preferredAddress,
        helperAddress
      ),
    };
  }

  function patchModernSnow(rom, force, log) {
    const overlay = getOverlayRange(rom, OVERLAY_16);
    const hailLocated = locateNearby(
      rom,
      overlay.start + MODERN_SNOW_HAIL_CHIP_REL,
      MODERN_SNOW_HAIL_CHIP_ORIGINAL,
      MODERN_SNOW_HAIL_CHIP_PATCHED,
      0x200,
      "Modern snow hail chip branch"
    );
    const hailState = requireBytes(
      rom,
      hailLocated.offset,
      MODERN_SNOW_HAIL_CHIP_ORIGINAL,
      MODERN_SNOW_HAIL_CHIP_PATCHED,
      force,
      "Modern snow hail chip branch"
    );

    const arm9 = getArm9Info(rom);
    const preferredHelperAt = arm9Offset(rom, MODERN_SNOW_HELPER_RAM, MODERN_SNOW_HELPER.length);
    let helperAt = preferredHelperAt;
    let helperRamAddress = MODERN_SNOW_HELPER_RAM;
    let helperUsedFallback = false;
    if (
      !bytesEqual(rom, preferredHelperAt, MODERN_SNOW_HELPER) &&
      !bytesEqual(rom, preferredHelperAt, new Uint8Array(MODERN_SNOW_HELPER.length).fill(0x00))
    ) {
      const existingHits = findNeedle(
        rom,
        MODERN_SNOW_HELPER,
        arm9.fileOffset,
        arm9.fileOffset + arm9.size
      );
      if (existingHits.length === 1) {
        helperAt = existingHits[0];
        helperRamAddress = arm9.loadAddress + (helperAt - arm9.fileOffset);
        helperUsedFallback = helperAt !== preferredHelperAt;
      } else {
        const searchStart = arm9Offset(rom, MODERN_SNOW_HELPER_SEARCH_START_RAM);
        const searchEnd = arm9Offset(rom, MODERN_SNOW_HELPER_SEARCH_END_RAM);
        const dynamicCave = findFillRun(
          rom,
          searchStart,
          searchEnd,
          0x00,
          MODERN_SNOW_HELPER.length,
          preferredHelperAt
        );
        if (dynamicCave === -1) {
          throw new PatchError("Modern snow could not find a free ARM9 helper cave.");
        }
        helperAt = dynamicCave;
        helperRamAddress = arm9.loadAddress + (helperAt - arm9.fileOffset);
        helperUsedFallback = true;
      }
    }
    const helperExpected = new Uint8Array(MODERN_SNOW_HELPER.length).fill(0x00);
    const helperState = requireBytes(
      rom,
      helperAt,
      helperExpected,
      MODERN_SNOW_HELPER,
      force,
      "Modern snow Defense helper"
    );

    const hookLocated = findModernSnowDefenseHook(rom, overlay, helperRamAddress);
    const hookState = requireBytes(
      rom,
      hookLocated.offset,
      hookLocated.originalBytes,
      hookLocated.patchedBytes,
      force,
      "Modern snow Defense hook"
    );

    if (hailState !== "already") {
      writeBytes(rom, hailLocated.offset, MODERN_SNOW_HAIL_CHIP_PATCHED);
    }
    if (helperState !== "already") {
      writeBytes(rom, helperAt, MODERN_SNOW_HELPER);
    }
    if (hookState !== "already") {
      writeBytes(rom, hookLocated.offset, hookLocated.hookBytes);
    }

    if (hailState === "already" && helperState === "already" && hookState === "already") {
      log.push("Modern snow: already patched.");
      return;
    }

    const notes = [];
    if (hailLocated.usedFallback) {
      notes.push("hail branch fallback scan");
    }
    if (hookLocated.usedFallback) {
      notes.push("Defense hook fallback scan");
    }
    if (helperUsedFallback) {
      notes.push("helper cave fallback scan");
    }
    log.push(
      `Modern snow: removed Hail chip damage at overlay 16+${hex(
        hailLocated.offset - overlay.start
      )}; Ice-type physical Defense boost hook at overlay 16+${hex(
        hookLocated.offset - overlay.start
      )}; helper at ARM9 RAM ${hex(helperRamAddress)}${
        notes.length ? ` (${notes.join(", ")})` : ""
      }.`
    );
  }




  return {
    modernSnow: patchModernSnow,
  };
});
