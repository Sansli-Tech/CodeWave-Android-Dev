package com.example.mustudentsync.network.dto;

import com.google.gson.annotations.SerializedName;

/** Body of POST /auth/login. login_id is the 9-digit student number OR the staff email. */
public class LoginRequest {

    @SerializedName("login_id")
    private final String loginId;
    private final String password;

    public LoginRequest(String loginId, String password) {
        this.loginId = loginId;
        this.password = password;
    }
}
