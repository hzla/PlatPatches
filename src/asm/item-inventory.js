(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.PlatinumPatcherItemInventoryAsm = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const MARKER = "ITEMUIV3";
  const PAYLOAD_SIZE = 0x1000;
  const EXPORTS = [
    "loadItemTable", "indexItemTable", "createContext", "getSlot", "hasPocketItems",
    "allocateController", "createBagHeap", "initNames", "freeNames", "loadNames",
    "removeFromView", "reorderView", "canMoveEntry", "newCursor", "restoreCursor", "saveCursor",
    "buildView", "effectivePocket", "berryNumber", "fieldUseCheck",
    "battleInit", "battleSlot", "battleGetItem", "battleLastUsed", "battleTryUse",
    "battleNameItem", "battleNameParam", "battleAmount", "battleAmountParam", "battleUseName", "battleUseDescription",
    "registerItem", "checkBerryTag", "vanillaHasPocketItems", "setLegacyCursor", "configuration",
  ];
  const VANILLA_CAPACITIES = [165, 40, 15, 100, 64, 12, 30, 50];
  const VANILLA_OFFSETS = [0, 0x51c, 0x6bc, 0x35c, 0x5bc, 0x4ec, 0x6f8, 0x294];
  const ORIGINAL_POINTERS = 0x4a4;
  const NAMES = ORIGINAL_POINTERS + 32;
  const MAX_NAMES = 293;
  const VIEWS = NAMES + MAX_NAMES * 4;
  const BATTLE_COUNTS = 0x115c;
  const BATTLE_EMPTY = 0x1168;
  const BATTLE_ARRAYS = 0x116c;
  const hex = (value) => `0x${(value >>> 0).toString(16)}`;

  function fieldSource({ archiveEntries, legacy, berryNumbers }) {
    const capacities = VANILLA_CAPACITIES.map((n, p) => n + archiveEntries.filter((e) => e.fieldPocket === p).length);
    let end = VIEWS;
    const viewOffsets = capacities.map((n) => { const start = end; end += 16 + n * 4; return start; });
    const storage = hex(legacy.itemFileIdAddress + 0x980);
    return `
effectivePocket:
  ldr r1,=468
  sub r0,r1
  cmp r0,${archiveEntries.length}
  bcs @@invalid
  ldr r1,=expandedPockets
  ldrb r0,[r1,r0]
  bx lr
@@invalid:
  mov r0,255
  bx lr
  .pool

getSlot:
  push {r3-r7,lr}
  mov r4,r1
  mov r5,r2
  cmp r4,7
  bhi @@none
  lsl r3,r4,1
  ldr r1,=vanillaCapacities
  ldrh r2,[r1,r3]
  cmp r5,r2
  bcs @@overflow
  ldr r1,=vanillaOffsets
  ldrh r1,[r1,r3]
  add r0,r1
  lsl r1,r5,2
  add r0,r1
  pop {r3-r7,pc}
@@overflow:
  sub r5,r2
  bl ${storage}
  mov r6,r0
  mov r7,128
@@scan:
  ldrh r0,[r6]
  cmp r0,0
  beq @@next
  ldrh r1,[r6,2]
  cmp r1,0
  beq @@next
  bl effectivePocket
  cmp r0,r4
  bne @@next
  cmp r5,0
  beq @@found
  sub r5,1
@@next:
  add r6,4
  sub r7,1
  bne @@scan
@@none:
  mov r0,0
  pop {r3-r7,pc}
@@found:
  mov r0,r6
  pop {r3-r7,pc}
  .pool

hasPocketItems:
  push {r3-r7,lr}
  mov r4,r0
  mov r5,r1
  mov r6,0
@@loop:
  mov r0,r4
  mov r1,r5
  mov r2,r6
  bl getSlot
  cmp r0,0
  beq @@done
  ldrh r1,[r0]
  ldrh r2,[r0,2]
  cmp r1,0
  beq @@next
  cmp r2,0
  beq @@next
  mov r0,1
  b @@done
@@next:
  add r6,1
  b @@loop
@@done:
  pop {r3-r7,pc}

createContext:
  push {r3-r7,lr}
  mov r4,r0
  mov r5,r1
  mov r0,r2
  bl 0x0207CB08
  mov r6,r0
  mov r7,0
@@next:
  ldrb r2,[r5,r7]
  cmp r2,255
  beq @@done
  cmp r2,7
  bhi @@skip
  ldr r1,=vanillaOffsets
  lsl r0,r2,1
  ldrh r1,[r1,r0]
  add r1,r4
  mov r0,r6
  mov r3,r7
  bl 0x0207CB48
@@skip:
  add r7,1
  cmp r7,8
  bcc @@next
@@done:
  mov r0,r6
  pop {r3-r7,pc}
  .pool

allocateController:
  ldr r1,=${end}
  ldr r3,=0x0200681D
  bx r3
  .pool
createBagHeap:
  ldr r3,=0x4000
  add r2,r3
  ldr r3,=0x02017FC9
  bx r3
  .pool

buildView:
  push {r3-r7,lr}
  sub sp,16
  mov r4,r0
  mov r5,r1
  mov r6,r2
  str r0,[r6]
  lsl r1,r5,1
  ldr r0,=vanillaOffsets
  ldrh r0,[r0,r1]
  add r0,r4
  str r0,[r6,4]
  ldr r0,=viewCapacities
  ldrh r0,[r0,r1]
  str r0,[r6,8]
  str r5,[r6,12]
  add r6,16
  str r6,[sp]
  str r0,[sp,4]
  mov r2,r6
  mov r1,0
@@clear:
  str r1,[r2]
  add r2,4
  sub r0,1
  bne @@clear
  mov r7,0
  mov r0,0
  str r0,[sp,8]
@@collect:
  mov r0,r4
  mov r1,r5
  mov r2,r7
  bl getSlot
  cmp r0,0
  beq @@sort
  ldrh r1,[r0]
  cmp r1,0
  beq @@next
  ldrh r1,[r0,2]
  cmp r1,0
  beq @@next
  ldr r1,[sp,8]
  ldr r2,[sp,4]
  cmp r1,r2
  bcs @@sort
  ldr r0,[r0]
  str r0,[r6]
  add r6,4
  add r1,1
  str r1,[sp,8]
@@next:
  add r7,1
  b @@collect
@@sort:
  ldr r4,[sp]
  ldr r6,[sp,8]
  mov r7,1
@@outer:
  cmp r7,r6
  bcs @@done
  mov r0,r7
  str r0,[sp,12]
@@inner:
  ldr r0,[sp,12]
  cmp r0,0
  beq @@advance
  lsl r0,r0,2
  add r0,r4
  str r0,[sp,4]
  ldrh r0,[r0]
  mov r1,r5
  bl viewSortKey
  mov r3,r0
  str r3,[sp,8]
  ldr r0,[sp,4]
  sub r0,4
  ldrh r0,[r0]
  mov r1,r5
  bl viewSortKey
  ldr r3,[sp,8]
  cmp r0,r3
  bls @@advance
  ldr r0,[sp,4]
  ldr r1,[r0]
  sub r0,4
  ldr r2,[r0]
  str r1,[r0]
  str r2,[r0,4]
  ldr r0,[sp,12]
  sub r0,1
  str r0,[sp,12]
  b @@inner
@@advance:
  add r7,1
  b @@outer
@@done:
  mov r0,r4
  add sp,16
  pop {r3-r7,pc}
  .pool

viewSortKey:
  cmp r1,3
  beq @@tm
  ldr r1,=468
  cmp r0,r1
  bcs @@return
  mov r0,0
@@return:
  bx lr
@@tm:
  push {r3,lr}
  bl 0x0207D2B4
  cmp r0,92
  bcc @@tm_done
  cmp r0,100
  bcs @@tm_done
  add r0,164
@@tm_done:
  pop {r3,pc}
  .pool

initNames:
  push {r3-r7,lr}
  mov r4,r0
  ldr r1,=${ORIGINAL_POINTERS}
  add r0,r1
  ldr r2,=${end - ORIGINAL_POINTERS}
  mov r1,0
@@clear:
  str r1,[r0]
  add r0,4
  sub r2,4
  bne @@clear
  mov r0,r4
  add r0,0xC4
  ldr r5,[r0]
  add r5,4
  mov r6,0
@@pockets:
  ldr r0,[r5]
  cmp r0,0
  beq @@names
  lsl r1,r6,2
  ldr r2,=${ORIGINAL_POINTERS}
  add r2,r4
  str r0,[r2,r1]
  ldrb r1,[r5,8]
  lsl r0,r1,2
  ldr r2,=viewOffsets
  ldr r2,[r2,r0]
  add r2,r4
  mov r0,r4
  add r0,0xC8
  ldr r0,[r0]
  bl buildView
  str r0,[r5]
  mov r1,r4
  add r1,0xC4
  ldr r1,[r1]
  add r1,0x65
  ldrb r1,[r1]
  bl filterSpecialView
  add r5,12
  add r6,1
  cmp r6,8
  bcc @@pockets
@@names:
  ldr r5,=${NAMES}
  add r5,r4
  mov r6,0
@@name:
  mov r0,18
  mov r1,6
  bl 0x02023790
  str r0,[r5]
  add r5,4
  add r6,1
  ldr r0,=${MAX_NAMES}
  cmp r6,r0
  bcc @@name
  pop {r3-r7,pc}
  .pool

freeNames:
  push {r3-r7,lr}
  mov r4,r0
  add r0,0xC4
  ldr r5,[r0]
  add r5,4
  ldr r6,=${ORIGINAL_POINTERS}
  add r6,r4
  mov r7,8
@@restore:
  ldr r0,[r6]
  str r0,[r5]
  add r6,4
  add r5,12
  sub r7,1
  bne @@restore
  ldr r5,=${NAMES}
  add r5,r4
  ldr r6,=${MAX_NAMES}
@@free:
  ldr r0,[r5]
  bl 0x020237BC
  add r5,4
  sub r6,1
  bne @@free
  pop {r3-r7,pc}
  .pool

loadNames:
  push {r3-r7,lr}
  sub sp,8
  mov r4,r0
  add r0,0xC4
  ldr r0,[r0]
  mov r1,r0
  add r1,0x64
  ldrb r1,[r1]
  mov r2,12
  mul r1,r2
  add r0,4
  add r5,r0,r1
  ldr r0,[r5]
  sub r0,8
  ldr r0,[r0]
  str r0,[sp]
  add r0,3
  mov r1,6
  bl 0x02013A04
  ldr r1,=0x160
  str r0,[r4,r1]
  mov r2,32
  mov r3,0
  sub r3,3
  bl addMessage
  mov r6,0
  ldr r7,=${NAMES}
  add r7,r4
@@loop:
  ldr r0,[sp]
  cmp r6,r0
  bcs @@finish
  ldr r0,[r5]
  lsl r1,r6,2
  add r0,r1
  ldrh r2,[r0]
  cmp r2,0
  beq @@finish
  ldrh r0,[r0,2]
  cmp r0,0
  beq @@finish
  ldr r1,[r7]
  mov r3,6
  ldrb r0,[r5,8]
  cmp r0,3
  bne @@item
  ldr r0,=0x120
  ldr r0,[r4,r0]
  bl 0x0223BE94
  b @@append
@@item:
  ldr r0,=0x11C
  ldr r0,[r4,r0]
  bl 0x0223BE84
@@append:
  ldr r0,=0x160
  ldr r0,[r4,r0]
  ldr r1,[r7]
  mov r2,r6
  bl 0x02013A6C
  add r7,4
  add r6,1
  b @@loop
@@finish:
  mov r0,r4
  add r0,0xC4
  ldr r0,[r0]
  add r0,0x65
  ldrb r0,[r0]
  cmp r0,5
  beq @@padding
  ldrb r0,[r5,8]
  mov r2,41
  cmp r0,3
  beq @@blank
  cmp r0,4
  bne @@close
@@blank:
  mov r2,32
@@close:
  mov r3,0
  sub r3,2
  bl addMessage
  add r6,1
@@padding:
  mov r2,32
  mov r3,0
  sub r3,3
  bl addMessage
  add r6,2
  strh r6,[r5,10]
  cmp r6,255
  bls @@legacy_count
  mov r6,255
@@legacy_count:
  strb r6,[r5,9]
  add sp,8
  pop {r3-r7,pc}
addMessage:
  ldr r0,=0x160
  ldr r0,[r4,r0]
  ldr r1,=0x114
  ldr r1,[r4,r1]
  ldr r7,=0x02013A4D
  bx r7
  .pool

removeFromView:
  push {r4-r7,lr}
  sub sp,4
  mov r4,r0
  mov r5,r2
  mov r6,r3
  ldr r7,[sp,24]
  sub r0,16
  ldr r0,[r0]
  mov r1,r5
  mov r2,r6
  mov r3,r7
  bl 0x0207D60C
  cmp r0,0
  beq @@done
  str r0,[sp]
  mov r2,r4
  sub r2,16
  ldr r0,[r2]
  ldr r1,[r2,12]
  bl buildView
  ldr r0,[sp]
@@done:
  add sp,4
  pop {r4-r7,pc}

reorderView:
  push {r3-r7,lr}
  mov r4,r0
  mov r5,r1
  mov r6,r2
  sub r0,16
  ldr r7,[r0,4]
  ldr r0,[r0,12]
  cmp r0,3
  beq @@done
  cmp r0,4
  beq @@done
  ldr r1,=vanillaCapacities
  lsl r0,r0,1
  ldrh r0,[r1,r0]
  str r0,[sp]
  cmp r5,r0
  bcs @@done
  lsl r1,r5,2
  ldrh r2,[r4,r1]
  ldr r1,=468
  cmp r2,r1
  bcs @@done
  mov r0,0
@@count:
  lsl r1,r0,2
  ldrh r2,[r7,r1]
  cmp r2,0
  beq @@clamp
  add r0,1
  ldr r1,[sp]
  cmp r0,r1
  bcc @@count
@@clamp:
  cmp r6,r0
  bls @@move
  mov r6,r0
@@move:
  mov r0,r7
  mov r1,r5
  mov r2,r6
  bl 0x0207CDEC
  mov r2,r4
  sub r2,16
  ldr r0,[r2]
  ldr r1,[r2,12]
  bl buildView
@@done:
  pop {r3-r7,pc}
  .pool

canMoveEntry:
  push {r3-r5,lr}
  mov r4,r0
  add r0,0xC4
  ldr r0,[r0]
  mov r1,r0
  add r1,0x65
  ldrb r1,[r1]
  cmp r1,0
  bne @@no
  mov r1,r0
  add r1,0x64
  ldrb r1,[r1]
  mov r2,12
  mul r1,r2
  add r0,4
  add r5,r0,r1
  ldrb r0,[r5,8]
  cmp r0,3
  beq @@no
  cmp r0,4
  beq @@no
  ldrh r1,[r5,4]
  ldrh r2,[r5,6]
  add r1,r2
  ldr r0,=0x15C
  ldr r0,[r4,r0]
  bl 0x020014F8
  cmp r0,0
  blt @@no
  lsl r0,r0,2
  ldr r1,[r5]
  ldrh r0,[r1,r0]
  ldr r1,=468
  cmp r0,r1
  bcs @@no
  mov r0,1
  pop {r3-r5,pc}
@@no:
  mov r0,0
  pop {r3-r5,pc}
  .pool

newCursor:
  push {r4,lr}
  mov r1,0x44
  bl 0x02018144
  mov r4,r0
  mov r1,0
  mov r2,0x44
@@clear:
  str r1,[r0]
  add r0,4
  sub r2,4
  bne @@clear
  mov r0,r4
  pop {r4,pc}

// Berry-tag callers retain the vanilla u8 API; mirror their updates into the
// wider cache so returning to the bag does not restore a stale position.
setLegacyCursor:
  cmp r1,7
  bhi @@done
  push {r4,lr}
  add r4,r0,r1
  strb r2,[r4,8]
  strb r3,[r0,r1]
  lsl r1,r1,2
  add r0,r1
  add r0,0x24
  strh r2,[r0]
  strh r3,[r0,2]
  pop {r4,pc}
@@done:
  bx lr

restoreCursor:
  push {r3-r7,lr}
  add r0,0xC4
  ldr r4,[r0]
  mov r0,r4
  add r0,0x64
  mov r1,0
  strb r1,[r0]
  mov r0,r4
  add r0,0x6C
  ldr r5,[r0]
  mov r6,r4
  add r6,4
  mov r7,0
@@next:
  ldr r0,[r6]
  cmp r0,0
  beq @@done
  cmp r5,0
  bne @@cached
  mov r2,1
  strh r2,[r6,4]
  mov r2,0
  strh r2,[r6,6]
  b @@advance
@@cached:
  ldrb r0,[r6,8]
  lsl r1,r0,2
  add r1,r5
  add r1,0x24
  ldrh r2,[r1]
  // The native item list reserves row zero for blank padding.
  cmp r2,0
  bne @@position
  mov r2,1
@@position:
  strh r2,[r6,4]
  ldrh r2,[r1,2]
  strh r2,[r6,6]
  ldrh r1,[r5,16]
  cmp r0,r1
  bne @@advance
  mov r0,r4
  add r0,0x64
  strb r7,[r0]
@@advance:
  add r6,12
  add r7,1
  cmp r7,8
  bcc @@next
@@done:
  pop {r3-r7,pc}

saveCursor:
  push {r3-r7,lr}
  add r0,0xC4
  ldr r4,[r0]
  mov r0,r4
  add r0,0x6C
  ldr r5,[r0]
  cmp r5,0
  beq @@done
  mov r6,r4
  add r6,4
  mov r7,0
@@next:
  ldr r0,[r6]
  cmp r0,0
  beq @@pocket
  ldrb r0,[r6,8]
  lsl r1,r0,2
  add r1,r5
  add r1,0x24
  ldrh r2,[r6,4]
  strh r2,[r1]
  cmp r2,255
  bls @@pos
  mov r2,255
@@pos:
  mov r3,r5
  add r3,8
  strb r2,[r3,r0]
  ldrh r2,[r6,6]
  strh r2,[r1,2]
  cmp r2,255
  bls @@scroll
  mov r2,255
@@scroll:
  strb r2,[r5,r0]
  add r6,12
  add r7,1
  cmp r7,8
  bcc @@next
@@pocket:
  mov r0,r4
  add r0,0x64
  ldrb r0,[r0]
  mov r1,12
  mul r0,r1
  add r0,r4
  ldrb r0,[r0,12]
  strh r0,[r5,16]
@@done:
  pop {r3-r7,pc}

berryNumber:
  ldr r1,=468
  cmp r0,r1
  bcc @@vanilla
  sub r0,r1
  cmp r0,${archiveEntries.length}
  bcs @@none
  ldr r1,=berryNumbers
  ldrb r0,[r1,r0]
  bx lr
@@none:
  mov r0,0
  bx lr
@@vanilla:
  ldr r3,=0x0207D345
  bx r3
  .pool

fieldUseCheck:
  push {r2,r3,r5,lr}
  mov r5,r1
  mov r0,r4
  add r0,0xC4
  ldr r0,[r0]
  add r0,0x66
  ldrh r0,[r0]
  ldr r1,=468
  cmp r0,r1
  bcc @@original
  bl effectivePocket
  cmp r0,2
  beq @@block
  cmp r0,5
  beq @@block
  cmp r0,7
  beq @@block
  cmp r5,8
  beq @@block
@@original:
  mov r0,2
  mov r1,r5
  bl 0x020683F4
  pop {r2,r3,r5,pc}
@@block:
  ldr r0,=unsupportedUseCheck + 1
  pop {r2,r3,r5,pc}
unsupportedUseCheck:
  mov r0,1
  bx lr
  .pool

registerItem:
  ldr r2,=468
  cmp r1,r2
  bcs @@done
  ldr r3,=0x0207D405
  bx r3
@@done:
  bx lr
  .pool

checkBerryTag:
  mov r1,r0
  add r1,0xC4
  ldr r1,[r1]
  add r1,0x66
  ldrh r1,[r1]
  ldr r2,=468
  cmp r1,r2
  bcc @@original
  ldr r3,=0x0223D859
  bx r3
@@original:
  push {r4,lr}
  mov r4,r0
  bl 0x0223FD84
  ldr r3,=0x0223DE81
  bx r3
  .pool

filterSpecialView:
  push {r4-r7,lr}
  mov r4,r0
  mov r5,r0
  sub r0,4
  ldr r2,[r0]
  cmp r1,3
  bcs @@filter
  cmp r1,1
  bne @@done
  cmp r2,5
  beq @@filter
  cmp r2,7
  bne @@done
@@filter:
  mov r6,r4
  sub r0,r4,1
  sub r0,7
  ldr r7,[r0]
@@next:
  ldrh r0,[r6]
  cmp r0,0
  beq @@clear
  ldr r1,=468
  cmp r0,r1
  bcs @@skip
  ldr r0,[r6]
  str r0,[r5]
  add r5,4
@@skip:
  add r6,4
  sub r7,1
  bne @@next
@@clear:
  mov r0,r4
  sub r0,8
  ldr r0,[r0]
  lsl r0,r0,2
  add r0,r4
  mov r1,0
@@zero:
  cmp r5,r0
  bcs @@done
  str r1,[r5]
  add r5,4
  b @@zero
@@done:
  mov r0,r4
  pop {r4-r7,pc}
  .pool

vanillaHasPocketItems:
  cmp r1,7
  bhi @@empty
  lsl r1,r1,1
  ldr r2,=vanillaOffsets
  ldrh r2,[r2,r1]
  add r0,r2
  ldr r2,=vanillaCapacities
  ldrh r2,[r2,r1]
@@loop:
  ldrh r1,[r0]
  cmp r1,0
  beq @@next
  ldrh r1,[r0,2]
  cmp r1,0
  bne @@yes
@@next:
  add r0,4
  sub r2,1
  bne @@loop
@@empty:
  mov r0,0
  bx lr
@@yes:
  mov r0,1
  bx lr
  .pool

.align 4
vanillaOffsets: .halfword ${VANILLA_OFFSETS.join(",")}
vanillaCapacities: .halfword ${VANILLA_CAPACITIES.join(",")}
viewCapacities: .halfword ${capacities.join(",")}
viewOffsets: .word ${viewOffsets.join(",")}
expandedPockets: .byte ${Array.from({ length: 128 }, (_, i) => archiveEntries[i]?.fieldPocket ?? 255).join(",")}
berryNumbers: .byte ${Array.from({ length: 128 }, (_, i) => berryNumbers[i] ?? 0).join(",")}
`;
  }

  function battleLayout(capacities) {
    let end = BATTLE_ARRAYS;
    const offsets = capacities.map((n) => { const start = end; end += Math.max(1, n) * 4; return start; });
    return { end, offsets };
  }

  function battleSource({ battleCapacities }) {
    const { end, offsets } = battleLayout(battleCapacities);
    return `
battleInit:
  push {r3-r7,lr}
  sub sp,16
  mov r4,r0
  ldr r1,=${BATTLE_COUNTS}
  add r0,r1
  ldr r2,=${end - BATTLE_COUNTS}
  mov r1,0
@@clear:
  str r1,[r0]
  add r0,4
  sub r2,4
  bne @@clear
  mov r5,0
@@pocket:
  mov r6,0
@@item:
  ldr r0,[r4]
  ldr r0,[r0,8]
  mov r1,r5
  mov r2,r6
  bl getSlot
  cmp r0,0
  beq @@next_pocket
  mov r7,r0
  ldrh r0,[r7]
  cmp r0,0
  beq @@next_item
  ldrh r1,[r7,2]
  cmp r1,0
  beq @@next_item
  mov r1,13
  ldr r2,[r4]
  ldr r2,[r2,12]
  bl 0x0207CFF0
  str r0,[sp]
  mov r0,0
  str r0,[sp,4]
@@category:
  ldr r1,[sp,4]
  ldr r2,=battleMasks
  ldrb r2,[r2,r1]
  ldr r0,[sp]
  tst r0,r2
  beq @@next_category
  lsl r2,r1,1
  ldr r0,=${BATTLE_COUNTS}
  add r0,r4
  add r0,r2
  str r0,[sp,8]
  ldrh r3,[r0]
  ldr r0,=battleCapacities
  ldrh r0,[r0,r2]
  cmp r3,r0
  bcs @@next_category
  lsl r1,r1,2
  ldr r0,=battleOffsets
  ldr r0,[r0,r1]
  add r0,r4
  lsl r1,r3,2
  ldr r2,[r7]
  str r2,[r0,r1]
  add r3,1
  ldr r0,[sp,8]
  strh r3,[r0]
@@next_category:
  ldr r0,[sp,4]
  add r0,1
  str r0,[sp,4]
  cmp r0,5
  bcc @@category
@@next_item:
  add r6,1
  b @@item
@@next_pocket:
  add r5,1
  cmp r5,8
  bcc @@pocket
  mov r5,0
@@pages:
  ldr r0,=${BATTLE_COUNTS}
  add r0,r4
  lsl r1,r5,1
  ldrh r0,[r0,r1]
  ldr r1,=0x114F
  add r1,r4
  mov r2,r0
  cmp r2,255
  bls @@legacy
  mov r2,255
@@legacy:
  strb r2,[r1,r5]
  mov r1,0
  cmp r0,0
  beq @@store_page
  sub r0,1
@@divide:
  cmp r0,6
  bcc @@store_page
  sub r0,6
  add r1,1
  b @@divide
@@store_page:
  ldr r0,=0x1154
  add r0,r4
  strb r1,[r0,r5]
  ldr r0,[r4]
  add r0,0x2C
  ldrb r2,[r0,r5]
  cmp r2,r1
  bls @@advance_page
  strb r1,[r0,r5]
@@advance_page:
  add r5,1
  cmp r5,5
  bcc @@pages
  add sp,16
  pop {r3-r7,pc}
  .pool

battleSlot:
  ldr r2,=0x114D
  ldrb r2,[r0,r2]
  cmp r2,5
  bcs @@empty
  push {r4,lr}
  mov r4,r0
  ldr r3,=${BATTLE_COUNTS}
  add r0,r3
  lsl r3,r2,1
  ldrh r0,[r0,r3]
  cmp r1,r0
  bcs @@not_found
  lsl r2,r2,2
  ldr r0,=battleOffsets
  ldr r0,[r0,r2]
  add r0,r4
  lsl r1,r1,2
  add r0,r1
  pop {r4,pc}
@@not_found:
  mov r0,r4
  pop {r4}
  pop {r3}
  mov lr,r3
@@empty:
  ldr r1,=${BATTLE_EMPTY}
  add r0,r1
  bx lr
  .pool

battleGetItem:
  push {r4,lr}
  mov r4,r0
  ldr r2,=0x114D
  ldrb r2,[r0,r2]
  cmp r2,5
  bcs @@none
  ldr r3,[r0]
  add r3,0x2C
  ldrb r2,[r3,r2]
  mov r3,6
  mul r2,r3
  add r1,r2
  bl battleSlot
  ldrh r1,[r0,2]
  cmp r1,0
  beq @@none
  ldrh r0,[r0]
  pop {r4,pc}
@@none:
  mov r0,0
  pop {r4,pc}
  .pool

battleLastUsed:
  push {r3-r7,lr}
  mov r4,r0
  ldr r5,[r4]
  ldrh r6,[r5,0x20]
  mov r7,0
@@next:
  mov r0,r4
  mov r1,r7
  bl battleSlot
  ldrh r0,[r0]
  cmp r0,0
  beq @@done
  cmp r0,r6
  beq @@found
  add r7,1
  b @@next
@@found:
  mov r0,0
@@divide:
  cmp r7,6
  bcc @@store
  sub r7,6
  add r0,1
  b @@divide
@@store:
  ldr r1,=0x114D
  ldrb r1,[r4,r1]
  add r5,r1
  add r5,0x27
  strb r7,[r5]
  strb r0,[r5,5]
@@done:
  pop {r3-r7,pc}
  .pool

battleTryUse:
  push {r3-r7,lr}
  mov r5,r0
  ldr r4,[r5]
  ldrh r0,[r4,0x1C]
  ldr r1,=468
  cmp r0,r1
  bcc @@original
  bl effectivePocket
  cmp r0,2
  beq @@blocked
  cmp r0,5
  beq @@blocked
  cmp r0,7
  beq @@blocked
@@original:
  ldr r1,=0x114D
  ldrb r1,[r5,r1]
  ldr r3,=0x02226A65
  bx r3
@@blocked:
  ldr r3,=0x02226B6D
  bx r3
  .pool

// These adapters deliberately reproduce the live-register outputs of each
// replaced lookup block, including the original byte-offset index registers.
battleNameItem:
  push {r1-r3,lr}
  mov r0,r5
  mov r1,r7
  bl battleSlot
  ldrh r0,[r0]
  lsl r7,r7,2
  pop {r1-r3,pc}
battleNameParam:
  push {r1,r3,r4,lr}
  mov r0,r5
  lsr r1,r7,2
  bl battleSlot
  ldrh r2,[r0]
  ldr r0,[r5,0x14]
  pop {r1,r3,r4,pc}
battleAmount:
  push {r1-r3,lr}
  mov r0,r5
  mov r1,r6
  bl battleSlot
  ldrh r0,[r0,2]
  lsl r6,r6,2
  pop {r1-r3,pc}
battleAmountParam:
  push {r1,r3,r4,lr}
  mov r0,r5
  lsr r1,r6,2
  bl battleSlot
  ldrh r2,[r0,2]
  ldr r0,[r5,0x14]
  pop {r1,r3,r4,pc}
battleUseName:
  push {r1,r3,r4,lr}
  mov r0,r5
  mov r1,r6
  bl battleSlot
  ldrh r2,[r0]
  ldr r0,[r5,0x14]
  pop {r1,r3,r4,pc}
battleUseDescription:
  push {r3-r5,lr}
  mov r0,r5
  mov r1,r6
  bl battleSlot
  ldrh r1,[r0]
  ldr r2,[r5]
  mov r0,r7
  pop {r3-r5,pc}
.align 4
battleCapacities: .halfword ${battleCapacities.join(",")}
.align 4
battleOffsets: .word ${offsets.join(",")}
battleMasks: .byte 20,8,1,2,0
.align 4
`;
  }

  function source({ address, dataCount, legacy, archiveEntries, berryNumbers, battleCapacities }) {
    return `.nds
.create "output.bin", ${hex(address)}
.thumb
.area ${hex(PAYLOAD_SIZE)},0xFF
.ascii "${MARKER}"
.fill 8,0
.word 3, payloadEnd - ${hex(address)}, ${EXPORTS.length}
${EXPORTS.map((name) => `.word ${name}`).join("\n")}

loadItemTable:
  push {r3-r7,lr}
  mov r4,r0
  ldr r1,=${dataCount * 36}
  bl 0x02018144
  mov r5,r0
  cmp r0,0
  beq @@done
  ldr r2,=${dataCount * 36}
  mov r1,0
@@clear:
  str r1,[r0]
  add r0,4
  sub r2,4
  bne @@clear
  mov r0,15
  mov r1,r4
  bl 0x02006C24
  mov r6,r0
  cmp r0,0
  beq @@free
  mov r7,0
  mov r4,r5
@@member:
  mov r0,r6
  mov r1,r7
  mov r2,r4
  bl 0x02006D28
  add r4,36
  add r7,1
  ldr r0,=${dataCount}
  cmp r7,r0
  bcc @@member
  mov r0,r6
  bl 0x02006CA8
  b @@done
@@free:
  mov r0,r5
  bl 0x020181C4
  mov r5,0
@@done:
  mov r0,r5
  pop {r3-r7,pc}
  .pool

indexItemTable:
  ldr r2,=${dataCount}
  cmp r1,r2
  bcc @@valid
  mov r1,0
@@valid:
  mov r2,36
  mul r1,r2
  add r0,r1
  bx lr
  .pool
.align 4
${fieldSource({ legacy, archiveEntries, berryNumbers })}
.align 4
${battleSource({ battleCapacities })}
.align 4
configuration:
.word ${dataCount}, ${battleLayout(battleCapacities).end}
.endarea
payloadEnd:
.close
`;
  }

  return { MARKER, PAYLOAD_SIZE, EXPORTS, source, VANILLA_CAPACITIES, VANILLA_OFFSETS, NAMES, VIEWS, battleLayout, BATTLE_COUNTS, BATTLE_EMPTY };
});
