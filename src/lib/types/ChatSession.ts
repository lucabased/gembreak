import { ObjectId } from 'mongodb';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'; // Role of the message sender
  content: string; // Content of the message
  timestamp: Date; // Timestamp of the message
  // Potentially other metadata like message ID, ratings, etc.
}

export interface ChatSession {
  _id?: string; // Can be a client-generated UUID or other string ID
  chatOwnerID: ObjectId; // Reference to the User's _id in the Users collection
  chatHistory: ChatMessage[]; // Array of chat messages
  createdAt: Date; // Timestamp of when the session was created
  updatedAt: Date; // Timestamp of when the session was last updated
  title?: string; // Optional title for the chat session, e.g., "My Trip to Paris"
  // Other fields like summary, tags, visibility status, active/archived status, etc., can be added here as needed.
}
