export const EARLY_BIRD_DEADLINE = '2026-09-25T23:59:59+05:30'; // September 25th, 2026 in IST (Indian Standard Time)

export function isEarlyBirdActive(date?: Date): boolean {
  const checkDate = date || new Date();
  const deadline = new Date(EARLY_BIRD_DEADLINE);
  return checkDate.getTime() <= deadline.getTime();
}

export function getPricePerPerson(type: 'workshop' | 'technical' | 'non-technical', date?: Date): number {
  if (isEarlyBirdActive(date)) {
    return type === 'workshop' ? 300 : 250;
  }
  return 350; // Standard price after 25/09/2026
}
