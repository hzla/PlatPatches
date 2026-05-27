(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory;
  } else {
    root.PlatinumPatcherTextSpeedPatches = factory(root.PlatinumPatcherCore);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (core) {
  "use strict";

  if (!core) {
    throw new Error("Text speed patches require PlatinumPatcherCore to load first.");
  }

  const {
    OVERLAY_16,
    PatchError,
    arm9Offset,
    bytesEqual,
    bytesFromHex,
    getArm9Info,
    hex,
    locateNearby,
    overlayOffset,
    padBytes,
    requireBytes,
    writeBytes,
  } = core;

function thumbInst16(value) {
  return [value & 0xff, (value >>> 8) & 0xff];
}

function thumbB(fromAddress, toAddress) {
  const offset = toAddress - (fromAddress + 4);
  if (offset % 2 !== 0 || offset < -2048 || offset > 2046) {
    throw new PatchError(`Cannot encode Thumb B from ${hex(fromAddress)} to ${hex(toAddress)}.`);
  }
  const imm11 = (offset >> 1) & 0x7ff;
  return thumbInst16(0xe000 | imm11);
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

function textCharsPerFrameOption(options) {
  const value = Number(options && options.textCharsPerFrame);
  if (!Number.isFinite(value)) {
    return 4;
  }
  return Math.max(2, Math.min(10, Math.trunc(value)));
}

function findFillRun(data, start, end, value, size, preferredOffset) {
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
      runs.push(i);
    }
    i = j;
  }
  if (!runs.length) {
    return -1;
  }
  runs.sort((a, b) => Math.abs(a - preferredOffset) - Math.abs(b - preferredOffset));
  return runs[0];
}

function patchInstantText(rom, force, log) {
  const stub = bytesFromHex("01 20 70 47");

  const optionsPreferred = arm9Offset(rom, 0x02027ac0, 0x1a);
  const optionsExpected = bytesFromHex(`
    08 b5 ff f7 ef ff 00 28 01 d1 08 20 08 bd 01 28 01 d1 04 20 08 bd 01 20 08 bd
  `);
  const optionsPatched = padBytes(stub, optionsExpected.length);
  const optionsLocated = locateNearby(
    rom,
    optionsPreferred,
    optionsExpected,
    optionsPatched,
    0x200,
    "Options text speed"
  );
  const optionsState = requireBytes(
    rom,
    optionsLocated.offset,
    optionsExpected,
    optionsPatched,
    force,
    "Options text speed"
  );
  if (optionsState !== "already") {
    writeBytes(rom, optionsLocated.offset, optionsPatched);
  }

  const battlePreferred = overlayOffset(rom, OVERLAY_16, 0x3cb0, 0x28);
  const battleExpected = bytesFromHex(`
    08 b5 c2 6a 04 21 11 42 06 d0 06 49 42 58 10 21
    11 42 01 d1 01 20 08 bd 6d 21 89 00 40 58 e8 f5
    57 fe 08 bd 0c 24 00 00
  `);
  const battlePatched = padBytes(stub, battleExpected.length);
  const battleLocated = locateNearby(
    rom,
    battlePreferred.offset,
    battleExpected,
    battlePatched,
    0x200,
    "Battle text speed"
  );
  const battleState = requireBytes(
    rom,
    battleLocated.offset,
    battleExpected,
    battlePatched,
    force,
    "Battle text speed"
  );
  if (battleState !== "already") {
    writeBytes(rom, battleLocated.offset, battlePatched);
  }

  const fallbackParts = [];
  if (optionsLocated.usedFallback) {
    fallbackParts.push(`field helper at ${hex(optionsLocated.offset)}`);
  }
  if (battleLocated.usedFallback) {
    fallbackParts.push(`battle helper at overlay 16+${hex(battleLocated.offset - battlePreferred.overlay.start)}`);
  }
  log.push(
    `Force fast text: field and battle text-speed helpers return fast async speed${
      fallbackParts.length ? ` (fallback scan: ${fallbackParts.join(", ")})` : ""
    }.`
  );
}

function buildTextNxHelper(helperAddress, charsPerFrame) {
  const textRender = 0x0201d9e8;
  const generateLookup = 0x0201d9fc;
  const windowCopyToVram = 0x0201a954;
  const destroyPrinter = 0x0201d6b0;
  const pausePrinter = 0x021c04d8;
  const out = [];
  const labels = new Map();
  const fixups = [];
  const pauseLoadOffsets = [];

  function here() {
    return helperAddress + out.length;
  }
  function emit16(value) {
    out.push(value & 0xff, (value >>> 8) & 0xff);
  }
  function emit(bytes) {
    out.push(...bytes);
  }
  function label(name) {
    labels.set(name, here());
  }
  function branch(name) {
    const at = here();
    emit16(0);
    fixups.push({ at, offset: out.length - 2, type: "b", name });
  }
  function beq(name) {
    const at = here();
    emit16(0);
    fixups.push({ at, offset: out.length - 2, type: "cond", condition: 0, name });
  }
  function bne(name) {
    const at = here();
    emit16(0);
    fixups.push({ at, offset: out.length - 2, type: "cond", condition: 1, name });
  }
  function bl(target) {
    emit(thumbBl(here(), target));
  }
  function ldrPausePrinterR2() {
    pauseLoadOffsets.push(out.length);
    emit16(0); // ldr r2, =pausePrinter; patched after literal placement
  }

  emit16(0xb5f0); // push {r4-r7, lr}
  ldrPausePrinterR2();
  emit16(0x7810); // ldrb r0, [r2]
  emit16(0x2800); // cmp r0, #0
  bne("done");
  emit16(0x1c0c); // adds r4, r1, #0
  emit16(0x1c20); // adds r0, r4, #0
  emit16(0x302d); // adds r0, #0x2d
  emit16(0x7800); // ldrb r0, [r0]
  emit16(0x2800); // cmp r0, #0
  beq("noPendingCallback");
  emit16(0x69e2); // ldr r2, [r4, #0x1c]
  emit16(0x1c20); // adds r0, r4, #0
  emit16(0x8de1); // ldrh r1, [r4, #0x2e]
  emit16(0x4790); // blx r2
  emit16(0x1c21); // adds r1, r4, #0
  emit16(0x312d); // adds r1, #0x2d
  emit16(0x7008); // strb r0, [r1]
  branch("done");

  label("noPendingCallback");
  emit16(0x2000); // movs r0, #0
  emit16(0x85e0); // strh r0, [r4, #0x2e]
  emit16(0x7d60); // ldrb r0, [r4, #0x15]
  emit16(0x7da1); // ldrb r1, [r4, #0x16]
  emit16(0x7de2); // ldrb r2, [r4, #0x17]
  bl(generateLookup);
  emit16(0x69e3); // ldr r3, [r4, #0x1c]
  emit16(0x2b00); // cmp r3, #0
  beq("loopStart");
  emit16(0x1c20); // adds r0, r4, #0
  bl(textRender);
  emit16(0x2800); // cmp r0, #0
  beq("callbackPrint");
  emit16(0x2801); // cmp r0, #1
  beq("callbackFinish");
  emit16(0x2803); // cmp r0, #3
  beq("callbackUpdate");
  branch("done");

  label("callbackPrint");
  emit16(0x6860); // ldr r0, [r4, #4]
  bl(windowCopyToVram);

  label("callbackUpdate");
  emit16(0x69e2); // ldr r2, [r4, #0x1c]
  emit16(0x2a00); // cmp r2, #0
  beq("done");
  emit16(0x1c20); // adds r0, r4, #0
  emit16(0x8de1); // ldrh r1, [r4, #0x2e]
  emit16(0x4790); // blx r2
  emit16(0x1c21); // adds r1, r4, #0
  emit16(0x312d); // adds r1, #0x2d
  emit16(0x7008); // strb r0, [r1]
  branch("done");

  label("callbackFinish");
  emit16(0x1c20); // adds r0, r4, #0
  emit16(0x302c); // adds r0, #0x2c
  emit16(0x7800); // ldrb r0, [r0]
  bl(destroyPrinter);
  branch("done");

  label("loopStart");
  emit16(0x2500 | charsPerFrame); // movs r5, #charsPerFrame
  emit16(0x2600); // movs r6, #0

  label("loop");
  emit16(0x1c20); // adds r0, r4, #0
  bl(textRender);
  emit16(0x2800); // cmp r0, #0
  beq("gotPrint");
  emit16(0x2801); // cmp r0, #1
  beq("finish");
  emit16(0x2803); // cmp r0, #3
  beq("update");
  branch("update");

  label("gotPrint");
  emit16(0x2601); // movs r6, #1
  emit16(0x3d01); // subs r5, #1
  bne("loop");
  branch("copyDone");

  label("update");
  emit16(0x2e00); // cmp r6, #0
  beq("done");
  branch("copyDone");

  label("finish");
  emit16(0x2e00); // cmp r6, #0
  beq("finishDestroy");
  emit16(0x6860); // ldr r0, [r4, #4]
  bl(windowCopyToVram);

  label("finishDestroy");
  emit16(0x1c20); // adds r0, r4, #0
  emit16(0x302c); // adds r0, #0x2c
  emit16(0x7800); // ldrb r0, [r0]
  bl(destroyPrinter);
  branch("done");

  label("copyDone");
  emit16(0x6860); // ldr r0, [r4, #4]
  bl(windowCopyToVram);

  label("done");
  emit16(0xbdf0); // pop {r4-r7, pc}

  while (out.length % 4 !== 0) {
    out.push(0);
  }
  const literalAddress = here();
  emit([pausePrinter & 0xff, (pausePrinter >>> 8) & 0xff, (pausePrinter >>> 16) & 0xff, (pausePrinter >>> 24) & 0xff]);

  for (const pauseLoadOffset of pauseLoadOffsets) {
    const pcBase = (helperAddress + pauseLoadOffset + 4) & ~3;
    const literalOffset = literalAddress - pcBase;
    if (literalOffset < 0 || literalOffset > 1020 || literalOffset % 4 !== 0) {
      throw new Error("internal text speed literal is out of range");
    }
    const pauseLoad = 0x4800 | (2 << 8) | (literalOffset / 4);
    out[pauseLoadOffset] = pauseLoad & 0xff;
    out[pauseLoadOffset + 1] = (pauseLoad >>> 8) & 0xff;
  }

  for (const fixup of fixups) {
    const target = labels.get(fixup.name);
    if (target == null) {
      throw new Error(`internal text speed label not found: ${fixup.name}`);
    }
    const bytes =
      fixup.type === "cond"
        ? thumbCondBranch(fixup.at, target, fixup.condition)
        : thumbB(fixup.at, target);
    out[fixup.offset] = bytes[0];
    out[fixup.offset + 1] = bytes[1];
  }

  return new Uint8Array(out);
}

function textNxHook(fromAddress, helperAddress) {
  return new Uint8Array([
    0x00,
    0xb5,
    ...thumbBl(fromAddress + 2, helperAddress),
    0x00,
    0xbd,
  ]);
}

function decodeThumbBl(fromAddress, bytes, offset) {
  const first = bytes[offset] | (bytes[offset + 1] << 8);
  const second = bytes[offset + 2] | (bytes[offset + 3] << 8);
  if ((first & 0xf800) !== 0xf000 || (second & 0xf800) !== 0xf800) {
    return null;
  }
  let branchOffset = ((first & 0x7ff) << 12) | ((second & 0x7ff) << 1);
  if (branchOffset & 0x400000) {
    branchOffset -= 0x800000;
  }
  return (fromAddress + 4 + branchOffset) >>> 0;
}

function matchingTextSpeedHelper(rom, offset, helperRamAddress) {
  for (let speed = 2; speed <= 10; speed += 1) {
    if (bytesEqual(rom, offset, buildTextNxHelper(helperRamAddress, speed))) {
      return speed;
    }
  }
  return null;
}

function patchText4x(rom, force, log, options = {}) {
  const charsPerFrame = textCharsPerFrameOption(options);
  const label = `Experimental ${charsPerFrame}x text`;
  patchInstantText(rom, force, log);

  const arm9 = getArm9Info(rom);
  const hookRamAddress = 0x0201d97c;
  const preferredCaveRamAddress = 0x020795e0;
  const hookOriginal = bytesFromHex("10 b5 19 48 0c 1c 00 78");
  const hookAtPreferred = arm9Offset(rom, hookRamAddress, hookOriginal.length);
  const preferredHelper = buildTextNxHelper(preferredCaveRamAddress, charsPerFrame);
  const caveExpected = new Uint8Array(preferredHelper.length).fill(0xff);

  let existingHelperRamAddress = null;
  if (
    bytesEqual(rom, hookAtPreferred, bytesFromHex("00 b5")) &&
    bytesEqual(rom, hookAtPreferred + 6, bytesFromHex("00 bd"))
  ) {
    existingHelperRamAddress = decodeThumbBl(hookRamAddress + 2, rom, hookAtPreferred + 2);
  }

  const existingHelperAt =
    existingHelperRamAddress == null
      ? -1
      : arm9.fileOffset + (existingHelperRamAddress - arm9.loadAddress);
  const existingHelper =
    existingHelperAt >= arm9.fileOffset &&
    existingHelperAt + preferredHelper.length <= arm9.fileOffset + arm9.size
      ? buildTextNxHelper(existingHelperRamAddress, charsPerFrame)
      : null;
  const existingHelperSpeed =
    existingHelperAt >= arm9.fileOffset &&
    existingHelperAt + preferredHelper.length <= arm9.fileOffset + arm9.size
      ? matchingTextSpeedHelper(rom, existingHelperAt, existingHelperRamAddress)
      : null;

  if (
    existingHelper &&
    bytesEqual(rom, existingHelperAt, existingHelper) &&
    bytesEqual(rom, hookAtPreferred, textNxHook(hookRamAddress, existingHelperRamAddress))
  ) {
    log.push(
      `${label}: already patched at ARM9 file ${hex(hookAtPreferred)} / RAM ${hex(
        hookRamAddress
      )}; helper at ARM9 file ${hex(existingHelperAt)} / RAM ${hex(existingHelperRamAddress)}.`
    );
    return;
  }

  const locatedHook = locateNearby(
    rom,
    hookAtPreferred,
    hookOriginal,
    textNxHook(hookRamAddress, preferredCaveRamAddress),
    0x200,
    `${label} hook`
  );
  const hookAt = locatedHook.offset;
  const actualHookRamAddress = arm9.loadAddress + (hookAt - arm9.fileOffset);

  let caveAt =
    existingHelperSpeed == null
      ? arm9Offset(rom, preferredCaveRamAddress, preferredHelper.length)
      : existingHelperAt;
  let caveFillValue = 0xff;
  let caveFallback = false;
  if (
    existingHelperSpeed == null &&
    !bytesEqual(rom, caveAt, caveExpected) &&
    !bytesEqual(rom, caveAt, preferredHelper)
  ) {
    let dynamicCave = findFillRun(
      rom,
      arm9.fileOffset,
      arm9.fileOffset + arm9.size,
      0xff,
      preferredHelper.length,
      caveAt
    );
    if (dynamicCave === -1) {
      dynamicCave = findFillRun(
        rom,
        arm9.fileOffset,
        arm9.fileOffset + arm9.size,
        0x00,
        preferredHelper.length,
        caveAt
      );
      caveFillValue = 0x00;
    }
    if (dynamicCave !== -1) {
      caveAt = dynamicCave;
      caveFallback = caveAt !== arm9Offset(rom, preferredCaveRamAddress, preferredHelper.length);
    } else if (!force) {
      throw new PatchError(`${label} could not find a free ARM9 code cave.`);
    }
  }

  const helperRamAddress = arm9.loadAddress + (caveAt - arm9.fileOffset);
  const helper = buildTextNxHelper(helperRamAddress, charsPerFrame);
  const hook = textNxHook(actualHookRamAddress, helperRamAddress);
  const hookAlready = bytesEqual(rom, hookAt, hook);
  const helperAlready = bytesEqual(rom, caveAt, helper);

  if (!hookAlready && !bytesEqual(rom, hookAt, hookOriginal) && !force) {
    const found = Array.from(rom.slice(hookAt, hookAt + hookOriginal.length))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join(" ");
    throw new PatchError(
      `${label} hook sanity check failed at ${hex(hookAt)}. Found ${found}. Enable compatible modified bytes to patch anyway.`
    );
  }
  if (
    !helperAlready &&
    existingHelperSpeed == null &&
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
  if (!hookAlready) {
    writeBytes(rom, hookAt, hook);
  }

  const notes = [];
  if (locatedHook.usedFallback) {
    notes.push("hook fallback scan");
  }
  if (caveFallback) {
    notes.push(`code-cave fallback scan (${hex(caveFillValue)} fill)`);
  }
  if (existingHelperSpeed != null && existingHelperSpeed !== charsPerFrame) {
    notes.push(`updated from ${existingHelperSpeed}x`);
  }
  log.push(
    `${label}: ${hookAlready && helperAlready ? "already patched" : "installed"} hook at ARM9 file ${hex(
      hookAt
    )} / RAM ${hex(actualHookRamAddress)}; helper at ARM9 file ${hex(caveAt)} / RAM ${hex(
      helperRamAddress
    )}${notes.length ? ` (${notes.join(", ")})` : ""}.`
  );
}

  return {
    instantText: patchInstantText,
    text4x: patchText4x,
  };
});
