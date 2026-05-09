import type { ReviewPost } from "@/lib/postTypes";

export type PostValidationResult = {
  isValid: boolean;
  missingFields: string[];
  warnings: string[];
  errors: string[];
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const validEventTypes = new Set(["ot", "an"]);
const validDisplays = new Set(["all", "ps", "sps", "ss"]);
const validLocationTypes = new Set(["ph2", "on", "bo", "ne"]);

function hasValue(value: unknown) {
  return typeof value === "string" ? value.trim().length > 0 : value !== null && value !== undefined;
}

function requireField(
  condition: boolean,
  field: string,
  missingFields: string[],
  errors: string[],
) {
  if (!condition) {
    missingFields.push(field);
    errors.push(`${field} is required.`);
  }
}

export function validatePost(post: ReviewPost): PostValidationResult {
  const missingFields: string[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];

  requireField(validEventTypes.has(post.eventType), "eventType", missingFields, errors);
  requireField(emailPattern.test(post.email), "email", missingFields, errors);
  requireField(post.title.trim().length >= 1, "title", missingFields, errors);
  if (post.title.trim().length > 60) {
    errors.push("title must be 60 characters or fewer.");
  }
  requireField(post.description.trim().length >= 10, "description", missingFields, errors);
  if (post.description.trim().length > 200) {
    errors.push("description must be 200 characters or fewer.");
  }
  requireField(post.sponsors.length >= 1, "sponsors", missingFields, errors);
  requireField(post.postTypeId.length >= 1, "postTypeId", missingFields, errors);
  requireField(post.sessions.length >= 1, "sessions", missingFields, errors);
  requireField(hasValue(post.imageUrl), "imageUrl", missingFields, errors);
  post.sessions.forEach((session, index) => {
    if (typeof session.startTime !== "number" || typeof session.endTime !== "number") {
      errors.push(`sessions[${index}] must include startTime and endTime.`);
    }
  });
  requireField(validDisplays.has(post.display), "display", missingFields, errors);

  if (post.eventType === "ot") {
    requireField(validLocationTypes.has(post.locationType), "locationType", missingFields, errors);

    if (post.locationType === "ph2") {
      requireField(hasValue(post.location), "location", missingFields, errors);
    }

    if (post.locationType === "on") {
      requireField(hasValue(post.urlLink), "urlLink", missingFields, errors);
    }

    if (post.locationType === "bo") {
      requireField(hasValue(post.location), "location", missingFields, errors);
      requireField(hasValue(post.urlLink), "urlLink", missingFields, errors);
    }
  }

  if (post.eventType === "an" && post.locationType !== "ne") {
    warnings.push("Announcements should default to locationType ne.");
  }

  if (post.aiConfidence !== null && post.aiConfidence < 70) {
    warnings.push("Needs human check because AI confidence is below 70%.");
  }

  if (post.duplicateWarning) {
    warnings.push("Duplicate Warning");
  }

  return {
    isValid: errors.length === 0,
    missingFields,
    warnings,
    errors,
  };
}

export function getValidationLabel(result: PostValidationResult) {
  if (!result.isValid) {
    return "Missing Required Fields";
  }

  if (result.warnings.some((warning) => warning.includes("Duplicate"))) {
    return "Duplicate Warning";
  }

  if (result.warnings.length > 0) {
    return "Needs Human Check";
  }

  return "Ready to Approve";
}
