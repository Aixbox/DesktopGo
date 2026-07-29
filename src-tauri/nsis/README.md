# DesktopGo NSIS template maintenance

DesktopGo owns a custom Tauri NSIS template so interactive installs can always ask for a
language while passive updater installs keep the native progress window without opening that
dialog.

## File ownership

- `installer.nsi.upstream` is an unmodified copy of Tauri's upstream template. Its exact source,
  CLI version, and normalized SHA-256 are recorded in `installer-template-source.json`.
- `installer.nsi` is generated from the upstream copy. Do not edit it manually.
- `installer-hooks.nsh` owns DesktopGo-specific behavior. The generated template only exposes
  the language initialization and custom-page placement hooks used by this file.
- `scripts/sync-nsis-template.mjs` is the only place that describes allowed template changes.

`pnpm nsis:template:check` verifies the pinned CLI version, upstream hash, patch anchors, and
generated output. Every Tauri build runs this check through `beforeBuildCommand`.

## Updating Tauri

1. Pin the new `@tauri-apps/cli` version in `package.json` and update `pnpm-lock.yaml`.
2. Download that CLI tag's `crates/tauri-bundler/src/bundle/windows/nsis/installer.nsi` to
   `installer.nsi.upstream`.
3. Update `installer-template-source.json` with the matching tag URL, version, and normalized
   SHA-256.
4. Run `pnpm nsis:template:sync`. If an anchor changed, review the upstream `.onInit` and page
   ordering before updating the patch definitions.
5. Review the generated template diff, then run `pnpm nsis:template:check` and
   `pnpm build:installer`.
