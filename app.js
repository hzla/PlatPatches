(() => {
  "use strict";

  const core =
    typeof module !== "undefined" && module.exports && typeof require === "function"
      ? require("./src/core.js")
      : typeof window !== "undefined"
        ? window.PlatinumPatcherCore
        : undefined;
  if (!core) {
    throw new Error("PlatinumPatcherCore failed to load.");
  }

  const registryModule =
    typeof module !== "undefined" && module.exports && typeof require === "function"
      ? require("./src/patches/registry.js")
      : typeof window !== "undefined"
        ? window.PlatinumPatcherRegistry
        : undefined;
  if (!registryModule) {
    throw new Error("PlatinumPatcherRegistry failed to load.");
  }

  const infrastructurePatches =
    typeof module !== "undefined" && module.exports && typeof require === "function"
      ? require("./src/patches/infrastructure.js")(core)
      : typeof window !== "undefined"
        ? window.PlatinumPatcherInfrastructurePatches
        : undefined;
  if (!infrastructurePatches) {
    throw new Error("PlatinumPatcherInfrastructurePatches failed to load.");
  }

  const simpleSitePatches =
    typeof module !== "undefined" && module.exports && typeof require === "function"
      ? require("./src/patches/simple-sites.js")(core)
      : typeof window !== "undefined"
        ? window.PlatinumPatcherSimpleSitePatches
        : undefined;
  if (!simpleSitePatches) {
    throw new Error("PlatinumPatcherSimpleSitePatches failed to load.");
  }

  const fairyPatches =
    typeof module !== "undefined" && module.exports && typeof require === "function"
      ? require("./src/patches/fairy-type.js")(core)
      : typeof window !== "undefined"
        ? window.PlatinumPatcherFairyPatches
        : undefined;
  if (!fairyPatches) {
    throw new Error("PlatinumPatcherFairyPatches failed to load.");
  }

  const infiniteCandyPatchFactory =
    typeof module !== "undefined" && module.exports && typeof require === "function"
      ? require("./src/patches/infinite-candy.js")
      : typeof window !== "undefined"
        ? window.PlatinumPatcherInfiniteCandyPatch
        : undefined;
  if (!infiniteCandyPatchFactory) {
    throw new Error("PlatinumPatcherInfiniteCandyPatch failed to load.");
  }

  const infiniteCandyPatches = infiniteCandyPatchFactory(core, {
    patchArm9Expansion: infrastructurePatches.arm9Expansion,
  });

  const itemRenewalPatches =
    typeof module !== "undefined" && module.exports && typeof require === "function"
      ? require("./src/patches/item-renewal.js")(core)
      : typeof window !== "undefined"
        ? window.PlatinumPatcherItemRenewalPatch
        : undefined;
  if (!itemRenewalPatches) {
    throw new Error("PlatinumPatcherItemRenewalPatch failed to load.");
  }

  const textSpeedPatches =
    typeof module !== "undefined" && module.exports && typeof require === "function"
      ? require("./src/patches/text-speed.js")(core)
      : typeof window !== "undefined"
        ? window.PlatinumPatcherTextSpeedPatches
        : undefined;
  if (!textSpeedPatches) {
    throw new Error("PlatinumPatcherTextSpeedPatches failed to load.");
  }

  const modernStatusPatches =
    typeof module !== "undefined" && module.exports && typeof require === "function"
      ? require("./src/patches/modern-status.js")(core)
      : typeof window !== "undefined"
        ? window.PlatinumPatcherModernStatusPatches
        : undefined;
  if (!modernStatusPatches) {
    throw new Error("PlatinumPatcherModernStatusPatches failed to load.");
  }

  const criticalPatches =
    typeof module !== "undefined" && module.exports && typeof require === "function"
      ? require("./src/patches/battle-critical.js")(core)
      : typeof window !== "undefined"
        ? window.PlatinumPatcherCriticalPatches
        : undefined;
  if (!criticalPatches) {
    throw new Error("PlatinumPatcherCriticalPatches failed to load.");
  }

  const rngPatches =
    typeof module !== "undefined" && module.exports && typeof require === "function"
      ? require("./src/patches/rng-generation.js")(core)
      : typeof window !== "undefined"
        ? window.PlatinumPatcherRngPatches
        : undefined;
  if (!rngPatches) {
    throw new Error("PlatinumPatcherRngPatches failed to load.");
  }

  const wildNaturePatches =
    typeof module !== "undefined" && module.exports && typeof require === "function"
      ? require("./src/patches/wild-natures.js")(core)
      : typeof window !== "undefined"
        ? window.PlatinumPatcherWildNaturePatches
        : undefined;
  if (!wildNaturePatches) {
    throw new Error("PlatinumPatcherWildNaturePatches failed to load.");
  }

  const weatherPatches =
    typeof module !== "undefined" && module.exports && typeof require === "function"
      ? require("./src/patches/battle-weather.js")(core)
      : typeof window !== "undefined"
        ? window.PlatinumPatcherWeatherPatches
        : undefined;
  if (!weatherPatches) {
    throw new Error("PlatinumPatcherWeatherPatches failed to load.");
  }

  const frameRatePatches =
    typeof module !== "undefined" && module.exports && typeof require === "function"
      ? require("./src/patches/frame-rate.js")(core)
      : typeof window !== "undefined"
        ? window.PlatinumPatcherFrameRatePatches
        : undefined;
  if (!frameRatePatches) {
    throw new Error("PlatinumPatcherFrameRatePatches failed to load.");
  }

  const fieldMovementPatches =
    typeof module !== "undefined" && module.exports && typeof require === "function"
      ? require("./src/patches/field-movement.js")(core)
      : typeof window !== "undefined"
        ? window.PlatinumPatcherFieldMovementPatches
        : undefined;
  if (!fieldMovementPatches) {
    throw new Error("PlatinumPatcherFieldMovementPatches failed to load.");
  }

  const fieldMiscPatches =
    typeof module !== "undefined" && module.exports && typeof require === "function"
      ? require("./src/patches/field-misc.js")(core)
      : typeof window !== "undefined"
        ? window.PlatinumPatcherFieldMiscPatches
        : undefined;
  if (!fieldMiscPatches) {
    throw new Error("PlatinumPatcherFieldMiscPatches failed to load.");
  }

  const summaryScreenPatches =
    typeof module !== "undefined" && module.exports && typeof require === "function"
      ? require("./src/patches/summary-screen.js")(core)
      : typeof window !== "undefined"
        ? window.PlatinumPatcherSummaryScreenPatches
        : undefined;
  if (!summaryScreenPatches) {
    throw new Error("PlatinumPatcherSummaryScreenPatches failed to load.");
  }

  const overworldSpritePatches =
    typeof module !== "undefined" && module.exports && typeof require === "function"
      ? require("./src/patches/overworld-sprites.js")(core)
      : typeof window !== "undefined"
        ? window.PlatinumPatcherOverworldSpritePatches
        : undefined;
  if (!overworldSpritePatches) {
    throw new Error("PlatinumPatcherOverworldSpritePatches failed to load.");
  }

  const itemExpansionPatches =
    typeof module !== "undefined" && module.exports && typeof require === "function"
      ? require("./src/patches/item-expansion.js")(core)
      : typeof window !== "undefined"
        ? window.PlatinumPatcherItemExpansionPatches
        : undefined;
  if (!itemExpansionPatches) {
    throw new Error("PlatinumPatcherItemExpansionPatches failed to load.");
  }

  const extraTmPatches =
    typeof module !== "undefined" && module.exports && typeof require === "function"
      ? require("./src/patches/extra-tms.js")(core, itemExpansionPatches)
      : typeof window !== "undefined"
        ? window.PlatinumPatcherExtraTmPatches
        : undefined;
  if (!extraTmPatches) {
    throw new Error("PlatinumPatcherExtraTmPatches failed to load.");
  }

  const { createPatchRegistry } = registryModule;
  const {
    PatchError,
    hex,
    dsPreArm9ExpansionStatus,
    findFileByPath,
    messageBankEntries,
    narcMemberBytes,
    parseNarc,
  } = core;
  const BASE_MMODEL_MEMBER_COUNT = 470;
  const MMODEL_NARC_PATH = "data/mmodel/mmodel.narc";
  const MESSAGE_NARC_PATH = "msgdata/pl_msg.narc";
  const MOVE_NAMES_MESSAGE_MEMBER = 647;

  const PATCHES = {
    arm9Expansion: "DSPRE ARM9 expansion",
    frameRate: "Unlock framerate",
    shinyOdds: "Shiny odds",
    critOdds: "Critical hit odds",
    critDamage: "Critical damage 1.5x",
    noCrits: "No critical hits",
    removeEVs: "Remove EV gain",
    modernParalysis: "Modern paralysis",
    modernBurn: "Modern burn",
    modernSleep: "Modern sleep",
    modernFreeze: "Modern freeze",
    modernConfusion: "Modern confusion",
    universalInfatuation: "Universal infatuation",
    modernSnow: "Modern snow",
    iv15_31: "Random IV range",
    wildNatures: "Filter wild natures",
    movementSpeed: "Faster movement",
    noOverworldPoison: "Remove overworld poison",
    infiniteContinuousCandy: "Infinite Candy",
    itemRenewal: "Item Renewal",
    instantPartyHealing: "Instant party healing",
    timeOfDayEvos: "Remove time evo clock checks",
    vsSeekerQol: "VS Seeker QoL",
    removeSurfWaterfallChecks: "Remove Surf/Waterfall checks",
    drySkinAiFix: "Dry Skin AI fix",
    forgettableHMs: "Forgettable HMs",
    instantPokeradar: "Instant Pokeradar recharge",
    infiniteTMs: "Infinite TMs",
    itemExpansion: "Item Expansion",
    extraTMs: "Extra TMs",
    fairyType: "Fairy Patch",
    fairyPokemonTypes: "Update Pokemon Types",
    instantText: "Force fast text",
    text4x: "Experimental text speed",
    playerAccuracy: "Player accuracy bypass",
    natureStatColors: "Nature stat colors",
    customOverworldSprites: "Custom overworld sprites",
  };
  const APP_VERSION = "v53";
  const PATCH_INFO = {
    arm9Expansion: {
      title: "DSPRE ARM9 expansion",
      summary:
        "Installs the same basic ARM9 expansion setup used by DSPRE and G4Patcher. This gives code-injection patches a large synthetic-overlay area to place helper routines.",
      regions: [
        "ARM9 expansion branch: ARM9 RAM 0x02000CB4-0x02000CB7 / ROM 0x00004CB4-0x00004CB7.",
        "ARM9 synthetic-overlay loader init: ARM9 RAM 0x02101574-0x0210158C / ROM 0x00105574-0x0010558C.",
        "Synthetic overlay storage: data/weather_sys.narc member 9 expanded to 0x16000 bytes, preserving existing contents if already expanded.",
        "If data/weather_sys.narc grows, later ROM files are shifted forward and their FAT entries are updated.",
      ],
    },
    fairyType: {
      title: "Fairy Patch",
      summary:
        "Adds Fairy as the old ??? type slot. This covers battle effectiveness and the visible type icons. The optional Pokemon type checkbox retags a small list of Pokemon without touching their stats, moves, or abilities.",
      regions: [
        "ARM9 helper: RAM 0x020F9400-0x020F943F / ROM 0x000FD400-0x000FD43F.",
        "Overlay 16 type table: +0x33B94-0x33CE2.",
        "Overlay 16 read hooks: +0x1A01A/+0x1A074 clean, +0x1A022/+0x1A07C pkaizo.",
        "Overlay 16 loop-step edits: +0x19FB6, +0x1A084, +0x1A766 clean; shifted +0x8 in pkaizo.",
        "Overlay 21 Pokedex display routing: +0xE408-0xE477.",
        "NARC assets: battle/graphic/pl_batt_obj.narc members 74 and 236; resource/eng/zukan/zukan.narc members 88, 89, and 90.",
        "Optional Pokemon type update: bytes 6 and 7 of selected poketool/personal/pl_personal.narc entries.",
      ],
    },
    frameRate: {
      title: "Unlock framerate",
      summary:
        "Makes the game stop waiting on every other frame in selected contexts. Battle only is the safer option; global affects more of the game.",
      regions: [
        "Global mode: ARM9 RAM 0x02000DF8-0x02000DF9 / ROM 0x00004DF8-0x00004DF9.",
        "Battle mode hook: ARM9 RAM 0x02000DF2-0x02000DF9 / ROM 0x00004DF2-0x00004DF9.",
        "Battle mode helper: ARM9 RAM 0x020F93D0-0x020F93EB / ROM 0x000FD3D0-0x000FD3EB.",
      ],
    },
    customOverworldSprites: {
      title: "Custom overworld sprites",
      summary:
        "Relocates and expands the overworld appearance tables so newly appended data/mmodel/mmodel.narc members can be mapped to new trainer-style overworld appearance IDs.",
      regions: [
        "Requires the DSPRE ARM9 expansion synthetic overlay; the patcher installs or preserves it automatically.",
        "Relocated tables are written to dynamically detected zero-filled space in data/weather_sys.narc member 9.",
        "ARM9 renderer-behavior table literal for Unk_ov5_021FB97C is redirected to the relocated table.",
        "Overlay 5 render properties, texture association, and animation table literals for Unk_ov5_021FC194, Unk_ov5_021FC9B4, and Unk_ov5_021FD77C are redirected to relocated copies.",
        "Each custom row maps a new appearance ID to an appended mmodel.narc member and clones renderer, render-property, and animation metadata from an existing overworld ID.",
      ],
    },
    shinyOdds: {
      title: "Shiny odds",
      summary:
        "Changes how often the game treats a Pokemon personality value as shiny. This is a global shiny check, not a wild-encounter-only edit.",
      regions: [
        "Simple threshold byte: ARM9 RAM 0x02075E50 / ROM 0x00079E50.",
        "Advanced threshold rewrite: ARM9 RAM 0x02075E38-0x02075E63 / ROM 0x00079E38-0x00079E63.",
      ],
    },
    critOdds: {
      title: "Critical hit odds",
      summary:
        "Changes the base chance for critical hits. Vanilla is 1/16; the default here is 1/24. This does nothing if No critical hits is also enabled.",
      regions: [
        "Overlay 16 table: +0x33A60-0x33A64 clean, +0x33A7C-0x33A80 pkaizo.",
        "Only the first byte is changed; the later stage divisors remain 08 04 03 02.",
      ],
    },
    critDamage: {
      title: "Critical damage 1.5x",
      summary:
        "Makes critical hits less swingy. Normal crits become 1.5x damage instead of 2x; Sniper crits become 2.25x instead of 3x.",
      regions: [
        "Overlay 16 normal damage hook: +0x62B8-0x62C3.",
        "Overlay 16 Beat Up hook: +0xAD5A-0xAD65.",
        "Overlay 16 helper cave: +0x34CA0-0x34CBB preferred; can fallback to another 0xFF fill run.",
      ],
    },
    text4x: {
      title: "Experimental text speed",
      summary:
        "Prints normal text faster than the built-in fast setting while trying to keep the normal text-box lifecycle intact. Some scripted text may still be picky.",
      regions: [
        "Force fast field helper: ARM9 RAM 0x02027AC0-0x02027AD9 / ROM 0x0002BAC0-0x0002BAD9.",
        "Battle text-speed helper: overlay 16 +0x3CB0-0x3CD7.",
        "Text-printer hook: ARM9 RAM 0x0201D97C-0x0201D983 / ROM 0x0002197C-0x00021983.",
        "Text-printer helper: ARM9 RAM 0x020795E0-0x0207969B / ROM 0x0007D5E0-0x0007D69B preferred; can fallback to another fill run.",
      ],
    },
    noCrits: {
      title: "No critical hits",
      summary:
        "Turns off critical hits in battle. Use this instead of the odds slider if you want crits gone completely.",
      regions: [
        "Overlay 16 stub: +0x1FDA4-0x1FDA7 clean, +0x1FDC0-0x1FDC3 pkaizo.",
        "Uses the critical-rate table as a nearby locator, so it tolerates the pkaizo +0x1C shift.",
      ],
    },
    removeEVs: {
      title: "Remove EV gain",
      summary:
        "Stops Pokemon from gaining EVs after battle. Existing EVs stay as they are; this only changes the reward step.",
      regions: [
        "Overlay 16 EV reward call site: RAM 0x02249B7C / overlay 16 +0xEA3C.",
      ],
    },
    modernParalysis: {
      title: "Modern paralysis",
      summary:
        "Updates paralysis closer to newer games: Thunder Wave has no effect on Electric-type Pokemon, non-Electric paralysis effects can still work, trainer AI scores Thunder Wave poorly into Electric-type targets, a paralyzed Pokemon only loses its turn 12.5% of the time, and paralysis cuts Speed in half instead of quartering it.",
      regions: [
        "Overlay 16 full-paralysis chance: +0x13B4E-0x13B59.",
        "Overlay 16 Speed-order paralysis divisors: +0x17FCA clean / +0x17FD2 pkaizo, and +0x18176 clean / +0x1817E pkaizo.",
        "Overlay 16 Thunder Wave Electric-target hook: +0x1360C-0x1360F.",
        "Legacy migration: restores the old status-set compatibility hook at +0x79E2-0x79E5 back to the vanilla BattleMon_Set call if present.",
        "ARM9 Thunder Wave helper: RAM 0x020F318C-0x020F31CF / ROM 0x000F718C-0x000F71CF.",
        "Trainer AI edit: battle/tr_ai/tr_ai_seq.narc member 0 Thunder Wave cannot-paralyze branch appends an Electric-type check helper.",
      ],
    },
    modernBurn: {
      title: "Modern burn",
      summary:
        "Keeps Facade at full physical damage when the user is burned, and lowers burn's end-of-turn chip damage from 1/8 max HP to 1/16. Facade still gets its normal status boost.",
      regions: [
        "Overlay 16 burn damage-reduction hook: +0x1FAF2 clean / +0x1FB0E pkaizo.",
        "Battle script burn residual damage: changes the burn-damage subscript divisor from 8 to 16. Observed divisor offsets are 0x008BEDC4 pkaizo and 0x03961FBC clean.",
        "ARM9 helper: RAM 0x020F3168-0x020F318B / ROM 0x000F7168-0x000F718B.",
        "The helper checks burn, Guts, and move ID 0x0107 before deciding whether to halve physical damage.",
      ],
    },
    modernSleep: {
      title: "Modern sleep",
      summary:
        "Shortens battle sleep to modern timing. The first asleep turn is guaranteed, the second turn has a one-in-three wake chance, and the third turn always wakes.",
      regions: [
        "Battle script sleep duration: changes the sleep-status Random command from 3,2 to 1,3 before BATTLEMON_STATUS is updated.",
        "Overlay 16 sleep counter hook: +0x13A62-0x13A77.",
        "ARM9 helper: RAM 0x020F321C-0x020F325B / ROM 0x000F721C-0x000F725B.",
        "The helper clamps older longer sleep counters, decrements once per action attempt, and rolls the 33% second-turn wake chance.",
      ],
    },
    modernFreeze: {
      title: "Modern freeze",
      summary:
        "Makes freeze less sticky in battle. A frozen Pokemon has a 25% chance to thaw when it tries to move, and if it stays frozen twice it will always thaw on the third frozen action.",
      regions: [
        "Overlay 16 freeze thaw-roll hook: +0x13B48-0x13B59.",
        "ARM9 helper: RAM 0x020F3300-0x020F3333 / ROM 0x000F7300-0x000F7333 preferred; can fallback to another nearby zero-filled cave.",
        "The helper uses BattleMon padding007A as a temporary per-battler freeze-turn counter. It is battle-local padding, not save data.",
      ],
    },
    modernConfusion: {
      title: "Modern confusion",
      summary:
        "Reduces confusion self-hit odds from a coin flip to about one in three. Confusion duration and snap-out behavior are unchanged.",
      regions: [
        "Overlay 16 confusion self-hit hook: +0x13A7E-0x13A87.",
        "ARM9 helper: RAM 0x020F3260-0x020F3277 / ROM 0x000F7260-0x000F7277.",
        "The helper calls the normal battle RNG and compares against a one-third threshold before returning to the original branch.",
      ],
    },
    universalInfatuation: {
      title: "Universal infatuation",
      summary:
        "Makes infatuation ignore gender restrictions. Attract, Cute Charm, and held-item infatuation can affect same-gender and genderless Pokemon; already-infatuated targets and Oblivious still behave normally. Optional trainer AI support stops AI scripts from penalizing Attract for gender reasons.",
      regions: [
        "Overlay 16 BtlCmd_TryAttract gender checks: +0xA4F4-0xA509.",
        "NOPs the same-gender and genderless failure branches, while preserving the already-infatuated failure branch.",
        "Optional trainer AI edit: battle/tr_ai/tr_ai_seq.narc member 0, Basic_CheckCannotAttract gender-check block around +0x14F0.",
      ],
    },
    modernSnow: {
      title: "Modern snow",
      summary:
        "Turns Platinum's existing Hail weather into Snow mechanically. Hail no longer chips HP at the end of the turn, Ice Body still heals, and Ice-type Pokemon take physical hits as if their Defense were 50% higher. The move and weather text still says Hail in this MVP.",
      regions: [
        "Overlay 16 hail chip branch: +0xA1EC-0xA205.",
        "Overlay 16 Snow Defense hook: +0x1F9D2 clean / +0x1F9EE pkaizo.",
        "ARM9 helper: RAM 0x020F32D0-0x020F32FB / ROM 0x000F72D0-0x000F72FB preferred; can fallback to another nearby zero-filled cave.",
        "The helper runs inside Platinum's existing weather-not-suppressed block, so Cloud Nine and Air Lock still suppress the Defense boost.",
      ],
    },
    iv15_31: {
      title: "Random IV range",
      summary:
        "Limits randomly generated IVs to the selected range. It rerolls each IV until it lands inside the min and max values.",
      regions: [
        "ARM9 RAM 0x02073F48-0x02073FCB / ROM 0x00077F48-0x00077FCB.",
      ],
    },
    wildNatures: {
      title: "Filter wild natures",
      summary:
        "Controls which natures wild Pokemon can generate with. If a nature is turned off, wild generation will keep trying until it gets an allowed one.",
      regions: [
        "Overlay 6 routine/table: +0x39A4-0x39FF.",
      ],
    },
    movementSpeed: {
      title: "Faster movement",
      summary:
        "Speeds up player walking, running, and cycling by changing the movement action constants used by the player.",
      regions: [
        "ARM9 constants: RAM 0x0205FE22, 0x0205FE3E, 0x0205FF92, 0x0205FFB0, 0x02060394, 0x020603A8, 0x020603AC, 0x020603B0.",
        "May also repair older pointer-table edits around ARM9 RAM 0x020EF194-0x020EF53C if it sees the previous patcher version.",
      ],
    },
    noOverworldPoison: {
      title: "Remove overworld poison",
      summary:
        "Stops poisoned party Pokemon from taking step-based damage while walking around. Battle poison damage is unchanged.",
      regions: [
        "Overlay 5 overworld poison routine: +0x1BA4-0x1BBB.",
        "The patch skips the post-step poison damage/check sequence after the normal party scan has run.",
      ],
    },
    infiniteContinuousCandy: {
      title: "Infinite Candy",
      summary:
        "Turns the Red Chain key item into Infinite Candy. You still need the Red Chain in the bag, but using it levels Pokemon like a Rare Candy, does not spend it, and returns to the party selection prompt after a normal level-up.",
      regions: [
        "Requires the DSPRE ARM9 expansion. Helper code is stored in data/weather_sys.narc member 9, loaded around RAM 0x023C8000.",
        "Chain-use hook: ARM9 RAM 0x02085EC6-0x02085EC9 / ROM 0x00089EC6-0x00089EC9. Existing Kalaay/Yako/Mixone Rare Candy chain hooks are detected and migrated to the Red Chain item ID.",
        "Bag_TryRemoveItem hook: ARM9 RAM 0x0207D60C-0x0207D613 / ROM 0x0008160C-0x00081613.",
        "Pocket_TryRemoveItem hook: ARM9 RAM 0x0207D658-0x0207D65F / ROM 0x00081658-0x0008165F.",
        "Red Chain item-table graphics: ARM9 RAM 0x020F1A8E-0x020F1A91 / ROM 0x000F5A8E-0x000F5A91. The Red Chain entry points at Rare Candy's icon and palette.",
        "Red Chain item data: itemtool/itemdata/pl_item_data.narc member 0x1A3 is given Rare Candy party-use behavior while staying in the Key Items pocket.",
        "Item text: msgdata/pl_msg.narc members 391-394 replace Red Chain description/name/article/plural strings.",
      ],
    },
    itemRenewal: {
      title: "Item Renewal",
      summary:
        "Preserves player-side saved held items after battle while keeping consumed items gone inside the current battle. Consumed berries and Focus Sash stay consumed during the fight, including player-side doubles and tag partners, so switching out and back in does not bring the item back early.",
      regions: [
        "Requires the DSPRE ARM9 expansion. Helper code is stored in data/weather_sys.narc member 9, loaded around RAM 0x023C8000.",
        "Battle update-party held-item writeback hook: overlay 16 pkaizo +0x213C0 / clean +0x213A4, RAM 0x0225C500 / 0x0225C4E4.",
        "Battle party held-item display cache hook: overlay 13 +0x14D8, RAM 0x022210F8.",
        "The helper marks held-item writeback messages as knocked off before the normal writeback check runs. If the outgoing held item is empty, it also marks the matching battle-side knocked-off mask so switch-in reloads and battle party displays keep the item absent until battle ends.",
        "Older Item Renewal snapshot/restore hooks from this patcher are detected and removed when possible.",
      ],
    },
    instantPartyHealing: {
      title: "Instant party healing",
      summary:
        "Makes party-menu healing items finish their healing animation faster. It does not change the amount healed.",
      regions: [
        "ARM9 party item healing call site: RAM 0x02085734-0x02085735 / ROM 0x00089734-0x00089735.",
      ],
    },
    timeOfDayEvos: {
      title: "Remove time evo clock checks",
      summary:
        "Lets held-item time-of-day evolutions ignore the DS clock requirement.",
      regions: [
        "ARM9 evolution checks: RAM 0x02076DFA-0x02076DFD and 0x02076DE2-0x02076DE5.",
      ],
    },
    vsSeekerQol: {
      title: "VS Seeker QoL",
      summary:
        "Makes the VS Seeker recharge quickly and improves the trainer-rematch roll.",
      regions: [
        "Overlay 5 VS Seeker recharge/rematch checks: RAM 0x021DBBC4-0x021DBBC6 and 0x021DBD28.",
      ],
    },
    removeSurfWaterfallChecks: {
      title: "Remove Surf/Waterfall checks",
      summary:
        "Allows Surf and Waterfall use without requiring a party Pokemon to know the matching HM move.",
      regions: [
        "Overlay 5 field-move party check: RAM 0x021D2832-0x021D2835 / overlay 5 +0x1AB2.",
      ],
    },
    drySkinAiFix: {
      title: "Dry Skin AI fix",
      summary:
        "Fixes the trainer AI value used for Dry Skin, so AI scoring no longer treats it like the wrong ability.",
      regions: [
        "Overlay 14 trainer AI ability table/check: RAM 0x022249CC / overlay 14 +0x4DAC.",
      ],
    },
    forgettableHMs: {
      title: "Forgettable HMs",
      summary:
        "Allows HMs to be forgotten like ordinary moves. This can make softlocks easier if a hack expects HM restrictions.",
      regions: [
        "Overlay 13 move-delete check: RAM 0x0222056E-0x02220573 / overlay 13 +0x94E.",
        "ARM9 move-delete check: RAM 0x0208CDD2-0x0208CDD7 / ROM 0x00090DD2-0x00090DD7.",
      ],
    },
    instantPokeradar: {
      title: "Instant Pokeradar recharge",
      summary:
        "Lets the Pokeradar recharge immediately instead of requiring the normal step count.",
      regions: [
        "ARM9 Pokeradar recharge step count: RAM 0x02069A42 / ROM 0x0006DA42.",
      ],
    },
    infiniteTMs: {
      title: "Infinite TMs",
      summary:
        "Stops TMs from being consumed after use. HMs are already reusable in Platinum.",
      regions: [
        "Overlay 84 TM-use consume call: RAM 0x0223F912-0x0223F915 / overlay 84 +0x4372.",
        "ARM9 item-use branch byte: RAM 0x020865EB / ROM 0x0008A5EB.",
      ],
    },
    itemExpansion: {
      title: "Item Expansion",
      summary:
        "Adds real new item IDs starting at 468 through a synthetic-overlay overflow item table and rankings-save overflow bag rows. Rows can optionally behave as extra TMs.",
      regions: [
        "Requires the DSPRE ARM9 expansion. Helper code is stored in data/weather_sys.narc member 9 with marker ITEMEXPV1.",
        "ARM9 hooks: Item_FileID at RAM 0x0207CE78, Item_Load at RAM 0x0207CF48, Bag_GetPocketForItem at RAM 0x0207D40C, and BagContext_CreateWithPockets at RAM 0x0207D824.",
        "Overflow rows: generated item IDs start at 0x1D4 and point to cloned vanilla data/icon/palette members.",
        "Expanded inventory storage: ITEMBAGV2 data is initialized in the tail of SAVE_TABLE_ENTRY_RANKINGS so expanded IDs do not consume vanilla bag pocket slots.",
        "Bag UI: the TM/HM pocket view is rebuilt from vanilla TM/HMs plus overflow TM rows in synthetic-overlay RAM scratch storage.",
        "Item text: msgdata/pl_msg.narc members 391-394 add names, article names, plural names, and descriptions for expanded IDs.",
        "Overworld pickup compatibility: visible-item scripts are left unchanged. Use DSPRE Item Standardization or a script edit that sets variable 0x8008 to the expanded item ID before placing expanded pickups.",
      ],
    },
    extraTMs: {
      title: "Extra TMs",
      summary:
        "Adds up to 60 configurable-move extra TMs in the TM/HM pocket by creating new expanded item IDs backed by Item Expansion overflow storage.",
      regions: [
        "Requires the DSPRE ARM9 expansion. Helper code is stored in data/weather_sys.narc member 9 with marker EXTRATMSV1.",
        "ARM9 hooks: Item_IsTMHM at RAM 0x0205E060, Item_MoveForTMHM at RAM 0x0207D268, Item_TMHMNumber at RAM 0x0207D2B4, and CanPokemonFormLearnTM at RAM 0x02077FE4.",
        "Overlay 84 bag UI hook: BagUI_PrintTMHMNumber at RAM 0x0223F8D0 displays configured entries as TM93-TM152 while preserving vanilla TM/HM display behavior.",
        "Overlay 84 TM/HM list capacity is widened from 100 rendered entries to 160 rendered entries.",
        "Item data: Item Expansion generates new item IDs that clone TM01 behavior and use type-matched TM icon/palette data where possible.",
        "Move mapping: each TM93-TM152 row can teach a numeric move ID or a move name read from msgdata/pl_msg.narc member 647.",
        "Compatibility: TM93-TM120 set the remaining vanilla personal TM mask bits for every personal entry; TM121-TM152 use an expanded compatibility table that currently defaults every personal entry to compatible.",
        "Item text: Item Expansion writes msgdata/pl_msg.narc members 391-394 for TM93-TM152.",
      ],
    },
    playerAccuracy: {
      title: "Player accuracy bypass",
      summary:
        "Lets player-side moves skip the normal accuracy miss roll. It does not bypass immunities, Protect, or semi-invulnerable states.",
      regions: [
        "Overlay 16 trampoline: +0x140FA-0x1410B clean, +0x140FE-0x1410F pkaizo.",
        "Overlay 16 helper: +0x34C68-0x34C83 preferred, +0x34C84-0x34C9F pkaizo observed; can fallback to another 0xFF fill run.",
      ],
    },
    natureStatColors: {
      title: "Nature stat colors",
      summary:
        "Colors Attack, Defense, Sp. Atk, Sp. Def, and Speed values on the summary screen: red for nature-boosted stats, blue for nature-lowered stats, and black for neutral stats.",
      regions: [
        "Requires the DSPRE ARM9 expansion. Helper code is stored in data/weather_sys.narc member 9, loaded around RAM 0x023C8000.",
        "Summary stat print hooks: ARM9 RAM 0x02090A50, 0x02090A74, 0x02090A9A, 0x02090ABE, and 0x02090AE4.",
        "The helper calls Platinum's existing Pokemon_GetStatAffinityOf routine and keeps HP/Ability text unchanged.",
      ],
    },
  };
  const CONSOLE_CONFIG = {
    debugFairyBattleTest: false,
  };

  const NATURE_NAMES = [
    "Hardy",
    "Lonely",
    "Brave",
    "Adamant",
    "Naughty",
    "Bold",
    "Docile",
    "Relaxed",
    "Impish",
    "Lax",
    "Timid",
    "Hasty",
    "Serious",
    "Jolly",
    "Naive",
    "Modest",
    "Mild",
    "Quiet",
    "Bashful",
    "Rash",
    "Calm",
    "Gentle",
    "Sassy",
    "Careful",
    "Quirky",
  ];
  const NATURE_STAT_GRID = [
    { key: "attack", label: "Attack", natureIndex: 0 },
    { key: "defense", label: "Defense", natureIndex: 1 },
    { key: "sp-atk", label: "Sp. Atk", natureIndex: 3 },
    { key: "sp-def", label: "Sp. Def", natureIndex: 4 },
    { key: "speed", label: "Speed", natureIndex: 2 },
  ];
  const DEFAULT_ALLOWED_NATURES = Array.from({ length: NATURE_NAMES.length }, (_, nature) => nature);

  function critBaseDivisorOption(options) {
    const value = Number(options && options.critBaseDivisor);
    if (!Number.isFinite(value)) {
      return 24;
    }
    return Math.max(1, Math.min(255, Math.trunc(value)));
  }

  function critOddsLabel(divisor) {
    return `1/${critBaseDivisorOption({ critBaseDivisor: divisor })} base`;
  }

  function textCharsPerFrameOption(options) {
    const value = Number(options && options.textCharsPerFrame);
    if (!Number.isFinite(value)) {
      return 4;
    }
    return Math.max(2, Math.min(10, Math.trunc(value)));
  }

  function frameRateModeOption(options) {
    return options && options.frameRateMode === "global" ? "global" : "battle";
  }

  function frameRateModeText(options) {
    return frameRateModeOption(options) === "global" ? "global" : "battle";
  }

  function ivRangeOption(options) {
    const minValue = Number(options && options.ivMin);
    const maxValue = Number(options && options.ivMax);
    let minIv = Number.isFinite(minValue) ? Math.trunc(minValue) : 15;
    let maxIv = Number.isFinite(maxValue) ? Math.trunc(maxValue) : 31;
    minIv = Math.max(0, Math.min(31, minIv));
    maxIv = Math.max(0, Math.min(31, maxIv));
    if (minIv > maxIv) {
      [minIv, maxIv] = [maxIv, minIv];
    }
    return { minIv, maxIv };
  }

  function ivRangeText(options) {
    const { minIv, maxIv } = ivRangeOption(options);
    return `${minIv}-${maxIv}`;
  }

  function natureAllowedOption(options) {
    const source = Array.isArray(options && options.natureAllowed)
      ? options.natureAllowed
      : DEFAULT_ALLOWED_NATURES;
    const allowed = Array.from(
      new Set(
        source
          .map((nature) => Number(nature))
          .filter((nature) => Number.isFinite(nature))
          .map((nature) => Math.trunc(nature))
          .filter((nature) => nature >= 0 && nature < NATURE_NAMES.length)
      )
    ).sort((a, b) => a - b);
    if (!allowed.length) {
      throw new PatchError("Wild nature filter needs at least one allowed nature.");
    }
    return allowed;
  }

  function natureMaskText(options) {
    const mask = natureAllowedOption(options).reduce((value, nature) => value | (1 << nature), 0);
    return mask.toString(16).toUpperCase();
  }

  function detectCustomMmodelMembers(inputBytes) {
    const rom = inputBytes instanceof Uint8Array ? inputBytes : new Uint8Array(inputBytes);
    const file = findFileByPath(rom, MMODEL_NARC_PATH);
    const narc = rom.slice(file.start, file.end);
    const count = parseNarc(narc).entries.length;
    const addedMembers = [];
    for (let member = BASE_MMODEL_MEMBER_COUNT; member < count; member += 1) {
      addedMembers.push(member);
    }
    return {
      path: MMODEL_NARC_PATH,
      count,
      baselineCount: BASE_MMODEL_MEMBER_COUNT,
      addedMembers,
    };
  }

  function readMoveNames(inputBytes) {
    const rom = inputBytes instanceof Uint8Array ? inputBytes : new Uint8Array(inputBytes);
    const file = findFileByPath(rom, MESSAGE_NARC_PATH);
    const narc = rom.slice(file.start, file.end);
    const names = messageBankEntries(narcMemberBytes(narc, MOVE_NAMES_MESSAGE_MEMBER));
    return names.map((name, id) => ({ id, name }));
  }

  function shinyThresholdOption(options) {
    if (options && options.shinyOddsPercent !== undefined) {
      return shinyThresholdFromPercent(options.shinyOddsPercent);
    }
    const value = Number(options && options.shinyThreshold);
    if (!Number.isFinite(value)) {
      return 8;
    }
    return Math.max(0, Math.min(65536, Math.trunc(value)));
  }

  function shinyOddsPercentOption(options) {
    const value = Number(options && options.shinyOddsPercent);
    if (!Number.isFinite(value)) {
      return 0;
    }
    return Math.max(0, Math.min(100, Math.trunc(value)));
  }

  function shinyThresholdFromPercent(percent) {
    const safePercent = shinyOddsPercentOption({ shinyOddsPercent: percent });
    return Math.round((safePercent * 65536) / 100);
  }

  function shinyPercentFromThreshold(threshold) {
    return Math.round((Math.max(0, Math.min(65536, threshold)) * 100) / 65536);
  }

  function shinyOddsLabel(threshold) {
    if (threshold <= 0) {
      return "never shiny";
    }
    if (65536 % threshold === 0) {
      return `1/${65536 / threshold}`;
    }
    return `about 1/${Math.round(65536 / threshold)}`;
  }

  const PATCH_REGISTRY = createPatchRegistry([
    { id: "arm9Expansion", apply: infrastructurePatches.arm9Expansion },
    { id: "frameRate", apply: frameRatePatches.frameRate },
    { id: "shinyOdds", apply: rngPatches.shinyOdds },
    { id: "critOdds", apply: criticalPatches.critOdds },
    { id: "critDamage", apply: criticalPatches.critDamage },
    { id: "noCrits", apply: criticalPatches.noCrits },
    { id: "removeEVs", apply: simpleSitePatches.removeEVs },
    { id: "modernParalysis", apply: modernStatusPatches.modernParalysis },
    { id: "modernBurn", apply: modernStatusPatches.modernBurn },
    { id: "modernSleep", apply: modernStatusPatches.modernSleep },
    { id: "modernFreeze", apply: modernStatusPatches.modernFreeze },
    { id: "modernConfusion", apply: modernStatusPatches.modernConfusion },
    { id: "universalInfatuation", apply: modernStatusPatches.universalInfatuation },
    { id: "modernSnow", apply: weatherPatches.modernSnow },
    { id: "iv15_31", apply: rngPatches.iv15_31 },
    { id: "wildNatures", apply: wildNaturePatches.wildNatures },
    { id: "movementSpeed", apply: fieldMovementPatches.movementSpeed },
    { id: "noOverworldPoison", apply: fieldMiscPatches.noOverworldPoison },
    { id: "infiniteContinuousCandy", apply: infiniteCandyPatches.infiniteContinuousCandy },
    { id: "itemRenewal", apply: itemRenewalPatches.itemRenewal },
    { id: "instantPartyHealing", apply: simpleSitePatches.instantPartyHealing },
    { id: "timeOfDayEvos", apply: simpleSitePatches.timeOfDayEvos },
    { id: "vsSeekerQol", apply: simpleSitePatches.vsSeekerQol },
    { id: "removeSurfWaterfallChecks", apply: simpleSitePatches.removeSurfWaterfallChecks },
    { id: "drySkinAiFix", apply: simpleSitePatches.drySkinAiFix },
    { id: "forgettableHMs", apply: simpleSitePatches.forgettableHMs },
    { id: "instantPokeradar", apply: simpleSitePatches.instantPokeradar },
    { id: "infiniteTMs", apply: simpleSitePatches.infiniteTMs },
    { id: "itemExpansion", apply: itemExpansionPatches.itemExpansion },
    { id: "extraTMs", apply: extraTmPatches.extraTMs },
    { id: "fairyType", apply: fairyPatches.fairyType },
    { id: "fairyPokemonTypes", apply: fairyPatches.fairyPokemonTypes },
    { id: "instantText", apply: textSpeedPatches.instantText },
    { id: "text4x", apply: textSpeedPatches.text4x },
    { id: "playerAccuracy", apply: fieldMiscPatches.playerAccuracy },
    { id: "natureStatColors", apply: summaryScreenPatches.natureStatColors },
    { id: "customOverworldSprites", apply: overworldSpritePatches.customOverworldSprites },
  ]);

  async function applySelectedPatches(inputBytes, patchIds, options = {}) {
    let rom = new Uint8Array(inputBytes);
    const log = [];
    const debugFairyBattleTest = Boolean(options.debugFairyBattleTest);
    if (rom.length < 0x200) {
      throw new PatchError("File is too small to be a Nintendo DS ROM.");
    }
    if (!patchIds.length) {
      throw new PatchError("Select at least one patch.");
    }

    const selected = new Set(patchIds);
    if (selected.has("fairyPokemonTypes")) {
      selected.add("fairyType");
    }
    const hasExpandedTmRows = Array.isArray(options.expandedItems)
      && options.expandedItems.some((row) => row && row.isTm);
    if (hasExpandedTmRows) {
      selected.add("extraTMs");
    }
    const extraTmsUsesExpandedItems = selected.has("extraTMs");
    const effectiveOptions = { ...options, extraTmsAutoExpandedItems: extraTmsUsesExpandedItems };
    if (selected.has("extraTMs")) {
      selected.add("itemExpansion");
    }
    if (
      selected.has("infiniteContinuousCandy") ||
      selected.has("itemRenewal") ||
      selected.has("natureStatColors") ||
      selected.has("customOverworldSprites") ||
      selected.has("itemExpansion") ||
      selected.has("extraTMs")
    ) {
      selected.add("arm9Expansion");
    }
    if (debugFairyBattleTest && !selected.has("fairyType")) {
      throw new PatchError("DEBUG Fairy battle test requires the Fairy Patch.");
    }
    if (debugFairyBattleTest) {
      selected.add("fairyPokemonTypes");
    }
    const effectivePatchIds = Array.from(selected);
    const orderedPatchIds = [
      ...(selected.has("arm9Expansion") ? ["arm9Expansion"] : []),
      ...(selected.has("fairyType") ? ["fairyType"] : []),
      ...(selected.has("itemExpansion") ? ["itemExpansion"] : []),
      ...effectivePatchIds.filter(
        (patchId) => patchId !== "arm9Expansion" && patchId !== "fairyType" && patchId !== "itemExpansion"
      ),
    ];
    for (const patchId of orderedPatchIds) {
      if (patchId === "instantText" && selected.has("text4x")) {
        continue;
      }
      const patch = PATCH_REGISTRY.get(patchId);
      if (!patch) {
        throw new PatchError(`Unknown patch: ${patchId}`);
      }
      const patchResult = await patch(rom, Boolean(effectiveOptions.force), log, effectiveOptions);
      if (patchResult instanceof Uint8Array) {
        rom = patchResult;
      }
    }

    if (debugFairyBattleTest) {
      fairyPatches.patchDebugFairyBattleTest(rom, log);
    }

    return { rom, log };
  }

  function hasPatch(patchId) {
    return PATCH_REGISTRY.has(patchId);
  }

  function outputName(inputName, patchIds, options = {}) {
    const dot = inputName.toLowerCase().endsWith(".nds") ? inputName.length - 4 : inputName.length;
    const base = inputName.slice(0, dot) || "platinum";
    const suffix = patchIds
      .map((id) =>
        id === "frameRate"
          ? `framerate${frameRateModeText(options)}`
          : id === "arm9Expansion"
          ? "arm9expanded"
          : id === "text4x"
          ? `text${textCharsPerFrameOption(options)}x`
          : id === "shinyOdds"
            ? options && options.shinyOddsPercent !== undefined
              ? `shiny${shinyOddsPercentOption(options)}pct`
              : `shinyT${shinyThresholdOption(options)}`
            : id === "critOdds"
              ? `crit1in${critBaseDivisorOption(options)}`
            : id === "critDamage"
              ? "crit15x"
            : id === "modernParalysis"
              ? "modernparalysis"
            : id === "modernBurn"
              ? "modernburn"
            : id === "modernSleep"
              ? "modernsleep"
            : id === "modernFreeze"
              ? "modernfreeze"
            : id === "modernConfusion"
              ? "modernconfusion"
            : id === "universalInfatuation"
              ? options && options.universalInfatuationAi
                ? "universalinfatuationai"
                : "universalinfatuation"
            : id === "modernSnow"
              ? "modernsnow"
            : id === "iv15_31"
              ? `iv${ivRangeText(options)}`
            : id === "wildNatures"
              ? `natures${natureMaskText(options)}`
            : id === "noOverworldPoison"
              ? "nooverworldpoison"
            : id === "infiniteContinuousCandy"
              ? "infinitecandy"
            : id === "itemRenewal"
              ? "itemrenewal"
            : id === "removeEVs"
              ? "noevs"
            : id === "natureStatColors"
              ? "naturecolors"
            : id === "customOverworldSprites"
              ? "customowsprites"
            : id === "instantPartyHealing"
              ? "instanthealing"
            : id === "timeOfDayEvos"
              ? "notimeevos"
            : id === "vsSeekerQol"
              ? "vsseekerqol"
            : id === "removeSurfWaterfallChecks"
              ? "nosurffallchecks"
            : id === "drySkinAiFix"
              ? "dryskinfix"
            : id === "forgettableHMs"
              ? "forgettablehms"
            : id === "instantPokeradar"
              ? "instantpokeradar"
            : id === "infiniteTMs"
              ? "infinitetms"
            : id === "itemExpansion"
              ? "itemexpansion"
            : id === "extraTMs"
              ? "extratms"
            : id.replace(/_/g, "")
      )
      .join(".");
    return `${base}.${suffix || "patched"}.nds`;
  }

  function customOutputName(inputName, fallbackName) {
    const trimmed = inputName.trim();
    if (!trimmed) {
      return fallbackName;
    }
    const safe = trimmed.replace(/[\\/:*?"<>|\x00-\x1f]/g, "_");
    return safe.toLowerCase().endsWith(".nds") ? safe : `${safe}.nds`;
  }

  if (typeof window !== "undefined") {
    window.PlatinumPatcher = {
      APP_VERSION,
      DEFAULT_ALLOWED_NATURES,
      NATURE_NAMES,
      NATURE_STAT_GRID,
      PATCH_INFO,
      applySelectedPatches,
      arm9ExpansionStatus: dsPreArm9ExpansionStatus,
      PATCHES,
      PatchError,
      config: CONSOLE_CONFIG,
      critBaseDivisorOption,
      critOddsLabel,
      customOutputName,
      detectCustomMmodelMembers,
      frameRateModeOption,
      hasPatch,
      hex,
      ivRangeOption,
      ivRangeText,
      natureAllowedOption,
      outputName,
      readMoveNames,
      shinyOddsLabel,
      shinyOddsPercentOption,
      shinyThresholdFromPercent,
      shinyThresholdOption,
      textCharsPerFrameOption,
    };
  }

  if (typeof module !== "undefined") {
    module.exports = {
      APP_VERSION,
      DEFAULT_ALLOWED_NATURES,
      NATURE_NAMES,
      NATURE_STAT_GRID,
      PATCH_INFO,
      applySelectedPatches,
      arm9ExpansionStatus: dsPreArm9ExpansionStatus,
      PATCHES,
      PatchError,
      config: CONSOLE_CONFIG,
      critBaseDivisorOption,
      critOddsLabel,
      customOutputName,
      detectCustomMmodelMembers,
      frameRateModeOption,
      hasPatch,
      hex,
      ivRangeOption,
      ivRangeText,
      natureAllowedOption,
      outputName,
      readMoveNames,
      shinyOddsLabel,
      shinyOddsPercentOption,
      shinyThresholdFromPercent,
      shinyThresholdOption,
      textCharsPerFrameOption,
    };
  }
})();
