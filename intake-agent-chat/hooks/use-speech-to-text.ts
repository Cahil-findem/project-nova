"use client"

import { useState, useRef, useEffect } from "react"

// Speech-to-text hook with OpenAI Whisper integration
export function useSpeechToText() {
  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState("")
  const [audioLevels, setAudioLevels] = useState<number[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showProcessing, setShowProcessing] = useState(false)

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
        if (analyserRef.current && isRecordingRef.current) {
          analyserRef.current.getByteFrequencyData(dataArray)

          // Calculate average level with more emphasis on higher frequencies
          let sum = 0
          const frequencyWeighting = 1.5
          for (let i = 0; i < bufferLength; i++) {
            const weight = 1 + (i / bufferLength) * frequencyWeighting
            sum += dataArray[i] * weight
          }
          const average = sum / (bufferLength * (1 + frequencyWeighting / 2))
          const normalizedLevel = Math.min(Math.max(average / 128, 0.05), 1)

          // Create waveform data
          const waveformData = Array(20)
            .fill(0)
            .map(() => Math.random() * normalizedLevel)
          setAudioLevels(waveformData)

          // Auto-stop after silence
          if (normalizedLevel < 0.15) {
            if (!silenceTimerRef.current) {
              silenceTimerRef.current = setTimeout(() => {
                stopListening()
              }, 2500)
            }
          } else {
            if (silenceTimerRef.current) {
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
      setShowProcessing(false)
    }
  }

  const startListening = async () => {
    try {
      console.log("Starting to listen...")
      setTranscript("")
      setError(null)
      setIsListening(true)
      setAudioLevels(Array(20).fill(0.2))
      audioChunksRef.current = []
      isRecordingRef.current = true

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

      await startAudioAnalysis()

      if (!window.MediaRecorder) {
        throw new Error("MediaRecorder not supported")
      }

      const mimeTypes = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus", ""]

      let selectedMimeType = ""
      for (const mimeType of mimeTypes) {
        if (mimeType === "" || MediaRecorder.isTypeSupported(mimeType)) {
          selectedMimeType = mimeType
          break
        }
      }

      const mediaRecorder = new MediaRecorder(stream, selectedMimeType ? { mimeType: selectedMimeType } : undefined)
      mediaRecorderRef.current = mediaRecorder

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = async () => {
        if (audioChunksRef.current.length > 0) {
          const audioBlob = new Blob(audioChunksRef.current, {
            type: selectedMimeType || "audio/webm",
          })

          if (audioBlob.size > 0) {
            await processAudioWithWhisper(audioBlob)
          }
        }

        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => {
            track.stop()
          })
          streamRef.current = null
        }
      }

      mediaRecorder.onerror = (event) => {
        console.error("MediaRecorder error:", event)
        setError("Recording failed")
        setIsListening(false)
      }

      mediaRecorder.start(250)
      console.log("MediaRecorder started")
    } catch (error) {
      console.error("Error starting recording:", error)
      setIsListening(false)
      isRecordingRef.current = false

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
    setShowProcessing(true)
    isRecordingRef.current = false

    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop()
    }

    stopAudioAnalysis()
  }

  const resetTranscript = () => {
    setTranscript("")
    setError(null)
  }

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
