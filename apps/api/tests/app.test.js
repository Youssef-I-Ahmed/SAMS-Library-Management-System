import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';

describe('SAMS API', () => {
  it('returns service information', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body.service).toBe('SAMS Library API');
    expect(res.body.version).toBe('v1');
  });
});
