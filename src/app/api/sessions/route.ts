import { NextRequest, NextResponse } from 'next/server';
import { getChatSessionsCollection, connectToDatabase } from '@/lib/mongodb'; // connectToDatabase for user_hidden_chats
import { ChatSession } from '@/lib/types/ChatSession';
import { ObjectId, Collection, Db } from 'mongodb';

interface UserHiddenChat { // Keep this for now if user_hidden_chats is still used
  userId: string;
  sessionId: string; // This is a string ID
  hiddenAt: Date;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const userIdString = url.searchParams.get('userId');

  if (!userIdString) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  }

  let userIdObjectId: ObjectId;
  try {
    userIdObjectId = new ObjectId(userIdString);
  } catch (error) {
    return NextResponse.json({ error: 'Invalid userId format' }, { status: 400 });
  }

  try {
    const chatSessionsCollection = await getChatSessionsCollection();
    const { db } = await connectToDatabase(); // For user_hidden_chats
    const userHiddenChatsCollection: Collection<UserHiddenChat> = db.collection<UserHiddenChat>('user_hidden_chats');

    // Fetch hidden sessionIds (strings) for the user
    const hiddenChats = await userHiddenChatsCollection.find({ userId: userIdString }).toArray();
    // These are already strings, and ChatSession._id is now a string.
    const hiddenSessionStringIds = hiddenChats.map(chat => chat.sessionId);

    // Fetch chat sessions owned by the user, excluding hidden ones
    const userChatSessions = await chatSessionsCollection.find({
      chatOwnerID: userIdObjectId,
      _id: { $nin: hiddenSessionStringIds } // Exclude hidden sessions using string IDs
    })
    .sort({ updatedAt: -1 }) // Sort by most recent activity
    .project({ // Project to the desired format
      _id: 0, // Exclude MongoDB's _id
      id: '$_id', // Session ID
      title: 1, // Include title
      lastActivity: '$updatedAt', // Use updatedAt as lastActivity
      // chatOwnerID: 1, // Optionally include for debugging or client-side use
      // createdAt: 1,
    })
    .toArray();
    
    return NextResponse.json(userChatSessions, { status: 200 });
  } catch (error) {
    console.error("Error in GET /api/sessions:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to fetch sessions";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
