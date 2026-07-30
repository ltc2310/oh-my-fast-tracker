/**
 * Port for sending notifications to users on their messaging channel.
 * Used by application use cases (e.g. ApproveUser) to inform users
 * of access status changes without coupling to a specific channel implementation.
 */
export interface NotificationSender {
  sendMessage(channelUserId: string, text: string): Promise<void>;
}
