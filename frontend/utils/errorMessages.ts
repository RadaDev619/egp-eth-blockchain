import { ApiClientError } from "@/services/apiClient";

export function procurementErrorMessage(error: unknown) {
  if (error instanceof ApiClientError) {
    if (error.status === 403) {
      return "Your verified role is not allowed to perform this action. The blocked attempt is recorded for auditor review.";
    }

    if (error.status === 409) {
      return "This procurement action is not allowed in the current workflow state. The blocked attempt is recorded for auditor review.";
    }

    if (error.status === 422) {
      return "Some required information is missing or invalid.";
    }

    if (error.status === 502) {
      return "The backend relayer could not confirm the blockchain proof.";
    }

    return `${error.code}: ${error.message}`;
  }

  return error instanceof Error ? error.message : "The procurement action failed.";
}

export function blockedActionTitle(error: unknown) {
  if (error instanceof ApiClientError && error.status === 403) {
    return "Unauthorized action blocked";
  }

  if (error instanceof ApiClientError && error.status === 409) {
    return "Workflow bypass blocked";
  }

  return "Action could not be completed";
}
