import { useEffect, useRef, useState } from "react";
import type { ChatMessage, Vitals } from "@madamgy/api-client";
import { Paperclip } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { VitalsForm } from "../kiosk/VitalsForm";
import { ChatImageMessage } from "./ChatImageMessage";
import { api } from "../../lib/api";
import { getApiErrorMessage } from "../../lib/errors";
import { connectSocket, getSocket } from "../../lib/socket";
import { useAuthStore } from "../../store/auth.store";

type ChatMessageWithSender = ChatMessage & { sender?: { id: string; name: string } };

interface CallChatPanelProps {
  callSessionId: string;
}

const emptyVitals: Vitals = {};

export function CallChatPanel({ callSessionId }: CallChatPanelProps) {
  const user = useAuthStore((state) => state.user);
  const canSendVitals = user?.role === "PATIENT";
  const [messages, setMessages] = useState<ChatMessageWithSender[]>([]);
  const [text, setText] = useState("");
  const [showVitals, setShowVitals] = useState(false);
  const [vitals, setVitals] = useState<Vitals>(emptyVitals);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const socket = connectSocket();
    socket.on("chat:message", (message: ChatMessageWithSender) => {
      if (message.callSessionId === callSessionId) {
        setMessages((current) => [...current, message]);
      }
    });

    return () => {
      socket.off("chat:message");
    };
  }, [callSessionId]);

  function sendText(): void {
    const content = text.trim();
    if (!content) {
      return;
    }

    getSocket().emit("chat:send", { type: "TEXT", callSessionId, content });
    setText("");
  }

  function sendVitals(): void {
    const hasVitals = Object.values(vitals).some((value) => value !== undefined && value !== "");
    if (!hasVitals) {
      return;
    }

    getSocket().emit("chat:send", { type: "VITALS", callSessionId, vitals });
    setVitals(emptyVitals);
    setShowVitals(false);
  }

  async function sendImage(file: File): Promise<void> {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("callSessionId", callSessionId);
      const response = await api.post<{ imageKey: string }>("/chat/upload", formData);
      getSocket().emit("chat:send", { type: "IMAGE", callSessionId, imageKey: response.data.imageKey });
    } catch (error) {
      toast.error(getApiErrorMessage(error, "We couldn't send that file. Try again."));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col rounded-xl bg-card shadow-sm">
      <div className="border-b border-input px-4 py-3">
        <h3 className="font-display font-semibold text-foreground">Call chat</h3>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
        {messages.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">No messages yet</p>}
        {messages.map((message) => {
          const own = message.senderId === user?.id;
          return (
            <div
              key={message.id}
              className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                own ? "self-end bg-primary text-primary-foreground" : "self-start bg-muted text-foreground"
              }`}
            >
              <p className="mb-1 text-xs opacity-70">{own ? "You" : message.sender?.name ?? "Participant"}</p>
              {message.type === "TEXT" && <p>{message.content}</p>}
              {message.type === "IMAGE" && message.imageKey && <ChatImageMessage imageKey={message.imageKey} />}
              {message.type === "VITALS" && (
                <div className="text-sm">
                  <p className="font-semibold">Vitals</p>
                  {message.vitals?.weightKg && <p>Weight: {message.vitals.weightKg} kg</p>}
                  {message.vitals?.heightCm && <p>Height: {message.vitals.heightCm} cm</p>}
                  {message.vitals?.bp && <p>BP: {message.vitals.bp}</p>}
                  {message.vitals?.spo2 && <p>SpO2: {message.vitals.spo2}%</p>}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {canSendVitals && showVitals && (
        <div className="border-t border-input p-4">
          <VitalsForm value={vitals} onChange={setVitals} />
          <Button type="button" onClick={sendVitals} className="mt-3 w-full">
            Send vitals
          </Button>
        </div>
      )}
      <div className="flex gap-2 border-t border-input p-3">
        {canSendVitals && (
          <Button type="button" variant="outline" onClick={() => setShowVitals((current) => !current)}>
            Vitals
          </Button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) {
              void sendImage(file);
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
          aria-label="Attach file"
        >
          <Paperclip className="h-4 w-4" />
        </Button>
        <Input
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              sendText();
            }
          }}
          placeholder="Type message"
          className="min-w-0 flex-1"
        />
        <Button type="button" onClick={sendText}>
          Send
        </Button>
      </div>
    </div>
  );
}
