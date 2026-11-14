import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';

const BACKUP_SCRIPT = 'deploy/bin/god-backup';
const VALID_AGE_KEY = 'age1testrecipientkeyforvalidationonly000000000000'; // gitleaks:allow

const runBackup = (args, extraEnv = {}) => {
  return new Promise((resolveResult) => {
    const env = {
      ...process.env,
      DRY_RUN: '1',
      DATABASE_URL: 'mongodb://localhost:27017/test_god',
      ...extraEnv,
    };

    execFile('bash', [BACKUP_SCRIPT, ...args], { env }, (error, stdout, stderr) => {
      resolveResult({
        exitCode: error ? (error.code ?? 1) : 0,
        stdout: stdout.toString().trim(),
        stderr: stderr.toString().trim(),
      });
    });
  });
};

test('god-backup: displays help on --help', async () => {
  const res = await runBackup(['--help']);
  assert.equal(res.exitCode, 0);
  assert.match(res.stdout, /Usage: god-backup/);
});

test('god-backup: rejects unknown options', async () => {
  const res = await runBackup(['--unknown-flag']);
  assert.notEqual(res.exitCode, 0);
  assert.match(res.stderr, /Unknown option: --unknown-flag/);
});

test('god-backup: rejects invalid age public key format', async () => {
  const res = await runBackup(['--recipient', 'not-a-valid-age-key']);
  assert.notEqual(res.exitCode, 0);
  assert.match(res.stderr, /Invalid age public key format/);
});

test('god-backup: dry-run plan includes encryption and upload', async () => {
  const res = await runBackup([
    '--dry-run',
    '--recipient', VALID_AGE_KEY,
    '--env', 'staging',
    '--bucket', 'custom-r2-bucket',
    '--heartbeat', 'https://betterstack.com/ping/abc',
  ]);

  assert.equal(res.exitCode, 0);
  assert.match(res.stdout, /\[DRY-RUN\] mongodump --config=/);
  assert.match(res.stdout, /custom-r2-bucket/);
  assert.match(res.stdout, /https:\/\/betterstack\.com\/ping\/abc/);
});

test('god-backup: dry-run with --no-upload skips remote sync', async () => {
  const res = await runBackup([
    '--dry-run',
    '--recipient', VALID_AGE_KEY,
    '--no-upload',
  ]);

  assert.equal(res.exitCode, 0);
  assert.doesNotMatch(res.stdout, /Upload to s3:/);
});

// GOD-T55: production's address names "god-production", an empty database, while the API
// always uses "kredibble"; every nightly dump was 317 bytes. These run the script's own
// target_database_uri function on sample addresses (no credentials, nothing connects).
const targetUri = (uri, db = 'kredibble') =>
  new Promise((resolveResult) => {
    const script = `source <(sed -n '/^target_database_uri()/,/^}/p' "${BACKUP_SCRIPT}"); target_database_uri "$1" "$2"`;
    execFile('bash', ['-c', script, 'test', uri, db], (error, stdout, stderr) => {
      resolveResult({ exitCode: error ? (error.code ?? 1) : 0, stdout: stdout.toString().trim(), stderr: stderr.toString().trim() });
    });
  });

test('god-backup: Atlas address is pointed at the API database, login settings untouched', async () => {
  const { stdout } = await targetUri('mongodb+srv://user:pw@cluster0.example.mongodb.net/god-production?retryWrites=true&w=majority');
  assert.equal(stdout, 'mongodb+srv://user:pw@cluster0.example.mongodb.net/kredibble?retryWrites=true&w=majority');
});

test('god-backup: Atlas address without a database or options gets the API database', async () => {
  const { stdout } = await targetUri('mongodb+srv://user:pw@cluster0.example.mongodb.net/');
  assert.equal(stdout, 'mongodb+srv://user:pw@cluster0.example.mongodb.net/kredibble');
});

test('god-backup: plain address keeps logging in against its original database', async () => {
  const { stdout } = await targetUri('mongodb://user:pw@db.example:27017/god-production');
  assert.equal(stdout, 'mongodb://user:pw@db.example:27017/kredibble?authSource=god-production');
});

test('god-backup: plain address with no database keeps the admin login default', async () => {
  const { stdout } = await targetUri('mongodb://localhost:27017');
  assert.equal(stdout, 'mongodb://localhost:27017/kredibble?authSource=admin');
});

test('god-backup: an explicit authSource is kept as it is', async () => {
  const { stdout } = await targetUri('mongodb://u:p@h:27017/other?authSource=admin&tls=true');
  assert.equal(stdout, 'mongodb://u:p@h:27017/kredibble?authSource=admin&tls=true');
});

test('god-backup: a non-MongoDB address is refused', async () => {
  const { exitCode, stderr } = await targetUri('postgres://h/db');
  assert.notEqual(exitCode, 0);
  assert.match(stderr, /not a mongodb/);
});

test('god-backup: dry run says which database it dumps', async () => {
  const { stdout } = await runBackup(['--recipient', VALID_AGE_KEY, '--no-upload']);
  assert.match(stdout, /Dumping database 'kredibble'/);
});
