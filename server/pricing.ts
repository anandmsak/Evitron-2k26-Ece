export const DEFAULT_REGISTRATION_DEADLINE = '05/10/2026';
export const DEFAULT_EARLY_BIRD_DEADLINE = '2026-10-05T23:59:59+05:30'; // October 5th, 2026 in IST

export function isEarlyBirdActive(settings?: any, date?: Date): boolean {
  // Pricing is fixed permanently: Technical 250, Workshop 300
  return true;
}

export function getPricePerPerson(type: 'workshop' | 'technical' | 'non-technical', settings?: any, date?: Date): number {
  // Fixed pricing forever as per symposium management:
  // Technical: ₹250 per participant, Workshop: ₹300 per participant
  if (type === 'workshop') {
    return 300;
  }
  return 250;
}
