export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
  }
}

export class AuthorizationError extends AppError {
  constructor(message = "Your verified role is not allowed to perform this action.", details?: unknown) {
    super(403, "AUTHORIZATION_ERROR", message, details);
  }
}

export class InvalidTransitionError extends AppError {
  constructor(message = "This procurement action is not allowed in the current workflow state.", details?: unknown) {
    super(409, "INVALID_TRANSITION", message, details);
  }
}

export class ValidationError extends AppError {
  constructor(message = "Some required information is missing or invalid.", details?: unknown) {
    super(422, "VALIDATION_ERROR", message, details);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Requested resource was not found.", details?: unknown) {
    super(404, "NOT_FOUND", message, details);
  }
}
