// 发布转正脚本：测试构建转正式发布（人工把 draft 的临时 tag 改成正式 tag）后，
// 必须跑一次本脚本，把 release 上 latest.json 里的下载 URL 从旧临时 tag 改写为正式 tag。
// 否则应用内"下载并安装更新"会拿到 404（latest.json 本身能被检查到，但文件下载不到）。
//
// 用法：node scripts/finalize-release.mjs <正式tag>   例：node scripts/finalize-release.mjs v1.0.6
//
// 依赖 gh CLI（已登录且有该仓库写权限）。流程：
//   1. 读取 release 的 latest.json asset 原文（走 GitHub API，不经 CDN 缓存）
//   2. 把所有 releases/download/<旧tag>/ 重写为 releases/download/<正式tag>/
//   3. 删除旧 asset 并上传改写后的 latest.json
//   4. 直读 API 校验改写生效；对每个下载 URL 做 HEAD 检查（CDN 缓存未刷新时给警告而非失败）
import { execFileSync } from "node:child_process";
import {
  closeSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
  openSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

const repo = "Aixbox/DesktopGo";
const tag = process.argv[2];

if (!tag || !/^v\d/.test(tag)) {
  console.error("Usage: node scripts/finalize-release.mjs <release-tag>  (e.g. v1.0.6)");
  process.exit(1);
}

function gh(args, options = {}) {
  return execFileSync("gh", args, { encoding: "utf8", ...options });
}

function downloadAsset(assetId, targetPath) {
  const fd = openSync(targetPath, "w");
  try {
    gh(
      ["api", `repos/${repo}/releases/assets/${assetId}`, "-H", "Accept: application/octet-stream"],
      { stdio: ["ignore", fd, "inherit"] }
    );
  } finally {
    closeSync(fd);
  }
}

const workDir = mkdtempSync(path.join(os.tmpdir(), "desktopgo-release-"));
try {
  const release = JSON.parse(gh(["api", `repos/${repo}/releases/tags/${tag}`]));
  const asset = (release.assets ?? []).find(entry => entry.name === "latest.json");
  if (!asset) {
    throw new Error(`Release ${tag} has no latest.json asset.`);
  }

  const rawPath = path.join(workDir, "latest.json");
  downloadAsset(asset.id, rawPath);
  let content = readFileSync(rawPath, "utf8");

  const referencedTags = new Set(
    [...content.matchAll(/releases\/download\/([^/]+)\//g)].map(match => match[1])
  );
  const staleTags = [...referencedTags].filter(referenced => referenced !== tag);

  if (staleTags.length === 0) {
    console.log(`latest.json URLs already point at ${tag}. Nothing to do.`);
    process.exit(0);
  }

  for (const staleTag of staleTags) {
    content = content.replaceAll(`releases/download/${staleTag}/`, `releases/download/${tag}/`);
  }

  const fixedPath = path.join(workDir, "latest-fixed.json");
  writeFileSync(fixedPath, content, "utf8");

  gh(["api", "--method", "DELETE", `repos/${repo}/releases/assets/${asset.id}`]);
  gh([
    "api",
    "--method",
    "POST",
    "-H",
    "Content-Type: application/octet-stream",
    "--input",
    fixedPath,
    `https://uploads.github.com/repos/${repo}/releases/${release.id}/assets?name=latest.json`,
  ]);
  console.log(`Replaced latest.json on ${tag}; rewritten tags: ${staleTags.join(", ")}`);

  // 直读 API（不经 CDN）确认改写已生效。
  const freshAssetId = gh([
    "api",
    `repos/${repo}/releases/tags/${tag}`,
    "--jq",
    '.assets[] | select(.name=="latest.json") | .id',
  ]).trim();
  const verifyPath = path.join(workDir, "latest-after.json");
  downloadAsset(freshAssetId, verifyPath);
  const afterContent = readFileSync(verifyPath, "utf8");
  const remaining = new Set(
    [...afterContent.matchAll(/releases\/download\/([^/]+)\//g)].map(match => match[1])
  );
  if ([...remaining].some(referenced => referenced !== tag)) {
    throw new Error(`Verification failed: URLs still reference ${[...remaining].join(", ")}`);
  }
  console.log("Verified: all download URLs now reference", tag);

  // 逐一 HEAD 检查下载 URL；CDN 缓存未刷新时会暂时 404，给警告不判失败。
  const urls = [...afterContent.matchAll(/"url":\s*"([^"]+)"/g)].map(match => match[1]);
  for (const url of new Set(urls)) {
    const ok = await fetch(url, { method: "HEAD", redirect: "follow" })
      .then(response => response.ok)
      .catch(() => false);
    console.log(`${ok ? "OK" : "WARN (CDN cache? re-check later)"} ${url}`);
  }
} finally {
  rmSync(workDir, { recursive: true, force: true });
}
