import React, { useState, useEffect, useMemo } from 'react';
import {
  Lock,
  LogOut,
  Users,
  Wrench,
  Cpu,
  CreditCard,
  QrCode,
  Settings,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Clock,
  Download,
  Search,
  RefreshCw,
  ExternalLink,
  Edit,
  Save,
  Check,
  ShieldCheck,
  FileSpreadsheet,
  FileText,
} from 'lucide-react';
import { EventItem, RegistrationRecord, SiteSettings } from '../types';
import { defaultSettings } from '../data/defaultSettings';
import { useAdminLive } from '../hooks/useAdminLive';
import {
  adminLogin,
  fetchAdminStats,
  fetchAdminRegistrations,
  updateRegistrationStatus,
  updateSiteSettings,
  setWorkshopClosureApi,
  updateEnvironment,
  updateEventDetails,
  markAttendanceApi,
  deleteRegistrationApi,
  testEmailApi,
  syncGoogleSheetsApi,
  cleanWorkshopTitle,
  getShortEventName,
  fetchPaymentProof,
} from '../services/api';

import { isEventClosedStrict } from '../utils/closureUtils';

interface AdminDashboardProps {
  initialSettings: SiteSettings;
  events: EventItem[];
  onRefreshEvents: () => void;
  onRefreshSettings: () => void;
  onNavigate: (path: string) => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  initialSettings,
  events,
  onRefreshEvents,
  onRefreshSettings,
  onNavigate,
}) => {
  // Strict single-session security: never auto-restore token, always prompt for password on every visit
  const [token, setToken] = useState<string | null>(null);
  const [passwordInput, setPasswordInput] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'registrations' | 'settings' | 'upi' | 'events' | 'attendance'>('overview');

  // Stats & Registrations loaded via real-time hook
  const {
    stats: liveStats,
    registrations: allRegistrations,
    status: liveStatus,
    refresh: refreshLive,
    error: liveError,
  } = useAdminLive(token, handleLogout);

  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const activeStats = useMemo(() => {
    return liveStats || {
      totalRegistrations: 0,
      totalParticipants: 0,
      workshopCount: 0,
      technicalCount: 0,
      paidCount: 0,
      pendingCount: 0,
    };
  }, [liveStats]);

  const filteredRegistrations = useMemo(() => {
    if (!allRegistrations) return [];
    let list = allRegistrations;
    if (filterType) {
      list = list.filter((r) => r.registrationType === filterType);
    }
    if (filterStatus) {
      list = list.filter((r) => r.paymentStatus === filterStatus);
    }
    if (searchTerm) {
      const needle = searchTerm.toLowerCase();
      list = list.filter((r) =>
        [
          r.id,
          r.teamLeader?.fullName,
          r.teamLeader?.email,
          r.teamLeader?.phone,
          r.teamLeader?.college,
          r.upiReference,
          r.eventsText,
          r.selectedWorkshopId,
          ...(r.selectedTechnicalIds || []),
          ...(r.selectedNonTechnicalIds || []),
          ...(r.participants || []).map((p) => p.fullName),
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(needle))
      );
    }
    return list;
  }, [allRegistrations, filterType, filterStatus, searchTerm]);

  const registrations = filteredRegistrations;
  
  // Notification and confirmation state
  const [actionNotice, setActionNotice] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [showProdConfirm, setShowProdConfirm] = useState(false);

  // Standard session management: session persists normally until explicit logout
  useEffect(() => {
    // Session token maintained until explicit logout
  }, []);

  // Settings form state
  const [settingsForm, setSettingsForm] = useState<SiteSettings>(initialSettings);
  const [selectedEventId, setSelectedEventId] = useState<string>(events[0]?.id || '');
  const [eventForm, setEventForm] = useState<Partial<EventItem>>({});

  // Attendance check state
  const [attendanceSearchId, setAttendanceSearchId] = useState('');
  const [attendanceResult, setAttendanceResult] = useState<any>(null);

  const [verifyConfirmReg, setVerifyConfirmReg] = useState<RegistrationRecord | null>(null);
  const [deleteConfirmReg, setDeleteConfirmReg] = useState<RegistrationRecord | null>(null);
  const [deletePasswordInput, setDeletePasswordInput] = useState('');
  const [deletePasswordError, setDeletePasswordError] = useState('');
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

  const [activeProofUrl, setActiveProofUrl] = useState<string | null>(null);
  const [activeProofRegId, setActiveProofRegId] = useState<string | null>(null);

  const EVENT_METADATA_MAP: Record<string, { code: string; name: string; specificTitle: string; fullDisplay: string; category: 'workshop' | 'technical' | 'non-technical'; badgeIcon: string }> = {
    // TECHNICAL EVENTS
    'techpaper': {
      code: 'techpaper',
      name: 'techpaper',
      specificTitle: 'techpaper',
      fullDisplay: 'techpaper',
      category: 'technical',
      badgeIcon: '🔬',
    },
    '46aa179c-ec4a-4d8d-a206-7c4c497a95ce': {
      code: 'techpaper',
      name: 'techpaper',
      specificTitle: 'techpaper',
      fullDisplay: 'techpaper',
      category: 'technical',
      badgeIcon: '🔬',
    },
    'evolvex': {
      code: 'evolvex',
      name: 'evolvex',
      specificTitle: 'evolvex',
      fullDisplay: 'evolvex',
      category: 'technical',
      badgeIcon: '🔬',
    },
    'c2a1bbfc-85fb-49f9-9d9d-39759b6df37f': {
      code: 'evolvex',
      name: 'evolvex',
      specificTitle: 'evolvex',
      fullDisplay: 'evolvex',
      category: 'technical',
      badgeIcon: '🔬',
    },
    'tracktron': {
      code: 'tracktron',
      name: 'tractron',
      specificTitle: 'tractron',
      fullDisplay: 'tractron',
      category: 'technical',
      badgeIcon: '🔬',
    },
    '626a494c-0e71-4679-abad-9d5a4d5758e2': {
      code: 'tracktron',
      name: 'tractron',
      specificTitle: 'tractron',
      fullDisplay: 'tractron',
      category: 'technical',
      badgeIcon: '🔬',
    },
    'tractron': {
      code: 'tracktron',
      name: 'tractron',
      specificTitle: 'tractron',
      fullDisplay: 'tractron',
      category: 'technical',
      badgeIcon: '🔬',
    },

    // WORKSHOPS
    'ws-silicon-2-gds': {
      code: 'silicon-2-gds',
      name: 'silicon 2gds',
      specificTitle: 'silicon 2gds',
      fullDisplay: 'silicon 2gds',
      category: 'workshop',
      badgeIcon: '⚙️',
    },
    'silicon-2-gds': {
      code: 'silicon-2-gds',
      name: 'silicon 2gds',
      specificTitle: 'silicon 2gds',
      fullDisplay: 'silicon 2gds',
      category: 'workshop',
      badgeIcon: '⚙️',
    },
    '4e91a80e-4baa-4fc2-bf6c-7f95e135fc80': {
      code: 'silicon-2-gds',
      name: 'silicon 2gds',
      specificTitle: 'silicon 2gds',
      fullDisplay: 'silicon 2gds',
      category: 'workshop',
      badgeIcon: '⚙️',
    },
    'ws-embedded-system': {
      code: 'embedded-system',
      name: 'Embedded System',
      specificTitle: 'Embedded System',
      fullDisplay: 'Embedded System',
      category: 'workshop',
      badgeIcon: '⚙️',
    },
    'embedded-system': {
      code: 'embedded-system',
      name: 'Embedded System',
      specificTitle: 'Embedded System',
      fullDisplay: 'Embedded System',
      category: 'workshop',
      badgeIcon: '⚙️',
    },
    'd6699fda-e9a5-404d-88e8-bd9e0610988e': {
      code: 'embedded-system',
      name: 'Embedded System',
      specificTitle: 'Embedded System',
      fullDisplay: 'Embedded System',
      category: 'workshop',
      badgeIcon: '⚙️',
    },
    'ws-virtual-instrumentation': {
      code: 'virtual-instrumentation',
      name: 'Virtual instrument',
      specificTitle: 'Virtual instrument',
      fullDisplay: 'Virtual instrument',
      category: 'workshop',
      badgeIcon: '⚙️',
    },
    'virtual-instrumentation': {
      code: 'virtual-instrumentation',
      name: 'Virtual instrument',
      specificTitle: 'Virtual instrument',
      fullDisplay: 'Virtual instrument',
      category: 'workshop',
      badgeIcon: '⚙️',
    },
    'ee27539a-2318-44da-9697-bb859ed57a50': {
      code: 'virtual-instrumentation',
      name: 'Virtual instrument',
      specificTitle: 'Virtual instrument',
      fullDisplay: 'Virtual instrument',
      category: 'workshop',
      badgeIcon: '⚙️',
    },

    // NON-TECHNICAL EVENTS
    'mind-maze': {
      code: 'mind-maze',
      name: 'mind maze',
      specificTitle: 'mind maze',
      fullDisplay: 'mind maze',
      category: 'non-technical',
      badgeIcon: '🎨',
    },
    '8ebc96bf-893d-4e6b-8976-6f541f2631ff': {
      code: 'mind-maze',
      name: 'mind maze',
      specificTitle: 'mind maze',
      fullDisplay: 'mind maze',
      category: 'non-technical',
      badgeIcon: '🎨',
    },
    'promptify': {
      code: 'promptify',
      name: 'promptify',
      specificTitle: 'promptify',
      fullDisplay: 'promptify',
      category: 'non-technical',
      badgeIcon: '🎨',
    },
    '41b7298f-6401-4409-a000-5cc406e194b8': {
      code: 'promptify',
      name: 'promptify',
      specificTitle: 'promptify',
      fullDisplay: 'promptify',
      category: 'non-technical',
      badgeIcon: '🎨',
    },
    'memix': {
      code: 'memix',
      name: 'memix',
      specificTitle: 'memix',
      fullDisplay: 'memix',
      category: 'non-technical',
      badgeIcon: '🎨',
    },
    '0dcd0759-87af-4bce-9757-5e52833c538b': {
      code: 'memix',
      name: 'memix',
      specificTitle: 'memix',
      fullDisplay: 'memix',
      category: 'non-technical',
      badgeIcon: '🎨',
    },
    'detective-404': {
      code: 'detective-404',
      name: 'detective 404',
      specificTitle: 'detective 404',
      fullDisplay: 'detective 404',
      category: 'non-technical',
      badgeIcon: '🎨',
    },
    '57d56f8c-99c4-4e78-bb57-4c7a6ec47716': {
      code: 'detective-404',
      name: 'detective 404',
      specificTitle: 'detective 404',
      fullDisplay: 'detective 404',
      category: 'non-technical',
      badgeIcon: '🎨',
    },
  };

  const resolveEventMeta = (eventKey: string, categoryFallback?: 'workshop' | 'technical' | 'non-technical') => {
    if (!eventKey) {
      return {
        code: 'unknown',
        name: 'Event',
        specificTitle: 'Event',
        fullDisplay: 'Event',
        category: categoryFallback || 'technical',
        badgeIcon: categoryFallback === 'workshop' ? '⚙️' : categoryFallback === 'non-technical' ? '🎨' : '🔬',
      };
    }

    const clean = eventKey.trim();
    const lower = clean.toLowerCase();
    const stripped = lower
      .replace(/^tech-/, '')
      .replace(/^ws-/, '')
      .replace(/^non-/, '')
      .replace(/^nontech-/, '');

    if (EVENT_METADATA_MAP[lower]) return EVENT_METADATA_MAP[lower];
    if (EVENT_METADATA_MAP[stripped]) return EVENT_METADATA_MAP[stripped];

    // Try matching with events array from props
    const found = events.find((e) => {
      const idL = (e.id || '').toLowerCase();
      const slugL = (e.slug || '').toLowerCase();
      const titleL = (e.title || '').toLowerCase();
      return idL === lower || slugL === lower || slugL === stripped || titleL === lower || titleL === stripped;
    });

    if (found) {
      const fSlug = (found.slug || '').toLowerCase().replace(/^(tech|ws|non|nontech)-/, '');
      if (EVENT_METADATA_MAP[fSlug]) return EVENT_METADATA_MAP[fSlug];
      const isWs = found.category === 'workshops' || found.category === 'workshop';
      const isNon = found.category === 'non-technical' || found.category === 'non_technical';
      const shortName = getShortEventName(found.slug || found.title);
      return {
        code: found.slug || found.id,
        name: shortName,
        specificTitle: shortName,
        fullDisplay: shortName,
        category: isWs ? ('workshop' as const) : isNon ? ('non-technical' as const) : ('technical' as const),
        badgeIcon: isWs ? '⚙️' : isNon ? '🎨' : '🔬',
      };
    }

    // Heuristics based on text keywords
    if (lower.includes('paper')) return EVENT_METADATA_MAP['techpaper'];
    if (lower.includes('evolvex') || lower.includes('project')) return EVENT_METADATA_MAP['evolvex'];
    if (lower.includes('tracktron') || lower.includes('robot') || lower.includes('line')) return EVENT_METADATA_MAP['tracktron'];
    if (lower.includes('silicon') || lower.includes('cadence') || lower.includes('vlsi')) return EVENT_METADATA_MAP['silicon-2-gds'];
    if (lower.includes('embedded') || lower.includes('microcontroller')) return EVENT_METADATA_MAP['embedded-system'];
    if (lower.includes('virtual') || lower.includes('labview') || lower.includes('instrumentation')) return EVENT_METADATA_MAP['virtual-instrumentation'];
    if (lower.includes('mind') || lower.includes('maze')) return EVENT_METADATA_MAP['mind-maze'];
    if (lower.includes('prompt')) return EVENT_METADATA_MAP['promptify'];
    if (lower.includes('mem')) return EVENT_METADATA_MAP['memix'];
    if (lower.includes('detective') || lower.includes('circuit')) return EVENT_METADATA_MAP['detective-404'];

    const shortName = getShortEventName(clean);
    return {
      code: stripped,
      name: shortName,
      specificTitle: shortName,
      fullDisplay: shortName,
      category: categoryFallback || 'technical',
      badgeIcon: categoryFallback === 'workshop' ? '⚙️' : categoryFallback === 'non-technical' ? '🎨' : '🔬',
    };
  };

  const getRegistrationSpecificEvents = (r: RegistrationRecord) => {
    const isWorkshop = r.registrationType === 'workshop';
    const memberCount = r.participants?.length || 1;
    const result = {
      trackLabel: isWorkshop ? 'WORKSHOP' : `TECHNICAL (${memberCount})`,
      isWorkshop,
      events: [] as Array<{ code: string; name: string; specificTitle: string; fullDisplay: string; category: 'workshop' | 'technical' | 'non-technical'; badgeIcon: string }>,
    };

    if (isWorkshop) {
      const rawWs = r.selectedWorkshopId || r.eventsText || 'Embedded System';
      result.events.push(resolveEventMeta(rawWs, 'workshop'));
      return result;
    }

    // Technical Track: Resolve specific technical and non-technical events
    const seenCodes = new Set<string>();

    const techIds = (r.selectedTechnicalIds || []).filter(Boolean);
    const nonTechIds = (r.selectedNonTechnicalIds || []).filter(Boolean);

    techIds.forEach((id) => {
      const meta = resolveEventMeta(id, 'technical');
      const key = meta.code.toLowerCase();
      if (!seenCodes.has(key)) {
        seenCodes.add(key);
        result.events.push(meta);
      }
    });

    nonTechIds.forEach((id) => {
      const meta = resolveEventMeta(id, 'non-technical');
      const key = meta.code.toLowerCase();
      if (!seenCodes.has(key)) {
        seenCodes.add(key);
        result.events.push(meta);
      }
    });

    if (r.eventsText) {
      const parts = r.eventsText.split(',').map((s) => s.trim()).filter(Boolean);
      parts.forEach((p) => {
        const meta = resolveEventMeta(p);
        const key = meta.code.toLowerCase();
        if (!seenCodes.has(key)) {
          seenCodes.add(key);
          result.events.push(meta);
        }
      });
    }

    if (result.events.length === 0) {
      result.events.push(resolveEventMeta('techpaper', 'technical'));
    }

    return result;
  };

  const findEv = (eventKey: string) => {
    if (!eventKey) return undefined;
    const meta = resolveEventMeta(eventKey);
    return {
      id: eventKey,
      slug: meta.code,
      title: meta.name,
      tagline: meta.specificTitle,
      category: meta.category,
    } as any;
  };

  const getWorkshopDisplayTitle = (r: RegistrationRecord) => {
    const spec = getRegistrationSpecificEvents(r);
    const ws = spec.events.find((e) => e.category === 'workshop') || spec.events[0];
    return ws ? ws.fullDisplay : cleanWorkshopTitle(r.eventsText || r.selectedWorkshopId || 'Workshop');
  };

  const getParticipantsForEvent = (eventId: string) => {
    const list: { fullName: string; phone: string; email: string; college: string; regId: string; role: string; paymentStatus: string }[] = [];
    const eventObj = events.find(e => e.id === eventId);
    if (!eventObj) return list;

    const targetSlug = (eventObj.slug || '').toLowerCase().replace(/^(tech|ws|non|nontech)-/, '').trim();
    const targetId = (eventObj.id || '').toLowerCase().replace(/^(tech|ws|non|nontech)-/, '').trim();
    const targetTitle = (eventObj.title || '').toLowerCase().trim();

    (allRegistrations || []).forEach((r) => {
      const spec = getRegistrationSpecificEvents(r);
      const match = spec.events.some((e) => {
        const c = (e.code || '').toLowerCase();
        const n = (e.name || '').toLowerCase();
        const s = (e.specificTitle || '').toLowerCase();
        return (
          c === targetSlug ||
          c === targetId ||
          n === targetTitle ||
          s === targetTitle ||
          (targetSlug.includes('silicon') && (c.includes('silicon') || n.includes('silicon'))) ||
          (targetSlug.includes('embedded') && (c.includes('embedded') || n.includes('embedded'))) ||
          (targetSlug.includes('virtual') && (c.includes('virtual') || n.includes('virtual'))) ||
          (targetSlug.includes('paper') && (c.includes('paper') || n.includes('paper') || s.includes('paper'))) ||
          (targetSlug.includes('evolvex') && (c.includes('evolvex') || n.includes('evolvex') || s.includes('project'))) ||
          (targetSlug.includes('tracktron') && (c.includes('tracktron') || n.includes('tracktron') || s.includes('line') || s.includes('robot'))) ||
          (targetSlug.includes('mind') && (c.includes('mind') || n.includes('mind'))) ||
          (targetSlug.includes('prompt') && (c.includes('prompt') || n.includes('prompt'))) ||
          (targetSlug.includes('mem') && (c.includes('mem') || n.includes('mem'))) ||
          (targetSlug.includes('detective') && (c.includes('detective') || n.includes('detective')))
        );
      });

      if (match) {
        r.participants.forEach((p, idx) => {
          list.push({
            fullName: p.fullName,
            phone: p.phone,
            email: p.email || '',
            college: p.college,
            regId: r.id,
            role: idx === 0 ? 'Leader' : `Member ${idx + 1}`,
            paymentStatus: r.paymentStatus,
          });
        });
      }
    });

    return list;
  };

  const handleDeleteRegistration = async () => {
    if (!deleteConfirmReg || !token) return;
    const targetId = deleteConfirmReg.id;
    try {
      await deleteRegistrationApi(token, targetId, deletePasswordInput.trim());
      showNotification(`Registration ${targetId} successfully deleted from admin records.`, 'success');
      setDeleteConfirmReg(null);
      setDeletePasswordInput('');
      setDeletePasswordError('');
      refreshLive();
    } catch (err: any) {
      setDeletePasswordError(err.message || 'Failed to delete registration.');
    }
  };

  const [isSyncingSheet, setIsSyncingSheet] = useState(false);

  const handleSyncGoogleSheet = async () => {
    if (!token) return;
    setIsSyncingSheet(true);
    try {
      const res = await syncGoogleSheetsApi(token);
      showNotification(res.message || 'Successfully synchronized all registrations with Google Sheet!', 'success');
    } catch (err: any) {
      showNotification(`Failed to sync with Google Sheet: ${err.message}`, 'error');
    } finally {
      setIsSyncingSheet(false);
    }
  };

  const [testEmailAddress, setTestEmailAddress] = useState('evitron26@gmail.com');
  const [testingEmail, setTestingEmail] = useState(false);
  const [testEmailResult, setTestEmailResult] = useState<{ sent: boolean; message: string } | null>(null);

  const handleSendTestEmail = async () => {
    if (!token) return;
    setTestingEmail(true);
    setTestEmailResult(null);
    try {
      const res = await testEmailApi(token, testEmailAddress.trim() || 'evitron26@gmail.com');
      setTestEmailResult({ sent: res.sent, message: res.message });
      if (res.sent) {
        showNotification('Live test email dispatched successfully!', 'success');
      } else {
        showNotification(`Test email failed: ${res.message}`, 'error');
      }
    } catch (err: any) {
      setTestEmailResult({ sent: false, message: err.message || 'Failed to trigger test email.' });
      showNotification(`Test email error: ${err.message}`, 'error');
    } finally {
      setTestingEmail(false);
    }
  };

  useEffect(() => {
    setSettingsForm(initialSettings);
  }, [initialSettings]);

  useEffect(() => {
    const current = events.find((e) => e.id === selectedEventId);
    if (current) {
      setEventForm({ ...current });
    }
  }, [selectedEventId, events]);

  useEffect(() => {
    // Note: useAdminLive hook handles EventSource stream connection automatically
  }, [token]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    try {
      const res = await adminLogin(passwordInput);
      setToken(res.token);
      setPasswordInput('');
    } catch (err: any) {
      setLoginError(err.message || 'Incorrect organizer password.');
    }
  };

  function handleLogout() {
    setToken(null);
    setPasswordInput('');
    sessionStorage.removeItem('evitron_admin_token');
    localStorage.removeItem('evitron_admin_token');
  }

  const showNotification = (msg: string, type: 'success' | 'error' = 'success') => {
    setActionNotice({ message: msg, type });
    setTimeout(() => setActionNotice(null), type === 'error' ? 6000 : 3000);
  };

  // Toggle registration open/closed
  const handleToggleRegistration = async () => {
    if (!token) return;
    const newStatus = !settingsForm.isRegistrationOpen;
    try {
      const updated = await updateSiteSettings(token, { isRegistrationOpen: newStatus });
      setSettingsForm(updated);
      onRefreshSettings();
      showNotification(`Registrations are now strictly ${newStatus ? 'OPEN' : 'PERMANENTLY CLOSED'}.`, 'success');
    } catch (err: any) {
      showNotification(err.message || 'Failed to update registration status.', 'error');
    }
  };

  // Toggle maintenance mode
  const handleToggleMaintenance = async () => {
    if (!token) return;
    const newStatus = !settingsForm.isMaintenanceMode;
    try {
      const updated = await updateSiteSettings(token, { isMaintenanceMode: newStatus });
      setSettingsForm(updated);
      onRefreshSettings();
      showNotification(
        newStatus
          ? '🛠️ Site Maintenance Mode is now ENABLED (visitors see "Site Under Maintenance, Please Try Again Later").'
          : '🟢 Site Maintenance Mode is now DISABLED (portal is LIVE for public visitors).',
        'success'
      );
    } catch (err: any) {
      showNotification(err.message || 'Failed to toggle site maintenance mode.', 'error');
    }
  };

  // Save general site settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    try {
      const { closedWorkshops, closureStateLoaded, ...rest } = settingsForm;
      const updated = await updateSiteSettings(token, rest);
      setSettingsForm(updated);
      onRefreshSettings();
      showNotification('Site settings updated successfully.', 'success');
    } catch (err: any) {
      showNotification(err.message || 'Failed to save settings.', 'error');
    }
  };

  // Save UPI & Payment settings
  const handleSaveUpiSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    try {
      const updated = await updateSiteSettings(token, {
        upiId: settingsForm.upiId,
        upiPayeeName: settingsForm.upiPayeeName,
        upiQrImageUrl: settingsForm.upiQrImageUrl,
        workshopUpiId: settingsForm.workshopUpiId,
        workshopUpiPayeeName: settingsForm.workshopUpiPayeeName,
        workshopUpiQrImageUrl: settingsForm.workshopUpiQrImageUrl,
        techUpiId: settingsForm.techUpiId,
        techUpiPayeeName: settingsForm.techUpiPayeeName,
        techUpiQrImageUrl: settingsForm.techUpiQrImageUrl,
        driveUploadUrl: settingsForm.driveUploadUrl,
        participantFormUrl: settingsForm.participantFormUrl,
        googleSheetWebhookUrl: settingsForm.googleSheetWebhookUrl,
        adminNotificationEmails: settingsForm.adminNotificationEmails,
      });
      setSettingsForm(updated);
      onRefreshSettings();
      showNotification('UPI & Payment settings updated successfully and saved permanently.', 'success');
    } catch (err: any) {
      showNotification(err.message || 'Failed to update UPI settings.', 'error');
    }
  };

  const [qrUploadError, setQrUploadError] = useState<string | null>(null);
  const [workshopQrError, setWorkshopQrError] = useState<string | null>(null);
  const [techQrError, setTechQrError] = useState<string | null>(null);

  const handleQrFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQrUploadError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setQrUploadError('Please select an image file (PNG, JPG, etc).');
      e.target.value = '';
      return;
    }
    const MAX_BYTES = 2 * 1024 * 1024; // 2MB
    if (file.size > MAX_BYTES) {
      setQrUploadError('Image is too large. Please upload a file under 2MB.');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setSettingsForm((prev) => ({ ...prev, upiQrImageUrl: reader.result as string }));
    };
    reader.onerror = () => setQrUploadError('Failed to read the selected file. Please try again.');
    reader.readAsDataURL(file);
  };

  const handleWorkshopQrFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setWorkshopQrError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setWorkshopQrError('Please select an image file (PNG, JPG).');
      e.target.value = '';
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setWorkshopQrError('Image too large. Must be under 2MB.');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setSettingsForm((prev) => ({ ...prev, workshopUpiQrImageUrl: reader.result as string }));
    };
    reader.onerror = () => setWorkshopQrError('Failed to read file.');
    reader.readAsDataURL(file);
  };

  const handleTechQrFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTechQrError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setTechQrError('Please select an image file (PNG, JPG).');
      e.target.value = '';
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setTechQrError('Image too large. Must be under 2MB.');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setSettingsForm((prev) => ({ ...prev, techUpiQrImageUrl: reader.result as string }));
    };
    reader.onerror = () => setTechQrError('Failed to read file.');
    reader.readAsDataURL(file);
  };

  // Toggle Razorpay visibility on the Registration page
  const handleToggleRazorpayVisibility = async () => {
    if (!token) return;
    const newValue = !(settingsForm.razorpayEnabled !== false);
    try {
      const updated = await updateSiteSettings(token, { razorpayEnabled: newValue });
      setSettingsForm(updated);
      onRefreshSettings();
      showNotification(`Razorpay payment option is now ${newValue ? 'VISIBLE' : 'HIDDEN'} on the registration page.`, 'success');
    } catch (err: any) {
      showNotification(err.message || 'Failed to update Razorpay visibility.', 'error');
    }
  };

  // Switch Development / Production environment
  const handleToggleEnvironment = (newEnv: 'development' | 'production') => {
    if (!token) return;
    if (newEnv === 'production' && settingsForm.appEnv !== 'production') {
      setShowProdConfirm(true); // in-app modal, not window.confirm
      return;
    }
    applyEnvironmentSwitch(newEnv);
  };

  const applyEnvironmentSwitch = async (newEnv: 'development' | 'production') => {
    if (!token) return;
    try {
      const updated = await updateEnvironment(token, newEnv);
      setSettingsForm(updated);
      onRefreshSettings();
      showNotification(`System switched to ${newEnv.toUpperCase()} mode.`, 'success');
    } catch (err: any) {
      showNotification(err.message || `Failed to switch to ${newEnv.toUpperCase()} mode.`, 'error');
    }
  };

  // Save event details
  const handleSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !selectedEventId) return;
    try {
      await updateEventDetails(token, selectedEventId, eventForm);
      onRefreshEvents();
      showNotification('Event coordinator & rules updated successfully.', 'success');
    } catch (err: any) {
      showNotification(err.message || 'Failed to update event.', 'error');
    }
  };

  // Verify / approve payment status
  const handleUpdateStatus = async (regId: string, newStatus: 'paid' | 'pending_verification' | 'failed') => {
    if (!token) return;
    try {
      await updateRegistrationStatus(token, regId, newStatus);
      refreshLive();
      if (newStatus === 'paid') {
        showNotification(`Payment verified for ${regId}! Unique ID, team details & event confirmation email sent.`, 'success');
      } else {
        showNotification(`Registration ${regId} marked as ${newStatus.toUpperCase()}`, 'success');
      }
    } catch (err: any) {
      showNotification(err.message || 'Failed to update status.', 'error');
    }
  };

  // Check-in / mark attendance
  const handleMarkAttendance = async () => {
    if (!attendanceSearchId.trim() || !token) return;
    try {
      const res = await markAttendanceApi(token, attendanceSearchId.trim());
      setAttendanceResult(res);
      refreshLive();
    } catch (err: any) {
      setAttendanceResult({ success: false, message: err.message });
    }
  };

  // Export to CSV Spreadsheet
  const exportToCsv = () => {
    const list = allRegistrations || [];
    if (list.length === 0) return;
    const headers = [
      'Registration ID',
      'Created At',
      'Type',
      'Registered Events',
      'Leader Name',
      'Leader Email',
      'Leader Phone',
      'Leader College',
      'Leader Dept',
      'Leader Year',
      'Participant 2',
      'Participant 3',
      'Participant 4',
      'Amount',
      'Method',
      'Payment Status',
      'Payment ID / UTR',
      'Attendance',
    ];

    const rows = list.map((r) => {
      const spec = getRegistrationSpecificEvents(r);
      const eventTitles = spec.events.map((e) => e.fullDisplay);

      return [
        r.id,
        `"${new Date(r.createdAt).toLocaleString('en-IN')}"`,
        `"${spec.trackLabel}"`,
        `"${spec.events.map((e) => e.name).join(', ')}"`,
        `"${r.teamLeader.fullName}"`,
        r.teamLeader.email,
        r.teamLeader.phone,
        `"${r.teamLeader.college}"`,
        `"${r.teamLeader.department || ''}"`,
        `"${r.teamLeader.year || ''}"`,
        r.participants[1] ? `"${r.participants[1].fullName} (${r.participants[1].phone} - ${r.participants[1].college})"` : 'N/A',
        r.participants[2] ? `"${r.participants[2].fullName} (${r.participants[2].phone} - ${r.participants[2].college})"` : 'N/A',
        r.participants[3] ? `"${r.participants[3].fullName} (${r.participants[3].phone} - ${r.participants[3].college})"` : 'N/A',
        r.totalAmount,
        r.paymentMethod,
        r.paymentStatus,
        r.paymentId || r.upiReference || 'N/A',
        r.attendanceMarked ? 'YES' : 'NO',
      ];
    });

    const csvContent = [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `EVITRON2K26_Registrations_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // If not logged in: Show organizer login screen
  if (!token) {
    return (
      <div className="py-16 max-w-md mx-auto px-4 min-h-[70vh] flex items-center justify-center">
        <div className="w-full bg-white border border-stone-200 rounded-xl p-6 sm:p-8 shadow-sm">
          <div className="text-center mb-6">
            <img
              src="/emblem.jpeg"
              alt="EVITRON 2K26 Emblem"
              className="w-14 h-14 object-contain mx-auto mb-3 drop-shadow-xs"
              onError={(e) => {
                (e.currentTarget as HTMLElement).style.display = 'none';
              }}
            />
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-stone-100 border border-stone-300 text-stone-800 rounded-md text-[11px] font-semibold mx-auto mb-2">
              <Lock className="w-3 h-3 text-[#B22222]" />
              <span>Secure Authentication Mode • Standard Session Management</span>
            </div>
            <h1 className="text-xl font-extrabold text-stone-900">Admin Login & Coordinator Portal</h1>
            <p className="text-xs text-stone-500 mt-1">
              EVITRON 2K26 Administrative Control & Management Dashboard
            </p>
          </div>

          {loginError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 font-medium">
              {loginError}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-700 mb-1">
                Admin Password
              </label>
              <div className="relative">
                <input
                  type="password"
                  autoFocus
                  autoComplete="current-password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="Enter administrator password"
                  className="w-full px-3 py-2.5 bg-stone-50 border border-stone-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-[#B22222]"
                />
                <Lock className="w-4 h-4 text-stone-400 absolute right-3 top-3" />
              </div>
              <p className="text-[11px] text-stone-500 mt-1">
                Authorized personnel only. Sessions automatically terminate upon logout or inactivity.
              </p>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 px-4 bg-[#B22222] hover:bg-[#961c1c] active:bg-[#7e1717] text-white text-xs font-bold rounded-lg cursor-pointer shadow-xs"
            >
              Sign In to Dashboard
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-stone-100 text-center">
            <button
              onClick={() => onNavigate('/')}
              className="text-xs text-stone-500 hover:text-stone-800"
            >
              ← Return to public website
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Prevent flash-to-zero or partial rendering during initial connection
  const isFirstLoading = token && (allRegistrations === null || liveStats === null);

  if (isFirstLoading) {
    return (
      <div className="py-20 text-center max-w-md mx-auto px-4 min-h-[60vh] flex flex-col items-center justify-center space-y-4">
        {liveError ? (
          <>
            <div className="w-12 h-12 rounded-full bg-rose-100 flex items-center justify-center text-rose-600 font-extrabold text-xl">⚠️</div>
            <h2 className="text-sm font-extrabold text-stone-900 tracking-wider uppercase">Connection Degraded</h2>
            <p className="text-xs text-rose-600 font-semibold">{liveError}</p>
            <button
              onClick={() => refreshLive()}
              className="px-4 py-2 bg-stone-900 text-white font-bold text-xs rounded-md hover:bg-stone-800 transition-colors shadow-sm cursor-pointer"
            >
              Retry Connection
            </button>
          </>
        ) : (
          <>
            <RefreshCw className="w-10 h-10 text-[#B22222] animate-spin" />
            <h2 className="text-sm font-extrabold text-stone-900 tracking-wider uppercase">Connecting to Database...</h2>
            <p className="text-xs text-stone-500">Establishing establish real-time subscription channel & fetching latest metrics...</p>
          </>
        )}
      </div>
    );
  }

  // Logged-in Admin Dashboard
  return (
    <div className="py-6 sm:py-8 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 min-h-[85vh]">
      {/* Top Banner & Title */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6 pb-4 border-b border-stone-200">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl sm:text-2xl font-extrabold text-stone-900 tracking-tight">
              EVITRON 2K26 Admin Console
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded">
              {token?.startsWith('evitron_local_') ? 'Active Session (Direct Client Mode)' : 'Active Session (Live Cloud)'}
            </span>
          </div>
          <p className="text-xs text-stone-500">
            ECE Dept, Mahendra Engineering College • VELOCITY & IEEE
          </p>
        </div>

        {/* Real-time Supabase Connection Status Bar */}
        <div className={`w-full border rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs shadow-2xs transition-colors duration-300 ${liveStatus === 'reconnecting' ? 'bg-rose-50 border-rose-200 text-rose-950' : 'bg-emerald-50 border-emerald-200 text-emerald-950'}`}>
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${liveStatus === 'reconnecting' ? 'bg-rose-600 animate-ping' : 'bg-emerald-600 animate-pulse'}`} />
            <span>
              {liveStatus === 'reconnecting' ? (
                <strong>⚠️ Connection Lost. Reconnecting to live Supabase channel... (Displaying cached dashboard values)</strong>
              ) : (
                <>
                  <strong>Supabase Real-Time Engine Active:</strong> Secure live PostgreSQL channel is connected ({allRegistrations?.length || 0} registrations synced instantly). Updates trigger instantly on table change events.
                </>
              )}
            </span>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          {/* Environment Switcher Pill */}
          <div className="flex items-center bg-stone-100 p-0.5 rounded-lg border border-stone-300 text-[11px] font-bold">
            <button
              type="button"
              onClick={() => handleToggleEnvironment('development')}
              className={`px-2.5 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
                settingsForm.appEnv === 'development'
                  ? 'bg-amber-500 text-white shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${settingsForm.appEnv === 'development' ? 'bg-white animate-pulse' : 'bg-stone-400'}`} />
              TEST MODE
            </button>
            <button
              type="button"
              onClick={() => handleToggleEnvironment('production')}
              className={`px-2.5 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
                settingsForm.appEnv === 'production'
                  ? 'bg-rose-700 text-white shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${settingsForm.appEnv === 'production' ? 'bg-white animate-pulse' : 'bg-stone-400'}`} />
              PRODUCTION (LIVE)
            </button>
          </div>

          {/* Quick Registration Open / Closed toggle */}
          <button
            onClick={handleToggleRegistration}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors shadow-xs ${
              settingsForm.isRegistrationOpen
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                : 'bg-red-700 hover:bg-red-800 text-white ring-2 ring-red-300'
            }`}
            title="Click to toggle all symposium registrations OPEN or PERMANENTLY CLOSED"
          >
            <span className={`w-2 h-2 rounded-full ${settingsForm.isRegistrationOpen ? 'bg-white animate-pulse' : 'bg-red-200'}`} />
            <span>Registrations: {settingsForm.isRegistrationOpen ? 'OPEN' : 'PERMANENTLY CLOSED'}</span>
          </button>

          {/* Site Under Maintenance Button */}
          <button
            onClick={handleToggleMaintenance}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all shadow-xs ${
              settingsForm.isMaintenanceMode
                ? 'bg-amber-600 hover:bg-amber-700 text-white ring-2 ring-amber-300 animate-pulse'
                : 'bg-stone-800 hover:bg-stone-900 text-amber-300 border border-amber-500/30'
            }`}
            title="Toggle Site Under Maintenance Mode (temporarily displays 'Site Under Maintenance' screen to visitors)"
          >
            <span>🛠️ {settingsForm.isMaintenanceMode ? 'MAINTENANCE MODE: ACTIVE' : 'Site Under Maintenance'}</span>
          </button>

          <button
            onClick={handleLogout}
            className="px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-semibold rounded-lg flex items-center gap-1 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" /> Logout
          </button>
        </div>
      </div>

      {/* Maintenance Mode Active Banner */}
      {settingsForm.isMaintenanceMode && (
        <div className="mb-4 p-3.5 bg-amber-500 text-stone-950 font-bold text-xs rounded-xl shadow-md border-2 border-amber-600 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-base">⚠️</span>
            <span>
              <strong>SITE UNDER MAINTENANCE IS ACTIVE:</strong> Public visitors are currently seeing the <em>"Site Under Maintenance, Please Try Again Later"</em> screen. Admin console remains fully accessible.
            </span>
          </div>
          <button
            onClick={handleToggleMaintenance}
            className="px-3 py-1 bg-stone-950 hover:bg-black text-amber-300 text-[11px] font-black rounded-lg cursor-pointer shrink-0"
          >
            Turn Off Maintenance & Go Live
          </button>
        </div>
      )}

      {/* Action toast */}
      {actionNotice && (
        <div className={`mb-4 p-3 text-xs font-semibold rounded-lg shadow-md flex items-center gap-2 ${
          actionNotice.type === 'error' ? 'bg-rose-700 text-white' : 'bg-stone-900 text-white'
        }`}>
          {actionNotice.type === 'error'
            ? <AlertCircle className="w-4 h-4 text-white" />
            : <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
          <span>{actionNotice.message}</span>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-stone-200 mb-6 text-xs font-bold">
        {[
          { key: 'overview', label: 'Overview & Metrics' },
          { key: 'registrations', label: `Registrations (${allRegistrations?.length || 0})` },
          { key: 'upi', label: 'UPI & Payment Controls' },
          { key: 'events', label: 'Event Coordinators CMS' },
          { key: 'settings', label: 'Site Settings & Deadlines' },
          { key: 'attendance', label: 'Event-Day Scanner' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            className={`px-4 py-2.5 rounded-t-lg transition-colors cursor-pointer ${
              activeTab === tab.key
                ? 'bg-white text-[#B22222] border-t-2 border-x border-[#B22222] -mb-px'
                : 'text-stone-600 hover:text-stone-900 bg-stone-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Key KPI Metric Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs">
              <span className="text-stone-500 text-xs font-medium block">Total Registrations</span>
              <span className="text-2xl sm:text-3xl font-extrabold text-stone-900">
                {activeStats.totalRegistrations}
              </span>
            </div>

            <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs">
              <span className="text-stone-500 text-xs font-medium block">Total Attendees</span>
              <span className="text-2xl sm:text-3xl font-extrabold text-[#B22222]">
                {activeStats.totalParticipants}
              </span>
            </div>

            <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs">
              <span className="text-stone-500 text-xs font-medium block">Workshops Count</span>
              <span className="text-2xl sm:text-3xl font-extrabold text-stone-900">
                {activeStats.workshopCount}
              </span>
            </div>

            <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs">
              <span className="text-stone-500 text-xs font-medium block">Technical Teams</span>
              <span className="text-2xl sm:text-3xl font-extrabold text-stone-900">
                {activeStats.technicalCount}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Payment status breakdown */}
            <div className="bg-white p-6 rounded-xl border border-stone-200 shadow-xs">
              <h3 className="text-xs font-bold uppercase tracking-wider text-stone-700 mb-4">
                Payment Verification Status
              </h3>
              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between p-3 bg-emerald-50 rounded-lg border border-emerald-100">
                  <span className="font-bold text-emerald-900">Paid & Confirmed</span>
                  <span className="text-base font-extrabold text-emerald-800">{activeStats.paidCount}</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-amber-50 rounded-lg border border-amber-100">
                  <span className="font-bold text-amber-900">Pending UPI Verification</span>
                  <span className="text-base font-extrabold text-amber-800">{activeStats.pendingCount}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Event Distribution & Participant Lists */}
          <div className="bg-white p-6 rounded-xl border border-stone-200 shadow-xs mt-6">
            <h3 className="text-xs font-bold uppercase tracking-wider text-stone-700 mb-4 flex flex-wrap items-center justify-between gap-2">
              <span>Event-Wise Distribution & Participant Rosters</span>
              <span className="text-[10px] text-stone-400 normal-case font-normal">Click any event below to expand and view the complete registered participants list.</span>
            </h3>
            <div className="space-y-3 text-xs">
              {events.map((evt) => {
                const partsList = getParticipantsForEvent(evt.id);
                const participantCount = partsList.length;
                const uniqueRegs = new Set(partsList.map(p => p.regId));
                const teamCount = uniqueRegs.size;
                const isExpanded = expandedEventId === evt.id;

                return (
                  <div key={evt.id} className="border border-stone-200 rounded-lg overflow-hidden bg-stone-50/50">
                    <div
                      onClick={() => setExpandedEventId(isExpanded ? null : evt.id)}
                      className="flex items-center justify-between p-3.5 bg-white hover:bg-stone-50/80 cursor-pointer transition-colors border-b border-stone-100 select-none"
                    >
                      <span className="text-stone-800 font-extrabold text-[13px] flex items-center gap-2">
                        <span className={evt.category === 'workshops' ? 'text-red-600' : evt.category === 'technical' ? 'text-blue-600' : 'text-purple-600'}>
                          {evt.category === 'workshops' ? '⚙️' : evt.category === 'technical' ? '🔬' : '🎨'}
                        </span>
                        {evt.title}
                      </span>
                      <div className="flex items-center gap-3">
                        <span className="font-mono font-bold text-stone-900 bg-stone-100 px-2.5 py-1 rounded text-[10px] border border-stone-200 shadow-2xs">
                          {evt.category === 'workshops'
                            ? `${participantCount} Participant${participantCount !== 1 ? 's' : ''}`
                            : `${teamCount} Team${teamCount !== 1 ? 's' : ''} (${participantCount} Individual${participantCount !== 1 ? 's' : ''})`
                          }
                        </span>
                        <span className="text-stone-400 font-bold text-[10px]">
                          {isExpanded ? '▲ COLLAPSE' : '▼ VIEW ROSTER'}
                        </span>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="p-3 bg-white border-t border-stone-100">
                        {partsList.length === 0 ? (
                          <p className="text-stone-400 text-center py-4 text-xs">No participants registered for this event yet.</p>
                        ) : (
                          <div className="overflow-x-auto max-h-80 overflow-y-auto">
                            <table className="w-full text-left text-[11px] border-collapse bg-white rounded-lg overflow-hidden border border-stone-200">
                              <thead>
                                <tr className="bg-stone-50 text-stone-600 border-b border-stone-200 font-bold uppercase tracking-wider text-[9px]">
                                  <th className="p-2.5">Participant Name</th>
                                  <th className="p-2.5">Role</th>
                                  <th className="p-2.5">College</th>
                                  <th className="p-2.5">Mobile</th>
                                  <th className="p-2.5">Email</th>
                                  <th className="p-2.5">Reg ID</th>
                                  <th className="p-2.5">Payment</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-stone-100">
                                {partsList.map((p, idx) => (
                                  <tr key={idx} className="hover:bg-stone-50/50 transition-colors">
                                    <td className="p-2.5 font-bold text-stone-900">{p.fullName}</td>
                                    <td className="p-2.5 text-stone-500 font-semibold">{p.role}</td>
                                    <td className="p-2.5 text-stone-600 truncate max-w-[200px]" title={p.college}>{p.college}</td>
                                    <td className="p-2.5 font-mono text-stone-500">{p.phone}</td>
                                    <td className="p-2.5 text-stone-500 truncate max-w-[150px]" title={p.email}>{p.email || 'N/A'}</td>
                                    <td className="p-2.5 font-mono font-bold text-blue-700">{p.regId}</td>
                                    <td className="p-2.5">
                                      <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${p.paymentStatus === 'paid' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-amber-100 text-amber-800 border border-amber-200'}`}>
                                        {p.paymentStatus === 'paid' ? 'Paid' : 'Pending'}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: REGISTRATIONS LIST */}
      {activeTab === 'registrations' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-xl border border-stone-200 shadow-xs">
            <div className="flex items-center gap-2 flex-1 min-w-[240px]">
              <Search className="w-4 h-4 text-stone-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by ID, name, email, phone, college..."
                className="w-full text-xs outline-none bg-transparent"
              />
            </div>

            <div className="flex items-center gap-2 text-xs">
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="px-2.5 py-1.5 bg-stone-50 border border-stone-300 rounded-md outline-none"
              >
                <option value="">All Categories</option>
                <option value="workshop">Workshops</option>
                <option value="technical">Technical Teams</option>
              </select>

              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-2.5 py-1.5 bg-stone-50 border border-stone-300 rounded-md outline-none"
              >
                <option value="">All Statuses</option>
                <option value="paid">Paid</option>
                <option value="pending_verification">Pending</option>
              </select>

              <button
                onClick={exportToCsv}
                className="px-3 py-1.5 bg-stone-900 hover:bg-stone-800 text-white rounded-md flex items-center gap-1.5 font-semibold cursor-pointer shadow-xs"
                title="Download full registration roster in CSV spreadsheet format"
              >
                <Download className="w-3.5 h-3.5" /> Export CSV
              </button>

              <button
                onClick={handleSyncGoogleSheet}
                disabled={isSyncingSheet}
                className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-md flex items-center gap-1.5 font-semibold cursor-pointer shadow-xs disabled:opacity-50"
                title="Synchronize all registrations live with connected Google Sheet"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                {isSyncingSheet ? 'Syncing...' : 'Sync to Google Sheet'}
              </button>

              <a
                href={settingsForm.driveUploadUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md flex items-center gap-1.5 font-semibold cursor-pointer shadow-xs"
                title="View participant payment Google Form responses and management dashboard"
              >
                <ExternalLink className="w-3.5 h-3.5" /> Google Form Responses
              </a>
            </div>
          </div>

          {/* Registrations Table */}
          <div className="bg-white border border-stone-200 rounded-xl overflow-x-auto shadow-xs">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-stone-50 text-stone-600 border-b border-stone-200 font-bold uppercase tracking-wider text-[10px]">
                  <th className="p-3">Reg ID</th>
                  <th className="p-3">Date</th>
                  <th className="p-3">Track & Specific Event</th>
                  <th className="p-3">Team Leader / College</th>
                  <th className="p-3">Participants</th>
                  <th className="p-3">Fee</th>
                  <th className="p-3">Payment</th>
                  <th className="p-3">Attendance</th>
                  <th className="p-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {registrations.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-stone-400">
                      No registrations found matching the filters.
                    </td>
                  </tr>
                ) : (
                  registrations.map((r) => {
                    const spec = getRegistrationSpecificEvents(r);
                    return (
                      <tr key={r.id} className="hover:bg-stone-50/70">
                        <td className="p-3 font-mono font-bold text-stone-900">{r.id}</td>
                        <td className="p-3 text-stone-600 whitespace-nowrap text-xs">
                          <div className="font-semibold text-stone-800">
                            {new Date(r.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                          </div>
                          <div className="text-[10px] text-stone-400 font-mono">
                            {new Date(r.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                          </div>
                        </td>
                        <td className="p-3 min-w-[220px] max-w-[280px]">
                          <div className="space-y-1.5">
                            <div>
                              <span
                                className={`inline-block px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wide border ${
                                  spec.isWorkshop
                                    ? 'bg-red-100 text-[#B22222] border-red-200'
                                    : 'bg-stone-100 text-stone-800 border-stone-200'
                                }`}
                              >
                                {spec.trackLabel}
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {spec.events.map((evt, idx) => {
                                const isWs = evt.category === 'workshop';
                                const isNonTech = evt.category === 'non-technical';
                                return (
                                  <span
                                    key={idx}
                                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-extrabold uppercase tracking-wide border shadow-2xs ${
                                      isWs
                                        ? 'bg-red-50 text-[#B22222] border-red-200'
                                        : isNonTech
                                        ? 'bg-purple-50 text-purple-900 border-purple-200'
                                        : 'bg-blue-50 text-blue-900 border-blue-200'
                                    }`}
                                  >
                                    <span>{evt.badgeIcon}</span>
                                    <span>{evt.name}</span>
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        </td>
                      <td className="p-3 max-w-[220px]">
                        <span className="font-bold text-stone-900 block truncate">
                          {r.teamLeader.fullName}
                        </span>
                        <span className="text-[11px] text-stone-500 block truncate">
                          {r.teamLeader.college}
                        </span>
                        <span className="text-[10px] text-stone-400 block">
                          {r.teamLeader.email} • {r.teamLeader.phone}
                        </span>
                        {r.participants.length > 1 && (
                          <div className="mt-1 text-[10px] text-stone-600 bg-stone-50 p-1.5 rounded border border-stone-200">
                            <span className="font-bold text-stone-800 block mb-0.5">Team Members ({r.participants.length}):</span>
                            {r.participants.map((p, idx) => (
                              <div key={idx} className="truncate">
                                {idx === 0 ? 'Leader: ' : `M${idx + 1}: `}{p.fullName} ({p.phone})
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="p-3">
                        <span className="font-semibold text-stone-800">
                          {r.participants.length} Attendee{r.participants.length > 1 ? 's' : ''}
                        </span>
                      </td>
                      <td className="p-3 font-bold text-stone-900">₹{r.totalAmount}</td>
                      <td className="p-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            r.paymentStatus === 'paid'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {r.paymentStatus === 'paid' ? 'Paid' : 'Pending Verification'}
                        </span>
                        {r.upiReference && (
                          <span className="block text-[10px] font-mono text-stone-700 font-semibold mt-1">
                            UTR: {r.upiReference}
                          </span>
                        )}
                        {(r as any).paymentProofUrl && (
                          <button
                            type="button"
                            onClick={async () => {
                              if ((r as any).paymentProofUrl === 'HAS_PROOF') {
                                try {
                                  const rawUrl = await fetchPaymentProof(token!, r.id);
                                  setActiveProofUrl(rawUrl);
                                } catch (err: any) {
                                  showNotification(err.message || 'Failed to load payment proof screenshot.', 'error');
                                }
                              } else {
                                setActiveProofUrl((r as any).paymentProofUrl);
                              }
                              setActiveProofRegId(r.id);
                            }}
                            className="block text-[10px] text-blue-600 hover:underline font-bold mt-1 text-left cursor-pointer"
                          >
                            👁️ View Proof / Screenshot
                          </button>
                        )}
                      </td>
                      <td className="p-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                            r.attendanceMarked
                              ? 'bg-blue-100 text-blue-800'
                              : 'text-stone-400'
                          }`}
                        >
                          {r.attendanceMarked ? 'Present' : 'Absent'}
                        </span>
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        {r.paymentStatus === 'pending_verification' && (
                          <button
                            onClick={() => setVerifyConfirmReg(r)}
                            className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] rounded cursor-pointer mr-1.5 flex items-center gap-1 shadow-xs inline-flex"
                            title="Verify payment, generate ticket, send confirmation email from evitron26@gmail.com, and update Supabase database"
                          >
                            <ShieldCheck className="w-3.5 h-3.5" /> Verify & Send Email
                          </button>
                        )}
                        <button
                          onClick={() => onNavigate(`/ticket/${r.id}`)}
                          className="px-2 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-[10px] rounded cursor-pointer mr-1"
                        >
                          Pass
                        </button>
                        <button
                          onClick={() => {
                            setDeleteConfirmReg(r);
                            setDeletePasswordInput('');
                            setDeletePasswordError('');
                          }}
                          className="px-2 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-[10px] rounded cursor-pointer"
                          title="Delete registration"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: UPI & PAYMENT GATEWAY CONTROLS */}
      {activeTab === 'upi' && (
        <div className="space-y-6 max-w-3xl">
          {/* ENVIRONMENT & RAZORPAY GATEWAY SWITCH */}
          <div className="bg-white border border-stone-200 rounded-xl p-6 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4 pb-3 border-b border-stone-100">
              <div>
                <h3 className="text-base font-extrabold text-stone-900 flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-[#B22222]" />
                  Environment & Razorpay Gateway Controls
                </h3>
                <p className="text-xs text-stone-500">
                  Switch between Development (Real Test Mode) and Production (Strict Live Only).
                </p>
              </div>

              {/* Status Badge */}
              <span
                className={`text-[11px] font-bold px-3 py-1 rounded-full flex items-center gap-1.5 ${
                  settingsForm.appEnv === 'production'
                    ? 'bg-rose-100 text-rose-900 border border-rose-200'
                    : 'bg-amber-100 text-amber-900 border border-amber-300'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    settingsForm.appEnv === 'production' ? 'bg-rose-600' : 'bg-amber-600'
                  } animate-pulse`}
                />
                ACTIVE: {settingsForm.appEnv === 'production' ? 'PRODUCTION (LIVE ONLY)' : 'DEVELOPMENT (TEST MODE)'}
              </span>
            </div>

            {/* Environment Switcher Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              <div
                onClick={() => handleToggleEnvironment('development')}
                className={`p-4 rounded-xl border-2 transition-all cursor-pointer ${
                  settingsForm.appEnv === 'development'
                    ? 'border-amber-500 bg-amber-50/60 shadow-xs'
                    : 'border-stone-200 hover:border-stone-300 bg-stone-50/50'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-extrabold text-sm text-stone-900 flex items-center gap-1.5">
                    DEVELOPMENT
                  </span>
                  {settingsForm.appEnv === 'development' && (
                    <span className="text-[10px] font-extrabold bg-amber-500 text-white px-2 py-0.5 rounded">
                      ACTIVE
                    </span>
                  )}
                </div>
                <p className="text-xs text-stone-600 mb-2 leading-relaxed">
                  Real Razorpay Test Mode with <code>rzp_test_...</code> keys. Tests authentic payment → cryptographic verification → registration → email → QR → Google Sheet pipeline.
                </p>
                <div className="text-[11px] text-amber-900 font-semibold bg-amber-100/70 p-2 rounded border border-amber-200">
                  Zero fake/simulated payment fallback. Uses authentic Razorpay sandbox checkout.
                </div>
              </div>

              <div
                onClick={() => handleToggleEnvironment('production')}
                className={`p-4 rounded-xl border-2 transition-all cursor-pointer ${
                  settingsForm.appEnv === 'production'
                    ? 'border-rose-600 bg-rose-50/60 shadow-xs'
                    : 'border-stone-200 hover:border-stone-300 bg-stone-50/50'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-extrabold text-sm text-stone-900 flex items-center gap-1.5">
                    PRODUCTION
                  </span>
                  {settingsForm.appEnv === 'production' && (
                    <span className="text-[10px] font-extrabold bg-rose-700 text-white px-2 py-0.5 rounded">
                      ACTIVE
                    </span>
                  )}
                </div>
                <p className="text-xs text-stone-600 mb-2 leading-relaxed">
                  Strictly live-only gateway. Requires authentic <code>rzp_live_...</code> keys. Never allows test keys or simulations.
                </p>
                <div className="text-[11px] text-rose-900 font-semibold bg-rose-100/70 p-2 rounded border border-rose-200">
                  Security guarantee: Any test key or missing credential immediately halts payment.
                </div>
              </div>
            </div>

            {/* Gateway Diagnostic Health Card */}
            <div className="p-4 bg-stone-50 rounded-xl border border-stone-200 text-xs space-y-2">
              <div className="flex items-center justify-between border-b border-stone-200 pb-2">
                <span className="font-bold text-stone-700">Razorpay API Gateway Connection:</span>
                {(settingsForm.appEnv === 'development' ? settingsForm.razorpayConnected : settingsForm.razorpayLiveConnected) ? (
                  <span className="font-bold text-emerald-800 bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    CONNECTED ({settingsForm.razorpayKeyMode || 'AUTHENTICATED'})
                  </span>
                ) : (
                  <span className="font-bold text-amber-800 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                    NOT CONNECTED
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-stone-600 pt-1">
                <div>
                  <span className="font-semibold text-stone-800">Target Environment:</span>{' '}
                  <span className="font-mono uppercase">{settingsForm.appEnv || 'development'}</span>
                </div>
                <div>
                  <span className="font-semibold text-stone-800">Key Mode:</span>{' '}
                  <span className="font-mono">{settingsForm.razorpayKeyMode || 'NONE'}</span>
                </div>
              </div>

              <div className="text-[11px] text-stone-600 pt-1 border-t border-stone-200">
                <span className="font-semibold text-stone-800 block mb-0.5">Diagnostic Details:</span>
                <p className="text-stone-700 bg-white p-2.5 rounded border border-stone-200 leading-relaxed font-mono text-[10px]">
                  {settingsForm.razorpayStatusDetails || 'Checking gateway status...'}
                </p>
              </div>

              <div className="pt-2 text-[11px] text-stone-500 leading-relaxed">
                To update credentials, set <code>RAZORPAY_KEY_ID</code> and <code>RAZORPAY_KEY_SECRET</code> in the project settings or environment variables.
              </div>

              <div className="mt-4 pt-4 border-t border-stone-200 flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <span className="text-xs font-bold text-stone-800 block">Razorpay Visibility on Registration Page</span>
                  <p className="text-[11px] text-stone-500">
                    Hide Razorpay entirely and show only the UPI QR option to registrants.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleToggleRazorpayVisibility}
                  className={`shrink-0 px-4 py-2 text-xs font-bold rounded-lg cursor-pointer transition-colors ${
                    settingsForm.razorpayEnabled !== false
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 hover:bg-emerald-200'
                      : 'bg-rose-100 text-rose-800 border border-rose-300 hover:bg-rose-200'
                  }`}
                >
                  {settingsForm.razorpayEnabled !== false ? 'Visible — Click to Hide' : 'Hidden — Click to Unhide'}
                </button>
              </div>
            </div>
          </div>

          {/* UPI CONTROLS */}
          <div className="bg-white border border-stone-200 rounded-xl p-6 shadow-xs">
            <div className="mb-4">
              <h3 className="text-base font-extrabold text-stone-900">
                UPI & Payment Screenshot Verification
              </h3>
              <p className="text-xs text-stone-500">
                Update UPI ID, dynamic QR image, and screenshot Drive upload link. Changes reflect immediately on payment page.
              </p>
            </div>

            <form onSubmit={handleSaveUpiSettings} className="space-y-6 text-xs">
              {/* SECTION 1: WORKSHOP UPI & QR */}
              <div className="p-4 bg-red-50/50 border border-red-200 rounded-xl space-y-3">
                <h4 className="font-extrabold text-[#B22222] text-sm uppercase tracking-wider flex items-center gap-1.5">
                  <Wrench className="w-4 h-4" /> Workshop Payment UPI & QR Code (Permanent)
                </h4>
                <p className="text-[11px] text-stone-600">
                  This specific UPI ID and QR code will be displayed when participants select a <strong>Workshop</strong>.
                </p>

                <div>
                  <label className="block font-bold text-stone-700 mb-1">Workshop UPI ID</label>
                  <input
                    type="text"
                    value={settingsForm.workshopUpiId || ''}
                    onChange={(e) => setSettingsForm({ ...settingsForm, workshopUpiId: e.target.value })}
                    placeholder="e.g. workshop.evitron@mec"
                    className="w-full px-3 py-2 bg-white border border-stone-300 rounded-md font-mono outline-none focus:ring-1 focus:ring-[#B22222]"
                  />
                </div>

                <div>
                  <label className="block font-bold text-stone-700 mb-1">Workshop Payee Name</label>
                  <input
                    type="text"
                    value={settingsForm.workshopUpiPayeeName || ''}
                    onChange={(e) => setSettingsForm({ ...settingsForm, workshopUpiPayeeName: e.target.value })}
                    placeholder="e.g. Evitron Workshop"
                    className="w-full px-3 py-2 bg-white border border-stone-300 rounded-md outline-none focus:ring-1 focus:ring-[#B22222]"
                  />
                </div>

                <div>
                  <label className="block font-bold text-stone-700 mb-1">Workshop QR Code Image</label>
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 bg-white border border-stone-300 rounded-lg p-1 flex items-center justify-center shrink-0 overflow-hidden shadow-xs">
                      <img
                        src={settingsForm.workshopUpiQrImageUrl || '/default-upi-qr.jpeg'}
                        alt="Workshop QR"
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <div className="flex-1">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleWorkshopQrFileChange}
                        className="block w-full text-[11px] text-stone-600 file:mr-2 file:py-1 file:px-2.5 file:rounded file:border-0 file:text-[11px] file:font-bold file:bg-[#B22222] file:text-white hover:file:bg-[#961c1c] cursor-pointer"
                      />
                      {workshopQrError && <p className="text-[10px] text-rose-600 mt-1">{workshopQrError}</p>}
                      <button
                        type="button"
                        onClick={() => setSettingsForm({ ...settingsForm, workshopUpiQrImageUrl: '/default-upi-qr.jpeg' })}
                        className="text-[10px] text-stone-500 hover:text-rose-600 font-semibold mt-1 cursor-pointer block"
                      >
                        Reset to Default BHIM QR
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION 2: TECHNICAL / GENERAL EVENTS UPI & QR */}
              <div className="p-4 bg-stone-50 border border-stone-200 rounded-xl space-y-3">
                <h4 className="font-extrabold text-stone-900 text-sm uppercase tracking-wider flex items-center gap-1.5">
                  <Cpu className="w-4 h-4 text-[#B22222]" /> Technical & General Events UPI & QR Code (Permanent)
                </h4>
                <p className="text-[11px] text-stone-600">
                  This specific UPI ID and QR code will be displayed when participants select <strong>Technical Symposium / Paper Presentation</strong>.
                </p>

                <div>
                  <label className="block font-bold text-stone-700 mb-1">Technical Events UPI ID</label>
                  <input
                    type="text"
                    value={settingsForm.techUpiId || ''}
                    onChange={(e) => setSettingsForm({ ...settingsForm, techUpiId: e.target.value })}
                    placeholder="e.g. tech.evitron@mec"
                    className="w-full px-3 py-2 bg-white border border-stone-300 rounded-md font-mono outline-none focus:ring-1 focus:ring-[#B22222]"
                  />
                </div>

                <div>
                  <label className="block font-bold text-stone-700 mb-1">Technical Events Payee Name</label>
                  <input
                    type="text"
                    value={settingsForm.techUpiPayeeName || ''}
                    onChange={(e) => setSettingsForm({ ...settingsForm, techUpiPayeeName: e.target.value })}
                    placeholder="e.g. Evitron Technical Symposium"
                    className="w-full px-3 py-2 bg-white border border-stone-300 rounded-md outline-none focus:ring-1 focus:ring-[#B22222]"
                  />
                </div>

                <div>
                  <label className="block font-bold text-stone-700 mb-1">Technical Events QR Code Image</label>
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 bg-white border border-stone-300 rounded-lg p-1 flex items-center justify-center shrink-0 overflow-hidden shadow-xs">
                      <img
                        src={settingsForm.techUpiQrImageUrl || '/default-upi-qr.jpeg'}
                        alt="Tech QR"
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <div className="flex-1">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleTechQrFileChange}
                        className="block w-full text-[11px] text-stone-600 file:mr-2 file:py-1 file:px-2.5 file:rounded file:border-0 file:text-[11px] file:font-bold file:bg-stone-900 file:text-white hover:file:bg-stone-800 cursor-pointer"
                      />
                      {techQrError && <p className="text-[10px] text-rose-600 mt-1">{techQrError}</p>}
                      <button
                        type="button"
                        onClick={() => setSettingsForm({ ...settingsForm, techUpiQrImageUrl: '/default-upi-qr.jpeg' })}
                        className="text-[10px] text-stone-500 hover:text-rose-600 font-semibold mt-1 cursor-pointer block"
                      >
                        Reset to Default BHIM QR
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* DEFAULT / FALLBACK */}
              <div className="space-y-3 pt-2 border-t border-stone-200">
                <h4 className="font-bold text-stone-900 text-xs uppercase tracking-wider">General Fallback UPI ID & Google Forms</h4>
                <div>
                  <label className="block font-bold text-stone-700 mb-1">Default UPI ID</label>
                  <input
                    type="text"
                    value={settingsForm.upiId}
                    onChange={(e) => setSettingsForm({ ...settingsForm, upiId: e.target.value })}
                    className="w-full px-3 py-2 border border-stone-300 rounded-md font-mono outline-none focus:ring-1 focus:ring-[#B22222]"
                  />
                </div>

                <div>
                  <label className="block font-bold text-stone-700 mb-1">Participant Google Form Upload Link (For Registration Page)</label>
                  <input
                    type="url"
                    value={settingsForm.participantFormUrl || ''}
                    onChange={(e) => setSettingsForm({ ...settingsForm, participantFormUrl: e.target.value })}
                    placeholder="https://docs.google.com/forms/d/e/.../viewform"
                    className="w-full px-3 py-2 border border-stone-300 rounded-md outline-none focus:ring-1 focus:ring-[#B22222]"
                  />
                </div>

                <div>
                  <label className="block font-bold text-stone-700 mb-1">Google Form Responses & Management Link (Admin View)</label>
                  <input
                    type="url"
                    value={settingsForm.driveUploadUrl}
                    onChange={(e) => setSettingsForm({ ...settingsForm, driveUploadUrl: e.target.value })}
                    placeholder="https://docs.google.com/forms/d/.../edit"
                    className="w-full px-3 py-2 border border-stone-300 rounded-md outline-none focus:ring-1 focus:ring-[#B22222]"
                  />
                </div>

                <div className="mt-2 text-[10px] bg-emerald-50 border border-emerald-200 p-2.5 rounded text-emerald-900 leading-relaxed font-semibold">
                  💡 <strong>Supabase Live Cloud Database Active</strong>:
                  <br />
                  Registrations are permanently preserved in your remote Supabase PostgreSQL database. 
                  All dashboard metrics and rosters update instantly in real time across all active sessions. Caching, polling, and Google Sheet dependencies are completely disabled.
                </div>

                <div className="pt-3 border-t border-stone-200">
                  <label className="block font-bold text-stone-900 mb-1">Admin Notification Email IDs (for new registrations waiting verification)</label>
                  <p className="text-[11px] text-stone-500 mb-2">
                    When a new registration is submitted, email notifications are sent to these admin addresses (default: evitron26@gmail.com). You can edit or add multiple admin emails.
                  </p>
                  <div className="space-y-2 mb-2">
                    {(settingsForm.adminNotificationEmails || ['evitron26@gmail.com']).map((email, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => {
                            const newEmails = [...(settingsForm.adminNotificationEmails || ['evitron26@gmail.com'])];
                            newEmails[idx] = e.target.value;
                            setSettingsForm({ ...settingsForm, adminNotificationEmails: newEmails });
                          }}
                          className="flex-1 px-3 py-2 border border-stone-300 rounded-md text-xs font-mono outline-none focus:ring-1 focus:ring-[#B22222]"
                        />
                        {(settingsForm.adminNotificationEmails || []).length > 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              const newEmails = (settingsForm.adminNotificationEmails || []).filter((_, i) => i !== idx);
                              setSettingsForm({ ...settingsForm, adminNotificationEmails: newEmails });
                            }}
                            className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold rounded-md cursor-pointer"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="email"
                      id="newAdminEmailInput"
                      placeholder="Add another admin email (e.g. coordinator@mec.edu)"
                      className="flex-1 px-3 py-2 border border-stone-300 rounded-md text-xs font-mono outline-none focus:ring-1 focus:ring-[#B22222]"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const val = (e.currentTarget as HTMLInputElement).value.trim();
                          if (val && val.includes('@')) {
                            const current = settingsForm.adminNotificationEmails || ['evitron26@gmail.com'];
                            if (!current.includes(val)) {
                              setSettingsForm({ ...settingsForm, adminNotificationEmails: [...current, val] });
                              (e.currentTarget as HTMLInputElement).value = '';
                            }
                          }
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const inputEl = document.getElementById('newAdminEmailInput') as HTMLInputElement;
                        if (inputEl && inputEl.value.trim()) {
                          const val = inputEl.value.trim();
                          if (val.includes('@')) {
                            const current = settingsForm.adminNotificationEmails || ['evitron26@gmail.com'];
                            if (!current.includes(val)) {
                              setSettingsForm({ ...settingsForm, adminNotificationEmails: [...current, val] });
                              inputEl.value = '';
                            }
                          }
                        }
                      }}
                      className="px-4 py-2 bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs rounded-md cursor-pointer"
                    >
                      Add Admin Email
                    </button>
                  </div>

                  {/* Live SMTP Diagnostics & Test Tool */}
                  <div className="mt-4 p-4 bg-stone-50 border border-stone-200 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span className="font-bold text-stone-900 text-xs uppercase tracking-wider">
                          Live SMTP & Vercel Email Diagnostics
                        </span>
                      </div>
                      <span className="text-[10px] bg-stone-200 text-stone-700 px-2 py-0.5 rounded font-mono font-semibold">
                        evitron26@gmail.com
                      </span>
                    </div>
                    <p className="text-[11px] text-stone-500 mb-3">
                      Verify if your Vercel deployment can reach Google's SMTP servers and dispatch real emails. Enter any recipient email address and test.
                    </p>
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      <input
                        type="email"
                        value={testEmailAddress}
                        onChange={(e) => setTestEmailAddress(e.target.value)}
                        placeholder="Recipient email (e.g. evitron26@gmail.com)"
                        className="flex-1 px-3 py-2 border border-stone-300 rounded-md text-xs font-mono outline-none focus:ring-1 focus:ring-[#B22222] bg-white"
                      />
                      <button
                        type="button"
                        onClick={handleSendTestEmail}
                        disabled={testingEmail}
                        className="px-4 py-2 bg-[#B22222] hover:bg-[#961c1c] disabled:opacity-50 text-white font-bold text-xs rounded-md cursor-pointer transition-colors whitespace-nowrap flex items-center justify-center gap-1.5"
                      >
                        {testingEmail ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>Testing Connection...</span>
                          </>
                        ) : (
                          <span>Send Test Email</span>
                        )}
                      </button>
                    </div>

                    {testEmailResult && (
                      <div
                        className={`mt-3 p-3 rounded-md text-xs border ${
                          testEmailResult.sent
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                            : 'bg-rose-50 border-rose-200 text-rose-800'
                        }`}
                      >
                        <div className="font-bold mb-0.5">
                          {testEmailResult.sent ? '✓ Email Dispatch Successful' : '✗ Email Dispatch Failed'}
                        </div>
                        <div className="font-mono text-[11px] break-all">{testEmailResult.message}</div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Workshop Registration Control Panel */}
                <div className="pt-5 border-t border-stone-200">
                  <h4 className="text-sm font-extrabold text-stone-900 mb-1 uppercase tracking-wider flex items-center gap-1.5">
                    ⚙️ Workshop Registration Control Panel
                  </h4>
                  <p className="text-[11px] text-stone-500 mb-3">
                    Manually open or close registrations for specific workshops. When closed, students will be prevented from selecting that workshop during registration, and an active marquee notification will automatically stream on the homepage.
                  </p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    {[
                      { id: 'silicon-2-gds', keys: ['silicon-2-gds', 'ws-silicon-2-gds', '4e91a80e-4baa-4fc2-bf6c-7f95e135fc80'], name: 'SILICON 2 GDS' },
                      { id: 'embedded-system', keys: ['embedded-system', 'ws-embedded-system', 'd6699fda-e9a5-404d-88e8-bd9e0610988e'], name: 'Embedded System' },
                      { id: 'virtual-instrumentation', keys: ['virtual-instrumentation', 'ws-virtual-instrumentation', 'ee27539a-2318-44da-9697-bb859ed57a50'], name: 'Virtual Instrumentation' },
                    ].map((ws) => {
                      const isClosed = isEventClosedStrict(ws.id, settingsForm.closedWorkshops || [], events);
                      return (
                        <div key={ws.id} className={`p-3.5 border rounded-xl flex items-center justify-between gap-3 transition-all ${isClosed ? 'bg-rose-50 border-rose-300 shadow-2xs' : 'bg-emerald-50/30 border-stone-200'}`}>
                          <div>
                            <span className="font-extrabold text-xs text-stone-900 block">{ws.name}</span>
                            <span className={`text-[10px] font-extrabold tracking-wider ${isClosed ? 'text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded border border-rose-200' : 'text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded border border-emerald-200'}`}>
                              {isClosed ? '🔴 STRICTLY CLOSED' : '🟢 OPEN FOR REGISTRATION'}
                            </span>
                          </div>
                          
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                const next = await setWorkshopClosureApi(token, isClosed ? 'open' : 'close', ws.keys);
                                setSettingsForm((prev) => ({ ...prev, closedWorkshops: next, closureStateLoaded: true }));
                                onRefreshSettings();
                                showNotification(`Registration for ${ws.name} is now strictly ${isClosed ? 'OPEN' : 'CLOSED'}.`, 'success');
                              } catch (err: any) {
                                showNotification(err.message || 'Failed to persist workshop closure.', 'error');
                              }
                            }}
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-extrabold cursor-pointer transition-colors shadow-xs ${isClosed ? 'bg-emerald-700 hover:bg-emerald-800 text-white' : 'bg-rose-700 hover:bg-rose-800 text-white'}`}
                          >
                            {isClosed ? '🔓 Open Workshop' : '🔒 Strict Close'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="px-6 py-3 bg-[#B22222] hover:bg-[#961c1c] active:bg-[#7e1717] text-white font-bold text-xs rounded-xl shadow-md cursor-pointer"
                >
                  Save Permanent Payment Settings
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TAB 4: EVENT COORDINATORS CMS */}
      {activeTab === 'events' && (
        <div className="bg-white border border-stone-200 rounded-xl p-6 shadow-xs">
          <div className="mb-4">
            <h3 className="text-base font-extrabold text-stone-900">
              Event Details & Coordinator Management
            </h3>
            <p className="text-xs text-stone-500">
              Select an event to update coordinators, venues, and descriptions. These details are not hardcoded.
            </p>
          </div>

          <div className="mb-6 max-w-md">
            <label className="block text-xs font-bold text-stone-700 mb-1">
              Select Event to Edit:
            </label>
            <select
              value={selectedEventId}
              onChange={(e) => setSelectedEventId(e.target.value)}
              className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-md text-xs font-bold text-stone-900 outline-none"
            >
              {events.map((evt) => (
                <option key={evt.id} value={evt.id}>
                  [{evt.category.toUpperCase()}] {evt.title}
                </option>
              ))}
            </select>
          </div>

          {eventForm && (
            <form onSubmit={handleSaveEvent} className="space-y-4 text-xs max-w-2xl">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-stone-700 mb-1">Event Title</label>
                  <input
                    type="text"
                    value={eventForm.title || ''}
                    onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })}
                    className="w-full px-3 py-2 border border-stone-300 rounded-md outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-stone-700 mb-1">Tagline / Subtitle</label>
                  <input
                    type="text"
                    value={eventForm.tagline || ''}
                    onChange={(e) => setEventForm({ ...eventForm, tagline: e.target.value })}
                    className="w-full px-3 py-2 border border-stone-300 rounded-md outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-stone-700 mb-1">Coordinator Name</label>
                  <input
                    type="text"
                    value={eventForm.coordinatorName || ''}
                    onChange={(e) => setEventForm({ ...eventForm, coordinatorName: e.target.value })}
                    className="w-full px-3 py-2 border border-stone-300 rounded-md outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-stone-700 mb-1">Coordinator Phone</label>
                  <input
                    type="text"
                    value={eventForm.coordinatorPhone || ''}
                    onChange={(e) => setEventForm({ ...eventForm, coordinatorPhone: e.target.value })}
                    className="w-full px-3 py-2 border border-stone-300 rounded-md outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-stone-700 mb-1">Venue</label>
                  <input
                    type="text"
                    value={eventForm.venue || ''}
                    onChange={(e) => setEventForm({ ...eventForm, venue: e.target.value })}
                    className="w-full px-3 py-2 border border-stone-300 rounded-md outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-stone-700 mb-1">Time Slot</label>
                  <input
                    type="text"
                    value={eventForm.time || ''}
                    onChange={(e) => setEventForm({ ...eventForm, time: e.target.value })}
                    className="w-full px-3 py-2 border border-stone-300 rounded-md outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-stone-700 mb-1">Event Description</label>
                <textarea
                  rows={3}
                  value={eventForm.description || ''}
                  onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })}
                  className="w-full px-3 py-2 border border-stone-300 rounded-md outline-none"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-[#B22222] hover:bg-[#961c1c] active:bg-[#7e1717] text-white font-bold rounded-lg cursor-pointer"
                >
                  Save Event Details
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* TAB 5: SITE SETTINGS */}
      {activeTab === 'settings' && (
        <div className="bg-white border border-stone-200 rounded-xl p-6 shadow-xs max-w-2xl">
          <h3 className="text-base font-extrabold text-stone-900 mb-4">
            Symposium Dates & Announcements
          </h3>

          <form onSubmit={handleSaveSettings} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-bold text-stone-700 mb-1">Symposium Title</label>
                <input
                  type="text"
                  value={settingsForm.symposiumTitle}
                  onChange={(e) => setSettingsForm({ ...settingsForm, symposiumTitle: e.target.value })}
                  className="w-full px-3 py-2 border border-stone-300 rounded-md outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-stone-700 mb-1">Event Date</label>
                <input
                  type="text"
                  value={settingsForm.eventDate}
                  onChange={(e) => setSettingsForm({ ...settingsForm, eventDate: e.target.value })}
                  className="w-full px-3 py-2 border border-stone-300 rounded-md outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-stone-700 mb-1">Registration Last Date</label>
                <input
                  type="text"
                  value={settingsForm.registrationDeadline}
                  onChange={(e) => setSettingsForm({ ...settingsForm, registrationDeadline: e.target.value })}
                  placeholder="e.g. 05/10/2026"
                  className="w-full px-3 py-2 border border-stone-300 rounded-md outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-stone-700 mb-1">Abstract Last Date (Paper Presentation)</label>
                <input
                  type="text"
                  value={settingsForm.paperSubmissionDeadline}
                  onChange={(e) => setSettingsForm({ ...settingsForm, paperSubmissionDeadline: e.target.value })}
                  placeholder="e.g. 03/10/2026"
                  className="w-full px-3 py-2 border border-stone-300 rounded-md outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block font-bold text-stone-700 mb-1">Announcement Banner Text</label>
              <textarea
                rows={2}
                value={settingsForm.announcementText}
                onChange={(e) => setSettingsForm({ ...settingsForm, announcementText: e.target.value })}
                className="w-full px-3 py-2 border border-stone-300 rounded-md outline-none"
              />
            </div>

            {/* Emergency Site Maintenance Mode Configuration */}
            <div className={`p-4 rounded-xl border transition-all ${settingsForm.isMaintenanceMode ? 'bg-amber-50 border-amber-300' : 'bg-stone-50 border-stone-200'}`}>
              <div className="flex items-center justify-between gap-4 mb-2">
                <div>
                  <h4 className="font-extrabold text-stone-900 text-xs uppercase tracking-wider flex items-center gap-1.5">
                    🛠️ Portal Maintenance & Temporary Lock
                  </h4>
                  <p className="text-[11px] text-stone-600 mt-0.5">
                    When enabled, all visitors to public pages are shown the "Site Under Maintenance" screen with your custom message while administrative updates are being performed.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleToggleMaintenance}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black cursor-pointer transition-all shrink-0 shadow-xs ${
                    settingsForm.isMaintenanceMode
                      ? 'bg-emerald-700 hover:bg-emerald-800 text-white'
                      : 'bg-amber-600 hover:bg-amber-700 text-white'
                  }`}
                >
                  {settingsForm.isMaintenanceMode ? 'Turn OFF Maintenance' : 'Turn ON Maintenance'}
                </button>
              </div>

              <div className="mt-3">
                <label className="block font-bold text-stone-700 mb-1">
                  Public Maintenance Message Displayed to Users
                </label>
                <textarea
                  rows={2}
                  value={settingsForm.maintenanceMessage || ''}
                  onChange={(e) => setSettingsForm({ ...settingsForm, maintenanceMessage: e.target.value })}
                  placeholder="e.g. EVITRON 2K26 is currently undergoing scheduled maintenance & system upgrades. Please try again later or contact event coordinators."
                  className="w-full px-3 py-2 bg-white border border-stone-300 rounded-md outline-none text-xs"
                />
              </div>
            </div>

            {/* Event Pricing (Fixed Price Rules) */}
            <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-3">
              <h4 className="font-extrabold text-emerald-900 text-xs uppercase tracking-wider flex items-center gap-1.5">
                💰 Event Pricing Configuration (Fixed Rates)
              </h4>
              <p className="text-[11px] text-emerald-800 leading-relaxed">
                Symposium event pricing is permanently fixed: <strong>₹250 per technical person</strong> and <strong>₹300 per workshop person</strong>. No changes or standard price surcharges.
              </p>

              <div className="flex items-center gap-2 py-1">
                <input
                  type="checkbox"
                  id="forceEarlyBird"
                  checked={settingsForm.forceEarlyBird || false}
                  onChange={(e) => setSettingsForm({ ...settingsForm, forceEarlyBird: e.target.checked })}
                  className="w-4 h-4 text-emerald-600 focus:ring-emerald-500 border-stone-300 rounded cursor-pointer"
                />
                <label htmlFor="forceEarlyBird" className="font-bold text-stone-900 cursor-pointer">
                  Fixed Pricing Active (Technical: ₹250, Workshop: ₹300)
                </label>
              </div>

              <div>
                <label className="block font-bold text-stone-700 mb-1">
                  Registration Cutoff Date (ISO Date Format)
                </label>
                <input
                  type="text"
                  value={settingsForm.earlyBirdDeadline || '2026-10-05T23:59:59+05:30'}
                  onChange={(e) => setSettingsForm({ ...settingsForm, earlyBirdDeadline: e.target.value })}
                  placeholder="e.g. 2026-10-05T23:59:59+05:30"
                  className="w-full px-3 py-2 bg-white border border-stone-300 rounded-md font-mono outline-none focus:ring-1 focus:ring-emerald-500 text-xs"
                />
                <span className="text-[10px] text-stone-500 mt-1 block">
                  Format: <code>YYYY-MM-DDTHH:MM:SS+05:30</code> (IST) — Last registration date: 05/10/2026
                </span>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                className="px-5 py-2.5 bg-[#B22222] hover:bg-[#961c1c] active:bg-[#7e1717] text-white font-bold rounded-lg cursor-pointer"
              >
                Save Site Settings
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB 6: EVENT DAY ATTENDANCE SCANNER */}
      {activeTab === 'attendance' && (
        <div className="bg-white border border-stone-200 rounded-xl p-6 shadow-xs max-w-xl">
          <div className="mb-4">
            <h3 className="text-base font-extrabold text-stone-900">
              Event-Day QR Attendance Desk
            </h3>
            <p className="text-xs text-stone-500">
              Scan or enter the attendee Registration ID to verify payment and mark attendance.
            </p>
          </div>

          <div className="flex items-center gap-2 mb-4">
            <input
              type="text"
              value={attendanceSearchId}
              onChange={(e) => setAttendanceSearchId(e.target.value.toUpperCase())}
              placeholder="e.g. EV26-XXXXXX"
              className="w-full px-3 py-2.5 border border-stone-300 rounded-lg text-xs font-mono font-bold outline-none"
            />
            <button
              onClick={handleMarkAttendance}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg cursor-pointer shrink-0"
            >
              Check-In Attendee
            </button>
          </div>

          {attendanceResult && (
            <div
              className={`p-4 rounded-lg text-xs ${
                attendanceResult.success
                  ? 'bg-emerald-50 border border-emerald-200 text-emerald-900'
                  : 'bg-red-50 border border-red-200 text-red-900'
              }`}
            >
              <span className="font-bold block mb-1">
                {attendanceResult.success ? 'Success' : 'Error'}
              </span>
              <p>{attendanceResult.message}</p>
              {attendanceResult.registration && (
                <div className="mt-2 pt-2 border-t border-emerald-200/50 space-y-1">
                  <div>
                    <span className="font-semibold">Leader:</span> {attendanceResult.registration.teamLeader.fullName}
                  </div>
                  <div>
                    <span className="font-semibold">College:</span> {attendanceResult.registration.teamLeader.college}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Production Switch Confirmation Modal */}
      {showProdConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-md w-full shadow-xl">
            <h3 className="font-extrabold text-stone-900 mb-2 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-rose-600" /> Switch to PRODUCTION?
            </h3>
            <p className="text-xs text-stone-600 mb-4 leading-relaxed">
              Production strictly requires real LIVE Razorpay credentials (<code>rzp_live_...</code>).
              Test keys and simulated payments are not allowed. The server will reject this switch
              if live credentials aren't configured.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowProdConfirm(false)}
                className="px-4 py-2 text-xs font-bold rounded-lg bg-stone-100 hover:bg-stone-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowProdConfirm(false);
                  applyEnvironmentSwitch('production');
                }}
                className="px-4 py-2 text-xs font-bold rounded-lg bg-rose-700 hover:bg-rose-800 text-white cursor-pointer"
              >
                Confirm Switch
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Verify Payment Confirmation Modal */}
      {verifyConfirmReg && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-md w-full shadow-xl">
            <h3 className="font-extrabold text-stone-900 mb-2 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-600" /> Confirm Payment & Email Dispatch
            </h3>
            <p className="text-xs text-stone-600 mb-4 leading-relaxed">
              Are you sure you want to verify payment for registration <strong>{verifyConfirmReg.id}</strong> ({verifyConfirmReg.teamLeader.fullName})? This will generate the attendee QR pass, send an official confirmation email from <code>evitron26@gmail.com</code>, and update the record in Supabase.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setVerifyConfirmReg(null)}
                className="px-4 py-2 text-xs font-bold rounded-lg bg-stone-100 hover:bg-stone-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const regId = verifyConfirmReg.id;
                  setVerifyConfirmReg(null);
                  handleUpdateStatus(regId, 'paid');
                }}
                className="px-4 py-2 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
              >
                Acknowledge & Proceed
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Registration Password Confirmation Modal */}
      {deleteConfirmReg && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-md w-full shadow-xl">
            <h3 className="font-extrabold text-stone-900 mb-2 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-rose-600" /> Delete Registration Record
            </h3>
            <p className="text-xs text-stone-600 mb-3 leading-relaxed">
              Warning: You are about to permanently delete registration <strong>{deleteConfirmReg.id}</strong> ({deleteConfirmReg.teamLeader.fullName}) from the admin records and spreadsheet.
            </p>
            <div className="mb-4">
              <label className="block text-xs font-bold text-stone-700 mb-1">Enter Admin Delete Password to Confirm:</label>
              <input
                type="password"
                value={deletePasswordInput}
                onChange={(e) => {
                  setDeletePasswordInput(e.target.value);
                  setDeletePasswordError('');
                }}
                placeholder="Enter password..."
                className="w-full px-3 py-2 border border-stone-300 rounded-md text-xs outline-none focus:ring-1 focus:ring-rose-600 font-mono"
                autoFocus
              />
              {deletePasswordError && (
                <p className="text-[11px] text-rose-600 font-semibold mt-1">{deletePasswordError}</p>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteConfirmReg(null)}
                className="px-4 py-2 text-xs font-bold rounded-lg bg-stone-100 hover:bg-stone-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteRegistration}
                className="px-4 py-2 text-xs font-bold rounded-lg bg-rose-600 hover:bg-rose-700 text-white cursor-pointer"
              >
                Confirm & Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Proof Preview Modal */}
      {activeProofUrl && (
        (() => {
          const getGoogleDriveDisplayDetails = (url: string) => {
            if (!url) return null;
            const isGDrive = url.includes('drive.google.com');
            if (!isGDrive) return null;

            let fileId = '';
            const matchD = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
            if (matchD && matchD[1]) {
              fileId = matchD[1];
            } else {
              const matchId = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
              if (matchId && matchId[1]) {
                fileId = matchId[1];
              }
            }

            if (fileId) {
              return {
                fileId,
                thumbnailUrl: `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000`,
                directDownloadUrl: `https://docs.google.com/uc?export=download&id=${fileId}`,
                viewUrl: `https://drive.google.com/file/d/${fileId}/view`,
              };
            }
            return null;
          };

          return (
            <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 animate-fade-in">
              <div className="bg-white rounded-2xl p-6 max-w-xl w-full shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
                <div className="flex items-center justify-between border-b border-stone-100 pb-2">
                  <h3 className="font-extrabold text-stone-950 text-sm">
                    Payment Proof - {activeProofRegId}
                  </h3>
                  <button
                    onClick={() => {
                      setActiveProofUrl(null);
                      setActiveProofRegId(null);
                    }}
                    className="text-stone-400 hover:text-stone-700 font-extrabold text-lg px-2 cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
                
                <div className="flex-1 overflow-auto flex items-center justify-center bg-stone-50 rounded-xl border border-stone-200 p-2 min-h-[250px]">
                  {(() => {
                    if (activeProofUrl.startsWith('data:application/pdf')) {
                      return (
                        <div className="text-center space-y-4 p-6">
                          <FileText className="w-16 h-16 text-[#B22222] mx-auto animate-pulse" />
                          <p className="text-xs text-stone-600 font-semibold">This payment proof is submitted as a PDF file.</p>
                          <a
                            href={activeProofUrl}
                            download={`Payment_Proof_${activeProofRegId}.pdf`}
                            className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-[#B22222] hover:bg-[#961c1c] text-white font-bold text-xs rounded-lg shadow-xs cursor-pointer"
                          >
                            <Download className="w-4 h-4" /> Download Payment PDF Proof
                          </a>
                        </div>
                      );
                    }

                    const driveDetails = getGoogleDriveDisplayDetails(activeProofUrl);
                    if (driveDetails) {
                      return (
                        <div className="text-center space-y-4 p-4 w-full flex flex-col items-center">
                          <img
                            src={driveDetails.thumbnailUrl}
                            alt="Google Drive Payment Proof"
                            className="max-w-full max-h-[50vh] object-contain rounded-lg shadow-sm border border-stone-200 bg-white p-1"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                              const fallbackDiv = document.getElementById('drive-fallback');
                              if (fallbackDiv) fallbackDiv.style.display = 'block';
                            }}
                          />
                          <div id="drive-fallback" style={{ display: 'none' }} className="space-y-2 py-4">
                            <FileSpreadsheet className="w-16 h-16 text-[#B22222] mx-auto animate-bounce" />
                            <p className="text-xs text-stone-600 font-semibold">File uploaded to Google Drive folder.</p>
                          </div>
                          <div className="flex flex-wrap gap-2 justify-center">
                            <a
                              href={driveDetails.viewUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-[#B22222] hover:bg-[#961c1c] text-white font-bold text-xs rounded-lg shadow-xs cursor-pointer"
                            >
                              <ExternalLink className="w-4 h-4" /> View Direct on Google Drive
                            </a>
                          </div>
                        </div>
                      );
                    }

                    // Check for "Upload Failed" error text or N/A
                    if (activeProofUrl.startsWith('Upload Failed:') || activeProofUrl === 'N/A') {
                      return (
                        <div className="text-center space-y-3 p-6 max-w-sm">
                          <AlertCircle className="w-12 h-12 text-rose-600 mx-auto animate-pulse" />
                          <p className="text-xs text-stone-800 font-extrabold">Payment Proof Unavailable</p>
                          <p className="text-[11px] text-stone-500 leading-relaxed">
                            The file upload to Google Drive failed: <code className="block mt-1.5 p-2 bg-stone-100 rounded border text-stone-700 font-mono text-[10px] break-all">{activeProofUrl}</code>
                          </p>
                          <div className="pt-2">
                            <div className="text-[10px] bg-amber-50 border border-amber-200 p-2.5 rounded text-amber-900 leading-relaxed text-left space-y-1">
                              <strong>💡 How to Resolve This Permissions Issue:</strong>
                              <p>1. Open your Google Sheet.</p>
                              <p>2. Go to <strong>Extensions &gt; Apps Script</strong>.</p>
                              <p>3. Select <code>authorizeScript</code> in the top toolbar dropdown and click <strong>Run</strong>.</p>
                              <p>4. Click <strong>Review Permissions</strong> in the authorization dialog, select your Google Account, click <strong>Advanced &gt; Go to EVITRON... (unsafe)</strong>, and click <strong>Allow</strong>.</p>
                              <p>5. Click <strong>Deploy &gt; New deployment</strong>. Ensure Execute as is "Me" and Access is "Anyone". Click <strong>Deploy</strong>.</p>
                              <p>6. Copy the new Webhook URL and paste it under "UPI &amp; Payment Controls" settings below.</p>
                            </div>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <img
                        src={activeProofUrl}
                        alt="Payment Proof"
                        className="max-w-full max-h-[55vh] object-contain rounded-lg shadow-xs"
                      />
                    );
                  })()}
                </div>

                <div className="flex justify-end pt-2 border-t border-stone-100 gap-2">
                  {(() => {
                    const driveDetails = getGoogleDriveDisplayDetails(activeProofUrl);
                    const isFailed = activeProofUrl.startsWith('Upload Failed:') || activeProofUrl === 'N/A';
                    if (isFailed) return null;

                    if (driveDetails) {
                      return (
                        <a
                          href={driveDetails.viewUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-4 py-2 text-xs font-bold rounded-lg bg-[#B22222] hover:bg-[#961c1c] text-white cursor-pointer flex items-center gap-1"
                        >
                          <ExternalLink className="w-3.5 h-3.5" /> View on Google Drive
                        </a>
                      );
                    }

                    return (
                      <a
                        href={activeProofUrl}
                        download={`Payment_Proof_${activeProofRegId}.${activeProofUrl.startsWith('data:application/pdf') ? 'pdf' : 'png'}`}
                        className="px-4 py-2 text-xs font-bold rounded-lg bg-[#B22222] hover:bg-[#961c1c] text-white cursor-pointer flex items-center gap-1"
                      >
                        <Download className="w-3.5 h-3.5" /> Download
                      </a>
                    );
                  })()}
                  <button
                    onClick={() => {
                      setActiveProofUrl(null);
                      setActiveProofRegId(null);
                    }}
                    className="px-4 py-2 text-xs font-bold rounded-lg bg-stone-100 hover:bg-stone-200 cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          );
        })()
      )}
    </div>
  );
};