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

async function fullSync() {
  console.log('Starting full clean sync to Supabase...');

  const csvContent = fs.readFileSync('./data/live_registrations.csv', 'utf-8');
  const csvLines = csvContent.split('\n').map((l) => l.trim()).filter(Boolean);

  const jsonRaw = fs.readFileSync('./data/symposium_db.json', 'utf-8');
  const jsonDb = JSON.parse(jsonRaw);
  const jsonRegsMap = new Map();
  for (const r of jsonDb.registrations || []) {
    if (r.id) jsonRegsMap.set(r.id, r);
  }

  const { data: eventsList } = await supabaseAdmin.from('events').select('id, code, name');
  const eventCodeMap = new Map<string, string>();
  for (const e of eventsList || []) {
    if (e.code) eventCodeMap.set(e.code.toLowerCase(), e.id);
    if (e.name) eventCodeMap.set(e.name.toLowerCase(), e.id);
  }

  let totalParsedAttendees = 0;
  const regRecords: any[] = [];

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
        role: 'leader',
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

    totalParsedAttendees += parts.length;

    regRecords.push({
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

  // Check if jsonDb has any registrations missing from CSV
  for (const [code, jReg] of jsonRegsMap.entries()) {
    if (!regRecords.some((r) => r.regCode === code)) {
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
              role: idx === 0 ? 'leader' : 'member',
            }))
          : [
              {
                full_name: jReg.teamLeader?.fullName || 'Attendee',
                email: jReg.teamLeader?.email || '',
                phone: jReg.teamLeader?.phone || '',
                college: jReg.teamLeader?.college || '',
                department: jReg.teamLeader?.department || '',
                year_of_study: jReg.teamLeader?.year || '',
                role: 'leader',
              },
            ];

      totalParsedAttendees += partsList.length;

      regRecords.push({
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

  console.log(`Total Registrations to sync: ${regRecords.length}, Total Attendees parsed: ${totalParsedAttendees}`);

  let currentRegCount = 0;
  let currentPartCount = 0;

  for (const reg of regRecords) {
    // A. Upsert registration
    const { data: regRow, error: regErr } = await supabaseAdmin
      .from('registrations')
      .upsert(
        {
          registration_code: reg.regCode,
          registration_type: reg.dbRegType,
          payment_method: reg.dbPayMethod,
          payment_status: reg.dbPayStatus,
          total_amount: reg.amount,
          currency: 'INR',
          attendance_marked: reg.attendanceMarked,
          created_at: reg.created_at,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'registration_code' }
      )
      .select('id')
      .single();

    if (regErr || !regRow) {
      console.error(`Error upserting registration ${reg.regCode}:`, regErr?.message);
      continue;
    }

    currentRegCount++;
    const regUuid = regRow.id;

    // B. Upsert Payment
    const { data: existingPay } = await supabaseAdmin
      .from('payments')
      .select('id')
      .eq('registration_id', regUuid)
      .maybeSingle();

    if (existingPay) {
      await supabaseAdmin
        .from('payments')
        .update({
          method: reg.dbPayMethod,
          status: reg.dbPayStatus,
          amount: reg.amount,
          upi_reference: reg.paymentRef,
          payment_proof_url: reg.proofUrl,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingPay.id);
    } else {
      await supabaseAdmin.from('payments').insert({
        registration_id: regUuid,
        method: reg.dbPayMethod,
        status: reg.dbPayStatus,
        amount: reg.amount,
        upi_reference: reg.paymentRef,
        payment_proof_url: reg.proofUrl,
        updated_at: new Date().toISOString(),
      });
    }

    // C. Clean and Insert Participants
    const { data: oldJuncs } = await supabaseAdmin
      .from('registration_participants')
      .select('participant_id')
      .eq('registration_id', regUuid);

    const oldPartIds = (oldJuncs || []).map((j: any) => j.participant_id);
    await supabaseAdmin.from('registration_participants').delete().eq('registration_id', regUuid);
    if (oldPartIds.length > 0) {
      await supabaseAdmin.from('participants').delete().in('id', oldPartIds);
    }

    for (const p of reg.participants) {
      const { data: partRow, error: pErr } = await supabaseAdmin
        .from('participants')
        .insert({
          full_name: p.full_name,
          email: p.email,
          phone: p.phone,
          college: p.college,
          department: p.department,
          year_of_study: p.year_of_study,
        })
        .select('id')
        .single();

      if (pErr || !partRow) {
        console.error(`Error inserting participant ${p.full_name} for ${reg.regCode}:`, pErr?.message);
        continue;
      }

      await supabaseAdmin.from('registration_participants').insert({
        registration_id: regUuid,
        participant_id: partRow.id,
        role: p.role,
      });

      currentPartCount++;
    }

    // D. Insert Registration Events
    await supabaseAdmin.from('registration_events').delete().eq('registration_id', regUuid);
    const eventNames = reg.registeredEvents
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
        await supabaseAdmin.from('registration_events').insert({
          registration_id: regUuid,
          event_id: eventUuid,
          price_at_registration: Math.round(reg.amount / reg.participants.length),
        });
      }
    }
  }

  console.log(`FULL SYNC COMPLETED SUCCESSFULLY!`);
  console.log(`Synced Registrations in Supabase: ${currentRegCount}`);
  console.log(`Synced Participants in Supabase: ${currentPartCount}`);
}

fullSync();
