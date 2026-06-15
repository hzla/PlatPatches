(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory;
    return;
  }
  root.PlatinumPatcherOverworldSpritePatches = factory(root.PlatinumPatcherCore);
})(typeof globalThis !== "undefined" ? globalThis : this, function (core) {
  "use strict";

  if (!core) {
    throw new Error("Overworld sprite patches require PlatinumPatcherCore to load first.");
  }

  const {
    OVERLAY_5,
    PatchError,
    SyntheticOverlayAllocator,
    asciiBytes,
    findFileByPath,
    findNeedle,
    getArm9Info,
    getOverlayRange,
    hex,
    parseNarc,
    readU32,
    writeU32,
  } = core;

  const MARKER = "OWTBLXPANDV1";
  const HEADER_SIZE = 0x20;
  const CUSTOM_ROW_CAPACITY = 256;
  const DEFAULT_CLONE_FROM = 0x78;
  const MMODEL_NARC_PATH = "data/mmodel/mmodel.narc";

  const TABLES = [
    {
      key: "renderer",
      label: "renderer behavior",
      sourceRam: 0x021fb97c,
      entrySize: 8,
      expectedCount: 258,
      pointerScope: "arm9",
      expectedRefs: 1,
    },
    {
      key: "renderProps",
      label: "render properties",
      sourceRam: 0x021fc194,
      entrySize: 8,
      expectedCount: 259,
      pointerScope: "overlay5",
      expectedRefs: 1,
    },
    {
      key: "texture",
      label: "texture association",
      sourceRam: 0x021fc9b4,
      entrySize: 8,
      expectedCount: 440,
      pointerScope: "overlay5",
      expectedRefs: 3,
    },
    {
      key: "animation",
      label: "animation metadata",
      sourceRam: 0x021fd77c,
      entrySize: 16,
      expectedCount: 440,
      pointerScope: "overlay5",
      expectedRefs: 1,
    },
  ];

  function parseInteger(token, label) {
    const text = token === undefined || token === null ? "" : String(token).trim();
    if (!text) {
      throw new PatchError(`Custom overworld sprite entry is missing ${label}.`);
    }
    const value = /^0x[0-9a-f]+$/i.test(text)
      ? Number.parseInt(text.slice(2), 16)
      : Number.parseInt(text, 10);
    if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
      throw new PatchError(`Custom overworld sprite ${label} "${text}" is not a valid number.`);
    }
    return value >>> 0;
  }

  function assertAllowedAppearanceId(appearanceId, label) {
    if (appearanceId > 0xffff) {
      throw new PatchError(`${label} uses appearance ID ${hex(appearanceId)}, which is outside the 16-bit range.`);
    }
    if (appearanceId === 0xffff) {
      throw new PatchError(`${label} uses reserved sentinel ID 0xFFFF.`);
    }
    if (appearanceId === 0x64 || (appearanceId >= 0x65 && appearanceId <= 0x74)) {
      throw new PatchError(`${label} uses reserved field graphics ID ${hex(appearanceId)}.`);
    }
    if (appearanceId >= 0x1000 && appearanceId <= 0x10c0) {
      throw new PatchError(`${label} uses berry-growth resource ID ${hex(appearanceId)}.`);
    }
    if (appearanceId === 0x2000) {
      throw new PatchError(`${label} uses special-case ID 0x2000.`);
    }
  }

  function pushParsedEntry(entries, seen, appearanceId, mmodelMember, cloneFrom, label) {
    assertAllowedAppearanceId(appearanceId, label);
    assertAllowedAppearanceId(cloneFrom, `${label} clone source`);
    if (seen.has(appearanceId)) {
      throw new PatchError(`Custom overworld sprite appearance ID ${hex(appearanceId)} is listed more than once.`);
    }
    if (entries.length >= CUSTOM_ROW_CAPACITY) {
      throw new PatchError(
        `Custom overworld sprites supports at most ${CUSTOM_ROW_CAPACITY} entries in this table allocation.`
      );
    }

    seen.add(appearanceId);
    entries.push({ appearanceId, mmodelMember, cloneFrom });
  }

  function parseCustomOverworldSpriteEntries(source) {
    const entries = [];
    const seen = new Set();

    if (Array.isArray(source)) {
      for (let i = 0; i < source.length; i += 1) {
        const row = source[i] || {};
        const appearanceId = parseInteger(row.appearanceId, `row ${i + 1} appearance ID`);
        const mmodelMember = parseInteger(row.mmodelMember, `row ${i + 1} mmodel member index`);
        const cloneFrom =
          row.cloneFrom === undefined || row.cloneFrom === ""
            ? DEFAULT_CLONE_FROM
            : parseInteger(row.cloneFrom, `row ${i + 1} clone source ID`);
        pushParsedEntry(entries, seen, appearanceId, mmodelMember, cloneFrom, `Custom overworld sprite row ${i + 1}`);
      }
      return entries;
    }

    const lines = String(source || "").split(/\r?\n/);

    for (let i = 0; i < lines.length; i += 1) {
      const withoutComment = lines[i].replace(/#.*/, "").trim();
      if (!withoutComment) {
        continue;
      }

      const parts = withoutComment.split(/[,\s]+/).filter(Boolean);
      if (parts.length < 2 || parts.length > 3) {
        throw new PatchError(
          `Custom overworld sprite line ${i + 1} needs: appearanceId, mmodelMember, optional cloneFrom.`
        );
      }

      const appearanceId = parseInteger(parts[0], "appearance ID");
      const mmodelMember = parseInteger(parts[1], "mmodel member index");
      const cloneFrom = parts.length === 3 ? parseInteger(parts[2], "clone source ID") : DEFAULT_CLONE_FROM;
      pushParsedEntry(entries, seen, appearanceId, mmodelMember, cloneFrom, `Custom overworld sprite line ${i + 1}`);
    }

    return entries;
  }

  function readMmodelMemberCount(rom) {
    const file = findFileByPath(rom, MMODEL_NARC_PATH);
    const narc = rom.slice(file.start, file.end);
    return parseNarc(narc).entries.length;
  }

  function u32Bytes(value) {
    return new Uint8Array([
      value & 0xff,
      (value >>> 8) & 0xff,
      (value >>> 16) & 0xff,
      (value >>> 24) & 0xff,
    ]);
  }

  function sourceTableOffset(overlay, table) {
    const rel = table.sourceRam - overlay.loadAddress;
    if (rel < 0 || overlay.start + rel + table.entrySize > overlay.end) {
      throw new PatchError(`${table.label} table source ${hex(table.sourceRam)} is outside overlay 5.`);
    }
    return overlay.start + rel;
  }

  function readTable(rom, overlay, table) {
    const start = sourceTableOffset(overlay, table);
    const maxRows = 2048;
    const rows = [];
    let sentinel = null;

    for (let i = 0; i < maxRows; i += 1) {
      const offset = start + i * table.entrySize;
      if (offset + table.entrySize > overlay.end) {
        break;
      }
      const row = rom.slice(offset, offset + table.entrySize);
      if (readU32(row, 0) === 0xffff) {
        sentinel = row;
        break;
      }
      rows.push(row);
    }

    if (!sentinel) {
      throw new PatchError(`Could not find the ${table.label} table sentinel in overlay 5.`);
    }
    if (rows.length < Math.floor(table.expectedCount * 0.75)) {
      throw new PatchError(
        `${table.label} table looked too short: found ${rows.length} rows, expected about ${table.expectedCount}.`
      );
    }

    return { rows, sentinel };
  }

  function findRow(tableData, id, tableLabel) {
    for (const row of tableData.rows) {
      if (readU32(row, 0) === id) {
        return row;
      }
    }
    throw new PatchError(`${tableLabel} clone source ID ${hex(id)} was not found.`);
  }

  function hasRow(tableData, id) {
    return tableData.rows.some((row) => readU32(row, 0) === id);
  }

  function buildExpandedTable(table, tableData, customEntries) {
    const rowCount = tableData.rows.length + CUSTOM_ROW_CAPACITY + 1;
    const bytes = new Uint8Array(rowCount * table.entrySize);
    let cursor = 0;

    for (const row of tableData.rows) {
      bytes.set(row, cursor);
      cursor += table.entrySize;
    }

    for (const entry of customEntries) {
      let row;
      if (table.key === "texture") {
        row = new Uint8Array(table.entrySize);
        writeU32(row, 0, entry.appearanceId);
        writeU32(row, 4, entry.mmodelMember);
      } else {
        row = new Uint8Array(findRow(tableData, entry.cloneFrom, table.label));
        writeU32(row, 0, entry.appearanceId);
      }
      bytes.set(row, cursor);
      cursor += table.entrySize;
    }

    bytes.set(tableData.sentinel, cursor);
    return bytes;
  }

  function buildPayload(rom, overlay, tableDataByKey, customEntries, payloadAddress) {
    const expandedTables = TABLES.map((table) => ({
      ...table,
      bytes: buildExpandedTable(table, tableDataByKey[table.key], customEntries),
    }));
    const tableStart = HEADER_SIZE;
    const totalLength = tableStart + expandedTables.reduce((sum, table) => sum + table.bytes.length, 0);
    const bytes = new Uint8Array(totalLength);
    const markerBytes = asciiBytes(MARKER);
    const tableAddresses = {};
    let cursor = tableStart;

    bytes.set(markerBytes, 0);
    writeU32(bytes, 0x10, 1);
    writeU32(bytes, 0x14, CUSTOM_ROW_CAPACITY);
    writeU32(bytes, 0x18, customEntries.length);
    writeU32(bytes, 0x1c, 0);

    for (const table of expandedTables) {
      tableAddresses[table.key] = payloadAddress + cursor;
      bytes.set(table.bytes, cursor);
      cursor += table.bytes.length;
    }

    return { bytes, tableAddresses };
  }

  function scopedAddressHits(rom, address, start, end) {
    return findNeedle(rom, u32Bytes(address), start, end);
  }

  function patchAddressReferences(rom, table, overlay, newAddress, force) {
    let start;
    let end;
    if (table.pointerScope === "arm9") {
      const arm9 = getArm9Info(rom);
      start = arm9.fileOffset;
      end = arm9.fileOffset + arm9.size;
    } else {
      start = overlay.start;
      end = overlay.end;
    }

    const oldHits = scopedAddressHits(rom, table.sourceRam, start, end);
    if (oldHits.length === table.expectedRefs) {
      for (const offset of oldHits) {
        writeU32(rom, offset, newAddress);
      }
      return { state: "patched", hits: oldHits };
    }
    if (oldHits.length > 0) {
      throw new PatchError(
        `${table.label} table pointer matched ${oldHits.length} locations; expected ${table.expectedRefs}.`
      );
    }

    const newHits = scopedAddressHits(rom, newAddress, start, end);
    if (newHits.length === table.expectedRefs) {
      return { state: "already", hits: newHits };
    }
    if (newHits.length > 0) {
      throw new PatchError(
        `${table.label} relocated pointer matched ${newHits.length} locations; expected ${table.expectedRefs}.`
      );
    }
    if (force) {
      throw new PatchError(
        `${table.label} table pointer could not be found even in compatibility mode; refusing to guess.`
      );
    }
    throw new PatchError(`${table.label} table pointer could not be found.`);
  }

  function validateCustomEntries(tableDataByKey, customEntries, mmodelMemberCount) {
    for (const entry of customEntries) {
      if (entry.mmodelMember >= mmodelMemberCount) {
        throw new PatchError(
          `Custom overworld sprite ID ${hex(entry.appearanceId)} points to mmodel member ${hex(
            entry.mmodelMember
          )}, but ${MMODEL_NARC_PATH} only has ${mmodelMemberCount} member(s).`
        );
      }
      for (const table of TABLES) {
        if (hasRow(tableDataByKey[table.key], entry.appearanceId)) {
          throw new PatchError(
            `Custom overworld sprite ID ${hex(entry.appearanceId)} already exists in the ${table.label} table.`
          );
        }
      }
      for (const table of TABLES) {
        if (table.key !== "texture") {
          findRow(tableDataByKey[table.key], entry.cloneFrom, table.label);
        }
      }
    }
  }

  async function patchCustomOverworldSprites(rom, force, log, options = {}) {
    const customEntries = parseCustomOverworldSpriteEntries(options.customOverworldSprites);
    const mmodelMemberCount = readMmodelMemberCount(rom);
    const overlay = getOverlayRange(rom, OVERLAY_5);
    const tableDataByKey = {};
    for (const table of TABLES) {
      tableDataByKey[table.key] = readTable(rom, overlay, table);
    }
    validateCustomEntries(tableDataByKey, customEntries, mmodelMemberCount);

    const allocator = new SyntheticOverlayAllocator(rom, log);
    const allocation = allocator.allocate({
      marker: MARKER,
      buildPayload: (payloadAddress) => buildPayload(rom, overlay, tableDataByKey, customEntries, payloadAddress),
      label: "Custom overworld sprite tables",
      alignment: 0x10,
      updateExisting: true,
    });

    const refResults = [];
    for (const table of TABLES) {
      const result = patchAddressReferences(
        rom,
        table,
        overlay,
        allocation.built.tableAddresses[table.key],
        force
      );
      refResults.push({ table, ...result });
    }

    const patchedRefs = refResults
      .filter((result) => result.state === "patched")
      .map((result) => result.table.label);
    const rowText = customEntries.length
      ? customEntries
          .map(
            (entry) =>
              `${hex(entry.appearanceId)} -> mmodel ${hex(entry.mmodelMember)} cloned from ${hex(entry.cloneFrom)}`
          )
          .join("; ")
      : `no custom rows yet; reserved ${CUSTOM_ROW_CAPACITY} entries`;

    log.push(
      `Custom overworld sprite tables: relocated ${TABLES.length} table(s) to synthetic-overlay RAM ${hex(
        allocation.payloadRamAddress
      )}; ${
        patchedRefs.length ? `updated pointers for ${patchedRefs.join(", ")}` : "pointers already relocated"
      }.`
    );
    log.push(`Custom overworld sprite entries: ${rowText}.`);
  }

  return {
    customOverworldSprites: patchCustomOverworldSprites,
    parseCustomOverworldSpriteEntries,
  };
});
