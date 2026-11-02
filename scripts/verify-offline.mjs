#!/usr/bin/env node
/**
 * Verify every archive referenced by `vendor/napcat/manifest.json` (size and
 * SHA-256). Exits non-zero on the first mismatch so a release build can gate on
 * `npm run offline:verify`.
 */

import { join } from 'node:path'
import { defaultVendorDir, readManifest, verifyArchive } from '../host/services/napcat/offline.js'

const vendorDir = defaultVendorDir()
const manifest = await readManifest(vendorDir)
const entries = [
  ['napcat.shell', join(vendorDir, manifest.napcat.shell.file), manifest.napcat.shell],
]

let failed = false
for (const [label, file, meta] of entries) {
  const result = await verifyArchive(file, meta)
  if (result.ok === true) {
    console.log(`ok    ${label}  ${file}  (${result.bytes} bytes)`)
  } else {
    failed = true
    console.error(`FAIL  ${label}  ${result.message}`)
  }
}
process.exit(failed ? 1 : 0)
