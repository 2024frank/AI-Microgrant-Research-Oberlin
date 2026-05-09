export function getSafeErrorMessage(
  error: unknown,
  fallback = "Something went wrong. Please try again.",
) {
  const message = error instanceof Error ? error.message : "";

  if (
    message.includes("firebase.google.com") ||
    message.includes("console.firebase.google.com") ||
    message.includes("requires an index") ||
    message.includes("create_composite") ||
    message.includes("permission-denied") ||
    message.includes("Missing or insufficient permissions")
  ) {
    return fallback;
  }

  return message || fallback;
}
