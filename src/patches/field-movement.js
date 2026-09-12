(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    const assembler = require("../asm/armips-assembler.js");
    const templates = require("../asm/templates.js");
    module.exports = (core) => factory(core, assembler, templates);
    return;
  }
  root.PlatinumPatcherFieldMovementPatches = factory(
    root.PlatinumPatcherCore,
    root.PlatinumPatcherArmipsAssembler,
    root.PlatinumPatcherAsmTemplates
  );
})(typeof globalThis !== "undefined" ? globalThis : this, function (core, assembler, asmTemplates) {
  "use strict";

  if (!core) {
    throw new Error("PlatinumPatcherCore failed to load for field-movement patches.");
  }
  if (!assembler || !asmTemplates) {
    throw new Error("armips assembler failed to load for field-movement patches.");
  }

  const {
    PatchError,
    SyntheticOverlayAllocator,
    arm9Offset,
    asciiBytes,
    bytesFromHex,
    findNeedle,
    getOverlayRange,
    hex,
    locateNearby,
    readU32,
    requireBytes,
    writeBytes,
    writeU32,
  } = core;

  const MARKER = asciiBytes("MOVESPEEDV2\0\0\0\0\0");
  const RUN_ANIMATION_MARKER = asciiBytes("RUNANIMV1\0\0\0\0\0\0\0");
  const WALK_RENDERERS = bytesFromHex(
    "45 bb 1e 02 b5 bb 1e 02 b5 bb 1e 02 29 bc 1e 02 " +
    "7d bc 1e 02 d1 bc 1e 02 25 bd 1e 02 c5 bd 1e 02 5d be 1e 02"
  );
  const VANILLA_RUN_RENDERER = 0x021ebefd;
  const RUN_DISPATCH_CALLS = [
    { ramAddress: 0x0205febe, original: bytesFromHex("00 f0 51 fe"), label: "field run dispatch" },
    { ramAddress: 0x0205fffe, original: bytesFromHex("00 f0 b1 fd"), label: "Distortion World run dispatch" },
  ];
  const VISUAL_TIER_CALL = {
    ramAddress: 0x020659b2,
    original: bytesFromHex("fd f7 2b f8"),
    label: "movement visual tier",
  };

  const LEGACY_POINTER_PATCHES = [
    [0x020ef53c, 0x02065abd, 0x02065b11],
    [0x020ef530, 0x02065ad5, 0x02065b25],
    [0x020ef524, 0x02065ae9, 0x02065b39],
    [0x020ef518, 0x02065afd, 0x02065b4d],
    [0x020ef50c, 0x02065b11, 0x02065b61],
    [0x020ef500, 0x02065b25, 0x02065b79],
    [0x020ef4f4, 0x02065b39, 0x02065b8d],
    [0x020ef4e8, 0x02065b4d, 0x02065ba1],
    [0x020ef4dc, 0x02065b61, 0x02065bb9],
    [0x020ef4d0, 0x02065b79, 0x02065bcd],
    [0x020ef4c4, 0x02065b8d, 0x02065be1],
    [0x020ef4b8, 0x02065ba1, 0x02065bf5],
    [0x020ef194, 0x02065c0d, 0x02065b61],
    [0x020ef224, 0x02065c25, 0x02065b79],
    [0x020ef440, 0x02065c39, 0x02065b8d],
    [0x020ef470, 0x02065c4d, 0x02065ba1],
  ];

  const ACTION_PATCHES = [
    [0x0205fe22, "0c 24", "10 24", "walk base action"],
    [0x0205fe3e, "58 24", "14 24", "run base action"],
    [0x0205ff92, "0c 27", "10 27", "Distortion World walk base action"],
    [0x0205ffb0, "58 27", "14 27", "Distortion World run base action"],
    [0x020603c0, "01 21", "03 21", "bicycle acceleration increment"],
  ];

  const LEGACY_BIKE_ACTIONS = [
    [0x02060394, "4c 24", "50 24", "bike default action"],
    [0x020603a8, "10 24", "14 24", "bike low-speed action"],
    [0x020603ac, "50 24", "14 24", "bike middle-speed action"],
    [0x020603b0, "14 24", "54 24", "bike high-speed action"],
  ];

  const INTERIM_RUN_HANDLERS = [
    {
      ramAddress: 0x02065c0c,
      label: "run north handler",
      original: bytesFromHex(
        "08 b5 09 21 01 22 00 91 00 21 92 03 04 23 ff f7 b1 fe 01 20 08 bd"
      ),
      interim: bytesFromHex(
        "08 b5 09 21 02 22 00 91 00 21 92 03 02 23 ff f7 b1 fe 01 20 08 bd"
      ),
    },
    {
      ramAddress: 0x02065c24,
      label: "run south handler",
      original: bytesFromHex(
        "08 b5 09 21 00 91 01 21 8a 03 04 23 ff f7 a6 fe 01 20 08 bd"
      ),
      interim: bytesFromHex(
        "08 b5 09 21 00 91 02 21 8a 03 02 23 ff f7 a6 fe 01 20 08 bd"
      ),
    },
    {
      ramAddress: 0x02065c38,
      label: "run west handler",
      original: bytesFromHex(
        "08 b5 09 21 00 91 02 21 4a 03 04 23 ff f7 9c fe 01 20 08 bd"
      ),
      interim: bytesFromHex(
        "08 b5 09 21 00 91 04 21 4a 03 02 23 ff f7 9c fe 01 20 08 bd"
      ),
    },
    {
      ramAddress: 0x02065c4c,
      label: "run east handler",
      original: bytesFromHex(
        "08 b5 09 21 01 22 00 91 03 21 92 03 04 23 ff f7 91 fe 01 20 08 bd"
      ),
      interim: bytesFromHex(
        "08 b5 09 21 02 22 00 91 03 21 92 03 02 23 ff f7 91 fe 01 20 08 bd"
      ),
    },
  ];

  const PLAYER_AVATAR_SET_ACTION = 0x0205ec20;
  const LOCAL_MAP_OBJECT_SET_ANIMATION = 0x02065638;
  const PLAYER_MOVEMENT_DISPATCH = 0x02060b64;

  function thumbBl(fromAddress, toAddress) {
    const offset = toAddress - (fromAddress + 4);
    if (offset % 2 !== 0 || offset < -0x400000 || offset > 0x3ffffe) {
      throw new PatchError(`Cannot encode Thumb BL from ${hex(fromAddress)} to ${hex(toAddress)}.`);
    }
    const first = 0xf000 | ((offset >> 12) & 0x7ff);
    const second = 0xf800 | ((offset >> 1) & 0x7ff);
    return new Uint8Array([first & 0xff, first >> 8, second & 0xff, second >> 8]);
  }

  async function buildMovementSpeedPayload(payloadAddress) {
    const runDispatchAddress = payloadAddress + MARKER.length;
    const visualTierAddress = runDispatchAddress + 0x60;
    let helper;
    try {
      helper = await assembler.assembleArmips({
        source: asmTemplates.movementSpeedHelper({
          runDispatchAddress,
          visualTierAddress,
          playerAvatarSetActionAddress: PLAYER_AVATAR_SET_ACTION,
          localMapObjectSetAnimationAddress: LOCAL_MAP_OBJECT_SET_ANIMATION,
          playerMovementDispatchAddress: PLAYER_MOVEMENT_DISPATCH,
        }),
      });
    } catch (error) {
      throw new PatchError(`Faster movement armips helper assembly failed: ${error.message}`);
    }

    const bytes = new Uint8Array(MARKER.length + helper.length);
    bytes.set(MARKER);
    bytes.set(helper, MARKER.length);
    return { bytes, runDispatchAddress, visualTierAddress };
  }

  function restoreInterimRunHandlers(rom, force) {
    let restored = 0;
    for (const handler of INTERIM_RUN_HANDLERS) {
      const preferredOffset = arm9Offset(rom, handler.ramAddress, handler.original.length);
      const located = locateNearby(
        rom,
        preferredOffset,
        handler.original,
        handler.interim,
        0x40,
        `Faster movement ${handler.label} repair`
      );
      const state = requireBytes(
        rom,
        located.offset,
        handler.original,
        handler.interim,
        force,
        `Faster movement ${handler.label} repair`
      );
      if (state === "already") {
        writeBytes(rom, located.offset, handler.original);
        restored += 1;
      }
    }
    return restored;
  }

  async function patchRunAnimation(rom, allocator, force) {
    const overlay = getOverlayRange(rom, 5);
    const matches = findNeedle(rom, WALK_RENDERERS, overlay.start, overlay.end);
    if (matches.length !== 1 || matches[0] + WALK_RENDERERS.length + 4 > overlay.end) {
      throw new PatchError(
        `Faster movement: expected one active Overlay 5 walking renderer table, found ${matches.length}.`
      );
    }
    // Separate allocation keeps existing MOVESPEEDV2 payloads from growing into another patch.
    const allocation = await allocator.allocateAsync({
      marker: "RUNANIMV1",
      label: "Faster movement run animation",
      alignment: 0x10,
      updateExisting: true,
      buildPayload: async (address) => {
        const helperAddress = address + RUN_ANIMATION_MARKER.length;
        const helper = await assembler.assembleArmips({
          source: asmTemplates.movementRunAnimationHelper({ helperAddress }),
        });
        const bytes = new Uint8Array(RUN_ANIMATION_MARKER.length + helper.length);
        bytes.set(RUN_ANIMATION_MARKER);
        bytes.set(helper, RUN_ANIMATION_MARKER.length);
        return { bytes, helperAddress };
      },
    });
    const original = new Uint8Array(4);
    const patched = new Uint8Array(4);
    writeU32(original, 0, VANILLA_RUN_RENDERER);
    writeU32(patched, 0, allocation.built.helperAddress | 1);
    const offset = matches[0] + WALK_RENDERERS.length;
    const state = requireBytes(rom, offset, original, patched, force, "Faster movement run renderer");
    if (state !== "already") {
      writeBytes(rom, offset, patched);
    }
    return state !== "already";
  }

  function restoreLegacyBikeActions(rom, force) {
    let restored = 0;
    for (const [ramAddress, originalHex, legacyHex, label] of LEGACY_BIKE_ACTIONS) {
      const original = bytesFromHex(originalHex);
      const legacy = bytesFromHex(legacyHex);
      const preferredOffset = arm9Offset(rom, ramAddress, original.length);
      const located = locateNearby(
        rom,
        preferredOffset,
        original,
        legacy,
        0x20,
        `Faster movement ${label} repair`
      );
      const state = requireBytes(
        rom,
        located.offset,
        original,
        legacy,
        force,
        `Faster movement ${label} repair`
      );
      if (state === "already") {
        writeBytes(rom, located.offset, original);
        restored += 1;
      }
    }
    return restored;
  }

  async function patchMovementSpeed(rom, force, log) {
    let revertedPointers = 0;
    for (const [ramAddress, original, legacy] of LEGACY_POINTER_PATCHES) {
      const offset = arm9Offset(rom, ramAddress, 4);
      if (readU32(rom, offset) === legacy) {
        writeU32(rom, offset, original);
        revertedPointers += 1;
      }
    }

    const restoredRunHandlers = restoreInterimRunHandlers(rom, force);
    const restoredBikeActions = restoreLegacyBikeActions(rom, force);

    let constantsChanged = 0;
    for (const [ramAddress, originalHex, patchedHex, label] of ACTION_PATCHES) {
      const original = bytesFromHex(originalHex);
      const patched = bytesFromHex(patchedHex);
      const preferredOffset = arm9Offset(rom, ramAddress, original.length);
      const located = locateNearby(
        rom,
        preferredOffset,
        original,
        patched,
        0x30,
        `Faster movement ${label}`
      );
      const state = requireBytes(
        rom,
        located.offset,
        original,
        patched,
        force,
        `Faster movement ${label}`
      );
      if (state !== "already") {
        writeBytes(rom, located.offset, patched);
        constantsChanged += 1;
      }
    }

    const allocator = new SyntheticOverlayAllocator(rom, log);
    const allocation = await allocator.allocateAsync({
      marker: "MOVESPEEDV2",
      buildPayload: buildMovementSpeedPayload,
      label: "Faster movement",
      alignment: 0x10,
      updateExisting: true,
    });

    let hooksChanged = 0;
    for (const call of RUN_DISPATCH_CALLS) {
      const patched = thumbBl(call.ramAddress, allocation.built.runDispatchAddress);
      const offset = arm9Offset(rom, call.ramAddress, call.original.length);
      const state = requireBytes(
        rom,
        offset,
        call.original,
        patched,
        force,
        `Faster movement ${call.label} hook`
      );
      if (state !== "already") {
        writeBytes(rom, offset, patched);
        hooksChanged += 1;
      }
    }

    const visualPatched = thumbBl(VISUAL_TIER_CALL.ramAddress, allocation.built.visualTierAddress);
    const visualOffset = arm9Offset(rom, VISUAL_TIER_CALL.ramAddress, VISUAL_TIER_CALL.original.length);
    const visualState = requireBytes(
      rom,
      visualOffset,
      VISUAL_TIER_CALL.original,
      visualPatched,
      force,
      `Faster movement ${VISUAL_TIER_CALL.label} hook`
    );
    if (visualState !== "already") {
      writeBytes(rom, visualOffset, visualPatched);
      hooksChanged += 1;
    }

    if (await patchRunAnimation(rom, allocator, force)) {
      hooksChanged += 1;
    }

    const repairs = revertedPointers + restoredRunHandlers + restoredBikeActions;
    log.push(
      `Faster movement: ${
        constantsChanged || hooksChanged ? "patched" : "already patched"
      } stable walk/run motion, continuous running animation, and native bicycle acceleration; helper at synthetic-overlay RAM ${hex(
        allocation.built.runDispatchAddress
      )}.${repairs ? ` Repaired ${repairs} unsafe legacy edit(s).` : ""}`
    );
  }

  return {
    movementSpeed: patchMovementSpeed,
  };
});
