"""Execute ROM inventory routines in Unicorn; run from test-item-inventory.js.

Save services, archive IO, allocation and graphical/text primitives are stubbed.
Inventory routing, merged views, native battle text callers, cursor handling,
GeoNet access and persistence execute their assembled ARM9/THUMB instructions.
"""
import base64
import json
import struct
import sys

from unicorn import Uc, UC_ARCH_ARM, UC_MODE_THUMB, UC_HOOK_CODE
from unicorn.arm_const import (
    UC_ARM_REG_R0, UC_ARM_REG_R1, UC_ARM_REG_R2, UC_ARM_REG_R3,
    UC_ARM_REG_R4, UC_ARM_REG_R5, UC_ARM_REG_R6, UC_ARM_REG_R7,
    UC_ARM_REG_R8, UC_ARM_REG_R9, UC_ARM_REG_R10, UC_ARM_REG_R11,
    UC_ARM_REG_SP, UC_ARM_REG_LR, UC_ARM_REG_PC,
)

fixture = json.load(sys.stdin)
combined_fixture = fixture
cpu = Uc(UC_ARCH_ARM, UC_MODE_THUMB)
cpu.mem_map(0x02000000, 0x400000)
for segment in fixture["segments"]:
    cpu.mem_write(segment["address"], base64.b64decode(segment["data"]))

WIFI, BAG, CONTEXT, POCKET_LIST = 0x02280000, 0x02290000, 0x022a0000, 0x022a1000
STACK, STOP, SAVE = 0x023b0000, 0x023b1000, 0x022f0000
STORE, SLOTS = WIFI + 0xcfc, WIFI + 0xcfc + 0x20
BASE = fixture["helper"]
RUNTIME = fixture["runtime"]
CONTROLLER = 0x022a2000
BATTLE, BATTLE_CONTEXT = 0x022b0000, 0x022b8000
ARGS = [UC_ARM_REG_R0, UC_ARM_REG_R1, UC_ARM_REG_R2, UC_ARM_REG_R3]
SAVED = [UC_ARM_REG_R4, UC_ARM_REG_R5, UC_ARM_REG_R6, UC_ARM_REG_R7,
         UC_ARM_REG_R8, UC_ARM_REG_R9, UC_ARM_REG_R10, UC_ARM_REG_R11]
checksum_snapshot = None
heap_next = 0x02300000
string_next = 0x02360000
string_lists = {}
text_calls = []
archive_calls = []
list_menus = []
selected_list_index = 0


def u16(address):
    return struct.unpack("<H", cpu.mem_read(address, 2))[0]


def u32(address):
    return struct.unpack("<I", cpu.mem_read(address, 4))[0]


def word(address, value):
    cpu.mem_write(address, struct.pack("<I", value))


def services(uc, address, size, data):
    global checksum_snapshot, heap_next, string_next
    if address == 0x020245a4:
        result = SAVE
    elif address == 0x020245bc:
        assert uc.reg_read(UC_ARM_REG_R1) == 30
        result = WIFI
    elif address == 0x02025c84:
        assert uc.reg_read(UC_ARM_REG_R0) == 30
        checksum_snapshot = bytes(uc.mem_read(WIFI, 0xffc))
        result = 0
    elif address == 0x0207cff0:
        param = uc.reg_read(UC_ARM_REG_R1)
        assert param in [5, 13]
        result = fixture["pockets" if param == 5 else "battleMasks"].get(str(uc.reg_read(UC_ARM_REG_R0)), 0)
    elif address == 0x0207cb08:
        uc.mem_write(CONTEXT, bytes(0x100))
        result = CONTEXT
    elif address == 0x02022974:
        raise AssertionError("game GF_ASSERT reached")
    elif address == 0x02018144:
        result = heap_next
        length = uc.reg_read(UC_ARM_REG_R1)
        uc.mem_write(result, bytes([0xcc]) * length)
        heap_next += (length + 15) & ~15
    elif address == 0x02006c24:
        assert uc.reg_read(UC_ARM_REG_R0) == 15
        result = 0x022f1000
    elif address == 0x02006ac0:
        archive_calls.append((uc.reg_read(UC_ARM_REG_R0), uc.reg_read(UC_ARM_REG_R1)))
        result = 0x022f2000
    elif address == 0x020014f8:
        result = selected_list_index & 0xffffffff
    elif address == 0x0200112c:
        template = uc.reg_read(UC_ARM_REG_R0)
        list_menus.append({
            "text_x": uc.mem_read(template + 0x15, 1)[0],
            "count": u16(template + 0x10),
            "scroll": uc.reg_read(UC_ARM_REG_R1),
            "pos": uc.reg_read(UC_ARM_REG_R2),
        })
        result = 0x023a2000
    elif address == 0x020683f4:
        assert uc.reg_read(UC_ARM_REG_R0) == 2
        result = 0x023a1001
    elif address == 0x02006d28:
        record = base64.b64decode(fixture["dataMembers"][uc.reg_read(UC_ARM_REG_R1)])
        uc.mem_write(uc.reg_read(UC_ARM_REG_R2), record)
        result = 0
    elif address in [0x02006ca8, 0x020181c4]:
        result = 0
    elif address == 0x02023790:
        result = string_next
        string_next += 4
    elif address == 0x020237bc:
        result = 0
    elif address == 0x0200b1ec:
        result = string_next
        string_next += 4
    elif address in [0x0200b70c, 0x0200b60c]:
        assert uc.reg_read(UC_ARM_REG_R0) == u32(BATTLE + 0x14)
        text_calls.append((address, uc.reg_read(UC_ARM_REG_R2)))
        result = 0
    elif address == 0x0207cfc8:
        assert uc.reg_read(UC_ARM_REG_R2) == 6
        text_calls.append((address, uc.reg_read(UC_ARM_REG_R1)))
        result = 0
    elif address in [0x0200c388, 0x0201ada4, 0x0201a9a4, 0x0201d78c]:
        result = 0
    elif address in [0x02002d7c, 0x0201c294]:
        result = 12
    elif address == 0x02013a04:
        result = string_next
        string_next += 4
        string_lists[result] = []
    elif address == 0x02013a4c:
        string_lists[uc.reg_read(UC_ARM_REG_R0)].append(uc.reg_read(UC_ARM_REG_R3))
        result = 0
    elif address in [0x0223be84, 0x0223be94]:
        word(uc.reg_read(UC_ARM_REG_R1), uc.reg_read(UC_ARM_REG_R2))
        result = 0
    elif address == 0x02013a6c:
        string_lists[uc.reg_read(UC_ARM_REG_R0)].append(u32(uc.reg_read(UC_ARM_REG_R1)))
        result = 0
    elif address in [0x0200b1b8, 0x022279f4]:
        result = 0
    else:
        return
    uc.reg_write(UC_ARM_REG_R0, result)
    uc.reg_write(UC_ARM_REG_PC, uc.reg_read(UC_ARM_REG_LR))


for service in [0x020245a4, 0x020245bc, 0x02025c84, 0x0207cff0, 0x0207cb08, 0x02022974,
                0x02018144, 0x020181c4, 0x02006c24, 0x02006ca8, 0x02006d28,
                0x02006ac0, 0x020014f8, 0x0200112c, 0x020683f4,
                0x02023790, 0x020237bc, 0x02013a04, 0x02013a4c, 0x02013a6c,
                0x0200b1ec, 0x0200b70c, 0x0200b60c, 0x0207cfc8, 0x0200c388,
                0x0201ada4, 0x0201a9a4, 0x0201d78c, 0x02002d7c, 0x0201c294,
                0x0223be84, 0x0223be94, 0x0200b1b8, 0x022279f4]:
    cpu.hook_add(UC_HOOK_CODE, services, begin=service, end=service)


def call(address, *args, saved=None):
    for reg, value in zip(ARGS, args):
        cpu.reg_write(reg, value)
    for i, value in enumerate(args[4:]):
        word(STACK + 4 * i, value)
    sentinels = [0x45670000 + i for i in range(len(SAVED))]
    for reg, value in (saved or {}).items():
        sentinels[SAVED.index(reg)] = value
    for reg, value in zip(SAVED, sentinels):
        cpu.reg_write(reg, value)
    cpu.reg_write(UC_ARM_REG_SP, STACK)
    cpu.reg_write(UC_ARM_REG_LR, STOP | 1)
    cpu.emu_start(address | 1, STOP, count=10000000)
    assert cpu.reg_read(UC_ARM_REG_PC) == STOP, f"did not return from {address:x}"
    assert cpu.reg_read(UC_ARM_REG_SP) == STACK, f"stack imbalance at {address:x}"
    assert [cpu.reg_read(r) for r in SAVED] == sentinels, f"register corruption at {address:x}"
    return cpu.reg_read(UC_ARM_REG_R0)


def rows(address, count):
    return [struct.unpack("<HH", cpu.mem_read(address + 4 * i, 4)) for i in range(count)]


def quantity(address, count, item):
    return sum(qty for item_id, qty in rows(address, count) if item_id == item)


def checksum_current():
    assert checksum_snapshot == bytes(cpu.mem_read(WIFI, 0xffc)), "checksum was taken before the last write/sort"


def reset():
    global checksum_snapshot
    cpu.mem_write(WIFI, bytes(0x1000))
    cpu.mem_write(BAG, bytes(0x800))
    cpu.mem_write(POCKET_LIST, bytes([0, 1, 3, 4, 255]))
    checksum_snapshot = None


def add(item, count=5):
    assert call(0x0207d570, BAG, item, count, 6) == 1
    if item >= 468:
        checksum_current()


def open_bag(mode=0):
    global string_next
    string_next = 0x02360000
    assert call(0x0207d824, BAG, POCKET_LIST, 6) == CONTEXT
    cpu.mem_write(CONTEXT + 0x65, bytes([mode]))
    word(CONTROLLER + 0xc4, CONTEXT)
    word(CONTROLLER + 0xc8, BAG)
    call(RUNTIME["restoreCursor"], CONTROLLER)
    call(RUNTIME["initNames"], CONTROLLER)
    result = [u32(CONTEXT + 4 + 12 * i) for i in range(4)]
    assert all(CONTROLLER < p < CONTROLLER + 0x1800 for p in result)
    return result


# Invalid IDs must never select the animation member as an icon or palette.
for item in [468 + fixture["count"], 595, 596, 65534]:
    if item < 468 + fixture["count"]:
        continue
    assert [call(0x0207ce78, item, kind) for kind in range(4)] == [0, 707, 708, 0]
    archive_calls.clear()
    for kind in range(3):
        call(0x0207cf48, item, kind, 6)
    assert archive_calls == [(15, 0), (16, 707), (16, 708)]
assert [call(0x0207ce78, 65535, kind) for kind in range(4)] == [0, 709, 710, 0]
table = call(0x0207d388, 6)
for i, encoded in enumerate(fixture["dataMembers"]):
    record = base64.b64decode(encoded)
    assert cpu.mem_read(table + i * 36, 36) == record + bytes(36 - len(record))
    assert call(0x0207d3b0, table, i) == table + i * 36
assert call(0x0207d3b0, table, len(fixture["dataMembers"])) == table
assert call(0x0207d3b0, table, 65535) == table

# Vanilla and overflow rows coexist, with the latter maintained in Wi-Fi history.
medicine = next(int(i) for i, p in fixture["pockets"].items() if int(i) >= 468 and p == 1)
reset()
for item in [79, 17, 328, 149, 468, 470, medicine]:
    add(item)
views = open_bag()
assert cpu.mem_read(STORE, 8) == b"ITEMBAG2"

# Replay rollover, including bytes with every possible pair pattern, and protect
# every country/region that could write any part of the reserved tail.
before_store = bytes(cpu.mem_read(STORE, 0x300))
cpu.mem_write(WIFI + 7, bytes([0x55, 0xff, 0x00, 0xaa]))
cpu.mem_write(WIFI + 0xcf6, b"\x55")
call(0x0202c9a0, WIFI)
assert cpu.mem_read(WIFI + 7, 4) == bytes([0xaa, 0xff, 0x00, 0xaa])
assert cpu.mem_read(WIFI + 0xcf6, 1) == b"\xaa"
assert cpu.mem_read(STORE, 0x300) == before_store
checksum_current()
call(0x0202c918, WIFI, 207, 63, 3)
assert call(0x0202c8c8, WIFI, 207, 63) == 3
for country in range(208, 256):
    for region in range(64):
        call(0x0202c918, WIFI, country, region, 1)
        assert call(0x0202c8c8, WIFI, country, region) == 0
assert cpu.mem_read(STORE, 0x300) == before_store
call(0x0202c88c, WIFI, 242, 30)  # WiFiHistory_SetCountryAndRegion
assert cpu.mem_read(WIFI + 5, 2) == bytes([242, 30])
assert cpu.mem_read(STORE, 0x300) == before_store
checksum_current()
open_bag()
assert cpu.mem_read(STORE, 0x300) == before_store

# The exact shared callee used by TrashSelectedItem (use/toss/sell).
for pocket_idx, item, backing, capacity, rendered in [
    (0, 79, BAG, 165, 252), (0, 468, SLOTS, 128, 252),
    (1, 17, BAG + 0x51c, 40, 40), (1, medicine, SLOTS, 128, 40),
    (2, 328, BAG + 0x35c, 100, 160), (2, 470, SLOTS, 128, 160),
    (3, 149, BAG + 0x5bc, 64, 64),
]:
    view = open_bag()[pocket_idx]
    rendered = u32(view - 8)
    assert call(RUNTIME["removeFromView"], view, rendered, item, 1, 6) == 1
    assert quantity(backing, capacity, item) == 4
    assert quantity(view, rendered, item) == 4
    if item >= 468:
        checksum_current()
    view = open_bag()[pocket_idx]
    assert quantity(view, rendered, item) == 4, "removed item returned after reopening"
    before = bytes(cpu.mem_read(BAG, 0x800)), bytes(cpu.mem_read(STORE, 0x300))
    assert call(RUNTIME["removeFromView"], view, rendered, item, 99, 6) == 0
    assert before == (bytes(cpu.mem_read(BAG, 0x800)), bytes(cpu.mem_read(STORE, 0x300)))
    assert call(RUNTIME["removeFromView"], view, rendered, item, 4, 6) == 1
    assert quantity(backing, capacity, item) == 0
    if item >= 468:
        checksum_current()

# Removing and adding through scripts/party effects must checksum *after* sorting.
reset()
add(471)
add(470)
checksum_current()

# Infinite Candy owns the removal entry, while the persistence fix owns only its
# success epilogue. Its non-consuming path and normal-item continuation coexist.
add(441)
view = BAG + 0x294
assert call(0x0207d60c, BAG, 441, 1, 6) == 1
assert quantity(view, 50, 441) == 5
assert call(0x0207d60c, BAG, 470, 5, 6) == 1
assert rows(SLOTS, 2) == [(471, 5), (0, 0)]
checksum_current()

# Vanilla reorder persists, expanded selected rows cannot be manually moved.
reset()
for item in [79, 80, 81, 468]:
    add(item)
view = open_bag()[0]
assert [i for i, q in rows(view, 4)] == [79, 80, 81, 468]
call(RUNTIME["reorderView"], view, 0, 4)
assert [i for i, q in rows(BAG, 3)] == [80, 81, 79]
assert [i for i, q in rows(open_bag()[0], 4)] == [80, 81, 79, 468]
before = bytes(cpu.mem_read(SLOTS, 512)), bytes(cpu.mem_read(view, 1008))
call(RUNTIME["reorderView"], view, 3, 0)
assert before == (bytes(cpu.mem_read(SLOTS, 512)), bytes(cpu.mem_read(view, 1008)))

# Complete Medicine views retain all vanilla and expanded rows.
reset()
vanilla_meds = [int(i) for i, p in fixture["pockets"].items() if int(i) < 468 and p == 1][:40]
for item in vanilla_meds:
    add(item)
expanded_meds = [int(i) for i, p in fixture["pockets"].items() if int(i) >= 468 and p == 1]
for item in expanded_meds:
    add(item)
view = open_bag()[1]
hidden = vanilla_meds[-1]
assert quantity(view, u32(view - 8), hidden) == 5
assert quantity(view, u32(view - 8), expanded_meds[-1]) == 5
assert call(RUNTIME["removeFromView"], view, u32(view - 8), vanilla_meds[0], 1, 6) == 1
assert quantity(BAG + 0x51c, 40, hidden) == 5
assert call(0x0207d60c, BAG, hidden, 1, 6) == 1
open_bag()
assert quantity(BAG + 0x51c, 40, hidden) == 4

# Cold bag reconstruction uses only the persisted inventory, not previous copies.
saved_bag, saved_wifi = bytes(cpu.mem_read(BAG, 0x800)), bytes(cpu.mem_read(WIFI, 0x1000))
reset()
cpu.mem_write(BAG, saved_bag)
cpu.mem_write(WIFI, saved_wifi)
cpu.mem_write(BASE + 0x1200, bytes(0x720))
cpu.mem_write(BASE + 0x1880, bytes(0xa0))
view = open_bag()[1]
assert quantity(view, u32(view - 8), medicine) == 5
assert quantity(BAG + 0x51c, 40, hidden) == 4

# TM display order is independent of storage order and internal compatibility IDs.
reset()
for item in range(328, 428):
    add(item, 1)
tm_ids = [int(i) for i, p in fixture["pockets"].items() if int(i) >= 468 and p == 3]
for item in reversed(tm_ids):
    add(item, 1)
view = open_bag()[2]
assert [i for i, q in rows(view, 160)] == list(range(328, 420)) + sorted(tm_ids) + list(range(420, 428))

# Row zero is the native list's blank padding, never its initial selection.
# Check both uncached contexts and freshly allocated/cleared field cursor caches.
cpu.mem_write(POCKET_LIST, bytes(list(range(8)) + [255]))
open_bag()
for cursor in [0, call(0x0207d99c, 6)]:
    word(CONTEXT + 0x6c, cursor)
    cpu.mem_write(CONTEXT + 0x64, b"\x07")
    for pocket in range(8):
        cpu.mem_write(CONTEXT + 8 + pocket * 12, bytes(4))
    call(RUNTIME["restoreCursor"], CONTROLLER)
    assert cpu.mem_read(CONTEXT + 0x64, 1) == b"\x00"
    for pocket in range(8):
        pos = u16(CONTEXT + 8 + pocket * 12)
        scroll = u16(CONTEXT + 10 + pocket * 12)
        assert (pos, scroll) == (1, 0), (cursor, pocket, pos, scroll)
        cpu.mem_write(CONTEXT + 0x64, bytes([pocket]))
        call(RUNTIME["loadNames"], CONTROLLER)
        call(0x0223c224, CONTROLLER, scroll, pos)
        assert list_menus[-1] == {
            "text_x": 43 if pocket == 3 else 35 if pocket == 4 else 0,
            "count": u16(CONTEXT + 14 + pocket * 12),
            "scroll": 0, "pos": 1,
        }, (pocket, list_menus[-1])
    # Saving/reopening retains both the chosen pocket and initialized positions.
    call(RUNTIME["saveCursor"], CONTROLLER)
    cpu.mem_write(CONTEXT + 0x64, b"\x02")
    call(RUNTIME["restoreCursor"], CONTROLLER)
    assert cpu.mem_read(CONTEXT + 0x64, 1) == bytes([7 if cursor else 0])
    assert all(u16(CONTEXT + 8 + p * 12) == 1 for p in range(8))
call(RUNTIME["freeNames"], CONTROLLER)

# Exercise configured extremes and all eight pockets, including 16-bit cursors.
for next_fixture in fixture.get("capacityCases", []):
    fixture = next_fixture
    RUNTIME = fixture["runtime"]
    BASE = fixture["helper"]
    for segment in fixture["segments"]:
        cpu.mem_write(segment["address"], base64.b64decode(segment["data"]))
    cpu.ctl_remove_cache(0x02000000, 0x02400000)
    reset()
    cpu.mem_write(POCKET_LIST, bytes(list(range(8)) + [255]))
    capacities = [165, 40, 15, 100, 64, 12, 30, 50]
    offsets = [0, 0x51c, 0x6bc, 0x35c, 0x5bc, 0x4ec, 0x6f8, 0x294]
    for pocket in range(8):
        assert call(0x0207d69c, BAG, pocket) == 0
        assert call(0x0207d910, BAG, pocket, capacities[pocket]) == 0
    extras = [int(i) for i in fixture["pockets"] if int(i) >= 468]
    for item in extras:
        add(item, 2)
    for mode in [0, 1, 3, 4, 5]:
        open_bag(mode)
        for pocket in range(8):
            matching = [i for i in extras if fixture["pockets"][str(i)] == pocket]
            assert call(0x0207d69c, BAG, pocket) == bool(matching)
            assert call(RUNTIME["vanillaHasPocketItems"], BAG, pocket) == 0
            if matching:
                slot = call(0x0207d910, BAG, pocket, capacities[pocket])
                assert SLOTS <= slot < SLOTS + 512
            view = u32(CONTEXT + 4 + pocket * 12)
            got = [i for i, q in rows(view, u32(view - 8)) if i and q]
            filtered = mode >= 3 or (mode == 1 and pocket in [5, 7])
            assert set(got) == (set() if filtered else set(matching))
        call(RUNTIME["freeNames"], CONTROLLER)
    open_bag()
    for item in extras:
        if fixture["pockets"][str(item)] in [2, 5, 7]:
            cpu.mem_write(CONTEXT + 0x66, struct.pack("<H", item))
            before = bytes(cpu.mem_read(STORE, 0x300))
            callback = call(RUNTIME["fieldUseCheck"], 2, 1, saved={UC_ARM_REG_R4: CONTROLLER})
            assert call(callback) == 1
            assert cpu.mem_read(STORE, 0x300) == before
    call(RUNTIME["freeNames"], CONTROLLER)
    reset()
    cpu.mem_write(POCKET_LIST, bytes(list(range(8)) + [255]))
    expected = {}
    for pocket, capacity in enumerate(capacities):
        vanilla = [int(i) for i, p in fixture["pockets"].items() if p == pocket and int(i) < 468][:capacity]
        extras = [int(i) for i, p in fixture["pockets"].items() if p == pocket and int(i) >= 468]
        for item in vanilla + extras:
            add(item, 2)
        expected[pocket] = vanilla + extras
    open_bag()
    for pocket in range(8):
        view = u32(CONTEXT + 4 + pocket * 12)
        got = [i for i, q in rows(view, u32(view - 8)) if i and q]
        assert set(got) == set(expected[pocket]), (pocket, len(got), len(expected[pocket]))
        assert call(0x0207d69c, BAG, pocket) == bool(got)
        cpu.mem_write(CONTEXT + 0x64, bytes([pocket]))
        call(RUNTIME["loadNames"], CONTROLLER)
        count = u16(CONTEXT + 4 + pocket * 12 + 10)
        assert count == len(got) + 3
        assert string_lists[u32(CONTROLLER + 0x160)][1:-2] == got
        # The same removal used by use/toss/sell must persist in every pocket.
        if got:
            item = got[-1]
            assert call(RUNTIME["removeFromView"], view, u32(view - 8), item, 1, 6) == 1
            assert call(0x0207d730, BAG, item, 6) == 1
            add(item, 1)
        if len(got) > 255:
            assert len(got) == 293
            selected_list_index = 292
            assert call(RUNTIME["canMoveEntry"], CONTROLLER) == 0
            selected_list_index = 0
            assert call(RUNTIME["canMoveEntry"], CONTROLLER) == 1
            cursor = call(0x0207d99c, 6)
            word(CONTEXT + 0x6c, cursor)
            cpu.mem_write(CONTEXT + 8 + pocket * 12, struct.pack("<HH", 4, 280))
            call(RUNTIME["saveCursor"], CONTROLLER)
            cpu.mem_write(CONTEXT + 8 + pocket * 12, bytes(4))
            call(RUNTIME["restoreCursor"], CONTROLLER)
            assert u16(CONTEXT + 8 + pocket * 12) == 4
            assert u16(CONTEXT + 10 + pocket * 12) == 280
            call(RUNTIME["reorderView"], view, 0, 292)
            assert u16(BAG + 164 * 4) == got[0]
            call(0x0223c194, CONTEXT + 10 + pocket * 12, CONTEXT + 8 + pocket * 12, count)
            assert u16(CONTEXT + 10 + pocket * 12) == 280
            call(0x0207d9c8, cursor, pocket, 3, 9)
            call(RUNTIME["restoreCursor"], CONTROLLER)
            assert u16(CONTEXT + 8 + pocket * 12) == 3
            assert u16(CONTEXT + 10 + pocket * 12) == 9
    call(RUNTIME["freeNames"], CONTROLLER)
    assert [u32(CONTEXT + 4 + p * 12) for p in range(8)] == [BAG + o for o in offsets]

    # Battle storage is controller-owned, has bounded reads and deduplicates HP/PP.
    battle_size = u32(RUNTIME["configuration"] + 4)
    cpu.mem_write(BATTLE, bytes(battle_size))
    cpu.mem_write(BATTLE + battle_size, b"CANARY!!")
    word(BATTLE, BATTLE_CONTEXT)
    word(BATTLE_CONTEXT + 8, BAG)
    word(BATTLE_CONTEXT + 12, 6)
    word(BATTLE + 0x14, 0x022b9000)
    call(0x02227ac8, BATTLE)
    assert cpu.mem_read(BATTLE + battle_size, 8) == b"CANARY!!"
    held_ids = [item for ids in expected.values() for item in ids]
    for category, mask in enumerate([20, 8, 1, 2, 0]):
        cpu.mem_write(BATTLE + 0x114d, bytes([category]))
        expected_ids = [i for i in held_ids if fixture["battleMasks"][str(i)] & mask]
        count = u16(BATTLE + 0x115c + category * 2)
        assert count == len(expected_ids)
        got = [u16(call(RUNTIME["battleSlot"], BATTLE, i)) for i in range(count)]
        assert set(got) == set(expected_ids)
        assert len(got) == len(set(got))
        assert u16(call(RUNTIME["battleSlot"], BATTLE, count)) == 0
        assert u16(call(RUNTIME["battleSlot"], BATTLE, 65535)) == 0
        if count:
            last = got[-1]
            cpu.mem_write(BATTLE_CONTEXT + 0x20, struct.pack("<H", last))
            call(0x02227a7c, BATTLE)
            assert cpu.mem_read(BATTLE_CONTEXT + 0x2c + category, 1)[0] == (count - 1) // 6
            assert call(0x02227ba8, BATTLE, (count - 1) % 6) == last
            assert call(0x02227ba8, BATTLE, (count - 1) % 6 + 1) == 0
            # Run the actual native render functions, not just their adapters.
            text_calls.clear()
            call(0x022274a8, BATTLE, count - 1, 0, 0, 2, 0x010203)
            call(0x0222754c, BATTLE, count - 1, 0, 1, 0, 4, 0x010203)
            call(0x022278a0, BATTLE, count - 1)
            call(0x02227910, BATTLE, count - 1)
            assert text_calls == [(0x0200b70c, last), (0x0200b60c, 2),
                                  (0x0200b70c, last), (0x0207cfc8, last)]
            text_calls.clear()
            call(0x022274a8, BATTLE, count, 0, 0, 2, 0x010203)
            call(0x0222754c, BATTLE, count, 0, 1, 0, 4, 0x010203)
            assert text_calls == []
            if last >= 468 and fixture["pockets"][str(last)] in [2, 5, 7]:
                cpu.mem_write(BATTLE_CONTEXT + 0x1c, struct.pack("<H", last))
                before = bytes(cpu.mem_read(STORE, 0x300))
                assert call(0x02226a5c, BATTLE) == 9  # Existing no-effect message state.
                assert before == cpu.mem_read(STORE, 0x300)
    cpu.mem_write(BATTLE + 0x114d, b"\xff")
    assert call(0x02227ba8, BATTLE, 0) == 0

# Overlay 16 shares RAM with the field application. Load it only after field
# tests, then exercise the actual held-item lookup with the padded table.
fixture = combined_fixture
for segment in fixture["segments"] + [fixture["battleData"]]:
    cpu.mem_write(segment["address"], base64.b64decode(segment["data"]))
cpu.ctl_remove_cache(0x02000000, 0x02400000)
table = call(0x0207d388, 6)
word(CONTROLLER + 0x2120, table)
held_medicines = [int(i) for i, p in fixture["pockets"].items() if int(i) >= 468 and p == 1]
for item in [17, 149, 328, 468, 468 + fixture["count"], 65534] + held_medicines:
    data_id = call(0x0207ce78, item, 0)
    for param in [0, 1, 2, 5, 13, 14]:
        expected = call(0x0207d014, table + data_id * 36, param)
        assert call(0x0225b0fc, CONTROLLER, item, param) == expected

print("ARM inventory tests passed: padded item tables/bounds, GeoNet protection, all-pocket persistence, "
      "293 Items/160 TM-HMs, 16-bit cursors, battle categories/renderers, held mints/caps and save reconstruction")
