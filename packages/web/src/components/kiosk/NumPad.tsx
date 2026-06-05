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
            className={clsx(
              "h-10 w-10 rounded-full border-2",
              index < value.length ? "border-blue-600 bg-blue-600" : "border-gray-400",
            )}
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
              "h-20 w-20 rounded-2xl text-2xl font-bold transition-colors",
              key ? "bg-gray-100 text-gray-900 hover:bg-gray-200 active:bg-gray-300" : "invisible",
            )}
          >
            {key}
          </button>
        ))}
      </div>
    </div>
  );
}
