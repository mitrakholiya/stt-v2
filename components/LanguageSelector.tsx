import React from "react";
import { Languages, ArrowRight } from "lucide-react";

export const SUPPORTED_LANGUAGES = [
  { code: "bn-IN", name: "Bengali" },
  { code: "en-IN", name: "English" },
  { code: "gu-IN", name: "Gujarati" },
  { code: "hi-IN", name: "Hindi" },
  { code: "kn-IN", name: "Kannada" },
  { code: "ml-IN", name: "Malayalam" },
  { code: "mr-IN", name: "Marathi" },
  { code: "od-IN", name: "Odia" },
  { code: "pa-IN", name: "Punjabi" },
  { code: "ta-IN", name: "Tamil" },
  { code: "te-IN", name: "Telugu" },
];

interface LanguageSelectorProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function LanguageSelector({
  value,
  onChange,
  disabled,
}: LanguageSelectorProps) {
  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-white/5 border border-white/10 rounded-2xl backdrop-blur-sm">
      {/* Source Language (Auto-detect) */}
      <div className="flex-1 w-full bg-white/5 rounded-xl p-3 flex items-center gap-3">
        <div className="p-2 bg-blue-500/20 text-blue-400 rounded-lg">
          <Languages size={18} />
        </div>
        <div>
          <p className="text-xs text-slate-400 font-medium tracking-wider uppercase">
            Source
          </p>
          <p className="font-semibold text-slate-200">Auto-detect</p>
        </div>
      </div>

      <div className="hidden sm:block text-slate-500">
        <ArrowRight size={20} />
      </div>

      {/* Target Language Dropdown */}
      <div className="flex-1 w-full bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-white/10 focus-within:border-blue-500/50 transition-colors">
        <div className="p-2 bg-purple-500/20 text-purple-400 rounded-lg">
          <Languages size={18} />
        </div>
        <div className="w-full">
          <p className="text-xs text-slate-400 font-medium tracking-wider uppercase">
            Target
          </p>
          <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            className="w-full bg-transparent font-semibold text-slate-200 outline-none appearance-none cursor-pointer disabled:opacity-50"
          >
            {SUPPORTED_LANGUAGES.map((lang) => (
              <option
                key={lang.code}
                value={lang.code}
                className="bg-slate-900 text-slate-200"
              >
                {lang.name} ({lang.code})
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
