// Deliberately bounded: no URLs, titles, filenames, prompts, or report contents.
export const JOURNEY_EVENTS = ["account_opened", "install_chrome_clicked", "install_firefox_clicked", "desktop_link_copied", "web_app_clicked", "pricing_viewed", "checkout_clicked", "checkout_returned", "report_opened", "report_exported", "feedback_helpful", "feedback_partial", "feedback_unhelpful"] as const;
export type JourneyEvent = typeof JOURNEY_EVENTS[number];
export const FAILURE_STAGES = ["permission", "reservation", "source", "frames", "transcription", "analysis", "saving"] as const;
export const FAILURE_CODES = ["permission", "source", "network", "authentication", "rate_limit", "analysis"] as const;
export type FailureStage = typeof FAILURE_STAGES[number];
export type FailureCategory = typeof FAILURE_CODES[number];
