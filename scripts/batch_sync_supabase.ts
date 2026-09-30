import fs from 'fs';
import { supabaseAdmin } from '../server/supabase.js';

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim().replace(/^"|"$/g, ''));
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim().replace(/^"|"$/g, ''));
  return result;
}

function parseMemberDetails(str: string) {
  if (!str || str === 'N/A' || str.trim() === '') return null;
  const match = str.match(/^(.*?)(?:\s*\((.*?)\))?$/);
  if (!match) return { name: str, phone: '' };
  return {
    name: match[1].trim(),
    phone: (match[2] || '').trim(),
  };
}

async function fastBatchSync() {
  console.log('⚡ Starting Fast Batch Sync to Supabase...');

  // 1. Read CSV
  const csvContent = fs.readFileSync('./data/live_registrations.csv', 'utf-8');
  const csvLines = csvContent.split('\n').map((l) => l.trim()).filter(Boolean);

  // 2. Read JSON
  const jsonRaw = fs.readFileSync('./data/symposium_db.json', 'utf-8');
  const jsonDb = JSON.parse(jsonRaw);

  const { data: eventsList } = await supabaseAdmin.from('events').select('id, code, name');
  const eventCodeMap = new Map<string, string>();
  for (const e of eventsList || []) {
    if (e.code) eventCodeMap.set(e.code.toLowerCase(), e.id);
    if (e.name) eventCodeMap.set(e.name.toLowerCase(), e.id);
  }

  const regMap = new Map<string, any>();

  // Parse CSV rows
  for (let i = 1; i < csvLines.length; i++) {
    const cols = parseCsvLine(csvLines[i]);
    if (cols.length < 15) continue;

    const [
      regCode,
      timestamp,
      trackCategory,
      registeredEvents,
      leaderName,
      leaderEmail,
      leaderMobile,
      collegeName,
      department,
      year,
      teamSizeStr,
      member2Str,
      member3Str,
      member4Str,
      totalFeeStr,
      paymentMethodStr,
      paymentStatusStr,
      paymentRef,
      paymentProof,
      attendanceStr,
    ] = cols;

    if (!regCode.startsWith('EV26-')) continue;

    const isWorkshop = trackCategory.toLowerCase().includes('workshop');
    const dbRegType = isWorkshop ? 'individual' : 'team';
    const dbPayStatus = paymentStatusStr.toUpperCase() === 'PAID' ? 'paid' : 'pending_verification';
    const dbPayMethod = paymentMethodStr.toLowerCase() === 'razorpay' ? 'razorpay' : 'upi';
    const amount = parseFloat(totalFeeStr) || (isWorkshop ? 300 : 500);

    const parts: any[] = [];
    if (leaderName) {
      parts.push({
        full_name: leaderName,
        email: leaderEmail || '',
        phone: leaderMobile || '',
        college: collegeName || '',
        department: department || '',
        year_of_study: year || '',
        role: 'team_leader',
      });
    }

    for (const mStr of [member2Str, member3Str, member4Str]) {
      const parsedM = parseMemberDetails(mStr);
      if (parsedM) {
        parts.push({
          full_name: parsedM.name,
          email: '',
          phone: parsedM.phone,
          college: collegeName || '',
          department: department || '',
          year_of_study: year || '',
          role: 'member',
        });
      }
    }

    regMap.set(regCode, {
      regCode,
      dbRegType,
      dbPayMethod,
      dbPayStatus,
      amount,
      proofUrl: paymentProof && paymentProof !== 'N/A' ? paymentProof : null,
      paymentRef: paymentRef !== 'N/A' ? paymentRef : null,
      attendanceMarked: attendanceStr.toUpperCase() === 'PRESENT',
      created_at: new Date().toISOString(),
      participants: parts,
      registeredEvents,
    });
  }

  // Merge JSON regs
  for (const jReg of jsonDb.registrations || []) {
    const code = jReg.id;
    if (code && !regMap.has(code)) {
      const isWorkshop = jReg.registrationType === 'workshop';
      const partsList =
        Array.isArray(jReg.participants) && jReg.participants.length > 0
          ? jReg.participants.map((p: any, idx: number) => ({
              full_name: p.fullName || p.full_name || 'Attendee',
              email: p.email || '',
              phone: p.phone || '',
              college: p.college || '',
              department: p.department || '',
              year_of_study: p.year || p.year_of_study || '',
              role: idx === 0 ? 'team_leader' : 'member',
            }))
          : [
              {
                full_name: jReg.teamLeader?.fullName || 'Attendee',
                email: jReg.teamLeader?.email || '',
                phone: jReg.teamLeader?.phone || '',
                college: jReg.teamLeader?.college || '',
                department: jReg.teamLeader?.department || '',
                year_of_study: jReg.teamLeader?.year || '',
                role: 'team_leader',
              },
            ];

      regMap.set(code, {
        regCode: code,
        dbRegType: isWorkshop ? 'individual' : 'team',
        dbPayMethod: (jReg.paymentMethod || 'upi').toLowerCase() === 'razorpay' ? 'razorpay' : 'upi',
        dbPayStatus: (jReg.paymentStatus || 'pending_verification').toLowerCase() === 'paid' ? 'paid' : 'pending_verification',
        amount: jReg.totalAmount || (isWorkshop ? 300 : 500),
        proofUrl: jReg.paymentProofUrl || null,
        paymentRef: jReg.upiReference || jReg.paymentId || null,
        attendanceMarked: Boolean(jReg.attendanceMarked),
        created_at: jReg.createdAt || new Date().toISOString(),
        participants: partsList,
        registeredEvents: jReg.eventsText || '',
      });
    }
  }

  const regRecords = Array.from(regMap.values());
  const totalAttendees = regRecords.reduce((sum, r) => sum + r.participants.length, 0);

  console.log(`📊 Total Registrations to Sync: ${regRecords.length}`);
  console.log(`👥 Total Attendees to Sync: ${totalAttendees}`);

  // Step A: Upsert All Registrations
  const regPayloads = regRecords.map((r) => ({
    registration_code: r.regCode,
    registration_type: r.dbRegType,
    payment_method: r.dbPayMethod,
    payment_status: r.dbPayStatus,
    total_amount: r.amount,
    currency: 'INR',
    attendance_marked: r.attendanceMarked,
    updated_at: new Date().toISOString(),
  }));

  const { data: upsertedRegs, error: rErr } = await supabaseAdmin
    .from('registrations')
    .upsert(regPayloads, { onConflict: 'registration_code' })
    .select('id, registration_code');

  if (rErr) throw rErr;

  const codeToUuidMap = new Map<string, string>();
  for (const r of upsertedRegs || []) {
    codeToUuidMap.set(r.registration_code, r.id);
  }

  // Step B: Upsert Payments
  for (const r of regRecords) {
    const uuid = codeToUuidMap.get(r.regCode);
    if (!uuid) continue;

    const { data: pay } = await supabaseAdmin.from('payments').select('id').eq('registration_id', uuid).maybeSingle();
    if (pay) {
      await supabaseAdmin.from('payments').update({
        method: r.dbPayMethod,
        status: r.dbPayStatus,
        amount: r.amount,
        upi_reference: r.paymentRef,
        payment_proof_url: r.proofUrl,
        updated_at: new Date().toISOString(),
      }).eq('id', pay.id);
    } else {
      await supabaseAdmin.from('payments').insert({
        registration_id: uuid,
        method: r.dbPayMethod,
        status: r.dbPayStatus,
        amount: r.amount,
        upi_reference: r.paymentRef,
        payment_proof_url: r.proofUrl,
        updated_at: new Date().toISOString(),
      });
    }
  }

  // Step C: Clear existing junctions & participants for all reg UUIDs
  const allRegUuids = Array.from(codeToUuidMap.values());
  const { data: juncs } = await supabaseAdmin.from('registration_participants').select('participant_id').in('registration_id', allRegUuids);
  const partIdsToDelete = (juncs || []).map((j) => j.participant_id);

  await supabaseAdmin.from('registration_participants').delete().in('registration_id', allRegUuids);
  if (partIdsToDelete.length > 0) {
    await supabaseAdmin.from('participants').delete().in('id', partIdsToDelete);
  }

  // Step D: Batch Insert Participants & Junctions
  const partPayloads: any[] = [];
  const partMeta: { regUuid: string; role: string }[] = [];

  for (const r of regRecords) {
    const uuid = codeToUuidMap.get(r.regCode);
    if (!uuid) continue;

    for (const p of r.participants) {
      partPayloads.push({
        full_name: p.full_name,
        email: p.email,
        phone: p.phone,
        college: p.college,
        department: p.department,
        year_of_study: p.year_of_study,
      });
      partMeta.push({
        regUuid: uuid,
        role: p.role,
      });
    }
  }

  const { data: insertedParts, error: pErr } = await supabaseAdmin
    .from('participants')
    .insert(partPayloads)
    .select('id');

  if (pErr) throw pErr;

  const juncPayloads = (insertedParts || []).map((p, idx) => ({
    registration_id: partMeta[idx].regUuid,
    participant_id: p.id,
    role: partMeta[idx].role,
  }));

  const { error: jErr } = await supabaseAdmin.from('registration_participants').insert(juncPayloads);
  if (jErr) throw jErr;

  // Step E: Sync Registration Events
  await supabaseAdmin.from('registration_events').delete().in('registration_id', allRegUuids);

  const regEventPayloads: any[] = [];
  for (const r of regRecords) {
    const uuid = codeToUuidMap.get(r.regCode);
    if (!uuid) continue;

    const eventNames = r.registeredEvents
      .split(',')
      .map((s: string) => s.trim().toLowerCase())
      .filter(Boolean);

    for (const eName of eventNames) {
      const cleanName = eName.replace(/^(ws-|tech-|non-)/i, '').trim().toLowerCase();
      let eventUuid = eventCodeMap.get(cleanName);
      if (!eventUuid) {
        for (const [k, v] of eventCodeMap.entries()) {
          if (k.includes(cleanName) || cleanName.includes(k)) {
            eventUuid = v;
            break;
          }
        }
      }
      if (eventUuid) {
        regEventPayloads.push({
          registration_id: uuid,
          event_id: eventUuid,
          price_at_registration: Math.round(r.amount / r.participants.length),
        });
      }
    }
  }

  if (regEventPayloads.length > 0) {
    await supabaseAdmin.from('registration_events').insert(regEventPayloads);
  }

  console.log(`✅ FAST BATCH SYNC COMPLETED SUCCESSFULLY!`);
  console.log(`✅ Synced Registrations: ${regRecords.length}`);
  console.log(`✅ Synced Attendees: ${insertedParts?.length}`);
}

fastBatchSync().catch((e) => console.error('❌ Fast Batch Sync Error:', e));
