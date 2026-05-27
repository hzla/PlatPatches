(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory;
    return;
  }
  root.PlatinumPatcherFrameRatePatches = factory(root.PlatinumPatcherCore);
})(typeof globalThis !== "undefined" ? globalThis : this, function (core) {
  "use strict";

  if (!core) {
    throw new Error("PlatinumPatcherCore failed to load for frame-rate patches.");
  }

  const {
    PatchError,
    hex,
    bytesFromHex,
    bytesEqual,
    writeBytes,
    getArm9Info,
    arm9Offset,
    findNeedle,
  } = core;

  function thumbInst16(value) {
    return [value & 0xff, (value >>> 8) & 0xff];
  }

  function thumbBl(fromAddress, toAddress) {
    const offset = toAddress - (fromAddress + 4);
    if (offset % 2 !== 0 || offset < -0x400000 || offset > 0x3ffffe) {
      throw new PatchError(`Cannot encode Thumb BL from ${hex(fromAddress)} to ${hex(toAddress)}.`);
    }
    const first = 0xf000 | ((offset >> 12) & 0x7ff);
    const second = 0xf800 | ((offset >> 1) & 0x7ff);
    return [first & 0xff, first >> 8, second & 0xff, second >> 8];
  }

  function thumbCondBranch(fromAddress, toAddress, condition) {
    const offset = toAddress - (fromAddress + 4);
    if (offset % 2 !== 0 || offset < -256 || offset > 254) {
      throw new PatchError(`Cannot encode Thumb conditional branch from ${hex(fromAddress)} to ${hex(toAddress)}.`);
    }
    return thumbInst16(0xd000 | (condition << 8) | ((offset >> 1) & 0xff));
  }

  function decodeThumbBl(fromAddress, bytes, offset) {
    if (offset < 0 || offset + 4 > bytes.length) {
      return null;
    }
    const first = bytes[offset] | (bytes[offset + 1] << 8);
    const second = bytes[offset + 2] | (bytes[offset + 3] << 8);
    if ((first & 0xf800) !== 0xf000 || (second & 0xf800) !== 0xf800) {
      return null;
    }
    let immediate = ((first & 0x7ff) << 12) | ((second & 0x7ff) << 1);
    if (immediate & 0x400000) {
      immediate |= 0xff800000;
    }
    return (fromAddress + 4 + immediate) >>> 0;
  }

  function frameRateModeOption(options) {
    return options && options.frameRateMode === "global" ? "global" : "battle";
  }

  const FRAME_RATE_HOOK_RAM = 0x02000df2;
  const FRAME_RATE_CAVE_RAM = 0x020f93d0;
  const FRAME_RATE_BATTLE_SIGNATURE_RAM = 0x0224a948;
  const FRAME_RATE_BATTLE_SIGNATURE_VALUE = 0x2801;
  const FRAME_RATE_HOOK_ORIGINAL = bytesFromHex("e0 6a 40 1c e0 62 25 63");
  const FRAME_RATE_HOOK_GLOBAL = bytesFromHex("e0 6a 40 1c e0 62 00 00");
  const FRAME_RATE_HOOK_TAIL = bytesFromHex("c0 46 c0 46");

  function buildFrameRateBattleHelper(helperAddress) {
    const out = [];
    const literalFixups = [];

    function here() {
      return helperAddress + out.length;
    }
    function emit16(value) {
      out.push(value & 0xff, (value >>> 8) & 0xff);
    }
    function emitU32(value) {
      out.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
    }
    function ldrLiteral(register, value) {
      literalFixups.push({ offset: out.length, at: here(), register, value });
      emit16(0);
    }

    emit16(0x6ae0); // ldr r0, [r4, #0x2c]
    emit16(0x1c40); // adds r0, #1
    emit16(0x62e0); // str r0, [r4, #0x2c]
    ldrLiteral(1, FRAME_RATE_BATTLE_SIGNATURE_RAM);
    emit16(0x8809); // ldrh r1, [r1]
    ldrLiteral(0, FRAME_RATE_BATTLE_SIGNATURE_VALUE);
    emit16(0x4281); // cmp r1, r0
    const beqAt = here();
    const beqOffset = out.length;
    emit16(0);
    emit16(0x6325); // str r5, [r4, #0x30]
    const doneAddress = here();
    emit16(0x4770); // bx lr

    while (out.length % 4 !== 0) {
      out.push(0);
    }

    const literalAddresses = new Map();
    for (const fixup of literalFixups) {
      if (!literalAddresses.has(fixup.value)) {
        literalAddresses.set(fixup.value, here());
        emitU32(fixup.value);
      }
    }

    const beq = thumbCondBranch(beqAt, doneAddress, 0);
    out[beqOffset] = beq[0];
    out[beqOffset + 1] = beq[1];

    for (const fixup of literalFixups) {
      const literalAddress = literalAddresses.get(fixup.value);
      const pcBase = (fixup.at + 4) & ~3;
      const literalOffset = literalAddress - pcBase;
      if (literalOffset < 0 || literalOffset > 1020 || literalOffset % 4 !== 0) {
        throw new Error("internal framerate literal is out of range");
      }
      const inst = 0x4800 | (fixup.register << 8) | (literalOffset / 4);
      out[fixup.offset] = inst & 0xff;
      out[fixup.offset + 1] = (inst >>> 8) & 0xff;
    }

    return new Uint8Array(out);
  }

  function frameRateBattleHook(hookAddress, helperAddress) {
    return new Uint8Array([...thumbBl(hookAddress, helperAddress), ...FRAME_RATE_HOOK_TAIL]);
  }

  function frameRateBattleHookInfo(rom, hookAt, hookAddress, arm9) {
    if (!bytesEqual(rom, hookAt + 4, FRAME_RATE_HOOK_TAIL)) {
      return null;
    }
    const helperAddress = decodeThumbBl(hookAddress, rom, hookAt);
    if (helperAddress == null) {
      return null;
    }
    const helperAt = arm9.fileOffset + (helperAddress - arm9.loadAddress);
    const helper = buildFrameRateBattleHelper(helperAddress);
    if (
      helperAt < arm9.fileOffset ||
      helperAt + helper.length > arm9.fileOffset + arm9.size ||
      !bytesEqual(rom, helperAt, helper)
    ) {
      return null;
    }
    return { helperAddress, helperAt, helper };
  }

  function findAlignedFillRun(data, start, end, value, size, preferredOffset, alignment = 4) {
    const runs = [];
    let i = start;
    while (i <= end - size) {
      if (data[i] !== value) {
        i += 1;
        continue;
      }
      let j = i + 1;
      while (j < end && data[j] === value) {
        j += 1;
      }
      if (j - i >= size) {
        const alignedStart = (i + alignment - 1) & ~(alignment - 1);
        if (alignedStart + size <= j) {
          runs.push(alignedStart);
        }
      }
      i = j;
    }
    if (!runs.length) {
      return -1;
    }
    runs.sort((a, b) => Math.abs(a - preferredOffset) - Math.abs(b - preferredOffset));
    return runs[0];
  }

  function locateFrameRateHook(rom, preferredHookAt, label) {
    if (
      bytesEqual(rom, preferredHookAt, FRAME_RATE_HOOK_ORIGINAL) ||
      bytesEqual(rom, preferredHookAt, FRAME_RATE_HOOK_GLOBAL)
    ) {
      return { offset: preferredHookAt, usedFallback: false };
    }
    const hits = [
      ...findNeedle(rom, FRAME_RATE_HOOK_ORIGINAL, preferredHookAt - 0x200, preferredHookAt + 0x200),
      ...findNeedle(rom, FRAME_RATE_HOOK_GLOBAL, preferredHookAt - 0x200, preferredHookAt + 0x200),
    ];
    const uniqueHits = Array.from(new Set(hits));
    if (uniqueHits.length === 1) {
      return { offset: uniqueHits[0], usedFallback: true };
    }
    if (uniqueHits.length > 1) {
      throw new PatchError(
        `${label} fallback scan found multiple candidate offsets: ${uniqueHits.map(hex).join(", ")}.`
      );
    }
    return { offset: preferredHookAt, usedFallback: false };
  }

  function patchFrameRateUnlock(rom, force, log, options = {}) {
    const mode = frameRateModeOption(options);
    const label = `Unlock framerate (${mode === "global" ? "global" : "battle only"})`;
    const arm9 = getArm9Info(rom);
    const preferredHookAt = arm9Offset(rom, FRAME_RATE_HOOK_RAM, FRAME_RATE_HOOK_ORIGINAL.length);
    let hookAt = preferredHookAt;
    let usedFallback = false;
    let hookAddress = FRAME_RATE_HOOK_RAM;
    let battleInfo = frameRateBattleHookInfo(rom, hookAt, hookAddress, arm9);

    if (!battleInfo) {
      const located = locateFrameRateHook(rom, preferredHookAt, label);
      hookAt = located.offset;
      usedFallback = located.usedFallback;
      hookAddress = arm9.loadAddress + (hookAt - arm9.fileOffset);
      battleInfo = frameRateBattleHookInfo(rom, hookAt, hookAddress, arm9);
    }

    if (mode === "global") {
      if (bytesEqual(rom, hookAt, FRAME_RATE_HOOK_GLOBAL)) {
        log.push(
          `${label}: already patched at ARM9 file ${hex(hookAt)} / RAM ${hex(hookAddress)}${
            usedFallback ? " (fallback scan)" : ""
          }.`
        );
        return;
      }
      if (
        !bytesEqual(rom, hookAt, FRAME_RATE_HOOK_ORIGINAL) &&
        !battleInfo &&
        !force
      ) {
        const found = Array.from(rom.slice(hookAt, hookAt + FRAME_RATE_HOOK_ORIGINAL.length))
          .map((byte) => byte.toString(16).padStart(2, "0"))
          .join(" ");
        throw new PatchError(
          `${label} sanity check failed at ${hex(hookAt)}. Found ${found}. Enable compatible modified bytes to patch anyway.`
        );
      }
      writeBytes(rom, hookAt, FRAME_RATE_HOOK_GLOBAL);
      log.push(
        `${label}: ${battleInfo ? "replaced battle-only hook with global edit" : "patched"} at ARM9 file ${hex(
          hookAt
        )} / RAM ${hex(hookAddress)}${usedFallback ? " (fallback scan)" : ""}.`
      );
      return;
    }

    if (battleInfo) {
      log.push(
        `${label}: already patched at ARM9 file ${hex(hookAt)} / RAM ${hex(
          hookAddress
        )}; helper at ARM9 file ${hex(battleInfo.helperAt)} / RAM ${hex(
          battleInfo.helperAddress
        )}${usedFallback ? " (fallback scan)" : ""}.`
      );
      return;
    }

    const preferredHelper = buildFrameRateBattleHelper(FRAME_RATE_CAVE_RAM);
    const preferredCaveAt = arm9Offset(rom, FRAME_RATE_CAVE_RAM, preferredHelper.length);
    let caveAt = preferredCaveAt;
    let caveFillValue = 0x00;
    let caveFallback = false;

    if (
      !bytesEqual(rom, caveAt, new Uint8Array(preferredHelper.length).fill(0x00)) &&
      !bytesEqual(rom, caveAt, preferredHelper)
    ) {
      let dynamicCave = findAlignedFillRun(
        rom,
        arm9.fileOffset,
        arm9.fileOffset + arm9.size,
        0x00,
        preferredHelper.length,
        preferredCaveAt
      );
      if (dynamicCave === -1) {
        dynamicCave = findAlignedFillRun(
          rom,
          arm9.fileOffset,
          arm9.fileOffset + arm9.size,
          0xff,
          preferredHelper.length,
          preferredCaveAt
        );
        caveFillValue = 0xff;
      }
      if (dynamicCave !== -1) {
        caveAt = dynamicCave;
        caveFallback = caveAt !== preferredCaveAt;
      } else if (!force) {
        throw new PatchError(`${label} could not find a free ARM9 code cave.`);
      }
    }

    const helperAddress = arm9.loadAddress + (caveAt - arm9.fileOffset);
    const helper = buildFrameRateBattleHelper(helperAddress);
    const hook = frameRateBattleHook(hookAddress, helperAddress);
    const helperAlready = bytesEqual(rom, caveAt, helper);
    const replacedGlobal = bytesEqual(rom, hookAt, FRAME_RATE_HOOK_GLOBAL);
    const hookCompatible =
      bytesEqual(rom, hookAt, FRAME_RATE_HOOK_ORIGINAL) ||
      replacedGlobal;

    if (!hookCompatible && !force) {
      const found = Array.from(rom.slice(hookAt, hookAt + hook.length))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join(" ");
      throw new PatchError(
        `${label} hook sanity check failed at ${hex(hookAt)}. Found ${found}. Enable compatible modified bytes to patch anyway.`
      );
    }
    if (
      !helperAlready &&
      !bytesEqual(rom, caveAt, new Uint8Array(helper.length).fill(caveFillValue)) &&
      !force
    ) {
      throw new PatchError(
        `${label} code cave sanity check failed at ${hex(caveAt)}. Enable compatible modified bytes to patch anyway.`
      );
    }

    if (!helperAlready) {
      writeBytes(rom, caveAt, helper);
    }
    writeBytes(rom, hookAt, hook);

    const notes = [];
    if (usedFallback) {
      notes.push("hook fallback scan");
    }
    if (caveFallback) {
      notes.push(`code-cave fallback scan (${hex(caveFillValue)} fill)`);
    }
    if (replacedGlobal) {
      notes.push("updated from global");
    }
    log.push(
      `${label}: installed hook at ARM9 file ${hex(hookAt)} / RAM ${hex(
        hookAddress
      )}; helper at ARM9 file ${hex(caveAt)} / RAM ${hex(helperAddress)}${
        notes.length ? ` (${notes.join(", ")})` : ""
      }.`
    );
  }


  return {
    frameRate: patchFrameRateUnlock,
  };
});
