import { ObjectId, Db } from 'mongodb'; // Db might still be passed if other utils use it, or can be removed if not.
import { getChatSessionsCollection } from './mongodb'; // Assuming mongodb.ts is in the same lib folder

/**
 * Checks if a user can access a specific chat session based on ownership.
 * Access is granted if the user is the chatOwnerID of the ChatSession.
 *
 * @param userIdString The ID string of the user attempting to access the session.
 * @param sessionIdString The ID string of the ChatSession.
 * @param db Deprecated: The MongoDB database instance. No longer directly used, will use getChatSessionsCollection.
 * @returns True if the user can access the session, false otherwise.
 */
export async function canUserAccessSession(db: Db | null, userIdString: string, sessionIdString: string): Promise<boolean> {
  if (!userIdString || !sessionIdString) {
    console.warn('canUserAccessSession called with invalid userIdString or sessionIdString');
    return false;
  }

  // sessionIdString is used directly as _id (string)
  let userIdObjectId: ObjectId; // for chatOwnerID

  try {
    userIdObjectId = new ObjectId(userIdString);
  } catch (error) {
    // This catch is now only for userIdString failing ObjectId conversion
    console.error('Invalid ObjectId format for userId in canUserAccessSession:', error);
    return false;
  }

  try {
    const chatSessionsCollection = await getChatSessionsCollection();
    const chatSession = await chatSessionsCollection.findOne({
      _id: sessionIdString, // Use sessionIdString for _id
      chatOwnerID: userIdObjectId,
    });

    if (chatSession) {
      return true; // User is the owner
    }

    // console.log(`User ${userIdString} does not own or session ${sessionIdString} not found. Access denied.`);
    return false;
  } catch (error) {
    console.error(`Error in canUserAccessSession for session ${sessionIdString}, user ${userIdString}:`, error);
    return false; // Deny access on error to be safe
  }
}
