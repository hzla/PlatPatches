(() => {
  "use strict";

  class PatchError extends Error {
    constructor(message) {
      super(message);
      this.name = "PatchError";
    }
  }

  const PATCHES = {
    frameRate: "Unlock framerate",
    shinyOdds: "Shiny odds",
    noCrits: "No critical hits",
    iv15_31: "Random IV range",
    wildNatures: "Filter wild natures",
    movementSpeed: "Faster movement",
    fairyType: "Fairy Patch",
    fairyPokemonTypes: "Update Pokemon Types",
    instantText: "Force fast text",
    text4x: "Experimental text speed",
    playerAccuracy: "Player accuracy bypass",
  };
  const APP_VERSION = "v23";
  const CONSOLE_CONFIG = {
    debugFairyBattleTest: false,
  };

  const OVERLAY_6 = 6;
  const OVERLAY_16 = 16;
  const OVERLAY_21 = 21;
  const SPECIES_JIGGLYPUFF = 39;
  const NOP = [0xc0, 0x46];

  const hex = (value) => `0x${value.toString(16).toUpperCase()}`;

  function bytesFromHex(text) {
    const clean = text.replace(/[^0-9a-f]/gi, "");
    if (clean.length % 2 !== 0) {
      throw new Error("internal patch hex has an odd number of digits");
    }
    const out = new Uint8Array(clean.length / 2);
    for (let i = 0; i < out.length; i += 1) {
      out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    }
    return out;
  }

  function bytesEqual(data, offset, expected) {
    if (offset < 0 || offset + expected.length > data.length) {
      return false;
    }
    for (let i = 0; i < expected.length; i += 1) {
      if (data[offset + i] !== expected[i]) {
        return false;
      }
    }
    return true;
  }

  function readU32(data, offset) {
    return (
      data[offset] |
      (data[offset + 1] << 8) |
      (data[offset + 2] << 16) |
      (data[offset + 3] << 24)
    ) >>> 0;
  }

  function readU16(data, offset) {
    return data[offset] | (data[offset + 1] << 8);
  }

  function writeU16(data, offset, value) {
    data[offset] = value & 0xff;
    data[offset + 1] = (value >>> 8) & 0xff;
  }

  function writeU32(data, offset, value) {
    data[offset] = value & 0xff;
    data[offset + 1] = (value >>> 8) & 0xff;
    data[offset + 2] = (value >>> 16) & 0xff;
    data[offset + 3] = (value >>> 24) & 0xff;
  }

  function writeBytes(data, offset, patch) {
    if (offset < 0 || offset + patch.length > data.length) {
      throw new PatchError(`Patch at ${hex(offset)} points outside the ROM.`);
    }
    data.set(patch, offset);
  }

  function padBytes(source, size, pad = NOP) {
    if (source.length > size) {
      throw new Error("internal patch is larger than its reserved space");
    }
    const out = new Uint8Array(size);
    out.set(source);
    for (let i = source.length; i < size; i += pad.length) {
      for (let j = 0; j < pad.length && i + j < size; j += 1) {
        out[i + j] = pad[j];
      }
    }
    return out;
  }

  function requireBytes(data, offset, expected, alreadyPatched, force, label) {
    if (bytesEqual(data, offset, alreadyPatched)) {
      return "already";
    }
    if (!bytesEqual(data, offset, expected) && !force) {
      const found = Array.from(data.slice(offset, offset + expected.length))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join(" ");
      throw new PatchError(
        `${label} sanity check failed at ${hex(offset)}. Found ${found}. Enable compatible modified bytes to patch anyway.`
      );
    }
    return "patch";
  }

  function getArm9Info(rom) {
    const fileOffset = readU32(rom, 0x20);
    const loadAddress = readU32(rom, 0x28);
    const size = readU32(rom, 0x2c);
    if (fileOffset + size > rom.length) {
      throw new PatchError("ARM9 static binary points outside the ROM.");
    }
    return { fileOffset, loadAddress, size };
  }

  function arm9Offset(rom, ramAddress, size = 1) {
    const arm9 = getArm9Info(rom);
    if (ramAddress < arm9.loadAddress || ramAddress + size > arm9.loadAddress + arm9.size) {
      throw new PatchError(`${hex(ramAddress)} is outside the ARM9 static binary.`);
    }
    return arm9.fileOffset + (ramAddress - arm9.loadAddress);
  }

  function getOverlayRange(rom, overlayId) {
    const fatOffset = readU32(rom, 0x48);
    const fatSize = readU32(rom, 0x4c);
    const overlayTableOffset = readU32(rom, 0x50);
    const overlayTableSize = readU32(rom, 0x54);

    if (!overlayTableOffset || !overlayTableSize) {
      throw new PatchError("ROM has no ARM9 overlay table.");
    }
    if (overlayTableOffset + overlayTableSize > rom.length) {
      throw new PatchError("ARM9 overlay table points outside the ROM.");
    }

    for (
      let entry = overlayTableOffset;
      entry < overlayTableOffset + overlayTableSize;
      entry += 32
    ) {
      if (readU32(rom, entry) !== overlayId) {
        continue;
      }

      const loadAddress = readU32(rom, entry + 4);
      const size = readU32(rom, entry + 8);
      const fileId = readU32(rom, entry + 24);
      const fatEntry = fatOffset + fileId * 8;

      if (fatEntry + 8 > fatOffset + fatSize || fatEntry + 8 > rom.length) {
        throw new PatchError(`FAT entry for overlay ${overlayId} points outside the ROM.`);
      }

      const start = readU32(rom, fatEntry);
      const end = readU32(rom, fatEntry + 4);
      if (!(start >= 0 && start < end && end <= rom.length)) {
        throw new PatchError(`Overlay ${overlayId} has an invalid file range.`);
      }
      return { start, end, loadAddress, size };
    }

    throw new PatchError(`Could not find overlay ${overlayId}.`);
  }

  function overlayOffset(rom, overlayId, relativeOffset, size = 1) {
    const overlay = getOverlayRange(rom, overlayId);
    const offset = overlay.start + relativeOffset;
    if (relativeOffset < 0 || offset + size > overlay.end) {
      throw new PatchError(`Overlay ${overlayId}+${hex(relativeOffset)} points outside the overlay.`);
    }
    return { offset, overlay };
  }

  function findNeedle(data, needle, start, end) {
    const hits = [];
    const cappedStart = Math.max(0, start);
    const cappedEnd = Math.min(data.length, end);
    for (let i = cappedStart; i <= cappedEnd - needle.length; i += 1) {
      let ok = true;
      for (let j = 0; j < needle.length; j += 1) {
        if (data[i + j] !== needle[j]) {
          ok = false;
          break;
        }
      }
      if (ok) {
        hits.push(i);
      }
    }
    return hits;
  }

  function locateNearby(data, preferredOffset, expected, alreadyPatched, radius, label) {
    if (bytesEqual(data, preferredOffset, expected) || bytesEqual(data, preferredOffset, alreadyPatched)) {
      return { offset: preferredOffset, usedFallback: false };
    }

    const hits = [
      ...findNeedle(data, expected, preferredOffset - radius, preferredOffset + radius),
      ...findNeedle(data, alreadyPatched, preferredOffset - radius, preferredOffset + radius),
    ];
    const uniqueHits = Array.from(new Set(hits));

    if (uniqueHits.length === 1) {
      return { offset: uniqueHits[0], usedFallback: true };
    }
    if (uniqueHits.length > 1) {
      throw new PatchError(
        `${label} fallback scan found multiple candidate offsets: ${uniqueHits.map(hex).join(", ")}.`
      );
    }

    return { offset: preferredOffset, usedFallback: false };
  }

  function getFatInfo(rom) {
    return {
      offset: readU32(rom, 0x48),
      size: readU32(rom, 0x4c),
    };
  }

  function getFatEntry(rom, fileId) {
    const fat = getFatInfo(rom);
    const entry = fat.offset + fileId * 8;
    if (entry + 8 > fat.offset + fat.size || entry + 8 > rom.length) {
      throw new PatchError(`FAT entry ${fileId} points outside the ROM.`);
    }
    return { entry, start: readU32(rom, entry), end: readU32(rom, entry + 4) };
  }

  function writeFatEntryEnd(rom, fileId, end) {
    const fatEntry = getFatEntry(rom, fileId);
    writeU32(rom, fatEntry.entry + 4, end);
  }

  function findFileByPath(rom, wantedPath) {
    const fntOffset = readU32(rom, 0x40);
    const fntSize = readU32(rom, 0x44);
    const fat = getFatInfo(rom);
    const visited = new Set();

    function readDir(dirId, basePath) {
      if (visited.has(dirId)) {
        return null;
      }
      visited.add(dirId);
      const dirIndex = dirId & 0x0fff;
      const rootEntry = fntOffset + dirIndex * 8;
      if (rootEntry + 8 > fntOffset + fntSize || rootEntry + 8 > rom.length) {
        return null;
      }

      const subtable = fntOffset + readU32(rom, rootEntry);
      if (subtable < fntOffset || subtable >= fntOffset + fntSize) {
        return null;
      }

      let fileId = readU16(rom, rootEntry + 4);
      let cursor = subtable;
      while (cursor < fntOffset + fntSize) {
        const packedLength = rom[cursor];
        cursor += 1;
        if (packedLength === 0) {
          break;
        }

        const isDirectory = Boolean(packedLength & 0x80);
        const nameLength = packedLength & 0x7f;
        if (cursor + nameLength > fntOffset + fntSize) {
          break;
        }
        const name = String.fromCharCode(...rom.slice(cursor, cursor + nameLength));
        cursor += nameLength;

        if (isDirectory) {
          if (cursor + 2 > fntOffset + fntSize) {
            break;
          }
          const found = readDir(readU16(rom, cursor), `${basePath}${name}/`);
          cursor += 2;
          if (found) {
            return found;
          }
        } else {
          const fullPath = `${basePath}${name}`;
          if (fullPath === wantedPath) {
            const entry = fat.offset + fileId * 8;
            if (entry + 8 > fat.offset + fat.size || entry + 8 > rom.length) {
              throw new PatchError(`FAT entry for ${wantedPath} points outside the ROM.`);
            }
            const start = readU32(rom, entry);
            const end = readU32(rom, entry + 4);
            return { fileId, start, end, size: end - start };
          }
          fileId += 1;
        }
      }
      return null;
    }

    const file = readDir(0xf000, "");
    if (!file) {
      throw new PatchError(`Could not find ${wantedPath} in the ROM filesystem.`);
    }
    return file;
  }

  function readMagic(data, offset) {
    return String.fromCharCode(data[offset], data[offset + 1], data[offset + 2], data[offset + 3]);
  }

  function parseNarc(data) {
    if (readMagic(data, 0) !== "NARC") {
      throw new PatchError("Expected a NARC archive.");
    }

    let cursor = 0x10;
    let fatBlock = null;
    let dataBlock = null;
    for (let block = 0; block < 3 && cursor + 8 <= data.length; block += 1) {
      const magic = readMagic(data, cursor);
      const size = readU32(data, cursor + 4);
      if (size < 8 || cursor + size > data.length) {
        throw new PatchError("NARC archive has an invalid block size.");
      }
      if (magic === "BTAF" || magic === "FATB") {
        fatBlock = { offset: cursor, size };
      } else if (magic === "GMIF" || magic === "FIMG") {
        dataBlock = { offset: cursor, size, dataOffset: cursor + 8 };
      }
      cursor += size;
    }

    if (!fatBlock || !dataBlock) {
      throw new PatchError("NARC archive is missing file allocation or data blocks.");
    }

    const count = readU32(data, fatBlock.offset + 8);
    const entries = [];
    for (let i = 0; i < count; i += 1) {
      const entry = fatBlock.offset + 12 + i * 8;
      if (entry + 8 > fatBlock.offset + fatBlock.size) {
        throw new PatchError("NARC file allocation table is truncated.");
      }
      const start = readU32(data, entry);
      const end = readU32(data, entry + 4);
      if (start > end || dataBlock.dataOffset + end > data.length) {
        throw new PatchError("NARC member points outside the archive.");
      }
      entries.push({ start, end, fatEntry: entry });
    }

    return { fatBlock, dataBlock, entries };
  }

  function replaceNarcMembers(narc, replacements) {
    const parsed = parseNarc(narc);
    const replacementMap = new Map(replacements);
    const chunks = [];
    const rebuiltEntries = [];
    let cursor = 0;

    for (let i = 0; i < parsed.entries.length; i += 1) {
      const entry = parsed.entries[i];
      const member = replacementMap.get(i) || narc.slice(parsed.dataBlock.dataOffset + entry.start, parsed.dataBlock.dataOffset + entry.end);
      rebuiltEntries.push({ start: cursor, end: cursor + member.length });
      chunks.push(member);
      cursor += member.length;
      const aligned = (cursor + 3) & ~3;
      if (aligned !== cursor) {
        chunks.push(new Uint8Array(aligned - cursor));
        cursor = aligned;
      }
    }

    const header = new Uint8Array(narc.slice(0, parsed.dataBlock.dataOffset));
    const data = new Uint8Array(cursor);
    let dataCursor = 0;
    for (const chunk of chunks) {
      data.set(chunk, dataCursor);
      dataCursor += chunk.length;
    }

    for (let i = 0; i < rebuiltEntries.length; i += 1) {
      const entry = parsed.entries[i].fatEntry;
      writeU32(header, entry, rebuiltEntries[i].start);
      writeU32(header, entry + 4, rebuiltEntries[i].end);
    }
    writeU32(header, 8, header.length + data.length);
    writeU32(header, parsed.dataBlock.offset + 4, 8 + data.length);

    const rebuilt = new Uint8Array(header.length + data.length);
    rebuilt.set(header);
    rebuilt.set(data, header.length);
    return rebuilt;
  }

  function replaceRomFile(rom, file, replacement, label) {
    const oldSize = file.end - file.start;
    if (bytesEqual(rom, file.start, replacement) && oldSize === replacement.length) {
      return "already";
    }
    if (replacement.length > oldSize) {
      const next = getFatEntry(rom, file.fileId + 1);
      const growth = replacement.length - oldSize;
      if (next.start < file.end + growth) {
        throw new PatchError(`${label} needs ${growth} extra byte(s), but the next file starts too soon.`);
      }
      for (let offset = file.end; offset < file.end + growth; offset += 1) {
        if (rom[offset] !== 0xff && rom[offset] !== 0x00) {
          throw new PatchError(`${label} does not have clean padding after the file.`);
        }
      }
    }
    writeBytes(rom, file.start, replacement);
    if (replacement.length < oldSize) {
      rom.fill(0xff, file.start + replacement.length, file.end);
    }
    writeFatEntryEnd(rom, file.fileId, file.start + replacement.length);
    return "patch";
  }

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
  const NATURE_STAT_GRID = [
    { key: "attack", label: "Attack", natureIndex: 0 },
    { key: "defense", label: "Defense", natureIndex: 1 },
    { key: "sp-atk", label: "Sp. Atk", natureIndex: 3 },
    { key: "sp-def", label: "Sp. Def", natureIndex: 4 },
    { key: "speed", label: "Speed", natureIndex: 2 },
  ];
  const DEFAULT_ALLOWED_NATURES = Array.from({ length: NATURE_NAMES.length }, (_, nature) => nature);

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

  const ACCURACY_TRAMPOLINE = bytesFromHex(`
    20 f0 b5 fd 00 20 08 b0 f8 bd c0 46 c0 46 c0 46 c0 46
  `);

  const ACCURACY_CAVE = bytesFromHex(`
    a0 42 07 dd 68 6e c0 07 04 d0 03 49 01 20 6a 58
    10 43 68 50 70 47 c0 46 6c 21 00 00
  `);

  const FAIRY_TET_PATCH = bytesFromHex(`
    00 05 00 08 0A 0A 0A 0B 0A 0C 0A 0F 0A 06 0A 05
    0A 10 0A 08 0B 0A 0B 0B 0B 0C 0B 04 0B 05 0B 10
    0D 0B 0D 0D 0D 0C 0D 04 0D 02 0D 10 0C 0A 0C 0B
    0C 0C 0C 03 0C 04 0C 02 0C 06 0C 05 0C 10 0C 08
    0F 0B 0F 0C 0F 0F 0F 04 0F 02 0F 10 0F 08 0F 0A
    01 00 01 0F 01 03 01 02 01 0E 01 06 01 05 01 11
    01 08 03 0C 03 03 03 04 03 05 03 07 03 08 04 0A
    04 0D 04 0C 04 03 04 02 04 06 04 05 04 08 02 0D
    02 0C 02 01 02 06 02 05 02 08 0E 01 0E 03 0E 0E
    0E 11 0E 08 06 0A 06 0C 06 01 06 03 06 02 06 0E
    06 07 06 11 06 08 05 0A 05 0F 05 01 05 04 05 02
    05 06 05 08 07 00 07 0E 07 11 07 08 07 07 10 10
    10 08 11 01 11 0E 11 07 11 11 11 08 08 0A 08 0B
    08 0D 08 0F 08 05 08 08 FE FE 00 07 01 07 10 09
    01 09 06 09 11 09 03 09 08 09 09 10 09 01 09 11
    09 08 09 0A 09 03 FF FF 00 00 00 00 00 00 00 00
    00 00 00 00 00 00 00 00 00 00 FF FF 11 11 44 41
    14 41 14 41 41 10 41 14 11 41 14 11 14 14 44 11
    44 11 11 44 44 11 11 04 41 40 14 41 44 41 14 41
    01 14 11 14 14 14 41 14 41 04 12 44 11 44 12 11
    14 41 00 00 11 14 44 44 11 1F FF FF FF FF FF
  `);

  const FAIRY_READ1_PATCH = bytesFromHex("c0 46 00 49 88 47 01 94 0f 02 c0 46");
  const FAIRY_READ2_PATCH = bytesFromHex("00 49 88 47 01 94 0f 02 c0 46 c0 46");
  const FAIRY_LOOP1_PATCH = bytesFromHex("c0 46");
  const FAIRY_LOOP2_PATCH = bytesFromHex("61 00 c0 46");
  const FAIRY_LOOP3_PATCH = bytesFromHex("c0 46");
  const FAIRY_ARM9_HELPER = bytesFromHex(`
    01 90 38 b4 0c 4b d2 1a 52 08 86 24 64 00 1b 19
    52 08 9b 5c 03 d2 f0 25 2b 40 1a 09 02 e0 0f 25
    2b 40 1a 46 05 25 6a 43 75 46 06 35 ae 46 38 bc
    28 46 39 46 01 49 08 47 d4 ec 26 02 3d b6 25 02
  `);
  const FAIRY_POKEDEX_DISPLAY_PATCH = bytesFromHex(`
    49 88 8f 44 22 00 26 00 2a 00 2e 00 32 00 36 00
    3a 00 3e 00 42 00 66 00 46 00 4a 00 4e 00 52 00
    56 00 5a 00 5e 00 62 00 00 20 70 47 06 20 70 47
    0e 20 70 47 0a 20 70 47 08 20 70 47 05 20 70 47
    0b 20 70 47 07 20 70 47 09 20 70 47 01 20 70 47
    03 20 70 47 02 20 70 47 04 20 70 47 0f 20 70 47
    0d 20 70 47 10 20 70 47 0c 20 70 47 12 20 70 47
  `);

  const FAIRY_PL_BATT_OBJ_ENTRY_74 = bytesFromHex(`
    52 4c 43 4e ff fe 00 01 9e 00 00 00 10 00 02 00
    54 54 4c 50 78 00 00 00 03 00 00 00 00 00 00 00
    a0 01 00 00 10 00 00 00 00 00 5f 1b 5e 19 d2 14
    1c 37 97 1e b1 19 ff 3f b5 3e 7b 63 6e 25 09 1d
    f7 6a 00 00 f0 39 ff 7f 00 00 19 7f 55 7a 6e 4d
    4d 7a 73 6f fa 77 e9 28 7f 45 1f 5b 92 31 14 51
    1b 5e 52 52 f0 39 ff 7f 00 00 f8 33 2f 2b 0b 22
    ee 7c e9 48 97 7e f5 12 9b 1b 4f 0a 9b 6e 7e 7b
    57 62 00 00 f0 39 ff 7f 50 4d 43 50 16 00 00 00
    03 00 ef be 08 00 00 00 00 00 01 00 02 00
  `);
  const FAIRY_PL_BATT_OBJ_ENTRY_236 = bytesFromHex(`
    10 30 01 00 00 52 47 43 4e ff fe 01 01 00 34 01
    00 00 10 00 01 00 04 52 41 48 43 24 00 0b 02 00
    0f 04 00 03 00 10 13 00 04 10 03 00 1f 40 18 40
    0b b0 bb bb bb ab aa 4a aa 40 01 fa ff 00 03 ee
    00 07 ae e8 10 0b 10 2e 00 1e bb 50 1e ef fa ef
    04 fa ee ef fe ee 00 08 ae ae 10 ff ff ae d0 1f
    ff fe ff ae ba 00 1e ef 00 1e 00 03 60 1f 0b 00
    5e ba ba 20 3f ef b0 03 80 6b 00 6f ea 00 73 aa
    21 aa ac 00 8b c0 cc cc cc 10 aa b0 00 4c ae 10
    6b 00 78 fe aa ee ea fc 00 97 30 a8 00 1e 20 1f
    10 8d 10 6b ff fe 07 ae ef ee ee ae e0 1f 00 a9
    c0 5d a8 20 e8 ca 00 5e 0c 11 0a
  `);

  const FAIRY_ZUKAN_ENTRY_88 = bytesFromHex(`
    10 5c 02 00 00 52 45 43 4e ff fe 00 01 00 5c 02
    00 00 10 00 03 00 04 4b 42 45 43 4c 00 0b 13 00
    03 01 00 18 00 00 00 00 16 a0 01 08 02 00 07 08
    10 12 17 00 07 05 00 e8 ff f8 ff 10 0f 0c c0 0f
    d5 10 37 90 1f 24 c0 2f 30 c0 3f 3c c0 4f 55 48
    c0 5f 54 c0 6f 60 c0 7f 6c c0 8f 55 78 c0 9f 84
    c0 af 90 c0 bf 9c c0 cf 55 a8 c0 df b4 c0 ef c0
    80 ff 06 01 0f 44 cc a1 0f 18 0a f0 01 37 49 00
    00 0f 00 aa ff dc ff f8 40 00 e8 81 00 00 f8 00
    08 40 24 02 00 10 0b 03 20 10 0b 05 20 92 10 17
    06 10 10 17 08 10 10 23 09 aa 20 17 0b 20 17 0c
    20 17 0e 20 17 0f aa 20 23 11 20 23 12 20 3b 14
    20 3b 15 aa 20 47 17 20 47 18 20 47 1a 20 47 1b
    a4 20 6b 1d 20 6b 1e 30 10 77 20 30 aa 10 83 21
    20 0b 23 20 0b 24 20 17 26 aa 20 17 27 20 9b 29
    20 9b 2a 20 a7 2c aa 20 a7 2d 20 9b 2f 20 9b 30
    20 b3 32 00 20 dc 40 aa e1 33 40 dc 00 40 ea c1
    3b 40 dc 00 2a 00 a0 43 40 f0 40 aa c1 33 c0 00
    05 10 11 f0 00 2a 80 43 40 a0 10 e9 4a 20 71 4b
    30
  `);
  const FAIRY_ZUKAN_ENTRY_89 = bytesFromHex(`
    10 44 02 00 00 52 4e 41 4e ff fe 00 01 00 44 02
    00 00 10 00 03 00 05 4b 4e 42 41 34 00 0b 13 00
    01 00 18 00 00 00 48 01 00 00 73 e0 00 03 50 01
    30 0a 01 00 00 2e e0 0f 5d 08 c0 1f 10 c0 2f 10
    4f 90 3f 20 c0 4f 55 28 c0 5f 30 c0 6f 38 c0 7f
    40 c0 8f 55 48 c0 9f 50 c0 af 58 c0 bf 60 c0 cf
    55 68 c0 df 70 c0 ef 78 c0 ff 80 c1 0f 50 88 c1
    1f 90 41 36 04 00 ef be 77 04 40 07 11 23 10 0f
    0c 40 17 11 23 10 1f 77 14 40 27 11 73 10 2f 1c
    40 37 11 23 10 3f 77 24 40 47 11 23 10 4f 2c 40
    57 11 23 10 5f 77 34 40 67 11 23 10 6f 3c 40 77
    11 23 10 7f 70 44 40 87 11 23 10 8f 00 00 cc cc
    55 01 00 03 02 00 07 03 00 0b 04 00 0f 55 05 00
    13 06 00 17 07 00 1b 08 00 1f 55 09 00 23 0a 00
    27 0b 00 2b 0c 00 2f 55 0d 00 33 0e 00 37 0f 00
    3b 10 00 3f 50 11 00 43 12 00 47
  `);
  const FAIRY_ZUKAN_ENTRY_90 = bytesFromHex(`
    10 b0 26 00 00 52 47 43 4e ff fe 01 01 00 b4 26
    00 00 10 00 01 00 04 52 41 48 43 a4 00 0b 0a 00
    0a 20 00 03 00 10 13 20 00 05 00 28 00 80 00 1f
    18 00 0f d0 dd dd 00 dd ed 22 22 22 2d 11 11 00
    11 2d 31 e1 1e 2d 11 e1 6a ee 90 03 00 1e dd 00
    1e 22 00 1e 11 00 e1 1e e1 ee e1 fe ee ee 09 ef
    fe ee ff 00 03 1f ee 00 03 c3 90 1f 00 1e 1e ee
    e1 ee 20 20 30 03 56 ee c0 3f 11 00 1e e1 10 16
    30 03 fe 51 fe 10 6b fe a0 03 31 11 ff 10 8b 0f
    1d 33 33 33 10 9b 10 63 40 03 00 7b 0e e1 ee 11
    ff 00 01 00 ab 00 1e 33 d4 10 9b 00 63 fe 50 6f
    fe 10 98 11 ff 45 f1 90 1f ef fe ff 00 b3 11 00
    b3 8c 30 03 1f ff 11 a0 1f 90 df 11 ee 2b 1e e1
    00 b2 e1 00 df ef 50 03 01 1e 50 0d 01 1e d1 01
    1e d3 1e 11 13 3b d3 fe 00 07 90 03 00 e2 ef 20
    03 40 33 0c 1f ff f1 1f 90 9f 50 2f ee 1e 80 00
    03 fe 11 d3 ff ff 13 d3 d0 10 4b 40 be 0d 21 7f
    88 88 88 8d 07 77 77 77 8d 97 00 03 10 07 80 03
    d0 11 7f 00 1e 88 00 1e 77 77 e7 ee 4c ee 30 03
    fe ff 50 0b 90 1f 7e e7 16 7e e7 fe 00 01 ff 00
    05 00 23 e7 7a 7f 00 0d 90 3f 30 3d 00 23 ef 10
    25 fe 98 00 4d fe e7 d0 6f 50 83 7d 99 99 6c 99
    12 1b 30 6b fe 00 7b 40 03 77 ff df 20 8a 00 1e
    99 12 1b 10 63 10 6b 60 03 c0 1f 3b ee ee 00 8d
    10 73 40 01 ff c0 3f b0 9f 41 7e 00 a3 fe 77 fe
    ff ff 10 ab aa 00 af 7f 10 ff 0d 01 1e d7 01 1e
    d9 1c 77 77 79 00 03 10 07 70 03 fe ff 37 7f 77
    10 95 50 3b ff 00 3b 90 9f d0 2f e0 50 43 40 be
    31 7f 55 55 55 5d 44 08 44 44 5d 64 00 03 44 44
    e4 e8 90 03 12 ff 00 1e 55 00 1e 44 ee ee 91 00
    02 ee 4e 22 67 fe 44 ff 02 fe 68 4e 23 1f 60 1f
    4e 10 1f e4 ee ff b3 03 21 4f 43 04 a0 3f 44 e4
    10 3e 23 3f 43 e4 03 47 e4 fe e4 ee c0 6f 50 83
    06 44 4d 66 66 66 13 9b 02 d5 ee 70 fe 10 2c 13
    00 00 59 f4 ff 4f f4 d2 10 8b 00 1e 66 22 ff fe
    ef 03 66 e4 62 ee 10 6f 20 03 f4 4f ff b0 1f 44
    b3 13 21 44 13 92 10 6f 44 ff 00 01 80 3f e0 90
    df 40 be 13 e0 ef f4 ef ee 4e e8 10 ce 12 ff 01
    1e d4 01 1e d6 44 44 17 46 d6 4e 00 07 fe 00 0b
    00 64 00 0f 04 44 d6 ee 44 f4 04 10 4e e4 c3 13
    eb 00 f4 ee ff 44 f4 a0 7f 50 2f bf 50 33 4f 00
    43 10 4b 40 be d1 7f a1 7b d1 7f 8d 01 5e 44 fe
    44 04 7e 10 03 4e 24 3e c5 13 9f f1 9f ef fe f4
    01 33 44 10 03 f7 b1 bf 20 dc 02 92 04 c1 4f 01
    8b 00 03 a1 7b fb f1 7f 02 bf 44 ae 01 13 04 f8
    e4 41 5e 71 7f fd 02 09 10 03 04 7b 20 6f 41 5e
    71 9f 4f 01 e9 cf 30 03 20 6f f4 4f f1 7f 62 5f
    70 9e 01 51 fd 01 f5 02 2e f1 7f 71 4f 21 87 02
    52 44 52 4c bc 00 9f ff c0 9f 11 a7 b1 83 f1 7f
    ed bb 00 bb bb bd aa aa aa bd ca 0b ea ee bd aa
    20 03 fe 40 07 25 ff a0 00 1e bb 00 1e aa ee ea
    ae aa be 05 fc aa 05 fc 00 0b 00 03 00 0b 90 1f
    ea 20 ee ee 10 03 ef ea fe ff ef b4 00 0b ea 10
    0b a0 3f ee 00 02 ee ae a7 15 a7 fa 00 45 aa fe
    10 73 30 6b 60 6f 08 bd ca aa ff 10 8b ad cc cc
    7c cc 16 9b 10 6b 00 8e 00 7b 41 ba af ff 6c ff
    10 8b 00 1e cc 16 9b 20 6b fe aa ab 10 6b ea 06
    6e af 00 1e af 90 1f 10 63 50 fe 10 b7 ee 00 b3
    ee ff aa fa f9 30 1e 60 3f b0 9f 50 64 06 e1 af
    ea 10 03 d0 22 ff 01 1e da 01 1e dc ee aa ac 05
    dc ee ae aa dc 01 02 dc 00 fe 5c dc 00 52 dc 10
    23 40 2b 20 33 fa af fc 00 d8 80 9f 00 72 20 33
    10 2f 10 33 aa ff 3f ac dc 10 4b 40 be f5 ff f5
    ff 65 ff 45 fe fd a5 c0 a6 1f d5 e0 06 0c f0 1f
    56 00 77 06 26 ff f6 6f d5 ff 06 72 a5 c0 05 fe
    26 00 55 ff 65 d8 cf 15 b8 05 ec 77 f7 05 90 a0
    1f 16 3a 06 98 fc f0 1f e5 ff 06 be 46 28 06 98
    16 38 ee fe 7f 7f f5 ff b5 ff 37 0e f0 9f f5 ff
    f5 ff 67 7f 9d 68 ff 11 e1 09 07 a0 03 98 ff ee
    08 1f b9 07 33 e1 06 9f 08 e5 09 28 ee 1f a0 1f
    eb 08 de 00 1d 20 21 ef 00 25 11 00 29 a9 3f 59
    11 00 33 1e 00 33 09 3a e1 ff 09 26 74 1e 09 2a
    d0 6f 08 ff 11 98 ff fe ff ff 00 2f 09 7a 50 03
    28 fc 98 5f 09 90 00 91 19 1a ce 08 5e 07 6d 11
    f1 a9 1f 49 aa 40 73 1f 3c e1 1f 38 9e f8 ff 19
    bf 46 65 fe f1 3b ee ff 19 2a 19 2e 98 ff 11 08
    ff 08 dc ff 20 03 30 0f 19 0b 30 27 50 2f 09 5e
    a8 ff 50 27 f3 70 07 f8 ff 74 7f 14 0f aa ea 90
    03 f4 3f ea 24 3f 03 cd 17 7f ae a4 9f aa 04 5f
    af fd 0a 74 00 03 5a 80 27 7f 64 bf 14 a1 ae 3a
    bf ff 03 dd 04 c2 14 ef a0 6f 50 83 64 7f 27 7f
    10 2c df 47 7f 04 3f fa 94 7f 17 eb 10 6f 30 77
    00 01 7d fa b0 1f 05 26 05 0f 04 f8 27 be ea 04
    bf db b4 1f 95 5f ae 14 e3 14 e7 af 05 20 04 7f
    6d ae 05 87 94 7f ae 04 7f 05 33 dc 05 00 ef 24
    43 34 93 74 7b fe 04 b3 05 1c a5 1f 50 27 ff 70
    07 f4 7f 81 7f 95 ff 25 97 b1 3f 25 be 2b ff b7
    01 7e af 11 4b a0 bf aa 05 dc 25 a7 61 7e bd a6
    3f ea 00 1d 05 55 6b 5b 1b 67 8d 0a cc ab 40 03
    ee 0b 03 ee 0b 03 f7 9a 7f 1b f7 d0 0a 40 1b e5
    7f 09 58 7f ff 7f f7 f0 a4 5f 1b f3 10 20 2c 54
    7f ee fe f7 3d 7f f7 a4 9f 6b cb 0c b6 00 1e ef
    04 9f ff ea 7f 71 7f 02 1c 12 18 5c bf 0c e0 f5
    ff 35 ff fa 50 03 29 9f 50 03 0a e9 0a df f7 b0
    7f 77 68 d9 10 03 0a d6 d9 05 1d d9 ff 7f f8 fa
    7f f2 ff 72 8f f7 3f 37 3f ee ae ff fe 17 4f c0
    1f a6 bf 16 97 b7 bf 02 fb 1d 47 ff 67 ff 0a a2
    17 8a af ee 12 ff 93 73 e2 ff ff 00 68 02 97 17
    3b f7 3f 2d 7f 76 fb 20 6f d6 ff 3b ff af 07 74
    13 96 60 7b fa f2 ff f8 5f ff 20 73 03 77 18 5f
    67 7f 52 bb 92 d3 03 c8 f8 1f ff f2 ff 03 3b 01
    ab 23 3b f7 7f 7d 7f 12 83 20 03 fd 62 93 ad 3f
    2d 3e 3e ff 0c d4 02 6d ee 16 9f f9 ad 7f 32 8b
    64 7e bd 7f 1c de ee e7 2c 1f 3a ee f7 0f 45 0d
    ae c0 6f fe 0e 03 ff f7 a2 ff 22 f3 0d 08 2d 11
    e7 0d 15 b7 7f 0f 8c 6f 77 8e ff ed 5f ef 03 3d
    40 20 0d ee 03 42 f1 07 a1 fd 7f 50 df 00 01 7e
    ee 7e 1f 4a ef 27 83 0f eb 9d 7f ee 0d 7f 0d 92
    a0 03 13 9b bb 43 9f ef f3 9f 0f bf c0 2f f7 f2
    ff dd 7f f3 a0 03 9d 7f 1d 3e 30 03 fe ff 50 0b
    dc 1f b6 0d a2 4f 10 01 0d 80 4f 10 0b 9d bf e4
    ff 0d 9f 1d 73 2b 5a 40 03 d0 6f dd 7f 30 6b 0c
    f1 9f 50 7b 44 ff bd 5f 20 6d 20 73 0c ff 0d fb
    f8 00 20 9d 9f 50 6b 0d c4 1d 1c ee ff 4f 78 44
    ad bf ce 3f 1e 63 0e 59 4f 44 44 ff 0c 28 10 6d
    dd 7f 3d 87 70 03 0c c4 0d 81 10 2b bf 00 2f fe
    0c 5c 3c 9e 6e 1f d0 2f 50 43 ad 7f fb 78 ff 28
    7b 90 03 98 ff 48 f4 1e 38 de 30 01 ff b8 df 60
    1f 00 23 f0 1f e0 3f 0f ec d0 6f d8 ff e7 50 67
    29 78 18 de ff ff a8 5f 40 17 49 72 ef 09 74 00
    21 c0 1f ff 09 86 60 8f d0 1f a0 df 71 1e 00 01
    29 4c 30 6b e1 ee fe e8 ff ff d8 cf 2a 08 f0 5f
    f8 ff f8 ff fb ff fb ff ab ff fd 1b 21 1b 4d 90
    03 b0 1f 3c 20 0b 70 ff 50 26 cf a4 9f 5c 41 7f
    e7 07 27 14 4b 27 73 fb ff ff 8b ff d0 6f d4 7f
    70 8e 14 9f 14 a3 b7 7f 1b fd de 2b a1 00 6f fe
    00 73 0c 3c ac 3f c5 1f 77 bf 0c 45 77 04 a3 05
    6b 0c ce 0c 49 fb ff bb ff fd 3c 6d b0 3b fb ff
    fb ff f4 7f 2f fb ee 0f fb ff a0 03 b3 9f 04 5f
    0f cd 07 3f 24 5b 14 69 b4 5f ff 00 01 44 5b 03
    c8 03 ed f0 1f 44 7f 60 03 0c 77 88 b0 03 31 11
    f1 9b ff ff 1f ee 37 1f 1f 0b 8b 00 03 ee 30 03
    bb df 0c 19 7f 1f 1c 1d 03 94 1c 6f 52 fe 73 1f
    63 a9 f2 ff fb d4 7f 00 bf 05 1f 3b 1f 0f 01 4f
    15 d3 94 7f 6b 4e 04 7f 05 00 d6 04 9e d6 04 9e
    30 0b bd 39 9b 1f 1c 38 1c 84 d3 7f 00 b4 d3 50
    03 9b 00 a9 d3 ff fb ff 8d 7f e1 0d 0f 20 03 f6
    04 17 20 03 ad 3f 1d 5f ee 0d 81 0b de ef ff 0f
    a6 0d 4a 3a 7f 8d 5f 20 14 10 8e 13 bc 0d a1 94
    c4 9f 1e e1 0f dd e1 3a 7f f1 ef ea 0d a2 0d ef
    a0 6f fe 0e 03 ff ad 7f 1f fe 0d 0c 04 18 24 fc
    14 e0 cd 5f 0d f3 6d 2b ff f4 21 a7 bc ff 10 63
    0e 06 e1 0e 38 ef 11 ff 0c b9 4d 9e fd 7f 1e 3f
    34 7e 1e 61 5d 89 2a 7f a0 5d 7f ee 0d 7f ee 1e
    11 d3 ef 5f fe 0d 83 ff 3d 87 2d 0b 40 33 1e 07
    d1 ff b4 1d af ef 00 33 0e 1c d3 0e 1c d3 ff 6f
    1f fd 7f 77 7f e4 02 ff 20 03 07 17 30 03 f7 a6
    9f 06 9d 03 03 1d 5d ef 06 d1 10 03 a7 7f ab 07
    9f 44 00 1e 4e 0b e2 fe 50 03 a7 7f f2 06 e0 0e
    f6 07 24 0d a4 4f f4 11 c3 e4 fc 91 eb 31 ff b1
    7f 11 0a 0f 46 58 5f ef ff ec 4e c0 5e ff 0f 47
    fe 0f 47 60 6f ff f1 eb 0e 82 92 7f 12 29 1f 2c
    1d ef 15 cf 06 3f d7 ee ff 77 7f e4 00 dd e4 42
    d2 38 d2 97 7f 09 e4 4e 46 d6 08 0a d6 ef 40 03
    7f ee 00 0b 50 eb 59 80 0f 7d b2 ff 11 77 40 03
    39 e1 fe 0e fb 01 b7 9e ff 00 00 f0 01 bf 10 13
    60 08 7f 10 03 f0 1f 30 31 18 7f 18 83 ff f0 3f
    f0 1f f0 63 f0 3f f0 5f f0 5f f0 7f f0 9f ff f0
    9f f0 e1 90 bf 50 e7 f0 07 30 ff f0 02 f0 14 ff
    f0 26 f0 38 f0 4a f0 5c f0 6e f0 80 f0 92 f0 a4
    ff f0 b6 f0 c8 f0 ff 41 ef 50 03 02 00 71 e5 f1
    08 ff f1 1a f1 2c f1 3e f1 50 f1 62 f1 74 f1 86
    f1 98 f5 f1 aa f1 bc f1 ce 12 df 60 12 e3 60 f3
    07 ff f2 e7 f3 2b f3 07 f3 27 f3 27 f3 47 f3 67
    f3 67 ff f3 a9 f3 87 f3 cd f3 a7 f3 f1 f4 03 f3
    df f3 ff ff f3 ff f4 1f f4 3f f4 3f f4 81 f4 5f
    f4 a5 f4 7f ff f4 9f f4 9f f4 bf f3 e2 f3 f4 f4
    06 f4 18 f4 2a ff f4 3c f4 4e f4 60 f4 72 f4 84
    f4 96 f4 a8 f4 ba ff f4 cc f4 de f4 f0 f5 02 f5
    14 f5 26 f5 38 f5 4a ff f5 5c f5 6e f5 80 f5 92
    f5 a4 f5 b6 f5 c8 f4 07 ff f7 09 f6 e7 f7 2d f7
    07 f7 27 f7 27 f7 47 f7 87 ff f7 67 f7 ab f7 87
    f7 a7 f7 a7 f7 f3 f8 05 f7 df ff f7 ff f7 ff a8
    1f 26 4a f8 5f f8 47 f7 66 f7 78 ff f7 8a 75 c2
    f0 03 76 c6 f8 df f8 c7 f7 e6 f7 f8 ff f8 0a f0
    7f f0 8b f9 3e f9 47 f9 47 f9 67 f9 87 bf b1 67
    06 f9 c6 f9 d8 f9 ea 09 fc 1f df 1a 03 df 3f be
    10 01 7f 30 01 3f 2e 1f df 1a 23 1e ff 07 d1 77
    77 71 d1 0f 12 60 03 10 13 26 7f 77 1f 52 ee 7f
    00 07 40 03 f7 fb 2f 11 1e 23 4e ff 20 27 70 07
    71 20 37 40 1e d0 3e ff 0a 84 0d 0f ff 0d 17 77
    e7 e3 00 07 a0 03 90 9f ee ee 7e 0f e5 0c 9f ed
    0f 00 0f ed 0d 8c 7f 2f 1f 60 1f 7e 10 13 f6 00
    90 50 c3 c0 1f 10 40 7f 20 35 50 21 ee 6b ee d0
    6f 00 83 77 10 8b 7d 0f 03 2d 7f 3b ff 7f 1f d6
    60 03 0f de f7 90 df 10 83 8c 90 51 7f f7 7f a0
    1f 00 6f fe 7f f0 0e a2 60 91 c0 1f 1f df 88 88
    88 88 ff f1 7f 71 7f 00 1f f1 7f f1 7f f1 7f f1
    7f f1 7f d7 1e ff 00 80 8d 02 00 8d 01 7f 00 07
    a0 03 fe 90 9f f1 7f 31 7f 60 1f f1 7f a0 1f f1
    7f ee 57 ee d0 6f 7d 01 7f 7d f1 7f f1 7f f1 7f
    e0 f1 7f f1 7f e1 9f
  `);

  const FAIRY_POKEMON_TYPE_RETAGS = [
    [35, 0x09, 0x09], [36, 0x09, 0x09], [39, 0x00, 0x09], [40, 0x00, 0x09],
    [122, 0x0e, 0x09], [175, 0x09, 0x09], [176, 0x09, 0x02], [183, 0x0b, 0x09],
    [184, 0x0b, 0x09], [209, 0x09, 0x09], [210, 0x09, 0x09], [280, 0x0e, 0x09],
    [281, 0x0e, 0x09], [282, 0x0e, 0x09], [298, 0x00, 0x09], [303, 0x08, 0x09],
    [439, 0x0e, 0x09], [468, 0x09, 0x02],
  ];

  const DEBUG_WILD_ENCOUNTER_SPECIES_OFFSETS = (() => {
    const offsets = [];
    for (let i = 0; i < 12; i += 1) offsets.push(8 + i * 8);
    for (let offset = 100; offset <= 136; offset += 4) offsets.push(offset);
    for (let offset = 164; offset <= 200; offset += 4) offsets.push(offset);
    for (let i = 0; i < 5; i += 1) offsets.push(212 + i * 8);
    for (let i = 0; i < 5; i += 1) offsets.push(300 + i * 8);
    for (let i = 0; i < 5; i += 1) offsets.push(344 + i * 8);
    for (let i = 0; i < 5; i += 1) offsets.push(388 + i * 8);
    return offsets;
  })();

  function closestHit(hits, preferredOffset, label) {
    if (!hits.length) {
      return null;
    }
    hits.sort((a, b) => Math.abs(a - preferredOffset) - Math.abs(b - preferredOffset));
    if (
      hits.length > 1 &&
      Math.abs(hits[0] - preferredOffset) === Math.abs(hits[1] - preferredOffset)
    ) {
      throw new PatchError(`${label} fallback scan found equally close candidates.`);
    }
    return hits[0];
  }

  function locatePatchSite(data, preferredOffset, expectedList, patched, radius, label, force) {
    if (bytesEqual(data, preferredOffset, patched)) {
      return { offset: preferredOffset, state: "already", usedFallback: false };
    }
    if (expectedList.some((expected) => bytesEqual(data, preferredOffset, expected))) {
      return { offset: preferredOffset, state: "patch", usedFallback: false };
    }

    const start = preferredOffset - radius;
    const end = preferredOffset + radius;
    const expectedHits = [];
    for (const expected of expectedList) {
      expectedHits.push(...findNeedle(data, expected, start, end));
    }
    const expectedHit = closestHit(Array.from(new Set(expectedHits)), preferredOffset, label);
    if (expectedHit != null) {
      return { offset: expectedHit, state: "patch", usedFallback: expectedHit !== preferredOffset };
    }

    const patchedHit = closestHit(findNeedle(data, patched, start, end), preferredOffset, label);
    if (patchedHit != null) {
      return { offset: patchedHit, state: "already", usedFallback: patchedHit !== preferredOffset };
    }

    if (!force) {
      const found = Array.from(data.slice(preferredOffset, preferredOffset + patched.length))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join(" ");
      throw new PatchError(
        `${label} sanity check failed at ${hex(preferredOffset)}. Found ${found}. Enable compatible modified bytes to patch anyway.`
      );
    }
    return { offset: preferredOffset, state: "patch", usedFallback: false };
  }

  function patchFairyCodeSite(rom, overlay, relativeOffset, expectedList, patched, label, force, log) {
    const preferred = overlay.start + relativeOffset;
    const located = locatePatchSite(rom, preferred, expectedList, patched, 0x30, label, force);
    if (located.state !== "already") {
      writeBytes(rom, located.offset, patched);
    }
    log.push(
      `${label}: ${located.state === "already" ? "already patched" : "wrote"} overlay 16+${hex(
        located.offset - overlay.start
      )}${located.usedFallback ? " (fallback scan)" : ""}.`
    );
  }

  function patchFairyType(rom, force, log) {
    const overlay16 = getOverlayRange(rom, OVERLAY_16);
    const tableAt = overlay16.start + 0x33b94;
    const cleanTablePrefix = bytesFromHex("00 05 05 00 08 05 0a 0a");
    const pkaizoTablePrefix = bytesFromHex("80 0d 81 0c 82 0f 83 01");
    if (bytesEqual(rom, tableAt, FAIRY_TET_PATCH)) {
      log.push(`Fairy type table: already patched at overlay 16+0x33B94.`);
    } else {
      const pkaizoCompatibleTable = bytesEqual(rom, tableAt, pkaizoTablePrefix);
      if (
        !bytesEqual(rom, tableAt, cleanTablePrefix) &&
        !pkaizoCompatibleTable &&
        !force
      ) {
        throw new PatchError(
          `Fairy type table sanity check failed at overlay 16+0x33B94. Enable compatible modified bytes to patch anyway.`
        );
      }
      writeBytes(rom, tableAt, FAIRY_TET_PATCH);
      log.push(
        `Fairy type table: wrote compressed table at overlay 16+0x33B94${
          pkaizoCompatibleTable ? " (pkaizo-compatible table area)" : ""
        }.`
      );
    }

    patchFairyCodeSite(
      rom,
      overlay16,
      0x1a01a,
      [
        bytesFromHex("01 90 92 78 28 1c 39 1c 06 f0 6b fa"),
        bytesFromHex("01 90 92 78 28 1c 39 1c 06 f0 75 fa"),
      ],
      FAIRY_READ1_PATCH,
      "Fairy type read hook 1",
      force,
      log
    );
    patchFairyCodeSite(
      rom,
      overlay16,
      0x1a074,
      [
        bytesFromHex("01 90 92 78 28 1c 39 1c 06 f0 3e fa"),
        bytesFromHex("01 90 92 78 28 1c 39 1c 06 f0 48 fa"),
      ],
      FAIRY_READ2_PATCH,
      "Fairy type read hook 2",
      force,
      log
    );
    patchFairyCodeSite(
      rom,
      overlay16,
      0x19fb6,
      [bytesFromHex("20 18")],
      FAIRY_LOOP1_PATCH,
      "Fairy type loop step 1",
      force,
      log
    );
    patchFairyCodeSite(
      rom,
      overlay16,
      0x1a084,
      [bytesFromHex("60 00 21 18")],
      FAIRY_LOOP2_PATCH,
      "Fairy type loop step 2",
      force,
      log
    );
    patchFairyCodeSite(
      rom,
      overlay16,
      0x1a766,
      [bytesFromHex("08 18")],
      FAIRY_LOOP3_PATCH,
      "Fairy type loop step 3",
      force,
      log
    );

    const helperAt = arm9Offset(rom, 0x020f9400, FAIRY_ARM9_HELPER.length);
    if (bytesEqual(rom, helperAt, FAIRY_ARM9_HELPER)) {
      log.push(`Fairy type ARM9 helper: already patched at ARM9 file ${hex(helperAt)} / RAM 0x20F9400.`);
    } else {
      const expectedFill = new Uint8Array(FAIRY_ARM9_HELPER.length);
      if (!bytesEqual(rom, helperAt, expectedFill) && !force) {
        throw new PatchError(
          `Fairy type ARM9 helper cave at ${hex(helperAt)} is occupied. Apply Fairy before experimental text speed on a fresh ROM.`
        );
      }
      writeBytes(rom, helperAt, FAIRY_ARM9_HELPER);
      log.push(`Fairy type ARM9 helper: wrote ${FAIRY_ARM9_HELPER.length} bytes at ARM9 file ${hex(helperAt)} / RAM 0x20F9400.`);
    }

    const overlay21 = getOverlayRange(rom, OVERLAY_21);
    const displayAt = overlay21.start + 0xe408;
    const displayExpected = bytesFromHex("c9 88 09 04 09 14 8f 44");
    if (bytesEqual(rom, displayAt, FAIRY_POKEDEX_DISPLAY_PATCH)) {
      log.push("Fairy Pokedex display: already patched at overlay 21+0xE408.");
    } else {
      if (!bytesEqual(rom, displayAt, displayExpected) && !force) {
        throw new PatchError("Fairy Pokedex display sanity check failed at overlay 21+0xE408.");
      }
      writeBytes(rom, displayAt, FAIRY_POKEDEX_DISPLAY_PATCH);
      log.push("Fairy Pokedex display: wrote type routing at overlay 21+0xE408.");
    }

    const file = findFileByPath(rom, "battle/graphic/pl_batt_obj.narc");
    const currentNarc = rom.slice(file.start, file.end);
    const patchedNarc = replaceNarcMembers(currentNarc, [
      [74, FAIRY_PL_BATT_OBJ_ENTRY_74],
      [236, FAIRY_PL_BATT_OBJ_ENTRY_236],
    ]);
    const assetState = replaceRomFile(rom, file, patchedNarc, "Fairy visual asset NARC");
    log.push(
      `Fairy visual assets: ${assetState === "already" ? "already patched" : "replaced"} battle/graphic/pl_batt_obj.narc file ${file.fileId}, members 74 and 236 (${file.size} -> ${patchedNarc.length} bytes).`
    );

    const zukanFile = findFileByPath(rom, "resource/eng/zukan/zukan.narc");
    const currentZukan = rom.slice(zukanFile.start, zukanFile.end);
    const patchedZukan = replaceNarcMembers(currentZukan, [
      [88, FAIRY_ZUKAN_ENTRY_88],
      [89, FAIRY_ZUKAN_ENTRY_89],
      [90, FAIRY_ZUKAN_ENTRY_90],
    ]);
    const zukanState = replaceRomFile(rom, zukanFile, patchedZukan, "Fairy Pokedex type icon NARC");
    log.push(
      `Fairy Pokedex type icons: ${zukanState === "already" ? "already patched" : "replaced"} resource/eng/zukan/zukan.narc file ${zukanFile.fileId}, members 88, 89 and 90 (${zukanFile.size} -> ${patchedZukan.length} bytes).`
    );
  }

  function patchFairyPokemonTypes(rom, force, log) {
    const file = findFileByPath(rom, "poketool/personal/pl_personal.narc");
    const narc = rom.slice(file.start, file.end);
    const parsed = parseNarc(narc);
    const changed = [];

    for (const [species, type1, type2] of FAIRY_POKEMON_TYPE_RETAGS) {
      const entry = parsed.entries[species];
      if (!entry) {
        throw new PatchError(`Fairy Pokemon type retag species ${species} is outside pl_personal.narc.`);
      }
      if (entry.end - entry.start < 8) {
        throw new PatchError(`Fairy Pokemon type retag species ${species} has an invalid personal entry.`);
      }
      const offset = file.start + parsed.dataBlock.dataOffset + entry.start + 6;
      if (rom[offset] !== type1 || rom[offset + 1] !== type2) {
        rom[offset] = type1;
        rom[offset + 1] = type2;
        changed.push(species);
      }
    }

    log.push(
      `Update Pokemon Types: ${
        changed.length ? `retagged ${changed.length} entries (${changed.join(", ")})` : "already patched"
      } in poketool/personal/pl_personal.narc file ${file.fileId}.`
    );
  }

  function patchDebugFairyBattleTest(rom, log) {
    const personalFile = findFileByPath(rom, "poketool/personal/pl_personal.narc");
    const personalNarc = rom.slice(personalFile.start, personalFile.end);
    const personal = parseNarc(personalNarc);
    let pokemonChanged = 0;
    let pokemonKeptFairy = 0;

    for (let species = 0; species < personal.entries.length; species += 1) {
      const entry = personal.entries[species];
      if (entry.end - entry.start < 8) {
        continue;
      }
      const offset = personalFile.start + personal.dataBlock.dataOffset + entry.start + 6;
      if (rom[offset] === 0x09 || rom[offset + 1] === 0x09) {
        pokemonKeptFairy += 1;
        continue;
      }
      if (rom[offset] !== 0x01 || rom[offset + 1] !== 0x01) {
        rom[offset] = 0x01;
        rom[offset + 1] = 0x01;
        pokemonChanged += 1;
      }
    }

    const moveFile = findFileByPath(rom, "poketool/waza/pl_waza_tbl.narc");
    const moveNarc = rom.slice(moveFile.start, moveFile.end);
    const moves = parseNarc(moveNarc);
    let movesChanged = 0;
    for (let move = 0; move < moves.entries.length; move += 1) {
      const entry = moves.entries[move];
      if (entry.end - entry.start < 5) {
        continue;
      }
      const offset = moveFile.start + moves.dataBlock.dataOffset + entry.start + 4;
      if (rom[offset] !== 0x09) {
        rom[offset] = 0x09;
        movesChanged += 1;
      }
    }

    log.push(
      `DEBUG Fairy battle test: changed ${pokemonChanged} non-Fairy Pokemon entries to mono Fighting, kept ${pokemonKeptFairy} Fairy entries, and changed ${movesChanged} moves to Fairy type.`
    );

    patchDebugWildEncountersToSpecies(rom, SPECIES_JIGGLYPUFF, "Jigglypuff", log);
  }

  function patchDebugWildEncountersToSpecies(rom, species, label, log) {
    const file = findFileByPath(rom, "fielddata/encountdata/pl_enc_data.narc");
    const narc = rom.slice(file.start, file.end);
    const parsed = parseNarc(narc);
    let changedSlots = 0;
    let touchedTables = 0;
    let skippedTables = 0;

    for (const entry of parsed.entries) {
      if (entry.end - entry.start < 424) {
        skippedTables += 1;
        continue;
      }

      let tableChanged = false;
      for (const relative of DEBUG_WILD_ENCOUNTER_SPECIES_OFFSETS) {
        const offset = file.start + parsed.dataBlock.dataOffset + entry.start + relative;
        if (readU32(rom, offset) === species) {
          continue;
        }
        writeU32(rom, offset, species);
        changedSlots += 1;
        tableChanged = true;
      }
      if (tableChanged) {
        touchedTables += 1;
      }
    }

    log.push(
      `DEBUG Fairy battle test encounters: ${
        changedSlots
          ? `changed ${changedSlots} species slot(s) across ${touchedTables} table(s) to ${label}`
          : `all encounter species slots already ${label}`
      } in fielddata/encountdata/pl_enc_data.narc file ${file.fileId}${
        skippedTables ? `; skipped ${skippedTables} short table(s)` : ""
      }.`
    );
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

  const FRAME_RATE_HOOK_RAM = 0x02000df2;
  const FRAME_RATE_CAVE_RAM = 0x020f93d0;
  const FRAME_RATE_BATTLE_SIGNATURE_RAM = 0x0224a948;
  const FRAME_RATE_BATTLE_SIGNATURE_VALUE = 0x2801;
  const FRAME_RATE_HOOK_ORIGINAL = bytesFromHex("e0 6a 40 1c e0 62 25 63");
  const FRAME_RATE_HOOK_GLOBAL = bytesFromHex("e0 6a 40 1c e0 62 00 00");
  const FRAME_RATE_HOOK_TAIL = bytesFromHex("c0 46 c0 46");

  function buildFrameRateBattleHelper(helperAddress) {
    const out = [];
    const literalFixups = [];

    function here() {
      return helperAddress + out.length;
    }
    function emit16(value) {
      out.push(value & 0xff, (value >>> 8) & 0xff);
    }
    function emitU32(value) {
      out.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
    }
    function ldrLiteral(register, value) {
      literalFixups.push({ offset: out.length, at: here(), register, value });
      emit16(0);
    }

    emit16(0x6ae0); // ldr r0, [r4, #0x2c]
    emit16(0x1c40); // adds r0, #1
    emit16(0x62e0); // str r0, [r4, #0x2c]
    ldrLiteral(1, FRAME_RATE_BATTLE_SIGNATURE_RAM);
    emit16(0x8809); // ldrh r1, [r1]
    ldrLiteral(0, FRAME_RATE_BATTLE_SIGNATURE_VALUE);
    emit16(0x4281); // cmp r1, r0
    const beqAt = here();
    const beqOffset = out.length;
    emit16(0);
    emit16(0x6325); // str r5, [r4, #0x30]
    const doneAddress = here();
    emit16(0x4770); // bx lr

    while (out.length % 4 !== 0) {
      out.push(0);
    }

    const literalAddresses = new Map();
    for (const fixup of literalFixups) {
      if (!literalAddresses.has(fixup.value)) {
        literalAddresses.set(fixup.value, here());
        emitU32(fixup.value);
      }
    }

    const beq = thumbCondBranch(beqAt, doneAddress, 0);
    out[beqOffset] = beq[0];
    out[beqOffset + 1] = beq[1];

    for (const fixup of literalFixups) {
      const literalAddress = literalAddresses.get(fixup.value);
      const pcBase = (fixup.at + 4) & ~3;
      const literalOffset = literalAddress - pcBase;
      if (literalOffset < 0 || literalOffset > 1020 || literalOffset % 4 !== 0) {
        throw new Error("internal framerate literal is out of range");
      }
      const inst = 0x4800 | (fixup.register << 8) | (literalOffset / 4);
      out[fixup.offset] = inst & 0xff;
      out[fixup.offset + 1] = (inst >>> 8) & 0xff;
    }

    return new Uint8Array(out);
  }

  function frameRateBattleHook(hookAddress, helperAddress) {
    return new Uint8Array([...thumbBl(hookAddress, helperAddress), ...FRAME_RATE_HOOK_TAIL]);
  }

  function frameRateBattleHookInfo(rom, hookAt, hookAddress, arm9) {
    if (!bytesEqual(rom, hookAt + 4, FRAME_RATE_HOOK_TAIL)) {
      return null;
    }
    const helperAddress = decodeThumbBl(hookAddress, rom, hookAt);
    if (helperAddress == null) {
      return null;
    }
    const helperAt = arm9.fileOffset + (helperAddress - arm9.loadAddress);
    const helper = buildFrameRateBattleHelper(helperAddress);
    if (
      helperAt < arm9.fileOffset ||
      helperAt + helper.length > arm9.fileOffset + arm9.size ||
      !bytesEqual(rom, helperAt, helper)
    ) {
      return null;
    }
    return { helperAddress, helperAt, helper };
  }

  function findAlignedFillRun(data, start, end, value, size, preferredOffset, alignment = 4) {
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
        const alignedStart = (i + alignment - 1) & ~(alignment - 1);
        if (alignedStart + size <= j) {
          runs.push(alignedStart);
        }
      }
      i = j;
    }
    if (!runs.length) {
      return -1;
    }
    runs.sort((a, b) => Math.abs(a - preferredOffset) - Math.abs(b - preferredOffset));
    return runs[0];
  }

  function locateFrameRateHook(rom, preferredHookAt, label) {
    if (
      bytesEqual(rom, preferredHookAt, FRAME_RATE_HOOK_ORIGINAL) ||
      bytesEqual(rom, preferredHookAt, FRAME_RATE_HOOK_GLOBAL)
    ) {
      return { offset: preferredHookAt, usedFallback: false };
    }
    const hits = [
      ...findNeedle(rom, FRAME_RATE_HOOK_ORIGINAL, preferredHookAt - 0x200, preferredHookAt + 0x200),
      ...findNeedle(rom, FRAME_RATE_HOOK_GLOBAL, preferredHookAt - 0x200, preferredHookAt + 0x200),
    ];
    const uniqueHits = Array.from(new Set(hits));
    if (uniqueHits.length === 1) {
      return { offset: uniqueHits[0], usedFallback: true };
    }
    if (uniqueHits.length > 1) {
      throw new PatchError(
        `${label} fallback scan found multiple candidate offsets: ${uniqueHits.map(hex).join(", ")}.`
      );
    }
    return { offset: preferredHookAt, usedFallback: false };
  }

  function patchFrameRateUnlock(rom, force, log, options = {}) {
    const mode = frameRateModeOption(options);
    const label = `Unlock framerate (${mode === "global" ? "global" : "battle only"})`;
    const arm9 = getArm9Info(rom);
    const preferredHookAt = arm9Offset(rom, FRAME_RATE_HOOK_RAM, FRAME_RATE_HOOK_ORIGINAL.length);
    let hookAt = preferredHookAt;
    let usedFallback = false;
    let hookAddress = FRAME_RATE_HOOK_RAM;
    let battleInfo = frameRateBattleHookInfo(rom, hookAt, hookAddress, arm9);

    if (!battleInfo) {
      const located = locateFrameRateHook(rom, preferredHookAt, label);
      hookAt = located.offset;
      usedFallback = located.usedFallback;
      hookAddress = arm9.loadAddress + (hookAt - arm9.fileOffset);
      battleInfo = frameRateBattleHookInfo(rom, hookAt, hookAddress, arm9);
    }

    if (mode === "global") {
      if (bytesEqual(rom, hookAt, FRAME_RATE_HOOK_GLOBAL)) {
        log.push(
          `${label}: already patched at ARM9 file ${hex(hookAt)} / RAM ${hex(hookAddress)}${
            usedFallback ? " (fallback scan)" : ""
          }.`
        );
        return;
      }
      if (
        !bytesEqual(rom, hookAt, FRAME_RATE_HOOK_ORIGINAL) &&
        !battleInfo &&
        !force
      ) {
        const found = Array.from(rom.slice(hookAt, hookAt + FRAME_RATE_HOOK_ORIGINAL.length))
          .map((byte) => byte.toString(16).padStart(2, "0"))
          .join(" ");
        throw new PatchError(
          `${label} sanity check failed at ${hex(hookAt)}. Found ${found}. Enable compatible modified bytes to patch anyway.`
        );
      }
      writeBytes(rom, hookAt, FRAME_RATE_HOOK_GLOBAL);
      log.push(
        `${label}: ${battleInfo ? "replaced battle-only hook with global edit" : "patched"} at ARM9 file ${hex(
          hookAt
        )} / RAM ${hex(hookAddress)}${usedFallback ? " (fallback scan)" : ""}.`
      );
      return;
    }

    if (battleInfo) {
      log.push(
        `${label}: already patched at ARM9 file ${hex(hookAt)} / RAM ${hex(
          hookAddress
        )}; helper at ARM9 file ${hex(battleInfo.helperAt)} / RAM ${hex(
          battleInfo.helperAddress
        )}${usedFallback ? " (fallback scan)" : ""}.`
      );
      return;
    }

    const preferredHelper = buildFrameRateBattleHelper(FRAME_RATE_CAVE_RAM);
    const preferredCaveAt = arm9Offset(rom, FRAME_RATE_CAVE_RAM, preferredHelper.length);
    let caveAt = preferredCaveAt;
    let caveFillValue = 0x00;
    let caveFallback = false;

    if (
      !bytesEqual(rom, caveAt, new Uint8Array(preferredHelper.length).fill(0x00)) &&
      !bytesEqual(rom, caveAt, preferredHelper)
    ) {
      let dynamicCave = findAlignedFillRun(
        rom,
        arm9.fileOffset,
        arm9.fileOffset + arm9.size,
        0x00,
        preferredHelper.length,
        preferredCaveAt
      );
      if (dynamicCave === -1) {
        dynamicCave = findAlignedFillRun(
          rom,
          arm9.fileOffset,
          arm9.fileOffset + arm9.size,
          0xff,
          preferredHelper.length,
          preferredCaveAt
        );
        caveFillValue = 0xff;
      }
      if (dynamicCave !== -1) {
        caveAt = dynamicCave;
        caveFallback = caveAt !== preferredCaveAt;
      } else if (!force) {
        throw new PatchError(`${label} could not find a free ARM9 code cave.`);
      }
    }

    const helperAddress = arm9.loadAddress + (caveAt - arm9.fileOffset);
    const helper = buildFrameRateBattleHelper(helperAddress);
    const hook = frameRateBattleHook(hookAddress, helperAddress);
    const helperAlready = bytesEqual(rom, caveAt, helper);
    const replacedGlobal = bytesEqual(rom, hookAt, FRAME_RATE_HOOK_GLOBAL);
    const hookCompatible =
      bytesEqual(rom, hookAt, FRAME_RATE_HOOK_ORIGINAL) ||
      replacedGlobal;

    if (!hookCompatible && !force) {
      const found = Array.from(rom.slice(hookAt, hookAt + hook.length))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join(" ");
      throw new PatchError(
        `${label} hook sanity check failed at ${hex(hookAt)}. Found ${found}. Enable compatible modified bytes to patch anyway.`
      );
    }
    if (
      !helperAlready &&
      !bytesEqual(rom, caveAt, new Uint8Array(helper.length).fill(caveFillValue)) &&
      !force
    ) {
      throw new PatchError(
        `${label} code cave sanity check failed at ${hex(caveAt)}. Enable compatible modified bytes to patch anyway.`
      );
    }

    if (!helperAlready) {
      writeBytes(rom, caveAt, helper);
    }
    writeBytes(rom, hookAt, hook);

    const notes = [];
    if (usedFallback) {
      notes.push("hook fallback scan");
    }
    if (caveFallback) {
      notes.push(`code-cave fallback scan (${hex(caveFillValue)} fill)`);
    }
    if (replacedGlobal) {
      notes.push("updated from global");
    }
    log.push(
      `${label}: installed hook at ARM9 file ${hex(hookAt)} / RAM ${hex(
        hookAddress
      )}; helper at ARM9 file ${hex(caveAt)} / RAM ${hex(helperAddress)}${
        notes.length ? ` (${notes.join(", ")})` : ""
      }.`
    );
  }

  function patchNoCrits(rom, force, log) {
    const overlayId = OVERLAY_16;
    const tableOffset = 0x33a60;
    const functionOffset = 0x1fda4;
    const tableNeedle = bytesFromHex("10 08 04 03 02");
    const stub = bytesFromHex("01 20 70 47");
    const expectedPrefix = bytesFromHex("f8 b5");
    const overlay = getOverlayRange(rom, overlayId);
    const expectedTable = overlay.start + tableOffset;

    let actualTable = expectedTable;
    if (!bytesEqual(rom, expectedTable, tableNeedle)) {
      const hits = findNeedle(rom, tableNeedle, expectedTable - 0x100, expectedTable + 0x100);
      if (hits.length === 1) {
        actualTable = hits[0];
      } else if (!force) {
        throw new PatchError("Could not uniquely locate the critical-hit rate table in overlay 16.");
      }
    }

    const shift = actualTable - expectedTable;
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
        shift ? ` (fallback scan, shift ${shift > 0 ? "+" : ""}${hex(Math.abs(shift))})` : ""
      }.`
    );
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

  function patchMovementSpeed(rom, force, log) {
    const legacyPointerPatches = [
      [0x020ef53c, 0x02065abd, 0x02065b11, "walk north"],
      [0x020ef530, 0x02065ad5, 0x02065b25, "walk south"],
      [0x020ef524, 0x02065ae9, 0x02065b39, "walk west"],
      [0x020ef518, 0x02065afd, 0x02065b4d, "walk east"],
      [0x020ef50c, 0x02065b11, 0x02065b61, "fast walk north"],
      [0x020ef500, 0x02065b25, 0x02065b79, "fast walk south"],
      [0x020ef4f4, 0x02065b39, 0x02065b8d, "fast walk west"],
      [0x020ef4e8, 0x02065b4d, 0x02065ba1, "fast walk east"],
      [0x020ef4dc, 0x02065b61, 0x02065bb9, "bike high north"],
      [0x020ef4d0, 0x02065b79, 0x02065bcd, "bike high south"],
      [0x020ef4c4, 0x02065b8d, 0x02065be1, "bike high west"],
      [0x020ef4b8, 0x02065ba1, 0x02065bf5, "bike high east"],
      [0x020ef194, 0x02065c0d, 0x02065b61, "run north"],
      [0x020ef224, 0x02065c25, 0x02065b79, "run south"],
      [0x020ef440, 0x02065c39, 0x02065b8d, "run west"],
      [0x020ef470, 0x02065c4d, 0x02065ba1, "run east"],
    ];

    let revertedLegacy = 0;
    for (const [ramAddress, expected, replacement] of legacyPointerPatches) {
      const offset = arm9Offset(rom, ramAddress, 4);
      if (readU32(rom, offset) === replacement) {
        writeU32(rom, offset, expected);
        revertedLegacy += 1;
      }
    }

    const constantPatches = [
      [0x0205fe22, "0c 24", "10 24", "walk base action"],
      [0x0205fe3e, "58 24", "14 24", "run base action"],
      [0x0205ff92, "0c 27", "10 27", "Distortion World walk base action"],
      [0x0205ffb0, "58 27", "14 27", "Distortion World run base action"],
      [0x02060394, "4c 24", "50 24", "bike default action"],
      [0x020603a8, "10 24", "14 24", "bike low-gear action"],
      [0x020603ac, "50 24", "14 24", "bike mid-gear action"],
      [0x020603b0, "14 24", "54 24", "bike high-gear action"],
    ];

    let changed = 0;
    let fallbackCount = 0;
    for (const [ramAddress, expectedHex, replacementHex, label] of constantPatches) {
      const expected = bytesFromHex(expectedHex);
      const replacement = bytesFromHex(replacementHex);
      const preferredOffset = arm9Offset(rom, ramAddress, expected.length);
      const located = locateNearby(
        rom,
        preferredOffset,
        expected,
        replacement,
        0x30,
        `Faster movement ${label}`
      );
      const offset = located.offset;
      const state = requireBytes(
        rom,
        offset,
        expected,
        replacement,
        force,
        `Faster movement ${label}`
      );
      if (state === "already") {
        continue;
      }
      writeBytes(rom, offset, replacement);
      changed += 1;
      if (located.usedFallback) {
        fallbackCount += 1;
      }
    }

    const parts = [
      changed ? `updated ${changed} player movement constant(s)` : "already patched",
    ];
    if (revertedLegacy) {
      parts.push(`reverted ${revertedLegacy} legacy global movement pointer(s)`);
    }
    if (fallbackCount) {
      parts.push(`${fallbackCount} via fallback scan`);
    }
    log.push(`Faster movement: ${parts.join("; ")}.`);
  }

  function patchInstantText(rom, force, log) {
    const stub = bytesFromHex("01 20 70 47");

    const optionsPreferred = arm9Offset(rom, 0x02027ac0, 0x1a);
    const optionsExpected = bytesFromHex(`
      08 b5 ff f7 ef ff 00 28 01 d1 08 20 08 bd 01 28 01 d1 04 20 08 bd 01 20 08 bd
    `);
    const optionsPatched = padBytes(stub, optionsExpected.length);
    const optionsLocated = locateNearby(
      rom,
      optionsPreferred,
      optionsExpected,
      optionsPatched,
      0x200,
      "Options text speed"
    );
    const optionsState = requireBytes(
      rom,
      optionsLocated.offset,
      optionsExpected,
      optionsPatched,
      force,
      "Options text speed"
    );
    if (optionsState !== "already") {
      writeBytes(rom, optionsLocated.offset, optionsPatched);
    }

    const battlePreferred = overlayOffset(rom, OVERLAY_16, 0x3cb0, 0x28);
    const battleExpected = bytesFromHex(`
      08 b5 c2 6a 04 21 11 42 06 d0 06 49 42 58 10 21
      11 42 01 d1 01 20 08 bd 6d 21 89 00 40 58 e8 f5
      57 fe 08 bd 0c 24 00 00
    `);
    const battlePatched = padBytes(stub, battleExpected.length);
    const battleLocated = locateNearby(
      rom,
      battlePreferred.offset,
      battleExpected,
      battlePatched,
      0x200,
      "Battle text speed"
    );
    const battleState = requireBytes(
      rom,
      battleLocated.offset,
      battleExpected,
      battlePatched,
      force,
      "Battle text speed"
    );
    if (battleState !== "already") {
      writeBytes(rom, battleLocated.offset, battlePatched);
    }

    const fallbackParts = [];
    if (optionsLocated.usedFallback) {
      fallbackParts.push(`field helper at ${hex(optionsLocated.offset)}`);
    }
    if (battleLocated.usedFallback) {
      fallbackParts.push(`battle helper at overlay 16+${hex(battleLocated.offset - battlePreferred.overlay.start)}`);
    }
    log.push(
      `Force fast text: field and battle text-speed helpers return fast async speed${
        fallbackParts.length ? ` (fallback scan: ${fallbackParts.join(", ")})` : ""
      }.`
    );
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

  function textCharsPerFrameOption(options) {
    const value = Number(options && options.textCharsPerFrame);
    if (!Number.isFinite(value)) {
      return 4;
    }
    return Math.max(2, Math.min(10, Math.trunc(value)));
  }

  function frameRateModeOption(options) {
    return options && options.frameRateMode === "global" ? "global" : "battle";
  }

  function frameRateModeText(options) {
    return frameRateModeOption(options) === "global" ? "global" : "battle";
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

  function ivRangeText(options) {
    const { minIv, maxIv } = ivRangeOption(options);
    return `${minIv}-${maxIv}`;
  }

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

  function natureMaskText(options) {
    const mask = natureAllowedOption(options).reduce((value, nature) => value | (1 << nature), 0);
    return mask.toString(16).toUpperCase();
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

  function shinyPercentFromThreshold(threshold) {
    return Math.round((Math.max(0, Math.min(65536, threshold)) * 100) / 65536);
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

  function buildTextNxHelper(helperAddress, charsPerFrame) {
    const textRender = 0x0201d9e8;
    const generateLookup = 0x0201d9fc;
    const windowCopyToVram = 0x0201a954;
    const destroyPrinter = 0x0201d6b0;
    const pausePrinter = 0x021c04d8;
    const out = [];
    const labels = new Map();
    const fixups = [];
    const pauseLoadOffsets = [];

    function here() {
      return helperAddress + out.length;
    }
    function emit16(value) {
      out.push(value & 0xff, (value >>> 8) & 0xff);
    }
    function emit(bytes) {
      out.push(...bytes);
    }
    function label(name) {
      labels.set(name, here());
    }
    function branch(name) {
      const at = here();
      emit16(0);
      fixups.push({ at, offset: out.length - 2, type: "b", name });
    }
    function beq(name) {
      const at = here();
      emit16(0);
      fixups.push({ at, offset: out.length - 2, type: "cond", condition: 0, name });
    }
    function bne(name) {
      const at = here();
      emit16(0);
      fixups.push({ at, offset: out.length - 2, type: "cond", condition: 1, name });
    }
    function bl(target) {
      emit(thumbBl(here(), target));
    }
    function ldrPausePrinterR2() {
      pauseLoadOffsets.push(out.length);
      emit16(0); // ldr r2, =pausePrinter; patched after literal placement
    }

    emit16(0xb5f0); // push {r4-r7, lr}
    ldrPausePrinterR2();
    emit16(0x7810); // ldrb r0, [r2]
    emit16(0x2800); // cmp r0, #0
    bne("done");
    emit16(0x1c0c); // adds r4, r1, #0
    emit16(0x1c20); // adds r0, r4, #0
    emit16(0x302d); // adds r0, #0x2d
    emit16(0x7800); // ldrb r0, [r0]
    emit16(0x2800); // cmp r0, #0
    beq("noPendingCallback");
    emit16(0x69e2); // ldr r2, [r4, #0x1c]
    emit16(0x1c20); // adds r0, r4, #0
    emit16(0x8de1); // ldrh r1, [r4, #0x2e]
    emit16(0x4790); // blx r2
    emit16(0x1c21); // adds r1, r4, #0
    emit16(0x312d); // adds r1, #0x2d
    emit16(0x7008); // strb r0, [r1]
    branch("done");

    label("noPendingCallback");
    emit16(0x2000); // movs r0, #0
    emit16(0x85e0); // strh r0, [r4, #0x2e]
    emit16(0x7d60); // ldrb r0, [r4, #0x15]
    emit16(0x7da1); // ldrb r1, [r4, #0x16]
    emit16(0x7de2); // ldrb r2, [r4, #0x17]
    bl(generateLookup);
    emit16(0x69e3); // ldr r3, [r4, #0x1c]
    emit16(0x2b00); // cmp r3, #0
    beq("loopStart");
    emit16(0x1c20); // adds r0, r4, #0
    bl(textRender);
    emit16(0x2800); // cmp r0, #0
    beq("callbackPrint");
    emit16(0x2801); // cmp r0, #1
    beq("callbackFinish");
    emit16(0x2803); // cmp r0, #3
    beq("callbackUpdate");
    branch("done");

    label("callbackPrint");
    emit16(0x6860); // ldr r0, [r4, #4]
    bl(windowCopyToVram);

    label("callbackUpdate");
    emit16(0x69e2); // ldr r2, [r4, #0x1c]
    emit16(0x2a00); // cmp r2, #0
    beq("done");
    emit16(0x1c20); // adds r0, r4, #0
    emit16(0x8de1); // ldrh r1, [r4, #0x2e]
    emit16(0x4790); // blx r2
    emit16(0x1c21); // adds r1, r4, #0
    emit16(0x312d); // adds r1, #0x2d
    emit16(0x7008); // strb r0, [r1]
    branch("done");

    label("callbackFinish");
    emit16(0x1c20); // adds r0, r4, #0
    emit16(0x302c); // adds r0, #0x2c
    emit16(0x7800); // ldrb r0, [r0]
    bl(destroyPrinter);
    branch("done");

    label("loopStart");
    emit16(0x2500 | charsPerFrame); // movs r5, #charsPerFrame
    emit16(0x2600); // movs r6, #0

    label("loop");
    emit16(0x1c20); // adds r0, r4, #0
    bl(textRender);
    emit16(0x2800); // cmp r0, #0
    beq("gotPrint");
    emit16(0x2801); // cmp r0, #1
    beq("finish");
    emit16(0x2803); // cmp r0, #3
    beq("update");
    branch("update");

    label("gotPrint");
    emit16(0x2601); // movs r6, #1
    emit16(0x3d01); // subs r5, #1
    bne("loop");
    branch("copyDone");

    label("update");
    emit16(0x2e00); // cmp r6, #0
    beq("done");
    branch("copyDone");

    label("finish");
    emit16(0x2e00); // cmp r6, #0
    beq("finishDestroy");
    emit16(0x6860); // ldr r0, [r4, #4]
    bl(windowCopyToVram);

    label("finishDestroy");
    emit16(0x1c20); // adds r0, r4, #0
    emit16(0x302c); // adds r0, #0x2c
    emit16(0x7800); // ldrb r0, [r0]
    bl(destroyPrinter);
    branch("done");

    label("copyDone");
    emit16(0x6860); // ldr r0, [r4, #4]
    bl(windowCopyToVram);

    label("done");
    emit16(0xbdf0); // pop {r4-r7, pc}

    while (out.length % 4 !== 0) {
      out.push(0);
    }
    const literalAddress = here();
    emit([pausePrinter & 0xff, (pausePrinter >>> 8) & 0xff, (pausePrinter >>> 16) & 0xff, (pausePrinter >>> 24) & 0xff]);

    for (const pauseLoadOffset of pauseLoadOffsets) {
      const pcBase = (helperAddress + pauseLoadOffset + 4) & ~3;
      const literalOffset = literalAddress - pcBase;
      if (literalOffset < 0 || literalOffset > 1020 || literalOffset % 4 !== 0) {
        throw new Error("internal text speed literal is out of range");
      }
      const pauseLoad = 0x4800 | (2 << 8) | (literalOffset / 4);
      out[pauseLoadOffset] = pauseLoad & 0xff;
      out[pauseLoadOffset + 1] = (pauseLoad >>> 8) & 0xff;
    }

    for (const fixup of fixups) {
      const target = labels.get(fixup.name);
      if (target == null) {
        throw new Error(`internal text speed label not found: ${fixup.name}`);
      }
      const bytes =
        fixup.type === "cond"
          ? thumbCondBranch(fixup.at, target, fixup.condition)
          : thumbB(fixup.at, target);
      out[fixup.offset] = bytes[0];
      out[fixup.offset + 1] = bytes[1];
    }

    return new Uint8Array(out);
  }

  function textNxHook(fromAddress, helperAddress) {
    return new Uint8Array([
      0x00,
      0xb5,
      ...thumbBl(fromAddress + 2, helperAddress),
      0x00,
      0xbd,
    ]);
  }

  function decodeThumbBl(fromAddress, bytes, offset) {
    const first = bytes[offset] | (bytes[offset + 1] << 8);
    const second = bytes[offset + 2] | (bytes[offset + 3] << 8);
    if ((first & 0xf800) !== 0xf000 || (second & 0xf800) !== 0xf800) {
      return null;
    }
    let branchOffset = ((first & 0x7ff) << 12) | ((second & 0x7ff) << 1);
    if (branchOffset & 0x400000) {
      branchOffset -= 0x800000;
    }
    return (fromAddress + 4 + branchOffset) >>> 0;
  }

  function matchingTextSpeedHelper(rom, offset, helperRamAddress) {
    for (let speed = 2; speed <= 10; speed += 1) {
      if (bytesEqual(rom, offset, buildTextNxHelper(helperRamAddress, speed))) {
        return speed;
      }
    }
    return null;
  }

  function patchText4x(rom, force, log, options = {}) {
    const charsPerFrame = textCharsPerFrameOption(options);
    const label = `Experimental ${charsPerFrame}x text`;
    patchInstantText(rom, force, log);

    const arm9 = getArm9Info(rom);
    const hookRamAddress = 0x0201d97c;
    const preferredCaveRamAddress = 0x020795e0;
    const hookOriginal = bytesFromHex("10 b5 19 48 0c 1c 00 78");
    const hookAtPreferred = arm9Offset(rom, hookRamAddress, hookOriginal.length);
    const preferredHelper = buildTextNxHelper(preferredCaveRamAddress, charsPerFrame);
    const caveExpected = new Uint8Array(preferredHelper.length).fill(0xff);

    let existingHelperRamAddress = null;
    if (
      bytesEqual(rom, hookAtPreferred, bytesFromHex("00 b5")) &&
      bytesEqual(rom, hookAtPreferred + 6, bytesFromHex("00 bd"))
    ) {
      existingHelperRamAddress = decodeThumbBl(hookRamAddress + 2, rom, hookAtPreferred + 2);
    }

    const existingHelperAt =
      existingHelperRamAddress == null
        ? -1
        : arm9.fileOffset + (existingHelperRamAddress - arm9.loadAddress);
    const existingHelper =
      existingHelperAt >= arm9.fileOffset &&
      existingHelperAt + preferredHelper.length <= arm9.fileOffset + arm9.size
        ? buildTextNxHelper(existingHelperRamAddress, charsPerFrame)
        : null;
    const existingHelperSpeed =
      existingHelperAt >= arm9.fileOffset &&
      existingHelperAt + preferredHelper.length <= arm9.fileOffset + arm9.size
        ? matchingTextSpeedHelper(rom, existingHelperAt, existingHelperRamAddress)
        : null;

    if (
      existingHelper &&
      bytesEqual(rom, existingHelperAt, existingHelper) &&
      bytesEqual(rom, hookAtPreferred, textNxHook(hookRamAddress, existingHelperRamAddress))
    ) {
      log.push(
        `${label}: already patched at ARM9 file ${hex(hookAtPreferred)} / RAM ${hex(
          hookRamAddress
        )}; helper at ARM9 file ${hex(existingHelperAt)} / RAM ${hex(existingHelperRamAddress)}.`
      );
      return;
    }

    const locatedHook = locateNearby(
      rom,
      hookAtPreferred,
      hookOriginal,
      textNxHook(hookRamAddress, preferredCaveRamAddress),
      0x200,
      `${label} hook`
    );
    const hookAt = locatedHook.offset;
    const actualHookRamAddress = arm9.loadAddress + (hookAt - arm9.fileOffset);

    let caveAt =
      existingHelperSpeed == null
        ? arm9Offset(rom, preferredCaveRamAddress, preferredHelper.length)
        : existingHelperAt;
    let caveFillValue = 0xff;
    let caveFallback = false;
    if (
      existingHelperSpeed == null &&
      !bytesEqual(rom, caveAt, caveExpected) &&
      !bytesEqual(rom, caveAt, preferredHelper)
    ) {
      let dynamicCave = findFillRun(
        rom,
        arm9.fileOffset,
        arm9.fileOffset + arm9.size,
        0xff,
        preferredHelper.length,
        caveAt
      );
      if (dynamicCave === -1) {
        dynamicCave = findFillRun(
          rom,
          arm9.fileOffset,
          arm9.fileOffset + arm9.size,
          0x00,
          preferredHelper.length,
          caveAt
        );
        caveFillValue = 0x00;
      }
      if (dynamicCave !== -1) {
        caveAt = dynamicCave;
        caveFallback = caveAt !== arm9Offset(rom, preferredCaveRamAddress, preferredHelper.length);
      } else if (!force) {
        throw new PatchError(`${label} could not find a free ARM9 code cave.`);
      }
    }

    const helperRamAddress = arm9.loadAddress + (caveAt - arm9.fileOffset);
    const helper = buildTextNxHelper(helperRamAddress, charsPerFrame);
    const hook = textNxHook(actualHookRamAddress, helperRamAddress);
    const hookAlready = bytesEqual(rom, hookAt, hook);
    const helperAlready = bytesEqual(rom, caveAt, helper);

    if (!hookAlready && !bytesEqual(rom, hookAt, hookOriginal) && !force) {
      const found = Array.from(rom.slice(hookAt, hookAt + hookOriginal.length))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join(" ");
      throw new PatchError(
        `${label} hook sanity check failed at ${hex(hookAt)}. Found ${found}. Enable compatible modified bytes to patch anyway.`
      );
    }
    if (
      !helperAlready &&
      existingHelperSpeed == null &&
      !bytesEqual(rom, caveAt, new Uint8Array(helper.length).fill(caveFillValue)) &&
      !force
    ) {
      throw new PatchError(
        `${label} code cave sanity check failed at ${hex(caveAt)}. Enable compatible modified bytes to patch anyway.`
      );
    }

    if (!helperAlready) {
      writeBytes(rom, caveAt, helper);
    }
    if (!hookAlready) {
      writeBytes(rom, hookAt, hook);
    }

    const notes = [];
    if (locatedHook.usedFallback) {
      notes.push("hook fallback scan");
    }
    if (caveFallback) {
      notes.push(`code-cave fallback scan (${hex(caveFillValue)} fill)`);
    }
    if (existingHelperSpeed != null && existingHelperSpeed !== charsPerFrame) {
      notes.push(`updated from ${existingHelperSpeed}x`);
    }
    log.push(
      `${label}: ${hookAlready && helperAlready ? "already patched" : "installed"} hook at ARM9 file ${hex(
        hookAt
      )} / RAM ${hex(actualHookRamAddress)}; helper at ARM9 file ${hex(caveAt)} / RAM ${hex(
        helperRamAddress
      )}${notes.length ? ` (${notes.join(", ")})` : ""}.`
    );
  }

  function accuracyTrampoline(fromAddress, caveAddress) {
    const patch = new Uint8Array(ACCURACY_TRAMPOLINE);
    patch.set(thumbBl(fromAddress, caveAddress), 0);
    return patch;
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

  function patchPlayerAccuracy(rom, force, log) {
    const overlay = getOverlayRange(rom, OVERLAY_16);
    const expectedRel = 0x140fa;
    const caveRel = 0x34c68;
    const trampExpected = bytesFromHex(`
      04 dd 0c 49 01 20 6a 58 10 43 68 50 00 20 08 b0 f8 bd
    `);
    const caveExpected = new Uint8Array(ACCURACY_CAVE.length).fill(0xff);
    const preferredCaveAt = overlayOffset(rom, OVERLAY_16, caveRel, ACCURACY_CAVE.length).offset;
    const caveHits = findNeedle(
      rom,
      ACCURACY_CAVE,
      Math.max(overlay.start, preferredCaveAt - 0x400),
      overlay.end
    );
    let caveAt = caveHits.length === 1 ? caveHits[0] : preferredCaveAt;
    if (caveHits.length !== 1 && !bytesEqual(rom, caveAt, caveExpected)) {
      const dynamicCave = findFillRun(
        rom,
        overlay.start,
        overlay.end,
        0xff,
        ACCURACY_CAVE.length,
        preferredCaveAt
      );
      if (dynamicCave !== -1) {
        caveAt = dynamicCave;
      }
    }
    const actualCaveRel = caveAt - overlay.start;
    const caveAddress = overlay.loadAddress + actualCaveRel;
    const searchStart = Math.max(overlay.start, overlay.start + expectedRel - 0x100);
    const searchEnd = Math.min(overlay.end, overlay.start + expectedRel + 0x100);
    const expectedHits = findNeedle(rom, trampExpected, searchStart, searchEnd);
    let trampAt = expectedHits.length === 1 ? expectedHits[0] : overlay.start + expectedRel;
    let trampRel = trampAt - overlay.start;
    let trampFallback = trampRel !== expectedRel;
    let trampoline = accuracyTrampoline(overlay.loadAddress + trampRel, caveAddress);

    if (expectedHits.length !== 1) {
      for (let rel = expectedRel - 0x100; rel <= expectedRel + 0x100; rel += 2) {
        if (rel < 0 || overlay.start + rel + ACCURACY_TRAMPOLINE.length > overlay.end) {
          continue;
        }
        const candidate = accuracyTrampoline(overlay.loadAddress + rel, caveAddress);
        if (bytesEqual(rom, overlay.start + rel, candidate)) {
          trampAt = overlay.start + rel;
          trampRel = rel;
          trampFallback = trampRel !== expectedRel;
          trampoline = candidate;
          break;
        }
      }
    }

    const trampState = requireBytes(
      rom,
      trampAt,
      trampExpected,
      trampoline,
      force,
      "Player accuracy trampoline"
    );
    const caveState = requireBytes(
      rom,
      caveAt,
      caveExpected,
      ACCURACY_CAVE,
      force,
      "Player accuracy code cave"
    );

    if (trampState === "already" && caveState === "already") {
      log.push("Player accuracy bypass: already patched.");
      return;
    }

    writeBytes(rom, caveAt, ACCURACY_CAVE);
    writeBytes(rom, trampAt, trampoline);
    log.push(
      `Player accuracy bypass: standard misses are skipped for player-side attackers at overlay 16+${hex(trampRel)}; helper at +${hex(actualCaveRel)}.`
        .replace(
          ".",
          `${trampFallback || actualCaveRel !== caveRel ? " (fallback scan)" : ""}.`
        )
    );
  }

  const PATCH_IMPLS = {
    frameRate: patchFrameRateUnlock,
    shinyOdds: patchShinyOdds,
    noCrits: patchNoCrits,
    iv15_31: patchIv15To31,
    wildNatures: patchWildNatures,
    movementSpeed: patchMovementSpeed,
    fairyType: patchFairyType,
    fairyPokemonTypes: patchFairyPokemonTypes,
    instantText: patchInstantText,
    text4x: patchText4x,
    playerAccuracy: patchPlayerAccuracy,
  };

  function applySelectedPatches(inputBytes, patchIds, options = {}) {
    const rom = new Uint8Array(inputBytes);
    const log = [];
    const debugFairyBattleTest = Boolean(options.debugFairyBattleTest);
    if (rom.length < 0x200) {
      throw new PatchError("File is too small to be a Nintendo DS ROM.");
    }
    if (!patchIds.length) {
      throw new PatchError("Select at least one patch.");
    }

    const selected = new Set(patchIds);
    if (selected.has("fairyPokemonTypes")) {
      selected.add("fairyType");
    }
    if (debugFairyBattleTest && !selected.has("fairyType")) {
      throw new PatchError("DEBUG Fairy battle test requires the Fairy Patch.");
    }
    if (debugFairyBattleTest) {
      selected.add("fairyPokemonTypes");
    }
    const effectivePatchIds = Array.from(selected);
    const orderedPatchIds = selected.has("fairyType")
      ? ["fairyType", ...effectivePatchIds.filter((patchId) => patchId !== "fairyType")]
      : effectivePatchIds;
    for (const patchId of orderedPatchIds) {
      if (patchId === "instantText" && selected.has("text4x")) {
        continue;
      }
      const patch = PATCH_IMPLS[patchId];
      if (!patch) {
        throw new PatchError(`Unknown patch: ${patchId}`);
      }
      patch(rom, Boolean(options.force), log, options);
    }

    if (debugFairyBattleTest) {
      patchDebugFairyBattleTest(rom, log);
    }

    return { rom, log };
  }

  function outputName(inputName, patchIds, options = {}) {
    const dot = inputName.toLowerCase().endsWith(".nds") ? inputName.length - 4 : inputName.length;
    const base = inputName.slice(0, dot) || "platinum";
    const suffix = patchIds
      .map((id) =>
        id === "frameRate"
          ? `framerate${frameRateModeText(options)}`
          : id === "text4x"
          ? `text${textCharsPerFrameOption(options)}x`
          : id === "shinyOdds"
            ? options && options.shinyOddsPercent !== undefined
              ? `shiny${shinyOddsPercentOption(options)}pct`
              : `shinyT${shinyThresholdOption(options)}`
            : id === "iv15_31"
              ? `iv${ivRangeText(options)}`
              : id === "wildNatures"
                ? `natures${natureMaskText(options)}`
            : id.replace(/_/g, "")
      )
      .join(".");
    return `${base}.${suffix || "patched"}.nds`;
  }

  function customOutputName(inputName, fallbackName) {
    const trimmed = inputName.trim();
    if (!trimmed) {
      return fallbackName;
    }
    const safe = trimmed.replace(/[\\/:*?"<>|\x00-\x1f]/g, "_");
    return safe.toLowerCase().endsWith(".nds") ? safe : `${safe}.nds`;
  }

  function initUi() {
    const romInput = document.getElementById("romInput");
    const forceInput = document.getElementById("forceInput");
    const applyButton = document.getElementById("applyButton");
    const downloadLink = document.getElementById("downloadLink");
    const outputNameInput = document.getElementById("outputNameInput");
    const logOutput = document.getElementById("logOutput");
    const romStatus = document.getElementById("romStatus");
    const fileSubtitle = document.getElementById("fileSubtitle");
    const patchGrid = document.getElementById("patchGrid");
    const frameRateModeInputs = Array.from(document.querySelectorAll("input[name='frameRateMode']"));
    const textCharsPerFrameInput = document.getElementById("textCharsPerFrame");
    const textCharsPerFrameValue = document.getElementById("textCharsPerFrameValue");
    const shinyOddsPercentInput = document.getElementById("shinyOddsPercent");
    const shinyOddsValue = document.getElementById("shinyOddsValue");
    const ivMinInput = document.getElementById("ivMin");
    const ivMinValue = document.getElementById("ivMinValue");
    const ivMaxInput = document.getElementById("ivMax");
    const ivMaxValue = document.getElementById("ivMaxValue");
    const natureGrid = document.getElementById("natureGrid");
    const natureCountValue = document.getElementById("natureCountValue");
    const fairyTypeInput = document.getElementById("fairyTypePatch");
    const fairyPokemonTypesInput = document.getElementById("fairyPokemonTypesPatch");

    let loadedFile = null;
    let loadedBytes = null;
    let downloadUrl = null;

    function setLog(lines) {
      logOutput.textContent = Array.isArray(lines) ? lines.join("\n") : lines;
    }

    function clearDownload() {
      if (downloadUrl) {
        URL.revokeObjectURL(downloadUrl);
        downloadUrl = null;
      }
      downloadLink.classList.add("hidden");
      downloadLink.removeAttribute("href");
      downloadLink.removeAttribute("download");
    }

    function selectedPatches() {
      return Array.from(patchGrid.querySelectorAll("input[type='checkbox']:checked")).map(
        (input) => input.value
      ).filter((patchId) => PATCH_IMPLS[patchId]);
    }

    function selectedNatureIds() {
      return Array.from(natureGrid.querySelectorAll("input[type='checkbox']:checked")).map(
        (input) => Number(input.value)
      );
    }

    function patchOptions() {
      return {
        force: forceInput.checked,
        frameRateMode:
          (frameRateModeInputs.find((input) => input.checked) || frameRateModeInputs[0]).value,
        textCharsPerFrame: textCharsPerFrameOption({
          textCharsPerFrame: textCharsPerFrameInput.value,
        }),
        shinyOddsPercent: shinyOddsPercentOption({
          shinyOddsPercent: shinyOddsPercentInput.value,
        }),
        ...ivRangeOption({
          ivMin: ivMinInput.value,
          ivMax: ivMaxInput.value,
        }),
        natureAllowed: selectedNatureIds(),
        debugFairyBattleTest: Boolean(CONSOLE_CONFIG.debugFairyBattleTest),
      };
    }

    function patchLabel(id, options) {
      if (id === "frameRate") {
        return `${PATCHES[id]} (${frameRateModeOption(options) === "global" ? "global" : "battle only"})`;
      }
      if (id === "text4x") {
        return `${PATCHES[id]} (${textCharsPerFrameOption(options)}x)`;
      }
      if (id === "shinyOdds") {
        const threshold = shinyThresholdOption(options);
        if (options && options.shinyOddsPercent !== undefined) {
          return `${PATCHES[id]} (${shinyOddsPercentOption(options)}%, ${threshold}/65536)`;
        }
        return `${PATCHES[id]} (${threshold}/65536, ${shinyOddsLabel(threshold)})`;
      }
      if (id === "iv15_31") {
        return `${PATCHES[id]} (${ivRangeText(options)})`;
      }
      if (id === "wildNatures") {
        return `${PATCHES[id]} (${natureAllowedOption(options).length} allowed)`;
      }
      return PATCHES[id];
    }

    function updateTextSpeedValue() {
      textCharsPerFrameValue.textContent = `${textCharsPerFrameOption({
        textCharsPerFrame: textCharsPerFrameInput.value,
      })}x`;
    }

    function updateShinyOddsValue() {
      const percent = shinyOddsPercentOption({
        shinyOddsPercent: shinyOddsPercentInput.value,
      });
      const threshold = shinyThresholdFromPercent(percent);
      shinyOddsPercentInput.value = String(percent);
      shinyOddsValue.textContent = `${percent}% - ${threshold}/65536`;
    }

    function updateIvRangeValue(changedInput) {
      let minIv = Number(ivMinInput.value);
      let maxIv = Number(ivMaxInput.value);
      if (changedInput === ivMinInput && minIv > maxIv) {
        maxIv = minIv;
        ivMaxInput.value = String(maxIv);
      } else if (changedInput === ivMaxInput && maxIv < minIv) {
        minIv = maxIv;
        ivMinInput.value = String(minIv);
      }
      const range = ivRangeOption({ ivMin: minIv, ivMax: maxIv });
      ivMinInput.value = String(range.minIv);
      ivMaxInput.value = String(range.maxIv);
      ivMinValue.textContent = String(range.minIv);
      ivMaxValue.textContent = String(range.maxIv);
    }

    function renderNatureButtons() {
      natureGrid.textContent = "";
      const corner = document.createElement("div");
      corner.className = "nature-corner";
      corner.setAttribute("aria-hidden", "true");
      natureGrid.append(corner);

      for (const stat of NATURE_STAT_GRID) {
        const header = document.createElement("div");
        header.className = `nature-axis nature-axis-down nature-stat-${stat.key}`;
        header.textContent = `↓ ${stat.label}`;
        natureGrid.append(header);
      }

      for (const boosted of NATURE_STAT_GRID) {
        const rowHeader = document.createElement("div");
        rowHeader.className = `nature-axis nature-axis-up nature-stat-${boosted.key}`;
        rowHeader.textContent = `↑ ${boosted.label}`;
        natureGrid.append(rowHeader);

        for (const hindered of NATURE_STAT_GRID) {
          const nature = boosted.natureIndex * 5 + hindered.natureIndex;
          const label = document.createElement("label");
          label.className = "nature-chip";
          if (boosted.natureIndex === hindered.natureIndex) {
            label.classList.add("nature-neutral");
          }
          const input = document.createElement("input");
          input.type = "checkbox";
          input.value = String(nature);
          input.checked = DEFAULT_ALLOWED_NATURES.includes(nature);
          input.setAttribute(
            "aria-label",
            `${NATURE_NAMES[nature]}: raises ${boosted.label}, lowers ${hindered.label}`
          );
          const span = document.createElement("span");
          span.textContent = NATURE_NAMES[nature];
          span.title = `${NATURE_NAMES[nature]}: raises ${boosted.label}, lowers ${hindered.label}`;
          label.append(input, span);
          natureGrid.append(label);
        }
      }
    }

    function updateNatureCount(changedInput) {
      const checked = selectedNatureIds();
      if (!checked.length && changedInput) {
        changedInput.checked = true;
        checked.push(Number(changedInput.value));
      }
      natureCountValue.textContent = `${checked.length} allowed`;
    }

    renderNatureButtons();
    updateTextSpeedValue();
    updateShinyOddsValue();
    updateIvRangeValue();
    updateNatureCount();
    textCharsPerFrameInput.addEventListener("input", () => {
      updateTextSpeedValue();
      clearDownload();
    });
    shinyOddsPercentInput.addEventListener("input", () => {
      updateShinyOddsValue();
      clearDownload();
    });
    ivMinInput.addEventListener("input", () => {
      updateIvRangeValue(ivMinInput);
      clearDownload();
    });
    ivMaxInput.addEventListener("input", () => {
      updateIvRangeValue(ivMaxInput);
      clearDownload();
    });
    natureGrid.addEventListener("change", (event) => {
      if (event.target instanceof HTMLInputElement && event.target.type === "checkbox") {
        updateNatureCount(event.target);
        clearDownload();
      }
    });
    fairyPokemonTypesInput.addEventListener("change", () => {
      if (fairyPokemonTypesInput.checked) {
        fairyTypeInput.checked = true;
      }
      clearDownload();
    });
    fairyTypeInput.addEventListener("change", () => {
      if (!fairyTypeInput.checked) {
        fairyPokemonTypesInput.checked = false;
      }
      clearDownload();
    });
    patchGrid.addEventListener("change", clearDownload);
    forceInput.addEventListener("change", clearDownload);
    outputNameInput.addEventListener("input", clearDownload);

    romInput.addEventListener("change", async () => {
      clearDownload();
      loadedFile = romInput.files && romInput.files[0] ? romInput.files[0] : null;
      loadedBytes = null;

      if (!loadedFile) {
        applyButton.disabled = true;
        romStatus.textContent = `No ROM loaded · ${APP_VERSION}`;
        romStatus.classList.remove("ready");
        fileSubtitle.textContent = "The patched ROM is generated locally in your browser.";
        setLog("Waiting for a ROM.");
        return;
      }

      try {
        const buffer = await loadedFile.arrayBuffer();
        loadedBytes = new Uint8Array(buffer);
        applyButton.disabled = false;
        romStatus.textContent = `${loadedFile.name} loaded · ${APP_VERSION}`;
        romStatus.classList.add("ready");
        fileSubtitle.textContent = `${loadedFile.name} - ${(loadedFile.size / 1024 / 1024).toFixed(
          1
        )} MB`;
        setLog([
          `Loaded ${loadedFile.name}.`,
          `Size: ${loadedFile.size.toLocaleString()} bytes.`,
          "Choose patches and apply.",
        ]);
      } catch (error) {
        applyButton.disabled = true;
        romStatus.textContent = "Load failed";
        romStatus.classList.remove("ready");
        setLog(`Error: ${error.message}`);
      }
    });

    applyButton.addEventListener("click", () => {
      clearDownload();
      if (!loadedBytes || !loadedFile) {
        setLog("Choose a ROM first.");
        return;
      }

      const ids = selectedPatches();
      try {
        const options = patchOptions();
        const result = applySelectedPatches(loadedBytes, ids, options);
        const blob = new Blob([result.rom], { type: "application/octet-stream" });
        downloadUrl = URL.createObjectURL(blob);
        downloadLink.href = downloadUrl;
        downloadLink.download = customOutputName(
          outputNameInput.value,
          outputName(loadedFile.name, ids, options)
        );
        downloadLink.classList.remove("hidden");

        setLog([
          "Applied patches:",
          ...ids.map((id) => `- ${patchLabel(id, options)}`),
          "",
          ...result.log,
          "",
          `Output: ${downloadLink.download}`,
        ]);
      } catch (error) {
        const label = error instanceof PatchError ? "Patch error" : "Error";
        setLog(`${label}: ${error.message}`);
      }
    });
  }

  if (typeof window !== "undefined") {
    window.PlatinumPatcher = { applySelectedPatches, PATCHES, PatchError, config: CONSOLE_CONFIG };
    window.addEventListener("DOMContentLoaded", initUi);
  }

  if (typeof module !== "undefined") {
    module.exports = { applySelectedPatches, PATCHES, PatchError, config: CONSOLE_CONFIG };
  }
})();
