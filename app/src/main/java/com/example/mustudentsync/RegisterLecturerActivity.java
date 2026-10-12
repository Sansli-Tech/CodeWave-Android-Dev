package com.example.mustudentsync;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.os.Bundle;
import android.text.Editable;
import android.text.TextUtils;
import android.text.TextWatcher;
import android.util.Patterns;
import android.view.View;
import android.widget.ArrayAdapter;
import android.widget.AutoCompleteTextView;
import android.widget.Filter;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.appcompat.app.AppCompatDelegate;
import com.google.android.material.button.MaterialButton;
import com.google.android.material.card.MaterialCardView;
import com.google.android.material.textfield.TextInputEditText;
import com.google.android.material.textfield.TextInputLayout;
import com.example.mustudentsync.R;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class RegisterLecturerActivity extends AppCompatActivity {

    private static final String PREFS_NAME = "lab_alloc_prefs";
    private static final String KEY_DARK_MODE = "is_dark_mode";

    private static final String KEY_NAME_ERR = "err_lec_name";
    private static final String KEY_STAFF_ERR = "err_lec_staff";
    private static final String KEY_EMAIL_ERR = "err_lec_email";
    private static final String KEY_SCHOOL_ERR = "err_lec_school";
    private static final String KEY_DEPT_ERR = "err_lec_dept";
    private static final String KEY_PASS_ERR = "err_lec_pass";
    private static final String KEY_TOKEN_ERR = "err_lec_token";

    private TextInputLayout tilLecturerName, tilStaffId, tilStaffEmail, tilSchool, tilDepartment, tilLecturerPassword, tilFacultyToken;
    private TextInputEditText etLecturerName, etStaffId, etStaffEmail, etLecturerPassword, etFacultyToken;
    private AutoCompleteTextView actvSchool, actvDepartment;
    private MaterialCardView cardLecturerDraftBanner;
    private MaterialButton btnRegisterLecturer, btnSwitchToStudentReg, btnGoToSignInLecturer;

    // Mulungushi University: schools and the departments under each one.
    // Source: the schools and departments pages on www.mu.ac.zm (checked October 2026).
    // If the university restructures, only this block needs editing.
    private static final Map<String, String[]> SCHOOL_DEPARTMENTS = new LinkedHashMap<>();
    static {
        SCHOOL_DEPARTMENTS.put("School of Business Studies", new String[]{
                "Department of Business Studies",
                "Department of Law, Labour and Human Resource Management",
                "Department of Economics"});
        SCHOOL_DEPARTMENTS.put("School of Engineering and Technology", new String[]{
                "Department of Computer Science and Information Technology",
                "Department of Engineering"});
        SCHOOL_DEPARTMENTS.put("School of Social Sciences", new String[]{
                "Department of Education",
                "Department of Social Development Studies",
                "Department of Political and Administrative Studies"});
        SCHOOL_DEPARTMENTS.put("School of Agriculture and Natural Resources", new String[]{
                "Department of Agricultural Economics and Agribusiness",
                "Department of Natural Resources and Environmental Sciences"});
        SCHOOL_DEPARTMENTS.put("School of Nursing and Midwifery", new String[]{
                "Department of Nursing and Midwifery"});
        SCHOOL_DEPARTMENTS.put("School of Medicine and Health Sciences", new String[]{
                "Department of Clinical Sciences",
                "Department of Physiological Sciences",
                "Department of Pathology and Microbiology",
                "Department of Surgery"});
        SCHOOL_DEPARTMENTS.put("School of Natural and Applied Sciences", new String[]{
                "Department of Mathematics and Statistics",
                "Department of Chemistry and Biology",
                "Department of Physics"});
    }

    // A dropdown adapter that always shows the full list. The normal ArrayAdapter filters by the
    // text already in the box, so after you pick something the list would only show that one item.
    private static class FullListAdapter extends ArrayAdapter<String> {
        private final List<String> items;

        FullListAdapter(Context context, List<String> items) {
            super(context, android.R.layout.simple_dropdown_item_1line, items);
            this.items = items;
        }

        @NonNull
        @Override
        public Filter getFilter() {
            return new Filter() {
                @Override
                protected FilterResults performFiltering(CharSequence constraint) {
                    FilterResults results = new FilterResults();
                    results.values = items;
                    results.count = items.size();
                    return results;
                }

                @Override
                protected void publishResults(CharSequence constraint, FilterResults results) {
                    notifyDataSetChanged();
                }
            };
        }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        applySavedThemePreference();
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_register_lecturer);

        initViews();
        setupDepartmentDropdown();
        setupListeners();

        if (savedInstanceState != null) {
            tilLecturerName.setError(savedInstanceState.getString(KEY_NAME_ERR));
            tilStaffId.setError(savedInstanceState.getString(KEY_STAFF_ERR));
            tilStaffEmail.setError(savedInstanceState.getString(KEY_EMAIL_ERR));
            tilSchool.setError(savedInstanceState.getString(KEY_SCHOOL_ERR));
            tilDepartment.setError(savedInstanceState.getString(KEY_DEPT_ERR));
            tilLecturerPassword.setError(savedInstanceState.getString(KEY_PASS_ERR));
            tilFacultyToken.setError(savedInstanceState.getString(KEY_TOKEN_ERR));
        }

        // TODO: RegisterLecturerViewModel = new ViewModelProvider(this).get(RegisterLecturerViewModel.class);
    }

    private void initViews() {
        tilLecturerName = findViewById(R.id.tilLecturerName);
        tilStaffId = findViewById(R.id.tilStaffId);
        tilStaffEmail = findViewById(R.id.tilStaffEmail);
        tilSchool = findViewById(R.id.tilSchool);
        tilDepartment = findViewById(R.id.tilDepartment);
        tilLecturerPassword = findViewById(R.id.tilLecturerPassword);
        tilFacultyToken = findViewById(R.id.tilFacultyToken);

        etLecturerName = findViewById(R.id.etLecturerName);
        etStaffId = findViewById(R.id.etStaffId);
        etStaffEmail = findViewById(R.id.etStaffEmail);
        etLecturerPassword = findViewById(R.id.etLecturerPassword);
        actvSchool = findViewById(R.id.actvSchool);
        actvDepartment = findViewById(R.id.actvDepartment);
        etFacultyToken = findViewById(R.id.etFacultyToken);

        cardLecturerDraftBanner = findViewById(R.id.cardLecturerDraftBanner);
        btnRegisterLecturer = findViewById(R.id.btnRegisterLecturer);
        btnSwitchToStudentReg = findViewById(R.id.btnSwitchToStudentReg);
        btnGoToSignInLecturer = findViewById(R.id.btnGoToSignInLecturer);
    }

    private void setupDepartmentDropdown() {
        // School first...
        actvSchool.setAdapter(new FullListAdapter(this, new ArrayList<>(SCHOOL_DEPARTMENTS.keySet())));

        // ...then the departments of whichever school is chosen. Department stays locked until then.
        tilDepartment.setEnabled(false);
        actvDepartment.setAdapter(new FullListAdapter(this, new ArrayList<String>()));

        // A TextWatcher (rather than only a click listener) so the department list is also rebuilt
        // when Android restores the school text after a screen rotation.
        actvSchool.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int start, int count, int after) { }
            @Override public void onTextChanged(CharSequence s, int start, int before, int count) { }

            @Override
            public void afterTextChanged(Editable s) {
                applySchool(s != null ? s.toString().trim() : "");
            }
        });
    }

    // Fills the department dropdown with the departments of the given school.
    private void applySchool(String school) {
        String[] departments = SCHOOL_DEPARTMENTS.get(school);
        if (departments == null) {
            tilDepartment.setEnabled(false);
            actvDepartment.setAdapter(new FullListAdapter(this, new ArrayList<String>()));
            actvDepartment.setText("", false);
            return;
        }

        List<String> list = new ArrayList<>(Arrays.asList(departments));
        actvDepartment.setAdapter(new FullListAdapter(this, list));
        tilDepartment.setEnabled(true);

        String current = actvDepartment.getText() != null ? actvDepartment.getText().toString().trim() : "";
        if (!list.contains(current)) {
            // Department from a different school -> clear it. A school with a single department
            // (Nursing and Midwifery) gets that department filled in automatically.
            actvDepartment.setText(list.size() == 1 ? list.get(0) : "", false);
        }
    }

    private void setupListeners() {
        btnRegisterLecturer.setOnClickListener(v -> validateAndSubmit());

        btnSwitchToStudentReg.setOnClickListener(v -> goTo(RegisterActivity.class));
        btnGoToSignInLecturer.setOnClickListener(v -> goTo(SignInActivity.class));
    }

    // Opens another screen WITHOUT finishing this one, so the Back button walks back through the
    // screens you came from instead of closing the whole app. CLEAR_TOP + SINGLE_TOP means that if
    // the target screen is already underneath, we return to that same copy (with what you typed)
    // rather than piling up a second one.
    private void goTo(Class<?> target) {
        Intent intent = new Intent(this, target);
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        startActivity(intent);
    }

    private void applySavedThemePreference() {
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        if (prefs.contains(KEY_DARK_MODE)) {
            boolean isDark = prefs.getBoolean(KEY_DARK_MODE, false);
            AppCompatDelegate.setDefaultNightMode(
                    isDark ? AppCompatDelegate.MODE_NIGHT_YES : AppCompatDelegate.MODE_NIGHT_NO
            );
        }
    }

    private void toggleThemeMode() {
        int currentNightMode = getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK;
        boolean isDark = (currentNightMode == Configuration.UI_MODE_NIGHT_YES);
        boolean targetDark = !isDark;

        getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit().putBoolean(KEY_DARK_MODE, targetDark).apply();

        AppCompatDelegate.setDefaultNightMode(
                targetDark ? AppCompatDelegate.MODE_NIGHT_YES : AppCompatDelegate.MODE_NIGHT_NO
        );
    }

    private void validateAndSubmit() {
        tilLecturerName.setError(null);
        tilStaffId.setError(null);
        tilStaffEmail.setError(null);
        tilSchool.setError(null);
        tilDepartment.setError(null);
        tilLecturerPassword.setError(null);
        tilFacultyToken.setError(null);

        boolean valid = true;
        String name = etLecturerName.getText() != null ? etLecturerName.getText().toString().trim() : "";
        String staffId = etStaffId.getText() != null ? etStaffId.getText().toString().trim() : "";
        String email = etStaffEmail.getText() != null ? etStaffEmail.getText().toString().trim() : "";
        String school = actvSchool.getText() != null ? actvSchool.getText().toString().trim() : "";
        String department = actvDepartment.getText() != null ? actvDepartment.getText().toString().trim() : "";
        String password = etLecturerPassword.getText() != null ? etLecturerPassword.getText().toString() : "";
        String token = etFacultyToken.getText() != null ? etFacultyToken.getText().toString().trim() : "";

        if (TextUtils.isEmpty(name)) {
            tilLecturerName.setError(getString(R.string.err_lec_name_empty));
            valid = false;
        }

        if (TextUtils.isEmpty(staffId)) {
            tilStaffId.setError(getString(R.string.err_staff_id_empty));
            valid = false;
        }

        if (TextUtils.isEmpty(email) || !Patterns.EMAIL_ADDRESS.matcher(email).matches()) {
            tilStaffEmail.setError(getString(R.string.err_staff_email_invalid));
            valid = false;
        }

        if (!SCHOOL_DEPARTMENTS.containsKey(school)) {
            tilSchool.setError(getString(R.string.err_school_unselected));
            valid = false;
        } else if (TextUtils.isEmpty(department)) {
            tilDepartment.setError(getString(R.string.err_department_unselected));
            valid = false;
        }

        if (TextUtils.isEmpty(password) || password.length() < 6) {
            tilLecturerPassword.setError(getString(R.string.err_lec_password_empty));
            valid = false;
        }

        if (TextUtils.isEmpty(token)) {
            tilFacultyToken.setError(getString(R.string.err_faculty_token_invalid));
            valid = false;
        }

        if (valid) {
            // TODO: viewModel.registerLecturer(name, staffId, email, school, department, password, token);
            // TODO: On verification success -> route to LecturerRosterActivity
        }
    }

    @Override
    protected void onSaveInstanceState(@NonNull Bundle outState) {
        super.onSaveInstanceState(outState);
        if (tilLecturerName.getError() != null) outState.putString(KEY_NAME_ERR, tilLecturerName.getError().toString());
        if (tilStaffId.getError() != null) outState.putString(KEY_STAFF_ERR, tilStaffId.getError().toString());
        if (tilStaffEmail.getError() != null) outState.putString(KEY_EMAIL_ERR, tilStaffEmail.getError().toString());
        if (tilSchool.getError() != null) outState.putString(KEY_SCHOOL_ERR, tilSchool.getError().toString());
        if (tilDepartment.getError() != null) outState.putString(KEY_DEPT_ERR, tilDepartment.getError().toString());
        if (tilLecturerPassword.getError() != null) outState.putString(KEY_PASS_ERR, tilLecturerPassword.getError().toString());
        if (tilFacultyToken.getError() != null) outState.putString(KEY_TOKEN_ERR, tilFacultyToken.getError().toString());
    }
}
