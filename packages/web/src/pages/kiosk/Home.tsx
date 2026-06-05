import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";

export default function KioskHome() {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-12 bg-gradient-to-br from-blue-50 to-blue-100 p-8">
      <motion.h1
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-6xl font-bold text-blue-900"
      >
        MadamGy
      </motion.h1>
      <p className="text-2xl text-gray-600">Your health, in one tap.</p>
      <div className="flex w-full max-w-sm flex-col gap-6">
        <button
          type="button"
          onClick={() => navigate("/register")}
          className="w-full rounded-3xl bg-blue-600 py-6 text-2xl font-semibold text-white transition-colors hover:bg-blue-700"
        >
          New Patient
        </button>
        <button
          type="button"
          onClick={() => navigate("/login")}
          className="w-full rounded-3xl border-2 border-blue-600 bg-white py-6 text-2xl font-semibold text-blue-600 transition-colors hover:bg-blue-50"
        >
          Returning Patient
        </button>
      </div>
    </div>
  );
}
