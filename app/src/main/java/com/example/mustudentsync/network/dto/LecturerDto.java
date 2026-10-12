package com.example.mustudentsync.network.dto;

import com.google.gson.annotations.SerializedName;

/** A lecturer's profile as the server sends it. */
public class LecturerDto {

    @SerializedName("lecturer_id")
    private String lecturerId;
    @SerializedName("full_name")
    private String fullName;
    @SerializedName("staff_id")
    private String staffId;
    @SerializedName("staff_email")
    private String staffEmail;
    @SerializedName("school_code")
    private String schoolCode;
    @SerializedName("department_code")
    private String departmentCode;

    public String getLecturerId() { return lecturerId; }
    public String getFullName() { return fullName; }
    public String getStaffId() { return staffId; }
    public String getStaffEmail() { return staffEmail; }
    public String getSchoolCode() { return schoolCode; }
    public String getDepartmentCode() { return departmentCode; }
}
