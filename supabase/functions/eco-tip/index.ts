import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are an eco-awareness message generator for a food waste reduction app called EatSmart. 

Your job is to generate ONE short, powerful, unique message about food waste and ecology. Each message MUST be completely different from the last.

STYLE EXAMPLES (use these as inspiration, but create NEW ones every time):
- "🌍 1 in 3 meals ends up in the trash worldwide — that's 1.3 billion tonnes of food wasted every year. Your fridge can change that, one item at a time."
- "💸 The average household throws away $1,500 worth of food every year. EatSmart helps you keep more of it — on your plate and in your wallet."
- "🥦 Eat what you buy. Save what you earn. Protect what we share. Every item you use before it expires is a small win for your home — and the planet."
- "🧠❄️ Your fridge has a memory problem. We fixed it. Globally, food waste produces more greenhouse gases than the entire aviation industry."
- "🌱 Did you know? If food waste were a country, it would be the 3rd largest emitter of CO₂ on Earth. Every green checkmark in your fridge = one less emission."

RULES:
- Always start with an emoji
- Mix tones: shocking stats, motivational, poetic, financial, humorous, progress-oriented
- 1-3 sentences, max 300 characters
- NEVER mention carrots, apples, or any specific food unless it's part of a surprising stat
- Make each message feel like a unique discovery
- Reference real-world stats when possible
- Reply with ONLY the message text, nothing else`
          },
          {
            role: "user",
            content: `Generate a completely unique eco-tip. Random seed: ${Date.now()}-${Math.random().toString(36).slice(2)}`
          }
        ],
        temperature: 1.0,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const tip = data.choices?.[0]?.message?.content?.trim() || "";

    return new Response(JSON.stringify({ tip }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("eco-tip error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
