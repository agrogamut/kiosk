import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import toast from "react-hot-toast";
import { CallChatPanel } from "../../components/call/CallChatPanel";
import { DoctorCallView } from "../../components/video/DoctorCallView";
import { api } from "../../lib/api";
import { getApiErrorMessage } from "../../lib/errors";
import { connectSocket } from "../../lib/socket";
import { useCallStore } from "../../store/call.store";

export default function DoctorCall() {
  const { id: callSessionId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const storedLivekitToken = useCallStore((state) => state.livekitToken);
  const setLivekitToken = useCallStore((state) => state.setLivekitToken);
  const clearCall = useCallStore((state) => state.clearCall);
  const [submitting, setSubmitting] = useState(false);

  const editor = useEditor({
    extensions: [StarterKit],
    content: "<p>Patient complaint:<br>Diagnosis:<br>Medications:<br>Advice:</p>",
  });

  useEffect(() => {
    const socket = connectSocket();
    socket.on("call:accepted", ({ callSessionId: acceptedId, livekitToken }: { callSessionId: string; livekitToken: string }) => {
      if (acceptedId === callSessionId) {
        setLivekitToken(livekitToken);
      }
    });
    socket.on("call:ended", () => {
      clearCall();
      navigate("/doctor");
    });

    return () => {
      socket.off("call:accepted");
      socket.off("call:ended");
    };
  }, [callSessionId, clearCall, navigate, setLivekitToken]);

  async function submitPrescription(): Promise<void> {
    if (!editor || !callSessionId) {
      return;
    }

    setSubmitting(true);
    try {
      await api.post("/prescriptions", { callSessionId, content: editor.getJSON() });
      toast.success("Prescription submitted");
      clearCall();
      navigate("/doctor");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Submission failed"));
    } finally {
      setSubmitting(false);
    }
  }

  if (!storedLivekitToken) {
    return <div className="flex min-h-screen items-center justify-center"><p className="text-2xl">Waiting for connection...</p></div>;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <div className="h-[55vh]">
        <DoctorCallView
          token={storedLivekitToken}
          serverUrl={import.meta.env.VITE_LIVEKIT_URL ?? "ws://localhost:7880"}
          onDisconnected={() => navigate("/doctor")}
        />
      </div>

      <div className="grid min-h-0 flex-1 gap-4 border-t-2 border-gray-200 bg-white p-4 lg:grid-cols-[1fr_24rem]">
        <div className="flex min-h-0 flex-col">
          <h3 className="mb-2 text-lg font-bold">Prescription</h3>
          <div className="min-h-[120px] flex-1 rounded-xl border-2 p-3">
            <EditorContent editor={editor} />
          </div>
          <button
            type="button"
            onClick={() => void submitPrescription()}
            disabled={submitting}
            className="mt-3 w-full rounded-xl bg-blue-600 py-4 text-lg font-semibold text-white disabled:opacity-50"
          >
            {submitting ? "Submitting..." : "Submit Prescription"}
          </button>
        </div>
        {callSessionId && <CallChatPanel callSessionId={callSessionId} />}
      </div>
    </div>
  );
}
