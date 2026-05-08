import { NextResponse } from "next/server";

const MESSAGE = "GitHub Actions sync control has been retired. Codex automations should fetch sources, write source reports to automation_runs, and queue documents directly in Firestore.";

export async function POST() {
  return NextResponse.json({ error: MESSAGE }, { status: 410 });
}

export async function GET() {
  return NextResponse.json({ status: "retired", message: MESSAGE }, { status: 410 });
}

export async function DELETE() {
  return NextResponse.json({ error: MESSAGE }, { status: 410 });
}
