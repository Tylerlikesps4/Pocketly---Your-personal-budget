import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState, Platform } from "react-native";
import {
  EMPTY_DATA,
  createDemoData,
  monthKey,
  validData,
  type BudgetData,
} from "@/lib/budget";
import {
  fetchRates,
  ratesFresh,
  money,
  todayKey,
  type RateSnapshot,
} from "@/lib/currency";
import { postDue } from "@/lib/recurring";

const KEY = "pocketly.budget.v1";
type Context = {
  data: BudgetData;
  demo: boolean;
  ready: boolean;
  error: string;
  recoveryRequired: boolean;
  recurringWarning: string;
  month: string;
  setMonth: (v: string) => void;
  update: (fn: (data: BudgetData) => BudgetData) => void;
  startFresh: () => void;
  viewDemo: () => void;
  leaveDemo: () => void;
  money: (amount: number) => string;
  refreshRates: (force?: boolean) => Promise<RateSnapshot | undefined>;
  ratesLoading: boolean;
  ratesError: string;
};
const BudgetContext = createContext<Context | null>(null);
export function BudgetProvider({ children }: { children: React.ReactNode }) {
  const [stored, setStored] = useState<BudgetData>(EMPTY_DATA);
  const [demo, setDemo] = useState(true);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [recoveryRequired, setRecoveryRequired] = useState(false);
  const [month, setMonth] = useState(monthKey());
  const [ratesLoading, setRatesLoading] = useState(false);
  const [ratesError, setRatesError] = useState("");
  const [recurringWarning, setRecurringWarning] = useState("");
  const queue = useRef(Promise.resolve());
  const storedRef = useRef(stored);
  const lastRateAttempt = useRef(0);
  const refreshPromise = useRef<Promise<RateSnapshot | undefined> | null>(null);

  const persist = useCallback((next: BudgetData, showPersonal = true) => {
    storedRef.current = next;
    setStored(next);
    if (showPersonal) setDemo(false);
    queue.current = queue.current.then(async () => {
      try {
        await AsyncStorage.setItem(KEY, JSON.stringify(next));
        setError("");
      } catch {
        setError(
          "Local storage is unavailable or full. Changes are in memory only. Export a backup before closing this app.",
        );
      }
    });
  }, []);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (!alive || !raw) return;
        const parsed: unknown = JSON.parse(raw);
        if (!validData(parsed)) throw new Error("Invalid stored data");
        storedRef.current = parsed;
        setStored(parsed);
        setDemo(false);
      })
      .catch(() => {
        if (!alive) return;
        setError(
          "Your saved data could not be read. Nothing was overwritten. Edits are paused to protect it. Check browser storage access or explicitly clear the local budget in Data & settings.",
        );
        setRecoveryRequired(true);
        setDemo(false);
      })
      .finally(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== KEY || !e.newValue) return;
      try {
        const d: unknown = JSON.parse(e.newValue);
        if (validData(d)) {
          storedRef.current = d;
          setStored(d);
          setRecoveryRequired(false);
          setError("");
        }
      } catch {
        /* Retain the last valid local dataset. */
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const refreshRates = useCallback(
    (force = false): Promise<RateSnapshot | undefined> => {
      if (recoveryRequired)
        return Promise.reject(
          new Error("Edits are paused to protect unreadable saved data."),
        );
      if (!force && ratesFresh(storedRef.current.rates))
        return Promise.resolve(storedRef.current.rates);
      if (refreshPromise.current) return refreshPromise.current;
      lastRateAttempt.current = Date.now();
      setRatesLoading(true);
      const promise = fetchRates()
        .then((snapshot) => {
          const withRates = { ...storedRef.current, rates: snapshot };
          const due = postDue(withRates, todayKey());
          persist(due.data, false);
          setRecurringWarning(
            due.blocked.length
              ? `Some recurring entries are waiting for a usable conversion: ${due.blocked.map((id) => due.data.recurring?.find((r) => r.id === id)?.note || due.data.categories.find((c) => c.id === due.data.recurring?.find((r) => r.id === id)?.categoryId)?.name || "Schedule").join(", ")}`
              : "",
          );
          setRatesError("");
          return snapshot;
        })
        .catch(() => {
          const message = storedRef.current.rates
            ? `Could not refresh rates. Using cached reference rates from ${storedRef.current.rates.date}.`
            : "Exchange rates are unavailable. Home-currency entries still work; foreign entries need a rate before saving.";
          setRatesError(message);
          throw new Error(message);
        })
        .finally(() => {
          setRatesLoading(false);
          refreshPromise.current = null;
        });
      refreshPromise.current = promise;
      return promise;
    },
    [persist, recoveryRequired],
  );

  useEffect(() => {
    if (!ready || demo || recoveryRequired) return;
    const run = () => {
      if (Platform.OS === "web" && document.visibilityState === "hidden")
        return;
      if (Platform.OS !== "web" && AppState.currentState !== "active") return;
      const result = postDue(storedRef.current, todayKey());
      if (result.data !== storedRef.current) persist(result.data, false);
      setRecurringWarning(
        result.blocked.length
          ? `Some recurring entries are waiting for a usable conversion: ${result.blocked.map((id) => result.data.recurring?.find((r) => r.id === id)?.note || result.data.categories.find((c) => c.id === result.data.recurring?.find((r) => r.id === id)?.categoryId)?.name || "Schedule").join(", ")}`
          : "",
      );
      if (
        !ratesFresh(storedRef.current.rates) &&
        Date.now() - lastRateAttempt.current > 15 * 60_000
      )
        void refreshRates().catch(() => {
          /* The rate status is surfaced in the UI. */
        });
    };
    const kickoff = setTimeout(run, 0);
    const interval = setInterval(run, 60_000);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") run();
    });
    if (Platform.OS === "web") {
      window.addEventListener("focus", run);
      document.addEventListener("visibilitychange", run);
    }
    return () => {
      clearTimeout(kickoff);
      clearInterval(interval);
      subscription.remove();
      if (Platform.OS === "web") {
        window.removeEventListener("focus", run);
        document.removeEventListener("visibilitychange", run);
      }
    };
  }, [ready, demo, recoveryRequired, persist, refreshRates]);

  function update(fn: (d: BudgetData) => BudgetData) {
    if (recoveryRequired) return;
    const next = fn(storedRef.current);
    if (!validData(next))
      throw new Error(
        "The change contains invalid budget data. Nothing was saved.",
      );
    const result = postDue(next, todayKey());
    setRecurringWarning(
      result.blocked.length
        ? `Some recurring entries are waiting for a usable conversion: ${result.blocked.map((id) => result.data.recurring?.find((r) => r.id === id)?.note || result.data.categories.find((c) => c.id === result.data.recurring?.find((r) => r.id === id)?.categoryId)?.name || "Schedule").join(", ")}`
        : "",
    );
    persist(result.data);
  }
  const data = demo ? createDemoData(monthKey()) : stored;
  return (
    <BudgetContext.Provider
      value={{
        data,
        demo,
        ready,
        error,
        recoveryRequired,
        recurringWarning,
        month,
        setMonth,
        update,
        money: (amount) => money(data, amount),
        refreshRates,
        ratesLoading,
        ratesError,
        startFresh: () => {
          setRecoveryRequired(false);
          setRecurringWarning("");
          persist(JSON.parse(JSON.stringify(EMPTY_DATA)) as BudgetData);
        },
        viewDemo: () => {
          if (!recoveryRequired) setDemo(true);
        },
        leaveDemo: () => setDemo(false),
      }}
    >
      {children}
    </BudgetContext.Provider>
  );
}
export function useBudget() {
  const v = useContext(BudgetContext);
  if (!v) throw new Error("Missing BudgetProvider");
  return v;
}
