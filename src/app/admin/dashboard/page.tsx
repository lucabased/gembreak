'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';

// Dummy data types (replace with actual types from your DB schema)
interface ChatHistory {
  _id: string;
  sessionId: string;
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string; timestamp: Date }>;
  createdAt: Date;
  updatedAt: Date;
}

interface AdminInviteCode {
  _id: string;
  code: string;
  isUsed: boolean;
  createdAt: Date | string;
  createdBy: string;
  usedBy?: string | null;
  usedAt?: Date | string | null;
}

interface User { // This will now represent our SessionUser from the API
  id: string; // User ID (from chatOwnerID.toString())
  email?: string; // User's email from Users collection
  firstActivity?: Date | string;
  lastActivity?: Date | string;
  messageCount?: number;
  sessionCount?: number; // Added sessionCount
  // username: string; // Or some other identifier // Kept for reference, but API returns 'id'
  // createdAt: Date; // Kept for reference
}

interface Metrics {
  totalSessions?: number;
  totalMessages?: number;
  averageMessagesPerSession?: number;
  activeSessions24h?: number;
  activeSessions7d?: number;
  totalSystemPrompts?: number;
  totalAdminInviteCodes?: number;
  usedAdminInviteCodes?: number;
  unusedAdminInviteCodes?: number;
}

// This is the single, correct SystemPrompt interface for the frontend,
// matching the SystemPromptAPI structure from the backend.
// The previous duplicate/conflicting SystemPrompt interface has been removed.
interface SystemPrompt { 
  id: string;
  name: string;
  promptText: string;
  isPrimary: boolean; // Changed from isActive
  createdAt: string; // ISO string, non-optional
  updatedAt: string; // ISO string, non-optional
}

interface SystemPromptFormData {
  name: string;
  promptText: string;
  isPrimary: boolean; // Changed from isActive
}

export default function AdminDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chatHistories, setChatHistories] = useState<ChatHistory[]>([]);
  const [users, setUsers] = useState<User[]>([]); // Will hold SessionUser data
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [systemPrompts, setSystemPrompts] = useState<SystemPrompt[]>([]);
  const [adminInviteCodes, setAdminInviteCodes] = useState<AdminInviteCode[]>([]);
  const [newlyGeneratedCode, setNewlyGeneratedCode] = useState<string | null>(null);
  const [isGeneratingCode, setIsGeneratingCode] = useState<boolean>(false);

  // State for collapsible sections
  const [isUserActivityVisible, setIsUserActivityVisible] = useState(true);
  const [isAdminToolsVisible, setIsAdminToolsVisible] = useState(true);
  const [showUsedInviteCodes, setShowUsedInviteCodes] = useState(false); // New state for invite code visibility
  const [userFilter, setUserFilter] = useState(''); // New state for user filter

  // State for selected chat history
  const [selectedChatHistoryId, setSelectedChatHistoryId] = useState<string | null>(null);

  // State for System Prompt CRUD
  const [showPromptForm, setShowPromptForm] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<SystemPrompt | null>(null);
  const [promptFormData, setPromptFormData] = useState<SystemPromptFormData>({ name: '', promptText: '', isPrimary: false }); // Changed isActive to isPrimary
  const [promptError, setPromptError] = useState<string | null>(null);
  const [promptLoading, setPromptLoading] = useState<boolean>(false);

  const currentChatMessages = useMemo(() => {
    if (!selectedChatHistoryId) return [];
    const history = chatHistories.find(h => h._id === selectedChatHistoryId);
    // Ensure messages are sorted by timestamp if not already
    return history ? [...history.messages].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()) : [];
  }, [selectedChatHistoryId, chatHistories]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [historiesRes, usersRes, metricsRes, promptsRes, inviteCodesRes] = await Promise.all([
        fetch('/api/admin/chat_histories'),
        fetch('/api/admin/users'),
        fetch('/api/admin/metrics'),
        fetch('/api/admin/system_prompts'),
        fetch('/api/admin/invite-codes') // Fetch admin invite codes
      ]);

      if (!historiesRes.ok) {
        if (historiesRes.status === 401) router.push('/admin/login');
        const errorData = await historiesRes.json().catch(() => ({ message: 'Failed to fetch chat histories' }));
        throw new Error(errorData.message || `Chat Histories: ${historiesRes.statusText}`);
      }
      const historiesData = await historiesRes.json();
      setChatHistories(historiesData.histories || []);

      if (!usersRes.ok) {
        if (usersRes.status === 401) router.push('/admin/login');
        const errorData = await usersRes.json().catch(() => ({ message: 'Failed to fetch users' }));
        throw new Error(errorData.message || `Users: ${usersRes.statusText}`);
      }
      const usersData = await usersRes.json();
      setUsers(usersData.users || []);

      if (!metricsRes.ok) {
        if (metricsRes.status === 401) router.push('/admin/login');
        const errorData = await metricsRes.json().catch(() => ({ message: 'Failed to fetch metrics' }));
        throw new Error(errorData.message || `Metrics: ${metricsRes.statusText}`);
      }
      const metricsData = await metricsRes.json();
      setMetrics(metricsData.metrics || null);

      if (!promptsRes.ok) {
        if (promptsRes.status === 401) router.push('/admin/login');
        const errorData = await promptsRes.json().catch(() => ({ message: 'Failed to fetch system prompts' }));
        throw new Error(errorData.message || `System Prompts: ${promptsRes.statusText}`);
      }
      const promptsData = await promptsRes.json();
      setSystemPrompts(promptsData.systemPrompts || []);

      if (!inviteCodesRes.ok) {
        if (inviteCodesRes.status === 401) router.push('/admin/login');
        const errorData = await inviteCodesRes.json().catch(() => ({ message: 'Failed to fetch invite codes' }));
        throw new Error(errorData.message || `Invite Codes: ${inviteCodesRes.statusText}`);
      }
      const inviteCodesData = await inviteCodesRes.json();
      setAdminInviteCodes(inviteCodesData.inviteCodes || []);

    } catch (err: any) {
      console.error("Failed to fetch admin data:", err);
      setError(err.message || 'Failed to load data.');
      if (err.status === 401) { // Or based on error message
        router.push('/admin/login'); // Redirect if not authenticated
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Removed router from dependencies as fetchData doesn't directly use it for re-fetching, only initial auth check.

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' }); // Create this API route
      router.push('/admin/login');
    } catch (err) {
      console.error('Logout failed:', err);
      // Handle logout error, maybe show a notification
    }
  };

  const handleGenerateInviteCode = async () => {
    setIsGeneratingCode(true);
    setNewlyGeneratedCode(null);
    setError(null);
    try {
      const response = await fetch('/api/admin/invite-codes', { method: 'POST' });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Failed to generate invite code.');
      }
      setNewlyGeneratedCode(data.inviteCode.code);
      // Add the new code to the list without re-fetching all, or re-fetch
      setAdminInviteCodes(prev => [data.inviteCode, ...prev]);
    } catch (err: any) {
      console.error('Error generating invite code:', err);
      setError(err.message);
    } finally {
      setIsGeneratingCode(false);
    }
  };

  // System Prompt CRUD Handlers
  const handleOpenPromptForm = (prompt: SystemPrompt | null = null) => {
    setPromptError(null);
    if (prompt) {
      setEditingPrompt(prompt);
      setPromptFormData({ name: prompt.name, promptText: prompt.promptText, isPrimary: prompt.isPrimary }); // Changed isActive to isPrimary
    } else {
      setEditingPrompt(null);
      setPromptFormData({ name: '', promptText: '', isPrimary: false }); // Changed isActive to isPrimary
    }
    setShowPromptForm(true);
  };

  const handlePromptFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox' && e.target instanceof HTMLInputElement) {
        // Explicitly assert target as HTMLInputElement for checked property
        setPromptFormData(prev => ({ ...prev, [name]: (e.target as HTMLInputElement).checked }));
    } else {
        setPromptFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handlePromptFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPromptLoading(true);
    setPromptError(null);
    try {
      let response;
      // Define a more specific type for API responses
      type ApiPromptResponse = { success: boolean; systemPrompt: SystemPrompt; message?: string };
      type ApiMessageResponse = { success: boolean; message: string };

      if (editingPrompt) { // Update existing prompt
        response = await fetch(`/api/admin/system_prompts`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingPrompt.id, ...promptFormData }),
        });
        const resultData = await response.json() as ApiPromptResponse;
        if (!response.ok || !resultData.success) throw new Error(resultData.message || 'Failed to update prompt.');
        // If the updated prompt is primary, or if its primary status changed, re-fetch all data.
        if (resultData.systemPrompt.isPrimary || (editingPrompt && editingPrompt.isPrimary !== resultData.systemPrompt.isPrimary)) {
          await fetchData();
        } else {
          setSystemPrompts(prev => prev.map(p => p.id === editingPrompt.id ? resultData.systemPrompt : p));
        }
      } else { // Create new prompt
        response = await fetch('/api/admin/system_prompts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(promptFormData),
        });
        const resultData = await response.json() as ApiPromptResponse;
        if (!response.ok || !resultData.success) throw new Error(resultData.message || 'Failed to create prompt.');
        // If the new prompt is primary, re-fetch all data. Otherwise, add locally.
        if (resultData.systemPrompt.isPrimary) {
          await fetchData();
        } else {
          setSystemPrompts(prev => [resultData.systemPrompt, ...prev]);
        }
      }
      setShowPromptForm(false);
      setEditingPrompt(null);
    } catch (err: any) {
      setPromptError(err.message);
    } finally {
      setPromptLoading(false);
    }
  };

  const handleDeletePrompt = async (promptId: string) => {
    if (!window.confirm('Are you sure you want to delete this system prompt?')) return;
    setPromptLoading(true); // Can use a more specific loading state if needed
    setPromptError(null);
    try {
      type ApiMessageResponse = { success: boolean; message: string };
      const response = await fetch(`/api/admin/system_prompts?id=${promptId}`, { method: 'DELETE' });
      const resultData = await response.json() as ApiMessageResponse;
      if (!response.ok || !resultData.success) throw new Error(resultData.message || 'Failed to delete prompt.');
      setSystemPrompts(prev => prev.filter(p => p.id !== promptId));
    } catch (err: any) {
      setPromptError(err.message);
      // Potentially show error near the specific prompt or globally for prompts
    } finally {
      setPromptLoading(false);
    }
  };

  const handleTogglePromptPrimary = async (prompt: SystemPrompt) => { // Renamed function and parameter
    setPromptLoading(true);
    setPromptError(null);
    try {
      type ApiPromptResponse = { success: boolean; systemPrompt: SystemPrompt; message?: string };
      const response = await fetch(`/api/admin/system_prompts`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        // Send the inverse of the current isPrimary status
        body: JSON.stringify({ id: prompt.id, isPrimary: !prompt.isPrimary }), 
      });
      const resultData = await response.json() as ApiPromptResponse;
      if (!response.ok || !resultData.success) {
        // If API returns specific error about unsetting last primary, show it
        if (response.status === 400 && resultData.message?.includes("Cannot unmark the only primary")) {
            setPromptError(resultData.message);
        } else {
            throw new Error(resultData.message || 'Failed to toggle prompt primary status.');
        }
      }
      
      // Because changing one prompt to primary de-primaries others (or an error occurs if unsetting last primary),
      // it's safest to always re-fetch data to ensure the UI is consistent with the DB state.
      await fetchData(); 
    } catch (err: any) {
      // If not already set by specific 400 error
      if (!promptError) {
        setPromptError(err.message);
      }
    } finally {
      setPromptLoading(false);
    }
  };


  if (loading && !systemPrompts.length) { // Show main loading only if everything is loading
    return <div className="loading-message">Loading dashboard...</div>;
  }

  if (error) {
    return <div className="error-message">Error: {error}</div>;
  }

  return (
    <div className="admin-dashboard-container">
      <header className="admin-header">
        <h1>Admin Dashboard</h1>
        <div className="admin-header-actions">
          <button
            onClick={fetchData}
            className="admin-button admin-button-secondary"
            style={{ marginRight: '10px' }}
            disabled={loading}
          >
            {loading ? 'Refreshing...' : 'Refresh Data'}
          </button>
          <button
            onClick={handleLogout}
            className="admin-button admin-button-danger"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Metrics Section - Overview */}
      <section className="admin-section admin-section-metrics">
        <h2>Key Metrics</h2>
        {metrics ? (
          <table className="admin-table metrics-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #ddd' }}>Metric Category</th>
                <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #ddd' }}>Statistic</th>
                <th style={{ textAlign: 'right', padding: '8px', borderBottom: '1px solid #ddd' }}>Value</th>
              </tr>
            </thead>
            <tbody>
              {/* Session & Message Metrics */}
              <tr>
                <td rowSpan={5} style={{ verticalAlign: 'top', fontWeight: 'bold', padding: '8px', borderBottom: '1px solid #eee', borderRight: '1px solid #eee' }}>Session & Usage</td>
                <td style={{ padding: '8px', borderBottom: '1px solid #eee' }}>Total Sessions</td>
                <td style={{ textAlign: 'right', padding: '8px', borderBottom: '1px solid #eee' }}>{metrics.totalSessions ?? 'N/A'}</td>
              </tr>
              <tr>
                <td style={{ padding: '8px', borderBottom: '1px solid #eee' }}>Total Messages</td>
                <td style={{ textAlign: 'right', padding: '8px', borderBottom: '1px solid #eee' }}>{metrics.totalMessages ?? 'N/A'}</td>
              </tr>
              <tr>
                <td style={{ padding: '8px', borderBottom: '1px solid #eee' }}>Avg. Messages/Session</td>
                <td style={{ textAlign: 'right', padding: '8px', borderBottom: '1px solid #eee' }}>{metrics.averageMessagesPerSession ?? 'N/A'}</td>
              </tr>
              <tr>
                <td style={{ padding: '8px', borderBottom: '1px solid #eee' }}>Active Sessions (Last 24h)</td>
                <td style={{ textAlign: 'right', padding: '8px', borderBottom: '1px solid #eee' }}>{metrics.activeSessions24h ?? 'N/A'}</td>
              </tr>
              <tr>
                <td style={{ padding: '8px', borderBottom: '1px solid #ddd' }}>Active Sessions (Last 7d)</td>
                <td style={{ textAlign: 'right', padding: '8px', borderBottom: '1px solid #ddd' }}>{metrics.activeSessions7d ?? 'N/A'}</td>
              </tr>

              {/* System Configuration Metrics */}
              <tr>
                <td rowSpan={1} style={{ verticalAlign: 'top', fontWeight: 'bold', padding: '8px', borderBottom: '1px solid #eee', borderRight: '1px solid #eee' }}>System Prompts</td>
                <td style={{ padding: '8px', borderBottom: '1px solid #ddd' }}>Total System Prompts</td>
                <td style={{ textAlign: 'right', padding: '8px', borderBottom: '1px solid #ddd' }}>{metrics.totalSystemPrompts ?? 'N/A'}</td>
              </tr>
              
              {/* Invite Code Metrics */}
              <tr>
                <td rowSpan={3} style={{ verticalAlign: 'top', fontWeight: 'bold', padding: '8px', borderBottom: '1px solid #eee', borderRight: '1px solid #eee' }}>Invite Codes</td>
                <td style={{ padding: '8px', borderBottom: '1px solid #eee' }}>Total Admin Invite Codes</td>
                <td style={{ textAlign: 'right', padding: '8px', borderBottom: '1px solid #eee' }}>{metrics.totalAdminInviteCodes ?? 'N/A'}</td>
              </tr>
              <tr>
                <td style={{ padding: '8px', borderBottom: '1px solid #eee' }}>Used Admin Invite Codes</td>
                <td style={{ textAlign: 'right', padding: '8px', borderBottom: '1px solid #eee' }}>{metrics.usedAdminInviteCodes ?? 'N/A'}</td>
              </tr>
              <tr>
                <td style={{ padding: '8px', borderBottom: '1px solid #ddd' }}>Unused Admin Invite Codes</td>
                <td style={{ textAlign: 'right', padding: '8px', borderBottom: '1px solid #ddd' }}>{metrics.unusedAdminInviteCodes ?? 'N/A'}</td>
              </tr>
            </tbody>
          </table>
        ) : (
          <p>Loading metrics...</p>
        )}
      </section>

      {/* User Activity Section - Could be styled as two columns */}
      <section className="admin-major-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <h2 className="admin-major-section-title" style={{ margin: 0 }}>User Activity Overview</h2>
          <button onClick={() => setIsUserActivityVisible(!isUserActivityVisible)} className="admin-button admin-button-secondary">
            {isUserActivityVisible ? 'Hide' : 'Show'}
          </button>
        </div>
        {isUserActivityVisible && (
          <div className="admin-section-group" style={{ display: 'flex', gap: '20px', flexWrap: 'nowrap', alignItems: 'flex-start' }}>
            <section className="admin-section admin-section-users" style={{ flex: '1 1 0%', minWidth: '300px', maxHeight: '70vh', overflowY: 'auto' }}>
              <h2>Users</h2>
              <input
                type="text"
                placeholder="Filter users by Session ID..."
                className="admin-input"
                style={{ marginBottom: '15px', width: '100%', padding: '8px', boxSizing: 'border-box' }}
                value={userFilter}
                onChange={(e) => setUserFilter(e.target.value)}
              />
              {(() => {
                const filteredUsers = users.filter(user => 
                  user.id.toLowerCase().includes(userFilter.toLowerCase()) ||
                  (user.email && user.email.toLowerCase().includes(userFilter.toLowerCase()))
                );

                if (filteredUsers.length > 0) {
                  return (
                    <table className="admin-table" style={{ width: '100%'}}>
                      <thead>
                        <tr>
                          <th>User (Email / ID)</th>
                          <th>First Activity</th>
                          <th>Last Activity</th>
                          <th>Sessions</th>
                          <th>Messages</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredUsers.map(user => (
                          <tr key={user.id}>
                            <td>{user.email || user.id} {user.email && <span style={{fontSize: '0.8em', color: '#777'}}><br/>({user.id})</span>}</td>
                            <td>{user.firstActivity ? new Date(user.firstActivity).toLocaleString() : 'N/A'}</td>
                            <td>{user.lastActivity ? new Date(user.lastActivity).toLocaleString() : 'N/A'}</td>
                            <td style={{textAlign: 'center'}}>{user.sessionCount ?? 'N/A'}</td>
                            <td style={{textAlign: 'center'}}>{user.messageCount ?? 'N/A'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  );
                } else if (users.length > 0 && userFilter) {
                  return <p>No users match the filter "{userFilter}".</p>;
                } else {
                  return <p>No users found. Ensure the 'Users' collection contains user documents with emails linked by _id to chatOwnerID in 'ChatSessions'.</p>;
                }
              })()}
            </section>

        <section
          className="admin-section admin-section-chathistories" 
          style={{ flex: '2 1 0%', minWidth: '450px', display: 'flex', flexDirection: 'column', maxHeight: '70vh' }}
        >
          <h2>Chat Histories</h2>
          {chatHistories.length > 0 ? (
            <div style={{ display: 'flex', flexGrow: 1, gap: '10px', overflow: 'hidden', borderTop: '1px solid #ddd', paddingTop: '10px' }}>
              {/* Sessions List */}
              <div 
                className="chat-sessions-list" 
                style={{ flex: '1 0 250px', overflowY: 'auto', borderRight: '1px solid #ddd', paddingRight: '10px' }}
              >
                {chatHistories.map(history => (
                  <div
                    key={history._id}
                    onClick={() => setSelectedChatHistoryId(history._id)}
                    style={{
                      padding: '12px 10px', // Increased padding
                      borderBottom: '1px solid #eee',
                      cursor: 'pointer',
                      backgroundColor: selectedChatHistoryId === history._id ? 'rgba(0, 123, 255, 0.15)' : 'transparent', // More distinct selected color
                      borderRadius: '6px', // Slightly more rounded
                      marginBottom: '5px',
                      transition: 'background-color 0.2s ease, border-left 0.2s ease',
                      borderLeft: selectedChatHistoryId === history._id ? '4px solid #007bff' : '4px solid transparent', // Selected indicator
                    }}
                    onMouseEnter={(e) => { if (selectedChatHistoryId !== history._id) e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.04)'; }}
                    onMouseLeave={(e) => { if (selectedChatHistoryId !== history._id) e.currentTarget.style.backgroundColor = 'transparent'; }}
                    title={`Session: ${history.sessionId}\nCreated: ${new Date(history.createdAt).toLocaleString()}\nMessages: ${history.messages.length}`}
                  >
                    <strong style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '0.9em' }}>
                      ID: {history.sessionId}
                    </strong>
                    <em style={{ fontSize: '0.8em', color: '#555' }}>
                      {new Date(history.createdAt).toLocaleDateString()} - {history.messages.length} msgs
                    </em>
                  </div>
                ))}
              </div>
              {/* Messages View */}
              <div 
                className="chat-messages-view" 
                style={{ flex: '2 0 350px', overflowY: 'auto', padding: '0 10px' }}
              >
                {selectedChatHistoryId && currentChatMessages.length > 0 ? (
                  currentChatMessages.map((msg, index) => (
                    <div
                      key={index}
                      style={{
                        marginBottom: '12px',
                        padding: '10px 15px',
                        borderRadius: '18px',
                        maxWidth: '85%', // Slightly increased max-width
                        wordWrap: 'break-word',
                        color: '#222',
                        backgroundColor: msg.role === 'user' 
                                         ? '#DCF8C6' // Light green for user
                                         : (msg.role === 'assistant' 
                                            ? '#E9E9EB' // Light grey for assistant
                                            : '#FFF9C4'), // Light yellow for system
                        marginLeft: msg.role === 'user' ? 'auto' : '0',
                        marginRight: (msg.role === 'assistant' || msg.role === 'system') ? 'auto' : '0',
                        borderBottomLeftRadius: (msg.role === 'assistant' || msg.role === 'system') ? '5px' : '18px',
                        borderBottomRightRadius: msg.role === 'user' ? '5px' : '18px',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                        textAlign: msg.role === 'system' ? 'center' : 'left',
                      }}
                    >
                      <strong style={{ display: 'block', fontSize: '0.8em', color: '#333', marginBottom: '4px', textTransform: 'capitalize' }}>
                        {msg.role}
                        <span style={{ float: 'right', fontWeight: 'normal', color: '#777', fontSize: '0.9em' }}>
                          {new Date(msg.timestamp).toLocaleString()}
                        </span>
                      </strong>
                      <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{msg.content}</p>
                    </div>
                  ))
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#777', textAlign: 'center' }}>
                    <p>
                      {selectedChatHistoryId 
                        ? (chatHistories.find(h => h._id === selectedChatHistoryId)?.messages.length === 0 ? 'This session has no messages.' : 'Loading messages...') 
                        : 'Select a chat session from the left to view messages.'}
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <p>No chat histories found.</p>
          )}
        </section>
          </div>
        )}
      </section>

      {/* Administrative Tools Section - Could be styled as two columns */}
      <section className="admin-major-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <h2 className="admin-major-section-title" style={{ margin: 0 }}>Administrative Tools & Configuration</h2>
          <button onClick={() => setIsAdminToolsVisible(!isAdminToolsVisible)} className="admin-button admin-button-secondary">
            {isAdminToolsVisible ? 'Hide' : 'Show'}
          </button>
        </div>
        {isAdminToolsVisible && (
          <div className="admin-section-group" style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', marginTop: '0px' /* Adjusted from 20px as section has its own margin */ }}>
            <section className="admin-section admin-section-invitecodes" style={{ flex: 1, minWidth: '400px' }}>
              <h2>Manage Invite Codes</h2>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <button
                  onClick={handleGenerateInviteCode}
                  disabled={isGeneratingCode}
                  className="admin-button admin-button-primary"
                >
                  {isGeneratingCode ? 'Generating...' : 'Generate New Invite Code'}
                </button>
                {adminInviteCodes.some(c => c.isUsed) && ( // Show toggle only if there are used codes
                  <button
                    onClick={() => setShowUsedInviteCodes(!showUsedInviteCodes)}
                    className="admin-button admin-button-secondary"
                  >
                    {showUsedInviteCodes ? 'Hide Used Codes' : 'Show Used Codes'}
                  </button>
                )}
              </div>
              {newlyGeneratedCode && (
                <div className="success-message" style={{ marginBottom: '15px' }}>
                  <strong>New Code:</strong> {newlyGeneratedCode}
                </div>
              )}
              
              {(() => {
                const unusedCodes = adminInviteCodes.filter(code => !code.isUsed);
                const usedCodes = adminInviteCodes.filter(code => code.isUsed);
                const codesToDisplay = showUsedInviteCodes ? [...unusedCodes, ...usedCodes] : unusedCodes;
                // Sort codes: unused first, then by creation date (newest first for unused, oldest first for used if shown)
                codesToDisplay.sort((a, b) => {
                  if (!a.isUsed && b.isUsed) return -1;
                  if (a.isUsed && !b.isUsed) return 1;
                  if (!a.isUsed && !b.isUsed) return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(); // Newest unused first
                  // if (a.isUsed && b.isUsed) return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(); // Oldest used first - or keep newest
                  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(); // Keep newest for all for simplicity
                });


                if (codesToDisplay.length > 0) {
                  return (
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Code</th>
                          <th>Status</th>
                          <th>Created At</th>
                          <th>Used By</th>
                          <th>Used At</th>
                        </tr>
                      </thead>
                      <tbody>
                        {codesToDisplay.map(code => (
                          <tr key={code._id}>
                            <td>{code.code}</td>
                            <td className={code.isUsed ? 'status-used' : 'status-unused'}>
                              {code.isUsed ? 'Used' : 'Unused'}
                            </td>
                            <td>{new Date(code.createdAt).toLocaleString()}</td>
                            <td>{code.usedBy || 'N/A'}</td>
                            <td>{code.usedAt ? new Date(code.usedAt).toLocaleString() : 'N/A'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  );
                } else if (adminInviteCodes.length > 0 && !showUsedInviteCodes && usedCodes.length > 0) {
                  return <p>No unused invite codes found. {usedCodes.length} used codes are hidden.</p>;
                } else {
                  return <p>No admin-generated invite codes found.</p>;
                }
              })()}
            </section>

        <section className="admin-section admin-section-systemprompts" style={{ flex: 1, minWidth: '400px' }}>
          <h2>System Prompts</h2>
          <button onClick={() => handleOpenPromptForm()} className="admin-button admin-button-primary" style={{ marginBottom: '15px' }}>
            Add New Prompt
          </button>
          {promptError && <div className="error-message" style={{ marginBottom: '10px' }}>{promptError}</div>}
          
          {showPromptForm && (
            <div 
              className="admin-modal-backdrop" 
              style={{ 
                position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', 
                backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', 
                alignItems: 'center', justifyContent: 'center', zIndex: 1000 
              }}
            >
              <div 
                className="admin-modal-content" 
                style={{ 
                  background: 'rgba(40, 40, 60, 0.9)', // Darker, slightly transparent
                  padding: '25px', borderRadius: '8px', boxShadow: '0 5px 25px rgba(0,0,0,0.3)',
                  width: '100%', maxWidth: '500px', border: '1px solid rgba(255,255,255,0.1)'
                }}
              >
                <h3 style={{ marginTop: 0, marginBottom: '20px', fontSize: '1.5em', color: '#eee', textAlign: 'center' }}>
                  {editingPrompt ? 'Edit' : 'Add'} System Prompt
                </h3>
                <form onSubmit={handlePromptFormSubmit}>
                  <div className="admin-form-group" style={{ marginBottom: '15px' }}>
                    <label htmlFor="promptName" style={{ display: 'block', marginBottom: '5px', color: '#ccc', fontSize: '0.9em' }}>Name:</label>
                    <input
                      type="text"
                      id="promptName"
                      name="name"
                      value={promptFormData.name}
                      onChange={handlePromptFormChange}
                      required
                      className="admin-input" // Assuming this class provides some base styling
                      style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.2)', backgroundColor: 'rgba(255,255,255,0.05)', color: '#fff' }}
                    />
                  </div>
                  <div className="admin-form-group" style={{ marginBottom: '15px' }}>
                    <label htmlFor="promptText" style={{ display: 'block', marginBottom: '5px', color: '#ccc', fontSize: '0.9em' }}>Prompt Text:</label>
                    <textarea
                      id="promptText"
                      name="promptText"
                      value={promptFormData.promptText}
                      onChange={handlePromptFormChange}
                      required
                      rows={6}
                      className="admin-textarea" // Assuming this class provides some base styling
                      style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.2)', backgroundColor: 'rgba(255,255,255,0.05)', color: '#fff', minHeight: '100px' }}
                    />
                  </div>
                  <div className="admin-form-group" style={{ marginBottom: '20px', display: 'flex', alignItems: 'center' }}>
                    <input
                      type="checkbox"
                      id="promptIsPrimary" // Changed id
                      name="isPrimary" // Changed name
                      checked={promptFormData.isPrimary} // Changed checked value
                      onChange={handlePromptFormChange}
                      className="admin-checkbox" // Assuming this class provides some base styling
                      style={{ marginRight: '8px', width: '16px', height: '16px' }}
                    />
                    <label htmlFor="promptIsPrimary" style={{ color: '#ccc', fontSize: '0.9em', cursor: 'pointer' }}>Set as Primary</label> {/* Changed label text */}
                  </div>
                  <div className="admin-form-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    <button type="button" className="admin-button admin-button-secondary" onClick={() => setShowPromptForm(false)} disabled={promptLoading} style={{ padding: '10px 15px' }}>
                      Cancel
                    </button>
                    <button type="submit" className="admin-button admin-button-primary" disabled={promptLoading} style={{ padding: '10px 15px' }}>
                      {promptLoading ? 'Saving...' : (editingPrompt ? 'Update Prompt' : 'Add Prompt')}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {systemPrompts.length > 0 ? (
            <ul className="admin-list">
              {systemPrompts.map(prompt => (
                <li key={prompt.id} className="admin-list-item" style={{ backgroundColor: prompt.isPrimary ? 'rgba(90, 90, 130, 0.9)' : 'rgba(50, 50, 70, 0.8)'}}> {/* Changed isActive to isPrimary and adjusted color for primary */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <strong style={{ fontSize: '1.1em' }}>{prompt.name}</strong>
                    <span 
                        className={prompt.isPrimary ? 'status-primary' : 'status-not-primary'} // Changed class names
                        style={{ cursor: 'pointer', padding: '3px 6px', borderRadius: '3px', fontWeight: prompt.isPrimary ? 'bold' : 'normal' }} // Style adjustments
                        onClick={() => handleTogglePromptPrimary(prompt)} // Changed handler
                        title={prompt.isPrimary ? "This is the primary prompt. Click to try to unmark (another must be primary)." : "Set as primary prompt"} // Changed title
                    >
                      {prompt.isPrimary ? 'Primary' : 'Set as Primary'} {/* Changed text */}
                    </span>
                  </div>
                  <p style={{ whiteSpace: 'pre-wrap', backgroundColor: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '3px', border: '1px solid rgba(255,255,255,0.1)', margin: '10px 0' }}>{prompt.promptText}</p>
                  <em style={{ fontSize: '0.9em', color: '#ccc' }}>
                    Created: {new Date(prompt.createdAt).toLocaleString()} |
                    Updated: {new Date(prompt.updatedAt).toLocaleString()}
                  </em>
                  <div className="prompt-actions" style={{ marginTop: '10px' }}>
                    <button onClick={() => handleOpenPromptForm(prompt)} className="admin-button admin-button-secondary admin-button-small" style={{ marginRight: '5px' }}>Edit</button>
                    <button onClick={() => handleDeletePrompt(prompt.id)} className="admin-button admin-button-danger admin-button-small" disabled={promptLoading}>Delete</button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p>No system prompts found or loaded. Click "Add New Prompt" to create one.</p>
          )}
        </section>
          </div>
        )}
      </section>
    </div>
  );
}
// Removed duplicated loading, error, and return blocks from here and the merge conflict marker.
