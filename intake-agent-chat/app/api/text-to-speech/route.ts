export const maxDuration = 30

export async function POST(req: Request) {
  try {
    const { text, voice = "nova" } = await req.json() // Default to "nova" voice

    if (!text) {
      return new Response(JSON.stringify({ error: "Text is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }

    if (!process.env.OPENAI_API_KEY) {
      console.error("OpenAI API key not configured")
      return new Response(JSON.stringify({ error: "OpenAI API key not configured" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      })
    }

    console.log(`TTS API: Converting text (${text.length} chars) using voice: ${voice}`)

    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "tts-1",
        input: text,
        voice: voice, // Options: alloy, echo, fable, onyx, nova, shimmer
        response_format: "mp3",
        speed: 1.0,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`OpenAI TTS API error: ${response.status}`, errorText)

      return new Response(
        JSON.stringify({
          error: `OpenAI TTS API error: ${response.status}`,
          details: errorText,
        }),
        {
          status: response.status,
          headers: { "Content-Type": "application/json" },
        },
      )
    }

    const audioBuffer = await response.arrayBuffer()
    console.log(`TTS API: Successfully generated audio (${audioBuffer.byteLength} bytes)`)

    return new Response(audioBuffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": audioBuffer.byteLength.toString(),
      },
    })
  } catch (error) {
    console.error("Text-to-speech error:", error)
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        details: error.message,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    )
  }
}
