export const maxDuration = 30

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      console.error("OpenAI API key not configured")
      return new Response(JSON.stringify({ error: "OpenAI API key not configured" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      })
    }

    const formData = await req.formData()
    const audioFile = formData.get("audio") as File

    if (!audioFile) {
      console.error("No audio file provided")
      return new Response(JSON.stringify({ error: "Audio file is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }

    console.log("Received audio file:", audioFile.name, audioFile.type, audioFile.size, "bytes")

    // Create a new FormData for the OpenAI API
    const openaiFormData = new FormData()
    openaiFormData.append("file", audioFile)
    openaiFormData.append("model", "whisper-1")

    console.log("Sending to OpenAI Whisper API...")
    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: openaiFormData,
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error("OpenAI Whisper API error:", response.status, errorText)
      return new Response(JSON.stringify({ error: `Failed to transcribe audio: ${response.status}` }), {
        status: response.status,
        headers: { "Content-Type": "application/json" },
      })
    }

    const result = await response.json()
    console.log("Transcription result:", result)

    return new Response(JSON.stringify({ text: result.text }), {
      headers: { "Content-Type": "application/json" },
    })
  } catch (error) {
    console.error("Speech-to-text error:", error)
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
}
