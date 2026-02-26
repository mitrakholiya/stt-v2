import { NextRequest, NextResponse } from "next/server";
import {
  getBatchJobStatus,
  getDownloadUrls,
  translateText,
  textToSpeech,
  getRandomSpeakerConfig,
  mergeWavBase64,
} from "@/lib/sarvam";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get("jobId");
  const targetLanguage = searchParams.get("targetLanguage");
  const fileName = searchParams.get("fileName");

  if (!jobId || !targetLanguage || !fileName) {
    return NextResponse.json(
      { error: "Missing jobId, targetLanguage, or fileName" },
      { status: 400 },
    );
  }

  try {
    const status = await getBatchJobStatus(jobId);

    if (status.job_state === "Completed") {
      // 1. Extract output file names from job status
      // The status response contains job_details with successful file info
      let outputFileNames: string[] = [];

      // Try to extract output file names from job_details
      // Structure: job_details[].outputs[].file_name (e.g. "0.json")
      if (status.job_details && Array.isArray(status.job_details)) {
        for (const detail of status.job_details) {
          if (
            detail.state === "Success" &&
            detail.outputs &&
            Array.isArray(detail.outputs)
          ) {
            for (const output of detail.outputs) {
              if (output.file_name) {
                outputFileNames.push(output.file_name);
              }
            }
          }
        }
        
      }

      // If we couldn't get file names from job_details, try common patterns
      if (outputFileNames.length === 0) {
        // Try the original file name with .json extension
        const baseName = fileName.replace(/\.[^.]+$/, "");
        outputFileNames = [baseName + ".json", fileName];
      }

      console.log("Attempting to download files:", outputFileNames);

      // Try each possible file name until one works
      let urls: string[] = [];
      for (const tryFileName of outputFileNames) {
        try {
          urls = await getDownloadUrls(jobId, tryFileName);
          if (urls.length > 0) break;
        } catch (downloadErr) {
          console.error(
            `File name '${tryFileName}' failed:`,
            downloadErr instanceof Error
              ? downloadErr.message
              : String(downloadErr),
          );
        }
      }

      if (urls.length === 0) {
        throw new Error(
          "Job completed but no download URLs found. Status: " +
            JSON.stringify(status),
        );
      }

      // 2. Fetch the actual transcript from the first successful file
      const resultResponse = await fetch(urls[0]);
      if (!resultResponse.ok) {
        throw new Error("Failed to fetch job results from storage.");
      }

      const resultData = await resultResponse.json();
      console.log("Sarvam Result JSON:", JSON.stringify(resultData));

      // The structure is usually { transcript: "..." } or similar
      const originalText =
        resultData.transcript ||
        resultData.text ||
        resultData.data?.text ||
        resultData.result?.text ||
        (Array.isArray(resultData)
          ? resultData.map((f) => f.transcript || f.text || "").join(" ")
          : "");

      const sourceLanguageCode = resultData.language_code || "hi-IN";

      if (!originalText || originalText.trim() === "") {
        throw new Error("Transcript not found in job results.");
      }

      const speakerConfig = getRandomSpeakerConfig();
      console.log(`[Batch] Selected Speaker: ${speakerConfig.name} (${speakerConfig.gender}), Pace: ${speakerConfig.pace}`);

      // Step 2: Translate
      // Sarvam Translate API has a 2000 character limit per request.
      // We need to chunk the originalText if it's too long.
      let translatedText = "";
      if (originalText.length > 1900) {
        // Split by sentences or paragraphs if possible, otherwise by safe chunk size
        const textChunks = originalText.match(
          /[\s\S]{1,1900}(?:\.|\n|\s|$)/g,
        ) || [originalText];
        const translatedChunks = [];

        for (const chunk of textChunks) {
          if (chunk.trim()) {
            const translatedChunk = await translateText(
              chunk.trim(),
              targetLanguage,
              sourceLanguageCode,
              speakerConfig.gender
            );
            translatedChunks.push(translatedChunk);
          }
        }
        translatedText = translatedChunks.join(" ");
      } else {
        translatedText = await translateText(
          originalText,
          targetLanguage,
          sourceLanguageCode,
          speakerConfig.gender
        );
      }

      // Step 3: TTS
      // For long text, we might need to chunk it for Bulbul v3 (500 chars limit)
      let audioParts: string[] = [];
      if (translatedText.length > 500) {
        // Simple chunking logic
        const chunks = translatedText.match(/[\s\S]{1,490}(\s|$)/g) || [
          translatedText.substring(0, 500),
        ];
        for (const chunk of chunks) {
          if (chunk.trim()) {
            const base64 = await textToSpeech(chunk.trim(), targetLanguage, speakerConfig);
            audioParts.push(base64);
          }
        }
      } else {
        const base64 = await textToSpeech(translatedText, targetLanguage, speakerConfig);
        audioParts = [base64];
      }
      
      const mergedAudioBase64 = mergeWavBase64(audioParts);

      return NextResponse.json({
        status: "completed",
        originalText,
        translatedText,
        audioBase64: mergedAudioBase64,
      });
    }

    if (status.job_state === "Failed") {
      return NextResponse.json({
        status: "failed",
        error: status.error || "Batch job failed",
      });
    }

    return NextResponse.json({
      status: "processing",
      job_state: status.job_state,
    });
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Status check failed", details: errorMsg },
      { status: 500 },
    );
  }
}
