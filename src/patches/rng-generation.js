(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory;
    return;
  }
  root.PlatinumPatcherRngPatches = factory(root.PlatinumPatcherCore);
})(typeof globalThis !== "undefined" ? globalThis : this, function (core) {
  "use strict";

  if (!core) {
    throw new Error("PlatinumPatcherCore failed to load for RNG patches.");
  }

  const {
    PatchError,
    NOP,
    hex,
    bytesFromHex,
    bytesEqual,
    readU32,
    writeU32,
    writeBytes,
    padBytes,
    getArm9Info,
    arm9Offset,
    findNeedle,
    locateNearby,
  } = core;

  const IV_ORIGINAL = bytesFromHex(`
    a9 f7 ce f9 1f 21 02 90 08 40 01 90 28 1c 46 21
    01 aa 00 f0 81 fe 3e 20 02 99 00 01 08 40 40 09
    01 90 28 1c 47 21 01 aa 00 f0 76 fe 1f 20 02 99
    80 02 08 40 80 0a 01 90 28 1c 48 21 01 aa 00 f0
    6b fe a9 f7 ad f9 1f 21 02 90 08 40 01 90 28 1c
    49 21 01 aa 00 f0 60 fe 3e 20 02 99 00 01 08 40
    40 09 01 90 28 1c 4a 21 01 aa 00 f0 55 fe 1f 20
    02 99 80 02 08 40 80 0a 01 90 28 1c 4b 21 01 aa
    00 f0 4a fe
  `);

  const IV_BAD_PATCH = bytesFromHex(`
    00 b5 a9 f7 cd f9 1f 21 08 40 0f 28 f9 d3 00 bd
    ff f7 f6 ff 01 90 28 1c 46 21 01 aa 00 f0 7c fe
    ff f7 ee ff 01 90 28 1c 47 21 01 aa 00 f0 74 fe
    ff f7 e6 ff 01 90 28 1c 48 21 01 aa 00 f0 6c fe
    ff f7 de ff 01 90 28 1c 49 21 01 aa 00 f0 64 fe
    ff f7 d6 ff 01 90 28 1c 4a 21 01 aa 00 f0 5c fe
    ff f7 ce ff 01 90 28 1c 4b 21 01 aa 00 f0 54 fe
    08 e0 00 bf 00 bf 00 bf 00 bf 00 bf 00 bf 00 bf 00 bf 00 bf
  `);

  function thumbInst16(value) {
    return [value & 0xff, (value >>> 8) & 0xff];
  }

  function thumbB(fromAddress, toAddress) {
    const offset = toAddress - (fromAddress + 4);
    if (offset % 2 !== 0 || offset < -2048 || offset > 2046) {
      throw new PatchError(`Cannot encode Thumb B from ${hex(fromAddress)} to ${hex(toAddress)}.`);
    }
    const imm11 = (offset >> 1) & 0x7ff;
    return thumbInst16(0xe000 | imm11);
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

  function thumbCondBranch(fromAddress, toAddress, condition) {
    const offset = toAddress - (fromAddress + 4);
    if (offset % 2 !== 0 || offset < -256 || offset > 254) {
      throw new PatchError(`Cannot encode Thumb conditional branch from ${hex(fromAddress)} to ${hex(toAddress)}.`);
    }
    return thumbInst16(0xd000 | (condition << 8) | ((offset >> 1) & 0xff));
  }

  function buildIvPatch(patchRamAddress, minIv = 15, maxIv = 31) {
    const size = IV_ORIGINAL.length;
    const helperOffset = 0x68;
    const afterPatchAddress = patchRamAddress + size;
    const helperAddress = patchRamAddress + helperOffset;
    const setValueAddress = 0x02074c60;
    const lcrngNextAddress = 0x0201d2e8;
    const out = [];

    function emit(bytes) {
      out.push(...bytes);
    }

    for (let field = 0x46; field <= 0x4b; field += 1) {
      const callAddress = patchRamAddress + out.length;
      emit(thumbBl(callAddress, helperAddress));
      emit(bytesFromHex("01 90 28 1c"));
      emit([0x00 | field, 0x21]);
      emit(bytesFromHex("01 aa"));
      emit(thumbBl(patchRamAddress + out.length, setValueAddress));
    }

    emit(thumbB(patchRamAddress + out.length, afterPatchAddress));
    while (out.length < helperOffset) {
      emit(NOP);
    }

    emit(bytesFromHex("00 b5"));
    const randomizeAddress = patchRamAddress + out.length;
    emit(thumbBl(patchRamAddress + out.length, lcrngNextAddress));
    emit(bytesFromHex("1f 21 08 40"));
    emit([maxIv, 0x28]);
    emit(thumbCondBranch(patchRamAddress + out.length, randomizeAddress, 0x8));
    emit([minIv, 0x28]);
    emit(thumbCondBranch(patchRamAddress + out.length, randomizeAddress, 0x3));
    emit(bytesFromHex("00 bd"));

    return padBytes(new Uint8Array(out), size);
  }

  function existingIvPatchRangeAt(rom, offset, patchRamAddress) {
    for (let minIv = 0; minIv <= 31; minIv += 1) {
      for (let maxIv = minIv; maxIv <= 31; maxIv += 1) {
        if (bytesEqual(rom, offset, buildIvPatch(patchRamAddress, minIv, maxIv))) {
          return { minIv, maxIv };
        }
      }
    }
    return null;
  }

  function buildLegacyIv15To31Patch(patchRamAddress) {
    const size = IV_ORIGINAL.length;
    const helperOffset = 0x68;
    const afterPatchAddress = patchRamAddress + size;
    const helperAddress = patchRamAddress + helperOffset;
    const setValueAddress = 0x02074c60;
    const lcrngNextAddress = 0x0201d2e8;
    const out = [];

    function emit(bytes) {
      out.push(...bytes);
    }

    for (let field = 0x46; field <= 0x4b; field += 1) {
      const callAddress = patchRamAddress + out.length;
      emit(thumbBl(callAddress, helperAddress));
      emit(bytesFromHex("01 90 28 1c"));
      emit([0x00 | field, 0x21]);
      emit(bytesFromHex("01 aa"));
      emit(thumbBl(patchRamAddress + out.length, setValueAddress));
    }

    emit(thumbB(patchRamAddress + out.length, afterPatchAddress));
    while (out.length < helperOffset) {
      emit(NOP);
    }

    emit(bytesFromHex("00 b5"));
    emit(thumbBl(patchRamAddress + out.length, lcrngNextAddress));
    emit(bytesFromHex("1f 21 08 40 0f 28 f9 d3 00 bd"));

    return padBytes(new Uint8Array(out), size);
  }

  function matchesShinyCompareSignature(data, start) {
    const tail = bytesFromHex("28 01 d2 01 20 00 e0 00 20");
    if (start < 0 || start + 18 > data.length) {
      return false;
    }
    const prefix = bytesFromHex("58 40 12 0c 48 40 50 40");
    for (let i = 0; i < prefix.length; i += 1) {
      if (data[start + i] !== prefix[i]) {
        return false;
      }
    }
    for (let i = 0; i < tail.length; i += 1) {
      if (data[start + 9 + i] !== tail[i]) {
        return false;
      }
    }
    return true;
  }

  function findShinyCompareSignature(data, start, end) {
    const hits = [];
    const cappedStart = Math.max(0, start);
    const cappedEnd = Math.min(data.length, end);
    for (let offset = cappedStart; offset <= cappedEnd - 18; offset += 1) {
      if (matchesShinyCompareSignature(data, offset)) {
        hits.push(offset);
      }
    }
    return hits;
  }

  function buildAdvancedShinyOddsPatch(threshold) {
    const patch = bytesFromHex(`
      02 0c 50 40 0a 0c 51 40 48 40 00 04 00 0c 03 4a
      90 42 01 d3 00 20 70 47 01 20 70 47 00 00 00 00
      c0 46 c0 46 c0 46 c0 46 c0 46 c0 46
    `);
    writeU32(patch, 0x1c, threshold);
    return patch;
  }

  function matchesAdvancedShinyOddsPatch(data, offset) {
    const prefix = bytesFromHex(`
      02 0c 50 40 0a 0c 51 40 48 40 00 04 00 0c 03 4a
      90 42 01 d3 00 20 70 47 01 20 70 47
    `);
    const suffix = bytesFromHex("c0 46 c0 46 c0 46 c0 46 c0 46 c0 46");
    if (offset < 0 || offset + 0x2c > data.length) {
      return false;
    }
    if (!bytesEqual(data, offset, prefix)) {
      return false;
    }
    return bytesEqual(data, offset + 0x20, suffix);
  }

  function findAdvancedShinyOddsPatch(data, start, end) {
    const hits = [];
    const cappedStart = Math.max(0, start);
    const cappedEnd = Math.min(data.length, end);
    for (let offset = cappedStart; offset <= cappedEnd - 0x2c; offset += 2) {
      if (matchesAdvancedShinyOddsPatch(data, offset)) {
        hits.push(offset);
      }
    }
    return hits;
  }

  function patchShinyOdds(rom, force, log, options = {}) {
    const threshold = shinyThresholdOption(options);
    const advancedPatch = buildAdvancedShinyOddsPatch(threshold);
    const functionRamAddress = 0x02075e38;
    const preferredFunctionOffset = arm9Offset(rom, functionRamAddress, advancedPatch.length);
    const preferredRamAddress = 0x02075e50;
    const preferredOffset = arm9Offset(rom, preferredRamAddress, 2);
    const preferredSignatureOffset = preferredOffset - 8;
    const arm9 = getArm9Info(rom);
    let compareOffset = preferredOffset;
    let usedFallback = false;

    if (!matchesAdvancedShinyOddsPatch(rom, preferredFunctionOffset)) {
      const advancedHits = findAdvancedShinyOddsPatch(
        rom,
        Math.max(arm9.fileOffset, preferredFunctionOffset - 0x200),
        Math.min(arm9.fileOffset + arm9.size, preferredFunctionOffset + 0x200)
      );
      if (advancedHits.length === 1) {
        const advancedOffset = advancedHits[0];
        const currentThreshold = readU32(rom, advancedOffset + 0x1c);
        const actualRamAddress = arm9.loadAddress + (advancedOffset - arm9.fileOffset);
        if (currentThreshold === threshold) {
        log.push(
          `Shiny odds: already patched at ARM9 ${hex(advancedOffset)} / RAM ${hex(
            actualRamAddress
          )} with advanced threshold ${threshold}/65536 (${shinyOddsLabel(threshold)})${
            advancedOffset !== preferredFunctionOffset ? " (fallback scan)" : ""
          }.`
        );
          logShinyAlwaysWarning(threshold, log);
          return;
        }
        if (!force) {
          throw new PatchError(
            `Shiny odds already has advanced threshold ${currentThreshold} at ${hex(
              advancedOffset
            )}. Enable compatible modified bytes to replace it.`
          );
        }
        writeBytes(rom, advancedOffset, advancedPatch);
        log.push(
          `Shiny odds: wrote advanced threshold ${threshold}/65536 (${shinyOddsLabel(
            threshold
          )}) at ARM9 ${hex(advancedOffset)} / RAM ${hex(actualRamAddress)}${
            advancedOffset !== preferredFunctionOffset ? " (fallback scan)" : ""
          }.`
        );
        logShinyAlwaysWarning(threshold, log);
        return;
      }
      if (advancedHits.length > 1) {
        throw new PatchError(
          `Shiny odds fallback scan found multiple advanced candidates: ${advancedHits
            .map(hex)
            .join(", ")}.`
        );
      }
    } else {
      const currentThreshold = readU32(rom, preferredFunctionOffset + 0x1c);
      if (currentThreshold === threshold) {
        log.push(
          `Shiny odds: already patched at ARM9 ${hex(preferredFunctionOffset)} / RAM ${hex(
            functionRamAddress
          )} with advanced threshold ${threshold}/65536 (${shinyOddsLabel(threshold)}).`
        );
        logShinyAlwaysWarning(threshold, log);
        return;
      }
      if (!force) {
        throw new PatchError(
          `Shiny odds already has advanced threshold ${currentThreshold} at ${hex(
            preferredFunctionOffset
          )}. Enable compatible modified bytes to replace it.`
        );
      }
      writeBytes(rom, preferredFunctionOffset, advancedPatch);
      log.push(
        `Shiny odds: wrote advanced threshold ${threshold}/65536 (${shinyOddsLabel(
          threshold
        )}) at ARM9 ${hex(preferredFunctionOffset)} / RAM ${hex(functionRamAddress)}.`
      );
      logShinyAlwaysWarning(threshold, log);
      return;
    }

    if (!matchesShinyCompareSignature(rom, preferredSignatureOffset)) {
      const hits = findShinyCompareSignature(
        rom,
        Math.max(arm9.fileOffset, preferredSignatureOffset - 0x200),
        Math.min(arm9.fileOffset + arm9.size, preferredSignatureOffset + 0x200)
      );
      if (hits.length === 1) {
        compareOffset = hits[0] + 8;
        usedFallback = true;
      } else if (hits.length > 1) {
        throw new PatchError(
          `Shiny odds fallback scan found multiple candidates: ${hits
            .map((offset) => hex(offset + 8))
            .join(", ")}.`
        );
      } else {
        throw new PatchError("Could not locate the shiny odds compare in ARM9.");
      }
    }

    if (rom[compareOffset + 1] !== 0x28) {
      const found = Array.from(rom.slice(compareOffset, compareOffset + 2))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join(" ");
      throw new PatchError(`Shiny odds sanity check failed at ${hex(compareOffset)}. Found ${found}.`);
    }

    const currentThreshold = rom[compareOffset];
    const currentIsVanilla = currentThreshold === 8;
    const currentIsDesired = currentThreshold === threshold;
    const actualRamAddress = arm9.loadAddress + (compareOffset - arm9.fileOffset);

    if (threshold > 255) {
      const functionOffset = compareOffset - 0x18;
      const functionAddress = arm9.loadAddress + (functionOffset - arm9.fileOffset);
      if (!currentIsVanilla && !force) {
        throw new PatchError(
          `Shiny odds already has threshold ${currentThreshold} at ${hex(
            compareOffset
          )}. Enable compatible modified bytes to replace it with the advanced patch.`
        );
      }
      writeBytes(rom, functionOffset, advancedPatch);
      log.push(
        `Shiny odds: wrote advanced threshold ${threshold}/65536 (${shinyOddsLabel(
          threshold
        )}) at ARM9 ${hex(functionOffset)} / RAM ${hex(functionAddress)}${
          usedFallback ? " (fallback scan)" : ""
        }.`
      );
      logShinyAlwaysWarning(threshold, log);
      return;
    }

    if (!currentIsVanilla && !currentIsDesired && !force) {
      throw new PatchError(
        `Shiny odds already has threshold ${currentThreshold} at ${hex(
          compareOffset
        )}. Enable compatible modified bytes to replace it.`
      );
    }

    if (currentIsDesired) {
      log.push(
        `Shiny odds: already patched at ARM9 ${hex(compareOffset)} / RAM ${hex(
          actualRamAddress
        )} with threshold ${threshold}/65536 (${shinyOddsLabel(threshold)})${
          usedFallback ? " (fallback scan)" : ""
        }.`
      );
      logShinyAlwaysWarning(threshold, log);
      return;
    }

    rom[compareOffset] = threshold;
    log.push(
      `Shiny odds: wrote threshold ${threshold}/65536 (${shinyOddsLabel(
        threshold
      )}) at ARM9 ${hex(compareOffset)} / RAM ${hex(actualRamAddress)}${
        usedFallback ? " (fallback scan)" : ""
      }.`
    );
    logShinyAlwaysWarning(threshold, log);
  }

  function ivRangeOption(options) {
    const minValue = Number(options && options.ivMin);
    const maxValue = Number(options && options.ivMax);
    let minIv = Number.isFinite(minValue) ? Math.trunc(minValue) : 15;
    let maxIv = Number.isFinite(maxValue) ? Math.trunc(maxValue) : 31;
    minIv = Math.max(0, Math.min(31, minIv));
    maxIv = Math.max(0, Math.min(31, maxIv));
    if (minIv > maxIv) {
      [minIv, maxIv] = [maxIv, minIv];
    }
    return { minIv, maxIv };
  }

  function shinyThresholdOption(options) {
    if (options && options.shinyOddsPercent !== undefined) {
      return shinyThresholdFromPercent(options.shinyOddsPercent);
    }
    const value = Number(options && options.shinyThreshold);
    if (!Number.isFinite(value)) {
      return 8;
    }
    return Math.max(0, Math.min(65536, Math.trunc(value)));
  }

  function shinyOddsPercentOption(options) {
    const value = Number(options && options.shinyOddsPercent);
    if (!Number.isFinite(value)) {
      return 0;
    }
    return Math.max(0, Math.min(100, Math.trunc(value)));
  }

  function shinyThresholdFromPercent(percent) {
    const safePercent = shinyOddsPercentOption({ shinyOddsPercent: percent });
    return Math.round((safePercent * 65536) / 100);
  }

  function shinyOddsLabel(threshold) {
    if (threshold <= 0) {
      return "never shiny";
    }
    if (65536 % threshold === 0) {
      return `1/${65536 / threshold}`;
    }
    return `about 1/${Math.round(65536 / threshold)}`;
  }

  function logShinyAlwaysWarning(threshold, log) {
    if (threshold >= 65536) {
      log.push(
        "Shiny odds warning: 100% shiny odds can stall event/gift routines that explicitly reroll until a Pokemon is not shiny."
      );
    }
  }

  function patchIv15To31(rom, force, log, options = {}) {
    const range = ivRangeOption(options);
    const label = `Random IV range ${range.minIv}-${range.maxIv}`;
    const patchRamAddress = 0x02073f48;
    const ivPatch = buildIvPatch(patchRamAddress, range.minIv, range.maxIv);
    const legacyIvPatch = buildLegacyIv15To31Patch(patchRamAddress);
    const preferredAt = arm9Offset(rom, patchRamAddress, ivPatch.length);
    let located = locateNearby(rom, preferredAt, IV_ORIGINAL, ivPatch, 0x200, label);
    if (
      located.offset === preferredAt &&
      !bytesEqual(rom, preferredAt, IV_ORIGINAL) &&
      !bytesEqual(rom, preferredAt, ivPatch) &&
      !bytesEqual(rom, preferredAt, legacyIvPatch) &&
      !bytesEqual(rom, preferredAt, IV_BAD_PATCH)
    ) {
      const badHits = findNeedle(rom, IV_BAD_PATCH, preferredAt - 0x200, preferredAt + 0x200);
      if (badHits.length === 1) {
        located = { offset: badHits[0], usedFallback: true };
      }
    }
    const patchAt = located.offset;
    const arm9 = getArm9Info(rom);
    const actualPatchRamAddress = arm9.loadAddress + (patchAt - arm9.fileOffset);
    const actualIvPatch = buildIvPatch(actualPatchRamAddress, range.minIv, range.maxIv);
    const actualLegacyIvPatch = buildLegacyIv15To31Patch(actualPatchRamAddress);
    const existingRange = existingIvPatchRangeAt(rom, patchAt, actualPatchRamAddress);
    if (bytesEqual(rom, patchAt, actualIvPatch)) {
      log.push(
        `${label}: already patched${
          located.usedFallback ? ` (fallback scan found ${hex(patchAt)})` : ""
        }.`
      );
      return;
    }
    if (
      !bytesEqual(rom, patchAt, IV_ORIGINAL) &&
      !bytesEqual(rom, patchAt, IV_BAD_PATCH) &&
      !bytesEqual(rom, patchAt, actualLegacyIvPatch) &&
      !existingRange &&
      !force
    ) {
      const found = Array.from(rom.slice(patchAt, patchAt + actualIvPatch.length))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join(" ");
      throw new PatchError(
        `${label} sanity check failed at ${hex(patchAt)}. Found ${found}. Enable compatible modified bytes to patch anyway.`
      );
    }
    const repairedBrokenPatch = bytesEqual(rom, patchAt, IV_BAD_PATCH);
    const replacedLegacyPatch = bytesEqual(rom, patchAt, actualLegacyIvPatch);
    writeBytes(rom, patchAt, actualIvPatch);
    const action = repairedBrokenPatch
      ? "repaired old broken patch and wrote"
      : replacedLegacyPatch
        ? "updated legacy 15-31 patch with"
        : existingRange
          ? `updated existing ${existingRange.minIv}-${existingRange.maxIv} patch with`
          : "wrote";
    log.push(
      `${label}: ${action} ${actualIvPatch.length} bytes at ARM9 ${hex(patchAt)}${
        located.usedFallback ? " (fallback scan)" : ""
      }.`
    );
  }


  return {
    shinyOdds: patchShinyOdds,
    iv15_31: patchIv15To31,
  };
});
