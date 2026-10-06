import React, { useState, useEffect, useRef } from 'react';
import {
  Camera,
  CameraOff,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  QrCode,
  Users,
  ShieldCheck,
  Building,
  Phone,
  Mail,
  Clock,
  Search,
  Check,
  ScanLine,
  Flashlight,
  FlashlightOff,
  Upload,
  Zap,
  Volume2,
  Sparkles,
  UserCheck,
} from 'lucide-react';
import jsQR from 'jsqr';
import { RegistrationRecord, EventItem } from '../types';
import { markAttendanceApi, fetchRegistrationById } from '../services/api';
import { formatDisplayDate, formatDisplayTime } from '../utils/dateUtils';
import { getShortEventName } from '../utils/eventShortNames';

interface AttendanceScannerProps {
  token: string;
  allRegistrations: RegistrationRecord[] | null;
  onAttendanceMarked: () => void;
  showNotification: (msg: string, type?: 'success' | 'error') => void;
  events: EventItem[];
}

export const AttendanceScanner: React.FC<AttendanceScannerProps> = ({
  token,
  allRegistrations,
  onAttendanceMarked,
  showNotification,
  events,
}) => {
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraFacingMode, setCameraFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scannedRegId, setScannedRegId] = useState<string | null>(null);
  const [selectedReg, setSelectedReg] = useState<RegistrationRecord | null>(null);
  const [isMarking, setIsMarking] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const [lastMarkedStatus, setLastMarkedStatus] = useState<{ id: string; time: string; name: string } | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [scanStats, setScanStats] = useState<{ fps: number; engine: string }>({ fps: 0, engine: 'Auto' });
  const [autoApproveMode, setAutoApproveMode] = useState(true); // Default ON for fast on-spot rush
  const [recentScans, setRecentScans] = useState<Array<{ id: string; name: string; time: string; already: boolean }>>([]);

  // Non-intrusive floating HUD popup for 1-2 seconds
  const [scannedStatusToast, setScannedStatusToast] = useState<{
    type: 'already_scanned' | 'new_scan' | 'approved';
    id: string;
    name?: string;
    time?: string;
  } | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameId = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const isScanningRef = useRef<boolean>(false);
  const barcodeDetectorRef = useRef<any>(null);
  const lastScannedCodeRef = useRef<string>('');
  const lastScannedTimeRef = useRef<number>(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const toastTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize BarcodeDetector if natively supported by browser
  useEffect(() => {
    if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
      try {
        barcodeDetectorRef.current = new (window as any).BarcodeDetector({
          formats: ['qr_code', 'code_128', 'code_39', 'data_matrix'],
        });
        setScanStats((prev) => ({ ...prev, engine: 'Hardware (C++)' }));
      } catch (e) {
        barcodeDetectorRef.current = null;
        setScanStats((prev) => ({ ...prev, engine: 'Fast jsQR (WASM)' }));
      }
    } else {
      setScanStats((prev) => ({ ...prev, engine: 'Fast jsQR (WASM)' }));
    }
  }, []);

  // Play audio chime and trigger haptic vibration
  const triggerSuccessFeedback = (isAlreadyScanned = false) => {
    // 1. Haptic vibration
    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        if (isAlreadyScanned) {
          navigator.vibrate([120, 80, 120]);
        } else {
          navigator.vibrate([100, 50, 100]);
        }
      }
    } catch {}

    // 2. Audio chime
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        if (!audioContextRef.current) {
          audioContextRef.current = new AudioCtx();
        }
        const ctx = audioContextRef.current;
        if (ctx.state === 'suspended') ctx.resume();

        const now = ctx.currentTime;
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        if (isAlreadyScanned) {
          // Warning chime for already scanned ticket
          osc1.type = 'sawtooth';
          osc1.frequency.setValueAtTime(440, now);
          osc1.frequency.setValueAtTime(330, now + 0.1);
          gain.gain.setValueAtTime(0.18, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
          osc1.connect(gain);
          gain.connect(ctx.destination);
          osc1.start(now);
          osc1.stop(now + 0.3);
        } else {
          // Melodic high-tone success chime (PhonePe/GPay style)
          osc1.type = 'sine';
          osc1.frequency.setValueAtTime(880, now); // A5
          osc1.frequency.setValueAtTime(1174.66, now + 0.08); // D6

          osc2.type = 'triangle';
          osc2.frequency.setValueAtTime(1760, now + 0.08); // A6

          gain.gain.setValueAtTime(0.2, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

          osc1.connect(gain);
          osc2.connect(gain);
          gain.connect(ctx.destination);

          osc1.start(now);
          osc2.start(now + 0.08);
          osc1.stop(now + 0.28);
          osc2.stop(now + 0.28);
        }
      }
    } catch {}
  };

  // Extract EVITRON 2K26 Registration ID from any string/format
  const extractRegistrationId = (text: string): string | null => {
    if (!text || typeof text !== 'string') return null;
    const clean = text.trim();

    // 1. Direct standard EV26-XXXXXX format
    const match1 = clean.match(/EV26-[A-Z0-9]{5,8}/i);
    if (match1) return match1[0].toUpperCase();

    // 2. EV26XXXXXX without hyphen
    const match2 = clean.match(/EV26[A-Z0-9]{5,8}/i);
    if (match2) {
      const id = match2[0].toUpperCase();
      return `EV26-${id.substring(4)}`;
    }

    // 3. Line by line search for ID
    const lines = clean.split(/[\r\n]+/);
    for (const line of lines) {
      const m = line.match(/(?:REG(?:ISTRATION)?\s*(?:ID|CODE)?[:=\s]*)\s*(EV26-[A-Z0-9]{5,8}|[A-Z0-9]{6,10})/i);
      if (m && m[1]) {
        let code = m[1].toUpperCase();
        if (!code.startsWith('EV26-')) code = `EV26-${code.replace(/^EV26/, '')}`;
        return code;
      }
    }

    // 4. URL format e.g. /ticket?id=EV26-ABC123
    const urlMatch = clean.match(/[?&]id=(EV26-[A-Z0-9]{5,8})/i);
    if (urlMatch) return urlMatch[1].toUpperCase();

    return null;
  };

  // Start Ultra-Fast Camera Stream
  const startCamera = async () => {
    setCameraError(null);
    stopCamera();
    try {
      const constraints: MediaStreamConstraints = {
        audio: false,
        video: {
          facingMode: { ideal: cameraFacingMode },
          width: { ideal: 1080, min: 480 },
          height: { ideal: 1080, min: 480 },
          aspectRatio: { ideal: 1.0 },
          frameRate: { ideal: 60, min: 30 },
        },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      // Check if torch/flashlight is supported
      const track = stream.getVideoTracks()[0];
      if (track) {
        const capabilities: any = track.getCapabilities?.() || {};
        setHasTorch(Boolean(capabilities.torch));

        // Attempt continuous autofocus if device supports it
        if (capabilities.focusMode?.includes('continuous')) {
          try {
            await (track as any).applyConstraints({
              advanced: [{ focusMode: 'continuous' }],
            });
          } catch {}
        }
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        videoRef.current.muted = true;
        await videoRef.current.play();
        setIsCameraActive(true);
        isScanningRef.current = true;
        runInstantScannerLoop();
      }
    } catch (err: any) {
      console.error('[CAMERA LAUNCH ERROR]', err);
      setCameraError(
        err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError'
          ? 'Camera permission denied. Please allow camera permissions in browser.'
          : err.message || 'Unable to access camera.'
      );
      setIsCameraActive(false);
    }
  };

  const stopCamera = () => {
    isScanningRef.current = false;
    if (animationFrameId.current) {
      cancelAnimationFrame(animationFrameId.current);
      animationFrameId.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
    setTorchOn(false);
  };

  const toggleTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (track) {
      const nextState = !torchOn;
      try {
        await (track as any).applyConstraints({
          advanced: [{ torch: nextState }],
        });
        setTorchOn(nextState);
      } catch (err) {
        console.warn('Torch toggle failed:', err);
      }
    }
  };

  // High performance UNINTERRUPTED continuous scanner loop (60 FPS, <5ms per frame)
  const runInstantScannerLoop = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    let lastFpsUpdate = performance.now();
    let frameCount = 0;

    const processFrame = async () => {
      // NEVER cancel or abort the continuous scan loop!
      if (!isScanningRef.current || !video || video.paused || video.ended) {
        return;
      }

      try {
        if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && ctx) {
          frameCount++;
          const now = performance.now();
          if (now - lastFpsUpdate >= 1000) {
            setScanStats((prev) => ({ ...prev, fps: Math.round((frameCount * 1000) / (now - lastFpsUpdate)) }));
            frameCount = 0;
            lastFpsUpdate = now;
          }

          let foundCode: string | null = null;

          // STEP 1: Hardware-Accelerated Native BarcodeDetector (Sub-5ms decode)
          if (barcodeDetectorRef.current) {
            try {
              const barcodes = await barcodeDetectorRef.current.detect(video);
              if (barcodes && barcodes.length > 0) {
                for (const barcode of barcodes) {
                  const raw = barcode.rawValue;
                  if (raw) {
                    const detectedId = extractRegistrationId(raw);
                    if (detectedId) {
                      foundCode = detectedId;
                      break;
                    }
                  }
                }
              }
            } catch (detErr) {
              // Fallback to jsQR
            }
          }

          // STEP 2: Ultra-Fast WASM / Optimized jsQR with Square ROI Center Crop
          if (!foundCode) {
            const vw = video.videoWidth;
            const vh = video.videoHeight;
            if (vw > 0 && vh > 0) {
              // Downscale to 480px width for lightning jsQR processing
              const scale = Math.min(1, 480 / vw);
              const targetW = Math.round(vw * scale);
              const targetH = Math.round(vh * scale);

              canvas.width = targetW;
              canvas.height = targetH;
              ctx.drawImage(video, 0, 0, targetW, targetH);

              // 2A. Scan square center region of interest first (aiming reticle)
              const size = Math.round(Math.min(targetW, targetH) * 0.75);
              const roiX = Math.round((targetW - size) / 2);
              const roiY = Math.round((targetH - size) / 2);

              const roiData = ctx.getImageData(roiX, roiY, size, size);
              let code = jsQR(roiData.data, size, size, {
                inversionAttempts: 'dontInvert',
              });

              // 2B. If not in ROI, scan full scaled frame
              if (!code) {
                const fullData = ctx.getImageData(0, 0, targetW, targetH);
                code = jsQR(fullData.data, targetW, targetH, {
                  inversionAttempts: frameCount % 3 === 0 ? 'attemptBoth' : 'dontInvert',
                });
              }

              if (code && code.data) {
                foundCode = extractRegistrationId(code.data);
              }
            }
          }

          // If a QR pass was identified:
          if (foundCode) {
            handleCodeDetected(foundCode);
          }
        }
      } catch (err) {
        // Continue scan loop smoothly
      }

      // ALWAYS schedule next frame continuously without stopping!
      if (isScanningRef.current) {
        animationFrameId.current = requestAnimationFrame(processFrame);
      }
    };

    animationFrameId.current = requestAnimationFrame(processFrame);
  };

  const handleCodeDetected = (regId: string) => {
    const cleanId = regId.trim().toUpperCase();
    const now = Date.now();

    // Check if this is the exact same QR code held steadily in front of the camera
    const isSameCode = lastScannedCodeRef.current === cleanId;
    const timeSinceLast = now - lastScannedTimeRef.current;

    // If it's a DIFFERENT attendee QR, scan immediately (0ms gap!).
    // If it's the EXACT SAME QR held continuously, debounce by 1.2 seconds so it shows the popup again without stuttering.
    if (isSameCode && timeSinceLast < 1200) {
      return;
    }

    lastScannedCodeRef.current = cleanId;
    lastScannedTimeRef.current = now;

    lookupRegistration(cleanId, true);
  };

  // Decode QR from uploaded image/screenshot file directly
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = async () => {
        // 1. Try BarcodeDetector
        if (barcodeDetectorRef.current) {
          try {
            const barcodes = await barcodeDetectorRef.current.detect(img);
            if (barcodes && barcodes.length > 0) {
              const detected = extractRegistrationId(barcodes[0].rawValue);
              if (detected) {
                lookupRegistration(detected, true);
                return;
              }
            }
          } catch {}
        }

        // 2. Try jsQR
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (ctx) {
          canvas.width = img.naturalWidth || img.width;
          canvas.height = img.naturalHeight || img.height;
          ctx.drawImage(img, 0, 0);
          const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imgData.data, canvas.width, canvas.height, {
            inversionAttempts: 'attemptBoth',
          });
          if (code && code.data) {
            const detected = extractRegistrationId(code.data);
            if (detected) {
              lookupRegistration(detected, true);
              return;
            }
          }
        }
        showNotification('No valid EVITRON QR code found in uploaded image.', 'error');
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const lookupRegistration = (regId: string, fromCamera = false) => {
    const clean = regId.trim().toUpperCase();
    setScannedRegId(clean);

    // Instant local memory lookup (<1ms)
    const localFound = (allRegistrations || []).find((r) => r.id.toUpperCase() === clean);
    if (localFound) {
      setSelectedReg(localFound);
      const isAlreadyAttended = Boolean(localFound.attendanceMarked);
      
      triggerSuccessFeedback(isAlreadyAttended);

      // Show floating popup message for 1.5 seconds without stopping camera
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      setScannedStatusToast({
        type: isAlreadyAttended ? 'already_scanned' : 'new_scan',
        id: clean,
        name: localFound.teamLeader?.fullName,
        time: localFound.attendanceTimestamp ? formatDisplayTime(localFound.attendanceTimestamp) : 'Earlier',
      });
      toastTimerRef.current = setTimeout(() => {
        setScannedStatusToast(null);
      }, isAlreadyAttended ? 1800 : 1200);

      // Add to recent live feed
      setRecentScans((prev) => [
        {
          id: clean,
          name: localFound.teamLeader?.fullName || 'Attendee',
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          already: isAlreadyAttended,
        },
        ...prev.slice(0, 7),
      ]);

      if (fromCamera && autoApproveMode && !localFound.attendanceMarked) {
        executeAttendanceApproval(localFound);
      }
      return;
    }

    // Server fallback lookup
    fetchRegistrationById(clean)
      .then((data) => {
        if (data && data.id) {
          setSelectedReg(data);
          const isAlreadyAttended = Boolean(data.attendanceMarked);
          
          triggerSuccessFeedback(isAlreadyAttended);

          if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
          setScannedStatusToast({
            type: isAlreadyAttended ? 'already_scanned' : 'new_scan',
            id: clean,
            name: data.teamLeader?.fullName,
            time: data.attendanceTimestamp ? formatDisplayTime(data.attendanceTimestamp) : 'Earlier',
          });
          toastTimerRef.current = setTimeout(() => {
            setScannedStatusToast(null);
          }, isAlreadyAttended ? 1800 : 1200);

          setRecentScans((prev) => [
            {
              id: clean,
              name: data.teamLeader?.fullName || 'Attendee',
              time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
              already: isAlreadyAttended,
            },
            ...prev.slice(0, 7),
          ]);

          if (fromCamera && autoApproveMode && !data.attendanceMarked) {
            executeAttendanceApproval(data);
          }
        } else {
          setSelectedReg(null);
          showNotification(`Registration ${clean} not found in database records.`, 'error');
        }
      })
      .catch((err) => {
        setSelectedReg(null);
        showNotification(err.message || `Registration ${clean} not found.`, 'error');
      });
  };

  const executeAttendanceApproval = async (regRecord: RegistrationRecord) => {
    if (!token || !regRecord) return;
    setIsMarking(true);
    try {
      const res = await markAttendanceApi(token, regRecord.id);
      if (res.success) {
        const nowIso = new Date().toISOString();
        const updatedRecord: RegistrationRecord = {
          ...regRecord,
          attendanceMarked: true,
          attendanceTimestamp: nowIso,
        };

        // Update local selected state
        setSelectedReg(updatedRecord);

        // Update parent list in memory so immediate re-scans reflect attendance instantly
        if (allRegistrations) {
          const matchIdx = allRegistrations.findIndex((r) => r.id.toUpperCase() === regRecord.id.toUpperCase());
          if (matchIdx !== -1) {
            allRegistrations[matchIdx].attendanceMarked = true;
            allRegistrations[matchIdx].attendanceTimestamp = nowIso;
          }
        }

        setLastMarkedStatus({
          id: regRecord.id,
          time: new Date().toLocaleTimeString(),
          name: regRecord.teamLeader.fullName,
        });

        // Show instant approved confirmation toast
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        setScannedStatusToast({
          type: 'approved',
          id: regRecord.id,
          name: regRecord.teamLeader.fullName,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        });
        toastTimerRef.current = setTimeout(() => {
          setScannedStatusToast(null);
        }, 1500);

        onAttendanceMarked();
      } else {
        showNotification(`Attendance update failed: ${res.message}`, 'error');
      }
    } catch (err: any) {
      showNotification(`Error marking attendance: ${err.message}`, 'error');
    } finally {
      setIsMarking(false);
    }
  };

  const handleManualSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualInput.trim()) return;
    lookupRegistration(manualInput.trim());
  };

  const toggleFacingMode = () => {
    setCameraFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  useEffect(() => {
    if (isCameraActive) {
      startCamera();
    }
    return () => {
      stopCamera();
    };
  }, [cameraFacingMode]);

  useEffect(() => {
    // Auto-start camera when scanner view opens
    startCamera();
    return () => {
      stopCamera();
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const totalAttendedCount = (allRegistrations || []).filter((r) => r.attendanceMarked).length;

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-in fade-in duration-200 relative">
      {/* High-Visibility Floating HUD Notification Modal (1-2 seconds, non-blocking) */}
      {scannedStatusToast && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none p-4 animate-in fade-in zoom-in-95 duration-100">
          {scannedStatusToast.type === 'already_scanned' ? (
            <div className="bg-amber-950/95 text-white px-6 py-5 rounded-2xl shadow-2xl border-2 border-amber-500 flex items-center gap-4 backdrop-blur-md max-w-md pointer-events-auto">
              <div className="w-12 h-12 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 border border-amber-500/40">
                <AlertCircle className="w-7 h-7 animate-bounce" />
              </div>
              <div>
                <div className="text-xs font-black text-amber-400 uppercase tracking-widest flex items-center gap-1.5">
                  ⚠️ ALREADY SCANNED & ATTENDED
                </div>
                <div className="text-base font-extrabold font-mono text-white mt-0.5">{scannedStatusToast.id}</div>
                <div className="text-xs text-amber-200/90 mt-0.5 leading-snug">
                  {scannedStatusToast.name ? <span><strong>{scannedStatusToast.name}</strong> • </span> : null}
                  Attendee was already checked in ({scannedStatusToast.time || 'earlier'}).
                </div>
              </div>
            </div>
          ) : scannedStatusToast.type === 'approved' ? (
            <div className="bg-emerald-950/95 text-white px-6 py-5 rounded-2xl shadow-2xl border-2 border-emerald-400 flex items-center gap-4 backdrop-blur-md max-w-md pointer-events-auto">
              <div className="w-12 h-12 rounded-full bg-emerald-500/25 text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-400/40">
                <CheckCircle2 className="w-7 h-7 animate-pulse" />
              </div>
              <div>
                <div className="text-xs font-black text-emerald-400 uppercase tracking-widest flex items-center gap-1.5">
                  ✅ ATTENDANCE MARKED PRESENT
                </div>
                <div className="text-base font-extrabold font-mono text-white mt-0.5">{scannedStatusToast.id}</div>
                <div className="text-xs text-emerald-200/90 mt-0.5 leading-snug">
                  {scannedStatusToast.name ? <span><strong>{scannedStatusToast.name}</strong></span> : null} • Synchronized to Database & Sheets
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-stone-900/95 text-white px-6 py-4 rounded-2xl shadow-2xl border border-emerald-500/50 flex items-center gap-3.5 backdrop-blur-md pointer-events-auto">
              <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/30">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <div className="text-xs font-bold text-emerald-400 uppercase tracking-wider">⚡ Ticket Pass Scanned</div>
                <div className="text-base font-extrabold font-mono text-white">{scannedStatusToast.id}</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Top Status Header */}
      <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-red-100 text-[#B22222] rounded-lg">
              <Zap className="w-5 h-5 fill-current" />
            </span>
            <h3 className="text-base sm:text-lg font-extrabold text-stone-950">
              Continuous On-Spot QR Scanner & Live Gate Check-In Desk
            </h3>
          </div>
          <p className="text-xs text-stone-500 mt-1 flex items-center gap-2">
            <span className="font-semibold text-emerald-700 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping inline-block" />
              Continuous Active Scanning (Zero Gap)
            </span>
            <span>•</span>
            <span className="font-mono text-stone-600 bg-stone-100 px-2 py-0.5 rounded text-[11px]">
              {scanStats.engine} ({scanStats.fps} FPS)
            </span>
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Total Live Attended Badge */}
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-950 px-3.5 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5">
            <UserCheck className="w-4 h-4 text-emerald-600" />
            <span>Checked-In: <strong>{totalAttendedCount}</strong> / {(allRegistrations || []).length}</span>
          </div>

          {/* Auto-Approve 1-Tap Toggle */}
          <label className="flex items-center gap-2 cursor-pointer bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-1.5 rounded-xl text-xs font-bold select-none transition-colors shadow-xs">
            <input
              type="checkbox"
              checked={autoApproveMode}
              onChange={(e) => setAutoApproveMode(e.target.checked)}
              className="w-4 h-4 accent-white rounded cursor-pointer"
            />
            <span>Instant Auto-Checkin</span>
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Left Column: Direct Camera Square Viewfinder */}
        <div className="md:col-span-6 space-y-4">
          <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <span className="font-extrabold text-stone-900 text-xs uppercase tracking-wider flex items-center gap-1.5">
                <Camera className="w-4 h-4 text-[#B22222]" /> Live Lens (Non-Stop Scanner)
              </span>

              <div className="flex items-center gap-2">
                {hasTorch && isCameraActive && (
                  <button
                    onClick={toggleTorch}
                    className={`text-[11px] font-bold px-2.5 py-1 rounded-lg cursor-pointer transition-colors flex items-center gap-1 ${
                      torchOn
                        ? 'bg-amber-100 text-amber-900 border border-amber-300'
                        : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                    }`}
                    title="Toggle Flashlight / Torch"
                  >
                    {torchOn ? <Flashlight className="w-3.5 h-3.5 text-amber-600" /> : <FlashlightOff className="w-3.5 h-3.5" />}
                    <span>Torch</span>
                  </button>
                )}

                {isCameraActive && (
                  <button
                    onClick={toggleFacingMode}
                    className="text-[11px] font-bold text-stone-600 hover:text-stone-900 bg-stone-100 hover:bg-stone-200 px-2.5 py-1 rounded-lg cursor-pointer transition-colors flex items-center gap-1"
                    title="Switch Front/Rear Camera"
                  >
                    <RefreshCw className="w-3 h-3" /> Flip
                  </button>
                )}
              </div>
            </div>

            {/* Viewfinder Window (Strict Square Ratio: 1:1) */}
            <div className="relative aspect-square w-full max-w-[420px] mx-auto bg-stone-950 rounded-2xl overflow-hidden flex items-center justify-center border-2 border-stone-800 shadow-2xl">
              <video
                ref={videoRef}
                className={`w-full h-full object-cover ${!isCameraActive ? 'hidden' : ''}`}
                muted
                playsInline
                autoPlay
              />
              <canvas ref={canvasRef} className="hidden" />

              {/* Viewfinder Overlay / Scanner Reticle (Square Shape matching QR codes) */}
              {isCameraActive ? (
                <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-4">
                  {/* Symmetrical Square Scanning Reticle */}
                  <div className="w-[74%] aspect-square border-2 border-emerald-400/80 rounded-2xl relative shadow-[0_0_30px_rgba(16,185,129,0.35)] flex items-center justify-center">
                    {/* Glowing High-Precision Corner Markers */}
                    <div className="absolute -top-1.5 -left-1.5 w-8 h-8 border-t-4 border-l-4 border-emerald-400 rounded-tl-xl" />
                    <div className="absolute -top-1.5 -right-1.5 w-8 h-8 border-t-4 border-r-4 border-emerald-400 rounded-tr-xl" />
                    <div className="absolute -bottom-1.5 -left-1.5 w-8 h-8 border-b-4 border-l-4 border-emerald-400 rounded-bl-xl" />
                    <div className="absolute -bottom-1.5 -right-1.5 w-8 h-8 border-b-4 border-r-4 border-emerald-400 rounded-br-xl" />

                    {/* Continuous Laser Scanning Line */}
                    <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_14px_#34d399] animate-pulse" />
                  </div>

                  <span className="mt-3.5 text-[11px] font-bold text-white bg-black/80 px-3.5 py-1 rounded-full backdrop-blur-md border border-white/10 shadow-lg flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                    Ready for next ticket (Non-Stop Scan)
                  </span>
                </div>
              ) : (
                <div className="text-center p-6 space-y-3">
                  <div className="w-14 h-14 rounded-full bg-stone-900 border border-stone-800 flex items-center justify-center mx-auto text-stone-400">
                    <CameraOff className="w-7 h-7" />
                  </div>
                  <p className="text-xs text-stone-400 max-w-xs">
                    Camera is currently paused. Click below to start continuous scanning.
                  </p>
                </div>
              )}
            </div>

            {cameraError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{cameraError}</span>
              </div>
            )}

            {/* Scanner Controls & Upload Options */}
            <div className="grid grid-cols-2 gap-2">
              {!isCameraActive ? (
                <button
                  onClick={startCamera}
                  className="py-2.5 px-4 bg-[#B22222] hover:bg-[#961c1c] active:bg-[#7e1717] text-white font-extrabold text-xs rounded-xl shadow-xs flex items-center justify-center gap-2 cursor-pointer transition-colors"
                >
                  <Camera className="w-4 h-4" /> Start Scanner
                </button>
              ) : (
                <button
                  onClick={stopCamera}
                  className="py-2.5 px-4 bg-stone-800 hover:bg-stone-900 text-white font-bold text-xs rounded-xl shadow-xs flex items-center justify-center gap-2 cursor-pointer transition-colors"
                >
                  <CameraOff className="w-4 h-4" /> Pause Camera
                </button>
              )}

              {/* Upload QR File Shortcut */}
              <div>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageUpload}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-2.5 px-3 bg-stone-100 hover:bg-stone-200 text-stone-800 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                  title="Upload ticket image from device or WhatsApp screenshot"
                >
                  <Upload className="w-4 h-4 text-stone-600" /> Upload QR Image
                </button>
              </div>
            </div>

            {/* Manual Lookup Form */}
            <form onSubmit={handleManualSearch} className="flex gap-2 pt-1">
              <input
                type="text"
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value.toUpperCase())}
                placeholder="Manual ID (e.g. EV26-3SYYEH)"
                className="flex-1 px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs font-mono font-bold outline-none focus:ring-2 focus:ring-[#B22222]"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-stone-900 hover:bg-black text-white font-bold text-xs rounded-xl cursor-pointer flex items-center gap-1.5 shrink-0 shadow-xs"
              >
                <Search className="w-3.5 h-3.5" /> Find
              </button>
            </form>
          </div>

          {/* Live Recent Gate Activity Ticker */}
          {recentScans.length > 0 && (
            <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-xs space-y-2">
              <span className="text-[10px] font-extrabold text-stone-500 uppercase tracking-wider block">
                Recent Gate Scans Stream
              </span>
              <div className="space-y-1.5 max-h-36 overflow-y-auto">
                {recentScans.map((item, idx) => (
                  <div
                    key={idx}
                    className={`flex items-center justify-between p-2 rounded-lg text-xs border ${
                      item.already
                        ? 'bg-amber-50/60 border-amber-200 text-amber-900'
                        : 'bg-emerald-50/60 border-emerald-200 text-emerald-950'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold">{item.id}</span>
                      <span className="text-stone-700 font-medium truncate max-w-[140px] sm:max-w-[180px]">
                        {item.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] font-mono">
                      <span
                        className={`px-1.5 py-0.2 rounded font-bold uppercase ${
                          item.already ? 'bg-amber-200 text-amber-900' : 'bg-emerald-200 text-emerald-900'
                        }`}
                      >
                        {item.already ? 'RE-SCAN' : 'NEW CHECKIN'}
                      </span>
                      <span className="text-stone-400">{item.time}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Scanned Attendee Pass & Attendance Approval */}
        <div className="md:col-span-6 space-y-4">
          <div className="bg-white border border-stone-200 rounded-2xl p-5 sm:p-6 shadow-xs min-h-[460px] flex flex-col">
            <h4 className="font-extrabold text-stone-900 text-xs uppercase tracking-wider mb-4 flex items-center justify-between pb-3 border-b border-stone-100">
              <span className="flex items-center gap-1.5">
                <QrCode className="w-4 h-4 text-[#B22222]" /> Latest Scanned Attendee Record
              </span>
              {selectedReg && (
                <span className="text-[10px] font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  ⚡ LIVE READY
                </span>
              )}
            </h4>

            {selectedReg ? (
              <div className="flex-1 flex flex-col justify-between space-y-4">
                <div className="space-y-3.5">
                  {/* Status Banner */}
                  <div className="flex items-center justify-between gap-2 p-3 bg-stone-50 rounded-xl border border-stone-200">
                    <div>
                      <span className="text-[10px] text-stone-500 font-bold uppercase block">Registration ID</span>
                      <span className="font-mono font-extrabold text-base sm:text-lg text-stone-950">
                        {selectedReg.id}
                      </span>
                    </div>

                    <div className="text-right">
                      <span
                        className={`inline-block px-3 py-1 rounded-lg text-[10px] font-extrabold uppercase tracking-wider ${
                          selectedReg.attendanceMarked
                            ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                            : 'bg-amber-100 text-amber-900 border border-amber-300'
                        }`}
                      >
                        {selectedReg.attendanceMarked ? '✅ ATTENDED (PRESENT)' : '⏳ NOT CHECKED IN'}
                      </span>
                      {selectedReg.attendanceTimestamp && (
                        <span className="block text-[9px] text-stone-500 font-mono mt-0.5">
                          {formatDisplayDate(selectedReg.attendanceTimestamp)} {formatDisplayTime(selectedReg.attendanceTimestamp)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Leader Details Card */}
                  <div className="p-3.5 rounded-xl border border-stone-200 space-y-2 text-xs bg-white shadow-2xs">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="font-extrabold text-stone-900 text-sm block">
                          {selectedReg.teamLeader.fullName}
                        </span>
                        <span className="text-[11px] text-stone-600 block mt-0.5">
                          {selectedReg.teamLeader.college}
                        </span>
                      </div>
                      <span className="px-2 py-0.5 bg-stone-100 text-stone-700 text-[10px] font-bold rounded">
                        {selectedReg.registrationType === 'workshop' ? 'Workshop Individual' : `Team of ${selectedReg.participants.length}`}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px] text-stone-500 pt-1.5 border-t border-stone-100 font-mono">
                      <div>📞 {selectedReg.teamLeader.phone}</div>
                      <div className="truncate">✉️ {selectedReg.teamLeader.email}</div>
                    </div>
                  </div>

                  {/* Registered Events List */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-stone-500 block">
                      Registered Track & Events:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedReg.eventsText ? (
                        selectedReg.eventsText.split(',').map((ev, idx) => (
                          <span
                            key={idx}
                            className="px-2.5 py-1 bg-red-50 text-[#B22222] border border-red-200 text-[11px] font-extrabold uppercase rounded-lg shadow-2xs"
                          >
                            {getShortEventName(ev)}
                          </span>
                        ))
                      ) : (
                        <span className="px-2.5 py-1 bg-stone-100 text-stone-800 text-[11px] font-bold rounded-lg">
                          {selectedReg.registrationType === 'workshop' ? 'Hands-on Workshop' : 'Technical Symposium'}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Additional Team Members */}
                  {selectedReg.participants.length > 1 && (
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-stone-500 block">
                        Team Members ({selectedReg.participants.length}):
                      </span>
                      <div className="bg-stone-50 rounded-xl p-2.5 border border-stone-200 text-[11px] space-y-1 max-h-24 overflow-y-auto">
                        {selectedReg.participants.map((p, idx) => (
                          <div key={idx} className="flex items-center justify-between text-stone-700 font-medium">
                            <span>
                              {idx === 0 ? '👑 Leader: ' : `M${idx + 1}: `}{p.fullName}
                            </span>
                            <span className="text-stone-400 font-mono text-[10px]">{p.phone}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Payment Verification Status Badge */}
                  <div className="flex items-center justify-between p-2.5 bg-stone-50 rounded-xl border border-stone-200 text-xs">
                    <span className="text-stone-600 font-medium">Payment Status:</span>
                    <div className="flex items-center gap-1.5 font-bold">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] ${
                          selectedReg.paymentStatus === 'paid'
                            ? 'bg-emerald-100 text-emerald-800 font-extrabold'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        ₹{selectedReg.totalAmount} • {selectedReg.paymentStatus === 'paid' ? 'PAID / VERIFIED' : 'PENDING'}
                      </span>
                      {selectedReg.upiReference && (
                        <span className="text-[10px] font-mono text-stone-500">UTR: {selectedReg.upiReference}</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Bottom Action Area */}
                <div className="pt-3 border-t border-stone-100 flex flex-wrap gap-2">
                  {!selectedReg.attendanceMarked ? (
                    <button
                      onClick={() => executeAttendanceApproval(selectedReg)}
                      disabled={isMarking}
                      className="flex-1 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-extrabold text-xs rounded-xl shadow-md cursor-pointer transition-all flex items-center justify-center gap-2"
                    >
                      {isMarking ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Marking Present in Supabase & Sheet...</span>
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="w-5 h-5" />
                          <span>Approve & Mark Present</span>
                        </>
                      )}
                    </button>
                  ) : (
                    <div className="flex-1 py-2.5 px-4 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl font-extrabold text-xs text-center flex items-center justify-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>Attendee Checked In • Camera Continuously Scanning Next</span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6 space-y-3 text-stone-400">
                <div className="w-16 h-16 rounded-full bg-stone-50 border border-stone-200 flex items-center justify-center text-stone-300 shadow-inner">
                  <QrCode className="w-8 h-8" />
                </div>
                <div>
                  <p className="text-xs font-bold text-stone-700">Continuous Non-Stop Scanner Active</p>
                  <p className="text-[11px] text-stone-400 mt-1 max-w-xs leading-relaxed">
                    Point camera at incoming participant tickets continuously. No need to click "Next" — tickets scan instantly one after another.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
