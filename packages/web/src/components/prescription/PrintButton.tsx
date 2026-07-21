import type { RefObject } from "react";
import { useReactToPrint } from "react-to-print";
import { Button } from "../ui/button";

interface PrintButtonProps {
  targetRef: RefObject<HTMLElement>;
}

export function PrintButton({ targetRef }: PrintButtonProps) {
  const handlePrint = useReactToPrint({ content: () => targetRef.current });

  return (
    <Button type="button" onClick={() => handlePrint()} className="rounded-full">
      Print prescription
    </Button>
  );
}
