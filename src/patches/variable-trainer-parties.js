(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    const assembler = require("../asm/armips-assembler.js");
    const templates = require("../asm/templates.js");
    module.exports = (core) => factory(core, assembler, templates);
  } else {
    root.PlatinumPatcherVariableTrainerPartyPatches = factory(
      root.PlatinumPatcherCore,
      root.PlatinumPatcherArmipsAssembler,
      root.PlatinumPatcherAsmTemplates
    );
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (core, assembler, asmTemplates) {
  "use strict";

  if (!core) {
    throw new Error("Variable Trainer Parties patches require PlatinumPatcherCore to load first.");
  }
  if (!assembler || !asmTemplates) {
    throw new Error("armips assembler failed to load for Variable Trainer Parties patches.");
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
    findNeedle,
    getOverlayRange,
    hex,
    narcMemberBytes,
    parseNarc,
    readU16,
    replaceNarcMembers,
    replaceRomFileAllowGrowth,
    writeBytes,
    writeU16,
    writeU32,
  } = core;

  const MARKER_TEXT = "VARTRPTYV1";
  const MARKER = (() => {
    const out = new Uint8Array(16);
    out.set(asciiBytes(MARKER_TEXT));
    return out;
  })();

  const TRDATA_NARC_PATH = "poketool/trainer/trdata.narc";
  const TRPOKE_NARC_PATH = "poketool/trainer/trpoke.narc";
  const TRAINER_HEADER_SIZE = 0x14;
  const TRAINER_ITEM_FIELD_OFFSET = 0x04;
  const TRAINER_ITEM_FIELD_COUNT = 4;
  const MAX_PARTY_SIZE = 6;

  const NARC_READ_FROM_MEMBER_RAM = 0x02006afc;
  const NARC_GET_MEMBER_SIZE_RAM = 0x02006b58;
  const LCRNG_NEXT_RAM = 0x0201d2e8;
  const TRAINER_LOAD_PARTY_RAM = 0x0207939c;
  const TRAINER_BUILD_PARTY_AFTER_LOAD_RAM = 0x020793f1;
  const TRAINER_LOAD_PARTY_VANILLA = bytesFromHex("024b021c081c3a211847c046a56a0002");

  const AI_ITEM_IMPORT_PATTERN = bytesFromHex("0120204227d0b9208000204223d10026");
  const AI_ITEM_IMPORT_PATCHED_PATTERN = bytesFromHex("29e0204227d0b9208000204223d10026");
  const AI_ITEM_IMPORT_BRANCH = bytesFromHex("29e0");

  function parseInteger(token, label) {
    const text = token === undefined || token === null ? "" : String(token).trim();
    if (!text) {
      throw new PatchError(`${label} is required.`);
    }
    const value = /^0x[0-9a-f]+$/i.test(text)
      ? Number.parseInt(text.slice(2), 16)
      : /^[0-9]+$/.test(text)
        ? Number.parseInt(text, 10)
        : NaN;
    if (!Number.isInteger(value)) {
      throw new PatchError(`${label} "${text}" is not a valid number.`);
    }
    return value;
  }

  function parseOptionalInteger(token, label) {
    const text = token === undefined || token === null ? "" : String(token).trim();
    if (!text) {
      return 0;
    }
    return parseInteger(text, label);
  }

  function trainerRecordSize(monDataType) {
    switch (monDataType) {
    case 1:
      return 0x10;
    case 2:
      return 0x0a;
    case 3:
      return 0x12;
    default:
      return 0x08;
    }
  }

  function parseRows(options) {
    const source = Array.isArray(options && options.variableTrainerParties)
      ? options.variableTrainerParties
      : [];
    const rows = [];
    const seen = new Set();

    for (let index = 0; index < source.length; index += 1) {
      const raw = source[index] || {};
      const altSource = Array.isArray(raw.alternatePartyIds) ? raw.alternatePartyIds : [];
      const hasTrainer = raw.trainerId !== undefined && raw.trainerId !== null && String(raw.trainerId).trim() !== "";
      const hasAlt = altSource.some((value) => value !== undefined && value !== null && String(value).trim() !== "");
      if (!hasTrainer && !hasAlt) {
        continue;
      }
      if (!hasTrainer) {
        throw new PatchError(`Variable trainer party row ${index + 1} is missing a trainer ID.`);
      }

      const trainerId = parseInteger(raw.trainerId, `Variable trainer party row ${index + 1} trainer ID`);
      if (seen.has(trainerId)) {
        throw new PatchError(`Variable trainer party row ${index + 1} duplicates trainer ${trainerId}.`);
      }
      seen.add(trainerId);

      const alternatePartyIds = [];
      for (let altIndex = 0; altIndex < TRAINER_ITEM_FIELD_COUNT; altIndex += 1) {
        const altId = parseOptionalInteger(
          altSource[altIndex],
          `Variable trainer party row ${index + 1} alternate ${altIndex + 1}`
        );
        if (altId > 0xffff) {
          throw new PatchError(
            `Variable trainer party row ${index + 1} alternate ${altIndex + 1} must fit in a 16-bit trainer item field.`
          );
        }
        alternatePartyIds.push(altId);
      }

      rows.push({ trainerId, alternatePartyIds });
    }

    return rows;
  }

  function validateRows(rom, rows) {
    const trdataFile = findFileByPath(rom, TRDATA_NARC_PATH);
    const trpokeFile = findFileByPath(rom, TRPOKE_NARC_PATH);
    const trdataNarc = rom.slice(trdataFile.start, trdataFile.end);
    const trpokeNarc = rom.slice(trpokeFile.start, trpokeFile.end);
    const trdata = parseNarc(trdataNarc);
    const trpoke = parseNarc(trpokeNarc);

    for (const row of rows) {
      if (row.trainerId < 0 || row.trainerId >= trdata.entries.length) {
        throw new PatchError(`Variable Trainer Parties trainer ${row.trainerId} does not exist in ${TRDATA_NARC_PATH}.`);
      }
      if (row.trainerId >= trpoke.entries.length) {
        throw new PatchError(`Variable Trainer Parties trainer ${row.trainerId} does not have a base ${TRPOKE_NARC_PATH} member.`);
      }

      const trainerData = narcMemberBytes(trdataNarc, row.trainerId);
      if (trainerData.length < TRAINER_HEADER_SIZE) {
        throw new PatchError(`Variable Trainer Parties trainer ${row.trainerId} has truncated trainer data.`);
      }

      const monDataType = trainerData[0];
      const partySize = Math.min(trainerData[3], MAX_PARTY_SIZE);
      const recordSize = trainerRecordSize(monDataType);
      const baseParty = narcMemberBytes(trpokeNarc, row.trainerId);
      if (baseParty.length < partySize * recordSize) {
        throw new PatchError(
          `Variable Trainer Parties trainer ${row.trainerId} base party is too short for ${partySize} Pokemon.`
        );
      }

      const alternateMembers = row.alternatePartyIds.map((altId, altIndex) => {
        if (!altId) {
          return null;
        }
        if (altId >= trpoke.entries.length) {
          throw new PatchError(
            `Variable trainer ${row.trainerId} alternate ${altIndex + 1} points to missing ${TRPOKE_NARC_PATH} member ${altId}.`
          );
        }
        const member = narcMemberBytes(trpokeNarc, altId);
        if (!member.length) {
          throw new PatchError(`Variable trainer ${row.trainerId} alternate member ${altId} is empty.`);
        }
        if (member.length % recordSize !== 0) {
          throw new PatchError(
            `Variable trainer ${row.trainerId} alternate member ${altId} does not match record size ${recordSize}.`
          );
        }
        if (member.length > recordSize * MAX_PARTY_SIZE) {
          throw new PatchError(
            `Variable trainer ${row.trainerId} alternate member ${altId} has more than ${MAX_PARTY_SIZE} Pokemon records.`
          );
        }
        return member;
      });

      for (let slot = 0; slot < partySize; slot += 1) {
        let totalWeight = 0;
        for (let altIndex = 0; altIndex < alternateMembers.length; altIndex += 1) {
          const member = alternateMembers[altIndex];
          if (!member || member.length < (slot + 1) * recordSize) {
            continue;
          }
          const offset = slot * recordSize;
          const species = readU16(member, offset + 4) & 0x03ff;
          if (!species) {
            continue;
          }
          const weight = readU16(member, offset + 2);
          if (weight > 255) {
            throw new PatchError(
              `Variable trainer ${row.trainerId} alternate ${
                altIndex + 1
              } slot ${slot + 1} has weight ${weight}; use 0-255 in the level field.`
            );
          }
          totalWeight += weight;
        }
        if (totalWeight > 255) {
          throw new PatchError(
            `Variable trainer ${row.trainerId} slot ${slot + 1} alternate weights sum to ${totalWeight}; max is 255.`
          );
        }
      }
    }

    return { trdataFile, trpokeFile, trdataNarc, trpokeNarc, trdataCount: trdata.entries.length, trpokeCount: trpoke.entries.length };
  }

  function patchTrainerItemFields(rom, log, validation, rows, clearItems) {
    const replacements = new Map();
    const rowsByTrainer = new Map(rows.map((row) => [row.trainerId, row]));
    const trainerIds = clearItems
      ? Array.from({ length: validation.trdataCount }, (_, index) => index)
      : Array.from(rowsByTrainer.keys());

    for (const trainerId of trainerIds) {
      const member = new Uint8Array(narcMemberBytes(validation.trdataNarc, trainerId));
      if (member.length < TRAINER_HEADER_SIZE) {
        throw new PatchError(`Variable Trainer Parties trainer ${trainerId} has truncated trainer data.`);
      }
      for (let itemIndex = 0; itemIndex < TRAINER_ITEM_FIELD_COUNT; itemIndex += 1) {
        writeU16(member, TRAINER_ITEM_FIELD_OFFSET + itemIndex * 2, 0);
      }
      const row = rowsByTrainer.get(trainerId);
      if (row) {
        for (let itemIndex = 0; itemIndex < TRAINER_ITEM_FIELD_COUNT; itemIndex += 1) {
          writeU16(member, TRAINER_ITEM_FIELD_OFFSET + itemIndex * 2, row.alternatePartyIds[itemIndex] || 0);
        }
      }
      replacements.set(trainerId, member);
    }

    if (!replacements.size) {
      log.push("Variable Trainer Parties: no trainer item fields changed.");
      return rom;
    }

    const patchedNarc = replaceNarcMembers(validation.trdataNarc, Array.from(replacements.entries()));
    const result = replaceRomFileAllowGrowth(rom, validation.trdataFile, patchedNarc, "Variable Trainer Parties trainer data");
    log.push(
      `Variable Trainer Parties: ${
        clearItems ? `cleared trainer item fields for ${validation.trdataCount} trainer(s)` : "preserved unspecified trainer item fields"
      } and wrote ${rows.length} variant trainer row${rows.length === 1 ? "" : "s"}${
        result.growth ? `; ROM grew by ${result.growth} byte(s)` : ""
      }.`
    );
    return result.rom;
  }

  function thumbAbsoluteBranch16(targetAddress) {
    const bytes = new Uint8Array(16);
    for (let offset = 0; offset < bytes.length; offset += 2) {
      writeU16(bytes, offset, 0x46c0);
    }
    writeU16(bytes, 0, 0x4b00);
    writeU16(bytes, 2, 0x4718);
    writeU32(bytes, 4, targetAddress | 1);
    return bytes;
  }

  async function buildPayload(payloadAddress, trpokeCount) {
    const helperAddress = payloadAddress + MARKER.length;
    let helper;
    try {
      helper = await assembler.assembleArmips({
        source: asmTemplates.variableTrainerPartiesHelper({
          helperAddress,
          trainerBuildPartyReturnAddress: TRAINER_BUILD_PARTY_AFTER_LOAD_RAM,
          narcReadFromMemberAddress: NARC_READ_FROM_MEMBER_RAM,
          narcGetMemberSizeAddress: NARC_GET_MEMBER_SIZE_RAM,
          lcrngNextAddress: LCRNG_NEXT_RAM,
          trpokeMemberCount: trpokeCount,
        }),
      });
    } catch (error) {
      throw new PatchError(`Variable Trainer Parties armips helper assembly failed: ${error.message}`);
    }
    const bytes = new Uint8Array(MARKER.length + helper.length);
    bytes.set(MARKER);
    bytes.set(helper, MARKER.length);
    return {
      bytes,
      trainerLoadPartyAddress: helperAddress,
    };
  }

  function patchTrainerLoadPartyHook(rom, log, helperAddress) {
    const offset = arm9Offset(rom, TRAINER_LOAD_PARTY_RAM, TRAINER_LOAD_PARTY_VANILLA.length);
    const patched = thumbAbsoluteBranch16(helperAddress);
    if (bytesEqual(rom, offset, patched)) {
      log.push(`Variable Trainer Parties: Trainer_LoadParty hook already installed at RAM ${hex(TRAINER_LOAD_PARTY_RAM)}.`);
      return;
    }
    if (!bytesEqual(rom, offset, TRAINER_LOAD_PARTY_VANILLA)) {
      throw new PatchError("Variable Trainer Parties Trainer_LoadParty hook site does not match expected bytes.");
    }
    writeBytes(rom, offset, patched);
    log.push(
      `Variable Trainer Parties: installed bounded Trainer_LoadParty hook at RAM ${hex(TRAINER_LOAD_PARTY_RAM)}.`
    );
  }

  function patchDisableAiTrainerItems(rom, log) {
    const overlay = getOverlayRange(rom, OVERLAY_16);
    const patchedHits = findNeedle(rom, AI_ITEM_IMPORT_PATCHED_PATTERN, overlay.start, overlay.end);
    if (patchedHits.length === 1) {
      log.push("Variable Trainer Parties: enemy trainer item AI import is already disabled.");
      return;
    }

    const hits = findNeedle(rom, AI_ITEM_IMPORT_PATTERN, overlay.start, overlay.end);
    if (hits.length !== 1) {
      throw new PatchError(
        `Variable Trainer Parties trainer item AI import matched ${hits.length} locations in active overlay 16.`
      );
    }
    writeBytes(rom, hits[0], AI_ITEM_IMPORT_BRANCH);
    log.push(
      `Variable Trainer Parties: disabled enemy trainer item AI import at overlay 16+${hex(hits[0] - overlay.start)}.`
    );
  }

  async function patchRuntime(rom, log, trpokeCount) {
    const allocator = new SyntheticOverlayAllocator(rom, log);
    const allocation = await allocator.allocateAsync({
      marker: MARKER_TEXT,
      buildPayload: (payloadAddress) => buildPayload(payloadAddress, trpokeCount),
      label: "Variable Trainer Parties",
      updateExisting: true,
    });
    patchTrainerLoadPartyHook(rom, log, allocation.built.trainerLoadPartyAddress);
    patchDisableAiTrainerItems(rom, log);
  }

  async function variableTrainerParties(rom, force, log, options = {}) {
    const rows = parseRows(options);
    const clearItems = options.variableTrainerPartiesClearItems !== false;
    const validation = validateRows(rom, rows);
    const currentRom = patchTrainerItemFields(rom, log, validation, rows, clearItems);
    await patchRuntime(currentRom, log, validation.trpokeCount);
    log.push(
      `Variable Trainer Parties: configured ${rows.length} trainer row${
        rows.length === 1 ? "" : "s"
      }; alternate party refs use nonzero trainer item fields.`
    );
    return currentRom;
  }

  return {
    variableTrainerParties,
  };
});
