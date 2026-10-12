package com.example.mustudentsync.network.dto;

public class RegisterResponse {
    private String token;
    private String studentId;
    private String studentName;
    private String studentNumber;
    private String role;

    public String getToken() { return token; }
    public String getStudentId() { return studentId; }
    public String getStudentName() { return studentName; }
    public String getStudentNumber() { return studentNumber; }
    public String getRole() { return role; }
}
