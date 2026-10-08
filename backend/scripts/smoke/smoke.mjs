// Existing-API smoke checklist.
// Usage: node scripts/smoke/smoke.mjs --base http://localhost:3011/api/v1 [--readonly] [--phone +919000000001] [--ingest]
// --readonly only calls public GET endpoints, so it writes nothing to the database.
// The full mode logs in with the development OTP bypass; the phone must be listed in ADMIN_PHONES.
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const base = opt('--base', 'http://localhost:3011/api/v1');
const phone = opt('--phone', '+919000000001');
const readonly = args.includes('--readonly');
const ingest = args.includes('--ingest');

const headers = {
  'content-type': 'application/json',
  'user-agent': 'aci-smoke/1.0',
  'x-device-language': 'en-IN',
  'x-device-timezone': 'Asia/Kolkata',
};
let failures = 0;

async function call(method, path, body, token) {
  const res = await fetch(base + path, {
    method,
    headers: token ? { ...headers, authorization: `Bearer ${token}` } : headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

function check(label, ok, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
}

async function main() {
  const careers = await call('GET', '/careers');
  check('GET /careers', careers.status === 200 && careers.json?.success === true, `status ${careers.status}`);
  const jobs = await call('GET', '/jobs');
  check('GET /jobs', jobs.status === 200 && Array.isArray(jobs.json?.data), `status ${jobs.status}`);
  if (readonly) return;

  const sent = await call('POST', '/auth/send-otp', { phone });
  check('POST /auth/send-otp', sent.status === 201 || sent.status === 200 || sent.status === 429, `status ${sent.status}`);
  const verified = await call('POST', '/auth/verify-otp', { phone, code: '123456', name: 'Smoke Admin' });
  const token = verified.json?.data?.accessToken;
  check('POST /auth/verify-otp', Boolean(token), `status ${verified.status}`);
  if (!token) return;

  const me = await call('GET', '/auth/me', undefined, token);
  check('GET /auth/me', me.status === 200, `role ${me.json?.data?.role}`);
  const profile = await call('GET', '/profile', undefined, token);
  check('GET /profile', profile.status === 200, `status ${profile.status}`);
  const gaps = await call('GET', '/skill-gaps', undefined, token);
  check('GET /skill-gaps responds', gaps.status < 500, `status ${gaps.status}`);
  const adminCareers = await call('GET', '/admin/careers', undefined, token);
  check('GET /admin/careers', adminCareers.status === 200, `status ${adminCareers.status}`);
  const runs = await call('GET', '/admin/ingest/runs', undefined, token);
  check('GET /admin/ingest/runs', runs.status === 200, `status ${runs.status}`);

  if (!ingest) return;
  const slug = `smoke-backend-${Date.now()}`;
  const created = await call(
    'POST',
    '/admin/careers',
    {
      title: 'Smoke Backend',
      slug,
      overview: 'Smoke test career',
      marketExpectations: 'n/a',
      entryLevelExpectations: 'n/a',
      syllabusSlug: 'backend',
      requirements: [{ skillName: 'Node.js', importance: 'HIGH', type: 'REQUIRED' }],
    },
    token,
  );
  const careerId = created.json?.data?.id;
  const runId = created.json?.data?.ingestRun?.runId;
  check('POST /admin/careers enqueues CREATE ingest', Boolean(careerId && runId), `status ${created.status}`);
  if (runId) {
    let final = null;
    for (let i = 0; i < 45; i += 1) {
      await new Promise((r) => setTimeout(r, 2000));
      const run = await call('GET', `/admin/ingest/runs/${runId}`, undefined, token);
      const status = run.json?.data?.status;
      if (['COMPLETED', 'FAILED', 'PARTIAL_FAILED'].includes(status)) {
        final = run.json.data;
        break;
      }
    }
    const job = final?.jobs?.[0];
    check(
      'single-career ingest end-to-end',
      final?.status === 'COMPLETED',
      `run ${final?.status ?? 'TIMEOUT'}, added ${job?.result?.added?.length ?? 0}, steps ${(job?.steps ?? []).map((s) => s.stepKey).join('>')}`,
    );
  }
  if (careerId) {
    const del = await call('DELETE', `/admin/careers/${careerId}`, undefined, token);
    check('DELETE smoke career (cleanup)', del.status === 200, `status ${del.status}`);
  }
}

main()
  .catch((err) => {
    failures += 1;
    console.log('FAIL  smoke crashed', err.message);
  })
  .finally(() => {
    console.log(failures ? `SMOKE FAILED (${failures})` : 'SMOKE PASSED');
    process.exit(failures ? 1 : 0);
  });
