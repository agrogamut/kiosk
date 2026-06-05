interface PrescriptionDocProps {
  text: string;
}

export function PrescriptionDoc({ text }: PrescriptionDocProps) {
  return <div className="whitespace-pre-wrap text-base leading-7 text-gray-900">{text}</div>;
}
