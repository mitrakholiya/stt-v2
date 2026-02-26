import React, { useCallback, useState } from "react";
import { UploadCloud, FileAudio, CheckCircle, AlertCircle } from "lucide-react";

interface AudioUploaderProps {
  onFileSelect: (file: File) => void;
  disabled?: boolean;
}

export function AudioUploader({ onFileSelect, disabled }: AudioUploaderProps) {
  const [isHovering, setIsHovering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validateAndProcessFile = useCallback(
    (file: File) => {
      const validTypes = [
        "audio/wav",
        "audio/mpeg",
        "audio/mp3",
        "audio/mp4",
        "audio/x-m4a",
      ];

      // Some basic validation
      if (
        !validTypes.includes(file.type) &&
        !file.name.match(/\.(wav|mp3|m4a)$/i)
      ) {
        setError("Please upload a valid audio file (.wav, .mp3, .m4a)");
        return;
      }

      if (file.size > 50 * 1024 * 1024) {
        // 50MB limit for batch
        setError("File size too large (max 50MB)");
        return;
      }

      // Check duration
      const audio = new Audio();
      const objectUrl = URL.createObjectURL(file);
      audio.src = objectUrl;
      audio.onloadedmetadata = () => {
        URL.revokeObjectURL(objectUrl);
        if (audio.duration > 605) {
          // 10 mins approx
          setError("Audio duration exceeds 10m limit for Batch translation");
          return;
        }
        onFileSelect(file);
      };
      audio.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        setError("Invalid or corrupted audio file");
      };
    },
    [onFileSelect],
  );

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsHovering(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsHovering(false);
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsHovering(false);
      setError(null);

      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        validateAndProcessFile(files[0]);
      }
    },
    [validateAndProcessFile],
  );

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const files = e.target.files;
    if (files && files.length > 0) {
      validateAndProcessFile(files[0]);
    }
  };

  return (
    <div
      className={`relative rounded-3xl overflow-hidden border-2 border-dashed transition-all duration-300 p-8 flex flex-col items-center justify-center min-h-[220px] bg-slate-800/30 ${
        disabled ? "opacity-50 cursor-not-allowed" : ""
      } ${
        isHovering
          ? "border-indigo-400 bg-indigo-500/10"
          : error
            ? "border-red-500/50 hover:border-red-500"
            : "border-slate-600 hover:border-slate-500 hover:bg-slate-700/30"
      }`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        type="file"
        accept=".wav,.mp3,.m4a,audio/wav,audio/mpeg,audio/mp4,audio/x-m4a"
        onChange={handleFileInput}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed z-10"
        disabled={disabled}
      />

      <div className="flex flex-col items-center gap-4 text-center pointer-events-none z-0">
        <div
          className={`p-4 rounded-full ${isHovering ? "bg-indigo-500/20 text-indigo-400" : "bg-slate-700 text-slate-400"}`}
        >
          <UploadCloud size={32} />
        </div>

        <div>
          <h3 className="text-lg font-bold text-slate-200 mb-1">
            Upload Audio File
          </h3>
          <p className="text-sm text-slate-400">
            Drag and drop or click to browse
          </p>
          <p className="text-xs text-slate-500 mt-2 font-mono bg-slate-800/80 px-2 py-1 rounded inline-block">
            wav, mp3, m4a up to 50MB / 10m
          </p>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 px-3 py-1.5 rounded-full mt-2">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}
      </div>
    </div>
  );
}
