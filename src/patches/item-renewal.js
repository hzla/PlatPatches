(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    const assembler = require("../asm/armips-assembler.js");
    const templates = require("../asm/templates.js");
    module.exports = (core) => factory(core, assembler, templates);
  } else {
    root.PlatinumPatcherItemRenewalPatch = factory(
      root.PlatinumPatcherCore,
      root.PlatinumPatcherArmipsAssembler,
      root.PlatinumPatcherAsmTemplates
    );
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (core, assembler, asmTemplates) {
  "use strict";

  if (!core) {
    throw new Error("Item Renewal patch requires PlatinumPatcherCore to load first.");
  }
  if (!assembler || !asmTemplates) {
    throw new Error("armips assembler failed to load for Item Renewal patch.");
  }

  const {
    OVERLAY_13,
    OVERLAY_16,
    PatchError,
    SYNTH_OVERLAY_RAM_BASE,
    SyntheticOverlayAllocator,
    align,
    asciiBytes,
    bytesEqual,
    bytesFromHex,
    findNeedle,
    getOverlayRange,
    hex,
    readSyntheticOverlayMember,
    requireBytes,
    writeBytes,
  } = core;

  function thumbBl(fromAddress, toAddress) {
    const offset = toAddress - (fromAddress + 4);
    if (offset % 2 !== 0 || offset < -0x400000 || offset > 0x3ffffe) {
      throw new PatchError(`Cannot encode Thumb BL from ${hex(fromAddress)} to ${hex(toAddress)}.`);
    }
    const first = 0xf000 | ((offset >> 12) & 0x7ff);
    const second = 0xf800 | ((offset >> 1) & 0x7ff);
    return [first & 0xff, first >> 8, second & 0xff, second >> 8];
  }

  async function allocateSyntheticPayload(rom, marker, buildPayload, log, label, options = {}) {
    return new SyntheticOverlayAllocator(rom, log).allocateAsync({
      marker,
      buildPayload,
      label,
      alignment: options.alignment || 0x10,
      updateExisting: Boolean(options.updateExisting),
    });
  }

  const ITEM_RENEWAL_MARKER = "item_renewal_v12";
  const ITEM_RENEWAL_LEGACY_HOOKS = [
    { marker: "item_renewal_v1", dataSize: 24, snapshotHook: 0x00, restoreStartHook: 0x74 },
    { marker: "item_renewal_v2", dataSize: 24, snapshotHook: 0x00, restoreStartHook: 0x74 },
    { marker: "item_renewal_v4", dataSize: 24, snapshotHook: 0x00, restoreStartHook: 0x74 },
    { marker: "item_renewal_v5", dataSize: 24, snapshotHook: 0x00, restoreStartHook: 0x80 },
    { marker: "item_renewal_v6", dataSize: 0x34, snapshotHook: 0x00, restoreFinalHook: 0x96 },
    { marker: "item_renewal_v7", dataSize: 0x34, snapshotHook: 0x00, restoreFinalHook: 0x96 },
    { marker: "item_renewal_v8", dataSize: 0x34, snapshotHook: 0x00, restoreFinalHook: 0x96 },
  ];
  const ITEM_RENEWAL_LEGACY_WRITEBACK_HOOKS = [
    { marker: "item_renewal_v3", dataSize: 0, codeAlign: 2, writebackHook: 0x00 },
    { marker: "item_renewal_v8", dataSize: 0x34, codeAlign: 4, writebackHook: 0xbc },
    { marker: "item_renewal_v9", dataSize: 0, codeAlign: 2, writebackHook: 0x00 },
    { marker: "item_renewal_v10", dataSize: 0, codeAlign: 2, writebackHook: 0x00 },
    { marker: "item_renewal_v11", dataSize: 0, codeAlign: 2, writebackHook: 0x00 },
  ];
  const ITEM_RENEWAL_LEGACY_PARTY_HELD_ITEM_HOOKS = [
    { marker: "item_renewal_v10", dataSize: 0, codeAlign: 2, partyHeldItemHook: 0x44 },
    { marker: "item_renewal_v11", dataSize: 0, codeAlign: 2, partyHeldItemHook: 0x44 },
  ];
  const ITEM_RENEWAL_INIT_PKAIZO_REL = 0x16b5c;
  const ITEM_RENEWAL_END_PKAIZO_REL = 0x15628;
  const ITEM_RENEWAL_FINAL_PKAIZO_REL = ITEM_RENEWAL_END_PKAIZO_REL + 0x30;
  const ITEM_RENEWAL_WRITEBACK_PKAIZO_REL = 0x213c0;
  const ITEM_RENEWAL_PARTY_HELD_ITEM_REL = 0x14d8;
  const ITEM_RENEWAL_INIT_ORIGINAL = bytesFromHex("f8 b5 84 b0");
  const ITEM_RENEWAL_END_ORIGINAL = bytesFromHex("70 b5 06 1c");
  const ITEM_RENEWAL_FINAL_ORIGINAL = bytesFromHex("2c 20 a8 60");
  const ITEM_RENEWAL_WRITEBACK_ORIGINAL = bytesFromHex("70 78 00 07");
  const ITEM_RENEWAL_PARTY_HELD_ITEM_ORIGINAL = bytesFromHex("e0 83 60 68");
  const FLAG_INDEX_RAM = 0x020787cc;
  const BATTLE_SYSTEM_GET_BATTLE_CONTEXT_RAM = 0x0223df10;

  async function assembleItemRenewalHelper(label, source) {
    try {
      return await assembler.assembleArmips({ source });
    } catch (error) {
      throw new PatchError(`${label} armips helper assembly failed: ${error.message}`);
    }
  }

  async function buildItemRenewalPayload(payloadRamAddress) {
    const out = Array.from(asciiBytes(ITEM_RENEWAL_MARKER));
    while (out.length % 2 !== 0) {
      out.push(0);
    }
    const codeOffset = out.length;
    const helperRam = payloadRamAddress + codeOffset;
    const writebackHelper = await assembleItemRenewalHelper(
      "Item Renewal writeback",
      asmTemplates.itemRenewalWritebackHelper({
        helperAddress: helperRam,
        flagIndexAddress: FLAG_INDEX_RAM,
        battleSystemGetBattleContextAddress: BATTLE_SYSTEM_GET_BATTLE_CONTEXT_RAM,
      })
    );
    out.push(...writebackHelper);
    while (out.length % 2 !== 0) {
      out.push(0);
    }
    const partyHeldItemOffset = out.length;
    const partyHeldItemHelperRam = payloadRamAddress + partyHeldItemOffset;
    const partyHeldItemHelper = await assembleItemRenewalHelper(
      "Item Renewal party held-item",
      asmTemplates.itemRenewalPartyHeldItemHelper({
        helperAddress: partyHeldItemHelperRam,
        flagIndexAddress: FLAG_INDEX_RAM,
        battleSystemGetBattleContextAddress: BATTLE_SYSTEM_GET_BATTLE_CONTEXT_RAM,
      })
    );
    out.push(...partyHeldItemHelper);

    return {
      bytes: new Uint8Array(out),
      codeOffset,
      helperRam,
      partyHeldItemOffset,
      partyHeldItemHelperRam,
      codeSize: writebackHelper.length,
    };
  }

  function readSyntheticOverlayMemberSafe(rom) {
    try {
      return readSyntheticOverlayMember(rom).member;
    } catch (error) {
      return null;
    }
  }

  function itemRenewalLegacyHookBytes(rom, label, hookRam) {
    const member = readSyntheticOverlayMemberSafe(rom);
    if (!member) {
      return [];
    }

    const out = [];
    for (const legacy of ITEM_RENEWAL_LEGACY_HOOKS) {
      const targetOffset =
        label === "Item Renewal snapshot"
          ? legacy.snapshotHook
          : label === "Item Renewal final restore"
            ? legacy.restoreFinalHook
            : legacy.restoreStartHook;
      if (targetOffset === undefined) {
        continue;
      }
      for (const markerOffset of findNeedle(member, asciiBytes(legacy.marker), 0, member.length)) {
        const legacyCodeOffset = align(legacy.marker.length, 4) + legacy.dataSize;
        const legacyTarget = SYNTH_OVERLAY_RAM_BASE + markerOffset + legacyCodeOffset + targetOffset;
        out.push(new Uint8Array(thumbBl(hookRam, legacyTarget)));
      }
    }
    return out;
  }

  function itemRenewalLegacyWritebackHookBytes(rom, hookRam) {
    const member = readSyntheticOverlayMemberSafe(rom);
    if (!member) {
      return [];
    }

    const out = [];
    for (const legacy of ITEM_RENEWAL_LEGACY_WRITEBACK_HOOKS) {
      for (const markerOffset of findNeedle(member, asciiBytes(legacy.marker), 0, member.length)) {
        const legacyCodeOffset = align(legacy.marker.length, legacy.codeAlign) + legacy.dataSize;
        const legacyTarget = SYNTH_OVERLAY_RAM_BASE + markerOffset + legacyCodeOffset + legacy.writebackHook;
        out.push(new Uint8Array(thumbBl(hookRam, legacyTarget)));
      }
    }
    return out;
  }

  function itemRenewalLegacyPartyHeldItemHookBytes(rom, hookRam) {
    const member = readSyntheticOverlayMemberSafe(rom);
    if (!member) {
      return [];
    }

    const out = [];
    for (const legacy of ITEM_RENEWAL_LEGACY_PARTY_HELD_ITEM_HOOKS) {
      for (const markerOffset of findNeedle(member, asciiBytes(legacy.marker), 0, member.length)) {
        const legacyCodeOffset = align(legacy.marker.length, legacy.codeAlign) + legacy.dataSize;
        const legacyTarget = SYNTH_OVERLAY_RAM_BASE + markerOffset + legacyCodeOffset + legacy.partyHeldItemHook;
        out.push(new Uint8Array(thumbBl(hookRam, legacyTarget)));
      }
    }
    return out;
  }

  function itemRenewalWritebackSignatureMatches(rom, offset) {
    if (!bytesEqual(rom, offset, bytesFromHex("70 78 00 07 00 0f"))) {
      return false;
    }
    return bytesEqual(
      rom,
      offset + 10,
      bytesFromHex("b1 68 08 42 05 d1 32 1c 38 1c 06 21 0c 32")
    );
  }

  function hookBytesForItemRenewalWriteback(hookRam, built) {
    return new Uint8Array(thumbBl(hookRam, built.helperRam));
  }

  function hookBytesForItemRenewalPartyHeldItem(hookRam, built) {
    return new Uint8Array(thumbBl(hookRam, built.partyHeldItemHelperRam));
  }

  function locateItemRenewalWritebackHook(rom, built) {
    const overlay = getOverlayRange(rom, OVERLAY_16);
    const preferred = overlay.start + ITEM_RENEWAL_WRITEBACK_PKAIZO_REL;
    const preferredRam = overlay.loadAddress + ITEM_RENEWAL_WRITEBACK_PKAIZO_REL;
    const preferredHook = hookBytesForItemRenewalWriteback(preferredRam, built);
    const preferredLegacyHooks = itemRenewalLegacyWritebackHookBytes(rom, preferredRam);
    const preferredLegacyHook = preferredLegacyHooks.some((bytes) => bytesEqual(rom, preferred, bytes));
    if (
      itemRenewalWritebackSignatureMatches(rom, preferred) ||
      bytesEqual(rom, preferred, preferredHook) ||
      preferredLegacyHook
    ) {
      return { offset: preferred, overlay, hookBytes: preferredHook, legacyHook: preferredLegacyHook, usedFallback: false };
    }

    const searchStart = Math.max(overlay.start, preferred - 0x80);
    const searchEnd = Math.min(overlay.end, preferred + 0x80);
    const hits = [];
    for (let offset = searchStart; offset <= searchEnd - ITEM_RENEWAL_WRITEBACK_ORIGINAL.length; offset += 2) {
      const ram = overlay.loadAddress + (offset - overlay.start);
      const hookBytes = hookBytesForItemRenewalWriteback(ram, built);
      const legacyHooks = itemRenewalLegacyWritebackHookBytes(rom, ram);
      const legacyHook = legacyHooks.some((bytes) => bytesEqual(rom, offset, bytes));
      if (
        itemRenewalWritebackSignatureMatches(rom, offset) ||
        bytesEqual(rom, offset, hookBytes) ||
        legacyHook
      ) {
        hits.push({ offset, overlay, hookBytes, legacyHook, usedFallback: true });
      }
    }
    if (hits.length === 1) {
      return hits[0];
    }

    throw new PatchError(
      `Item Renewal held-item writeback hook was not found near overlay 16+${hex(ITEM_RENEWAL_WRITEBACK_PKAIZO_REL)}.`
    );
  }

  function itemRenewalPartyHeldItemSignatureMatches(rom, offset) {
    return (
      bytesEqual(rom, offset - 8, bytesFromHex("06 21 00 22")) &&
      bytesEqual(rom, offset, ITEM_RENEWAL_PARTY_HELD_ITEM_ORIGINAL) &&
      bytesEqual(rom, offset + 4, bytesFromHex("08 21 00 22"))
    );
  }

  function locateItemRenewalPartyHeldItemHook(rom, built) {
    const overlay = getOverlayRange(rom, OVERLAY_13);
    const preferred = overlay.start + ITEM_RENEWAL_PARTY_HELD_ITEM_REL;
    const preferredRam = overlay.loadAddress + ITEM_RENEWAL_PARTY_HELD_ITEM_REL;
    const preferredHook = hookBytesForItemRenewalPartyHeldItem(preferredRam, built);
    const preferredLegacyHooks = itemRenewalLegacyPartyHeldItemHookBytes(rom, preferredRam);
    const preferredLegacyHook = preferredLegacyHooks.some((bytes) => bytesEqual(rom, preferred, bytes));
    if (
      itemRenewalPartyHeldItemSignatureMatches(rom, preferred) ||
      bytesEqual(rom, preferred, preferredHook) ||
      preferredLegacyHook
    ) {
      return { offset: preferred, overlay, hookBytes: preferredHook, legacyHook: preferredLegacyHook, usedFallback: false };
    }

    const searchStart = Math.max(overlay.start + 8, preferred - 0x100);
    const searchEnd = Math.min(overlay.end, preferred + 0x100);
    const hits = [];
    for (let offset = searchStart; offset <= searchEnd - ITEM_RENEWAL_PARTY_HELD_ITEM_ORIGINAL.length; offset += 2) {
      const ram = overlay.loadAddress + (offset - overlay.start);
      const hookBytes = hookBytesForItemRenewalPartyHeldItem(ram, built);
      const legacyHooks = itemRenewalLegacyPartyHeldItemHookBytes(rom, ram);
      const legacyHook = legacyHooks.some((bytes) => bytesEqual(rom, offset, bytes));
      if (
        itemRenewalPartyHeldItemSignatureMatches(rom, offset) ||
        bytesEqual(rom, offset, hookBytes) ||
        legacyHook
      ) {
        hits.push({ offset, overlay, hookBytes, legacyHook, usedFallback: true });
      }
    }
    if (hits.length === 1) {
      return hits[0];
    }

    throw new PatchError(
      `Item Renewal battle party held-item cache hook was not found near overlay 13+${hex(
        ITEM_RENEWAL_PARTY_HELD_ITEM_REL
      )}.`
    );
  }

  function migrateLegacyItemRenewalHooks(rom, log) {
    const overlay = getOverlayRange(rom, OVERLAY_16);
    const sites = [
      {
        label: "Item Renewal snapshot",
        rel: ITEM_RENEWAL_INIT_PKAIZO_REL,
        original: ITEM_RENEWAL_INIT_ORIGINAL,
      },
      {
        label: "Item Renewal restore",
        rel: ITEM_RENEWAL_END_PKAIZO_REL,
        original: ITEM_RENEWAL_END_ORIGINAL,
      },
      {
        label: "Item Renewal final restore",
        rel: ITEM_RENEWAL_FINAL_PKAIZO_REL,
        original: ITEM_RENEWAL_FINAL_ORIGINAL,
      },
    ];
    const migrated = [];

    for (const site of sites) {
      const preferred = overlay.start + site.rel;
      const searchStart = Math.max(overlay.start, preferred - 0x80);
      const searchEnd = Math.min(overlay.end, preferred + 0x80);

      for (let offset = searchStart; offset <= searchEnd - site.original.length; offset += 2) {
        const ram = overlay.loadAddress + (offset - overlay.start);
        const legacyHooks = itemRenewalLegacyHookBytes(rom, site.label, ram);
        if (legacyHooks.some((bytes) => bytesEqual(rom, offset, bytes))) {
          writeBytes(rom, offset, site.original);
          migrated.push(`${site.label} overlay 16+${hex(offset - overlay.start)}`);
          break;
        }
      }
    }

    if (migrated.length) {
      log.push(`Item Renewal: removed legacy snapshot/restore hook(s): ${migrated.join(", ")}.`);
    }
    return migrated.length;
  }

  async function patchItemRenewal(rom, force, log) {
    const allocation = await allocateSyntheticPayload(
      rom,
      ITEM_RENEWAL_MARKER,
      buildItemRenewalPayload,
      log,
      "Item Renewal helper"
    );
    const built = allocation.built;
    const writebackLocated = locateItemRenewalWritebackHook(rom, built);
    const partyHeldItemLocated = locateItemRenewalPartyHeldItemHook(rom, built);
    const writebackState = writebackLocated.legacyHook
      ? "patch"
      : requireBytes(
          rom,
          writebackLocated.offset,
          ITEM_RENEWAL_WRITEBACK_ORIGINAL,
          writebackLocated.hookBytes,
          force,
          "Item Renewal held-item writeback hook"
        );
    const partyHeldItemState = partyHeldItemLocated.legacyHook
      ? "patch"
      : requireBytes(
          rom,
          partyHeldItemLocated.offset,
          ITEM_RENEWAL_PARTY_HELD_ITEM_ORIGINAL,
          partyHeldItemLocated.hookBytes,
          force,
          "Item Renewal battle party held-item cache hook"
        );

    if (writebackState !== "already") {
      writeBytes(rom, writebackLocated.offset, writebackLocated.hookBytes);
    }
    if (partyHeldItemState !== "already") {
      writeBytes(rom, partyHeldItemLocated.offset, partyHeldItemLocated.hookBytes);
    }

    const migratedLegacyHooks = migrateLegacyItemRenewalHooks(rom, log);

    if (writebackState === "already" && partyHeldItemState === "already" && allocation.reused && !migratedLegacyHooks) {
      log.push("Item Renewal: already patched.");
      return;
    }

    const notes = [];
    if (writebackLocated.usedFallback) {
      notes.push("writeback fallback scan");
    }
    if (partyHeldItemLocated.usedFallback) {
      notes.push("battle party fallback scan");
    }
    if (writebackLocated.legacyHook || partyHeldItemLocated.legacyHook || migratedLegacyHooks) {
      notes.push("legacy hooks migrated");
    }
    log.push(
      `Item Renewal: preserves held items by masking held-item writeback at overlay 16+${hex(
        writebackLocated.offset - writebackLocated.overlay.start
      )}; hides consumed items in battle party displays at overlay 13+${hex(
        partyHeldItemLocated.offset - partyHeldItemLocated.overlay.start
      )}; consumed items also mark the matching battle-side knocked-off mask to prevent mid-battle reloads; helper RAM ${hex(
        built.helperRam
      )}, party helper RAM ${hex(
        built.partyHeldItemHelperRam
      )}${notes.length ? ` (${notes.join(", ")})` : ""}.`
    );
  }

  return {
    itemRenewal: patchItemRenewal,
  };
});
