import 'dotenv/config';
import fs from 'fs';
import { supabaseAdmin } from '../server/supabase.js';

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      result.push(cur.trim().replace(/^"|"$/g, ''));
      cur = '';
    } else {
      cur += c;
    }
  }
  result.push(cur.trim().replace(/^"|"$/g, ''));
  return result;
}

function parseMemberDetails(str: string, defaultCollege = '', defaultDept = '', defaultYear = '') {
  if (!str || str === 'N/A' || str.trim() === '') return null;
  const match = str.match(/^(.*?)(?:\s*\((.*?)\))?$/);
  if (!match) return { name: str, phone: '', college: defaultCollege, department: defaultDept, year: defaultYear };
  return {
    name: match[1].trim(),
    phone: (match[2] || '').trim(),
    college: defaultCollege,
    department: defaultDept,
    year: defaultYear,
  };
}

function parseCsvDateToIso(str: string): string {
  if (!str) return new Date().toISOString();
  let clean = str.trim().replace(/^"|"$/g, '');

  // Format e.g. "18/9/2026, 11:07:09 am" or "10/1/2026, 1:19:11 PM"
  const m = clean.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:,\s*(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?\s*(am|pm)?)?/i);
  if (m) {
    let [, p1, p2, yearStr, hStr = '0', mStr = '0', sStr = '0', ampm] = m;
    let n1 = parseInt(p1, 10);
    let n2 = parseInt(p2, 10);
    let year = parseInt(yearStr, 10);
    let hours = parseInt(hStr, 10);
    let minutes = parseInt(mStr, 10);
    let seconds = parseInt(sStr, 10);

    if (ampm) {
      if (ampm.toLowerCase() === 'pm' && hours < 12) hours += 12;
      if (ampm.toLowerCase() === 'am' && hours === 12) hours = 0;
    }

    // Determine Day and Month:
    // Dates are in Sep/Oct 2026:
    // If n1 > 12, n1 is day, n2 is month
    // If n2 === 9 || n2 === 10, n2 is month, n1 is day
    // If n1 === 9 || n1 === 10, n1 could be month or day
    let day = n1;
    let month = n2;
    if (n1 > 12) {
      day = n1;
      month = n2;
    } else if (n2 === 9 || n2 === 10) {
      day = n1;
      month = n2;
    } else if (n1 === 10 && n2 <= 2) {
      // e.g. 10/1/2026 is Oct 1st
      month = 10;
      day = n2;
    } else if (n1 === 9) {
      month = 9;
      day = n2;
    }

    const d = new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds));
    if (!isNaN(d.getTime())) {
      return d.toISOString();
    }
  }

  const fallback = new Date(clean);
  if (!isNaN(fallback.getTime())) return fallback.toISOString();
  return new Date().toISOString();
}

async function runSync() {
  console.log('🔄 Starting Synchronous Alignment of CSV to Supabase...');

  const csvText = fs.readFileSync('data/live_registrations.csv', 'utf8');
  const lines = csvText.split('\n').filter(l => l.trim().length > 0);
  const rows = lines.slice(1).map(l => parseCSVLine(l));

  console.log(`CSV Rows to process: ${rows.length}`);

  // Fetch events map
  const { data: dbEvents } = await supabaseAdmin.from('events').select('id, code, name');
  const eventCodeMap = new Map<string, string>();
  for (const e of dbEvents || []) {
    if (e.code) eventCodeMap.set(e.code.toLowerCase(), e.id);
    if (e.name) eventCodeMap.set(e.name.toLowerCase(), e.id);
  }

  // 1. Delete extra records in DB that are not in the CSV
  const csvCodes = new Set<string>();
  const parsedRecords: any[] = [];

  for (const cols of rows) {
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
      lastUpdated
    ] = cols;

    if (!regCode.startsWith('EV26-')) continue;
    csvCodes.add(regCode);

    const isWorkshop = trackCategory.toLowerCase().includes('workshop') ||
      trackCategory.toLowerCase().includes('individual') ||
      registeredEvents.toLowerCase().includes('workshop') ||
      registeredEvents.toLowerCase().includes('silicon') ||
      registeredEvents.toLowerCase().includes('embedded') ||
      registeredEvents.toLowerCase().includes('virtual instrument');

    const dbRegType = isWorkshop ? 'individual' : 'team';
    const dbPayStatus = (paymentStatusStr || 'PAID').toUpperCase() === 'PAID' ? 'paid' : 'pending_verification';
    const amount = parseFloat(totalFeeStr) || (isWorkshop ? 300 : 500);
    const createdAt = parseCsvDateToIso(timestamp);
    const updatedAt = parseCsvDateToIso(lastUpdated || timestamp);
    const proofUrl = paymentProof && paymentProof !== 'N/A' && paymentProof.trim() !== '' ? paymentProof.trim() : null;
    const ref = paymentRef && paymentRef !== 'N/A' && paymentRef.trim() !== '' ? paymentRef.trim() : null;
    const attendanceMarked = (attendanceStr || '').toUpperCase() === 'PRESENT';

    const participants: any[] = [];
    if (leaderName && leaderName !== 'N/A') {
      participants.push({
        full_name: leaderName,
        email: leaderEmail || '',
        phone: leaderMobile || '',
        college: collegeName || '',
        department: department || '',
        year_of_study: year || '',
        role: 'team_leader'
      });
    }

    for (const mStr of [member2Str, member3Str, member4Str]) {
      const parsedM = parseMemberDetails(mStr, collegeName, department, year);
      if (parsedM && parsedM.name && parsedM.name !== 'N/A') {
        participants.push({
          full_name: parsedM.name,
          email: '',
          phone: parsedM.phone,
          college: parsedM.college,
          department: parsedM.department,
          year_of_study: parsedM.year,
          role: 'member'
        });
      }
    }

    parsedRecords.push({
      regCode,
      dbRegType,
      amount,
      dbPayStatus,
      createdAt,
      updatedAt,
      proofUrl,
      paymentRef: ref,
      attendanceMarked,
      participants,
      registeredEvents
    });
  }

  // Remove non-CSV registrations from DB
  const { data: allDbRegs } = await supabaseAdmin.from('registrations').select('id, registration_code');
  const extraRegs = (allDbRegs || []).filter(r => !csvCodes.has(r.registration_code));
  if (extraRegs.length > 0) {
    console.log(`Removing ${extraRegs.length} extra test records from DB:`, extraRegs.map(r => r.registration_code));
    const extraIds = extraRegs.map(r => r.id);
    await supabaseAdmin.from('registration_participants').delete().in('registration_id', extraIds);
    await supabaseAdmin.from('registration_events').delete().in('registration_id', extraIds);
    await supabaseAdmin.from('payments').delete().in('registration_id', extraIds);
    await supabaseAdmin.from('registrations').delete().in('id', extraIds);
  }

  // Step 2: Upsert all 82 registrations
  console.log(`Upserting ${parsedRecords.length} records into 'registrations'...`);
  const regUpserts = parsedRecords.map(r => ({
    registration_code: r.regCode,
    registration_type: r.dbRegType,
    total_amount: r.amount,
    payment_method: 'upi',
    payment_status: r.dbPayStatus,
    currency: 'INR',
    attendance_marked: r.attendanceMarked,
    created_at: r.createdAt,
    updated_at: r.updatedAt
  }));

  const { data: upsertedRegs, error: regErr } = await supabaseAdmin
    .from('registrations')
    .upsert(regUpserts, { onConflict: 'registration_code' })
    .select('id, registration_code');

  if (regErr) {
    console.error('Error upserting registrations:', regErr);
    return;
  }

  const codeToUuid = new Map<string, string>();
  upsertedRegs?.forEach(r => codeToUuid.set(r.registration_code, r.id));
  const allRegUuids = Array.from(codeToUuid.values());

  // Step 3: Upsert Payments with proof URLs
  console.log('Upserting payments with proof URLs...');
  for (const r of parsedRecords) {
    const uuid = codeToUuid.get(r.regCode);
    if (!uuid) continue;

    const { data: existingPay } = await supabaseAdmin.from('payments').select('id').eq('registration_id', uuid).maybeSingle();
    if (existingPay?.id) {
      await supabaseAdmin.from('payments').update({
        method: 'upi',
        status: r.dbPayStatus,
        amount: r.amount,
        upi_reference: r.paymentRef,
        payment_proof_url: r.proofUrl,
        updated_at: r.updatedAt
      }).eq('id', existingPay.id);
    } else {
      await supabaseAdmin.from('payments').insert({
        registration_id: uuid,
        method: 'upi',
        status: r.dbPayStatus,
        amount: r.amount,
        upi_reference: r.paymentRef,
        payment_proof_url: r.proofUrl,
        created_at: r.createdAt,
        updated_at: r.updatedAt
      });
    }
  }

  // Step 4: Clear existing junction & participants, re-insert cleanly
  console.log('Syncing participants and junctions...');
  const { data: oldJuncs } = await supabaseAdmin.from('registration_participants').select('participant_id').in('registration_id', allRegUuids);
  const oldPartIds = (oldJuncs || []).map(j => j.participant_id);

  await supabaseAdmin.from('registration_participants').delete().in('registration_id', allRegUuids);
  if (oldPartIds.length > 0) {
    await supabaseAdmin.from('participants').delete().in('id', oldPartIds);
  }

  const partPayloads: any[] = [];
  const partMeta: { regUuid: string; role: string }[] = [];

  for (const r of parsedRecords) {
    const uuid = codeToUuid.get(r.regCode);
    if (!uuid) continue;

    for (const p of r.participants) {
      partPayloads.push({
        full_name: p.full_name,
        email: p.email,
        phone: p.phone,
        college: p.college,
        department: p.department,
        year_of_study: p.year_of_study,
        created_at: r.createdAt
      });
      partMeta.push({
        regUuid: uuid,
        role: p.role
      });
    }
  }

  // Batch insert participants in chunks of 50
  const insertedPartIds: string[] = [];
  const chunkSize = 50;
  for (let i = 0; i < partPayloads.length; i += chunkSize) {
    const chunk = partPayloads.slice(i, i + chunkSize);
    const { data: chunkParts, error: chunkErr } = await supabaseAdmin
      .from('participants')
      .insert(chunk)
      .select('id');
    if (chunkErr) {
      console.error('Error inserting participants chunk:', chunkErr);
      throw chunkErr;
    }
    chunkParts?.forEach(p => insertedPartIds.push(p.id));
  }

  const juncPayloads = insertedPartIds.map((pId, idx) => ({
    registration_id: partMeta[idx].regUuid,
    participant_id: pId,
    role: partMeta[idx].role
  }));

  for (let i = 0; i < juncPayloads.length; i += chunkSize) {
    const chunk = juncPayloads.slice(i, i + chunkSize);
    await supabaseAdmin.from('registration_participants').insert(chunk);
  }

  // Step 5: Sync registration events
  console.log('Syncing registration events...');
  await supabaseAdmin.from('registration_events').delete().in('registration_id', allRegUuids);

  const regEventPayloads: any[] = [];
  for (const r of parsedRecords) {
    const uuid = codeToUuid.get(r.regCode);
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
          price_at_registration: Math.round(r.amount / Math.max(1, r.participants.length)),
          created_at: r.createdAt
        });
      }
    }
  }

  for (let i = 0; i < regEventPayloads.length; i += chunkSize) {
    const chunk = regEventPayloads.slice(i, i + chunkSize);
    await supabaseAdmin.from('registration_events').insert(chunk);
  }

  // Verify final count
  const { count: finalCount } = await supabaseAdmin.from('registrations').select('*', { count: 'exact', head: true });
  const { count: finalPayments } = await supabaseAdmin.from('payments').select('*', { count: 'exact', head: true });
  const { count: finalParts } = await supabaseAdmin.from('participants').select('*', { count: 'exact', head: true });

  console.log(`✅ SYNC COMPLETE!`);
  console.log(`📊 Final Registrations in DB: ${finalCount} (Expected: ${parsedRecords.length})`);
  console.log(`💳 Final Payments in DB: ${finalPayments}`);
  console.log(`👥 Final Participants in DB: ${finalParts}`);
}

runSync().catch(console.error);
