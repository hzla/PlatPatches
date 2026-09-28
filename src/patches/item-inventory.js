(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = (core) => factory(core, require("../asm/armips-assembler.js"), require("../asm/item-inventory.js"));
  } else {
    root.PlatinumPatcherItemInventory = factory(root.PlatinumPatcherCore, root.PlatinumPatcherArmipsAssembler, root.PlatinumPatcherItemInventoryAsm);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (core, assembler, runtime) {
  "use strict";
  const { PatchError, readU32, readU16, writeU16, writeU32, bytesFromHex, bytesEqual, arm9Offset, getOverlayRange } = core;

  function absolute(target) {
    const bytes = new Uint8Array(8);
    writeU16(bytes, 0, 0x4b00);
    writeU16(bytes, 2, 0x4718);
    writeU32(bytes, 4, target | 1);
    return bytes;
  }

  function installed(rom) {
    const { member } = core.readSyntheticOverlayMember(rom);
    const hits = core.findNeedle(member, core.asciiBytes(runtime.MARKER), 0, member.length);
    if (hits.length > 1) throw new PatchError("Multiple Item Inventory runtime payloads found.");
    if (!hits.length) return null;
    const offset = hits[0];
    if (offset + runtime.PAYLOAD_SIZE > member.length || readU32(member, offset + 16) !== 3 ||
        readU32(member, offset + 20) !== runtime.PAYLOAD_SIZE || readU32(member, offset + 24) !== runtime.EXPORTS.length) {
      throw new PatchError("Unrecognized Item Inventory runtime version.");
    }
    const entries = runtime.EXPORTS.map((name, i) => [name, readU32(member, offset + 28 + i * 4)]);
    const start = core.SYNTH_OVERLAY_RAM_BASE + offset;
    if (entries.some(([, address]) => (address & 1) || address < start + 28 + entries.length * 4 || address >= start + runtime.PAYLOAD_SIZE)) {
      throw new PatchError("Item Inventory runtime contains an invalid entry pointer.");
    }
    return Object.fromEntries(entries);
  }

  function hook(rom, address, original, target, previous, overlayId) {
    const overlay = overlayId === undefined ? null : getOverlayRange(rom, overlayId);
    const offset = overlay ? overlay.start + address - overlay.loadAddress : arm9Offset(rom, address, 8);
    const patched = absolute(target);
    if (!bytesEqual(rom, offset, bytesFromHex(original)) && !bytesEqual(rom, offset, patched) &&
        ![previous].flat().some((p) => p && bytesEqual(rom, offset, absolute(p)))) {
      throw new PatchError(`Item Inventory hook conflict at RAM ${core.hex(address)}.`);
    }
    core.writeBytes(rom, offset, patched);
  }

  function bl(from, target) {
    const delta = target - from - 4;
    if ((delta & 1) || delta < -0x400000 || delta > 0x3ffffe) throw new PatchError("Inventory call is outside Thumb BL range.");
    const bytes = new Uint8Array(4);
    writeU16(bytes, 0, 0xf000 | ((delta >> 12) & 0x7ff));
    writeU16(bytes, 2, 0xf800 | ((delta >> 1) & 0x7ff));
    return bytes;
  }

  function edit(rom, address, original, patched, overlayId, alternatives = []) {
    const overlay = overlayId === undefined ? null : getOverlayRange(rom, overlayId);
    const offset = overlay ? overlay.start + address - overlay.loadAddress : arm9Offset(rom, address, patched.length);
    const accepted = [bytesFromHex(original), patched, ...alternatives];
    if (!accepted.some((bytes) => bytesEqual(rom, offset, bytes))) throw new PatchError(`Item Inventory code conflict at RAM ${core.hex(address)}.`);
    core.writeBytes(rom, offset, patched);
  }

  async function install(rom, log, archiveEntries, legacy) {
    const file = core.findFileByPath(rom, "itemtool/itemdata/pl_item_data.narc");
    const narc = rom.slice(file.start, file.end);
    const parsed = core.parseNarc(narc);
    for (const [i, member] of parsed.entries.entries()) {
      if (member.end - member.start !== 34 && member.end - member.start !== 36) {
        throw new PatchError(`Item data member ${i} must be a 34-byte record (or 36 bytes with padding).`);
      }
    }
    for (let item = 0; item < 468; item += 1) {
      const member = readU16(rom, arm9Offset(rom, 0x020f0cc4 + item * 8, 2));
      if (member >= parsed.entries.length) throw new PatchError(`Vanilla item ${item} references missing data member ${member}.`);
    }
    for (const entry of archiveEntries) {
      if (entry.data >= parsed.entries.length) throw new PatchError("Expanded item references a missing data member.");
    }
    const previous = installed(rom);
    const berryMembers = Array.from({ length: 64 }, (_, i) => readU16(rom, arm9Offset(rom, 0x020f0cc4 + (149 + i) * 8, 2)));
    const berryNumbers = archiveEntries.map((entry) => Math.max(0, berryMembers.indexOf(entry.data)));
    const battleCapacities = [0, 0, 0, 0, 0];
    const masks = [20, 8, 1, 2, 0];
    for (let item = 1; item < 468 + archiveEntries.length; item += 1) {
      const member = item < 468 ? readU16(rom, arm9Offset(rom, 0x020f0cc4 + item * 8, 2)) : archiveEntries[item - 468].data;
      const data = core.narcMemberBytes(narc, member);
      const mask = readU16(data, 8) >>> 11;
      masks.forEach((categoryMask, i) => { if (mask & categoryMask) battleCapacities[i] += 1; });
    }
    const previousBattleSize = previous && readU32(core.readSyntheticOverlayMember(rom).member,
      previous.configuration + 4 - core.SYNTH_OVERLAY_RAM_BASE);
    for (const entry of archiveEntries) {
      if (entry.fieldPocket > 7) throw new PatchError("Expanded item has an invalid field pocket.");
    }
    const allocator = new core.SyntheticOverlayAllocator(rom, log);
    const allocation = await allocator.allocateAsync({
      marker: runtime.MARKER,
      label: "Item Inventory",
      alignment: 16,
      updateExisting: true,
      relocateExisting: false,
      buildPayload: async (address) => {
        const bytes = await assembler.assembleArmips({ source: runtime.source({ address, dataCount: parsed.entries.length, legacy, archiveEntries, berryNumbers, battleCapacities }) });
        return { bytes, ...Object.fromEntries(runtime.EXPORTS.map((name, i) => [name, readU32(bytes, 28 + i * 4)])) };
      },
    });
    const built = allocation.built;
    hook(rom, 0x0207d388, "18 b5 81 b0 04 1c 07 48", built.loadItemTable, previous?.loadItemTable);
    hook(rom, 0x0207d3b0, "24 22 4a 43 80 18 70 47", built.indexItemTable, previous?.indexItemTable);
    for (const [address, original, name, old] of [
      [0x0207d824, "f8 b5 05 1c 10 06 0f 1c", "createContext", legacy.previousEntries.bagContextCreateAddress],
      [0x0207d69c, "07 29 2d d8 49 18 79 44", "hasPocketItems"],
      [0x0207d910, "07 29 2c d8 49 18 79 44", "getSlot"],
      [0x0207d99c, "10 b5 24 21 9a f7 d0 fb", "newCursor"],
    ]) hook(rom, address, original, built[name], [previous?.[name], ...(old || [])]);
    const cursorHook = (target) => {
      const bytes = bytesFromHex("08 b5 01 4b 01 93 08 bd 00 00 00 00");
      writeU32(bytes, 8, target | 1);
      return bytes;
    };
    edit(rom, 0x0207d9c8, "18 b4 44 18 22 72 43 54 18 bc 70 47", cursorHook(built.setLegacyCursor), undefined,
      previous ? [cursorHook(previous.setLegacyCursor)] : []);
    for (const [address, original, name, old] of [
      [0x0223c158, "f8 b5 59 26 05 1c 00 24", "initNames", legacy.previousEntries.bagInitItemNamesAddress],
      [0x0223c178, "70 b5 59 26 05 1c 00 24", "freeNames", legacy.previousEntries.bagFreeItemNamesAddress],
      [0x0223bfbc, "f8 b5 82 b0 05 1c c4 30", "loadNames", legacy.previousEntries.bagLoadItemNamesAddress],
      [0x0223d244, "38 b5 05 1c c4 30 00 68", "canMoveEntry"],
      [0x0223beac, "f8 b5 07 1c c4 30 00 68", "restoreCursor"],
      [0x0223bf68, "f8 b5 06 1c c4 30 01 68", "saveCursor"],
      [0x0223de78, "10 b5 04 1c 01 f0 82 ff", "checkBerryTag"],
    ]) hook(rom, address, original, built[name], [previous?.[name], ...(old || [])], 84);
    for (const [address, original, name, old] of [
      [0x0223b5e8, "cb f5 18 f9", "allocateController"],
      [0x0223b5de, "dc f5 f3 fc", "createBagHeap"],
      [0x0223dd22, "3f f6 99 fc", "removeFromView", legacy.previousEntries.bagRemoveFromViewAddress],
      [0x0223d464, "3f f6 c2 fc", "reorderView", legacy.previousEntries.bagReorderViewAddress],
      [0x0223f958, "3d f6 f4 fc", "berryNumber"],
      [0x0223d87c, "2a f6 ba fd", "fieldUseCheck"],
      [0x0223e1f6, "3f f6 05 f9", "registerItem"],
    ]) edit(rom, address, original, bl(address, built[name]), 84,
      [previous?.[name], ...(old || [])].filter(Boolean).map((target) => bl(address, target)));

    // Older overflow views raised Items to 252 in the native size table. The
    // controller-owned views replace that limit; normalize upgrades to clean builds.
    edit(rom, 0x02241118, "a5", bytesFromHex("a5"), 84, [bytesFromHex("fc")]);

    // Use the aligned padding halfword without changing the 12-byte pocket ABI.
    for (const [address, original, value] of [
      [0x0223b6ce, "52 7b", 0x89d2], [0x0223b6f4, "52 7b", 0x89d2],
      [0x0223c260, "4d 7b", 0x89cd], [0x0223ccaa, "52 7b", 0x89d2],
      [0x0223ccd0, "52 7b", 0x89d2], [0x0223dd18, "49 7b", 0x89c9],
      [0x0223dd7c, "52 7b", 0x89d2], [0x0223dda2, "52 7b", 0x89d2],
      [0x0223dedc, "49 7b", 0x89c9], [0x0223e4cc, "49 7b", 0x89c9],
    ]) {
      const bytes = new Uint8Array(2);
      writeU16(bytes, 0, value);
      edit(rom, address, original, bytes, 84);
    }
    for (const address of [0x0223c198, 0x0223c1d4]) {
      edit(rom, address, "12 06 12 0e", bytesFromHex("c0 46 c0 46"), 84);
    }
    // Poffin entry checks must agree with their vanilla-only berry selection views.
    for (const [address, original, overlay] of [
      [0x0204238c, "3b f0 86 f9", undefined],
      [0x022319c8, "4b f6 68 fe", 65],
      [0x0223c148, "41 f6 a8 fa", 83],
    ]) edit(rom, address, original, bl(address, built.vanillaHasPocketItems), overlay,
      previous ? [bl(address, previous.vanillaHasPocketItems)] : []);
    for (const [address, original, name] of [
      [0x02227ac8, "f0 b5 83 b0 04 1c 00 20", "battleInit"],
      [0x02227ba8, "18 b4 0b 4a 03 68 82 5c", "battleGetItem"],
      [0x02227a7c, "f8 b5 05 1c 10 48 2e 68", "battleLastUsed"],
      [0x02226a5c, "f8 b5 77 49 05 1c 69 5c", "battleTryUse"],
    ]) hook(rom, address, original, built[name], previous?.[name], 13);

    const wordBytes = (value) => { const bytes = new Uint8Array(4); writeU32(bytes, 0, value); return bytes; };
    edit(rom, 0x02226588, "5c 11 00 00", wordBytes(runtime.battleLayout(battleCapacities).end), 13,
      previousBattleSize ? [wordBytes(previousBattleSize)] : []);
    for (const [address, original, name, prefix = ""] of [
      [0x022274be, "21 48 bf 00 29 5c 90 20 48 43 28 18 c0 19 80 8f", "battleNameItem"],
      [0x022274e0, "18 4a 05 90 ab 5c 90 22 68 69 5a 43 aa 18 d2 19 92 8f", "battleNameParam", "05 90"],
      [0x02227562, "1d 48 b6 00 29 5c 90 20 48 43 28 18 80 19 c0 8f", "battleAmount"],
      [0x0222758e, "12 4a 68 69 ab 5c 90 22 5a 43 aa 18 92 19 d2 8f", "battleAmountParam"],
      [0x022278b2, "15 4a 07 1c ab 5c 90 22 68 69 5a 43 aa 18 b3 00 d2 18 92 8f", "battleUseName", "07 1c"],
      [0x02227926, "11 49 07 1c 6a 5c 90 21 51 43 6a 18 b1 00 51 18 2a 68 89 8f", "battleUseDescription", "07 1c"],
    ]) {
      const encode = (target) => {
        const bytes = new Uint8Array(bytesFromHex(original).length);
        for (let i = 0; i < bytes.length; i += 2) writeU16(bytes, i, 0x46c0);
        const lead = prefix ? bytesFromHex(prefix) : new Uint8Array();
        bytes.set(lead);
        bytes.set(bl(address + lead.length, target), lead.length);
        return bytes;
      };
      edit(rom, address, original, encode(built[name]), 13, previous?.[name] ? [encode(previous[name])] : []);
    }
    log.push(`Item Inventory: bounded battle item table covers ${parsed.entries.length} padded data records.`);
    log.push("Item Inventory: all field pockets use complete runtime views, 16-bit list counts/cursors, and immediate authoritative writes; extra TMs precede HMs.");
    log.push(`Item Inventory: battle category capacities ${battleCapacities.slice(0, 4).join("/")} use bounded runtime arrays; unsupported expanded special-item actions are blocked.`);
    return built;
  }

  return { install, installed };
});
