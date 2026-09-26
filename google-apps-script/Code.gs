/**
 * EVITRON 2K26 - National Level Technical Symposium & Workshop
 * Department of Electronics and Communication Engineering
 * Mahendra Engineering College
 * 
 * Google Apps Script Webhook for Real-Time Registration Synchronization
 * Compatible with EVITRON 2K26 Backend Payload
 */

const SHEET_NAME = 'Registrations';

const HEADERS = [
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
 * Robust date parser for Sheets timestamp formats (e.g. DD/MM/YYYY or standard Date objects)
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

  // Handle DD/MM/YYYY, HH:MM:SS format commonly outputted by Indian regional sheets
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
 * Handle incoming POST requests from the EVITRON 2K26 app server
 */
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (lockErr) {
    return ContentService.createTextOutput(
      JSON.stringify({ status: 'error', message: 'Server busy, could not acquire lock.' })
    ).setMimeType(ContentService.MimeType.JSON);
  }

  try {
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(
        JSON.stringify({ status: 'error', message: 'No payload data provided.' })
      ).setMimeType(ContentService.MimeType.JSON);
    }

    const data = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(SHEET_NAME);

    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
    }

    ensureHeaders(sheet);

    const regId = String(data.regId || '').trim();
    if (!regId) {
      return ContentService.createTextOutput(
        JSON.stringify({ status: 'error', message: 'Missing regId in payload.' })
      ).setMimeType(ContentService.MimeType.JSON);
    }

    let trackLabel = data.track === 'workshop' ? 'Workshop (Individual)' : `Technical Symposium (Team of ${data.participantsCount || 1})`;

    var driveLink = 'N/A';
    if (data.paymentProofData && String(data.paymentProofData).indexOf('data:') === 0) {
      driveLink = saveFileToDrive(data.paymentProofData, regId + '_Payment_Proof');
    } else if (data.paymentProofData) {
      driveLink = String(data.paymentProofData);
    }

    const rowValues = [
      regId,
      data.createdAt ? new Date(data.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
      trackLabel,
      data.events || '',
      data.leaderName || '',
      data.leaderEmail || '',
      data.leaderPhone ? String(data.leaderPhone) : '',
      data.college || '',
      data.department || '',
      data.year || '',
      data.participantsCount || 1,
      data.member2 || 'N/A',
      data.member3 || 'N/A',
      data.member4 || 'N/A',
      data.amount || 0,
      String(data.paymentMethod || '').toUpperCase(),
      String(data.paymentStatus || '').toUpperCase(),
      data.paymentRef || '',
      driveLink,
      data.attendance || 'Absent',
      new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
    ];

    const lastRow = sheet.getLastRow();
    let existingRowIndex = -1;

    if (lastRow > 1) {
      const idColumnValues = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      for (let i = 0; i < idColumnValues.length; i++) {
        if (String(idColumnValues[i][0]).trim() === regId) {
          existingRowIndex = i + 2;
          break;
        }
      }
    }

    if (existingRowIndex > 0) {
      sheet.getRange(existingRowIndex, 1, 1, rowValues.length).setValues([rowValues]);
    } else {
      sheet.appendRow(rowValues);
      const newRowIdx = sheet.getLastRow();
      if (newRowIdx % 2 === 0) {
        sheet.getRange(newRowIdx, 1, 1, rowValues.length).setBackground('#FAFAFA');
      }
    }

    if (sheet.getLastRow() <= 20) {
      for (let c = 1; c <= HEADERS.length; c++) {
        sheet.autoResizeColumn(c);
      }
    }

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
    lock.releaseLock();
  }
}

/**
 * Handle GET requests for health-check or retrieving registration list
 */
function doGet(e) {
  const action = e && e.parameter && e.parameter.action;
  
  if (action === 'getRegistrations') {
    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      let sheet = ss.getSheetByName(SHEET_NAME);
      if (!sheet) {
        sheet = ss.insertSheet(SHEET_NAME);
      }
      
      ensureHeaders(sheet);
      
      const lastRow = sheet.getLastRow();
      if (lastRow <= 1) {
        return ContentService.createTextOutput(JSON.stringify([])).setMimeType(ContentService.MimeType.JSON);
      }
      
      const lastCol = sheet.getLastColumn();
      if (lastCol <= 0) {
        return ContentService.createTextOutput(JSON.stringify([])).setMimeType(ContentService.MimeType.JSON);
      }

      // Read actual headers from row 1 to map columns dynamically and handle backward-compatibility
      const sheetHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
      const headerMap = {};
      for (let i = 0; i < sheetHeaders.length; i++) {
        headerMap[String(sheetHeaders[i]).trim()] = i;
      }
      
      const data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
      const registrations = data.map(function(row) {
        function getVal(headerName, fallback) {
          const idx = headerMap[headerName];
          return (idx !== undefined && idx < row.length) ? row[idx] : fallback;
        }

        const leaderName = String(getVal('Team Leader Name', '')).trim();
        const leaderEmail = String(getVal('Leader Email', '')).trim();
        const leaderPhone = String(getVal('Leader Mobile', '')).trim();
        const college = String(getVal('College Name', '')).trim();
        const dept = String(getVal('Department', '')).trim();
        const yr = String(getVal('Year', '')).trim();
        
        const participants = [{
          fullName: leaderName,
          email: leaderEmail,
          phone: leaderPhone,
          college: college,
          department: dept,
          year: yr
        }];
        
        const member2Str = String(getVal('Member 2 Details', '')).trim();
        const member3Str = String(getVal('Member 3 Details', '')).trim();
        const member4Str = String(getVal('Member 4 Details', '')).trim();
        
        if (member2Str && member2Str !== 'N/A' && member2Str !== '-') {
          const parts = member2Str.split(' (');
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
        
        if (member3Str && member3Str !== 'N/A' && member3Str !== '-') {
          const parts = member3Str.split(' (');
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

        if (member4Str && member4Str !== 'N/A' && member4Str !== '-') {
          const parts = member4Str.split(' (');
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

        // Map events string back to exact event IDs for Admin Dashboard metrics
        const rawEventsText = String(getVal('Registered Events', '')).trim().toLowerCase();
        let selectedWorkshopId = undefined;
        const selectedTechnicalIds = [];
        const selectedNonTechnicalIds = [];

        // Workshop mappings
        if (rawEventsText.includes('silicon')) {
          selectedWorkshopId = 'silicon-2-gds';
        } else if (rawEventsText.includes('embedded')) {
          selectedWorkshopId = 'embedded-system';
        } else if (rawEventsText.includes('instrumentation')) {
          selectedWorkshopId = 'virtual-instrumentation';
        }

        // Technical event mappings
        if (rawEventsText.includes('techpaper') || rawEventsText.includes('paper')) {
          selectedTechnicalIds.push('techpaper');
        }
        if (rawEventsText.includes('evolvex') || rawEventsText.includes('project')) {
          selectedTechnicalIds.push('evolvex');
        }
        if (rawEventsText.includes('tracktron') || rawEventsText.includes('circuit')) {
          selectedTechnicalIds.push('tracktron');
        }

        // Non-technical event mappings
        if (rawEventsText.includes('mind maze') || rawEventsText.includes('mind') || rawEventsText.includes('quiz')) {
          selectedNonTechnicalIds.push('mind-maze');
        }
        if (rawEventsText.includes('promptify') || rawEventsText.includes('prompt')) {
          selectedNonTechnicalIds.push('promptify');
        }
        if (rawEventsText.includes('memix') || rawEventsText.includes('meme')) {
          selectedNonTechnicalIds.push('memix');
        }
        if (rawEventsText.includes('detective') || rawEventsText.includes('404')) {
          selectedNonTechnicalIds.push('detective-404');
        }

        const rawRegId = String(getVal('Registration ID', '')).trim();
        const rawCreatedAt = getVal('Timestamp', '');
        const trackType = String(getVal('Track / Category', '')).toLowerCase().includes('workshop') ? 'workshop' : 'technical';
        const totalAmountVal = Number(getVal('Total Fee (INR)', 0));
        const payMethod = String(getVal('Payment Method', 'UPI')).trim();
        const payStatus = String(getVal('Payment Status', 'PENDING')).toLowerCase() === 'paid' ? 'paid' : 'pending_verification';
        const payRef = String(getVal('Payment Ref / UTR', '')).trim();
        const payProof = String(getVal('Payment Proof / Link', '')).trim();
        const isPresent = String(getVal('Attendance Status', '')).toLowerCase() === 'present';
        const rawUpdate = getVal('Last Updated', '');

        return {
          id: rawRegId,
          createdAt: parseSheetDateToISO(rawCreatedAt),
          registrationType: trackType,
          eventsText: String(getVal('Registered Events', '')).trim(),
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
      });
      
      return ContentService.createTextOutput(
        JSON.stringify(registrations)
      ).setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(
        JSON.stringify({ error: err.toString() })
      ).setMimeType(ContentService.MimeType.JSON);
    }
  }

  return ContentService.createTextOutput(
    JSON.stringify({
      status: 'active',
      service: 'EVITRON 2K26 Google Sheets Registration Webhook',
      timestamp: new Date().toISOString()
    })
  ).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Ensures that the sheet has all required HEADERS in the correct order.
 * If columns are missing (e.g. 'Member 4 Details'), they will be automatically
 * inserted into the spreadsheet at the correct column index and formatted,
 * ensuring complete backward compatibility and preventing data misalignment.
 */
function ensureHeaders(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    const headerRange = sheet.getRange(1, 1, 1, HEADERS.length);
    headerRange.setBackground('#B22222');
    headerRange.setFontColor('#FFFFFF');
    headerRange.setFontWeight('bold');
    headerRange.setFontFamily('Arial');
    sheet.setFrozenRows(1);
    return;
  }

  // Get current headers
  const currentHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn() || 1).getValues()[0];
  const cleanHeader = function(h) {
    return String(h || '').trim().toLowerCase();
  };

  const cleanCurrentHeaders = currentHeaders.map(cleanHeader);

  // Check and insert any missing columns to match HEADERS exactly
  for (let i = 0; i < HEADERS.length; i++) {
    const targetHeader = HEADERS[i];
    const targetClean = cleanHeader(targetHeader);
    const foundIndex = cleanCurrentHeaders.indexOf(targetClean);

    if (foundIndex === -1) {
      // Insert column before index i + 1 (Google Sheets is 1-indexed)
      sheet.insertColumnBefore(i + 1);
      const cell = sheet.getRange(1, i + 1);
      cell.setValue(targetHeader);
      cell.setBackground('#B22222');
      cell.setFontColor('#FFFFFF');
      cell.setFontWeight('bold');
      cell.setFontFamily('Arial');
      // Update cleanCurrentHeaders in memory so subsequent checks find it at the correct index
      cleanCurrentHeaders.splice(i, 0, targetClean);
    }
  }
}

/**
 * Run this helper function once in the Google Apps Script Editor to trigger
 * the authorization dialog for Google Drive and Google Sheets!
 * This resolves permission failures gracefully.
 */
function authorizeScript() {
  Logger.log("Authorization health check triggered.");
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    Logger.log("Active Spreadsheet ID: " + ss.getId());
    
    var folderName = 'EVITRON_2K26_Payment_Proofs';
    var folders = DriveApp.getFoldersByName(folderName);
    if (folders.hasNext()) {
      Logger.log("Google Drive Access Granted! Found existing proofs folder: " + folders.next().getName());
    } else {
      Logger.log("Google Drive Access Granted! Folder will be created on the first upload.");
    }
    Logger.log("All systems operational. Script is fully authorized!");
  } catch (e) {
    Logger.log("Authorization/Access Check Failed: " + e.toString());
  }
}

/**
 * Decodes a base64 string and stores it inside a Google Drive folder named EVITRON_2K26_Payment_Proofs
 * Returns the shareable Google Drive Link.
 */
function saveFileToDrive(base64Data, filename) {
  if (!base64Data) {
    Logger.log('saveFileToDrive called with empty or undefined base64Data.');
    return 'N/A';
  }
  try {
    var parts = base64Data.split(',');
    var header = parts[0];
    var base64Content = parts[1] || parts[0];
    
    var contentType = 'image/jpeg';
    var ext = '.jpg';
    if (header.indexOf('image/png') !== -1) {
      contentType = 'image/png';
      ext = '.png';
    } else if (header.indexOf('application/pdf') !== -1) {
      contentType = 'application/pdf';
      ext = '.pdf';
    }
    
    var decoded = Utilities.base64Decode(base64Content);
    var blob = Utilities.newBlob(decoded, contentType, filename + ext);
    
    var folderName = 'EVITRON_2K26_Payment_Proofs';
    var folder;
    var folders = DriveApp.getFoldersByName(folderName);
    if (folders.hasNext()) {
      folder = folders.next();
    } else {
      folder = DriveApp.createFolder(folderName);
    }
    
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return file.getUrl();
  } catch (err) {
    Logger.log('Drive upload failed: ' + err.toString());
    return 'Upload Failed: ' + err.toString();
  }
}