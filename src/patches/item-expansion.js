(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    const assembler = require("../asm/armips-assembler.js");
    const templates = require("../asm/templates.js");
    module.exports = (core) => factory(core, assembler, templates);
  } else {
    root.PlatinumPatcherItemExpansionPatches = factory(
      root.PlatinumPatcherCore,
      root.PlatinumPatcherArmipsAssembler,
      root.PlatinumPatcherAsmTemplates
    );
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (core, assembler, asmTemplates) {
  "use strict";

  if (!core) {
    throw new Error("Item Expansion patches require PlatinumPatcherCore to load first.");
  }
  if (!assembler || !asmTemplates) {
    throw new Error("armips assembler failed to load for Item Expansion patches.");
  }

  const {
    PatchError,
    SyntheticOverlayAllocator,
    arm9Offset,
    asciiBytes,
    bytesEqual,
    bytesFromHex,
    findFileByPath,
    getArm9Info,
    hex,
    messageBankEntries,
    narcMemberBytes,
    parseNarc,
    readU16,
    readU32,
    replaceMessageBankEntries,
    replaceNarcMembers,
    replaceRomFileAllowGrowth,
    requireBytes,
    writeBytes,
    writeU16,
    writeU32,
  } = core;

  const MARKER_TEXT = "ITEMEXPV1";
  const MARKER = asciiBytes(`${MARKER_TEXT}\0\0\0\0\0\0\0`);
  const FIRST_EXPANDED_ITEM_ID = 468;
  const MAX_VANILLA_ITEM_ID = 467;
  const MAX_EXPANDED_ITEMS = 128;
  const EXTRA_TM_COUNT = 60;
  const NATURE_MINT_COUNT = 25;
  const BOTTLE_CAP_COUNT = 7;
  const ITEM_POTION = 0x011;
  const ITEM_TM01 = 0x148;
  const MOVE_KARATE_CHOP = 0x0002;

  const ITEM_DATA_NARC_PATH = "itemtool/itemdata/pl_item_data.narc";
  const ITEM_ICON_NARC_PATH = "itemtool/itemdata/item_icon.narc";
  const ITEM_ICON_NCGR_LENGTH = 560;
  const ITEM_ICON_NCLR_LENGTH = 552;
  const MESSAGE_NARC_PATH = "msgdata/pl_msg.narc";
  const MOVE_DATA_NARC_PATH = "poketool/waza/pl_waza_tbl.narc";
  const MOVE_NAMES_MESSAGE_MEMBER = 647;
  const SCRIPT_NARC_PATH = "fielddata/script/scr_seq.narc";
  const VISIBLE_ITEM_SCRIPT_MEMBER = 404;

  const ITEM_TABLE_ARM9_OFFSET = 0x0f0cc4;
  const ITEM_TABLE_ENTRY_SIZE = 8;
  const S_TMHM_MOVES_ADDRESS = 0x020f0bfc;
  const TMHM_COUNT = 100;
  const ITEM_ARCHIVE_IDS_RAM = 0x020f0cc4;
  const NARC_ALLOC_WHOLE_MEMBER_RAM = 0x02006ac0;
  const ITEM_IS_TMHM_RAM = 0x0205e060;
  const ITEM_FILE_ID_RAM = 0x0207ce78;
  const ITEM_LOAD_RAM = 0x0207cf48;
  const BAG_CONTEXT_CREATE_WITH_POCKETS_RAM = 0x0207d824;
  const BAG_GET_POCKET_FOR_ITEM_RAM = 0x0207d40c;
  const ITEM_LOAD_PARAM_RAM = 0x0207cff0;
  const SAVE_DATA_PTR_RAM = 0x020245a4;
  const SAVE_DATA_SAVE_TABLE_RAM = 0x020245bc;
  const SAVE_DATA_SET_CHECKSUM_RAM = 0x02025c84;
  const OVERFLOW_STORAGE_SAVE_TABLE_ID = 30; // SAVE_TABLE_ENTRY_WIFI_HISTORY
  const OVERFLOW_STORAGE_OFFSET = 0x0cfc; // Last 0x300 bytes before Wi-Fi History checksum.
  const BAG_CONTEXT_NEW_RAM = 0x0207cb08;
  const BAG_CONTEXT_INIT_POCKET_RAM = 0x0207cb48;
  const POCKET_SORT_EMPTY_RAM = 0x0207d780;

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
  const NATURE_MINT_PALETTES = [
    "pink",
    "red",
    "red",
    "red",
    "red",
    "yellow",
    "pink",
    "yellow",
    "yellow",
    "yellow",
    "lightBlue",
    "lightBlue",
    "pink",
    "lightBlue",
    "lightBlue",
    "blue",
    "blue",
    "blue",
    "pink",
    "blue",
    "green",
    "green",
    "green",
    "green",
    "pink",
  ];
  const MINT_ICON_NCGR_BASE64 =
    "UkdDTv/+AQEwAgAAEAABAFJBSEMgAgAA/////wMAAAAQAAAAAAAAAAACAAAYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABwdwBwNzMAAAAAAAAAAAAAAAAAAHAHAAAXcgBwE3MAJxMzdzYxIwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAcAAAAHAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAANyMzcDIRERcREzNwRCMzAHdFRAAAd1cAAAB3AAAAADM2MUIzYyJ0IWNSBzM1VnUzZGciZSZGNDYjU0QnI0NFBwAAAAAAAAB3dwAAMzMHADEzcwATMTIHMxMzBzMyMXMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHAAAABwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAANDFDdTQhQwc3MXQANzF0AEdCBwBwdwAAAAAAAAAAAABFMxNzd1VEcgB3dwcAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
  const MINT_PALETTE_BASE64 = {
    red: "UkxDTv/+AAEoAgAAEAABAFRUTFAYAgAAAwAAAAAAAAAAAgAAEAAAAA9Xn04fOj8hGR3yHKoUpRQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    yellow:
      "UkxDTv/+AAEoAgAAEAABAFRUTFAYAgAAAwAAAAAAAAAAAgAAEAAAAA9X/3e/V1xHOVfxKUsZpRQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    blue: "UkxDTv/+AAEoAgAAEAABAFRUTFAYAgAAAwAAAAAAAAAAAgAAEAAAAA9X1X5Qfux9aHnlWKJkpRQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    green:
      "UkxDTv/+AAEoAgAAEAABAFRUTFAYAgAAAwAAAAAAAAAAAgAAEAAAAA9X1kvTQy0zSSLHHQQRpRQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    lightBlue:
      "UkxDTv/+AAEoAgAAEAABAFRUTFAYAgAAAwAAAAAAAAAAAgAAEAAAAA9XlntRd+VyoHLlTQA1pRQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    pink: "UkxDTv/+AAEoAgAAEAABAFRUTFAYAgAAAwAAAAAAAAAAAgAAEAAAAA9XPXO/ah9iXVXyMK8opRQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  };
  const BOTTLE_CAP_DEFS = [
    { name: "Attack Cap", statName: "Attack", targetParam: 71, paletteKey: "bottle" },
    { name: "Defense Cap", statName: "Defense", targetParam: 72, paletteKey: "bottle" },
    { name: "Sp. Atk Cap", statName: "Sp. Atk", targetParam: 74, paletteKey: "bottle" },
    { name: "Sp. Def Cap", statName: "Sp. Def", targetParam: 75, paletteKey: "bottle" },
    { name: "Speed Cap", statName: "Speed", targetParam: 73, paletteKey: "bottle" },
    { name: "HP Cap", statName: "HP", targetParam: 70, paletteKey: "bottle" },
    { name: "Gold Cap", statName: "all stats", targetParam: 0xff, paletteKey: "gold" },
  ];
  const BOTTLE_CAP_ICON_NCGR_BASE64 =
    "UkdDTv/+AQEwAgAAEAABAFJBSEMgAgAA/////wMAAAAQAAAAAAAAAAACAAAYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACQAAAAOQAAkEMAAAAAAAAAAAAAAAAAAAAAkJmZADlCMpkkFCQ0QRFBQQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAkAAACTAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGlCAABZQgAAWUIAAFkxAABZFAAAiUcAAJBIAAAAWTERMUETMRFDMRQ0QRQxETRDREQTISIiQUdXV1hHV1hYYgkAAFIJAABSCQAAUQkAAFQJAACHCQAAmAAAAAkAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWYd4mZCZmQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
  const BOTTLE_CAP_PALETTE_BASE64 = {
    bottle:
      "UkxDTv/+AAEoAgAAEAABAFRUTFAYAgAAAwAAAAAAAAAAAgAAEAAAAA9XvXd7cxdnclrtSYs9y1FpPcYYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    gold: "UkxDTv/+AAEoAgAAEAABAFRUTFAYAgAAAwAAAAAAAAAAAgAAEAAAAA9X31u/JxsruSoXJrQh9SWzIcYYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  };

  const SCRIPT_HEADER_END = 0xfd13;
  const SCRIPT_CMD_JUMP = 0x0016;
  const SCRIPT_CMD_SET_VAR = 0x0028;
  const SCRIPT_VAR_ITEM_ID = 0x8008;
  const SCRIPT_VAR_ITEM_COUNT = 0x8009;
  const STANDARDIZED_ITEM_SCRIPT_LENGTH = 18;

  const HOOK_SITES = [
    {
      label: "Item_FileID",
      ram: ITEM_FILE_ID_RAM,
      entryKey: "itemFileIdAddress",
      original: bytesFromHex("03 29 36 d8 49 18 79 44"),
    },
    {
      label: "Item_Load",
      ram: ITEM_LOAD_RAM,
      entryKey: "itemLoadAddress",
      original: bytesFromHex("08 b5 03 1c 10 48 83 42"),
    },
    {
      label: "BagContext_CreateWithPockets",
      ram: BAG_CONTEXT_CREATE_WITH_POCKETS_RAM,
      entryKey: "bagContextCreateAddress",
      original: bytesFromHex("f8 b5 05 1c 10 06 0f 1c"),
    },
    {
      label: "Bag_GetPocketForItem",
      ram: BAG_GET_POCKET_FOR_ITEM_RAM,
      entryKey: "bagGetPocketForItemAddress",
      original: bytesFromHex("70 b5 15 1c 04 1c 08 1c 04 9a 05 21"),
      preserveR3: true,
    },
  ];

  function parseInteger(token, label) {
    if (typeof token === "number") {
      if (Number.isInteger(token)) {
        return token;
      }
      throw new PatchError(`${label} is not a valid integer.`);
    }
    const text = token === undefined || token === null ? "" : String(token).trim();
    if (!text) {
      throw new PatchError(`${label} is missing.`);
    }
    if (/^0x[0-9a-f]+$/i.test(text)) {
      return Number.parseInt(text.slice(2), 16);
    }
    if (/^[0-9]+$/.test(text)) {
      return Number.parseInt(text, 10);
    }
    throw new PatchError(`${label} "${text}" is not a valid decimal or hex number.`);
  }

  function bytesFromBase64(text) {
    if (typeof Buffer !== "undefined") {
      return new Uint8Array(Buffer.from(text, "base64"));
    }
    const binary = atob(text);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      out[i] = binary.charCodeAt(i);
    }
    return out;
  }

  function fixedLengthAssetBytes(text, expectedLength, label) {
    const bytes = bytesFromBase64(text);
    if (bytes.length > expectedLength) {
      throw new PatchError(`${label} is ${bytes.length} byte(s); expected at most ${expectedLength}.`);
    }
    if (bytes.length === expectedLength) {
      return bytes;
    }
    const out = new Uint8Array(expectedLength);
    out.set(bytes);
    return out;
  }

  function narcMemberAt(narc, parsed, memberId) {
    const entry = parsed.entries[memberId];
    return narc.slice(parsed.dataBlock.dataOffset + entry.start, parsed.dataBlock.dataOffset + entry.end);
  }

  function rebuildNarcWithMembers(narc, members) {
    const parsed = parseNarc(narc);
    const beforeFat = narc.slice(0, parsed.fatBlock.offset);
    const betweenFatAndData = narc.slice(parsed.fatBlock.offset + parsed.fatBlock.size, parsed.dataBlock.offset);
    const fatSize = 12 + members.length * 8;
    const chunks = [];
    const rebuiltEntries = [];
    let cursor = 0;

    for (const member of members) {
      rebuiltEntries.push({ start: cursor, end: cursor + member.length });
      chunks.push(member);
      cursor += member.length;
      const aligned = (cursor + 3) & ~3;
      if (aligned !== cursor) {
        chunks.push(new Uint8Array(aligned - cursor));
        cursor = aligned;
      }
    }

    const dataSize = 8 + cursor;
    const out = new Uint8Array(beforeFat.length + fatSize + betweenFatAndData.length + dataSize);
    let outCursor = 0;
    out.set(beforeFat, outCursor);
    outCursor += beforeFat.length;

    out.set(narc.slice(parsed.fatBlock.offset, parsed.fatBlock.offset + 4), outCursor);
    writeU32(out, outCursor + 4, fatSize);
    writeU32(out, outCursor + 8, members.length);
    for (let i = 0; i < rebuiltEntries.length; i += 1) {
      const entry = outCursor + 12 + i * 8;
      writeU32(out, entry, rebuiltEntries[i].start);
      writeU32(out, entry + 4, rebuiltEntries[i].end);
    }
    outCursor += fatSize;

    out.set(betweenFatAndData, outCursor);
    outCursor += betweenFatAndData.length;

    out.set(narc.slice(parsed.dataBlock.offset, parsed.dataBlock.offset + 4), outCursor);
    writeU32(out, outCursor + 4, dataSize);
    outCursor += 8;
    let dataCursor = outCursor;
    for (const chunk of chunks) {
      out.set(chunk, dataCursor);
      dataCursor += chunk.length;
    }

    writeU32(out, 8, out.length);
    return out;
  }

  function ensureNarcMember(narc, memberBytes) {
    const parsed = parseNarc(narc);
    for (let memberId = 0; memberId < parsed.entries.length; memberId += 1) {
      const existing = narcMemberAt(narc, parsed, memberId);
      if (existing.length === memberBytes.length && bytesEqual(existing, 0, memberBytes)) {
        return { narc, memberId, added: false };
      }
    }

    const members = parsed.entries.map((entry) =>
      narc.slice(parsed.dataBlock.dataOffset + entry.start, parsed.dataBlock.dataOffset + entry.end)
    );
    members.push(memberBytes);
    return {
      narc: rebuildNarcWithMembers(narc, members),
      memberId: parsed.entries.length,
      added: true,
    };
  }

  function rowSources(source) {
    if (!Array.isArray(source)) {
      return [];
    }
    return source.filter((row) => {
      if (!row) {
        return false;
      }
      return ["cloneFrom", "iconFrom", "name", "description", "article", "plural", "move", "moveId", "moveName"].some((field) => {
        const value = row[field];
        return value !== undefined && value !== null && String(value).trim();
      }) || Boolean(row.isTm);
    });
  }

  function isTruthy(value) {
    if (value === true) {
      return true;
    }
    if (value === false || value === undefined || value === null) {
      return false;
    }
    return /^(1|true|yes|on|tm)$/i.test(String(value).trim());
  }

  function extraTmOptionRows(options = {}) {
    const rows = Array.isArray(options.extraTms) ? options.extraTms.filter(Boolean) : [];
    if (rows.length > EXTRA_TM_COUNT) {
      throw new PatchError(`Extra TMs accepts at most ${EXTRA_TM_COUNT} move row(s).`);
    }
    return rows;
  }

  function extraTmsExpandedCountOption(options = {}) {
    if (!options.extraTmsAutoExpandedItems) {
      return 0;
    }
    extraTmOptionRows(options);
    return EXTRA_TM_COUNT;
  }

  function normalizeMoveName(name) {
    return String(name || "")
      .trim()
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]/g, "");
  }

  function readMoveNames(rom) {
    const file = findFileByPath(rom, MESSAGE_NARC_PATH);
    const narc = rom.slice(file.start, file.end);
    return messageBankEntries(narcMemberBytes(narc, MOVE_NAMES_MESSAGE_MEMBER));
  }

  function moveDataInfo(rom) {
    const file = findFileByPath(rom, MOVE_DATA_NARC_PATH);
    const narc = rom.slice(file.start, file.end);
    return { narc, parsed: parseNarc(narc) };
  }

  function readMoveType(rom, moveId, cachedInfo) {
    const info = cachedInfo || moveDataInfo(rom);
    const entry = info.parsed.entries[moveId];
    if (!entry || entry.end - entry.start < 5) {
      throw new PatchError(`Extra TMs move ${hex(moveId)} has no readable move data.`);
    }
    return info.narc[info.parsed.dataBlock.dataOffset + entry.start + 4];
  }

  function parseMoveToken(token, moveNames, moveData, label) {
    const text = token === undefined || token === null ? "" : String(token).trim();
    const fallback = text || "Karate Chop";
    const numeric = /^0x[0-9a-f]+$/i.test(fallback)
      ? Number.parseInt(fallback.slice(2), 16)
      : /^[0-9]+$/.test(fallback)
        ? Number.parseInt(fallback, 10)
        : null;
    let moveId = numeric;
    if (moveId === null) {
      const wanted = normalizeMoveName(fallback);
      moveId = moveNames.findIndex((name) => normalizeMoveName(name) === wanted);
      if (moveId < 0) {
        throw new PatchError(`Extra TMs ${label} move "${fallback}" was not found in the ROM move-name text bank.`);
      }
    }
    if (!Number.isInteger(moveId) || moveId < 1 || moveId >= moveData.parsed.entries.length) {
      throw new PatchError(`Extra TMs ${label} move ${hex(moveId || 0)} is outside the ROM move-data range.`);
    }
    return {
      moveId,
      moveName: moveNames[moveId] && moveNames[moveId].trim() ? moveNames[moveId].trim() : `Move ${moveId}`,
    };
  }

  function extraTmMoveEntries(rom, options = {}) {
    const count = extraTmsExpandedCountOption(options);
    const optionRows = extraTmOptionRows(options);
    const moveNames = readMoveNames(rom);
    const moveData = moveDataInfo(rom);
    return Array.from({ length: count }, (_, index) => {
      const optionRow = optionRows[index] || {};
      const token = optionRow.move || optionRow.moveId || optionRow.moveName || "Karate Chop";
      return {
        rowIndex: index,
        tmNumber: 93 + index,
        compatBit: 100 + index,
        ...parseMoveToken(token, moveNames, moveData, `row ${index + 1}`),
      };
    });
  }

  function tmIconSourceForMove(rom, moveId, moveData) {
    const wantedType = readMoveType(rom, moveId, moveData);
    const movesOffset = arm9Offset(rom, S_TMHM_MOVES_ADDRESS, TMHM_COUNT * 2);
    for (let index = 0; index < TMHM_COUNT; index += 1) {
      const tmMoveId = readU16(rom, movesOffset + index * 2);
      if (tmMoveId > 0 && tmMoveId < moveData.parsed.entries.length && readMoveType(rom, tmMoveId, moveData) === wantedType) {
        return ITEM_TM01 + index;
      }
    }
    return ITEM_TM01;
  }

  function autoExtraTmRows(rom, options = {}) {
    const entries = extraTmMoveEntries(rom, options);
    const moveData = moveDataInfo(rom);
    const rows = [];
    for (const entry of entries) {
      const tmNumber = entry.tmNumber;
      rows.push({
        cloneFrom: ITEM_TM01,
        iconFrom: tmIconSourceForMove(rom, entry.moveId, moveData),
        name: `TM${tmNumber}`,
        article: `a {COLOR 255}TM${tmNumber}{COLOR 0}`,
        plural: `TM${tmNumber}s`,
        description: `It teaches the move ${entry.moveName}.\nIt can be used on a Pokemon.`,
        source: "extraTMs",
        isTm: true,
        moveId: entry.moveId,
        moveName: entry.moveName,
      });
    }
    return rows;
  }

  function autoNatureMintRows(options = {}) {
    if (!options.natureMintsAutoExpandedItems) {
      return [];
    }
    return NATURE_NAMES.map((natureName, natureIndex) => ({
      cloneFrom: ITEM_POTION,
      iconFrom: ITEM_POTION,
      name: `${natureName} Mint`,
      article: `a {COLOR 255}${natureName} Mint{COLOR 0}`,
      plural: `${natureName} Mints`,
      description: `A mint that changes a Pokemon's nature to ${natureName}.`,
      source: "natureMints",
      natureIndex,
      paletteKey: NATURE_MINT_PALETTES[natureIndex],
    }));
  }

  function autoBottleCapRows(options = {}) {
    if (!options.bottleCapsAutoExpandedItems) {
      return [];
    }
    return BOTTLE_CAP_DEFS.map((def) => ({
      cloneFrom: ITEM_POTION,
      iconFrom: ITEM_POTION,
      name: def.name,
      article: `a {COLOR 255}${def.name}{COLOR 0}`,
      plural: `${def.name}s`,
      description:
        def.targetParam === 0xff
          ? "Maximizes a Pokemon's stats."
          : `Maximizes a Pokemon's ${def.statName}.`,
      source: "bottleCaps",
      targetParam: def.targetParam,
      statName: def.statName,
      paletteKey: def.paletteKey,
    }));
  }

  function normalizedExpandedItemRows(options = {}, rom) {
    const manualRows = rowSources(options.expandedItems).map((row) => ({ ...row, source: "manual" }));
    const hasManualTmRows = manualRows.some((row) => isTruthy(row.isTm));
    const rows = [
      ...manualRows,
      ...(rom && options.extraTmsAutoExpandedItems && !hasManualTmRows ? autoExtraTmRows(rom, options) : []),
      ...autoNatureMintRows(options),
      ...autoBottleCapRows(options),
    ];
    if (rows.length < 1 || rows.length > MAX_EXPANDED_ITEMS) {
      throw new PatchError(`Item Expansion needs 1-${MAX_EXPANDED_ITEMS} configured item row(s).`);
    }

    const moveNames = rom ? readMoveNames(rom) : [];
    const moveData = rom ? moveDataInfo(rom) : null;
    let tmRowIndex = 0;
    return rows.map((row, index) => {
      const itemId = FIRST_EXPANDED_ITEM_ID + index;
      const isTm = isTruthy(row.isTm) || row.source === "extraTMs";
      if (isTm && tmRowIndex >= EXTRA_TM_COUNT) {
        throw new PatchError(`Item Expansion accepts at most ${EXTRA_TM_COUNT} expanded TM row(s).`);
      }
      let parsedMove = null;
      if (isTm && rom) {
        const token = row.move || row.moveId || row.moveName || "Karate Chop";
        parsedMove = parseMoveToken(token, moveNames, moveData, `expanded item row ${index + 1}`);
      }
      const cloneFrom =
        isTm && (row.cloneFrom === undefined || row.cloneFrom === null || String(row.cloneFrom).trim() === "")
          ? ITEM_TM01
          : parseInteger(row.cloneFrom, `Item Expansion row ${index + 1} cloneFrom`);
      if (cloneFrom < 1 || cloneFrom > MAX_VANILLA_ITEM_ID) {
        throw new PatchError(
          `Item Expansion row ${index + 1} cloneFrom ${hex(cloneFrom)} is outside vanilla item IDs 1-${MAX_VANILLA_ITEM_ID}.`
        );
      }
      const iconFrom =
        row.iconFrom === undefined || row.iconFrom === null || String(row.iconFrom).trim() === ""
          ? isTm && parsedMove && moveData
            ? tmIconSourceForMove(rom, parsedMove.moveId, moveData)
            : cloneFrom
          : parseInteger(row.iconFrom, `Item Expansion row ${index + 1} iconFrom`);
      if (iconFrom < 1 || iconFrom > MAX_VANILLA_ITEM_ID) {
        throw new PatchError(
          `Item Expansion row ${index + 1} iconFrom ${hex(iconFrom)} is outside vanilla item IDs 1-${MAX_VANILLA_ITEM_ID}.`
        );
      }

      const tmNumber = isTm ? 93 + tmRowIndex : null;
      const name =
        isTm && (row.name === undefined || row.name === null || String(row.name).trim() === "")
          ? `TM${tmNumber}`
          : row.name === undefined || row.name === null
            ? ""
            : String(row.name).trim();
      const description =
        isTm && (row.description === undefined || row.description === null || String(row.description).trim() === "")
          ? `It teaches the move ${(parsedMove && parsedMove.moveName) || row.moveName || "Karate Chop"}.\nIt can be used on a Pokemon.`
          : row.description === undefined || row.description === null
            ? ""
            : String(row.description).trim();
      if (!name) {
        throw new PatchError(`Item Expansion row ${index + 1} needs a name.`);
      }
      if (!description) {
        throw new PatchError(`Item Expansion row ${index + 1} needs a description.`);
      }

      const article =
        row.article === undefined || row.article === null || String(row.article).trim() === ""
          ? `a {COLOR 255}${name}{COLOR 0}`
          : String(row.article);
      const plural =
        row.plural === undefined || row.plural === null || String(row.plural).trim() === ""
          ? `${name}s`
          : String(row.plural);

      const result = {
        itemId,
        cloneFrom,
        iconFrom,
        name,
        description,
        article,
        plural,
        source: row.source || "manual",
        isTm,
        tmIndex: isTm ? tmRowIndex : null,
        tmNumber,
        compatBit: isTm ? 100 + tmRowIndex : null,
        moveId: parsedMove ? parsedMove.moveId : row.moveId,
        moveName: parsedMove ? parsedMove.moveName : row.moveName,
        natureIndex: row.natureIndex,
        targetParam: row.targetParam,
        statName: row.statName,
        paletteKey: row.paletteKey,
        dataMember: row.dataMember,
        iconMember: row.iconMember,
        paletteMember: row.paletteMember,
      };
      if (isTm) {
        tmRowIndex += 1;
      }
      return result;
    });
  }

  function manualExpandedItemCount(options = {}) {
    return rowSources(options.expandedItems).length;
  }

  function expandedExtraTmEntries(rom, options = {}) {
    return normalizedExpandedItemRows(options, rom)
      .filter((row) => row.isTm)
      .map((row) => ({
        itemId: row.itemId,
        rowIndex: row.tmIndex,
        tmNumber: row.tmNumber,
        compatBit: row.compatBit,
        moveId: row.moveId || MOVE_KARATE_CHOP,
        moveName: row.moveName || "Karate Chop",
      }));
  }

  function expandedNatureMintEntries(rom, options = {}) {
    return normalizedExpandedItemRows(options, rom)
      .filter((row) => row.source === "natureMints")
      .map((row) => ({
        itemId: row.itemId,
        natureIndex: row.natureIndex,
        natureName: NATURE_NAMES[row.natureIndex] || `Nature ${row.natureIndex}`,
      }));
  }

  function expandedBottleCapEntries(rom, options = {}) {
    return normalizedExpandedItemRows(options, rom)
      .filter((row) => row.source === "bottleCaps")
      .map((row) => ({
        itemId: row.itemId,
        targetParam: row.targetParam,
        statName: row.statName,
        name: row.name,
      }));
  }

  function buildMintItemData() {
    const data = new Uint8Array(34);
    writeU16(data, 0, 10000);
    data[6] = 30;
    writeU16(data, 8, (1 << 6) | (1 << 7)); // selectable, Medicine pocket, no battle pocket
    data[10] = 1; // ITEM_USE_FUNC_HEALING
    data[11] = 0;
    data[12] = 1; // Party use opens the party item flow.
    return data;
  }

  function itemTableEntryRomOffset(rom, itemId) {
    const arm9 = getArm9Info(rom);
    const offset = ITEM_TABLE_ARM9_OFFSET + itemId * ITEM_TABLE_ENTRY_SIZE;
    if (offset + ITEM_TABLE_ENTRY_SIZE > arm9.size) {
      throw new PatchError("Item Expansion item table entry is outside the ARM9 binary.");
    }
    return arm9.fileOffset + offset;
  }

  function readItemTableEntry(rom, itemId) {
    const offset = itemTableEntryRomOffset(rom, itemId);
    return {
      offset,
      data: readU16(rom, offset),
      icon: readU16(rom, offset + 2),
      palette: readU16(rom, offset + 4),
      gen3: readU16(rom, offset + 6),
    };
  }

  function itemDataFieldPocket(data) {
    return (readU16(data, 8) >>> 7) & 0x0f;
  }

  function thumbAbsoluteBranch(targetAddress) {
    const bytes = new Uint8Array(8);
    writeU16(bytes, 0, 0x4b00);
    writeU16(bytes, 2, 0x4718);
    writeU32(bytes, 4, targetAddress | 1);
    return bytes;
  }

  function thumbAbsoluteBranchPreserveR3(targetAddress) {
    const bytes = new Uint8Array(12);
    writeU16(bytes, 0, 0xb508); // push {r3, lr}
    writeU16(bytes, 2, 0x4b01); // ldr r3, [pc, #4]
    writeU16(bytes, 4, 0x9301); // str r3, [sp, #4] ; replace saved lr with target
    writeU16(bytes, 6, 0xbd08); // pop {r3, pc}
    writeU32(bytes, 8, targetAddress | 1);
    return bytes;
  }

  async function buildItemExpansionPayload(payloadAddress, archiveEntries) {
    const helperAddress = payloadAddress + MARKER.length;
    let helper;
    try {
      helper = await assembler.assembleArmips({
        source: asmTemplates.itemExpansionHelper({
          helperAddress,
          firstItemId: FIRST_EXPANDED_ITEM_ID,
          maxVanillaItemId: MAX_VANILLA_ITEM_ID,
          itemArchiveIdsAddress: ITEM_ARCHIVE_IDS_RAM,
          narcAllocWholeMemberAddress: NARC_ALLOC_WHOLE_MEMBER_RAM,
          itemIsTmHmAddress: ITEM_IS_TMHM_RAM,
          itemLoadParamAddress: ITEM_LOAD_PARAM_RAM,
          saveDataPtrAddress: SAVE_DATA_PTR_RAM,
          saveDataSaveTableAddress: SAVE_DATA_SAVE_TABLE_RAM,
          saveDataSetChecksumAddress: SAVE_DATA_SET_CHECKSUM_RAM,
          overflowStorageSaveTableId: OVERFLOW_STORAGE_SAVE_TABLE_ID,
          overflowStorageOffset: OVERFLOW_STORAGE_OFFSET,
          bagContextNewAddress: BAG_CONTEXT_NEW_RAM,
          bagContextInitPocketAddress: BAG_CONTEXT_INIT_POCKET_RAM,
          pocketSortEmptyAddress: POCKET_SORT_EMPTY_RAM,
          entries: archiveEntries,
          maxRows: MAX_EXPANDED_ITEMS,
        }),
      });
    } catch (error) {
      throw new PatchError(`Item Expansion armips helper assembly failed: ${error.message}`);
    }

    const bytes = new Uint8Array(MARKER.length + helper.length);
    bytes.set(MARKER);
    bytes.set(helper, MARKER.length);
    return {
      bytes,
      itemFileIdAddress: helperAddress,
      itemLoadAddress: helperAddress + 0x120,
      bagContextCreateAddress: helperAddress + 0x700,
      bagGetPocketForItemAddress: helperAddress + 0x860,
      tableAddress: helperAddress + 0x280,
    };
  }

  async function patchItemExpansionArm9Hooks(rom, force, log, archiveEntries) {
    const allocator = new SyntheticOverlayAllocator(rom, log);
    const allocation = await allocator.allocateAsync({
      marker: MARKER_TEXT,
      buildPayload: (payloadAddress) => buildItemExpansionPayload(payloadAddress, archiveEntries),
      label: "Item Expansion",
      alignment: 0x10,
      updateExisting: true,
    });
    const changedHooks = [];

    for (const hook of HOOK_SITES) {
      const offset = arm9Offset(rom, hook.ram, hook.original.length);
      const patched = hook.preserveR3
        ? thumbAbsoluteBranchPreserveR3(allocation.built[hook.entryKey])
        : thumbAbsoluteBranch(allocation.built[hook.entryKey]);
      const legacyPatched = hook.preserveR3 ? thumbAbsoluteBranch(allocation.built[hook.entryKey]) : null;
      const state =
        legacyPatched && bytesEqual(rom, offset, legacyPatched)
          ? "patch"
          : requireBytes(rom, offset, hook.original, patched, force, `Item Expansion ${hook.label} hook`);
      if (state !== "already") {
        writeBytes(rom, offset, patched);
        changedHooks.push(hook.label);
      }
    }

    log.push(
      `Item Expansion: ${
        changedHooks.length ? `installed ${changedHooks.join(", ")} hook(s)` : "ARM9 hooks already installed"
      }; overflow table at synthetic-overlay RAM ${hex(allocation.built.tableAddress)}.`
    );
  }

  function buildArchiveEntries(rom, rows) {
    const itemDataFile = findFileByPath(rom, ITEM_DATA_NARC_PATH);
    const itemDataNarc = rom.slice(itemDataFile.start, itemDataFile.end);
    const itemIconFile = findFileByPath(rom, ITEM_ICON_NARC_PATH);
    const itemIconNarc = rom.slice(itemIconFile.start, itemIconFile.end);
    return rows.map((row) => {
      const clone = readItemTableEntry(rom, row.cloneFrom);
      const icon = readItemTableEntry(rom, row.iconFrom);
      const dataMember = row.dataMember === undefined ? clone.data : row.dataMember;
      const iconMember = row.iconMember === undefined ? icon.icon : row.iconMember;
      const paletteMember = row.paletteMember === undefined ? icon.palette : row.paletteMember;
      const dataMemberBytes = narcMemberBytes(itemDataNarc, dataMember);
      narcMemberBytes(itemIconNarc, iconMember);
      narcMemberBytes(itemIconNarc, paletteMember);
      return {
        data: dataMember,
        icon: iconMember,
        palette: paletteMember,
        gen3: 0,
        fieldPocket: itemDataFieldPocket(dataMemberBytes),
      };
    });
  }

  function patchNatureMintAssets(rom, log, rows) {
    const natureRows = rows.filter((row) => row.source === "natureMints");
    if (!natureRows.length) {
      return { rom, rows };
    }

    const addedKinds = [];
    let currentRom = rom;

    const dataFile = findFileByPath(currentRom, ITEM_DATA_NARC_PATH);
    const dataNarc = currentRom.slice(dataFile.start, dataFile.end);
    const dataResult = ensureNarcMember(dataNarc, buildMintItemData());
    if (dataResult.added) {
      addedKinds.push("item data");
      currentRom = replaceRomFileAllowGrowth(currentRom, dataFile, dataResult.narc, "Nature Mints item data").rom;
    }

    const iconFile = findFileByPath(currentRom, ITEM_ICON_NARC_PATH);
    let iconNarc = currentRom.slice(iconFile.start, iconFile.end);
    const iconResult = ensureNarcMember(
      iconNarc,
      fixedLengthAssetBytes(MINT_ICON_NCGR_BASE64, ITEM_ICON_NCGR_LENGTH, "Nature Mints icon")
    );
    iconNarc = iconResult.narc;
    if (iconResult.added) {
      addedKinds.push("icon");
    }

    const paletteMembers = {};
    let paletteAddCount = 0;
    for (const [key, encoded] of Object.entries(MINT_PALETTE_BASE64)) {
      const result = ensureNarcMember(
        iconNarc,
        fixedLengthAssetBytes(encoded, ITEM_ICON_NCLR_LENGTH, `Nature Mints ${key} palette`)
      );
      iconNarc = result.narc;
      paletteMembers[key] = result.memberId;
      if (result.added) {
        paletteAddCount += 1;
      }
    }
    if (paletteAddCount) {
      addedKinds.push(`${paletteAddCount} palette${paletteAddCount === 1 ? "" : "s"}`);
    }

    if (iconResult.added || paletteAddCount) {
      currentRom = replaceRomFileAllowGrowth(currentRom, iconFile, iconNarc, "Nature Mints item icons").rom;
    }

    const updatedRows = rows.map((row) =>
      row.source === "natureMints"
        ? {
            ...row,
            dataMember: dataResult.memberId,
            iconMember: iconResult.memberId,
            paletteMember: paletteMembers[row.paletteKey || "pink"],
          }
        : row
    );

    log.push(
      `Nature Mints: ${
        addedKinds.length ? `installed ${addedKinds.join(", ")}` : "mint item data/icon/palettes already installed"
      } for ${NATURE_MINT_COUNT} expanded mint item(s).`
    );
    return { rom: currentRom, rows: updatedRows };
  }

  function patchBottleCapAssets(rom, log, rows) {
    const bottleRows = rows.filter((row) => row.source === "bottleCaps");
    if (!bottleRows.length) {
      return { rom, rows };
    }

    const addedKinds = [];
    let currentRom = rom;

    const dataFile = findFileByPath(currentRom, ITEM_DATA_NARC_PATH);
    const dataNarc = currentRom.slice(dataFile.start, dataFile.end);
    const dataResult = ensureNarcMember(dataNarc, buildMintItemData());
    if (dataResult.added) {
      addedKinds.push("item data");
      currentRom = replaceRomFileAllowGrowth(currentRom, dataFile, dataResult.narc, "Bottle Caps item data").rom;
    }

    const iconFile = findFileByPath(currentRom, ITEM_ICON_NARC_PATH);
    let iconNarc = currentRom.slice(iconFile.start, iconFile.end);
    const iconResult = ensureNarcMember(
      iconNarc,
      fixedLengthAssetBytes(BOTTLE_CAP_ICON_NCGR_BASE64, ITEM_ICON_NCGR_LENGTH, "Bottle Caps icon")
    );
    iconNarc = iconResult.narc;
    if (iconResult.added) {
      addedKinds.push("icon");
    }

    const paletteMembers = {};
    let paletteAddCount = 0;
    for (const [key, encoded] of Object.entries(BOTTLE_CAP_PALETTE_BASE64)) {
      const result = ensureNarcMember(
        iconNarc,
        fixedLengthAssetBytes(encoded, ITEM_ICON_NCLR_LENGTH, `Bottle Caps ${key} palette`)
      );
      iconNarc = result.narc;
      paletteMembers[key] = result.memberId;
      if (result.added) {
        paletteAddCount += 1;
      }
    }
    if (paletteAddCount) {
      addedKinds.push(`${paletteAddCount} palette${paletteAddCount === 1 ? "" : "s"}`);
    }

    if (iconResult.added || paletteAddCount) {
      currentRom = replaceRomFileAllowGrowth(currentRom, iconFile, iconNarc, "Bottle Caps item icons").rom;
    }

    const updatedRows = rows.map((row) =>
      row.source === "bottleCaps"
        ? {
            ...row,
            dataMember: dataResult.memberId,
            iconMember: iconResult.memberId,
            paletteMember: paletteMembers[row.paletteKey || "bottle"],
          }
        : row
    );

    log.push(
      `Bottle Caps: ${
        addedKinds.length ? `installed ${addedKinds.join(", ")}` : "cap item data/icon/palettes already installed"
      } for ${BOTTLE_CAP_COUNT} expanded cap item(s).`
    );
    return { rom: currentRom, rows: updatedRows };
  }

  function patchExpandedItemText(rom, log, rows) {
    const file = findFileByPath(rom, MESSAGE_NARC_PATH);
    const narc = rom.slice(file.start, file.end);
    const banks = [
      { memberId: 391, label: "item descriptions", text: (row) => row.description },
      { memberId: 392, label: "item names", text: (row) => row.name },
      { memberId: 393, label: "item names with articles", text: (row) => row.article },
      { memberId: 394, label: "item names plural", text: (row) => row.plural },
    ];
    const replacements = banks.map((bank) => [
      bank.memberId,
      replaceMessageBankEntries(
        narcMemberBytes(narc, bank.memberId),
        rows.map((row) => [row.itemId, bank.text(row)]),
        { label: `Item Expansion ${bank.label}` }
      ),
    ]);
    const patchedNarc = replaceNarcMembers(narc, replacements);
    const replacement = replaceRomFileAllowGrowth(rom, file, patchedNarc, "Item Expansion item text");

    log.push(
      `Item Expansion: ${
        replacement.state === "already" ? "item text already patched" : "patched item text"
      } for ${rows.length} expanded item ID(s) ${hex(rows[0].itemId)}-${hex(rows[rows.length - 1].itemId)}${
        replacement.growth ? `; ROM grew by ${replacement.growth} byte(s)` : ""
      }.`
    );
    return replacement.rom;
  }

  function readS32(data, offset) {
    return readU32(data, offset) | 0;
  }

  function writeS32(data, offset, value) {
    writeU32(data, offset, value >>> 0);
  }

  function parseScriptOffsetTable(scriptData) {
    const offsets = [];
    let cursor = 0;
    while (cursor + 4 <= scriptData.length) {
      if (readU16(scriptData, cursor) === SCRIPT_HEADER_END) {
        return {
          offsets,
          headerSize: cursor + 2,
        };
      }
      const offset = readU32(scriptData, cursor) + cursor + 4;
      if (offset < cursor + 4 || offset > scriptData.length) {
        return null;
      }
      offsets.push(offset);
      cursor += 4;
    }
    return null;
  }

  function standardizedItemScriptInfo(scriptData) {
    const table = parseScriptOffsetTable(scriptData);
    if (!table || table.offsets.length < 2) {
      return { standardized: false };
    }
    const commonScriptOffset = table.offsets[table.offsets.length - 1];
    if (commonScriptOffset < table.headerSize || commonScriptOffset > scriptData.length) {
      return { standardized: false };
    }

    for (let index = 0; index < table.offsets.length - 1; index += 1) {
      const start = table.offsets[index];
      if (start + STANDARDIZED_ITEM_SCRIPT_LENGTH > scriptData.length) {
        return { standardized: false };
      }
      if (
        readU16(scriptData, start) !== SCRIPT_CMD_SET_VAR ||
        readU16(scriptData, start + 2) !== SCRIPT_VAR_ITEM_ID ||
        readU16(scriptData, start + 4) !== index ||
        readU16(scriptData, start + 6) !== SCRIPT_CMD_SET_VAR ||
        readU16(scriptData, start + 8) !== SCRIPT_VAR_ITEM_COUNT ||
        readU16(scriptData, start + 10) !== 1 ||
        readU16(scriptData, start + 12) !== SCRIPT_CMD_JUMP
      ) {
        return { standardized: false };
      }
      const jumpTarget = start + STANDARDIZED_ITEM_SCRIPT_LENGTH + readS32(scriptData, start + 14);
      if (jumpTarget !== commonScriptOffset) {
        return { standardized: false };
      }
    }

    return {
      standardized: true,
      itemScriptCount: table.offsets.length - 1,
      commonScriptOffset,
      trailingData: scriptData.slice(commonScriptOffset),
    };
  }

  function buildStandardizedItemScriptFile(itemScriptCount, trailingData) {
    const scriptCount = itemScriptCount + 1;
    const headerSize = scriptCount * 4 + 2;
    const commonScriptOffset = headerSize + itemScriptCount * STANDARDIZED_ITEM_SCRIPT_LENGTH;
    const out = new Uint8Array(commonScriptOffset + trailingData.length);

    for (let scriptIndex = 0; scriptIndex < scriptCount; scriptIndex += 1) {
      const entryOffset = scriptIndex * 4;
      const scriptOffset =
        scriptIndex === itemScriptCount
          ? commonScriptOffset
          : headerSize + scriptIndex * STANDARDIZED_ITEM_SCRIPT_LENGTH;
      writeU32(out, entryOffset, scriptOffset - entryOffset - 4);
    }
    writeU16(out, scriptCount * 4, SCRIPT_HEADER_END);

    for (let itemId = 0; itemId < itemScriptCount; itemId += 1) {
      const start = headerSize + itemId * STANDARDIZED_ITEM_SCRIPT_LENGTH;
      writeU16(out, start, SCRIPT_CMD_SET_VAR);
      writeU16(out, start + 2, SCRIPT_VAR_ITEM_ID);
      writeU16(out, start + 4, itemId);
      writeU16(out, start + 6, SCRIPT_CMD_SET_VAR);
      writeU16(out, start + 8, SCRIPT_VAR_ITEM_COUNT);
      writeU16(out, start + 10, 1);
      writeU16(out, start + 12, SCRIPT_CMD_JUMP);
      writeS32(out, start + 14, commonScriptOffset - (start + STANDARDIZED_ITEM_SCRIPT_LENGTH));
    }

    out.set(trailingData, commonScriptOffset);
    return out;
  }

  function patchStandardizedVisibleItemScripts(rom, log, rows) {
    const firstItemId = rows[0].itemId;
    const maxExpandedItemId = rows[rows.length - 1].itemId;
    const file = findFileByPath(rom, SCRIPT_NARC_PATH);
    const narc = rom.slice(file.start, file.end);
    const scriptData = narcMemberBytes(narc, VISIBLE_ITEM_SCRIPT_MEMBER);
    const info = standardizedItemScriptInfo(scriptData);
    if (!info.standardized) {
      log.push(
        `Item Expansion: visible-item script member ${VISIBLE_ITEM_SCRIPT_MEMBER} is not DSPRE-standardized; overworld pickups still need DSPRE Item Standardization or a script edit that sets variable 0x8008 to expanded item IDs ${hex(firstItemId)}-${hex(maxExpandedItemId)}.`
      );
      return rom;
    }

    const requiredItemScriptCount = maxExpandedItemId + 1;
    if (info.itemScriptCount >= requiredItemScriptCount) {
      log.push(
        `Item Expansion: DSPRE-standardized visible-item scripts already cover expanded item IDs through ${hex(
          info.itemScriptCount - 1
        )}.`
      );
      return rom;
    }

    const rebuiltScriptData = buildStandardizedItemScriptFile(requiredItemScriptCount, info.trailingData);
    const patchedNarc = replaceNarcMembers(narc, [[VISIBLE_ITEM_SCRIPT_MEMBER, rebuiltScriptData]]);
    const result = replaceRomFileAllowGrowth(rom, file, patchedNarc, "Item Expansion visible-item scripts");
    log.push(
      `Item Expansion: extended DSPRE-standardized visible-item scripts from item ID ${hex(
        info.itemScriptCount - 1
      )} through ${hex(maxExpandedItemId)}${result.growth ? `; ROM grew by ${result.growth} byte(s)` : ""}.`
    );
    return result.rom;
  }

  async function patchItemExpansion(rom, force, log, options = {}) {
    const originalRom = rom;
    let rows = normalizedExpandedItemRows(options, rom);
    const assets = patchNatureMintAssets(rom, log, rows);
    rom = assets.rom;
    rows = assets.rows;
    const bottleAssets = patchBottleCapAssets(rom, log, rows);
    rom = bottleAssets.rom;
    rows = bottleAssets.rows;
    const archiveEntries = buildArchiveEntries(rom, rows);
    await patchItemExpansionArm9Hooks(rom, force, log, archiveEntries);
    const textPatchedRom = patchExpandedItemText(rom, log, rows);
    const patchedRom = patchStandardizedVisibleItemScripts(textPatchedRom, log, rows);
    log.push(
      `Item Expansion: configured ${rows
        .map(
          (row) =>
            `${hex(row.itemId)}=${row.name} clone ${hex(row.cloneFrom)} icon ${hex(row.iconFrom)}${
              row.moveName ? ` move ${row.moveName}` : ""
            }`
        )
        .join(", ")}.`
    );
    return patchedRom === originalRom ? undefined : patchedRom;
  }

  return {
    itemExpansion: patchItemExpansion,
    normalizedExpandedItemRows,
    expandedExtraTmEntries,
    expandedNatureMintEntries,
    expandedBottleCapEntries,
    extraTmsExpandedCountOption,
    readMoveNames,
    manualExpandedItemCount,
  };
});
