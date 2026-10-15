// The master SEO/conversion process. This is the actual playbook: every
// phase, every step, and the how-to for each one. Edit this file to change
// what new clients get; it only affects clients created after the edit,
// since each client's progress is a snapshot of step IDs at creation time
// (see admin.js createClient), not a live reference back to this file.
//
// `track` on a phase controls which client types get it:
//   'shared'  -> every client, regardless of track
//   'local'   -> only clients whose trackType is 'local' or 'hybrid'
//   'digital' -> only clients whose trackType is 'digital' or 'hybrid'

export const CHECKLIST_PHASES = [
  {
    id: "audit",
    title: "Audit & Discovery",
    track: "shared",
    steps: [
      {
        id: "technical-crawl",
        title: "Technical site crawl",
        howTo: "Run the site through a crawler (Screaming Frog or Google's PageSpeed Insights + Mobile-Friendly Test). Check page load speed, mobile rendering, broken links/404s, SSL, whether robots.txt and sitemap.xml exist and are correct, and whether pages are actually indexable (no accidental noindex tags).",
      },
      {
        id: "analytics-baseline",
        title: "Current analytics review",
        howTo: "Check whether GA4 and Search Console are already installed. If so, pull the last 3-6 months of traffic sources, top landing pages, and bounce/exit rates. If not, note that as a finding; it gets fixed in Foundation & Tracking, not here.",
      },
      {
        id: "keyword-landscape",
        title: "Keyword & competitor scan",
        howTo: "Identify 10-15 keywords the business should realistically rank for, then check who currently ranks for them. Note which competitors show up repeatedly; they become the benchmark for later content and backlink work.",
      },
      {
        id: "content-cta-audit",
        title: "Website content & CTA audit",
        howTo: "Go page by page. For each one, answer: what is this page trying to get the visitor to do, and is that one thing obvious within 5 seconds? Flag pages with no clear next step, buried contact info, or competing CTAs.",
      },
      {
        id: "social-audit",
        title: "Social media presence audit",
        howTo: "Check every platform the business claims (Google, Facebook, Instagram, etc.): is the profile verified/claimed, is contact info consistent with the website, is there a clear link or CTA in the bio, and how recent is the last post. Note dead or abandoned profiles; those may need fixing, merging, or explicitly deprioritizing.",
      },
    ],
  },
  {
    id: "foundation",
    title: "Foundation & Tracking",
    track: "shared",
    steps: [
      {
        id: "ga4-setup",
        title: "Install Google Analytics 4 with real conversions",
        howTo: "Install GA4 if it's missing, then configure conversion events for what actually matters: phone clicks, form submissions, and bookings, not just pageviews. Verify each event fires correctly in GA4's DebugView before calling it done.",
      },
      {
        id: "gsc-setup",
        title: "Set up Google Search Console",
        howTo: "Verify domain ownership, submit the sitemap, and review the Coverage report for indexing errors. Fix or explain every error before moving on; a page that isn't indexed can't rank no matter what else gets fixed.",
      },
      {
        id: "call-tracking",
        title: "Set up call tracking if applicable",
        howTo: "If phone calls are a meaningful conversion path, install a call-tracking number (e.g. CallRail, or Google's own call reporting in Business Profile) so calls show up in analytics instead of disappearing into a black box.",
      },
      {
        id: "define-goals",
        title: "Define conversion goals in writing",
        howTo: "Get explicit agreement with the client on what counts as a win, a form fill, a call, a booking, a purchase, so progress can be measured against something real instead of vague \"more traffic.\"",
      },
    ],
  },
  {
    id: "local",
    title: "Local Visibility",
    track: "local",
    steps: [
      {
        id: "gbp-claim",
        title: "Claim/verify Google Business Profile",
        howTo: "Confirm ownership via Google's verification process (postcard, phone, or instant verification if eligible). If a profile already exists but is unclaimed or managed by someone else, request access or start a reinstatement.",
      },
      {
        id: "gbp-complete",
        title: "Complete every Business Profile field",
        howTo: "Fill in every available field: primary and secondary categories, services, service area, hours (including holiday hours), attributes, and a full business description. Incomplete profiles rank behind complete ones, all else equal.",
      },
      {
        id: "gbp-photos",
        title: "Upload real photos",
        howTo: "Add real exterior, interior, team, and work-sample photos, at least 10 to start. Stock photos hurt more than they help; Google and customers can both tell.",
      },
      {
        id: "nap-audit",
        title: "Audit NAP consistency across directories",
        howTo: "Check name, address, and phone number on the top directories for the industry (Yelp, Bing Places, Apple Maps, Facebook, and any industry-specific ones). Flag every mismatch; inconsistent NAP data actively hurts local rankings.",
      },
      {
        id: "citations-fix",
        title: "Fix or create missing local citations",
        howTo: "Correct the mismatches found in the NAP audit, and create listings on any major directory where the business is missing entirely.",
      },
      {
        id: "local-schema",
        title: "Add LocalBusiness schema markup",
        howTo: "Add JSON-LD LocalBusiness (or a more specific subtype, e.g. ProfessionalService) structured data to the site, with accurate NAP, hours, and geo data that matches exactly what's on the Business Profile.",
      },
      {
        id: "location-pages",
        title: "Build or improve location/service-area pages",
        howTo: "For each distinct service area or location served, make sure there's a real page (not just a mention) naming that area specifically, with unique content, not a copy-pasted template with the city name swapped.",
      },
      {
        id: "review-strategy",
        title: "Set up a review-generation workflow",
        howTo: "Define exactly how and when the business will ask for reviews, respecting the client's industry rules (e.g. healthcare generally can't solicit reviews directly; retail and most service businesses can ask outright). Give the client a repeatable, low-friction way to ask: a link, a QR code, a follow-up text or email.",
      },
      {
        id: "review-response",
        title: "Respond to existing reviews",
        howTo: "Reply to every review, good and bad, going back as far as reasonable. A thoughtful response to a bad review often matters more to prospective customers than the review itself.",
      },
    ],
  },
  {
    id: "digital",
    title: "Digital Reach",
    track: "digital",
    steps: [
      {
        id: "keyword-clusters",
        title: "Define keyword clusters by intent",
        howTo: "Group target keywords by buyer intent (research vs. ready-to-buy) rather than by geography. Prioritize clusters with real search volume and a realistic shot at ranking given the site's current authority.",
      },
      {
        id: "content-gap",
        title: "Content gap analysis",
        howTo: "Compare the site's existing content against what's ranking for the target clusters. Identify topics competitors cover that this site doesn't, and outdated or thin pages that need a real rewrite.",
      },
      {
        id: "core-pages",
        title: "Build/optimize core conversion pages",
        howTo: "Make sure every priority keyword cluster has one clear, well-optimized page to send traffic to, not a scattershot of thin blog posts competing with each other.",
      },
      {
        id: "digital-schema",
        title: "Add relevant schema markup",
        howTo: "Add structured data appropriate to the business type, Organization, Product, Service, or FAQ schema as applicable, so search engines (and AI answer engines) can understand and surface the content correctly.",
      },
      {
        id: "backlink-plan",
        title: "Build a backlink/authority plan",
        howTo: "Identify realistic link opportunities: relevant directories, industry partnerships, guest content, and digital PR angles. Prioritize relevance and real referral traffic over raw link count.",
      },
      {
        id: "lead-magnet",
        title: "Lead-magnet or email-capture strategy",
        howTo: "For visitors not ready to convert immediately, offer something worth an email address (a guide, a checklist, a discount) so the business can follow up instead of losing that traffic for good.",
      },
    ],
  },
  {
    id: "conversion",
    title: "Conversion Optimization",
    track: "shared",
    steps: [
      {
        id: "cta-rewrite",
        title: "Rewrite primary CTAs",
        howTo: "Based on the audit findings, rewrite and reposition CTAs so every key page has exactly one obvious next step, worded as an action, not \"Learn More\" on everything.",
      },
      {
        id: "form-cleanup",
        title: "Clean up contact/lead forms",
        howTo: "Strip forms down to only the fields actually needed to follow up. Every extra required field measurably reduces completion rate.",
      },
      {
        id: "click-to-contact",
        title: "Add click-to-call / click-to-text",
        howTo: "Make sure phone numbers are tap-to-call links on mobile, and add click-to-text where the business can realistically respond to texts.",
      },
      {
        id: "social-cta-alignment",
        title: "Align social bio/pinned post CTAs with the site",
        howTo: "Make sure every platform's bio link and pinned content point to the same converting page the rest of this plan is built around, not just the homepage by default.",
      },
      {
        id: "mobile-conversion-check",
        title: "Test the mobile conversion path",
        howTo: "On an actual phone, time how many taps it takes to go from landing on the site to completing the main conversion action. If it's more than 3-4 taps, something needs to be cut.",
      },
    ],
  },
  {
    id: "reporting",
    title: "Reporting & Handoff",
    track: "shared",
    steps: [
      {
        id: "dashboard-build",
        title: "Build the client's reporting dashboard",
        howTo: "Pull GA4, Search Console, and (if local) Business Profile insights into one view the client can actually understand: trend lines for traffic AND conversions, not just a raw numbers dump.",
      },
      {
        id: "first-report",
        title: "Deliver the first monthly report",
        howTo: "Walk the client through the dashboard in plain language: what changed, why, and what it means for their business, not just a screenshot of charts.",
      },
      {
        id: "review-and-adjust",
        title: "Review results and adjust priorities",
        howTo: "Sit down with the client, confirm what's working, and reprioritize the next cycle's work based on real data instead of assumptions.",
      },
    ],
  },
];

// Phases that apply to a given track, in display order.
export function phasesForTrack(trackType) {
  return CHECKLIST_PHASES.filter((p) => {
    if (p.track === "shared") return true;
    if (trackType === "hybrid") return true;
    return p.track === trackType;
  });
}

// Flat list of every step for a track, each tagged with its phase.
export function stepsForTrack(trackType) {
  return phasesForTrack(trackType).flatMap((phase) =>
    phase.steps.map((step) => ({ ...step, phaseId: phase.id, phaseTitle: phase.title }))
  );
}

export const TRACK_LABELS = {
  local: "Local traffic",
  digital: "Digital only",
  hybrid: "Local + digital",
};
