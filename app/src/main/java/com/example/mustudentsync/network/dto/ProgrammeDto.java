package com.example.mustudentsync.network.dto;

import com.google.gson.annotations.SerializedName;

public class ProgrammeDto {
    @SerializedName("programme_id")
    private String programmeId;

    @SerializedName("programme_name")
    private String programmeName;

    public String getProgrammeId() { return programmeId; }
    public String getProgrammeName() { return programmeName; }
}
