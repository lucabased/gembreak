import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { Collection, Document, ObjectId } from 'mongodb';

// Interface for the document structure you provided
interface ChatSessionDocument extends Document {
  _id: string; // Session ID
  chatOwnerID: ObjectId; // User ID
  chatHistory: Array<{
    role: string;
    content: string;
    timestamp: Date;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

// Interface for the data structure expected by the frontend
interface UserAdminView {
  id: string; // User ID as string
  email?: string; // User's email
  firstActivity?: Date;
  lastActivity?: Date;
  sessionCount?: number;
  messageCount?: number;
}

export async function GET() {
  // Middleware should have already verified admin authentication
  try {
    const { db } = await connectToDatabase();
    // Corrected collection name based on mongodb.ts
    const chatSessionsCollection: Collection<ChatSessionDocument> = db.collection<ChatSessionDocument>('ChatSessions');

    const aggregationPipeline = [
      {
        $match: {
          chatOwnerID: { $ne: null } // Ensure chatOwnerID exists
        }
      },
      {
        $group: {
          _id: "$chatOwnerID", // Group by user ID (which is an ObjectId)
          firstActivity: { $min: "$createdAt" },
          lastActivity: { $max: "$updatedAt" },
          sessionCount: { $sum: 1 },
          totalMessages: { $sum: { $size: "$chatHistory" } }
        }
      },
      // Lookup user details from the 'Users' collection
      {
        $lookup: {
          from: "Users", // Assuming the collection is named 'Users'
          localField: "_id", // _id from the $group stage (chatOwnerID)
          foreignField: "_id", // _id in the 'Users' collection
          as: "userDetails"
        }
      },
      {
        $unwind: { // Unwind the userDetails array, handle cases where user might not be found
          path: "$userDetails",
          preserveNullAndEmptyArrays: true // Keep users even if no match in Users collection
        }
      },
      {
        $project: {
          _id: 0,
          id: { $toString: "$_id" }, // User ID (from chatOwnerID)
          email: "$userDetails.email", // Get email from looked-up user details
          firstActivity: "$firstActivity",
          lastActivity: "$lastActivity",
          sessionCount: "$sessionCount",
          messageCount: "$totalMessages"
        }
      },
      {
        $sort: { lastActivity: -1 }
      }
    ];

    const usersData: UserAdminView[] = await chatSessionsCollection.aggregate<UserAdminView>(aggregationPipeline).toArray();

    return NextResponse.json({ success: true, users: usersData });
  } catch (error) {
    console.error('Failed to fetch users:', error);
    // It's good practice to log the specific error
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ success: false, message: `Failed to fetch users: ${errorMessage}` }, { status: 500 });
  }
}
