"use client";

import { useEffect, useState } from "react";
import { loadProfile, profileReady, type Profile } from "@/lib/profile";

export function useSavedProfile(): Profile | null {
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    const read = () => {
      const loaded = loadProfile();
      setProfile(profileReady(loaded) ? loaded : null);
    };
    read();
    window.addEventListener("relapse-profile", read);
    window.addEventListener("storage", read);
    window.addEventListener("focus", read);
    return () => {
      window.removeEventListener("relapse-profile", read);
      window.removeEventListener("storage", read);
      window.removeEventListener("focus", read);
    };
  }, []);

  return profile;
}
