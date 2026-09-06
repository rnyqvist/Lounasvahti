import test from 'node:test';
import assert from 'node:assert/strict';
import { safeFetch, validatePublicUrl, readText } from '../lib/safe-fetch.ts';

test('reject local, obfuscated and IPv6 addresses, credentials and unusual ports', () => {
  for (const url of ['http://[::1]/', 'http://[::ffff:127.0.0.1]/', 'http://2130706433/', 'http://0x7f000001/', 'http://10.0.0.1/', 'http://localhost./', 'http://foo.local/', 'http://foo.localhost/', 'http://intranet/', 'https://user:pass@example.com/', 'http://example.com:8080/']) assert.throws(() => validatePublicUrl(url), url);
  assert.equal(validatePublicUrl('https://www.sodexo.fi/').hostname, 'www.sodexo.fi');
});

test('redirect to private address is blocked before the second request', async t => {
  let count = 0;
  t.mock.method(globalThis, 'fetch', async () => { count++; return new Response(null, { status: 302, headers: { location: 'http://[::1]/secret' } }); });
  await assert.rejects(safeFetch('https://example.com/'), /Paikallisia/);
  assert.equal(count, 1);
});

test('relative public redirects are followed with a shared timeout and a finite limit', async t => {
  let count = 0;
  let signal;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(options.redirect, 'manual');
    if (signal) assert.equal(options.signal, signal);
    signal = options.signal;
    count++;
    return new Response(null, { status: 302, headers: { location: '/next' } });
  });
  await assert.rejects(safeFetch('https://example.com/'), /liian monta/);
  assert.equal(count, 6);
});

test('streamed size limit stops an oversized page and preserves Finnish text', async () => {
  await assert.rejects(readText(new Response('01234567890'), 10), /liian suuri/);
  assert.equal(await readText(new Response('Lämmin kasvislisäke')), 'Lämmin kasvislisäke');
});
