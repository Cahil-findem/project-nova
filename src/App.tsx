import React, { useState, useCallback, useRef } from 'react'
import OpenAI from 'openai'
import './App.css'

interface Message {
  id: string
  type: 'user' | 'ai'
  content: string
  timestamp: number
}

interface JobDescription {
  role?: string
  location?: string
  requirements: string[]
  qualities: string[]
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
  const [jobDescription, setJobDescription] = useState<JobDescription>({
    requirements: [],
    qualities: []
  })
  const summaryRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const chatAreaRef = useRef<HTMLDivElement>(null)

  // Get user's location from IP address
  const getUserLocation = useCallback(async () => {
    try {
      console.log('Fetching location from IP...')
      // Use ipinfo.io which is more reliable and CORS-friendly
      const response = await fetch('https://ipinfo.io/json?token=')
      const data = await response.json()
      console.log('Location data received:', data)
      if (data.city && data.region) {
        const location = `${data.city}, ${data.region}`
        console.log('Setting location to:', location)
        setJobDescription(prev => ({
          ...prev,
          location: location
        }))
      } else {
        console.log('No city/region data available')
        // Set a default fallback location
        setJobDescription(prev => ({
          ...prev,
          location: 'Remote'
        }))
      }
    } catch (error) {
      console.log('Could not get location from IP:', error)
      // Fallback: set a default location
      setJobDescription(prev => ({
        ...prev,
        location: 'Remote'
      }))
    }
  }, [])

  // Get location on component mount
  React.useEffect(() => {
    getUserLocation()
  }, [getUserLocation])

  // Helper function to properly capitalize text
  const capitalizeText = useCallback((text: string) => {
    return text
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ')
  }, [])

  // Helper function to capitalize requirements (keep tech terms as-is)
  const capitalizeRequirement = useCallback((req: string) => {
    // Common tech terms that should maintain their casing
    const techTerms = {
      'javascript': 'JavaScript',
      'typescript': 'TypeScript',
      'react': 'React',
      'nodejs': 'Node.js',
      'node.js': 'Node.js',
      'aws': 'AWS',
      'css': 'CSS',
      'html': 'HTML',
      'sql': 'SQL',
      'api': 'API',
      'rest': 'REST',
      'graphql': 'GraphQL',
      'mongodb': 'MongoDB',
      'postgresql': 'PostgreSQL',
      'mysql': 'MySQL',
      'docker': 'Docker',
      'kubernetes': 'Kubernetes',
      'git': 'Git',
      'github': 'GitHub',
      'gitlab': 'GitLab',
      'saas': 'SaaS',
      'ui/ux': 'UI/UX',
      'json': 'JSON'
    }
    
    const lower = req.toLowerCase()
    return techTerms[lower] || capitalizeText(req)
  }, [capitalizeText])

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

  const extractJobDescription = useCallback(async (conversation: Message[]) => {
    if (!openai || conversation.length === 0) return

    try {
      const conversationText = conversation
        .map(msg => `${msg.type === 'user' ? 'User' : 'AI'}: ${msg.content.replace(/<br\s*\/?>/gi, '\n')}`)
        .join('\n\n')

      const response = await openai.chat.completions.create({
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

      const extractedText = response.choices[0]?.message?.content?.trim()
      if (!extractedText) return

      console.log('Raw extraction response:', extractedText)

      try {
        const extracted = JSON.parse(extractedText) as JobDescription
        console.log('Parsed extraction:', extracted)
        console.log('Conversation text that was analyzed:', conversationText)
        
        setJobDescription(prev => ({
          role: extracted.role ? capitalizeText(extracted.role) : prev.role,
          location: extracted.location ? capitalizeText(extracted.location) : prev.location,
          requirements: [...new Set([
            ...prev.requirements, 
            ...extracted.requirements.map(req => capitalizeRequirement(req))
          ])],
          qualities: [...new Set([
            ...prev.qualities, 
            ...extracted.qualities.map(quality => 
              quality.charAt(0).toUpperCase() + quality.slice(1)
            )
          ])]
        }))
      } catch (parseError) {
        console.error('Failed to parse job description extraction:', parseError)
      }
    } catch (error) {
      console.error('Error extracting job description:', error)
    }
  }, [capitalizeText, capitalizeRequirement])

  const processMessage = useCallback(async (messageContent: string, currentMessages: Message[]) => {
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: currentMessages.map(msg => ({
            role: msg.type === 'user' ? 'user' : 'assistant',
            content: msg.content.replace(/<br\s*\/?>/gi, '\n')
          })).concat([{
            role: 'user',
            content: messageContent
          }])
        })
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('No response body')
      }

      let aiResponse = ''
      
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          
          const chunk = new TextDecoder().decode(value)
          aiResponse += chunk
        }
      } catch (streamError) {
        console.error('Streaming error:', streamError)
        throw new Error('Error reading response stream')
      }

      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'ai',
        content: aiResponse.replace(/\n/g, '<br />'),
        timestamp: Date.now()
      }

      const updatedMessages = [...currentMessages, aiMessage]
      setMessages(updatedMessages)
      
      // Extract job description after successful AI response
      await extractJobDescription(updatedMessages)
    } catch (error) {
      console.error('Error calling chat API:', error)
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
  }, [extractJobDescription])

  const sendMessage = useCallback(async () => {
    if (!message.trim() || isLoading) return

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: message.trim(),
      timestamp: Date.now()
    }

    const updatedMessages = [...messages, userMessage]
    setMessages(updatedMessages)
    const currentMessage = message.trim()
    setMessage('')
    setIsLoading(true)

    await processMessage(currentMessage, updatedMessages)
  }, [message, messages, isLoading, processMessage])

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

  // Auto-scroll chat area to bottom when new messages are added
  React.useEffect(() => {
    if (chatAreaRef.current) {
      chatAreaRef.current.scrollTop = chatAreaRef.current.scrollHeight
    }
  }, [messages, isLoading])

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
          <h1 className="header-title">{jobDescription.role || 'New Role'}</h1>
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
            <div className="chat-area" ref={chatAreaRef}>
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
              {(jobDescription.role || jobDescription.location) && (
                <div className="figma-role-info">
                  {jobDescription.role && (
                    <div className="figma-role-title">{jobDescription.role}</div>
                  )}
                  {jobDescription.location && (
                    <div className="figma-role-location">in {jobDescription.location}</div>
                  )}
                </div>
              )}

              <div className="figma-sections-container">
                {(jobDescription.role || jobDescription.location || jobDescription.requirements.length > 0 || jobDescription.qualities.length > 0) && (
                  <div className="figma-divider"></div>
                )}
                
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

                {jobDescription.requirements.length > 0 && (
                  <>
                    <div className="figma-divider"></div>
                    <div className="figma-requirements-section">
                      <div className="figma-section-header">
                        <div className="figma-section-title">
                          <div className="figma-section-text">Requirements</div>
                        </div>
                      </div>
                      <div className="figma-requirements-tags">
                        {jobDescription.requirements.map((requirement, index) => (
                          <div key={index} className="figma-tag">
                            <div className="figma-tag-text">{requirement}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {jobDescription.qualities.length > 0 && (
                  <>
                    <div className="figma-divider"></div>
                    <div className="figma-qualities-section">
                      <div className="figma-section-header">
                        <div className="figma-section-title">
                          <div className="figma-section-text">Qualities</div>
                        </div>
                      </div>
                      <div className="figma-qualities-list">
                        {jobDescription.qualities.map((quality, index) => (
                          <div key={index} className="figma-quality-item">
                            <div className="figma-quality-icon">auto_awesome</div>
                            <div className="figma-quality-text">{quality}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App