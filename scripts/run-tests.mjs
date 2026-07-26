import { readdir } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const testDirectory = fileURLToPath(new URL('../test/', import.meta.url))
const testFilePattern = /\.(?:test|spec)\.[cm]?[jt]sx?$/

async function collectTestFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nestedFiles = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directory, entry.name)

    if (entry.isDirectory()) {
      return collectTestFiles(entryPath)
    }

    return entry.isFile() && testFilePattern.test(entry.name) ? [entryPath] : []
  }))

  return nestedFiles.flat()
}

const testFiles = (await collectTestFiles(testDirectory)).sort()

if (testFiles.length === 0) {
  throw new Error(`No test files found in ${testDirectory}`)
}

const result = spawnSync(process.execPath, ['--test', ...testFiles], {
  stdio: 'inherit',
})

if (result.error) {
  throw result.error
}

if (result.signal) {
  throw new Error(`Test runner exited after receiving ${result.signal}`)
}

process.exitCode = result.status ?? 1
