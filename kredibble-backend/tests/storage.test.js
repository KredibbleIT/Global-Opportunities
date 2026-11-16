import fs from 'node:fs/promises';
import path from 'node:path';
import request from 'supertest';
import { app } from '../src/app.js';
import { deleteImage, deleteUserMedia, storedPathFromUrl, uploadBaseUrl, uploadBuffer, uploadRoot } from '../src/lib/storage.js';

// Files are stored on this server's own disk and served from /uploads. ALL DATA IS FAKE.

// A real 1x1 PNG, and the start of a Windows executable.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const EXE = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(200, 0)]);
const USER = '64b7f1c2a1b2c3d4e5f60718';

const exists = (file) => fs.access(file).then(() => true, () => false);

describe('storage: saving a file', () => {
  it('writes the file under a random name with the extension of its real type, and returns its address', async () => {
    const result = await uploadBuffer(PNG, `kredibble/${USER}/avatars`);
    expect(result.secure_url).toMatch(new RegExp(`^${uploadBaseUrl()}/kredibble/${USER}/avatars/[a-f0-9]{32}\\.png$`));
    expect(result.public_id).toMatch(new RegExp(`^kredibble/${USER}/avatars/[a-f0-9]{32}$`));
    expect(result).toMatchObject({ format: 'png', bytes: PNG.length, folder: `kredibble/${USER}/avatars` });
    expect(await fs.readFile(path.join(uploadRoot(), `${result.public_id}.png`))).toEqual(PNG);
  });

  it('never reuses a name', async () => {
    const [a, b] = await Promise.all([uploadBuffer(PNG, 'kredibble/admin/x'), uploadBuffer(PNG, 'kredibble/admin/x')]);
    expect(a.secure_url).not.toBe(b.secure_url);
  });

  it('refuses a file that is not an allowed type, and any folder that could leave the storage folder', async () => {
    await expect(uploadBuffer(EXE, 'kredibble/admin/x')).rejects.toMatchObject({ status: 400 });
    for (const folder of ['../etc', 'kredibble/../../etc', 'kredibble/a b', '', '/', 'kredibble/..']) {
      await expect(uploadBuffer(PNG, folder)).rejects.toThrow();
    }
  });
});

describe('storage: addresses', () => {
  it('only reads addresses of files this server generated', async () => {
    const { secure_url: url, public_id: id } = await uploadBuffer(PNG, 'kredibble/admin/showcase-photo');
    expect(storedPathFromUrl(url)).toBe(`${id}.png`);
    for (const foreign of [
      'https://example.com/a.png',
      url.replace('https:', 'http:'),
      url.replace('api.test', 'other.test'),
      `${url}?x=1`,
      `${uploadBaseUrl()}/kredibble/admin/showcase-photo/a.png`,
      `${uploadBaseUrl()}/${'a'.repeat(32)}.png`,
      'not a url',
    ]) {
      expect(storedPathFromUrl(foreign)).toBeNull();
    }
  });
});

describe('storage: deleting', () => {
  it('deletes one file by its public id, and a missing one is not an error', async () => {
    const { public_id: id } = await uploadBuffer(PNG, 'kredibble/admin/showcase-photo');
    expect(await deleteImage(id)).toEqual({ result: 'ok' });
    expect(await exists(path.join(uploadRoot(), `${id}.png`))).toBe(false);
    expect(await deleteImage(id)).toEqual({ result: 'not found' });
    expect(await deleteImage('../../package')).toEqual({ result: 'not found' });
  });

  it('deletes everything a user uploaded, and nobody else\'s files', async () => {
    const mine = await uploadBuffer(PNG, `kredibble/${USER}/cvs`);
    const theirs = await uploadBuffer(PNG, 'kredibble/64b7f1c2a1b2c3d4e5f60719/cvs');
    await deleteUserMedia(USER);
    expect(await exists(path.join(uploadRoot(), `${mine.public_id}.png`))).toBe(false);
    expect(await exists(path.join(uploadRoot(), `${theirs.public_id}.png`))).toBe(true);
    await deleteUserMedia('../..'); // an unsafe id deletes nothing
    expect(await exists(path.join(uploadRoot(), `${theirs.public_id}.png`))).toBe(true);
  });
});

describe('GET /uploads', () => {
  it('serves a stored file with its type, long caching and a policy that lets other sites show it', async () => {
    const { public_id: id } = await uploadBuffer(PNG, 'kredibble/admin/showcase-photo');
    const res = await request(app).get(`/uploads/${id}.png`).expect(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['cache-control']).toContain('immutable');
    expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(Buffer.from(res.body).equals(PNG)).toBe(true);
  });

  it('answers 404 for a missing file, a folder listing and an attempt to climb out', async () => {
    await request(app).get(`/uploads/kredibble/admin/showcase-photo/${'0'.repeat(32)}.png`).expect(404);
    await request(app).get('/uploads/kredibble/admin/').expect(404);
    await request(app).get('/uploads/..%2f..%2fpackage.json').expect(404);
  });
});
