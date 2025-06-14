import { NextRequest, NextResponse } from 'next/server';
import { getChatSessionsCollection } from '@/lib/mongodb';
import { ChatSession, ChatMessage } from '@/lib/types/ChatSession';
import { ObjectId } from 'mongodb';

// interface UserHiddenChat {
//   userId: string;
//   sessionId: string;
//   hiddenAt: Date;
// }

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const sessionIdString = url.searchParams.get('sessionId');
  const userIdString = url.searchParams.get('userId');

  if (!sessionIdString) {
    return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
  }
  if (!userIdString) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  }

  // sessionIdString is used directly as _id (string)
  let ownerId: ObjectId; // for chatOwnerID

  try {
    ownerId = new ObjectId(userIdString);
  } catch (error) {
    // This catch is now only for userIdString failing ObjectId conversion
    return NextResponse.json({ error: 'Invalid userId format' }, { status: 400 });
  }

  try {
    const chatSessionsCollection = await getChatSessionsCollection();
    
    const chatSession = await chatSessionsCollection.findOne({ 
      _id: sessionIdString, // Use sessionIdString for _id
      chatOwnerID: ownerId 
    });

    if (!chatSession) {
      // If the session is not found (either doesn't exist or user is not the owner),
      // return an empty array with a 200 status.
      // This treats a new, unsaved chat or an inaccessible chat as an empty history for the user.
      return NextResponse.json([], { status: 200 });
    }

    // const userHiddenChatsCollection: Collection<UserHiddenChat> = db.collection<UserHiddenChat>('user_hidden_chats');
    // // Check if this chat is hidden for the user
    // const isHidden = await userHiddenChatsCollection.findOne({ userId: userIdString, sessionId: sessionIdString });
    // if (isHidden) {
    //   // If hidden, return empty array, as if the chat doesn't exist for this user
    //   return NextResponse.json([], { status: 200 }); 
    // }

    // Messages are now part of the chatSession document
    // Sort chat history by timestamp if not already guaranteed by insertion order
    const sortedChatHistory = chatSession.chatHistory.sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
    );
    
    return NextResponse.json(sortedChatHistory, { status: 200 });
  } catch (error) {
    console.error("Error in GET /api/chat_history:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to fetch chat history";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
