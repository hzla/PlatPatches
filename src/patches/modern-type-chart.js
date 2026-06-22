(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory;
  } else {
    root.PlatinumPatcherModernTypeChartPatches = factory(root.PlatinumPatcherCore);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (core) {
  "use strict";

  if (!core) {
    throw new Error("Modern type-chart patches require PlatinumPatcherCore to load first.");
  }

  const {
    OVERLAY_16,
    PatchError,
    bytesEqual,
    getOverlayRange,
    hex,
    writeBytes,
  } = core;

const TYPE_GHOST = 0x07;
const TYPE_STEEL = 0x08;
const TYPE_FAIRY = 0x09;
const TYPE_DARK = 0x11;
const TYPE_MULTI_NOT_VERY_EFF = 0x05;
const TYPE_MULTI_NEUTRAL = 0x0a;
const FAIRY_MULTI_NEUTRAL_NIBBLE = 0x02;
const FAIRY_MULTI_SUPER_EFF_NIBBLE = 0x04;

const TYPE_TABLE_REL = 0x33b94;
const VANILLA_TYPE_TABLE_SCAN_LIMIT = 0x180;
const VANILLA_ENTRY_SIZE = 3;
const FAIRY_MULTIPLIER_NIBBLES_REL = 0x10c;

const VANILLA_TYPE_TABLE_PREFIX = new Uint8Array([
  0x00, 0x05, TYPE_MULTI_NOT_VERY_EFF,
  0x00, TYPE_STEEL, TYPE_MULTI_NOT_VERY_EFF,
  0x0a, 0x0a, TYPE_MULTI_NOT_VERY_EFF,
]);
const FAIRY_TYPE_TABLE_PREFIX = new Uint8Array([
  0x00, 0x05,
  0x00, TYPE_STEEL,
  0x0a, 0x0a,
  0x0a, 0x0b,
]);

const MODERN_STEEL_VANILLA_RELATIONSHIPS = [
  {
    attackingType: TYPE_GHOST,
    defendingType: TYPE_STEEL,
    originalMultiplier: TYPE_MULTI_NOT_VERY_EFF,
    patchedMultiplier: TYPE_MULTI_NEUTRAL,
    label: "Ghost -> Steel",
    fallbackEntryRel: 0x33cab - TYPE_TABLE_REL,
  },
  {
    attackingType: TYPE_DARK,
    defendingType: TYPE_STEEL,
    originalMultiplier: TYPE_MULTI_NOT_VERY_EFF,
    patchedMultiplier: TYPE_MULTI_NEUTRAL,
    label: "Dark -> Steel",
    fallbackEntryRel: 0x33cc3 - TYPE_TABLE_REL,
  },
];

const MODERN_STEEL_FAIRY_RELATIONSHIPS = [
  {
    attackingType: TYPE_GHOST,
    defendingType: TYPE_STEEL,
    patchedNibble: FAIRY_MULTI_NEUTRAL_NIBBLE,
    label: "Ghost -> Steel",
    absentIsNeutral: true,
  },
  {
    attackingType: TYPE_DARK,
    defendingType: TYPE_STEEL,
    patchedNibble: FAIRY_MULTI_NEUTRAL_NIBBLE,
    label: "Dark -> Steel",
    absentIsNeutral: true,
  },
  {
    attackingType: TYPE_STEEL,
    defendingType: TYPE_FAIRY,
    patchedNibble: FAIRY_MULTI_SUPER_EFF_NIBBLE,
    label: "Steel -> Fairy",
    absentIsNeutral: false,
  },
];

function findVanillaTypeEntry(rom, tableAt, attackingType, defendingType) {
  for (let rel = 0; rel < VANILLA_TYPE_TABLE_SCAN_LIMIT; rel += VANILLA_ENTRY_SIZE) {
    const entryAt = tableAt + rel;
    const attack = rom[entryAt];
    const defend = rom[entryAt + 1];
    const multiplier = rom[entryAt + 2];
    if (attack === 0xff) {
      return null;
    }
    if (attack === attackingType && defend === defendingType) {
      return { rel, multiplier };
    }
  }

  return null;
}

function patchVanillaModernSteelType(rom, overlay, force, log) {
  const tableAt = overlay.start + TYPE_TABLE_REL;
  let changed = 0;
  const touched = [];

  for (const relationship of MODERN_STEEL_VANILLA_RELATIONSHIPS) {
    let entry = findVanillaTypeEntry(
      rom,
      tableAt,
      relationship.attackingType,
      relationship.defendingType
    );

    if (!entry && force) {
      entry = {
        rel: relationship.fallbackEntryRel,
        multiplier: rom[tableAt + relationship.fallbackEntryRel + 2],
      };
      writeBytes(
        rom,
        tableAt + entry.rel,
        new Uint8Array([
          relationship.attackingType,
          relationship.defendingType,
          relationship.patchedMultiplier,
        ])
      );
      changed += 1;
      touched.push(`+${hex(TYPE_TABLE_REL + entry.rel + 2)}`);
      continue;
    }

    if (!entry) {
      throw new PatchError(
        `Modern Steel Type could not find ${relationship.label} in the vanilla type chart.`
      );
    }

    if (entry.multiplier === relationship.patchedMultiplier) {
      touched.push(`+${hex(TYPE_TABLE_REL + entry.rel + 2)}`);
      continue;
    }

    if (entry.multiplier !== relationship.originalMultiplier && !force) {
      throw new PatchError(
        `Modern Steel Type sanity check failed for ${relationship.label} at overlay 16+${hex(
          TYPE_TABLE_REL + entry.rel
        )}. Found multiplier ${hex(entry.multiplier)}. Enable compatible modified bytes to patch anyway.`
      );
    }

    writeBytes(
      rom,
      tableAt + entry.rel + 2,
      new Uint8Array([relationship.patchedMultiplier])
    );
    changed += 1;
    touched.push(`+${hex(TYPE_TABLE_REL + entry.rel + 2)}`);
  }

  log.push(
    `Modern Steel Type: ${changed ? `patched ${changed} vanilla type-chart multiplier(s)` : "vanilla type chart already modern"} at overlay 16 ${touched.join(", ")}.`
  );
}

function findFairyTypePair(rom, tableAt, attackingType, defendingType) {
  for (let rel = 0; rel < FAIRY_MULTIPLIER_NIBBLES_REL; rel += 2) {
    const attack = rom[tableAt + rel];
    const defend = rom[tableAt + rel + 1];
    if (attack === 0xff && defend === 0xff) {
      return null;
    }
    if (attack === attackingType && defend === defendingType) {
      return rel / 2;
    }
  }

  return null;
}

function readFairyMultiplierNibble(rom, tableAt, pairIndex) {
  const byteAt = tableAt + FAIRY_MULTIPLIER_NIBBLES_REL + Math.floor(pairIndex / 2);
  const value = rom[byteAt];
  return pairIndex % 2 === 0 ? value >>> 4 : value & 0x0f;
}

function writeFairyMultiplierNibble(rom, tableAt, pairIndex, nibble) {
  const byteAt = tableAt + FAIRY_MULTIPLIER_NIBBLES_REL + Math.floor(pairIndex / 2);
  const value = rom[byteAt];
  const patched =
    pairIndex % 2 === 0
      ? ((nibble & 0x0f) << 4) | (value & 0x0f)
      : (value & 0xf0) | (nibble & 0x0f);
  if (patched !== value) {
    writeBytes(rom, byteAt, new Uint8Array([patched]));
    return true;
  }

  return false;
}

function patchFairyModernSteelType(rom, overlay, force, log) {
  const tableAt = overlay.start + TYPE_TABLE_REL;
  let changed = 0;
  const touched = [];

  for (const relationship of MODERN_STEEL_FAIRY_RELATIONSHIPS) {
    const pairIndex = findFairyTypePair(
      rom,
      tableAt,
      relationship.attackingType,
      relationship.defendingType
    );

    if (pairIndex == null) {
      if (relationship.absentIsNeutral) {
        touched.push(`${relationship.label}: absent`);
        continue;
      }
      throw new PatchError(
        `Modern Steel Type could not find ${relationship.label} in the Fairy type chart.`
      );
    }

    const currentNibble = readFairyMultiplierNibble(rom, tableAt, pairIndex);
    const byteRel = TYPE_TABLE_REL + FAIRY_MULTIPLIER_NIBBLES_REL + Math.floor(pairIndex / 2);
    if (currentNibble === relationship.patchedNibble) {
      touched.push(`${relationship.label}: +${hex(byteRel)}`);
      continue;
    }

    if (![0x00, 0x01, 0x02, 0x04].includes(currentNibble) && !force) {
      throw new PatchError(
        `Modern Steel Type sanity check failed for ${relationship.label} in the Fairy type chart. Found multiplier nibble ${hex(currentNibble)}. Enable compatible modified bytes to patch anyway.`
      );
    }

    if (writeFairyMultiplierNibble(rom, tableAt, pairIndex, relationship.patchedNibble)) {
      changed += 1;
    }
    touched.push(`${relationship.label}: +${hex(byteRel)}`);
  }

  log.push(
    `Modern Steel Type: ${changed ? `patched ${changed} Fairy type-chart nibble(s)` : "Fairy type chart already has modern Steel matchups"} (${touched.join(", ")}).`
  );
}

function patchModernSteelType(rom, force, log) {
  const overlay = getOverlayRange(rom, OVERLAY_16);
  const tableAt = overlay.start + TYPE_TABLE_REL;

  if (bytesEqual(rom, tableAt, FAIRY_TYPE_TABLE_PREFIX)) {
    patchFairyModernSteelType(rom, overlay, force, log);
    return;
  }

  if (bytesEqual(rom, tableAt, VANILLA_TYPE_TABLE_PREFIX) || force) {
    patchVanillaModernSteelType(rom, overlay, force, log);
    return;
  }

  throw new PatchError(
    "Modern Steel Type table sanity check failed at overlay 16+0x33B94. Apply after Fairy Patch for Fairy charts or enable compatible modified bytes to patch anyway."
  );
}

  return {
    modernSteelType: patchModernSteelType,
  };
});
