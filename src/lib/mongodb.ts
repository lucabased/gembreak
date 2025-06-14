import { MongoClient, Db, Collection } from 'mongodb';
import { ChatSession } from './types/ChatSession'; // Import the new type

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME || 'chat_app'; // Or use a specific DB name from the URI if provided

if (!uri) {
  throw new Error('Please define the MONGODB_URI environment variable inside .env.local');
}

let cachedClient: MongoClient | null = null;
let cachedDb: Db | null = null;

export async function connectToDatabase(): Promise<{ client: MongoClient, db: Db }> {
  if (cachedClient && cachedDb) {
    return { client: cachedClient, db: cachedDb };
  }

  const client = new MongoClient(uri!); // Non-null assertion as we check uri above

  try {
    await client.connect();
    const db = client.db(dbName);

    cachedClient = client;
    cachedDb = db;

    console.log(`Successfully connected to MongoDB database: ${db.databaseName}`);
    return { client, db };
  } catch (error) {
    console.error('Failed to connect to MongoDB', error);
    // If connection fails, ensure we don't cache a bad client/db
    cachedClient = null;
    cachedDb = null;
    throw error; // Re-throw error to be handled by caller
  }
}

// Optional: Graceful shutdown
// process.on('SIGINT', async () => {
//   if (cachedClient) {
//     await cachedClient.close();
//     console.log('MongoDB connection closed due to app termination');
//     process.exit(0);
//   }
// });

export async function getChatSessionsCollection(): Promise<Collection<ChatSession>> {
  const { db } = await connectToDatabase();
  return db.collection<ChatSession>('ChatSessions');
}

// You might want to define an interface for your User collection as well
// export async function getUsersCollection() {
//   const { db } = await connectToDatabase();
//   return db.collection('Users'); // Replace 'Users' with your actual users collection name
// }
