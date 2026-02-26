"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LanguageSelector } from "@/components/LanguageSelector";
import { AudioRecorder } from "@/components/AudioRecorder";
import { AudioUploader } from "@/components/AudioUploader";
import {
  PlayCircle,
  Type,
  Loader2,
  Sparkles,
  AlertTriangle,
  Trash2,
} from "lucide-react";

export default function TranslatorPage() {
  const [targetLanguage, setTargetLanguage] = useState("hi-IN");
  const [activeTab, setActiveTab] = useState<"record" | "upload">("record");

  const [audioFile, setAudioFile] = useState<File | Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null); // To preview recorded audio if needed

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const [result, setResult] = useState<{
    originalText: string;
    translatedText: string;
    audioBase64: string;
  } | null>(null);

  const handleAudioCapture = (fileOrBlob: File | Blob) => {
    setAudioFile(fileOrBlob);
    const url = URL.createObjectURL(fileOrBlob);
    setAudioUrl(url);
    // Reset output
    setResult(null);
    setError(null);
    setWarning(null);
  };

  const clearAudio = () => {
    setAudioFile(null);
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    setResult(null);
    setError(null);
    setWarning(null);
  };

  const processTranslate = async () => {
    if (!audioFile) return;

    setIsLoading(true);
    setError(null);
    setWarning(null);
    setResult(null);

    try {
      // VERCEL 4.5MB PAYLOAD BYPASS
      // If file is large (> 4MB), bypass the Next.js API route completely
      // by uploading directly to Azure from the browser.
      const sizeMB = audioFile.size / (1024 * 1024);
      if (sizeMB > 4.0) {
        setWarning("Large file detected. Bypassing serverless limits...");

        // 1. Get Job ID & Upload URL from our secure API
        const initRes = await fetch("/api/translate-audio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "initiate",
            fileName: (audioFile as File).name || "audio.wav",
          }),
        });

        if (!initRes.ok) {
          const errData = await initRes.json().catch(() => ({}));
          throw new Error(
            `Failed to initiate cloud upload: ${errData.error || initRes.statusText}`,
          );
        }

        const { jobId, uploadUrl } = await initRes.json();

        // 2. Upload directly from Browser -> Azure Storage (bypasses Next.js entirely)
        setWarning("Uploading securely to cloud server...");
        const uploadRes = await fetch(uploadUrl, {
          method: "PUT",
          headers: {
            "x-ms-blob-type": "BlockBlob",
            "Content-Type": audioFile.type || "audio/wav",
          },
          body: audioFile,
        });

        if (!uploadRes.ok) {
          throw new Error("Failed to upload audio to cloud storage.");
        }

        // 3. Mark the batch job as "Started" on Sarvam
        setWarning("Starting translation pipeline...");
        const startRes = await fetch("/api/translate-audio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "start", jobId }),
        });

        if (!startRes.ok) {
          throw new Error("Failed to start the batch translation job.");
        }

        // 4. Start polling for the result
        setWarning(
          "Processing (this may take a few minutes for large files)...",
        );
        pollJobStatus(jobId, (audioFile as File).name || "audio.wav");
        return; // Polling will handle the rest
      }

      // STANDARD ROUTE: For smaller files underneath the Vercel limit
      const formData = new FormData();
      formData.append("audio", audioFile);
      formData.append("targetLanguage", targetLanguage);

      const response = await fetch("/api/translate-audio", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Pipeline execution failed");
      }

      if (data.status === "processing" && data.jobId) {
        // Start polling fallback (if API route itself decided it needed batch processing)
        setWarning(
          "Long audio detected. Processing (this may take a few minutes)...",
        );
        pollJobStatus(data.jobId, data.fileName);
      } else {
        setResult(data);
        setIsLoading(false);
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message || "An unexpected error occurred.");
      } else {
        setError(String(err));
      }
      setIsLoading(false);
    }
  };

  const pollJobStatus = async (jobId: string, fileName: string) => {
    const poll = async () => {
      try {
        const response = await fetch(
          `/api/check-job?jobId=${jobId}&targetLanguage=${targetLanguage}&fileName=${encodeURIComponent(fileName)}`,
        );
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Status check failed");
        }

        if (data.status === "completed") {
          setResult(data);
          setIsLoading(false);
          setError(null);
          setWarning(null);
        } else if (data.status === "failed") {
          setError(`Batch processing failed: ${data.error}`);
          setIsLoading(false);
        } else {
          // Still processing, poll again after 10 seconds
          setTimeout(poll, 10000);
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : String(err));
        setIsLoading(false);
      }
    };

    poll();
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-indigo-500/30">
      {/* Background Ornaments */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0 flex items-center justify-center">
        <div className="absolute w-[800px] h-[800px] bg-indigo-600/10 rounded-full blur-[120px] top-[-20%] left-[-10%]"></div>
        <div className="absolute w-[600px] h-[600px] bg-purple-600/10 rounded-full blur-[100px] bottom-[-10%] right-[-10%]"></div>
      </div>

      <div className="relative z-10 max-w-4xl mx-auto px-6 py-12 flex flex-col gap-10">
        {/* Header */}
        <header className="text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-800/50 border border-slate-700 backdrop-blur-md mb-2">
            <Sparkles size={16} className="text-indigo-400" />
            <span className="text-sm font-medium tracking-wide text-indigo-100">
              Powered by Sarvam AI
            </span>
          </div>
          <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight bg-gradient-to-br from-white via-slate-200 to-slate-500 bg-clip-text text-transparent">
            Audio Translator Pipeline
          </h1>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto">
            Speak or upload an audio clip, and watch as it magically transforms
            into your target language with natural-sounding speech.
          </p>
        </header>

        {/* Main Interface Layout */}
        <div className="grid lg:grid-cols-[1fr,1.2fr] gap-8 items-start">
          {/* Left Column (Input) */}
          <div className="flex flex-col gap-6">
            <AnimatePresence mode="popLayout">
              {!audioUrl ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="flex flex-col gap-6"
                >
                  <div className="bg-slate-900/40 p-1.5 rounded-2xl backdrop-blur border border-white/5 inline-flex w-full mb-2">
                    <button
                      onClick={() => setActiveTab("record")}
                      className={`flex-1 py-3 px-4 rounded-xl font-medium transition-all text-sm ${activeTab === "record" ? "bg-indigo-600 text-white shadow-lg" : "text-slate-400 hover:text-white hover:bg-white/5"}`}
                    >
                      Record Audio
                    </button>
                    <button
                      onClick={() => setActiveTab("upload")}
                      className={`flex-1 py-3 px-4 rounded-xl font-medium transition-all text-sm ${activeTab === "upload" ? "bg-indigo-600 text-white shadow-lg" : "text-slate-400 hover:text-white hover:bg-white/5"}`}
                    >
                      Upload File
                    </button>
                  </div>

                  <div className="h-[280px]">
                    <AnimatePresence mode="wait">
                      {activeTab === "record" ? (
                        <motion.div
                          key="record"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          transition={{ duration: 0.2 }}
                        >
                          <AudioRecorder
                            onRecordingComplete={handleAudioCapture}
                            disabled={isLoading}
                          />
                        </motion.div>
                      ) : (
                        <motion.div
                          key="upload"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          transition={{ duration: 0.2 }}
                        >
                          <AudioUploader
                            onFileSelect={handleAudioCapture}
                            disabled={isLoading}
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="bg-slate-800/50 p-6 rounded-2xl border border-white/5 flex flex-col gap-4"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-slate-400 font-medium tracking-wider uppercase flex items-center gap-2">
                      <PlayCircle size={16} className="text-indigo-400" />
                      Selected Audio
                    </p>
                    <button
                      onClick={clearAudio}
                      disabled={isLoading}
                      className="text-slate-400 hover:text-red-400 transition-colors p-2 rounded-lg hover:bg-red-400/10 disabled:opacity-50 flex items-center gap-2 text-sm font-medium"
                    >
                      <Trash2 size={16} />
                      Remove
                    </button>
                  </div>
                  <audio
                    controls
                    src={audioUrl}
                    className="w-full outline-none CustomAudioPlayer h-12"
                  />
                </motion.div>
              )}
            </AnimatePresence>

            <LanguageSelector
              value={targetLanguage}
              onChange={setTargetLanguage}
              disabled={isLoading}
            />

            <button
              onClick={processTranslate}
              disabled={!audioFile || isLoading}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-bold text-lg shadow-xl shadow-indigo-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 relative overflow-hidden group"
            >
              {isLoading ? (
                <>
                  <Loader2 className="animate-spin" size={24} />
                  <span>Processing Audio...</span>
                </>
              ) : (
                <>
                  <Sparkles size={24} />
                  <span>Translate & Generate Audio</span>
                  <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 pointer-events-none mix-blend-overlay"></div>
                </>
              )}
            </button>
          </div>

          {/* Right Column (Output) or Conditional Display */}
          <div className="flex flex-col gap-6">
            {/* Error Message */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="bg-red-500/10 border border-red-500/20 text-red-200 p-4 rounded-2xl flex items-start gap-4"
                >
                  <AlertTriangle className="shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-red-100 mb-1">
                      Processing Error
                    </h3>
                    <p className="text-sm opacity-90">{error}</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Warning Message */}
            <AnimatePresence>
              {warning && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="bg-yellow-500/10 border border-yellow-500/20 text-yellow-200 p-4 rounded-2xl flex items-start gap-4"
                >
                  <AlertTriangle className="shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-yellow-100 mb-1">
                      Notice
                    </h3>
                    <p className="text-sm opacity-90">{warning}</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div
              className={`relative flex flex-col gap-6 p-8 rounded-3xl border ${result || isLoading ? "bg-slate-800/80 border-slate-700 shadow-2xl" : "bg-slate-900/30 border-dashed border-slate-800"} backdrop-blur-xl transition-all min-h-[500px]`}
            >
              {!result && !isLoading && !error && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 px-8 text-center pointer-events-none">
                  <PlayCircle size={48} className="mb-4 opacity-50" />
                  <p className="text-lg">
                    Your translated audio and text will appear here.
                  </p>
                </div>
              )}

              {isLoading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center z-20 bg-slate-900/60 backdrop-blur-sm rounded-3xl">
                  <div className="w-16 h-16 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin mb-6"></div>
                  <h3 className="text-xl font-bold text-white mb-2">
                    Analyzing Audio
                  </h3>
                  <p className="text-indigo-200">
                    Sarvam Bulbul v3 is processing...
                  </p>
                </div>
              )}

              {result && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex flex-col gap-6 h-full"
                >
                  {/* Output Audio */}
                  <div className="bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 p-6 rounded-2xl space-y-4">
                    <div className="flex items-center gap-2 text-indigo-300">
                      <PlayCircle size={20} />
                      <h3 className="font-semibold uppercase tracking-wider text-sm">
                        Translated Audio
                      </h3>
                    </div>
                    <audio
                      controls
                      src={`data:audio/wav;base64,${result.audioBase64}`}
                      className="w-full CustomAudioPlayer"
                      autoPlay
                    />
                  </div>

                  {/* Transcripts */}
                  <div className="flex-1 grid grid-rows-2 gap-4">
                    {/* Translated Text */}
                    <div className="bg-slate-900/50 p-6 rounded-2xl border border-white/5 flex flex-col">
                      <div className="flex items-center gap-2 text-purple-400 mb-3">
                        <Type size={18} />
                        <h3 className="font-semibold text-sm uppercase tracking-wider">
                          Translated Output
                        </h3>
                      </div>
                      <p className="text-lg text-white leading-relaxed flex-1 overflow-auto">
                        {result.translatedText}
                      </p>
                    </div>

                    {/* Original Transcription */}
                    <div className="bg-slate-900/30 p-6 rounded-2xl border border-white/5 flex flex-col">
                      <div className="flex items-center gap-2 text-slate-400 mb-3">
                        <Type size={18} />
                        <h3 className="font-semibold text-sm uppercase tracking-wider">
                          Original Transcript
                        </h3>
                      </div>
                      <p className="text-base text-slate-300 italic flex-1 overflow-auto">
                        &quot;{result.originalText}&quot;
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
