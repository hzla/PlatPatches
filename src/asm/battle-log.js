(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    root.PlatinumBattleLogAsm = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function hex32(value) {
    return `0x${(value >>> 0).toString(16).toUpperCase().padStart(8, "0")}`;
  }

  function battleLogSource(options) {
    const o = options || {};
    const required = [
      "helperAddress",
      "ancestryMember",
      "ancestrySpeciesCount",
      "ancestryStride",
    ];
    for (const key of required) {
      if (!Number.isInteger(o[key])) {
        throw new Error(`Battle-log assembly is missing ${key}.`);
      }
    }

    const api = {
      applicationManagerData: 0x0200682c,
      battleInitGraphics: 0x0223b790,
      battleExitCopyAndFree: 0x0223bcb4,
      battleGetType: 0x0223df0c,
      battleGetStatus: 0x0223ebec,
      battleGetPartyCount: 0x0223df60,
      battleGetPartyPokemon: 0x0223dfac,
      battlerGetTrainerId: 0x0223e0d8,
      battleContextGet: 0x0225b45c,
      battleMonGet: 0x02252060,
      battleDefender: 0x02253954,
      battleTryFaint: 0x022418c0,
      battleGetResult: 0x0223f438,
      fieldUpdate: 0x020526e8,
      cardLoad: 0x02025ac0,
      cardSave: 0x02025a9c,
      crc16: 0x0201d628,
      pokemonGetValue: 0x02074470,
      narcReadPair: 0x02006afc,
      formatNumber: 0x02090184,
      saveRecordingMirror: 0x02025574,
      ...(o.api || {}),
    };

    const A = Object.fromEntries(Object.entries(api).map(([key, value]) => [key, hex32(value)]));
    const helper = hex32(o.helperAddress);

    return `.nds
.create "output.bin", ${helper}
.thumb
.org ${helper}

; Stable eight-byte veneers. The installer patches calls to these addresses.
VeneerInit:
  ldr r3,[pc,0]
  bx r3
  .word HookInit+1
VeneerExit:
  ldr r3,[pc,0]
  bx r3
  .word HookExit+1
VeneerDefender:
  ldr r3,[pc,0]
  bx r3
  .word HookDefender+1
VeneerFaint:
  ldr r3,[pc,0]
  bx r3
  .word HookFaint+1
VeneerFieldUpdate:
  ldr r3,[pc,0]
  bx r3
  .word HookFieldUpdate+1
VeneerSaveRecording:
  ldr r3,[pc,0]
  bx r3
  .word HookSaveRecording+1
VeneerSummary:
  ldr r3,[pc,0]
  bx r3
  .word HookSummary+1

; Battle initialization: clear transient state, classify the battle, and snapshot
; the player's species, held items, and four moves before any battle mutation.
HookInit:
  push {r4,r5,r6,r7,lr}
  mov r4,r0
  ldr r0,=StateBegin
  ldr r1,=StateEnd-StateBegin
  bl ClearBytes
  mov r0,r4
  bl ${A.applicationManagerData}
  mov r5,r0
  ldr r1,=StateBattleSys
  str r5,[r1]
  mov r0,r5
  bl ${A.battleGetType}
  mov r6,r0
  ldr r1,=StateBattleType
  str r6,[r1]
  mov r0,r5
  bl ${A.battleGetStatus}
  mov r7,r0

  ; Trainer only; reject link, Frontier, debug, and recorded playback.
  mov r0,r6
  mov r1,1
  tst r0,r1
  beq @@call_original
  mov r1,0x84
  tst r0,r1
  bne @@call_original
  lsr r0,r6,31
  bne @@call_original
  mov r0,0x10
  tst r7,r0
  bne @@call_original

  mov r0,1
  ldr r1,=StateTrainerCount
  strb r0,[r1]
  mov r0,r6
  mov r1,0x18
  tst r0,r1
  beq @@trainer_count_ready
  mov r0,2
  ldr r1,=StateTrainerCount
  strb r0,[r1]
@@trainer_count_ready:
  mov r0,r5
  mov r1,1
  bl ${A.battlerGetTrainerId}
  cmp r0,0xFF
  bls @@trainer0_ready
  lsr r1,r0,8
  cmp r1,3
  bls @@trainer0_ready
  mov r0,0
@@trainer0_ready:
  ldr r1,=StateTrainerIds
  strh r0,[r1]
  ldr r0,=StateTrainerCount
  ldrb r0,[r0]
  cmp r0,2
  bne @@party_snapshot
  mov r0,r5
  mov r1,3
  bl ${A.battlerGetTrainerId}
  cmp r0,0xFF
  bls @@trainer1_ready
  lsr r1,r0,8
  cmp r1,3
  bls @@trainer1_ready
  mov r0,0
@@trainer1_ready:
  ldr r1,=StateTrainerIds
  strh r0,[r1,2]

@@party_snapshot:
  mov r0,r5
  mov r1,0
  bl ${A.battleGetPartyCount}
  cmp r0,6
  bls @@count_ready
  mov r0,6
@@count_ready:
  ldr r1,=StatePlayerCount
  strb r0,[r1]
  mov r6,0
@@snapshot_loop:
  ldr r0,=StatePlayerCount
  ldrb r0,[r0]
  cmp r6,r0
  bhs @@snapshot_done
  mov r0,r5
  mov r1,0
  mov r2,r6
  bl ${A.battleGetPartyPokemon}
  mov r7,r0

  mov r0,r7
  mov r1,5
  mov r2,0
  bl ${A.pokemonGetValue}
  cmp r0,0xFF
  bls @@species_low_ready
  lsr r1,r0,8
  cmp r1,3
  bls @@species_ready
  mov r0,0
  b @@species_ready
@@species_low_ready:
@@species_ready:
  ldr r1,=StateSpecies
  lsl r2,r6,1
  strh r0,[r1,r2]

  mov r0,r7
  mov r1,6
  mov r2,0
  bl ${A.pokemonGetValue}
  cmp r0,0xFF
  bls @@item_ready
  lsr r1,r0,8
  cmp r1,3
  bls @@item_ready
  mov r0,0
@@item_ready:
  ldr r1,=StateItems
  lsl r2,r6,1
  strh r0,[r1,r2]

  mov r3,0
@@move_loop:
  cmp r3,4
  bhs @@next_slot
  push {r3}
  mov r0,r7
  mov r1,0x36
  add r1,r1,r3
  mov r2,0
  bl ${A.pokemonGetValue}
  pop {r3}
  cmp r0,0xFF
  bls @@move_ready
  lsr r1,r0,8
  cmp r1,3
  bls @@move_ready
  mov r0,0
@@move_ready:
  mov r1,r6
  lsl r1,r1,2
  add r1,r1,r3
  lsl r1,r1,1
  ldr r2,=StateMoves
  strh r0,[r2,r1]
  add r3,1
  b @@move_loop
@@next_slot:
  add r6,1
  b @@snapshot_loop

@@snapshot_done:
  mov r0,1
  ldr r1,=StateValid
  strb r0,[r1]
@@call_original:
  mov r0,r4
  bl ${A.battleInitGraphics}
  pop {r4,r5,r6,r7,pc}
.pool

; Mark only normally completed wins/losses/draws as flushable before teardown.
HookExit:
  push {r4,r5,lr}
  mov r4,r0
  ldr r0,=StateValid
  ldrb r0,[r0]
  cmp r0,0
  beq @@exit_original
  mov r0,r4
  bl ${A.applicationManagerData}
  mov r5,r0
  mov r0,r5
  bl ${A.battleGetResult}
  cmp r0,1
  beq @@mark_ready
  cmp r0,2
  beq @@mark_ready
  cmp r0,3
  bne @@exit_original
@@mark_ready:
  mov r0,1
  ldr r1,=StateReady
  strb r0,[r1]
@@exit_original:
  mov r0,r4
  bl ${A.battleExitCopyAndFree}
  pop {r4,r5,pc}
.pool

; Call the retail target resolver, then remember the resolved target by party slot.
HookDefender:
  push {r4,r5,r6,r7,lr}
  sub sp,8
  mov r4,r0
  mov r5,r1
  mov r6,r2
  ldr r0,[sp,28]
  str r0,[sp]
  ldr r0,[sp,32]
  str r0,[sp,4]
  mov r0,r4
  mov r1,r5
  mov r2,r6
  bl ${A.battleDefender}
  mov r7,r0
  mov r0,r4
  mov r1,r5
  mov r2,r6
  mov r3,r7
  bl RecordResolvedTarget
  mov r0,r7
  add sp,8
  pop {r4,r5,r6,r7,pc}
.pool

RecordResolvedTarget:
  push {r4,r5,r6,r7,lr}
  mov r4,r0
  mov r5,r1
  mov r6,r2
  mov r7,r3
  ldr r0,=StateValid
  ldrb r0,[r0]
  cmp r0,0
  beq @@target_done
  cmp r6,3
  bhi @@target_done
  cmp r7,3
  bhi @@target_done
  mov r0,r6
  eor r0,r7
  mov r1,1
  tst r0,r1
  beq @@target_done

  mov r0,r4
  mov r1,r5
  mov r2,2
  mov r3,r6
  bl ${A.battleContextGet}
  cmp r0,5
  bhi @@target_done
  mov r2,r0
  mov r0,r4
  mov r1,r5
  mov r3,r7
  push {r2}
  mov r2,2
  bl ${A.battleContextGet}
  pop {r2}
  cmp r0,5
  bhi @@target_done
  mov r3,r0

  mov r0,r6
  mov r1,1
  tst r0,r1
  bne @@enemy_attacker
  ; Battler 2 is an NPC partner only in distinct/tag battles.
  cmp r6,2
  bne @@store_player
  ldr r0,=StateBattleType
  ldr r0,[r0]
  mov r1,0x18
  tst r0,r1
  beq @@store_player
  ldr r0,=StateLastPlayer
  mov r1,0xFF
  strb r1,[r0,r3]
  b @@target_done
@@store_player:
  add r2,1
  ldr r0,=StateLastPlayer
  strb r2,[r0,r3]
  b @@target_done

@@enemy_attacker:
  mov r0,0
  cmp r6,3
  bne @@enemy_index_ready
  ldr r1,=StateTrainerCount
  ldrb r1,[r1]
  cmp r1,2
  bne @@enemy_index_ready
  mov r0,1
@@enemy_index_ready:
  mov r1,6
  mul r0,r1
  add r0,r0,r2
  add r0,1
  ldr r1,=StateLastEnemy
  strb r0,[r1,r3]
@@target_done:
  pop {r4,r5,r6,r7,pc}
.pool

; Run the retail faint opcode, then attribute a newly fainted active party slot once.
HookFaint:
  push {r4,r5,r6,lr}
  mov r4,r0
  mov r5,r1
  mov r0,0x74
  mov r2,0xFF
  strb r2,[r5,r0]
  mov r0,r4
  mov r1,r5
  bl ${A.battleTryFaint}
  mov r6,r0
  ldr r0,=StateValid
  ldrb r0,[r0]
  cmp r0,0
  beq @@faint_return
  mov r0,0x74
  ldrb r2,[r5,r0]
  cmp r2,3
  bhi @@faint_return
  mov r0,r5
  mov r1,r2
  mov r3,0
  push {r2}
  mov r2,0x2F
  bl ${A.battleMonGet}
  pop {r2}
  cmp r0,0
  bne @@faint_return
  mov r0,r4
  mov r1,r5
  bl RecordFaint
@@faint_return:
  mov r0,r6
  pop {r4,r5,r6,pc}
.pool

; r0=battleSys, r1=context, r2=fainted battler
RecordFaint:
  push {r4,r5,r6,r7,lr}
  sub sp,4
  mov r4,r0
  mov r5,r1
  mov r6,r2
  mov r0,r4
  mov r1,r5
  mov r2,2
  mov r3,r6
  bl ${A.battleContextGet}
  cmp r0,5
  bhi @@rf_done
  mov r7,r0
  mov r0,r6
  mov r1,1
  tst r0,r1
  beq @@player_fainted

  ; Enemy faint: choose its trainer, then
  ; credit the last valid player targeter in doubles or the facing mon.
  mov r0,0
  cmp r6,3
  bne @@enemy_opp_ready
  ldr r1,=StateTrainerCount
  ldrb r1,[r1]
  cmp r1,2
  bne @@enemy_opp_ready
  mov r0,1
@@enemy_opp_ready:
  str r0,[sp]
  mov r3,0
  ldr r0,=StateBattleType
  ldr r0,[r0]
  mov r1,2
  tst r0,r1
  beq @@enemy_fallback
  ldr r0,=StateLastPlayer
  ldrb r3,[r0,r7]
  cmp r3,0xFF
  beq @@rf_done
  cmp r3,0
  bne @@enemy_credit
@@enemy_fallback:
  mov r3,r6
  mov r1,1
  eor r3,r1
  mov r0,r4
  mov r1,r5
  mov r2,2
  bl ${A.battleContextGet}
  cmp r0,5
  bhi @@rf_done
  mov r3,r0
  add r3,1
@@enemy_credit:
  sub r3,1
  cmp r3,5
  bhi @@rf_done
  ldr r0,[sp]
  mov r1,6
  mul r0,r1
  add r0,r0,r7
  ldr r1,=StatePlayerCredits
  ldrb r2,[r1,r0]
  cmp r2,0
  bne @@rf_done
  add r3,1
  strb r3,[r1,r0]
  b @@rf_done

@@player_fainted:
  ; NPC partner party slots are not part of the player's snapshot.
  cmp r6,2
  bne @@player_is_owned
  ldr r0,=StateBattleType
  ldr r0,[r0]
  mov r1,0x18
  tst r0,r1
  bne @@rf_done
@@player_is_owned:
  mov r3,0
  ldr r0,=StateBattleType
  ldr r0,[r0]
  mov r1,2
  tst r0,r1
  beq @@player_fallback
  ldr r0,=StateLastEnemy
  ldrb r3,[r0,r7]
  cmp r3,0
  bne @@player_credit
@@player_fallback:
  mov r3,r6
  mov r1,1
  eor r3,r1
  mov r0,r4
  mov r1,r5
  mov r2,2
  bl ${A.battleContextGet}
  cmp r0,5
  bhi @@rf_done
  mov r3,r0
  add r3,1
  cmp r6,2
  bne @@player_credit
  ; ordinary doubles share enemy trainer zero
@@player_credit:
  sub r3,1
  cmp r3,11
  bhi @@rf_done
  mov r0,r3
  mov r1,6
  bl DivMod6
  ; quotient is opposing trainer index, remainder is party slot.
  ldr r2,=StateTrainerCount
  ldrb r2,[r2]
  cmp r0,r2
  bhs @@rf_done
  mov r2,6
  mul r0,r2
  add r0,r0,r7
  mov r3,r1
  ldr r1,=StateAiCredits
  ldrb r2,[r1,r0]
  cmp r2,0
  bne @@rf_done
  add r3,1
  strb r3,[r1,r0]
@@rf_done:
  add sp,4
  pop {r4,r5,r6,r7,pc}
.pool

; Preserve My Recording (recNum 0) and reject downloaded slots 1-3.
HookSaveRecording:
  cmp r2,0
  bne @@recording_rejected
  push {lr}
  mov r3,r1
  mov r1,2
  mov r2,r3
  bl ${A.saveRecordingMirror}
  pop {pc}
@@recording_rejected:
  mov r0,0
  bx lr
.pool

; Field return is the first safe point after battle teardown. Flush once here.
HookFieldUpdate:
  push {r4,r5,lr}
  mov r4,r0
  mov r5,r1
  bl ${A.fieldUpdate}
  bl FlushPending
  pop {r4,r5,pc}
.pool

FlushPending:
  push {r4,r5,r6,r7,lr}
  ldr r0,=StateValid
  ldrb r0,[r0]
  cmp r0,0
  beq @@flush_done
  ldr r0,=StateReady
  ldrb r0,[r0]
  cmp r0,0
  beq @@flush_done
  ldr r0,=StateCommitted
  ldrb r0,[r0]
  cmp r0,0
  bne @@flush_done

  bl AvailableRecordSlots
  ldr r1,=StateTrainerCount
  ldrb r1,[r1]
  cmp r0,r1
  bhs @@have_space
  bl MarkOverflow
  b @@mark_committed
@@have_space:
  bl AppendPendingRecords
  bl RebuildAggregate
@@mark_committed:
  mov r0,1
  ldr r1,=StateCommitted
  strb r0,[r1]
@@flush_done:
  pop {r4,r5,r6,r7,pc}
.pool

; Return the sum of free record slots across all eight pages.
AvailableRecordSlots:
  push {r4,r5,r6,r7,lr}
  mov r4,0
  mov r5,0
@@avail_loop:
  cmp r4,8
  bhs @@avail_done
  mov r0,r4
  bl LoadLogPage
  mov r0,r4
  bl ValidateLogPage
  cmp r0,0
  beq @@empty_page
  ldr r0,=Scratch
  ldrh r1,[r0,10]
  ldrh r0,[r0,12]
  sub r1,r1,r0
  add r5,r5,r1
  b @@avail_next
@@empty_page:
  mov r0,r4
  bl PageCapacity
  add r5,r5,r0
@@avail_next:
  add r4,1
  b @@avail_loop
@@avail_done:
  mov r0,r5
  pop {r4,r5,r6,r7,pc}
.pool

CountValidRecords:
  push {r4,r5,lr}
  mov r4,0
  mov r5,0
@@count_page_loop:
  cmp r4,8
  bhs @@count_pages_done
  mov r0,r4
  bl LoadLogPage
  mov r0,r4
  bl ValidateLogPage
  cmp r0,0
  beq @@count_next_page
  ldr r0,=Scratch
  ldrh r0,[r0,12]
  add r5,r5,r0
@@count_next_page:
  add r4,1
  b @@count_page_loop
@@count_pages_done:
  mov r0,r5
  pop {r4,r5,pc}
.pool

AppendPendingRecords:
  push {r4,r5,r6,r7,lr}
  mov r4,0                         ; page
  mov r5,0                         ; pending trainer record
  ldr r0,=StateTrainerCount
  ldrb r7,[r0]
@@append_page_loop:
  cmp r5,r7
  bhs @@append_done
  cmp r4,8
  bhs @@append_done
  mov r0,r4
  bl LoadLogPage
  mov r0,r4
  bl ValidateLogPage
  cmp r0,0
  bne @@page_ready
  mov r0,r4
  bl InitializeLogPage
@@page_ready:
  mov r6,0                         ; dirty
@@append_in_page:
  cmp r5,r7
  bhs @@save_dirty
  ldr r0,=Scratch
  ldrh r1,[r0,12]
  ldrh r2,[r0,10]
  cmp r1,r2
  bhs @@save_dirty
  mov r2,0x34
  mul r1,r2
  add r1,0x20
  add r0,r0,r1
  mov r1,r5
  bl PackRecord
  ldr r0,=Scratch
  ldrh r1,[r0,12]
  add r1,1
  strh r1,[r0,12]
  add r5,1
  mov r6,1
  b @@append_in_page
@@save_dirty:
  cmp r6,0
  beq @@append_next_page
  bl StoreScratchChecksum
  mov r0,r4
  bl SaveLogPage
@@append_next_page:
  add r4,1
  b @@append_page_loop
@@append_done:
  pop {r4,r5,r6,r7,pc}
.pool

PackRecord:
  push {r4,r5,r6,r7,lr}
  sub sp,8
  mov r4,r0                         ; record buffer
  mov r5,r1                         ; opposing trainer index
  mov r0,r4
  mov r1,0x34
  bl ClearBytes

  ldr r0,=StateTrainerIds
  lsl r1,r5,1
  ldrh r3,[r0,r1]
  mov r0,r4
  mov r1,0
  mov r2,10
  bl WriteBits
  ldr r0,=StatePlayerCount
  ldrb r3,[r0]
  mov r0,r4
  mov r1,10
  mov r2,3
  bl WriteBits

  mov r6,0
@@pack_slot:
  cmp r6,6
  bhs @@pack_moves
  lsl r7,r6,1
  ldr r0,=StateSpecies
  ldrh r3,[r0,r7]
  mov r0,r4
  mov r1,r6
  mov r2,10
  mul r1,r2
  add r1,13
  bl WriteBits

  mov r0,r5
  mov r1,6
  mul r0,r1
  add r0,r0,r6
  str r0,[sp]
  ldr r1,=StatePlayerCredits
  ldrb r3,[r1,r0]
  mov r0,r4
  mov r1,r6
  mov r2,3
  mul r1,r2
  add r1,73
  bl WriteBits
  ldr r0,[sp]
  ldr r1,=StateAiCredits
  ldrb r3,[r1,r0]
  mov r0,r4
  mov r1,r6
  mov r2,3
  mul r1,r2
  add r1,91
  bl WriteBits

  ldr r0,=StateItems
  ldrh r3,[r0,r7]
  mov r0,r4
  mov r1,r6
  mov r2,10
  mul r1,r2
  add r1,109
  bl WriteBits
  add r6,1
  b @@pack_slot

@@pack_moves:
  mov r6,0
@@pack_move_loop:
  cmp r6,24
  bhs @@pack_done
  lsl r7,r6,1
  ldr r0,=StateMoves
  ldrh r3,[r0,r7]
  mov r0,r4
  mov r1,r6
  mov r2,10
  mul r1,r2
  add r1,169
  bl WriteBits
  add r6,1
  b @@pack_move_loop
@@pack_done:
  add sp,8
  pop {r4,r5,r6,r7,pc}
.pool

; Rebuild exact-species aggregate counts from all currently valid log pages.
RebuildAggregate:
  push {r4,r5,r6,r7,lr}
  ldr r0,=Counts
  ldr r1,=0x800
  bl ClearBytes
  mov r4,0                         ; page
  mov r7,0                         ; total records
@@rebuild_page:
  cmp r4,8
  bhs @@build_aggregate
  mov r0,r4
  bl LoadLogPage
  mov r0,r4
  bl ValidateLogPage
  cmp r0,0
  beq @@rebuild_next_page
  ldr r0,=Scratch
  ldrh r5,[r0,12]
  add r7,r7,r5
  mov r6,0
@@record_loop:
  cmp r6,r5
  bhs @@rebuild_next_page
  ldr r0,=Scratch
  mov r1,0x34
  mul r1,r6
  add r1,0x20
  add r0,r0,r1
  push {r4,r5,r6,r7}
  bl AccumulateRecord
  pop {r4,r5,r6,r7}
  add r6,1
  b @@record_loop
@@rebuild_next_page:
  add r4,1
  b @@rebuild_page

@@build_aggregate:
  ldr r0,=Scratch
  ldr r1,=0x1000
  bl ClearBytes
  ldr r0,=Scratch
  ldr r1,=0x464C4250
  str r1,[r0]
  mov r1,1
  strh r1,[r0,4]
  ldr r1,=0x0400
  strh r1,[r0,6]
  strh r7,[r0,8]
  ldr r1,=Counts
  add r0,0x20
  ldr r2,=0x800
  bl CopyBytes
  bl StoreScratchChecksum
  mov r0,104
  bl SaveSector
  pop {r4,r5,r6,r7,pc}
.pool

AccumulateRecord:
  push {r4,r5,r6,r7,lr}
  mov r4,r0
  mov r5,0
@@acc_slot:
  cmp r5,6
  bhs @@acc_done
  mov r0,r4
  mov r1,r5
  mov r2,3
  mul r1,r2
  add r1,73
  mov r2,3
  bl ReadBits
  cmp r0,0
  beq @@acc_next
  cmp r0,6
  bhi @@acc_next
  sub r0,1
  mov r6,r0
  mov r0,r4
  mov r1,r6
  mov r2,10
  mul r1,r2
  add r1,13
  mov r2,10
  bl ReadBits
  mov r6,r0
  cmp r6,0
  beq @@acc_next
  cmp r6,0xFF
  bls @@species_in_range
  lsr r0,r6,8
  cmp r0,3
  bhi @@acc_next
@@species_in_range:
  ldr r1,=Counts
  lsl r2,r6,1
  ldrh r3,[r1,r2]
  add r3,1
  cmp r3,0
  bpl @@count_not_wrapped
  ldr r3,=0xFFFF
@@count_not_wrapped:
  strh r3,[r1,r2]
@@acc_next:
  add r5,1
  b @@acc_slot
@@acc_done:
  pop {r4,r5,r6,r7,pc}
.pool

MarkOverflow:
  push {r4,lr}
  mov r4,7
  mov r0,r4
  bl LoadLogPage
  mov r0,r4
  bl ValidateLogPage
  cmp r0,0
  bne @@overflow_ready
  mov r0,r4
  bl InitializeLogPage
@@overflow_ready:
  ldr r0,=Scratch
  ldrh r1,[r0,14]
  mov r2,1
  orr r1,r2
  strh r1,[r0,14]
  bl StoreScratchChecksum
  mov r0,r4
  bl SaveLogPage
  pop {r4,pc}
.pool

InitializeLogPage:
  push {r4,lr}
  mov r4,r0
  ldr r0,=Scratch
  ldr r1,=0x1000
  bl ClearBytes
  ldr r0,=Scratch
  ldr r1,=0x474C4250
  str r1,[r0]
  mov r1,1
  strh r1,[r0,4]
  strb r4,[r0,6]
  mov r1,8
  strb r1,[r0,7]
  mov r1,0x34
  strh r1,[r0,8]
  mov r0,r4
  bl PageCapacity
  ldr r1,=Scratch
  strh r0,[r1,10]
  bl StoreScratchChecksum
  pop {r4,pc}
.pool

ValidateLogPage:
  push {r4,r5,lr}
  mov r4,r0
  ldr r5,=Scratch
  ldr r0,[r5]
  ldr r1,=0x474C4250
  cmp r0,r1
  bne @@log_bad
  ldrh r0,[r5,4]
  cmp r0,1
  bne @@log_bad
  ldrb r0,[r5,6]
  cmp r0,r4
  bne @@log_bad
  ldrb r0,[r5,7]
  cmp r0,8
  bne @@log_bad
  ldrh r0,[r5,8]
  cmp r0,0x34
  bne @@log_bad
  mov r0,r4
  bl PageCapacity
  ldrh r1,[r5,10]
  cmp r0,r1
  bne @@log_bad
  ldrh r0,[r5,12]
  cmp r0,r1
  bhi @@log_bad
  mov r0,r5
  bl ValidateChecksum
  pop {r4,r5,pc}
@@log_bad:
  mov r0,0
  pop {r4,r5,pc}
.pool

ValidateAggregate:
  push {r4,lr}
  ldr r4,=Scratch
  ldr r0,[r4]
  ldr r1,=0x464C4250
  cmp r0,r1
  bne @@agg_bad
  ldrh r0,[r4,4]
  cmp r0,1
  bne @@agg_bad
  ldrh r0,[r4,6]
  ldr r1,=0x0400
  cmp r0,r1
  bne @@agg_bad
  ldrh r0,[r4,8]
  ldr r1,=0x0258
  cmp r0,r1
  bhi @@agg_bad
  mov r0,r4
  bl ValidateChecksum
  pop {r4,pc}
@@agg_bad:
  mov r0,0
  pop {r4,pc}
.pool

ValidateChecksum:
  push {r4,r5,lr}
  mov r4,r0
  ldrh r5,[r4,20]
  mov r0,0
  strh r0,[r4,20]
  mov r0,r4
  ldr r1,=0x1000
  bl ${A.crc16}
  strh r5,[r4,20]
  cmp r0,r5
  bne @@checksum_bad
  mov r0,1
  pop {r4,r5,pc}
@@checksum_bad:
  mov r0,0
  pop {r4,r5,pc}
.pool

StoreScratchChecksum:
  push {lr}
  ldr r0,=Scratch
  mov r1,0
  strh r1,[r0,20]
  ldr r1,=0x1000
  bl ${A.crc16}
  ldr r1,=Scratch
  strh r0,[r1,20]
  pop {pc}
.pool

PageCapacity:
  cmp r0,7
  beq @@last_capacity
  mov r0,78
  bx lr
@@last_capacity:
  mov r0,54
  bx lr

LoadLogPage:
  ldr r1,=LogSectorTable
  lsl r0,r0,1
  ldrh r0,[r1,r0]
  b LoadSector
SaveLogPage:
  ldr r1,=LogSectorTable
  lsl r0,r0,1
  ldrh r0,[r1,r0]
  b SaveSector
LoadSector:
  lsl r0,r0,12
  ldr r1,=Scratch
  ldr r2,=0x1000
  push {lr}
  bl ${A.cardLoad}
  pop {pc}
SaveSector:
  lsl r0,r0,12
  ldr r1,=Scratch
  ldr r2,=0x1000
  push {lr}
  bl ${A.cardSave}
  pop {pc}
.pool

; Summary replacement: calculate a family aggregate and invoke the retail formatter
; as a three-digit, space-padded number.
HookSummary:
  push {r4,r5,r6,r7,lr}
  sub sp,4
  mov r4,r0
  mov r5,r1
  ldr r0,=0x25C
  ldrh r0,[r4,r0]
  bl SummaryFragCount
  mov r2,r0
  mov r0,r4
  mov r1,r5
  mov r3,3
  mov r6,1
  str r6,[sp]
  bl ${A.formatNumber}
  add sp,4
  pop {r4,r5,r6,r7,pc}
.pool

SummaryFragCount:
  push {r4,r5,r6,r7,lr}
  mov r7,r0
  mov r0,104
  bl LoadSector
  bl ValidateAggregate
  cmp r0,0
  bne @@aggregate_ready
  bl CountValidRecords
  cmp r0,0
  beq @@no_frags
  bl RebuildAggregate
@@aggregate_ready:
  ldr r0,=${o.ancestrySpeciesCount}
  cmp r7,r0
  bhs @@exact_species
  ldr r0,=AncestryRow
  mov r1,0x22
  ldr r2,=${o.ancestryMember}
  mov r3,r7
  ldr r4,=${o.ancestryStride}
  mul r3,r4
  add r3,0x10
  sub sp,4
  str r4,[sp]
  bl ${A.narcReadPair}
  add sp,4
  mov r4,0
  mov r5,0
@@family_loop:
  ldr r0,=${o.ancestrySpeciesCount}
  cmp r4,r0
  bhs @@family_done
  ldr r0,=AncestryRow
  mov r1,r4
  lsr r1,r1,3
  ldrb r0,[r0,r1]
  mov r1,r4
  mov r2,7
  and r1,r2
  lsr r0,r1
  mov r1,1
  tst r0,r1
  beq @@family_next
  ldr r0,=Scratch
  add r0,0x20
  lsl r1,r4,1
  ldrh r0,[r0,r1]
  add r5,r5,r0
  ldr r0,=0x0258
  cmp r5,r0
  bls @@family_next
  mov r5,r0
@@family_next:
  add r4,1
  b @@family_loop
@@family_done:
  mov r0,r5
  pop {r4,r5,r6,r7,pc}
@@exact_species:
  cmp r7,0xFF
  bls @@exact_ok
  lsr r0,r7,8
  cmp r0,3
  bhi @@no_frags
@@exact_ok:
  ldr r0,=Scratch
  add r0,0x20
  lsl r1,r7,1
  ldrh r0,[r0,r1]
  ldr r1,=0x0258
  cmp r0,r1
  bls @@summary_return
  mov r0,r1
@@summary_return:
  pop {r4,r5,r6,r7,pc}
@@no_frags:
  mov r0,0
  pop {r4,r5,r6,r7,pc}
.pool

; LSB-first bit helpers shared by record packing and aggregate rebuilding.
WriteBits:
  push {r4,r5,r6,r7,lr}
  mov r4,r0
  mov r5,r1
  mov r6,r2
  mov r7,r3
@@wb_loop:
  cmp r6,0
  beq @@wb_done
  mov r0,r5
  lsr r0,r0,3
  add r0,r4,r0
  mov r1,r5
  mov r2,7
  and r1,r2
  mov r2,1
  lsl r2,r1
  ldrb r1,[r0]
  mov r3,r7
  mov r7,1
  tst r3,r7
  mov r7,r3
  beq @@wb_clear
  orr r1,r2
  b @@wb_store
@@wb_clear:
  eor r2,r7                         ; temporary inverse below
  eor r2,r7
  mov r3,0xFF
  eor r2,r3
  and r1,r2
@@wb_store:
  strb r1,[r0]
  lsr r7,r7,1
  add r5,1
  sub r6,1
  b @@wb_loop
@@wb_done:
  pop {r4,r5,r6,r7,pc}
.pool

ReadBits:
  push {r4,r5,r6,r7,lr}
  mov r4,r0
  mov r5,r1
  mov r6,r2
  mov r7,0
  mov r3,0
@@rb_loop:
  cmp r6,0
  beq @@rb_done
  mov r0,r5
  lsr r0,r0,3
  add r0,r4,r0
  ldrb r0,[r0]
  mov r1,r5
  mov r2,7
  and r1,r2
  lsr r0,r1
  mov r1,1
  and r0,r1
  lsl r0,r3
  orr r7,r0
  add r3,1
  add r5,1
  sub r6,1
  b @@rb_loop
@@rb_done:
  mov r0,r7
  pop {r4,r5,r6,r7,pc}
.pool

DivMod6:
  mov r2,0
@@div6_loop:
  cmp r0,6
  blo @@div6_done
  sub r0,6
  add r2,1
  b @@div6_loop
@@div6_done:
  mov r1,r0
  mov r0,r2
  bx lr

ClearBytes:
  mov r2,0
@@clear_loop:
  cmp r1,0
  beq @@clear_done
  strb r2,[r0]
  add r0,1
  sub r1,1
  b @@clear_loop
@@clear_done:
  bx lr

CopyBytes:
  cmp r2,0
  beq @@copy_done
@@copy_loop:
  ldrb r3,[r1]
  strb r3,[r0]
  add r0,1
  add r1,1
  sub r2,1
  bne @@copy_loop
@@copy_done:
  bx lr

.align 4
LogSectorTable:
  .halfword 38,39,40,41,42,43,102,103

.align 4
StateBegin:
StateValid:          .byte 0
StateReady:          .byte 0
StateCommitted:      .byte 0
StateTrainerCount:   .byte 0
StatePlayerCount:    .byte 0
StateRecordedPlayer: .byte 0
StateRecordedEnemy:  .fill 2,0xFD
StateBattleType:     .word 0
StateBattleSys:      .word 0
StateSpecies:        .fill 12,0xFD
StateItems:          .fill 12,0xFD
StateMoves:          .fill 48,0xFD
StateTrainerIds:     .fill 4,0xFD
StatePlayerCredits:  .fill 12,0xFD
StateAiCredits:      .fill 12,0xFD
StateLastPlayer:     .fill 6,0xFD
StateLastEnemy:      .fill 6,0xFD
StateEnd:

.align 4
; Nonzero fill is intentional: the shared synthetic-overlay allocator treats long
; zero runs as free space. Runtime helpers clear/overwrite these work buffers.
AncestryRow: .fill 128,0xFD
.align 4
Counts:      .fill 0x800,0xFD
.align 4
Scratch:     .fill 0x1000,0xFD
.pool
.close
`;
  }

  return { battleLogSource };
});
