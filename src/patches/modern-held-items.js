(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    const assembler = require("../asm/armips-assembler.js");
    const templates = require("../asm/templates.js");
    module.exports = (core, itemExpansionPatches) => factory(core, assembler, templates, itemExpansionPatches);
  } else {
    root.PlatinumPatcherModernHeldItemPatches = factory(
      root.PlatinumPatcherCore,
      root.PlatinumPatcherArmipsAssembler,
      root.PlatinumPatcherAsmTemplates,
      root.PlatinumPatcherItemExpansionPatches
    );
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (
  core,
  assembler,
  asmTemplates,
  itemExpansionPatches
) {
  "use strict";

  if (!core) {
    throw new Error("Modern held-item patches require PlatinumPatcherCore to load first.");
  }
  if (!assembler || !asmTemplates) {
    throw new Error("armips assembler failed to load for modern held-item patches.");
  }

  const {
    DSPRE_SYNTH_OVERLAY_SIZE,
    OVERLAY_16,
    SYNTH_OVERLAY_RAM_BASE,
    PatchError,
    SyntheticOverlayAllocator,
    asciiBytes,
    bytesEqual,
    bytesFromHex,
    findFileByPath,
    findNeedle,
    getOverlayRange,
    hex,
    narcMemberBytes,
    parseNarc,
    readU16,
    readU32,
    replaceMessageBankEntries,
    replaceNarcMembers,
    replaceOrAppendNarcMembers,
    replaceRomFileAllowGrowth,
    requireBytes,
    writeBytes,
    writeU16,
    writeU32,
  } = core;

  const MARKER_TEXT = "MODHELDITEMV2";
  const LEGACY_MARKER_TEXT = "MODHELDITEMV1";
  const MARKER = (() => {
    const out = new Uint8Array(16);
    out.set(asciiBytes(MARKER_TEXT));
    return out;
  })();
  const EVO_NARC_PATH = "poketool/personal/evo.narc";
  const EVOLUTION_RECORD_SIZE = 6;
  const EVOLUTION_RECORD_COUNT = 7;
  const EVOLUTION_DATA_SIZE = EVOLUTION_RECORD_SIZE * EVOLUTION_RECORD_COUNT;
  const EVOLVABLE_TABLE_CAPACITY = 512;
  const HOLD_EFFECT_EVIOLITE = 152;
  const HOLD_EFFECT_LOADED_DICE = 153;
  const HOLD_EFFECT_CLEAR_AMULET = 154;
  const HOLD_EFFECT_ROCKY_HELMET = 155;
  const SYNTHETIC_OVERLAY_OFFSET = 0x12000;
  const SYNTHETIC_OVERLAY_CAPACITY = 0x1000;
  const BATTLE_SUBSCRIPT_NARC_PATH = "battle/skill/sub_seq.narc";
  const HELD_ITEM_RECOIL_SUBSCRIPT_MEMBER = 266;
  const BATTLE_MESSAGE_NARC_PATH = "msgdata/pl_msg.narc";
  const BATTLE_MESSAGE_MEMBER = 368;
  const CLEAR_AMULET_MESSAGE_ID = 1269;

  const ITEM_LOOKUP_REL = 0x1ffbc;
  const ITEM_LOOKUP_ORIGINAL = bytesFromHex("38 b5 05 1c 08 1c 00 21");
  const DAMAGE_DISPATCH_REL = 0x1f658;
  const DAMAGE_DISPATCH_ORIGINAL = bytesFromHex("09 99 08 9a 28 1c 2f 23");
  const MULTI_HIT_REL = 0x718a;
  const MULTI_HIT_ORIGINAL = bytesFromHex("5c 28 01 d1 05 24 0e e0");
  const CLEAR_AMULET_REL = 0x72c0;
  const CLEAR_AMULET_ORIGINAL = bytesFromHex("f8 b5 86 b0 00 90 b5 20");
  const ROCKY_ON_HIT_REL = 0x1d77c;
  const ROCKY_ON_HIT_ORIGINAL = bytesFromHex("f0 b5 83 b0 0d 1c e9 6e");
  const ROCKY_PIVOT_REL = 0x200e8;
  const ROCKY_PIVOT_ORIGINAL = bytesFromHex("f0 b5 85 b0 0d 1c 69 6e");

  const BATTLER_HELD_ITEM_EFFECT_RAM = 0x02258ab8;
  const BATTLER_ABILITY_RAM = 0x02255a4c;
  const BATTLER_SUBSTITUTE_WAS_HIT_RAM = 0x02259ac0;
  const BATTLE_SYSTEM_DIVIDE_RAM = 0x022563f8;
  const BATTLE_SCRIPT_ITER_RAM = 0x02248af0;
  const BATTLE_SCRIPT_READ_RAM = 0x02248ad0;
  const BATTLE_SYSTEM_NICKNAME_TAG_RAM = 0x02255560;

  function thumbAbsoluteBranch(targetAddress) {
    const bytes = new Uint8Array(8);
    writeU16(bytes, 0, 0x4b00);
    writeU16(bytes, 2, 0x4718);
    writeU32(bytes, 4, targetAddress | 1);
    return bytes;
  }

  function syntheticOverlayBranchTarget(data, offset) {
    if (offset < 0 || offset + 8 > data.length || readU32(data, offset) !== 0x47184b00) {
      return 0;
    }
    const target = readU32(data, offset + 4) & ~1;
    if (target < SYNTH_OVERLAY_RAM_BASE || target >= SYNTH_OVERLAY_RAM_BASE + DSPRE_SYNTH_OVERLAY_SIZE) {
      return 0;
    }
    return target;
  }

  function modernHeldItemEntries(rom, options) {
    if (!itemExpansionPatches || typeof itemExpansionPatches.expandedModernHeldItemEntries !== "function") {
      throw new PatchError("Modern Held Items requires the Item Expansion patch module.");
    }
    const entries = itemExpansionPatches.expandedModernHeldItemEntries(rom, {
      ...options,
      modernHeldItemsAutoExpandedItems: true,
    });
    for (const [kind, name] of [
      ["eviolite", "Eviolite"],
      ["loadedDice", "Loaded Dice"],
      ["clearAmulet", "Clear Amulet"],
      ["rockyHelmet", "Rocky Helmet"],
    ]) {
      const matches = entries.filter((entry) => entry.kind === kind);
      if (matches.length !== 1) {
        throw new PatchError(`Modern Held Items expected one ${name} registry row, found ${matches.length}.`);
      }
    }
    return entries;
  }

  function decodeThumbBlTarget(data, offset, instructionAddress, label) {
    const high = readU16(data, offset);
    const low = readU16(data, offset + 2);
    if ((high & 0xf800) !== 0xf000 || (low & 0xf800) !== 0xf800) {
      throw new PatchError(`${label} did not contain the expected THUMB BL instruction.`);
    }
    let displacement = ((high & 0x7ff) << 12) | ((low & 0x7ff) << 1);
    if (displacement & 0x400000) {
      displacement -= 0x800000;
    }
    return (instructionAddress + 4 + displacement) >>> 0;
  }

  function buildEvolvableSpeciesTable(rom) {
    const file = findFileByPath(rom, EVO_NARC_PATH);
    const narc = rom.slice(file.start, file.end);
    const parsed = parseNarc(narc);
    const firstMember = parsed.entries.length ? narcMemberBytes(narc, 0) : new Uint8Array(0);
    if (firstMember.length < EVOLUTION_DATA_SIZE || firstMember.length > EVOLUTION_DATA_SIZE + 2) {
      throw new PatchError("Eviolite could not identify the evolution NARC member format.");
    }
    const evolutionMemberSize = firstMember.length;
    let speciesCount = 0;
    while (speciesCount < parsed.entries.length) {
      const member = narcMemberBytes(narc, speciesCount);
      if (member.length !== evolutionMemberSize) {
        break;
      }
      speciesCount += 1;
    }
    if (!speciesCount) {
      throw new PatchError("Eviolite could not find any standard evolution records in the evolution NARC.");
    }

    if (speciesCount > EVOLVABLE_TABLE_CAPACITY) {
      throw new PatchError(
        `Eviolite found ${speciesCount} evolution records, exceeding its ${EVOLVABLE_TABLE_CAPACITY}-species table.`
      );
    }
    const table = new Uint8Array(EVOLVABLE_TABLE_CAPACITY);
    for (let species = 0; species < speciesCount; species += 1) {
      const member = narcMemberBytes(narc, species);
      for (let index = 0; index < EVOLUTION_RECORD_COUNT; index += 1) {
        const offset = index * EVOLUTION_RECORD_SIZE;
        const method = readU16(member, offset);
        const targetSpecies = readU16(member, offset + 4);
        if (method !== 0 && targetSpecies !== 0) {
          table[species] = 1;
          break;
        }
      }
    }
    return { table, speciesCount };
  }

  function buildRockyHelmetSubscript(baseSubscript) {
    if (baseSubscript.length < 12 || readU32(baseSubscript, baseSubscript.length - 12) !== 202) {
      throw new PatchError("Rocky Helmet could not identify Platinum's held-item recoil subscript.");
    }
    const out = new Uint8Array(baseSubscript.length - 8);
    out.set(baseSubscript.slice(0, baseSubscript.length - 12));
    out.set(baseSubscript.slice(baseSubscript.length - 4), baseSubscript.length - 12);
    return out;
  }

  function installRockyHelmetSubscript(rom, log) {
    const file = findFileByPath(rom, BATTLE_SUBSCRIPT_NARC_PATH);
    const narc = rom.slice(file.start, file.end);
    const parsed = parseNarc(narc);
    const baseSubscript = narcMemberBytes(narc, HELD_ITEM_RECOIL_SUBSCRIPT_MEMBER);
    const rockySubscript = buildRockyHelmetSubscript(baseSubscript);
    for (let memberId = 0; memberId < parsed.entries.length; memberId += 1) {
      const member = narcMemberBytes(narc, memberId);
      if (member.length === rockySubscript.length && bytesEqual(member, 0, rockySubscript)) {
        log.push(`Rocky Helmet: reused persistent recoil battle subscript member ${memberId}.`);
        return { rom, subscriptId: memberId + 1, memberId };
      }
    }
    const memberId = parsed.entries.length;
    const patchedNarc = replaceOrAppendNarcMembers(narc, [[memberId, rockySubscript]]);
    const replacement = replaceRomFileAllowGrowth(rom, file, patchedNarc, "Rocky Helmet recoil subscript");
    log.push(
      `Rocky Helmet: appended persistent recoil battle subscript member ${memberId}${
        replacement.growth ? `; ROM grew by ${replacement.growth} byte(s)` : ""
      }.`
    );
    return { rom: replacement.rom, subscriptId: memberId + 1, memberId };
  }

  function patchClearAmuletBattleMessage(rom, log) {
    const file = findFileByPath(rom, BATTLE_MESSAGE_NARC_PATH);
    const narc = rom.slice(file.start, file.end);
    const bank = narcMemberBytes(narc, BATTLE_MESSAGE_MEMBER);
    const patchedBank = replaceMessageBankEntries(
      bank,
      [[CLEAR_AMULET_MESSAGE_ID, "{STRVAR_1 1, 0, 0}'s {STRVAR_1 8, 1, 0}\nprevents stat loss!"]],
      { label: "Clear Amulet battle message" }
    );
    if (bytesEqual(bank, 0, patchedBank)) {
      log.push("Clear Amulet: battle message already installed.");
      return rom;
    }
    const patchedNarc = replaceNarcMembers(narc, [[BATTLE_MESSAGE_MEMBER, patchedBank]]);
    const replacement = replaceRomFileAllowGrowth(rom, file, patchedNarc, "Clear Amulet battle message");
    log.push(
      `Clear Amulet: added battle message ${CLEAR_AMULET_MESSAGE_ID}${
        replacement.growth ? `; ROM grew by ${replacement.growth} byte(s)` : ""
      }.`
    );
    return replacement.rom;
  }

  async function buildPayload(payloadAddress, entries, evolvableSpecies, hookContext) {
    const helperAddress = payloadAddress + MARKER.length;
    let code;
    try {
      code = await assembler.assembleArmips({
        source: asmTemplates.modernHeldItemsHelper({
          helperAddress,
          itemLookupReturnAddress:
            hookContext.overlay.loadAddress + hookContext.lookupRel + ITEM_LOOKUP_ORIGINAL.length,
          damageReturnAddress: hookContext.overlay.loadAddress + hookContext.damageRel + 8,
          rockyOnHitReturnAddress: hookContext.overlay.loadAddress + hookContext.rockyOnHitRel + 8,
          rockyPivotReturnAddress: hookContext.overlay.loadAddress + hookContext.rockyPivotRel + 8,
          clearAmuletReturnAddress: hookContext.overlay.loadAddress + hookContext.clearAmuletRel + 8,
          battlerHeldItemEffectAddress: BATTLER_HELD_ITEM_EFFECT_RAM,
          battlerAbilityAddress: BATTLER_ABILITY_RAM,
          battlerSubstituteWasHitAddress: BATTLER_SUBSTITUTE_WAS_HIT_RAM,
          battleSystemDivideAddress: BATTLE_SYSTEM_DIVIDE_RAM,
          battleScriptIterAddress: BATTLE_SCRIPT_ITER_RAM,
          battleScriptReadAddress: BATTLE_SCRIPT_READ_RAM,
          battleSystemNicknameTagAddress: BATTLE_SYSTEM_NICKNAME_TAG_RAM,
          entries,
          evolvableSpecies,
          evioliteHoldEffect: HOLD_EFFECT_EVIOLITE,
          loadedDiceHoldEffect: HOLD_EFFECT_LOADED_DICE,
          clearAmuletHoldEffect: HOLD_EFFECT_CLEAR_AMULET,
          rockyHelmetHoldEffect: HOLD_EFFECT_ROCKY_HELMET,
          rockyHelmetSubscript: hookContext.rockyHelmetSubscript,
          clearAmuletMessageId: CLEAR_AMULET_MESSAGE_ID,
          rngAddress: hookContext.rngAddress,
          multiHitRandomAddress: hookContext.overlay.loadAddress + hookContext.multiHitRel + 8,
          multiHitContinueAddress: hookContext.overlay.loadAddress + hookContext.multiHitRel + 0x26,
        }),
      });
    } catch (error) {
      throw new PatchError(`Modern held-item armips helper assembly failed: ${error.message}`);
    }

    const bytes = new Uint8Array(MARKER.length + code.length);
    bytes.set(MARKER);
    bytes.set(code, MARKER.length);
    return {
      bytes,
      lookupAddress: helperAddress,
      damageAddress: helperAddress + 0x100,
      loadedDiceAddress: helperAddress + 0x180,
      tableAddress: helperAddress + 0x200,
      rockyOnHitAddress: helperAddress + 0x280,
      rockyPivotAddress: helperAddress + 0x380,
      clearAmuletAddress: helperAddress + 0x480,
      evolvableTableAddress: helperAddress + 0x600,
    };
  }

  function installHook(rom, offset, original, patched, oldTarget, force, label) {
    let state;
    try {
      state = requireBytes(rom, offset, original, patched, force, label);
    } catch (error) {
      const currentTarget = syntheticOverlayBranchTarget(rom, offset);
      if (!oldTarget || currentTarget !== oldTarget) {
        throw error;
      }
      state = "update";
    }
    if (state !== "already") {
      writeBytes(rom, offset, patched);
    }
    return state;
  }

  function locateHook(rom, overlay, preferredRel, original, oldTarget, label) {
    const preferredOffset = overlay.start + preferredRel;
    if (
      bytesEqual(rom, preferredOffset, original) ||
      (oldTarget && syntheticOverlayBranchTarget(rom, preferredOffset) === oldTarget)
    ) {
      return { offset: preferredOffset, rel: preferredRel, usedFallback: false };
    }

    const start = Math.max(overlay.start, preferredOffset - 0x100);
    const end = Math.min(overlay.end, preferredOffset + 0x100 + original.length);
    const candidates = findNeedle(rom, original, start, end);
    if (oldTarget) {
      for (let offset = start + (start & 1); offset <= end - 8; offset += 2) {
        if (syntheticOverlayBranchTarget(rom, offset) === oldTarget) {
          candidates.push(offset);
        }
      }
    }
    const unique = Array.from(new Set(candidates));
    if (unique.length !== 1) {
      throw new PatchError(
        unique.length
          ? `${label} matched multiple nearby locations: ${unique.map(hex).join(", ")}.`
          : `${label} could not be located near overlay 16+${hex(preferredRel)}.`
      );
    }
    return { offset: unique[0], rel: unique[0] - overlay.start, usedFallback: true };
  }

  async function patchModernHeldItems(rom, force, log, options, rockyHelmetSubscript) {
    const entries = modernHeldItemEntries(rom, options);
    const evolutionInfo = buildEvolvableSpeciesTable(rom);
    const evolvableSpecies = evolutionInfo.table;
    const overlay = getOverlayRange(rom, OVERLAY_16);
    const allocator = new SyntheticOverlayAllocator(rom, log);
    const existingMarkerOffset = allocator.markerOffsets(MARKER_TEXT).slice(-1)[0];
    const legacyMarkerOffset = allocator.markerOffsets(LEGACY_MARKER_TEXT).slice(-1)[0];
    const oldHelperAddress =
      existingMarkerOffset !== undefined
        ? allocator.ramAddress(existingMarkerOffset) + MARKER.length
        : legacyMarkerOffset !== undefined
          ? allocator.ramAddress(legacyMarkerOffset) + MARKER.length
          : 0;
    const lookupLocated = locateHook(
      rom,
      overlay,
      ITEM_LOOKUP_REL,
      ITEM_LOOKUP_ORIGINAL,
      oldHelperAddress,
      "Modern held-item battle item lookup hook"
    );
    const damageLocated = locateHook(
      rom,
      overlay,
      DAMAGE_DISPATCH_REL,
      DAMAGE_DISPATCH_ORIGINAL,
      oldHelperAddress ? oldHelperAddress + 0x100 : 0,
      "Modern held-item damage dispatch hook"
    );
    const multiHitLocated = locateHook(
      rom,
      overlay,
      MULTI_HIT_REL,
      MULTI_HIT_ORIGINAL,
      oldHelperAddress ? oldHelperAddress + 0x180 : 0,
      "Modern held-item multi-hit dispatch hook"
    );
    const rockyOnHitLocated = locateHook(
      rom,
      overlay,
      ROCKY_ON_HIT_REL,
      ROCKY_ON_HIT_ORIGINAL,
      existingMarkerOffset !== undefined ? oldHelperAddress + 0x280 : 0,
      "Rocky Helmet on-hit hook"
    );
    const rockyPivotLocated = locateHook(
      rom,
      overlay,
      ROCKY_PIVOT_REL,
      ROCKY_PIVOT_ORIGINAL,
      existingMarkerOffset !== undefined ? oldHelperAddress + 0x380 : 0,
      "Rocky Helmet pivot hook"
    );
    const clearAmuletLocated = locateHook(
      rom,
      overlay,
      CLEAR_AMULET_REL,
      CLEAR_AMULET_ORIGINAL,
      existingMarkerOffset !== undefined ? oldHelperAddress + 0x480 : 0,
      "Clear Amulet stat-stage hook"
    );
    if (readU16(rom, multiHitLocated.offset + MULTI_HIT_ORIGINAL.length) !== 0x1c30) {
      throw new PatchError("Modern held-item multi-hit hook did not find the expected RNG setup instruction.");
    }
    const rngCallOffset = multiHitLocated.offset + MULTI_HIT_ORIGINAL.length + 2;
    const rngAddress = decodeThumbBlTarget(
      rom,
      rngCallOffset,
      overlay.loadAddress + (rngCallOffset - overlay.start),
      "Modern held-item multi-hit RNG call"
    );
    const hookContext = {
      overlay,
      lookupRel: lookupLocated.rel,
      damageRel: damageLocated.rel,
      multiHitRel: multiHitLocated.rel,
      rockyOnHitRel: rockyOnHitLocated.rel,
      rockyPivotRel: rockyPivotLocated.rel,
      clearAmuletRel: clearAmuletLocated.rel,
      rngAddress,
      rockyHelmetSubscript,
    };
    const allocation = await allocator.allocateAsync({
      marker: MARKER_TEXT,
      buildPayload: (payloadAddress) => buildPayload(payloadAddress, entries, evolvableSpecies, hookContext),
      label: "Modern held items",
      alignment: 0x10,
      updateExisting: true,
      preferredOffset: SYNTHETIC_OVERLAY_OFFSET,
      preferredCapacity: SYNTHETIC_OVERLAY_CAPACITY,
      relocateExisting: true,
    });

    const lookupState = installHook(
      rom,
      lookupLocated.offset,
      ITEM_LOOKUP_ORIGINAL,
      thumbAbsoluteBranch(allocation.built.lookupAddress),
      oldHelperAddress,
      force,
      "Modern held-item battle item lookup hook"
    );
    const damageState = installHook(
      rom,
      damageLocated.offset,
      DAMAGE_DISPATCH_ORIGINAL,
      thumbAbsoluteBranch(allocation.built.damageAddress),
      oldHelperAddress ? oldHelperAddress + 0x100 : 0,
      force,
      "Modern held-item damage dispatch hook"
    );
    const multiHitState = installHook(
      rom,
      multiHitLocated.offset,
      MULTI_HIT_ORIGINAL,
      thumbAbsoluteBranch(allocation.built.loadedDiceAddress),
      oldHelperAddress ? oldHelperAddress + 0x180 : 0,
      force,
      "Modern held-item multi-hit dispatch hook"
    );
    const rockyOnHitState = installHook(
      rom,
      rockyOnHitLocated.offset,
      ROCKY_ON_HIT_ORIGINAL,
      thumbAbsoluteBranch(allocation.built.rockyOnHitAddress),
      existingMarkerOffset !== undefined ? oldHelperAddress + 0x280 : 0,
      force,
      "Rocky Helmet on-hit hook"
    );
    const rockyPivotState = installHook(
      rom,
      rockyPivotLocated.offset,
      ROCKY_PIVOT_ORIGINAL,
      thumbAbsoluteBranch(allocation.built.rockyPivotAddress),
      existingMarkerOffset !== undefined ? oldHelperAddress + 0x380 : 0,
      force,
      "Rocky Helmet pivot hook"
    );
    const clearAmuletState = installHook(
      rom,
      clearAmuletLocated.offset,
      CLEAR_AMULET_ORIGINAL,
      thumbAbsoluteBranch(allocation.built.clearAmuletAddress),
      existingMarkerOffset !== undefined ? oldHelperAddress + 0x480 : 0,
      force,
      "Clear Amulet stat-stage hook"
    );

    const eligibleCount = evolvableSpecies.reduce((sum, value) => sum + value, 0);
    log.push(
      `Modern held items: ${
        lookupState === "already" &&
        damageState === "already" &&
        multiHitState === "already" &&
        rockyOnHitState === "already" &&
        rockyPivotState === "already" &&
        clearAmuletState === "already" &&
        allocation.reused
          ? "already installed"
          : "installed battle lookup, damage, multi-hit, stat-drop, contact-recoil, and pivot hooks"
      }; registry at synthetic-overlay RAM ${hex(allocation.built.tableAddress)}, evolution table at ${hex(
        allocation.built.evolvableTableAddress
      )} (${eligibleCount}/${evolutionInfo.speciesCount} evolution records eligible).`
    );
    if (
      lookupLocated.usedFallback ||
      damageLocated.usedFallback ||
      multiHitLocated.usedFallback ||
      rockyOnHitLocated.usedFallback ||
      rockyPivotLocated.usedFallback ||
      clearAmuletLocated.usedFallback
    ) {
      log.push(
        `Modern held items: used at least one fallback overlay 16 hook scan; resolved lookup +${hex(
          lookupLocated.rel
        )}, damage +${hex(damageLocated.rel)}, multi-hit +${hex(multiHitLocated.rel)}, on-hit +${hex(
          rockyOnHitLocated.rel
        )}, pivot +${hex(rockyPivotLocated.rel)}, and stat-stage +${hex(clearAmuletLocated.rel)}.`
      );
    }
    if (legacyMarkerOffset !== undefined) {
      log.push("Modern held items: migrated MODHELDITEMV1 battle hooks to the bundled MODHELDITEMV2 payload.");
    }
  }

  async function applyModernHeldItems(rom, force, log, options = {}) {
    const entries = modernHeldItemEntries(rom, options);
    let currentRom = patchClearAmuletBattleMessage(rom, log);
    const rockySubscript = installRockyHelmetSubscript(currentRom, log);
    currentRom = rockySubscript.rom;
    await patchModernHeldItems(currentRom, force, log, options, rockySubscript.subscriptId);
    const eviolite = entries.find((entry) => entry.kind === "eviolite");
    const loadedDice = entries.find((entry) => entry.kind === "loadedDice");
    const clearAmulet = entries.find((entry) => entry.kind === "clearAmulet");
    const rockyHelmet = entries.find((entry) => entry.kind === "rockyHelmet");
    log.push(
      `Modern Held Items: configured Eviolite as expanded item ${hex(eviolite.itemId)} with neutral Nugget data and Everstone placeholder graphics; evolvable holders receive 1.5x Defense and Sp. Def.`
    );
    log.push(
      `Modern Held Items: configured Loaded Dice as expanded item ${hex(loadedDice.itemId)} with neutral Nugget data and Metronome placeholder graphics; variable 2-5 hit moves roll 4 or 5 hits.`
    );
    log.push(
      `Modern Held Items: configured Clear Amulet as expanded item ${hex(clearAmulet.itemId)} with Cleanse Tag placeholder graphics; preventable stat reductions caused by opposing Pokemon are blocked.`
    );
    log.push(
      `Modern Held Items: configured Rocky Helmet as expanded item ${hex(rockyHelmet.itemId)} with Hard Stone placeholder graphics; contact attackers lose 1/6 max HP, including on pivot moves.`
    );
    return currentRom;
  }

  return {
    modernHeldItems: applyModernHeldItems,
    buildEvolvableSpeciesTable,
  };
});
