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

      // Step 3 (Chunked fallback proxy): Commit blocks
      if (body.action === "commitUpload") {
        const { uploadUrl, blockIds, mimeType } = body;

        const blockListXml = `<?xml version="1.0" encoding="utf-8"?><BlockList>${blockIds.map((id: string) => `<Latest>${id}</Latest>`).join("")}</BlockList>`;

        const commitRes = await fetch(`${uploadUrl}&comp=blocklist`, {
          method: "PUT",
          headers: {
            "x-ms-blob-content-type": mimeType,
            "Content-Type": "application/xml",
          },
          body: blockListXml,
        });

        if (!commitRes.ok) {
          const errText = await commitRes.text();
          console.error("Azure Commit Error:", errText);
          return NextResponse.json(
            { error: "Failed to commit chunked upload to Azure." },
            { status: 500 },
          );
        }
        return NextResponse.json({ success: true });
      }
    }

    const formData = await req.formData();

    // Chunked Upload Proxy Route
    const action = formData.get("action") as string | null;
    if (action === "uploadChunk") {
      const uploadUrl = formData.get("uploadUrl") as string;
      const blockId = formData.get("blockId") as string;
      const chunk = formData.get("chunk") as File | null;

      if (!chunk)
        return NextResponse.json(
          { error: "No chunk provided" },
          { status: 400 },
        );

      const chunkBuffer = Buffer.from(await chunk.arrayBuffer());

      const chunkRes = await fetch(
        `${uploadUrl}&comp=block&blockid=${encodeURIComponent(blockId)}`,
        {
          method: "PUT",
          headers: {
            "Content-Length": chunkBuffer.length.toString(),
          },
          body: chunkBuffer,
        },
      );

      if (!chunkRes.ok) {
        const errText = await chunkRes.text();
        console.error("Azure Chunk Upload Error:", errText);
        return NextResponse.json(
          { error: "Failed to upload chunk to Azure." },
          { status: 500 },
        );
      }
      return NextResponse.json({ success: true });
    }

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
    let translatedText = "";
    let warningMessage: string | undefined = undefined;

    try {
      translatedText = await translateText(
        originalText,
        targetLanguage,
        languageCode,
        speakerConfig.gender,
      );
    } catch (err: unknown) {
      const errStr = err instanceof Error ? err.message : String(err);
      if (errStr.includes("Source and target languages must be different")) {
        console.log(
          "Source and target languages are the same, skipping translation.",
        );
        translatedText = originalText;
        warningMessage =
          "Please change language, it is the same as the uploaded audio.";
      } else {
        throw err;
      }
    }

    if (!translatedText) {
      throw new Error("Translation failed. Result was empty.");
    }

    // Step 3: Text-to-Speech
    console.log(`Converting translated text to speech...`);
    let audioParts: string[] = [];
    // Bulbul v3 supports up to 2500 characters per call
    if (translatedText.length > 2500) {
      const chunks = translatedText.match(/[\s\S]{1,2400}(\s|$)/g) || [
        translatedText.substring(0, 2500),
      ];
      const validChunks = chunks.filter((c) => c.trim());
      audioParts = await Promise.all(
        validChunks.map((chunk) =>
          textToSpeech(chunk.trim(), targetLanguage, speakerConfig),
        ),
      );
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
      ...(warningMessage ? { warning: warningMessage } : {}),
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
