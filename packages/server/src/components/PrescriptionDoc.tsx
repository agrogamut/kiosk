import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: "Helvetica" },
  header: { marginBottom: 20, borderBottom: "2px solid #1d4ed8", paddingBottom: 10 },
  title: { fontSize: 24, color: "#1d4ed8", fontWeight: "bold" },
  subtitle: { fontSize: 12, color: "#6b7280", marginTop: 4 },
  section: { marginTop: 16 },
  label: { fontSize: 10, color: "#6b7280", marginBottom: 2 },
  value: { fontSize: 12 },
  content: { marginTop: 20, fontSize: 12, lineHeight: 1.6 },
  footer: {
    position: "absolute",
    bottom: 40,
    left: 40,
    right: 40,
    borderTop: "1px solid #e5e7eb",
    paddingTop: 10,
    fontSize: 10,
    color: "#9ca3af",
  },
});

interface PrescriptionDocProps {
  prescription: {
    id: string;
    createdAt: string | Date;
    content: unknown;
    patient: { name: string; phone: string };
    doctor: {
      name: string;
      doctorProfile: { degree: string; regNumber: string; specialization: string | null } | null;
    };
  };
}

function extractText(node: unknown): string {
  if (!node || typeof node !== "object") {
    return "";
  }

  const record = node as Record<string, unknown>;
  if (typeof record.text === "string") {
    return record.text;
  }
  if (Array.isArray(record.content)) {
    return record.content.map(extractText).join(" ").replace(/\s+/g, " ").trim();
  }

  return "";
}

export function PrescriptionDoc({ prescription }: PrescriptionDocProps) {
  const text = extractText(prescription.content);
  const date = new Date(prescription.createdAt).toLocaleDateString("en-IN");

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>MadamGy</Text>
          <Text style={styles.subtitle}>Prescription</Text>
        </View>

        <View style={{ flexDirection: "row", gap: 40 }}>
          <View style={styles.section}>
            <Text style={styles.label}>Patient</Text>
            <Text style={styles.value}>{prescription.patient.name}</Text>
            <Text style={styles.value}>{prescription.patient.phone}</Text>
          </View>
          <View style={styles.section}>
            <Text style={styles.label}>Doctor</Text>
            <Text style={styles.value}>Dr. {prescription.doctor.name}</Text>
            <Text style={styles.value}>{prescription.doctor.doctorProfile?.degree}</Text>
            <Text style={styles.value}>Reg: {prescription.doctor.doctorProfile?.regNumber}</Text>
          </View>
          <View style={styles.section}>
            <Text style={styles.label}>Date</Text>
            <Text style={styles.value}>{date}</Text>
          </View>
        </View>

        <View style={[styles.section, { marginTop: 24 }]}>
          <Text style={styles.label}>Prescription</Text>
          <Text style={styles.content}>{text || "No prescription notes entered."}</Text>
        </View>

        <Text style={styles.footer}>
          Prescription ID: {prescription.id} - MadamGy Telemedicine - This prescription is digitally generated.
        </Text>
      </Page>
    </Document>
  );
}
