import 'dotenv/config';
import { supabaseAdmin } from '../server/supabase.js';
import * as repository from '../server/repository.js';
import { formatGoogleSheetPayload } from '../server/googleSheet.js';

async function main() {
  console.log('--- VERIFYING SUPABASE REGISTRATIONS ---');

  // Test 1: Direct Supabase count
  const { count: regCount, error: regErr } = await supabaseAdmin
    .from('registrations')
    .select('*', { count: 'exact', head: true });

  console.log(`Backend query: supabase.from('registrations').select('*', { count: 'exact' }) -> count = ${regCount}`);
  if (regErr) console.error('Error:', regErr);

  // Test 2: Repository listRegistrations
  const allRegs = await repository.listRegistrations();
  console.log(`Repository listRegistrations count: ${allRegs.length}`);

  // Test 3: Check proof URLs
  let withProof = 0;
  let withoutProof = 0;
  for (const r of allRegs) {
    if (r.paymentProofUrl && r.paymentProofUrl !== 'HAS_PROOF' && r.paymentProofUrl !== 'N/A') {
      withProof++;
    } else {
      withoutProof++;
    }
  }
  console.log(`Registrations with valid paymentProofUrl: ${withProof} / ${allRegs.length}`);

  // Sample 3 records with proof
  const sampleProof = allRegs.filter(r => r.paymentProofUrl && r.paymentProofUrl.startsWith('http')).slice(0, 3);
  for (const s of sampleProof) {
    console.log(`Sample: ${s.id} -> ${s.paymentProofUrl}`);
    const sheetPayload = formatGoogleSheetPayload(s);
    console.log(`   Google Sheet payload paymentProof: ${sheetPayload.paymentProof}`);
    console.log(`   Google Sheet payload paymentProofUrl: ${sheetPayload.paymentProofUrl}`);
  }

  // Test 4: Repository Stats
  const stats = await repository.getRegistrationStats();
  console.log('Stats:', {
    totalRegistrations: stats.totalRegistrations,
    totalParticipants: stats.totalParticipants,
    workshopCount: stats.workshopCount,
    technicalCount: stats.technicalCount,
    paidCount: stats.paidCount,
    pendingCount: stats.pendingCount
  });
}

main().catch(console.error);
