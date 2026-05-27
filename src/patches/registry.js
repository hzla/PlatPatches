(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    root.PlatinumPatcherRegistry = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function createPatchRegistry(entries) {
    const patches = new Map();
    for (const entry of entries) {
      if (!entry || typeof entry.id !== "string" || typeof entry.apply !== "function") {
        throw new Error("Patch registry entries need an id and apply function.");
      }
      if (patches.has(entry.id)) {
        throw new Error(`Duplicate patch id: ${entry.id}`);
      }
      patches.set(entry.id, entry.apply);
    }

    return {
      get(id) {
        return patches.get(id);
      },
      has(id) {
        return patches.has(id);
      },
      ids() {
        return Array.from(patches.keys());
      },
    };
  }

  return { createPatchRegistry };
});
