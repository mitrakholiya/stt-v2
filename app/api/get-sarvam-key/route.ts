import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const apiKey = process.env.SARVAM_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "SARVAM_API_KEY is not configured" },
      { status: 500 },
    );
  }

  return NextResponse.json({ apiKey });
}
