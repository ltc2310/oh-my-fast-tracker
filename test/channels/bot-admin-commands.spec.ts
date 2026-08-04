import { AdminBotHandler } from "../../src/infrastructure/channels/AdminBotHandler";
import { ChannelAdapter } from "../../src/domain/ports/ChannelAdapter";
import { UserRepository } from "../../src/domain/ports/UserRepository";
import { TransactionRepository } from "../../src/domain/ports/TransactionRepository";
import { ApproveUser } from "../../src/application/usecases/ApproveUser";
import { BlockUser } from "../../src/application/usecases/BlockUser";
import { User } from "../../src/domain/entities/User";

describe("AdminBotHandler", () => {
  let handler: AdminBotHandler;
  let mockChannelAdapter: jest.Mocked<Pick<ChannelAdapter, "sendText">>;
  let mockUserRepository: jest.Mocked<Pick<UserRepository, "findByStatus">>;
  let mockTransactionRepository: jest.Mocked<Pick<TransactionRepository, "findByUserAndDateRange">>;
  let mockApproveUser: jest.Mocked<Pick<ApproveUser, "execute">>;
  let mockBlockUser: jest.Mocked<Pick<BlockUser, "execute">>;

  const adminChatIds = ["admin-1", "admin-2"];

  const pendingUsers: User[] = [
    { id: "uuid-1", channel: "telegram", channelUserId: "111", channelUsername: "john", accessStatus: "pending", plan: "free", createdAt: new Date(2026, 7, 1) },
    { id: "uuid-2", channel: "telegram", channelUserId: "222", channelUsername: null, accessStatus: "pending", plan: "free", createdAt: new Date(2026, 7, 2) },
  ];

  beforeEach(() => {
    mockChannelAdapter = { sendText: jest.fn().mockResolvedValue(undefined) };
    mockUserRepository = { findByStatus: jest.fn().mockResolvedValue([]) };
    mockTransactionRepository = { findByUserAndDateRange: jest.fn().mockResolvedValue([]) };
    mockApproveUser = { execute: jest.fn() };
    mockBlockUser = { execute: jest.fn() };

    handler = new AdminBotHandler(
      { secret: "test", chatIds: adminChatIds },
      mockChannelAdapter as unknown as ChannelAdapter,
      mockUserRepository as unknown as UserRepository,
      mockTransactionRepository as unknown as TransactionRepository,
      mockApproveUser as unknown as ApproveUser,
      mockBlockUser as unknown as BlockUser,
    );
  });

  describe("isAdmin", () => {
    it("returns true for configured admin IDs", () => {
      expect(handler.isAdmin("admin-1")).toBe(true);
      expect(handler.isAdmin("admin-2")).toBe(true);
    });

    it("returns false for non-admin IDs", () => {
      expect(handler.isAdmin("random-user")).toBe(false);
    });
  });

  describe("isAdminCommand", () => {
    it("detects admin commands", () => {
      expect(handler.isAdminCommand("/pending")).toBe(true);
      expect(handler.isAdminCommand("/approve abc")).toBe(true);
      expect(handler.isAdminCommand("/block xyz")).toBe(true);
      expect(handler.isAdminCommand("/stats")).toBe(true);
    });

    it("does not match non-admin commands", () => {
      expect(handler.isAdminCommand("/start")).toBe(false);
      expect(handler.isAdminCommand("/help")).toBe(false);
      expect(handler.isAdminCommand("ăn trưa 50k")).toBe(false);
    });
  });

  describe("/pending", () => {
    it("lists pending users", async () => {
      mockUserRepository.findByStatus.mockResolvedValue(pendingUsers);

      await handler.handle("admin-1", "/pending");

      expect(mockUserRepository.findByStatus).toHaveBeenCalledWith("pending");
      const sentText = mockChannelAdapter.sendText.mock.calls[0][1];
      expect(sentText).toContain("Pending users (2)");
      expect(sentText).toContain("@john");
      expect(sentText).toContain("(no username)");
      expect(sentText).toContain("uuid-1");
    });

    it("shows empty message when no pending users", async () => {
      mockUserRepository.findByStatus.mockResolvedValue([]);

      await handler.handle("admin-1", "/pending");

      const sentText = mockChannelAdapter.sendText.mock.calls[0][1];
      expect(sentText).toContain("Không có user nào đang chờ duyệt");
    });
  });

  describe("/approve <id>", () => {
    it("approves a single user", async () => {
      mockApproveUser.execute.mockResolvedValue(pendingUsers[0]);

      await handler.handle("admin-1", "/approve uuid-1");

      expect(mockApproveUser.execute).toHaveBeenCalledWith("uuid-1");
      const sentText = mockChannelAdapter.sendText.mock.calls[0][1];
      expect(sentText).toContain("Đã duyệt @john");
    });

    it("shows error for non-existent user", async () => {
      mockApproveUser.execute.mockRejectedValue(new Error("Not found"));

      await handler.handle("admin-1", "/approve bad-id");

      const sentText = mockChannelAdapter.sendText.mock.calls[0][1];
      expect(sentText).toContain("Không tìm thấy user");
    });
  });

  describe("/approve all", () => {
    it("approves all pending users", async () => {
      mockUserRepository.findByStatus.mockResolvedValue(pendingUsers);
      mockApproveUser.execute.mockImplementation(async (id: string) => {
        return pendingUsers.find((u) => u.id === id)!;
      });

      await handler.handle("admin-1", "/approve all");

      expect(mockApproveUser.execute).toHaveBeenCalledTimes(2);
      const sentText = mockChannelAdapter.sendText.mock.calls[0][1];
      expect(sentText).toContain("Đã duyệt 2 users");
      expect(sentText).toContain("@john");
    });
  });

  describe("/block <id>", () => {
    it("blocks a user", async () => {
      mockBlockUser.execute.mockResolvedValue({ ...pendingUsers[0], accessStatus: "blocked" });

      await handler.handle("admin-1", "/block uuid-1");

      expect(mockBlockUser.execute).toHaveBeenCalledWith("uuid-1");
      const sentText = mockChannelAdapter.sendText.mock.calls[0][1];
      expect(sentText).toContain("Đã block @john");
    });
  });

  describe("/stats", () => {
    it("shows system statistics", async () => {
      mockUserRepository.findByStatus.mockImplementation(async (status) => {
        if (status === "whitelisted") return [pendingUsers[0]];
        if (status === "pending") return [pendingUsers[1]];
        return [];
      });
      mockTransactionRepository.findByUserAndDateRange.mockResolvedValue([
        { id: "t1", userId: "uuid-1", amount: 50000, category: "Ăn uống", note: "test" },
      ]);

      await handler.handle("admin-1", "/stats");

      const sentText = mockChannelAdapter.sendText.mock.calls[0][1];
      expect(sentText).toContain("Tổng users: 2");
      expect(sentText).toContain("whitelisted: 1");
      expect(sentText).toContain("pending: 1");
    });
  });

  describe("notifyNewUser", () => {
    it("sends notification to all admin chat IDs", async () => {
      const newUser: User = {
        id: "new-uuid",
        channel: "telegram",
        channelUserId: "999",
        channelUsername: "newbie",
        accessStatus: "pending",
        plan: "free",
      };

      await handler.notifyNewUser(newUser);

      expect(mockChannelAdapter.sendText).toHaveBeenCalledTimes(2); // admin-1, admin-2
      const msg = mockChannelAdapter.sendText.mock.calls[0][1];
      expect(msg).toContain("User mới: @newbie");
      expect(msg).toContain("/approve new-uuid");
    });

    it("does not send if no admin IDs configured", async () => {
      const emptyHandler = new AdminBotHandler(
        { secret: "test", chatIds: [] },
        mockChannelAdapter as unknown as ChannelAdapter,
        mockUserRepository as unknown as UserRepository,
        mockTransactionRepository as unknown as TransactionRepository,
        mockApproveUser as unknown as ApproveUser,
        mockBlockUser as unknown as BlockUser,
      );

      await emptyHandler.notifyNewUser(pendingUsers[0]);

      expect(mockChannelAdapter.sendText).not.toHaveBeenCalled();
    });
  });
});
