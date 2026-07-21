interface PrescriptionDocProps {
  text: string;
}

export function PrescriptionDoc({ text }: PrescriptionDocProps) {
  return <div className="whitespace-pre-wrap text-base leading-7 text-foreground">{text}</div>;
}
