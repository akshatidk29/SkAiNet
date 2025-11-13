import { create } from "zustand";
import { axiosInstance } from "../Lib/axios";

export const useMessageStore = create((set, get) => ({
  messages: [],
  isFetchingMessages: false,
  error: null,

  // Fetch messages from backend (expects { logs: [...] })
  fetchMessages: async () => {
    set({ isFetchingMessages: true, error: null });
    try {
      const response = await axiosInstance.get("/messages");
      const logs = response.data.logs || [];
      set({ messages: logs });
    } catch (error) {
      console.error("Error fetching messages:", error);
      set({
        error:
          error.response?.data?.error ||
          error.message ||
          "Failed to fetch messages",
      });
    } finally {
      set({ isFetchingMessages: false });
    }
  },

  // Add a single new message manually
  addMessage: (newMessage) => {
    const { messages } = get();

    const isDuplicate = messages.some(
      (msg) =>
        msg.message_id === newMessage.message_id &&
        msg.source_node === newMessage.source_node
    );

    if (!isDuplicate) {
      const updatedMessages = [...messages, newMessage];
      if (updatedMessages.length > 200) updatedMessages.shift();
      set({ messages: updatedMessages });
    }
  },

  // Clear messages (calls backend)
  clearMessages: async () => {
    try {
      await axiosInstance.post("/clearMessages");
      set({ messages: [], error: null });
    } catch (error) {
      console.error("Error clearing messages:", error);
      set({
        error:
          error.response?.data?.error ||
          error.message ||
          "Failed to clear messages",
      });
    }
  },

  markRescued: async (log_id) => {
    try {
      await axiosInstance.post("/markRescued", { log_id: log_id });
    } catch (error) {
      console.error("Error marking rescued:", error);
    }
  },

  resetMessages: () =>
    set({ messages: [], error: null, isFetchingMessages: false }),
}));
