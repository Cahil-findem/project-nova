import React, { useState, useCallback, useRef } from 'react'
import OpenAI from 'openai'
import './App.css'

interface Message {
  id: string
  type: 'user' | 'ai'
  content: string
  timestamp: number
}

const openai = import.meta.env.VITE_OPENAI_API_KEY ? new OpenAI({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true
}) : null

function App() {
  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [summaryWidth, setSummaryWidth] = useState(408)
  const [isResizing, setIsResizing] = useState(false)
  const [showStartScreen, setShowStartScreen] = useState(true)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const summaryRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const startChat = useCallback(async () => {
    if (!message.trim() || isLoading) return

    // Start transition
    setIsTransitioning(true)
    
    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: message.trim(),
      timestamp: Date.now()
    }

    // Add user message as the first message
    setMessages([userMessage])
    
    const currentMessage = message.trim()
    setMessage('')
    setIsLoading(true)

    // Transition to chat view after a short delay
    setTimeout(() => {
      setShowStartScreen(false)
      setIsTransitioning(false)
    }, 800)

    // Continue with API call
    await processMessage(currentMessage, [userMessage])
  }, [message, isLoading])

  const processMessage = useCallback(async (messageContent: string, currentMessages: Message[]) => {
    if (!openai) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'ai',
        content: 'OpenAI API key is not configured. Please set VITE_OPENAI_API_KEY environment variable.',
        timestamp: Date.now()
      }
      setMessages(prev => [...prev, errorMessage])
      setIsLoading(false)
      return
    }

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are Jacky, a helpful AI assistant for hiring managers. You help them define job roles, requirements, and find the right candidates. Be conversational, friendly, and professional. Keep responses concise but helpful.'
          },
          ...currentMessages.map(msg => ({
            role: msg.type === 'user' ? 'user' as const : 'assistant' as const,
            content: msg.content.replace(/<br\s*\/?>/gi, '\n')
          })),
          {
            role: 'user',
            content: messageContent
          }
        ],
        max_tokens: 500,
        temperature: 0.7
      })

      const aiResponse = response.choices[0]?.message?.content || 'Sorry, I couldn\'t process that request.'
      
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'ai',
        content: aiResponse.replace(/\n/g, '<br />'),
        timestamp: Date.now()
      }

      setMessages(prev => [...prev, aiMessage])
    } catch (error) {
      console.error('Error calling OpenAI:', error)
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'ai',
        content: 'Sorry, I encountered an error. Please try again.',
        timestamp: Date.now()
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }, [])

  const sendMessage = useCallback(async () => {
    if (!message.trim() || isLoading) return

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: message.trim(),
      timestamp: Date.now()
    }

    setMessages(prev => [...prev, userMessage])
    const currentMessage = message.trim()
    setMessage('')
    setIsLoading(true)

    await processMessage(currentMessage, messages)
  }, [message, messages, isLoading])

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    if (showStartScreen) {
      startChat()
    } else {
      sendMessage()
    }
  }, [showStartScreen, startChat, sendMessage])

  const handleKeyPress = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (showStartScreen) {
        startChat()
      } else {
        sendMessage()
      }
    }
  }, [showStartScreen, startChat, sendMessage])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsResizing(true)
    e.preventDefault()
  }, [])

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing) return
    
    const containerRect = document.querySelector('.body-content')?.getBoundingClientRect()
    if (!containerRect) return
    
    const newWidth = containerRect.right - e.clientX - 20 // Account for margin
    const minWidth = 300
    const maxWidth = 600
    
    if (newWidth >= minWidth && newWidth <= maxWidth) {
      setSummaryWidth(newWidth)
    }
  }, [isResizing])

  const handleMouseUp = useCallback(() => {
    setIsResizing(false)
  }, [])

  // Add event listeners
  React.useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [isResizing, handleMouseMove, handleMouseUp])

  // Auto-focus input on mount and after transitions
  React.useEffect(() => {
    if (inputRef.current && !isLoading && !isTransitioning) {
      inputRef.current.focus()
    }
  }, [showStartScreen, isLoading, isTransitioning, messages])

  if (showStartScreen) {
    return (
      <div className={`app start-screen ${isTransitioning ? 'transitioning' : ''}`}>
        {/* Left Sidebar */}
        <div className="sidebar">
          <div className="sidebar-icon">
            <span className="material-icons">menu</span>
          </div>
          <div className="sidebar-icon">
            <span className="material-icons">search</span>
          </div>
          <div className="sidebar-icon">
            <span className="material-icons">folder</span>
          </div>
          <div className="sidebar-icon">
            <span className="material-icons">assignment</span>
          </div>
        </div>

        {/* Start Screen Content */}
        <div className="start-screen-content">
          <div className="start-screen-header">
            <h1 className="start-screen-title">Who are we hiring today?</h1>
          </div>

          {/* Existing AI Input Component - positioned for start screen */}
          <div className="input-area start-screen-positioned">
            <form onSubmit={handleSubmit} className="ai-input-card">
              <div className="ai-input-content">
                <div className="input-row">
                  <input
                    ref={inputRef}
                    type="text"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="Describe the role you're looking to fill..."
                    className="ai-input-field"
                    disabled={isLoading || isTransitioning}
                  />
                </div>

                <div className="action-row">
                  <div className="left-actions">
                    <button type="button" className="icon-button" aria-label="Add">
                      <span className="material-icons">add</span>
                    </button>
                    <button type="button" className="icon-button" aria-label="Settings">
                      <span className="material-icons">tune</span>
                    </button>
                  </div>

                  <div className="right-actions">
                    <button type="button" className="icon-button" aria-label="Voice input">
                      <span className="material-icons">mic</span>
                    </button>
                    <button 
                      type="submit" 
                      className={`send-button ${message.trim() && !isLoading && !isTransitioning ? 'active' : 'inactive'}`}
                      disabled={!message.trim() || isLoading || isTransitioning}
                      aria-label="Send message"
                    >
                      <span className="material-icons">arrow_upward</span>
                    </button>
                  </div>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`app ${isTransitioning ? 'transitioning' : ''}`}>
      {/* Left Sidebar */}
      <div className="sidebar">
        <div className="sidebar-icon">
          <span className="material-icons">menu</span>
        </div>
        <div className="sidebar-icon">
          <span className="material-icons">search</span>
        </div>
        <div className="sidebar-icon">
          <span className="material-icons">folder</span>
        </div>
        <div className="sidebar-icon">
          <span className="material-icons">assignment</span>
        </div>
      </div>

      {/* Main Content */}
      <div className="main-content">
        {/* Header */}
        <div className="header">
          <h1 className="header-title">Software Engineer</h1>
          <div className="header-actions">
            <div data-count="false" data-icon="false" data-state="Active" className="action-tab active">
              <div className="action-tab-text">Define Role</div>
            </div>
            <div data-count="false" data-icon="false" data-state="Idle" className="action-tab idle">
              <div className="action-tab-text">Review Matches</div>
            </div>
            <div data-count="false" data-icon="false" data-state="Idle" className="action-tab idle">
              <div className="action-tab-text">Send Outreach</div>
            </div>
            <div data-count="false" data-icon="false" data-state="Idle" className="action-tab idle disabled">
              <div className="action-tab-text">Track Outreach</div>
            </div>
          </div>
          <div className="header-controls">
            <span className="material-icons">file_download</span>
            <span className="material-icons">more_horiz</span>
          </div>
        </div>

        {/* Body Content - Chat and Summary Side by Side */}
        <div className="body-content">
          {/* Chat Section */}
          <div className="chat-section">
            {/* Chat Area */}
            <div className="chat-area">
              {messages.map((msg) => (
                <div key={msg.id} className={msg.type === 'ai' ? 'ai-message' : 'user-message'}>
                  {msg.type === 'ai' ? (
                    <span dangerouslySetInnerHTML={{ __html: msg.content }}></span>
                  ) : (
                    <p>{msg.content}</p>
                  )}
                </div>
              ))}
              {isLoading && (
                <div className="ai-message loading">
                  <span>Thinking...</span>
                </div>
              )}
            </div>

            {/* AI Input Component */}
            <div className="input-area">
              <form onSubmit={handleSubmit} className="ai-input-card">
                <div className="ai-input-content">
                  <div className="input-row">
                    <input
                      ref={inputRef}
                      type="text"
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      onKeyPress={handleKeyPress}
                      placeholder="Describe who you are looking for"
                      className="ai-input-field"
                      disabled={isLoading}
                    />
                  </div>

                  <div className="action-row">
                    <div className="left-actions">
                      <button type="button" className="icon-button" aria-label="Add">
                        <span className="material-icons">add</span>
                      </button>
                      <button type="button" className="icon-button" aria-label="Settings">
                        <span className="material-icons">tune</span>
                      </button>
                    </div>

                    <div className="right-actions">
                      <button type="button" className="icon-button" aria-label="Voice input">
                        <span className="material-icons">mic</span>
                      </button>
                      <button 
                        type="submit" 
                        className={`send-button ${message.trim() && !isLoading ? 'active' : 'inactive'}`}
                        disabled={!message.trim() || isLoading}
                        aria-label="Send message"
                      >
                        <span className="material-icons">arrow_upward</span>
                      </button>
                    </div>
                  </div>
                </div>
              </form>
            </div>
          </div>

          {/* Summary Panel */}
          <div 
            className="figma-summary-panel" 
            ref={summaryRef}
            style={{ width: summaryWidth, minWidth: summaryWidth, maxWidth: summaryWidth }}
          >
            <div 
              className="resize-handle"
              onMouseDown={handleMouseDown}
            />
            <div className="figma-summary-header">
              <div className="figma-header-title">
                <div className="figma-title-text">Summary</div>
              </div>
              <div className="figma-collapse-button">
                <div className="figma-icon-container">
                  <div className="figma-panel-icon">
                    <div className="figma-panel-border"></div>
                    <div className="figma-panel-tab"></div>
                  </div>
                </div>
              </div>
            </div>

            <div className="figma-summary-content">
              <div className="figma-role-info">
                <div className="figma-role-title">Software Engineer</div>
                <div className="figma-role-location">in San Francisco, CA, USA</div>
              </div>

              <div className="figma-sections-container">
                <div className="figma-divider"></div>
                
                <div className="figma-overview-section">
                  <div className="figma-section-header">
                    <div className="figma-section-title">
                      <div className="figma-section-text">Overview</div>
                    </div>
                  </div>
                  <div className="figma-overview-stats">
                    <div className="figma-stat-card">
                      <div className="figma-stat-icon">
                        <div className="figma-icon-text">tag</div>
                      </div>
                      <div className="figma-stat-content">
                        <div className="figma-stat-number">125K</div>
                        <div className="figma-stat-label">Candidates</div>
                      </div>
                    </div>
                    <div className="figma-stat-card">
                      <div className="figma-stat-icon">
                        <div className="figma-icon-text">attach_money</div>
                      </div>
                      <div className="figma-stat-content">
                        <div className="figma-stat-number">250K</div>
                        <div className="figma-stat-label">Est. compensation</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="figma-divider"></div>

                <div className="figma-requirements-section">
                  <div className="figma-section-header">
                    <div className="figma-section-title">
                      <div className="figma-section-text">Requirements</div>
                    </div>
                  </div>
                  <div className="figma-requirements-tags">
                    <div className="figma-tag">
                      <div className="figma-tag-text">Software Engineer</div>
                    </div>
                    <div className="figma-tag">
                      <div className="figma-tag-text">Senior Software Engineer</div>
                    </div>
                    <div className="figma-tag">
                      <div className="figma-tag-text">SaaS</div>
                    </div>
                    <div className="figma-tag">
                      <div className="figma-tag-text">Startup</div>
                    </div>
                    <div className="figma-tag">
                      <div className="figma-tag-text">AWS Cloud</div>
                    </div>
                    <div className="figma-tag">
                      <div className="figma-tag-text">React.JS</div>
                    </div>
                    <div className="figma-tag">
                      <div className="figma-tag-text">Cloud Applications</div>
                    </div>
                  </div>
                </div>

                <div className="figma-divider"></div>

                <div className="figma-qualities-section">
                  <div className="figma-section-header">
                    <div className="figma-section-title">
                      <div className="figma-section-text">Qualities</div>
                    </div>
                  </div>
                  <div className="figma-qualities-list">
                    <div className="figma-quality-item">
                      <div className="figma-quality-icon">auto_awesome</div>
                      <div className="figma-quality-text">Experience creating and conceptualising robust systems for internal teams.</div>
                    </div>
                    <div className="figma-quality-item">
                      <div className="figma-quality-icon">auto_awesome</div>
                      <div className="figma-quality-text">Approaches their work with an AI first mentality.</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App