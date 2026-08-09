const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function checkConfig() {
  if (!SUPABASE_URL) {
    throw new Error('SUPABASE_URL is not configured');
  }

  if (!SUPABASE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');
  }
}

export async function supabaseRequest(
  path,
  options = {}
) {
  checkConfig();

  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/${path}`,
    {
      ...options,

      headers: {
        apikey: SUPABASE_KEY,

        Authorization:
          `Bearer ${SUPABASE_KEY}`,

        'Content-Type':
          'application/json',

        ...(options.headers || {})
      }
    }
  );

  const text =
    await response.text();

  let data = null;

  if (text) {
    try {
      data =
        JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    const message =
      data?.message ||
      data?.error ||
      `Supabase returned ${response.status}`;

    throw new Error(message);
  }

  return data;
}
