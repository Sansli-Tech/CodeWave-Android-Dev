package com.example.mustudentsync.network.dto;

/** Every server error looks like { "error": { "code": "...", "message": "..." } }. */
public class ErrorResponse {

    private ErrorBody error;

    public String getCode() { return error != null ? error.code : null; }
    public String getMessage() { return error != null ? error.message : null; }

    private static class ErrorBody {
        String code;
        String message;
    }
}
