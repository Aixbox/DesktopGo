import { readFileSync } from "node:fs";

const TYPES = [
  "feat",
  "fix",
  "refactor",
  "perf",
  "docs",
  "test",
  "build",
  "ci",
  "style",
  "chore",
  "revert",
];

const HEADER_PATTERN = new RegExp(
  `^(${TYPES.join("|")})(?:\\(([a-z0-9]+(?:-[a-z0-9]+)*)\\))?(!)?: (.+)$`,
  "u",
);
const CHINESE_PATTERN = /[\u3400-\u4dbf\u4e00-\u9fff]/u;
const TRAILING_PUNCTUATION_PATTERN = /[。.!！?？;；:：,，]$/u;
const VAGUE_SUBJECT_PATTERN = /^(?:更新代码|修改内容|修复问题|优化功能)$/u;
const FOOTER_PATTERN = /^(?:BREAKING CHANGE|[A-Za-z][A-Za-z0-9-]*): .+$/u;
const BULLET_PATTERN = /^- \S/u;
const BULLET_CONTINUATION_PATTERN = /^ {2}\S/u;
const CODE_FENCE_PATTERN = /^```/u;

function lengthOf(value) {
  return Array.from(value).length;
}

/**
 * The body must be a Markdown bullet list so reviewers can scan it. Blank
 * lines, footers, fenced code blocks, and indented continuations of a wrapped
 * bullet are the only exceptions.
 */
function validateBodyFormat(lines) {
  const errors = [];
  let insideCodeFence = false;

  for (let index = 2; index < lines.length; index += 1) {
    const line = lines[index];

    if (CODE_FENCE_PATTERN.test(line)) {
      insideCodeFence = !insideCodeFence;
      continue;
    }
    if (insideCodeFence || line === "") continue;
    if (FOOTER_PATTERN.test(line)) continue;
    if (BULLET_PATTERN.test(line)) continue;
    if (BULLET_CONTINUATION_PATTERN.test(line)) continue;

    errors.push(
      `Line ${index + 1} must start with "- " (bullet), two spaces (wrapped bullet), or be a footer.`,
    );
  }

  return errors;
}

function readMessage(args) {
  if (args[0] === "--file") {
    if (!args[1] || args.length !== 2) {
      throw new Error("Usage: validate-commit-message.mjs --file <path>");
    }

    return readFileSync(args[1], "utf8");
  }

  if (args.length !== 1) {
    throw new Error('Usage: validate-commit-message.mjs "<message>"');
  }

  return args[0];
}

function validate(message) {
  const normalized = message.replace(/\r\n?/gu, "\n").replace(/\n+$/u, "");
  const lines = normalized.split("\n");
  const header = lines[0] ?? "";
  const errors = [];

  const match = HEADER_PATTERN.exec(header);
  if (!match) {
    errors.push(
      "Header must match <type>[(<scope>)][!]: <Chinese subject> with an allowed lowercase type and kebab-case scope.",
    );
  }

  if (lengthOf(header) > 72) {
    errors.push(`Header is ${lengthOf(header)} characters; maximum is 72.`);
  }

  if (match) {
    const [, , , breakingMarker, subject] = match;

    if (!CHINESE_PATTERN.test(subject)) {
      errors.push("Subject must contain a Chinese description.");
    }
    if (TRAILING_PUNCTUATION_PATTERN.test(subject)) {
      errors.push("Subject must not end with punctuation.");
    }
    if (VAGUE_SUBJECT_PATTERN.test(subject)) {
      errors.push("Subject is too vague; state the concrete behavior or change.");
    }

    const hasBreakingFooter = lines.some((line) => /^BREAKING CHANGE: .+/u.test(line));
    if (breakingMarker && !hasBreakingFooter) {
      errors.push("A ! marker requires a non-empty BREAKING CHANGE: footer.");
    }
    if (!breakingMarker && hasBreakingFooter) {
      errors.push("A BREAKING CHANGE: footer requires ! in the header.");
    }
  }

  if (lines.length > 1 && lines[1] !== "") {
    errors.push("Leave one blank line between the header and body or footers.");
  }

  lines.forEach((line, index) => {
    if (index > 0 && lengthOf(line) > 100) {
      errors.push(`Line ${index + 1} is ${lengthOf(line)} characters; maximum is 100.`);
    }
    if (/[ \t]+$/u.test(line)) {
      errors.push(`Line ${index + 1} has trailing whitespace.`);
    }
  });

  errors.push(...validateBodyFormat(lines));

  return { errors, header };
}

try {
  const message = readMessage(process.argv.slice(2));
  const { errors, header } = validate(message);

  if (errors.length > 0) {
    console.error("Invalid commit message:");
    errors.forEach((error) => console.error(`- ${error}`));
    process.exitCode = 1;
  } else {
    console.log(`Valid commit message: ${header}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
}
