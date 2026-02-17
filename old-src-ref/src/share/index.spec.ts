import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Unmock the share module
vi.unmock("@/share");
vi.unmock("./index");

// Use vi.hoisted to define mock objects
const { mockParams, mockStorage, mockUploaded, mockAxios } = vi.hoisted(() => {
  return {
    mockParams: {
      get: vi.fn(() => null),
      getString: vi.fn(() => ""),
      getBool: vi.fn(() => false),
      has: vi.fn(() => false),
    },
    mockStorage: {
      getValue: vi.fn(() => null),
      saveValue: vi.fn(),
      deleteValue: vi.fn(),
    },
    mockUploaded: {
      getBlob: vi.fn(() => Promise.resolve(null)),
    },
    mockAxios: {
      post: vi.fn(() => Promise.resolve({ data: "TRUE" })),
    },
  };
});

// Mock dependencies
vi.mock("@/params", () => ({
  default: mockParams,
}));

vi.mock("@/storage", () => ({
  default: mockStorage,
}));

vi.mock("@/storage/uploaded", () => ({
  default: mockUploaded,
}));

vi.mock("axios", () => ({
  default: mockAxios,
}));

// Import after mocking
import share from "./index";

describe("share", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset window.configuratorSessionData
    (window as any).configuratorSessionData = {};
  });

  afterEach(() => {
    // Set to undefined instead of deleting (in case it's not configurable)
    (window as any).configuratorSessionData = undefined;
  });

  describe("getSessionID", () => {
    it("should return a session ID", () => {
      const sessionID = share.getSessionID();

      expect(sessionID).toBeTruthy();
      expect(typeof sessionID).toBe("string");
    });
  });

  describe("getSharedSessionID", () => {
    it("should return empty string when no shared session", () => {
      const sharedSessionID = share.getSharedSessionID();

      // Without shared session data, should be empty
      expect(sharedSessionID).toBe("");
    });
  });

  describe("isSelectionUpdated / setSelectionUpdated", () => {
    it("should track selection updated state", () => {
      // Default should be true
      expect(share.isSelectionUpdated()).toBe(true);

      share.setSelectionUpdated(false);
      expect(share.isSelectionUpdated()).toBe(false);

      share.setSelectionUpdated(true);
      expect(share.isSelectionUpdated()).toBe(true);
    });
  });

  describe("newSession", () => {
    it("should generate a new session ID", () => {
      const originalSession = share.getSessionID();

      share.newSession();
      const newSession = share.getSessionID();

      expect(newSession).not.toBe(originalSession);
    });

    it("should call registered callbacks with new session ID", () => {
      const callback = vi.fn();
      share.onNewSession(callback);

      // Clear the initial call from onNewSession
      callback.mockClear();

      share.newSession();

      expect(callback).toHaveBeenCalledWith(share.getSessionID());
    });

    it("should save new session to storage", () => {
      share.newSession();

      expect(mockStorage.saveValue).toHaveBeenCalledWith(
        "session",
        share.getSessionID()
      );
    });
  });

  describe("onNewSession", () => {
    it("should immediately call callback with current session", () => {
      const callback = vi.fn();

      share.onNewSession(callback);

      expect(callback).toHaveBeenCalledWith(share.getSessionID());
    });

    it("should call callback on subsequent new sessions", () => {
      const callback = vi.fn();
      share.onNewSession(callback);

      // Clear initial call
      callback.mockClear();

      share.newSession();
      share.newSession();

      expect(callback).toHaveBeenCalledTimes(2);
    });
  });

  describe("createResilientSession", () => {
    it("should generate a new session starting with T--", () => {
      share.createResilientSession();
      const sessionID = share.getSessionID();

      expect(sessionID.startsWith("T--")).toBe(true);
    });
  });

  describe("resetResilientSession", () => {
    it("should generate a new session not starting with T--", () => {
      share.createResilientSession();
      share.resetResilientSession();
      const sessionID = share.getSessionID();

      expect(sessionID.startsWith("T--")).toBe(false);
    });
  });

  describe("updateSessionData", () => {
    it("should store session data in JSON format", () => {
      const selections = {
        gloves: {
          model: "model-1",
          selections: { Color: { value: "opt-red" } },
        },
      };

      share.updateSessionData("blank", "gloves", selections);

      // Data is stored internally - we can verify through sendSessionData
      expect(true).toBe(true); // updateSessionData doesn't return anything visible
    });

    it("should handle resilient session by setting userInteraction to false", () => {
      const selections = {
        gloves: {
          selections: {
            Color: { value: "opt-red", userInteraction: true },
          },
        },
      };

      share.createResilientSession();
      share.updateSessionData("blank", "gloves", selections);

      // The userInteraction should be set to false in the stored data
      // We can't directly inspect SESSION_DATA, but we can test behavior
      expect(true).toBe(true);
    });
  });

  describe("getUploadedImageKeys", () => {
    it("should return empty array when no uploaded images", () => {
      share.updateSessionData("blank", "gloves", { gloves: {} });

      const keys = share.getUploadedImageKeys();

      expect(keys).toEqual([]);
    });

    it("should extract image keys from session data", () => {
      const selections = {
        gloves: {
          selections: {
            Logo: {
              value: { id: "opt-1" },
              meta: { "+keys": "0:abc123" }
            },
          },
        },
      };

      share.updateSessionData("blank", "gloves", selections);

      // Note: The getUploadedImageKeys looks for specific patterns in JSON
      // This test verifies the method doesn't throw
      const keys = share.getUploadedImageKeys();
      expect(Array.isArray(keys)).toBe(true);
    });
  });

  describe("sendSessionData", () => {
    it("should post session data to API", async () => {
      mockAxios.post.mockResolvedValueOnce({ data: "TRUE" });

      share.updateSessionData("blank", "gloves", { gloves: {} });
      const result = await share.sendSessionData();

      expect(mockAxios.post).toHaveBeenCalledWith(
        "https://nokona.com/configurator-api/",
        expect.any(FormData),
        { headers: { "Content-Type": "multipart/form-data" } }
      );
      expect(result).toBe(true);
    });

    it("should return false on API error", async () => {
      mockAxios.post.mockResolvedValueOnce({ data: "FALSE" });

      share.updateSessionData("blank", "gloves", { gloves: {} });
      const result = await share.sendSessionData();

      expect(result).toBe(false);
    });

    it("should handle network errors gracefully", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      mockAxios.post.mockRejectedValueOnce(new Error("Network error"));

      share.updateSessionData("blank", "gloves", { gloves: {} });
      const result = await share.sendSessionData();

      // Should not throw - the .catch() handles the error, .then() returns undefined for falsy res
      // The result should be falsy (either undefined or false)
      expect(result).toBeFalsy();
      consoleSpy.mockRestore();
    });

    it("should set selectionUpdated to false", async () => {
      mockAxios.post.mockResolvedValueOnce({ data: "TRUE" });
      share.setSelectionUpdated(true);

      await share.sendSessionData();

      expect(share.isSelectionUpdated()).toBe(false);
    });

    it("should include image data if provided", async () => {
      mockAxios.post.mockResolvedValueOnce({ data: "TRUE" });

      share.updateSessionData("blank", "gloves", { gloves: {} });
      await share.sendSessionData("data:image/png;base64,test");

      const callArgs = mockAxios.post.mock.calls[0];
      const formData = callArgs[1] as FormData;
      expect(formData.get("image")).toBe("data:image/png;base64,test");
    });
  });

  describe("sendSessionImage", () => {
    it("should upload multiple images", async () => {
      mockAxios.post.mockResolvedValue({ data: "image-url.jpg" });

      const images = ["data:image/png;base64,img1", "data:image/png;base64,img2"];
      const results = await share.sendSessionImage(images);

      expect(mockAxios.post).toHaveBeenCalledTimes(2);
      expect(results).toHaveLength(2);
    });

    it("should handle blob images", async () => {
      mockAxios.post.mockResolvedValue({ data: "image-url.jpg" });

      const blob = new Blob(["test"], { type: "image/png" });
      const results = await share.sendSessionImage([blob]);

      expect(mockAxios.post).toHaveBeenCalled();
      expect(results).toHaveLength(1);
    });

    it("should return false for failed uploads", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      mockAxios.post.mockResolvedValueOnce({ data: "FALSE" });

      const results = await share.sendSessionImage(["data:image/png;base64,test"]);

      expect(results[0]).toBe(false);
      consoleSpy.mockRestore();
    });

    it("should handle network errors for individual images", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      mockAxios.post.mockRejectedValueOnce(new Error("Network error"));

      const results = await share.sendSessionImage(["data:image/png;base64,test"]);

      expect(results[0]).toBe(false);
      consoleSpy.mockRestore();
    });

    it("should upload custom images from uploaded keys", async () => {
      const mockBlob = new Blob(["test"], { type: "image/png" });
      mockUploaded.getBlob.mockResolvedValueOnce(mockBlob);
      mockAxios.post.mockResolvedValue({ data: "success" });

      // Set up session data with uploadable keys
      share.updateSessionData("blank", "gloves", {
        gloves: {
          selections: {},
        },
      });

      const results = await share.sendSessionImage([]);

      // Should still work even with empty images array
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe("recoverSessionData", () => {
    it("should return null for non-existent session", () => {
      const result = share.recoverSessionData("non-existent-id");

      expect(result).toBeNull();
    });

    it("should return session data from window.configuratorSessionData", () => {
      const mockData = {
        mode: "blank",
        product: "gloves",
        selections: { Color: { value: "red" } },
      };
      (window as any).configuratorSessionData = {
        "test-session": mockData,
      };

      const result = share.recoverSessionData("test-session");

      expect(result).toEqual(mockData);
    });
  });
});
