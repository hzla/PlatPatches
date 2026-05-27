(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory;
    return;
  }
  root.PlatinumPatcherCriticalPatches = factory(root.PlatinumPatcherCore);
})(typeof globalThis !== "undefined" ? globalThis : this, function (core) {
  "use strict";

  if (!core) {
    throw new Error("PlatinumPatcherCore failed to load for critical patches.");
  }

  const {
    PatchError,
    OVERLAY_16,
    hex,
    bytesFromHex,
    bytesEqual,
    writeBytes,
    padBytes,
    getOverlayRange,
    findNeedle,
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

  function decodeThumbBl(fromAddress, bytes, offset) {
    if (offset < 0 || offset + 4 > bytes.length) {
      return null;
    }
    const first = bytes[offset] | (bytes[offset + 1] << 8);
    const second = bytes[offset + 2] | (bytes[offset + 3] << 8);
    if ((first & 0xf800) !== 0xf000 || (second & 0xf800) !== 0xf800) {
      return null;
    }
    let immediate = ((first & 0x7ff) << 12) | ((second & 0x7ff) << 1);
    if (immediate & 0x400000) {
      immediate |= 0xff800000;
    }
    return (fromAddress + 4 + immediate) >>> 0;
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

  function critBaseDivisorOption(options) {
    const value = Number(options && options.critBaseDivisor);
    if (!Number.isFinite(value)) {
      return 24;
    }
    return Math.max(1, Math.min(255, Math.trunc(value)));
  }

  function critOddsLabel(divisor) {
    return `1/${critBaseDivisorOption({ critBaseDivisor: divisor })} base`;
  }

  const CRIT_RATE_TABLE_REL = 0x33a60;
  const CRIT_RATE_TABLE_TAIL = bytesFromHex("08 04 03 02");

  function matchesCritRateTable(data, offset) {
    if (offset < 0 || offset + 5 > data.length) {
      return false;
    }
    return data[offset] >= 1 && bytesEqual(data, offset + 1, CRIT_RATE_TABLE_TAIL);
  }

  function findCritRateTable(rom, overlay, preferredRel = CRIT_RATE_TABLE_REL) {
    const preferred = overlay.start + preferredRel;
    if (matchesCritRateTable(rom, preferred)) {
      return { offset: preferred, usedFallback: false };
    }

    const hits = [];
    const start = Math.max(overlay.start, preferred - 0x100);
    const end = Math.min(overlay.end, preferred + 0x100);
    for (let offset = start; offset <= end - 5; offset += 1) {
      if (matchesCritRateTable(rom, offset)) {
        hits.push(offset);
      }
    }
    if (hits.length === 1) {
      return { offset: hits[0], usedFallback: true };
    }
    if (hits.length > 1) {
      throw new PatchError(
        `Critical-hit rate table fallback scan found multiple candidates: ${hits
          .map((offset) => `overlay 16+${hex(offset - overlay.start)}`)
          .join(", ")}.`
      );
    }
    throw new PatchError("Could not locate the critical-hit rate table in overlay 16.");
  }

  function patchCritOdds(rom, force, log, options = {}) {
    const divisor = critBaseDivisorOption(options);
    const overlay = getOverlayRange(rom, OVERLAY_16);
    const table = findCritRateTable(rom, overlay);
    const currentDivisor = rom[table.offset];
    const rel = table.offset - overlay.start;
    const ramAddress = overlay.loadAddress + rel;

    if (currentDivisor !== 16 && currentDivisor !== divisor && !force) {
      throw new PatchError(
        `Critical hit odds already has base divisor ${currentDivisor} at overlay 16+${hex(
          rel
        )}. Enable compatible modified bytes to replace it.`
      );
    }
    if (currentDivisor === divisor) {
      log.push(
        `Critical hit odds: already ${critOddsLabel(divisor)} at overlay 16+${hex(
          rel
        )} / RAM ${hex(ramAddress)}${table.usedFallback ? " (fallback scan)" : ""}.`
      );
      return;
    }

    rom[table.offset] = divisor;
    log.push(
      `Critical hit odds: wrote ${critOddsLabel(divisor)} at overlay 16+${hex(
        rel
      )} / RAM ${hex(ramAddress)}${table.usedFallback ? " (fallback scan)" : ""}.`
    );
  }

  function patchNoCrits(rom, force, log) {
    const functionOffset = 0x1fda4;
    const stub = bytesFromHex("01 20 70 47");
    const expectedPrefix = bytesFromHex("f8 b5");
    const overlay = getOverlayRange(rom, OVERLAY_16);
    let table;
    try {
      table = findCritRateTable(rom, overlay);
    } catch (error) {
      if (!force) {
        throw error;
      }
      table = { offset: overlay.start + CRIT_RATE_TABLE_REL, usedFallback: false };
    }

    const shift = table.offset - (overlay.start + CRIT_RATE_TABLE_REL);
    const patchAt = overlay.start + functionOffset + shift;
    if (bytesEqual(rom, patchAt, stub)) {
      log.push("No critical hits: already patched.");
      return;
    }
    if (!bytesEqual(rom, patchAt, expectedPrefix) && !force) {
      throw new PatchError("No critical hits sanity check failed at the critical multiplier function.");
    }
    writeBytes(rom, patchAt, stub);
    log.push(
      `No critical hits: wrote stub at overlay 16+${hex(functionOffset + shift)}${
        shift || table.usedFallback ? ` (fallback scan, shift ${shift > 0 ? "+" : ""}${hex(Math.abs(shift))})` : ""
      }.`
    );
  }

  const CRIT_DAMAGE_MULTIPLY_ORIGINAL = bytesFromHex("08 1c 0c 30 6a 58 28 58 50 43 68 50");
  const CRIT_DAMAGE_HOOK_TAIL = bytesFromHex("c0 46 c0 46 c0 46 c0 46");
  const CRIT_DAMAGE_HELPER = bytesFromHex(`
    08 1c 0c 30 6a 58 28 58 01 28 05 d9 50 43 03 23
    58 43 80 08 68 50 70 47 6a 50 70 47
  `);

  function critDamageHook(fromAddress, helperAddress) {
    return padBytes(new Uint8Array(thumbBl(fromAddress, helperAddress)), CRIT_DAMAGE_MULTIPLY_ORIGINAL.length);
  }

  function critDamageHookTarget(rom, overlay, hookAt) {
    if (!bytesEqual(rom, hookAt + 4, CRIT_DAMAGE_HOOK_TAIL)) {
      return null;
    }
    const hookAddress = overlay.loadAddress + (hookAt - overlay.start);
    const helperAddress = decodeThumbBl(hookAddress, rom, hookAt);
    if (helperAddress == null) {
      return null;
    }
    const helperAt = overlay.start + (helperAddress - overlay.loadAddress);
    if (helperAt < overlay.start || helperAt + CRIT_DAMAGE_HELPER.length > overlay.end) {
      return null;
    }
    return bytesEqual(rom, helperAt, CRIT_DAMAGE_HELPER)
      ? { helperAt, helperAddress }
      : null;
  }

  function findCritDamageSite(rom, overlay, rel, label) {
    const preferred = overlay.start + rel;
    const preferredHook = critDamageHookTarget(rom, overlay, preferred);
    if (bytesEqual(rom, preferred, CRIT_DAMAGE_MULTIPLY_ORIGINAL) || preferredHook) {
      return { offset: preferred, usedFallback: false, hook: preferredHook };
    }

    const start = Math.max(overlay.start, preferred - 0x200);
    const end = Math.min(overlay.end, preferred + 0x200);
    const hits = findNeedle(rom, CRIT_DAMAGE_MULTIPLY_ORIGINAL, start, end);
    const hookHits = [];
    for (let offset = start; offset <= end - CRIT_DAMAGE_MULTIPLY_ORIGINAL.length; offset += 2) {
      const hook = critDamageHookTarget(rom, overlay, offset);
      if (hook) {
        hookHits.push({ offset, hook });
      }
    }

    if (hits.length + hookHits.length === 1) {
      if (hits.length) {
        return { offset: hits[0], usedFallback: true, hook: null };
      }
      return { offset: hookHits[0].offset, usedFallback: true, hook: hookHits[0].hook };
    }
    if (hits.length + hookHits.length > 1) {
      throw new PatchError(
        `${label} fallback scan found multiple candidates: ${[...hits, ...hookHits.map((hit) => hit.offset)]
          .map((offset) => `overlay 16+${hex(offset - overlay.start)}`)
          .join(", ")}.`
      );
    }

    return { offset: preferred, usedFallback: false, hook: null };
  }

  function patchCritDamage15(rom, force, log) {
    const overlay = getOverlayRange(rom, OVERLAY_16);
    const sites = [
      { label: "normal damage", rel: 0x62b8 },
      { label: "Beat Up damage", rel: 0xad5a },
    ].map((site) => ({ ...site, ...findCritDamageSite(rom, overlay, site.rel, site.label) }));
    const existingHelpers = Array.from(
      new Set(sites.map((site) => site.hook && site.hook.helperAt).filter((offset) => offset != null))
    );
    const preferredCaveRel = 0x34ca0;
    const preferredCaveAt = overlay.start + preferredCaveRel;
    let caveAt = existingHelpers.length === 1 ? existingHelpers[0] : preferredCaveAt;
    let caveFallback = caveAt !== preferredCaveAt;

    if (existingHelpers.length > 1) {
      throw new PatchError("Critical damage 1.5x found multiple existing helper locations.");
    }
    if (!existingHelpers.length && !bytesEqual(rom, caveAt, CRIT_DAMAGE_HELPER)) {
      const caveExpected = new Uint8Array(CRIT_DAMAGE_HELPER.length).fill(0xff);
      if (!bytesEqual(rom, caveAt, caveExpected)) {
        const dynamicCave = findFillRun(
          rom,
          overlay.start,
          overlay.end,
          0xff,
          CRIT_DAMAGE_HELPER.length,
          preferredCaveAt
        );
        if (dynamicCave !== -1) {
          caveAt = dynamicCave;
          caveFallback = true;
        } else if (!force) {
          throw new PatchError(
            `Critical damage 1.5x code cave sanity check failed at overlay 16+${hex(
              preferredCaveRel
            )}. Enable compatible modified bytes to patch anyway.`
          );
        }
      }
    }

    const caveRel = caveAt - overlay.start;
    const caveAddress = overlay.loadAddress + caveRel;
    const caveAlready = bytesEqual(rom, caveAt, CRIT_DAMAGE_HELPER);
    const patchedSites = sites.map((site) => ({
      ...site,
      hookBytes: critDamageHook(overlay.loadAddress + (site.offset - overlay.start), caveAddress),
    }));
    const allSitesAlready = patchedSites.every((site) => bytesEqual(rom, site.offset, site.hookBytes));

    if (caveAlready && allSitesAlready) {
      log.push(
        `Critical damage 1.5x: already patched; helper at overlay 16+${hex(caveRel)}${
          caveFallback || sites.some((site) => site.usedFallback) ? " (fallback scan)" : ""
        }.`
      );
      return;
    }

    for (const site of patchedSites) {
      if (
        !bytesEqual(rom, site.offset, CRIT_DAMAGE_MULTIPLY_ORIGINAL) &&
        !bytesEqual(rom, site.offset, site.hookBytes) &&
        !force
      ) {
        const found = Array.from(rom.slice(site.offset, site.offset + CRIT_DAMAGE_MULTIPLY_ORIGINAL.length))
          .map((byte) => byte.toString(16).padStart(2, "0"))
          .join(" ");
        throw new PatchError(
          `Critical damage 1.5x ${site.label} sanity check failed at overlay 16+${hex(
            site.offset - overlay.start
          )}. Found ${found}. Enable compatible modified bytes to patch anyway.`
        );
      }
    }

    if (!caveAlready) {
      writeBytes(rom, caveAt, CRIT_DAMAGE_HELPER);
    }
    for (const site of patchedSites) {
      writeBytes(rom, site.offset, site.hookBytes);
    }

    const siteText = patchedSites
      .map((site) => `${site.label} overlay 16+${hex(site.offset - overlay.start)}`)
      .join(", ");
    const notes = [];
    if (sites.some((site) => site.usedFallback)) {
      notes.push("site fallback scan");
    }
    if (caveFallback) {
      notes.push("code-cave fallback scan");
    }
    log.push(
      `Critical damage 1.5x: hooked ${siteText}; helper at overlay 16+${hex(caveRel)} / RAM ${hex(
        caveAddress
      )}${notes.length ? ` (${notes.join(", ")})` : ""}.`
    );
  }


  return {
    critOdds: patchCritOdds,
    critDamage: patchCritDamage15,
    noCrits: patchNoCrits,
  };
});
