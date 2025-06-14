import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { Collection, Document } from 'mongodb';

interface ChatHistory {
  _id: string;
  sessionId: string;
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string; timestamp?: Date | string }>;
  createdAt: Date | string;
  updatedAt: Date | string;
}

// Define interfaces for other collections we'll query
interface SystemPrompt extends Document {
  name: string;
  promptText: string;
  isPrimary: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface AdminInviteCode extends Document {
  code: string;
  isUsed: boolean;
  createdAt: Date;
  createdBy: string; // Assuming admin user ID or name
  usedBy?: string | null; // User ID or session ID
  usedAt?: Date | null;
}


export async function GET() {
  // Middleware should have already verified admin authentication
  try {
    const { db } = await connectToDatabase();
    const chatHistoriesCollection: Collection<ChatHistory> = db.collection<ChatHistory>('chat_histories');
    const systemPromptsCollection: Collection<SystemPrompt> = db.collection<SystemPrompt>('system_prompts');
    const adminInviteCodesCollection: Collection<AdminInviteCode> = db.collection<AdminInviteCode>('admin_invite_codes');

    // Existing metrics
    const totalSessions = await chatHistoriesCollection.distinct('sessionId').then(sessions => sessions.length);
    
    const messageAggregationResult = await chatHistoriesCollection.aggregate([
      {
        $group: {
          _id: null,
          totalMessages: { $sum: { $size: "$messages" } }
        }
      }
    ]).toArray();

    const totalMessages = messageAggregationResult.length > 0 ? messageAggregationResult[0].totalMessages : 0;
    const averageMessagesPerSession = totalSessions > 0 ? (totalMessages / totalSessions) : 0;

    // New metrics
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - (24 * 60 * 60 * 1000));
    const sevenDaysAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));

    // Active sessions in the last 24 hours
    // We need to find sessions that have at least one message with a timestamp in the last 24 hours.
    // This is a bit tricky as timestamps are within an array.
    // A simpler proxy might be chat_histories updated in the last 24 hours, assuming updatedAt is touched on new messages.
    // Or, more accurately, query for histories where any message.timestamp is recent.
    // For simplicity, let's assume `updatedAt` on the ChatHistory document is a good proxy for recent activity.
    const activeSessions24h = await chatHistoriesCollection.distinct('sessionId', {
      updatedAt: { $gte: twentyFourHoursAgo }
    }).then(sessions => sessions.length);

    const activeSessions7d = await chatHistoriesCollection.distinct('sessionId', {
      updatedAt: { $gte: sevenDaysAgo }
    }).then(sessions => sessions.length);
    
    const totalSystemPrompts = await systemPromptsCollection.countDocuments();
    
    const totalAdminInviteCodes = await adminInviteCodesCollection.countDocuments();
    const usedAdminInviteCodes = await adminInviteCodesCollection.countDocuments({ isUsed: true });
    const unusedAdminInviteCodes = await adminInviteCodesCollection.countDocuments({ isUsed: false });

    const metrics = {
      totalSessions,
      totalMessages,
      averageMessagesPerSession: parseFloat(averageMessagesPerSession.toFixed(2)),
      activeSessions24h,
      activeSessions7d,
      totalSystemPrompts,
      totalAdminInviteCodes,
      usedAdminInviteCodes,
      unusedAdminInviteCodes,
    };

    return NextResponse.json({ success: true, metrics });
  } catch (error) {
    console.error('Failed to fetch metrics:', error);
    return NextResponse.json({ success: false, message: 'Failed to fetch metrics' }, { status: 500 });
  }
}
