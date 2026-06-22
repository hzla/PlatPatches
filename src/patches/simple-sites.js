(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory;
  } else {
    root.PlatinumPatcherSimpleSitePatches = factory(root.PlatinumPatcherCore);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (core) {
  "use strict";

  if (!core) {
    throw new Error("Simple-site patches require PlatinumPatcherCore to load first.");
  }

  const {
    OVERLAY_5,
    OVERLAY_13,
    OVERLAY_14,
    OVERLAY_16,
    OVERLAY_84,
    PatchError,
    arm9Offset,
    bytesFromHex,
    getOverlayRange,
    hex,
    locateNearby,
    requireBytes,
    writeBytes,
  } = core;

function simpleSiteOffset(rom, site) {
  if (site.kind === "arm9") {
    return {
      offset: arm9Offset(rom, site.ramAddress, site.expected.length),
      addressLabel: `ARM9 RAM ${hex(site.ramAddress)}`,
    };
  }

  const overlay = getOverlayRange(rom, site.overlayId);
  const relativeOffset = site.ramAddress - overlay.loadAddress;
  if (
    relativeOffset < 0 ||
    overlay.start + relativeOffset + site.expected.length > overlay.end
  ) {
    throw new PatchError(
      `${site.label} at ${hex(site.ramAddress)} is outside overlay ${site.overlayId}.`
    );
  }
  return {
    overlay,
    offset: overlay.start + relativeOffset,
    relativeOffset,
    addressLabel: `overlay ${site.overlayId}+${hex(relativeOffset)}`,
  };
}

function patchSimpleSites(rom, force, log, label, sites) {
  let changed = 0;
  let fallbackCount = 0;
  const touched = [];

  for (const site of sites) {
    const locatedSite = simpleSiteOffset(rom, site);
    let located = { offset: locatedSite.offset, usedFallback: false };
    if (site.expected.length > 1 && site.fallbackRadius) {
      located = locateNearby(
        rom,
        locatedSite.offset,
        site.expected,
        site.patched,
        site.fallbackRadius,
        site.label
      );
    }

    const state = requireBytes(
      rom,
      located.offset,
      site.expected,
      site.patched,
      force,
      site.label
    );
    if (state !== "already") {
      writeBytes(rom, located.offset, site.patched);
      changed += 1;
    }
    if (located.usedFallback) {
      fallbackCount += 1;
    }

    if (site.kind === "overlay") {
      touched.push(`overlay ${site.overlayId}+${hex(located.offset - locatedSite.overlay.start)}`);
    } else {
      touched.push(`ARM9 RAM ${hex(site.ramAddress)}`);
    }
  }

  log.push(
    `${label}: ${changed ? `patched ${changed} site(s)` : "already patched"} at ${touched.join(
      ", "
    )}${fallbackCount ? ` (${fallbackCount} fallback scan${fallbackCount === 1 ? "" : "s"})` : ""}.`
  );
}

const REMOVE_EVS_SITES = [
  {
    kind: "overlay",
    overlayId: OVERLAY_16,
    ramAddress: 0x02249b7c,
    expected: bytesFromHex("fe 01 00 00"),
    patched: bytesFromHex("00 00 00 00"),
    fallbackRadius: 0x100,
    label: "Remove EV gain",
  },
];

const INSTANT_PARTY_HEALING_SITES = [
  {
    kind: "arm9",
    ramAddress: 0x02085734,
    expected: bytesFromHex("49 1c"),
    patched: bytesFromHex("21 46"),
    fallbackRadius: 0x80,
    label: "Instant party healing",
  },
];

const TIME_OF_DAY_EVOS_SITES = [
  {
    kind: "arm9",
    ramAddress: 0x02076dfa,
    expected: bytesFromHex("01 28 4f d1"),
    patched: bytesFromHex("00 00 00 00"),
    fallbackRadius: 0x80,
    label: "Time-of-day evolution check 1",
  },
  {
    kind: "arm9",
    ramAddress: 0x02076de2,
    expected: bytesFromHex("00 28 5b d1"),
    patched: bytesFromHex("00 00 00 00"),
    fallbackRadius: 0x80,
    label: "Time-of-day evolution check 2",
  },
];

const VS_SEEKER_QOL_SITES = [
  {
    kind: "overlay",
    overlayId: OVERLAY_5,
    ramAddress: 0x021dbbc4,
    expected: bytesFromHex("05 d2 71"),
    patched: bytesFromHex("64 26 31"),
    fallbackRadius: 0x100,
    label: "VS Seeker recharge/rematch check",
  },
  {
    kind: "overlay",
    overlayId: OVERLAY_5,
    ramAddress: 0x021dbd28,
    expected: bytesFromHex("32"),
    patched: bytesFromHex("64"),
    label: "VS Seeker rematch chance",
  },
];

const SURF_WATERFALL_CHECK_SITES = [
  {
    kind: "overlay",
    overlayId: OVERLAY_5,
    ramAddress: 0x021d1e78,
    expected: bytesFromHex("01 d0 02 20 06 43"),
    patched: bytesFromHex("00 00 02 20 06 43"),
    fallbackRadius: 0x100,
    label: "Waterfall descent HM party check",
  },
  {
    kind: "overlay",
    overlayId: OVERLAY_5,
    ramAddress: 0x021d2832,
    expected: bytesFromHex("82 f6 b5 f8"),
    patched: bytesFromHex("00 20 00 00"),
    fallbackRadius: 0x100,
    label: "Surf/Waterfall HM party check",
  },
];

const DRY_SKIN_AI_FIX_SITES = [
  {
    kind: "overlay",
    overlayId: OVERLAY_14,
    ramAddress: 0x022249cc,
    expected: bytesFromHex("1a"),
    patched: bytesFromHex("57"),
    label: "Dry Skin AI fix",
  },
];

const FORGETTABLE_HMS_SITES = [
  {
    kind: "overlay",
    overlayId: OVERLAY_13,
    ramAddress: 0x0222056e,
    expected: bytesFromHex("01 f0 35 fa 01 28"),
    patched: bytesFromHex("c0 46 00 20 01 28"),
    fallbackRadius: 0x100,
    label: "Forgettable HMs overlay check",
  },
  {
    kind: "arm9",
    ramAddress: 0x0208cdd2,
    expected: bytesFromHex("f0 f7 5b fa 01 28"),
    patched: bytesFromHex("c0 46 00 20 01 28"),
    fallbackRadius: 0x100,
    label: "Forgettable HMs ARM9 check",
  },
];

const INSTANT_POKERADAR_SITES = [
  {
    kind: "arm9",
    ramAddress: 0x02069a42,
    expected: bytesFromHex("32"),
    patched: bytesFromHex("00"),
    label: "Instant Pokeradar recharge",
  },
];

const INFINITE_TMS_SITES = [
  {
    kind: "overlay",
    overlayId: OVERLAY_84,
    ramAddress: 0x0223f912,
    expected: bytesFromHex("ff f7 83 ff"),
    patched: bytesFromHex("00 00 00 00"),
    fallbackRadius: 0x100,
    label: "Infinite TMs overlay consume call",
  },
  {
    kind: "arm9",
    ramAddress: 0x020865eb,
    expected: bytesFromHex("d1"),
    patched: bytesFromHex("e0"),
    label: "Infinite TMs ARM9 branch",
  },
];

function patchRemoveEVs(rom, force, log) {
  patchSimpleSites(rom, force, log, "Remove EV gain", REMOVE_EVS_SITES);
}

function patchInstantPartyHealing(rom, force, log) {
  patchSimpleSites(rom, force, log, "Instant party healing", INSTANT_PARTY_HEALING_SITES);
}

function patchTimeOfDayEvos(rom, force, log) {
  patchSimpleSites(rom, force, log, "Remove time evo clock checks", TIME_OF_DAY_EVOS_SITES);
}

function patchVsSeekerQol(rom, force, log) {
  patchSimpleSites(rom, force, log, "VS Seeker QoL", VS_SEEKER_QOL_SITES);
}

function patchRemoveSurfWaterfallChecks(rom, force, log) {
  patchSimpleSites(
    rom,
    force,
    log,
    "Remove Surf/Waterfall checks",
    SURF_WATERFALL_CHECK_SITES
  );
}

function patchDrySkinAiFix(rom, force, log) {
  patchSimpleSites(rom, force, log, "Dry Skin AI fix", DRY_SKIN_AI_FIX_SITES);
}

function patchForgettableHMs(rom, force, log) {
  patchSimpleSites(rom, force, log, "Forgettable HMs", FORGETTABLE_HMS_SITES);
}

function patchInstantPokeradar(rom, force, log) {
  patchSimpleSites(rom, force, log, "Instant Pokeradar recharge", INSTANT_POKERADAR_SITES);
}

function patchInfiniteTMs(rom, force, log) {
  patchSimpleSites(rom, force, log, "Infinite TMs", INFINITE_TMS_SITES);
}

  return {
    removeEVs: patchRemoveEVs,
    instantPartyHealing: patchInstantPartyHealing,
    timeOfDayEvos: patchTimeOfDayEvos,
    vsSeekerQol: patchVsSeekerQol,
    removeSurfWaterfallChecks: patchRemoveSurfWaterfallChecks,
    drySkinAiFix: patchDrySkinAiFix,
    forgettableHMs: patchForgettableHMs,
    instantPokeradar: patchInstantPokeradar,
    infiniteTMs: patchInfiniteTMs,
  };
});
