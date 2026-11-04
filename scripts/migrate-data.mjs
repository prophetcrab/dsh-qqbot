#!/usr/bin/env node
/**
 * One-time migration from the legacy flat data/ layout to
 * data/config, data/state and data/assets.
 *
 * Stop Koishi before using --database:
 *
 *   node scripts/migrate-data.mjs [projectDir] [--database]
 *
 * Default projectDir: ~/project/qq-bot
 */

import { homedir } from 'node:os'
import { join } from 'node:path'
import { migrateDataLayout } from '../host/platform/common/data-paths.js'

const args = process.argv.slice(2)
const includeDatabase = args.includes('--database')
const projectDir = args.find((arg) => !arg.startsWith('--')) ?? join(homedir(), 'project', 'qq-bot')
const result = await migrateDataLayout(projectDir, { includeDatabase })
console.log(`project: ${projectDir}`)
console.log(`moved: ${result.moved.length === 0 ? '(none)' : result.moved.join(', ')}`)
console.log(`skipped: ${result.skipped.length === 0 ? '(none)' : result.skipped.join(', ')}`)
console.log(`database: ${result.includedDatabase ? 'migrated; koishi.yml updated' : 'not moved (pass --database with Koishi stopped)'}`)
