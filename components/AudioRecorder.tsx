import React, { useState, useRef, useEffect } from "react";
import { Mic, Square, Loader2 } from "lucide-react";
import { motion } from "framer-motion";

interface AudioRecorderProps {
  onRecordingComplete: (audioBlob: Blob) => void;
  disabled?: boolean;
}

export function AudioRecorder({
  onRecordingComplete,
  disabled,
}: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      // Cleanup on unmount
      if (timerRef.current) clearInterval(timerRef.current);
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state === "recording"
      ) {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  const toggleRecording = async () => {
    if (isRecording) {
      stopRecording();
    } else {
      await startRecording();
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "audio/webm;codecs=opus",
      });

      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: "audio/webm",
        });
        onRecordingComplete(audioBlob);

        // Stop all tracks
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingDuration(0);

      timerRef.current = setInterval(() => {
        setRecordingDuration((prev) => {
          if (prev >= 599) {
            stopRecording();
            return 600;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err) {
      console.error("Microphone access denied:", err);
      alert("Microphone access is required to record audio.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const formatTime = (seconds: number) => {
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return `${min}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div
      className={`p-6 bg-slate-800/50 outline outline-1 outline-white/10 rounded-3xl backdrop-blur flex flex-col items-center gap-6 shadow-2xl transition-all duration-300 ${isRecording ? "outline-red-500/50 shadow-red-500/20" : ""}`}
    >
      <div className="relative flex justify-center items-center h-28 w-28">
        {isRecording && (
          <motion.div
            initial={{ scale: 1 }}
            animate={{ scale: [1, 1.4, 1] }}
            transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
            className="absolute inset-0 bg-red-500/20 rounded-full z-0"
          />
        )}
        <button
          onClick={toggleRecording}
          disabled={disabled && !isRecording}
          className={`relative z-10 w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 ${
            isRecording
              ? "bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/50"
              : "bg-indigo-600 hover:bg-indigo-700 text-white disabled:bg-slate-700 disabled:cursor-not-allowed shadow-lg shadow-indigo-600/30"
          }`}
        >
          {isRecording ? (
            <Square fill="currentColor" size={28} className="rounded-sm" />
          ) : (
            <Mic size={32} />
          )}
        </button>
      </div>

      <div className="text-center space-y-2">
        <h3 className="text-lg font-bold text-white">
          {isRecording ? "Recording..." : "Tap to Record"}
        </h3>
        {isRecording && (
          <div className="text-red-400 font-mono text-xl tracking-wider">
            {formatTime(recordingDuration)} / 10:00
          </div>
        )}
        {!isRecording && (
          <p className="text-sm text-slate-400">
            Record a message (max 10m) to translate
          </p>
        )}
      </div>
    </div>
  );
}
