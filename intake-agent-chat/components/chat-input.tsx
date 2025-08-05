"use client"

import type React from "react"

import { useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Loader2, Check, Plus, Mic, X, Volume2, VolumeX } from "lucide-react"

interface ChatInputProps {
  input: string
  handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
  handleSubmit: (e: React.FormEvent<HTMLFormElement>) => void
  isLoading: boolean
  isListening: boolean
  showProcessing: boolean
  audioLevels: number[]
  onMicClick: () => void
  onCancelRecording: () => void
  onConfirmRecording: () => void
  isProcessing: boolean
  ttsEnabled: boolean
  onToggleTTS: () => void
  isInitialState?: boolean
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

export default function ChatInput({
  input,
  handleInputChange,
  handleSubmit,
  isLoading,
  isListening,
  showProcessing,
  audioLevels,
  onMicClick,
  onCancelRecording,
  onConfirmRecording,
  isProcessing,
  ttsEnabled,
  onToggleTTS,
  isInitialState = false,
}: ChatInputProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null)

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

  // Auto-focus input on mount
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus()
    }
  }, [])

  const inputContainerClass = isInitialState ? "w-full max-w-[800px] mx-auto" : "w-full flex justify-center"

  const formClass = isInitialState ? "relative" : "relative w-[800px]"

  const inputBoxPadding = isInitialState ? "p-4" : "p-3"

  return (
    <div className={inputContainerClass}>
      <form onSubmit={handleSubmit} className={formClass}>
        <div
          className={`flex w-full ${inputBoxPadding} flex-col justify-center items-start gap-3 rounded-2xl border border-[#DCDFEA] bg-white`}
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
                placeholder={isInitialState ? "Ask about hiring for..." : "Type your message..."}
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
            {/* Left side buttons */}
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
                onClick={onToggleTTS}
                className={`flex-shrink-0 h-8 w-8 rounded-full border border-[#EAECF0] ${
                  ttsEnabled ? "bg-blue-100 text-blue-600 hover:bg-blue-200" : "hover:bg-gray-100 text-gray-600"
                }`}
                title={ttsEnabled ? "Disable text-to-speech" : "Enable text-to-speech"}
              >
                {ttsEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
              </Button>
            </div>

            {/* Right side buttons */}
            <div className="flex items-center gap-3">
              {isListening ? (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={onCancelRecording}
                    className="flex-shrink-0 h-8 w-8 rounded-full hover:bg-gray-100 border border-[#EAECF0]"
                  >
                    <X className="w-5 h-5 text-gray-600" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    onClick={onConfirmRecording}
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
                    onClick={onMicClick}
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
  )
}
