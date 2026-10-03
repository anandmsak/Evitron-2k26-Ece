import fs from 'fs';
import path from 'path';

function loadCsvRegistrations() {
  const filePath = './data/live_registrations.csv';
  const data = fs.readFileSync(filePath, 'utf8');
  const rows = data.split('\n').slice(1); // skip header
  
  return rows
    .filter(row => row.trim() !== '')
    .map(row => {
      const parts = row.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
      return {
        id: parts[0],
        events: parts[3].replace(/"/g, ''),
        teamSize: parseInt(parts[10]) || 1,
      };
    });
}

const registrations = loadCsvRegistrations();

const eventCounts: Record<string, { entries: number; participants: number }> = {};

for (const r of registrations) {
  const events = r.events.split(',').map(e => e.trim().toLowerCase());
  for (const event of events) {
    if (!eventCounts[event]) {
      eventCounts[event] = { entries: 0, participants: 0 };
    }
    eventCounts[event].entries += 1;
    eventCounts[event].participants += r.teamSize;
  }
}

console.log(JSON.stringify(eventCounts, null, 2));
