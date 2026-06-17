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
    detectExtraTmState,
    detectCustomMmodelMembers,
    frameRateModeOption,
    hasPatch,
    hex,
    ivRangeOption,
    ivRangeText,
    natureAllowedOption,
    outputName,
    pokemonFamilyForSpecies,
    pokemonWithLevelUpMove,
    readMoveNames,
    readSpeciesNames,
    shinyOddsLabel,
    shinyOddsPercentOption,
    shinyThresholdFromPercent,
    shinyThresholdOption,
    textCharsPerFrameOption,
    vanillaTmCompatibilityForMove,
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
  const patchTabButtons = Array.from(document.querySelectorAll("[data-patch-tab]"));
  const patchTabPanels = Array.from(document.querySelectorAll("[data-patch-panel]"));
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
  const universalInfatuationInput = document.getElementById("universalInfatuationPatch");
  const universalInfatuationAiInput = document.getElementById("universalInfatuationAiPatch");
  const customOverworldSpriteRows = document.getElementById("customOverworldSpriteRows");
  const customOverworldSpriteStatus = document.getElementById("customOverworldSpriteStatus");
  const customOverworldSpriteRefresh = document.getElementById("customOverworldSpriteRefresh");
  const itemExpansionRows = document.getElementById("itemExpansionRows");
  const itemExpansionStatus = document.getElementById("itemExpansionStatus");
  const itemExpansionAddRow = document.getElementById("itemExpansionAddRow");
  const extraTmsInput = document.getElementById("extraTmsPatch");
  const extraTmConfig = document.getElementById("extraTmConfig");
  const extraTmRows = document.getElementById("extraTmRows");
  const extraTmStatus = document.getElementById("extraTmStatus");
  const extraTmMoveOptions = document.getElementById("extraTmMoveOptions");
  const extraTmSpeciesOptions = document.getElementById("extraTmSpeciesOptions");
  const extraTmCompatModal = document.getElementById("extraTmCompatModal");
  const extraTmCompatTitle = document.getElementById("extraTmCompatTitle");
  const extraTmCompatClose = document.getElementById("extraTmCompatClose");
  const extraTmCompatInput = document.getElementById("extraTmCompatInput");
  const extraTmCompatAdd = document.getElementById("extraTmCompatAdd");
  const extraTmCompatAddFamily = document.getElementById("extraTmCompatAddFamily");
  const extraTmCompatAddLearnset = document.getElementById("extraTmCompatAddLearnset");
  const extraTmCompatCopyInput = document.getElementById("extraTmCompatCopyInput");
  const extraTmCompatCopy = document.getElementById("extraTmCompatCopy");
  const extraTmCompatClear = document.getElementById("extraTmCompatClear");
  const extraTmCompatList = document.getElementById("extraTmCompatList");
  const extraTmCompatStatus = document.getElementById("extraTmCompatStatus");
  const EXTRA_TM_COUNT = 60;

  let loadedFile = null;
  let loadedBytes = null;
  let downloadUrl = null;
  let speciesNames = [];
  let personalEntryCount = 0;
  let activeCompatRow = null;

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

  function createCustomOverworldInput(labelText, field, value) {
    const label = document.createElement("label");
    label.className = "ow-sprite-field";

    const span = document.createElement("span");
    span.textContent = labelText;

    const input = document.createElement("input");
    input.type = "text";
    input.value = value;
    input.autocomplete = "off";
    input.spellcheck = false;
    input.dataset.owField = field;

    label.append(span, input);
    return label;
  }

  function renderCustomOverworldSpriteRows(bytes) {
    if (!customOverworldSpriteRows || !customOverworldSpriteStatus) {
      return;
    }
    customOverworldSpriteRows.textContent = "";
    customOverworldSpriteStatus.classList.remove("ready", "missing");

    if (!bytes) {
      customOverworldSpriteStatus.textContent = "Load a ROM to detect appended mmodel members.";
      return;
    }

    try {
      const info = detectCustomMmodelMembers(bytes);
      if (info.addedMembers.length) {
        customOverworldSpriteStatus.classList.add("ready");
        customOverworldSpriteStatus.textContent = `Detected ${info.addedMembers.length} appended mmodel member${
          info.addedMembers.length === 1 ? "" : "s"
        }.`;
      } else {
        customOverworldSpriteStatus.textContent = `No appended mmodel members detected. ${info.count}/${info.baselineCount} members.`;
      }

      info.addedMembers.forEach((mmodelMember, index) => {
        const row = document.createElement("div");
        row.className = "ow-sprite-row";
        row.append(
          createCustomOverworldInput("Appearance ID", "appearanceId", hex(0x200 + index)),
          createCustomOverworldInput("mmodel member", "mmodelMember", hex(mmodelMember)),
          createCustomOverworldInput("Clone from", "cloneFrom", "0x78")
        );
        customOverworldSpriteRows.append(row);
      });
    } catch (error) {
      customOverworldSpriteStatus.classList.add("missing");
      customOverworldSpriteStatus.textContent = "Could not inspect data/mmodel/mmodel.narc.";
    }
  }

  function customOverworldSpriteEntries() {
    if (!customOverworldSpriteRows) {
      return [];
    }
    return Array.from(customOverworldSpriteRows.querySelectorAll(".ow-sprite-row"))
      .map((row) => {
        const field = (name) => {
          const input = row.querySelector(`[data-ow-field="${name}"]`);
          return input ? input.value.trim() : "";
        };
        return {
          appearanceId: field("appearanceId"),
          mmodelMember: field("mmodelMember"),
          cloneFrom: field("cloneFrom"),
        };
      })
      .filter((row) => row.appearanceId || row.mmodelMember);
  }

  function createItemExpansionField(labelText, field, value = "", multiline = false) {
    const label = document.createElement("label");
    label.className = "item-expansion-field";

    const span = document.createElement("span");
    span.textContent = labelText;

    const input = multiline ? document.createElement("textarea") : document.createElement("input");
    if (!multiline) {
      input.type = "text";
    }
    input.value = value;
    input.autocomplete = "off";
    input.spellcheck = false;
    input.dataset.itemExpansionField = field;

    label.append(span, input);
    return label;
  }

  function createItemExpansionRow(values = {}) {
    const row = document.createElement("div");
    row.className = "item-expansion-row";

    const rowLabel = document.createElement("div");
    rowLabel.className = "item-expansion-row-label";

    const remove = document.createElement("button");
    remove.className = "secondary-button item-expansion-remove";
    remove.type = "button";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => {
      row.remove();
      renumberItemExpansionRows();
      renderExtraTmRows();
      clearDownload();
    });

    const tmToggle = document.createElement("label");
    tmToggle.className = "item-expansion-tm-toggle";
    const tmInput = document.createElement("input");
    tmInput.type = "checkbox";
    tmInput.checked = Boolean(values.isTm);
    tmInput.dataset.itemExpansionField = "isTm";
    const tmText = document.createElement("span");
    tmText.textContent = "TM";
    tmToggle.append(tmInput, tmText);

    const moveField = createItemExpansionField("Move", "move", values.move || "");
    const moveInput = moveField.querySelector("input");
    if (moveInput) {
      moveInput.setAttribute("list", "extraTmMoveOptions");
      moveInput.placeholder = "Karate Chop or 0x2";
    }

    row.append(
      rowLabel,
      tmToggle,
      createItemExpansionField("Clone from", "cloneFrom", values.cloneFrom || ""),
      createItemExpansionField("Icon from", "iconFrom", values.iconFrom || ""),
      createItemExpansionField("Name", "name", values.name || ""),
      moveField,
      createItemExpansionField("Description", "description", values.description || "", true),
      remove
    );
    return row;
  }

  function renumberItemExpansionRows() {
    if (!itemExpansionRows || !itemExpansionStatus || !itemExpansionAddRow) {
      return;
    }
    const rows = Array.from(itemExpansionRows.querySelectorAll(".item-expansion-row"));
    let tmIndex = 0;
    rows.forEach((row, index) => {
      const rowLabel = row.querySelector(".item-expansion-row-label");
      if (rowLabel) {
        const tmInput = row.querySelector(`[data-item-expansion-field="isTm"]`);
        if (tmInput && tmInput.checked) {
          rowLabel.textContent = `ID ${hex(0x1d4 + index)} / TM${93 + tmIndex}`;
          tmIndex += 1;
        } else {
          rowLabel.textContent = `ID ${hex(0x1d4 + index)}`;
        }
      }
      const remove = row.querySelector(".item-expansion-remove");
      if (remove) {
        remove.setAttribute("aria-label", `Remove expanded item ${hex(0x1d4 + index)} row`);
      }
    });

    itemExpansionAddRow.disabled = rows.length >= 128;
    const configured = expandedItemEntries().length;
    itemExpansionStatus.classList.remove("ready", "missing");
    if (rows.length >= 128) {
      itemExpansionStatus.classList.add("ready");
      itemExpansionStatus.textContent = "128 expanded item rows configured.";
    } else if (configured) {
      itemExpansionStatus.textContent = `${configured} expanded item row${
        configured === 1 ? "" : "s"
      } configured, ${tmIndex} marked as TM${tmIndex === 1 ? "" : "s"}.`;
    } else {
      itemExpansionStatus.classList.add("missing");
      itemExpansionStatus.textContent = "Add at least one item row.";
    }
  }

  function addItemExpansionRow(values = {}) {
    if (!itemExpansionRows) {
      return;
    }
    if (itemExpansionRows.querySelectorAll(".item-expansion-row").length >= 128) {
      return;
    }
    itemExpansionRows.append(createItemExpansionRow(values));
    renumberItemExpansionRows();
  }

  function expandedItemEntries() {
    if (!itemExpansionRows) {
      return [];
    }
    return Array.from(itemExpansionRows.querySelectorAll(".item-expansion-row"))
      .map((row) => {
        const field = (name) => {
          const input = row.querySelector(`[data-item-expansion-field="${name}"]`);
          return input ? input.value.trim() : "";
        };
        return {
          cloneFrom: field("cloneFrom"),
          iconFrom: field("iconFrom"),
          name: field("name"),
          isTm: Boolean(row.querySelector(`[data-item-expansion-field="isTm"]`)?.checked),
          move: field("move"),
          description: field("description"),
        };
      })
      .filter((row) => row.cloneFrom || row.iconFrom || row.name || row.description || row.isTm);
  }

  function renderExtraTmMoveOptions(bytes) {
    if (!extraTmMoveOptions) {
      return;
    }
    extraTmMoveOptions.textContent = "";
    if (!bytes || typeof readMoveNames !== "function") {
      return;
    }
    try {
      for (const move of readMoveNames(bytes)) {
        if (!move || move.id < 1 || !move.name) {
          continue;
        }
        const option = document.createElement("option");
        option.value = move.name;
        option.label = `#${move.id}`;
        extraTmMoveOptions.append(option);
      }
    } catch (error) {
      extraTmMoveOptions.textContent = "";
    }
  }

  function normalizeLookupName(name) {
    return String(name || "")
      .trim()
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]/g, "");
  }

  function speciesLabel(id) {
    const entry = speciesNames[id];
    return entry && entry.name ? `${entry.name} (#${id})` : `#${id}`;
  }

  function renderExtraTmSpeciesOptions(bytes) {
    speciesNames = [];
    personalEntryCount = 0;
    if (extraTmSpeciesOptions) {
      extraTmSpeciesOptions.textContent = "";
    }
    if (!bytes || typeof readSpeciesNames !== "function") {
      return;
    }
    try {
      speciesNames = readSpeciesNames(bytes);
      personalEntryCount = speciesNames.length;
      if (!extraTmSpeciesOptions) {
        return;
      }
      for (const species of speciesNames) {
        if (!species || species.id < 1 || !species.name) {
          continue;
        }
        const option = document.createElement("option");
        option.value = species.name;
        option.label = `#${species.id}`;
        extraTmSpeciesOptions.append(option);
      }
    } catch (error) {
      speciesNames = [];
      personalEntryCount = 0;
      if (extraTmSpeciesOptions) {
        extraTmSpeciesOptions.textContent = "";
      }
    }
  }

  function parseSpeciesToken(token) {
    const text = String(token || "").trim();
    if (!text) {
      return null;
    }
    const numeric = /^0x[0-9a-f]+$/i.test(text)
      ? Number.parseInt(text.slice(2), 16)
      : /^[0-9]+$/.test(text)
        ? Number.parseInt(text, 10)
        : null;
    let id = numeric;
    if (id === null) {
      const wanted = normalizeLookupName(text);
      const found = speciesNames.find((species) => normalizeLookupName(species.name) === wanted);
      id = found ? found.id : null;
    }
    const maxEntry = personalEntryCount || speciesNames.length;
    if (!Number.isInteger(id) || id < 1 || (maxEntry && id >= maxEntry)) {
      throw new Error(`Could not find "${text}" as a valid Pokemon name or personal entry ID.`);
    }
    return id;
  }

  function parseSpeciesTokens(text) {
    return String(text || "")
      .split(/[,\n;]/)
      .map((token) => token.trim())
      .filter(Boolean)
      .map(parseSpeciesToken);
  }

  function rowCompatibility(row) {
    try {
      const parsed = JSON.parse(row.dataset.compatiblePokemon || "[]");
      return Array.isArray(parsed)
        ? parsed.filter((id) => Number.isInteger(id) && id > 0)
        : [];
    } catch (error) {
      return [];
    }
  }

  function compatibilitySummary(ids) {
    if (!ids.length) {
      return "No Pokemon";
    }
    if (ids.length === 1) {
      return speciesLabel(ids[0]);
    }
    return `${ids.length} Pokemon`;
  }

  function updateCompatibilitySummary(row) {
    const summary = row.querySelector(".extra-tm-compat-summary");
    if (summary) {
      summary.textContent = `Compatible: ${compatibilitySummary(rowCompatibility(row))}`;
    }
  }

  function setRowCompatibility(row, ids) {
    const unique = Array.from(new Set(ids))
      .filter((id) => Number.isInteger(id) && id > 0)
      .sort((a, b) => a - b);
    row.dataset.compatiblePokemon = JSON.stringify(unique);
    updateCompatibilitySummary(row);
  }

  function renderCompatibilityList() {
    if (!extraTmCompatList || !activeCompatRow) {
      return;
    }
    extraTmCompatList.textContent = "";
    const ids = rowCompatibility(activeCompatRow);
    for (const id of ids) {
      const chip = document.createElement("span");
      chip.className = "compat-chip";
      chip.textContent = speciesLabel(id);
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "×";
      remove.setAttribute("aria-label", `Remove ${speciesLabel(id)}`);
      remove.addEventListener("click", () => {
        setRowCompatibility(
          activeCompatRow,
          rowCompatibility(activeCompatRow).filter((entry) => entry !== id)
        );
        renderCompatibilityList();
        clearDownload();
      });
      chip.append(remove);
      extraTmCompatList.append(chip);
    }
    if (extraTmCompatStatus) {
      extraTmCompatStatus.textContent = ids.length
        ? `${ids.length} compatible Pokemon selected.`
        : "No compatible Pokemon selected.";
    }
  }

  function openExtraTmCompatibility(row) {
    activeCompatRow = row;
    if (extraTmCompatTitle) {
      const label = row.querySelector(".extra-tm-row-label");
      extraTmCompatTitle.textContent = label ? `${label.textContent} compatibility` : "TM compatibility";
    }
    if (extraTmCompatInput) {
      extraTmCompatInput.value = "";
    }
    renderCompatibilityList();
    if (typeof extraTmCompatModal.showModal === "function") {
      extraTmCompatModal.showModal();
    } else {
      extraTmCompatModal.setAttribute("open", "");
    }
    if (extraTmCompatInput) {
      extraTmCompatInput.focus();
    }
  }

  function closeExtraTmCompatibility() {
    activeCompatRow = null;
    if (typeof extraTmCompatModal.close === "function") {
      extraTmCompatModal.close();
    } else {
      extraTmCompatModal.removeAttribute("open");
    }
  }

  function addCompatibilityInput() {
    if (!activeCompatRow || !extraTmCompatInput || !extraTmCompatStatus) {
      return;
    }
    try {
      const ids = parseSpeciesTokens(extraTmCompatInput.value);
      setRowCompatibility(activeCompatRow, [...rowCompatibility(activeCompatRow), ...ids]);
      extraTmCompatInput.value = "";
      extraTmCompatStatus.textContent = ids.length ? `Added ${ids.length} Pokemon.` : "Enter a Pokemon name or ID.";
      renderCompatibilityList();
      clearDownload();
    } catch (error) {
      extraTmCompatStatus.textContent = error.message;
    }
  }

  function activeExtraTmMoveToken() {
    if (!activeCompatRow) {
      return "";
    }
    const input = activeCompatRow.querySelector("[data-extra-tm-field='move']");
    return input ? input.value.trim() : "";
  }

  function requireLoadedRomForCompatAction() {
    if (!loadedBytes) {
      throw new Error("Load a ROM before using compatibility helpers.");
    }
  }

  function addCompatibilityIds(ids, message) {
    if (!activeCompatRow || !extraTmCompatStatus) {
      return;
    }
    setRowCompatibility(activeCompatRow, [...rowCompatibility(activeCompatRow), ...ids]);
    renderCompatibilityList();
    extraTmCompatStatus.textContent = message;
    clearDownload();
  }

  function addLevelUpLearners() {
    if (!activeCompatRow || !extraTmCompatStatus) {
      return;
    }
    try {
      requireLoadedRomForCompatAction();
      const moveToken = activeExtraTmMoveToken();
      const result = pokemonWithLevelUpMove(loadedBytes, moveToken);
      addCompatibilityIds(
        result.compatiblePokemon,
        result.compatiblePokemon.length
          ? `Added ${result.compatiblePokemon.length} Pokemon that learn this move by level-up.`
          : "No Pokemon learn this move by level-up in the loaded ROM."
      );
    } catch (error) {
      extraTmCompatStatus.textContent = error.message;
    }
  }

  function addCompatibilityFamilyInput() {
    if (!activeCompatRow || !extraTmCompatInput || !extraTmCompatStatus) {
      return;
    }
    try {
      requireLoadedRomForCompatAction();
      const tokens = String(extraTmCompatInput.value || "")
        .split(/[,\n;]/)
        .map((token) => token.trim())
        .filter(Boolean);
      if (!tokens.length) {
        extraTmCompatStatus.textContent = "Enter a Pokemon name or ID first.";
        return;
      }
      const ids = [];
      for (const token of tokens) {
        const result = pokemonFamilyForSpecies(loadedBytes, token);
        ids.push(...result.compatiblePokemon);
      }
      addCompatibilityIds(ids, `Added ${Array.from(new Set(ids)).length} Pokemon from evolution famil${tokens.length === 1 ? "y" : "ies"}.`);
      extraTmCompatInput.value = "";
    } catch (error) {
      extraTmCompatStatus.textContent = error.message;
    }
  }

  function copyCompatibilityFromTmInput() {
    if (!activeCompatRow || !extraTmCompatCopyInput || !extraTmCompatStatus) {
      return;
    }
    try {
      requireLoadedRomForCompatAction();
      const token = extraTmCompatCopyInput.value.trim();
      if (!token) {
        extraTmCompatStatus.textContent = "Enter an existing TM/HM move name or ID first.";
        return;
      }
      const result = vanillaTmCompatibilityForMove(loadedBytes, token);
      setRowCompatibility(activeCompatRow, result.compatiblePokemon);
      renderCompatibilityList();
      const source = result.isHm ? `HM${result.tmNumber}` : `TM${result.tmNumber}`;
      extraTmCompatStatus.textContent = `Copied ${result.compatiblePokemon.length} compatible Pokemon from ${source}.`;
      clearDownload();
    } catch (error) {
      extraTmCompatStatus.textContent = error.message;
    }
  }

  function createExtraTmRow(values = {}, index = 0) {
    const row = document.createElement("div");
    row.className = "extra-tm-row";
    setRowCompatibility(row, Array.isArray(values.compatiblePokemon) ? values.compatiblePokemon : []);

    const heading = document.createElement("div");
    heading.className = "extra-tm-row-heading";
    const rowLabel = document.createElement("div");
    rowLabel.className = "extra-tm-row-label";
    const compatButton = document.createElement("button");
    compatButton.className = "secondary-button extra-tm-compat-button";
    compatButton.type = "button";
    compatButton.textContent = "Compatibility";
    compatButton.addEventListener("click", () => {
      openExtraTmCompatibility(row);
    });
    heading.append(rowLabel, compatButton);

    const field = document.createElement("label");
    field.className = "extra-tm-field";

    const span = document.createElement("span");
    span.textContent = "Move";

    const input = document.createElement("input");
    input.type = "text";
    input.value = values.move || values.moveName || "Karate Chop";
    input.setAttribute("list", "extraTmMoveOptions");
    input.autocomplete = "off";
    input.spellcheck = false;
    input.dataset.extraTmField = "move";
    input.placeholder = "Karate Chop or 0x2";

    field.append(span, input);
    const summary = document.createElement("div");
    summary.className = "extra-tm-compat-summary";
    row.append(heading, field, summary);
    updateCompatibilitySummary(row);
    return row;
  }

  function renderExtraTmRows(seedRows = null) {
    if (!extraTmRows || !extraTmStatus) {
      return;
    }
    const previous = Array.isArray(seedRows) ? seedRows : extraTmEntries();
    extraTmRows.textContent = "";
    extraTmStatus.classList.remove("ready", "missing");

    for (let index = 0; index < EXTRA_TM_COUNT; index += 1) {
      extraTmRows.append(createExtraTmRow(previous[index] || {}, index));
    }

    const manualCount = expandedItemEntries().length;
    const rows = Array.from(extraTmRows.querySelectorAll(".extra-tm-row"));
    rows.forEach((row, index) => {
      const rowLabel = row.querySelector(".extra-tm-row-label");
      if (rowLabel) {
        rowLabel.textContent = `TM${93 + index} / ID ${hex(0x1d4 + manualCount + index)}`;
      }
    });

    extraTmStatus.classList.add("ready");
    extraTmStatus.textContent = `${EXTRA_TM_COUNT} Extra TMs configured.`;
  }

  function updateExtraTmConfigVisibility() {
    if (!extraTmConfig || !extraTmsInput) {
      return;
    }
    extraTmConfig.hidden = !extraTmsInput.checked;
  }

  function loadExtraTmState(bytes) {
    if (!bytes || typeof detectExtraTmState !== "function") {
      return;
    }
    try {
      const state = detectExtraTmState(bytes);
      personalEntryCount = state.personalCount || personalEntryCount;
      if (state.installed) {
        renderExtraTmRows(state.rows);
        extraTmStatus.classList.add("ready");
        extraTmStatus.textContent = `Loaded ${state.rowCount || EXTRA_TM_COUNT} Extra TM row${
          (state.rowCount || EXTRA_TM_COUNT) === 1 ? "" : "s"
        } from the ROM.`;
      } else {
        renderExtraTmRows(
          Array.from({ length: EXTRA_TM_COUNT }, () => ({
            move: "Karate Chop",
            compatiblePokemon: [],
          }))
        );
      }
    } catch (error) {
      extraTmStatus.classList.add("missing");
      extraTmStatus.textContent = "Could not read existing Extra TMs compatibility data.";
    }
  }

  function extraTmEntries() {
    if (!extraTmRows) {
      return [];
    }
    return Array.from(extraTmRows.querySelectorAll(".extra-tm-row"))
      .map((row) => {
        const input = row.querySelector("[data-extra-tm-field='move']");
        return {
          move: input ? input.value.trim() : "",
          compatiblePokemon: rowCompatibility(row),
        };
      });
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
      universalInfatuationAi: universalInfatuationAiInput.checked,
      customOverworldSprites: customOverworldSpriteEntries(),
      expandedItems: expandedItemEntries(),
      extraTms: extraTmEntries(),
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
    if (id === "universalInfatuation" && options && options.universalInfatuationAi) {
      return `${PATCHES[id]} (with trainer AI support)`;
    }
    if (id === "customOverworldSprites") {
      const count = Array.isArray(options && options.customOverworldSprites)
        ? options.customOverworldSprites.length
        : 0;
      return `${PATCHES[id]} (${count} row${count === 1 ? "" : "s"})`;
    }
    if (id === "itemExpansion") {
      const count = Array.isArray(options && options.expandedItems) ? options.expandedItems.length : 0;
      return `${PATCHES[id]} (${count} row${count === 1 ? "" : "s"})`;
    }
    if (id === "extraTMs") {
      return `${PATCHES[id]} (${EXTRA_TM_COUNT} rows)`;
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

  function selectPatchTab(tabId) {
    patchTabButtons.forEach((button) => {
      const active = button.dataset.patchTab === tabId;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
      button.tabIndex = active ? 0 : -1;
    });
    patchTabPanels.forEach((panel) => {
      panel.hidden = panel.dataset.patchPanel !== tabId;
    });
  }

  patchTabButtons.forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      selectPatchTab(button.dataset.patchTab);
    });
    button.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
        return;
      }
      event.preventDefault();
      const direction = event.key === "ArrowRight" ? 1 : -1;
      const index = patchTabButtons.indexOf(button);
      const next = patchTabButtons[(index + direction + patchTabButtons.length) % patchTabButtons.length];
      next.focus();
      selectPatchTab(next.dataset.patchTab);
    });
  });
  selectPatchTab("infra");

  renderNatureButtons();
  addItemExpansionRow();
  renumberItemExpansionRows();
  renderExtraTmRows();
  updateExtraTmConfigVisibility();
  addPatchInfoButtons();
  updateTextSpeedValue();
  updateShinyOddsValue();
  updateCritOddsValue();
  updateIvRangeValue();
  updateNatureCount();
  updateArm9ExpansionStatus();
  renderCustomOverworldSpriteRows();
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
  universalInfatuationAiInput.addEventListener("change", () => {
    if (universalInfatuationAiInput.checked) {
      universalInfatuationInput.checked = true;
    }
    clearDownload();
  });
  universalInfatuationInput.addEventListener("change", () => {
    if (!universalInfatuationInput.checked) {
      universalInfatuationAiInput.checked = false;
    }
    clearDownload();
  });
  patchInfoClose.addEventListener("click", closePatchInfo);
  patchInfoModal.addEventListener("click", (event) => {
    if (event.target === patchInfoModal) {
      closePatchInfo();
    }
  });
  extraTmCompatClose.addEventListener("click", closeExtraTmCompatibility);
  extraTmCompatModal.addEventListener("click", (event) => {
    if (event.target === extraTmCompatModal) {
      closeExtraTmCompatibility();
    }
  });
  extraTmCompatAdd.addEventListener("click", addCompatibilityInput);
  extraTmCompatAddFamily.addEventListener("click", addCompatibilityFamilyInput);
  extraTmCompatAddLearnset.addEventListener("click", addLevelUpLearners);
  extraTmCompatCopy.addEventListener("click", copyCompatibilityFromTmInput);
  extraTmCompatClear.addEventListener("click", () => {
    if (!activeCompatRow) {
      return;
    }
    setRowCompatibility(activeCompatRow, []);
    renderCompatibilityList();
    clearDownload();
  });
  extraTmCompatInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addCompatibilityInput();
    }
  });
  extraTmCompatCopyInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      copyCompatibilityFromTmInput();
    }
  });
  patchGrid.addEventListener("change", (event) => {
    if (event.target === extraTmsInput) {
      updateExtraTmConfigVisibility();
    }
    clearDownload();
  });
  forceInput.addEventListener("change", clearDownload);
  outputNameInput.addEventListener("input", clearDownload);
  if (customOverworldSpriteRows) {
    customOverworldSpriteRows.addEventListener("input", clearDownload);
  }
  if (itemExpansionRows) {
    itemExpansionRows.addEventListener("input", () => {
      renumberItemExpansionRows();
      renderExtraTmRows();
      clearDownload();
    });
  }
  if (itemExpansionAddRow) {
    itemExpansionAddRow.addEventListener("click", () => {
      addItemExpansionRow();
      renderExtraTmRows();
      clearDownload();
    });
  }
  if (extraTmRows) {
    extraTmRows.addEventListener("input", () => {
      clearDownload();
    });
  }
  if (customOverworldSpriteRefresh) {
    customOverworldSpriteRefresh.addEventListener("click", () => {
      clearDownload();
      renderCustomOverworldSpriteRows(loadedBytes);
    });
  }

  romInput.addEventListener("change", async () => {
    clearDownload();
    loadedFile = romInput.files && romInput.files[0] ? romInput.files[0] : null;
    loadedBytes = null;

    if (!loadedFile) {
      applyButton.disabled = true;
      romStatus.textContent = `No ROM loaded · ${APP_VERSION}`;
      romStatus.classList.remove("ready");
      updateArm9ExpansionStatus();
      renderCustomOverworldSpriteRows();
      renderExtraTmMoveOptions();
      renderExtraTmSpeciesOptions();
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
      renderCustomOverworldSpriteRows(loadedBytes);
      renderExtraTmMoveOptions(loadedBytes);
      renderExtraTmSpeciesOptions(loadedBytes);
      loadExtraTmState(loadedBytes);
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
      renderCustomOverworldSpriteRows();
      renderExtraTmMoveOptions();
      renderExtraTmSpeciesOptions();
      setLog(`Error: ${error.message}`);
    }
  });

  applyButton.addEventListener("click", async () => {
    clearDownload();
    if (!loadedBytes || !loadedFile) {
      setLog("Choose a ROM first.");
      return;
    }

    const ids = selectedPatches();
    applyButton.disabled = true;
    try {
      const options = patchOptions();
      const result = await applySelectedPatches(loadedBytes, ids, options);
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
    } finally {
      applyButton.disabled = false;
    }
  });
}

  return initUi;
});
