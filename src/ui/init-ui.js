(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory;
  } else {
    const initUi = factory(root.PlatinumPatcher);
    root.PlatinumPatcherUi = { initUi };
    root.addEventListener("DOMContentLoaded", initUi);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (api) {
  "use strict";

  if (!api) {
    throw new Error("PlatinumPatcher UI requires PlatinumPatcher to load first.");
  }

  const {
    APP_VERSION,
    DEFAULT_ALLOWED_NATURES,
    NATURE_NAMES,
    NATURE_STAT_GRID,
    PATCHES,
    PATCH_INFO,
    PatchError,
    applySelectedPatches,
    arm9ExpansionStatus: getArm9ExpansionStatus,
    config,
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
  } = api;

function initUi() {
  const romInput = document.getElementById("romInput");
  const forceInput = document.getElementById("forceInput");
  const applyButton = document.getElementById("applyButton");
  const downloadLink = document.getElementById("downloadLink");
  const outputNameInput = document.getElementById("outputNameInput");
  const logOutput = document.getElementById("logOutput");
  const romStatus = document.getElementById("romStatus");
  const fileSubtitle = document.getElementById("fileSubtitle");
  const arm9ExpansionStatus = document.getElementById("arm9ExpansionStatus");
  const patchGrid = document.getElementById("patchGrid");
  const patchInfoModal = document.getElementById("patchInfoModal");
  const patchInfoTitle = document.getElementById("patchInfoTitle");
  const patchInfoSummary = document.getElementById("patchInfoSummary");
  const patchInfoRegions = document.getElementById("patchInfoRegions");
  const patchInfoClose = document.getElementById("patchInfoClose");
  const frameRateModeInputs = Array.from(document.querySelectorAll("input[name='frameRateMode']"));
  const textCharsPerFrameInput = document.getElementById("textCharsPerFrame");
  const textCharsPerFrameValue = document.getElementById("textCharsPerFrameValue");
  const shinyOddsPercentInput = document.getElementById("shinyOddsPercent");
  const shinyOddsValue = document.getElementById("shinyOddsValue");
  const critBaseDivisorInput = document.getElementById("critBaseDivisor");
  const critOddsValue = document.getElementById("critOddsValue");
  const ivMinInput = document.getElementById("ivMin");
  const ivMinValue = document.getElementById("ivMinValue");
  const ivMaxInput = document.getElementById("ivMax");
  const ivMaxValue = document.getElementById("ivMaxValue");
  const natureGrid = document.getElementById("natureGrid");
  const natureCountValue = document.getElementById("natureCountValue");
  const fairyTypeInput = document.getElementById("fairyTypePatch");
  const fairyPokemonTypesInput = document.getElementById("fairyPokemonTypesPatch");

  let loadedFile = null;
  let loadedBytes = null;
  let downloadUrl = null;

  function setLog(lines) {
    logOutput.textContent = Array.isArray(lines) ? lines.join("\n") : lines;
  }

  function updateArm9ExpansionStatus(bytes) {
    arm9ExpansionStatus.classList.remove("ready", "missing");
    if (!bytes) {
      arm9ExpansionStatus.textContent = "Load a ROM to check expansion status.";
      return;
    }

    try {
      const status = getArm9ExpansionStatus(bytes);
      const installed = status.branchInstalled && status.initInstalled && status.synthAvailable;
      arm9ExpansionStatus.classList.add(installed ? "ready" : "missing");
      if (installed) {
        arm9ExpansionStatus.textContent = `Installed - synthetic member ${hex(
          status.synthMemberLength
        )} bytes`;
      } else {
        const missing = [];
        if (!status.branchInstalled) {
          missing.push("ARM9 branch");
        }
        if (!status.initInstalled) {
          missing.push("loader");
        }
        if (!status.synthAvailable) {
          missing.push(
            status.synthMemberLength
              ? `synthetic member is ${hex(status.synthMemberLength)} bytes`
              : "synthetic member"
          );
        }
        arm9ExpansionStatus.textContent = `Not installed - ${missing.join(", ")}`;
      }
    } catch (error) {
      arm9ExpansionStatus.classList.add("missing");
      arm9ExpansionStatus.textContent = "Could not read expansion status.";
    }
  }

  function clearDownload() {
    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl);
      downloadUrl = null;
    }
    downloadLink.classList.add("hidden");
    downloadLink.removeAttribute("href");
    downloadLink.removeAttribute("download");
  }

  function selectedPatches() {
    return Array.from(patchGrid.querySelectorAll("input[type='checkbox']:checked")).map(
      (input) => input.value
    ).filter((patchId) => hasPatch(patchId));
  }

  function selectedNatureIds() {
    return Array.from(natureGrid.querySelectorAll("input[type='checkbox']:checked")).map(
      (input) => Number(input.value)
    );
  }

  function patchOptions() {
    return {
      force: forceInput.checked,
      frameRateMode:
        (frameRateModeInputs.find((input) => input.checked) || frameRateModeInputs[0]).value,
      textCharsPerFrame: textCharsPerFrameOption({
        textCharsPerFrame: textCharsPerFrameInput.value,
      }),
      shinyOddsPercent: shinyOddsPercentOption({
        shinyOddsPercent: shinyOddsPercentInput.value,
      }),
      critBaseDivisor: critBaseDivisorOption({
        critBaseDivisor: critBaseDivisorInput.value,
      }),
      ...ivRangeOption({
        ivMin: ivMinInput.value,
        ivMax: ivMaxInput.value,
      }),
      natureAllowed: selectedNatureIds(),
      debugFairyBattleTest: Boolean(config.debugFairyBattleTest),
    };
  }

  function patchLabel(id, options) {
    if (id === "frameRate") {
      return `${PATCHES[id]} (${frameRateModeOption(options) === "global" ? "global" : "battle only"})`;
    }
    if (id === "text4x") {
      return `${PATCHES[id]} (${textCharsPerFrameOption(options)}x)`;
    }
    if (id === "shinyOdds") {
      const threshold = shinyThresholdOption(options);
      if (options && options.shinyOddsPercent !== undefined) {
        return `${PATCHES[id]} (${shinyOddsPercentOption(options)}%, ${threshold}/65536)`;
      }
      return `${PATCHES[id]} (${threshold}/65536, ${shinyOddsLabel(threshold)})`;
    }
    if (id === "critOdds") {
      return `${PATCHES[id]} (${critOddsLabel(critBaseDivisorOption(options))})`;
    }
    if (id === "iv15_31") {
      return `${PATCHES[id]} (${ivRangeText(options)})`;
    }
    if (id === "wildNatures") {
      return `${PATCHES[id]} (${natureAllowedOption(options).length} allowed)`;
    }
    return PATCHES[id];
  }

  function updateTextSpeedValue() {
    textCharsPerFrameValue.textContent = `${textCharsPerFrameOption({
      textCharsPerFrame: textCharsPerFrameInput.value,
    })}x`;
  }

  function updateShinyOddsValue() {
    const percent = shinyOddsPercentOption({
      shinyOddsPercent: shinyOddsPercentInput.value,
    });
    const threshold = shinyThresholdFromPercent(percent);
    shinyOddsPercentInput.value = String(percent);
    shinyOddsValue.textContent = `${percent}% - ${threshold}/65536`;
  }

  function updateCritOddsValue() {
    const divisor = critBaseDivisorOption({
      critBaseDivisor: critBaseDivisorInput.value,
    });
    critBaseDivisorInput.value = String(divisor);
    critOddsValue.textContent = critOddsLabel(divisor);
  }

  function updateIvRangeValue(changedInput) {
    let minIv = Number(ivMinInput.value);
    let maxIv = Number(ivMaxInput.value);
    if (changedInput === ivMinInput && minIv > maxIv) {
      maxIv = minIv;
      ivMaxInput.value = String(maxIv);
    } else if (changedInput === ivMaxInput && maxIv < minIv) {
      minIv = maxIv;
      ivMinInput.value = String(minIv);
    }
    const range = ivRangeOption({ ivMin: minIv, ivMax: maxIv });
    ivMinInput.value = String(range.minIv);
    ivMaxInput.value = String(range.maxIv);
    ivMinValue.textContent = String(range.minIv);
    ivMaxValue.textContent = String(range.maxIv);
  }

  function renderNatureButtons() {
    natureGrid.textContent = "";
    const corner = document.createElement("div");
    corner.className = "nature-corner";
    corner.setAttribute("aria-hidden", "true");
    natureGrid.append(corner);

    for (const stat of NATURE_STAT_GRID) {
      const header = document.createElement("div");
      header.className = `nature-axis nature-axis-down nature-stat-${stat.key}`;
      header.textContent = `↓ ${stat.label}`;
      natureGrid.append(header);
    }

    for (const boosted of NATURE_STAT_GRID) {
      const rowHeader = document.createElement("div");
      rowHeader.className = `nature-axis nature-axis-up nature-stat-${boosted.key}`;
      rowHeader.textContent = `↑ ${boosted.label}`;
      natureGrid.append(rowHeader);

      for (const hindered of NATURE_STAT_GRID) {
        const nature = boosted.natureIndex * 5 + hindered.natureIndex;
        const label = document.createElement("label");
        label.className = "nature-chip";
        if (boosted.natureIndex === hindered.natureIndex) {
          label.classList.add("nature-neutral");
        }
        const input = document.createElement("input");
        input.type = "checkbox";
        input.value = String(nature);
        input.checked = DEFAULT_ALLOWED_NATURES.includes(nature);
        input.setAttribute(
          "aria-label",
          `${NATURE_NAMES[nature]}: raises ${boosted.label}, lowers ${hindered.label}`
        );
        const span = document.createElement("span");
        span.textContent = NATURE_NAMES[nature];
        span.title = `${NATURE_NAMES[nature]}: raises ${boosted.label}, lowers ${hindered.label}`;
        label.append(input, span);
        natureGrid.append(label);
      }
    }
  }

  function updateNatureCount(changedInput) {
    const checked = selectedNatureIds();
    if (!checked.length && changedInput) {
      changedInput.checked = true;
      checked.push(Number(changedInput.value));
    }
    natureCountValue.textContent = `${checked.length} allowed`;
  }

  function openPatchInfo(patchId) {
    const info = PATCH_INFO[patchId];
    if (!info) {
      return;
    }
    patchInfoTitle.textContent = info.title;
    patchInfoSummary.textContent = info.summary;
    patchInfoRegions.textContent = "";
    for (const region of info.regions) {
      const item = document.createElement("li");
      item.textContent = region;
      patchInfoRegions.append(item);
    }
    if (typeof patchInfoModal.showModal === "function") {
      patchInfoModal.showModal();
    } else {
      patchInfoModal.setAttribute("open", "");
    }
  }

  function closePatchInfo() {
    if (typeof patchInfoModal.close === "function") {
      patchInfoModal.close();
    } else {
      patchInfoModal.removeAttribute("open");
    }
  }

  function addPatchInfoButtons() {
    for (const card of patchGrid.querySelectorAll(".patch-card")) {
      const patchInput = card.querySelector("input[type='checkbox'][value]");
      if (!patchInput || !PATCH_INFO[patchInput.value]) {
        continue;
      }
      const button = document.createElement("button");
      button.className = "patch-info-button";
      button.type = "button";
      button.textContent = "i";
      button.setAttribute("aria-label", `Info for ${PATCH_INFO[patchInput.value].title}`);
      button.title = `Info for ${PATCH_INFO[patchInput.value].title}`;
      button.addEventListener("mousedown", (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        openPatchInfo(patchInput.value);
      });
      card.append(button);
    }
  }

  renderNatureButtons();
  addPatchInfoButtons();
  updateTextSpeedValue();
  updateShinyOddsValue();
  updateCritOddsValue();
  updateIvRangeValue();
  updateNatureCount();
  updateArm9ExpansionStatus();
  textCharsPerFrameInput.addEventListener("input", () => {
    updateTextSpeedValue();
    clearDownload();
  });
  shinyOddsPercentInput.addEventListener("input", () => {
    updateShinyOddsValue();
    clearDownload();
  });
  critBaseDivisorInput.addEventListener("input", () => {
    updateCritOddsValue();
    clearDownload();
  });
  ivMinInput.addEventListener("input", () => {
    updateIvRangeValue(ivMinInput);
    clearDownload();
  });
  ivMaxInput.addEventListener("input", () => {
    updateIvRangeValue(ivMaxInput);
    clearDownload();
  });
  natureGrid.addEventListener("change", (event) => {
    if (event.target instanceof HTMLInputElement && event.target.type === "checkbox") {
      updateNatureCount(event.target);
      clearDownload();
    }
  });
  fairyPokemonTypesInput.addEventListener("change", () => {
    if (fairyPokemonTypesInput.checked) {
      fairyTypeInput.checked = true;
    }
    clearDownload();
  });
  fairyTypeInput.addEventListener("change", () => {
    if (!fairyTypeInput.checked) {
      fairyPokemonTypesInput.checked = false;
    }
    clearDownload();
  });
  patchInfoClose.addEventListener("click", closePatchInfo);
  patchInfoModal.addEventListener("click", (event) => {
    if (event.target === patchInfoModal) {
      closePatchInfo();
    }
  });
  patchGrid.addEventListener("change", clearDownload);
  forceInput.addEventListener("change", clearDownload);
  outputNameInput.addEventListener("input", clearDownload);

  romInput.addEventListener("change", async () => {
    clearDownload();
    loadedFile = romInput.files && romInput.files[0] ? romInput.files[0] : null;
    loadedBytes = null;

    if (!loadedFile) {
      applyButton.disabled = true;
      romStatus.textContent = `No ROM loaded · ${APP_VERSION}`;
      romStatus.classList.remove("ready");
      updateArm9ExpansionStatus();
      fileSubtitle.textContent = "The patched ROM is generated locally in your browser.";
      setLog("Waiting for a ROM.");
      return;
    }

    try {
      const buffer = await loadedFile.arrayBuffer();
      loadedBytes = new Uint8Array(buffer);
      applyButton.disabled = false;
      romStatus.textContent = `${loadedFile.name} loaded · ${APP_VERSION}`;
      romStatus.classList.add("ready");
      updateArm9ExpansionStatus(loadedBytes);
      fileSubtitle.textContent = `${loadedFile.name} - ${(loadedFile.size / 1024 / 1024).toFixed(
        1
      )} MB`;
      setLog([
        `Loaded ${loadedFile.name}.`,
        `Size: ${loadedFile.size.toLocaleString()} bytes.`,
        "Choose patches and apply.",
      ]);
    } catch (error) {
      applyButton.disabled = true;
      romStatus.textContent = "Load failed";
      romStatus.classList.remove("ready");
      updateArm9ExpansionStatus();
      setLog(`Error: ${error.message}`);
    }
  });

  applyButton.addEventListener("click", () => {
    clearDownload();
    if (!loadedBytes || !loadedFile) {
      setLog("Choose a ROM first.");
      return;
    }

    const ids = selectedPatches();
    try {
      const options = patchOptions();
      const result = applySelectedPatches(loadedBytes, ids, options);
      const blob = new Blob([result.rom], { type: "application/octet-stream" });
      downloadUrl = URL.createObjectURL(blob);
      downloadLink.href = downloadUrl;
      downloadLink.download = customOutputName(
        outputNameInput.value,
        outputName(loadedFile.name, ids, options)
      );
      downloadLink.classList.remove("hidden");

      setLog([
        "Applied patches:",
        ...ids.map((id) => `- ${patchLabel(id, options)}`),
        "",
        ...result.log,
        "",
        `Output: ${downloadLink.download}`,
      ]);
    } catch (error) {
      const label = error instanceof PatchError ? "Patch error" : "Error";
      setLog(`${label}: ${error.message}`);
    }
  });
}

  return initUi;
});
