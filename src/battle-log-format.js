(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    root.PlatinumBattleLogFormat = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const VERSION = 1;
  const PARTY_SLOTS = 6;
  const MOVES_PER_SLOT = 4;
  const RECORD_SIZE = 52;
  const HEADER_SIZE = 32;
  const SECTOR_SIZE = 0x1000;
  const MAX_RECORDS = 600;
  const MAX_ID = 0x3ff;
  const SPECIES_CAPACITY = 1024;
  const LOG_MAGIC = 0x474c4250; // "PBLG"
  const FRAG_MAGIC = 0x464c4250; // "PBLF"
  const ANCESTRY_MAGIC = 0x434e4150; // "PANC"
  const CHECKSUM_OFFSET = 20;
  const LOG_SECTORS = Object.freeze([38, 39, 40, 41, 42, 43, 102, 103]);
  const AGGREGATE_SECTOR = 104;
  const RESERVED_SECTORS = Object.freeze([105, 106, 107]);
  const PAGE_CAPACITIES = Object.freeze([78, 78, 78, 78, 78, 78, 78, 54]);

  const BIT_OFFSETS = Object.freeze({
    trainerId: 0,
    playerCount: 10,
    playerSpecies: 13,
    playerKoCredit: 73,
    aiKoCredit: 91,
    heldItems: 109,
    moves: 169,
  });

  function readU16(bytes, offset) {
    return bytes[offset] | (bytes[offset + 1] << 8);
  }

  function readU32(bytes, offset) {
    return (
      bytes[offset]
      | (bytes[offset + 1] << 8)
      | (bytes[offset + 2] << 16)
      | (bytes[offset + 3] << 24)
    ) >>> 0;
  }

  function writeU16(bytes, offset, value) {
    bytes[offset] = value & 0xff;
    bytes[offset + 1] = (value >>> 8) & 0xff;
  }

  function writeU32(bytes, offset, value) {
    bytes[offset] = value & 0xff;
    bytes[offset + 1] = (value >>> 8) & 0xff;
    bytes[offset + 2] = (value >>> 16) & 0xff;
    bytes[offset + 3] = (value >>> 24) & 0xff;
  }

  function normalizedId(value) {
    const id = Number(value);
    return Number.isInteger(id) && id >= 0 && id <= MAX_ID ? id : 0;
  }

  function normalizedCredit(value) {
    const credit = Number(value);
    return Number.isInteger(credit) && credit >= 0 && credit <= PARTY_SLOTS ? credit : 0;
  }

  function writeBits(bytes, bitOffset, bitCount, value) {
    let remaining = Number(value) >>> 0;
    for (let bit = 0; bit < bitCount; bit += 1) {
      const absolute = bitOffset + bit;
      const mask = 1 << (absolute & 7);
      if (remaining & 1) {
        bytes[absolute >>> 3] |= mask;
      } else {
        bytes[absolute >>> 3] &= ~mask;
      }
      remaining >>>= 1;
    }
  }

  function readBits(bytes, bitOffset, bitCount) {
    let value = 0;
    for (let bit = 0; bit < bitCount; bit += 1) {
      const absolute = bitOffset + bit;
      value |= ((bytes[absolute >>> 3] >>> (absolute & 7)) & 1) << bit;
    }
    return value >>> 0;
  }

  function sixValues(values, normalizer) {
    return Array.from({ length: PARTY_SLOTS }, (_, slot) => normalizer(values && values[slot]));
  }

  function twentyFourMoves(moves) {
    if (Array.isArray(moves) && moves.length === PARTY_SLOTS && Array.isArray(moves[0])) {
      return moves.flatMap((row) =>
        Array.from({ length: MOVES_PER_SLOT }, (_, moveSlot) => normalizedId(row && row[moveSlot]))
      );
    }
    return Array.from({ length: PARTY_SLOTS * MOVES_PER_SLOT }, (_, index) =>
      normalizedId(moves && moves[index])
    );
  }

  function packRecord(record) {
    const out = new Uint8Array(RECORD_SIZE);
    const count = Math.min(PARTY_SLOTS, Math.max(0, Number(record && record.playerCount) || 0));
    const species = sixValues(record && record.playerSpecies, normalizedId);
    const playerCredits = sixValues(
      record && (record.playerKoCreditsByEnemy || record.playerKoCredit),
      normalizedCredit
    );
    const aiCredits = sixValues(
      record && (record.aiKoCreditsByPlayer || record.aiKoCredit),
      normalizedCredit
    );
    const heldItems = sixValues(record && record.heldItems, normalizedId);
    const moves = twentyFourMoves(record && record.moves);

    writeBits(out, BIT_OFFSETS.trainerId, 10, normalizedId(record && record.trainerId));
    writeBits(out, BIT_OFFSETS.playerCount, 3, count);
    for (let slot = 0; slot < PARTY_SLOTS; slot += 1) {
      writeBits(out, BIT_OFFSETS.playerSpecies + slot * 10, 10, species[slot]);
      writeBits(out, BIT_OFFSETS.playerKoCredit + slot * 3, 3, playerCredits[slot]);
      writeBits(out, BIT_OFFSETS.aiKoCredit + slot * 3, 3, aiCredits[slot]);
      writeBits(out, BIT_OFFSETS.heldItems + slot * 10, 10, heldItems[slot]);
    }
    for (let index = 0; index < moves.length; index += 1) {
      writeBits(out, BIT_OFFSETS.moves + index * 10, 10, moves[index]);
    }
    return out;
  }

  function unpackRecord(bytes, offset = 0) {
    if (!bytes || offset < 0 || offset + RECORD_SIZE > bytes.length) {
      throw new Error("Battle-log record is truncated.");
    }
    const record = bytes.slice(offset, offset + RECORD_SIZE);
    const flatMoves = Array.from({ length: PARTY_SLOTS * MOVES_PER_SLOT }, (_, index) =>
      readBits(record, BIT_OFFSETS.moves + index * 10, 10)
    );
    return {
      trainerId: readBits(record, BIT_OFFSETS.trainerId, 10),
      playerCount: readBits(record, BIT_OFFSETS.playerCount, 3),
      playerSpecies: Array.from({ length: PARTY_SLOTS }, (_, slot) =>
        readBits(record, BIT_OFFSETS.playerSpecies + slot * 10, 10)
      ),
      playerKoCreditsByEnemy: Array.from({ length: PARTY_SLOTS }, (_, slot) =>
        readBits(record, BIT_OFFSETS.playerKoCredit + slot * 3, 3)
      ),
      aiKoCreditsByPlayer: Array.from({ length: PARTY_SLOTS }, (_, slot) =>
        readBits(record, BIT_OFFSETS.aiKoCredit + slot * 3, 3)
      ),
      heldItems: Array.from({ length: PARTY_SLOTS }, (_, slot) =>
        readBits(record, BIT_OFFSETS.heldItems + slot * 10, 10)
      ),
      moves: Array.from({ length: PARTY_SLOTS }, (_, slot) =>
        flatMoves.slice(slot * MOVES_PER_SLOT, (slot + 1) * MOVES_PER_SLOT)
      ),
    };
  }

  // Nitro's MATH_CalcCRC16CCITT uses the CCITT polynomial with a 0xFFFF seed.
  function crc16Ccitt(bytes) {
    let crc = 0xffff;
    for (const byte of bytes) {
      crc ^= byte << 8;
      for (let bit = 0; bit < 8; bit += 1) {
        crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
      }
    }
    return crc;
  }

  function updateSectorChecksum(sector) {
    writeU16(sector, CHECKSUM_OFFSET, 0);
    writeU16(sector, CHECKSUM_OFFSET, crc16Ccitt(sector));
    return sector;
  }

  function hasValidChecksum(sector) {
    if (!sector || sector.length !== SECTOR_SIZE) {
      return false;
    }
    const stored = readU16(sector, CHECKSUM_OFFSET);
    const copy = new Uint8Array(sector);
    writeU16(copy, CHECKSUM_OFFSET, 0);
    return stored === crc16Ccitt(copy);
  }

  function createLogPage(pageIndex, flags = 0) {
    if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex >= LOG_SECTORS.length) {
      throw new Error(`Invalid battle-log page index ${pageIndex}.`);
    }
    const out = new Uint8Array(SECTOR_SIZE);
    writeU32(out, 0, LOG_MAGIC);
    writeU16(out, 4, VERSION);
    out[6] = pageIndex;
    out[7] = LOG_SECTORS.length;
    writeU16(out, 8, RECORD_SIZE);
    writeU16(out, 10, PAGE_CAPACITIES[pageIndex]);
    writeU16(out, 12, 0);
    writeU16(out, 14, flags);
    return updateSectorChecksum(out);
  }

  function validateLogPage(page, pageIndex) {
    return Boolean(
      page
      && page.length === SECTOR_SIZE
      && readU32(page, 0) === LOG_MAGIC
      && readU16(page, 4) === VERSION
      && page[6] === pageIndex
      && page[7] === LOG_SECTORS.length
      && readU16(page, 8) === RECORD_SIZE
      && readU16(page, 10) === PAGE_CAPACITIES[pageIndex]
      && readU16(page, 12) <= PAGE_CAPACITIES[pageIndex]
      && hasValidChecksum(page)
    );
  }

  function createAggregatePage(sourceRecordCount = 0, counts) {
    const out = new Uint8Array(SECTOR_SIZE);
    writeU32(out, 0, FRAG_MAGIC);
    writeU16(out, 4, VERSION);
    writeU16(out, 6, SPECIES_CAPACITY);
    writeU16(out, 8, Math.min(MAX_RECORDS, Math.max(0, sourceRecordCount | 0)));
    for (let species = 0; species < SPECIES_CAPACITY; species += 1) {
      const count = Math.min(0xffff, Math.max(0, Number(counts && counts[species]) || 0));
      writeU16(out, HEADER_SIZE + species * 2, count);
    }
    return updateSectorChecksum(out);
  }

  function validateAggregatePage(page) {
    return Boolean(
      page
      && page.length === SECTOR_SIZE
      && readU32(page, 0) === FRAG_MAGIC
      && readU16(page, 4) === VERSION
      && readU16(page, 6) === SPECIES_CAPACITY
      && readU16(page, 8) <= MAX_RECORDS
      && hasValidChecksum(page)
    );
  }

  function normalizedLogPages(pages) {
    return LOG_SECTORS.map((_, pageIndex) => {
      const page = pages && pages[pageIndex];
      return validateLogPage(page, pageIndex)
        ? new Uint8Array(page)
        : createLogPage(pageIndex);
    });
  }

  function appendRecordsToPages(pages, records) {
    const encoded = Array.from(records || [], (record) =>
      record instanceof Uint8Array ? new Uint8Array(record) : packRecord(record)
    );
    for (const record of encoded) {
      if (record.length !== RECORD_SIZE) {
        throw new Error(`Battle-log record must be ${RECORD_SIZE} bytes.`);
      }
    }

    const output = normalizedLogPages(pages);
    const available = output.reduce(
      (sum, page, pageIndex) => sum + PAGE_CAPACITIES[pageIndex] - readU16(page, 12),
      0
    );
    if (encoded.length > available) {
      const overflowPage = output[output.length - 1];
      writeU16(overflowPage, 14, readU16(overflowPage, 14) | 1);
      updateSectorChecksum(overflowPage);
      return { pages: output, appended: false, overflow: true, count: 0 };
    }

    let recordIndex = 0;
    for (let pageIndex = 0; pageIndex < output.length && recordIndex < encoded.length; pageIndex += 1) {
      const page = output[pageIndex];
      let count = readU16(page, 12);
      let changed = false;
      while (count < PAGE_CAPACITIES[pageIndex] && recordIndex < encoded.length) {
        page.set(encoded[recordIndex], HEADER_SIZE + count * RECORD_SIZE);
        count += 1;
        recordIndex += 1;
        changed = true;
      }
      if (changed) {
        writeU16(page, 12, count);
        updateSectorChecksum(page);
      }
    }
    return { pages: output, appended: true, overflow: false, count: encoded.length };
  }

  function recordsFromLogPages(pages) {
    const records = [];
    for (let pageIndex = 0; pageIndex < LOG_SECTORS.length; pageIndex += 1) {
      const page = pages && pages[pageIndex];
      if (!validateLogPage(page, pageIndex)) {
        continue;
      }
      const count = readU16(page, 12);
      for (let recordIndex = 0; recordIndex < count; recordIndex += 1) {
        records.push(unpackRecord(page, HEADER_SIZE + recordIndex * RECORD_SIZE));
      }
    }
    return records;
  }

  function aggregateCountsFromPages(pages) {
    const records = recordsFromLogPages(pages);
    const counts = new Uint16Array(SPECIES_CAPACITY);
    for (const record of records) {
      for (let enemySlot = 0; enemySlot < PARTY_SLOTS; enemySlot += 1) {
        const creditedPlayerSlot = record.playerKoCreditsByEnemy[enemySlot] - 1;
        if (creditedPlayerSlot < 0 || creditedPlayerSlot >= record.playerCount) {
          continue;
        }
        const species = record.playerSpecies[creditedPlayerSlot];
        if (species > 0 && species < SPECIES_CAPACITY) {
          counts[species] = Math.min(0xffff, counts[species] + 1);
        }
      }
    }
    return { records, counts };
  }

  function rebuildAggregatePage(pages) {
    const aggregate = aggregateCountsFromPages(pages);
    return createAggregatePage(aggregate.records.length, aggregate.counts);
  }

  function parseEvolutionMembers(members) {
    if (!Array.isArray(members) || members.length < 2 || members.length > SPECIES_CAPACITY) {
      throw new Error("Evolution NARC has an unsupported member count.");
    }
    const edges = Array.from({ length: members.length }, () => []);
    for (let source = 0; source < members.length; source += 1) {
      const member = members[source];
      if (!member || (member.length !== 42 && member.length !== 44)) {
        throw new Error(`Evolution member ${source} is neither a 42-byte table nor Platinum's 44-byte padded table.`);
      }
      for (let entry = 0; entry < 7; entry += 1) {
        const at = entry * 6;
        const method = readU16(member, at);
        const target = readU16(member, at + 4);
        if (method === 0 && target === 0) {
          continue;
        }
        if (method === 0 || target <= 0 || target >= members.length) {
          throw new Error(`Evolution ${source}:${entry} has invalid target ${target}.`);
        }
        if (!edges[source].includes(target)) {
          edges[source].push(target);
        }
      }
      edges[source].sort((a, b) => a - b);
    }
    return edges;
  }

  function buildAncestryMember(evolutionMembers) {
    const edges = parseEvolutionMembers(evolutionMembers);
    const state = new Uint8Array(edges.length);
    function visit(species) {
      if (state[species] === 1) {
        throw new Error(`Evolution mappings contain a cycle at species ${species}.`);
      }
      if (state[species] === 2) {
        return;
      }
      state[species] = 1;
      for (const target of edges[species]) {
        visit(target);
      }
      state[species] = 2;
    }
    for (let species = 0; species < edges.length; species += 1) {
      visit(species);
    }

    const reverse = Array.from({ length: edges.length }, () => []);
    for (let source = 0; source < edges.length; source += 1) {
      for (const target of edges[source]) {
        reverse[target].push(source);
      }
    }
    const stride = Math.ceil(edges.length / 8);
    const out = new Uint8Array(16 + edges.length * stride);
    writeU32(out, 0, ANCESTRY_MAGIC);
    writeU16(out, 4, VERSION);
    writeU16(out, 6, edges.length);
    writeU16(out, 8, stride);
    writeU16(out, 10, 16);

    for (let species = 0; species < edges.length; species += 1) {
      const seen = new Uint8Array(edges.length);
      const stack = [species];
      while (stack.length) {
        const ancestor = stack.pop();
        if (seen[ancestor]) {
          continue;
        }
        seen[ancestor] = 1;
        const rowAt = 16 + species * stride;
        out[rowAt + (ancestor >>> 3)] |= 1 << (ancestor & 7);
        for (const parent of reverse[ancestor]) {
          stack.push(parent);
        }
      }
    }
    return { bytes: out, speciesCount: edges.length, stride };
  }

  function ancestryHeader(bytes) {
    if (!bytes || bytes.length < 16 || readU32(bytes, 0) !== ANCESTRY_MAGIC) {
      return null;
    }
    const speciesCount = readU16(bytes, 6);
    const stride = readU16(bytes, 8);
    const headerSize = readU16(bytes, 10);
    if (
      readU16(bytes, 4) !== VERSION
      || speciesCount < 2
      || speciesCount > SPECIES_CAPACITY
      || stride !== Math.ceil(speciesCount / 8)
      || headerSize !== 16
      || headerSize + speciesCount * stride !== bytes.length
    ) {
      return null;
    }
    return { speciesCount, stride, headerSize };
  }

  return {
    VERSION,
    PARTY_SLOTS,
    MOVES_PER_SLOT,
    RECORD_SIZE,
    HEADER_SIZE,
    SECTOR_SIZE,
    MAX_RECORDS,
    MAX_ID,
    SPECIES_CAPACITY,
    LOG_MAGIC,
    FRAG_MAGIC,
    ANCESTRY_MAGIC,
    CHECKSUM_OFFSET,
    LOG_SECTORS,
    AGGREGATE_SECTOR,
    RESERVED_SECTORS,
    PAGE_CAPACITIES,
    BIT_OFFSETS,
    readU16,
    readU32,
    writeU16,
    writeU32,
    writeBits,
    readBits,
    packRecord,
    unpackRecord,
    crc16Ccitt,
    updateSectorChecksum,
    hasValidChecksum,
    createLogPage,
    validateLogPage,
    createAggregatePage,
    validateAggregatePage,
    normalizedLogPages,
    appendRecordsToPages,
    recordsFromLogPages,
    aggregateCountsFromPages,
    rebuildAggregatePage,
    parseEvolutionMembers,
    buildAncestryMember,
    ancestryHeader,
  };
});
