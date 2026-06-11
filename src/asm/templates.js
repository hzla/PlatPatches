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

  return {
    infiniteCandyBagRemovalHelper,
    infiniteCandyChainHelper,
    infiniteCandyPocketRemovalHelper,
    itemRenewalPartyHeldItemHelper,
    itemRenewalWritebackHelper,
    modernBurnHelper,
    modernConfusionHelper,
    modernFreezeHelper,
    modernParalysisThunderWaveHelper,
    modernSleepHelper,
    natureStatColorsHelper,
  };
});
