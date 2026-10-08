import { createContext, useContext, type ReactNode } from "react";
import { useAsyncData } from "@/hooks/useAsyncData";
import * as profileApi from "@/services/api/profileApi";
import type { Profile } from "@/types";

type ProfileQuery = ReturnType<typeof useAsyncData<Profile>>;

const ProfileContext = createContext<ProfileQuery | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const profile = useAsyncData(() => profileApi.getProfile());
  return <ProfileContext.Provider value={profile}>{children}</ProfileContext.Provider>;
}

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) {
    throw new Error("useProfile must be used inside ProfileProvider");
  }
  return ctx;
}
