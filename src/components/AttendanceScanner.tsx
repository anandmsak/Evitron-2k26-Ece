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
} from 'lucide-react';
import jsQR from 'jsqr';
import { RegistrationRecord, EventItem } from '../types';
import { markAttendanceApi, fetchRegistrationById } from '../services/api';
import { formatDisplayDate, formatDisplayTime } from '../utils/dateUtils';
import { normalizeEventName } from '../data/eventMapping';
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
  const [lastMarkedStatus, setLastMarkedStatus] = useState<{ id: string; time: string } | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameId = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Play subtle confirmation beep
  const playBeep = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        if (!audioContextRef.current) {
          audioContextRef.current = new AudioCtx();
        }
        const ctx = audioContextRef.current;
        if (ctx.state === 'suspended') ctx.resume();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.15);
      }
    } catch {}
  };

  // Start Camera Stream
  const startCamera = async () => {
    setCameraError(null);
    stopCamera();
    try {
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: cameraFacingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        await videoRef.current.play();
        setIsCameraActive(true);
        requestScan();
      }
    } catch (err: any) {
      console.error('[CAMERA ERROR]', err);
      setCameraError(
        err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError'
          ? 'Camera permission denied. Please allow camera access in browser settings.'
          : err.message || 'Unable to access camera.'
      );
      setIsCameraActive(false);
    }
  };

  const stopCamera = () => {
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
  };

  // Continuous frame scanning loop
  const requestScan = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const tick = () => {
      if (video.readyState === video.HAVE_ENOUGH_DATA && ctx) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'dontInvert',
        });

        if (code && code.data) {
          handleQrDataFound(code.data);
          return;
        }
      }
      animationFrameId.current = requestAnimationFrame(tick);
    };

    animationFrameId.current = requestAnimationFrame(tick);
  };

  const handleQrDataFound = (qrText: string) => {
    playBeep();
    stopCamera();

    // Extract ID
    const match = qrText.match(/EV26-[A-Z0-9]{6}/i);
    let targetCode = match ? match[0].toUpperCase() : '';

    if (!targetCode) {
      // Try finding by parsing lines
      const regLine = qrText.split('\n').find((l) => l.toUpperCase().includes('REG') || l.includes('EV26-'));
      if (regLine) {
        const m = regLine.match(/EV26-[A-Z0-9]{6}/i);
        if (m) targetCode = m[0].toUpperCase();
      }
    }

    if (targetCode) {
      lookupRegistration(targetCode);
    } else {
      showNotification('Scanned QR code is not a valid EVITRON 2K26 ticket pass.', 'error');
    }
  };

  const lookupRegistration = (regId: string) => {
    const clean = regId.trim().toUpperCase();
    setScannedRegId(clean);

    const localFound = (allRegistrations || []).find((r) => r.id.toUpperCase() === clean);
    if (localFound) {
      setSelectedReg(localFound);
      return;
    }

    // Try fetching via API
    fetchRegistrationById(clean)
      .then((data) => {
        if (data && data.id) {
          setSelectedReg(data);
        } else {
          setSelectedReg(null);
          showNotification(`Registration ${clean} not found in records.`, 'error');
        }
      })
      .catch((err) => {
        setSelectedReg(null);
        showNotification(err.message || `Registration ${clean} not found.`, 'error');
      });
  };

  const handleManualSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualInput.trim()) return;
    const clean = manualInput.trim().toUpperCase();
    lookupRegistration(clean);
  };

  const handleApproveAttendance = async () => {
    if (!selectedReg || !token) return;
    setIsMarking(true);
    try {
      const res = await markAttendanceApi(token, selectedReg.id);
      if (res.success) {
        setSelectedReg((prev) => (prev ? { ...prev, attendanceMarked: true } : null));
        setLastMarkedStatus({ id: selectedReg.id, time: new Date().toLocaleTimeString() });
        showNotification(`✅ Attendance marked PRESENT for ${selectedReg.id} (${selectedReg.teamLeader.fullName})!`, 'success');
        onAttendanceMarked();
      } else {
        showNotification(`Failed to mark attendance: ${res.message}`, 'error');
      }
    } catch (err: any) {
      showNotification(`Error marking attendance: ${err.message}`, 'error');
    } finally {
      setIsMarking(false);
    }
  };

  const handleScanNext = () => {
    setSelectedReg(null);
    setScannedRegId(null);
    setManualInput('');
    startCamera();
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
    return () => {
      stopCamera();
    };
  }, []);

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Top Header Card */}
      <div className="bg-white border border-stone-200 rounded-2xl p-5 sm:p-6 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-base sm:text-lg font-extrabold text-stone-900 flex items-center gap-2">
            <ScanLine className="w-5 h-5 text-[#B22222]" />
            Live QR Scanner & Event-Day Check-In Desk
          </h3>
          <p className="text-xs text-stone-500 mt-0.5">
            Scan attendee ticket passes via mobile/desktop camera or search by Registration ID.
          </p>
        </div>

        {lastMarkedStatus && (
          <div className="text-xs bg-emerald-50 border border-emerald-200 text-emerald-900 px-3.5 py-1.5 rounded-xl flex items-center gap-2 font-semibold">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>Last Check-In: <strong>{lastMarkedStatus.id}</strong> at {lastMarkedStatus.time}</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Left Column: Camera Scanner & Manual Search */}
        <div className="md:col-span-6 space-y-4">
          <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <span className="font-extrabold text-stone-900 text-xs uppercase tracking-wider flex items-center gap-1.5">
                <Camera className="w-4 h-4 text-[#B22222]" /> Camera Viewfinder
              </span>

              {isCameraActive && (
                <button
                  onClick={toggleFacingMode}
                  className="text-[11px] font-bold text-stone-600 hover:text-stone-900 bg-stone-100 hover:bg-stone-200 px-2.5 py-1 rounded-lg cursor-pointer transition-colors flex items-center gap-1"
                  title="Switch Front/Rear Camera"
                >
                  <RefreshCw className="w-3 h-3" /> Switch Camera
                </button>
              )}
            </div>

            {/* Viewfinder Window */}
            <div className="relative aspect-4/3 bg-stone-950 rounded-xl overflow-hidden flex items-center justify-center border-2 border-stone-800 shadow-inner">
              <video
                ref={videoRef}
                className={`w-full h-full object-cover ${!isCameraActive ? 'hidden' : ''}`}
                muted
                playsInline
              />
              <canvas ref={canvasRef} className="hidden" />

              {/* Viewfinder Overlay / Scanner Reticle */}
              {isCameraActive ? (
                <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-6">
                  <div className="w-56 h-56 border-2 border-emerald-400 rounded-2xl relative shadow-[0_0_20px_rgba(16,185,129,0.3)] flex items-center justify-center">
                    <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-emerald-400 -mt-1 -ml-1 rounded-tl" />
                    <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-emerald-400 -mt-1 -mr-1 rounded-tr" />
                    <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-emerald-400 -mb-1 -ml-1 rounded-bl" />
                    <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-emerald-400 -mb-1 -mr-1 rounded-br" />
                    
                    {/* Animated Scanning Line */}
                    <div className="w-full h-0.5 bg-emerald-400 shadow-[0_0_8px_#34d399] animate-pulse" />
                  </div>
                  <span className="mt-3 text-[11px] font-bold text-white bg-black/60 px-3 py-1 rounded-full backdrop-blur-xs">
                    Align attendee QR code inside frame
                  </span>
                </div>
              ) : (
                <div className="text-center p-6 space-y-3">
                  <div className="w-12 h-12 rounded-full bg-stone-900 border border-stone-800 flex items-center justify-center mx-auto text-stone-400">
                    <CameraOff className="w-6 h-6" />
                  </div>
                  <p className="text-xs text-stone-400 max-w-xs">
                    Camera is currently stopped. Click below to start scanning ticket QR passes.
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

            {/* Scanner Controls */}
            <div className="flex gap-2">
              {!isCameraActive ? (
                <button
                  onClick={startCamera}
                  className="flex-1 py-2.5 px-4 bg-[#B22222] hover:bg-[#961c1c] active:bg-[#7e1717] text-white font-bold text-xs rounded-xl shadow-xs flex items-center justify-center gap-2 cursor-pointer transition-colors"
                >
                  <Camera className="w-4 h-4" /> Start QR Scanner
                </button>
              ) : (
                <button
                  onClick={stopCamera}
                  className="flex-1 py-2.5 px-4 bg-stone-800 hover:bg-stone-900 text-white font-bold text-xs rounded-xl shadow-xs flex items-center justify-center gap-2 cursor-pointer transition-colors"
                >
                  <CameraOff className="w-4 h-4" /> Pause Camera
                </button>
              )}
            </div>

            {/* Divider */}
            <div className="relative my-3">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-stone-200" />
              </div>
              <div className="relative flex justify-center text-[10px] uppercase font-extrabold text-stone-400 bg-white px-2">
                Or Manual Registration Search
              </div>
            </div>

            {/* Manual Lookup Input */}
            <form onSubmit={handleManualSearch} className="flex gap-2">
              <input
                type="text"
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value.toUpperCase())}
                placeholder="Enter Registration ID (e.g. EV26-3SYYEH)"
                className="flex-1 px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs font-mono font-bold outline-none focus:ring-2 focus:ring-[#B22222]"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-stone-900 hover:bg-black text-white font-bold text-xs rounded-xl cursor-pointer flex items-center gap-1.5 shrink-0"
              >
                <Search className="w-3.5 h-3.5" /> Find
              </button>
            </form>
          </div>
        </div>

        {/* Right Column: Scanned Ticket Details & Check-In Action */}
        <div className="md:col-span-6 space-y-4">
          <div className="bg-white border border-stone-200 rounded-2xl p-5 sm:p-6 shadow-xs min-h-[420px] flex flex-col">
            <h4 className="font-extrabold text-stone-900 text-xs uppercase tracking-wider mb-4 flex items-center gap-1.5 pb-3 border-b border-stone-100">
              <QrCode className="w-4 h-4 text-[#B22222]" /> Scanned Ticket Record
            </h4>

            {selectedReg ? (
              <div className="flex-1 flex flex-col justify-between space-y-4">
                <div className="space-y-4">
                  {/* Top Status & ID Bar */}
                  <div className="flex items-center justify-between gap-2 p-3 bg-stone-50 rounded-xl border border-stone-200">
                    <div>
                      <span className="text-[10px] text-stone-500 font-bold uppercase block">Registration ID</span>
                      <span className="font-mono font-extrabold text-sm sm:text-base text-stone-950">
                        {selectedReg.id}
                      </span>
                    </div>

                    <div className="text-right">
                      <span
                        className={`inline-block px-2.5 py-1 rounded-lg text-[10px] font-extrabold uppercase tracking-wider ${
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

                  {/* Team Leader & College */}
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
                        {selectedReg.registrationType === 'workshop' ? 'Individual' : `Team of ${selectedReg.participants.length}`}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px] text-stone-500 pt-1 border-t border-stone-100 font-mono">
                      <div>📞 {selectedReg.teamLeader.phone}</div>
                      <div className="truncate">✉️ {selectedReg.teamLeader.email}</div>
                    </div>
                  </div>

                  {/* Registered Events */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-stone-500 block">
                      Registered Track & Events
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

                  {/* Team Members List if > 1 */}
                  {selectedReg.participants.length > 1 && (
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-stone-500 block">
                        Team Members ({selectedReg.participants.length}):
                      </span>
                      <div className="bg-stone-50 rounded-xl p-2.5 border border-stone-200 text-[11px] space-y-1">
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
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        ₹{selectedReg.totalAmount} • {selectedReg.paymentStatus === 'paid' ? 'PAID' : 'PENDING'}
                      </span>
                      {selectedReg.upiReference && (
                        <span className="text-[10px] font-mono text-stone-500">UTR: {selectedReg.upiReference}</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Bottom Action Buttons */}
                <div className="pt-4 border-t border-stone-100 flex flex-wrap gap-2">
                  {!selectedReg.attendanceMarked ? (
                    <button
                      onClick={handleApproveAttendance}
                      disabled={isMarking}
                      className="flex-1 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-extrabold text-xs rounded-xl shadow-md cursor-pointer transition-all flex items-center justify-center gap-2"
                    >
                      {isMarking ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Marking Present in Database & Sheet...</span>
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
                      <span>Attendee Attendance Approved & Recorded</span>
                    </div>
                  )}

                  <button
                    onClick={handleScanNext}
                    className="py-2.5 px-4 bg-stone-100 hover:bg-stone-200 text-stone-800 font-bold text-xs rounded-xl cursor-pointer transition-colors shrink-0"
                  >
                    Scan Next
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6 space-y-3 text-stone-400">
                <div className="w-14 h-14 rounded-full bg-stone-50 border border-stone-200 flex items-center justify-center text-stone-300">
                  <QrCode className="w-7 h-7" />
                </div>
                <div>
                  <p className="text-xs font-bold text-stone-600">No Ticket Scanned Yet</p>
                  <p className="text-[11px] text-stone-400 mt-1 max-w-xs">
                    Start the camera or type a Registration ID on the left to verify tickets and approve attendance.
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
