/**
 * Ready-made copy for the three things a campaign says.
 *
 * Only two placeholders exist in the message pipeline — `{username}` (the
 * commenter's name, falling back to "there") and `{link}` (the tracked URL).
 * Nothing here invents a third: a token the renderer does not know is sent to a
 * real person verbatim, braces and all.
 *
 * Where `{link}` is allowed is not a style choice:
 *
 *   dm            yes — this is the message the tracked link exists for.
 *   openingDm     no  — it is sent before the tap, and putting the link there
 *                       defeats the button that opens the 24-hour window.
 *   publicReply   no  — it is a comment. A URL in a comment reads as spam to
 *                       both Instagram and the reader, and the whole point of
 *                       the public reply is to point at the DM instead.
 *
 * Public replies are returned as a *set*. The worker picks one at random per
 * comment, so a campaign with one reply posts the same sentence under every
 * comment on the post — which looks automated and is the fastest way to get
 * the replies filtered. Five varied lines is the difference between a thread
 * that reads like a person and one that reads like a bot.
 */

export type SuggestionIntent =
  | "link"
  | "leadMagnet"
  | "resource"
  | "course"
  | "booking"
  | "discount";

export interface OpeningDmSuggestion {
  message: string;
  buttonLabel: string;
}

export interface SuggestionSet {
  intent: SuggestionIntent;
  label: string;
  /** What this set is for, shown so the picker is choosable at a glance. */
  hint: string;
  publicReplies: string[];
  openingDms: OpeningDmSuggestion[];
  dms: string[];
}

export const SUGGESTIONS: SuggestionSet[] = [
  {
    intent: "link",
    label: "Send a link",
    hint: "They asked where to get the thing in the post.",
    publicReplies: [
      "Just sent it 📩",
      "Check your DMs {username} 👀",
      "Sent! Let me know if it doesn't land.",
      "In your inbox now 🙌",
      "Sent it over — enjoy!",
      "Just DMed you the link ✅",
    ],
    openingDms: [
      {
        message:
          "Hey {username}! Saw your comment — I've got the link ready for you. Tap below and it's yours.",
        buttonLabel: "Send me the link",
      },
      {
        message:
          "Hey {username} 👋 Thanks for commenting. Want me to send the link over?",
        buttonLabel: "Yes, send it",
      },
    ],
    dms: [
      "Here you go {username} — {link}\n\nAny questions, just reply here.",
      "That was quick 😄 Here's the link: {link}",
    ],
  },
  {
    intent: "leadMagnet",
    label: "Free guide / checklist",
    hint: "A free download in exchange for a comment.",
    publicReplies: [
      "Sent it your way 📩",
      "Check your DMs {username}!",
      "It's in your inbox 🎉",
      "Just sent — go grab it.",
      "Sent! Hope it helps 🙌",
      "On its way to you now ✅",
    ],
    openingDms: [
      {
        message:
          "Hey {username}! The free guide is ready — tap below and I'll send it straight over.",
        buttonLabel: "Send the guide",
      },
      {
        message:
          "Hi {username} 👋 Thanks for commenting! Ready for your copy?",
        buttonLabel: "Send it over",
      },
    ],
    dms: [
      "Here it is {username} 🎁\n\n{link}\n\nIf you find it useful, a reply telling me what you're working on makes my day.",
      "All yours: {link}\n\nLet me know how you get on with it.",
    ],
  },
  {
    intent: "resource",
    label: "The app / tool",
    hint: "They want the app, template, or tool from the post.",
    publicReplies: [
      "Sent 📩",
      "Check your DMs {username} 👀",
      "Just sent it over!",
      "In your inbox 🙌",
      "Sent — have a play with it.",
      "DMed you ✅",
    ],
    openingDms: [
      {
        message:
          "Hey {username}! You asked about the app — tap below and I'll send the link.",
        buttonLabel: "Send the app",
      },
      {
        message:
          "Hey {username} 👋 Want the link to try it yourself?",
        buttonLabel: "Yes please",
      },
    ],
    dms: [
      "Here you go {username} — {link}\n\nIt's free to try. Tell me what you think.",
      "{link}\n\nThat's the one from the post. Happy to answer anything about it.",
    ],
  },
  {
    intent: "course",
    label: "Course / waitlist",
    hint: "Enrolment, waitlist, or a class signup.",
    publicReplies: [
      "Sent you the details 📩",
      "Check your DMs {username}!",
      "Just sent the info over.",
      "It's in your inbox 🙌",
      "Sent — spots are limited!",
      "DMed you the link ✅",
    ],
    openingDms: [
      {
        message:
          "Hey {username}! Thanks for your interest — tap below and I'll send you everything about it.",
        buttonLabel: "Send the details",
      },
      {
        message:
          "Hi {username} 👋 Want me to send the enrolment link?",
        buttonLabel: "Send the link",
      },
    ],
    dms: [
      "Here's everything you need {username}: {link}\n\nReply here if you have any questions before you join.",
      "{link}\n\nThat's the signup. Any questions, I'm right here.",
    ],
  },
  {
    intent: "booking",
    label: "Book a call",
    hint: "A consult, session, or appointment.",
    publicReplies: [
      "Sent you the booking link 📩",
      "Check your DMs {username}!",
      "Just sent it over.",
      "In your inbox now 🙌",
      "Sent — pick any slot that suits.",
      "DMed you ✅",
    ],
    openingDms: [
      {
        message:
          "Hey {username}! Happy to find a time — tap below and I'll send the calendar.",
        buttonLabel: "See available times",
      },
      {
        message: "Hi {username} 👋 Want to grab a slot?",
        buttonLabel: "Book a time",
      },
    ],
    dms: [
      "Here's my calendar {username}: {link}\n\nPick whatever suits — no need to check with me first.",
      "{link}\n\nGrab any open slot and I'll see you there.",
    ],
  },
  {
    intent: "discount",
    label: "Discount / code",
    hint: "A code or a limited offer.",
    publicReplies: [
      "Code sent 📩",
      "Check your DMs {username} 👀",
      "Just sent your code!",
      "It's in your inbox 🎉",
      "Sent — don't sleep on it.",
      "DMed you the code ✅",
    ],
    openingDms: [
      {
        message:
          "Hey {username}! Your code is ready — tap below and it's yours.",
        buttonLabel: "Send my code",
      },
      {
        message: "Hi {username} 👋 Want the discount?",
        buttonLabel: "Yes, send it",
      },
    ],
    dms: [
      "Here you go {username} 🎉\n\n{link}\n\nThe code is applied at checkout automatically.",
      "All yours: {link}\n\nEnjoy!",
    ],
  },
];

/** Keyword and goal hints that point at an intent, longest match first. */
const HINTS: Array<[SuggestionIntent, string[]]> = [
  ["discount", ["code", "discount", "promo", "deal", "offer", "sale"]],
  ["booking", ["book", "call", "consult", "appointment", "session", "demo"]],
  ["course", ["course", "class", "waitlist", "enroll", "enrol", "workshop", "masterclass"]],
  ["leadMagnet", ["guide", "free", "pdf", "checklist", "template", "ebook", "cheatsheet"]],
  ["resource", ["app", "tool", "download", "install", "try"]],
  ["link", ["link", "shop", "buy", "product", "where", "site"]],
];

/**
 * Best-guess intent from what the campaign already knows.
 *
 * A guess, not a decision — the picker always shows every set, because the
 * keyword "app" on a course campaign should not quietly hide the course copy.
 * This only decides which set is offered first.
 */
export function inferIntent(input: {
  keywords?: string[];
  goal?: string | null;
  name?: string | null;
}): SuggestionIntent {
  const haystack = [
    ...(input.keywords ?? []),
    input.goal ?? "",
    input.name ?? "",
  ]
    .join(" ")
    .toLowerCase();

  for (const [intent, needles] of HINTS) {
    if (needles.some((n) => haystack.includes(n))) return intent;
  }
  return "link";
}

export function getSuggestionSet(intent: SuggestionIntent): SuggestionSet {
  return SUGGESTIONS.find((s) => s.intent === intent) ?? SUGGESTIONS[0];
}

/**
 * A varied slice of public replies, shuffled deterministically by `seed` so the
 * same campaign keeps the same set across re-renders instead of reshuffling
 * under the cursor on every keystroke.
 */
export function pickPublicReplies(
  intent: SuggestionIntent,
  count = 5,
  seed = 0
): string[] {
  const pool = [...getSuggestionSet(intent).publicReplies];
  // Small deterministic rotation — enough variety between campaigns, stable
  // within one.
  const offset = Math.abs(seed) % pool.length;
  const rotated = [...pool.slice(offset), ...pool.slice(0, offset)];
  return rotated.slice(0, Math.min(count, rotated.length));
}
