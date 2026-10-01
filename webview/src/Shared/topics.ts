import { SolclientFactory } from "solclientjs";

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Returns an error message when the topic is not valid for a subscription or publish,
 * using the same validation as solclientjs.
 */
export function validateTopic(topic: string): string | null {
  if (!topic.trim()) return "Topic is empty.";
  if (topic !== topic.trim()) return "Topic has leading or trailing whitespace.";
  try {
    SolclientFactory.createTopicDestination(topic);
    return null;
  } catch (error) {
    return (error as Error)?.message || "Invalid topic.";
  }
}

/**
 * Compiles a Solace topic subscription into an anchored RegExp:
 * - `*` as a whole level matches exactly one level
 * - `prefix*` at the end of a level matches any level starting with prefix
 * - `>` as the last level matches one or more levels
 * - everything else, including `*` in the middle of a level and `>` elsewhere, is literal.
 */
export function solaceTopicToRegExp(pattern: string): RegExp {
  const levels = pattern.split("/");
  const last = levels.length - 1;
  const parts: string[] = [];
  levels.forEach((level, index) => {
    if (index === last && level === ">") {
      parts.push(index === 0 ? ".+" : "\\/.+");
      return;
    }
    let part: string;
    if (level === "*") {
      part = "[^/]+";
    } else if (level.endsWith("*")) {
      part = escapeRegExp(level.slice(0, -1)) + "[^/]*";
    } else {
      part = escapeRegExp(level);
    }
    parts.push(index === 0 ? part : "\\/" + part);
  });
  return new RegExp(`^${parts.join("")}$`);
}

export function topicMatches(pattern: string, topic: string) {
  return solaceTopicToRegExp(pattern).test(topic);
}
