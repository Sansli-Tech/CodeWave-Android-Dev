package com.example.mustudentsync.util;

import android.content.Context;
import android.content.SharedPreferences;

// A thin wrapper around SharedPreferences for the logged-in user's session.
// Not encrypted storage -- fine for this assignment's scope, but worth knowing
// that EncryptedSharedPreferences exists if your brief later asks for it.
public class SessionManager {

    private static final String PREFS_NAME = "mu_studentsync_session";
    private static final String KEY_TOKEN = "token";
    private static final String KEY_ROLE = "role";
    private static final String KEY_STUDENT_ID = "student_id";

    private final SharedPreferences prefs;

    public SessionManager(Context context) {
        prefs = context.getApplicationContext()
                .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    public void saveSession(String token, String role, String studentId) {
        prefs.edit()
                .putString(KEY_TOKEN, token)
                .putString(KEY_ROLE, role)
                .putString(KEY_STUDENT_ID, studentId)
                .apply();
    }

    public String getToken() {
        return prefs.getString(KEY_TOKEN, null);
    }

    // Convenience: formatted ready to drop straight into an Authorization header.
    public String getBearerToken() {
        String token = getToken();
        return token != null ? "Bearer " + token : null;
    }

    public String getRole() {
        return prefs.getString(KEY_ROLE, null);
    }

    public String getStudentId() {
        return prefs.getString(KEY_STUDENT_ID, null);
    }

    public boolean isLoggedIn() {
        return getToken() != null;
    }

    public void clearSession() {
        prefs.edit().clear().apply();
    }
}
