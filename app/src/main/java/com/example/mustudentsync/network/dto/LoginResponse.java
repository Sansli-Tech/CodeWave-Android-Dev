package com.example.mustudentsync.network.dto;

/** Reply to POST /auth/login. "student" is set for students, "lecturer" for lecturers. */
public class LoginResponse {

    private String token;
    private String role;          // "student" or "lecturer"
    private StudentDto student;   // null for lecturers
    private LecturerDto lecturer; // null for students

    public String getToken() { return token; }
    public String getRole() { return role; }
    public StudentDto getStudent() { return student; }
    public LecturerDto getLecturer() { return lecturer; }
}
