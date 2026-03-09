class ApiError extends Error {
  constructor(message, statusCode, errors = null) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}
const asyncHandler = fn => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
const notFound = (req, res, next) => {
  const error = new ApiError(`Route ${req.originalUrl} not found`, 404);
  next(error);
};
const errorHandler = (err, req, res, next) => {
  let error = {
    ...err
  };
  error.message = err.message;
  if (process.env.NODE_ENV === 'development') {
    console.error('Error:', err);
  }
  if (err.name === 'CastError') {
    error = new ApiError('Resource not found', 404);
  }
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    const message = `${field.charAt(0).toUpperCase() + field.slice(1)} already exists`;
    error = new ApiError(message, 400);
  }
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map(e => e.message);
    error = new ApiError(messages.join(', '), 400, messages);
  }
  if (err.name === 'JsonWebTokenError') {
    error = new ApiError('Invalid token', 401);
  }
  if (err.name === 'TokenExpiredError') {
    error = new ApiError('Token expired', 401);
  }
  res.status(error.statusCode || 500).json({
    success: false,
    error: error.message || 'Server Error',
    errors: error.errors || null,
    ...(process.env.NODE_ENV === 'development' && {
      stack: err.stack
    })
  });
};
module.exports = {
  ApiError,
  asyncHandler,
  notFound,
  errorHandler
};
