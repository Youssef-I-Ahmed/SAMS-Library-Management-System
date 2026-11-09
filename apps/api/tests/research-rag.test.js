import { afterEach, describe, expect, it } from 'vitest';
import { buildResearchIndex, createResearchRag, searchResearchIndex } from '../src/modules/ai/research-rag.js';

const record = (id, title, extra = {}) => ({
  id, title, legacy_code: null, publication_year: 2024, language: 'ar',
  call_number: null, subjects: [], researchers: [], supervisors: [], available: true, ...extra
});

describe('Research RAG metadata retrieval', () => {
  let provider;
  afterEach(() => provider?.stop());

  it('uses titles, subjects, researchers, supervisors and normalized legacy codes', () => {
    const expected = record('1', 'معالجة مياه الصرف', {
      legacy_code: '٠٨٩٢', researchers: ['آمال يوسف'], supervisors: ['إبراهيم حسن'], subjects: ['الهندسة']
    });
    const index = buildResearchIndex([expected, record('2', 'تطوير الأنظمة')]);
    for (const question of ['مشروع معالجة مياه الصرف', 'امال يوسف', 'ابراهيم حسن', 'هندسه', '0892']) {
      expect(searchResearchIndex(index, question)).toEqual([expected]);
    }
    expect(searchResearchIndex(index, 'مشروع تخرج')).toEqual([]);
  });

  it('publishes additions, relation edits and deletions by polling, and fails closed on refresh errors', async () => {
    let rows = [];
    provider = createResearchRag({ load: async () => {
      if (!rows) throw new Error('sensitive raw database failure');
      return rows;
    }, refreshMs: 20 });
    expect((await provider.health()).indexedCount).toBe(0);
    rows = [record('1', 'Network optimization')];
    await expect.poll(async () => (await provider.ask('Network optimization')).status).toBe('success');
    rows = [record('1', 'Network optimization', { supervisors: ['Maya Adel'] })];
    await expect.poll(async () => (await provider.ask('Maya Adel')).status).toBe('success');
    rows = [];
    await expect.poll(async () => (await provider.ask('Network optimization')).status).toBe('no-results');
    rows = null;
    await expect.poll(async () => {
      try { await provider.health(); } catch (error) { return error.code; }
      return 'ready';
    }).toBe('AI_SERVICE_UNAVAILABLE');
  });
});
