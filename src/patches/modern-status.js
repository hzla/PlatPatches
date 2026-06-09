(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory;
    return;
  }
  root.PlatinumPatcherModernStatusPatches = factory(root.PlatinumPatcherCore);
})(typeof globalThis !== "undefined" ? globalThis : this, function (core) {
  "use strict";

  if (!core) {
    throw new Error("PlatinumPatcherCore failed to load for modern-status patches.");
  }

  const {
    PatchError,
    OVERLAY_16,
    hex,
    bytesFromHex,
    bytesEqual,
    writeBytes,
    padBytes,
    requireBytes,
    getArm9Info,
    arm9Offset,
    getOverlayRange,
    findFileByPath,
    findNeedle,
    locateNearby,
    locateUniquePatch,
    replaceNarcMembers,
    replaceRomFile,
    narcMemberBytes,
  } = core;

  const BATTLE_SUB_SEQ_PATH = "battle/skill/sub_seq.narc";
  const TRAINER_AI_SEQ_PATH = "battle/tr_ai/tr_ai_seq.narc";

  function thumbInst16(value) {
    return [value & 0xff, value >> 8];
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

  const UNIVERSAL_INFATUATION_REL = 0xa4f4;
  const UNIVERSAL_INFATUATION_ORIGINAL = bytesFromHex(`
    09 d0 0e 3e 8e 59 0f 21 09 04 31 42 03 d1 02 2d
    01 d0 02 2a 04 d1
  `);
  const UNIVERSAL_INFATUATION_PATCHED = bytesFromHex(`
    c0 46 0e 3e 8e 59 0f 21 09 04 31 42 03 d1 02 2d
    c0 46 02 2a 04 e0
  `);
  const UNIVERSAL_INFATUATION_AI_ORIGINAL = bytesFromHex(`
    0b 00 00 00 00 00 00 00 00 00 0f 00 a3 04 00 00
    29 00 00 00 00 00 00 00 13 00 00 00 0c 00 00 00
    9e 04 00 00 42 00 00 00 01 00 00 00 13 00 00 00
    00 00 00 00 05 00 00 00 13 00 00 00 01 00 00 00
    09 00 00 00 4c 00 00 00 94 04 00 00 42 00 00 00
    00 00 00 00 13 00 00 00 01 00 00 00 09 00 00 00
    4c 00 00 00 8d 04 00 00 42 00 00 00 00 00 00 00
    13 00 00 00 00 00 00 00 02 00 00 00 4c 00 00 00
    86 04 00 00 4d 00 00 00
  `);
  const UNIVERSAL_INFATUATION_AI_PATCHED = bytesFromHex(`
    0b 00 00 00 00 00 00 00 00 00 0f 00 a3 04 00 00
    29 00 00 00 00 00 00 00 13 00 00 00 0c 00 00 00
    9e 04 00 00 4c 00 00 00 16 00 00 00 13 00 00 00
    00 00 00 00 05 00 00 00 13 00 00 00 01 00 00 00
    09 00 00 00 4c 00 00 00 94 04 00 00 42 00 00 00
    00 00 00 00 13 00 00 00 01 00 00 00 09 00 00 00
    4c 00 00 00 8d 04 00 00 42 00 00 00 00 00 00 00
    13 00 00 00 00 00 00 00 02 00 00 00 4c 00 00 00
    86 04 00 00 4d 00 00 00
  `);

  function patchUniversalInfatuationAi(rom, force, log) {
    const file = findFileByPath(rom, TRAINER_AI_SEQ_PATH);
    const narc = rom.slice(file.start, file.end);
    const member = narcMemberBytes(narc, 0);
    const located = locateUniquePatch(
      member,
      UNIVERSAL_INFATUATION_AI_ORIGINAL,
      UNIVERSAL_INFATUATION_AI_PATCHED,
      "Universal infatuation trainer AI gender check"
    );

    if (located.state !== "already") {
      const patchedMember = new Uint8Array(member);
      writeBytes(patchedMember, located.offset, UNIVERSAL_INFATUATION_AI_PATCHED);
      const patchedNarc = replaceNarcMembers(narc, [[0, patchedMember]]);
      replaceRomFile(rom, file, patchedNarc, "Universal infatuation trainer AI");
    }

    log.push(
      `Universal infatuation trainer AI: ${
        located.state === "already" ? "already patched" : "bypassed gender rejection"
      } in ${TRAINER_AI_SEQ_PATH} member 0+${hex(located.offset)}.`
    );
  }

  function patchUniversalInfatuation(rom, force, log, options = {}) {
    const overlay = getOverlayRange(rom, OVERLAY_16);
    const preferred = overlay.start + UNIVERSAL_INFATUATION_REL;
    const located = locateNearby(
      rom,
      preferred,
      UNIVERSAL_INFATUATION_ORIGINAL,
      UNIVERSAL_INFATUATION_PATCHED,
      0x100,
      "Universal infatuation gender checks"
    );
    const state = requireBytes(
      rom,
      located.offset,
      UNIVERSAL_INFATUATION_ORIGINAL,
      UNIVERSAL_INFATUATION_PATCHED,
      force,
      "Universal infatuation gender checks"
    );

    if (state !== "already") {
      writeBytes(rom, located.offset, UNIVERSAL_INFATUATION_PATCHED);
    }

    log.push(
      `Universal infatuation: ${
        state === "already" ? "already patched" : "removed gender restrictions"
      } in BtlCmd_TryAttract at overlay 16+${hex(located.offset - overlay.start)}${
        located.usedFallback ? " (fallback scan)" : ""
      }.`
    );

    if (options.universalInfatuationAi) {
      patchUniversalInfatuationAi(rom, force, log);
    }
  }

  const MODERN_PARALYSIS_CHANCE_REL = 0x13b4e;
  const MODERN_PARALYSIS_CHANCE_ORIGINAL = bytesFromHex("c1 0f 82 07 52 1a 1e 20 c2 41 88 18");
  const MODERN_PARALYSIS_CHANCE_PATCHED = bytesFromHex("c1 0f 42 07 52 1a 1d 20 c2 41 88 18");
  const MODERN_PARALYSIS_SPEED_SITES = [
    {
      label: "battler 1 Speed divisor",
      rel: 0x17fd2,
      original: bytesFromHex(`
        06 98 29 18 37 48 09 58 40 20 08 42 00 d0 b6 08
        0b 98 70 28 0a d1 06 99 15 20 6a 18 32 49 00 01
      `),
      patched: bytesFromHex(`
        06 98 29 18 37 48 09 58 40 20 08 42 00 d0 76 08
        0b 98 70 28 0a d1 06 99 15 20 6a 18 32 49 00 01
      `),
    },
    {
      label: "battler 2 Speed divisor",
      rel: 0x1817e,
      original: bytesFromHex(`
        05 98 29 18 92 48 09 58 40 20 08 42 00 d0 a4 08
        0a 98 70 28 0a d1 05 99 15 20 6a 18 8d 49 00 01
      `),
      patched: bytesFromHex(`
        05 98 29 18 92 48 09 58 40 20 08 42 00 d0 64 08
        0a 98 70 28 0a d1 05 99 15 20 6a 18 8d 49 00 01
      `),
    },
  ];
  const MODERN_PARALYSIS_HOOK_REL = 0x79e2;
  const MODERN_PARALYSIS_THUNDER_WAVE_HOOK_REL = 0x1360c;
  const MODERN_PARALYSIS_THUNDER_WAVE_HOOK_CONTEXT_ORIGINAL = bytesFromHex(`
    0c 49 60 50 28 31 61 58 08 20 08 42 08 d0
  `);
  const MODERN_PARALYSIS_HELPER_RAM = 0x020f30b4;
  const MODERN_PARALYSIS_THUNDER_WAVE_HELPER_RAM = 0x020f318c;
  const BATTLE_MON_SET_RAM_CANDIDATES = [0x022523e8, 0x022523f0];

  function buildModernParalysisThunderWaveHelper() {
    return bytesFromHex(`
      0c 49 60 50 0c 4a a2 58 56 2a 12 d1 e2 6e c0 23
      5a 43 0a 4b a2 18 d0 5c 0d 28 03 d0 01 33 d0 5c
      0d 28 06 d1 06 4a a0 58 06 23 98 43 08 23 18 43
      a0 50 70 47 44 21 00 00 44 30 00 00 64 2d 00 00
      6c 21 00 00
    `);
  }

  function modernParalysisHook(fromAddress, helperAddress) {
    return new Uint8Array(thumbBl(fromAddress, helperAddress));
  }

  function modernParalysisThunderWaveHook(fromAddress, helperAddress) {
    return new Uint8Array(thumbBl(fromAddress, helperAddress));
  }

  function modernParalysisThunderWaveHookContext(fromAddress, helperAddress) {
    const context = new Uint8Array(MODERN_PARALYSIS_THUNDER_WAVE_HOOK_CONTEXT_ORIGINAL);
    context.set(modernParalysisThunderWaveHook(fromAddress, helperAddress), 0);
    return context;
  }

  function bytesEqualAny(data, offset, expectedList) {
    return expectedList.some((expected) => bytesEqual(data, offset, expected));
  }

  function findModernParalysisBattleMonSetRam(rom, overlay) {
    const candidates = BATTLE_MON_SET_RAM_CANDIDATES.map((ramAddress) => ({ ramAddress, hits: 0 }));
    for (let offset = overlay.start; offset <= overlay.end - 4; offset += 2) {
      const fromAddress = overlay.loadAddress + (offset - overlay.start);
      for (const candidate of candidates) {
        if (bytesEqual(rom, offset, thumbBl(fromAddress, candidate.ramAddress))) {
          candidate.hits += 1;
        }
      }
    }

    candidates.sort((a, b) => b.hits - a.hits);
    if (candidates[0].hits === 0 || candidates[0].hits === candidates[1].hits) {
      throw new PatchError(
        `Modern paralysis could not identify this ROM's BattleMon_Set entrypoint. Candidate hit counts: ${candidates
          .map((candidate) => `${hex(candidate.ramAddress)}=${candidate.hits}`)
          .join(", ")}.`
      );
    }
    return candidates[0].ramAddress;
  }

  function findModernParalysisHook(rom, overlay, helperAddress, battleMonSetRam) {
    const preferred = overlay.start + MODERN_PARALYSIS_HOOK_REL;
    const preferredRam = overlay.loadAddress + MODERN_PARALYSIS_HOOK_REL;
    const preferredOriginal = new Uint8Array(thumbBl(preferredRam, battleMonSetRam));
    const preferredHook = modernParalysisHook(
      preferredRam,
      helperAddress
    );
    if (bytesEqual(rom, preferred, preferredOriginal) || bytesEqual(rom, preferred, preferredHook)) {
      return { offset: preferred, usedFallback: false, originalBytes: preferredOriginal, hookBytes: preferredHook };
    }

    const hits = [];
    const start = Math.max(overlay.start, preferred - 0x100);
    const end = Math.min(overlay.end, preferred + 0x100);
    for (let offset = start; offset <= end - 4; offset += 2) {
      const ramAddress = overlay.loadAddress + (offset - overlay.start);
      const originalBytes = new Uint8Array(thumbBl(ramAddress, battleMonSetRam));
      const hookBytes = modernParalysisHook(ramAddress, helperAddress);
      if (bytesEqual(rom, offset, originalBytes) || bytesEqual(rom, offset, hookBytes)) {
        hits.push({ offset, originalBytes, hookBytes });
      }
    }

    if (hits.length === 1) {
      return { ...hits[0], usedFallback: true };
    }
    if (hits.length > 1) {
      throw new PatchError(
        `Modern paralysis status hook fallback scan found multiple candidates: ${hits
          .map((hit) => `overlay 16+${hex(hit.offset - overlay.start)}`)
          .join(", ")}.`
      );
    }

    return { offset: preferred, usedFallback: false, originalBytes: preferredOriginal, hookBytes: preferredHook };
  }

  function findModernParalysisThunderWaveHook(rom, overlay, helperAddress) {
    const preferred = overlay.start + MODERN_PARALYSIS_THUNDER_WAVE_HOOK_REL;
    const preferredRam = overlay.loadAddress + MODERN_PARALYSIS_THUNDER_WAVE_HOOK_REL;
    const preferredHook = modernParalysisThunderWaveHook(preferredRam, helperAddress);
    const preferredContext = modernParalysisThunderWaveHookContext(preferredRam, helperAddress);
    if (
      bytesEqual(rom, preferred, MODERN_PARALYSIS_THUNDER_WAVE_HOOK_CONTEXT_ORIGINAL) ||
      bytesEqual(rom, preferred, preferredContext)
    ) {
      return { offset: preferred, usedFallback: false, hookBytes: preferredHook };
    }

    const hits = [];
    const start = Math.max(overlay.start, preferred - 0x100);
    const end = Math.min(overlay.end, preferred + 0x100);
    for (let offset = start; offset <= end - MODERN_PARALYSIS_THUNDER_WAVE_HOOK_CONTEXT_ORIGINAL.length; offset += 2) {
      const ramAddress = overlay.loadAddress + (offset - overlay.start);
      const hookBytes = modernParalysisThunderWaveHook(ramAddress, helperAddress);
      const hookContext = modernParalysisThunderWaveHookContext(ramAddress, helperAddress);
      if (
        bytesEqual(rom, offset, MODERN_PARALYSIS_THUNDER_WAVE_HOOK_CONTEXT_ORIGINAL) ||
        bytesEqual(rom, offset, hookContext)
      ) {
        hits.push({ offset, hookBytes });
      }
    }

    if (hits.length === 1) {
      return { ...hits[0], usedFallback: true };
    }
    if (hits.length > 1) {
      throw new PatchError(
        `Modern paralysis Thunder Wave type hook fallback scan found multiple candidates: ${hits
          .map((hit) => `overlay 16+${hex(hit.offset - overlay.start)}`)
          .join(", ")}.`
      );
    }

    return { offset: preferred, usedFallback: false, hookBytes: preferredHook };
  }

  function patchModernParalysis(rom, force, log) {
    const overlay = getOverlayRange(rom, OVERLAY_16);
    const freezeHookActive = isModernFreezeHookActive(rom, overlay);
    let chanceLocated = {
      offset: overlay.start + MODERN_PARALYSIS_CHANCE_REL,
      usedFallback: false,
      skippedByModernFreeze: freezeHookActive,
    };
    let chanceState = "already";
    if (!freezeHookActive) {
      const chancePreferred = overlay.start + MODERN_PARALYSIS_CHANCE_REL;
      chanceLocated = locateNearby(
        rom,
        chancePreferred,
        MODERN_PARALYSIS_CHANCE_ORIGINAL,
        MODERN_PARALYSIS_CHANCE_PATCHED,
        0x100,
        "Modern paralysis chance"
      );
      chanceState = requireBytes(
        rom,
        chanceLocated.offset,
        MODERN_PARALYSIS_CHANCE_ORIGINAL,
        MODERN_PARALYSIS_CHANCE_PATCHED,
        force,
        "Modern paralysis chance"
      );
    }

    const speedSites = MODERN_PARALYSIS_SPEED_SITES.map((site) => {
      const located = locateNearby(
        rom,
        overlay.start + site.rel - 0xe,
        site.original,
        site.patched,
        0x100,
        `Modern paralysis ${site.label}`
      );
      const state = requireBytes(
        rom,
        located.offset,
        site.original,
        site.patched,
        force,
        `Modern paralysis ${site.label}`
      );
      return { ...site, ...located, state };
    });

    const thunderWaveHelper = buildModernParalysisThunderWaveHelper();
    const thunderWaveHelperAt = arm9Offset(
      rom,
      MODERN_PARALYSIS_THUNDER_WAVE_HELPER_RAM,
      thunderWaveHelper.length
    );
    const thunderWaveHelperExpected = new Uint8Array(thunderWaveHelper.length).fill(0x00);
    const thunderWaveHelperState = requireBytes(
      rom,
      thunderWaveHelperAt,
      thunderWaveHelperExpected,
      thunderWaveHelper,
      force,
      "Modern paralysis Thunder Wave Electric immunity helper"
    );

    const battleMonSetRam = findModernParalysisBattleMonSetRam(rom, overlay);
    const hookLocated = findModernParalysisHook(rom, overlay, MODERN_PARALYSIS_HELPER_RAM, battleMonSetRam);
    const hookState =
      bytesEqual(rom, hookLocated.offset, hookLocated.originalBytes)
        ? "original"
        : bytesEqual(rom, hookLocated.offset, hookLocated.hookBytes) || force
          ? "restore"
          : null;
    if (hookState == null) {
      const found = Array.from(rom.slice(hookLocated.offset, hookLocated.offset + 4))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join(" ");
      throw new PatchError(
        `Modern paralysis status hook sanity check failed at overlay 16+${hex(
          hookLocated.offset - overlay.start
        )}. Found ${found}. Enable compatible modified bytes to patch anyway.`
      );
    }

    const thunderWaveHookLocated = findModernParalysisThunderWaveHook(
      rom,
      overlay,
      MODERN_PARALYSIS_THUNDER_WAVE_HELPER_RAM
    );
    const thunderWaveHookContext = modernParalysisThunderWaveHookContext(
      overlay.loadAddress + (thunderWaveHookLocated.offset - overlay.start),
      MODERN_PARALYSIS_THUNDER_WAVE_HELPER_RAM
    );
    const thunderWaveHookState =
      bytesEqual(rom, thunderWaveHookLocated.offset, thunderWaveHookContext)
        ? "already"
        : bytesEqual(rom, thunderWaveHookLocated.offset, MODERN_PARALYSIS_THUNDER_WAVE_HOOK_CONTEXT_ORIGINAL) || force
          ? "patch"
          : null;
    if (thunderWaveHookState == null) {
      const found = Array.from(
        rom.slice(
          thunderWaveHookLocated.offset,
          thunderWaveHookLocated.offset + MODERN_PARALYSIS_THUNDER_WAVE_HOOK_CONTEXT_ORIGINAL.length
        )
      )
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join(" ");
      throw new PatchError(
        `Modern paralysis Thunder Wave type hook sanity check failed at overlay 16+${hex(
          thunderWaveHookLocated.offset - overlay.start
        )}. Found ${found}. Enable compatible modified bytes to patch anyway.`
      );
    }

    if (chanceState !== "already") {
      writeBytes(rom, chanceLocated.offset, MODERN_PARALYSIS_CHANCE_PATCHED);
    }
    for (const site of speedSites) {
      if (site.state !== "already") {
        writeBytes(rom, site.offset, site.patched);
      }
    }
    if (thunderWaveHelperState !== "already") {
      writeBytes(rom, thunderWaveHelperAt, thunderWaveHelper);
    }
    if (hookState === "restore") {
      writeBytes(rom, hookLocated.offset, hookLocated.originalBytes);
    }
    if (thunderWaveHookState !== "already") {
      writeBytes(rom, thunderWaveHookLocated.offset, thunderWaveHookLocated.hookBytes);
    }

    if (
      chanceState === "already" &&
      speedSites.every((site) => site.state === "already") &&
      thunderWaveHelperState === "already" &&
      hookState === "original" &&
      thunderWaveHookState === "already"
    ) {
      log.push("Modern paralysis: already patched.");
      return;
    }

    const notes = [];
    if (chanceLocated.usedFallback) {
      notes.push("chance fallback scan");
    }
    if (chanceLocated.skippedByModernFreeze) {
      notes.push("chance edit covered by Modern freeze hook");
    }
    if (hookState === "restore") {
      notes.push("restored old status-write hook");
    } else if (hookLocated.usedFallback) {
      notes.push("status call fallback scan");
    }
    if (thunderWaveHookLocated.usedFallback) {
      notes.push("Thunder Wave hook fallback scan");
    }
    if (speedSites.some((site) => site.usedFallback)) {
      notes.push("Speed divisor fallback scan");
    }
    log.push(
      `Modern paralysis: full-paralysis chance is 12.5% at overlay 16+${hex(
        chanceLocated.offset - overlay.start
      )}; paralysis Speed reduction is 50% at overlay 16+${speedSites
        .map((site) => hex(site.offset - overlay.start + 0xe))
        .join(" and +")}; Thunder Wave fails against Electric-type targets via overlay 16+${hex(
        thunderWaveHookLocated.offset - overlay.start
      )}; status write remains vanilla at overlay 16+${hex(
        hookLocated.offset - overlay.start
      )} -> ${hex(battleMonSetRam)}; Thunder Wave helper at ARM9 RAM ${hex(MODERN_PARALYSIS_THUNDER_WAVE_HELPER_RAM)}${
        notes.length ? ` (${notes.join(", ")})` : ""
      }.`
    );
  }

  const MODERN_BURN_HOOK_REL = 0x1fb0e;
  const MODERN_BURN_ORIGINAL = bytesFromHex(`
    12 98 10 21 08 42 06 d0 3e 2f 04 d0 21 98 c1 0f
    41 18 48 10 21 90
  `);
  const MODERN_BURN_HELPER_RAM = 0x020f3168;
  const MODERN_BURN_HELPER = bytesFromHex(`
    12 98 10 21 08 42 0c d0 3e 2f 0a d0 02 98 83 21
    49 00 01 31 88 42 04 d0 21 98 c1 0f 41 18 48 10
    21 90 70 47
  `);
  const MODERN_BURN_DAMAGE_ORIGINAL = bytesFromHex(`
    55 00 00 00 20 00 00 00 08 00 00 00 37 00 00 00
    01 00 00 00 ff 00 00 00 55 00 00 00 03 00 00 00
    55 00 00 00 20 00 00 00 02 00 00 00 32 00 00 00
    0c 00 00 00 20 00 00 00 ff ff ff ff 12 00 00 00
    5f 00 00 00 02 00 00 00 ff 00 00 00
  `);
  const MODERN_BURN_DAMAGE_PATCHED = bytesFromHex(`
    55 00 00 00 20 00 00 00 10 00 00 00 37 00 00 00
    01 00 00 00 ff 00 00 00 55 00 00 00 03 00 00 00
    55 00 00 00 20 00 00 00 02 00 00 00 32 00 00 00
    0c 00 00 00 20 00 00 00 ff ff ff ff 12 00 00 00
    5f 00 00 00 02 00 00 00 ff 00 00 00
  `);

  function modernBurnHook(fromAddress, helperAddress) {
    return padBytes(new Uint8Array(thumbBl(fromAddress, helperAddress)), MODERN_BURN_ORIGINAL.length);
  }

  function findModernBurnHook(rom, overlay, helperAddress) {
    const preferred = overlay.start + MODERN_BURN_HOOK_REL;
    const preferredHook = modernBurnHook(overlay.loadAddress + MODERN_BURN_HOOK_REL, helperAddress);
    if (bytesEqual(rom, preferred, MODERN_BURN_ORIGINAL) || bytesEqual(rom, preferred, preferredHook)) {
      return { offset: preferred, usedFallback: false, hookBytes: preferredHook };
    }

    const hits = [];
    const start = Math.max(overlay.start, preferred - 0x100);
    const end = Math.min(overlay.end, preferred + 0x100);
    for (let offset = start; offset <= end - MODERN_BURN_ORIGINAL.length; offset += 2) {
      const hookBytes = modernBurnHook(overlay.loadAddress + (offset - overlay.start), helperAddress);
      if (bytesEqual(rom, offset, MODERN_BURN_ORIGINAL) || bytesEqual(rom, offset, hookBytes)) {
        hits.push({ offset, hookBytes });
      }
    }

    if (hits.length === 1) {
      return { ...hits[0], usedFallback: true };
    }
    if (hits.length > 1) {
      throw new PatchError(
        `Modern burn fallback scan found multiple candidates: ${hits
          .map((hit) => `overlay 16+${hex(hit.offset - overlay.start)}`)
          .join(", ")}.`
      );
    }

    return { offset: preferred, usedFallback: false, hookBytes: preferredHook };
  }

  function locateBattleSubSeqPatch(rom, expected, alreadyPatched, label) {
    const file = findFileByPath(rom, BATTLE_SUB_SEQ_PATH);
    const located = locateUniquePatch(rom.slice(file.start, file.end), expected, alreadyPatched, label);
    return { ...located, offset: file.start + located.offset, file, fileRelativeOffset: located.offset };
  }

  function patchModernBurn(rom, force, log) {
    const overlay = getOverlayRange(rom, OVERLAY_16);
    const burnDamage = locateBattleSubSeqPatch(
      rom,
      MODERN_BURN_DAMAGE_ORIGINAL,
      MODERN_BURN_DAMAGE_PATCHED,
      "Modern burn residual damage divisor"
    );
    const helperAt = arm9Offset(rom, MODERN_BURN_HELPER_RAM, MODERN_BURN_HELPER.length);
    const helperExpected = new Uint8Array(MODERN_BURN_HELPER.length).fill(0x00);
    const helperState = requireBytes(
      rom,
      helperAt,
      helperExpected,
      MODERN_BURN_HELPER,
      force,
      "Modern burn Facade helper"
    );

    const hookLocated = findModernBurnHook(rom, overlay, MODERN_BURN_HELPER_RAM);
    const hookAlready = bytesEqual(rom, hookLocated.offset, hookLocated.hookBytes);
    if (!hookAlready && !bytesEqual(rom, hookLocated.offset, MODERN_BURN_ORIGINAL) && !force) {
      const found = Array.from(rom.slice(hookLocated.offset, hookLocated.offset + MODERN_BURN_ORIGINAL.length))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join(" ");
      throw new PatchError(
        `Modern burn hook sanity check failed at overlay 16+${hex(
          hookLocated.offset - overlay.start
        )}. Found ${found}. Enable compatible modified bytes to patch anyway.`
      );
    }

    if (helperState !== "already") {
      writeBytes(rom, helperAt, MODERN_BURN_HELPER);
    }
    if (!hookAlready) {
      writeBytes(rom, hookLocated.offset, hookLocated.hookBytes);
    }
    if (burnDamage.state !== "already") {
      writeBytes(rom, burnDamage.offset, MODERN_BURN_DAMAGE_PATCHED);
    }

    if (helperState === "already" && hookAlready && burnDamage.state === "already") {
      log.push("Modern burn: already patched.");
      return;
    }

    log.push(
      `Modern burn: Facade ignores burn damage reduction at overlay 16+${hex(
        hookLocated.offset - overlay.start
      )}; burn chip damage is 1/16 at ROM ${hex(
        burnDamage.offset + 0x8
      )}; helper at ARM9 RAM ${hex(MODERN_BURN_HELPER_RAM)}${
        hookLocated.usedFallback ? " (fallback scan)" : ""
      }.`
    );
  }

  const MODERN_SLEEP_DURATION_ORIGINAL = bytesFromHex(`
    38 00 00 00 03 00 00 00 02 00 00 00
    3a 00 00 00 0a 00 00 00 07 00 00 00
    34 00 00 00 09 00 00 00
  `);
  const MODERN_SLEEP_DURATION_PATCHED = bytesFromHex(`
    38 00 00 00 01 00 00 00 03 00 00 00
    3a 00 00 00 0a 00 00 00 07 00 00 00
    34 00 00 00 09 00 00 00
  `);
  const MODERN_SLEEP_HOOK_REL = 0x13a62;
  const MODERN_SLEEP_HOOK_ORIGINAL = bytesFromHex(`
    a6 48 10 58 41 1e a4 48 11 50 61 6e
    c0 20 48 43 21 18 a1 48 09 58
  `);
  const MODERN_SLEEP_HELPER_RAM = 0x020f321c;
  const BATTLE_SYSTEM_RAND_NEXT_RAM = 0x0223f4bc;

  function buildModernSleepHelper(helperAddress) {
    const helper = bytesFromHex(`
      1c b5 0d 4b d4 58 07 20 20 40 03 28 00 d9 03 20
      01 38 01 28 08 d1 0a 98 ff f7 fe ff 07 49 88 42
      01 d2 00 20 00 e0 01 20 07 21 8c 43 04 43 00 9a
      01 4b d4 50 21 1c 1c bd b0 2d 00 00 55 55 00 00
    `);
    helper.set(thumbBl(helperAddress + 0x18, BATTLE_SYSTEM_RAND_NEXT_RAM), 0x18);
    return helper;
  }

  function modernSleepHook(fromAddress, helperAddress) {
    return padBytes(new Uint8Array(thumbBl(fromAddress, helperAddress)), MODERN_SLEEP_HOOK_ORIGINAL.length);
  }

  function findModernSleepHook(rom, overlay, helperAddress) {
    const preferred = overlay.start + MODERN_SLEEP_HOOK_REL;
    const preferredHook = modernSleepHook(overlay.loadAddress + MODERN_SLEEP_HOOK_REL, helperAddress);
    if (bytesEqual(rom, preferred, MODERN_SLEEP_HOOK_ORIGINAL) || bytesEqual(rom, preferred, preferredHook)) {
      return { offset: preferred, usedFallback: false, hookBytes: preferredHook };
    }

    const hits = [];
    const start = Math.max(overlay.start, preferred - 0x100);
    const end = Math.min(overlay.end, preferred + 0x100);
    for (let offset = start; offset <= end - MODERN_SLEEP_HOOK_ORIGINAL.length; offset += 2) {
      const hookBytes = modernSleepHook(overlay.loadAddress + (offset - overlay.start), helperAddress);
      if (bytesEqual(rom, offset, MODERN_SLEEP_HOOK_ORIGINAL) || bytesEqual(rom, offset, hookBytes)) {
        hits.push({ offset, hookBytes });
      }
    }

    if (hits.length === 1) {
      return { ...hits[0], usedFallback: true };
    }
    if (hits.length > 1) {
      throw new PatchError(
        `Modern sleep fallback scan found multiple candidates: ${hits
          .map((hit) => `overlay 16+${hex(hit.offset - overlay.start)}`)
          .join(", ")}.`
      );
    }

    return { offset: preferred, usedFallback: false, hookBytes: preferredHook };
  }

  function patchModernSleep(rom, force, log) {
    const sleepDuration = locateBattleSubSeqPatch(
      rom,
      MODERN_SLEEP_DURATION_ORIGINAL,
      MODERN_SLEEP_DURATION_PATCHED,
      "Modern sleep battle-script duration command"
    );

    const helper = buildModernSleepHelper(MODERN_SLEEP_HELPER_RAM);
    const helperAt = arm9Offset(rom, MODERN_SLEEP_HELPER_RAM, helper.length);
    const helperExpected = new Uint8Array(helper.length).fill(0x00);
    const helperState = requireBytes(
      rom,
      helperAt,
      helperExpected,
      helper,
      force,
      "Modern sleep wake-roll helper"
    );

    const overlay = getOverlayRange(rom, OVERLAY_16);
    const hookLocated = findModernSleepHook(rom, overlay, MODERN_SLEEP_HELPER_RAM);
    const hookAlready = bytesEqual(rom, hookLocated.offset, hookLocated.hookBytes);
    if (!hookAlready && !bytesEqual(rom, hookLocated.offset, MODERN_SLEEP_HOOK_ORIGINAL) && !force) {
      const found = Array.from(rom.slice(hookLocated.offset, hookLocated.offset + MODERN_SLEEP_HOOK_ORIGINAL.length))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join(" ");
      throw new PatchError(
        `Modern sleep hook sanity check failed at overlay 16+${hex(
          hookLocated.offset - overlay.start
        )}. Found ${found}. Enable compatible modified bytes to patch anyway.`
      );
    }

    if (sleepDuration.state !== "already") {
      writeBytes(rom, sleepDuration.offset, MODERN_SLEEP_DURATION_PATCHED);
    }
    if (helperState !== "already") {
      writeBytes(rom, helperAt, helper);
    }
    if (!hookAlready) {
      writeBytes(rom, hookLocated.offset, hookLocated.hookBytes);
    }

    if (sleepDuration.state === "already" && helperState === "already" && hookAlready) {
      log.push("Modern sleep: already patched.");
      return;
    }

    log.push(
      `Modern sleep: sleep duration script at ROM ${hex(
        sleepDuration.offset
      )}; sleep counter hook at overlay 16+${hex(
        hookLocated.offset - overlay.start
      )}; helper at ARM9 RAM ${hex(MODERN_SLEEP_HELPER_RAM)}${
        hookLocated.usedFallback ? " (fallback scan)" : ""
      }.`
    );
  }

  const MODERN_FREEZE_HOOK_REL = 0x13b48;
  const MODERN_FREEZE_HOOK_ORIGINAL = bytesFromHex(`
    06 98 f0 f7 17 fc c1 0f 82 07 52 1a 1e 20 c2 41 88 18
  `);
  const MODERN_FREEZE_HOOK_PARALYSIS_COMPAT = bytesFromHex(`
    06 98 f0 f7 17 fc c1 0f 42 07 52 1a 1d 20 c2 41 88 18
  `);
  const MODERN_FREEZE_HOOK_ORIGINALS = [
    MODERN_FREEZE_HOOK_ORIGINAL,
    MODERN_FREEZE_HOOK_PARALYSIS_COMPAT,
  ];
  const MODERN_FREEZE_HELPER_RAM = 0x020f3300;
  const MODERN_FREEZE_HELPER_SEARCH_START_RAM = 0x020f3300;
  const MODERN_FREEZE_HELPER_SEARCH_END_RAM = 0x020f3800;

  function buildModernFreezeHelper(helperAddress) {
    const helper = bytesFromHex(`
      10 b5 0c 1c 62 6e c0 21 4a 43 09 49 89 18 09 19
      0a 88 01 32 0a 80 03 2a 06 d2 ff f7 fe ff 03 21
      08 42 01 d0 01 20 10 bd 00 22 0a 80 00 20 10 bd
      ba 2d 00 00
    `);
    helper.set(thumbBl(helperAddress + 0x1a, BATTLE_SYSTEM_RAND_NEXT_RAM), 0x1a);
    return helper;
  }

  function modernFreezeHook(fromAddress, helperAddress) {
    const hook = new Uint8Array(MODERN_FREEZE_HOOK_ORIGINAL.length);
    hook.set(bytesFromHex("06 98 21 1c"), 0); // ldr r0,[sp,#0x18]; adds r1,r4,#0
    hook.set(thumbBl(fromAddress + 0x4, helperAddress), 0x4);
    hook.set(bytesFromHex("00 28"), 0x8); // existing bne after this block uses the helper result
    for (let i = 0xa; i < hook.length; i += 2) {
      hook[i] = 0xc0;
      hook[i + 1] = 0x46;
    }
    return hook;
  }

  function bytesMatchModernFreezeHook(data, offset) {
    const prefix = bytesFromHex("06 98 21 1c");
    const suffix = bytesFromHex("00 28 c0 46 c0 46 c0 46 c0 46");
    return bytesEqual(data, offset, prefix) && bytesEqual(data, offset + 0x8, suffix);
  }

  function isModernFreezeHookActive(rom, overlay) {
    return bytesMatchModernFreezeHook(rom, overlay.start + MODERN_FREEZE_HOOK_REL);
  }

  function findModernFreezeHook(rom, overlay, helperAddress) {
    const preferred = overlay.start + MODERN_FREEZE_HOOK_REL;
    const preferredHook = modernFreezeHook(overlay.loadAddress + MODERN_FREEZE_HOOK_REL, helperAddress);
    if (bytesEqualAny(rom, preferred, MODERN_FREEZE_HOOK_ORIGINALS) || bytesEqual(rom, preferred, preferredHook)) {
      return { offset: preferred, usedFallback: false, hookBytes: preferredHook };
    }

    const hits = [];
    const start = Math.max(overlay.start, preferred - 0x100);
    const end = Math.min(overlay.end, preferred + 0x100);
    for (let offset = start; offset <= end - MODERN_FREEZE_HOOK_ORIGINAL.length; offset += 2) {
      const hookBytes = modernFreezeHook(overlay.loadAddress + (offset - overlay.start), helperAddress);
      if (bytesEqualAny(rom, offset, MODERN_FREEZE_HOOK_ORIGINALS) || bytesEqual(rom, offset, hookBytes)) {
        hits.push({ offset, hookBytes });
      }
    }

    if (hits.length === 1) {
      return { ...hits[0], usedFallback: true };
    }
    if (hits.length > 1) {
      throw new PatchError(
        `Modern freeze fallback scan found multiple candidates: ${hits
          .map((hit) => `overlay 16+${hex(hit.offset - overlay.start)}`)
          .join(", ")}.`
      );
    }

    return { offset: preferred, usedFallback: false, hookBytes: preferredHook };
  }

  function resolveModernFreezeHelperCave(rom, helper) {
    const arm9 = getArm9Info(rom);
    const preferredHelperAt = arm9Offset(rom, MODERN_FREEZE_HELPER_RAM, helper.length);
    let helperAt = preferredHelperAt;
    let helperRamAddress = MODERN_FREEZE_HELPER_RAM;
    let helperUsedFallback = false;

    if (
      !bytesEqual(rom, preferredHelperAt, helper) &&
      !bytesEqual(rom, preferredHelperAt, new Uint8Array(helper.length).fill(0x00))
    ) {
      const existingHits = findNeedle(rom, helper, arm9.fileOffset, arm9.fileOffset + arm9.size);
      if (existingHits.length === 1) {
        helperAt = existingHits[0];
        helperRamAddress = arm9.loadAddress + (helperAt - arm9.fileOffset);
        helperUsedFallback = helperAt !== preferredHelperAt;
      } else {
        const searchStart = arm9Offset(rom, MODERN_FREEZE_HELPER_SEARCH_START_RAM);
        const searchEnd = arm9Offset(rom, MODERN_FREEZE_HELPER_SEARCH_END_RAM);
        const dynamicCave = findFillRun(rom, searchStart, searchEnd, 0x00, helper.length, preferredHelperAt);
        if (dynamicCave === -1) {
          throw new PatchError("Modern freeze could not find a free ARM9 helper cave.");
        }
        helperAt = dynamicCave;
        helperRamAddress = arm9.loadAddress + (helperAt - arm9.fileOffset);
        helperUsedFallback = true;
      }
    }

    return { helperAt, helperRamAddress, helperUsedFallback };
  }

  function patchModernFreeze(rom, force, log) {
    const preferredHelper = buildModernFreezeHelper(MODERN_FREEZE_HELPER_RAM);
    let { helperAt, helperRamAddress, helperUsedFallback } = resolveModernFreezeHelperCave(rom, preferredHelper);
    const helper = helperRamAddress === MODERN_FREEZE_HELPER_RAM
      ? preferredHelper
      : buildModernFreezeHelper(helperRamAddress);
    if (helperRamAddress !== MODERN_FREEZE_HELPER_RAM) {
      ({ helperAt, helperRamAddress, helperUsedFallback } = resolveModernFreezeHelperCave(rom, helper));
    }

    const helperExpected = new Uint8Array(helper.length).fill(0x00);
    const helperState = requireBytes(
      rom,
      helperAt,
      helperExpected,
      helper,
      force,
      "Modern freeze thaw helper"
    );

    const overlay = getOverlayRange(rom, OVERLAY_16);
    const hookLocated = findModernFreezeHook(rom, overlay, helperRamAddress);
    const hookAlready = bytesEqual(rom, hookLocated.offset, hookLocated.hookBytes);
    if (!hookAlready && !bytesEqualAny(rom, hookLocated.offset, MODERN_FREEZE_HOOK_ORIGINALS) && !force) {
      const found = Array.from(rom.slice(hookLocated.offset, hookLocated.offset + MODERN_FREEZE_HOOK_ORIGINAL.length))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join(" ");
      throw new PatchError(
        `Modern freeze hook sanity check failed at overlay 16+${hex(
          hookLocated.offset - overlay.start
        )}. Found ${found}. Enable compatible modified bytes to patch anyway.`
      );
    }

    if (helperState !== "already") {
      writeBytes(rom, helperAt, helper);
    }
    if (!hookAlready) {
      writeBytes(rom, hookLocated.offset, hookLocated.hookBytes);
    }

    if (helperState === "already" && hookAlready) {
      log.push("Modern freeze: already patched.");
      return;
    }

    const notes = [];
    if (hookLocated.usedFallback) {
      notes.push("hook fallback scan");
    }
    if (helperUsedFallback) {
      notes.push("helper fallback scan");
    }
    log.push(
      `Modern freeze: thaw chance is 25% with forced third-action thaw at overlay 16+${hex(
        hookLocated.offset - overlay.start
      )}; helper at ARM9 RAM ${hex(helperRamAddress)}${notes.length ? ` (${notes.join(", ")})` : ""}.`
    );
  }

  const MODERN_CONFUSION_HOOK_REL = 0x13a7e;
  const MODERN_CONFUSION_HOOK_ORIGINAL = bytesFromHex(`
    06 98 f0 f7 7c fc 01 21 08 42 09 d0
  `);
  const MODERN_CONFUSION_HELPER_RAM = 0x020f3260;

  function buildModernConfusionHelper(helperAddress) {
    const helper = bytesFromHex(`
      00 b5 ff f7 fe ff 02 49 88 42 01 d2 00 20 00 bd
      01 20 00 bd 55 55 00 00
    `);
    helper.set(thumbBl(helperAddress + 0x2, BATTLE_SYSTEM_RAND_NEXT_RAM), 0x2);
    return helper;
  }

  function modernConfusionHook(fromAddress, helperAddress) {
    return new Uint8Array([
      0x06,
      0x98,
      ...thumbBl(fromAddress + 0x2, helperAddress),
      0x00,
      0x28,
      ...thumbCondBranch(fromAddress + 0x8, fromAddress + 0x20, 0),
    ]);
  }

  function findModernConfusionHook(rom, overlay, helperAddress) {
    const preferred = overlay.start + MODERN_CONFUSION_HOOK_REL;
    const preferredHook = modernConfusionHook(overlay.loadAddress + MODERN_CONFUSION_HOOK_REL, helperAddress);
    if (bytesEqual(rom, preferred, MODERN_CONFUSION_HOOK_ORIGINAL) || bytesEqual(rom, preferred, preferredHook)) {
      return { offset: preferred, usedFallback: false, hookBytes: preferredHook };
    }

    const hits = [];
    const start = Math.max(overlay.start, preferred - 0x100);
    const end = Math.min(overlay.end, preferred + 0x100);
    for (let offset = start; offset <= end - MODERN_CONFUSION_HOOK_ORIGINAL.length; offset += 2) {
      const hookBytes = modernConfusionHook(overlay.loadAddress + (offset - overlay.start), helperAddress);
      if (bytesEqual(rom, offset, MODERN_CONFUSION_HOOK_ORIGINAL) || bytesEqual(rom, offset, hookBytes)) {
        hits.push({ offset, hookBytes });
      }
    }

    if (hits.length === 1) {
      return { ...hits[0], usedFallback: true };
    }
    if (hits.length > 1) {
      throw new PatchError(
        `Modern confusion fallback scan found multiple candidates: ${hits
          .map((hit) => `overlay 16+${hex(hit.offset - overlay.start)}`)
          .join(", ")}.`
      );
    }

    return { offset: preferred, usedFallback: false, hookBytes: preferredHook };
  }

  function patchModernConfusion(rom, force, log) {
    const helper = buildModernConfusionHelper(MODERN_CONFUSION_HELPER_RAM);
    const helperAt = arm9Offset(rom, MODERN_CONFUSION_HELPER_RAM, helper.length);
    const helperExpected = new Uint8Array(helper.length).fill(0x00);
    const helperState = requireBytes(
      rom,
      helperAt,
      helperExpected,
      helper,
      force,
      "Modern confusion self-hit helper"
    );

    const overlay = getOverlayRange(rom, OVERLAY_16);
    const hookLocated = findModernConfusionHook(rom, overlay, MODERN_CONFUSION_HELPER_RAM);
    const hookAlready = bytesEqual(rom, hookLocated.offset, hookLocated.hookBytes);
    if (!hookAlready && !bytesEqual(rom, hookLocated.offset, MODERN_CONFUSION_HOOK_ORIGINAL) && !force) {
      const found = Array.from(rom.slice(hookLocated.offset, hookLocated.offset + MODERN_CONFUSION_HOOK_ORIGINAL.length))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join(" ");
      throw new PatchError(
        `Modern confusion hook sanity check failed at overlay 16+${hex(
          hookLocated.offset - overlay.start
        )}. Found ${found}. Enable compatible modified bytes to patch anyway.`
      );
    }

    if (helperState !== "already") {
      writeBytes(rom, helperAt, helper);
    }
    if (!hookAlready) {
      writeBytes(rom, hookLocated.offset, hookLocated.hookBytes);
    }

    if (helperState === "already" && hookAlready) {
      log.push("Modern confusion: already patched.");
      return;
    }

    log.push(
      `Modern confusion: self-hit odds are about 1/3 at overlay 16+${hex(
        hookLocated.offset - overlay.start
      )}; helper at ARM9 RAM ${hex(MODERN_CONFUSION_HELPER_RAM)}${
        hookLocated.usedFallback ? " (fallback scan)" : ""
      }.`
    );
  }

  return {
    universalInfatuation: patchUniversalInfatuation,
    modernParalysis: patchModernParalysis,
    modernBurn: patchModernBurn,
    modernSleep: patchModernSleep,
    modernFreeze: patchModernFreeze,
    modernConfusion: patchModernConfusion,
  };
});
