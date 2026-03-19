import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp, resetMocks, mockOctokitGet, mockOctokitListLanguages } from './test-app.helper';

describe('Repositories API (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    resetMocks();
  });

  // --- POST /api/repositories ---

  describe('POST /api/repositories', () => {
    it('returns 201 with repository data on success', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/repositories')
        .send({ owner: 'acme', repo: 'myrepo' });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        owner: 'acme',
        name: 'myrepo',
        url: 'https://github.com/acme/myrepo',
        scanStatus: 'NOT_STARTED',
      });
      expect(res.body.id).toBeDefined();
    });

    it('returns 409 with ALREADY_REGISTERED when same repo posted twice', async () => {
      await request(app.getHttpServer())
        .post('/api/repositories')
        .send({ owner: 'acme', repo: 'duplicate' });

      const res = await request(app.getHttpServer())
        .post('/api/repositories')
        .send({ owner: 'acme', repo: 'duplicate' });

      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ error: 'ALREADY_REGISTERED' });
    });

    it('returns 400 with INVALID_TOKEN when GitHub returns 401', async () => {
      mockOctokitGet.mockRejectedValue({ status: 401 });

      const res = await request(app.getHttpServer())
        .post('/api/repositories')
        .send({ owner: 'acme', repo: 'tokentest' });

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ error: 'INVALID_TOKEN' });
    });

    it('returns 400 with REPO_NOT_FOUND when GitHub returns 404', async () => {
      mockOctokitGet.mockRejectedValue({ status: 404 });

      const res = await request(app.getHttpServer())
        .post('/api/repositories')
        .send({ owner: 'acme', repo: 'notfound' });

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ error: 'REPO_NOT_FOUND' });
    });

    it('returns 400 with NO_TYPESCRIPT when TypeScript not in languages', async () => {
      mockOctokitListLanguages.mockResolvedValue({ data: { JavaScript: 10000 } });

      const res = await request(app.getHttpServer())
        .post('/api/repositories')
        .send({ owner: 'acme', repo: 'jsrepo' });

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ error: 'NO_TYPESCRIPT' });
    });

    it('returns 400 with TS_TOO_SMALL when TypeScript bytes below threshold', async () => {
      mockOctokitListLanguages.mockResolvedValue({ data: { TypeScript: 50 } });

      const res = await request(app.getHttpServer())
        .post('/api/repositories')
        .send({ owner: 'acme', repo: 'tinyrepo' });

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ error: 'TS_TOO_SMALL' });
    });
  });

  // --- GET /api/repositories ---

  describe('GET /api/repositories', () => {
    it('returns 200 with empty array when no repos exist', async () => {
      const res = await request(app.getHttpServer()).get('/api/repositories');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('returns registered repos', async () => {
      await request(app.getHttpServer())
        .post('/api/repositories')
        .send({ owner: 'listtest', repo: 'repo1' });

      const res = await request(app.getHttpServer()).get('/api/repositories');
      expect(res.status).toBe(200);
      const owners = res.body.map((r: { owner: string }) => r.owner);
      expect(owners).toContain('listtest');
    });
  });

  // --- GET /api/repositories/:id ---

  describe('GET /api/repositories/:id', () => {
    it('returns 200 with the repository when found', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/repositories')
        .send({ owner: 'gettest', repo: 'repo1' });

      const res = await request(app.getHttpServer()).get(
        `/api/repositories/${createRes.body.id}`,
      );
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ owner: 'gettest', name: 'repo1' });
    });

    it('returns 404 when id does not exist', async () => {
      const res = await request(app.getHttpServer()).get(
        '/api/repositories/nonexistent-id',
      );
      expect(res.status).toBe(404);
    });
  });

  // --- DELETE /api/repositories/:id ---

  describe('DELETE /api/repositories/:id', () => {
    it('returns 204 on successful deletion', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/repositories')
        .send({ owner: 'deltest', repo: 'repo1' });

      const res = await request(app.getHttpServer()).delete(
        `/api/repositories/${createRes.body.id}`,
      );
      expect(res.status).toBe(204);
    });

    it('returns 404 when id does not exist', async () => {
      const res = await request(app.getHttpServer()).delete(
        '/api/repositories/nonexistent-id',
      );
      expect(res.status).toBe(404);
    });

    it('deleted repo no longer appears in list', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/repositories')
        .send({ owner: 'cleantest', repo: 'repo1' });

      await request(app.getHttpServer()).delete(
        `/api/repositories/${createRes.body.id}`,
      );

      const listRes = await request(app.getHttpServer()).get('/api/repositories');
      const found = listRes.body.find(
        (r: { id: string }) => r.id === createRes.body.id,
      );
      expect(found).toBeUndefined();
    });
  });

  // --- POST /api/repositories/:id/scan ---

  describe('POST /api/repositories/:id/scan', () => {
    it('returns 202 with scanJobId when repo exists', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/repositories')
        .send({ owner: 'scantest', repo: 'repo1' });

      const res = await request(app.getHttpServer()).post(
        `/api/repositories/${createRes.body.id}/scan`,
      );
      expect(res.status).toBe(202);
      expect(res.body.scanJobId).toBeDefined();
    });

    it('returns 404 when repo does not exist', async () => {
      const res = await request(app.getHttpServer()).post(
        '/api/repositories/nonexistent-id/scan',
      );
      expect(res.status).toBe(404);
    });
  });

  // --- GET /api/repositories/:id/coverage-files ---

  describe('GET /api/repositories/:id/coverage-files', () => {
    it('returns 200 with paginated result for existing repo', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/repositories')
        .send({ owner: 'covtest', repo: 'repo1' });

      const res = await request(app.getHttpServer()).get(
        `/api/repositories/${createRes.body.id}/coverage-files`,
      );
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ items: [], total: 0, page: 1, limit: 50 });
    });

    it('returns 404 for unknown repo id', async () => {
      const res = await request(app.getHttpServer()).get(
        '/api/repositories/nonexistent-id/coverage-files',
      );
      expect(res.status).toBe(404);
    });

    it('respects page and limit query params', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/repositories')
        .send({ owner: 'pagetest', repo: 'repo1' });

      const res = await request(app.getHttpServer()).get(
        `/api/repositories/${createRes.body.id}/coverage-files?page=2&limit=10`,
      );
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ page: 2, limit: 10 });
    });
  });
});
