"use client";

import { useState, useEffect, FormEvent, useCallback, ChangeEvent, KeyboardEvent, useRef } from "react";
import { v4 as uuidv4 } from 'uuid';
import ReactMarkdown, { Components } from 'react-markdown';
import GemBreakLogo from './components/GemBreakLogo'; // Import the logo
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface ChatMessage {
  id?: string;
  sessionId: string;
  role: "user" | "assistant" | "error" | "thinking"; // Changed "model" to "assistant"
  content: string;
  timestamp?: Date;
}

interface SessionInfo {
  id: string;
  lastActivity: string; // ISO date string
  name?: string;
}

// SVG Icon Components
const SendIcon = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
    <path d="M3.105 3.105a1.5 1.5 0 012.122-.001L19.58 10.58a1.5 1.5 0 010 2.122L5.227 19.58A1.5 1.5 0 013.105 17.477V3.105z" />
  </svg>
);

const ChatBubbleIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
    <path fillRule="evenodd" d="M2 5a2 2 0 012-2h12a2 2 0 012 2v7a2 2 0 01-2 2H4a2 2 0 01-2-2V5zm3.293 1.293a1 1 0 011.414 0L10 9.586l3.293-3.293a1 1 0 111.414 1.414L11.414 11l3.293 3.293a1 1 0 01-1.414 1.414L10 12.414l-3.293 3.293a1 1 0 01-1.414-1.414L8.586 11 5.293 7.707a1 1 0 010-1.414z" clipRule="evenodd" />
  </svg>
);

const EllipsisVerticalIcon = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
    <path d="M10 3.75a1.25 1.25 0 100 2.5 1.25 1.25 0 000-2.5zM10 8.75a1.25 1.25 0 100 2.5 1.25 1.25 0 000-2.5zM10 13.75a1.25 1.25 0 100 2.5 1.25 1.25 0 000-2.5z" />
  </svg>
);

const TrashIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12.56 0c.342.052.682.107 1.022.166m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
  </svg>
);

const PlusIcon = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
    <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
  </svg>
);

const LogoutIcon = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
    <path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V5.414l7.293 7.293a1 1 0 001.414-1.414L5.414 4H15a1 1 0 100-2H4a1 1 0 00-1 1z" clipRule="evenodd" />
  </svg>
);

const ThinkingIcon = ({ className = "w-5 h-5 animate-spin" }: { className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
);

// Define the structure for system prompts fetched from the DB
interface DbSystemPrompt {
  id: string;
  name: string;
  promptText: string; // This will be used as the 'prompt'
  isPrimary: boolean; // Changed from isActive
  // createdAt and updatedAt are available from API but not directly used in dropdown/logic here
}

export default function Home() {
  const [prompt, setPrompt] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [currentSessionId, setCurrentSessionId] = useState<string>("");
  // const [typingMessageId, setTypingMessageId] = useState<string | null>(null); // Removed for typing effect
  // const [displayedContent, setDisplayedContent] = useState<string>(""); // Removed for typing effect
  
  const [availableSessions, setAvailableSessions] = useState<SessionInfo[]>([]);
  const [isSessionsLoading, setIsSessionsLoading] = useState<boolean>(false);
  
  const [dbSystemPrompts, setDbSystemPrompts] = useState<DbSystemPrompt[]>([]);
  const [selectedSystemPromptId, setSelectedSystemPromptId] = useState<string>(""); // Default to empty

  const [userId, setUserId] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null); // Changed from userEmail
  const [showLoginModal, setShowLoginModal] = useState<boolean>(false);
  const [showRegisterModal, setShowRegisterModal] = useState<boolean>(false);
  const [usernameInput, setUsernameInput] = useState<string>(""); // Changed from emailInput
  const [passwordInput, setPasswordInput] = useState<string>("");
  const [inviteCodeInput, setInviteCodeInput] = useState<string>("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [openDropdownSessionId, setOpenDropdownSessionId] = useState<string | null>(null);


  const formRef = useRef<HTMLFormElement>(null); // Ref for the form
  const dropdownRef = useRef<HTMLDivElement>(null); // Ref for the dropdown
  const messagesEndMarkerRef = useRef<HTMLDivElement>(null); // Ref for scrolling to bottom
  const lastUserMessageRef = useRef<HTMLDivElement>(null); // Ref for the last user message

  const fetchAvailableSessions = useCallback(async (currentUserId: string | null) => {
    if (!currentUserId) {
      setAvailableSessions([]);
      setIsSessionsLoading(false); // Ensure loading state is reset
      return;
    }
    setIsSessionsLoading(true);
    try {
      const response = await fetch(`/api/sessions?userId=${currentUserId}`);
      if (response.ok) {
        const rawSessions: any[] = await response.json(); // Fetch as any[]
        // Map the 'title' from API to 'name' in SessionInfo
        const formattedSessions: SessionInfo[] = rawSessions.map(s => ({
          id: s.id,
          name: s.title, // Map title to name
          lastActivity: s.lastActivity,
        }));
        setAvailableSessions(formattedSessions);
      } else {
        console.error("Failed to fetch available sessions:", await response.text());
      }
    } catch (error) {
      console.error("Error fetching available sessions:", error);
    }
    setIsSessionsLoading(false);
  }, [setAvailableSessions, setIsSessionsLoading]); // Added dependencies

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const sidFromUrl = urlParams.get("sessionId");
    let initialSessionId: string;

    if (sidFromUrl) {
      initialSessionId = sidFromUrl;
      localStorage.setItem("chatSessionId", sidFromUrl); // Sync localStorage
    } else {
      let sidFromStorage: string | null = localStorage.getItem("chatSessionId");
      if (!sidFromStorage) {
        sidFromStorage = uuidv4();
        localStorage.setItem("chatSessionId", sidFromStorage);
      }
      initialSessionId = sidFromStorage;
    }
    setCurrentSessionId(initialSessionId);
    
    // Ensure URL reflects the active session ID
    if (window.location.search !== `?sessionId=${initialSessionId}`) {
      const newUrl = `${window.location.pathname}?sessionId=${initialSessionId}${window.location.hash}`;
      window.history.replaceState({ ...window.history.state, as: newUrl, url: newUrl }, '', newUrl);
    }

    const storedUserId = localStorage.getItem("chatUserId");
    const storedUsername = localStorage.getItem("chatUsername"); // Changed from chatUserEmail
    if (storedUserId && storedUsername) {
      setUserId(storedUserId);
      setUsername(storedUsername); // Changed from setUserEmail
      setShowLoginModal(false);
      setShowRegisterModal(false);
      fetchAvailableSessions(storedUserId);
    } else {
      setShowLoginModal(true);
      setShowRegisterModal(false);
      fetchAvailableSessions(null);
    }
  }, [fetchAvailableSessions]); // Added fetchAvailableSessions to dependency array

  // Effect to update URL when currentSessionId changes internally
  useEffect(() => {
    if (currentSessionId && window.location.search !== `?sessionId=${currentSessionId}`) {
      const newUrl = `${window.location.pathname}?sessionId=${currentSessionId}${window.location.hash}`;
      window.history.replaceState({ ...window.history.state, as: newUrl, url: newUrl }, '', newUrl);
    }
  }, [currentSessionId]);

  useEffect(() => {
    if (userId) {
      fetchAvailableSessions(userId);
      
      // Fetch system prompts from DB
      const fetchDbSystemPrompts = async () => {
        try {
          const response = await fetch('/api/system_prompts'); // Changed to the new non-admin endpoint
          if (response.ok) {
            const data = await response.json();
            if (data.success && Array.isArray(data.systemPrompts)) {
              const allPrompts: DbSystemPrompt[] = data.systemPrompts;
              setDbSystemPrompts(allPrompts);
              
              const primaryPrompt = allPrompts.find(p => p.isPrimary);
              if (primaryPrompt) {
                setSelectedSystemPromptId(primaryPrompt.id);
              } else if (allPrompts.length > 0) {
                setSelectedSystemPromptId(allPrompts[0].id); // Fallback to the first one if no primary is set
              } else {
                setSelectedSystemPromptId(""); // No prompts available
              }
            } else {
              console.error("Failed to fetch or parse system prompts:", data.message);
              setDbSystemPrompts([]);
            }
          } else {
            console.error("API error fetching system prompts:", response.statusText);
            setDbSystemPrompts([]);
          }
        } catch (error) {
          console.error("Error fetching system prompts:", error);
          setDbSystemPrompts([]);
        }
      };
      fetchDbSystemPrompts();
    } else {
      // Clear DB prompts if user logs out
      setDbSystemPrompts([]);
      setSelectedSystemPromptId("");
    }
  }, [userId, fetchAvailableSessions]);

  // Effect to handle clicks outside the dropdown to close it
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpenDropdownSessionId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    const fetchChatHistory = async (sidToFetch: string, currentUserId: string | null) => {
      if (!sidToFetch || !currentUserId) {
        setMessages([]);
        return;
      }
      setIsLoading(true);
      setMessages([]);
      try {
        const response = await fetch(`/api/chat_history?sessionId=${sidToFetch}&userId=${currentUserId}`);
        if (response.ok) {
          const history = await response.json();
          setMessages(history.map((msg: any) => ({ ...msg, id: msg._id?.toString(), sessionId: sidToFetch })));
        } else {
          console.error("Failed to fetch chat history:", await response.text());
          setMessages([{ sessionId: sidToFetch, role: "error", content: "Failed to load chat history." }]);
        }
      } catch (error) {
        console.error("Error fetching chat history:", error);
        setMessages([{ sessionId: sidToFetch, role: "error", content: "Error loading chat history." }]);
      }
      setIsLoading(false);
    };

    if (currentSessionId && userId) {
      fetchChatHistory(currentSessionId, userId);
    } else if (!userId && currentSessionId) {
      setMessages([]);
      setIsLoading(false); // Ensure loading state is reset
    } else if (!currentSessionId && !userId) { // Handle initial state or after logout
      setMessages([]);
      setIsLoading(false); // Ensure loading state is reset
    }
  }, [currentSessionId, userId]);

  useEffect(() => {
    // If lastUserMessageRef.current is set, it means a last user message was found and rendered.
    if (lastUserMessageRef.current) {
      lastUserMessageRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (messages.length > 0 && messagesEndMarkerRef.current) {
      // Fallback: if no user message was found to attach the ref to (e.g., all messages are assistant's),
      // or if lastUserMessageRef.current is null. Scroll to the bottom.
      messagesEndMarkerRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
    // If messages.length is 0, nothing happens, which is fine.
  }, [messages]);

  // Typing effect useEffect removed

  const handleNewChat = () => {
    const newSid = uuidv4();
    localStorage.setItem("chatSessionId", newSid); // Keep localStorage in sync
    setCurrentSessionId(newSid); // This will trigger the useEffect to update the URL
    setMessages([]);
    // Provide a default name for the new chat for immediate display
    const newChatName = `New Chat ${newSid.substring(0, 4)}...`;
    setAvailableSessions(prev => [{ id: newSid, lastActivity: new Date().toISOString(), name: newChatName }, ...prev.filter(s => s.id !== newSid)].sort((a,b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime()));
  };

  const handleSessionSelect = (sid: string) => {
    localStorage.setItem("chatSessionId", sid); // Keep localStorage in sync
    setCurrentSessionId(sid); // This will trigger the useEffect to update the URL
  };

  const handleSystemPromptChange = (e: ChangeEvent<HTMLSelectElement>) => {
    setSelectedSystemPromptId(e.target.value);
  };
  
  const triggerSubmit = () => {
    if (formRef.current) {
      // Create a new submit event
      const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
      // Dispatch it on the form
      formRef.current.dispatchEvent(submitEvent);
    }
  };

  const handleSubmitPrompt = async (e?: FormEvent<HTMLFormElement>) => {
    if (e) e.preventDefault();

    // Removed typingMessageId interruption logic
    if (!prompt.trim() || !currentSessionId || !userId) return;

    setIsLoading(true); // For API call
    const userMessage: ChatMessage = {
      id: uuidv4(), 
      sessionId: currentSessionId,
      role: "user",
      content: prompt,
      timestamp: new Date(),
    };
    setMessages((prevMessages) => [...prevMessages, userMessage]);
    const currentPromptText = prompt;
    setPrompt("");

    const selectedDbPrompt = dbSystemPrompts.find(sp => sp.id === selectedSystemPromptId);
    const systemPromptContent = selectedDbPrompt ? selectedDbPrompt.promptText : "You are a helpful assistant."; // Fallback if no prompt selected or found

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          prompt: currentPromptText, 
          sessionId: currentSessionId,
          userId: userId,
          systemPrompt: systemPromptContent 
        }),
      });
      const data = await response.json();
      if (response.ok) {
        const newAssistantMessageId = uuidv4();
        const assistantMessage: ChatMessage = {
          id: uuidv4(), // ID for the message
          sessionId: currentSessionId,
          role: "assistant",
          content: data.text, // Full content stored
          timestamp: new Date(),
        };
        setMessages((prevMessages) => [...prevMessages, assistantMessage]);
        setIsLoading(false); // API call finished, stop loading
      } else {
        setMessages((prevMessages) => [...prevMessages, { id: uuidv4(), sessionId: currentSessionId, role: "error", content: `Error: ${data.error}` }]);
        setIsLoading(false); // API error, stop loading
      }
    } catch (error) {
      setMessages((prevMessages) => [...prevMessages, { id: uuidv4(), sessionId: currentSessionId, role: "error", content: "Error: Failed to fetch from API." }]);
      setIsLoading(false); // API error, stop loading
    }
    if (userId) fetchAvailableSessions(userId);
  };

  const handleHideChat = async (sessionIdToHide: string) => {
    if (!userId || !sessionIdToHide) return;

    const originalSessions = [...availableSessions];
    const originalCurrentSessionId = currentSessionId;

    // Optimistically update UI
    setAvailableSessions(prev => prev.filter(s => s.id !== sessionIdToHide));
    if (currentSessionId === sessionIdToHide) {
      const remainingSessions = originalSessions.filter(s => s.id !== sessionIdToHide);
      if (remainingSessions.length > 0) {
        // Select the most recent of the remaining sessions
        const sortedRemaining = [...remainingSessions].sort((a,b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime());
        setCurrentSessionId(sortedRemaining[0].id);
        localStorage.setItem("chatSessionId", sortedRemaining[0].id);
      } else {
        handleNewChat(); // Create a new chat if no others are left
      }
    }

    try {
      const response = await fetch('/api/user/chats/hide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sessionIdToHide, userId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Failed to delete chat:', errorData.error);
        // Revert optimistic update on failure
        setAvailableSessions(originalSessions);
        if (currentSessionId !== originalCurrentSessionId) {
            setCurrentSessionId(originalCurrentSessionId);
            localStorage.setItem("chatSessionId", originalCurrentSessionId);
        }
        alert(`Error hiding chat: ${errorData.error || 'Unknown error'}`);
      }
      // No specific action needed on success as UI was updated optimistically
      // Optionally, re-fetch sessions to ensure consistency, though optimistic update should suffice
      // fetchAvailableSessions(userId); 
    } catch (error) {
      console.error('Error hiding chat:', error);
      // Revert optimistic update on failure
      setAvailableSessions(originalSessions);
      if (currentSessionId !== originalCurrentSessionId) {
        setCurrentSessionId(originalCurrentSessionId);
        localStorage.setItem("chatSessionId", originalCurrentSessionId);
      }
      alert('An unexpected error occurred while hiding the chat.');
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      triggerSubmit();
    }
  };

  const handleLogin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setAuthError(null);
    if (!usernameInput.trim() || !passwordInput.trim()) {
      setAuthError("Username and password are required.");
      return;
    }
    setIsLoading(true);
    try {
      const response = await fetch("/api/auth/user-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: usernameInput, password: passwordInput }), // Changed email to username
      });
      const data = await response.json();
      if (response.ok && data.success) {
        localStorage.setItem("chatUserId", data.userId);
        localStorage.setItem("chatUsername", data.username); // Changed chatUserEmail to chatUsername
        setUserId(data.userId);
        setUsername(data.username); // Changed setUserEmail to setUsername
        setShowLoginModal(false);
        setUsernameInput(""); // Changed setEmailInput to setUsernameInput
        setPasswordInput("");
      } else {
        setAuthError(data.message || "Login failed. Please check your credentials.");
      }
    } catch (error) {
      console.error("Login API error:", error);
      setAuthError("An error occurred during login. Please try again.");
    }
    setIsLoading(false);
  };

  const handleRegister = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setAuthError(null);
    if (!usernameInput.trim() || !passwordInput.trim() || !inviteCodeInput.trim()) {
      setAuthError("Username, password, and invite code are required for registration.");
      return;
    }
    setIsLoading(true);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: usernameInput, password: passwordInput, inviteCodeToUse: inviteCodeInput }), // Changed email to username
      });
      const data = await response.json();
      if (response.ok && data.success) {
        localStorage.setItem("chatUserId", data.userId);
        localStorage.setItem("chatUsername", data.username); // Changed chatUserEmail to chatUsername
        setUserId(data.userId);
        setUsername(data.username); // Changed setUserEmail to setUsername
        setShowRegisterModal(false);
        setShowLoginModal(false);
        setUsernameInput(""); // Changed setEmailInput to setUsernameInput
        setPasswordInput("");
        setInviteCodeInput("");
      } else {
        setAuthError(data.message || "Registration failed. Please try again.");
      }
    } catch (error) {
      console.error("Registration API error:", error);
      setAuthError("An error occurred during registration. Please try again.");
    }
    setIsLoading(false);
  };

  const switchToRegister = () => {
    setShowLoginModal(false);
    setShowRegisterModal(true);
    setAuthError(null);
    setUsernameInput(""); // Changed setEmailInput to setUsernameInput
    setPasswordInput("");
  };

  const switchToLogin = () => {
    setShowRegisterModal(false);
    setShowLoginModal(true);
    setAuthError(null);
    setUsernameInput(""); // Changed setEmailInput to setUsernameInput
    setPasswordInput("");
    setInviteCodeInput("");
  };

  const handleUserLogout = async () => {
    try {
      const response = await fetch('/api/auth/user-logout', { method: 'POST' });
      const data = await response.json();
      if (response.ok && data.success) {
        localStorage.removeItem("chatUserId");
        localStorage.removeItem("chatUsername"); // Changed chatUserEmail to chatUsername
        localStorage.removeItem("chatSessionId");
        
        setUserId(null);
        setUsername(null); // Changed setUserEmail to setUsername
        setCurrentSessionId("");
        setMessages([]);
        setAvailableSessions([]);
        setShowLoginModal(true);
        setShowRegisterModal(false);
      } else {
        console.error("Logout failed:", data.message);
        setAuthError(data.message || "Logout failed. Please try again.");
      }
    } catch (error) {
      console.error("Logout API error:", error);
      setAuthError("An error occurred during logout.");
    }
  };


  if (showLoginModal) {
    return (
      <div className="fixed inset-0 bg-black/30 backdrop-blur-md flex items-center justify-center z-50 p-4">
        <form
          onSubmit={handleLogin}
          className="glass-card p-8 rounded-xl shadow-xl w-full max-w-sm"
        >
          <h2 className="text-2xl font-bold mb-6 text-center text-white">Login</h2>
          {authError && <p className="text-red-500 text-sm mb-4 text-center">{authError}</p>}
          <input
            type="text"
            value={usernameInput}
            onChange={(e) => setUsernameInput(e.target.value)}
            placeholder="Username"
            className="w-full p-3 mb-4 bg-white/10 border border-white/20 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-400 text-white placeholder-gray-300"
            required
          />
          <input
            type="password"
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
            placeholder="Password"
            className="w-full p-3 mb-6 bg-white/10 border border-white/20 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-400 text-white placeholder-gray-300"
            required
          />
          <button
            type="submit"
            className="w-full bg-indigo-500 hover:bg-indigo-600 text-white font-semibold py-3 px-4 rounded-md transition duration-150"
            disabled={isLoading}
          >
            {isLoading ? "Logging in..." : "Login"}
          </button>
          <p className="text-center text-sm mt-4 text-gray-300">
            No account?{' '}
            <button
              type="button"
              onClick={switchToRegister}
              className="text-indigo-400 hover:underline"
            >
              Register here
            </button>
          </p>
        </form>
      </div>
    );
  }

  if (showRegisterModal) {
    return (
      <div className="fixed inset-0 bg-black/30 backdrop-blur-md flex items-center justify-center z-50 p-4">
        <form
          onSubmit={handleRegister}
          className="glass-card p-8 rounded-xl shadow-xl w-full max-w-sm"
        >
          <h2 className="text-2xl font-bold mb-6 text-center text-white">Register</h2>
          {authError && <p className="text-red-500 text-sm mb-4 text-center">{authError}</p>}
          <input
            type="text"
            value={usernameInput}
            onChange={(e) => setUsernameInput(e.target.value)}
            placeholder="Username"
            className="w-full p-3 mb-4 bg-white/10 border border-white/20 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-400 text-white placeholder-gray-300"
            required
          />
          <input
            type="password"
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
            placeholder="Password"
            className="w-full p-3 mb-4 bg-white/10 border border-white/20 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-400 text-white placeholder-gray-300"
            required
          />
          <input
            type="text"
            value={inviteCodeInput}
            onChange={(e) => setInviteCodeInput(e.target.value)}
            placeholder="Invite Code"
            className="w-full p-3 mb-6 bg-white/10 border border-white/20 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-400 text-white placeholder-gray-300"
            required
          />
          <button
            type="submit"
            className="w-full bg-green-500 hover:bg-green-600 text-white font-semibold py-3 px-4 rounded-md transition duration-150"
            disabled={isLoading}
          >
            {isLoading ? "Registering..." : "Register"}
          </button>
          <p className="text-center text-sm mt-4 text-gray-300">
            Already have an account?{' '}
            <button
              type="button"
              onClick={switchToLogin}
              className="text-indigo-400 hover:underline"
            >
              Login here
            </button>
          </p>
        </form>
      </div>
    );
  }

// Define markdown components configuration
const markdownComponents: Components = {
  code: ({ node, inline, className, children, ...props }: { node?: any; inline?: boolean; className?: string; children?: React.ReactNode; [key: string]: any }) => {
    const match = /language-(\w+)/.exec(className || '');
    if (!inline && match) {
      // It's a fenced code block with a language
      return (
        <SyntaxHighlighter
          style={vscDarkPlus as { [key: string]: React.CSSProperties }} // Apply cast for style prop
          language={match[1]}
          PreTag="div"
          // Do not spread ...props here unless certain they are valid for SyntaxHighlighter
        >
          {String(children).replace(/\n$/, '')}
        </SyntaxHighlighter>
      );
    } else {
      // It's an inline code snippet or a fenced code block without a language
      // Only pass known valid HTML attributes to the native <code> tag
      const { ...restSafeProps } = props; // Intentionally not spreading all props
      return (
        <code className={className} {...restSafeProps}> {/* Or pass specific safe props if known */}
          {children}
        </code>
      );
    }
  },
  table: ({children, ...props}) => <table className="border-collapse border border-slate-500 my-2" {...props}>{children}</table>,
  thead: ({children, ...props}) => <thead className="bg-slate-700" {...props}>{children}</thead>,
  tbody: ({children, ...props}) => <tbody {...props}>{children}</tbody>,
  tr: ({children, ...props}) => <tr className="border border-slate-600" {...props}>{children}</tr>,
  th: ({children, ...props}) => <th className="border border-slate-600 px-2 py-1 text-left" {...props}>{children}</th>,
  td: ({children, ...props}) => <td className="border border-slate-600 px-2 py-1" {...props}>{children}</td>,
  ul: ({children, ...props}) => <ul className="list-disc list-inside my-2 pl-4" {...props}>{children}</ul>,
  ol: ({children, ...props}) => <ol className="list-decimal list-inside my-2 pl-4" {...props}>{children}</ol>,
  li: ({children, ...props}) => <li className="mb-1" {...props}>{children}</li>,
  p: ({children, ...props}) => <p className="whitespace-pre-wrap text-sm leading-relaxed mb-2 last:mb-0" {...props}>{children}</p>,
  a: ({node, ...props}) => <a className="text-indigo-400 hover:underline" {...props} target="_blank" rel="noopener noreferrer" />
};

  // Determine the index of the last user message for ref assignment
  const lastUserMessageIndex = messages.findLastIndex(m => m.role === 'user');

  return (
    <div className="flex flex-col md:flex-row h-screen p-2 md:p-4">
      <aside className="w-full md:w-72 glass-card p-4 flex flex-col order-first md:order-none mb-2 md:mb-0 md:mr-4">
        <div className="mb-2">
          {username ? (
            <>
              <p className="text-sm text-white/80">Logged in as: <strong className="font-mono text-white">{username}</strong></p>
              <button
                onClick={handleUserLogout}
                className="mt-1 w-full text-xs bg-red-500 hover:bg-red-600 text-white font-semibold py-1 px-2 rounded flex items-center justify-center"
              >
                <LogoutIcon className="w-4 h-4 mr-1.5" />
                Logout
              </button>
            </>
          ) : (
            <p className="text-sm text-white/80">Not logged in</p>
          )}
        </div>
        <button
          onClick={handleNewChat}
          className="mb-4 w-full bg-indigo-500 hover:bg-indigo-600 text-white font-semibold py-2 px-4 rounded transition-colors duration-150 flex items-center justify-center"
          disabled={!userId}
        >
          <PlusIcon className="w-5 h-5 mr-2" />
          New Chat
        </button>
        <h2 className="text-xl font-semibold mb-3 text-white border-b border-white/20 pb-2">Chat History</h2>
        {isSessionsLoading && <p className="text-sm text-white/70 px-1 py-2">Loading sessions...</p>}
        <nav className="flex-grow overflow-y-auto space-y-1 pr-1 custom-scrollbar">
          {availableSessions.length === 0 && !isSessionsLoading && (
            <p className="text-sm text-white/60 px-1 py-2 italic">No chat sessions yet.</p>
          )}
          {availableSessions.map((session) => (
            <div key={session.id} className="relative group flex items-stretch rounded-md transition-all duration-150 ease-in-out">
              <button
                onClick={() => handleSessionSelect(session.id)}
                className={`flex-grow flex items-center text-left px-2.5 py-2 rounded-l-md text-sm truncate transition-colors duration-150 ease-in-out ${
                  currentSessionId === session.id
                    ? "bg-indigo-600 text-white shadow-md"
                    : "text-white/80 bg-white/[.03] hover:bg-white/10 hover:text-white"
                }`}
                title={`Chat session ${session.id.substring(0,8)}...`}
              >
                <ChatBubbleIcon className={`w-5 h-5 mr-2.5 flex-shrink-0 ${currentSessionId === session.id ? "text-white" : "text-indigo-300 group-hover:text-indigo-200"}`} />
                <div className="flex-grow truncate">
                  <span className="font-medium">{session.name || `Chat ${session.id.substring(0, 8)}`}</span>
                  <span className={`block text-xs mt-0.5 ${currentSessionId === session.id ? "text-indigo-200" : "text-white/50 group-hover:text-white/70"}`}>
                    {new Date(session.lastActivity).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })} - {new Date(session.lastActivity).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </button>
              {/* Ellipsis button part of the flex group, styled to match */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenDropdownSessionId(openDropdownSessionId === session.id ? null : session.id);
                }}
                className={`flex-shrink-0 flex items-center justify-center p-2.5 rounded-r-md transition-colors duration-150 ease-in-out ${
                  currentSessionId === session.id
                    ? "bg-indigo-600 hover:bg-indigo-500 text-indigo-100 hover:text-white" // Active state
                    : "bg-white/[.03] hover:bg-white/20 text-white/60 hover:text-white" // Inactive state
                } ${openDropdownSessionId === session.id || "opacity-0 group-hover:opacity-100 focus:opacity-100"}`}
                title="More options"
              >
                <EllipsisVerticalIcon className="w-5 h-5" />
              </button>
              {openDropdownSessionId === session.id && (
                <div 
                  ref={dropdownRef}
                  className="absolute right-0 top-full mt-1.5 w-48 bg-slate-700 border border-slate-600 rounded-md shadow-lg z-10 py-1"
                  onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside dropdown
                >
                  <button
                    onClick={() => {
                      if (window.confirm(`Are you sure you want to delete chat "${session.name || session.id.substring(0,8)}..."? This action cannot be undone.`)) {
                        handleHideChat(session.id);
                      }
                      setOpenDropdownSessionId(null);
                    }}
                    className="w-full flex items-center px-3 py-2 text-sm text-red-400 hover:bg-red-500/20 hover:text-red-300"
                  >
                    <TrashIcon className="w-5 h-5 mr-2.5" />
                    Delete Chat
                  </button>
                  {/* Add other options here if needed in the future */}
                </div>
              )}
            </div>
          ))}
        </nav>
      </aside>

      <main className="flex-1 flex flex-col overflow-y-hidden glass-card p-4">
        <div className="flex-grow flex flex-col items-center w-full max-w-full  mx-auto">
          <div className="w-full mb-3"> {/* Reduced bottom margin from mb-4 to mb-3 */}
            <div className="text-center mb-2 flex items-center justify-center"> {/* Flex container for logo and session ID */}
              <GemBreakLogo />
              {currentSessionId && (
                <span className="ml-2 text-xs text-white/60 font-mono bg-white/5 p-0.5 px-1.5 rounded align-middle">
                  {currentSessionId.substring(0,8)}
                </span>
              )}
            </div>
            <div className="mt-2"> {/* Reduced top margin from mt-4 to mt-2 */}

              <select
                id="system-prompt-select"
                value={selectedSystemPromptId}
                onChange={handleSystemPromptChange}
                className="block w-full p-2.5 bg-white/10 border border-white/20 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 sm:text-sm text-white transition-colors"
                disabled={dbSystemPrompts.length === 0 || !userId}
              >
                {dbSystemPrompts.length === 0 && <option value="" className="bg-zinc-800 text-white">No personas available</option>} {/* Updated text */}
                {dbSystemPrompts.map(sp => (
                  <option key={sp.id} value={sp.id} className="bg-zinc-800 text-white">
                    {sp.name}{sp.isPrimary ? " (Primary)" : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="w-full flex-grow mb-4 h-72 md:h-96 overflow-y-auto rounded-lg border border-white/20 p-4 space-y-4 bg-white/5 backdrop-blur-sm shadow-inner custom-scrollbar">
            {messages.map((msg, index) => {
              let bubbleBaseClasses = "max-w-[75%] md:max-w-[70%] rounded-xl px-4 py-2.5 shadow-md text-white";
              let roleSpecificClasses = "";

              if (msg.role === "user") {
                roleSpecificClasses = "bg-blue-500/70 border border-blue-400/50 backdrop-blur-md rounded-tr-none";
              } else if (msg.role === "assistant") { // Changed "model" to "assistant"
                roleSpecificClasses = "bg-slate-600/70 border border-slate-500/50 backdrop-blur-md rounded-tl-none";
              } else { // error or thinking role
                roleSpecificClasses = "bg-red-500/70 border border-red-400/50 backdrop-blur-md";
                 if (msg.role === "thinking") { // Specific style for thinking if needed, or handled by default else
                    roleSpecificClasses = "bg-gray-500/70 border border-gray-400/50 backdrop-blur-md";
                 }
              }
              const finalBubbleClasses = `${bubbleBaseClasses} ${roleSpecificClasses}`;

              return (
                <div
                  key={msg.id || index}
                  ref={index === lastUserMessageIndex ? lastUserMessageRef : null}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div className={finalBubbleClasses}>
                    {/* <p className="text-xs font-semibold capitalize mb-1 opacity-80">{msg.role}</p> */} {/* Role display removed */}
                    {msg.role === "assistant" ? (
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={markdownComponents}
                      >
                        {msg.content}
                      </ReactMarkdown>
                    ) : (
                      // For user, error, thinking messages
                      <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</p>
                    )}
                    {msg.timestamp && (
                      <p className="text-xs opacity-60 mt-1.5 text-right">
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
            {/* Show "Thinking..." indicator if isLoading for API and last message is from user */}
            {isLoading && messages.length > 0 && messages[messages.length -1].role === "user" && (
                 <div className="flex justify-start"> {/* Reverted to justify-start for assistant side */}
                    <div className="max-w-[75%] md:max-w-[70%] rounded-xl px-4 py-2.5 shadow-md text-white bg-slate-600/70 border border-slate-500/50 backdrop-blur-md rounded-tl-none flex items-center"> {/* Styled like an assistant message */}
                        <ThinkingIcon className="w-5 h-5 animate-spin mr-2 text-white/70" />
                        <p className="text-sm leading-relaxed text-white/70">Thinking...</p>
                    </div>
                </div>
            )}
            {isLoading && messages.length === 0 && <p className="text-center text-white/70 py-4">Loading messages...</p>}
            {!isLoading && messages.length === 0 && currentSessionId && <p className="text-center text-white/70 py-4">No messages in this chat yet. Send one below!</p>}
            {!isLoading && !currentSessionId && !userId && <p className="text-center text-white/70 py-4">Please log in to start chatting.</p>}
            <div ref={messagesEndMarkerRef} /> {/* Invisible marker for scrolling */}
          </div>

          <form onSubmit={handleSubmitPrompt} ref={formRef} className="w-full">
            <div className="flex items-end space-x-2">
              <textarea
                id="prompt"
                name="prompt"
                rows={3}
                className="flex-grow block w-full rounded-md bg-white/10 border border-white/20 shadow-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400 p-3 text-sm text-white placeholder-gray-300 transition-colors"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Enter your prompt here..."
                required
                disabled={isLoading || !currentSessionId || !userId}
              />
              <button
                type="submit"
                disabled={isLoading || !prompt.trim() || !currentSessionId || !userId}
                className="flex-shrink-0 justify-center items-center rounded-md border border-transparent bg-indigo-500 p-3 text-sm font-medium text-white shadow-sm hover:bg-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-60 transition-opacity h-[calc(3*1.5rem+2*0.75rem+2px)]" // Match textarea height for 3 rows
                aria-label="Send message"
              >
                <SendIcon className="w-5 h-5" />
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
