(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory;
    return;
  }
  root.PlatinumPatcherInfrastructurePatches = factory(root.PlatinumPatcherCore);
})(typeof globalThis !== "undefined" ? globalThis : this, function (core) {
  "use strict";

  if (!core) {
    throw new Error("PlatinumPatcherCore failed to load for infrastructure patches.");
  }

  const {
    DSPRE_SYNTH_OVERLAY_PATH,
    DSPRE_SYNTH_OVERLAY_MEMBER,
    DSPRE_SYNTH_OVERLAY_SIZE,
    DSPRE_ARM9_BRANCH_RAM,
    DSPRE_ARM9_INIT_RAM,
    DSPRE_ARM9_BRANCH_ORIGINAL,
    DSPRE_ARM9_BRANCH_PATCHED,
    DSPRE_ARM9_INIT_ORIGINAL,
    DSPRE_ARM9_INIT_PATCHED,
    hex,
    writeBytes,
    requireBytes,
    findFileByPath,
    replaceNarcMembers,
    replaceRomFileAllowGrowth,
    narcMemberLength,
    dsPreArm9ExpansionStatus,
  } = core;

  function patchArm9Expansion(rom, force, log) {
    const status = dsPreArm9ExpansionStatus(rom);
    const branchState = requireBytes(
      rom,
      status.branchAt,
      DSPRE_ARM9_BRANCH_ORIGINAL,
      DSPRE_ARM9_BRANCH_PATCHED,
      force,
      "DSPRE ARM9 expansion branch"
    );
    const initState = requireBytes(
      rom,
      status.initAt,
      DSPRE_ARM9_INIT_ORIGINAL,
      DSPRE_ARM9_INIT_PATCHED,
      force,
      "DSPRE ARM9 synthetic-overlay loader"
    );

    if (branchState !== "already") {
      writeBytes(rom, status.branchAt, DSPRE_ARM9_BRANCH_PATCHED);
    }
    if (initState !== "already") {
      writeBytes(rom, status.initAt, DSPRE_ARM9_INIT_PATCHED);
    }

    let outRom = rom;
    let synthState = "already";
    let growth = 0;
    const synthFile = findFileByPath(outRom, DSPRE_SYNTH_OVERLAY_PATH);
    const synthNarc = outRom.slice(synthFile.start, synthFile.end);
    const memberLength = narcMemberLength(synthNarc, DSPRE_SYNTH_OVERLAY_MEMBER);
    if (memberLength < DSPRE_SYNTH_OVERLAY_SIZE) {
      const expandedMember = new Uint8Array(DSPRE_SYNTH_OVERLAY_SIZE);
      const patchedNarc = replaceNarcMembers(synthNarc, [[DSPRE_SYNTH_OVERLAY_MEMBER, expandedMember]]);
      const replacement = replaceRomFileAllowGrowth(
        outRom,
        synthFile,
        patchedNarc,
        "DSPRE synthetic overlay NARC"
      );
      outRom = replacement.rom;
      synthState = replacement.state;
      growth = replacement.growth;
    }

    const finalSynthFile = findFileByPath(outRom, DSPRE_SYNTH_OVERLAY_PATH);
    const finalSynthLength = narcMemberLength(
      outRom.slice(finalSynthFile.start, finalSynthFile.end),
      DSPRE_SYNTH_OVERLAY_MEMBER
    );
    log.push(
      `DSPRE ARM9 expansion: ${
        branchState === "already" && initState === "already" ? "already installed" : "installed"
      } ARM9 branch at RAM ${hex(DSPRE_ARM9_BRANCH_RAM)} / ROM ${hex(status.branchAt)} and loader at RAM ${hex(
        DSPRE_ARM9_INIT_RAM
      )} / ROM ${hex(status.initAt)}.`
    );
    log.push(
      `DSPRE synthetic overlay: ${
        synthState === "already" ? "already expanded/preserved" : "expanded"
      } ${DSPRE_SYNTH_OVERLAY_PATH} member ${DSPRE_SYNTH_OVERLAY_MEMBER} to ${hex(finalSynthLength)} byte(s)${
        growth ? `; ROM grew by ${growth} byte(s) and later FAT entries were shifted` : ""
      }.`
    );
    return outRom;
  }

  return {
    arm9Expansion: patchArm9Expansion,
  };
});
