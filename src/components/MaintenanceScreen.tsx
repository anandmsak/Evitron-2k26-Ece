import React from 'react';
import { ShieldAlert, Mail, MapPin, Calendar, Clock, Lock, ExternalLink, RefreshCw } from 'lucide-react';
import { SiteSettings } from '../types';

interface MaintenanceScreenProps {
  settings: SiteSettings;
  onNavigate: (path: string) => void;
}

export const MaintenanceScreen: React.FC<MaintenanceScreenProps> = ({ settings, onNavigate }) => {
  return (
    <div className="min-h-[80vh] flex items-center justify-center py-12 px-4 sm:px-6">
      <div className="max-w-xl w-full text-center space-y-8 animate-fade-in">
        {/* Animated Badge & Icon */}
        <div className="relative inline-flex items-center justify-center">
          <div className="w-20 h-20 rounded-2xl bg-amber-500/10 border-2 border-amber-500/30 flex items-center justify-center text-amber-500 shadow-lg shadow-amber-500/10">
            <ShieldAlert className="w-10 h-10 animate-pulse" />
          </div>
          <span className="absolute -top-2 -right-2 px-2.5 py-0.5 bg-amber-500 text-stone-950 font-black text-[10px] rounded-full uppercase tracking-wider shadow-xs">
            Notice
          </span>
        </div>

        {/* Headings */}
        <div className="space-y-3">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-stone-900 border border-amber-500/30 text-amber-400 font-mono text-[11px] font-bold rounded-full">
            <Clock className="w-3.5 h-3.5" /> SYSTEM UPGRADE & MAINTENANCE
          </span>
          <h1 className="text-3xl sm:text-4xl font-black text-stone-900 tracking-tight">
            Site Under Maintenance
          </h1>
          <p className="text-sm sm:text-base text-stone-600 max-w-md mx-auto leading-relaxed">
            {settings.maintenanceMessage ||
              'EVITRON 2K26 portal is currently undergoing scheduled maintenance & system upgrades. We will be back online shortly!'}
          </p>
        </div>

        {/* Symposium Details Card */}
        <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-xs text-left space-y-3">
          <div className="flex items-center justify-between border-b border-stone-100 pb-3">
            <span className="text-xs font-black text-stone-900 uppercase tracking-wider">
              {settings.symposiumTitle || 'EVITRON 2K26'}
            </span>
            <span className="text-[11px] font-bold text-[#B22222]">
              National Level Symposium
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-stone-600">
            <div className="flex items-center gap-2 p-2 rounded-lg bg-stone-50">
              <Calendar className="w-4 h-4 text-[#B22222] shrink-0" />
              <span>Event Date: <strong>{settings.eventDate || '08/10/2026'}</strong></span>
            </div>
            <div className="flex items-center gap-2 p-2 rounded-lg bg-stone-50">
              <MapPin className="w-4 h-4 text-[#B22222] shrink-0" />
              <span className="truncate">{settings.college || 'Mahendra Engineering College'}</span>
            </div>
          </div>
        </div>

        {/* Action Buttons & Contact Info */}
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-stone-900 hover:bg-stone-800 active:bg-black text-white text-xs font-bold rounded-xl transition-all shadow-md cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Check Status / Refresh
            </button>

            <a
              href={`mailto:${settings.contactEmail || 'evitron26@gmail.com'}`}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-white hover:bg-stone-50 border border-stone-200 text-stone-800 text-xs font-bold rounded-xl transition-all cursor-pointer"
            >
              <Mail className="w-3.5 h-3.5 text-[#B22222]" /> Contact Organizers
            </a>
          </div>

          {/* Admin Login Link */}
          <div className="pt-4 border-t border-stone-200/80">
            <button
              onClick={() => onNavigate('/admin')}
              className="inline-flex items-center gap-1.5 text-[11px] font-bold text-stone-500 hover:text-[#B22222] transition-colors cursor-pointer"
            >
              <Lock className="w-3 h-3" /> Event Coordinator / Admin Access &rarr;
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
