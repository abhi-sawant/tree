import { describe, expect, it } from "vitest"

import { BIRTH_YEAR_TOLERANCE } from "~/lib/analysis/duplicates"
import { MAX_SNAPSHOTS, MIN_AUTO_INTERVAL_MS } from "~/lib/backup/snapshots"
import { SNOOZE_DAYS, STALE_AFTER_DAYS } from "~/lib/backup/staleness"
import { MAX_ATTACHMENT_BYTES } from "~/lib/attachments"
import { ADD_RELATIVE_KEYS } from "~/lib/canvas/keyboard-navigation"
import {
  PRESUMED_LIFESPAN_YEARS,
  REDACTED_GIVEN_NAME,
} from "~/lib/export/redaction"
import {
  HELP_TOPICS,
  searchHelp,
  type HelpTopic,
} from "~/lib/help/help-content"
import {
  notesToPlainText,
  parseNotes,
  wikiLinkNames,
} from "~/lib/notes/markdown"
import { PHOTO_MAX_EDGE } from "~/lib/photos"

// Flattened the way the reader sees it: markers dropped, wrapped lines joined.
// Asserting on the raw source instead would fail on any claim that happens to
// straddle a line break, which is a fact about the source file and not about
// the manual.
function bodyOf(topic: HelpTopic): string {
  return topic.sections
    .flatMap((section) => notesToPlainText(section.body))
    .join(" ")
}

const ALL_PROSE = HELP_TOPICS.map(
  (topic) => `${topic.title} ${topic.summary} ${bodyOf(topic)}`
).join("\n")

function topic(id: string): HelpTopic {
  const found = HELP_TOPICS.find((candidate) => candidate.id === id)
  if (!found) throw new Error(`No help topic "${id}"`)
  return found
}

describe("the shape of the manual", () => {
  it("has a unique id, a summary and at least one section per topic", () => {
    const ids = HELP_TOPICS.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const t of HELP_TOPICS) {
      expect(t.title.length, t.id).toBeGreaterThan(0)
      expect(t.summary.length, t.id).toBeGreaterThan(0)
      expect(t.sections.length, t.id).toBeGreaterThan(0)
      for (const section of t.sections) {
        expect(section.heading.length, t.id).toBeGreaterThan(0)
        expect(section.body.trim().length, section.heading).toBeGreaterThan(0)
      }
    }
  })

  // The renderer closes a list on the first line that isn't a bullet, so a
  // wrapped list item becomes a list, a stray paragraph and a second list.
  // Every page is checked rather than spot-checked: this is the one mistake a
  // Markdown body can make that still looks like prose in the source.
  it("never wraps a list item across two lines", () => {
    for (const t of HELP_TOPICS) {
      for (const section of t.sections) {
        const blocks = parseNotes(section.body)
        const kinds = blocks.map((block) => block.kind)
        // A paragraph immediately after a list is how the mistake shows up: the
        // continuation line ends the list and starts a paragraph of its own.
        for (let i = 1; i < kinds.length; i++) {
          const suspicious = kinds[i - 1] === "list" && kinds[i] === "paragraph"
          expect(suspicious, `${t.id} → ${section.heading}`).toBe(false)
        }
      }
    }
  })

  // [[name]] means "a person in the pool" everywhere else in the app. The help
  // pages have no pool, so one here would render as bare text and read as a
  // link that had failed.
  it("uses no [[wiki links]]", () => {
    for (const t of HELP_TOPICS) {
      expect(wikiLinkNames(bodyOf(t)), t.id).toEqual([])
    }
  })
})

// Everything below is the actual point of holding the manual as data. Each of
// these numbers is a claim about how the app behaves, and each one is now
// unable to drift without a failing test.
describe("what the manual claims about the app", () => {
  it("lists exactly the add-relative keys the canvas binds", () => {
    const shortcuts = topic("fast-entry").sections.flatMap(
      (section) => section.shortcuts ?? []
    )
    const listed = new Set(shortcuts.map((shortcut) => shortcut.keys))
    for (const key of Object.keys(ADD_RELATIVE_KEYS)) {
      expect(listed, key).toContain(key.toUpperCase())
    }
    // And nothing claimed for a single letter the app does not bind — a
    // documented shortcut that does nothing is worse than an undocumented one.
    const singleLetters = [...listed].filter((keys) => /^[A-Z]$/.test(keys))
    expect(singleLetters.sort()).toEqual(
      Object.keys(ADD_RELATIVE_KEYS)
        .map((key) => key.toUpperCase())
        .sort()
    )
  })

  it("quotes the backup staleness thresholds correctly", () => {
    const body = bodyOf(topic("data-safety"))
    expect(body).toContain(`more than ${STALE_AFTER_DAYS} days`)
    expect(body).toContain(`for ${SNOOZE_DAYS} days`)
  })

  it("quotes the snapshot retention rules correctly", () => {
    const body = bodyOf(topic("data-safety"))
    expect(body).toContain(`up to ${MAX_SNAPSHOTS} rollback points`)
    expect(body).toContain(`${MIN_AUTO_INTERVAL_MS / 60_000} minutes apart`)
  })

  it("quotes the photo and document limits correctly", () => {
    const body = bodyOf(topic("photos-and-documents"))
    expect(body).toContain(`${PHOTO_MAX_EDGE}px on the longest edge`)
    expect(body).toContain(`${MAX_ATTACHMENT_BYTES / 1_000_000} MB a file`)
  })

  it("quotes the redaction rules correctly", () => {
    const body = bodyOf(topic("sharing"))
    expect(body).toContain(`more than ${PRESUMED_LIFESPAN_YEARS} years ago`)
    expect(body).toContain(`“${REDACTED_GIVEN_NAME}”`)
  })

  it("quotes the duplicate finder's birth-year tolerance correctly", () => {
    expect(bodyOf(topic("tidying"))).toContain(
      `more than ${BIRTH_YEAR_TOLERANCE} years apart`
    )
  })

  // The offline constraint is the reason this help exists at all, so the page
  // that explains it has to keep saying so.
  it("says why there is no sync and no account", () => {
    const body = bodyOf(topic("not-yet")).toLowerCase()
    expect(body).toContain("server")
    expect(body).toContain("offline")
  })

  it("warns that browser storage can be cleared", () => {
    expect(ALL_PROSE.toLowerCase()).toContain("clear")
    expect(bodyOf(topic("data-safety")).toLowerCase()).toContain("backup")
  })
})

describe("searchHelp", () => {
  it("returns every topic, whole, for an empty query", () => {
    const results = searchHelp("   ")
    expect(results).toHaveLength(HELP_TOPICS.length)
    expect(results.every((result) => result.sections.length === 0)).toBe(true)
  })

  it("offers a topic whole when its title matches", () => {
    const results = searchHelp("relationships")
    expect(results[0].topic.id).toBe("relationships")
    expect(results[0].sections).toEqual([])
  })

  it("ranks a title match above a passing mention", () => {
    const results = searchHelp("photos")
    expect(results[0].topic.id).toBe("photos-and-documents")
    expect(results.length).toBeGreaterThan(1)
  })

  it("narrows to the sections that matched", () => {
    const results = searchHelp("triplets")
    const hit = results.find((result) => result.topic.id === "relationships")
    expect(hit?.sections.map((section) => section.heading)).toEqual(["Twins"])
  })

  // A summary match offers the topic whole, the same as a title match: the
  // summary is a description of the whole topic, so narrowing to the one
  // section that happens to repeat the word would answer a smaller question
  // than the one asked.
  it("offers a topic whole when its summary matches", () => {
    const hit = searchHelp("twins").find(
      (result) => result.topic.id === "relationships"
    )
    expect(hit?.sections).toEqual([])
  })

  it("requires every term, and searches shortcut text", () => {
    expect(searchHelp("zzzznotaword")).toEqual([])
    expect(searchHelp("gedcom zzzznotaword")).toEqual([])

    const hit = searchHelp("add a spouse").find(
      (result) => result.topic.id === "fast-entry"
    )
    expect(hit).toBeDefined()
  })

  it("falls back to the whole topic when the terms are spread across sections", () => {
    // "triplets" is only in the Twins section and "guardian" only in the
    // subtypes one, so no single section holds both — but the topic does, and
    // answering with nothing would be worse than answering with the page.
    const hit = searchHelp("triplets guardian").find(
      (result) => result.topic.id === "relationships"
    )
    expect(hit?.sections.length).toBe(topic("relationships").sections.length)
  })

  it("searches only the topics it is given", () => {
    expect(searchHelp("triplets", [topic("data-safety")])).toEqual([])
  })
})
