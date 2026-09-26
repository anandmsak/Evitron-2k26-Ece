import { SiteSettings } from '../types.js';
import { getPricePerPerson } from '../utils/pricing.js';

export const initialSiteSettings: SiteSettings = {
  symposiumTitle: 'EVITRON 2K26',
  subTitle: 'National Level Technical Symposium',
  department: 'Department of Electronics and Communication Engineering',
  college: 'Mahendra Engineering College (Autonomous)',
  associations: 'VELOCITY & IEEE',
  eventDate: '08/10/2026',
  countdownTarget: '2026-10-08T09:00:00',
  registrationDeadline: '05/10/2026',
  paperSubmissionDeadline: '27/09/2026',
  isRegistrationOpen: true,
  closedReason: 'Registrations are currently closed. Please contact event coordinators for further inquiries.',
  upiId: '6383109049@upi',
  upiPayeeName: 'EVITRON 2K26 - MEC ECE',
  upiQrImageUrl: '',
  workshopUpiId: '6383109049@upi',
  workshopUpiPayeeName: 'Evitron Workshop',
  workshopUpiQrImageUrl: '',
  techUpiId: '6383109049@upi',
  techUpiPayeeName: 'Evitron Technical',
  techUpiQrImageUrl: '',
  razorpayEnabled: true,
  driveUploadUrl: 'https://docs.google.com/forms/d/1R1VhrsHfC9GYo-j_npPZv8fDXXhlUOPbfYtNUBy1Vh0/edit?ts=6aa4f3ae',
  participantFormUrl: 'https://docs.google.com/forms/d/e/1FAIpQLSdXYq3Pfeb_2w5jPtdjqeLJPv3sIVsb9Y1ahPUe47WT76OUYg/viewform?usp=publish-editor',
  contactEmail: 'evitron26@gmail.com',
  instagramHandle: 'https://www.instagram.com/velocity_ece_mec?stkn=dWV5ejA4ZW5hOWkz',
  venue: 'Mahendhirapuri, Mallasamudram (M), Namakkal (Dt), Tamil Nadu - 637 503',
  announcementText: 'Registrations are now live! Last date for registration is 05/10/2026. Paper abstract submission deadline is 27/09/2026. Cash prizes, welcome kits, food and refreshments included.',
  announcementActive: true,
  feePerPerson: getPricePerPerson('technical'),
  appEnv: 'development',
  showRazorpayPayment: true,
  googleSheetWebhookUrl: 'https://script.google.com/macros/s/AKfycbwQFDmE-3bG517qhy5jP6my90QCKsps5GLn2q7ih3vHJmTq96PikBitSCJgIqyxOqRoaQ/exec',
  adminNotificationEmails: ['evitron26@gmail.com'],
  forceEarlyBird: true,
  earlyBirdDeadline: '2026-10-05T23:59:59+05:30',
};

export const defaultSettings = initialSiteSettings;

