package com.example.mustudentsync.network.dto;

import com.google.gson.annotations.SerializedName;

/** A student as the server sends it. The programme is a CODE (e.g. "CS"), not the name. */
public class StudentDto {

    @SerializedName("student_id")
    private String studentId;
    @SerializedName("student_number")
    private String studentNumber;
    @SerializedName("student_name")
    private String studentName;
    @SerializedName("programme_code")
    private String programmeCode;
    @SerializedName("group_code")
    private String groupCode;     // null means Unassigned
    private int version;          // goes up by 1 on every accepted change
    @SerializedName("is_deleted")
    private boolean deleted;

    public String getStudentId() { return studentId; }
    public String getStudentNumber() { return studentNumber; }
    public String getStudentName() { return studentName; }
    public String getProgrammeCode() { return programmeCode; }
    public String getGroupCode() { return groupCode; }
    public int getVersion() { return version; }
    public boolean isDeleted() { return deleted; }
}
