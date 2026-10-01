// scripts/seedSupabaseFromSheet.ts
import { supabaseAdmin, isSupabaseConfigured } from '../server/supabase.js';

async function seedSupabase() {
  console.log('Fetching 79 live registrations from Google Sheet endpoint...');
  const res = await fetch(
    'https://script.google.com/macros/s/AKfycbwQFDmE-3bG517qhy5jP6my90QCKsps5GLn2q7ih3vHJmTq96PikBitSCJgIqyxOqRoaQ/exec?action=getRegistrations',
    { redirect: 'follow' }
  );

  if (!res.ok) {
    console.error('Failed to fetch from Google Sheet endpoint');
    return;
  }

  const sheetData = (await res.json()) as any[];
  console.log(`Fetched ${sheetData.length} records. Beginning Supabase DB populate...`);

  // Fetch events from Supabase to resolve IDs
  const { data: dbEvents } = await supabaseAdmin.from('events').select('*');
  const eventMap = new Map<string, string>();
  if (dbEvents) {
    for (const e of dbEvents) {
      if (e.id) eventMap.set(e.id.toLowerCase(), e.id);
      if (e.code) eventMap.set(e.code.toLowerCase(), e.id);
      if (e.name) eventMap.set(e.name.toLowerCase(), e.id);
    }
  }

  let insertedCount = 0;

  for (const d of sheetData) {
    const regCode = d.id || d.regId;
    if (!regCode) continue;

    const isWs = d.registrationType === 'workshop' || String(d.track || d.eventsText || '').toLowerCase().includes('workshop');
    const dbType = isWs ? 'individual' : 'team';
    const dbStatus = String(d.paymentStatus || '').toLowerCase() === 'paid' ? 'paid' : 'pending_verification';

    // 1. Upsert into registrations
    const { data: reg, error: regErr } = await supabaseAdmin
      .from('registrations')
      .upsert(
        {
          registration_code: regCode,
          registration_type: dbType,
          total_amount: Number(d.totalAmount || d.amount || 0),
          payment_method: 'upi',
          payment_status: dbStatus,
          created_at: d.createdAt || d.timestamp || new Date().toISOString(),
        },
        { onConflict: 'registration_code' }
      )
      .select('id')
      .single();

    if (regErr || !reg?.id) {
      console.warn(`[SEED WARNING] Registration ${regCode} insert notice:`, regErr?.message);
      continue;
    }

    const regUuid = reg.id;
    const participantsList = Array.isArray(d.participants) && d.participants.length > 0
      ? d.participants
      : [d.teamLeader || { fullName: 'Attendee', email: '', phone: '', college: '' }];

    // 2. Insert participants
    for (let idx = 0; idx < participantsList.length; idx++) {
      const p = participantsList[idx];
      const { data: pData } = await supabaseAdmin
        .from('participants')
        .insert({
          full_name: p.fullName || 'Attendee',
          email: p.email || '',
          phone: p.phone || '',
          college: p.college || '',
          department: p.department || null,
          year_of_study: p.year || null,
        })
        .select('id')
        .maybeSingle();

      if (pData?.id) {
        await supabaseAdmin.from('registration_participants').insert({
          registration_id: regUuid,
          participant_id: pData.id,
          role: idx === 0 ? 'team_leader' : 'member',
        });
      }
    }

    // 3. Upsert payment record
    await supabaseAdmin.from('payments').upsert({
      registration_id: regUuid,
      amount: Number(d.totalAmount || d.amount || 0),
      method: 'upi',
      status: dbStatus,
      upi_reference: d.upiReference || d.paymentRef || null,
      payment_proof_url: d.paymentProofUrl || null,
    });

    insertedCount++;
  }

  console.log(`Successfully populated ${insertedCount} / ${sheetData.length} records into Supabase DB!`);
}

seedSupabase();
