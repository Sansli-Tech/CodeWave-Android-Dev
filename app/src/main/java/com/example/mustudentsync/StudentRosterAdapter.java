package com.example.mustudentsync;

import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageButton;
import android.widget.TextView;
import androidx.annotation.NonNull;
import androidx.appcompat.widget.PopupMenu;
import androidx.recyclerview.widget.RecyclerView;
import com.example.mustudentsync.model.StudentEntity;
import com.google.android.material.chip.Chip;

import java.util.ArrayList;
import java.util.List;

public class StudentRosterAdapter extends RecyclerView.Adapter<StudentRosterAdapter.StudentViewHolder> {

    // Unchanged: LecturerRosterActivity keeps implementing exactly this interface.
    public interface OnStudentActionListener {
        void onEditClicked(StudentEntity student);
        void onDeleteClicked(StudentEntity student);
    }

    private List<StudentEntity> students = new ArrayList<>();
    private final OnStudentActionListener listener;

    public StudentRosterAdapter(OnStudentActionListener listener) {
        this.listener = listener;
    }

    /** Call this from the Activity's LiveData observer whenever the roster changes. */
    public void submitList(List<StudentEntity> newList) {
        this.students = newList != null ? newList : new ArrayList<>();
        notifyDataSetChanged(); // simple approach; swap for DiffUtil later if the list grows large
    }

    @NonNull
    @Override
    public StudentViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        View view = LayoutInflater.from(parent.getContext())
                .inflate(R.layout.item_roster_student, parent, false);
        return new StudentViewHolder(view);
    }

    @Override
    public void onBindViewHolder(@NonNull StudentViewHolder holder, int position) {
        StudentEntity student = students.get(position);
        holder.name.setText(student.fullName);
        holder.details.setText(String.format("ID: %s \u2022 Program: %s", student.studentNumber, student.program));
        holder.groupChip.setText(student.labGroup);

        // TalkBack reads "More options for <name>" so each row's button is distinguishable.
        holder.overflowButton.setContentDescription(
                holder.itemView.getContext().getString(R.string.roster_more_options_for, student.fullName));
        holder.overflowButton.setOnClickListener(v -> showOverflowMenu(v, student));
    }

    // Opens the little Edit / Delete popup anchored to the 3-dot button.
    private void showOverflowMenu(View anchor, StudentEntity student) {
        PopupMenu popup = new PopupMenu(anchor.getContext(), anchor);
        popup.getMenuInflater().inflate(R.menu.menu_roster_item, popup.getMenu());
        popup.setOnMenuItemClickListener(item -> {
            int id = item.getItemId();
            if (id == R.id.action_edit_student) {
                listener.onEditClicked(student);       // opens the Student Editor, as before
                return true;
            } else if (id == R.id.action_delete_student) {
                listener.onDeleteClicked(student);     // shows the confirm dialog, as before
                return true;
            }
            return false;
        });
        popup.show();
    }

    @Override
    public int getItemCount() {
        return students.size();
    }

    static class StudentViewHolder extends RecyclerView.ViewHolder {
        TextView name, details;
        Chip groupChip;
        ImageButton overflowButton;

        StudentViewHolder(@NonNull View itemView) {
            super(itemView);
            name = itemView.findViewById(R.id.tvItemStudentName);
            details = itemView.findViewById(R.id.tvItemStudentDetails);
            groupChip = itemView.findViewById(R.id.chipItemGroup);
            overflowButton = itemView.findViewById(R.id.btnItemOverflow);
        }
    }
}
