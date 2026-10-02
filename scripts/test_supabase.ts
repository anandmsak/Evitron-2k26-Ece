import 'dotenv/config';

async function main() {
  const secretKey = process.env.SUPABASE_SECRET_KEY!;
  const url = process.env.SUPABASE_URL!;

  const res = await fetch(`${url}/rest/v1/`, {
    headers: {
      apikey: secretKey,
      Authorization: `Bearer ${secretKey}`
    }
  });

  const schema = await res.json();
  console.log('Tables/paths in PostgREST:');
  const paths = Object.keys(schema.paths || {});
  console.log(paths);
  if (schema.definitions) {
    console.log('Definitions:');
    for (const def of Object.keys(schema.definitions)) {
      console.log(`- ${def}:`, Object.keys(schema.definitions[def].properties || {}));
    }
  }
}

main().catch(console.error);
