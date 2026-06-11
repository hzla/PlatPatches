(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    root.PlatinumPatcherCore = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

class PatchError extends Error {
  constructor(message) {
    super(message);
    this.name = "PatchError";
  }
}

const OVERLAY_5 = 5;
const OVERLAY_6 = 6;
const OVERLAY_13 = 13;
const OVERLAY_14 = 14;
const OVERLAY_16 = 16;
const OVERLAY_21 = 21;
const OVERLAY_84 = 84;
const SPECIES_JIGGLYPUFF = 39;
const NOP = [0xc0, 0x46];
const DSPRE_SYNTH_OVERLAY_PATH = "data/weather_sys.narc";
const DSPRE_SYNTH_OVERLAY_MEMBER = 9;
const DSPRE_SYNTH_OVERLAY_SIZE = 0x16000;
const SYNTH_OVERLAY_RAM_BASE = 0x023c8000;
const DSPRE_ARM9_BRANCH_RAM = 0x02000cb4;
const DSPRE_ARM9_INIT_RAM = 0x02101574;
const DSPRE_ARM9_BRANCH_ORIGINAL = bytesFromHex("00 20 03 21");
const DSPRE_ARM9_BRANCH_PATCHED = bytesFromHex("00 f1 5e fc");
const DSPRE_ARM9_INIT_ORIGINAL = bytesFromHex(`
  41 73 73 65 72 74 69 6f 6e 20 28 25 73 29 20
  66 61 69 6c 65 64 20 69 6e
`);
const DSPRE_ARM9_INIT_PATCHED = bytesFromHex(`
  fc b5 04 48 41 21 09 22 05 f7 92 fa 00 20 03 21
  fc bd 00 00 00 80 3c 02 00
`);

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

function updateRomSizeHeader(data) {
  writeU32(data, 0x80, data.length);
  let deviceCapacity = 0x20000;
  let exponent = 0;
  while (deviceCapacity < data.length && exponent < 0xff) {
    deviceCapacity *= 2;
    exponent += 1;
  }
  data[0x14] = exponent;
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

function locateUniquePatch(data, expected, alreadyPatched, label) {
  const expectedHits = findNeedle(data, expected, 0, data.length);
  const patchedHits = findNeedle(data, alreadyPatched, 0, data.length);

  if (expectedHits.length === 1 && patchedHits.length === 0) {
    return { offset: expectedHits[0], state: "patch" };
  }
  if (expectedHits.length === 0 && patchedHits.length === 1) {
    return { offset: patchedHits[0], state: "already" };
  }
  if (expectedHits.length === 0 && patchedHits.length === 0) {
    throw new PatchError(`${label} could not be located.`);
  }
  throw new PatchError(
    `${label} matched multiple locations: ${[...expectedHits, ...patchedHits].map(hex).join(", ")}.`
  );
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

function writeFatEntryRange(rom, fileId, start, end) {
  const fatEntry = getFatEntry(rom, fileId);
  writeU32(rom, fatEntry.entry, start);
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

function replaceRomFileAllowGrowth(rom, file, replacement, label) {
  const oldSize = file.end - file.start;
  if (replacement.length <= oldSize) {
    return { rom, state: replaceRomFile(rom, file, replacement, label), growth: 0 };
  }

  if (bytesEqual(rom, file.start, replacement) && oldSize === replacement.length) {
    return { rom, state: "already", growth: 0 };
  }

  const growth = replacement.length - oldSize;
  const expanded = new Uint8Array(rom.length + growth);
  expanded.set(rom.slice(0, file.start), 0);
  expanded.set(replacement, file.start);
  expanded.set(rom.slice(file.end), file.start + replacement.length);

  const fat = getFatInfo(expanded);
  const fatCount = Math.floor(fat.size / 8);
  for (let fileId = 0; fileId < fatCount; fileId += 1) {
    const fatEntry = getFatEntry(expanded, fileId);
    if (fileId === file.fileId) {
      writeFatEntryRange(expanded, fileId, file.start, file.start + replacement.length);
    } else if (fatEntry.start >= file.end) {
      writeFatEntryRange(expanded, fileId, fatEntry.start + growth, fatEntry.end + growth);
    }
  }

  updateRomSizeHeader(expanded);
  return { rom: expanded, state: "patch", growth };
}

function narcMemberLength(narc, memberId) {
  const parsed = parseNarc(narc);
  const entry = parsed.entries[memberId];
  if (!entry) {
    throw new PatchError(`NARC member ${memberId} does not exist.`);
  }
  return entry.end - entry.start;
}

function narcMemberBytes(narc, memberId) {
  const parsed = parseNarc(narc);
  const entry = parsed.entries[memberId];
  if (!entry) {
    throw new PatchError(`NARC member ${memberId} does not exist.`);
  }
  return narc.slice(parsed.dataBlock.dataOffset + entry.start, parsed.dataBlock.dataOffset + entry.end);
}

function asciiBytes(text) {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) {
    out[i] = text.charCodeAt(i) & 0xff;
  }
  return out;
}

function align(value, boundary) {
  return (value + boundary - 1) & ~(boundary - 1);
}

function findAlignedZeroRun(data, size, alignment = 0x10) {
  for (let offset = 0; offset <= data.length - size; offset = align(offset + 1, alignment)) {
    let ok = true;
    for (let i = 0; i < size; i += 1) {
      if (data[offset + i] !== 0x00) {
        ok = false;
        break;
      }
    }
    if (ok) {
      return offset;
    }
  }
  return -1;
}

function readSyntheticOverlayMember(rom) {
  const file = findFileByPath(rom, DSPRE_SYNTH_OVERLAY_PATH);
  const narc = rom.slice(file.start, file.end);
  const member = narcMemberBytes(narc, DSPRE_SYNTH_OVERLAY_MEMBER);
  return { file, narc, member };
}

function replaceSyntheticOverlayMember(rom, member) {
  const file = findFileByPath(rom, DSPRE_SYNTH_OVERLAY_PATH);
  const narc = rom.slice(file.start, file.end);
  const patchedNarc = replaceNarcMembers(narc, [[DSPRE_SYNTH_OVERLAY_MEMBER, member]]);
  replaceRomFile(rom, file, patchedNarc, "DSPRE synthetic overlay member");
}

function dsPreArm9ExpansionStatus(rom) {
  const branchAt = arm9Offset(rom, DSPRE_ARM9_BRANCH_RAM, DSPRE_ARM9_BRANCH_PATCHED.length);
  const initAt = arm9Offset(rom, DSPRE_ARM9_INIT_RAM, DSPRE_ARM9_INIT_PATCHED.length);
  let synthMemberLength = 0;
  let synthAvailable = false;

  try {
    const synthFile = findFileByPath(rom, DSPRE_SYNTH_OVERLAY_PATH);
    const synthNarc = rom.slice(synthFile.start, synthFile.end);
    synthMemberLength = narcMemberLength(synthNarc, DSPRE_SYNTH_OVERLAY_MEMBER);
    synthAvailable = synthMemberLength >= DSPRE_SYNTH_OVERLAY_SIZE;
  } catch (error) {
    if (error instanceof PatchError) {
      synthMemberLength = 0;
    } else {
      throw error;
    }
  }

  return {
    branchAt,
    initAt,
    branchInstalled: bytesEqual(rom, branchAt, DSPRE_ARM9_BRANCH_PATCHED),
    initInstalled: bytesEqual(rom, initAt, DSPRE_ARM9_INIT_PATCHED),
    branchOriginal: bytesEqual(rom, branchAt, DSPRE_ARM9_BRANCH_ORIGINAL),
    initOriginal: bytesEqual(rom, initAt, DSPRE_ARM9_INIT_ORIGINAL),
    synthMemberLength,
    synthAvailable,
  };
}

class SyntheticOverlayAllocator {
  constructor(rom, log = []) {
    this.rom = rom;
    this.log = log;
    this.reload();
  }

  reload() {
    const status = dsPreArm9ExpansionStatus(this.rom);
    if (!status.branchInstalled || !status.initInstalled || !status.synthAvailable) {
      throw new PatchError(
        "Synthetic overlay allocator requires the DSPRE ARM9 expansion. Apply DSPRE ARM9 expansion first."
      );
    }

    const { file, narc, member } = readSyntheticOverlayMember(this.rom);
    this.file = file;
    this.narc = narc;
    this.member = member;
    return this;
  }

  ramAddress(memberOffset) {
    return SYNTH_OVERLAY_RAM_BASE + memberOffset;
  }

  markerOffsets(marker) {
    return findNeedle(this.member, asciiBytes(marker), 0, this.member.length);
  }

  findExisting(marker, buildPayload) {
    const existing = this.markerOffsets(marker);
    if (!existing.length) {
      return null;
    }

    const markerOffset = existing[existing.length - 1];
    const payloadRamAddress = this.ramAddress(markerOffset);
    const built = buildPayload(payloadRamAddress);
    const payloadBytes = built.bytes || built;
    return {
      markerOffset,
      payloadRamAddress,
      built,
      payloadBytes,
      exact: bytesEqual(this.member, markerOffset, payloadBytes),
    };
  }

  async findExistingAsync(marker, buildPayload) {
    const existing = this.markerOffsets(marker);
    if (!existing.length) {
      return null;
    }

    const markerOffset = existing[existing.length - 1];
    const payloadRamAddress = this.ramAddress(markerOffset);
    const built = await buildPayload(payloadRamAddress);
    const payloadBytes = built.bytes || built;
    return {
      markerOffset,
      payloadRamAddress,
      built,
      payloadBytes,
      exact: bytesEqual(this.member, markerOffset, payloadBytes),
    };
  }

  allocate({ marker, buildPayload, label, alignment = 0x10, updateExisting = false }) {
    const existing = this.findExisting(marker, buildPayload);
    if (existing) {
      if (existing.exact) {
        this.log.push(
          `${label}: reused existing synthetic-overlay payload at member ${hex(
            existing.markerOffset
          )} / RAM ${hex(existing.payloadRamAddress)}.`
        );
      } else if (updateExisting) {
        const patchedMember = new Uint8Array(this.member);
        if (existing.markerOffset + existing.payloadBytes.length > patchedMember.length) {
          throw new PatchError(`${label} existing synthetic-overlay marker is too close to the end of the member.`);
        }
        patchedMember.set(existing.payloadBytes, existing.markerOffset);
        replaceSyntheticOverlayMember(this.rom, patchedMember);
        this.member = patchedMember;
        this.log.push(
          `${label}: updated existing synthetic-overlay payload at member ${hex(
            existing.markerOffset
          )} / RAM ${hex(existing.payloadRamAddress)}.`
        );
      } else {
        this.log.push(
          `${label}: found marker at member ${hex(
            existing.markerOffset
          )} / RAM ${hex(existing.payloadRamAddress)} and reused its addresses.`
        );
      }
      return { ...existing, reused: true };
    }

    const provisional = buildPayload(SYNTH_OVERLAY_RAM_BASE);
    const provisionalBytes = provisional.bytes || provisional;
    const markerOffset = findAlignedZeroRun(this.member, provisionalBytes.length, alignment);
    if (markerOffset === -1) {
      throw new PatchError(`${label} could not find a free synthetic-overlay code cave.`);
    }

    const payloadRamAddress = this.ramAddress(markerOffset);
    const built = buildPayload(payloadRamAddress);
    const payloadBytes = built.bytes || built;
    const patchedMember = new Uint8Array(this.member);
    patchedMember.set(payloadBytes, markerOffset);
    replaceSyntheticOverlayMember(this.rom, patchedMember);
    this.member = patchedMember;
    this.log.push(
      `${label}: allocated synthetic-overlay payload at member ${hex(markerOffset)} / RAM ${hex(
        payloadRamAddress
      )}, ${hex(payloadBytes.length)} byte(s).`
    );
    return { markerOffset, payloadRamAddress, built, payloadBytes, reused: false };
  }

  async allocateAsync({ marker, buildPayload, label, alignment = 0x10, updateExisting = false }) {
    const existing = await this.findExistingAsync(marker, buildPayload);
    if (existing) {
      if (existing.exact) {
        this.log.push(
          `${label}: reused existing synthetic-overlay payload at member ${hex(
            existing.markerOffset
          )} / RAM ${hex(existing.payloadRamAddress)}.`
        );
      } else if (updateExisting) {
        const patchedMember = new Uint8Array(this.member);
        if (existing.markerOffset + existing.payloadBytes.length > patchedMember.length) {
          throw new PatchError(`${label} existing synthetic-overlay marker is too close to the end of the member.`);
        }
        patchedMember.set(existing.payloadBytes, existing.markerOffset);
        replaceSyntheticOverlayMember(this.rom, patchedMember);
        this.member = patchedMember;
        this.log.push(
          `${label}: updated existing synthetic-overlay payload at member ${hex(
            existing.markerOffset
          )} / RAM ${hex(existing.payloadRamAddress)}.`
        );
      } else {
        this.log.push(
          `${label}: found marker at member ${hex(
            existing.markerOffset
          )} / RAM ${hex(existing.payloadRamAddress)} and reused its addresses.`
        );
      }
      return { ...existing, reused: true };
    }

    const provisional = await buildPayload(SYNTH_OVERLAY_RAM_BASE);
    const provisionalBytes = provisional.bytes || provisional;
    const markerOffset = findAlignedZeroRun(this.member, provisionalBytes.length, alignment);
    if (markerOffset === -1) {
      throw new PatchError(`${label} could not find a free synthetic-overlay code cave.`);
    }

    const payloadRamAddress = this.ramAddress(markerOffset);
    const built = await buildPayload(payloadRamAddress);
    const payloadBytes = built.bytes || built;
    const patchedMember = new Uint8Array(this.member);
    patchedMember.set(payloadBytes, markerOffset);
    replaceSyntheticOverlayMember(this.rom, patchedMember);
    this.member = patchedMember;
    this.log.push(
      `${label}: allocated synthetic-overlay payload at member ${hex(markerOffset)} / RAM ${hex(
        payloadRamAddress
      )}, ${hex(payloadBytes.length)} byte(s).`
    );
    return { markerOffset, payloadRamAddress, built, payloadBytes, reused: false };
  }
}


  return {
    PatchError,
    OVERLAY_5,
    OVERLAY_6,
    OVERLAY_13,
    OVERLAY_14,
    OVERLAY_16,
    OVERLAY_21,
    OVERLAY_84,
    SPECIES_JIGGLYPUFF,
    NOP,
    DSPRE_SYNTH_OVERLAY_PATH,
    DSPRE_SYNTH_OVERLAY_MEMBER,
    DSPRE_SYNTH_OVERLAY_SIZE,
    SYNTH_OVERLAY_RAM_BASE,
    DSPRE_ARM9_BRANCH_RAM,
    DSPRE_ARM9_INIT_RAM,
    DSPRE_ARM9_BRANCH_ORIGINAL,
    DSPRE_ARM9_BRANCH_PATCHED,
    DSPRE_ARM9_INIT_ORIGINAL,
    DSPRE_ARM9_INIT_PATCHED,
    hex,
    bytesFromHex,
    bytesEqual,
    readU32,
    readU16,
    writeU16,
    writeU32,
    updateRomSizeHeader,
    writeBytes,
    padBytes,
    requireBytes,
    getArm9Info,
    arm9Offset,
    getOverlayRange,
    overlayOffset,
    findNeedle,
    locateNearby,
    locateUniquePatch,
    getFatInfo,
    getFatEntry,
    writeFatEntryEnd,
    writeFatEntryRange,
    findFileByPath,
    readMagic,
    parseNarc,
    replaceNarcMembers,
    replaceRomFile,
    replaceRomFileAllowGrowth,
    narcMemberLength,
    narcMemberBytes,
    asciiBytes,
    align,
    findAlignedZeroRun,
    readSyntheticOverlayMember,
    replaceSyntheticOverlayMember,
    dsPreArm9ExpansionStatus,
    SyntheticOverlayAllocator,
  };
});
