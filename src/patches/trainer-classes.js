(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    const assembler = require("../asm/armips-assembler.js");
    const templates = require("../asm/templates.js");
    module.exports = (core) => factory(core, assembler, templates);
  } else {
    root.PlatinumPatcherTrainerClassPatches = factory(
      root.PlatinumPatcherCore,
      root.PlatinumPatcherArmipsAssembler,
      root.PlatinumPatcherAsmTemplates
    );
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (core, assembler, asmTemplates) {
  "use strict";

  if (!core) {
    throw new Error("Trainer Class Expansion patches require PlatinumPatcherCore to load first.");
  }
  if (!assembler || !asmTemplates) {
    throw new Error("armips assembler failed to load for Trainer Class Expansion patches.");
  }

  const {
    OVERLAY_16,
    PatchError,
    SyntheticOverlayAllocator,
    arm9Offset,
    asciiBytes,
    bytesEqual,
    bytesFromHex,
    findFileByPath,
    findNeedle,
    getOverlayRange,
    hex,
    messageBankEntries,
    narcMemberBytes,
    overlayOffset,
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

  const MARKER_TEXT = "TRCLSXPNDV1";
  const MARKER = (() => {
    const out = new Uint8Array(16);
    out.set(asciiBytes(MARKER_TEXT));
    return out;
  })();

  const FIRST_EXPANDED_CLASS_ID = 105;
  const VANILLA_CLASS_COUNT = 105;
  const MAX_TRAINER_CLASSES = 256;
  const MAX_EXPANDED_CLASSES = MAX_TRAINER_CLASSES - FIRST_EXPANDED_CLASS_ID;
  const TRAINER_GRAPHICS_FILES_PER_CLASS = 5;

  const MESSAGE_NARC_PATH = "msgdata/pl_msg.narc";
  const TRAINER_GRAPHICS_NARC_PATH = "poketool/trgra/trfgra.narc";
  const TRAINER_CLASS_NAMES_MEMBER = 619;
  const TRAINER_CLASS_ARTICLES_MEMBER = 620;

  const TRAINER_CLASS_GENDER_FUNC_RAM = 0x020793ac;
  const TRAINER_CLASS_GENDER_LITERAL_RAM = 0x020793b4;
  const VANILLA_GENDER_TABLE_RAM = 0x020f0714;
  const TRAINER_CLASS_GENDER_FUNC_BYTES = bytesFromHex("0149085c7047c046");

  const TRAINER_GET_ENCOUNTER_BGM_RAM = 0x0205560c;
  const TRAINER_GET_ENCOUNTER_BGM_BYTES = bytesFromHex("38b5012123f006fe");
  const TRAINER_LOAD_PARAM_RAM = 0x02079220;
  const VANILLA_ENCOUNTER_BGM_PAIR_TABLE_RAM = 0x020ec3e0;
  const VANILLA_ENCOUNTER_BGM_PAIR_COUNT = 79;
  const DEFAULT_EYE_CONTACT_BGM = 0x044d;

  const BATTLE_SCRIPT_CALC_PRIZE_RAM = 0x022431bc;
  const BATTLE_SCRIPT_CALC_PRIZE_BYTES = bytesFromHex("f0b58fb0071c0d1c");
  const PRIZE_TABLE_LITERAL_RAM = 0x022432ac;
  const VANILLA_PRIZE_TABLE = new Uint8Array([
    0, 0, 4, 4, 4, 4, 4, 8, 4, 8, 4, 8, 8, 8, 6, 12, 12, 12, 4, 8, 16, 16, 2, 16, 15, 15,
    8, 20, 2, 8, 8, 30, 40, 40, 50, 50, 14, 16, 10, 15, 15, 12, 4, 4, 1, 1, 8, 5, 12, 8,
    8, 30, 6, 15, 15, 8, 8, 6, 6, 10, 5, 5, 30, 25, 30, 30, 30, 30, 30, 50, 14, 10, 20,
    10, 30, 30, 30, 30, 30, 30, 8, 8, 18, 8, 10, 18, 45, 20, 20, 10, 30, 30, 30, 30, 30, 25,
    25, 0, 10, 0, 0, 0, 0, 0, 0,
  ]);

  const BGM_HELPER_OFFSET = 0x10;
  const GENDER_TABLE_OFFSET = 0x90;
  const PRIZE_TABLE_OFFSET = 0x190;
  const EYE_BGM_TABLE_OFFSET = 0x290;
  const PAYLOAD_SIZE = EYE_BGM_TABLE_OFFSET + MAX_TRAINER_CLASSES * 2;

  function parseInteger(token, label) {
    const text = token === undefined || token === null ? "" : String(token).trim();
    if (!text) {
      throw new PatchError(`${label} is required.`);
    }
    const value = /^0x[0-9a-f]+$/i.test(text)
      ? Number.parseInt(text.slice(2), 16)
      : /^[0-9]+$/.test(text)
        ? Number.parseInt(text, 10)
        : NaN;
    if (!Number.isInteger(value)) {
      throw new PatchError(`${label} "${text}" is not a valid number.`);
    }
    return value;
  }

  function normalizeTrainerClassName(name) {
    return String(name || "")
      .trim()
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]/g, "");
  }

  function readTrainerClassNamesFromRom(rom) {
    const file = findFileByPath(rom, MESSAGE_NARC_PATH);
    const narc = rom.slice(file.start, file.end);
    return messageBankEntries(narcMemberBytes(narc, TRAINER_CLASS_NAMES_MEMBER));
  }

  function resolveCloneSource(token, classNames, rowNumber) {
    const text = token === undefined || token === null ? "" : String(token).trim();
    if (!text) {
      throw new PatchError(`Trainer class row ${rowNumber} is missing a clone source.`);
    }

    let cloneFrom = null;
    if (/^0x[0-9a-f]+$/i.test(text) || /^[0-9]+$/.test(text)) {
      cloneFrom = parseInteger(text, `Trainer class row ${rowNumber} clone source`);
    } else {
      const wanted = normalizeTrainerClassName(text);
      const matches = [];
      for (let id = 0; id < VANILLA_CLASS_COUNT && id < classNames.length; id += 1) {
        if (normalizeTrainerClassName(classNames[id]) === wanted) {
          matches.push(id);
        }
      }
      if (!matches.length) {
        throw new PatchError(`Trainer class row ${rowNumber} clone source "${text}" was not found.`);
      }
      if (matches.length > 1) {
        throw new PatchError(
          `Trainer class row ${rowNumber} clone source "${text}" is ambiguous; use a numeric class ID.`
        );
      }
      cloneFrom = matches[0];
    }

    if (!Number.isInteger(cloneFrom) || cloneFrom < 0 || cloneFrom >= VANILLA_CLASS_COUNT) {
      throw new PatchError(
        `Trainer class row ${rowNumber} clone source must be a vanilla class ID from 0 to ${
          VANILLA_CLASS_COUNT - 1
        }.`
      );
    }
    return cloneFrom;
  }

  function parseTrainerClassRows(rom, options) {
    const source = Array.isArray(options && options.trainerClasses) ? options.trainerClasses : [];
    if (!source.length) {
      throw new PatchError("Trainer Class Expansion needs at least one trainer class row.");
    }
    if (source.length > MAX_EXPANDED_CLASSES) {
      throw new PatchError(`Trainer Class Expansion supports at most ${MAX_EXPANDED_CLASSES} new classes.`);
    }

    const classNames = readTrainerClassNamesFromRom(rom);
    const rows = [];
    for (let i = 0; i < source.length; i += 1) {
      const raw = source[i] || {};
      const name = String(raw.name || "").trim();
      if (!name) {
        throw new PatchError(`Trainer class row ${i + 1} is missing a class name.`);
      }
      const article = String(raw.article || "").trim() || `a ${name}`;
      rows.push({
        classId: FIRST_EXPANDED_CLASS_ID + i,
        name,
        article,
        cloneFrom: resolveCloneSource(raw.cloneFrom, classNames, i + 1),
      });
    }
    return rows;
  }

  function thumbAbsoluteBranch(targetAddress) {
    const out = new Uint8Array(8);
    writeU16(out, 0, 0x4b00);
    writeU16(out, 2, 0x4718);
    writeU32(out, 4, targetAddress | 1);
    return out;
  }

  function readArm9Bytes(rom, ramAddress, length) {
    const offset = arm9Offset(rom, ramAddress, length);
    return rom.slice(offset, offset + length);
  }

  function locateVanillaPrizeTable(rom) {
    const overlay = getOverlayRange(rom, OVERLAY_16);
    const hits = findNeedle(rom, VANILLA_PRIZE_TABLE, overlay.start, overlay.end);
    if (hits.length !== 1) {
      throw new PatchError(
        `Trainer Class Expansion prize table matched ${hits.length} locations in active overlay 16.`
      );
    }
    return {
      romOffset: hits[0],
      ramAddress: overlay.loadAddress + (hits[0] - overlay.start),
    };
  }

  function overlayRamOffset(rom, overlayId, ramAddress, size = 1) {
    const overlay = getOverlayRange(rom, overlayId);
    return overlayOffset(rom, overlayId, ramAddress - overlay.loadAddress, size).offset;
  }

  function buildMetadataTables(rom, rows) {
    const genderTable = new Uint8Array(MAX_TRAINER_CLASSES);
    genderTable.set(readArm9Bytes(rom, VANILLA_GENDER_TABLE_RAM, VANILLA_CLASS_COUNT));

    const prizeTableInfo = locateVanillaPrizeTable(rom);
    const prizeTable = new Uint8Array(MAX_TRAINER_CLASSES);
    prizeTable.set(rom.slice(prizeTableInfo.romOffset, prizeTableInfo.romOffset + VANILLA_CLASS_COUNT));

    const eyeBgmTable = new Uint16Array(MAX_TRAINER_CLASSES);
    eyeBgmTable.fill(DEFAULT_EYE_CONTACT_BGM);
    const bgmTableOffset = arm9Offset(rom, VANILLA_ENCOUNTER_BGM_PAIR_TABLE_RAM, VANILLA_ENCOUNTER_BGM_PAIR_COUNT * 4);
    for (let i = 0; i < VANILLA_ENCOUNTER_BGM_PAIR_COUNT; i += 1) {
      const pairOffset = bgmTableOffset + i * 4;
      const classId = readU16(rom, pairOffset);
      const bgm = readU16(rom, pairOffset + 2);
      if (classId >= 0 && classId < MAX_TRAINER_CLASSES) {
        eyeBgmTable[classId] = bgm;
      }
    }

    for (const row of rows) {
      genderTable[row.classId] = genderTable[row.cloneFrom];
      prizeTable[row.classId] = prizeTable[row.cloneFrom];
      eyeBgmTable[row.classId] = eyeBgmTable[row.cloneFrom];
    }

    return { genderTable, prizeTable, eyeBgmTable, prizeTableInfo };
  }

  async function buildPayload(payloadAddress, tables) {
    const bgmHelperAddress = payloadAddress + BGM_HELPER_OFFSET;
    const genderTableAddress = payloadAddress + GENDER_TABLE_OFFSET;
    const prizeTableAddress = payloadAddress + PRIZE_TABLE_OFFSET;
    const eyeBgmTableAddress = payloadAddress + EYE_BGM_TABLE_OFFSET;
    let helper;
    try {
      helper = await assembler.assembleArmips({
        source: asmTemplates.trainerClassExpansionHelper({
          helperAddress: bgmHelperAddress,
          trainerLoadParamAddress: TRAINER_LOAD_PARAM_RAM,
          eyeBgmTableAddress,
        }),
      });
    } catch (error) {
      throw new PatchError(`Trainer Class Expansion armips helper assembly failed: ${error.message}`);
    }
    if (helper.length > GENDER_TABLE_OFFSET - BGM_HELPER_OFFSET) {
      throw new PatchError(`Trainer Class Expansion helper is too large: ${hex(helper.length)} byte(s).`);
    }

    const bytes = new Uint8Array(PAYLOAD_SIZE);
    bytes.set(MARKER, 0);
    bytes.set(helper, BGM_HELPER_OFFSET);
    bytes.set(tables.genderTable, GENDER_TABLE_OFFSET);
    bytes.set(tables.prizeTable, PRIZE_TABLE_OFFSET);
    for (let i = 0; i < MAX_TRAINER_CLASSES; i += 1) {
      writeU16(bytes, EYE_BGM_TABLE_OFFSET + i * 2, tables.eyeBgmTable[i]);
    }

    return {
      bytes,
      bgmHelperAddress,
      genderTableAddress,
      prizeTableAddress,
      eyeBgmTableAddress,
    };
  }

  function patchTrainerClassMessages(rom, log, rows) {
    const file = findFileByPath(rom, MESSAGE_NARC_PATH);
    const narc = rom.slice(file.start, file.end);
    const nameBank = narcMemberBytes(narc, TRAINER_CLASS_NAMES_MEMBER);
    const articleBank = narcMemberBytes(narc, TRAINER_CLASS_ARTICLES_MEMBER);
    const nameReplacements = rows.map((row) => [row.classId, row.name]);
    const articleReplacements = rows.map((row) => [row.classId, row.article]);
    const patchedNarc = replaceNarcMembers(narc, [
      [
        TRAINER_CLASS_NAMES_MEMBER,
        replaceMessageBankEntries(nameBank, nameReplacements, {
          label: "Trainer class name",
          fillerText: "",
        }),
      ],
      [
        TRAINER_CLASS_ARTICLES_MEMBER,
        replaceMessageBankEntries(articleBank, articleReplacements, {
          label: "Trainer class article",
          fillerText: "",
        }),
      ],
    ]);
    const result = replaceRomFileAllowGrowth(rom, file, patchedNarc, "Trainer Class Expansion class text");
    log.push(
      `Trainer Class Expansion: patched class text banks ${TRAINER_CLASS_NAMES_MEMBER}/${TRAINER_CLASS_ARTICLES_MEMBER}${
        result.growth ? `; ROM grew by ${result.growth} byte(s)` : ""
      }.`
    );
    return result.rom;
  }

  function patchTrainerClassGraphics(rom, log, rows) {
    const file = findFileByPath(rom, TRAINER_GRAPHICS_NARC_PATH);
    const narc = rom.slice(file.start, file.end);
    const parsed = parseNarc(narc);
    const replacements = [];

    for (const row of rows) {
      const sourceBase = row.cloneFrom * TRAINER_GRAPHICS_FILES_PER_CLASS;
      const targetBase = row.classId * TRAINER_GRAPHICS_FILES_PER_CLASS;
      if (sourceBase + TRAINER_GRAPHICS_FILES_PER_CLASS > parsed.entries.length) {
        throw new PatchError(`Trainer class ${row.cloneFrom} graphics are missing from ${TRAINER_GRAPHICS_NARC_PATH}.`);
      }
      for (let part = 0; part < TRAINER_GRAPHICS_FILES_PER_CLASS; part += 1) {
        replacements.push([targetBase + part, narcMemberBytes(narc, sourceBase + part)]);
      }
    }

    const patchedNarc = replaceOrAppendNarcMembers(narc, replacements);
    const result = replaceRomFileAllowGrowth(rom, file, patchedNarc, "Trainer Class Expansion graphics");
    const patchedCount = parseNarc(patchedNarc).entries.length;
    log.push(
      `Trainer Class Expansion: copied ${rows.length * TRAINER_GRAPHICS_FILES_PER_CLASS} trainer graphics member(s) into ${TRAINER_GRAPHICS_NARC_PATH}; archive now has ${patchedCount} member(s)${
        result.growth ? `; ROM grew by ${result.growth} byte(s)` : ""
      }.`
    );
    return result.rom;
  }

  async function patchTrainerClassRuntime(rom, force, log, rows) {
    const tables = buildMetadataTables(rom, rows);
    const allocator = new SyntheticOverlayAllocator(rom, log);
    const allocation = await allocator.allocateAsync({
      marker: MARKER_TEXT,
      buildPayload: (payloadAddress) => buildPayload(payloadAddress, tables),
      label: "Trainer Class Expansion",
      alignment: 0x10,
      updateExisting: true,
    });

    const genderFunctionOffset = arm9Offset(rom, TRAINER_CLASS_GENDER_FUNC_RAM, TRAINER_CLASS_GENDER_FUNC_BYTES.length);
    requireBytes(
      rom,
      genderFunctionOffset,
      TRAINER_CLASS_GENDER_FUNC_BYTES,
      TRAINER_CLASS_GENDER_FUNC_BYTES,
      force,
      "Trainer Class Expansion gender lookup"
    );
    const genderLiteralOffset = arm9Offset(rom, TRAINER_CLASS_GENDER_LITERAL_RAM, 4);
    const previousGenderLiteral = readU32(rom, genderLiteralOffset);
    if (previousGenderLiteral !== allocation.built.genderTableAddress) {
      writeU32(rom, genderLiteralOffset, allocation.built.genderTableAddress);
    }

    const prizeFunctionOffset = overlayRamOffset(
      rom,
      OVERLAY_16,
      BATTLE_SCRIPT_CALC_PRIZE_RAM,
      BATTLE_SCRIPT_CALC_PRIZE_BYTES.length
    );
    requireBytes(
      rom,
      prizeFunctionOffset,
      BATTLE_SCRIPT_CALC_PRIZE_BYTES,
      BATTLE_SCRIPT_CALC_PRIZE_BYTES,
      force,
      "Trainer Class Expansion prize calculation"
    );
    const prizeLiteralOffset = overlayRamOffset(rom, OVERLAY_16, PRIZE_TABLE_LITERAL_RAM, 4);
    const previousPrizeLiteral = readU32(rom, prizeLiteralOffset);
    if (previousPrizeLiteral !== allocation.built.prizeTableAddress) {
      writeU32(rom, prizeLiteralOffset, allocation.built.prizeTableAddress);
    }

    const bgmHookOffset = arm9Offset(rom, TRAINER_GET_ENCOUNTER_BGM_RAM, TRAINER_GET_ENCOUNTER_BGM_BYTES.length);
    const bgmBranch = thumbAbsoluteBranch(allocation.built.bgmHelperAddress);
    const bgmState = requireBytes(
      rom,
      bgmHookOffset,
      TRAINER_GET_ENCOUNTER_BGM_BYTES,
      bgmBranch,
      force,
      "Trainer Class Expansion eye-contact BGM hook"
    );
    if (bgmState !== "already") {
      writeBytes(rom, bgmHookOffset, bgmBranch);
    }

    log.push(
      `Trainer Class Expansion: ${
        bgmState === "already" ? "eye-contact BGM hook already installed" : "installed eye-contact BGM hook"
      }; gender table ${hex(allocation.built.genderTableAddress)}, prize table ${hex(
        allocation.built.prizeTableAddress
      )}, BGM table ${hex(allocation.built.eyeBgmTableAddress)}.`
    );

    if (!bytesEqual(rom, tables.prizeTableInfo.romOffset, VANILLA_PRIZE_TABLE)) {
      log.push("Trainer Class Expansion: vanilla prize table bytes differ, but expanded clone table was built from ROM data.");
    }
  }

  async function trainerClassExpansion(rom, force, log, options = {}) {
    const rows = parseTrainerClassRows(rom, options);
    let currentRom = patchTrainerClassMessages(rom, log, rows);
    currentRom = patchTrainerClassGraphics(currentRom, log, rows);
    await patchTrainerClassRuntime(currentRom, force, log, rows);
    log.push(
      `Trainer Class Expansion: configured ${rows.length} class${rows.length === 1 ? "" : "es"} ${hex(
        FIRST_EXPANDED_CLASS_ID
      )}-${hex(FIRST_EXPANDED_CLASS_ID + rows.length - 1)}.`
    );
    return currentRom;
  }

  return {
    trainerClassExpansion,
    readTrainerClassNamesFromRom,
  };
});
