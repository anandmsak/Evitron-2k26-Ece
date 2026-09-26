import React, { useState } from 'react';
import {
  ShieldAlert,
  Users,
  Wrench,
  Cpu,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  QrCode,
  CreditCard,
  ExternalLink,
  Copy,
  Printer,
  Download,
  ArrowLeft,
  Check,
  Ticket,
  UserPlus,
  Trash2,
  Upload,
} from 'lucide-react';
import { EventItem, Participant, RegistrationRecord, SiteSettings } from '../types';
import { defaultSettings } from '../data/defaultSettings';
import { createOrder, verifyPayment, submitUpiRegistration } from '../services/api';
import { getPricePerPerson, isEarlyBirdActive } from '../utils/pricing';
import QRCode from 'qrcode';

interface RegistrationPageProps {
  events: EventItem[];
  settings?: SiteSettings;
  onNavigate: (path: string) => void;
}

const DRAFT_KEY = 'evitron_reg_draft_v3';

function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY) || sessionStorage.getItem(DRAFT_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {}
  return null;
}

export const RegistrationPage: React.FC<RegistrationPageProps> = ({ events, settings: propSettings, onNavigate }) => {
  const settings = propSettings || defaultSettings;
  const initialDraft = React.useMemo(() => loadDraft(), []);
  const [restoredNotice, setRestoredNotice] = useState<boolean>(() => Boolean(initialDraft && (initialDraft.participants?.[0]?.fullName || initialDraft.chosenTrack || initialDraft.upiReference)));

  // Step: 'selection' | 'form' | 'payment' | 'success'
  const [step, setStep] = useState<'selection' | 'form' | 'payment' | 'success'>(() => {
    if (initialDraft && initialDraft.step && initialDraft.step !== 'success') {
      return initialDraft.step;
    }
    return 'selection';
  });

  // Track selection: 'workshop' | 'technical' | null
  const [chosenTrack, setChosenTrack] = useState<'workshop' | 'technical' | null>(() => initialDraft?.chosenTrack || null);

  // Selected event IDs
  const [selectedWorkshopId, setSelectedWorkshopId] = useState<string>(() => initialDraft?.selectedWorkshopId || '');
  const [selectedTechnicalIds, setSelectedTechnicalIds] = useState<string[]>(() => initialDraft?.selectedTechnicalIds || []);
  const [selectedNonTechnicalIds, setSelectedNonTechnicalIds] = useState<string[]>(() => initialDraft?.selectedNonTechnicalIds || []);

  // Participants form state
  // Workshop: 1 participant. Technical: 2 to 4 participants (Leader + Member 2 compulsory, up to 4 total)
  const [participants, setParticipants] = useState<Participant[]>(() => {
    if (initialDraft?.participants && Array.isArray(initialDraft.participants) && initialDraft.participants.length > 0) {
      return initialDraft.participants;
    }
    return [
      { fullName: '', email: '', phone: '', college: '', department: '', year: '' },
      { fullName: '', email: '', phone: '', college: '', department: '', year: '' },
    ];
  });

  // UPI Form state
  const [upiReference, setUpiReference] = useState(() => initialDraft?.upiReference || '');
  const [upiCopied, setUpiCopied] = useState(false);
  const [paymentMode, setPaymentMode] = useState<'manual'>('manual');
  const [paperSubmissionConfirmation, setPaperSubmissionConfirmation] = useState(() => initialDraft?.paperSubmissionConfirmation || '');

  // UI state
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [confirmedRegistration, setConfirmedRegistration] = useState<RegistrationRecord | null>(null);
  const [ticketQrDataUrl, setTicketQrDataUrl] = useState<string>('');
  const [processingStep, setProcessingStep] = useState<number>(1);

  const [paymentScreenshotBase64, setPaymentScreenshotBase64] = useState<string>(() => initialDraft?.paymentScreenshotBase64 || '');
  const [paymentScreenshotFileName, setPaymentScreenshotFileName] = useState<string>(() => initialDraft?.paymentScreenshotFileName || '');
  const [paymentScreenshotError, setPaymentScreenshotError] = useState<string | null>(null);

  // Synchronize and normalize selectedWorkshopId if events list loads after initial render
  React.useEffect(() => {
    if (chosenTrack === 'workshop' && selectedWorkshopId && events.length > 0) {
      const match = events.find(
        (e) =>
          e.category === 'workshops' &&
          (e.id === selectedWorkshopId ||
            e.slug === selectedWorkshopId ||
            e.title.toLowerCase() === selectedWorkshopId.toLowerCase())
      );
      if (match && match.id !== selectedWorkshopId) {
        setSelectedWorkshopId(match.id);
      }
    }
  }, [events, chosenTrack, selectedWorkshopId]);

  // Persistent auto-save handler to guarantee no data loss when switching to UPI payment apps (PhonePe, GPay, Paytm)
  const saveDraftToStorage = React.useCallback(() => {
    if (step === 'success') {
      try {
        localStorage.removeItem(DRAFT_KEY);
        sessionStorage.removeItem(DRAFT_KEY);
      } catch {}
      return;
    }

    try {
      const draftData = {
        step,
        chosenTrack,
        selectedWorkshopId,
        selectedTechnicalIds,
        selectedNonTechnicalIds,
        participants,
        upiReference,
        paperSubmissionConfirmation,
        paymentScreenshotBase64: (paymentScreenshotBase64 && paymentScreenshotBase64.length < 500000) ? paymentScreenshotBase64 : '',
        paymentScreenshotFileName,
        savedAt: Date.now(),
      };
      const serialized = JSON.stringify(draftData);
      localStorage.setItem(DRAFT_KEY, serialized);
      sessionStorage.setItem(DRAFT_KEY, serialized);
    } catch {
      try {
        const fallbackDraft = {
          step,
          chosenTrack,
          selectedWorkshopId,
          selectedTechnicalIds,
          selectedNonTechnicalIds,
          participants,
          upiReference,
          paperSubmissionConfirmation,
          paymentScreenshotFileName,
          savedAt: Date.now(),
        };
        const serialized = JSON.stringify(fallbackDraft);
        localStorage.setItem(DRAFT_KEY, serialized);
        sessionStorage.setItem(DRAFT_KEY, serialized);
      } catch {}
    }
  }, [
    step,
    chosenTrack,
    selectedWorkshopId,
    selectedTechnicalIds,
    selectedNonTechnicalIds,
    participants,
    upiReference,
    paperSubmissionConfirmation,
    paymentScreenshotBase64,
    paymentScreenshotFileName,
  ]);

  React.useEffect(() => {
    saveDraftToStorage();
  }, [saveDraftToStorage]);

  // Hook into browser lifecycle events: save immediately when user minimizes or switches to UPI apps
  React.useEffect(() => {
    const handleLeave = () => {
      saveDraftToStorage();
    };
    window.addEventListener('pagehide', handleLeave);
    window.addEventListener('beforeunload', handleLeave);
    document.addEventListener('visibilitychange', handleLeave);
    return () => {
      window.removeEventListener('pagehide', handleLeave);
      window.removeEventListener('beforeunload', handleLeave);
      document.removeEventListener('visibilitychange', handleLeave);
    };
  }, [saveDraftToStorage]);

  const handleClearDraft = () => {
    try {
      localStorage.removeItem(DRAFT_KEY);
      sessionStorage.removeItem(DRAFT_KEY);
    } catch {}
    setStep('selection');
    setChosenTrack(null);
    setSelectedWorkshopId('');
    setSelectedTechnicalIds([]);
    setSelectedNonTechnicalIds([]);
    setParticipants([
      { fullName: '', email: '', phone: '', college: '', department: '', year: '' },
      { fullName: '', email: '', phone: '', college: '', department: '', year: '' },
    ]);
    setUpiReference('');
    setPaperSubmissionConfirmation('');
    setPaymentScreenshotBase64('');
    setPaymentScreenshotFileName('');
    setRestoredNotice(false);
  };

  const handleScreenshotChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPaymentScreenshotError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      setPaymentScreenshotError('Invalid file type! Only PDF, PNG, JPG, or JPEG screenshots are supported.');
      setPaymentScreenshotBase64('');
      setPaymentScreenshotFileName('');
      e.target.value = '';
      return;
    }

    if (file.size > 500 * 1024) {
      setPaymentScreenshotError('File is too large! Strictly must be under 500KB to submit.');
      setPaymentScreenshotBase64('');
      setPaymentScreenshotFileName('');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setPaymentScreenshotBase64(reader.result as string);
      setPaymentScreenshotFileName(file.name);
    };
    reader.onerror = () => {
      setPaymentScreenshotError('Failed to parse file. Please try another screenshot/PDF.');
      setPaymentScreenshotBase64('');
      setPaymentScreenshotFileName('');
    };
    reader.readAsDataURL(file);
  };

  React.useEffect(() => {
    let interval: any;
    if (isProcessing) {
      setProcessingStep(1);
      interval = setInterval(() => {
        setProcessingStep((prev) => (prev < 4 ? prev + 1 : prev));
      }, 1800);
    } else {
      setProcessingStep(1);
    }
    return () => clearInterval(interval);
  }, [isProcessing]);

  const workshops = events.filter((e) => e.category === 'workshops');
  const technicalEvents = events.filter((e) => e.category === 'technical');
  const nonTechnicalEvents = events.filter((e) => e.category === 'non-technical');

  // If registrations are globally closed by admin
  if (!settings.isRegistrationOpen) {
    return (
      <div className="py-16 max-w-2xl mx-auto px-4 text-center">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-8 shadow-xs">
          <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center mx-auto mb-4">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-extrabold text-stone-900 mb-2">Registrations Closed</h1>
          <p className="text-sm text-stone-600 mb-6 leading-relaxed">
            {settings.closedReason || 'Online registrations for EVITRON 2K26 are currently closed.'}
          </p>
          <div className="text-xs text-stone-500 border-t border-amber-200 pt-4">
            For spot registration inquiries or coordinator assistance, please contact:{' '}
            <span className="font-semibold text-stone-800">{settings.contactEmail}</span>
          </div>
          <div className="mt-6">
            <button
              onClick={() => onNavigate('/')}
              className="px-5 py-2.5 bg-stone-900 text-white text-xs font-bold rounded-lg"
            >
              Return to Homepage
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------
  // EVENT SELECTION LOGIC (STRICT RULE ENFORCEMENT)
  // 1. Workshop: strictly 1 workshop only. No tech, no non-tech. (Individual pass: 1 person).
  // 2. Technical: strictly 1 technical event only (Team of 2 to 4 members).
  // 3. Non-Technical: strictly at most 1 non-technical event, ONLY IF 1 technical event is selected.
  //    Non-technical alone can NEVER be selected.
  // ----------------------------------------------------

  const handleSelectWorkshop = (id: string) => {
    setErrorMsg(null);
    if (selectedWorkshopId === id) {
      setSelectedWorkshopId('');
      setChosenTrack(null);
    } else {
      setChosenTrack('workshop');
      setSelectedWorkshopId(id);
      setSelectedTechnicalIds([]);
      setSelectedNonTechnicalIds([]);
    }
  };

  const handleToggleTechnical = (id: string) => {
    setSelectedWorkshopId(''); // Workshop disappears/clears
    setErrorMsg(null);

    if (selectedTechnicalIds.includes(id)) {
      // Deselect technical -> clear non-technical as well since non-tech cannot exist without tech
      setSelectedTechnicalIds([]);
      setSelectedNonTechnicalIds([]);
      setChosenTrack(null);
    } else {
      // Strictly 1 technical event allowed (replaces any previous technical selection)
      setChosenTrack('technical');
      setSelectedTechnicalIds([id]);
    }
  };

  const handleToggleNonTechnical = (id: string) => {
    // RULE: Non-technical alone is strictly NOT ALLOWED
    if (selectedTechnicalIds.length === 0) {
      setErrorMsg('Please select 1 technical event first before choosing a non-technical event. Non-technical events cannot be selected alone.');
      return;
    }
    setErrorMsg(null);

    if (selectedNonTechnicalIds.includes(id)) {
      // Deselecting non-tech is allowed (optional)
      setSelectedNonTechnicalIds([]);
    } else {
      // Strictly at most 1 non-technical event allowed (replaces any previous non-tech selection)
      setSelectedNonTechnicalIds([id]);
    }
  };

  // Dynamic Fee Calculation
  let totalAmount = 0;
  if (chosenTrack === 'workshop' && selectedWorkshopId) {
    totalAmount = getPricePerPerson('workshop', settings); // 1 person
  } else if (chosenTrack === 'technical' && selectedTechnicalIds.length > 0) {
    const memberCount = Math.max(2, Math.min(participants.length, 4));
    totalAmount = memberCount * getPricePerPerson('technical', settings); // dynamic pricing per member (2 to 4 members)
  }

  // Validate step 1 (Event Selection)
  const validateEventSelection = () => {
    setErrorMsg(null);
    if (!chosenTrack) {
      setErrorMsg('Please select a workshop or technical event to proceed.');
      return false;
    }
    if (chosenTrack === 'workshop') {
      if (!selectedWorkshopId) {
        setErrorMsg('Please select strictly 1 workshop.');
        return false;
      }
      return true;
    }
    if (chosenTrack === 'technical') {
      if (selectedTechnicalIds.length === 0) {
        setErrorMsg('Please select 1 technical event before proceeding.');
        return false;
      }
      if (selectedTechnicalIds.length > 1) {
        setErrorMsg('Strictly only 1 technical event can be selected.');
        return false;
      }
      if (selectedNonTechnicalIds.length > 1) {
        setErrorMsg('Strictly at most 1 non-technical event can be selected.');
        return false;
      }
      return true;
    }
    return false;
  };

  const handleProceedToForm = () => {
    if (validateEventSelection()) {
      setStep('form');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Update participant details
  const updateParticipant = (index: number, field: keyof Participant, val: string) => {
    const next = [...participants];
    next[index] = { ...next[index], [field]: val };
    setParticipants(next);
  };

  // Add / remove team members for technical events (min 2 compulsory, up to 4 total)
  const addParticipant = () => {
    if (participants.length < 4) {
      setParticipants([
        ...participants,
        {
          fullName: '',
          email: '',
          phone: '',
          college: participants[0]?.college || '',
          department: participants[0]?.department || '',
          year: '',
        },
      ]);
    }
  };

  const removeParticipant = (indexToRemove: number) => {
    if (participants.length > 2) {
      setParticipants(participants.filter((_, idx) => idx !== indexToRemove));
    }
  };

  // Validate step 2 (Participant details)
  const validateParticipantForm = (): boolean => {
    setErrorMsg(null);
    const activeParticipants =
      chosenTrack === 'workshop' ? [participants[0]] : participants.slice(0, 4);

    if (chosenTrack === 'technical') {
      if (activeParticipants.length < 2) {
        setErrorMsg('Technical events require a minimum of 2 compulsory participants (Team Leader + at least 1 Member).');
        return false;
      }
      if (activeParticipants.length > 4) {
        setErrorMsg('Technical events allow a maximum of 4 participants total including Team Leader.');
        return false;
      }
    }

    for (let i = 0; i < activeParticipants.length; i++) {
      const p = activeParticipants[i];
      const role =
        chosenTrack === 'workshop'
          ? 'Participant'
          : i === 0
          ? 'Team Leader'
          : `Team Member ${i + 1}`;
      if (!p.fullName.trim()) {
        setErrorMsg(`Please enter the Full Name for ${role}.`);
        return false;
      }
      if (!p.email.trim() || !p.email.includes('@') || !p.email.includes('.')) {
        setErrorMsg(`Please enter a valid Email address for ${role}.`);
        return false;
      }
      const digits = p.phone.replace(/\D/g, '');
      if (digits.length < 10) {
        setErrorMsg(`Please enter a valid 10-digit Mobile Number for ${role}.`);
        return false;
      }
      if (!p.college.trim()) {
        setErrorMsg(`Please enter the College Name for ${role}.`);
        return false;
      }
    }

    return true;
  };

  const handleProceedToPayment = () => {
    if (validateParticipantForm()) {
      setStep('payment');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const isWorkshopTrack = chosenTrack === 'workshop';
  const activeUpiId = isWorkshopTrack
    ? (settings.workshopUpiId || settings.upiId)
    : (settings.techUpiId || settings.upiId);

  const activePayeeName = isWorkshopTrack
    ? (settings.workshopUpiPayeeName || settings.upiPayeeName)
    : (settings.techUpiPayeeName || settings.upiPayeeName);

  const activeQrImageUrl = isWorkshopTrack
    ? (settings.workshopUpiQrImageUrl || settings.upiQrImageUrl)
    : (settings.techUpiQrImageUrl || settings.upiQrImageUrl);

  const isPaperPresentationSelected =
    chosenTrack === 'technical' &&
    selectedTechnicalIds.some((selectedId) => {
      const matchedEvent = events.find((e) => {
        const keyUpper = selectedId.trim().toUpperCase();
        const idUpper = (e.id || '').toUpperCase();
        const slugUpper = (e.slug || '').toUpperCase();
        return (
          idUpper === keyUpper ||
          slugUpper === keyUpper ||
          idUpper === `TECH-${keyUpper}` ||
          slugUpper === `TECH-${keyUpper}` ||
          idUpper === `WS-${keyUpper}` ||
          slugUpper === `WS-${keyUpper}` ||
          idUpper.replace('TECH-', '') === keyUpper ||
          slugUpper.replace('TECH-', '') === keyUpper ||
          idUpper.replace('WS-', '') === keyUpper ||
          slugUpper.replace('WS-', '') === keyUpper
        );
      });
      if (!matchedEvent) return false;
      const titleUpper = (matchedEvent.title || '').toUpperCase();
      const slugUpper = (matchedEvent.slug || '').toUpperCase();
      const idUpper = (matchedEvent.id || '').toString().toUpperCase();
      return (
        titleUpper.includes('PAPER') ||
        titleUpper.includes('PRESENTATION') ||
        slugUpper.includes('PAPER') ||
        slugUpper.includes('PRESENTATION') ||
        idUpper.includes('PAPER') ||
        idUpper.includes('TECHPAPER')
      );
    });

  const copyUpiId = () => {
    navigator.clipboard.writeText(activeUpiId);
    setUpiCopied(true);
    setTimeout(() => setUpiCopied(false), 2000);
  };

  // Package payload for backend
  const getRegistrationPayload = () => {
    const activeParticipants =
      chosenTrack === 'workshop' ? [participants[0]] : participants.slice(0, 4);

    return {
      registrationType: chosenTrack,
      selectedWorkshopId: chosenTrack === 'workshop' ? selectedWorkshopId : undefined,
      selectedTechnicalIds: chosenTrack === 'technical' ? selectedTechnicalIds : [],
      selectedNonTechnicalIds: chosenTrack === 'technical' ? selectedNonTechnicalIds : [],
      participants: activeParticipants,
    };
  };

  // Handle UPI Submission
  const handleUpiSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!upiReference || upiReference.trim().length < 4) {
      setErrorMsg('Please enter a valid 12-digit UPI Transaction Reference (UTR / Ref ID).');
      return;
    }
    if (!paymentScreenshotBase64) {
      setErrorMsg('Payment screenshot / PDF proof is strictly required. Please select and upload your payment proof below.');
      return;
    }
    if (isPaperPresentationSelected && (!paperSubmissionConfirmation || paperSubmissionConfirmation.trim().length < 3)) {
      setErrorMsg('Paper Presentation PPT & Abstract Google Form submission confirmation is strictly required to proceed.');
      return;
    }

    setIsProcessing(true);
    setErrorMsg(null);

    try {
      const payload = {
        registrationData: getRegistrationPayload(),
        upiReference: upiReference.trim(),
        screenshotDriveProof: paymentScreenshotBase64,
      };
      const result = await submitUpiRegistration(payload);
      setConfirmedRegistration(result.registration);

      // Fetch QR Code data URL with client-side fallback
      try {
        const qrRes = await fetch(`/api/registration/${result.registrationId}`);
        if (qrRes.ok) {
          const full = await qrRes.json();
          setTicketQrDataUrl(full.qrDataUrl);
        } else {
          throw new Error('Backend QR unavailable');
        }
      } catch (e) {
        const qrText = `EVITRON 2K26 PASS\nID: ${result.registration.id}\nLeader: ${result.registration.teamLeader.fullName}\nStatus: PENDING_VERIFICATION`;
        const dataUrl = await QRCode.toDataURL(qrText, { width: 360, margin: 2 });
        setTicketQrDataUrl(dataUrl);
      }

      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {}
      setRestoredNotice(false);

      setStep('success');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to submit UPI registration.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle Razorpay Checkout (Real Online Gateway Integration Only)
  const handleRazorpayCheckout = async () => {
    setIsProcessing(true);
    setErrorMsg(null);

    const isDevMode = settings.appEnv === 'development';
    const isConnected = isDevMode ? settings.razorpayConnected : settings.razorpayLiveConnected;

    // If Razorpay gateway is not connected for active environment, stop immediately
    if (!isConnected) {
      if (isDevMode) {
        setErrorMsg(
          'Razorpay Test Mode credentials are currently pending verification. Please pay using Option 1 (Instant UPI QR) on the left for instant registration.'
        );
      } else {
        setErrorMsg(
          'Razorpay Live Gateway is not connected. Please pay using Option 1 (Instant UPI QR) on the left or contact the symposium coordinators.'
        );
      }
      setIsProcessing(false);
      return;
    }

    try {
      const payload = getRegistrationPayload();
      const order = await createOrder(payload);

      // Ensure standard Razorpay SDK script is loaded for live gateway orders
      const win = window as any;
      if (!win.Razorpay) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://checkout.razorpay.com/v1/checkout.js';
          script.async = true;
          script.onload = () => resolve();
          script.onerror = () =>
            reject(new Error('Failed to load Razorpay Checkout SDK. Please check your internet connection.'));
          document.body.appendChild(script);
        });
      }

      if (!win.Razorpay) {
        throw new Error('Razorpay Checkout SDK could not be initialized.');
      }

      const options = {
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        name: 'EVITRON 2K26',
        description: chosenTrack === 'workshop' ? 'Workshop Registration Pass' : 'Technical Symposium Team Pass',
        order_id: order.orderId,
        handler: async (response: any) => {
          try {
            setIsProcessing(true);
            const verifyRes = await verifyPayment({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              registrationData: payload,
            });
            setConfirmedRegistration(verifyRes.registration);
            const qrRes = await fetch(`/api/registration/${verifyRes.registrationId}`);
            if (qrRes.ok) {
              const full = await qrRes.json();
              setTicketQrDataUrl(full.qrDataUrl);
            }
            setStep('success');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          } catch (vErr: any) {
            setErrorMsg(vErr.message || 'Payment signature verification failed.');
          } finally {
            setIsProcessing(false);
          }
        },
        prefill: {
          name: participants[0].fullName,
          email: participants[0].email,
          contact: participants[0].phone,
        },
        theme: {
          color: '#B22222',
        },
        modal: {
          ondismiss: () => {
            setIsProcessing(false);
          },
        },
      };

      const rzp = new win.Razorpay(options);
      rzp.on('payment.failed', function (resp: any) {
        setIsProcessing(false);
        setErrorMsg(resp.error?.description || 'Payment was unsuccessful or cancelled.');
      });
      rzp.open();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to initialize payment gateway. Live credentials (rzp_live_...) are required.');
      setIsProcessing(false);
    }
  };



  // ----------------------------------------------------
  // STEP 4: SUCCESS / CONFIRMATION SCREEN
  // ----------------------------------------------------
  if (step === 'success' && confirmedRegistration) {
    const selectedEvts = events.filter((e) => {
      const matchKey = (key: string) => {
        const k = key.trim().toUpperCase();
        const idUpper = (e.id || '').toUpperCase();
        const slugUpper = (e.slug || '').toUpperCase();
        return (
          idUpper === k ||
          slugUpper === k ||
          idUpper === `TECH-${k}` ||
          slugUpper === `TECH-${k}` ||
          idUpper === `WS-${k}` ||
          slugUpper === `WS-${k}` ||
          idUpper.replace('TECH-', '') === k ||
          slugUpper.replace('TECH-', '') === k ||
          idUpper.replace('WS-', '') === k ||
          slugUpper.replace('WS-', '') === k
        );
      };

      if (confirmedRegistration.selectedWorkshopId && matchKey(confirmedRegistration.selectedWorkshopId)) {
        return true;
      }
      if (confirmedRegistration.selectedTechnicalIds?.some(tid => matchKey(tid))) {
        return true;
      }
      if (confirmedRegistration.selectedNonTechnicalIds?.some(nid => matchKey(nid))) {
        return true;
      }
      return false;
    });

    return (
      <div className="py-8 sm:py-12 max-w-3xl mx-auto px-4 sm:px-6">
        {/* Ticket Card */}
        <div id="symposium-ticket-card" className="bg-white border-2 border-stone-800 rounded-2xl shadow-lg overflow-hidden">
          {/* Ticket Header */}
          <div className="bg-[#B22222] text-white p-6 sm:p-8 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <img
                src="/emblem.jpeg"
                alt="EVITRON 2K26 Emblem"
                className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-white/10 p-1 border border-white/20 object-contain shrink-0 shadow-xs"
                referrerPolicy="no-referrer"
              />
              <div>
                <div className="text-xs font-bold uppercase tracking-widest text-red-200">
                  OFFICIAL ENTRY PASS
                </div>
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                  EVITRON 2K26
                </h1>
                <p className="text-xs text-red-100 font-medium mt-0.5">
                  National Level Technical Symposium • Mahendra Engineering College
                </p>
              </div>
            </div>
            <div className="bg-white/10 backdrop-blur-xs border border-white/20 px-4 py-2 rounded-lg text-right">
              <span className="text-[11px] uppercase tracking-wider text-red-200 block">Registration ID</span>
              <span className="text-xl font-extrabold text-white font-mono">{confirmedRegistration.id}</span>
            </div>
          </div>

          {/* Ticket Body */}
          <div className="p-6 sm:p-8 space-y-6">
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 border-b border-stone-200 pb-6">
              {/* QR Code */}
              <div className="flex flex-col items-center shrink-0">
                <div className="w-40 h-40 bg-stone-50 border border-stone-300 rounded-xl p-2 flex items-center justify-center shadow-xs">
                  {ticketQrDataUrl ? (
                    <img
                      src={ticketQrDataUrl}
                      alt={`Registration QR ${confirmedRegistration.id}`}
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <div className="text-xs text-stone-400 text-center">Generating QR...</div>
                  )}
                </div>
                <span className="text-[10px] font-mono text-stone-500 mt-1 font-bold">
                  {confirmedRegistration.id}
                </span>
                <span className="text-[10px] text-stone-400">Scan at registration desk</span>
              </div>

              {/* Summary */}
              <div className="space-y-3 text-xs flex-1 w-full">
                <div>
                  <span className="text-stone-400 block font-medium">Team Leader / Participant:</span>
                  <span className="font-bold text-stone-900 text-sm">{confirmedRegistration.teamLeader.fullName}</span>
                  <span className="text-stone-500 block">{confirmedRegistration.teamLeader.college}</span>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-stone-100">
                  <div>
                    <span className="text-stone-400 block font-medium">Event Date:</span>
                    <span className="font-bold text-stone-800">08 October 2026</span>
                  </div>
                  <div>
                    <span className="text-stone-400 block font-medium">Reporting Time:</span>
                    <span className="font-bold text-stone-800">08:30 AM IST</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-stone-100">
                  <div>
                    <span className="text-stone-400 block font-medium">Payment Status:</span>
                    <span
                      className={`inline-block font-bold uppercase px-2 py-0.5 rounded text-[11px] ${
                        confirmedRegistration.paymentStatus === 'paid'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {confirmedRegistration.paymentStatus === 'paid' ? 'Paid / Confirmed' : 'Pending Verification'}
                    </span>
                  </div>
                  <div>
                    <span className="text-stone-400 block font-medium">Amount Paid:</span>
                    <span className="font-bold text-stone-900">₹{confirmedRegistration.totalAmount}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Selected Events */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-2">
                Registered Events
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {selectedEvts.map((evt) => (
                  <div key={evt.id} className="p-2.5 bg-stone-50 rounded-lg border border-stone-200 text-xs">
                    <span className="font-bold text-stone-900 block">{evt.title}</span>
                    <span className="text-stone-500 text-[11px]">{evt.tagline}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Participants list */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-2">
                Registered Attendees ({confirmedRegistration.participants.length})
              </h3>
              <div className="space-y-2">
                {confirmedRegistration.participants.map((p, idx) => (
                  <div
                    key={idx}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-2.5 bg-stone-50 rounded-lg border border-stone-200 text-xs gap-1"
                  >
                    <div>
                      <span className="font-bold text-stone-900">
                        {idx === 0
                          ? confirmedRegistration.registrationType === 'workshop'
                            ? 'Participant: '
                            : 'Team Leader: '
                          : `Member ${idx + 1}: `}
                        {p.fullName}
                      </span>
                      <span className="text-stone-500 block text-[11px]">{p.college}</span>
                    </div>
                    <div className="text-stone-600 sm:text-right text-[11px]">
                      <span>{p.phone}</span> • <span>{p.email}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Notice */}
            <div className={`p-4 rounded-lg text-xs text-stone-800 space-y-1 ${confirmedRegistration.paymentStatus === 'paid' ? 'bg-emerald-50 border border-emerald-200' : 'bg-amber-50 border border-amber-200'}`}>
              <span className={`font-bold block ${confirmedRegistration.paymentStatus === 'paid' ? 'text-emerald-800' : 'text-amber-800'}`}>
                {confirmedRegistration.paymentStatus === 'paid' ? 'Registration Confirmed & Verified:' : 'Manual Payment Verification Pending:'}
              </span>
              {confirmedRegistration.paymentStatus === 'paid' ? (
                <>
                  <p>• Payment successfully verified. Your registration is confirmed.</p>
                  <p>• A confirmation email and ticket have been sent from <span className="font-semibold">evitron26@gmail.com</span>.</p>
                </>
              ) : (
                <>
                  <p>• Payment details and UPI UTR submitted successfully.</p>
                  <p>• Once our team confirms and verifies your payment, we will send you an email confirmation and ticket.</p>
                  <p>• You can check your registration status anytime using your Registration ID ({confirmedRegistration.id}).</p>
                </>
              )}
              <p>• Please bring your College ID card on 08/10/2026.</p>
            </div>
          </div>

          {/* Ticket Footer Actions */}
          <div className="bg-stone-50 border-t border-stone-200 p-4 sm:p-6 flex flex-wrap items-center justify-between gap-3">
            <button
              onClick={() => window.print()}
              className="px-4 py-2.5 bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold rounded-lg flex items-center gap-2 cursor-pointer shadow-xs"
            >
              <Printer className="w-4 h-4" />
              Print / Save Ticket Pass
            </button>

            <button
              onClick={() => onNavigate('/')}
              className="px-4 py-2.5 bg-white hover:bg-stone-100 text-stone-700 border border-stone-300 text-xs font-bold rounded-lg cursor-pointer"
            >
              Return to Homepage
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (isProcessing) {
    return (
      <div className="fixed inset-0 bg-stone-950/95 flex flex-col items-center justify-center z-50 p-6 text-center select-none animate-fade-in backdrop-blur-xs">
        <div className="max-w-md w-full bg-stone-900 border border-stone-800 rounded-3xl p-8 sm:p-10 shadow-2xl space-y-8 relative overflow-hidden">
          {/* Animated background lights */}
          <div className="absolute -top-24 -left-24 w-48 h-48 bg-red-600/10 rounded-full blur-3xl animate-pulse" />
          <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-red-800/10 rounded-full blur-3xl animate-pulse" />

          {/* Attractive pulsing circle with loader */}
          <div className="relative flex items-center justify-center w-24 h-24 mx-auto">
            <div className="absolute inset-0 border-4 border-red-950 rounded-full" />
            <div className="absolute inset-0 border-4 border-t-[#B22222] border-r-[#B22222]/50 border-b-transparent border-l-transparent rounded-full animate-spin" />
            
            {/* Pulsing inner glow */}
            <div className="absolute inset-2 bg-[#B22222]/15 rounded-full flex items-center justify-center animate-pulse">
              <Ticket className="w-8 h-8 text-[#B22222] animate-bounce" />
            </div>
          </div>

          <div className="space-y-3">
            <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
              Generating Entry Ticket
            </h2>
            <p className="text-xs text-stone-400">
              Please wait while we register your team and synchronize details to Google Sheets.
            </p>
          </div>

          {/* Progressive Step Tracker */}
          <div className="bg-stone-950/50 rounded-2xl p-5 border border-stone-800 space-y-4 text-left">
            <div className="flex items-center gap-3">
              <div className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 transition-colors duration-300 ${
                processingStep >= 1 ? 'bg-[#B22222] text-white' : 'bg-stone-800 border border-stone-700 text-stone-500'
              }`}>
                {processingStep > 1 ? '✓' : '1'}
              </div>
              <span className={`text-xs font-semibold transition-colors duration-300 ${
                processingStep === 1 ? 'text-[#B22222] font-bold animate-pulse' : processingStep > 1 ? 'text-stone-400 font-normal' : 'text-stone-500'
              }`}>
                Validating participant data & payment proof...
              </span>
            </div>

            <div className="flex items-center gap-3">
              <div className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 transition-colors duration-300 ${
                processingStep >= 2 ? 'bg-[#B22222] text-white' : 'bg-stone-800 border border-stone-700 text-stone-500'
              }`}>
                {processingStep > 2 ? '✓' : '2'}
              </div>
              <span className={`text-xs font-semibold transition-colors duration-300 ${
                processingStep === 2 ? 'text-[#B22222] font-bold animate-pulse' : processingStep > 2 ? 'text-stone-400 font-normal' : 'text-stone-500'
              }`}>
                Securing slot & inserting into database...
              </span>
            </div>

            <div className="flex items-center gap-3">
              <div className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 transition-colors duration-300 ${
                processingStep >= 3 ? 'bg-[#B22222] text-white' : 'bg-stone-800 border border-stone-700 text-stone-500'
              }`}>
                {processingStep > 3 ? '✓' : '3'}
              </div>
              <span className={`text-xs font-semibold transition-colors duration-300 ${
                processingStep === 3 ? 'text-[#B22222] font-bold animate-pulse' : processingStep > 3 ? 'text-stone-400 font-normal' : 'text-stone-500'
              }`}>
                Syncing registration row to Google Sheets...
              </span>
            </div>

            <div className="flex items-center gap-3">
              <div className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 transition-colors duration-300 ${
                processingStep >= 4 ? 'bg-[#B22222] text-white' : 'bg-stone-800 border border-stone-700 text-stone-500'
              }`}>
                4
              </div>
              <span className={`text-xs font-semibold transition-colors duration-300 ${
                processingStep === 4 ? 'text-[#B22222] font-bold animate-pulse' : 'text-stone-500'
              }`}>
                Generating secure ticket QR code & sending email...
              </span>
            </div>
          </div>

          {/* Warning Banner */}
          <div className="bg-amber-950/20 border border-amber-800/30 rounded-xl p-3.5 text-amber-200 text-[11px] leading-relaxed flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <div className="text-left">
              <strong className="block text-amber-400 font-bold mb-0.5">Please Do Not Refresh or Press Back!</strong>
              <span>Our servers are compiling your registration. Closing this page now might disrupt your payment verification sequence.</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="py-8 sm:py-12 max-w-4xl mx-auto px-4 sm:px-6 min-h-[80vh]">
      {/* Step Indicator */}
      <div className="mb-8">
        <div className="flex items-center justify-between max-w-md mx-auto mb-2 text-xs font-bold">
          <span className={step === 'selection' ? 'text-[#B22222]' : 'text-stone-400'}>
            1. Select Events
          </span>
          <span className="text-stone-300">──</span>
          <span className={step === 'form' ? 'text-[#B22222]' : 'text-stone-400'}>
            2. Participant Details
          </span>
          <span className="text-stone-300">──</span>
          <span className={step === 'payment' ? 'text-[#B22222]' : 'text-stone-400'}>
            3. Payment & Confirm
          </span>
        </div>
        <div className="h-1.5 w-full bg-stone-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#B22222] transition-all duration-300"
            style={{
              width: step === 'selection' ? '33%' : step === 'form' ? '66%' : '100%',
            }}
          />
        </div>
      </div>

      {/* Error Alert */}
      {errorMsg && (
        <div className="mb-6 p-4 bg-red-50 border-l-4 border-[#B22222] rounded-r-lg text-xs text-red-800 flex items-start gap-2 shadow-xs">
          <AlertCircle className="w-4 h-4 text-[#B22222] shrink-0 mt-0.5" />
          <div className="font-semibold">{errorMsg}</div>
        </div>
      )}

      {/* App-Switch Draft Restored Notice */}
      {restoredNotice && step !== 'success' && (
        <div className="mb-6 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              <strong>Draft Restored:</strong> Your details were preserved during UPI app switching. You can continue right where you left off.
            </span>
          </div>
          <button
            type="button"
            onClick={handleClearDraft}
            className="px-2.5 py-1 text-[11px] font-bold text-stone-600 hover:text-red-700 bg-white border border-stone-200 rounded-md cursor-pointer transition-colors"
          >
            Clear & Reset Form
          </button>
        </div>
      )}

      {/* ----------------------------------------------------
          STEP 1: SELECT EVENTS (STRICT RULES ENFORCEMENT)
          ---------------------------------------------------- */}
      {step === 'selection' && (
        <div className="space-y-8">
          <div className="text-center max-w-2xl mx-auto">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-stone-900 tracking-tight">
              Select Your Symposium Events
            </h1>
            <p className="text-xs text-stone-600 mt-2">
              Choose either a hands-on <span className="font-bold text-stone-800">Workshop</span> (Individual) OR the{' '}
              <span className="font-bold text-stone-800">Technical Symposium Track</span> (Team of 2 to 4).
            </p>
          </div>

          {/* TRACK OPTION A: WORKSHOP */}
          <div
            className={`bg-white rounded-xl border-2 p-5 sm:p-6 transition-all ${
              chosenTrack === 'workshop'
                ? 'border-[#B22222] shadow-sm ring-1 ring-[#B22222]/30'
                : 'border-stone-200 opacity-95'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded bg-red-50 text-[#B22222] flex items-center justify-center font-bold">
                  <Wrench className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-lg font-extrabold text-stone-900">Track A: Workshops</h2>
                  <span className="text-[11px] text-stone-500 font-medium">
                    Individual (1 Participant) • <span className="font-bold text-[#B22222]">₹300</span> (Registration open until {settings.registrationDeadline || '05/10/2026'})
                  </span>
                </div>
              </div>

              <span className="text-[11px] font-bold px-2.5 py-1 bg-stone-100 text-stone-700 rounded">
                Strictly 1 Workshop Only
              </span>
            </div>

            <p className="text-xs text-stone-600 mb-4">
              Rule: If you select a workshop, technical and non-technical selections will be disabled.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {workshops.map((w) => {
                const isSelected = selectedWorkshopId === w.id;
                return (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => handleSelectWorkshop(w.id)}
                    className={`p-3.5 rounded-lg border text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-red-50/70 border-[#B22222] shadow-xs'
                        : 'bg-white border-stone-200 hover:border-stone-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-stone-900 text-xs">{w.title}</span>
                      {isSelected && <CheckCircle2 className="w-4 h-4 text-[#B22222]" />}
                    </div>
                    <p className="text-[11px] text-stone-500 line-clamp-2">{w.tagline}</p>
                    <div className="mt-2 text-[10px] font-semibold text-[#B22222]">₹300 / Participant</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* TRACK OPTION B: TECHNICAL & NON-TECHNICAL */}
          <div
            className={`bg-white rounded-xl border-2 p-5 sm:p-6 transition-all ${
              chosenTrack === 'technical'
                ? 'border-[#B22222] shadow-sm ring-1 ring-[#B22222]/30'
                : 'border-stone-200'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded bg-stone-100 text-stone-800 flex items-center justify-center font-bold">
                  <Cpu className="w-4 h-4 text-[#B22222]" />
                </div>
                <div>
                  <h2 className="text-lg font-extrabold text-stone-900">Track B: Technical Symposium Track</h2>
                  <span className="text-[11px] text-stone-500 font-medium">
                    Team of 2 to 4 Participants • <span className="font-bold text-[#B22222]">₹250 fee per member</span> (Registration open until {settings.registrationDeadline || '05/10/2026'})
                  </span>
                </div>
              </div>

              <span className="text-[11px] font-bold px-2.5 py-1 bg-stone-100 text-stone-700 rounded">
                2 to 4 Members (Min 2 Compulsory)
              </span>
            </div>

            <div className="p-3 bg-stone-50 rounded-lg text-xs text-stone-600 mb-4 border border-stone-100">
              <span className="font-bold text-stone-900">Mandatory Rules:</span>
              <ul className="list-disc list-inside mt-1 space-y-0.5 text-[11px]">
                <li>Technical event teams require a minimum of 2 compulsory members, and can extend up to 4 members total including Team Leader (Registration fee: ₹250 per member).</li>
                <li><strong>Strictly 1 Technical Event</strong> can be selected.</li>
                <li><strong>Optional:</strong> You may choose <strong>at most 1 Non-Technical Event</strong>, but ONLY when 1 technical event is selected. Non-technical events can never be selected alone.</li>
              </ul>
            </div>

            {/* Technical Events List */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-stone-700">
                  Select Technical Event (Strictly 1 Allowed):
                </h3>
                {selectedTechnicalIds.length === 1 && (
                  <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    1 Technical Selected
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {technicalEvents.map((t) => {
                  const isSelected = selectedTechnicalIds.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => handleToggleTechnical(t.id)}
                      className={`p-3.5 rounded-lg border text-left transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-red-50/70 border-[#B22222] shadow-xs ring-1 ring-[#B22222]/30'
                          : 'bg-white border-stone-200 hover:border-stone-300'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-stone-900 text-xs">{t.title}</span>
                        {isSelected && <CheckCircle2 className="w-4 h-4 text-[#B22222]" />}
                      </div>
                      <p className="text-[11px] text-stone-500">{t.tagline}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Non-Technical Events List (Disabled unless Technical is selected) */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-stone-700">
                  Optional Non-Technical Event (Max 1 Allowed):
                </h3>
                {selectedTechnicalIds.length === 0 ? (
                  <span className="text-[10px] text-amber-700 font-semibold bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                    Select 1 Technical Event First
                  </span>
                ) : (
                  <span className="text-[10px] text-stone-500 font-medium">
                    {selectedNonTechnicalIds.length === 1 ? '1 Non-Technical Selected' : 'Optional (0 or 1)'}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {nonTechnicalEvents.map((n) => {
                  const isSelected = selectedNonTechnicalIds.includes(n.id);
                  const isDisabled = selectedTechnicalIds.length === 0;

                  return (
                    <button
                      key={n.id}
                      type="button"
                      disabled={isDisabled}
                      onClick={() => handleToggleNonTechnical(n.id)}
                      className={`p-3 rounded-lg border text-left transition-all ${
                        isDisabled
                          ? 'opacity-40 bg-stone-50 border-stone-200 cursor-not-allowed'
                          : isSelected
                          ? 'bg-red-50/70 border-[#B22222] cursor-pointer'
                          : 'bg-white border-stone-200 hover:border-stone-300 cursor-pointer'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-stone-900 text-xs">{n.title}</span>
                        {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-[#B22222]" />}
                      </div>
                      <p className="text-[10px] text-stone-500">{n.tagline}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Paper Presentation Google Form Link Card (Step 1) */}
          {isPaperPresentationSelected && (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl flex items-start gap-3">
              <ExternalLink className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
              <div className="space-y-1.5 flex-1">
                <span className="text-xs font-bold text-blue-950 block">
                  Paper Presentation (TECHPAPER) Selected — Google Form Required (if already submitted ignore this)
                </span>
                <p className="text-xs text-blue-900 leading-relaxed">
                  Please submit your paper abstract, title, and file details via our official Google Form.
                </p>
                <a
                  href="https://docs.google.com/forms/d/e/1FAIpQLSd8CtXbeQ-NhxOK5xV_wphW-K1am_dVK7pji6z_Itr0w1mM3w/viewform?usp=publish-editor"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg shadow-xs cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Open Paper Presentation Google Form →
                </a>
              </div>
            </div>
          )}

          {/* Fee & Selection Summary Bar */}
          <div className="bg-stone-900 text-white rounded-xl p-5 sm:p-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="text-xs text-stone-400 font-medium block">Registration Fee Summary</span>
              <div className="text-xl sm:text-2xl font-extrabold text-white">
                Total Payable: <span className="text-[#ff7878]">₹{totalAmount}</span>
              </div>
              <p className="text-[11px] text-stone-300 mt-0.5">
                {chosenTrack === 'workshop'
                  ? `1 Participant (Individual Workshop Pass • ₹${getPricePerPerson('workshop')})`
                  : chosenTrack === 'technical'
                  ? `${participants.length} Participants (₹${getPricePerPerson('technical')} / member • Min 2, Max 4 members)`
                  : 'Select an event to view fee'}
              </p>
            </div>

            <button
              id="proceed-to-participants-btn"
              onClick={handleProceedToForm}
              disabled={totalAmount === 0}
              className={`px-6 py-3 rounded-lg font-bold text-xs sm:text-sm shadow-sm transition-colors ${
                totalAmount > 0
                  ? 'bg-[#B22222] hover:bg-[#961c1c] active:bg-[#7e1717] text-white cursor-pointer'
                  : 'bg-stone-800 text-stone-500 cursor-not-allowed'
              }`}
            >
              Continue to Participant Details →
            </button>
          </div>
        </div>
      )}

      {/* ----------------------------------------------------
          STEP 2: PARTICIPANTS FORM (2 TO 4 FOR TECH, 1 FOR WORKSHOP)
          ---------------------------------------------------- */}
      {step === 'form' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl sm:text-2xl font-extrabold text-stone-900">
                {chosenTrack === 'workshop' ? 'Participant Information' : 'Team Participant Details'}
              </h2>
              <p className="text-xs text-stone-500 mt-0.5">
                {chosenTrack === 'workshop'
                  ? 'Workshop registration is individual (1 participant).'
                  : `Technical events require 2 to 4 participants (min 2 compulsory, up to 4 total) • ₹${getPricePerPerson('technical')}/member • Currently ${participants.length} members (₹${totalAmount})`}
              </p>
            </div>

            <button
              onClick={() => setStep('selection')}
              className="text-xs font-semibold text-stone-600 hover:text-stone-900 flex items-center gap-1 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Change Events
            </button>
          </div>

          {/* Form cards */}
          {(chosenTrack === 'workshop' ? [0] : participants.map((_, i) => i)).map((idx) => {
            const roleTitle =
              chosenTrack === 'workshop'
                ? 'Participant'
                : idx === 0
                ? 'Team Leader (Paying Member / Primary Contact)'
                : idx === 1
                ? 'Team Member 2 (Compulsory)'
                : `Team Member ${idx + 1} (Optional)`;

            const p = participants[idx];

            return (
              <div key={idx} className="bg-white border border-stone-200 rounded-xl p-5 sm:p-6 shadow-xs">
                <div className="flex items-center justify-between mb-4 border-b border-stone-100 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-stone-100 text-stone-800 flex items-center justify-center text-xs font-bold">
                      {idx + 1}
                    </span>
                    <span className="font-extrabold text-stone-900 text-sm">
                      {roleTitle}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {idx === 0 && chosenTrack === 'technical' && (
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#B22222] bg-red-50 px-2 py-0.5 rounded">
                        Primary Contact
                      </span>
                    )}
                    {idx >= 2 && chosenTrack === 'technical' && (
                      <button
                        type="button"
                        onClick={() => removeParticipant(idx)}
                        className="text-xs text-red-600 hover:text-red-800 font-semibold flex items-center gap-1 cursor-pointer transition-colors px-2.5 py-1 rounded hover:bg-red-50"
                        title="Remove this optional team member"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Remove Member
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="block text-stone-700 font-semibold mb-1">
                      Full Name <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="text"
                      value={p.fullName}
                      onChange={(e) => updateParticipant(idx, 'fullName', e.target.value)}
                      placeholder="e.g. Enter your Name"
                      className="w-full px-3 py-2 border border-stone-300 rounded-md focus:ring-1 focus:ring-[#B22222] focus:border-[#B22222] outline-none text-stone-900"
                    />
                  </div>

                  <div>
                    <label className="block text-stone-700 font-semibold mb-1">
                      Email Address <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="email"
                      value={p.email}
                      onChange={(e) => updateParticipant(idx, 'email', e.target.value)}
                      placeholder="e.g. ms@gmail.com"
                      className="w-full px-3 py-2 border border-stone-300 rounded-md focus:ring-1 focus:ring-[#B22222] focus:border-[#B22222] outline-none text-stone-900"
                    />
                  </div>

                  <div>
                    <label className="block text-stone-700 font-semibold mb-1">
                      Mobile Number (10 Digits) <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="tel"
                      value={p.phone}
                      onChange={(e) => updateParticipant(idx, 'phone', e.target.value)}
                      placeholder="e.g. 9876543210"
                      className="w-full px-3 py-2 border border-stone-300 rounded-md focus:ring-1 focus:ring-[#B22222] focus:border-[#B22222] outline-none text-stone-900"
                    />
                  </div>

                  <div>
                    <label className="block text-stone-700 font-semibold mb-1">
                      College Name <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="text"
                      value={p.college}
                      onChange={(e) => updateParticipant(idx, 'college', e.target.value)}
                      placeholder="Your College Name"
                      className="w-full px-3 py-2 border border-stone-300 rounded-md focus:ring-1 focus:ring-[#B22222] focus:border-[#B22222] outline-none text-stone-900"
                    />
                  </div>

                  <div>
                    <label className="block text-stone-700 font-semibold mb-1">
                      Department (Optional)
                    </label>
                    <input
                      type="text"
                      value={p.department || ''}
                      onChange={(e) => updateParticipant(idx, 'department', e.target.value)}
                      placeholder="e.g. ECE / EEE"
                      className="w-full px-3 py-2 border border-stone-300 rounded-md focus:ring-1 focus:ring-[#B22222] focus:border-[#B22222] outline-none text-stone-900"
                    />
                  </div>

                  <div>
                    <label className="block text-stone-700 font-semibold mb-1">
                      Year of Study (Optional)
                    </label>
                    <input
                      type="text"
                      value={p.year || ''}
                      onChange={(e) => updateParticipant(idx, 'year', e.target.value)}
                      placeholder="e.g. III Year"
                      className="w-full px-3 py-2 border border-stone-300 rounded-md focus:ring-1 focus:ring-[#B22222] focus:border-[#B22222] outline-none text-stone-900"
                    />
                  </div>
                </div>
              </div>
            );
          })}

          {/* Add Team Member button (Min 2 compulsory, up to 4 total) */}
          {chosenTrack === 'technical' && participants.length < 4 && (
            <div className="bg-stone-50 border-2 border-dashed border-stone-200 rounded-xl p-5 text-center">
              <button
                type="button"
                id="add-team-member-btn"
                onClick={addParticipant}
                className="px-5 py-2.5 bg-white hover:bg-stone-100 text-stone-900 border border-stone-300 font-bold text-xs rounded-lg shadow-xs inline-flex items-center gap-2 cursor-pointer transition-all hover:border-stone-400"
              >
                <UserPlus className="w-4 h-4 text-[#B22222]" />
                <span>+ Add Team Member ({participants.length + 1} of 4)</span>
              </button>
              <p className="text-[11px] text-stone-500 mt-2">
                Minimum 2 compulsory members, up to 4 total members including Team Leader (₹{getPricePerPerson('technical', settings)} per member • Current Total: ₹{totalAmount}).
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-stone-200">
            <button
              type="button"
              onClick={() => setStep('selection')}
              className="px-5 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-bold rounded-lg cursor-pointer"
            >
              ← Back to Events
            </button>

            <button
              type="button"
              id="proceed-to-payment-btn"
              onClick={handleProceedToPayment}
              className="px-6 py-3 bg-[#B22222] hover:bg-[#961c1c] active:bg-[#7e1717] text-white text-xs sm:text-sm font-bold rounded-lg shadow-sm cursor-pointer"
            >
              Proceed to Payment (₹{totalAmount}) →
            </button>
          </div>
        </div>
      )}

      {/* ----------------------------------------------------
          STEP 3: PAYMENT (SPLIT PAGES / CHOICE SCREEN OR MANUAL / RAZORPAY)
          ---------------------------------------------------- */}
      {step === 'payment' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl sm:text-2xl font-extrabold text-stone-900">
                Payment & Confirmation
              </h2>
              <p className="text-xs text-stone-500 mt-0.5">
                Total Payable: <span className="font-extrabold text-stone-900 text-sm">₹{totalAmount}</span>
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setStep('form');
              }}
              className="text-xs font-semibold text-stone-600 hover:text-stone-900 flex items-center gap-1 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Edit Details
            </button>
          </div>

          <div className="max-w-2xl mx-auto bg-white border border-stone-200 rounded-2xl p-6 sm:p-8 shadow-xs">
            <div className="flex items-center justify-between mb-6 border-b border-stone-100 pb-4">
              <div>
                <span className="text-xs font-bold text-[#B22222] uppercase tracking-wider block mb-1">
                  Manual UPI & QR Payment Page
                </span>
                <h3 className="text-lg font-extrabold text-stone-900">
                  Scan, Pay ₹{totalAmount}, and Submit Details
                </h3>
              </div>
            </div>

            {/* QR Code Container */}
            <div className="bg-stone-50 border border-stone-200 rounded-xl p-5 flex flex-col items-center justify-center mb-6">
              <div className="w-48 h-48 bg-white border border-stone-300 rounded-lg p-2 shadow-xs flex items-center justify-center">
                {activeQrImageUrl ? (
                  <img
                    src={activeQrImageUrl}
                    alt={isWorkshopTrack ? 'Workshop UPI QR Code' : 'Technical Symposium UPI QR Code'}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <QrCode className="w-24 h-24 text-stone-400" />
                )}
              </div>
              <div className="mt-3 text-center">
                <span className="text-xs font-bold text-stone-900 block">Scan & Pay Exact Amount: ₹{totalAmount}</span>
                <span className="text-[11px] text-stone-500">
                  {activePayeeName} ({isWorkshopTrack ? 'Workshop Payment QR' : 'Technical Events Payment QR'})
                </span>
              </div>
            </div>

            {/* Safe Draft Auto-Save Protection Badge */}
            <div className="mb-6 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-950 flex items-start gap-2.5 shadow-2xs">
              <CheckCircle2 className="w-4.5 h-4.5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <strong className="block text-emerald-900 font-bold mb-0.5">Your Entered Details Are Auto-Saved!</strong>
                <span className="text-stone-700 text-[11px] leading-relaxed">
                  You can safely switch to your UPI app (Google Pay, PhonePe, Paytm), complete the payment, and return here. All your participant details are securely remembered.
                </span>
              </div>
            </div>

            {/* Direct 1-Tap Mobile UPI App Launch */}
            <div className="mb-6">
              <a
                href={`upi://pay?pa=${activeUpiId}&pn=${encodeURIComponent(activePayeeName)}&am=${totalAmount}&cu=INR&tn=${encodeURIComponent('EVITRON 2K26 Registration')}`}
                className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-extrabold text-xs sm:text-sm rounded-xl shadow-xs flex items-center justify-center gap-2 transition-colors cursor-pointer text-center"
              >
                <span>⚡ Pay via any UPI App (GPay / PhonePe / Paytm)</span>
              </a>
              <p className="text-[11px] text-stone-500 text-center mt-1.5 font-medium">
                Tap above to open your UPI app with payment amount pre-filled, or copy the UPI ID below.
              </p>
            </div>

            {/* UPI ID Copy Field */}
            <div className="mb-6">
              <label className="block text-xs font-bold text-stone-700 mb-1">
                {isWorkshopTrack ? 'Workshop UPI ID' : 'Technical Symposium UPI ID'} (Tap to Copy)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={activeUpiId}
                  className="w-full px-3 py-2.5 bg-stone-50 border border-stone-300 rounded-lg font-mono text-xs text-stone-900"
                />
                <button
                  type="button"
                  onClick={copyUpiId}
                  className="px-4 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-bold rounded-lg border border-stone-300 flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  {upiCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{upiCopied ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>

            {/* Direct Payment Screenshot Upload Field */}
            <div className="mb-6 bg-stone-50 border border-stone-200 rounded-xl p-5">
              <span className="text-xs font-bold text-stone-900 block mb-2">
                Upload Payment Screenshot or PDF <span className="text-red-600">*</span>
              </span>
              <p className="text-[11px] text-stone-500 mb-3 leading-relaxed">
                Stay on our website! Simply upload a clear screenshot of your transaction (GPay, PhonePe, Paytm, etc.) or PDF invoice. The size limit is strictly under 500KB.
              </p>

              <div className="flex flex-col items-center justify-center border-2 border-dashed border-stone-300 rounded-lg p-6 bg-white hover:border-[#B22222]/50 transition-colors relative cursor-pointer">
                <input
                  type="file"
                  accept="image/png, image/jpeg, image/jpg, application/pdf"
                  onChange={handleScreenshotChange}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                />
                <Upload className="w-8 h-8 text-stone-400 mb-2" />
                <span className="text-xs font-bold text-stone-700">
                  {paymentScreenshotFileName ? 'Change screenshot or PDF' : 'Select payment screenshot / PDF'}
                </span>
                <span className="text-[10px] text-stone-400 mt-1">Accepts PDF, PNG, JPG, JPEG (strictly under 500KB)</span>
              </div>

              {paymentScreenshotFileName && (
                <div className="mt-3 bg-emerald-50 text-emerald-800 text-xs px-3.5 py-2.5 rounded-lg border border-emerald-200 flex items-center justify-between">
                  <div className="truncate pr-4 flex items-center gap-1.5">
                    <Check className="w-4.5 h-4.5 text-emerald-600 shrink-0" />
                    <span className="font-semibold truncate">{paymentScreenshotFileName}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setPaymentScreenshotBase64('');
                      setPaymentScreenshotFileName('');
                    }}
                    className="text-red-600 hover:text-red-800 font-bold px-1 text-xs"
                  >
                    Remove
                  </button>
                </div>
              )}

              {paymentScreenshotError && (
                <div className="mt-2 text-rose-600 text-xs font-semibold bg-rose-50 p-2.5 rounded-lg border border-rose-100 flex items-start gap-1.5 animate-pulse">
                  <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                  <span>{paymentScreenshotError}</span>
                </div>
              )}
            </div>

            {/* Strict Required Form & Submit Button 1 */}
            <form onSubmit={handleUpiSubmit} className="space-y-5 pt-4 border-t border-stone-200">
              <div>
                <label className="block text-stone-900 font-bold text-xs mb-1">
                  Enter UPI Transaction Reference (UTR / Ref ID): <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={upiReference}
                  onChange={(e) => setUpiReference(e.target.value)}
                  placeholder="e.g. 4289xxxxxxxx (12-digit UTR)"
                  className="w-full px-3.5 py-2.5 border border-stone-300 rounded-lg text-xs text-stone-900 font-mono outline-none focus:ring-1 focus:ring-[#B22222]"
                />
                <span className="text-[11px] text-stone-500 mt-1 block">
                  Mandatory: Found in your Google Pay, PhonePe, Paytm, or Bank app transaction details.
                </span>
              </div>

              {isPaperPresentationSelected && (
                <div>
                  <label className="block text-stone-900 font-bold text-xs mb-1">
                    PPT & Abstract Google Form Submission Confirmation: <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={paperSubmissionConfirmation}
                    onChange={(e) => setPaperSubmissionConfirmation(e.target.value)}
                    placeholder="e.g. Submitted abstract via Google Form as Anandh_Paper_Presentation.pptx"
                    className="w-full px-3.5 py-2.5 border border-[#B22222]/30 bg-[#B22222]/5 rounded-lg text-xs text-stone-900 outline-none focus:ring-1 focus:ring-[#B22222]"
                  />
                  <span className="text-[11px] text-[#B22222] mt-1 block font-medium">
                    Mandatory for Paper Presentation: Please confirm that you have uploaded your PPT & Abstract on the <a href="https://docs.google.com/forms/d/e/1FAIpQLSd8CtXbeQ-NhxOK5xV_wphW-K1am_dVK7pji6z_Itr0w1mM3w/viewform" target="_blank" rel="noopener noreferrer" className="underline font-bold hover:text-stone-950">Google Form Link ↗</a> before submitting.
                  </span>
                </div>
              )}

              <button
                type="submit"
                id="submit-manual-upi-btn"
                disabled={isProcessing}
                className="w-full py-3.5 px-4 bg-[#B22222] hover:bg-[#961c1c] active:bg-[#7e1717] text-white font-bold text-xs sm:text-sm rounded-xl shadow-md cursor-pointer flex items-center justify-center gap-2 transition-colors"
              >
                <CheckCircle2 className="w-4 h-4" />
                {isProcessing ? 'Submitting & Syncing to Spreadsheet...' : 'Submit Manual UPI & Complete Registration'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* WhatsApp Support Coordinator Contact Section */}
      <div className="mt-12 pt-8 border-t border-stone-200">
        <div className="bg-stone-50 border border-stone-200 rounded-2xl p-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="space-y-1 text-center md:text-left">
            <h4 className="text-sm font-bold text-stone-900 flex items-center justify-center md:justify-start gap-2">
              <svg className="w-5 h-5 text-emerald-600 fill-current shrink-0" viewBox="0 0 24 24" referrerPolicy="no-referrer">
                <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.457L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.825 1.451 5.436 0 9.86-4.42 9.863-9.864.001-2.63-1.019-5.101-2.871-6.956C16.61 1.931 14.13 1.91 11.5 1.91c-5.44 0-9.866 4.424-9.868 9.868-.001 1.748.477 3.454 1.385 4.965L1.97 22.03l5.525-1.451c1.465.803 3.013 1.22 4.602 1.221H12.1h-.003zM16.5 13.911c-.246-.123-1.46-.721-1.687-.803-.226-.082-.392-.123-.556.123-.164.246-.637.803-.781.968-.144.164-.288.185-.534.062-.246-.123-1.037-.382-1.976-1.22-.73-.65-1.223-1.454-1.367-1.7-.144-.246-.015-.379.108-.501.112-.11.246-.288.37-.432.124-.144.165-.246.247-.411.082-.164.041-.308-.02-.432-.062-.123-.556-1.338-.762-1.835-.2-.486-.402-.421-.556-.421h-.473c-.164 0-.432.062-.658.308-.226.246-.864.843-.864 2.057 0 1.214.884 2.387.967 2.51.082.123 1.74 2.656 4.214 3.722.589.254 1.048.406 1.406.52.593.189 1.13.162 1.558.098.476-.072 1.46-.597 1.666-1.173.206-.576.206-1.07.144-1.173-.062-.103-.226-.164-.473-.288z" />
              </svg>
              <span>Registration & Payment Support</span>
            </h4>
            <p className="text-xs text-stone-600">
              Have any doubts regarding registration or payment? Connect with our coordinators instantly on WhatsApp.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {[
              { name: 'Anandha krishnan P', phone: '6383109049' },
              { name: 'Sri Sarvesan M G', phone: '6374933410' },
              { name: 'Vishwanathan', phone: '7639516071' },
            ].map((coordinator, cIdx) => (
              <a
                key={cIdx}
                href={`https://wa.me/91${coordinator.phone}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2.5 bg-white hover:bg-stone-100 text-stone-800 hover:text-emerald-700 border border-stone-300 hover:border-emerald-500 font-bold text-xs rounded-xl shadow-xs inline-flex items-center gap-2 transition-all cursor-pointer"
              >
                <svg className="w-4 h-4 text-emerald-500 fill-current shrink-0" viewBox="0 0 24 24" referrerPolicy="no-referrer">
                  <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.457L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.825 1.451 5.436 0 9.86-4.42 9.863-9.864.001-2.63-1.019-5.101-2.871-6.956C16.61 1.931 14.13 1.91 11.5 1.91c-5.44 0-9.866 4.424-9.868 9.868-.001 1.748.477 3.454 1.385 4.965L1.97 22.03l5.525-1.451c1.465.803 3.013 1.22 4.602 1.221H12.1h-.003zM16.5 13.911c-.246-.123-1.46-.721-1.687-.803-.226-.082-.392-.123-.556.123-.164.246-.637.803-.781.968-.144.164-.288.185-.534.062-.246-.123-1.037-.382-1.976-1.22-.73-.65-1.223-1.454-1.367-1.7-.144-.246-.015-.379.108-.501.112-.11.246-.288.37-.432.124-.144.165-.246.247-.411.082-.164.041-.308-.02-.432-.062-.123-.556-1.338-.762-1.835-.2-.486-.402-.421-.556-.421h-.473c-.164 0-.432.062-.658.308-.226.246-.864.843-.864 2.057 0 1.214.884 2.387.967 2.51.082.123 1.74 2.656 4.214 3.722.589.254 1.048.406 1.406.52.593.189 1.13.162 1.558.098.476-.072 1.46-.597 1.666-1.173.206-.576.206-1.07.144-1.173-.062-.103-.226-.164-.473-.288z" />
                </svg>
                <div className="text-left">
                  <span className="block text-[10px] text-stone-500 leading-none">Contact</span>
                  <span className="block text-xs font-bold text-stone-800">{coordinator.name}</span>
                </div>
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
