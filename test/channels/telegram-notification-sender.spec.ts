import { TelegramNotificationSender } from '../../src/infrastructure/channels/TelegramNotificationSender';
import { ChannelAdapter } from '../../src/domain/ports/ChannelAdapter';

describe('TelegramNotificationSender', () => {
  let sender: TelegramNotificationSender;
  let mockChannelAdapter: jest.Mocked<ChannelAdapter>;

  beforeEach(() => {
    mockChannelAdapter = {
      onMessage: jest.fn(),
      sendText: jest.fn().mockResolvedValue(undefined),
      sendLink: jest.fn().mockResolvedValue(undefined),
      start: jest.fn().mockResolvedValue(undefined),
    };

    sender = new TelegramNotificationSender(mockChannelAdapter);
  });

  it('should delegate sendMessage to channelAdapter.sendText', async () => {
    await sender.sendMessage('12345', 'Hello!');

    expect(mockChannelAdapter.sendText).toHaveBeenCalledWith('12345', 'Hello!');
    expect(mockChannelAdapter.sendText).toHaveBeenCalledTimes(1);
  });

  it('should propagate errors from channelAdapter.sendText', async () => {
    mockChannelAdapter.sendText.mockRejectedValue(new Error('Network error'));

    await expect(sender.sendMessage('12345', 'Hello!')).rejects.toThrow('Network error');
  });

  it('should pass through the exact userId and text without modification', async () => {
    const userId = '9876543210';
    const text = '🎉 Bạn đã được duyệt! Bây giờ bạn có thể sử dụng bot.';

    await sender.sendMessage(userId, text);

    expect(mockChannelAdapter.sendText).toHaveBeenCalledWith(userId, text);
  });
});
