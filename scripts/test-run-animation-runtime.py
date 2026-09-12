"""Run via UNICORN_PYTHON=/path/to/python node scripts/test-field-movement.js.

Requires Unicorn. Executes patched THUMB plus the ROM's original Billboard and
idle/run routines, using a minimal in-memory sprite and animation table.
"""

import base64
import json
import struct
import sys

from unicorn import Uc, UC_ARCH_ARM, UC_MODE_THUMB
from unicorn.arm_const import (
    UC_ARM_REG_R0, UC_ARM_REG_R1, UC_ARM_REG_R2, UC_ARM_REG_R3,
    UC_ARM_REG_R4, UC_ARM_REG_R5, UC_ARM_REG_R6, UC_ARM_REG_R7,
    UC_ARM_REG_R8, UC_ARM_REG_R9, UC_ARM_REG_R10, UC_ARM_REG_R11,
    UC_ARM_REG_SP, UC_ARM_REG_LR, UC_ARM_REG_PC,
)

fixture = json.load(sys.stdin)
cpu = Uc(UC_ARCH_ARM, UC_MODE_THUMB)
cpu.mem_map(0x02000000, 0x400000)
for segment in fixture["segments"]:
    cpu.mem_write(segment["address"], base64.b64decode(segment["data"]))

MAP, SPRITE, STATE, ANIMS = 0x02340000, 0x02341000, 0x02342000, 0x02343000
STACK, STOP = 0x023b0000, 0x023b1000
GET_FRAME, GET_ANIM = 0x020213D4, 0x02021358
SET_FRAME, SET_ANIM = 0x020213A4, 0x02021344
IDLE, VANILLA_RUN = 0x021EBB44, 0x021EBEFC
ARG_REGS = (UC_ARM_REG_R0, UC_ARM_REG_R1, UC_ARM_REG_R2, UC_ARM_REG_R3)
SAVED_REGS = (UC_ARM_REG_R4, UC_ARM_REG_R5, UC_ARM_REG_R6, UC_ARM_REG_R7,
              UC_ARM_REG_R8, UC_ARM_REG_R9, UC_ARM_REG_R10, UC_ARM_REG_R11)


def word(address, value):
    cpu.mem_write(address, struct.pack("<I", value))


def call(address, *args):
    for reg, value in zip(ARG_REGS, args):
        cpu.reg_write(reg, value)
    saved = [0x45670000 + i for i in range(len(SAVED_REGS))]
    for reg, value in zip(SAVED_REGS, saved):
        cpu.reg_write(reg, value)
    cpu.reg_write(UC_ARM_REG_SP, STACK)
    cpu.reg_write(UC_ARM_REG_LR, STOP | 1)
    cpu.emu_start(address | 1, STOP, count=10000)
    assert cpu.reg_read(UC_ARM_REG_PC) == STOP, "routine did not return"
    assert cpu.reg_read(UC_ARM_REG_SP) == STACK, "stack imbalance"
    assert [cpu.reg_read(r) for r in SAVED_REGS] == saved, "callee-saved register corruption"
    return cpu.reg_read(UC_ARM_REG_R0)


def reset(graphics=0, direction=2, action=0x16):
    cpu.mem_write(MAP, bytes(0x500))
    cpu.mem_write(SPRITE, bytes(0x200))
    cpu.mem_write(STATE, bytes(0x20))
    word(MAP + 0x10, graphics)
    word(MAP + 0xA4, action)
    word(SPRITE + 0x2C, ANIMS)
    for anim in range(8):
        cpu.mem_write(ANIMS + anim * 12, struct.pack("<iii", anim * 16, anim * 16 + 15, 0))
    cpu.mem_write(STATE, bytes([direction, 0, 0, 0]))
    call(SET_ANIM, SPRITE, direction)
    call(SET_FRAME, SPRITE, 0)


def render(address, tier, direction=2):
    call(address, MAP, SPRITE, STATE, direction)
    cpu.mem_write(STATE, bytes([direction]))
    cpu.mem_write(STATE + 2, bytes([tier]))
    return call(GET_FRAME, SPRITE) // 4096


def trace(address, graphics, direction, updates):
    reset(graphics, direction, 0x14 + direction)
    frames = []
    for _ in range(12):
        for _ in range(updates):
            frames.append(render(address, 9, direction))
        render(IDLE, 0, direction)
    return frames


old_frames = trace(VANILLA_RUN, 0, 2, 1)
assert len(set(old_frames)) == 1, "fixture must reproduce the old stuck run frame"
for graphics in (0, 0x61):
    for direction in range(4):
        for updates in (1, 2):
            frames = trace(fixture["helper"], graphics, direction, updates)
            assert max(frames) >= 8 and len(set(frames)) >= 4, frames

reset()
render(fixture["helper"], 9)
render(fixture["helper"], 9)
assert render(fixture["helper"], 9, 3) == 2, "turn must restart the new direction"
assert call(GET_ANIM, SPRITE) == 7
render(IDLE, 0, 3)
render(IDLE, 0, 3)
assert call(GET_ANIM, SPRITE) == 3, "stopping must return to walking/idle animation"

reset()
call(SET_ANIM, SPRITE, 6)
call(SET_FRAME, SPRITE, 6 * 4096)
assert call(GET_FRAME, SPRITE) == 6 * 4096
word(MAP, 1 << 8)  # MAP_OBJ_STATUS_PAUSE_ANIMATION
paused_frame = render(fixture["helper"], 9)
assert paused_frame == 6, f"paused sprite must not advance: {paused_frame}"

for graphics, action in ((0x15, 0x16), (0x62, 0x16), (0x78, 0x16), (0, 0x58)):
    reset(graphics=graphics, action=action)
    actual = render(fixture["helper"], 9)
    reset(graphics=graphics, action=action)
    expected = render(VANILLA_RUN, 9)
    assert actual == expected, "non-fast-player animation must fall through unchanged"

print("ARM animation tests passed: reproduced old frame lock; checked both players, all directions, step/idle/turn/pause transitions and fallback")
