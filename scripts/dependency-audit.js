#!/usr/bin/env node
/**
 * BURNBOARD Dependency Audit Gate.
 *
 * Fails on any HIGH or CRITICAL advisory that is NOT in the documented
 * baseline (scripts/security-audit-baseline.json). Baseline entries are
 * accepted risks with compensating controls — they are never edited to
 * silence a new finding.
 *
 * Usage: node scripts/dependency-audit.js
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const baseline = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'security-audit-baseline.json'), 'utf8')
).baseline;

let audit;
try {
  const raw = execSync('npm audit --json', { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
  audit = JSON.parse(raw);
} catch (err) {
  // npm audit exits non-zero when vulnerabilities exist — stdout still parses.
  try {
    audit = JSON.parse((err.stdout || '').toString());
  } catch {
    console.error('FAILED: npm audit did not produce parseable output. Not claiming clean.');
    process.exit(2);
  }
}

const vulns = audit.vulnerabilities || {};
const unbaselined = [];
for (const [name, info] of Object.entries(vulns)) {
  const sev = (info.severity || '').toLowerCase();
  if (sev !== 'high' && sev !== 'critical') continue;
  const covered = baseline.some((b) => b.name === name);
  if (!covered) unbaselined.push(`${sev} ${name} ${info.range || ''}`);
}

if (unbaselined.length) {
  console.error('FAILED: new high/critical advisories outside the documented baseline:');
  for (const u of unbaselined) console.error(` - ${u}`);
  console.error('Patch, upgrade, or document with compensating controls before release.');
  process.exit(1);
}

console.log(`PASSED: no new high/critical advisories (baseline covers: ${baseline.map((b) => b.name).join(', ')}).`);
