(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    root.PlatinumPatcherAsmTemplates = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function hex32(value) {
    return `0x${(value >>> 0).toString(16).toUpperCase().padStart(8, "0")}`;
  }

  function modernConfusionHelper({ helperAddress, battleSystemRandNextAddress }) {
    return `.nds
.create "output.bin", ${hex32(helperAddress)}
.thumb
.org ${hex32(helperAddress)}
  push {lr}
  bl ${hex32(battleSystemRandNextAddress)}
  ldr r1,[pc,0x8]
  cmp r0,r1
  bcs @@return_false
  mov r0,0
  pop {pc}
@@return_false:
  mov r0,1
  pop {pc}
  .word 0x00005555
.close
`;
  }

  function modernParalysisThunderWaveHelper({ helperAddress }) {
    return `.nds
.create "output.bin", ${hex32(helperAddress)}
.thumb
.org ${hex32(helperAddress)}
  ldr r1,[pc,0x30]
  str r0,[r4,r1]
  ldr r2,[pc,0x30]
  ldr r2,[r4,r2]
  cmp r2,0x56
  bne @@return
  ldr r2,[r4,0x6C]
  mov r3,0xC0
  mul r2,r3
  ldr r3,[pc,0x28]
  add r2,r4,r2
  ldrb r0,[r2,r3]
  cmp r0,0x0D
  beq @@immune
  add r3,1
  ldrb r0,[r2,r3]
  cmp r0,0x0D
  bne @@return
@@immune:
  ldr r2,[pc,0x18]
  ldr r0,[r4,r2]
  mov r3,6
  bic r0,r3
  mov r3,8
  orr r0,r3
  str r0,[r4,r2]
@@return:
  bx lr
  .word 0x00002144
  .word 0x00003044
  .word 0x00002D64
  .word 0x0000216C
.close
`;
  }

  function modernBurnHelper({ helperAddress }) {
    return `.nds
.create "output.bin", ${hex32(helperAddress)}
.thumb
.org ${hex32(helperAddress)}
  ldr r0,[sp,0x48]
  mov r1,0x10
  tst r0,r1
  beq @@return
  cmp r7,0x3E
  beq @@return
  ldr r0,[sp,0x08]
  mov r1,0x83
  lsl r1,r1,1
  add r1,1
  cmp r0,r1
  beq @@return
  ldr r0,[sp,0x84]
  lsr r1,r0,31
  add r1,r0,r1
  asr r0,r1,1
  str r0,[sp,0x84]
@@return:
  bx lr
.close
`;
  }

  function modernSleepHelper({ helperAddress, battleSystemRandNextAddress }) {
    return `.nds
.create "output.bin", ${hex32(helperAddress)}
.thumb
.org ${hex32(helperAddress)}
  push {r2,r3,r4,lr}
  ldr r3,[pc,0x34]
  ldr r4,[r2,r3]
  mov r0,7
  and r0,r4
  cmp r0,3
  bls @@counter_clamped
  mov r0,3
@@counter_clamped:
  sub r0,1
  cmp r0,1
  bne @@store_counter
  ldr r0,[sp,0x28]
  bl ${hex32(battleSystemRandNextAddress)}
  ldr r1,[pc,0x1C]
  cmp r0,r1
  bcs @@wake
  mov r0,0
  b @@store_counter
@@wake:
  mov r0,1
@@store_counter:
  mov r1,7
  bic r4,r1
  orr r4,r0
  ldr r2,[sp,0]
  ldr r3,[pc,0x04]
  str r4,[r2,r3]
  mov r1,r4
  pop {r2,r3,r4,pc}
  .word 0x00002DB0
  .word 0x00005555
.close
`;
  }

  function modernFreezeHelper({ helperAddress, battleSystemRandNextAddress }) {
    return `.nds
.create "output.bin", ${hex32(helperAddress)}
.thumb
.org ${hex32(helperAddress)}
  push {r4,lr}
  mov r4,r1
  ldr r2,[r4,0x64]
  mov r1,0xC0
  mul r2,r1
  ldr r1,[pc,0x24]
  add r1,r1,r2
  add r1,r1,r4
  ldrh r2,[r1]
  add r2,1
  strh r2,[r1]
  cmp r2,3
  bcs @@thaw
  bl ${hex32(battleSystemRandNextAddress)}
  mov r1,3
  tst r0,r1
  beq @@thaw
  mov r0,1
  pop {r4,pc}
@@thaw:
  mov r2,0
  strh r2,[r1]
  mov r0,0
  pop {r4,pc}
  .word 0x00002DBA
.close
`;
  }

  function natureStatColorsHelper({
    helperAddress,
    pokemonGetStatAffinityOfAddress,
    printStringToWindowAddress,
  }) {
    return `.nds
.create "output.bin", ${hex32(helperAddress)}
.thumb
.org ${hex32(helperAddress)}
  push {r4,r5,r6,r7,lr}
  sub sp,4
  .halfword 0x4604
  .halfword 0x460D
  .halfword 0x461F
  mov r0,0x91
  lsl r0,r0,2
  ldr r0,[r4,r0]
  sub r1,r5,r0
  lsr r1,r1,4
  mov r6,0
  cmp r1,1
  bne @@check_defense
  mov r6,1
  b @@mapped
@@check_defense:
  cmp r1,2
  bne @@check_speed
  mov r6,2
  b @@mapped
@@check_speed:
  cmp r1,3
  bne @@check_spatk
  mov r6,4
  b @@mapped
@@check_spatk:
  cmp r1,4
  bne @@check_spdef
  mov r6,5
  b @@mapped
@@check_spdef:
  cmp r1,5
  bne @@neutral
  mov r6,3
@@mapped:
  mov r0,0xA1
  lsl r0,r0,2
  sub r0,1
  ldrb r0,[r4,r0]
  .halfword 0x4631
  bl ${hex32(pokemonGetStatAffinityOfAddress)}
  cmp r0,1
  beq @@boosted
  cmp r0,0
  bmi @@lowered
@@neutral:
  ldr r2,[pc,0x18]
  b @@call_print
@@lowered:
  ldr r2,[pc,0x18]
  b @@call_print
@@boosted:
  ldr r2,[pc,0x18]
@@call_print:
  .halfword 0x4620
  .halfword 0x4629
  .halfword 0x463B
  bl ${hex32(printStringToWindowAddress)}
  add sp,4
  pop {r4,r5,r6,r7,pc}
  nop
  .word 0x00010200
  .word 0x00030400
  .word 0x00050600
.close
`;
  }

  function itemRenewalWritebackHelper({
    helperAddress,
    flagIndexAddress,
    battleSystemGetBattleContextAddress,
  }) {
    return `.nds
.create "output.bin", ${hex32(helperAddress)}
.thumb
.org ${hex32(helperAddress)}
  push {r4,r5,lr}
  ldr r5,[sp,0x10]
  mov r0,0x65
  lsl r0,r0,2
  add r5,r5,r0
  ldrb r5,[r5,1]
  ldrb r0,[r6,1]
  lsl r0,r0,28
  lsr r0,r0,28
  bl ${hex32(flagIndexAddress)}
  mov r4,r0
  ldr r1,[r6,8]
  orr r1,r0
  str r1,[r6,8]
  ldrh r2,[r6,0x0C]
  cmp r2,0
  bne @@return
  ldr r0,[sp,0x0C]
  bl ${hex32(battleSystemGetBattleContextAddress)}
  mov r1,0x71
  lsl r1,r1,2
  mov r2,r5
  mov r3,1
  and r2,r3
  lsl r2,r2,3
  add r1,r1,r2
  ldr r2,[r0,r1]
  mov r3,r4
  lsl r3,r3,23
  orr r2,r3
  str r2,[r0,r1]
@@return:
  ldrb r0,[r6,1]
  lsl r0,r0,28
  pop {r4,r5,pc}
.close
`;
  }

  function itemRenewalPartyHeldItemHelper({
    helperAddress,
    flagIndexAddress,
    battleSystemGetBattleContextAddress,
  }) {
    return `.nds
.create "output.bin", ${hex32(helperAddress)}
.thumb
.org ${hex32(helperAddress)}
  push {r1,r2,r3,r5,r6,r7,lr}
  mov r7,r0
  ldr r6,[sp,0x1C]
  ldr r6,[r6,0]
  ldr r0,[r6,8]
  bl ${hex32(battleSystemGetBattleContextAddress)}
  mov r5,r0
  ldr r0,[sp,0x24]
  mov r1,r6
  add r1,0x2C
  ldrb r0,[r1,r0]
  cmp r0,6
  bcs @@store
  bl ${hex32(flagIndexAddress)}
  mov r1,0x71
  lsl r1,r1,2
  ldr r2,[r6,0x28]
  mov r3,1
  and r2,r3
  lsl r2,r2,3
  add r1,r1,r2
  ldr r2,[r5,r1]
  mov r3,r0
  lsl r3,r3,23
  tst r2,r3
  beq @@store
  mov r7,0
@@store:
  strh r7,[r4,0x1E]
  ldr r0,[r4,4]
  pop {r1,r2,r3,r5,r6,r7,pc}
.close
`;
  }

  function infiniteCandyChainHelper({
    helperAddress,
    bagCanRemoveItemAddress,
    windowEraseMessageBoxAddress,
    partyMenuPrintToWindow32Address,
  }) {
    return `.nds
.create "output.bin", ${hex32(helperAddress)}
.thumb
.org ${hex32(helperAddress)}
  push {r5,lr}
  strb r0,[r1]
  cmp r0,0
  bne @@exit
  mov r0,0xB4
  lsl r0,r0,3
  add r0,4
  add r1,r4,r0
  ldr r5,[r1]
  ldr r0,[r5,4]
  mov r1,0xDD
  lsl r1,r1,1
  sub r1,1
  mov r2,1
  mov r3,0x0C
  bl ${hex32(bagCanRemoveItemAddress)}
  cmp r0,0
  beq @@exit
  mov r1,0xDD
  lsl r1,r1,1
  sub r1,1
  mov r0,0x24
  add r0,r5,r0
  strh r1,[r0]
  mov r0,r4
  mov r1,0x89
  lsl r1,r1,2
  add r0,r0,r1
  mov r1,0
  bl ${hex32(windowEraseMessageBoxAddress)}
  mov r0,r4
  mov r1,0x20
  mov r2,1
  bl ${hex32(partyMenuPrintToWindow32Address)}
  mov r0,4
  pop {r5,pc}
@@exit:
  mov r0,0x20
  pop {r5,pc}
  b @@end
  .align 4
@@end:
.close
`;
  }

  function infiniteCandyBagRemovalHelper({
    helperAddress,
    bagTryRemoveItemSlotAddress,
    bagTryRemoveItemResumeAddress,
  }) {
    return `.nds
.create "output.bin", ${hex32(helperAddress)}
.thumb
.org ${hex32(helperAddress)}
  pop {r3}
  push {r0}
  mov r0,0xDD
  lsl r0,r0,1
  sub r0,1
  cmp r1,r0
  pop {r0}
  bne @@normal
  mov r0,1
  bx lr
@@normal:
  push {r4,r5,r6,r7,lr}
  sub sp,0x0C
  mov r6,r0
  mov r7,r1
  mov r5,r2
  mov r4,r3
  bl ${hex32(bagTryRemoveItemSlotAddress)}
  ldr r3,[pc,0]
  bx r3
  .word ${hex32(bagTryRemoveItemResumeAddress | 1)}
.close
`;
  }

  function infiniteCandyPocketRemovalHelper({
    helperAddress,
    pocketTryRemoveItemCountAddress,
    pocketTryRemoveItemResumeAddress,
  }) {
    return `.nds
.create "output.bin", ${hex32(helperAddress)}
.thumb
.org ${hex32(helperAddress)}
  pop {r3}
  push {r0}
  mov r0,0xDD
  lsl r0,r0,1
  sub r0,1
  cmp r2,r0
  pop {r0}
  bne @@normal
  mov r0,1
  bx lr
@@normal:
  push {r4,r5,r6,lr}
  mov r5,r0
  mov r6,r1
  mov r4,r3
  bl ${hex32(pocketTryRemoveItemCountAddress)}
  ldr r3,[pc,0]
  bx r3
  .word ${hex32(pocketTryRemoveItemResumeAddress | 1)}
.close
`;
  }

  function extraTmsHelper({
    helperAddress,
    itemIds,
    moveIds,
    expandedCompatMasks = [],
    sTmHmMovesAddress,
    fontDrawNumberAddress,
    fontDrawHpAddress,
    bagPrintItemCountAddress,
    drawHmIconAddress,
    maxRows = 60,
  }) {
    const tableAddress = helperAddress + 0x500;
    const compatMaskAddress = tableAddress + 8 + maxRows * 4;
    const paddedItemIds = Array.from({ length: maxRows }, (_, index) =>
      index < itemIds.length ? itemIds[index] : 0xffff
    );
    const paddedMoveIds = Array.from({ length: maxRows }, (_, index) =>
      index < moveIds.length ? moveIds[index] : 0x0000
    );
    const compatMaskWords = expandedCompatMasks
      .map((mask) => `  .word 0x${(mask >>> 0).toString(16).toUpperCase().padStart(8, "0")}`)
      .join("\n");
    const itemHalfwords = paddedItemIds
      .map((itemId) => `  .halfword 0x${itemId.toString(16).toUpperCase().padStart(4, "0")}`)
      .join("\n");
    const moveHalfwords = paddedMoveIds
      .map((moveId) => `  .halfword 0x${moveId.toString(16).toUpperCase().padStart(4, "0")}`)
      .join("\n");

    return `.nds
.create "output.bin", ${hex32(helperAddress)}
.thumb
.org ${hex32(helperAddress)}
  push {r4}
  ldr r4,[pc,0x48]
  ldr r1,[r4]
  add r4,8
  lsl r1,r1,1
  mov r2,0
@@is_scan:
  cmp r2,r1
  bcs @@is_vanilla
  ldrh r3,[r4,r2]
  cmp r0,r3
  beq @@is_extra
  add r2,2
  b @@is_scan
@@is_extra:
  mov r0,1
  pop {r4}
  bx lr
@@is_vanilla:
  mov r1,0x52
  lsl r1,r1,2
  cmp r0,r1
  bcc @@is_false
  add r1,0x63
  cmp r0,r1
  bhi @@is_false
  mov r0,1
  pop {r4}
  bx lr
@@is_false:
  mov r0,0
  pop {r4}
  bx lr
.org ${hex32(helperAddress + 0x4c)}
  .word ${hex32(tableAddress)}

.org ${hex32(helperAddress + 0x80)}
  push {r4}
  ldr r4,[pc,0x48]
  ldr r1,[r4]
  add r4,8
  lsl r1,r1,1
  mov r2,0
@@move_scan:
  cmp r2,r1
  bcs @@move_vanilla
  ldrh r3,[r4,r2]
  cmp r0,r3
  beq @@move_extra
  add r2,2
  b @@move_scan
@@move_extra:
  add r4,${maxRows * 2}
  ldrh r0,[r4,r2]
  pop {r4}
  bx lr
@@move_vanilla:
  sub r4,8
  mov r2,0x52
  lsl r2,r2,2
  cmp r0,r2
  bcc @@move_none
  mov r1,r2
  add r1,0x63
  cmp r0,r1
  bhi @@move_none
  sub r0,r0,r2
  lsl r0,r0,16
  lsr r1,r0,15
  ldr r0,[r4,4]
  ldrh r0,[r0,r1]
  pop {r4}
  bx lr
@@move_none:
  mov r0,0
  pop {r4}
  bx lr
.org ${hex32(helperAddress + 0xcc)}
  .word ${hex32(tableAddress)}

.org ${hex32(helperAddress + 0x100)}
  push {r4}
  ldr r4,[pc,0x48]
  ldr r1,[r4]
  add r4,8
  lsl r1,r1,1
  mov r2,0
@@number_scan:
  cmp r2,r1
  bcs @@number_vanilla
  ldrh r3,[r4,r2]
  cmp r0,r3
  beq @@number_extra
  add r2,2
  b @@number_scan
@@number_extra:
  mov r0,r2
  lsr r0,r0,1
  add r0,0x64
  pop {r4}
  bx lr
@@number_vanilla:
  mov r2,0x52
  lsl r2,r2,2
  cmp r0,r2
  bcc @@number_none
  mov r1,r2
  add r1,0x63
  cmp r0,r1
  bhi @@number_none
  sub r0,r0,r2
  lsl r0,r0,24
  lsr r0,r0,24
  pop {r4}
  bx lr
@@number_none:
  mov r0,0
  pop {r4}
  bx lr
.org ${hex32(helperAddress + 0x14c)}
  .word ${hex32(tableAddress)}

.org ${hex32(helperAddress + 0x180)}
  push {r3,r4,r5,r6,r7,lr}
  sub sp,0x10
  mov r5,r0
  mov r6,r1
  mov r4,r2
  ldrh r0,[r6]
  ldr r7,=${hex32(tableAddress)}
  ldr r1,[r7]
  add r7,8
  mov r2,0
@@display_scan:
  cmp r2,r1
  bcs @@display_vanilla
  lsl r3,r2,1
  ldrh r3,[r7,r3]
  cmp r0,r3
  beq @@display_extra
  add r2,1
  b @@display_scan
@@display_extra:
  mov r0,r2
  add r0,0x5D
  mov r3,2
  cmp r0,100
  bcc @@draw_tm
  mov r3,3
@@draw_tm:
  mov r2,r0
  b @@draw_tm_number
@@display_vanilla:
  ldrh r2,[r6]
  mov r0,0x69
  lsl r0,r0,2
  cmp r2,r0
  bcs @@display_hm
  mov r1,r0
  sub r1,0x5D
  sub r2,r2,r1
  mov r3,2
@@draw_tm_number:
  mov r0,2
  str r0,[sp,0]
  add r0,r5,4
  str r0,[sp,4]
  mov r0,0
  str r0,[sp,8]
  add r0,r4,5
  str r0,[sp,12]
  mov r0,0x69
  lsl r0,r0,2
  sub r0,0x94
  ldr r0,[r5,r0]
  mov r1,2
  bl ${hex32(fontDrawNumberAddress)}
  ldrh r1,[r6,2]
  ldr r3,=${hex32(0x00010200)}
  mov r0,r5
  mov r2,r4
  bl ${hex32(bagPrintItemCountAddress)}
  add sp,0x10
  pop {r3,r4,r5,r6,r7,pc}
@@display_hm:
  sub r1,r2,r0
  add r1,1
  add r0,r5,4
  str r0,[sp,0]
  mov r0,16
  str r0,[sp,4]
  add r0,r4,5
  str r0,[sp,8]
  mov r0,0x69
  lsl r0,r0,2
  sub r0,0x94
  ldr r0,[r5,r0]
  mov r2,2
  mov r3,1
  bl ${hex32(fontDrawHpAddress)}
  mov r0,r5
  mov r1,r4
  bl ${hex32(drawHmIconAddress)}
  add sp,0x10
  pop {r3,r4,r5,r6,r7,pc}
  .pool

.org ${hex32(helperAddress + 0x280)}
  cmp r2,0x80
  bcc @@can_learn_vanilla
  ldr r3,=0x000001EE
  cmp r0,r3
  beq @@can_learn_false
  cmp r2,0xA0
  bcc @@can_learn_expanded
@@can_learn_false:
  mov r0,0
  bx lr
@@can_learn_vanilla:
  push {r4,lr}
  ldr r3,=0x000001EE
  cmp r0,r3
  bne @@can_learn_continue
  mov r0,0
  pop {r4,pc}
@@can_learn_continue:
  ldr r3,=0x02077FF1
  bx r3
@@can_learn_expanded:
  push {r4,r5,lr}
  sub r2,0x80
  mov r3,1
  lsl r3,r2
  mov r4,r0
  cmp r1,0
  beq @@expanded_lookup
  ldr r5,=0x00000182
  cmp r4,r5
  bne @@check_wormadam
  cmp r1,3
  bhi @@expanded_lookup
  ldr r4,=495
  add r4,r1
  b @@expanded_lookup
@@check_wormadam:
  ldr r5,=0x0000019D
  cmp r4,r5
  bne @@check_giratina
  cmp r1,2
  bhi @@expanded_lookup
  ldr r4,=498
  add r4,r1
  b @@expanded_lookup
@@check_giratina:
  ldr r5,=0x000001E7
  cmp r4,r5
  bne @@check_shaymin
  cmp r1,1
  bhi @@expanded_lookup
  ldr r4,=500
  add r4,r1
  b @@expanded_lookup
@@check_shaymin:
  ldr r5,=0x000001EC
  cmp r4,r5
  bne @@check_rotom
  cmp r1,1
  bhi @@expanded_lookup
  ldr r4,=501
  add r4,r1
  b @@expanded_lookup
@@check_rotom:
  ldr r5,=0x000001DF
  cmp r4,r5
  bne @@expanded_lookup
  cmp r1,5
  bhi @@expanded_lookup
  ldr r4,=502
  add r4,r1
@@expanded_lookup:
  ldr r5,=${hex32(compatMaskAddress)}
  ldr r2,=${hex32(expandedCompatMasks.length)}
  cmp r4,r2
  bcs @@expanded_false
  lsl r4,r4,2
  ldr r0,[r5,r4]
  tst r0,r3
  beq @@expanded_false
  mov r0,1
  pop {r4,r5,pc}
@@expanded_false:
  mov r0,0
  pop {r4,r5,pc}
  .pool

.org ${hex32(tableAddress)}
  .word ${hex32(itemIds.length)}
  .word ${hex32(sTmHmMovesAddress)}
${itemHalfwords}
${moveHalfwords}
${compatMaskWords}
.close
`;
  }

  function itemExpansionHelper({
    helperAddress,
    firstItemId,
    maxVanillaItemId,
    itemArchiveIdsAddress,
    narcAllocWholeMemberAddress,
    itemIsTmHmAddress,
    itemLoadParamAddress,
    saveDataPtrAddress,
    saveDataSaveTableAddress,
    saveDataSetChecksumAddress,
    overflowStorageSaveTableId = 30,
    overflowStorageOffset = 0xcfc,
    bagContextNewAddress,
    bagContextInitPocketAddress,
    pocketSortEmptyAddress,
    entries,
    maxRows = 128,
  }) {
    const itemLoadAddress = helperAddress + 0x120;
    const tableAddress = helperAddress + 0x280;
    const pocketTableAddress = helperAddress + 0x690;
    const bagContextCreateAddress = helperAddress + 0x700;
    const bagGetPocketForItemAddress = helperAddress + 0x860;
    const storageHelperAddress = helperAddress + 0x980;
    const medicineScratchBuilderAddress = helperAddress + 0xa40;
    const tmhmScratchAddress = helperAddress + 0xc40;
    const medicineScratchAddress = helperAddress + 0xec0;
    const paddedEntries = Array.from({ length: maxRows }, (_, index) =>
      index < entries.length
        ? entries[index]
        : { data: 0, icon: 707, palette: 708, gen3: 0, fieldPocket: 0 }
    );
    const tableRows = paddedEntries
      .map(
        (entry) =>
          `  .halfword 0x${entry.data.toString(16).toUpperCase().padStart(4, "0")}, 0x${entry.icon
            .toString(16)
            .toUpperCase()
            .padStart(4, "0")}, 0x${entry.palette
            .toString(16)
            .toUpperCase()
            .padStart(4, "0")}, 0x${entry.gen3.toString(16).toUpperCase().padStart(4, "0")}`
      )
      .join("\n");
    const pocketRows = [];
    for (let index = 0; index < paddedEntries.length; index += 2) {
      const low = paddedEntries[index].fieldPocket & 0x0f;
      const high = ((paddedEntries[index + 1] || { fieldPocket: 0 }).fieldPocket & 0x0f) << 4;
      pocketRows.push(`  .byte 0x${(low | high).toString(16).toUpperCase().padStart(2, "0")}`);
    }

    return `.nds
.create "output.bin", ${hex32(helperAddress)}
.thumb
.org ${hex32(helperAddress)}
  cmp r1,3
  bls @@check_special
  mov r0,0
  bx lr
@@check_special:
  cmp r0,0
  beq @@item_none
  ldr r2,=0x0000FFFF
  cmp r0,r2
  beq @@item_return
  ldr r2,=${hex32(firstItemId)}
  cmp r0,r2
  bcc @@vanilla
  sub r3,r0,r2
  ldr r2,=${hex32(entries.length)}
  cmp r3,r2
  bcc @@expanded
  b @@invalid
@@expanded:
  ldr r2,=${hex32(tableAddress + 8)}
  lsl r3,r3,3
  add r2,r3
  lsl r1,r1,1
  ldrh r0,[r2,r1]
  bx lr
@@vanilla:
  ldr r2,=${hex32(maxVanillaItemId)}
  cmp r0,r2
  bhi @@invalid
  ldr r2,=${hex32(itemArchiveIdsAddress)}
  lsl r3,r0,3
  add r2,r3
  lsl r1,r1,1
  ldrh r0,[r2,r1]
  bx lr
@@item_none:
  cmp r1,1
  beq @@none_icon
  cmp r1,2
  beq @@none_palette
  mov r0,0
  bx lr
@@none_icon:
  ldr r0,=707
  bx lr
@@none_palette:
  ldr r0,=708
  bx lr
@@item_return:
  cmp r1,1
  beq @@return_icon
  cmp r1,2
  beq @@return_palette
  mov r0,0
  bx lr
@@return_icon:
  ldr r0,=709
  bx lr
@@return_palette:
  ldr r0,=710
  bx lr
@@invalid:
  mov r0,0
  bx lr
  .pool

.org ${hex32(itemLoadAddress)}
  push {r4,r5,r6,lr}
  mov r4,r0
  mov r5,r1
  mov r6,r2
  cmp r5,2
  bls @@load_type_ok
  mov r0,0
  pop {r4,r5,r6,pc}
@@load_type_ok:
  ldr r0,=${hex32(firstItemId)}
  cmp r4,r0
  bcc @@load_check_vanilla
  sub r1,r4,r0
  ldr r0,=${hex32(entries.length)}
  cmp r1,r0
  bcc @@load_valid_item
  b @@load_item_none
@@load_check_vanilla:
  ldr r0,=${hex32(maxVanillaItemId)}
  cmp r4,r0
  bls @@load_valid_item
@@load_item_none:
  mov r4,0
@@load_valid_item:
  mov r0,r4
  mov r1,r5
  bl ${hex32(helperAddress)}
  mov r1,r0
  cmp r5,0
  bne @@load_icon_archive
  mov r0,15
  b @@load_call
@@load_icon_archive:
  mov r0,16
@@load_call:
  mov r2,r6
  bl ${hex32(narcAllocWholeMemberAddress)}
  pop {r4,r5,r6,pc}
  .pool

.org ${hex32(bagContextCreateAddress)}
  push {r3,r4,r5,r6,r7,lr}
  str r2,[sp]
  mov r5,r0
  mov r7,r1
  lsl r0,r2,24
  lsr r0,r0,24
  bl ${hex32(bagContextNewAddress)}
  mov r6,r0
  ldrb r0,[r7]
  mov r4,0
  cmp r0,0xFF
  beq @@ctx_done
@@ctx_loop:
  ldrb r2,[r7,r4]
  cmp r2,7
  bhi @@ctx_next
  cmp r2,3
  beq @@ctx_tmhms
  cmp r2,0
  beq @@ctx_items
  cmp r2,1
  beq @@ctx_medicine
  cmp r2,2
  beq @@ctx_balls
  cmp r2,4
  beq @@ctx_berries
  cmp r2,5
  beq @@ctx_mail
  cmp r2,6
  beq @@ctx_battle_items
  b @@ctx_key_items
@@ctx_items:
  mov r1,r5
  b @@ctx_init
@@ctx_medicine:
  mov r0,r5
  ldr r1,[sp]
  bl ${hex32(medicineScratchBuilderAddress)}
  mov r1,r0
  mov r2,1
  b @@ctx_init
@@ctx_balls:
  ldr r1,=0x000006BC
  add r1,r5,r1
  b @@ctx_init
@@ctx_tmhms:
  mov r0,r5
  ldr r1,[sp]
  bl @@build_tmhm_scratch
  mov r1,r0
  mov r2,3
  b @@ctx_init
@@ctx_berries:
  ldr r1,=0x000005BC
  add r1,r5,r1
  b @@ctx_init
@@ctx_mail:
  ldr r1,=0x000004EC
  add r1,r5,r1
  b @@ctx_init
@@ctx_battle_items:
  ldr r1,=0x000006F8
  add r1,r5,r1
  b @@ctx_init
@@ctx_key_items:
  ldr r1,=0x00000294
  add r1,r5,r1
@@ctx_init:
  mov r0,r6
  lsl r3,r4,24
  lsr r3,r3,24
  bl ${hex32(bagContextInitPocketAddress)}
@@ctx_next:
  add r4,1
  ldrb r0,[r7,r4]
  cmp r0,0xFF
  bne @@ctx_loop
@@ctx_done:
  mov r0,r6
  pop {r3,r4,r5,r6,r7,pc}

@@build_tmhm_scratch:
  push {r4,r5,r6,r7,lr}
  sub sp,12
  str r0,[sp]
  str r1,[sp,4]
  .align 4
  ldr r4,[pc,0]
  b @@scratch_ptr_loaded
  .word ${hex32(tmhmScratchAddress)}
@@scratch_ptr_loaded:
  mov r0,r4
  mov r1,0
  ldr r2,=0x00000280
@@scratch_clear:
  str r1,[r0]
  add r0,4
  sub r2,4
  bne @@scratch_clear
  bl ${hex32(storageHelperAddress)}
  str r0,[sp,8]
  ldr r0,=0x0000035C
  ldr r1,=${hex32(tmhmScratchAddress)}
  ldr r2,[sp]
  add r0,r0,r2
  mov r2,100
@@scratch_copy_vanilla:
  ldr r3,[r0]
  str r3,[r1]
  add r0,4
  add r1,4
  sub r2,1
  bne @@scratch_copy_vanilla
  mov r7,0
@@scratch_find_append:
  cmp r7,100
  bcs @@scratch_have_append
  lsl r1,r7,2
  add r1,r4,r1
  ldrh r2,[r1]
  cmp r2,0
  beq @@scratch_have_append
  ldrh r2,[r1,2]
  cmp r2,0
  beq @@scratch_have_append
  add r7,1
  b @@scratch_find_append
@@scratch_have_append:
  mov r5,0
@@scratch_scan_overflow:
  cmp r5,0x80
  bcs @@scratch_done
  ldr r1,[sp,8]
  lsl r2,r5,2
  add r1,r1,r2
  ldrh r0,[r1]
  cmp r0,0
  beq @@scratch_next_overflow
  ldrh r2,[r1,2]
  cmp r2,0
  beq @@scratch_next_overflow
  bl ${hex32(itemIsTmHmAddress)}
  cmp r0,0
  beq @@scratch_next_overflow
  cmp r7,160
  bcs @@scratch_done
  ldr r1,[sp,8]
  lsl r2,r5,2
  add r1,r1,r2
  ldr r0,[r1]
  lsl r2,r7,2
  add r2,r4,r2
  str r0,[r2]
  add r7,1
@@scratch_next_overflow:
  add r5,1
  b @@scratch_scan_overflow
@@scratch_done:
  mov r0,r4
  add sp,12
  pop {r4,r5,r6,r7,pc}
  .pool

.org ${hex32(bagGetPocketForItemAddress)}
  push {r4,r5,r6,r7,lr}
  sub sp,4
  mov r4,r0
  mov r5,r2
  mov r6,r3
  mov r7,r1
  mov r0,r7
  mov r1,5
  ldr r2,[sp,0x18]
  bl ${hex32(itemLoadParamAddress)}
  str r0,[sp]
  ldr r1,=${hex32(firstItemId)}
  cmp r7,r1
  bcc @@pocket_vanilla
  sub r2,r7,r1
  ldr r1,=${hex32(entries.length)}
  cmp r2,r1
  bcs @@pocket_vanilla
  mov r0,r7
  bl ${hex32(itemIsTmHmAddress)}
  cmp r0,0
  beq @@pocket_expanded_lookup
  mov r0,3
  b @@pocket_store_expanded
@@pocket_expanded_lookup:
  ldr r1,=${hex32(firstItemId)}
  sub r2,r7,r1
  ldr r0,=${hex32(pocketTableAddress)}
  mov r1,r2
  lsr r1,r1,1
  ldrb r0,[r0,r1]
  mov r1,1
  tst r2,r1
  beq @@pocket_low_nibble
  lsr r0,r0,4
@@pocket_low_nibble:
  mov r1,0x0F
  and r0,r1
@@pocket_store_expanded:
  str r0,[sp]
@@pocket_expanded_storage:
  bl ${hex32(storageHelperAddress)}
  str r0,[r5]
  mov r0,0x80
  str r0,[r6]
  ldr r0,[sp]
  add sp,4
  pop {r4,r5,r6,r7,pc}
@@pocket_vanilla:
  ldr r0,[sp]
  cmp r0,7
  bhi @@pocket_return
  cmp r0,0
  beq @@pocket_items
  cmp r0,1
  beq @@pocket_medicine
  cmp r0,2
  beq @@pocket_balls
  cmp r0,3
  beq @@pocket_tmhms
  cmp r0,4
  beq @@pocket_berries
  cmp r0,5
  beq @@pocket_mail
  cmp r0,6
  beq @@pocket_battle_items
  b @@pocket_key_items
@@pocket_items:
  mov r1,r4
  str r1,[r5]
  mov r1,0xA5
  str r1,[r6]
  b @@pocket_return
@@pocket_medicine:
  ldr r1,=0x0000051C
  add r1,r4,r1
  str r1,[r5]
  mov r1,0x28
  str r1,[r6]
  b @@pocket_return
@@pocket_balls:
  ldr r1,=0x000006BC
  add r1,r4,r1
  str r1,[r5]
  mov r1,0x0F
  str r1,[r6]
  b @@pocket_return
@@pocket_tmhms:
  ldr r1,=0x0000035C
  add r1,r4,r1
  str r1,[r5]
  mov r1,0x64
  str r1,[r6]
  b @@pocket_return
@@pocket_berries:
  ldr r1,=0x000005BC
  add r1,r4,r1
  str r1,[r5]
  mov r1,0x40
  str r1,[r6]
  b @@pocket_return
@@pocket_mail:
  ldr r1,=0x000004EC
  add r1,r4,r1
  str r1,[r5]
  mov r1,0x0C
  str r1,[r6]
  b @@pocket_return
@@pocket_battle_items:
  ldr r1,=0x000006F8
  add r1,r4,r1
  str r1,[r5]
  mov r1,0x1E
  str r1,[r6]
  b @@pocket_return
@@pocket_key_items:
  ldr r1,=0x00000294
  add r1,r4,r1
  str r1,[r5]
  mov r1,0x32
  str r1,[r6]
@@pocket_return:
  ldr r0,[sp]
  add sp,4
  pop {r4,r5,r6,r7,pc}
  .pool

.org ${hex32(storageHelperAddress)}
  push {r4,lr}
  bl ${hex32(saveDataPtrAddress)}
  mov r1,${overflowStorageSaveTableId}
  bl ${hex32(saveDataSaveTableAddress)}
  ldr r1,=${hex32(overflowStorageOffset)}
  add r4,r0,r1
  ldr r0,[r4]
  ldr r1,=0x4D455449
  cmp r0,r1
  bne @@storage_init
  ldr r0,[r4,4]
  ldr r1,=0x32474142
  cmp r0,r1
  beq @@storage_ready
@@storage_init:
  mov r0,r4
  mov r1,0
  ldr r2,=0x00000300
@@storage_clear:
  str r1,[r0]
  add r0,4
  sub r2,4
  bne @@storage_clear
  ldr r0,=0x4D455449
  str r0,[r4]
  ldr r0,=0x32474142
  str r0,[r4,4]
  ldr r0,=${hex32(firstItemId)}
  strh r0,[r4,8]
  mov r0,0x80
  strh r0,[r4,10]
@@storage_ready:
  mov r0,${overflowStorageSaveTableId}
  bl ${hex32(saveDataSetChecksumAddress)}
  mov r0,r4
  add r0,0x20
  pop {r4,pc}
  .pool

.org ${hex32(medicineScratchBuilderAddress)}
  push {r4,r5,r6,r7,lr}
  sub sp,16
  str r0,[sp]
  str r1,[sp,4]
  .align 4
  ldr r4,[pc,0]
  b @@medicine_scratch_ptr_loaded
  .word ${hex32(medicineScratchAddress)}
@@medicine_scratch_ptr_loaded:
  mov r0,r4
  mov r1,0
  mov r2,0xA0
@@medicine_scratch_clear:
  str r1,[r0]
  add r0,4
  sub r2,4
  bne @@medicine_scratch_clear
  bl ${hex32(storageHelperAddress)}
  str r0,[sp,8]
  mov r7,0
  mov r5,0
@@medicine_scan_overflow:
  cmp r5,0x80
  bcs @@medicine_copy_vanilla
  ldr r1,[sp,8]
  lsl r2,r5,2
  add r1,r1,r2
  ldrh r6,[r1]
  cmp r6,0
  beq @@medicine_next_overflow
  ldrh r2,[r1,2]
  cmp r2,0
  beq @@medicine_next_overflow
  mov r0,r6
  bl ${hex32(itemIsTmHmAddress)}
  cmp r0,0
  bne @@medicine_next_overflow
  ldr r0,=${hex32(pocketTableAddress)}
  mov r1,r5
  lsr r1,r1,1
  ldrb r0,[r0,r1]
  mov r1,1
  tst r5,r1
  beq @@medicine_low_nibble
  lsr r0,r0,4
@@medicine_low_nibble:
  mov r1,0x0F
  and r0,r1
  cmp r0,1
  bne @@medicine_next_overflow
  cmp r7,0x28
  bcs @@medicine_done
  ldr r1,[sp,8]
  lsl r2,r5,2
  add r1,r1,r2
  ldr r0,[r1]
  lsl r2,r7,2
  add r2,r4,r2
  str r0,[r2]
  add r7,1
@@medicine_next_overflow:
  add r5,1
  b @@medicine_scan_overflow
@@medicine_copy_vanilla:
  ldr r0,[sp]
  ldr r1,=0x0000051C
  add r5,r0,r1
  mov r6,0
@@medicine_vanilla_loop:
  cmp r7,0x28
  bcs @@medicine_done
  cmp r6,0x28
  bcs @@medicine_done
  lsl r1,r6,2
  add r1,r5,r1
  ldrh r0,[r1]
  cmp r0,0
  beq @@medicine_next_vanilla
  ldrh r2,[r1,2]
  cmp r2,0
  beq @@medicine_next_vanilla
  ldr r0,[r1]
  lsl r2,r7,2
  add r2,r4,r2
  str r0,[r2]
  add r7,1
@@medicine_next_vanilla:
  add r6,1
  b @@medicine_vanilla_loop
@@medicine_done:
  mov r0,r4
  add sp,16
  pop {r4,r5,r6,r7,pc}
  .pool

.org ${hex32(tableAddress)}
  .halfword 0x${firstItemId.toString(16).toUpperCase().padStart(4, "0")}
  .halfword 0x${entries.length.toString(16).toUpperCase().padStart(4, "0")}
  .halfword 0x${maxRows.toString(16).toUpperCase().padStart(4, "0")}
  .halfword 0x0000
${tableRows}

.org ${hex32(pocketTableAddress)}
${pocketRows.join("\n")}

.org ${hex32(tmhmScratchAddress)}
  .fill 0x00000280, 0xFD

.org ${hex32(medicineScratchAddress)}
  .fill 0x000000A0, 0xFD
.close
`;
  }

  function natureMintsHelper({
    helperAddress,
    entries,
    genderRatioTable,
    fallbackCheckAddress = 0,
    fallbackDispatchAddress = 0,
    pokemonGetValueAddress,
    pokemonChangePersonalityAddress,
    pokemonCalcStatsAddress,
    partyGetPokemonBySlotIndexAddress,
    partyMenuLoadMemberAddress,
    partyMenuDrawMemberPanelAddress,
    partyMenuLoadMemberWindowTilesAddress,
    partyMenuDrawStatusAddress,
    partyMenuPrintLongMessageAddress,
    messageLoaderGetNewStringAddress,
    stringTemplateFormatAddress,
    stringTemplateSetNicknameAddress,
    stringTemplateSetNatureNameAddress,
    stringFreeAddress,
    soundPlayEffectAddress,
    divModAddress,
    checkReturnAddress,
    dispatchReturnAddress,
    waitStateAddress,
    appPartyMenuOffset,
    partyMenuUsedItemOffset,
    appCurrSlotOffset,
    appStateOffset,
    appMessageLoaderOffset,
    appTemplateOffset,
    appTmpStringOffset,
    appPartyMemberStatusOffset,
    partyMemberSize,
    successMessageId,
    soundEffectId,
    monDataPersonality,
    monDataSpecies,
    monDataOtId,
    monDataIsEgg,
    monDataGender,
    monDataSpeciesExists,
    speciesUnown,
    speciesWurmple,
  }) {
    const dispatchAddress = helperAddress + 0x80;
    const stateAddress = helperAddress + 0x100;
    const findMintAddress = helperAddress + 0x400;
    const canUseAddress = helperAddress + 0x480;
    const applyAddress = helperAddress + 0x540;
    const helperFnsAddress = helperAddress + 0x940;
    const tableAddress = helperAddress + 0xb00;
    const genderRatioAddress = tableAddress + 0x80;
    const rows = entries
      .map(
        (entry) =>
          `  .halfword 0x${entry.itemId.toString(16).toUpperCase().padStart(4, "0")}, 0x${entry.natureIndex
            .toString(16)
            .toUpperCase()
            .padStart(4, "0")}`
      )
      .join("\n");
    const genderRatioBytes = Array.from(genderRatioTable || []);
    const genderRatioRows = [];
    for (let offset = 0; offset < genderRatioBytes.length; offset += 16) {
      genderRatioRows.push(
        `  .byte ${genderRatioBytes
          .slice(offset, offset + 16)
          .map((value) => `0x${value.toString(16).toUpperCase().padStart(2, "0")}`)
          .join(", ")}`
      );
    }
    const restoreCheckFrame = `  mov r0,r4
  mov r1,r5
  ldr r4,[sp]
  ldr r5,[sp,4]
  ldr r3,[sp,8]
  add sp,12
  mov lr,r3`;
    const checkNoMatchCode = fallbackCheckAddress
      ? `${restoreCheckFrame}
  ldr r3,=${hex32(fallbackCheckAddress | 1)}
  bx r3`
      : `${restoreCheckFrame}
  push {r3,r4,r5,r6,r7,lr}
  sub sp,0x18
  str r1,[sp,4]
  mov r6,r0
  ldr r3,=${hex32(checkReturnAddress)}
  bx r3`;
    const restoreDispatchFrame = `  mov r0,r4
  ldr r4,[sp]
  ldr r5,[sp,4]
  ldr r3,[sp,8]
  add sp,12
  mov lr,r3`;
    const dispatchNoMatchCode = fallbackDispatchAddress
      ? `${restoreDispatchFrame}
  ldr r3,=${hex32(fallbackDispatchAddress | 1)}
  bx r3`
      : `${restoreDispatchFrame}
  push {r4,lr}
  mov r4,r0
  ldr r0,=${hex32(appPartyMenuOffset)}
  ldr r0,[r4,r0]
  ldr r3,=${hex32(dispatchReturnAddress)}
  bx r3`;

    return `.nds
.create "output.bin", ${hex32(helperAddress)}
.thumb
.org ${hex32(helperAddress)}
  push {r4,r5,lr}
  mov r4,r0
  mov r5,r1
  mov r0,r1
  bl ${hex32(findMintAddress)}
  cmp r0,0xFF
  bne @@check_mint
${checkNoMatchCode}
@@check_mint:
  mov r1,r0
  mov r0,r4
  bl ${hex32(canUseAddress)}
  pop {r4,r5,pc}
  .pool

.org ${hex32(dispatchAddress)}
  push {r4,r5,lr}
  mov r4,r0
  ldr r1,=${hex32(appPartyMenuOffset)}
  ldr r0,[r4,r1]
  ldrh r0,[r0,${partyMenuUsedItemOffset}]
  bl ${hex32(findMintAddress)}
  cmp r0,0xFF
  bne @@dispatch_mint
${dispatchNoMatchCode}
@@dispatch_mint:
  ldr r1,=${hex32(appStateOffset)}
  ldr r2,=${hex32(stateAddress | 1)}
  str r2,[r4,r1]
  pop {r4,r5,pc}
  .pool

.org ${hex32(stateAddress)}
  push {r4,r5,r6,r7,lr}
  sub sp,0x18
  mov r4,r0
  str r4,[sp,0]
  ldr r1,=${hex32(appPartyMenuOffset)}
  ldr r5,[r4,r1]
  str r5,[sp,4]
  ldrh r0,[r5,${partyMenuUsedItemOffset}]
  bl ${hex32(findMintAddress)}
  cmp r0,0xFF
  beq @@state_finish
  str r0,[sp,16]
  ldr r1,=${hex32(appCurrSlotOffset)}
  ldrb r6,[r4,r1]
  str r6,[sp,12]
  ldr r0,[r5]
  mov r1,r6
  bl ${hex32(partyGetPokemonBySlotIndexAddress)}
  str r0,[sp,8]
  ldr r1,[sp,16]
  bl ${hex32(applyAddress)}
  cmp r0,0xFF
  beq @@state_finish
  ldr r0,[sp,0]
  ldr r1,[sp,12]
  bl ${hex32(partyMenuLoadMemberAddress)}
  ldr r0,[sp,0]
  ldr r1,[sp,12]
  bl ${hex32(partyMenuDrawMemberPanelAddress)}
  ldr r0,[sp,0]
  ldr r1,[sp,12]
  bl ${hex32(partyMenuLoadMemberWindowTilesAddress)}
  ldr r1,[sp,12]
  mov r2,${partyMemberSize}
  mul r1,r2
  ldr r2,=${hex32(appPartyMemberStatusOffset)}
  add r1,r1,r2
  ldr r2,[sp,0]
  add r2,r2,r1
  ldrh r2,[r2]
  ldr r0,[sp,0]
  ldr r1,[sp,12]
  bl ${hex32(partyMenuDrawStatusAddress)}
  ldr r4,[sp,0]
  ldr r0,=${hex32(appTemplateOffset)}
  ldr r0,[r4,r0]
  mov r1,0
  ldr r2,[sp,8]
  bl ${hex32(stringTemplateSetNicknameAddress)}
  ldr r0,=${hex32(appTemplateOffset)}
  ldr r0,[r4,r0]
  mov r1,1
  ldr r2,[sp,16]
  bl ${hex32(stringTemplateSetNatureNameAddress)}
  ldr r0,=${hex32(appMessageLoaderOffset)}
  ldr r0,[r4,r0]
  ldr r1,=${hex32(successMessageId)}
  bl ${hex32(messageLoaderGetNewStringAddress)}
  mov r7,r0
  ldr r0,=${hex32(appTemplateOffset)}
  ldr r0,[r4,r0]
  ldr r1,=${hex32(appTmpStringOffset)}
  ldr r1,[r4,r1]
  mov r2,r7
  bl ${hex32(stringTemplateFormatAddress)}
  mov r0,r7
  bl ${hex32(stringFreeAddress)}
  ldr r0,[sp,0]
  ldr r1,=0xFFFFFFFF
  mov r2,1
  bl ${hex32(partyMenuPrintLongMessageAddress)}
  ldr r0,=${hex32(soundEffectId)}
  bl ${hex32(soundPlayEffectAddress)}
@@state_finish:
  ldr r4,[sp,0]
  ldr r0,=${hex32(appStateOffset)}
  ldr r1,=${hex32(waitStateAddress | 1)}
  str r1,[r4,r0]
  mov r0,5
  add sp,0x18
  pop {r4,r5,r6,r7,pc}
  .pool

.org ${hex32(findMintAddress)}
  push {r4,lr}
  ldr r2,=${hex32(tableAddress)}
  ldr r1,[r2]
  add r2,4
  mov r4,0
@@find_loop:
  cmp r4,r1
  bcs @@find_none
  lsl r3,r4,2
  add r3,r2,r3
  ldrh r3,[r3]
  cmp r0,r3
  beq @@find_hit
  add r4,1
  b @@find_loop
@@find_hit:
  lsl r3,r4,2
  add r2,r2,r3
  ldrh r0,[r2,2]
  pop {r4,pc}
@@find_none:
  mov r0,0xFF
  pop {r4,pc}
  .pool

.org ${hex32(canUseAddress)}
  push {r4,r5,lr}
  mov r4,r0
  mov r5,r1
  ldr r1,=${hex32(monDataSpeciesExists)}
  mov r2,0
  bl ${hex32(pokemonGetValueAddress)}
  cmp r0,0
  beq @@can_false
  mov r0,r4
  ldr r1,=${hex32(monDataIsEgg)}
  mov r2,0
  bl ${hex32(pokemonGetValueAddress)}
  cmp r0,0
  bne @@can_false
  mov r0,r4
  ldr r1,=${hex32(monDataPersonality)}
  mov r2,0
  bl ${hex32(pokemonGetValueAddress)}
  mov r1,25
  bl ${hex32(helperFnsAddress + 0x40)}
  cmp r0,r5
  beq @@can_false
  mov r0,1
  pop {r4,r5,pc}
@@can_false:
  mov r0,0
  pop {r4,r5,pc}
  .pool

.org ${hex32(applyAddress)}
  push {r4,r5,r6,r7,lr}
  sub sp,0x30
  mov r4,r0
  mov r5,r1
  str r4,[sp,0]
  str r5,[sp,4]
  ldr r1,=${hex32(monDataPersonality)}
  mov r2,0
  bl ${hex32(pokemonGetValueAddress)}
  mov r6,r0
  str r6,[sp,8]
  mov r1,25
  bl ${hex32(helperFnsAddress + 0x40)}
  cmp r0,r5
  beq @@apply_fail
  mov r7,r5
  sub r7,r7,r0
  bpl @@delta_ready
  add r7,25
@@delta_ready:
  add r6,r6,r7
  str r6,[sp,40]
  mov r0,0
  str r0,[sp,44]
  ldr r0,[sp,0]
  ldr r1,=${hex32(monDataSpecies)}
  mov r2,0
  bl ${hex32(pokemonGetValueAddress)}
  str r0,[sp,12]
  ldr r0,[sp,0]
  ldr r1,=${hex32(monDataOtId)}
  mov r2,0
  bl ${hex32(pokemonGetValueAddress)}
  str r0,[sp,16]
  ldr r1,[sp,8]
  bl ${hex32(helperFnsAddress)}
  str r0,[sp,20]
  ldr r0,[sp,0]
  ldr r1,=${hex32(monDataGender)}
  mov r2,0
  bl ${hex32(pokemonGetValueAddress)}
  str r0,[sp,24]
  ldr r0,[sp,8]
  mov r1,1
  and r0,r1
  str r0,[sp,28]
  ldr r6,[sp,40]
  mov r0,r6
  mov r1,1
  and r0,r1
  ldr r1,[sp,28]
  cmp r0,r1
  beq @@candidate_seed_ready
  add r6,25
  str r6,[sp,40]
@@candidate_seed_ready:
  ldr r0,[sp,12]
  ldr r1,=${hex32(speciesUnown)}
  cmp r0,r1
  bne @@no_old_unown
  ldr r0,[sp,8]
  bl ${hex32(helperFnsAddress + 0x80)}
  b @@store_old_unown
@@no_old_unown:
  mov r0,0xFF
@@store_old_unown:
  str r0,[sp,32]
  ldr r0,[sp,12]
  ldr r1,=${hex32(speciesWurmple)}
  cmp r0,r1
  bne @@no_old_wurmple
  ldr r0,[sp,8]
  bl ${hex32(helperFnsAddress + 0xc0)}
  b @@store_old_wurmple
@@no_old_wurmple:
  mov r0,0xFF
@@store_old_wurmple:
  str r0,[sp,36]
@@candidate_loop:
  ldr r7,[sp,44]
  ldr r0,[sp,20]
  cmp r0,0
  beq @@normal_limit
  ldr r0,=0x00800000
  b @@limit_ready
@@normal_limit:
  ldr r0,=0x00008000
@@limit_ready:
  cmp r7,r0
  bcs @@apply_fail
  ldr r6,[sp,40]
  mov r0,r6
  mov r1,1
  and r0,r1
  ldr r1,[sp,28]
  cmp r0,r1
  bne @@candidate_next
  ldr r0,[sp,16]
  mov r1,r6
  bl ${hex32(helperFnsAddress)}
  ldr r1,[sp,20]
  cmp r0,r1
  bne @@candidate_next
  ldr r0,[sp,12]
  mov r1,r6
  bl ${hex32(helperFnsAddress + 0x100)}
  ldr r1,[sp,24]
  cmp r0,r1
  bne @@candidate_next
  ldr r1,[sp,32]
  cmp r1,0xFF
  beq @@check_wurmple
  mov r0,r6
  bl ${hex32(helperFnsAddress + 0x80)}
  ldr r1,[sp,32]
  cmp r0,r1
  bne @@candidate_next
@@check_wurmple:
  ldr r1,[sp,36]
  cmp r1,0xFF
  beq @@candidate_found
  mov r0,r6
  bl ${hex32(helperFnsAddress + 0xc0)}
  ldr r1,[sp,36]
  cmp r0,r1
  bne @@candidate_next
@@candidate_found:
  ldr r0,[sp,0]
  mov r1,r6
  bl ${hex32(pokemonChangePersonalityAddress)}
  ldr r0,[sp,0]
  bl ${hex32(pokemonCalcStatsAddress)}
  ldr r0,[sp,4]
  add sp,0x30
  pop {r4,r5,r6,r7,pc}
@@candidate_next:
  ldr r6,[sp,40]
  add r6,50
  str r6,[sp,40]
  ldr r7,[sp,44]
  add r7,1
  str r7,[sp,44]
  b @@candidate_loop
@@apply_fail:
  mov r0,0xFF
  add sp,0x30
  pop {r4,r5,r6,r7,pc}
  .pool

.org ${hex32(helperFnsAddress)}
  push {r2,r3,lr}
  mov r2,r0
  lsr r3,r2,16
  eor r2,r3
  mov r3,r1
  lsr r0,r3,16
  eor r3,r0
  eor r2,r3
  cmp r2,8
  bcc @@shiny_true
  mov r0,0
  pop {r2,r3,pc}
@@shiny_true:
  mov r0,1
  pop {r2,r3,pc}

.org ${hex32(helperFnsAddress + 0x40)}
  push {r3,lr}
  ldr r3,=${hex32(divModAddress)}
  blx r3
  mov r0,r1
  pop {r3,pc}
  .pool

.org ${hex32(helperFnsAddress + 0x80)}
  push {r4,lr}
  mov r4,r0
  ldr r1,=0x03000000
  and r1,r4
  lsr r1,r1,18
  ldr r2,=0x00030000
  and r2,r4
  lsr r2,r2,12
  orr r1,r2
  ldr r2,=0x00000300
  and r2,r4
  lsr r2,r2,6
  orr r1,r2
  mov r2,3
  and r4,r2
  orr r1,r4
  mov r0,r1
  mov r1,28
  bl ${hex32(helperFnsAddress + 0x40)}
  pop {r4,pc}
  .pool

.org ${hex32(helperFnsAddress + 0xc0)}
  push {lr}
  lsr r0,r0,16
  mov r1,10
  bl ${hex32(helperFnsAddress + 0x40)}
  cmp r0,5
  bcc @@wurmple_low
  mov r0,1
  pop {pc}
@@wurmple_low:
  mov r0,0
  pop {pc}
  .pool

.org ${hex32(helperFnsAddress + 0x100)}
  push {r4,lr}
  mov r4,r1
  ldr r1,=${genderRatioBytes.length}
  cmp r0,r1
  bcs @@gender_none
  ldr r2,=${hex32(genderRatioAddress)}
  add r2,r2,r0
  ldrb r2,[r2]
  cmp r2,0
  beq @@gender_male
  cmp r2,254
  beq @@gender_female
  cmp r2,255
  beq @@gender_none
  mov r0,0xFF
  and r4,r0
  cmp r2,r4
  bhi @@gender_female
@@gender_male:
  mov r0,0
  pop {r4,pc}
@@gender_female:
  mov r0,1
  pop {r4,pc}
@@gender_none:
  mov r0,2
  pop {r4,pc}
  .pool

.org ${hex32(tableAddress)}
  .word ${hex32(entries.length)}
${rows}

.org ${hex32(genderRatioAddress)}
${genderRatioRows.join("\n")}
.close
`;
  }

  function bottleCapsHelper({
    helperAddress,
    entries,
    fallbackCheckAddress = 0,
    fallbackDispatchAddress = 0,
    pokemonGetValueAddress,
    pokemonSetValueAddress,
    pokemonCalcStatsAddress,
    partyGetPokemonBySlotIndexAddress,
    partyMenuLoadMemberAddress,
    partyMenuDrawMemberPanelAddress,
    partyMenuLoadMemberWindowTilesAddress,
    partyMenuDrawStatusAddress,
    partyMenuPrintLongMessageAddress,
    messageLoaderGetNewStringAddress,
    stringTemplateFormatAddress,
    stringTemplateSetNicknameAddress,
    stringFreeAddress,
    soundPlayEffectAddress,
    checkReturnAddress,
    dispatchReturnAddress,
    waitStateAddress,
    appPartyMenuOffset,
    partyMenuUsedItemOffset,
    appCurrSlotOffset,
    appStateOffset,
    appMessageLoaderOffset,
    appTemplateOffset,
    appTmpStringOffset,
    appPartyMemberStatusOffset,
    partyMemberSize,
    successMessageId,
    soundEffectId,
    monDataHpIv,
    monDataIsEgg,
    monDataSpeciesExists,
  }) {
    const dispatchAddress = helperAddress + 0x80;
    const stateAddress = helperAddress + 0x100;
    const findCapAddress = helperAddress + 0x360;
    const canUseAddress = helperAddress + 0x3e0;
    const applyAddress = helperAddress + 0x480;
    const needsCapAddress = helperAddress + 0x5c0;
    const setIvAddress = helperAddress + 0x660;
    const tableAddress = helperAddress + 0x720;
    const rows = entries
      .map(
        (entry) =>
          `  .halfword 0x${entry.itemId.toString(16).toUpperCase().padStart(4, "0")}, 0x${entry.targetParam
            .toString(16)
            .toUpperCase()
            .padStart(4, "0")}`
      )
      .join("\n");
    const restoreCheckFrame = `  mov r0,r4
  mov r1,r5
  ldr r4,[sp]
  ldr r5,[sp,4]
  ldr r3,[sp,8]
  add sp,12
  mov lr,r3`;
    const checkNoMatchCode = fallbackCheckAddress
      ? `${restoreCheckFrame}
  ldr r3,=${hex32(fallbackCheckAddress | 1)}
  bx r3`
      : `${restoreCheckFrame}
  push {r3,r4,r5,r6,r7,lr}
  sub sp,0x18
  str r1,[sp,4]
  mov r6,r0
  ldr r3,=${hex32(checkReturnAddress)}
  bx r3`;
    const restoreDispatchFrame = `  mov r0,r4
  ldr r4,[sp]
  ldr r5,[sp,4]
  ldr r3,[sp,8]
  add sp,12
  mov lr,r3`;
    const dispatchNoMatchCode = fallbackDispatchAddress
      ? `${restoreDispatchFrame}
  ldr r3,=${hex32(fallbackDispatchAddress | 1)}
  bx r3`
      : `${restoreDispatchFrame}
  push {r4,lr}
  mov r4,r0
  ldr r0,=${hex32(appPartyMenuOffset)}
  ldr r0,[r4,r0]
  ldr r3,=${hex32(dispatchReturnAddress)}
  bx r3`;

    return `.nds
.create "output.bin", ${hex32(helperAddress)}
.thumb
.org ${hex32(helperAddress)}
  push {r4,r5,lr}
  mov r4,r0
  mov r5,r1
  mov r0,r1
  bl ${hex32(findCapAddress)}
  cmp r0,0xFE
  bne @@check_cap
${checkNoMatchCode}
@@check_cap:
  mov r1,r0
  mov r0,r4
  bl ${hex32(canUseAddress)}
  pop {r4,r5,pc}
  .pool

.org ${hex32(dispatchAddress)}
  push {r4,r5,lr}
  mov r4,r0
  ldr r1,=${hex32(appPartyMenuOffset)}
  ldr r0,[r4,r1]
  ldrh r0,[r0,${partyMenuUsedItemOffset}]
  bl ${hex32(findCapAddress)}
  cmp r0,0xFE
  bne @@dispatch_cap
${dispatchNoMatchCode}
@@dispatch_cap:
  ldr r1,=${hex32(appStateOffset)}
  ldr r2,=${hex32(stateAddress | 1)}
  str r2,[r4,r1]
  pop {r4,r5,pc}
  .pool

.org ${hex32(stateAddress)}
  push {r4,r5,r6,r7,lr}
  sub sp,0x18
  mov r4,r0
  str r4,[sp,0]
  ldr r1,=${hex32(appPartyMenuOffset)}
  ldr r5,[r4,r1]
  str r5,[sp,4]
  ldrh r0,[r5,${partyMenuUsedItemOffset}]
  bl ${hex32(findCapAddress)}
  cmp r0,0xFE
  beq @@state_finish
  str r0,[sp,16]
  ldr r1,=${hex32(appCurrSlotOffset)}
  ldrb r6,[r4,r1]
  str r6,[sp,12]
  ldr r0,[r5]
  mov r1,r6
  bl ${hex32(partyGetPokemonBySlotIndexAddress)}
  str r0,[sp,8]
  ldr r1,[sp,16]
  bl ${hex32(applyAddress)}
  cmp r0,0xFF
  beq @@state_finish
  ldr r0,[sp,0]
  ldr r1,[sp,12]
  bl ${hex32(partyMenuLoadMemberAddress)}
  ldr r0,[sp,0]
  ldr r1,[sp,12]
  bl ${hex32(partyMenuDrawMemberPanelAddress)}
  ldr r0,[sp,0]
  ldr r1,[sp,12]
  bl ${hex32(partyMenuLoadMemberWindowTilesAddress)}
  ldr r1,[sp,12]
  mov r2,${partyMemberSize}
  mul r1,r2
  ldr r2,=${hex32(appPartyMemberStatusOffset)}
  add r1,r1,r2
  ldr r2,[sp,0]
  add r2,r2,r1
  ldrh r2,[r2]
  ldr r0,[sp,0]
  ldr r1,[sp,12]
  bl ${hex32(partyMenuDrawStatusAddress)}
  ldr r4,[sp,0]
  ldr r0,=${hex32(appTemplateOffset)}
  ldr r0,[r4,r0]
  mov r1,0
  ldr r2,[sp,8]
  bl ${hex32(stringTemplateSetNicknameAddress)}
  ldr r0,=${hex32(appMessageLoaderOffset)}
  ldr r0,[r4,r0]
  ldr r1,[sp,16]
  cmp r1,${monDataHpIv + 1}
  beq @@message_atk
  cmp r1,${monDataHpIv + 2}
  beq @@message_def
  cmp r1,${monDataHpIv + 4}
  beq @@message_spa
  cmp r1,${monDataHpIv + 5}
  beq @@message_spdef
  cmp r1,${monDataHpIv + 3}
  beq @@message_spd
  cmp r1,${monDataHpIv}
  beq @@message_hp
  ldr r1,=${hex32(successMessageId + 6)}
  b @@message_ready
@@message_atk:
  ldr r1,=${hex32(successMessageId)}
  b @@message_ready
@@message_def:
  ldr r1,=${hex32(successMessageId + 1)}
  b @@message_ready
@@message_spa:
  ldr r1,=${hex32(successMessageId + 2)}
  b @@message_ready
@@message_spdef:
  ldr r1,=${hex32(successMessageId + 3)}
  b @@message_ready
@@message_spd:
  ldr r1,=${hex32(successMessageId + 4)}
  b @@message_ready
@@message_hp:
  ldr r1,=${hex32(successMessageId + 5)}
@@message_ready:
  bl ${hex32(messageLoaderGetNewStringAddress)}
  mov r7,r0
  ldr r0,=${hex32(appTemplateOffset)}
  ldr r0,[r4,r0]
  ldr r1,=${hex32(appTmpStringOffset)}
  ldr r1,[r4,r1]
  mov r2,r7
  bl ${hex32(stringTemplateFormatAddress)}
  mov r0,r7
  bl ${hex32(stringFreeAddress)}
  ldr r0,[sp,0]
  ldr r1,=0xFFFFFFFF
  mov r2,1
  bl ${hex32(partyMenuPrintLongMessageAddress)}
  ldr r0,=${hex32(soundEffectId)}
  bl ${hex32(soundPlayEffectAddress)}
@@state_finish:
  ldr r4,[sp,0]
  ldr r0,=${hex32(appStateOffset)}
  ldr r1,=${hex32(waitStateAddress | 1)}
  str r1,[r4,r0]
  mov r0,5
  add sp,0x18
  pop {r4,r5,r6,r7,pc}
  .pool

.org ${hex32(findCapAddress)}
  push {r4,lr}
  ldr r2,=${hex32(tableAddress)}
  ldr r1,[r2]
  add r2,4
  mov r4,0
@@find_loop:
  cmp r4,r1
  bcs @@find_none
  lsl r3,r4,2
  add r3,r2,r3
  ldrh r3,[r3]
  cmp r0,r3
  beq @@find_hit
  add r4,1
  b @@find_loop
@@find_hit:
  lsl r3,r4,2
  add r2,r2,r3
  ldrh r0,[r2,2]
  pop {r4,pc}
@@find_none:
  mov r0,0xFE
  pop {r4,pc}
  .pool

.org ${hex32(canUseAddress)}
  push {r4,r5,lr}
  mov r4,r0
  mov r5,r1
  ldr r1,=${hex32(monDataSpeciesExists)}
  mov r2,0
  bl ${hex32(pokemonGetValueAddress)}
  cmp r0,0
  beq @@can_false
  mov r0,r4
  ldr r1,=${hex32(monDataIsEgg)}
  mov r2,0
  bl ${hex32(pokemonGetValueAddress)}
  cmp r0,0
  bne @@can_false
  mov r0,r4
  mov r1,r5
  bl ${hex32(needsCapAddress)}
  cmp r0,0
  beq @@can_false
  mov r0,1
  pop {r4,r5,pc}
@@can_false:
  mov r0,0
  pop {r4,r5,pc}
  .pool

.org ${hex32(applyAddress)}
  push {r4,r5,r6,r7,lr}
  sub sp,12
  mov r4,r0
  mov r5,r1
  mov r0,r4
  mov r1,r5
  bl ${hex32(needsCapAddress)}
  cmp r0,0
  beq @@apply_fail
  mov r7,0
  cmp r5,0xFF
  beq @@apply_all
  mov r0,r4
  mov r1,r5
  bl ${hex32(setIvAddress)}
  orr r7,r0
  b @@apply_done
@@apply_all:
  mov r6,0
@@apply_all_loop:
  cmp r6,6
  bcs @@apply_done
  mov r0,r4
  ldr r1,=${hex32(monDataHpIv)}
  add r1,r6
  bl ${hex32(setIvAddress)}
  orr r7,r0
  add r6,1
  b @@apply_all_loop
@@apply_done:
  cmp r7,0
  beq @@apply_fail
  mov r0,r4
  bl ${hex32(pokemonCalcStatsAddress)}
  mov r0,0
  add sp,12
  pop {r4,r5,r6,r7,pc}
@@apply_fail:
  mov r0,0xFF
  add sp,12
  pop {r4,r5,r6,r7,pc}
  .pool

.org ${hex32(needsCapAddress)}
  push {r4,r5,r6,lr}
  mov r4,r0
  mov r5,r1
  cmp r5,0xFF
  beq @@needs_all
  mov r0,r4
  mov r1,r5
  mov r2,0
  bl ${hex32(pokemonGetValueAddress)}
  cmp r0,31
  bcc @@needs_true
  mov r0,0
  pop {r4,r5,r6,pc}
@@needs_all:
  mov r6,0
@@needs_all_loop:
  cmp r6,6
  bcs @@needs_false
  mov r0,r4
  ldr r1,=${hex32(monDataHpIv)}
  add r1,r6
  mov r2,0
  bl ${hex32(pokemonGetValueAddress)}
  cmp r0,31
  bcc @@needs_true
  add r6,1
  b @@needs_all_loop
@@needs_true:
  mov r0,1
  pop {r4,r5,r6,pc}
@@needs_false:
  mov r0,0
  pop {r4,r5,r6,pc}
  .pool

.org ${hex32(setIvAddress)}
  push {r4,r5,lr}
  sub sp,4
  mov r4,r0
  mov r5,r1
  mov r2,0
  bl ${hex32(pokemonGetValueAddress)}
  cmp r0,31
  bcs @@set_skip
  mov r0,31
  str r0,[sp]
  mov r0,r4
  mov r1,r5
  mov r2,sp
  bl ${hex32(pokemonSetValueAddress)}
  mov r0,1
  add sp,4
  pop {r4,r5,pc}
@@set_skip:
  mov r0,0
  add sp,4
  pop {r4,r5,pc}
  .pool

.org ${hex32(tableAddress)}
  .word ${hex32(entries.length)}
${rows}
.close
`;
  }

  return {
    bottleCapsHelper,
    extraTmsHelper,
    infiniteCandyBagRemovalHelper,
    infiniteCandyChainHelper,
    infiniteCandyPocketRemovalHelper,
    itemExpansionHelper,
    itemRenewalPartyHeldItemHelper,
    itemRenewalWritebackHelper,
    modernBurnHelper,
    modernConfusionHelper,
    modernFreezeHelper,
    modernParalysisThunderWaveHelper,
    modernSleepHelper,
    natureMintsHelper,
    natureStatColorsHelper,
  };
});
