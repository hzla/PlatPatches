(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory;
    return;
  }
  root.PlatinumPatcherWildNaturePatches = factory(root.PlatinumPatcherCore);
})(typeof globalThis !== "undefined" ? globalThis : this, function (core) {
  "use strict";

  if (!core) {
    throw new Error("PlatinumPatcherCore failed to load for wild-natures patches.");
  }

  const {
    PatchError,
    OVERLAY_6,
    hex,
    bytesFromHex,
    bytesEqual,
    writeBytes,
    padBytes,
    overlayOffset,
    findNeedle,
    locateNearby,
  } = core;

  function thumbInst16(value) {
    return [value & 0xff, (value >>> 8) & 0xff];
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

  const NATURE_NAMES = [
    "Hardy",
    "Lonely",
    "Brave",
    "Adamant",
    "Naughty",
    "Bold",
    "Docile",
    "Relaxed",
    "Impish",
    "Lax",
    "Timid",
    "Hasty",
    "Serious",
    "Jolly",
    "Naive",
    "Modest",
    "Mild",
    "Quiet",
    "Bashful",
    "Rash",
    "Calm",
    "Gentle",
    "Sassy",
    "Careful",
    "Quirky",
  ];
  const DEFAULT_ALLOWED_NATURES = Array.from({ length: NATURE_NAMES.length }, (_, nature) => nature);

  function natureAllowedOption(options) {
    const source = Array.isArray(options && options.natureAllowed)
      ? options.natureAllowed
      : DEFAULT_ALLOWED_NATURES;
    const allowed = Array.from(
      new Set(
        source
          .map((nature) => Number(nature))
          .filter((nature) => Number.isFinite(nature))
          .map((nature) => Math.trunc(nature))
          .filter((nature) => nature >= 0 && nature < NATURE_NAMES.length)
      )
    ).sort((a, b) => a - b);
    if (!allowed.length) {
      throw new PatchError("Wild nature filter needs at least one allowed nature.");
    }
    return allowed;
  }

  const WILD_NATURE_LEGACY_PATCH = padBytes(
    bytesFromHex(`
      10 b5 db f5 ff fb 0f 21 08 40 0d 28 f9 d2 01 a1
      08 5c 10 bd 00 01 04 06 09 0b 0c 0e 10 12 13 15 18 00 00 00
    `),
    0x5c
  );

  const WILD_NATURE_ORIGINAL = bytesFromHex(`
    38 b5 04 1c 48 7b 00 28 17 d1 88 7b 1c 28 14 d1
    db f5 f8 fb 40 00 05 0c 02 2d 01 d3 e0 f5 38 ff
    00 2d 0a d1 00 21 20 1c 0a 1c 32 f6 af fc 19 21
    a0 f6 30 eb 08 06 00 0e 38 bd db f5 e3 fb 06 49
    a0 f6 22 ea 00 04 04 0c 19 2c 01 d3 e0 f5 20 ff
    20 06 00 0e 38 bd c0 46 3e 0a 00 00
  `);

  function buildWildNaturePatch(functionAddress, allowedNatures) {
    const allowed = natureAllowedOption({ natureAllowed: allowedNatures });
    const out = [];
    const lcrngNextAddress = 0x0201d2e8;
    const loopAddress = functionAddress + 2;

    function emit(bytes) {
      out.push(...bytes);
    }

    emit(bytesFromHex("00 b5"));
    emit(thumbBl(functionAddress + out.length, lcrngNextAddress));
    emit(bytesFromHex("1f 21 08 40"));
    emit([allowed.length, 0x28]);
    emit(thumbCondBranch(functionAddress + out.length, loopAddress, 0x2));
    emit(bytesFromHex("01 a1 08 5c 00 bd"));
    emit(allowed);

    return padBytes(new Uint8Array(out), WILD_NATURE_ORIGINAL.length);
  }

  function parseWildNaturePatchAt(data, offset) {
    if (offset < 0 || offset + WILD_NATURE_ORIGINAL.length > data.length) {
      return null;
    }
    if (
      data[offset] !== 0x00 ||
      data[offset + 1] !== 0xb5 ||
      data[offset + 6] !== 0x1f ||
      data[offset + 7] !== 0x21 ||
      data[offset + 8] !== 0x08 ||
      data[offset + 9] !== 0x40 ||
      data[offset + 11] !== 0x28 ||
      data[offset + 14] !== 0x01 ||
      data[offset + 15] !== 0xa1 ||
      data[offset + 16] !== 0x08 ||
      data[offset + 17] !== 0x5c ||
      data[offset + 18] !== 0x00 ||
      data[offset + 19] !== 0xbd
    ) {
      return null;
    }
    const count = data[offset + 10];
    if (count < 1 || count > 25 || offset + 20 + count > data.length) {
      return null;
    }
    const allowed = Array.from(data.slice(offset + 20, offset + 20 + count));
    if (new Set(allowed).size !== allowed.length || allowed.some((nature) => nature > 24)) {
      return null;
    }
    return allowed;
  }

  function findWildNaturePatch(data, start, end) {
    const hits = [];
    const cappedStart = Math.max(0, start);
    const cappedEnd = Math.min(data.length, end);
    for (let offset = cappedStart; offset <= cappedEnd - WILD_NATURE_ORIGINAL.length; offset += 2) {
      const allowed = parseWildNaturePatchAt(data, offset);
      if (allowed) {
        hits.push({ offset, allowed });
      }
    }
    return hits;
  }

  function patchWildNatures(rom, force, log, options = {}) {
    const allowed = natureAllowedOption(options);
    const allowedNames = allowed.map((nature) => NATURE_NAMES[nature]);
    const preferred = overlayOffset(rom, OVERLAY_6, 0x39a4, WILD_NATURE_ORIGINAL.length);
    const preferredPatch = buildWildNaturePatch(
      preferred.overlay.loadAddress + (preferred.offset - preferred.overlay.start),
      allowed
    );
    const located = locateNearby(
      rom,
      preferred.offset,
      WILD_NATURE_ORIGINAL,
      preferredPatch,
      0x200,
      "Wild nature filter"
    );
    let offset = located.offset;
    let usedFallback = located.usedFallback;
    if (
      offset === preferred.offset &&
      !bytesEqual(rom, offset, WILD_NATURE_ORIGINAL) &&
      !bytesEqual(rom, offset, preferredPatch) &&
      !bytesEqual(rom, offset, WILD_NATURE_LEGACY_PATCH) &&
      !parseWildNaturePatchAt(rom, offset)
    ) {
      const legacyHits = findNeedle(
        rom,
        WILD_NATURE_LEGACY_PATCH,
        preferred.offset - 0x200,
        preferred.offset + 0x200
      );
      const generatedHits = findWildNaturePatch(
        rom,
        preferred.offset - 0x200,
        preferred.offset + 0x200
      ).map((hit) => hit.offset);
      const hits = Array.from(new Set([...legacyHits, ...generatedHits]));
      if (hits.length === 1) {
        offset = hits[0];
        usedFallback = true;
      }
    }

    const actualPatch = buildWildNaturePatch(
      preferred.overlay.loadAddress + (offset - preferred.overlay.start),
      allowed
    );
    const existingAllowed = parseWildNaturePatchAt(rom, offset);
    const isLegacyPatch = bytesEqual(rom, offset, WILD_NATURE_LEGACY_PATCH);
    if (bytesEqual(rom, offset, actualPatch)) {
      log.push(
        `Wild nature filter: already patched for ${allowed.length} allowed nature(s): ${allowedNames.join(", ")}${
          usedFallback ? ` (fallback scan found overlay 6+${hex(offset - preferred.overlay.start)})` : ""
        }.`
      );
      return;
    }
    if (!bytesEqual(rom, offset, WILD_NATURE_ORIGINAL) && !isLegacyPatch && !existingAllowed && !force) {
      const found = Array.from(rom.slice(offset, offset + WILD_NATURE_ORIGINAL.length))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join(" ");
      throw new PatchError(
        `Wild nature filter sanity check failed at ${hex(offset)}. Found ${found}. Enable compatible modified bytes to patch anyway.`
      );
    }
    writeBytes(rom, offset, actualPatch);
    log.push(
      `Wild nature filter: ${
        isLegacyPatch
          ? "updated legacy patch"
          : existingAllowed
            ? `updated existing ${existingAllowed.length}-nature patch`
            : "replaced overlay 6 wild nature routine"
      } at +${hex(offset - preferred.overlay.start)} with ${allowed.length} allowed nature(s): ${allowedNames.join(
        ", "
      )}${usedFallback ? " (fallback scan)" : ""}.`
    );
  }


  return {
    wildNatures: patchWildNatures,
  };
});
