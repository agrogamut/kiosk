import clsx from "clsx";

interface NumPadProps {
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
}

export function NumPad({ value, onChange, maxLength = 4 }: NumPadProps) {
  function push(digit: string): void {
    if (value.length < maxLength) {
      onChange(value + digit);
    }
  }

  function pop(): void {
    onChange(value.slice(0, -1));
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="mb-2 flex gap-3">
        {Array.from({ length: maxLength }).map((_, index) => (
          <div
            key={index}
            className={clsx("h-3 w-3 rounded-full transition-colors", index < value.length ? "bg-primary" : "bg-border")}
          />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "Del"].map((key) => (
          <button
            key={key}
            type="button"
            disabled={!key}
            onClick={() => (key === "Del" ? pop() : push(key))}
            className={clsx(
              "h-16 w-16 rounded-full font-display text-2xl font-semibold transition-colors",
              key ? "bg-card text-foreground shadow-sm hover:bg-[#EE908D33] active:bg-[#EE908D4D]" : "invisible",
            )}
          >
            {key}
          </button>
        ))}
      </div>
    </div>
  );
}
