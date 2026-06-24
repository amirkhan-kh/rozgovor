import { useEffect, useState } from "react";
import { featurePermissionsService } from "../services/voice-exam.service";

interface FeatureState {
  role: string;
  features: Record<string, boolean>;
  loading: boolean;
}

let cached: FeatureState | null = null;
const subscribers = new Set<(s: FeatureState) => void>();

export function useFeaturePermissions(): FeatureState {
  const [state, setState] = useState<FeatureState>(
    cached || { role: "admin", features: {}, loading: true }
  );

  useEffect(() => {
    const sub = (s: FeatureState) => setState(s);
    subscribers.add(sub);

    if (!cached) {
      featurePermissionsService
        .me()
        .then((d) => {
          cached = { ...d, loading: false };
          subscribers.forEach((fn) => fn(cached!));
        })
        .catch(() => {
          cached = { role: "admin", features: {}, loading: false };
          subscribers.forEach((fn) => fn(cached!));
        });
    }
    return () => {
      subscribers.delete(sub);
    };
  }, []);

  return state;
}

export function refreshFeaturePermissions(): void {
  cached = null;
  featurePermissionsService
    .me()
    .then((d) => {
      cached = { ...d, loading: false };
      subscribers.forEach((fn) => fn(cached!));
    })
    .catch(() => {});
}
