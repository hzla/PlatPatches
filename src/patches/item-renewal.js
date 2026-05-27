(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory;
  } else {
    root.PlatinumPatcherItemRenewalPatch = factory(root.PlatinumPatcherCore);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (core) {
  "use strict";

  if (!core) {
    throw new Error("Item Renewal patch requires PlatinumPatcherCore to load first.");
  }

  const {
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

function allocateSyntheticPayload(rom, marker, buildPayload, log, label, options = {}) {
  return new SyntheticOverlayAllocator(rom, log).allocate({
    marker,
    buildPayload,
    label,
    alignment: options.alignment || 0x10,
    updateExisting: Boolean(options.updateExisting),
  });
}

const ITEM_RENEWAL_MARKER = "item_renewal_v5";
const ITEM_RENEWAL_LEGACY_MARKERS = ["item_renewal_v1", "item_renewal_v2"];
const ITEM_RENEWAL_INIT_PKAIZO_REL = 0x16b5c;
const ITEM_RENEWAL_END_PKAIZO_REL = 0x15628;
const ITEM_RENEWAL_INIT_ORIGINAL = bytesFromHex("f8 b5 84 b0");
const ITEM_RENEWAL_END_ORIGINAL = bytesFromHex("70 b5 06 1c");
const ITEM_RENEWAL_TEMPLATE = bytesFromHex(`
  1f b5 74 46 c0 46 c0 46 a6 46 1f bc f8 b5 84 b0
  70 47 f0 b5 04 46 0d 46 16 46 1f 46 06 2f 29 d2
  20 46 c0 46 c0 46 02 46 04 21 08 42 22 d1 01 20
  30 42 1f d1 18 20 10 42 01 d0 00 2e 1a d1 0e 48
  01 68 a9 42 03 d0 05 60 00 21 01 61 81 82 10 30
  c1 5d 00 29 0e d1 01 21 c1 55 20 46 31 46 3a 46
  c0 46 c0 46 06 21 00 22 c0 46 c0 46 03 4b 04 33
  7a 00 98 52 f0 bd c0 46 00 00 00 00 00 00 00 00
  1f b5 74 46 c0 46 c0 46 a6 46 1f bc 70 b5 06 46
  70 47 f0 b5 81 b0 04 46 0d 46 20 46 c0 46 c0 46
  04 21 08 42 27 d1 15 4e 30 68 a8 42 23 d1 00 27
  06 2f 1c d2 30 46 10 30 c0 5d 00 28 15 d0 20 46
  00 21 3a 46 c0 46 c0 46 05 46 06 21 00 22 c0 46
  c0 46 00 28 09 d1 0a 4b 04 33 7a 00 9a 5a 00 92
  28 46 06 21 6a 46 c0 46 c0 46 01 37 e0 e7 00 20
  30 60 30 61 b0 82 01 b0 f0 bd c0 46 00 00 00 00
  00 00 00 00
`);
const ITEM_RENEWAL_OFFSETS = {
  snapshotHook: 0x00,
  snapshotCore: 0x12,
  snapBlCore: 0x04,
  snapBlGetType: 0x22,
  snapBlGetParty: 0x60,
  snapBlGetValue: 0x68,
  snapDataPtr1: 0x78,
  snapDataPtr2: 0x7c,
  restoreHook: 0x80,
  restoreCore: 0x92,
  restoreBlCore: 0x84,
  restoreBlGetType: 0x9c,
  restoreBlGetParty: 0xc4,
  restoreBlGetValue: 0xce,
  restoreBlSetValue: 0xe6,
  restoreDataPtr1: 0xfc,
  restoreDataPtr2: 0x100,
};
const BATTLE_SYSTEM_GET_BATTLE_TYPE_RAM = 0x0223df0c;
const BATTLE_SYSTEM_GET_PARTY_POKEMON_RAM = 0x0223dfac;
const POKEMON_GET_VALUE_RAM = 0x02074470;
const POKEMON_SET_VALUE_RAM = 0x02074b30;

function patchArrayBl(out, offset, fromAddress, toAddress) {
  const bytes = thumbBl(fromAddress, toAddress);
  out[offset] = bytes[0];
  out[offset + 1] = bytes[1];
  out[offset + 2] = bytes[2];
  out[offset + 3] = bytes[3];
}

function patchArrayU32(out, offset, value) {
  out[offset] = value & 0xff;
  out[offset + 1] = (value >>> 8) & 0xff;
  out[offset + 2] = (value >>> 16) & 0xff;
  out[offset + 3] = (value >>> 24) & 0xff;
}

function buildItemRenewalPayload(payloadRamAddress) {
  const out = Array.from(asciiBytes(ITEM_RENEWAL_MARKER));
  while (out.length % 4 !== 0) {
    out.push(0);
  }
  const dataOffset = out.length;
  for (let i = 0; i < 24; i += 1) {
    out.push(0);
  }
  const codeOffset = out.length;
  out.push(...ITEM_RENEWAL_TEMPLATE);

  const dataRam = payloadRamAddress + dataOffset;
  const codeRam = payloadRamAddress + codeOffset;
  const o = ITEM_RENEWAL_OFFSETS;
  patchArrayBl(out, codeOffset + o.snapBlCore, codeRam + o.snapBlCore, codeRam + o.snapshotCore);
  patchArrayBl(out, codeOffset + o.snapBlGetType, codeRam + o.snapBlGetType, BATTLE_SYSTEM_GET_BATTLE_TYPE_RAM);
  patchArrayBl(out, codeOffset + o.snapBlGetParty, codeRam + o.snapBlGetParty, BATTLE_SYSTEM_GET_PARTY_POKEMON_RAM);
  patchArrayBl(out, codeOffset + o.snapBlGetValue, codeRam + o.snapBlGetValue, POKEMON_GET_VALUE_RAM);
  patchArrayBl(out, codeOffset + o.restoreBlCore, codeRam + o.restoreBlCore, codeRam + o.restoreCore);
  patchArrayBl(out, codeOffset + o.restoreBlGetType, codeRam + o.restoreBlGetType, BATTLE_SYSTEM_GET_BATTLE_TYPE_RAM);
  patchArrayBl(out, codeOffset + o.restoreBlGetParty, codeRam + o.restoreBlGetParty, BATTLE_SYSTEM_GET_PARTY_POKEMON_RAM);
  patchArrayBl(out, codeOffset + o.restoreBlGetValue, codeRam + o.restoreBlGetValue, POKEMON_GET_VALUE_RAM);
  patchArrayBl(out, codeOffset + o.restoreBlSetValue, codeRam + o.restoreBlSetValue, POKEMON_SET_VALUE_RAM);
  for (const offset of [o.snapDataPtr1, o.snapDataPtr2, o.restoreDataPtr1, o.restoreDataPtr2]) {
    patchArrayU32(out, codeOffset + offset, dataRam);
  }

  return {
    bytes: new Uint8Array(out),
    dataOffset,
    codeOffset,
    dataRam,
    snapshotHookRam: codeRam + o.snapshotHook,
    restoreHookRam: codeRam + o.restoreHook,
    codeSize: ITEM_RENEWAL_TEMPLATE.length,
  };
}

function itemRenewalLegacyHookBytes(rom, label, hookRam) {
  let member;
  try {
    member = readSyntheticOverlayMember(rom).member;
  } catch (error) {
    return [];
  }

  const out = [];
  const targetOffset =
    label === "Item Renewal snapshot"
      ? ITEM_RENEWAL_OFFSETS.snapshotHook
      : ITEM_RENEWAL_OFFSETS.restoreHook;
  for (const marker of ITEM_RENEWAL_LEGACY_MARKERS) {
    for (const markerOffset of findNeedle(member, asciiBytes(marker), 0, member.length)) {
      const legacyCodeOffset = align(marker.length, 4) + 24;
      const legacyTarget = SYNTH_OVERLAY_RAM_BASE + markerOffset + legacyCodeOffset + targetOffset;
      out.push(new Uint8Array(thumbBl(hookRam, legacyTarget)));
    }
  }
  return out;
}

function hookBytesForItemRenewal(label, hookRam, built = null) {
  if (!built) {
    return new Uint8Array(4);
  }
  const target = label === "Item Renewal snapshot" ? built.snapshotHookRam : built.restoreHookRam;
  return new Uint8Array(thumbBl(hookRam, target));
}

function locateItemRenewalHookWithTarget(rom, rel, originalBytes, built, label) {
  const overlay = getOverlayRange(rom, OVERLAY_16);
  const preferred = overlay.start + rel;
  const preferredRam = overlay.loadAddress + rel;
  const preferredHook = hookBytesForItemRenewal(label, preferredRam, built);
  const preferredLegacyHooks = itemRenewalLegacyHookBytes(rom, label, preferredRam);
  const preferredLegacyHook = preferredLegacyHooks.some((bytes) => bytesEqual(rom, preferred, bytes));
  if (bytesEqual(rom, preferred, originalBytes) || bytesEqual(rom, preferred, preferredHook) || preferredLegacyHook) {
    return { offset: preferred, overlay, hookBytes: preferredHook, legacyHook: preferredLegacyHook, usedFallback: false };
  }

  const searchStart = Math.max(overlay.start, preferred - 0x60);
  const searchEnd = Math.min(overlay.end, preferred + 0x60);
  const hits = [];
  for (let offset = searchStart; offset <= searchEnd - originalBytes.length; offset += 2) {
    const ram = overlay.loadAddress + (offset - overlay.start);
    const hookBytes = hookBytesForItemRenewal(label, ram, built);
    const legacyHooks = itemRenewalLegacyHookBytes(rom, label, ram);
    const legacyHook = legacyHooks.some((bytes) => bytesEqual(rom, offset, bytes));
    if (
      bytesEqual(rom, offset, originalBytes) ||
      bytesEqual(rom, offset, hookBytes) ||
      legacyHook
    ) {
      hits.push({ offset, overlay, hookBytes, legacyHook, usedFallback: true });
    }
  }
  if (hits.length === 1) {
    return hits[0];
  }

  throw new PatchError(`${label} hook was not found near overlay 16+${hex(rel)}.`);
}

function patchItemRenewal(rom, force, log) {
  const allocation = allocateSyntheticPayload(
    rom,
    ITEM_RENEWAL_MARKER,
    buildItemRenewalPayload,
    log,
    "Item Renewal helper"
  );
  const built = allocation.built;
  const snapshotLocated = locateItemRenewalHookWithTarget(
    rom,
    ITEM_RENEWAL_INIT_PKAIZO_REL,
    ITEM_RENEWAL_INIT_ORIGINAL,
    built,
    "Item Renewal snapshot"
  );
  const restoreLocated = locateItemRenewalHookWithTarget(
    rom,
    ITEM_RENEWAL_END_PKAIZO_REL,
    ITEM_RENEWAL_END_ORIGINAL,
    built,
    "Item Renewal restore"
  );
  const snapshotState = snapshotLocated.legacyHook
    ? "patch"
    : requireBytes(
        rom,
        snapshotLocated.offset,
        ITEM_RENEWAL_INIT_ORIGINAL,
        snapshotLocated.hookBytes,
        force,
        "Item Renewal snapshot hook"
      );
  const restoreState = restoreLocated.legacyHook
    ? "patch"
    : requireBytes(
        rom,
        restoreLocated.offset,
        ITEM_RENEWAL_END_ORIGINAL,
        restoreLocated.hookBytes,
        force,
        "Item Renewal restore hook"
      );

  if (snapshotState !== "already") {
    writeBytes(rom, snapshotLocated.offset, snapshotLocated.hookBytes);
  }
  if (restoreState !== "already") {
    writeBytes(rom, restoreLocated.offset, restoreLocated.hookBytes);
  }

  if (snapshotState === "already" && restoreState === "already" && allocation.reused) {
    log.push("Item Renewal: already patched.");
    return;
  }

  const notes = [];
  if (snapshotLocated.usedFallback) {
    notes.push("snapshot fallback scan");
  }
  if (restoreLocated.usedFallback) {
    notes.push("restore fallback scan");
  }
  if (snapshotLocated.legacyHook || restoreLocated.legacyHook) {
    notes.push("legacy hooks migrated");
  }
  log.push(
    `Item Renewal: snapshots player held items at overlay 16+${hex(
      snapshotLocated.offset - snapshotLocated.overlay.start
    )}, restores them after battle at overlay 16+${hex(
      restoreLocated.offset - restoreLocated.overlay.start
    )}; helper RAM ${hex(allocation.payloadRamAddress)} data ${hex(built.dataRam)}${
      notes.length ? ` (${notes.join(", ")})` : ""
    }.`
  );
}

  return {
    itemRenewal: patchItemRenewal,
  };
});
