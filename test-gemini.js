const LOCALIST_API = "https://calendar.oberlin.edu/api/2/events";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

async function fetchEventWithUrl() {
  for (let page = 1; page <= 5; page++) {
    const url = new URL(LOCALIST_API);
    url.searchParams.set("days", "365");
    url.searchParams.set("pp", "100");
    url.searchParams.set("page", String(page));

    const res = await fetch(url, { headers: { "User-Agent": "localist-sync-bot/1.0" } });
    const data = await res.json();
    const events = (data.events || []).map(w => w.event).filter(e => e && e.status === "live" && !e.private);

    const found = events.find(e => /https?:\/\//.test(e.description_text || e.description || ""));
    if (found) return found;
  }
  return null;
}

async function geminiClean(rawText, maxChars) {
  const prompt = `You are cleaning an event description for a community calendar.

Instructions:
- Remove ALL URLs (http/https links)
- Remove streaming video references (e.g. "Streaming Video:", "Watch the webcast", "Live stream:", "Stream link:")
- Summarize the result to under ${maxChars} characters
- End at a complete sentence boundary (do not cut mid-sentence)
- Return ONLY the cleaned text — no quotes, no explanation

Description to clean:
"""
${rawText}
"""`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini HTTP ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
}

async function main() {
  console.log("Searching for an event with a URL in its description...\n");
  const e = await fetchEventWithUrl();
  if (!e) { console.log("No events with URLs found."); return; }

  const inst = e.event_instances?.[0]?.event_instance || {};
  const rawDescription = (e.description_text || e.description || "").replace(/<[^>]*>/g, " ").trim();
  const departments = (e.filters?.departments || []).map(d => d.name);

  console.log("━".repeat(60));
  console.log("  ORIGINAL EVENT");
  console.log("━".repeat(60));
  console.log(`Title       : ${e.title}`);
  console.log(`Date        : ${inst.start ? new Date(inst.start).toLocaleString() : "—"}`);
  console.log(`Location    : ${e.location_name || e.address || e.location || "—"}`);
  console.log(`Sponsor(s)  : ${departments.join(", ") || "—"}`);
  console.log(`Experience  : ${e.experience || "inperson"}`);
  console.log(`URL         : ${e.localist_url || "—"}`);
  console.log(`\nDescription (${rawDescription.length} chars):`);
  console.log(rawDescription);

  console.log("\n" + "━".repeat(60));
  console.log("  GEMINI-MODIFIED EVENT");
  console.log("━".repeat(60));

  const short = await geminiClean(rawDescription, 200);
  const extended = await geminiClean(rawDescription, 1000);

  console.log(`Title       : ${e.title}`);
  console.log(`Date        : ${inst.start ? new Date(inst.start).toLocaleString() : "—"}`);
  console.log(`Location    : ${e.location_name || e.address || e.location || "—"}`);
  console.log(`Sponsor(s)  : ${departments.join(", ") || "—"}`);
  console.log(`\nDescription (${short.length} chars):`);
  console.log(short);
  console.log(`\nExtended Description (${extended.length} chars):`);
  console.log(extended);
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
