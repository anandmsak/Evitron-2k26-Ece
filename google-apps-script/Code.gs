/**
 * EVITRON 2K26 - National Level Technical Symposium & Workshop
 * Department of Electronics and Communication Engineering
 * Mahendra Engineering College (Autonomous)
 * 
 * High-Performance, Concurrency-Hardened Google Apps Script Webhook
 * Built to withstand 50+ simultaneous registrations and instant Event-Day QR Check-Ins
 * without lag, row-collapsing, or column-shifting.
 */

const SHEET_NAME = 'Registrations';

const STANDARD_HEADERS = [
  'Registration ID',
  'Timestamp',
  'Track / Category',
  'Registered Events',
  'Team Leader Name',
  'Leader Email',
  'Leader Mobile',
  'College Name',
  'Department',
  'Year',
  'Team Size',
  'Member 2 Details',
  'Member 3 Details',
  'Member 4 Details',
  'Total Fee (INR)',
  'Payment Method',
  'Payment Status',
  'Payment Ref / UTR',
  'Payment Proof / Link',
  'Attendance Status',
  'Last Updated'
];

/**
 * Extracts strictly clean workshop title:
 * - "silicon 2gds"
 * - "Embedded System"
 * - "Virtual instrument"
 */
function cleanWorkshopTitle(raw) {
  if (!raw) return '';
  const s = String(raw).toLowerCase();
  if (s.indexOf('silicon') !== -1 || s.indexOf('gds') !== -1 || s.indexOf('cadence') !== -1 || s.indexOf('vlsi') !== -1) {
    return 'silicon 2gds';
  }
  if (s.indexOf('embedded') !== -1 || s.indexOf('microcontroller') !== -1 || s.indexOf('arm') !== -1) {
    return 'Embedded System';
  }
  if (s.indexOf('instrumentation') !== -1 || s.indexOf('labview') !== -1 || s.indexOf('virtual') !== -1 || s.indexOf('daq') !== -1) {
    return 'Virtual instrument';
  }
  return String(raw).trim();
}

/**
 * Clean short event names without lengthy descriptions or taglines
 */
function cleanEventShortName(raw) {
  if (!raw) return '';
  const s = String(raw).toLowerCase().trim();
  if (s.indexOf('techpaper') !== -1 || s.indexOf('paper presentation') !== -1 || s.indexOf('paper') !== -1) return 'techpaper';
  if (s.indexOf('tracktron') !== -1 || s.indexOf('tractron') !== -1 || s.indexOf('line follower') !== -1 || s.indexOf('robot') !== -1) return 'tractron';
  if (s.indexOf('evolvex') !== -1 || s.indexOf('project') !== -1) return 'evolvex';
  if (s.indexOf('silicon') !== -1 || s.indexOf('gds') !== -1 || s.indexOf('cadence') !== -1 || s.indexOf('vlsi') !== -1) return 'silicon 2gds';
  if (s.indexOf('embedded') !== -1 || s.indexOf('microcontroller') !== -1 || s.indexOf('arm') !== -1) return 'Embedded System';
  if (s.indexOf('instrumentation') !== -1 || s.indexOf('labview') !== -1 || s.indexOf('virtual') !== -1 || s.indexOf('daq') !== -1) return 'Virtual instrument';
  if (s.indexOf('mind') !== -1 || s.indexOf('maze') !== -1) return 'mind maze';
  if (s.indexOf('prompt') !== -1) return 'promptify';
  if (s.indexOf('mem') !== -1) return 'memix';
  if (s.indexOf('detective') !== -1 || s.indexOf('404') !== -1) return 'detective 404';
  return String(raw).replace(/^(tech|ws|non|nontech)-/i, '').trim();
}

/**
 * Parses timestamps safely across Indian and International regional formats
 */
function parseSheetDateToISO(cellValue) {
  if (!cellValue) return new Date().toISOString();
  if (cellValue instanceof Date && !isNaN(cellValue.getTime())) {
    return cellValue.toISOString();
  }

  const str = String(cellValue).trim();
  const direct = new Date(str);
  if (!isNaN(direct.getTime())) {
    return direct.toISOString();
  }

  // Handle DD/MM/YYYY, HH:MM:SS format
  const match = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:,\s*(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?\s*(am|pm)?)?/i);
  if (match) {
    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1;
    const year = parseInt(match[3], 10);
    let hours = match[4] ? parseInt(match[4], 10) : 0;
    const minutes = match[5] ? parseInt(match[5], 10) : 0;
    const seconds = match[6] ? parseInt(match[6], 10) : 0;
    const ampm = match[7] ? match[7].toLowerCase() : null;

    if (ampm === 'pm' && hours < 12) hours += 12;
    if (ampm === 'am' && hours === 12) hours = 0;

    const parsed = new Date(year, month, day, hours, minutes, seconds);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  return new Date().toISOString();
}

/**
 * Handle incoming POST requests from the EVITRON 2K26 app server & QR Scanner apps
 */
function doPost(e) {
  if (!e || !e.postData || !e.postData.contents) {
    return ContentService.createTextOutput(
      JSON.stringify({ status: 'error', message: 'No payload data provided.' })
    ).setMimeType(ContentService.MimeType.JSON);
  }

  let data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (parseErr) {
    return ContentService.createTextOutput(
      JSON.stringify({ status: 'error', message: 'Invalid JSON payload.' })
    ).setMimeType(ContentService.MimeType.JSON);
  }

  // Accept regId, id, code, or full scanned QR text
  let rawInputId = String(data.regId || data.id || data.code || data.data || data.qrText || '').trim();
  if (!rawInputId && typeof data === 'string') {
    rawInputId = data.trim();
  }

  // Extract EV26-XXXXXX from whatever text was scanned
  const idMatch = rawInputId.match(/EV26-[A-Z0-9]{6}/i);
  const regId = idMatch ? idMatch[0].toUpperCase() : rawInputId.toUpperCase();

  if (!regId) {
    return ContentService.createTextOutput(
      JSON.stringify({ status: 'error', message: 'Missing Registration ID in payload.' })
    ).setMimeType(ContentService.MimeType.JSON);
  }

  // ========================================================
  // 1. ATTENDANCE SCANNER POST HANDLER
  // ========================================================
  if (
    data.action === 'markAttendance' ||
    data.action === 'attendance' ||
    data.action === 'scan' ||
    data.type === 'attendance' ||
    String(data.attendance || '').toLowerCase() === 'present'
  ) {
    const lock = LockService.getScriptLock();
    if (lock.tryLock(25000)) {
      try {
        const ss = SpreadsheetApp.getActiveSpreadsheet();
        let sheet = ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];
        const rows = sheet.getDataRange().getValues();
        const nowKolkata = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

        for (let r = 1; r < rows.length; r++) {
          if (String(rows[r][0]).trim().toUpperCase() === regId) {
            // Col 20: Attendance Status, Col 21: Last Updated
            sheet.getRange(r + 1, 20).setValue('Present');
            sheet.getRange(r + 1, 21).setValue(nowKolkata);
            SpreadsheetApp.flush();

            return ContentService.createTextOutput(
              JSON.stringify({
                status: 'success',
                message: 'Attendance successfully marked PRESENT for ' + regId,
                regId: regId,
                leaderName: rows[r][4],
                college: rows[r][7],
                track: rows[r][2],
                events: rows[r][3],
                attendance: 'Present',
                updatedAt: nowKolkata
              })
            ).setMimeType(ContentService.MimeType.JSON);
          }
        }

        return ContentService.createTextOutput(
          JSON.stringify({
            status: 'error',
            message: 'Registration ID ' + regId + ' was not found in the sheet.'
          })
        ).setMimeType(ContentService.MimeType.JSON);

      } finally {
        lock.releaseLock();
      }
    } else {
      return ContentService.createTextOutput(
        JSON.stringify({ status: 'error', message: 'Spreadsheet lock busy. Please retry scan.' })
      ).setMimeType(ContentService.MimeType.JSON);
    }
  }

  // ========================================================
  // 2. REGISTRATION DELETION HANDLER
  // ========================================================
  if (data.action === 'delete' || data.isDelete) {
    const lock = LockService.getScriptLock();
    if (lock.tryLock(25000)) {
      try {
        const ss = SpreadsheetApp.getActiveSpreadsheet();
        let sheet = ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];
        const rows = sheet.getDataRange().getValues();
        for (let r = 1; r < rows.length; r++) {
          if (String(rows[r][0]).trim().toUpperCase() === regId) {
            sheet.deleteRow(r + 1);
            return ContentService.createTextOutput(
              JSON.stringify({ status: 'success', action: 'deleted', regId: regId })
            ).setMimeType(ContentService.MimeType.JSON);
          }
        }
      } finally {
        lock.releaseLock();
      }
    }
    return ContentService.createTextOutput(
      JSON.stringify({ status: 'success', action: 'not_found' })
    ).setMimeType(ContentService.MimeType.JSON);
  }

  // ========================================================
  // 3. NEW OR UPDATED REGISTRATION HANDLER
  // ========================================================

  // Drive upload outside lock
  let driveLink = 'N/A';
  if (data.paymentProofData && String(data.paymentProofData).indexOf('data:') === 0) {
    try {
      driveLink = saveFileToDrive(data.paymentProofData, regId + '_Payment_Proof');
    } catch (driveErr) {
      driveLink = 'Upload Failed: ' + driveErr.toString();
    }
  } else if (data.paymentProofData) {
    driveLink = String(data.paymentProofData).trim();
  }

  // Format Event and Track names cleanly
  const isWorkshop = String(data.track || '').toLowerCase().indexOf('workshop') !== -1 ||
    String(data.events || '').toLowerCase().indexOf('workshop') !== -1 ||
    String(data.selectedWorkshopId || '').length > 0;

  let cleanEvents = '';
  let trackLabel = '';

  if (isWorkshop) {
    const rawWs = data.events || data.selectedWorkshopId || 'Embedded System';
    cleanEvents = cleanEventShortName(rawWs);
    trackLabel = 'Workshop';
  } else {
    trackLabel = 'Technical Symposium (' + (data.participantsCount || 1) + ')';
    if (data.events) {
      cleanEvents = String(data.events)
        .split(',')
        .map(function(e) { return cleanEventShortName(e); })
        .filter(Boolean)
        .join(', ');
    } else {
      cleanEvents = 'techpaper';
    }
  }

  const lock = LockService.getScriptLock();
  let lockAcquired = false;
  try {
    lockAcquired = lock.tryLock(25000);
  } catch (err) {
    lockAcquired = false;
  }

  if (!lockAcquired) {
    return ContentService.createTextOutput(
      JSON.stringify({ status: 'error', message: 'Spreadsheet lock busy. Please retry.' })
    ).setMimeType(ContentService.MimeType.JSON);
  }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
    }

    if (sheet.getLastRow() === 0) {
      sheet.appendRow(STANDARD_HEADERS);
      const hRange = sheet.getRange(1, 1, 1, STANDARD_HEADERS.length);
      hRange.setBackground('#B22222');
      hRange.setFontColor('#FFFFFF');
      hRange.setFontWeight('bold');
      sheet.setFrozenRows(1);
    }

    const lastCol = Math.max(sheet.getLastColumn(), STANDARD_HEADERS.length);
    const headerRow = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    const headerMap = {};
    for (let c = 0; c < headerRow.length; c++) {
      const hName = String(headerRow[c] || '').trim().toLowerCase();
      if (hName) headerMap[hName] = c;
    }

    function getColIdx(names, fallbackIdx) {
      for (let i = 0; i < names.length; i++) {
        const key = names[i].toLowerCase();
        if (headerMap[key] !== undefined) return headerMap[key];
      }
      return fallbackIdx;
    }

    const nowKolkata = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

    function formatTimestampValue(rawVal) {
      if (!rawVal || rawVal === 'Invalid Date') return nowKolkata;
      const str = String(rawVal).trim();
      if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}/.test(str)) {
        return str;
      }
      const d = new Date(str);
      if (!isNaN(d.getTime())) {
        return d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
      }
      return nowKolkata;
    }

    const createdAtKolkata = formatTimestampValue(data.timestamp || data.createdAt);

    const fields = [
      { names: ['Registration ID', 'reg id', 'id'], val: regId, defIdx: 0 },
      { names: ['Timestamp', 'date', 'created at'], val: createdAtKolkata, defIdx: 1 },
      { names: ['Track / Category', 'track', 'category'], val: trackLabel, defIdx: 2 },
      { names: ['Registered Events', 'events', 'event'], val: cleanEvents, defIdx: 3 },
      { names: ['Team Leader Name', 'leader name', 'name'], val: data.leaderName || '', defIdx: 4 },
      { names: ['Leader Email', 'email'], val: data.leaderEmail || '', defIdx: 5 },
      { names: ['Leader Mobile', 'mobile', 'phone', 'leader phone'], val: data.leaderPhone ? String(data.leaderPhone) : '', defIdx: 6 },
      { names: ['College Name', 'college'], val: data.college || '', defIdx: 7 },
      { names: ['Department', 'dept'], val: data.department || '', defIdx: 8 },
      { names: ['Year', 'yr'], val: data.year || '', defIdx: 9 },
      { names: ['Team Size', 'participants count', 'team count'], val: data.participantsCount || 1, defIdx: 10 },
      { names: ['Member 2 Details', 'member 2'], val: data.member2 || 'N/A', defIdx: 11 },
      { names: ['Member 3 Details', 'member 3'], val: data.member3 || 'N/A', defIdx: 12 },
      { names: ['Member 4 Details', 'member 4'], val: data.member4 || 'N/A', defIdx: 13 },
      { names: ['Total Fee (INR)', 'amount', 'fee'], val: data.amount || 0, defIdx: 14 },
      { names: ['Payment Method', 'method'], val: String(data.paymentMethod || 'UPI').toUpperCase(), defIdx: 15 },
      { names: ['Payment Status', 'status'], val: String(data.paymentStatus || 'PENDING_VERIFICATION').toUpperCase(), defIdx: 16 },
      { names: ['Payment Ref / UTR', 'utr', 'ref id'], val: data.paymentRef || '', defIdx: 17 },
      { names: ['Payment Proof / Link', 'drive link', 'proof'], val: driveLink, defIdx: 18 },
      { names: ['Attendance Status', 'attendance'], val: data.attendance || 'Absent', defIdx: 19 },
      { names: ['Last Updated', 'updated at'], val: nowKolkata, defIdx: 20 }
    ];

    const rowValues = new Array(headerRow.length).fill('');
    for (let f = 0; f < fields.length; f++) {
      const idx = getColIdx(fields[f].names, fields[f].defIdx);
      if (idx < rowValues.length) {
        rowValues[idx] = fields[f].val;
      }
    }

    const lastRow = sheet.getLastRow();
    let existingRowIndex = -1;
    const idColIdx = getColIdx(['Registration ID', 'reg id', 'id'], 0);

    if (lastRow > 1) {
      const idValues = sheet.getRange(2, idColIdx + 1, lastRow - 1, 1).getValues();
      for (let i = 0; i < idValues.length; i++) {
        if (String(idValues[i][0]).trim() === regId) {
          existingRowIndex = i + 2;
          break;
        }
      }
    }

    if (existingRowIndex > 0) {
      const existingValues = sheet.getRange(existingRowIndex, 1, 1, rowValues.length).getValues()[0];
      for (let c = 0; c < rowValues.length; c++) {
        const incomingVal = rowValues[c];
        if (incomingVal === '' || incomingVal === null || incomingVal === undefined) {
          rowValues[c] = existingValues[c];
        }
      }
      sheet.getRange(existingRowIndex, 1, 1, rowValues.length).setValues([rowValues]);
    } else {
      sheet.appendRow(rowValues);
    }

    SpreadsheetApp.flush();

    return ContentService.createTextOutput(
      JSON.stringify({
        status: 'success',
        regId: regId,
        paymentProofUrl: driveLink,
        action: existingRowIndex > 0 ? 'updated' : 'inserted',
        row: existingRowIndex > 0 ? existingRowIndex : sheet.getLastRow()
      })
    ).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ status: 'error', error: err.toString() })
    ).setMimeType(ContentService.MimeType.JSON);
  } finally {
    try {
      SpreadsheetApp.flush();
    } catch (fErr) {}
    lock.releaseLock();
  }
}

/**
 * Handle GET requests:
 * 1. Mark attendance via direct URL scan
 * 2. Retrieve registration list (?action=getRegistrations)
 * 3. Health check
 */
function doGet(e) {
  const params = (e && e.parameter) ? e.parameter : {};

  // ========================================================
  // 1. ATTENDANCE SCAN VIA SIMPLE GET URL
  // Example: .../exec?action=markAttendance&regId=EV26-A1B2C3
  // OR simply: .../exec?regId=EV26-A1B2C3
  // ========================================================
  const rawId = String(params.regId || params.id || params.code || params.data || '').trim();
  const isAttendanceReq = params.action === 'markAttendance' || params.action === 'attendance' || params.action === 'scan' || rawId.length > 0;

  if (isAttendanceReq && rawId) {
    const match = rawId.match(/EV26-[A-Z0-9]{6}/i);
    const targetId = match ? match[0].toUpperCase() : rawId.toUpperCase();

    const lock = LockService.getScriptLock();
    if (lock.tryLock(25000)) {
      try {
        const ss = SpreadsheetApp.getActiveSpreadsheet();
        let sheet = ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];
        const rows = sheet.getDataRange().getValues();
        const nowKolkata = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

        for (let r = 1; r < rows.length; r++) {
          if (String(rows[r][0]).trim().toUpperCase() === targetId) {
            sheet.getRange(r + 1, 20).setValue('Present'); // Col 20
            sheet.getRange(r + 1, 21).setValue(nowKolkata); // Col 21
            SpreadsheetApp.flush();

            return ContentService.createTextOutput(
              JSON.stringify({
                status: 'success',
                message: 'Attendance marked PRESENT',
                regId: targetId,
                leaderName: rows[r][4],
                college: rows[r][7],
                track: rows[r][2],
                events: rows[r][3],
                attendance: 'Present',
                updatedAt: nowKolkata
              })
            ).setMimeType(ContentService.MimeType.JSON);
          }
        }

        return ContentService.createTextOutput(
          JSON.stringify({
            status: 'error',
            message: 'Registration ID ' + targetId + ' not found in sheet.'
          })
        ).setMimeType(ContentService.MimeType.JSON);
      } finally {
        lock.releaseLock();
      }
    }
  }

  // ========================================================
  // 2. GET REGISTRATIONS DATA
  // ========================================================
  if (params.action === 'getRegistrations') {
    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      let sheet = ss.getSheetByName(SHEET_NAME);
      if (!sheet) {
        return ContentService.createTextOutput(JSON.stringify([])).setMimeType(ContentService.MimeType.JSON);
      }
      
      const lastRow = sheet.getLastRow();
      if (lastRow <= 1) {
        return ContentService.createTextOutput(JSON.stringify([])).setMimeType(ContentService.MimeType.JSON);
      }
      
      const lastCol = sheet.getLastColumn();
      if (lastCol <= 0) {
        return ContentService.createTextOutput(JSON.stringify([])).setMimeType(ContentService.MimeType.JSON);
      }

      const sheetHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
      const headerMap = {};
      for (let i = 0; i < sheetHeaders.length; i++) {
        headerMap[String(sheetHeaders[i]).trim().toLowerCase()] = i;
      }
      
      const data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
      const registrations = data.map(function(row) {
        function getVal(names, fallback) {
          if (!Array.isArray(names)) names = [names];
          for (let k = 0; k < names.length; k++) {
            const idx = headerMap[names[k].toLowerCase()];
            if (idx !== undefined && idx < row.length && row[idx] !== '') {
              return row[idx];
            }
          }
          return fallback;
        }

        const rawRegId = String(getVal(['Registration ID', 'reg id', 'id'], '')).trim();
        if (!rawRegId) return null;

        const leaderName = String(getVal(['Team Leader Name', 'leader name', 'name'], '')).trim();
        const leaderEmail = String(getVal(['Leader Email', 'email'], '')).trim();
        const leaderPhone = String(getVal(['Leader Mobile', 'mobile', 'phone'], '')).trim();
        const college = String(getVal(['College Name', 'college'], '')).trim();
        const dept = String(getVal(['Department', 'dept'], '')).trim();
        const yr = String(getVal(['Year', 'yr'], '')).trim();
        
        const participants = [{
          fullName: leaderName,
          email: leaderEmail,
          phone: leaderPhone,
          college: college,
          department: dept,
          year: yr
        }];
        
        const member2Str = String(getVal(['Member 2 Details', 'member 2'], '')).trim();
        const member3Str = String(getVal(['Member 3 Details', 'member 3'], '')).trim();
        const member4Str = String(getVal(['Member 4 Details', 'member 4'], '')).trim();
        
        [member2Str, member3Str, member4Str].forEach(function(mStr) {
          if (mStr && mStr !== 'N/A' && mStr !== '-') {
            const parts = mStr.split(' (');
            const name = parts[0] ? parts[0].trim() : '';
            const phone = parts[1] ? parts[1].replace(')', '').trim() : '';
            participants.push({
              fullName: name,
              email: '',
              phone: phone,
              college: college,
              department: dept,
              year: yr
            });
          }
        });

        const rawEventsText = String(getVal(['Registered Events', 'events'], '')).trim();
        const rawTrack = String(getVal(['Track / Category', 'track'], '')).trim().toLowerCase();
        const isWorkshop = rawTrack.indexOf('workshop') !== -1 || rawEventsText.toLowerCase().indexOf('workshop') !== -1 || rawEventsText.toLowerCase().indexOf('silicon') !== -1 || rawEventsText.toLowerCase().indexOf('embedded') !== -1 || rawEventsText.toLowerCase().indexOf('instrumentation') !== -1 || rawEventsText.toLowerCase().indexOf('labview') !== -1;

        let selectedWorkshopId = undefined;
        let cleanEventsText = rawEventsText;
        const selectedTechnicalIds = [];
        const selectedNonTechnicalIds = [];

        if (isWorkshop) {
          let ws = cleanWorkshopTitle(rawEventsText);
          if (!ws || ws.toLowerCase() === 'workshop') {
            ws = cleanWorkshopTitle(rawTrack);
          }
          if (ws === 'SILICON 2 GDS') {
            selectedWorkshopId = 'ws-silicon-2-gds';
            cleanEventsText = 'SILICON 2 GDS';
          } else if (ws === 'Embedded System') {
            selectedWorkshopId = 'ws-embedded-system';
            cleanEventsText = 'Embedded System';
          } else if (ws === 'Virtual Instrumentation') {
            selectedWorkshopId = 'ws-virtual-instrumentation';
            cleanEventsText = 'Virtual Instrumentation';
          } else {
            cleanEventsText = ws || 'Workshop';
          }
        }

        const eventsLower = rawEventsText.toLowerCase();
        if (eventsLower.indexOf('techpaper') !== -1 || eventsLower.indexOf('paper') !== -1) selectedTechnicalIds.push('techpaper');
        if (eventsLower.indexOf('evolvex') !== -1 || eventsLower.indexOf('project') !== -1) selectedTechnicalIds.push('evolvex');
        if (eventsLower.indexOf('tracktron') !== -1 || eventsLower.indexOf('robot') !== -1 || eventsLower.indexOf('line follower') !== -1) selectedTechnicalIds.push('tracktron');
        if (eventsLower.indexOf('mind maze') !== -1 || eventsLower.indexOf('mind') !== -1) selectedNonTechnicalIds.push('mind-maze');
        if (eventsLower.indexOf('promptify') !== -1 || eventsLower.indexOf('prompt') !== -1) selectedNonTechnicalIds.push('promptify');
        if (eventsLower.indexOf('memix') !== -1 || eventsLower.indexOf('meme') !== -1) selectedNonTechnicalIds.push('memix');
        if (eventsLower.indexOf('detective') !== -1 || eventsLower.indexOf('404') !== -1) selectedNonTechnicalIds.push('detective-404');

        const rawCreatedAt = getVal(['Timestamp', 'date'], '');
        const totalAmountVal = Number(getVal(['Total Fee (INR)', 'amount', 'fee'], isWorkshop ? 300 : participants.length * 250));
        const payMethod = String(getVal(['Payment Method', 'method'], 'UPI')).trim();
        const payStatus = String(getVal(['Payment Status', 'status'], 'PENDING_VERIFICATION')).toLowerCase() === 'paid' ? 'paid' : 'pending_verification';
        const payRef = String(getVal(['Payment Ref / UTR', 'utr'], '')).trim();
        const payProof = String(getVal(['Payment Proof / Link', 'drive link', 'proof'], '')).trim();
        const isPresent = String(getVal(['Attendance Status', 'attendance'], '')).toLowerCase() === 'present';
        const rawUpdate = getVal(['Last Updated', 'updated at'], '');

        return {
          id: rawRegId,
          createdAt: parseSheetDateToISO(rawCreatedAt),
          registrationType: isWorkshop ? 'workshop' : 'technical',
          eventsText: cleanEventsText,
          selectedWorkshopId: selectedWorkshopId,
          selectedTechnicalIds: selectedTechnicalIds,
          selectedNonTechnicalIds: selectedNonTechnicalIds,
          teamLeader: {
            fullName: leaderName,
            email: leaderEmail,
            phone: leaderPhone,
            college: college,
            department: dept,
            year: yr
          },
          participants: participants,
          totalAmount: totalAmountVal,
          paymentMethod: payMethod,
          paymentStatus: payStatus,
          paymentId: payRef,
          upiReference: payRef,
          paymentProofUrl: payProof,
          attendanceMarked: isPresent,
          attendanceTimestamp: isPresent ? parseSheetDateToISO(rawUpdate) : undefined
        };
      }).filter(Boolean);
      
      return ContentService.createTextOutput(
        JSON.stringify(registrations)
      ).setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(
        JSON.stringify({ error: err.toString() })
      ).setMimeType(ContentService.MimeType.JSON);
    }
  }

  // ========================================================
  // 3. DEFAULT HEALTH CHECK
  // ========================================================
  return ContentService.createTextOutput(
    JSON.stringify({
      status: 'active',
      service: 'EVITRON 2K26 High-Performance Google Sheets Registration & Attendance Webhook',
      timestamp: new Date().toISOString()
    })
  ).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Run this once in Apps Script editor to authorize Drive and Sheets permissions.
 */
function authorizeScript() {
  Logger.log("Authorization check triggered.");
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    Logger.log("Active Spreadsheet ID: " + ss.getId());
    const folderName = 'EVITRON_2K26_Payment_Proofs';
    const folders = DriveApp.getFoldersByName(folderName);
    if (folders.hasNext()) {
      Logger.log("Google Drive Access Granted! Found folder: " + folders.next().getName());
    } else {
      DriveApp.createFolder(folderName);
      Logger.log("Google Drive Access Granted! Created folder: " + folderName);
    }
    Logger.log("Script is fully authorized!");
  } catch (e) {
    Logger.log("Authorization Check Failed: " + e.toString());
  }
}

/**
 * Decodes a base64 screenshot and stores it inside Google Drive folder EVITRON_2K26_Payment_Proofs
 */
function saveFileToDrive(base64Data, filename) {
  if (!base64Data || typeof base64Data !== 'string') return 'N/A';
  try {
    const parts = base64Data.split(',');
    const header = parts[0];
    const base64Content = parts[1] || parts[0];
    
    let contentType = 'image/jpeg';
    let ext = '.jpg';
    if (header.indexOf('image/png') !== -1) {
      contentType = 'image/png';
      ext = '.png';
    } else if (header.indexOf('application/pdf') !== -1) {
      contentType = 'application/pdf';
      ext = '.pdf';
    }
    
    const decoded = Utilities.base64Decode(base64Content);
    const blob = Utilities.newBlob(decoded, contentType, filename + ext);
    
    const folderName = 'EVITRON_2K26_Payment_Proofs';
    let folder;
    const folders = DriveApp.getFoldersByName(folderName);
    if (folders.hasNext()) {
      folder = folders.next();
    } else {
      folder = DriveApp.createFolder(folderName);
    }
    
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return file.getUrl();
  } catch (err) {
    Logger.log('Drive upload failed: ' + err.toString());
    return 'Upload Failed: ' + err.toString();
  }
}