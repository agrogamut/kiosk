import type { RefObject } from "react";
import { useReactToPrint } from "react-to-print";

interface PrintButtonProps {
  targetRef: RefObject<HTMLElement>;
}

export function PrintButton({ targetRef }: PrintButtonProps) {
  const handlePrint = useReactToPrint({ content: () => targetRef.current });

  return (
    <button
      type="button"
      onClick={() => handlePrint()}
      className="rounded-2xl bg-green-600 px-8 py-4 text-xl font-semibold text-white hover:bg-green-700"
    >
      Print Prescription
    </button>
  );
}
