/** Standard error codes for API error responses. */
export enum ErrorCode {
  ERROR = 'ERROR',
  BAD_REQUEST = 'BAD_REQUEST',
  UNPROCESSABLE_ENTITY = 'UNPROCESSABLE_ENTITY',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  PAYLOAD_TOO_LARGE = 'PAYLOAD_TOO_LARGE',
}

/** Base error class for all request-level errors with HTTP status codes. */
export class RequestError extends Error {
  public code: string;
  public status = 'error';
  public statusCode = 500;

  constructor(
    code: string = ErrorCode.ERROR,
    message: string = 'An error occurred',
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
  }

  /** Serializes the error to a JSON-safe object (excludes internal fields like statusCode). */
  toJSON() {
    return {
      status: this.status,
      code: this.code,
      message: this.message,
    };
  }
}

/** 400 Bad Request — invalid or malformed request data. */
export class BadRequestError extends RequestError {
  constructor(message: string = 'Invalid data in request') {
    super(ErrorCode.BAD_REQUEST, message);
    this.statusCode = 400;
  }
}

/** 404 Not Found — requested resource does not exist. */
export class NotFoundError extends RequestError {
  constructor(message: string = 'Not Found') {
    super(ErrorCode.NOT_FOUND, message);
    this.statusCode = 404;
  }
}

/** 401 Unauthorized — missing or invalid authentication credentials. */
export class UnauthorizedError extends RequestError {
  constructor(message: string = 'Unauthorized') {
    super(ErrorCode.UNAUTHORIZED, message);
    this.statusCode = 401;
  }
}

/** 403 Forbidden — authenticated but lacking required permissions. */
export class ForbiddenError extends RequestError {
  constructor(message: string = 'Forbidden') {
    super(ErrorCode.FORBIDDEN, message);
    this.statusCode = 403;
  }
}

/** 413 Payload Too Large — request body exceeds allowed size. */
export class PayloadTooLargeError extends RequestError {
  constructor(message: string = 'Payload too large') {
    super(ErrorCode.PAYLOAD_TOO_LARGE, message);
    this.statusCode = 413;
  }
}
