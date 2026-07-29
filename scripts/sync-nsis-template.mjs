import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nsisDirectory = path.join(repositoryRoot, "src-tauri", "nsis");
const sourceManifestPath = path.join(nsisDirectory, "installer-template-source.json");
const upstreamTemplatePath = path.join(nsisDirectory, "installer.nsi.upstream");
const customTemplatePath = path.join(nsisDirectory, "installer.nsi");
const packageJsonPath = path.join(repositoryRoot, "package.json");

const generatedHeader = `; This file is generated from installer.nsi.upstream.
; Project behavior belongs in installer-hooks.nsh. Run pnpm nsis:template:sync after updating Tauri.

`;

const patches = [
  {
    name: "installer language initialization hook",
    upstream: `  !if "\${DISPLAYLANGUAGESELECTOR}" == "true"
    !insertmacro MUI_LANGDLL_DISPLAY
  !endif`,
    custom: `  !if "\${DISPLAYLANGUAGESELECTOR}" == "true"
    ; DesktopGo extension: passive updates reuse the stored language without opening a dialog.
    !ifmacrodef NSIS_HOOK_SELECT_INSTALLER_LANGUAGE
      !insertmacro NSIS_HOOK_SELECT_INSTALLER_LANGUAGE
    !else
      !insertmacro MUI_LANGDLL_DISPLAY
    !endif
  !endif`,
  },
  {
    name: "custom installer pages hook",
    upstream: `; 6. Start menu shortcut page
Var AppStartMenuFolder`,
    custom: `; DesktopGo extension: project pages are declared by installer-hooks.nsh at this position.
!ifmacrodef NSIS_HOOK_INSTALLER_PAGES
  !insertmacro NSIS_HOOK_INSTALLER_PAGES
!endif

; 6. Start menu shortcut page
Var AppStartMenuFolder`,
  },
];

function normalizeLineEndings(value) {
  return value.replace(/\r\n/g, "\n");
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function replaceExactlyOnce(template, patch) {
  const firstIndex = template.indexOf(patch.upstream);
  const lastIndex = template.lastIndexOf(patch.upstream);
  if (firstIndex === -1 || firstIndex !== lastIndex) {
    throw new Error(
      `Cannot apply ${patch.name}: expected its upstream anchor exactly once. ` +
        "Review the new Tauri template before regenerating.",
    );
  }
  return template.replace(patch.upstream, patch.custom);
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function buildExpectedTemplate() {
  const [sourceManifest, packageJson, upstreamFile] = await Promise.all([
    readJson(sourceManifestPath),
    readJson(packageJsonPath),
    readFile(upstreamTemplatePath, "utf8"),
  ]);
  const upstreamTemplate = normalizeLineEndings(upstreamFile);
  const configuredCliVersion = packageJson.devDependencies?.["@tauri-apps/cli"];

  if (configuredCliVersion !== sourceManifest.tauriCliVersion) {
    throw new Error(
      `Tauri CLI ${configuredCliVersion ?? "is not configured"} does not match the NSIS template source ` +
        `${sourceManifest.tauriCliVersion}. Download the matching upstream template first.`,
    );
  }
  if (sha256(upstreamTemplate) !== sourceManifest.sha256) {
    throw new Error(
      "installer.nsi.upstream does not match installer-template-source.json. " +
        "Verify the source URL and update its SHA-256 intentionally.",
    );
  }

  return patches.reduce(replaceExactlyOnce, generatedHeader + upstreamTemplate);
}

async function main() {
  const expectedTemplate = await buildExpectedTemplate();
  const writeMode = process.argv.includes("--write");
  if (writeMode) {
    await writeFile(customTemplatePath, expectedTemplate, "utf8");
    console.log("Updated src-tauri/nsis/installer.nsi from the verified upstream template.");
    return;
  }

  const currentTemplate = normalizeLineEndings(await readFile(customTemplatePath, "utf8"));
  if (currentTemplate !== expectedTemplate) {
    throw new Error(
      "src-tauri/nsis/installer.nsi is out of sync. Run pnpm nsis:template:sync and review the diff.",
    );
  }
  console.log("NSIS custom template matches its verified upstream source and allowed patches.");
}

await main();
