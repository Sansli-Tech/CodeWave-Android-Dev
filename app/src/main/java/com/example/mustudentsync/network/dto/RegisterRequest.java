package com.example.mustudentsync.network.dto;

public class RegisterRequest {
    private String studentName;
    private String studentNumber;
    private String password;
    private String programmeId;
    private String groupId;

    public RegisterRequest(String studentName, String studentNumber, String password,
                            String programmeId, String groupId) {
        this.studentName = studentName;
        this.studentNumber = studentNumber;
        this.password = password;
        this.programmeId = programmeId;
        this.groupId = groupId;
    }
}
