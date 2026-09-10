(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    const assembler = require("../asm/armips-assembler.js");
    const battleLogAsm = require("../asm/battle-log.js");
    const format = require("../battle-log-format.js");
    module.exports = (core) => factory(core, assembler, battleLogAsm, format);
  } else {
    root.PlatinumPatcherBattleLogPatch = factory(
      root.PlatinumPatcherCore,
      root.PlatinumPatcherArmipsAssembler,
      root.PlatinumBattleLogAsm,
      root.PlatinumBattleLogFormat
    );
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (core, assembler, battleLogAsm, format) {
  "use strict";

  if (!core || !assembler || !battleLogAsm || !format) {
    throw new Error("Battle Log patch dependencies failed to load.");
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
    getOverlayRange,
    hex,
    narcMemberBytes,
    parseNarc,
    readU32,
    replaceMessageBankEntries,
    replaceOrAppendNarcMembers,
    replaceRomFileAllowGrowth,
    requireBytes,
    writeBytes,
    writeU32,
  } = core;

  const MARKER_TEXT = "PLATBTLGV1";
  const MARKER = (() => {
    const out = new Uint8Array(16);
    out.set(asciiBytes(MARKER_TEXT));
    return out;
  })();

  const EVO_NARC_PATH = "poketool/personal/evo.narc";
  const MESSAGE_NARC_PATH = "msgdata/pl_msg.narc";
  const SUMMARY_TEXT_MEMBER = 455;
  const SUMMARY_ID_ENTRY = 15;

  const OVERLAY_CALLS = [
    { label: "battle initialization", relative: 0x013a, original: "00 f0 89 fa", veneer: 0 },
    { label: "battle teardown", relative: 0x0150, original: "00 f0 10 fd", veneer: 1 },
    { label: "move target (script)", relative: 0x6b32, original: "11 f0 6f fe", veneer: 2 },
    { label: "move target (Mirror Move)", relative: 0x7efc, original: "10 f0 8a fc", veneer: 2 },
    { label: "move target (Magic Coat)", relative: 0xb268, original: "0d f0 d4 fa", veneer: 2 },
    { label: "move target (player command)", relative: 0x12c40, original: "05 f0 e8 fd", veneer: 2 },
    { label: "move target (obedience)", relative: 0x131ee, original: "05 f0 11 fb", veneer: 2 },
  ];

  const FAINT_TABLE_RELATIVE = 0x3365c;
  const FAINT_TABLE_ORIGINAL = 0x022418c1;
  const FIELD_UPDATE_RAM = 0x02050b28;
  const FIELD_UPDATE_ORIGINAL = bytesFromHex("01 f0 de fd");
  const SUMMARY_FORMAT_RAM = 0x02090720;
  const SUMMARY_FORMAT_ORIGINAL = bytesFromHex("ff f7 30 fd");
  const DOWNLOAD_VALIDATION_RAM = 0x02024d9a;
  const DOWNLOAD_VALIDATION_ORIGINAL = bytesFromHex("05 2c");
  const DOWNLOAD_VALIDATION_PATCHED = bytesFromHex("02 2c");
  const SAVE_RECORDING_RAM = 0x0202447c;
  const SAVE_RECORDING_ORIGINAL = bytesFromHex("0b 1c 91 1c 1a 1c 01 4b");

  function thumbBl(fromAddress, toAddress) {
    const offset = toAddress - (fromAddress + 4);
    if (offset % 2 !== 0 || offset < -0x400000 || offset > 0x3ffffe) {
      throw new PatchError(`Cannot encode Thumb BL from ${hex(fromAddress)} to ${hex(toAddress)}.`);
    }
    const first = 0xf000 | ((offset >> 12) & 0x7ff);
    const second = 0xf800 | ((offset >> 1) & 0x7ff);
    return new Uint8Array([first & 0xff, first >> 8, second & 0xff, second >> 8]);
  }

  function absoluteThumbJump(targetAddress) {
    const out = bytesFromHex("00 4b 18 47 00 00 00 00");
    writeU32(out, 4, targetAddress | 1);
    return out;
  }

  function patchChecked(rom, offset, original, patched, force, label) {
    const state = requireBytes(rom, offset, original, patched, force, label);
    if (state !== "already") {
      writeBytes(rom, offset, patched);
      return true;
    }
    return false;
  }

  function evolutionMembers(narc, count) {
    return Array.from({ length: count }, (_, member) => narcMemberBytes(narc, member));
  }

  function patchAncestryNarc(rom, log) {
    const file = findFileByPath(rom, EVO_NARC_PATH);
    const narc = rom.slice(file.start, file.end);
    const parsed = parseNarc(narc);
    if (!parsed.entries.length) {
      throw new PatchError("Evolution NARC is empty.");
    }

    let baseCount = parsed.entries.length;
    const last = narcMemberBytes(narc, baseCount - 1);
    const lastMagic = last.length >= 4 ? readU32(last, 0) : 0;
    if (lastMagic === format.ANCESTRY_MAGIC) {
      if (!format.ancestryHeader(last)) {
        throw new PatchError("Existing battle-log ancestry member is malformed.");
      }
      baseCount -= 1;
    }

    let ancestry;
    try {
      ancestry = format.buildAncestryMember(evolutionMembers(narc, baseCount));
    } catch (error) {
      throw new PatchError(`Could not generate battle-log ancestry data: ${error.message}`);
    }
    const patchedNarc = replaceOrAppendNarcMembers(narc, [[baseCount, ancestry.bytes]]);
    const replacement = replaceRomFileAllowGrowth(rom, file, patchedNarc, "Battle Log ancestry table");
    log.push(
      `Battle Log: ${replacement.state === "already" ? "reused" : "generated"} ancestry member ${baseCount} in ${EVO_NARC_PATH} (${ancestry.speciesCount} species, ${ancestry.stride}-byte rows)${replacement.growth ? `; ROM grew by ${replacement.growth} byte(s)` : ""}.`
    );
    return {
      rom: replacement.rom,
      member: baseCount,
      speciesCount: ancestry.speciesCount,
      stride: ancestry.stride,
    };
  }

  function patchSummaryText(rom, log) {
    const file = findFileByPath(rom, MESSAGE_NARC_PATH);
    const narc = rom.slice(file.start, file.end);
    const bank = narcMemberBytes(narc, SUMMARY_TEXT_MEMBER);
    const patchedBank = replaceMessageBankEntries(bank, [[SUMMARY_ID_ENTRY, "Frags"]], {
      label: "Battle Log summary label",
    });
    const patchedNarc = replaceOrAppendNarcMembers(narc, [[SUMMARY_TEXT_MEMBER, patchedBank]]);
    const replacement = replaceRomFileAllowGrowth(rom, file, patchedNarc, "Battle Log summary label");
    log.push(
      `Battle Log: ${replacement.state === "already" ? "summary label already says Frags" : "changed the summary ID No. label to Frags"}.`
    );
    return replacement.rom;
  }

  async function buildPayload(payloadAddress, ancestry) {
    const helperAddress = payloadAddress + MARKER.length;
    let code;
    try {
      code = await assembler.assembleArmips({
        source: battleLogAsm.battleLogSource({
          helperAddress,
          ancestryMember: ancestry.member,
          ancestrySpeciesCount: ancestry.speciesCount,
          ancestryStride: ancestry.stride,
        }),
      });
    } catch (error) {
      throw new PatchError(`Battle Log armips helper assembly failed: ${error.message}`);
    }
    const bytes = new Uint8Array(MARKER.length + code.length);
    bytes.set(MARKER);
    bytes.set(code, MARKER.length);
    return {
      bytes,
      helperAddress,
      veneers: Array.from({ length: 7 }, (_, index) => helperAddress + index * 8),
      codeSize: code.length,
    };
  }

  async function patchBattleLog(inputRom, force, log) {
    let ancestry = patchAncestryNarc(inputRom, log);
    let rom = patchSummaryText(ancestry.rom, log);
    ancestry = { ...ancestry, rom: undefined };

    const allocator = new SyntheticOverlayAllocator(rom, log);
    const allocation = await allocator.allocateAsync({
      marker: MARKER_TEXT,
      buildPayload: (payloadAddress) => buildPayload(payloadAddress, ancestry),
      label: "Battle Log",
      alignment: 0x10,
      updateExisting: true,
    });
    const { veneers } = allocation.built;
    const overlay = getOverlayRange(rom, OVERLAY_16);
    let changedHooks = 0;

    for (const call of OVERLAY_CALLS) {
      const ram = overlay.loadAddress + call.relative;
      const offset = overlay.start + call.relative;
      const original = bytesFromHex(call.original);
      const patched = thumbBl(ram, veneers[call.veneer]);
      if (patchChecked(rom, offset, original, patched, force, `Battle Log ${call.label} hook`)) {
        changedHooks += 1;
      }
    }

    const faintOffset = overlay.start + FAINT_TABLE_RELATIVE;
    const faintOriginal = new Uint8Array(4);
    const faintPatched = new Uint8Array(4);
    writeU32(faintOriginal, 0, FAINT_TABLE_ORIGINAL);
    writeU32(faintPatched, 0, veneers[3] | 1);
    if (patchChecked(rom, faintOffset, faintOriginal, faintPatched, force, "Battle Log faint command hook")) {
      changedHooks += 1;
    }

    const fieldOffset = arm9Offset(rom, FIELD_UPDATE_RAM, 4);
    if (
      patchChecked(
        rom,
        fieldOffset,
        FIELD_UPDATE_ORIGINAL,
        thumbBl(FIELD_UPDATE_RAM, veneers[4]),
        force,
        "Battle Log post-battle flush hook"
      )
    ) {
      changedHooks += 1;
    }

    const summaryOffset = arm9Offset(rom, SUMMARY_FORMAT_RAM, 4);
    if (
      patchChecked(
        rom,
        summaryOffset,
        SUMMARY_FORMAT_ORIGINAL,
        thumbBl(SUMMARY_FORMAT_RAM, veneers[6]),
        force,
        "Battle Log summary Frags hook"
      )
    ) {
      changedHooks += 1;
    }

    const validationOffset = arm9Offset(rom, DOWNLOAD_VALIDATION_RAM, 2);
    if (
      patchChecked(
        rom,
        validationOffset,
        DOWNLOAD_VALIDATION_ORIGINAL,
        DOWNLOAD_VALIDATION_PATCHED,
        force,
        "Battle Log downloaded-recording validation guard"
      )
    ) {
      changedHooks += 1;
    }

    const saveRecordingOffset = arm9Offset(rom, SAVE_RECORDING_RAM, 8);
    if (
      patchChecked(
        rom,
        saveRecordingOffset,
        SAVE_RECORDING_ORIGINAL,
        absoluteThumbJump(veneers[5]),
        force,
        "Battle Log downloaded-recording write guard"
      )
    ) {
      changedHooks += 1;
    }

    log.push(
      `Battle Log: ${changedHooks ? `patched ${changedHooks} verified hook(s)` : "all hooks already installed"}; ${allocation.built.codeSize} helper byte(s), 600 records maximum. Downloaded Battle Recordings 0-2 are reserved for the logger; My Recording remains available.`
    );
    return rom;
  }

  return {
    battleLog: patchBattleLog,
    constants: {
      MARKER_TEXT,
      EVO_NARC_PATH,
      MESSAGE_NARC_PATH,
      SUMMARY_TEXT_MEMBER,
      SUMMARY_ID_ENTRY,
      OVERLAY_CALLS,
      FAINT_TABLE_RELATIVE,
      FIELD_UPDATE_RAM,
      SUMMARY_FORMAT_RAM,
      DOWNLOAD_VALIDATION_RAM,
      SAVE_RECORDING_RAM,
    },
  };
});
