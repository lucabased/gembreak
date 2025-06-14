import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb'; // Assuming this is correctly set up
import { Collection, ObjectId, WithId, Filter } from 'mongodb';

// Interface for data stored in MongoDB (uses _id)
interface SystemPromptDocument {
  _id?: ObjectId; // Optional because it's not there before insertion
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
  try {
    const promptsCollection = await getPromptsCollection();
    const systemPromptDocs = await promptsCollection.find({}).sort({ createdAt: -1 }).toArray();
    const systemPrompts: SystemPromptAPI[] = systemPromptDocs.map(mapDocumentToAPI);
    return NextResponse.json({ success: true, systemPrompts });
  } catch (error) {
    console.error('Failed to fetch system prompts:', error);
    return NextResponse.json({ success: false, message: 'Failed to fetch system prompts' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { name, promptText, isPrimary = false } = await req.json() as Partial<SystemPromptAPI>; // Changed isActive to isPrimary

    if (!name || !promptText) {
      return NextResponse.json({ success: false, message: 'Name and promptText are required' }, { status: 400 });
    }

    const promptsCollection = await getPromptsCollection();
    const now = new Date();
    
    // If this prompt is being set to primary, ensure all others are not primary
    if (isPrimary === true) {
      await promptsCollection.updateMany(
        { isPrimary: true } as Filter<SystemPromptDocument>,
        { $set: { isPrimary: false, updatedAt: now } }
      );
    }

    const newPromptDocument: SystemPromptDocument = {
      name,
      promptText,
      isPrimary, // Changed from isActive
      createdAt: now,
      updatedAt: now,
    };

    const result = await promptsCollection.insertOne(newPromptDocument);
    
    if (!result.insertedId) {
        throw new Error('Failed to insert prompt into database.');
    }
    
    // If no other prompt is primary, and this one wasn't explicitly set, make it primary.
    // This ensures there's always at least one primary prompt if prompts exist.
    // However, this might be better handled by UI or a separate "set primary" action.
    // For now, let's ensure if it's the *only* prompt, it becomes primary.
    const count = await promptsCollection.countDocuments();
    if (count === 1 && !newPromptDocument.isPrimary) {
        newPromptDocument.isPrimary = true;
        newPromptDocument.updatedAt = new Date(); // Update timestamp
        await promptsCollection.updateOne(
            { _id: result.insertedId },
            { $set: { isPrimary: true, updatedAt: newPromptDocument.updatedAt } }
        );
    }


    const createdPrompt = mapDocumentToAPI({ ...newPromptDocument, _id: result.insertedId });

    return NextResponse.json({ success: true, systemPrompt: createdPrompt }, { status: 201 });
  } catch (error: any) {
    console.error('Failed to create system prompt:', error);
    return NextResponse.json({ success: false, message: error.message || 'Failed to create system prompt' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const { id, name, promptText, isPrimary } = await req.json() as Partial<SystemPromptAPI> & { id: string }; // Changed isActive to isPrimary

    if (!id) {
      return NextResponse.json({ success: false, message: 'Prompt ID is required for update' }, { status: 400 });
    }

    if (name === undefined && promptText === undefined && isPrimary === undefined) { // Changed isActive to isPrimary
      return NextResponse.json({ success: false, message: 'No update fields provided' }, { status: 400 });
    }
    
    let objectId: ObjectId;
    try {
        objectId = new ObjectId(id);
    } catch (e) {
        return NextResponse.json({ success: false, message: 'Invalid Prompt ID format' }, { status: 400 });
    }


    const promptsCollection = await getPromptsCollection();
    const now = new Date();
    const updateFields: Partial<SystemPromptDocument> = { updatedAt: now };

    if (name !== undefined) updateFields.name = name;
    if (promptText !== undefined) updateFields.promptText = promptText;
    
    // If isPrimary is being explicitly set (either true or false)
    if (isPrimary !== undefined) { // Changed isActive to isPrimary
      updateFields.isPrimary = isPrimary; // Changed from isActive
      // If this prompt is being set to primary, ensure all others are not primary
      if (isPrimary === true) {
        await promptsCollection.updateMany(
          { _id: { $ne: objectId }, isPrimary: true } as Filter<SystemPromptDocument>, // Changed isActive to isPrimary
          { $set: { isPrimary: false, updatedAt: now } } // Changed isActive to isPrimary
        );
      } else {
        // If this prompt is being set to not primary, ensure at least one other prompt is primary.
        // If no other prompt is primary, make this one primary (cannot un-primary the last primary prompt).
        // This logic might be complex if we allow unsetting primary.
        // A simpler rule: you can't set isPrimary to false if it's the only primary prompt.
        const currentDoc = await promptsCollection.findOne({ _id: objectId } as Filter<SystemPromptDocument>);
        if (currentDoc?.isPrimary) { // if it was primary
            const primaryCount = await promptsCollection.countDocuments({ isPrimary: true, _id: { $ne: objectId } } as Filter<SystemPromptDocument>);
            if (primaryCount === 0) {
                // This is the only primary prompt, and user tries to set it to false. Prevent or re-set.
                // For now, let's prevent this by re-asserting it as primary.
                // Or, return an error. Let's return an error for clarity.
                 return NextResponse.json({ success: false, message: 'Cannot unmark the only primary system prompt. Set another prompt as primary first.' }, { status: 400 });
            }
        }
      }
    }

    const result = await promptsCollection.findOneAndUpdate(
      { _id: objectId } as Filter<SystemPromptDocument>,
      { $set: updateFields },
      { returnDocument: 'after' }
    );

    if (!result) {
      // If result is null, it means the document was not found.
      // findOneAndUpdate returns the modified document or null if no document matched the filter.
      return NextResponse.json({ success: false, message: 'System prompt not found' }, { status: 404 });
    }
    
    // The result from findOneAndUpdate is the updated document, so it's safe to cast.
    const updatedPrompt = mapDocumentToAPI(result as WithId<SystemPromptDocument>);

    return NextResponse.json({ success: true, systemPrompt: updatedPrompt });
  } catch (error: any) {
    console.error('Failed to update system prompt:', error);
    return NextResponse.json({ success: false, message: error.message || 'Failed to update system prompt' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, message: 'Prompt ID is required for deletion' }, { status: 400 });
    }
    
    let objectId: ObjectId;
    try {
        objectId = new ObjectId(id);
    } catch (e) {
        return NextResponse.json({ success: false, message: 'Invalid Prompt ID format' }, { status: 400 });
    }

    const promptsCollection = await getPromptsCollection();
    const result = await promptsCollection.deleteOne({ _id: objectId } as Filter<SystemPromptDocument>);

    if (result.deletedCount === 0) {
      return NextResponse.json({ success: false, message: 'System prompt not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: 'System prompt deleted successfully' });
  } catch (error: any) {
    console.error('Failed to delete system prompt:', error);
    return NextResponse.json({ success: false, message: error.message || 'Failed to delete system prompt' }, { status: 500 });
  }
}
