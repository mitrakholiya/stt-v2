import { NextRequest, NextResponse } from "next/server";
import {
  speechToText,
  translateText,
  textToSpeech,
  initiateBatchJob,
  getUploadUrl,
  uploadToAzure,
  startBatchJob,
  getRandomSpeakerConfig,
  mergeWavBase64,
} from "@/lib/sarvam";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    // Check if json request (for direct cloud upload bypass)
    if (req.headers.get("content-type")?.includes("application/json")) {
      const body = await req.json();

      // Step 1: Initiate job and get upload URL
      if (body.action === "initiate") {
        const { job_id } = await initiateBatchJob(body.fileName);
        const uploadUrl = await getUploadUrl(job_id, body.fileName);
        return NextResponse.json({ jobId: job_id, uploadUrl });
      }

      // Step 2: Start the batch job after client uploads directly
      if (body.action === "start") {
        await startBatchJob(body.jobId);
        return NextResponse.json({
          success: true,
          status: "processing",
          jobId: body.jobId,
          message: "Batch processing started",
        });
      }
    }

    const formData = await req.formData();

    const audioFile = formData.get("audio") as File | null;
    const targetLanguage = formData.get("targetLanguage") as string | null;

    if (!audioFile) {
      return NextResponse.json(
        { error: "No audio file provided" },
        { status: 400 },
      );
    }

    if (!targetLanguage) {
      return NextResponse.json(
        { error: "No target language provided" },
        { status: 400 },
      );
    }

    // Convert File to Buffer
    const arrayBuffer = await audioFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const mimeType = audioFile.type || "audio/wav";

    // Approximate check for 30s (uncompressed PCM 16k mono is ~1MB, compressed is less)
    // Most audio files > 2MB are likely > 30s. Let's be safer and just check the sync result,
    // or trigger batch if the file brand is large.
    const audioSizeMB = audioFile.size / (1024 * 1024);
    const fileName = audioFile.name || "audio.wav";

    const handleBatchFallback = async () => {
      console.log("Initiating Batch Job for long audio...");
      const { job_id } = await initiateBatchJob(fileName);
      const uploadUrl = await getUploadUrl(job_id, fileName);

      console.log(`Uploading ${fileName} to Azure...`);
      await uploadToAzure(uploadUrl, buffer, mimeType);

      console.log("Starting batch job...");
      await startBatchJob(job_id);

      return NextResponse.json({
        jobId: job_id,
        fileName: fileName,
        status: "processing",
        message: "Long audio detected. Processing started...",
      });
    };

    if (audioSizeMB > 1.0) {
      return await handleBatchFallback();
    }

    // Step 1: Speech-to-Text
    console.log("Sending to STT...");
    let originalText = "";
    let languageCode = "hi-IN";

    try {
      const sttResult = await speechToText(buffer, mimeType);
      originalText = sttResult.text;
      languageCode = sttResult.languageCode;
    } catch (sttError: unknown) {
      const errStr =
        sttError instanceof Error ? sttError.message : String(sttError);
      // Fallback if Sarvam complains about audio duration
      if (
        errStr.toLowerCase().includes("duration greater than 30 seconds") ||
        errStr.toLowerCase().includes("too long")
      ) {
        console.log(
          "STT failed due to duration (>30s), automatically falling back to batch API...",
        );
        return await handleBatchFallback();
      }
      throw sttError; // Re-throw other errors
    }

    if (!originalText) {
      throw new Error("Could not transcribe audio. Result was empty.");
    }

    // Get dynamic natural speaker configuration
    const speakerConfig = getRandomSpeakerConfig();
    console.log(
      `Selected Speaker: ${speakerConfig.name} (${speakerConfig.gender}), Pace: ${speakerConfig.pace}`,
    );

    // Step 2: Translate Text
    console.log(`Translating text to ${targetLanguage}...`);
    const translatedText = await translateText(
      originalText,
      targetLanguage,
      languageCode,
      speakerConfig.gender,
    );

    if (!translatedText) {
      throw new Error("Translation failed. Result was empty.");
    }

    // Step 3: Text-to-Speech
    console.log(`Converting translated text to speech...`);
    let audioParts: string[] = [];
    if (translatedText.length > 500) {
      const chunks = translatedText.match(/[\s\S]{1,490}(\s|$)/g) || [
        translatedText.substring(0, 500),
      ];
      for (const chunk of chunks) {
        if (chunk.trim()) {
          const base64 = await textToSpeech(
            chunk.trim(),
            targetLanguage,
            speakerConfig,
          );
          audioParts.push(base64);
        }
      }
    } else {
      const base64 = await textToSpeech(
        translatedText,
        targetLanguage,
        speakerConfig,
      );
      audioParts = [base64];
    }

    if (audioParts.length === 0) {
      throw new Error("Text-to-Speech failed. Result was empty.");
    }

    // Merge the WAV chunks into a single valid base64 audio string
    const mergedAudioBase64 = mergeWavBase64(audioParts);

    // Return the required structure
    return NextResponse.json({
      originalText,
      translatedText,
      audioBase64: mergedAudioBase64,
    });
  } catch (error: unknown) {
    let errorMsg = error instanceof Error ? error.message : String(error);
    console.error("API Route Error:", errorMsg);

    return NextResponse.json(
      {
        error: "Translation failed",
        details: errorMsg,
      },
      { status: 500 },
    );
  }
}
