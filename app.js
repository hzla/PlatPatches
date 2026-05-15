(() => {
  "use strict";

  class PatchError extends Error {
    constructor(message) {
      super(message);
      this.name = "PatchError";
    }
  }

  const PATCHES = {
    noCrits: "No critical hits",
    iv15_31: "Random IVs 15-31",
    wildNatures: "Filter wild natures",
    movementSpeed: "Faster movement",
    fairyType: "Fairy Patch",
    fairyPokemonTypes: "Update Pokemon Types",
    instantText: "Force fast text",
    text4x: "Experimental text speed",
    playerAccuracy: "Player accuracy bypass",
  };
  const APP_VERSION = "v12";
  const CONSOLE_CONFIG = {
    debugFairyBattleTest: false,
  };

  const OVERLAY_6 = 6;
  const OVERLAY_16 = 16;
  const OVERLAY_21 = 21;
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

  function buildIvPatch(patchRamAddress) {
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

  const WILD_NATURE_PATCH = padBytes(
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

  const FAIRY_POKEMON_TYPE_RETAGS = [
    [35, 0x09, 0x09], [36, 0x09, 0x09], [39, 0x00, 0x09], [40, 0x00, 0x09],
    [122, 0x0e, 0x09], [175, 0x09, 0x09], [176, 0x09, 0x02], [183, 0x0b, 0x09],
    [184, 0x0b, 0x09], [209, 0x09, 0x09], [210, 0x09, 0x09], [280, 0x0e, 0x09],
    [281, 0x0e, 0x09], [282, 0x0e, 0x09], [298, 0x00, 0x09], [303, 0x08, 0x09],
    [439, 0x0e, 0x09], [468, 0x09, 0x02],
  ];

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

  function patchIv15To31(rom, force, log) {
    const patchRamAddress = 0x02073f48;
    const ivPatch = buildIvPatch(patchRamAddress);
    const preferredAt = arm9Offset(rom, patchRamAddress, ivPatch.length);
    let located = locateNearby(rom, preferredAt, IV_ORIGINAL, ivPatch, 0x200, "Random IVs 15-31");
    if (
      located.offset === preferredAt &&
      !bytesEqual(rom, preferredAt, IV_ORIGINAL) &&
      !bytesEqual(rom, preferredAt, ivPatch) &&
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
    const actualIvPatch = buildIvPatch(actualPatchRamAddress);
    if (bytesEqual(rom, patchAt, actualIvPatch)) {
      log.push(
        `Random IVs 15-31: already patched${
          located.usedFallback ? ` (fallback scan found ${hex(patchAt)})` : ""
        }.`
      );
      return;
    }
    if (!bytesEqual(rom, patchAt, IV_ORIGINAL) && !bytesEqual(rom, patchAt, IV_BAD_PATCH) && !force) {
      const found = Array.from(rom.slice(patchAt, patchAt + actualIvPatch.length))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join(" ");
      throw new PatchError(
        `Random IVs 15-31 sanity check failed at ${hex(patchAt)}. Found ${found}. Enable compatible modified bytes to patch anyway.`
      );
    }
    const repairedBrokenPatch = bytesEqual(rom, patchAt, IV_BAD_PATCH);
    writeBytes(rom, patchAt, actualIvPatch);
    log.push(
      `Random IVs 15-31: ${repairedBrokenPatch ? "repaired old broken patch and wrote" : "wrote"} ${actualIvPatch.length} bytes at ARM9 ${hex(patchAt)}${
        located.usedFallback ? " (fallback scan)" : ""
      }.`
    );
  }

  function patchWildNatures(rom, force, log) {
    const preferred = overlayOffset(rom, OVERLAY_6, 0x39a4, WILD_NATURE_PATCH.length);
    const located = locateNearby(
      rom,
      preferred.offset,
      WILD_NATURE_ORIGINAL,
      WILD_NATURE_PATCH,
      0x200,
      "Wild nature filter"
    );
    const offset = located.offset;
    const state = requireBytes(
      rom,
      offset,
      WILD_NATURE_ORIGINAL,
      WILD_NATURE_PATCH,
      force,
      "Wild nature filter"
    );
    if (state === "already") {
      log.push(
        `Wild nature filter: already patched${
          located.usedFallback ? ` (fallback scan found overlay 6+${hex(offset - preferred.overlay.start)})` : ""
        }.`
      );
      return;
    }
    writeBytes(rom, offset, WILD_NATURE_PATCH);
    log.push(
      `Wild nature filter: replaced overlay 6 wild nature routine at +${hex(
        offset - preferred.overlay.start
      )}${located.usedFallback ? " (fallback scan)" : ""}.`
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
        id === "text4x" ? `text${textCharsPerFrameOption(options)}x` : id.replace(/_/g, "")
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
    const textCharsPerFrameInput = document.getElementById("textCharsPerFrame");
    const textCharsPerFrameValue = document.getElementById("textCharsPerFrameValue");
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
      );
    }

    function patchOptions() {
      return {
        force: forceInput.checked,
        textCharsPerFrame: textCharsPerFrameOption({
          textCharsPerFrame: textCharsPerFrameInput.value,
        }),
        debugFairyBattleTest: Boolean(CONSOLE_CONFIG.debugFairyBattleTest),
      };
    }

    function patchLabel(id, options) {
      if (id === "text4x") {
        return `${PATCHES[id]} (${textCharsPerFrameOption(options)}x)`;
      }
      return PATCHES[id];
    }

    function updateTextSpeedValue() {
      textCharsPerFrameValue.textContent = `${textCharsPerFrameOption({
        textCharsPerFrame: textCharsPerFrameInput.value,
      })}x`;
    }

    updateTextSpeedValue();
    textCharsPerFrameInput.addEventListener("input", () => {
      updateTextSpeedValue();
      clearDownload();
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
