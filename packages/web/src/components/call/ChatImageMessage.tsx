import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";

interface ChatImageMessageProps {
  imageKey: string;
}

const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"];

function isImageKey(key: string): boolean {
  const lower = key.toLowerCase();
  return IMAGE_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

export function ChatImageMessage({ imageKey }: ChatImageMessageProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["chat-image-url", imageKey],
    queryFn: () => api.get<{ url: string }>("/chat/image-url", { params: { key: imageKey } }).then((response) => response.data.url),
  });

  if (isLoading || !data) {
    return <p className="text-sm text-muted-foreground">Loading attachment...</p>;
  }

  if (isImageKey(imageKey)) {
    return <img src={data} alt="Shared attachment" className="max-w-full rounded-lg" />;
  }

  return (
    <a href={data} target="_blank" rel="noreferrer" className="underline">
      View document
    </a>
  );
}
