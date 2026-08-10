import { useEffect, useRef, useState } from "react";
import type { ChatMessage, Vitals } from "@madamgy/api-client";
import { format } from "date-fns";
import { Paperclip } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { VitalsForm, hasInvalidVitals } from "../kiosk/VitalsForm";
import { ChatImageMessage } from "./ChatImageMessage";
import { api } from "../../lib/api";
import { getApiErrorMessage } from "../../lib/errors";
import { connectSocket, getSocket } from "../../lib/socket";
import { useAuthStore } from "../../store/auth.store";

type ChatMessageWithSender = ChatMessage & { sender?: { id: string; name: string } };

interface CallChatPanelProps {
  callSessionId: string;
  /** Fires only for live messages from the other person, so a hidden panel can show an unread mark. */
  onMessageFromPeer?: () => void;
  /** Drops the card chrome and title when the panel already sits inside a titled container. */
  embedded?: boolean;
}

const emptyVitals: Vitals = {};

function mergeMessage(
  current: ChatMessageWithSender[],
  message: ChatMessageWithSender,
): ChatMessageWithSender[] {
  // The socket can deliver a message that the history fetch already returned, and vice versa,
  // depending on which lands first after a rejoin.
  return current.some((existing) => existing.id === message.id) ? current : [...current, message];
}

export function CallChatPanel({ callSessionId, onMessageFromPeer, embedded = false }: CallChatPanelProps) {
  const user = useAuthStore((state) => state.user);
  const canSendVitals = user?.role === "PATIENT";
  const [messages, setMessages] = useState<ChatMessageWithSender[]>([]);
  const [text, setText] = useState("");
  const [showVitals, setShowVitals] = useState(false);
  const [vitals, setVitals] = useState<Vitals>(emptyVitals);
  const [uploading, setUploading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // Held in a ref so the socket subscription below doesn't tear down and re-run every time the
  // parent re-renders with a fresh inline callback.
  const notifyPeerMessage = useRef(onMessageFromPeer);
  notifyPeerMessage.current = onMessageFromPeer;
  const ownUserId = useRef(user?.id);
  ownUserId.current = user?.id;

  useEffect(() => {
    let cancelled = false;

    // Messages were always persisted; nothing ever read them back, so a reload or a rejoin
    // mid-call showed an empty panel while the conversation sat in the database.
    setLoadingHistory(true);
    api
      .get<{ messages: ChatMessageWithSender[] }>(`/chat/${callSessionId}/messages`)
      .then((response) => {
        if (!cancelled) {
          setMessages((current) => response.data.messages.reduce(mergeMessage, current));
        }
      })
      .catch(() => {
        if (!cancelled) {
          toast.error("Couldn't load earlier messages");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingHistory(false);
        }
      });

    const socket = connectSocket();
    socket.on("chat:message", (message: ChatMessageWithSender) => {
      if (message.callSessionId !== callSessionId) {
        return;
      }
      setMessages((current) => mergeMessage(current, message));
      if (message.senderId !== ownUserId.current) {
        notifyPeerMessage.current?.();
      }
    });

    return () => {
      cancelled = true;
      socket.off("chat:message");
    };
  }, [callSessionId]);

  // Without this the list never moves and the newest message is simply below the fold.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages]);

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
    // The server parses vitals with VitalsSchema and the socket handler discards anything that
    // fails, without replying -- so an out-of-range value would otherwise vanish in silence.
    if (hasInvalidVitals(vitals)) {
      toast.error("Check the highlighted readings before sending");
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
    <div className={`flex h-full min-h-0 flex-col bg-card ${embedded ? "" : "rounded-xl shadow-sm"}`}>
      {!embedded && (
        <div className="border-b border-input px-4 py-3">
          <h3 className="font-display font-semibold text-foreground">Call chat</h3>
        </div>
      )}
      {/* min-h-24 keeps the message list from being squeezed to nothing when the vitals form
          below it opens inside a short panel. */}
      <div className="flex min-h-24 flex-1 flex-col gap-3 overflow-y-auto p-4">
        {loadingHistory && <p className="py-4 text-center text-sm text-muted-foreground">Loading messages...</p>}
        {!loadingHistory && messages.length === 0 && (
          <p className="py-4 text-center text-sm text-muted-foreground">No messages yet</p>
        )}
        {messages.map((message) => {
          const own = message.senderId === user?.id;
          return (
            <div
              key={message.id}
              className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                own ? "self-end bg-primary text-primary-foreground" : "self-start bg-muted text-foreground"
              }`}
            >
              <div className="mb-1 flex items-baseline gap-2 text-xs opacity-70">
                <span>{own ? "You" : message.sender?.name ?? "Participant"}</span>
                <span>{format(new Date(message.createdAt), "HH:mm")}</span>
              </div>
              {message.type === "TEXT" && <p className="whitespace-pre-wrap break-words">{message.content}</p>}
              {message.type === "IMAGE" && message.imageKey && <ChatImageMessage imageKey={message.imageKey} />}
              {message.type === "VITALS" && (
                <div className="text-sm">
                  <p className="font-semibold">Vitals</p>
                  {message.vitals?.weightKg && <p>Weight: {message.vitals.weightKg} kg</p>}
                  {message.vitals?.heightCm && <p>Height: {message.vitals.heightCm} cm</p>}
                  {message.vitals?.bp && <p>BP: {message.vitals.bp} mmHg</p>}
                  {message.vitals?.spo2 && <p>SpO2: {message.vitals.spo2}%</p>}
                  {message.vitals?.temp && <p>Temperature: {message.vitals.temp} &deg;C</p>}
                </div>
              )}
            </div>
          );
        })}
        {uploading && (
          <div className="max-w-[85%] self-end rounded-2xl bg-primary/60 px-4 py-3 text-sm text-primary-foreground">
            Sending attachment...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      {canSendVitals && showVitals && (
        <div className="max-h-[45%] shrink-0 overflow-y-auto border-t border-input p-4">
          <VitalsForm value={vitals} onChange={setVitals} />
          <Button type="button" onClick={sendVitals} className="mt-3 w-full">
            Send vitals
          </Button>
        </div>
      )}
      {/* items-end so the row grows downward as the message box does, which means every control
          has to share one height at rest: the buttons are h-11, the icon button defaults to
          size-8, and the message box to min-h-20, so all three sat at different heights. */}
      <div className="flex shrink-0 items-end gap-2 border-t border-input p-3">
        {canSendVitals && (
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowVitals((current) => !current)}
            aria-pressed={showVitals}
            className="shrink-0 px-3"
          >
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
          className="size-11 shrink-0"
        >
          <Paperclip className="size-4" />
        </Button>
        <Textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            // Enter sends, Shift+Enter breaks the line -- clinical notes need more than one.
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              sendText();
            }
          }}
          placeholder="Type message"
          rows={1}
          // Sized to match the buttons' h-11 exactly: 24px line + 9px padding either side + the
          // 1px borders border-box counts = 44px, so a single line shares their baseline instead
          // of sitting in a taller box. max-h caps the growth from Shift+Enter before it starts
          // swallowing the message list.
          className="max-h-32 min-h-11 min-w-0 flex-1 resize-none py-[9px] leading-6"
        />
        <Button type="button" onClick={sendText} disabled={!text.trim()} className="shrink-0 px-4">
          Send
        </Button>
      </div>
    </div>
  );
}
