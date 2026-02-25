import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiFetch, apiFetchText, getApiUrl } from './api.js';

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.ENVALT_API_URL;
});

describe('cli api client', () => {
  it('uses default API URL when ENVALT_API_URL is not set', () => {
    expect(getApiUrl()).toBe('http://localhost:3093');
  });

  it('uses ENVALT_API_URL when configured', () => {
    process.env.ENVALT_API_URL = 'http://127.0.0.1:9999';
    expect(getApiUrl()).toBe('http://127.0.0.1:9999');
  });

  it('apiFetch returns parsed json on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ ok: true })
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await apiFetch('/health');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3093/health',
      expect.objectContaining({
        headers: expect.objectContaining({ 'Content-Type': 'application/json' })
      })
    );
    expect(result).toEqual({ ok: true });
  });

  it('apiFetch throws API error message on non-2xx', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: vi.fn().mockResolvedValue({ error: 'Not found' })
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiFetch('/missing')).rejects.toThrow('Not found');
  });

  it('apiFetchText returns text payload on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: vi.fn().mockResolvedValue('KEY=value\n')
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await apiFetchText('/export');

    expect(result).toBe('KEY=value\n');
  });
});
