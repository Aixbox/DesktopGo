#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs'
import { extname, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const ROOTS = ['src', 'src-tauri/src']
const LIMITS = new Map([
  ['.js', 1000],
  ['.jsx', 1000],
  ['.ts', 1000],
  ['.tsx', 1000],
  ['.rs', 500],
])

function usage() {
  console.log(`Usage: node check-changed-files.mjs [--base <git-ref>] [--all]

Checks source-file line budgets. By default, compare working-tree changes with
HEAD. New files must stay within their limit. Existing oversized files may
shrink but must not grow.

Options:
  --base <git-ref>  Compare with another commit or branch
  --all             Audit every tracked and untracked source file
  --help            Show this help`)
}

function parseArgs(argv) {
  let base = 'HEAD'
  let all = false

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') {
      usage()
      process.exit(0)
    }
    if (arg === '--all') {
      all = true
      continue
    }
    if (arg === '--base') {
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) {
        throw new Error('--base requires a git ref')
      }
      base = value
      index += 1
      continue
    }
    throw new Error(`Unknown argument: ${arg}`)
  }

  return { all, base }
}

function runGit(args, cwd, allowFailure = false) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    windowsHide: true,
  })

  if (result.error) throw result.error
  if (result.status !== 0 && !allowFailure) {
    const detail = result.stderr.trim() || `git exited with status ${result.status}`
    throw new Error(detail)
  }
  return result
}

function splitNull(value) {
  return value.split('\0').filter(Boolean)
}

function normalizePath(value) {
  return value.replaceAll('\\', '/')
}

function isCandidate(path) {
  const normalized = normalizePath(path)
  const inRoot = ROOTS.some(root => normalized === root || normalized.startsWith(`${root}/`))
  return inRoot && LIMITS.has(extname(normalized).toLowerCase())
}

function countLines(text) {
  if (text.length === 0) return 0
  const newlines = text.match(/\n/g)?.length ?? 0
  return newlines + (text.endsWith('\n') ? 0 : 1)
}

function changedFiles(base, repoRoot) {
  const diff = runGit(
    ['diff', '--name-status', '-z', '--find-renames', base, '--', ...ROOTS],
    repoRoot
  )
  const fields = splitNull(diff.stdout)
  const changes = new Map()

  for (let index = 0; index < fields.length; ) {
    const status = fields[index]
    index += 1

    if (status.startsWith('R')) {
      const basePath = normalizePath(fields[index])
      const path = normalizePath(fields[index + 1])
      index += 2
      if (isCandidate(path)) changes.set(path, { basePath, path })
      continue
    }

    const path = normalizePath(fields[index])
    index += 1
    if (status !== 'D' && isCandidate(path)) {
      changes.set(path, { basePath: path, path })
    }
  }

  const untracked = runGit(
    ['ls-files', '--others', '--exclude-standard', '-z', '--', ...ROOTS],
    repoRoot
  )
  for (const rawPath of splitNull(untracked.stdout)) {
    const path = normalizePath(rawPath)
    if (isCandidate(path)) changes.set(path, { basePath: null, path })
  }

  return [...changes.values()].sort((left, right) => left.path.localeCompare(right.path))
}

function allFiles(repoRoot) {
  const tracked = runGit(['ls-files', '-z', '--', ...ROOTS], repoRoot)
  const untracked = runGit(
    ['ls-files', '--others', '--exclude-standard', '-z', '--', ...ROOTS],
    repoRoot
  )
  const paths = new Set([...splitNull(tracked.stdout), ...splitNull(untracked.stdout)])
  return [...paths]
    .map(normalizePath)
    .filter(isCandidate)
    .filter(path => existsSync(resolve(repoRoot, path)))
    .sort()
    .map(path => ({ basePath: null, path }))
}

function readBaseFile(base, path, repoRoot) {
  if (!path) return null
  const result = runGit(['show', `${base}:${path}`], repoRoot, true)
  return result.status === 0 ? result.stdout : null
}

function audit({ all, base }) {
  const rootResult = runGit(['rev-parse', '--show-toplevel'], process.cwd())
  const repoRoot = rootResult.stdout.trim()
  runGit(['rev-parse', '--verify', `${base}^{commit}`], repoRoot)

  const files = all ? allFiles(repoRoot) : changedFiles(base, repoRoot)
  const violations = []

  for (const file of files) {
    const limit = LIMITS.get(extname(file.path).toLowerCase())
    const currentText = readFileSync(resolve(repoRoot, file.path), 'utf8')
    const currentLines = countLines(currentText)

    if (all) {
      if (currentLines > limit) {
        violations.push(`${file.path}: ${currentLines} lines exceeds the ${limit}-line limit`)
      }
      continue
    }

    const baseText = readBaseFile(base, file.basePath, repoRoot)
    if (baseText === null) {
      if (currentLines > limit) {
        violations.push(`new ${file.path}: ${currentLines} lines exceeds the ${limit}-line limit`)
      }
      continue
    }

    const baseLines = countLines(baseText)
    if (baseLines <= limit && currentLines > limit) {
      violations.push(
        `${file.path}: grew from ${baseLines} to ${currentLines} lines and crossed the ${limit}-line limit`
      )
    } else if (baseLines > limit && currentLines > baseLines) {
      violations.push(
        `${file.path}: legacy oversized file grew from ${baseLines} to ${currentLines} lines`
      )
    }
  }

  if (violations.length > 0) {
    console.error('File budget violations:')
    for (const violation of violations) console.error(`- ${violation}`)
    process.exitCode = 1
    return
  }

  const scope = all ? 'repository source files' : `source changes against ${base}`
  console.log(`File budgets passed for ${files.length} file(s) in ${scope}.`)
}

try {
  audit(parseArgs(process.argv.slice(2)))
} catch (error) {
  console.error(`File budget check failed: ${error.message}`)
  process.exitCode = 2
}
