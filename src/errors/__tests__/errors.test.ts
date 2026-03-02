import { describe, expect, it } from 'vitest';

import {
  BadRequestError,
  ErrorCode,
  ForbiddenError,
  NotFoundError,
  PayloadTooLargeError,
  RequestError,
  UnauthorizedError,
} from '../index.js';

describe('RequestError', () => {
  it('has correct defaults', () => {
    const err = new RequestError();
    expect(err.statusCode).toBe(500);
    expect(err.code).toBe(ErrorCode.ERROR);
    expect(err.message).toBe('An error occurred');
    expect(err.status).toBe('error');
    expect(err.name).toBe('RequestError');
  });

  it('accepts a custom code and message', () => {
    const err = new RequestError(ErrorCode.ERROR, 'kaboom');
    expect(err.message).toBe('kaboom');
  });

  it('is an instance of Error', () => {
    expect(new RequestError()).toBeInstanceOf(Error);
  });

  it('toJSON returns status, code, message only', () => {
    const json = new RequestError().toJSON();
    expect(json).toEqual({
      status: 'error',
      code: ErrorCode.ERROR,
      message: 'An error occurred',
    });
    expect(json).not.toHaveProperty('statusCode');
    expect(json).not.toHaveProperty('name');
  });
});

describe('BadRequestError', () => {
  it('has correct defaults', () => {
    const err = new BadRequestError();
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe(ErrorCode.BAD_REQUEST);
    expect(err.message).toBe('Invalid data in request');
    expect(err.name).toBe('BadRequestError');
  });

  it('accepts a custom message', () => {
    expect(new BadRequestError('nope').message).toBe('nope');
  });

  it('is instanceof RequestError and Error', () => {
    const err = new BadRequestError();
    expect(err).toBeInstanceOf(RequestError);
    expect(err).toBeInstanceOf(Error);
  });
});

describe('NotFoundError', () => {
  it('has correct defaults', () => {
    const err = new NotFoundError();
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe(ErrorCode.NOT_FOUND);
    expect(err.message).toBe('Not Found');
    expect(err.name).toBe('NotFoundError');
  });

  it('accepts a custom message', () => {
    expect(new NotFoundError('gone').message).toBe('gone');
  });

  it('is instanceof RequestError and Error', () => {
    const err = new NotFoundError();
    expect(err).toBeInstanceOf(RequestError);
    expect(err).toBeInstanceOf(Error);
  });
});

describe('UnauthorizedError', () => {
  it('has correct defaults', () => {
    const err = new UnauthorizedError();
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe(ErrorCode.UNAUTHORIZED);
    expect(err.message).toBe('Unauthorized');
    expect(err.name).toBe('UnauthorizedError');
  });

  it('accepts a custom message', () => {
    expect(new UnauthorizedError('who?').message).toBe('who?');
  });

  it('is instanceof RequestError and Error', () => {
    const err = new UnauthorizedError();
    expect(err).toBeInstanceOf(RequestError);
    expect(err).toBeInstanceOf(Error);
  });
});

describe('ForbiddenError', () => {
  it('has correct defaults', () => {
    const err = new ForbiddenError();
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe(ErrorCode.FORBIDDEN);
    expect(err.message).toBe('Forbidden');
    expect(err.name).toBe('ForbiddenError');
  });

  it('accepts a custom message', () => {
    expect(new ForbiddenError('denied').message).toBe('denied');
  });

  it('is instanceof RequestError and Error', () => {
    const err = new ForbiddenError();
    expect(err).toBeInstanceOf(RequestError);
    expect(err).toBeInstanceOf(Error);
  });
});

describe('PayloadTooLargeError', () => {
  it('has correct defaults', () => {
    const err = new PayloadTooLargeError();
    expect(err.statusCode).toBe(413);
    expect(err.code).toBe(ErrorCode.PAYLOAD_TOO_LARGE);
    expect(err.message).toBe('Payload too large');
    expect(err.name).toBe('PayloadTooLargeError');
  });

  it('accepts a custom message', () => {
    expect(new PayloadTooLargeError('too big').message).toBe('too big');
  });

  it('is instanceof RequestError and Error', () => {
    const err = new PayloadTooLargeError();
    expect(err).toBeInstanceOf(RequestError);
    expect(err).toBeInstanceOf(Error);
  });
});
