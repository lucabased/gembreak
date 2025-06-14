import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { Collection, Document, ObjectId } from 'mongodb';

// Interface for the document structure from the 'chat_sessions' collection
interface ChatSessionDocument extends Document {
  _id: string; // Session ID (already a string in your example)
  chatOwnerID: ObjectId;
  chatHistory: Array<{
    role: string; // 'user', 'assistant' as per your example
    content: string;
    timestamp: Date;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

// Interface for the data structure expected by the frontend dashboard
interface FrontendChatHistory {
  _id: string; // Session ID
  sessionId: string; // Session ID
  // userId?: string; // Optional: if you want to pass chatOwnerID as string
  messages: Array<{
    role: 'user' | 'assistant' | 'system'; // Frontend expects these roles
    content: string;
    timestamp: Date;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

export async function GET() {
  // Middleware should have already verified admin authentication
  try {
    const { db } = await connectToDatabase();
    // Corrected collection name based on mongodb.ts
    const chatSessionsCollection: Collection<ChatSessionDocument> = db.collection<ChatSessionDocument>('ChatSessions');

    // Fetch all documents from the chat_sessions collection
    // Sort by most recently updated
    const allSessions: ChatSessionDocument[] = await chatSessionsCollection.find({})
      .sort({ updatedAt: -1 })
      .toArray();

    // Format the sessions to match the FrontendChatHistory interface
    const formattedHistories: FrontendChatHistory[] = allSessions.map(sessionDoc => {
      const formattedMessages = sessionDoc.chatHistory.map(msg => {
        let finalRole: 'user' | 'assistant' | 'system' = 'system'; // Default role
        if (msg.role === 'user') {
          finalRole = 'user';
        } else if (msg.role === 'assistant' || msg.role === 'model') { // Handle 'model' if it might appear
          finalRole = 'assistant';
        }
        // Any other roles from DB would default to 'system' or need specific mapping
        return {
          role: finalRole,
          content: msg.content,
          timestamp: msg.timestamp,
        };
      });

      return {
        _id: sessionDoc._id, // This is the session ID string
        sessionId: sessionDoc._id, // Duplicate for clarity if frontend uses both
        // userId: sessionDoc.chatOwnerID.toString(), // Optional: if needed by frontend
        messages: formattedMessages,
        createdAt: sessionDoc.createdAt,
        updatedAt: sessionDoc.updatedAt,
      };
    });

    return NextResponse.json({ success: true, histories: formattedHistories });
  } catch (error) {
    console.error('Failed to fetch chat histories:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ success: false, message: `Failed to fetch chat histories: ${errorMessage}` }, { status: 500 });
  }
}
