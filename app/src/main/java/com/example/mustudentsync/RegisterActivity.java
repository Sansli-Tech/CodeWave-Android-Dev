package com.example.mustudentsync;

import android.content.Intent;
import android.os.Bundle;
import android.text.TextUtils;
import android.widget.ArrayAdapter;
import android.widget.AutoCompleteTextView;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.lifecycle.ViewModelProvider;
import com.example.mustudentsync.model.RegistrationDraftEntity;
import com.example.mustudentsync.viewmodel.RegisterViewModel;
import com.google.android.material.button.MaterialButton;
import com.google.android.material.card.MaterialCardView;
import com.google.android.material.textfield.TextInputEditText;
import com.google.android.material.textfield.TextInputLayout;

public class RegisterActivity extends AppCompatActivity {

    private static final String KEY_NAME_ERROR = "key_name_error";
    private static final String KEY_STUDENT_NUM_ERROR = "key_student_num_error";
    private static final String KEY_PROGRAM_ERROR = "key_program_error";
    private static final String KEY_CLAIM_ERROR = "key_claim_error";

    private TextInputLayout tilFullName, tilStudentNumber, tilProgram, tilClaimCode;
    private TextInputEditText etFullName, etStudentNumber, etClaimCode;
    private AutoCompleteTextView actvProgram;
    private MaterialCardView cardOfflineDraftBanner;
    private MaterialButton btnRegister, btnGoToSignIn, btnRegisterAsLecturer;

    private RegisterViewModel viewModel;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_register);

        viewModel = new ViewModelProvider(this).get(RegisterViewModel.class);

        initViews();
        setupProgramDropdown();
        setupListeners();

        if (savedInstanceState != null) {
            // Screen was recreated by rotation — restore inline errors.
            tilFullName.setError(savedInstanceState.getString(KEY_NAME_ERROR));
            tilStudentNumber.setError(savedInstanceState.getString(KEY_STUDENT_NUM_ERROR));
            tilProgram.setError(savedInstanceState.getString(KEY_PROGRAM_ERROR));
            tilClaimCode.setError(savedInstanceState.getString(KEY_CLAIM_ERROR));
        } else {
            // Fresh launch (e.g. after process death) — restore any saved draft from Room,
            // loaded off the main thread so this never crashes the screen on open.
            restoreDraftIfPresent();
        }
    }

    private void restoreDraftIfPresent() {
        viewModel.loadDraftFromRoom(draft -> {
            if (draft != null) {
                etFullName.setText(draft.fullName);
                etStudentNumber.setText(draft.studentNumber);
                actvProgram.setText(draft.program, false);
                etClaimCode.setText(draft.claimCode);
                cardOfflineDraftBanner.setVisibility(android.view.View.VISIBLE);
            }
        });
    }

    private void initViews() {
        tilFullName = findViewById(R.id.tilFullName);
        tilStudentNumber = findViewById(R.id.tilStudentNumber);
        tilProgram = findViewById(R.id.tilProgram);
        tilClaimCode = findViewById(R.id.tilClaimCode);
        etFullName = findViewById(R.id.etFullName);
        etStudentNumber = findViewById(R.id.etStudentNumber);
        actvProgram = findViewById(R.id.actvProgram);
        etClaimCode = findViewById(R.id.etClaimCode);
        cardOfflineDraftBanner = findViewById(R.id.cardOfflineDraftBanner);
        btnRegister = findViewById(R.id.btnRegister);
        btnGoToSignIn = findViewById(R.id.btnGoToSignIn);
        btnRegisterAsLecturer = findViewById(R.id.btnRegisterAsLecturer);
    }

    private void setupProgramDropdown() {
        ProgramDropdownAdapter adapter = ProgramDropdownAdapter.create(this);
        actvProgram.setAdapter(adapter);
        actvProgram.setOnItemClickListener((parent, view, position, id) -> {
            if (!adapter.isEnabled(position)) {
                actvProgram.setText("", false); // tapping a school header clears, doesn't select it
            }
        });
    }

    private void setupListeners() {
        btnRegister.setOnClickListener(v -> validateAndSubmit());
        btnGoToSignIn.setOnClickListener(v -> {
            startActivity(new Intent(this, SignInActivity.class));
            finish();
        });
        btnRegisterAsLecturer.setOnClickListener(v -> {
            startActivity(new Intent(this, RegisterLecturerActivity.class));
            finish();
        });
    }

    private void validateAndSubmit() {
        tilFullName.setError(null);
        tilStudentNumber.setError(null);
        tilProgram.setError(null);
        tilClaimCode.setError(null);

        boolean isValid = true;
        String name = etFullName.getText() != null ? etFullName.getText().toString().trim() : "";
        String number = etStudentNumber.getText() != null ? etStudentNumber.getText().toString().trim() : "";
        String program = actvProgram.getText() != null ? actvProgram.getText().toString().trim() : "";
        String claimCode = etClaimCode.getText() != null ? etClaimCode.getText().toString().trim() : "";

        if (TextUtils.isEmpty(name)) {
            tilFullName.setError(getString(R.string.err_name_empty));
            isValid = false;
        }
        if (TextUtils.isEmpty(number) || number.length() != 9 || !number.matches("\\d{9}")) {
            tilStudentNumber.setError(getString(R.string.err_student_number_invalid));
            isValid = false;
        }
        if (TextUtils.isEmpty(program)) {
            tilProgram.setError(getString(R.string.err_program_unselected));
            isValid = false;
        }
        if (TextUtils.isEmpty(claimCode)) {
            tilClaimCode.setError(getString(R.string.err_claim_code_invalid));
            isValid = false;
        }

        if (isValid) {
            // TODO (Activity C/D): call the real Retrofit registration endpoint here instead.
            String newStudentId = viewModel.registerNewStudent(name, number, program);
            viewModel.clearDraft();
            Intent intent = new Intent(this, StudentProfileActivity.class);
            intent.putExtra("STUDENT_ID", newStudentId);
            startActivity(intent);
            finish();
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        // Persist the in-progress form to Room so it survives process death,
        // not just rotation. Harmless to call even with mostly-empty fields.
        String name = etFullName.getText() != null ? etFullName.getText().toString() : "";
        String number = etStudentNumber.getText() != null ? etStudentNumber.getText().toString() : "";
        String program = actvProgram.getText() != null ? actvProgram.getText().toString() : "";
        String claimCode = etClaimCode.getText() != null ? etClaimCode.getText().toString() : "";

        boolean hasAnyInput = !TextUtils.isEmpty(name) || !TextUtils.isEmpty(number)
                || !TextUtils.isEmpty(program) || !TextUtils.isEmpty(claimCode);

        if (hasAnyInput) {
            viewModel.saveDraftToRoom(name, number, program, claimCode);
        }
    }

    @Override
    protected void onSaveInstanceState(@NonNull Bundle outState) {
        super.onSaveInstanceState(outState);
        if (tilFullName.getError() != null) outState.putString(KEY_NAME_ERROR, tilFullName.getError().toString());
        if (tilStudentNumber.getError() != null) outState.putString(KEY_STUDENT_NUM_ERROR, tilStudentNumber.getError().toString());
        if (tilProgram.getError() != null) outState.putString(KEY_PROGRAM_ERROR, tilProgram.getError().toString());
        if (tilClaimCode.getError() != null) outState.putString(KEY_CLAIM_ERROR, tilClaimCode.getError().toString());
    }
}