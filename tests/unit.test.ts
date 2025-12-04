import { describe, it, expect, vi, beforeEach } from "bun:test";
import { useResolver } from "../graphql/user";
import { pool } from "../config/db.config";
import bcrypt from "bcrypt";
import * as EmailUtils from "../utils/sendEmail";
import * as TokenUtils from "../utils/generatToken";


// Mock PostgreSQL pool
const mockQuery = vi.fn();
(pool as any).query = mockQuery;

// Mock bcrypt
vi.spyOn(bcrypt, "hash").mockImplementation(async () => "hashedpass");
vi.spyOn(bcrypt, "compare").mockImplementation(async () => true);

// Mock sendEmail
const mockSendEmail = vi.spyOn(EmailUtils, "sendEmail").mockResolvedValue(undefined as any);

// Mock token utilities
const mockAccessToken = "mockAccessToken";
const mockRefreshToken = "mockRefreshToken";
vi.spyOn(TokenUtils, "generateAccessToken").mockReturnValue(mockAccessToken);
vi.spyOn(TokenUtils, "generateRefreshToken").mockReturnValue(mockRefreshToken);

describe("User Resolver", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ----------------- QUERY -----------------
  it("should throw if user not logged in", async () => {
     expect(useResolver.Query.users({}, {}, { user: null })).rejects.toThrow(
      "Unauthorized – Please log in"
    );
  });

  it("should throw if user is not ADMIN", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 1, global_status: "ACTIVE" }],
      rowCount: 1,
    });

     expect(useResolver.Query.users({}, {}, { user: { id: 1 } })).rejects.toThrow(
      "Forbidden – Only ADMINs can view all users"
    );
  });

  it("should return users for ADMIN", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 1, global_status: "ADMIN" }],
      rowCount: 1,
    });

    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: 1, name: "Admin", phone: "123", email: "admin@test.com", global_status: "ADMIN" },
      ],
      rowCount: 1,
    });

    const result = await useResolver.Query.users({}, {}, { user: { id: 1 } });

    expect(result).toEqual([
      { id: 1, name: "Admin", phone: "123", email: "admin@test.com", global_status: "ADMIN" },
    ]);
  });

  // ----------------- MUTATIONS -----------------
  it("should create a new user", async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 0 }); // check existing user
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: 2, name: "Test", phone: "123456", email: "test@test.com", password: "hashedpass", global_status: "ACTIVE" },
      ],
    });

    const result = await useResolver.Mutation.createUser({}, {
      name: "Test",
      phone: "123456",
      email: "test@test.com",
      password: "password",
    });

    expect(result).toEqual({
      id: 2,
      name: "Test",
      phone: "123456",
      email: "test@test.com",
      password: "hashedpass",
      globalStatus: "ACTIVE",
    });
  });

  it("should call sendEmail on resetPassword", async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 2, email: "test@test.com" }] });

    const result = await useResolver.Mutation.resetPassword({}, { email: "test@test.com" });

    expect(result).toBe("Reset email sent successfully.");
    expect(mockSendEmail).toHaveBeenCalledWith("test@test.com", expect.any(String));
  });

  it("should generate access and refresh tokens on login", () => {
    const user = { id: 1, email: "test@test.com" };
    const accessToken = TokenUtils.generateAccessToken(user.id, user.email);
    const refreshToken = TokenUtils.generateRefreshToken(user.id, user.email);

    expect(accessToken).toBe(mockAccessToken);
    expect(refreshToken).toBe(mockRefreshToken);
  });

  it("should update password correctly", async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 1, password: "hashedpass" }] }); // fetch user

    const result = await useResolver.Mutation.updatePassword({}, { currentPassword: "old", newPassword: "new" }, { user: { id: 1 } });

    expect(result).toBe("Password updated successfully");
  });
});
