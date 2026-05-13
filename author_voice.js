import { promises as fs } from "fs";
import path from "path";

export function isAuthorVoiceEnabled(env = process.env) {
  return env.ENABLE_AUTHOR_VOICE === "true";
}

export function getAuthorProfileId(env = process.env) {
  return String(env.AUTHOR_PROFILE_ID || "dinara").trim() || "dinara";
}

export function authorProfilePath(authorId = getAuthorProfileId()) {
  return path.join(process.cwd(), "author_profiles", authorId, "voice_profile.md");
}

export async function loadAuthorVoiceProfile(options = {}) {
  const enabled = options.enabled ?? isAuthorVoiceEnabled();
  const author = options.author || getAuthorProfileId();
  const profilePath = options.profilePath || authorProfilePath(author);

  if (!enabled) {
    return { enabled, author, profileLoaded: false, profilePath, content: "" };
  }

  try {
    const content = await fs.readFile(profilePath, "utf-8");
    return {
      enabled,
      author,
      profileLoaded: Boolean(content.trim()),
      profilePath,
      content: content.trim(),
    };
  } catch {
    return { enabled, author, profileLoaded: false, profilePath, content: "" };
  }
}

export function buildAuthorVoicePrompt(profile) {
  if (!profile?.enabled || !profile.profileLoaded || !profile.content) return "";
  return [
    "[AUTHOR VOICE PROFILE]",
    "Use this as stylistic guidance. Do not mention the profile in the answer.",
    profile.content,
  ].join("\n");
}

export function logAuthorVoiceStatus(profile) {
  console.log("[author-voice]");
  console.log(`enabled=${Boolean(profile?.enabled)}`);
  console.log(`author=${profile?.author || ""}`);
  console.log(`profile_loaded=${Boolean(profile?.profileLoaded)}`);
  console.log(`profile_path=${profile?.profilePath || ""}`);
}
