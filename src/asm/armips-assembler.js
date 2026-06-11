(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory(require("../../vendor/armips/armips.js"));
  } else {
    root.PlatinumPatcherArmipsAssembler = factory(root.createArmipsModule);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (createArmipsModule) {
  "use strict";

  if (typeof createArmipsModule !== "function") {
    throw new Error("armips runtime failed to load.");
  }

  let modulePromise = null;
  let runId = 0;
  let activeStdout = null;
  let activeStderr = null;

  function ensureDirectory(fs, path) {
    const parts = path.split("/").filter(Boolean);
    let current = "";
    for (const part of parts) {
      current += `/${part}`;
      try {
        fs.mkdir(current);
      } catch (error) {
        try {
          fs.stat(current);
        } catch (_) {
          throw error;
        }
      }
    }
  }

  async function armipsModule() {
    if (!modulePromise) {
      modulePromise = createArmipsModule({
        noInitialRun: true,
        noExitRuntime: true,
        print(line) {
          if (activeStdout) {
            activeStdout.push(String(line));
          }
        },
        printErr(line) {
          if (activeStderr) {
            activeStderr.push(String(line));
          }
        },
      });
    }
    return modulePromise;
  }

  function writeFiles(fs, baseDir, files) {
    for (const [name, contents] of Object.entries(files || {})) {
      const normalized = name.replace(/\\/g, "/").replace(/^\/+/, "");
      const slash = normalized.lastIndexOf("/");
      if (slash !== -1) {
        ensureDirectory(fs, `${baseDir}/${normalized.slice(0, slash)}`);
      }
      fs.writeFile(`${baseDir}/${normalized}`, contents);
    }
  }

  function buildArgs(mainName, defines) {
    const args = [];
    for (const [name, value] of Object.entries(defines || {})) {
      args.push("-equ", name, String(value));
    }
    args.push(mainName);
    return args;
  }

  async function assembleArmips({ source, files = {}, defines = {}, outputName = "output.bin" }) {
    if (typeof source !== "string" || !source.trim()) {
      throw new Error("armips source is empty.");
    }

    const mod = await armipsModule();
    const fs = mod.FS;
    ensureDirectory(fs, "/work");

    const runDir = `/work/run${runId++}`;
    fs.mkdir(runDir);
    const previousDir = fs.cwd();
    const output = outputName.replace(/\\/g, "/").replace(/^\/+/, "");
    const stdout = [];
    const stderr = [];

    try {
      fs.chdir(runDir);
      fs.writeFile("main.asm", source);
      writeFiles(fs, runDir, files);

      let status = 0;
      activeStdout = stdout;
      activeStderr = stderr;
      try {
        status = mod.callMain(buildArgs("main.asm", defines));
      } catch (error) {
        status = typeof error.status === "number" ? error.status : 1;
        if (!stdout.length && !stderr.length) {
          stderr.push(error && error.message ? error.message : String(error));
        }
      } finally {
        activeStdout = null;
        activeStderr = null;
      }

      if (status !== 0) {
        const details = stdout.concat(stderr).filter(Boolean).join("\n");
        throw new Error(details || `armips exited with status ${status}.`);
      }

      return new Uint8Array(fs.readFile(`${runDir}/${output}`));
    } finally {
      fs.chdir(previousDir);
    }
  }

  return { assembleArmips };
});
