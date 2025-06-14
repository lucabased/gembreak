import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { Collection, WithId, ObjectId } from 'mongodb';

// Interface for data stored in MongoDB (uses _id)
interface SystemPromptDocument {
  _id?: ObjectId;
  name: string;
  promptText: string;
  isPrimary: boolean; // Changed from isActive
  createdAt: Date;
  updatedAt: Date;
}

// Interface for data sent/received by API (uses id as string)
export interface SystemPromptAPI {
  id: string;
  name: string;
  promptText: string;
  isPrimary: boolean; // Changed from isActive
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
}

// Helper to get the collection
async function getPromptsCollection(): Promise<Collection<SystemPromptDocument>> {
  const { db } = await connectToDatabase();
  return db.collection<SystemPromptDocument>('system_prompts');
}

// Helper to convert DB document to API response format
function mapDocumentToAPI(doc: WithId<SystemPromptDocument>): SystemPromptAPI {
  return {
    id: doc._id.toHexString(),
    name: doc.name,
    promptText: doc.promptText,
    isPrimary: doc.isPrimary, // Changed from isActive
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export async function GET() {
  // This route is for users to fetch all available system prompts (personas).
  // The 'isPrimary' flag indicates the default prompt.
  // Authentication might be handled by middleware.
  try {
    const promptsCollection = await getPromptsCollection();
    // Fetch all system prompts, sorted by name.
    // The client can then use the isPrimary flag to identify the default.
    const allSystemPromptDocs = await promptsCollection.find({}).sort({ name: 1 }).toArray();
    const allSystemPrompts: SystemPromptAPI[] = allSystemPromptDocs.map(mapDocumentToAPI);
    
    return NextResponse.json({ success: true, systemPrompts: allSystemPrompts });
  } catch (error) {
    console.error('Failed to fetch system prompts:', error);
    return NextResponse.json({ success: false, message: 'Failed to fetch system prompts' }, { status: 500 });
  }
}
