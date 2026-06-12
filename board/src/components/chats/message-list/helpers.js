export function formatTime(timestamp) {
  if (!timestamp) return ''

  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp))
}

export function getFileExtension(filename) {
  if (!filename) return ''
  const parts = filename.split('.')
  return parts.length > 1 ? parts.pop().toLowerCase() : ''
}

const ERROR_CODE_TO_I18N_KEY = {
  SERVICE_OVERLOADED: 'serviceOverloaded',
  RATE_LIMITED: 'rateLimited',
  AUTH_FAILED: 'authFailed',
  PERMISSION_DENIED: 'permissionDenied',
  PERMISSION_ERROR: 'permissionDenied',
  NOT_FOUND: 'notFound',
  INVALID_REQUEST: 'invalidRequest',
  VALIDATION_ERROR: 'invalidRequest',
  API_ERROR: 'apiError',
  SERVICE_UNAVAILABLE: 'serviceUnavailable',
  NETWORK_ERROR: 'networkError',
  TIMEOUT: 'timeout',
  TIMEOUT_ERROR: 'timeout',
  CANCELLED: 'cancelled',
  TOOL_ERROR: 'toolError',
  PROVIDER_ERROR: 'providerError',
  SYSTEM_ERROR: 'systemError',
  CUSTOM_ERROR: 'systemError',
  RUNTIME_ERROR: 'systemError',
  UNKNOWN_ERROR: 'unknown',
  // Ravens PascalCase error names
  UnknownError: 'unknown',
  ServiceOverloaded: 'serviceOverloaded',
  RateLimited: 'rateLimited',
  AuthFailed: 'authFailed',
  PermissionDenied: 'permissionDenied',
  NotFound: 'notFound',
  InvalidRequest: 'invalidRequest',
  ApiError: 'apiError',
  ServiceUnavailable: 'serviceUnavailable',
  NetworkError: 'networkError',
  Timeout: 'timeout',
  ToolError: 'toolError',
  ProviderError: 'providerError',
  SystemError: 'systemError',
  Cancelled: 'cancelled',
}

export function getErrorMessage(errorCode, errorMessage, errorTranslations) {
  const i18nKey = ERROR_CODE_TO_I18N_KEY[errorCode]
  if (i18nKey && errorTranslations[i18nKey]) {
    return errorTranslations[i18nKey]
  }
  // errorMessage may be a ravens error object {name, data: {message}}
  const message = typeof errorMessage === 'string'
    ? errorMessage
    : errorMessage?.data?.message || errorMessage?.message
  return message || errorTranslations.unknown
}
