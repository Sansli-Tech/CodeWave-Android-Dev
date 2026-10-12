package com.example.mustudentsync.network.dto;

public class GroupDto {
    private String groupId;
    private String groupName;
    private int capacity;
    private int currentCount;
    private boolean isFull;

    public String getGroupId() { return groupId; }
    public String getGroupName() { return groupName; }
    public int getCapacity() { return capacity; }
    public int getCurrentCount() { return currentCount; }
    public boolean isFull() { return isFull; }
}
