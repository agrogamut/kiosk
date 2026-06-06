import axios from "axios";

interface ApiErrorResponse {
  message?: string;
  issues?: Array<{
    message?: string;
    path?: Array<string | number>;
  }>;
}

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError<ApiErrorResponse>(error)) {
    const issue = error.response?.data?.issues?.[0];
    if (issue?.message) {
      const path = issue.path?.join(".");
      return path ? `${path}: ${issue.message}` : issue.message;
    }

    return error.response?.data?.message ?? fallback;
  }

  return fallback;
}
