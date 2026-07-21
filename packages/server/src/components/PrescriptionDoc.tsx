import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { LOGO_DATA_URI } from "../assets/logo-base64.js";

const BRAND = "#db6691";
const BRAND_TINT = "#fdf2f5";
const MUTED = "#6b7280";
const BORDER = "#f0d5df";
const INK = "#1f2937";

const styles = StyleSheet.create({
  page: { padding: 40, paddingBottom: 70, fontFamily: "Helvetica", color: INK },
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    borderBottom: `2px solid ${BRAND}`,
    paddingBottom: 12,
    marginBottom: 20,
  },
  logo: { width: 130, height: 26 },
  headerRight: { alignItems: "flex-end" },
  title: { fontSize: 18, color: BRAND, fontWeight: "bold" },
  subtitle: { fontSize: 10, color: MUTED, marginTop: 2 },
  metaRow: { flexDirection: "row", gap: 12, marginBottom: 20 },
  metaBox: {
    flex: 1,
    backgroundColor: BRAND_TINT,
    border: `1px solid ${BORDER}`,
    borderRadius: 6,
    padding: 10,
  },
  metaLabel: { fontSize: 8, color: BRAND, fontWeight: "bold", marginBottom: 4, textTransform: "uppercase" },
  metaValue: { fontSize: 10.5, marginBottom: 2 },
  metaValueMuted: { fontSize: 9, color: MUTED, marginBottom: 2 },
  section: {
    marginBottom: 12,
    border: `1px solid ${BORDER}`,
    borderRadius: 6,
    overflow: "hidden",
  },
  sectionLabel: {
    backgroundColor: BRAND,
    color: "#ffffff",
    fontSize: 9,
    fontWeight: "bold",
    textTransform: "uppercase",
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  sectionValue: { fontSize: 11.5, lineHeight: 1.6, padding: 10 },
  empty: { fontSize: 11, color: MUTED, fontStyle: "italic" },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 40,
    right: 40,
    borderTop: `1px solid ${BORDER}`,
    paddingTop: 8,
    fontSize: 8,
    color: MUTED,
    flexDirection: "row",
    justifyContent: "space-between",
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

interface PrescriptionFields {
  complaint: string;
  diagnosis: string;
  medications: string;
  advice: string;
}

const PRESCRIPTION_SECTIONS: { key: keyof PrescriptionFields; label: string }[] = [
  { key: "complaint", label: "Patient complaint" },
  { key: "diagnosis", label: "Diagnosis" },
  { key: "medications", label: "Medications" },
  { key: "advice", label: "Advice" },
];

function readPrescriptionFields(content: unknown): PrescriptionFields {
  const record = (content && typeof content === "object" ? (content as Record<string, unknown>) : {}) as Record<string, unknown>;

  return {
    complaint: typeof record.complaint === "string" ? record.complaint : "",
    diagnosis: typeof record.diagnosis === "string" ? record.diagnosis : "",
    medications: typeof record.medications === "string" ? record.medications : "",
    advice: typeof record.advice === "string" ? record.advice : "",
  };
}

export function PrescriptionDoc({ prescription }: PrescriptionDocProps) {
  const fields = readPrescriptionFields(prescription.content);
  const hasAnyContent = Object.values(fields).some((value) => value.trim().length > 0);
  const createdAt = new Date(prescription.createdAt);
  const date = createdAt.toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
  const time = createdAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  const generatedAt = new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  const doctorProfile = prescription.doctor.doctorProfile;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Image src={LOGO_DATA_URI} style={styles.logo} />
          <View style={styles.headerRight}>
            <Text style={styles.title}>Prescription</Text>
            <Text style={styles.subtitle}>Telemedicine consultation record</Text>
          </View>
        </View>

        <View style={styles.metaRow}>
          <View style={styles.metaBox}>
            <Text style={styles.metaLabel}>Patient</Text>
            <Text style={styles.metaValue}>{prescription.patient.name}</Text>
            <Text style={styles.metaValueMuted}>{prescription.patient.phone}</Text>
          </View>
          <View style={styles.metaBox}>
            <Text style={styles.metaLabel}>Doctor</Text>
            <Text style={styles.metaValue}>Dr. {prescription.doctor.name}</Text>
            <Text style={styles.metaValueMuted}>
              {doctorProfile?.degree}
              {doctorProfile?.specialization ? ` - ${doctorProfile.specialization}` : ""}
            </Text>
            <Text style={styles.metaValueMuted}>Reg. no. {doctorProfile?.regNumber}</Text>
          </View>
          <View style={styles.metaBox}>
            <Text style={styles.metaLabel}>Consultation</Text>
            <Text style={styles.metaValue}>{date}</Text>
            <Text style={styles.metaValueMuted}>{time}</Text>
            <Text style={styles.metaValueMuted}>ID: {prescription.id}</Text>
          </View>
        </View>

        {hasAnyContent ? (
          PRESCRIPTION_SECTIONS.filter((section) => fields[section.key].trim().length > 0).map((section) => (
            <View key={section.key} style={styles.section}>
              <Text style={styles.sectionLabel}>{section.label}</Text>
              <Text style={styles.sectionValue}>{fields[section.key]}</Text>
            </View>
          ))
        ) : (
          <View style={styles.section}>
            <Text style={[styles.sectionValue, styles.empty]}>No prescription notes entered.</Text>
          </View>
        )}

        <View style={styles.footer} fixed>
          <Text>Prescription ID: {prescription.id} - MadamGy Telemedicine</Text>
          <Text>Digitally generated on {generatedAt}</Text>
        </View>
      </Page>
    </Document>
  );
}
