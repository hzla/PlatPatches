(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    const assembler = require("../asm/armips-assembler.js");
    const templates = require("../asm/templates.js");
    module.exports = (core, itemExpansionPatches) => factory(core, assembler, templates, itemExpansionPatches);
  } else {
    root.PlatinumPatcherExtraTmPatches = factory(
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
    throw new Error("Extra TM patches require PlatinumPatcherCore to load first.");
  }
  if (!assembler || !asmTemplates) {
    throw new Error("armips assembler failed to load for Extra TM patches.");
  }

  const {
    PatchError,
    OVERLAY_84,
    DSPRE_SYNTH_OVERLAY_SIZE,
    SYNTH_OVERLAY_RAM_BASE,
    SyntheticOverlayAllocator,
    arm9Offset,
    asciiBytes,
    bytesFromHex,
    findFileByPath,
    findNeedle,
    getOverlayRange,
    hex,
    locateUniquePatch,
    messageBankEntries,
    narcMemberBytes,
    parseNarc,
    readSyntheticOverlayMember,
    readU16,
    readU32,
    requireBytes,
    replaceNarcMembers,
    replaceRomFileAllowGrowth,
    writeBytes,
    writeU16,
    writeU32,
  } = core;

  const MARKER_TEXT = "EXTRATMSV1";
  const MARKER = asciiBytes(`${MARKER_TEXT}\0\0\0\0\0\0`);
  const MAX_EXTRA_TMS = 60;
  const VANILLA_EXTRA_TM_ROWS = 28;
  const PERSONAL_NARC_PATH = "poketool/personal/pl_personal.narc";
  const MESSAGE_NARC_PATH = "msgdata/pl_msg.narc";
  const SPECIES_NAMES_MESSAGE_MEMBER = 412;
  const VANILLA_EXTRA_TM_MASK_4_OFFSET = 0x28;
  const VANILLA_EXTRA_TM_93_120_MASK = 0xfffffff0;

  const S_TMHM_MOVES_ADDRESS = 0x020f0bfc;

  const ITEM_IS_TMHM_RAM = 0x0205e060;
  const ITEM_MOVE_FOR_TMHM_RAM = 0x0207d268;
  const ITEM_TMHM_NUMBER_RAM = 0x0207d2b4;
  const CAN_POKEMON_FORM_LEARN_TM_RAM = 0x02077fe4;
  const BAG_UI_PRINT_TMHM_NUMBER_RAM = 0x0223f8d0;
  const FONT_DRAW_NUMBER_RAM = 0x0200c648;
  const FONT_DRAW_HP_RAM = 0x0200c5bc;
  const BAG_PRINT_ITEM_COUNT_RAM = 0x0223f81c;
  const DRAW_HM_ICON_RAM = 0x0223f9b0;
  const TMHM_RENDERED_POCKET_SIZE = 160;
  const BAG_UI_PRINT_TMHM_NUMBER_ORIGINAL = bytesFromHex("70 b5 84 b0 0e 1c 14 1c");
  const BAG_POCKET_SIZES_ORIGINAL = bytesFromHex("a5 28 0f 64 40 0c 1e 32");
  const BAG_POCKET_SIZES_PATCHED = bytesFromHex("a5 28 0f a0 40 0c 1e 32");
  const BAG_NUMBERED_POCKET_TEXT_X_OFFSET_ORIGINAL = bytesFromHex("01 28 01 d8 23 20 00 e0 00 20 48 75");
  const BAG_NUMBERED_POCKET_TEXT_X_OFFSET_PATCHED = bytesFromHex("01 28 01 d8 2b 20 00 e0 00 20 48 75");
  const BAG_NUMBERED_POCKET_TEXT_X_OFFSET_LEGACY_TM_ONLY = bytesFromHex("00 28 01 d1 2b 20 00 e0 00 20 48 75");

  const HOOK_SITES = [
    {
      label: "Item_IsTMHM",
      ram: ITEM_IS_TMHM_RAM,
      entryKey: "isTmHmAddress",
      original: bytesFromHex("52 21 89 00 88 42 04 d3"),
    },
    {
      label: "Item_MoveForTMHM",
      ram: ITEM_MOVE_FOR_TMHM_RAM,
      entryKey: "moveForTmHmAddress",
      original: bytesFromHex("52 22 92 00 90 42 03 d3"),
    },
    {
      label: "Item_TMHMNumber",
      ram: ITEM_TMHM_NUMBER_RAM,
      entryKey: "tmHmNumberAddress",
      original: bytesFromHex("52 22 92 00 90 42 03 d3"),
    },
    {
      label: "CanPokemonFormLearnTM",
      ram: CAN_POKEMON_FORM_LEARN_TM_RAM,
      entryKey: "canLearnTmGuardAddress",
      original: bytesFromHex("10 b5 14 4b 98 42 01 d1"),
    },
  ];

  function expandedExtraTmRows(rom, options = {}) {
    if (!itemExpansionPatches || typeof itemExpansionPatches.expandedExtraTmEntries !== "function") {
      throw new PatchError("Expanded Extra TMs require the Item Expansion patch module.");
    }
    const optionRows = Array.isArray(options.extraTms) ? options.extraTms : [];
    return itemExpansionPatches
      .expandedExtraTmEntries(rom, { ...options, extraTmsAutoExpandedItems: true })
      .map((entry, index) => {
        const optionRow = optionRows[index] || {};
        const hasCompatibility =
          Object.prototype.hasOwnProperty.call(optionRow, "compatiblePokemon") ||
          Object.prototype.hasOwnProperty.call(optionRow, "compatibleSpecies") ||
          Object.prototype.hasOwnProperty.call(optionRow, "compatibility");
        if (!hasCompatibility) {
          return entry;
        }
        return {
          ...entry,
          compatiblePokemon:
            optionRow.compatiblePokemon !== undefined
              ? optionRow.compatiblePokemon
              : optionRow.compatibleSpecies !== undefined
                ? optionRow.compatibleSpecies
                : optionRow.compatibility,
        };
      });
  }

  function normalizeName(name) {
    return String(name || "")
      .trim()
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]/g, "");
  }

  function readSpeciesNames(rom) {
    const file = findFileByPath(rom, MESSAGE_NARC_PATH);
    const narc = rom.slice(file.start, file.end);
    return messageBankEntries(narcMemberBytes(narc, SPECIES_NAMES_MESSAGE_MEMBER));
  }

  function parseIntegerToken(token) {
    if (typeof token === "number" && Number.isInteger(token)) {
      return token;
    }
    const text = token === undefined || token === null ? "" : String(token).trim();
    if (/^0x[0-9a-f]+$/i.test(text)) {
      return Number.parseInt(text.slice(2), 16);
    }
    if (/^[0-9]+$/.test(text)) {
      return Number.parseInt(text, 10);
    }
    return null;
  }

  function compatibilityTokens(value) {
    if (value === undefined) {
      return null;
    }
    if (Array.isArray(value)) {
      return value;
    }
    return String(value)
      .split(/[,\n;]/)
      .map((token) => token.trim())
      .filter(Boolean);
  }

  function parseCompatiblePokemon(value, speciesNames, personalCount, label) {
    const tokens = compatibilityTokens(value);
    if (tokens === null) {
      return null;
    }
    const normalizedToId = new Map();
    speciesNames.forEach((name, id) => {
      const normalized = normalizeName(name);
      if (normalized && !normalizedToId.has(normalized)) {
        normalizedToId.set(normalized, id);
      }
    });

    const ids = new Set();
    for (const token of tokens) {
      const numeric = parseIntegerToken(token);
      let id = numeric;
      if (id === null) {
        id = normalizedToId.get(normalizeName(token));
      }
      if (!Number.isInteger(id)) {
        throw new PatchError(`Extra TMs ${label} compatible Pokemon "${token}" was not found in the ROM species-name text bank.`);
      }
      if (id < 1 || id >= personalCount) {
        throw new PatchError(`Extra TMs ${label} compatible Pokemon ${hex(id)} is outside personal entries 1-${personalCount - 1}.`);
      }
      ids.add(id);
    }
    return ids;
  }

  function readPersonalMembers(rom) {
    const file = findFileByPath(rom, PERSONAL_NARC_PATH);
    const narc = rom.slice(file.start, file.end);
    const parsed = parseNarc(narc);
    return {
      file,
      narc,
      parsed,
      members: parsed.entries.map((entry) =>
        narc.slice(parsed.dataBlock.dataOffset + entry.start, parsed.dataBlock.dataOffset + entry.end)
      ),
    };
  }

  function existingExtraTmCompatibility(rom, personalMembers) {
    const sets = Array.from({ length: MAX_EXTRA_TMS }, () => new Set());
    let installed = false;
    let synth = null;
    try {
      synth = readSyntheticOverlayMember(rom).member;
    } catch (error) {
      synth = null;
    }
    if (synth) {
      installed = findNeedle(synth, MARKER, 0, synth.length).length > 0;
    }
    if (!installed) {
      return { installed, sets };
    }

    for (let memberId = 0; memberId < personalMembers.length; memberId += 1) {
      const member = personalMembers[memberId];
      if (member.length < VANILLA_EXTRA_TM_MASK_4_OFFSET + 4) {
        continue;
      }
      const mask = readU32(member, VANILLA_EXTRA_TM_MASK_4_OFFSET);
      for (let row = 0; row < VANILLA_EXTRA_TM_ROWS; row += 1) {
        if (mask & ((1 << (row + 4)) >>> 0)) {
          sets[row].add(memberId);
        }
      }
    }

    const markerOffsets = findNeedle(synth, MARKER, 0, synth.length);
    const markerOffset = markerOffsets[markerOffsets.length - 1];
    const tableOffset = markerOffset + MARKER.length + 0x500;
    const compatMaskOffset = tableOffset + 8 + MAX_EXTRA_TMS * 4;
    if (compatMaskOffset + personalMembers.length * 4 <= synth.length) {
      for (let memberId = 0; memberId < personalMembers.length; memberId += 1) {
        const mask = readU32(synth, compatMaskOffset + memberId * 4);
        for (let row = VANILLA_EXTRA_TM_ROWS; row < MAX_EXTRA_TMS; row += 1) {
          if (mask & ((1 << (row - VANILLA_EXTRA_TM_ROWS)) >>> 0)) {
            sets[row].add(memberId);
          }
        }
      }
    }

    return { installed, sets };
  }

  function thumbAbsoluteBranch(targetAddress) {
    const bytes = new Uint8Array(8);
    writeU16(bytes, 0, 0x4b00);
    writeU16(bytes, 2, 0x4718);
    writeU32(bytes, 4, targetAddress | 1);
    return bytes;
  }

  function isSyntheticOverlayBranch(data, offset) {
    if (offset < 0 || offset + 8 > data.length) {
      return false;
    }
    if (readU32(data, offset) !== 0x47184b00) {
      return false;
    }
    const target = readU32(data, offset + 4) & ~1;
    return target >= SYNTH_OVERLAY_RAM_BASE && target < SYNTH_OVERLAY_RAM_BASE + DSPRE_SYNTH_OVERLAY_SIZE;
  }

  async function buildExtraTmPayload(payloadAddress, entries, expandedCompatMasks) {
    const helperAddress = payloadAddress + MARKER.length;
    const tableAddress = helperAddress + 0x500;
    let helper;
    try {
      helper = await assembler.assembleArmips({
        source: asmTemplates.extraTmsHelper({
          helperAddress,
          itemIds: entries.map((entry) => entry.itemId),
          moveIds: entries.map((entry) => entry.moveId),
          expandedCompatMasks,
          sTmHmMovesAddress: S_TMHM_MOVES_ADDRESS,
          fontDrawNumberAddress: FONT_DRAW_NUMBER_RAM,
          fontDrawHpAddress: FONT_DRAW_HP_RAM,
          bagPrintItemCountAddress: BAG_PRINT_ITEM_COUNT_RAM,
          drawHmIconAddress: DRAW_HM_ICON_RAM,
          maxRows: MAX_EXTRA_TMS,
        }),
      });
    } catch (error) {
      throw new PatchError(`Extra TMs armips helper assembly failed: ${error.message}`);
    }

    const bytes = new Uint8Array(MARKER.length + helper.length);
    bytes.set(MARKER);
    bytes.set(helper, MARKER.length);
    return {
      bytes,
      isTmHmAddress: helperAddress,
      moveForTmHmAddress: helperAddress + 0x80,
      tmHmNumberAddress: helperAddress + 0x100,
      bagDisplayAddress: helperAddress + 0x180,
      tableAddress,
      canLearnTmGuardAddress: helperAddress + 0x280,
    };
  }

  function patchExtraTmPersonalCompatibility(rom, log, entries) {
    const personal = readPersonalMembers(rom);
    const { file, narc, parsed, members } = personal;
    const existing = existingExtraTmCompatibility(rom, members);
    const speciesNames = readSpeciesNames(rom);
    const desiredSets = entries.map((entry, index) => {
      const parsedSet = parseCompatiblePokemon(
        entry.compatiblePokemon,
        speciesNames,
        members.length,
        `TM${entry.tmNumber}`
      );
      if (parsedSet) {
        return parsedSet;
      }
      return existing.installed ? new Set(existing.sets[index]) : new Set();
    });
    const replacements = [];
    const expandedCompatMasks = Array.from({ length: members.length }, () => 0);

    for (let memberId = 0; memberId < parsed.entries.length; memberId += 1) {
      const entry = parsed.entries[memberId];
      const member = narc.slice(parsed.dataBlock.dataOffset + entry.start, parsed.dataBlock.dataOffset + entry.end);
      if (member.length < VANILLA_EXTRA_TM_MASK_4_OFFSET + 4) {
        throw new PatchError(
          `Extra TMs personal compatibility entry ${memberId} is only ${member.length} byte(s); expected at least ${
            VANILLA_EXTRA_TM_MASK_4_OFFSET + 4
          }.`
        );
      }
      const current = readU32(member, VANILLA_EXTRA_TM_MASK_4_OFFSET);
      let extraMask = 0;
      for (let row = 0; row < Math.min(VANILLA_EXTRA_TM_ROWS, entries.length); row += 1) {
        if (desiredSets[row].has(memberId)) {
          extraMask = (extraMask | ((1 << (row + 4)) >>> 0)) >>> 0;
        }
      }
      for (let row = VANILLA_EXTRA_TM_ROWS; row < entries.length; row += 1) {
        if (desiredSets[row].has(memberId)) {
          expandedCompatMasks[memberId] = (expandedCompatMasks[memberId] | ((1 << (row - VANILLA_EXTRA_TM_ROWS)) >>> 0)) >>> 0;
        }
      }
      const next = ((current & ~VANILLA_EXTRA_TM_93_120_MASK) | extraMask) >>> 0;
      if (next !== current) {
        const patched = new Uint8Array(member);
        writeU32(patched, VANILLA_EXTRA_TM_MASK_4_OFFSET, next);
        replacements.push([memberId, patched]);
      }
    }

    if (!replacements.length) {
      log.push("Extra TMs: TM93-TM120 personal compatibility bits already match configured lists.");
      return {
        rom,
        expandedCompatMasks,
        compatibilityCounts: desiredSets.map((set) => set.size),
      };
    }

    const patchedNarc = replaceNarcMembers(narc, replacements);
    const result = replaceRomFileAllowGrowth(rom, file, patchedNarc, "Extra TMs personal compatibility");
    log.push(
      `Extra TMs: updated TM93-TM120 compatibility bits for ${replacements.length} personal entr${
        replacements.length === 1 ? "y" : "ies"
      } in ${PERSONAL_NARC_PATH}.`
    );
    return {
      rom: result.rom,
      expandedCompatMasks,
      compatibilityCounts: desiredSets.map((set) => set.size),
    };
  }

  function patchExtraTmPocketSize(rom, log) {
    const overlay = getOverlayRange(rom, OVERLAY_84);
    const data = rom.slice(overlay.start, overlay.end);
    const originalAt = findNeedle(data, BAG_POCKET_SIZES_ORIGINAL, 0, data.length);
    const patchedAt = findNeedle(data, BAG_POCKET_SIZES_PATCHED, 0, data.length);
    if (patchedAt.length === 1) {
      log.push(
        `Extra TMs: TM/HM rendered pocket size already expanded to ${TMHM_RENDERED_POCKET_SIZE} at overlay 84 RAM ${hex(
          overlay.loadAddress + patchedAt[0]
        )}.`
      );
      return;
    }
    if (originalAt.length !== 1) {
      throw new PatchError(
        `Extra TMs TM/HM rendered pocket-size table matched ${originalAt.length} active location(s).`
      );
    }
    writeBytes(rom, overlay.start + originalAt[0], BAG_POCKET_SIZES_PATCHED);
    log.push(
      `Extra TMs: expanded TM/HM rendered pocket size to ${TMHM_RENDERED_POCKET_SIZE} at overlay 84 RAM ${hex(
        overlay.loadAddress + originalAt[0]
      )}.`
    );
  }

  function patchExtraTmBagDisplayHook(rom, force, log, bagDisplayAddress) {
    const overlay = getOverlayRange(rom, OVERLAY_84);
    const data = rom.slice(overlay.start, overlay.end);
    const patched = thumbAbsoluteBranch(bagDisplayAddress);
    let located;
    try {
      located = locateUniquePatch(
        data,
        BAG_UI_PRINT_TMHM_NUMBER_ORIGINAL,
        patched,
        "Extra TMs BagUI_PrintTMHMNumber hook"
      );
    } catch (error) {
      const fallback = BAG_UI_PRINT_TMHM_NUMBER_RAM - overlay.loadAddress;
      if (fallback < 0 || fallback + BAG_UI_PRINT_TMHM_NUMBER_ORIGINAL.length > data.length) {
        throw error;
      }
      if (isSyntheticOverlayBranch(data, fallback)) {
        located = { offset: fallback, state: "legacy" };
      } else if (force) {
        located = { offset: fallback, state: "patch" };
      } else {
        throw error;
      }
    }

    const offset = overlay.start + located.offset;
    if (located.state !== "already") {
      writeBytes(rom, offset, patched);
    }

    log.push(
      `Extra TMs: ${
        located.state === "already"
          ? "BagUI_PrintTMHMNumber hook already installed"
          : located.state === "legacy"
            ? "migrated BagUI_PrintTMHMNumber hook"
            : "installed BagUI_PrintTMHMNumber hook"
      } at overlay 84 RAM ${hex(overlay.loadAddress + located.offset)}.`
    );
  }

  function patchExtraTmBagListIndentation(rom, log) {
    const overlay = getOverlayRange(rom, OVERLAY_84);
    const data = rom.slice(overlay.start, overlay.end);
    let migratedLegacy = false;
    let located;
    try {
      located = locateUniquePatch(
        data,
        BAG_NUMBERED_POCKET_TEXT_X_OFFSET_ORIGINAL,
        BAG_NUMBERED_POCKET_TEXT_X_OFFSET_PATCHED,
        "Extra TMs numbered-pocket list indentation"
      );
    } catch (error) {
      located = locateUniquePatch(
        data,
        BAG_NUMBERED_POCKET_TEXT_X_OFFSET_LEGACY_TM_ONLY,
        BAG_NUMBERED_POCKET_TEXT_X_OFFSET_PATCHED,
        "Extra TMs legacy TM/HM-only list indentation"
      );
      migratedLegacy = located.state !== "already";
    }

    if (located.state !== "already") {
      writeBytes(rom, overlay.start + located.offset, BAG_NUMBERED_POCKET_TEXT_X_OFFSET_PATCHED);
    }

    log.push(
      `Extra TMs: ${
        located.state === "already"
          ? "numbered-pocket list indentation already patched"
          : migratedLegacy
            ? "migrated legacy TM/HM-only list indentation"
            : "expanded numbered-pocket list indentation"
      } at overlay 84 RAM ${hex(overlay.loadAddress + located.offset)}.`
    );
  }

  async function patchExtraTmArm9Hooks(rom, force, log, entries, expandedCompatMasks) {
    const allocator = new SyntheticOverlayAllocator(rom, log);
    const allocation = await allocator.allocateAsync({
      marker: MARKER_TEXT,
      buildPayload: (payloadAddress) => buildExtraTmPayload(payloadAddress, entries, expandedCompatMasks),
      label: "Extra TMs",
      alignment: 0x10,
      updateExisting: true,
    });
    const changedHooks = [];

    for (const hook of HOOK_SITES) {
      const offset = arm9Offset(rom, hook.ram, hook.original.length);
      const patched = thumbAbsoluteBranch(allocation.built[hook.entryKey]);
      let state;
      try {
        state = requireBytes(rom, offset, hook.original, patched, force, `Extra TMs ${hook.label} hook`);
      } catch (error) {
        if (!isSyntheticOverlayBranch(rom, offset)) {
          throw error;
        }
        state = "legacy";
      }
      if (state !== "already") {
        writeBytes(rom, offset, patched);
        changedHooks.push(state === "legacy" ? `${hook.label} migrated` : hook.label);
      }
    }
    patchExtraTmBagDisplayHook(rom, force, log, allocation.built.bagDisplayAddress);
    patchExtraTmBagListIndentation(rom, log);
    patchExtraTmPocketSize(rom, log);

    log.push(
      `Extra TMs: ${
        changedHooks.length ? `installed ${changedHooks.join(", ")} hook(s)` : "ARM9 hooks already installed"
      }; helper table at synthetic-overlay RAM ${hex(allocation.built.tableAddress)}.`
    );
  }

  async function patchExtraTms(rom, force, log, options = {}) {
    const entries = expandedExtraTmRows(rom, options);
    if (!entries.length) {
      throw new PatchError("Extra TMs needs at least one expanded item row marked as a TM.");
    }
    if (entries.length > MAX_EXTRA_TMS) {
      throw new PatchError(`Extra TMs accepts at most ${MAX_EXTRA_TMS} expanded TM row(s).`);
    }
    const compatibility = patchExtraTmPersonalCompatibility(rom, log, entries);
    rom = compatibility.rom;
    await patchExtraTmArm9Hooks(rom, force, log, entries, compatibility.expandedCompatMasks);
    log.push(
      `Extra TMs: using Item Expansion generated ID(s) ${entries
        .map((entry) => `${hex(entry.itemId)}=TM${entry.tmNumber} -> ${entry.moveName}`)
        .join(", ")}.`
    );
    log.push(
      `Extra TMs: configured ${entries
        .map(
          (entry, index) =>
            `TM${entry.tmNumber}=${hex(entry.itemId)} move ${hex(entry.moveId)} compat ${entry.compatBit} (${compatibility.compatibilityCounts[index]} Pokemon)`
        )
        .join(", ")}.`
    );
    log.push(
      "Extra TMs: TM93-TM120 use the vanilla fourth personal TM mask; TM121-TM152 use the expanded compatibility table. Fresh rows default to no compatible Pokemon; already-patched ROMs preserve compatibility when rows are not supplied."
    );
    return rom;
  }

  return {
    extraTMs: patchExtraTms,
  };
});
