(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    const assembler = require("../asm/armips-assembler.js");
    const templates = require("../asm/templates.js");
    module.exports = (core) => factory(core, assembler, templates);
    return;
  }
  root.PlatinumPatcherModernStatusPatches = factory(
    root.PlatinumPatcherCore,
    root.PlatinumPatcherArmipsAssembler,
    root.PlatinumPatcherAsmTemplates
  );
})(typeof globalThis !== "undefined" ? globalThis : this, function (core, assembler, asmTemplates) {
  "use strict";

  if (!core) {
    throw new Error("PlatinumPatcherCore failed to load for modern-status patches.");
  }
  if (!assembler || !asmTemplates) {
    throw new Error("armips assembler failed to load for modern-status patches.");
  }

  const {
    PatchError,
    OVERLAY_16,
    hex,
    bytesFromHex,
    bytesEqual,
    writeU32,
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
    replaceRomFileAllowGrowth,
    narcMemberBytes,
    replaceMessageBankEntries,
    asciiBytes,
    SyntheticOverlayAllocator,
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

  function thumbBranch(fromAddress, toAddress) {
    const offset = toAddress - (fromAddress + 4);
    if (offset % 2 !== 0 || offset < -2048 || offset > 2046) {
      throw new PatchError(`Cannot encode Thumb branch from ${hex(fromAddress)} to ${hex(toAddress)}.`);
    }
    return thumbInst16(0xe000 | ((offset >> 1) & 0x7ff));
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
  const MODERN_PARALYSIS_AI_MARKER = "modern_para_ai_v1";
  const MODERN_PARALYSIS_AI_HELPER_SIZE = 0x50;
  const MODERN_PARALYSIS_AI_THUNDER_WAVE_ORIGINAL = bytesFromHex(`
    29 00 00 00 00 00 00 00
    13 00 00 00 4e 00 00 00 3d 05 00 00
    13 00 00 00 0a 00 00 00 3a 05 00 00
  `);
  const AI_CMD_IF_LOADED_EQUAL_TO = 19;
  const AI_CMD_LOAD_TYPE_FROM = 30;
  const AI_CMD_LOAD_BATTLER_ABILITY = 41;
  const AI_CMD_GO_TO = 76;
  const AI_BATTLER_DEFENDER = 0;
  const AI_LOAD_DEFENDER_TYPE_1 = 0;
  const AI_LOAD_DEFENDER_TYPE_2 = 2;
  const AI_TYPE_ELECTRIC = 13;
  const AI_ABILITY_MOTOR_DRIVE = 78;
  const AI_ABILITY_VOLT_ABSORB = 10;

  function aiWord(value) {
    const normalized = value >>> 0;
    return [normalized & 0xff, (normalized >> 8) & 0xff, (normalized >> 16) & 0xff, normalized >> 24];
  }

  function aiReadS32(data, offset) {
    return (data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16) | (data[offset + 3] << 24)) | 0;
  }

  function aiBranchOffset(fromOperandOffset, targetOffset) {
    const distance = targetOffset - fromOperandOffset;
    if (distance % 4 !== 0) {
      throw new PatchError(
        `Cannot encode trainer AI branch from member ${hex(fromOperandOffset)} to ${hex(targetOffset)}.`
      );
    }
    return distance / 4 - 1;
  }

  function aiCommand(opcode, ...args) {
    return args.reduce((bytes, arg) => bytes.concat(aiWord(arg)), aiWord(opcode));
  }

  function aiGoTo(commandOffset, targetOffset) {
    return aiCommand(AI_CMD_GO_TO, aiBranchOffset(commandOffset + 4, targetOffset));
  }

  function aiIfLoadedEqualTo(commandOffset, value, targetOffset) {
    return aiCommand(AI_CMD_IF_LOADED_EQUAL_TO, value, aiBranchOffset(commandOffset + 8, targetOffset));
  }

  function aiBranchTarget(fromOperandOffset, branchValue) {
    return fromOperandOffset + (branchValue + 1) * 4;
  }

  function buildModernParalysisAiHelper(helperOffset, scoreMinus10Offset, resumeOffset) {
    let cursor = helperOffset;
    const parts = [];
    function push(bytes) {
      parts.push(bytes);
      cursor += bytes.length;
    }

    push(aiCommand(AI_CMD_LOAD_TYPE_FROM, AI_LOAD_DEFENDER_TYPE_1));
    push(aiIfLoadedEqualTo(cursor, AI_TYPE_ELECTRIC, scoreMinus10Offset));
    push(aiCommand(AI_CMD_LOAD_TYPE_FROM, AI_LOAD_DEFENDER_TYPE_2));
    push(aiIfLoadedEqualTo(cursor, AI_TYPE_ELECTRIC, scoreMinus10Offset));
    push(aiCommand(AI_CMD_LOAD_BATTLER_ABILITY, AI_BATTLER_DEFENDER));
    push(aiIfLoadedEqualTo(cursor, AI_ABILITY_MOTOR_DRIVE, scoreMinus10Offset));
    push(aiIfLoadedEqualTo(cursor, AI_ABILITY_VOLT_ABSORB, scoreMinus10Offset));
    push(aiGoTo(cursor, resumeOffset));

    const helper = new Uint8Array(cursor - helperOffset);
    let out = 0;
    for (const part of parts) {
      helper.set(part, out);
      out += part.length;
    }
    if (helper.length !== MODERN_PARALYSIS_AI_HELPER_SIZE) {
      throw new PatchError(
        `Modern paralysis trainer AI helper size changed to ${hex(helper.length)}; update the marker locator.`
      );
    }
    return helper;
  }

  function patchModernParalysisAi(rom, force, log) {
    const file = findFileByPath(rom, TRAINER_AI_SEQ_PATH);
    const narc = rom.slice(file.start, file.end);
    const member = narcMemberBytes(narc, 0);
    const marker = asciiBytes(MODERN_PARALYSIS_AI_MARKER);
    const existingMarkers = findNeedle(member, marker, 0, member.length);
    const originalHits = findNeedle(
      member,
      MODERN_PARALYSIS_AI_THUNDER_WAVE_ORIGINAL,
      0,
      member.length
    );

    let patchAt = originalHits.length === 1 ? originalHits[0] : -1;
    let helperOffset = -1;
    if (existingMarkers.length) {
      helperOffset = existingMarkers[existingMarkers.length - 1] - MODERN_PARALYSIS_AI_HELPER_SIZE;
      if (helperOffset < 0) {
        throw new PatchError("Modern paralysis trainer AI marker is too close to the start of the member.");
      }
      for (let offset = 0; offset <= member.length - 8; offset += 4) {
        if (bytesEqual(member, offset, aiGoTo(offset, helperOffset))) {
          patchAt = offset;
          break;
        }
      }
    }

    if (patchAt < 0) {
      if (originalHits.length > 1) {
        throw new PatchError(
          `Modern paralysis trainer AI Thunder Wave block matched multiple locations: ${originalHits
            .map((offset) => `${TRAINER_AI_SEQ_PATH} member 0+${hex(offset)}`)
            .join(", ")}.`
        );
      }
      throw new PatchError("Modern paralysis trainer AI Thunder Wave block was not found.");
    }

    const resumeOffset = patchAt + MODERN_PARALYSIS_AI_THUNDER_WAVE_ORIGINAL.length;
    const scoreMinus10Offset = existingMarkers.length
      ? aiBranchTarget(helperOffset + 16, aiReadS32(member, helperOffset + 16))
      : aiBranchTarget(patchAt + 28, aiReadS32(member, patchAt + 28));
    const patchedMember = new Uint8Array(
      existingMarkers.length ? member : member.length + MODERN_PARALYSIS_AI_HELPER_SIZE + marker.length
    );
    patchedMember.set(member);

    if (!existingMarkers.length) {
      helperOffset = member.length;
      const helper = buildModernParalysisAiHelper(helperOffset, scoreMinus10Offset, resumeOffset);
      patchedMember.set(helper, helperOffset);
      patchedMember.set(marker, helperOffset + helper.length);
    }

    const patchedBranch = aiGoTo(patchAt, helperOffset);
    if (!bytesEqual(patchedMember, patchAt, patchedBranch)) {
      patchedMember.set(patchedBranch, patchAt);
      patchedMember.fill(0x00, patchAt + patchedBranch.length, patchAt + MODERN_PARALYSIS_AI_THUNDER_WAVE_ORIGINAL.length);
    }

    if (bytesEqual(member, 0, patchedMember)) {
      log.push("Modern paralysis trainer AI: already patched.");
      return { rom, state: "already", growth: 0 };
    }

    const patchedNarc = replaceNarcMembers(narc, [[0, patchedMember]]);
    const result = replaceRomFileAllowGrowth(rom, file, patchedNarc, "Modern paralysis trainer AI");
    log.push(
      `Modern paralysis trainer AI: Thunder Wave scores like a failed status move against Electric-type targets in ${TRAINER_AI_SEQ_PATH} member 0+${hex(
        patchAt
      )}; helper at member 0+${hex(helperOffset)}${result.growth ? ` (ROM grew by ${result.growth} byte(s))` : ""}.`
    );
    return result;
  }

  async function assembleModernStatusHelper(label, source) {
    try {
      return await assembler.assembleArmips({ source });
    } catch (error) {
      throw new PatchError(`${label} armips helper assembly failed: ${error.message}`);
    }
  }

  async function buildModernParalysisThunderWaveHelper(helperAddress) {
    return assembleModernStatusHelper(
      "Modern paralysis Thunder Wave",
      asmTemplates.modernParalysisThunderWaveHelper({ helperAddress })
    );
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

  async function patchModernParalysis(rom, force, log) {
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

    const thunderWaveHelper = await buildModernParalysisThunderWaveHelper(
      MODERN_PARALYSIS_THUNDER_WAVE_HELPER_RAM
    );
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
    const aiResult = patchModernParalysisAi(rom, force, log);
    rom = aiResult.rom;

    if (
      chanceState === "already" &&
      speedSites.every((site) => site.state === "already") &&
      thunderWaveHelperState === "already" &&
      hookState === "original" &&
      thunderWaveHookState === "already" &&
      aiResult.state === "already"
    ) {
      log.push("Modern paralysis: already patched.");
      return rom;
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
    return rom;
  }

  const MODERN_BURN_HOOK_REL = 0x1fb0e;
  const MODERN_BURN_ORIGINAL = bytesFromHex(`
    12 98 10 21 08 42 06 d0 3e 2f 04 d0 21 98 c1 0f
    41 18 48 10 21 90
  `);
  const MODERN_BURN_HELPER_RAM = 0x020f3168;
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

  async function buildModernBurnHelper(helperAddress) {
    return assembleModernStatusHelper(
      "Modern burn",
      asmTemplates.modernBurnHelper({ helperAddress })
    );
  }

  async function patchModernBurn(rom, force, log) {
    const overlay = getOverlayRange(rom, OVERLAY_16);
    const burnDamage = locateBattleSubSeqPatch(
      rom,
      MODERN_BURN_DAMAGE_ORIGINAL,
      MODERN_BURN_DAMAGE_PATCHED,
      "Modern burn residual damage divisor"
    );
    const helper = await buildModernBurnHelper(MODERN_BURN_HELPER_RAM);
    const helperAt = arm9Offset(rom, MODERN_BURN_HELPER_RAM, helper.length);
    const helperExpected = new Uint8Array(helper.length).fill(0x00);
    const helperState = requireBytes(
      rom,
      helperAt,
      helperExpected,
      helper,
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
      writeBytes(rom, helperAt, helper);
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

  async function buildModernSleepHelper(helperAddress) {
    return assembleModernStatusHelper(
      "Modern sleep",
      asmTemplates.modernSleepHelper({
        helperAddress,
        battleSystemRandNextAddress: BATTLE_SYSTEM_RAND_NEXT_RAM,
      })
    );
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

  async function patchModernSleep(rom, force, log) {
    const sleepDuration = locateBattleSubSeqPatch(
      rom,
      MODERN_SLEEP_DURATION_ORIGINAL,
      MODERN_SLEEP_DURATION_PATCHED,
      "Modern sleep battle-script duration command"
    );

    const helper = await buildModernSleepHelper(MODERN_SLEEP_HELPER_RAM);
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

  async function buildModernFreezeHelper(helperAddress) {
    return assembleModernStatusHelper(
      "Modern freeze",
      asmTemplates.modernFreezeHelper({
        helperAddress,
        battleSystemRandNextAddress: BATTLE_SYSTEM_RAND_NEXT_RAM,
      })
    );
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

  async function patchModernFreeze(rom, force, log) {
    const preferredHelper = await buildModernFreezeHelper(MODERN_FREEZE_HELPER_RAM);
    let { helperAt, helperRamAddress, helperUsedFallback } = resolveModernFreezeHelperCave(rom, preferredHelper);
    let helper = helperRamAddress === MODERN_FREEZE_HELPER_RAM
      ? preferredHelper
      : await buildModernFreezeHelper(helperRamAddress);
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

  const FROSTBITE_MARKER_TEXT = "FROSTBITEV1";
  const FROSTBITE_MARKER = asciiBytes(`${FROSTBITE_MARKER_TEXT}\0\0\0\0\0`);
  const FROSTBITE_FREEZE_ACTION_REL = 0x137d6;
  const FROSTBITE_FREEZE_ACTION_ORIGINAL = bytesFromHex(`
    61 6e c0 20 48 43 21 18 69 48 09 58 20 20 08 42 25 d0
  `);
  const FROSTBITE_FREEZE_ACTION_PATCHED = bytesFromHex(`
    61 6e c0 20 48 43 21 18 69 48 09 58 20 20 08 42 25 e0
  `);
  const FROSTBITE_LEGACY_RESIDUAL_CALL_REL = 0x146c2;
  const FROSTBITE_BURN_CASE_REL = 0x1216c;
  const FROSTBITE_BURN_CASE_CONTINUE_REL = 0x121a0;
  const FROSTBITE_BURN_CASE_ORIGINAL = bytesFromHex("c0 20 29 1c 41 43");
  const FROSTBITE_SPECIAL_DAMAGE_REL = 0x1fbf0;
  const FROSTBITE_SPECIAL_DAMAGE_ORIGINAL = bytesFromHex("21 90 03 98 02 21 08 42 25 d0");
  const FROSTBITE_SNOW_PROBABILISTIC_CHANCE_REL = 0x186da;
  const FROSTBITE_SNOW_PROBABILISTIC_CHANCE_ORIGINAL = bytesFromHex("00 2e 01 d1 cf f5 a9 f8");
  const FROSTBITE_SNOW_INDIRECT_CHANCE_REL = 0x18764;
  const FROSTBITE_SNOW_INDIRECT_CHANCE_ORIGINAL = bytesFromHex("00 2f 01 d1 cf f5 64 f8");
  const FROSTBITE_SCRIPT_CHANCE_REL = 0xcd0e;
  const FROSTBITE_SCRIPT_CHANCE_ORIGINAL = bytesFromHex("00 2c 01 d1 da f5 8f fd");
  const FROSTBITE_FREEZE_OR_FLINCH_MEMBER = 249;
  const FROSTBITE_FREEZE_OR_FLINCH_ORIGINAL = bytesFromHex(`
    b5 00 00 00 02 00 00 00 3c 00 00 00 1f 00 00 00
    b5 00 00 00 02 00 00 00 3c 00 00 00 0e 00 00 00
    de 00 00 00
  `);
  const FROSTBITE_FREEZE_OR_FLINCH_PATCHED = bytesFromHex(`
    b5 00 00 00 02 00 00 80 3c 00 00 00 1f 00 00 00
    b5 00 00 00 02 00 00 00 3c 00 00 00 0e 00 00 00
    de 00 00 00
  `);
  const FROSTBITE_MODERN_SNOW_HAIL_CHIP_REL = 0xa1ec;
  const FROSTBITE_MODERN_SNOW_HAIL_CHIP_PATCHED = bytesFromHex(`
    51 28 0e e0 43 49 08 1c 22 30 29 50 40 48 a9 19
    09 58 00 20 c0 43 48 43 10 21
  `);
  const FROSTBITE_BURN_RESIDUAL_RAM = 0x0224ee88;
  const FROSTBITE_PREPARE_SUBSCRIPT_RAM = 0x02251e1c;
  const FROSTBITE_FROZEN_SUBSCRIPT_ID = 28;
  const FROSTBITE_SUBSCRIPT_MEMBER = 28;
  const FROSTBITE_BATTLE_STRINGS_MEMBER = 368;
  const FROSTBITE_SPECIAL_DAMAGE_HELPER_OFFSET = 0x100;
  const FROSTBITE_SNOW_PROBABILISTIC_HELPER_OFFSET = 0x160;
  const FROSTBITE_SNOW_INDIRECT_HELPER_OFFSET = 0x1b0;
  const FROSTBITE_SNOW_SCRIPT_HELPER_OFFSET = 0x200;
  const BATTLE_ANIMATION_FROZEN = 4;
  const BATTLE_STRING_POKEMON_IS_HURT_BY_FROSTBITE = 111;
  const FROSTBITE_BURN_SCRIPT_DIVISOR_ORIGINAL = bytesFromHex("55 00 00 00 20 00 00 00 08 00 00 00");
  const FROSTBITE_BURN_SCRIPT_DIVISOR_MODERN = bytesFromHex("55 00 00 00 20 00 00 00 10 00 00 00");
  const FROSTBITE_HEATPROOF_DIVISOR = bytesFromHex("55 00 00 00 20 00 00 00 02 00 00 00");
  const FROSTBITE_PRINT_BURN_MESSAGE = bytesFromHex("12 00 00 00 5f 00 00 00 02 00 00 00 ff 00 00 00");
  const FROSTBITE_PLAY_BURN_ANIMATION = bytesFromHex("45 00 00 00 ff 00 00 00 03 00 00 00");

  function writeScriptWord(data, offset, value) {
    writeU32(data, offset, value >>> 0);
  }

  function replaceOneScriptOperand(data, original, label, patchOffset, value) {
    const hits = findNeedle(data, original, 0, data.length);
    if (hits.length !== 1) {
      throw new PatchError(`${label} matched ${hits.length} locations while building Frostbite residual script.`);
    }
    writeScriptWord(data, hits[0] + patchOffset, value);
    return hits[0];
  }

  function isModernBurnDamageActive(rom) {
    const file = findFileByPath(rom, BATTLE_SUB_SEQ_PATH);
    const member = rom.slice(file.start, file.end);
    const patched = findNeedle(member, MODERN_BURN_DAMAGE_PATCHED, 0, member.length);
    if (patched.length > 1) {
      throw new PatchError(
        `Frostbite Modern Burn detector matched multiple patched burn residual scripts: ${patched
          .map((offset) => `${hex(file.start + offset)}`)
          .join(", ")}.`
      );
    }
    return patched.length === 1;
  }

  function buildFrostbiteSubscript(burnSubscript, divisor) {
    const script = new Uint8Array(burnSubscript);
    const firstDivisor =
      divisor === 16 ? FROSTBITE_BURN_SCRIPT_DIVISOR_ORIGINAL : FROSTBITE_BURN_SCRIPT_DIVISOR_MODERN;
    const firstFallback =
      divisor === 16 ? FROSTBITE_BURN_SCRIPT_DIVISOR_MODERN : FROSTBITE_BURN_SCRIPT_DIVISOR_ORIGINAL;
    let firstHits = findNeedle(script, firstDivisor, 0, script.length);
    if (firstHits.length !== 1) {
      firstHits = findNeedle(script, firstFallback, 0, script.length);
    }
    if (firstHits.length !== 1) {
      throw new PatchError("Frostbite could not identify the residual-damage divisor in subscript_burn_damage.");
    }
    writeScriptWord(script, firstHits[0] + 8, divisor);

    replaceOneScriptOperand(
      script,
      FROSTBITE_HEATPROOF_DIVISOR,
      "Frostbite Heatproof divisor",
      8,
      1
    );
    replaceOneScriptOperand(
      script,
      FROSTBITE_PRINT_BURN_MESSAGE,
      "Frostbite residual message",
      4,
      BATTLE_STRING_POKEMON_IS_HURT_BY_FROSTBITE
    );
    replaceOneScriptOperand(
      script,
      FROSTBITE_PLAY_BURN_ANIMATION,
      "Frostbite residual animation",
      8,
      BATTLE_ANIMATION_FROZEN
    );
    return script;
  }

  async function buildFrostbitePayload(payloadAddress) {
    const helperAddress = payloadAddress + FROSTBITE_MARKER.length;
    const specialDamageAddress = helperAddress + FROSTBITE_SPECIAL_DAMAGE_HELPER_OFFSET;
    const snowChanceProbabilisticAddress = helperAddress + FROSTBITE_SNOW_PROBABILISTIC_HELPER_OFFSET;
    const snowChanceIndirectAddress = helperAddress + FROSTBITE_SNOW_INDIRECT_HELPER_OFFSET;
    const snowChanceScriptAddress = helperAddress + FROSTBITE_SNOW_SCRIPT_HELPER_OFFSET;
    const helper = await assembleModernStatusHelper(
      "Frostbite",
      asmTemplates.frostbiteHelper({
        helperAddress,
        specialDamageAddress,
        snowChanceProbabilisticAddress,
        snowChanceIndirectAddress,
        snowChanceScriptAddress,
        originalBurnResidualAddress: FROSTBITE_BURN_RESIDUAL_RAM,
        prepareSubscriptAddress: FROSTBITE_PREPARE_SUBSCRIPT_RAM,
        frozenSubscriptId: FROSTBITE_FROZEN_SUBSCRIPT_ID,
      })
    );
    const bytes = new Uint8Array(FROSTBITE_MARKER.length + helper.length);
    bytes.set(FROSTBITE_MARKER);
    bytes.set(helper, FROSTBITE_MARKER.length);
    return {
      bytes,
      residualAddress: helperAddress,
      specialDamageAddress,
      snowChanceProbabilisticAddress,
      snowChanceIndirectAddress,
      snowChanceScriptAddress,
    };
  }

  function frostbiteBurnCaseHook(fromAddress, continueAddress, helperAddress) {
    const context = new Uint8Array(6);
    context.set(thumbBl(fromAddress, helperAddress), 0);
    context.set(thumbBranch(fromAddress + 4, continueAddress), 4);
    return context;
  }

  function frostbiteSpecialDamageContext(fromAddress, helperAddress) {
    const context = new Uint8Array(FROSTBITE_SPECIAL_DAMAGE_ORIGINAL);
    context.set(thumbBl(fromAddress, helperAddress), 0);
    return context;
  }

  function frostbiteChanceContext(originalBytes, fromAddress, helperAddress) {
    const context = new Uint8Array(originalBytes);
    context.set(thumbBl(fromAddress, helperAddress), 0);
    context[4] = 0x00;
    context[5] = 0xe0;
    context[6] = 0xc0;
    context[7] = 0x46;
    return context;
  }

  function isModernSnowActive(rom, overlay) {
    const preferred = overlay.start + FROSTBITE_MODERN_SNOW_HAIL_CHIP_REL;
    if (bytesEqual(rom, preferred, FROSTBITE_MODERN_SNOW_HAIL_CHIP_PATCHED)) {
      return true;
    }
    const overlayBytes = rom.slice(overlay.start, overlay.end);
    const hits = findNeedle(
      overlayBytes,
      FROSTBITE_MODERN_SNOW_HAIL_CHIP_PATCHED,
      0,
      overlayBytes.length
    );
    if (hits.length > 1) {
      throw new PatchError(
        `Frostbite Modern Snow detector matched multiple hail chip edits: ${hits
          .map((offset) => `overlay 16+${hex(offset)}`)
          .join(", ")}.`
      );
    }
    return hits.length === 1;
  }

  function patchFrostbiteFreezeOrFlinchSubscript(rom, force, log) {
    const file = findFileByPath(rom, BATTLE_SUB_SEQ_PATH);
    const narc = rom.slice(file.start, file.end);
    const member = narcMemberBytes(narc, FROSTBITE_FREEZE_OR_FLINCH_MEMBER);

    if (bytesEqual(member, 0, FROSTBITE_FREEZE_OR_FLINCH_PATCHED)) {
      return { rom, already: true };
    }
    if (!force && !bytesEqual(member, 0, FROSTBITE_FREEZE_OR_FLINCH_ORIGINAL)) {
      throw new PatchError(
        "Frostbite snow integration expected vanilla subscript_freeze_or_flinch. Enable compatible modified bytes to patch anyway."
      );
    }

    const patchedNarc = replaceNarcMembers(narc, [
      [FROSTBITE_FREEZE_OR_FLINCH_MEMBER, FROSTBITE_FREEZE_OR_FLINCH_PATCHED],
    ]);
    const result = replaceRomFileAllowGrowth(rom, file, patchedNarc, "Frostbite freeze-or-flinch snow marker");
    log.push(
      `Frostbite snow integration: marked the freeze half of subscript_freeze_or_flinch${
        result.growth ? `; ROM grew by ${result.growth} byte(s)` : ""
      }.`
    );
    return { rom: result.rom, already: false };
  }

  function patchFrostbiteSnowChanceIntegration(rom, force, log, overlay, built) {
    const markerResult = patchFrostbiteFreezeOrFlinchSubscript(rom, force, log);
    rom = markerResult.rom;

    const probabilisticAt = overlay.start + FROSTBITE_SNOW_PROBABILISTIC_CHANCE_REL;
    const probabilisticRam = overlay.loadAddress + FROSTBITE_SNOW_PROBABILISTIC_CHANCE_REL;
    const probabilisticPatched = frostbiteChanceContext(
      FROSTBITE_SNOW_PROBABILISTIC_CHANCE_ORIGINAL,
      probabilisticRam,
      built.snowChanceProbabilisticAddress
    );
    const probabilisticState = requireBytes(
      rom,
      probabilisticAt,
      FROSTBITE_SNOW_PROBABILISTIC_CHANCE_ORIGINAL,
      probabilisticPatched,
      force,
      "Frostbite snow probabilistic chance hook"
    );

    const indirectAt = overlay.start + FROSTBITE_SNOW_INDIRECT_CHANCE_REL;
    const indirectRam = overlay.loadAddress + FROSTBITE_SNOW_INDIRECT_CHANCE_REL;
    const indirectPatched = frostbiteChanceContext(
      FROSTBITE_SNOW_INDIRECT_CHANCE_ORIGINAL,
      indirectRam,
      built.snowChanceIndirectAddress
    );
    const indirectState = requireBytes(
      rom,
      indirectAt,
      FROSTBITE_SNOW_INDIRECT_CHANCE_ORIGINAL,
      indirectPatched,
      force,
      "Frostbite snow indirect chance hook"
    );

    const scriptAt = overlay.start + FROSTBITE_SCRIPT_CHANCE_REL;
    const scriptRam = overlay.loadAddress + FROSTBITE_SCRIPT_CHANCE_REL;
    const scriptPatched = frostbiteChanceContext(
      FROSTBITE_SCRIPT_CHANCE_ORIGINAL,
      scriptRam,
      built.snowChanceScriptAddress
    );
    const scriptState = requireBytes(
      rom,
      scriptAt,
      FROSTBITE_SCRIPT_CHANCE_ORIGINAL,
      scriptPatched,
      force,
      "Frostbite snow script chance hook"
    );

    if (probabilisticState !== "already") {
      writeBytes(rom, probabilisticAt, probabilisticPatched);
    }
    if (indirectState !== "already") {
      writeBytes(rom, indirectAt, indirectPatched);
    }
    if (scriptState !== "already") {
      writeBytes(rom, scriptAt, scriptPatched);
    }

    if (
      markerResult.already &&
      probabilisticState === "already" &&
      indirectState === "already" &&
      scriptState === "already"
    ) {
      log.push("Frostbite snow integration: already patched.");
      return rom;
    }

    log.push(
      `Frostbite snow integration: doubled freeze/Frostbite chance under hail/snow at overlay 16+${hex(
        probabilisticAt - overlay.start
      )}, overlay 16+${hex(indirectAt - overlay.start)}, and overlay 16+${hex(scriptAt - overlay.start)}.`
    );
    return rom;
  }

  function patchFrostbiteBattleText(rom, log) {
    const file = findFileByPath(rom, "msgdata/pl_msg.narc");
    const narc = rom.slice(file.start, file.end);
    const bank = narcMemberBytes(narc, FROSTBITE_BATTLE_STRINGS_MEMBER);
    const patchedBank = replaceMessageBankEntries(
      bank,
      [
        [101, "{STRVAR_1 1, 0, 0} was\nfrostbitten!"],
        [102, "The wild {STRVAR_1 1, 0, 0} was\nfrostbitten!"],
        [103, "The foe's {STRVAR_1 1, 0, 0} was\nfrostbitten!"],
        [111, "{STRVAR_1 1, 0, 0} is hurt\nby its frostbite!"],
        [112, "The wild {STRVAR_1 1, 0, 0} is hurt\nby its frostbite!"],
        [113, "The foe's {STRVAR_1 1, 0, 0} is hurt\nby its frostbite!"],
      ],
      { label: "Frostbite battle text" }
    );
    if (bytesEqual(bank, 0, patchedBank)) {
      log.push("Frostbite battle text: already patched.");
      return rom;
    }
    const patchedNarc = replaceNarcMembers(narc, [[FROSTBITE_BATTLE_STRINGS_MEMBER, patchedBank]]);
    const result = replaceRomFileAllowGrowth(rom, file, patchedNarc, "Frostbite battle text");
    log.push(
      `Frostbite battle text: patched msgdata/pl_msg.narc member ${FROSTBITE_BATTLE_STRINGS_MEMBER} entries 101-103 and 111-113${
        result.growth ? `; ROM grew by ${result.growth} byte(s)` : ""
      }.`
    );
    return result.rom;
  }

  function patchFrostbiteSubscript(rom, force, divisor, log) {
    const file = findFileByPath(rom, BATTLE_SUB_SEQ_PATH);
    const narc = rom.slice(file.start, file.end);
    const burnSubscript = narcMemberBytes(narc, 26);
    const frozenSubscript = narcMemberBytes(narc, FROSTBITE_SUBSCRIPT_MEMBER);
    const patchedSubscript = buildFrostbiteSubscript(burnSubscript, divisor);

    if (bytesEqual(frozenSubscript, 0, patchedSubscript)) {
      log.push(`Frostbite residual script: already patched at 1/${divisor} max HP.`);
      return rom;
    }
    const vanillaFrozen = bytesFromHex(`
      12 00 00 00 6f 00 00 00 02 00 00 00 01 00 00 00
      0e 00 00 00 1e 00 00 00 1e 00 00 00 45 00 00 00
      01 00 00 00 04 00 00 00 0e 00 00 00 de 00 00 00
    `);
    if (!force && !bytesEqual(frozenSubscript, 0, vanillaFrozen)) {
      throw new PatchError(
        "Frostbite residual script expected vanilla subscript_frozen. Enable compatible modified bytes to patch anyway."
      );
    }
    const patchedNarc = replaceNarcMembers(narc, [[FROSTBITE_SUBSCRIPT_MEMBER, patchedSubscript]]);
    const result = replaceRomFileAllowGrowth(rom, file, patchedNarc, "Frostbite residual script");
    log.push(
      `Frostbite residual script: replaced subscript_frozen with Magic Guard-aware 1/${divisor} max-HP chip${
        result.growth ? `; ROM grew by ${result.growth} byte(s)` : ""
      }.`
    );
    return result.rom;
  }

  async function patchFrostbite(rom, force, log, options = {}) {
    if (options && options._selectedPatchIds && options._selectedPatchIds.includes("modernFreeze")) {
      throw new PatchError("Frostbite replaces freeze behavior and cannot be combined with Modern Freeze.");
    }
    const overlay = getOverlayRange(rom, OVERLAY_16);
    if (isModernFreezeHookActive(rom, overlay)) {
      throw new PatchError("Frostbite cannot be applied to a ROM that already has Modern Freeze installed.");
    }

    const modernBurnActive =
      Boolean(options && options._selectedPatchIds && options._selectedPatchIds.includes("modernBurn")) ||
      isModernBurnDamageActive(rom);
    const modernSnowActive =
      Boolean(options && options._selectedPatchIds && options._selectedPatchIds.includes("modernSnow")) ||
      isModernSnowActive(rom, overlay);
    const divisor = modernBurnActive ? 16 : 8;
    rom = patchFrostbiteSubscript(rom, force, divisor, log);
    rom = patchFrostbiteBattleText(rom, log);

    const allocator = new SyntheticOverlayAllocator(rom, log);
    const allocation = await allocator.allocateAsync({
      marker: FROSTBITE_MARKER_TEXT,
      buildPayload: buildFrostbitePayload,
      label: "Frostbite",
      alignment: 0x10,
      updateExisting: true,
    });

    const actionLocated = locateNearby(
      rom,
      overlay.start + FROSTBITE_FREEZE_ACTION_REL,
      FROSTBITE_FREEZE_ACTION_ORIGINAL,
      FROSTBITE_FREEZE_ACTION_PATCHED,
      0x100,
      "Frostbite action gate"
    );
    const actionState = requireBytes(
      rom,
      actionLocated.offset,
      FROSTBITE_FREEZE_ACTION_ORIGINAL,
      FROSTBITE_FREEZE_ACTION_PATCHED,
      force,
      "Frostbite action gate"
    );

    const legacyResidualAt = overlay.start + FROSTBITE_LEGACY_RESIDUAL_CALL_REL;
    const legacyResidualRam = overlay.loadAddress + FROSTBITE_LEGACY_RESIDUAL_CALL_REL;
    const legacyResidualOriginal = new Uint8Array(thumbBl(legacyResidualRam, FROSTBITE_BURN_RESIDUAL_RAM));
    const legacyResidualPatched = new Uint8Array(thumbBl(legacyResidualRam, allocation.built.residualAddress));
    let legacyResidualState = "clean";
    if (bytesEqual(rom, legacyResidualAt, legacyResidualPatched)) {
      writeBytes(rom, legacyResidualAt, legacyResidualOriginal);
      legacyResidualState = "restored";
    } else if (!bytesEqual(rom, legacyResidualAt, legacyResidualOriginal) && !force) {
      throw new PatchError("Frostbite legacy residual hook site is not in a recognized state.");
    }

    const residualAt = overlay.start + FROSTBITE_BURN_CASE_REL;
    const residualRam = overlay.loadAddress + FROSTBITE_BURN_CASE_REL;
    const residualContinueRam = overlay.loadAddress + FROSTBITE_BURN_CASE_CONTINUE_REL;
    const residualPatched = frostbiteBurnCaseHook(residualRam, residualContinueRam, allocation.built.residualAddress);
    const residualState = requireBytes(
      rom,
      residualAt,
      FROSTBITE_BURN_CASE_ORIGINAL,
      residualPatched,
      force,
      "Frostbite turn-end residual hook"
    );

    const specialAt = overlay.start + FROSTBITE_SPECIAL_DAMAGE_REL;
    const specialRam = overlay.loadAddress + FROSTBITE_SPECIAL_DAMAGE_REL;
    const specialPatched = frostbiteSpecialDamageContext(specialRam, allocation.built.specialDamageAddress);
    const specialState = requireBytes(
      rom,
      specialAt,
      FROSTBITE_SPECIAL_DAMAGE_ORIGINAL,
      specialPatched,
      force,
      "Frostbite Special damage hook"
    );

    if (actionState !== "already") {
      writeBytes(rom, actionLocated.offset, FROSTBITE_FREEZE_ACTION_PATCHED);
    }
    if (residualState !== "already") {
      writeBytes(rom, residualAt, residualPatched);
    }
    if (specialState !== "already") {
      writeBytes(rom, specialAt, specialPatched);
    }
    if (modernSnowActive) {
      rom = patchFrostbiteSnowChanceIntegration(rom, force, log, overlay, allocation.built);
    }

    if (
      actionState === "already" &&
      residualState === "already" &&
      specialState === "already" &&
      legacyResidualState !== "restored" &&
      !modernSnowActive &&
      allocation.reused
    ) {
      log.push("Frostbite: already patched.");
      return;
    }
    const notes = [];
    if (actionLocated.usedFallback) {
      notes.push("action fallback scan");
    }
    if (legacyResidualState === "restored") {
      notes.push("restored old move-check hook");
    }
    if (modernBurnActive) {
      notes.push("Modern Burn chip divisor");
    }
    if (modernSnowActive) {
      notes.push("Modern Snow freeze chance integration");
    }
    log.push(
      `Frostbite: freeze action blocking skipped at overlay 16+${hex(
        actionLocated.offset - overlay.start + 0x10
      )}; residual check hook at overlay 16+${hex(
        residualAt - overlay.start
      )}; Special damage hook at overlay 16+${hex(
        specialAt - overlay.start
      )}; helper at synthetic-overlay RAM ${hex(allocation.built.residualAddress)}${
        notes.length ? ` (${notes.join(", ")})` : ""
      }.`
    );
    return rom;
  }

  const MODERN_CONFUSION_HOOK_REL = 0x13a7e;
  const MODERN_CONFUSION_HOOK_ORIGINAL = bytesFromHex(`
    06 98 f0 f7 7c fc 01 21 08 42 09 d0
  `);
  const MODERN_CONFUSION_HELPER_RAM = 0x020f3260;

  async function buildModernConfusionHelper(helperAddress) {
    return assembleModernStatusHelper(
      "Modern confusion",
      asmTemplates.modernConfusionHelper({
        helperAddress,
        battleSystemRandNextAddress: BATTLE_SYSTEM_RAND_NEXT_RAM,
      })
    );
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

  async function patchModernConfusion(rom, force, log) {
    const helper = await buildModernConfusionHelper(MODERN_CONFUSION_HELPER_RAM);
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
    frostbite: patchFrostbite,
    modernConfusion: patchModernConfusion,
  };
});
