"use client"

import type React from "react"

import { useState, useRef, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Loader2, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { Plus, Mic, MoreVertical, X, Volume2, VolumeX, Play, Hash, DollarSign, Sparkles } from "lucide-react"

// Add type declaration for SpeechRecognition
declare global {
  interface Window {
    SpeechRecognition: any
    webkitSpeechRecognition: any
    speechSynthesis: any
    SpeechSynthesisUtterance: any
  }
  interface SpeechRecognition extends EventTarget {
    continuous: boolean
    interimResults: boolean
    lang: string
    onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => any) | null
    onend: ((this: SpeechRecognition, ev: Event) => any) | null
    onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => any) | null
    start: () => void
    stop: () => void
  }

  interface SpeechRecognitionEvent extends Event {
    results: SpeechRecognitionResultList
    resultIndex: number
  }

  interface SpeechRecognitionResultList {
    [index: number]: SpeechRecognitionResult
    length: number
  }

  interface SpeechRecognitionResult {
    [index: number]: SpeechRecognitionAlternative
    isFinal: boolean
    length: number
  }

  interface SpeechRecognitionAlternative {
    transcript: string
    confidence: number
  }

  interface SpeechRecognitionErrorEvent extends Event {
    error: SpeechRecognitionError
  }

  type SpeechRecognitionError =
    | "no-speech"
    | "aborted"
    | "audio-capture"
    | "network"
    | "not-allowed"
    | "service-unavailable"
    | "bad-grammar"
    | "language-not-supported"
}

// Text-to-speech hook with fallback to browser speech synthesis
function useTextToSpeech() {
  const [isPlaying, setIsPlaying] = useState(false)
  const [isEnabled, setIsEnabled] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [hasError, setHasError] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const currentAudioUrl = useRef<string | null>(null)
  const lastPlayedMessageId = useRef<string | null>(null) // Track last played message

  const playText = async (text: string, messageId?: string, onFinished?: () => void) => {
    if (!isEnabled || !text.trim()) {
      console.log("TTS not enabled or no text")
      return
    }

    // Prevent playing the same message multiple times
    if (messageId && lastPlayedMessageId.current === messageId) {
      console.log("Message already played, skipping:", messageId)
      return
    }

    // Prevent playing if already playing
    if (isPlaying || isLoading) {
      console.log("TTS already playing or loading, skipping")
      return
    }

    console.log("Playing text:", text.substring(0, 50) + "...", "MessageID:", messageId)
    setHasError(false)
    setIsLoading(true)

    // Mark this message as played immediately to prevent race conditions
    if (messageId) {
      lastPlayedMessageId.current = messageId
    }

    try {
      // Stop any currently playing audio
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }

      // Clean up previous audio URL
      if (currentAudioUrl.current) {
        URL.revokeObjectURL(currentAudioUrl.current)
        currentAudioUrl.current = null
      }

      console.log("Calling OpenAI TTS API...")
      const response = await fetch("/api/text-to-speech", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text, voice: "nova" }),
      })

      console.log("TTS API response status:", response.status)
      console.log("TTS API response headers:", Object.fromEntries(response.headers.entries()))

      if (!response.ok) {
        let errorData
        try {
          errorData = await response.json()
        } catch {
          errorData = { error: `HTTP ${response.status}: ${response.statusText}` }
        }
        console.error("TTS API error:", errorData)
        setHasError(true)
        setIsLoading(false)

        // Try browser fallback if API fails
        if (typeof window !== "undefined" && window.speechSynthesis) {
          console.log("Falling back to browser speech synthesis")
          const utterance = new SpeechSynthesisUtterance(text)
          utterance.rate = 0.9
          utterance.pitch = 1
          utterance.volume = 1

          utterance.onstart = () => {
            setIsPlaying(true)
            setIsLoading(false)
          }

          utterance.onend = () => {
            setIsPlaying(false)
            if (onFinished) {
              onFinished()
            }
          }

          utterance.onerror = (e) => {
            console.error("Browser TTS error:", e)
            setIsPlaying(false)
            setHasError(true)
          }

          window.speechSynthesis.speak(utterance)
          return
        }
        return
      }

      const contentType = response.headers.get("content-type")
      console.log("Response content type:", contentType)

      if (contentType && contentType.includes("application/json")) {
        // This means there was an error
        let errorData
        try {
          errorData = await response.json()
        } catch {
          errorData = { error: "Unknown JSON error" }
        }
        console.error("TTS API JSON error:", errorData)
        setHasError(true)
        setIsLoading(false)
        return
      }

      const audioBlob = await response.blob()
      console.log("Audio blob size:", audioBlob.size, "type:", audioBlob.type)

      if (audioBlob.size === 0) {
        console.error("Empty audio blob received")
        setHasError(true)
        setIsLoading(false)
        return
      }

      const audioUrl = URL.createObjectURL(audioBlob)
      currentAudioUrl.current = audioUrl

      const audio = new Audio(audioUrl)
      audioRef.current = audio

      // Add more detailed event listeners
      audio.onloadstart = () => console.log("Audio loading started")
      audio.oncanplay = () => console.log("Audio can play")
      audio.onloadeddata = () => console.log("Audio data loaded")
      audio.onplay = () => {
        console.log("Audio started playing")
        setIsPlaying(true)
        setIsLoading(false)
      }
      audio.onpause = () => {
        console.log("Audio paused")
        setIsPlaying(false)
      }
      audio.onended = () => {
        console.log("Audio ended")
        setIsPlaying(false)
        if (currentAudioUrl.current) {
          URL.revokeObjectURL(currentAudioUrl.current)
          currentAudioUrl.current = null
        }
        if (onFinished) {
          onFinished()
        }
      }
      audio.onerror = (e) => {
        console.error("Audio playback error:", e)
        console.error("Audio error details:", {
          error: audio.error,
          networkState: audio.networkState,
          readyState: audio.readyState,
          src: audio.src,
        })
        setIsPlaying(false)
        setHasError(true)
        setIsLoading(false)
      }

      // Set audio properties for better compatibility
      audio.preload = "auto"
      audio.crossOrigin = "anonymous"

      // Try to play the audio with user interaction check
      try {
        console.log("Attempting to play audio...")
        const playPromise = audio.play()

        if (playPromise !== undefined) {
          await playPromise
          console.log("Audio play() succeeded")
        }
      } catch (playError) {
        console.error("Audio play() failed:", playError)

        // Check if it's an autoplay policy issue
        if (playError.name === "NotAllowedError") {
          console.log("Autoplay blocked - user interaction required")
          setHasError(true)
          setIsLoading(false)

          // Show a user-friendly message or button to enable audio
          alert("Please click the speaker icon to enable audio playback")
        } else {
          setHasError(true)
          setIsLoading(false)
        }
      }
    } catch (error) {
      console.error("Text-to-speech error:", error)
      console.error("Error stack:", error.stack)
      setHasError(true)
      setIsLoading(false)
    }
  }

  const stopAudio = () => {
    console.log("Stopping audio")
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel()
    }
    setIsPlaying(false)
  }

  const toggleEnabled = () => {
    const newState = !isEnabled
    console.log("TTS toggled:", newState ? "enabled" : "disabled")
    setIsEnabled(newState)
    if (isPlaying) {
      stopAudio()
    }
    // Reset the last played message when toggling
    lastPlayedMessageId.current = null
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
      if (currentAudioUrl.current) {
        URL.revokeObjectURL(currentAudioUrl.current)
        currentAudioUrl.current = null
      }
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel()
      }
    }
  }, [])

  return {
    isPlaying,
    isEnabled,
    isLoading,
    hasError,
    playText,
    stopAudio,
    toggleEnabled,
  }
}

// Speech-to-text hook with OpenAI Whisper integration
function useSpeechToText() {
  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState("")
  const [audioLevels, setAudioLevels] = useState<number[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showProcessing, setShowProcessing] = useState(false) // New state for showing processing UI

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const isRecordingRef = useRef(false)
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null)

  const startAudioAnalysis = async () => {
    try {
      if (!streamRef.current) {
        throw new Error("No audio stream available")
      }

      // Create audio context
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext
      audioContextRef.current = new AudioContext()

      // Resume audio context if suspended
      if (audioContextRef.current.state === "suspended") {
        await audioContextRef.current.resume()
      }

      console.log("Audio context state:", audioContextRef.current.state)

      analyserRef.current = audioContextRef.current.createAnalyser()
      const source = audioContextRef.current.createMediaStreamSource(streamRef.current)

      analyserRef.current.fftSize = 256
      analyserRef.current.smoothingTimeConstant = 0.8
      source.connect(analyserRef.current)

      const bufferLength = analyserRef.current.frequencyBinCount
      const dataArray = new Uint8Array(bufferLength)

      console.log("Audio analysis started, buffer length:", bufferLength)

      // Initialize with some default levels to make the waveform visible immediately
      setAudioLevels(Array(20).fill(0.2))

      const updateAudioLevels = () => {
        if (analyserRef.current && isRecordingRef) {
          analyserRef.current.getByteFrequencyData(dataArray)

          // Calculate average level with more emphasis on higher frequencies
          let sum = 0
          const frequencyWeighting = 1.5 // Add more weight to higher frequencies
          for (let i = 0; i < bufferLength; i++) {
            // Apply more weight to higher frequencies (which are more common in speech)
            const weight = 1 + (i / bufferLength) * frequencyWeighting
            sum += dataArray[i] * weight
          }
          const average = sum / (bufferLength * (1 + frequencyWeighting / 2))
          const normalizedLevel = Math.min(Math.max(average / 128, 0.05), 1)

          // Log audio levels periodically to help with debugging
          if (Math.random() < 0.05) {
            // Log roughly 5% of frames
            console.log("Current audio level:", normalizedLevel)
          }

          // Auto-stop after silence
          if (normalizedLevel < 0.15) {
            // Changed from 0.1 to 0.15 (more sensitive)
            console.log("Silence detected, level:", normalizedLevel)
            if (!silenceTimerRef.current) {
              console.log("Starting silence timer")
              silenceTimerRef.current = setTimeout(() => {
                console.log("Auto-stopping due to silence")
                stopListening()
              }, 2500) // Keep at 2.5 seconds
            }
          } else {
            if (silenceTimerRef.current) {
              console.log("Speech detected, clearing silence timer")
              clearTimeout(silenceTimerRef.current)
              silenceTimerRef.current = null
            }
          }

          animationFrameRef.current = requestAnimationFrame(updateAudioLevels)
        }
      }

      updateAudioLevels()
    } catch (error) {
      console.error("Error in audio analysis:", error)
      setError("Audio analysis failed")
      setIsListening(false)
    }
  }

  const stopAudioAnalysis = () => {
    console.log("Stopping audio analysis")

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }

    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }

    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close().catch(console.error)
      audioContextRef.current = null
    }

    analyserRef.current = null
  }

  const processAudioWithWhisper = async (audioBlob: Blob) => {
    try {
      console.log("Processing audio with Whisper, blob size:", audioBlob.size)
      setIsProcessing(true)
      setError(null)

      if (audioBlob.size === 0) {
        console.error("Empty audio blob")
        setError("No audio recorded")
        setIsProcessing(false)
        setShowProcessing(false)
        return
      }

      const formData = new FormData()
      formData.append("audio", audioBlob, "recording.webm")

      console.log("Sending to speech-to-text API...")
      const response = await fetch("/api/speech-to-text", {
        method: "POST",
        body: formData,
      })

      console.log("Speech-to-text API response status:", response.status)

      if (!response.ok) {
        const errorText = await response.text()
        console.error("Speech-to-text API error:", errorText)
        setError("Failed to transcribe audio")
        setIsProcessing(false)
        setShowProcessing(false)
        return
      }

      const result = await response.json()
      console.log("Transcription result:", result)

      if (result.text && result.text.trim()) {
        setTranscript(result.text.trim())
        console.log("Transcript set:", result.text.trim())
      } else {
        console.log("No text in transcription result")
        setError("No speech detected")
      }
    } catch (error) {
      console.error("Error processing audio:", error)
      setError("Processing failed")
    } finally {
      setIsProcessing(false)
      setShowProcessing(false) // Hide processing state when done
    }
  }

  const startListening = async () => {
    try {
      console.log("Starting to listen...")
      setTranscript("")
      setError(null)
      setIsListening(true)
      setAudioLevels(Array(20).fill(0.2)) // Initialize with some visible levels
      audioChunksRef.current = []

      // Check if getUserMedia is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("getUserMedia not supported")
      }

      console.log("Requesting microphone access...")
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })

      console.log("Microphone access granted")
      streamRef.current = stream

      // Start audio analysis for visualization
      await startAudioAnalysis()

      // Check MediaRecorder support
      if (!window.MediaRecorder) {
        throw new Error("MediaRecorder not supported")
      }

      // Find supported MIME type
      const mimeTypes = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus", ""]

      let selectedMimeType = ""
      for (const mimeType of mimeTypes) {
        if (mimeType === "" || MediaRecorder.isTypeSupported(mimeType)) {
          selectedMimeType = mimeType
          break
        }
      }

      console.log("Using MIME type:", selectedMimeType || "default")

      const mediaRecorder = new MediaRecorder(stream, selectedMimeType ? { mimeType: selectedMimeType } : undefined)
      mediaRecorderRef.current = mediaRecorder

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          console.log("Audio data chunk:", event.data.size, "bytes")
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = async () => {
        console.log("MediaRecorder stopped, chunks:", audioChunksRef.current.length)

        if (audioChunksRef.current.length > 0) {
          const audioBlob = new Blob(audioChunksRef.current, {
            type: selectedMimeType || "audio/webm",
          })
          console.log("Created audio blob:", audioBlob.size, "bytes")

          if (audioBlob.size > 0) {
            await processAudioWithWhisper(audioBlob)
          }
        }

        // Clean up stream
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => {
            track.stop()
            console.log("Stopped track:", track.kind)
          })
          streamRef.current = null
        }
      }

      mediaRecorder.onerror = (event) => {
        console.error("MediaRecorder error:", event)
        setError("Recording failed")
        setIsListening(false)
      }

      mediaRecorder.start(250) // Collect data every 250ms
      console.log("MediaRecorder started")
    } catch (error) {
      console.error("Error starting recording:", error)
      setIsListening(false)

      // Show user-friendly error message
      if (error.name === "NotAllowedError") {
        setError("Microphone access denied. Please allow microphone access.")
      } else if (error.name === "NotFoundError") {
        setError("No microphone found. Please connect a microphone.")
      } else if (error.name === "NotSupportedError") {
        setError("Your browser doesn't support audio recording.")
      } else {
        setError("Failed to access microphone. Please check your settings.")
      }
    }
  }

  const stopListening = () => {
    console.log("Stopping listening...")
    setIsListening(false)
    setShowProcessing(true) // Show processing state immediately

    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop()
    }

    stopAudioAnalysis()
  }

  const resetTranscript = () => {
    setTranscript("")
    setError(null)
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop()
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
      }
      stopAudioAnalysis()
    }
  }, [])

  return {
    isListening,
    transcript,
    isProcessing,
    error,
    showProcessing,
    startListening,
    stopListening,
    resetTranscript,
    audioLevels,
  }
}

// Timeline waveform component
function TimelineWaveform({
  audioLevels,
  isActive,
  isProcessing = false,
}: {
  audioLevels: number[]
  isActive: boolean
  isProcessing?: boolean
}) {
  // If we're processing, show a loading animation
  if (isProcessing) {
    return (
      <div className="flex items-center justify-center w-full h-6 px-2">
        <div className="flex items-center space-x-2">
          <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
          <span className="text-sm text-gray-600">Processing speech...</span>
        </div>
      </div>
    )
  }

  // Always show at least some bars
  const displayLevels = audioLevels.length > 0 ? audioLevels : Array(20).fill(0.2)

  return (
    <div className="flex items-center justify-start w-full h-6 px-2">
      {/* Audio level bars */}
      {displayLevels.map((level, i) => {
        const height = Math.max(2, level * 24) // Scale to max 24px height
        const opacity = isActive ? Math.max(0.3, level) : 0.7 // Dynamic opacity based on level

        // Ensure opacity is a valid number
        const validOpacity = isNaN(opacity) ? 0.3 : opacity

        return (
          <div
            key={`bar-${i}`}
            className="bg-gray-800 mx-0.5 rounded-sm transition-all duration-75"
            style={{
              width: "2px",
              height: `${height}px`,
              opacity: validOpacity,
            }}
          />
        )
      })}
    </div>
  )
}

// --- Header Component ---
function Header({
  activeTab,
  setActiveTab,
}: {
  activeTab: "define" | "review" | "send" | "track"
  setActiveTab: (tab: "define" | "review" | "send" | "track") => void
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 px-8">
      <div className="flex-shrink-0">
        <h1 className="font-bold text-[#6366F1] text-base">Intake Agent</h1>
        <p className="text-sm text-gray-500">2.0 Flash</p>
      </div>
      <nav className="flex-grow">
        <div className="flex items-center justify-center gap-1 max-w-none mx-auto whitespace-nowrap">
          <button
            onClick={() => setActiveTab("define")}
            className={`flex py-2 px-4 justify-center items-center rounded-lg font-medium text-sm whitespace-nowrap ${
              activeTab === "define"
                ? "bg-[#E8F0FE] text-[#1565C0]"
                : "text-[#9CA3AF] hover:text-gray-700 hover:bg-gray-50 font-normal"
            }`}
          >
            Define Role
          </button>
          <button
            onClick={() => setActiveTab("review")}
            className={`flex py-2 px-4 justify-center items-center rounded-lg font-medium text-sm whitespace-nowrap ${
              activeTab === "review"
                ? "bg-[#E8F0FE] text-[#1565C0]"
                : "text-[#9CA3AF] hover:text-gray-700 hover:bg-gray-50 font-normal"
            }`}
          >
            Review Matches
          </button>
          <button
            onClick={() => setActiveTab("send")}
            className={`flex py-2 px-4 justify-center items-center rounded-lg font-medium text-sm whitespace-nowrap ${
              activeTab === "send"
                ? "bg-[#E8F0FE] text-[#1565C0]"
                : "text-[#9CA3AF] hover:text-gray-700 hover:bg-gray-50 font-normal"
            }`}
          >
            Send Outreach
          </button>
          <button
            onClick={() => setActiveTab("track")}
            className={`flex py-2 px-4 justify-center items-center rounded-lg font-medium text-sm whitespace-nowrap ${
              activeTab === "track"
                ? "bg-[#E8F0FE] text-[#1565C0]"
                : "text-[#9CA3AF] hover:text-gray-700 hover:bg-gray-50 font-normal"
            }`}
          >
            Track Outreach
          </button>
        </div>
      </nav>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon">
          <MoreVertical className="w-5 h-5" />
        </Button>
      </div>
    </header>
  )
}

// --- Chat Interface Component ---
function ChatInterface({
  messages,
  input,
  handleInputChange,
  handleSubmit,
  isLoading,
  error,
  onChatStart,
  setActiveTab,
  tts,
}: {
  messages: any[]
  input: string
  handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
  handleSubmit: (e: React.FormEvent<HTMLFormElement>) => void
  isLoading: boolean
  error: Error | undefined
  onChatStart: () => void
  setActiveTab: (tab: "define" | "review" | "send" | "track") => void
  tts: ReturnType<typeof useTextToSpeech>
}) {
  const [showCandidatesToolbar, setShowCandidatesToolbar] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const {
    isListening,
    transcript,
    startListening,
    stopListening,
    resetTranscript,
    audioLevels,
    isProcessing,
    error: sttError,
    showProcessing,
  } = useSpeechToText()

  // Update the useEffect in ChatInterface that handles the transcript
  useEffect(() => {
    if (transcript && transcript.trim()) {
      console.log("Received transcript:", transcript)

      // Update the input with the transcript
      handleInputChange({
        target: {
          value: input ? input + " " + transcript : transcript,
        },
      } as React.ChangeEvent<HTMLTextAreaElement>)

      // Reset the transcript
      resetTranscript()

      // Auto-submit after a short delay
      setTimeout(() => {
        console.log("Auto-submitting form with transcript")
        const form = document.querySelector("form")
        if (form) {
          form.requestSubmit()
        }
      }, 300)
    }
  }, [transcript, input, handleInputChange, resetTranscript])

  const handleMicClick = () => {
    if (isListening) {
      stopListening()
    } else {
      startListening()
    }
  }

  const handleCancelRecording = () => {
    stopListening()
    handleInputChange({ target: { value: "" } } as React.ChangeEvent<HTMLTextAreaElement>)
  }

  const handleConfirmRecording = () => {
    stopListening()
    if (input.trim()) {
      setTimeout(() => {
        const form = document.querySelector("form")
        if (form) {
          form.requestSubmit()
        }
      }, 100)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      if (input.trim() && !isLoading) {
        const form = e.currentTarget.closest("form")
        if (form) {
          form.requestSubmit()
        }
      }
    }
  }

  // Check if we should show the candidates toolbar
  useEffect(() => {
    const userMessageCount = messages.filter((msg) => msg.role === "user").length
    setShowCandidatesToolbar(userMessageCount >= 4)
  }, [messages])

  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // Auto-focus input on mount and after messages
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus()
    }
  }, [messages, isLoading])

  const handleNotNow = () => {
    setShowCandidatesToolbar(false)
  }

  const handleSeeCandidates = () => {
    // Navigate to Review Matches tab
    setActiveTab("review")
    setShowCandidatesToolbar(false)
  }

  // Check if this is the initial state (no user messages yet)
  const userMessages = messages.filter((msg) => msg.role === "user")
  const isInitialState = userMessages.length === 0

  useEffect(() => {
    if (!isInitialState) {
      onChatStart()
    }
  }, [isInitialState, onChatStart])

  // Add this useEffect in the ChatInterface component
  useEffect(() => {
    const handleAutoStartMicrophone = () => {
      if (!isListening && tts.isEnabled) {
        startListening()
      }
    }

    window.addEventListener("autoStartMicrophone", handleAutoStartMicrophone)

    return () => {
      window.removeEventListener("autoStartMicrophone", handleAutoStartMicrophone)
    }
  }, [isListening, tts.isEnabled, startListening])

  return (
    <div className="flex flex-col justify-center items-center flex-1 self-stretch rounded-xl border border-[#EAECF0] bg-white h-full pb-0 transition-all duration-700 ease-in-out">
      {isInitialState ? (
        // Initial centered state
        <div className="flex flex-col items-center justify-center h-full p-6 space-y-8 w-full animate-in fade-in duration-500">
          <h1 className="text-4xl font-bold text-[#101828] text-center transform transition-all duration-700 ease-in-out">Who are we hiring today?</h1>

          <div className="w-full max-w-[800px] mx-auto transform transition-all duration-700 ease-in-out">
            <form onSubmit={handleSubmit} className="relative">
              <div
                className="flex w-full p-4 flex-col justify-center items-start gap-3 rounded-2xl border border-[#DCDFEA] bg-white transform transition-all duration-500 ease-in-out"
                style={{
                  boxShadow: "0px 4px 16px -4px rgba(16, 24, 40, 0.08), 0px 4px 6px -2px rgba(16, 24, 40, 0.03)",
                }}
              >
                <div className="w-full">
                  {isListening || showProcessing ? (
                    <TimelineWaveform audioLevels={audioLevels} isActive={isListening} isProcessing={showProcessing} />
                  ) : (
                    <textarea
                      ref={inputRef}
                      value={input}
                      onChange={handleInputChange}
                      onKeyDown={handleKeyDown}
                      placeholder="Ask about hiring for..."
                      disabled={isLoading}
                      rows={1}
                      className="w-full bg-transparent border-none outline-none text-gray-900 placeholder-gray-500 text-base disabled:opacity-50 resize-none overflow-hidden"
                      style={{
                        minHeight: "24px",
                      }}
                    />
                  )}
                </div>
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-3">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="flex-shrink-0 h-8 w-8 rounded-full hover:bg-gray-100 border border-[#EAECF0]"
                    >
                      <Plus className="w-5 h-5 text-gray-600" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="flex-shrink-0 h-8 w-8 rounded-full hover:bg-gray-100 border border-[#EAECF0]"
                    >
                      <svg
                        className="w-5 h-5 text-gray-600"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="m5 12 7-7 7 7"></path>
                        <path d="m12 19 0-14"></path>
                      </svg>
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={tts.toggleEnabled}
                      className={`flex-shrink-0 h-8 w-8 rounded-full border border-[#EAECF0] ${
                        tts.isEnabled
                          ? "bg-blue-100 text-blue-600 hover:bg-blue-200"
                          : "hover:bg-gray-100 text-gray-600"
                      }`}
                      title={tts.isEnabled ? "Disable text-to-speech" : "Enable text-to-speech"}
                    >
                      {tts.isEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
                    </Button>
                  </div>
                  <div className="flex items-center gap-3">
                    {isListening ? (
                      <>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={handleCancelRecording}
                          className="flex-shrink-0 h-8 w-8 rounded-full hover:bg-gray-100 border border-[#EAECF0]"
                        >
                          <X className="w-5 h-5 text-gray-600" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          onClick={handleConfirmRecording}
                          className="rounded-full flex-shrink-0 bg-blue-500 hover:bg-blue-600 h-8 w-8"
                          disabled={isProcessing}
                        >
                          {isProcessing ? (
                            <Loader2 className="w-4 h-4 animate-spin text-white" />
                          ) : (
                            <Check className="w-5 h-5 text-white" />
                          )}
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={handleMicClick}
                          className="flex-shrink-0 h-8 w-8 rounded-full hover:bg-gray-100 border border-[#EAECF0]"
                        >
                          <Mic className="w-5 h-5 text-gray-600" />
                        </Button>
                        <Button
                          type="submit"
                          size="icon"
                          disabled={isLoading || !input.trim()}
                          className="rounded-full flex-shrink-0 bg-blue-500 hover:bg-blue-600 h-8 w-8 disabled:opacity-50"
                        >
                          <svg
                            className="w-5 h-5 text-white"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="m5 12 7-7 7 7"></path>
                            <path d="m12 19 0-14"></path>
                          </svg>
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </form>
          </div>

          <div className="flex flex-wrap gap-3 justify-center animate-in slide-in-from-bottom duration-700 delay-200">
            <Button
              variant="outline"
              className="px-4 text-sm text-gray-700 border border-gray-300 rounded-full hover:bg-gray-50 bg-transparent font-normal py-2 leading-7 transform transition-all duration-200 hover:scale-105"
              onClick={() => {
                handleInputChange({ target: { value: "Software Engineer" } } as any)
              }}
            >
              Software Engineer
            </Button>
            <Button
              variant="outline"
              className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-full hover:bg-gray-50 bg-transparent font-normal transform transition-all duration-200 hover:scale-105"
              onClick={() => {
                handleInputChange({ target: { value: "Front-Desk Assistant" } } as any)
              }}
            >
              Front-Desk Assistant
            </Button>
            <Button
              variant="outline"
              className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-full hover:bg-gray-50 bg-transparent font-normal transform transition-all duration-200 hover:scale-105"
              onClick={() => {
                handleInputChange({ target: { value: "Medical Nurse" } } as any)
              }}
            >
              Medical Nurse
            </Button>
          </div>
        </div>
      ) : (
        // Normal chat interface
        <>
          <div className="flex-grow p-6 overflow-y-auto space-y-6 px-5 py-5 w-full max-w-[800px] mx-auto animate-in fade-in slide-in-from-top duration-700">
            {messages.map((message: any) => (
              <div key={message.id} className={cn("flex", message.role === "user" && "justify-end")}>
                {message.role === "assistant" ? (
                  <div className="max-w-lg flex items-start gap-3">
                    <div className="flex-1">
                      <p className="text-[#101828] text-base leading-[22px]">{message.content}</p>
                    </div>
                    {tts.isEnabled && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => tts.playText(message.content, message.id)}
                          className="h-6 w-6 text-gray-400 hover:text-blue-600 flex-shrink-0"
                          title="Play audio"
                        >
                          <Play className="w-3 h-3" />
                        </Button>
                        {/* Add test button for debugging */}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => tts.playText("This is a test message")}
                          className="h-6 w-6 text-gray-400 hover:text-green-600 flex-shrink-0"
                          title="Test TTS"
                        >
                          <Volume2 className="w-3 h-3" />
                        </Button>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="flex p-2.5 px-4 items-start gap-2.5 bg-[#F3F5F8] max-w-lg rounded-2xl">
                    <p className="text-[#101828] text-base leading-[22px]">{message.content}</p>
                  </div>
                )}
              </div>
            ))}
            {isLoading && messages[messages.length - 1]?.role === "user" && (
              <div className="flex">
                <div className="max-w-lg flex items-center space-x-2">
                  <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
                  <p className="text-gray-400 text-base leading-[22px]">Thinking...</p>
                </div>
              </div>
            )}
            {error && (
              <div className="flex">
                <div className="max-w-lg p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-red-800 text-sm">Error: {error.message}</p>
                </div>
              </div>
            )}
            {sttError && (
              <div className="flex">
                <div className="max-w-lg p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-red-800 text-sm">Speech-to-Text Error: {sttError}</p>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Candidates Toolbar */}
          {showCandidatesToolbar && (
            <div className="w-full flex justify-center px-4 pb-2">
              <div className="w-[800px]">
                <div className="flex items-center justify-between px-4 py-3 bg-white border border-[#E5E7EB] rounded-xl shadow-sm">
                  <span className="text-[#374151] text-sm font-medium">Ready to view candidates?</span>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleNotNow}
                      className="px-4 py-2 text-sm text-[#374151] font-medium border border-[#D1D5DB] rounded-lg hover:bg-[#F9FAFB] transition-colors"
                    >
                      Not Now
                    </button>
                    <button
                      onClick={handleSeeCandidates}
                      className="px-4 py-2 bg-[#1F2937] text-white text-sm font-medium rounded-lg hover:bg-[#111827] transition-colors"
                    >
                      Review Matches
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="p-4 bg-white">
            <div className="w-full flex justify-center">
              <form onSubmit={handleSubmit} className="relative w-[800px]">
                <div
                  className="flex w-full p-3 flex-col justify-center items-start gap-3 rounded-2xl border border-[#DCDFEA] bg-white transform transition-all duration-500 ease-in-out animate-in slide-in-from-bottom"
                  style={{
                    boxShadow: "0px 4px 16px -4px rgba(16, 24, 40, 0.08), 0px 4px 6px -2px rgba(16, 24, 40, 0.03)",
                  }}
                >
                  <div className="w-full">
                    {isListening || showProcessing ? (
                      <TimelineWaveform
                        audioLevels={audioLevels}
                        isActive={isListening}
                        isProcessing={showProcessing}
                      />
                    ) : (
                      <textarea
                        ref={inputRef}
                        value={input}
                        onChange={handleInputChange}
                        onKeyDown={handleKeyDown}
                        placeholder="Type your message..."
                        disabled={isLoading}
                        rows={1}
                        className="w-full bg-transparent border-none outline-none text-gray-900 placeholder-gray-500 text-base disabled:opacity-50 resize-none overflow-hidden"
                        style={{
                          minHeight: "24px",
                        }}
                      />
                    )}
                  </div>
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-3">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="flex-shrink-0 h-8 w-8 rounded-full hover:bg-gray-100 border border-[#EAECF0]"
                      >
                        <Plus className="w-5 h-5 text-gray-600" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="flex-shrink-0 h-8 w-8 rounded-full hover:bg-gray-100 border border-[#EAECF0]"
                      >
                        <svg
                          className="w-5 h-5 text-gray-600"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="m5 12 7-7 7 7"></path>
                          <path d="m12 19 0-14"></path>
                        </svg>
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={tts.toggleEnabled}
                        className={`flex-shrink-0 h-8 w-8 rounded-full border border-[#EAECF0] ${
                          tts.isEnabled
                            ? "bg-blue-100 text-blue-600 hover:bg-blue-200"
                            : "hover:bg-gray-100 text-gray-600"
                        }`}
                        title={tts.isEnabled ? "Disable text-to-speech" : "Enable text-to-speech"}
                      >
                        {tts.isEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
                      </Button>
                    </div>
                    <div className="flex items-center gap-3">
                      {isListening ? (
                        <>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={handleCancelRecording}
                            className="flex-shrink-0 h-8 w-8 rounded-full hover:bg-gray-100 border border-[#EAECF0]"
                          >
                            <X className="w-5 h-5 text-gray-600" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            onClick={handleConfirmRecording}
                            className="rounded-full flex-shrink-0 bg-blue-500 hover:bg-blue-600 h-8 w-8"
                            disabled={isProcessing}
                          >
                            {isProcessing ? (
                              <Loader2 className="w-4 h-4 animate-spin text-white" />
                            ) : (
                              <Check className="w-5 h-5 text-white" />
                            )}
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={handleMicClick}
                            className="flex-shrink-0 h-8 w-8 rounded-full hover:bg-gray-100 border border-[#EAECF0]"
                          >
                            <Mic className="w-5 h-5 text-gray-600" />
                          </Button>
                          <Button
                            type="submit"
                            size="icon"
                            disabled={isLoading || !input.trim()}
                            className="rounded-full flex-shrink-0 bg-blue-500 hover:bg-blue-600 h-8 w-8 disabled:opacity-50"
                          >
                            <svg
                              className="w-5 h-5 text-white"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <path d="m5 12 7-7 7 7"></path>
                              <path d="m12 19 0-14"></path>
                            </svg>
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// Add the rest of the missing components and functions at the end of the file:

// Function to extract and normalize requirements from conversation using ChatGPT
async function extractAndNormalizeRequirements(
  messages: any[],
  onRequirementsChange: (reqs: Requirements) => void,
  existingRequirements: Requirements = {},
) {
  // Only consider user messages for extraction
  const userMessages = messages.filter((msg) => msg.role === "user")

  if (userMessages.length === 0) {
    onRequirementsChange({})
    return
  }

  const userMessageTexts = userMessages.map((msg) => msg.content)

  console.log("Starting extraction for user messages:", userMessageTexts)

  try {
    // Step 1: Extract requirements using ChatGPT
    const extractResponse = await fetch("/api/extract-requirements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userMessages: userMessageTexts, existingRequirements }),
    })

    console.log("Extract response status:", extractResponse.status)

    if (!extractResponse.ok) {
      const errorText = await extractResponse.text()
      console.error("Extract API error:", errorText)
      onRequirementsChange({})
      return
    }

    const extractData = await extractResponse.json()
    console.log("Extract response data:", extractData)

    const extractedRequirements = extractData.extractedRequirements || {}

    // Step 2: Normalize the extracted requirements (only if we have some data)
    const hasData = Object.values(extractedRequirements).some(
      (value) =>
        value !== null &&
        value !== undefined &&
        (Array.isArray(value) ? value.length > 0 : typeof value === "string" && value.length > 0),
    )

    if (hasData) {
      try {
        const normalizeResponse = await fetch("/api/normalize-requirements", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rawRequirements: extractedRequirements }),
        })

        if (normalizeResponse.ok) {
          const normalizeData = await normalizeResponse.json()
          const normalizedRequirements = normalizeData.normalizedRequirements || extractedRequirements
          console.log("Final normalized requirements:", normalizedRequirements)
          onRequirementsChange(normalizedRequirements)
        } else {
          console.error("Failed to normalize requirements, using extracted requirements")
          onRequirementsChange(extractedRequirements)
        }
      } catch (normalizeError) {
        console.error("Error normalizing requirements:", normalizeError)
        onRequirementsChange(extractedRequirements)
      }
    } else {
      console.log("No meaningful data extracted, setting empty requirements")
      onRequirementsChange({})
    }
  } catch (error) {
    console.error("Error in extractAndNormalizeRequirements:", error)
    onRequirementsChange({})
  }
}

// Add the rest of the missing imports and components
import { useChat } from "ai/react"
import type { Requirements } from "@/lib/schemas"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

// Add the rest of the component functions and the main export

function RequirementsCard({ requirements }: { requirements: Requirements }) {
  console.log("🎯 RequirementsCard received:", requirements)
  
  const hasRequirements = Object.values(requirements).some(value => 
    value !== null && value !== undefined && 
    (Array.isArray(value) ? value.length > 0 : typeof value === 'string' && value.length > 0)
  )

  console.log("🎯 HasRequirements:", hasRequirements)

  const role = requirements.role || "Software Engineer"
  const location = requirements.location || "San Francisco, CA, USA"
  
  console.log("🎯 Displaying role:", role, "location:", location)

  return (
    <Card className="w-full bg-white shadow-sm">
      <CardHeader className="pb-4">
        <div className="space-y-2">
          <h3 className="text-xl font-semibold text-gray-900">{role}</h3>
          <p className="text-sm text-gray-600">in {location}</p>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {hasRequirements ? (
          <>
            {/* Requirements Section */}
            <div>
              <h4 className="font-medium text-sm text-gray-700 mb-3">Requirements</h4>
              <div className="flex flex-wrap gap-2">
                {requirements.skills && requirements.skills.length > 0 && 
                  requirements.skills.map((skill, index) => (
                    <Badge key={`skill-${index}`} variant="secondary" className="bg-blue-50 text-blue-700 border-blue-200">
                      {skill}
                    </Badge>
                  ))
                }
                {requirements.experience && requirements.experience.length > 0 && 
                  requirements.experience.map((exp, index) => (
                    <Badge key={`exp-${index}`} variant="secondary" className="bg-green-50 text-green-700 border-green-200">
                      {exp}
                    </Badge>
                  ))
                }
                {requirements.industry && requirements.industry.length > 0 && 
                  requirements.industry.map((ind, index) => (
                    <Badge key={`ind-${index}`} variant="secondary" className="bg-purple-50 text-purple-700 border-purple-200">
                      {ind}
                    </Badge>
                  ))
                }
                {requirements.companies && requirements.companies.length > 0 && 
                  requirements.companies.map((company, index) => (
                    <Badge key={`company-${index}`} variant="secondary" className="bg-orange-50 text-orange-700 border-orange-200">
                      {company}
                    </Badge>
                  ))
                }
                {/* Show default badges if no specific requirements yet */}
                {!requirements.skills?.length && !requirements.experience?.length && !requirements.industry?.length && !requirements.companies?.length && (
                  <>
                    <Badge variant="secondary" className="bg-gray-50 text-gray-600 border-gray-200">React.JS</Badge>
                    <Badge variant="secondary" className="bg-gray-50 text-gray-600 border-gray-200">4+ years</Badge>
                    <Badge variant="secondary" className="bg-gray-50 text-gray-600 border-gray-200">SaaS</Badge>
                  </>
                )}
              </div>
            </div>

            {/* Qualities Section */}
            {requirements.qualities && requirements.qualities.length > 0 && (
              <div>
                <h4 className="font-medium text-sm text-gray-700 mb-3">Qualities</h4>
                <div className="space-y-2">
                  {requirements.qualities.map((quality, index) => (
                    <div key={`quality-${index}`} className="flex items-start gap-2">
                      <div className="w-1.5 h-1.5 bg-gray-400 rounded-full mt-2 flex-shrink-0"></div>
                      <p className="text-sm text-gray-600 leading-relaxed">{quality}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="space-y-4">
            {/* Default Requirements Section */}
            <div>
              <h4 className="font-medium text-sm text-gray-700 mb-3">Requirements</h4>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary" className="bg-gray-50 text-gray-600 border-gray-200">React.JS</Badge>
                <Badge variant="secondary" className="bg-gray-50 text-gray-600 border-gray-200">4+ years</Badge>
                <Badge variant="secondary" className="bg-gray-50 text-gray-600 border-gray-200">SaaS</Badge>
              </div>
            </div>
            
            {/* Default Qualities Section */}
            <div>
              <h4 className="font-medium text-sm text-gray-700 mb-3">Qualities</h4>
              <div className="space-y-2">
                <div className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 bg-gray-400 rounded-full mt-2 flex-shrink-0"></div>
                  <p className="text-sm text-gray-400 leading-relaxed">Share details about the role to see extracted qualities here</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}


// Main Page Component
export default function Page() {
  const [activeTab, setActiveTab] = useState<"define" | "review" | "send" | "track">("define")
  const [requirements, setRequirements] = useState<Requirements>({})

  const tts = useTextToSpeech()

  const { messages, input, handleInputChange, handleSubmit, isLoading, error, setMessages } = useChat({
    api: "/api/chat",
    initialInput: "",
    onResponse: () => {
      console.log("Response received from /api/chat")
    },
    onFinish: (message) => {
      console.log("Chat finished with message:", message)
    },
    onError: (err) => {
      console.error("Chat error:", err)
    },
  })

  const onRequirementsChange = useCallback((newRequirements: Requirements) => {
    console.log("🔄 Requirements changed:", newRequirements)
    console.log("🔄 Current requirements state:", requirements)
    setRequirements(newRequirements)
  }, [])

  // Extract and normalize requirements whenever messages change
  useEffect(() => {
    const userMessages = messages.filter(m => m.role === "user")
    console.log("📨 Messages changed, extracting requirements. Messages count:", messages.length)
    console.log("📨 User messages:", userMessages.map(m => m.content))
    
    if (userMessages.length === 0) {
      console.log("📨 No user messages, skipping extraction")
      return
    }
    
    // Debounce the extraction to avoid too many API calls
    const timeoutId = setTimeout(() => {
      console.log("📨 Triggering requirements extraction...")
      extractAndNormalizeRequirements(messages, onRequirementsChange, requirements)
    }, 1000) // 1 second debounce
    
    return () => clearTimeout(timeoutId)
  }, [messages, onRequirementsChange])

  const handleChatStart = () => {
    // Dispatch a custom event to trigger auto-start of microphone
    window.dispatchEvent(new Event("autoStartMicrophone"))
  }

  // Debug function to test requirements update
  const testRequirementsUpdate = () => {
    console.log("🧪 Testing requirements update...")
    setRequirements({
      role: "Senior React Developer",
      location: "Remote",
      skills: ["React", "TypeScript", "Node.js"],
      experience: ["5+ years", "Senior level"],
      industry: ["Tech", "SaaS"],
      companies: ["Startup", "Google"],
      qualities: ["Strong problem-solving skills", "Excellent communication", "Team leadership experience"]
    })
  }

  const hasUserMessages = messages.filter((msg) => msg.role === "user").length > 0

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {hasUserMessages && (
        <div className="animate-in slide-in-from-top duration-700">
          <Header activeTab={activeTab} setActiveTab={setActiveTab} />
        </div>
      )}

      <main className={`flex flex-col flex-grow space-y-4 ${hasUserMessages ? 'p-6' : 'p-0'}`}>
        {hasUserMessages && (
          <div className="flex items-center justify-between animate-in fade-in slide-in-from-top duration-700 delay-200 px-6">
            <h2 className="text-2xl font-bold">Define Role</h2>
            <Button onClick={testRequirementsUpdate} variant="outline" size="sm">
              🧪 Test Update
            </Button>
          </div>
        )}

        <div className={`flex flex-col md:flex-row gap-4 ${hasUserMessages ? 'px-6' : ''} ${!hasUserMessages ? 'flex-grow' : ''}`}>
          <div className="flex-1">
            <ChatInterface
              messages={messages.map((message) => ({
                ...message,
                content: message.content,
              }))}
              input={input}
              handleInputChange={handleInputChange}
              handleSubmit={handleSubmit}
              isLoading={isLoading}
              error={error}
              onChatStart={handleChatStart}
              setActiveTab={setActiveTab}
              tts={tts}
            />
          </div>
          {/* Only show the requirements card after the first user message */}
          {messages.filter((msg) => msg.role === "user").length > 0 && (
            <div className="w-full md:w-96 animate-in slide-in-from-right duration-700 delay-300">
              <RequirementsCard requirements={requirements} />
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
