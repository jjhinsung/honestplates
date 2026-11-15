import { fetchOffProduct } from '../src/services/barcodeLookup';

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
const status = (code: number) => ({ ok: false, status: code, json: async () => ({}) });

describe('fetchOffProduct', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('retries once when the database is busy, then succeeds', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(status(503))
      .mockResolvedValueOnce(ok({ status: 1, product: { product_name: 'Crackers' } }));
    globalThis.fetch = fetchMock as any;
    await expect(fetchOffProduct('0024100940271', 'product_name', 1000)).resolves.toEqual({ product_name: 'Crackers' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries a timeout once, then reports it clearly', async () => {
    const fetchMock = jest.fn((_url: string, init: { signal: AbortSignal }) => {
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
      });
    });
    globalThis.fetch = fetchMock as any;
    await expect(fetchOffProduct('123', 'code', 20)).rejects.toThrow(/took too long/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns undefined for an unknown barcode without retrying', async () => {
    const fetchMock = jest.fn().mockResolvedValue(status(404));
    globalThis.fetch = fetchMock as any;
    await expect(fetchOffProduct('123', 'code', 1000)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
