package com.example.mustudentsync.network;

import com.example.mustudentsync.network.dto.LoginRequest;
import com.example.mustudentsync.network.dto.LoginResponse;

import retrofit2.Call;
import retrofit2.http.Body;
import retrofit2.http.POST;

/**
 * Calls to the StudentSync backend (see API_CONTRACT.md).
 * Only sign-in is wired so far. Registration, roster and sync calls are added in the next steps.
 */
public interface ApiService {

    @POST("auth/login")
    Call<LoginResponse> login(@Body LoginRequest request);
}
