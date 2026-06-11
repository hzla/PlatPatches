#!/usr/bin/env node
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const DEFAULT_BASELINE_REPO = "/Users/andylee/Desktop/platinum-rom-patcher";
const DEFAULT_CURRENT_REPO = path.resolve(__dirname, "..");
const DEFAULT_ROM = "/Users/andylee/Repos/vsrecorder/cleanplat.nds";

const DEFAULT_OPTIONS = {
  force: false,
  frameRateMode: "battle",
  textCharsPerFrame: 4,
  shinyOddsPercent: 1,
  critBaseDivisor: 24,
  ivMin: 15,
  ivMax: 31,
  natureAllowed: Array.from({ length: 25 }, (_, nature) => nature),
  universalInfatuationAi: false,
  debugFairyBattleTest: false,
};

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function firstDiff(a, b) {
  const max = Math.max(a.length, b.length);
  for (let offset = 0; offset < max; offset += 1) {
    if (a[offset] !== b[offset]) {
      return offset;
    }
  }
  return -1;
}

function allPatchIds(repoPath) {
  const app = require(path.join(repoPath, "app.js"));
  return Object.keys(app.PATCHES);
}

function runWorker({ repoPath, romPath, patchIds, options, repeat, outPath }) {
  const input = JSON.stringify({ repoPath, romPath, patchIds, options, repeat, outPath });
  const result = spawnSync(process.execPath, [__filename, "--worker"], {
    input,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 16,
  });
  if (result.status !== 0) {
    throw new Error(
      [
        `Worker failed for ${repoPath}`,
        result.stdout.trim(),
        result.stderr.trim(),
      ].filter(Boolean).join("\n")
    );
  }
  return JSON.parse(result.stdout);
}

async function worker() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const { repoPath, romPath, patchIds, options, repeat, outPath } = JSON.parse(chunks.join(""));
  const app = require(path.join(repoPath, "app.js"));
  let rom = fs.readFileSync(romPath);
  let log = [];
  for (let pass = 0; pass < repeat; pass += 1) {
    const result = await app.applySelectedPatches(rom, patchIds, options);
    rom = result.rom;
    log = result.log;
  }
  fs.writeFileSync(outPath, rom);
  process.stdout.write(JSON.stringify({ length: rom.length, hash: sha256(rom), log }));
}

function compareScenario({ baselineRepo, currentRepo, romPath, tempDir, scenario }) {
  const baselineOut = path.join(tempDir, `${scenario.name}.baseline.nds`);
  const currentOut = path.join(tempDir, `${scenario.name}.current.nds`);
  const baseline = runWorker({
    repoPath: baselineRepo,
    romPath,
    patchIds: scenario.patchIds,
    options: scenario.options,
    repeat: scenario.repeat || 1,
    outPath: baselineOut,
  });
  const current = runWorker({
    repoPath: currentRepo,
    romPath,
    patchIds: scenario.patchIds,
    options: scenario.options,
    repeat: scenario.repeat || 1,
    outPath: currentOut,
  });

  const baselineBytes = fs.readFileSync(baselineOut);
  const currentBytes = fs.readFileSync(currentOut);
  const diff = firstDiff(baselineBytes, currentBytes);
  if (diff !== -1) {
    const before = baselineBytes.subarray(diff, diff + 16).toString("hex").match(/../g).join(" ");
    const after = currentBytes.subarray(diff, diff + 16).toString("hex").match(/../g).join(" ");
    throw new Error(
      `${scenario.name} differs at ${diff.toString(16).toUpperCase()}:\n` +
        `baseline ${before}\ncurrent  ${after}`
    );
  }

  return {
    name: scenario.name,
    length: current.length,
    hash: current.hash,
    baselineHash: baseline.hash,
  };
}

function main() {
  const baselineRepo = process.env.BASELINE_REPO || DEFAULT_BASELINE_REPO;
  const currentRepo = process.env.CURRENT_REPO || DEFAULT_CURRENT_REPO;
  const romPath = process.env.ROM_PATH || DEFAULT_ROM;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "platpatches-armips-"));
  const wave1PatchIds = [
    "modernParalysis",
    "modernBurn",
    "modernSleep",
    "modernFreeze",
    "modernConfusion",
  ];
  const scenarios = [
    ...wave1PatchIds.flatMap((patchId) => [
      {
        name: patchId,
        patchIds: [patchId],
        options: DEFAULT_OPTIONS,
      },
      {
        name: `${patchId}-reapply`,
        patchIds: [patchId],
        options: DEFAULT_OPTIONS,
        repeat: 2,
      },
    ]),
    {
      name: "wave1-modern-status-combined",
      patchIds: wave1PatchIds,
      options: DEFAULT_OPTIONS,
    },
    {
      name: "wave1-modern-status-combined-reapply",
      patchIds: wave1PatchIds,
      options: DEFAULT_OPTIONS,
      repeat: 2,
    },
    {
      name: "natureStatColors",
      patchIds: ["natureStatColors"],
      options: DEFAULT_OPTIONS,
    },
    {
      name: "natureStatColors-reapply",
      patchIds: ["natureStatColors"],
      options: DEFAULT_OPTIONS,
      repeat: 2,
    },
    {
      name: "itemRenewal",
      patchIds: ["itemRenewal"],
      options: DEFAULT_OPTIONS,
    },
    {
      name: "itemRenewal-reapply",
      patchIds: ["itemRenewal"],
      options: DEFAULT_OPTIONS,
      repeat: 2,
    },
    {
      name: "infiniteContinuousCandy",
      patchIds: ["infiniteContinuousCandy"],
      options: DEFAULT_OPTIONS,
    },
    {
      name: "infiniteContinuousCandy-reapply",
      patchIds: ["infiniteContinuousCandy"],
      options: DEFAULT_OPTIONS,
      repeat: 2,
    },
    {
      name: "synthetic-overlay-pilots-combined",
      patchIds: ["natureStatColors", "itemRenewal"],
      options: DEFAULT_OPTIONS,
    },
    {
      name: "synthetic-overlay-pilots-combined-reapply",
      patchIds: ["natureStatColors", "itemRenewal"],
      options: DEFAULT_OPTIONS,
      repeat: 2,
    },
    {
      name: "synthetic-overlay-wave2-combined",
      patchIds: ["natureStatColors", "itemRenewal", "infiniteContinuousCandy"],
      options: DEFAULT_OPTIONS,
    },
    {
      name: "synthetic-overlay-wave2-combined-reapply",
      patchIds: ["natureStatColors", "itemRenewal", "infiniteContinuousCandy"],
      options: DEFAULT_OPTIONS,
      repeat: 2,
    },
    {
      name: "all-patches-defaults",
      patchIds: allPatchIds(currentRepo),
      options: DEFAULT_OPTIONS,
    },
  ];

  console.log(`Baseline: ${baselineRepo}`);
  console.log(`Current:  ${currentRepo}`);
  console.log(`ROM:      ${romPath}`);
  console.log(`Temp:     ${tempDir}`);

  for (const scenario of scenarios) {
    const result = compareScenario({ baselineRepo, currentRepo, romPath, tempDir, scenario });
    console.log(`${result.name}: identical ${result.length} bytes ${result.hash}`);
  }
}

if (process.argv.includes("--worker")) {
  worker().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
  });
} else {
  main();
}
