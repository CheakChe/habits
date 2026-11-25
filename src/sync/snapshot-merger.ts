import {
  DomainSnapshot,
  Habit,
  HabitCheckin,
  HabitNote,
  ReminderSlot,
  Task,
} from '../types/domain';

export class SnapshotMerger {
  public static merge(local: DomainSnapshot, remote: DomainSnapshot): DomainSnapshot {
    // 1. Resolve offline habit ID collisions deterministically using immutable createdAt.
    let nextHabitId = 1;
    for (const h of remote.habits) {
      if (h.id >= nextHabitId) nextHabitId = h.id + 1;
    }
    for (const h of local.habits) {
      if (h.id >= nextHabitId) nextHabitId = h.id + 1;
    }

    const remoteHabitIdMap = new Map<number, number>();
    const localHabitIdMap = new Map<number, number>();
    const remoteById = new Map<number, Habit>();

    for (const rh of remote.habits) {
      remoteById.set(rh.id, rh);
    }

    const habitMap = new Map<number, Habit>();
    for (const rh of remote.habits) {
      habitMap.set(rh.id, rh);
    }

    for (const lh of local.habits) {
      const rh = remoteById.get(lh.id);
      if (!rh) {
        habitMap.set(lh.id, lh);
        continue;
      }

      if (lh.createdAt === rh.createdAt) {
        // Same habit edited on both devices -> newest updatedAt wins
        if (lh.updatedAt >= rh.updatedAt) {
          habitMap.set(lh.id, lh);
        }
      } else {
        // Offline ID collision: two distinct habits created independently!
        // Earlier createdAt keeps the original id; later createdAt gets nextHabitId.
        const newId = nextHabitId++;
        if (lh.createdAt < rh.createdAt) {
          habitMap.set(lh.id, lh);
          habitMap.set(newId, { ...rh, id: newId });
          remoteHabitIdMap.set(rh.id, newId);
        } else {
          habitMap.set(newId, { ...lh, id: newId });
          localHabitIdMap.set(lh.id, newId);
        }
      }
    }

    // 2. Merge checkins after remapping any reassigned habitIds
    const checkinMap = new Map<string, HabitCheckin>();
    for (const rc of remote.checkins) {
      const mappedId = remoteHabitIdMap.get(rc.habitId) ?? rc.habitId;
      const normalized = mappedId === rc.habitId ? rc : { ...rc, habitId: mappedId };
      checkinMap.set(`${normalized.habitId}:${normalized.dayIndex}`, normalized);
    }
    for (const lc of local.checkins) {
      const mappedId = localHabitIdMap.get(lc.habitId) ?? lc.habitId;
      const normalized = mappedId === lc.habitId ? lc : { ...lc, habitId: mappedId };
      const key = `${normalized.habitId}:${normalized.dayIndex}`;
      const existing = checkinMap.get(key);
      if (!existing || normalized.updatedAt >= existing.updatedAt) {
        checkinMap.set(key, normalized);
      }
    }

    // 3. Merge notes after remapping any reassigned habitIds
    const noteMap = new Map<string, HabitNote>();
    for (const rn of remote.notes) {
      const mappedId = remoteHabitIdMap.get(rn.habitId) ?? rn.habitId;
      const normalized = mappedId === rn.habitId ? rn : { ...rn, habitId: mappedId };
      noteMap.set(`${normalized.habitId}:${normalized.dayIndex}`, normalized);
    }
    for (const ln of local.notes) {
      const mappedId = localHabitIdMap.get(ln.habitId) ?? ln.habitId;
      const normalized = mappedId === ln.habitId ? ln : { ...ln, habitId: mappedId };
      const key = `${normalized.habitId}:${normalized.dayIndex}`;
      const existing = noteMap.get(key);
      if (!existing || normalized.updatedAt >= existing.updatedAt) {
        noteMap.set(key, normalized);
      }
    }

    // 4. Resolve offline task ID collisions & merge tombstones by updatedAt
    let nextTaskId = 1;
    for (const t of remote.tasks) {
      if (t.id >= nextTaskId) nextTaskId = t.id + 1;
    }
    for (const t of local.tasks) {
      if (t.id >= nextTaskId) nextTaskId = t.id + 1;
    }

    const remoteTaskById = new Map<number, Task>();
    const taskMap = new Map<number, Task>();
    for (const rt of remote.tasks) {
      remoteTaskById.set(rt.id, rt);
      taskMap.set(rt.id, rt);
    }

    for (const lt of local.tasks) {
      const rt = remoteTaskById.get(lt.id);
      if (!rt) {
        taskMap.set(lt.id, lt);
        continue;
      }

      if (lt.createdAt === rt.createdAt) {
        if (lt.updatedAt >= rt.updatedAt) {
          taskMap.set(lt.id, lt);
        }
      } else {
        const newId = nextTaskId++;
        if (lt.createdAt < rt.createdAt) {
          taskMap.set(lt.id, lt);
          taskMap.set(newId, { ...rt, id: newId });
        } else {
          taskMap.set(newId, { ...lt, id: newId });
        }
      }
    }

    // 5. Merge reminderSlots by immutable UUID string ID using LWW + tombstones
    const slotMap = new Map<string, ReminderSlot>();
    for (const rs of remote.reminderSlots ?? []) {
      slotMap.set(rs.id, rs);
    }
    for (const ls of local.reminderSlots ?? []) {
      const existing = slotMap.get(ls.id);
      if (!existing || ls.updatedAt >= existing.updatedAt) {
        slotMap.set(ls.id, ls);
      }
    }
    const mergedSlots = Array.from(slotMap.values()).sort(
      (a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id)
    );

    return {
      habits: Array.from(habitMap.values()).sort((a, b) => a.id - b.id),
      checkins: Array.from(checkinMap.values()).sort(
        (a, b) => a.habitId - b.habitId || a.dayIndex - b.dayIndex
      ),
      notes: Array.from(noteMap.values()).sort(
        (a, b) => a.habitId - b.habitId || a.dayIndex - b.dayIndex
      ),
      tasks: Array.from(taskMap.values()).sort((a, b) => a.id - b.id),
      ...(mergedSlots.length > 0 ? { reminderSlots: mergedSlots } : {}),
    };
  }

  /**
   * Rebases updatedAt timestamps on a restored historical snapshot so it stays
   * strictly newer than any known local or remote edits in LWW merges, while
   * preserving immutable createdAt identities and completedDay history.
   */
  public static rebaseForRestore(
    target: DomainSnapshot,
    againstSnapshots: DomainSnapshot[] = [],
    now: number = Date.now()
  ): DomainSnapshot {
    let maxUpdatedAt = 0;
    const scan = (snap: DomainSnapshot) => {
      for (const h of snap.habits) {
        if (h.updatedAt > maxUpdatedAt) maxUpdatedAt = h.updatedAt;
      }
      for (const c of snap.checkins) {
        if (c.updatedAt > maxUpdatedAt) maxUpdatedAt = c.updatedAt;
      }
      for (const n of snap.notes) {
        if (n.updatedAt > maxUpdatedAt) maxUpdatedAt = n.updatedAt;
      }
      for (const t of snap.tasks) {
        if (t.updatedAt > maxUpdatedAt) maxUpdatedAt = t.updatedAt;
      }
      for (const s of snap.reminderSlots ?? []) {
        if (s.updatedAt > maxUpdatedAt) maxUpdatedAt = s.updatedAt;
      }
    };

    scan(target);
    for (const snap of againstSnapshots) {
      scan(snap);
    }

    const restoreTs = Math.max(now, maxUpdatedAt + 1);

    return {
      habits: target.habits.map((h) => ({ ...h, updatedAt: restoreTs })),
      checkins: target.checkins.map((c) => ({ ...c, updatedAt: restoreTs })),
      notes: target.notes.map((n) => ({ ...n, updatedAt: restoreTs })),
      tasks: target.tasks.map((t) => ({ ...t, updatedAt: restoreTs })),
      ...(target.reminderSlots && target.reminderSlots.length > 0
        ? {
            reminderSlots: target.reminderSlots.map((s) => ({ ...s, updatedAt: restoreTs })),
          }
        : {}),
    };
  }
}
