"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { ckScore, scoreItems, type DailyGoals, type ScoreItem } from "@ck/core";
import {
  addSteps as addStepsAction,
  addWater as addWaterAction,
  setSteps as setStepsAction,
  undoWater as undoWaterAction,
} from "@/app/(app)/actions";

interface DayState {
  waterMl: number;
  steps: number;
  checkinDone: boolean;
}

interface DayContextValue extends DayState {
  goals: DailyGoals;
  workoutScheduled: boolean;
  workoutDone: boolean;
  weighScheduled: boolean;
  weighDone: boolean;
  score: number;
  items: ScoreItem[];
  error?: string;
  addWater: (ml: number) => Promise<void>;
  undoWater: () => Promise<void>;
  saveSteps: (steps: number) => Promise<void>;
  addSteps: (amount: number) => Promise<void>;
  markCheckinDone: () => void;
}

const DayContext = createContext<DayContextValue | null>(null);

export function useDay(): DayContextValue {
  const v = useContext(DayContext);
  if (!v) throw new Error("useDay must be used inside DayProvider");
  return v;
}

/**
 * Holds today's numbers on the client so water, steps and the check-in update the CK Score
 * instantly. The server still saves every change; if a save fails the number is put back.
 */
export function DayProvider({
  initial,
  goals,
  workoutScheduled,
  workoutDone,
  weighScheduled,
  weighDone,
  children,
}: {
  initial: DayState;
  goals: DailyGoals;
  workoutScheduled: boolean;
  workoutDone: boolean;
  weighScheduled: boolean;
  weighDone: boolean;
  children: React.ReactNode;
}) {
  const [state, setState] = useState<DayState>(initial);
  const [error, setError] = useState<string>();
  const recentAdds = useRef<number[]>([]);

  // When the server sends fresh numbers (after a save or navigation), take them.
  const {
    waterMl: serverWater,
    steps: serverSteps,
    checkinDone: serverCheckin,
  } = initial;
  useEffect(() => {
    setState({ waterMl: serverWater, steps: serverSteps, checkinDone: serverCheckin });
  }, [serverWater, serverSteps, serverCheckin]);

  const input = {
    workoutScheduled,
    workoutDone,
    waterMl: state.waterMl,
    steps: state.steps,
    checkinDone: state.checkinDone,
    weighScheduled,
    weighDone,
  };
  const fail = (previous: DayState, message: string) => {
    setState(previous);
    setError(message);
  };

  const value: DayContextValue = {
    ...state,
    goals,
    workoutScheduled,
    workoutDone,
    weighScheduled,
    weighDone,
    error,
    score: ckScore(input, goals),
    items: scoreItems(input, goals),
    async addWater(ml) {
      const previous = state;
      setError(undefined);
      setState({ ...state, waterMl: state.waterMl + ml });
      recentAdds.current.push(ml);
      const r = await addWaterAction(ml);
      if (r.error) {
        recentAdds.current.pop();
        fail(previous, r.error);
      }
    },
    async undoWater() {
      const previous = state;
      setError(undefined);
      // Guess the amount instantly, then correct it with what the server actually removed.
      const guess = recentAdds.current.pop() ?? 250;
      setState({ ...state, waterMl: Math.max(0, state.waterMl - guess) });
      const r = await undoWaterAction();
      if (r.error) return fail(previous, r.error);
      if (typeof r.removed === "number" && r.removed !== guess)
        setState((s) => ({
          ...s,
          waterMl: Math.max(0, s.waterMl + guess - (r.removed ?? 0)),
        }));
    },
    async saveSteps(steps) {
      const previous = state;
      setError(undefined);
      setState({ ...state, steps });
      const fd = new FormData();
      fd.set("steps", String(steps));
      try {
        await setStepsAction(fd);
      } catch {
        fail(previous, "We could not save your steps. Please try again.");
      }
    },
    async addSteps(amount) {
      const previous = state;
      setError(undefined);
      setState({ ...state, steps: Math.min(100000, state.steps + amount) });
      try {
        await addStepsAction(amount);
      } catch {
        fail(previous, "We could not save your steps. Please try again.");
      }
    },
    markCheckinDone: () => setState((s) => ({ ...s, checkinDone: true })),
  };
  return <DayContext.Provider value={value}>{children}</DayContext.Provider>;
}
