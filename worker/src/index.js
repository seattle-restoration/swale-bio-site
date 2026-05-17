// Swale Intelligence API bridge (Cloudflare Worker)
// Fetches WH51 soil moisture from the Ecowitt cloud API, normalizes for the PWA.
// Rainbird endpoint is a stub for the Phase 2 on-prem bridge.

const CACHE_TTL_SECONDS = 30;

// Map Ecowitt channel -> app zone key. 2 WH51 probes.
// To add more, drop in more soil_chN -> zoneKey pairs and add a matching
// hotspot / zone entry in swale-app.html.
const CHANNEL_MAP = {
  soil_ch1: 'swaleX',
  soil_ch2: 'swaleY',
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}`,
  };
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}

function celsiusToF(c) {
  return Math.round((c * 9) / 5 + 32);
}

async function getEcowittRealtime(env) {
  if (!env.ECOWITT_APP_KEY || !env.ECOWITT_API_KEY || !env.ECOWITT_MAC) {
    throw new Error('missing Ecowitt env: ECOWITT_APP_KEY / ECOWITT_API_KEY / ECOWITT_MAC');
  }
  const url = new URL('https://api.ecowitt.net/api/v3/device/real_time');
  url.searchParams.set('application_key', env.ECOWITT_APP_KEY);
  url.searchParams.set('api_key', env.ECOWITT_API_KEY);
  url.searchParams.set('mac', env.ECOWITT_MAC);
  url.searchParams.set('call_back', 'all');
  url.searchParams.set('temp_unitid', '1'); // celsius

  const r = await fetch(url.toString(), {
    cf: { cacheTtl: CACHE_TTL_SECONDS, cacheEverything: true },
  });
  if (!r.ok) throw new Error(`Ecowitt HTTP ${r.status}`);
  const data = await r.json();
  if (data.code !== 0) throw new Error(`Ecowitt API ${data.code}: ${data.msg}`);
  return data.data || {};
}

function extractMoisture(eco) {
  const out = {};
  for (const [chanKey, zoneKey] of Object.entries(CHANNEL_MAP)) {
    const chan = eco[chanKey];
    const v = chan?.soilmoisture?.value;
    out[zoneKey] = v != null && v !== '' ? Number(v) : null;
  }
  return out;
}

function extractBattery(eco) {
  const out = {};
  for (const [chanKey, zoneKey] of Object.entries(CHANNEL_MAP)) {
    const chan = eco[chanKey];
    const v = chan?.soilbatt?.value;
    if (v != null && v !== '') out[zoneKey] = Number(v);
  }
  return out;
}

function extractEnvironment(eco) {
  const outdoor = eco.outdoor || {};
  const tempC = outdoor.temperature?.value;
  return {
    soilTemp: tempC != null ? celsiusToF(Number(tempC)) : null,
    humidity: outdoor.humidity?.value != null ? Number(outdoor.humidity.value) : null,
  };
}

async function handleSensors(env) {
  try {
    const eco = await getEcowittRealtime(env);
    return json({
      ok: true,
      ts: Date.now(),
      moisture: extractMoisture(eco),
      battery: extractBattery(eco),
      environment: extractEnvironment(eco),
      source: 'ecowitt',
    });
  } catch (e) {
    return json({ ok: false, error: e.message, source: 'ecowitt' }, 502);
  }
}

async function handleRainbirdStatus(env) {
  // Phase 1: nothing live yet. When the on-prem bridge is deployed it will
  // POST status to /rainbird/push and we'll serve it here.
  if (!env.SWALE_KV) {
    return json({
      ok: true,
      live: false,
      zones: [],
      note: 'KV not bound; Rainbird bridge not deployed yet',
    });
  }
  const raw = await env.SWALE_KV.get('rainbird:status');
  if (!raw) return json({ ok: true, live: false, zones: [], note: 'no data yet' });
  return json({ ok: true, live: true, ...JSON.parse(raw) });
}

async function handleRainbirdPush(req, env) {
  const auth = req.headers.get('authorization');
  if (!env.BRIDGE_TOKEN || auth !== `Bearer ${env.BRIDGE_TOKEN}`) {
    return json({ ok: false, error: 'unauthorized' }, 401);
  }
  if (!env.SWALE_KV) {
    return json({ ok: false, error: 'KV not bound' }, 500);
  }
  const body = await req.json();
  await env.SWALE_KV.put(
    'rainbird:status',
    JSON.stringify({ ...body, ts: Date.now() }),
    { expirationTtl: 600 },
  );
  return json({ ok: true });
}

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    const url = new URL(req.url);

    if (url.pathname === '/sensors') return handleSensors(env);
    if (url.pathname === '/rainbird/status') return handleRainbirdStatus(env);
    if (url.pathname === '/rainbird/push' && req.method === 'POST') {
      return handleRainbirdPush(req, env);
    }

    return json({
      name: 'Swale Intelligence API',
      version: '1.0.0',
      endpoints: {
        'GET /sensors': 'live WH51 moisture + battery + outdoor temp',
        'GET /rainbird/status': 'last known Rainbird zone state (Phase 2)',
        'POST /rainbird/push': 'on-prem bridge posts status here (auth: Bearer)',
      },
    });
  },
};
