import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { Collection } from 'mongodb';
import { canUserAccessSession } from '../../../../../lib/sessionUtils'; // Corrected path

interface UserHiddenChat {
  userId: string;
  sessionId: string;
  hiddenAt: Date;
}

export async function POST(req: NextRequest) {
  try {
    const { sessionId, userId } = await req.json();

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
    }
    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    const { db } = await connectToDatabase(); // db instance for userHiddenChatsCollection

    // Verify user has access to this session (is the creator)
    // The 'db' parameter for canUserAccessSession is deprecated but still accepted.
    // Passing null or the actual db instance are both options.
    // Since canUserAccessSession now uses getChatSessionsCollection, db is not strictly used by it for ChatSession access.
    const hasAccess = await canUserAccessSession(null, userId, sessionId); 
    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied or session not found for user' }, { status: 403 });
    }

    const userHiddenChatsCollection: Collection<UserHiddenChat> = db.collection<UserHiddenChat>('user_hidden_chats');

    // Check if the chat is already hidden for this user
    const existingHiddenChat = await userHiddenChatsCollection.findOne({ userId, sessionId });
    if (existingHiddenChat) {
      return NextResponse.json({ message: 'Chat already hidden' }, { status: 200 });
    }

    // Add to hidden chats
    const result = await userHiddenChatsCollection.insertOne({
      userId,
      sessionId,
      hiddenAt: new Date(),
    });

    if (result.insertedId) {
      return NextResponse.json({ message: 'Chat hidden successfully' }, { status: 200 });
    } else {
      return NextResponse.json({ error: 'Failed to hide chat' }, { status: 500 });
    }

  } catch (error) {
    console.error("Error in POST /api/user/chats/hide:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to hide chat";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
