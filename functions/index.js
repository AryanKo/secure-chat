// In functions/index.js

const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

// This is the secure backend function to accept a friend request.
exports.acceptFriendRequest = functions.https.onCall(async (data, context) => {
  // 1. Authenticate the user calling this function.
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "You must be logged in to accept a friend request."
    );
  }

  const receiverId = context.auth.uid; // The user who is accepting.
  const senderId = data.senderId;       // The user who sent the request.
  const senderUsername = data.senderUsername; // The sender's username.

  if (!senderId || !senderUsername) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Missing senderId or senderUsername."
    );
  }

  // 2. Get the receiver's (current user's) profile to get their username.
  const receiverProfileRef = db.doc(`artifacts/chatconnect-app/users/${receiverId}/profile/userProfile`);
  const receiverProfileSnap = await receiverProfileRef.get();
  if (!receiverProfileSnap.exists) {
     throw new functions.https.HttpsError("not-found", "Your profile was not found.");
  }
  const receiverUsername = receiverProfileSnap.data().username;

  // 3. Define all the document paths needed for the transaction.
  const canvasAppId = "chatconnect-app"; // Your Project ID
  const currentUserFriendsRef = db.doc(`artifacts/${canvasAppId}/users/${receiverId}/friends/${senderId}`);
  const senderFriendsRef = db.doc(`artifacts/${canvasAppId}/users/${senderId}/friends/${receiverId}`);
  const incomingRequestDocRef = db.doc(`artifacts/${canvasAppId}/users/${receiverId}/friendRequests/${senderId}`);
  const senderOutgoingRequestDocRef = db.doc(`artifacts/${canvasAppId}/users/${senderId}/outgoingFriendRequests/${receiverId}`);

  // 4. Use a batch write to ensure all database changes happen at once or not at all.
  const batch = db.batch();

  // Add each other as friends.
  batch.set(currentUserFriendsRef, {
    userId: senderId,
    username: senderUsername,
    addedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  batch.set(senderFriendsRef, {
    userId: receiverId,
    username: receiverUsername,
    addedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // Delete the pending requests.
  batch.delete(incomingRequestDocRef);
  batch.delete(senderOutgoingRequestDocRef);

  // 5. Commit the batch write.
  await batch.commit();

  return { success: true, message: `You are now friends with ${senderUsername}.` };
});