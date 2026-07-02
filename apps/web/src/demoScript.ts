/**
 * A canned therapy-session transcript so the whole pipeline is demoable with
 * no microphone and no API keys — you literally watch the note write itself.
 */
export const DEMO_SESSION: { speaker: "clinician" | "client"; text: string }[] = [
  { speaker: "clinician", text: "Good to see you again. How has your week been since we last talked?" },
  { speaker: "client", text: "Honestly pretty rough. I've been feeling really anxious, especially at night, and I haven't been sleeping well at all." },
  { speaker: "clinician", text: "I'm sorry to hear that. Can you tell me more about what the anxiety feels like in those moments?" },
  { speaker: "client", text: "It's like my chest gets tight and my mind just races. I keep worrying about work and whether I'm going to lose my job." },
  { speaker: "clinician", text: "That sounds exhausting. I noticed you appeared a bit tearful just now when you mentioned work." },
  { speaker: "client", text: "Yeah. I feel like I'm failing at everything and I can't turn my brain off." },
  { speaker: "clinician", text: "Let's try the grounding technique we practiced. We explored some cognitive reframing last time — how did that go?" },
  { speaker: "client", text: "The breathing actually helped a little. When I reframed the thought I was able to calm down faster." },
  { speaker: "clinician", text: "That's real progress. You were able to use the skill on your own, which is exactly the goal." },
  { speaker: "client", text: "I want to work on the sleep though. That's the thing that's really wearing me down." },
  { speaker: "clinician", text: "Good goal. For homework let's practice the breathing before bed, and I'd like you to keep a short sleep log." },
  { speaker: "clinician", text: "We'll continue with CBT next session and review the log together. Let's schedule for next week." },
  { speaker: "client", text: "Okay, that sounds doable. Thank you." },
];
