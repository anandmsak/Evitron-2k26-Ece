import 'dotenv/config';
import { supabaseAdmin } from '../server/supabase.js';
import { supabase } from '../src/services/supabaseClient.js';

async function main() {
  console.log('--- RUNNING RIGOROUS TEST QUERIES ---');

  const csvExpected = 82;

  // 1. Backend query: supabase.from('registrations').select('*', { count: 'exact' })
  const backendRes = await supabaseAdmin.from('registrations').select('*', { count: 'exact' });
  console.log('1. Backend count:', backendRes.count, 'rows returned:', backendRes.data?.length);
  console.log(`   Backend matches: ${backendRes.count === csvExpected ? '✅ MATCH' : '❌ MISMATCH'}`);

  // 2. Frontend query: supabase.from('registrations').select('*')
  const frontendRes = await supabase.from('registrations').select('*');
  console.log('2. Frontend rows returned:', frontendRes.data?.length);
  console.log(`   Frontend matches: ${frontendRes.data?.length === csvExpected ? '✅ MATCH' : '❌ MISMATCH'}`);

  // 3. Supabase query: supabase.from('registrations').select('registration_events, team_size', { count: 'exact' })
  const groupRes = await supabase.from('registrations').select('registration_events, team_size', { count: 'exact' });
  console.log('3. Grouping query count:', groupRes.count, 'rows:', groupRes.data?.length);
  if (groupRes.data && groupRes.data[0]) {
    console.log('   Sample row:', groupRes.data[0]);
  }
  console.log(`   Grouping query matches: ${groupRes.count === csvExpected ? '✅ MATCH' : '❌ MISMATCH'}`);

  // 4. Test queries for each event:
  //    supabase.from('registrations').select('registration_events', { count: 'exact' }).eq('registration_events', '<event-name>')
  const standardEvents = [
    { name: 'silicon 2 gds', expected: 15 },
    { name: 'tractron', expected: 6 },
    { name: 'embedded system', expected: 34 },
    { name: 'virtual instrument', expected: 9 },
    { name: 'techpaper', expected: 16 },
    { name: 'evolvex', expected: 2 },
    { name: 'detective 404', expected: 3 },
    { name: 'promptify', expected: 3 },
    { name: 'mind maze', expected: 3 },
    { name: 'memix', expected: 1 }
  ];

  console.log('4. Event-Wise Query Verification:');
  let allEventsMatch = true;
  for (const ev of standardEvents) {
    const evRes = await supabase
      .from('registrations')
      .select('registration_events', { count: 'exact' })
      .eq('registration_events', ev.name);

    const match = evRes.count === ev.expected;
    if (!match) allEventsMatch = false;
    console.log(`   - "${ev.name.padEnd(20)}": count = ${String(evRes.count).padStart(2)} (expected: ${String(ev.expected).padStart(2)}) ${match ? '✅ MATCH' : '❌ MISMATCH'}`);
  }
  console.log(`   All event queries status: ${allEventsMatch ? '✅ ALL 10 EVENTS MATCH' : '❌ MISMATCH DETECTED'}`);

  // 5. Verify sample row columns
  if (backendRes.data && backendRes.data[0]) {
    const sample = backendRes.data[0];
    const requiredKeys = [
      'registration_code',
      'created_at',
      'registration_type',
      'registered_events',
      'team_leader_name',
      'team_leader_email',
      'team_leader_phone',
      'college_name',
      'department',
      'year_of_study',
      'total_participants',
      'member_2_details',
      'member_3_details',
      'member_4_details',
      'total_amount',
      'payment_method',
      'payment_status',
      'payment_reference',
      'payment_proof_url',
      'attendance_status',
      'updated_at'
    ];
    const missingKeys = requiredKeys.filter(k => !(k in sample));
    console.log('5. Column alignment check:');
    if (missingKeys.length === 0) {
      console.log('   All 21 required columns are present in Supabase registrations! ✅ MATCH');
    } else {
      console.log('   Missing columns:', missingKeys, '❌ MISMATCH');
    }
    console.log('   Sample created_at timestamp format:', sample.created_at);
    console.log('   Sample payment_proof_url:', sample.payment_proof_url);
  }
}

main().catch(console.error);
