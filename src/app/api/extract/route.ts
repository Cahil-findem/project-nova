import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export async function POST(request: NextRequest) {
  try {
    const { conversationText } = await request.json()

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      )
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: `You are an expert at extracting ONLY explicitly stated job information from hiring conversations. 

          CRITICAL: You MUST only extract information that is directly stated in the conversation. Do NOT infer, assume, or generate any content that is not explicitly mentioned.

          Extract ONLY if explicitly mentioned:
          1. Role: Exact job title mentioned (e.g., "Software Engineer", "Product Manager")  
          2. Location: Exact location mentioned (e.g., "San Francisco", "remote", "New York")
          3. Requirements: Technical skills, tools, experience explicitly mentioned (short phrases)
          4. Qualities: Soft skills, traits, behaviors explicitly discussed (complete sentences)

          Return ONLY a JSON object:
          {
            "role": "exact title mentioned or null",
            "location": "exact location mentioned or null",
            "requirements": ["only explicitly mentioned skills/tools"],
            "qualities": ["only explicitly mentioned traits as complete sentences"]
          }

          STRICT RULES:
          - If a field is not explicitly mentioned in the conversation, return null (for role/location) or empty array (for requirements/qualities)
          - Do NOT add common job requirements or qualities that weren't mentioned
          - Do NOT make logical inferences about what might be needed
          - Do NOT generate generic content
          - Only extract what is actually written in the conversation text`
        },
        {
          role: 'user',
          content: conversationText
        }
      ],
      max_tokens: 500,
      temperature: 0.1
    })

    const extractedText = completion.choices[0]?.message?.content?.trim()
    if (!extractedText) {
      return NextResponse.json({ error: 'No extraction result' }, { status: 500 })
    }

    try {
      const extracted = JSON.parse(extractedText)
      console.log('=== SERVER EXTRACTION DEBUG ===')
      console.log('Input conversation:', conversationText)
      console.log('Raw OpenAI response:', extractedText)
      console.log('Parsed extraction result:', extracted)
      console.log('================================')
      return NextResponse.json({ extracted })
    } catch (parseError) {
      console.error('Failed to parse extraction result:', parseError)
      console.error('Raw response that failed to parse:', extractedText)
      return NextResponse.json({ error: 'Invalid extraction format' }, { status: 500 })
    }
  } catch (error) {
    console.error('Error in extraction API:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}