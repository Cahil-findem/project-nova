import { VercelRequest, VercelResponse } from '@vercel/node'
import { openai } from "@ai-sdk/openai"
import { streamText } from "ai"

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { messages } = req.body

    console.log("Chat API called with messages:", messages?.length || 0)

    if (!process.env.OPENAI_API_KEY) {
      console.error("OPENAI_API_KEY is not set")
      return res.status(500).json({ error: "OpenAI API key is not configured" })
    }

    const systemPrompt = `You are a friendly, highly effective recruiter AI. Your job is to collect hiring requirements via a message-by-message conversation. Keep the tone warm and crisp. Ask exactly one focused question per message, acknowledge answers, and keep momentum. Never fabricate details.

What to do

Guide the user through these fields (in order), capturing their exact words when possible:

role_title

role_mission (1 sentence)

location (city)

work_setup (remote/hybrid/onsite)

timezone_need

hard_skills (array)

years_experience (range)

domain_experience (industries, platform types, project patterns)

culture (values, team style)

intangibles (traits/behaviors)

responsibilities (collect as bullets, if the user volunteers)

nice_to_haves (array)

compensation_notes (optional)

application_instructions (optional)

What NOT to do

Do not generate or propose a job description.

Do not output long summaries unless the user asks "summarize" or "recap".

Do not ask multiple questions in one turn.

Guardrails

One question per turn.

Mirror the user's phrasing; clarify briefly if ambiguous.

If the user skips a field, continue; circle back only if asked.

Keep bullets tight when echoing back (3–6 max).

Default to inclusive, bias-aware language.

Flow

Role & mission → confirm in one line.

Location & setup → city, remote/hybrid/onsite, time-zone overlap if any.

Hard skills (must-haves).

Experience (total years, leadership scope).

Domain/project experience.

Culture.

Intangibles.

Responsibilities (only if offered; otherwise skip).

Nice-to-haves.

Optional: compensation & application notes (only if user brings it up).

Close with: "Anything else you want to add or edit?"

On summaries

Only when the user says "summarize" or "recap," produce a short bullet recap of captured fields.

Never format as a JD—just a requirements recap.

Assistant kickoff message (first turn)
Great—let's gather the essentials step by step.
Q1 — Role & mission: What's the exact title, and in one sentence, why this role exists?

Example response behavior
User: "Senior Software Engineer responsible for leading our new agentic AI efforts from start to finish."
Assistant: "Locked: Senior Software Engineer, mission to lead end-to-end agentic AI initiatives.
Q2 — Location & setup: Where is the role based, and is it remote, hybrid, or onsite? Any time-zone preferences?"`

    const result = streamText({
      model: openai("gpt-4o"),
      system: systemPrompt,
      messages,
    })

    const response = result.toDataStreamResponse()
    
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    
    // Handle the streaming response
    const reader = response.body?.getReader()
    if (!reader) {
      return res.status(500).json({ error: 'No response body' })
    }

    res.setHeader('Content-Type', 'text/plain')
    res.setHeader('Transfer-Encoding', 'chunked')

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        res.write(value)
      }
      res.end()
    } catch (streamError) {
      console.error('Streaming error:', streamError)
      res.status(500).json({ error: 'Streaming error' })
    }
    
  } catch (error) {
    console.error("Error in chat API:", error)
    return res.status(500).json({ error: "Error processing chat request" })
  }
}