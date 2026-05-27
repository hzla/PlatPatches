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

  const { createPatchRegistry } = registryModule;
  const {
    PatchError,
    hex,
    dsPreArm9ExpansionStatus,
  } = core;

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
    fairyType: "Fairy Patch",
    fairyPokemonTypes: "Update Pokemon Types",
    instantText: "Force fast text",
    text4x: "Experimental text speed",
    playerAccuracy: "Player accuracy bypass",
  };
  const APP_VERSION = "v44";
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
        "Updates paralysis closer to newer games: Electric-type Pokemon cannot be paralyzed, a paralyzed Pokemon only loses its turn 12.5% of the time, and paralysis cuts Speed in half instead of quartering it.",
      regions: [
        "Overlay 16 full-paralysis chance: +0x13B4E-0x13B59.",
        "Overlay 16 Speed-order paralysis divisors: +0x17FCA clean / +0x17FD2 pkaizo, and +0x18176 clean / +0x1817E pkaizo.",
        "Overlay 16 status-set hook: +0x79E2-0x79E5.",
        "ARM9 helper: RAM 0x020F30B4-0x020F30F7 / ROM 0x000F70B4-0x000F70F7.",
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
        "Restores the player's held items after battle cleanup if the Pokemon ends battle with no item. Consumed berries and Focus Sash stay consumed during the fight, so switching out and back in does not bring the item back early.",
      regions: [
        "Requires the DSPRE ARM9 expansion. Helper code and a small item snapshot table are stored in data/weather_sys.narc member 9, loaded around RAM 0x023C8000.",
        "BattleSystem_InitBattleMon snapshot hook: overlay 16 pkaizo +0x16B5C / clean +0x16B54, RAM 0x02251C9C / 0x02251C94.",
        "BattleControllerPlayer_EndFight restore hook: overlay 16 pkaizo +0x15628 / clean +0x15620, RAM 0x02250768 / 0x02250760.",
        "Tag and 2-vs-2 battles are supported by snapshotting only the actual player save-party battler. Link battles are still skipped.",
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
    playerAccuracy: {
      title: "Player accuracy bypass",
      summary:
        "Lets player-side moves skip the normal accuracy miss roll. It does not bypass immunities, Protect, or semi-invulnerable states.",
      regions: [
        "Overlay 16 trampoline: +0x140FA-0x1410B clean, +0x140FE-0x1410F pkaizo.",
        "Overlay 16 helper: +0x34C68-0x34C83 preferred, +0x34C84-0x34C9F pkaizo observed; can fallback to another 0xFF fill run.",
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
    { id: "fairyType", apply: fairyPatches.fairyType },
    { id: "fairyPokemonTypes", apply: fairyPatches.fairyPokemonTypes },
    { id: "instantText", apply: textSpeedPatches.instantText },
    { id: "text4x", apply: textSpeedPatches.text4x },
    { id: "playerAccuracy", apply: fieldMiscPatches.playerAccuracy },
  ]);

  function applySelectedPatches(inputBytes, patchIds, options = {}) {
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
    if (selected.has("infiniteContinuousCandy") || selected.has("itemRenewal")) {
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
      ...effectivePatchIds.filter(
        (patchId) => patchId !== "arm9Expansion" && patchId !== "fairyType"
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
      const patchResult = patch(rom, Boolean(options.force), log, options);
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
      frameRateModeOption,
      hasPatch,
      hex,
      ivRangeOption,
      ivRangeText,
      natureAllowedOption,
      outputName,
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
      frameRateModeOption,
      hasPatch,
      hex,
      ivRangeOption,
      ivRangeText,
      natureAllowedOption,
      outputName,
      shinyOddsLabel,
      shinyOddsPercentOption,
      shinyThresholdFromPercent,
      shinyThresholdOption,
      textCharsPerFrameOption,
    };
  }
})();
