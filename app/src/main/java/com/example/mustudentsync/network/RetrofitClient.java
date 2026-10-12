package com.example.mustudentsync.network;

import java.util.concurrent.TimeUnit;

import okhttp3.OkHttpClient;
import okhttp3.logging.HttpLoggingInterceptor;
import retrofit2.Retrofit;
import retrofit2.converter.gson.GsonConverterFactory;

public class RetrofitClient {

    // Emulator:           http://10.0.2.2:3000/api/
    // USB phone:          http://localhost:3000/api/   (after: adb reverse tcp:3000 tcp:3000)
    // Hosted backend:     https://your-host/api/       (HTTPS is required for the remote backend)
    // The trailing slash matters.
    public static final String BASE_URL = "http://localhost:3000/api/";

    private static Retrofit retrofit;

    public static synchronized Retrofit getInstance() {
        if (retrofit == null) {
            // BASIC logs method, URL and status in Logcat (filter by tag "OkHttp").
            // Not BODY: the body of a sign-in request contains the password, and the
            // Authorization header carries the session token. Neither belongs in a log.
            HttpLoggingInterceptor logging = new HttpLoggingInterceptor();
            logging.setLevel(HttpLoggingInterceptor.Level.BASIC);
            logging.redactHeader("Authorization");

            // Timeouts so a dead server shows an error in seconds instead of hanging.
            OkHttpClient client = new OkHttpClient.Builder()
                    .connectTimeout(10, TimeUnit.SECONDS)
                    .readTimeout(15, TimeUnit.SECONDS)
                    .writeTimeout(15, TimeUnit.SECONDS)
                    .addInterceptor(logging)
                    .build();

            retrofit = new Retrofit.Builder()
                    .baseUrl(BASE_URL)
                    .client(client)
                    .addConverterFactory(GsonConverterFactory.create())
                    .build();
        }
        return retrofit;
    }

    public static ApiService getApiService() {
        return getInstance().create(ApiService.class);
    }
}
