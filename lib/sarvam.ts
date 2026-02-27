export interface SarvamError {
  error: string;
  details?: unknown;
}

const getAuthHeaders = (isMultipart = false) => {
  const headers: HeadersInit = {
    "api-subscription-key":
      process.env.SARVAM_API_KEY ||
      process.env.NEXT_PUBLIC_SARVAM_API_KEY ||
      "",
  };
  if (!isMultipart) {
    headers["Content-Type"] = "application/json";
  }
  return headers;
};

// 1. Speech to Text
export async function speechToText(
  audioBuffer: Buffer,
  mimeType: string,
): Promise<{ text: string; languageCode: string }> {
  const url = "https://api.sarvam.ai/speech-to-text";

  const formData = new FormData();
  const blob = new Blob([audioBuffer as any], { type: mimeType });
  formData.append("file", blob, "audio.wav");
  formData.append("model", "saaras:v3");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "api-subscription-key":
        process.env.SARVAM_API_KEY ||
        process.env.NEXT_PUBLIC_SARVAM_API_KEY ||
        "",
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("STT Error Response:", errorText);
    throw new Error(
      `Speech-to-Text failed: ${response.status} ${response.statusText} - ${errorText}`,
    );
  }

  const data = await response.json();
  // Assume generic structure, trying common fields
  const text =
    data.transcript || data.text || data.data?.text || data.result?.text || "";
  const languageCode = data.language_code || "hi-IN";
  return { text, languageCode };
}

// 2. Translate Text
export async function translateText(
  text: string,
  targetLanguage: string,
  sourceLanguage: string = "hi-IN",
  speakerGender: string = "Male",
): Promise<string> {
  const url = "https://api.sarvam.ai/translate";

  const payload = {
    input: text,
    source_language_code: sourceLanguage, // Using actual detected language
    target_language_code: targetLanguage,
    speaker_gender: speakerGender,
    mode: "formal",
    model: "sarvam-translate:v1",
  };

  const response = await fetch(url, {
    method: "POST",
    headers: getAuthHeaders(false),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Translation Error Response:", errorText);
    throw new Error(
      `Translation failed: ${response.status} ${response.statusText} - ${errorText}`,
    );
  }

  const data = await response.json();
  return data.translated_text || data.text || data.data?.translated_text || "";
}

// 3. Text to Speech (Bulbul v3)

// All Bulbul v3 speakers
const speakers = [
  "anushka",
  "abhilash",
  "manisha",
  "vidya",
  "arya",
  "karun",
  "hitesh",
  "aditya",
  "ritu",
  "priya",
  "neha",
  "rahul",
  "pooja",
  "rohan",
  "simran",
  "kavya",
  "amit",
  "dev",
  "ishita",
  "shreya",
  "ratan",
  "varun",
  "manan",
  "sumit",
  "roopa",
  "kabir",
  "aayan",
  "shubh",
  "ashutosh",
  "advait",
  "amelia",
  "sophia",
  "anand",
  "tanya",
  "tarun",
  "sunny",
  "mani",
  "gokul",
  "vijay",
  "shruti",
  "suhani",
  "mohit",
  "kavitha",
  "rehan",
  "soham",
  "rupali",
];

// Natural sounding Female speakers
const femaleSpeakers = [
  "priya",
  "shreya",
  "sophia",
  "amelia",
  "ritu",
  "neha",
  "ishita",
  "kavya",
];

// Natural sounding Male speakers
const maleSpeakers = ["aditya", "rahul", "kabir"];

export interface SpeakerConfig {
  name: string;
  gender: string;
  pace: number;
}

export function getRandomSpeakerConfig(): SpeakerConfig {
  const isFemale = Math.random() > 0.5; // 50% chance

  if (isFemale) {
    const name =
      femaleSpeakers[Math.floor(Math.random() * femaleSpeakers.length)];
    // Female natural pace adjustment: slightly faster or varied 1.0 - 1.15
    const pace = parseFloat((1.0 + Math.random() * 0.15).toFixed(2));
    return { name, gender: "Female", pace };
  } else {
    const name = maleSpeakers[Math.floor(Math.random() * maleSpeakers.length)];
    // Male natural pace adjustment: slightly slower for deeper emphasis 0.95 - 1.05
    const pace = parseFloat((0.95 + Math.random() * 0.1).toFixed(2));
    return { name, gender: "Male", pace };
  }
}

export async function textToSpeech(
  text: string,
  targetLanguage: string,
  speakerConfig?: SpeakerConfig, // Optional fallback support
): Promise<string> {
  const url = "https://api.sarvam.ai/text-to-speech";

  const config = speakerConfig || getRandomSpeakerConfig();

  const payload = {
    inputs: [text],
    target_language_code: targetLanguage,
    speaker: config.name,
    pace: config.pace,
    speech_sample_rate: 8000,
    enable_preprocessing: true,
    model: "bulbul:v3",
  };

  const response = await fetch(url, {
    method: "POST",
    headers: getAuthHeaders(false),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("TTS Error Response:", errorText);
    throw new Error(
      `Text-to-Speech failed: ${response.status} ${response.statusText} - ${errorText}`,
    );
  }

  const data = await response.json();

  // Bulbul usually returns arrays of base64 "audios"
  if (data.audios && data.audios.length > 0) {
    return data.audios[0];
  }
  return data.audio || data.base64 || "";
}
// 4. Batch Speech to Text (for long audio > 30s)
export async function initiateBatchJob(fileName: string): Promise<{
  job_id: string;
  blob_container_url: string;
}> {
  const url = "https://api.sarvam.ai/speech-to-text/job/v1";
  const response = await fetch(url, {
    method: "POST",
    headers: getAuthHeaders(false),
    body: JSON.stringify({
      job_parameters: {
        model: "saaras:v3",
        files: [fileName],
        config: {
          language_code: "hi-IN", // Defaulting to hi-IN or similar, will auto-detect
          mode: "transcribe",
        },
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to initiate batch job: ${error}`);
  }

  const data = await response.json();
  console.log("Sarvam Initiate Job Response:", JSON.stringify(data));
  return data;
}

export async function getUploadUrl(
  jobId: string,
  fileName: string,
): Promise<string> {
  const url = "https://api.sarvam.ai/speech-to-text/job/v1/upload-files";
  const response = await fetch(url, {
    method: "POST",
    headers: getAuthHeaders(false),
    body: JSON.stringify({
      job_id: jobId,
      files: [fileName],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get upload URL: ${error}`);
  }

  const data = await response.json();
  console.log("Sarvam Upload Response Data:", JSON.stringify(data));

  // Handle various response formats:
  // 1. [{upload_url}]
  // 2. { files: [{upload_url}] }
  // 3. { upload_urls: { "filename": { "file_url": "..." } } }

  if (data.upload_urls && data.upload_urls[fileName]) {
    return data.upload_urls[fileName].file_url;
  }

  const files = Array.isArray(data) ? data : data.files;
  if (files && files[0] && files[0].upload_url) {
    return files[0].upload_url;
  }

  throw new Error(
    `Invalid response structure from getUploadUrl: ${JSON.stringify(data)}`,
  );
}

export async function startBatchJob(jobId: string): Promise<void> {
  const url = `https://api.sarvam.ai/speech-to-text/job/v1/${jobId}/start`;
  const response = await fetch(url, {
    method: "POST",
    headers: getAuthHeaders(false),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to start batch job: ${error}`);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractUrls(obj: any): string[] {
  const urls: string[] = [];
  if (!obj || typeof obj !== "object") return urls;
  for (const value of Object.values(obj)) {
    if (typeof value === "string" && value.startsWith("http")) {
      urls.push(value);
    } else if (typeof value === "object" && value !== null) {
      // Handle nested objects like { download_url: "...", file_url: "..." }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nested = value as Record<string, any>;
      const directUrl =
        nested.download_url || nested.file_url || nested.url || nested.sas_url;
      if (typeof directUrl === "string" && directUrl.startsWith("http")) {
        urls.push(directUrl);
      } else {
        // Recurse
        urls.push(...extractUrls(value));
      }
    }
  }
  return urls;
}

export async function getDownloadUrls(
  jobId: string,
  fileName: string,
): Promise<string[]> {
  const url = "https://api.sarvam.ai/speech-to-text/job/v1/download-files";
  const response = await fetch(url, {
    method: "POST",
    headers: getAuthHeaders(false),
    body: JSON.stringify({
      job_id: jobId,
      files: [fileName],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get download URLs: ${error}`);
  }

  const data = await response.json();
  console.log("Download URLs full response:", JSON.stringify(data));

  const extracted = extractUrls(data);
  console.log("Extracted URL count:", extracted.length);
  return extracted;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getBatchJobStatus(jobId: string): Promise<any> {
  const url = `https://api.sarvam.ai/speech-to-text/job/v1/${jobId}/status`;
  const response = await fetch(url, {
    headers: getAuthHeaders(false),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get job status: ${error}`);
  }

  const data = await response.json();
  console.log("Sarvam Job Status Response:", JSON.stringify(data));
  return data;
}

export async function uploadToAzure(
  uploadUrl: string,
  buffer: Buffer,
  mimeType: string,
): Promise<void> {
  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "x-ms-blob-type": "BlockBlob",
      "Content-Type": mimeType,
    },
    body: buffer as any,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to upload to Azure: ${error}`);
  }
}

/**
 * Merges an array of base64 encoded WAV files into a single base64 string.
 * It assumes all WAV chunks have a standard 44-byte RIFF header.
 */
export function mergeWavBase64(base64Array: string[]): string {
  if (!base64Array || base64Array.length === 0) return "";
  if (base64Array.length === 1) return base64Array[0];

  try {
    const buffers = base64Array.map((b64) => Buffer.from(b64, "base64"));

    // Check if the files are long enough to have a 44 byte header
    if (buffers.some((b) => b.length < 44)) {
      console.error(
        "One or more audio chunks are too short to be standard WAV files.",
      );
      return base64Array[0]; // fallback
    }

    let totalDataLength = 0;
    for (let i = 0; i < buffers.length; i++) {
      totalDataLength += buffers[i].length - 44;
    }

    // Extract the header from the first chunk
    const header = Buffer.from(buffers[0].subarray(0, 44));

    // Standard WAV Header: Data length is at offset 40 (4 bytes, little-endian)
    header.writeUInt32LE(totalDataLength, 40);
    // Standard WAV Header: RIFF chunk size is at offset 4 (totalDataLength + 36)
    header.writeUInt32LE(totalDataLength + 36, 4);

    // Concatenate the new header with the raw PCM data of all chunks (stripping the 44-byte headers)
    const pcmBuffers = buffers.map((b) => b.subarray(44));
    const mergedBuffer = Buffer.concat([header, ...pcmBuffers]);

    return mergedBuffer.toString("base64");
  } catch (error) {
    console.error("Failed to merge WAV base64 arrays:", error);
    // If merger fails (e.g. invalid header formats), return the first chunk as fallback.
    return base64Array[0];
  }
}
