(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    const assembler = require("../asm/armips-assembler.js");
    const templates = require("../asm/templates.js");
    module.exports = (core, itemExpansionPatches) => factory(core, assembler, templates, itemExpansionPatches);
  } else {
    root.PlatinumPatcherBottleCapPatches = factory(
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
    throw new Error("Bottle Cap patches require PlatinumPatcherCore to load first.");
  }
  if (!assembler || !asmTemplates) {
    throw new Error("armips assembler failed to load for Bottle Cap patches.");
  }

  const {
    PatchError,
    DSPRE_SYNTH_OVERLAY_SIZE,
    SYNTH_OVERLAY_RAM_BASE,
    SyntheticOverlayAllocator,
    arm9Offset,
    asciiBytes,
    bytesEqual,
    bytesFromHex,
    findFileByPath,
    hex,
    narcMemberBytes,
    readU32,
    replaceMessageBankEntries,
    replaceNarcMembers,
    replaceRomFileAllowGrowth,
    requireBytes,
    writeBytes,
    writeU16,
    writeU32,
  } = core;

  const MARKER_TEXT = "BOTTLECAPV1";
  const MARKER = asciiBytes(`${MARKER_TEXT}\0\0\0\0\0`);
  const BOTTLE_CAP_COUNT = 7;

  const MESSAGE_NARC_PATH = "msgdata/pl_msg.narc";
  const PARTY_MENU_MESSAGE_MEMBER = 453;
  const SUCCESS_MESSAGE_ENTRY = 261;
  const SUCCESS_MESSAGE_TEXTS = [
    "{STRVAR_1 1, 0, 0}'s Attack boosted!",
    "{STRVAR_1 1, 0, 0}'s Defense boosted!",
    "{STRVAR_1 1, 0, 0}'s Sp. Atk boosted!",
    "{STRVAR_1 1, 0, 0}'s Sp. Def boosted!",
    "{STRVAR_1 1, 0, 0}'s Speed boosted!",
    "{STRVAR_1 1, 0, 0}'s HP boosted!",
    "{STRVAR_1 1, 0, 0}'s stats are maxed!",
  ];

  const POKEMON_CHECK_ITEM_EFFECTS_RAM = 0x02096420;
  const POKEMON_CHECK_ITEM_EFFECTS_RETURN_RAM = 0x0209642c;
  const PARTY_ITEM_DISPATCH_RAM = 0x020852b8;
  const PARTY_ITEM_DISPATCH_RETURN_RAM = 0x020852c0;

  const POKEMON_GET_VALUE_RAM = 0x02074470;
  const POKEMON_SET_VALUE_RAM = 0x02074b30;
  const POKEMON_CALC_STATS_RAM = 0x020741b8;
  const PARTY_GET_MON_RAM = 0x0207a0fc;
  const PARTY_MENU_LOAD_MEMBER_RAM = 0x0207ef14;
  const PARTY_MENU_DRAW_MEMBER_PANEL_RAM = 0x020821f8;
  const PARTY_MENU_LOAD_MEMBER_WINDOW_TILES_RAM = 0x020822bc;
  const PARTY_MENU_DRAW_STATUS_RAM = 0x02083014;
  const PARTY_MENU_PRINT_LONG_MESSAGE_RAM = 0x02082708;
  const MESSAGE_LOADER_GET_NEW_STRING_RAM = 0x0200b1ec;
  const STRING_TEMPLATE_FORMAT_RAM = 0x0200c388;
  const STRING_TEMPLATE_SET_NICKNAME_RAM = 0x0200b5cc;
  const STRING_FREE_RAM = 0x020237bc;
  const SOUND_PLAY_EFFECT_RAM = 0x02005748;
  const WAIT_STATE_RAM = 0x02085348;

  const APP_PARTY_MENU_OFFSET = 0x05a4;
  const PARTY_MENU_USED_ITEM_OFFSET = 0x24;
  const APP_CURR_SLOT_OFFSET = 0x0b29;
  const APP_STATE_OFFSET = 0x0b18;
  const APP_MESSAGE_LOADER_OFFSET = 0x069c;
  const APP_TEMPLATE_OFFSET = 0x06a0;
  const APP_TMP_STRING_OFFSET = 0x06a4;
  const APP_PARTY_MEMBER_STATUS_OFFSET = 0x0712;
  const PARTY_MEMBER_SIZE = 0x2c;

  const MON_DATA_HP_IV = 70;
  const MON_DATA_IS_EGG = 76;
  const MON_DATA_SPECIES_EXISTS = 172;

  const SOUND_EFFECT_HEAL = 1448;

  const HOOK_SITES = [
    {
      label: "Pokemon_CheckItemEffects",
      ram: POKEMON_CHECK_ITEM_EFFECTS_RAM,
      entryKey: "checkAddress",
      original: bytesFromHex("f8 b5 86 b0 01 91 06 1c 17 1c 01 98"),
      preserveR3: true,
    },
    {
      label: "party item dispatcher",
      ram: PARTY_ITEM_DISPATCH_RAM,
      entryKey: "dispatchAddress",
      original: bytesFromHex("10 b5 04 1c 1c 48 20 58"),
    },
  ];

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
    writeU16(bytes, 4, 0x9301); // replace saved lr with branch target
    writeU16(bytes, 6, 0xbd08); // pop {r3, pc}
    writeU32(bytes, 8, targetAddress | 1);
    return bytes;
  }

  function isSyntheticOverlayBranch(data, offset) {
    if (offset < 0 || offset + 8 > data.length) {
      return false;
    }
    if (readU32(data, offset) === 0x47184b00) {
      const target = readU32(data, offset + 4) & ~1;
      return target >= SYNTH_OVERLAY_RAM_BASE && target < SYNTH_OVERLAY_RAM_BASE + DSPRE_SYNTH_OVERLAY_SIZE;
    }
    if (offset + 12 <= data.length && readU32(data, offset) === 0x4b01b508 && readU32(data, offset + 4) === 0xbd089301) {
      const target = readU32(data, offset + 8) & ~1;
      return target >= SYNTH_OVERLAY_RAM_BASE && target < SYNTH_OVERLAY_RAM_BASE + DSPRE_SYNTH_OVERLAY_SIZE;
    }
    return false;
  }

  function syntheticOverlayBranchTarget(data, offset) {
    if (!isSyntheticOverlayBranch(data, offset)) {
      return 0;
    }
    if (readU32(data, offset) === 0x4b01b508 && readU32(data, offset + 4) === 0xbd089301) {
      return readU32(data, offset + 8) & ~1;
    }
    return readU32(data, offset + 4) & ~1;
  }

  function bottleCapEntries(rom, options) {
    if (!itemExpansionPatches || typeof itemExpansionPatches.expandedBottleCapEntries !== "function") {
      throw new PatchError("Bottle Caps require the Item Expansion patch module.");
    }
    const entries = itemExpansionPatches.expandedBottleCapEntries(rom, {
      ...options,
      bottleCapsAutoExpandedItems: true,
    });
    if (entries.length !== BOTTLE_CAP_COUNT) {
      throw new PatchError(`Bottle Caps expected ${BOTTLE_CAP_COUNT} expanded cap item rows, found ${entries.length}.`);
    }
    return entries;
  }

  function patchBottleCapMessage(rom, log) {
    const file = findFileByPath(rom, MESSAGE_NARC_PATH);
    const narc = rom.slice(file.start, file.end);
    const bank = narcMemberBytes(narc, PARTY_MENU_MESSAGE_MEMBER);
    const patchedBank = replaceMessageBankEntries(
      bank,
      SUCCESS_MESSAGE_TEXTS.map((text, index) => [SUCCESS_MESSAGE_ENTRY + index, text]),
      { label: "Bottle Caps party message" }
    );
    const patchedNarc = replaceNarcMembers(narc, [[PARTY_MENU_MESSAGE_MEMBER, patchedBank]]);
    const result = replaceRomFileAllowGrowth(rom, file, patchedNarc, "Bottle Caps party message");
    log.push(
      `Bottle Caps: ${
        result.state === "already" ? "party message already patched" : "patched party message"
      } at msgdata/pl_msg.narc member ${PARTY_MENU_MESSAGE_MEMBER} entries ${SUCCESS_MESSAGE_ENTRY}-${
        SUCCESS_MESSAGE_ENTRY + SUCCESS_MESSAGE_TEXTS.length - 1
      }.`
    );
    return result.rom;
  }

  async function buildBottleCapPayload(payloadAddress, entries, fallbackTargets) {
    const helperAddress = payloadAddress + MARKER.length;
    let helper;
    try {
      helper = await assembler.assembleArmips({
        source: asmTemplates.bottleCapsHelper({
          helperAddress,
          entries,
          fallbackCheckAddress: fallbackTargets.checkAddress,
          fallbackDispatchAddress: fallbackTargets.dispatchAddress,
          pokemonGetValueAddress: POKEMON_GET_VALUE_RAM,
          pokemonSetValueAddress: POKEMON_SET_VALUE_RAM,
          pokemonCalcStatsAddress: POKEMON_CALC_STATS_RAM,
          partyGetPokemonBySlotIndexAddress: PARTY_GET_MON_RAM,
          partyMenuLoadMemberAddress: PARTY_MENU_LOAD_MEMBER_RAM,
          partyMenuDrawMemberPanelAddress: PARTY_MENU_DRAW_MEMBER_PANEL_RAM,
          partyMenuLoadMemberWindowTilesAddress: PARTY_MENU_LOAD_MEMBER_WINDOW_TILES_RAM,
          partyMenuDrawStatusAddress: PARTY_MENU_DRAW_STATUS_RAM,
          partyMenuPrintLongMessageAddress: PARTY_MENU_PRINT_LONG_MESSAGE_RAM,
          messageLoaderGetNewStringAddress: MESSAGE_LOADER_GET_NEW_STRING_RAM,
          stringTemplateFormatAddress: STRING_TEMPLATE_FORMAT_RAM,
          stringTemplateSetNicknameAddress: STRING_TEMPLATE_SET_NICKNAME_RAM,
          stringFreeAddress: STRING_FREE_RAM,
          soundPlayEffectAddress: SOUND_PLAY_EFFECT_RAM,
          checkReturnAddress: POKEMON_CHECK_ITEM_EFFECTS_RETURN_RAM,
          dispatchReturnAddress: PARTY_ITEM_DISPATCH_RETURN_RAM,
          waitStateAddress: WAIT_STATE_RAM,
          appPartyMenuOffset: APP_PARTY_MENU_OFFSET,
          partyMenuUsedItemOffset: PARTY_MENU_USED_ITEM_OFFSET,
          appCurrSlotOffset: APP_CURR_SLOT_OFFSET,
          appStateOffset: APP_STATE_OFFSET,
          appMessageLoaderOffset: APP_MESSAGE_LOADER_OFFSET,
          appTemplateOffset: APP_TEMPLATE_OFFSET,
          appTmpStringOffset: APP_TMP_STRING_OFFSET,
          appPartyMemberStatusOffset: APP_PARTY_MEMBER_STATUS_OFFSET,
          partyMemberSize: PARTY_MEMBER_SIZE,
          successMessageId: SUCCESS_MESSAGE_ENTRY,
          soundEffectId: SOUND_EFFECT_HEAL,
          monDataHpIv: MON_DATA_HP_IV,
          monDataIsEgg: MON_DATA_IS_EGG,
          monDataSpeciesExists: MON_DATA_SPECIES_EXISTS,
        }),
      });
    } catch (error) {
      throw new PatchError(`Bottle Caps armips helper assembly failed: ${error.message}`);
    }

    const bytes = new Uint8Array(MARKER.length + helper.length);
    bytes.set(MARKER);
    bytes.set(helper, MARKER.length);
    return {
      bytes,
      checkAddress: helperAddress,
      dispatchAddress: helperAddress + 0x80,
      tableAddress: helperAddress + 0x720,
    };
  }

  async function patchBottleCapArm9Hooks(rom, force, log, entries) {
    const allocator = new SyntheticOverlayAllocator(rom, log);
    const existingMarkerOffset = allocator.markerOffsets(MARKER_TEXT).slice(-1)[0];
    const existingHelperAddress =
      existingMarkerOffset === undefined ? 0 : allocator.ramAddress(existingMarkerOffset) + MARKER.length;
    const fallbackTargets = {
      checkAddress: 0,
      dispatchAddress: 0,
    };
    const checkHookOffset = arm9Offset(rom, POKEMON_CHECK_ITEM_EFFECTS_RAM, 8);
    const checkTarget = syntheticOverlayBranchTarget(rom, checkHookOffset);
    if (checkTarget && checkTarget !== existingHelperAddress) {
      fallbackTargets.checkAddress = checkTarget;
    }
    const dispatchHookOffset = arm9Offset(rom, PARTY_ITEM_DISPATCH_RAM, 8);
    const dispatchTarget = syntheticOverlayBranchTarget(rom, dispatchHookOffset);
    if (dispatchTarget && dispatchTarget !== (existingHelperAddress ? existingHelperAddress + 0x80 : 0)) {
      fallbackTargets.dispatchAddress = dispatchTarget;
    }

    const allocation = await allocator.allocateAsync({
      marker: MARKER_TEXT,
      buildPayload: (payloadAddress) => buildBottleCapPayload(payloadAddress, entries, fallbackTargets),
      label: "Bottle Caps",
      alignment: 0x10,
      updateExisting: true,
    });
    const changedHooks = [];

    for (const hook of HOOK_SITES) {
      const offset = arm9Offset(rom, hook.ram, hook.original.length);
      const patched = hook.preserveR3
        ? thumbAbsoluteBranchPreserveR3(allocation.built[hook.entryKey])
        : thumbAbsoluteBranch(allocation.built[hook.entryKey]);
      let state;
      try {
        state = requireBytes(rom, offset, hook.original, patched, force, `Bottle Caps ${hook.label} hook`);
      } catch (error) {
        if (!isSyntheticOverlayBranch(rom, offset)) {
          throw error;
        }
        state = "legacy";
      }
      if (state !== "already") {
        writeBytes(rom, offset, patched);
        changedHooks.push(state === "legacy" ? `${hook.label} chained` : hook.label);
      }
    }

    log.push(
      `Bottle Caps: ${
        changedHooks.length ? `installed ${changedHooks.join(", ")} hook(s)` : "ARM9 hooks already installed"
      }; helper table at synthetic-overlay RAM ${hex(allocation.built.tableAddress)}.`
    );
  }

  async function patchBottleCaps(rom, force, log, options = {}) {
    const entries = bottleCapEntries(rom, options);
    await patchBottleCapArm9Hooks(rom, force, log, entries);
    rom = patchBottleCapMessage(rom, log);
    log.push(
      `Bottle Caps: configured ${entries
        .map((entry) => `${hex(entry.itemId)}=${entry.name}`)
        .join(", ")}.`
    );
    log.push("Bottle Caps: caps maximize IVs and fail without consuming the item if the selected IVs are already 31.");
    return rom;
  }

  return {
    bottleCaps: patchBottleCaps,
  };
});
