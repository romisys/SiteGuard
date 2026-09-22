class ServiceError(Exception):
    """Base for errors the API maps to HTTP status codes."""


class UnsupportedMediaType(ServiceError):
    pass


class FileTooLarge(ServiceError):
    pass


class AnalysisNotFound(ServiceError):
    pass


class InvalidState(ServiceError):
    pass


class AnalyzerError(ServiceError):
    """Gemini call failed (network, quota, file processing)."""


class InvalidModelOutput(AnalyzerError):
    """Gemini answered but the JSON did not match the contract."""


class StorageError(ServiceError):
    """Uploading to or reading from blob storage failed."""
