import { NextRequest, NextResponse } from "next/server";
import { textToSpeech } from "@/lib/sarvam";

export async function POST(req: NextRequest) {
  try {
    const { text, targetLanguage } = await req.json();

    if (!text || !targetLanguage) {
      return NextResponse.json(
        { error: "Missing text or targetLanguage" },
        { status: 400 },
      );
    }

    const audioBase64 = await textToSpeech(text, targetLanguage);

    return NextResponse.json({ audioBase64 });
  } catch (error: unknown) {
    console.error("TTS Route Error:", error);
    return NextResponse.json(
      { error: "Failed to generate TTS audio" },
      { status: 500 },
    );
  }
}
