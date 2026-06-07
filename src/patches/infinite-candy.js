(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory;
  } else {
    root.PlatinumPatcherInfiniteCandyPatch = factory;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (core, deps) {
  "use strict";

  if (!core) {
    throw new Error("Infinite Candy patch requires PlatinumPatcherCore to load first.");
  }

  const {
    PatchError,
    SYNTH_OVERLAY_RAM_BASE,
    SyntheticOverlayAllocator,
    align,
    arm9Offset,
    asciiBytes,
    bytesEqual,
    bytesFromHex,
    findFileByPath,
    findNeedle,
    getArm9Info,
    hex,
    narcMemberBytes,
    readSyntheticOverlayMember,
    readU16,
    readU32,
    replaceNarcMembers,
    replaceRomFile,
    replaceRomFileAllowGrowth,
    writeBytes,
    writeU16,
    writeU32,
    dsPreArm9ExpansionStatus,
  } = core;
  const { patchArm9Expansion } = deps || {};

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

function decodeThumbBl(fromAddress, bytes, offset) {
  if (offset < 0 || offset + 4 > bytes.length) {
    return null;
  }
  const first = bytes[offset] | (bytes[offset + 1] << 8);
  const second = bytes[offset + 2] | (bytes[offset + 3] << 8);
  if ((first & 0xf800) !== 0xf000 || (second & 0xf800) !== 0xf800) {
    return null;
  }
  let immediate = ((first & 0x7ff) << 12) | ((second & 0x7ff) << 1);
  if (immediate & 0x400000) {
    immediate |= 0xff800000;
  }
  return (fromAddress + 4 + immediate) >>> 0;
}

const RARE_CANDY_ITEM_ID = 50;
const RED_CHAIN_ITEM_ID = 441;
const ITEM_TABLE_ARM9_OFFSET = 0x0f0cc4;
const ITEM_TABLE_ENTRY_SIZE = 8;
const RARE_CANDY_ITEMDATA_MEMBER = 0x32;
const RED_CHAIN_ITEMDATA_MEMBER = 0x1a3;
const LEGACY_CHAIN_CANDY_MARKER = "chain_candy_start";
const CHAIN_CANDY_MARKER = "chain_candy_red_v1";
const LEGACY_INFINITE_CANDY_MARKER = "inf_candy_remove_v1";
const INFINITE_CANDY_MARKER = "inf_redchain_remove_v1";
const CHAIN_CANDY_HOOK_RAM = 0x02085ec6;
const BAG_TRY_REMOVE_ITEM_HOOK_RAM = 0x0207d60c;
const POCKET_TRY_REMOVE_ITEM_HOOK_RAM = 0x0207d658;
const BAG_TRY_REMOVE_ITEM_RESUME_RAM = 0x0207d61c;
const BAG_TRY_REMOVE_ITEM_SLOT_RAM = 0x0207d5e8;
const POCKET_TRY_REMOVE_ITEM_RESUME_RAM = 0x0207d664;
const POCKET_TRY_REMOVE_ITEM_COUNT_RAM = 0x0207d5b8;
const BAG_TRY_REMOVE_ITEM_EXPECTED = bytesFromHex("f0 b5 83 b0 06 1c 0f 1c 15 1c 1c 1c");
const POCKET_TRY_REMOVE_ITEM_EXPECTED = bytesFromHex("70 b5 05 1c 0e 1c 1c 1c ff f7 aa ff");

function emitU32(out, value) {
  out.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
}

function literalJump(targetAddress) {
  const out = [0x00, 0x4b, 0x18, 0x47];
  emitU32(out, targetAddress | 1);
  return new Uint8Array(out);
}

function literalJumpPreserveR3(targetAddress) {
  const out = [
    0x08, 0xb4, // push {r3}
    0x01, 0x4b, // ldr r3, [pc, #4]
    0x18, 0x47, // bx r3
    0x00, 0x00,
  ];
  emitU32(out, targetAddress | 1);
  return new Uint8Array(out);
}

function decodeLiteralJump(data, offset) {
  if (
    offset < 0 ||
    offset + 8 > data.length ||
    data[offset] !== 0x00 ||
    data[offset + 1] !== 0x4b ||
    data[offset + 2] !== 0x18 ||
    data[offset + 3] !== 0x47
  ) {
    return null;
  }
  return readU32(data, offset + 4) & ~1;
}

function decodeLiteralJumpPreserveR3(data, offset) {
  if (
    offset < 0 ||
    offset + 12 > data.length ||
    data[offset] !== 0x08 ||
    data[offset + 1] !== 0xb4 ||
    data[offset + 2] !== 0x01 ||
    data[offset + 3] !== 0x4b ||
    data[offset + 4] !== 0x18 ||
    data[offset + 5] !== 0x47 ||
    data[offset + 6] !== 0x00 ||
    data[offset + 7] !== 0x00
  ) {
    return null;
  }
  return readU32(data, offset + 8) & ~1;
}

function emitRedChainItemIdR1(emit16) {
  emit16(0x21dd); // mov r1, #0xdd
  emit16(0x0049); // lsl r1, r1, #1
  emit16(0x3901); // sub r1, #1, yielding item ID 441
}

function buildChainCandyPayload(payloadRamAddress) {
  const out = Array.from(asciiBytes(CHAIN_CANDY_MARKER));
  while (out.length % 2 !== 0) {
    out.push(0);
  }
  const fixups = [];

  function here() {
    return payloadRamAddress + out.length;
  }
  function emit(bytes) {
    out.push(...bytes);
  }
  function emit16(value) {
    emit(thumbInst16(value));
  }
  function branch(name) {
    fixups.push({ offset: out.length, at: here(), name, type: "branch" });
    emit16(0xe000);
  }
  function cond(name, condition) {
    fixups.push({ offset: out.length, at: here(), name, type: "cond", condition });
    emit16(0xd000 | (condition << 8));
  }
  const labels = new Map();
  function label(name) {
    labels.set(name, here());
  }

  label("hook");
  emit16(0xb520); // push {r5, lr}
  emit16(0x7008); // strb r0, [r1]
  emit16(0x2800); // cmp r0, #0
  cond("exit", 0x1); // bne
  emit16(0x20b4); // mov r0, #0xb4
  emit16(0x00c0); // lsl r0, r0, #3
  emit16(0x3004); // add r0, #4
  emit16(0x1821); // add r1, r4, r0
  emit16(0x680d); // ldr r5, [r1]
  emit16(0x6868); // ldr r0, [r5, #4]
  emitRedChainItemIdR1(emit16);
  emit16(0x2201); // mov r2, #1
  emit16(0x230c); // mov r3, #12
  emit(thumbBl(here(), 0x0207d688)); // Bag_CanRemoveItem
  emit16(0x2800); // cmp r0, #0
  cond("exit", 0x0); // beq
  emitRedChainItemIdR1(emit16);
  emit16(0x2024); // mov r0, #36
  emit16(0x1828); // add r0, r5, r0
  emit16(0x8001); // strh r1, [r0]
  emit16(0x1c20); // mov r0, r4
  emit16(0x2189); // mov r1, #0x89
  emit16(0x0089); // lsl r1, r1, #2
  emit16(0x1840); // add r0, r0, r1
  emit16(0x2100); // mov r1, #0
  emit(thumbBl(here(), 0x0200e084)); // Window_EraseMessageBox
  emit16(0x1c20); // mov r0, r4
  emit16(0x2120); // mov r1, #32
  emit16(0x2201); // mov r2, #1
  emit(thumbBl(here(), 0x020826e0)); // PartyMenu_PrintToWindow32
  emit16(0x2004); // mov r0, #4
  emit16(0xbd20); // pop {r5, pc}
  label("exit");
  emit16(0x2020); // mov r0, #0x20
  emit16(0xbd20); // pop {r5, pc}
  branch("end");
  while (out.length % 4 !== 0) {
    out.push(0);
  }
  label("end");

  for (const fixup of fixups) {
    const target = labels.get(fixup.name);
    if (target == null) {
      throw new Error(`internal chain candy label not found: ${fixup.name}`);
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

function buildInfiniteCandyPayload(payloadRamAddress) {
  const out = Array.from(asciiBytes(INFINITE_CANDY_MARKER));
  while (out.length % 4 !== 0) {
    out.push(0);
  }
  const bagHelperOffset = out.length;
  out.push(
    0x08, 0xbc, // pop {r3}, undoing the hook trampoline's save
    0x01, 0xb4, // push {r0}
    0xdd, 0x20, // mov r0, #0xdd
    0x40, 0x00, // lsl r0, r0, #1
    0x01, 0x38, // sub r0, #1, yielding item ID 441
    0x81, 0x42, // cmp r1, r0
    0x01, 0xbc, // pop {r0}
    0x01, 0xd1, // bne normal
    0x01, 0x20, // mov r0, #1
    0x70, 0x47 // bx lr
  );
  out.push(...BAG_TRY_REMOVE_ITEM_EXPECTED);
  out.push(...thumbBl(payloadRamAddress + out.length, BAG_TRY_REMOVE_ITEM_SLOT_RAM));
  out.push(...literalJump(BAG_TRY_REMOVE_ITEM_RESUME_RAM));

  while (out.length % 4 !== 0) {
    out.push(0);
  }
  const pocketHelperOffset = out.length;
  out.push(
    0x08, 0xbc, // pop {r3}, undoing the hook trampoline's save
    0x01, 0xb4, // push {r0}
    0xdd, 0x20, // mov r0, #0xdd
    0x40, 0x00, // lsl r0, r0, #1
    0x01, 0x38, // sub r0, #1, yielding item ID 441
    0x82, 0x42, // cmp r2, r0
    0x01, 0xbc, // pop {r0}
    0x01, 0xd1, // bne normal
    0x01, 0x20, // mov r0, #1
    0x70, 0x47 // bx lr
  );
  out.push(...POCKET_TRY_REMOVE_ITEM_EXPECTED.slice(0, 8));
  out.push(...thumbBl(payloadRamAddress + out.length, POCKET_TRY_REMOVE_ITEM_COUNT_RAM));
  out.push(...literalJump(POCKET_TRY_REMOVE_ITEM_RESUME_RAM));

  return {
    bytes: new Uint8Array(out),
    bagHelperOffset,
    pocketHelperOffset,
    bagHelperRam: payloadRamAddress + bagHelperOffset,
    pocketHelperRam: payloadRamAddress + pocketHelperOffset,
  };
}

function synthMarkerOffsets(member, marker) {
  return findNeedle(member, asciiBytes(marker), 0, member.length);
}

function allocateSyntheticPayload(rom, marker, buildPayload, log, label, options = {}) {
  return new SyntheticOverlayAllocator(rom, log).allocate({
    marker,
    buildPayload,
    label,
    alignment: options.alignment || 0x10,
    updateExisting: Boolean(options.updateExisting),
  });
}

function chainCandyFunctionOffset() {
  return align(CHAIN_CANDY_MARKER.length, 2);
}

function legacyChainCandyFunctionOffset() {
  return align(LEGACY_CHAIN_CANDY_MARKER.length, 2);
}

function findExistingChainCandyFunction(rom) {
  const { member } = readSyntheticOverlayMember(rom);
  const markerOffsets = synthMarkerOffsets(member, CHAIN_CANDY_MARKER);
  if (!markerOffsets.length) {
    return null;
  }

  const hookAt = arm9Offset(rom, CHAIN_CANDY_HOOK_RAM, 4);
  const hookTarget = decodeThumbBl(CHAIN_CANDY_HOOK_RAM, rom, hookAt);
  const functionOffset = chainCandyFunctionOffset();
  if (hookTarget != null) {
    for (const markerOffset of markerOffsets) {
      const functionRam = SYNTH_OVERLAY_RAM_BASE + markerOffset + functionOffset;
      if (hookTarget === functionRam) {
        return { markerOffset, functionRam, hookTarget };
      }
    }
  }

  const markerOffset = markerOffsets[markerOffsets.length - 1];
  return {
    markerOffset,
    functionRam: SYNTH_OVERLAY_RAM_BASE + markerOffset + functionOffset,
    hookTarget,
  };
}

function isLegacyChainCandyHook(rom) {
  const { member } = readSyntheticOverlayMember(rom);
  const markerOffsets = synthMarkerOffsets(member, LEGACY_CHAIN_CANDY_MARKER);
  if (!markerOffsets.length) {
    return false;
  }
  const hookAt = arm9Offset(rom, CHAIN_CANDY_HOOK_RAM, 4);
  const hookTarget = decodeThumbBl(CHAIN_CANDY_HOOK_RAM, rom, hookAt);
  if (hookTarget == null) {
    return false;
  }
  const functionOffset = legacyChainCandyFunctionOffset();
  return markerOffsets.some(
    (markerOffset) => hookTarget === SYNTH_OVERLAY_RAM_BASE + markerOffset + functionOffset
  );
}

function legacyRemovalHookTargets(rom) {
  const { member } = readSyntheticOverlayMember(rom);
  const markerOffsets = [
    ...synthMarkerOffsets(member, LEGACY_INFINITE_CANDY_MARKER),
    ...synthMarkerOffsets(member, INFINITE_CANDY_MARKER),
  ];
  const result = new Set();
  const helperPrefixes = [
    bytesFromHex("01 b4 dd 20 40 00 01 38"),
    bytesFromHex("08 bc 01 b4 dd 20 40 00 01 38"),
  ];
  for (const markerOffset of markerOffsets) {
    const marker =
      bytesEqual(member, markerOffset, asciiBytes(INFINITE_CANDY_MARKER))
        ? INFINITE_CANDY_MARKER
        : LEGACY_INFINITE_CANDY_MARKER;
    const markerSize = align(marker.length, 4);
    const base = SYNTH_OVERLAY_RAM_BASE + markerOffset;
    result.add(base + markerSize);
    result.add(base + markerSize + 0x18);
    result.add(base + 0x3c);
    result.add(base + 0x40);
    result.add(base + 0x44);
    result.add(base + markerSize + 0x3c);
    result.add(base + markerSize + 0x40);
    result.add(base + markerSize + 0x44);
    for (const prefix of helperPrefixes) {
      for (const helperOffset of findNeedle(
        member,
        prefix,
        markerOffset + markerSize,
        Math.min(member.length, markerOffset + markerSize + 0x100)
      )) {
        result.add(SYNTH_OVERLAY_RAM_BASE + helperOffset);
      }
    }
  }
  return result;
}

function encryptMessageEntryOffset(entryID, bankKey, offset, length) {
  let key = (bankKey * 765 * (entryID + 1)) & 0xffff;
  key = (key | (key << 16)) >>> 0;
  return { offset: (offset ^ key) >>> 0, length: (length ^ key) >>> 0 };
}

function encryptedPlatinumString(text, entryID) {
  const codes = [];

  function pushCode(code) {
    codes.push(code & 0xffff);
  }

  for (let i = 0; i < text.length; i += 1) {
    if (text.startsWith("{COLOR ", i)) {
      const end = text.indexOf("}", i);
      if (end === -1) {
        throw new PatchError("Infinite Candy item text has an unterminated COLOR command.");
      }
      const value = Number(text.slice(i + 7, end));
      if (!Number.isInteger(value) || value < 0 || value > 0xffff) {
        throw new PatchError("Infinite Candy item text has an invalid COLOR command.");
      }
      pushCode(0xfffe);
      pushCode(0xff00);
      pushCode(1);
      pushCode(value);
      i = end;
      continue;
    }

    const ch = text[i];
    const codePoint = text.charCodeAt(i);
    if (ch >= "0" && ch <= "9") {
      pushCode(0x0121 + (codePoint - 48));
    } else if (ch >= "A" && ch <= "Z") {
      pushCode(0x012b + (codePoint - 65));
    } else if (ch >= "a" && ch <= "z") {
      pushCode(0x0145 + (codePoint - 97));
    } else if (ch === " ") {
      pushCode(0x01de);
    } else if (ch === ",") {
      pushCode(0x01ad);
    } else if (ch === ".") {
      pushCode(0x01ae);
    } else if (ch === "-") {
      pushCode(0x01be);
    } else if (ch === "\n") {
      pushCode(0xe000);
    } else if (ch === "\r") {
      pushCode(0x25bc);
    } else if (ch === "\f") {
      pushCode(0x25bd);
    } else if (ch === "é") {
      pushCode(0x0188);
    } else if (ch === "'" || ch === "’") {
      pushCode(0x01b3);
    } else {
      throw new PatchError(`Infinite Candy item text contains unsupported character "${ch}".`);
    }
  }
  pushCode(0xffff);

  let key = ((entryID + 1) * 596947) & 0xffff;
  const out = new Uint8Array(codes.length * 2);
  for (let i = 0; i < codes.length; i += 1) {
    writeU16(out, i * 2, codes[i] ^ key);
    key = (key + 18749) & 0xffff;
  }
  return out;
}

function replaceMessageBankEntry(bank, entryID, text) {
  const count = readU16(bank, 0);
  const bankKey = readU16(bank, 2);
  if (entryID >= count) {
    throw new PatchError(`Message bank has no entry ${entryID}.`);
  }

  const chunks = [];
  let cursor = 4 + count * 8;
  for (let i = 0; i < count; i += 1) {
    const entryAt = 4 + i * 8;
    const decoded = encryptMessageEntryOffset(i, bankKey, readU32(bank, entryAt), readU32(bank, entryAt + 4));
    const size = decoded.length * 2;
    if (decoded.offset + size > bank.length) {
      throw new PatchError("Message bank entry points outside the message bank.");
    }
    chunks.push(i === entryID ? encryptedPlatinumString(text, entryID) : bank.slice(decoded.offset, decoded.offset + size));
  }

  const totalSize = 4 + count * 8 + chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(totalSize);
  writeU16(out, 0, count);
  writeU16(out, 2, bankKey);
  for (let i = 0; i < count; i += 1) {
    const entry = encryptMessageEntryOffset(i, bankKey, cursor, chunks[i].length / 2);
    writeU32(out, 4 + i * 8, entry.offset);
    writeU32(out, 4 + i * 8 + 4, entry.length);
    out.set(chunks[i], cursor);
    cursor += chunks[i].length;
  }
  return out;
}

function patchRedChainItemText(rom, log) {
  const file = findFileByPath(rom, "msgdata/pl_msg.narc");
  const narc = rom.slice(file.start, file.end);
  const replacements = [
    [391, "A candy packed with energy.\nIt raises a Pokémon’s level by one."],
    [392, "Infinite Candy"],
    [393, "an {COLOR 255}Infinite Candy{COLOR 0}"],
    [394, "Infinite Candies"],
  ];
  const replacedMembers = replacements.map(([memberId, text]) => [
    memberId,
    replaceMessageBankEntry(narcMemberBytes(narc, memberId), RED_CHAIN_ITEM_ID, text),
  ]);
  const patchedNarc = replaceNarcMembers(narc, replacedMembers);
  const replacement = replaceRomFileAllowGrowth(rom, file, patchedNarc, "Infinite Candy item text");
  log.push(
    `Infinite Candy: ${
      replacement.state === "already" ? "item text already renamed" : "renamed Red Chain item text"
    } in msgdata/pl_msg.narc members 391-394${replacement.growth ? `; ROM grew by ${replacement.growth} byte(s)` : ""}.`
  );
  return replacement.rom;
}

function patchRedChainCandyItemData(rom, log) {
  const file = findFileByPath(rom, "itemtool/itemdata/pl_item_data.narc");
  const narc = rom.slice(file.start, file.end);
  const rareCandy = narcMemberBytes(narc, RARE_CANDY_ITEMDATA_MEMBER);
  const redChain = narcMemberBytes(narc, RED_CHAIN_ITEMDATA_MEMBER);
  if (rareCandy.length !== redChain.length || redChain.length < 0x0e) {
    throw new PatchError("Red Chain item data is not the expected size.");
  }

  const patchedMember = new Uint8Array(rareCandy);
  writeU16(patchedMember, 0x00, 0); // no sale price
  writeU16(patchedMember, 0x08, 0x03bf); // type Normal, prevent toss, Key Items pocket, no battle pocket

  if (bytesEqual(redChain, 0, patchedMember)) {
    log.push("Infinite Candy: Red Chain item data already has Rare Candy behavior.");
    return;
  }

  const patchedNarc = replaceNarcMembers(narc, [[RED_CHAIN_ITEMDATA_MEMBER, patchedMember]]);
  replaceRomFile(rom, file, patchedNarc, "Infinite Candy item data");
  log.push(
    `Infinite Candy: replaced Red Chain item data member ${hex(
      RED_CHAIN_ITEMDATA_MEMBER
    )} with Key Item Rare Candy behavior.`
  );
}

function itemTableEntryRomOffset(rom, itemId) {
  const arm9 = getArm9Info(rom);
  const offset = ITEM_TABLE_ARM9_OFFSET + itemId * ITEM_TABLE_ENTRY_SIZE;
  if (offset + ITEM_TABLE_ENTRY_SIZE > arm9.size) {
    throw new PatchError("Infinite Candy item table entry is outside the ARM9 binary.");
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
    agb: readU16(rom, offset + 6),
  };
}

function patchRedChainCandyItemGraphics(rom, log) {
  const rareCandy = readItemTableEntry(rom, RARE_CANDY_ITEM_ID);
  const redChain = readItemTableEntry(rom, RED_CHAIN_ITEM_ID);

  if (rareCandy.data !== RARE_CANDY_ITEMDATA_MEMBER) {
    throw new PatchError(
      `Infinite Candy expected Rare Candy item-table data ${hex(RARE_CANDY_ITEMDATA_MEMBER)}, found ${hex(rareCandy.data)}.`
    );
  }

  if (redChain.icon === rareCandy.icon && redChain.palette === rareCandy.palette) {
    log.push(
      `Infinite Candy: Red Chain item-table graphics already use Rare Candy icon ${rareCandy.icon} / palette ${rareCandy.palette}.`
    );
    return;
  }

  writeU16(rom, redChain.offset + 2, rareCandy.icon);
  writeU16(rom, redChain.offset + 4, rareCandy.palette);
  log.push(
    `Infinite Candy: Red Chain item-table graphics ${hex(redChain.offset + 2)}-${hex(
      redChain.offset + 5
    )} now point to Rare Candy icon ${rareCandy.icon} / palette ${rareCandy.palette} (was icon ${redChain.icon} / palette ${redChain.palette}).`
  );
}

function patchInfiniteContinuousCandy(rom, force, log) {
  let outRom = rom;
  const status = dsPreArm9ExpansionStatus(outRom);
  if (!(status.branchInstalled && status.initInstalled && status.synthAvailable)) {
    if (typeof patchArm9Expansion !== "function") {
      throw new PatchError(
        "Infinite Candy requires the DSPRE ARM9 expansion. Apply DSPRE ARM9 expansion first."
      );
    }
    log.push("Infinite Candy: DSPRE ARM9 expansion is required; installing it first.");
    outRom = patchArm9Expansion(outRom, force, log);
  }

  patchRedChainCandyItemData(outRom, log);
  patchRedChainCandyItemGraphics(outRom, log);
  outRom = patchRedChainItemText(outRom, log);

  let chain = findExistingChainCandyFunction(outRom);
  if (!chain) {
    const allocated = allocateSyntheticPayload(
      outRom,
      CHAIN_CANDY_MARKER,
      buildChainCandyPayload,
      log,
      "Infinite Candy chain helper",
      { updateExisting: true }
    );
    chain = {
      markerOffset: allocated.markerOffset,
      functionRam: allocated.payloadRamAddress + chainCandyFunctionOffset(),
      hookTarget: null,
    };
  } else {
    log.push(
      `Infinite Candy: reused existing chain-candy marker at synthetic member ${hex(
        chain.markerOffset
      )} / helper RAM ${hex(chain.functionRam)}.`
    );
  }

  const chainHookAt = arm9Offset(outRom, CHAIN_CANDY_HOOK_RAM, 4);
  const chainHook = new Uint8Array(thumbBl(CHAIN_CANDY_HOOK_RAM, chain.functionRam));
  const chainExpected = bytesFromHex("08 70 20 20");
  let chainState = "patch";
  if (bytesEqual(outRom, chainHookAt, chainHook)) {
    chainState = "already";
  } else if (!bytesEqual(outRom, chainHookAt, chainExpected) && !isLegacyChainCandyHook(outRom) && !force) {
    const found = Array.from(outRom.slice(chainHookAt, chainHookAt + chainExpected.length))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join(" ");
    throw new PatchError(
      `Infinite Candy chain hook sanity check failed at ${hex(chainHookAt)}. Found ${found}. Enable compatible modified bytes to patch anyway.`
    );
  }
  if (chainState !== "already") {
    writeBytes(outRom, chainHookAt, chainHook);
  }

  const infinite = allocateSyntheticPayload(
    outRom,
    INFINITE_CANDY_MARKER,
    buildInfiniteCandyPayload,
    log,
    "Infinite Candy removal helper",
    { updateExisting: true }
  );
  const infiniteBuilt = infinite.built;
  const bagHelperRam = infiniteBuilt.bagHelperRam;
  const pocketHelperRam = infiniteBuilt.pocketHelperRam;

  const bagHookAt = arm9Offset(outRom, BAG_TRY_REMOVE_ITEM_HOOK_RAM, BAG_TRY_REMOVE_ITEM_EXPECTED.length);
  const pocketHookAt = arm9Offset(outRom, POCKET_TRY_REMOVE_ITEM_HOOK_RAM, POCKET_TRY_REMOVE_ITEM_EXPECTED.length);
  const bagHook = literalJumpPreserveR3(bagHelperRam);
  const pocketHook = literalJumpPreserveR3(pocketHelperRam);
  const legacyRemovalTargets = legacyRemovalHookTargets(outRom);
  function removalHookState(offset, expected, patched, label) {
    if (bytesEqual(outRom, offset, patched)) {
      return "already";
    }
    const target = decodeLiteralJump(outRom, offset) ?? decodeLiteralJumpPreserveR3(outRom, offset);
    if (
      bytesEqual(outRom, offset, expected) ||
      (target != null && legacyRemovalTargets.has(target)) ||
      force
    ) {
      return "patch";
    }
    const found = Array.from(outRom.slice(offset, offset + expected.length))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join(" ");
    throw new PatchError(`${label} sanity check failed at ${hex(offset)}. Found ${found}. Enable compatible modified bytes to patch anyway.`);
  }
  const bagState = removalHookState(
    bagHookAt,
    BAG_TRY_REMOVE_ITEM_EXPECTED,
    bagHook,
    "Infinite Candy Bag_TryRemoveItem hook"
  );
  const pocketState = removalHookState(
    pocketHookAt,
    POCKET_TRY_REMOVE_ITEM_EXPECTED,
    pocketHook,
    "Infinite Candy Pocket_TryRemoveItem hook"
  );
  if (bagState !== "already") {
    writeBytes(outRom, bagHookAt, bagHook);
  }
  if (pocketState !== "already") {
    writeBytes(outRom, pocketHookAt, pocketHook);
  }

  if (chainState === "already" && bagState === "already" && pocketState === "already") {
    log.push(
      `Infinite Candy: already patched; chain hook RAM ${hex(
        CHAIN_CANDY_HOOK_RAM
      )}, Bag/Pocket hooks RAM ${hex(BAG_TRY_REMOVE_ITEM_HOOK_RAM)} and ${hex(
        POCKET_TRY_REMOVE_ITEM_HOOK_RAM
      )}.`
    );
  } else {
    log.push(
      `Infinite Candy: chain hook RAM ${hex(CHAIN_CANDY_HOOK_RAM)} -> ${hex(
        chain.functionRam
      )}; removal hooks RAM ${hex(BAG_TRY_REMOVE_ITEM_HOOK_RAM)} -> ${hex(
        bagHelperRam
      )} and ${hex(POCKET_TRY_REMOVE_ITEM_HOOK_RAM)} -> ${hex(pocketHelperRam)}.`
    );
  }

  return outRom;
}

  return {
    infiniteContinuousCandy: patchInfiniteContinuousCandy,
  };
});
